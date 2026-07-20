import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

const punchPayload = {
  event_type: "check_in",
  work_mode: "office",
  source: "web",
  metadata: {},
} as const;

function companyIdFor(app: TestApp, employeeUserId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employeeUserId,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return companyId;
}

async function clearAttendanceRuntimeFixtures(app: TestApp): Promise<void> {
  const pool = app.store.pgPool;
  if (!pool) {
    throw new Error("PostgreSQL pool is unavailable.");
  }

  await pool.query(`
    TRUNCATE TABLE
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.punch_events,
      attendance.command_decisions,
      attendance.command_executions,
      attendance.employee_command_states,
      attendance.sessions
    RESTART IDENTITY CASCADE
  `);

  await pool.query(`
    DELETE FROM platform.outbox_events
    WHERE aggregate_type = 'attendance'
  `);

  await pool.query(`
    DELETE FROM platform.idempotency_keys
    WHERE scope LIKE 'attendance.punch:%'
  `);
}

describe("PostgreSQL attendance runtime lock", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();

    await clearAttendanceRuntimeFixtures(app);

    const policy = app.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "attendance",
    );

    if (!policy) {
      throw new Error("Attendance policy fixture is unavailable.");
    }

    policy.config = {
      ...policy.config,
      fullDayPunchWindow: true,
      allowOffDayPunches: true,
    };
  });

  afterEach(async () => {
    await app?.close();

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("serializes distinct-key concurrent check-ins for one employee", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = companyIdFor(app, employee.user.id);
    const firstKey = "attendance-runtime-lock-check-in-001";
    const secondKey = "attendance-runtime-lock-check-in-002";
    expect(firstKey).not.toBe(secondKey);

    const results = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employee.token), "idempotency-key": firstKey },
        payload: punchPayload,
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: {
          ...authHeader(employee.token),
          "idempotency-key": secondKey,
        },
        payload: punchPayload,
      }),
    ]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([
      200, 409,
    ]);
    const successful = results.find((result) => result.statusCode === 200)!;
    const rejected = results.find((result) => result.statusCode === 409)!;
    expect(rejected.json()).toMatchObject({
      message: "The employee already has an open attendance session.",
      details: { reason_code: "already_checked_in" },
    });

    const counts = await app.store.pgPool!.query<{
      open_sessions: string;
      current_session_id: string;
      state: string;
      check_ins: string;
      outbox_events: string;
      command_count: string;
    }>(
      `SELECT
        (SELECT count(*) FROM attendance.sessions WHERE company_id = $1 AND employee_user_id = $2 AND closed_at IS NULL AND deleted_at IS NULL) AS open_sessions,
        (SELECT current_session_id FROM attendance.employee_command_states WHERE company_id = $1 AND employee_user_id = $2) AS current_session_id,
        (SELECT state FROM attendance.employee_command_states WHERE company_id = $1 AND employee_user_id = $2) AS state,
        (SELECT count(*) FROM attendance.punch_events WHERE company_id = $1 AND employee_user_id = $2 AND event_type = 'check_in' AND deleted_at IS NULL) AS check_ins,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type = 'attendance' AND payload ->> 'subject_employee_user_id' = $2::text AND payload ->> 'punch_type' = 'check_in') AS outbox_events,
        (SELECT count(*) FROM attendance.command_executions WHERE company_id = $1 AND employee_user_id = $2 AND idempotency_key IN ($3, $4)) AS command_count`,
      [companyId, employee.user.id, firstKey, secondKey],
    );
    expect(counts.rows[0]).toMatchObject({
      open_sessions: "1",
      current_session_id: successful.json().session_id,
      state: "working",
      check_ins: "1",
      outbox_events: "1",
      command_count: "2",
    });
  });

  it("allows different employees to check in concurrently", async () => {
    const [employeeOne, employeeTwo] = await Promise.all([
      loginAs(app, "E1"),
      loginAs(app, "E2"),
    ]);

    const results = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: {
          ...authHeader(employeeOne.token),
          "idempotency-key": "attendance-runtime-lock-e1-001",
        },
        payload: punchPayload,
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: {
          ...authHeader(employeeTwo.token),
          "idempotency-key": "attendance-runtime-lock-e2-001",
        },
        payload: punchPayload,
      }),
    ]);

    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
  });

  it("prevents concurrent check-outs from both completing", async () => {
    const employee = await loginAs(app, "E1");
    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": "attendance-runtime-lock-before-checkout-001",
      },
      payload: punchPayload,
    });
    expect(checkIn.statusCode).toBe(200);

    const checkOutPayload = { ...punchPayload, event_type: "check_out" };
    const results = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: {
          ...authHeader(employee.token),
          "idempotency-key": "attendance-runtime-lock-checkout-001",
        },
        payload: checkOutPayload,
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: {
          ...authHeader(employee.token),
          "idempotency-key": "attendance-runtime-lock-checkout-002",
        },
        payload: checkOutPayload,
      }),
    ]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([
      200, 409,
    ]);
    const count = await app.store.pgPool!.query<{ check_outs: string }>(
      `SELECT count(*) AS check_outs
        FROM attendance.punch_events
        WHERE employee_user_id = $1 AND event_type = 'check_out' AND deleted_at IS NULL`,
      [employee.user.id],
    );
    expect(count.rows[0]?.check_outs).toBe("1");
  });

  it("enforces the single-open-session index when the runtime lock is bypassed", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = companyIdFor(app, employee.user.id);
    const pool = app.store.pgPool!;
    const first = await pool.query<{ id: string }>(
      `INSERT INTO attendance.sessions (
        company_id, employee_user_id, work_date, status, checked_in_at,
        closed_at, active_break_started_at, last_transition_at, work_mode,
        source, metadata, version, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, current_date, 'working', now(), NULL, NULL, now(), 'office', 'web', '{}'::jsonb, 1, now(), now(), NULL)
      RETURNING id`,
      [companyId, employee.user.id],
    );
    const sessionId = first.rows[0]?.id;
    if (!sessionId) throw new Error("Fixture session was not created.");

    try {
      await expect(
        pool.query(
          `INSERT INTO attendance.sessions (
            company_id, employee_user_id, work_date, status, checked_in_at,
            closed_at, active_break_started_at, last_transition_at, work_mode,
            source, metadata, version, created_at, updated_at, deleted_at
          ) VALUES ($1, $2, current_date, 'working', now(), NULL, NULL, now(), 'office', 'web', '{}'::jsonb, 1, now(), now(), NULL)`,
          [companyId, employee.user.id],
        ),
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "attendance_sessions_single_open_idx",
      });
      const count = await pool.query<{ open_sessions: string }>(
        `SELECT count(*) AS open_sessions FROM attendance.sessions
          WHERE company_id = $1 AND employee_user_id = $2
            AND closed_at IS NULL AND deleted_at IS NULL`,
        [companyId, employee.user.id],
      );
      expect(count.rows[0]?.open_sessions).toBe("1");
    } finally {
      await pool.query("DELETE FROM attendance.sessions WHERE id = $1", [
        sessionId,
      ]);
    }
  });
});
