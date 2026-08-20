import type { UUID } from "#shared";
import type { Pool, PoolClient } from "pg";

export const TENANT_COMPANY_SETTING = "app.current_company_id";

export async function setTenantDbContext(
  client: PoolClient,
  companyId: UUID,
): Promise<void> {
  await client.query("SELECT set_config($1, $2, true)", [
    TENANT_COMPANY_SETTING,
    companyId,
  ]);
}

export async function withTenantDbTransaction<T>(
  pool: Pool,
  companyId: UUID,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantDbContext(client, companyId);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
