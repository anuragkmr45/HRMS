import { randomUUID } from "node:crypto";
import { roleSnapshot } from "#auth";
import type {
  AuthUser,
  ExpenseAuditLog,
  ExpenseCreateInput,
  ExpenseDecision,
  ExpenseLineItem,
  ExpenseStatus,
  ExpenseTicket,
  ManagerBackupAssignment,
  PaginatedResult,
  UUID
} from "#shared";
import {
  addMoney,
  compareMoney,
  EmploymentStatuses,
  ExpenseDecisions,
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  PaymentTypes,
  ProjectExpenseSubTypes,
  RequiredDocumentsByExpenseSubType,
  RetryableMutationScopes,
  Roles,
  SalesExpenseSubTypes,
  subtractMoney,
  WorkflowActions
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { getRequiredDocuments, nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, missingRemarks } from "../../platform/errors.js";
import { CoreService } from "../core/service.js";
import { appendOutboxEvent } from "./events.js";
import { assertFinanceActor, assertManagerActor, canReadTicket } from "./policy.js";
import { ExpenseRepository } from "./repository.js";
import { assertTransition, financeDecisionToStatus, isTerminalExpenseStatus, managerDecisionToStatus } from "./state-machine.js";

function paginate<T>(items: readonly T[], page: number, pageSize: number): PaginatedResult<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    page_size: pageSize,
    total: items.length
  };
}

export interface RouteResolution {
  nextStatus: ExpenseStatus;
  managerVerifierId: UUID | null;
  managerBackupUserId: UUID | null;
  financeApproverId: UUID | null;
  routeSnapshot: Record<string, unknown>;
}

interface ManagerRoutingResolution {
  assignedManagerId: UUID | null;
  backupManagerId: UUID | null;
  backupApplied: boolean;
  notes: string[];
}

interface FinanceRoutingResolution {
  assignedFinanceActorId: UUID | null;
  primaryFinanceManagerId: UUID | null;
  backupFinanceActorId: UUID | null;
  backupApplied: boolean;
  notes: string[];
}

function isManagerRole(user: { roles?: readonly string[] } | null): boolean {
  return Boolean(user?.roles?.includes(Roles.Reviewer));
}

export interface FinanceQueueFilters {
  page: number;
  page_size: number;
  status?: ExpenseStatus;
  requester?: string;
  department?: string;
  date_from?: string;
  date_to?: string;
  payment_type?: string;
  expense_type?: string;
  expense_sub_type?: string;
  amount_min?: string;
  amount_max?: string;
  document_status: "any" | "complete" | "missing";
  sla_bucket: "any" | "0-24h" | "24-72h" | "72h-plus";
  sort: "sla" | "created_at" | "amount" | "status";
}

export interface ExpenseTimelineEvent {
  event_type: string;
  label: string;
  stage: string;
  actor_user_id: UUID;
  actor_name: string;
  timestamp: string;
  remarks: string | null;
  status_from: string | null;
  status_to: string | null;
}

export interface ExpenseDashboardQuery {
  date_from?: string;
  date_to?: string;
  status?: ExpenseStatus;
}

export interface ExpenseClarificationInput {
  message: string;
  document_ids?: UUID[];
  expected_version?: number;
}

