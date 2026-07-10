import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "#shared";
import { AttendanceService } from "../../modules/attendance/service.js";
import { createMemoryDataStore, type MemoryDataStore } from "../../platform/data-store.js";
import { AttendanceAutoPunchoutWorker } from "../attendance-auto-punchout-worker.js";

function storeWithAutoPunchOut(autoPunchOutTime = "18:30", autoPunchOutEnabled = true): MemoryDataStore {
  const store = createMemoryDataStore();
  const company = store.companyProfiles.find((candidate) => candidate.status === "active") ?? {
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
    working_week: "Mon-Sun",
    work_hours_per_day: 8,
    logo_label: "TC",
    logo_document_id: null,
    logo_url: null,
    logo_file_name: null,
    logo_mime_type: null,
    logo_size_bytes: null,
    status: "active" as const,
    bootstrap_completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1
  };
  if (!store.companyProfiles.some((candidate) => candidate.id === company.id)) {
    store.companyProfiles.push(company);
  }
  company.working_week = "Mon-Sun";
  company.timezone = "Asia/Kolkata";
  const policy = store.adminPolicies.find((candidate) => candidate.policy_key === "attendance");
  if (!policy) {
    throw new Error("Expected attendance policy");
  }
  policy.config = {
    ...policy.config,
    fullDayPunchWindow: true,
    autoPunchOutEnabled,
    autoPunchOutTime
  };
  return store;
}

function user(store: MemoryDataStore, employeeCode: string): AuthUser {
  const found = store.users.find((candidate) => candidate.employee_code === employeeCode);
  if (!found) {
    throw new Error(`Expected seeded user ${employeeCode}`);
  }
  return found;
}

describe("AttendanceAutoPunchoutWorker", () => {
  it("closes forgotten open sessions for multiple active employees", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });
    service.punch(user(store, "E2"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:15:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });

    const result = await new AttendanceAutoPunchoutWorker(store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
      batchSize: 10
    });

    expect(result).toMatchObject({
      skipped: false,
      scanned_users: 2,
      closed_sessions: 2,
      punches_created: 2,
      day_records_recomputed: 2
    });
    const checkOuts = store.attendancePunches.filter((punch) => punch.event_type === "check_out");
    expect(checkOuts).toHaveLength(2);
    expect(checkOuts.every((punch) => punch.source === "admin")).toBe(true);
    expect(checkOuts.every((punch) => punch.metadata.auto_punch_out === true)).toBe(true);
    expect(store.attendanceDayRecords.filter((record) => record.last_check_out === "2026-05-20T13:00:00.000Z")).toHaveLength(2);
  });

  it("ends an open break before auto punch-out", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const service = new AttendanceService(store);
    const employee = user(store, "E1");
    service.punch(employee, {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });
    service.punch(employee, {
      event_type: "break_start",
      occurred_at: "2026-05-20T07:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });

    const result = await new AttendanceAutoPunchoutWorker(store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z"
    });

    expect(result.closed_sessions).toBe(1);
    expect(result.punches_created).toBe(2);
    expect(store.attendancePunches.map((punch) => punch.event_type)).toEqual([
      "check_in",
      "break_start",
      "break_end",
      "check_out"
    ]);
    expect(store.attendanceDayRecords[0]).toMatchObject({
      last_check_out: "2026-05-20T13:00:00.000Z",
      break_minutes: 360,
      work_minutes: 180
    });
  });

  it("is idempotent when the same due session is processed more than once", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });
    const worker = new AttendanceAutoPunchoutWorker(store);

    const first = await worker.runDue({ referenceIso: "2026-05-20T14:00:00.000Z" });
    const second = await worker.runDue({ referenceIso: "2026-05-20T14:00:00.000Z" });

    expect(first.closed_sessions).toBe(1);
    expect(second.closed_sessions).toBe(0);
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toHaveLength(1);
  });

  it("leaves sessions open until the configured cutoff has passed", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });

    const result = await new AttendanceAutoPunchoutWorker(store).runDue({
      referenceIso: "2026-05-20T12:59:00.000Z"
    });

    expect(result.closed_sessions).toBe(0);
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toHaveLength(0);
  });

  it("skips the scheduled scan before the configured cutoff", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });

    const result = await new AttendanceAutoPunchoutWorker(store).runScheduled({
      referenceIso: "2026-05-20T12:59:00.000Z"
    });

    expect(result).toMatchObject({
      skipped: true,
      closed_sessions: 0,
      skip_reason: "attendance auto punch-out is not due yet"
    });
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toHaveLength(0);
  });

  it("runs the scheduled scan when the configured cutoff is due", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });

    const result = await new AttendanceAutoPunchoutWorker(store).runScheduled({
      referenceIso: "2026-05-20T13:01:00.000Z"
    });

    expect(result).toMatchObject({
      skipped: false,
      closed_sessions: 1,
      punches_created: 1
    });
    expect(result.run_keys).toContain("Asia/Kolkata:2026-05-20");
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toHaveLength(1);
  });

  it("runs catch-up once for missed auto punch-outs after worker startup", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });
    const worker = new AttendanceAutoPunchoutWorker(store);

    const catchUp = await worker.runScheduled({
      referenceIso: "2026-05-21T04:00:00.000Z",
      includeCatchUp: true
    });
    const repeated = await worker.runScheduled({
      referenceIso: "2026-05-21T04:05:00.000Z",
      includeCatchUp: true
    });

    expect(catchUp.closed_sessions).toBe(1);
    expect(catchUp.run_keys).toContain("Asia/Kolkata:2026-05-20");
    expect(repeated.closed_sessions).toBe(0);
    expect(repeated.skipped).toBe(true);
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toHaveLength(1);
  });

  it("does not close sessions when auto punch-out is disabled by policy", async () => {
    const store = storeWithAutoPunchOut("18:30", false);
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });

    const scheduled = await new AttendanceAutoPunchoutWorker(store).runScheduled({
      referenceIso: "2026-05-20T14:00:00.000Z"
    });
    const direct = await new AttendanceAutoPunchoutWorker(store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z"
    });

    expect(scheduled).toMatchObject({
      skipped: true,
      skip_reason: "attendance auto punch-out is disabled by policy"
    });
    expect(direct.closed_sessions).toBe(0);
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toHaveLength(0);
  });
});
