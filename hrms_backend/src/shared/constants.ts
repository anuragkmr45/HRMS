export const Roles = {
  Employee: "Employee",
  Reviewer: "Reviewer",
  Director: "Director",
  FinanceManager: "Finance Manager",
  Admin: "Admin",
  Auditor: "Auditor",
  AssetManager: "Asset Manager",
  HRManager: "HR Manager"
} as const;

export type RoleKey = (typeof Roles)[keyof typeof Roles];

export const Permissions = {
  ExpenseCreate: "expense:create",
  ExpenseManagerVerify: "expense:manager-verify",
  ExpenseFinanceApprove: "expense:finance-approve",
  ExpenseFinance: "expense:finance",
  ExpenseAudit: "expense:audit",
  ExpenseGovernanceManage: "expense-governance:manage",
  DocumentRead: "document:read",
  DocumentWrite: "document:write",
  DocumentVerify: "document:verify",
  ReportRead: "report:read",
  ProjectRead: "project:read",
  ProjectManage: "project:manage",
  AssetManage: "asset:manage",
  TimesheetApprove: "timesheet:approve",
  Admin: "admin:*"
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

export const AttendanceCoordinateRetentionDefaults = {
  Class: "standard",
  Seconds: 30 * 24 * 60 * 60,
  MinSeconds: 60,
  MaxSeconds: 10 * 365 * 24 * 60 * 60
} as const;

export const RbacPermissionGroups = [
  "Dashboard",
  "Employees",
  "EMS",
  "Attendance",
  "Leave/WFH",
  "Projects",
  "Team Utilization",
  "Timesheet",
  "Expense Management",
  "Assets",
  "Helpdesk",
  "Reports",
  "Admin Settings"
] as const;

export type RbacPermissionGroup = (typeof RbacPermissionGroups)[number];

export const RbacPermissionActions = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "configure"
] as const;

export type RbacPermissionAction = (typeof RbacPermissionActions)[number];

export const AdminWorkflowKeys = [
  "leave",
  "wfh",
  "timesheet",
  "expense",
  "asset_request",
  "helpdesk_escalation"
] as const;

export type AdminWorkflowKey = (typeof AdminWorkflowKeys)[number];

export const AdminWorkflowApproverTypes = [
  "Reporting Manager",
  "Role",
  "Specific User"
] as const;

export type AdminWorkflowApproverType = (typeof AdminWorkflowApproverTypes)[number];

export const AdminPolicyKeys = [
  "attendance",
  "leave",
  "timesheet",
  "expense",
  "asset",
  "sla"
] as const;

export type AdminPolicyKey = (typeof AdminPolicyKeys)[number];

export const AdminEmailTemplateKeys = [
  "invite",
  "verify",
  "reset",
  "leave",
  "expense",
  "ts_reminder",
  "ticket_update"
] as const;

export type AdminEmailTemplateKey = (typeof AdminEmailTemplateKeys)[number];

export const AdminNotificationEventKeys = [
  "employee_invited",
  "leave_requested",
  "timesheet_submitted",
  "expense_submitted",
  "payment_released",
  "asset_assigned",
  "ticket_assigned",
  "sla_breached"
] as const;

export type AdminNotificationEventKey = (typeof AdminNotificationEventKeys)[number];

export const EmploymentStatuses = {
  Active: "active",
  Inactive: "inactive",
  Terminated: "terminated",
  Suspended: "suspended"
} as const;

export type EmploymentStatus = (typeof EmploymentStatuses)[keyof typeof EmploymentStatuses];

export const ExpenseTypes = {
  Project: "Project",
  SalesPreSales: "SalesPreSales"
} as const;

export type ExpenseType = (typeof ExpenseTypes)[keyof typeof ExpenseTypes];

export const ExpenseSubTypes = {
  ProjectTravel: "Project Travel",
  MaterialConsumables: "Material Consumables",
  LodgingBoarding: "Lodging & Boarding",
  ClientMeeting: "Client Meeting",
  DemoPresentation: "Demo/Presentation",
  MarketingEvent: "Marketing Event",
  SalesTravel: "Sales Travel",
  MiscSalesExpense: "Miscellaneous Sales Expense"
} as const;

