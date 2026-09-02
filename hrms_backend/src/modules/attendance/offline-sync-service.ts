import type {
  AttendanceLocationEvidenceRequest,
  AuthUser,
  UUID,
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { resolveActiveCompanyMembershipContext } from "../../platform/company-membership-context.js";
import { badRequest, conflict } from "../../platform/errors.js";
import {
  buildProvisionalRecordedEvent,
} from "./events.js";
import {
  attendanceOfflineSyncResponseSchema,
  attendanceOfflineSyncResultSchema,
  canonicalOfflineAttendanceEventHash,
  canonicalOfflineAttendanceEventProjection,
  ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
  type AttendanceOfflineBatchRequest,
  type AttendanceOfflineEventEnvelope,
  type AttendanceOfflineSyncResult,
  type AttendanceOfflineSyncResponse,
} from "./offline-sync-contract.js";
import { assertCanUseSelfAttendance } from "./policy.js";
import {
  resolveCoordinateRetention,
  type EffectiveAttendancePolicy,
} from "./policy-config.js";
import { resolveEffectiveAttendancePolicy } from "./policy-resolver.js";
import {
  PostgresAttendanceCommandRepository,
  type AttendanceCommandTransactionRepository,
  type AttendanceOfflineInboxRecord,
  type OfflineSyncSecuritySignalType,
} from "./command-repository.js";
import {
  recordAttendanceDuplicateEvent,
  recordAttendanceLocationAccuracy,
  type AttendanceDuplicateEventObservation,
} from "./observability.js";

type IndexedOfflineEvent = {
  index: number;
  event: AttendanceOfflineEventEnvelope;
  eventHash: string;
  eventPayload: ReturnType<typeof canonicalOfflineAttendanceEventProjection>;
};

export const OFFLINE_LOCATION_EVIDENCE_MAX_AGE_MS = 2_147_483_647;

export class AttendanceOfflineSyncService {
  constructor(private readonly store: MemoryDataStore) {}

  async syncBatch(
    actor: AuthUser,
    input: AttendanceOfflineBatchRequest,
  ): Promise<AttendanceOfflineSyncResponse> {
    assertCanUseSelfAttendance(actor);
    const context = resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      operation: "attendance.offline_sync",
      requireActiveEmployment: true,
    });
    const registeredDeviceId = input.device.registered_device_id;
    if (!registeredDeviceId) {
      throw badRequest("registered_device_id is required for offline attendance sync.", {
        reason_code: "mobile_registered_device_required",
        source_channel: "mobile_offline",
      });
    }
    const pool = this.store.pgPool;
    if (!pool) {
      throw conflict("Offline attendance sync requires PostgreSQL persistence.", {
        reason_code: "offline_sync.processing_deferred",
      });
    }

    const repository = new PostgresAttendanceCommandRepository(pool);
    const response = await repository.transaction(async (tx) => {
      await tx.lockOfflineClientEventIds({
        companyId: context.companyId,
        actorUserId: context.userId,
        clientEventIds: input.events.map((event) => event.client_event_id),
      });
      const device = await tx.lockRegisteredDeviceForOfflineSync({
        companyId: context.companyId,
        registeredDeviceId,
      });
      if (!device || device.user_id !== context.userId) {
        throw conflict("Registered mobile device is not active for attendance.", {
          reason_code: "mobile_registered_device_unavailable",
          source_channel: "mobile_offline",
        });
      }
      if (device.status !== "registered") {
        throw conflict("Registered mobile device is not active for attendance.", {
          reason_code:
            device.status === "suspended"
              ? "mobile_registered_device_suspended"
              : "mobile_registered_device_revoked",
          source_channel: "mobile_offline",
          registered_device_id: registeredDeviceId,
        });
      }

      const serverReceivedAt = await tx.getTransactionTimestamp();
      const deviceSnapshot = {
        registered_device_id: registeredDeviceId,
        device_id: input.device.device_id ?? null,
        platform: input.device.platform ?? null,
        app_version: input.device.app_version ?? null,
        os_version: input.device.os_version ?? null,
      };
      const indexedEvents = input.events.map((event, index): IndexedOfflineEvent => ({
        index,
        event,
        eventHash: canonicalOfflineAttendanceEventHash(event),
        eventPayload: canonicalOfflineAttendanceEventProjection(event),
      }));
      const sortedEvents = [...indexedEvents].sort((left, right) =>
        left.event.sequence === right.event.sequence
          ? left.event.client_event_id.localeCompare(right.event.client_event_id)
          : left.event.sequence - right.event.sequence,
      );
      const results: AttendanceOfflineSyncResult[] = new Array(input.events.length);
      let sequenceCursor = Number(device.offline_sequence_cursor);
      let expectedNextSequence = sequenceCursor + 1;

      const policy = await resolveEffectiveAttendancePolicy(tx, {
        companyId: context.companyId,
        subjectEmployeeUserId: context.userId,
        asOf: serverReceivedAt,
      });

      for (const indexed of sortedEvents) {
        const result = await this.processEvent(tx, {
          actor,
          companyId: context.companyId,
          employeeUserId: context.userId,
          batchId: input.batch_id,
          registeredDeviceId,
          deviceSnapshot,
          serverReceivedAt,
          expectedNextSequence,
          indexed,
          policy,
        });
        results[indexed.index] = result.result;
        if (result.cursorAdvanceEligible) {
          sequenceCursor = await advanceContiguousSequenceCursor(tx, {
            companyId: context.companyId,
            actorUserId: context.userId,
            registeredDeviceId,
            sequenceCursor,
          });
          expectedNextSequence = sequenceCursor + 1;
        }
      }

      return attendanceOfflineSyncResponseSchema.parse({
        contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
        batch_id: input.batch_id,
        server_received_at: serverReceivedAt,
        results,
      });
    });
    for (const [index, result] of response.results.entries()) {
      const duplicateObservation = offlineDuplicateObservation(result);
      if (duplicateObservation) {
        recordAttendanceDuplicateEvent(duplicateObservation);
      }
      const event = input.events[index];
      if (
        result.sync_status === "accepted" &&
        event?.location &&
        hasCoordinateEvidence(event.location)
      ) {
        recordAttendanceLocationAccuracy({
          sourceChannel: "mobile_offline",
          accuracyMeters: event.location.accuracy_meters,
        });
      }
    }
    return response;
  }

  private async processEvent(
    tx: AttendanceCommandTransactionRepository,
    input: {
      actor: AuthUser;
      companyId: UUID;
      employeeUserId: UUID;
      batchId: UUID;
      registeredDeviceId: UUID;
      deviceSnapshot: Record<string, unknown>;
      serverReceivedAt: string;
      expectedNextSequence: number;
      indexed: IndexedOfflineEvent;
      policy: EffectiveAttendancePolicy;
    },
  ): Promise<{
    result: AttendanceOfflineSyncResult;
    sequenceStored: boolean;
    cursorAdvanceEligible: boolean;
  }> {
    const { event, eventHash, eventPayload } = input.indexed;
    const existing = await tx.findOfflineInboxByClientEventId({
      companyId: input.companyId,
      actorUserId: input.actor.id,
      clientEventId: event.client_event_id,
    });
    if (existing) {
      if (existing.event_hash === eventHash) {
        return {
          result: replayResult(existing),
          sequenceStored: false,
          cursorAdvanceEligible: false,
        };
      }
      await auditOfflineSyncSignal(tx, {
        companyId: input.companyId,
        actorUserId: input.actor.id,
        registeredDeviceId: input.registeredDeviceId,
        clientEventId: event.client_event_id,
        observedSequence: event.sequence,
        expectedSequence: input.expectedNextSequence,
        signalType: "changed_body_conflict",
        observedEventHash: eventHash,
        existingEventHash: existing.event_hash,
      });
      return {
        result: conflictResult(event, input.serverReceivedAt),
        sequenceStored: false,
        cursorAdvanceEligible: false,
      };
    }

    const sequenceOwner = await tx.findOfflineInboxByDeviceSequence({
      companyId: input.companyId,
      actorUserId: input.actor.id,
      registeredDeviceId: input.registeredDeviceId,
      sequence: event.sequence,
    });
    if (sequenceOwner && sequenceOwner.client_event_id !== event.client_event_id) {
      await auditOfflineSyncSignal(tx, {
        companyId: input.companyId,
        actorUserId: input.actor.id,
        registeredDeviceId: input.registeredDeviceId,
        clientEventId: event.client_event_id,
        observedSequence: event.sequence,
        expectedSequence: input.expectedNextSequence,
        signalType: "duplicate_sequence",
        conflictingClientEventId: sequenceOwner.client_event_id,
        observedEventHash: eventHash,
        existingEventHash: sequenceOwner.event_hash,
      });
      return {
        result: duplicateSequenceResult(event, input.serverReceivedAt),
        sequenceStored: false,
        cursorAdvanceEligible: false,
      };
    }

    const sequenceReason =
      event.sequence > input.expectedNextSequence
        ? "offline_sync.sequence_gap"
        : event.sequence < input.expectedNextSequence
          ? "offline_sync.sequence_out_of_order"
          : null;
    if (sequenceReason) {
      await auditOfflineSyncSignal(tx, {
        companyId: input.companyId,
        actorUserId: input.actor.id,
        registeredDeviceId: input.registeredDeviceId,
        clientEventId: event.client_event_id,
        observedSequence: event.sequence,
        expectedSequence: input.expectedNextSequence,
        signalType: signalTypeForSequenceReason(sequenceReason),
        observedEventHash: eventHash,
      });
    }
    const unsupportedLocationAge = event.location
      ? evaluatedLocationEvidenceAgeMs(event.location, input.serverReceivedAt) >
        OFFLINE_LOCATION_EVIDENCE_MAX_AGE_MS
      : false;
    const evidenceReason = unsupportedLocationAge
      ? "offline_sync.validation_failed"
      : sequenceReason ?? evidenceReasonCode(event);
    const result = attendanceOfflineSyncResultSchema.parse({
      client_event_id: event.client_event_id,
      sequence: event.sequence,
      sync_status: unsupportedLocationAge
        ? "rejected"
        : sequenceReason
          ? "deferred"
          : "accepted",
      verification_status: unsupportedLocationAge
        ? "rejected"
        : sequenceReason
          ? "review_required"
          : evidenceReason === "offline_sync.review_required"
            ? "review_required"
            : "unverified",
      replayed: false,
      reason_code: evidenceReason,
      server_received_at: input.serverReceivedAt,
      processed_at: unsupportedLocationAge ? input.serverReceivedAt : null,
      payroll_eligible: false,
    });

    const inbox = await tx.createOfflineInboxEvent({
      companyId: input.companyId,
      actorUserId: input.actor.id,
      employeeUserId: input.employeeUserId,
      batchId: input.batchId,
      registeredDeviceId: input.registeredDeviceId,
      deviceSnapshot: input.deviceSnapshot,
      clientEventId: event.client_event_id,
      sequence: event.sequence,
      eventHash,
      eventPayload,
      syncStatus: result.sync_status,
      verificationStatus: result.verification_status,
      reasonCode: result.reason_code ?? null,
      serverReceivedAt: input.serverReceivedAt,
      processedAt: result.processed_at ?? null,
      responseSnapshot: result,
    });
    if (!inbox) {
      const stored = await tx.findOfflineInboxByClientEventId({
        companyId: input.companyId,
        actorUserId: input.actor.id,
        clientEventId: event.client_event_id,
      });
      if (stored && stored.event_hash === eventHash) {
        return {
          result: replayResult(stored),
          sequenceStored: false,
          cursorAdvanceEligible: false,
        };
      }
      if (!sequenceReason) {
        await auditOfflineSyncSignal(tx, {
          companyId: input.companyId,
          actorUserId: input.actor.id,
          registeredDeviceId: input.registeredDeviceId,
          clientEventId: event.client_event_id,
          observedSequence: event.sequence,
          expectedSequence: input.expectedNextSequence,
          signalType: stored ? "changed_body_conflict" : "duplicate_sequence",
          observedEventHash: eventHash,
          existingEventHash: stored?.event_hash ?? null,
        });
      }
      return {
        result: stored ? conflictResult(event, input.serverReceivedAt) : duplicateSequenceResult(event, input.serverReceivedAt),
        sequenceStored: false,
        cursorAdvanceEligible: false,
      };
    }

    if (result.sync_status === "rejected") {
      return {
        result,
        sequenceStored: true,
        cursorAdvanceEligible: sequenceReason === null,
      };
    }

    const attendanceEvent = await tx.createAttendanceEvidenceEvent({
      companyId: input.companyId,
      employeeUserId: input.employeeUserId,
      actorUserId: input.actor.id,
      commandExecutionId: null,
      eventType: event.event_type,
      source: "mobile_offline",
      occurredAt: event.captured_at,
      receivedAt: input.serverReceivedAt,
      payload: {
        schema_version: 1,
        contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
        batch_id: input.batchId,
        client_event_id: event.client_event_id,
        sequence: event.sequence,
        command_kind: event.command_kind,
        source_channel: event.source,
        event_type: event.event_type,
        work_mode: event.work_mode,
        metadata: event.metadata,
        registered_device_id: input.registeredDeviceId,
        location_evidence_supplied: Boolean(event.location),
      },
      payloadHash: eventHash,
    });
    await tx.attachAttendanceEventToOfflineInbox({
      offlineInboxId: inbox.id,
      companyId: input.companyId,
      attendanceEventId: attendanceEvent.id,
    });

    if (event.location) {
      await persistOfflineLocationEvidence(tx, {
        companyId: input.companyId,
        employeeUserId: input.employeeUserId,
        attendanceEventId: attendanceEvent.id,
        serverReceivedAt: input.serverReceivedAt,
        location: event.location,
        policy: input.policy,
      });
    }

    if (result.sync_status === "accepted") {
      await tx.insertOutboxEvent(buildProvisionalRecordedEvent({
        companyId: input.companyId,
        actorUserId: input.actor.id,
        subjectEmployeeUserId: input.employeeUserId,
        attendanceEventId: attendanceEvent.id,
        commandId: null,
        sourceChannel: "mobile_offline",
        verificationStatus: result.verification_status,
        provisionalReasonCode: result.reason_code ?? "offline_sync.accepted_unverified",
        capturedAt: event.captured_at,
        receivedAt: input.serverReceivedAt,
      }));
    }

    return {
      result,
      sequenceStored: true,
      cursorAdvanceEligible: sequenceReason === null,
    };
  }
}

