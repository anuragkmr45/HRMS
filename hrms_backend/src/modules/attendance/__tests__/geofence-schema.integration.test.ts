import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

type SiteFixture = {
  companyId: string;
  siteId: string;
};

type GeofenceFixture = SiteFixture & {
  geofenceId: string;
};

type VersionFixture = GeofenceFixture & {
  versionId: string;
};

function uniqueCode(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function createWorkSite(
  app: TestApp,
  input: Partial<{
    companyId: string;
    siteCode: string;
    timezone: string;
    metadata: string;
  }> = {},
): Promise<SiteFixture> {
  const companyId = input.companyId ?? randomUUID();
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.work_sites (
      company_id, site_code, name, site_type, timezone, metadata
    ) VALUES ($1, $2, 'Bengaluru Office', 'office', $3, $4::jsonb)
    RETURNING id`,
    [
      companyId,
      input.siteCode ?? uniqueCode("SITE"),
      input.timezone ?? "Asia/Kolkata",
      input.metadata ?? "{}",
    ],
  );
  const siteId = result.rows[0]?.id;
  if (!siteId) throw new Error("Work-site fixture was not created.");
  return { companyId, siteId };
}

async function createGeofence(
  app: TestApp,
  input: Partial<{
    companyId: string;
    siteId: string;
    geofenceCode: string;
    metadata: string;
  }> = {},
): Promise<GeofenceFixture> {
  const site =
    input.companyId && input.siteId
      ? { companyId: input.companyId, siteId: input.siteId }
      : await createWorkSite(app, { companyId: input.companyId });
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofences (
      company_id, work_site_id, geofence_code, name, metadata
    ) VALUES ($1, $2, $3, 'Main Gate', $4::jsonb)
    RETURNING id`,
    [
      site.companyId,
      site.siteId,
      input.geofenceCode ?? uniqueCode("GEOFENCE"),
      input.metadata ?? "{}",
    ],
  );
  const geofenceId = result.rows[0]?.id;
  if (!geofenceId) throw new Error("Geofence fixture was not created.");
  return { ...site, geofenceId };
}

async function createCircleVersion(
  app: TestApp,
  input: Partial<{
    companyId: string;
    geofenceId: string;
    siteId: string;
    versionNumber: number;
    radius: number;
    status: "draft" | "published";
    longitude: number;
    latitude: number;
    effectiveFrom: string;
    effectiveUntil: string | null;
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
  const published = input.status === "published";
  const versionNumber = input.versionNumber ?? 1;
  const effectiveFrom =
    input.effectiveFrom ??
    `2026-01-${String(versionNumber).padStart(2, "0")}T00:00:00.000Z`;
  const effectiveUntil =
    input.effectiveUntil === undefined
      ? `2026-01-${String(versionNumber + 1).padStart(2, "0")}T00:00:00.000Z`
      : input.effectiveUntil;
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
      company_id, geofence_id, version_number, version_status,
      shape_type, shape, circle_radius_meters, shape_metadata,
      created_by_user_id, published_by_user_id, published_at,
      effective_from, effective_until, canonical_hash
    ) VALUES (
      $1, $2, $3, $4, 'circle',
      ST_SetSRID(ST_MakePoint($5, $6), 4326),
      $7, '{}'::jsonb, $8, $9, ${published ? "now()" : "NULL"},
      $10::timestamptz, $11::timestamptz,
      CASE
        WHEN $4 = 'published'
          THEN attendance.geofence_shape_canonical_hash(
            'circle',
            ST_SetSRID(ST_MakePoint($5, $6), 4326),
            $7
          )
        ELSE NULL
      END
    )
    RETURNING id`,
    [
      geofence.companyId,
      geofence.geofenceId,
      versionNumber,
      input.status ?? "draft",
      input.longitude ?? 77.594566,
      input.latitude ?? 12.971599,
      input.radius ?? 100,
      randomUUID(),
      published ? randomUUID() : null,
      published ? effectiveFrom : null,
      published ? effectiveUntil : null,
    ],
  );
  const versionId = result.rows[0]?.id;
  if (!versionId) throw new Error("Circle version fixture was not created.");
  return { ...geofence, versionId };
}

async function createPolygonVersion(
  app: TestApp,
  input: Partial<{
    companyId: string;
    geofenceId: string;
    siteId: string;
    versionNumber: number;
    status: "draft" | "published";
    wkt: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
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
  const published = input.status === "published";
  const versionNumber = input.versionNumber ?? 1;
  const effectiveFrom =
    input.effectiveFrom ??
    `2026-01-${String(versionNumber).padStart(2, "0")}T00:00:00.000Z`;
  const effectiveUntil =
    input.effectiveUntil === undefined
      ? `2026-01-${String(versionNumber + 1).padStart(2, "0")}T00:00:00.000Z`
      : input.effectiveUntil;
  const wkt =
    input.wkt ??
    "POLYGON((77.594 12.971,77.596 12.971,77.596 12.973,77.594 12.973,77.594 12.971))";
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
      company_id, geofence_id, version_number, version_status,
      shape_type, shape, shape_metadata,
      created_by_user_id, published_by_user_id, published_at,
      effective_from, effective_until, canonical_hash
    ) VALUES (
      $1, $2, $3, $4, 'polygon',
      ST_GeomFromText($5, 4326),
      '{}'::jsonb, $6, $7, ${published ? "now()" : "NULL"},
      $8::timestamptz, $9::timestamptz,
      CASE
        WHEN $4 = 'published'
          THEN attendance.geofence_shape_canonical_hash(
            'polygon',
            ST_GeomFromText($5, 4326),
            NULL
          )
        ELSE NULL
      END
    )
    RETURNING id`,
    [
      geofence.companyId,
      geofence.geofenceId,
      versionNumber,
      input.status ?? "draft",
      wkt,
      randomUUID(),
      published ? randomUUID() : null,
      published ? effectiveFrom : null,
      published ? effectiveUntil : null,
    ],
  );
  const versionId = result.rows[0]?.id;
  if (!versionId) throw new Error("Polygon version fixture was not created.");
  return { ...geofence, versionId };
}

