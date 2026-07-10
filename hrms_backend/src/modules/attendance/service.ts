import { randomUUID } from "node:crypto";
import type {
  AttendanceDayRecord,
  AttendancePunch,
  AttendancePunchEventType,
  AttendanceRegularizationRequest,
  AuthUser,
  CoreUser,
  UUID
} from "#shared";
import {
  AttendanceDayStatuses,
  AttendancePunchEventTypes,
  AttendanceRegularizationStatuses,
  EmploymentStatuses,
  Roles
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, missingRemarks, notFound } from "../../platform/errors.js";
import { createGeneratedExportDocument, type GeneratedExportFormat } from "../../platform/generated-exports.js";
import { isWorkingDate } from "../../platform/work-schedule.js";
import { CoreService } from "../core/service.js";
import { appendAttendanceOutboxEvent, attendanceEvents } from "./events.js";
import {
  assertCanDecideRegularization,
  assertCanSeeAttendanceUser,
  assertCanUseSelfAttendance,
  canSeeAllAttendance,
  canSeeAttendanceUser
} from "./policy.js";
import { AttendanceRepository } from "./repository.js";

export interface AttendancePageQuery {
  page: number;
  page_size: number;
  sort?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  month?: string;
  user_id?: UUID;
  department_id?: UUID;
  status?: string;
  exception_type?: string;
}

