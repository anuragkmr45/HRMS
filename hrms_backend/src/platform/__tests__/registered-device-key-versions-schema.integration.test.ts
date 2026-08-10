import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { schema } from "#db";
import { buildRealApp } from "../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;
const companyAId = "10000000-0000-4000-8000-000000000561";
const companyBId = "10000000-0000-4000-8000-000000000562";
const deviceAId = "20000000-0000-4000-8000-000000000561";
const deviceBId = "20000000-0000-4000-8000-000000000562";
const fingerprintA = "a".repeat(64);
const fingerprintB = "b".repeat(64);
const fingerprintC = "c".repeat(64);

describe("registered device key versions schema", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildRealApp();
    await clearRows();
  }, 120_000);

  beforeEach(async () => {
    await clearRows();
  });

  afterAll(async () => {
    try {
      await clearRows();
    } finally {
      await app?.close();
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("creates the table, Drizzle mapping, columns, defaults, indexes, and no foreign keys", async () => {
    const pool = app.store.pgPool!;
    expect(schema.registeredDeviceKeyVersions).toBeDefined();

    const table = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('platform.registered_device_key_versions') IS NOT NULL AS exists`,
    );
    expect(table.rows[0]?.exists).toBe(true);

    const columns = await pool.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
      data_type: string;
    }>(
      `SELECT column_name, is_nullable, column_default, data_type
       FROM information_schema.columns
       WHERE table_schema = 'platform'
         AND table_name = 'registered_device_key_versions'
       ORDER BY ordinal_position`,
    );
    expect(columns.rows).toEqual([
      expect.objectContaining({ column_name: "id", is_nullable: "NO", data_type: "uuid" }),
      expect.objectContaining({ column_name: "company_id", is_nullable: "NO", data_type: "uuid" }),
      expect.objectContaining({ column_name: "registered_device_id", is_nullable: "NO", data_type: "uuid" }),
      expect.objectContaining({ column_name: "key_version", is_nullable: "NO", data_type: "integer" }),
      expect.objectContaining({ column_name: "algorithm", is_nullable: "NO", data_type: "text" }),
      expect.objectContaining({ column_name: "public_key_format", is_nullable: "NO", data_type: "text" }),
      expect.objectContaining({ column_name: "public_key_material", is_nullable: "NO", data_type: "text" }),
      expect.objectContaining({ column_name: "public_key_fingerprint_sha256", is_nullable: "NO", data_type: "text" }),
      expect.objectContaining({
        column_name: "status",
        is_nullable: "NO",
        column_default: "'active'::text",
        data_type: "text",
      }),
      expect.objectContaining({ column_name: "effective_from", is_nullable: "NO", data_type: "timestamp with time zone" }),
      expect.objectContaining({ column_name: "effective_until", is_nullable: "YES", data_type: "timestamp with time zone" }),
      expect.objectContaining({ column_name: "status_changed_at", is_nullable: "NO", data_type: "timestamp with time zone" }),
      expect.objectContaining({ column_name: "created_at", is_nullable: "NO", data_type: "timestamp with time zone" }),
      expect.objectContaining({ column_name: "updated_at", is_nullable: "NO", data_type: "timestamp with time zone" }),
    ]);

    const foreignKeys = await pool.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid = 'platform.registered_device_key_versions'::regclass
         AND contype = 'f'
       ORDER BY conname`,
    );
    expect(foreignKeys.rows).toEqual([]);

    const indexes = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'platform'
         AND tablename = 'registered_device_key_versions'
         AND indexname IN (
           'platform_registered_device_key_versions_lookup_idx',
           'platform_registered_device_key_versions_device_version_uq',
           'platform_registered_device_key_versions_device_fingerprint_uq'
         )
       ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "platform_registered_device_key_versions_device_fingerprint_uq",
      "platform_registered_device_key_versions_device_version_uq",
      "platform_registered_device_key_versions_lookup_idx",
    ]);
    expect(indexes.rows.find((row) => row.indexname === "platform_registered_device_key_versions_lookup_idx")?.indexdef)
      .toBe(
        "CREATE INDEX platform_registered_device_key_versions_lookup_idx ON platform.registered_device_key_versions USING btree (company_id, registered_device_id, status, key_version DESC)",
      );
  });

  it("inserts and reads a valid historical key row through the Drizzle mapping", async () => {
    const db = drizzle(app.store.pgPool!, { schema });
    const id = "30000000-0000-4000-8000-000000000561";

    await db.insert(schema.registeredDeviceKeyVersions).values({
      id,
      companyId: companyAId,
      registeredDeviceId: deviceAId,
      keyVersion: 1,
      algorithm: "ecdsa-p256-sha256",
      publicKeyFormat: "spki-pem",
      publicKeyMaterial: "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----",
      publicKeyFingerprintSha256: fingerprintA,
      status: "retired",
      effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      effectiveUntil: new Date("2026-08-09T00:00:00.000Z"),
      statusChangedAt: new Date("2026-08-09T00:00:00.000Z"),
    });

    const rows = await db
      .select()
      .from(schema.registeredDeviceKeyVersions)
      .where(eq(schema.registeredDeviceKeyVersions.id, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      companyId: companyAId,
      registeredDeviceId: deviceAId,
      keyVersion: 1,
      algorithm: "ecdsa-p256-sha256",
      publicKeyFormat: "spki-pem",
      publicKeyFingerprintSha256: fingerprintA,
      status: "retired",
    });
  });

  it("allows multiple historical key versions for one registered device", async () => {
    await insertKey({
      id: "30000000-0000-4000-8000-000000000561",
      keyVersion: 1,
      fingerprint: fingerprintA,
      status: "retired",
    });
    await insertKey({
      id: "30000000-0000-4000-8000-000000000562",
      keyVersion: 2,
      fingerprint: fingerprintB,
      status: "retired",
    });
    await insertKey({
      id: "30000000-0000-4000-8000-000000000563",
      keyVersion: 3,
      fingerprint: fingerprintC,
      status: "active",
    });

    const result = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM platform.registered_device_key_versions
       WHERE company_id = $1
         AND registered_device_id = $2`,
      [companyAId, deviceAId],
    );
    expect(result.rows[0]).toEqual({ count: "3" });
  });

  it("enforces key-version, fingerprint, status, effective interval, and uniqueness constraints", async () => {
    await insertKey({
      id: "30000000-0000-4000-8000-000000000570",
      keyVersion: 3,
      fingerprint: fingerprintC,
    });

    await expect(insertKey({
      id: "30000000-0000-4000-8000-000000000571",
      keyVersion: 0,
      fingerprint: "d".repeat(64),
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_device_key_versions_key_version_check",
    });

    await expect(insertKey({
      id: "30000000-0000-4000-8000-000000000572",
      keyVersion: 4,
      fingerprint: "A".repeat(64),
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_device_key_versions_fingerprint_check",
    });

    await expect(insertKey({
      id: "30000000-0000-4000-8000-000000000573",
      keyVersion: 4,
      fingerprint: "d".repeat(64),
      status: "compromised",
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_device_key_versions_status_check",
    });

    await expect(insertKey({
      id: "30000000-0000-4000-8000-000000000574",
      keyVersion: 4,
      fingerprint: "d".repeat(64),
      effectiveFrom: "2026-08-10T00:00:00.000Z",
      effectiveUntil: "2026-08-09T00:00:00.000Z",
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_device_key_versions_effective_interval_check",
    });

    await expect(insertKey({
      id: "30000000-0000-4000-8000-000000000575",
      keyVersion: 3,
      fingerprint: "d".repeat(64),
    })).rejects.toMatchObject({
      code: "23505",
      constraint: "platform_registered_device_key_versions_device_version_uq",
    });

    await expect(insertKey({
      id: "30000000-0000-4000-8000-000000000576",
      keyVersion: 4,
      fingerprint: fingerprintC,
    })).rejects.toMatchObject({
      code: "23505",
      constraint: "platform_registered_device_key_versions_device_fingerprint_uq",
    });
  });

  it("does not use database constraints as tenant/device ownership enforcement", async () => {
    await insertKey({
      id: "30000000-0000-4000-8000-000000000581",
      companyId: companyBId,
      registeredDeviceId: deviceBId,
      keyVersion: 1,
      fingerprint: "e".repeat(64),
    });

    const result = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM platform.registered_device_key_versions
       WHERE company_id = $1
         AND registered_device_id = $2`,
      [companyBId, deviceBId],
    );
    expect(result.rows[0]).toEqual({ count: "1" });
  });

  async function insertKey(input: {
    id: string;
    companyId?: string;
    registeredDeviceId?: string;
    keyVersion: number;
    fingerprint: string;
    status?: string;
    effectiveFrom?: string;
    effectiveUntil?: string | null;
  }): Promise<void> {
    await app.store.pgPool!.query(
      `INSERT INTO platform.registered_device_key_versions (
         id, company_id, registered_device_id, key_version, algorithm,
         public_key_format, public_key_material, public_key_fingerprint_sha256,
         status, effective_from, effective_until
       ) VALUES (
         $1, $2, $3, $4, 'ecdsa-p256-sha256', 'spki-pem',
         '-----BEGIN PUBLIC KEY----- fake -----END PUBLIC KEY-----',
         $5, $6, $7, $8
       )`,
      [
        input.id,
        input.companyId ?? companyAId,
        input.registeredDeviceId ?? deviceAId,
        input.keyVersion,
        input.fingerprint,
        input.status ?? "active",
        input.effectiveFrom ?? "2026-08-10T00:00:00.000Z",
        input.effectiveUntil ?? null,
      ],
    );
  }

  async function clearRows(): Promise<void> {
    const pool = app?.store.pgPool;
    if (!pool) return;
    await pool.query(
      `DELETE FROM platform.registered_device_key_versions
       WHERE company_id IN ($1, $2)
          OR registered_device_id IN ($3, $4)`,
      [companyAId, companyBId, deviceAId, deviceBId],
    );
  }
});
