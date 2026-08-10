import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeader, loginAs } from "#testing";
import {
  AttendanceCommandTransactionRepository,
  PostgresAttendanceCommandRepository,
} from "../command-repository.js";
import { AttendanceGeoDecisionReasonCodes } from "../geo-policy.js";
import { resolveEffectiveAttendancePolicy } from "../policy-resolver.js";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
type GoldenShape = "circle" | "polygon";
type GoldenOutcome =
  | "inside_confident"
  | "outside_confident"
  | "boundary_uncertain"
  | "stale_evidence"
  | "accuracy_exceeded"
  | "fence_not_configured";

type FixtureIds = {
  siteId: string;
  geofenceId: string;
  versionId: string;
};

type PolicyFixtureIds = {
  policyId: string;
  policyVersionId: string;
  assignmentId: string;
};

type CoordinatePoint = {
  latitude: number;
  longitude: number;
};

type GoldenGeoCase = {
  name: string;
  ids: FixtureIds;
  shape: GoldenShape;
  point: "circle_center" | "circle_outside" | "circle_boundary" | "polygon_inside" | "polygon_outside" | "polygon_edge" | "polygon_vertex";
  accuracyMeters: number;
  maxAccuracyMeters?: number;
  maxLocationAgeMs?: number;
  capturedAtOffsetMs?: number;
  expectedStatus: 200 | 409;
  expectedOutcome: GoldenOutcome;
  expectedReasonCode: string;
};

const originalDatabaseUrl = process.env.DATABASE_URL;

const COMPANY_B_ID = fixedId(900_001);
const GOLDEN_POLYGON_WKT =
  "POLYGON((77.594 12.971,77.596 12.971,77.596 12.973,77.594 12.973,77.594 12.971))";
const CIRCLE_CENTER = { latitude: 12.972, longitude: 77.595 };
const CIRCLE_RADIUS_METERS = 100;

function fixedId(ordinal: number): string {
  return `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}`;
}

function fixtureIds(ordinal: number): FixtureIds {
  return {
    siteId: fixedId(10_000 + ordinal),
    geofenceId: fixedId(20_000 + ordinal),
    versionId: fixedId(30_000 + ordinal),
  };
}

function policyIds(ordinal: number): PolicyFixtureIds {
  return {
    policyId: fixedId(40_000 + ordinal),
    policyVersionId: fixedId(50_000 + ordinal),
    assignmentId: fixedId(60_000 + ordinal),
  };
}

function headers(token: string, idempotencyKey: string): Record<string, string> {
  return {
    ...authHeader(token),
    "idempotency-key": idempotencyKey,
  };
}

function employeeCompanyId(app: TestApp, employeeUserId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employeeUserId,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return companyId;
}

async function clearGoldenFixtures(app: TestApp): Promise<void> {
  await app.store.pgPool!.query(`
    TRUNCATE TABLE
      attendance.regularization_correction_applications,
      attendance.regularization_actions,
      attendance.regularization_request_items,
      attendance.regularization_requests,
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.punch_events,
      attendance.command_decisions,
      attendance.command_executions,
      attendance.employee_command_states,
      attendance.break_segments,
      attendance.sessions,
      attendance.daily_records,
      attendance.policy_assignments,
      attendance.policy_versions,
      attendance.policies,
      attendance.geofence_versions,
      attendance.geofences,
      attendance.work_sites
    RESTART IDENTITY CASCADE
  `);
  await app.store.pgPool!.query("DELETE FROM platform.outbox_events WHERE aggregate_type = 'attendance'");
  await app.store.pgPool!.query("DELETE FROM platform.idempotency_keys WHERE scope LIKE 'attendance.%'");
}

async function dbIso(app: TestApp, offsetMs = 120_000): Promise<string> {
  const result = await app.store.pgPool!.query<{ value: Date }>(
    "SELECT (transaction_timestamp() + ($1::integer * interval '1 millisecond')) AS value",
    [offsetMs],
  );
  const value = result.rows[0]?.value;
  if (!value) throw new Error("Database timestamp fixture was not returned.");
  return value.toISOString();
}

