import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import type { UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, notFound } from "../../platform/errors.js";
import type {
  ShiftAssignmentCreateInput,
  ShiftAssignmentUpdateInput,
  ShiftTemplateCreateInput,
  ShiftTemplateUpdateInput,
  ShiftVersionInput,
} from "./shift-schemas.js";

export interface ShiftVersionRecord {
  id: UUID;
  company_id: UUID;
  template_id: UUID;
  version_number: number;
  effective_from: string;
  effective_until: string | null;
  local_start_time: string;
  local_end_time: string;
  end_day_offset: number;
  timezone_strategy: "company" | "employee_with_company_fallback" | "fixed";
  fixed_timezone: string | null;
  eligibility_open_before_start_minutes: number;
  eligibility_close_after_end_minutes: number;
  created_by_user_id: UUID | null;
  created_at: string;
}

export interface ShiftTemplateRecord {
  id: UUID;
  company_id: UUID;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  is_company_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  latest_version: ShiftVersionRecord | null;
}

export interface ShiftAssignmentRecord {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  template_id: UUID;
  effective_from: string;
  effective_until: string | null;
  status: "active" | "inactive";
  created_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

interface MemoryShiftState {
  templates: ShiftTemplateRecord[];
  versions: ShiftVersionRecord[];
  assignments: ShiftAssignmentRecord[];
}

const memoryShiftStates = new WeakMap<MemoryDataStore, MemoryShiftState>();

export class ShiftAdminRepository {
  constructor(private readonly store: MemoryDataStore) {}

  async listTemplates(companyId: UUID): Promise<ShiftTemplateRecord[]> {
    if (!this.store.pgPool) {
      const state = this.memoryState();
      return state.templates
        .filter(
          (template) =>
            template.company_id === companyId && !template.deleted_at,
        )
        .map((template) => ({
          ...template,
          latest_version: latestVersion(state.versions, template.id),
        }));
    }

    const result = await this.store.pgPool.query<ShiftTemplateRow>(
      `SELECT
         template.*,
         version.id AS latest_version_id,
         version.version_number AS latest_version_number,
         version.effective_from AS latest_effective_from,
         version.effective_until AS latest_effective_until,
         version.local_start_time AS latest_local_start_time,
         version.local_end_time AS latest_local_end_time,
         version.end_day_offset AS latest_end_day_offset,
         version.timezone_strategy AS latest_timezone_strategy,
         version.fixed_timezone AS latest_fixed_timezone,
         version.eligibility_open_before_start_minutes AS latest_open_before_minutes,
         version.eligibility_close_after_end_minutes AS latest_close_after_minutes,
         version.created_by_user_id AS latest_created_by_user_id,
         version.created_at AS latest_created_at
       FROM attendance.shift_templates template
       LEFT JOIN LATERAL (
         SELECT candidate.*
         FROM attendance.shift_template_versions candidate
         WHERE candidate.company_id = template.company_id
           AND candidate.template_id = template.id
         ORDER BY candidate.version_number DESC
         LIMIT 1
       ) version ON true
       WHERE template.company_id = $1
         AND template.deleted_at IS NULL
       ORDER BY template.is_company_default DESC, template.name, template.code`,
      [companyId],
    );
    return result.rows.map(presentTemplateRow);
  }

  async templateById(
    companyId: UUID,
    templateId: UUID,
  ): Promise<ShiftTemplateRecord> {
    const template = (await this.listTemplates(companyId)).find(
      (candidate) => candidate.id === templateId,
    );
    if (!template) {
      throw notFound("Shift template not found.", { template_id: templateId });
    }
    return template;
  }

  async createTemplate(
    companyId: UUID,
    actorUserId: UUID,
    input: ShiftTemplateCreateInput,
  ): Promise<ShiftTemplateRecord> {
    if (!this.store.pgPool) {
      return this.createTemplateInMemory(companyId, actorUserId, input);
    }

    return this.withTransaction(async (client) => {
      if (input.is_company_default) {
        await client.query(
          `UPDATE attendance.shift_templates
           SET is_company_default = false,
               updated_at = now(),
               version = version + 1
           WHERE company_id = $1
             AND is_company_default = true
             AND deleted_at IS NULL`,
          [companyId],
        );
      }
      const templateResult = await client.query<ShiftTemplateBaseRow>(
        `INSERT INTO attendance.shift_templates (
           company_id, code, name, description, status, is_company_default
         ) VALUES ($1, $2, $3, $4, 'active', $5)
         RETURNING *`,
        [
          companyId,
          input.code,
          input.name,
          input.description ?? null,
          input.is_company_default,
        ],
      );
      const template = templateResult.rows[0];
      if (!template)
        throw new Error("Shift template insert did not return a row.");
      const version = await this.insertVersion(
        client,
        companyId,
        template.id,
        actorUserId,
        1,
        input.version,
      );
      return { ...presentTemplateBaseRow(template), latest_version: version };
    });
  }

