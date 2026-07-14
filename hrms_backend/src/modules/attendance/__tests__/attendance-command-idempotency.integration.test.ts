import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

describe("PostgreSQL attendance command idempotency", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    const policy = app.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "attendance",
    );
    if (!policy) throw new Error("Attendance policy fixture is unavailable.");
    policy.config = {
      ...policy.config,
      fullDayPunchWindow: true,
      allowOffDayPunches: true,
    };
  });

  afterEach(async () => {
    await app?.close();
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
      metadata: { device: { os: "android", version: 1 } },
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
        metadata: { device: { version: 1, os: "android" } },
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
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = $2) AS outbox_events`,
      [idempotencyKey, first.json().command_id, first.json().session_id],
    );
    expect(counts.rows[0]).toEqual({
      platform_keys: "1",
      commands: "1",
      decisions: "1",
      sessions: "1",
      punches: "1",
      outbox_events: "1",
    });

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
    }>(
      `SELECT
        (SELECT count(*) FROM attendance.command_executions WHERE idempotency_key = $1) AS commands,
        (SELECT count(*) FROM attendance.command_decisions WHERE command_execution_id = (
          SELECT id FROM attendance.command_executions WHERE idempotency_key = $1
        )) AS decisions,
        (SELECT count(*) FROM platform.idempotency_keys WHERE idempotency_key = $1 AND status = 'completed' AND response_status = 409) AS platform_keys`,
      [headers["idempotency-key"]],
    );
    expect(counts.rows[0]).toEqual({
      commands: "1",
      decisions: "1",
      platform_keys: "1",
    });
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
