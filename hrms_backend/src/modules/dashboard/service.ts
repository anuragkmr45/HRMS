import type { AuthUser, CoreUser, ExpenseTicket, LeaveRequest, TimesheetSubmission, UUID, WfhRequest } from "#shared";
import { AssetStatuses, AttendanceDayStatuses, EmploymentStatuses, ExpenseStatuses, LeaveRequestStatuses, Roles, TimesheetStatuses } from "#shared";
import type { MemoryDataStore, WorkSegment } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";

export interface DashboardMetric {
  key: string;
  label: string;
  value: number | string;
  unit: "count" | "money" | "hours" | "status";
  source:
    | "core"
    | "expenses"
    | "documents"
    | "assets"
    | "timesheets"
    | "attendance"
    | "leave_wfh"
    | "notifications"
    | "outbox"
    | "system";
}

export interface DashboardSummary {
  generated_at: string;
  scope: {
    actor_user_id: UUID;
    employee_code: string;
    primary_role: string;
    roles: string[];
    visibility: "all" | "self_and_descendants";
  };
  cards: DashboardMetric[];
  workforce: {
    visible_employees: number;
    active_employees: number;
    inactive_employees: number;
    new_joiners_30d: number;
    departments: Array<{ department_id: UUID; department_code: string; name: string; active_employees: number }>;
  };
  approvals: {
    expense_manager_pending: number;
    expense_finance_pending: number;
    expense_total_pending: number;
    timesheet_pending: number;
    leave_pending: number;
    wfh_pending: number;
    document_verification_pending: number;
  };
  operations: {
    assets_total: number;
    assets_assigned: number;
    assets_recovery_pending: number;
    notifications_pending: number;
    outbox_pending: number;
  };
  workload: {
    work_segments_total: number;
    submitted_hours_total: string;
    timesheet_submissions_total: number;
    timesheet_submissions_approved: number;
    timesheet_submissions_returned: number;
  };
  attention: DashboardMetric[];
  unavailable_features: Array<{ key: string; label: string; status: "not_implemented"; notes: string }>;
}

const FINANCE_PENDING_STATUSES = new Set<string>([
  ExpenseStatuses.ManagerVerified,
  ExpenseStatuses.FinanceHold,
  ExpenseStatuses.ClarificationRequired,
  ExpenseStatuses.FinanceApproved,
  ExpenseStatuses.PaymentReleased,
  ExpenseStatuses.BillsSubmitted,
  ExpenseStatuses.PendingAdjustment
]);

export class DashboardService {
  constructor(private readonly store: MemoryDataStore) {}

