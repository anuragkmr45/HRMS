import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { AttendanceCommandService } from "../command-service.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

async function allowCurrentPunchesOnAnyWeekday(app: TestApp): Promise<void> {
  const company =
    app.store.companyProfiles.find((candidate) => candidate.status === "active") ??
    app.store.companyProfiles[0];
  if (!company) throw new Error("Expected seeded active company.");
  company.working_week = "Mon-Sun";
  await app.store.persistence?.flushDomain?.("platform");
}

describe("attendance registered device lifecycle enforcement", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    await clearAttendanceRuntimeFixtures(app);

    const policy = app.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "attendance",
    );
    if (!policy) throw new Error("Attendance policy fixture is unavailable.");
    policy.config = {
      ...policy.config,
      fullDayPunchWindow: true,
      allowOffDayPunches: true,
    };
    await allowCurrentPunchesOnAnyWeekday(app);
  }, 30_000);

  afterEach(async () => {
    try {
      if (app) await clearAttendanceRuntimeFixtures(app);
    } finally {
      try {
        await app?.close();
      } finally {
        if (originalDatabaseUrl === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = originalDatabaseUrl;
        }
      }
    }
  });

  it("allows registered devices to submit mobile evidence", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
      status: "registered",
    });

    const response = await mobilePunch(app, employee.token, registeredDeviceId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      allowed: true,
      punch: { source: "mobile" },
    });
  });

  it.each([
    ["suspended", "mobile_registered_device_suspended"],
    ["revoked", "mobile_registered_device_revoked"],
  ] as const)("rejects %s devices before attendance side effects", async (status, reasonCode) => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
      status,
    });
    const before = await attendanceSideEffectCounts(app);

    const response = await mobilePunch(app, employee.token, registeredDeviceId);

    expect(response.statusCode).toBe(409);
    expect(response.json().details.reason_code).toBe(reasonCode);
    expect(await attendanceSideEffectCounts(app)).toEqual(before);
  });

  it.each([
    ["unknown", () => randomUUID()],
    ["cross-owner", async (currentApp: TestApp) => {
      const actor = await loginAs(currentApp, "E1");
      const other = await loginAs(currentApp, "E2");
      return insertRegisteredDevice(currentApp, {
        companyId: employeeCompanyId(currentApp, actor.user.id),
        userId: other.user.id,
        status: "registered",
      });
    }],
    ["cross-company", async (currentApp: TestApp) => {
      const otherCompanyId = "10000000-0000-4000-8000-0000000000cc";
      const otherUserId = "20000000-0000-4000-8000-0000000000cc";
      await insertOtherCompanyUser(currentApp, otherCompanyId, otherUserId);
      return insertRegisteredDevice(currentApp, {
        companyId: otherCompanyId,
        userId: otherUserId,
        status: "registered",
      });
    }],
  ] as const)("rejects %s devices without attendance side effects", async (_label, deviceFactory) => {
    const employee = await loginAs(app, "E1");
    const registeredDeviceId = await deviceFactory(app);
    const before = await attendanceSideEffectCounts(app);

    const response = await mobilePunch(app, employee.token, registeredDeviceId);

    expect(response.statusCode).toBe(409);
    expect(response.json().details.reason_code).toBe("mobile_registered_device_unavailable");
    expect(await attendanceSideEffectCounts(app)).toEqual(before);
  });

  it("requires registered_device_id for mobile source", async () => {
    const employee = await loginAs(app, "E1");
    const before = await attendanceSideEffectCounts(app);

    const response = await mobilePunch(app, employee.token, undefined);

    expect(response.statusCode).toBe(400);
    expect(response.json().details.reason_code).toBe("mobile_registered_device_required");
    expect(await attendanceSideEffectCounts(app)).toEqual(before);
  });

  it.each(["mobile_foreground", "mobile_offline"] as const)(
    "enforces registered devices for internal %s commands",
    async (source) => {
      const employee = await loginAs(app, "E1");
      const companyId = employeeCompanyId(app, employee.user.id);
      const registeredDeviceId = await insertRegisteredDevice(app, {
        companyId,
        userId: employee.user.id,
        status: "revoked",
      });
      const before = await attendanceSideEffectCounts(app);

      await expect(new AttendanceCommandService(app.store).execute({
        actor: employee.user,
        companyId,
        timeZone: "Asia/Kolkata",
        idempotencyKey: randomUUID(),
        clientEnvelope: {
          clientEventId: randomUUID(),
          capturedAt: "2026-08-03T09:00:00.000+05:30",
          device: {
            registered_device_id: registeredDeviceId,
            platform: "android",
          },
        },
        command: {
          event_type: "check_in",
          work_mode: "office",
          source,
          metadata: {},
        },
        isWorkingDayFor: () => true,
      })).rejects.toMatchObject({
        statusCode: 409,
        details: { reason_code: "mobile_registered_device_revoked" },
      });
      expect(await attendanceSideEffectCounts(app)).toEqual(before);
    },
  );

  it.each(["web", "web_geo", "kiosk"] as const)(
    "does not require registered_device_id for %s source",
    async (source) => {
      const employee = await loginAs(app, "E1");
      const payload = {
        client_event_id: randomUUID(),
        captured_at: "2026-08-03T09:00:00.000+05:30",
        device: { platform: source === "web" || source === "web_geo" ? "web" : "android" },
        command: {
          event_type: "check_in",
          work_mode: "office",
          source,
          metadata: {},
          ...(source === "web_geo"
            ? {
                location: {
                  latitude: 12.971599,
                  longitude: 77.594566,
                  accuracy_meters: 10,
                  captured_at: "2026-08-03T03:30:00.000Z",
                  provider: "browser",
                  permission_state: "granted",
                },
              }
            : {}),
        },
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employee.token), "idempotency-key": payload.client_event_id },
        payload,
      });

      expect(response.statusCode).not.toBe(400);
      expect(response.json().details?.reason_code).not.toBe("mobile_registered_device_required");
    },
  );

  it("does not rewrite historical attendance after revocation", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
      status: "registered",
    });

    const punch = await mobilePunch(app, employee.token, registeredDeviceId);
    expect(punch.statusCode).toBe(200);
    const before = await attendanceSideEffectCounts(app);

    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/platform/devices/${registeredDeviceId}/revoke`,
      headers: authHeader(employee.token),
      payload: { reason: "lost" },
    });

    expect(revoke.statusCode).toBe(200);
    expect(await attendanceSideEffectCounts(app)).toEqual(before);
  });

  it("rejects new mobile evidence after revocation commits", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
      status: "registered",
    });
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/platform/devices/${registeredDeviceId}/revoke`,
      headers: authHeader(employee.token),
      payload: { reason: "lost" },
    });
    expect(revoke.statusCode).toBe(200);
    const before = await attendanceSideEffectCounts(app);

    const response = await mobilePunch(app, employee.token, registeredDeviceId);

    expect(response.statusCode).toBe(409);
    expect(response.json().details.reason_code).toBe("mobile_registered_device_revoked");
    expect(await attendanceSideEffectCounts(app)).toEqual(before);
  });
});

