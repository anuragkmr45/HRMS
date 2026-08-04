import { randomUUID } from "node:crypto";
import type {
  AttendanceDayRecord,
  AttendanceDayStatus,
  AttendanceLocationEvidenceInput,
  AttendancePunch,
  AttendancePunchEventType,
  AttendancePublicPunchSourceChannel,
  AttendanceRegularizationRequest,
  AttendanceRegularizationRequestItem,
  AuthUser,
  CoreUser,
  UUID,
} from "#shared";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  AttendancePresenceStates,
  AttendancePunctualityStates,
  AttendancePunchEventTypes,
  AttendanceRegularizationStatuses,
  ErrorCodes,
  EmploymentStatuses,
  Roles,
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import {
  assertUserInCompanyMembershipContext,
  resolveActiveCompanyMembershipContext,
  type ActiveCompanyMembershipContext,
} from "../../platform/company-membership-context.js";
import {
  AppError,
  badRequest,
  companyContextRequired,
  conflict,
  forbidden,
  missingRemarks,
  notFound,
} from "../../platform/errors.js";
import {
  createGeneratedExportDocument,
  type GeneratedExportFormat,
} from "../../platform/generated-exports.js";
import { isWorkingDate } from "../../platform/work-schedule.js";
import { CoreService } from "../core/service.js";
import {
  appendAttendanceOutboxEvent,
  buildMissingCheckoutDetectedEvent,
  buildExportRequestedEvent,
  buildPunchRecordedEvent,
  buildRegularizationDecisionEvent,
  buildRegularizationSubmittedEvent,
} from "./events.js";
import {
  assertCanDecideRegularization,
  assertCanAssistCurrentPunch,
  assertCanCreateHistoricalCorrection,
  assertCanSeeAttendanceUser,
  assertCanUseSelfAttendance,
  canManageAllAttendance,
  canSeeAllAttendance,
  canSeeAttendanceUser,
} from "./policy.js";
import { AttendanceRepository } from "./repository.js";
import { PostgresGeofenceRepository } from "./geofence-repository.js";
import {
  AttendanceCommandService,
  canonicalAttendanceRequestHash,
  type AttendanceCommandEnvelopeInput,
} from "./command-service.js";
import {
  normalizeAttendancePolicyConfig,
  type AttendanceMode,
  type NormalizedAttendanceGeoPolicyAction,
} from "./policy-config.js";
import { resolveEmployeeShift } from "./shift-resolver.js";
import {
  deriveLegacyAttendanceStatus,
  mergeAttendanceApprovals,
  matchesLegacyAttendanceStatus,
  projectAttendanceDay,
  secondsBetween,
  type AttendanceApprovalFact,
} from "./daily-projection.js";

export interface AttendancePageQuery {
  page: number;
  page_size: number;
  sort?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  month?: string;
  company_id?: UUID | null;
  user_id?: UUID;
  department_id?: UUID;
  status?: string;
  exception_type?: string;
}

type RegularizationItemInput = Pick<
  AttendanceRegularizationRequestItem,
  "operation" | "target_punch_event_id" | "event_type" | "occurred_at"
>;

interface RegularizationCreateInput {
  work_date: string;
  reason: string;
  requested_punches?: Array<{
    event_type: AttendancePunchEventType;
    occurred_at: string;
  }>;
  items?: Array<
    | { operation: "add"; event_type: AttendancePunchEventType; occurred_at: string }
    | { operation: "replace"; target_punch_event_id: UUID; event_type: AttendancePunchEventType; occurred_at: string }
    | { operation: "void"; target_punch_event_id: UUID }
  >;
}

export interface AttendanceExportInput {
  company_id?: UUID | null;
  filters?: {
    user_id?: UUID;
    employee_user_id?: UUID;
    department_id?: UUID;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
  columns?: string[];
  format?: "csv" | "xlsx" | "json";
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: pageNumber,
    page_size: pageSize,
    total: items.length,
  };
}

function todayDate(timeZone = "UTC"): string {
  return dateInTimeZone(nowIso(), timeZone);
}

function dateInTimeZone(value: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to UTC below.
  }
  return value.slice(0, 10);
}

function monthRange(
  monthInput?: string,
  timeZone = "UTC",
): { month: string; from: string; to: string } {
  const month =
    monthInput && /^\d{4}-\d{2}$/u.test(monthInput)
      ? monthInput
      : todayDate(timeZone).slice(0, 7);
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month,
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function dateRange(
  query: AttendancePageQuery,
  timeZone = "UTC",
): { from: string; to: string } {
  if (query.month) {
    const range = monthRange(query.month, timeZone);
    return { from: range.from, to: range.to };
  }
  return {
    from: query.date_from ?? todayDate(timeZone).slice(0, 7) + "-01",
    to: query.date_to ?? todayDate(timeZone),
  };
}

function minutesBetween(start: string, end: string): number {
  return Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
  );
}

function clockIso(workDate: string, hour: number, minute: number): string {
  return `${workDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function zonedClockIso(
  workDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): string {
  const [yearText, monthText, dayText] = workDate.split("-");
  const utcGuess = new Date(
    Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      hour,
      minute,
    ),
  );
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(utcGuess);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(map.get("year")),
      Number(map.get("month")) - 1,
      Number(map.get("day")),
      Number(map.get("hour")),
      Number(map.get("minute")),
      Number(map.get("second")),
    );
    const desiredUtc = Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      hour,
      minute,
      0,
    );
    return new Date(
      utcGuess.getTime() - (renderedAsUtc - desiredUtc),
    ).toISOString();
  } catch {
    return clockIso(workDate, hour, minute);
  }
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function minutesOfDay(clock: string): number {
  const [hourText, minuteText] = clock.split(":");
  return Number(hourText) * 60 + Number(minuteText);
}

function withinClockWindow(clock: string, start: string, end: string): boolean {
  const current = minutesOfDay(clock);
  const startMinute = minutesOfDay(start);
  const endMinute = minutesOfDay(end);
  if (startMinute <= endMinute) {
    return current >= startMinute && current <= endMinute;
  }
  return current >= startMinute || current <= endMinute;
}

function minutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function minutesToText(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${hours}h`;
}

function timeText(value: string | null, timeZone: string): string | null {
  if (!value) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  } catch {
    return value.slice(11, 16);
  }
}

function userLabel(user: CoreUser | undefined): {
  employee_code: string;
  full_name: string;
} {
  return {
    employee_code: user?.employee_code ?? "UNKNOWN",
    full_name: user?.full_name ?? "Unknown employee",
  };
}

function visibleUserPredicate(actor: AuthUser, user: CoreUser): boolean {
  return !user.deleted_at && canSeeAttendanceUser(actor, user);
}

interface AttendancePunchPolicy {
  graceMinutes: number;
  autoMarkAbsentMinutes: number;
  fullDayPunchWindow: boolean;
  punchInStart: string;
  punchInEnd: string;
  punchOutStart: string;
  punchOutEnd: string;
  autoPunchOutEnabled: boolean;
  autoPunchOutTime: string;
  allowOffDayPunches: boolean;
  attendanceMode: AttendanceMode;
  fallbackApprovalMode: "disabled" | "approval_required";
  regularizationMode: "disabled" | "approval_required";
  locationUnavailableAction: NormalizedAttendanceGeoPolicyAction;
  permissionDeniedAction: NormalizedAttendanceGeoPolicyAction;
  outsideFenceAction: NormalizedAttendanceGeoPolicyAction;
  boundaryUncertainAction: NormalizedAttendanceGeoPolicyAction;
  staleEvidenceAction: NormalizedAttendanceGeoPolicyAction;
  accuracyExceededAction: NormalizedAttendanceGeoPolicyAction;
  effectiveGeofenceId: UUID | null;
  effectiveGeofenceIds: UUID[];
  geofenceGraceMeters: number;
  maxLocationAgeMs: number | null;
  maxAccuracyMeters: number | null;
  policyVersion: string;
}

interface PunchAvailability {
  policy: AttendancePunchPolicy;
  sequence_allowed_actions: AttendancePunchEventType[];
  next_allowed_actions: AttendancePunchEventType[];
  blocked_action_reasons: Partial<Record<AttendancePunchEventType, string>>;
  blocked_reason: string | null;
  local_time: string;
  is_company_working_day: boolean;
}

export interface AttendanceAutoPunchOutClosure {
  company_id: UUID;
  employee_user_id: UUID;
  work_date: string;
  first_check_in_id: UUID;
  first_check_in_at: string;
  last_open_punch_id: UUID;
  closed_at: string;
  created_punches: AttendancePunch[];
  day_record: AttendanceDayRecord | null;
}

export interface AttendanceAutoPunchOutRunResult {
  reference_iso: string;
  scanned_users: number;
  closed_sessions: number;
  punches_created: number;
  day_records_recomputed: number;
  closures: AttendanceAutoPunchOutClosure[];
}

type EmployeePunchSource = AttendancePublicPunchSourceChannel;

type EmployeePunchPostgresInput = {
  event_type: AttendancePunchEventType;
  occurred_at?: string;
  work_mode: "office" | "remote" | "wfh" | "field";
  source: EmployeePunchSource;
  metadata: Record<string, unknown>;
  location?: AttendanceLocationEvidenceInput;
  idempotency_key: string;
};

function employeePunchSource(source: EmployeePunchSource): EmployeePunchSource {
  switch (source) {
    case "web":
    case "web_geo":
    case "mobile":
    case "kiosk":
      return source;
    default:
      return assertNeverSource(source);
  }
}

function assertNeverSource(value: never): never {
  throw badRequest("Unsupported attendance punch source.", { source: String(value) });
}

