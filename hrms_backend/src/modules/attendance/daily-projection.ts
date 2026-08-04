import type {
  AttendanceApprovalKind,
  AttendanceApprovalState,
  AttendanceDayClassification,
  AttendanceDayRecord,
  AttendanceDayStatus,
  AttendanceEvidenceState,
  AttendancePayrollState,
  AttendancePresenceState,
  AttendancePunctualityState,
  UUID,
} from "#shared";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  AttendanceEvidenceStates,
  AttendancePayrollStates,
  AttendancePresenceStates,
  AttendancePunctualityStates,
} from "#shared";

export interface AttendanceApprovalFact {
  kind: Exclude<AttendanceApprovalKind, "none" | "multiple">;
  state: Exclude<AttendanceApprovalState, "not_required" | "mixed" | "unknown">;
}

export interface AttendanceDailyProjectionInput {
  companyId: UUID;
  employeeUserId: UUID;
  workDate: string;
  asOf: string;
  dayClassification: AttendanceDayClassification;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  hasOpenSession: boolean;
  hasIncompleteEvidence?: boolean;
  incompleteIsException?: boolean;
  workMode: AttendanceDayRecord["work_mode"];
  workSeconds: number;
  breakSeconds: number;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  graceSeconds: number;
  approvalFacts?: AttendanceApprovalFact[];
  existingApproval?: Pick<AttendanceDayRecord, "approval_kind" | "approval_state"> | null;
  regularizationStatus?: AttendanceDayRecord["regularization_status"];
  note?: string | null;
  forceEvidenceState?: AttendanceEvidenceState;
  forcePresenceState?: AttendancePresenceState;
}

export type AttendanceDailyProjection = Omit<
  AttendanceDayRecord,
  "id" | "version" | "created_at" | "updated_at" | "deleted_at"
>;

export function secondsBetween(start: string, end: string): number {
  const elapsed = Date.parse(end) - Date.parse(start);
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 1_000)) : 0;
}

export function secondsToLegacyMinutes(seconds: number): number {
  return Math.floor(nonNegativeSeconds(seconds) / 60);
}

export function calculateSessionDurations(input: {
  sessions: Array<{ id: string; startedAt: string; endedAt: string | null }>;
  breaks: Array<{ sessionId: string; startedAt: string; endedAt: string | null }>;
  asOf: string;
}): { workSeconds: number; breakSeconds: number } {
  let grossSeconds = 0;
  let breakSeconds = 0;
  for (const session of input.sessions) {
    const sessionEnd = session.endedAt ?? input.asOf;
    grossSeconds += secondsBetween(session.startedAt, sessionEnd);
    const intervals = input.breaks
      .filter((segment) => segment.sessionId === session.id)
      .map((segment) => ({
        start: Math.max(Date.parse(session.startedAt), Date.parse(segment.startedAt)),
        end: Math.min(Date.parse(sessionEnd), Date.parse(segment.endedAt ?? sessionEnd)),
      }))
      .filter((interval) => Number.isFinite(interval.start) && interval.end > interval.start)
      .sort((left, right) => left.start - right.start);
    let coveredUntil = 0;
    for (const interval of intervals) {
      const start = Math.max(interval.start, coveredUntil);
      if (interval.end <= start) continue;
      breakSeconds += Math.floor((interval.end - start) / 1_000);
      coveredUntil = interval.end;
    }
  }
  return {
    workSeconds: Math.max(0, grossSeconds - breakSeconds),
    breakSeconds,
  };
}

export function deriveLegacyAttendanceStatus(input: {
  dayClassification: AttendanceDayClassification;
  presenceState: AttendancePresenceState;
  punctualityState: AttendancePunctualityState;
  approvalKind: AttendanceApprovalKind;
  approvalState: AttendanceApprovalState;
  workMode: AttendanceDayRecord["work_mode"];
}): AttendanceDayStatus {
  if (input.dayClassification === AttendanceDayClassifications.Leave) {
    return AttendanceDayStatuses.Leave;
  }
  if (
    input.dayClassification === AttendanceDayClassifications.Wfh ||
    input.workMode === "wfh"
  ) return AttendanceDayStatuses.Wfh;
  if (input.dayClassification === AttendanceDayClassifications.Holiday) {
    return AttendanceDayStatuses.Holiday;
  }
  if (input.dayClassification === AttendanceDayClassifications.Weekend) {
    return AttendanceDayStatuses.Weekend;
  }
  if (input.dayClassification === AttendanceDayClassifications.Future) {
    return AttendanceDayStatuses.Future;
  }
  if (input.presenceState === AttendancePresenceStates.Absent) {
    return AttendanceDayStatuses.Absent;
  }
  if (
    input.punctualityState === AttendancePunctualityStates.Late ||
    input.punctualityState === AttendancePunctualityStates.LateAndEarlyDeparture
  ) return AttendanceDayStatuses.Late;
  return AttendanceDayStatuses.Present;
}

