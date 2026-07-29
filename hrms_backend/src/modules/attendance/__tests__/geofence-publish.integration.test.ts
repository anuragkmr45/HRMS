import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { PostgresGeofenceRepository } from "../geofence-repository.js";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

type GeofenceFixture = {
  companyId: string;
  siteId: string;
  geofenceId: string;
};

type VersionFixture = GeofenceFixture & {
  versionId: string;
};

function uniqueCode(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function activeCompanyId(app: TestApp, userId: string): Promise<string> {
  const result = await app.store.pgPool!.query<{ company_id: string }>(
    `SELECT company_id
     FROM platform.user_session_preferences
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const companyId = result.rows[0]?.company_id;
  if (!companyId) throw new Error("Active test company was not found.");
  return companyId;
}

async function createGeofence(
  app: TestApp,
  input: Partial<{ companyId: string; geofenceCode: string }> = {},
): Promise<GeofenceFixture> {
  const companyId = input.companyId ?? randomUUID();
  const site = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.work_sites (
      company_id, site_code, name, site_type, timezone, metadata
    ) VALUES ($1, $2, 'Publish Test Site', 'office', 'Asia/Kolkata', '{}'::jsonb)
    RETURNING id`,
    [companyId, uniqueCode("SITE")],
  );
  const siteId = site.rows[0]?.id;
  if (!siteId) throw new Error("Work-site fixture was not created.");
  const geofence = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofences (
      company_id, work_site_id, geofence_code, name, metadata
    ) VALUES ($1, $2, $3, 'Publish Test Fence', '{}'::jsonb)
    RETURNING id`,
    [companyId, siteId, input.geofenceCode ?? uniqueCode("GEOFENCE")],
  );
  const geofenceId = geofence.rows[0]?.id;
  if (!geofenceId) throw new Error("Geofence fixture was not created.");
  return { companyId, siteId, geofenceId };
}

async function createCircleDraft(
  app: TestApp,
  input: Partial<{
    companyId: string;
    geofenceId: string;
    siteId: string;
    versionNumber: number;
    longitude: number;
    latitude: number;
    radius: number;
    metadata: string;
  }> = {},
): Promise<VersionFixture> {
  const geofence =
    input.companyId && input.geofenceId && input.siteId
      ? {
          companyId: input.companyId,
          geofenceId: input.geofenceId,
          siteId: input.siteId,
        }
      : await createGeofence(app, { companyId: input.companyId });
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
      company_id, geofence_id, version_number, shape_type, shape,
      circle_radius_meters, shape_metadata, created_by_user_id
    ) VALUES (
      $1, $2, $3, 'circle',
      ST_SetSRID(ST_MakePoint($4, $5), 4326),
      $6, $7::jsonb, $8
    )
    RETURNING id`,
    [
      geofence.companyId,
      geofence.geofenceId,
      input.versionNumber ?? 1,
      input.longitude ?? 77.594566,
      input.latitude ?? 12.971599,
      input.radius ?? 100,
      input.metadata ?? "{}",
      randomUUID(),
    ],
  );
  const versionId = result.rows[0]?.id;
  if (!versionId) throw new Error("Circle version fixture was not created.");
  return { ...geofence, versionId };
}