  async updateTemplate(
    companyId: UUID,
    templateId: UUID,
    input: ShiftTemplateUpdateInput,
  ): Promise<ShiftTemplateRecord> {
    if (!this.store.pgPool) {
      return this.updateTemplateInMemory(companyId, templateId, input);
    }

    return this.withTransaction(async (client) => {
      const current = await lockTemplate(client, companyId, templateId);
      if (current.version !== input.expected_version) {
        throw conflict("Shift template was modified by another actor.", {
          template_id: templateId,
          expected_version: input.expected_version,
          current_version: current.version,
        });
      }
      if (input.is_company_default) {
        await client.query(
          `UPDATE attendance.shift_templates
           SET is_company_default = false,
               updated_at = now(),
               version = version + 1
           WHERE company_id = $1
             AND id <> $2
             AND is_company_default = true
             AND deleted_at IS NULL`,
          [companyId, templateId],
        );
      }
      const result = await client.query<ShiftTemplateBaseRow>(
        `UPDATE attendance.shift_templates
         SET name = COALESCE($3, name),
             description = CASE WHEN $4::boolean THEN $5 ELSE description END,
             status = COALESCE($6, status),
             is_company_default = COALESCE($7, is_company_default),
             updated_at = now(),
             version = version + 1
         WHERE company_id = $1
           AND id = $2
           AND deleted_at IS NULL
         RETURNING *`,
        [
          companyId,
          templateId,
          input.name ?? null,
          Object.prototype.hasOwnProperty.call(input, "description"),
          input.description ?? null,
          input.status ?? null,
          input.is_company_default ?? null,
        ],
      );
      const updated = result.rows[0];
      if (!updated)
        throw notFound("Shift template not found.", {
          template_id: templateId,
        });
      const versions = await this.listVersionsWithClient(
        client,
        companyId,
        templateId,
      );
      return {
        ...presentTemplateBaseRow(updated),
        latest_version: versions[0] ?? null,
      };
    });
  }

  async listVersions(
    companyId: UUID,
    templateId: UUID,
  ): Promise<ShiftVersionRecord[]> {
    await this.templateById(companyId, templateId);
    if (!this.store.pgPool) {
      return this.memoryState()
        .versions.filter(
          (version) =>
            version.company_id === companyId &&
            version.template_id === templateId,
        )
        .sort((left, right) => right.version_number - left.version_number);
    }
    return this.listVersionsWithClient(
      this.store.pgPool,
      companyId,
      templateId,
    );
  }

  async createVersion(
    companyId: UUID,
    templateId: UUID,
    actorUserId: UUID,
    input: ShiftVersionInput,
  ): Promise<ShiftVersionRecord> {
    if (!this.store.pgPool) {
      const state = this.memoryState();
      const template = await this.templateById(companyId, templateId);
      if (template.status !== "active") {
        throw conflict("Cannot add a version to an inactive shift template.", {
          template_id: templateId,
        });
      }
      assertNoVersionOverlap(state.versions, templateId, input);
      const versionNumber =
        Math.max(
          0,
          ...state.versions
            .filter((version) => version.template_id === templateId)
            .map((version) => version.version_number),
        ) + 1;
      const version = buildVersion(
        companyId,
        templateId,
        actorUserId,
        versionNumber,
        input,
      );
      state.versions.push(version);
      return version;
    }

    return this.withTransaction(async (client) => {
      const template = await lockTemplate(client, companyId, templateId);
      if (template.status !== "active") {
        throw conflict("Cannot add a version to an inactive shift template.", {
          template_id: templateId,
        });
      }
      const numberResult = await client.query<{ version_number: number }>(
        `SELECT COALESCE(MAX(version_number), 0)::integer + 1 AS version_number
         FROM attendance.shift_template_versions
         WHERE company_id = $1 AND template_id = $2`,
        [companyId, templateId],
      );
      return this.insertVersion(
        client,
        companyId,
        templateId,
        actorUserId,
        numberResult.rows[0]?.version_number ?? 1,
        input,
      );
    });
  }

