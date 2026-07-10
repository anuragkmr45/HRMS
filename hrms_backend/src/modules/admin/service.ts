import {
  AdminNotificationEventKeys,
  AdminPolicyKeys,
  AdminWorkflowApproverTypes,
  RbacPermissionActions,
  RbacPermissionGroups,
  Roles,
  type AdminEmailTemplateKey,
  type AdminEmailTemplateRecord,
  type AdminNotificationChannelRecord,
  type AdminNotificationEventKey,
  type AdminPolicyConfigRecord,
  type AdminPolicyKey,
  type AdminSecuritySettingsRecord,
  type AdminWorkflowConfigRecord,
  type AdminWorkflowKey,
  type AdminWorkflowStageRecord,
  type AuthUser,
  type Department,
  type Designation,
  type DocumentMetadata,
  type OutboxEvent,
  type RbacPermissionDefinition,
  type RbacRoleRecord
} from "#shared";
import type { AdminMasterDataItemRecord, CompanyProfileRecord, MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { AdminRepository } from "./repository.js";
import type {
  AdminEmailTemplatesQuery,
  AdminEmailTemplateUpdateInput,
  AdminNotificationChannelInput,
  AdminNotificationChannelsQuery,
  AdminNotificationChannelsUpdateInput,
  AdminAuditLogQuery,
  AdminPoliciesQuery,
  AdminPolicyUpdateInput,
  AdminSecuritySettingsUpdateInput,
  AdminWorkflowStageInput,
  AdminWorkflowUpdateInput,
  AdminWorkflowsQuery,
  CompanyProfileUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
  DesignationCreateInput,
  DesignationUpdateInput,
  ExtendedMasterDataCreateInput,
  ExtendedMasterDataKey,
  ExtendedMasterDataUpdateInput,
  MasterDataQuery,
  RbacPermissionsQuery,
  RbacRoleCreateInput,
  RbacRolePermissionsReplaceInput,
  RbacRolesQuery,
  RbacRoleUpdateInput
} from "./schemas.js";
import { assertCanManageAdminSettings, assertCanManageEmailTemplates, assertCanManageMasterData, assertCanManageNotificationChannels, assertCanManagePolicySettings, assertCanManageRbac, assertCanManageWorkflowSettings, assertCanReadAdminAuditLog } from "./policy.js";
import { badRequest, conflict, notFound } from "../../platform/errors.js";
import { DocumentService } from "../documents/service.js";

export interface CompanyLogoUploadInput {
  file_buffer: Buffer;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface CompanyLogoUploadResponse {
  company: CompanyProfileResponse;
  document: DocumentMetadata;
}

function page<T>(items: readonly T[], pageNumber = 1, pageSize = 25): Paginated<T> {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

export class AdminService {
  private readonly repository: AdminRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new AdminRepository(store);
  }

  getCompanyProfile(actor: AuthUser): CompanyProfileResponse {
    assertCanManageAdminSettings(actor);
    return presentCompanyProfile(this.repository.getCurrentCompanyProfile(this.companyIdForActor(actor)));
  }

  getAdminSecuritySettings(actor: AuthUser): AdminSecuritySettingsResponse {
    assertCanManageAdminSettings(actor);
    return presentAdminSecuritySettings(this.repository.getAdminSecuritySettings());
  }

  updateCompanyProfile(actor: AuthUser, input: CompanyProfileUpdateInput): CompanyProfileResponse {
    assertCanManageAdminSettings(actor);
    const company = this.repository.updateCurrentCompanyProfile(this.companyIdForActor(actor), input);
    appendOutboxEvent(this.store, {
      aggregateType: "company_profile",
      aggregateId: company.id,
      eventType: "admin.company_profile.updated",
      payload: {
        actor_user_id: actor.id,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version"),
        company_name: company.company_name
      },
      idempotencyKey: `admin.company_profile.updated:${company.id}:${company.version}`
    });
    return presentCompanyProfile(company);
  }

  async uploadCompanyLogo(actor: AuthUser, input: CompanyLogoUploadInput): Promise<CompanyLogoUploadResponse> {
    assertCanManageAdminSettings(actor);
    const company = this.repository.getCurrentCompanyProfile(this.companyIdForActor(actor));
    const documentService = new DocumentService(this.store);
    if (company.logo_document_id) {
      try {
        await documentService.delete(actor, company.logo_document_id);
      } catch {
        // A missing previous logo should not block replacing it with a new one.
      }
    }
    const document = await documentService.upload(actor, {
      business_object_type: "company_profile",
      business_object_id: company.id,
      owner_user_id: actor.id,
      classification: "normal",
      document_type: "company_logo",
      file_name: input.file_name,
      mime_type: input.mime_type.trim().toLowerCase(),
      size_bytes: input.size_bytes,
      file_buffer: input.file_buffer,
      storage_metadata: {
        "x-cloudinary-transformation": this.store.documentProcessing.companyLogoUploads.cloudinaryTransformation
      }
    });
    const objectUrl = stringFromMetadata(document.metadata.cloudinary_url) ?? stringFromMetadata(document.metadata.object_url);
    company.logo_document_id = document.id;
    company.logo_url = objectUrl && /^https?:\/\//iu.test(objectUrl) ? objectUrl : null;
    company.logo_file_name = document.file_name;
    company.logo_mime_type = document.mime_type;
    company.logo_size_bytes = document.size_bytes;
    company.updated_at = new Date().toISOString();
    company.version += 1;
    appendOutboxEvent(this.store, {
      aggregateType: "company_profile",
      aggregateId: company.id,
      eventType: "admin.company_profile.logo_uploaded",
      payload: {
        actor_user_id: actor.id,
        document_id: document.id,
        file_name: document.file_name,
        mime_type: document.mime_type,
        size_bytes: document.size_bytes
      },
      idempotencyKey: `admin.company_profile.logo_uploaded:${company.id}:${document.id}`
    });
    return {
      company: presentCompanyProfile(company),
      document
    };
  }

  updateAdminSecuritySettings(actor: AuthUser, input: AdminSecuritySettingsUpdateInput): AdminSecuritySettingsMutationResponse {
    assertCanManageAdminSettings(actor);
    const settings = this.repository.updateAdminSecuritySettings(input);
    appendOutboxEvent(this.store, {
      aggregateType: "admin_security_settings",
      aggregateId: settings.id,
      eventType: "admin.security_settings.updated",
      payload: {
        actor_user_id: actor.id,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version")
      },
      idempotencyKey: `admin.security_settings.updated:${settings.id}:${settings.version}`
    });
    return { settings: presentAdminSecuritySettings(settings), version: settings.version };
  }

  listAdminWorkflows(actor: AuthUser, query: AdminWorkflowsQuery): AdminWorkflowListResponse {
    assertCanManageWorkflowSettings(actor);
    const moduleFilter = query.module?.trim().toLowerCase();
    const workflows = this.repository
      .listAdminWorkflows()
      .filter((workflow) => !moduleFilter || workflow.module.toLowerCase() === moduleFilter || workflow.workflow_key.toLowerCase() === moduleFilter)
      .sort((a, b) => adminWorkflowSortOrder(a.workflow_key) - adminWorkflowSortOrder(b.workflow_key))
      .map((workflow) => presentAdminWorkflow(workflow));
    return {
      items: workflows,
      workflows,
      versions: Object.fromEntries(workflows.map((workflow) => [workflow.workflow_key, workflow.version]))
    };
  }

  listAdminPolicies(actor: AuthUser, query: AdminPoliciesQuery): AdminPolicyListResponse {
    assertCanManagePolicySettings(actor);
    const moduleFilter = query.module?.trim().toLowerCase();
    const companyId = this.companyIdForActor(actor);
    const policies = this.repository
      .listAdminPolicies(companyId)
      .filter((policy) => !moduleFilter || policy.module.toLowerCase() === moduleFilter || policy.policy_key.toLowerCase() === moduleFilter)
      .filter((policy) => !query.active_only || policy.status === "active")
      .sort((a, b) => adminPolicySortOrder(a.policy_key) - adminPolicySortOrder(b.policy_key))
      .map((policy) => presentAdminPolicy(policy));
    return {
      items: policies,
      policies,
      versions: Object.fromEntries(policies.map((policy) => [policy.policy_key, policy.version]))
    };
  }

  listAdminEmailTemplates(actor: AuthUser, query: AdminEmailTemplatesQuery): AdminEmailTemplateListResponse {
    assertCanManageEmailTemplates(actor);
    const moduleFilter = query.module?.trim().toLowerCase();
    const localeFilter = query.locale?.trim().toLowerCase();
    const templates = this.repository
      .listAdminEmailTemplates()
      .filter((template) => !moduleFilter || template.module.toLowerCase() === moduleFilter || template.template_key.toLowerCase() === moduleFilter)
      .filter((template) => !localeFilter || template.locale.toLowerCase() === localeFilter)
      .filter((template) => !query.active_only || template.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((template) => presentAdminEmailTemplate(template));
    return {
      items: templates,
      templates,
      versions: Object.fromEntries(templates.map((template) => [template.template_key, template.version]))
    };
  }

  listAdminNotificationChannels(actor: AuthUser, query: AdminNotificationChannelsQuery): AdminNotificationChannelListResponse {
    assertCanManageNotificationChannels(actor);
    const moduleFilter = query.module?.trim().toLowerCase();
    const channels = this.repository
      .listAdminNotificationChannels()
      .filter((channel) => !moduleFilter || channel.module.toLowerCase() === moduleFilter || channel.event_key.toLowerCase() === moduleFilter)
      .filter((channel) => !query.active_only || channel.status === "active")
      .sort((a, b) => adminNotificationSortOrder(a.event_key) - adminNotificationSortOrder(b.event_key))
      .map((channel) => presentAdminNotificationChannel(channel));
    return {
      items: channels,
      channels,
      events: channels,
      versions: Object.fromEntries(channels.map((channel) => [channel.event_key, channel.version])),
      version: maxAdminNotificationVersion(channels)
    };
  }

  updateAdminWorkflow(actor: AuthUser, workflowKey: AdminWorkflowKey, input: AdminWorkflowUpdateInput): AdminWorkflowMutationResponse {
    assertCanManageWorkflowSettings(actor);
    const stages = input.stages ? normalizeWorkflowStages(input.stages, workflowKey) : undefined;
    const workflow = this.repository.updateAdminWorkflow(workflowKey, {
      label: input.label,
      status: input.status ?? (input.active === undefined ? undefined : input.active ? "active" : "inactive"),
      stages,
      expected_version: input.expected_version
    });
    appendOutboxEvent(this.store, {
      aggregateType: "admin_workflow",
      aggregateId: workflow.id,
      eventType: "admin.workflow.updated",
      payload: {
        actor_user_id: actor.id,
        workflow_key: workflow.workflow_key,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version")
      },
      idempotencyKey: `admin.workflow.updated:${workflow.id}:${workflow.version}`
    });
    return { workflow: presentAdminWorkflow(workflow), version: workflow.version };
  }

  updateAdminPolicy(actor: AuthUser, policyKey: AdminPolicyKey, input: AdminPolicyUpdateInput): AdminPolicyMutationResponse {
    assertCanManagePolicySettings(actor);
    const companyId = this.companyIdForActor(actor);
    const current = this.repository.adminPolicyByKey(policyKey, companyId);
    const policy = this.repository.updateAdminPolicy(policyKey, companyId, {
      label: input.label,
      status: input.status ?? (input.active === undefined ? undefined : input.active ? "active" : "inactive"),
      config: input.config ? normalizeAdminPolicyConfig(policyKey, current.config, input.config) : undefined,
      expected_version: input.expected_version
    });
    appendOutboxEvent(this.store, {
      aggregateType: "admin_policy",
      aggregateId: policy.id,
      eventType: "admin.policy.updated",
      payload: {
        actor_user_id: actor.id,
        policy_key: policy.policy_key,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version")
      },
      idempotencyKey: `admin.policy.updated:${policy.id}:${policy.version}`
    });
    return { policy: presentAdminPolicy(policy), version: policy.version };
  }

  updateAdminEmailTemplate(actor: AuthUser, templateKey: AdminEmailTemplateKey, input: AdminEmailTemplateUpdateInput): AdminEmailTemplateMutationResponse {
    assertCanManageEmailTemplates(actor);
    const template = this.repository.updateAdminEmailTemplate(templateKey, {
      name: input.name,
      subject: input.subject,
      body: input.body,
      locale: input.locale,
      status: input.status ?? (input.active === undefined ? undefined : input.active ? "active" : "inactive"),
      expected_version: input.expected_version
    });
    appendOutboxEvent(this.store, {
      aggregateType: "admin_email_template",
      aggregateId: template.id,
      eventType: "admin.email_template.updated",
      payload: {
        actor_user_id: actor.id,
        template_key: template.template_key,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version")
      },
      idempotencyKey: `admin.email_template.updated:${template.id}:${template.version}`
    });
    return { template: presentAdminEmailTemplate(template), version: template.version };
  }

  updateAdminNotificationChannels(actor: AuthUser, input: AdminNotificationChannelsUpdateInput): AdminNotificationChannelListResponse {
    assertCanManageNotificationChannels(actor);
    const normalizedChannels = input.channels.map((channel) => normalizeNotificationChannelInput(channel));
    const channels = this.repository.updateAdminNotificationChannels({
      channels: normalizedChannels,
      expected_version: input.expected_version
    });
    const aggregateId =
      channels.find((channel) => channel.event_key === normalizedChannels[0]?.event_key)?.id ??
      channels[0]?.id;
    if (!aggregateId) {
      throw badRequest("No notification channels are available to update.", { field: "channels" });
    }
    appendOutboxEvent(this.store, {
      aggregateType: "admin_notification_channels",
      aggregateId,
      eventType: "admin.notification_channels.updated",
      payload: {
        actor_user_id: actor.id,
        event_keys: normalizedChannels.map((channel) => channel.event_key),
        changed_count: normalizedChannels.length
      },
      idempotencyKey: `admin.notification_channels.updated:${input.expected_version}:${normalizedChannels.map((channel) => channel.event_key).join(",")}`
    });
    const presented = channels
      .sort((a, b) => adminNotificationSortOrder(a.event_key) - adminNotificationSortOrder(b.event_key))
      .map((channel) => presentAdminNotificationChannel(channel));
    return {
      items: presented,
      channels: presented,
      events: presented,
      versions: Object.fromEntries(presented.map((channel) => [channel.event_key, channel.version])),
      version: maxAdminNotificationVersion(presented)
    };
  }

  listAdminAuditLog(actor: AuthUser, query: AdminAuditLogQuery): Paginated<AdminAuditLogEntryResponse> {
    assertCanReadAdminAuditLog(actor);
    const moduleFilter = query.module?.trim().toLowerCase();
    const from = query.from ?? query.date_from;
    const to = query.to ?? query.date_to;
    const rows = this.store.outbox
      .filter((event) => event.event_type.startsWith("admin."))
      .filter((event) => !moduleFilter || moduleForAdminEvent(event).toLowerCase().includes(moduleFilter) || event.event_type.toLowerCase().includes(moduleFilter))
      .filter((event) => !query.actor_user_id || actorUserIdForEvent(event) === query.actor_user_id)
      .filter((event) => !from || event.created_at >= from)
      .filter((event) => !to || event.created_at <= to)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
      .map((event) => presentAdminAuditLogEntry(this.store, event));
    return page(rows, query.page, query.page_size);
  }

  listRbacRoles(actor: AuthUser, query: RbacRolesQuery): Paginated<RbacRoleResponse> {
    assertCanManageRbac(actor);
    const filtered = this.repository
      .listRbacRoles()
      .filter((role) => !query.active_only || role.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name));
    return page(filtered.map((role) => this.presentRbacRole(role)), query.page, query.page_size);
  }

  listRbacPermissions(actor: AuthUser, query: RbacPermissionsQuery): { items: RbacPermissionDefinition[] } {
    assertCanManageRbac(actor);
    const search = query.search?.trim().toLowerCase();
    const moduleFilter = query.module?.trim().toLowerCase();
    return {
      items: permissionCatalog().filter((permission) => {
        if (moduleFilter && permission.group.toLowerCase() !== moduleFilter) return false;
        if (!search) return true;
        return (
          permission.id.toLowerCase().includes(search) ||
          permission.group.toLowerCase().includes(search) ||
          permission.action.toLowerCase().includes(search) ||
          permission.label.toLowerCase().includes(search)
        );
      })
    };
  }

  createRbacRole(actor: AuthUser, input: RbacRoleCreateInput): RbacRoleMutationResponse {
    assertCanManageRbac(actor);
    this.assertKnownPermissionIds(input.permission_ids);
    const role = this.repository.createRbacRole(input);
    appendOutboxEvent(this.store, {
      aggregateType: "rbac_role",
      aggregateId: role.id,
      eventType: "admin.rbac.role.created",
      payload: { actor_user_id: actor.id, role_key: role.role_key, permission_count: input.permission_ids.length },
      idempotencyKey: `admin.rbac.role.created:${role.id}:${role.version}`
    });
    return { role: this.presentRbacRole(role), version: role.version };
  }

  updateRbacRole(actor: AuthUser, id: string, input: RbacRoleUpdateInput): RbacRoleMutationResponse {
    assertCanManageRbac(actor);
    const current = this.repository.rbacRoleById(id);
    if (current.role_key === Roles.Admin && input.status === "inactive") {
      throw conflict("Protected Admin role cannot be deactivated.", { role_key: current.role_key });
    }
    const role = this.repository.updateRbacRole(id, input);
    appendOutboxEvent(this.store, {
      aggregateType: "rbac_role",
      aggregateId: role.id,
      eventType: "admin.rbac.role.updated",
      payload: {
        actor_user_id: actor.id,
        role_key: role.role_key,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version")
      },
      idempotencyKey: `admin.rbac.role.updated:${role.id}:${role.version}`
    });
    return { role: this.presentRbacRole(role), version: role.version };
  }

  replaceRbacRolePermissions(actor: AuthUser, id: string, input: RbacRolePermissionsReplaceInput): RbacRoleMutationResponse {
    assertCanManageRbac(actor);
    this.assertKnownPermissionIds(input.permission_ids);
    const role = this.repository.rbacRoleById(id);
    if (role.role_key === Roles.Admin) {
      throw conflict("Protected Admin role permissions cannot be replaced.", { role_key: role.role_key });
    }
    const updated = this.repository.replaceRbacRolePermissions(role, input);
    appendOutboxEvent(this.store, {
      aggregateType: "rbac_role",
      aggregateId: updated.id,
      eventType: "admin.rbac.role.permissions_replaced",
      payload: {
        actor_user_id: actor.id,
        role_key: updated.role_key,
        permission_count: input.permission_ids.length,
        remarks: input.remarks ?? null
      },
      idempotencyKey: `admin.rbac.role.permissions_replaced:${updated.id}:${updated.version}`
    });
    return { role: this.presentRbacRole(updated), version: updated.version };
  }

  listDepartments(actor: AuthUser, query: MasterDataQuery): Paginated<DepartmentResponse> {
    assertCanManageMasterData(actor);
    const search = query.search?.trim().toLowerCase();
    const companyId = this.companyIdForActor(actor);
    const filtered = this.repository
      .listDepartments(companyId)
      .filter((department) => !query.active_only || department.status === "active")
      .filter((department) => {
        if (!search) return true;
        return department.name.toLowerCase().includes(search) || department.department_code.toLowerCase().includes(search);
      })
      .sort((a, b) => a.department_code.localeCompare(b.department_code));
    return page(filtered.map((department) => presentDepartment(department)), query.page, query.page_size);
  }

  createDepartment(actor: AuthUser, input: DepartmentCreateInput): MasterDataMutationResponse<DepartmentResponse> {
    assertCanManageMasterData(actor);
    const companyId = this.companyIdForActor(actor);
    this.assertValidDepartmentParent(companyId, input.parent_department_id ?? input.parent_id ?? null);
    const department = this.repository.createDepartment(companyId, input);
    appendOutboxEvent(this.store, {
      aggregateType: "department",
      aggregateId: department.id,
      eventType: "admin.master_data.department.created",
      payload: { actor_user_id: actor.id, department_code: department.department_code, name: department.name },
      idempotencyKey: `admin.department.created:${department.id}:${department.version}`
    });
    return { department: presentDepartment(department), version: department.version };
  }

  updateDepartment(actor: AuthUser, id: string, input: DepartmentUpdateInput): MasterDataMutationResponse<DepartmentResponse> {
    assertCanManageMasterData(actor);
    const companyId = this.companyIdForActor(actor);
    if (input.status === "inactive") {
      this.assertNoActiveUsersReference(companyId, "department", id);
    }
    if (input.parent_department_id !== undefined || input.parent_id !== undefined) {
      this.assertValidDepartmentParent(companyId, input.parent_department_id ?? input.parent_id ?? null, id);
    }
    const department = this.repository.updateDepartment(companyId, id, input);
    appendOutboxEvent(this.store, {
      aggregateType: "department",
      aggregateId: department.id,
      eventType: "admin.master_data.department.updated",
      payload: {
        actor_user_id: actor.id,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version"),
        department_code: department.department_code,
        name: department.name
      },
      idempotencyKey: `admin.department.updated:${department.id}:${department.version}`
    });
    return { department: presentDepartment(department), version: department.version };
  }

  listDesignations(actor: AuthUser, query: MasterDataQuery): Paginated<DesignationResponse> {
    assertCanManageMasterData(actor);
    const search = query.search?.trim().toLowerCase();
    const companyId = this.companyIdForActor(actor);
    const filtered = this.repository
      .listDesignations(companyId)
      .filter((designation) => !query.active_only || designation.status === "active")
      .filter((designation) => {
        if (!search) return true;
        return designation.title.toLowerCase().includes(search) || designation.designation_code.toLowerCase().includes(search);
      })
      .sort((a, b) => (a.level ?? 999).toString().localeCompare((b.level ?? 999).toString()) || a.designation_code.localeCompare(b.designation_code));
    return page(filtered.map((designation) => presentDesignation(designation)), query.page, query.page_size);
  }

  createDesignation(actor: AuthUser, input: DesignationCreateInput): MasterDataMutationResponse<DesignationResponse> {
    assertCanManageMasterData(actor);
    const designation = this.repository.createDesignation(this.companyIdForActor(actor), input);
    appendOutboxEvent(this.store, {
      aggregateType: "designation",
      aggregateId: designation.id,
      eventType: "admin.master_data.designation.created",
      payload: { actor_user_id: actor.id, designation_code: designation.designation_code, title: designation.title },
      idempotencyKey: `admin.designation.created:${designation.id}:${designation.version}`
    });
    return { designation: presentDesignation(designation), version: designation.version };
  }

  updateDesignation(actor: AuthUser, id: string, input: DesignationUpdateInput): MasterDataMutationResponse<DesignationResponse> {
    assertCanManageMasterData(actor);
    const companyId = this.companyIdForActor(actor);
    if (input.status === "inactive") {
      this.assertNoActiveUsersReference(companyId, "designation", id);
    }
    const designation = this.repository.updateDesignation(companyId, id, input);
    appendOutboxEvent(this.store, {
      aggregateType: "designation",
      aggregateId: designation.id,
      eventType: "admin.master_data.designation.updated",
      payload: {
        actor_user_id: actor.id,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version"),
        designation_code: designation.designation_code,
        title: designation.title
      },
      idempotencyKey: `admin.designation.updated:${designation.id}:${designation.version}`
    });
    return { designation: presentDesignation(designation), version: designation.version };
  }

  listExtendedMasterData(actor: AuthUser, masterKey: ExtendedMasterDataKey, query: MasterDataQuery): Paginated<ExtendedMasterDataResponse> {
    assertCanManageMasterData(actor);
    const search = query.search?.trim().toLowerCase();
    const filtered = this.repository
      .listExtendedMasterData(masterKey)
      .filter((item) => !query.active_only || item.status === "active")
      .filter((item) => {
        if (!search) return true;
        return (
          item.name.toLowerCase().includes(search) ||
          item.code.toLowerCase().includes(search) ||
          (item.description ?? "").toLowerCase().includes(search)
        );
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return page(filtered.map((item) => presentExtendedMasterData(item)), query.page, query.page_size);
  }

  createExtendedMasterData(
    actor: AuthUser,
    masterKey: ExtendedMasterDataKey,
    input: ExtendedMasterDataCreateInput
  ): MasterDataMutationResponse<ExtendedMasterDataResponse> {
    assertCanManageMasterData(actor);
    const item = this.repository.createExtendedMasterData(masterKey, input);
    appendOutboxEvent(this.store, {
      aggregateType: "admin_master_data_item",
      aggregateId: item.id,
      eventType: "admin.master_data.item.created",
      payload: { actor_user_id: actor.id, master_key: item.master_key, code: item.code, name: item.name },
      idempotencyKey: `admin.master_data.item.created:${item.id}:${item.version}`
    });
    return { item: presentExtendedMasterData(item), version: item.version };
  }

  updateExtendedMasterData(
    actor: AuthUser,
    masterKey: ExtendedMasterDataKey,
    id: string,
    input: ExtendedMasterDataUpdateInput
  ): MasterDataMutationResponse<ExtendedMasterDataResponse> {
    assertCanManageMasterData(actor);
    const item = this.repository.updateExtendedMasterData(masterKey, id, input);
    appendOutboxEvent(this.store, {
      aggregateType: "admin_master_data_item",
      aggregateId: item.id,
      eventType: "admin.master_data.item.updated",
      payload: {
        actor_user_id: actor.id,
        master_key: item.master_key,
        code: item.code,
        name: item.name,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version")
      },
      idempotencyKey: `admin.master_data.item.updated:${item.id}:${item.version}`
    });
    return { item: presentExtendedMasterData(item), version: item.version };
  }

  private companyIdForActor(actor: AuthUser): string | null {
    return this.store.userSessionPreferences.find((preference) => preference.user_id === actor.id)?.company_id ?? null;
  }

  private userBelongsToCompany(userId: string, companyId: string | null): boolean {
    if (!companyId) {
      return true;
    }
    return this.store.userSessionPreferences.find((preference) => preference.user_id === userId)?.company_id === companyId;
  }

  private assertValidDepartmentParent(companyId: string | null, parentId: string | null, currentId?: string): void {
    if (!parentId) return;
    if (parentId === currentId) {
      throw conflict("Department cannot be its own parent.", { parent_id: parentId });
    }
    const departments = this.repository.listDepartments(companyId);
    const parent = departments.find((department) => department.id === parentId && department.status === "active");
    if (!parent) {
      throw notFound("Parent department not found", { parent_id: parentId });
    }
    let cursor: Department | undefined = parent;
    while (cursor?.parent_department_id) {
      if (cursor.parent_department_id === currentId) {
        throw conflict("Department parent would create a hierarchy cycle.", { parent_id: parentId });
      }
      cursor = departments.find((department) => department.id === cursor?.parent_department_id);
    }
  }

  private assertNoActiveUsersReference(companyId: string | null, kind: "department" | "designation", id: string): void {
    const hasActiveReference = this.store.users.some(
      (user) =>
        !user.deleted_at &&
        user.employment_status === "active" &&
        this.userBelongsToCompany(user.id, companyId) &&
        (kind === "department" ? user.department_id === id : user.designation_id === id)
    );
    if (hasActiveReference) {
      throw conflict(`Cannot deactivate ${kind} while active employees reference it.`, { id });
    }
  }

  private assertKnownPermissionIds(permissionIds: readonly string[]): void {
    const known = new Set(permissionCatalog().map((permission) => permission.id));
    const unknown = permissionIds.filter((permissionId) => !known.has(permissionId));
    if (unknown.length) {
      throw badRequest("One or more permission IDs are not supported.", { permission_ids: unknown });
    }
  }

  private presentRbacRole(role: RbacRoleRecord): RbacRoleResponse {
    const permissionIds = this.repository.rolePermissionsFor(role.role_key).map((permission) => permission.permission_id).sort();
    return {
      id: role.id,
      role_key: role.role_key,
      key: role.role_key,
      name: role.name,
      label: role.name,
      description: role.description,
      status: role.status,
      active: role.status === "active",
      builtin: role.builtin,
      protected_system_role: role.role_key === Roles.Admin,
      assigned_users: this.store.users.filter((user) => !user.deleted_at && user.roles.includes(role.role_key as AuthUser["roles"][number])).length,
      permission_ids: permissionIds,
      permissions: permissionIds,
      updated_at: role.updated_at,
      version: role.version
    };
  }
}

export interface Paginated<T> {
  items: readonly T[];
  page: number;
  page_size: number;
  total: number;
}

export interface DepartmentResponse {
  id: string;
  department_code: string;
  code: string;
  name: string;
  parent_department_id: string | null;
  parent_id: string | null;
  cost_center: string | null;
  director_user_id: string | null;
  status: Department["status"];
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export interface DesignationResponse {
  id: string;
  designation_code: string;
  code: string;
  title: string;
  name: string;
  level: number | null;
  status: Designation["status"];
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export interface ExtendedMasterDataResponse {
  id: string;
  master_key: string;
  key: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface MasterDataMutationResponse<T> {
  version: number;
  department?: T;
  designation?: T;
  item?: T;
}

export interface RbacRoleResponse {
  id: string;
  role_key: string;
  key: string;
  name: string;
  label: string;
  description: string;
  status: "active" | "inactive";
  active: boolean;
  builtin: boolean;
  protected_system_role: boolean;
  assigned_users: number;
  permission_ids: string[];
  permissions: string[];
  updated_at: string;
  version: number;
}

export interface RbacRoleMutationResponse {
  role: RbacRoleResponse;
  version: number;
}

export interface AdminWorkflowStageResponse {
  id: string;
  order: number;
  approver_type: AdminWorkflowStageRecord["approver_type"];
  approverType: AdminWorkflowStageRecord["approver_type"];
  approver_value: string;
  approverValue: string;
  escalate_after_days: number;
  escalateAfterDays: number;
  mandatory_remarks_on_reject: boolean;
  mandatoryRemarksOnReject: boolean;
}

export interface AdminWorkflowResponse {
  id: string;
  workflow_key: AdminWorkflowKey;
  key: AdminWorkflowKey;
  module: string;
  label: string;
  status: "active" | "inactive";
  active: boolean;
  stages: AdminWorkflowStageResponse[];
  updated_at: string;
  version: number;
}

export interface AdminWorkflowListResponse {
  items: AdminWorkflowResponse[];
  workflows: AdminWorkflowResponse[];
  versions: Record<string, number>;
}

export interface AdminWorkflowMutationResponse {
  workflow: AdminWorkflowResponse;
  version: number;
}

export interface AdminPolicyResponse {
  id: string;
  policy_key: AdminPolicyKey;
  key: AdminPolicyKey;
  module: string;
  label: string;
  status: "active" | "inactive";
  active: boolean;
  config: Record<string, unknown>;
  derived_preview?: Record<string, unknown>;
  updated_at: string;
  version: number;
}

export interface AdminPolicyListResponse {
  items: AdminPolicyResponse[];
  policies: AdminPolicyResponse[];
  versions: Record<string, number>;
}

export interface AdminPolicyMutationResponse {
  policy: AdminPolicyResponse;
  version: number;
}

export interface AdminEmailTemplateResponse {
  id: string;
  template_key: AdminEmailTemplateKey;
  key: AdminEmailTemplateKey;
  module: string;
  name: string;
  subject: string;
  body: string;
  locale: string;
  status: "active" | "inactive";
  active: boolean;
  updated_at: string;
  version: number;
}

export interface AdminEmailTemplateListResponse {
  items: AdminEmailTemplateResponse[];
  templates: AdminEmailTemplateResponse[];
  versions: Record<string, number>;
}

export interface AdminEmailTemplateMutationResponse {
  template: AdminEmailTemplateResponse;
  version: number;
}

export interface AdminNotificationChannelResponse {
  id: string;
  event_key: AdminNotificationEventKey;
  key: AdminNotificationEventKey;
  module: string;
  label: string;
  in_app_enabled: boolean;
  inApp: boolean;
  email_enabled: boolean;
  email: boolean;
  push_enabled: boolean;
  push: boolean;
  status: "active" | "inactive";
  active: boolean;
  updated_at: string;
  version: number;
}

export interface AdminNotificationChannelListResponse {
  items: AdminNotificationChannelResponse[];
  channels: AdminNotificationChannelResponse[];
  events: AdminNotificationChannelResponse[];
  versions: Record<string, number>;
  version: number;
}

export interface AdminAuditLogEntryResponse {
  id: string;
  event_id: string;
  actor: string;
  actor_user_id: string | null;
  action: string;
  event_type: string;
  target: string;
  module: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  at: string;
  created_at: string;
  ip: string;
}

export interface CompanyProfileResponse {
  id: string;
  company_name: string;
  company_slug: string;
  name: string;
  website: string | null;
  industry: string | null;
  address: string | null;
  timezone: string;
  locale: string;
  currency: string;
  fiscal_year_start_month: number;
  financial_year_start: string;
  working_week: string;
  work_hours_per_day: number;
  work_hours: number;
  logo_label: string | null;
  logoLabel: string | null;
  logo_document_id: string | null;
  logoDocumentId: string | null;
  logo_url: string | null;
  logoUrl: string | null;
  logo_file_name: string | null;
  logo_mime_type: string | null;
  logo_size_bytes: number | null;
  status: CompanyProfileRecord["status"];
  bootstrap_completed_at: string | null;
  updated_at: string;
  version: number;
}

export interface AdminSecuritySettingsResponse {
  id: string;
  settings_key: "default";
  password_min_length: number;
  passwordMinLength: number;
  password_require_special: boolean;
  passwordRequireSpecial: boolean;
  password_require_number: boolean;
  passwordRequireNumber: boolean;
  password_expiry_days: number;
  passwordExpiryDays: number;
  session_timeout_minutes: number;
  sessionTimeoutMinutes: number;
  login_attempt_limit: number;
  loginAttemptLimit: number;
  mfa_enabled: false;
  mfaEnabled: false;
  audit_role_changes: boolean;
  auditRoleChanges: boolean;
  ip_device_audit_enabled: boolean;
  ipDeviceAuditEnabled: boolean;
  updated_at: string;
  version: number;
}

export interface AdminSecuritySettingsMutationResponse {
  settings: AdminSecuritySettingsResponse;
  version: number;
}

function presentCompanyProfile(company: CompanyProfileRecord): CompanyProfileResponse {
  return {
    id: company.id,
    company_name: company.company_name,
    company_slug: company.company_slug,
    name: company.company_name,
    website: company.website,
    industry: company.industry,
    address: company.address,
    timezone: company.timezone,
    locale: company.locale,
    currency: company.currency,
    fiscal_year_start_month: company.fiscal_year_start_month,
    financial_year_start: monthName(company.fiscal_year_start_month),
    working_week: company.working_week,
    work_hours_per_day: company.work_hours_per_day,
    work_hours: company.work_hours_per_day,
    logo_label: company.logo_label,
    logoLabel: company.logo_label,
    logo_document_id: company.logo_document_id,
    logoDocumentId: company.logo_document_id,
    logo_url: company.logo_url,
    logoUrl: company.logo_url,
    logo_file_name: company.logo_file_name,
    logo_mime_type: company.logo_mime_type,
    logo_size_bytes: company.logo_size_bytes,
    status: company.status,
    bootstrap_completed_at: company.bootstrap_completed_at,
    updated_at: company.updated_at,
    version: company.version
  };
}

function stringFromMetadata(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function presentAdminSecuritySettings(settings: AdminSecuritySettingsRecord): AdminSecuritySettingsResponse {
  return {
    id: settings.id,
    settings_key: settings.settings_key,
    password_min_length: settings.password_min_length,
    passwordMinLength: settings.password_min_length,
    password_require_special: settings.password_require_special,
    passwordRequireSpecial: settings.password_require_special,
    password_require_number: settings.password_require_number,
    passwordRequireNumber: settings.password_require_number,
    password_expiry_days: settings.password_expiry_days,
    passwordExpiryDays: settings.password_expiry_days,
    session_timeout_minutes: settings.session_timeout_minutes,
    sessionTimeoutMinutes: settings.session_timeout_minutes,
    login_attempt_limit: settings.login_attempt_limit,
    loginAttemptLimit: settings.login_attempt_limit,
    mfa_enabled: false,
    mfaEnabled: false,
    audit_role_changes: settings.audit_role_changes,
    auditRoleChanges: settings.audit_role_changes,
    ip_device_audit_enabled: settings.ip_device_audit_enabled,
    ipDeviceAuditEnabled: settings.ip_device_audit_enabled,
    updated_at: settings.updated_at,
    version: settings.version
  };
}

function presentDepartment(department: Department): DepartmentResponse {
  return {
    id: department.id,
    department_code: department.department_code,
    code: department.department_code,
    name: department.name,
    cost_center: department.cost_center,
    parent_department_id: department.parent_department_id,
    parent_id: department.parent_department_id,
    director_user_id: department.director_user_id,
    status: department.status,
    active: department.status === "active",
    deleted_at: department.deleted_at,
    version: department.version
  };
}

function presentDesignation(designation: Designation): DesignationResponse {
  return {
    id: designation.id,
    designation_code: designation.designation_code,
    code: designation.designation_code,
    title: designation.title,
    name: designation.title,
    level: designation.level,
    status: designation.status,
    active: designation.status === "active",
    deleted_at: designation.deleted_at,
    version: designation.version
  };
}

function presentExtendedMasterData(item: AdminMasterDataItemRecord): ExtendedMasterDataResponse {
  return {
    id: item.id,
    master_key: item.master_key,
    key: item.master_key,
    code: item.code,
    name: item.name,
    description: item.description,
    status: item.status,
    active: item.status === "active",
    sort_order: item.sort_order,
    metadata: item.metadata,
    updated_at: item.updated_at,
    deleted_at: item.deleted_at,
    version: item.version
  };
}

function presentAdminWorkflow(workflow: AdminWorkflowConfigRecord): AdminWorkflowResponse {
  return {
    id: workflow.id,
    workflow_key: workflow.workflow_key,
    key: workflow.workflow_key,
    module: workflow.module,
    label: workflow.label,
    status: workflow.status,
    active: workflow.status === "active",
    stages: workflow.stages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({
        id: stage.id,
        order: stage.order,
        approver_type: stage.approver_type,
        approverType: stage.approver_type,
        approver_value: stage.approver_value,
        approverValue: stage.approver_value,
        escalate_after_days: stage.escalate_after_days,
        escalateAfterDays: stage.escalate_after_days,
        mandatory_remarks_on_reject: stage.mandatory_remarks_on_reject,
        mandatoryRemarksOnReject: stage.mandatory_remarks_on_reject
      })),
    updated_at: workflow.updated_at,
    version: workflow.version
  };
}

function presentAdminPolicy(policy: AdminPolicyConfigRecord): AdminPolicyResponse {
  return {
    id: policy.id,
    policy_key: policy.policy_key,
    key: policy.policy_key,
    module: policy.module,
    label: policy.label,
    status: policy.status,
    active: policy.status === "active",
    config: policy.config,
    derived_preview: policy.policy_key === "leave" ? leavePolicyPreview(policy.config) : undefined,
    updated_at: policy.updated_at,
    version: policy.version
  };
}

function numericPolicyValue(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = config[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanPolicyValue(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function leavePolicyPreview(config: Record<string, unknown>): Record<string, unknown> {
  const casualPerYear = numericPolicyValue(config, "casualPerYear", 12);
  const sickPerYear = numericPolicyValue(config, "sickPerYear", 10);
  const earnedPerYear = numericPolicyValue(config, "earnedPerYear", 18);
  const carryForwardCap = numericPolicyValue(config, "carryForwardCap", 0);
  const annualEntitlement = casualPerYear + sickPerYear + earnedPerYear;
  return {
    read_only: true,
    annual_entitlement_days: annualEntitlement,
    monthly_accrual_days: Math.round((annualEntitlement / 12) * 100) / 100,
    casual_monthly_accrual_days: Math.round((casualPerYear / 12) * 100) / 100,
    sick_monthly_accrual_days: Math.round((sickPerYear / 12) * 100) / 100,
    earned_monthly_accrual_days: Math.round((earnedPerYear / 12) * 100) / 100,
    carry_forward_cap_days: carryForwardCap > 0 ? carryForwardCap : "Not configured",
    negative_balance_allowed: false,
    probation_eligibility: "Not configured",
    encashment: booleanPolicyValue(config, "encashmentAllowed", false) ? "Configured as allowed" : "Not configured / future scope"
  };
}

function presentAdminEmailTemplate(template: AdminEmailTemplateRecord): AdminEmailTemplateResponse {
  return {
    id: template.id,
    template_key: template.template_key,
    key: template.template_key,
    module: template.module,
    name: template.name,
    subject: template.subject,
    body: template.body,
    locale: template.locale,
    status: template.status,
    active: template.status === "active",
    updated_at: template.updated_at,
    version: template.version
  };
}

function presentAdminNotificationChannel(channel: AdminNotificationChannelRecord): AdminNotificationChannelResponse {
  return {
    id: channel.id,
    event_key: channel.event_key,
    key: channel.event_key,
    module: channel.module,
    label: channel.label,
    in_app_enabled: channel.in_app_enabled,
    inApp: channel.in_app_enabled,
    email_enabled: channel.email_enabled,
    email: channel.email_enabled,
    push_enabled: channel.push_enabled,
    push: channel.push_enabled,
    status: channel.status,
    active: channel.status === "active",
    updated_at: channel.updated_at,
    version: channel.version
  };
}

function presentAdminAuditLogEntry(store: MemoryDataStore, event: OutboxEvent): AdminAuditLogEntryResponse {
  const actorUserId = actorUserIdForEvent(event);
  const actor = actorUserId ? store.users.find((user) => user.id === actorUserId && !user.deleted_at) : undefined;
  return {
    id: `AL-${event.id}`,
    event_id: event.event_id,
    actor: actor ? `${actor.employee_code} - ${actor.full_name}` : actorUserId ?? "System",
    actor_user_id: actorUserId,
    action: event.event_type,
    event_type: event.event_type,
    target: targetForAdminEvent(event),
    module: moduleForAdminEvent(event),
    aggregate_type: event.aggregate_type,
    aggregate_id: event.aggregate_id,
    status: event.status,
    at: event.created_at,
    created_at: event.created_at,
    ip: typeof event.payload.ip === "string" ? event.payload.ip : "server"
  };
}

function normalizeWorkflowStages(stages: readonly AdminWorkflowStageInput[], workflowKey: AdminWorkflowKey): AdminWorkflowStageRecord[] {
  const seen = new Set<string>();
  return stages.map((stage, index) => {
    const order = stage.order ?? index + 1;
    const id = (stage.id?.trim() || `${workflowKey}_stage_${order}`).slice(0, 80);
    if (seen.has(id)) {
      throw badRequest("Workflow stage IDs must be unique.", { field: "stages", id });
    }
    seen.add(id);

    const approverType = stage.approver_type ?? stage.approverType;
    if (!approverType || !AdminWorkflowApproverTypes.includes(approverType)) {
      throw badRequest("Workflow stage approver type is required.", { field: "approver_type" });
    }
    const approverValue = (stage.approver_value ?? stage.approverValue ?? "").trim();
    if (!approverValue) {
      throw badRequest("Workflow stage approver value is required.", { field: "approver_value" });
    }
    return {
      id,
      order,
      approver_type: approverType,
      approver_value: approverValue,
      escalate_after_days: stage.escalate_after_days ?? stage.escalateAfterDays ?? 0,
      mandatory_remarks_on_reject: stage.mandatory_remarks_on_reject ?? stage.mandatoryRemarksOnReject ?? true
    };
  });
}

function adminWorkflowSortOrder(workflowKey: AdminWorkflowKey): number {
  return ["leave", "wfh", "timesheet", "expense", "asset_request", "helpdesk_escalation"].indexOf(workflowKey);
}

function adminNotificationSortOrder(eventKey: AdminNotificationEventKey): number {
  return AdminNotificationEventKeys.indexOf(eventKey);
}

function normalizeNotificationChannelInput(channel: AdminNotificationChannelInput) {
  const eventKey = channel.event_key ?? channel.key;
  if (!eventKey || !AdminNotificationEventKeys.includes(eventKey)) {
    throw badRequest("Notification event key is required.", { field: "event_key" });
  }
  return {
    event_key: eventKey,
    label: channel.label,
    in_app_enabled: channel.in_app_enabled ?? channel.inApp,
    email_enabled: channel.email_enabled ?? channel.email,
    push_enabled: channel.push_enabled ?? channel.push,
    status: channel.status ?? (channel.active === undefined ? undefined : channel.active ? "active" : "inactive")
  };
}

function maxAdminNotificationVersion(channels: readonly { version: number }[]): number {
  return Math.max(1, ...channels.map((channel) => channel.version));
}

function actorUserIdForEvent(event: OutboxEvent): string | null {
  return typeof event.payload.actor_user_id === "string" ? event.payload.actor_user_id : null;
}

function moduleForAdminEvent(event: OutboxEvent): string {
  if (event.event_type.includes("company_profile")) return "Company";
  if (event.event_type.includes("rbac")) return "RBAC";
  if (event.event_type.includes("master_data")) return "Master Data";
  if (event.event_type.includes("workflow")) return "Workflows";
  if (event.event_type.includes("policy")) return "Policies";
  if (event.event_type.includes("email_template")) return "Email Templates";
  if (event.event_type.includes("notification_channels")) return "Notifications";
  return "Admin Settings";
}

function targetForAdminEvent(event: OutboxEvent): string {
  const payload = event.payload;
  const candidates = [
    payload.company_name,
    payload.role_key,
    payload.department_code,
    payload.designation_code,
    payload.workflow_key,
    payload.policy_key,
    payload.template_key,
    Array.isArray(payload.event_keys) ? payload.event_keys.join(", ") : undefined
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value : `${event.aggregate_type}:${event.aggregate_id}`;
}

const attendanceTimePolicyFields = new Set([
  "punchInStart",
  "punchInEnd",
  "punchOutStart",
  "punchOutEnd",
  "autoPunchOutTime"
]);
const attendanceBooleanPolicyFields = new Set(["allowRegularization", "fullDayPunchWindow", "autoPunchOutEnabled", "allowOffDayPunches"]);
const attendanceTimePolicyPattern = /^([01]\d|2[0-3]):[0-5]\d$/u;

function normalizeAdminPolicyConfig(
  policyKey: AdminPolicyKey,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const allowedKeys = adminPolicyConfigKeys(policyKey);
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!allowedKeys.has(key)) {
      throw badRequest("Unknown policy configuration field.", { policy_key: policyKey, field: key });
    }
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      throw badRequest("Policy number values must be finite and non-negative.", { policy_key: policyKey, field: key });
    }
    if (policyKey === "attendance" && attendanceBooleanPolicyFields.has(key) && typeof value !== "boolean") {
      throw badRequest("Attendance policy toggle values must be true or false.", { policy_key: policyKey, field: key });
    }
    if (policyKey === "attendance" && attendanceTimePolicyFields.has(key)) {
      if (typeof value !== "string" || !attendanceTimePolicyPattern.test(value.trim())) {
        throw badRequest("Attendance punch windows must use HH:mm time.", { policy_key: policyKey, field: key });
      }
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        throw badRequest("Policy text values cannot be blank.", { policy_key: policyKey, field: key });
      }
      next[key] = trimmed;
    } else {
      next[key] = value;
    }
  }
  return next;
}

function adminPolicyConfigKeys(policyKey: AdminPolicyKey): Set<string> {
  const fields: Record<AdminPolicyKey, string[]> = {
    attendance: [
      "graceMinutes",
      "halfDayAfterMinutes",
      "autoMarkAbsentMinutes",
      "allowRegularization",
      "fullDayPunchWindow",
      "punchInStart",
      "punchInEnd",
      "punchOutStart",
      "punchOutEnd",
      "autoPunchOutEnabled",
      "autoPunchOutTime",
      "allowOffDayPunches"
    ],
    leave: ["casualPerYear", "sickPerYear", "earnedPerYear", "carryForwardCap", "encashmentAllowed"],
    timesheet: ["weeklyHours", "minDailyHours", "submitBy", "lockAfterApproval"],
    expense: ["perDayLimit", "receiptMandatoryAbove", "selfApprovalAllowed", "autoEscalateDays"],
    asset: ["damagePenalty", "mandatoryAck", "returnSlaDays", "warrantyAlertDays"],
    sla: [
      "urgentResponseHrs",
      "urgentResolveHrs",
      "highResponseHrs",
      "highResolveHrs",
      "normalResponseHrs",
      "normalResolveHrs",
      "lowResponseHrs",
      "lowResolveHrs"
    ]
  };
  return new Set(fields[policyKey]);
}

function adminPolicySortOrder(policyKey: AdminPolicyKey): number {
  return AdminPolicyKeys.indexOf(policyKey);
}

function monthName(month: number): string {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ][Math.max(1, Math.min(12, month)) - 1] ?? "January";
}

function permissionCatalog(): RbacPermissionDefinition[] {
  return RbacPermissionGroups.flatMap((group) =>
    RbacPermissionActions.map((action) => {
      const id = permissionId(group, action);
      return {
        id,
        permission_id: id,
        group,
        module: group,
        action,
        label: `${group} ${action}`,
        description: `Allows ${action} access for ${group}.`
      };
    })
  );
}

function permissionId(group: string, action: string): string {
  return `${group.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "")}:${action}`;
}
