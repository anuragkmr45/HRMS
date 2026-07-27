import type { Pool, PoolClient } from "pg";
import type { UUID } from "#shared";
import {
  BUILT_IN_STANDARD_SHIFT_TEMPLATE,
  resolveEmployeeShift,
  type ResolvedEmployeeShift,
  type ShiftAssignmentInput,
  type ShiftCompanyInput,
  type ShiftEmployeeInput,
  type ShiftTemplateInput,
  type ShiftTemplateVersionInput,
} from "./shift-resolver.js";

export interface AttendanceShiftInstanceRecord {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  work_date: string;
  template_id: UUID;
  template_version_id: UUID;
  assignment_id: UUID | null;
  resolved_timezone: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  eligibility_start_at: string;
  eligibility_end_at: string;
  generation_source: string;
  generated_at: string;
  deleted_at: string | null;
}

export class PostgresAttendanceShiftRepository {
  constructor(private readonly pool: Pool) {}

  async resolveEmployeeShift(input: {
    companyId: UUID;
    employeeUserId: UUID;
    workDate: string;
  }): Promise<ResolvedEmployeeShift> {
    const client = await this.pool.connect();
    try {
      return this.resolveEmployeeShiftWithClient(client, input);
    } finally {
      client.release();
    }
  }

  async generateEmployeeShiftInstance(input: {
    companyId: UUID;
    employeeUserId: UUID;
    workDate: string;
  }): Promise<AttendanceShiftInstanceRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const resolved = await this.resolveEmployeeShiftWithClient(client, input);
      const persisted = resolved.source === "built_in_default"
        ? await this.ensurePersistedBuiltInShift(client, resolved)
        : {
            templateId: resolved.template.id,
            templateVersionId: resolved.version.id,
          };
      const inserted = await client.query<AttendanceShiftInstanceRecord>(
        `INSERT INTO attendance.shift_instances (
          company_id,
          employee_user_id,
          work_date,
          template_id,
          template_version_id,
          assignment_id,
          resolved_timezone,
          scheduled_start_at,
          scheduled_end_at,
          eligibility_start_at,
          eligibility_end_at,
          generation_source,
          generated_at,
          deleted_at
        ) VALUES (
          $1, $2, $3::date, $4, $5, $6, $7,
          $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::timestamptz,
          $12, now(), NULL
        )
        ON CONFLICT (company_id, employee_user_id, work_date)
          WHERE deleted_at IS NULL
          DO NOTHING
        RETURNING
          id,
          company_id,
          employee_user_id,
          work_date::text,
          template_id,
          template_version_id,
          assignment_id,
          resolved_timezone,
          scheduled_start_at,
          scheduled_end_at,
          eligibility_start_at,
          eligibility_end_at,
          generation_source,
          generated_at,
          deleted_at`,
        [
          resolved.company_id,
          resolved.employee_user_id,
          resolved.work_date,
          persisted.templateId,
          persisted.templateVersionId,
          resolved.assignment?.id ?? null,
          resolved.resolved_timezone,
          resolved.scheduled_start_at,
          resolved.scheduled_end_at,
          resolved.eligibility_start_at,
          resolved.eligibility_end_at,
          resolved.source,
        ],
      );
      const row =
        inserted.rows[0] ?? (await this.findGeneratedInstance(client, input));
      if (!row) {
        throw new Error("Attendance shift instance could not be generated.");
      }
      await client.query("COMMIT");
      return normalizeInstance(row);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async resolveEmployeeShiftWithClient(
    client: PoolClient,
    input: {
      companyId: UUID;
      employeeUserId: UUID;
      workDate: string;
    },
  ): Promise<ResolvedEmployeeShift> {
    const company = (
      await client.query<ShiftCompanyInput>(
        `SELECT id, timezone, work_hours_per_day
         FROM platform.company_profiles
         WHERE id = $1 AND status = 'active'`,
        [input.companyId],
      )
    ).rows[0];
    if (!company) throw new Error("Attendance shift company is unavailable.");

    const employee = (
      await client.query<ShiftEmployeeInput>(
        `SELECT id, timezone
         FROM core.users
         WHERE id = $1 AND deleted_at IS NULL`,
        [input.employeeUserId],
      )
    ).rows[0];
    if (!employee) throw new Error("Attendance shift employee is unavailable.");

    const templates = (
      await client.query<ShiftTemplateInput>(
        `SELECT id, company_id, code, name, description, status,
            is_company_default, deleted_at
         FROM attendance.shift_templates
         WHERE company_id = $1
           AND deleted_at IS NULL`,
        [input.companyId],
      )
    ).rows;
    const versions = (
      await client.query<ShiftTemplateVersionInput>(
        `SELECT id, company_id, template_id, version_number,
            effective_from::text, effective_until::text, local_start_time::text,
            local_end_time::text, end_day_offset, timezone_strategy,
            fixed_timezone, eligibility_open_before_start_minutes,
            eligibility_close_after_end_minutes
         FROM attendance.shift_template_versions
         WHERE company_id = $1
           AND effective_from <= $2::date
           AND (effective_until IS NULL OR effective_until >= $2::date)`,
        [input.companyId, input.workDate],
      )
    ).rows;
    const assignments = (
      await client.query<ShiftAssignmentInput>(
        `SELECT id, company_id, employee_user_id, template_id,
            effective_from::text, effective_until::text, status, deleted_at
         FROM attendance.shift_assignments
         WHERE company_id = $1
           AND employee_user_id = $2
           AND deleted_at IS NULL
           AND effective_from <= $3::date
           AND (effective_until IS NULL OR effective_until >= $3::date)`,
        [input.companyId, input.employeeUserId, input.workDate],
      )
    ).rows;

    return resolveEmployeeShift({
      company,
      employee,
      workDate: input.workDate,
      templates,
      versions,
      assignments,
    });
  }

