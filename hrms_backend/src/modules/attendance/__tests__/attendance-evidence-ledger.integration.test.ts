import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { schema } from "#db";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

type LedgerFixture = {
  companyId: string;
  employeeUserId: string;
  eventId: string;
  locationEvidenceId: string;
  attendanceDecisionId: string;
  decisionReasonId: string;
  commandExecutionId: string;
  commandDecisionId: string;
};

async function truncateLedgerTables(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      attendance.regularization_correction_applications,
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_access_audit_logs,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.command_decisions,
      attendance.command_executions
    RESTART IDENTITY
  `);
}

async function createLedgerFixture(pool: Pool): Promise<LedgerFixture> {
  const commandExecution = await pool.query<{
    id: string;
    company_id: string;
    employee_user_id: string;
    actor_user_id: string;
  }>(`
    INSERT INTO attendance.command_executions (
      company_id, actor_user_id, employee_user_id, idempotency_key, request_hash,
      command_type, occurred_at, status, request_snapshot, response_snapshot,
      completed_at
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      'evidence-ledger-command-001', repeat('b', 64), 'check_in', now(),
      'denied', '{}'::jsonb, '{}'::jsonb, now()
    )
    RETURNING id, company_id, employee_user_id, actor_user_id
  `);
  const commandExecutionRow = commandExecution.rows[0];
  if (!commandExecutionRow) {
    throw new Error("Command execution fixture was not created.");
  }

  const event = await pool.query<{
    id: string;
    company_id: string;
    employee_user_id: string;
  }>(
    `
    INSERT INTO attendance.attendance_events (
      company_id, employee_user_id, actor_user_id, command_execution_id,
      event_type, source, occurred_at, payload, payload_hash
    ) VALUES ($1, $2, $3, $4, 'check_in', 'mobile', now(),
      '{"device":"test"}'::jsonb, repeat('a', 64))
    RETURNING id, company_id, employee_user_id
  `,
    [
      commandExecutionRow.company_id,
      commandExecutionRow.employee_user_id,
      commandExecutionRow.actor_user_id,
      commandExecutionRow.id,
    ],
  );
  const eventRow = event.rows[0];
  if (!eventRow) throw new Error("Attendance event fixture was not created.");

  const locationEvidence = await pool.query<{ id: string }>(
    `
    INSERT INTO attendance.location_evidence (
      attendance_event_id, company_id, employee_user_id, captured_at,
      latitude, longitude, accuracy_meters, is_mocked, raw_payload, age_ms,
      coordinates_expire_at, coordinate_retention_class, coordinate_retention_seconds
    ) VALUES (
      $1, $2, $3, now(), 12.971599, 77.594566, 8.5, false, '{}'::jsonb, 0,
      now() + interval '30 days', 'standard', 2592000
    )
    RETURNING id
  `,
    [eventRow.id, eventRow.company_id, eventRow.employee_user_id],
  );
  const locationEvidenceId = locationEvidence.rows[0]?.id;
  if (!locationEvidenceId)
    throw new Error("Location evidence fixture was not created.");

  const attendanceDecision = await pool.query<{ id: string }>(
    `
    INSERT INTO attendance.attendance_decisions (
      company_id, employee_user_id, attendance_event_id, command_execution_id,
      decision_type, outcome, policy_key, policy_version, evidence_digest,
      policy_snapshot, evaluation_context
    ) VALUES ($1, $2, $3, $4, 'geofence', 'passed', 'attendance.geofence', 'v1',
      repeat('c', 64), '{}'::jsonb, '{}'::jsonb)
    RETURNING id
  `,
    [
      eventRow.company_id,
      eventRow.employee_user_id,
      eventRow.id,
      commandExecutionRow.id,
    ],
  );
  const attendanceDecisionId = attendanceDecision.rows[0]?.id;
  if (!attendanceDecisionId)
    throw new Error("Attendance decision fixture was not created.");

  const decisionReason = await pool.query<{ id: string }>(
    `
    INSERT INTO attendance.decision_reasons (
      attendance_decision_id, company_id, reason_code, category, severity,
      ordinal, details
    ) VALUES ($1, $2, 'within_geofence', 'location', 'info', 0, '{}'::jsonb)
    RETURNING id
  `,
    [attendanceDecisionId, eventRow.company_id],
  );
  const decisionReasonId = decisionReason.rows[0]?.id;
  if (!decisionReasonId)
    throw new Error("Decision reason fixture was not created.");

  const commandDecision = await pool.query<{ id: string }>(
    `
    INSERT INTO attendance.command_decisions (
      command_execution_id, company_id, employee_user_id, outcome, reason_code,
      reason_detail, previous_state, next_state, policy_snapshot, evidence_snapshot
    ) VALUES ($1, $2, $3, 'denied', 'policy_window_rejected', 'fixture',
      'not_checked_in', 'not_checked_in', '{}'::jsonb, '{}'::jsonb)
    RETURNING id
  `,
    [commandExecutionRow.id, eventRow.company_id, eventRow.employee_user_id],
  );
  const commandDecisionId = commandDecision.rows[0]?.id;
  if (!commandDecisionId)
    throw new Error("Command decision fixture was not created.");

  return {
    companyId: eventRow.company_id,
    employeeUserId: eventRow.employee_user_id,
    eventId: eventRow.id,
    locationEvidenceId,
    attendanceDecisionId,
    decisionReasonId,
    commandExecutionId: commandExecutionRow.id,
    commandDecisionId,
  };
}

function requireApp(app: TestApp | undefined): TestApp {
  if (!app) throw new Error("Test application is unavailable.");
  return app;
}

describe("PostgreSQL attendance evidence ledger", () => {
  let app: TestApp | undefined;

  beforeEach(async () => {
    app = undefined;
    app = await buildRealApp();
    await app.ready();

    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool is unavailable.");
    await truncateLedgerTables(pool);
  });

  afterEach(async () => {
    const currentApp = app;
    app = undefined;

    try {
      if (currentApp) {
        try {
          const pool = currentApp.store.pgPool;
          if (pool) await truncateLedgerTables(pool);
        } finally {
          await currentApp.close();
        }
      }
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("inserts valid evidence, decisions, and ordered reasons", async () => {
    const pool = requireApp(app).store.pgPool!;
    const fixture = await createLedgerFixture(pool);

    const counts = await pool.query<{
      events: string;
      locations: string;
      decisions: string;
      reasons: string;
    }>(
      `
      SELECT
        (SELECT count(*) FROM attendance.attendance_events WHERE id = $1) AS events,
        (SELECT count(*) FROM attendance.location_evidence WHERE id = $2) AS locations,
        (SELECT count(*) FROM attendance.attendance_decisions WHERE id = $3) AS decisions,
        (SELECT count(*) FROM attendance.decision_reasons WHERE id = $4) AS reasons
    `,
      [
        fixture.eventId,
        fixture.locationEvidenceId,
        fixture.attendanceDecisionId,
        fixture.decisionReasonId,
      ],
    );

    expect(counts.rows[0]).toEqual({
      events: "1",
      locations: "1",
      decisions: "1",
      reasons: "1",
    });

    const ledgerRows = await pool.query<{
      command_execution_id: string;
      schema_version: number;
      received_at: Date;
      created_at: Date;
      location_company_id: string;
      location_employee_user_id: string;
      decision_company_id: string;
      decision_employee_user_id: string;
    }>(
      `
      SELECT
        event.command_execution_id,
        event.schema_version,
        event.received_at,
        event.created_at,
        location.company_id AS location_company_id,
        location.employee_user_id AS location_employee_user_id,
        decision.company_id AS decision_company_id,
        decision.employee_user_id AS decision_employee_user_id
      FROM attendance.attendance_events event
      JOIN attendance.location_evidence location ON location.id = $2
      JOIN attendance.attendance_decisions decision ON decision.id = $3
      WHERE event.id = $1
    `,
      [
        fixture.eventId,
        fixture.locationEvidenceId,
        fixture.attendanceDecisionId,
      ],
    );

    expect(ledgerRows.rows[0]).toMatchObject({
      command_execution_id: fixture.commandExecutionId,
      schema_version: 1,
      location_company_id: fixture.companyId,
      location_employee_user_id: fixture.employeeUserId,
      decision_company_id: fixture.companyId,
      decision_employee_user_id: fixture.employeeUserId,
    });
    expect(ledgerRows.rows[0]?.received_at).not.toBeNull();
    expect(ledgerRows.rows[0]?.created_at).not.toBeNull();
  });

  it("maps the evidence ledger in Drizzle and exposes GEO-S12-004 database metadata", async () => {
    const pool = requireApp(app).store.pgPool!;

    expect(schema.attendanceEvents).toBeDefined();
    expect(schema.attendanceLocationEvidence).toBeDefined();
    expect(schema.attendanceLocationAccessAuditLogs).toBeDefined();
    expect(schema.attendanceDecisions).toBeDefined();
    expect(schema.attendanceDecisionReasons).toBeDefined();

    const columns = await pool.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'attendance'
         AND table_name = 'location_evidence'
         AND column_name IN (
           'age_ms',
           'coordinate_retention_class',
           'coordinate_retention_seconds',
           'coordinates_expire_at',
           'coordinates_purged_at',
           'permission_state',
           'retention_policy_version_id'
         )
       ORDER BY column_name`,
    );
    expect(columns.rows).toEqual([
      {
        column_name: "age_ms",
        is_nullable: "NO",
        column_default: null,
      },
      {
        column_name: "coordinate_retention_class",
        is_nullable: "YES",
        column_default: null,
      },
      {
        column_name: "coordinate_retention_seconds",
        is_nullable: "YES",
        column_default: null,
      },
      {
        column_name: "coordinates_expire_at",
        is_nullable: "YES",
        column_default: null,
      },
      {
        column_name: "coordinates_purged_at",
        is_nullable: "YES",
        column_default: null,
      },
      {
        column_name: "permission_state",
        is_nullable: "NO",
        column_default: "'unknown'::text",
      },
      {
        column_name: "retention_policy_version_id",
        is_nullable: "YES",
        column_default: null,
      },
    ]);

    const constraints = await pool.query<{ conname: string; contype: string }>(
      `SELECT conname, contype
       FROM pg_constraint
       WHERE connamespace = 'attendance'::regnamespace
         AND conname IN (
           'attendance_events_id_company_uq',
           'attendance_decisions_id_company_uq',
           'location_evidence_event_company_fk',
           'attendance_decisions_event_company_fk',
           'decision_reasons_decision_company_fk',
           'location_evidence_age_ms_nonnegative_check',
           'location_evidence_permission_state_check',
           'location_evidence_provider_check',
           'location_evidence_coordinates_expire_after_received_check',
           'location_evidence_coordinates_purge_after_received_check',
           'location_evidence_retention_class_check',
           'location_evidence_retention_seconds_check',
           'location_access_audit_action_scope_check',
           'location_access_audit_no_coordinate_metadata_check',
           'location_access_audit_reason_code_check',
           'location_access_audit_request_id_check',
           'location_access_audit_operation_context_check'
         )
       ORDER BY conname`,
    );

    expect(constraints.rows).toEqual([
      {
        conname: "attendance_decisions_event_company_fk",
        contype: "f",
      },
      {
        conname: "attendance_decisions_id_company_uq",
        contype: "u",
      },
      {
        conname: "attendance_events_id_company_uq",
        contype: "u",
      },
      {
        conname: "decision_reasons_decision_company_fk",
        contype: "f",
      },
      {
        conname: "location_access_audit_action_scope_check",
        contype: "c",
      },
      {
        conname: "location_access_audit_no_coordinate_metadata_check",
        contype: "c",
      },
      {
        conname: "location_access_audit_operation_context_check",
        contype: "c",
      },
      {
        conname: "location_access_audit_reason_code_check",
        contype: "c",
      },
      {
        conname: "location_access_audit_request_id_check",
        contype: "c",
      },
      {
        conname: "location_evidence_age_ms_nonnegative_check",
        contype: "c",
      },
      {
        conname: "location_evidence_coordinates_expire_after_received_check",
        contype: "c",
      },
      {
        conname: "location_evidence_coordinates_purge_after_received_check",
        contype: "c",
      },
      {
        conname: "location_evidence_event_company_fk",
        contype: "f",
      },
      {
        conname: "location_evidence_permission_state_check",
        contype: "c",
      },
      {
        conname: "location_evidence_provider_check",
        contype: "c",
      },
      {
        conname: "location_evidence_retention_class_check",
        contype: "c",
      },
      {
        conname: "location_evidence_retention_seconds_check",
        contype: "c",
      },
    ]);
  });

  it("prevents updates and deletes while preserving immutable rows", async () => {
    const pool = requireApp(app).store.pgPool!;
    const fixture = await createLedgerFixture(pool);
    const rows = [
      {
        table: "attendance.attendance_events",
        id: fixture.eventId,
        update: "event_type = 'check_out'",
        original: "check_in",
        column: "event_type",
      },
      {
        table: "attendance.location_evidence",
        id: fixture.locationEvidenceId,
        update: "provider = 'changed'",
        original: null,
        column: "provider",
      },
      {
        table: "attendance.attendance_decisions",
        id: fixture.attendanceDecisionId,
        update: "outcome = 'failed'",
        original: "passed",
        column: "outcome",
      },
      {
        table: "attendance.decision_reasons",
        id: fixture.decisionReasonId,
        update: "reason_code = 'changed'",
        original: "within_geofence",
        column: "reason_code",
      },
      {
        table: "attendance.command_decisions",
        id: fixture.commandDecisionId,
        update: "reason_detail = 'changed'",
        original: "fixture",
        column: "reason_detail",
      },
    ];

    for (const row of rows) {
      await expect(
        pool.query(`UPDATE ${row.table} SET ${row.update} WHERE id = $1`, [
          row.id,
        ]),
      ).rejects.toThrow(
        "immutable audit/log rows cannot be updated or deleted",
      );
      await expect(
        pool.query(`DELETE FROM ${row.table} WHERE id = $1`, [row.id]),
      ).rejects.toThrow(
        "immutable audit/log rows cannot be updated or deleted",
      );

      const persisted = await pool.query<Record<string, string | null>>(
        `SELECT ${row.column} FROM ${row.table} WHERE id = $1`,
        [row.id],
      );
      expect(persisted.rows[0]?.[row.column]).toBe(row.original);
    }
  });

  it("enforces evidence and decision database checks", async () => {
    const pool = requireApp(app).store.pgPool!;
    const fixture = await createLedgerFixture(pool);

    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        latitude,
        longitude,
        accuracy_meters,
        age_ms,
        coordinates_expire_at,
        coordinate_retention_class,
        coordinate_retention_seconds
      ) VALUES ($1, $2, $3, now(), 90.000001, 0, 0, 0, now() + interval '30 days', 'standard', 2592000)`,
        [fixture.eventId, fixture.companyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        latitude,
        longitude,
        accuracy_meters,
        age_ms,
        coordinates_expire_at,
        coordinate_retention_class,
        coordinate_retention_seconds
      ) VALUES ($1, $2, $3, now(), 0, 0, 0, -1, now() + interval '30 days', 'standard', 2592000)`,
        [fixture.eventId, fixture.companyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        latitude,
        longitude,
        accuracy_meters,
        age_ms,
        permission_state,
        coordinates_expire_at,
        coordinate_retention_class,
        coordinate_retention_seconds
      ) VALUES ($1, $2, $3, now(), 0, 0, 0, 0, 'prompt', now() + interval '30 days', 'standard', 2592000)`,
        [fixture.eventId, fixture.companyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: expect.stringMatching(
        /^location_evidence_(permission_state|coordinates_by_permission)_check$/,
      ),
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        latitude,
        longitude,
        accuracy_meters,
        age_ms,
        provider,
        coordinates_expire_at,
        coordinate_retention_class,
        coordinate_retention_seconds
      ) VALUES ($1, $2, $3, now(), 0, 0, 0, 0, 'gps', now() + interval '30 days', 'standard', 2592000)`,
        [fixture.eventId, fixture.companyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_evidence_provider_check",
    });

    const otherPolicyVersion = await pool.query<{ id: string }>(`
      WITH company AS (
        INSERT INTO platform.company_profiles (
          company_name,
          company_slug,
          status
        ) VALUES (
          'GEO S12 trigger fixture',
          'geo-s12-trigger-' || replace(gen_random_uuid()::text, '-', ''),
          'active'
        )
        RETURNING id
      ),
      policy AS (
        INSERT INTO attendance.policies (
          company_id,
          policy_key,
          name,
          label
        )
        SELECT id, 'attendance', 'geo-s12-trigger', 'GEO S12 Trigger'
        FROM company
        RETURNING id, company_id
      )
      INSERT INTO attendance.policy_versions (
        company_id,
        policy_id,
        version_number,
        effective_from,
        config
      )
      SELECT company_id, id, 1, now(), '{}'::jsonb
      FROM policy
      RETURNING id
    `);
    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        latitude,
        longitude,
        accuracy_meters,
        age_ms,
        coordinates_expire_at,
        coordinate_retention_class,
        coordinate_retention_seconds,
        retention_policy_version_id
      ) VALUES ($1, $2, $3, now(), 0, 0, 0, 0, now() + interval '30 days', 'standard', 2592000, $4)`,
        [
          fixture.eventId,
          fixture.companyId,
          fixture.employeeUserId,
          otherPolicyVersion.rows[0]?.id,
        ],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_evidence_policy_version_company_check",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        latitude,
        longitude,
        accuracy_meters,
        age_ms,
        coordinates_expire_at,
        coordinate_retention_class,
        coordinate_retention_seconds
      ) VALUES ($1, $2, $3, now(), 0, 180.000001, 0, 0, now() + interval '30 days', 'standard', 2592000)`,
        [fixture.eventId, fixture.companyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        latitude,
        longitude,
        accuracy_meters,
        age_ms,
        coordinates_expire_at,
        coordinate_retention_class,
        coordinate_retention_seconds
      ) VALUES ($1, $2, $3, now(), 0, 0, -0.01, 0, now() + interval '30 days', 'standard', 2592000)`,
        [fixture.eventId, fixture.companyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.attendance_decisions (
        company_id,
        employee_user_id,
        attendance_event_id,
        decision_type,
        outcome,
        policy_key,
        policy_version
      ) VALUES (
        $1,
        $2,
        $3,
        'geofence',
        'allowed',
        'attendance.geofence',
        'v1'
      )`,
        [fixture.companyId, fixture.employeeUserId, fixture.eventId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.decision_reasons (
        attendance_decision_id,
        company_id,
        reason_code,
        ordinal
      ) VALUES ($1, $2, 'negative_ordinal', -1)`,
        [fixture.attendanceDecisionId, fixture.companyId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.attendance_events (
        company_id,
        employee_user_id,
        event_type,
        source,
        occurred_at,
        payload_hash
      ) VALUES ($1, $2, 'check_in', 'web', now(), 'short')`,
        [fixture.companyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.attendance_decisions (
        company_id,
        employee_user_id,
        attendance_event_id,
        decision_type,
        outcome,
        policy_key,
        policy_version,
        evidence_digest
      ) VALUES (
        $1,
        $2,
        $3,
        'geofence',
        'passed',
        'attendance.geofence',
        'v1',
        'short'
      )`,
        [fixture.companyId, fixture.employeeUserId, fixture.eventId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.decision_reasons (
        attendance_decision_id,
        company_id,
        reason_code,
        ordinal
      ) VALUES ($1, $2, 'duplicate_ordinal', 0)`,
        [fixture.attendanceDecisionId, fixture.companyId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "attendance_decision_reasons_ordinal_uq",
    });
  });

  it("rejects cross-tenant evidence ledger relationships", async () => {
    const pool = requireApp(app).store.pgPool!;
    const fixture = await createLedgerFixture(pool);
    const otherCompanyId = "00000000-0000-4000-8000-000000000044";

    await expect(
      pool.query(
        `INSERT INTO attendance.location_evidence (
          attendance_event_id, company_id, employee_user_id, captured_at,
          latitude, longitude, accuracy_meters, age_ms,
          coordinates_expire_at, coordinate_retention_class, coordinate_retention_seconds
        ) VALUES (
          $1, $2, $3, now(), 12.971599, 77.594566, 8.5, 0,
          now() + interval '30 days', 'standard', 2592000
        )`,
        [fixture.eventId, otherCompanyId, fixture.employeeUserId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "location_evidence_event_company_fk",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.attendance_decisions (
          company_id, employee_user_id, attendance_event_id, decision_type,
          outcome, policy_key, policy_version
        ) VALUES ($1, $2, $3, 'manual_attendance', 'passed', 'attendance', 'v1')`,
        [otherCompanyId, fixture.employeeUserId, fixture.eventId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "attendance_decisions_event_company_fk",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.decision_reasons (
          attendance_decision_id, company_id, reason_code, ordinal
        ) VALUES ($1, $2, 'cross_tenant_reason', 1)`,
        [fixture.attendanceDecisionId, otherCompanyId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "decision_reasons_decision_company_fk",
    });
  });

  it("attaches each immutable trigger to its intended attendance table", async () => {
    const pool = requireApp(app).store.pgPool!;
    const triggers = await pool.query<{ tgname: string; table_name: string }>(`
      SELECT tg.tgname, tg.tgrelid::regclass::text AS table_name
      FROM pg_trigger tg
      WHERE NOT tg.tgisinternal
        AND (tg.tgname, tg.tgrelid) IN (
          ('attendance_events_immutable_trg', 'attendance.attendance_events'::regclass),
          ('location_access_audit_insert_validate_trg', 'attendance.location_access_audit_logs'::regclass),
          ('location_evidence_immutable_trg', 'attendance.location_evidence'::regclass),
          ('location_evidence_insert_validate_trg', 'attendance.location_evidence'::regclass),
          ('location_access_audit_immutable_trg', 'attendance.location_access_audit_logs'::regclass),
          ('attendance_decisions_immutable_trg', 'attendance.attendance_decisions'::regclass),
          ('decision_reasons_immutable_trg', 'attendance.decision_reasons'::regclass),
          ('command_decisions_immutable_trg', 'attendance.command_decisions'::regclass)
        )
      ORDER BY tg.tgname
    `);

    expect(triggers.rows).toEqual([
      {
        tgname: "attendance_decisions_immutable_trg",
        table_name: "attendance.attendance_decisions",
      },
      {
        tgname: "attendance_events_immutable_trg",
        table_name: "attendance.attendance_events",
      },
      {
        tgname: "command_decisions_immutable_trg",
        table_name: "attendance.command_decisions",
      },
      {
        tgname: "decision_reasons_immutable_trg",
        table_name: "attendance.decision_reasons",
      },
      {
        tgname: "location_access_audit_immutable_trg",
        table_name: "attendance.location_access_audit_logs",
      },
      {
        tgname: "location_access_audit_insert_validate_trg",
        table_name: "attendance.location_access_audit_logs",
      },
      {
        tgname: "location_evidence_immutable_trg",
        table_name: "attendance.location_evidence",
      },
      {
        tgname: "location_evidence_insert_validate_trg",
        table_name: "attendance.location_evidence",
      },
    ]);
  });
});
