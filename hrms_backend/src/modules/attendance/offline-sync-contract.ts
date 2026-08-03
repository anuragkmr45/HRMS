import { z } from "zod";
import {
  attendanceCommandDeviceSchema,
  attendanceLocationEvidenceSchema,
  offsetIsoDateTimeSchema,
  isoDateTimeSchema,
  uuidSchema,
} from "#shared";
import { canonicalJsonHash } from "./canonical-json.js";

export const ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION = "attendance.offline_sync.v1";
export const ATTENDANCE_OFFLINE_SYNC_MAX_BATCH_EVENTS = 50;

export const attendanceOfflineSyncStatusValues = [
  "accepted",
  "replayed",
  "conflict",
  "rejected",
  "deferred",
] as const;

export const attendanceOfflineVerificationStatusValues = [
  "unverified",
  "review_required",
  "rejected",
] as const;

export const attendanceOfflineSyncReasonCodeValues = [
  "offline_sync.accepted_unverified",
  "offline_sync.replayed",
  "offline_sync.changed_body_conflict",
  "offline_sync.validation_failed",
  "offline_sync.processing_deferred",
  "offline_sync.sequence_gap",
  "offline_sync.sequence_out_of_order",
  "offline_sync.duplicate_sequence",
  "offline_sync.review_required",
] as const;

const offlineAttendanceCommandKindSchema = z.literal("employee_manual_now");
const attendanceOfflineSequenceSchema = z.number().int().positive().safe();

const offlineAttendanceMetadataSchema = z.object({
  app_session_id: z.string().trim().min(1).max(128).optional(),
  app_state: z.enum(["foreground", "background", "terminated", "unknown"]).optional(),
  capture_method: z.enum(["user_action", "system_retry"]).optional(),
  client_timezone: z.string().trim().min(1).max(80).optional(),
  network_state: z.enum(["offline", "online", "unknown"]).optional(),
  offline_reason: z.enum([
    "network_unavailable",
    "app_backgrounded",
    "manual_retry",
    "unknown",
  ]).optional(),
  note: z.string().trim().max(280).optional(),
}).strict();

const offlineAttendanceEventTypeSchema = z.enum([
  "check_in",
  "break_start",
  "break_end",
  "check_out",
]);

const offlineAttendanceWorkModeSchema = z.enum([
  "office",
  "remote",
  "wfh",
  "field",
]);

export const attendanceOfflineEventEnvelopeSchema = z.object({
  client_event_id: uuidSchema,
  sequence: attendanceOfflineSequenceSchema,
  command_kind: offlineAttendanceCommandKindSchema,
  captured_at: offsetIsoDateTimeSchema,
  source: z.literal("mobile_offline").default("mobile_offline"),
  event_type: offlineAttendanceEventTypeSchema,
  work_mode: offlineAttendanceWorkModeSchema.default("office"),
  metadata: offlineAttendanceMetadataSchema.default({}),
  location: attendanceLocationEvidenceSchema.optional(),
}).strict();

export type AttendanceOfflineEventEnvelope = z.infer<
  typeof attendanceOfflineEventEnvelopeSchema
>;

export const attendanceOfflineBatchRequestSchema = z.object({
  contract_version: z.literal(ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION),
  batch_id: uuidSchema,
  device: attendanceCommandDeviceSchema,
  events: z.array(attendanceOfflineEventEnvelopeSchema)
    .min(1)
    .max(ATTENDANCE_OFFLINE_SYNC_MAX_BATCH_EVENTS),
}).strict().superRefine((input, context) => {
  const clientEventIds = new Map<string, number>();
  const sequences = new Map<number, number>();

  input.events.forEach((event, index) => {
    const firstClientEventIndex = clientEventIds.get(event.client_event_id);
    if (firstClientEventIndex !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Duplicate client_event_id values are not allowed in one offline sync batch.",
        path: ["events", index, "client_event_id"],
      });
      context.addIssue({
        code: "custom",
        message: "Duplicate client_event_id values are not allowed in one offline sync batch.",
        path: ["events", firstClientEventIndex, "client_event_id"],
      });
    } else {
      clientEventIds.set(event.client_event_id, index);
    }

    const firstSequenceIndex = sequences.get(event.sequence);
    if (firstSequenceIndex !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Duplicate sequence values are not allowed in one submitted device stream.",
        path: ["events", index, "sequence"],
      });
      context.addIssue({
        code: "custom",
        message: "Duplicate sequence values are not allowed in one submitted device stream.",
        path: ["events", firstSequenceIndex, "sequence"],
      });
    } else {
      sequences.set(event.sequence, index);
    }
  });
});

export type AttendanceOfflineBatchRequest = z.infer<
  typeof attendanceOfflineBatchRequestSchema
>;