export function matchesLegacyAttendanceStatus(
  record: Pick<AttendanceDayRecord, "status"> &
    Partial<Pick<AttendanceDayRecord, "day_classification" | "presence_state" | "punctuality_state">>,
  status: string,
): boolean {
  if (!record.day_classification || !record.presence_state || !record.punctuality_state) {
    return record.status === status;
  }
  switch (status) {
    case AttendanceDayStatuses.Leave:
      return record.day_classification === AttendanceDayClassifications.Leave;
    case AttendanceDayStatuses.Wfh:
      return record.day_classification === AttendanceDayClassifications.Wfh;
    case AttendanceDayStatuses.Holiday:
      return record.day_classification === AttendanceDayClassifications.Holiday;
    case AttendanceDayStatuses.Weekend:
      return record.day_classification === AttendanceDayClassifications.Weekend;
    case AttendanceDayStatuses.Future:
      return record.day_classification === AttendanceDayClassifications.Future;
    case AttendanceDayStatuses.Absent:
      return record.presence_state === AttendancePresenceStates.Absent;
    case AttendanceDayStatuses.Late:
      return record.punctuality_state === AttendancePunctualityStates.Late ||
        record.punctuality_state === AttendancePunctualityStates.LateAndEarlyDeparture;
    case AttendanceDayStatuses.Present:
      return record.presence_state === AttendancePresenceStates.Present &&
        record.punctuality_state !== AttendancePunctualityStates.Late &&
        record.punctuality_state !== AttendancePunctualityStates.LateAndEarlyDeparture;
    default:
      return record.status === status;
  }
}

export function mergeAttendanceApprovals(
  facts: readonly AttendanceApprovalFact[],
  existing: AttendanceDailyProjectionInput["existingApproval"],
): { approvalKind: AttendanceApprovalKind; approvalState: AttendanceApprovalState } {
  const merged = [...facts];
  if (
    existing &&
    existing.approval_kind !== AttendanceApprovalKinds.None &&
    existing.approval_kind !== AttendanceApprovalKinds.Multiple &&
    existing.approval_state !== AttendanceApprovalStates.NotRequired &&
    !merged.some((fact) => fact.kind === existing.approval_kind)
  ) {
    merged.push({
      kind: existing.approval_kind,
      state: normalizeApprovalFactState(existing.approval_state),
    });
  }
  if (merged.length === 0) {
    return {
      approvalKind: existing?.approval_kind ?? AttendanceApprovalKinds.None,
      approvalState: existing?.approval_state ?? AttendanceApprovalStates.NotRequired,
    };
  }
  const kinds = new Set(merged.map((fact) => fact.kind));
  const states = new Set(merged.map((fact) => fact.state));
  return {
    approvalKind: kinds.size === 1 ? merged[0]!.kind : AttendanceApprovalKinds.Multiple,
    approvalState: states.size === 1 ? merged[0]!.state : AttendanceApprovalStates.Mixed,
  };
}

