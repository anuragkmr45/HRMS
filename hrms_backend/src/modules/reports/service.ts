import { randomUUID } from "node:crypto";
import type {
  AuthUser,
  CoreUser,
  ExpensePayment,
  ExpenseTicket,
  OutboxEvent,
  ProjectRecord,
  UUID,
} from "#shared";
import {
  addMoney,
  AssetStatuses,
  compareMoney,
  ExpenseStatuses,
  HelpdeskTicketStatuses,
  ProjectMemberStatuses,
  ProjectStatuses,
  Roles,
  RequiredDocumentsByExpenseSubType,
} from "#shared";
import type {
  ExpenseApprovalRecord,
  MemoryDataStore,
} from "../../platform/data-store.js";
import { ReportRepository } from "./repository.js";
import { assertReportRole } from "./policy.js";
import { forbidden, notFound } from "../../platform/errors.js";
import {
  createGeneratedExportDocument,
  type GeneratedExportFormat,
} from "../../platform/generated-exports.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { canSeeProject } from "../projects/policy.js";

export interface ExpenseReportQuery {
  page: number;
  page_size: number;
  sort?: string;
  status?: string;
  expense_type?: string;
  expense_sub_type?: string;
  payment_type?: string;
  department_id?: UUID;
  requester_user_id?: UUID;
  manager_user_id?: UUID;
  finance_user_id?: UUID;
  date_from?: string;
  date_to?: string;
  document_status?: "any" | "complete" | "missing" | "pending" | "not_required";
}

export interface ReportSummaryQuery {
  page: number;
  page_size: number;
  status?: string;
  type?: string;
  request_kind?: "leave" | "wfh";
  department_id?: UUID;
  user_id?: UUID;
  employee_user_id?: UUID;
  project_id?: UUID;
  assigned_to_user_id?: UUID;
  actor_user_id?: UUID;
  client?: string;
  category_id?: UUID;
  module?: string;
  action?: string;
  report_type?: string;
  date_from?: string;
  date_to?: string;
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

function pageWithMeta<T, TMeta extends Record<string, unknown>>(
  items: T[],
  pageNumber: number,
  pageSize: number,
  meta: TMeta,
) {
  return { ...page(items, pageNumber, pageSize), ...meta };
}

export class ReportService {
  private readonly repository: ReportRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new ReportRepository(store);
  }

  myExpenses(actor: AuthUser, query: ExpenseReportQuery) {
    const tickets = this.applyTicketFilters(
      this.repository
        .tickets()
        .filter((ticket) => ticket.requester_user_id === actor.id),
      query,
    );
    const rows = tickets.map((ticket) => this.presentTicket(ticket));
    return pageWithMeta(rows, query.page, query.page_size, {
      summary: this.ticketSummary(tickets),
      cards: this.expenseCards(tickets),
      filters: this.appliedFilterSummary(query),
    });
  }

  managerQueue(actor: AuthUser, query: ExpenseReportQuery) {
    const queueTickets = this.repository
      .tickets()
      .filter(
        (ticket) =>
          ticket.status === ExpenseStatuses.PendingManagerVerification,
      )
      .filter(
        (ticket) =>
          actor.roles.includes(Roles.Admin) ||
          ticket.manager_verifier_id === actor.id ||
          ticket.manager_backup_user_id === actor.id,
      );
    const tickets = this.applyTicketFilters(queueTickets, query);
    const rows = tickets.map((ticket) => ({
      ...this.presentTicket(ticket),
      manager_assignment_type:
        ticket.manager_backup_user_id === actor.id ? "backup" : "direct",
      manager_action_required: true,
    }));
    return pageWithMeta(rows, query.page, query.page_size, {
      queue_counts: {
        total: tickets.length,
        direct_assigned: tickets.filter(
          (ticket) => ticket.manager_verifier_id === actor.id,
        ).length,
        backup_assigned: tickets.filter(
          (ticket) => ticket.manager_backup_user_id === actor.id,
        ).length,
        overdue_72h: tickets.filter(
          (ticket) =>
            ageHours(
              ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at,
            ) > 72,
        ).length,
      },
      cards: this.managerCards(tickets),
      filters: this.appliedFilterSummary(query),
    });
  }

