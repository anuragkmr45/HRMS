import type { AttendancePunchEventType, UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";

export const attendanceEvents = {
  PunchRecorded: "attendance.punch.recorded",
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
  source_channel: "web" | "web_geo" | "mobile" | "kiosk" | "admin";
  origin: "employee_manual_now" | "manager_assisted_now" | "historical_correction" | "approved_regularization" | "system";
  day_status: string | null;
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
