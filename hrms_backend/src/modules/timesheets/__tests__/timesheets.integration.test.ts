import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("timesheets", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  async function createSegment(token: string, payload: Record<string, unknown>) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/work-segments",
      headers: authHeader(token),
      payload
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  async function submitCycle(token: string, cycleStart: string, cycleEnd: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/submissions",
      headers: authHeader(token),
      payload: { cycle_start: cycleStart, cycle_end: cycleEnd }
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  it("blocks admin self-service timesheet entry while preserving approval oversight", async () => {
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");

    const adminSegment = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/work-segments",
      headers: authHeader(admin.token),
      payload: {
        work_date: "2026-05-04",
        project_code: "PRJ-100",
        task_code: "DEV",
        hours: "8.00",
        billable: true
      }
    });
    expect(adminSegment.statusCode).toBe(403);

    const adminSegments = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/work-segments?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(adminSegments.statusCode).toBe(403);

    const adminSubmission = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/submissions",
      headers: authHeader(admin.token),
      payload: { cycle_start: "2026-05-04", cycle_end: "2026-05-08" }
    });
    expect(adminSubmission.statusCode).toBe(403);

    await createSegment(employee.token, {
      work_date: "2026-05-04",
      project_code: "PRJ-100",
      task_code: "DEV",
      hours: "8.00",
      billable: true
    });
    await submitCycle(employee.token, "2026-05-04", "2026-05-08");

    const adminQueue = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/queue/approver?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(adminQueue.statusCode).toBe(200);
    expect(adminQueue.json().summary.admin_override_view).toBe(true);
  });

  it("returns approver queue metadata and decision audit/outbox details while preserving OCC", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const admin = await loginAs(app, "ADM");

    await createSegment(employee.token, {
      work_date: "2026-05-04",
      project_code: "PRJ-100",
      task_code: "DEV",
      hours: "8.00",
      billable: true
    });
    await createSegment(employee.token, {
      work_date: "2026-05-05",
      project_code: "PRJ-200",
      task_code: "QA",
      hours: "2.00",
      billable: false
    });

    const submit = await submitCycle(employee.token, "2026-05-04", "2026-05-08");
    expect(submit.workflow_snapshot.approver_user_id).toBe(manager.user.id);

    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/queue/approver?page=1&page_size=10&project_code=PRJ-100&billable=true&sort=employee_code",
      headers: authHeader(manager.token)
    });
    expect(queue.statusCode).toBe(200);
    const queueBody = queue.json();
    expect(queueBody.summary).toMatchObject({ total_pending: 1, admin_override_view: false, sort: "employee_code" });
    expect(queueBody.summary.filters_applied).toEqual(expect.arrayContaining(["project_code", "billable"]));
    expect(queueBody.items[0]).toMatchObject({
      id: submit.id,
      status: "Pending Approval",
      employee: { employee_code: "E1" },
      member: { employee_code: "E1", member_role: "Employee", manager: { employee_code: "D1" } }
    });
    expect(queueBody.items[0].project_summary.project_codes).toEqual(expect.arrayContaining(["PRJ-100", "PRJ-200"]));
    expect(queueBody.items[0].project_summary.project_breakdown).toHaveLength(2);
    expect(queueBody.items[0].hours_summary).toMatchObject({
      submitted_hours: "10.00",
      expected_hours: "40.00",
      missing_hours: "30.00",
      billable_hours: "8.00",
      non_billable_hours: "2.00",
      segment_count: 2
    });
    expect(queueBody.items[0].workflow_metadata).toMatchObject({
      can_actor_decide: true,
      expected_version: 1,
      allowed_decisions: ["approve", "return", "reject"],
      remarks_required_for: ["return", "reject"]
    });
    expect(queueBody.items[0].queue_context.missing_submission_context).toMatchObject({ under_submitted: true });
    expect(queueBody.items[0].decision_history.map((action: { decision: string }) => action.decision)).toEqual(["submitted"]);

    const adminQueue = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/queue/approver?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(adminQueue.statusCode).toBe(200);
    expect(adminQueue.json().summary.admin_override_view).toBe(true);
    expect(adminQueue.json().items[0].queue_context.current_actor_is_admin_override).toBe(true);

    const approve = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${submit.id}/approve`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      id: submit.id,
      status: "Approved",
      previous_status: "Pending Approval",
      next_status: "Approved",
      decision: "approve",
      version: 2,
      audit_event: { decision: "approve", remarks: null }
    });
    expect(approve.json().workflow_history.map((action: { decision: string }) => action.decision)).toEqual(["submitted", "approve"]);
    expect(approve.json().workflow_metadata.allowed_decisions).toEqual([]);
    expect(app.store.outbox.some((event) => event.event_type === "timesheet.approved" && event.aggregate_id === submit.id)).toBe(true);

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${submit.id}/approve`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(stale.statusCode).toBe(409);
  });

  it("enforces remarks, scoped approvers, return/reject decisions, filters, and admin queue status views", async () => {
    const employee = await loginAs(app, "E1");
    const employeeTwo = await loginAs(app, "E2");
    const manager = await loginAs(app, "D1");
    const admin = await loginAs(app, "ADM");

    await createSegment(employee.token, {
      work_date: "2026-05-11",
      project_code: "PRJ-RETURN",
      task_code: "DEV",
      hours: "6.00",
      billable: true
    });
    const returnedSubmission = await submitCycle(employee.token, "2026-05-11", "2026-05-15");

    const missingRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${returnedSubmission.id}/approve`,
      headers: authHeader(manager.token),
      payload: { decision: "return", expected_version: 1 }
    });
    expect(missingRemarks.statusCode).toBe(400);
    expect(missingRemarks.json().code).toBe("MISSING_REMARKS");

    const wrongApprover = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${returnedSubmission.id}/approve`,
      headers: authHeader(employeeTwo.token),
      payload: { decision: "return", remarks: "Needs detail", expected_version: 1 }
    });
    expect(wrongApprover.statusCode).toBe(403);

    const returned = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${returnedSubmission.id}/approve`,
      headers: authHeader(manager.token),
      payload: { decision: "return", remarks: "  Add client task detail.  ", expected_version: 1 }
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json()).toMatchObject({
      status: "Returned",
      previous_status: "Pending Approval",
      next_status: "Returned",
      current_approver_user_id: null,
      audit_event: { decision: "return", remarks: "Add client task detail." }
    });
    expect(app.store.outbox.some((event) => event.event_type === "timesheet.returned" && event.aggregate_id === returnedSubmission.id)).toBe(true);

    const staleAfterReturn = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${returnedSubmission.id}/approve`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(staleAfterReturn.statusCode).toBe(409);

    await createSegment(employeeTwo.token, {
      work_date: "2026-05-18",
      project_code: "PRJ-REJECT",
      task_code: "QA",
      hours: "4.00",
      billable: false
    });
    const rejectedSubmission = await submitCycle(employeeTwo.token, "2026-05-18", "2026-05-22");

    const filteredQueue = await app.inject({
      method: "GET",
      url: `/api/v1/timesheets/queue/approver?page=1&page_size=10&employee_user_id=${employeeTwo.user.id}&project_code=PRJ-REJECT&billable=false`,
      headers: authHeader(manager.token)
    });
    expect(filteredQueue.statusCode).toBe(200);
    expect(filteredQueue.json().total).toBe(1);
    expect(filteredQueue.json().items[0]).toMatchObject({ id: rejectedSubmission.id, employee: { employee_code: "E2" } });

    const rejected = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${rejectedSubmission.id}/approve`,
      headers: authHeader(manager.token),
      payload: { decision: "reject", remarks: "Submitted against wrong project", expected_version: 1 }
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({ status: "Rejected", audit_event: { decision: "reject" } });
    expect(app.store.outbox.some((event) => event.event_type === "timesheet.rejected" && event.aggregate_id === rejectedSubmission.id)).toBe(true);

    const adminRejectedView = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/queue/approver?page=1&page_size=10&status=Rejected",
      headers: authHeader(admin.token)
    });
    expect(adminRejectedView.statusCode).toBe(200);
    expect(adminRejectedView.json().items.map((item: { id: string }) => item.id)).toContain(rejectedSubmission.id);
  });

  it("returns project rollups, missing submissions, productivity, selectors, and submission detail", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const admin = await loginAs(app, "ADM");

    await createSegment(employee.token, {
      work_date: "2026-06-01",
      project_code: "HAW-HRMS",
      task_code: "API",
      hours: "8.00",
      billable: false,
      description: "Timesheet enhancements"
    });
    await createSegment(employee.token, {
      work_date: "2026-06-02",
      project_code: "HAW-HRMS",
      task_code: "QA",
      hours: "4.00",
      billable: true
    });
    const submission = await submitCycle(employee.token, "2026-06-01", "2026-06-07");

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/timesheets/submissions/${submission.id}`,
      headers: authHeader(manager.token)
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: submission.id,
      employee: { employee_code: "E1" },
      hours_summary: { submitted_hours: "12.00", expected_hours: "40.00" }
    });
    expect(detail.json().segments).toHaveLength(2);
    expect(detail.json().workflow_history.map((action: { decision: string }) => action.decision)).toEqual(["submitted"]);

    const projectSummary = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/projects/summary?page=1&page_size=10&cycle_start=2026-06-01&cycle_end=2026-06-07&project_code=HAW-HRMS",
      headers: authHeader(manager.token)
    });
    expect(projectSummary.statusCode).toBe(200);
    const projectBody = projectSummary.json();
    expect(projectBody.items[0]).toMatchObject({
      project: { project_code: "HAW-HRMS" },
      totals: { total_hours: "12.00", billable_hours: "4.00", missing_count: 1 }
    });
    expect(projectBody.items[0].members.map((member: { user: { employee_code: string } }) => member.user.employee_code)).toEqual(expect.arrayContaining(["E1", "E2"]));

    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/missing-submissions?page=1&page_size=10&cycle_start=2026-06-01&cycle_end=2026-06-07",
      headers: authHeader(manager.token)
    });
    expect(missing.statusCode).toBe(200);
    expect(missing.json().summary).toMatchObject({ expected_hours: "40.00" });
    expect(missing.json().items.map((item: { user: { employee_code: string }; status: string }) => [item.user.employee_code, item.status])).toEqual(
      expect.arrayContaining([
        ["E1", "under_submitted"],
        ["E2", "missing"]
      ])
    );

    const productivity = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/productivity-summary?date_from=2026-06-01&date_to=2026-06-07&project_code=HAW-HRMS&group_by=project",
      headers: authHeader(admin.token)
    });
    expect(productivity.statusCode).toBe(200);
    expect(productivity.json()).toMatchObject({
      cards: { total_hours: "12.00", billable_hours: "4.00", non_billable_hours: "8.00", billable_percent: 33 }
    });
    expect(productivity.json().breakdown[0]).toMatchObject({ id: "HAW-HRMS", total_hours: "12.00" });

    const selectors = await app.inject({
      method: "GET",
      url: "/api/v1/timesheets/selectors?include=projects,tasks,cycles,approvers,rules&date=2026-06-01",
      headers: authHeader(employee.token)
    });
    expect(selectors.statusCode).toBe(200);
    expect(selectors.json().projects.map((project: { project_code: string }) => project.project_code)).toContain("HAW-HRMS");
    expect(selectors.json().tasks.map((task: { task_code: string }) => task.task_code)).toEqual(expect.arrayContaining(["API", "QA"]));
    expect(selectors.json().rules).toMatchObject({ target_weekly_hours: 40 });
  });
});