  financeDashboard(actor: AuthUser, query: ExpenseReportQuery) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin, Roles.Auditor]);
    const tickets = this.applyTicketFilters(
      this.financeScopedTickets(actor),
      query,
    );
    const rows = tickets.map((ticket) => this.presentTicket(ticket));
    return pageWithMeta(rows, query.page, query.page_size, {
      cards: this.financeCards(tickets),
      aging_buckets: this.agingBuckets(tickets),
      payable_totals: this.payableTotals(tickets),
      exception_counts: this.exceptionCounts(tickets),
      filters: this.appliedFilterSummary(query),
    });
  }

  managerHistory(actor: AuthUser, query: ExpenseReportQuery) {
    const rows = this.store.expenseApprovals
      .filter(
        (approval) =>
          approval.approval_stage === "manager" &&
          (approval.approver_user_id === actor.id ||
            actor.roles.includes(Roles.Admin)),
      )
      .sort(
        (left, right) =>
          Date.parse(right.action_at) - Date.parse(left.action_at),
      )
      .map((approval) => this.presentManagerApproval(approval))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => this.matchesReportRow(row.ticket, query));
    return pageWithMeta(rows, query.page, query.page_size, {
      summary: {
        total_actions: rows.length,
        verified: rows.filter((row) => row.decision === "approve").length,
        returned: rows.filter((row) => row.decision === "return").length,
        rejected: rows.filter((row) => row.decision === "reject").length,
      },
      filters: this.appliedFilterSummary(query),
    });
  }

  financeHistory(actor: AuthUser, query: ExpenseReportQuery) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin, Roles.Auditor]);
    const canSeeAll =
      actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor);
    const rows = this.repository
      .audits()
      .filter((log) => canSeeAll || log.actor_user_id === actor.id)
      .filter(
        (log) =>
          log.event_type.startsWith("expense.finance.") ||
          log.event_type === "expense.payment_released" ||
          log.event_type === "expense.settlement",
      )
      .sort(
        (left, right) =>
          Date.parse(right.created_at) - Date.parse(left.created_at),
      )
      .map((log) => {
        const ticket = this.repository
          .tickets()
          .find((candidate) => candidate.id === log.ticket_id);
        const actorUser = this.store.users.find(
          (user) => user.id === log.actor_user_id && !user.deleted_at,
        );
        return ticket
          ? {
              ticket: this.presentTicket(ticket),
              stage: log.event_type.includes("payment")
                ? "payment"
                : log.event_type.includes("settlement")
                  ? "settlement"
                  : "finance",
              decision: log.event_type
                .replace("expense.", "")
                .replaceAll(".", " "),
              remarks: log.remarks,
              actor_user_id: log.actor_user_id,
              actor_label: actorUser
                ? `${actorUser.employee_code} - ${actorUser.full_name}`
                : log.actor_user_id,
              acted_at: log.created_at,
              audit_event_type: log.event_type,
              payment: this.paymentSummary(ticket),
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => this.matchesReportRow(row.ticket, query));
    return pageWithMeta(rows, query.page, query.page_size, {
      summary: {
        total_actions: rows.length,
        finance_decisions: rows.filter((row) => row.stage === "finance").length,
        payments: rows.filter((row) => row.stage === "payment").length,
        settlements: rows.filter((row) => row.stage === "settlement").length,
      },
      filters: this.appliedFilterSummary(query),
    });
  }

  financeAnalytics(actor: AuthUser) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin, Roles.Auditor]);
    const tickets = this.financeScopedTickets(actor);
    const payments = this.repository
      .payments()
      .filter((payment) =>
        tickets.some((ticket) => ticket.id === payment.ticket_id),
      );
    const missingDocumentTickets = tickets.filter(
      (ticket) => this.missingRequiredDocuments(ticket).length > 0,
    );
    const highValueTickets = tickets
      .filter(
        (ticket) => compareMoney(ticket.estimated_amount, "100000.00") >= 0,
      )
      .sort((left, right) =>
        compareMoney(right.estimated_amount, left.estimated_amount),
      )
      .slice(0, 5);
    const staleTickets = tickets.filter(
      (ticket) =>
        ageHours(
          ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at,
        ) > 72,
    );
    const payable = payments
      .filter((payment) => payment.settlement_status === "payable")
      .map((payment) => payment.settlement_amount ?? "0.00");
    const recoverable = payments
      .filter((payment) => payment.settlement_status === "recoverable")
      .map((payment) => payment.settlement_amount ?? "0.00");
    const recoverableAbsolute = recoverable.map((value) =>
      value.replace("-", ""),
    );

    return {
      generated_at: new Date().toISOString(),
      cards: this.financeCards(tickets),
      aging_buckets: this.agingBuckets(tickets),
      payable_totals: this.payableTotals(tickets),
      exception_counts: this.exceptionCounts(tickets),
      summary: {
        total_tickets: tickets.length,
        pending_finance_approval: countStatus(
          tickets,
          ExpenseStatuses.ManagerVerified,
        ),
        finance_hold: countStatus(tickets, ExpenseStatuses.FinanceHold),
        finance_approved: countStatus(tickets, ExpenseStatuses.FinanceApproved),
        payment_released: countStatus(tickets, ExpenseStatuses.PaymentReleased),
        bills_submitted: countStatus(tickets, ExpenseStatuses.BillsSubmitted),
        pending_adjustment: countStatus(
          tickets,
          ExpenseStatuses.PendingAdjustment,
        ),
        closed: countClosedTickets(tickets),
        advance_outstanding_amount: addMoney(
          tickets
            .filter(
              (ticket) =>
                ticket.payment_type === "Advance" &&
                ticket.status !== ExpenseStatuses.Closed,
            )
            .map((ticket) => ticket.advance_amount ?? "0.00"),
        ),
        payable_amount: addMoney(payable),
        recoverable_amount: addMoney(recoverableAbsolute),
        missing_document_risks: missingDocumentTickets.length,
        high_value_tickets: highValueTickets.length,
        sla_breaches: staleTickets.length,
      },
      status_distribution: groupCount(tickets, (ticket) => ticket.status),
      monthly_spend_trend: groupMoney(
        tickets,
        (ticket) => ticket.created_at.slice(0, 7),
        (ticket) => ticket.estimated_amount,
      ),
      spend_by_department: groupMoney(
        tickets,
        (ticket) => this.repository.departmentName(ticket.department_id),
        (ticket) => ticket.estimated_amount,
      ),
      spend_by_expense_type: groupMoney(
        tickets,
        (ticket) => ticket.expense_type,
        (ticket) => ticket.estimated_amount,
      ),
      spend_by_subtype: groupMoney(
        tickets,
        (ticket) => ticket.expense_sub_type,
        (ticket) => ticket.estimated_amount,
      ),
      advance_aging: groupCount(
        tickets.filter(
          (ticket) =>
            ticket.payment_type === "Advance" &&
            ticket.status !== ExpenseStatuses.Closed,
        ),
        (ticket) =>
          agingBucket(
            ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at,
          ),
      ),
      settlement_variance: [
        {
          label: "payable",
          amount: addMoney(payable.map((value) => value.replace("-", ""))),
        },
        { label: "recoverable", amount: addMoney(recoverableAbsolute) },
        {
          label: "no_balance",
          amount: "0.00",
          count: payments.filter(
            (payment) => payment.settlement_status === "no_balance",
          ).length,
        },
      ],
      risk_indicators: [
        {
          label: "Missing documents",
          count: missingDocumentTickets.length,
          severity: "must",
        },
        {
          label: "Finance hold",
          count: countStatus(tickets, ExpenseStatuses.FinanceHold),
          severity: "should",
        },
        {
          label: "SLA over 72h",
          count: staleTickets.length,
          severity: "should",
        },
        {
          label: "High value",
          count: highValueTickets.length,
          severity: "review",
        },
      ],
      high_value_tickets: highValueTickets.map((ticket) => ({
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        requester_user_id: ticket.requester_user_id,
        requester_label: this.userLabel(ticket.requester_user_id),
        status: ticket.status,
        estimated_amount: ticket.estimated_amount,
        document_status: this.documentSummary(ticket).status,
      })),
      policy_warnings: missingDocumentTickets.slice(0, 5).map((ticket) => ({
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        warning: "required_documents_missing",
        missing_document_types: this.missingRequiredDocuments(ticket),
      })),
    };
  }

  register(actor: AuthUser, query: ExpenseReportQuery) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Auditor, Roles.Admin]);
    const isFinance =
      actor.roles.includes(Roles.FinanceManager) ||
      actor.roles.includes(Roles.Admin);
    const tickets = this.applyTicketFilters(
      this.financeScopedTickets(actor),
      query,
    );
    const rows = tickets.map((ticket) => {
      const presented = this.presentTicket(ticket);
      if (isFinance) {
        return {
          ...presented,
          register_columns: this.registerColumns(ticket),
          export_fields: this.exportFields(ticket),
        };
      }
      return {
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        requester_user_id: ticket.requester_user_id,
        requester_label: presented.requester_label,
        department_name: presented.department_name,
        status: ticket.status,
        estimated_amount: ticket.estimated_amount,
        document_summary: presented.document_summary,
        register_columns: this.registerColumns(ticket),
      };
    });
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: this.registerTotals(tickets),
      filters: this.appliedFilterSummary(query),
      export_columns: [
        "ticket_no",
        "requester_label",
        "department_name",
        "status",
        "estimated_amount",
        "approved_amount",
        "actual_amount",
        "payment_reference_no",
        "document_status",
        "settlement_delta",
      ],
    });
  }

  advanceAging(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.FinanceManager]);
    const agingStatuses: readonly string[] = [
      ExpenseStatuses.PaymentReleased,
      ExpenseStatuses.BillsSubmitted,
      ExpenseStatuses.PendingAdjustment,
    ];
    return page(
      this.repository
        .tickets()
        .filter(
          (ticket) =>
            ticket.payment_type === "Advance" &&
            agingStatuses.includes(ticket.status),
        ),
      pageNumber,
      pageSize,
    );
  }

  paymentRegister(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Auditor]);
    const tickets = this.financeScopedTickets(actor);
    const rows = this.repository
      .payments()
      .filter((payment) =>
        tickets.some((ticket) => ticket.id === payment.ticket_id),
      )
      .map((payment) => {
        const ticket = tickets.find(
          (candidate) => candidate.id === payment.ticket_id,
        );
        return {
          ...payment,
          ticket_no: ticket?.ticket_no ?? null,
          status: ticket?.status ?? null,
          requester_user_id: ticket?.requester_user_id ?? null,
        };
      });
    return page(rows, pageNumber, pageSize);
  }

  audit(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.Auditor, Roles.FinanceManager, Roles.Admin]);
    return page(this.repository.audits(), pageNumber, pageSize);
  }

  hrEmployees(actor: AuthUser, query: ReportSummaryQuery) {
    assertReportRole(actor, [Roles.HRManager, Roles.Admin, Roles.Auditor]);
    const rows = this.store.users
      .filter((user) => !user.deleted_at)
      .filter(
        (user) =>
          !query.department_id || user.department_id === query.department_id,
      )
      .filter(
        (user) => !query.status || user.employment_status === query.status,
      )
      .filter(
        (user) =>
          !query.date_from ||
          !user.joined_on ||
          user.joined_on >= query.date_from,
      )
      .filter(
        (user) =>
          !query.date_to || !user.joined_on || user.joined_on <= query.date_to,
      )
      .map((user) => this.presentEmployeeReportRow(user));
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: {
        employees: rows.length,
        active: rows.filter((row) => row.status === "active").length,
        inactive: rows.filter((row) => row.status !== "active").length,
        departments: new Set(rows.map((row) => row.department_id)).size,
      },
      department_headcount: groupCount(rows, (row) => row.department_name),
      designation_headcount: groupCount(rows, (row) => row.designation_title),
      role_access: rows.map((row) => ({
        id: row.id,
        employee_code: row.employee_code,
        employee: row.full_name,
        department: row.department_name,
        roles: row.roles,
        login_enabled: row.login_enabled,
        last_login_at: row.last_login_at,
      })),
      filters: this.appliedSummaryFilters(query),
    });
  }

  attendanceSummary(actor: AuthUser, query: ReportSummaryQuery) {
    const rows = this.store.attendanceDayRecords
      .filter((record) => !record.deleted_at)
      .filter((record) =>
        this.canSeeUserReportRow(actor, record.employee_user_id, "attendance"),
      )
      .filter(
        (record) => !query.user_id || record.employee_user_id === query.user_id,
      )
      .filter(
        (record) =>
          !query.employee_user_id ||
          record.employee_user_id === query.employee_user_id,
      )
      .filter((record) => !query.status || record.status === query.status)
      .filter(
        (record) => !query.date_from || record.work_date >= query.date_from,
      )
      .filter((record) => !query.date_to || record.work_date <= query.date_to)
      .filter((record) => {
        const user = this.user(record.employee_user_id);
        return (
          !query.department_id || user?.department_id === query.department_id
        );
      })
      .map((record) => {
        const user = this.user(record.employee_user_id);
        return {
          id: record.id,
          date: record.work_date,
          employee_user_id: record.employee_user_id,
          employee_code: user?.employee_code ?? null,
          employee: user?.full_name ?? record.employee_user_id,
          department_id: user?.department_id ?? null,
          department: user ? this.departmentName(user.department_id) : null,
          status: record.status,
          in_time: record.first_check_in?.slice(11, 16) ?? "",
          out_time: record.last_check_out?.slice(11, 16) ?? "",
          hours: Math.round((record.work_minutes / 60) * 10) / 10,
          late_minutes: record.late_minutes,
          early_out_minutes: record.early_out_minutes,
          work_mode: record.work_mode,
          exception_type: record.exception_type,
          note: record.note,
        };
      })
      .sort((left, right) => right.date.localeCompare(left.date));
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: {
        records: rows.length,
        present: rows.filter((row) => row.status === "present").length,
        late: rows.filter((row) => row.status === "late").length,
        absent: rows.filter((row) => row.status === "absent").length,
        wfh: rows.filter((row) => row.status === "wfh").length,
        leave: rows.filter((row) => row.status === "leave").length,
        average_hours: average(rows.map((row) => row.hours)),
      },
      status_breakdown: groupCount(rows, (row) => row.status),
      department_breakdown: groupCount(
        rows,
        (row) => row.department ?? "Unknown",
      ),
      filters: this.appliedSummaryFilters(query),
    });
  }

  leaveWfhSummary(actor: AuthUser, query: ReportSummaryQuery) {
    assertReportRole(actor, [
      Roles.HRManager,
      Roles.Admin,
      Roles.Auditor,
      Roles.Reviewer,
      Roles.Director,
    ]);
    const leaveRows = this.store.leaveRequests
      .filter((request) => !request.deleted_at)
      .filter(
        (request) => !query.request_kind || query.request_kind === "leave",
      )
      .filter((request) =>
        this.canSeeUserReportRow(actor, request.employee_user_id, "leave"),
      )
      .map((request) => this.presentLeaveWfhRow("leave", request));
    const wfhRows = this.store.wfhRequests
      .filter((request) => !request.deleted_at)
      .filter((request) => !query.request_kind || query.request_kind === "wfh")
      .filter((request) =>
        this.canSeeUserReportRow(actor, request.employee_user_id, "leave"),
      )
      .map((request) => this.presentLeaveWfhRow("wfh", request));
    const rows = [...leaveRows, ...wfhRows]
      .filter((row) => !query.user_id || row.employee_user_id === query.user_id)
      .filter(
        (row) =>
          !query.employee_user_id ||
          row.employee_user_id === query.employee_user_id,
      )
      .filter(
        (row) =>
          !query.department_id || row.department_id === query.department_id,
      )
      .filter((row) => !query.status || row.status === query.status)
      .filter((row) => !query.date_from || row.from_date >= query.date_from)
      .filter((row) => !query.date_to || row.from_date <= query.date_to)
      .sort((left, right) => right.from_date.localeCompare(left.from_date));
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: {
        requests: rows.length,
        leave: rows.filter((row) => row.kind === "leave").length,
        wfh: rows.filter((row) => row.kind === "wfh").length,
        approved: rows.filter((row) => row.status === "approved").length,
        pending: rows.filter((row) => row.status.includes("pending")).length,
        rejected: rows.filter((row) => row.status === "rejected").length,
        total_duration: rows.reduce((sum, row) => sum + row.duration, 0),
      },
      status_breakdown: groupCount(rows, (row) => row.status),
      type_breakdown: groupCount(rows, (row) =>
        row.kind === "leave" ? (row.leave_type ?? "leave") : "wfh",
      ),
      balance_rows: leaveBalanceRows(
        this.store.leaveRequests.filter((request) => !request.deleted_at),
      ),
      holiday_rows: this.store.holidays
        .filter((holiday) => !holiday.deleted_at)
        .map((holiday) => ({
          id: holiday.id,
          name: holiday.name,
          date: holiday.holiday_date,
          region: holiday.region,
          optional: holiday.optional,
        })),
      filters: this.appliedSummaryFilters(query),
    });
  }

  projectsSummary(actor: AuthUser, query: ReportSummaryQuery) {
    const visibleProjects = this.store.projects
      .filter((project) => !project.deleted_at)
      .filter((project) =>
        canSeeProject(
          actor,
          project,
          this.store.projectMembers.filter(
            (member) => member.project_id === project.id,
          ),
          this.store.users,
        ),
      )
      .filter((project) => !query.project_id || project.id === query.project_id)
      .filter((project) => !query.status || project.status === query.status)
      .filter(
        (project) =>
          !query.client ||
          project.client_name
            .toLowerCase()
            .includes(query.client.toLowerCase()),
      )
      .filter(
        (project) =>
          !query.department_id || project.department_id === query.department_id,
      )
      .filter(
        (project) => !query.date_from || project.end_date >= query.date_from,
      )
      .filter(
        (project) => !query.date_to || project.start_date <= query.date_to,
      );
    const rows = visibleProjects.map((project) =>
      this.presentProjectReportRow(project),
    );
    const allocations = visibleProjects.flatMap((project) =>
      this.store.projectMembers
        .filter(
          (member) => member.project_id === project.id && !member.deleted_at,
        )
        .map((member) =>
          this.presentProjectAllocationReportRow(project, member),
        ),
    );
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: {
        projects: rows.length,
        active: rows.filter((row) => row.status === ProjectStatuses.Active)
          .length,
        archived: rows.filter((row) => row.status === ProjectStatuses.Archived)
          .length,
        allocated_percent: allocations.reduce(
          (sum, row) => sum + row.allocation,
          0,
        ),
        billable_percent: allocations
          .filter((row) => row.billable)
          .reduce((sum, row) => sum + row.allocation, 0),
      },
      allocation_rows: allocations,
      utilization_rows: utilizationRows(allocations),
      history_rows: allocations.map((row) => ({
        id: `${row.id}-history`,
        employee: row.employee,
        project: row.project,
        code: row.code,
        role: row.role,
        from: row.from,
        to: row.to,
      })),
      cost_rows: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        client: row.client,
        team: row.team,
        estimated_budget: row.estimated_budget,
        actual_spend: row.actual_spend,
        status: row.status,
      })),
      filters: this.appliedSummaryFilters(query),
    });
  }

  timesheetsSummary(actor: AuthUser, query: ReportSummaryQuery) {
    assertReportRole(actor, [
      Roles.HRManager,
      Roles.Admin,
      Roles.Auditor,
      Roles.Reviewer,
      Roles.Director,
    ]);
    const rows = this.store.timesheetSubmissions
      .filter((submission) => !submission.deleted_at)
      .filter((submission) =>
        this.canSeeUserReportRow(
          actor,
          submission.employee_user_id,
          "timesheet",
        ),
      )
      .filter(
        (submission) =>
          !query.user_id || submission.employee_user_id === query.user_id,
      )
      .filter(
        (submission) =>
          !query.employee_user_id ||
          submission.employee_user_id === query.employee_user_id,
      )
      .filter(
        (submission) => !query.status || submission.status === query.status,
      )
      .filter(
        (submission) =>
          !query.date_from || submission.cycle_end >= query.date_from,
      )
      .filter(
        (submission) =>
          !query.date_to || submission.cycle_start <= query.date_to,
      )
      .map((submission) => {
        const user = this.user(submission.employee_user_id);
        const segments = this.store.workSegments.filter(
          (segment) =>
            segment.employee_user_id === submission.employee_user_id &&
            segment.work_date >= submission.cycle_start &&
            segment.work_date <= submission.cycle_end &&
            !segment.deleted_at,
        );
        return {
          id: submission.id,
          employee_user_id: submission.employee_user_id,
          employee: user?.full_name ?? submission.employee_user_id,
          employee_code: user?.employee_code ?? null,
          department_id: user?.department_id ?? null,
          department: user ? this.departmentName(user.department_id) : null,
          cycle_start: submission.cycle_start,
          cycle_end: submission.cycle_end,
          status: submission.status,
          total_hours: Number(submission.total_hours),
          billable_hours: sumNumbers(
            segments
              .filter((segment) => segment.billable)
              .map((segment) => Number(segment.hours)),
          ),
          non_billable_hours: sumNumbers(
            segments
              .filter((segment) => !segment.billable)
              .map((segment) => Number(segment.hours)),
          ),
          project_count: new Set(
            segments.map((segment) => segment.project_code).filter(Boolean),
          ).size,
          current_approver_user_id: submission.current_approver_user_id,
          version: submission.version,
        };
      })
      .filter(
        (row) =>
          !query.department_id || row.department_id === query.department_id,
      );
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: {
        submissions: rows.length,
        approved: rows.filter((row) => row.status === "Approved").length,
        pending: rows.filter((row) => row.status === "Pending Approval").length,
        returned: rows.filter((row) => row.status === "Returned").length,
        rejected: rows.filter((row) => row.status === "Rejected").length,
        total_hours: sumNumbers(rows.map((row) => row.total_hours)),
        billable_hours: sumNumbers(rows.map((row) => row.billable_hours)),
      },
      status_breakdown: groupCount(rows, (row) => row.status),
      project_rows: groupNumber(
        this.store.workSegments.filter(
          (segment) =>
            !segment.deleted_at &&
            rows.some(
              (row) =>
                row.employee_user_id === segment.employee_user_id &&
                segment.work_date >= row.cycle_start &&
                segment.work_date <= row.cycle_end,
            ),
        ),
        (segment) => segment.project_code ?? "Unassigned",
        (segment) => Number(segment.hours),
      ),
      productivity_rows: rows.map((row) => ({
        id: row.id,
        employee: row.employee,
        cycle_start: row.cycle_start,
        cycle_end: row.cycle_end,
        total_hours: row.total_hours,
        billable_mix:
          row.total_hours > 0
            ? Math.round((row.billable_hours / row.total_hours) * 100)
            : 0,
        status: row.status,
      })),
      filters: this.appliedSummaryFilters(query),
    });
  }

  assetsSummary(actor: AuthUser, query: ReportSummaryQuery) {
    assertReportRole(actor, [Roles.AssetManager, Roles.Admin, Roles.Auditor]);
    const rows = this.store.assets
      .filter((asset) => !asset.deleted_at)
      .filter((asset) => !query.status || asset.status === query.status)
      .filter((asset) => !query.type || asset.asset_type === query.type)
      .filter(
        (asset) =>
          !query.assigned_to_user_id ||
          asset.current_assigned_user_id === query.assigned_to_user_id,
      )
      .map((asset) => {
        const assignee = asset.current_assigned_user_id
          ? this.user(asset.current_assigned_user_id)
          : null;
        return {
          id: asset.id,
          asset_code: asset.asset_code,
          type: asset.asset_type,
          name: asset.name,
          serial_no: asset.serial_no,
          status: asset.status,
          assigned_to_user_id: asset.current_assigned_user_id,
          assigned_to: assignee?.full_name ?? null,
          location:
            typeof asset.metadata.location === "string"
              ? asset.metadata.location
              : null,
          brand:
            typeof asset.metadata.brand === "string"
              ? asset.metadata.brand
              : null,
          model:
            typeof asset.metadata.model === "string"
              ? asset.metadata.model
              : null,
          warranty_expiry:
            typeof asset.metadata.warranty_expiry === "string"
              ? asset.metadata.warranty_expiry
              : null,
          created_at: asset.created_at,
          updated_at: asset.updated_at,
        };
      });
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: {
        assets: rows.length,
        assigned: rows.filter((row) => row.status === AssetStatuses.Assigned)
          .length,
        available: rows.filter((row) => row.status === AssetStatuses.InStock)
          .length,
        repair: rows.filter((row) => row.status === AssetStatuses.InMaintenance)
          .length,
        lost_or_damaged: rows.filter(
          (row) => row.status === AssetStatuses.LostStolen,
        ).length,
      },
      status_breakdown: groupCount(rows, (row) => row.status),
      type_breakdown: groupCount(rows, (row) => row.type),
      maintenance_rows: this.store.assetMaintenanceRecords
        .filter((record) => !record.deleted_at)
        .map((record) => {
          const asset = this.store.assets.find(
            (candidate) => candidate.id === record.asset_id,
          );
          const vendor = record.vendor_id
            ? this.store.assetVendors.find(
                (candidate) => candidate.id === record.vendor_id,
              )
            : null;
          return {
            id: record.id,
            asset_id: record.asset_id,
            asset_code: asset?.asset_code ?? record.asset_id,
            asset: asset?.name ?? record.asset_id,
            type: record.maintenance_type,
            date: record.started_on,
            vendor: vendor?.name ?? null,
            cost: record.cost,
            status: record.status,
            notes: record.notes,
          };
        }),
      recovery_rows: this.store.assetRecoveryTickets.map((ticket) => ({
        id: ticket.id,
        employee_user_id: ticket.employee_user_id,
        employee:
          this.user(ticket.employee_user_id)?.full_name ??
          ticket.employee_user_id,
        asset_id: ticket.asset_id,
        asset_code:
          this.store.assets.find((asset) => asset.id === ticket.asset_id)
            ?.asset_code ?? ticket.asset_id,
        status: ticket.status,
        created_at: ticket.created_at,
      })),
      filters: this.appliedSummaryFilters(query),
    });
  }

  helpdeskSummary(actor: AuthUser, query: ReportSummaryQuery) {
    assertReportRole(actor, [
      Roles.HRManager,
      Roles.AssetManager,
      Roles.FinanceManager,
      Roles.Admin,
      Roles.Auditor,
    ]);
    const rows = this.store.helpdeskTickets
      .filter((ticket) => !ticket.deleted_at)
      .filter(
        (ticket) =>
          actor.roles.includes(Roles.Admin) ||
          actor.roles.includes(Roles.Auditor) ||
          ticket.assignee_user_id === actor.id ||
          ticket.requester_user_id === actor.id ||
          categoryAllowedForReport(actor, ticket.category_key),
      )
      .filter((ticket) => !query.status || ticket.status === query.status)
      .filter(
        (ticket) =>
          !query.category_id || ticket.category_id === query.category_id,
      )
      .filter(
        (ticket) =>
          !query.user_id || ticket.requester_user_id === query.user_id,
      )
      .filter(
        (ticket) =>
          !query.employee_user_id ||
          ticket.requester_user_id === query.employee_user_id,
      )
      .filter(
        (ticket) =>
          !query.date_from || ticket.created_at.slice(0, 10) >= query.date_from,
      )
      .filter(
        (ticket) =>
          !query.date_to || ticket.created_at.slice(0, 10) <= query.date_to,
      )
      .map((ticket) => ({
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        subject: ticket.subject,
        category_id: ticket.category_id,
        category: ticket.category_key,
        priority: ticket.priority,
        requester_user_id: ticket.requester_user_id,
        requester: ticket.requester_name,
        requester_department: ticket.requester_department,
        assignee_user_id: ticket.assignee_user_id,
        assignee: ticket.assignee_name,
        status: ticket.status,
        created_at: ticket.created_at,
        resolved_at: ticket.resolved_at,
        closed_at: ticket.closed_at,
        breached: isHelpdeskBreached(
          ticket.created_at,
          ticket.resolved_at ?? ticket.closed_at,
          ticket.priority,
        ),
      }));
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: {
        tickets: rows.length,
        open: rows.filter((row) => !isClosedHelpdeskStatus(row.status)).length,
        resolved: rows.filter(
          (row) => row.status === HelpdeskTicketStatuses.Resolved,
        ).length,
        closed: rows.filter(
          (row) => row.status === HelpdeskTicketStatuses.Closed,
        ).length,
        breached: rows.filter((row) => row.breached).length,
      },
      status_breakdown: groupCount(rows, (row) => row.status),
      category_rows: groupCount(rows, (row) => row.category),
      employee_rows: groupCount(rows, (row) => row.requester),
      agent_rows: helpdeskAgentRows(rows),
      resolution_rows: rows
        .filter((row) => row.resolved_at)
        .map((row) => ({
          id: row.id,
          ticket: row.ticket_no,
          subject: row.subject,
          category: row.category,
          priority: row.priority,
          assignee: row.assignee,
          hours: row.resolved_at
            ? Math.round(
                ((Date.parse(row.resolved_at) - Date.parse(row.created_at)) /
                  3_600_000) *
                  10,
              ) / 10
            : 0,
        })),
      filters: this.appliedSummaryFilters(query),
    });
  }

  auditReport(actor: AuthUser, query: ReportSummaryQuery) {
    assertReportRole(actor, [Roles.Auditor, Roles.Admin]);
    const expenseRows = this.store.auditLogs.map((log) => ({
      id: log.id,
      at: log.created_at,
      actor_user_id: log.actor_user_id,
      actor: this.userLabel(log.actor_user_id) ?? log.actor_user_id,
      action: log.event_type,
      module: "Expenses",
      target: log.ticket_id,
      remarks: log.remarks,
    }));
    const outboxRows = this.store.outbox.map((event) => ({
      id: event.event_id,
      at: event.created_at,
      actor_user_id:
        typeof event.payload.actor_user_id === "string"
          ? event.payload.actor_user_id
          : null,
      actor:
        typeof event.payload.actor_user_id === "string"
          ? (this.userLabel(event.payload.actor_user_id) ??
            event.payload.actor_user_id)
          : "System",
      action: event.event_type,
      module: reportModuleForEvent(event),
      target: event.aggregate_id,
      remarks:
        typeof event.payload.remarks === "string"
          ? event.payload.remarks
          : null,
    }));
    const assetRows = this.store.assetStateEvents.map((event) => ({
      id: event.id,
      at: event.created_at,
      actor_user_id: event.actor_user_id,
      actor: event.actor_user_id
        ? (this.userLabel(event.actor_user_id) ?? event.actor_user_id)
        : "System",
      action: event.event_type,
      module: "Assets",
      target: event.asset_id,
      remarks:
        typeof event.payload.remarks === "string"
          ? event.payload.remarks
          : null,
    }));
    const helpdeskRows = this.store.helpdeskEvents.map((event) => ({
      id: event.id,
      at: event.created_at,
      actor_user_id: event.actor_user_id,
      actor: event.actor_name,
      action: event.action,
      module: "Helpdesk",
      target: event.ticket_id,
      remarks: event.detail,
    }));
    const rows = [...expenseRows, ...outboxRows, ...assetRows, ...helpdeskRows]
      .filter(
        (row) =>
          !query.actor_user_id || row.actor_user_id === query.actor_user_id,
      )
      .filter(
        (row) =>
          !query.module ||
          row.module.toLowerCase().includes(query.module.toLowerCase()),
      )
      .filter(
        (row) =>
          !query.action ||
          row.action.toLowerCase().includes(query.action.toLowerCase()),
      )
      .filter(
        (row) => !query.date_from || row.at.slice(0, 10) >= query.date_from,
      )
      .filter((row) => !query.date_to || row.at.slice(0, 10) <= query.date_to)
      .sort((left, right) => right.at.localeCompare(left.at));
    return pageWithMeta(rows, query.page, query.page_size, {
      module_breakdown: groupCount(rows, (row) => row.module),
      filters: this.appliedSummaryFilters(query),
    });
  }

  async createExport(
    actor: AuthUser,
    input: {
      format: "csv" | "xlsx";
      report_type: string;
      filters: Record<string, unknown>;
    },
  ) {
    const aggregateId = randomUUID();
    const rows = this.exportRows(actor, input.report_type, input.filters);
    const columns = exportColumns(rows);
    const generated = await createGeneratedExportDocument(this.store, {
      actor,
      businessObjectType: "report_export",
      businessObjectId: aggregateId,
      reportType: input.report_type,
      format: input.format as GeneratedExportFormat,
      rows,
      columns,
      filters: input.filters,
      filePrefix: `report-${input.report_type}`,
    });
    const event = appendOutboxEvent(this.store, {
      aggregateType: "report_export",
      aggregateId,
      eventType: "reports.export.requested",
      payload: {
        actor_user_id: actor.id,
        report_type: input.report_type,
        format: input.format,
        filters: input.filters,
        status: generated.status,
        adapter: generated.adapter,
        download_document_id: generated.download_document_id,
        download_url: generated.download_url,
        file_name: generated.file_name,
        row_count: generated.row_count,
        size_bytes: generated.size_bytes,
        generated_at: generated.generated_at,
      },
      idempotencyKey: `report-export:${aggregateId}`,
    });
    return this.presentExportJob(event);
  }

  listExports(actor: AuthUser, query: ReportSummaryQuery) {
    const rows = this.reportExportEvents()
      .filter((event) => this.canSeeExport(actor, event))
      .filter(
        (event) =>
          !query.report_type || event.payload.report_type === query.report_type,
      )
      .filter(
        (event) =>
          !query.status ||
          event.payload.status === query.status ||
          event.status === query.status,
      )
      .map((event) => this.presentExportJob(event))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    return page(rows, query.page, query.page_size);
  }

  getExport(actor: AuthUser, id: UUID) {
    const event = this.reportExportEvents().find(
      (candidate) => candidate.aggregate_id === id || candidate.event_id === id,
    );
    if (!event) {
      throw notFound("Export job not found");
    }
    if (!this.canSeeExport(actor, event)) {
      throw forbidden("Export job access denied");
    }
    return this.presentExportJob(event);
  }

  private presentEmployeeReportRow(user: CoreUser) {
    const department = this.store.departments.find(
      (candidate) => candidate.id === user.department_id,
    );
    const designation = this.store.designations.find(
      (candidate) => candidate.id === user.designation_id,
    );
    const manager = user.manager_user_id
      ? this.user(user.manager_user_id)
      : null;
    const activeCredential = this.store.userCredentials.some(
      (credential) =>
        credential.user_id === user.id &&
        credential.status === "active" &&
        !credential.deleted_at,
    );
    return {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      email: user.email,
      department_id: user.department_id,
      department_code: department?.department_code ?? null,
      department_name: department?.name ?? "Unknown department",
      designation_id: user.designation_id,
      designation_code: designation?.designation_code ?? null,
      designation_title: designation?.title ?? "Unknown designation",
      manager_user_id: user.manager_user_id,
      manager_label: manager
        ? `${manager.employee_code} - ${manager.full_name}`
        : null,
      status: user.employment_status,
      joined_on: user.joined_on,
      terminated_on: user.terminated_on,
      location: null,
      roles: user.roles,
      login_enabled: activeCredential,
      last_login_at: null,
      notice_days: null,
      version: user.version,
    };
  }

  private presentLeaveWfhRow(
    kind: "leave" | "wfh",
    request: {
      id: UUID;
      request_code: string;
      employee_user_id: UUID;
      date_from: string;
      date_to: string;
      duration: number;
      status: string;
      current_approver_user_id: UUID | null;
      decision_remarks: string | null;
      decided_by_user_id: UUID | null;
      decided_at: string | null;
      cancelled_at: string | null;
      version: number;
      created_at: string;
      updated_at: string;
      leave_type?: string;
      project_ref?: string | null;
    },
  ) {
    const user = this.user(request.employee_user_id);
    return {
      id: request.id,
      request_code: request.request_code,
      kind,
      employee_user_id: request.employee_user_id,
      employee: user?.full_name ?? request.employee_user_id,
      employee_code: user?.employee_code ?? null,
      department_id: user?.department_id ?? null,
      department: user ? this.departmentName(user.department_id) : null,
      leave_type: kind === "leave" ? (request.leave_type ?? null) : null,
      project_ref: kind === "wfh" ? (request.project_ref ?? null) : null,
      from_date: request.date_from,
      to_date: request.date_to,
      duration: request.duration,
      status: request.status,
      current_approver_user_id: request.current_approver_user_id,
      decision_remarks: request.decision_remarks,
      decided_by_user_id: request.decided_by_user_id,
      decided_at: request.decided_at,
      cancelled_at: request.cancelled_at,
      version: request.version,
      created_at: request.created_at,
      updated_at: request.updated_at,
    };
  }

  private presentProjectReportRow(project: ProjectRecord) {
    const manager = this.user(project.manager_user_id);
    const department = project.department_id
      ? this.store.departments.find(
          (candidate) => candidate.id === project.department_id,
        )
      : null;
    const members = this.store.projectMembers.filter(
      (member) => member.project_id === project.id && !member.deleted_at,
    );
    return {
      id: project.id,
      code: project.project_code,
      name: project.name,
      client: project.client_name,
      project_type: project.project_type,
      billing: project.billing_type,
      manager_user_id: project.manager_user_id,
      manager: manager
        ? `${manager.employee_code} - ${manager.full_name}`
        : project.manager_user_id,
      department_id: project.department_id,
      department: department?.name ?? null,
      start_date: project.start_date,
      end_date: project.end_date,
      status: project.status,
      health: project.health,
      team: members.filter(
        (member) => member.status === ProjectMemberStatuses.Active,
      ).length,
      estimated_hours: project.estimated_hours,
      actual_hours: project.actual_hours,
      estimated_budget: project.estimated_budget,
      actual_spend: project.actual_spend,
      priority: project.priority,
      version: project.version,
    };
  }

  private presentProjectAllocationReportRow(
    project: ProjectRecord,
    member: {
      id: UUID;
      employee_user_id: UUID;
      project_role: string;
      allocation_percent: number;
      billable: boolean;
      start_date: string;
      end_date: string | null;
      status: string;
    },
  ) {
    const user = this.user(member.employee_user_id);
    const manager = this.user(project.manager_user_id);
    return {
      id: member.id,
      project_id: project.id,
      project: project.name,
      code: project.project_code,
      employee_user_id: member.employee_user_id,
      employee: user?.full_name ?? member.employee_user_id,
      role: member.project_role,
      allocation: member.allocation_percent,
      billable: member.billable,
      manager: manager?.full_name ?? project.manager_user_id,
      from: member.start_date,
      to: member.end_date,
      status: member.status,
    };
  }

  private canSeeUserReportRow(
    actor: AuthUser,
    userId: UUID,
    module: "attendance" | "leave" | "timesheet",
  ): boolean {
    const user = this.user(userId);
    if (!user) return false;
    const privileged =
      actor.roles.includes(Roles.Admin) ||
      actor.roles.includes(Roles.Auditor) ||
      actor.roles.includes(Roles.HRManager);
    if (privileged || actor.id === user.id) return true;
    if (
      module === "attendance" ||
      module === "leave" ||
      module === "timesheet"
    ) {
      return user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
    }
    return false;
  }

  private user(userId: UUID): CoreUser | null {
    return (
      this.store.users.find(
        (candidate) => candidate.id === userId && !candidate.deleted_at,
      ) ?? null
    );
  }

  private departmentName(departmentId: UUID): string {
    return (
      this.store.departments.find(
        (candidate) => candidate.id === departmentId && !candidate.deleted_at,
      )?.name ?? "Unknown department"
    );
  }

  private reportExportEvents(): OutboxEvent[] {
    return this.store.outbox.filter(
      (event) => event.event_type === "reports.export.requested",
    );
  }

  private canSeeExport(actor: AuthUser, event: OutboxEvent): boolean {
    if (
      actor.roles.includes(Roles.Admin) ||
      actor.roles.includes(Roles.Auditor)
    )
      return true;
    return event.payload.actor_user_id === actor.id;
  }

  private presentExportJob(event: OutboxEvent) {
    return {
      id: event.aggregate_id,
      export_id: event.aggregate_id,
      event_id: event.event_id,
      report_type:
        typeof event.payload.report_type === "string"
          ? event.payload.report_type
          : "unknown",
      format:
        typeof event.payload.format === "string" ? event.payload.format : "csv",
      status:
        typeof event.payload.status === "string"
          ? event.payload.status
          : event.status,
      outbox_status: event.status,
      created_by_user_id:
        typeof event.payload.actor_user_id === "string"
          ? event.payload.actor_user_id
          : null,
      created_by:
        typeof event.payload.actor_user_id === "string"
          ? this.userLabel(event.payload.actor_user_id)
          : "System",
      filters:
        typeof event.payload.filters === "object" &&
        event.payload.filters !== null
          ? event.payload.filters
          : {},
      download_document_id: stringOrNull(event.payload.download_document_id),
      download_url: stringOrNull(event.payload.download_url),
      adapter:
        typeof event.payload.adapter === "string"
          ? event.payload.adapter
          : "outbox-queued-placeholder",
      file_name: stringOrNull(event.payload.file_name),
      row_count: numberValue(event.payload.row_count),
      size_bytes: numberOrNull(event.payload.size_bytes),
      generated_at: stringOrNull(event.payload.generated_at),
      created_at: event.created_at,
      updated_at: event.published_at ?? event.failed_at ?? event.created_at,
    };
  }

  private exportRows(
    actor: AuthUser,
    reportType: string,
    filters: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const summaryQuery = this.exportSummaryQuery(filters);
    const expenseQuery = this.exportExpenseQuery(filters);
    const result = (() => {
      switch (reportType.trim().toLowerCase()) {
        case "hr":
        case "hr/employees":
          return this.hrEmployees(actor, summaryQuery);
        case "attendance":
        case "attendance/summary":
          return this.attendanceSummary(actor, summaryQuery);
        case "leave":
        case "leave-wfh":
        case "leave-wfh/summary":
          return this.leaveWfhSummary(actor, summaryQuery);
        case "projects":
        case "projects/summary":
          return this.projectsSummary(actor, summaryQuery);
        case "timesheets":
        case "timesheets/summary":
          return this.timesheetsSummary(actor, summaryQuery);
        case "assets":
        case "assets/summary":
          return this.assetsSummary(actor, summaryQuery);
        case "helpdesk":
        case "helpdesk/summary":
          return this.helpdeskSummary(actor, summaryQuery);
        case "audit":
          return this.auditReport(actor, summaryQuery);
        case "expenses/my":
          return this.myExpenses(actor, expenseQuery);
        case "expenses/manager-queue":
          return this.managerQueue(actor, expenseQuery);
        case "expenses/manager-history":
          return this.managerHistory(actor, expenseQuery);
        case "expenses/finance-dashboard":
          return this.financeDashboard(actor, expenseQuery);
        case "expenses/finance-history":
          return this.financeHistory(actor, expenseQuery);
        case "expense":
        case "expenses":
        case "expenses/register":
        default:
          return this.register(actor, expenseQuery);
      }
    })();
    return Array.isArray(result.items)
      ? result.items.map((row) => recordRow(row))
      : [];
  }

  private exportSummaryQuery(
    filters: Record<string, unknown>,
  ): ReportSummaryQuery {
    return {
      page: 1,
      page_size: exportPageSize(filters),
      department_id: textOrUndefined(filters.department_id),
      user_id: textOrUndefined(filters.user_id),
      employee_user_id: textOrUndefined(filters.employee_user_id),
      project_id: textOrUndefined(filters.project_id),
      assigned_to_user_id: textOrUndefined(filters.assigned_to_user_id),
      actor_user_id: textOrUndefined(filters.actor_user_id),
      status: textOrUndefined(filters.status),
      type: textOrUndefined(filters.type),
      request_kind:
        filters.request_kind === "leave" || filters.request_kind === "wfh"
          ? filters.request_kind
          : undefined,
      client: textOrUndefined(filters.client),
      category_id: textOrUndefined(filters.category_id),
      module: textOrUndefined(filters.module),
      action: textOrUndefined(filters.action),
      report_type: textOrUndefined(filters.report_type),
      date_from: textOrUndefined(filters.date_from),
      date_to: textOrUndefined(filters.date_to),
    };
  }

  private exportExpenseQuery(
    filters: Record<string, unknown>,
  ): ExpenseReportQuery {
    return {
      page: 1,
      page_size: exportPageSize(filters),
      status: textOrUndefined(filters.status),
      expense_type: textOrUndefined(filters.expense_type),
      expense_sub_type: textOrUndefined(filters.expense_sub_type),
      payment_type: textOrUndefined(filters.payment_type),
      department_id: textOrUndefined(filters.department_id),
      requester_user_id: textOrUndefined(filters.requester_user_id),
      manager_user_id: textOrUndefined(filters.manager_user_id),
      finance_user_id: textOrUndefined(filters.finance_user_id),
      date_from: textOrUndefined(filters.date_from),
      date_to: textOrUndefined(filters.date_to),
      document_status: exportDocumentStatus(filters.document_status),
    };
  }

  private financeScopedTickets(actor: AuthUser): ExpenseTicket[] {
    const canSeeAllFinance =
      actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor);
    return this.repository
      .tickets()
      .filter(
        (ticket) =>
          canSeeAllFinance ||
          ticket.finance_approver_id === actor.id ||
          ticket.route_snapshot.finance_approver_id === actor.id,
      );
  }

  private applyTicketFilters(
    tickets: readonly ExpenseTicket[],
    query: ExpenseReportQuery,
  ): ExpenseTicket[] {
    const filtered = tickets.filter((ticket) =>
      this.matchesTicketFilters(ticket, query),
    );
    const sort = query.sort ?? "-updated_at";
    const descending = sort.startsWith("-");
    const key = descending ? sort.slice(1) : sort;
    return [...filtered].sort((left, right) => {
      const compared = this.ticketSortValue(left, key).localeCompare(
        this.ticketSortValue(right, key),
      );
      return descending ? -compared : compared;
    });
  }

  private matchesTicketFilters(
    ticket: ExpenseTicket,
    query: ExpenseReportQuery,
  ): boolean {
    if (query.status && ticket.status !== query.status) return false;
    if (query.expense_type && ticket.expense_type !== query.expense_type)
      return false;
    if (
      query.expense_sub_type &&
      ticket.expense_sub_type !== query.expense_sub_type
    )
      return false;
    if (query.payment_type && ticket.payment_type !== query.payment_type)
      return false;
    if (query.department_id && ticket.department_id !== query.department_id)
      return false;
    if (
      query.requester_user_id &&
      ticket.requester_user_id !== query.requester_user_id
    )
      return false;
    if (
      query.manager_user_id &&
      ticket.manager_verifier_id !== query.manager_user_id &&
      ticket.manager_backup_user_id !== query.manager_user_id
    )
      return false;
    if (
      query.finance_user_id &&
      ticket.finance_approver_id !== query.finance_user_id &&
      ticket.route_snapshot.finance_approver_id !== query.finance_user_id
    )
      return false;
    if (query.date_from && ticket.created_at.slice(0, 10) < query.date_from)
      return false;
    if (query.date_to && ticket.created_at.slice(0, 10) > query.date_to)
      return false;
    if (
      query.document_status &&
      query.document_status !== "any" &&
      this.documentSummary(ticket).status !== query.document_status
    )
      return false;
    return true;
  }

  private matchesReportRow(
    ticket: { id: UUID },
    query: ExpenseReportQuery,
  ): boolean {
    const source = this.repository
      .tickets()
      .find((candidate) => candidate.id === ticket.id);
    return source ? this.matchesTicketFilters(source, query) : false;
  }

  private ticketSortValue(ticket: ExpenseTicket, key: string): string {
    switch (key) {
      case "ticket_no":
        return ticket.ticket_no;
      case "status":
        return ticket.status;
      case "estimated_amount":
        return ticket.estimated_amount.padStart(16, "0");
      case "created_at":
        return ticket.created_at;
      case "updated_at":
      default:
        return ticket.updated_at;
    }
  }

  private missingRequiredDocuments(ticket: ExpenseTicket): string[] {
    const required =
      RequiredDocumentsByExpenseSubType[ticket.expense_sub_type] ?? [];
    const verified = new Set(
      this.repository
        .documents()
        .filter(
          (document) =>
            document.ticket_id === ticket.id &&
            document.verification_status === "verified",
        )
        .map((document) => document.document_type),
    );
    return required.filter((documentType) => !verified.has(documentType));
  }

  private presentManagerApproval(approval: ExpenseApprovalRecord) {
    const ticket = this.repository
      .tickets()
      .find((candidate) => candidate.id === approval.ticket_id);
    const approver = this.store.users.find(
      (user) => user.id === approval.approver_user_id && !user.deleted_at,
    );
    return ticket
      ? {
          ticket: this.presentTicket(ticket),
          stage: approval.approval_stage,
          decision: approval.decision,
          remarks: approval.remarks,
          decided_by_user_id: approval.approver_user_id,
          decided_by_label: approver
            ? `${approver.employee_code} - ${approver.full_name}`
            : approval.approver_user_id,
          acted_at: approval.action_at,
          previous_status: approval.route_snapshot.previous_status ?? null,
          next_status: approval.route_snapshot.next_status ?? ticket.status,
          audit_metadata: {
            role_snapshot: approval.role_snapshot,
            designation_snapshot: approval.designation_snapshot,
            route_snapshot: approval.route_snapshot,
          },
        }
      : null;
  }

  private presentTicket(ticket: ExpenseTicket) {
    const requester = this.store.users.find(
      (user) => user.id === ticket.requester_user_id && !user.deleted_at,
    );
    const department = this.store.departments.find(
      (candidate) =>
        candidate.id === ticket.department_id && !candidate.deleted_at,
    );
    const manager = ticket.manager_verifier_id
      ? this.store.users.find(
          (user) => user.id === ticket.manager_verifier_id && !user.deleted_at,
        )
      : null;
    const backupManager = ticket.manager_backup_user_id
      ? this.store.users.find(
          (user) =>
            user.id === ticket.manager_backup_user_id && !user.deleted_at,
        )
      : null;
    const assignedFinanceActorId =
      (typeof ticket.route_snapshot.finance_approver_id === "string"
        ? ticket.route_snapshot.finance_approver_id
        : ticket.finance_approver_id) ?? null;
    const assignedFinanceActor = assignedFinanceActorId
      ? (this.store.users.find(
          (user) => user.id === assignedFinanceActorId && !user.deleted_at,
        ) ?? null)
      : null;
    const primaryFinanceManagerId =
      typeof ticket.route_snapshot.primary_finance_manager_user_id === "string"
        ? ticket.route_snapshot.primary_finance_manager_user_id
        : null;
    const primaryFinanceManager = primaryFinanceManagerId
      ? (this.store.users.find(
          (user) => user.id === primaryFinanceManagerId && !user.deleted_at,
        ) ?? null)
      : null;
    const governanceNotes = Array.isArray(ticket.route_snapshot.notes)
      ? ticket.route_snapshot.notes.filter(
          (note): note is string => typeof note === "string",
        )
      : [];
    const documentSummary = this.documentSummary(ticket);
    const paymentSummary = this.paymentSummary(ticket);
    const workflowSummary = this.workflowSummary(
      ticket,
      manager,
      backupManager,
      assignedFinanceActor,
    );
    return {
      ...ticket,
      requester_employee_code: requester?.employee_code ?? null,
      requester_name: requester?.full_name ?? null,
      requester_email: requester?.email ?? null,
      requester_label: requester
        ? `${requester.employee_code} - ${requester.full_name}`
        : ticket.requester_user_id,
      department_code: department?.department_code ?? null,
      department_name: department?.name ?? null,
      department: department?.name ?? ticket.department_id,
      manager_verifier_label: manager
        ? `${manager.employee_code} - ${manager.full_name}`
        : ticket.manager_verifier_id,
      manager_backup_label: backupManager
        ? `${backupManager.employee_code} - ${backupManager.full_name}`
        : ticket.manager_backup_user_id,
      assigned_finance_actor_user_id: assignedFinanceActorId,
      assigned_finance_actor_label: assignedFinanceActor
        ? `${assignedFinanceActor.employee_code} - ${assignedFinanceActor.full_name}`
        : assignedFinanceActorId,
      primary_finance_manager_user_id: primaryFinanceManagerId,
      primary_finance_manager_label: primaryFinanceManager
        ? `${primaryFinanceManager.employee_code} - ${primaryFinanceManager.full_name}`
        : primaryFinanceManagerId,
      finance_backup_applied:
        ticket.route_snapshot.finance_backup_applied === true,
      governance_warning_codes: governanceNotes.filter(
        (note) => note.startsWith("finance_") || note.startsWith("primary_"),
      ),
      document_summary: documentSummary,
      payment_summary: paymentSummary,
      workflow_summary: workflowSummary,
      amount_summary: {
        estimated_amount: ticket.estimated_amount,
        advance_amount: ticket.advance_amount,
        actual_amount: ticket.actual_amount,
        variance_amount: ticket.variance_amount,
        approved_amount: paymentSummary?.approved_amount ?? null,
        paid_amount: paymentSummary?.paid_amount ?? null,
      },
    };
  }

  private documentSummary(ticket: ExpenseTicket) {
    const required =
      RequiredDocumentsByExpenseSubType[ticket.expense_sub_type] ?? [];
    const documents = this.repository
      .documents()
      .filter((document) => document.ticket_id === ticket.id);
    const missing = this.missingRequiredDocuments(ticket);
    const pending = documents.filter(
      (document) => document.verification_status === "pending",
    ).length;
    const verified = documents.filter(
      (document) => document.verification_status === "verified",
    ).length;
    const rejected = documents.filter(
      (document) => document.verification_status === "rejected",
    ).length;
    const status =
      required.length === 0
        ? "not_required"
        : missing.length > 0
          ? "missing"
          : pending > 0
            ? "pending"
            : "complete";
    return {
      status,
      required_document_types: required,
      missing_document_types: missing,
      uploaded_document_count: documents.length,
      verified_document_count: verified,
      pending_document_count: pending,
      rejected_document_count: rejected,
      total_required_document_count: required.length,
    };
  }

  private paymentSummary(ticket: ExpenseTicket) {
    const payments = this.repository
      .payments()
      .filter((payment) => payment.ticket_id === ticket.id);
    const latest = latestPayment(payments);
    return latest
      ? {
          payment_id: latest.id,
          payment_type: latest.payment_type,
          approved_amount: latest.approved_amount,
          paid_amount: latest.paid_amount,
          payment_date: latest.payment_date,
          payment_mode: latest.payment_mode,
          reference_no: latest.reference_no,
          settlement_status: latest.settlement_status,
          settlement_amount: latest.settlement_amount,
          processed_by_user_id: latest.processed_by_user_id,
        }
      : null;
  }

  private workflowSummary(
    ticket: ExpenseTicket,
    manager: AuthUser | null | undefined,
    backupManager: AuthUser | null | undefined,
    financeActor: AuthUser | null | undefined,
  ) {
    const ageSource =
      ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at;
    const action = actionRequiredBy(ticket);
    const actor =
      action === "manager"
        ? (manager ?? backupManager)
        : action === "finance"
          ? financeActor
          : null;
    return {
      current_status: ticket.status,
      action_required_by: action,
      current_actor_user_id: actor?.id ?? null,
      current_actor_label: actor
        ? `${actor.employee_code} - ${actor.full_name}`
        : null,
      age_hours: ageHours(ageSource),
      aging_bucket: agingBucket(ageSource),
      manager_action_required:
        ticket.status === ExpenseStatuses.PendingManagerVerification,
      finance_action_required: hasStatus(ticket, [
        ExpenseStatuses.ManagerVerified,
        ExpenseStatuses.FinanceHold,
        ExpenseStatuses.ClarificationRequired,
      ]),
      document_action_required: hasStatus(ticket, [
        ExpenseStatuses.PaymentReleased,
        ExpenseStatuses.BillsSubmitted,
      ]),
      settlement_action_required:
        ticket.status === ExpenseStatuses.PendingAdjustment,
    };
  }

  private ticketSummary(tickets: readonly ExpenseTicket[]) {
    return {
      total_requests: tickets.length,
      open_requests: tickets.filter(
        (ticket) =>
          !hasStatus(ticket, [
            ExpenseStatuses.Closed,
            ExpenseStatuses.Cancelled,
          ]),
      ).length,
      closed_requests: countClosedTickets(tickets),
      total_estimated_amount: addMoney(
        tickets.map((ticket) => ticket.estimated_amount),
      ),
      total_advance_amount: addMoney(
        tickets.map((ticket) => ticket.advance_amount ?? "0.00"),
      ),
      missing_documents: tickets.filter(
        (ticket) => this.documentSummary(ticket).status === "missing",
      ).length,
    };
  }

  private expenseCards(tickets: readonly ExpenseTicket[]) {
    return [
      {
        key: "open",
        label: "Open",
        count: tickets.filter(
          (ticket) =>
            !hasStatus(ticket, [
              ExpenseStatuses.Closed,
              ExpenseStatuses.Cancelled,
            ]),
        ).length,
      },
      {
        key: "manager",
        label: "Pending Manager Verification",
        count: countStatus(tickets, ExpenseStatuses.PendingManagerVerification),
      },
      {
        key: "finance",
        label: "Finance Action",
        count: tickets.filter((ticket) =>
          hasStatus(ticket, [
            ExpenseStatuses.ManagerVerified,
            ExpenseStatuses.FinanceHold,
            ExpenseStatuses.ClarificationRequired,
          ]),
        ).length,
      },
      { key: "closed", label: "Closed", count: countClosedTickets(tickets) },
    ];
  }

  private managerCards(tickets: readonly ExpenseTicket[]) {
    return [
      {
        key: "pending",
        label: "Pending Manager Verification",
        count: tickets.length,
        amount: addMoney(tickets.map((ticket) => ticket.estimated_amount)),
      },
      {
        key: "missing_documents",
        label: "Missing Required Documents",
        count: tickets.filter(
          (ticket) => this.documentSummary(ticket).status === "missing",
        ).length,
      },
      {
        key: "overdue",
        label: "Over 72h",
        count: tickets.filter(
          (ticket) =>
            ageHours(
              ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at,
            ) > 72,
        ).length,
      },
    ];
  }

  private financeCards(tickets: readonly ExpenseTicket[]) {
    return [
      {
        key: "pending_finance_approval",
        label: "Pending Finance Approval",
        count: countStatus(tickets, ExpenseStatuses.ManagerVerified),
        amount: addMoney(
          tickets
            .filter(
              (ticket) => ticket.status === ExpenseStatuses.ManagerVerified,
            )
            .map((ticket) => ticket.estimated_amount),
        ),
      },
      {
        key: "finance_hold",
        label: "Finance Hold",
        count: countStatus(tickets, ExpenseStatuses.FinanceHold),
      },
      {
        key: "payment_released",
        label: "Payment Released",
        count: countStatus(tickets, ExpenseStatuses.PaymentReleased),
      },
      {
        key: "bills_pending",
        label: "Bills Pending",
        count: countStatus(tickets, ExpenseStatuses.PaymentReleased),
      },
      {
        key: "settlement_due",
        label: "Settlement Due",
        count: countStatus(tickets, ExpenseStatuses.PendingAdjustment),
      },
      { key: "closed", label: "Closed", count: countClosedTickets(tickets) },
    ];
  }

  private agingBuckets(tickets: readonly ExpenseTicket[]) {
    return groupCount(tickets, (ticket) =>
      agingBucket(
        ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at,
      ),
    );
  }

  private payableTotals(tickets: readonly ExpenseTicket[]) {
    const payments = this.repository
      .payments()
      .filter((payment) =>
        tickets.some((ticket) => ticket.id === payment.ticket_id),
      );
    const payable = payments
      .filter((payment) => payment.settlement_status === "payable")
      .map((payment) => payment.settlement_amount ?? "0.00");
    const recoverable = payments
      .filter((payment) => payment.settlement_status === "recoverable")
      .map((payment) => (payment.settlement_amount ?? "0.00").replace("-", ""));
    return {
      approved_amount: addMoney(
        payments.map((payment) => payment.approved_amount),
      ),
      paid_amount: addMoney(payments.map((payment) => payment.paid_amount)),
      payable_amount: addMoney(payable),
      recoverable_amount: addMoney(recoverable),
    };
  }

  private exceptionCounts(tickets: readonly ExpenseTicket[]) {
    return {
      missing_documents: tickets.filter(
        (ticket) => this.documentSummary(ticket).status === "missing",
      ).length,
      finance_hold: countStatus(tickets, ExpenseStatuses.FinanceHold),
      overdue_72h: tickets.filter(
        (ticket) =>
          ageHours(
            ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at,
          ) > 72,
      ).length,
      high_value: tickets.filter(
        (ticket) => compareMoney(ticket.estimated_amount, "100000.00") >= 0,
      ).length,
    };
  }

  private registerColumns(ticket: ExpenseTicket) {
    const payment = this.paymentSummary(ticket);
    return {
      employee: this.userLabel(ticket.requester_user_id),
      department: this.repository.departmentName(ticket.department_id),
      status: ticket.status,
      approved_amount: payment?.approved_amount ?? null,
      actual_amount: ticket.actual_amount,
      payment_reference_no:
        payment?.reference_no ?? ticket.payment_reference_no,
      document_status: this.documentSummary(ticket).status,
      settlement_delta: ticket.variance_amount,
    };
  }

  private exportFields(ticket: ExpenseTicket) {
    const presented = this.presentTicket(ticket);
    return {
      ticket_no: ticket.ticket_no,
      requester_label: presented.requester_label,
      department_name: presented.department_name,
      status: ticket.status,
      estimated_amount: ticket.estimated_amount,
      approved_amount: presented.payment_summary?.approved_amount ?? null,
      actual_amount: ticket.actual_amount,
      payment_reference_no:
        presented.payment_summary?.reference_no ?? ticket.payment_reference_no,
      document_status: presented.document_summary.status,
      settlement_delta: ticket.variance_amount,
    };
  }

  private registerTotals(tickets: readonly ExpenseTicket[]) {
    const payments = this.repository
      .payments()
      .filter((payment) =>
        tickets.some((ticket) => ticket.id === payment.ticket_id),
      );
    return {
      total_rows: tickets.length,
      estimated_amount: addMoney(
        tickets.map((ticket) => ticket.estimated_amount),
      ),
      approved_amount: addMoney(
        payments.map((payment) => payment.approved_amount),
      ),
      actual_amount: addMoney(
        tickets.map((ticket) => ticket.actual_amount ?? "0.00"),
      ),
      paid_amount: addMoney(payments.map((payment) => payment.paid_amount)),
      missing_documents: tickets.filter(
        (ticket) => this.documentSummary(ticket).status === "missing",
      ).length,
    };
  }

  private userLabel(userId: UUID): string | null {
    const user = this.store.users.find(
      (candidate) => candidate.id === userId && !candidate.deleted_at,
    );
    return user ? `${user.employee_code} - ${user.full_name}` : null;
  }

  private appliedFilterSummary(query: ExpenseReportQuery) {
    return {
      status: query.status ?? null,
      expense_type: query.expense_type ?? null,
      expense_sub_type: query.expense_sub_type ?? null,
      payment_type: query.payment_type ?? null,
      department_id: query.department_id ?? null,
      requester_user_id: query.requester_user_id ?? null,
      manager_user_id: query.manager_user_id ?? null,
      finance_user_id: query.finance_user_id ?? null,
      date_from: query.date_from ?? null,
      date_to: query.date_to ?? null,
      document_status: query.document_status ?? "any",
      sort: query.sort ?? "-updated_at",
    };
  }

  private appliedSummaryFilters(query: ReportSummaryQuery) {
    return {
      status: query.status ?? null,
      type: query.type ?? null,
      request_kind: query.request_kind ?? null,
      department_id: query.department_id ?? null,
      user_id: query.user_id ?? null,
      employee_user_id: query.employee_user_id ?? null,
      project_id: query.project_id ?? null,
      assigned_to_user_id: query.assigned_to_user_id ?? null,
      actor_user_id: query.actor_user_id ?? null,
      client: query.client ?? null,
      category_id: query.category_id ?? null,
      module: query.module ?? null,
      action: query.action ?? null,
      report_type: query.report_type ?? null,
      date_from: query.date_from ?? null,
      date_to: query.date_to ?? null,
    };
  }
}