async function createPolygonDraft(
  app: TestApp,
  input: Partial<{
    companyId: string;
    geofenceId: string;
    siteId: string;
    versionNumber: number;
    wkt: string;
    metadata: string;
  }> = {},
): Promise<VersionFixture> {
  const geofence =
    input.companyId && input.geofenceId && input.siteId
      ? {
          companyId: input.companyId,
          geofenceId: input.geofenceId,
          siteId: input.siteId,
        }
      : await createGeofence(app, { companyId: input.companyId });
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
      company_id, geofence_id, version_number, shape_type, shape,
      shape_metadata, created_by_user_id
    ) VALUES (
      $1, $2, $3, 'polygon',
      ST_GeomFromText($4, 4326),
      $5::jsonb, $6
    )
    RETURNING id`,
    [
      geofence.companyId,
      geofence.geofenceId,
      input.versionNumber ?? 1,
      input.wkt ??
        "POLYGON((77.594 12.971,77.596 12.971,77.596 12.973,77.594 12.973,77.594 12.971))",
      input.metadata ?? "{}",
      randomUUID(),
    ],
  );
  const versionId = result.rows[0]?.id;
  if (!versionId) throw new Error("Polygon version fixture was not created.");
  return { ...geofence, versionId };
}

async function publish(
  app: TestApp,
  token: string,
  version: VersionFixture,
  input: { effectiveFrom: string; effectiveUntil?: string | null },
) {
  return app.inject({
    method: "POST",
    url: `/api/v1/attendance/geofences/${version.geofenceId}/versions/${version.versionId}/publish`,
    headers: authHeader(token),
    payload: input,
  });
}

describe("geofence publish workflow", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildRealApp();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("publishes valid circle, polygon, and multipolygon drafts", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);

    const circle = await createCircleDraft(app, { companyId });
    const circlePublish = await publish(app, admin.token, circle, {
      effectiveFrom: "2026-04-01T00:00:00.000Z",
      effectiveUntil: "2026-04-02T00:00:00.000Z",
    });
    expect(circlePublish.statusCode).toBe(200);
    expect(circlePublish.json().version).toMatchObject({
      id: circle.versionId,
      version_status: "published",
      shape_type: "circle",
      effective_from: "2026-04-01T00:00:00.000Z",
      effective_until: "2026-04-02T00:00:00.000Z",
    });
    expect(circlePublish.json().version.canonical_hash).toMatch(/^[0-9a-f]{64}$/u);

    const polygon = await createPolygonDraft(app, { companyId });
    const polygonPublish = await publish(app, admin.token, polygon, {
      effectiveFrom: "2026-04-03T00:00:00.000Z",
      effectiveUntil: "2026-04-04T00:00:00.000Z",
    });
    expect(polygonPublish.statusCode).toBe(200);
    expect(polygonPublish.json().version.shape_type).toBe("polygon");

    const multipolygon = await createPolygonDraft(app, {
      companyId,
      wkt: "MULTIPOLYGON(((77.594 12.971,77.596 12.971,77.596 12.973,77.594 12.973,77.594 12.971)))",
    });
    const multipolygonPublish = await publish(app, admin.token, multipolygon, {
      effectiveFrom: "2026-04-05T00:00:00.000Z",
      effectiveUntil: "2026-04-06T00:00:00.000Z",
    });
    expect(multipolygonPublish.statusCode).toBe(200);
  });

  it("enforces geometry validation and leaves failed publishes rolled back", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);
    const geofence = await createGeofence(app, { companyId });

    const outOfRangePolygon = await createPolygonDraft(app, {
      ...geofence,
      wkt: "POLYGON((181 12,182 12,182 13,181 13,181 12))",
    });
    const response = await publish(app, admin.token, outOfRangePolygon, {
      effectiveFrom: "2026-05-01T00:00:00.000Z",
      effectiveUntil: "2026-05-02T00:00:00.000Z",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("longitude");

    const state = await app.store.pgPool!.query<{
      version_status: string;
      effective_from: Date | null;
      canonical_hash: string | null;
      current_published_version_id: string | null;
    }>(
      `SELECT version.version_status, version.effective_from,
          version.canonical_hash, geofence.current_published_version_id
       FROM attendance.geofence_versions version
       JOIN attendance.geofences geofence ON geofence.id = version.geofence_id
       WHERE version.id = $1`,
      [outOfRangePolygon.versionId],
    );
    expect(state.rows[0]).toMatchObject({
      version_status: "draft",
      effective_from: null,
      canonical_hash: null,
      current_published_version_id: null,
    });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape,
          shape_metadata
        ) VALUES (
          $1, $2, 2, 'polygon',
          ST_GeomFromText('POLYGON((77 12,78 13,78 12,77 13,77 12))', 4326),
          '{}'::jsonb
        )`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("uses stable geometry-only canonical hashes", async () => {
    const hashes = await app.store.pgPool!.query<{
      same_orientation: string;
      reversed_orientation: string;
      different_start: string;
      material_change: string;
      circle_small: string;
      circle_large: string;
    }>(
      `SELECT
        attendance.geofence_shape_canonical_hash(
          'polygon',
          ST_GeomFromText('POLYGON((77 12,78 12,78 13,77 13,77 12))', 4326),
          NULL
        ) AS same_orientation,
        attendance.geofence_shape_canonical_hash(
          'polygon',
          ST_GeomFromText('POLYGON((77 12,77 13,78 13,78 12,77 12))', 4326),
          NULL
        ) AS reversed_orientation,
        attendance.geofence_shape_canonical_hash(
          'polygon',
          ST_GeomFromText('POLYGON((78 12,78 13,77 13,77 12,78 12))', 4326),
          NULL
        ) AS different_start,
        attendance.geofence_shape_canonical_hash(
          'polygon',
          ST_GeomFromText('POLYGON((77 12,78.5 12,78.5 13,77 13,77 12))', 4326),
          NULL
        ) AS material_change,
        attendance.geofence_shape_canonical_hash(
          'circle',
          ST_SetSRID(ST_MakePoint(77, 12), 4326),
          100.00
        ) AS circle_small,
        attendance.geofence_shape_canonical_hash(
          'circle',
          ST_SetSRID(ST_MakePoint(77, 12), 4326),
          125.00
        ) AS circle_large`,
    );
    const row = hashes.rows[0]!;
    expect(row.same_orientation).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.reversed_orientation).toBe(row.same_orientation);
    expect(row.different_start).toBe(row.same_orientation);
    expect(row.material_change).not.toBe(row.same_orientation);
    expect(row.circle_large).not.toBe(row.circle_small);

    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);
    const geofence = await createGeofence(app, { companyId });
    const first = await createPolygonDraft(app, {
      ...geofence,
      versionNumber: 1,
      metadata: '{"label":"first"}',
    });
    const second = await createPolygonDraft(app, {
      ...geofence,
      versionNumber: 2,
      metadata: '{"label":"second"}',
    });
    const firstResponse = await publish(app, admin.token, first, {
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: "2026-06-02T00:00:00.000Z",
    });
    const secondResponse = await publish(app, admin.token, second, {
      effectiveFrom: "2026-06-02T00:00:00.000Z",
      effectiveUntil: "2026-06-03T00:00:00.000Z",
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json().version.canonical_hash).toBe(
      firstResponse.json().version.canonical_hash,
    );
  });

  it("enforces half-open periods and keeps current pointer as latest published", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);
    const geofence = await createGeofence(app, { companyId });

    const first = await createCircleDraft(app, { ...geofence, versionNumber: 1 });
    const firstPublish = await publish(app, admin.token, first, {
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveUntil: "2026-07-10T00:00:00.000Z",
    });
    expect(firstPublish.statusCode).toBe(200);

    const adjacent = await createCircleDraft(app, { ...geofence, versionNumber: 2 });
    const adjacentPublish = await publish(app, admin.token, adjacent, {
      effectiveFrom: "2026-07-10T00:00:00.000Z",
      effectiveUntil: "2026-07-20T00:00:00.000Z",
    });
    expect(adjacentPublish.statusCode).toBe(200);

    const overlap = await createCircleDraft(app, { ...geofence, versionNumber: 3 });
    const overlapPublish = await publish(app, admin.token, overlap, {
      effectiveFrom: "2026-07-09T00:00:00.000Z",
      effectiveUntil: "2026-07-11T00:00:00.000Z",
    });
    expect(overlapPublish.statusCode).toBe(409);

    const equal = await createCircleDraft(app, { ...geofence, versionNumber: 4 });
    const equalPublish = await publish(app, admin.token, equal, {
      effectiveFrom: "2026-07-21T00:00:00.000Z",
      effectiveUntil: "2026-07-21T00:00:00.000Z",
    });
    expect(equalPublish.statusCode).toBe(400);

    const future = await createCircleDraft(app, { ...geofence, versionNumber: 5 });
    const futurePublish = await publish(app, admin.token, future, {
      effectiveFrom: "2027-01-01T00:00:00.000Z",
      effectiveUntil: null,
    });
    expect(futurePublish.statusCode).toBe(200);

    const pointer = await app.store.pgPool!.query<{
      current_published_version_id: string | null;
    }>(
      `SELECT current_published_version_id
       FROM attendance.geofences
       WHERE id = $1 AND company_id = $2`,
      [geofence.geofenceId, companyId],
    );
    expect(pointer.rows[0]?.current_published_version_id).toBe(future.versionId);

    const active = await new PostgresGeofenceRepository(
      app.store.pgPool!,
    ).findActivePublishedVersion({
      companyId,
      geofenceId: geofence.geofenceId,
      asOf: "2026-07-15T00:00:00.000Z",
    });
    expect(active?.id).toBe(adjacent.versionId);
  });

  it("preserves tenant and authorization boundaries", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(app, admin.user.id);
    const otherCompanyId = randomUUID();

    const inCompany = await createCircleDraft(app, { companyId });
    const employeePublish = await publish(app, employee.token, inCompany, {
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveUntil: "2026-08-02T00:00:00.000Z",
    });
    expect(employeePublish.statusCode).toBe(403);

    const otherCompany = await createCircleDraft(app, { companyId: otherCompanyId });
    const crossCompanyPublish = await publish(app, admin.token, otherCompany, {
      effectiveFrom: "2026-08-03T00:00:00.000Z",
      effectiveUntil: "2026-08-04T00:00:00.000Z",
    });
    expect(crossCompanyPublish.statusCode).toBe(404);
  });

  it("allows one concurrent overlapping publish to succeed and rolls back the other", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);
    const geofence = await createGeofence(app, { companyId });
    const first = await createCircleDraft(app, { ...geofence, versionNumber: 1 });
    const second = await createCircleDraft(app, { ...geofence, versionNumber: 2 });

    const [firstResponse, secondResponse] = await Promise.all([
      publish(app, admin.token, first, {
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        effectiveUntil: "2026-09-10T00:00:00.000Z",
      }),
      publish(app, admin.token, second, {
        effectiveFrom: "2026-09-05T00:00:00.000Z",
        effectiveUntil: "2026-09-15T00:00:00.000Z",
      }),
    ]);
    const statuses = [firstResponse.statusCode, secondResponse.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const count = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM attendance.geofence_versions
       WHERE company_id = $1
         AND geofence_id = $2
         AND version_status = 'published'
         AND tstzrange(effective_from, effective_until, '[)') &&
             tstzrange('2026-09-07T00:00:00.000Z'::timestamptz, '2026-09-08T00:00:00.000Z'::timestamptz, '[)')`,
      [companyId, geofence.geofenceId],
    );
    expect(Number(count.rows[0]?.count)).toBe(1);
  });
});