export type ExpenseSubType = (typeof ExpenseSubTypes)[keyof typeof ExpenseSubTypes];

export const ProjectExpenseSubTypes = [
  ExpenseSubTypes.ProjectTravel,
  ExpenseSubTypes.MaterialConsumables,
  ExpenseSubTypes.LodgingBoarding
] as const;

export const SalesExpenseSubTypes = [
  ExpenseSubTypes.ClientMeeting,
  ExpenseSubTypes.DemoPresentation,
  ExpenseSubTypes.MarketingEvent,
  ExpenseSubTypes.SalesTravel,
  ExpenseSubTypes.MiscSalesExpense
] as const;

export const PaymentTypes = {
  Advance: "Advance",
  ReimbursementAccrued: "ReimbursementAccrued"
} as const;

export type PaymentType = (typeof PaymentTypes)[keyof typeof PaymentTypes];

export const ExpenseStatuses = {
  Draft: "Draft",
  Submitted: "Submitted",
  PendingManagerVerification: "Pending Manager Verification",
  ManagerReturned: "Manager Returned",
  ManagerRejected: "Manager Rejected",
  ManagerVerified: "Manager Verified",
  FinanceHold: "Finance Hold",
  ClarificationRequired: "Clarification Required",
  FinanceApproved: "Finance Approved",
  PaymentReleased: "Payment Released",
  BillsSubmitted: "Bills Submitted",
  PendingAdjustment: "Pending Adjustment",
  Closed: "Closed",
  FinanceRoutingException: "Finance Routing Exception",
  Cancelled: "Cancelled"
} as const;

export type ExpenseStatus = (typeof ExpenseStatuses)[keyof typeof ExpenseStatuses];

export const ExpenseDecisions = {
  Approve: "approve",
  Reject: "reject",
  Return: "return",
  Verify: "verify",
  Hold: "hold",
  Clarification: "clarification",
  Release: "release",
  Close: "close"
} as const;

export type ExpenseDecision = (typeof ExpenseDecisions)[keyof typeof ExpenseDecisions];

export const WorkflowActions = {
  ManagerVerify: "MANAGER_VERIFY",
  FinanceApprove: "FINANCE_APPROVE",
  PaymentRelease: "PAYMENT_RELEASE",
  SettlementClose: "SETTLEMENT_CLOSE",
  AssetAssign: "ASSET_ASSIGN",
  TimesheetApprove: "TIMESHEET_APPROVE",
  LeaveDecision: "LEAVE_DECISION",
  WfhDecision: "WFH_DECISION",
  EmsProfileChangeDecision: "EMS_PROFILE_CHANGE_DECISION"
} as const;

export type WorkflowAction = (typeof WorkflowActions)[keyof typeof WorkflowActions];

export const DocumentClassifications = {
  Normal: "normal",
  Finance: "finance",
  Medical: "medical",
  Compensation: "compensation",
  Legal: "legal",
  Audit: "audit"
} as const;

export type DocumentClassification =
  (typeof DocumentClassifications)[keyof typeof DocumentClassifications];

export const AssetStatuses = {
  Procured: "Procured",
  InStock: "In Stock",
  Assigned: "Assigned",
  InMaintenance: "In Maintenance",
  ReturnPending: "Return Pending",
  Returned: "Returned",
  Retired: "Retired",
  LostStolen: "Lost/Stolen"
} as const;

export type AssetStatus = (typeof AssetStatuses)[keyof typeof AssetStatuses];

export const LicenseStatuses = {
  Active: "active",
  Revoked: "revoked",
  Expired: "expired"
} as const;

export type LicenseStatus = (typeof LicenseStatuses)[keyof typeof LicenseStatuses];

export const TimesheetStatuses = {
  Draft: "Draft",
  Submitted: "Submitted",
  PendingApproval: "Pending Approval",
  Approved: "Approved",
  Returned: "Returned",
  Rejected: "Rejected"
} as const;

export type TimesheetStatus = (typeof TimesheetStatuses)[keyof typeof TimesheetStatuses];