function countStatus(
  tickets: readonly ExpenseTicket[],
  status: string,
): number {
  return tickets.filter((ticket) => ticket.status === status).length;
}

function countClosedTickets(tickets: readonly ExpenseTicket[]): number {
  return tickets.filter(
    (ticket) =>
      ticket.status === ExpenseStatuses.Closed ||
      ticket.status === ExpenseStatuses.Cancelled,
  ).length;
}

function groupCount<T>(
  items: readonly T[],
  getLabel: (item: T) => string,
): Array<{ label: string; count: number }> {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const label = getLabel(item);
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([label, count]) => ({ label, count }));
}

function groupMoney<T>(
  items: readonly T[],
  getLabel: (item: T) => string,
  getAmount: (item: T) => string,
): Array<{ label: string; amount: string }> {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const label = getLabel(item);
    grouped.set(label, [...(grouped.get(label) ?? []), getAmount(item)]);
  }
  return [...grouped.entries()].map(([label, values]) => ({
    label,
    amount: addMoney(values),
  }));
}

function groupNumber<T>(
  items: readonly T[],
  getLabel: (item: T) => string,
  getValue: (item: T) => number,
): Array<{ id: string; label: string; value: number }> {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const label = getLabel(item);
    grouped.set(label, (grouped.get(label) ?? 0) + getValue(item));
  }
  return [...grouped.entries()].map(([label, value]) => ({
    id: label,
    label,
    value,
  }));
}