async function advanceContiguousSequenceCursor(
  tx: AttendanceCommandTransactionRepository,
  input: {
    companyId: UUID;
    actorUserId: UUID;
    registeredDeviceId: UUID;
    sequenceCursor: number;
  },
): Promise<number> {
  let contiguousCursor = input.sequenceCursor;
  const storedSequences = await tx.findOfflineDeviceSequencesAfter({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    registeredDeviceId: input.registeredDeviceId,
    sequence: input.sequenceCursor,
  });
  for (const sequence of storedSequences) {
    if (sequence === contiguousCursor + 1) {
      contiguousCursor = sequence;
      continue;
    }
    if (sequence > contiguousCursor + 1) break;
  }
  if (contiguousCursor > input.sequenceCursor) {
    await tx.updateOfflineSequenceCursor({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      registeredDeviceId: input.registeredDeviceId,
      sequenceCursor: contiguousCursor,
    });
  }
  return contiguousCursor;
}

async function auditOfflineSyncSignal(
  tx: AttendanceCommandTransactionRepository,
  input: {
    companyId: UUID;
    actorUserId: UUID;
    registeredDeviceId: UUID;
    clientEventId: UUID;
    observedSequence: number;
    expectedSequence: number;
    signalType: OfflineSyncSecuritySignalType;
    conflictingClientEventId?: UUID | null;
    observedEventHash?: string | null;
    existingEventHash?: string | null;
  },
): Promise<void> {
  await tx.createOfflineSyncSecurityAudit({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    registeredDeviceId: input.registeredDeviceId,
    clientEventId: input.clientEventId,
    observedSequence: input.observedSequence,
    expectedSequence: input.expectedSequence,
    signalType: input.signalType,
    conflictingClientEventId: input.conflictingClientEventId ?? null,
    observedEventHash: input.observedEventHash ?? null,
    existingEventHash: input.existingEventHash ?? null,
  });
}