async function mobilePunch(
  app: TestApp,
  token: string,
  registeredDeviceId: string | undefined,
) {
  const clientEventId = randomUUID();
  return app.inject({
    method: "POST",
    url: "/api/v1/attendance/punches",
    headers: { ...authHeader(token), "idempotency-key": clientEventId },
    payload: {
      client_event_id: clientEventId,
      captured_at: "2026-08-03T09:00:00.000+05:30",
      device: {
        ...(registeredDeviceId ? { registered_device_id: registeredDeviceId } : {}),
        platform: "android",
        app_version: "2026.08.03",
      },
      command: {
        event_type: "check_in",
        work_mode: "office",
        source: "mobile",
        metadata: {},
      },
    },
  });
}

async function clearAttendanceRuntimeFixtures(app: TestApp): Promise<void> {
  await app.store.pgPool!.query(`
    TRUNCATE TABLE
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.punch_events,
      attendance.command_decisions,
      attendance.command_executions,
      attendance.employee_command_states,
      attendance.break_segments,
      attendance.sessions
    RESTART IDENTITY CASCADE
  `);
  await app.store.pgPool!.query(`
    DELETE FROM platform.outbox_events
    WHERE aggregate_type = 'attendance'
  `);
  await app.store.pgPool!.query(`
    DELETE FROM platform.idempotency_keys
    WHERE scope LIKE 'attendance.punch:%'
  `);
}

function employeeCompanyId(app: TestApp, employeeUserId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employeeUserId,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return companyId;
}

async function insertRegisteredDevice(
  app: TestApp,
  input: {
    companyId: string;
    userId: string;
    status: "registered" | "suspended" | "revoked";
  },
): Promise<string> {
  const installationHash = createHash("sha256")
    .update(`attendance-device-lifecycle:${randomUUID()}`)
    .digest("hex");
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO platform.registered_devices (
       company_id, user_id, installation_id_hash, platform, status, status_changed_at
     )
     VALUES ($1, $2, $3, 'android', $4, now())
     RETURNING id`,
    [input.companyId, input.userId, installationHash, input.status],
  );
  return result.rows[0]!.id;
}

async function insertOtherCompanyUser(
  app: TestApp,
  companyId: string,
  userId: string,
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
     VALUES ($1, 'Attendance Device Other Company', 'attendance-device-other-company', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [companyId],
  );
  await app.store.pgPool!.query(
    `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
     VALUES ($1, $2, 'Employee', $3)
     ON CONFLICT (user_id) DO UPDATE
     SET active_role = EXCLUDED.active_role,
         company_id = EXCLUDED.company_id,
         updated_at = now()`,
    [randomUUID(), userId, companyId],
  );
}

async function attendanceSideEffectCounts(app: TestApp) {
  const result = await app.store.pgPool!.query<{
    commands: string;
    events: string;
    location_evidence: string;
    decisions: string;
    punches: string;
    sessions: string;
    outbox: string;
  }>(
    `SELECT
      (SELECT count(*) FROM attendance.command_executions) AS commands,
      (SELECT count(*) FROM attendance.attendance_events) AS events,
      (SELECT count(*) FROM attendance.location_evidence) AS location_evidence,
      (SELECT count(*) FROM attendance.command_decisions) AS decisions,
      (SELECT count(*) FROM attendance.punch_events) AS punches,
      (SELECT count(*) FROM attendance.sessions) AS sessions,
      (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type = 'attendance') AS outbox`,
  );
  return result.rows[0]!;
}
