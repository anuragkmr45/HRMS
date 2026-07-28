import { z } from "zod";
import { AdminEmailTemplateKeys, AdminNotificationEventKeys, AdminPolicyKeys, AdminWorkflowApproverTypes, AdminWorkflowKeys } from "#shared";

export const masterDataQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  active_only: z.coerce.boolean().optional(),
  search: z.string().max(160).optional()
});

export const rbacRolesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  active_only: z.coerce.boolean().optional()
});

export const rbacPermissionsQuerySchema = z.object({
  module: z.string().max(80).optional(),
  search: z.string().max(160).optional()
});

export const rbacRoleCreateSchema = z.object({
  role_key: z.string().min(2).max(80).optional(),
  key: z.string().min(2).max(80).optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  permission_ids: z.array(z.string().min(3).max(120)).default([])
});

export const rbacRoleUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  expected_version: z.number().int().min(1)
});

export const rbacRolePermissionsReplaceSchema = z.object({
  permission_ids: z.array(z.string().min(3).max(120)),
  expected_version: z.number().int().min(1),
  remarks: z.string().max(1000).optional()
});

export const adminWorkflowsQuerySchema = z.object({
  module: z.string().max(80).optional()
});

export const adminPoliciesQuerySchema = z.object({
  module: z.string().max(80).optional(),
  active_only: z.coerce.boolean().optional()
});

export const adminEmailTemplatesQuerySchema = z.object({
  module: z.string().max(80).optional(),
  locale: z.string().max(20).optional(),
  active_only: z.coerce.boolean().optional()
});

export const adminNotificationChannelsQuerySchema = z.object({
  module: z.string().max(80).optional(),
  active_only: z.coerce.boolean().optional()
});

export const adminAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  module: z.string().max(80).optional(),
  actor_user_id: z.uuid().optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  date_from: z.string().max(40).optional(),
  date_to: z.string().max(40).optional()
});

export const adminSecuritySettingsUpdateSchema = z.object({
  password_min_length: z.number().int().min(8).max(128).optional(),
  passwordMinLength: z.number().int().min(8).max(128).optional(),
  password_require_special: z.boolean().optional(),
  passwordRequireSpecial: z.boolean().optional(),
  password_require_number: z.boolean().optional(),
  passwordRequireNumber: z.boolean().optional(),
  password_expiry_days: z.number().int().min(0).max(730).optional(),
  passwordExpiryDays: z.number().int().min(0).max(730).optional(),
  session_timeout_minutes: z.number().int().min(5).max(1440).optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  login_attempt_limit: z.number().int().min(1).max(100).optional(),
  loginAttemptLimit: z.number().int().min(1).max(100).optional(),
  mfa_enabled: z.literal(false).optional(),
  mfaEnabled: z.literal(false).optional(),
  audit_role_changes: z.boolean().optional(),
  auditRoleChanges: z.boolean().optional(),
  ip_device_audit_enabled: z.boolean().optional(),
  ipDeviceAuditEnabled: z.boolean().optional(),
  expected_version: z.number().int().min(1)
});

const workflowStageSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  order: z.number().int().min(1).max(20).optional(),
  approver_type: z.enum(AdminWorkflowApproverTypes).optional(),
  approverType: z.enum(AdminWorkflowApproverTypes).optional(),
  approver_value: z.string().min(1).max(160).optional(),
  approverValue: z.string().min(1).max(160).optional(),
  escalate_after_days: z.number().int().min(0).max(30).optional(),
  escalateAfterDays: z.number().int().min(0).max(30).optional(),
  mandatory_remarks_on_reject: z.boolean().optional(),
  mandatoryRemarksOnReject: z.boolean().optional()
});

export const adminWorkflowUpdateSchema = z.object({
  label: z.string().min(2).max(160).optional(),
  active: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  stages: z.array(workflowStageSchema).min(1).max(20).optional(),
  expected_version: z.number().int().min(1)
});

export const workflowKeyParamSchema = z.object({
  workflow_key: z.enum(AdminWorkflowKeys)
});

const policyConfigValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);

export const adminPolicyUpdateSchema = z.object({
  label: z.string().min(2).max(160).optional(),
  active: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  config: z.record(z.string(), policyConfigValueSchema).optional(),
  expected_version: z.number().int().min(1)
});

export const policyKeyParamSchema = z.object({
  policy_key: z.enum(AdminPolicyKeys)
});

export const adminEmailTemplateUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  subject: z.string().min(2).max(240).optional(),
  body: z.string().min(2).max(5000).optional(),
  active: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  locale: z.string().min(2).max(20).optional(),
  expected_version: z.number().int().min(1)
});

export const emailTemplateKeyParamSchema = z.object({
  template_key: z.enum(AdminEmailTemplateKeys)
});

const adminNotificationChannelInputSchema = z.object({
  event_key: z.enum(AdminNotificationEventKeys).optional(),
  key: z.enum(AdminNotificationEventKeys).optional(),
  label: z.string().min(2).max(160).optional(),
  in_app_enabled: z.boolean().optional(),
  inApp: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  email: z.boolean().optional(),
  push_enabled: z.boolean().optional(),
  push: z.boolean().optional(),
  active: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional()
});

