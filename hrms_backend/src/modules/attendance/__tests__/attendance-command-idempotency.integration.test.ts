import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

async function clearAttendanceRuntimeFixtures(app: TestApp): Promise<void> {
  const pool = app.store.pgPool;

  if (!pool) {
    throw new Error("PostgreSQL pool is unavailable.");
  }

  await pool.query(`
    TRUNCATE TABLE
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

describe("PostgreSQL attendance command idempotency", () => {
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
    try {
      if (app) {
        await clearAttendanceRuntimeFixtures(app);
      }
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

  it("replays one completed command and rejects a changed request", async () => {
    const employee = await loginAs(app, "E1");
    const idempotencyKey = "attendance-idempotency-replay-001";
    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": idempotencyKey,
    };
    const payload = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {
        device: { os: "android", attestation: "private-attestation" },
        latitude: 12.971599,
        longitude: 77.594566,
        coordinates: [77.594566, 12.971599],
      },
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload,
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: {
        ...payload,
        metadata: {
          coordinates: [77.594566, 12.971599],
          longitude: 77.594566,
          latitude: 12.971599,
          device: { attestation: "private-attestation", os: "android" },
        },
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      command_id: first.json().command_id,
      decision_id: first.json().decision_id,
      session_id: first.json().session_id,
      punch_id: first.json().punch_id,
      punch: { occurred_at: first.json().punch.occurred_at },
    });

    const counts = await app.store.pgPool!.query<{
      platform_keys: string;
      commands: string;
      decisions: string;
      sessions: string;
      punches: string;
      outbox_events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM platform.idempotency_keys WHERE idempotency_key = $1) AS platform_keys,
        (SELECT count(*) FROM attendance.command_executions WHERE idempotency_key = $1) AS commands,
        (SELECT count(*) FROM attendance.command_decisions WHERE command_execution_id = $2) AS decisions,
        (SELECT count(*) FROM attendance.sessions WHERE id = $3) AS sessions,
        (SELECT count(*) FROM attendance.punch_events WHERE command_execution_id = $2) AS punches,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = $4) AS outbox_events`,
      [
        idempotencyKey,
        first.json().command_id,
        first.json().session_id,
        first.json().punch_id,
      ],
    );
    expect(counts.rows[0]).toEqual({
      platform_keys: "1",
      commands: "1",
      decisions: "1",
      sessions: "1",
      punches: "1",
      outbox_events: "1",
    });

    const outbox = await app.store.pgPool!.query<{
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT aggregate_id, event_type, payload
       FROM platform.outbox_events
       WHERE aggregate_id = $1`,
      [first.json().punch_id],
    );
    expect(outbox.rows[0]).toMatchObject({
      aggregate_id: first.json().punch_id,
      event_type: "attendance.punch.recorded",
      payload: {
        schema_version: 1,
        company_id: first.json().punch.company_id,
        actor_user_id: employee.user.id,
        subject_employee_user_id: employee.user.id,
        command_id: first.json().command_id,
        decision_id: first.json().decision_id,
        session_id: first.json().session_id,
        punch_event_id: first.json().punch_id,
        punch_type: "check_in",
      },
    });
    const persistedPayload = outbox.rows[0]?.payload;
    expect(Object.keys(persistedPayload ?? {}).sort()).toEqual(
      [
        "schema_version",
        "company_id",
        "actor_user_id",
        "subject_employee_user_id",
        "command_id",
        "decision_id",
        "session_id",
        "punch_event_id",
        "punch_type",
        "occurred_at",
        "work_date",
        "work_mode",
        "source_channel",
        "day_status",
      ].sort(),
    );
    for (const excludedField of [
      "latitude",
      "longitude",
      "lat",
      "lng",
      "coordinates",
      "geometry",
      "geography",
      "accuracy",
      "distance",
      "boundary",
      "raw_payload",
      "metadata",
      "request_snapshot",
      "response_snapshot",
      "device",
      "attestation",
      "ip_address",
      "user_agent",
      "token",
      "authorization",
      "headers",
      "idempotency_key",
      "request_hash",
      "reason",
      "remarks",
    ]) {
      expect(persistedPayload).not.toHaveProperty(excludedField);
    }

    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: { ...payload, work_mode: "remote" },
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().message).toBe(
      "Idempotency key was already used with a different attendance command.",
    );
  });

  it("persists and replays a denied command as HTTP 409", async () => {
    const employee = await loginAs(app, "E1");
    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": "attendance-idempotency-denied-001",
    };
    const payload = {
      event_type: "break_end",
      work_mode: "office",
      source: "web",
      metadata: {},
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload,
    });

    expect(first.statusCode).toBe(409);
    expect(replay.statusCode).toBe(409);
    expect(replay.json()).toMatchObject({
      message: first.json().message,
      details: first.json().details,
    });

    const counts = await app.store.pgPool!.query<{
      commands: string;
      decisions: string;
      platform_keys: string;
      punch_events: string;
      outbox_events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM attendance.command_executions WHERE idempotency_key = $1) AS commands,
        (SELECT count(*) FROM attendance.command_decisions WHERE command_execution_id = (
          SELECT id FROM attendance.command_executions WHERE idempotency_key = $1
        )) AS decisions,
        (SELECT count(*) FROM platform.idempotency_keys WHERE idempotency_key = $1 AND status = 'completed' AND response_status = 409) AS platform_keys,
        (SELECT count(*) FROM attendance.punch_events WHERE command_execution_id = (
          SELECT id FROM attendance.command_executions WHERE idempotency_key = $1
        )) AS punch_events,
        (SELECT count(*) FROM platform.outbox_events WHERE event_type = 'attendance.punch.recorded') AS outbox_events`,
      [headers["idempotency-key"]],
    );
    expect(counts.rows[0]).toEqual({
      commands: "1",
      decisions: "1",
      platform_keys: "1",
      punch_events: "0",
      outbox_events: "0",
    });
  });

  it("rolls back the punch and outbox event when transactional outbox insertion fails", async () => {
    const pool = app.store.pgPool!;
    await pool.query(`
      CREATE OR REPLACE FUNCTION platform.fail_attendance_outbox_test_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'attendance outbox test failure';
      END;
      $$;
      CREATE TRIGGER attendance_outbox_test_failure_trg
      BEFORE INSERT ON platform.outbox_events
      FOR EACH ROW
      WHEN (NEW.aggregate_type = 'attendance')
      EXECUTE FUNCTION platform.fail_attendance_outbox_test_insert();
    `);
    try {
      const employee = await loginAs(app, "E1");
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: {
          ...authHeader(employee.token),
          "idempotency-key": "attendance-idempotency-rollback-001",
        },
        payload: {
          event_type: "check_in",
          work_mode: "office",
          source: "web",
          metadata: {},
        },
      });
      expect(response.statusCode).toBe(500);
      const counts = await pool.query<{ punches: string; outbox: string }>(
        `SELECT
          (SELECT count(*) FROM attendance.punch_events) AS punches,
          (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type = 'attendance') AS outbox`,
      );
      expect(counts.rows[0]).toEqual({ punches: "0", outbox: "0" });
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS attendance_outbox_test_failure_trg ON platform.outbox_events;
        DROP FUNCTION IF EXISTS platform.fail_attendance_outbox_test_insert();
      `);
    }
  });

  it("isolates the same textual key by actor", async () => {
    const employeeOne = await loginAs(app, "E1");
    const employeeTwo = await loginAs(app, "E2");
    const key = "attendance-idempotency-actor-001";
    const payload = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {},
    };

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employeeOne.token), "idempotency-key": key },
        payload,
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employeeTwo.token), "idempotency-key": key },
        payload,
      }),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().command_id).not.toBe(second.json().command_id);
  });

  it("reuses an expired key with a new platform reservation", async () => {
    const employee = await loginAs(app, "E1");
    const key = "attendance-idempotency-expired-001";
    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
      },
    });
    expect(checkIn.statusCode).toBe(200);
    await app.store.pgPool!.query(
      `UPDATE platform.idempotency_keys
        SET expires_at = now() - interval '1 second'
        WHERE idempotency_key = $1`,
      [key],
    );

    const checkOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: {
        event_type: "check_out",
        work_mode: "office",
        source: "web",
        metadata: {},
      },
    });
    expect(checkOut.statusCode).toBe(200);
    expect(checkOut.json().command_id).not.toBe(checkIn.json().command_id);

    const counts = await app.store.pgPool!.query<{
      platform_keys: string;
      commands: string;
    }>(
      `SELECT
        (SELECT count(*) FROM platform.idempotency_keys WHERE idempotency_key = $1) AS platform_keys,
        (SELECT count(*) FROM attendance.command_executions WHERE idempotency_key = $1) AS commands`,
      [key],
    );
    expect(counts.rows[0]).toEqual({ platform_keys: "1", commands: "2" });
  });

  it("serializes concurrent same-key requests and rejects concurrent changed bodies", async () => {
    const employee = await loginAs(app, "E1");
    const sameKey = "attendance-idempotency-concurrent-same-001";
    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": sameKey,
    };
    const checkIn = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {},
    };
    const sameResults = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers,
        payload: checkIn,
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers,
        payload: checkIn,
      }),
    ]);
    expect(sameResults.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(sameResults[0].json().command_id).toBe(
      sameResults[1].json().command_id,
    );
    const replayOutbox = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*)
       FROM platform.outbox_events
       WHERE aggregate_id = $1
         AND event_type = 'attendance.punch.recorded'`,
      [sameResults[0].json().punch_id],
    );
    expect(replayOutbox.rows[0]?.count).toBe("1");

    const changedKey = "attendance-idempotency-concurrent-changed-001";
    const changedHeaders = {
      ...authHeader(employee.token),
      "idempotency-key": changedKey,
    };
    const changedResults = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: changedHeaders,
        payload: {
          event_type: "break_start",
          work_mode: "office",
          source: "web",
          metadata: {},
        },
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: changedHeaders,
        payload: {
          event_type: "check_out",
          work_mode: "office",
          source: "web",
          metadata: {},
        },
      }),
    ]);
    expect(changedResults.map((result) => result.statusCode).sort()).toEqual([
      200, 409,
    ]);

    const conflictResponse = changedResults.find(
      (result) => result.statusCode === 409,
    );

    expect(conflictResponse?.json().message).toBe(
      "Idempotency key was already used with a different attendance command.",
    );
    const count = await app.store.pgPool!.query<{ commands: string }>(
      `SELECT count(*) AS commands FROM attendance.command_executions WHERE idempotency_key = $1`,
      [changedKey],
    );
    expect(count.rows[0]?.commands).toBe("1");
  });
});