export const AttendancePunchEventTypes = {
  CheckIn: "check_in",
  BreakStart: "break_start",
  BreakEnd: "break_end",
  CheckOut: "check_out"
} as const;

export type AttendancePunchEventType =
  (typeof AttendancePunchEventTypes)[keyof typeof AttendancePunchEventTypes];

export const AttendancePublicPunchSourceChannels = [
  "web",
  "web_geo",
  "mobile",
  "kiosk"
] as const;

export type AttendancePublicPunchSourceChannel =
  (typeof AttendancePublicPunchSourceChannels)[number];

export const AttendancePunchSourceChannels = [
  "web",
  "web_geo",
  "mobile",
  "mobile_foreground",
  "mobile_offline",
  "kiosk",
  "admin",
  "auto_geofence"
] as const;

export type AttendancePunchSourceChannel =
  (typeof AttendancePunchSourceChannels)[number];

export const AttendanceEvidenceSourceChannels = [
  ...AttendancePunchSourceChannels,
  "system"
] as const;

export type AttendanceEvidenceSourceChannel =
  (typeof AttendanceEvidenceSourceChannels)[number];

export const AttendanceDayStatuses = {
  Present: "present",
  Late: "late",
  Absent: "absent",
  Wfh: "wfh",
  Leave: "leave",
  Weekend: "weekend",
  Holiday: "holiday",
  Future: "future"
} as const;

export type AttendanceDayStatus =
  (typeof AttendanceDayStatuses)[keyof typeof AttendanceDayStatuses];

export const AttendanceDayClassifications = {
  WorkingDay: "working_day",
  Weekend: "weekend",
  Holiday: "holiday",
  Leave: "leave",
  Wfh: "wfh",
  Future: "future",
  Unknown: "unknown"
} as const;

export type AttendanceDayClassification =
  (typeof AttendanceDayClassifications)[keyof typeof AttendanceDayClassifications];

export const AttendancePresenceStates = {
  NotStarted: "not_started",
  Present: "present",
  Partial: "partial",
  Incomplete: "incomplete",
  Absent: "absent",
  NotApplicable: "not_applicable",
  Unknown: "unknown"
} as const;

export type AttendancePresenceState =
  (typeof AttendancePresenceStates)[keyof typeof AttendancePresenceStates];

export const AttendancePunctualityStates = {
  OnTime: "on_time",
  Late: "late",
  EarlyDeparture: "early_departure",
  LateAndEarlyDeparture: "late_and_early_departure",
  NotApplicable: "not_applicable",
  Unknown: "unknown"
} as const;

export type AttendancePunctualityState =
  (typeof AttendancePunctualityStates)[keyof typeof AttendancePunctualityStates];

export const AttendanceEvidenceStates = {
  Complete: "complete",
  Partial: "partial",
  Missing: "missing",
  Disputed: "disputed",
  NotApplicable: "not_applicable",
  Unknown: "unknown"
} as const;

export type AttendanceEvidenceState =
  (typeof AttendanceEvidenceStates)[keyof typeof AttendanceEvidenceStates];

export const AttendanceLocationPermissionStates = {
  Granted: "granted",
  Denied: "denied",
  Unavailable: "unavailable",
  Unknown: "unknown"
} as const;

export type AttendanceLocationPermissionState =
  (typeof AttendanceLocationPermissionStates)[keyof typeof AttendanceLocationPermissionStates];

export const AttendanceLocationProviders = {
  Browser: "browser",
  Device: "device",
  Network: "network",
  Unknown: "unknown"
} as const;

export type AttendanceLocationProvider =
  (typeof AttendanceLocationProviders)[keyof typeof AttendanceLocationProviders];

export const AttendanceApprovalKinds = {
  None: "none",
  Regularization: "regularization",
  Leave: "leave",
  Wfh: "wfh",
  Multiple: "multiple"
} as const;

export type AttendanceApprovalKind =
  (typeof AttendanceApprovalKinds)[keyof typeof AttendanceApprovalKinds];

export const AttendanceApprovalStates = {
  NotRequired: "not_required",
  Pending: "pending",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected",
  Mixed: "mixed",
  Unknown: "unknown"
} as const;

