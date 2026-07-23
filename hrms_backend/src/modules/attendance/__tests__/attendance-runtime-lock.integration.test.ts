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

function attendanceTimeZoneFor(app: TestApp, employeeUserId: string): string {
  const user = app.store.users.find((candidate) => candidate.id === employeeUserId);
  const companyId = companyIdFor(app, employeeUserId);
  const company = app.store.companyProfiles.find((candidate) => candidate.id === companyId);
  return user?.timezone ?? company?.timezone ?? "Asia/Kolkata";
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
      attendance.break_segments,
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

  it("persists one break segment and completes the runtime state after checkout", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = companyIdFor(app, employee.user.id);
    const headers = (idempotencyKey: string) => ({
      ...authHeader(employee.token),
      "idempotency-key": idempotencyKey,
    });
    const punch = async (
      event_type: "check_in" | "break_start" | "break_end" | "check_out",
      key: string,
    ) =>
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: headers(key),
        payload: { ...punchPayload, event_type },
      });

    const checkIn = await punch("check_in", "attendance-break-chain-in-001");
    expect(checkIn.statusCode).toBe(200);
    const sessionId = checkIn.json().session_id;
    const breakStart = await punch("break_start", "attendance-break-chain-start-001");
    expect(breakStart.statusCode).toBe(200);
    expect((await punch("break_end", "attendance-break-chain-end-001")).statusCode).toBe(200);
    expect((await punch("check_out", "attendance-break-chain-out-001")).statusCode).toBe(200);

    const completedCycleRejections = [
      ["check_in", "attendance-break-chain-repeat-in-001"],
      ["break_start", "attendance-break-chain-repeat-start-001"],
      ["break_end", "attendance-break-chain-repeat-end-001"],
      ["check_out", "attendance-break-chain-repeat-out-001"],
    ] as const;
    for (const [eventType, key] of completedCycleRejections) {
      const rejected = await punch(eventType, key);
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json()).toMatchObject({
        message: "The attendance cycle is already completed.",
        details: { reason_code: "attendance_cycle_completed" },
      });
    }

    const state = await app.store.pgPool!.query<{
      state: string;
      current_session_id: string;
      status: string;
      closed_at: Date | null;
      open_sessions: string;
      active_breaks: string;
      break_segments: string;
      punches: string;
      denied_punches: string;
      denied_outbox_events: string;
      punch_outbox_events: string;
    }>(
      `SELECT runtime.state, runtime.current_session_id, session.closed_at,
          session.status,
          (SELECT count(*) FROM attendance.sessions open_session
            WHERE open_session.company_id = runtime.company_id
              AND open_session.employee_user_id = runtime.employee_user_id
              AND open_session.closed_at IS NULL
              AND open_session.deleted_at IS NULL) AS open_sessions,
          (SELECT count(*) FROM attendance.break_segments break_segment
            WHERE break_segment.company_id = session.company_id
              AND break_segment.session_id = session.id
              AND break_segment.ended_at IS NULL) AS active_breaks,
          (SELECT count(*) FROM attendance.break_segments break_segment
            WHERE break_segment.company_id = session.company_id
              AND break_segment.session_id = session.id) AS break_segments,
          (SELECT count(*) FROM attendance.punch_events punch
            WHERE punch.company_id = session.company_id
              AND punch.employee_user_id = runtime.employee_user_id
              AND punch.session_id = session.id
              AND punch.deleted_at IS NULL) AS punches,
          (SELECT count(*) FROM attendance.punch_events punch
            JOIN attendance.command_executions command
              ON command.id = punch.command_execution_id
            WHERE command.company_id = runtime.company_id
              AND command.employee_user_id = runtime.employee_user_id
              AND command.idempotency_key = ANY($4::text[])) AS denied_punches,
          (SELECT count(*) FROM platform.outbox_events outbox
            JOIN attendance.command_executions command
              ON command.id::text = outbox.payload ->> 'command_id'
            WHERE command.company_id = runtime.company_id
              AND command.employee_user_id = runtime.employee_user_id
              AND command.idempotency_key = ANY($4::text[])) AS denied_outbox_events,
          (SELECT count(*) FROM platform.outbox_events outbox
            WHERE outbox.aggregate_type = 'attendance'
              AND outbox.event_type = 'attendance.punch.recorded'
              AND outbox.payload ->> 'session_id' = session.id::text) AS punch_outbox_events
        FROM attendance.employee_command_states runtime
        JOIN attendance.sessions session ON session.id = runtime.current_session_id
        WHERE runtime.company_id = $1
          AND runtime.employee_user_id = $2
          AND runtime.current_session_id = $3`,
      [
        companyId,
        employee.user.id,
        sessionId,
        completedCycleRejections.map(([, key]) => key),
      ],
    );
    expect(state.rows[0]).toMatchObject({
      state: "completed",
      current_session_id: sessionId,
      status: "closed",
      open_sessions: "0",
      active_breaks: "0",
      break_segments: "1",
      punches: "4",
      denied_punches: "0",
      denied_outbox_events: "0",
      punch_outbox_events: "4",
    });
    expect(state.rows[0]?.closed_at).toBeInstanceOf(Date);
  });

  it("serializes concurrent break starts to one active break", async () => {
    const employee = await loginAs(app, "E1");
    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": "attendance-break-race-in-001" },
      payload: punchPayload,
    });
    expect(checkIn.statusCode).toBe(200);

    const results = await Promise.all(["001", "002"].map((suffix) => app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": `attendance-break-race-start-${suffix}` },
      payload: { ...punchPayload, event_type: "break_start" },
    })));
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);

    const activeBreaks = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) FROM attendance.break_segments
        WHERE session_id = $1 AND ended_at IS NULL`,
      [checkIn.json().session_id],
    );
    expect(activeBreaks.rows[0]?.count).toBe("1");
  });

  it("serializes concurrent break ends to one conditional break closure", async () => {
    const employee = await loginAs(app, "E1");
    const send = (event_type: "check_in" | "break_start" | "break_end", key: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employee.token), "idempotency-key": key },
        payload: { ...punchPayload, event_type },
      });
    const checkIn = await send("check_in", "attendance-break-end-race-in-001");
    expect(checkIn.statusCode).toBe(200);
    expect((await send("break_start", "attendance-break-end-race-start-001")).statusCode).toBe(200);

    const results = await Promise.all(["001", "002"].map((suffix) =>
      send("break_end", `attendance-break-end-race-end-${suffix}`),
    ));
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    const persisted = await app.store.pgPool!.query<{
      active_breaks: string;
      state: string;
    }>(
      `SELECT
          (SELECT count(*) FROM attendance.break_segments
            WHERE session_id = $1 AND ended_at IS NULL) AS active_breaks,
          (SELECT state FROM attendance.employee_command_states
            WHERE employee_user_id = $2) AS state`,
      [checkIn.json().session_id, employee.user.id],
    );
    expect(persisted.rows[0]).toEqual({ active_breaks: "0", state: "working" });
  });

  it("leaves no invalid session or break when break start races checkout", async () => {
    const employee = await loginAs(app, "E1");
    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": "attendance-start-checkout-race-in-001" },
      payload: punchPayload,
    });
    expect(checkIn.statusCode).toBe(200);
    const results = await Promise.all([
      app.inject({
        method: "POST", url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employee.token), "idempotency-key": "attendance-start-checkout-race-start-001" },
        payload: { ...punchPayload, event_type: "break_start" },
      }),
      app.inject({
        method: "POST", url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employee.token), "idempotency-key": "attendance-start-checkout-race-out-001" },
        payload: { ...punchPayload, event_type: "check_out" },
      }),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    const persisted = await app.store.pgPool!.query<{ closed_at: Date | null; active_breaks: string; state: string }>(
      `SELECT session.closed_at,
          (SELECT count(*) FROM attendance.break_segments
            WHERE session_id = session.id AND ended_at IS NULL) AS active_breaks,
          runtime.state
        FROM attendance.sessions session
        JOIN attendance.employee_command_states runtime ON runtime.current_session_id = session.id
        WHERE session.id = $1`,
      [checkIn.json().session_id],
    );
    expect(persisted.rows[0]?.active_breaks).toBe(
      persisted.rows[0]?.closed_at ? "0" : "1",
    );
    expect(persisted.rows[0]?.state).toBe(
      persisted.rows[0]?.closed_at ? "completed" : "on_break",
    );
  });

  it("allows only valid serialization outcomes when break end races checkout", async () => {
    const employee = await loginAs(app, "E1");
    const send = (event_type: "check_in" | "break_start" | "break_end" | "check_out", key: string) =>
      app.inject({
        method: "POST", url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employee.token), "idempotency-key": key },
        payload: { ...punchPayload, event_type },
      });
    const checkIn = await send("check_in", "attendance-end-checkout-race-in-001");
    expect(checkIn.statusCode).toBe(200);
    expect((await send("break_start", "attendance-end-checkout-race-start-001")).statusCode).toBe(200);
    const results = await Promise.all([
      send("break_end", "attendance-end-checkout-race-end-001"),
      send("check_out", "attendance-end-checkout-race-out-001"),
    ]);
    expect(results.some((result) => result.statusCode === 200)).toBe(true);
    expect(results.every((result) => [200, 409].includes(result.statusCode))).toBe(true);
    const persisted = await app.store.pgPool!.query<{ closed_at: Date | null; active_breaks: string; state: string }>(
      `SELECT session.closed_at,
          (SELECT count(*) FROM attendance.break_segments
            WHERE session_id = session.id AND ended_at IS NULL) AS active_breaks,
          runtime.state
        FROM attendance.sessions session
        JOIN attendance.employee_command_states runtime ON runtime.current_session_id = session.id
        WHERE session.id = $1`,
      [checkIn.json().session_id],
    );
    expect(persisted.rows[0]).toMatchObject({ active_breaks: "0" });
    expect(["working", "completed"]).toContain(persisted.rows[0]?.state);
  });

  it("reconciles a legacy NOT_STARTED runtime row to the completed current cycle", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = companyIdFor(app, employee.user.id);
    const pool = app.store.pgPool!;
    const timeZone = attendanceTimeZoneFor(app, employee.user.id);
    const fixture = await pool.query<{ id: string }>(
      `INSERT INTO attendance.sessions (
        company_id, employee_user_id, work_date, status, checked_in_at,
        closed_at, active_break_started_at, last_transition_at, work_mode,
        source, metadata, version, created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, (transaction_timestamp() AT TIME ZONE $3)::date,
        'closed', transaction_timestamp() - interval '2 hours',
        transaction_timestamp() - interval '1 hour', NULL,
        transaction_timestamp() - interval '1 hour', 'office', 'web',
        '{}'::jsonb, 1, now(), now(), NULL
      ) RETURNING id`,
      [companyId, employee.user.id, timeZone],
    );
    const sessionId = fixture.rows[0]?.id;
    if (!sessionId) throw new Error("Completed session fixture was not created.");
    await pool.query(
      `INSERT INTO attendance.employee_command_states (
        company_id, employee_user_id, state, current_session_id, version, created_at, updated_at
      ) VALUES ($1, $2, 'not_checked_in', NULL, 1, now(), now())`,
      [companyId, employee.user.id],
    );

    const result = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": "attendance-legacy-completed-001" },
      payload: punchPayload,
    });
    expect(result.statusCode).toBe(409);
    expect(result.json()).toMatchObject({
      details: { reason_code: "attendance_cycle_completed" },
    });
    const runtime = await pool.query<{ state: string; current_session_id: string }>(
      `SELECT state, current_session_id FROM attendance.employee_command_states
        WHERE company_id = $1 AND employee_user_id = $2`,
      [companyId, employee.user.id],
    );
    expect(runtime.rows[0]).toEqual({ state: "completed", current_session_id: sessionId });
  });

  it("allows a new check-in after the completed attendance cycle rolls over", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = companyIdFor(app, employee.user.id);
    const pool = app.store.pgPool!;
    const timeZone = attendanceTimeZoneFor(app, employee.user.id);
    const fixture = await pool.query<{ id: string }>(
      `INSERT INTO attendance.sessions (
        company_id, employee_user_id, work_date, status, checked_in_at,
        closed_at, active_break_started_at, last_transition_at, work_mode,
        source, metadata, version, created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, ((transaction_timestamp() AT TIME ZONE $3)::date - 1),
        'closed', transaction_timestamp() - interval '26 hours',
        transaction_timestamp() - interval '25 hours', NULL,
        transaction_timestamp() - interval '25 hours', 'office', 'web',
        '{}'::jsonb, 1, now(), now(), NULL
      ) RETURNING id`,
      [companyId, employee.user.id, timeZone],
    );
    const previousSessionId = fixture.rows[0]?.id;
    if (!previousSessionId) throw new Error("Previous-cycle session fixture was not created.");
    await pool.query(
      `INSERT INTO attendance.employee_command_states (
        company_id, employee_user_id, state, current_session_id, version, created_at, updated_at
      ) VALUES ($1, $2, 'completed', $3, 1, now(), now())`,
      [companyId, employee.user.id, previousSessionId],
    );

    const result = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": "attendance-cycle-rollover-001" },
      payload: punchPayload,
    });
    expect(result.statusCode).toBe(200);
    const runtime = await pool.query<{ state: string; current_session_id: string }>(
      `SELECT state, current_session_id FROM attendance.employee_command_states
        WHERE company_id = $1 AND employee_user_id = $2`,
      [companyId, employee.user.id],
    );
    expect(runtime.rows[0]).toEqual({
      state: "working",
      current_session_id: result.json().session_id,
    });
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
