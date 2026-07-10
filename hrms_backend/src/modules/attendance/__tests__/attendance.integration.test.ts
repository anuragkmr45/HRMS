import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

function localDate(offsetDays = 0, timeZone = "Asia/Kolkata"): string {
  const value = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return map.get("year") + "-" + map.get("month") + "-" + map.get("day");
}

function isWeekend(date: string): boolean {
  const day = new Date(date + "T00:00:00.000Z").getUTCDay();
  return day === 0 || day === 6;
}

function previousWorkday(): string {
  for (let offset = -1; offset >= -7; offset -= 1) {
    const date = localDate(offset);
    if (!isWeekend(date)) {
      return date;
    }
  }
  return localDate(-1);
}

function ensureActiveCompany(app: FastifyInstance) {
  const existing = app.store.companyProfiles.find((candidate) => candidate.status === "active") ?? app.store.companyProfiles[0];
  if (existing) {
    existing.status = "active";
    return existing;
  }
  const now = new Date().toISOString();
  const company = {
    id: randomUUID(),
    company_name: "Test Company",
    company_slug: "test-company",
    website: null,
    industry: null,
    address: null,
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    currency: "INR",
    fiscal_year_start_month: 4,
    working_week: "Mon-Fri",
    work_hours_per_day: 8,
    logo_label: "TC",
    logo_document_id: null,
    logo_url: null,
    logo_file_name: null,
    logo_mime_type: null,
    logo_size_bytes: null,
    status: "active" as const,
    bootstrap_completed_at: now,
    created_at: now,
    updated_at: now,
    version: 1
  };
  app.store.companyProfiles.push(company);
  return company;
}