async function dbReceivedAndCapturedAt(
  app: TestApp,
  ageMs: number,
): Promise<{ receivedAt: string; capturedAt: string }> {
  const result = await app.store.pgPool!.query<{
    received_at: Date;
    captured_at: Date;
  }>(
    `SELECT
       transaction_timestamp() AS received_at,
       transaction_timestamp() - ($1::integer * interval '1 millisecond') AS captured_at`,
    [ageMs],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Database exact-age fixture was not returned.");
  return {
    receivedAt: row.received_at.toISOString(),
    capturedAt: row.captured_at.toISOString(),
  };
}

async function circleBoundaryPoint(app: TestApp): Promise<CoordinatePoint> {
  const result = await app.store.pgPool!.query<{
    latitude: number;
    longitude: number;
    distance_meters: number;
  }>(
    `WITH projected AS (
       SELECT ST_Project(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3::double precision,
         radians(90)
       )::geometry AS geom
     )
     SELECT
       ST_Y(geom) AS latitude,
       ST_X(geom) AS longitude,
       ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
     FROM projected`,
    [CIRCLE_CENTER.longitude, CIRCLE_CENTER.latitude, CIRCLE_RADIUS_METERS],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Circle boundary fixture was not returned.");
  expect(Number(row.distance_meters)).toBeCloseTo(CIRCLE_RADIUS_METERS, 3);
  return { latitude: Number(row.latitude), longitude: Number(row.longitude) };
}

function pointFor(name: GoldenGeoCase["point"], boundary: CoordinatePoint): CoordinatePoint {
  switch (name) {
    case "circle_center":
      return CIRCLE_CENTER;
    case "circle_outside":
      return { latitude: 12.975, longitude: 77.598 };
    case "circle_boundary":
      return boundary;
    case "polygon_inside":
      return { latitude: 12.972, longitude: 77.595 };
    case "polygon_outside":
      return { latitude: 12.974, longitude: 77.597 };
    case "polygon_edge":
      return { latitude: 12.971, longitude: 77.595 };
    case "polygon_vertex":
      return { latitude: 12.971, longitude: 77.594 };
  }
}

function coordinateLocation(
  point: CoordinatePoint,
  capturedAt: string,
  accuracyMeters: number,
): Record<string, unknown> {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy_meters: accuracyMeters,
    captured_at: capturedAt,
    provider: "browser",
    permission_state: "granted",
  };
}

async function createWorkSite(
  app: TestApp,
  input: {
    ids: FixtureIds;
    companyId: string;
    siteCode: string;
  },
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.work_sites (
       id, company_id, site_code, name, site_type, timezone, metadata
     ) VALUES ($1, $2, $3, 'Golden Dataset Site', 'office', 'Asia/Kolkata', '{}'::jsonb)`,
    [input.ids.siteId, input.companyId, input.siteCode],
  );
}

async function createGeofenceShell(
  app: TestApp,
  input: {
    ids: FixtureIds;
    companyId: string;
    geofenceCode: string;
  },
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.geofences (
       id, company_id, work_site_id, geofence_code, name, metadata
     ) VALUES ($1, $2, $3, $4, 'Golden Dataset Fence', '{}'::jsonb)`,
    [input.ids.geofenceId, input.companyId, input.ids.siteId, input.geofenceCode],
  );
}

async function createPublishedGeofence(
  app: TestApp,
  input: {
    ids: FixtureIds;
    companyId: string;
    shape: GoldenShape;
    siteCode: string;
    geofenceCode: string;
    wkt?: string;
  },
): Promise<void> {
  await createWorkSite(app, input);
  await createGeofenceShell(app, input);
  if (input.shape === "circle") {
    await app.store.pgPool!.query(
      `INSERT INTO attendance.geofence_versions (
         id, company_id, geofence_id, version_number, version_status,
         shape_type, shape, circle_radius_meters, shape_metadata,
         created_by_user_id, published_by_user_id, published_at,
         effective_from, effective_until, canonical_hash
       ) VALUES (
         $1, $2, $3, 1, 'published',
         'circle', ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, '{}'::jsonb,
         $7::uuid, $7::uuid, transaction_timestamp() - interval '1 day',
         transaction_timestamp() - interval '1 day', NULL,
         attendance.geofence_shape_canonical_hash(
           'circle',
           ST_SetSRID(ST_MakePoint($4, $5), 4326),
           $6
         )
       )`,
      [
        input.ids.versionId,
        input.companyId,
        input.ids.geofenceId,
        CIRCLE_CENTER.longitude,
        CIRCLE_CENTER.latitude,
        CIRCLE_RADIUS_METERS,
        fixedId(700_001),
      ],
    );
  } else {
    await app.store.pgPool!.query(
      `INSERT INTO attendance.geofence_versions (
         id, company_id, geofence_id, version_number, version_status,
         shape_type, shape, circle_radius_meters, shape_metadata,
         created_by_user_id, published_by_user_id, published_at,
         effective_from, effective_until, canonical_hash
       ) VALUES (
         $1, $2, $3, 1, 'published',
         'polygon', ST_GeomFromText($4, 4326), NULL, '{}'::jsonb,
         $5::uuid, $5::uuid, transaction_timestamp() - interval '1 day',
         transaction_timestamp() - interval '1 day', NULL,
         attendance.geofence_shape_canonical_hash('polygon', ST_GeomFromText($4, 4326), NULL)
       )`,
      [
        input.ids.versionId,
        input.companyId,
        input.ids.geofenceId,
        input.wkt ?? GOLDEN_POLYGON_WKT,
        fixedId(700_001),
      ],
    );
  }
  await app.store.pgPool!.query(
    `UPDATE attendance.geofences
        SET current_published_version_id = $1
      WHERE id = $2`,
    [input.ids.versionId, input.ids.geofenceId],
  );
}

