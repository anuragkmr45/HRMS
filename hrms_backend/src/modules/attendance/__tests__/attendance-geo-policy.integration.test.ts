import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;
let requestOrdinal = 0;

function headers(token: string): Record<string, string> {
  requestOrdinal += 1;
  return headersWithIdempotency(
    token,
    `geo-s12-005-${requestOrdinal.toString().padStart(4, "0")}`,
  );
}

function headersWithIdempotency(
  token: string,
  idempotencyKey: string,
): Record<string, string> {
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

async function clearGeoPolicyFixtures(app: TestApp): Promise<void> {
  const pool = app.store.pgPool;
  if (!pool) throw new Error("PostgreSQL pool is unavailable.");
  await pool.query(`
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
  await pool.query("DELETE FROM platform.outbox_events WHERE aggregate_type = 'attendance'");
  await pool.query("DELETE FROM platform.idempotency_keys WHERE scope LIKE 'attendance.%'");
}

async function createPublishedPolygonGeofence(
  app: TestApp,
  companyId: string,
  options: {
    status?: "draft" | "published";
    effectiveFrom?: string;
    effectiveUntil?: string | null;
  } = {},
): Promise<string> {
  const site = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.work_sites (
      company_id, site_code, name, site_type, timezone, metadata
    ) VALUES ($1, $2, 'Bengaluru Office', 'office', 'Asia/Kolkata', '{}'::jsonb)
    RETURNING id`,
    [companyId, `SITE-${randomUUID()}`],
  );
  const siteId = site.rows[0]?.id;
  if (!siteId) throw new Error("Work-site fixture was not created.");

  const geofence = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofences (
      company_id, work_site_id, geofence_code, name, metadata
    ) VALUES ($1, $2, $3, 'Primary Office Fence', '{}'::jsonb)
    RETURNING id`,
    [companyId, siteId, `GEO-${randomUUID()}`],
  );
  const geofenceId = geofence.rows[0]?.id;
  if (!geofenceId) throw new Error("Geofence fixture was not created.");

  const version = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
      company_id, geofence_id, version_number, version_status,
      shape_type, shape, circle_radius_meters, shape_metadata,
      created_by_user_id, published_by_user_id, published_at,
      effective_from, effective_until, canonical_hash
    ) VALUES (
      $1, $2, 1, $4, 'polygon',
      ST_GeomFromText($3, 4326), NULL, '{}'::jsonb,
      $5::uuid,
      CASE WHEN $4 = 'published' THEN $5::uuid ELSE NULL END,
      CASE WHEN $4 = 'published' THEN now() ELSE NULL END,
      CASE WHEN $4 = 'published' THEN $6::timestamptz ELSE NULL END,
      CASE WHEN $4 = 'published' THEN $7::timestamptz ELSE NULL END,
      CASE
        WHEN $4 = 'published'
          THEN attendance.geofence_shape_canonical_hash('polygon', ST_GeomFromText($3, 4326), NULL)
        ELSE NULL
      END
    )
    RETURNING id`,
    [
      companyId,
      geofenceId,
      "POLYGON((77.594 12.971,77.596 12.971,77.596 12.973,77.594 12.973,77.594 12.971))",
      options.status ?? "published",
      randomUUID(),
      options.effectiveFrom ?? "2026-01-01T00:00:00.000Z",
      options.effectiveUntil ?? null,
    ],
  );
  const versionId = version.rows[0]?.id;
  if (!versionId) throw new Error("Geofence version fixture was not created.");
  if ((options.status ?? "published") === "published") {
    await app.store.pgPool!.query(
      `UPDATE attendance.geofences
          SET current_published_version_id = $1
        WHERE id = $2`,
      [versionId, geofenceId],
    );
  }
  return geofenceId;
}