  async listAssignments(companyId: UUID): Promise<ShiftAssignmentRecord[]> {
    if (!this.store.pgPool) {
      return this.memoryState()
        .assignments.filter(
          (assignment) =>
            assignment.company_id === companyId && !assignment.deleted_at,
        )
        .sort((left, right) =>
          right.effective_from.localeCompare(left.effective_from),
        );
    }
    const result = await this.store.pgPool.query<ShiftAssignmentRow>(
      `SELECT *
       FROM attendance.shift_assignments
       WHERE company_id = $1
         AND deleted_at IS NULL
       ORDER BY effective_from DESC, created_at DESC`,
      [companyId],
    );
    return result.rows.map(presentAssignmentRow);
  }

  async createAssignments(
    companyId: UUID,
    actorUserId: UUID,
    employeeUserIds: UUID[],
    input: ShiftAssignmentCreateInput,
  ): Promise<ShiftAssignmentRecord[]> {
    const uniqueEmployeeIds = [...new Set(employeeUserIds)];
    if (!this.store.pgPool) {
      const state = this.memoryState();
      await this.templateById(companyId, input.template_id);
      for (const employeeUserId of uniqueEmployeeIds) {
        assertNoAssignmentOverlap(state.assignments, employeeUserId, input);
      }
      const created = uniqueEmployeeIds.map((employeeUserId) =>
        buildAssignment(companyId, employeeUserId, actorUserId, input),
      );
      state.assignments.push(...created);
      return created;
    }

    return this.withTransaction(async (client) => {
      const template = await lockTemplate(client, companyId, input.template_id);
      if (template.status !== "active") {
        throw conflict("Cannot assign an inactive shift template.", {
          template_id: input.template_id,
        });
      }
      const created: ShiftAssignmentRecord[] = [];
      for (const employeeUserId of uniqueEmployeeIds) {
        const result = await client.query<ShiftAssignmentRow>(
          `INSERT INTO attendance.shift_assignments (
             company_id,
             employee_user_id,
             template_id,
             effective_from,
             effective_until,
             status,
             created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
           RETURNING *`,
          [
            companyId,
            employeeUserId,
            input.template_id,
            input.effective_from,
            input.effective_until ?? null,
            actorUserId,
          ],
        );
        const assignment = result.rows[0];
        if (!assignment)
          throw new Error("Shift assignment insert did not return a row.");
        created.push(presentAssignmentRow(assignment));
      }
      return created;
    });
  }

  async updateAssignment(
    companyId: UUID,
    assignmentId: UUID,
    input: ShiftAssignmentUpdateInput,
  ): Promise<ShiftAssignmentRecord> {
    if (!this.store.pgPool) {
      return this.updateAssignmentInMemory(companyId, assignmentId, input);
    }

    return this.withTransaction(async (client) => {
      if (input.template_id) {
        const template = await lockTemplate(
          client,
          companyId,
          input.template_id,
        );
        if (template.status !== "active") {
          throw conflict("Cannot assign an inactive shift template.", {
            template_id: input.template_id,
          });
        }
      }
      const currentResult = await client.query<ShiftAssignmentRow>(
        `SELECT *
         FROM attendance.shift_assignments
         WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [companyId, assignmentId],
      );
      const current = currentResult.rows[0];
      if (!current)
        throw notFound("Shift assignment not found.", {
          assignment_id: assignmentId,
        });
      if (current.version !== input.expected_version) {
        throw conflict("Shift assignment was modified by another actor.", {
          assignment_id: assignmentId,
          expected_version: input.expected_version,
          current_version: current.version,
        });
      }
      const effectiveFrom =
        input.effective_from ?? asDate(current.effective_from);
      const effectiveUntil = Object.prototype.hasOwnProperty.call(
        input,
        "effective_until",
      )
        ? (input.effective_until ?? null)
        : nullableDate(current.effective_until);
      if (effectiveUntil && effectiveUntil < effectiveFrom) {
        throw badRequest(
          "Effective-until date cannot be before effective-from date.",
        );
      }
      const result = await client.query<ShiftAssignmentRow>(
        `UPDATE attendance.shift_assignments
         SET template_id = COALESCE($3, template_id),
             effective_from = $4,
             effective_until = $5,
             status = COALESCE($6, status),
             updated_at = now(),
             version = version + 1
         WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [
          companyId,
          assignmentId,
          input.template_id ?? null,
          effectiveFrom,
          effectiveUntil,
          input.status ?? null,
        ],
      );
      const updated = result.rows[0];
      if (!updated)
        throw notFound("Shift assignment not found.", {
          assignment_id: assignmentId,
        });
      return presentAssignmentRow(updated);
    });
  }

