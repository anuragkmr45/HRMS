import type { AuthUser, CoreUser, UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { badRequest, notFound } from "../../platform/errors.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { assertCanManageAdminSettings } from "./policy.js";
import {
  ShiftAdminRepository,
  type ShiftAssignmentRecord,
  type ShiftTemplateRecord,
  type ShiftVersionRecord,
} from "./shift-repository.js";
import type {
  ShiftAssignmentCreateInput,
  ShiftAssignmentQuery,
  ShiftAssignmentUpdateInput,
  ShiftTemplateCreateInput,
  ShiftTemplateQuery,
  ShiftTemplateUpdateInput,
  ShiftVersionInput,
} from "./shift-schemas.js";

export class ShiftAdminService {
  private readonly repository: ShiftAdminRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new ShiftAdminRepository(store);
  }

  async listTemplates(actor: AuthUser, query: ShiftTemplateQuery) {
    assertCanManageAdminSettings(actor);
    const companyId = this.companyIdForActor(actor);
    const search = query.search?.toLowerCase();
    const items = (await this.repository.listTemplates(companyId))
      .filter((template) => !query.status || template.status === query.status)
      .filter(
        (template) =>
          !search ||
          template.name.toLowerCase().includes(search) ||
          template.code.toLowerCase().includes(search),
      )
      .map(presentTemplate);
    return { items, total: items.length };
  }

  async createTemplate(actor: AuthUser, input: ShiftTemplateCreateInput) {
    assertCanManageAdminSettings(actor);
    this.validateVersion(input.version);
    const companyId = this.companyIdForActor(actor);
    const template = await this.repository.createTemplate(companyId, actor.id, {
      ...input,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
    });
    this.appendEvent(
      actor,
      template.id,
      "admin.shift_template.created",
      {
        template_id: template.id,
        template_code: template.code,
        version_number: template.latest_version?.version_number ?? 1,
      },
      template.version,
    );
    return { template: presentTemplate(template), version: template.version };
  }

  async updateTemplate(
    actor: AuthUser,
    templateId: UUID,
    input: ShiftTemplateUpdateInput,
  ) {
    assertCanManageAdminSettings(actor);
    const companyId = this.companyIdForActor(actor);
    const descriptionPatch = Object.prototype.hasOwnProperty.call(
      input,
      "description",
    )
      ? { description: input.description?.trim() || null }
      : {};
    const template = await this.repository.updateTemplate(
      companyId,
      templateId,
      {
        ...input,
        ...(input.status === "inactive" ? { is_company_default: false } : {}),
        name: input.name?.trim(),
        ...descriptionPatch,
      },
    );
    this.appendEvent(
      actor,
      template.id,
      "admin.shift_template.updated",
      {
        template_id: template.id,
        template_code: template.code,
        changed_fields: Object.keys(input).filter(
          (field) => field !== "expected_version",
        ),
      },
      template.version,
    );
    return { template: presentTemplate(template), version: template.version };
  }

  async listVersions(actor: AuthUser, templateId: UUID) {
    assertCanManageAdminSettings(actor);
    const companyId = this.companyIdForActor(actor);
    const template = await this.repository.templateById(companyId, templateId);
    const items = (
      await this.repository.listVersions(companyId, templateId)
    ).map(presentVersion);
    return {
      template: presentTemplate(template),
      items,
      total: items.length,
    };
  }

  async createVersion(
    actor: AuthUser,
    templateId: UUID,
    input: ShiftVersionInput,
  ) {
    assertCanManageAdminSettings(actor);
    this.validateVersion(input);
    const companyId = this.companyIdForActor(actor);
    const version = await this.repository.createVersion(
      companyId,
      templateId,
      actor.id,
      input,
    );
    this.appendEvent(
      actor,
      templateId,
      "admin.shift_template.version_created",
      {
        template_id: templateId,
        shift_version_id: version.id,
        version_number: version.version_number,
        effective_from: version.effective_from,
      },
      version.version_number,
    );
    return { version: presentVersion(version) };
  }

  async listAssignments(actor: AuthUser, query: ShiftAssignmentQuery) {
    assertCanManageAdminSettings(actor);
    const companyId = this.companyIdForActor(actor);
    const templates = await this.repository.listTemplates(companyId);
    const templateById = new Map(
      templates.map((template) => [template.id, template]),
    );
    const search = query.search?.toLowerCase();
    const items = (await this.repository.listAssignments(companyId))
      .map((assignment) =>
        this.presentAssignment(
          assignment,
          templateById.get(assignment.template_id),
        ),
      )
      .filter(
        (assignment) => !query.status || assignment.status === query.status,
      )
      .filter(
        (assignment) =>
          !query.template_id || assignment.template_id === query.template_id,
      )
      .filter(
        (assignment) =>
          !query.department_id ||
          assignment.department_id === query.department_id,
      )
      .filter(
        (assignment) =>
          !search ||
          assignment.employee_name.toLowerCase().includes(search) ||
          assignment.employee_code.toLowerCase().includes(search) ||
          assignment.template_name.toLowerCase().includes(search),
      );
    return { items, total: items.length };
  }

  async createAssignments(actor: AuthUser, input: ShiftAssignmentCreateInput) {
    assertCanManageAdminSettings(actor);
    const companyId = this.companyIdForActor(actor);
    const template = await this.repository.templateById(
      companyId,
      input.template_id,
    );
    if (template.status !== "active") {
      throw badRequest("Assignments require an active shift template.", {
        template_id: input.template_id,
      });
    }
    const targets = this.resolveAssignmentTargets(companyId, input);
    const assignments = await this.repository.createAssignments(
      companyId,
      actor.id,
      targets.map((target) => target.id),
      input,
    );
    const templateById = new Map([[template.id, template]]);
    for (const assignment of assignments) {
      this.appendEvent(
        actor,
        assignment.id,
        "admin.shift_assignment.created",
        {
          assignment_id: assignment.id,
          employee_user_id: assignment.employee_user_id,
          template_id: assignment.template_id,
          target_type: input.target_type,
          target_id: input.target_id,
        },
        assignment.version,
      );
    }
    return {
      items: assignments.map((assignment) =>
        this.presentAssignment(
          assignment,
          templateById.get(assignment.template_id),
        ),
      ),
      created_count: assignments.length,
      target_type: input.target_type,
      target_id: input.target_id,
    };
  }

  async updateAssignment(
    actor: AuthUser,
    assignmentId: UUID,
    input: ShiftAssignmentUpdateInput,
  ) {
    assertCanManageAdminSettings(actor);
    const companyId = this.companyIdForActor(actor);
    if (input.template_id) {
      const template = await this.repository.templateById(
        companyId,
        input.template_id,
      );
      if (template.status !== "active") {
        throw badRequest("Assignments require an active shift template.", {
          template_id: input.template_id,
        });
      }
    }
    const assignment = await this.repository.updateAssignment(
      companyId,
      assignmentId,
      input,
    );
    const template = await this.repository.templateById(
      companyId,
      assignment.template_id,
    );
    this.appendEvent(
      actor,
      assignment.id,
      "admin.shift_assignment.updated",
      {
        assignment_id: assignment.id,
        employee_user_id: assignment.employee_user_id,
        template_id: assignment.template_id,
        changed_fields: Object.keys(input).filter(
          (field) => field !== "expected_version",
        ),
      },
      assignment.version,
    );
    return {
      assignment: this.presentAssignment(assignment, template),
      version: assignment.version,
    };
  }

  references(actor: AuthUser) {
    assertCanManageAdminSettings(actor);
    const companyId = this.companyIdForActor(actor);
    const employees = this.activeCompanyUsers(companyId)
      .sort((left, right) => left.full_name.localeCompare(right.full_name))
      .map((user) => ({
        id: user.id,
        employee_code: user.employee_code,
        name: user.full_name,
        department_id: user.department_id,
      }));
    const departments = this.store.departments
      .filter(
        (department) =>
          (department.company_id === companyId ||
            department.company_id === null) &&
          department.status === "active" &&
          !department.deleted_at,
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((department) => ({
        id: department.id,
        code: department.department_code,
        name: department.name,
        employee_count: employees.filter(
          (employee) => employee.department_id === department.id,
        ).length,
      }));
    return { employees, departments };
  }

  private companyIdForActor(actor: AuthUser): UUID {
    const preference = this.store.userSessionPreferences.find(
      (candidate) => candidate.user_id === actor.id && candidate.company_id,
    );
    const companyId =
      preference?.company_id ??
      this.store.companyProfiles.find((company) => company.status === "active")
        ?.id;
    if (!companyId) {
      throw badRequest(
        "An active company context is required to manage shifts.",
      );
    }
    return companyId;
  }

  private activeCompanyUsers(companyId: UUID): CoreUser[] {
    const companyUserIds = new Set(
      this.store.userSessionPreferences
        .filter((preference) => preference.company_id === companyId)
        .map((preference) => preference.user_id),
    );
    return this.store.users.filter(
      (user) =>
        user.employment_status === "active" &&
        !user.deleted_at &&
        (companyUserIds.size === 0 || companyUserIds.has(user.id)),
    );
  }

  private resolveAssignmentTargets(
    companyId: UUID,
    input: ShiftAssignmentCreateInput,
  ): CoreUser[] {
    const users = this.activeCompanyUsers(companyId);
    if (input.target_type === "employee") {
      const employee = users.find(
        (candidate) => candidate.id === input.target_id,
      );
      if (!employee) {
        throw notFound("Active employee not found in the current company.", {
          employee_user_id: input.target_id,
        });
      }
      return [employee];
    }

    const department = this.store.departments.find(
      (candidate) =>
        candidate.id === input.target_id &&
        (candidate.company_id === companyId || candidate.company_id === null) &&
        candidate.status === "active" &&
        !candidate.deleted_at,
    );
    if (!department) {
      throw notFound("Active department not found in the current company.", {
        department_id: input.target_id,
      });
    }
    const departmentUsers = users.filter(
      (candidate) => candidate.department_id === department.id,
    );
    if (departmentUsers.length === 0) {
      throw badRequest("The selected department has no active employees.", {
        department_id: department.id,
      });
    }
    return departmentUsers;
  }

  private presentAssignment(
    assignment: ShiftAssignmentRecord,
    template: ShiftTemplateRecord | undefined,
  ) {
    const user = this.store.users.find(
      (candidate) => candidate.id === assignment.employee_user_id,
    );
    const department = user
      ? this.store.departments.find(
          (candidate) => candidate.id === user.department_id,
        )
      : undefined;
    return {
      ...assignment,
      employee_name: user?.full_name ?? "Unknown employee",
      employee_code: user?.employee_code ?? "Unknown",
      department_id: department?.id ?? null,
      department_name: department?.name ?? null,
      template_code: template?.code ?? "Unknown",
      template_name: template?.name ?? "Unknown shift",
    };
  }

  private validateVersion(input: ShiftVersionInput): void {
    if (input.crosses_midnight) {
      if (input.local_end_time >= input.local_start_time) {
        throw badRequest(
          "A cross-midnight shift must end earlier than it starts.",
        );
      }
    } else if (input.local_end_time <= input.local_start_time) {
      throw badRequest("End time must be after start time.");
    }
    if (input.timezone_strategy === "fixed" && input.fixed_timezone) {
      try {
        new Intl.DateTimeFormat("en", {
          timeZone: input.fixed_timezone,
        }).format();
      } catch {
        throw badRequest("Fixed timezone must be a valid IANA timezone.", {
          fixed_timezone: input.fixed_timezone,
        });
      }
    }
  }

  private appendEvent(
    actor: AuthUser,
    aggregateId: UUID,
    eventType: string,
    payload: Record<string, unknown>,
    version: number,
  ): void {
    appendOutboxEvent(this.store, {
      aggregateType: eventType.includes("assignment")
        ? "attendance_shift_assignment"
        : "attendance_shift_template",
      aggregateId,
      eventType,
      payload: {
        actor_user_id: actor.id,
        ...payload,
      },
      idempotencyKey: `${eventType}:${aggregateId}:${version}`,
    });
  }
}

function presentTemplate(template: ShiftTemplateRecord) {
  return {
    ...template,
    latest_version: template.latest_version
      ? presentVersion(template.latest_version)
      : null,
  };
}

function presentVersion(version: ShiftVersionRecord) {
  return {
    ...version,
    crosses_midnight: version.end_day_offset > 0,
  };
}
