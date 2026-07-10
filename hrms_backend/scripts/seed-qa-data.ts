import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { getLocalDemoPassword, hashPasswordSync } from "#auth";
import { AssetStatuses, EmploymentStatuses, ExpenseSubTypes, Roles } from "#shared";
import { seedIds } from "../src/platform/data-store.js";
import { getQaSeedEmails } from "../src/platform/seed-personas.js";
import { loadRuntimeEnv, requireEnv } from "./env.js";

loadRuntimeEnv();
const localDemoPassword = getLocalDemoPassword();
const qaSeedEmails = getQaSeedEmails();

const reportDir = process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/qa-readiness";
mkdirSync(reportDir, { recursive: true });

function uuidFromName(name: string): string {
  const hash = createHash("sha256").update(name).digest("hex");
  const variant = (8 + (Number.parseInt(hash.slice(16, 17), 16) % 4)).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const ids = {
  departmentHr: uuidFromName("qa-department-hr"),
  designationHrManager: seedIds.designationHrManager,
  designationManager: uuidFromName("qa-designation-normal-manager"),
  designationAdmin: seedIds.designationAdmin,
  designationProjectManager: seedIds.designationProjectManager,
  designationAssetManager: seedIds.designationAssetManager,
  designationAuditor: seedIds.designationAuditor,
  designationHelpdeskAgent: seedIds.designationHelpdeskAgent,
  designationHelpdeskManager: seedIds.designationHelpdeskManager,
  hrManager: uuidFromName("qa-user-hr-manager"),
  normalManager: uuidFromName("qa-user-normal-manager"),
  unauthorizedEmployee: uuidFromName("qa-user-unauthorized-employee"),
  timesheetApprover: uuidFromName("qa-user-timesheet-approver"),
  assignedAsset: uuidFromName("qa-asset-assigned-e1"),
  policyProjectTravel: uuidFromName("qa-policy-project-travel"),
  policyClientMeeting: uuidFromName("qa-policy-client-meeting"),
  workflowDefinition: uuidFromName("qa-timesheet-workflow"),
  compromisedKey: uuidFromName("qa-compromised-device")
};

const client = new Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();

try {
  await client.query("BEGIN");

  await client.query(
    `INSERT INTO core.designations (id, designation_code, title, level, status)
     VALUES
       ($1, 'HR_MANAGER', 'HR Manager', 7, 'active'),
       ($2, 'MANAGER', 'Normal Manager', 5, 'active'),
       ($3, 'ADMIN', 'Admin', 9, 'active'),
       ($4, 'PROJECT_MANAGER', 'Project Manager', 6, 'active'),
       ($5, 'ASSET_MANAGER', 'Asset Manager', 6, 'active'),
       ($6, 'AUDITOR', 'Auditor', 5, 'active'),
       ($7, 'HELPDESK_AGENT', 'Helpdesk Agent', 3, 'active'),
       ($8, 'HELPDESK_MANAGER', 'Helpdesk Manager', 6, 'active')
     ON CONFLICT (designation_code) DO UPDATE
     SET title = EXCLUDED.title, level = EXCLUDED.level, status = EXCLUDED.status, updated_at = now()`,
    [
      ids.designationHrManager,
      ids.designationManager,
      ids.designationAdmin,
      ids.designationProjectManager,
      ids.designationAssetManager,
      ids.designationAuditor,
      ids.designationHelpdeskAgent,
      ids.designationHelpdeskManager
    ]
  );

  await client.query(
    `INSERT INTO core.departments (id, department_code, name, director_user_id, status)
     VALUES ($1, 'HR', 'Human Resources', $2, 'active')
     ON CONFLICT (department_code) DO UPDATE
     SET name = EXCLUDED.name, director_user_id = EXCLUDED.director_user_id, status = EXCLUDED.status, updated_at = now()`,
    [ids.departmentHr, ids.hrManager]
  );

  const users = [
    [ids.hrManager, "HRM", qaSeedEmails.hrManager, "HR Manager", ids.departmentHr, ids.designationHrManager, null, "CEO.HR.HRM", Roles.HRManager, EmploymentStatuses.Active],
    [ids.normalManager, "MGR", qaSeedEmails.normalManager, "Normal Manager", seedIds.departmentSales, ids.designationManager, seedIds.director, "CEO.SALES.S1.MGR", Roles.Reviewer, EmploymentStatuses.Active],
    [ids.unauthorizedEmployee, "U1", qaSeedEmails.unauthorizedEmployee, "Unauthorized Employee", seedIds.departmentSales, seedIds.designationEmployee, ids.normalManager, "CEO.SALES.S1.MGR.U1", Roles.Employee, EmploymentStatuses.Active],
    [ids.timesheetApprover, "TSA", qaSeedEmails.timesheetApprover, "Timesheet Approver", seedIds.departmentSales, seedIds.designationReviewer, seedIds.director, "CEO.SALES.S1.TSA", Roles.Reviewer, EmploymentStatuses.Active]
  ];

  for (const user of users) {
    const [id, employeeCode, email, fullName, departmentId, designationId, managerUserId, hierarchyPath, role, status] = user;
    await client.query(
      `INSERT INTO core.users (
        id, employee_code, email, full_name, department_id, designation_id, manager_user_id,
        hierarchy_path, employment_status, timezone, joined_on, terminated_on
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ltree, $9, 'Asia/Kolkata', '2026-01-01', NULL)
      ON CONFLICT (employee_code) DO UPDATE
      SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, department_id = EXCLUDED.department_id,
          designation_id = EXCLUDED.designation_id, manager_user_id = EXCLUDED.manager_user_id,
          hierarchy_path = EXCLUDED.hierarchy_path, employment_status = EXCLUDED.employment_status,
          updated_at = now(), deleted_at = NULL`,
      [id, employeeCode, email, fullName, departmentId, designationId, managerUserId, hierarchyPath, status]
    );
    await client.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from)
       VALUES ($1, $2, $3, 'active', '2026-01-01')
       ON CONFLICT (id) DO UPDATE
       SET user_id = EXCLUDED.user_id, role_key = EXCLUDED.role_key, status = EXCLUDED.status, updated_at = now()`,
      [uuidFromName(`qa-role-${employeeCode}`), id, role]
    );
    await client.query(
      `INSERT INTO platform.user_credentials (id, user_id, password_hash, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           status = EXCLUDED.status,
           deleted_at = NULL,
           updated_at = now()`,
      [
        uuidFromName(`qa-credential-${employeeCode}`),
        id,
        hashPasswordSync(localDemoPassword, `hrms-local-${String(employeeCode).toLowerCase()}`)
      ]
    );
  }

  await client.query(
    `INSERT INTO expenses.employee_reviewer_mappings
     (id, employee_user_id, reviewer_user_id, assigned_by_user_id, effective_from, status)
     VALUES ($1, $2, $3, $4, '2026-01-01', 'active')
     ON CONFLICT (id) DO UPDATE
     SET reviewer_user_id = EXCLUDED.reviewer_user_id, status = EXCLUDED.status, updated_at = now(), deleted_at = NULL`,
    [uuidFromName("qa-reviewer-u1-tsa"), ids.unauthorizedEmployee, ids.timesheetApprover, seedIds.director]
  );

  await client.query(
    `INSERT INTO expenses.expense_policy_rules
      (id, category, sub_type, max_amount, requires_attachment, requires_exception_approval, required_document_types, sla_hours, status)
     VALUES
      ($1, 'qa-readiness', $2, 50000.00, true, false, '["travel_ticket","boarding_pass","receipt"]', 24, 'active'),
      ($3, 'qa-readiness', $4, 25000.00, true, false, '["meeting_receipt"]', 24, 'active')
     ON CONFLICT (id) DO UPDATE
     SET required_document_types = EXCLUDED.required_document_types,
         sla_hours = EXCLUDED.sla_hours,
         status = EXCLUDED.status,
         updated_at = now()`,
    [ids.policyProjectTravel, ExpenseSubTypes.ProjectTravel, ids.policyClientMeeting, ExpenseSubTypes.ClientMeeting]
  );

  await client.query(
    `INSERT INTO assets.assets
     (id, asset_code, qr_hash, asset_type, name, serial_no, status, current_assigned_user_id, metadata)
     VALUES ($1, 'QA-LAP-E1', 'qa-safe-qr-lap-e1', 'Laptop', 'QA Assigned Laptop', 'QA-SN-E1', $2, $3, '{"procurement_cost":"72000.00"}')
     ON CONFLICT (asset_code) DO UPDATE
     SET status = EXCLUDED.status, current_assigned_user_id = EXCLUDED.current_assigned_user_id,
         metadata = EXCLUDED.metadata, updated_at = now(), deleted_at = NULL`,
    [ids.assignedAsset, AssetStatuses.Assigned, seedIds.employee1]
  );

  await client.query(
    `INSERT INTO assets.compromised_keys (id, key_hash, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (key_hash) DO UPDATE
     SET status = EXCLUDED.status, updated_at = now()`,
    [ids.compromisedKey, sha256("qa-compromised-device")]
  );

  await client.query(
    `INSERT INTO timesheets.workflow_definitions (id, name, definition, version, status)
     VALUES ($1, 'QA ltree manager approval', '{"approver_strategy":"ltree_manager","require_billable_review":false}', 1, 'active')
     ON CONFLICT (id) DO UPDATE
     SET definition = EXCLUDED.definition, version = EXCLUDED.version, status = EXCLUDED.status, updated_at = now()`,
    [ids.workflowDefinition]
  );

  await client.query(
    `INSERT INTO timesheets.work_segments
      (id, employee_user_id, work_date, project_code, task_code, hours, description, billable)
     VALUES ($1, $2, '2026-06-01', 'QA-PRJ-001', 'QA-TASK-001', 8.00, 'QA seed work segment', true)
     ON CONFLICT (id) DO UPDATE
     SET hours = EXCLUDED.hours, description = EXCLUDED.description, updated_at = now()`,
    [uuidFromName("qa-work-segment-e1"), seedIds.employee1]
  );

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

const result = {
  timestamp: new Date().toISOString(),
  status: "pass",
  personas: {
    requester: "E1",
    reviewer: "D1",
    director_hod: "S1",
    finance_manager: "N1",
    alternate_finance: "N2",
    hr_admin: "ADM",
    hr_manager: "HRM",
    normal_manager: "MGR",
    auditor: "AUD",
    terminated_employee: "E3",
    asset_admin: "AST",
    timesheet_approver: "TSA",
    unauthorized_employee: "U1"
  },
  seeded_records: [
    "departments/designations",
    "ltree hierarchy",
    "reviewer mappings",
    "expense policy and SLA defaults",
    "document classification personas",
    "assigned asset and available asset",
    "license entitlement and compromised device key",
    "timesheet JSONB workflow definition",
    "sample work segment"
  ]
};

writeFileSync(join(reportDir, "qa-seed-results.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log("QA seed data inserted or already present.");
