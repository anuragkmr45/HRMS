import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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
  const now = new Date().toISOString();
  store.userSessionPreferences.push(...store.users.map((user) => ({
    id: randomUUID(), user_id: user.id, active_role: user.roles[0]!, company_id: company.id, landing_page: "/dashboard",
    locale: "en-IN", timezone: user.timezone ?? company.timezone, created_at: now, updated_at: now, version: 1
  })));
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
  policy.company_id = company.id;
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
      work_minutes: 180,
      break_seconds: 21_600,
      work_seconds: 10_800,
      presence_state: "present",
      evidence_state: "complete"
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
    expect(result.run_keys).toContain(`attendance:auto-punchout:${activeCompanyId(store)}:2026-05-20`);
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
    expect(catchUp.run_keys).toContain(`attendance:auto-punchout:${activeCompanyId(store)}:2026-05-20`);
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

  it("uses each active company's timezone, policy, and company-scoped persistence", async () => {
    const { store, companyAId, companyBId } = multiCompanyStore();
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {},
    });
    service.punch(user(store, "E2"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {},
    });

    const result = await new AttendanceAutoPunchoutWorker(store).runDue({
      referenceIso: "2026-05-21T00:00:00.000Z",
    });

    expect(result.closed_sessions).toBe(2);
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company_id: companyAId, occurred_at: "2026-05-20T13:00:00.000Z" }),
        expect.objectContaining({ company_id: companyBId, occurred_at: "2026-05-20T21:30:00.000Z" }),
      ]),
    );
    expect(store.attendanceDayRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company_id: companyAId }),
        expect.objectContaining({ company_id: companyBId }),
      ]),
    );
    expect(store.outbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: expect.objectContaining({ company_id: companyAId }) }),
        expect.objectContaining({ payload: expect.objectContaining({ company_id: companyBId }) }),
      ]),
    );
  });

  it("skips a disabled company without affecting another company", async () => {
    const { store, companyAId, companyBId } = multiCompanyStore({ companyBAutoPunchOutEnabled: false });
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), { event_type: "check_in", occurred_at: "2026-05-20T04:00:00.000Z", work_mode: "office", source: "web", metadata: {} });
    service.punch(user(store, "E2"), { event_type: "check_in", occurred_at: "2026-05-20T04:00:00.000Z", work_mode: "office", source: "web", metadata: {} });

    await new AttendanceAutoPunchoutWorker(store).runDue({ referenceIso: "2026-05-21T00:00:00.000Z" });

    expect(store.attendancePunches.some((punch) => punch.company_id === companyAId && punch.event_type === "check_out")).toBe(true);
    expect(store.attendancePunches.some((punch) => punch.company_id === companyBId && punch.event_type === "check_out")).toBe(false);
  });

  it("uses company-scoped run keys and duplicate detection for identical employee/date sessions", async () => {
    const { store, companyAId, companyBId } = multiCompanyStore();
    const service = new AttendanceService(store);
    const checkIn = service.punch(user(store, "E1"), {
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {},
    }).punch;
    store.attendancePunches.push({ ...checkIn, id: randomUUID(), company_id: companyBId });
    const worker = new AttendanceAutoPunchoutWorker(store);

    const first = await worker.runDue({ referenceIso: "2026-05-21T00:00:00.000Z" });
    const scheduled = await worker.runScheduled({
      referenceIso: "2026-05-21T00:00:00.000Z",
      includeCatchUp: true,
    });
    const second = await worker.runDue({ referenceIso: "2026-05-21T00:00:00.000Z" });

    expect(first.closed_sessions).toBe(2);
    expect(store.attendancePunches.filter((punch) => punch.event_type === "check_out")).toHaveLength(2);
    expect(scheduled.run_keys).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`attendance:auto-punchout:${companyAId}:`),
        expect.stringContaining(`attendance:auto-punchout:${companyBId}:`),
      ]),
    );
    expect(second.closed_sessions).toBe(0);
  });

  it("continues processing another company when one company run fails", async () => {
    const { store, companyAId, companyBId } = multiCompanyStore();
    const service = new AttendanceService(store);
    service.punch(user(store, "E1"), { event_type: "check_in", occurred_at: "2026-05-20T04:00:00.000Z", work_mode: "office", source: "web", metadata: {} });
    service.punch(user(store, "E2"), { event_type: "check_in", occurred_at: "2026-05-20T04:00:00.000Z", work_mode: "office", source: "web", metadata: {} });
    const worker = new AttendanceAutoPunchoutWorker(store);
    const internals = worker as unknown as {
      runDueForCompanies: (input: { referenceIso?: string }, companyIds: Set<string>) => Promise<unknown>;
    };
    const runDueForCompanies = internals.runDueForCompanies.bind(worker);
    internals.runDueForCompanies = async (input, companyIds) => {
      if (companyIds.has(companyBId)) throw new Error("Company B persistence failure");
      return runDueForCompanies(input, companyIds);
    };

    const result = await worker.runScheduled({
      referenceIso: "2026-05-21T00:00:00.000Z",
      includeCatchUp: true,
    });

    expect(result.closed_sessions).toBe(1);
    expect(store.attendancePunches.some((punch) => punch.company_id === companyAId && punch.event_type === "check_out")).toBe(true);
    expect(store.attendancePunches.some((punch) => punch.company_id === companyBId && punch.event_type === "check_out")).toBe(false);
    expect(result.run_keys).toEqual(expect.arrayContaining([
      expect.stringContaining(`attendance:auto-punchout:${companyAId}:`),
    ]));
    expect(result.run_keys).not.toEqual(expect.arrayContaining([
      expect.stringContaining(`attendance:auto-punchout:${companyBId}:`),
    ]));
  });

  it("does not complete an advisory-lock skipped company run key and retries it", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const worker = new AttendanceAutoPunchoutWorker(store);
    const internals = worker as unknown as {
      runDueForCompanies: (input: { referenceIso?: string }, companyIds: Set<string>) => Promise<unknown>;
    };
    const runDueForCompanies = internals.runDueForCompanies.bind(worker);
    let attempt = 0;
    internals.runDueForCompanies = async (input, companyIds) => {
      attempt += 1;
      if (attempt === 1) {
        return skippedWorkerResult(input.referenceIso, "attendance auto punch-out worker lock is held by another process");
      }
      return runDueForCompanies(input, companyIds);
    };

    const skipped = await worker.runScheduled({ referenceIso: "2026-05-20T14:00:00.000Z" });
    const retried = await worker.runScheduled({ referenceIso: "2026-05-20T14:00:00.000Z" });

    expect(skipped).toMatchObject({ skipped: true, run_keys: [] });
    expect(retried).toMatchObject({ skipped: false, closed_sessions: 0 });
    expect(retried.run_keys).toContain(`attendance:auto-punchout:${activeCompanyId(store)}:2026-05-20`);
  });

  it("rejects when every due company fails", async () => {
    const { store } = multiCompanyStore();
    const worker = new AttendanceAutoPunchoutWorker(store);
    const internals = worker as unknown as {
      runDueForCompanies: (input: { referenceIso?: string }, companyIds: Set<string>) => Promise<unknown>;
    };
    internals.runDueForCompanies = async () => {
      throw new Error("company persistence failure");
    };

    await expect(worker.runScheduled({
      referenceIso: "2026-05-21T00:00:00.000Z",
      includeCatchUp: true,
    })).rejects.toThrow("company persistence failure");
  });

  it("reloads in-memory persistence after a PostgreSQL worker persistence failure", async () => {
    const store = storeWithAutoPunchOut("18:30");
    const reload = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn(async (statement: string) => ({
      rows: statement.includes("pg_try_advisory_lock") ? [{ locked: true }] : [],
    }));
    const release = vi.fn();
    const postgresStore = store as unknown as {
      kind: string;
      pgPool: { connect: () => Promise<unknown> };
      persistence: { reload: () => Promise<void> };
    };
    postgresStore.kind = "postgres";
    postgresStore.pgPool = {
      connect: async () => ({ query, release }),
    };
    postgresStore.persistence = { reload };
    const worker = new AttendanceAutoPunchoutWorker(store);
    const internals = worker as unknown as {
      runDueWithPostgresLock: (input: { referenceIso?: string }, companyIds: Set<string>) => Promise<unknown>;
      runDueUnlocked: () => Promise<unknown>;
    };
    internals.runDueUnlocked = async () => {
      throw new Error("PostgreSQL persistence failed");
    };

    await expect(internals.runDueWithPostgresLock(
      { referenceIso: "2026-05-20T14:00:00.000Z" },
      new Set([activeCompanyId(store)]),
    )).rejects.toThrow("PostgreSQL persistence failed");

    expect(reload).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_unlock($1, $2)",
      [20_260_606, 1],
    );
    expect(release).toHaveBeenCalledOnce();
  });
});