export class AttendanceService {
  private readonly repository: AttendanceRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new AttendanceRepository(store);
    this.core = new CoreService(store);
  }

  private recordPunchInMemory(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at?: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: AttendancePunch["source"];
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      idempotency_key?: string;
    },
    subjectEmployeeUserId = actor.id,
    origin: AttendancePunch["origin"] = "employee_manual_now",
  ) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.punch",
    );
    if (subjectEmployeeUserId === actor.id) {
      assertCanUseSelfAttendance(actor);
    }
    const companyId = context.companyId;
    const occurredAt = input.occurred_at ?? nowIso();
    const timeZone = this.timezoneForUser(subjectEmployeeUserId, companyId);
    this.autoPunchOutExpiredSessions(companyId, subjectEmployeeUserId, timeZone, occurredAt);
    const workDate = this.workDateForPunch(
      companyId,
      subjectEmployeeUserId,
      input.event_type,
      occurredAt,
      timeZone,
    );
    const availability = this.punchAvailability(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
      occurredAt,
    );
    if (!availability.next_allowed_actions.includes(input.event_type)) {
      const policyReason =
        availability.blocked_action_reasons[input.event_type];
      if (
        availability.sequence_allowed_actions.includes(input.event_type) &&
        policyReason
      ) {
        throw badRequest(policyReason, {
          next_allowed_actions: availability.next_allowed_actions,
          requested_action: input.event_type,
          punch_policy: this.presentPunchPolicy(availability),
        });
      }
      throw conflict("Attendance punch is duplicate or out of sequence.", {
        next_allowed_actions: availability.next_allowed_actions,
        requested_action: input.event_type,
      });
    }
    const punch = this.repository.addPunch({
      company_id: companyId,
      employee_user_id: subjectEmployeeUserId,
      actor_user_id: actor.id,
      event_type: input.event_type,
      occurred_at: occurredAt,
      work_mode: input.work_mode,
      source: input.source,
      origin,
      metadata: input.metadata,
    });
    const day = this.recomputeDay(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
      occurredAt,
    );
    appendAttendanceOutboxEvent(
      this.store,
      buildPunchRecordedEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId,
        punchEventId: punch.id,
        punchType: punch.event_type,
        occurredAt: punch.occurred_at,
        workDate,
        workMode: punch.work_mode,
        sourceChannel: punch.source,
        origin,
        dayStatus: day.status,
      }),
    );
    const nextAvailability = this.punchAvailability(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
      occurredAt,
    );
    return {
      punch_id: punch.id,
      punch,
      day_status: this.presentDay(day, timeZone),
      next_allowed_actions: nextAvailability.next_allowed_actions,
      next_allowed_action: nextAvailability.next_allowed_actions[0] ?? null,
      punch_policy: this.presentPunchPolicy(nextAvailability),
    };
  }

  /**
   * Compatibility seam for pre-command unit tests. Production handlers never
   * call this method; the explicit command methods below are the only runtime
   * attendance mutation boundaries.
   */
  punch(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at?: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: AttendancePunch["source"];
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      idempotency_key?: string;
    },
    subjectEmployeeUserId = actor.id,
    origin: AttendancePunch["origin"] = "employee_manual_now",
  ) {
    if (process.env.NODE_ENV !== "test") {
      throw forbidden("Use an explicit attendance command boundary.");
    }
    return this.recordPunchInMemory(actor, input, subjectEmployeeUserId, origin);
  }

  recordEmployeeManualNow(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: EmployeePunchSource;
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      idempotency_key?: string;
    },
  ) {
    return this.recordPunchInMemory(
      actor,
      { ...input, occurred_at: nowIso(), source: employeePunchSource(input.source) },
      actor.id,
      "employee_manual_now",
    );
  }

  recordManagerAssistedCurrentPunch(
    actor: AuthUser,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      reason?: string;
    },
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.assisted_current_punch",
    ).companyId;
    const subject = this.requireUser(subjectEmployeeUserId);
    this.assertTargetUserInCompany(subject.id, companyId, {
      operation: "attendance.assisted_current_punch.target_employee",
      requireActiveEmployment: true,
    });
    assertCanAssistCurrentPunch(actor, subject);
    return this.recordPunchInMemory(
      actor,
      { event_type: input.event_type, work_mode: input.work_mode, metadata: { ...input.metadata, ...(input.reason ? { assisted_reason: input.reason } : {}) }, occurred_at: nowIso(), source: "admin", location: input.location },
      subject.id,
      "manager_assisted_now",
    );
  }

  listMyPunches(actor: AuthUser, query: AttendancePageQuery) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.list_my_punches",
      query.company_id,
    );
    assertCanUseSelfAttendance(actor);
    const companyId = context.companyId;
    const timeZone = this.timezoneForUser(actor.id, companyId);
    this.autoPunchOutExpiredSessions(companyId, actor.id, timeZone);
    const range = dateRange(query, timeZone);
    const punches = this.repository
      .listPunches(companyId, actor.id, range.from, range.to, timeZone)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return page(
      punches.map((punch) => this.presentPunch(punch, timeZone)),
      query.page,
      query.page_size,
    );
  }

  mySummary(actor: AuthUser, query: AttendancePageQuery) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.my_summary",
      query.company_id,
    );
    assertCanUseSelfAttendance(actor);
    const companyId = context.companyId;
    const timeZone = this.timezoneForUser(actor.id, companyId);
    const range = dateRange(query, timeZone);
    const today = this.resolveDay(
      companyId,
      actor.id,
      todayDate(timeZone),
      timeZone,
    );
    const availabilityWorkDate =
      this.openSessionWorkDate(companyId, actor.id, nowIso(), timeZone) ??
      today.work_date;
    const todayPunchAvailability = this.punchAvailability(
      companyId,
      actor.id,
      availabilityWorkDate,
      timeZone,
    );
    const records = this.recordsForUsers(
      companyId,
      new Set([actor.id]),
      range.from,
      range.to,
    ).map((record) =>
      record.employee_user_id === actor.id &&
      record.work_date === today.work_date
        ? today
        : record,
    );
    const weekRecords = this.weekRecords(companyId, actor.id, timeZone);
    const weeklyBalance = this.weeklyBalance(companyId, weekRecords);
    const targetWorkMinutes = this.targetWorkMinutes(companyId);
    const exceptionHistory = records
      .filter((record) => record.exception_type || record.regularization_status)
      .sort((a, b) => b.work_date.localeCompare(a.work_date))
      .slice(0, 10)
      .map((record) => ({
        date: record.work_date,
        reason: this.exceptionDetail(record),
        status: record.regularization_status ?? record.status,
      }));
    return {
      generated_at: nowIso(),
      range,
      today: {
        ...this.presentDay(today, timeZone),
        target_work_minutes: targetWorkMinutes,
        target_hours: minutesToHours(targetWorkMinutes),
        next_allowed_actions: todayPunchAvailability.next_allowed_actions,
        next_allowed_action:
          todayPunchAvailability.next_allowed_actions[0] ?? null,
        punch_policy: this.presentPunchPolicy(todayPunchAvailability),
      },
      summary: {
        ...this.daySummary(records),
        target_work_minutes: targetWorkMinutes,
        target_hours: minutesToHours(targetWorkMinutes),
        weekly_balance: weeklyBalance,
      },
      week_records: weekRecords.map((record) =>
        this.presentDay(record, timeZone),
      ),
      weekly_balance: weeklyBalance,
      exception_history: exceptionHistory,
    };
  }

  teamSummary(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.team_summary",
      query.company_id,
    ).companyId;
    const date =
      query.date_from ?? todayDate(this.timezoneForUser(actor.id, companyId));
    const visibleUsers = this.visibleUsers(
      actor,
      companyId,
      query.department_id,
    );
    const activeUsers = visibleUsers.filter(
      (user) => user.employment_status === EmploymentStatuses.Active,
    );
    const records = activeUsers.map((user) =>
      this.resolveDay(
        companyId,
        user.id,
        date,
        this.timezoneForUser(user.id, companyId),
      ),
    );
    const exceptions = this.exceptionsForCompany(
      actor,
      {
        ...query,
        page: 1,
        page_size: 8,
        date_from: date,
        date_to: date,
      },
      companyId,
    ).items;
    return {
      generated_at: nowIso(),
      date,
      totals: this.teamTotals(records, activeUsers.length),
      department_summary: this.departmentSummary(records, activeUsers),
      exceptions,
    };
  }

  monthlyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.monthly_calendar",
      query.company_id,
    );
    const user = query.user_id
      ? this.requireUser(query.user_id)
      : this.requireUser(actor.id);
    const companyId = context.companyId;
    if (user.id === actor.id) {
      assertCanUseSelfAttendance(actor);
    }
    assertCanSeeAttendanceUser(actor, user);
    this.assertTargetUserInCompany(user.id, companyId, {
      operation: "attendance.monthly_calendar.target_employee",
      requireActiveEmployment: false,
    });
    const timeZone = this.timezoneForUser(user.id, companyId);
    const range = monthRange(query.month, timeZone);
    const days = new Date(`${range.to}T00:00:00.000Z`).getUTCDate();
    const calendarDays = Array.from({ length: days }, (_, index) => {
      const date = `${range.month}-${String(index + 1).padStart(2, "0")}`;
      return this.presentDay(
        this.resolveDay(companyId, user.id, date, timeZone),
        timeZone,
      );
    });
    return {
      generated_at: nowIso(),
      month: range.month,
      user: userLabel(user),
      calendar_days: calendarDays,
      summary: this.daySummary(calendarDays),
    };
  }

  dailyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.daily_calendar",
      query.company_id,
    ).companyId;
    const date =
      query.date ??
      query.date_from ??
      todayDate(this.timezoneForUser(actor.id, companyId));
    const users = query.user_id
      ? [this.requireUser(query.user_id)]
      : this.visibleUsers(actor, companyId, query.department_id);
    for (const user of users) {
      assertCanSeeAttendanceUser(actor, user);
      this.assertTargetUserInCompany(user.id, companyId, {
        operation: "attendance.daily_calendar.target_employee",
        requireActiveEmployment: false,
      });
    }
    const activeUsers = users.filter(
      (user) => user.employment_status === EmploymentStatuses.Active,
    );
    const userIds = new Set(activeUsers.map((user) => user.id));
    const records = activeUsers.map((user) =>
      this.resolveDay(
        companyId,
        user.id,
        date,
        this.timezoneForUser(user.id, companyId),
      ),
    );
    const regularizations = this.repository.listRegularizations({
      companyIds: new Set([companyId]),
      userIds,
      dateFrom: date,
      dateTo: date,
    });
    const regularizationByUser = new Map(
      regularizations.map((request) => [request.employee_user_id, request]),
    );
    const items = records
      .map((record) => {
        const user = activeUsers.find(
          (candidate) => candidate.id === record.employee_user_id,
        );
        const request = regularizationByUser.get(record.employee_user_id);
        const timeZone = this.timezoneForUser(
          record.employee_user_id,
          companyId,
        );
        return {
          ...this.presentDay(record, timeZone),
          employee: userLabel(user),
          regularization: request ? this.presentRegularization(request) : null,
          regularization_pending:
            request?.status === AttendanceRegularizationStatuses.Pending,
          can_decide_regularization: Boolean(
            request &&
            request.status === AttendanceRegularizationStatuses.Pending &&
            actor.id !== request.employee_user_id &&
            (canSeeAllAttendance(actor) ||
              request.current_approver_user_id === actor.id),
          ),
        };
      })
      .sort((a, b) =>
        a.employee.employee_code.localeCompare(b.employee.employee_code),
      );
    return {
      ...page(items, query.page, query.page_size),
      generated_at: nowIso(),
      date,
      summary: this.daySummary(records),
      exceptions: this.exceptionsForCompany(
        actor,
        {
          ...query,
          page: 1,
          page_size: 20,
          date_from: date,
          date_to: date,
        },
        companyId,
      ).items,
      totals: this.teamTotals(records, activeUsers.length),
    };
  }

  createRegularization(
    actor: AuthUser,
    input: RegularizationCreateInput,
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.create_regularization",
    ).companyId;
    const manager = this.core.resolveImmediateManager(actor.id);
    const approver =
      manager && this.isUserInCompany(manager.id, companyId)
        ? manager
        : this.adminFallback(companyId);
    const items = this.normalizeRegularizationItems(input);
    this.validateRegularizationItems(
      companyId,
      actor.id,
      input.work_date,
      this.timezoneForUser(actor.id, companyId),
      items,
    );
    const request = this.repository.addRegularization({
      company_id: companyId,
      employee_user_id: actor.id,
      submitted_by_user_id: actor.id,
      work_date: input.work_date,
      reason: input.reason.trim(),
      items,
      status: AttendanceRegularizationStatuses.Pending,
      current_approver_user_id: approver?.id ?? null,
    });
    const day = this.resolveDay(
      companyId,
      actor.id,
      input.work_date,
      this.timezoneForUser(actor.id, companyId),
    );
    day.regularization_status = AttendanceRegularizationStatuses.Pending;
    const pendingApproval = mergeAttendanceApprovals(
      [{ kind: AttendanceApprovalKinds.Regularization, state: AttendanceApprovalStates.Pending }],
      day,
    );
    day.approval_kind = pendingApproval.approvalKind;
    day.approval_state = pendingApproval.approvalState;
    day.updated_at = nowIso();
    day.version += 1;
    appendAttendanceOutboxEvent(
      this.store,
      buildRegularizationSubmittedEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId: actor.id,
        regularizationRequestId: request.id,
        assignedApproverUserId: request.current_approver_user_id,
        workDate: request.work_date,
        status: request.status,
        version: request.version,
      }),
    );
    return this.presentRegularization(request);
  }

  myRegularizations(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.my_regularizations",
      query.company_id,
    ).companyId;
    const range = dateRange(query, this.timezoneForUser(actor.id, companyId));
    const requests = this.repository.listRegularizations({
      companyIds: new Set([companyId]),
      userIds: new Set([actor.id]),
      status: query.status,
      dateFrom: range.from,
      dateTo: range.to,
    });
    return page(
      requests.map((request) => this.presentRegularization(request)),
      query.page,
      query.page_size,
    );
  }

  managerRegularizationQueue(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.manager_regularization_queue",
      query.company_id,
    ).companyId;
    if (
      !canSeeAllAttendance(actor) &&
      !this.hasVisibleSubordinates(actor, companyId)
    ) {
      throw forbidden(
        "Only managers, HR, Admin, or Auditor users can read attendance regularization queues.",
      );
    }
    const range = dateRange(query, this.timezoneForUser(actor.id, companyId));
    const visibleUsers = this.visibleUsers(
      actor,
      companyId,
      query.department_id,
    ).filter((user) => user.id !== actor.id);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const scoped = this.repository
      .listRegularizations({
        companyIds: new Set([companyId]),
        userIds: visibleUserIds,
        dateFrom: range.from,
        dateTo: range.to,
      })
      .filter(
        (request) =>
          canSeeAllAttendance(actor) ||
          request.current_approver_user_id === actor.id,
      );
    const status = query.status ?? AttendanceRegularizationStatuses.Pending;
    const filtered = scoped.filter(
      (request) => !status || request.status === status,
    );
    return {
      ...page(
        filtered.map((request) => this.presentRegularization(request)),
        query.page,
        query.page_size,
      ),
      queue_counts: this.regularizationQueueCounts(scoped),
    };
  }

  exceptions(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.exceptions",
      query.company_id,
    ).companyId;
    return this.exceptionsForCompany(actor, query, companyId);
  }

  private exceptionsForCompany(
    actor: AuthUser,
    query: AttendancePageQuery,
    companyId: UUID,
  ) {
    const actorTimeZone = this.timezoneForUser(actor.id, companyId);
    const range = {
      from: query.date_from ?? todayDate(actorTimeZone).slice(0, 7) + "-01",
      to: query.date_to ?? todayDate(actorTimeZone),
    };
    const visibleUsers = this.visibleUsers(
      actor,
      companyId,
      query.department_id,
    );
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const regularizations = this.repository.listRegularizations({
      companyIds: new Set([companyId]),
      userIds: visibleUserIds,
      status: AttendanceRegularizationStatuses.Pending,
      dateFrom: range.from,
      dateTo: range.to,
    });
    const regularizationByUserDate = new Map(
      regularizations.map((request) => [
        `${request.employee_user_id}:${request.work_date}`,
        request,
      ]),
    );
    for (const user of visibleUsers) {
      const timeZone = this.timezoneForUser(user.id, companyId);
      for (const date of datesInclusive(range.from, range.to)) {
        this.resolveDay(companyId, user.id, date, timeZone);
      }
    }
    const dayExceptions = this.repository
      .listDayRecords({
        companyIds: new Set([companyId]),
        userIds: visibleUserIds,
        dateFrom: range.from,
        dateTo: range.to,
      })
      .filter(
        (record) =>
          record.exception_type ||
          record.regularization_status ===
            AttendanceRegularizationStatuses.Pending,
      )
      .map((record) =>
        this.presentException(
          record,
          regularizationByUserDate.get(
            `${record.employee_user_id}:${record.work_date}`,
          ),
          actor,
        ),
      );
    const requestExceptions = regularizations
      .filter(
        (request) =>
          !dayExceptions.some(
            (exception) => exception.request_id === request.id,
          ),
      )
      .map((request) =>
        this.presentException(
          this.resolveDay(
            companyId,
            request.employee_user_id,
            request.work_date,
          ),
          request,
          actor,
        ),
      );
    const items = [...dayExceptions, ...requestExceptions]
      .filter(
        (exception) =>
          !query.exception_type ||
          exception.exception_type === query.exception_type,
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const result = page(items, query.page, query.page_size);
    return {
      ...result,
      totals: {
        late: items.filter((item) => item.exception_type === "late").length,
        missing_punch: items.filter(
          (item) => item.exception_type === "missing_punch",
        ).length,
        absent: items.filter((item) => item.exception_type === "absent").length,
        correction: items.filter((item) => item.exception_type === "correction")
          .length,
      },
    };
  }

  decideRegularization(
    actor: AuthUser,
    id: UUID,
    input: {
      decision: "approve" | "reject" | "return";
      remarks?: string;
      expected_version: number;
    },
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.decide_regularization",
    ).companyId;
    const current = this.repository.findRegularization(
      id,
      new Set([companyId]),
    );
    this.assertTargetUserInCompany(current.employee_user_id, companyId, {
      operation: "attendance.decide_regularization.target_employee",
      requireActiveEmployment: false,
    });
    if (current.version !== input.expected_version) {
      throw conflict(
        "Attendance regularization request was modified by another actor.",
        {
          aggregate: "attendance_regularization",
          id,
        },
      );
    }
    assertCanDecideRegularization(actor, current);
    if (
      ["reject", "return"].includes(input.decision) &&
      !input.remarks?.trim()
    ) {
      throw missingRemarks(input.decision);
    }
    const previousStatus = current.status;
    if (previousStatus !== AttendanceRegularizationStatuses.Pending) {
      throw conflict(
        "Only pending attendance regularization requests can be decided.",
        {
          request_id: id,
          status: previousStatus,
        },
      );
    }
    const nextStatus =
      input.decision === "approve"
        ? AttendanceRegularizationStatuses.Approved
        : input.decision === "reject"
          ? AttendanceRegularizationStatuses.Rejected
          : AttendanceRegularizationStatuses.Returned;
    this.validateRegularizationItems(
      companyId,
      current.employee_user_id,
      current.work_date,
      this.timezoneForUser(current.employee_user_id, companyId),
      current.items,
    );
    const request = this.repository.updateRegularizationVersioned(
      id,
      new Set([companyId]),
      input.expected_version,
      (candidate) => {
        candidate.status = nextStatus;
        candidate.current_approver_user_id = null;
        candidate.decision_remarks = input.remarks?.trim() ?? null;
        candidate.decided_by_user_id = actor.id;
        candidate.decided_at = nowIso();
      },
    );
    const action = this.repository.appendRegularizationAction({
      company_id: companyId,
      regularization_request_id: request.id,
      actor_user_id: actor.id,
      subject_employee_user_id: request.employee_user_id,
      action_kind: nextStatus,
      previous_state: previousStatus,
      resulting_state: nextStatus,
      remarks: request.decision_remarks,
      resulting_version: request.version,
      occurred_at: request.decided_at!,
      migration_reconstructed: false,
    });
    if (input.decision === "approve") {
      this.applyApprovedRegularizationItems(request, action.id, actor);
    }
    const requestTimeZone = this.timezoneForUser(
      request.employee_user_id,
      companyId,
    );
    const day = this.resolveDay(
      companyId,
      request.employee_user_id,
      request.work_date,
      requestTimeZone,
    );
    day.regularization_status = nextStatus;
    const decidedApproval = mergeAttendanceApprovals(
      [{ kind: AttendanceApprovalKinds.Regularization, state: nextStatus }],
      day.approval_kind === AttendanceApprovalKinds.Regularization
        ? null
        : day,
    );
    day.approval_kind = decidedApproval.approvalKind;
    day.approval_state = decidedApproval.approvalState;
    if (
      nextStatus === AttendanceRegularizationStatuses.Approved &&
      day.exception_type
    ) {
      day.exception_type = null;
      day.note = "Regularized";
    }
    day.status = deriveLegacyAttendanceStatus({
      dayClassification: day.day_classification,
      presenceState: day.presence_state,
      punctualityState: day.punctuality_state,
      approvalKind: day.approval_kind,
      approvalState: day.approval_state,
      workMode: day.work_mode,
    });
    day.updated_at = nowIso();
    day.version += 1;
    appendAttendanceOutboxEvent(
      this.store,
      buildRegularizationDecisionEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId: request.employee_user_id,
        regularizationRequestId: request.id,
        workDate: request.work_date,
        decision: input.decision,
        previousStatus,
        nextStatus,
        version: request.version,
        decidedAt: request.decided_at!,
      }),
    );
    return {
      ...this.presentRegularization(request),
      previous_status: previousStatus,
      next_status: nextStatus,
      day_status: this.presentDay(day, requestTimeZone),
    };
  }

  async decideRegularizationPostgres(
    actor: AuthUser,
    id: UUID,
    input: {
      decision: "approve" | "reject" | "return";
      remarks?: string;
      expected_version: number;
    },
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.decide_regularization",
    ).companyId;
    const current = this.repository.findRegularization(id, new Set([companyId]));
    this.assertTargetUserInCompany(current.employee_user_id, companyId, {
      operation: "attendance.decide_regularization.target_employee",
      requireActiveEmployment: false,
    });
    if (current.version !== input.expected_version) {
      throw conflict("Attendance regularization request was modified by another actor.", {
        aggregate: "attendance_regularization",
        id,
      });
    }
    if (current.status !== AttendanceRegularizationStatuses.Pending) {
      throw conflict("Only pending attendance regularization requests can be decided.", {
        request_id: id,
        status: current.status,
      });
    }
    if (["reject", "return"].includes(input.decision) && !input.remarks?.trim()) {
      throw missingRemarks(input.decision);
    }
    const timeZone = this.timezoneForUser(current.employee_user_id, companyId);
    const result = await new AttendanceCommandService(this.store).decideRegularization({
      actor,
      companyId,
      regularizationRequestId: current.id,
      employeeUserId: current.employee_user_id,
      workDate: current.work_date,
      expectedVersion: input.expected_version,
      reason: current.reason,
      remarks: input.remarks?.trim() ?? null,
      decision: input.decision,
      timeZone,
      // Re-evaluate authorization after the database row is locked. The
      // request snapshot is protected by its expected version and lock.
      authorize: () => assertCanDecideRegularization(actor, current),
    });
    const nextStatus = input.decision === "approve"
      ? AttendanceRegularizationStatuses.Approved
      : input.decision === "reject"
        ? AttendanceRegularizationStatuses.Rejected
        : AttendanceRegularizationStatuses.Returned;
    current.status = nextStatus;
    current.current_approver_user_id = null;
    current.decision_remarks = input.remarks?.trim() ?? null;
    current.decided_by_user_id = actor.id;
    current.decided_at = result.decidedAt;
    current.version = result.version;
    current.updated_at = result.decidedAt;
    for (const applied of result.applications) {
      if (!this.store.attendanceRegularizationCorrectionApplications.some(
        (application) => application.id === applied.id,
      )) {
        this.store.attendanceRegularizationCorrectionApplications.push({
          id: applied.id,
          company_id: companyId,
          regularization_request_id: current.id,
          regularization_request_item_id: applied.regularization_request_item_id,
          regularization_action_id: applied.regularization_action_id,
          operation: applied.operation,
          target_punch_event_id: applied.target_punch_event_id,
          replacement_punch_event_id: applied.replacement_punch_event_id,
          attendance_event_id: applied.attendance_event_id,
          applied_by_user_id: actor.id,
          applied_at: applied.applied_at,
        });
      }
      if (applied.replacement_punch && applied.replacement_punch_event_id &&
          !this.store.attendancePunches.some((punch) => punch.id === applied.replacement_punch_event_id)) {
        this.store.attendancePunches.push({
          id: applied.replacement_punch_event_id,
          company_id: companyId,
          employee_user_id: current.employee_user_id,
          actor_user_id: actor.id,
          event_type: applied.replacement_punch.event_type as AttendancePunchEventType,
          occurred_at: applied.replacement_punch.occurred_at as string,
          work_mode: "office",
          source: "admin",
          origin: "approved_regularization",
          regularization_request_id: current.id,
          metadata: {
            regularization_request_item_id: applied.regularization_request_item_id,
            correction_operation: applied.operation,
            target_punch_event_id: applied.target_punch_event_id,
          },
          created_at: result.decidedAt,
          deleted_at: null,
        });
      }
    }
    const projectedDay = result.day as unknown as AttendanceDayRecord;
    const storedDay = this.repository.dayRecord(companyId, current.employee_user_id, current.work_date);
    if (storedDay) {
      Object.assign(storedDay, projectedDay);
    } else {
      this.store.attendanceDayRecords.push(projectedDay);
    }
    return {
      ...this.presentRegularization(current),
      previous_status: AttendanceRegularizationStatuses.Pending,
      next_status: nextStatus,
      day_status: this.presentDay(projectedDay, timeZone),
    };
  }

  async createExportJob(actor: AuthUser, input: AttendanceExportInput) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.create_export",
      input.company_id,
    ).companyId;
    if (!canSeeAllAttendance(actor)) {
      throw forbidden(
        "Only HR, Admin, or Auditor users can export attendance data.",
      );
    }
    for (const userId of [
      input.filters?.user_id,
      input.filters?.employee_user_id,
    ]) {
      if (userId) {
        const user = this.requireUser(userId);
        this.assertTargetUserInCompany(user.id, companyId, {
          operation: "attendance.create_export.target_employee",
          requireActiveEmployment: false,
        });
      }
    }
    const jobId = randomUUID();
    const format = input.format ?? "csv";
    const columns = input.columns?.length
      ? input.columns
      : [
          "employee_code",
          "employee",
          "date",
          "status",
          "in_time",
          "out_time",
          "hours",
        ];
    const filters = input.filters ?? {};
    const createdAt = nowIso();
    const rows = this.exportRows(companyId, filters);
    const generated = await createGeneratedExportDocument(this.store, {
      actor,
      businessObjectType: "attendance_export",
      businessObjectId: jobId,
      reportType: "attendance",
      format: format as GeneratedExportFormat,
      rows,
      columns,
      filters,
      filePrefix: "attendance-export",
    });
    appendAttendanceOutboxEvent(
      this.store,
      buildExportRequestedEvent({
        companyId,
        actorUserId: actor.id,
        exportJobId: jobId,
        format,
        status: generated.status,
      }),
    );
    return {
      job_id: jobId,
      status: generated.status,
      format,
      filters: { ...filters, company_id: companyId },
      columns,
      requested_by_user_id: actor.id,
      created_at: createdAt,
      adapter: generated.adapter,
      download_document_id: generated.download_document_id,
      download_url: generated.download_url,
      file_name: generated.file_name,
      row_count: generated.row_count,
      size_bytes: generated.size_bytes,
      generated_at: generated.generated_at,
    };
  }

  private exportRows(
    companyId: UUID,
    filters: NonNullable<AttendanceExportInput["filters"]>,
  ): Array<Record<string, unknown>> {
    return this.store.attendanceDayRecords
      .filter((record) => record.company_id === companyId && !record.deleted_at)
      .filter(
        (record) =>
          !textFilter(filters.user_id) ||
          record.employee_user_id === textFilter(filters.user_id),
      )
      .filter(
        (record) =>
          !textFilter(filters.employee_user_id) ||
          record.employee_user_id === textFilter(filters.employee_user_id),
      )
      .filter(
        (record) =>
          !textFilter(filters.status) ||
          matchesLegacyAttendanceStatus(record, textFilter(filters.status)!),
      )
      .filter(
        (record) =>
          !textFilter(filters.date_from) ||
          record.work_date >= textFilter(filters.date_from)!,
      )
      .filter(
        (record) =>
          !textFilter(filters.date_to) ||
          record.work_date <= textFilter(filters.date_to)!,
      )
      .filter((record) => {
        const user = this.store.users.find(
          (candidate) => candidate.id === record.employee_user_id,
        );
        return (
          !textFilter(filters.department_id) ||
          user?.department_id === textFilter(filters.department_id)
        );
      })
      .sort((left, right) => right.work_date.localeCompare(left.work_date))
      .map((record) => {
        const user = this.store.users.find(
          (candidate) => candidate.id === record.employee_user_id,
        );
        const department = user
          ? this.store.departments.find(
              (candidate) => candidate.id === user.department_id,
            )
          : null;
        const timeZone = this.timezoneForUser(
          record.employee_user_id,
          companyId,
        );
        return {
          id: record.id,
          employee_user_id: record.employee_user_id,
          employee_code: user?.employee_code ?? "",
          employee: user?.full_name ?? record.employee_user_id,
          department: department?.name ?? "",
          date: record.work_date,
          work_date: record.work_date,
          status: record.status,
          day_classification: record.day_classification,
          presence_state: record.presence_state,
          punctuality_state: record.punctuality_state,
          evidence_state: record.evidence_state,
          approval_kind: record.approval_kind,
          approval_state: record.approval_state,
          payroll_state: record.payroll_state,
          in_time: timeText(record.first_check_in, timeZone) ?? "",
          out_time: timeText(record.last_check_out, timeZone) ?? "",
          hours: Math.round((record.work_seconds / 3600) * 100) / 100,
          work_seconds: record.work_seconds,
          break_seconds: record.break_seconds,
          scheduled_seconds: record.scheduled_seconds,
          late_seconds: record.late_seconds,
          early_departure_seconds: record.early_departure_seconds,
          late_minutes: record.late_minutes,
          early_out_minutes: record.early_out_minutes,
          work_mode: record.work_mode ?? "",
          exception_type: record.exception_type ?? "",
          note: record.note ?? "",
        };
      });
  }

  private nextAllowedActions(
    punches: AttendancePunch[],
  ): AttendancePunchEventType[] {
    const active = punches
      .filter((punch) => !punch.deleted_at)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const last = active.at(-1);
    if (!last) {
      return [AttendancePunchEventTypes.CheckIn];
    }
    if (
      last.event_type === AttendancePunchEventTypes.CheckIn ||
      last.event_type === AttendancePunchEventTypes.BreakEnd
    ) {
      return [
        AttendancePunchEventTypes.BreakStart,
        AttendancePunchEventTypes.CheckOut,
      ];
    }
    if (last.event_type === AttendancePunchEventTypes.BreakStart) {
      return [AttendancePunchEventTypes.BreakEnd];
    }
    return [];
  }

  private punchAvailability(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
    occurredAt = nowIso(),
  ): PunchAvailability {
    const punches = this.punchesForWorkDate(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
    const sequenceAllowedActions = this.nextAllowedActions(punches);
    const policy = this.attendancePolicy(companyId);
    const activePunches = punches.filter((punch) => !punch.deleted_at);
    const localTime =
      timeText(occurredAt, timeZone) ?? occurredAt.slice(11, 16);
    const isCompanyWorkingDay = this.isWorkingDay(companyId, workDate);
    const blockedActionReasons: Partial<
      Record<AttendancePunchEventType, string>
    > = {};
    const nextAllowedActions: AttendancePunchEventType[] = [];

    for (const action of sequenceAllowedActions) {
      const blockedReason = this.punchActionBlockedReason(action, policy, {
        activePunches: activePunches.length,
        isCompanyWorkingDay,
        localTime,
      });
      if (blockedReason) {
        blockedActionReasons[action] = blockedReason;
      } else {
        nextAllowedActions.push(action);
      }
    }

    return {
      policy,
      sequence_allowed_actions: sequenceAllowedActions,
      next_allowed_actions: nextAllowedActions,
      blocked_action_reasons: blockedActionReasons,
      blocked_reason:
        nextAllowedActions.length === 0
          ? (Object.values(blockedActionReasons)[0] ?? null)
          : null,
      local_time: localTime,
      is_company_working_day: isCompanyWorkingDay,
    };
  }

  private punchActionBlockedReason(
    action: AttendancePunchEventType,
    policy: AttendancePunchPolicy,
    context: {
      activePunches: number;
      isCompanyWorkingDay: boolean;
      localTime: string;
    },
  ): string | null {
    if (
      action === AttendancePunchEventTypes.CheckIn &&
      !policy.allowOffDayPunches &&
      !context.isCompanyWorkingDay &&
      context.activePunches === 0
    ) {
      return "Punch-in is not allowed on company off days.";
    }
    if (policy.fullDayPunchWindow) {
      return null;
    }
    if (
      action === AttendancePunchEventTypes.CheckIn &&
      !withinClockWindow(
        context.localTime,
        policy.punchInStart,
        policy.punchInEnd,
      )
    ) {
      return (
        "Punch-in is allowed between " +
        policy.punchInStart +
        " and " +
        policy.punchInEnd +
        "."
      );
    }
    if (
      action === AttendancePunchEventTypes.CheckOut &&
      !withinClockWindow(
        context.localTime,
        policy.punchOutStart,
        policy.punchOutEnd,
      )
    ) {
      return (
        "Punch-out is allowed between " +
        policy.punchOutStart +
        " and " +
        policy.punchOutEnd +
        "."
      );
    }
    return null;
  }

  private presentPunchPolicy(
    availability: PunchAvailability,
  ): Record<string, unknown> {
    return {
      punch_window_mode: availability.policy.fullDayPunchWindow
        ? "full_day"
        : "restricted",
      full_day_punch_window: availability.policy.fullDayPunchWindow,
      punch_in_start: availability.policy.punchInStart,
      punch_in_end: availability.policy.punchInEnd,
      punch_out_start: availability.policy.punchOutStart,
      punch_out_end: availability.policy.punchOutEnd,
      auto_punch_out_enabled: availability.policy.autoPunchOutEnabled,
      auto_punch_out_time: availability.policy.autoPunchOutTime,
      allow_off_day_punches: availability.policy.allowOffDayPunches,
      attendance_mode: availability.policy.attendanceMode,
      fallback_approval_mode: availability.policy.fallbackApprovalMode,
      regularization_mode: availability.policy.regularizationMode,
      location_unavailable_action: availability.policy.locationUnavailableAction,
      permission_denied_action: availability.policy.permissionDeniedAction,
      outside_fence_action: availability.policy.outsideFenceAction,
      boundary_uncertain_action: availability.policy.boundaryUncertainAction,
      stale_evidence_action: availability.policy.staleEvidenceAction,
      accuracy_exceeded_action: availability.policy.accuracyExceededAction,
      effective_geofence_id: availability.policy.effectiveGeofenceId,
      effective_geofence_ids: availability.policy.effectiveGeofenceIds,
      geofence_grace_meters: availability.policy.geofenceGraceMeters,
      max_location_age_ms: availability.policy.maxLocationAgeMs,
      max_accuracy_meters: availability.policy.maxAccuracyMeters,
      is_company_working_day: availability.is_company_working_day,
      local_time: availability.local_time,
      can_punch_now: availability.next_allowed_actions.length > 0,
      blocked_reason: availability.blocked_reason,
      blocked_action_reasons: availability.blocked_action_reasons,
    };
  }

  private autoPunchOutCutoffIso(
    workDate: string,
    firstCheckInAt: string,
    policy: AttendancePunchPolicy,
    timeZone: string,
  ): string {
    const [hourText, minuteText] = policy.autoPunchOutTime.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const sameDayCutoff = zonedClockIso(workDate, hour, minute, timeZone);
    if (Date.parse(sameDayCutoff) > Date.parse(firstCheckInAt)) {
      return sameDayCutoff;
    }
    return zonedClockIso(addDays(workDate, 1), hour, minute, timeZone);
  }

  private addAutoPunchOutIfExpired(input: {
    companyId: UUID;
    employeeUserId: UUID;
    workDate: string;
    firstCheckIn: AttendancePunch;
    lastOpenPunch: AttendancePunch;
    timeZone: string;
    referenceIso: string;
    policy: AttendancePunchPolicy;
    trigger: "api" | "worker";
  }): AttendanceAutoPunchOutClosure | null {
    const cutoffIso = this.autoPunchOutCutoffIso(
      input.workDate,
      input.firstCheckIn.occurred_at,
      input.policy,
      input.timeZone,
    );
    if (Date.parse(cutoffIso) > Date.parse(input.referenceIso)) {
      return null;
    }
    const closeAt =
      Date.parse(input.lastOpenPunch.occurred_at) > Date.parse(cutoffIso)
        ? input.lastOpenPunch.occurred_at
        : cutoffIso;
    const metadata = {
      auto_punch_out: true,
      auto_punch_out_time: input.policy.autoPunchOutTime,
      auto_punch_out_reason: "Configured attendance day-end cutoff",
      auto_punch_out_trigger: input.trigger,
    };
    const createdPunches: AttendancePunch[] = [];

    if (
      input.lastOpenPunch.event_type === AttendancePunchEventTypes.BreakStart
    ) {
      createdPunches.push(
        this.repository.addPunch({
          company_id: input.companyId,
          employee_user_id: input.employeeUserId,
          actor_user_id: input.employeeUserId,
          event_type: AttendancePunchEventTypes.BreakEnd,
          occurred_at: closeAt,
          work_mode: input.lastOpenPunch.work_mode,
          source: "admin",
          origin: "system",
          metadata,
        }),
      );
    }

    createdPunches.push(
      this.repository.addPunch({
        company_id: input.companyId,
        employee_user_id: input.employeeUserId,
        actor_user_id: input.employeeUserId,
        event_type: AttendancePunchEventTypes.CheckOut,
        occurred_at: closeAt,
        work_mode: input.lastOpenPunch.work_mode,
        source: "admin",
        origin: "system",
        metadata,
      }),
    );
    return {
      company_id: input.companyId,
      employee_user_id: input.employeeUserId,
      work_date: input.workDate,
      first_check_in_id: input.firstCheckIn.id,
      first_check_in_at: input.firstCheckIn.occurred_at,
      last_open_punch_id: input.lastOpenPunch.id,
      closed_at: closeAt,
      created_punches: createdPunches,
      day_record: null,
    };
  }

  private autoPunchOutExpiredSessions(
    companyId: UUID,
    employeeUserId: UUID,
    timeZone: string,
    referenceIso = nowIso(),
    trigger: "api" | "worker" = "api",
  ): AttendanceAutoPunchOutClosure[] {
    const punches = this.store.attendancePunches
      .filter(
        (punch) =>
          punch.company_id === companyId &&
          punch.employee_user_id === employeeUserId &&
          !punch.deleted_at &&
          punch.occurred_at <= referenceIso,
      )
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    let openWorkDate: string | null = null;
    let firstCheckIn: AttendancePunch | null = null;
    let lastOpenPunch: AttendancePunch | null = null;
    const policy = this.attendancePolicy(companyId);
    const closures: AttendanceAutoPunchOutClosure[] = [];
    if (!policy.autoPunchOutEnabled) {
      return closures;
    }

    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
        if (openWorkDate && firstCheckIn && lastOpenPunch) {
          const closure = this.addAutoPunchOutIfExpired({
            companyId,
            employeeUserId,
            workDate: openWorkDate,
            firstCheckIn,
            lastOpenPunch,
            timeZone,
            referenceIso,
            policy,
            trigger,
          });
          if (closure) {
            closures.push(closure);
          }
        }
        openWorkDate = dateInTimeZone(punch.occurred_at, timeZone);
        firstCheckIn = punch;
        lastOpenPunch = punch;
        continue;
      }
      if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
        openWorkDate = null;
        firstCheckIn = null;
        lastOpenPunch = null;
        continue;
      }
      if (openWorkDate) {
        lastOpenPunch = punch;
      }
    }

    if (openWorkDate && firstCheckIn && lastOpenPunch) {
      const closure = this.addAutoPunchOutIfExpired({
        companyId,
        employeeUserId,
        workDate: openWorkDate,
        firstCheckIn,
        lastOpenPunch,
        timeZone,
        referenceIso,
        policy,
        trigger,
      });
      if (closure) {
        closures.push(closure);
      }
    }
    return closures;
  }

  autoPunchOutExpiredSessionsForAll(
    input: {
      referenceIso?: string;
      batchSize?: number;
      companyIds?: ReadonlySet<UUID>;
    } = {},
  ): AttendanceAutoPunchOutRunResult {
    const referenceIso = input.referenceIso ?? nowIso();
    const batchSize = Math.max(
      1,
      Math.floor(input.batchSize ?? Number.MAX_SAFE_INTEGER),
    );
    const candidateUserCompanyPairs = Array.from(
      new Map(
        this.store.attendancePunches
          .filter(
            (punch) =>
              !punch.deleted_at &&
              punch.occurred_at <= referenceIso &&
              (!input.companyIds || input.companyIds.has(punch.company_id)),
          )
          .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
          .map(
            (punch) =>
              [
                `${punch.company_id}:${punch.employee_user_id}`,
                {
                  companyId: punch.company_id,
                  employeeUserId: punch.employee_user_id,
                },
              ] as const,
          ),
      ).values(),
    );
    const closures: AttendanceAutoPunchOutClosure[] = [];
    let scannedUsers = 0;
    let dayRecordsRecomputed = 0;

    for (const { companyId, employeeUserId } of candidateUserCompanyPairs) {
      if (scannedUsers >= batchSize) {
        break;
      }
      const user = this.store.users.find(
        (candidate) => candidate.id === employeeUserId && !candidate.deleted_at,
      );
      if (!user || user.employment_status !== EmploymentStatuses.Active) {
        continue;
      }
      scannedUsers += 1;
      const timeZone = this.company(companyId).timezone;
      const userClosures = this.autoPunchOutExpiredSessions(
        companyId,
        employeeUserId,
        timeZone,
        referenceIso,
        "worker",
      );
      const affectedWorkDates = new Set(
        userClosures.map((closure) => closure.work_date),
      );
      for (const workDate of affectedWorkDates) {
        const dayRecord = this.recomputeDay(
          companyId,
          employeeUserId,
          workDate,
          timeZone,
          referenceIso,
        );
        dayRecordsRecomputed += 1;
        for (const closure of userClosures) {
          if (closure.work_date === workDate) {
            closure.day_record = dayRecord;
          }
        }
      }
      for (const closure of userClosures) {
        const checkoutPunch = closure.created_punches.find(
          (punch) => punch.event_type === AttendancePunchEventTypes.CheckOut,
        );
        if (checkoutPunch) {
          appendAttendanceOutboxEvent(
            this.store,
            buildMissingCheckoutDetectedEvent({
              companyId,
              actorUserId: employeeUserId,
              subjectEmployeeUserId: employeeUserId,
              punchEventId: checkoutPunch.id,
              workDate: closure.work_date,
              occurredAt: checkoutPunch.occurred_at,
            }),
          );
        }
        for (const punch of closure.created_punches) {
          appendAttendanceOutboxEvent(
            this.store,
            buildPunchRecordedEvent({
              companyId,
              actorUserId: employeeUserId,
              subjectEmployeeUserId: employeeUserId,
              punchEventId: punch.id,
              punchType: punch.event_type,
              occurredAt: punch.occurred_at,
              workDate: closure.work_date,
              workMode: punch.work_mode,
              sourceChannel: punch.source,
              dayStatus: closure.day_record?.status ?? null,
            }),
          );
        }
      }
      closures.push(...userClosures);
    }

    return {
      reference_iso: referenceIso,
      scanned_users: scannedUsers,
      closed_sessions: closures.length,
      punches_created: closures.reduce(
        (total, closure) => total + closure.created_punches.length,
        0,
      ),
      day_records_recomputed: dayRecordsRecomputed,
      closures,
    };
  }

  private recomputeDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
    referenceIso = nowIso(),
  ): AttendanceDayRecord {
    this.autoPunchOutExpiredSessions(
      companyId,
      employeeUserId,
      timeZone,
      referenceIso,
    );
    const punches = this.punchesForWorkDate(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
    const durationFacts = this.durationFactsFromPunches(
      punches,
      workDate === todayDate(timeZone) ? referenceIso : null,
    );
    const firstCheckIn = durationFacts.firstCheckIn;
    const lastCheckOut = durationFacts.lastCheckOut;
    const workMode =
      punches.find((punch) => punch.work_mode)?.work_mode ?? null;
    const localToday = todayDate(timeZone);
    const isPast = workDate < localToday;
    const policy = this.attendancePolicy(companyId);
    const holiday = this.holidayForDate(companyId, workDate);
    const workingDay = this.isWorkingDay(companyId, workDate);
    const shift = resolveEmployeeShift({
      company: this.company(companyId),
      employee: this.requireUser(employeeUserId),
      workDate,
      templates: [],
      versions: [],
      assignments: [],
    });
    const autoAbsentAt = addMinutes(
      shift.scheduled_start_at,
      policy.autoMarkAbsentMinutes,
    );
    const canMarkAbsentToday =
      workDate === localToday &&
      Date.parse(referenceIso) >= Date.parse(autoAbsentAt);
    const absent =
      !firstCheckIn && workingDay && !holiday && (isPast || canMarkAbsentToday);
    const existing = this.repository.dayRecord(companyId, employeeUserId, workDate);
    const approvalFacts = this.approvalFactsForDay(companyId, employeeUserId, workDate);
    const dayClassification = this.dayClassificationFor({
      workDate,
      localToday,
      holiday: Boolean(holiday),
      workingDay,
      workMode,
      approvalFacts,
    });
    const passiveNote =
      holiday && punches.length === 0
        ? `Holiday: ${holiday.name}`
        : !workingDay && punches.length === 0
          ? "Company non-working day"
          : null;
    const projection = projectAttendanceDay({
      companyId,
      employeeUserId,
      workDate,
      asOf: referenceIso,
      dayClassification,
      firstCheckIn,
      lastCheckOut,
      hasOpenSession: durationFacts.hasOpenSession,
      hasIncompleteEvidence: durationFacts.hasUnmatchedPunch,
      incompleteIsException: isPast,
      workMode,
      workSeconds: durationFacts.workSeconds,
      breakSeconds: durationFacts.breakSeconds,
      scheduledStartAt: shift.scheduled_start_at,
      scheduledEndAt: shift.scheduled_end_at,
      graceSeconds: policy.graceMinutes * 60,
      approvalFacts,
      existingApproval: existing,
      regularizationStatus: existing?.regularization_status ?? null,
      forcePresenceState: absent
        ? AttendancePresenceStates.Absent
        : !firstCheckIn && workDate === localToday
          ? AttendancePresenceStates.NotStarted
          : undefined,
      note: passiveNote,
    });
    projection.note = projection.exception_type
      ? this.exceptionDetail(projection)
      : passiveNote;
    return this.repository.upsertDayRecord(projection);
  }

  private durationFactsFromPunches(
    punches: AttendancePunch[],
    openSessionEndAt: string | null,
  ): {
    firstCheckIn: string | null;
    lastCheckOut: string | null;
    workSeconds: number;
    breakSeconds: number;
    hasOpenSession: boolean;
    hasUnmatchedPunch: boolean;
  } {
    let workSeconds = 0;
    let breakSeconds = 0;
    let sessionStartedAt: string | null = null;
    let breakStartedAt: string | null = null;
    let sessionBreakSeconds = 0;
    let firstCheckIn: string | null = null;
    let lastCheckOut: string | null = null;
    let hasUnmatchedPunch = false;
    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
        if (sessionStartedAt) hasUnmatchedPunch = true;
        sessionStartedAt = punch.occurred_at;
        firstCheckIn ??= punch.occurred_at;
        sessionBreakSeconds = 0;
        breakStartedAt = null;
      } else if (punch.event_type === AttendancePunchEventTypes.BreakStart && sessionStartedAt) {
        breakStartedAt = punch.occurred_at;
      } else if (
        punch.event_type === AttendancePunchEventTypes.BreakEnd &&
        breakStartedAt
      ) {
        const seconds = secondsBetween(breakStartedAt, punch.occurred_at);
        breakSeconds += seconds;
        sessionBreakSeconds += seconds;
        breakStartedAt = null;
      } else if (punch.event_type === AttendancePunchEventTypes.CheckOut && sessionStartedAt) {
        if (breakStartedAt) {
          const seconds = secondsBetween(breakStartedAt, punch.occurred_at);
          breakSeconds += seconds;
          sessionBreakSeconds += seconds;
          breakStartedAt = null;
        }
        workSeconds += Math.max(
          0,
          secondsBetween(sessionStartedAt, punch.occurred_at) - sessionBreakSeconds,
        );
        lastCheckOut = punch.occurred_at;
        sessionStartedAt = null;
        sessionBreakSeconds = 0;
      } else if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
        hasUnmatchedPunch = true;
      }
    }
    if (sessionStartedAt && openSessionEndAt) {
      if (breakStartedAt) {
        const seconds = secondsBetween(breakStartedAt, openSessionEndAt);
        breakSeconds += seconds;
        sessionBreakSeconds += seconds;
      }
      workSeconds += Math.max(
        0,
        secondsBetween(sessionStartedAt, openSessionEndAt) - sessionBreakSeconds,
      );
    }
    return {
      firstCheckIn,
      lastCheckOut,
      workSeconds,
      breakSeconds,
      hasOpenSession: sessionStartedAt !== null,
      hasUnmatchedPunch,
    };
  }

  private resolveDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
  ): AttendanceDayRecord {
    const existing = this.repository.dayRecord(
      companyId,
      employeeUserId,
      workDate,
    );
    const punches = this.punchesForWorkDate(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
    if (
      existing &&
      punches.length === 0 &&
      this.shouldPreserveManualDay(existing)
    ) {
      return existing;
    }
    if (punches.length > 0 || workDate <= todayDate(timeZone)) {
      return this.recomputeDay(companyId, employeeUserId, workDate, timeZone);
    }
    return this.getOrSynthesizeDay(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
  }

  private shouldPreserveManualDay(record: AttendanceDayRecord): boolean {
    return (
      record.day_classification === AttendanceDayClassifications.Leave ||
      record.day_classification === AttendanceDayClassifications.Wfh ||
      (record.day_classification === AttendanceDayClassifications.Holiday &&
        Boolean(this.holidayForDate(record.company_id, record.work_date))) ||
      record.regularization_status === AttendanceRegularizationStatuses.Approved
    );
  }

  private getOrSynthesizeDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
  ): AttendanceDayRecord {
    const existing = this.repository.dayRecord(
      companyId,
      employeeUserId,
      workDate,
    );
    if (existing) {
      return existing;
    }
    const holiday = this.holidayForDate(companyId, workDate);
    const workingDay = this.isWorkingDay(companyId, workDate);
    const localToday = todayDate(timeZone);
    const dayClassification = holiday
      ? AttendanceDayClassifications.Holiday
      : !workingDay
        ? AttendanceDayClassifications.Weekend
        : workDate > localToday
          ? AttendanceDayClassifications.Future
          : AttendanceDayClassifications.WorkingDay;
    const shift = resolveEmployeeShift({
      company: this.company(companyId),
      employee: this.requireUser(employeeUserId),
      workDate,
      templates: [],
      versions: [],
      assignments: [],
    });
    return this.repository.upsertDayRecord(projectAttendanceDay({
      companyId,
      employeeUserId,
      workDate,
      asOf: nowIso(),
      dayClassification,
      firstCheckIn: null,
      lastCheckOut: null,
      hasOpenSession: false,
      workMode: null,
      workSeconds: 0,
      breakSeconds: 0,
      scheduledStartAt: shift.scheduled_start_at,
      scheduledEndAt: shift.scheduled_end_at,
      graceSeconds: this.attendancePolicy(companyId).graceMinutes * 60,
      note: dayClassification === AttendanceDayClassifications.WorkingDay
        ? "No punch-in recorded"
        : dayClassification === AttendanceDayClassifications.Holiday
          ? `Holiday: ${holiday?.name ?? "Company holiday"}`
          : dayClassification === AttendanceDayClassifications.Weekend
            ? "Company non-working day"
            : null,
    }));
  }

  private weekRecords(
    companyId: UUID,
    employeeUserId: UUID,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
  ): AttendanceDayRecord[] {
    const localToday = todayDate(timeZone);
    const today = new Date(`${localToday}T00:00:00.000Z`);
    const start = new Date(today);
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const workDate = date.toISOString().slice(0, 10);
      return this.resolveDay(companyId, employeeUserId, workDate, timeZone);
    });
  }

  private punchesForWorkDate(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone: string,
  ): AttendancePunch[] {
    let openWorkDate: string | null = null;
    return this.store.attendancePunches
      .filter(
        (punch) =>
          punch.company_id === companyId &&
          punch.employee_user_id === employeeUserId &&
          !punch.deleted_at,
      )
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .filter((punch) => {
        if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
          openWorkDate = dateInTimeZone(punch.occurred_at, timeZone);
        }
        const assignedWorkDate =
          openWorkDate ?? dateInTimeZone(punch.occurred_at, timeZone);
        const include = assignedWorkDate === workDate;
        if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
          openWorkDate = null;
        }
        return include;
      });
  }

  private workDateForPunch(
    companyId: UUID,
    employeeUserId: UUID,
    eventType: AttendancePunchEventType,
    occurredAt: string,
    timeZone: string,
  ): string {
    if (eventType === AttendancePunchEventTypes.CheckIn) {
      return dateInTimeZone(occurredAt, timeZone);
    }
    return (
      this.openSessionWorkDate(
        companyId,
        employeeUserId,
        occurredAt,
        timeZone,
      ) ?? dateInTimeZone(occurredAt, timeZone)
    );
  }

  private openSessionWorkDate(
    companyId: UUID,
    employeeUserId: UUID,
    occurredAt: string,
    timeZone: string,
  ): string | null {
    let openWorkDate: string | null = null;
    const punches = this.store.attendancePunches
      .filter(
        (punch) =>
          punch.company_id === companyId &&
          punch.employee_user_id === employeeUserId &&
          !punch.deleted_at &&
          punch.occurred_at <= occurredAt,
      )
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
        openWorkDate = dateInTimeZone(punch.occurred_at, timeZone);
      }
      if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
        openWorkDate = null;
      }
    }
    return openWorkDate;
  }

  private weeklyBalance(
    companyId: UUID,
    records: AttendanceDayRecord[],
  ): Record<string, unknown> {
    const elapsedRecords = records.filter(
      (record) =>
        record.work_date <=
        todayDate(this.timezoneForUser(record.employee_user_id, companyId)),
    );
    const targetSeconds = this.targetWorkMinutes(companyId) * 60;
    const weekdayRecords = elapsedRecords.filter(
      (record) =>
        this.isWorkingDay(companyId, record.work_date) &&
        !this.holidayForDate(companyId, record.work_date),
    );
    const offDayRecords = elapsedRecords.filter(
      (record) =>
        !this.isWorkingDay(companyId, record.work_date) ||
        Boolean(this.holidayForDate(companyId, record.work_date)),
    );
    const requiredWeekdaySeconds = weekdayRecords.length * targetSeconds;
    const weekdayWorkedSeconds = weekdayRecords.reduce(
      (total, record) => total + record.work_seconds,
      0,
    );
    const offDayWorkedSeconds = offDayRecords.reduce(
      (total, record) => total + record.work_seconds,
      0,
    );
    const weekdayShortageSeconds = Math.max(
      0,
      requiredWeekdaySeconds - weekdayWorkedSeconds,
    );
    const compensatedSeconds = Math.min(
      weekdayShortageSeconds,
      offDayWorkedSeconds,
    );
    const overtimeSeconds = Math.max(
      0,
      offDayWorkedSeconds - compensatedSeconds,
    );
    const requiredWeekdayMinutes = Math.floor(requiredWeekdaySeconds / 60);
    const weekdayWorkedMinutes = Math.floor(weekdayWorkedSeconds / 60);
    const offDayWorkedMinutes = Math.floor(offDayWorkedSeconds / 60);
    const weekdayShortageMinutes = Math.floor(weekdayShortageSeconds / 60);
    const compensatedMinutes = Math.floor(compensatedSeconds / 60);
    const overtimeMinutes = Math.floor(overtimeSeconds / 60);
    return {
      required_weekly_minutes: requiredWeekdayMinutes,
      required_weekly_hours: minutesToHours(requiredWeekdayMinutes),
      weekday_worked_minutes: weekdayWorkedMinutes,
      weekday_worked_hours: minutesToHours(weekdayWorkedMinutes),
      weekday_shortage_minutes: weekdayShortageMinutes,
      weekday_shortage_hours: minutesToHours(weekdayShortageMinutes),
      off_day_worked_minutes: offDayWorkedMinutes,
      off_day_worked_hours: minutesToHours(offDayWorkedMinutes),
      compensated_minutes: compensatedMinutes,
      compensated_hours: minutesToHours(compensatedMinutes),
      overtime_minutes: overtimeMinutes,
      overtime_hours: minutesToHours(overtimeMinutes),
    };
  }

  async punchPostgres(
    actor: AuthUser,
    input: EmployeePunchPostgresInput,
    clientEnvelope?: AttendanceCommandEnvelopeInput,
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.punch_postgres",
    );
    assertCanUseSelfAttendance(actor);
    const companyId = context.companyId;
    if (!this.store.pgPool)
      throw conflict("Attendance command service is unavailable.");
    const timeZone = this.timezoneForUser(actor.id, companyId);
    return new AttendanceCommandService(this.store).execute({
      actor,
      companyId,
      timeZone,
      idempotencyKey: input.idempotency_key,
      command: input,
      clientEnvelope,
      isWorkingDayFor: (workDate) => this.isWorkingDay(companyId, workDate),
    });
  }

  async recordEmployeeManualNowPostgres(
    actor: AuthUser,
    input: Omit<EmployeePunchPostgresInput, "idempotency_key" | "occurred_at">,
    idempotencyKey: string,
    clientEnvelope?: AttendanceCommandEnvelopeInput,
  ): Promise<Record<string, unknown>> {
    return this.punchPostgres(actor, {
      ...input,
      source: employeePunchSource(input.source),
      idempotency_key: idempotencyKey,
    }, clientEnvelope);
  }

  async publishGeofenceVersion(
    actor: AuthUser,
    geofenceId: UUID,
    versionId: UUID,
    input: { effectiveFrom: string; effectiveUntil?: string | null },
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.geofence.publish",
    );
    if (!canManageAllAttendance(actor)) {
      throw forbidden("Only HR or Admin can publish geofence versions.");
    }
    if (!this.store.pgPool) {
      throw conflict("Geofence publish service is unavailable.");
    }
    const version = await new PostgresGeofenceRepository(
      this.store.pgPool,
    ).publishDraftVersion({
      companyId: context.companyId,
      actorUserId: actor.id,
      geofenceId,
      versionId,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
    });
    return { version };
  }

  async recordManagerAssistedCurrentPunchPostgres(
    actor: AuthUser,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      reason?: string;
    },
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.assisted_current_punch",
    );
    const subject = this.requireUser(subjectEmployeeUserId);
    this.assertTargetUserInCompany(subject.id, context.companyId, {
      operation: "attendance.assisted_current_punch.target_employee",
      requireActiveEmployment: true,
    });
    assertCanAssistCurrentPunch(actor, subject);
    if (!this.store.pgPool) throw conflict("Attendance command service is unavailable.");
    return new AttendanceCommandService(this.store).execute({
      actor,
      companyId: context.companyId,
      subjectEmployeeUserId: subject.id,
      commandKind: "manager_assisted_now",
      timeZone: this.timezoneForUser(subject.id, context.companyId),
      idempotencyKey,
      command: {
        event_type: input.event_type,
        work_mode: input.work_mode,
        source: "admin",
        metadata: { ...input.metadata, ...(input.reason ? { assisted_reason: input.reason } : {}) },
        location: input.location,
      },
      isWorkingDayFor: (workDate) => this.isWorkingDay(context.companyId, workDate),
    });
  }

  async recordHistoricalCorrection(
    actor: AuthUser,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    },
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.historical_correction",
    );
    const subject = this.requireUser(subjectEmployeeUserId);
    this.assertTargetUserInCompany(subject.id, context.companyId, {
      operation: "attendance.historical_correction.target_employee",
      requireActiveEmployment: false,
    });
    assertCanCreateHistoricalCorrection(actor);
    if (Date.parse(input.occurred_at) >= Date.parse(nowIso())) {
      throw badRequest("Historical correction occurrence time must be in the past.");
    }
    if (input.linked_regularization_request_id) {
      const request = this.repository.findRegularization(
        input.linked_regularization_request_id,
        new Set([context.companyId]),
      );
      if (request.employee_user_id !== subject.id) {
        throw forbidden("Linked regularization does not belong to the correction subject.");
      }
    }
    if (this.store.kind === "postgres") {
      if (!this.store.pgPool) throw conflict("Attendance command service is unavailable.");
      return new AttendanceCommandService(this.store).executeHistoricalCorrection({
        actor,
        principal: {
          companyId: context.companyId,
          actorUserId: actor.id,
          subjectEmployeeUserId: subject.id,
        },
        idempotencyKey,
        timeZone: this.timezoneForUser(subject.id, context.companyId),
        command: input,
        commandKind: "historical_correction",
      });
    }
    const requestHash = canonicalAttendanceRequestHash({
      company_id: context.companyId,
      actor_user_id: actor.id,
      subject_employee_user_id: subject.id,
      command_kind: "historical_correction",
      ...input,
    });
    const key = `attendance.historical_correction:${context.companyId}:${actor.id}:${subject.id}:${idempotencyKey}`;
    const entries = memoryHistoricalCorrectionIdempotency.get(this.store) ?? new Map();
    memoryHistoricalCorrectionIdempotency.set(this.store, entries);
    const existing = entries.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw conflict("Idempotency key was already used with a different correction request.");
      }
      return existing.response;
    }
    const response = this.recordHistoricalCorrectionInMemory(
      actor,
      context.companyId,
      subject.id,
      input,
      "historical_correction",
    );
    entries.set(key, { requestHash, response });
    return response;
  }

  private recordHistoricalCorrectionInMemory(
    actor: AuthUser,
    companyId: UUID,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    },
    origin: Extract<AttendancePunch["origin"], "historical_correction" | "approved_regularization">,
  ): Record<string, unknown> {
    const timeZone = this.timezoneForUser(subjectEmployeeUserId, companyId);
    const workDate = dateInTimeZone(input.occurred_at, timeZone);
    const punch = this.repository.addPunch({
      company_id: companyId,
      employee_user_id: subjectEmployeeUserId,
      actor_user_id: actor.id,
      event_type: input.event_type,
      occurred_at: input.occurred_at,
      work_mode: input.work_mode,
      source: "admin",
      origin,
      metadata: { ...input.metadata, correction_reason: input.reason },
      regularization_request_id: input.linked_regularization_request_id ?? null,
    });
    const day = this.recomputeDay(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
    );
    appendAttendanceOutboxEvent(
      this.store,
      buildPunchRecordedEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId,
        punchEventId: punch.id,
        punchType: punch.event_type,
        occurredAt: punch.occurred_at,
        workDate,
        workMode: punch.work_mode,
        sourceChannel: punch.source,
        origin,
        dayStatus: day.status,
      }),
    );
    return { punch_id: punch.id, punch, day_status: this.presentDay(day, timeZone) };
  }

  private resolveAttendanceCompanyContext(
    actor: AuthUser,
    operation: string,
    requestedCompanyId?: UUID | null,
  ): ActiveCompanyMembershipContext {
    return resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      requestedCompanyId,
      operation,
      requireActiveEmployment: true,
    });
  }

  private company(companyId: UUID) {
    const company = this.store.companyProfiles.find(
      (candidate) =>
        candidate.id === companyId && candidate.status === "active",
    );
    if (!company) {
      throw companyContextRequired({
        company_id: companyId,
        operation: "attendance_company",
      });
    }
    return company;
  }

  private assertTargetUserInCompany(
    userId: UUID,
    companyId: UUID,
    input: { operation: string; requireActiveEmployment: boolean },
  ): void {
    assertUserInCompanyMembershipContext(this.store, {
      userId,
      companyId,
      operation: input.operation,
      requireActiveEmployment: input.requireActiveEmployment,
    });
  }

  private isUserInCompany(userId: UUID, companyId: UUID): boolean {
    try {
      this.assertTargetUserInCompany(userId, companyId, {
        operation: "attendance.company_target_filter",
        requireActiveEmployment: false,
      });
      return true;
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === ErrorCodes.Unauthorized ||
          error.code === ErrorCodes.Forbidden ||
          error.code === ErrorCodes.CompanyContextRequired)
      ) {
        return false;
      }
      throw error;
    }
  }

  private attendancePolicy(companyId: UUID): AttendancePunchPolicy {
    const policy = this.store.adminPolicies.find(
      (candidate) =>
        candidate.company_id === companyId &&
        candidate.policy_key === "attendance" &&
        candidate.status === "active" &&
        !candidate.deleted_at,
    );
    const config = normalizeAttendancePolicyConfig(policy?.config);
    return {
      ...config,
      policyVersion: policy ? String(policy.version) : "built-in-default",
    };
  }

  private isWorkingDay(companyId: UUID, workDate: string): boolean {
    return isWorkingDate(
      workDate,
      this.company(companyId).working_week,
      this.holidayDates(companyId),
    );
  }

  private holidayForDate(companyId: UUID, workDate: string) {
    return (
      this.store.holidays.find(
        (holiday) =>
          holiday.company_id === companyId &&
          holiday.holiday_date === workDate &&
          !holiday.optional &&
          !holiday.deleted_at,
      ) ?? null
    );
  }

  private holidayDates(companyId: UUID): Set<string> {
    return new Set(
      this.store.holidays
        .filter(
          (holiday) =>
            holiday.company_id === companyId &&
            !holiday.optional &&
            !holiday.deleted_at,
        )
        .map((holiday) => holiday.holiday_date),
    );
  }

  private approvalFactsForDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
  ): AttendanceApprovalFact[] {
    const facts: AttendanceApprovalFact[] = [];
    const regularization = this.store.attendanceRegularizations
      .filter((request) =>
        request.company_id === companyId &&
        request.employee_user_id === employeeUserId &&
        request.work_date === workDate &&
        !request.deleted_at,
      )
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
    if (regularization) {
      facts.push({
        kind: AttendanceApprovalKinds.Regularization,
        state: regularization.status,
      });
    }
    for (const request of this.store.leaveRequests) {
      if (
        request.employee_user_id !== employeeUserId ||
        request.deleted_at ||
        request.date_from > workDate ||
        request.date_to < workDate ||
        request.status === "cancelled"
      ) continue;
      facts.push({
        kind: AttendanceApprovalKinds.Leave,
        state: request.status === "pending_manager" ? AttendanceApprovalStates.Pending : request.status,
      });
    }
    for (const request of this.store.wfhRequests) {
      if (
        request.employee_user_id !== employeeUserId ||
        request.deleted_at ||
        request.date_from > workDate ||
        request.date_to < workDate ||
        request.status === "cancelled"
      ) continue;
      facts.push({
        kind: AttendanceApprovalKinds.Wfh,
        state: request.status === "pending_manager" ? AttendanceApprovalStates.Pending : request.status,
      });
    }
    return facts;
  }

  private dayClassificationFor(input: {
    workDate: string;
    localToday: string;
    holiday: boolean;
    workingDay: boolean;
    workMode: AttendanceDayRecord["work_mode"];
    approvalFacts: AttendanceApprovalFact[];
  }) {
    if (
      input.approvalFacts.some(
        (fact) =>
          fact.kind === AttendanceApprovalKinds.Leave &&
          fact.state === AttendanceApprovalStates.Approved,
      )
    ) return AttendanceDayClassifications.Leave;
    if (
      input.approvalFacts.some(
        (fact) =>
          fact.kind === AttendanceApprovalKinds.Wfh &&
          fact.state === AttendanceApprovalStates.Approved,
      )
    ) return AttendanceDayClassifications.Wfh;
    if (input.holiday) return AttendanceDayClassifications.Holiday;
    if (!input.workingDay) return AttendanceDayClassifications.Weekend;
    if (input.workMode === "wfh") return AttendanceDayClassifications.Wfh;
    if (input.workDate > input.localToday) return AttendanceDayClassifications.Future;
    return AttendanceDayClassifications.WorkingDay;
  }

  private targetWorkMinutes(companyId: UUID): number {
    return Math.max(
      0,
      Math.round(this.company(companyId).work_hours_per_day * 60),
    );
  }

  private timezoneForUser(userId: UUID, companyId: UUID): string {
    const user = this.store.users.find(
      (candidate) => candidate.id === userId && !candidate.deleted_at,
    );
    const company = this.company(companyId);
    return user?.timezone ?? company?.timezone ?? "Asia/Kolkata";
  }

  private recordsForUsers(
    companyId: UUID,
    userIds: Set<UUID>,
    from: string,
    to: string,
  ): AttendanceDayRecord[] {
    const output: AttendanceDayRecord[] = [];
    for (const userId of userIds) {
      const timeZone = this.timezoneForUser(userId, companyId);
      for (const date of datesInclusive(from, to)) {
        output.push(this.resolveDay(companyId, userId, date, timeZone));
      }
    }
    return output.sort((a, b) => a.work_date.localeCompare(b.work_date));
  }

  private daySummary(
    records: Array<
      | AttendanceDayRecord
      | {
          status: AttendanceDayStatus;
          work_minutes: number;
          late_minutes?: number;
          exception_type?: string | null;
        }
    >,
  ) {
    return {
      present: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Present),
      ).length,
      absent: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Absent),
      ).length,
      late: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Late),
      ).length,
      wfh: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Wfh),
      ).length,
      leave: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Leave),
      ).length,
      weekend: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Weekend),
      ).length,
      holiday: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Holiday),
      ).length,
      future: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Future),
      ).length,
      missing_punch: records.filter(
        (record) => record.exception_type === "missing_punch",
      ).length,
      regularized: records.filter(
        (record) =>
          "regularization_status" in record &&
          record.regularization_status ===
            AttendanceRegularizationStatuses.Approved,
      ).length,
      work_minutes: Math.floor(records.reduce(
        (total, record) => total + ("work_seconds" in record ? record.work_seconds : record.work_minutes * 60),
        0,
      ) / 60),
    };
  }

  private teamTotals(records: AttendanceDayRecord[], totalEmployees: number) {
    return {
      total: totalEmployees,
      present: records.filter(
        (record) =>
          record.presence_state === AttendancePresenceStates.Present,
      ).length,
      absent: records.filter(
        (record) => record.presence_state === AttendancePresenceStates.Absent,
      ).length,
      late: records.filter(
        (record) =>
          record.punctuality_state === AttendancePunctualityStates.Late ||
          record.punctuality_state === AttendancePunctualityStates.LateAndEarlyDeparture,
      ).length,
      early_out: records.filter((record) => record.early_departure_seconds > 0)
        .length,
      wfh: records.filter(
        (record) => record.day_classification === AttendanceDayClassifications.Wfh,
      ).length,
      on_leave: records.filter(
        (record) => record.day_classification === AttendanceDayClassifications.Leave,
      ).length,
    };
  }

  private departmentSummary(records: AttendanceDayRecord[], users: CoreUser[]) {
    return this.store.departments
      .filter((department) => !department.deleted_at)
      .map((department) => {
        const members = users.filter(
          (user) => user.department_id === department.id,
        );
        const memberIds = new Set(members.map((user) => user.id));
        const departmentRecords = records.filter((record) =>
          memberIds.has(record.employee_user_id),
        );
        const present = departmentRecords.filter(
          (record) =>
            record.presence_state === AttendancePresenceStates.Present,
        ).length;
        return {
          department_id: department.id,
          department_code: department.department_code,
          name: department.name,
          present,
          strength: members.length,
          attendance_percent:
            members.length > 0
              ? Math.round((present / members.length) * 100)
              : 0,
        };
      })
      .filter((row) => row.strength > 0);
  }

  private visibleUsers(
    actor: AuthUser,
    companyId: UUID,
    departmentId?: UUID,
  ): CoreUser[] {
    return this.store.users.filter((user) => {
      if (
        !visibleUserPredicate(actor, user) ||
        !this.isUserInCompany(user.id, companyId)
      ) {
        return false;
      }
      if (departmentId && user.department_id !== departmentId) {
        return false;
      }
      return true;
    });
  }

  private hasVisibleSubordinates(actor: AuthUser, companyId: UUID): boolean {
    return this.visibleUsers(actor, companyId).some(
      (user) => user.id !== actor.id,
    );
  }

  private regularizationQueueCounts(
    requests: AttendanceRegularizationRequest[],
  ) {
    return {
      total: requests.length,
      pending: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Pending,
      ).length,
      approved: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Approved,
      ).length,
      returned: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Returned,
      ).length,
      rejected: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Rejected,
      ).length,
    };
  }

  private requireUser(userId: UUID): CoreUser {
    const user = this.store.users.find(
      (candidate) => candidate.id === userId && !candidate.deleted_at,
    );
    if (!user) {
      throw notFound("User not found", { id: userId });
    }
    return user;
  }

  private adminFallback(companyId: UUID): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.roles.includes(Roles.Admin) &&
          user.employment_status === EmploymentStatuses.Active &&
          !user.deleted_at &&
          this.isUserInCompany(user.id, companyId),
      ) ?? null
    );
  }

  private applyApprovedRegularizationItems(
    request: AttendanceRegularizationRequest,
    regularizationActionId: UUID,
    actor: AuthUser,
  ): void {
    const timeZone = this.timezoneForUser(
      request.employee_user_id,
      request.company_id,
    );
    for (const item of request.items) {
      let replacementPunchEventId: UUID | null = null;
      if (item.operation !== "void") {
        const result = this.recordHistoricalCorrectionInMemory(
          actor,
          request.company_id,
          request.employee_user_id,
          {
            event_type: item.event_type!,
            occurred_at: item.occurred_at!,
            reason: request.reason,
            work_mode: "office",
            metadata: {
              decided_by_user_id: actor.id,
              regularization_request_item_id: item.id,
              correction_operation: item.operation,
              target_punch_event_id: item.target_punch_event_id,
            },
            linked_regularization_request_id: request.id,
          },
          "approved_regularization",
        );
        replacementPunchEventId = result.punch_id as UUID;
      }
      this.repository.addRegularizationCorrectionApplication({
        company_id: request.company_id,
        regularization_request_id: request.id,
        regularization_request_item_id: item.id,
        regularization_action_id: regularizationActionId,
        operation: item.operation,
        target_punch_event_id: item.target_punch_event_id,
        replacement_punch_event_id: replacementPunchEventId,
        attendance_event_id: null,
        applied_by_user_id: actor.id,
        applied_at: request.decided_at!,
      });
    }
    this.recomputeDay(
      request.company_id,
      request.employee_user_id,
      request.work_date,
      timeZone,
    );
  }

  private normalizeRegularizationItems(input: RegularizationCreateInput): RegularizationItemInput[] {
    if (Boolean(input.items) === Boolean(input.requested_punches)) {
      throw badRequest("Supply exactly one of items or requested_punches.");
    }
    const items: RegularizationItemInput[] = input.items
      ? input.items.map((item) => ({
          operation: item.operation,
          target_punch_event_id: item.operation === "add" ? null : item.target_punch_event_id,
          event_type: item.operation === "void" ? null : item.event_type,
          occurred_at: item.operation === "void" ? null : item.occurred_at,
        }))
      : input.requested_punches!.map((punch) => ({
          operation: "add",
          target_punch_event_id: null,
          event_type: punch.event_type,
          occurred_at: punch.occurred_at,
        }));
    if (items.length === 0 || items.length > 20) {
      throw badRequest("Regularization requests require between 1 and 20 correction items.");
    }
    return items;
  }

  private validateRegularizationItems(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone: string,
    items: RegularizationItemInput[],
  ): void {
    if (items.length === 0) {
      throw badRequest("Attendance regularization request has no normalized items.");
    }
    const targets = new Set<UUID>();
    const adds = new Set<string>();
    for (const item of items) {
      if (item.operation === "add" || item.operation === "replace") {
        if (!item.event_type || !item.occurred_at) {
          throw badRequest("ADD and REPLACE items require event_type and occurred_at.");
        }
        if (!([AttendancePunchEventTypes.CheckIn, AttendancePunchEventTypes.CheckOut] as string[]).includes(item.event_type)) {
          throw badRequest("Regularization items support only check-in and check-out events.");
        }
        if (dateInTimeZone(item.occurred_at, timeZone) !== workDate) {
          throw badRequest("Requested punch timestamps must fall on the regularization work_date.");
        }
        const logicalKey = `${item.event_type}:${item.occurred_at}`;
        if (item.operation === "add" && adds.has(logicalKey)) {
          throw badRequest("Duplicate ADD correction items are not allowed.");
        }
        if (item.operation === "add") adds.add(logicalKey);
      }
      if (item.operation === "add") {
        if (item.target_punch_event_id) throw badRequest("ADD items cannot target an existing punch.");
        continue;
      }
      if (!item.target_punch_event_id) {
        throw badRequest("REPLACE and VOID items require target_punch_event_id.");
      }
      if (targets.has(item.target_punch_event_id)) {
        throw badRequest("A target punch may be corrected only once per request.");
      }
      targets.add(item.target_punch_event_id);
      const target = this.store.attendancePunches.find((punch) =>
        punch.id === item.target_punch_event_id && !punch.deleted_at,
      );
      if (!target || target.company_id !== companyId) {
        throw badRequest("Target punch does not belong to the active company.");
      }
      if (target.employee_user_id !== employeeUserId) {
        throw badRequest("Target punch does not belong to the regularization employee.");
      }
      if (!([AttendancePunchEventTypes.CheckIn, AttendancePunchEventTypes.CheckOut] as string[]).includes(target.event_type)) {
        throw badRequest("Target punch type is not eligible for regularization correction.");
      }
      if (dateInTimeZone(target.occurred_at, timeZone) !== workDate) {
        throw badRequest("Target punch must belong to the regularization work_date.");
      }
      if (this.store.attendanceRegularizationCorrectionApplications.some(
        (application) => application.target_punch_event_id === target.id,
      )) {
        throw conflict("Target punch was already replaced or voided.");
      }
      if (item.operation === "void" && (item.event_type || item.occurred_at)) {
        throw badRequest("VOID items cannot include replacement event data.");
      }
    }
  }

  private presentPunch(punch: AttendancePunch, timeZone: string) {
    return {
      ...punch,
      work_date: dateInTimeZone(punch.occurred_at, timeZone),
      time: timeText(punch.occurred_at, timeZone),
    };
  }

  private presentDay(day: AttendanceDayRecord, timeZone: string) {
    return {
      ...day,
      in_time: timeText(day.first_check_in, timeZone),
      out_time: timeText(day.last_check_out, timeZone),
      hours: minutesToHours(day.work_minutes),
      break_hours: minutesToHours(day.break_minutes),
      detail: this.exceptionDetail(day),
    };
  }

  private presentRegularization(request: AttendanceRegularizationRequest) {
    const user = this.store.users.find(
      (candidate) => candidate.id === request.employee_user_id,
    );
    const approver = request.current_approver_user_id
      ? this.store.users.find(
          (candidate) => candidate.id === request.current_approver_user_id,
        )
      : undefined;
    const items = [...request.items].sort((left, right) => left.ordinal - right.ordinal);
    return {
      ...request,
      items,
      requested_punches: items.flatMap((item) =>
        item.event_type && item.occurred_at
          ? [{ event_type: item.event_type, occurred_at: item.occurred_at }]
          : [],
      ),
      employee: userLabel(user),
      approver: approver ? userLabel(approver) : null,
    };
  }

  private presentException(
    record: AttendanceDayRecord,
    request: AttendanceRegularizationRequest | undefined,
    actor: AuthUser,
  ) {
    const user = this.store.users.find(
      (candidate) => candidate.id === record.employee_user_id,
    );
    const exceptionType = request ? "correction" : record.exception_type;
    return {
      id: request?.id ?? record.id,
      request_id: request?.id ?? null,
      employee_user_id: record.employee_user_id,
      employee: userLabel(user).full_name,
      employee_code: userLabel(user).employee_code,
      date: record.work_date,
      exception_type: exceptionType,
      detail: request?.reason ?? this.exceptionDetail(record),
      status: request?.status ?? record.regularization_status ?? "pending",
      expected_version: request?.version ?? record.version,
      can_decide: Boolean(
        request &&
        request.status === AttendanceRegularizationStatuses.Pending &&
        actor.id !== request.employee_user_id &&
        (canSeeAllAttendance(actor) ||
          request.current_approver_user_id === actor.id),
      ),
      record: this.presentDay(
        record,
        this.timezoneForUser(record.employee_user_id, record.company_id),
      ),
      request: request ? this.presentRegularization(request) : null,
    };
  }

  private exceptionDetail(
    record: Pick<
      AttendanceDayRecord,
      | "exception_type"
      | "late_minutes"
      | "early_out_minutes"
      | "work_minutes"
      | "note"
    >,
  ): string {
    if (record.exception_type === "late") {
      return `Late by ${minutesToText(record.late_minutes)}`;
    }
    if (record.exception_type === "early_out") {
      return `Early out by ${minutesToText(record.early_out_minutes)}`;
    }
    if (record.note) {
      return record.note;
    }
    if (record.exception_type === "missing_punch") {
      return "Missing punch-out";
    }
    if (record.exception_type === "absent") {
      return "No punch-in recorded";
    }
    return record.work_minutes > 0
      ? minutesToHours(record.work_minutes)
      : "No attendance for this day";
  }
}

function datesInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function textFilter(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
const memoryHistoricalCorrectionIdempotency = new WeakMap<
  MemoryDataStore,
  Map<string, { requestHash: string; response: Record<string, unknown> }>
>();