async function createDraftPolygonVersion(
  app: TestApp,
  input: {
    ids: FixtureIds;
    companyId: string;
    versionId: string;
    versionNumber: number;
    wkt: string;
  },
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.geofence_versions (
       id, company_id, geofence_id, version_number, shape_type, shape,
       shape_metadata, created_by_user_id
     ) VALUES (
       $1, $2, $3, $4, 'polygon', ST_GeomFromText($5, 4326), '{}'::jsonb, $6
     )`,
    [
      input.versionId,
      input.companyId,
      input.ids.geofenceId,
      input.versionNumber,
      input.wkt,
      fixedId(700_002),
    ],
  );
}

async function assignAttendancePolicy(
  app: TestApp,
  input: {
    policyOrdinal: number;
    companyId: string;
    employeeUserId: string;
    effectiveGeofenceIds?: string[];
    config?: Record<string, unknown>;
  },
): Promise<PolicyFixtureIds> {
  const ids = policyIds(input.policyOrdinal);
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policies (
       id, company_id, policy_key, name, label, status
     ) VALUES ($1, $2, 'attendance', $3, $3, 'active')`,
    [
      ids.policyId,
      input.companyId,
      `Golden Geo ${input.policyOrdinal}`,
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_versions (
       id, company_id, policy_id, version_number, effective_from, effective_until,
       config, created_at
     ) VALUES (
       $1, $2, $3, 1,
       transaction_timestamp() - interval '1 day',
       NULL,
       $4::jsonb,
       transaction_timestamp() - interval '1 day'
     )`,
    [
      ids.policyVersionId,
      input.companyId,
      ids.policyId,
      JSON.stringify({
        fullDayPunchWindow: true,
        allowOffDayPunches: true,
        attendanceMode: "geo_required",
        fallbackApprovalMode: "disabled",
        locationUnavailableAction: "deny",
        permissionDeniedAction: "deny",
        outsideFenceAction: "deny",
        boundaryUncertainAction: "deny",
        staleEvidenceAction: "deny",
        accuracyExceededAction: "deny",
        effectiveGeofenceIds: input.effectiveGeofenceIds ?? [],
        ...input.config,
      }),
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_assignments (
       id, company_id, policy_id, scope_type, scope_id, effective_from, effective_until, status
     ) VALUES (
       $1, $2, $3, 'employee', $4,
       transaction_timestamp() - interval '1 day',
       NULL,
       'active'
     )`,
    [ids.assignmentId, input.companyId, ids.policyId, input.employeeUserId],
  );
  return ids;
}

async function assertPolicyFixtureRows(
  app: TestApp,
  input: {
    companyId: string;
    employeeUserId: string;
    policy: PolicyFixtureIds;
    effectiveGeofenceIds: string[];
  },
): Promise<void> {
  const result = await app.store.pgPool!.query<{
    db_as_of: Date;
    employee_id: string;
    employee_company_id: string | null;
    policy_id: string;
    policy_company_id: string;
    policy_key: string;
    policy_status: string;
    version_id: string;
    version_company_id: string;
    version_effective: boolean;
    version_geofence_ids: string[];
    assignment_id: string;
    assignment_company_id: string;
    assignment_scope_type: string;
    assignment_scope_id: string | null;
    assignment_status: string;
    assignment_effective: boolean;
  }>(
    `WITH clock AS (
       SELECT transaction_timestamp() AS db_as_of
     )
     SELECT
       clock.db_as_of,
       employee.id AS employee_id,
       preference.company_id AS employee_company_id,
       policy.id AS policy_id,
       policy.company_id AS policy_company_id,
       policy.policy_key,
       policy.status AS policy_status,
       version.id AS version_id,
       version.company_id AS version_company_id,
       (
         version.effective_from <= clock.db_as_of
         AND (version.effective_until IS NULL OR clock.db_as_of < version.effective_until)
       ) AS version_effective,
       ARRAY(
         SELECT jsonb_array_elements_text(version.config -> 'effectiveGeofenceIds')
       ) AS version_geofence_ids,
       assignment.id AS assignment_id,
       assignment.company_id AS assignment_company_id,
       assignment.scope_type AS assignment_scope_type,
       assignment.scope_id AS assignment_scope_id,
       assignment.status AS assignment_status,
       (
         assignment.effective_from <= clock.db_as_of
         AND (assignment.effective_until IS NULL OR clock.db_as_of < assignment.effective_until)
       ) AS assignment_effective
     FROM clock
     JOIN core.users employee
       ON employee.id = $1
      AND employee.deleted_at IS NULL
     LEFT JOIN platform.user_session_preferences preference
       ON preference.user_id = employee.id
     JOIN attendance.policies policy
       ON policy.id = $2
     JOIN attendance.policy_versions version
       ON version.id = $3
     JOIN attendance.policy_assignments assignment
       ON assignment.id = $4`,
    [
      input.employeeUserId,
      input.policy.policyId,
      input.policy.policyVersionId,
      input.policy.assignmentId,
    ],
  );
  const row = result.rows[0];
  expect(row, "Expected deterministic attendance policy fixture rows to exist").toBeDefined();
  expect(row).toMatchObject({
    employee_id: input.employeeUserId,
    employee_company_id: input.companyId,
    policy_id: input.policy.policyId,
    policy_company_id: input.companyId,
    policy_key: "attendance",
    policy_status: "active",
    version_id: input.policy.policyVersionId,
    version_company_id: input.companyId,
    version_effective: true,
    version_geofence_ids: input.effectiveGeofenceIds,
    assignment_id: input.policy.assignmentId,
    assignment_company_id: input.companyId,
    assignment_scope_type: "employee",
    assignment_scope_id: input.employeeUserId,
    assignment_status: "active",
    assignment_effective: true,
  });
}

async function assertGeoRequiredFixturePolicy(
  app: TestApp,
  input: {
    companyId: string;
    employeeUserId: string;
    policy: PolicyFixtureIds;
    effectiveGeofenceIds: string[];
  },
): Promise<void> {
  await assertPolicyFixtureRows(app, input);
  const repository = new PostgresAttendanceCommandRepository(app.store.pgPool!);
  const resolved = await repository.transaction(async (tx) => {
    const asOf = await tx.getTransactionTimestamp();
    return resolveEffectiveAttendancePolicy(tx, {
      companyId: input.companyId,
      subjectEmployeeUserId: input.employeeUserId,
      asOf,
    });
  });

  expect(
    resolved,
    "Expected geo-required fixture policy, but fallback/non-geo policy resolved",
  ).toMatchObject({
    source: "assignment",
    policyId: input.policy.policyId,
    policyVersionId: input.policy.policyVersionId,
    assignmentId: input.policy.assignmentId,
    assignmentScopeType: "employee",
    assignmentScopeId: input.employeeUserId,
    attendanceMode: "geo_required",
    effectiveGeofenceIds: input.effectiveGeofenceIds,
  });
}