export const adminNotificationChannelsUpdateSchema = z.object({
  channels: z.array(adminNotificationChannelInputSchema).min(1).max(AdminNotificationEventKeys.length),
  expected_version: z.number().int().min(1)
});

const statusSchema = z.enum(["active", "inactive"]);

export const departmentCreateSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(40).optional(),
  department_code: z.string().min(2).max(40).optional(),
  cost_center: z.string().trim().max(80).nullable().optional(),
  parent_id: z.uuid().nullable().optional(),
  parent_department_id: z.uuid().nullable().optional(),
  status: statusSchema.optional()
});

export const departmentUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  code: z.string().min(2).max(40).optional(),
  department_code: z.string().min(2).max(40).optional(),
  cost_center: z.string().trim().max(80).nullable().optional(),
  parent_id: z.uuid().nullable().optional(),
  parent_department_id: z.uuid().nullable().optional(),
  status: statusSchema.optional(),
  expected_version: z.number().int().min(1)
});

export const designationCreateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  title: z.string().min(2).max(160).optional(),
  code: z.string().min(2).max(40).optional(),
  designation_code: z.string().min(2).max(40).optional(),
  level: z.number().int().min(0).max(100).nullable().optional(),
  status: statusSchema.optional()
});

export const designationUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  title: z.string().min(2).max(160).optional(),
  code: z.string().min(2).max(40).optional(),
  designation_code: z.string().min(2).max(40).optional(),
  level: z.number().int().min(0).max(100).nullable().optional(),
  status: statusSchema.optional(),
  expected_version: z.number().int().min(1)
});

export const extendedMasterDataKeys = [
  "employmentTypes",
  "workLocations",
  "shifts",
  "leaveTypes",
  "expenseCategories",
  "assetCategories",
  "helpdeskCategories",
  "projectRoles"
] as const;

export const extendedMasterDataKeyParamSchema = z.object({
  master_key: z.enum(extendedMasterDataKeys)
});

export const extendedMasterDataCreateSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(40).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: statusSchema.optional(),
  sort_order: z.number().int().min(0).max(100000).optional()
});

export const extendedMasterDataUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  code: z.string().min(2).max(40).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: statusSchema.optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  expected_version: z.number().int().min(1)
});

export const companyProfileUpdateSchema = z.object({
  company_name: z.string().min(2).max(160).optional(),
  website: z.string().max(240).nullable().optional(),
  industry: z.string().max(160).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  timezone: z.string().min(2).max(80).optional(),
  locale: z.string().min(2).max(20).optional(),
  currency: z.string().min(2).max(64).optional(),
  fiscal_year_start_month: z.number().int().min(1).max(12).optional(),
  working_week: z.string().min(3).max(40).optional(),
  work_hours_per_day: z.number().min(1).max(24).optional(),
  logo_label: z.string().max(8).nullable().optional(),
  expected_version: z.number().int().min(1)
});

export type MasterDataQuery = z.infer<typeof masterDataQuerySchema>;
export type RbacRolesQuery = z.infer<typeof rbacRolesQuerySchema>;
export type RbacPermissionsQuery = z.infer<typeof rbacPermissionsQuerySchema>;
export type RbacRoleCreateInput = z.infer<typeof rbacRoleCreateSchema>;
export type RbacRoleUpdateInput = z.infer<typeof rbacRoleUpdateSchema>;
export type RbacRolePermissionsReplaceInput = z.infer<typeof rbacRolePermissionsReplaceSchema>;
export type AdminWorkflowsQuery = z.infer<typeof adminWorkflowsQuerySchema>;
export type AdminWorkflowUpdateInput = z.infer<typeof adminWorkflowUpdateSchema>;
export type AdminWorkflowStageInput = z.infer<typeof workflowStageSchema>;
export type AdminPoliciesQuery = z.infer<typeof adminPoliciesQuerySchema>;
export type AdminPolicyUpdateInput = z.infer<typeof adminPolicyUpdateSchema>;
export type AdminEmailTemplatesQuery = z.infer<typeof adminEmailTemplatesQuerySchema>;
export type AdminEmailTemplateUpdateInput = z.infer<typeof adminEmailTemplateUpdateSchema>;
export type AdminNotificationChannelsQuery = z.infer<typeof adminNotificationChannelsQuerySchema>;
export type AdminNotificationChannelsUpdateInput = z.infer<typeof adminNotificationChannelsUpdateSchema>;
export type AdminNotificationChannelInput = z.infer<typeof adminNotificationChannelInputSchema>;
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;
export type AdminSecuritySettingsUpdateInput = z.infer<typeof adminSecuritySettingsUpdateSchema>;
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;
export type DesignationCreateInput = z.infer<typeof designationCreateSchema>;
export type DesignationUpdateInput = z.infer<typeof designationUpdateSchema>;
export type ExtendedMasterDataKey = (typeof extendedMasterDataKeys)[number];
export type ExtendedMasterDataCreateInput = z.infer<typeof extendedMasterDataCreateSchema>;
export type ExtendedMasterDataUpdateInput = z.infer<typeof extendedMasterDataUpdateSchema>;
export type CompanyProfileUpdateInput = z.infer<typeof companyProfileUpdateSchema>;
