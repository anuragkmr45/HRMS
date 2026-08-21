import type { UUID } from "#shared";
import { conflict } from "../../platform/errors.js";
import type { AttendanceCommandTransactionRepository } from "./command-repository.js";
import {
  builtInAttendancePolicy,
  type EffectiveAttendancePolicy,
  normalizeAttendancePolicyConfig,
  type AttendanceAssignmentScopeType,
} from "./policy-config.js";

interface AssignmentRow extends Record<string, unknown> {
  id: UUID;
  policy_id: UUID;
  scope_type: "employee" | "department" | "company";
  scope_id: UUID | null;
  scope_rank: number;
  effective_from: Date;
  effective_until: Date | null;
}

interface PolicyVersionRow extends Record<string, unknown> {
  id: UUID;
  version_number: number;
  effective_from: Date;
  effective_until: Date | null;
  config: Record<string, unknown>;
}

export async function resolveEffectiveAttendancePolicy(
  tx: AttendanceCommandTransactionRepository,
  input: {
    companyId: UUID;
    subjectEmployeeUserId: UUID;
    asOf: string;
  },
): Promise<EffectiveAttendancePolicy> {
  const employee = (await tx.query<{
    department_id: UUID | null;
    preference_company_id: UUID | null;
    department_company_id: UUID | null;
  }>(
    `SELECT
        employee.department_id,
        preference.company_id AS preference_company_id,
        department.company_id AS department_company_id
      FROM core.users employee
      LEFT JOIN platform.user_session_preferences preference
        ON preference.user_id = employee.id
      LEFT JOIN core.departments department
        ON department.id = employee.department_id
      WHERE employee.id = $1
        AND employee.deleted_at IS NULL`,
    [input.subjectEmployeeUserId],
  )).rows[0];

  if (!employee || employee.preference_company_id !== input.companyId) {
    throw conflict("Attendance policy subject is not assigned to the requested company.", {
      code: "attendance_policy_invalid_cross_company_subject",
      company_id: input.companyId,
      subject_employee_user_id: input.subjectEmployeeUserId,
    });
  }

  const departmentId =
    employee.department_id && employee.department_company_id === input.companyId
      ? employee.department_id
      : null;

  const assignments = (await tx.query<AssignmentRow>(
    `SELECT
        assignment.id,
        assignment.policy_id,
        assignment.scope_type,
        assignment.scope_id,
        assignment.effective_from,
        assignment.effective_until,
        CASE assignment.scope_type
          WHEN 'employee' THEN 300
          WHEN 'department' THEN 200
          WHEN 'company' THEN 100
          ELSE 0
        END AS scope_rank
      FROM attendance.policy_assignments assignment
      JOIN attendance.policies policy
        ON policy.id = assignment.policy_id
       AND policy.company_id = assignment.company_id
       AND policy.deleted_at IS NULL
       AND policy.status = 'active'
       AND policy.policy_key = 'attendance'
      WHERE assignment.company_id = $1
        AND assignment.status = 'active'
        AND assignment.deleted_at IS NULL
        AND assignment.effective_from <= $4::timestamptz
        AND (assignment.effective_until IS NULL OR $4::timestamptz < assignment.effective_until)
        AND (
          (assignment.scope_type = 'employee' AND assignment.scope_id = $2::uuid)
          OR (assignment.scope_type = 'department' AND assignment.scope_id = $3::uuid)
          OR (assignment.scope_type = 'company' AND assignment.scope_id IS NULL)
        )
      ORDER BY scope_rank DESC`,
    [input.companyId, input.subjectEmployeeUserId, departmentId, input.asOf],
  )).rows;

  if (assignments.length === 0) {
    return builtInAttendancePolicy(input.asOf);
  }

  const selectedRank = assignments[0]!.scope_rank;
  const topAssignments = assignments.filter((assignment) => assignment.scope_rank === selectedRank);
  if (topAssignments.length > 1) {
    throw conflict("Multiple attendance policy assignments match at the same precedence.", {
      code: "attendance_policy_ambiguous_assignment",
      company_id: input.companyId,
      subject_employee_user_id: input.subjectEmployeeUserId,
      scope_rank: selectedRank,
      assignment_ids: topAssignments.map((assignment) => assignment.id),
    });
  }

  const assignment = topAssignments[0]!;
  const versions = (await tx.query<PolicyVersionRow>(
    `SELECT id, version_number, effective_from, effective_until, config
      FROM attendance.policy_versions
      WHERE company_id = $1
        AND policy_id = $2
        AND effective_from <= $3::timestamptz
        AND (effective_until IS NULL OR $3::timestamptz < effective_until)`,
    [input.companyId, assignment.policy_id, input.asOf],
  )).rows;

  if (versions.length === 0) {
    throw conflict("Attendance policy assignment has no effective version.", {
      code: "attendance_policy_no_effective_version",
      company_id: input.companyId,
      policy_id: assignment.policy_id,
      assignment_id: assignment.id,
      as_of: input.asOf,
    });
  }
  if (versions.length > 1) {
    throw conflict("Attendance policy assignment has multiple effective versions.", {
      code: "attendance_policy_ambiguous_versions",
      company_id: input.companyId,
      policy_id: assignment.policy_id,
      assignment_id: assignment.id,
      as_of: input.asOf,
      policy_version_ids: versions.map((version) => version.id),
    });
  }

  const version = versions[0]!;
  const config = normalizeAttendancePolicyConfig(version.config);
  const legacyPolicyVersion = String(version.version_number);
  return {
    schemaVersion: 1,
    resolverVersion: "attendance-policy-resolver-v1",
    source: "assignment",
    asOf: input.asOf,
    policyKey: "attendance",
    policyId: assignment.policy_id,
    policyVersionId: version.id,
    policyVersionNumber: version.version_number,
    legacyPolicyVersion,
    policyVersion: legacyPolicyVersion,
    assignmentId: assignment.id,
    assignmentScopeType: assignment.scope_type as AttendanceAssignmentScopeType,
    assignmentScopeId: assignment.scope_id,
    scopeRank: selectedRank,
    effectiveFrom: version.effective_from.toISOString(),
    effectiveUntil: version.effective_until?.toISOString() ?? null,
    config,
    ...config,
  };
}
