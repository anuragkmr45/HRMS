import { Client } from "pg";
import { loadRuntimeEnv, requireEnv } from "./env.js";
import {
  discoverMigrations,
  ensureMigrationLedger,
  loadAppliedMigrations,
  validateMigrationPlan,
} from "./db-migration-lib.js";

loadRuntimeEnv();

const client = new Client({ connectionString: requireEnv("DATABASE_URL") });

await client.connect();

try {
  await ensureMigrationLedger(client);

  const migrationFiles = discoverMigrations();
  const appliedMigrations = await loadAppliedMigrations(client);

  validateMigrationPlan(migrationFiles, appliedMigrations);

  console.log(
    `Migration history verified. ${migrationFiles.length} migration files checked.`,
  );
} finally {
  await client.end();
}
