import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildApp } from "../../../app.js";

type TestApp = Awaited<ReturnType<typeof buildApp>>;

let app: TestApp;
let ordinal = 0;
const originalAllowMemoryStore = process.env.HRMS_ALLOW_MEMORY_STORE;

function headers(token: string) {
  ordinal += 1;
  return {
    ...authHeader(token),
    "idempotency-key": `attendance-boundary-${ordinal.toString().padStart(4, "0")}`,
  };
}

describe("attendance command boundaries", () => {
  beforeEach(async () => {
    ordinal = 0;
    process.env.HRMS_ALLOW_MEMORY_STORE = "true";
    app = await buildApp({ dataStoreMode: "memory", rateLimit: false });
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    if (originalAllowMemoryStore === undefined) {
      delete process.env.HRMS_ALLOW_MEMORY_STORE;
    } else {
      process.env.HRMS_ALLOW_MEMORY_STORE = originalAllowMemoryStore;
    }
  });

  it("accepts only a server-timed self punch and persists identical actor and subject", async () => {
    const employee = await loginAs(app, "E1");

    const rejectedBackdate = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2001-01-01T00:00:00.000Z",
      },
    });
    expect(rejectedBackdate.statusCode).toBe(400);

    for (const forbiddenField of [
      "actor_user_id",
      "subject_employee_user_id",
      "employee_user_id",
      "company_id",
    ]) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: headers(employee.token),
        payload: { event_type: "check_in", [forbiddenField]: employee.user.id },
      });
      expect(rejected.statusCode).toBe(400);
    }
    const rejectedAdminSource = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: { event_type: "check_in", source: "admin" },
    });
    expect(rejectedAdminSource.statusCode).toBe(400);

    const recorded = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: { event_type: "check_in", work_mode: "office" },
    });
    expect(recorded.statusCode).toBe(200);
    expect(recorded.json().punch).toMatchObject({
      employee_user_id: employee.user.id,
      actor_user_id: employee.user.id,
      origin: "employee_manual_now",
    });
  });

  it("records an assisted current punch with distinct manager actor and employee subject", async () => {
    const manager = await loginAs(app, "D1");
    const employee = await loginAs(app, "E1");

    const rejectedBackdate = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/employees/${employee.user.id}/assisted-current-punches`,
      headers: headers(manager.token),
      payload: { event_type: "check_in", occurred_at: "2001-01-01T00:00:00.000Z" },
    });
    expect(rejectedBackdate.statusCode).toBe(400);

    const recorded = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/employees/${employee.user.id}/assisted-current-punches`,
      headers: headers(manager.token),
      payload: { event_type: "check_in", reason: "Employee kiosk was unavailable." },
    });
    expect(recorded.statusCode).toBe(200);
    expect(recorded.json().punch).toMatchObject({
      employee_user_id: employee.user.id,
      actor_user_id: manager.user.id,
      origin: "manager_assisted_now",
    });
  });

  it("requires a privileged historical correction with an explicit past time and reason", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recorded = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/employees/${employee.user.id}/historical-corrections`,
      headers: headers(admin.token),
      payload: {
        event_type: "check_in",
        occurred_at: past,
        reason: "Correcting a verified missing kiosk record.",
      },
    });
    expect(recorded.statusCode).toBe(200);
    expect(recorded.json().punch).toMatchObject({
      employee_user_id: employee.user.id,
      actor_user_id: admin.user.id,
      occurred_at: past,
      origin: "historical_correction",
    });

    const deniedEmployee = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/employees/${employee.user.id}/historical-corrections`,
      headers: headers(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: past,
        reason: "Attempted self correction.",
      },
    });
    expect(deniedEmployee.statusCode).toBe(403);

    const rejectedBreak = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/employees/${employee.user.id}/historical-corrections`,
      headers: headers(admin.token),
      payload: { event_type: "break_start", occurred_at: past, reason: "No breaks in v1." },
    });
    expect(rejectedBreak.statusCode).toBe(400);
  });
});
