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
  const plan = validateMigrationPlan(migrationFiles, appliedMigrations);

  console.log("Migration status:");
  console.log(`Total files: ${migrationFiles.length}`);
  console.log(`Applied: ${plan.applied.length}`);
  console.log(`Pending: ${plan.pending.length}`);

  if (plan.pending.length > 0) {
    console.log("Pending migrations:");
    for (const migration of plan.pending) {
      console.log(`- ${migration.filename}`);
    }
  }
} finally {
  await client.end();
}