  summary(actor: AuthUser): DashboardSummary {
    const visibleUsers = this.visibleUsers(actor);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const visibleTickets = this.visibleTickets(actor, visibleUserIds);
    const visibleSubmissions = this.visibleTimesheetSubmissions(actor, visibleUserIds);
    const visibleSegments = this.visibleWorkSegments(actor, visibleUserIds);
    const visibleAttendance = this.visibleAttendanceDays(actor, visibleUserIds);
    const visibleLeaveRequests = this.visibleLeaveRequests(actor, visibleUserIds);
    const visibleWfhRequests = this.visibleWfhRequests(actor, visibleUserIds);
    const visibleAssets = this.visibleAssets(actor, visibleUserIds);
    const pendingManagerExpenses = visibleTickets.filter((ticket) => this.isManagerPendingFor(actor, ticket)).length;
    const pendingFinanceExpenses = visibleTickets.filter((ticket) => this.isFinancePendingFor(actor, ticket)).length;
    const pendingTimesheets = visibleSubmissions.filter((submission) => this.isTimesheetPendingFor(actor, submission)).length;
    const pendingLeaves = visibleLeaveRequests.filter((request) => this.isLeaveWfhPendingFor(actor, request)).length;
    const pendingWfh = visibleWfhRequests.filter((request) => this.isLeaveWfhPendingFor(actor, request)).length;
    const pendingDocuments = this.pendingDocumentVerificationCount(actor, visibleTickets, visibleUserIds);
    const operations = {
      assets_total: visibleAssets.length,
      assets_assigned: visibleAssets.filter((asset) => asset.status === AssetStatuses.Assigned).length,
      assets_recovery_pending: this.store.assetRecoveryTickets.filter(
        (ticket) => visibleUserIds.has(ticket.employee_user_id) && ticket.status !== "closed"
      ).length,
      notifications_pending: this.store.notifications.filter((notification) => this.isNotificationVisible(actor, visibleUserIds, notification.target_user_id) && notification.status === "pending").length,
      outbox_pending: this.visibleOutboxEvents(actor, visibleUserIds).filter((event) => event.status === "pending" || event.status === "retry").length
    };
    const workload = {
      work_segments_total: visibleSegments.length,
      submitted_hours_total: sumDecimal(visibleSegments.map((segment) => segment.hours)),
      timesheet_submissions_total: visibleSubmissions.length,
      timesheet_submissions_approved: visibleSubmissions.filter((submission) => submission.status === TimesheetStatuses.Approved).length,
      timesheet_submissions_returned: visibleSubmissions.filter((submission) => submission.status === TimesheetStatuses.Returned).length
    };
    const activeEmployees = visibleUsers.filter((user) => user.employment_status === EmploymentStatuses.Active).length;
    const expensePending = pendingManagerExpenses + pendingFinanceExpenses;
    return {
      generated_at: nowIso(),
      scope: {
        actor_user_id: actor.id,
        employee_code: actor.employee_code,
        primary_role: actor.roles[0] ?? Roles.Employee,
        roles: [...actor.roles],
        visibility: this.canSeeSystemWide(actor) ? "all" : "self_and_descendants"
      },
      cards: [
        metric("active_employees", "Active employees", activeEmployees, "count", "core"),
        metric("pending_expense_approvals", "Pending expense approvals", expensePending, "count", "expenses"),
        metric("pending_timesheet_approvals", "Pending timesheet approvals", pendingTimesheets, "count", "timesheets"),
        metric("pending_leave_wfh_approvals", "Pending Leave/WFH approvals", pendingLeaves + pendingWfh, "count", "leave_wfh"),
        metric("attendance_exceptions", "Attendance exceptions", this.attendanceExceptionCount(visibleAttendance), "count", "attendance"),
        metric("assigned_assets", "Assigned assets", operations.assets_assigned, "count", "assets"),
        metric("documents_pending_verification", "Documents pending verification", pendingDocuments, "count", "documents"),
        metric("submitted_hours", "Submitted hours", workload.submitted_hours_total, "hours", "timesheets")
      ],
      workforce: {
        visible_employees: visibleUsers.length,
        active_employees: activeEmployees,
        inactive_employees: visibleUsers.filter((user) => user.employment_status !== EmploymentStatuses.Active).length,
        new_joiners_30d: visibleUsers.filter((user) => user.joined_on && user.joined_on >= daysAgoDate(30)).length,
        departments: this.departmentHeadcount(actor, visibleUsers)
      },
      approvals: {
        expense_manager_pending: pendingManagerExpenses,
        expense_finance_pending: pendingFinanceExpenses,
        expense_total_pending: expensePending,
        timesheet_pending: pendingTimesheets,
        leave_pending: pendingLeaves,
        wfh_pending: pendingWfh,
        document_verification_pending: pendingDocuments
      },
      operations,
      workload,
      attention: [
        metric("pending_expense_approvals", "Expense approvals waiting", expensePending, "count", "expenses"),
        metric("pending_timesheet_approvals", "Timesheets waiting", pendingTimesheets, "count", "timesheets"),
        metric("pending_leave_wfh_approvals", "Leave/WFH approvals waiting", pendingLeaves + pendingWfh, "count", "leave_wfh"),
        metric("attendance_exceptions", "Attendance exceptions", this.attendanceExceptionCount(visibleAttendance), "count", "attendance"),
        metric("asset_recovery_pending", "Asset recoveries pending", operations.assets_recovery_pending, "count", "assets"),
        metric("outbox_pending", "Integration events pending", operations.outbox_pending, "count", "outbox")
      ].filter((item) => Number(item.value) > 0),
      unavailable_features: [
        {
          key: "helpdesk",
          label: "Helpdesk",
          status: "not_implemented",
          notes: "Helpdesk workflows are scheduled for Phase 4 and are not counted in this dashboard yet."
        },
        {
          key: "projects_utilization",
          label: "Projects and utilization",
          status: "not_implemented",
          notes: "Projects/utilization APIs are scheduled for Phase 4; current timesheet project codes remain lightweight metadata."
        }
      ]
    };
  }