export class ExpenseService {
  private readonly repository: ExpenseRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new ExpenseRepository(store);
    this.core = new CoreService(store);
  }

  createTicket(actor: AuthUser, input: ExpenseCreateInput): ExpenseTicket {
    this.validateCreateInput(input);
    const requester = this.core.getUser(actor.id);
    const route = input.submit ? this.resolveRoute(actor.id, input.expense_type, input.expense_sub_type, input.payment_type) : null;
    const created = nowIso();
    const ticketId = randomUUID();
    const ticket: ExpenseTicket = {
      id: ticketId,
      ticket_no: this.repository.nextTicketNo(),
      requester_user_id: actor.id,
      requester_role_snapshot: roleSnapshot(actor),
      department_id: requester.department_id,
      expense_type: input.expense_type,
      expense_sub_type: input.expense_sub_type,
      project_code: input.project_code ?? null,
      client_name: input.client_name ?? null,
      task_title: input.task_title,
      task_description: input.task_description,
      location: input.location ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      estimated_amount: input.estimated_amount,
      payment_type: input.payment_type,
      advance_amount: input.advance_amount ?? null,
      advance_justification: input.advance_justification ?? null,
      manager_verifier_id: route?.managerVerifierId ?? null,
      manager_backup_user_id: route?.managerBackupUserId ?? null,
      finance_approver_id: route?.financeApproverId ?? null,
      status: route?.nextStatus ?? ExpenseStatuses.Draft,
      actual_amount: null,
      variance_amount: null,
      payment_reference_no: null,
      closure_remarks: null,
      context_payload: {},
      route_snapshot: route?.routeSnapshot ?? { reason: "draft_not_routed" },
      policy_snapshot: {
        required_documents: RequiredDocumentsByExpenseSubType[input.expense_sub_type]
      },
      version: 1,
      created_at: created,
      updated_at: created,
      submitted_at: input.submit ? created : null,
      closed_at: null,
      deleted_at: null
    };
    const items: ExpenseLineItem[] = input.line_items.map((item) => ({
      id: randomUUID(),
      ticket_id: ticketId,
      line_category: item.line_category,
      description: item.description,
      quantity: item.quantity ?? null,
      unit_cost: item.unit_cost ?? null,
      line_total: item.line_total,
      tax_amount: item.tax_amount ?? null,
      vendor_name: item.vendor_name ?? null
    }));
    this.repository.insertTicket(ticket, items);
    const audit = this.repository.addAudit({
      ticket_id: ticket.id,
      actor_user_id: actor.id,
      event_type: input.submit ? "expense.submitted" : "expense.created",
      old_value: null,
      new_value: { status: ticket.status, ticket_no: ticket.ticket_no },
      remarks: null,
      payload_hash: null
    });
    appendOutboxEvent(this.store, {
      aggregateType: "expense_ticket",
      aggregateId: ticket.id,
      eventType: input.submit ? "expense.submitted" : "expense.created",
      payload: { ticket_id: ticket.id, status: ticket.status, requester_user_id: actor.id },
      idempotencyKey: `${input.submit ? "submit" : "create"}:${ticket.id}:${audit.id}`
    });
    this.addNotification(actor.id, route?.managerVerifierId ?? null, "expense.submitted", { ticket_id: ticket.id });
    return ticket;
  }

  submitTicket(actor: AuthUser, ticketId: UUID, expectedVersion: number): ExpenseTicket {
    const current = this.repository.findTicket(ticketId);
    if (current.requester_user_id !== actor.id) {
      throw forbidden("Only the requester can submit this ticket");
    }
    const resubmittableStatuses: readonly string[] = [
      ExpenseStatuses.Draft,
      ExpenseStatuses.ManagerReturned
    ];
    if (!resubmittableStatuses.includes(current.status)) {
      throw badRequest("Only draft or manager-returned tickets can be submitted");
    }
    const route = this.resolveRoute(current.requester_user_id, current.expense_type, current.expense_sub_type, current.payment_type);
    assertTransition(current.status, ExpenseStatuses.Submitted);
    const ticket = this.repository.updateTicketVersioned(ticketId, expectedVersion, (candidate) => {
      candidate.status = route.nextStatus;
      candidate.manager_verifier_id = route.managerVerifierId;
      candidate.manager_backup_user_id = route.managerBackupUserId;
      candidate.finance_approver_id = route.financeApproverId;
      candidate.route_snapshot = route.routeSnapshot;
      candidate.submitted_at = nowIso();
    });
    this.writeMutation(actor, ticket, "expense.submitted", current.status, ticket.status, null);
    return ticket;
  }

  private validateCreateInput(input: ExpenseCreateInput): void {
    if (input.end_date < input.start_date) {
      throw badRequest("End date cannot be before start date");
    }
    if (input.expense_type === ExpenseTypes.Project && !(ProjectExpenseSubTypes as readonly string[]).includes(input.expense_sub_type)) {
      throw badRequest("Invalid Project expense sub-type");
    }
    if (input.expense_type === ExpenseTypes.SalesPreSales && !(SalesExpenseSubTypes as readonly string[]).includes(input.expense_sub_type)) {
      throw badRequest("Invalid Sales/Pre-Sales expense sub-type");
    }
    if (input.expense_type === ExpenseTypes.Project && !input.project_code) {
      throw badRequest("Project expenses require project_code");
    }
    if (input.expense_type === ExpenseTypes.SalesPreSales && !input.client_name) {
      throw badRequest("Sales/Pre-Sales expenses require client_name");
    }
    const lineTotal = addMoney(input.line_items.map((item) => item.line_total));
    if (compareMoney(lineTotal, input.estimated_amount) !== 0) {
      throw badRequest("Estimated amount must match line item total", {
        line_total: lineTotal,
        estimated_amount: input.estimated_amount
      });
    }
    if (input.payment_type === PaymentTypes.Advance) {
      if (!input.advance_amount) {
        throw badRequest("Advance amount is required for Advance payment type");
      }
      if (compareMoney(input.advance_amount, input.estimated_amount) > 0 && !input.advance_justification) {
        throw badRequest("Advance cannot exceed estimated amount unless exception remarks exist");
      }
    }
  }

  resolveRoute(requesterUserId: UUID, expenseType: string, expenseSubType: string, paymentType: string): RouteResolution {
    const requester = this.core.getUser(requesterUserId);
    if (requester.employment_status !== EmploymentStatuses.Active || requester.deleted_at) {
      throw badRequest("Inactive or soft-deleted users cannot submit expense tickets");
    }
    const managerResolution = this.resolveManagerActor(requesterUserId);
    const financeResolution = this.resolveFinanceActor(requesterUserId);
    const notes = [...managerResolution.notes, ...financeResolution.notes];
    if (!managerResolution.assignedManagerId) {
      throw badRequest("Expense cannot be submitted until an independent Manager approver is configured.", {
        requester_user_id: requesterUserId,
        notes,
        required_setup: "Assign an active non-requester Manager or Manager backup before submission."
      });
    }
    if (!financeResolution.assignedFinanceActorId) {
      throw badRequest("Expense cannot be submitted until an independent Finance Manager approver is configured.", {
        requester_user_id: requesterUserId,
        notes,
        required_setup: "Configure an active non-requester Finance Manager or Finance Manager backup before submission."
      });
    }
    return {
      nextStatus: ExpenseStatuses.PendingManagerVerification,
      managerVerifierId: managerResolution.assignedManagerId,
      managerBackupUserId: managerResolution.backupManagerId,
      financeApproverId: financeResolution.assignedFinanceActorId,
      routeSnapshot: {
        requester_user_id: requesterUserId,
        expense_type: expenseType,
        expense_sub_type: expenseSubType,
        payment_type: paymentType,
        manager_verifier_id: managerResolution.assignedManagerId,
        manager_backup_user_id: managerResolution.backupManagerId,
        manager_backup_applied: managerResolution.backupApplied,
        finance_approver_id: financeResolution.assignedFinanceActorId,
        primary_finance_manager_user_id: financeResolution.primaryFinanceManagerId,
        finance_approval_backup_user_id: financeResolution.backupFinanceActorId,
        finance_backup_applied: financeResolution.backupApplied,
        hierarchy_version: requester.version,
        notes,
        routed_at: nowIso()
      }
    };
  }

  private resolveManagerActor(requesterUserId: UUID): ManagerRoutingResolution {
    const notes: string[] = [];
    const requester = this.core.getUser(requesterUserId);
    const directManager = requester.manager_user_id
      ? this.store.users.find((user) => user.id === requester.manager_user_id && !user.deleted_at) ?? null
      : null;
    if (
      directManager &&
      directManager.employment_status === EmploymentStatuses.Active &&
      directManager.id !== requesterUserId &&
      isManagerRole(directManager)
    ) {
      notes.push("direct_manager_assigned");
      return {
        assignedManagerId: directManager.id,
        backupManagerId: null,
        backupApplied: false,
        notes
      };
    }
    if (!directManager) {
      notes.push("direct_manager_missing");
    } else if (directManager.id === requesterUserId) {
      notes.push("direct_manager_self_reference");
    } else if (!isManagerRole(directManager)) {
      notes.push("direct_manager_missing_manager_role");
    } else {
      notes.push("direct_manager_inactive_or_deleted");
    }
    const today = new Date().toISOString().slice(0, 10);
    const backupAssignment = this.repository.activeManagerBackupAssignment(requesterUserId, today);
    const backupId = backupAssignment?.backup_manager_user_id ?? this.store.financeGovernanceConfig?.manager_backup_user_id ?? null;
    if (!backupId) {
      return { assignedManagerId: null, backupManagerId: null, backupApplied: false, notes: [...notes, "manager_backup_missing"] };
    }
    if (backupId === requesterUserId) {
      return { assignedManagerId: null, backupManagerId: backupId, backupApplied: false, notes: [...notes, "manager_backup_self_reference"] };
    }
    const backup = this.store.users.find((user) => user.id === backupId && !user.deleted_at) ?? null;
    if (!backup || backup.employment_status !== EmploymentStatuses.Active || !isManagerRole(backup)) {
      return { assignedManagerId: null, backupManagerId: backupId, backupApplied: false, notes: [...notes, "manager_backup_invalid"] };
    }
    return { assignedManagerId: backup.id, backupManagerId: backup.id, backupApplied: true, notes: [...notes, "manager_backup_applied"] };
  }

  private resolveFinanceActor(requesterUserId: UUID): FinanceRoutingResolution {
    const today = new Date().toISOString().slice(0, 10);
    const config = this.store.financeGovernanceConfig;
    if (!config || config.deleted_at || config.status !== "active") {
      return {
        assignedFinanceActorId: null,
        primaryFinanceManagerId: config?.primary_finance_manager_user_id ?? null,
        backupFinanceActorId: config?.finance_approval_backup_user_id ?? null,
        backupApplied: false,
        notes: ["finance_governance_missing_or_inactive"]
      };
    }
    if (config.effective_from > today || (config.effective_to && config.effective_to < today)) {
      return {
        assignedFinanceActorId: null,
        primaryFinanceManagerId: config.primary_finance_manager_user_id,
        backupFinanceActorId: config.finance_approval_backup_user_id,
        backupApplied: false,
        notes: ["finance_governance_outside_effective_window"]
      };
    }
    const primary = this.store.users.find((user) => user.id === config.primary_finance_manager_user_id && !user.deleted_at) ?? null;
    if (!primary || primary.employment_status !== EmploymentStatuses.Active || !primary.roles.includes(Roles.FinanceManager)) {
      return {
        assignedFinanceActorId: null,
        primaryFinanceManagerId: config.primary_finance_manager_user_id,
        backupFinanceActorId: config.finance_approval_backup_user_id,
        backupApplied: false,
        notes: ["primary_finance_manager_invalid"]
      };
    }
    if (primary.id !== requesterUserId) {
      return {
        assignedFinanceActorId: primary.id,
        primaryFinanceManagerId: primary.id,
        backupFinanceActorId: config.finance_approval_backup_user_id,
        backupApplied: false,
        notes: ["primary_finance_manager_assigned"]
      };
    }
    const backupId = config.finance_approval_backup_user_id;
    if (!backupId) {
      return {
        assignedFinanceActorId: null,
        primaryFinanceManagerId: primary.id,
        backupFinanceActorId: null,
        backupApplied: false,
        notes: ["finance_approval_backup_missing"]
      };
    }
    if (backupId === requesterUserId) {
      return {
        assignedFinanceActorId: null,
        primaryFinanceManagerId: primary.id,
        backupFinanceActorId: backupId,
        backupApplied: false,
        notes: ["finance_approval_backup_self_reference"]
      };
    }
    const backup = this.store.users.find((user) => user.id === backupId && !user.deleted_at) ?? null;
    if (
      !backup ||
      backup.employment_status !== EmploymentStatuses.Active ||
      !backup.roles.includes(Roles.FinanceManager)
    ) {
      return {
        assignedFinanceActorId: null,
        primaryFinanceManagerId: primary.id,
        backupFinanceActorId: backupId,
        backupApplied: false,
        notes: ["finance_approval_backup_invalid"]
      };
    }
    return {
      assignedFinanceActorId: backup.id,
      primaryFinanceManagerId: primary.id,
      backupFinanceActorId: backup.id,
      backupApplied: true,
      notes: ["finance_approval_backup_applied"]
    };
  }

  listMyTickets(actor: AuthUser, page: number, pageSize: number): PaginatedResult<Record<string, unknown>> {
    return this.presentPaginatedTickets(this.repository.listByRequester(actor.id), page, pageSize);
  }

  metadata(actor: AuthUser): Record<string, unknown> {
    const activeProjects = this.store.projects
      .filter((project) => !project.deleted_at && project.status !== "archived" && project.status !== "cancelled")
      .map((project) => ({
        id: project.id,
        code: project.project_code,
        name: project.name,
        client: project.client_name,
        status: project.status,
        manager_user_id: project.manager_user_id,
        manager_name: this.store.users.find((user) => user.id === project.manager_user_id)?.full_name ?? null
      }));
    const activeClients = Array.from(new Set(activeProjects.map((project) => project.client).filter(Boolean))).sort();
    return {
      generated_at: nowIso(),
      actor_scope: {
        user_id: actor.id,
        roles: actor.roles
      },
      expense_types: [
        { value: ExpenseTypes.Project, label: "Project" },
        { value: ExpenseTypes.SalesPreSales, label: "Sales / Pre-Sales" }
      ],
      expense_sub_types: [
        ...ProjectExpenseSubTypes.map((value) => ({ value, label: value, expense_type: ExpenseTypes.Project })),
        ...SalesExpenseSubTypes.map((value) => ({ value, label: value, expense_type: ExpenseTypes.SalesPreSales }))
      ],
      project_expense_types: [
        { value: "travel", label: "Travel", expense_sub_type: ExpenseSubTypes.ProjectTravel },
        { value: "material", label: "Material", expense_sub_type: ExpenseSubTypes.MaterialConsumables },
        { value: "lodging", label: "Lodging & Boarding", expense_sub_type: ExpenseSubTypes.LodgingBoarding },
        { value: "misc", label: "Miscellaneous", expense_sub_type: ExpenseSubTypes.ProjectTravel }
      ],
      payment_types: [
        { value: PaymentTypes.ReimbursementAccrued, label: "Reimbursement" },
        { value: PaymentTypes.Advance, label: "Advance" }
      ],
      currencies: [{ code: "INR", symbol: "₹", default: true }],
      document_types: Object.entries(RequiredDocumentsByExpenseSubType).map(([expense_sub_type, required_documents]) => ({
        expense_sub_type,
        required_documents
      })),
      policy_hints: {
        default_currency: "INR",
        high_value_threshold: "100000.00",
        advance_requires_justification_when_over_estimate: true,
        remarks_required_for_withdraw_after_submission: true,
        self_approval_blocked: true
      },
      selectors: {
        projects: activeProjects,
        clients: activeClients
      }
    };
  }

  dashboardSummary(actor: AuthUser, query: ExpenseDashboardQuery): Record<string, unknown> {
    const visible = this.visibleTickets(actor)
      .filter((ticket) => !query.status || ticket.status === query.status)
      .filter((ticket) => !query.date_from || ticket.created_at.slice(0, 10) >= query.date_from)
      .filter((ticket) => !query.date_to || ticket.created_at.slice(0, 10) <= query.date_to)
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
    const mine = visible.filter((ticket) => ticket.requester_user_id === actor.id);
    const managerQueue = visible.filter((ticket) => ticket.manager_verifier_id === actor.id && ticket.status === ExpenseStatuses.PendingManagerVerification);
    const financeStatuses: readonly ExpenseStatus[] = [
      ExpenseStatuses.ManagerVerified,
      ExpenseStatuses.FinanceHold,
      ExpenseStatuses.ClarificationRequired,
      ExpenseStatuses.FinanceApproved,
      ExpenseStatuses.PaymentReleased,
      ExpenseStatuses.BillsSubmitted,
      ExpenseStatuses.PendingAdjustment
    ];
    const pendingApprovalStatuses: readonly ExpenseStatus[] = [ExpenseStatuses.PendingManagerVerification, ExpenseStatuses.ManagerVerified];
    const approvedStatuses: readonly ExpenseStatus[] = [
      ExpenseStatuses.FinanceApproved,
      ExpenseStatuses.PaymentReleased,
      ExpenseStatuses.BillsSubmitted,
      ExpenseStatuses.PendingAdjustment,
      ExpenseStatuses.Closed
    ];
    const returnedOrRejectedStatuses: readonly ExpenseStatus[] = [ExpenseStatuses.ManagerReturned, ExpenseStatuses.ManagerRejected];
    const settlementStatuses: readonly ExpenseStatus[] = [
      ExpenseStatuses.PaymentReleased,
      ExpenseStatuses.BillsSubmitted,
      ExpenseStatuses.PendingAdjustment
    ];
    const financeQueue = visible.filter((ticket) => ticket.finance_approver_id === actor.id && financeStatuses.includes(ticket.status));
    const totals = {
      submitted: mine.filter((ticket) => ticket.status !== ExpenseStatuses.Draft).length,
      pending_approval: mine.filter((ticket) => pendingApprovalStatuses.includes(ticket.status)).length,
      approved: mine.filter((ticket) => approvedStatuses.includes(ticket.status)).length,
      returned_or_rejected: mine.filter((ticket) => returnedOrRejectedStatuses.includes(ticket.status)).length,
      finance_pending: financeQueue.filter((ticket) => ticket.status === ExpenseStatuses.ManagerVerified).length,
      payment_pending: financeQueue.filter((ticket) => ticket.status === ExpenseStatuses.FinanceApproved).length,
      settlement_pending: visible.filter((ticket) => settlementStatuses.includes(ticket.status)).length
    };
    return {
      generated_at: nowIso(),
      scope: {
        actor_user_id: actor.id,
        roles: actor.roles
      },
      cards: [
        { key: "submitted", label: "Submitted", value: totals.submitted, tone: "primary" },
        { key: "pending_approval", label: "Pending approval", value: totals.pending_approval, tone: "warning" },
        { key: "finance_pending", label: "Finance pending", value: totals.finance_pending, tone: "info" },
        { key: "payment_pending", label: "Payment pending", value: totals.payment_pending, amount: this.sumTickets(financeQueue.filter((ticket) => ticket.status === ExpenseStatuses.FinanceApproved)), tone: "success" },
        { key: "settlement_pending", label: "Settlement pending", value: totals.settlement_pending, tone: "warning" },
        { key: "returned_or_rejected", label: "Returned / Rejected", value: totals.returned_or_rejected, tone: "destructive" }
      ],
      queue_counts: {
        my_tickets: mine.length,
        manager_pending: managerQueue.length,
        finance_pending: financeQueue.length,
        total_visible: visible.length
      },
      aging: this.agingBuckets(visible),
      totals: {
        ...totals,
        visible_amount: this.sumTickets(visible),
        mine_amount: this.sumTickets(mine),
        finance_queue_amount: this.sumTickets(financeQueue)
      },
      rows: visible.slice(0, 10).map((ticket) => this.presentTicket(ticket))
    };
  }

  getTicket(actor: AuthUser, ticketId: UUID): Record<string, unknown> {
    const ticket = this.repository.findTicket(ticketId);
    if (!canReadTicket(actor, ticket)) {
      throw forbidden("You do not have access to this ticket");
    }
    return this.presentTicket(ticket);
  }

  withdrawTicket(actor: AuthUser, ticketId: UUID, expectedVersion: number, remarks?: string): Record<string, unknown> {
    const current = this.repository.findTicket(ticketId);
    if (current.requester_user_id !== actor.id) {
      throw forbidden("Only the requester can withdraw this ticket");
    }
    const allowedStatuses: readonly ExpenseStatus[] = [
      ExpenseStatuses.Draft,
      ExpenseStatuses.Submitted,
      ExpenseStatuses.PendingManagerVerification,
      ExpenseStatuses.ManagerReturned
    ];
    if (!allowedStatuses.includes(current.status)) {
      throw badRequest("Only draft, submitted, pending-manager, or manager-returned tickets can be withdrawn", {
        current_status: current.status
      });
    }
    if (current.status !== ExpenseStatuses.Draft && !remarks?.trim()) {
      throw badRequest("Remarks are required to withdraw a submitted expense ticket");
    }
    assertTransition(current.status, ExpenseStatuses.Cancelled);
    const ticket = this.repository.updateTicketVersioned(ticketId, expectedVersion, (candidate) => {
      candidate.status = ExpenseStatuses.Cancelled;
      candidate.closed_at = nowIso();
      candidate.closure_remarks = remarks?.trim() ?? null;
    });
    const timelineEvent = this.writeMutation(actor, ticket, "expense.withdrawn", current.status, ticket.status, remarks?.trim() ?? null);
    this.addNotification(actor.id, ticket.manager_verifier_id ?? ticket.finance_approver_id, "expense.withdrawn", { ticket_id: ticket.id });
    return {
      expense: this.presentTicket(ticket),
      version: ticket.version,
      timeline_event: this.toTimelineEvent(timelineEvent)
    };
  }

  addClarification(actor: AuthUser, ticketId: UUID, input: ExpenseClarificationInput): Record<string, unknown> {
    const ticket = this.repository.findTicket(ticketId);
    if (!canReadTicket(actor, ticket)) {
      throw forbidden("You do not have access to this ticket clarification thread");
    }
    if (isTerminalExpenseStatus(ticket.status)) {
      throw badRequest("Closed, cancelled, or rejected tickets are read-only", { current_status: ticket.status });
    }
    if (input.expected_version !== undefined && ticket.version !== input.expected_version) {
      throw conflict("The ticket was modified by another actor. Refresh and retry.", {
        expected_version: input.expected_version,
        current_version: ticket.version
      });
    }
    ticket.version += 1;
    ticket.updated_at = nowIso();
    const clarification = this.repository.addAudit({
      ticket_id: ticket.id,
      actor_user_id: actor.id,
      event_type: "expense.clarification.added",
      old_value: { status: ticket.status },
      new_value: {
        status: ticket.status,
        version: ticket.version,
        message: input.message.trim(),
        document_ids: input.document_ids ?? []
      },
      remarks: input.message.trim(),
      payload_hash: null
    });
    appendOutboxEvent(this.store, {
      aggregateType: "expense_ticket",
      aggregateId: ticket.id,
      eventType: "expense.clarification.added",
      payload: { ticket_id: ticket.id, actor_user_id: actor.id, document_ids: input.document_ids ?? [] },
      idempotencyKey: `expense.clarification:${ticket.id}:${ticket.version}:${clarification.id}`
    });
    const target = actor.id === ticket.requester_user_id ? ticket.manager_verifier_id ?? ticket.finance_approver_id : ticket.requester_user_id;
    this.addNotification(actor.id, target, "expense.clarification_added", { ticket_id: ticket.id });
    return {
      clarification: this.toClarificationThreadItem(clarification),
      thread: this.clarificationThread(ticket.id),
      expense_version: ticket.version
    };
  }

  managerQueue(actor: AuthUser, page: number, pageSize: number): PaginatedResult<Record<string, unknown>> {
    const isAdmin = actor.roles.includes(Roles.Admin);
    const items = isAdmin
      ? this.store.tickets.filter((ticket) => ticket.status === ExpenseStatuses.PendingManagerVerification && !ticket.deleted_at)
      : this.repository.managerQueue(actor.id);
    return this.presentPaginatedTickets(items, page, pageSize);
  }

  financeQueue(actor: AuthUser, filters: FinanceQueueFilters): PaginatedResult<Record<string, unknown>> {
    const canSeeAllFinance = actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor);
    const isConfiguredPrimaryFinanceManager =
      actor.roles.includes(Roles.FinanceManager) &&
      this.store.financeGovernanceConfig?.primary_finance_manager_user_id === actor.id &&
      this.store.financeGovernanceConfig?.status === "active";
    const queueStatuses: readonly ExpenseStatus[] = [
      ExpenseStatuses.ManagerVerified,
      ExpenseStatuses.FinanceHold,
      ExpenseStatuses.ClarificationRequired,
      ExpenseStatuses.FinanceApproved,
      ExpenseStatuses.PaymentReleased,
      ExpenseStatuses.BillsSubmitted,
      ExpenseStatuses.PendingAdjustment
    ];
    const hasAssignedFinanceWork = this.store.tickets.some(
      (ticket) => ticket.finance_approver_id === actor.id && !ticket.deleted_at && queueStatuses.includes(ticket.status)
    );
    if (!canSeeAllFinance && !isConfiguredPrimaryFinanceManager && !hasAssignedFinanceWork) {
      throw forbidden("Only the assigned finance actor, Finance Manager, Auditor, or Admin can read the finance queue");
    }
    const statusScope = filters.status ? [filters.status] : queueStatuses;
    const requesterFilter = filters.requester?.toLowerCase();
    const departmentFilter = filters.department?.toLowerCase();

    const filtered = this.store.tickets
      .filter((ticket) => !ticket.deleted_at)
      .filter((ticket) => canSeeAllFinance || ticket.finance_approver_id === actor.id)
      .filter((ticket) => statusScope.includes(ticket.status))
      .filter((ticket) => !filters.payment_type || ticket.payment_type === filters.payment_type)
      .filter((ticket) => !filters.expense_type || ticket.expense_type === filters.expense_type)
      .filter((ticket) => !filters.expense_sub_type || ticket.expense_sub_type === filters.expense_sub_type)
      .filter((ticket) => !filters.date_from || ticket.created_at.slice(0, 10) >= filters.date_from)
      .filter((ticket) => !filters.date_to || ticket.created_at.slice(0, 10) <= filters.date_to)
      .filter((ticket) => !filters.amount_min || compareMoney(ticket.estimated_amount, filters.amount_min) >= 0)
      .filter((ticket) => !filters.amount_max || compareMoney(ticket.estimated_amount, filters.amount_max) <= 0)
      .filter((ticket) => {
        if (!requesterFilter) {
          return true;
        }
        const requester = this.store.users.find((user) => user.id === ticket.requester_user_id);
        return `${requester?.employee_code ?? ""} ${requester?.full_name ?? ""}`.toLowerCase().includes(requesterFilter);
      })
      .filter((ticket) => {
        if (!departmentFilter) {
          return true;
        }
        const department = this.store.departments.find((candidate) => candidate.id === ticket.department_id);
        return `${department?.department_code ?? ""} ${department?.name ?? ""}`.toLowerCase().includes(departmentFilter);
      })
      .filter((ticket) => {
        if (filters.document_status === "any") {
          return true;
        }
        const missing = this.missingRequiredDocuments(ticket);
        return filters.document_status === "missing" ? missing.length > 0 : missing.length === 0;
      })
      .filter((ticket) => {
        if (filters.sla_bucket === "any") {
          return true;
        }
        const age = this.ageHours(ticket);
        if (filters.sla_bucket === "0-24h") {
          return age <= 24;
        }
        if (filters.sla_bucket === "24-72h") {
          return age > 24 && age <= 72;
        }
        return age > 72;
      })
      .sort((left, right) => this.compareFinanceQueueTickets(left, right, filters.sort));

    return this.presentPaginatedTickets(filtered, filters.page, filters.page_size);
  }

  financeDetail(actor: AuthUser, ticketId: UUID): Record<string, unknown> {
    const ticket = this.repository.findTicket(ticketId);
    const canSeeAllFinance = actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor);
    const isAssignedFinanceActor = ticket.finance_approver_id === actor.id;
    if (!canSeeAllFinance && !isAssignedFinanceActor) {
      throw forbidden("You do not have access to this finance ticket detail");
    }
    const missingDocuments = this.missingRequiredDocuments(ticket);
    const payments = this.store.payments.filter((payment) => payment.ticket_id === ticket.id);
    const highValue = compareMoney(ticket.estimated_amount, "100000.00") >= 0;
    return {
      ticket: this.presentTicket(ticket),
      line_items: this.repository.ticketLineItems(ticket.id),
      documents: this.store.expenseDocuments.filter((document) => document.ticket_id === ticket.id),
      payments,
      approvals: this.store.expenseApprovals
        .filter((approval) => approval.ticket_id === ticket.id)
        .map((approval) => {
          const actorUser = this.store.users.find((user) => user.id === approval.approver_user_id && !user.deleted_at);
          return {
            stage: approval.approval_stage,
            actor_user_id: approval.approver_user_id,
            actor: actorUser ? `${actorUser.employee_code} - ${actorUser.full_name}` : approval.approver_user_id,
            decision: approval.decision,
            at: approval.action_at,
            remarks: approval.remarks,
            role_snapshot: approval.role_snapshot,
            designation_snapshot: approval.designation_snapshot
          };
        }),
      audit: this.store.auditLogs
        .filter((log) => log.ticket_id === ticket.id)
        .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
        .map((log) => this.toTimelineEvent(log)),
      missing_required_documents: missingDocuments,
      policy_warnings: [
        ...(missingDocuments.length > 0 ? [{ code: "required_documents_missing", severity: "must", documents: missingDocuments }] : []),
        ...(highValue ? [{ code: "high_value_ticket", severity: "review", threshold: "100000.00" }] : []),
        ...(ticket.requester_user_id === actor.id ? [{ code: "self_processing_blocked", severity: "must" }] : [])
      ],
      settlement: {
        actual_amount: ticket.actual_amount,
        variance_amount: ticket.variance_amount,
        payment_reference_no: ticket.payment_reference_no,
        settlement_status: payments[0]?.settlement_status ?? null,
        closed_at: ticket.closed_at
      }
    };
  }

  managerVerify(actor: AuthUser, ticketId: UUID, decision: ExpenseDecision, remarks: string | undefined, expectedVersion: number): ExpenseTicket {
    const current = this.repository.findTicket(ticketId);
    assertManagerActor(actor, current);
    this.requireRemarksForDecision(decision, remarks);
    const nextStatus = managerDecisionToStatus(decision);
    assertTransition(current.status, nextStatus);
    const ticket = this.repository.updateTicketVersioned(ticketId, expectedVersion, (candidate) => {
      candidate.status = nextStatus;
    });
    this.repository.addApproval({
      ticketId: ticket.id,
      stage: "manager",
      approverUserId: actor.id,
      decision,
      remarks: remarks ?? null,
      roleSnapshot: roleSnapshot(actor),
      routeSnapshot: ticket.route_snapshot
    });
    this.writeMutation(actor, ticket, `expense.manager.${decision}`, current.status, nextStatus, remarks ?? null);
    this.addNotification(actor.id, ticket.finance_approver_id, "expense.manager_decision", { ticket_id: ticket.id, decision });
    return ticket;
  }

  financeApprove(actor: AuthUser, ticketId: UUID, decision: string, remarks: string | undefined, expectedVersion: number): ExpenseTicket {
    const current = this.repository.findTicket(ticketId);
    assertFinanceActor(actor, current, WorkflowActions.FinanceApprove);
    const financeReadyStatuses: readonly string[] = [
      ExpenseStatuses.ManagerVerified,
      ExpenseStatuses.FinanceHold,
      ExpenseStatuses.ClarificationRequired
    ];
    if (!financeReadyStatuses.includes(current.status)) {
      throw forbidden("Finance approval cannot start before manager verification");
    }
    const financeRemarkDecisions: readonly string[] = [ExpenseDecisions.Hold, ExpenseDecisions.Clarification];
    if (financeRemarkDecisions.includes(decision) && !remarks) {
      throw missingRemarks(decision);
    }
    const nextStatus = financeDecisionToStatus(decision);
    assertTransition(current.status, nextStatus);
    const ticket = this.repository.updateTicketVersioned(ticketId, expectedVersion, (candidate) => {
      candidate.status = nextStatus;
    });
    this.repository.addApproval({
      ticketId: ticket.id,
      stage: "finance",
      approverUserId: actor.id,
      decision,
      remarks: remarks ?? null,
      roleSnapshot: roleSnapshot(actor),
      routeSnapshot: ticket.route_snapshot
    });
    this.writeMutation(actor, ticket, `expense.finance.${decision}`, current.status, nextStatus, remarks ?? null);
    this.addNotification(actor.id, ticket.requester_user_id, "expense.finance_decision", { ticket_id: ticket.id, decision });
    return ticket;
  }

  releasePayment(actor: AuthUser, ticketId: UUID, input: { payment_date: string; amount: string; payment_mode: string; reference_no: string; expected_version: number }): ExpenseTicket {
    const current = this.repository.findTicket(ticketId);
    assertFinanceActor(actor, current, WorkflowActions.PaymentRelease);
    assertTransition(current.status, ExpenseStatuses.PaymentReleased);
    const ticket = this.repository.updateTicketVersioned(ticketId, input.expected_version, (candidate) => {
      candidate.status = ExpenseStatuses.PaymentReleased;
      candidate.payment_reference_no = input.reference_no;
    });
    this.repository.addPayment({
      id: randomUUID(),
      ticket_id: ticket.id,
      payment_type: ticket.payment_type,
      approved_amount: ticket.estimated_amount,
      paid_amount: input.amount,
      payment_date: input.payment_date,
      payment_mode: input.payment_mode,
      reference_no: input.reference_no,
      settlement_status: "pending",
      settlement_amount: null,
      processed_by_user_id: actor.id,
      created_at: nowIso()
    });
    this.writeMutation(actor, ticket, "expense.payment_released", current.status, ticket.status, input.reference_no);
    this.addNotification(actor.id, ticket.requester_user_id, "expense.payment_released", { ticket_id: ticket.id, reference_no: input.reference_no });
    return ticket;
  }

  submitBills(actor: AuthUser, ticketId: UUID, expectedVersion: number): ExpenseTicket {
    const current = this.repository.findTicket(ticketId);
    if (current.requester_user_id !== actor.id && !actor.roles.includes(Roles.FinanceManager) && !actor.roles.includes(Roles.Admin)) {
      throw forbidden("Only requester or Finance can submit bills");
    }
    assertTransition(current.status, ExpenseStatuses.BillsSubmitted);
    const ticket = this.repository.updateTicketVersioned(ticketId, expectedVersion, (candidate) => {
      candidate.status = ExpenseStatuses.BillsSubmitted;
    });
    this.writeMutation(actor, ticket, "expense.bills_submitted", current.status, ticket.status, null);
    return ticket;
  }

  settle(actor: AuthUser, ticketId: UUID, actualAmount: string, remarks: string | undefined, expectedVersion: number): ExpenseTicket {
    const current = this.repository.findTicket(ticketId);
    assertFinanceActor(actor, current, WorkflowActions.SettlementClose);
    const settlementReadyStatuses: readonly string[] = [
      ExpenseStatuses.PaymentReleased,
      ExpenseStatuses.BillsSubmitted,
      ExpenseStatuses.PendingAdjustment
    ];
    if (!settlementReadyStatuses.includes(current.status)) {
      throw badRequest("Settlement requires Payment Released, Bills Submitted, or Pending Adjustment status");
    }
    const missing = this.missingRequiredDocuments(current);
    if (missing.length > 0) {
      throw badRequest("Closure blocked until required documents are uploaded and verified by the assigned manager", {
        missing_document_types: missing
      });
    }
    const basis = current.advance_amount ?? current.estimated_amount;
    const variance = subtractMoney(actualAmount, basis);
    const nextStatus = compareMoney(variance, "0.00") === 0 ? ExpenseStatuses.Closed : ExpenseStatuses.PendingAdjustment;
    const settlementStatus = compareMoney(variance, "0.00") > 0 ? "payable" : compareMoney(variance, "0.00") < 0 ? "recoverable" : "no_balance";
    assertTransition(current.status, nextStatus);
    const ticket = this.repository.updateTicketVersioned(ticketId, expectedVersion, (candidate) => {
      candidate.actual_amount = actualAmount;
      candidate.variance_amount = variance;
      candidate.status = nextStatus;
      candidate.closure_remarks = remarks ?? null;
      candidate.closed_at = nextStatus === ExpenseStatuses.Closed ? nowIso() : null;
    });
    const payment = this.store.payments.find((candidate) => candidate.ticket_id === ticket.id);
    if (payment) {
      payment.settlement_status = settlementStatus;
      payment.settlement_amount = variance;
    }
    this.writeMutation(actor, ticket, "expense.settlement", current.status, ticket.status, remarks ?? null);
    if (ticket.status === ExpenseStatuses.Closed) {
      appendOutboxEvent(this.store, {
        aggregateType: "expense_ticket",
        aggregateId: ticket.id,
        eventType: "expense.closed",
        payload: { ticket_id: ticket.id },
        idempotencyKey: `${RetryableMutationScopes.ExpenseSettlement}:${ticket.id}:${ticket.version}`
      });
    }
    return ticket;
  }

  missingRequiredDocuments(ticket: ExpenseTicket): string[] {
    const required = getRequiredDocuments(ticket.expense_sub_type);
    const verified = new Set(this.repository.verifiedDocumentsForTicket(ticket.id).map((document) => document.document_type));
    return required.filter((documentType) => !verified.has(documentType));
  }

  listManagerBackupAssignments(actor: AuthUser, page: number, pageSize: number): PaginatedResult<ManagerBackupAssignment> {
    if (!actor.roles.includes(Roles.Admin)) {
      throw forbidden("Only Admin can list manager backup assignments");
    }
    return paginate(
      this.store.managerBackupAssignments.filter((assignment) => !assignment.deleted_at),
      page,
      pageSize
    );
  }

  createManagerBackupAssignment(
    actor: AuthUser,
    input: { employee_user_id: UUID; backup_manager_user_id: UUID; effective_from: string; effective_to?: string }
  ): ManagerBackupAssignment {
    if (!actor.roles.includes(Roles.Admin)) {
      throw forbidden("Only Admin can create manager backup assignments");
    }
    if (input.employee_user_id === input.backup_manager_user_id) {
      throw badRequest("Manager backup assignment cannot be self-referential");
    }
    const employee = this.core.getUser(input.employee_user_id);
    const backup = this.core.getUser(input.backup_manager_user_id);
    if (employee.employment_status !== EmploymentStatuses.Active || backup.employment_status !== EmploymentStatuses.Active) {
      throw badRequest("Inactive users cannot be selected as manager backup assignment participants");
    }
    return this.repository.createManagerBackupAssignment({
      employee_user_id: input.employee_user_id,
      backup_manager_user_id: input.backup_manager_user_id,
      assigned_by_user_id: actor.id,
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null
    });
  }

  revokeManagerBackupAssignment(actor: AuthUser, id: UUID, expectedVersion?: number): ManagerBackupAssignment {
    if (!actor.roles.includes(Roles.Admin)) {
      throw forbidden("Only Admin can revoke manager backup assignments");
    }
    return this.repository.revokeManagerBackupAssignment(id, expectedVersion);
  }

  audit(actor: AuthUser, ticketId: UUID, page: number, pageSize: number): PaginatedResult<unknown> {
    const ticket = this.repository.findTicket(ticketId);
    if (!canReadTicket(actor, ticket)) {
      throw forbidden("You do not have access to this ticket audit");
    }
    const rows = this.store.auditLogs.filter((log) => log.ticket_id === ticketId);
    return paginate(rows, page, pageSize);
  }

  timeline(actor: AuthUser, ticketId: UUID): ExpenseTimelineEvent[] {
    const ticket = this.repository.findTicket(ticketId);
    if (!canReadTicket(actor, ticket)) {
      throw forbidden("You do not have access to this ticket timeline");
    }
    return this.store.auditLogs
      .filter((log) => log.ticket_id === ticketId)
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((log) => this.toTimelineEvent(log));
  }

  attachVerifiedDocument(actor: AuthUser, ticketId: UUID, documentId: UUID, documentType: string): void {
    const ticket = this.repository.findTicket(ticketId);
    if (ticket.status === ExpenseStatuses.Closed && actor.id === ticket.requester_user_id) {
      throw forbidden("Closed tickets are read-only except authorized correction notes");
    }
    this.repository.addExpenseDocument({
      id: randomUUID(),
      ticket_id: ticketId,
      document_id: documentId,
      document_type: documentType,
      verification_status: "pending",
      uploaded_by: actor.id,
      uploaded_at: nowIso()
    });
    this.repository.addAudit({
      ticket_id: ticketId,
      actor_user_id: actor.id,
      event_type: "expense.document_uploaded",
      old_value: null,
      new_value: { document_id: documentId, document_type: documentType },
      remarks: null,
      payload_hash: null
    });
  }

  verifyExpenseDocument(actor: AuthUser, ticketId: UUID, documentId: UUID): Record<string, unknown> {
    const ticket = this.repository.findTicket(ticketId);
    assertManagerActor(actor, ticket);
    const document = this.repository.findExpenseDocument(ticketId, documentId);
    if (document.verification_status === "verified") {
      return this.presentTicket(ticket);
    }
    if (document.verification_status === "rejected") {
      throw badRequest("Rejected documents cannot be verified without a new upload", {
        document_id: documentId,
        document_type: document.document_type
      });
    }
    document.verification_status = "verified";
    this.repository.addAudit({
      ticket_id: ticketId,
      actor_user_id: actor.id,
      event_type: "expense.document_verified",
      old_value: { document_id: document.document_id, document_type: document.document_type, status: "pending" },
      new_value: { document_id: document.document_id, document_type: document.document_type, status: "verified" },
      remarks: null,
      payload_hash: null
    });
    return this.presentTicket(ticket);
  }

  private presentPaginatedTickets(items: ExpenseTicket[], page: number, pageSize: number): PaginatedResult<Record<string, unknown>> {
    const paginated = paginate(items, page, pageSize);
    return {
      ...paginated,
      items: paginated.items.map((ticket) => this.presentTicket(ticket))
    };
  }

  private presentTicket(ticket: ExpenseTicket): Record<string, unknown> {
    const requester = this.store.users.find((user) => user.id === ticket.requester_user_id && !user.deleted_at);
    const department = this.store.departments.find((candidate) => candidate.id === ticket.department_id && !candidate.deleted_at);
    const manager = ticket.manager_verifier_id
      ? this.store.users.find((user) => user.id === ticket.manager_verifier_id && !user.deleted_at) ?? null
      : null;
    const financeActor = ticket.finance_approver_id
      ? this.store.users.find((user) => user.id === ticket.finance_approver_id && !user.deleted_at) ?? null
      : null;
    const primaryFinanceManagerId =
      typeof ticket.route_snapshot.primary_finance_manager_user_id === "string"
        ? (ticket.route_snapshot.primary_finance_manager_user_id as UUID)
        : null;
    const primaryFinanceManager = primaryFinanceManagerId
      ? this.store.users.find((user) => user.id === primaryFinanceManagerId && !user.deleted_at) ?? null
      : null;
    const governanceNotes = Array.isArray(ticket.route_snapshot.notes)
      ? ticket.route_snapshot.notes.filter((note): note is string => typeof note === "string")
      : [];
    const expenseDocuments = this.store.expenseDocuments.filter((document) => document.ticket_id === ticket.id);
    return {
      ...ticket,
      requester_employee_code: requester?.employee_code ?? null,
      requester_name: requester?.full_name ?? null,
      requester_email: requester?.email ?? null,
      requester_label: requester ? `${requester.employee_code} - ${requester.full_name}` : ticket.requester_user_id,
      department_code: department?.department_code ?? null,
      department_name: department?.name ?? null,
      department: department?.name ?? ticket.department_id,
      manager_verifier_label: manager ? `${manager.employee_code} - ${manager.full_name}` : ticket.manager_verifier_id,
      finance_approver_label: financeActor ? `${financeActor.employee_code} - ${financeActor.full_name}` : ticket.finance_approver_id,
      assigned_finance_actor_user_id: ticket.finance_approver_id,
      assigned_finance_actor_label: financeActor ? `${financeActor.employee_code} - ${financeActor.full_name}` : ticket.finance_approver_id,
      primary_finance_manager_user_id: primaryFinanceManagerId,
      primary_finance_manager_label: primaryFinanceManager ? `${primaryFinanceManager.employee_code} - ${primaryFinanceManager.full_name}` : primaryFinanceManagerId,
      finance_approval_backup_user_id:
        typeof ticket.route_snapshot.finance_approval_backup_user_id === "string"
          ? ticket.route_snapshot.finance_approval_backup_user_id
          : null,
      finance_backup_applied: ticket.route_snapshot.finance_backup_applied === true,
      governance_warning_codes: governanceNotes.filter((note) => note.startsWith("finance_") || note.startsWith("primary_") || note.startsWith("manager_")),
      missing_documents: this.missingRequiredDocuments(ticket),
      clarifications: this.clarificationThread(ticket.id),
      documents: expenseDocuments.map((document) => ({
        id: document.id,
        document_id: document.document_id,
        type: document.document_type,
        status: document.verification_status,
        owner: document.uploaded_by,
        uploaded_at: document.uploaded_at
      }))
    };
  }

  private visibleTickets(actor: AuthUser): ExpenseTicket[] {
    return this.store.tickets.filter((ticket) => !ticket.deleted_at && canReadTicket(actor, ticket));
  }

  private sumTickets(tickets: readonly ExpenseTicket[]): string {
    return addMoney(tickets.map((ticket) => ticket.estimated_amount));
  }

  private agingBuckets(tickets: readonly ExpenseTicket[]): Array<{ bucket: string; count: number; total_amount: string }> {
    const buckets = [
      { bucket: "0-24h", min: 0, max: 24 },
      { bucket: "24-72h", min: 25, max: 72 },
      { bucket: "72h-plus", min: 73, max: Number.POSITIVE_INFINITY }
    ];
    return buckets.map((bucket) => {
      const rows = tickets.filter((ticket) => {
        const age = this.ageHours(ticket);
        return age >= bucket.min && age <= bucket.max;
      });
      return {
        bucket: bucket.bucket,
        count: rows.length,
        total_amount: this.sumTickets(rows)
      };
    });
  }

  private clarificationThread(ticketId: UUID): Array<Record<string, unknown>> {
    return this.store.auditLogs
      .filter((log) => log.ticket_id === ticketId && log.event_type.includes("clarification"))
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((log) => this.toClarificationThreadItem(log));
  }

  private toClarificationThreadItem(log: ExpenseAuditLog): Record<string, unknown> {
    const actor = this.store.users.find((user) => user.id === log.actor_user_id);
    const newValue = log.new_value ?? {};
    const documentIds = Array.isArray(newValue.document_ids)
      ? newValue.document_ids.filter((value): value is string => typeof value === "string")
      : [];
    return {
      id: log.id,
      ticket_id: log.ticket_id,
      actor_user_id: log.actor_user_id,
      actor_name: actor ? `${actor.employee_code} - ${actor.full_name}` : "Unknown actor",
      message: typeof newValue.message === "string" ? newValue.message : log.remarks ?? "",
      document_ids: documentIds,
      created_at: log.created_at,
      event_type: log.event_type
    };
  }

  private ageHours(ticket: ExpenseTicket): number {
    const start = Date.parse(ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at);
    return Math.max(0, Math.floor((Date.now() - start) / 3_600_000));
  }

  private compareFinanceQueueTickets(left: ExpenseTicket, right: ExpenseTicket, sort: FinanceQueueFilters["sort"]): number {
    if (sort === "amount") {
      return compareMoney(right.estimated_amount, left.estimated_amount);
    }
    if (sort === "created_at") {
      return Date.parse(right.created_at) - Date.parse(left.created_at);
    }
    if (sort === "status") {
      return left.status.localeCompare(right.status) || Date.parse(right.created_at) - Date.parse(left.created_at);
    }
    return this.ageHours(right) - this.ageHours(left);
  }

  private writeMutation(
    actor: AuthUser,
    ticket: ExpenseTicket,
    eventType: string,
    oldStatus: string,
    newStatus: string,
    remarks: string | null
  ): ExpenseAuditLog {
    const audit = this.repository.addAudit({
      ticket_id: ticket.id,
      actor_user_id: actor.id,
      event_type: eventType,
      old_value: { status: oldStatus },
      new_value: { status: newStatus, version: ticket.version },
      remarks,
      payload_hash: null
    });
    appendOutboxEvent(this.store, {
      aggregateType: "expense_ticket",
      aggregateId: ticket.id,
      eventType,
      payload: { ticket_id: ticket.id, actor_user_id: actor.id, status: newStatus },
      idempotencyKey: `${eventType}:${ticket.id}:${ticket.version}:${audit.id}`
    });
    return audit;
  }

  private toTimelineEvent(log: ExpenseAuditLog): ExpenseTimelineEvent {
    const actor = this.store.users.find((user) => user.id === log.actor_user_id);
    const oldValue = log.old_value ?? {};
    const newValue = log.new_value ?? {};
    return {
      event_type: log.event_type,
      label: timelineLabel(log.event_type),
      stage: timelineStage(log.event_type),
      actor_user_id: log.actor_user_id,
      actor_name: actor ? `${actor.employee_code} - ${actor.full_name}` : "Unknown actor",
      timestamp: log.created_at,
      remarks: log.remarks,
      status_from: typeof oldValue.status === "string" ? oldValue.status : null,
      status_to: typeof newValue.status === "string" ? newValue.status : null
    };
  }

  private requireRemarksForDecision(decision: ExpenseDecision, remarks?: string): void {
    const remarkRequiredDecisions: readonly string[] = [ExpenseDecisions.Reject, ExpenseDecisions.Return];
    if (remarkRequiredDecisions.includes(decision) && !remarks) {
      throw missingRemarks(decision);
    }
  }

  private addNotification(
    actorUserId: UUID | null,
    targetUserId: UUID | null,
    eventType: string,
    payload: Record<string, unknown>
  ): void {
    const createdAt = nowIso();
    this.store.notifications.push({
      id: randomUUID(),
      actor_user_id: actorUserId,
      target_user_id: targetUserId,
      event_type: eventType,
      payload,
      status: "pending",
      read_at: null,
      version: 1,
      created_at: createdAt,
      updated_at: createdAt
    });
  }
}

function timelineStage(eventType: string): string {
  if (eventType.includes(".manager.")) {
    return "manager";
  }
  if (eventType.includes(".finance.") || eventType.includes("payment") || eventType.includes("bills") || eventType.includes("settlement")) {
    return "finance";
  }
  if (eventType.includes("document")) {
    return "documents";
  }
  if (eventType.includes("closed")) {
    return "closure";
  }
  return "requester";
}

function timelineLabel(eventType: string): string {
  const known: Record<string, string> = {
    "expense.created": "Expense draft created",
    "expense.submitted": "Expense submitted",
    "expense.payment_released": "Payment released",
    "expense.bills_submitted": "Bills submitted",
    "expense.settlement": "Settlement recorded",
    "expense.closed": "Expense closed",
    "expense.document_uploaded": "Document uploaded",
    "expense.document_verified": "Document verified"
  };
  if (known[eventType]) {
    return known[eventType];
  }
  const parts = eventType.split(".");
  const decision = parts[parts.length - 1] ?? "recorded";
  if (eventType.includes(".manager.")) {
    return `Manager ${decision}`;
  }
  if (eventType.includes(".finance.")) {
    return `Finance ${decision}`;
  }
  return eventType;
}
