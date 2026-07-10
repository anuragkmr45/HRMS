import { Client } from "pg";
import { getLocalDemoPassword, hashPasswordSync } from "#auth";
import { AssetStatuses, EmploymentStatuses, Roles } from "#shared";
import { seedIds } from "../src/platform/data-store.js";
import { getReleaseSeedEmails } from "../src/platform/seed-personas.js";
import { loadRuntimeEnv, requireEnv } from "./env.js";

loadRuntimeEnv();
const localDemoPassword = getLocalDemoPassword();
const seedEmails = getReleaseSeedEmails();

const client = new Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO core.designations (id, designation_code, title, level, status)
     VALUES
      ($1, 'DIRECTOR', 'Director/HoD', 10, 'active'),
      ($2, 'REVIEWER', 'Reviewer', 6, 'active'),
      ($3, 'FINANCE_MANAGER', 'Finance Manager', 8, 'active'),
      ($4, 'EMPLOYEE', 'Employee', 1, 'active'),
      ($5, 'ADMIN', 'Admin', 9, 'active'),
      ($6, 'HR_MANAGER', 'HR Manager', 7, 'active'),
      ($7, 'PROJECT_MANAGER', 'Project Manager', 6, 'active'),
      ($8, 'ASSET_MANAGER', 'Asset Manager', 6, 'active'),
      ($9, 'AUDITOR', 'Auditor', 5, 'active'),
      ($10, 'HELPDESK_AGENT', 'Helpdesk Agent', 3, 'active'),
      ($11, 'HELPDESK_MANAGER', 'Helpdesk Manager', 6, 'active')
     ON CONFLICT (id) DO UPDATE
     SET designation_code = EXCLUDED.designation_code,
         title = EXCLUDED.title,
         level = EXCLUDED.level,
         status = EXCLUDED.status,
         updated_at = now(),
         deleted_at = NULL`,
    [
      seedIds.designationDirector,
      seedIds.designationReviewer,
      seedIds.designationFinance,
      seedIds.designationEmployee,
      seedIds.designationAdmin,
      seedIds.designationHrManager,
      seedIds.designationProjectManager,
      seedIds.designationAssetManager,
      seedIds.designationAuditor,
      seedIds.designationHelpdeskAgent,
      seedIds.designationHelpdeskManager
    ]
  );
  await client.query(
    `INSERT INTO core.departments (id, department_code, name, director_user_id, status)
     VALUES
      ($1, 'SALES', 'Sales', $2, 'active'),
      ($3, 'FIN', 'Finance', $4, 'active')
     ON CONFLICT (id) DO UPDATE
     SET department_code = EXCLUDED.department_code,
         name = EXCLUDED.name,
         director_user_id = EXCLUDED.director_user_id,
         status = EXCLUDED.status,
         updated_at = now(),
         deleted_at = NULL`,
    [seedIds.departmentSales, seedIds.director, seedIds.departmentFinance, seedIds.financeManager]
  );

  const users = [
    [seedIds.director, "S1", seedEmails.director, "Sales Director", seedIds.departmentSales, seedIds.designationDirector, null, "CEO.SALES.S1", Roles.Director, EmploymentStatuses.Active],
    [seedIds.reviewer, "D1", seedEmails.reviewer, "Reviewer D1", seedIds.departmentSales, seedIds.designationReviewer, seedIds.director, "CEO.SALES.S1.D1", Roles.Reviewer, EmploymentStatuses.Active],
    [seedIds.employee1, "E1", seedEmails.employee1, "Employee E1", seedIds.departmentSales, seedIds.designationEmployee, seedIds.reviewer, "CEO.SALES.S1.D1.E1", Roles.Employee, EmploymentStatuses.Active],
    [seedIds.employee2, "E2", seedEmails.employee2, "Employee E2", seedIds.departmentSales, seedIds.designationEmployee, seedIds.reviewer, "CEO.SALES.S1.D1.E2", Roles.Employee, EmploymentStatuses.Active],
    [seedIds.employee3, "E3", seedEmails.employee3, "Terminated Employee E3", seedIds.departmentSales, seedIds.designationEmployee, seedIds.reviewer, "CEO.SALES.S1.D1.E3", Roles.Employee, EmploymentStatuses.Terminated],
    [seedIds.financeManager, "N1", seedEmails.financeManager, "Finance Manager N1", seedIds.departmentFinance, seedIds.designationFinance, null, "CEO.FIN.N1", Roles.FinanceManager, EmploymentStatuses.Active],
    [seedIds.alternateFinance, "N2", seedEmails.alternateFinance, "Alternate Finance N2", seedIds.departmentFinance, seedIds.designationFinance, seedIds.financeManager, "CEO.FIN.N1.N2", Roles.FinanceManager, EmploymentStatuses.Active],
    [seedIds.admin, "ADM", seedEmails.admin, "HR Admin", seedIds.departmentFinance, seedIds.designationFinance, null, "CEO.ADM", Roles.Admin, EmploymentStatuses.Active],
    [seedIds.auditor, "AUD", seedEmails.auditor, "Normal Manager/Auditor", seedIds.departmentFinance, seedIds.designationFinance, null, "CEO.AUD", Roles.Auditor, EmploymentStatuses.Active],
    [seedIds.assetManager, "AST", seedEmails.assetManager, "Asset Manager", seedIds.departmentFinance, seedIds.designationFinance, null, "CEO.AST", Roles.AssetManager, EmploymentStatuses.Active]
  ];

  for (const user of users) {
    const [
      id,
      employeeCode,
      email,
      fullName,
      departmentId,
      designationId,
      managerUserId,
      hierarchyPath,
      role,
      status
    ] = user;
    await client.query(
      `INSERT INTO core.users (
        id, employee_code, email, full_name, department_id, designation_id, manager_user_id,
        hierarchy_path, employment_status, timezone, joined_on, terminated_on
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ltree, $9, 'Asia/Kolkata', '2026-01-01', CASE WHEN $9 = 'terminated' THEN '2026-04-01'::date ELSE NULL END)
      ON CONFLICT (employee_code) DO NOTHING`,
      [id, employeeCode, email, fullName, departmentId, designationId, managerUserId, hierarchyPath, status]
    );
    await client.query(
      `INSERT INTO core.user_roles (user_id, role_key, status, effective_from)
       SELECT $1, $2, 'active', '2026-01-01'
       WHERE NOT EXISTS (
         SELECT 1
         FROM core.user_roles
         WHERE user_id = $1
           AND role_key = $2
           AND status = 'active'
           AND deleted_at IS NULL
       )`,
      [id, role]
    );
    await client.query(
      `INSERT INTO platform.user_credentials (user_id, password_hash, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           status = EXCLUDED.status,
           deleted_at = NULL,
           updated_at = now()`,
      [id, hashPasswordSync(localDemoPassword, `hrms-local-${String(employeeCode).toLowerCase()}`)]
    );
  }

  for (const employeeId of [seedIds.employee1, seedIds.employee2]) {
    await client.query(
      `INSERT INTO expenses.employee_reviewer_mappings
       (employee_user_id, reviewer_user_id, assigned_by_user_id, effective_from, status)
       VALUES ($1, $2, $3, '2026-01-01', 'active')
       ON CONFLICT DO NOTHING`,
      [employeeId, seedIds.reviewer, seedIds.director]
    );
  }

  await client.query(
    `INSERT INTO platform.finance_governance_config (
       id,
       scope_key,
       primary_finance_manager_user_id,
       finance_self_request_fallback_user_id,
       status,
       effective_from,
       effective_to,
       updated_by_user_id,
       version
     )
     VALUES ($1, 'global', $2, $3, 'active', '2026-01-01', NULL, $4, 1)
     ON CONFLICT (scope_key) DO UPDATE
     SET primary_finance_manager_user_id = EXCLUDED.primary_finance_manager_user_id,
         finance_self_request_fallback_user_id = EXCLUDED.finance_self_request_fallback_user_id,
         status = EXCLUDED.status,
         effective_from = EXCLUDED.effective_from,
         effective_to = EXCLUDED.effective_to,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = now(),
         deleted_at = NULL`,
    [seedIds.financeGovernanceConfig, seedIds.financeManager, seedIds.director, seedIds.admin]
  );

  await client.query(
    `INSERT INTO assets.assets
     (id, asset_code, qr_hash, asset_type, name, serial_no, status, current_assigned_user_id, metadata)
     VALUES ($1, 'REL-LAP-001', 'release-qr-hash-lap-001', 'Laptop', 'Release Laptop', 'REL-SN-001', $2, $3, '{"procurement_cost":"65000.00"}')
     ON CONFLICT (asset_code) DO UPDATE
     SET status = EXCLUDED.status,
         current_assigned_user_id = EXCLUDED.current_assigned_user_id,
         metadata = EXCLUDED.metadata,
         updated_at = now()`,
    [seedIds.licenseProduct, AssetStatuses.Assigned, seedIds.employee3]
  );
  await client.query(
    `INSERT INTO assets.assets
     (asset_code, qr_hash, asset_type, name, serial_no, status, current_assigned_user_id, metadata)
     VALUES ('LAP-001', 'release-qr-hash-lap-available', 'Laptop', 'ThinkPad T-Series', 'SN-LAP-001', $1, NULL, '{"procurement_cost":"65000.00"}')
     ON CONFLICT (asset_code) DO UPDATE
     SET status = EXCLUDED.status,
         current_assigned_user_id = NULL,
         updated_at = now()`,
    [AssetStatuses.InStock]
  );

  await client.query(
    `INSERT INTO assets.software_products (id, vendor_id, name)
     VALUES ($1, $2, 'Office Productivity Suite')
     ON CONFLICT (id) DO UPDATE
     SET vendor_id = EXCLUDED.vendor_id,
         name = EXCLUDED.name`,
    [seedIds.licenseProduct, seedIds.assetManager]
  );

  await client.query(
    `INSERT INTO assets.license_entitlements (id, product_id, seat_count, status)
     VALUES ($1, $2, 1, 'active')
     ON CONFLICT DO NOTHING`,
    [seedIds.entitlement, seedIds.licenseProduct]
  );

  await client.query(
    `INSERT INTO timesheets.workflow_definitions (id, name, definition, version, status)
     VALUES ($1, 'Release ltree manager approval', '{"approver_strategy":"ltree_manager","require_billable_review":false}', 1, 'active')
     ON CONFLICT DO NOTHING`,
    [seedIds.workflowDefinition]
  );

  await client.query("COMMIT");
  console.log("Release seed data inserted or already present.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
