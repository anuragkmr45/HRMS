import { randomUUID } from "node:crypto";
import type { AuthUser, CoreUser, ProjectRecord, TimesheetSubmission, UUID } from "#shared";
import { addMoney, EmploymentStatuses, ProjectMemberStatuses, ProjectStatuses, Roles, TimesheetStatuses } from "#shared";
import type { MemoryDataStore, WorkSegment } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, missingRemarks } from "../../platform/errors.js";
import { workdaysInclusive } from "../../platform/work-schedule.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { CoreService } from "../core/service.js";
import { timesheetEvents } from "./events.js";
import {
  assertCanUseSelfTimesheet,
  assertCurrentApprover,
  assertTimesheetOwner
} from "./policy.js";
import { TimesheetRepository } from "./repository.js";
import { assertTimesheetTransition } from "./state-machine.js";

export interface TimesheetQueueQuery {
  page: number;
  page_size: number;
  sort?: string;
  status?: string;
  employee_user_id?: UUID;
  cycle_start?: string;
  cycle_end?: string;
  project_code?: string;
  billable?: boolean;
}

export interface TimesheetAnalyticsQuery {
  page: number;
  page_size: number;
  date_from?: string;
  date_to?: string;
  cycle_start?: string;
  cycle_end?: string;
  project_id?: UUID;
  project_code?: string;
  user_id?: UUID;
  group_by?: "employee" | "project" | "department" | "week";
}

export interface TimesheetSelectorsQuery {
  include?: string;
  date?: string;
}

