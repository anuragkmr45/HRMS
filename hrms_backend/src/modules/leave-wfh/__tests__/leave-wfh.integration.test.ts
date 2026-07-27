import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("leave / WFH / holidays", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("submits leave, approves with manager scope, updates balances and attendance", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const otherEmployee = await loginAs(app, "E2");

    const initialBalances = await app.inject({
      method: "GET",
      url: "/api/v1/leave/balances/my?year=2026&page=1&page_size=25",
      headers: authHeader(employee.token)
    });
    expect(initialBalances.statusCode).toBe(200);
    expect(initialBalances.json().balances.find((item: { leave_type: string }) => item.leave_type === "casual")).toMatchObject({
      total: 12,
      used: 0,
      pending: 0
    });

    const request = await app.inject({
      method: "POST",
      url: "/api/v1/leave/requests",
      headers: authHeader(employee.token),
      payload: {
        leave_type: "casual",
        date_from: "2026-05-26",
        date_to: "2026-05-27",
        reason: "Family travel"
      }
    });
    expect(request.statusCode).toBe(200);
    expect(request.json().request).toMatchObject({
      employee_user_id: employee.user.id,
      status: "pending_manager",
      duration: 2,
      current_approver_user_id: manager.user.id
    });

    const mine = await app.inject({
      method: "GET",
      url: "/api/v1/leave/requests/my?year=2026&page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items).toHaveLength(1);

    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/leave/requests/queue/manager?page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().items[0]).toMatchObject({ id: request.json().request_id, can_decide: true });

    const wrongApprover = await app.inject({
      method: "POST",
      url: `/api/v1/leave/requests/${request.json().request_id}/decision`,
      headers: authHeader(otherEmployee.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(wrongApprover.statusCode).toBe(403);

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/leave/requests/${request.json().request_id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      previous_status: "pending_manager",
      next_status: "approved",
      status: "approved",
      version: 2
    });
    expect(approved.json().balance_effect).toMatchObject({ leave_type: "casual", used: 2 });

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/leave/requests/${request.json().request_id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(stale.statusCode).toBe(409);

    const calendar = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/monthly?month=2026-05",
      headers: authHeader(employee.token)
    });
    expect(calendar.statusCode).toBe(200);
    const leaveDay = calendar.json().calendar_days.find((item: { work_date: string }) => item.work_date === "2026-05-26");
    expect(leaveDay).toMatchObject({
      status: "leave",
      day_classification: "leave",
      presence_state: "not_applicable",
      approval_kind: "leave",
      approval_state: "approved",
      detail: "Approved leave"
    });

    const overlap = await app.inject({
      method: "POST",
      url: "/api/v1/wfh/requests",
      headers: authHeader(employee.token),
      payload: {
        date_from: "2026-05-27",
        date_to: "2026-05-27",
        reason: "Work remotely"
      }
    });
    expect(overlap.statusCode).toBe(409);
  });

  it("submits WFH, supports HR monitor, and lets HR/Admin maintain holidays", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const admin = await loginAs(app, "ADM");

    const wfh = await app.inject({
      method: "POST",
      url: "/api/v1/wfh/requests",
      headers: authHeader(employee.token),
      payload: {
        date_from: "2026-05-28",
        date_to: "2026-05-28",
        reason: "Home internet installation",
        project_ref: "QA-PRJ-001"
      }
    });
    expect(wfh.statusCode).toBe(200);
    expect(wfh.json().request).toMatchObject({
      employee_user_id: employee.user.id,
      status: "pending_manager",
      project_ref: "QA-PRJ-001"
    });

    const wfhQueue = await app.inject({
      method: "GET",
      url: "/api/v1/wfh/requests/queue/manager?page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(wfhQueue.statusCode).toBe(200);
    expect(wfhQueue.json().items[0]).toMatchObject({ id: wfh.json().request_id, can_decide: true });

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/wfh/requests/${wfh.json().request_id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ previous_status: "pending_manager", next_status: "approved" });

    const attendance = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/monthly?month=2026-05",
      headers: authHeader(employee.token)
    });
    const wfhDay = attendance.json().calendar_days.find(
      (item: { work_date: string }) => item.work_date === "2026-05-28"
    );
    expect(wfhDay).toMatchObject({
      status: "wfh",
      day_classification: "wfh",
      presence_state: "not_started",
      approval_kind: "wfh",
      approval_state: "approved",
      work_seconds: 0
    });

    const monitor = await app.inject({
      method: "GET",
      url: "/api/v1/leave-wfh/hr-monitor?page=1&page_size=10&request_kind=wfh",
      headers: authHeader(admin.token)
    });
    expect(monitor.statusCode).toBe(200);
    expect(monitor.json().totals.wfh).toBe(1);
    expect(monitor.json().items[0]).toMatchObject({ kind: "wfh", status: "approved" });

    const holidays = await app.inject({
      method: "GET",
      url: "/api/v1/holidays?year=2026&page=1&page_size=25",
      headers: authHeader(employee.token)
    });
    expect(holidays.statusCode).toBe(200);
    expect(holidays.json().holidays.length).toBeGreaterThan(0);

    const holidayId = randomUUID();
    const holiday = await app.inject({
      method: "PUT",
      url: `/api/v1/holidays/${holidayId}`,
      headers: authHeader(admin.token),
      payload: {
        name: "Foundation Day",
        date: "2026-12-24",
        region: "All",
        optional: true
      }
    });
    expect(holiday.statusCode).toBe(200);
    expect(holiday.json().holiday).toMatchObject({
      id: holidayId,
      name: "Foundation Day",
      date: "2026-12-24",
      optional: true,
      version: 1
    });

    const forbiddenUpdate = await app.inject({
      method: "PUT",
      url: `/api/v1/holidays/${holidayId}`,
      headers: authHeader(employee.token),
      payload: {
        name: "Foundation Day",
        date: "2026-12-24",
        region: "All",
        optional: false,
        expected_version: 1
      }
    });
    expect(forbiddenUpdate.statusCode).toBe(403);

    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/leave-wfh/exports",
      headers: authHeader(admin.token),
      payload: {
        filters: { request_kind: "wfh", date_from: "2026-05-01", date_to: "2026-05-31" },
        columns: ["employee_code", "employee", "kind", "date_from", "date_to", "status"],
        format: "csv"
      }
    });
    expect(exportJob.statusCode).toBe(200);
    expect(exportJob.json()).toMatchObject({
      status: "ready",
      format: "csv",
      adapter: `${app.store.objectStorage?.kind}-generated-csv`,
      download_document_id: expect.any(String)
    });
    await expect(app.store.objectStorage?.statObject(app.store.documents.find((document) => document.id === exportJob.json().download_document_id)?.storage_key ?? "")).resolves.toMatchObject({
      size: expect.any(Number)
    });
    expect(app.store.outbox.some((event) => event.event_type === "leave_wfh.export_requested" && event.aggregate_id === exportJob.json().job_id)).toBe(true);

    const forbiddenExport = await app.inject({
      method: "POST",
      url: "/api/v1/leave-wfh/exports",
      headers: authHeader(employee.token),
      payload: {
        filters: { request_kind: "leave" },
        format: "csv"
      }
    });
    expect(forbiddenExport.statusCode).toBe(403);
  });
});
