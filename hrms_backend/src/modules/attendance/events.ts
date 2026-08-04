import type {
  AttendanceGeoDecisionReasonCode,
  AttendanceGeoFactualOutcome,
  AttendanceGeoPolicyAction,
  AttendanceOfflineSyncReasonCode,
  AttendanceOfflineVerificationStatus,
  AttendancePunchEventType,
  AttendancePunchSourceChannel,
  UUID,
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";

export const attendanceEvents = {
  PunchRecorded: "attendance.punch.recorded",
  ProvisionalRecorded: "attendance.provisional.recorded",
  GeoRejected: "attendance.geo.rejected",
  MissingCheckoutDetected: "attendance.missing_checkout.detected",
  RegularizationSubmitted: "attendance.regularization.submitted",
  RegularizationApproved: "attendance.regularization.approved",
  RegularizationReturned: "attendance.regularization.returned",
  RegularizationRejected: "attendance.regularization.rejected",
  ExportRequested: "attendance.export.requested",
} as const;

type AttendanceEventName =
  (typeof attendanceEvents)[keyof typeof attendanceEvents];

type AttendanceEventBase = {
  schema_version: 1;
  company_id: UUID;
  actor_user_id: UUID;
};

export type AttendancePunchRecordedPayload = AttendanceEventBase & {
  subject_employee_user_id: UUID;
  command_id: UUID | null;
  decision_id: UUID | null;
  session_id: UUID | null;
  punch_event_id: UUID;
  punch_type: AttendancePunchEventType;
  occurred_at: string;
  work_date: string;
  work_mode: "office" | "remote" | "wfh" | "field";
  source_channel: AttendancePunchSourceChannel;
  origin: "employee_manual_now" | "manager_assisted_now" | "historical_correction" | "approved_regularization" | "system";
  day_status: string | null;
};

export type AttendanceProvisionalRecordedPayload = AttendanceEventBase & {
  subject_employee_user_id: UUID;
  attendance_event_id: UUID;
  command_id: UUID | null;
  source_channel: AttendancePunchSourceChannel;
  verification_status: AttendanceOfflineVerificationStatus;
  provisional_reason_code: AttendanceOfflineSyncReasonCode;
  captured_at: string;
  received_at: string;
};

export type AttendanceGeoRejectedPayload = AttendanceEventBase & {
  subject_employee_user_id: UUID;
  command_id: UUID;
  decision_id: UUID;
  source_channel: AttendancePunchSourceChannel;
  selected_action: AttendanceGeoPolicyAction;
  factual_outcome: AttendanceGeoFactualOutcome;
  reason_code: AttendanceGeoDecisionReasonCode;
  fallback_used: boolean;
  decided_at: string;
};

export type AttendanceMissingCheckoutDetectedPayload = AttendanceEventBase & {
  subject_employee_user_id: UUID;
  attendance_session_id: UUID | null;
  punch_event_id: UUID;
  work_date: string;
  occurred_at: string;
  origin: "system";
};

export type AttendanceRegularizationSubmittedPayload = AttendanceEventBase & {
  subject_employee_user_id: UUID;
  regularization_request_id: UUID;
  assigned_approver_user_id: UUID | null;
  work_date: string;
  status: string;
  version: number;
};

export type AttendanceRegularizationDecisionPayload = AttendanceEventBase & {
  subject_employee_user_id: UUID;
  regularization_request_id: UUID;
  work_date: string;
  previous_status: string;
  next_status: string;
  version: number;
  decided_at: string;
};

export type AttendanceExportRequestedPayload = AttendanceEventBase & {
  export_job_id: UUID;
  format: "csv" | "xlsx" | "json";
  status: string;
};

export type AttendanceOutboxPayload =
  | AttendancePunchRecordedPayload
  | AttendanceProvisionalRecordedPayload
  | AttendanceGeoRejectedPayload
  | AttendanceMissingCheckoutDetectedPayload
  | AttendanceRegularizationSubmittedPayload
  | AttendanceRegularizationDecisionPayload
  | AttendanceExportRequestedPayload;

export type AttendanceOutboxEventContract = {
  aggregateId: UUID;
  eventType: AttendanceEventName;
  payload: AttendanceOutboxPayload;
  idempotencyKey: string;
};

export function buildPunchRecordedEvent(input: {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
  commandId?: UUID | null;
  decisionId?: UUID | null;
  sessionId?: UUID | null;
  punchEventId: UUID;
  punchType: AttendancePunchEventType;
  occurredAt: string;
  workDate: string;
  workMode: AttendancePunchRecordedPayload["work_mode"];
  sourceChannel: AttendancePunchRecordedPayload["source_channel"];
  origin?: AttendancePunchRecordedPayload["origin"];
  dayStatus: string | null;
}): AttendanceOutboxEventContract {
  const payload: AttendancePunchRecordedPayload = {
    schema_version: 1,
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    subject_employee_user_id: input.subjectEmployeeUserId,
    command_id: input.commandId ?? null,
    decision_id: input.decisionId ?? null,
    session_id: input.sessionId ?? null,
    punch_event_id: input.punchEventId,
    punch_type: input.punchType,
    occurred_at: input.occurredAt,
    work_date: input.workDate,
    work_mode: input.workMode,
    source_channel: input.sourceChannel,
    origin: input.origin ?? "employee_manual_now",
    day_status: input.dayStatus,
  };
  return {
    aggregateId: input.punchEventId,
    eventType: attendanceEvents.PunchRecorded,
    payload,
    idempotencyKey: `attendance.punch.recorded:${input.punchEventId}`,
  };
}

export function buildProvisionalRecordedEvent(input: {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
  attendanceEventId: UUID;
  commandId?: UUID | null;
  sourceChannel: AttendanceProvisionalRecordedPayload["source_channel"];
  verificationStatus: AttendanceProvisionalRecordedPayload["verification_status"];
  provisionalReasonCode: AttendanceProvisionalRecordedPayload["provisional_reason_code"];
  capturedAt: string;
  receivedAt: string;
}): AttendanceOutboxEventContract {
  const payload: AttendanceProvisionalRecordedPayload = {
    schema_version: 1,
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    subject_employee_user_id: input.subjectEmployeeUserId,
    attendance_event_id: input.attendanceEventId,
    command_id: input.commandId ?? null,
    source_channel: input.sourceChannel,
    verification_status: input.verificationStatus,
    provisional_reason_code: input.provisionalReasonCode,
    captured_at: input.capturedAt,
    received_at: input.receivedAt,
  };
  return {
    aggregateId: input.attendanceEventId,
    eventType: attendanceEvents.ProvisionalRecorded,
    payload,
    idempotencyKey: `attendance.provisional.recorded:${input.attendanceEventId}`,
  };
}

export function buildGeoRejectedEvent(input: {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
  commandId: UUID;
  decisionId: UUID;
  sourceChannel: AttendanceGeoRejectedPayload["source_channel"];
  selectedAction: AttendanceGeoRejectedPayload["selected_action"];
  factualOutcome: AttendanceGeoRejectedPayload["factual_outcome"];
  reasonCode: AttendanceGeoRejectedPayload["reason_code"];
  fallbackUsed: boolean;
  decidedAt: string;
}): AttendanceOutboxEventContract {
  const payload: AttendanceGeoRejectedPayload = {
    schema_version: 1,
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    subject_employee_user_id: input.subjectEmployeeUserId,
    command_id: input.commandId,
    decision_id: input.decisionId,
    source_channel: input.sourceChannel,
    selected_action: input.selectedAction,
    factual_outcome: input.factualOutcome,
    reason_code: input.reasonCode,
    fallback_used: input.fallbackUsed,
    decided_at: input.decidedAt,
  };
  return {
    aggregateId: input.decisionId,
    eventType: attendanceEvents.GeoRejected,
    payload,
    idempotencyKey: `attendance.geo.rejected:${input.decisionId}`,
  };
}

export function buildMissingCheckoutDetectedEvent(input: {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
  attendanceSessionId?: UUID | null;
  punchEventId: UUID;
  workDate: string;
  occurredAt: string;
}): AttendanceOutboxEventContract {
  const payload: AttendanceMissingCheckoutDetectedPayload = {
    schema_version: 1,
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    subject_employee_user_id: input.subjectEmployeeUserId,
    attendance_session_id: input.attendanceSessionId ?? null,
    punch_event_id: input.punchEventId,
    work_date: input.workDate,
    occurred_at: input.occurredAt,
    origin: "system",
  };
  return {
    aggregateId: input.punchEventId,
    eventType: attendanceEvents.MissingCheckoutDetected,
    payload,
    idempotencyKey: `attendance.missing_checkout.detected:${input.punchEventId}`,
  };
}

export function buildRegularizationSubmittedEvent(input: {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
  regularizationRequestId: UUID;
  assignedApproverUserId: UUID | null;
  workDate: string;
  status: string;
  version: number;
}): AttendanceOutboxEventContract {
  const payload: AttendanceRegularizationSubmittedPayload = {
    schema_version: 1,
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    subject_employee_user_id: input.subjectEmployeeUserId,
    regularization_request_id: input.regularizationRequestId,
    assigned_approver_user_id: input.assignedApproverUserId,
    work_date: input.workDate,
    status: input.status,
    version: input.version,
  };
  return {
    aggregateId: input.regularizationRequestId,
    eventType: attendanceEvents.RegularizationSubmitted,
    payload,
    idempotencyKey: `attendance.regularization.submitted:${input.regularizationRequestId}:${input.version}`,
  };
}

export function buildRegularizationDecisionEvent(input: {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
  regularizationRequestId: UUID;
  workDate: string;
  decision: "approve" | "return" | "reject";
  previousStatus: string;
  nextStatus: string;
  version: number;
  decidedAt: string;
}): AttendanceOutboxEventContract {
  const eventType = eventForRegularizationDecision(input.decision);
  const payload: AttendanceRegularizationDecisionPayload = {
    schema_version: 1,
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    subject_employee_user_id: input.subjectEmployeeUserId,
    regularization_request_id: input.regularizationRequestId,
    work_date: input.workDate,
    previous_status: input.previousStatus,
    next_status: input.nextStatus,
    version: input.version,
    decided_at: input.decidedAt,
  };
  return {
    aggregateId: input.regularizationRequestId,
    eventType,
    payload,
    idempotencyKey: `attendance.regularization.${input.decision}:${input.regularizationRequestId}:${input.version}`,
  };
}

export function buildExportRequestedEvent(input: {
  companyId: UUID;
  actorUserId: UUID;
  exportJobId: UUID;
  format: AttendanceExportRequestedPayload["format"];
  status: string;
}): AttendanceOutboxEventContract {
  const payload: AttendanceExportRequestedPayload = {
    schema_version: 1,
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    export_job_id: input.exportJobId,
    format: input.format,
    status: input.status,
  };
  return {
    aggregateId: input.exportJobId,
    eventType: attendanceEvents.ExportRequested,
    payload,
    idempotencyKey: `attendance.export.requested:${input.exportJobId}`,
  };
}

export function appendAttendanceOutboxEvent(
  store: MemoryDataStore,
  event: AttendanceOutboxEventContract,
): void {
  appendOutboxEvent(store, {
    aggregateType: "attendance",
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    payload: event.payload,
    idempotencyKey: event.idempotencyKey,
  });
}

function eventForRegularizationDecision(
  decision: "approve" | "return" | "reject",
): AttendanceEventName {
  if (decision === "approve") return attendanceEvents.RegularizationApproved;
  if (decision === "reject") return attendanceEvents.RegularizationRejected;
  return attendanceEvents.RegularizationReturned;
}