function sumNumbers(values: readonly number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((sumNumbers(values) / values.length) * 10) / 10;
}

function leaveBalanceRows(
  requests: readonly { leave_type: string; status: string; duration: number }[],
) {
  const totals: Record<string, number> = {
    casual: 12,
    sick: 10,
    earned: 18,
    unpaid: 0,
  };
  return Object.entries(totals).map(([leaveType, total]) => {
    const used = sumNumbers(
      requests
        .filter(
          (request) =>
            request.leave_type === leaveType && request.status === "approved",
        )
        .map((request) => request.duration),
    );
    const pending = sumNumbers(
      requests
        .filter(
          (request) =>
            request.leave_type === leaveType &&
            request.status.includes("pending"),
        )
        .map((request) => request.duration),
    );
    return {
      id: leaveType,
      leave_type: leaveType,
      type: leaveType,
      total,
      used,
      pending,
      remaining:
        leaveType === "unpaid" ? null : Math.max(0, total - used - pending),
    };
  });
}

function utilizationRows(
  rows: readonly { employee: string; allocation: number; billable: boolean }[],
) {
  const grouped = new Map<string, { used: number; billable: number }>();
  for (const row of rows) {
    const current = grouped.get(row.employee) ?? { used: 0, billable: 0 };
    current.used += row.allocation;
    if (row.billable) current.billable += row.allocation;
    grouped.set(row.employee, current);
  }
  return [...grouped.entries()].map(([employee, value]) => ({
    id: employee,
    employee,
    used: value.used,
    billable: value.billable,
    mix: value.used > 0 ? Math.round((value.billable / value.used) * 100) : 0,
  }));
}

