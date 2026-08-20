import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadRuntimeEnv, requireEnv } from "./env.js";
import { fail } from "./lib.js";

loadRuntimeEnv();

const releaseDir = process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/release-acceptance";
mkdirSync(releaseDir, { recursive: true });

const requiredExtensions = ["ltree", "pgcrypto", "postgis", "btree_gist"];
const requiredSchemas = ["core", "expenses", "documents", "assets", "timesheets", "platform"];
const requiredTables = [
  "core.departments",
  "core.designations",
  "core.users",
  "core.user_roles",
  "platform.user_sessions",
  "platform.user_credentials",
  "platform.idempotency_keys",
  "platform.outbox_events",
  "platform.processed_events",
  "expenses.expense_tickets",
  "expenses.expense_line_items",
  "expenses.expense_approvals",
  "expenses.employee_reviewer_mappings",
  "expenses.expense_documents",
  "expenses.expense_payments",
  "expenses.expense_audit_logs",
  "documents.doc_metadata",
  "documents.doc_versions",
  "documents.doc_permissions",
  "documents.doc_access_logs",
  "assets.assets",
  "assets.asset_assignments",
  "assets.asset_state_events",
  "assets.asset_recovery_tickets",
  "assets.software_products",
  "assets.license_entitlements",
  "assets.license_activations",
  "assets.compromised_keys",
  "timesheets.work_segments",
  "timesheets.workflow_definitions",
  "timesheets.timesheet_submissions",
  "timesheets.timesheet_approval_actions"
];
const requiredIndexes = [
  "core_users_hierarchy_path_gist_idx",
  "expenses_tickets_requester_queue_idx",
  "expenses_tickets_manager_queue_idx",
  "expenses_tickets_finance_queue_idx",
  "expenses_tickets_status_hot_idx",
  "documents_metadata_business_object_idx",
  "documents_access_document_idx",
  "assets_scan_idx",
  "assets_recovery_employee_status_idx",
  "timesheets_submissions_queue_idx",
  "timesheets_workflow_definitions_definition_gin_idx",
  "platform_user_credentials_status_idx",
  "platform_outbox_pending_idx"
];
const requiredTriggers = [
  "expenses_audit_immutable_trg",
  "documents_access_logs_immutable_trg",
  "assets_state_events_immutable_trg",
  "timesheet_approval_actions_immutable_trg"
];

const client = new Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();

const failures: string[] = [];
const notes: string[] = [];

try {
  const extensions = new Set(
  (
    await client.query<{ extname: string }>(
      "SELECT extname FROM pg_extension"
    )
  ).rows.map((row) => row.extname)
);

for (const extension of requiredExtensions) {
  if (!extensions.has(extension)) {
    failures.push(`missing extension ${extension}`);
  }
}

if (extensions.has("postgis")) {
  try {
    const postgisVersionResult = await client.query<{
      postgis_version: string;
    }>("SELECT PostGIS_Version() AS postgis_version");

    const postgisVersion =
      postgisVersionResult.rows[0]?.postgis_version;

    if (!postgisVersion) {
      failures.push("PostGIS functional probe returned no version");
    } else {
      notes.push(
        `verified PostGIS functional execution (${postgisVersion})`
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    failures.push(`PostGIS functional probe failed: ${message}`);
  }
}
  const schemas = new Set(
    (await client.query<{ schema_name: string }>("SELECT schema_name FROM information_schema.schemata")).rows.map(
      (row) => row.schema_name
    )
  );
  for (const schema of requiredSchemas) {
    if (!schemas.has(schema)) failures.push(`missing schema ${schema}`);
  }

  const tables = new Set(
    (
      await client.query<{ qualified: string }>(`
        SELECT table_schema || '.' || table_name AS qualified
        FROM information_schema.tables
        WHERE table_schema = ANY($1)
      `, [requiredSchemas])
    ).rows.map((row) => row.qualified)
  );
  for (const table of requiredTables) {
    if (!tables.has(table)) failures.push(`missing table ${table}`);
  }

  const indexes = new Set(
    (
      await client.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = ANY($1)
      `, [requiredSchemas])
    ).rows.map((row) => row.indexname)
  );
  for (const index of requiredIndexes) {
    if (!indexes.has(index)) failures.push(`missing index ${index}`);
  }

  const triggers = new Set(
    (
      await client.query<{ tgname: string }>(`
        SELECT tgname
        FROM pg_trigger
        WHERE NOT tgisinternal
      `)
    ).rows.map((row) => row.tgname)
  );
  for (const trigger of requiredTriggers) {
    if (!triggers.has(trigger)) failures.push(`missing immutable trigger ${trigger}`);
  }

  const crossSchemaFks = await client.query(`
    SELECT
      tc.constraint_schema,
      tc.table_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_schema <> ccu.table_schema
  `);
  if (crossSchemaFks.rows.length > 0) {
    failures.push(`cross-schema foreign keys found: ${JSON.stringify(crossSchemaFks.rows)}`);
  }

  const licenseSeed = await client.query<{ product_count: number; entitlement_count: number }>(`
    SELECT
      (SELECT count(*)::int FROM assets.software_products) AS product_count,
      (SELECT count(*)::int FROM assets.license_entitlements WHERE status = 'active') AS entitlement_count
  `);
  if ((licenseSeed.rows[0]?.product_count ?? 0) < 1) failures.push("assets.software_products has no seeded products");
  if ((licenseSeed.rows[0]?.entitlement_count ?? 0) < 1) failures.push("assets.license_entitlements has no active seeded entitlements");

  const outboxColumns = new Set(
    (
      await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'outbox_events'
      `)
    ).rows.map((row) => row.column_name)
  );
  for (const column of ["published_at", "failed_at", "retry_count", "last_error", "idempotency_key"]) {
    if (!outboxColumns.has(column)) failures.push(`platform.outbox_events missing column ${column}`);
  }

  notes.push(`verified ${requiredTables.length} tables`);
  notes.push(`verified ${requiredIndexes.length} required indexes`);
  notes.push(`verified ${requiredTriggers.length} immutable audit/log triggers`);
} finally {
  await client.end();
}

const result = {
  timestamp: new Date().toISOString(),
  database_url_loaded: Boolean(process.env.DATABASE_URL),
  status: failures.length === 0 ? "pass" : "fail",
  failures,
  notes
};

writeFileSync(join(releaseDir, "real-db-verification.json"), `${JSON.stringify(result, null, 2)}\n`);

if (failures.length > 0) {
  fail(`Real PostgreSQL verification failed:\n${failures.join("\n")}`);
}

console.log("Real PostgreSQL migration verification passed.");