export type AttendanceApprovalState =
  (typeof AttendanceApprovalStates)[keyof typeof AttendanceApprovalStates];

export const AttendancePayrollStates = {
  Unprocessed: "unprocessed",
  NotApplicable: "not_applicable",
  Unknown: "unknown"
} as const;

export type AttendancePayrollState =
  (typeof AttendancePayrollStates)[keyof typeof AttendancePayrollStates];

export const AttendanceRegularizationStatuses = {
  Pending: "pending",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected"
} as const;

export type AttendanceRegularizationStatus =
  (typeof AttendanceRegularizationStatuses)[keyof typeof AttendanceRegularizationStatuses];

export const AttendanceRegularizationOperations = {
  Add: "add",
  Replace: "replace",
  Void: "void",
} as const;

export type AttendanceRegularizationOperation =
  (typeof AttendanceRegularizationOperations)[keyof typeof AttendanceRegularizationOperations];

export const AttendanceRegularizationActionKinds = {
  Submitted: "submitted",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected",
} as const;

export type AttendanceRegularizationActionKind =
  (typeof AttendanceRegularizationActionKinds)[keyof typeof AttendanceRegularizationActionKinds];

export const LeaveTypes = {
  Casual: "casual",
  Sick: "sick",
  Earned: "earned",
  Unpaid: "unpaid",
  CompOff: "comp_off"
} as const;

export type LeaveType = (typeof LeaveTypes)[keyof typeof LeaveTypes];

export const LeaveRequestStatuses = {
  PendingManager: "pending_manager",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected",
  Cancelled: "cancelled"
} as const;

export type LeaveRequestStatus =
  (typeof LeaveRequestStatuses)[keyof typeof LeaveRequestStatuses];

export const WfhRequestStatuses = LeaveRequestStatuses;

export type WfhRequestStatus = LeaveRequestStatus;

export const ProjectStatuses = {
  Planned: "planned",
  Active: "active",
  OnHold: "on_hold",
  Completed: "completed",
  Cancelled: "cancelled",
  Archived: "archived"
} as const;

export type ProjectStatus = (typeof ProjectStatuses)[keyof typeof ProjectStatuses];

export const ProjectHealthStatuses = {
  Green: "green",
  Amber: "amber",
  Red: "red"
} as const;

export type ProjectHealthStatus =
  (typeof ProjectHealthStatuses)[keyof typeof ProjectHealthStatuses];

export const ProjectTypes = {
  Client: "client",
  Internal: "internal"
} as const;

export type ProjectType = (typeof ProjectTypes)[keyof typeof ProjectTypes];

export const ProjectBillingTypes = {
  Fixed: "fixed",
  Hourly: "hourly",
  Retainer: "retainer",
  Internal: "internal"
} as const;

export type ProjectBillingType =
  (typeof ProjectBillingTypes)[keyof typeof ProjectBillingTypes];

export const ProjectPriorities = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Critical: "critical"
} as const;

export type ProjectPriority = (typeof ProjectPriorities)[keyof typeof ProjectPriorities];

export const ProjectMemberStatuses = {
  Active: "active",
  Removed: "removed"
} as const;

export type ProjectMemberStatus =
  (typeof ProjectMemberStatuses)[keyof typeof ProjectMemberStatuses];

export const ProjectMilestoneStatuses = {
  Planned: "planned",
  InProgress: "in_progress",
  Completed: "completed",
  OnHold: "on_hold"
} as const;

export type ProjectMilestoneStatus =
  (typeof ProjectMilestoneStatuses)[keyof typeof ProjectMilestoneStatuses];

export const HelpdeskTicketCategories = {
  IT: "IT",
  HR: "HR",
  Finance: "Finance",
  Admin: "Admin",
  Assets: "Assets",
  ProjectSupport: "Project Support"
} as const;

export type HelpdeskTicketCategory =
  (typeof HelpdeskTicketCategories)[keyof typeof HelpdeskTicketCategories];

export const HelpdeskTicketPriorities = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
  Urgent: "Urgent"
} as const;

