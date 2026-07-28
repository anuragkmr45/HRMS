import { z } from "zod";
import {
  AttendanceLocationPermissionStates,
  AttendanceLocationProviders,
  AttendancePunchEventTypes,
  AssetStatuses,
  DocumentClassifications,
  EmsProfileChangeStatuses,
  EmsServiceRequestStatuses,
  EmsServiceRequestTypes,
  ExpenseDecisions,
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  HelpdeskTicketCategories,
  HelpdeskTicketPriorities,
  HelpdeskTicketStatuses,
  LeaveRequestStatuses,
  LeaveTypes,
  PaymentTypes,
  ProjectBillingTypes,
  ProjectHealthStatuses,
  ProjectMemberStatuses,
  ProjectMilestoneStatuses,
  ProjectPriorities,
  ProjectStatuses,
  ProjectTypes,
  TimesheetStatuses
} from "./constants.js";

export const uuidSchema = z.uuid();
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
export const isoDateTimeSchema = z.iso.datetime();
export const moneySchema = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/u, "Use a fixed precision decimal string");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().max(64).optional()
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    page_size: z.number().int().min(1),
    total: z.number().int().min(0)
  });

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  request_id: z.string()
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const emsProfilePatchSchema = z.object({
  personal_email: z.email().optional(),
  phone: z.string().min(4).max(32).optional(),
  alternate_phone: z.string().min(4).max(32).optional(),
  current_address: z.string().min(3).max(500).optional(),
  permanent_address: z.string().min(3).max(500).optional(),
  city: z.string().min(1).max(120).optional(),
  country: z.string().min(1).max(120).optional(),
  expected_version: z.number().int().min(1)
});

export type EmsProfilePatchInput = z.infer<typeof emsProfilePatchSchema>;

export const emsProfileChangeCreateSchema = z.object({
  field_key: z.string().min(1).max(80),
  field_label: z.string().min(1).max(120).optional(),
  new_value: z.string().min(1).max(1000),
  reason: z.string().max(1000).optional(),
  supporting_document_ids: z.array(uuidSchema).default([])
});

export type EmsProfileChangeCreateInput = z.infer<typeof emsProfileChangeCreateSchema>;