async function runPunch(
  app: TestApp,
  input: {
    token: string;
    idempotencyKey: string;
    location: Record<string, unknown>;
  },
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/attendance/punches",
    headers: headers(input.token, input.idempotencyKey),
    payload: {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {},
      location: input.location,
    },
  });
}

function geoPolicyFromResponse(response: Awaited<ReturnType<typeof runPunch>>): Record<string, unknown> {
  const body = response.json();
  return (response.statusCode === 200 ? body.geo_policy : body.details.geo_policy) as Record<string, unknown>;
}

async function commandIdForIdempotencyKey(
  app: TestApp,
  idempotencyKey: string,
): Promise<string> {
  const result = await app.store.pgPool!.query<{ id: string }>(
    `SELECT id
       FROM attendance.command_executions
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  const commandId = result.rows[0]?.id;
  if (!commandId) throw new Error(`Command execution was not found for ${idempotencyKey}.`);
  return commandId;
}

async function decisionReasonCodesForCommand(
  app: TestApp,
  commandId: string,
): Promise<string[]> {
  const result = await app.store.pgPool!.query<{ reason_code: string }>(
    `SELECT reason.reason_code
       FROM attendance.decision_reasons reason
       JOIN attendance.attendance_decisions decision
         ON decision.id = reason.attendance_decision_id
      WHERE decision.command_execution_id = $1
      ORDER BY reason.ordinal, reason.id`,
    [commandId],
  );
  return result.rows.map((row) => row.reason_code);
}

async function mutationCounts(app: TestApp): Promise<Record<string, string>> {
  const counts = await app.store.pgPool!.query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM attendance.sessions) AS sessions,
       (SELECT count(*) FROM attendance.punch_events) AS punches,
       (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type = 'attendance') AS outbox`,
  );
  return counts.rows[0] ?? {};
}