export const attendanceOfflineSyncResultSchema = z.object({
  client_event_id: uuidSchema,
  sequence: attendanceOfflineSequenceSchema,
  sync_status: z.enum(attendanceOfflineSyncStatusValues),
  verification_status: z.enum(attendanceOfflineVerificationStatusValues),
  replayed: z.boolean(),
  reason_code: z.enum(attendanceOfflineSyncReasonCodeValues).nullable().optional(),
  server_received_at: isoDateTimeSchema,
  processed_at: isoDateTimeSchema.nullable().optional(),
  payroll_eligible: z.literal(false),
}).strict().superRefine((input, context) => {
  if (input.replayed !== (input.sync_status === "replayed")) {
    context.addIssue({
      code: "custom",
      message: "replayed must be true only when sync_status is replayed.",
      path: ["replayed"],
    });
  }

  if (
    (input.sync_status === "conflict" || input.sync_status === "rejected") &&
    input.verification_status !== "rejected"
  ) {
    context.addIssue({
      code: "custom",
      message: "conflict and rejected sync results must use verification_status rejected.",
      path: ["verification_status"],
    });
  }

  if (
    input.sync_status === "accepted" &&
    input.verification_status === "rejected"
  ) {
    context.addIssue({
      code: "custom",
      message: "accepted sync results must not use verification_status rejected.",
      path: ["verification_status"],
    });
  }

  if (
    input.sync_status === "deferred" &&
    input.verification_status !== "review_required"
  ) {
    context.addIssue({
      code: "custom",
      message: "deferred sync results must use verification_status review_required.",
      path: ["verification_status"],
    });
  }

  if (input.reason_code === undefined || input.reason_code === null) return;

  const expectedByReasonCode: Partial<
    Record<
      NonNullable<typeof input.reason_code>,
      {
        sync_status: typeof input.sync_status;
        verification_status?: typeof input.verification_status;
      }
    >
  > = {
    "offline_sync.accepted_unverified": {
      sync_status: "accepted",
      verification_status: "unverified",
    },
    "offline_sync.review_required": {
      sync_status: "accepted",
      verification_status: "review_required",
    },
    "offline_sync.replayed": {
      sync_status: "replayed",
    },
    "offline_sync.changed_body_conflict": {
      sync_status: "conflict",
      verification_status: "rejected",
    },
    "offline_sync.validation_failed": {
      sync_status: "rejected",
      verification_status: "rejected",
    },
    "offline_sync.processing_deferred": {
      sync_status: "deferred",
      verification_status: "review_required",
    },
    "offline_sync.sequence_gap": {
      sync_status: "deferred",
      verification_status: "review_required",
    },
    "offline_sync.sequence_out_of_order": {
      sync_status: "deferred",
      verification_status: "review_required",
    },
    "offline_sync.duplicate_sequence": {
      sync_status: "rejected",
      verification_status: "rejected",
    },
  };

  const expected = expectedByReasonCode[input.reason_code];

  if (expected && input.sync_status !== expected.sync_status) {
    context.addIssue({
      code: "custom",
      message: `${input.reason_code} is not compatible with sync_status ${input.sync_status}.`,
      path: ["reason_code"],
    });
  }

  if (
    expected?.verification_status !== undefined &&
    input.verification_status !== expected.verification_status
  ) {
    context.addIssue({
      code: "custom",
      message: `${input.reason_code} is not compatible with verification_status ${input.verification_status}.`,
      path: ["reason_code"],
    });
  }
});

export type AttendanceOfflineSyncResult = z.infer<
  typeof attendanceOfflineSyncResultSchema
>;

export const attendanceOfflineSyncResponseSchema = z.object({
  contract_version: z.literal(ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION),
  batch_id: uuidSchema,
  server_received_at: isoDateTimeSchema,
  results: z.array(attendanceOfflineSyncResultSchema)
    .min(1)
    .max(ATTENDANCE_OFFLINE_SYNC_MAX_BATCH_EVENTS),
}).strict();

export type AttendanceOfflineSyncResponse = z.infer<
  typeof attendanceOfflineSyncResponseSchema
>;

export type AttendanceOfflineCanonicalEvent = ReturnType<
  typeof canonicalOfflineAttendanceEventProjection
>;

export function canonicalOfflineAttendanceEventProjection(
  event: AttendanceOfflineEventEnvelope,
) {
  return {
    client_event_id: event.client_event_id,
    sequence: event.sequence,
    command_kind: event.command_kind,
    captured_at: event.captured_at,
    source: event.source,
    event_type: event.event_type,
    work_mode: event.work_mode,
    metadata: event.metadata,
    location: event.location ?? null,
  };
}

export function canonicalOfflineAttendanceEventHash(
  event: AttendanceOfflineEventEnvelope,
): string {
  return canonicalJsonHash(canonicalOfflineAttendanceEventProjection(event));
}