function signalTypeForSequenceReason(
  reason: "offline_sync.sequence_gap" | "offline_sync.sequence_out_of_order",
): OfflineSyncSecuritySignalType {
  return reason === "offline_sync.sequence_gap"
    ? "sequence_gap"
    : "sequence_out_of_order";
}

function evidenceReasonCode(
  event: AttendanceOfflineEventEnvelope,
): "offline_sync.accepted_unverified" | "offline_sync.review_required" {
  if (!event.location) return "offline_sync.review_required";
  if (
    event.location.permission_state === "denied" ||
    event.location.permission_state === "unavailable"
  ) {
    return "offline_sync.review_required";
  }
  return "offline_sync.accepted_unverified";
}

function replayResult(record: AttendanceOfflineInboxRecord): AttendanceOfflineSyncResult {
  const stored = attendanceOfflineSyncResultSchema.parse(record.response_snapshot);
  return attendanceOfflineSyncResultSchema.parse({
    ...stored,
    sync_status: "replayed",
    replayed: true,
    reason_code: "offline_sync.replayed",
  });
}

function conflictResult(
  event: AttendanceOfflineEventEnvelope,
  serverReceivedAt: string,
): AttendanceOfflineSyncResult {
  return attendanceOfflineSyncResultSchema.parse({
    client_event_id: event.client_event_id,
    sequence: event.sequence,
    sync_status: "conflict",
    verification_status: "rejected",
    replayed: false,
    reason_code: "offline_sync.changed_body_conflict",
    server_received_at: serverReceivedAt,
    processed_at: serverReceivedAt,
    payroll_eligible: false,
  });
}