function categoryAllowedForReport(actor: AuthUser, category: string): boolean {
  if (actor.roles.includes(Roles.AssetManager))
    return ["IT", "Admin", "Assets"].includes(category);
  if (actor.roles.includes(Roles.HRManager)) return category === "HR";
  if (actor.roles.includes(Roles.FinanceManager)) return category === "Finance";
  return false;
}

function helpdeskAgentRows(
  rows: readonly {
    assignee: string | null;
    status: string;
    created_at: string;
    resolved_at: string | null;
  }[],
) {
  const grouped = new Map<
    string,
    { total: number; resolved: number; sumHours: number; resolvedCount: number }
  >();
  for (const row of rows) {
    if (!row.assignee) continue;
    const current = grouped.get(row.assignee) ?? {
      total: 0,
      resolved: 0,
      sumHours: 0,
      resolvedCount: 0,
    };
    current.total += 1;
    if (row.resolved_at) {
      current.resolved += 1;
      current.sumHours +=
        (Date.parse(row.resolved_at) - Date.parse(row.created_at)) / 3_600_000;
      current.resolvedCount += 1;
    }
    grouped.set(row.assignee, current);
  }
  return [...grouped.entries()].map(([agent, value]) => ({
    id: agent,
    agent,
    total: value.total,
    resolved: value.resolved,
    avgH: value.resolvedCount
      ? Math.round((value.sumHours / value.resolvedCount) * 10) / 10
      : 0,
  }));
}

