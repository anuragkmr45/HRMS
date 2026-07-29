import { asArray, asRecord, numberValue, text, type ApiRecord } from "@/shared/api";

export type AttendanceExplanationDimensionKey =
  | "day_classification"
  | "presence_state"
  | "punctuality_state"
  | "evidence_state"
  | "approval_state"
  | "payroll_state";

export interface AttendanceExplanationDimension {
  key: AttendanceExplanationDimensionKey;
  label: string;
  state: string;
  explanation: string;
}

export interface AttendanceExplanationReason {
  code: string;
  category: "schedule" | "presence" | "punctuality" | "evidence" | "approval";
  message: string;
}

export interface AttendanceExplanationSourceEvent {
  id: string;
  eventType: "check_in" | "break_start" | "break_end" | "check_out";
  occurredAt: string;
  localTime: string | null;
  sourceChannel: string;
  workMode: string;
  origin: string;
  verdict: string;
  reasonCodes: string[];
}

export interface AttendanceDailyExplanation {
  generatedAt: string;
  workDate: string;
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
  };
  summary: {
    status: string;
    inTime: string | null;
    outTime: string | null;
    workMinutes: number;
    breakMinutes: number;
    lateMinutes: number;
    earlyOutMinutes: number;
    workMode: string | null;
  };
  dimensions: AttendanceExplanationDimension[];
  reasons: AttendanceExplanationReason[];
  sourceEvents: AttendanceExplanationSourceEvent[];
  regularization: {
    id: string;
    status: string;
    reason: string;
    decisionRemarks: string | null;
    decidedAt: string | null;
  } | null;
  restrictedEvidenceOmitted: boolean;
}

const DIMENSION_KEYS = new Set<AttendanceExplanationDimensionKey>([
  "day_classification",
  "presence_state",
  "punctuality_state",
  "evidence_state",
  "approval_state",
  "payroll_state",
]);

const EVENT_TYPES = new Set<AttendanceExplanationSourceEvent["eventType"]>([
  "check_in",
  "break_start",
  "break_end",
  "check_out",
]);

const REASON_CATEGORIES = new Set<AttendanceExplanationReason["category"]>([
  "schedule",
  "presence",
  "punctuality",
  "evidence",
  "approval",
]);

export function mapAttendanceDailyExplanation(value: unknown): AttendanceDailyExplanation {
  const payload = asRecord(value);
  const employee = asRecord(payload.employee);
  const summary = asRecord(payload.summary);
  const regularization = asRecordOrNull(payload.regularization);
  const privacy = asRecord(payload.privacy);

  return {
    generatedAt: text(payload.generated_at),
    workDate: text(payload.work_date),
    employee: {
      id: text(employee.id),
      employeeCode: text(employee.employee_code, "UNKNOWN"),
      fullName: text(employee.full_name, "Unknown employee"),
    },
    summary: {
      status: text(summary.status, "unknown"),
      inTime: nullableText(summary.in_time),
      outTime: nullableText(summary.out_time),
      workMinutes: numberValue(summary.work_minutes),
      breakMinutes: numberValue(summary.break_minutes),
      lateMinutes: numberValue(summary.late_minutes),
      earlyOutMinutes: numberValue(summary.early_out_minutes),
      workMode: nullableText(summary.work_mode),
    },
    dimensions: asArray(payload.dimensions)
      .map(asRecord)
      .map(mapDimension)
      .filter((item): item is AttendanceExplanationDimension => item !== null),
    reasons: asArray(payload.reasons)
      .map(asRecord)
      .map(mapReason)
      .filter((item): item is AttendanceExplanationReason => item !== null),
    sourceEvents: asArray(payload.source_events)
      .map(asRecord)
      .map(mapSourceEvent)
      .filter((item): item is AttendanceExplanationSourceEvent => item !== null),
    regularization: regularization
      ? {
          id: text(regularization.id),
          status: text(regularization.status),
          reason: text(regularization.reason),
          decisionRemarks: nullableText(regularization.decision_remarks),
          decidedAt: nullableText(regularization.decided_at),
        }
      : null,
    restrictedEvidenceOmitted: privacy.restricted_evidence_omitted === true,
  };
}

function mapDimension(record: ApiRecord): AttendanceExplanationDimension | null {
  const key = text(record.key) as AttendanceExplanationDimensionKey;
  if (!DIMENSION_KEYS.has(key)) return null;
  return {
    key,
    label: text(record.label, key.replaceAll("_", " ")),
    state: text(record.state, "unknown"),
    explanation: text(record.explanation),
  };
}

function mapReason(record: ApiRecord): AttendanceExplanationReason | null {
  const category = text(record.category) as AttendanceExplanationReason["category"];
  if (!REASON_CATEGORIES.has(category)) return null;
  return {
    code: text(record.code),
    category,
    message: text(record.message),
  };
}

function mapSourceEvent(record: ApiRecord): AttendanceExplanationSourceEvent | null {
  const eventType = text(record.event_type) as AttendanceExplanationSourceEvent["eventType"];
  if (!EVENT_TYPES.has(eventType)) return null;
  return {
    id: text(record.id),
    eventType,
    occurredAt: text(record.occurred_at),
    localTime: nullableText(record.local_time),
    sourceChannel: text(record.source_channel, "unknown"),
    workMode: text(record.work_mode, "unknown"),
    origin: text(record.origin, "unknown"),
    verdict: text(record.verdict, "unknown"),
    reasonCodes: asArray(record.reason_codes)
      .map((reason) => text(reason))
      .filter(Boolean),
  };
}

function asRecordOrNull(value: unknown): ApiRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? asRecord(value) : null;
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}