function duplicateSequenceResult(
  event: AttendanceOfflineEventEnvelope,
  serverReceivedAt: string,
): AttendanceOfflineSyncResult {
  return attendanceOfflineSyncResultSchema.parse({
    client_event_id: event.client_event_id,
    sequence: event.sequence,
    sync_status: "rejected",
    verification_status: "rejected",
    replayed: false,
    reason_code: "offline_sync.duplicate_sequence",
    server_received_at: serverReceivedAt,
    processed_at: serverReceivedAt,
    payroll_eligible: false,
  });
}

function offlineDuplicateObservation(
  result: AttendanceOfflineSyncResult,
): AttendanceDuplicateEventObservation | null {
  switch (result.reason_code) {
    case "offline_sync.replayed":
      return {
        duplicateKind: "offline_client_event_replay",
        sourceChannel: "mobile_offline",
        reasonCode: result.reason_code,
      };
    case "offline_sync.changed_body_conflict":
      return {
        duplicateKind: "offline_changed_body_conflict",
        sourceChannel: "mobile_offline",
        reasonCode: result.reason_code,
      };
    case "offline_sync.duplicate_sequence":
      return {
        duplicateKind: "offline_duplicate_sequence",
        sourceChannel: "mobile_offline",
        reasonCode: result.reason_code,
      };
    case "offline_sync.sequence_gap":
      return {
        duplicateKind: "offline_sequence_gap",
        sourceChannel: "mobile_offline",
        reasonCode: result.reason_code,
      };
    case "offline_sync.sequence_out_of_order":
      return {
        duplicateKind: "offline_sequence_out_of_order",
        sourceChannel: "mobile_offline",
        reasonCode: result.reason_code,
      };
    default:
      return null;
  }
}

