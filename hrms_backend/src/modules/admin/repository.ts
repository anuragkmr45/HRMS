import { randomUUID } from "node:crypto";
import type { Department, Designation, AdminEmailTemplateRecord, AdminNotificationChannelRecord, AdminPolicyConfigRecord, AdminSecuritySettingsRecord, AdminWorkflowConfigRecord, RbacRolePermissionRecord, RbacRoleRecord } from "#shared";
import type { AdminMasterDataItemRecord, CompanyProfileRecord, MemoryDataStore } from "../../platform/data-store.js";
import { buildDefaultAdminEmailTemplates, buildDefaultAdminMasterDataItems, buildDefaultAdminNotificationChannels, buildDefaultAdminPolicies, buildDefaultAdminWorkflows, nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, notFound } from "../../platform/errors.js";
import type {
  CompanyProfileUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
  DesignationCreateInput,
  DesignationUpdateInput,
  ExtendedMasterDataCreateInput,
  ExtendedMasterDataKey,
  ExtendedMasterDataUpdateInput,
  AdminSecuritySettingsUpdateInput,
  RbacRoleCreateInput,
  RbacRolePermissionsReplaceInput,
  RbacRoleUpdateInput
} from "./schemas.js";

export class AdminRepository {
  constructor(private readonly store: MemoryDataStore) {}

  listAdminWorkflows(): AdminWorkflowConfigRecord[] {
    this.ensureAdminWorkflows();
    return this.store.adminWorkflows.filter((workflow) => !workflow.deleted_at);
  }

  listAdminPolicies(companyId: string | null): AdminPolicyConfigRecord[] {
    this.ensureAdminPolicies(companyId);
    return this.store.adminPolicies.filter((policy) => policy.company_id === companyId && !policy.deleted_at);
  }

  listAdminEmailTemplates(): AdminEmailTemplateRecord[] {
    this.ensureAdminEmailTemplates();
    return this.store.adminEmailTemplates.filter((template) => !template.deleted_at);
  }

  listAdminNotificationChannels(): AdminNotificationChannelRecord[] {
    this.ensureAdminNotificationChannels();
    return this.store.adminNotificationChannels.filter((channel) => !channel.deleted_at);
  }

  getAdminSecuritySettings(): AdminSecuritySettingsRecord {
    return this.store.adminSecuritySettings;
  }

  adminWorkflowByKey(workflowKey: string): AdminWorkflowConfigRecord {
    this.ensureAdminWorkflows();
    const workflow = this.store.adminWorkflows.find((candidate) => candidate.workflow_key === workflowKey && !candidate.deleted_at);
    if (!workflow) throw notFound("Admin workflow configuration not found", { workflow_key: workflowKey });
    return workflow;
  }

  adminPolicyByKey(policyKey: string, companyId: string | null): AdminPolicyConfigRecord {
    this.ensureAdminPolicies(companyId);
    const policy = this.store.adminPolicies.find((candidate) => candidate.company_id === companyId && candidate.policy_key === policyKey && !candidate.deleted_at);
    if (!policy) throw notFound("Admin policy configuration not found", { policy_key: policyKey });
    return policy;
  }

  adminEmailTemplateByKey(templateKey: string): AdminEmailTemplateRecord {
    this.ensureAdminEmailTemplates();
    const template = this.store.adminEmailTemplates.find((candidate) => candidate.template_key === templateKey && !candidate.deleted_at);
    if (!template) throw notFound("Admin email template not found", { template_key: templateKey });
    return template;
  }

  adminNotificationChannelByKey(eventKey: string): AdminNotificationChannelRecord {
    this.ensureAdminNotificationChannels();
    const channel = this.store.adminNotificationChannels.find((candidate) => candidate.event_key === eventKey && !candidate.deleted_at);
    if (!channel) throw notFound("Admin notification channel not found", { event_key: eventKey });
    return channel;
  }

  updateAdminWorkflow(workflowKey: string, input: AdminWorkflowUpdateData): AdminWorkflowConfigRecord {
    const workflow = this.adminWorkflowByKey(workflowKey);
    if (workflow.version !== input.expected_version) {
      throw conflict("Admin workflow configuration was modified by another actor.", {
        aggregate: "admin_workflow",
        workflow_key: workflowKey,
        expected_version: input.expected_version,
        current_version: workflow.version
      });
    }
    if (input.label) workflow.label = input.label.trim();
    if (input.status) workflow.status = input.status;
    if (input.stages) workflow.stages = input.stages;
    workflow.updated_at = nowIso();
    workflow.version += 1;
    return workflow;
  }