async function commandRows(
  app: TestApp,
  commandId: string,
): Promise<{
  command_company_id: string;
  command_decision_outcome: string;
  audit_outcome: string;
  evidence_company_id: string | null;
  evidence_accuracy_meters: string | null;
  evidence_age_ms: number | null;
  command_evidence_snapshot: unknown;
  audit_evaluation_context: unknown;
  attendance_event_count: string;
}> {
  const result = await app.store.pgPool!.query<{
    command_company_id: string;
    command_decision_outcome: string;
    audit_outcome: string;
    evidence_company_id: string | null;
    evidence_accuracy_meters: string | null;
    evidence_age_ms: number | null;
    command_evidence_snapshot: unknown;
    audit_evaluation_context: unknown;
    attendance_event_count: string;
  }>(
    `SELECT
       command.company_id AS command_company_id,
       command_decision.outcome AS command_decision_outcome,
       audit.outcome AS audit_outcome,
       evidence.company_id AS evidence_company_id,
       evidence.accuracy_meters::text AS evidence_accuracy_meters,
       evidence.age_ms AS evidence_age_ms,
       command_decision.evidence_snapshot AS command_evidence_snapshot,
       audit.evaluation_context AS audit_evaluation_context,
       (SELECT count(*) FROM attendance.attendance_events event WHERE event.command_execution_id = command.id) AS attendance_event_count
     FROM attendance.command_executions command
     JOIN attendance.command_decisions command_decision
       ON command_decision.command_execution_id = command.id
     JOIN attendance.attendance_decisions audit
       ON audit.command_execution_id = command.id
     LEFT JOIN attendance.attendance_events event
       ON event.command_execution_id = command.id
     LEFT JOIN attendance.location_evidence evidence
       ON evidence.attendance_event_id = event.id
     WHERE command.id = $1`,
    [commandId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Command persistence rows were not found.");
  return row;
}

async function expectGoldenCommandOutcome(
  app: TestApp,
  input: {
    commandId: string;
    companyId: string;
    expectedStatus: 200 | 409;
    expectedReasonCode: string;
    expectedAccuracyMeters: number;
    minAgeMs?: number;
  },
): Promise<void> {
  const rows = await commandRows(app, input.commandId);
  expect(rows.command_company_id).toBe(input.companyId);
  expect(rows.command_decision_outcome).toBe(input.expectedStatus === 200 ? "allowed" : "denied");
  expect(rows.audit_outcome).toBe(input.expectedStatus === 200 ? "passed" : "failed");
  expect(rows.evidence_company_id).toBe(input.companyId);
  expect(rows.evidence_accuracy_meters).toBe(input.expectedAccuracyMeters.toFixed(2));
  if (input.minAgeMs !== undefined) {
    expect(rows.evidence_age_ms).toBeGreaterThan(input.minAgeMs);
  } else {
    expect(rows.evidence_age_ms).toBeGreaterThanOrEqual(0);
  }
  const reasonCodes = await decisionReasonCodesForCommand(app, input.commandId);
  expect(reasonCodes).toEqual([input.expectedReasonCode]);
  expect(reasonCodes).toEqual([...new Set(reasonCodes)]);
  expect(await mutationCounts(app)).toMatchObject({
    sessions: input.expectedStatus === 200 ? "1" : "0",
    punches: input.expectedStatus === 200 ? "1" : "0",
    outbox: "1",
  });
}

async function expectRejectedQuery(
  app: TestApp,
  sql: string,
  params: unknown[],
  constraintName: string,
): Promise<void> {
  await expect(app.store.pgPool!.query(sql, params)).rejects.toMatchObject({
    constraint: constraintName,
  });
}

const goldenCases: GoldenGeoCase[] = [
  {
    name: "circle inside",
    ids: fixtureIds(1),
    shape: "circle",
    point: "circle_center",
    accuracyMeters: 1,
    expectedStatus: 200,
    expectedOutcome: "inside_confident",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoInsideFence,
  },
  {
    name: "circle outside",
    ids: fixtureIds(2),
    shape: "circle",
    point: "circle_outside",
    accuracyMeters: 1,
    expectedStatus: 409,
    expectedOutcome: "outside_confident",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoOutsideFence,
  },
  {
    name: "circle exact boundary with zero accuracy",
    ids: fixtureIds(3),
    shape: "circle",
    point: "circle_boundary",
    accuracyMeters: 0,
    expectedStatus: 200,
    expectedOutcome: "inside_confident",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoInsideFence,
  },
  {
    name: "circle exact boundary with positive accuracy",
    ids: fixtureIds(4),
    shape: "circle",
    point: "circle_boundary",
    accuracyMeters: 1,
    expectedStatus: 409,
    expectedOutcome: "boundary_uncertain",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoBoundaryUncertain,
  },
  {
    name: "polygon inside",
    ids: fixtureIds(5),
    shape: "polygon",
    point: "polygon_inside",
    accuracyMeters: 0,
    expectedStatus: 200,
    expectedOutcome: "inside_confident",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoInsideFence,
  },
  {
    name: "polygon outside",
    ids: fixtureIds(6),
    shape: "polygon",
    point: "polygon_outside",
    accuracyMeters: 1,
    expectedStatus: 409,
    expectedOutcome: "outside_confident",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoOutsideFence,
  },
  {
    name: "polygon edge",
    ids: fixtureIds(7),
    shape: "polygon",
    point: "polygon_edge",
    accuracyMeters: 1,
    expectedStatus: 409,
    expectedOutcome: "boundary_uncertain",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoBoundaryUncertain,
  },
  {
    name: "polygon vertex",
    ids: fixtureIds(8),
    shape: "polygon",
    point: "polygon_vertex",
    accuracyMeters: 1,
    expectedStatus: 409,
    expectedOutcome: "boundary_uncertain",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoBoundaryUncertain,
  },
  {
    name: "acceptable accuracy",
    ids: fixtureIds(9),
    shape: "polygon",
    point: "polygon_inside",
    accuracyMeters: 5,
    maxAccuracyMeters: 10,
    expectedStatus: 200,
    expectedOutcome: "inside_confident",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoInsideFence,
  },
  {
    name: "accuracy exactly at threshold",
    ids: fixtureIds(10),
    shape: "polygon",
    point: "polygon_inside",
    accuracyMeters: 10,
    maxAccuracyMeters: 10,
    expectedStatus: 200,
    expectedOutcome: "inside_confident",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoInsideFence,
  },
  {
    name: "poor accuracy",
    ids: fixtureIds(11),
    shape: "polygon",
    point: "polygon_inside",
    accuracyMeters: 11,
    maxAccuracyMeters: 10,
    expectedStatus: 409,
    expectedOutcome: "accuracy_exceeded",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoAccuracyExceeded,
  },
  {
    name: "stale location",
    ids: fixtureIds(13),
    shape: "polygon",
    point: "polygon_inside",
    accuracyMeters: 1,
    maxLocationAgeMs: 60_000,
    capturedAtOffsetMs: -120_000,
    expectedStatus: 409,
    expectedOutcome: "stale_evidence",
    expectedReasonCode: AttendanceGeoDecisionReasonCodes.GeoStaleEvidence,
  },
];

describe("attendance geo golden dataset", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    await clearGoldenFixtures(app);
  }, 30_000);

  afterEach(async () => {
    try {
      vi.restoreAllMocks();
      if (app) await clearGoldenFixtures(app);
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
  }, 30_000);

  it.each(goldenCases)("$name", async (testCase) => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const boundary = await circleBoundaryPoint(app);
    await createPublishedGeofence(app, {
      ids: testCase.ids,
      companyId,
      shape: testCase.shape,
      siteCode: `GOLD_SITE_${testCase.name.replaceAll(" ", "_").toUpperCase()}`,
      geofenceCode: `GOLD_FENCE_${testCase.name.replaceAll(" ", "_").toUpperCase()}`,
    });
    const policy = await assignAttendancePolicy(app, {
      policyOrdinal: goldenCases.indexOf(testCase) + 1,
      companyId,
      employeeUserId: employee.user.id,
      effectiveGeofenceIds: [testCase.ids.geofenceId],
      config: {
        maxAccuracyMeters: testCase.maxAccuracyMeters ?? 100,
        maxLocationAgeMs: testCase.maxLocationAgeMs ?? 300_000,
      },
    });
    await assertGeoRequiredFixturePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      policy,
      effectiveGeofenceIds: [testCase.ids.geofenceId],
    });

    const point = pointFor(testCase.point, boundary);
    const capturedAt = await dbIso(app, testCase.capturedAtOffsetMs ?? 120_000);
    const idempotencyKey = `geo-golden-${testCase.name.replaceAll(" ", "-")}`;
    const response = await runPunch(app, {
      token: employee.token,
      idempotencyKey,
      location: coordinateLocation(point, capturedAt, testCase.accuracyMeters),
    });

    expect(response.statusCode).toBe(testCase.expectedStatus);
    if (testCase.expectedStatus === 409) {
      expect(response.json().details.reason_code).toBe(testCase.expectedReasonCode);
    }
    const geoPolicy = geoPolicyFromResponse(response);
    expect(geoPolicy).toMatchObject({
      factual_outcome: testCase.expectedOutcome,
      selected_action: testCase.expectedStatus === 200 ? "allow" : "deny",
      allowed: testCase.expectedStatus === 200,
      reason_code: testCase.expectedReasonCode,
    });
    if (testCase.expectedOutcome === "accuracy_exceeded" || testCase.expectedOutcome === "stale_evidence") {
      expect(geoPolicy).toMatchObject({ geofence_id: null });
    } else {
      expect(geoPolicy).toMatchObject({ geofence_id: testCase.ids.geofenceId });
    }
    const evaluation = geoPolicy.evaluation as Record<string, unknown>;
    expect(evaluation.category).toBe(testCase.expectedOutcome);
    if (testCase.shape === "circle" && testCase.expectedOutcome !== "accuracy_exceeded" && testCase.expectedOutcome !== "stale_evidence") {
      expect(evaluation).toMatchObject({
        selected_shape_type: "circle",
        radius_meters: CIRCLE_RADIUS_METERS,
        grace_meters: 0,
      });
    }
    if (testCase.shape === "polygon" && testCase.expectedOutcome !== "accuracy_exceeded" && testCase.expectedOutcome !== "stale_evidence") {
      expect(evaluation).toMatchObject({
        selected_shape_type: "polygon",
        grace_meters: 0,
      });
    }

    const commandId = await commandIdForIdempotencyKey(app, idempotencyKey);
    await expectGoldenCommandOutcome(app, {
      commandId,
      companyId,
      expectedStatus: testCase.expectedStatus,
      expectedReasonCode: testCase.expectedReasonCode,
      expectedAccuracyMeters: testCase.accuracyMeters,
      minAgeMs: testCase.expectedOutcome === "stale_evidence" ? 60_000 : undefined,
    });
  });

  it("location age exactly at threshold remains fresh through the production command", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const ids = fixtureIds(12);
    await createPublishedGeofence(app, {
      ids,
      companyId,
      shape: "polygon",
      siteCode: "GOLD_SITE_EXACT_LOCATION_AGE",
      geofenceCode: "GOLD_FENCE_EXACT_LOCATION_AGE",
    });
    const policy = await assignAttendancePolicy(app, {
      policyOrdinal: 12,
      companyId,
      employeeUserId: employee.user.id,
      effectiveGeofenceIds: [ids.geofenceId],
      config: {
        maxLocationAgeMs: 60_000,
        maxAccuracyMeters: 100,
      },
    });
    await assertGeoRequiredFixturePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      policy,
      effectiveGeofenceIds: [ids.geofenceId],
    });

    const exactAge = await dbReceivedAndCapturedAt(app, 60_000);
    const timestampSpy = vi
      .spyOn(AttendanceCommandTransactionRepository.prototype, "getTransactionTimestamp")
      .mockResolvedValue(exactAge.receivedAt);
    try {
      const response = await runPunch(app, {
        token: employee.token,
        idempotencyKey: "geo-golden-location-age-exact-threshold",
        location: coordinateLocation(
          { latitude: 12.972, longitude: 77.595 },
          exactAge.capturedAt,
          1,
        ),
      });

      expect(response.statusCode).toBe(200);
      expect(geoPolicyFromResponse(response)).toMatchObject({
        factual_outcome: "inside_confident",
        reason_code: AttendanceGeoDecisionReasonCodes.GeoInsideFence,
        geofence_id: ids.geofenceId,
        evaluation: {
          evidence_age_ms: 60_000,
          max_location_age_ms: 60_000,
        },
      });
      const commandId = await commandIdForIdempotencyKey(
        app,
        "geo-golden-location-age-exact-threshold",
      );
      const rows = await commandRows(app, commandId);
      expect(rows.evidence_age_ms).toBe(60_000);
    } finally {
      timestampSpy.mockRestore();
    }
  });

  it("invalid polygon fixtures are rejected and failed publishes leave active state unchanged", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = employeeCompanyId(app, admin.user.id);
    const ids = fixtureIds(14);
    await createPublishedGeofence(app, {
      ids,
      companyId,
      shape: "polygon",
      siteCode: "GOLD_SITE_INVALID_POLYGON",
      geofenceCode: "GOLD_FENCE_INVALID_POLYGON",
    });

    await expectRejectedQuery(
      app,
      `INSERT INTO attendance.geofence_versions (
         id, company_id, geofence_id, version_number, shape_type, shape,
         shape_metadata, created_by_user_id
       ) VALUES (
         $1, $2, $3, 2, 'polygon',
         ST_GeomFromText('POLYGON((77 12,78 13,78 12,77 13,77 12))', 4326),
         '{}'::jsonb, $4
      )`,
      [fixedId(31_014), companyId, ids.geofenceId, fixedId(700_014)],
      "attendance_geofence_versions_spatial_shape_check",
    );

    const outOfRangeVersionId = fixedId(32_014);
    await createDraftPolygonVersion(app, {
      ids,
      companyId,
      versionId: outOfRangeVersionId,
      versionNumber: 3,
      wkt: "POLYGON((181 12,182 12,182 13,181 13,181 12))",
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/geofences/${ids.geofenceId}/versions/${outOfRangeVersionId}/publish`,
      headers: authHeader(admin.token),
      payload: {
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: "2026-06-02T00:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("longitude");
    const state = await app.store.pgPool!.query<{
      draft_status: string;
      draft_effective_from: Date | null;
      draft_hash: string | null;
      current_published_version_id: string | null;
    }>(
      `SELECT
         draft.version_status AS draft_status,
         draft.effective_from AS draft_effective_from,
         draft.canonical_hash AS draft_hash,
         geofence.current_published_version_id
       FROM attendance.geofence_versions draft
       JOIN attendance.geofences geofence ON geofence.id = draft.geofence_id
       WHERE draft.id = $1`,
      [outOfRangeVersionId],
    );
    expect(state.rows[0]).toMatchObject({
      draft_status: "draft",
      draft_effective_from: null,
      draft_hash: null,
      current_published_version_id: ids.versionId,
    });
  });

  it("overlapping same-company fences select deterministically by configured candidate order", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const first = fixtureIds(15);
    const second = fixtureIds(16);
    await createPublishedGeofence(app, {
      ids: first,
      companyId,
      shape: "polygon",
      siteCode: "GOLD_SITE_OVERLAP_A",
      geofenceCode: "GOLD_FENCE_OVERLAP_A",
    });
    await createPublishedGeofence(app, {
      ids: second,
      companyId,
      shape: "polygon",
      siteCode: "GOLD_SITE_OVERLAP_B",
      geofenceCode: "GOLD_FENCE_OVERLAP_B",
    });
    const policy = await assignAttendancePolicy(app, {
      policyOrdinal: 15,
      companyId,
      employeeUserId: employee.user.id,
      effectiveGeofenceIds: [first.geofenceId, second.geofenceId],
    });
    await assertGeoRequiredFixturePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      policy,
      effectiveGeofenceIds: [first.geofenceId, second.geofenceId],
    });

    const capturedAt = await dbIso(app);
    const response = await runPunch(app, {
      token: employee.token,
      idempotencyKey: "geo-golden-overlap-first",
      location: coordinateLocation({ latitude: 12.972, longitude: 77.595 }, capturedAt, 0),
    });
    expect(response.statusCode).toBe(200);
    expect(geoPolicyFromResponse(response)).toMatchObject({
      factual_outcome: "inside_confident",
      geofence_id: first.geofenceId,
      evaluation: {
        inside_match_count: 2,
        multiple_inside_matches: true,
        selected_candidate_ordinal: 1,
        selected_geofence_id: first.geofenceId,
        selection_reason: "inside_confident_strongest_margin",
      },
    });

    await clearGoldenFixtures(app);
    await createPublishedGeofence(app, {
      ids: first,
      companyId,
      shape: "polygon",
      siteCode: "GOLD_SITE_OVERLAP_A",
      geofenceCode: "GOLD_FENCE_OVERLAP_A",
    });
    await createPublishedGeofence(app, {
      ids: second,
      companyId,
      shape: "polygon",
      siteCode: "GOLD_SITE_OVERLAP_B",
      geofenceCode: "GOLD_FENCE_OVERLAP_B",
    });
    const reversedPolicy = await assignAttendancePolicy(app, {
      policyOrdinal: 16,
      companyId,
      employeeUserId: employee.user.id,
      effectiveGeofenceIds: [second.geofenceId, first.geofenceId],
    });
    await assertGeoRequiredFixturePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      policy: reversedPolicy,
      effectiveGeofenceIds: [second.geofenceId, first.geofenceId],
    });
    const reversed = await runPunch(app, {
      token: employee.token,
      idempotencyKey: "geo-golden-overlap-reversed",
      location: coordinateLocation({ latitude: 12.972, longitude: 77.595 }, await dbIso(app), 0),
    });
    expect(reversed.statusCode).toBe(200);
    expect(geoPolicyFromResponse(reversed)).toMatchObject({
      factual_outcome: "inside_confident",
      geofence_id: second.geofenceId,
      evaluation: {
        inside_match_count: 2,
        multiple_inside_matches: true,
        selected_candidate_ordinal: 1,
        selected_geofence_id: second.geofenceId,
      },
    });
  });

  it("cross-tenant identical geometry keeps persisted geo evidence scoped to the active company", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const companyA = fixtureIds(17);
    const companyB = fixtureIds(18);
    await createPublishedGeofence(app, {
      ids: companyA,
      companyId,
      shape: "polygon",
      siteCode: "GOLD_SITE_TENANT_A",
      geofenceCode: "GOLD_FENCE_TENANT_A",
    });
    await createPublishedGeofence(app, {
      ids: companyB,
      companyId: COMPANY_B_ID,
      shape: "polygon",
      siteCode: "GOLD_SITE_TENANT_B",
      geofenceCode: "GOLD_FENCE_TENANT_B",
    });
    const policy = await assignAttendancePolicy(app, {
      policyOrdinal: 17,
      companyId,
      employeeUserId: employee.user.id,
      effectiveGeofenceIds: [companyA.geofenceId],
    });
    await assertGeoRequiredFixturePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      policy,
      effectiveGeofenceIds: [companyA.geofenceId],
    });

    const response = await runPunch(app, {
      token: employee.token,
      idempotencyKey: "geo-golden-cross-tenant-identical",
      location: coordinateLocation({ latitude: 12.972, longitude: 77.595 }, await dbIso(app), 0),
    });
    expect(response.statusCode).toBe(200);
    expect(geoPolicyFromResponse(response)).toMatchObject({
      factual_outcome: "inside_confident",
      geofence_id: companyA.geofenceId,
      evaluation: {
        selected_geofence_id: companyA.geofenceId,
        selected_geofence_version_id: companyA.versionId,
      },
    });

    const commandId = await commandIdForIdempotencyKey(app, "geo-golden-cross-tenant-identical");
    const rows = await commandRows(app, commandId);
    expect(rows.command_company_id).toBe(companyId);
    expect(rows.evidence_company_id).toBe(companyId);
    const snapshots = `${JSON.stringify(rows.command_evidence_snapshot)} ${JSON.stringify(rows.audit_evaluation_context)}`;
    expect(snapshots).toContain(companyA.geofenceId);
    expect(snapshots).not.toContain(companyB.geofenceId);
    expect(snapshots).not.toContain(companyB.versionId);
    expect(snapshots).not.toContain(COMPANY_B_ID);
  });

  it("cross-tenant foreign fence-only policies fail closed with no effective candidates", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const foreign = fixtureIds(19);
    await createPublishedGeofence(app, {
      ids: foreign,
      companyId: COMPANY_B_ID,
      shape: "polygon",
      siteCode: "GOLD_SITE_FOREIGN_ONLY",
      geofenceCode: "GOLD_FENCE_FOREIGN_ONLY",
    });
    const policy = await assignAttendancePolicy(app, {
      policyOrdinal: 18,
      companyId,
      employeeUserId: employee.user.id,
      effectiveGeofenceIds: [foreign.geofenceId],
    });
    await assertGeoRequiredFixturePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      policy,
      effectiveGeofenceIds: [foreign.geofenceId],
    });

    const response = await runPunch(app, {
      token: employee.token,
      idempotencyKey: "geo-golden-cross-tenant-foreign-only",
      location: coordinateLocation({ latitude: 12.972, longitude: 77.595 }, await dbIso(app), 0),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().details.reason_code).toBe(AttendanceGeoDecisionReasonCodes.GeoFenceNotConfigured);
    expect(geoPolicyFromResponse(response)).toMatchObject({
      factual_outcome: "fence_not_configured",
      allowed: false,
      geofence_id: null,
      evaluation: {
        category: "no_effective_geofence",
        candidate_count: 1,
        valid_candidate_count: 0,
      },
    });
    expect(await mutationCounts(app)).toMatchObject({ sessions: "0", punches: "0", outbox: "1" });
  });

  it("tenant-safe foreign geofence references are rejected by composite constraints", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const foreign = fixtureIds(20);
    await createWorkSite(app, {
      ids: foreign,
      companyId: COMPANY_B_ID,
      siteCode: "GOLD_SITE_FOREIGN_REFERENCE",
    });

    await expectRejectedQuery(
      app,
      `INSERT INTO attendance.geofences (
         id, company_id, work_site_id, geofence_code, name, metadata
       ) VALUES ($1, $2, $3, 'GOLD_FENCE_BAD_SITE_REFERENCE', 'Bad Site Reference', '{}'::jsonb)`,
      [fixedId(21_020), companyId, foreign.siteId],
      "attendance_geofences_work_site_company_fk",
    );

    await createGeofenceShell(app, {
      ids: foreign,
      companyId: COMPANY_B_ID,
      geofenceCode: "GOLD_FENCE_FOREIGN_REFERENCE",
    });
    await expectRejectedQuery(
      app,
      `INSERT INTO attendance.geofence_versions (
         id, company_id, geofence_id, version_number, shape_type, shape,
         circle_radius_meters, shape_metadata, created_by_user_id
       ) VALUES (
         $1, $2, $3, 1, 'circle',
         ST_SetSRID(ST_MakePoint(77.595, 12.972), 4326), 100, '{}'::jsonb, $4
       )`,
      [fixedId(31_020), companyId, foreign.geofenceId, fixedId(700_020)],
      "attendance_geofence_versions_geofence_company_fk",
    );

    const local = fixtureIds(21);
    await createPublishedGeofence(app, {
      ids: local,
      companyId,
      shape: "circle",
      siteCode: "GOLD_SITE_LOCAL_REFERENCE",
      geofenceCode: "GOLD_FENCE_LOCAL_REFERENCE",
    });
    await createDraftPolygonVersion(app, {
      ids: foreign,
      companyId: COMPANY_B_ID,
      versionId: foreign.versionId,
      versionNumber: 1,
      wkt: GOLDEN_POLYGON_WKT,
    });
    await app.store.pgPool!.query(
      `UPDATE attendance.geofence_versions
          SET version_status = 'published',
              published_by_user_id = $1,
              published_at = transaction_timestamp() - interval '1 day',
              effective_from = transaction_timestamp() - interval '1 day',
              canonical_hash = attendance.geofence_shape_canonical_hash('polygon', shape, NULL)
        WHERE id = $2`,
      [fixedId(700_021), foreign.versionId],
    );
    const client = await app.store.pgPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE attendance.geofences
            SET current_published_version_id = $1
          WHERE id = $2`,
        [foreign.versionId, local.geofenceId],
      );
      let commitError: unknown;
      try {
        await client.query("COMMIT");
      } catch (error) {
        commitError = error;
      }
      expect(commitError).toBeTruthy();
      expect([
        "attendance_geofences_current_published_version_fk",
        "attendance_geofences_current_version_published",
      ]).toContain((commitError as { constraint?: string }).constraint);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
