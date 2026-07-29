import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

export interface CompanyProfileResponse extends ApiRecord {
  id: string;
  company_name: string;
  company_slug: string;
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
  logo_label: string | null;
  logoLabel?: string | null;
  logo_document_id: string | null;
  logoDocumentId?: string | null;
  logo_url: string | null;
  logoUrl?: string | null;
  logo_file_name: string | null;
  logo_mime_type: string | null;
  logo_size_bytes: number | null;
  status: string;
  updated_at: string;
  version: number;
}

export interface CompanyProfileUpdateInput extends ApiRecord {
  company_name?: string;
  website?: string | null;
  industry?: string | null;
  address?: string | null;
  timezone?: string;
  locale?: string;
  currency?: string;
  fiscal_year_start_month?: number;
  working_week?: string;
  work_hours_per_day?: number;
  logo_label?: string | null;
  expected_version: number;
}

export interface AdminCompanyLogoUploadResponse extends ApiRecord {
  company: CompanyProfileResponse;
  document: ApiRecord;
}

export interface MasterDataListResponse<T extends ApiRecord> extends ApiRecord {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface DepartmentMasterRecord extends ApiRecord {
  id: string;
  department_code: string;
  code: string;
  name: string;
  cost_center: string | null;
  parent_department_id: string | null;
  parent_id: string | null;
  director_user_id: string | null;
  status: "active" | "inactive";
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export interface DesignationMasterRecord extends ApiRecord {
  id: string;
  designation_code: string;
  code: string;
  title: string;
  name: string;
  level: number | null;
  status: "active" | "inactive";
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export type ExtendedMasterDataKey =
  | "employmentTypes"
  | "workLocations"
  | "shifts"
  | "leaveTypes"
  | "expenseCategories"
  | "assetCategories"
  | "helpdeskCategories"
  | "projectRoles";

export interface ExtendedMasterDataRecord extends ApiRecord {
  id: string;
  master_key: ExtendedMasterDataKey;
  key: ExtendedMasterDataKey;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  active: boolean;
  sort_order: number;
  metadata: ApiRecord;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface DepartmentMasterInput extends ApiRecord {
  name?: string;
  code?: string;
  department_code?: string;
  cost_center?: string | null;
  parent_id?: string | null;
  parent_department_id?: string | null;
  status?: "active" | "inactive";
  expected_version?: number;
}

export interface DesignationMasterInput extends ApiRecord {
  name?: string;
  title?: string;
  code?: string;
  designation_code?: string;
  level?: number | null;
  status?: "active" | "inactive";
  expected_version?: number;
}

export interface ExtendedMasterDataInput extends ApiRecord {
  name?: string;
  code?: string;
  description?: string | null;
  status?: "active" | "inactive";
  sort_order?: number;
  expected_version?: number;
}

export type ShiftTimezoneStrategy = "company" | "employee_with_company_fallback" | "fixed";

export interface ShiftVersionInput extends ApiRecord {
  effective_from: string;
  effective_until?: string | null;
  local_start_time: string;
  local_end_time: string;
  crosses_midnight: boolean;
  timezone_strategy: ShiftTimezoneStrategy;
  fixed_timezone?: string | null;
  eligibility_open_before_start_minutes: number;
  eligibility_close_after_end_minutes: number;
}

export interface ShiftVersionRecord extends ApiRecord {
  id: string;
  company_id: string;
  template_id: string;
  version_number: number;
  effective_from: string;
  effective_until: string | null;
  local_start_time: string;
  local_end_time: string;
  end_day_offset: number;
  crosses_midnight: boolean;
  timezone_strategy: ShiftTimezoneStrategy;
  fixed_timezone: string | null;
  eligibility_open_before_start_minutes: number;
  eligibility_close_after_end_minutes: number;
  created_at: string;
}

export interface ShiftTemplateRecord extends ApiRecord {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  is_company_default: boolean;
  created_at: string;
  updated_at: string;
  version: number;
  latest_version: ShiftVersionRecord | null;
}

export interface ShiftTemplateCreateInput extends ApiRecord {
  code: string;
  name: string;
  description?: string | null;
  is_company_default: boolean;
  version: ShiftVersionInput;
}

export interface ShiftTemplateUpdateInput extends ApiRecord {
  name?: string;
  description?: string | null;
  status?: "active" | "inactive";
  is_company_default?: boolean;
  expected_version: number;
}

export interface ShiftAssignmentRecord extends ApiRecord {
  id: string;
  company_id: string;
  employee_user_id: string;
  template_id: string;
  effective_from: string;
  effective_until: string | null;
  status: "active" | "inactive";
  employee_name: string;
  employee_code: string;
  department_id: string | null;
  department_name: string | null;
  template_code: string;
  template_name: string;
  version: number;
}

export interface ShiftAssignmentCreateInput extends ApiRecord {
  target_type: "employee" | "department";
  target_id: string;
  template_id: string;
  effective_from: string;
  effective_until?: string | null;
}

export interface ShiftReferenceResponse extends ApiRecord {
  employees: Array<{
    id: string;
    employee_code: string;
    name: string;
    department_id: string | null;
  }>;
  departments: Array<{
    id: string;
    code: string;
    name: string;
    employee_count: number;
  }>;
}

export interface RbacRoleRecord extends ApiRecord {
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

export interface RbacPermissionRecord extends ApiRecord {
  id: string;
  permission_id: string;
  group: string;
  module: string;
  action: string;
  label: string;
  description: string;
}

export interface RbacRoleInput extends ApiRecord {
  role_key?: string;
  key?: string;
  name: string;
  description?: string;
  permission_ids: string[];
}

export interface RbacRoleUpdateInput extends ApiRecord {
  name?: string;
  description?: string;
  status?: "active" | "inactive";
  expected_version: number;
}

export interface RbacRolePermissionsInput extends ApiRecord {
  permission_ids: string[];
  expected_version: number;
  remarks?: string;
}

export interface AdminWorkflowStageRecord extends ApiRecord {
  id: string;
  order: number;
  approver_type: "Reporting Manager" | "Role" | "Specific User";
  approverType: "Reporting Manager" | "Role" | "Specific User";
  approver_value: string;
  approverValue: string;
  escalate_after_days: number;
  escalateAfterDays: number;
  mandatory_remarks_on_reject: boolean;
  mandatoryRemarksOnReject: boolean;
}

export interface AdminWorkflowRecord extends ApiRecord {
  id: string;
  workflow_key: string;
  key: string;
  module: string;
  label: string;
  status: "active" | "inactive";
  active: boolean;
  stages: AdminWorkflowStageRecord[];
  updated_at: string;
  version: number;
}

export interface AdminWorkflowListResponse extends ApiRecord {
  items: AdminWorkflowRecord[];
  workflows: AdminWorkflowRecord[];
  versions: Record<string, number>;
}

export interface AdminWorkflowStageInput extends ApiRecord {
  id?: string;
  order?: number;
  approver_type?: "Reporting Manager" | "Role" | "Specific User";
  approverType?: "Reporting Manager" | "Role" | "Specific User";
  approver_value?: string;
  approverValue?: string;
  escalate_after_days?: number;
  escalateAfterDays?: number;
  mandatory_remarks_on_reject?: boolean;
  mandatoryRemarksOnReject?: boolean;
}

export interface AdminWorkflowUpdateInput extends ApiRecord {
  label?: string;
  active?: boolean;
  status?: "active" | "inactive";
  stages?: AdminWorkflowStageInput[];
  expected_version: number;
}

export type AdminPolicyValue = string | number | boolean | null;

export interface AdminPolicyRecord extends ApiRecord {
  id: string;
  policy_key: string;
  key: string;
  module: string;
  label: string;
  status: "active" | "inactive";
  active: boolean;
  config: Record<string, AdminPolicyValue>;
  derived_preview?: Record<string, AdminPolicyValue>;
  updated_at: string;
  version: number;
}

export interface AdminPolicyListResponse extends ApiRecord {
  items: AdminPolicyRecord[];
  policies: AdminPolicyRecord[];
  versions: Record<string, number>;
}

export interface AdminPolicyUpdateInput extends ApiRecord {
  label?: string;
  active?: boolean;
  status?: "active" | "inactive";
  config?: Record<string, AdminPolicyValue>;
  expected_version: number;
}

export interface AdminEmailTemplateRecord extends ApiRecord {
  id: string;
  template_key: string;
  key: string;
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

export interface AdminEmailTemplateListResponse extends ApiRecord {
  items: AdminEmailTemplateRecord[];
  templates: AdminEmailTemplateRecord[];
  versions: Record<string, number>;
}

export interface AdminEmailTemplateUpdateInput extends ApiRecord {
  name?: string;
  subject?: string;
  body?: string;
  locale?: string;
  active?: boolean;
  status?: "active" | "inactive";
  expected_version: number;
}

export interface AdminNotificationChannelRecord extends ApiRecord {
  id: string;
  event_key: string;
  key: string;
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

export interface AdminNotificationChannelListResponse extends ApiRecord {
  items: AdminNotificationChannelRecord[];
  channels: AdminNotificationChannelRecord[];
  events: AdminNotificationChannelRecord[];
  versions: Record<string, number>;
  version: number;
}

export interface AdminNotificationChannelInput extends ApiRecord {
  event_key?: string;
  key?: string;
  label?: string;
  in_app_enabled?: boolean;
  inApp?: boolean;
  email_enabled?: boolean;
  email?: boolean;
  push_enabled?: boolean;
  push?: boolean;
  active?: boolean;
  status?: "active" | "inactive";
}

export interface AdminNotificationChannelsUpdateInput extends ApiRecord {
  channels: AdminNotificationChannelInput[];
  expected_version: number;
}

export interface AdminAuditLogEntry extends ApiRecord {
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

export interface AdminSecuritySettingsRecord extends ApiRecord {
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

export interface AdminSecuritySettingsUpdateInput extends ApiRecord {
  password_min_length?: number;
  passwordMinLength?: number;
  password_require_special?: boolean;
  passwordRequireSpecial?: boolean;
  password_require_number?: boolean;
  passwordRequireNumber?: boolean;
  password_expiry_days?: number;
  passwordExpiryDays?: number;
  session_timeout_minutes?: number;
  sessionTimeoutMinutes?: number;
  login_attempt_limit?: number;
  loginAttemptLimit?: number;
  mfa_enabled?: false;
  mfaEnabled?: false;
  audit_role_changes?: boolean;
  auditRoleChanges?: boolean;
  ip_device_audit_enabled?: boolean;
  ipDeviceAuditEnabled?: boolean;
  expected_version: number;
}

export const adminApi = {
  getCompanyProfile() {
    return apiRequest<CompanyProfileResponse>("/api/v1/admin/company-profile");
  },
  updateCompanyProfile(input: CompanyProfileUpdateInput) {
    return apiRequest<CompanyProfileResponse>("/api/v1/admin/company-profile", {
      method: "PUT",
      body: input,
    });
  },
  uploadCompanyLogo(input: FormData) {
    return apiRequest<AdminCompanyLogoUploadResponse>("/api/v1/admin/company-profile/logo", {
      method: "POST",
      body: input,
    });
  },
  listDepartments(
    params: { page?: number; page_size?: number; active_only?: boolean; search?: string } = {},
  ) {
    const path = "/api/v1/admin/master-data/departments";
    return apiRequest<MasterDataListResponse<DepartmentMasterRecord>>(
      `${path}${queryString(params)}`,
    );
  },
  createDepartment(input: DepartmentMasterInput) {
    return apiRequest<{ department: DepartmentMasterRecord; version: number }>(
      "/api/v1/admin/master-data/departments",
      {
        method: "POST",
        body: input,
      },
    );
  },
  updateDepartment(id: string, input: DepartmentMasterInput & { expected_version: number }) {
    return apiRequest<{ department: DepartmentMasterRecord; version: number }>(
      `/api/v1/admin/master-data/departments/${id}`,
      {
        method: "PATCH",
        body: input,
      },
    );
  },
  listDesignations(
    params: { page?: number; page_size?: number; active_only?: boolean; search?: string } = {},
  ) {
    const path = "/api/v1/admin/master-data/designations";
    return apiRequest<MasterDataListResponse<DesignationMasterRecord>>(
      `${path}${queryString(params)}`,
    );
  },
  createDesignation(input: DesignationMasterInput) {
    return apiRequest<{ designation: DesignationMasterRecord; version: number }>(
      "/api/v1/admin/master-data/designations",
      {
        method: "POST",
        body: input,
      },
    );
  },
  updateDesignation(id: string, input: DesignationMasterInput & { expected_version: number }) {
    return apiRequest<{ designation: DesignationMasterRecord; version: number }>(
      `/api/v1/admin/master-data/designations/${id}`,
      {
        method: "PATCH",
        body: input,
      },
    );
  },
  listExtendedMasterData(
    masterKey: ExtendedMasterDataKey,
    params: { page?: number; page_size?: number; active_only?: boolean; search?: string } = {},
  ) {
    const path = `/api/v1/admin/master-data/${masterKey}`;
    return apiRequest<MasterDataListResponse<ExtendedMasterDataRecord>>(
      `${path}${queryString(params)}`,
    );
  },
  createExtendedMasterData(masterKey: ExtendedMasterDataKey, input: ExtendedMasterDataInput) {
    return apiRequest<{ item: ExtendedMasterDataRecord; version: number }>(
      `/api/v1/admin/master-data/${masterKey}`,
      {
        method: "POST",
        body: input,
      },
    );
  },
  updateExtendedMasterData(
    masterKey: ExtendedMasterDataKey,
    id: string,
    input: ExtendedMasterDataInput & { expected_version: number },
  ) {
    return apiRequest<{ item: ExtendedMasterDataRecord; version: number }>(
      `/api/v1/admin/master-data/${masterKey}/${id}`,
      {
        method: "PATCH",
        body: input,
      },
    );
  },
  listShiftTemplates(params: { status?: "active" | "inactive"; search?: string } = {}) {
    const path = "/api/v1/admin/shifts/templates";
    return apiRequest<{ items: ShiftTemplateRecord[]; total: number }>(
      `${path}${queryString(params)}`,
    );
  },
  createShiftTemplate(input: ShiftTemplateCreateInput) {
    return apiRequest<{ template: ShiftTemplateRecord; version: number }>(
      "/api/v1/admin/shifts/templates",
      { method: "POST", body: input },
    );
  },
  updateShiftTemplate(id: string, input: ShiftTemplateUpdateInput) {
    return apiRequest<{ template: ShiftTemplateRecord; version: number }>(
      `/api/v1/admin/shifts/templates/${id}`,
      { method: "PATCH", body: input },
    );
  },
  listShiftVersions(templateId: string) {
    return apiRequest<{
      template: ShiftTemplateRecord;
      items: ShiftVersionRecord[];
      total: number;
    }>(`/api/v1/admin/shifts/templates/${templateId}/versions`);
  },
  createShiftVersion(templateId: string, input: ShiftVersionInput) {
    return apiRequest<{ version: ShiftVersionRecord }>(
      `/api/v1/admin/shifts/templates/${templateId}/versions`,
      { method: "POST", body: input },
    );
  },
  listShiftAssignments(
    params: {
      status?: "active" | "inactive";
      template_id?: string;
      department_id?: string;
      search?: string;
    } = {},
  ) {
    const path = "/api/v1/admin/shifts/assignments";
    return apiRequest<{ items: ShiftAssignmentRecord[]; total: number }>(
      `${path}${queryString(params)}`,
    );
  },
  createShiftAssignments(input: ShiftAssignmentCreateInput) {
    return apiRequest<{
      items: ShiftAssignmentRecord[];
      created_count: number;
      target_type: "employee" | "department";
      target_id: string;
    }>("/api/v1/admin/shifts/assignments", { method: "POST", body: input });
  },
  updateShiftAssignment(
    id: string,
    input: {
      template_id?: string;
      effective_from?: string;
      effective_until?: string | null;
      status?: "active" | "inactive";
      expected_version: number;
    },
  ) {
    return apiRequest<{ assignment: ShiftAssignmentRecord; version: number }>(
      `/api/v1/admin/shifts/assignments/${id}`,
      { method: "PATCH", body: input },
    );
  },
  getShiftReferences() {
    return apiRequest<ShiftReferenceResponse>("/api/v1/admin/shifts/references");
  },
  listRbacRoles(params: { page?: number; page_size?: number; active_only?: boolean } = {}) {
    const path = "/api/v1/admin/rbac/roles";
    return apiRequest<MasterDataListResponse<RbacRoleRecord>>(`${path}${queryString(params)}`);
  },
  createRbacRole(input: RbacRoleInput) {
    return apiRequest<{ role: RbacRoleRecord; version: number }>("/api/v1/admin/rbac/roles", {
      method: "POST",
      body: input,
    });
  },
  updateRbacRole(id: string, input: RbacRoleUpdateInput) {
    return apiRequest<{ role: RbacRoleRecord; version: number }>(`/api/v1/admin/rbac/roles/${id}`, {
      method: "PATCH",
      body: input,
    });
  },
  listRbacPermissions(params: { module?: string; search?: string } = {}) {
    const path = "/api/v1/admin/rbac/permissions";
    return apiRequest<{ items: RbacPermissionRecord[] }>(`${path}${queryString(params)}`);
  },
  replaceRbacRolePermissions(id: string, input: RbacRolePermissionsInput) {
    return apiRequest<{ role: RbacRoleRecord; version: number }>(
      `/api/v1/admin/rbac/roles/${id}/permissions`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminWorkflows(params: { module?: string } = {}) {
    const path = "/api/v1/admin/workflows";
    return apiRequest<AdminWorkflowListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminWorkflow(workflowKey: string, input: AdminWorkflowUpdateInput) {
    return apiRequest<{ workflow: AdminWorkflowRecord; version: number }>(
      `/api/v1/admin/workflows/${workflowKey}`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminPolicies(params: { module?: string; active_only?: boolean } = {}) {
    const path = "/api/v1/admin/policies";
    return apiRequest<AdminPolicyListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminPolicy(policyKey: string, input: AdminPolicyUpdateInput) {
    return apiRequest<{ policy: AdminPolicyRecord; version: number }>(
      `/api/v1/admin/policies/${policyKey}`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminEmailTemplates(
    params: { module?: string; locale?: string; active_only?: boolean } = {},
  ) {
    const path = "/api/v1/admin/email-templates";
    return apiRequest<AdminEmailTemplateListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminEmailTemplate(templateKey: string, input: AdminEmailTemplateUpdateInput) {
    return apiRequest<{ template: AdminEmailTemplateRecord; version: number }>(
      `/api/v1/admin/email-templates/${templateKey}`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminNotificationChannels(params: { module?: string; active_only?: boolean } = {}) {
    const path = "/api/v1/admin/notification-channels";
    return apiRequest<AdminNotificationChannelListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminNotificationChannels(input: AdminNotificationChannelsUpdateInput) {
    return apiRequest<AdminNotificationChannelListResponse>("/api/v1/admin/notification-channels", {
      method: "PUT",
      body: input,
    });
  },
  listAdminAuditLog(
    params: {
      page?: number;
      page_size?: number;
      module?: string;
      actor_user_id?: string;
      from?: string;
      to?: string;
      date_from?: string;
      date_to?: string;
    } = {},
  ) {
    const path = "/api/v1/admin/audit-log";
    return apiRequest<MasterDataListResponse<AdminAuditLogEntry>>(`${path}${queryString(params)}`);
  },
  getAdminSecuritySettings() {
    return apiRequest<AdminSecuritySettingsRecord>("/api/v1/admin/security-settings");
  },
  updateAdminSecuritySettings(input: AdminSecuritySettingsUpdateInput) {
    return apiRequest<{ settings: AdminSecuritySettingsRecord; version: number }>(
      "/api/v1/admin/security-settings",
      {
        method: "PUT",
        body: input,
      },
    );
  },
  getFinanceGovernance() {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance");
  },
  updateFinanceGovernance(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance", {
      method: "PUT",
      body: input,
    });
  },
  listManagerBackups() {
    return apiRequest<ApiRecord[]>("/api/v1/manager-backups");
  },
  createManagerBackup(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/manager-backups", {
      method: "POST",
      body: input,
    });
  },
  deleteManagerBackup(id: string) {
    return apiRequest<void>(`/api/v1/manager-backups/${id}`, { method: "DELETE" });
  },
  createTimesheetWorkflowDefinition(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/timesheets/workflow-definitions", {
      method: "POST",
      body: input,
    });
  },
};

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}