function skippedWorkerResult(referenceIso: string | undefined, skipReason: string) {
  return {
    reference_iso: referenceIso ?? new Date().toISOString(),
    scanned_users: 0,
    closed_sessions: 0,
    punches_created: 0,
    day_records_recomputed: 0,
    closures: [],
    skipped: true,
    skip_reason: skipReason,
    run_keys: [],
  };
}

function activeCompanyId(store: MemoryDataStore): string {
  const company = store.companyProfiles.find((candidate) => candidate.status === "active");
  if (!company) throw new Error("Expected active company");
  return company.id;
}

function multiCompanyStore(input: { companyBAutoPunchOutEnabled?: boolean; companyBAutoPunchOutTime?: string } = {}) {
  const store = storeWithAutoPunchOut("18:30");
  const companyAId = activeCompanyId(store);
  const companyA = store.companyProfiles.find((company) => company.id === companyAId);
  if (!companyA) throw new Error("Expected Company A");
  const companyBId = randomUUID();
  store.companyProfiles.push({
    ...companyA,
    id: companyBId,
    company_name: "Company B",
    company_slug: `company-b-${companyBId}`,
    timezone: "America/New_York",
  });
  const companyAPolicy = store.adminPolicies.find(
    (policy) => policy.company_id === companyAId && policy.policy_key === "attendance",
  );
  if (!companyAPolicy) throw new Error("Expected Company A attendance policy");
  store.adminPolicies.push({
    ...companyAPolicy,
    id: randomUUID(),
    company_id: companyBId,
    config: {
      ...companyAPolicy.config,
      autoPunchOutEnabled: input.companyBAutoPunchOutEnabled ?? true,
      autoPunchOutTime: input.companyBAutoPunchOutTime ?? "17:30",
    },
  });
  const employeeBPreference = store.userSessionPreferences.find(
    (preference) => preference.user_id === user(store, "E2").id,
  );
  if (!employeeBPreference) throw new Error("Expected employee preference");
  employeeBPreference.company_id = companyBId;
  return { store, companyAId, companyBId };
}
