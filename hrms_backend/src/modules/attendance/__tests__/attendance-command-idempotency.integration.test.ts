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
        device: {
          os: "android",
          attestation: "private-attestation",
        },
        latitude: 12.971599,
        longitude: 77.594566,
        coordinates: [77.594566, 12.971599],
      },
    };

    const requestStartedAt = Date.now();

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload,
    });

    const requestCompletedAt = Date.now();

    expect(first.statusCode).toBe(200);
    expect(first.json().day_status).toMatchObject({
      day_classification: expect.any(String),
      presence_state: "incomplete",
      evidence_state: "partial",
      payroll_state: "unprocessed",
      work_seconds: expect.any(Number),
      break_seconds: 0,
      scheduled_seconds: expect.any(Number),
    });

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload,
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      command_id: first.json().command_id,
      decision_id: first.json().decision_id,
      session_id: first.json().session_id,
      punch_id: first.json().punch_id,
      punch: {
        occurred_at: first.json().punch.occurred_at,
      },
      day_status: first.json().day_status,
    });

    const counts = await app.store.pgPool!.query<{
      platform_keys: string;
      commands: string;
      decisions: string;
      audit_decisions: string;
      evidence: string;
      sessions: string;
      punches: string;
      outbox_events: string;
    }>(
      `SELECT
      (SELECT count(*)
       FROM platform.idempotency_keys
       WHERE idempotency_key = $1) AS platform_keys,

      (SELECT count(*)
       FROM attendance.command_executions
       WHERE idempotency_key = $1) AS commands,

      (SELECT count(*)
       FROM attendance.command_decisions
       WHERE command_execution_id = $2) AS decisions,

      (SELECT count(*)
       FROM attendance.attendance_events
       WHERE command_execution_id = $2) AS evidence,

      (SELECT count(*)
       FROM attendance.attendance_decisions
       WHERE command_execution_id = $2) AS audit_decisions,

      (SELECT count(*)
       FROM attendance.sessions
       WHERE id = $3) AS sessions,

      (SELECT count(*)
       FROM attendance.punch_events
       WHERE command_execution_id = $2) AS punches,

      (SELECT count(*)
       FROM platform.outbox_events
       WHERE aggregate_id = $4) AS outbox_events`,
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
      audit_decisions: "1",
      evidence: "1",
      sessions: "1",
      punches: "1",
      outbox_events: "1",
    });

    const expectedPolicyVersion = String(
      app.store.adminPolicies.find(
        (candidate) =>
          candidate.company_id === first.json().punch.company_id &&
          candidate.policy_key === "attendance" &&
          candidate.status === "active" &&
          !candidate.deleted_at,
      )?.version ?? "built-in-default",
    );

    const ledger = await app.store.pgPool!.query<{
      evidence_id: string;
      evidence_command_id: string;
      audit_event_id: string;
      audit_command_id: string;
      command_decision_command_id: string;
      policy_version: string;
      payload: Record<string, unknown>;
      payload_hash: string;
      evidence_digest: string;
      location_rows: string;
    }>(
      `SELECT
        evidence.id AS evidence_id,
        evidence.command_execution_id AS evidence_command_id,
        audit.attendance_event_id AS audit_event_id,
        audit.command_execution_id AS audit_command_id,
        command_decision.command_execution_id
          AS command_decision_command_id,
        audit.policy_version,
        evidence.payload,
        evidence.payload_hash,
        audit.evidence_digest,
        (
          SELECT count(*)
          FROM attendance.location_evidence location
          WHERE location.attendance_event_id = evidence.id
        ) AS location_rows
      FROM attendance.attendance_events evidence
      JOIN attendance.attendance_decisions audit
        ON audit.command_execution_id = evidence.command_execution_id
      JOIN attendance.command_decisions command_decision
        ON command_decision.command_execution_id =
          evidence.command_execution_id
      WHERE evidence.command_execution_id = $1`,
      [first.json().command_id],
    );

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      evidence_command_id: first.json().command_id,
      audit_event_id: ledger.rows[0]?.evidence_id,
      audit_command_id: first.json().command_id,
      command_decision_command_id: first.json().command_id,
      policy_version: expectedPolicyVersion,
      payload_hash: ledger.rows[0]?.evidence_digest,
      location_rows: "0",
    });

    const evidencePayload = ledger.rows[0]?.payload;

    expect(evidencePayload).toEqual({
      schema_version: 1,
      command_type: "check_in",
      work_mode: "office",
      source_channel: "web",
    });

    for (const excludedField of [
      "occurred_at",
      "metadata",
      "latitude",
      "longitude",
      "coordinates",
      "device",
      "attestation",
    ]) {
      expect(evidencePayload).not.toHaveProperty(excludedField);
    }

    const timestamps = await app.store.pgPool!.query<{
      command_at: Date;
      evidence_at: Date;
      received_at: Date;
      evaluated_at: Date;
      session_at: Date;
      punch_at: Date;
    }>(
      `SELECT
        command.occurred_at AS command_at,
        evidence.occurred_at AS evidence_at,
        evidence.received_at,
        audit.evaluated_at,
        session.checked_in_at AS session_at,
        punch.occurred_at AS punch_at
      FROM attendance.command_executions command
      JOIN attendance.attendance_events evidence
        ON evidence.command_execution_id = command.id
      JOIN attendance.attendance_decisions audit
        ON audit.command_execution_id = command.id
      JOIN attendance.sessions session
        ON session.id = command.session_id
      JOIN attendance.punch_events punch
        ON punch.id = command.punch_event_id
      WHERE command.id = $1`,
      [first.json().command_id],
    );

    const timestampRow = timestamps.rows[0];
    expect(timestampRow).toBeDefined();

    const commandTime = timestampRow!.command_at.toISOString();
    const commandTimestamp = timestampRow!.command_at.getTime();

    // The current punch timestamp must be server-generated during the request.
    // A small tolerance avoids failures caused by minor clock precision differences.
    expect(commandTimestamp).toBeGreaterThanOrEqual(requestStartedAt - 5_000);
    expect(commandTimestamp).toBeLessThanOrEqual(requestCompletedAt + 5_000);

    expect(
      [
        timestampRow!.evidence_at,
        timestampRow!.received_at,
        timestampRow!.evaluated_at,
        timestampRow!.session_at,
        timestampRow!.punch_at,
      ].map((value) => value.toISOString()),
    ).toEqual([
      commandTime,
      commandTime,
      commandTime,
      commandTime,
      commandTime,
    ]);

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
        origin: "employee_manual_now",
      },
    });

    const persistedPayload = outbox.rows[0]?.payload;

    expect(persistedPayload?.occurred_at).toBe(commandTime);

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
        "origin",
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
      payload: {
        ...payload,
        work_mode: "remote",
      },
    });

    expect(changed.statusCode).toBe(409);
    expect(changed.json().message).toBe(
      "Idempotency key was already used with a different attendance command.",
    );
  });

  it("uses the built-in attendance policy when no active policy is persisted", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = app.store.userSessionPreferences.find(
      (preference) => preference.user_id === employee.user.id,
    )?.company_id;
    if (!companyId) throw new Error("Employee company fixture is unavailable.");
    await app.store.pgPool!.query(
      `UPDATE attendance.policies
        SET status = 'inactive'
        WHERE company_id = $1
          AND policy_key = 'attendance'`,
      [companyId],
    );
    await app.store.pgPool!.query(
      `UPDATE attendance.policy_assignments
        SET status = 'inactive'
        WHERE company_id = $1
          AND scope_type = 'company'
          AND scope_id IS NULL`,
      [companyId],
    );
    const idempotencyKey = "attendance-idempotency-built-in-policy-001";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": idempotencyKey,
      },
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
      },
    });
    expect(response.statusCode).toBeLessThan(500);

    const audit = await app.store.pgPool!.query<{ policy_version: string }>(
      `SELECT audit.policy_version
        FROM attendance.attendance_decisions audit
        JOIN attendance.command_executions command
          ON command.id = audit.command_execution_id
        WHERE command.idempotency_key = $1`,
      [idempotencyKey],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.policy_version).toBe("built-in-default");
  });

  it("projects separate session intervals and their session-owned breaks", async () => {
    const employee = await loginAs(app, "E1");
    const pool = app.store.pgPool!;
    const companyId = app.store.userSessionPreferences.find(
      (preference) => preference.user_id === employee.user.id,
    )?.company_id;
    if (!companyId) throw new Error("Employee company fixture is unavailable.");
    const timeZone =
      app.store.users.find((user) => user.id === employee.user.id)?.timezone ??
      app.store.companyProfiles.find((company) => company.id === companyId)
        ?.timezone ??
      "Asia/Kolkata";
    const clock = await pool.query<{ work_date: string; as_of: Date }>(
      `SELECT (transaction_timestamp() AT TIME ZONE $1)::date::text AS work_date,
          transaction_timestamp() AS as_of`,
      [timeZone],
    );
    const workDate = clock.rows[0]?.work_date;
    const asOf = clock.rows[0]?.as_of;
    if (!workDate || !asOf) throw new Error("Fixture clock is unavailable.");
    const firstCheckIn = new Date(asOf.getTime() - 210 * 60_000);
    const firstCheckOut = new Date(asOf.getTime() - 150 * 60_000);
    const secondCheckIn = new Date(asOf.getTime() - 90 * 60_000);

    const firstSession = await pool.query<{
      id: string;
      checked_in_at: Date;
    }>(
      `INSERT INTO attendance.sessions (
        company_id, employee_user_id, work_date, status, checked_in_at,
        closed_at, active_break_started_at, last_transition_at, work_mode,
        source, metadata, version, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3::date, 'closed', $4, $5, NULL, $5, 'office', 'web',
        '{}'::jsonb, 1, $4, $5, NULL)
      RETURNING id, checked_in_at`,
      [companyId, employee.user.id, workDate, firstCheckIn, firstCheckOut],
    );
    const secondSession = await pool.query<{ id: string; checked_in_at: Date }>(
      `INSERT INTO attendance.sessions (
        company_id, employee_user_id, work_date, status, checked_in_at,
        closed_at, active_break_started_at, last_transition_at, work_mode,
        source, metadata, version, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3::date, 'working', $4, NULL, NULL, $4, 'office', 'web',
        '{}'::jsonb, 1, $4, $4, NULL)
      RETURNING id, checked_in_at`,
      [companyId, employee.user.id, workDate, secondCheckIn],
    );
    const firstSessionId = firstSession.rows[0]?.id;
    const secondSessionId = secondSession.rows[0]?.id;
    const secondSessionCheckIn = secondSession.rows[0]?.checked_in_at;
    if (!firstSessionId || !secondSessionId || !secondSessionCheckIn) {
      throw new Error("Fixture sessions were not created.");
    }
    await pool.query(
      `INSERT INTO attendance.employee_command_states (
        company_id, employee_user_id, state, current_session_id, version,
        created_at, updated_at
      ) VALUES ($1, $2, 'working', $3, 1, now(), now())`,
      [companyId, employee.user.id, secondSessionId],
    );
    await pool.query(
      `INSERT INTO attendance.punch_events (
        company_id, employee_user_id, actor_user_id, event_type, occurred_at, work_mode,
        source, origin, metadata, session_id, created_at, deleted_at
      ) VALUES
        ($1, $2, $2, 'break_start', $3::timestamptz + interval '30 minutes', 'office', 'web', 'employee_manual_now', '{}'::jsonb, $4, now(), NULL),
        ($1, $2, $2, 'break_end', $3::timestamptz + interval '45 minutes', 'office', 'web', 'employee_manual_now', '{}'::jsonb, $4, now(), NULL)`,
      [companyId, employee.user.id, secondSessionCheckIn, secondSessionId],
    );

    const checkOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": "attendance-idempotency-projection-sessions-001",
      },
      payload: {
        event_type: "check_out",
        work_mode: "office",
        source: "web",
        metadata: {},
      },
    });
    expect(checkOut.statusCode).toBe(200);

    const projection = await pool.query<{
      work_date: string;
      first_check_in: Date;
      last_check_out: Date;
      work_minutes: number;
      break_minutes: number;
      final_checkout: Date;
    }>(
      `SELECT day.work_date::text, day.first_check_in, day.last_check_out,
          day.work_minutes, day.break_minutes, punch.occurred_at AS final_checkout
        FROM attendance.daily_records day
        JOIN attendance.punch_events punch ON punch.id = $3
        WHERE day.company_id = $1
          AND day.employee_user_id = $2
          AND day.work_date = $4::date`,
      [companyId, employee.user.id, checkOut.json().punch_id, workDate],
    );
    const row = projection.rows[0];
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      work_date: workDate,
      work_minutes: 135,
      break_minutes: 15,
    });
    expect(row!.work_minutes + row!.break_minutes).toBe(150);
    expect(row!.first_check_in.toISOString()).toBe(
      firstSession.rows[0]!.checked_in_at.toISOString(),
    );
    expect(row!.last_check_out.toISOString()).toBe(
      row!.final_checkout.toISOString(),
    );
  });

  it("persists and replays a denied command as HTTP 409", async () => {
    const employee = await loginAs(app, "E1");
    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": "attendance-idempotency-denied-001",
    };
    const payload = {
      event_type: "check_out",
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
      audit_decisions: string;
      evidence: string;
      reasons: string;
      platform_keys: string;
      punch_events: string;
      outbox_events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM attendance.command_executions WHERE idempotency_key = $1) AS commands,
        (SELECT count(*) FROM attendance.command_decisions WHERE command_execution_id = (
          SELECT id FROM attendance.command_executions WHERE idempotency_key = $1
        )) AS decisions,
        (SELECT count(*) FROM attendance.attendance_events WHERE command_execution_id = (
          SELECT id FROM attendance.command_executions WHERE idempotency_key = $1
        )) AS evidence,
        (SELECT count(*) FROM attendance.attendance_decisions WHERE command_execution_id = (
          SELECT id FROM attendance.command_executions WHERE idempotency_key = $1
        )) AS audit_decisions,
        (SELECT count(*) FROM attendance.decision_reasons WHERE attendance_decision_id = (
          SELECT id FROM attendance.attendance_decisions WHERE command_execution_id = (
            SELECT id FROM attendance.command_executions WHERE idempotency_key = $1
          )
        )) AS reasons,
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
      audit_decisions: "1",
      evidence: "1",
      reasons: "1",
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
      const counts = await pool.query<{
        commands: string;
        command_decisions: string;
        audit_decisions: string;
        evidence: string;
        sessions: string;
        punches: string;
        outbox: string;
        completed_keys: string;
      }>(
        `SELECT
          (SELECT count(*) FROM attendance.command_executions) AS commands,
          (SELECT count(*) FROM attendance.command_decisions) AS command_decisions,
          (SELECT count(*) FROM attendance.attendance_decisions) AS audit_decisions,
          (SELECT count(*) FROM attendance.attendance_events) AS evidence,
          (SELECT count(*) FROM attendance.sessions) AS sessions,
          (SELECT count(*) FROM attendance.punch_events) AS punches,
          (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type = 'attendance') AS outbox,
          (SELECT count(*) FROM platform.idempotency_keys WHERE status = 'completed') AS completed_keys`,
      );
      expect(counts.rows[0]).toEqual({
        commands: "0",
        command_decisions: "0",
        audit_decisions: "0",
        evidence: "0",
        sessions: "0",
        punches: "0",
        outbox: "0",
        completed_keys: "0",
      });
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
