import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import type {
  AssetRecord,
  AttendanceDayRecord,
  AttendancePunch,
  AttendanceRegularizationRequest,
  AuthUser,
  CoreUser,
  Department,
  Designation,
  DocumentMetadata,
  EmsAdminChecklist,
  EmsEmployeeProfile,
  EmsLetter,
  EmsPolicy,
  EmsPolicyAcknowledgement,
  EmsProbationReview,
  EmsProfileChangeRequest,
  EmsServiceRequest,
  ExpenseAuditLog,
  ExpenseDocument,
  ExpenseLineItem,
  ExpensePayment,
  FinanceGovernanceConfig,
  HelpdeskCategory,
  HelpdeskTicket,
  HelpdeskTicketAttachment,
  HelpdeskTicketComment,
  HelpdeskTicketEvent,
  ExpenseSubType,
  ExpenseTicket,
  Holiday,
  LeaveRequest,
  ManagerBackupAssignment,
  OutboxEvent,
  ProjectAllocationRecord,
  ProjectMemberRecord,
  ProjectMilestoneRecord,
  ProjectRecord,
  AdminEmailTemplateRecord,
  AdminNotificationChannelRecord,
  AdminPolicyConfigRecord,
  AdminSecuritySettingsRecord,
  AdminWorkflowConfigRecord,
  RbacRolePermissionRecord,
  RbacRoleRecord,
  TimesheetSubmission,
  UUID,
  WfhRequest
} from "#shared";
import {
  AssetStatuses,
  DocumentClassifications,
  EmploymentStatuses,
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  LicenseStatuses,
  PaymentTypes,
  RequiredDocumentsByExpenseSubType,
  Roles,
  EmsLetterStatuses,
  EmsPolicyAcknowledgementStatuses,
  TimesheetStatuses,
  ProjectBillingTypes,
  HelpdeskTicketCategories,
  HelpdeskTicketPriorities,
  HelpdeskTicketStatuses,
  ProjectHealthStatuses,
  ProjectMemberStatuses,
  ProjectMilestoneStatuses,
  ProjectPriorities,
  ProjectStatuses,
  ProjectTypes,
  AdminEmailTemplateKeys,
  type AdminEmailTemplateKey,
  AdminNotificationEventKeys,
  type AdminNotificationEventKey,
  AdminPolicyKeys,
  type AdminPolicyKey,
  AdminWorkflowApproverTypes,
  AdminWorkflowKeys,
  type AdminWorkflowKey,
  RbacPermissionActions,
  RbacPermissionGroups
} from "#shared";
import { MemorySessionStore, getLocalDemoPassword, hashPasswordSync, type SessionStore } from "#auth";
import { getReleaseSeedEmails } from "./seed-personas.js";
import { defaultPdfCompressionOptions, type PdfCompressionOptions } from "./pdf-compression.js";
import type { EmailDeliveryRecord, EmailEventRecord } from "./email/types.js";

