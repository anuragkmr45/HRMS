import type {
  AuthUser,
  CoreUser,
  ProjectAllocationCreateInput,
  ProjectAllocationRecord,
  ProjectArchiveInput,
  ProjectCreateInput,
  ProjectMemberCreateInput,
  ProjectMemberRecord,
  ProjectMemberUpdateInput,
  ProjectMilestoneCreateInput,
  ProjectMilestoneRecord,
  ProjectRecord,
  ProjectUpdateInput,
  UUID
} from "#shared";
import {
  EmploymentStatuses,
  ProjectHealthStatuses,
  ProjectMemberStatuses,
  ProjectStatuses,
  Roles
} from "#shared";
import type { MemoryDataStore, WorkSegment } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, notFound } from "../../platform/errors.js";
import { appendProjectOutboxEvent, projectEvents } from "./events.js";
import { assertCanMutateProject, canMutateProject, canSeeProjectPortfolio } from "./policy.js";
import { ProjectsRepository } from "./repository.js";

export interface ProjectQuery {
  page: number;
  page_size: number;
  sort?: string;
  status?: string;
  client?: string;
  manager_user_id?: UUID;
  search?: string;
  include?: string;
  active_only?: boolean;
  role?: string;
  user_id?: UUID;
  date_from?: string;
  date_to?: string;
  document_type?: string;
  department_id?: UUID;
  group_by?: "department" | "manager";
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function money(value: string | number | null | undefined): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function hours(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function userRef(user: CoreUser | undefined | null) {
  return {
    id: user?.id ?? null,
    employee_code: user?.employee_code ?? "UNKNOWN",
    full_name: user?.full_name ?? "Unknown employee",
    email: user?.email ?? null,
    department_id: user?.department_id ?? null,
    designation_id: user?.designation_id ?? null
  };
}

function dateInRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function rangesOverlap(leftFrom: string, leftTo: string | null, rightFrom?: string, rightTo?: string): boolean {
  const leftEnd = leftTo ?? "9999-12-31";
  if (rightFrom && leftEnd < rightFrom) return false;
  if (rightTo && leftFrom > rightTo) return false;
  return true;
}

function assertOverAllocationAcknowledged(input: {
  allocationPercent: number;
  acknowledged?: boolean;
  reason?: string;
}): void {
  if (input.allocationPercent <= 100) {
    return;
  }
  if (!input.acknowledged) {
    throw badRequest("Allocation above 100% requires explicit acknowledgement before it can be saved.", {
      allocation_percent: input.allocationPercent,
      required_action: "Confirm the over-allocation warning and provide a short reason if required by your process."
    });
  }
}

export class ProjectsService {
  private readonly repository: ProjectsRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new ProjectsRepository(store);
  }

  createProject(actor: AuthUser, input: ProjectCreateInput) {
    const manager = this.requireActiveUser(actor, input.manager_user_id);
    if (input.end_date < input.start_date) {
      throw badRequest("Project end date cannot be before start date.");
    }
    if (!actor.roles.includes(Roles.Admin) && manager.id !== actor.id) {
      throw forbidden("Only Admin can create projects for another project manager.");
    }
    const project = this.repository.addProject({
      project_code: input.project_code.trim(),
      name: input.name.trim(),
      client_name: input.client_name.trim(),
      project_type: input.project_type,
      billing_type: input.billing_type,
      manager_user_id: manager.id,
      department_id: input.department_id ?? manager.department_id,
      start_date: input.start_date,
      end_date: input.end_date,
      status: input.status,
      health: input.health,
      description: input.description?.trim() || null,
      estimated_hours: money(input.estimated_hours),
      actual_hours: "0.00",
      estimated_budget: money(input.estimated_budget),
      actual_spend: "0.00",
      tech_stack: input.tech_stack,
      priority: input.priority,
      cost_center: input.cost_center?.trim() || null
    });
    appendProjectOutboxEvent(this.store, {
      aggregateType: "project",
      aggregateId: project.id,
      eventType: projectEvents.Created,
      payload: { project_id: project.id, project_code: project.project_code, actor_user_id: actor.id },
      idempotencyKey: `project.created:${project.id}`
    });
    return { project: this.presentProject(project, actor, true), version: project.version };
  }

  listProjects(actor: AuthUser, query: ProjectQuery) {
    const base = this.repository
      .listProjects({
        status: query.status,
        client: query.client,
        managerUserId: query.manager_user_id,
        search: query.search
      })
      .filter((project) => this.canActorSee(actor, project));
    const sorted = this.sortProjects(base, query.sort);
    const items = sorted.map((project) => this.presentProject(project, actor, false));
    return {
      ...page(items, query.page, query.page_size),
      totals: {
        total: base.length,
        active: base.filter((project) => project.status === ProjectStatuses.Active).length,
        planned: base.filter((project) => project.status === ProjectStatuses.Planned).length,
        on_hold: base.filter((project) => project.status === ProjectStatuses.OnHold).length,
        completed: base.filter((project) => project.status === ProjectStatuses.Completed).length,
        cancelled: base.filter((project) => project.status === ProjectStatuses.Cancelled).length,
        archived: base.filter((project) => project.status === ProjectStatuses.Archived).length
      }
    };
  }

  getProject(actor: AuthUser, id: UUID, query: ProjectQuery) {
    const project = this.requireVisibleProject(actor, id);
    return this.presentProject(project, actor, true, query.include);
  }

  updateProject(actor: AuthUser, id: UUID, input: ProjectUpdateInput) {
    const project = this.requireMutableProject(actor, id);
    if (input.manager_user_id) this.requireActiveUser(actor, input.manager_user_id);
    if (input.department_id) this.requireDepartment(input.department_id);
    const updated = this.repository.updateProjectVersioned(id, input.expected_version, (target) => {
      if (input.project_code !== undefined) target.project_code = input.project_code.trim();
      if (input.name !== undefined) target.name = input.name.trim();
      if (input.client_name !== undefined) target.client_name = input.client_name.trim();
      if (input.project_type !== undefined) target.project_type = input.project_type;
      if (input.billing_type !== undefined) target.billing_type = input.billing_type;
      if (input.manager_user_id !== undefined) target.manager_user_id = input.manager_user_id;
      if (input.department_id !== undefined) target.department_id = input.department_id;
      if (input.start_date !== undefined) target.start_date = input.start_date;
      if (input.end_date !== undefined) target.end_date = input.end_date;
      if (target.end_date < target.start_date) throw badRequest("Project end date cannot be before start date.");
      if (input.status !== undefined) target.status = input.status;
      if (input.health !== undefined) target.health = input.health;
      if (input.description !== undefined) target.description = input.description?.trim() || null;
      if (input.estimated_hours !== undefined) target.estimated_hours = money(input.estimated_hours);
      if (input.estimated_budget !== undefined) target.estimated_budget = money(input.estimated_budget);
      if (input.tech_stack !== undefined) target.tech_stack = input.tech_stack;
      if (input.priority !== undefined) target.priority = input.priority;
      if (input.cost_center !== undefined) target.cost_center = input.cost_center?.trim() || null;
    });
    appendProjectOutboxEvent(this.store, {
      aggregateType: "project",
      aggregateId: updated.id,
      eventType: projectEvents.Updated,
      payload: { project_id: updated.id, actor_user_id: actor.id, version: updated.version },
      idempotencyKey: `project.updated:${updated.id}:${updated.version}`
    });
    return { project: this.presentProject(updated, actor, true), version: updated.version };
  }

  archiveProject(actor: AuthUser, id: UUID, input: ProjectArchiveInput) {
    const project = this.requireMutableProject(actor, id);
    const activeMembers = this.repository.listMembers(id, true);
    if (activeMembers.length > 0 && project.status === ProjectStatuses.Active) {
      throw conflict("Archive active projects only after members are removed or project is put on hold/completed.", { active_members: activeMembers.length });
    }
    const updated = this.repository.updateProjectVersioned(id, input.expected_version, (target) => {
      target.status = ProjectStatuses.Archived;
      target.health = ProjectHealthStatuses.Green;
    });
    appendProjectOutboxEvent(this.store, {
      aggregateType: "project",
      aggregateId: updated.id,
      eventType: projectEvents.Archived,
      payload: { project_id: updated.id, actor_user_id: actor.id, remarks: input.remarks ?? null },
      idempotencyKey: `project.archived:${updated.id}:${updated.version}`
    });
    return { project: this.presentProject(updated, actor, true), status: updated.status, version: updated.version };
  }

  listMembers(actor: AuthUser, id: UUID, query: ProjectQuery) {
    this.requireVisibleProject(actor, id);
    const items = this.repository
      .listMembers(id, query.active_only ?? false)
      .filter((member) => !query.role || member.project_role === query.role)
      .map((member) => this.presentMember(member));
    return page(items, query.page, query.page_size);
  }

  addMember(actor: AuthUser, id: UUID, input: ProjectMemberCreateInput) {
    const project = this.requireMutableProject(actor, id);
    this.assertProjectVersion(project, input.expected_version);
    this.requireActiveUser(actor, input.user_id);
    assertOverAllocationAcknowledged({
      allocationPercent: input.allocation_percent,
      acknowledged: input.over_allocation_acknowledged,
      reason: input.over_allocation_reason
    });
    if (input.reporting_lead_user_id) this.requireActiveUser(actor, input.reporting_lead_user_id);
    const member = this.repository.addMember({
      project_id: id,
      employee_user_id: input.user_id,
      project_role: input.project_role.trim(),
      allocation_percent: input.allocation_percent,
      billable: input.billable,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      reporting_lead_user_id: input.reporting_lead_user_id ?? null,
      status: ProjectMemberStatuses.Active
    });
    this.repository.addAllocation({
      project_id: id,
      employee_user_id: input.user_id,
      date_from: input.start_date,
      date_to: input.end_date ?? null,
      allocation_percent: input.allocation_percent,
      billable: input.billable,
      notes: input.allocation_percent > 100
        ? `Initial project member allocation. Over-allocation acknowledged: ${input.over_allocation_reason?.trim() || "No reason provided"}`
        : "Initial project member allocation"
    });
    this.bumpProject(project);
    appendProjectOutboxEvent(this.store, {
      aggregateType: "project_member",
      aggregateId: member.id,
      eventType: projectEvents.MemberChanged,
      payload: {
        project_id: id,
        member_id: member.id,
        actor_user_id: actor.id,
        action: "added",
        over_allocation_acknowledged: input.allocation_percent > 100,
        over_allocation_reason: input.over_allocation_reason?.trim() || null
      },
      idempotencyKey: `project.member.added:${member.id}`
    });
    return { member: this.presentMember(member), project_version: project.version, capacity_warnings: this.capacityWarnings(input.user_id) };
  }

  updateMember(actor: AuthUser, projectId: UUID, memberId: UUID, input: ProjectMemberUpdateInput) {
    const project = this.requireMutableProject(actor, projectId);
    if (input.reporting_lead_user_id) this.requireActiveUser(actor, input.reporting_lead_user_id);
    if (input.allocation_percent !== undefined) {
      assertOverAllocationAcknowledged({
        allocationPercent: input.allocation_percent,
        acknowledged: input.over_allocation_acknowledged,
        reason: input.over_allocation_reason
      });
    }
    const member = this.repository.updateMemberVersioned(projectId, memberId, input.expected_version, (target) => {
      if (input.project_role !== undefined) target.project_role = input.project_role.trim();
      if (input.allocation_percent !== undefined) target.allocation_percent = input.allocation_percent;
      if (input.billable !== undefined) target.billable = input.billable;
      if (input.start_date !== undefined) target.start_date = input.start_date;
      if (input.end_date !== undefined) target.end_date = input.end_date ?? null;
      if (target.end_date && target.end_date < target.start_date) throw badRequest("Member assignment end date cannot be before start date.");
      if (input.reporting_lead_user_id !== undefined) target.reporting_lead_user_id = input.reporting_lead_user_id ?? null;
      if (input.status !== undefined) target.status = input.status;
    });
    this.bumpProject(project);
    appendProjectOutboxEvent(this.store, {
      aggregateType: "project_member",
      aggregateId: member.id,
      eventType: projectEvents.MemberChanged,
      payload: {
        project_id: projectId,
        member_id: member.id,
        actor_user_id: actor.id,
        action: "updated",
        over_allocation_acknowledged: (input.allocation_percent ?? member.allocation_percent) > 100,
        over_allocation_reason: input.over_allocation_reason?.trim() || null
      },
      idempotencyKey: `project.member.updated:${member.id}:${member.version}`
    });
    return { member: this.presentMember(member), project_version: project.version, capacity_warnings: this.capacityWarnings(member.employee_user_id) };
  }

  listAllocations(actor: AuthUser, id: UUID, query: ProjectQuery) {
    this.requireVisibleProject(actor, id);
    const items = this.repository
      .listAllocations(id, query.user_id)
      .filter((allocation) => rangesOverlap(allocation.date_from, allocation.date_to, query.date_from, query.date_to))
      .map((allocation) => this.presentAllocation(allocation));
    const totals = {
      allocation_percent: items.reduce((sum, item) => sum + item.allocation_percent, 0),
      billable_percent: items.filter((item) => item.billable).reduce((sum, item) => sum + item.allocation_percent, 0)
    };
    return { ...page(items, query.page, query.page_size), totals };
  }

  addAllocation(actor: AuthUser, id: UUID, input: ProjectAllocationCreateInput) {
    const project = this.requireMutableProject(actor, id);
    this.assertProjectVersion(project, input.expected_version);
    this.requireActiveUser(actor, input.user_id);
    assertOverAllocationAcknowledged({
      allocationPercent: input.allocation_percent,
      acknowledged: input.over_allocation_acknowledged,
      reason: input.over_allocation_reason
    });
    if (input.date_to && input.date_to < input.date_from) {
      throw badRequest("Allocation end date cannot be before start date.");
    }
    const member = this.repository
      .listMembers(id, true)
      .find((candidate) => candidate.employee_user_id === input.user_id);
    if (!member) {
      throw conflict("Employee must be an active project member before allocation is added.", { user_id: input.user_id });
    }
    const allocation = this.repository.addAllocation({
      project_id: id,
      employee_user_id: input.user_id,
      date_from: input.date_from,
      date_to: input.date_to ?? null,
      allocation_percent: input.allocation_percent,
      billable: input.billable,
      notes: input.allocation_percent > 100
        ? `${input.notes?.trim() || "Allocation update"}. Over-allocation acknowledged: ${input.over_allocation_reason?.trim() || "No reason provided"}`
        : input.notes?.trim() || null
    });
    member.allocation_percent = input.allocation_percent;
    member.billable = input.billable;
    member.version += 1;
    member.updated_at = nowIso();
    this.bumpProject(project);
    appendProjectOutboxEvent(this.store, {
      aggregateType: "project_allocation",
      aggregateId: allocation.id,
      eventType: projectEvents.AllocationChanged,
      payload: {
        project_id: id,
        allocation_id: allocation.id,
        actor_user_id: actor.id,
        over_allocation_acknowledged: input.allocation_percent > 100,
        over_allocation_reason: input.over_allocation_reason?.trim() || null
      },
      idempotencyKey: `project.allocation.created:${allocation.id}`
    });
    return { allocation: this.presentAllocation(allocation), capacity_warnings: this.capacityWarnings(input.user_id), version: project.version };
  }

  listMilestones(actor: AuthUser, id: UUID, query: ProjectQuery) {
    this.requireVisibleProject(actor, id);
    const items = this.repository.listMilestones(id, query.status).map((milestone) => this.presentMilestone(milestone));
    return page(items, query.page, query.page_size);
  }

  addMilestone(actor: AuthUser, id: UUID, input: ProjectMilestoneCreateInput) {
    const project = this.requireMutableProject(actor, id);
    this.assertProjectVersion(project, input.expected_version);
    if (input.owner_user_id) this.requireActiveUser(actor, input.owner_user_id);
    if (input.start_date && input.due_date < input.start_date) {
      throw badRequest("Milestone due date cannot be before start date.");
    }
    const milestone = this.repository.addMilestone({
      project_id: id,
      name: input.name.trim(),
      owner_user_id: input.owner_user_id ?? null,
      status: input.status,
      start_date: input.start_date ?? null,
      due_date: input.due_date,
      priority: input.priority
    });
    this.bumpProject(project);
    appendProjectOutboxEvent(this.store, {
      aggregateType: "project_milestone",
      aggregateId: milestone.id,
      eventType: projectEvents.MilestoneCreated,
      payload: { project_id: id, milestone_id: milestone.id, actor_user_id: actor.id },
      idempotencyKey: `project.milestone.created:${milestone.id}`
    });
    return { milestone: this.presentMilestone(milestone), project_version: project.version };
  }

  listDocuments(actor: AuthUser, id: UUID, query: ProjectQuery) {
    this.requireVisibleProject(actor, id);
    const documents = this.store.documents
      .filter((document) => {
        if (document.deleted_at || document.business_object_type !== "project" || document.business_object_id !== id) return false;
        if (query.document_type && document.document_type !== query.document_type) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((document) => ({
        id: document.id,
        name: document.file_name,
        category: document.document_type,
        size_bytes: document.size_bytes,
        uploaded_at: document.created_at,
        uploaded_by: userRef(this.store.users.find((user) => user.id === document.created_by_user_id)),
        classification: document.classification,
        document_id: document.id
      }));
    return page(documents, query.page, query.page_size);
  }

  projectSummary(actor: AuthUser, id: UUID, query: ProjectQuery) {
    const project = this.requireVisibleProject(actor, id);
    const segments = this.projectSegments(project, query.date_from, query.date_to);
    const tickets = this.store.tickets.filter((ticket) => !ticket.deleted_at && ticket.project_code === project.project_code);
    const activeMembers = this.repository.listMembers(id, true);
    const actualHours = segments.reduce((sum, segment) => sum + hours(segment.hours), 0);
    const billableHours = segments.filter((segment) => segment.billable).reduce((sum, segment) => sum + hours(segment.hours), 0);
    const actualSpend = tickets.reduce((sum, ticket) => sum + Number(ticket.actual_amount ?? ticket.estimated_amount ?? "0"), 0);
    return {
      project: this.presentProject(project, actor, false),
      cards: [
        { key: "team_size", label: "Team size", value: activeMembers.length, tone: "info" },
        { key: "actual_hours", label: "Actual hours", value: actualHours.toFixed(2), tone: "primary" },
        { key: "billable_hours", label: "Billable hours", value: billableHours.toFixed(2), tone: "success" },
        { key: "actual_spend", label: "Actual spend", value: money(actualSpend), tone: "warning" }
      ],
      timesheet_summary: {
        actual_hours: actualHours.toFixed(2),
        billable_hours: billableHours.toFixed(2),
        non_billable_hours: (actualHours - billableHours).toFixed(2),
        segment_count: segments.length
      },
      expense_summary: {
        ticket_count: tickets.length,
        estimated_amount: money(tickets.reduce((sum, ticket) => sum + Number(ticket.estimated_amount), 0)),
        actual_amount: money(actualSpend)
      },
      allocation_summary: this.allocationSummary(activeMembers)
    };
  }

  teamUtilizationSummary(actor: AuthUser, query: ProjectQuery) {
    if (!canSeeProjectPortfolio(actor) && !actor.roles.includes(Roles.Employee)) {
      throw forbidden("No utilization scope is available for this actor.");
    }
    const capacityHours = 40;
    const scopedUsers = this.scopedUsersForUtilization(actor, query);
    const employees = scopedUsers.map((user) => {
      const memberRows = this.store.projectMembers.filter(
        (member) =>
          !member.deleted_at &&
          member.employee_user_id === user.id &&
          member.status === ProjectMemberStatuses.Active &&
          rangesOverlap(member.start_date, member.end_date, query.date_from, query.date_to)
      );
      const projects = memberRows
        .map((member) => {
          const project = this.store.projects.find((candidate) => candidate.id === member.project_id && !candidate.deleted_at);
          if (!project || !this.canActorSee(actor, project)) return null;
          return {
            id: project.id,
            code: project.project_code,
            name: project.name,
            allocation_percent: member.allocation_percent,
            billable: member.billable
          };
        })
        .filter((project): project is NonNullable<typeof project> => Boolean(project));
      const allocationPercent = projects.reduce((sum, project) => sum + project.allocation_percent, 0);
      const submitted = this.store.workSegments
        .filter((segment) => segment.employee_user_id === user.id && !segment.deleted_at && dateInRange(segment.work_date, query.date_from, query.date_to))
        .reduce((sum, segment) => sum + hours(segment.hours), 0);
      const billable = this.store.workSegments
        .filter((segment) => segment.employee_user_id === user.id && segment.billable && !segment.deleted_at && dateInRange(segment.work_date, query.date_from, query.date_to))
        .reduce((sum, segment) => sum + hours(segment.hours), 0);
      const status = allocationPercent === 0
        ? "bench"
        : allocationPercent < 50
          ? "underutilized"
          : allocationPercent > 100
            ? "overloaded"
            : "healthy";
      return {
        user: userRef(user),
        department: this.departmentFor(user.department_id),
        designation: this.designationFor(user.designation_id),
        available_hours: capacityHours,
        allocated_hours: (allocationPercent / 100) * capacityHours,
        submitted_hours: submitted,
        billable_hours: billable,
        non_billable_hours: Math.max(0, submitted - billable),
        utilization_percent: allocationPercent,
        status,
        projects
      };
    });
    const totalCapacity = employees.length * capacityHours;
    const allocated = employees.reduce((sum, employee) => sum + employee.allocated_hours, 0);
    const submitted = employees.reduce((sum, employee) => sum + employee.submitted_hours, 0);
    const billable = employees.reduce((sum, employee) => sum + employee.billable_hours, 0);
    return {
      generated_at: nowIso(),
      scope: {
        actor: userRef(this.store.users.find((user) => user.id === actor.id)),
        date_from: query.date_from ?? null,
        date_to: query.date_to ?? null,
        department_id: query.department_id ?? null,
        manager_user_id: query.manager_user_id ?? null,
        group_by: query.group_by ?? "department"
      },
      cards: [
        { key: "total_capacity_hours", label: "Total capacity", value: totalCapacity, tone: "primary" },
        { key: "allocated_hours", label: "Allocated", value: Number(allocated.toFixed(2)), tone: "info" },
        { key: "submitted_hours", label: "Submitted", value: Number(submitted.toFixed(2)), tone: "success" },
        { key: "average_utilization_percent", label: "Average utilization", value: employees.length ? Math.round(employees.reduce((sum, employee) => sum + employee.utilization_percent, 0) / employees.length) : 0, tone: "primary" },
        { key: "bench_count", label: "Bench", value: employees.filter((employee) => employee.status === "bench").length, tone: "warning" },
        { key: "overloaded_count", label: "Overloaded", value: employees.filter((employee) => employee.status === "overloaded").length, tone: "destructive" }
      ],
      totals: {
        capacity_hours: totalCapacity,
        allocated_hours: Number(allocated.toFixed(2)),
        submitted_hours: Number(submitted.toFixed(2)),
        billable_hours: Number(billable.toFixed(2)),
        non_billable_hours: Number(Math.max(0, submitted - billable).toFixed(2)),
        bench_count: employees.filter((employee) => employee.status === "bench").length,
        overloaded_count: employees.filter((employee) => employee.status === "overloaded").length
      },
      series: this.utilizationSeries(employees, query.group_by ?? "department"),
      employees
    };
  }

  private presentProject(project: ProjectRecord, actor: AuthUser, includeDetails: boolean, include?: string) {
    const manager = this.store.users.find((user) => user.id === project.manager_user_id);
    const activeMembers = this.repository.listMembers(project.id, true);
    const allMembers = this.repository.listMembers(project.id);
    const milestones = this.repository.listMilestones(project.id);
    const documents = this.store.documents.filter((document) => document.business_object_type === "project" && document.business_object_id === project.id && !document.deleted_at);
    const segments = this.projectSegments(project);
    const actualHours = segments.reduce((sum, segment) => sum + hours(segment.hours), 0);
    const actualHoursText = Math.max(actualHours, Number(project.actual_hours)).toFixed(2);
    const base = {
      id: project.id,
      project_code: project.project_code,
      code: project.project_code,
      name: project.name,
      client_name: project.client_name,
      client: project.client_name,
      project_type: project.project_type,
      type: project.project_type,
      billing_type: project.billing_type,
      billingType: project.billing_type,
      manager_user_id: project.manager_user_id,
      manager: userRef(manager),
      department: this.departmentFor(project.department_id),
      start_date: project.start_date,
      end_date: project.end_date,
      status: project.status,
      health: project.health,
      description: project.description,
      estimated_hours: project.estimated_hours,
      actual_hours: actualHoursText,
      estimated_budget: project.estimated_budget,
      actual_spend: project.actual_spend,
      tech_stack: project.tech_stack,
      priority: project.priority,
      cost_center: project.cost_center,
      version: project.version,
      created_at: project.created_at,
      updated_at: project.updated_at,
      counts: {
        active_members: activeMembers.length,
        total_members: allMembers.length,
        milestones: milestones.length,
        documents: documents.length
      },
      permissions: {
        can_edit: canMutateProject(actor, project),
        can_archive: project.manager_user_id === actor.id || actor.roles.includes(Roles.Admin)
      }
    };
    const includeAll = includeDetails || !include;
    const includeSet = new Set((include ?? "").split(",").map((item) => item.trim()).filter(Boolean));
    return {
      ...base,
      ...(includeAll || includeSet.has("members") ? { members: allMembers.map((member) => this.presentMember(member)) } : {}),
      ...(includeAll || includeSet.has("allocations") ? { allocations: this.repository.listAllocations(project.id).map((allocation) => this.presentAllocation(allocation)) } : {}),
      ...(includeAll || includeSet.has("milestones") ? { milestones: milestones.map((milestone) => this.presentMilestone(milestone)), modules: milestones.map((milestone) => this.presentMilestone(milestone)) } : {}),
      ...(includeAll || includeSet.has("documents") ? { documents: documents.map((document) => ({ id: document.id, name: document.file_name, category: document.document_type, size_bytes: document.size_bytes, uploaded_at: document.created_at })) } : {}),
      ...(includeAll || includeSet.has("summary") ? { summary: { allocation: this.allocationSummary(activeMembers), actual_hours: actualHoursText, budget_used_percent: Number(project.estimated_budget) ? Math.round((Number(project.actual_spend) / Number(project.estimated_budget)) * 100) : 0 } } : {})
    };
  }

  private presentMember(member: ProjectMemberRecord) {
    const user = this.store.users.find((candidate) => candidate.id === member.employee_user_id);
    const reportingLead = member.reporting_lead_user_id ? this.store.users.find((candidate) => candidate.id === member.reporting_lead_user_id) : null;
    return {
      id: member.id,
      project_id: member.project_id,
      user_id: member.employee_user_id,
      employee_user_id: member.employee_user_id,
      employee: userRef(user),
      name: user?.full_name ?? "Unknown employee",
      employee_code: user?.employee_code ?? "UNKNOWN",
      project_role: member.project_role,
      role: member.project_role,
      allocation_percent: member.allocation_percent,
      allocation: member.allocation_percent,
      billable: member.billable,
      start_date: member.start_date,
      end_date: member.end_date,
      reporting_lead: userRef(reportingLead),
      reporting_lead_user_id: member.reporting_lead_user_id,
      status: member.status,
      version: member.version
    };
  }

  private presentAllocation(allocation: ProjectAllocationRecord) {
    const user = this.store.users.find((candidate) => candidate.id === allocation.employee_user_id);
    return {
      id: allocation.id,
      project_id: allocation.project_id,
      user_id: allocation.employee_user_id,
      employee_user_id: allocation.employee_user_id,
      employee: userRef(user),
      date_from: allocation.date_from,
      date_to: allocation.date_to,
      allocation_percent: allocation.allocation_percent,
      billable: allocation.billable,
      notes: allocation.notes,
      version: allocation.version,
      created_at: allocation.created_at
    };
  }

  private presentMilestone(milestone: ProjectMilestoneRecord) {
    const owner = milestone.owner_user_id ? this.store.users.find((candidate) => candidate.id === milestone.owner_user_id) : null;
    return {
      id: milestone.id,
      project_id: milestone.project_id,
      name: milestone.name,
      owner_user_id: milestone.owner_user_id,
      owner: userRef(owner),
      lead: owner?.full_name ?? "Unassigned",
      status: milestone.status,
      start_date: milestone.start_date,
      due_date: milestone.due_date,
      end_date: milestone.due_date,
      priority: milestone.priority,
      version: milestone.version
    };
  }

  private canActorSee(actor: AuthUser, project: ProjectRecord): boolean {
    if (!this.isProjectInActorCompany(actor, project)) {
      return false;
    }
    const members = this.repository.listMembers(project.id);
    return this.store.users.length > 0 && (
      canSeeProjectPortfolio(actor) ||
      project.manager_user_id === actor.id ||
      members.some((member) => member.employee_user_id === actor.id && member.status === ProjectMemberStatuses.Active) ||
      members
        .map((member) => this.store.users.find((user) => user.id === member.employee_user_id))
        .filter((user): user is CoreUser => Boolean(user))
        .some((user) => user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`))
    );
  }

  private requireVisibleProject(actor: AuthUser, id: UUID): ProjectRecord {
    const project = this.repository.findProject(id);
    if (!this.canActorSee(actor, project)) {
      throw forbidden("Project access is limited to the active company and assigned project participants.");
    }
    return project;
  }

  private requireMutableProject(actor: AuthUser, id: UUID): ProjectRecord {
    const project = this.requireVisibleProject(actor, id);
    assertCanMutateProject(actor, project);
    return project;
  }

  private companyIdForUser(userId: UUID): UUID | null {
    return this.store.userSessionPreferences.find((preference) => preference.user_id === userId)?.company_id ?? null;
  }

  private isUserInActorCompany(actor: AuthUser, user: CoreUser): boolean {
    const actorCompanyId = this.companyIdForUser(actor.id);
    if (!actorCompanyId) {
      return true;
    }
    return user.id === actor.id || this.companyIdForUser(user.id) === actorCompanyId;
  }

  private isProjectInActorCompany(actor: AuthUser, project: ProjectRecord): boolean {
    const actorCompanyId = this.companyIdForUser(actor.id);
    if (!actorCompanyId) {
      return true;
    }
    if (this.companyIdForUser(project.manager_user_id) === actorCompanyId) {
      return true;
    }
    return this.repository
      .listMembers(project.id)
      .some((member) => !member.deleted_at && this.companyIdForUser(member.employee_user_id) === actorCompanyId);
  }

  private projectSegments(project: ProjectRecord, dateFrom?: string, dateTo?: string): WorkSegment[] {
    return this.store.workSegments.filter(
      (segment) =>
        !segment.deleted_at &&
        segment.project_code === project.project_code &&
        dateInRange(segment.work_date, dateFrom, dateTo)
    );
  }

  private allocationSummary(members: ProjectMemberRecord[]) {
    const total = members.reduce((sum, member) => sum + member.allocation_percent, 0);
    return {
      total_allocation_percent: total,
      average_allocation_percent: members.length ? Math.round(total / members.length) : 0,
      over_allocated_members: members.filter((member) => member.allocation_percent > 100).length,
      under_allocated_members: members.filter((member) => member.allocation_percent > 0 && member.allocation_percent < 50).length,
      bench_opportunity_members: members.filter((member) => member.allocation_percent < 50).length
    };
  }

  private capacityWarnings(userId: UUID) {
    const activeAllocations = this.store.projectMembers.filter(
      (member) => member.employee_user_id === userId && member.status === ProjectMemberStatuses.Active && !member.deleted_at
    );
    const total = activeAllocations.reduce((sum, member) => sum + member.allocation_percent, 0);
    return {
      total_allocation_percent: total,
      overloaded: total > 100,
      bench_opportunity: total < 50,
      message: total > 100 ? "Employee is allocated over 100% across active projects." : null
    };
  }

  private sortProjects(projects: ProjectRecord[], sort?: string): ProjectRecord[] {
    const sorted = [...projects];
    switch (sort) {
      case "name":
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case "updated_at":
        return sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      case "start_date":
        return sorted.sort((a, b) => b.start_date.localeCompare(a.start_date));
      default:
        return sorted;
    }
  }

  private scopedUsersForUtilization(actor: AuthUser, query: ProjectQuery): CoreUser[] {
    return this.store.users.filter((user) => {
      if (user.deleted_at || user.employment_status !== EmploymentStatuses.Active) return false;
      if (!this.isUserInActorCompany(actor, user)) return false;
      if (query.department_id && user.department_id !== query.department_id) return false;
      if (query.manager_user_id && user.manager_user_id !== query.manager_user_id) return false;
      if (canSeeProjectPortfolio(actor)) return true;
      if (user.id === actor.id) return true;
      return user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
    });
  }

  private utilizationSeries(
    employees: Array<{ department: ReturnType<ProjectsService["departmentFor"]>; utilization_percent: number }>,
    groupBy: "department" | "manager"
  ) {
    const grouped = new Map<string, { total: number; count: number }>();
    for (const employee of employees) {
      const key = groupBy === "department" ? employee.department?.name ?? "Unassigned" : "Managers";
      const current = grouped.get(key) ?? { total: 0, count: 0 };
      current.total += employee.utilization_percent;
      current.count += 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.entries()).map(([label, value]) => ({
      label,
      utilization_percent: value.count ? Math.round(value.total / value.count) : 0,
      employee_count: value.count
    }));
  }

  private requireActiveUser(actor: AuthUser, id: UUID): CoreUser {
    const user = this.store.users.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!user) {
      throw notFound("User not found", { id });
    }
    if (user.employment_status !== EmploymentStatuses.Active) {
      throw conflict("Project users must be active employees.", { user_id: id, status: user.employment_status });
    }
    if (!this.isUserInActorCompany(actor, user)) {
      throw forbidden("Project users must belong to the active company.");
    }
    return user;
  }

  private requireDepartment(id: UUID) {
    const department = this.store.departments.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!department) {
      throw notFound("Department not found", { id });
    }
    return department;
  }

  private departmentFor(id: UUID | null) {
    const department = id ? this.store.departments.find((candidate) => candidate.id === id) : undefined;
    return department
      ? { id: department.id, department_code: department.department_code, name: department.name }
      : null;
  }

  private designationFor(id: UUID | null) {
    const designation = id ? this.store.designations.find((candidate) => candidate.id === id) : undefined;
    return designation
      ? { id: designation.id, designation_code: designation.designation_code, title: designation.title, level: designation.level }
      : null;
  }

  private assertProjectVersion(project: ProjectRecord, expectedVersion: number): void {
    if (project.version !== expectedVersion) {
      throw conflict("Project was modified by another actor.", { aggregate: "project", id: project.id });
    }
  }

  private bumpProject(project: ProjectRecord): void {
    project.version += 1;
    project.updated_at = nowIso();
  }
}
