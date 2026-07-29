import type {
  AttendanceDayRecord,
  AttendancePunch,
  AttendanceRegularizationRequest,
  CoreUser,
  UUID
} from "#shared";

type DimensionKey =
  | "day_classification"
  | "presence_state"
  | "punctuality_state"
  | "evidence_state"
  | "approval_state"
  | "payroll_state";

type ExtendedAttendanceDay = AttendanceDayRecord & Partial<Record<
  | DimensionKey
  | "approval_kind"
  | "work_seconds"
  | "break_seconds"
  | "scheduled_seconds"
  | "late_seconds"
  | "early_departure_seconds",
  string | number
>>;

type ExtendedAttendancePunch = AttendancePunch & {
  origin?: string;
  regularization_request_id?: UUID | null;
};

export interface AttendanceExplanationDimension {
  key: DimensionKey;
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
  id: UUID;
  event_type: AttendancePunch["event_type"];
  occurred_at: string;
  local_time: string | null;
  source_channel: AttendancePunch["source"];
  work_mode: AttendancePunch["work_mode"];
  origin: string;
  verdict: "accepted";
  reason_codes: string[];
}

export interface AttendanceDailyExplanation {
  generated_at: string;
  work_date: string;
  employee: {
    id: UUID;
    employee_code: string;
    full_name: string;
  };
  summary: {
    status: AttendanceDayRecord["status"];
    first_check_in: string | null;
    last_check_out: string | null;
    in_time: string | null;
    out_time: string | null;
    work_minutes: number;
    break_minutes: number;
    late_minutes: number;
    early_out_minutes: number;
    work_mode: AttendanceDayRecord["work_mode"];
  };
  dimensions: AttendanceExplanationDimension[];
  reasons: AttendanceExplanationReason[];
  source_events: AttendanceExplanationSourceEvent[];
  regularization: {
    id: UUID;
    status: AttendanceRegularizationRequest["status"];
    reason: string;
    decision_remarks: string | null;
    decided_at: string | null;
  } | null;
  privacy: {
    restricted_evidence_omitted: true;
  };
}

interface BuildDailyExplanationInput {
  generatedAt: string;
  employee: CoreUser;
  day: AttendanceDayRecord;
  punches: AttendancePunch[];
  regularization: AttendanceRegularizationRequest | null;
  timeZone: string;
}

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  day_classification: "Day",
  presence_state: "Presence",
  punctuality_state: "Punctuality",
  evidence_state: "Evidence",
  approval_state: "Approval",
  payroll_state: "Payroll"
};

export function buildAttendanceDailyExplanation(
  input: BuildDailyExplanationInput
): AttendanceDailyExplanation {
  const day = input.day as ExtendedAttendanceDay;
  const dimensions = buildDimensions(day);

  return {
    generated_at: input.generatedAt,
    work_date: day.work_date,
    employee: {
      id: input.employee.id,
      employee_code: input.employee.employee_code,
      full_name: input.employee.full_name
    },
    summary: {
      status: day.status,
      first_check_in: day.first_check_in,
      last_check_out: day.last_check_out,
      in_time: timeText(day.first_check_in, input.timeZone),
      out_time: timeText(day.last_check_out, input.timeZone),
      work_minutes: day.work_minutes,
      break_minutes: day.break_minutes,
      late_minutes: day.late_minutes,
      early_out_minutes: day.early_out_minutes,
      work_mode: day.work_mode
    },
    dimensions,
    reasons: buildReasons(day, input.regularization),
    source_events: input.punches.map((punch) =>
      presentSourceEvent(punch as ExtendedAttendancePunch, input.timeZone)
    ),
    regularization: input.regularization
      ? {
          id: input.regularization.id,
          status: input.regularization.status,
          reason: input.regularization.reason,
          decision_remarks: input.regularization.decision_remarks,
          decided_at: input.regularization.decided_at
        }
      : null,
    privacy: {
      restricted_evidence_omitted: true
    }
  };
}

function buildDimensions(day: ExtendedAttendanceDay): AttendanceExplanationDimension[] {
  const values: Record<DimensionKey, string> = {
    day_classification: stringField(day.day_classification, inferDayClassification(day)),
    presence_state: stringField(day.presence_state, inferPresenceState(day)),
    punctuality_state: stringField(day.punctuality_state, inferPunctualityState(day)),
    evidence_state: stringField(day.evidence_state, inferEvidenceState(day)),
    approval_state: stringField(day.approval_state, inferApprovalState(day)),
    payroll_state: stringField(day.payroll_state, "unprocessed")
  };

  return (Object.keys(values) as DimensionKey[]).map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    state: values[key],
    explanation: dimensionExplanation(key, values[key])
  }));
}

