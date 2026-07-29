import { createHash } from "node:crypto";
import type {
  AttendanceDayRecord,
  AttendanceLocationEvidenceInput,
  AttendancePunchEventType,
  AuthUser,
  UUID,
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { badRequest, conflict } from "../../platform/errors.js";
import {
  AttendanceApprovalKinds,
  AttendanceDayClassifications,
  AttendancePunchEventTypes,
} from "#shared";
import { isWorkingDate } from "../../platform/work-schedule.js";
import {
  PostgresAttendanceCommandRepository,
  ATTENDANCE_GEO_EVALUATOR_VERSION,
  type AttendanceCommandTransactionRepository,
  type AttendanceCommandDecisionReasonCode,
  type PlatformIdempotencyKeyRecord,
  type AttendanceSessionRecord,
} from "./command-repository.js";
import {
  buildPunchRecordedEvent,
  buildRegularizationDecisionEvent,
} from "./events.js";
import {
  resolveCoordinateRetention,
  type EffectiveAttendancePolicy,
} from "./policy-config.js";
import {
  evaluateAttendanceGeoPolicy,
  type AttendanceGeoDecision,
  type AttendanceGeoEvidenceWideEvaluation,
  type AttendanceGeoNoEffectiveEvaluation,
} from "./geo-policy.js";
import { resolveEffectiveAttendancePolicy } from "./policy-resolver.js";
import { decideAttendanceTransition } from "./session-transition.js";
import {
  calculateSessionDurations,
  projectAttendanceDay,
  secondsBetween,
  type AttendanceApprovalFact,
  type AttendanceDailyProjection,
} from "./daily-projection.js";
import {
  resolveEmployeeShift,
  type ResolvedEmployeeShift,
  type ShiftAssignmentInput,
  type ShiftCompanyInput,
  type ShiftEmployeeInput,
  type ShiftTemplateInput,
  type ShiftTemplateVersionInput,
} from "./shift-resolver.js";

export interface AttendanceCommandInput {
  event_type: AttendancePunchEventType;
  work_mode: "office" | "remote" | "wfh" | "field";
  source: "web" | "web_geo" | "mobile" | "kiosk" | "admin";
  metadata: Record<string, unknown>;
  location?: AttendanceLocationEvidenceInput;
}

export type AttendanceCommandKind =
  | "employee_manual_now"
  | "manager_assisted_now"
  | "historical_correction"
  | "approved_regularization";

export interface AttendanceCommandPrincipal {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
}

interface AttendanceCommandOutcome {
  response: Record<string, unknown>;
  responseStatus: number;
}

interface LocationEvidenceDecisionContext {
  present: boolean;
  location_evidence_id: UUID | null;
  age_ms: number | null;
  source_channel: AttendanceCommandInput["source"] | null;
  provider: string | null;
  permission_state: string | null;
  accuracy_meters: number | null;
}

interface PersistedLocationEvidence {
  id: UUID;
  ageMs: number;
  sourceChannel: AttendanceCommandInput["source"];
  provider: string | null;
  permissionState: string;
  accuracyMeters: number | null;
}

interface AttendanceAuditDecisionReasonInput {
  reasonCode: AttendanceCommandDecisionReasonCode;
  category: string;
  severity: string;
  details: Record<string, unknown>;
}

export const ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX = "attendance.punch";
export const ATTENDANCE_COMMAND_RESOURCE_TYPE = "attendance.command_execution";
export const ATTENDANCE_IDEMPOTENCY_EXPIRATION_INTERVAL = "24 hours";
const LOCATION_CAPTURE_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function canonicalJsonHash(value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(jsonRoundTrip(value))))
    .digest("hex");
}

export const canonicalAttendanceRequestHash = canonicalJsonHash;
export const canonicalAttendanceResponseHash = canonicalJsonHash;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function jsonRoundTrip(
  value: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Idempotency hash input must be JSON serializable.");
    }
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message === "Idempotency hash input must be JSON serializable."
    ) {
      throw error;
    }
    throw new TypeError("Idempotency hash input must be JSON serializable.", {
      cause: error,
    });
  }
}

const exactLocationMetadataKeys = new Set([
  "lat",
  "latitude",
  "lng",
  "long",
  "longitude",
  "coordinate",
  "coordinates",
  "accuracy",
  "accuracy_meters",
  "altitude",
  "altitude_meters",
  "geo_point",
  "point",
  "raw_payload",
]);

function sanitizeAttendanceMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => {
      const normalizedKey = key.trim().toLowerCase().replaceAll("-", "_");
      if (exactLocationMetadataKeys.has(normalizedKey)) return false;
      if (
        normalizedKey === "location" &&
        value !== null &&
        typeof value === "object"
      ) {
        return false;
      }
      return true;
    }),
  );
}

function locationEvidenceDecisionContext(
  evidence: PersistedLocationEvidence | null,
): LocationEvidenceDecisionContext {
  if (!evidence) {
    return {
      present: false,
      location_evidence_id: null,
      age_ms: null,
      source_channel: null,
      provider: null,
      permission_state: null,
      accuracy_meters: null,
    };
  }
  return {
    present: true,
    location_evidence_id: evidence.id,
    age_ms: evidence.ageMs,
    source_channel: evidence.sourceChannel,
    provider: evidence.provider,
    permission_state: evidence.permissionState,
    accuracy_meters: evidence.accuracyMeters,
  };
}

function hasCoordinateEvidence(
  location: AttendanceLocationEvidenceInput,
): location is AttendanceLocationEvidenceInput & {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  captured_at: string;
} {
  return "latitude" in location && "longitude" in location && "accuracy_meters" in location;
}

function geoDecisionSnapshot(decision: AttendanceGeoDecision): Record<string, unknown> {
  return {
    factual_outcome: decision.factualOutcome,
    category: decision.evaluation?.category ?? decision.factualOutcome,
    selected_action: decision.selectedAction,
    fallback_used: decision.fallbackUsed,
    allowed: decision.allowed,
    reason_code: decision.reasonCode,
    evaluator_version: decision.evaluation?.evaluator_version ?? ATTENDANCE_GEO_EVALUATOR_VERSION,
    geofence_id: decision.geofence?.geofenceId ?? null,
    geofence_version_id: decision.geofence?.geofenceVersionId ?? null,
    work_site_id: decision.geofence?.workSiteId ?? null,
    geofence_version_number: decision.geofence?.versionNumber ?? null,
    geofence_shape_type: decision.geofence?.shapeType ?? null,
    geofence_canonical_hash: decision.geofence?.canonicalHash ?? null,
    evaluation: decision.evaluation,
  };
}

function evidenceWideGeoEvaluation(input: {
  category: "stale_evidence" | "accuracy_exceeded";
  evidenceAgeMs: number;
  reportedAccuracyMeters: number;
  maxLocationAgeMs: number | null;
  maxAccuracyMeters: number | null;
}): AttendanceGeoEvidenceWideEvaluation {
  return {
    category: input.category,
    evaluator_version: ATTENDANCE_GEO_EVALUATOR_VERSION,
    evidence_age_ms: input.evidenceAgeMs,
    reported_accuracy_meters: input.reportedAccuracyMeters,
    max_location_age_ms: input.maxLocationAgeMs,
    max_accuracy_meters: input.maxAccuracyMeters,
  };
}

function noEffectiveGeoEvaluation(input: {
  candidateCount: number;
  validCandidateCount: number;
}): AttendanceGeoNoEffectiveEvaluation {
  return {
    category: "no_effective_geofence",
    evaluator_version: ATTENDANCE_GEO_EVALUATOR_VERSION,
    candidate_count: input.candidateCount,
    valid_candidate_count: input.validCandidateCount,
  };
}

function buildAttendanceAuditDecisionReasons(input: {
  denied: boolean;
  reasonCode: AttendanceCommandDecisionReasonCode;
  reasonDetail: string;
  policyReason: boolean;
  geoDecision: AttendanceGeoDecision;
}): AttendanceAuditDecisionReasonInput[] {
  const reasons: AttendanceAuditDecisionReasonInput[] = input.geoDecision.reasons.map((reason) => ({
    reasonCode: reason.reasonCode,
    category: reason.category,
    severity: reason.severity,
    details: reason.details,
  }));
  if (input.denied) {
    reasons.push({
      reasonCode: input.reasonCode,
      category: input.policyReason ? "policy" : "state",
      severity: "error",
      details: { reason_detail: input.reasonDetail },
    });
  }
  return dedupeAttendanceAuditDecisionReasons(reasons);
}

function dedupeAttendanceAuditDecisionReasons(
  reasons: AttendanceAuditDecisionReasonInput[],
): AttendanceAuditDecisionReasonInput[] {
  const seen = new Set<AttendanceCommandDecisionReasonCode>();
  return reasons.filter((reason) => {
    if (seen.has(reason.reasonCode)) return false;
    seen.add(reason.reasonCode);
    return true;
  });
}

function assertLocationCapturedAtWithinFutureSkew(
  location: AttendanceLocationEvidenceInput,
  receivedAt: string,
): void {
  if (!hasCoordinateEvidence(location)) return;
  if (
    location.permission_state !== "granted" &&
    location.permission_state !== "unknown"
  ) {
    throw badRequest(
      "Location permission_state must be granted or unknown when coordinates are supplied.",
    );
  }
  const capturedAtMs = Date.parse(location.captured_at);
  const receivedAtMs = Date.parse(receivedAt);
  if (
    Number.isFinite(capturedAtMs) &&
    Number.isFinite(receivedAtMs) &&
    capturedAtMs - receivedAtMs > LOCATION_CAPTURE_FUTURE_SKEW_MS
  ) {
    throw badRequest(
      "Location captured_at is too far in the future; up to five minutes of device clock skew is allowed.",
    );
  }
}