function isHelpdeskBreached(
  createdAt: string,
  completedAt: string | null,
  priority: string,
): boolean {
  if (completedAt) return false;
  const hours = ageHours(createdAt);
  const limit =
    priority === "Urgent"
      ? 4
      : priority === "High"
        ? 24
        : priority === "Medium"
          ? 48
          : 72;
  return hours > limit;
}

function isClosedHelpdeskStatus(status: string): boolean {
  return (
    status === HelpdeskTicketStatuses.Resolved ||
    status === HelpdeskTicketStatuses.Closed
  );
}

function reportModuleForEvent(event: OutboxEvent): string {
  if (event.event_type.startsWith("admin.")) return "Admin";
  if (event.event_type.startsWith("core.")) return "Employees";
  if (event.event_type.startsWith("attendance.")) return "Attendance";
  if (
    event.event_type.startsWith("leave.") ||
    event.event_type.startsWith("wfh.")
  )
    return "Leave/WFH";
  if (event.event_type.startsWith("projects.")) return "Projects";
  if (event.event_type.startsWith("timesheets.")) return "Timesheets";
  if (event.event_type.startsWith("assets.")) return "Assets";
  if (event.event_type.startsWith("reports.")) return "Reports";
  return "Platform";
}

function ageHours(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000));
}