export interface AttendanceExportInput {
  filters?: Record<string, unknown>;
  columns?: string[];
  format?: "csv" | "xlsx" | "json";
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
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
      day: "2-digit"
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

function monthRange(monthInput?: string, timeZone = "UTC"): { month: string; from: string; to: string } {
  const month = monthInput && /^\d{4}-\d{2}$/u.test(monthInput) ? monthInput : todayDate(timeZone).slice(0, 7);
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month, from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function dateRange(query: AttendancePageQuery, timeZone = "UTC"): { from: string; to: string } {
  if (query.month) {
    const range = monthRange(query.month, timeZone);
    return { from: range.from, to: range.to };
  }
  return {
    from: query.date_from ?? todayDate(timeZone).slice(0, 7) + "-01",
    to: query.date_to ?? todayDate(timeZone)
  };
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
}

function clockIso(workDate: string, hour: number, minute: number): string {
  return `${workDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function zonedClockIso(workDate: string, hour: number, minute: number, timeZone: string): string {
  const [yearText, monthText, dayText] = workDate.split("-");
  const utcGuess = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), hour, minute)
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
      hourCycle: "h23"
    }).formatToParts(utcGuess);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(map.get("year")),
      Number(map.get("month")) - 1,
      Number(map.get("day")),
      Number(map.get("hour")),
      Number(map.get("minute")),
      Number(map.get("second"))
    );
    const desiredUtc = Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      hour,
      minute,
      0
    );
    return new Date(utcGuess.getTime() - (renderedAsUtc - desiredUtc)).toISOString();
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

function numberConfig(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = config[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanConfig(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function timeConfig(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value.trim()) ? value.trim() : fallback;
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
      hourCycle: "h23"
    }).format(new Date(value));
  } catch {
    return value.slice(11, 16);
  }
}

function userLabel(user: CoreUser | undefined): { employee_code: string; full_name: string } {
  return {
    employee_code: user?.employee_code ?? "UNKNOWN",
    full_name: user?.full_name ?? "Unknown employee"
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

export class AttendanceService {
  private readonly repository: AttendanceRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new AttendanceRepository(store);
    this.core = new CoreService(store);
  }

  punch(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at?: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: "web" | "mobile" | "kiosk" | "admin";
      metadata: Record<string, unknown>;
    }
  ) {
    assertCanUseSelfAttendance(actor);
    const occurredAt = input.occurred_at ?? nowIso();
    const timeZone = this.timezoneForUser(actor.id);
    this.autoPunchOutExpiredSessions(actor.id, timeZone, occurredAt);
    const workDate = this.workDateForPunch(actor.id, input.event_type, occurredAt, timeZone);
    const availability = this.punchAvailability(actor.id, workDate, timeZone, occurredAt);
    if (!availability.next_allowed_actions.includes(input.event_type)) {
      const policyReason = availability.blocked_action_reasons[input.event_type];
      if (availability.sequence_allowed_actions.includes(input.event_type) && policyReason) {
        throw badRequest(policyReason, {
          next_allowed_actions: availability.next_allowed_actions,
          requested_action: input.event_type,
          punch_policy: this.presentPunchPolicy(availability)
        });
      }
      throw conflict("Attendance punch is duplicate or out of sequence.", {
        next_allowed_actions: availability.next_allowed_actions,
        requested_action: input.event_type
      });
    }
    const punch = this.repository.addPunch({
      employee_user_id: actor.id,
      event_type: input.event_type,
      occurred_at: occurredAt,
      work_mode: input.work_mode,
      source: input.source,
      metadata: input.metadata
    });
    const day = this.recomputeDay(actor.id, workDate, timeZone, occurredAt);
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: punch.id,
      eventType: attendanceEvents.Punched,
      payload: {
        punch_id: punch.id,
        employee_user_id: actor.id,
        event_type: punch.event_type,
        occurred_at: punch.occurred_at,
        work_date: workDate,
        day_status: day.status
      },
      idempotencyKey: `attendance.punched:${punch.id}`
    });
    const nextAvailability = this.punchAvailability(actor.id, workDate, timeZone, occurredAt);
    return {
      punch_id: punch.id,
      punch,
      day_status: this.presentDay(day, timeZone),
      next_allowed_actions: nextAvailability.next_allowed_actions,
      next_allowed_action: nextAvailability.next_allowed_actions[0] ?? null,
      punch_policy: this.presentPunchPolicy(nextAvailability)
    };
  }

  listMyPunches(actor: AuthUser, query: AttendancePageQuery) {
    assertCanUseSelfAttendance(actor);
    const timeZone = this.timezoneForUser(actor.id);
    this.autoPunchOutExpiredSessions(actor.id, timeZone);
    const range = dateRange(query, timeZone);
    const punches = this.repository.listPunches(actor.id, range.from, range.to, timeZone).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return page(punches.map((punch) => this.presentPunch(punch, timeZone)), query.page, query.page_size);
  }

  mySummary(actor: AuthUser, query: AttendancePageQuery) {
    assertCanUseSelfAttendance(actor);
    const timeZone = this.timezoneForUser(actor.id);
    const range = dateRange(query, timeZone);
    const today = this.resolveDay(actor.id, todayDate(timeZone), timeZone);
    const availabilityWorkDate = this.openSessionWorkDate(actor.id, nowIso(), timeZone) ?? today.work_date;
    const todayPunchAvailability = this.punchAvailability(actor.id, availabilityWorkDate, timeZone);
    const records = this.recordsForUsers(new Set([actor.id]), range.from, range.to).map((record) =>
      record.employee_user_id === actor.id && record.work_date === today.work_date ? today : record
    );
    const weekRecords = this.weekRecords(actor.id, timeZone);
    const weeklyBalance = this.weeklyBalance(weekRecords);
    const targetWorkMinutes = this.targetWorkMinutes();
    const exceptionHistory = records
      .filter((record) => record.exception_type || record.regularization_status)
      .sort((a, b) => b.work_date.localeCompare(a.work_date))
      .slice(0, 10)
      .map((record) => ({
        date: record.work_date,
        reason: this.exceptionDetail(record),
        status: record.regularization_status ?? record.status
      }));
    return {
      generated_at: nowIso(),
      range,
      today: {
        ...this.presentDay(today, timeZone),
        target_work_minutes: targetWorkMinutes,
        target_hours: minutesToHours(targetWorkMinutes),
        next_allowed_actions: todayPunchAvailability.next_allowed_actions,
        next_allowed_action: todayPunchAvailability.next_allowed_actions[0] ?? null,
        punch_policy: this.presentPunchPolicy(todayPunchAvailability)
      },
      summary: {
        ...this.daySummary(records),
        target_work_minutes: targetWorkMinutes,
        target_hours: minutesToHours(targetWorkMinutes),
        weekly_balance: weeklyBalance
      },
      week_records: weekRecords.map((record) => this.presentDay(record, timeZone)),
      weekly_balance: weeklyBalance,
      exception_history: exceptionHistory
    };
  }

  teamSummary(actor: AuthUser, query: AttendancePageQuery) {
    const date = query.date_from ?? todayDate(this.timezoneForUser(actor.id));
    const visibleUsers = this.visibleUsers(actor, query.department_id);
    const activeUsers = visibleUsers.filter((user) => user.employment_status === EmploymentStatuses.Active);
    const records = activeUsers.map((user) => this.resolveDay(user.id, date, this.timezoneForUser(user.id)));
    const exceptions = this.exceptions(actor, { ...query, page: 1, page_size: 8, date_from: date, date_to: date }).items;
    return {
      generated_at: nowIso(),
      date,
      totals: this.teamTotals(records, activeUsers.length),
      department_summary: this.departmentSummary(records, activeUsers),
      exceptions
    };
  }

  monthlyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const user = query.user_id ? this.requireUser(query.user_id) : this.requireUser(actor.id);
    if (user.id === actor.id) {
      assertCanUseSelfAttendance(actor);
    }
    assertCanSeeAttendanceUser(actor, user);
    const timeZone = this.timezoneForUser(user.id);
    const range = monthRange(query.month, timeZone);
    const days = new Date(`${range.to}T00:00:00.000Z`).getUTCDate();
    const calendarDays = Array.from({ length: days }, (_, index) => {
      const date = `${range.month}-${String(index + 1).padStart(2, "0")}`;
      return this.presentDay(this.resolveDay(user.id, date, timeZone), timeZone);
    });
    return {
      generated_at: nowIso(),
      month: range.month,
      user: userLabel(user),
      calendar_days: calendarDays,
      summary: this.daySummary(calendarDays)
    };
  }

  dailyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const date = query.date ?? query.date_from ?? todayDate(this.timezoneForUser(actor.id));
    const users = query.user_id ? [this.requireUser(query.user_id)] : this.visibleUsers(actor, query.department_id);
    for (const user of users) {
      assertCanSeeAttendanceUser(actor, user);
    }
    const activeUsers = users.filter((user) => user.employment_status === EmploymentStatuses.Active);
    const userIds = new Set(activeUsers.map((user) => user.id));
    const records = activeUsers.map((user) => this.resolveDay(user.id, date, this.timezoneForUser(user.id)));
    const regularizations = this.repository.listRegularizations({
      userIds,
      dateFrom: date,
      dateTo: date
    });
    const regularizationByUser = new Map(regularizations.map((request) => [request.employee_user_id, request]));
    const items = records
      .map((record) => {
        const user = activeUsers.find((candidate) => candidate.id === record.employee_user_id);
        const request = regularizationByUser.get(record.employee_user_id);
        const timeZone = this.timezoneForUser(record.employee_user_id);
        return {
          ...this.presentDay(record, timeZone),
          employee: userLabel(user),
          regularization: request ? this.presentRegularization(request) : null,
          regularization_pending: request?.status === AttendanceRegularizationStatuses.Pending,
          can_decide_regularization: Boolean(
            request &&
            request.status === AttendanceRegularizationStatuses.Pending &&
            actor.id !== request.employee_user_id &&
            (canSeeAllAttendance(actor) || request.current_approver_user_id === actor.id)
          )
        };
      })
      .sort((a, b) => a.employee.employee_code.localeCompare(b.employee.employee_code));
    return {
      ...page(items, query.page, query.page_size),
      generated_at: nowIso(),
      date,
      summary: this.daySummary(records),
      exceptions: this.exceptions(actor, { ...query, page: 1, page_size: 20, date_from: date, date_to: date }).items,
      totals: this.teamTotals(records, activeUsers.length)
    };
  }

  createRegularization(
    actor: AuthUser,
    input: {
      work_date: string;
      reason: string;
      requested_punches: Array<{ event_type: AttendancePunchEventType; occurred_at: string }>;
    }
  ) {
    const approver = this.core.resolveImmediateManager(actor.id) ?? this.adminFallback();
    const request = this.repository.addRegularization({
      employee_user_id: actor.id,
      work_date: input.work_date,
      reason: input.reason.trim(),
      requested_punches: input.requested_punches,
      status: AttendanceRegularizationStatuses.Pending,
      current_approver_user_id: approver?.id ?? null
    });
    const day = this.resolveDay(actor.id, input.work_date, this.timezoneForUser(actor.id));
    day.regularization_status = AttendanceRegularizationStatuses.Pending;
    day.updated_at = nowIso();
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: request.id,
      eventType: attendanceEvents.RegularizationSubmitted,
      payload: {
        request_id: request.id,
        employee_user_id: actor.id,
        approver_user_id: request.current_approver_user_id,
        work_date: request.work_date,
        status: request.status
      },
      idempotencyKey: `attendance.regularization.submitted:${request.id}`
    });
    return this.presentRegularization(request);
  }

  myRegularizations(actor: AuthUser, query: AttendancePageQuery) {
    const range = dateRange(query, this.timezoneForUser(actor.id));
    const requests = this.repository.listRegularizations({
      userIds: new Set([actor.id]),
      status: query.status,
      dateFrom: range.from,
      dateTo: range.to
    });
    return page(requests.map((request) => this.presentRegularization(request)), query.page, query.page_size);
  }

  managerRegularizationQueue(actor: AuthUser, query: AttendancePageQuery) {
    if (!canSeeAllAttendance(actor) && !this.hasVisibleSubordinates(actor)) {
      throw forbidden("Only managers, HR, Admin, or Auditor users can read attendance regularization queues.");
    }
    const range = dateRange(query, this.timezoneForUser(actor.id));
    const visibleUsers = this.visibleUsers(actor, query.department_id).filter((user) => user.id !== actor.id);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const scoped = this.repository
      .listRegularizations({ userIds: visibleUserIds, dateFrom: range.from, dateTo: range.to })
      .filter((request) => canSeeAllAttendance(actor) || request.current_approver_user_id === actor.id);
    const status = query.status ?? AttendanceRegularizationStatuses.Pending;
    const filtered = scoped.filter((request) => !status || request.status === status);
    return {
      ...page(filtered.map((request) => this.presentRegularization(request)), query.page, query.page_size),
      queue_counts: this.regularizationQueueCounts(scoped)
    };
  }

  exceptions(actor: AuthUser, query: AttendancePageQuery) {
    const actorTimeZone = this.timezoneForUser(actor.id);
    const range = {
      from: query.date_from ?? todayDate(actorTimeZone).slice(0, 7) + "-01",
      to: query.date_to ?? todayDate(actorTimeZone)
    };
    const visibleUsers = this.visibleUsers(actor, query.department_id);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const regularizations = this.repository.listRegularizations({
      userIds: visibleUserIds,
      status: AttendanceRegularizationStatuses.Pending,
      dateFrom: range.from,
      dateTo: range.to
    });
    const regularizationByUserDate = new Map(
      regularizations.map((request) => [`${request.employee_user_id}:${request.work_date}`, request])
    );
    for (const user of visibleUsers) {
      const timeZone = this.timezoneForUser(user.id);
      for (const date of datesInclusive(range.from, range.to)) {
        this.resolveDay(user.id, date, timeZone);
      }
    }
    const dayExceptions = this.repository
      .listDayRecords({ userIds: visibleUserIds, dateFrom: range.from, dateTo: range.to })
      .filter((record) => record.exception_type || record.regularization_status === AttendanceRegularizationStatuses.Pending)
      .map((record) => this.presentException(record, regularizationByUserDate.get(`${record.employee_user_id}:${record.work_date}`), actor));
    const requestExceptions = regularizations
      .filter((request) => !dayExceptions.some((exception) => exception.request_id === request.id))
      .map((request) => this.presentException(this.resolveDay(request.employee_user_id, request.work_date), request, actor));
    const items = [...dayExceptions, ...requestExceptions]
      .filter((exception) => !query.exception_type || exception.exception_type === query.exception_type)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const result = page(items, query.page, query.page_size);
    return {
      ...result,
      totals: {
        late: items.filter((item) => item.exception_type === "late").length,
        missing_punch: items.filter((item) => item.exception_type === "missing_punch").length,
        absent: items.filter((item) => item.exception_type === "absent").length,
        correction: items.filter((item) => item.exception_type === "correction").length
      }
    };
  }

  decideRegularization(actor: AuthUser, id: UUID, input: { decision: "approve" | "reject" | "return"; remarks?: string; expected_version: number }) {
    const current = this.repository.findRegularization(id);
    if (current.version !== input.expected_version) {
      throw conflict("Attendance regularization request was modified by another actor.", {
        aggregate: "attendance_regularization",
        id
      });
    }
    assertCanDecideRegularization(actor, current);
    if (["reject", "return"].includes(input.decision) && !input.remarks?.trim()) {
      throw missingRemarks(input.decision);
    }
    const previousStatus = current.status;
    if (previousStatus !== AttendanceRegularizationStatuses.Pending) {
      throw conflict("Only pending attendance regularization requests can be decided.", {
        request_id: id,
        status: previousStatus
      });
    }
    const nextStatus =
      input.decision === "approve"
        ? AttendanceRegularizationStatuses.Approved
        : input.decision === "reject"
          ? AttendanceRegularizationStatuses.Rejected
          : AttendanceRegularizationStatuses.Returned;
    const request = this.repository.updateRegularizationVersioned(id, input.expected_version, (candidate) => {
      candidate.status = nextStatus;
      candidate.current_approver_user_id = null;
      candidate.decision_remarks = input.remarks?.trim() ?? null;
      candidate.decided_by_user_id = actor.id;
      candidate.decided_at = nowIso();
    });
    if (input.decision === "approve" && request.requested_punches.length > 0) {
      this.applyApprovedPunches(request, actor.id);
    }
    const requestTimeZone = this.timezoneForUser(request.employee_user_id);
    const day = this.resolveDay(request.employee_user_id, request.work_date, requestTimeZone);
    day.regularization_status = nextStatus;
    if (nextStatus === AttendanceRegularizationStatuses.Approved && day.exception_type) {
      day.exception_type = null;
      day.status = day.work_mode === "wfh" ? AttendanceDayStatuses.Wfh : AttendanceDayStatuses.Present;
      day.note = "Regularized";
    }
    day.updated_at = nowIso();
    day.version += 1;
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: request.id,
      eventType: this.eventForDecision(input.decision),
      payload: {
        request_id: request.id,
        actor_user_id: actor.id,
        employee_user_id: request.employee_user_id,
        decision: input.decision,
        previous_status: previousStatus,
        next_status: nextStatus,
        version: request.version
      },
      idempotencyKey: `attendance.regularization.${input.decision}:${request.id}:${request.version}`
    });
    return {
      ...this.presentRegularization(request),
      previous_status: previousStatus,
      next_status: nextStatus,
      day_status: this.presentDay(day, requestTimeZone)
    };
  }

  async createExportJob(actor: AuthUser, input: AttendanceExportInput) {
    if (!canSeeAllAttendance(actor)) {
      throw forbidden("Only HR, Admin, or Auditor users can export attendance data.");
    }
    const jobId = randomUUID();
    const format = input.format ?? "csv";
    const columns = input.columns?.length
      ? input.columns
      : ["employee_code", "employee", "date", "status", "in_time", "out_time", "hours"];
    const filters = input.filters ?? {};
    const createdAt = nowIso();
    const rows = this.exportRows(filters);
    const generated = await createGeneratedExportDocument(this.store, {
      actor,
      businessObjectType: "attendance_export",
      businessObjectId: jobId,
      reportType: "attendance",
      format: format as GeneratedExportFormat,
      rows,
      columns,
      filters,
      filePrefix: "attendance-export"
    });
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: jobId,
      eventType: attendanceEvents.ExportRequested,
      payload: {
        job_id: jobId,
        requested_by_user_id: actor.id,
        filters,
        columns,
        format,
        status: generated.status,
        adapter: generated.adapter,
        download_document_id: generated.download_document_id,
        download_url: generated.download_url,
        file_name: generated.file_name,
        row_count: generated.row_count,
        size_bytes: generated.size_bytes,
        generated_at: generated.generated_at
      },
      idempotencyKey: `attendance.export.requested:${jobId}`
    });
    return {
      job_id: jobId,
      status: generated.status,
      format,
      filters,
      columns,
      requested_by_user_id: actor.id,
      created_at: createdAt,
      adapter: generated.adapter,
      download_document_id: generated.download_document_id,
      download_url: generated.download_url,
      file_name: generated.file_name,
      row_count: generated.row_count,
      size_bytes: generated.size_bytes,
      generated_at: generated.generated_at
    };
  }

  private exportRows(filters: Record<string, unknown>): Array<Record<string, unknown>> {
    return this.store.attendanceDayRecords
      .filter((record) => !record.deleted_at)
      .filter((record) => !textFilter(filters.user_id) || record.employee_user_id === textFilter(filters.user_id))
      .filter((record) => !textFilter(filters.employee_user_id) || record.employee_user_id === textFilter(filters.employee_user_id))
      .filter((record) => !textFilter(filters.status) || record.status === textFilter(filters.status))
      .filter((record) => !textFilter(filters.date_from) || record.work_date >= textFilter(filters.date_from)!)
      .filter((record) => !textFilter(filters.date_to) || record.work_date <= textFilter(filters.date_to)!)
      .filter((record) => {
        const user = this.store.users.find((candidate) => candidate.id === record.employee_user_id);
        return !textFilter(filters.department_id) || user?.department_id === textFilter(filters.department_id);
      })
      .sort((left, right) => right.work_date.localeCompare(left.work_date))
      .map((record) => {
        const user = this.store.users.find((candidate) => candidate.id === record.employee_user_id);
        const department = user ? this.store.departments.find((candidate) => candidate.id === user.department_id) : null;
        const timeZone = this.timezoneForUser(record.employee_user_id);
        return {
          id: record.id,
          employee_user_id: record.employee_user_id,
          employee_code: user?.employee_code ?? "",
          employee: user?.full_name ?? record.employee_user_id,
          department: department?.name ?? "",
          date: record.work_date,
          work_date: record.work_date,
          status: record.status,
          in_time: timeText(record.first_check_in, timeZone) ?? "",
          out_time: timeText(record.last_check_out, timeZone) ?? "",
          hours: Math.round((record.work_minutes / 60) * 100) / 100,
          late_minutes: record.late_minutes,
          early_out_minutes: record.early_out_minutes,
          work_mode: record.work_mode ?? "",
          exception_type: record.exception_type ?? "",
          note: record.note ?? ""
        };
      });
  }

  private nextAllowedActions(punches: AttendancePunch[]): AttendancePunchEventType[] {
    const active = punches.filter((punch) => !punch.deleted_at).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const last = active.at(-1);
    if (!last) {
      return [AttendancePunchEventTypes.CheckIn];
    }
    if (last.event_type === AttendancePunchEventTypes.CheckIn || last.event_type === AttendancePunchEventTypes.BreakEnd) {
      return [AttendancePunchEventTypes.BreakStart, AttendancePunchEventTypes.CheckOut];
    }
    if (last.event_type === AttendancePunchEventTypes.BreakStart) {
      return [AttendancePunchEventTypes.BreakEnd];
    }
    return [];
  }

  private punchAvailability(
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId),
    occurredAt = nowIso()
  ): PunchAvailability {
    const punches = this.punchesForWorkDate(employeeUserId, workDate, timeZone);
    const sequenceAllowedActions = this.nextAllowedActions(punches);
    const policy = this.attendancePolicy();
    const activePunches = punches.filter((punch) => !punch.deleted_at);
    const localTime = timeText(occurredAt, timeZone) ?? occurredAt.slice(11, 16);
    const isCompanyWorkingDay = this.isWorkingDay(workDate);
    const blockedActionReasons: Partial<Record<AttendancePunchEventType, string>> = {};
    const nextAllowedActions: AttendancePunchEventType[] = [];

    for (const action of sequenceAllowedActions) {
      const blockedReason = this.punchActionBlockedReason(action, policy, {
        activePunches: activePunches.length,
        isCompanyWorkingDay,
        localTime
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
      blocked_reason: nextAllowedActions.length === 0 ? Object.values(blockedActionReasons)[0] ?? null : null,
      local_time: localTime,
      is_company_working_day: isCompanyWorkingDay
    };
  }

  private punchActionBlockedReason(
    action: AttendancePunchEventType,
    policy: AttendancePunchPolicy,
    context: { activePunches: number; isCompanyWorkingDay: boolean; localTime: string }
  ): string | null {
    if (action === AttendancePunchEventTypes.CheckIn && !policy.allowOffDayPunches && !context.isCompanyWorkingDay && context.activePunches === 0) {
      return "Punch-in is not allowed on company off days.";
    }
    if (policy.fullDayPunchWindow) {
      return null;
    }
    if (action === AttendancePunchEventTypes.CheckIn && !withinClockWindow(context.localTime, policy.punchInStart, policy.punchInEnd)) {
      return "Punch-in is allowed between " + policy.punchInStart + " and " + policy.punchInEnd + ".";
    }
    if (action === AttendancePunchEventTypes.CheckOut && !withinClockWindow(context.localTime, policy.punchOutStart, policy.punchOutEnd)) {
      return "Punch-out is allowed between " + policy.punchOutStart + " and " + policy.punchOutEnd + ".";
    }
    return null;
  }

  private presentPunchPolicy(availability: PunchAvailability): Record<string, unknown> {
    return {
      punch_window_mode: availability.policy.fullDayPunchWindow ? "full_day" : "restricted",
      full_day_punch_window: availability.policy.fullDayPunchWindow,
      punch_in_start: availability.policy.punchInStart,
      punch_in_end: availability.policy.punchInEnd,
      punch_out_start: availability.policy.punchOutStart,
      punch_out_end: availability.policy.punchOutEnd,
      auto_punch_out_enabled: availability.policy.autoPunchOutEnabled,
      auto_punch_out_time: availability.policy.autoPunchOutTime,
      allow_off_day_punches: availability.policy.allowOffDayPunches,
      is_company_working_day: availability.is_company_working_day,
      local_time: availability.local_time,
      can_punch_now: availability.next_allowed_actions.length > 0,
      blocked_reason: availability.blocked_reason,
      blocked_action_reasons: availability.blocked_action_reasons
    };
  }

  private autoPunchOutCutoffIso(
    workDate: string,
    firstCheckInAt: string,
    policy: AttendancePunchPolicy,
    timeZone: string
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
      input.timeZone
    );
    if (Date.parse(cutoffIso) > Date.parse(input.referenceIso)) {
      return null;
    }
    const closeAt = Date.parse(input.lastOpenPunch.occurred_at) > Date.parse(cutoffIso)
      ? input.lastOpenPunch.occurred_at
      : cutoffIso;
    const metadata = {
      auto_punch_out: true,
      auto_punch_out_time: input.policy.autoPunchOutTime,
      auto_punch_out_reason: "Configured attendance day-end cutoff",
      auto_punch_out_trigger: input.trigger
    };
    const createdPunches: AttendancePunch[] = [];

    if (input.lastOpenPunch.event_type === AttendancePunchEventTypes.BreakStart) {
      createdPunches.push(this.repository.addPunch({
        employee_user_id: input.employeeUserId,
        event_type: AttendancePunchEventTypes.BreakEnd,
        occurred_at: closeAt,
        work_mode: input.lastOpenPunch.work_mode,
        source: "admin",
        metadata
      }));
    }

    createdPunches.push(this.repository.addPunch({
      employee_user_id: input.employeeUserId,
      event_type: AttendancePunchEventTypes.CheckOut,
      occurred_at: closeAt,
      work_mode: input.lastOpenPunch.work_mode,
      source: "admin",
      metadata
    }));
    return {
      employee_user_id: input.employeeUserId,
      work_date: input.workDate,
      first_check_in_id: input.firstCheckIn.id,
      first_check_in_at: input.firstCheckIn.occurred_at,
      last_open_punch_id: input.lastOpenPunch.id,
      closed_at: closeAt,
      created_punches: createdPunches,
      day_record: null
    };
  }

  private autoPunchOutExpiredSessions(
    employeeUserId: UUID,
    timeZone: string,
    referenceIso = nowIso(),
    trigger: "api" | "worker" = "api"
  ): AttendanceAutoPunchOutClosure[] {
    const punches = this.store.attendancePunches
      .filter((punch) => punch.employee_user_id === employeeUserId && !punch.deleted_at && punch.occurred_at <= referenceIso)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    let openWorkDate: string | null = null;
    let firstCheckIn: AttendancePunch | null = null;
    let lastOpenPunch: AttendancePunch | null = null;
    const policy = this.attendancePolicy();
    const closures: AttendanceAutoPunchOutClosure[] = [];
    if (!policy.autoPunchOutEnabled) {
      return closures;
    }

    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
        if (openWorkDate && firstCheckIn && lastOpenPunch) {
          const closure = this.addAutoPunchOutIfExpired({
            employeeUserId,
            workDate: openWorkDate,
            firstCheckIn,
            lastOpenPunch,
            timeZone,
            referenceIso,
            policy,
            trigger
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
        employeeUserId,
        workDate: openWorkDate,
        firstCheckIn,
        lastOpenPunch,
        timeZone,
        referenceIso,
        policy,
        trigger
      });
      if (closure) {
        closures.push(closure);
      }
    }
    return closures;
  }

  autoPunchOutExpiredSessionsForAll(input: { referenceIso?: string; batchSize?: number } = {}): AttendanceAutoPunchOutRunResult {
    const referenceIso = input.referenceIso ?? nowIso();
    const batchSize = Math.max(1, Math.floor(input.batchSize ?? Number.MAX_SAFE_INTEGER));
    const candidateUserIds = Array.from(new Set(
      this.store.attendancePunches
        .filter((punch) => !punch.deleted_at && punch.occurred_at <= referenceIso)
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        .map((punch) => punch.employee_user_id)
    ));
    const closures: AttendanceAutoPunchOutClosure[] = [];
    let scannedUsers = 0;
    let dayRecordsRecomputed = 0;

    for (const employeeUserId of candidateUserIds) {
      if (scannedUsers >= batchSize) {
        break;
      }
      const user = this.store.users.find((candidate) => candidate.id === employeeUserId && !candidate.deleted_at);
      if (!user || user.employment_status !== EmploymentStatuses.Active) {
        continue;
      }
      scannedUsers += 1;
      const timeZone = this.timezoneForUser(employeeUserId);
      const userClosures = this.autoPunchOutExpiredSessions(employeeUserId, timeZone, referenceIso, "worker");
      const affectedWorkDates = new Set(userClosures.map((closure) => closure.work_date));
      for (const workDate of affectedWorkDates) {
        const dayRecord = this.recomputeDay(employeeUserId, workDate, timeZone, referenceIso);
        dayRecordsRecomputed += 1;
        for (const closure of userClosures) {
          if (closure.work_date === workDate) {
            closure.day_record = dayRecord;
          }
        }
      }
      closures.push(...userClosures);
    }

    return {
      reference_iso: referenceIso,
      scanned_users: scannedUsers,
      closed_sessions: closures.length,
      punches_created: closures.reduce((total, closure) => total + closure.created_punches.length, 0),
      day_records_recomputed: dayRecordsRecomputed,
      closures
    };
  }

  private recomputeDay(
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId),
    referenceIso = nowIso()
  ): AttendanceDayRecord {
    this.autoPunchOutExpiredSessions(employeeUserId, timeZone, referenceIso);
    const punches = this.punchesForWorkDate(employeeUserId, workDate, timeZone);
    const checkIns = punches.filter((punch) => punch.event_type === AttendancePunchEventTypes.CheckIn);
    const checkOuts = punches.filter((punch) => punch.event_type === AttendancePunchEventTypes.CheckOut);
    const firstCheckIn = checkIns[0]?.occurred_at ?? null;
    const lastCheckOut = checkOuts.at(-1)?.occurred_at ?? null;
    const workMode = punches.find((punch) => punch.work_mode)?.work_mode ?? null;
    const localToday = todayDate(timeZone);
    const isPast = workDate < localToday;
    const isFuture = workDate > localToday;
    const policy = this.attendancePolicy();
    const holiday = this.holidayForDate(workDate);
    const workingDay = this.isWorkingDay(workDate);
    const shiftStart = zonedClockIso(workDate, 9, 30, timeZone);
    const shiftEnd = addMinutes(shiftStart, this.targetWorkMinutes());
    const rawLateMinutes = firstCheckIn ? Math.max(0, minutesBetween(shiftStart, firstCheckIn)) : 0;
    const lateMinutes = rawLateMinutes > policy.graceMinutes ? rawLateMinutes : 0;
    const earlyOutMinutes = lastCheckOut && isPast ? Math.max(0, minutesBetween(lastCheckOut, shiftEnd)) : 0;
    const workEnd = lastCheckOut ?? (workDate === localToday ? nowIso() : firstCheckIn);
    const breakMinutes = this.breakMinutesUntil(punches, workDate === localToday ? workEnd : null);
    const totalMinutes = firstCheckIn && workEnd ? Math.max(0, minutesBetween(firstCheckIn, workEnd) - breakMinutes) : 0;
    const autoAbsentAt = addMinutes(shiftStart, policy.autoMarkAbsentMinutes);
    const canMarkAbsentToday = workDate === localToday && Date.parse(nowIso()) >= Date.parse(autoAbsentAt);
    const missingPunch = Boolean(firstCheckIn && !lastCheckOut && isPast);
    const absent = !firstCheckIn && workingDay && !holiday && (isPast || canMarkAbsentToday);
    const exceptionType = absent ? "absent" : missingPunch ? "missing_punch" : lateMinutes > 0 ? "late" : earlyOutMinutes > 0 ? "early_out" : null;
    const status =
      holiday && punches.length === 0 ? AttendanceDayStatuses.Holiday
        : !workingDay && punches.length === 0 ? AttendanceDayStatuses.Weekend
          : isFuture ? AttendanceDayStatuses.Future
            : absent ? AttendanceDayStatuses.Absent
              : workMode === "wfh" ? AttendanceDayStatuses.Wfh
                : lateMinutes > 0 ? AttendanceDayStatuses.Late
                  : AttendanceDayStatuses.Present;
    const passiveNote = holiday && punches.length === 0
      ? `Holiday: ${holiday.name}`
      : !workingDay && punches.length === 0
        ? "Company non-working day"
        : null;
    return this.repository.upsertDayRecord({
      employee_user_id: employeeUserId,
      work_date: workDate,
      status,
      first_check_in: firstCheckIn,
      last_check_out: lastCheckOut,
      work_minutes: totalMinutes,
      break_minutes: breakMinutes,
      late_minutes: lateMinutes,
      early_out_minutes: earlyOutMinutes,
      work_mode: workMode,
      note: exceptionType ? this.exceptionDetail({ exception_type: exceptionType, late_minutes: lateMinutes, early_out_minutes: earlyOutMinutes, work_minutes: totalMinutes } as AttendanceDayRecord) : passiveNote,
      exception_type: exceptionType,
      regularization_status: this.repository.dayRecord(employeeUserId, workDate)?.regularization_status ?? null
    });
  }

  private breakMinutesUntil(punches: AttendancePunch[], openBreakEndAt: string | null): number {
    let total = 0;
    let breakStartedAt: string | null = null;
    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.BreakStart) {
        breakStartedAt = punch.occurred_at;
      }
      if (punch.event_type === AttendancePunchEventTypes.BreakEnd && breakStartedAt) {
        total += minutesBetween(breakStartedAt, punch.occurred_at);
        breakStartedAt = null;
      }
    }
    if (breakStartedAt && openBreakEndAt) {
      total += minutesBetween(breakStartedAt, openBreakEndAt);
    }
    return total;
  }

  private resolveDay(employeeUserId: UUID, workDate: string, timeZone = this.timezoneForUser(employeeUserId)): AttendanceDayRecord {
    const existing = this.repository.dayRecord(employeeUserId, workDate);
    const punches = this.punchesForWorkDate(employeeUserId, workDate, timeZone);
    if (existing && punches.length === 0 && this.shouldPreserveManualDay(existing)) {
      return existing;
    }
    if (punches.length > 0 || workDate <= todayDate(timeZone)) {
      return this.recomputeDay(employeeUserId, workDate, timeZone);
    }
    return this.getOrSynthesizeDay(employeeUserId, workDate, timeZone);
  }

  private shouldPreserveManualDay(record: AttendanceDayRecord): boolean {
    return (
      record.status === AttendanceDayStatuses.Leave ||
      record.status === AttendanceDayStatuses.Wfh ||
      (record.status === AttendanceDayStatuses.Holiday && Boolean(this.holidayForDate(record.work_date))) ||
      record.regularization_status === AttendanceRegularizationStatuses.Approved
    );
  }

  private getOrSynthesizeDay(employeeUserId: UUID, workDate: string, timeZone = this.timezoneForUser(employeeUserId)): AttendanceDayRecord {
    const existing = this.repository.dayRecord(employeeUserId, workDate);
    if (existing) {
      return existing;
    }
    const holiday = this.holidayForDate(workDate);
    const workingDay = this.isWorkingDay(workDate);
    const status =
      holiday
        ? AttendanceDayStatuses.Holiday
        : !workingDay
          ? AttendanceDayStatuses.Weekend
          : workDate > todayDate(timeZone)
            ? AttendanceDayStatuses.Future
            : AttendanceDayStatuses.Absent;
    return this.repository.upsertDayRecord({
      employee_user_id: employeeUserId,
      work_date: workDate,
      status,
      first_check_in: null,
      last_check_out: null,
      work_minutes: 0,
      break_minutes: 0,
      late_minutes: 0,
      early_out_minutes: 0,
      work_mode: null,
      note: status === AttendanceDayStatuses.Absent
        ? "No punch-in recorded"
        : status === AttendanceDayStatuses.Holiday
          ? `Holiday: ${holiday?.name ?? "Company holiday"}`
          : status === AttendanceDayStatuses.Weekend
            ? "Company non-working day"
            : null,
      exception_type: status === AttendanceDayStatuses.Absent ? "absent" : null,
      regularization_status: null
    });
  }

  private weekRecords(employeeUserId: UUID, timeZone = this.timezoneForUser(employeeUserId)): AttendanceDayRecord[] {
    const localToday = todayDate(timeZone);
    const today = new Date(`${localToday}T00:00:00.000Z`);
    const start = new Date(today);
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const workDate = date.toISOString().slice(0, 10);
      return this.resolveDay(employeeUserId, workDate, timeZone);
    });
  }

  private punchesForWorkDate(employeeUserId: UUID, workDate: string, timeZone: string): AttendancePunch[] {
    let openWorkDate: string | null = null;
    return this.store.attendancePunches
      .filter((punch) => punch.employee_user_id === employeeUserId && !punch.deleted_at)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .filter((punch) => {
        if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
          openWorkDate = dateInTimeZone(punch.occurred_at, timeZone);
        }
        const assignedWorkDate = openWorkDate ?? dateInTimeZone(punch.occurred_at, timeZone);
        const include = assignedWorkDate === workDate;
        if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
          openWorkDate = null;
        }
        return include;
      });
  }

  private workDateForPunch(
    employeeUserId: UUID,
    eventType: AttendancePunchEventType,
    occurredAt: string,
    timeZone: string
  ): string {
    if (eventType === AttendancePunchEventTypes.CheckIn) {
      return dateInTimeZone(occurredAt, timeZone);
    }
    return this.openSessionWorkDate(employeeUserId, occurredAt, timeZone) ?? dateInTimeZone(occurredAt, timeZone);
  }

  private openSessionWorkDate(employeeUserId: UUID, occurredAt: string, timeZone: string): string | null {
    let openWorkDate: string | null = null;
    const punches = this.store.attendancePunches
      .filter((punch) => punch.employee_user_id === employeeUserId && !punch.deleted_at && punch.occurred_at <= occurredAt)
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

  private weeklyBalance(records: AttendanceDayRecord[]): Record<string, unknown> {
    const elapsedRecords = records.filter((record) => record.work_date <= todayDate(this.timezoneForUser(record.employee_user_id)));
    const target = this.targetWorkMinutes();
    const weekdayRecords = elapsedRecords.filter((record) => this.isWorkingDay(record.work_date) && !this.holidayForDate(record.work_date));
    const offDayRecords = elapsedRecords.filter((record) => !this.isWorkingDay(record.work_date) || Boolean(this.holidayForDate(record.work_date)));
    const requiredWeekdayMinutes = weekdayRecords.length * target;
    const weekdayWorkedMinutes = weekdayRecords.reduce((total, record) => total + record.work_minutes, 0);
    const offDayWorkedMinutes = offDayRecords.reduce((total, record) => total + record.work_minutes, 0);
    const weekdayShortageMinutes = Math.max(0, requiredWeekdayMinutes - weekdayWorkedMinutes);
    const compensatedMinutes = Math.min(weekdayShortageMinutes, offDayWorkedMinutes);
    const overtimeMinutes = Math.max(0, offDayWorkedMinutes - compensatedMinutes);
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
      overtime_hours: minutesToHours(overtimeMinutes)
    };
  }

  private activeCompany() {
    return this.store.companyProfiles.find((candidate) => candidate.status === "active") ?? this.store.companyProfiles[0];
  }

  private attendancePolicy(): AttendancePunchPolicy {
    const policy = this.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "attendance" && candidate.status === "active" && !candidate.deleted_at
    );
    const config = policy?.config ?? {};
    return {
      graceMinutes: numberConfig(config, "graceMinutes", 10),
      autoMarkAbsentMinutes: numberConfig(config, "autoMarkAbsentMinutes", 480),
      fullDayPunchWindow: booleanConfig(config, "fullDayPunchWindow", true),
      punchInStart: timeConfig(config, "punchInStart", "09:00"),
      punchInEnd: timeConfig(config, "punchInEnd", "11:00"),
      punchOutStart: timeConfig(config, "punchOutStart", "17:00"),
      punchOutEnd: timeConfig(config, "punchOutEnd", "23:59"),
      autoPunchOutEnabled: booleanConfig(config, "autoPunchOutEnabled", true),
      autoPunchOutTime: timeConfig(config, "autoPunchOutTime", "23:59"),
      allowOffDayPunches: booleanConfig(config, "allowOffDayPunches", false)
    };
  }

  private isWorkingDay(workDate: string): boolean {
    return isWorkingDate(workDate, this.activeCompany()?.working_week, this.holidayDates());
  }

  private holidayForDate(workDate: string) {
    return this.store.holidays.find((holiday) => holiday.holiday_date === workDate && !holiday.optional && !holiday.deleted_at) ?? null;
  }

  private holidayDates(): Set<string> {
    return new Set(
      this.store.holidays
        .filter((holiday) => !holiday.optional && !holiday.deleted_at)
        .map((holiday) => holiday.holiday_date)
    );
  }

  private targetWorkMinutes(): number {
    return Math.max(0, Math.round((this.activeCompany()?.work_hours_per_day ?? 8) * 60));
  }

  private timezoneForUser(userId: UUID): string {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    const company = this.activeCompany();
    return user?.timezone ?? company?.timezone ?? "Asia/Kolkata";
  }

  private recordsForUsers(userIds: Set<UUID>, from: string, to: string): AttendanceDayRecord[] {
    const output: AttendanceDayRecord[] = [];
    for (const userId of userIds) {
      const timeZone = this.timezoneForUser(userId);
      for (const date of datesInclusive(from, to)) {
        output.push(this.resolveDay(userId, date, timeZone));
      }
    }
    return output.sort((a, b) => a.work_date.localeCompare(b.work_date));
  }

  private daySummary(records: Array<AttendanceDayRecord | { status: string; work_minutes: number; late_minutes?: number; exception_type?: string | null }>) {
    return {
      present: records.filter((record) => record.status === AttendanceDayStatuses.Present).length,
      absent: records.filter((record) => record.status === AttendanceDayStatuses.Absent).length,
      late: records.filter((record) => record.status === AttendanceDayStatuses.Late).length,
      wfh: records.filter((record) => record.status === AttendanceDayStatuses.Wfh).length,
      leave: records.filter((record) => record.status === AttendanceDayStatuses.Leave).length,
      weekend: records.filter((record) => record.status === AttendanceDayStatuses.Weekend).length,
      holiday: records.filter((record) => record.status === AttendanceDayStatuses.Holiday).length,
      future: records.filter((record) => record.status === AttendanceDayStatuses.Future).length,
      missing_punch: records.filter((record) => record.exception_type === "missing_punch").length,
      regularized: records.filter((record) => "regularization_status" in record && record.regularization_status === AttendanceRegularizationStatuses.Approved).length,
      work_minutes: records.reduce((total, record) => total + record.work_minutes, 0)
    };
  }

  private teamTotals(records: AttendanceDayRecord[], totalEmployees: number) {
    return {
      total: totalEmployees,
      present: records.filter((record) => record.status === AttendanceDayStatuses.Present || record.status === AttendanceDayStatuses.Late).length,
      absent: records.filter((record) => record.status === AttendanceDayStatuses.Absent).length,
      late: records.filter((record) => record.status === AttendanceDayStatuses.Late).length,
      early_out: records.filter((record) => record.early_out_minutes > 0).length,
      wfh: records.filter((record) => record.status === AttendanceDayStatuses.Wfh).length,
      on_leave: records.filter((record) => record.status === AttendanceDayStatuses.Leave).length
    };
  }

  private departmentSummary(records: AttendanceDayRecord[], users: CoreUser[]) {
    return this.store.departments
      .filter((department) => !department.deleted_at)
      .map((department) => {
        const members = users.filter((user) => user.department_id === department.id);
        const memberIds = new Set(members.map((user) => user.id));
        const departmentRecords = records.filter((record) => memberIds.has(record.employee_user_id));
        const present = departmentRecords.filter(
          (record) =>
            record.status === AttendanceDayStatuses.Present ||
            record.status === AttendanceDayStatuses.Late ||
            record.status === AttendanceDayStatuses.Wfh
        ).length;
        return {
          department_id: department.id,
          department_code: department.department_code,
          name: department.name,
          present,
          strength: members.length,
          attendance_percent: members.length > 0 ? Math.round((present / members.length) * 100) : 0
        };
      })
      .filter((row) => row.strength > 0);
  }

  private visibleUsers(actor: AuthUser, departmentId?: UUID): CoreUser[] {
    return this.store.users.filter((user) => {
      if (!visibleUserPredicate(actor, user)) {
        return false;
      }
      if (departmentId && user.department_id !== departmentId) {
        return false;
      }
      return true;
    });
  }

  private hasVisibleSubordinates(actor: AuthUser): boolean {
    return this.store.users.some(
      (user) =>
        user.id !== actor.id &&
        !user.deleted_at &&
        user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`)
    );
  }

  private regularizationQueueCounts(requests: AttendanceRegularizationRequest[]) {
    return {
      total: requests.length,
      pending: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Pending).length,
      approved: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Approved).length,
      returned: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Returned).length,
      rejected: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Rejected).length
    };
  }

  private requireUser(userId: UUID): CoreUser {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    if (!user) {
      throw notFound("User not found", { id: userId });
    }
    return user;
  }

  private adminFallback(): CoreUser | null {
    return this.store.users.find((user) => user.roles.includes(Roles.Admin) && user.employment_status === EmploymentStatuses.Active && !user.deleted_at) ?? null;
  }

  private applyApprovedPunches(request: AttendanceRegularizationRequest, actorUserId: UUID): void {
    const timeZone = this.timezoneForUser(request.employee_user_id);
    for (const requested of request.requested_punches) {
      const date = dateInTimeZone(requested.occurred_at, timeZone);
      if (requested.event_type === AttendancePunchEventTypes.CheckIn && date !== request.work_date) {
        throw badRequest("Requested punch timestamps must fall on the regularization work_date.");
      }
      this.repository.addPunch({
        employee_user_id: request.employee_user_id,
        event_type: requested.event_type,
        occurred_at: requested.occurred_at,
        work_mode: "office",
        source: "admin",
        metadata: { regularization_request_id: request.id, decided_by_user_id: actorUserId }
      });
    }
    this.recomputeDay(request.employee_user_id, request.work_date, timeZone);
  }

  private presentPunch(punch: AttendancePunch, timeZone: string) {
    return {
      ...punch,
      work_date: dateInTimeZone(punch.occurred_at, timeZone),
      time: timeText(punch.occurred_at, timeZone)
    };
  }

  private presentDay(day: AttendanceDayRecord, timeZone: string) {
    return {
      ...day,
      in_time: timeText(day.first_check_in, timeZone),
      out_time: timeText(day.last_check_out, timeZone),
      hours: minutesToHours(day.work_minutes),
      break_hours: minutesToHours(day.break_minutes),
      detail: this.exceptionDetail(day)
    };
  }

  private presentRegularization(request: AttendanceRegularizationRequest) {
    const user = this.store.users.find((candidate) => candidate.id === request.employee_user_id);
    const approver = request.current_approver_user_id
      ? this.store.users.find((candidate) => candidate.id === request.current_approver_user_id)
      : undefined;
    return {
      ...request,
      employee: userLabel(user),
      approver: approver ? userLabel(approver) : null
    };
  }

  private presentException(record: AttendanceDayRecord, request: AttendanceRegularizationRequest | undefined, actor: AuthUser) {
    const user = this.store.users.find((candidate) => candidate.id === record.employee_user_id);
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
      can_decide: Boolean(request && request.status === AttendanceRegularizationStatuses.Pending && actor.id !== request.employee_user_id && (canSeeAllAttendance(actor) || request.current_approver_user_id === actor.id)),
      record: this.presentDay(record, this.timezoneForUser(record.employee_user_id)),
      request: request ? this.presentRegularization(request) : null
    };
  }

  private exceptionDetail(record: Pick<AttendanceDayRecord, "exception_type" | "late_minutes" | "early_out_minutes" | "work_minutes" | "note">): string {
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
    return record.work_minutes > 0 ? minutesToHours(record.work_minutes) : "No attendance for this day";
  }

  private eventForDecision(decision: "approve" | "reject" | "return") {
    if (decision === "approve") {
      return attendanceEvents.RegularizationApproved;
    }
    if (decision === "reject") {
      return attendanceEvents.RegularizationRejected;
    }
    return attendanceEvents.RegularizationReturned;
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