  updateAdminPolicy(policyKey: string, companyId: string | null, input: AdminPolicyUpdateData): AdminPolicyConfigRecord {
    const policy = this.adminPolicyByKey(policyKey, companyId);
    if (policy.version !== input.expected_version) {
      throw conflict("Admin policy configuration was modified by another actor.", {
        aggregate: "admin_policy",
        policy_key: policyKey,
        expected_version: input.expected_version,
        current_version: policy.version
      });
    }
    if (input.label) policy.label = input.label.trim();
    if (input.status) policy.status = input.status;
    if (input.config) policy.config = input.config;
    policy.updated_at = nowIso();
    policy.version += 1;
    return policy;
  }

  updateAdminEmailTemplate(templateKey: string, input: AdminEmailTemplateUpdateData): AdminEmailTemplateRecord {
    const template = this.adminEmailTemplateByKey(templateKey);
    if (template.version !== input.expected_version) {
      throw conflict("Admin email template was modified by another actor.", {
        aggregate: "admin_email_template",
        template_key: templateKey,
        expected_version: input.expected_version,
        current_version: template.version
      });
    }
    if (input.name) template.name = input.name.trim();
    if (input.subject) template.subject = input.subject.trim();
    if (input.body) template.body = input.body.trim();
    if (input.locale) template.locale = input.locale.trim();
    if (input.status) template.status = input.status;
    template.updated_at = nowIso();
    template.version += 1;
    return template;
  }

  updateAdminNotificationChannels(input: AdminNotificationChannelUpdateData): AdminNotificationChannelRecord[] {
    this.ensureAdminNotificationChannels();
    const currentVersion = maxAdminNotificationChannelVersion(this.store.adminNotificationChannels);
    if (currentVersion !== input.expected_version) {
      throw conflict("Admin notification channels were modified by another actor.", {
        aggregate: "admin_notification_channels",
        expected_version: input.expected_version,
        current_version: currentVersion
      });
    }
    const now = nowIso();
    for (const patch of input.channels) {
      const channel = this.adminNotificationChannelByKey(patch.event_key);
      if (patch.label) channel.label = patch.label.trim();
      if (patch.in_app_enabled !== undefined) channel.in_app_enabled = patch.in_app_enabled;
      if (patch.email_enabled !== undefined) channel.email_enabled = patch.email_enabled;
      if (patch.push_enabled !== undefined) channel.push_enabled = patch.push_enabled;
      if (patch.status) channel.status = patch.status;
      channel.updated_at = now;
      channel.version += 1;
    }
    return this.listAdminNotificationChannels();
  }

  updateAdminSecuritySettings(input: AdminSecuritySettingsUpdateInput): AdminSecuritySettingsRecord {
    const settings = this.getAdminSecuritySettings();
    if (settings.version !== input.expected_version) {
      throw conflict("Admin security settings were modified by another actor.", {
        aggregate: "admin_security_settings",
        expected_version: input.expected_version,
        current_version: settings.version
      });
    }
    settings.password_min_length = input.password_min_length ?? input.passwordMinLength ?? settings.password_min_length;
    settings.password_require_special = input.password_require_special ?? input.passwordRequireSpecial ?? settings.password_require_special;
    settings.password_require_number = input.password_require_number ?? input.passwordRequireNumber ?? settings.password_require_number;
    settings.password_expiry_days = input.password_expiry_days ?? input.passwordExpiryDays ?? settings.password_expiry_days;
    settings.session_timeout_minutes = input.session_timeout_minutes ?? input.sessionTimeoutMinutes ?? settings.session_timeout_minutes;
    settings.login_attempt_limit = input.login_attempt_limit ?? input.loginAttemptLimit ?? settings.login_attempt_limit;
    settings.mfa_enabled = false;
    settings.audit_role_changes = input.audit_role_changes ?? input.auditRoleChanges ?? settings.audit_role_changes;
    settings.ip_device_audit_enabled = input.ip_device_audit_enabled ?? input.ipDeviceAuditEnabled ?? settings.ip_device_audit_enabled;
    settings.updated_at = nowIso();
    settings.version += 1;
    return settings;
  }

