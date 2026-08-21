import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { buildRealApp } from "../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;
const testRole = "hrms_rls_registered_devices_test";

const companyAId = "10000000-0000-4000-8000-000000000581";
const companyBId = "10000000-0000-4000-8000-000000000582";
const userAId = "20000000-0000-4000-8000-000000000581";
const userBId = "20000000-0000-4000-8000-000000000582";
const deviceAId = "30000000-0000-4000-8000-000000000581";
const deviceBId = "30000000-0000-4000-8000-000000000582";
const insertedDeviceAId = "30000000-0000-4000-8000-000000000583";
const blockedDeviceId = "30000000-0000-4000-8000-000000000584";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const hashD = "d".repeat(64);

describe("registered devices RLS", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildRealApp();
    const pool = app.store.pgPool!;
    await resetTestRole(pool);
    await seedFixtures(pool);
  }, 120_000);

  afterAll(async () => {
    const pool = app?.store.pgPool;
    if (pool) {
      await cleanupFixtures(pool);
      await dropTestRole(pool);
    }
    await app?.close();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("enables and forces RLS with the expected company isolation policy", async () => {
    const pool = app.store.pgPool!;
    const table = await pool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE oid = 'platform.registered_devices'::regclass`,
    );

    expect(table.rows[0]).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });

    const policy = await pool.query<{ policyname: string }>(
      `SELECT policyname
       FROM pg_policies
       WHERE schemaname = 'platform'
         AND tablename = 'registered_devices'
         AND policyname = 'platform_registered_devices_company_isolation'`,
    );
    expect(policy.rows).toHaveLength(1);
  });

  it("isolates SELECTs and keeps transaction-local tenant context from leaking", async () => {
    await withRlsRole(app.store.pgPool!, async (client) => {
      const tenantAIds = await withTenantTransaction(
        client,
        companyAId,
        async () => selectVisibleDeviceIds(client),
      );
      expect(tenantAIds).toEqual([deviceAId]);

      const noContextIds = await withTenantTransaction(
        client,
        null,
        async () => selectVisibleDeviceIds(client),
      );
      expect(noContextIds).toEqual([]);

      const tenantBIds = await withTenantTransaction(
        client,
        companyBId,
        async () => selectVisibleDeviceIds(client),
      );
      expect(tenantBIds).toEqual([deviceBId]);
    });
  });

  it("allows same-tenant INSERT and rejects cross-tenant INSERT or reassignment", async () => {
    await withRlsRole(app.store.pgPool!, async (client) => {
      const inserted = await withTenantTransaction(
        client,
        companyAId,
        async () =>
          client.query<{ id: string }>(
            `INSERT INTO platform.registered_devices (
               id, company_id, user_id, installation_id_hash, platform
             )
             VALUES ($1, $2, $3, $4, 'android')
             RETURNING id`,
            [insertedDeviceAId, companyAId, userAId, hashC],
          ),
      );
      expect(inserted.rows[0]?.id).toBe(insertedDeviceAId);

      await expect(
        withTenantTransaction(client, companyAId, async () =>
          client.query(
            `INSERT INTO platform.registered_devices (
               id, company_id, user_id, installation_id_hash, platform
             )
             VALUES ($1, $2, $3, $4, 'android')`,
            [blockedDeviceId, companyBId, userBId, hashD],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        withTenantTransaction(client, companyAId, async () =>
          client.query(
            `UPDATE platform.registered_devices
             SET company_id = $2,
                 user_id = $3
             WHERE id = $1`,
            [deviceAId, companyBId, userBId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });

    const persisted = await app.store.pgPool!.query<{
      company_id: string;
      user_id: string;
    }>(
      `SELECT company_id, user_id
       FROM platform.registered_devices
       WHERE id = $1`,
      [deviceAId],
    );
    expect(persisted.rows[0]).toEqual({
      company_id: companyAId,
      user_id: userAId,
    });
  });
});

async function withRlsRole<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${testRole}`);
    return await operation(client);
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    client.release();
  }
}

async function withTenantTransaction<T>(
  client: PoolClient,
  companyId: string | null,
  operation: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    if (companyId) {
      await client.query(
        "SELECT set_config('app.current_company_id', $1, true)",
        [companyId],
      );
    }
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function selectVisibleDeviceIds(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM platform.registered_devices
     ORDER BY id`,
  );
  return result.rows.map((row) => row.id);
}

async function resetTestRole(pool: Pool): Promise<void> {
  await dropTestRole(pool);
  await pool.query(
    `CREATE ROLE ${testRole}
       NOLOGIN
       NOSUPERUSER
       NOCREATEDB
       NOCREATEROLE
       NOINHERIT
       NOBYPASSRLS`,
  );
  await pool.query(`GRANT ${testRole} TO CURRENT_USER`);
  await pool.query(`GRANT USAGE ON SCHEMA platform TO ${testRole}`);
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE
     ON platform.registered_devices
     TO ${testRole}`,
  );
}

async function dropTestRole(pool: Pool): Promise<void> {
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${testRole}') THEN
        REVOKE SELECT, INSERT, UPDATE, DELETE
          ON platform.registered_devices
          FROM ${testRole};
        REVOKE USAGE ON SCHEMA platform FROM ${testRole};
        REVOKE ${testRole} FROM CURRENT_USER;
        DROP ROLE ${testRole};
      END IF;
    END
    $$;
  `);
}

async function seedFixtures(pool: Pool): Promise<void> {
  await cleanupFixtures(pool);
  await pool.query(
    `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
     VALUES
       ($1, 'RLS Registered Device Company A', 'rls-registered-device-company-a', 'active'),
       ($2, 'RLS Registered Device Company B', 'rls-registered-device-company-b', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [companyAId, companyBId],
  );
  await pool.query(
    `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
     VALUES
       ('40000000-0000-4000-8000-000000000581', $1, 'Employee', $2),
       ('40000000-0000-4000-8000-000000000582', $3, 'Employee', $4)
     ON CONFLICT (user_id) DO UPDATE
     SET active_role = EXCLUDED.active_role,
         company_id = EXCLUDED.company_id,
         updated_at = now()`,
    [userAId, companyAId, userBId, companyBId],
  );
  await pool.query(
    `INSERT INTO platform.registered_devices (
       id, company_id, user_id, installation_id_hash, platform
     )
     VALUES
       ($1, $2, $3, $4, 'android'),
       ($5, $6, $7, $8, 'ios')`,
    [
      deviceAId,
      companyAId,
      userAId,
      hashA,
      deviceBId,
      companyBId,
      userBId,
      hashB,
    ],
  );
}

async function cleanupFixtures(pool: Pool): Promise<void> {
  await pool.query(
    `DELETE FROM platform.registered_devices
     WHERE id IN ($1, $2, $3, $4)
        OR company_id IN ($5, $6)
        OR user_id IN ($7, $8)`,
    [
      deviceAId,
      deviceBId,
      insertedDeviceAId,
      blockedDeviceId,
      companyAId,
      companyBId,
      userAId,
      userBId,
    ],
  );
  await pool.query(
    `DELETE FROM platform.user_session_preferences
     WHERE user_id IN ($1, $2)`,
    [userAId, userBId],
  );
  await pool.query(
    `DELETE FROM platform.company_profiles
     WHERE id IN ($1, $2)`,
    [companyAId, companyBId],
  );
}