async function createPublishedCircleGeofence(
  app: TestApp,
  companyId: string,
  radiusMeters = 100,
): Promise<string> {
  const site = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.work_sites (
      company_id, site_code, name, site_type, timezone, metadata
    ) VALUES ($1, $2, 'Bengaluru Circle Office', 'office', 'Asia/Kolkata', '{}'::jsonb)
    RETURNING id`,
    [companyId, `SITE-${randomUUID()}`],
  );
  const siteId = site.rows[0]?.id;
  if (!siteId) throw new Error("Circle work-site fixture was not created.");

  const geofence = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofences (
      company_id, work_site_id, geofence_code, name, metadata
    ) VALUES ($1, $2, $3, 'Circle Office Fence', '{}'::jsonb)
    RETURNING id`,
    [companyId, siteId, `GEO-${randomUUID()}`],
  );
  const geofenceId = geofence.rows[0]?.id;
  if (!geofenceId) throw new Error("Circle geofence fixture was not created.");

  const version = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
      company_id, geofence_id, version_number, version_status,
      shape_type, shape, circle_radius_meters, shape_metadata,
      created_by_user_id, published_by_user_id, published_at,
      effective_from, effective_until, canonical_hash
    ) VALUES (
      $1, $2, 1, 'published', 'circle',
      ST_SetSRID(ST_MakePoint(77.595, 12.972), 4326), $3, '{}'::jsonb,
      $4::uuid, $4::uuid, now(),
      '2026-01-01T00:00:00.000Z', NULL,
      attendance.geofence_shape_canonical_hash(
        'circle',
        ST_SetSRID(ST_MakePoint(77.595, 12.972), 4326),
        $3
      )
    )
    RETURNING id`,
    [companyId, geofenceId, radiusMeters, randomUUID()],
  );
  const versionId = version.rows[0]?.id;
  if (!versionId) throw new Error("Circle geofence version fixture was not created.");
  await app.store.pgPool!.query(
    `UPDATE attendance.geofences
        SET current_published_version_id = $1
      WHERE id = $2`,
    [versionId, geofenceId],
  );
  return geofenceId;
}

async function assignAttendancePolicy(
  app: TestApp,
  input: {
    companyId: string;
    employeeUserId: string;
    config: Record<string, unknown>;
  },
): Promise<void> {
  const policyId = randomUUID();
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policies (
      id, company_id, policy_key, name, label, status
    ) VALUES ($1, $2, 'attendance', $3, $3, 'active')`,
    [policyId, input.companyId, `geo_policy_${policyId}`],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_versions (
      company_id, policy_id, version_number, effective_from, effective_until,
      config, created_at
    ) VALUES ($1, $2, 1, '2026-01-01T00:00:00.000Z', NULL, $3::jsonb, now())`,
    [
      input.companyId,
      policyId,
      JSON.stringify({
        fullDayPunchWindow: true,
        allowOffDayPunches: true,
        attendanceMode: "geo_required",
        fallbackApprovalMode: "disabled",
        locationUnavailableAction: "deny",
        permissionDeniedAction: "deny",
        outsideFenceAction: "deny",
        ...input.config,
      }),
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_assignments (
      company_id, policy_id, scope_type, scope_id, effective_from, effective_until,
      status
    ) VALUES ($1, $2, 'employee', $3, '2026-01-01T00:00:00.000Z', NULL, 'active')`,
    [input.companyId, policyId, input.employeeUserId],
  );
}

