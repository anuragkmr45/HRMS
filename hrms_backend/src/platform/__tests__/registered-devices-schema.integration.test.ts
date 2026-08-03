import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRealApp } from "../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

const companyAId = "10000000-0000-4000-8000-000000000001";
const companyBId = "10000000-0000-4000-8000-000000000002";
const missingCompanyId = "10000000-0000-4000-8000-000000000099";
const userAId = "20000000-0000-4000-8000-000000000001";
const userBId = "20000000-0000-4000-8000-000000000002";
const missingAssignmentUserId = "20000000-0000-4000-8000-000000000099";
const missingCompanyUserId = "20000000-0000-4000-8000-000000000098";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const hashD = "d".repeat(64);
const hashE = "e".repeat(64);
const invalidHash = "A".repeat(64);

describe("registered devices schema", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildRealApp();
    const pool = app.store.pgPool!;

    await pool.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES
         ($1, 'Registered Device Company A', 'registered-device-company-a', 'active'),
         ($2, 'Registered Device Company B', 'registered-device-company-b', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [companyAId, companyBId],
    );
    await pool.query(
      `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
       VALUES
         ('30000000-0000-4000-8000-000000000001', $1, 'Employee', $2),
         ('30000000-0000-4000-8000-000000000002', $3, 'Employee', $4),
         ('30000000-0000-4000-8000-000000000003', $5, 'Employee', $6)
       ON CONFLICT (user_id) DO UPDATE
       SET active_role = EXCLUDED.active_role,
           company_id = EXCLUDED.company_id,
           updated_at = now()`,
      [userAId, companyAId, userBId, companyBId, missingCompanyUserId, missingCompanyId],
    );
  }, 120_000);

  afterAll(async () => {
    const pool = app?.store.pgPool;
    if (pool) {
      await pool.query(
        `DELETE FROM platform.registered_devices
         WHERE company_id IN ($1, $2, $3)
            OR user_id IN ($4, $5, $6, $7)`,
        [
          companyAId,
          companyBId,
          missingCompanyId,
          userAId,
          userBId,
          missingAssignmentUserId,
          missingCompanyUserId,
        ],
      );
      await pool.query(
        `DELETE FROM platform.user_session_preferences
         WHERE user_id IN ($1, $2, $3, $4)`,
        [userAId, userBId, missingAssignmentUserId, missingCompanyUserId],
      );
      await pool.query(
        `DELETE FROM platform.company_profiles WHERE id IN ($1, $2)`,
        [companyAId, companyBId],
      );
    }
    await app?.close();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("creates the registered device table with tenant-safe lifecycle constraints", async () => {
    const pool = app.store.pgPool!;

    const columns = await pool.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
      data_type: string;
    }>(
      `SELECT column_name, is_nullable, column_default, data_type
       FROM information_schema.columns
       WHERE table_schema = 'platform'
         AND table_name = 'registered_devices'
       ORDER BY ordinal_position`,
    );
    expect(columns.rows).toEqual([
      expect.objectContaining({ column_name: "id", is_nullable: "NO", data_type: "uuid" }),
      expect.objectContaining({ column_name: "company_id", is_nullable: "NO", data_type: "uuid" }),
      expect.objectContaining({ column_name: "user_id", is_nullable: "NO", data_type: "uuid" }),
      expect.objectContaining({ column_name: "installation_id_hash", is_nullable: "NO", data_type: "text" }),
      expect.objectContaining({ column_name: "platform", is_nullable: "NO", data_type: "text" }),
      expect.objectContaining({
        column_name: "status",
        is_nullable: "NO",
        column_default: "'registered'::text",
        data_type: "text",
      }),
      expect.objectContaining({ column_name: "status_changed_at", is_nullable: "NO", data_type: "timestamp with time zone" }),
      expect.objectContaining({ column_name: "created_at", is_nullable: "NO", data_type: "timestamp with time zone" }),
      expect.objectContaining({ column_name: "updated_at", is_nullable: "NO", data_type: "timestamp with time zone" }),
    ]);

    const lookupIndex = await pool.query<{ indexdef: string }>(
      `SELECT indexdef
       FROM pg_indexes
       WHERE schemaname = 'platform'
         AND tablename = 'registered_devices'
         AND indexname = 'platform_registered_devices_company_user_status_updated_idx'`,
    );
    expect(lookupIndex.rows).toEqual([
      {
        indexdef:
          "CREATE INDEX platform_registered_devices_company_user_status_updated_idx ON platform.registered_devices USING btree (company_id, user_id, status, updated_at DESC)",
      },
    ]);

    const inserted = await pool.query<{
      status: string;
      status_changed_at: Date;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO platform.registered_devices (
         id, company_id, user_id, installation_id_hash, platform
       ) VALUES (
         '40000000-0000-4000-8000-000000000001', $1, $2, $3, 'ios'
       )
       RETURNING status, status_changed_at, created_at, updated_at`,
      [companyAId, userAId, hashA],
    );
    expect(inserted.rows[0]).toMatchObject({ status: "registered" });
    expect(inserted.rows[0]?.created_at).toBeInstanceOf(Date);
    expect(inserted.rows[0]?.updated_at).toBeInstanceOf(Date);
    expect(inserted.rows[0]?.status_changed_at).toBeInstanceOf(Date);

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform, created_at, status_changed_at
         ) VALUES (
           '40000000-0000-4000-8000-000000000010',
           $1,
           $2,
           $3,
           'ios',
           '2026-08-03T10:00:00.000Z',
           '2026-08-03T09:59:59.000Z'
         )`,
        [companyAId, userAId, hashD],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_devices_status_changed_at_check",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform, created_at, status_changed_at, updated_at
         ) VALUES (
           '40000000-0000-4000-8000-000000000011',
           $1,
           $2,
           $3,
           'android',
           '2026-08-03T10:00:00.000Z',
           '2026-08-03T10:00:00.000Z',
           '2026-08-03T09:59:59.000Z'
         )`,
        [companyAId, userAId, hashE],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_devices_updated_at_check",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform, status
         ) VALUES (
           '40000000-0000-4000-8000-000000000002', $1, $2, $3, 'ios', 'trusted'
         )`,
        [companyAId, userAId, hashB],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_devices_status_check",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform
         ) VALUES (
           '40000000-0000-4000-8000-000000000003', $1, $2, $3, 'web'
         )`,
        [companyAId, userAId, hashB],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_devices_platform_check",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform
         ) VALUES (
           '40000000-0000-4000-8000-000000000004', $1, $2, $3, 'android'
         )`,
        [companyAId, userAId, invalidHash],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "platform_registered_devices_installation_hash_check",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform
         ) VALUES (
           '40000000-0000-4000-8000-000000000005', $1, $2, $3, 'android'
         )`,
        [companyAId, userAId, hashA],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "platform_registered_devices_company_installation_uq",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform
         ) VALUES (
           '40000000-0000-4000-8000-000000000006', $1, $2, $3, 'android'
         )`,
        [companyBId, userBId, hashA],
      ),
    ).resolves.toBeTruthy();

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform
         ) VALUES (
           '40000000-0000-4000-8000-000000000007', $1, $2, $3, 'ios'
         )`,
        [companyBId, userAId, hashB],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "platform_registered_devices_user_company_fk",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform
         ) VALUES (
           '40000000-0000-4000-8000-000000000008', $1, $2, $3, 'ios'
         )`,
        [missingCompanyId, missingCompanyUserId, hashB],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "platform_registered_devices_company_fk",
    });

    await expect(
      pool.query(
        `INSERT INTO platform.registered_devices (
           id, company_id, user_id, installation_id_hash, platform
         ) VALUES (
           '40000000-0000-4000-8000-000000000009', $1, $2, $3, 'ios'
         )`,
        [companyAId, missingAssignmentUserId, hashC],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "platform_registered_devices_user_company_fk",
    });
  });
});