function buildReasons(
  day: ExtendedAttendanceDay,
  regularization: AttendanceRegularizationRequest | null
): AttendanceExplanationReason[] {
  const reasons: AttendanceExplanationReason[] = [];

  if (day.status === "weekend" || day.status === "holiday") {
    reasons.push({
      code: day.status === "weekend" ? "NON_WORKING_WEEKEND" : "COMPANY_HOLIDAY",
      category: "schedule",
      message: day.status === "weekend"
        ? "This date is classified as a company non-working day."
        : "This date is classified as a company holiday."
    });
  } else if (day.status === "leave" || day.status === "wfh") {
    reasons.push({
      code: day.status === "leave" ? "APPROVED_LEAVE" : "WORK_FROM_HOME",
      category: "schedule",
      message: day.status === "leave"
        ? "Approved leave determines the day classification."
        : "The day is classified as work from home."
    });
  }

  if (day.exception_type === "absent") {
    reasons.push({
      code: "NO_CHECK_IN",
      category: "presence",
      message: "No accepted check-in was recorded for this work date."
    });
  } else if (day.exception_type === "missing_punch") {
    reasons.push({
      code: "INCOMPLETE_PUNCH_SEQUENCE",
      category: "evidence",
      message: "The accepted source events do not form a complete attendance session."
    });
  }

  if (day.late_minutes > 0) {
    reasons.push({
      code: "LATE_ARRIVAL",
      category: "punctuality",
      message: `The first check-in was ${durationText(day.late_minutes)} after the allowed start time.`
    });
  }
  if (day.early_out_minutes > 0) {
    reasons.push({
      code: "EARLY_DEPARTURE",
      category: "punctuality",
      message: `The final check-out was ${durationText(day.early_out_minutes)} before the scheduled end time.`
    });
  }

  if (regularization) {
    reasons.push({
      code: `REGULARIZATION_${regularization.status.toUpperCase()}`,
      category: "approval",
      message: `A regularization request is ${regularization.status.replaceAll("_", " ")} for this date.`
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      code: day.first_check_in ? "ACCEPTED_ATTENDANCE_EVENTS" : "NO_ATTENDANCE_REQUIRED",
      category: day.first_check_in ? "presence" : "schedule",
      message: day.first_check_in
        ? "The day summary was calculated from the accepted attendance events shown below."
        : "No attendance exception applies to this date."
    });
  }

  return reasons;
}

function presentSourceEvent(
  punch: ExtendedAttendancePunch,
  timeZone: string
): AttendanceExplanationSourceEvent {
  const origin = punch.origin ?? inferOrigin(punch.source);
  const reasonCodes = ["EVENT_ACCEPTED", `CHANNEL_${punch.source.toUpperCase()}`];

  if (origin === "system") reasonCodes.push("SYSTEM_GENERATED");
  if (origin === "manager_assisted_now") reasonCodes.push("MANAGER_ASSISTED");
  if (origin === "historical_correction") reasonCodes.push("HISTORICAL_CORRECTION");
  if (origin === "approved_regularization" || punch.regularization_request_id) {
    reasonCodes.push("APPROVED_REGULARIZATION");
  }

  return {
    id: punch.id,
    event_type: punch.event_type,
    occurred_at: punch.occurred_at,
    local_time: timeText(punch.occurred_at, timeZone),
    source_channel: punch.source,
    work_mode: punch.work_mode,
    origin,
    verdict: "accepted",
    reason_codes: reasonCodes
  };
}

function inferDayClassification(day: AttendanceDayRecord): string {
  if (["weekend", "holiday", "leave", "wfh", "future"].includes(day.status)) {
    return day.status;
  }
  return "working_day";
}

function inferPresenceState(day: AttendanceDayRecord): string {
  if (day.status === "absent") return "absent";
  if (day.status === "future") return "not_started";
  if (["weekend", "holiday", "leave"].includes(day.status)) return "not_applicable";
  if (day.exception_type === "missing_punch") return "incomplete";
  if (day.first_check_in || day.last_check_out || day.work_minutes > 0) return "present";
  return "not_started";
}

function inferPunctualityState(day: AttendanceDayRecord): string {
  if (day.late_minutes > 0 && day.early_out_minutes > 0) return "late_and_early_departure";
  if (day.late_minutes > 0) return "late";
  if (day.early_out_minutes > 0) return "early_departure";
  if (["absent", "weekend", "holiday", "leave", "future"].includes(day.status)) {
    return "not_applicable";
  }
  return day.first_check_in ? "on_time" : "unknown";
}

function inferEvidenceState(day: AttendanceDayRecord): string {
  if (day.exception_type === "missing_punch") return "partial";
  if (day.status === "absent") return "missing";
  if (["weekend", "holiday", "leave", "future"].includes(day.status)) {
    return "not_applicable";
  }
  if (day.first_check_in && day.last_check_out) return "complete";
  return day.first_check_in || day.last_check_out ? "partial" : "unknown";
}

function inferApprovalState(day: AttendanceDayRecord): string {
  return day.regularization_status ?? "not_required";
}

function dimensionExplanation(key: DimensionKey, state: string): string {
  const readable = state.replaceAll("_", " ");
  const prefix: Record<DimensionKey, string> = {
    day_classification: "Schedule and approved absence context classify this day as",
    presence_state: "Accepted attendance events produce a presence state of",
    punctuality_state: "Scheduled start and end comparisons produce",
    evidence_state: "The completeness of accepted source events is",
    approval_state: "The applicable attendance approval state is",
    payroll_state: "Payroll processing for this summary is"
  };
  return `${prefix[key]} ${readable}.`;
}

function inferOrigin(source: AttendancePunch["source"]): string {
  return source === "admin" ? "manager_assisted_now" : "employee_manual_now";
}

function stringField(value: string | number | undefined, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function durationText(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder} minute${remainder === 1 ? "" : "s"}`;
  if (remainder === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

function timeText(value: string | null, timeZone: string): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).format(new Date(value));
  } catch {
    return value.slice(11, 19);
  }
}
