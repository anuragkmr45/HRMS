import { asArray, asRecord, numberValue, text } from "@/shared/api";
import type { AttendancePunchEventType } from "./api";

export type AttendanceSessionState = "not_started" | "open" | "on_break" | "completed";
export type AttendanceContextSource = "v1_summary_compat" | "context_api";

export interface EmployeeAttendanceContext {
  source: AttendanceContextSource;
  serverTime: string | null;
  workDate: string;
  status: string;
  statusLabel: string;
  sessionState: AttendanceSessionState;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  inTime: string | null;
  outTime: string | null;
  baseWorkMinutes: number;
  baseBreakMinutes: number;
  targetWorkMinutes: number;
  allowedActions: AttendancePunchEventType[];
  blockedReason: string | null;
  blockedActionReasons: Partial<Record<AttendancePunchEventType, string>>;
  workMode: string | null;
  isReady: boolean;
}

export interface LiveAttendanceContext {
  workMinutes: number;
  breakMinutes: number;
}

const ATTENDANCE_ACTIONS = new Set<AttendancePunchEventType>([
  "check_in",
  "break_start",
  "break_end",
  "check_out",
]);

function attendanceActions(value: unknown): AttendancePunchEventType[] {
  return Array.from(
    new Set(
      asArray(value)
        .map((item) => text(item))
        .filter((item): item is AttendancePunchEventType =>
          ATTENDANCE_ACTIONS.has(item as AttendancePunchEventType),
        ),
    ),
  );
}

function optionalText(value: unknown): string | null {
  const parsed = text(value).trim();
  return parsed || null;
}

function isIsoDateTime(value: string | null): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function blockedActionReasons(value: unknown): Partial<Record<AttendancePunchEventType, string>> {
  const record = asRecord(value);
  const result: Partial<Record<AttendancePunchEventType, string>> = {};

  for (const action of ATTENDANCE_ACTIONS) {
    const reason = optionalText(record[action]);
    if (reason) result[action] = reason;
  }

  return result;
}

function sessionState(
  firstCheckIn: string | null,
  lastCheckOut: string | null,
  allowedActions: AttendancePunchEventType[],
): AttendanceSessionState {
  if (firstCheckIn && !lastCheckOut) {
    return allowedActions.includes("break_end") ? "on_break" : "open";
  }
  if (lastCheckOut) return "completed";
  return "not_started";
}

function fallbackStatusLabel(
  state: AttendanceSessionState,
  status: string,
  detail: string,
): string {
  if (state === "open") return "Working";
  if (state === "on_break") return "On break";
  if (state === "completed") return "Completed";
  if (detail) return detail;
  if (status) {
    return status.replaceAll("_", " ").replace(/\b\w/gu, (character) => character.toUpperCase());
  }
  return "Not started";
}

/**
 * Compatibility boundary for the current v1 summary response.
 * Remove this adapter when the dedicated attendance context endpoint is available.
 */
export function employeeAttendanceContextFromSummary(input: unknown): EmployeeAttendanceContext {
  const data = asRecord(input);
  const today = asRecord(data.today);
  const policy = asRecord(today.punch_policy);
  const serverTime = optionalText(data.generated_at);
  const workDate = text(today.work_date);
  const firstCheckIn = optionalText(today.first_check_in);
  const lastCheckOut = optionalText(today.last_check_out);
  const allowedActions = attendanceActions(today.next_allowed_actions);
  const state = sessionState(firstCheckIn, lastCheckOut, allowedActions);
  const status = text(today.status);
  const detail = text(today.detail);

  return {
    source: "v1_summary_compat",
    serverTime: isIsoDateTime(serverTime) ? serverTime : null,
    workDate,
    status,
    statusLabel: fallbackStatusLabel(state, status, detail),
    sessionState: state,
    firstCheckIn,
    lastCheckOut,
    inTime: optionalText(today.in_time),
    outTime: optionalText(today.out_time),
    baseWorkMinutes: Math.max(0, numberValue(today.work_minutes)),
    baseBreakMinutes: Math.max(0, numberValue(today.break_minutes)),
    targetWorkMinutes: Math.max(
      0,
      numberValue(
        today.target_work_minutes,
        numberValue(asRecord(data.summary).target_work_minutes),
      ),
    ),
    allowedActions,
    blockedReason: optionalText(policy.blocked_reason),
    blockedActionReasons: blockedActionReasons(policy.blocked_action_reasons),
    workMode: optionalText(today.work_mode),
    isReady: isIsoDateTime(serverTime) && isIsoDate(workDate),
  };
}

export function liveAttendanceContext(
  context: EmployeeAttendanceContext,
  currentServerTime: Date,
): LiveAttendanceContext {
  const generatedAtMs = context.serverTime ? Date.parse(context.serverTime) : Number.NaN;
  const elapsedMinutes = Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((currentServerTime.getTime() - generatedAtMs) / 60_000))
    : 0;

  return {
    workMinutes: context.baseWorkMinutes + (context.sessionState === "open" ? elapsedMinutes : 0),
    breakMinutes:
      context.baseBreakMinutes + (context.sessionState === "on_break" ? elapsedMinutes : 0),
  };
}