async function expectCommitToFail(
  app: TestApp,
  statement: (client: PoolClient) => Promise<void>,
) {
  const client = await app.store.pgPool!.connect();
  try {
    await client.query("BEGIN");
    await statement(client);
    await expect(client.query("COMMIT")).rejects.toMatchObject({
      code: expect.stringMatching(/23503|23514/u),
    });
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

describe("PostgreSQL geofence schema", () => {
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

  it("enforces tenant-safe work-site and logical-geofence relationships", async () => {
    const siteCode = uniqueCode("SITE");
    const site = await createWorkSite(app, { siteCode });
    await createGeofence(app, {
      companyId: site.companyId,
      siteId: site.siteId,
    });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofences (
          company_id, work_site_id, geofence_code, name
        ) VALUES ($1, $2, $3, 'Cross Company')`,
        [randomUUID(), site.siteId, uniqueCode("GEOFENCE")],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "attendance_geofences_work_site_company_fk",
    });

    await expect(
      createWorkSite(app, { companyId: site.companyId, siteCode }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "attendance_work_sites_company_code_uq",
    });
    await expect(createWorkSite(app, { siteCode })).resolves.toBeTruthy();

    const geofenceCode = uniqueCode("GEOFENCE");
    await createGeofence(app, {
      companyId: site.companyId,
      siteId: site.siteId,
      geofenceCode,
    });
    await expect(
      createGeofence(app, {
        companyId: site.companyId,
        siteId: site.siteId,
        geofenceCode,
      }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "attendance_geofences_site_code_uq",
    });
    const otherSite = await createWorkSite(app, { companyId: site.companyId });
    await expect(
      createGeofence(app, {
        companyId: site.companyId,
        siteId: otherSite.siteId,
        geofenceCode,
      }),
    ).resolves.toBeTruthy();
  });

  it("enforces geofence version uniqueness by logical geofence", async () => {
    const geofence = await createGeofence(app);
    await createCircleVersion(app, { ...geofence, versionNumber: 1 });
    await expect(
      createPolygonVersion(app, { ...geofence, versionNumber: 1 }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "attendance_geofence_versions_company_geofence_number_uq",
    });
    await expect(
      createCircleVersion(app, { versionNumber: 1 }),
    ).resolves.toBeTruthy();
  });

  it("backfills a pre-GEO-S12-003 published row while preserving immutability", async () => {
    const geofence = await createGeofence(app);
    const client = await app.store.pgPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `ALTER TABLE attendance.geofence_versions
           DROP CONSTRAINT attendance_geofence_versions_publication_fields_check,
           DROP CONSTRAINT attendance_geofence_versions_effective_period_check`,
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, version_status,
          shape_type, shape, circle_radius_meters, shape_metadata,
          created_by_user_id, created_at, published_by_user_id, published_at
        ) VALUES (
          $1, $2, 42, 'published',
          'circle', ST_SetSRID(ST_MakePoint(77.594566, 12.971599), 4326),
          100, '{"source":"pre-0043"}'::jsonb,
          $3, '2026-09-01T00:00:00.000Z',
          $4, '2026-10-01T00:00:00.000Z'
        )
        RETURNING id`,
        [geofence.companyId, geofence.geofenceId, randomUUID(), randomUUID()],
      );
      const versionId = inserted.rows[0]!.id;

      await client.query("LOCK TABLE attendance.geofence_versions IN ACCESS EXCLUSIVE MODE");
      await client.query(
        `ALTER TABLE attendance.geofence_versions
           DISABLE TRIGGER attendance_geofence_versions_immutability_trg`,
      );
      await client.query(
        `UPDATE attendance.geofence_versions
         SET effective_from = COALESCE(effective_from, published_at, created_at),
             canonical_hash = attendance.geofence_shape_canonical_hash(
               shape_type,
               shape,
               circle_radius_meters
             )
         WHERE version_status = 'published'
           AND (effective_from IS NULL OR canonical_hash IS NULL)`,
      );
      await client.query(
        `ALTER TABLE attendance.geofence_versions
           ENABLE TRIGGER attendance_geofence_versions_immutability_trg`,
      );

      const backfilled = await client.query<{
        version_status: string;
        effective_from: Date | null;
        canonical_hash: string | null;
        shape_wkt: string;
        circle_radius_meters: string;
        shape_metadata: unknown;
        published_by_user_id: string | null;
        published_at: Date | null;
        trigger_enabled: string;
      }>(
        `SELECT version.version_status, version.effective_from,
            version.canonical_hash, ST_AsText(version.shape) AS shape_wkt,
            version.circle_radius_meters::text, version.shape_metadata,
            version.published_by_user_id, version.published_at,
            trigger.tgenabled AS trigger_enabled
         FROM attendance.geofence_versions version
         CROSS JOIN pg_trigger trigger
         WHERE version.id = $1
           AND trigger.tgrelid = 'attendance.geofence_versions'::regclass
           AND trigger.tgname = 'attendance_geofence_versions_immutability_trg'`,
        [versionId],
      );
      expect(backfilled.rows[0]).toMatchObject({
        version_status: "published",
        canonical_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
        shape_wkt: "POINT(77.594566 12.971599)",
        circle_radius_meters: "100.00",
        shape_metadata: { source: "pre-0043" },
        trigger_enabled: "O",
      });
      expect(backfilled.rows[0]?.effective_from?.toISOString()).toBe(
        "2026-10-01T00:00:00.000Z",
      );
      expect(backfilled.rows[0]?.published_at?.toISOString()).toBe(
        "2026-10-01T00:00:00.000Z",
      );
      expect(backfilled.rows[0]?.published_by_user_id).toBeTruthy();

      await client.query("SAVEPOINT published_update_check");
      await expect(
        client.query(
          `UPDATE attendance.geofence_versions
           SET shape_metadata = '{"tamper":true}'::jsonb
           WHERE id = $1`,
          [versionId],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "attendance_geofence_versions_published_immutable",
      });
      await client.query("ROLLBACK TO SAVEPOINT published_update_check");

      await client.query("SAVEPOINT published_delete_check");
      await expect(
        client.query(
          "DELETE FROM attendance.geofence_versions WHERE id = $1",
          [versionId],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "attendance_geofence_versions_published_immutable",
      });
      await client.query("ROLLBACK TO SAVEPOINT published_delete_check");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("validates timezone names and JSON object metadata", async () => {
    await expect(
      createWorkSite(app, { timezone: "Asia/Kolkata" }),
    ).resolves.toBeTruthy();
    await expect(
      createWorkSite(app, { timezone: "Not/AZone" }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "attendance_work_sites_timezone_valid",
    });
    await expect(createWorkSite(app, { metadata: "[]" })).rejects.toMatchObject(
      {
        code: "23514",
        constraint: "attendance_work_sites_metadata_object_check",
      },
    );
    await expect(createGeofence(app, { metadata: "[]" })).rejects.toMatchObject(
      {
        code: "23514",
        constraint: "attendance_geofences_metadata_object_check",
      },
    );
    const geofence = await createGeofence(app);
    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape,
          circle_radius_meters, shape_metadata
        ) VALUES ($1, $2, 1, 'circle', ST_SetSRID(ST_MakePoint(77, 12), 4326), 10, '[]'::jsonb)`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "attendance_geofence_versions_shape_metadata_object_check",
    });
  });

  it("validates circle spatial shape rules", async () => {
    const geofence = await createGeofence(app);
    await expect(
      createCircleVersion(app, { ...geofence }),
    ).resolves.toBeTruthy();

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape
        ) VALUES ($1, $2, 2, 'circle', ST_SetSRID(ST_MakePoint(77, 12), 4326))`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      createCircleVersion(app, { ...geofence, versionNumber: 3, radius: 0 }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      createCircleVersion(app, { ...geofence, versionNumber: 4, radius: -1 }),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape, circle_radius_meters
        ) VALUES (
          $1, $2, 5, 'circle',
          ST_GeomFromText('POLYGON((77 12,78 12,78 13,77 13,77 12))', 4326),
          10
        )`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      createCircleVersion(app, {
        ...geofence,
        versionNumber: 6,
        longitude: 181,
        latitude: 12,
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("validates polygon and multipolygon spatial shape rules", async () => {
    const geofence = await createGeofence(app);
    await expect(
      createPolygonVersion(app, { ...geofence, versionNumber: 1 }),
    ).resolves.toBeTruthy();
    await expect(
      createPolygonVersion(app, {
        ...geofence,
        versionNumber: 2,
        wkt: "MULTIPOLYGON(((77.594 12.971,77.596 12.971,77.596 12.973,77.594 12.973,77.594 12.971)))",
      }),
    ).resolves.toBeTruthy();

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape, circle_radius_meters
        ) VALUES (
          $1, $2, 3, 'polygon',
          ST_GeomFromText('POLYGON((77 12,78 12,78 13,77 13,77 12))', 4326),
          10
        )`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape
        ) VALUES ($1, $2, 4, 'polygon', ST_SetSRID(ST_MakePoint(77, 12), 4326))`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      createPolygonVersion(app, {
        ...geofence,
        versionNumber: 5,
        wkt: "POLYGON((77 12,78 13,78 12,77 13,77 12))",
      }),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape
        ) VALUES ($1, $2, 6, 'polygon', ST_GeomFromText('POLYGON EMPTY', 4326))`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape
        ) VALUES (
          $1, $2, 7, 'polygon',
          ST_GeomFromText('POLYGON((77 12,78 12,78 13,77 13,77 12))', 3857)
        )`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toBeTruthy();

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.geofence_versions (
          company_id, geofence_id, version_number, shape_type, shape
        ) VALUES ($1, $2, 8, 'circle', ST_GeomFromEWKT('SRID=4326;POINT Z (77 12 1)'))`,
        [geofence.companyId, geofence.geofenceId],
      ),
    ).rejects.toMatchObject({
      code: "22023",
      message: expect.stringContaining("Geometry has Z dimension"),
    });
  });

  it("allows draft editing and deletion while protecting identity and published rows", async () => {
    const draft = await createCircleVersion(app);
    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofence_versions
         SET shape = ST_SetSRID(ST_MakePoint(77.595, 12.972), 4326),
             circle_radius_meters = 125,
             shape_metadata = '{"source":"qa"}'::jsonb
         WHERE id = $1`,
        [draft.versionId],
      ),
    ).resolves.toBeTruthy();

    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofence_versions
         SET version_number = 99
         WHERE id = $1`,
        [draft.versionId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "attendance_geofence_versions_identity_immutable",
    });

    const deletableDraft = await createCircleVersion(app);
    await app.store.pgPool!.query(
      "DELETE FROM attendance.geofence_versions WHERE id = $1",
      [deletableDraft.versionId],
    );
    const deleted = await app.store.pgPool!.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM attendance.geofence_versions WHERE id = $1",
      [deletableDraft.versionId],
    );
    expect(deleted.rows[0]?.count).toBe(0);

    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofence_versions
         SET version_status = 'published',
             effective_from = '2026-02-01T00:00:00.000Z',
             effective_until = '2026-02-02T00:00:00.000Z',
             canonical_hash = attendance.geofence_shape_canonical_hash(
               shape_type, shape, circle_radius_meters
             ),
             published_at = now(),
             published_by_user_id = $2
         WHERE id = $1`,
        [draft.versionId, randomUUID()],
      ),
    ).resolves.toBeTruthy();

    const anotherDraft = await createCircleVersion(app);
    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofence_versions
         SET version_status = 'published',
             effective_from = '2026-02-03T00:00:00.000Z',
             effective_until = '2026-02-04T00:00:00.000Z',
             canonical_hash = attendance.geofence_shape_canonical_hash(
               shape_type, shape, circle_radius_meters
             ),
             published_at = now(),
             published_by_user_id = $2,
             circle_radius_meters = 130
         WHERE id = $1`,
        [anotherDraft.versionId, randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "attendance_geofence_versions_publish_only_fields",
    });

    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofence_versions
         SET circle_radius_meters = 150
         WHERE id = $1`,
        [draft.versionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofence_versions
         SET shape_metadata = '{"tamper":true}'::jsonb
         WHERE id = $1`,
        [draft.versionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      app.store.pgPool!.query(
        "DELETE FROM attendance.geofence_versions WHERE id = $1",
        [draft.versionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofence_versions
         SET version_status = 'draft',
             effective_from = NULL,
             effective_until = NULL,
             canonical_hash = NULL,
             published_at = NULL,
             published_by_user_id = NULL
         WHERE id = $1`,
        [draft.versionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("validates and replaces current published version pointers without superseding history", async () => {
    const geofence = await createGeofence(app);
    const first = await createCircleVersion(app, {
      ...geofence,
      versionNumber: 1,
      status: "published",
    });
    const second = await createPolygonVersion(app, {
      ...geofence,
      versionNumber: 2,
      status: "published",
    });

    await expect(
      app.store.pgPool!.query(
        `UPDATE attendance.geofences
         SET current_published_version_id = $1
         WHERE id = $2 AND company_id = $3`,
        [first.versionId, geofence.geofenceId, geofence.companyId],
      ),
    ).resolves.toBeTruthy();

    const otherCompany = await createCircleVersion(app, {
      status: "published",
    });
    await expectCommitToFail(app, async (client) => {
      await client.query(
        `UPDATE attendance.geofences
         SET current_published_version_id = $1
         WHERE id = $2 AND company_id = $3`,
        [otherCompany.versionId, geofence.geofenceId, geofence.companyId],
      );
    });

    const otherGeofence = await createCircleVersion(app, {
      companyId: geofence.companyId,
      status: "published",
    });
    await expectCommitToFail(app, async (client) => {
      await client.query(
        `UPDATE attendance.geofences
         SET current_published_version_id = $1
         WHERE id = $2 AND company_id = $3`,
        [otherGeofence.versionId, geofence.geofenceId, geofence.companyId],
      );
    });

    const draft = await createCircleVersion(app, {
      ...geofence,
      versionNumber: 3,
    });
    await expectCommitToFail(app, async (client) => {
      await client.query(
        `UPDATE attendance.geofences
         SET current_published_version_id = $1
         WHERE id = $2 AND company_id = $3`,
        [draft.versionId, geofence.geofenceId, geofence.companyId],
      );
    });

    await app.store.pgPool!.query(
      `UPDATE attendance.geofences
       SET current_published_version_id = $1
       WHERE id = $2 AND company_id = $3`,
      [second.versionId, geofence.geofenceId, geofence.companyId],
    );
    const versions = await app.store.pgPool!.query<{
      id: string;
      version_status: string;
    }>(
      `SELECT id, version_status
       FROM attendance.geofence_versions
       WHERE id IN ($1, $2)
       ORDER BY id`,
      [first.versionId, second.versionId],
    );
    expect(versions.rows).toEqual(
      expect.arrayContaining([
        { id: first.versionId, version_status: "published" },
        { id: second.versionId, version_status: "published" },
      ]),
    );
  });

  it("keeps current-pointer publication atomic when pointer update precedes publication", async () => {
    const draft = await createCircleVersion(app);
    const client = await app.store.pgPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE attendance.geofences
         SET current_published_version_id = $1
         WHERE id = $2 AND company_id = $3`,
        [draft.versionId, draft.geofenceId, draft.companyId],
      );
      await client.query(
        `UPDATE attendance.geofence_versions
         SET version_status = 'published',
             effective_from = '2026-03-01T00:00:00.000Z',
             effective_until = '2026-03-02T00:00:00.000Z',
             canonical_hash = attendance.geofence_shape_canonical_hash(
               shape_type, shape, circle_radius_meters
             ),
             published_at = now(),
             published_by_user_id = $2
         WHERE id = $1`,
        [draft.versionId, randomUUID()],
      );
      await expect(client.query("COMMIT")).resolves.toBeTruthy();
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("exposes required spatial indexes, triggers, and tenant-safe constraints", async () => {
    const indexes = await app.store.pgPool!.query<{
      relname: string;
      amname: string;
      indexdef: string;
      predicate: string | null;
    }>(
      `SELECT cls.relname, am.amname,
              pg_get_indexdef(idx.indexrelid) AS indexdef,
              pg_get_expr(idx.indpred, idx.indrelid) AS predicate
       FROM pg_index idx
       JOIN pg_class cls ON cls.oid = idx.indexrelid
       JOIN pg_am am ON am.oid = cls.relam
       WHERE cls.relname IN (
         'attendance_geofence_versions_published_circles_gist_idx',
         'attendance_geofence_versions_published_polygons_gist_idx'
       )
       ORDER BY cls.relname`,
    );
    expect(indexes.rows).toHaveLength(2);
    expect(indexes.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relname: "attendance_geofence_versions_published_circles_gist_idx",
          amname: "gist",
        }),
        expect.objectContaining({
          relname: "attendance_geofence_versions_published_polygons_gist_idx",
          amname: "gist",
        }),
      ]),
    );
    const circleIndex = indexes.rows.find((row) =>
      row.relname.includes("circles"),
    );
    expect(circleIndex?.indexdef).toMatch(
      /shape\)::geography|\(shape::geography\)/iu,
    );
    expect(circleIndex?.predicate).toContain("(shape_type = 'circle'::text)");
    expect(circleIndex?.predicate).toContain(
      "(version_status = 'published'::text)",
    );

    const polygonIndex = indexes.rows.find((row) =>
      row.relname.includes("polygons"),
    );
    expect(polygonIndex?.indexdef).toContain("USING gist (shape)");
    expect(polygonIndex?.predicate).toContain("(shape_type = 'polygon'::text)");
    expect(polygonIndex?.predicate).toContain(
      "(version_status = 'published'::text)",
    );

    const triggers = await app.store.pgPool!.query<{
      tgname: string;
      tgrelid: string;
      tgdeferrable: boolean;
      tginitdeferred: boolean;
    }>(
      `SELECT tgname, tgrelid::regclass::text, tgdeferrable, tginitdeferred
       FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname IN (
           'attendance_geofence_versions_immutability_trg',
           'attendance_geofences_current_version_published_trg'
         )
       ORDER BY tgname`,
    );
    expect(triggers.rows).toEqual([
      {
        tgname: "attendance_geofence_versions_immutability_trg",
        tgrelid: "attendance.geofence_versions",
        tgdeferrable: false,
        tginitdeferred: false,
      },
      {
        tgname: "attendance_geofences_current_version_published_trg",
        tgrelid: "attendance.geofences",
        tgdeferrable: true,
        tginitdeferred: true,
      },
    ]);

    const foreignKeys = await app.store.pgPool!.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE contype = 'f'
         AND connamespace = 'attendance'::regnamespace
         AND conrelid IN (
           'attendance.geofences'::regclass,
           'attendance.geofence_versions'::regclass
         )
       ORDER BY conname`,
    );
    expect(foreignKeys.rows.map((row) => row.conname)).toEqual([
      "attendance_geofence_versions_geofence_company_fk",
      "attendance_geofences_current_published_version_fk",
      "attendance_geofences_work_site_company_fk",
    ]);

    const crossSchema = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.constraint_schema = 'attendance'
         AND tc.table_name IN ('work_sites', 'geofences', 'geofence_versions')
         AND tc.constraint_schema <> ccu.table_schema`,
    );
    expect(Number(crossSchema.rows[0]?.count)).toBe(0);
  });
});
