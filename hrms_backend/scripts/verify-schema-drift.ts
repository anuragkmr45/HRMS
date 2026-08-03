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

  const firstFiles = discoverMigrations();
  const firstApplied = await loadAppliedMigrations(client);
  const firstPlan = validateMigrationPlan(firstFiles, firstApplied);

  const appliedCount = await applyPendingMigrations(client, firstPlan.pending);

  const secondFiles = discoverMigrations();
  const secondApplied = await loadAppliedMigrations(client);
  const secondPlan = validateMigrationPlan(secondFiles, secondApplied);

  if (secondPlan.pending.length > 0) {
    throw new Error(
      `Schema drift verification failed. Pending migrations remain after migration run: ` +
        secondPlan.pending.map((migration) => migration.filename).join(", "),
    );
  }

  console.log(
    `Schema drift gate passed. ${appliedCount} migrations applied during verification; ` +
      `${secondApplied.length} migrations recorded in ledger.`,
  );
} finally {
  if (lockAcquired) {
    await releaseMigrationLock(client).catch(() => undefined);
  }

  await client.end();
}