  getCurrentCompanyProfile(companyId: string | null): CompanyProfileRecord {
    let company = companyId ? this.store.companyProfiles.find((candidate) => candidate.id === companyId) ?? null : null;
    company ??=
      this.store.companyProfiles.find((candidate) => candidate.status === "active") ??
      this.store.companyProfiles.at(-1) ??
      null;
    if (!company) {
      company = defaultCompanyProfile();
      this.store.companyProfiles.push(company);
    }
    return company;
  }

  updateCurrentCompanyProfile(companyId: string | null, input: CompanyProfileUpdateInput): CompanyProfileRecord {
    const company = this.getCurrentCompanyProfile(companyId);
    if (company.version !== input.expected_version) {
      throw conflict("Company profile was modified by another actor.", {
        aggregate: "company_profile",
        id: company.id,
        expected_version: input.expected_version,
        current_version: company.version
      });
    }

    company.company_name = input.company_name?.trim() || company.company_name;
    company.website = normalizeNullable(input.website, company.website);
    company.industry = normalizeNullable(input.industry, company.industry);
    company.address = normalizeNullable(input.address, company.address);
    company.timezone = input.timezone?.trim() || company.timezone;
    company.locale = input.locale?.trim() || company.locale;
    company.currency = input.currency?.trim() || company.currency;
    company.fiscal_year_start_month = input.fiscal_year_start_month ?? company.fiscal_year_start_month;
    company.working_week = input.working_week?.trim() || company.working_week;
    company.work_hours_per_day = input.work_hours_per_day ?? company.work_hours_per_day;
    company.logo_label = normalizeNullable(input.logo_label, company.logo_label);
    company.updated_at = nowIso();
    company.version += 1;
    return company;
  }

  listRbacRoles(): RbacRoleRecord[] {
    return this.store.rbacRoles.filter((role) => !role.deleted_at);
  }

  rolePermissionsFor(roleKey: string): RbacRolePermissionRecord[] {
    return this.store.rbacRolePermissions.filter((permission) => permission.role_key === roleKey && !permission.deleted_at && permission.status === "active");
  }

  createRbacRole(input: RbacRoleCreateInput): RbacRoleRecord {
    const roleKey = normalizeRbacRoleKey(input.role_key ?? input.key ?? input.name);
    this.assertUniqueRbacRoleKey(roleKey);
    const now = nowIso();
    const role: RbacRoleRecord = {
      id: randomUUID(),
      role_key: roleKey,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      status: "active",
      builtin: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version: 1
    };
    this.store.rbacRoles.push(role);
    for (const permissionId of input.permission_ids) {
      this.store.rbacRolePermissions.push(newRolePermission(role.role_key, permissionId, now));
    }
    return role;
  }

