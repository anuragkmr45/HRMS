import { randomUUID } from "node:crypto";
import type {
  AuthUser,
  CoreUser,
  Holiday,
  HolidayUpsertInput,
  LeaveRequest,
  LeaveRequestCreateInput,
  LeaveRequestStatus,
  LeaveType,
  LeaveWfhCancelInput,
  LeaveWfhDecisionInput,
  UUID,
  WfhRequest,
  WfhRequestCreateInput
} from "#shared";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  EmploymentStatuses,
  LeaveRequestStatuses,
  LeaveTypes,
  Roles,
  WorkflowActions
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, missingRemarks, notFound } from "../../platform/errors.js";
import { createGeneratedExportDocument, type GeneratedExportFormat } from "../../platform/generated-exports.js";
import { isWorkingDate, workingDatesInclusive, workdaysInclusive } from "../../platform/work-schedule.js";
import { AttendanceRepository } from "../attendance/repository.js";
import { projectAttendanceDay } from "../attendance/daily-projection.js";
import { CoreService } from "../core/service.js";
import { appendLeaveWfhOutboxEvent, leaveWfhEvents } from "./events.js";
import {
  assertCanDecideLeaveWfh,
  assertCanMutateHolidays,
  assertCanSeeLeaveWfhUser,
  canDecideAcrossLeaveWfh,
  canMonitorLeaveWfh,
  canSeeLeaveWfhUser
} from "./policy.js";
import { LeaveWfhRepository } from "./repository.js";

export interface LeaveWfhQuery {
  page: number;
  page_size: number;
  sort?: string;
  year?: number;
  leave_type?: LeaveType;
  status?: string;
  date_from?: string;
  date_to?: string;
  user_id?: UUID;
  department_id?: UUID;
  request_kind?: "leave" | "wfh";
}

export interface LeaveWfhExportInput {
  filters?: Record<string, unknown>;
  columns?: string[];
  format?: "csv" | "xlsx" | "json";
}

const ENTITLEMENTS: Record<LeaveType, number> = {
  [LeaveTypes.Casual]: 12,
  [LeaveTypes.Sick]: 8,
  [LeaveTypes.Earned]: 18,
  [LeaveTypes.Unpaid]: 0,
  [LeaveTypes.CompOff]: 5
};

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  [LeaveTypes.Casual]: "Casual Leave",
  [LeaveTypes.Sick]: "Sick Leave",
  [LeaveTypes.Earned]: "Earned Leave",
  [LeaveTypes.Unpaid]: "Unpaid Leave",
  [LeaveTypes.CompOff]: "Comp Off"
};

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function currentYear(): number {
  return new Date().getUTCFullYear();
}