export const emsDecisionSchema = z.object({
  decision: z.enum([
    EmsProfileChangeStatuses.Approved,
    EmsProfileChangeStatuses.Returned,
    EmsProfileChangeStatuses.Rejected
  ]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export type EmsDecisionInput = z.infer<typeof emsDecisionSchema>;

export const emsRequestCreateSchema = z.object({
  request_type: z.enum([
    EmsServiceRequestTypes.ProfileUpdate,
    EmsServiceRequestTypes.DocumentVerification,
    EmsServiceRequestTypes.Letter,
    EmsServiceRequestTypes.Asset,
    EmsServiceRequestTypes.HrSupport
  ]),
  subject: z.string().min(1).max(180),
  description: z.string().min(1).max(2000),
  document_ids: z.array(uuidSchema).default([])
});

export type EmsRequestCreateInput = z.infer<typeof emsRequestCreateSchema>;

export const emsAdminChecklistUpdateSchema = z.object({
  checklist: z.record(z.string().min(1).max(80), z.boolean()).optional(),
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
  due_date: isoDateSchema.nullable().optional(),
  remarks: z.string().max(1000).nullable().optional(),
  expected_version: z.number().int().min(1)
});

export type EmsAdminChecklistUpdateInput = z.infer<typeof emsAdminChecklistUpdateSchema>;

export const emsProbationDecisionSchema = z
  .object({
    decision: z.enum(["confirmed", "extended"]),
    extended_until: isoDateSchema.optional(),
    remarks: z.string().max(1000).optional(),
    expected_version: z.number().int().min(1)
  })
  .refine((input) => input.decision !== "extended" || Boolean(input.extended_until), {
    path: ["extended_until"],
    message: "extended_until is required when probation is extended."
  });

export type EmsProbationDecisionInput = z.infer<typeof emsProbationDecisionSchema>;

export const emsPolicyUpdateSchema = z.object({
  title: z.string().min(1).max(180).optional(),
  category: z.string().min(1).max(80).optional(),
  version_label: z.string().min(1).max(40).optional(),
  effective_from: isoDateSchema.optional(),
  document_id: uuidSchema.nullable().optional(),
  status: z.enum(["active", "inactive", "superseded"]).optional(),
  expected_version: z.number().int().min(1)
});

export type EmsPolicyUpdateInput = z.infer<typeof emsPolicyUpdateSchema>;

export const emsServiceRequestDecisionSchema = z.object({
  decision: z.enum([
    EmsServiceRequestStatuses.Approved,
    EmsServiceRequestStatuses.Returned,
    EmsServiceRequestStatuses.Rejected,
    EmsServiceRequestStatuses.Closed
  ]),
  remarks: z.string().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type EmsServiceRequestDecisionInput = z.infer<typeof emsServiceRequestDecisionSchema>;

export const emsPolicyAcknowledgeSchema = z.object({
  expected_version: z.number().int().min(1)
});

export type EmsPolicyAcknowledgeInput = z.infer<typeof emsPolicyAcknowledgeSchema>;

export const expenseLineItemInputSchema = z.object({
  line_category: z.string().min(1),
  description: z.string().min(1),
  quantity: moneySchema.optional(),
  unit_cost: moneySchema.optional(),
  line_total: moneySchema,
  tax_amount: moneySchema.optional(),
  vendor_name: z.string().optional()
});

export const expenseCreateSchema = z.object({
  submit: z.boolean().default(false),
  expense_type: z.enum([ExpenseTypes.Project, ExpenseTypes.SalesPreSales]),
  expense_sub_type: z.enum([
    ExpenseSubTypes.ProjectTravel,
    ExpenseSubTypes.MaterialConsumables,
    ExpenseSubTypes.LodgingBoarding,
    ExpenseSubTypes.ClientMeeting,
    ExpenseSubTypes.DemoPresentation,
    ExpenseSubTypes.MarketingEvent,
    ExpenseSubTypes.SalesTravel,
    ExpenseSubTypes.MiscSalesExpense
  ]),
  project_code: z.string().optional(),
  client_name: z.string().optional(),
  task_title: z.string().min(1),
  task_description: z.string().min(1),
  location: z.string().optional(),
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  estimated_amount: moneySchema,
  payment_type: z.enum([PaymentTypes.Advance, PaymentTypes.ReimbursementAccrued]),
  advance_amount: moneySchema.optional(),
  advance_justification: z.string().optional(),
  line_items: z.array(expenseLineItemInputSchema).min(1)
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const managerBackupAssignmentCreateSchema = z.object({
  employee_user_id: uuidSchema,
  backup_manager_user_id: uuidSchema,
  effective_from: isoDateSchema,
  effective_to: isoDateSchema.optional()
});

export const expenseDecisionSchema = z.object({
  decision: z.enum([ExpenseDecisions.Approve, ExpenseDecisions.Reject, ExpenseDecisions.Return]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const financeVerifySchema = z.object({
  decision: z.enum([
    ExpenseDecisions.Verify,
    ExpenseDecisions.Hold,
    ExpenseDecisions.Clarification
  ]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const paymentReleaseSchema = z.object({
  payment_date: isoDateSchema,
  amount: moneySchema,
  payment_mode: z.string().min(1),
  reference_no: z.string().min(1),
  expected_version: z.number().int().min(1)
});

export const settlementSchema = z.object({
  actual_amount: moneySchema,
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const documentUploadSchema = z.object({
  business_object_type: z.string().min(1),
  business_object_id: uuidSchema,
  classification: z.enum([
    DocumentClassifications.Normal,
    DocumentClassifications.Finance,
    DocumentClassifications.Medical,
    DocumentClassifications.Compensation,
    DocumentClassifications.Legal,
    DocumentClassifications.Audit
  ]),
  document_type: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().min(1),
  checksum_sha256: z.string().optional()
});

export const assetCreateSchema = z.object({
  asset_code: z.string().min(1),
  asset_type: z.string().min(1),
  name: z.string().min(1),
  serial_no: z.string().optional()
});

export const assetAssignSchema = z.object({
  assigned_to_user_id: uuidSchema,
  expected_version: z.number().int().min(1)
});

export const licenseActivationSchema = z.object({
  product_id: uuidSchema,
  entitlement_id: uuidSchema,
  hardware_fingerprint: z.string().min(8)
});

export const workSegmentSchema = z.object({
  work_date: isoDateSchema,
  project_code: z.string().optional(),
  task_code: z.string().optional(),
  hours: moneySchema,
  description: z.string().optional(),
  billable: z.boolean().default(false)
});

export const timesheetSubmissionSchema = z.object({
  cycle_start: isoDateSchema,
  cycle_end: isoDateSchema
});

export const timesheetDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "return"]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

const attendanceLocationPermissionStateValues = [
  AttendanceLocationPermissionStates.Granted,
  AttendanceLocationPermissionStates.Unknown
] as const;

const attendanceLocationFailureStateValues = [
  AttendanceLocationPermissionStates.Denied,
  AttendanceLocationPermissionStates.Unavailable
] as const;

const attendanceLocationProviderValues = [
  AttendanceLocationProviders.Browser,
  AttendanceLocationProviders.Device,
  AttendanceLocationProviders.Network,
  AttendanceLocationProviders.Unknown
] as const;

const attendanceCoordinateEvidenceSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_meters: z.number().min(0),
  captured_at: isoDateTimeSchema,
  age_ms: z.number().int().min(0).optional(),
  provider: z.enum(attendanceLocationProviderValues).optional(),
  permission_state: z.enum([
    AttendanceLocationPermissionStates.Granted,
    AttendanceLocationPermissionStates.Unknown
  ]).default(
    AttendanceLocationPermissionStates.Unknown
  ),
  altitude_meters: z.number().optional(),
  is_mocked: z.boolean().optional(),
  integrity_status: z.string().trim().min(1).max(80).optional()
}).strict();

const attendanceLocationFailureEvidenceSchema = z.object({
  captured_at: isoDateTimeSchema.optional(),
  age_ms: z.number().int().min(0).optional(),
  provider: z.enum(attendanceLocationProviderValues).optional(),
  permission_state: z.enum(attendanceLocationFailureStateValues),
  integrity_status: z.string().trim().min(1).max(80).optional()
}).strict();

export const attendanceLocationEvidenceSchema = z.union([
  attendanceCoordinateEvidenceSchema,
  attendanceLocationFailureEvidenceSchema
]);

export type AttendanceLocationEvidenceRequest = z.infer<typeof attendanceLocationEvidenceSchema>;

export const attendancePunchSchema = z.object({
  event_type: z.enum([
    AttendancePunchEventTypes.CheckIn,
    AttendancePunchEventTypes.BreakStart,
    AttendancePunchEventTypes.BreakEnd,
    AttendancePunchEventTypes.CheckOut
  ]),
  work_mode: z.enum(["office", "remote", "wfh", "field"]).default("office"),
  source: z.enum(["web", "mobile", "kiosk"]).default("web"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  location: attendanceLocationEvidenceSchema.optional()
}).strict();

export const attendanceAssistedCurrentPunchSchema = z.object({
  event_type: z.enum([
    AttendancePunchEventTypes.CheckIn,
    AttendancePunchEventTypes.BreakStart,
    AttendancePunchEventTypes.BreakEnd,
    AttendancePunchEventTypes.CheckOut
  ]),
  work_mode: z.enum(["office", "remote", "wfh", "field"]).default("office"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  location: attendanceLocationEvidenceSchema.optional(),
  reason: z.string().trim().min(3).max(1000).optional()
}).strict();

export const attendanceHistoricalCorrectionSchema = z.object({
  event_type: z.enum([
    AttendancePunchEventTypes.CheckIn,
    AttendancePunchEventTypes.CheckOut
  ]),
  occurred_at: isoDateTimeSchema,
  reason: z.string().trim().min(3).max(1000),
  work_mode: z.enum(["office", "remote", "wfh", "field"]).default("office"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  linked_regularization_request_id: z.uuid().optional()
}).strict();

const regularizationEventTypeSchema = z.enum([
  AttendancePunchEventTypes.CheckIn,
  AttendancePunchEventTypes.CheckOut
]);

const regularizationLegacyPunchSchema = z.object({
  event_type: regularizationEventTypeSchema,
  occurred_at: isoDateTimeSchema
}).strict();

export const attendanceRegularizationItemSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("add"),
    event_type: regularizationEventTypeSchema,
    occurred_at: isoDateTimeSchema
  }).strict(),
  z.object({
    operation: z.literal("replace"),
    target_punch_event_id: z.uuid(),
    event_type: regularizationEventTypeSchema,
    occurred_at: isoDateTimeSchema
  }).strict(),
  z.object({
    operation: z.literal("void"),
    target_punch_event_id: z.uuid()
  }).strict()
]);

export const attendanceRegularizationCreateSchema = z.object({
  work_date: isoDateSchema,
  reason: z.string().trim().min(3).max(1000),
  requested_punches: z.array(regularizationLegacyPunchSchema).min(1).max(20).optional(),
  items: z.array(attendanceRegularizationItemSchema).min(1).max(20).optional()
}).strict().superRefine((input, context) => {
  if (Boolean(input.items) === Boolean(input.requested_punches)) {
    context.addIssue({
      code: "custom",
      message: "Supply exactly one of items or requested_punches.",
      path: input.items ? ["requested_punches"] : ["items"]
    });
    return;
  }
  const items = input.items ?? input.requested_punches?.map((punch) => ({
    operation: "add" as const,
    ...punch
  })) ?? [];
  const targets = new Set<string>();
  const adds = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (item.operation === "replace" || item.operation === "void") {
      if (targets.has(item.target_punch_event_id)) {
        context.addIssue({
          code: "custom",
          message: "A target punch may be corrected only once per request.",
          path: ["items", index, "target_punch_event_id"]
        });
      }
      targets.add(item.target_punch_event_id);
    } else {
      const key = `${item.event_type}:${item.occurred_at}`;
      if (adds.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate ADD correction items are not allowed.",
          path: [input.items ? "items" : "requested_punches", index]
        });
      }
      adds.add(key);
    }
  }
});

export const attendanceRegularizationDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "return"]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const leaveRequestCreateSchema = z.object({
  leave_type: z.enum([
    LeaveTypes.Casual,
    LeaveTypes.Sick,
    LeaveTypes.Earned,
    LeaveTypes.Unpaid,
    LeaveTypes.CompOff
  ]),
  date_from: isoDateSchema,
  date_to: isoDateSchema,
  half_day: z.boolean().default(false),
  reason: z.string().min(3).max(1000),
  document_ids: z.array(uuidSchema).default([])
});

export type LeaveRequestCreateInput = z.infer<typeof leaveRequestCreateSchema>;

export const wfhRequestCreateSchema = z.object({
  date_from: isoDateSchema,
  date_to: isoDateSchema,
  half_day: z.boolean().default(false),
  reason: z.string().min(3).max(1000),
  project_ref: z.string().trim().max(120).optional()
});

export type WfhRequestCreateInput = z.infer<typeof wfhRequestCreateSchema>;

export const leaveWfhDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "return"]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export type LeaveWfhDecisionInput = z.infer<typeof leaveWfhDecisionSchema>;

export const leaveWfhCancelSchema = z.object({
  remarks: z.string().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type LeaveWfhCancelInput = z.infer<typeof leaveWfhCancelSchema>;

export const holidayUpsertSchema = z.object({
  name: z.string().min(2).max(160),
  date: isoDateSchema,
  region: z.string().trim().min(1).max(80).default("All"),
  optional: z.boolean().default(false),
  expected_version: z.number().int().min(1).optional()
});

export type HolidayUpsertInput = z.infer<typeof holidayUpsertSchema>;

export const projectCreateSchema = z.object({
  project_code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(180),
  client_name: z.string().trim().min(1).max(180),
  project_type: z.enum([ProjectTypes.Client, ProjectTypes.Internal]).default(ProjectTypes.Client),
  billing_type: z
    .enum([
      ProjectBillingTypes.Fixed,
      ProjectBillingTypes.Hourly,
      ProjectBillingTypes.Retainer,
      ProjectBillingTypes.Internal
    ])
    .default(ProjectBillingTypes.Fixed),
  manager_user_id: uuidSchema,
  department_id: uuidSchema.optional(),
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  status: z
    .enum([
      ProjectStatuses.Planned,
      ProjectStatuses.Active,
      ProjectStatuses.OnHold,
      ProjectStatuses.Completed,
      ProjectStatuses.Cancelled,
      ProjectStatuses.Archived
    ])
    .default(ProjectStatuses.Planned),
  health: z
    .enum([
      ProjectHealthStatuses.Green,
      ProjectHealthStatuses.Amber,
      ProjectHealthStatuses.Red
    ])
    .default(ProjectHealthStatuses.Green),
  description: z.string().trim().max(2000).optional(),
  estimated_hours: moneySchema.default("0.00"),
  estimated_budget: moneySchema.default("0.00"),
  tech_stack: z.array(z.string().trim().min(1).max(80)).default([]),
  priority: z
    .enum([
      ProjectPriorities.Low,
      ProjectPriorities.Medium,
      ProjectPriorities.High,
      ProjectPriorities.Critical
    ])
    .default(ProjectPriorities.Medium),
  cost_center: z.string().trim().max(80).nullable().optional()
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema
  .partial()
  .extend({ expected_version: z.number().int().min(1) });

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const projectArchiveSchema = z.object({
  remarks: z.string().trim().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type ProjectArchiveInput = z.infer<typeof projectArchiveSchema>;

export const projectMemberCreateSchema = z.object({
  user_id: uuidSchema,
  project_role: z.string().trim().min(1).max(120),
  allocation_percent: z.number().int().min(0).max(200).default(100),
  over_allocation_acknowledged: z.boolean().default(false),
  over_allocation_reason: z.string().trim().max(500).optional(),
  billable: z.boolean().default(true),
  start_date: isoDateSchema,
  end_date: isoDateSchema.optional(),
  reporting_lead_user_id: uuidSchema.optional(),
  expected_version: z.number().int().min(1)
});

export type ProjectMemberCreateInput = z.infer<typeof projectMemberCreateSchema>;

export const projectMemberUpdateSchema = z.object({
  project_role: z.string().trim().min(1).max(120).optional(),
  allocation_percent: z.number().int().min(0).max(200).optional(),
  over_allocation_acknowledged: z.boolean().optional(),
  over_allocation_reason: z.string().trim().max(500).optional(),
  billable: z.boolean().optional(),
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.nullish(),
  reporting_lead_user_id: uuidSchema.nullish(),
  status: z.enum([ProjectMemberStatuses.Active, ProjectMemberStatuses.Removed]).optional(),
  expected_version: z.number().int().min(1)
});

export type ProjectMemberUpdateInput = z.infer<typeof projectMemberUpdateSchema>;

export const projectAllocationCreateSchema = z.object({
  user_id: uuidSchema,
  date_from: isoDateSchema,
  date_to: isoDateSchema.optional(),
  allocation_percent: z.number().int().min(0).max(200),
  over_allocation_acknowledged: z.boolean().default(false),
  over_allocation_reason: z.string().trim().max(500).optional(),
  billable: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type ProjectAllocationCreateInput = z.infer<typeof projectAllocationCreateSchema>;

export const projectMilestoneCreateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  owner_user_id: uuidSchema.optional(),
  status: z
    .enum([
      ProjectMilestoneStatuses.Planned,
      ProjectMilestoneStatuses.InProgress,
      ProjectMilestoneStatuses.Completed,
      ProjectMilestoneStatuses.OnHold
    ])
    .default(ProjectMilestoneStatuses.Planned),
  start_date: isoDateSchema.optional(),
  due_date: isoDateSchema,
  priority: z
    .enum([
      ProjectPriorities.Low,
      ProjectPriorities.Medium,
      ProjectPriorities.High,
      ProjectPriorities.Critical
    ])
    .default(ProjectPriorities.Medium),
  expected_version: z.number().int().min(1)
});

export type ProjectMilestoneCreateInput = z.infer<typeof projectMilestoneCreateSchema>;

const helpdeskCategoryValues = [
  HelpdeskTicketCategories.IT,
  HelpdeskTicketCategories.HR,
  HelpdeskTicketCategories.Finance,
  HelpdeskTicketCategories.Admin,
  HelpdeskTicketCategories.Assets,
  HelpdeskTicketCategories.ProjectSupport
] as const;

const helpdeskPriorityValues = [
  HelpdeskTicketPriorities.Low,
  HelpdeskTicketPriorities.Medium,
  HelpdeskTicketPriorities.High,
  HelpdeskTicketPriorities.Urgent
] as const;

const helpdeskStatusValues = [
  HelpdeskTicketStatuses.New,
  HelpdeskTicketStatuses.Assigned,
  HelpdeskTicketStatuses.InProgress,
  HelpdeskTicketStatuses.OnHold,
  HelpdeskTicketStatuses.Resolved,
  HelpdeskTicketStatuses.Closed,
  HelpdeskTicketStatuses.Reopened,
  HelpdeskTicketStatuses.Escalated
] as const;

export const helpdeskTicketCreateSchema = z.object({
  category_id: uuidSchema.optional(),
  category_key: z.enum(helpdeskCategoryValues).optional(),
  subject: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(4000),
  sub_category: z.string().trim().max(120).optional(),
  priority: z.enum(helpdeskPriorityValues).default(HelpdeskTicketPriorities.Medium),
  document_ids: z.array(uuidSchema).default([]),
  attachment_name: z.string().trim().max(240).optional(),
  related_asset_id: z.string().trim().max(120).optional(),
  related_project_id: z.string().trim().max(120).optional()
}).refine((input) => Boolean(input.category_id || input.category_key), {
  message: "category_id or category_key is required",
  path: ["category_id"]
});

export type HelpdeskTicketCreateInput = z.infer<typeof helpdeskTicketCreateSchema>;

export const helpdeskTicketUpdateSchema = z.object({
  subject: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(3).max(4000).optional(),
  sub_category: z.string().trim().max(120).nullable().optional(),
  category_id: uuidSchema.optional(),
  category_key: z.enum(helpdeskCategoryValues).optional(),
  priority: z.enum(helpdeskPriorityValues).optional(),
  related_asset_id: z.string().trim().max(120).nullable().optional(),
  related_project_id: z.string().trim().max(120).nullable().optional(),
  expected_version: z.number().int().min(1)
});

export type HelpdeskTicketUpdateInput = z.infer<typeof helpdeskTicketUpdateSchema>;

export const helpdeskCommentSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  document_ids: z.array(uuidSchema).default([]),
  expected_version: z.number().int().min(1).optional()
});

export type HelpdeskCommentInput = z.infer<typeof helpdeskCommentSchema>;

export const helpdeskAttachmentSchema = z.object({
  document_id: uuidSchema.optional(),
  attachment_type: z.string().trim().min(1).max(120).default("supporting_document"),
  file_name: z.string().trim().min(1).max(240).optional(),
  size_text: z.string().trim().max(80).optional(),
  expected_version: z.number().int().min(1).optional()
}).refine((input) => Boolean(input.document_id || input.file_name), {
  message: "document_id or file_name is required",
  path: ["document_id"]
});

export type HelpdeskAttachmentInput = z.infer<typeof helpdeskAttachmentSchema>;

export const helpdeskAssignSchema = z.object({
  assignee_user_id: uuidSchema,
  remarks: z.string().trim().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type HelpdeskAssignInput = z.infer<typeof helpdeskAssignSchema>;

export const helpdeskPrioritySchema = z.object({
  priority: z.enum(helpdeskPriorityValues),
  remarks: z.string().trim().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type HelpdeskPriorityInput = z.infer<typeof helpdeskPrioritySchema>;

export const helpdeskStatusSchema = z.object({
  status: z.enum(helpdeskStatusValues),
  remarks: z.string().trim().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type HelpdeskStatusInput = z.infer<typeof helpdeskStatusSchema>;

export const helpdeskResolveSchema = z.object({
  resolution: z.string().trim().min(3).max(2000),
  document_ids: z.array(uuidSchema).default([]),
  expected_version: z.number().int().min(1)
});

export type HelpdeskResolveInput = z.infer<typeof helpdeskResolveSchema>;

export const helpdeskCloseSchema = z.object({
  satisfaction: z.number().int().min(1).max(5).optional(),
  remarks: z.string().trim().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type HelpdeskCloseInput = z.infer<typeof helpdeskCloseSchema>;

export const helpdeskReopenSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  expected_version: z.number().int().min(1)
});

export type HelpdeskReopenInput = z.infer<typeof helpdeskReopenSchema>;

export const workflowDefinitionSchema = z.object({
  name: z.string().min(1),
  definition: z.object({
    approver_strategy: z.enum(["ltree_manager", "project_manager", "hr_manager"]),
    require_billable_review: z.boolean().default(false)
  })
});

export const statusContractSchemas = {
  expense: z.enum([
    ExpenseStatuses.Draft,
    ExpenseStatuses.Submitted,
    ExpenseStatuses.PendingManagerVerification,
    ExpenseStatuses.ManagerReturned,
    ExpenseStatuses.ManagerRejected,
    ExpenseStatuses.ManagerVerified,
    ExpenseStatuses.FinanceHold,
    ExpenseStatuses.ClarificationRequired,
    ExpenseStatuses.FinanceApproved,
    ExpenseStatuses.PaymentReleased,
    ExpenseStatuses.BillsSubmitted,
    ExpenseStatuses.PendingAdjustment,
    ExpenseStatuses.Closed,
    ExpenseStatuses.FinanceRoutingException,
    ExpenseStatuses.Cancelled
  ]),
  asset: z.enum([
    AssetStatuses.Procured,
    AssetStatuses.InStock,
    AssetStatuses.Assigned,
    AssetStatuses.InMaintenance,
    AssetStatuses.ReturnPending,
    AssetStatuses.Returned,
    AssetStatuses.Retired,
    AssetStatuses.LostStolen
  ]),
  timesheet: z.enum([
    TimesheetStatuses.Draft,
    TimesheetStatuses.Submitted,
    TimesheetStatuses.PendingApproval,
    TimesheetStatuses.Approved,
    TimesheetStatuses.Returned,
    TimesheetStatuses.Rejected
  ]),
  leave: z.enum([
    LeaveRequestStatuses.PendingManager,
    LeaveRequestStatuses.Approved,
    LeaveRequestStatuses.Returned,
    LeaveRequestStatuses.Rejected,
    LeaveRequestStatuses.Cancelled
  ])
};