async function persistOfflineLocationEvidence(
  tx: AttendanceCommandTransactionRepository,
  input: {
    companyId: UUID;
    employeeUserId: UUID;
    attendanceEventId: UUID;
    serverReceivedAt: string;
    location: AttendanceLocationEvidenceRequest;
    policy: EffectiveAttendancePolicy;
  },
): Promise<void> {
  const evaluatedAgeMs = evaluatedLocationEvidenceAgeMs(
    input.location,
    input.serverReceivedAt,
  );
  const coordinateRetention = hasCoordinateEvidence(input.location)
    ? resolveCoordinateRetention(input.policy)
    : null;
  await tx.createAttendanceLocationEvidence({
    attendanceEventId: input.attendanceEventId,
    companyId: input.companyId,
    employeeUserId: input.employeeUserId,
    capturedAt: input.location.captured_at ?? input.serverReceivedAt,
    receivedAt: input.serverReceivedAt,
    location: input.location,
    ageMs: evaluatedAgeMs,
    coordinatesExpireAt: coordinateRetention
      ? new Date(Date.parse(input.serverReceivedAt) + coordinateRetention.retentionSeconds * 1000).toISOString()
      : null,
    coordinateRetentionClass: coordinateRetention?.retentionClass ?? null,
    coordinateRetentionSeconds: coordinateRetention?.retentionSeconds ?? null,
    retentionPolicyVersionId: coordinateRetention
      ? input.policy.policyVersionId
      : null,
    rawPayload: {
      schema_version: 1,
      source_channel: "mobile_offline",
      provider: input.location.provider ?? null,
      permission_state: input.location.permission_state,
      client_age_ms: input.location.age_ms ?? null,
      evaluated_age_ms: evaluatedAgeMs,
    },
  });
}

function evaluatedLocationEvidenceAgeMs(
  location: AttendanceLocationEvidenceRequest,
  serverReceivedAt: string,
): number {
  return Math.max(
    0,
    Date.parse(serverReceivedAt) -
      Date.parse(location.captured_at ?? serverReceivedAt),
  );
}

function hasCoordinateEvidence(
  location: AttendanceLocationEvidenceRequest,
): location is AttendanceLocationEvidenceRequest & {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
} {
  return (
    "latitude" in location &&
    "longitude" in location &&
    "accuracy_meters" in location
  );
}