function agingBucket(iso: string): string {
  const age = ageHours(iso);
  if (age <= 24) {
    return "0-24h";
  }
  if (age <= 72) {
    return "24-72h";
  }
  return "72h-plus";
}

function latestPayment(
  payments: readonly ExpensePayment[],
): ExpensePayment | null {
  return (
    [...payments].sort(
      (left, right) =>
        Date.parse(right.created_at) - Date.parse(left.created_at),
    )[0] ?? null
  );
}

function actionRequiredBy(
  ticket: ExpenseTicket,
): "requester" | "manager" | "finance" | "none" {
  switch (ticket.status) {
    case ExpenseStatuses.PendingManagerVerification:
      return "manager";
    case ExpenseStatuses.ManagerReturned:
    case ExpenseStatuses.ClarificationRequired:
    case ExpenseStatuses.PaymentReleased:
      return "requester";
    case ExpenseStatuses.ManagerVerified:
    case ExpenseStatuses.FinanceHold:
    case ExpenseStatuses.FinanceApproved:
    case ExpenseStatuses.BillsSubmitted:
    case ExpenseStatuses.PendingAdjustment:
      return "finance";
    default:
      return "none";
  }
}

function hasStatus(
  ticket: ExpenseTicket,
  statuses: readonly string[],
): boolean {
  return statuses.includes(ticket.status);
}

function recordRow(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function exportColumns(rows: readonly Record<string, unknown>[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return [...columns];
}

function exportPageSize(filters: Record<string, unknown>): number {
  const raw =
    typeof filters.page_size === "number"
      ? filters.page_size
      : Number(filters.page_size);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 5000;
  }
  return Math.min(Math.trunc(raw), 10000);
}

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function exportDocumentStatus(
  value: unknown,
): ExpenseReportQuery["document_status"] {
  return value === "complete" ||
    value === "missing" ||
    value === "pending" ||
    value === "not_required"
    ? value
    : "any";
}