type TimesheetActionRecord = MemoryDataStore["timesheetActions"][number];

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function toFixedHours(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function decimal(value: string | null | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function dateUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function daysInclusive(start: string, end: string): number {
  const from = dateUtc(start);
  const to = dateUtc(end);
  if (to < from) {
    return 0;
  }
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function numberConfig(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = config[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function weekStartForDate(value: string): string {
  const date = dateUtc(value);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function weekEndForStart(value: string): string {
  const date = dateUtc(value);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

export class TimesheetService {
  private readonly repository: TimesheetRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new TimesheetRepository(store);
    this.core = new CoreService(store);
  }

  createSegment(actor: AuthUser, input: { work_date: string; project_code?: string; task_code?: string; hours: string; description?: string; billable: boolean }) {
    assertCanUseSelfTimesheet(actor);
    assertTimesheetOwner(actor, actor.id);
    if (Number(input.hours) <= 0 || Number(input.hours) > 24) {
      throw badRequest("Work segment hours must be between 0 and 24");
    }
    return this.repository.addSegment({
      employee_user_id: actor.id,
      work_date: input.work_date,
      project_code: input.project_code ?? null,
      task_code: input.task_code ?? null,
      hours: input.hours,
      description: input.description ?? null,
      billable: input.billable
    });
  }

  listSegments(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertCanUseSelfTimesheet(actor);
    const items = this.store.workSegments.filter((segment) => segment.employee_user_id === actor.id && !segment.deleted_at);
    return page(items, pageNumber, pageSize);
  }

  submit(actor: AuthUser, input: { cycle_start: string; cycle_end: string }): TimesheetSubmission {
    assertCanUseSelfTimesheet(actor);
    if (input.cycle_end < input.cycle_start) {
      throw badRequest("Cycle end cannot be before cycle start");
    }
    const workflow = this.repository.activeWorkflow();
    const segments = this.repository.segmentsForCycle(actor.id, input.cycle_start, input.cycle_end);
    if (segments.length === 0) {
      throw badRequest("At least one work segment is required for submission");
    }
    const manager = this.core.resolveImmediateManager(actor.id);
    if (!manager) {
      throw badRequest("Unable to infer approver from Core hierarchy");
    }
    const now = nowIso();
    const submission: TimesheetSubmission = {
      id: randomUUID(),
      employee_user_id: actor.id,
      cycle_start: input.cycle_start,
      cycle_end: input.cycle_end,
      status: TimesheetStatuses.PendingApproval,
      total_hours: addMoney(segments.map((segment) => segment.hours)),
      workflow_definition_id: workflow.id,
      workflow_snapshot: {
        workflow_definition_id: workflow.id,
        workflow_version: workflow.version,
        approver_strategy: workflow.definition.approver_strategy,
        require_billable_review: workflow.definition.require_billable_review,
        approver_user_id: manager.id
      },
      current_approver_user_id: manager.id,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.repository.addSubmission(submission);
    this.store.timesheetActions.push({
      id: randomUUID(),
      submission_id: submission.id,
      actor_user_id: actor.id,
      decision: "submitted",
      remarks: null,
      created_at: now
    });
    appendOutboxEvent(this.store, {
      aggregateType: "timesheet_submission",
      aggregateId: submission.id,
      eventType: timesheetEvents.Submitted,
      payload: {
        submission_id: submission.id,
        employee_user_id: actor.id,
        approver_user_id: manager.id,
        status: submission.status,
        total_hours: submission.total_hours
      },
      idempotencyKey: `timesheet.submitted:${submission.id}`
    });
    return submission;
  }

  mySubmissions(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertCanUseSelfTimesheet(actor);
    return page(
      this.store.timesheetSubmissions
        .filter((submission) => submission.employee_user_id === actor.id && !submission.deleted_at)
        .map((submission) => this.presentSubmission(submission, actor)),
      pageNumber,
      pageSize
    );
  }

  approverQueue(actor: AuthUser, queryOrPage: TimesheetQueueQuery | number, maybePageSize?: number) {
    const query = typeof queryOrPage === "number"
      ? { page: queryOrPage, page_size: maybePageSize ?? 25 }
      : queryOrPage;
    const visible = this.store.timesheetSubmissions.filter((submission) => {
      if (submission.deleted_at) {
        return false;
      }
      if (!actor.roles.includes(Roles.Admin) && submission.current_approver_user_id !== actor.id) {
        return false;
      }
      if (!this.matchesQueueFilters(submission, query)) {
        return false;
      }
      if (!query.status && submission.status !== TimesheetStatuses.PendingApproval) {
        return false;
      }
      return true;
    });
    const sorted = this.sortQueue(visible, query.sort);
    const result = page(
      sorted.map((submission) => ({
        ...this.presentSubmission(submission, actor),
        queue_context: this.queueContext(submission, actor),
        decision_history: this.decisionHistory(submission.id),
        last_decision: this.lastDecision(submission.id)
      })),
      query.page,
      query.page_size
    );
    return {
      ...result,
      summary: {
        total_pending: visible.filter((submission) => submission.status === TimesheetStatuses.PendingApproval).length,
        total_returned: visible.filter((submission) => submission.status === TimesheetStatuses.Returned).length,
        total_rejected: visible.filter((submission) => submission.status === TimesheetStatuses.Rejected).length,
        admin_override_view: actor.roles.includes(Roles.Admin),
        filters_applied: this.appliedQueueFilters(query),
        sort: query.sort ?? "cycle_start"
      }
    };
  }

  submissionDetail(actor: AuthUser, id: UUID) {
    const submission = this.repository.findSubmission(id);
    this.assertCanSeeSubmission(actor, submission);
    const segments = this.segmentsForSubmission(submission).map((segment) => this.presentSegment(segment));
    return {
      ...this.presentSubmission(submission, actor),
      segments,
      workflow_history: this.decisionHistory(id),
      last_decision: this.lastDecision(id)
    };
  }

  projectSummary(actor: AuthUser, query: TimesheetAnalyticsQuery) {
    const visibleUserIds = this.visibleUserIds(actor);
    const selectedProjectCode = this.resolveProjectCode(query.project_id, query.project_code);
    const projects = this.visibleProjects(actor)
      .filter((project) => !selectedProjectCode || project.project_code === selectedProjectCode)
      .sort((left, right) => left.project_code.localeCompare(right.project_code));
    const items = projects.map((project) => {
      const members = this.store.projectMembers
        .filter(
          (member) =>
            member.project_id === project.id &&
            member.status !== ProjectMemberStatuses.Removed &&
            visibleUserIds.has(member.employee_user_id)
        )
        .map((member) => {
          const user = this.userFor(member.employee_user_id);
          const segments = this.filteredSegments(query).filter(
            (segment) => segment.project_code === project.project_code && segment.employee_user_id === member.employee_user_id
          );
          const submission = this.submissionForUserCycle(member.employee_user_id, this.cycleStart(query), this.cycleEnd(query));
          const total = addMoney(segments.map((segment) => segment.hours));
          const billable = addMoney(segments.filter((segment) => segment.billable).map((segment) => segment.hours));
          const nonBillable = addMoney(segments.filter((segment) => !segment.billable).map((segment) => segment.hours));
          return {
            id: member.id,
            user: this.userSummary(user),
            employee_user_id: member.employee_user_id,
            project_role: member.project_role,
            allocation_percent: member.allocation_percent,
            billable: member.billable,
            total_hours: total,
            billable_hours: billable,
            non_billable_hours: nonBillable,
            submitted: Boolean(submission && submission.status !== TimesheetStatuses.Draft),
            submission_id: submission?.id ?? null,
            submission_status: submission?.status ?? null,
            expected_hours: this.expectedHoursForCycle(query),
            missing_hours: toFixedHours(Math.max(0, decimal(this.expectedHoursForCycle(query)) - decimal(total)))
          };
        });
      const segments = this.filteredSegments(query).filter((segment) => segment.project_code === project.project_code);
      const total = addMoney(segments.map((segment) => segment.hours));
      const billable = addMoney(segments.filter((segment) => segment.billable).map((segment) => segment.hours));
      return {
        project: this.projectSummaryRef(project),
        cycle: { start: this.cycleStart(query), end: this.cycleEnd(query) },
        members,
        totals: {
          member_count: members.length,
          submitted_count: members.filter((member) => member.submitted).length,
          missing_count: members.filter((member) => !member.submitted).length,
          total_hours: total,
          billable_hours: billable,
          non_billable_hours: toFixedHours(decimal(total) - decimal(billable))
        }
      };
    });
    const result = page(items, query.page, query.page_size);
    return {
      ...result,
      totals: {
        projects: items.length,
        total_hours: addMoney(items.map((item) => item.totals.total_hours)),
        billable_hours: addMoney(items.map((item) => item.totals.billable_hours)),
        missing_submissions: items.reduce((sum, item) => sum + item.totals.missing_count, 0)
      }
    };
  }

  missingSubmissions(actor: AuthUser, query: TimesheetAnalyticsQuery) {
    const visibleUserIds = this.visibleUserIds(actor);
    const users = this.store.users
      .filter((user) => visibleUserIds.has(user.id) && !user.deleted_at && user.employment_status === EmploymentStatuses.Active)
      .filter((user) => !query.user_id || user.id === query.user_id)
      .sort((left, right) => left.employee_code.localeCompare(right.employee_code));
    const cycleStart = this.cycleStart(query);
    const cycleEnd = this.cycleEnd(query);
    const expectedHours = this.expectedHoursForCycle(query);
    const items = users
      .map((user) => {
        const segments = this.filteredSegments({ ...query, user_id: user.id, cycle_start: cycleStart, cycle_end: cycleEnd });
        const submittedHours = addMoney(segments.map((segment) => segment.hours));
        const submission = this.submissionForUserCycle(user.id, cycleStart, cycleEnd);
        const missingHours = toFixedHours(Math.max(0, decimal(expectedHours) - decimal(submittedHours)));
        return {
          id: submission?.id ?? `missing:${user.id}:${cycleStart}`,
          user: this.userSummary(user),
          employee_user_id: user.id,
          manager: user.manager_user_id ? this.userSummary(this.userFor(user.manager_user_id)) : null,
          cycle: { start: cycleStart, end: cycleEnd, expected_hours: expectedHours },
          submitted_hours: submittedHours,
          missing_hours: missingHours,
          status: submission ? (decimal(missingHours) > 0 ? "under_submitted" : "submitted") : "missing",
          submission_id: submission?.id ?? null,
          submission_status: submission?.status ?? null,
          reminder_state: {
            can_send_reminder: actor.id !== user.id,
            reminder_count: 0,
            last_reminded_at: null
          }
        };
      })
      .filter((item) => item.status !== "submitted");
    return {
      ...page(items, query.page, query.page_size),
      summary: {
        cycle_start: cycleStart,
        cycle_end: cycleEnd,
        expected_hours: expectedHours,
        missing_count: items.filter((item) => item.status === "missing").length,
        under_submitted_count: items.filter((item) => item.status === "under_submitted").length
      }
    };
  }

  productivitySummary(actor: AuthUser, query: TimesheetAnalyticsQuery) {
    const segments = this.filteredSegments(query).filter((segment) => this.visibleUserIds(actor).has(segment.employee_user_id));
    const submissions = this.visibleSubmissions(actor, query);
    const total = addMoney(segments.map((segment) => segment.hours));
    const billable = addMoney(segments.filter((segment) => segment.billable).map((segment) => segment.hours));
    const nonBillable = toFixedHours(decimal(total) - decimal(billable));
    const approved = submissions.filter((submission) => submission.status === TimesheetStatuses.Approved).length;
    const returned = submissions.filter((submission) => submission.status === TimesheetStatuses.Returned).length;
    const rejected = submissions.filter((submission) => submission.status === TimesheetStatuses.Rejected).length;
    const grouped = this.groupProductivity(segments, query.group_by ?? "employee");
    return {
      cards: {
        total_hours: total,
        billable_hours: billable,
        non_billable_hours: nonBillable,
        billable_percent: decimal(total) > 0 ? Math.round((decimal(billable) / decimal(total)) * 100) : 0,
        submission_count: submissions.length,
        approved_count: approved,
        returned_count: returned,
        rejected_count: rejected
      },
      series: this.productivitySeries(segments),
      breakdown: grouped,
      filters: {
        date_from: this.dateFrom(query),
        date_to: this.dateTo(query),
        project_code: this.resolveProjectCode(query.project_id, query.project_code),
        user_id: query.user_id ?? null,
        group_by: query.group_by ?? "employee"
      }
    };
  }

  selectors(actor: AuthUser, query: TimesheetSelectorsQuery) {
    const visibleUserIds = this.visibleUserIds(actor);
    const projects = this.visibleProjects(actor)
      .filter((project) => new Set<string>([ProjectStatuses.Planned, ProjectStatuses.Active, ProjectStatuses.OnHold]).has(project.status))
      .map((project) => ({
        id: project.id,
        project_code: project.project_code,
        code: project.project_code,
        name: project.name,
        client_name: project.client_name,
        manager: this.userSummary(this.userFor(project.manager_user_id)),
        members: this.store.projectMembers
          .filter((member) => member.project_id === project.id && visibleUserIds.has(member.employee_user_id) && member.status !== ProjectMemberStatuses.Removed)
          .map((member) => ({
            id: member.id,
            employee_user_id: member.employee_user_id,
            user: this.userSummary(this.userFor(member.employee_user_id)),
            project_role: member.project_role,
            allocation_percent: member.allocation_percent,
            billable: member.billable
          }))
      }));
    const projectCodes = new Set(projects.map((project) => project.project_code));
    const tasks = unique([
      ...this.store.projectMilestones
        .filter((milestone) => projects.some((project) => project.id === milestone.project_id))
        .map((milestone) => milestone.name),
      ...this.store.workSegments
        .filter((segment) => !segment.deleted_at && (!segment.project_code || projectCodes.has(segment.project_code)))
        .map((segment) => segment.task_code)
    ]).map((task) => ({ task_code: task, name: task }));
    const cycles = unique([
      ...this.store.timesheetSubmissions.map((submission) => submission.cycle_start),
      weekStartForDate(query.date ?? nowIso().slice(0, 10))
    ]).map((start) => ({ cycle_start: start, cycle_end: weekEndForStart(start), expected_hours: toFixedHours(workdaysInclusive(start, weekEndForStart(start), this.workingWeek(), this.holidayDates()) * this.dailyTimesheetHours()) }));
    const me = this.userFor(actor.id);
    const manager = me?.manager_user_id ? this.userFor(me.manager_user_id) : null;
    const admins = this.store.users.filter((user) => user.roles.includes(Roles.Admin) && !user.deleted_at);
    return {
      projects,
      tasks,
      cycles,
      approvers: [manager, ...admins].filter((user): user is CoreUser => Boolean(user)).map((user) => this.userSummary(user)),
      workflow_definitions: this.store.workflowDefinitions,
      rules: {
        default_billable: true,
        max_daily_hours: 24,
        min_daily_hours: this.minDailyTimesheetHours(),
        target_weekly_hours: this.weeklyTimesheetHours(),
        submit_by: this.submitBy(),
        lock_after_approval: this.lockAfterApproval(),
        working_week: this.workingWeek(),
        holiday_dates: [...this.holidayDates()].sort(),
        daily_hours: this.dailyTimesheetHours(),
        active_workflow_id: this.repository.activeWorkflow().id
      },
      include: query.include ? query.include.split(",").map((item) => item.trim()).filter(Boolean) : []
    };
  }

  decide(actor: AuthUser, id: UUID, decision: "approve" | "reject" | "return", remarks: string | undefined, expectedVersion: number) {
    const current = this.repository.findSubmission(id);
    if (current.version !== expectedVersion) {
      throw conflict("Timesheet submission was modified by another actor.", {
        aggregate: "timesheet_submission",
        id
      });
    }
    assertCurrentApprover(actor, current);
    const normalizedRemarks = remarks?.trim();
    if (["reject", "return"].includes(decision) && !normalizedRemarks) {
      throw missingRemarks(decision);
    }
    const nextStatus =
      decision === "approve"
        ? TimesheetStatuses.Approved
        : decision === "reject"
          ? TimesheetStatuses.Rejected
          : TimesheetStatuses.Returned;
    const previousStatus = current.status;
    assertTimesheetTransition(previousStatus, nextStatus);
    const submission = this.repository.updateVersioned(id, expectedVersion, (candidate) => {
      candidate.status = nextStatus;
      candidate.current_approver_user_id = null;
    });
    const action: TimesheetActionRecord = {
      id: randomUUID(),
      submission_id: id,
      actor_user_id: actor.id,
      decision,
      remarks: normalizedRemarks ?? null,
      created_at: nowIso()
    };
    this.store.timesheetActions.push(action);
    appendOutboxEvent(this.store, {
      aggregateType: "timesheet_submission",
      aggregateId: id,
      eventType: this.eventForDecision(decision),
      payload: {
        submission_id: id,
        actor_user_id: actor.id,
        decision,
        previous_status: previousStatus,
        next_status: nextStatus,
        version: submission.version
      },
      idempotencyKey: `timesheet.${decision}:${id}:${action.id}`
    });
    return {
      ...this.presentSubmission(submission, actor),
      previous_status: previousStatus,
      next_status: nextStatus,
      decision,
      audit_event: this.presentAction(action),
      workflow_history: this.decisionHistory(id)
    };
  }

  workflows(pageNumber: number, pageSize: number) {
    return page(this.store.workflowDefinitions, pageNumber, pageSize);
  }

  upsertWorkflow(actor: AuthUser, input: { name: string; definition: { approver_strategy: "ltree_manager" | "project_manager" | "hr_manager"; require_billable_review: boolean } }) {
    const now = nowIso();
    const workflow = {
      id: randomUUID(),
      name: input.name,
      module: "timesheets" as const,
      definition: input.definition,
      version: 1,
      status: "active" as const,
      created_at: now,
      updated_at: now
    };
    for (const existing of this.store.workflowDefinitions) {
      existing.status = "inactive";
      existing.updated_at = now;
    }
    this.store.workflowDefinitions.push(workflow);
    this.store.timesheetActions.push({
      id: randomUUID(),
      submission_id: workflow.id,
      actor_user_id: actor.id,
      decision: "workflow_definition_created",
      remarks: null,
      created_at: now
    });
    return workflow;
  }

  private matchesQueueFilters(submission: TimesheetSubmission, query: TimesheetQueueQuery): boolean {
    if (query.status && submission.status !== query.status) {
      return false;
    }
    if (query.employee_user_id && submission.employee_user_id !== query.employee_user_id) {
      return false;
    }
    if (query.cycle_start && submission.cycle_start < query.cycle_start) {
      return false;
    }
    if (query.cycle_end && submission.cycle_end > query.cycle_end) {
      return false;
    }
    const segments = this.segmentsForSubmission(submission);
    if (query.project_code && !segments.some((segment) => segment.project_code === query.project_code)) {
      return false;
    }
    if (query.billable !== undefined && !segments.some((segment) => segment.billable === query.billable)) {
      return false;
    }
    return true;
  }

  private sortQueue(submissions: TimesheetSubmission[], sort = "cycle_start"): TimesheetSubmission[] {
    const descending = sort.startsWith("-");
    const key = descending ? sort.slice(1) : sort;
    const allowed = new Set(["cycle_start", "cycle_end", "created_at", "updated_at", "status", "employee_code", "total_hours", "submitted_hours", "expected_hours"]);
    const sortKey = allowed.has(key) ? key : "cycle_start";
    return [...submissions].sort((left, right) => {
      const leftValue = this.valueForSort(left, sortKey);
      const rightValue = this.valueForSort(right, sortKey);
      const compared = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return descending ? -compared : compared;
    });
  }

  private valueForSort(submission: TimesheetSubmission, key: string): string | number {
    if (key === "employee_code") {
      return this.userFor(submission.employee_user_id)?.employee_code ?? "";
    }
    if (key === "total_hours" || key === "submitted_hours") {
      return decimal(submission.total_hours);
    }
    if (key === "expected_hours") {
      return decimal(this.expectedHours(submission));
    }
    return String(submission[key as keyof TimesheetSubmission] ?? "");
  }

  private presentSubmission(submission: TimesheetSubmission, actor: AuthUser) {
    const segments = this.segmentsForSubmission(submission);
    const employee = this.userFor(submission.employee_user_id);
    const approver = submission.current_approver_user_id ? this.userFor(submission.current_approver_user_id) : null;
    const expectedHours = this.expectedHours(submission);
    const billableHours = addMoney(segments.filter((segment) => segment.billable).map((segment) => segment.hours));
    const nonBillableHours = addMoney(segments.filter((segment) => !segment.billable).map((segment) => segment.hours));
    return {
      ...submission,
      employee: this.userSummary(employee),
      member: {
        ...this.userSummary(employee),
        member_role: "Employee",
        manager: employee?.manager_user_id ? this.userSummary(this.userFor(employee.manager_user_id)) : null
      },
      cycle: {
        start: submission.cycle_start,
        end: submission.cycle_end,
        total_days: daysInclusive(submission.cycle_start, submission.cycle_end),
        expected_work_days: workdaysInclusive(submission.cycle_start, submission.cycle_end, this.workingWeek(), this.holidayDates())
      },
      project_summary: this.submissionProjectSummary(segments),
      hours_summary: {
        submitted_hours: submission.total_hours,
        expected_hours: expectedHours,
        missing_hours: toFixedHours(Math.max(0, decimal(expectedHours) - decimal(submission.total_hours))),
        variance_hours: toFixedHours(decimal(submission.total_hours) - decimal(expectedHours)),
        billable_hours: billableHours,
        non_billable_hours: nonBillableHours,
        segment_count: segments.length
      },
      workflow_metadata: {
        workflow_definition_id: submission.workflow_definition_id,
        workflow_snapshot: submission.workflow_snapshot,
        current_approver: this.userSummary(approver),
        can_actor_decide: this.canActorDecide(actor, submission),
        expected_version: submission.version,
        allowed_decisions: submission.status === TimesheetStatuses.PendingApproval ? ["approve", "return", "reject"] : [],
        remarks_required_for: ["return", "reject"]
      }
    };
  }

  private presentSegment(segment: WorkSegment) {
    const employee = this.userFor(segment.employee_user_id);
    const project = segment.project_code
      ? this.store.projects.find((candidate) => candidate.project_code === segment.project_code && !candidate.deleted_at)
      : null;
    return {
      ...segment,
      employee: this.userSummary(employee),
      project: project ? this.projectSummaryRef(project) : null,
      project_name: project?.name ?? segment.project_code,
      week_start: weekStartForDate(segment.work_date)
    };
  }

  private queueContext(submission: TimesheetSubmission, actor: AuthUser) {
    const expectedHours = this.expectedHours(submission);
    return {
      action_required: this.canActorDecide(actor, submission),
      current_actor_is_admin_override: actor.roles.includes(Roles.Admin) && submission.current_approver_user_id !== actor.id,
      expected_version: submission.version,
      missing_submission_context: {
        expected_hours: expectedHours,
        submitted_hours: submission.total_hours,
        missing_hours: toFixedHours(Math.max(0, decimal(expectedHours) - decimal(submission.total_hours))),
        under_submitted: decimal(submission.total_hours) < decimal(expectedHours)
      }
    };
  }

  private submissionProjectSummary(segments: WorkSegment[]) {
    const projectCodes = unique(segments.map((segment) => segment.project_code));
    return {
      project_codes: projectCodes,
      task_codes: unique(segments.map((segment) => segment.task_code)),
      primary_project_code: projectCodes[0] ?? null,
      client_name: null,
      project_breakdown: projectCodes.map((projectCode) => {
        const scoped = segments.filter((segment) => segment.project_code === projectCode);
        return {
          project_code: projectCode,
          client_name: null,
          task_codes: unique(scoped.map((segment) => segment.task_code)),
          segment_count: scoped.length,
          hours: addMoney(scoped.map((segment) => segment.hours)),
          billable_hours: addMoney(scoped.filter((segment) => segment.billable).map((segment) => segment.hours)),
          non_billable_hours: addMoney(scoped.filter((segment) => !segment.billable).map((segment) => segment.hours))
        };
      })
    };
  }

  private projectSummaryRef(project: ProjectRecord) {
    return {
      id: project.id,
      project_code: project.project_code,
      code: project.project_code,
      name: project.name,
      client_name: project.client_name,
      status: project.status,
      manager_user_id: project.manager_user_id,
      manager: this.userSummary(this.userFor(project.manager_user_id))
    };
  }

  private segmentsForSubmission(submission: TimesheetSubmission): WorkSegment[] {
    return this.store.workSegments.filter(
      (segment) =>
        segment.employee_user_id === submission.employee_user_id &&
        !segment.deleted_at &&
        segment.work_date >= submission.cycle_start &&
        segment.work_date <= submission.cycle_end
    );
  }

  private filteredSegments(query: Partial<TimesheetAnalyticsQuery>): WorkSegment[] {
    const from = this.dateFrom(query);
    const to = this.dateTo(query);
    const projectCode = this.resolveProjectCode(query.project_id, query.project_code);
    return this.store.workSegments.filter((segment) => {
      if (segment.deleted_at) return false;
      if (segment.work_date < from || segment.work_date > to) return false;
      if (query.user_id && segment.employee_user_id !== query.user_id) return false;
      if (projectCode && segment.project_code !== projectCode) return false;
      return true;
    });
  }

  private visibleSubmissions(actor: AuthUser, query: Partial<TimesheetAnalyticsQuery>): TimesheetSubmission[] {
    const visibleUserIds = this.visibleUserIds(actor);
    const from = this.cycleStart(query);
    const to = this.cycleEnd(query);
    return this.store.timesheetSubmissions.filter((submission) => {
      if (submission.deleted_at) return false;
      if (!visibleUserIds.has(submission.employee_user_id)) return false;
      if (query.user_id && submission.employee_user_id !== query.user_id) return false;
      if (submission.cycle_end < from || submission.cycle_start > to) return false;
      const projectCode = this.resolveProjectCode(query.project_id, query.project_code);
      if (projectCode && !this.segmentsForSubmission(submission).some((segment) => segment.project_code === projectCode)) return false;
      return true;
    });
  }

  private submissionForUserCycle(userId: UUID, cycleStart: string, cycleEnd: string): TimesheetSubmission | null {
    return this.store.timesheetSubmissions.find(
      (submission) =>
        submission.employee_user_id === userId &&
        submission.cycle_start === cycleStart &&
        submission.cycle_end === cycleEnd &&
        !submission.deleted_at
    ) ?? null;
  }

  private visibleProjects(actor: AuthUser): ProjectRecord[] {
    return this.store.projects.filter((project) => {
      if (project.deleted_at) return false;
      if (this.isPrivileged(actor)) return true;
      if (project.manager_user_id === actor.id) return true;
      return this.store.projectMembers.some(
        (member) => member.project_id === project.id && member.employee_user_id === actor.id && member.status !== ProjectMemberStatuses.Removed
      );
    });
  }

  private visibleUserIds(actor: AuthUser): Set<UUID> {
    if (this.isPrivileged(actor)) {
      return new Set(this.store.users.filter((user) => !user.deleted_at).map((user) => user.id));
    }
    const ids = new Set<UUID>([actor.id]);
    for (const user of this.store.users) {
      if (!user.deleted_at && user.manager_user_id === actor.id) {
        ids.add(user.id);
      }
    }
    for (const project of this.store.projects) {
      if (project.deleted_at || project.manager_user_id !== actor.id) continue;
      for (const member of this.store.projectMembers) {
        if (member.project_id === project.id && member.status !== ProjectMemberStatuses.Removed) {
          ids.add(member.employee_user_id);
        }
      }
    }
    return ids;
  }

  private assertCanSeeSubmission(actor: AuthUser, submission: TimesheetSubmission): void {
    if (submission.current_approver_user_id === actor.id || this.visibleUserIds(actor).has(submission.employee_user_id)) {
      return;
    }
    throw forbidden("Timesheet submission is outside the actor's scope.");
  }

  private isPrivileged(actor: AuthUser): boolean {
    return actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.HRManager) || actor.roles.includes(Roles.Auditor);
  }

  private activeCompany() {
    return this.store.companyProfiles.find((candidate) => candidate.status === "active") ?? this.store.companyProfiles[0];
  }

  private timesheetPolicy(): Record<string, unknown> {
    return this.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "timesheet" && candidate.status === "active" && !candidate.deleted_at
    )?.config ?? {};
  }

  private workingWeek(): string {
    return this.activeCompany()?.working_week ?? "Mon-Fri";
  }

  private dailyTimesheetHours(): number {
    return Math.max(0, this.activeCompany()?.work_hours_per_day ?? 8);
  }

  private minDailyTimesheetHours(): number {
    return numberConfig(this.timesheetPolicy(), "minDailyHours", 6);
  }

  private submitBy(): string {
    const value = this.timesheetPolicy().submitBy;
    return typeof value === "string" && value.trim() ? value.trim() : "Monday 11:00 AM";
  }

  private lockAfterApproval(): boolean {
    const value = this.timesheetPolicy().lockAfterApproval;
    return typeof value === "boolean" ? value : true;
  }

  private holidayDates(): Set<string> {
    return new Set(
      this.store.holidays
        .filter((holiday) => !holiday.optional && !holiday.deleted_at)
        .map((holiday) => holiday.holiday_date)
    );
  }

  private weeklyTimesheetHours(): number {
    const start = weekStartForDate(nowIso().slice(0, 10));
    return numberConfig(
      this.timesheetPolicy(),
      "weeklyHours",
      workdaysInclusive(start, weekEndForStart(start), this.workingWeek(), this.holidayDates()) * this.dailyTimesheetHours()
    );
  }

  private dateFrom(query: Partial<TimesheetAnalyticsQuery>): string {
    return query.date_from ?? query.cycle_start ?? weekStartForDate(nowIso().slice(0, 10));
  }

  private dateTo(query: Partial<TimesheetAnalyticsQuery>): string {
    return query.date_to ?? query.cycle_end ?? weekEndForStart(this.dateFrom(query));
  }

  private cycleStart(query: Partial<TimesheetAnalyticsQuery>): string {
    return query.cycle_start ?? query.date_from ?? weekStartForDate(nowIso().slice(0, 10));
  }

  private cycleEnd(query: Partial<TimesheetAnalyticsQuery>): string {
    return query.cycle_end ?? query.date_to ?? weekEndForStart(this.cycleStart(query));
  }

  private expectedHoursForCycle(query: Partial<TimesheetAnalyticsQuery>): string {
    return toFixedHours(workdaysInclusive(this.cycleStart(query), this.cycleEnd(query), this.workingWeek(), this.holidayDates()) * this.dailyTimesheetHours());
  }

  private resolveProjectCode(projectId?: UUID, projectCode?: string): string | undefined {
    if (projectCode) return projectCode;
    if (!projectId) return undefined;
    return this.store.projects.find((project) => project.id === projectId && !project.deleted_at)?.project_code;
  }

  private groupProductivity(segments: WorkSegment[], groupBy: "employee" | "project" | "department" | "week") {
    const grouped = new Map<string, { label: string; total: number; billable: number; nonBillable: number; meta: Record<string, unknown> }>();
    for (const segment of segments) {
      const user = this.userFor(segment.employee_user_id);
      const department = user?.department_id ? this.store.departments.find((candidate) => candidate.id === user.department_id) : null;
      const project = segment.project_code ? this.store.projects.find((candidate) => candidate.project_code === segment.project_code && !candidate.deleted_at) : null;
      const key =
        groupBy === "project"
          ? (segment.project_code ?? "unassigned")
          : groupBy === "department"
            ? (department?.id ?? "unassigned")
            : groupBy === "week"
              ? weekStartForDate(segment.work_date)
              : segment.employee_user_id;
      const label =
        groupBy === "project"
          ? `${segment.project_code ?? "Unassigned"}${project ? ` - ${project.name}` : ""}`
          : groupBy === "department"
            ? (department?.name ?? "Unassigned")
            : groupBy === "week"
              ? `Week of ${weekStartForDate(segment.work_date)}`
              : (user?.full_name ?? segment.employee_user_id);
      const current = grouped.get(key) ?? { label, total: 0, billable: 0, nonBillable: 0, meta: {} };
      current.total += decimal(segment.hours);
      if (segment.billable) current.billable += decimal(segment.hours);
      else current.nonBillable += decimal(segment.hours);
      current.meta = { group_by: groupBy, key };
      grouped.set(key, current);
    }
    return Array.from(grouped.entries()).map(([id, item]) => ({
      id,
      label: item.label,
      total_hours: toFixedHours(item.total),
      billable_hours: toFixedHours(item.billable),
      non_billable_hours: toFixedHours(item.nonBillable),
      billable_percent: item.total > 0 ? Math.round((item.billable / item.total) * 100) : 0,
      ...item.meta
    }));
  }

  private productivitySeries(segments: WorkSegment[]) {
    const byDate = new Map<string, { total: number; billable: number; nonBillable: number }>();
    for (const segment of segments) {
      const current = byDate.get(segment.work_date) ?? { total: 0, billable: 0, nonBillable: 0 };
      current.total += decimal(segment.hours);
      if (segment.billable) current.billable += decimal(segment.hours);
      else current.nonBillable += decimal(segment.hours);
      byDate.set(segment.work_date, current);
    }
    return Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dateValue, item]) => ({
        date: dateValue,
        total_hours: toFixedHours(item.total),
        billable_hours: toFixedHours(item.billable),
        non_billable_hours: toFixedHours(item.nonBillable)
      }));
  }

  private decisionHistory(submissionId: UUID) {
    return this.actionsForSubmission(submissionId).map((action) => this.presentAction(action));
  }

  private lastDecision(submissionId: UUID) {
    const actions = this.actionsForSubmission(submissionId);
    const action = actions.at(-1);
    return action ? this.presentAction(action) : null;
  }

  private actionsForSubmission(submissionId: UUID): TimesheetActionRecord[] {
    return this.store.timesheetActions
      .filter((action) => action.submission_id === submissionId)
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  }

  private presentAction(action: TimesheetActionRecord) {
    const actor = this.userFor(action.actor_user_id);
    return {
      id: action.id,
      submission_id: action.submission_id,
      actor_user_id: action.actor_user_id,
      actor_label: actor ? `${actor.employee_code} - ${actor.full_name}` : action.actor_user_id,
      actor: this.userSummary(actor),
      decision: action.decision,
      remarks: action.remarks,
      created_at: action.created_at
    };
  }

  private userFor(userId: UUID): CoreUser | null {
    return this.store.users.find((user) => user.id === userId && !user.deleted_at) ?? null;
  }

  private userSummary(user: CoreUser | null | undefined) {
    if (!user) {
      return null;
    }
    const department = this.store.departments.find((candidate) => candidate.id === user.department_id && !candidate.deleted_at) ?? null;
    const designation = this.store.designations.find((candidate) => candidate.id === user.designation_id && !candidate.deleted_at) ?? null;
    return {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      email: user.email,
      department_id: user.department_id,
      department: department ? { id: department.id, department_code: department.department_code, name: department.name } : null,
      designation_id: user.designation_id,
      designation: designation ? { id: designation.id, designation_code: designation.designation_code, title: designation.title } : null,
      roles: user.roles
    };
  }

  private expectedHours(submission: TimesheetSubmission): string {
    return toFixedHours(workdaysInclusive(submission.cycle_start, submission.cycle_end, this.workingWeek(), this.holidayDates()) * this.dailyTimesheetHours());
  }

  private canActorDecide(actor: AuthUser, submission: TimesheetSubmission): boolean {
    return submission.status === TimesheetStatuses.PendingApproval &&
      (submission.current_approver_user_id === actor.id || actor.roles.includes(Roles.Admin));
  }

  private appliedQueueFilters(query: TimesheetQueueQuery): string[] {
    return [
      query.status ? "status" : null,
      query.employee_user_id ? "employee_user_id" : null,
      query.cycle_start ? "cycle_start" : null,
      query.cycle_end ? "cycle_end" : null,
      query.project_code ? "project_code" : null,
      query.billable !== undefined ? "billable" : null
    ].filter((value): value is string => Boolean(value));
  }

  private eventForDecision(decision: "approve" | "reject" | "return"): string {
    if (decision === "approve") {
      return timesheetEvents.Approved;
    }
    if (decision === "reject") {
      return timesheetEvents.Rejected;
    }
    return timesheetEvents.Returned;
  }
}