  private async findGeneratedInstance(
    client: PoolClient,
    input: {
      companyId: UUID;
      employeeUserId: UUID;
      workDate: string;
    },
  ): Promise<AttendanceShiftInstanceRecord | null> {
    const result = await client.query<AttendanceShiftInstanceRecord>(
      `SELECT id, company_id, employee_user_id, work_date::text, template_id,
          template_version_id, assignment_id, resolved_timezone,
          scheduled_start_at, scheduled_end_at, eligibility_start_at,
          eligibility_end_at, generation_source, generated_at, deleted_at
       FROM attendance.shift_instances
       WHERE company_id = $1
         AND employee_user_id = $2
         AND work_date = $3::date
         AND deleted_at IS NULL`,
      [input.companyId, input.employeeUserId, input.workDate],
    );
    return result.rows[0] ?? null;
  }

  private async ensurePersistedBuiltInShift(
    client: PoolClient,
    resolved: ResolvedEmployeeShift,
  ): Promise<{ templateId: UUID; templateVersionId: UUID }> {
    const template = (
      await client.query<{ id: UUID }>(
        `INSERT INTO attendance.shift_templates (
          company_id, code, name, description, status, is_company_default,
          created_at, updated_at, deleted_at, version
        ) VALUES ($1, $2, $3, $4, 'active', true, now(), now(), NULL, 1)
        ON CONFLICT (company_id, code)
          WHERE deleted_at IS NULL
          DO UPDATE SET updated_at = attendance.shift_templates.updated_at
        RETURNING id`,
        [
          resolved.company_id,
          BUILT_IN_STANDARD_SHIFT_TEMPLATE.code,
          BUILT_IN_STANDARD_SHIFT_TEMPLATE.name,
          BUILT_IN_STANDARD_SHIFT_TEMPLATE.description,
        ],
      )
    ).rows[0];
    if (!template) {
      throw new Error("Built-in attendance shift template could not be stored.");
    }

    const version = (
      await client.query<{ id: UUID }>(
        `INSERT INTO attendance.shift_template_versions (
          company_id, template_id, version_number, effective_from,
          effective_until, local_start_time, local_end_time, end_day_offset,
          timezone_strategy, fixed_timezone,
          eligibility_open_before_start_minutes,
          eligibility_close_after_end_minutes,
          created_by_user_id,
          created_at
        ) VALUES (
          $1, $2, 1, $3::date, NULL, $4::time, $5::time, $6,
          $7, $8, $9, $10, NULL, now()
        )
        ON CONFLICT (template_id, version_number) DO NOTHING
        RETURNING id`,
        [
          resolved.company_id,
          template.id,
          resolved.version.effective_from,
          resolved.version.local_start_time,
          resolved.version.local_end_time,
          resolved.version.end_day_offset,
          resolved.version.timezone_strategy,
          resolved.version.fixed_timezone,
          resolved.version.eligibility_open_before_start_minutes,
          resolved.version.eligibility_close_after_end_minutes,
        ],
      )
    ).rows[0] ?? (
      await client.query<{ id: UUID }>(
        `SELECT id
         FROM attendance.shift_template_versions
         WHERE company_id = $1
           AND template_id = $2
           AND version_number = 1`,
        [resolved.company_id, template.id],
      )
    ).rows[0];
    if (!version) {
      throw new Error("Built-in attendance shift version could not be stored.");
    }
    return { templateId: template.id, templateVersionId: version.id };
  }
}

function normalizeInstance(
  row: AttendanceShiftInstanceRecord,
): AttendanceShiftInstanceRecord {
  return {
    ...row,
    scheduled_start_at: iso(row.scheduled_start_at),
    scheduled_end_at: iso(row.scheduled_end_at),
    eligibility_start_at: iso(row.eligibility_start_at),
    eligibility_end_at: iso(row.eligibility_end_at),
    generated_at: iso(row.generated_at),
    deleted_at: row.deleted_at ? iso(row.deleted_at) : null,
  };
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