export class AttendanceCommandService {
  constructor(private readonly store: MemoryDataStore) {}

  async execute(input: {
    actor: AuthUser;
    companyId: UUID;
    subjectEmployeeUserId?: UUID;
    commandKind?: Exclude<AttendanceCommandKind, "historical_correction" | "approved_regularization">;
    timeZone: string;
    idempotencyKey: string;
    command: AttendanceCommandInput;
    isWorkingDayFor: (workDate: string) => boolean;
  }): Promise<Record<string, unknown>> {
    const pool = this.store.pgPool;
    if (!pool)
      throw new Error(
        "PostgreSQL attendance commands require a configured pgPool.",
      );
    const subjectEmployeeUserId = input.subjectEmployeeUserId ?? input.actor.id;
    const commandKind = input.commandKind ?? "employee_manual_now";
    const commandInput: AttendanceCommandInput = {
      ...input.command,
      metadata: sanitizeAttendanceMetadata(input.command.metadata),
    };
    const requestHash = canonicalAttendanceRequestHash({
      company_id: input.companyId,
      actor_user_id: input.actor.id,
      subject_employee_user_id: subjectEmployeeUserId,
      command_kind: commandKind,
      event_type: commandInput.event_type,
      work_mode: commandInput.work_mode,
      source: commandInput.source,
      metadata: input.command.metadata,
      location: commandInput.location ?? null,
    });
    const scope = `${ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX}:${commandKind}:${input.companyId}`;
    const repository = new PostgresAttendanceCommandRepository(pool);
    try {
      const result = await repository.transaction<AttendanceCommandOutcome>(
        async (tx) => {
          const platformKey = await this.acquirePlatformIdempotencyKey(tx, {
            scope,
            actorUserId: input.actor.id,
            idempotencyKey: input.idempotencyKey,
            requestHash,
          });
          if (platformKey.status === "completed") {
            return this.replayCompletedCommand(
              tx,
              platformKey,
              requestHash,
              input.companyId,
            );
          }
          const occurredAt = await tx.getTransactionTimestamp();
          const policy = await resolveEffectiveAttendancePolicy(tx, {
            companyId: input.companyId,
            subjectEmployeeUserId,
            asOf: occurredAt,
          });
          const workDate = dateInTimeZone(occurredAt, input.timeZone);
          if (commandInput.location) {
            assertLocationCapturedAtWithinFutureSkew(
              commandInput.location,
              occurredAt,
            );
          }
          const command = await tx.createCommandExecution({
            companyId: input.companyId,
            actorUserId: input.actor.id,
            employeeUserId: subjectEmployeeUserId,
            platformIdempotencyKeyId: platformKey.id,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            commandType: commandInput.event_type,
            commandOrigin: commandKind,
            occurredAt,
            requestSnapshot: {
              work_date: workDate,
              work_mode: commandInput.work_mode,
              source: commandInput.source,
              metadata: commandInput.metadata,
              location_evidence_supplied: Boolean(commandInput.location),
            },
          });
          const evidencePayload = {
            schema_version: 1,
            command_type: commandInput.event_type,
            work_mode: commandInput.work_mode,
            source_channel: commandInput.source,
          };
          const evidencePayloadHash = canonicalJsonHash(evidencePayload);
          const evidence = await tx.createAttendanceEvidenceEvent({
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            actorUserId: input.actor.id,
            commandExecutionId: command.id,
            eventType: commandInput.event_type,
            source: commandInput.source,
            occurredAt,
            receivedAt: occurredAt,
            payload: evidencePayload,
            payloadHash: evidencePayloadHash,
          });
          const locationEvidence = commandInput.location
            ? await this.persistLocationEvidence(tx, {
                companyId: input.companyId,
                employeeUserId: subjectEmployeeUserId,
                attendanceEventId: evidence.id,
                receivedAt: occurredAt,
                sourceChannel: commandInput.source,
                location: commandInput.location,
                policy,
              })
            : null;
          const locationContext = locationEvidenceDecisionContext(locationEvidence);
          const auditEvidenceDigest = commandInput.location
            ? canonicalJsonHash({
                attendance_event_payload_hash: evidencePayloadHash,
                location: commandInput.location,
              })
            : evidencePayloadHash;
          let state = await tx.ensureAndLockEmployeeState(
            input.companyId,
            subjectEmployeeUserId,
          );
          const open = await tx.findOpenSessionForUpdate(
            input.companyId,
            subjectEmployeeUserId,
          );
          const activeBreak = open
            ? await tx.findActiveBreakForUpdate(input.companyId, open.id)
            : null;
          const completed = open
            ? null
            : await tx.findCompletedSessionForWorkDateForUpdate(
                input.companyId,
                subjectEmployeeUserId,
                workDate,
              );
          const geoLocationStatus = !commandInput.location
            ? { kind: "missing" as const }
            : commandInput.location.permission_state === "denied"
              ? { kind: "permission_denied" as const }
              : commandInput.location.permission_state === "unavailable"
                ? { kind: "location_unavailable" as const }
                : hasCoordinateEvidence(commandInput.location)
                  ? policy.maxLocationAgeMs !== null &&
                    locationEvidence &&
                    locationEvidence.ageMs > policy.maxLocationAgeMs
                    ? {
                        kind: "stale_evidence" as const,
                        evaluation: evidenceWideGeoEvaluation({
                          category: "stale_evidence",
                          evidenceAgeMs: locationEvidence.ageMs,
                          reportedAccuracyMeters: commandInput.location.accuracy_meters,
                          maxLocationAgeMs: policy.maxLocationAgeMs,
                          maxAccuracyMeters: policy.maxAccuracyMeters,
                        }),
                      }
                    : policy.maxAccuracyMeters !== null &&
                        commandInput.location.accuracy_meters > policy.maxAccuracyMeters
                      ? {
                          kind: "accuracy_exceeded" as const,
                          evaluation: evidenceWideGeoEvaluation({
                            category: "accuracy_exceeded",
                            evidenceAgeMs: locationEvidence?.ageMs ?? 0,
                            reportedAccuracyMeters: commandInput.location.accuracy_meters,
                            maxLocationAgeMs: policy.maxLocationAgeMs,
                            maxAccuracyMeters: policy.maxAccuracyMeters,
                          }),
                        }
                      : {
                          kind: "coordinates" as const,
                          fence: policy.effectiveGeofenceIds.length > 0
                            ? await tx.evaluateEffectiveGeofence({
                                companyId: input.companyId,
                                geofenceIds: policy.effectiveGeofenceIds,
                                asOf: occurredAt,
                                latitude: commandInput.location.latitude,
                                longitude: commandInput.location.longitude,
                                reportedAccuracyMeters: commandInput.location.accuracy_meters,
                                graceMeters: policy.geofenceGraceMeters,
                              })
                            : {
                                configured: false as const,
                                evaluation: noEffectiveGeoEvaluation({
                                  candidateCount: 0,
                                  validCandidateCount: 0,
                                }),
                              },
                        }
                  : { kind: "location_unavailable" as const };
          if (geoLocationStatus.kind === "coordinates" && geoLocationStatus.fence.configured) {
            if (locationEvidence) {
              geoLocationStatus.fence.evaluation.evidence_age_ms = locationEvidence.ageMs;
            }
            geoLocationStatus.fence.evaluation.max_location_age_ms = policy.maxLocationAgeMs;
            geoLocationStatus.fence.evaluation.max_accuracy_meters = policy.maxAccuracyMeters;
          }
          const geoDecision = evaluateAttendanceGeoPolicy({
            policy,
            locationStatus: geoLocationStatus,
          });
          const derived = deriveAttendanceRuntimeState(open, activeBreak, completed);
          const priorCompletedSession =
            state.state === "completed" && state.current_session_id
              ? await tx.findSessionForUpdate({
                  companyId: input.companyId,
                  employeeUserId: subjectEmployeeUserId,
                  sessionId: state.current_session_id,
                })
              : null;
          if (
            // Sprint 10 persisted NOT_STARTED after checkout. A current-cycle
            // completed session is authoritative during the rollout to the
            // COMPLETED runtime state, so repair that known legacy shape.
            state.state === "not_checked_in" &&
            state.current_session_id === null &&
            completed
          ) {
            state = await tx.updateEmployeeState({
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              state: derived.state,
              currentSessionId: derived.sessionId,
            });
          } else if (
            state.state === "completed" &&
            !completed &&
            !open &&
            priorCompletedSession?.closed_at &&
            priorCompletedSession.work_date !== workDate
          ) {
            // A completed runtime row from an earlier attendance cycle is
            // intentionally reloaded to NOT_STARTED for this cycle.
            state = await tx.updateEmployeeState({
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              state: derived.state,
              currentSessionId: derived.sessionId,
            });
          } else if (
            state.state !== derived.state ||
            state.current_session_id !== derived.sessionId
          ) {
            throw conflict(
              "Attendance session state is inconsistent; retry the command.",
            );
          }
          const stateDecision = decideAttendanceTransition(
            state.state,
            commandInput.event_type,
          );
          const policyReason = policyBlocked(
            commandInput.event_type,
            occurredAt,
            input.timeZone,
            policy,
            input.isWorkingDayFor(workDate),
            state.state,
          );
          const denied =
            !stateDecision.allowed ||
            !geoDecision.allowed ||
            Boolean(policyReason) ||
            Boolean(
              open?.last_transition_at &&
                Date.parse(occurredAt) < Date.parse(open.last_transition_at),
            );
          const reason = !stateDecision.allowed
            ? (stateDecision.reason_detail ?? "Attendance command was denied.")
            : !geoDecision.allowed
              ? geoDecision.reasonDetail
              : (policyReason ??
                "Attendance timestamp precedes the previous session transition.");
          const code: AttendanceCommandDecisionReasonCode = !stateDecision.allowed
            ? (stateDecision.reason_code ?? "invalid_state_transition")
            : !geoDecision.allowed
              ? geoDecision.reasonCode
              : policyReason
                ? "policy_window_rejected"
                : "invalid_chronology";
          const auditDecision = await tx.createAttendanceAuditDecision({
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            attendanceEventId: evidence.id,
            commandExecutionId: command.id,
            decisionType: "manual_attendance",
            outcome: denied ? "failed" : "passed",
            policyKey: "attendance",
            policyVersion: policy.policyVersion,
            evaluatedAt: occurredAt,
            evidenceDigest: auditEvidenceDigest,
            policySnapshot: policy,
            evaluationContext: {
              company_id: input.companyId,
              actor_user_id: input.actor.id,
              subject_employee_user_id: subjectEmployeeUserId,
              command_origin: commandKind,
              command_type: commandInput.event_type,
              previous_state: state.state,
              open_session_id: open?.id ?? null,
              occurred_at: occurredAt,
              work_date: workDate,
              location_evidence: locationContext,
              geo_policy: geoDecisionSnapshot(geoDecision),
            },
          });
          const auditReasons = buildAttendanceAuditDecisionReasons({
            denied,
            reasonCode: code,
            reasonDetail: reason,
            policyReason: Boolean(policyReason),
            geoDecision,
          });
          for (const [ordinal, auditReason] of auditReasons.entries()) {
            await tx.createAttendanceDecisionReason({
              attendanceDecisionId: auditDecision.id,
              companyId: input.companyId,
              reasonCode: auditReason.reasonCode,
              category: auditReason.category,
              severity: auditReason.severity,
              ordinal,
              details: auditReason.details,
            });
          }
          if (denied) {
            const previous = state.state;
            const decision = await tx.createDecision({
              commandExecutionId: command.id,
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              outcome: "denied",
              reasonCode: code,
              reasonDetail: reason,
              previousState: previous,
              nextState: previous,
              policySnapshot: policy,
              evidenceSnapshot: {
                state,
                company_id: input.companyId,
                actor_user_id: input.actor.id,
                subject_employee_user_id: subjectEmployeeUserId,
                command_origin: commandKind,
                attendance_event_id: evidence.id,
                evidence_payload_hash: evidencePayloadHash,
                location_evidence: locationEvidence,
                geo_policy: geoDecisionSnapshot(geoDecision),
                open_session_id: open?.id ?? null,
                occurred_at: occurredAt,
              },
            });
            const response = {
              allowed: false,
              command_id: command.id,
              decision_id: decision.id,
              reason_code: code,
              reason_detail: reason,
              next_allowed_actions: allowedActions(previous),
              punch_policy: policy,
              geo_policy: geoDecisionSnapshot(geoDecision),
            };
            await tx.completeCommand({
              commandExecutionId: command.id,
              companyId: input.companyId,
              status: "denied",
              responseSnapshot: response,
            });
            await tx.completePlatformIdempotencyKey({
              id: platformKey.id,
              resourceType: ATTENDANCE_COMMAND_RESOURCE_TYPE,
              resourceId: command.id,
              responseHash: canonicalAttendanceResponseHash(response),
              responseStatus: 409,
            });
            return { response, responseStatus: 409 };
          }
          const decision = await tx.createDecision({
            commandExecutionId: command.id,
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            outcome: "allowed",
            reasonCode: null,
            reasonDetail: null,
            previousState: stateDecision.previous_state,
            nextState: stateDecision.next_state,
            policySnapshot: policy,
            evidenceSnapshot: {
              state,
              company_id: input.companyId,
              actor_user_id: input.actor.id,
              subject_employee_user_id: subjectEmployeeUserId,
              command_origin: commandKind,
              attendance_event_id: evidence.id,
              evidence_payload_hash: evidencePayloadHash,
              open_session_id: open?.id ?? null,
              occurred_at: occurredAt,
              geo_policy: geoDecisionSnapshot(geoDecision),
            },
          });
          let session: AttendanceSessionRecord;
          try {
            session = await this.transition(
              tx,
              input.companyId,
              subjectEmployeeUserId,
              workDate,
              occurredAt,
              commandInput,
              open,
              stateDecision.action,
            );
          } catch (error) {
            const mapped = attendanceTransitionConflict(error);
            if (mapped) throw mapped;
            throw error;
          }
          await tx.updateEmployeeState({
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            state: stateDecision.next_state,
            currentSessionId:
              stateDecision.next_state === "not_checked_in" ? null : session.id,
          });
          const punch = (
            await tx.insertPunchEvent({
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              actorUserId: input.actor.id,
              eventType: commandInput.event_type,
              occurredAt,
              workMode: commandInput.work_mode,
              source: commandInput.source,
              origin: commandKind,
              metadata: commandInput.metadata,
              commandExecutionId: command.id,
              sessionId: session.id,
              decisionId: decision.id,
            })
          ).rows[0]!;
          const day = await projectDay(
            tx,
            input.companyId,
            subjectEmployeeUserId,
            workDate,
            commandInput.work_mode,
            policy.graceMinutes,
            input.timeZone,
            occurredAt,
          );
          await tx.insertOutboxEvent(
            buildPunchRecordedEvent({
              companyId: input.companyId,
              actorUserId: input.actor.id,
              subjectEmployeeUserId,
              commandId: command.id,
              decisionId: decision.id,
              sessionId: session.id,
              punchEventId: punch.id,
              punchType: commandInput.event_type,
              occurredAt,
              workDate,
              workMode: commandInput.work_mode,
              sourceChannel: commandInput.source,
              origin: commandKind,
              dayStatus:
                typeof (day as { status?: unknown }).status === "string"
                  ? (day as { status: string }).status
                  : null,
            }),
          );
          const response = {
            allowed: true,
            command_id: command.id,
            decision_id: decision.id,
            session_id: session.id,
            punch_id: punch.id,
            punch: {
              id: punch.id,
              company_id: input.companyId,
              employee_user_id: subjectEmployeeUserId,
              actor_user_id: input.actor.id,
              origin: commandKind,
              event_type: commandInput.event_type,
              work_mode: commandInput.work_mode,
              source: commandInput.source,
              metadata: commandInput.metadata,
              occurred_at: occurredAt,
              created_at: punch.created_at,
              deleted_at: null,
            },
            day_status: day,
            next_allowed_actions: allowedActions(stateDecision.next_state),
            next_allowed_action:
              allowedActions(stateDecision.next_state)[0] ?? null,
            punch_policy: policy,
            geo_policy: geoDecisionSnapshot(geoDecision),
          };
          await tx.completeCommand({
            commandExecutionId: command.id,
            companyId: input.companyId,
            status: "completed",
            sessionId: session.id,
            punchEventId: punch.id,
            responseSnapshot: response,
          });
          await tx.completePlatformIdempotencyKey({
            id: platformKey.id,
            resourceType: ATTENDANCE_COMMAND_RESOURCE_TYPE,
            resourceId: command.id,
            responseHash: canonicalAttendanceResponseHash(response),
            responseStatus: 200,
          });
          return { response, responseStatus: 200 };
        },
      );
      if (result.responseStatus === 409) {
        const response = result.response;
        throw conflict(
          String(
            response["reason_detail"] ??
              "Attendance punch is duplicate or out of sequence.",
          ),
          {
            reason_code: response["reason_code"],
            next_allowed_actions: response["next_allowed_actions"],
            punch_policy: response["punch_policy"],
            geo_policy: response["geo_policy"],
          },
        );
      }
      return result.response;
    } catch (error) {
      if (isAttendanceIdempotencyUniqueViolation(error)) {
        throw conflict(
          "Attendance command conflicts with an existing command. Retry with a new idempotency key.",
        );
      }
      throw error;
    }
  }