  updateRbacRole(id: string, input: RbacRoleUpdateInput): RbacRoleRecord {
    const role = this.store.rbacRoles.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!role) throw notFound("RBAC role not found", { id });
    if (role.version !== input.expected_version) {
      throw conflict("RBAC role was modified by another actor.", {
        aggregate: "rbac_role",
        id,
        expected_version: input.expected_version,
        current_version: role.version
      });
    }
    if (input.name) role.name = input.name.trim();
    if (input.description !== undefined) role.description = input.description.trim();
    if (input.status) role.status = input.status;
    role.updated_at = nowIso();
    role.version += 1;
    return role;
  }

  replaceRbacRolePermissions(
    role: RbacRoleRecord,
    input: RbacRolePermissionsReplaceInput
  ): RbacRoleRecord {
    if (role.version !== input.expected_version) {
      throw conflict("RBAC role was modified by another actor.", {
        aggregate: "rbac_role",
        id: role.id,
        expected_version: input.expected_version,
        current_version: role.version
      });
    }
    const now = nowIso();
    const requested = new Set(input.permission_ids);
    for (const permission of this.store.rbacRolePermissions.filter((candidate) => candidate.role_key === role.role_key)) {
      if (requested.has(permission.permission_id)) {
        permission.status = "active";
        permission.deleted_at = null;
        permission.updated_at = now;
        requested.delete(permission.permission_id);
      } else if (!permission.deleted_at && permission.status === "active") {
        permission.status = "inactive";
        permission.deleted_at = now;
        permission.updated_at = now;
      }
    }
    for (const permissionId of requested) {
      this.store.rbacRolePermissions.push(newRolePermission(role.role_key, permissionId, now));
    }
    role.updated_at = now;
    role.version += 1;
    return role;
  }

  rbacRoleById(id: string): RbacRoleRecord {
    const role = this.store.rbacRoles.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!role) throw notFound("RBAC role not found", { id });
    return role;
  }

  listDepartments(companyId: string | null): Department[] {
    return this.store.departments.filter((department) => department.company_id === companyId && !department.deleted_at);
  }

  createDepartment(companyId: string | null, input: DepartmentCreateInput): Department {
    const code = normalizeCode(input.department_code ?? input.code ?? input.name);
    this.assertUniqueDepartmentCode(code, companyId);
    const department: Department = {
      id: randomUUID(),
      company_id: companyId,
      department_code: code,
      name: input.name.trim(),
      cost_center: input.cost_center?.trim() || null,
      parent_department_id: input.parent_department_id ?? input.parent_id ?? null,
      director_user_id: null,
      status: input.status ?? "active",
      deleted_at: null,
      version: 1
    };
    this.store.departments.push(department);
    return department;
  }

  updateDepartment(companyId: string | null, id: string, input: DepartmentUpdateInput): Department {
    const department = this.store.departments.find((candidate) => candidate.company_id === companyId && candidate.id === id && !candidate.deleted_at);
    if (!department) throw notFound("Department not found", { id });
    if (department.version !== input.expected_version) {
      throw conflict("Department was modified by another actor.", {
        aggregate: "department",
        id,
        expected_version: input.expected_version,
        current_version: department.version
      });
    }
    const nextCode = input.department_code ?? input.code;
    if (nextCode) {
      const normalized = normalizeCode(nextCode);
      this.assertUniqueDepartmentCode(normalized, companyId, id);
      department.department_code = normalized;
    }
    if (input.name) department.name = input.name.trim();
    if (input.cost_center !== undefined) department.cost_center = input.cost_center?.trim() || null;
    if (input.parent_department_id !== undefined || input.parent_id !== undefined) {
      department.parent_department_id = input.parent_department_id ?? input.parent_id ?? null;
    }
    if (input.status) department.status = input.status;
    department.version += 1;
    return department;
  }

  listDesignations(companyId: string | null): Designation[] {
    return this.store.designations.filter((designation) => designation.company_id === companyId && !designation.deleted_at);
  }

  createDesignation(companyId: string | null, input: DesignationCreateInput): Designation {
    const title = input.title ?? input.name;
    if (!title) {
      throw badRequest("Designation title is required", { field: "title" });
    }
    const code = normalizeCode(input.designation_code ?? input.code ?? title);
    this.assertUniqueDesignationCode(code, companyId);
    const designation: Designation = {
      id: randomUUID(),
      company_id: companyId,
      designation_code: code,
      title: title.trim(),
      level: input.level ?? null,
      status: input.status ?? "active",
      deleted_at: null,
      version: 1
    };
    this.store.designations.push(designation);
    return designation;
  }

  updateDesignation(companyId: string | null, id: string, input: DesignationUpdateInput): Designation {
    const designation = this.store.designations.find((candidate) => candidate.company_id === companyId && candidate.id === id && !candidate.deleted_at);
    if (!designation) throw notFound("Designation not found", { id });
    if (designation.version !== input.expected_version) {
      throw conflict("Designation was modified by another actor.", {
        aggregate: "designation",
        id,
        expected_version: input.expected_version,
        current_version: designation.version
      });
    }
    const nextCode = input.designation_code ?? input.code;
    if (nextCode) {
      const normalized = normalizeCode(nextCode);
      this.assertUniqueDesignationCode(normalized, companyId, id);
      designation.designation_code = normalized;
    }
    const title = input.title ?? input.name;
    if (title) designation.title = title.trim();
    if (input.level !== undefined) designation.level = input.level;
    if (input.status) designation.status = input.status;
    designation.version += 1;
    return designation;
  }

  listExtendedMasterData(masterKey: ExtendedMasterDataKey): AdminMasterDataItemRecord[] {
    this.ensureAdminMasterDataItems();
    return this.store.adminMasterDataItems.filter((item) => item.master_key === masterKey && !item.deleted_at);
  }

  createExtendedMasterData(masterKey: ExtendedMasterDataKey, input: ExtendedMasterDataCreateInput): AdminMasterDataItemRecord {
    this.ensureAdminMasterDataItems();
    const code = normalizeCode(input.code ?? input.name);
    this.assertUniqueExtendedMasterDataCode(masterKey, code);
    const now = nowIso();
    const item: AdminMasterDataItemRecord = {
      id: randomUUID(),
      master_key: masterKey,
      code,
      name: input.name.trim(),
      description: normalizeNullable(input.description ?? null, null),
      status: input.status ?? "active",
      sort_order: input.sort_order ?? this.nextExtendedMasterDataSortOrder(masterKey),
      metadata: {},
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version: 1
    };
    this.store.adminMasterDataItems.push(item);
    return item;
  }

  updateExtendedMasterData(masterKey: ExtendedMasterDataKey, id: string, input: ExtendedMasterDataUpdateInput): AdminMasterDataItemRecord {
    this.ensureAdminMasterDataItems();
    const item = this.store.adminMasterDataItems.find((candidate) => candidate.master_key === masterKey && candidate.id === id && !candidate.deleted_at);
    if (!item) throw notFound("Master data item not found", { master_key: masterKey, id });
    if (item.version !== input.expected_version) {
      throw conflict("Master data item was modified by another actor.", {
        aggregate: "admin_master_data_item",
        master_key: masterKey,
        id,
        expected_version: input.expected_version,
        current_version: item.version
      });
    }
    if (input.code) {
      const normalized = normalizeCode(input.code);
      this.assertUniqueExtendedMasterDataCode(masterKey, normalized, id);
      item.code = normalized;
    }
    if (input.name) item.name = input.name.trim();
    if (input.description !== undefined) item.description = normalizeNullable(input.description, null);
    if (input.status) item.status = input.status;
    if (input.sort_order !== undefined) item.sort_order = input.sort_order;
    item.updated_at = nowIso();
    item.version += 1;
    return item;
  }

  private assertUniqueDepartmentCode(code: string, companyId: string | null, currentId?: string): void {
    const duplicate = this.store.departments.find(
      (candidate) =>
        !candidate.deleted_at &&
        candidate.company_id === companyId &&
        candidate.id !== currentId &&
        candidate.department_code.toUpperCase() === code
    );
    if (duplicate) {
      throw conflict("Department code already exists", { department_code: code });
    }
  }

  private assertUniqueDesignationCode(code: string, companyId: string | null, currentId?: string): void {
    const duplicate = this.store.designations.find(
      (candidate) =>
        !candidate.deleted_at &&
        candidate.company_id === companyId &&
        candidate.id !== currentId &&
        candidate.designation_code.toUpperCase() === code
    );
    if (duplicate) {
      throw conflict("Designation code already exists", { designation_code: code });
    }
  }

  private assertUniqueExtendedMasterDataCode(masterKey: ExtendedMasterDataKey, code: string, currentId?: string): void {
    const duplicate = this.store.adminMasterDataItems.find(
      (candidate) =>
        !candidate.deleted_at &&
        candidate.master_key === masterKey &&
        candidate.id !== currentId &&
        candidate.code.toUpperCase() === code
    );
    if (duplicate) {
      throw conflict("Master data code already exists", { master_key: masterKey, code });
    }
  }

  private nextExtendedMasterDataSortOrder(masterKey: ExtendedMasterDataKey): number {
    const max = this.store.adminMasterDataItems
      .filter((candidate) => candidate.master_key === masterKey && !candidate.deleted_at)
      .reduce((current, item) => Math.max(current, item.sort_order), 0);
    return max + 10;
  }

  private assertUniqueRbacRoleKey(roleKey: string): void {
    const duplicate = this.store.rbacRoles.find((candidate) => !candidate.deleted_at && candidate.role_key.toLowerCase() === roleKey.toLowerCase());
    if (duplicate) {
      throw conflict("RBAC role key already exists", { role_key: roleKey });
    }
  }

  private ensureAdminWorkflows(): void {
    const existingKeys = new Set(this.store.adminWorkflows.filter((workflow) => !workflow.deleted_at).map((workflow) => workflow.workflow_key));
    const missingDefaults = buildDefaultAdminWorkflows(nowIso()).filter((workflow) => !existingKeys.has(workflow.workflow_key));
    this.store.adminWorkflows.push(...missingDefaults);
  }

  private ensureAdminPolicies(companyId: string | null): void {
    const existingKeys = new Set(
      this.store.adminPolicies
        .filter((policy) => policy.company_id === companyId && !policy.deleted_at)
        .map((policy) => policy.policy_key)
    );
    const missingDefaults = buildDefaultAdminPolicies(nowIso(), companyId).filter((policy) => !existingKeys.has(policy.policy_key));
    this.store.adminPolicies.push(...missingDefaults);
  }

  private ensureAdminEmailTemplates(): void {
    const existingKeys = new Set(this.store.adminEmailTemplates.filter((template) => !template.deleted_at).map((template) => template.template_key));
    const missingDefaults = buildDefaultAdminEmailTemplates(nowIso()).filter((template) => !existingKeys.has(template.template_key));
    this.store.adminEmailTemplates.push(...missingDefaults);
  }

  private ensureAdminNotificationChannels(): void {
    const existingKeys = new Set(this.store.adminNotificationChannels.filter((channel) => !channel.deleted_at).map((channel) => channel.event_key));
    const missingDefaults = buildDefaultAdminNotificationChannels(nowIso()).filter((channel) => !existingKeys.has(channel.event_key));
    this.store.adminNotificationChannels.push(...missingDefaults);
  }

  private ensureAdminMasterDataItems(): void {
    const existingKeys = new Set(
      this.store.adminMasterDataItems
        .filter((item) => !item.deleted_at)
        .map((item) => `${item.master_key}:${item.code.toUpperCase()}`)
    );
    const missingDefaults = buildDefaultAdminMasterDataItems(nowIso()).filter(
      (item) => !existingKeys.has(`${item.master_key}:${item.code.toUpperCase()}`)
    );
    this.store.adminMasterDataItems.push(...missingDefaults);
  }
}

