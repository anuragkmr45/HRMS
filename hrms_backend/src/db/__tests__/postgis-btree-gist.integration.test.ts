import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DATABASE_NAME_PATTERN = /(test|ci)/i;

function requireIsolatedTestDatabaseUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for PostGIS/btree_gist integration tests",
    );
  }

  if (testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error(
      "Refusing to run PostGIS/btree_gist integration tests with TEST_DATABASE_URL equal to DATABASE_URL",
    );
  }

  let databaseName = "";
  try {
    databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TEST_DATABASE_URL is not a valid URL: ${message}`);
  }

  if (!TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      `Refusing to run PostGIS/btree_gist integration tests against non-test database "${databaseName}"`,
    );
  }

  return testDatabaseUrl;
}

describe("PostGIS and btree_gist database capabilities", () => {
  let client: Client;

  beforeEach(async () => {
    client = new Client({
      connectionString: requireIsolatedTestDatabaseUrl(),
    });
    await client.connect();
    await client.query("BEGIN");
  });

  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  });

  it("has installed extensions and supports deterministic spatial and exclusion behavior", async () => {
    const extensions = await client.query<{ extname: string }>(`
      SELECT extname
      FROM pg_extension
      WHERE extname IN ('postgis', 'btree_gist')
      ORDER BY extname
    `);
    expect(extensions.rows.map((row) => row.extname)).toEqual([
      "btree_gist",
      "postgis",
    ]);

    const spatialProbe = await client.query<{
      is_near: boolean;
      meters: string;
    }>(`
      SELECT
        ST_DWithin(
          ST_SetSRID(ST_MakePoint(77.594566, 12.971599), 4326)::geography,
          ST_SetSRID(ST_MakePoint(77.5946, 12.97162), 4326)::geography,
          10
        ) AS is_near,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(77.594566, 12.971599), 4326)::geography,
          ST_SetSRID(ST_MakePoint(77.5946, 12.97162), 4326)::geography
        ) AS meters
    `);
    const distanceMeters = Number(spatialProbe.rows[0]?.meters);

    expect(Number.isFinite(distanceMeters)).toBe(true);
    expect(distanceMeters).toBeGreaterThan(0);
    expect(distanceMeters).toBeLessThan(10);

    await client.query(`
      CREATE TEMP TABLE geo_s12_btree_gist_probe (
        identifier uuid NOT NULL,
        active_window tstzrange NOT NULL
      ) ON COMMIT DROP
    `);
    await client.query(`
      ALTER TABLE geo_s12_btree_gist_probe
      ADD CONSTRAINT geo_s12_btree_gist_no_overlap
      EXCLUDE USING gist (
        identifier WITH =,
        active_window WITH &&
      )
    `);

    await client.query(
      `
        INSERT INTO geo_s12_btree_gist_probe (identifier, active_window)
        VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'))
      `,
      [
        "00000000-0000-4000-8000-000000000001",
        "2026-01-01T09:00:00Z",
        "2026-01-01T10:00:00Z",
      ],
    );
    await client.query(
      `
        INSERT INTO geo_s12_btree_gist_probe (identifier, active_window)
        VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'))
      `,
      [
        "00000000-0000-4000-8000-000000000001",
        "2026-01-01T10:00:00Z",
        "2026-01-01T11:00:00Z",
      ],
    );
    await client.query(
      `
        INSERT INTO geo_s12_btree_gist_probe (identifier, active_window)
        VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'))
      `,
      [
        "00000000-0000-4000-8000-000000000002",
        "2026-01-01T09:30:00Z",
        "2026-01-01T10:30:00Z",
      ],
    );

    await expect(
      client.query(
        `
          INSERT INTO geo_s12_btree_gist_probe (identifier, active_window)
          VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'))
        `,
        [
          "00000000-0000-4000-8000-000000000001",
          "2026-01-01T09:30:00Z",
          "2026-01-01T09:45:00Z",
        ],
      ),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "geo_s12_btree_gist_no_overlap",
    });
  });
});