export interface NotificationRecord {
  id: UUID;
  actor_user_id: UUID | null;
  target_user_id: UUID | null;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "dead_letter";
  read_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseApprovalRecord {
  id: UUID;
  ticket_id: UUID;
  approval_stage: string;
  approver_user_id: UUID;
  decision: string;
  remarks: string | null;
  role_snapshot: string;
  designation_snapshot: string | null;
  route_snapshot: Record<string, unknown>;
  action_at: string;
  created_at: string;
}

export interface DocumentVersionRecord {
  id: UUID;
  document_id: UUID;
  version: number;
  storage_key: string;
  file_name: string;
  size_bytes: number;
  checksum_sha256: string | null;
  created_by_user_id: UUID;
  created_at: string;
}

export interface DocumentAccessLogRecord {
  id: UUID;
  document_id: UUID;
  actor_user_id: UUID;
  action: string;
  decision: "allowed" | "denied";
  reason: string | null;
  created_at: string;
}

export interface AssetAssignmentRecord {
  id: UUID;
  asset_id: UUID;
  assigned_to_user_id: UUID;
  assigned_by_user_id: UUID;
  assigned_at: string;
  returned_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UserCredentialRecord {
  id: UUID;
  user_id: UUID;
  password_hash: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuthTokenRecord {
  id: UUID;
  token_hash: string;
  token_type: "email_verification" | "password_setup" | "password_reset" | "company_bootstrap";
  user_id: UUID | null;
  email: string | null;
  company_id: UUID | null;
  status: "active" | "used" | "revoked" | "expired";
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_ip_hash: string | null;
  user_agent_hash: string | null;
  last_sent_at: string | null;
  send_count: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface CompanyProfileRecord {
  id: UUID;
  company_name: string;
  company_slug: string;
  website: string | null;
  industry: string | null;
  address: string | null;
  timezone: string;
  locale: string;
  currency: string;
  fiscal_year_start_month: number;
  working_week: string;
  work_hours_per_day: number;
  logo_label: string | null;
  logo_document_id: UUID | null;
  logo_url: string | null;
  logo_file_name: string | null;
  logo_mime_type: string | null;
  logo_size_bytes: number | null;
  status: "pending" | "active" | "inactive";
  bootstrap_completed_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface AdminMasterDataItemRecord {
  id: UUID;
  master_key: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface UserSessionPreferenceRecord {
  id: UUID;
  user_id: UUID;
  active_role: AuthUser["roles"][number];
  company_id: UUID | null;
  landing_page: string;
  locale: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface AssetStateEventRecord {
  id: UUID;
  asset_id: UUID;
  actor_user_id: UUID | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AssetRequestRecord {
  id: UUID;
  request_code: string;
  requester_user_id: UUID;
  request_type: "new" | "replacement" | "repair" | "return";
  asset_type: string;
  asset_id: UUID | null;
  reason: string;
  priority: "low" | "medium" | "high" | "urgent";
  needed_by: string | null;
  preferred_specs: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "returned" | "fulfilled" | "cancelled";
  decision_by_user_id: UUID | null;
  decision_at: string | null;
  decision_remarks: string | null;
  assigned_asset_id: UUID | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssetAcknowledgementRecord {
  id: UUID;
  asset_id: UUID;
  employee_user_id: UUID;
  assignment_id: UUID | null;
  acknowledgement_type: "received" | "returned";
  status: "pending" | "acknowledged";
  acknowledged_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AssetMaintenanceRecord {
  id: UUID;
  asset_id: UUID;
  maintenance_type: "repair" | "preventive" | "warranty" | "inspection" | "other";
  vendor_id: UUID | null;
  cost: string | null;
  started_on: string;
  completed_on: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssetVendorRecord {
  id: UUID;
  name: string;
  status: "active" | "inactive";
  contact_email: string | null;
  phone: string | null;
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type AssetRecoverySettlementStatus = "recovered" | "deduction" | "waived" | "lost_damaged";

export interface AssetRecoveryTicketRecord {
  id: UUID;
  employee_user_id: UUID;
  asset_id: UUID;
  status: string;
  settlement_status: AssetRecoverySettlementStatus | null;
  settlement_amount: string | null;
  settlement_remarks: string | null;
  settled_by_user_id: UUID | null;
  settled_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkSegment {
  id: UUID;
  employee_user_id: UUID;
  work_date: string;
  project_code: string | null;
  task_code: string | null;
  hours: string;
  description: string | null;
  billable: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkflowDefinitionRecord {
  id: UUID;
  name: string;
  module: "timesheets";
  definition: { approver_strategy: "ltree_manager" | "project_manager" | "hr_manager"; require_billable_review: boolean };
  version: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface LicenseEntitlement {
  id: UUID;
  product_id: UUID;
  seat_count: number;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
}

export interface LicenseActivation {
  id: UUID;
  product_id: UUID;
  entitlement_id: UUID;
  hardware_fingerprint_hash: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
}

export interface ObjectStoragePutResult {
  size: number;
  url?: string;
  publicId?: string;
  resourceType?: "image" | "raw" | "video";
  compressed?: boolean;
}

export interface ObjectStorageGetResult {
  body: Buffer;
  contentType?: string;
  size: number;
}

export interface ObjectStoragePort {
  readonly kind: "memory" | "cloudinary";
  readonly bucket: string;
  putObject(key: string, body: Buffer, metadata?: Record<string, string>): Promise<ObjectStoragePutResult>;
  presignedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
  getObject(key: string): Promise<ObjectStorageGetResult | null>;
  statObject(key: string): Promise<{ size: number } | null>;
  removeObject(key: string): Promise<void>;
}

export interface DataStorePersistence {
  flush(): Promise<void>;
  flushAuth?(options?: AuthPersistenceFlushOptions): Promise<void>;
  flushCompanyBootstrap?(options?: AuthPersistenceFlushOptions): Promise<void>;
  flushCompanyLogo?(options?: CompanyLogoPersistenceFlushOptions): Promise<void>;
  flushDomain?(domain: PersistenceDomain, options?: DomainPersistenceFlushOptions): Promise<void>;
  reload(): Promise<void>;
  close(): Promise<void>;
}

export type PersistenceDomain =
  | "core"
  | "platform"
  | "expenses"
  | "documents"
  | "assets"
  | "timesheets"
  | "projects"
  | "helpdesk"
  | "attendance"
  | "leave-wfh"
  | "ems";

export interface DomainPersistenceFlushOptions {
  userIds?: readonly UUID[];
  companyIds?: readonly UUID[];
  documentIds?: readonly UUID[];
  aggregateIds?: readonly UUID[];
  emsProfileChangeRequestIds?: readonly UUID[];
  emsServiceRequestIds?: readonly UUID[];
  emsLetterIds?: readonly UUID[];
  emsPolicyIds?: readonly UUID[];
  emsAdminChecklistIds?: readonly UUID[];
  emsProbationReviewIds?: readonly UUID[];
}

export interface AuthPersistenceFlushOptions {
  userIds?: readonly UUID[];
  companyIds?: readonly UUID[];
}

export interface CompanyLogoPersistenceFlushOptions {
  companyIds?: readonly UUID[];
  documentIds?: readonly UUID[];
}

export interface DocumentProcessingConfig {
  pdfCompression: PdfCompressionOptions;
  mediaUploads: MediaUploadPolicy;
  companyLogoUploads: MediaUploadPolicy;
}

export interface MediaUploadPolicy {
  maxBytes: number;
  imageMaxWidth: number;
  imageMaxHeight: number;
  imageJpegQuality: number;
  allowedMimeTypes: string[];
  imageOutputMimeType: "image/jpeg";
  cloudinaryTransformation: string;
}

export interface DataStore {
  kind: "memory" | "postgres";
  departments: Department[];
  designations: Designation[];
  rbacRoles: RbacRoleRecord[];
  rbacRolePermissions: RbacRolePermissionRecord[];
  adminWorkflows: AdminWorkflowConfigRecord[];
  adminPolicies: AdminPolicyConfigRecord[];
  adminEmailTemplates: AdminEmailTemplateRecord[];
  adminNotificationChannels: AdminNotificationChannelRecord[];
  adminSecuritySettings: AdminSecuritySettingsRecord;
  adminMasterDataItems: AdminMasterDataItemRecord[];
  users: CoreUser[];
  userCredentials: UserCredentialRecord[];
  authTokens: AuthTokenRecord[];
  companyProfiles: CompanyProfileRecord[];
  userSessionPreferences: UserSessionPreferenceRecord[];
  financeGovernanceConfig: FinanceGovernanceConfig | null;
  managerBackupAssignments: ManagerBackupAssignment[];
  tickets: ExpenseTicket[];
  lineItems: ExpenseLineItem[];
  expenseApprovals: ExpenseApprovalRecord[];
  auditLogs: ExpenseAuditLog[];
  expenseDocuments: ExpenseDocument[];
  payments: ExpensePayment[];
  documents: DocumentMetadata[];
  documentVersions: DocumentVersionRecord[];
  documentAccessLogs: DocumentAccessLogRecord[];
  notifications: NotificationRecord[];
  emailDeliveries: EmailDeliveryRecord[];
  emailEvents: EmailEventRecord[];
  outbox: OutboxEvent[];
  assets: AssetRecord[];
  assetAssignments: AssetAssignmentRecord[];
  assetStateEvents: AssetStateEventRecord[];
  assetRequests: AssetRequestRecord[];
  assetAcknowledgements: AssetAcknowledgementRecord[];
  assetMaintenanceRecords: AssetMaintenanceRecord[];
  assetVendors: AssetVendorRecord[];
  assetRecoveryTickets: AssetRecoveryTicketRecord[];
  licenseEntitlements: LicenseEntitlement[];
  licenseActivations: LicenseActivation[];
  compromisedKeys: Array<{ id: UUID; key_hash: string; status: string; created_at: string }>;
  workSegments: WorkSegment[];
  workflowDefinitions: WorkflowDefinitionRecord[];
  timesheetSubmissions: TimesheetSubmission[];
  timesheetActions: Array<{
    id: UUID;
    submission_id: UUID;
    actor_user_id: UUID;
    decision: string;
    remarks: string | null;
    created_at: string;
  }>;
  projects: ProjectRecord[];
  projectMembers: ProjectMemberRecord[];
  projectAllocations: ProjectAllocationRecord[];
  projectMilestones: ProjectMilestoneRecord[];
  helpdeskCategories: HelpdeskCategory[];
  helpdeskTickets: HelpdeskTicket[];
  helpdeskComments: HelpdeskTicketComment[];
  helpdeskAttachments: HelpdeskTicketAttachment[];
  helpdeskEvents: HelpdeskTicketEvent[];
  attendancePunches: AttendancePunch[];
  attendanceDayRecords: AttendanceDayRecord[];
  attendanceRegularizations: AttendanceRegularizationRequest[];
  leaveRequests: LeaveRequest[];
  wfhRequests: WfhRequest[];
  holidays: Holiday[];
  emsEmployeeProfiles: EmsEmployeeProfile[];
  emsProfileChangeRequests: EmsProfileChangeRequest[];
  emsServiceRequests: EmsServiceRequest[];
  emsLetters: EmsLetter[];
  emsPolicies: EmsPolicy[];
  emsPolicyAcknowledgements: EmsPolicyAcknowledgement[];
  emsAdminChecklists: EmsAdminChecklist[];
  emsProbationReviews: EmsProbationReview[];
  processedEvents: Set<string>;
  sessionStore: SessionStore;
  objectStorage: ObjectStoragePort | null;
  documentProcessing: DocumentProcessingConfig;
  persistence: DataStorePersistence | null;
  pgPool: Pool | null;
  nextOutboxId: number;
  nextTicketNo: number;
}

export type MemoryDataStore = DataStore;

export interface SeedIds {
  departmentSales: UUID;
  departmentFinance: UUID;
  designationExecutive: UUID;
  designationManager: UUID;
  designationDirector: UUID;
  designationReviewer: UUID;
  designationFinance: UUID;
  designationEmployee: UUID;
  designationAdmin: UUID;
  designationHrManager: UUID;
  designationProjectManager: UUID;
  designationAssetManager: UUID;
  designationAuditor: UUID;
  designationHelpdeskAgent: UUID;
  designationHelpdeskManager: UUID;
  executive: UUID;
  director: UUID;
  financeManager: UUID;
  alternateFinance: UUID;
  manager: UUID;
  reviewer: UUID;
  employee1: UUID;
  employee2: UUID;
  employee3: UUID;
  admin: UUID;
  auditor: UUID;
  assetManager: UUID;
  financeGovernanceConfig: UUID;
  adminSecuritySettings: UUID;
  workflowDefinition: UUID;
  licenseProduct: UUID;
  entitlement: UUID;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function uuidFromName(name: string): UUID {
  const hash = createHash("sha256").update(name).digest("hex");
  const variant = (8 + (Number.parseInt(hash.slice(16, 17), 16) % 4)).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export const seedIds: SeedIds = {
  departmentSales: uuidFromName("department-sales"),
  departmentFinance: uuidFromName("department-finance"),
  designationExecutive: uuidFromName("designation-executive"),
  designationManager: uuidFromName("designation-manager"),
  designationDirector: uuidFromName("designation-executive"),
  designationReviewer: uuidFromName("designation-manager"),
  designationFinance: uuidFromName("designation-finance"),
  designationEmployee: uuidFromName("designation-employee"),
  designationAdmin: uuidFromName("designation-admin"),
  designationHrManager: uuidFromName("designation-hr-manager"),
  designationProjectManager: uuidFromName("designation-project-manager"),
  designationAssetManager: uuidFromName("designation-asset-manager"),
  designationAuditor: uuidFromName("designation-auditor"),
  designationHelpdeskAgent: uuidFromName("designation-helpdesk-agent"),
  designationHelpdeskManager: uuidFromName("designation-helpdesk-manager"),
  executive: uuidFromName("user-executive"),
  director: uuidFromName("user-executive"),
  financeManager: uuidFromName("user-finance-manager"),
  alternateFinance: uuidFromName("user-alternate-finance"),
  manager: uuidFromName("user-manager-d1"),
  reviewer: uuidFromName("user-manager-d1"),
  employee1: uuidFromName("user-employee-e1"),
  employee2: uuidFromName("user-employee-e2"),
  employee3: uuidFromName("user-employee-e3"),
  admin: uuidFromName("user-admin"),
  auditor: uuidFromName("user-auditor"),
  assetManager: uuidFromName("user-asset-manager"),
  financeGovernanceConfig: uuidFromName("finance-governance-global"),
  adminSecuritySettings: uuidFromName("admin-security-settings-default"),
  workflowDefinition: uuidFromName("workflow-timesheet-default"),
  licenseProduct: uuidFromName("license-product-office"),
  entitlement: uuidFromName("license-entitlement-office")
};

function makeUser(input: {
  id: UUID;
  employeeCode: string;
  email: string;
  name: string;
  departmentId: UUID;
  designationId: UUID;
  managerId: UUID | null;
  path: string;
  roles: AuthUser["roles"];
}): CoreUser {
  return {
    id: input.id,
    employee_code: input.employeeCode,
    email: input.email,
    full_name: input.name,
    department_id: input.departmentId,
    designation_id: input.designationId,
    roles: input.roles,
    employment_status: EmploymentStatuses.Active,
    email_verified_at: "2026-01-01T00:00:00.000Z",
    email_verification_status: "verified",
    profile_photo_document_id: null,
    profile_photo_url: null,
    hierarchy_path: input.path,
    manager_user_id: input.managerId,
    timezone: "Asia/Kolkata",
    joined_on: "2026-01-01",
    terminated_on: null,
    deleted_at: null,
    version: 1
  };
}

function rbacPermissionId(group: string, action: string): string {
  return `${group.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "")}:${action}`;
}

function defaultRbacPermissionsFor(roleKey: string): string[] {
  const all = RbacPermissionGroups.flatMap((group) => RbacPermissionActions.map((action) => rbacPermissionId(group, action)));
  const viewExport = RbacPermissionGroups.flatMap((group) => ["view", "export"].map((action) => rbacPermissionId(group, action)));
  const ids = new Set<string>();
  const set = (group: string, actions: readonly string[]) => actions.forEach((action) => ids.add(rbacPermissionId(group, action)));

  if (roleKey === Roles.Admin) return all;
  if (roleKey === Roles.Auditor) return viewExport;

  set("Dashboard", ["view"]);
  set("EMS", ["view", "create", "edit"]);

  switch (roleKey) {
    case Roles.HRManager:
      set("Employees", ["view", "create", "edit", "export"]);
      set("Attendance", ["view", "edit", "approve", "export"]);
      set("Leave/WFH", ["view", "approve", "export"]);
      set("Reports", ["view", "export"]);
      set("Admin Settings", ["view", "configure"]);
      break;
    case Roles.Employee:
      set("Attendance", ["view", "create"]);
      set("Leave/WFH", ["view", "create"]);
      set("Timesheet", ["view", "create", "edit"]);
      set("Expense Management", ["view", "create"]);
      set("Assets", ["view"]);
      set("Helpdesk", ["view", "create"]);
      break;
    case Roles.Reviewer:
    case Roles.Director:
      set("Employees", ["view"]);
      set("Attendance", ["view", "approve", "export"]);
      set("Leave/WFH", ["view", "approve"]);
      set("Timesheet", ["view", "approve"]);
      set("Expense Management", ["view", "approve"]);
      set("Reports", ["view", "export"]);
      break;
    case Roles.FinanceManager:
      set("Expense Management", ["view", "approve", "export", "configure"]);
      set("Reports", ["view", "export"]);
      break;
    case Roles.AssetManager:
      set("Assets", ["view", "create", "edit", "delete", "approve", "export"]);
      set("Helpdesk", ["view", "edit", "approve"]);
      break;
  }

  return [...ids];
}

function buildDefaultRbac(created: string): {
  roles: RbacRoleRecord[];
  permissions: RbacRolePermissionRecord[];
} {
  const descriptions: Record<string, string> = {
    [Roles.Employee]: "Self-service access for personal HRMS workflows.",
    [Roles.Reviewer]: "Manager/reviewer access for team approvals and queues.",
    [Roles.Director]: "Department leader access for reports and escalated approvals.",
    [Roles.FinanceManager]: "Finance workflow access for expenses, payments, and reports.",
    [Roles.Admin]: "Full administrative access across Hawkaii HRMS.",
    [Roles.Auditor]: "Read-only compliance and audit access.",
    [Roles.AssetManager]: "Asset inventory, request, and recovery management.",
    [Roles.HRManager]: "People operations access for employees, attendance, leave, and HR reports."
  };
  const roles = Object.values(Roles).map((role) => ({
    id: randomUUID(),
    role_key: role,
    name: role,
    description: descriptions[role] ?? role,
    status: "active" as const,
    builtin: true,
    created_at: created,
    updated_at: created,
    deleted_at: null,
    version: 1
  }));
  const permissions = roles.flatMap((role) =>
    defaultRbacPermissionsFor(role.role_key).map((permissionId) => ({
      id: randomUUID(),
      role_key: role.role_key,
      permission_id: permissionId,
      status: "active" as const,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }))
  );
  return { roles, permissions };
}

function workflowStage(
  workflowKey: AdminWorkflowKey,
  order: number,
  approverType: (typeof AdminWorkflowApproverTypes)[number],
  approverValue: string,
  escalateAfterDays: number
): AdminWorkflowConfigRecord["stages"][number] {
  return {
    id: `${workflowKey}_stage_${order}`,
    order,
    approver_type: approverType,
    approver_value: approverValue,
    escalate_after_days: escalateAfterDays,
    mandatory_remarks_on_reject: true
  };
}

export function buildDefaultAdminWorkflows(created: string): AdminWorkflowConfigRecord[] {
  const defaults: Array<{
    key: AdminWorkflowKey;
    module: string;
    label: string;
    stages: AdminWorkflowConfigRecord["stages"];
  }> = [
    {
      key: "leave",
      module: "leave_wfh",
      label: "Leave approval",
      stages: [
        workflowStage("leave", 1, "Reporting Manager", "Direct manager", 2),
        workflowStage("leave", 2, "Role", "HR Admin", 3)
      ]
    },
    {
      key: "wfh",
      module: "leave_wfh",
      label: "WFH approval",
      stages: [workflowStage("wfh", 1, "Reporting Manager", "Direct manager", 1)]
    },
    {
      key: "timesheet",
      module: "timesheets",
      label: "Timesheet approval",
      stages: [
        workflowStage("timesheet", 1, "Reporting Manager", "Direct manager", 2),
        workflowStage("timesheet", 2, "Role", "Project Manager", 2)
      ]
    },
    {
      key: "expense",
      module: "expenses",
      label: "Expense approval",
      stages: [
        workflowStage("expense", 1, "Reporting Manager", "Direct manager", 2),
        workflowStage("expense", 2, "Role", "Finance Manager", 3)
      ]
    },
    {
      key: "asset_request",
      module: "assets",
      label: "Asset request approval",
      stages: [
        workflowStage("asset_request", 1, "Reporting Manager", "Direct manager", 2),
        workflowStage("asset_request", 2, "Role", "IT / Asset Admin", 2)
      ]
    },
    {
      key: "helpdesk_escalation",
      module: "helpdesk",
      label: "Helpdesk escalation",
      stages: [
        workflowStage("helpdesk_escalation", 1, "Role", "Helpdesk Agent", 1),
        workflowStage("helpdesk_escalation", 2, "Role", "Module Owner", 1),
        workflowStage("helpdesk_escalation", 3, "Specific User", "Main Admin", 1)
      ]
    }
  ];

  return defaults.map((workflow) => ({
    id: uuidFromName(`admin-workflow-${workflow.key}`),
    workflow_key: workflow.key,
    module: workflow.module,
    label: workflow.label,
    status: "active",
    stages: workflow.stages,
    created_at: created,
    updated_at: created,
    deleted_at: null,
    version: 1
  }));
}

export function buildDefaultAdminPolicies(created: string, companyId: UUID | null = null): AdminPolicyConfigRecord[] {
  const defaults: Array<{
    key: AdminPolicyKey;
    module: string;
    label: string;
    config: Record<string, unknown>;
  }> = [
    {
      key: "attendance",
      module: "attendance",
      label: "Attendance policy",
      config: {
        graceMinutes: 10,
        halfDayAfterMinutes: 240,
        autoMarkAbsentMinutes: 480,
        allowRegularization: true,
        fullDayPunchWindow: true,
        punchInStart: "09:00",
        punchInEnd: "11:00",
        punchOutStart: "17:00",
        punchOutEnd: "23:59",
        autoPunchOutEnabled: true,
        autoPunchOutTime: "23:59",
        allowOffDayPunches: false
      }
    },
    {
      key: "leave",
      module: "leave_wfh",
      label: "Leave policy",
      config: {
        casualPerYear: 12,
        sickPerYear: 10,
        earnedPerYear: 18,
        carryForwardCap: 30,
        encashmentAllowed: true
      }
    },
    {
      key: "timesheet",
      module: "timesheets",
      label: "Timesheet policy",
      config: {
        weeklyHours: 40,
        minDailyHours: 6,
        submitBy: "Monday 11:00 AM",
        lockAfterApproval: true
      }
    },
    {
      key: "expense",
      module: "expenses",
      label: "Expense policy",
      config: {
        perDayLimit: 5000,
        receiptMandatoryAbove: 500,
        selfApprovalAllowed: false,
        autoEscalateDays: 3
      }
    },
    {
      key: "asset",
      module: "assets",
      label: "Asset policy",
      config: {
        damagePenalty: true,
        mandatoryAck: true,
        returnSlaDays: 5,
        warrantyAlertDays: 60
      }
    },
    {
      key: "sla",
      module: "helpdesk",
      label: "Helpdesk SLA",
      config: {
        urgentResponseHrs: 1,
        urgentResolveHrs: 4,
        highResponseHrs: 4,
        highResolveHrs: 24,
        normalResponseHrs: 8,
        normalResolveHrs: 48,
        lowResponseHrs: 24,
        lowResolveHrs: 96
      }
    }
  ];

  const allowedKeys = new Set(AdminPolicyKeys);
  return defaults
    .filter((policy) => allowedKeys.has(policy.key))
    .map((policy) => ({
      id: companyId ? uuidFromName(`admin-policy-${companyId}-${policy.key}`) : uuidFromName(`admin-policy-${policy.key}`),
      company_id: companyId,
      policy_key: policy.key,
      module: policy.module,
      label: policy.label,
      status: "active",
      config: policy.config,
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    }));
}

export function buildDefaultAdminEmailTemplates(created: string): AdminEmailTemplateRecord[] {
  const defaults: Array<{
    key: AdminEmailTemplateKey;
    module: string;
    name: string;
    subject: string;
    body: string;
  }> = [
    {
      key: "invite",
      module: "auth",
      name: "Employee Invite",
      subject: "Welcome to {{company}} - set up your account",
      body: "Hi {{name}},\n\nYou've been invited to join {{company}} on Hawkaii HRMS. Click the link below to set your password and complete onboarding.\n\n{{link}}\n\n- People Ops"
    },
    {
      key: "verify",
      module: "auth",
      name: "Email Verification",
      subject: "Verify your email for {{company}}",
      body: "Hi {{name}},\n\nPlease verify your email by clicking the link below.\n\n{{link}}\n\nThis link expires in 24 hours."
    },
    {
      key: "reset",
      module: "auth",
      name: "Password Reset",
      subject: "Reset your {{company}} password",
      body: "Hi {{name}},\n\nUse the link below to reset your password. If you didn't request this, you can ignore this email.\n\n{{link}}"
    },
    {
      key: "leave",
      module: "leave_wfh",
      name: "Leave Approval",
      subject: "Your leave request was {{status}}",
      body: "Hi {{name}},\n\nYour leave request from {{from}} to {{to}} has been {{status}} by {{approver}}.\n\nRemarks: {{remarks}}"
    },
    {
      key: "expense",
      module: "expenses",
      name: "Expense Approval",
      subject: "Expense {{id}} {{status}}",
      body: "Hi {{name}},\n\nYour expense claim {{id}} for {{amount}} has been {{status}}.\n\nRemarks: {{remarks}}"
    },
    {
      key: "ts_reminder",
      module: "timesheets",
      name: "Timesheet Reminder",
      subject: "Submit your weekly timesheet",
      body: "Hi {{name}},\n\nFriendly reminder to submit your timesheet for week ending {{week}} before {{deadline}}."
    },
    {
      key: "ticket_update",
      module: "helpdesk",
      name: "Helpdesk Ticket Update",
      subject: "Ticket {{id}} updated - {{status}}",
      body: "Hi {{name}},\n\nTicket {{id}} ({{title}}) is now {{status}}.\n\nLatest update: {{message}}"
    }
  ];

  const allowedKeys = new Set(AdminEmailTemplateKeys);
  return defaults
    .filter((template) => allowedKeys.has(template.key))
    .map((template) => ({
      id: uuidFromName(`admin-email-template-${template.key}`),
      template_key: template.key,
      module: template.module,
      name: template.name,
      subject: template.subject,
      body: template.body,
      locale: "en-IN",
      status: "active",
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    }));
}

export function buildDefaultAdminNotificationChannels(created: string): AdminNotificationChannelRecord[] {
  const defaults: Array<{
    key: AdminNotificationEventKey;
    module: string;
    label: string;
    inApp: boolean;
    email: boolean;
    push: boolean;
  }> = [
    { key: "employee_invited", module: "auth", label: "Employee invited", inApp: true, email: true, push: false },
    { key: "leave_requested", module: "leave_wfh", label: "Leave requested", inApp: true, email: true, push: false },
    { key: "timesheet_submitted", module: "timesheets", label: "Timesheet submitted", inApp: true, email: false, push: false },
    { key: "expense_submitted", module: "expenses", label: "Expense submitted", inApp: true, email: true, push: false },
    { key: "payment_released", module: "expenses", label: "Payment released", inApp: true, email: true, push: false },
    { key: "asset_assigned", module: "assets", label: "Asset assigned", inApp: true, email: true, push: false },
    { key: "ticket_assigned", module: "helpdesk", label: "Helpdesk ticket assigned", inApp: true, email: true, push: false },
    { key: "sla_breached", module: "helpdesk", label: "SLA breached", inApp: true, email: true, push: true }
  ];

  const allowedKeys = new Set(AdminNotificationEventKeys);
  return defaults
    .filter((channel) => allowedKeys.has(channel.key))
    .map((channel) => ({
      id: uuidFromName(`admin-notification-channel-${channel.key}`),
      event_key: channel.key,
      module: channel.module,
      label: channel.label,
      in_app_enabled: channel.inApp,
      email_enabled: channel.email,
      push_enabled: channel.push,
      status: "active",
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    }));
}

export function buildDefaultAdminSecuritySettings(created: string): AdminSecuritySettingsRecord {
  return {
    id: seedIds.adminSecuritySettings,
    settings_key: "default",
    password_min_length: 10,
    password_require_special: false,
    password_require_number: true,
    password_expiry_days: 90,
    session_timeout_minutes: 60,
    login_attempt_limit: 10,
    mfa_enabled: false,
    audit_role_changes: true,
    ip_device_audit_enabled: true,
    created_at: created,
    updated_at: created,
    deleted_at: null,
    version: 1
  };
}

export function buildDefaultAdminMasterDataItems(created: string): AdminMasterDataItemRecord[] {
  const definitions: Array<{
    masterKey: string;
    code: string;
    name: string;
    description?: string;
  }> = [
    { masterKey: "employmentTypes", code: "FULL_TIME", name: "Full-time" },
    { masterKey: "employmentTypes", code: "PART_TIME", name: "Part-time" },
    { masterKey: "employmentTypes", code: "INTERN", name: "Intern" },
    { masterKey: "employmentTypes", code: "CONTRACTOR", name: "Contractor" },
    { masterKey: "workLocations", code: "BENGALURU_HQ", name: "Bengaluru HQ", description: "India" },
    { masterKey: "workLocations", code: "REMOTE_INDIA", name: "Remote India", description: "Distributed" },
    { masterKey: "shifts", code: "GENERAL", name: "General Shift", description: "09:30 - 18:30 IST" },
    { masterKey: "shifts", code: "EU_OVERLAP", name: "EU Overlap", description: "12:00 - 21:00 IST" },
    { masterKey: "leaveTypes", code: "CASUAL", name: "Casual Leave", description: "Annual entitlement" },
    { masterKey: "leaveTypes", code: "SICK", name: "Sick Leave", description: "Medical leave" },
    { masterKey: "expenseCategories", code: "TRAVEL", name: "Travel" },
    { masterKey: "expenseCategories", code: "MEALS", name: "Meals" },
    { masterKey: "assetCategories", code: "LAPTOP", name: "Laptop" },
    { masterKey: "assetCategories", code: "MOBILE", name: "Mobile Device" },
    { masterKey: "helpdeskCategories", code: "IT_SUPPORT", name: "IT Support" },
    { masterKey: "helpdeskCategories", code: "FACILITIES", name: "Facilities" },
    { masterKey: "projectRoles", code: "PROJECT_MANAGER", name: "Project Manager" },
    { masterKey: "projectRoles", code: "DEVELOPER", name: "Developer" }
  ];

  return definitions.map((definition, index) => ({
    id: uuidFromName(`admin-master-data:${definition.masterKey}:${definition.code}`),
    master_key: definition.masterKey,
    code: definition.code,
    name: definition.name,
    description: definition.description ?? null,
    status: "active",
    sort_order: (index + 1) * 10,
    metadata: {},
    created_at: created,
    updated_at: created,
    deleted_at: null,
    version: 1
  }));
}

export function createMemoryDataStore(): MemoryDataStore {
  const created = nowIso();
  const releaseSeedEmails = getReleaseSeedEmails();
  const defaultRbac = buildDefaultRbac(created);
  const defaultAdminWorkflows = buildDefaultAdminWorkflows(created);
  const defaultAdminPolicies = buildDefaultAdminPolicies(created);
  const defaultAdminEmailTemplates = buildDefaultAdminEmailTemplates(created);
  const defaultAdminNotificationChannels = buildDefaultAdminNotificationChannels(created);
  const defaultAdminSecuritySettings = buildDefaultAdminSecuritySettings(created);
  const defaultAdminMasterDataItems = buildDefaultAdminMasterDataItems(created);
  const departments: Department[] = [
    {
      id: seedIds.departmentSales,
      company_id: null,
      department_code: "SALES",
      name: "Sales",
      cost_center: "CC-SALES",
      parent_department_id: null,
      director_user_id: seedIds.executive,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.departmentFinance,
      company_id: null,
      department_code: "FIN",
      name: "Finance",
      cost_center: "CC-FIN",
      parent_department_id: null,
      director_user_id: seedIds.financeManager,
      status: "active",
      deleted_at: null,
      version: 1
    }
  ];

  const designations: Designation[] = [
    {
      id: seedIds.designationExecutive,
      company_id: null,
      designation_code: "EXECUTIVE",
      title: "Executive",
      level: 10,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationManager,
      company_id: null,
      designation_code: "MANAGER",
      title: "Manager",
      level: 6,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: uuidFromName("designation-director"),
      company_id: null,
      designation_code: "DIRECTOR",
      title: "Director",
      level: 10,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: uuidFromName("designation-reviewer"),
      company_id: null,
      designation_code: "REVIEWER",
      title: "Reviewer",
      level: 6,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationFinance,
      company_id: null,
      designation_code: "FINANCE_MANAGER",
      title: "Finance Manager",
      level: 8,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationEmployee,
      company_id: null,
      designation_code: "EMPLOYEE",
      title: "Employee",
      level: 1,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationAdmin,
      company_id: null,
      designation_code: "ADMIN",
      title: "Admin",
      level: 9,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationHrManager,
      company_id: null,
      designation_code: "HR_MANAGER",
      title: "HR Manager",
      level: 7,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationProjectManager,
      company_id: null,
      designation_code: "PROJECT_MANAGER",
      title: "Project Manager",
      level: 6,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationAssetManager,
      company_id: null,
      designation_code: "ASSET_MANAGER",
      title: "Asset Manager",
      level: 6,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationAuditor,
      company_id: null,
      designation_code: "AUDITOR",
      title: "Auditor",
      level: 5,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationHelpdeskAgent,
      company_id: null,
      designation_code: "HELPDESK_AGENT",
      title: "Helpdesk Agent",
      level: 3,
      status: "active",
      deleted_at: null,
      version: 1
    },
    {
      id: seedIds.designationHelpdeskManager,
      company_id: null,
      designation_code: "HELPDESK_MANAGER",
      title: "Helpdesk Manager",
      level: 6,
      status: "active",
      deleted_at: null,
      version: 1
    }
  ];

  const users: CoreUser[] = [
    makeUser({
      id: seedIds.executive,
      employeeCode: "S1",
      email: releaseSeedEmails.director,
      name: "Sales Executive",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationExecutive,
      managerId: null,
      path: "CEO.SALES.S1",
      roles: [Roles.Employee, Roles.Reviewer]
    }),
    makeUser({
      id: seedIds.manager,
      employeeCode: "D1",
      email: releaseSeedEmails.reviewer,
      name: "Manager D1",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationManager,
      managerId: seedIds.executive,
      path: "CEO.SALES.S1.D1",
      roles: [Roles.Employee, Roles.Reviewer]
    }),
    makeUser({
      id: seedIds.employee1,
      employeeCode: "E1",
      email: releaseSeedEmails.employee1,
      name: "Employee E1",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationEmployee,
      managerId: seedIds.manager,
      path: "CEO.SALES.S1.D1.E1",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.employee2,
      employeeCode: "E2",
      email: releaseSeedEmails.employee2,
      name: "Employee E2",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationEmployee,
      managerId: seedIds.manager,
      path: "CEO.SALES.S1.D1.E2",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.employee3,
      employeeCode: "E3",
      email: releaseSeedEmails.employee3,
      name: "Employee E3",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationEmployee,
      managerId: seedIds.manager,
      path: "CEO.SALES.S1.D1.E3",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.financeManager,
      employeeCode: "N1",
      email: releaseSeedEmails.financeManager,
      name: "Finance Manager N1",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.FIN.N1",
      roles: [Roles.FinanceManager]
    }),
    makeUser({
      id: seedIds.alternateFinance,
      employeeCode: "N2",
      email: releaseSeedEmails.alternateFinance,
      name: "Alternate Finance N2",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: seedIds.financeManager,
      path: "CEO.FIN.N1.N2",
      roles: [Roles.FinanceManager]
    }),
    makeUser({
      id: seedIds.admin,
      employeeCode: "ADM",
      email: releaseSeedEmails.admin,
      name: "Admin User",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.ADM",
      roles: [Roles.Admin]
    }),
    makeUser({
      id: seedIds.auditor,
      employeeCode: "AUD",
      email: releaseSeedEmails.auditor,
      name: "Auditor User",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.AUD",
      roles: [Roles.Auditor]
    }),
    makeUser({
      id: seedIds.assetManager,
      employeeCode: "AST",
      email: releaseSeedEmails.assetManager,
      name: "Asset Manager",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.AST",
      roles: [Roles.AssetManager]
    })
  ];

  const managerBackupAssignments: ManagerBackupAssignment[] = [seedIds.employee1, seedIds.employee2, seedIds.employee3].map(
    (employeeId) => ({
      id: randomUUID(),
      employee_user_id: employeeId,
      backup_manager_user_id: seedIds.executive,
      assigned_by_user_id: seedIds.admin,
      effective_from: "2026-01-01",
      effective_to: null,
      status: "active",
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    })
  );

  const localDemoPassword = getLocalDemoPassword();
  const userCredentials: UserCredentialRecord[] = users.map((user) => ({
    id: uuidFromName(`credential-${user.employee_code}`),
    user_id: user.id,
    password_hash: hashPasswordSync(localDemoPassword, `hrms-local-${user.employee_code.toLowerCase()}`),
    status: "active",
    created_at: created,
    updated_at: created,
    deleted_at: null
  }));

  const financeGovernanceConfig: FinanceGovernanceConfig = {
    id: seedIds.financeGovernanceConfig,
    scope_key: "global",
    primary_finance_manager_user_id: seedIds.financeManager,
    manager_backup_user_id: seedIds.executive,
    finance_approval_backup_user_id: seedIds.alternateFinance,
    status: "active",
    effective_from: "2026-01-01",
    effective_to: null,
    updated_by_user_id: seedIds.admin,
    created_at: created,
    updated_at: created,
    deleted_at: null,
    version: 1
  };

  const firstAssetId = uuidFromName("asset-laptop-001");
  const emsEmployeeProfiles: EmsEmployeeProfile[] = users.map((user) => ({
    id: uuidFromName(`ems-profile-${user.employee_code}`),
    employee_user_id: user.id,
    personal_email: `${user.employee_code.toLowerCase()}-personal@example.test`,
    phone: "+91 98000 00000",
    alternate_phone: null,
    current_address: "Bangalore, India",
    permanent_address: "Bangalore, India",
    city: "Bangalore",
    country: "India",
    emergency_contact: { name: "Emergency Contact", relation: "Family", phone: "+91 99000 00000" },
    personal_details: { nationality: "Indian", marital_status: "Not specified" },
    work_preferences: { work_mode: "Hybrid" },
    version: 1,
    created_at: created,
    updated_at: created,
    deleted_at: null
  }));
  const emsLetters: EmsLetter[] = [
    {
      id: uuidFromName("ems-letter-e1-offer"),
      employee_user_id: seedIds.employee1,
      letter_type: "offer_letter",
      title: "Offer Letter",
      description: "Initial offer from Hawkaii HRMS",
      status: EmsLetterStatuses.Available,
      document_id: null,
      issued_on: "2026-01-01",
      acknowledged_at: null,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("ems-letter-e1-salary-certificate"),
      employee_user_id: seedIds.employee1,
      letter_type: "salary_certificate",
      title: "Salary Certificate",
      description: "For loans, visas, and account opening",
      status: EmsLetterStatuses.InProgress,
      document_id: null,
      issued_on: null,
      acknowledged_at: null,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const emsPolicies: EmsPolicy[] = [
    {
      id: uuidFromName("ems-policy-attendance"),
      policy_code: "ATTENDANCE",
      title: "Attendance policy",
      category: "Attendance",
      version_label: "v3.1",
      effective_from: "2026-01-12",
      document_id: null,
      status: "active",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("ems-policy-leave"),
      policy_code: "LEAVE",
      title: "Leave policy",
      category: "Leave",
      version_label: "v4.0",
      effective_from: "2026-06-01",
      document_id: null,
      status: "active",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("ems-policy-wfh"),
      policy_code: "WFH",
      title: "Work from home policy",
      category: "Workplace",
      version_label: "v2.0",
      effective_from: "2026-03-15",
      document_id: null,
      status: "active",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const emsPolicyAcknowledgements: EmsPolicyAcknowledgement[] = emsPolicies.map((policy) => ({
    id: uuidFromName(`ems-policy-ack-${policy.policy_code}-e1`),
    policy_id: policy.id,
    employee_user_id: seedIds.employee1,
    status: policy.policy_code === "LEAVE" ? EmsPolicyAcknowledgementStatuses.Pending : EmsPolicyAcknowledgementStatuses.Acknowledged,
    acknowledged_at: policy.policy_code === "LEAVE" ? null : created,
    version: 1,
    created_at: created,
    updated_at: created
  }));
  const emsAdminChecklists: EmsAdminChecklist[] = [
    {
      id: uuidFromName("ems-onboarding-e2"),
      checklist_type: "onboarding",
      employee_user_id: seedIds.employee2,
      status: "in_progress",
      due_date: "2026-06-10",
      checklist: {
        offer: true,
        docs: false,
        assets: false,
        access: false,
        orientation: false
      },
      remarks: null,
      completed_at: null,
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    },
    {
      id: uuidFromName("ems-exit-e3"),
      checklist_type: "exit",
      employee_user_id: seedIds.employee3,
      status: "in_progress",
      due_date: "2026-05-31",
      checklist: {
        clearance: true,
        assets: false,
        finance: false,
        letter: false
      },
      remarks: null,
      completed_at: null,
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    }
  ];
  const emsProbationReviews: EmsProbationReview[] = [
    {
      id: uuidFromName("ems-probation-e1"),
      employee_user_id: seedIds.employee1,
      joining_on: "2026-01-01",
      due_on: "2026-07-01",
      status: "pending",
      extended_until: null,
      remarks: null,
      decided_by_user_id: null,
      decided_at: null,
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    }
  ];
  const projectHawkaiiId = uuidFromName("project-hawkaii-hrms");
  const projectFinanceId = uuidFromName("project-finance-automation");
  const projectMembers: ProjectMemberRecord[] = [
    {
      id: uuidFromName("project-hawkaii-hrms-member-e1"),
      project_id: projectHawkaiiId,
      employee_user_id: seedIds.employee1,
      project_role: "Engineer",
      allocation_percent: 80,
      billable: false,
      start_date: "2026-05-01",
      end_date: null,
      reporting_lead_user_id: seedIds.manager,
      status: ProjectMemberStatuses.Active,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("project-hawkaii-hrms-member-e2"),
      project_id: projectHawkaiiId,
      employee_user_id: seedIds.employee2,
      project_role: "QA Analyst",
      allocation_percent: 60,
      billable: false,
      start_date: "2026-05-01",
      end_date: null,
      reporting_lead_user_id: seedIds.manager,
      status: ProjectMemberStatuses.Active,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("project-finance-automation-member-e2"),
      project_id: projectFinanceId,
      employee_user_id: seedIds.employee2,
      project_role: "Implementation Engineer",
      allocation_percent: 50,
      billable: true,
      start_date: "2026-04-15",
      end_date: null,
      reporting_lead_user_id: seedIds.financeManager,
      status: ProjectMemberStatuses.Active,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const projectAllocations: ProjectAllocationRecord[] = projectMembers.map((member) => ({
    id: uuidFromName(`allocation-${member.id}`),
    project_id: member.project_id,
    employee_user_id: member.employee_user_id,
    date_from: member.start_date,
    date_to: member.end_date,
    allocation_percent: member.allocation_percent,
    billable: member.billable,
    notes: "Seed allocation",
    version: 1,
    created_at: created,
    updated_at: created,
    deleted_at: null
  }));
  const projectMilestones: ProjectMilestoneRecord[] = [
    {
      id: uuidFromName("project-hawkaii-hrms-milestone-core"),
      project_id: projectHawkaiiId,
      name: "Core HR workflows",
      owner_user_id: seedIds.employee1,
      status: ProjectMilestoneStatuses.InProgress,
      start_date: "2026-05-01",
      due_date: "2026-07-31",
      priority: ProjectPriorities.High,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("project-finance-automation-milestone-expense"),
      project_id: projectFinanceId,
      name: "Expense finance automation",
      owner_user_id: seedIds.employee2,
      status: ProjectMilestoneStatuses.Planned,
      start_date: "2026-06-01",
      due_date: "2026-08-31",
      priority: ProjectPriorities.Medium,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const projects: ProjectRecord[] = [
    {
      id: projectHawkaiiId,
      project_code: "HAW-HRMS",
      name: "Hawkaii HRMS Production Readiness",
      client_name: "Hawkaii",
      project_type: ProjectTypes.Internal,
      billing_type: ProjectBillingTypes.Internal,
      manager_user_id: seedIds.manager,
      department_id: seedIds.departmentSales,
      start_date: "2026-05-01",
      end_date: "2026-09-30",
      status: ProjectStatuses.Active,
      health: ProjectHealthStatuses.Green,
      description: "Internal HRMS implementation and production readiness program.",
      estimated_hours: "2400.00",
      actual_hours: "320.00",
      estimated_budget: "0.00",
      actual_spend: "0.00",
      tech_stack: ["TypeScript", "Fastify", "React"],
      priority: ProjectPriorities.High,
      cost_center: "CC-INT-HRMS",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: projectFinanceId,
      project_code: "FIN-AUTO",
      name: "Finance Automation Rollout",
      client_name: "Internal Finance",
      project_type: ProjectTypes.Internal,
      billing_type: ProjectBillingTypes.Internal,
      manager_user_id: seedIds.financeManager,
      department_id: seedIds.departmentFinance,
      start_date: "2026-04-15",
      end_date: "2026-08-31",
      status: ProjectStatuses.Active,
      health: ProjectHealthStatuses.Amber,
      description: "Finance workflow automation and reporting rollout.",
      estimated_hours: "1200.00",
      actual_hours: "180.00",
      estimated_budget: "0.00",
      actual_spend: "0.00",
      tech_stack: ["Fastify", "PostgreSQL"],
      priority: ProjectPriorities.Medium,
      cost_center: "CC-FIN-AUTO",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const helpdeskCategories: HelpdeskCategory[] = [
    {
      id: uuidFromName("helpdesk-category-it"),
      category_key: HelpdeskTicketCategories.IT,
      label: "IT Support",
      default_assignee_user_id: seedIds.assetManager,
      default_assignee_name: "Asset Manager",
      default_assignee_role: Roles.AssetManager,
      team: "IT Operations",
      active: true,
      sub_categories: [
        { key: "vpn", label: "VPN / Network" },
        { key: "email", label: "Email / Calendar" },
        { key: "software", label: "Software install" },
        { key: "hardware", label: "Hardware issue" },
        { key: "access", label: "Access / Permissions" }
      ],
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("helpdesk-category-hr"),
      category_key: HelpdeskTicketCategories.HR,
      label: "HR",
      default_assignee_user_id: seedIds.admin,
      default_assignee_name: "Admin User",
      default_assignee_role: Roles.Admin,
      team: "People Ops",
      active: true,
      sub_categories: [
        { key: "leave", label: "Leave query" },
        { key: "policy", label: "Policy clarification" },
        { key: "letter", label: "Letter request" },
        { key: "payroll", label: "Payroll query" }
      ],
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("helpdesk-category-finance"),
      category_key: HelpdeskTicketCategories.Finance,
      label: "Finance",
      default_assignee_user_id: seedIds.financeManager,
      default_assignee_name: "Finance Manager N1",
      default_assignee_role: Roles.FinanceManager,
      team: "Finance",
      active: true,
      sub_categories: [
        { key: "reimburse", label: "Reimbursement" },
        { key: "invoice", label: "Invoice / GST" },
        { key: "advance", label: "Advance request" }
      ],
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("helpdesk-category-admin"),
      category_key: HelpdeskTicketCategories.Admin,
      label: "Admin / Facilities",
      default_assignee_user_id: seedIds.assetManager,
      default_assignee_name: "Asset Manager",
      default_assignee_role: Roles.AssetManager,
      team: "Admin",
      active: true,
      sub_categories: [
        { key: "seat", label: "Seat / Workspace" },
        { key: "travel", label: "Travel" },
        { key: "stationery", label: "Stationery" }
      ],
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("helpdesk-category-assets"),
      category_key: HelpdeskTicketCategories.Assets,
      label: "Assets",
      default_assignee_user_id: seedIds.assetManager,
      default_assignee_name: "Asset Manager",
      default_assignee_role: Roles.AssetManager,
      team: "IT Operations",
      active: true,
      sub_categories: [
        { key: "request", label: "New asset" },
        { key: "repair", label: "Repair" },
        { key: "return", label: "Return" }
      ],
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("helpdesk-category-project-support"),
      category_key: HelpdeskTicketCategories.ProjectSupport,
      label: "Project Support",
      default_assignee_user_id: seedIds.manager,
      default_assignee_name: "Manager D1",
      default_assignee_role: Roles.Employee,
      team: "Engineering",
      active: true,
      sub_categories: [
        { key: "tooling", label: "Tooling / CI" },
        { key: "infra", label: "Infrastructure" },
        { key: "client", label: "Client coordination" }
      ],
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const helpdeskTickets: HelpdeskTicket[] = [
    {
      id: uuidFromName("helpdesk-ticket-12001"),
      ticket_no: "TKT-12001",
      subject: "VPN not connecting from office",
      description: "Corporate VPN times out from the office network and from tethering.",
      category_id: helpdeskCategories[0]!.id,
      category_key: HelpdeskTicketCategories.IT,
      sub_category: "vpn",
      priority: HelpdeskTicketPriorities.High,
      status: HelpdeskTicketStatuses.InProgress,
      requester_user_id: seedIds.employee1,
      requester_name: "Employee E1",
      requester_email: "e1@example.test",
      requester_department: "Sales",
      assignee_user_id: seedIds.assetManager,
      assignee_name: "Asset Manager",
      assignee_role: Roles.AssetManager,
      related_asset_id: null,
      related_project_id: projectHawkaiiId,
      first_response_at: created,
      resolved_at: null,
      closed_at: null,
      resolution: null,
      reopen_count: 0,
      escalated: false,
      version: 2,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("helpdesk-ticket-12002"),
      ticket_no: "TKT-12002",
      subject: "Update payroll bank account",
      description: "Please update payroll bank details for the next cycle.",
      category_id: helpdeskCategories[2]!.id,
      category_key: HelpdeskTicketCategories.Finance,
      sub_category: "payroll",
      priority: HelpdeskTicketPriorities.Medium,
      status: HelpdeskTicketStatuses.Assigned,
      requester_user_id: seedIds.employee2,
      requester_name: "Employee E2",
      requester_email: "e2@example.test",
      requester_department: "Sales",
      assignee_user_id: seedIds.financeManager,
      assignee_name: "Finance Manager N1",
      assignee_role: Roles.FinanceManager,
      related_asset_id: null,
      related_project_id: null,
      first_response_at: null,
      resolved_at: null,
      closed_at: null,
      resolution: null,
      reopen_count: 0,
      escalated: false,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const helpdeskComments: HelpdeskTicketComment[] = [
    {
      id: uuidFromName("helpdesk-comment-12001-1"),
      ticket_id: helpdeskTickets[0]!.id,
      author_user_id: seedIds.assetManager,
      author_name: "Asset Manager",
      author_role: Roles.AssetManager,
      body: "Checking VPN gateway logs and office network routes.",
      internal: false,
      document_ids: [],
      created_at: created,
      deleted_at: null
    }
  ];
  const helpdeskAttachments: HelpdeskTicketAttachment[] = [];
  const helpdeskEvents: HelpdeskTicketEvent[] = [
    {
      id: uuidFromName("helpdesk-event-12001-created"),
      ticket_id: helpdeskTickets[0]!.id,
      actor_user_id: seedIds.employee1,
      actor_name: "Employee E1",
      action: "Ticket created",
      detail: null,
      created_at: created
    },
    {
      id: uuidFromName("helpdesk-event-12001-assigned"),
      ticket_id: helpdeskTickets[0]!.id,
      actor_user_id: null,
      actor_name: "System",
      action: "Auto-assigned",
      detail: "Assigned to Asset Manager",
      created_at: created
    },
    {
      id: uuidFromName("helpdesk-event-12002-created"),
      ticket_id: helpdeskTickets[1]!.id,
      actor_user_id: seedIds.employee2,
      actor_name: "Employee E2",
      action: "Ticket created",
      detail: null,
      created_at: created
    }
  ];
  const notifications: NotificationRecord[] = [
    {
      id: uuidFromName("notification-e1-helpdesk-ticket"),
      actor_user_id: seedIds.assetManager,
      target_user_id: seedIds.employee1,
      event_type: "helpdesk.ticket_assigned",
      payload: {
        title: "High priority ticket update",
        description: "TKT-12001 - VPN connectivity issue is assigned and in progress.",
        category: "alert",
        action_url: "/helpdesk/TKT-12001"
      },
      status: "pending",
      read_at: null,
      version: 1,
      created_at: created,
      updated_at: created
    },
    {
      id: uuidFromName("notification-manager-timesheet"),
      actor_user_id: seedIds.employee1,
      target_user_id: seedIds.manager,
      event_type: "timesheet.submitted",
      payload: {
        title: "Timesheet submitted",
        description: "Employee E1 submitted the current week for approval.",
        category: "approval",
        action_url: "/timesheet/approvals"
      },
      status: "pending",
      read_at: null,
      version: 1,
      created_at: created,
      updated_at: created
    },
    {
      id: uuidFromName("notification-finance-expense-paid"),
      actor_user_id: seedIds.financeManager,
      target_user_id: seedIds.employee2,
      event_type: "expense.payment_released",
      payload: {
        title: "Expense paid",
        description: "Your reimbursement has been released by Finance.",
        category: "system",
        action_url: "/expenses/my"
      },
      status: "sent",
      read_at: created,
      version: 1,
      created_at: created,
      updated_at: created
    }
  ];
  return {
    kind: "memory",
    departments,
    designations,
    rbacRoles: defaultRbac.roles,
    rbacRolePermissions: defaultRbac.permissions,
    adminWorkflows: defaultAdminWorkflows,
    adminPolicies: defaultAdminPolicies,
    adminEmailTemplates: defaultAdminEmailTemplates,
    adminNotificationChannels: defaultAdminNotificationChannels,
    adminSecuritySettings: defaultAdminSecuritySettings,
    adminMasterDataItems: defaultAdminMasterDataItems,
    users,
    userCredentials,
    authTokens: [],
    companyProfiles: [],
    userSessionPreferences: [],
    financeGovernanceConfig,
    managerBackupAssignments,
    tickets: [],
    lineItems: [],
    expenseApprovals: [],
    auditLogs: [],
    expenseDocuments: [],
    payments: [],
    documents: [],
    documentVersions: [],
    documentAccessLogs: [],
    notifications,
    emailDeliveries: [],
    emailEvents: [],
    outbox: [],
    assets: [
      {
        id: firstAssetId,
        asset_code: "LAP-001",
        qr_hash: createQrHash("LAP-001"),
        asset_type: "Laptop",
        name: "ThinkPad T-Series",
        serial_no: "SN-LAP-001",
        status: AssetStatuses.InStock,
        current_assigned_user_id: null,
        metadata: { procurement_cost: "65000.00" },
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      }
    ],
    assetAssignments: [],
    assetStateEvents: [],
    assetRequests: [],
    assetAcknowledgements: [],
    assetMaintenanceRecords: [],
    assetVendors: [
      {
        id: uuidFromName("asset-vendor-lenovo"),
        name: "Lenovo India",
        status: "active",
        contact_email: "support@lenovo.example.test",
        phone: null,
        metadata: { warranty_partner: true },
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      }
    ],
    assetRecoveryTickets: [],
    licenseEntitlements: [
      {
        id: seedIds.entitlement,
        product_id: seedIds.licenseProduct,
        seat_count: 1,
        status: LicenseStatuses.Active,
        created_at: created,
        updated_at: created
      }
    ],
    licenseActivations: [],
    compromisedKeys: [],
    workSegments: [],
    workflowDefinitions: [
      {
        id: seedIds.workflowDefinition,
        name: "Default ltree manager approval",
        module: "timesheets",
        definition: { approver_strategy: "ltree_manager", require_billable_review: false },
        version: 1,
        status: "active",
        created_at: created,
        updated_at: created
      }
    ],
    timesheetSubmissions: [],
    timesheetActions: [],
    projects,
    projectMembers,
    projectAllocations,
    projectMilestones,
    helpdeskCategories,
    helpdeskTickets,
    helpdeskComments,
    helpdeskAttachments,
    helpdeskEvents,
    attendancePunches: [],
    attendanceDayRecords: [],
    attendanceRegularizations: [],
    leaveRequests: [],
    wfhRequests: [],
    holidays: [
      {
        id: uuidFromName("holiday-2026-republic-day"),
        name: "Republic Day",
        holiday_date: "2026-01-26",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      },
      {
        id: uuidFromName("holiday-2026-holi"),
        name: "Holi",
        holiday_date: "2026-03-04",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      },
      {
        id: uuidFromName("holiday-2026-independence-day"),
        name: "Independence Day",
        holiday_date: "2026-08-15",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      },
      {
        id: uuidFromName("holiday-2026-diwali"),
        name: "Diwali",
        holiday_date: "2026-11-08",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      }
    ],
    emsEmployeeProfiles,
    emsProfileChangeRequests: [],
    emsServiceRequests: [],
    emsLetters,
    emsPolicies,
    emsPolicyAcknowledgements,
    emsAdminChecklists,
    emsProbationReviews,
    processedEvents: new Set<string>(),
    sessionStore: new MemorySessionStore(),
    objectStorage: null,
    documentProcessing: {
      pdfCompression: defaultPdfCompressionOptions(),
      mediaUploads: defaultMediaUploadPolicy(),
      companyLogoUploads: defaultCompanyLogoUploadPolicy()
    },
    persistence: null,
    pgPool: null,
    nextOutboxId: 1,
    nextTicketNo: 1
  };
}

function defaultMediaUploadPolicy(): MediaUploadPolicy {
  return {
    maxBytes: 10 * 1024 * 1024,
    imageMaxWidth: 1600,
    imageMaxHeight: 1600,
    imageJpegQuality: 0.82,
    allowedMimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ],
    imageOutputMimeType: "image/jpeg",
    cloudinaryTransformation: "q_auto:eco,f_auto"
  };
}

function defaultCompanyLogoUploadPolicy(): MediaUploadPolicy {
  return {
    maxBytes: 2 * 1024 * 1024,
    imageMaxWidth: 512,
    imageMaxHeight: 512,
    imageJpegQuality: 0.82,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    imageOutputMimeType: "image/jpeg",
    cloudinaryTransformation: "c_fit,w_512,h_512,q_auto:eco,f_auto"
  };
}

export function createQrHash(seed: string): string {
  return createHash("sha256")
    .update(`${seed}:${randomBytes(8).toString("hex")}`)
    .digest("base64url")
    .slice(0, 32);
}

export function sanitizeFilename(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const name = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "bin";
  const safeName = name.replace(/[^a-zA-Z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "");
  return `${safeName || "document"}.${ext.replace(/[^a-z0-9]/gu, "") || "bin"}`;
}

export function makeStorageKey(input: {
  actor: AuthUser;
  documentType: string;
  fileName: string;
  version: number;
}): string {
  const safe = sanitizeFilename(input.fileName);
  const ext = safe.includes(".") ? safe.split(".").at(-1) ?? "bin" : "bin";
  const date = new Date().toISOString().slice(0, 10);
  return `${date}_${input.actor.employee_code}_${sanitizeFilename(input.documentType).replace(/\.[^.]+$/u, "")}_v${input.version}_${randomUUID()}.${ext}`;
}

export function getRequiredDocuments(subType: ExpenseSubType): readonly string[] {
  return RequiredDocumentsByExpenseSubType[subType];
}

export { DocumentClassifications, ExpenseStatuses, ExpenseSubTypes, ExpenseTypes, PaymentTypes };
