import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { AttendanceCoordinateRetentionDefaults } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { AttendanceCoordinatePurgeWorker } from "../../../workers/attendance-coordinate-purge-worker.js";
import {
  ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
  attendanceOfflineEventEnvelopeSchema,
  canonicalOfflineAttendanceEventHash,
  canonicalOfflineAttendanceEventProjection,
} from "../offline-sync-contract.js";
import { buildProvisionalRecordedEvent } from "../events.js";
import { AttendanceLocationAccessAuditService } from "../location-access-audit.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

interface RetentionFixture {
  companyId: string;
  actorUserId: string;
  employeeUserId: string;
  commandId: string;
  commandRequestHash: string;
  commandResponseHash: string;
  offlineInboxId: string;
  offlineEventHash: string;
  eventId: string;
  locationEvidenceId: string;
  decisionId: string;
  reasonId: string;
}

async function truncateRetentionTables(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      attendance.location_retention_actions,
      attendance.location_access_audit_logs,
      attendance.offline_sync_security_audit_logs,
      attendance.offline_event_inbox,
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.command_executions
    RESTART IDENTITY CASCADE
  `);
  await pool.query(`
    DELETE FROM platform.outbox_events
    WHERE aggregate_type = 'attendance'
  `);
}

async function createRetentionFixture(
  pool: Pool,
  input: { expired?: boolean; suffix?: string; includeCommand?: boolean; includeOffline?: boolean } = {},
): Promise<RetentionFixture> {
  const suffix = input.suffix ?? randomUUID();
  const includeCommand = input.includeCommand ?? true;
  const includeOffline = input.includeOffline ?? true;
  const companyId = randomUUID();
  const actorUserId = randomUUID();
  const employeeUserId = randomUUID();
  const commandId = randomUUID();
  const offlineInboxId = randomUUID();
  const registeredDeviceId = randomUUID();
  const commandRequestHash = "e".repeat(64);
  const commandResponseHash = "f".repeat(64);
  const offlineEventHash = "1".repeat(64);
  const receivedAt = input.expired
    ? "now() - interval '31 days'"
    : "now()";
  const expireAt = input.expired
    ? "now() - interval '1 day'"
    : "now() + interval '30 days'";

  if (includeCommand) {
    await pool.query(
      `
        INSERT INTO attendance.command_executions (
          id, company_id, actor_user_id, employee_user_id, idempotency_key,
          request_hash, command_type, command_origin, occurred_at, status,
          request_snapshot, response_snapshot, response_hash, response_status,
          completed_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'check_in', 'employee_manual_now',
          ${receivedAt}, 'completed', $7::jsonb, $8::jsonb, $9, 200,
          ${receivedAt}, ${receivedAt}
        )
      `,
      [
        commandId,
        companyId,
        actorUserId,
        employeeUserId,
        `retention-${suffix}`,
        commandRequestHash,
        JSON.stringify({
          envelope: {
            client_event_id: randomUUID(),
            command: {
              event_type: "check_in",
              work_mode: "office",
              source: "web_geo",
              location: {
                latitude: 12.971599,
                longitude: 77.594566,
                accuracy_meters: 8.5,
                altitude_meters: 920.12,
                captured_at: "2026-07-29T09:00:00.000Z",
              },
            },
          },
          location: {
            latitude: 12.971599,
            longitude: 77.594566,
          },
          metadata: { note: "safe" },
        }),
        JSON.stringify({ allowed: true, command_id: commandId }),
        commandResponseHash,
      ],
    );
  }

  const event = await pool.query<{ id: string }>(
    `
      INSERT INTO attendance.attendance_events (
        company_id, employee_user_id, actor_user_id, command_execution_id, event_type, source,
        occurred_at, received_at, payload, payload_hash
      ) VALUES (
        $1, $2, $3, $4, 'check_in', $5, ${receivedAt}, ${receivedAt},
        $6::jsonb, repeat('a', 64)
      )
      RETURNING id
    `,
    [
      companyId,
      employeeUserId,
      actorUserId,
      includeCommand ? commandId : null,
      includeCommand ? "web_geo" : "mobile_offline",
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

  if (includeOffline) {
    await pool.query(
      `
        INSERT INTO attendance.offline_event_inbox (
          id, company_id, actor_user_id, employee_user_id, batch_id,
          registered_device_id, device_snapshot, client_event_id, sequence,
          event_hash, event_payload, attendance_event_id, sync_status,
          verification_status, reason_code, server_received_at, processed_at,
          response_snapshot, payroll_eligible, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, '{}'::jsonb, $7, 1, $8, $9::jsonb, $10,
          'accepted', 'unverified', 'offline_sync.accepted_unverified',
          ${receivedAt}, NULL, $11::jsonb, false, ${receivedAt}, ${receivedAt}
        )
      `,
      [
        offlineInboxId,
        companyId,
        actorUserId,
        employeeUserId,
        randomUUID(),
        registeredDeviceId,
        randomUUID(),
        offlineEventHash,
        JSON.stringify({
          client_event_id: randomUUID(),
          sequence: 1,
          command_kind: "employee_manual_now",
          captured_at: "2026-07-29T09:00:00.000Z",
          source: "mobile_offline",
          event_type: "check_in",
          work_mode: "office",
          metadata: { network_state: "offline" },
          location: {
            latitude: 12.971599,
            longitude: 77.594566,
            accuracy_meters: 18,
            captured_at: "2026-07-29T09:00:00.000Z",
            provider: "device",
            permission_state: "granted",
          },
        }),
        eventId,
        JSON.stringify({
          sync_status: "accepted",
          replayed: false,
          reason_code: "offline_sync.accepted_unverified",
        }),
      ],
    );
  }

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
    commandId,
    commandRequestHash,
    commandResponseHash,
    offlineInboxId,
    offlineEventHash,
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

function assertNoExactCoordinateLeak(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("12.971599");
  expect(serialized).not.toContain("77.594566");
  expect(serialized).not.toContain("920.12");
  expect(serialized).not.toContain("latitude");
  expect(serialized).not.toContain("longitude");
  expect(serialized).not.toContain("altitude_meters");
  expect(serialized).not.toContain("raw_payload");
}

async function insertRetentionActionForConstraint(
  pool: Pool,
  storageSurfaces: string[],
  redactedCommandSnapshotCount: number,
  redactedOfflineEventPayloadCount: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO attendance.location_retention_actions (
       company_id, location_evidence_id, coordinates_expire_at,
       coordinates_purged_at, action_type, worker_origin, worker_version,
       storage_surfaces, redacted_command_snapshot_count,
       redacted_offline_event_payload_count
     ) VALUES (
       $1, $2, now() - interval '2 days', now() - interval '1 day',
       'attendance.location_coordinates.purged',
       'attendance-coordinate-purge-worker', 'constraint-test',
       $3::jsonb, $4, $5
     )`,
    [
      randomUUID(),
      randomUUID(),
      JSON.stringify(storageSurfaces),
      redactedCommandSnapshotCount,
      redactedOfflineEventPayloadCount,
    ],
  );
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
  input: { companyId: string; userId: string },
): Promise<string> {
  const installationHash = createHash("sha256")
    .update(`retention-offline-replay:${randomUUID()}`)
    .digest("hex");
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO platform.registered_devices (
       company_id, user_id, installation_id_hash, platform, status, status_changed_at
     )
     VALUES ($1, $2, $3, 'android', 'registered', now())
     RETURNING id`,
    [input.companyId, input.userId, installationHash],
  );
  return result.rows[0]!.id;
}

function offlineBatch(
  registeredDeviceId: string,
  events: Array<Record<string, unknown>>,
  batchId = randomUUID(),
): Record<string, unknown> {
  return {
    contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
    batch_id: batchId,
    device: {
      registered_device_id: registeredDeviceId,
      device_id: "retention-replay-device",
      platform: "android",
      app_version: "2026.08.03",
      os_version: "Android 15",
    },
    events,
  };
}

function offlineEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_event_id: randomUUID(),
    sequence: 1,
    command_kind: "employee_manual_now",
    captured_at: "2026-08-03T09:00:00.000+05:30",
    source: "mobile_offline",
    event_type: "check_in",
    work_mode: "office",
    metadata: {
      network_state: "offline",
      capture_method: "user_action",
      client_timezone: "Asia/Calcutta",
    },
    location: {
      latitude: 12.971599,
      longitude: 77.594566,
      accuracy_meters: 18,
      captured_at: "2026-08-03T08:59:58.000Z",
      provider: "device",
      permission_state: "granted",
    },
    ...overrides,
  };
}

async function syncOffline(
  app: TestApp,
  token: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/attendance/offline-sync",
    headers: authHeader(token),
    payload,
  });
}

async function seedAcceptedExpiredOfflineSubmission(
  app: TestApp,
  input: {
    companyId: string;
    actorUserId: string;
    employeeUserId: string;
    registeredDeviceId: string;
    batchId: string;
    event: Record<string, unknown>;
  },
): Promise<{
  attendanceEventId: string;
  locationEvidenceId: string;
  eventHash: string;
  serverReceivedAt: string;
}> {
  const event = attendanceOfflineEventEnvelopeSchema.parse(input.event);
  const eventPayload = canonicalOfflineAttendanceEventProjection(event);
  const eventHash = canonicalOfflineAttendanceEventHash(event);
  if (!event.location || !("latitude" in event.location)) {
    throw new Error("Accepted expired offline retention fixture requires exact location evidence.");
  }
  const location = event.location;
  const serverReceivedAt = "2026-07-01T00:00:00.000Z";
  const coordinatesExpireAt = "2026-07-31T00:00:00.000Z";
  const responseSnapshot = {
    client_event_id: event.client_event_id,
    sequence: event.sequence,
    sync_status: "accepted",
    verification_status: "unverified",
    replayed: false,
    reason_code: "offline_sync.accepted_unverified",
    server_received_at: serverReceivedAt,
    processed_at: null,
    payroll_eligible: false,
  };
  const attendanceEventId = randomUUID();
  const locationEvidenceId = randomUUID();
  const deviceSnapshot = {
    registered_device_id: input.registeredDeviceId,
    device_id: "retention-replay-device",
    platform: "android",
    app_version: "2026.08.03",
    os_version: "Android 15",
  };

  await app.store.pgPool!.query(
    `INSERT INTO attendance.attendance_events (
       id, company_id, employee_user_id, actor_user_id, command_execution_id,
       event_type, source, occurred_at, received_at, schema_version, payload,
       payload_hash, created_at
     )
     VALUES ($1,$2,$3,$4,NULL,$5,'mobile_offline',$6,$7,1,$8::jsonb,$9,$7)`,
    [
      attendanceEventId,
      input.companyId,
      input.employeeUserId,
      input.actorUserId,
      event.event_type,
      event.captured_at,
      serverReceivedAt,
      JSON.stringify({
        schema_version: 1,
        contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
        batch_id: input.batchId,
        client_event_id: event.client_event_id,
        sequence: event.sequence,
        command_kind: event.command_kind,
        source_channel: event.source,
        event_type: event.event_type,
        work_mode: event.work_mode,
        metadata: event.metadata,
        registered_device_id: input.registeredDeviceId,
        location_evidence_supplied: Boolean(event.location),
      }),
      eventHash,
    ],
  );

  await app.store.pgPool!.query(
    `INSERT INTO attendance.location_evidence (
       id, attendance_event_id, company_id, employee_user_id, captured_at,
       received_at, latitude, longitude, accuracy_meters, altitude_meters,
       provider, is_mocked, integrity_status, raw_payload, age_ms,
       permission_state, coordinates_expire_at, coordinate_retention_class,
       coordinate_retention_seconds
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'basic',$12::jsonb,0,
       $13,$14,$15,$16
     )`,
    [
      locationEvidenceId,
      attendanceEventId,
      input.companyId,
      input.employeeUserId,
      location.captured_at,
      serverReceivedAt,
      location.latitude,
      location.longitude,
      location.accuracy_meters,
      location.altitude_meters ?? null,
      location.provider ?? "device",
      JSON.stringify({
        schema_version: 1,
        source_channel: "mobile_offline",
        provider: location.provider ?? null,
        permission_state: location.permission_state,
        client_age_ms: location.age_ms ?? null,
        evaluated_age_ms: 0,
      }),
      location.permission_state,
      coordinatesExpireAt,
      AttendanceCoordinateRetentionDefaults.Class,
      AttendanceCoordinateRetentionDefaults.Seconds,
    ],
  );

  await app.store.pgPool!.query(
    `INSERT INTO attendance.offline_event_inbox (
       company_id, actor_user_id, employee_user_id, batch_id,
       registered_device_id, device_snapshot, client_event_id, sequence,
       event_hash, event_payload, attendance_event_id, sync_status,
       verification_status, reason_code, server_received_at, processed_at,
       response_snapshot, payroll_eligible, created_at, updated_at
     )
     VALUES (
       $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11,
       'accepted','unverified','offline_sync.accepted_unverified',
       $12,NULL,$13::jsonb,false,$12,$12
     )`,
    [
      input.companyId,
      input.actorUserId,
      input.employeeUserId,
      input.batchId,
      input.registeredDeviceId,
      JSON.stringify(deviceSnapshot),
      event.client_event_id,
      event.sequence,
      eventHash,
      JSON.stringify(eventPayload),
      attendanceEventId,
      serverReceivedAt,
      JSON.stringify(responseSnapshot),
    ],
  );

  const outboxEvent = buildProvisionalRecordedEvent({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    subjectEmployeeUserId: input.employeeUserId,
    attendanceEventId,
    commandId: null,
    sourceChannel: "mobile_offline",
    verificationStatus: "unverified",
    provisionalReasonCode: "offline_sync.accepted_unverified",
    capturedAt: event.captured_at,
    receivedAt: serverReceivedAt,
  });
  await app.store.pgPool!.query(
    `INSERT INTO platform.outbox_events (
       aggregate_type, aggregate_id, event_type, payload, idempotency_key,
       created_at
     )
     VALUES ('attendance',$1,$2,$3::jsonb,$4,$5)`,
    [
      outboxEvent.aggregateId,
      outboxEvent.eventType,
      JSON.stringify(outboxEvent.payload),
      outboxEvent.idempotencyKey,
      serverReceivedAt,
    ],
  );
  await app.store.pgPool!.query(
    `UPDATE platform.registered_devices
        SET offline_sequence_cursor = $2
      WHERE id = $1`,
    [input.registeredDeviceId, event.sequence],
  );

  return {
    attendanceEventId,
    locationEvidenceId,
    eventHash,
    serverReceivedAt,
  };
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

  it("enforces retention action ledger surface requirements in SQL", async () => {
    const pool = requireApp(app).store.pgPool!;

    await expect(
      insertRetentionActionForConstraint(pool, [], 0, 0),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_retention_actions_primary_surface_check",
    });
    await expect(
      insertRetentionActionForConstraint(pool, ["attendance.location_evidence"], 1, 0),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_retention_actions_command_surface_count_check",
    });
    await expect(
      insertRetentionActionForConstraint(
        pool,
        [
          "attendance.location_evidence",
          "attendance.command_executions.request_snapshot",
        ],
        0,
        0,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_retention_actions_command_surface_count_check",
    });
    await expect(
      insertRetentionActionForConstraint(pool, ["attendance.location_evidence"], 0, 1),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_retention_actions_offline_surface_count_check",
    });
    await expect(
      insertRetentionActionForConstraint(
        pool,
        [
          "attendance.location_evidence",
          "attendance.offline_event_inbox.event_payload",
        ],
        0,
        0,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "location_retention_actions_offline_surface_count_check",
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
    const beforeDurableRows = await pool.query<{
      request_snapshot: Record<string, unknown>;
      request_hash: string;
      response_snapshot: Record<string, unknown>;
      response_hash: string;
      event_payload: Record<string, unknown>;
      event_hash: string;
      decision_row: Record<string, unknown>;
      reason_row: Record<string, unknown>;
    }>(
      `SELECT
          command.request_snapshot,
          command.request_hash,
          command.response_snapshot,
          command.response_hash,
          inbox.event_payload,
          inbox.event_hash,
          to_jsonb(decision.*) AS decision_row,
          to_jsonb(reason.*) AS reason_row
         FROM attendance.command_executions command
         JOIN attendance.offline_event_inbox inbox
           ON inbox.id = $3
         JOIN attendance.attendance_decisions decision
           ON decision.id = $4
         JOIN attendance.decision_reasons reason
           ON reason.id = $5
        WHERE command.id = $1
          AND command.company_id = $2`,
      [
        expired.commandId,
        expired.companyId,
        expired.offlineInboxId,
        expired.decisionId,
        expired.reasonId,
      ],
    );
    expect(JSON.stringify(beforeDurableRows.rows[0]?.request_snapshot)).toContain("12.971599");
    expect(JSON.stringify(beforeDurableRows.rows[0]?.event_payload)).toContain("12.971599");

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

    const redactedRows = await pool.query<{
      request_snapshot: Record<string, unknown>;
      request_hash: string;
      response_snapshot: Record<string, unknown>;
      response_hash: string;
      event_payload: Record<string, unknown>;
      event_hash: string;
      offline_response_snapshot: Record<string, unknown>;
      sync_status: string;
      verification_status: string;
      reason_code: string | null;
      action_type: string;
      worker_origin: string;
      worker_version: string;
      storage_surfaces: string[];
      redacted_command_snapshot_count: number;
      redacted_offline_event_payload_count: number;
      action_payload: Record<string, unknown>;
      decision_row: Record<string, unknown>;
      reason_row: Record<string, unknown>;
    }>(
      `SELECT
          command.request_snapshot,
          command.request_hash,
          command.response_snapshot,
          command.response_hash,
          inbox.event_payload,
          inbox.event_hash,
          inbox.response_snapshot AS offline_response_snapshot,
          inbox.sync_status,
          inbox.verification_status,
          inbox.reason_code,
          action.action_type,
          action.worker_origin,
          action.worker_version,
          action.storage_surfaces,
          action.redacted_command_snapshot_count,
          action.redacted_offline_event_payload_count,
          to_jsonb(action.*) AS action_payload,
          to_jsonb(decision.*) AS decision_row,
          to_jsonb(reason.*) AS reason_row
         FROM attendance.command_executions command
         JOIN attendance.offline_event_inbox inbox
           ON inbox.id = $3
         JOIN attendance.location_retention_actions action
           ON action.location_evidence_id = $4
          AND action.company_id = $2
         JOIN attendance.attendance_decisions decision
           ON decision.id = $5
         JOIN attendance.decision_reasons reason
           ON reason.id = $6
        WHERE command.id = $1
          AND command.company_id = $2`,
      [
        expired.commandId,
        expired.companyId,
        expired.offlineInboxId,
        expired.locationEvidenceId,
        expired.decisionId,
        expired.reasonId,
      ],
    );
    expect(redactedRows.rows).toHaveLength(1);
    const redacted = redactedRows.rows[0]!;
    expect(redacted.request_hash).toBe(expired.commandRequestHash);
    expect(redacted.response_hash).toBe(expired.commandResponseHash);
    expect(redacted.response_snapshot).toEqual(beforeDurableRows.rows[0]?.response_snapshot);
    expect(redacted.event_hash).toBe(expired.offlineEventHash);
    expect(redacted.offline_response_snapshot).toEqual({
      sync_status: "accepted",
      replayed: false,
      reason_code: "offline_sync.accepted_unverified",
    });
    expect(redacted.sync_status).toBe("accepted");
    expect(redacted.verification_status).toBe("unverified");
    expect(redacted.reason_code).toBe("offline_sync.accepted_unverified");
    expect(redacted.request_snapshot).toMatchObject({
      envelope: { command: { location: null } },
      location: null,
      metadata: { note: "safe" },
    });
    expect(redacted.event_payload).toMatchObject({
      command_kind: "employee_manual_now",
      source: "mobile_offline",
      event_type: "check_in",
      location: null,
    });
    assertNoExactCoordinateLeak(redacted.request_snapshot);
    assertNoExactCoordinateLeak(redacted.event_payload);
    expect(redacted.action_type).toBe("attendance.location_coordinates.purged");
    expect(redacted.worker_origin).toBe("attendance-coordinate-purge-worker");
    expect(redacted.worker_version).toBe("geo-s14-008");
    expect(redacted.storage_surfaces).toEqual([
      "attendance.location_evidence",
      "attendance.command_executions.request_snapshot",
      "attendance.offline_event_inbox.event_payload",
    ]);
    expect(redacted.redacted_command_snapshot_count).toBe(1);
    expect(redacted.redacted_offline_event_payload_count).toBe(1);
    assertNoExactCoordinateLeak(redacted.action_payload);
    expect(redacted.decision_row).toEqual(beforeDurableRows.rows[0]?.decision_row);
    expect(redacted.reason_row).toEqual(beforeDurableRows.rows[0]?.reason_row);

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
    const actionCount = await pool.query<{ count: string }>(
      `SELECT count(*) AS count
         FROM attendance.location_retention_actions
        WHERE location_evidence_id = $1`,
      [expired.locationEvidenceId],
    );
    expect(actionCount.rows[0]?.count).toBe("1");

    await expect(
      pool.query(
        `UPDATE attendance.location_retention_actions
            SET worker_version = 'tampered'
          WHERE location_evidence_id = $1`,
        [expired.locationEvidenceId],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");
    await expect(
      pool.query(
        `DELETE FROM attendance.location_retention_actions
          WHERE location_evidence_id = $1`,
        [expired.locationEvidenceId],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");
  });

  it("records exact storage surfaces for online-only and offline-only retention", async () => {
    const currentApp = requireApp(app);
    const pool = currentApp.store.pgPool!;
    const online = await createRetentionFixture(pool, {
      expired: true,
      suffix: "online-only",
      includeOffline: false,
    });
    const offline = await createRetentionFixture(pool, {
      expired: true,
      suffix: "offline-only",
      includeCommand: false,
    });

    const result = await new AttendanceCoordinatePurgeWorker(currentApp.store).purgeExpired({
      batchSize: 10,
    });

    expect(result.purged).toBe(2);
    const actions = await pool.query<{
      location_evidence_id: string;
      storage_surfaces: string[];
      redacted_command_snapshot_count: number;
      redacted_offline_event_payload_count: number;
    }>(
      `SELECT location_evidence_id, storage_surfaces,
              redacted_command_snapshot_count,
              redacted_offline_event_payload_count
         FROM attendance.location_retention_actions
        WHERE location_evidence_id = ANY($1::uuid[])`,
      [[online.locationEvidenceId, offline.locationEvidenceId]],
    );
    const byEvidenceId = new Map(actions.rows.map((row) => [row.location_evidence_id, row]));

    expect(byEvidenceId.get(online.locationEvidenceId)).toMatchObject({
      storage_surfaces: [
        "attendance.location_evidence",
        "attendance.command_executions.request_snapshot",
      ],
      redacted_command_snapshot_count: 1,
      redacted_offline_event_payload_count: 0,
    });
    expect(byEvidenceId.get(offline.locationEvidenceId)).toMatchObject({
      storage_surfaces: [
        "attendance.location_evidence",
        "attendance.offline_event_inbox.event_payload",
      ],
      redacted_command_snapshot_count: 0,
      redacted_offline_event_payload_count: 1,
    });
  });

  it("replays an offline submission after retention redacts its stored payload without duplicating facts", async () => {
    const currentApp = requireApp(app);
    const pool = currentApp.store.pgPool!;
    const employee = await loginAs(currentApp, "E1");
    const companyId = employeeCompanyId(currentApp, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(currentApp, {
      companyId,
      userId: employee.user.id,
    });
    const clientEventId = randomUUID();
    const batchId = randomUUID();
    const submittedEvent = offlineEvent({
      client_event_id: clientEventId,
      captured_at: "2026-06-30T09:00:00.000+05:30",
      location: {
        latitude: 12.971599,
        longitude: 77.594566,
        accuracy_meters: 18,
        captured_at: "2026-06-30T03:29:58.000Z",
        provider: "device",
        permission_state: "granted",
      },
    });
    const submittedBatch = offlineBatch(registeredDeviceId, [submittedEvent], batchId);
    const seeded = await seedAcceptedExpiredOfflineSubmission(currentApp, {
      companyId,
      actorUserId: employee.user.id,
      employeeUserId: employee.user.id,
      registeredDeviceId,
      batchId,
      event: submittedEvent,
    });

    const storedBefore = await pool.query<{
      inbox_id: string;
      sync_status: string;
      verification_status: string;
      reason_code: string | null;
      event_hash: string;
      event_payload: Record<string, unknown>;
      attendance_event_id: string;
      location_evidence_id: string;
      coordinates_expire_at: Date;
      coordinates_purged_at: Date | null;
    }>(
      `SELECT inbox.id AS inbox_id,
              inbox.sync_status,
              inbox.verification_status,
              inbox.reason_code,
              inbox.event_hash,
              inbox.event_payload,
              inbox.attendance_event_id,
              location.id AS location_evidence_id,
              location.coordinates_expire_at,
              location.coordinates_purged_at
         FROM attendance.offline_event_inbox inbox
         JOIN attendance.location_evidence location
           ON location.attendance_event_id = inbox.attendance_event_id
          AND location.company_id = inbox.company_id
        WHERE inbox.client_event_id = $1
          AND inbox.company_id = $2`,
      [clientEventId, companyId],
    );
    expect(storedBefore.rows).toHaveLength(1);
    expect(storedBefore.rows[0]).toMatchObject({
      sync_status: "accepted",
      verification_status: "unverified",
      reason_code: "offline_sync.accepted_unverified",
      event_hash: seeded.eventHash,
      attendance_event_id: seeded.attendanceEventId,
      location_evidence_id: seeded.locationEvidenceId,
      coordinates_purged_at: null,
    });
    expect(JSON.stringify(storedBefore.rows[0]?.event_payload)).toContain("12.971599");
    expect(storedBefore.rows[0]!.coordinates_expire_at.getTime()).toBeLessThan(Date.now());

    const purge = await new AttendanceCoordinatePurgeWorker(currentApp.store).purgeExpired({
      batchSize: 10,
    });

    expect(purge.purged).toBe(1);
    expect(purge.evidence_ids).toEqual([storedBefore.rows[0]!.location_evidence_id]);

    const storedAfterPurge = await pool.query<{
      event_hash: string;
      event_payload: Record<string, unknown>;
      latitude: string | null;
      longitude: string | null;
      action_count: string;
      storage_surfaces: string[];
      redacted_command_snapshot_count: number;
      redacted_offline_event_payload_count: number;
    }>(
      `SELECT inbox.event_hash,
              inbox.event_payload,
              location.latitude::text,
              location.longitude::text,
              (SELECT count(*)
                 FROM attendance.location_retention_actions action
                WHERE action.location_evidence_id = location.id) AS action_count,
              action.storage_surfaces,
              action.redacted_command_snapshot_count,
              action.redacted_offline_event_payload_count
         FROM attendance.offline_event_inbox inbox
         JOIN attendance.location_evidence location
           ON location.attendance_event_id = inbox.attendance_event_id
          AND location.company_id = inbox.company_id
         JOIN attendance.location_retention_actions action
           ON action.location_evidence_id = location.id
          AND action.company_id = location.company_id
        WHERE inbox.id = $1`,
      [storedBefore.rows[0]!.inbox_id],
    );
    expect(storedAfterPurge.rows[0]).toMatchObject({
      event_hash: storedBefore.rows[0]!.event_hash,
      event_payload: expect.objectContaining({ location: null }),
      latitude: null,
      longitude: null,
      action_count: "1",
      storage_surfaces: [
        "attendance.location_evidence",
        "attendance.offline_event_inbox.event_payload",
      ],
      redacted_command_snapshot_count: 0,
      redacted_offline_event_payload_count: 1,
    });
    assertNoExactCoordinateLeak(storedAfterPurge.rows[0]?.event_payload);

    const replay = await syncOffline(currentApp, employee.token, submittedBatch);

    expect(replay.statusCode).toBe(200);
    expect(replay.json().results[0]).toMatchObject({
      client_event_id: clientEventId,
      sequence: 1,
      sync_status: "replayed",
      verification_status: "unverified",
      replayed: true,
      reason_code: "offline_sync.replayed",
      server_received_at: seeded.serverReceivedAt,
    });

    const counts = await pool.query<{
      inbox: string;
      events: string;
      location_evidence: string;
      retention_actions: string;
      provisional_outbox: string;
    }>(
      `SELECT
        (SELECT count(*) FROM attendance.offline_event_inbox WHERE client_event_id = $1) AS inbox,
        (SELECT count(*) FROM attendance.attendance_events WHERE id = $2) AS events,
        (SELECT count(*) FROM attendance.location_evidence WHERE attendance_event_id = $2) AS location_evidence,
        (SELECT count(*) FROM attendance.location_retention_actions WHERE location_evidence_id = $3) AS retention_actions,
        (SELECT count(*) FROM platform.outbox_events WHERE event_type = 'attendance.provisional.recorded') AS provisional_outbox`,
      [
        clientEventId,
        storedBefore.rows[0]!.attendance_event_id,
        storedBefore.rows[0]!.location_evidence_id,
      ],
    );
    expect(counts.rows[0]).toEqual({
      inbox: "1",
      events: "1",
      location_evidence: "1",
      retention_actions: "1",
      provisional_outbox: "1",
    });
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
    const actionRows = await pool.query<{ location_evidence_id: string; count: string }>(
      `SELECT location_evidence_id, count(*) AS count
         FROM attendance.location_retention_actions
        WHERE location_evidence_id = ANY($1::uuid[])
        GROUP BY location_evidence_id
        ORDER BY location_evidence_id`,
      [[first.locationEvidenceId, second.locationEvidenceId]],
    );
    expect(actionRows.rows).toHaveLength(2);
    expect(actionRows.rows.every((row) => row.count === "1")).toBe(true);
  });
});