function dateRangeForYear(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function durationDays(dateFrom: string, dateTo: string, halfDay: boolean): number {
  if (dateTo < dateFrom) {
    throw badRequest("End date cannot be before start date.");
  }
  if (halfDay && dateFrom !== dateTo) {
    throw badRequest("Half-day leave or WFH can only be requested for a single date.");
  }
  if (halfDay) {
    return 0.5;
  }
  const start = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const end = Date.parse(`${dateTo}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

function rangesOverlap(leftFrom: string, leftTo: string, rightFrom: string, rightTo: string): boolean {
  return leftFrom <= rightTo && rightFrom <= leftTo;
}

function userLabel(user: CoreUser | undefined) {
  return {
    id: user?.id ?? null,
    employee_code: user?.employee_code ?? "UNKNOWN",
    full_name: user?.full_name ?? "Unknown employee",
    department_id: user?.department_id ?? null
  };
}

function numberConfig(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = config[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class LeaveWfhService {
  private readonly repository: LeaveWfhRepository;
  private readonly attendance: AttendanceRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new LeaveWfhRepository(store);
    this.attendance = new AttendanceRepository(store);
    this.core = new CoreService(store);
  }

  myLeaveBalances(actor: AuthUser, query: LeaveWfhQuery) {
    return this.leaveBalancesForUser(actor, actor.id, query);
  }

  leaveBalancesForUser(actor: AuthUser, userId: UUID, query: LeaveWfhQuery) {
    const user = this.requireUser(userId);
    assertCanSeeLeaveWfhUser(actor, user);
    const year = query.year ?? currentYear();
    const range = dateRangeForYear(year);
    const leaveRequests = this.repository.listLeaveRequests({
      userIds: new Set([user.id]),
      dateFrom: range.from,
      dateTo: range.to
    });
    const wfhRequests = this.repository.listWfhRequests({
      userIds: new Set([user.id]),
      dateFrom: range.from,
      dateTo: range.to
    });
    const entitlements = this.leaveEntitlements();
    const balances = Object.values(LeaveTypes)
      .filter((leaveType) => !query.leave_type || query.leave_type === leaveType)
      .map((leaveType) => {
        const total = entitlements[leaveType];
        const used = sumDuration(leaveRequests.filter((request) => request.leave_type === leaveType && request.status === LeaveRequestStatuses.Approved));
        const pending = sumDuration(leaveRequests.filter((request) => request.leave_type === leaveType && request.status === LeaveRequestStatuses.PendingManager));
        return {
          leave_type: leaveType,
          label: LEAVE_TYPE_LABELS[leaveType],
          total,
          used,
          pending,
          available: leaveType === LeaveTypes.Unpaid ? null : Math.max(0, total - used - pending)
        };
      });
    return {
      generated_at: nowIso(),
      year,
      user: userLabel(user),
      balances,
      accruals: [],
      pending_requests_summary: {
        leave: leaveRequests.filter((request) => request.status === LeaveRequestStatuses.PendingManager).length,
        wfh: wfhRequests.filter((request) => request.status === LeaveRequestStatuses.PendingManager).length
      }
    };
  }

  createLeaveRequest(actor: AuthUser, input: LeaveRequestCreateInput) {
    this.requireActiveEmployee(actor.id);
    const duration = this.requestDurationDays(input.date_from, input.date_to, input.half_day);
    this.assertNoOverlap(actor.id, input.date_from, input.date_to);
    this.assertLeaveBalanceAvailable(actor, input.leave_type, duration, input.date_from);
    const approver = this.core.resolveImmediateManager(actor.id) ?? this.adminFallback();
    const request = this.repository.addLeaveRequest({
      request_code: this.repository.nextRequestCode("LV"),
      employee_user_id: actor.id,
      leave_type: input.leave_type,
      date_from: input.date_from,
      date_to: input.date_to,
      half_day: input.half_day,
      duration,
      reason: input.reason.trim(),
      document_ids: input.document_ids,
      status: LeaveRequestStatuses.PendingManager,
      current_approver_user_id: approver?.id ?? null
    });
    appendLeaveWfhOutboxEvent(this.store, {
      aggregateType: "leave_request",
      aggregateId: request.id,
      eventType: leaveWfhEvents.LeaveSubmitted,
      payload: { request_id: request.id, request_code: request.request_code, employee_user_id: actor.id, approver_user_id: request.current_approver_user_id },
      idempotencyKey: `leave.submitted:${request.id}`
    });
    return {
      request_id: request.id,
      request: this.presentLeaveRequest(request),
      status: request.status,
      balance_preview: this.leaveBalancesForUser(actor, actor.id, { page: 1, page_size: 25, year: Number(input.date_from.slice(0, 4)), leave_type: input.leave_type }).balances[0],
      version: request.version
    };
  }

  listMyLeaveRequests(actor: AuthUser, query: LeaveWfhQuery) {
    const requests = this.repository.listLeaveRequests({
      userIds: new Set([actor.id]),
      status: query.status,
      dateFrom: query.date_from,
      dateTo: query.date_to
    });
    return page(requests.map((request) => this.presentLeaveRequest(request)), query.page, query.page_size);
  }

  managerLeaveQueue(actor: AuthUser, query: LeaveWfhQuery) {
    const requests = this.repository
      .listLeaveRequests({
        status: query.status ?? LeaveRequestStatuses.PendingManager,
        dateFrom: query.date_from,
        dateTo: query.date_to
      })
      .filter((request) => this.isQueueVisible(actor, request, query));
    return {
      ...page(requests.map((request) => this.presentLeaveRequest(request, actor)), query.page, query.page_size),
      queue_counts: this.queueCounts(requests)
    };
  }

  decideLeaveRequest(actor: AuthUser, id: UUID, input: LeaveWfhDecisionInput) {
    const current = this.repository.findLeaveRequest(id);
    if (current.version !== input.expected_version) {
      throw conflict("Leave request was modified by another actor.", { aggregate: "leave_request", id });
    }
    assertCanDecideLeaveWfh(actor, current, WorkflowActions.LeaveDecision);
    if (["reject", "return"].includes(input.decision) && !input.remarks?.trim()) {
      throw missingRemarks(input.decision);
    }
    if (current.status !== LeaveRequestStatuses.PendingManager) {
      throw conflict("Only pending leave requests can be decided.", { request_id: id, status: current.status });
    }
    const previousStatus = current.status;
    const nextStatus = decisionStatus(input.decision);
    const request = this.repository.updateLeaveRequestVersioned(id, input.expected_version, (candidate) => {
      candidate.status = nextStatus;
      candidate.current_approver_user_id = null;
      candidate.decision_remarks = input.remarks?.trim() ?? null;
      candidate.decided_by_user_id = actor.id;
      candidate.decided_at = nowIso();
    });
    if (nextStatus === LeaveRequestStatuses.Approved) {
      this.applyAttendanceStatus(request.employee_user_id, request.date_from, request.date_to, AttendanceDayStatuses.Leave, "Approved leave");
    }
    appendLeaveWfhOutboxEvent(this.store, {
      aggregateType: "leave_request",
      aggregateId: request.id,
      eventType: eventForLeaveDecision(input.decision),
      payload: { request_id: request.id, actor_user_id: actor.id, previous_status: previousStatus, next_status: nextStatus, version: request.version },
      idempotencyKey: `leave.${input.decision}:${request.id}:${request.version}`
    });
    return {
      ...this.presentLeaveRequest(request, actor),
      previous_status: previousStatus,
      next_status: nextStatus,
      balance_effect: this.leaveBalancesForUser(actor, request.employee_user_id, { page: 1, page_size: 25, year: Number(request.date_from.slice(0, 4)), leave_type: request.leave_type }).balances[0]
    };
  }

  cancelLeaveRequest(actor: AuthUser, id: UUID, input: LeaveWfhCancelInput) {
    const current = this.repository.findLeaveRequest(id);
    if (current.employee_user_id !== actor.id && !canDecideAcrossLeaveWfh(actor)) {
      throw conflict("Only the requester, HR, or Admin can cancel this leave request.", { request_id: id });
    }
    if (!new Set<string>([LeaveRequestStatuses.PendingManager, LeaveRequestStatuses.Returned]).has(current.status)) {
      throw conflict("Only pending or returned leave requests can be cancelled.", { request_id: id, status: current.status });
    }
    const previousStatus = current.status;
    const request = this.repository.updateLeaveRequestVersioned(id, input.expected_version, (candidate) => {
      candidate.status = LeaveRequestStatuses.Cancelled;
      candidate.current_approver_user_id = null;
      candidate.decision_remarks = input.remarks?.trim() ?? candidate.decision_remarks;
      candidate.cancelled_at = nowIso();
    });
    appendLeaveWfhOutboxEvent(this.store, {
      aggregateType: "leave_request",
      aggregateId: request.id,
      eventType: leaveWfhEvents.LeaveCancelled,
      payload: { request_id: request.id, actor_user_id: actor.id, previous_status: previousStatus, next_status: request.status },
      idempotencyKey: `leave.cancelled:${request.id}:${request.version}`
    });
    return { ...this.presentLeaveRequest(request, actor), previous_status: previousStatus, next_status: request.status };
  }

  createWfhRequest(actor: AuthUser, input: WfhRequestCreateInput) {
    this.requireActiveEmployee(actor.id);
    const duration = this.requestDurationDays(input.date_from, input.date_to, input.half_day);
    this.assertNoOverlap(actor.id, input.date_from, input.date_to);
    const approver = this.core.resolveImmediateManager(actor.id) ?? this.adminFallback();
    const request = this.repository.addWfhRequest({
      request_code: this.repository.nextRequestCode("WFH"),
      employee_user_id: actor.id,
      date_from: input.date_from,
      date_to: input.date_to,
      half_day: input.half_day,
      duration,
      reason: input.reason.trim(),
      project_ref: input.project_ref?.trim() || null,
      status: LeaveRequestStatuses.PendingManager,
      current_approver_user_id: approver?.id ?? null
    });
    appendLeaveWfhOutboxEvent(this.store, {
      aggregateType: "wfh_request",
      aggregateId: request.id,
      eventType: leaveWfhEvents.WfhSubmitted,
      payload: { request_id: request.id, request_code: request.request_code, employee_user_id: actor.id, approver_user_id: request.current_approver_user_id },
      idempotencyKey: `wfh.submitted:${request.id}`
    });
    return { request_id: request.id, request: this.presentWfhRequest(request), status: request.status, version: request.version };
  }

  listMyWfhRequests(actor: AuthUser, query: LeaveWfhQuery) {
    const requests = this.repository.listWfhRequests({
      userIds: new Set([actor.id]),
      status: query.status,
      dateFrom: query.date_from,
      dateTo: query.date_to
    });
    return page(requests.map((request) => this.presentWfhRequest(request)), query.page, query.page_size);
  }

  managerWfhQueue(actor: AuthUser, query: LeaveWfhQuery) {
    const requests = this.repository
      .listWfhRequests({
        status: query.status ?? LeaveRequestStatuses.PendingManager,
        dateFrom: query.date_from,
        dateTo: query.date_to
      })
      .filter((request) => this.isQueueVisible(actor, request, query));
    return {
      ...page(requests.map((request) => this.presentWfhRequest(request, actor)), query.page, query.page_size),
      queue_counts: this.queueCounts(requests)
    };
  }

  decideWfhRequest(actor: AuthUser, id: UUID, input: LeaveWfhDecisionInput) {
    const current = this.repository.findWfhRequest(id);
    if (current.version !== input.expected_version) {
      throw conflict("WFH request was modified by another actor.", { aggregate: "wfh_request", id });
    }
    assertCanDecideLeaveWfh(actor, current, WorkflowActions.WfhDecision);
    if (["reject", "return"].includes(input.decision) && !input.remarks?.trim()) {
      throw missingRemarks(input.decision);
    }
    if (current.status !== LeaveRequestStatuses.PendingManager) {
      throw conflict("Only pending WFH requests can be decided.", { request_id: id, status: current.status });
    }
    const previousStatus = current.status;
    const nextStatus = decisionStatus(input.decision);
    const request = this.repository.updateWfhRequestVersioned(id, input.expected_version, (candidate) => {
      candidate.status = nextStatus;
      candidate.current_approver_user_id = null;
      candidate.decision_remarks = input.remarks?.trim() ?? null;
      candidate.decided_by_user_id = actor.id;
      candidate.decided_at = nowIso();
    });
    if (nextStatus === LeaveRequestStatuses.Approved) {
      this.applyAttendanceStatus(request.employee_user_id, request.date_from, request.date_to, AttendanceDayStatuses.Wfh, "Approved WFH", "wfh");
    }
    appendLeaveWfhOutboxEvent(this.store, {
      aggregateType: "wfh_request",
      aggregateId: request.id,
      eventType: eventForWfhDecision(input.decision),
      payload: { request_id: request.id, actor_user_id: actor.id, previous_status: previousStatus, next_status: nextStatus, version: request.version },
      idempotencyKey: `wfh.${input.decision}:${request.id}:${request.version}`
    });
    return { ...this.presentWfhRequest(request, actor), previous_status: previousStatus, next_status: nextStatus };
  }

  hrMonitor(actor: AuthUser, query: LeaveWfhQuery) {
    if (!canMonitorLeaveWfh(actor)) {
      throw badRequest("Only HR, Admin, or Auditor users can access the Leave/WFH monitor.");
    }
    const userIds = this.visibleUserIds(actor, query);
    const leaveItems = query.request_kind === "wfh"
      ? []
      : this.repository
        .listLeaveRequests({ userIds, status: query.status, dateFrom: query.date_from, dateTo: query.date_to })
        .map((request) => this.presentLeaveRequest(request, actor));
    const wfhItems = query.request_kind === "leave"
      ? []
      : this.repository
        .listWfhRequests({ userIds, status: query.status, dateFrom: query.date_from, dateTo: query.date_to })
        .map((request) => this.presentWfhRequest(request, actor));
    const items = [...leaveItems, ...wfhItems].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return {
      ...page(items, query.page, query.page_size),
      totals: {
        leave: leaveItems.length,
        wfh: wfhItems.length,
        pending: items.filter((item) => item.status === LeaveRequestStatuses.PendingManager).length,
        approved: items.filter((item) => item.status === LeaveRequestStatuses.Approved).length,
        rejected: items.filter((item) => item.status === LeaveRequestStatuses.Rejected).length,
        returned: items.filter((item) => item.status === LeaveRequestStatuses.Returned).length,
        cancelled: items.filter((item) => item.status === LeaveRequestStatuses.Cancelled).length
      }
    };
  }

  listHolidays(actor: AuthUser, query: LeaveWfhQuery) {
    const companyId = this.requireCompanyId(actor.id);
    const year = query.year ?? currentYear();
    const holidays = this.repository.listHolidays(companyId, year).map((holiday) => this.presentHoliday(holiday));
    return {
      holidays,
      calendar_metadata: {
        year,
        total: holidays.length,
        optional: holidays.filter((holiday) => holiday.optional).length
      }
    };
  }

  upsertHoliday(actor: AuthUser, id: UUID, input: HolidayUpsertInput) {
    assertCanMutateHolidays(actor);
    const companyId = this.requireCompanyId(actor.id);
    const holiday = this.repository.upsertHoliday(id, {
      company_id: companyId,
      name: input.name.trim(),
      holiday_date: input.date,
      region: input.region.trim(),
      optional: input.optional,
      expected_version: input.expected_version
    });
    appendLeaveWfhOutboxEvent(this.store, {
      aggregateType: "holiday",
      aggregateId: holiday.id,
      eventType: leaveWfhEvents.HolidayUpserted,
      payload: { holiday_id: holiday.id, actor_user_id: actor.id, date: holiday.holiday_date, region: holiday.region },
      idempotencyKey: `holiday.upserted:${holiday.id}:${holiday.version}`
    });
    return { holiday: this.presentHoliday(holiday), version: holiday.version };
  }

  async createExportJob(actor: AuthUser, input: LeaveWfhExportInput) {
    if (!canMonitorLeaveWfh(actor)) {
      throw forbidden("Only HR, Admin, or Auditor users can export Leave/WFH data.");
    }
    const jobId = randomUUID();
    const format = input.format ?? "csv";
    const columns = input.columns?.length
      ? input.columns
      : ["employee_code", "employee", "department", "kind", "type", "date_from", "date_to", "duration", "status"];
    const filters = input.filters ?? {};
    const createdAt = nowIso();
    const rows = this.exportRows(actor, filters);
    const generated = await createGeneratedExportDocument(this.store, {
      actor,
      businessObjectType: "leave_wfh_export",
      businessObjectId: jobId,
      reportType: "leave-wfh",
      format: format as GeneratedExportFormat,
      rows,
      columns,
      filters,
      filePrefix: "leave-wfh-export"
    });
    appendLeaveWfhOutboxEvent(this.store, {
      aggregateType: "leave_wfh_export",
      aggregateId: jobId,
      eventType: leaveWfhEvents.ExportRequested,
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
      idempotencyKey: `leave_wfh.export.requested:${jobId}`
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

  private exportRows(actor: AuthUser, filters: Record<string, unknown>): Array<Record<string, unknown>> {
    const query: LeaveWfhQuery = {
      page: 1,
      page_size: exportPageSize(filters),
      status: textFilter(filters.status),
      date_from: textFilter(filters.date_from),
      date_to: textFilter(filters.date_to),
      user_id: textFilter(filters.user_id),
      department_id: textFilter(filters.department_id),
      request_kind: filters.request_kind === "leave" || filters.request_kind === "wfh" ? filters.request_kind : undefined
    };
    const monitor = this.hrMonitor(actor, query);
    return monitor.items.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        ...row,
        type: typeof row.leave_type === "string" ? row.leave_type : row.kind,
        from: row.date_from,
        to: row.date_to,
        date_from: row.date_from,
        date_to: row.date_to
      };
    });
  }

  private leaveEntitlements(): Record<LeaveType, number> {
    const policy = this.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "leave" && candidate.status === "active" && !candidate.deleted_at
    );
    const config = policy?.config ?? {};
    return {
      [LeaveTypes.Casual]: numberConfig(config, "casualPerYear", ENTITLEMENTS[LeaveTypes.Casual]),
      [LeaveTypes.Sick]: numberConfig(config, "sickPerYear", ENTITLEMENTS[LeaveTypes.Sick]),
      [LeaveTypes.Earned]: numberConfig(config, "earnedPerYear", ENTITLEMENTS[LeaveTypes.Earned]),
      [LeaveTypes.Unpaid]: ENTITLEMENTS[LeaveTypes.Unpaid],
      [LeaveTypes.CompOff]: ENTITLEMENTS[LeaveTypes.CompOff]
    };
  }

  private activeCompany() {
    return this.store.companyProfiles.find((candidate) => candidate.status === "active") ?? this.store.companyProfiles[0];
  }

  private workingWeek(): string {
    return this.activeCompany()?.working_week ?? "Mon-Fri";
  }

  private holidayDates(): Set<string> {
    return new Set(
      this.store.holidays
        .filter((holiday) => !holiday.optional && !holiday.deleted_at)
        .map((holiday) => holiday.holiday_date)
    );
  }

  private requestDurationDays(dateFrom: string, dateTo: string, halfDay: boolean): number {
    durationDays(dateFrom, dateTo, halfDay);
    if (halfDay) {
      if (!isWorkingDate(dateFrom, this.workingWeek(), this.holidayDates())) {
        throw badRequest("Leave/WFH cannot be requested for a company non-working day.", {
          date: dateFrom
        });
      }
      return 0.5;
    }
    const days = workdaysInclusive(dateFrom, dateTo, this.workingWeek(), this.holidayDates());
    if (days <= 0) {
      throw badRequest("Leave/WFH date range must include at least one company working day.", {
        date_from: dateFrom,
        date_to: dateTo
      });
    }
    return days;
  }

  private assertNoOverlap(userId: UUID, dateFrom: string, dateTo: string): void {
    const duplicate = this.repository.activeRequestsForUser(userId, dateFrom, dateTo)[0];
    if (duplicate) {
      throw conflict("An active Leave/WFH request already overlaps this date range.", {
        request_id: duplicate.id,
        date_from: duplicate.date_from,
        date_to: duplicate.date_to,
        status: duplicate.status
      });
    }
  }

  private assertLeaveBalanceAvailable(actor: AuthUser, leaveType: LeaveType, duration: number, startDate: string): void {
    if (leaveType === LeaveTypes.Unpaid) {
      return;
    }
    const balance = this.leaveBalancesForUser(actor, actor.id, { page: 1, page_size: 25, year: Number(startDate.slice(0, 4)), leave_type: leaveType }).balances[0];
    if (!balance) {
      return;
    }
    if (typeof balance.available === "number" && duration > balance.available) {
      throw conflict("Insufficient leave balance for this request.", {
        leave_type: leaveType,
        requested_duration: duration,
        available: balance.available
      });
    }
  }

  private isQueueVisible(actor: AuthUser, request: LeaveRequest | WfhRequest, query: LeaveWfhQuery): boolean {
    const user = this.requireUser(request.employee_user_id);
    if (query.user_id && request.employee_user_id !== query.user_id) {
      return false;
    }
    if (query.department_id && user.department_id !== query.department_id) {
      return false;
    }
    return canDecideAcrossLeaveWfh(actor) || request.current_approver_user_id === actor.id;
  }

  private visibleUserIds(actor: AuthUser, query: LeaveWfhQuery): Set<UUID> {
    const users = this.store.users.filter((user) => {
      if (user.deleted_at || !canSeeLeaveWfhUser(actor, user)) {
        return false;
      }
      if (query.user_id && user.id !== query.user_id) {
        return false;
      }
      if (query.department_id && user.department_id !== query.department_id) {
        return false;
      }
      return true;
    });
    return new Set(users.map((user) => user.id));
  }

  private queueCounts(requests: Array<LeaveRequest | WfhRequest>) {
    return {
      pending_manager: requests.filter((request) => request.status === LeaveRequestStatuses.PendingManager).length,
      approved: requests.filter((request) => request.status === LeaveRequestStatuses.Approved).length,
      rejected: requests.filter((request) => request.status === LeaveRequestStatuses.Rejected).length,
      returned: requests.filter((request) => request.status === LeaveRequestStatuses.Returned).length
    };
  }

  private applyAttendanceStatus(
    employeeUserId: UUID,
    dateFrom: string,
    dateTo: string,
    status: typeof AttendanceDayStatuses.Leave | typeof AttendanceDayStatuses.Wfh,
    note: string,
    workMode: "wfh" | null = null
  ): void {
    const companyId = this.requireCompanyId(employeeUserId);
    for (const workDate of workingDatesInclusive(dateFrom, dateTo, this.workingWeek(), this.holidayDates())) {
      const existing = this.attendance.dayRecord(companyId, employeeUserId, workDate);
      const kind = status === AttendanceDayStatuses.Leave
        ? AttendanceApprovalKinds.Leave
        : AttendanceApprovalKinds.Wfh;
      const classification = status === AttendanceDayStatuses.Leave
        ? AttendanceDayClassifications.Leave
        : AttendanceDayClassifications.Wfh;
      const hasRecordedAttendance = Boolean(
        existing?.first_check_in || existing?.last_check_out || (existing?.work_seconds ?? 0) > 0,
      );
      const projection = projectAttendanceDay({
        companyId,
        employeeUserId,
        workDate,
        asOf: nowIso(),
        dayClassification: classification,
        firstCheckIn: existing?.first_check_in ?? null,
        lastCheckOut: existing?.last_check_out ?? null,
        hasOpenSession: Boolean(existing?.first_check_in && !existing.last_check_out),
        workMode: workMode ?? existing?.work_mode ?? null,
        workSeconds: existing?.work_seconds ?? (existing?.work_minutes ?? 0) * 60,
        breakSeconds: existing?.break_seconds ?? (existing?.break_minutes ?? 0) * 60,
        scheduledStartAt: null,
        scheduledEndAt: null,
        graceSeconds: 0,
        approvalFacts: [{ kind, state: AttendanceApprovalStates.Approved }],
        existingApproval: existing,
        regularizationStatus: existing?.regularization_status ?? null,
        forcePresenceState: hasRecordedAttendance ? existing?.presence_state : undefined,
        forceEvidenceState: hasRecordedAttendance ? existing?.evidence_state : undefined,
        note,
      });
      projection.scheduled_seconds = existing?.scheduled_seconds ?? 0;
      projection.punctuality_state = existing?.punctuality_state ?? projection.punctuality_state;
      projection.late_seconds = existing?.late_seconds ?? 0;
      projection.early_departure_seconds = existing?.early_departure_seconds ?? 0;
      projection.late_minutes = Math.floor(projection.late_seconds / 60);
      projection.early_out_minutes = Math.floor(projection.early_departure_seconds / 60);
      this.attendance.upsertDayRecord(projection);
    }
  }

  private requireUser(userId: UUID): CoreUser {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    if (!user) {
      throw notFound("User not found", { id: userId });
    }
    return user;
  }

  private requireCompanyId(userId: UUID): UUID {
    const companyId = this.store.userSessionPreferences.find((preference) => preference.user_id === userId)?.company_id;
    if (!companyId) {
      throw badRequest("A company context is required for holiday or attendance status access.", { user_id: userId });
    }
    return companyId;
  }

  private requireActiveEmployee(userId: UUID): CoreUser {
    const user = this.requireUser(userId);
    if (user.employment_status !== EmploymentStatuses.Active) {
      throw badRequest("Inactive or soft-deleted users cannot submit Leave/WFH requests.");
    }
    return user;
  }

  private adminFallback(): CoreUser | null {
    return this.store.users.find((user) => user.roles.includes(Roles.Admin) && user.employment_status === EmploymentStatuses.Active && !user.deleted_at) ?? null;
  }

  private presentLeaveRequest(request: LeaveRequest, actor?: AuthUser) {
    const user = this.store.users.find((candidate) => candidate.id === request.employee_user_id);
    const approver = request.current_approver_user_id
      ? this.store.users.find((candidate) => candidate.id === request.current_approver_user_id)
      : undefined;
    return {
      ...request,
      kind: "leave",
      leave_type_label: LEAVE_TYPE_LABELS[request.leave_type],
      employee: userLabel(user),
      approver: approver ? userLabel(approver) : null,
      can_decide: actor ? request.status === LeaveRequestStatuses.PendingManager && actor.id !== request.employee_user_id && (canDecideAcrossLeaveWfh(actor) || request.current_approver_user_id === actor.id) : false
    };
  }

  private presentWfhRequest(request: WfhRequest, actor?: AuthUser) {
    const user = this.store.users.find((candidate) => candidate.id === request.employee_user_id);
    const approver = request.current_approver_user_id
      ? this.store.users.find((candidate) => candidate.id === request.current_approver_user_id)
      : undefined;
    return {
      ...request,
      kind: "wfh",
      employee: userLabel(user),
      approver: approver ? userLabel(approver) : null,
      can_decide: actor ? request.status === LeaveRequestStatuses.PendingManager && actor.id !== request.employee_user_id && (canDecideAcrossLeaveWfh(actor) || request.current_approver_user_id === actor.id) : false
    };
  }

  private presentHoliday(holiday: Holiday) {
    return {
      ...holiday,
      date: holiday.holiday_date
    };
  }
}

function sumDuration(requests: LeaveRequest[]): number {
  return requests.reduce((sum, request) => sum + request.duration, 0);
}

function decisionStatus(decision: LeaveWfhDecisionInput["decision"]): LeaveRequestStatus {
  if (decision === "approve") {
    return LeaveRequestStatuses.Approved;
  }
  if (decision === "reject") {
    return LeaveRequestStatuses.Rejected;
  }
  return LeaveRequestStatuses.Returned;
}

function eventForLeaveDecision(decision: LeaveWfhDecisionInput["decision"]) {
  if (decision === "approve") {
    return leaveWfhEvents.LeaveApproved;
  }
  if (decision === "reject") {
    return leaveWfhEvents.LeaveRejected;
  }
  return leaveWfhEvents.LeaveReturned;
}

function eventForWfhDecision(decision: LeaveWfhDecisionInput["decision"]) {
  if (decision === "approve") {
    return leaveWfhEvents.WfhApproved;
  }
  if (decision === "reject") {
    return leaveWfhEvents.WfhRejected;
  }
  return leaveWfhEvents.WfhReturned;
}

function textFilter(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function exportPageSize(filters: Record<string, unknown>): number {
  const raw = typeof filters.page_size === "number" ? filters.page_size : Number(filters.page_size);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 5000;
  }
  return Math.min(Math.trunc(raw), 10000);
}