  private canSeeSystemWide(actor: AuthUser): boolean {
    const systemWideRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.HRManager, Roles.AssetManager];
    return actor.roles.some((role) => systemWideRoles.includes(role));
  }

  private canSeeFinance(actor: AuthUser): boolean {
    const financeRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.FinanceManager];
    return actor.roles.some((role) => financeRoles.includes(role));
  }

  private visibleUsers(actor: AuthUser): CoreUser[] {
    const users = this.store.users.filter((user) => !user.deleted_at && this.isInActorCompany(actor, user));
    if (this.canSeeSystemWide(actor)) {
      return users;
    }
    return users.filter((user) => user.id === actor.id || user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`));
  }

  private visibleTickets(actor: AuthUser, visibleUserIds: Set<UUID>): ExpenseTicket[] {
    const tickets = this.store.tickets
      .filter((ticket) => !ticket.deleted_at)
      .filter((ticket) =>
        !this.hasActorCompanyScope(actor) ||
        [
          ticket.requester_user_id,
          ticket.manager_verifier_id,
          ticket.manager_backup_user_id,
          ticket.finance_approver_id
        ].some((userId) => userId != null && visibleUserIds.has(userId))
      );
    if (this.canSeeSystemWide(actor) || this.canSeeFinance(actor)) {
      return tickets;
    }
    return tickets.filter(
      (ticket) =>
        visibleUserIds.has(ticket.requester_user_id) ||
        ticket.manager_verifier_id === actor.id ||
        ticket.manager_backup_user_id === actor.id ||
        ticket.finance_approver_id === actor.id
    );
  }

  private visibleTimesheetSubmissions(actor: AuthUser, visibleUserIds: Set<UUID>): TimesheetSubmission[] {
    const submissions = this.store.timesheetSubmissions
      .filter((submission) => !submission.deleted_at)
      .filter((submission) =>
        !this.hasActorCompanyScope(actor) ||
        visibleUserIds.has(submission.employee_user_id) ||
        submission.current_approver_user_id === actor.id ||
        (submission.current_approver_user_id != null && visibleUserIds.has(submission.current_approver_user_id))
      );
    if (this.canSeeSystemWide(actor)) {
      return submissions;
    }
    return submissions.filter((submission) => visibleUserIds.has(submission.employee_user_id) || submission.current_approver_user_id === actor.id);
  }

  private visibleWorkSegments(actor: AuthUser, visibleUserIds: Set<UUID>): WorkSegment[] {
    const segments = this.store.workSegments
      .filter((segment) => !segment.deleted_at)
      .filter((segment) => !this.hasActorCompanyScope(actor) || visibleUserIds.has(segment.employee_user_id));
    if (this.canSeeSystemWide(actor)) {
      return segments;
    }
    return segments.filter((segment) => visibleUserIds.has(segment.employee_user_id));
  }

  private visibleAttendanceDays(actor: AuthUser, visibleUserIds: Set<UUID>) {
    const days = this.store.attendanceDayRecords
      .filter((record) => !record.deleted_at)
      .filter((record) => !this.hasActorCompanyScope(actor) || visibleUserIds.has(record.employee_user_id));
    if (this.canSeeSystemWide(actor)) {
      return days;
    }
    return days.filter((record) => visibleUserIds.has(record.employee_user_id));
  }

  private visibleLeaveRequests(actor: AuthUser, visibleUserIds: Set<UUID>): LeaveRequest[] {
    const requests = this.store.leaveRequests
      .filter((request) => !request.deleted_at)
      .filter((request) =>
        !this.hasActorCompanyScope(actor) ||
        visibleUserIds.has(request.employee_user_id) ||
        request.current_approver_user_id === actor.id ||
        (request.current_approver_user_id != null && visibleUserIds.has(request.current_approver_user_id))
      );
    if (this.canSeeSystemWide(actor)) {
      return requests;
    }
    return requests.filter((request) => visibleUserIds.has(request.employee_user_id) || request.current_approver_user_id === actor.id);
  }

  private visibleWfhRequests(actor: AuthUser, visibleUserIds: Set<UUID>): WfhRequest[] {
    const requests = this.store.wfhRequests
      .filter((request) => !request.deleted_at)
      .filter((request) =>
        !this.hasActorCompanyScope(actor) ||
        visibleUserIds.has(request.employee_user_id) ||
        request.current_approver_user_id === actor.id ||
        (request.current_approver_user_id != null && visibleUserIds.has(request.current_approver_user_id))
      );
    if (this.canSeeSystemWide(actor)) {
      return requests;
    }
    return requests.filter((request) => visibleUserIds.has(request.employee_user_id) || request.current_approver_user_id === actor.id);
  }

  private attendanceExceptionCount(records: Array<{ exception_type: string | null; status: string }>): number {
    return records.filter(
      (record) =>
        record.exception_type ||
        record.status === AttendanceDayStatuses.Absent ||
        record.status === AttendanceDayStatuses.Late
    ).length;
  }

  private visibleAssets(actor: AuthUser, visibleUserIds: Set<UUID>) {
    const assets = this.store.assets
      .filter((asset) => !asset.deleted_at)
      .filter((asset) =>
        !this.hasActorCompanyScope(actor) ||
        (asset.current_assigned_user_id != null && visibleUserIds.has(asset.current_assigned_user_id))
      );
    if (this.canSeeSystemWide(actor)) {
      return assets;
    }
    return assets.filter((asset) => asset.current_assigned_user_id && visibleUserIds.has(asset.current_assigned_user_id));
  }

  private isManagerPendingFor(actor: AuthUser, ticket: ExpenseTicket): boolean {
    return (
      ticket.status === ExpenseStatuses.PendingManagerVerification &&
      (ticket.manager_verifier_id === actor.id || ticket.manager_backup_user_id === actor.id || this.canSeeSystemWide(actor))
    );
  }

  private isFinancePendingFor(actor: AuthUser, ticket: ExpenseTicket): boolean {
    return FINANCE_PENDING_STATUSES.has(ticket.status) && (ticket.finance_approver_id === actor.id || this.canSeeFinance(actor));
  }

  private isTimesheetPendingFor(actor: AuthUser, submission: TimesheetSubmission): boolean {
    return (
      submission.status === TimesheetStatuses.PendingApproval &&
      (submission.current_approver_user_id === actor.id || this.canSeeSystemWide(actor))
    );
  }

  private isLeaveWfhPendingFor(actor: AuthUser, request: LeaveRequest | WfhRequest): boolean {
    return (
      request.status === LeaveRequestStatuses.PendingManager &&
      (request.current_approver_user_id === actor.id || this.canSeeSystemWide(actor))
    );
  }

  private pendingDocumentVerificationCount(actor: AuthUser, visibleTickets: ExpenseTicket[], visibleUserIds: Set<UUID>): number {
    const visibleTicketIds = new Set(visibleTickets.map((ticket) => ticket.id));
    return this.store.expenseDocuments.filter((document) => {
      if (document.verification_status !== "pending") {
        return false;
      }
      if (visibleTicketIds.has(document.ticket_id)) {
        return true;
      }
      if (this.hasActorCompanyScope(actor)) {
        return visibleUserIds.has(document.uploaded_by);
      }
      return visibleUserIds.has(document.uploaded_by) || this.canSeeFinance(actor) || this.canSeeSystemWide(actor);
    }).length;
  }

  private isNotificationVisible(actor: AuthUser, visibleUserIds: Set<UUID>, targetUserId: UUID | null): boolean {
    if (this.hasActorCompanyScope(actor)) {
      return targetUserId === actor.id || (targetUserId ? visibleUserIds.has(targetUserId) : false);
    }
    return this.canSeeSystemWide(actor) || targetUserId === actor.id || (targetUserId ? visibleUserIds.has(targetUserId) : false);
  }

  private visibleOutboxEvents(actor: AuthUser, visibleUserIds: Set<UUID>) {
    if (!this.canSeeSystemWide(actor)) {
      return [];
    }
    const actorCompanyId = this.companyIdForUser(actor.id);
    if (!actorCompanyId) {
      return this.store.outbox;
    }
    return this.store.outbox.filter((event) => event.aggregate_id === actorCompanyId || visibleUserIds.has(event.aggregate_id));
  }

  private companyIdForUser(userId: UUID): UUID | null {
    return this.store.userSessionPreferences.find((preference) => preference.user_id === userId)?.company_id ?? null;
  }

  private hasActorCompanyScope(actor: AuthUser): boolean {
    return this.companyIdForUser(actor.id) != null;
  }

  private isInActorCompany(actor: AuthUser, user: CoreUser): boolean {
    const actorCompanyId = this.companyIdForUser(actor.id);
    if (!actorCompanyId) {
      return true;
    }
    return user.id === actor.id || this.companyIdForUser(user.id) === actorCompanyId;
  }

  private departmentHeadcount(actor: AuthUser, users: CoreUser[]): DashboardSummary["workforce"]["departments"] {
    const actorCompanyId = this.companyIdForUser(actor.id);
    const activeUsers = users.filter((user) => user.employment_status === EmploymentStatuses.Active);
    return this.store.departments
      .filter((department) => !department.deleted_at && department.status === "active")
      .filter((department) => actorCompanyId ? department.company_id === actorCompanyId : department.company_id === null)
      .map((department) => ({
        department_id: department.id,
        department_code: department.department_code,
        name: department.name,
        active_employees: activeUsers.filter((user) => user.department_id === department.id).length
      }))
      .sort((left, right) => left.department_code.localeCompare(right.department_code));
  }
}

function metric(
  key: string,
  label: string,
  value: number | string,
  unit: DashboardMetric["unit"],
  source: DashboardMetric["source"]
): DashboardMetric {
  return { key, label, value, unit, source };
}

function daysAgoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function sumDecimal(values: string[]): string {
  const total = values.reduce((sum, value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  return total.toFixed(2);
}