describe("attendance", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("blocks admin self-service punches and self calendar while preserving attendance oversight", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const adminPunch = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(admin.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-20T04:10:00.000Z",
        work_mode: "office"
      }
    });
    expect(adminPunch.statusCode).toBe(403);

    const adminSummary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/my?month=2026-05&page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(adminSummary.statusCode).toBe(403);

    const adminSelfCalendar = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/monthly?month=2026-05",
      headers: authHeader(admin.token)
    });
    expect(adminSelfCalendar.statusCode).toBe(403);

    const employeeCalendar = await app.inject({
      method: "GET",
      url: `/api/v1/attendance/calendar/monthly?month=2026-05&user_id=${employee.user.id}`,
      headers: authHeader(admin.token)
    });
    expect(employeeCalendar.statusCode).toBe(200);

    const teamSummary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/team?date_from=2026-05-20&page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(teamSummary.statusCode).toBe(200);
  });

  it("records punch sequence, returns summaries, and blocks duplicate/out-of-order actions", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");

    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-20T04:10:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.json().day_status).toMatchObject({
      work_date: "2026-05-20",
      status: "present",
      late_minutes: 0
    });
    expect(checkIn.json().day_status.in_time).toBe("09:40");
    expect(checkIn.json().next_allowed_actions).toEqual(["break_start", "check_out"]);

    const checkOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-20T12:45:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkOut.statusCode).toBe(200);
    expect(checkOut.json().day_status.work_minutes).toBeGreaterThan(500);
    expect(checkOut.json().day_status.detail).toBe("8h 35m");

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-20T18:20:00.000Z",
        work_mode: "office"
      }
    });
    expect(duplicate.statusCode).toBe(409);

    const lateAfterHour = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-22T05:35:00.000Z",
        work_mode: "office"
      }
    });
    expect(lateAfterHour.statusCode).toBe(200);
    expect(lateAfterHour.json().day_status.in_time).toBe("11:05");

    const lateAfterHourOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-22T12:45:00.000Z",
        work_mode: "office"
      }
    });
    expect(lateAfterHourOut.statusCode).toBe(200);
    expect(lateAfterHourOut.json().day_status.detail).toBe("Late by 1h 35m");

    const punches = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/punches/my?date_from=2026-05-20&date_to=2026-05-20&page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(punches.statusCode).toBe(200);
    expect(punches.json().total).toBe(2);

    const mySummary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/my?month=2026-05&page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(mySummary.statusCode).toBe(200);
    expect(mySummary.json().summary.late).toBeGreaterThanOrEqual(1);
    expect(mySummary.json().week_records).toHaveLength(7);

    const teamSummary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/team?date_from=2026-05-20&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(teamSummary.statusCode).toBe(200);
    expect(teamSummary.json().totals.total).toBeGreaterThanOrEqual(2);
    expect(teamSummary.json().department_summary[0]).toHaveProperty("attendance_percent");

    const dailyCalendar = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/daily?date=2026-05-20&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(dailyCalendar.statusCode).toBe(200);
    expect(dailyCalendar.json()).toMatchObject({
      date: "2026-05-20",
      page: 1,
      page_size: 10
    });
    expect(dailyCalendar.json().items.some((item: { employee_user_id: string }) => item.employee_user_id === employee.user.id)).toBe(true);
    expect(dailyCalendar.json().summary.present).toBeGreaterThanOrEqual(1);
    expect(dailyCalendar.json().totals.total).toBeGreaterThanOrEqual(2);
  });

  it("applies admin company schedule, holidays, and attendance policy to day status", async () => {
    const employee = await loginAs(app, "E1");
    const company = ensureActiveCompany(app);
    company.working_week = "Mon-Sat";
    company.work_hours_per_day = 7.5;
    const policy = app.store.adminPolicies.find((candidate) => candidate.policy_key === "attendance");
    if (policy) {
      policy.config = { ...policy.config, graceMinutes: 60, autoMarkAbsentMinutes: 450 };
    }

    const withinGrace = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-25T04:45:00.000Z",
        work_mode: "office"
      }
    });
    expect(withinGrace.statusCode).toBe(200);
    expect(withinGrace.json().day_status).toMatchObject({
      work_date: "2026-05-25",
      status: "present",
      late_minutes: 0
    });

    const calendar = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/monthly?month=2026-05",
      headers: authHeader(employee.token)
    });
    expect(calendar.statusCode).toBe(200);
    const saturday = calendar.json().calendar_days.find((item: { work_date: string }) => item.work_date === "2026-05-23");
    expect(saturday).toMatchObject({ status: "absent", detail: "No punch-in recorded" });
    expect(calendar.json().calendar_days[0]).toHaveProperty("hours");

    app.store.holidays.push({
      id: randomUUID(),
      name: "Company Offsite",
      holiday_date: "2026-05-26",
      region: "Company",
      optional: false,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    });
    const refreshed = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/monthly?month=2026-05",
      headers: authHeader(employee.token)
    });
    expect(refreshed.statusCode).toBe(200);
    const holiday = refreshed.json().calendar_days.find((item: { work_date: string }) => item.work_date === "2026-05-26");
    expect(holiday).toMatchObject({ status: "holiday", detail: "Holiday: Company Offsite" });
    expect(refreshed.json().summary.holiday).toBeGreaterThanOrEqual(1);

    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/my?month=2026-05&page=1&page_size=50",
      headers: authHeader(employee.token)
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary.target_hours).toBe("7h 30m");
  });


  it("enforces admin-configured punch windows and off-day access", async () => {
    const employee = await loginAs(app, "E1");
    const company = ensureActiveCompany(app);
    company.working_week = "Mon-Fri";
    app.store.holidays = app.store.holidays.filter((holiday) => !["2026-05-23", "2026-05-24", "2026-05-27"].includes(holiday.holiday_date));
    const policy = app.store.adminPolicies.find((candidate) => candidate.policy_key === "attendance");
    if (!policy) {
      throw new Error("Expected attendance policy");
    }
    policy.config = {
      ...policy.config,
      fullDayPunchWindow: false,
      punchInStart: "09:00",
      punchInEnd: "11:00",
      punchOutStart: "17:00",
      punchOutEnd: "23:00",
      allowOffDayPunches: false
    };

    const earlyCheckIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-20T03:00:00.000Z",
        work_mode: "office"
      }
    });
    expect(earlyCheckIn.statusCode).toBe(400);
    expect(earlyCheckIn.json().message).toContain("Punch-in is allowed between 09:00 and 11:00");

    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-20T04:00:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.json().next_allowed_actions).toEqual(["break_start"]);
    expect(checkIn.json().punch_policy).toMatchObject({ punch_window_mode: "restricted", can_punch_now: true });

    const earlyCheckOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-20T10:30:00.000Z",
        work_mode: "office"
      }
    });
    expect(earlyCheckOut.statusCode).toBe(400);
    expect(earlyCheckOut.json().message).toContain("Punch-out is allowed between 17:00 and 23:00");

    const checkOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-20T12:00:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkOut.statusCode).toBe(200);

    const offDayBlocked = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-23T04:00:00.000Z",
        work_mode: "office"
      }
    });
    expect(offDayBlocked.statusCode).toBe(400);
    expect(offDayBlocked.json().message).toContain("off days");

    policy.config = { ...policy.config, allowOffDayPunches: true };
    const offDayAllowed = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-24T04:00:00.000Z",
        work_mode: "office"
      }
    });
    expect(offDayAllowed.statusCode).toBe(200);

    policy.config = { ...policy.config, fullDayPunchWindow: true, allowOffDayPunches: false };
    const fullDayCheckIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-27T20:30:00.000Z",
        work_mode: "office"
      }
    });
    expect(fullDayCheckIn.statusCode).toBe(200);
    expect(fullDayCheckIn.json().punch_policy.punch_window_mode).toBe("full_day");
  });

  it("auto punch-outs forgotten open sessions at the configured day-end time", async () => {
    const employee = await loginAs(app, "E1");
    ensureActiveCompany(app).working_week = "Mon-Sun";
    const policy = app.store.adminPolicies.find((candidate) => candidate.policy_key === "attendance");
    if (!policy) {
      throw new Error("Expected attendance policy");
    }
    policy.config = {
      ...policy.config,
      fullDayPunchWindow: true,
      autoPunchOutTime: "18:30"
    };

    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-20T04:00:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkIn.statusCode).toBe(200);

    const calendar = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/monthly?month=2026-05&page=1&page_size=50",
      headers: authHeader(employee.token)
    });
    expect(calendar.statusCode).toBe(200);
    const day = calendar.json().calendar_days.find((record: { work_date: string }) => record.work_date === "2026-05-20");
    expect(day).toMatchObject({
      out_time: "18:30",
      work_minutes: 540,
      hours: "9h 00m"
    });
    expect(day.exception_type).not.toBe("missing_punch");

    const punches = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/punches/my?date_from=2026-05-20&date_to=2026-05-20&page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(punches.statusCode).toBe(200);
    expect(punches.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "check_out",
          time: "18:30",
          source: "admin",
          metadata: expect.objectContaining({
            auto_punch_out: true,
            auto_punch_out_time: "18:30"
          })
        })
      ])
    );
  });


  it("refreshes stale day statuses and returns live work minutes for open punches", async () => {
    const employee = await loginAs(app, "E1");
    ensureActiveCompany(app).working_week = "Mon-Sun";
    const staleDate = previousWorkday();
    const staleExisting = app.store.attendanceDayRecords.find(
      (record) => record.employee_user_id === employee.user.id && record.work_date === staleDate && !record.deleted_at
    );

    if (staleExisting) {
      Object.assign(staleExisting, {
        status: "future",
        first_check_in: null,
        last_check_out: null,
        work_minutes: 0,
        break_minutes: 0,
        late_minutes: 0,
        early_out_minutes: 0,
        work_mode: null,
        note: null,
        exception_type: null,
        regularization_status: null
      });
    } else {
      app.store.attendanceDayRecords.push({
        id: randomUUID(),
        employee_user_id: employee.user.id,
        work_date: staleDate,
        status: "future",
        first_check_in: null,
        last_check_out: null,
        work_minutes: 0,
        break_minutes: 0,
        late_minutes: 0,
        early_out_minutes: 0,
        work_mode: null,
        note: null,
        exception_type: null,
        regularization_status: null,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      });
    }

    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: new Date(Date.now() - 75 * 60_000).toISOString(),
        work_mode: "office"
      }
    });
    expect(checkIn.statusCode).toBe(200);

    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/my?month=" + localDate().slice(0, 7) + "&page=1&page_size=50",
      headers: authHeader(employee.token)
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().today.work_minutes).toBeGreaterThanOrEqual(70);
    const refreshedStoreRecord = app.store.attendanceDayRecords.find(
      (record) => record.employee_user_id === employee.user.id && record.work_date === staleDate && !record.deleted_at
    );
    expect(refreshedStoreRecord).toMatchObject({
      status: "absent",
      exception_type: "absent",
      note: "No punch-in recorded"
    });
    const refreshedWeekRecord = summary.json().week_records.find((record: { work_date: string }) => record.work_date === staleDate);
    if (refreshedWeekRecord) {
      expect(refreshedWeekRecord).toMatchObject({
        status: "absent",
        exception_type: "absent",
        detail: "No punch-in recorded"
      });
    }
  });

  it("submits and approves regularization with manager scope, OCC, and exception visibility", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const otherEmployee = await loginAs(app, "E2");

    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-21",
        reason: "Forgot to punch out after office work.",
        requested_punches: [
          { event_type: "check_in", occurred_at: "2026-05-21T03:35:00.000Z" },
          { event_type: "check_out", occurred_at: "2026-05-21T13:00:00.000Z" }
        ]
      }
    });
    expect(request.statusCode).toBe(200);
    expect(request.json()).toMatchObject({
      employee_user_id: employee.user.id,
      work_date: "2026-05-21",
      status: "pending",
      current_approver_user_id: manager.user.id,
      version: 1
    });

    const exceptions = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/exceptions?date_from=2026-05-21&date_to=2026-05-21&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(exceptions.statusCode).toBe(200);
    expect(exceptions.json().items[0]).toMatchObject({
      request_id: request.json().id,
      exception_type: "correction",
      can_decide: true
    });

    const managerQueue = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/regularizations/queue/manager?date_from=2026-05-21&date_to=2026-05-21&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(managerQueue.statusCode).toBe(200);
    expect(managerQueue.json().items[0]).toMatchObject({
      id: request.json().id,
      status: "pending",
      current_approver_user_id: manager.user.id
    });
    expect(managerQueue.json().queue_counts.pending).toBeGreaterThanOrEqual(1);

    const nonManagerQueue = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/regularizations/queue/manager?date_from=2026-05-21&date_to=2026-05-21&page=1&page_size=10",
      headers: authHeader(otherEmployee.token)
    });
    expect(nonManagerQueue.statusCode).toBe(403);

    const wrongApprover = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(otherEmployee.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(wrongApprover.statusCode).toBe(403);

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      previous_status: "pending",
      next_status: "approved",
      status: "approved",
      version: 2
    });
    expect(approved.json().day_status.status).toBe("present");

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
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
    const day = calendar.json().calendar_days.find((item: { work_date: string }) => item.work_date === "2026-05-21");
    expect(day).toMatchObject({ status: "present", regularization_status: "approved" });
  });

  it("creates document-backed attendance exports for HR/Admin/Auditor roles only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/exports",
      headers: authHeader(admin.token),
      payload: {
        filters: { date_from: "2026-05-01", date_to: "2026-05-31" },
        columns: ["employee_code", "employee", "date", "status"],
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
    expect(app.store.outbox.some((event) => event.event_type === "attendance.export_requested" && event.aggregate_id === exportJob.json().job_id)).toBe(true);

    const forbiddenExport = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/exports",
      headers: authHeader(employee.token),
      payload: {
        filters: { date_from: "2026-05-01", date_to: "2026-05-31" },
        format: "csv"
      }
    });
    expect(forbiddenExport.statusCode).toBe(403);
  });
});