  private memoryState(): MemoryShiftState {
    const existing = memoryShiftStates.get(this.store);
    if (existing) return existing;
    const state: MemoryShiftState = {
      templates: [],
      versions: [],
      assignments: [],
    };
    memoryShiftStates.set(this.store, state);
    return state;
  }

  private createTemplateInMemory(
    companyId: UUID,
    actorUserId: UUID,
    input: ShiftTemplateCreateInput,
  ): ShiftTemplateRecord {
    const state = this.memoryState();
    if (
      state.templates.some(
        (template) =>
          template.company_id === companyId &&
          !template.deleted_at &&
          template.code.toLowerCase() === input.code.toLowerCase(),
      )
    ) {
      throw conflict("Shift template code already exists.", {
        code: input.code,
      });
    }
    if (input.is_company_default) {
      for (const template of state.templates) {
        if (template.company_id === companyId && template.is_company_default) {
          template.is_company_default = false;
          template.updated_at = nowIso();
          template.version += 1;
        }
      }
    }
    const createdAt = nowIso();
    const templateId = randomUUID();
    const version = buildVersion(
      companyId,
      templateId,
      actorUserId,
      1,
      input.version,
    );
    const template: ShiftTemplateRecord = {
      id: templateId,
      company_id: companyId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      status: "active",
      is_company_default: input.is_company_default,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
      version: 1,
      latest_version: version,
    };
    state.templates.push(template);
    state.versions.push(version);
    return template;
  }

  private updateTemplateInMemory(
    companyId: UUID,
    templateId: UUID,
    input: ShiftTemplateUpdateInput,
  ): ShiftTemplateRecord {
    const state = this.memoryState();
    const template = state.templates.find(
      (candidate) =>
        candidate.company_id === companyId &&
        candidate.id === templateId &&
        !candidate.deleted_at,
    );
    if (!template)
      throw notFound("Shift template not found.", { template_id: templateId });
    if (template.version !== input.expected_version) {
      throw conflict("Shift template was modified by another actor.", {
        template_id: templateId,
        expected_version: input.expected_version,
        current_version: template.version,
      });
    }
    if (input.is_company_default) {
      for (const candidate of state.templates) {
        if (
          candidate.company_id === companyId &&
          candidate.id !== templateId &&
          candidate.is_company_default
        ) {
          candidate.is_company_default = false;
          candidate.updated_at = nowIso();
          candidate.version += 1;
        }
      }
    }
    if (input.name !== undefined) template.name = input.name;
    if (Object.prototype.hasOwnProperty.call(input, "description")) {
      template.description = input.description ?? null;
    }
    if (input.status !== undefined) template.status = input.status;
    if (input.is_company_default !== undefined) {
      template.is_company_default = input.is_company_default;
    }
    template.updated_at = nowIso();
    template.version += 1;
    template.latest_version = latestVersion(state.versions, template.id);
    return { ...template };
  }

