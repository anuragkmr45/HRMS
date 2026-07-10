import type {
  AssetStatus,
  AttendanceDayStatus,
  AttendancePunchEventType,
  AttendanceRegularizationStatus,
  DocumentClassification,
  EmsLetterStatus,
  EmsPolicyAcknowledgementStatus,
  EmsProfileChangeStatus,
  EmsServiceRequestStatus,
  EmsServiceRequestType,
  EmploymentStatus,
  ExpenseStatus,
  ExpenseSubType,
  ExpenseType,
  HelpdeskTicketCategory,
  HelpdeskTicketPriority,
  HelpdeskTicketStatus,
  LeaveRequestStatus,
  LeaveType,
  PaymentType,
  ProjectBillingType,
  ProjectHealthStatus,
  ProjectMemberStatus,
  ProjectMilestoneStatus,
  ProjectPriority,
  ProjectStatus,
  ProjectType,
  AdminEmailTemplateKey,
  AdminNotificationEventKey,
  AdminPolicyKey,
  AdminWorkflowApproverType,
  AdminWorkflowKey,
  RbacPermissionAction,
  RbacPermissionGroup,
  RoleKey,
  TimesheetStatus
} from "./constants.js";

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;
export type Money = string;
export type EmailVerificationStatus = "unverified" | "pending" | "verified" | "bounced" | "blocked";

export interface AuthUser {
  id: UUID;
  employee_code: string;
  email: string;
  full_name: string;
  department_id: UUID;
  designation_id: UUID;
  roles: RoleKey[];
  employment_status: EmploymentStatus;
  email_verified_at?: ISODateTime | null;
  email_verification_status?: EmailVerificationStatus;
  hierarchy_path: string;
}

export interface Department {
  id: UUID;
  company_id: UUID | null;
  department_code: string;
  name: string;
  cost_center: string | null;
  parent_department_id: UUID | null;
  director_user_id: UUID | null;
  status: "active" | "inactive";
  deleted_at: ISODateTime | null;
  version: number;
}

export interface Designation {
  id: UUID;
  company_id: UUID | null;
  designation_code: string;
  title: string;
  level: number | null;
  status: "active" | "inactive";
  deleted_at: ISODateTime | null;
  version: number;
}

