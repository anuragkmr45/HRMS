import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AttendanceCoordinateRetentionDefaults } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { canonicalAttendanceResponseHash } from "../command-service.js";
import { setAttendanceObservabilityTestSink } from "../observability.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

async function clearAttendanceRuntimeFixtures(
  app: TestApp,
  options: { includePolicyFixtures?: boolean } = {},
): Promise<void> {
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
      ${options.includePolicyFixtures ? `,
      attendance.policy_assignments,
      attendance.policy_versions,
      attendance.policies` : ""}
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

function assertNoExactCoordinateLeak(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("12.971599");
  expect(serialized).not.toContain("77.594566");
  expect(serialized).not.toContain("latitude");
  expect(serialized).not.toContain("longitude");
  expect(serialized).not.toContain("altitude");
  expect(serialized).not.toContain("raw_payload");
  expect(serialized).not.toContain("geometry");
}

function punchEnvelope(input: {
  clientEventId: string;
  capturedAt?: string;
  device?: Record<string, unknown> | null;
  command: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    client_event_id: input.clientEventId,
    captured_at: input.capturedAt ?? "2026-07-08T04:00:00.000Z",
    device: input.device ?? null,
    command: input.command,
  };
}

function testClientEventId(ordinal: number): string {
  return `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}`;
}

async function allowCurrentPunchesOnAnyWeekday(app: TestApp): Promise<void> {
  const company =
    app.store.companyProfiles.find((candidate) => candidate.status === "active") ??
    app.store.companyProfiles[0];
  if (!company) throw new Error("Expected seeded active company.");
  company.working_week = "Mon-Sun";
  await app.store.persistence?.flushDomain?.("platform");
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
    await allowCurrentPunchesOnAnyWeekday(app);
  }, 30_000);

  afterEach(async () => {
    try {
      if (app) {
        await clearAttendanceRuntimeFixtures(app, { includePolicyFixtures: true });
      }
    } finally {
      try {
        await app?.close();
      } finally {
        setAttendanceObservabilityTestSink(null);
        if (originalDatabaseUrl === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = originalDatabaseUrl;
        }
      }
    }
  });

  it("migrates and constrains durable client event ids safely", async () => {
    const pool = app.store.pgPool!;
    const validClientEventId = testClientEventId(11);
    const malformedClientEventId = "not-a-uuid";
    const companyA = "11111111-1111-4111-8111-000000000011";
    const companyB = "11111111-1111-4111-8111-000000000012";
    const actorA = "11111111-1111-4111-8111-000000000013";
    const actorB = "11111111-1111-4111-8111-000000000014";
    const employeeA = "11111111-1111-4111-8111-000000000015";
    const employeeB = "11111111-1111-4111-8111-000000000016";
    const hash = "a".repeat(64);

    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'attendance'
          AND table_name = 'command_executions'
          AND column_name IN ('client_event_id', 'response_status', 'response_hash')
        ORDER BY column_name`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "client_event_id",
      "response_hash",
      "response_status",
    ]);

    await pool.query(
      `INSERT INTO attendance.command_executions (
         company_id, actor_user_id, employee_user_id, idempotency_key,
         request_hash, command_type, command_origin, occurred_at, status,
         request_snapshot
       ) VALUES
       ($1,$2,$3,'backfill-valid',$4,'check_in','employee_manual_now',now(),'received',$5::jsonb),
       ($1,$2,$3,'backfill-malformed',$4,'check_in','employee_manual_now',now(),'received',$6::jsonb),
       ($1,$2,$3,'backfill-missing',$4,'check_in','employee_manual_now',now(),'received','{}'::jsonb)`,
      [
        companyA,
        actorA,
        employeeA,
        hash,
        JSON.stringify({ envelope: { client_event_id: validClientEventId } }),
        JSON.stringify({ envelope: { client_event_id: malformedClientEventId } }),
      ],
    );
    await pool.query(
      `UPDATE attendance.command_executions
          SET client_event_id = (request_snapshot #>> '{envelope,client_event_id}')::uuid
        WHERE client_event_id IS NULL
          AND request_snapshot #>> '{envelope,client_event_id}' IS NOT NULL
          AND request_snapshot #>> '{envelope,client_event_id}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    );
    const backfilled = await pool.query<{ idempotency_key: string; client_event_id: string | null }>(
      `SELECT idempotency_key, client_event_id
         FROM attendance.command_executions
        WHERE idempotency_key LIKE 'backfill-%'
        ORDER BY idempotency_key`,
    );
    expect(backfilled.rows).toEqual([
      { idempotency_key: "backfill-malformed", client_event_id: null },
      { idempotency_key: "backfill-missing", client_event_id: null },
      { idempotency_key: "backfill-valid", client_event_id: validClientEventId },
    ]);

    await pool.query(
      `ALTER TABLE attendance.command_executions
         DROP CONSTRAINT IF EXISTS attendance_commands_replay_metadata_complete_check`,
    );
    const recoverablePlatformKeyId = testClientEventId(901);
    const unrecoverablePlatformKeyId = testClientEventId(902);
    const exactRecoveredHash = "b".repeat(64);
    await pool.query(
      `INSERT INTO platform.idempotency_keys (
         id, scope, idempotency_key, actor_user_id, request_hash,
         response_hash, status, expires_at, resource_type, resource_id,
         response_status, completed_at
       ) VALUES
       ($1,'attendance.punch:employee_manual_now:test','recoverable',$3,$4,$5,'completed',now() + interval '1 day','attendance.command_execution',$6,409,now()),
       ($2,'attendance.punch:employee_manual_now:test','unrecoverable',$3,$4,NULL,'completed',now() + interval '1 day','attendance.command_execution',$7,NULL,now())`,
      [
        recoverablePlatformKeyId,
        unrecoverablePlatformKeyId,
        actorA,
        hash,
        exactRecoveredHash,
        testClientEventId(903),
        testClientEventId(904),
      ],
    );
    await pool.query(
      `INSERT INTO attendance.command_executions (
         id, company_id, actor_user_id, employee_user_id, platform_idempotency_key_id,
         idempotency_key, request_hash, command_type, command_origin, occurred_at,
         status, request_snapshot, response_snapshot, completed_at
       ) VALUES
       ($1,$2,$3,$4,$5,'recoverable',$7,'check_in','employee_manual_now',now(),'denied','{}'::jsonb,$8::jsonb,now()),
       ($6,$2,$3,$4,$9,'unrecoverable',$7,'check_in','employee_manual_now',now(),'completed','{}'::jsonb,$8::jsonb,now())`,
      [
        testClientEventId(903),
        companyA,
        actorA,
        employeeA,
        recoverablePlatformKeyId,
        testClientEventId(904),
        hash,
        JSON.stringify({ allowed: false, reason_detail: "historical" }),
        unrecoverablePlatformKeyId,
      ],
    );
    await pool.query(
      `UPDATE attendance.command_executions AS command
       SET
         response_status = key.response_status,
         response_hash = key.response_hash
       FROM platform.idempotency_keys AS key
       WHERE command.platform_idempotency_key_id = key.id
         AND command.response_status IS NULL
         AND command.response_hash IS NULL
         AND command.response_snapshot IS NOT NULL
         AND command.completed_at IS NOT NULL
         AND command.status IN ('completed', 'denied')
         AND key.status = 'completed'
         AND key.resource_type = 'attendance.command_execution'
         AND key.resource_id = command.id
         AND key.response_status BETWEEN 100 AND 599
         AND key.response_hash ~ '^[0-9a-f]{64}$'`,
    );
    const metadataBackfill = await pool.query<{
      idempotency_key: string;
      response_status: number | null;
      response_hash: string | null;
    }>(
      `SELECT idempotency_key, response_status, response_hash
         FROM attendance.command_executions
        WHERE idempotency_key IN ('recoverable', 'unrecoverable')
        ORDER BY idempotency_key`,
    );
    expect(metadataBackfill.rows).toEqual([
      {
        idempotency_key: "recoverable",
        response_status: 409,
        response_hash: exactRecoveredHash,
      },
      {
        idempotency_key: "unrecoverable",
        response_status: null,
        response_hash: null,
      },
    ]);

    const uniqueClientEventId = testClientEventId(12);
    await pool.query(
      `INSERT INTO attendance.command_executions (
         company_id, actor_user_id, employee_user_id, idempotency_key,
         client_event_id, request_hash, command_type, command_origin,
         occurred_at, status, request_snapshot
       ) VALUES ($1,$2,$3,'unique-base',$4,$5,'check_in','employee_manual_now',now(),'received','{}'::jsonb)`,
      [companyA, actorA, employeeA, uniqueClientEventId, hash],
    );
    await expect(pool.query(
      `INSERT INTO attendance.command_executions (
         company_id, actor_user_id, employee_user_id, idempotency_key,
         client_event_id, request_hash, command_type, command_origin,
         occurred_at, status, request_snapshot
       ) VALUES ($1,$2,$3,'unique-same-actor-other-employee',$4,$5,'check_out','manager_assisted_now',now(),'received','{}'::jsonb)`,
      [companyA, actorA, employeeB, uniqueClientEventId, hash],
    )).rejects.toMatchObject({ code: "23505", constraint: "attendance_commands_client_event_actor_uq" });
    await expect(pool.query(
      `INSERT INTO attendance.command_executions (
         company_id, actor_user_id, employee_user_id, idempotency_key,
         client_event_id, request_hash, command_type, command_origin,
         occurred_at, status, request_snapshot
       ) VALUES ($1,$2,$3,'unique-other-actor',$4,$5,'check_in','employee_manual_now',now(),'received','{}'::jsonb)`,
      [companyA, actorB, employeeB, uniqueClientEventId, hash],
    )).resolves.toBeDefined();
    await expect(pool.query(
      `INSERT INTO attendance.command_executions (
         company_id, actor_user_id, employee_user_id, idempotency_key,
         client_event_id, request_hash, command_type, command_origin,
         occurred_at, status, request_snapshot
       ) VALUES ($1,$2,$3,'unique-other-company',$4,$5,'check_in','employee_manual_now',now(),'received','{}'::jsonb)`,
      [companyB, actorA, employeeA, uniqueClientEventId, hash],
    )).resolves.toBeDefined();
  });

  it("replays one completed command and rejects a changed request", async () => {
    const decisions: unknown[] = [];
    const duplicates: unknown[] = [];
    setAttendanceObservabilityTestSink({
      decision: (attributes) => decisions.push(attributes),
      duplicateEvent: (attributes) => duplicates.push(attributes),
    });
    const employee = await loginAs(app, "E1");
    const idempotencyKey = "00000000-0000-4000-8000-000000000101";
    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": idempotencyKey,
    };

    const command = {
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
    const payload = punchEnvelope({
      clientEventId: idempotencyKey,
      capturedAt: "2026-07-08T04:00:00.000Z",
      device: null,
      command,
    });

    const requestStartedAt = Date.now();

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload,
    });

    const requestCompletedAt = Date.now();

    expect(first.statusCode).toBe(200);
    expect(first.headers["idempotency-replayed"]).toBeUndefined();
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
    expect(replay.headers["idempotency-replayed"]).toBe("true");
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
    expect(decisions).toContainEqual(expect.objectContaining({
      source_channel: "web",
      outcome: "allowed",
      decision_type: "manual_attendance",
      command_origin: "employee_manual_now",
      event_type: "check_in",
    }));
    expect(duplicates).toContainEqual(expect.objectContaining({
      duplicate_kind: "client_event_replay",
      source_channel: "web",
    }));

    const counts = await app.store.pgPool!.query<{
      platform_keys: string;
      commands: string;
      decisions: string;
      audit_decisions: string;
      evidence: string;
      sessions: string;
      punches: string;
      daily_records: string;
      outbox_events: string;
      client_event_commands: string;
    }>(
      `SELECT
      (SELECT count(*)
       FROM platform.idempotency_keys
       WHERE scope = $8
         AND actor_user_id = $6
         AND idempotency_key = $1) AS platform_keys,

      (SELECT count(*)
       FROM attendance.command_executions
       WHERE company_id = $5
         AND employee_user_id = $6
         AND idempotency_key = $1) AS commands,

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
       WHERE id = $3
         AND company_id = $5
         AND employee_user_id = $6) AS sessions,

      (SELECT count(*)
       FROM attendance.punch_events
       WHERE command_execution_id = $2
         AND company_id = $5
         AND employee_user_id = $6) AS punches,

      (SELECT count(*)
       FROM attendance.daily_records
       WHERE company_id = $5
         AND employee_user_id = $6
         AND work_date = $7::date
         AND deleted_at IS NULL) AS daily_records,

      (SELECT count(*)
       FROM platform.outbox_events
       WHERE aggregate_id = $4
         AND event_type = 'attendance.punch.recorded') AS outbox_events,

      (SELECT count(*)
       FROM attendance.command_executions
       WHERE company_id = $5
         AND actor_user_id = $6
         AND client_event_id = $1::uuid) AS client_event_commands`,
      [
        idempotencyKey,
        first.json().command_id,
        first.json().session_id,
        first.json().punch_id,
        first.json().punch.company_id,
        employee.user.id,
        first.json().day_status.work_date,
        `attendance.punch:employee_manual_now:${first.json().punch.company_id}`,
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
      daily_records: "1",
      outbox_events: "1",
      client_event_commands: "1",
    });

    const snapshot = await app.store.pgPool!.query<{
      occurred_at: Date;
      request_snapshot: {
        envelope?: {
          client_event_id?: string;
          captured_at?: string;
          received_at?: string;
          device?: unknown;
          command?: Record<string, unknown>;
        };
      };
      response_snapshot: Record<string, unknown>;
      response_hash: string;
      response_status: number;
    }>(
      `SELECT occurred_at, request_snapshot, response_snapshot, response_hash, response_status
         FROM attendance.command_executions
        WHERE id = $1`,
      [first.json().command_id],
    );
    const envelope = snapshot.rows[0]?.request_snapshot.envelope;
    expect(envelope).toMatchObject({
      client_event_id: idempotencyKey,
      captured_at: "2026-07-08T04:00:00.000Z",
      received_at: expect.any(String),
      device: null,
      command: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
      },
    });
    expect(envelope?.captured_at).not.toBe(snapshot.rows[0]?.occurred_at.toISOString());
    expect(snapshot.rows[0]?.response_status).toBe(200);
    expect(snapshot.rows[0]?.response_hash).toBe(
      canonicalAttendanceResponseHash(snapshot.rows[0]!.response_snapshot),
    );
    const originalReceivedAt = envelope?.received_at;

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
        command: {
          ...(payload.command as Record<string, unknown>),
          work_mode: "remote",
        },
      },
    });

    expect(changed.statusCode).toBe(409);
    expect(changed.json().message).toContain(
      "already used with a different attendance command",
    );

    const changedLegacyCoordinates = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: {
        ...payload,
        command: {
          ...(payload.command as Record<string, unknown>),
          metadata: {
            ...((payload.command as { metadata: Record<string, unknown> }).metadata),
            latitude: 12.9716,
          },
        },
      },
    });

    expect(changedLegacyCoordinates.statusCode).toBe(200);
    expect(changedLegacyCoordinates.json()).toEqual(first.json());

    const legacyReplayCounts = await app.store.pgPool!.query<{
      commands: string;
      sessions: string;
      punches: string;
      outbox_events: string;
    }>(
      `SELECT
        (SELECT count(*)
         FROM attendance.command_executions
         WHERE id = $1
           AND idempotency_key = $2) AS commands,
        (SELECT count(*)
         FROM attendance.sessions
         WHERE id = $3) AS sessions,
        (SELECT count(*)
         FROM attendance.punch_events
         WHERE id = $4
           AND command_execution_id = $1) AS punches,
        (SELECT count(*)
         FROM platform.outbox_events
         WHERE aggregate_id = $4
           AND event_type = 'attendance.punch.recorded') AS outbox_events`,
      [
        first.json().command_id,
        idempotencyKey,
        first.json().session_id,
        first.json().punch_id,
      ],
    );
    expect(legacyReplayCounts.rows[0]).toEqual({
      commands: "1",
      sessions: "1",
      punches: "1",
      outbox_events: "1",
    });

    const replayedSnapshot = await app.store.pgPool!.query<{
      request_snapshot: { envelope?: { received_at?: string } };
    }>(
      `SELECT request_snapshot
         FROM attendance.command_executions
        WHERE id = $1`,
      [first.json().command_id],
    );
    expect(replayedSnapshot.rows[0]?.request_snapshot.envelope?.received_at).toBe(originalReceivedAt);
  });

  it("validates the attendance command envelope and fingerprints device metadata", async () => {
    const employee = await loginAs(app, "E1");
    const baseCommand = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {},
    };
    const validId = "00000000-0000-4000-8000-000000000201";

    const missingHeader = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: punchEnvelope({ clientEventId: validId, command: baseCommand }),
    });
    expect(missingHeader.statusCode).toBe(400);

    const invalidClientId = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": validId },
      payload: {
        ...punchEnvelope({ clientEventId: validId, command: baseCommand }),
        client_event_id: "not-a-uuid",
      },
    });
    expect(invalidClientId.statusCode).toBe(400);

    const invalidCapturedAt = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": validId },
      payload: {
        ...punchEnvelope({ clientEventId: validId, command: baseCommand }),
        captured_at: "not-a-timestamp",
      },
    });
    expect(invalidCapturedAt.statusCode).toBe(400);

    const suppliedReceivedAt = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": validId },
      payload: {
        ...punchEnvelope({ clientEventId: validId, command: baseCommand }),
        received_at: "2026-07-08T04:00:00.000Z",
      },
    });
    expect(suppliedReceivedAt.statusCode).toBe(400);

    const mismatch = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": "00000000-0000-4000-8000-000000000202",
      },
      payload: punchEnvelope({ clientEventId: validId, command: baseCommand }),
    });
    expect(mismatch.statusCode).toBe(400);

    const malformedDevice = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": validId },
      payload: punchEnvelope({
        clientEventId: validId,
        device: { platform: "windows", unbounded: "not accepted" },
        command: baseCommand,
      }),
    });
    expect(malformedDevice.statusCode).toBe(400);

    const deviceId = "00000000-0000-4000-8000-000000000203";
    const withDevice = punchEnvelope({
      clientEventId: deviceId,
      capturedAt: "2026-07-08T04:01:00.000Z",
      device: {
        device_id: "web-device-1",
        platform: "web",
        app_version: "2026.08.03",
        os_version: "Windows 11",
      },
      command: baseCommand,
    });
    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": deviceId },
      payload: withDevice,
    });
    expect(accepted.statusCode).toBe(200);

    const changedDevice = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": deviceId },
      payload: {
        ...withDevice,
        device: {
          device_id: "web-device-2",
          platform: "web",
        },
      },
    });
    expect(changedDevice.statusCode).toBe(409);
    expect(changedDevice.json().message).toContain(
      "already used with a different attendance command",
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
    const idempotencyKey = testClientEventId(301);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": idempotencyKey,
      },
      payload: punchEnvelope({ clientEventId: idempotencyKey, command: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
      } }),
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

  it("persists canonical location evidence without leaking coordinates into generic artifacts", async () => {
    const accuracies: Array<{ value: number; attributes: unknown }> = [];
    setAttendanceObservabilityTestSink({
      locationAccuracy: (value, attributes) => accuracies.push({ value, attributes }),
    });
    const employee = await loginAs(app, "E1");
    const idempotencyKey = testClientEventId(401);
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const payload = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {
        note: "front door",
        latitude: 1.23,
        longitude: 4.56,
        location: { latitude: 1.23, longitude: 4.56 },
      },
      location: {
        latitude: 12.971599,
        longitude: 77.594566,
        accuracy_meters: 8.5,
        captured_at: capturedAt,
        age_ms: 60_000,
        provider: "browser",
        permission_state: "granted",
        altitude_meters: 920.12,
        is_mocked: false,
        integrity_status: "basic",
      },
    };

    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": idempotencyKey,
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: punchEnvelope({ clientEventId: idempotencyKey, command: payload }),
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().punch).not.toHaveProperty("location");
    expect(first.json().punch.metadata).toEqual({ note: "front door" });
    expect(accuracies).toContainEqual({
      value: 8.5,
      attributes: {
        source_channel: "web",
        accuracy_bucket: "0_25m",
      },
    });

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: punchEnvelope({ clientEventId: idempotencyKey, command: payload }),
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().command_id).toBe(first.json().command_id);

    const persisted = await app.store.pgPool!.query<{
      command_at: Date;
      request_snapshot: Record<string, unknown>;
      response_snapshot: Record<string, unknown>;
      punch_metadata: Record<string, unknown>;
      latitude: string;
      longitude: string;
      accuracy_meters: string;
      altitude_meters: string | null;
      age_ms: number;
      permission_state: string;
      provider: string | null;
      raw_payload: Record<string, unknown>;
      coordinates_expire_at: Date | null;
      coordinate_retention_class: string | null;
      coordinate_retention_seconds: number | null;
      retention_policy_version_id: string | null;
      joined_policy_version_id: string | null;
      evaluation_context: Record<string, unknown>;
      outbox_payload: Record<string, unknown>;
      day_record: Record<string, unknown>;
      location_rows: string;
      reason_rows: string;
    }>(
      `SELECT
        command.occurred_at AS command_at,
        command.request_snapshot,
        command.response_snapshot,
        punch.metadata AS punch_metadata,
        location.latitude::text,
        location.longitude::text,
        location.accuracy_meters::text,
        location.altitude_meters::text,
        location.age_ms,
        location.permission_state,
        location.provider,
        location.raw_payload,
        location.coordinates_expire_at,
        location.coordinate_retention_class,
        location.coordinate_retention_seconds,
        location.retention_policy_version_id,
        policy_version.id AS joined_policy_version_id,
        audit.evaluation_context,
        outbox.payload AS outbox_payload,
        to_jsonb(day.*) AS day_record,
        (
          SELECT count(*)
          FROM attendance.location_evidence
          WHERE attendance_event_id = event.id
        ) AS location_rows,
        (
          SELECT count(*)
          FROM attendance.decision_reasons
          WHERE attendance_decision_id = audit.id
        ) AS reason_rows
       FROM attendance.command_executions command
       JOIN attendance.attendance_events event
         ON event.command_execution_id = command.id
       JOIN attendance.location_evidence location
         ON location.attendance_event_id = event.id
       LEFT JOIN attendance.policy_versions policy_version
         ON policy_version.id = location.retention_policy_version_id
        AND policy_version.company_id = location.company_id
       JOIN attendance.attendance_decisions audit
         ON audit.command_execution_id = command.id
       JOIN attendance.punch_events punch
         ON punch.command_execution_id = command.id
       JOIN attendance.daily_records day
         ON day.company_id = command.company_id
        AND day.employee_user_id = command.employee_user_id
       JOIN platform.outbox_events outbox
         ON outbox.aggregate_id = punch.id
       WHERE command.id = $1
       ORDER BY command.id`,
      [first.json().command_id],
    );

    expect(persisted.rows).toHaveLength(1);
    const row = persisted.rows[0]!;
    expect(row).toMatchObject({
      latitude: "12.971599",
      longitude: "77.594566",
      accuracy_meters: "8.50",
      altitude_meters: "920.12",
      permission_state: "granted",
      provider: "browser",
      coordinate_retention_class: AttendanceCoordinateRetentionDefaults.Class,
      coordinate_retention_seconds: AttendanceCoordinateRetentionDefaults.Seconds,
      location_rows: "1",
      reason_rows: "1",
    });
    expect(row.coordinates_expire_at).toBeInstanceOf(Date);
    expect(row.coordinates_expire_at!.getTime()).toBeGreaterThan(row.command_at.getTime());
    expect(row.retention_policy_version_id).toBe(row.joined_policy_version_id);
    expect(row.age_ms).toBe(
      Math.max(0, row.command_at.getTime() - Date.parse(capturedAt)),
    );
    expect(row.raw_payload).toEqual({
      schema_version: 1,
      source_channel: "web",
      provider: "browser",
      permission_state: "granted",
      client_age_ms: 60_000,
      evaluated_age_ms: row.age_ms,
    });
    expect(row.request_snapshot).toMatchObject({
      envelope: {
        client_event_id: idempotencyKey,
        captured_at: "2026-07-08T04:00:00.000Z",
        received_at: expect.any(String),
        device: null,
        command: {
          event_type: "check_in",
          work_mode: "office",
          source: "web",
          metadata: {
            note: "front door",
          },
          location: {
            latitude: 12.971599,
            longitude: 77.594566,
            accuracy_meters: 8.5,
            captured_at: capturedAt,
          },
        },
      },
      metadata: { note: "front door" },
      location_evidence_supplied: true,
    });
    expect(row.evaluation_context).toMatchObject({
      location_evidence: {
        present: true,
        age_ms: row.age_ms,
        source_channel: "web",
        provider: "browser",
        permission_state: "granted",
        accuracy_meters: 8.5,
      },
    });

    for (const artifact of [
      row.response_snapshot,
      row.punch_metadata,
      row.evaluation_context,
      row.outbox_payload,
      row.day_record,
    ]) {
      const serialized = JSON.stringify(artifact);
      expect(serialized).not.toContain("12.971599");
      expect(serialized).not.toContain("77.594566");
      expect(serialized).not.toContain("latitude");
      expect(serialized).not.toContain("longitude");
    }

    const punchHistory = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/punches/my",
      headers: authHeader(employee.token),
    });
    expect(punchHistory.statusCode).toBe(200);
    assertNoExactCoordinateLeak(punchHistory.json());

    const admin = await loginAs(app, "ADM");
    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/exports",
      headers: authHeader(admin.token),
      payload: {
        format: "json",
        filters: {
          employee_user_id: employee.user.id,
        },
      },
    });
    expect(exportJob.statusCode).toBe(200);
    assertNoExactCoordinateLeak(exportJob.json());
    assertNoExactCoordinateLeak(app.store.outbox.at(-1)?.payload ?? {});

    const changedCoordinates = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: {
        ...punchEnvelope({ clientEventId: idempotencyKey, command: payload }),
        command: {
          ...payload,
          location: {
            ...payload.location,
            latitude: 12.9716,
          },
        },
      },
    });

    expect(changedCoordinates.statusCode).toBe(409);
    expect(changedCoordinates.json().message).toContain(
      "already used with a different attendance command",
    );
  });

  it("accepts minor future location capture skew and rejects material future timestamps", async () => {
    const employee = await loginAs(app, "E1");
    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": testClientEventId(501),
    };
    const withinSkew = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: punchEnvelope({ clientEventId: testClientEventId(501), command: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: {
          latitude: 12.971599,
          longitude: 77.594566,
          accuracy_meters: 8.5,
          captured_at: new Date(Date.now() + 60_000).toISOString(),
          provider: "browser",
          permission_state: "unknown",
        },
      } }),
    });

    expect(withinSkew.statusCode).toBe(200);

    const evidence = await app.store.pgPool!.query<{ age_ms: number }>(
      `SELECT location.age_ms
       FROM attendance.location_evidence location
       JOIN attendance.attendance_events event
         ON event.id = location.attendance_event_id
       WHERE event.command_execution_id = $1`,
      [withinSkew.json().command_id],
    );
    expect(evidence.rows[0]?.age_ms).toBe(0);

    const beyondSkew = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": testClientEventId(502),
      },
      payload: punchEnvelope({ clientEventId: testClientEventId(502), command: {
        event_type: "break_start",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: {
          latitude: 12.971599,
          longitude: 77.594566,
          accuracy_meters: 8.5,
          captured_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          provider: "browser",
          permission_state: "granted",
        },
      } }),
    });

    expect(beyondSkew.statusCode).toBe(400);
    expect(beyondSkew.json().message).toContain(
      "Location captured_at is too far in the future",
    );
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
        "idempotency-key": testClientEventId(601),
      },
      payload: punchEnvelope({ clientEventId: testClientEventId(601), command: {
        event_type: "check_out",
        work_mode: "office",
        source: "web",
        metadata: {},
      } }),
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
      "idempotency-key": testClientEventId(701),
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
      payload: punchEnvelope({ clientEventId: headers["idempotency-key"], command: payload }),
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: punchEnvelope({ clientEventId: headers["idempotency-key"], command: payload }),
    });

    expect(first.statusCode).toBe(409);
    expect(replay.statusCode).toBe(409);
    expect(first.headers["idempotency-replayed"]).toBeUndefined();
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json()).toMatchObject({
      message: first.json().message,
      details: first.json().details,
    });
    expect(replay.json().request_id).toBeDefined();
    expect(first.json().request_id).toBeDefined();
    expect(replay.json().request_id).not.toBe(first.json().request_id);
    await app.store.pgPool!.query(
      `UPDATE platform.idempotency_keys
          SET expires_at = now() - interval '1 second'
        WHERE idempotency_key = $1`,
      [headers["idempotency-key"]],
    );
    const durableReplay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers,
      payload: punchEnvelope({ clientEventId: headers["idempotency-key"], command: payload }),
    });
    expect(durableReplay.statusCode).toBe(409);
    expect(durableReplay.headers["idempotency-replayed"]).toBe("true");
    expect(durableReplay.json()).toMatchObject({
      message: first.json().message,
      details: first.json().details,
    });
    expect(durableReplay.json().request_id).toBeDefined();
    expect(durableReplay.json().request_id).not.toBe(first.json().request_id);

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
      reasons: "2",
      platform_keys: "1",
      punch_events: "0",
      outbox_events: "0",
    });
    const commandMetadata = await app.store.pgPool!.query<{
      response_snapshot: Record<string, unknown>;
      response_hash: string;
      response_status: number;
    }>(
      `SELECT response_snapshot, response_hash, response_status
         FROM attendance.command_executions
        WHERE idempotency_key = $1`,
      [headers["idempotency-key"]],
    );
    expect(commandMetadata.rows[0]?.response_status).toBe(409);
    expect(commandMetadata.rows[0]?.response_hash).toBe(
      canonicalAttendanceResponseHash(commandMetadata.rows[0]!.response_snapshot),
    );
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
          "idempotency-key": testClientEventId(801),
        },
        payload: punchEnvelope({ clientEventId: testClientEventId(801), command: {
          event_type: "check_in",
          work_mode: "office",
          source: "web",
          metadata: {},
          location: {
            latitude: 12.971599,
            longitude: 77.594566,
            accuracy_meters: 8.5,
            captured_at: new Date(Date.now() - 30_000).toISOString(),
            provider: "browser",
            permission_state: "granted",
          },
        } }),
      });
      expect(response.statusCode).toBe(500);
      const counts = await pool.query<{
        commands: string;
        command_decisions: string;
        audit_decisions: string;
        evidence: string;
        location_evidence: string;
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
          (SELECT count(*) FROM attendance.location_evidence) AS location_evidence,
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
        location_evidence: "0",
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
    const key = testClientEventId(901);
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
        payload: punchEnvelope({ clientEventId: key, command: payload }),
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: { ...authHeader(employeeTwo.token), "idempotency-key": key },
        payload: punchEnvelope({ clientEventId: key, command: payload }),
      }),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().command_id).not.toBe(second.json().command_id);
  });

  it("replays an expired platform key through durable client_event_id", async () => {
    const employee = await loginAs(app, "E1");
    const key = testClientEventId(1001);
    const payload = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {},
    };
    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: punchEnvelope({ clientEventId: key, command: payload }),
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.headers["idempotency-replayed"]).toBeUndefined();
    await app.store.pgPool!.query(
      `UPDATE platform.idempotency_keys
        SET expires_at = now() - interval '1 second'
        WHERE idempotency_key = $1`,
      [key],
    );

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: punchEnvelope({ clientEventId: key, command: payload }),
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json()).toEqual(checkIn.json());

    const counts = await app.store.pgPool!.query<{
      platform_keys: string;
      commands: string;
      evidence: string;
      decisions: string;
      sessions: string;
      punches: string;
      outbox_events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM platform.idempotency_keys WHERE idempotency_key = $1) AS platform_keys,
        (SELECT count(*) FROM attendance.command_executions WHERE idempotency_key = $1) AS commands,
        (SELECT count(*) FROM attendance.attendance_events WHERE command_execution_id = $2) AS evidence,
        (SELECT count(*) FROM attendance.command_decisions WHERE command_execution_id = $2) AS decisions,
        (SELECT count(*) FROM attendance.sessions WHERE id = $3) AS sessions,
        (SELECT count(*) FROM attendance.punch_events WHERE command_execution_id = $2) AS punches,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = $4 AND event_type = 'attendance.punch.recorded') AS outbox_events`,
      [key, checkIn.json().command_id, checkIn.json().session_id, checkIn.json().punch_id],
    );
    expect(counts.rows[0]).toEqual({
      platform_keys: "1",
      commands: "1",
      evidence: "1",
      decisions: "1",
      sessions: "1",
      punches: "1",
      outbox_events: "1",
    });
  });

  it("rejects corrupt durable replay metadata after platform expiry", async () => {
    const employee = await loginAs(app, "E1");
    const key = testClientEventId(1003);
    const payload = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {},
    };
    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: punchEnvelope({ clientEventId: key, command: payload }),
    });
    expect(checkIn.statusCode).toBe(200);
    await app.store.pgPool!.query(
      `UPDATE platform.idempotency_keys
          SET expires_at = now() - interval '1 second'
        WHERE idempotency_key = $1`,
      [key],
    );
    await app.store.pgPool!.query(
      `UPDATE attendance.command_executions
          SET response_hash = $2
        WHERE idempotency_key = $1`,
      [key, "c".repeat(64)],
    );

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: punchEnvelope({ clientEventId: key, command: payload }),
    });

    expect(replay.statusCode).toBe(500);
    expect(replay.headers["idempotency-replayed"]).toBeUndefined();
    const count = await app.store.pgPool!.query<{ commands: string }>(
      `SELECT count(*) AS commands FROM attendance.command_executions WHERE idempotency_key = $1`,
      [key],
    );
    expect(count.rows[0]?.commands).toBe("1");
  });

  it("rejects same client_event_id after expiry when the request hash changes", async () => {
    const employee = await loginAs(app, "E1");
    const key = testClientEventId(1002);
    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: punchEnvelope({ clientEventId: key, command: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
      } }),
    });
    expect(checkIn.statusCode).toBe(200);
    await app.store.pgPool!.query(
      `UPDATE platform.idempotency_keys
        SET expires_at = now() - interval '1 second'
        WHERE idempotency_key = $1`,
      [key],
    );

    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": key },
      payload: punchEnvelope({ clientEventId: key, command: {
        event_type: "check_out",
        work_mode: "office",
        source: "web",
        metadata: {},
      } }),
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.headers["idempotency-replayed"]).toBeUndefined();
    expect(changed.json()).toMatchObject({
      code: "WORKFLOW_CONFLICT",
      message: "Client event was already used with a different attendance command.",
      details: { code: "CLIENT_EVENT_REUSED", client_event_id: key },
    });

    const count = await app.store.pgPool!.query<{ commands: string }>(
      `SELECT count(*) AS commands FROM attendance.command_executions WHERE idempotency_key = $1`,
      [key],
    );
    expect(count.rows[0]?.commands).toBe("1");
  });

  it("serializes concurrent same-key requests and rejects concurrent changed bodies", async () => {
    const employee = await loginAs(app, "E1");
    const sameKey = testClientEventId(1101);
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
        payload: punchEnvelope({ clientEventId: sameKey, command: checkIn }),
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers,
        payload: punchEnvelope({ clientEventId: sameKey, command: checkIn }),
      }),
    ]);
    expect(sameResults.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(sameResults[1].json()).toMatchObject({
      command_id: sameResults[0].json().command_id,
      decision_id: sameResults[0].json().decision_id,
      session_id: sameResults[0].json().session_id,
      punch_id: sameResults[0].json().punch_id,
      punch: {
        occurred_at: sameResults[0].json().punch.occurred_at,
      },
      day_status: sameResults[0].json().day_status,
    });

    const sameArtifactCounts = await app.store.pgPool!.query<{
      platform_keys: string;
      commands: string;
      decisions: string;
      audit_decisions: string;
      evidence: string;
      sessions: string;
      punches: string;
      daily_records: string;
      outbox_events: string;
    }>(
      `SELECT
        (SELECT count(*)
         FROM platform.idempotency_keys
         WHERE scope = $8
           AND actor_user_id = $6
           AND idempotency_key = $1) AS platform_keys,
        (SELECT count(*)
         FROM attendance.command_executions
         WHERE id = $2
           AND company_id = $5
           AND employee_user_id = $6
           AND idempotency_key = $1) AS commands,
        (SELECT count(*)
         FROM attendance.command_decisions
         WHERE command_execution_id = $2) AS decisions,
        (SELECT count(*)
         FROM attendance.attendance_decisions
         WHERE command_execution_id = $2) AS audit_decisions,
        (SELECT count(*)
         FROM attendance.attendance_events
         WHERE command_execution_id = $2) AS evidence,
        (SELECT count(*)
         FROM attendance.sessions
         WHERE id = $3
           AND company_id = $5
           AND employee_user_id = $6) AS sessions,
        (SELECT count(*)
         FROM attendance.punch_events
         WHERE id = $4
           AND command_execution_id = $2
           AND company_id = $5
           AND employee_user_id = $6) AS punches,
        (SELECT count(*)
         FROM attendance.daily_records
         WHERE company_id = $5
           AND employee_user_id = $6
           AND work_date = $7::date
           AND deleted_at IS NULL) AS daily_records,
        (SELECT count(*)
         FROM platform.outbox_events
         WHERE aggregate_id = $4
           AND event_type = 'attendance.punch.recorded') AS outbox_events`,
      [
        sameKey,
        sameResults[0].json().command_id,
        sameResults[0].json().session_id,
        sameResults[0].json().punch_id,
        sameResults[0].json().punch.company_id,
        employee.user.id,
        sameResults[0].json().day_status.work_date,
        `attendance.punch:employee_manual_now:${sameResults[0].json().punch.company_id}`,
      ],
    );
    expect(sameArtifactCounts.rows[0]).toEqual({
      platform_keys: "1",
      commands: "1",
      decisions: "1",
      audit_decisions: "1",
      evidence: "1",
      sessions: "1",
      punches: "1",
      daily_records: "1",
      outbox_events: "1",
    });

    const changedKey = testClientEventId(1102);
    const changedHeaders = {
      ...authHeader(employee.token),
      "idempotency-key": changedKey,
    };
    const changedResults = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: changedHeaders,
        payload: punchEnvelope({ clientEventId: changedKey, command: {
          event_type: "break_start",
          work_mode: "office",
          source: "web",
          metadata: {},
        } }),
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: changedHeaders,
        payload: punchEnvelope({ clientEventId: changedKey, command: {
          event_type: "check_out",
          work_mode: "office",
          source: "web",
          metadata: {},
        } }),
      }),
    ]);
    expect(changedResults.map((result) => result.statusCode).sort()).toEqual([
      200, 409,
    ]);

    const conflictResponse = changedResults.find(
      (result) => result.statusCode === 409,
    );

    expect(conflictResponse?.json().message).toContain(
      "already used with a different attendance command",
    );
    const count = await app.store.pgPool!.query<{ commands: string }>(
      `SELECT count(*) AS commands FROM attendance.command_executions WHERE idempotency_key = $1`,
      [changedKey],
    );
    expect(count.rows[0]?.commands).toBe("1");
  });
});