export function projectAttendanceDay(
  input: AttendanceDailyProjectionInput,
): AttendanceDailyProjection {
  const workSeconds = nonNegativeSeconds(input.workSeconds);
  const breakSeconds = nonNegativeSeconds(input.breakSeconds);
  const scheduledSeconds = input.scheduledStartAt && input.scheduledEndAt
    ? secondsBetween(input.scheduledStartAt, input.scheduledEndAt)
    : 0;
  const hasAnyEvidence = Boolean(input.firstCheckIn || input.lastCheckOut || workSeconds > 0);
  const isFuture = input.dayClassification === AttendanceDayClassifications.Future;
  const nonWorking =
    input.dayClassification === AttendanceDayClassifications.Weekend ||
    input.dayClassification === AttendanceDayClassifications.Holiday ||
    input.dayClassification === AttendanceDayClassifications.Leave;
  const presenceState = input.forcePresenceState ?? (
    input.hasOpenSession || input.hasIncompleteEvidence
      ? AttendancePresenceStates.Incomplete
      : input.firstCheckIn && input.lastCheckOut
        ? AttendancePresenceStates.Present
        : hasAnyEvidence
          ? AttendancePresenceStates.Partial
          : isFuture || input.dayClassification === AttendanceDayClassifications.Wfh
            ? AttendancePresenceStates.NotStarted
            : nonWorking
              ? AttendancePresenceStates.NotApplicable
              : AttendancePresenceStates.Absent
  );
  const rawLateSeconds = input.firstCheckIn && input.scheduledStartAt
    ? secondsBetween(input.scheduledStartAt, input.firstCheckIn)
    : 0;
  const lateSeconds = rawLateSeconds > nonNegativeSeconds(input.graceSeconds)
    ? rawLateSeconds
    : 0;
  const earlyDepartureSeconds = !input.hasOpenSession && input.lastCheckOut && input.scheduledEndAt
    ? secondsBetween(input.lastCheckOut, input.scheduledEndAt)
    : 0;
  const punctualityState = derivePunctuality({
    presenceState,
    hasSchedule: Boolean(input.scheduledStartAt && input.scheduledEndAt),
    lateSeconds,
    earlyDepartureSeconds,
  });
  const evidenceState = input.forceEvidenceState ?? (
    presenceState === AttendancePresenceStates.Present
      ? AttendanceEvidenceStates.Complete
      : presenceState === AttendancePresenceStates.Partial || presenceState === AttendancePresenceStates.Incomplete
        ? AttendanceEvidenceStates.Partial
        : presenceState === AttendancePresenceStates.Absent
          ? AttendanceEvidenceStates.Missing
          : presenceState === AttendancePresenceStates.NotApplicable || presenceState === AttendancePresenceStates.NotStarted
            ? AttendanceEvidenceStates.NotApplicable
            : AttendanceEvidenceStates.Unknown
  );
  const approval = mergeAttendanceApprovals(input.approvalFacts ?? [], input.existingApproval);
  const exceptionType = presenceState === AttendancePresenceStates.Absent
    ? "absent"
    : presenceState === AttendancePresenceStates.Partial ||
        (presenceState === AttendancePresenceStates.Incomplete && input.incompleteIsException)
      ? "missing_punch"
      : punctualityState === AttendancePunctualityStates.Late || punctualityState === AttendancePunctualityStates.LateAndEarlyDeparture
        ? "late"
        : punctualityState === AttendancePunctualityStates.EarlyDeparture
          ? "early_out"
          : null;
  const status = deriveLegacyAttendanceStatus({
    dayClassification: input.dayClassification,
    presenceState,
    punctualityState,
    approvalKind: approval.approvalKind,
    approvalState: approval.approvalState,
    workMode: input.workMode,
  });
  return {
    company_id: input.companyId,
    employee_user_id: input.employeeUserId,
    work_date: input.workDate,
    status,
    day_classification: input.dayClassification,
    presence_state: presenceState,
    punctuality_state: punctualityState,
    evidence_state: evidenceState,
    approval_kind: approval.approvalKind,
    approval_state: approval.approvalState,
    payroll_state: AttendancePayrollStates.Unprocessed as AttendancePayrollState,
    first_check_in: input.firstCheckIn,
    last_check_out: input.lastCheckOut,
    work_minutes: secondsToLegacyMinutes(workSeconds),
    break_minutes: secondsToLegacyMinutes(breakSeconds),
    late_minutes: secondsToLegacyMinutes(lateSeconds),
    early_out_minutes: secondsToLegacyMinutes(earlyDepartureSeconds),
    work_seconds: workSeconds,
    break_seconds: breakSeconds,
    scheduled_seconds: scheduledSeconds,
    late_seconds: lateSeconds,
    early_departure_seconds: earlyDepartureSeconds,
    work_mode: input.workMode,
    note: input.note ?? null,
    exception_type: exceptionType,
    regularization_status:
      input.approvalFacts?.find((fact) => fact.kind === AttendanceApprovalKinds.Regularization)?.state ??
      input.regularizationStatus ??
      null,
  };
}

function derivePunctuality(input: {
  presenceState: AttendancePresenceState;
  hasSchedule: boolean;
  lateSeconds: number;
  earlyDepartureSeconds: number;
}): AttendancePunctualityState {
  if (
    input.presenceState === AttendancePresenceStates.NotApplicable ||
    input.presenceState === AttendancePresenceStates.NotStarted ||
    input.presenceState === AttendancePresenceStates.Absent
  ) return AttendancePunctualityStates.NotApplicable;
  if (!input.hasSchedule) return AttendancePunctualityStates.Unknown;
  if (input.lateSeconds > 0 && input.earlyDepartureSeconds > 0) {
    return AttendancePunctualityStates.LateAndEarlyDeparture;
  }
  if (input.lateSeconds > 0) return AttendancePunctualityStates.Late;
  if (input.earlyDepartureSeconds > 0) return AttendancePunctualityStates.EarlyDeparture;
  return AttendancePunctualityStates.OnTime;
}

function normalizeApprovalFactState(
  state: AttendanceApprovalState,
): AttendanceApprovalFact["state"] {
  if (
    state === AttendanceApprovalStates.Pending ||
    state === AttendanceApprovalStates.Approved ||
    state === AttendanceApprovalStates.Returned ||
    state === AttendanceApprovalStates.Rejected
  ) return state;
  return AttendanceApprovalStates.Pending;
}

function nonNegativeSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