export interface RbacRoleRecord {
  id: UUID;
  role_key: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  builtin: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface RbacRolePermissionRecord {
  id: UUID;
  role_key: string;
  permission_id: string;
  status: "active" | "inactive";
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface RbacPermissionDefinition {
  id: string;
  permission_id: string;
  group: RbacPermissionGroup;
  module: RbacPermissionGroup;
  action: RbacPermissionAction;
  label: string;
  description: string;
}

export interface AdminWorkflowStageRecord {
  id: string;
  order: number;
  approver_type: AdminWorkflowApproverType;
  approver_value: string;
  escalate_after_days: number;
  mandatory_remarks_on_reject: boolean;
}

export interface AdminWorkflowConfigRecord {
  id: UUID;
  workflow_key: AdminWorkflowKey;
  module: string;
  label: string;
  status: "active" | "inactive";
  stages: AdminWorkflowStageRecord[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface AdminPolicyConfigRecord {
  id: UUID;
  company_id: UUID | null;
  policy_key: AdminPolicyKey;
  module: string;
  label: string;
  status: "active" | "inactive";
  config: Record<string, unknown>;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface AdminEmailTemplateRecord {
  id: UUID;
  template_key: AdminEmailTemplateKey;
  module: string;
  name: string;
  subject: string;
  body: string;
  locale: string;
  status: "active" | "inactive";
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface AdminNotificationChannelRecord {
  id: UUID;
  event_key: AdminNotificationEventKey;
  module: string;
  label: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  status: "active" | "inactive";
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface AdminSecuritySettingsRecord {
  id: UUID;
  settings_key: "default";
  password_min_length: number;
  password_require_special: boolean;
  password_require_number: boolean;
  password_expiry_days: number;
  session_timeout_minutes: number;
  login_attempt_limit: number;
  mfa_enabled: false;
  audit_role_changes: boolean;
  ip_device_audit_enabled: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface CoreUser extends AuthUser {
  manager_user_id: UUID | null;
  profile_photo_document_id?: UUID | null;
  profile_photo_url?: string | null;
  timezone: string | null;
  joined_on: ISODate | null;
  terminated_on: ISODate | null;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface ExpenseTicket {
  id: UUID;
  ticket_no: string;
  requester_user_id: UUID;
  requester_role_snapshot: string;
  department_id: UUID;
  expense_type: ExpenseType;
  expense_sub_type: ExpenseSubType;
  project_code: string | null;
  client_name: string | null;
  task_title: string;
  task_description: string;
  location: string | null;
  start_date: ISODate;
  end_date: ISODate;
  estimated_amount: Money;
  payment_type: PaymentType;
  advance_amount: Money | null;
  advance_justification: string | null;
  manager_verifier_id: UUID | null;
  manager_backup_user_id: UUID | null;
  finance_approver_id: UUID | null;
  status: ExpenseStatus;
  actual_amount: Money | null;
  variance_amount: Money | null;
  payment_reference_no: string | null;
  closure_remarks: string | null;
  context_payload: Record<string, unknown>;
  route_snapshot: Record<string, unknown>;
  policy_snapshot: Record<string, unknown>;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  submitted_at: ISODateTime | null;
  closed_at: ISODateTime | null;
  deleted_at: ISODateTime | null;
}

export interface ExpenseLineItem {
  id: UUID;
  ticket_id: UUID;
  line_category: string;
  description: string;
  quantity: Money | null;
  unit_cost: Money | null;
  line_total: Money;
  tax_amount: Money | null;
  vendor_name: string | null;
}

export interface ExpenseAuditLog {
  id: UUID;
  ticket_id: UUID;
  actor_user_id: UUID;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  remarks: string | null;
  payload_hash: string | null;
  created_at: ISODateTime;
}

export interface ManagerBackupAssignment {
  id: UUID;
  employee_user_id: UUID;
  backup_manager_user_id: UUID;
  assigned_by_user_id: UUID;
  effective_from: ISODate;
  effective_to: ISODate | null;
  status: "active" | "revoked" | "expired";
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface FinanceGovernanceConfig {
  id: UUID;
  scope_key: "global";
  primary_finance_manager_user_id: UUID;
  manager_backup_user_id: UUID | null;
  finance_approval_backup_user_id: UUID | null;
  status: "active" | "inactive";
  effective_from: ISODate;
  effective_to: ISODate | null;
  updated_by_user_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface ExpenseDocument {
  id: UUID;
  ticket_id: UUID;
  document_id: UUID;
  document_type: string;
  verification_status: "pending" | "verified" | "rejected";
  uploaded_by: UUID;
  uploaded_at: ISODateTime;
}

export interface ExpensePayment {
  id: UUID;
  ticket_id: UUID;
  payment_type: PaymentType;
  approved_amount: Money;
  paid_amount: Money;
  payment_date: ISODate;
  payment_mode: string;
  reference_no: string;
  settlement_status: "payable" | "recoverable" | "no_balance" | "pending" | null;
  settlement_amount: Money | null;
  processed_by_user_id: UUID;
  created_at: ISODateTime;
}

export interface DocumentMetadata {
  id: UUID;
  business_object_type: string;
  business_object_id: UUID;
  owner_user_id: UUID | null;
  classification: DocumentClassification;
  document_type: string;
  current_version: number;
  file_name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface AssetRecord {
  id: UUID;
  asset_code: string;
  qr_hash: string;
  asset_type: string;
  name: string;
  serial_no: string | null;
  status: AssetStatus;
  current_assigned_user_id: UUID | null;
  metadata: Record<string, unknown>;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface TimesheetSubmission {
  id: UUID;
  employee_user_id: UUID;
  cycle_start: ISODate;
  cycle_end: ISODate;
  status: TimesheetStatus;
  total_hours: Money;
  workflow_definition_id: UUID;
  workflow_snapshot: Record<string, unknown>;
  current_approver_user_id: UUID | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface AttendancePunch {
  id: UUID;
  employee_user_id: UUID;
  event_type: AttendancePunchEventType;
  occurred_at: ISODateTime;
  work_mode: "office" | "remote" | "wfh" | "field";
  source: "web" | "mobile" | "kiosk" | "admin";
  metadata: Record<string, unknown>;
  created_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface AttendanceDayRecord {
  id: UUID;
  employee_user_id: UUID;
  work_date: ISODate;
  status: AttendanceDayStatus;
  first_check_in: ISODateTime | null;
  last_check_out: ISODateTime | null;
  work_minutes: number;
  break_minutes: number;
  late_minutes: number;
  early_out_minutes: number;
  work_mode: "office" | "remote" | "wfh" | "field" | null;
  note: string | null;
  exception_type: "late" | "missing_punch" | "absent" | "early_out" | null;
  regularization_status: AttendanceRegularizationStatus | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface AttendanceRegularizationRequest {
  id: UUID;
  employee_user_id: UUID;
  work_date: ISODate;
  reason: string;
  requested_punches: Array<{
    event_type: AttendancePunchEventType;
    occurred_at: ISODateTime;
  }>;
  status: AttendanceRegularizationStatus;
  current_approver_user_id: UUID | null;
  decision_remarks: string | null;
  decided_by_user_id: UUID | null;
  decided_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface LeaveRequest {
  id: UUID;
  request_code: string;
  employee_user_id: UUID;
  leave_type: LeaveType;
  date_from: ISODate;
  date_to: ISODate;
  half_day: boolean;
  duration: number;
  reason: string;
  document_ids: UUID[];
  status: LeaveRequestStatus;
  current_approver_user_id: UUID | null;
  decision_remarks: string | null;
  decided_by_user_id: UUID | null;
  decided_at: ISODateTime | null;
  cancelled_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface WfhRequest {
  id: UUID;
  request_code: string;
  employee_user_id: UUID;
  date_from: ISODate;
  date_to: ISODate;
  half_day: boolean;
  duration: number;
  reason: string;
  project_ref: string | null;
  status: LeaveRequestStatus;
  current_approver_user_id: UUID | null;
  decision_remarks: string | null;
  decided_by_user_id: UUID | null;
  decided_at: ISODateTime | null;
  cancelled_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface Holiday {
  id: UUID;
  name: string;
  holiday_date: ISODate;
  region: string;
  optional: boolean;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface ProjectRecord {
  id: UUID;
  project_code: string;
  name: string;
  client_name: string;
  project_type: ProjectType;
  billing_type: ProjectBillingType;
  manager_user_id: UUID;
  department_id: UUID | null;
  start_date: ISODate;
  end_date: ISODate;
  status: ProjectStatus;
  health: ProjectHealthStatus;
  description: string | null;
  estimated_hours: Money;
  actual_hours: Money;
  estimated_budget: Money;
  actual_spend: Money;
  tech_stack: string[];
  priority: ProjectPriority;
  cost_center: string | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface ProjectMemberRecord {
  id: UUID;
  project_id: UUID;
  employee_user_id: UUID;
  project_role: string;
  allocation_percent: number;
  billable: boolean;
  start_date: ISODate;
  end_date: ISODate | null;
  reporting_lead_user_id: UUID | null;
  status: ProjectMemberStatus;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface ProjectAllocationRecord {
  id: UUID;
  project_id: UUID;
  employee_user_id: UUID;
  date_from: ISODate;
  date_to: ISODate | null;
  allocation_percent: number;
  billable: boolean;
  notes: string | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface ProjectMilestoneRecord {
  id: UUID;
  project_id: UUID;
  name: string;
  owner_user_id: UUID | null;
  status: ProjectMilestoneStatus;
  start_date: ISODate | null;
  due_date: ISODate;
  priority: ProjectPriority;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface HelpdeskCategory {
  id: UUID;
  category_key: HelpdeskTicketCategory;
  label: string;
  default_assignee_user_id: UUID | null;
  default_assignee_name: string | null;
  default_assignee_role: string | null;
  team: string;
  active: boolean;
  sub_categories: Array<{ key: string; label: string }>;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface HelpdeskTicket {
  id: UUID;
  ticket_no: string;
  subject: string;
  description: string;
  category_id: UUID;
  category_key: HelpdeskTicketCategory;
  sub_category: string | null;
  priority: HelpdeskTicketPriority;
  status: HelpdeskTicketStatus;
  requester_user_id: UUID;
  requester_name: string;
  requester_email: string | null;
  requester_department: string | null;
  assignee_user_id: UUID | null;
  assignee_name: string | null;
  assignee_role: string | null;
  related_asset_id: string | null;
  related_project_id: string | null;
  first_response_at: ISODateTime | null;
  resolved_at: ISODateTime | null;
  closed_at: ISODateTime | null;
  resolution: string | null;
  reopen_count: number;
  escalated: boolean;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface HelpdeskTicketComment {
  id: UUID;
  ticket_id: UUID;
  author_user_id: UUID | null;
  author_name: string;
  author_role: string | null;
  body: string;
  internal: boolean;
  document_ids: UUID[];
  created_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface HelpdeskTicketAttachment {
  id: UUID;
  ticket_id: UUID;
  document_id: UUID | null;
  attachment_type: string;
  file_name: string;
  size_text: string | null;
  uploaded_by_user_id: UUID | null;
  uploaded_by_name: string;
  created_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface HelpdeskTicketEvent {
  id: UUID;
  ticket_id: UUID;
  actor_user_id: UUID | null;
  actor_name: string;
  action: string;
  detail: string | null;
  created_at: ISODateTime;
}

export interface EmsEmployeeProfile {
  id: UUID;
  employee_user_id: UUID;
  personal_email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  current_address: string | null;
  permanent_address: string | null;
  city: string | null;
  country: string | null;
  emergency_contact: Record<string, unknown>;
  personal_details: Record<string, unknown>;
  work_preferences: Record<string, unknown>;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface EmsProfileChangeRequest {
  id: UUID;
  request_code: string;
  employee_user_id: UUID;
  field_key: string;
  field_label: string;
  old_value: string | null;
  new_value: string;
  reason: string | null;
  supporting_document_ids: UUID[];
  status: EmsProfileChangeStatus;
  current_approver_user_id: UUID | null;
  decision_remarks: string | null;
  decided_by_user_id: UUID | null;
  decided_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface EmsServiceRequest {
  id: UUID;
  request_code: string;
  requester_user_id: UUID;
  request_type: EmsServiceRequestType;
  subject: string;
  description: string;
  document_ids: UUID[];
  status: EmsServiceRequestStatus;
  assignee_user_id: UUID | null;
  decision_remarks: string | null;
  decided_by_user_id: UUID | null;
  decided_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface EmsLetter {
  id: UUID;
  employee_user_id: UUID;
  letter_type: string;
  title: string;
  description: string;
  status: EmsLetterStatus;
  document_id: UUID | null;
  issued_on: ISODate | null;
  acknowledged_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface EmsPolicy {
  id: UUID;
  policy_code: string;
  title: string;
  category: string;
  version_label: string;
  effective_from: ISODate;
  document_id: UUID | null;
  status: "active" | "inactive" | "superseded";
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface EmsPolicyAcknowledgement {
  id: UUID;
  policy_id: UUID;
  employee_user_id: UUID;
  status: EmsPolicyAcknowledgementStatus;
  acknowledged_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface EmsAdminChecklist {
  id: UUID;
  checklist_type: "onboarding" | "exit";
  employee_user_id: UUID;
  status: "pending" | "in_progress" | "completed";
  due_date: ISODate | null;
  checklist: Record<string, boolean>;
  remarks: string | null;
  completed_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface EmsProbationReview {
  id: UUID;
  employee_user_id: UUID;
  joining_on: ISODate;
  due_on: ISODate;
  status: "pending" | "confirmed" | "extended";
  extended_until: ISODate | null;
  remarks: string | null;
  decided_by_user_id: UUID | null;
  decided_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface OutboxEvent {
  id: number;
  event_id: UUID;
  aggregate_type: string;
  aggregate_id: UUID;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: "pending" | "published" | "retry" | "dead_letter";
  retry_count: number;
  available_at: ISODateTime;
  created_at: ISODateTime;
  published_at: ISODateTime | null;
  failed_at: ISODateTime | null;
  last_error: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}