  private updateAssignmentInMemory(
    companyId: UUID,
    assignmentId: UUID,
    input: ShiftAssignmentUpdateInput,
  ): ShiftAssignmentRecord {
    const state = this.memoryState();
    const assignment = state.assignments.find(
      (candidate) =>
        candidate.company_id === companyId &&
        candidate.id === assignmentId &&
        !candidate.deleted_at,
    );
    if (!assignment) {
      throw notFound("Shift assignment not found.", {
        assignment_id: assignmentId,
      });
    }
    if (assignment.version !== input.expected_version) {
      throw conflict("Shift assignment was modified by another actor.", {
        assignment_id: assignmentId,
        expected_version: input.expected_version,
        current_version: assignment.version,
      });
    }
    const effectiveFrom = input.effective_from ?? assignment.effective_from;
    const effectiveUntil = Object.prototype.hasOwnProperty.call(
      input,
      "effective_until",
    )
      ? (input.effective_until ?? null)
      : assignment.effective_until;
    if (effectiveUntil && effectiveUntil < effectiveFrom) {
      throw badRequest(
        "Effective-until date cannot be before effective-from date.",
      );
    }
    const next = {
      ...assignment,
      template_id: input.template_id ?? assignment.template_id,
      effective_from: effectiveFrom,
      effective_until: effectiveUntil,
      status: input.status ?? assignment.status,
    };
    if (next.status === "active") {
      assertNoAssignmentOverlap(
        state.assignments,
        next.employee_user_id,
        next,
        next.id,
      );
    }
    Object.assign(assignment, next, {
      updated_at: nowIso(),
      version: assignment.version + 1,
    });
    return { ...assignment };
  }

  private async listVersionsWithClient(
    client: Pick<PoolClient, "query">,
    companyId: UUID,
    templateId: UUID,
  ): Promise<ShiftVersionRecord[]> {
    const result = await client.query<ShiftVersionRow>(
      `SELECT *
       FROM attendance.shift_template_versions
       WHERE company_id = $1 AND template_id = $2
       ORDER BY version_number DESC`,
      [companyId, templateId],
    );
    return result.rows.map(presentVersionRow);
  }