function coordinateLocation(latitude: number, longitude: number): Record<string, unknown> {
  return {
    latitude,
    longitude,
    accuracy_meters: 8,
    captured_at: new Date(Date.now() - 30_000).toISOString(),
    provider: "browser",
    permission_state: "granted",
  };
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
  if (!commandId) throw new Error("Command execution fixture was not found.");
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

function expectUniqueReasonCodes(reasonCodes: string[]): void {
  expect(reasonCodes).toEqual([...new Set(reasonCodes)]);
}

describe("PostgreSQL attendance geo policy enforcement", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    await clearGeoPolicyFixtures(app);
  }, 30_000);

  afterEach(async () => {
    try {
      if (app) {
        await clearGeoPolicyFixtures(app);
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
  }, 30_000);

  it("rejects required-geo current punches when location evidence is omitted", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId },
    });

    const idempotencyKey = `geo-s12-005-missing-${randomUUID()}`;
    const requestHeaders = headersWithIdempotency(employee.token, idempotencyKey);
    const payload = { event_type: "check_in", work_mode: "office", source: "web", metadata: {} };
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: requestHeaders,
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().details).toMatchObject({
      reason_code: "geo_evidence_missing",
      geo_policy: {
        factual_outcome: "missing",
        selected_action: "deny",
        allowed: false,
      },
    });
    expect(await mutationCounts(app)).toMatchObject({ sessions: "0", punches: "0", outbox: "0" });
    const commandId = await commandIdForIdempotencyKey(app, idempotencyKey);
    let reasonCodes = await decisionReasonCodesForCommand(app, commandId);
    expect(reasonCodes).toEqual(["geo_evidence_missing"]);
    expectUniqueReasonCodes(reasonCodes);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: requestHeaders,
      payload,
    });
    expect(replay.statusCode).toBe(409);
    reasonCodes = await decisionReasonCodesForCommand(app, commandId);
    expect(reasonCodes).toEqual(["geo_evidence_missing"]);
  });

  it.each([
    ["denied", "geo_permission_denied"],
    ["unavailable", "geo_location_unavailable"],
  ])("persists %s location status as a distinct factual denial", async (permissionState, reasonCode) => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId },
    });

    const idempotencyKey = `geo-s12-005-${permissionState}-${randomUUID()}`;
    const requestHeaders = headersWithIdempotency(employee.token, idempotencyKey);
    const payload = {
      event_type: "check_in",
      work_mode: "office",
      source: "web",
      metadata: {},
      location: { permission_state: permissionState, provider: "browser" },
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: requestHeaders,
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().details.reason_code).toBe(reasonCode);
    const persisted = await app.store.pgPool!.query<{
      permission_state: string;
      latitude: string | null;
      longitude: string | null;
    }>(
      `SELECT permission_state, latitude::text, longitude::text
         FROM attendance.location_evidence`,
    );
    expect(persisted.rows[0]).toMatchObject({
      permission_state: permissionState,
      latitude: null,
      longitude: null,
    });
    const commandId = await commandIdForIdempotencyKey(app, idempotencyKey);
    let reasonCodes = await decisionReasonCodesForCommand(app, commandId);
    expect(reasonCodes).toEqual([reasonCode]);
    expectUniqueReasonCodes(reasonCodes);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: requestHeaders,
      payload,
    });
    expect(replay.statusCode).toBe(409);
    reasonCodes = await decisionReasonCodesForCommand(app, commandId);
    expect(reasonCodes).toEqual([reasonCode]);
  });

  it.each([
    ["inside fence", coordinateLocation(12.972, 77.595), "inside_confident"],
  ])("allows required-geo current punches %s", async (_name, location, factualOutcome) => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: { latitude: 12.972, longitude: 77.595 },
        location,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().geo_policy).toMatchObject({
      factual_outcome: factualOutcome,
      selected_action: "allow",
      allowed: true,
      geofence_id: geofenceId,
    });
    expect(JSON.stringify(response.json())).not.toContain("77.595");
  });

  it.each([
    ["confidently inside", coordinateLocation(12.972, 77.595), "inside_confident", 200],
    ["confidently outside", coordinateLocation(12.975, 77.598), "outside_confident", 409],
  ])("evaluates circle geofences as %s", async (_name, location, factualOutcome, statusCode) => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedCircleGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location,
      },
    });

    expect(response.statusCode).toBe(statusCode);
    const geoPolicy = statusCode === 200 ? response.json().geo_policy : response.json().details.geo_policy;
    expect(geoPolicy).toMatchObject({
      factual_outcome: factualOutcome,
      geofence_id: geofenceId,
      evaluation: {
        selected_shape_type: "circle",
        radius_meters: 100,
        grace_meters: 0,
      },
    });
    expect(JSON.stringify(response.json())).not.toContain("77.595");
  });

  it("flags polygon boundary evidence separately from confident inside evidence", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: coordinateLocation(12.971, 77.595),
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().details).toMatchObject({
      reason_code: "geo_boundary_uncertain",
      geo_policy: {
        factual_outcome: "boundary_uncertain",
        selected_action: "deny",
        allowed: false,
      },
    });
    expect(JSON.stringify(response.json())).not.toContain("77.595");
  });

  it("evaluates only the configured geofence candidate list and preserves safe selection metrics", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceIds: [randomUUID(), geofenceId] },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: coordinateLocation(12.972, 77.595),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().geo_policy).toMatchObject({
      factual_outcome: "inside_confident",
      geofence_id: geofenceId,
      evaluation: {
        category: "inside_confident",
        candidate_count: 2,
        valid_candidate_count: 1,
        selected_candidate_ordinal: 2,
        selected_geofence_id: geofenceId,
      },
    });
    expect(JSON.stringify(response.json())).not.toContain("77.595");
  });

  it("rejects stale and low-accuracy coordinate evidence with distinct factual outcomes", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId, maxLocationAgeMs: 60_000 },
    });

    const stale = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: {
          ...coordinateLocation(12.972, 77.595),
          captured_at: new Date(Date.now() - 120_000).toISOString(),
        },
      },
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json().details).toMatchObject({
      reason_code: "geo_stale_evidence",
      geo_policy: {
        factual_outcome: "stale_evidence",
        selected_action: "deny",
        evaluation: {
          category: "stale_evidence",
          max_location_age_ms: 60_000,
        },
      },
    });
    expect(JSON.stringify(stale.json())).not.toContain("77.595");

    await clearGeoPolicyFixtures(app);
    const accuracyGeofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: accuracyGeofenceId, maxAccuracyMeters: 5 },
    });

    const inaccurate = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: coordinateLocation(12.972, 77.595),
      },
    });

    expect(inaccurate.statusCode).toBe(409);
    expect(inaccurate.json().details).toMatchObject({
      reason_code: "geo_accuracy_exceeded",
      geo_policy: {
        factual_outcome: "accuracy_exceeded",
        selected_action: "deny",
        evaluation: {
          category: "accuracy_exceeded",
          max_accuracy_meters: 5,
        },
      },
    });
    expect(JSON.stringify(inaccurate.json())).not.toContain("77.595");
  });

  it("applies outside-fence allow, deny, and manual fallback actions explicitly", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    const outside = coordinateLocation(12.974, 77.597);

    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId, outsideFenceAction: "allow" },
    });
    const allowed = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: { event_type: "check_in", work_mode: "office", source: "web", metadata: {}, location: outside },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().geo_policy).toMatchObject({
      factual_outcome: "outside_confident",
      selected_action: "allow",
      allowed: true,
    });

    await clearGeoPolicyFixtures(app);
    const denyGeofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: denyGeofenceId, outsideFenceAction: "deny" },
    });
    const denyIdempotencyKey = `geo-s12-005-outside-deny-${randomUUID()}`;
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headersWithIdempotency(employee.token, denyIdempotencyKey),
      payload: { event_type: "check_in", work_mode: "office", source: "web", metadata: {}, location: outside },
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json().details.reason_code).toBe("geo_outside_fence");
    const denyCommandId = await commandIdForIdempotencyKey(app, denyIdempotencyKey);
    const denyReasonCodes = await decisionReasonCodesForCommand(app, denyCommandId);
    expect(denyReasonCodes).toEqual(["geo_outside_fence"]);
    expectUniqueReasonCodes(denyReasonCodes);
    expect(await mutationCounts(app)).toMatchObject({ sessions: "0", punches: "0", outbox: "0" });

    await clearGeoPolicyFixtures(app);
    const fallbackGeofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: {
        effectiveGeofenceId: fallbackGeofenceId,
        outsideFenceAction: "manual_fallback",
        fallbackApprovalMode: "approval_required",
      },
    });
    const fallbackIdempotencyKey = `geo-s12-005-outside-fallback-${randomUUID()}`;
    const fallback = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headersWithIdempotency(employee.token, fallbackIdempotencyKey),
      payload: { event_type: "check_in", work_mode: "office", source: "web", metadata: {}, location: outside },
    });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json().geo_policy).toMatchObject({
      factual_outcome: "outside_confident",
      selected_action: "manual_fallback",
      fallback_used: true,
      allowed: true,
    });
    const fallbackCommandId = await commandIdForIdempotencyKey(app, fallbackIdempotencyKey);
    const fallbackReasonCodes = await decisionReasonCodesForCommand(app, fallbackCommandId);
    expect(fallbackReasonCodes).toEqual([
      "geo_outside_fence",
      "geo_manual_fallback_allowed",
    ]);
    expectUniqueReasonCodes(fallbackReasonCodes);
  });

  it("fails closed without an effective fence and does not infer fallback when disabled", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: {
        locationUnavailableAction: "manual_fallback",
        fallbackApprovalMode: "disabled",
      },
    });

    const noFenceIdempotencyKey = `geo-s12-005-no-fence-${randomUUID()}`;
    const noFence = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headersWithIdempotency(employee.token, noFenceIdempotencyKey),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: coordinateLocation(12.972, 77.595),
      },
    });
    expect(noFence.statusCode).toBe(409);
    expect(noFence.json().details.reason_code).toBe("geo_fence_not_configured");
    const noFenceReasonCodes = await decisionReasonCodesForCommand(
      app,
      await commandIdForIdempotencyKey(app, noFenceIdempotencyKey),
    );
    expect(noFenceReasonCodes).toEqual(["geo_fence_not_configured"]);
    expectUniqueReasonCodes(noFenceReasonCodes);

    await clearGeoPolicyFixtures(app);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: {
        effectiveGeofenceId: geofenceId,
        outsideFenceAction: "manual_fallback",
        fallbackApprovalMode: "disabled",
      },
    });
    const fallbackDisabledIdempotencyKey = `geo-s12-005-fallback-disabled-${randomUUID()}`;
    const fallbackDisabled = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headersWithIdempotency(employee.token, fallbackDisabledIdempotencyKey),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: coordinateLocation(12.974, 77.597),
      },
    });
    expect(fallbackDisabled.statusCode).toBe(409);
    expect(fallbackDisabled.json().details.geo_policy).toMatchObject({
      selected_action: "manual_fallback",
      fallback_used: false,
      reason_code: "geo_manual_fallback_disallowed",
    });
    const fallbackDisabledReasonCodes = await decisionReasonCodesForCommand(
      app,
      await commandIdForIdempotencyKey(app, fallbackDisabledIdempotencyKey),
    );
    expect(fallbackDisabledReasonCodes).toEqual([
      "geo_outside_fence",
      "geo_manual_fallback_disallowed",
    ]);
    expectUniqueReasonCodes(fallbackDisabledReasonCodes);
  });

  it.each([
    ["cross-company", "cross_company"],
    ["unpublished", "unpublished"],
    ["future-effective", "future"],
    ["expired", "expired"],
  ])("fails closed for %s fences", async (_name, fixtureKind) => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const otherCompanyId = randomUUID();
    const geofenceId =
      fixtureKind === "cross_company"
        ? await createPublishedPolygonGeofence(app, otherCompanyId)
        : fixtureKind === "unpublished"
          ? await createPublishedPolygonGeofence(app, companyId, { status: "draft" })
          : fixtureKind === "future"
            ? await createPublishedPolygonGeofence(app, companyId, { effectiveFrom: "2099-01-01T00:00:00.000Z" })
            : await createPublishedPolygonGeofence(app, companyId, {
                effectiveFrom: "2026-01-01T00:00:00.000Z",
                effectiveUntil: "2026-02-01T00:00:00.000Z",
              });
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: headers(employee.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        source: "web",
        metadata: {},
        location: coordinateLocation(12.972, 77.595),
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().details).toMatchObject({
      reason_code: "geo_fence_not_configured",
      geo_policy: {
        factual_outcome: "fence_not_configured",
        allowed: false,
      },
    });
    expect(await mutationCounts(app)).toMatchObject({ sessions: "0", punches: "0", outbox: "0" });
  });

  it("sanitizes legacy denied or unavailable coordinate rows before adding the permission constraint", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const migrationSql = readFileSync(
      "src/db/migrations/0045_attendance_geo_policy_modes.sql",
      "utf8",
    );

    const event = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO attendance.attendance_events (
          company_id, employee_user_id, actor_user_id, command_execution_id,
          event_type, source, occurred_at, received_at, payload, payload_hash
        ) VALUES (
          $1, $2, $2, NULL, 'check_in', 'web', now(), now(), '{}'::jsonb,
          repeat('a', 64)
        )
        RETURNING id`,
      [companyId, employee.user.id],
    );
    const eventId = event.rows[0]?.id;
    if (!eventId) throw new Error("Attendance event fixture was not created.");

    await app.store.pgPool!.query(
      `ALTER TABLE attendance.location_evidence
         DROP CONSTRAINT IF EXISTS location_evidence_coordinates_by_permission_check`,
    );
    const legacy = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO attendance.location_evidence (
          attendance_event_id, company_id, employee_user_id, captured_at,
          received_at, latitude, longitude, accuracy_meters, altitude_meters,
          provider, is_mocked, integrity_status, raw_payload, age_ms,
          permission_state, coordinates_expire_at
        ) VALUES (
          $1, $2, $3, now(), now(), 12.971599, 77.594566, 8.50, 2.00,
          'browser', false, NULL, '{}'::jsonb, 0, 'denied', now() + interval '1 hour'
        )
        RETURNING id`,
      [eventId, companyId, employee.user.id],
    );
    const legacyId = legacy.rows[0]?.id;
    if (!legacyId) throw new Error("Legacy location evidence fixture was not created.");

    await app.store.pgPool!.query(migrationSql);

    const sanitized = await app.store.pgPool!.query<{
      latitude: string | null;
      longitude: string | null;
      accuracy_meters: string | null;
      altitude_meters: string | null;
      is_mocked: boolean | null;
      coordinates_expire_at: Date | null;
      provider: string | null;
      permission_state: string;
    }>(
      `SELECT latitude::text, longitude::text, accuracy_meters::text,
              altitude_meters::text, is_mocked, coordinates_expire_at,
              provider, permission_state
         FROM attendance.location_evidence
        WHERE id = $1`,
      [legacyId],
    );
    expect(sanitized.rows[0]).toMatchObject({
      latitude: null,
      longitude: null,
      accuracy_meters: null,
      altitude_meters: null,
      is_mocked: null,
      coordinates_expire_at: null,
      provider: "browser",
      permission_state: "denied",
    });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.location_evidence (
            attendance_event_id, company_id, employee_user_id, captured_at,
            latitude, longitude, accuracy_meters, provider, raw_payload, age_ms,
            permission_state
          ) VALUES (
            $1, $2, $3, now(), 12.971599, 77.594566, 8.50, 'browser',
            '{}'::jsonb, 0, 'denied'
          )`,
        [eventId, companyId, employee.user.id],
      ),
    ).rejects.toThrow(/location_evidence_coordinates_by_permission_check/u);
  });

  it("does not let manager-assisted current punches bypass required geo", async () => {
    const manager = await loginAs(app, "D1");
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const geofenceId = await createPublishedPolygonGeofence(app, companyId);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { effectiveGeofenceId: geofenceId },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/employees/${employee.user.id}/assisted-current-punches`,
      headers: headers(manager.token),
      payload: {
        event_type: "check_in",
        work_mode: "office",
        metadata: {},
        reason: "Desk-side attendance support",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().details.reason_code).toBe("geo_evidence_missing");
    expect(await mutationCounts(app)).toMatchObject({ sessions: "0", punches: "0", outbox: "0" });
  });

  it("keeps historical corrections outside live geo enforcement", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    await assignAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: { attendanceMode: "geo_required" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/employees/${employee.user.id}/historical-corrections`,
      headers: headers(admin.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-22T05:35:00.000Z",
        reason: "Reconstruct verified historical attendance",
        work_mode: "office",
        metadata: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().punch.origin).toBe("historical_correction");
  });
});