export type HelpdeskTicketPriority =
  (typeof HelpdeskTicketPriorities)[keyof typeof HelpdeskTicketPriorities];

export const HelpdeskTicketStatuses = {
  New: "new",
  Assigned: "assigned",
  InProgress: "in_progress",
  OnHold: "on_hold",
  Resolved: "resolved",
  Closed: "closed",
  Reopened: "reopened",
  Escalated: "escalated"
} as const;

export type HelpdeskTicketStatus =
  (typeof HelpdeskTicketStatuses)[keyof typeof HelpdeskTicketStatuses];

export const EmsProfileChangeStatuses = {
  Pending: "pending",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected"
} as const;

export type EmsProfileChangeStatus =
  (typeof EmsProfileChangeStatuses)[keyof typeof EmsProfileChangeStatuses];

export const EmsServiceRequestStatuses = {
  Pending: "pending",
  InProgress: "in_progress",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected",
  Closed: "closed"
} as const;

export type EmsServiceRequestStatus =
  (typeof EmsServiceRequestStatuses)[keyof typeof EmsServiceRequestStatuses];

export const EmsServiceRequestTypes = {
  ProfileUpdate: "profile_update",
  DocumentVerification: "document_verification",
  Letter: "letter",
  Asset: "asset",
  HrSupport: "hr_support"
} as const;

export type EmsServiceRequestType =
  (typeof EmsServiceRequestTypes)[keyof typeof EmsServiceRequestTypes];

export const EmsLetterStatuses = {
  Available: "available",
  Requested: "requested",
  InProgress: "in_progress",
  Acknowledged: "acknowledged"
} as const;

export type EmsLetterStatus = (typeof EmsLetterStatuses)[keyof typeof EmsLetterStatuses];

export const EmsPolicyAcknowledgementStatuses = {
  Pending: "pending",
  Acknowledged: "acknowledged"
} as const;

export type EmsPolicyAcknowledgementStatus =
  (typeof EmsPolicyAcknowledgementStatuses)[keyof typeof EmsPolicyAcknowledgementStatuses];

export const ErrorCodes = {
  BadRequest: "BAD_REQUEST",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  WorkflowConflict: "WORKFLOW_CONFLICT",
  SelfApprovalBlocked: "SELF_APPROVAL_BLOCKED",
  InvalidTransition: "INVALID_TRANSITION",
  MissingRemarks: "MISSING_REMARKS",
  RequiredDocumentsMissing: "REQUIRED_DOCUMENTS_MISSING",
  IdempotencyConflict: "IDEMPOTENCY_CONFLICT",
  ValidationFailed: "VALIDATION_FAILED",
  CompanyContextRequired: "COMPANY_CONTEXT_REQUIRED",
  TooManyRequests: "TOO_MANY_REQUESTS"
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const RequiredDocumentsByExpenseSubType: Record<ExpenseSubType, readonly string[]> = {
  [ExpenseSubTypes.ProjectTravel]: ["travel_ticket", "boarding_pass", "receipt"],
  [ExpenseSubTypes.MaterialConsumables]: ["vendor_invoice", "material_receipt"],
  [ExpenseSubTypes.LodgingBoarding]: ["hotel_invoice", "receipt"],
  [ExpenseSubTypes.ClientMeeting]: ["meeting_receipt"],
  [ExpenseSubTypes.DemoPresentation]: ["demo_receipt"],
  [ExpenseSubTypes.MarketingEvent]: ["event_invoice", "receipt"],
  [ExpenseSubTypes.SalesTravel]: ["travel_ticket", "receipt"],
  [ExpenseSubTypes.MiscSalesExpense]: ["receipt"]
};

export const RetryableMutationScopes = {
  ExpenseDecision: "expense-decision",
  ExpensePayment: "expense-payment",
  ExpenseSettlement: "expense-settlement",
  DocumentUpload: "document-upload",
  AssetAssignment: "asset-assignment",
  TimesheetApproval: "timesheet-approval",
  AttendanceRegularizationDecision: "attendance-regularization-decision",
  LeaveDecision: "leave-decision",
  WfhDecision: "wfh-decision"
} as const;