export interface AdminWorkflowUpdateData {
  label?: string;
  status?: "active" | "inactive";
  stages?: AdminWorkflowConfigRecord["stages"];
  expected_version: number;
}

export interface AdminPolicyUpdateData {
  label?: string;
  status?: "active" | "inactive";
  config?: Record<string, unknown>;
  expected_version: number;
}

export interface AdminEmailTemplateUpdateData {
  name?: string;
  subject?: string;
  body?: string;
  locale?: string;
  status?: "active" | "inactive";
  expected_version: number;
}

export interface AdminNotificationChannelUpdateData {
  channels: Array<{
    event_key: string;
    label?: string;
    in_app_enabled?: boolean;
    email_enabled?: boolean;
    push_enabled?: boolean;
    status?: "active" | "inactive";
  }>;
  expected_version: number;
}

function maxAdminNotificationChannelVersion(channels: AdminNotificationChannelRecord[]): number {
  return Math.max(1, ...channels.filter((channel) => !channel.deleted_at).map((channel) => channel.version));
}

function defaultCompanyProfile(): CompanyProfileRecord {
  const now = nowIso();
  return {
    id: randomUUID(),
    company_name: "Hawkaii HRMS",
    company_slug: "hawkaii-hrms",
    website: "https://hawkaii.com",
    industry: "Software / SaaS",
    address: null,
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    currency: "INR",
    fiscal_year_start_month: 4,
    working_week: "Mon-Fri",
    work_hours_per_day: 8,
    logo_label: "HK",
    logo_document_id: null,
    logo_url: null,
    logo_file_name: null,
    logo_mime_type: null,
    logo_size_bytes: null,
    status: "active",
    bootstrap_completed_at: now,
    created_at: now,
    updated_at: now,
    version: 1
  };
}

function normalizeNullable(value: string | null | undefined, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 40);
  if (!normalized) {
    throw badRequest("Master data code must include at least one letter or number", { field: "code" });
  }
  return normalized;
}

function normalizeRbacRoleKey(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, 80);
  if (!normalized) {
    throw badRequest("RBAC role key must include at least one visible character", { field: "role_key" });
  }
  return normalized;
}

function newRolePermission(roleKey: string, permissionId: string, now: string): RbacRolePermissionRecord {
  return {
    id: randomUUID(),
    role_key: roleKey,
    permission_id: permissionId,
    status: "active",
    created_at: now,
    updated_at: now,
    deleted_at: null
  };
}
