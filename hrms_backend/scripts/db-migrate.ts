import { Client } from "pg";
import { loadRuntimeEnv, requireEnv } from "./env.js";
import {
  acquireMigrationLock,
  applyPendingMigrations,
  discoverMigrations,
  ensureMigrationLedger,
  loadAppliedMigrations,
  releaseMigrationLock,
  validateMigrationPlan,
} from "./db-migration-lib.js";

loadRuntimeEnv();

const client = new Client({ connectionString: requireEnv("DATABASE_URL") });

await client.connect();

let lockAcquired = false;

try {
  await acquireMigrationLock(client);
  lockAcquired = true;

  await ensureMigrationLedger(client);

  const migrationFiles = discoverMigrations();
  const appliedMigrations = await loadAppliedMigrations(client);
  const plan = validateMigrationPlan(migrationFiles, appliedMigrations);

  const appliedCount = await applyPendingMigrations(client, plan.pending);

  console.log(
    `Migration completed successfully. ` +
      `${appliedCount} applied, ${plan.applied.length} already applied.`,
  );
} finally {
  if (lockAcquired) {
    await releaseMigrationLock(client).catch(() => undefined);
  }

  await client.end();
}
