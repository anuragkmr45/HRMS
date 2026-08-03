import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { AttendanceCoordinateRetentionDefaults } from "#shared";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { AttendanceCoordinatePurgeWorker } from "../../../workers/attendance-coordinate-purge-worker.js";
import { AttendanceLocationAccessAuditService } from "../location-access-audit.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

interface RetentionFixture {
  companyId: string;
  actorUserId: string;
  employeeUserId: string;
  eventId: string;
  locationEvidenceId: string;
  decisionId: string;
  reasonId: string;
}

async function truncateRetentionTables(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      attendance.location_access_audit_logs,
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events
    RESTART IDENTITY CASCADE
  `);
}

async function createRetentionFixture(
  pool: Pool,
  input: { expired?: boolean; suffix?: string } = {},
): Promise<RetentionFixture> {
  const suffix = input.suffix ?? randomUUID();
  const companyId = randomUUID();
  const actorUserId = randomUUID();
  const employeeUserId = randomUUID();
  const receivedAt = input.expired
    ? "now() - interval '31 days'"
    : "now()";
  const expireAt = input.expired
    ? "now() - interval '1 day'"
    : "now() + interval '30 days'";

  const event = await pool.query<{ id: string }>(
    `
      INSERT INTO attendance.attendance_events (
        company_id, employee_user_id, actor_user_id, event_type, source,
        occurred_at, received_at, payload, payload_hash
      ) VALUES (
        $1, $2, $3, 'check_in', 'web_geo', ${receivedAt}, ${receivedAt},
        $4::jsonb, repeat('a', 64)
      )
      RETURNING id
    `,
    [
      companyId,
      employeeUserId,
      actorUserId,
      JSON.stringify({ fixture: suffix }),
    ],
  );
  const eventId = event.rows[0]?.id;
  if (!eventId) throw new Error("Attendance event fixture was not created.");

  const location = await pool.query<{ id: string }>(
    `
      INSERT INTO attendance.location_evidence (
        attendance_event_id, company_id, employee_user_id, captured_at, received_at,
        latitude, longitude, accuracy_meters, altitude_meters, provider, is_mocked,
        integrity_status, raw_payload, age_ms, permission_state, coordinates_expire_at,
        coordinate_retention_class, coordinate_retention_seconds
      ) VALUES (
        $1, $2, $3, ${receivedAt}, ${receivedAt}, 12.971599, 77.594566,
        8.50, 920.12, 'browser', false, 'basic', $4::jsonb, 0, 'granted',
        ${expireAt}, $5, $6
      )
      RETURNING id
    `,
    [
      eventId,
      companyId,
      employeeUserId,
      JSON.stringify({
        device: "fixture",
        location: { latitude: 12.971599, longitude: 77.594566 },
        nested: [{ latitude: 12.971599, retained: true }],
      }),
      AttendanceCoordinateRetentionDefaults.Class,
      AttendanceCoordinateRetentionDefaults.Seconds,
    ],
  );
  const locationEvidenceId = location.rows[0]?.id;
  if (!locationEvidenceId) throw new Error("Location evidence fixture was not created.");

  const decision = await pool.query<{ id: string }>(
    `
      INSERT INTO attendance.attendance_decisions (
        company_id, employee_user_id, attendance_event_id, decision_type,
        outcome, policy_key, policy_version, evidence_digest,
        policy_snapshot, evaluation_context
      ) VALUES (
        $1, $2, $3, 'geofence', 'passed', 'attendance.geofence', 'v1',
        repeat('c', 64), '{}'::jsonb, '{"source":"fixture"}'::jsonb
      )
      RETURNING id
    `,
    [companyId, employeeUserId, eventId],
  );
  const decisionId = decision.rows[0]?.id;
  if (!decisionId) throw new Error("Attendance decision fixture was not created.");

  const reason = await pool.query<{ id: string }>(
    `
      INSERT INTO attendance.decision_reasons (
        attendance_decision_id, company_id, reason_code, category, severity,
        ordinal, details
      ) VALUES ($1, $2, 'geo_inside_fence', 'location', 'info', 0, '{}'::jsonb)
      RETURNING id
    `,
    [decisionId, companyId],
  );
  const reasonId = reason.rows[0]?.id;
  if (!reasonId) throw new Error("Decision reason fixture was not created.");

  return {
    companyId,
    actorUserId,
    employeeUserId,
    eventId,
    locationEvidenceId,
    decisionId,
    reasonId,
  };
}

function requireApp(app: TestApp | undefined): TestApp {
  if (!app) throw new Error("Test application is unavailable.");
  return app;
}

describe("PostgreSQL attendance exact-coordinate retention", () => {
  let app: TestApp | undefined;

  beforeEach(async () => {
    app = undefined;
    app = await buildRealApp();
    await app.ready();

    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool is unavailable.");
    await truncateRetentionTables(pool);
  });

  afterEach(async () => {
    const currentApp = app;
    app = undefined;

    try {
      if (currentApp) {
        try {
          const pool = currentApp.store.pgPool;
          if (pool) await truncateRetentionTables(pool);
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

  it("audits exact-coordinate view and export access without storing coordinate metadata", async () => {
    const pool = requireApp(app).store.pgPool!;
    const fixture = await createRetentionFixture(pool);
    const service = new AttendanceLocationAccessAuditService(pool);

    const viewed = await service.withAuditedExactCoordinateView({
      companyId: fixture.companyId,
      actorUserId: fixture.actorUserId,
      locationEvidenceId: fixture.locationEvidenceId,
      requestId: "request-001",
      operationContext: "attendance.detail",
      reasonCode: "hr.review",
      metadata: { filters: { work_date: "2026-07-29" } },
    });
    expect(viewed).toMatchObject({
      locationEvidenceId: fixture.locationEvidenceId,
      attendanceEventId: fixture.eventId,
      employeeUserId: fixture.employeeUserId,
      latitude: "12.971599",
      longitude: "77.594566",
    });
    await service.auditExactCoordinateExport({
      companyId: fixture.companyId,
      actorUserId: fixture.actorUserId,
      subjectEmployeeUserId: fixture.employeeUserId,
      exportRecordCount: 1,
      requestId: "request-002",
      operationContext: "attendance.export",
      reasonCode: "hr.export",
      metadata: { export_format: "csv" },
    });

    const logs = await pool.query<{
      action: string;
      location_evidence_id: string | null;
      attendance_event_id: string | null;
      export_record_count: number | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, location_evidence_id, attendance_event_id, export_record_count, metadata
         FROM attendance.location_access_audit_logs
        ORDER BY created_at, id`,
    );

    expect(logs.rows).toMatchObject([
      {
        action: "attendance.location_coordinates.viewed",
        location_evidence_id: fixture.locationEvidenceId,
        attendance_event_id: fixture.eventId,
        export_record_count: null,
        metadata: { filters: { work_date: "2026-07-29" } },
      },
      {
        action: "attendance.location_coordinates.exported",
        location_evidence_id: null,
        attendance_event_id: null,
        export_record_count: 1,
        metadata: { export_format: "csv" },
      },
    ]);

    await expect(
      service.withAuditedExactCoordinateView({
        companyId: fixture.companyId,
        actorUserId: fixture.actorUserId,
        locationEvidenceId: fixture.locationEvidenceId,
        metadata: { filters: { latitude: 12.971599 } },
      }),
    ).rejects.toThrow("Location access audit metadata cannot contain exact coordinate fields.");

    await expect(
      service.withAuditedExactCoordinateView({
        companyId: randomUUID(),
        actorUserId: fixture.actorUserId,
        locationEvidenceId: fixture.locationEvidenceId,
      }),
    ).rejects.toThrow("Exact coordinate evidence was not found for this company.");
  });

  it("enforces audit immutability, safe metadata, and evidence-event pairing in SQL", async () => {
    const pool = requireApp(app).store.pgPool!;
    const fixture = await createRetentionFixture(pool);
    const service = new AttendanceLocationAccessAuditService(pool);

    await service.withAuditedExactCoordinateView({
      companyId: fixture.companyId,
      actorUserId: fixture.actorUserId,
      locationEvidenceId: fixture.locationEvidenceId,
      operationContext: "attendance.detail",
      reasonCode: "hr.review",
      metadata: { filters: { work_date: "2026-07-29" } },
    });
    const audit = await pool.query<{ id: string }>(
      `SELECT id FROM attendance.location_access_audit_logs LIMIT 1`,
    );
    const auditId = audit.rows[0]?.id;
    if (!auditId) throw new Error("Location access audit fixture was not created.");

    await expect(
      pool.query(
        `UPDATE attendance.location_access_audit_logs
            SET request_id = 'changed'
          WHERE id = $1`,
        [auditId],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");
    await expect(
      pool.query(`DELETE FROM attendance.location_access_audit_logs WHERE id = $1`, [auditId]),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");

    for (const metadata of [
      { filters: { Latitude: "12.971599" } },
      { filters: { geoPoint: "12.971599,77.594566" } },
      { filters: { "altitude-meters": "920.12" } },
      { filters: { "raw Payload": "contains coordinates" } },
    ]) {
      await expect(
        pool.query(
          `INSERT INTO attendance.location_access_audit_logs (
              company_id, actor_user_id, subject_employee_user_id,
              location_evidence_id, attendance_event_id, action,
              reason_code, operation_context, metadata
            ) VALUES (
              $1, $2, $3, $4, $5, 'attendance.location_coordinates.viewed',
              'hr.review', 'attendance.detail', $6::jsonb
            )`,
          [
            fixture.companyId,
            fixture.actorUserId,
            fixture.employeeUserId,
            fixture.locationEvidenceId,
            fixture.eventId,
            JSON.stringify(metadata),
          ],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "location_access_audit_no_coordinate_metadata_check",
      });
    }

    const otherEvent = await pool.query<{ id: string }>(
      `INSERT INTO attendance.attendance_events (
          company_id, employee_user_id, actor_user_id, event_type, source,
          occurred_at, received_at, payload, payload_hash
        ) VALUES (
          $1, $2, $3, 'check_out', 'web_geo', now(), now(), '{}'::jsonb, repeat('d', 64)
        )
        RETURNING id`,
      [fixture.companyId, fixture.employeeUserId, fixture.actorUserId],
    );
    await expect(
      pool.query(
        `INSERT INTO attendance.location_access_audit_logs (
            company_id, actor_user_id, subject_employee_user_id,
            location_evidence_id, attendance_event_id, action,
            reason_code, operation_context, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, 'attendance.location_coordinates.viewed',
            'hr.review', 'attendance.detail', '{}'::jsonb
          )`,
        [
          fixture.companyId,
          fixture.actorUserId,
          fixture.employeeUserId,
          fixture.locationEvidenceId,
          otherEvent.rows[0]?.id,
        ],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_access_audit_evidence_relationship_check",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.location_access_audit_logs (
            company_id, actor_user_id, subject_employee_user_id,
            location_evidence_id, attendance_event_id, action,
            reason_code, operation_context, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, 'attendance.location_coordinates.viewed',
            'hr.review', 'attendance.detail', '{}'::jsonb
          )`,
        [
          fixture.companyId,
          fixture.actorUserId,
          randomUUID(),
          fixture.locationEvidenceId,
          fixture.eventId,
        ],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_access_audit_evidence_relationship_check",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.location_access_audit_logs (
            company_id, actor_user_id, subject_employee_user_id,
            location_evidence_id, attendance_event_id, action,
            reason_code, operation_context, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, 'attendance.location_coordinates.viewed',
            'hr.review', 'attendance.detail', '{}'::jsonb
          )`,
        [
          randomUUID(),
          fixture.actorUserId,
          fixture.employeeUserId,
          fixture.locationEvidenceId,
          fixture.eventId,
        ],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_access_audit_evidence_relationship_check",
    });
  });

  it("does not release exact coordinates when the required audit insert fails", async () => {
    const pool = requireApp(app).store.pgPool!;
    const fixture = await createRetentionFixture(pool);
    const service = new AttendanceLocationAccessAuditService(pool);
    let sensitiveReadRan = false;

    await expect(
      service.withAuditedExactCoordinateView({
        companyId: fixture.companyId,
        actorUserId: fixture.actorUserId,
        locationEvidenceId: fixture.locationEvidenceId,
        metadata: { rawPayload: "not-allowed" },
      }).then((result) => {
        sensitiveReadRan = true;
        return result;
      }),
    ).rejects.toThrow("Location access audit metadata cannot contain exact coordinate fields.");
    expect(sensitiveReadRan).toBe(false);
  });

  it("blocks expired exact-coordinate access before the asynchronous physical purge runs", async () => {
    const currentApp = requireApp(app);
    const pool = currentApp.store.pgPool!;
    const expired = await createRetentionFixture(pool, { expired: true, suffix: "logical-expiry" });
    const service = new AttendanceLocationAccessAuditService(pool);

    await expect(
      service.withAuditedExactCoordinateView({
        companyId: expired.companyId,
        actorUserId: expired.actorUserId,
        locationEvidenceId: expired.locationEvidenceId,
        operationContext: "attendance.detail",
        reasonCode: "hr.review",
        metadata: { filters: { work_date: "2026-07-29" } },
      }),
    ).rejects.toThrow("Exact coordinate evidence was not found for this company.");

    const auditRows = await pool.query<{ allowed_views: string }>(
      `SELECT count(*) AS allowed_views
         FROM attendance.location_access_audit_logs
        WHERE location_evidence_id = $1
          AND action = 'attendance.location_coordinates.viewed'
          AND outcome = 'allowed'`,
      [expired.locationEvidenceId],
    );
    expect(auditRows.rows[0]?.allowed_views).toBe("0");

    const beforePurge = await pool.query<{
      latitude: string | null;
      longitude: string | null;
      raw_payload: Record<string, unknown>;
      coordinates_purged_at: Date | null;
    }>(
      `SELECT latitude::text, longitude::text, raw_payload, coordinates_purged_at
         FROM attendance.location_evidence
        WHERE id = $1`,
      [expired.locationEvidenceId],
    );
    expect(beforePurge.rows[0]).toMatchObject({
      latitude: "12.971599",
      longitude: "77.594566",
      coordinates_purged_at: null,
    });
    expect(beforePurge.rows[0]?.raw_payload).toMatchObject({
      location: { latitude: 12.971599, longitude: 77.594566 },
    });

    const result = await new AttendanceCoordinatePurgeWorker(currentApp.store).purgeExpired({
      batchSize: 10,
    });
    expect(result.skipped).toBe(false);
    expect(result.purged).toBe(1);
    expect(result.evidence_ids).toEqual([expired.locationEvidenceId]);

    const afterPurge = await pool.query<{
      latitude: string | null;
      longitude: string | null;
      raw_payload: Record<string, unknown>;
      coordinates_purged_at: Date | null;
    }>(
      `SELECT latitude::text, longitude::text, raw_payload, coordinates_purged_at
         FROM attendance.location_evidence
        WHERE id = $1`,
      [expired.locationEvidenceId],
    );
    expect(afterPurge.rows[0]).toMatchObject({
      latitude: null,
      longitude: null,
      raw_payload: {},
    });
    expect(afterPurge.rows[0]?.coordinates_purged_at).toBeInstanceOf(Date);
  });

  it("purges expired exact coordinates irreversibly while preserving evidence links and reasons", async () => {
    const currentApp = requireApp(app);
    const pool = currentApp.store.pgPool!;
    const expired = await createRetentionFixture(pool, { expired: true, suffix: "expired" });
    const future = await createRetentionFixture(pool, { expired: false, suffix: "future" });

    const result = await new AttendanceCoordinatePurgeWorker(currentApp.store).purgeExpired({
      batchSize: 10,
    });

    expect(result.skipped).toBe(false);
    expect(result.purged).toBe(1);
    expect(result.evidence_ids).toEqual([expired.locationEvidenceId]);
    expect(result.company_ids).toEqual([expired.companyId]);

    const rows = await pool.query<{
      id: string;
      latitude: string | null;
      longitude: string | null;
      accuracy_meters: string | null;
      altitude_meters: string | null;
      provider: string | null;
      is_mocked: boolean | null;
      permission_state: string;
      coordinates_expire_at: Date | null;
      coordinates_purged_at: Date | null;
      coordinate_retention_class: string | null;
      coordinate_retention_seconds: number | null;
      raw_payload: Record<string, unknown>;
      event_rows: string;
      decision_rows: string;
      reason_rows: string;
    }>(
      `SELECT
          location.id,
          location.latitude::text,
          location.longitude::text,
          location.accuracy_meters::text,
          location.altitude_meters::text,
          location.provider,
          location.is_mocked,
          location.permission_state,
          location.coordinates_expire_at,
          location.coordinates_purged_at,
          location.coordinate_retention_class,
          location.coordinate_retention_seconds,
          location.raw_payload,
          (SELECT count(*) FROM attendance.attendance_events WHERE id = $2) AS event_rows,
          (SELECT count(*) FROM attendance.attendance_decisions WHERE id = $3) AS decision_rows,
          (SELECT count(*) FROM attendance.decision_reasons WHERE id = $4) AS reason_rows
         FROM attendance.location_evidence location
        WHERE location.id = $1`,
      [expired.locationEvidenceId, expired.eventId, expired.decisionId, expired.reasonId],
    );
    expect(rows.rows[0]).toMatchObject({
      latitude: null,
      longitude: null,
      accuracy_meters: "8.50",
      altitude_meters: null,
      provider: "browser",
      is_mocked: false,
      permission_state: "granted",
      coordinate_retention_class: AttendanceCoordinateRetentionDefaults.Class,
      coordinate_retention_seconds: AttendanceCoordinateRetentionDefaults.Seconds,
      raw_payload: {},
      event_rows: "1",
      decision_rows: "1",
      reason_rows: "1",
    });
    expect(rows.rows[0]?.coordinates_expire_at).toBeInstanceOf(Date);
    expect(rows.rows[0]?.coordinates_purged_at).toBeInstanceOf(Date);

    const unpurged = await pool.query<{ latitude: string | null }>(
      `SELECT latitude::text
         FROM attendance.location_evidence
        WHERE id = $1`,
      [future.locationEvidenceId],
    );
    expect(unpurged.rows[0]?.latitude).toBe("12.971599");

    await expect(
      pool.query(
        `UPDATE attendance.location_evidence
            SET latitude = 12.000000
          WHERE id = $1`,
        [expired.locationEvidenceId],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");

    const secondRun = await new AttendanceCoordinatePurgeWorker(currentApp.store).purgeExpired({
      batchSize: 10,
    });
    expect(secondRun.purged).toBe(0);
  });

  it("rejects early purge attempts and unrelated evidence mutation during purge", async () => {
    const pool = requireApp(app).store.pgPool!;
    const future = await createRetentionFixture(pool, { expired: false, suffix: "early" });
    const expired = await createRetentionFixture(pool, { expired: true, suffix: "mutated" });

    await expect(
      pool.query(
        `UPDATE attendance.location_evidence
            SET latitude = NULL,
                longitude = NULL,
                altitude_meters = NULL,
                raw_payload = '{}'::jsonb,
                coordinates_purged_at = now()
          WHERE id = $1`,
        [future.locationEvidenceId],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");

    await expect(
      pool.query(
        `UPDATE attendance.location_evidence
            SET latitude = NULL,
                longitude = NULL,
                altitude_meters = NULL,
                provider = 'network',
                raw_payload = '{}'::jsonb,
                coordinates_purged_at = now()
          WHERE id = $1`,
        [expired.locationEvidenceId],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");
  });

  it("uses SKIP LOCKED batch selection so concurrent purge runs do not double-process rows", async () => {
    const currentApp = requireApp(app);
    const pool = currentApp.store.pgPool!;
    const first = await createRetentionFixture(pool, { expired: true, suffix: "first" });
    const second = await createRetentionFixture(pool, { expired: true, suffix: "second" });
    const worker = new AttendanceCoordinatePurgeWorker(currentApp.store);

    const [left, right] = await Promise.all([
      worker.purgeExpired({ batchSize: 1 }),
      worker.purgeExpired({ batchSize: 1 }),
    ]);

    expect(left.purged + right.purged).toBe(2);
    expect(new Set([...left.evidence_ids, ...right.evidence_ids])).toEqual(
      new Set([first.locationEvidenceId, second.locationEvidenceId]),
    );
  });
});