  private async insertVersion(
    client: PoolClient,
    companyId: UUID,
    templateId: UUID,
    actorUserId: UUID,
    versionNumber: number,
    input: ShiftVersionInput,
  ): Promise<ShiftVersionRecord> {
    const result = await client.query<ShiftVersionRow>(
      `INSERT INTO attendance.shift_template_versions (
         company_id,
         template_id,
         version_number,
         effective_from,
         effective_until,
         local_start_time,
         local_end_time,
         end_day_offset,
         timezone_strategy,
         fixed_timezone,
         eligibility_open_before_start_minutes,
         eligibility_close_after_end_minutes,
         created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        companyId,
        templateId,
        versionNumber,
        input.effective_from,
        input.effective_until ?? null,
        input.local_start_time,
        input.local_end_time,
        input.crosses_midnight ? 1 : 0,
        input.timezone_strategy,
        input.timezone_strategy === "fixed" ? input.fixed_timezone : null,
        input.eligibility_open_before_start_minutes,
        input.eligibility_close_after_end_minutes,
        actorUserId,
      ],
    );
    const version = result.rows[0];
    if (!version)
      throw new Error("Shift template version insert did not return a row.");
    return presentVersionRow(version);
  }

  private async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const pool = this.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool is unavailable.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapShiftDatabaseError(error);
    } finally {
      client.release();
    }
  }
}

interface ShiftTemplateBaseRow extends QueryResultRow {
  id: UUID;
  company_id: UUID;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  is_company_default: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
  version: number;
}

interface ShiftTemplateRow extends ShiftTemplateBaseRow {
  latest_version_id: UUID | null;
  latest_version_number: number | null;
  latest_effective_from: string | Date | null;
  latest_effective_until: string | Date | null;
  latest_local_start_time: string | null;
  latest_local_end_time: string | null;
  latest_end_day_offset: number | null;
  latest_timezone_strategy:
    | "company"
    | "employee_with_company_fallback"
    | "fixed"
    | null;
  latest_fixed_timezone: string | null;
  latest_open_before_minutes: number | null;
  latest_close_after_minutes: number | null;
  latest_created_by_user_id: UUID | null;
  latest_created_at: string | Date | null;
}

interface ShiftVersionRow extends QueryResultRow {
  id: UUID;
  company_id: UUID;
  template_id: UUID;
  version_number: number;
  effective_from: string | Date;
  effective_until: string | Date | null;
  local_start_time: string;
  local_end_time: string;
  end_day_offset: number;
  timezone_strategy: "company" | "employee_with_company_fallback" | "fixed";
  fixed_timezone: string | null;
  eligibility_open_before_start_minutes: number;
  eligibility_close_after_end_minutes: number;
  created_by_user_id: UUID | null;
  created_at: string | Date;
}

interface ShiftAssignmentRow extends QueryResultRow {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  template_id: UUID;
  effective_from: string | Date;
  effective_until: string | Date | null;
  status: "active" | "inactive";
  created_by_user_id: UUID | null;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
  version: number;
}

function presentTemplateBaseRow(
  row: ShiftTemplateBaseRow,
): Omit<ShiftTemplateRecord, "latest_version"> {
  return {
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    is_company_default: row.is_company_default,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    deleted_at: nullableIso(row.deleted_at),
    version: row.version,
  };
}

function presentTemplateRow(row: ShiftTemplateRow): ShiftTemplateRecord {
  const template = presentTemplateBaseRow(row);
  if (!row.latest_version_id || !row.latest_version_number) {
    return { ...template, latest_version: null };
  }
  return {
    ...template,
    latest_version: {
      id: row.latest_version_id,
      company_id: row.company_id,
      template_id: row.id,
      version_number: row.latest_version_number,
      effective_from: asDate(row.latest_effective_from),
      effective_until: nullableDate(row.latest_effective_until),
      local_start_time: asTime(row.latest_local_start_time),
      local_end_time: asTime(row.latest_local_end_time),
      end_day_offset: row.latest_end_day_offset ?? 0,
      timezone_strategy: row.latest_timezone_strategy ?? "company",
      fixed_timezone: row.latest_fixed_timezone,
      eligibility_open_before_start_minutes:
        row.latest_open_before_minutes ?? 120,
      eligibility_close_after_end_minutes:
        row.latest_close_after_minutes ?? 240,
      created_by_user_id: row.latest_created_by_user_id,
      created_at: asIso(row.latest_created_at),
    },
  };
}

function presentVersionRow(row: ShiftVersionRow): ShiftVersionRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    template_id: row.template_id,
    version_number: row.version_number,
    effective_from: asDate(row.effective_from),
    effective_until: nullableDate(row.effective_until),
    local_start_time: asTime(row.local_start_time),
    local_end_time: asTime(row.local_end_time),
    end_day_offset: row.end_day_offset,
    timezone_strategy: row.timezone_strategy,
    fixed_timezone: row.fixed_timezone,
    eligibility_open_before_start_minutes:
      row.eligibility_open_before_start_minutes,
    eligibility_close_after_end_minutes:
      row.eligibility_close_after_end_minutes,
    created_by_user_id: row.created_by_user_id,
    created_at: asIso(row.created_at),
  };
}

function presentAssignmentRow(row: ShiftAssignmentRow): ShiftAssignmentRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    employee_user_id: row.employee_user_id,
    template_id: row.template_id,
    effective_from: asDate(row.effective_from),
    effective_until: nullableDate(row.effective_until),
    status: row.status,
    created_by_user_id: row.created_by_user_id,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    deleted_at: nullableIso(row.deleted_at),
    version: row.version,
  };
}

async function lockTemplate(
  client: PoolClient,
  companyId: UUID,
  templateId: UUID,
): Promise<ShiftTemplateBaseRow> {
  const result = await client.query<ShiftTemplateBaseRow>(
    `SELECT *
     FROM attendance.shift_templates
     WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL
     FOR UPDATE`,
    [companyId, templateId],
  );
  const template = result.rows[0];
  if (!template)
    throw notFound("Shift template not found.", { template_id: templateId });
  return template;
}

function buildVersion(
  companyId: UUID,
  templateId: UUID,
  actorUserId: UUID,
  versionNumber: number,
  input: ShiftVersionInput,
): ShiftVersionRecord {
  return {
    id: randomUUID(),
    company_id: companyId,
    template_id: templateId,
    version_number: versionNumber,
    effective_from: input.effective_from,
    effective_until: input.effective_until ?? null,
    local_start_time: input.local_start_time,
    local_end_time: input.local_end_time,
    end_day_offset: input.crosses_midnight ? 1 : 0,
    timezone_strategy: input.timezone_strategy,
    fixed_timezone:
      input.timezone_strategy === "fixed"
        ? (input.fixed_timezone ?? null)
        : null,
    eligibility_open_before_start_minutes:
      input.eligibility_open_before_start_minutes,
    eligibility_close_after_end_minutes:
      input.eligibility_close_after_end_minutes,
    created_by_user_id: actorUserId,
    created_at: nowIso(),
  };
}

function buildAssignment(
  companyId: UUID,
  employeeUserId: UUID,
  actorUserId: UUID,
  input: ShiftAssignmentCreateInput,
): ShiftAssignmentRecord {
  const createdAt = nowIso();
  return {
    id: randomUUID(),
    company_id: companyId,
    employee_user_id: employeeUserId,
    template_id: input.template_id,
    effective_from: input.effective_from,
    effective_until: input.effective_until ?? null,
    status: "active",
    created_by_user_id: actorUserId,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    version: 1,
  };
}

function latestVersion(
  versions: ShiftVersionRecord[],
  templateId: UUID,
): ShiftVersionRecord | null {
  return (
    versions
      .filter((version) => version.template_id === templateId)
      .sort((left, right) => right.version_number - left.version_number)[0] ??
    null
  );
}

function assertNoVersionOverlap(
  versions: ShiftVersionRecord[],
  templateId: UUID,
  input: Pick<ShiftVersionInput, "effective_from" | "effective_until">,
): void {
  const overlaps = versions.some(
    (version) =>
      version.template_id === templateId &&
      rangesOverlap(
        input.effective_from,
        input.effective_until ?? null,
        version.effective_from,
        version.effective_until,
      ),
  );
  if (overlaps) {
    throw conflict(
      "Shift template version dates overlap an existing version.",
      {
        template_id: templateId,
        reason_code: "overlapping_shift_template_versions",
      },
    );
  }
}

function assertNoAssignmentOverlap(
  assignments: ShiftAssignmentRecord[],
  employeeUserId: UUID,
  input: Pick<
    ShiftAssignmentCreateInput,
    "effective_from" | "effective_until"
  > & {
    status?: "active" | "inactive";
  },
  excludeId?: UUID,
): void {
  if (input.status === "inactive") return;
  const overlaps = assignments.some(
    (assignment) =>
      assignment.id !== excludeId &&
      assignment.employee_user_id === employeeUserId &&
      assignment.status === "active" &&
      !assignment.deleted_at &&
      rangesOverlap(
        input.effective_from,
        input.effective_until ?? null,
        assignment.effective_from,
        assignment.effective_until,
      ),
  );
  if (overlaps) {
    throw conflict(
      "Employee already has an active shift assignment in this date range.",
      {
        employee_user_id: employeeUserId,
        reason_code: "overlapping_active_shift_assignments",
      },
    );
  }
}

function rangesOverlap(
  leftStart: string,
  leftEnd: string | null,
  rightStart: string,
  rightEnd: string | null,
): boolean {
  return (
    leftStart <= (rightEnd ?? "9999-12-31") &&
    (leftEnd ?? "9999-12-31") >= rightStart
  );
}

function mapShiftDatabaseError(error: unknown): unknown {
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError.code === "23505") {
    if (
      databaseError.constraint === "attendance_shift_templates_company_code_uq"
    ) {
      return conflict("Shift template code already exists.");
    }
    if (
      databaseError.constraint === "attendance_shift_templates_one_default_idx"
    ) {
      return conflict("Only one active company-default shift is allowed.");
    }
  }
  if (databaseError.code === "23514") {
    if (databaseError.constraint === "attendance_shift_versions_no_overlap") {
      return conflict(
        "Shift template version dates overlap an existing version.",
        {
          reason_code: "overlapping_shift_template_versions",
        },
      );
    }
    if (
      databaseError.constraint ===
      "attendance_shift_assignments_no_active_overlap"
    ) {
      return conflict(
        "Employee already has an active shift assignment in this date range.",
        {
          reason_code: "overlapping_active_shift_assignments",
        },
      );
    }
  }
  if (databaseError.code === "23503") {
    return badRequest(
      "Shift configuration references an unavailable employee or template.",
    );
  }
  return error;
}

function asDate(value: string | Date | null): string {
  if (!value) return "";
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function nullableDate(value: string | Date | null): string | null {
  return value ? asDate(value) : null;
}

function asTime(value: string | null): string {
  return value ? String(value).slice(0, 5) : "";
}

function asIso(value: string | Date | null): string {
  if (!value) return nowIso();
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: string | Date | null): string | null {
  return value ? asIso(value) : null;
}