  async executeHistoricalCorrection(input: {
    actor: AuthUser;
    principal: AttendanceCommandPrincipal;
    idempotencyKey: string;
    timeZone: string;
    commandKind: Extract<AttendanceCommandKind, "historical_correction" | "approved_regularization">;
    command: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    };
    deferProjection?: boolean;
  }, existingTransaction?: AttendanceCommandTransactionRepository): Promise<Record<string, unknown>> {
    const pool = this.store.pgPool;
    if (!pool && !existingTransaction) throw new Error("PostgreSQL attendance commands require a configured pgPool.");
    const { principal } = input;
    const sanitizedMetadata = sanitizeAttendanceMetadata(input.command.metadata);
    const requestHash = canonicalAttendanceRequestHash({
      company_id: principal.companyId,
      actor_user_id: principal.actorUserId,
      subject_employee_user_id: principal.subjectEmployeeUserId,
      command_kind: input.commandKind,
      event_type: input.command.event_type,
      occurred_at: input.command.occurred_at,
      reason: input.command.reason,
      work_mode: input.command.work_mode,
      metadata: input.command.metadata,
      linked_regularization_request_id:
        input.command.linked_regularization_request_id ?? null,
    });
    const scope = `${ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX}:${input.commandKind}:${principal.companyId}`;
    const run = async (tx: AttendanceCommandTransactionRepository): Promise<AttendanceCommandOutcome> => {
      const platformKey = await this.acquirePlatformIdempotencyKey(tx, {
        scope,
        actorUserId: principal.actorUserId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      });
      if (platformKey.status === "completed") {
        return this.replayCompletedCommand(tx, platformKey, requestHash, principal.companyId);
      }
      const receivedAt = await tx.getTransactionTimestamp();
      if (Date.parse(input.command.occurred_at) >= Date.parse(receivedAt)) {
        throw badRequest("Historical correction occurrence time must be in the past.");
      }
      const policy = await resolveEffectiveAttendancePolicy(tx, {
        companyId: principal.companyId,
        subjectEmployeeUserId: principal.subjectEmployeeUserId,
        asOf: input.command.occurred_at,
      });
      const workDate = dateInTimeZone(input.command.occurred_at, input.timeZone);
      const command = await tx.createCommandExecution({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        employeeUserId: principal.subjectEmployeeUserId,
        platformIdempotencyKeyId: platformKey.id,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        commandType: input.command.event_type,
        commandOrigin: input.commandKind,
        occurredAt: input.command.occurred_at,
        requestSnapshot: {
          work_date: workDate,
          reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
          work_mode: input.command.work_mode,
          metadata: sanitizedMetadata,
        },
      });
      const evidencePayload = {
        schema_version: 1,
        command_kind: input.commandKind,
        reason: input.command.reason,
        linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
      };
      const evidenceDigest = canonicalAttendanceRequestHash(evidencePayload);
      const evidence = await tx.createAttendanceEvidenceEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        commandExecutionId: command.id,
        eventType: input.command.event_type,
        source: "admin",
        occurredAt: input.command.occurred_at,
        receivedAt,
        payload: evidencePayload,
        payloadHash: evidenceDigest,
      });
      const auditDecision = await tx.createAttendanceAuditDecision({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        attendanceEventId: evidence.id,
        commandExecutionId: command.id,
        decisionType: input.commandKind,
        outcome: "passed",
        policyKey: "attendance",
        policyVersion: policy.policyVersion,
        evaluatedAt: receivedAt,
        evidenceDigest,
        policySnapshot: policy,
        evaluationContext: {
          company_id: principal.companyId,
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          command_origin: input.commandKind,
          occurred_at: input.command.occurred_at,
          work_date: workDate,
        },
      });
      const decision = await tx.createDecision({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        outcome: "allowed",
        reasonCode: null,
        reasonDetail: null,
        previousState: "not_checked_in",
        nextState: "not_checked_in",
        policySnapshot: policy,
        evidenceSnapshot: {
          attendance_event_id: evidence.id,
          audit_decision_id: auditDecision.id,
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          command_origin: input.commandKind,
          reason: input.command.reason,
        },
      });
      const punch = (await tx.insertPunchEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        eventType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workMode: input.command.work_mode,
        source: "admin",
        origin: input.commandKind,
        regularizationRequestId: input.command.linked_regularization_request_id ?? null,
        metadata: {
          ...sanitizedMetadata,
          correction_reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
        },
        commandExecutionId: command.id,
        decisionId: decision.id,
      })).rows[0]!;
      const day = input.deferProjection
        ? {}
        : await projectHistoricalCorrectionDay(
            tx,
            principal.companyId,
            principal.subjectEmployeeUserId,
            workDate,
            input.command.work_mode,
            input.timeZone,
            policy.graceMinutes,
            receivedAt,
          );
      await tx.insertOutboxEvent(buildPunchRecordedEvent({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        subjectEmployeeUserId: principal.subjectEmployeeUserId,
        commandId: command.id,
        decisionId: decision.id,
        punchEventId: punch.id,
        punchType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workDate,
        workMode: input.command.work_mode,
        sourceChannel: "admin",
        origin: input.commandKind,
        dayStatus: typeof day.status === "string" ? day.status : null,
      }));
      const response = {
        allowed: true,
        command_id: command.id,
        decision_id: decision.id,
        attendance_event_id: evidence.id,
        punch_id: punch.id,
        punch: {
          id: punch.id,
          company_id: principal.companyId,
          employee_user_id: principal.subjectEmployeeUserId,
          actor_user_id: principal.actorUserId,
          event_type: input.command.event_type,
          occurred_at: input.command.occurred_at,
          work_mode: input.command.work_mode,
          source: "admin",
          origin: input.commandKind,
        },
        day_status: day,
      };
      await tx.completeCommand({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        status: "completed",
        punchEventId: punch.id,
        responseSnapshot: response,
      });
      await tx.completePlatformIdempotencyKey({
        id: platformKey.id,
        resourceType: ATTENDANCE_COMMAND_RESOURCE_TYPE,
        resourceId: command.id,
        responseHash: canonicalAttendanceResponseHash(response),
        responseStatus: 200,
      });
      return { response, responseStatus: 200 };
    };
    const result = existingTransaction
      ? await run(existingTransaction)
      : await new PostgresAttendanceCommandRepository(pool!).transaction(run);
    return result.response;
  }

  async decideRegularization(input: {
    actor: AuthUser;
    companyId: UUID;
    regularizationRequestId: UUID;
    employeeUserId: UUID;
    workDate: string;
    expectedVersion: number;
    reason: string;
    remarks: string | null;
    decision: "approve" | "reject" | "return";
    timeZone: string;
    authorize: () => void;
  }): Promise<{
    version: number;
    decidedAt: string;
    day: Record<string, unknown>;
    applications: Array<{
      id: UUID;
      regularization_request_item_id: UUID;
      regularization_action_id: UUID;
      operation: "add" | "replace" | "void";
      target_punch_event_id: UUID | null;
      replacement_punch_event_id: UUID | null;
      attendance_event_id: UUID | null;
      replacement_punch: Record<string, unknown> | null;
      applied_at: string;
    }>;
  }> {
    const pool = this.store.pgPool;
    if (!pool) throw new Error("PostgreSQL attendance commands require a configured pgPool.");
    return new PostgresAttendanceCommandRepository(pool).transaction(async (tx) => {
      const locked = (await tx.query<{
        company_id: UUID; employee_user_id: UUID; status: string; version: number;
      }>(`SELECT company_id, employee_user_id, status, version
          FROM attendance.regularization_requests
          WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [input.regularizationRequestId, input.companyId])).rows[0];
      if (!locked || locked.employee_user_id !== input.employeeUserId) {
        throw conflict("Attendance regularization request was modified by another actor.");
      }
      if (locked.status !== "pending" || locked.version !== input.expectedVersion) {
        throw conflict("Only the expected pending attendance regularization request can be decided.");
      }
      input.authorize();
      const items = (await tx.query<{
        id: UUID;
        ordinal: number;
        operation: "add" | "replace" | "void";
        target_punch_event_id: UUID | null;
        event_type: AttendancePunchEventType | null;
        occurred_at: Date | null;
      }>(
        `SELECT id, ordinal, operation, target_punch_event_id, event_type, occurred_at
         FROM attendance.regularization_request_items
         WHERE regularization_request_id = $1 AND company_id = $2
         ORDER BY ordinal, id`,
        [input.regularizationRequestId, input.companyId],
      )).rows;
      if (items.length === 0) {
        throw badRequest("Attendance regularization request has no normalized items.");
      }
      const targetIds = items.flatMap((item) => item.target_punch_event_id ? [item.target_punch_event_id] : []);
      if (new Set(targetIds).size !== targetIds.length) {
        throw badRequest("A target punch may be corrected only once per request.");
      }
      const targets = targetIds.length
        ? (await tx.query<{
            id: UUID;
            company_id: UUID;
            employee_user_id: UUID;
            event_type: AttendancePunchEventType;
            occurred_at: Date;
          }>(
            `SELECT id, company_id, employee_user_id, event_type, occurred_at
             FROM attendance.punch_events
             WHERE id = ANY($1::uuid[]) AND company_id = $2 AND deleted_at IS NULL
             FOR UPDATE`,
            [targetIds, input.companyId],
          )).rows
        : [];
      const targetById = new Map(targets.map((target) => [target.id, target]));
      const alreadyAppliedTargets = targetIds.length
        ? new Set((await tx.query<{ target_punch_event_id: UUID }>(
            `SELECT target_punch_event_id
             FROM attendance.regularization_correction_applications
             WHERE target_punch_event_id = ANY($1::uuid[]) AND company_id = $2`,
            [targetIds, input.companyId],
          )).rows.map((row) => row.target_punch_event_id))
        : new Set<UUID>();
      for (const item of items) {
        if (item.operation === "add" || item.operation === "replace") {
          if (!item.event_type || !item.occurred_at) {
            throw badRequest("ADD and REPLACE items require event_type and occurred_at.");
          }
          if (item.event_type !== "check_in" && item.event_type !== "check_out") {
            throw badRequest("Approved regularizations may materialize only check-in and check-out facts.");
          }
          if (dateInTimeZone(item.occurred_at.toISOString(), input.timeZone) !== input.workDate) {
            throw badRequest("Requested punch timestamps must fall on the regularization work_date.");
          }
        }
        if (item.operation === "add") {
          if (item.target_punch_event_id) throw badRequest("ADD items cannot target an existing punch.");
          continue;
        }
        if (!item.target_punch_event_id) {
          throw badRequest("REPLACE and VOID items require target_punch_event_id.");
        }
        const target = targetById.get(item.target_punch_event_id);
        if (!target || target.company_id !== input.companyId) {
          throw badRequest("Target punch does not belong to the active company.");
        }
        if (target.employee_user_id !== input.employeeUserId) {
          throw badRequest("Target punch does not belong to the regularization employee.");
        }
        if (target.event_type !== "check_in" && target.event_type !== "check_out") {
          throw badRequest("Target punch type is not eligible for regularization correction.");
        }
        if (dateInTimeZone(target.occurred_at.toISOString(), input.timeZone) !== input.workDate) {
          throw badRequest("Target punch must belong to the regularization work_date.");
        }
        if (alreadyAppliedTargets.has(target.id)) {
          throw conflict("Target punch was already replaced or voided.");
        }
        if (item.operation === "void" && (item.event_type || item.occurred_at)) {
          throw badRequest("VOID items cannot include replacement event data.");
        }
      }
      const updated = (await tx.query<{ version: number; decided_at: Date }>(
        `UPDATE attendance.regularization_requests
         SET status = $6, current_approver_user_id = NULL,
             decision_remarks = $3, decided_by_user_id = $4, decided_at = now(),
             version = version + 1, updated_at = now()
         WHERE id = $1 AND company_id = $2 AND version = $5
         RETURNING version, decided_at`,
        [input.regularizationRequestId, input.companyId, input.remarks, input.actor.id, input.expectedVersion, input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "returned"],
      )).rows[0];
      if (!updated) throw conflict("Attendance regularization request was modified by another actor.");
      const nextStatus = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "returned";
      const action = (await tx.query<{ id: UUID }>(
        `INSERT INTO attendance.regularization_actions (
           company_id, regularization_request_id, actor_user_id, subject_employee_user_id,
           action_kind, previous_state, resulting_state, remarks, resulting_version, occurred_at
         ) VALUES ($1,$2,$3,$4,$5,'pending',$5,$6,$7,$8)
         RETURNING id`,
        [input.companyId, input.regularizationRequestId, input.actor.id, input.employeeUserId, nextStatus, input.remarks, updated.version, updated.decided_at],
      )).rows[0]!;
      const applications = [] as Array<{
        id: UUID;
        regularization_request_item_id: UUID;
        regularization_action_id: UUID;
        operation: "add" | "replace" | "void";
        target_punch_event_id: UUID | null;
        replacement_punch_event_id: UUID | null;
        attendance_event_id: UUID | null;
        replacement_punch: Record<string, unknown> | null;
        applied_at: string;
      }>;
      for (const item of input.decision === "approve" ? items : []) {
        let replacementPunchEventId: UUID | null = null;
        let attendanceEventId: UUID | null = null;
        let replacementPunch: Record<string, unknown> | null = null;
        if (item.operation !== "void") {
          const occurredAt = item.occurred_at!.toISOString();
          const result = await this.executeHistoricalCorrection({
            actor: input.actor,
            principal: { companyId: input.companyId, actorUserId: input.actor.id, subjectEmployeeUserId: input.employeeUserId },
            idempotencyKey: `attendance.regularization.item:${item.id}`,
            timeZone: input.timeZone,
            commandKind: "approved_regularization",
            deferProjection: true,
            command: {
              event_type: item.event_type!,
              occurred_at: occurredAt,
              reason: input.reason,
              work_mode: "office",
              metadata: {
                decided_by_user_id: input.actor.id,
                regularization_request_item_id: item.id,
                correction_operation: item.operation,
                target_punch_event_id: item.target_punch_event_id,
              },
              linked_regularization_request_id: input.regularizationRequestId,
            },
          }, tx);
          replacementPunchEventId = result.punch_id as UUID;
          attendanceEventId = result.attendance_event_id as UUID;
          replacementPunch = result.punch as Record<string, unknown>;
        }
        const application = (await tx.query<{ id: UUID; applied_at: Date }>(
           `INSERT INTO attendance.regularization_correction_applications (
              company_id, regularization_request_id, regularization_request_item_id, regularization_action_id,
              operation, target_punch_event_id, replacement_punch_event_id,
              attendance_event_id, applied_by_user_id, applied_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id, applied_at`,
          [
            input.companyId,
            input.regularizationRequestId,
            item.id,
            action.id,
            item.operation,
            item.target_punch_event_id,
            replacementPunchEventId,
            attendanceEventId,
            input.actor.id,
            updated.decided_at,
          ],
        )).rows[0]!;
        applications.push({
          id: application.id,
          regularization_request_item_id: item.id,
          regularization_action_id: action.id,
          operation: item.operation,
          target_punch_event_id: item.target_punch_event_id,
          replacement_punch_event_id: replacementPunchEventId,
          attendance_event_id: attendanceEventId,
          replacement_punch: replacementPunch,
          applied_at: application.applied_at.toISOString(),
        });
      }
      const projectionPolicy = input.decision === "approve"
        ? await resolveEffectiveAttendancePolicy(tx, {
            companyId: input.companyId,
            subjectEmployeeUserId: input.employeeUserId,
            asOf: updated.decided_at.toISOString(),
          })
        : null;
      const day = input.decision === "approve"
        ? await projectHistoricalCorrectionDay(
            tx,
            input.companyId,
            input.employeeUserId,
            input.workDate,
            "office",
            input.timeZone,
            projectionPolicy!.graceMinutes,
            updated.decided_at.toISOString(),
          )
        : normalizeDailyProjectionRow((await tx.query<Record<string, unknown>>(
            `UPDATE attendance.daily_records
             SET regularization_status = $4,
                 approval_kind = CASE
                   WHEN approval_kind IN ('none', 'regularization') THEN 'regularization'
                   ELSE 'multiple'
                 END,
                 approval_state = CASE
                   WHEN approval_kind IN ('none', 'regularization') THEN $4
                   WHEN approval_state = $4 THEN approval_state
                   ELSE 'mixed'
                 END,
                 version = version + 1,
                 updated_at = now()
             WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date
             RETURNING *`,
            [
              input.companyId,
              input.employeeUserId,
              input.workDate,
              input.decision === "reject" ? "rejected" : "returned",
            ],
          )).rows[0] ?? {});
      await tx.insertOutboxEvent(buildRegularizationDecisionEvent({
        companyId: input.companyId,
        actorUserId: input.actor.id,
        subjectEmployeeUserId: input.employeeUserId,
        regularizationRequestId: input.regularizationRequestId,
        workDate: input.workDate,
        decision: input.decision,
        previousStatus: "pending",
        nextStatus,
        version: updated.version,
        decidedAt: updated.decided_at.toISOString(),
      }));
      return { version: updated.version, decidedAt: updated.decided_at.toISOString(), day, applications };
    });
  }

  /* Legacy method body retained below for replacement by the transaction-aware implementation. */
  private async executeHistoricalCorrectionLegacy(input: {
    actor: AuthUser;
    principal: AttendanceCommandPrincipal;
    idempotencyKey: string;
    timeZone: string;
    commandKind: Extract<AttendanceCommandKind, "historical_correction" | "approved_regularization">;
    command: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    };
    policy: { graceMinutes: number; policyVersion: string };
  }): Promise<Record<string, unknown>> {
    const pool = this.store.pgPool;
    if (!pool) throw new Error("PostgreSQL attendance commands require a configured pgPool.");
    const { principal } = input;
    const sanitizedMetadata = sanitizeAttendanceMetadata(input.command.metadata);
    const requestHash = canonicalAttendanceRequestHash({
      company_id: principal.companyId,
      actor_user_id: principal.actorUserId,
      subject_employee_user_id: principal.subjectEmployeeUserId,
      command_kind: input.commandKind,
      event_type: input.command.event_type,
      occurred_at: input.command.occurred_at,
      reason: input.command.reason,
      work_mode: input.command.work_mode,
      metadata: input.command.metadata,
      linked_regularization_request_id:
        input.command.linked_regularization_request_id ?? null,
    });
    const scope = `${ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX}:${input.commandKind}:${principal.companyId}`;
    const repository = new PostgresAttendanceCommandRepository(pool);
    const result = await repository.transaction<AttendanceCommandOutcome>(async (tx) => {
      const platformKey = await this.acquirePlatformIdempotencyKey(tx, {
        scope,
        actorUserId: principal.actorUserId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      });
      if (platformKey.status === "completed") {
        return this.replayCompletedCommand(tx, platformKey, requestHash, principal.companyId);
      }
      const receivedAt = await tx.getTransactionTimestamp();
      if (Date.parse(input.command.occurred_at) >= Date.parse(receivedAt)) {
        throw badRequest("Historical correction occurrence time must be in the past.");
      }
      const workDate = dateInTimeZone(input.command.occurred_at, input.timeZone);
      const command = await tx.createCommandExecution({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        employeeUserId: principal.subjectEmployeeUserId,
        platformIdempotencyKeyId: platformKey.id,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        commandType: input.command.event_type,
        commandOrigin: input.commandKind,
        occurredAt: input.command.occurred_at,
        requestSnapshot: {
          work_date: workDate,
          reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
          work_mode: input.command.work_mode,
          metadata: sanitizedMetadata,
        },
      });
      const evidencePayload = {
        schema_version: 1,
        command_kind: input.commandKind,
        reason: input.command.reason,
        linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
      };
      const evidenceDigest = canonicalAttendanceRequestHash(evidencePayload);
      const evidence = await tx.createAttendanceEvidenceEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        commandExecutionId: command.id,
        eventType: input.command.event_type,
        source: "admin",
        occurredAt: input.command.occurred_at,
        receivedAt,
        payload: evidencePayload,
        payloadHash: evidenceDigest,
      });
      const auditDecision = await tx.createAttendanceAuditDecision({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        attendanceEventId: evidence.id,
        commandExecutionId: command.id,
        decisionType: input.commandKind,
        outcome: "passed",
        policyKey: "attendance",
        policyVersion: input.policy.policyVersion,
        evaluatedAt: receivedAt,
        evidenceDigest,
        policySnapshot: input.policy,
        evaluationContext: {
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          occurred_at: input.command.occurred_at,
          work_date: workDate,
        },
      });
      const decision = await tx.createDecision({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        outcome: "allowed",
        reasonCode: null,
        reasonDetail: null,
        previousState: "not_checked_in",
        nextState: "not_checked_in",
        policySnapshot: input.policy,
        evidenceSnapshot: {
          attendance_event_id: evidence.id,
          audit_decision_id: auditDecision.id,
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          reason: input.command.reason,
        },
      });
      const punch = (await tx.insertPunchEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        eventType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workMode: input.command.work_mode,
        source: "admin",
        origin: input.commandKind,
        regularizationRequestId: input.command.linked_regularization_request_id ?? null,
        metadata: {
          ...sanitizedMetadata,
          correction_reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
        },
        commandExecutionId: command.id,
        decisionId: decision.id,
      })).rows[0]!;
      const day = await projectHistoricalCorrectionDay(
        tx,
        principal.companyId,
        principal.subjectEmployeeUserId,
        workDate,
        input.command.work_mode,
        input.timeZone,
        input.policy.graceMinutes,
        receivedAt,
      );
      await tx.insertOutboxEvent(buildPunchRecordedEvent({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        subjectEmployeeUserId: principal.subjectEmployeeUserId,
        commandId: command.id,
        decisionId: decision.id,
        punchEventId: punch.id,
        punchType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workDate,
        workMode: input.command.work_mode,
        sourceChannel: "admin",
        origin: input.commandKind,
        dayStatus: typeof day.status === "string" ? day.status : null,
      }));
      const response = {
        allowed: true,
        command_id: command.id,
        decision_id: decision.id,
        punch_id: punch.id,
        punch: {
          id: punch.id,
          company_id: principal.companyId,
          employee_user_id: principal.subjectEmployeeUserId,
          actor_user_id: principal.actorUserId,
          event_type: input.command.event_type,
          occurred_at: input.command.occurred_at,
          work_mode: input.command.work_mode,
          source: "admin",
          origin: input.commandKind,
        },
        day_status: day,
      };
      await tx.completeCommand({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        status: "completed",
        punchEventId: punch.id,
        responseSnapshot: response,
      });
      await tx.completePlatformIdempotencyKey({
        id: platformKey.id,
        resourceType: ATTENDANCE_COMMAND_RESOURCE_TYPE,
        resourceId: command.id,
        responseHash: canonicalAttendanceResponseHash(response),
        responseStatus: 200,
      });
      return { response, responseStatus: 200 };
    });
    return result.response;
  }

  private async acquirePlatformIdempotencyKey(
    tx: AttendanceCommandTransactionRepository,
    input: {
      scope: string;
      actorUserId: UUID;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<PlatformIdempotencyKeyRecord> {
    let existing = await tx.findPlatformIdempotencyKeyForUpdate(input);
    if (existing?.is_expired) {
      const deleted = await tx.deleteExpiredPlatformIdempotencyKey(existing.id);
      if (deleted) {
        existing = null;
      } else {
        throw new Error(
          "Expired platform idempotency key could not be replaced.",
        );
      }
    }

    if (!existing) {
      const claimed = await tx.claimPlatformIdempotencyKey({
        ...input,
        expiresIn: ATTENDANCE_IDEMPOTENCY_EXPIRATION_INTERVAL,
      });
      if (claimed) return claimed;
      existing = await tx.findPlatformIdempotencyKeyForUpdate(input);
    }

    if (!existing)
      throw new Error("Platform idempotency key claim could not be resolved.");
    if (existing.request_hash !== input.requestHash) {
      throw conflict(
        "Idempotency key was already used with a different attendance command.",
      );
    }
    if (existing.status === "processing") {
      throw conflict(
        "Attendance command with this idempotency key is still being processed.",
      );
    }
    return existing;
  }

  private async replayCompletedCommand(
    tx: AttendanceCommandTransactionRepository,
    key: PlatformIdempotencyKeyRecord,
    requestHash: string,
    companyId: UUID,
  ): Promise<AttendanceCommandOutcome> {
    if (key.status !== "completed") {
      throw new Error("Completed platform idempotency key is inconsistent.");
    }
    if (key.request_hash !== requestHash)
      throw conflict(
        "Idempotency key was already used with a different attendance command.",
      );
    if (
      key.resource_type !== ATTENDANCE_COMMAND_RESOURCE_TYPE ||
      !key.resource_id ||
      !key.response_hash ||
      !key.response_status
    ) {
      throw new Error("Completed platform idempotency key is inconsistent.");
    }
    const command = await tx.findCommandExecutionById(
      key.resource_id,
      companyId,
    );
    if (
      !command?.response_snapshot ||
      command.platform_idempotency_key_id !== key.id
    ) {
      throw new Error(
        "Completed attendance idempotency resource is inconsistent.",
      );
    }
    if (
      command.request_hash !== key.request_hash ||
      command.actor_user_id !== key.actor_user_id ||
      (command.status !== "completed" && command.status !== "denied") ||
      !command.completed_at
    ) {
      throw new Error(
        "Completed attendance idempotency command is inconsistent.",
      );
    }
    if (
      canonicalAttendanceResponseHash(command.response_snapshot) !==
      key.response_hash
    ) {
      throw new Error(
        "Attendance idempotency replay response integrity check failed.",
      );
    }
    if (key.response_status !== 200 && key.response_status !== 409) {
      throw new Error(
        "Completed attendance idempotency response status is inconsistent.",
      );
    }
    return {
      response: command.response_snapshot,
      responseStatus: key.response_status,
    };
  }

  private async persistLocationEvidence(
    tx: AttendanceCommandTransactionRepository,
    input: {
      companyId: UUID;
      employeeUserId: UUID;
      attendanceEventId: UUID;
      receivedAt: string;
      sourceChannel: AttendanceCommandInput["source"];
      location: AttendanceLocationEvidenceInput;
      policy: EffectiveAttendancePolicy;
    },
  ): Promise<PersistedLocationEvidence> {
    const evaluatedAgeMs = Math.max(
      0,
      Date.parse(input.receivedAt) - Date.parse(input.location.captured_at ?? input.receivedAt),
    );
    const coordinateRetention = hasCoordinateEvidence(input.location)
      ? resolveCoordinateRetention(input.policy)
      : null;
    const evidence = await tx.createAttendanceLocationEvidence({
      attendanceEventId: input.attendanceEventId,
      companyId: input.companyId,
      employeeUserId: input.employeeUserId,
      capturedAt: input.location.captured_at ?? input.receivedAt,
      receivedAt: input.receivedAt,
      location: input.location,
      ageMs: evaluatedAgeMs,
      coordinatesExpireAt: coordinateRetention
        ? new Date(Date.parse(input.receivedAt) + coordinateRetention.retentionSeconds * 1000).toISOString()
        : null,
      coordinateRetentionClass: coordinateRetention?.retentionClass ?? null,
      coordinateRetentionSeconds: coordinateRetention?.retentionSeconds ?? null,
      retentionPolicyVersionId: coordinateRetention ? input.policy.policyVersionId : null,
      rawPayload: {
        schema_version: 1,
        source_channel: input.sourceChannel,
        provider: input.location.provider ?? null,
        permission_state: input.location.permission_state,
        client_age_ms: input.location.age_ms ?? null,
        evaluated_age_ms: evaluatedAgeMs,
      },
    });
    return {
      id: evidence.id,
      ageMs: evaluatedAgeMs,
      sourceChannel: input.sourceChannel,
      provider: input.location.provider ?? null,
      permissionState: input.location.permission_state,
      accuracyMeters: hasCoordinateEvidence(input.location) ? input.location.accuracy_meters : null,
    };
  }

  private async transition(
    tx: AttendanceCommandTransactionRepository,
    companyId: UUID,
    employeeId: UUID,
    workDate: string,
    occurredAt: string,
    command: AttendanceCommandInput,
    open: AttendanceSessionRecord | null,
    action: string,
  ): Promise<AttendanceSessionRecord> {
    if (action === "open_session")
      return tx.createSession({
        companyId,
        employeeUserId: employeeId,
        workDate,
        checkedInAt: occurredAt,
        workMode: command.work_mode,
        source: command.source,
        metadata: command.metadata,
      });
    if (!open) throw conflict("There is no open attendance session.");
    const args = {
      sessionId: open.id,
      companyId,
      employeeUserId: employeeId,
      expectedVersion: open.version,
      occurredAt,
    };
    if (action === "start_break") return tx.startBreak(args);
    if (action === "end_break") return tx.endBreak(args);
    return tx.closeSession(args);
  }
}

type PostgresConstraintError = {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
};

function isUniqueViolation(error: unknown): error is PostgresConstraintError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PostgresConstraintError).code === "23505"
  );
}

export function isAttendanceSessionSingleOpenViolation(
  error: unknown,
): boolean {
  return (
    isUniqueViolation(error) &&
    error.constraint === "attendance_sessions_single_open_idx"
  );
}

export function attendanceTransitionConflict(error: unknown) {
  if (isAttendanceSessionSingleOpenViolation(error)) {
    return conflict("The employee already has an open attendance session.", {
      reason_code: "already_checked_in",
    });
  }
  if (!isPostgresConstraintError(error)) return null;

  const constraint = typeof error.constraint === "string" ? error.constraint : "";
  const message = typeof error.message === "string" ? error.message : "";
  if (constraint === "attendance_break_segments_single_active_idx") {
    return conflict("An attendance break is already open.", {
      reason_code: "break_already_started",
    });
  }
  if (constraint === "attendance_break_segments_session_company_fk") {
    return conflict("Attendance break session ownership is invalid.", {
      reason_code: "session_ownership_invalid",
    });
  }
  if (message.includes("attendance break segment requires an open session")) {
    return conflict("An attendance session must be open before starting a break.", {
      reason_code: "no_open_session",
    });
  }
  if (message.includes("completed attendance session cannot retain an active break")) {
    return conflict("The open attendance break must be ended before checking out.", {
      reason_code: "open_break_must_end",
    });
  }
  return null;
}

function isPostgresConstraintError(
  error: unknown,
): error is PostgresConstraintError {
  return typeof error === "object" && error !== null && "code" in error;
}

function isAttendanceIdempotencyUniqueViolation(error: unknown): boolean {
  return (
    isUniqueViolation(error) &&
    [
      "idempotency_keys_scope_idempotency_key_actor_user_id_key",
      "attendance_commands_platform_idempotency_key_uq",
    ].includes(typeof error.constraint === "string" ? error.constraint : "")
  );
}
function allowedActions(state: string): AttendancePunchEventType[] {
  return state === "not_checked_in"
    ? [AttendancePunchEventTypes.CheckIn]
    : state === "working"
      ? [
          AttendancePunchEventTypes.BreakStart,
          AttendancePunchEventTypes.CheckOut,
        ]
      : state === "on_break"
        ? [AttendancePunchEventTypes.BreakEnd]
        : [];
}

function deriveAttendanceRuntimeState(
  open: AttendanceSessionRecord | null,
  activeBreak: { session_id: UUID } | null,
  completed: AttendanceSessionRecord | null,
): {
  state: "not_checked_in" | "working" | "on_break" | "completed";
  sessionId: UUID | null;
} {
  if (open) {
    return activeBreak
      ? { state: "on_break", sessionId: open.id }
      : { state: "working", sessionId: open.id };
  }
  if (completed) return { state: "completed", sessionId: completed.id };
  return { state: "not_checked_in", sessionId: null };
}
type CommandPolicy = Pick<
  EffectiveAttendancePolicy,
  | "fullDayPunchWindow"
  | "punchInStart"
  | "punchInEnd"
  | "punchOutStart"
  | "punchOutEnd"
  | "allowOffDayPunches"
  | "graceMinutes"
>;
function policyBlocked(
  type: AttendancePunchEventType,
  at: string,
  zone: string,
  policy: CommandPolicy,
  working: boolean,
  state: string,
): string | null {
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
  if (
    type === "check_in" &&
    state === "not_checked_in" &&
    !policy.allowOffDayPunches &&
    !working
  )
    return "Punch-in is not allowed on company off days.";
  if (policy.fullDayPunchWindow) return null;
  const range: [string, string] | null =
    type === "check_in"
      ? [policy.punchInStart, policy.punchInEnd]
      : type === "check_out"
        ? [policy.punchOutStart, policy.punchOutEnd]
        : null;
  if (!range) return null;
  const now = toMinutes(local),
    start = toMinutes(range[0]),
    end = toMinutes(range[1]);
  if (
    (start <= end && (now < start || now > end)) ||
    (start > end && now > end && now < start)
  )
    return `Punch-${type === "check_in" ? "in" : "out"} is allowed between ${range[0]} and ${range[1]}.`;
  return null;
}
function toMinutes(value: string): number {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
}
function dateInTimeZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const data = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${data.year}-${data.month}-${data.day}`;
}
async function projectDay(
  tx: AttendanceCommandTransactionRepository,
  companyId: UUID,
  employeeId: UUID,
  workDate: string,
  workMode: AttendanceDayRecord["work_mode"],
  graceMinutes: number,
  timeZone: string,
  asOf: string,
): Promise<Record<string, unknown>> {
  const sessions = (await tx.query<{
    id: UUID;
    checked_in_at: Date;
    closed_at: Date | null;
  }>(
    `SELECT id, checked_in_at, closed_at
     FROM attendance.sessions
     WHERE company_id = $1 AND employee_user_id = $2
       AND work_date = $3::date AND deleted_at IS NULL
     ORDER BY checked_in_at, id`,
    [companyId, employeeId, workDate],
  )).rows;
  const breaks = (await tx.query<{
    session_id: UUID;
    started_at: Date;
    ended_at: Date | null;
  }>(
    `SELECT segment.session_id, segment.started_at, segment.ended_at
     FROM attendance.break_segments segment
     JOIN attendance.sessions session
       ON session.id = segment.session_id AND session.company_id = segment.company_id
     WHERE segment.company_id = $1 AND session.employee_user_id = $2
       AND session.work_date = $3::date AND session.deleted_at IS NULL
     ORDER BY segment.started_at, segment.id`,
    [companyId, employeeId, workDate],
  )).rows;
  const legacyBreakPunches = (await tx.query<{
    session_id: UUID;
    event_type: "break_start" | "break_end";
    occurred_at: Date;
  }>(
    `SELECT punch.session_id, punch.event_type, punch.occurred_at
     FROM attendance.punch_events punch
     JOIN attendance.sessions session
       ON session.id = punch.session_id AND session.company_id = punch.company_id
     WHERE punch.company_id = $1 AND punch.employee_user_id = $2
       AND session.work_date = $3::date AND session.deleted_at IS NULL
       AND punch.deleted_at IS NULL
       AND punch.event_type IN ('break_start', 'break_end')
       AND NOT EXISTS (
         SELECT 1
         FROM attendance.break_segments segment
         WHERE segment.company_id = punch.company_id
           AND segment.session_id = punch.session_id
       )
     ORDER BY punch.session_id, punch.occurred_at, punch.id`,
    [companyId, employeeId, workDate],
  )).rows;
  const durations = calculateSessionDurations({
    sessions: sessions.map((session) => ({
      id: session.id,
      startedAt: session.checked_in_at.toISOString(),
      endedAt: session.closed_at?.toISOString() ?? null,
    })),
    breaks: [
      ...breaks.map((segment) => ({
        sessionId: segment.session_id,
        startedAt: segment.started_at.toISOString(),
        endedAt: segment.ended_at?.toISOString() ?? null,
      })),
      ...legacyBreakIntervals(legacyBreakPunches),
    ],
    asOf,
  });
  const firstCheckIn = sessions[0]?.checked_in_at.toISOString() ?? null;
  const lastCheckOut = sessions
    .map((session) => session.closed_at)
    .filter((value): value is Date => value !== null)
    .at(-1)?.toISOString() ?? null;
  const context = await attendanceProjectionContext(
    tx,
    companyId,
    employeeId,
    workDate,
    timeZone,
    asOf,
    workMode,
  );
  const projection = projectAttendanceDay({
    companyId,
    employeeUserId: employeeId,
    workDate,
    asOf,
    dayClassification: context.dayClassification,
    firstCheckIn,
    lastCheckOut,
    hasOpenSession: sessions.some((session) => session.closed_at === null),
    incompleteIsException: workDate < dateInTimeZone(asOf, timeZone),
    workMode,
    workSeconds: durations.workSeconds,
    breakSeconds: durations.breakSeconds,
    scheduledStartAt: context.shift.scheduled_start_at,
    scheduledEndAt: context.shift.scheduled_end_at,
    graceSeconds: graceMinutes * 60,
    approvalFacts: context.approvalFacts,
    existingApproval: context.existing,
    regularizationStatus: context.regularizationStatus,
  });
  return persistDailyProjection(tx, projection);
}

function legacyBreakIntervals(
  punches: Array<{
    session_id: UUID;
    event_type: "break_start" | "break_end";
    occurred_at: Date;
  }>,
): Array<{
  sessionId: UUID;
  startedAt: string;
  endedAt: string | null;
}> {
  const openBySession = new Map<UUID, string>();
  const intervals: Array<{
    sessionId: UUID;
    startedAt: string;
    endedAt: string | null;
  }> = [];
  for (const punch of punches) {
    const occurredAt = punch.occurred_at.toISOString();
    if (punch.event_type === "break_start") {
      if (!openBySession.has(punch.session_id)) {
        openBySession.set(punch.session_id, occurredAt);
      }
      continue;
    }
    const startedAt = openBySession.get(punch.session_id);
    if (!startedAt) continue;
    intervals.push({
      sessionId: punch.session_id,
      startedAt,
      endedAt: occurredAt,
    });
    openBySession.delete(punch.session_id);
  }
  for (const [sessionId, startedAt] of openBySession) {
    intervals.push({ sessionId, startedAt, endedAt: null });
  }
  return intervals;
}

async function projectHistoricalCorrectionDay(
  tx: AttendanceCommandTransactionRepository,
  companyId: UUID,
  employeeUserId: UUID,
  workDate: string,
  workMode: string,
  timeZone: string,
  graceMinutes: number,
  asOf: string,
): Promise<Record<string, unknown>> {
  const facts = (await tx.query<{
    first_check_in: Date | null;
    last_check_out: Date | null;
  }>(
    `SELECT
       min(occurred_at) FILTER (WHERE event_type = 'check_in') AS first_check_in,
       max(occurred_at) FILTER (WHERE event_type = 'check_out') AS last_check_out
     FROM attendance.punch_events
     WHERE punch_events.company_id = $1
       AND punch_events.employee_user_id = $2
       AND punch_events.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM attendance.regularization_correction_applications application
         WHERE application.company_id = punch_events.company_id
           AND application.target_punch_event_id = punch_events.id
       )
       AND (punch_events.occurred_at AT TIME ZONE $3)::date = $4::date`,
    [companyId, employeeUserId, timeZone, workDate],
  )).rows[0];
  const firstCheckIn = facts?.first_check_in?.toISOString() ?? null;
  const lastCheckOut = facts?.last_check_out?.toISOString() ?? null;
  const context = await attendanceProjectionContext(
    tx,
    companyId,
    employeeUserId,
    workDate,
    timeZone,
    asOf,
    workMode as AttendanceDayRecord["work_mode"],
  );
  const projection = projectAttendanceDay({
    companyId,
    employeeUserId,
    workDate,
    asOf,
    dayClassification: context.dayClassification,
    firstCheckIn,
    lastCheckOut,
    hasOpenSession: Boolean(firstCheckIn && !lastCheckOut),
    hasIncompleteEvidence: Boolean(firstCheckIn) !== Boolean(lastCheckOut),
    incompleteIsException: true,
    workMode: workMode as AttendanceDayRecord["work_mode"],
    workSeconds: firstCheckIn && lastCheckOut
      ? secondsBetween(firstCheckIn, lastCheckOut)
      : 0,
    breakSeconds: 0,
    scheduledStartAt: context.shift.scheduled_start_at,
    scheduledEndAt: context.shift.scheduled_end_at,
    graceSeconds: graceMinutes * 60,
    approvalFacts: context.approvalFacts,
    existingApproval: context.existing,
    regularizationStatus: context.regularizationStatus,
    note: "Historical correction",
  });
  return persistDailyProjection(tx, projection);
}

async function attendanceProjectionContext(
  tx: AttendanceCommandTransactionRepository,
  companyId: UUID,
  employeeUserId: UUID,
  workDate: string,
  timeZone: string,
  asOf: string,
  workMode: AttendanceDayRecord["work_mode"],
): Promise<{
  dayClassification: AttendanceDayRecord["day_classification"];
  shift: ResolvedEmployeeShift;
  approvalFacts: AttendanceApprovalFact[];
  existing: Pick<AttendanceDayRecord, "approval_kind" | "approval_state"> | null;
  regularizationStatus: AttendanceDayRecord["regularization_status"];
}> {
  const company = (await tx.query<ShiftCompanyInput & { working_week: string } & Record<string, unknown>>(
    `SELECT id, timezone, work_hours_per_day, working_week
     FROM platform.company_profiles WHERE id = $1 AND status = 'active'`,
    [companyId],
  )).rows[0];
  const employee = (await tx.query<ShiftEmployeeInput & Record<string, unknown>>(
    `SELECT id, timezone FROM core.users WHERE id = $1 AND deleted_at IS NULL`,
    [employeeUserId],
  )).rows[0];
  if (!company || !employee) throw new Error("Attendance projection context is unavailable.");
  const templates = (await tx.query<ShiftTemplateInput & Record<string, unknown>>(
    `SELECT id, company_id, code, name, description, status, is_company_default, deleted_at
     FROM attendance.shift_templates WHERE company_id = $1 AND deleted_at IS NULL`,
    [companyId],
  )).rows;
  const versions = (await tx.query<ShiftTemplateVersionInput & Record<string, unknown>>(
    `SELECT id, company_id, template_id, version_number, effective_from::text,
        effective_until::text, local_start_time::text, local_end_time::text,
        end_day_offset, timezone_strategy, fixed_timezone,
        eligibility_open_before_start_minutes, eligibility_close_after_end_minutes
     FROM attendance.shift_template_versions
     WHERE company_id = $1 AND effective_from <= $2::date
       AND (effective_until IS NULL OR effective_until >= $2::date)`,
    [companyId, workDate],
  )).rows;
  const assignments = (await tx.query<ShiftAssignmentInput & Record<string, unknown>>(
    `SELECT id, company_id, employee_user_id, template_id, effective_from::text,
        effective_until::text, status, deleted_at
     FROM attendance.shift_assignments
     WHERE company_id = $1 AND employee_user_id = $2 AND deleted_at IS NULL
       AND effective_from <= $3::date
       AND (effective_until IS NULL OR effective_until >= $3::date)`,
    [companyId, employeeUserId, workDate],
  )).rows;
  const shift = resolveEmployeeShift({ company, employee, workDate, templates, versions, assignments });
  const calendar = (await tx.query<{
    holiday: boolean;
    leave_approved: boolean;
    wfh_approved: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM leave_wfh.holidays h
         WHERE h.company_id = $1 AND h.holiday_date = $3::date
           AND h.optional = false AND h.deleted_at IS NULL) AS holiday,
       EXISTS (SELECT 1 FROM leave_wfh.leave_requests l
         WHERE l.employee_user_id = $2 AND l.status = 'approved'
           AND $3::date BETWEEN l.date_from AND l.date_to AND l.deleted_at IS NULL) AS leave_approved,
       EXISTS (SELECT 1 FROM leave_wfh.wfh_requests w
         WHERE w.employee_user_id = $2 AND w.status = 'approved'
           AND $3::date BETWEEN w.date_from AND w.date_to AND w.deleted_at IS NULL) AS wfh_approved`,
    [companyId, employeeUserId, workDate],
  )).rows[0] ?? { holiday: false, leave_approved: false, wfh_approved: false };
  const approvalRows = (await tx.query<{ kind: "regularization" | "leave" | "wfh"; state: string }>(
    `(SELECT 'regularization'::text AS kind, status AS state
       FROM attendance.regularization_requests
       WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date AND deleted_at IS NULL
       ORDER BY updated_at DESC, id DESC
       LIMIT 1)
     UNION ALL
     SELECT 'leave'::text, CASE status WHEN 'pending_manager' THEN 'pending' ELSE status END
       FROM leave_wfh.leave_requests
       WHERE employee_user_id = $2 AND $3::date BETWEEN date_from AND date_to
         AND status <> 'cancelled' AND deleted_at IS NULL
     UNION ALL
     SELECT 'wfh'::text, CASE status WHEN 'pending_manager' THEN 'pending' ELSE status END
       FROM leave_wfh.wfh_requests
       WHERE employee_user_id = $2 AND $3::date BETWEEN date_from AND date_to
         AND status <> 'cancelled' AND deleted_at IS NULL`,
    [companyId, employeeUserId, workDate],
  )).rows;
  const approvalFacts = approvalRows.filter(
    (row): row is { kind: AttendanceApprovalFact["kind"]; state: AttendanceApprovalFact["state"] } =>
      ["regularization", "leave", "wfh"].includes(row.kind) &&
      ["pending", "approved", "returned", "rejected"].includes(row.state),
  );
  const existing = (await tx.query<{
    approval_kind: AttendanceDayRecord["approval_kind"];
    approval_state: AttendanceDayRecord["approval_state"];
    regularization_status: AttendanceDayRecord["regularization_status"];
  }>(
    `SELECT approval_kind, approval_state, regularization_status
     FROM attendance.daily_records
     WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date AND deleted_at IS NULL`,
    [companyId, employeeUserId, workDate],
  )).rows[0] ?? null;
  const dayClassification = calendar.leave_approved
    ? AttendanceDayClassifications.Leave
    : calendar.wfh_approved
      ? AttendanceDayClassifications.Wfh
      : calendar.holiday
        ? AttendanceDayClassifications.Holiday
        : !isWorkingDate(workDate, company.working_week, new Set())
          ? AttendanceDayClassifications.Weekend
          : workMode === "wfh"
            ? AttendanceDayClassifications.Wfh
            : workDate > dateInTimeZone(asOf, timeZone)
              ? AttendanceDayClassifications.Future
              : AttendanceDayClassifications.WorkingDay;
  return {
    dayClassification,
    shift,
    approvalFacts,
    existing,
    regularizationStatus: (
      approvalRows.find((row) => row.kind === "regularization")?.state as
        AttendanceDayRecord["regularization_status"] | undefined
    ) ?? existing?.regularization_status ?? null,
  };
}

async function persistDailyProjection(
  tx: AttendanceCommandTransactionRepository,
  projection: AttendanceDailyProjection,
): Promise<Record<string, unknown>> {
  const values = [
    projection.company_id, projection.employee_user_id, projection.work_date,
    projection.status, projection.day_classification, projection.presence_state,
    projection.punctuality_state, projection.evidence_state, projection.approval_kind,
    projection.approval_state, projection.payroll_state, projection.first_check_in,
    projection.last_check_out, projection.work_minutes, projection.break_minutes,
    projection.late_minutes, projection.early_out_minutes, projection.work_seconds,
    projection.break_seconds, projection.scheduled_seconds, projection.late_seconds,
    projection.early_departure_seconds, projection.work_mode, projection.note,
    projection.exception_type, projection.regularization_status,
  ];
  const row = (await tx.query<Record<string, unknown>>(
    `INSERT INTO attendance.daily_records (
       company_id, employee_user_id, work_date, status, day_classification,
       presence_state, punctuality_state, evidence_state, approval_kind,
       approval_state, payroll_state, first_check_in, last_check_out,
       work_minutes, break_minutes, late_minutes, early_out_minutes,
       work_seconds, break_seconds, scheduled_seconds, late_seconds,
       early_departure_seconds, work_mode, note, exception_type,
       regularization_status, version, created_at, updated_at, deleted_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,1,now(),now(),NULL
     )
     ON CONFLICT (company_id, employee_user_id, work_date) DO UPDATE SET
       status = EXCLUDED.status,
       day_classification = EXCLUDED.day_classification,
       presence_state = EXCLUDED.presence_state,
       punctuality_state = EXCLUDED.punctuality_state,
       evidence_state = EXCLUDED.evidence_state,
       approval_kind = EXCLUDED.approval_kind,
       approval_state = EXCLUDED.approval_state,
       payroll_state = EXCLUDED.payroll_state,
       first_check_in = EXCLUDED.first_check_in,
       last_check_out = EXCLUDED.last_check_out,
       work_minutes = EXCLUDED.work_minutes,
       break_minutes = EXCLUDED.break_minutes,
       late_minutes = EXCLUDED.late_minutes,
       early_out_minutes = EXCLUDED.early_out_minutes,
       work_seconds = EXCLUDED.work_seconds,
       break_seconds = EXCLUDED.break_seconds,
       scheduled_seconds = EXCLUDED.scheduled_seconds,
       late_seconds = EXCLUDED.late_seconds,
       early_departure_seconds = EXCLUDED.early_departure_seconds,
       work_mode = EXCLUDED.work_mode,
       note = EXCLUDED.note,
       exception_type = EXCLUDED.exception_type,
       regularization_status = EXCLUDED.regularization_status,
       version = attendance.daily_records.version + 1,
       updated_at = now(), deleted_at = NULL
     RETURNING *`,
    values,
  )).rows[0];
  if (!row) throw new Error("Attendance daily projection did not return a row.");
  return normalizeDailyProjectionRow(row);
}

function normalizeDailyProjectionRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date && key === "work_date"
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : value instanceof Date ? value.toISOString() : value,
  ]));
}
