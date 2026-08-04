import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  pgSchema,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const core = pgSchema("core");
export const expenses = pgSchema("expenses");
export const documents = pgSchema("documents");
export const assets = pgSchema("assets");
export const timesheets = pgSchema("timesheets");
export const attendance = pgSchema("attendance");
export const leaveWfh = pgSchema("leave_wfh");
export const ems = pgSchema("ems");
export const projects = pgSchema("projects");
export const helpdesk = pgSchema("helpdesk");
export const platform = pgSchema("platform");

const uuidPk = uuid("id").primaryKey();
const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const deletedAt = timestamp("deleted_at", { withTimezone: true });
const version = integer("version").notNull().default(1);
const geometryShape = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Geometry,4326)";
  }
});

export const departments = core.table(
  "departments",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id"),
    departmentCode: text("department_code").notNull(),
    name: text("name").notNull(),
    costCenter: text("cost_center"),
    parentDepartmentId: uuid("parent_department_id"),
    directorUserId: uuid("director_user_id"),
    status: text("status").notNull().default("active"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("core_departments_company_code_uq").on(sql`COALESCE(${table.companyId}, '00000000-0000-0000-0000-000000000000'::uuid)`, table.departmentCode),
    index("core_departments_company_status_idx").on(table.companyId, table.status, table.name)
  ]
);

export const designations = core.table(
  "designations",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id"),
    designationCode: text("designation_code").notNull(),
    title: text("title").notNull(),
    level: integer("level"),
    status: text("status").notNull().default("active"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("core_designations_company_code_uq").on(sql`COALESCE(${table.companyId}, '00000000-0000-0000-0000-000000000000'::uuid)`, table.designationCode),
    index("core_designations_company_status_idx").on(table.companyId, table.status, table.title)
  ]
);

export const users = core.table(
  "users",
  {
    id: uuidPk.defaultRandom(),
    employeeCode: text("employee_code").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    departmentId: uuid("department_id"),
    designationId: uuid("designation_id"),
    managerUserId: uuid("manager_user_id"),
    hierarchyPath: text("hierarchy_path").notNull(),
    employmentStatus: text("employment_status").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    emailVerificationStatus: text("email_verification_status").notNull().default("unverified"),
    profilePhotoDocumentId: uuid("profile_photo_document_id"),
    profilePhotoUrl: text("profile_photo_url"),
    timezone: text("timezone"),
    joinedOn: date("joined_on"),
    terminatedOn: date("terminated_on"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("core_users_employee_code_uq").on(table.employeeCode),
    uniqueIndex("core_users_email_uq").on(table.email),
    index("core_users_hierarchy_path_gist_idx").using("gist", table.hierarchyPath),
    index("core_users_department_status_idx").on(table.departmentId, table.employmentStatus),
    index("core_users_manager_idx").on(table.managerUserId),
    index("core_users_status_updated_idx").on(table.employmentStatus, table.updatedAt),
    index("core_users_email_verification_status_idx").on(table.emailVerificationStatus, table.updatedAt)
  ]
);

export const roles = core.table("roles", {
  id: uuidPk.defaultRandom(),
  roleKey: text("role_key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  builtin: boolean("builtin").notNull().default(true),
  createdAt,
  updatedAt,
  deletedAt,
  version
});

export const rolePermissions = core.table(
  "role_permissions",
  {
    id: uuidPk.defaultRandom(),
    roleKey: text("role_key").notNull(),
    permissionId: text("permission_id").notNull(),
    status: text("status").notNull().default("active"),
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("core_role_permissions_role_permission_uq").on(table.roleKey, table.permissionId),
    index("core_role_permissions_role_status_idx").on(table.roleKey, table.status)
  ]
);

export const userRoles = core.table(
  "user_roles",
  {
    id: uuidPk.defaultRandom(),
    userId: uuid("user_id").notNull(),
    roleKey: text("role_key").notNull(),
    status: text("status").notNull().default("active"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [index("core_user_roles_lookup_idx").on(table.userId, table.status, table.effectiveFrom, table.effectiveTo)]
);

export const userSessions = platform.table(
  "user_sessions",
  {
    id: uuidPk.defaultRandom(),
    userId: uuid("user_id").notNull(),
    sessionJti: text("session_jti").notNull(),
    valkeyKey: text("valkey_key").notNull(),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    createdAt,
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason")
  },
  (table) => [
    uniqueIndex("platform_sessions_jti_uq").on(table.sessionJti),
    index("platform_sessions_user_active_idx").on(table.userId, table.revokedAt, table.expiresAt)
  ]
);

export const companyProfiles = platform.table(
  "company_profiles",
  {
    id: uuidPk.defaultRandom(),
    companyName: text("company_name").notNull(),
    companySlug: text("company_slug").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    locale: text("locale").notNull().default("en-IN"),
    fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(4),
    status: text("status").notNull().default("pending"),
    bootstrapCompletedAt: timestamp("bootstrap_completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    version,
    website: text("website"),
    industry: text("industry"),
    address: text("address"),
    currency: text("currency").notNull().default("INR"),
    workingWeek: text("working_week").notNull().default("Mon-Fri"),
    workHoursPerDay: numeric("work_hours_per_day", { precision: 4, scale: 2 }).notNull().default("8"),
    logoLabel: text("logo_label"),
    logoDocumentId: uuid("logo_document_id"),
    logoUrl: text("logo_url"),
    logoFileName: text("logo_file_name"),
    logoMimeType: text("logo_mime_type"),
    logoSizeBytes: integer("logo_size_bytes")
  },
  (table) => [
    unique("company_profiles_company_slug_key").on(table.companySlug),
    index("platform_company_profiles_status_idx").on(table.status, table.updatedAt.desc()),
    index("platform_company_profiles_slug_status_idx").on(table.companySlug, table.status),
    index("platform_company_profiles_logo_document_idx")
      .on(table.logoDocumentId)
      .where(sql`${table.logoDocumentId} IS NOT NULL`),
    check("company_profiles_fiscal_year_start_month_check", sql`${table.fiscalYearStartMonth} BETWEEN 1 AND 12`)
  ]
);

export const userSessionPreferences = platform.table(
  "user_session_preferences",
  {
    id: uuidPk.defaultRandom(),
    userId: uuid("user_id").notNull(),
    activeRole: text("active_role").notNull(),
    companyId: uuid("company_id"),
    landingPage: text("landing_page").notNull().default("/dashboard"),
    locale: text("locale").notNull().default("en-IN"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    createdAt,
    updatedAt,
    version
  },
  (table) => [
    unique("user_session_preferences_user_id_key").on(table.userId),
    unique("platform_user_session_preferences_user_company_uq").on(table.userId, table.companyId),
    index("platform_user_session_preferences_role_idx").on(table.userId, table.activeRole)
  ]
);

export const registeredDevices = platform.table(
  "registered_devices",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    userId: uuid("user_id").notNull(),
    installationIdHash: text("installation_id_hash").notNull(),
    platform: text("platform").notNull(),
    status: text("status").notNull().default("registered"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("platform_registered_devices_id_company_uq").on(table.id, table.companyId),
    foreignKey({
      name: "platform_registered_devices_company_fk",
      columns: [table.companyId],
      foreignColumns: [companyProfiles.id]
    }).onUpdate("restrict").onDelete("restrict"),
    foreignKey({
      name: "platform_registered_devices_user_company_fk",
      columns: [table.userId, table.companyId],
      foreignColumns: [userSessionPreferences.userId, userSessionPreferences.companyId]
    }).onUpdate("restrict").onDelete("restrict"),
    check("platform_registered_devices_platform_check", sql`${table.platform} IN ('ios', 'android')`),
    check("platform_registered_devices_status_check", sql`${table.status} IN ('registered', 'suspended', 'revoked')`),
    check("platform_registered_devices_installation_hash_check", sql`${table.installationIdHash} ~ '^[0-9a-f]{64}$'`),
    check("platform_registered_devices_status_changed_at_check", sql`${table.statusChangedAt} >= ${table.createdAt}`),
    check("platform_registered_devices_updated_at_check", sql`${table.updatedAt} >= ${table.createdAt}`),
    unique("platform_registered_devices_company_installation_uq").on(table.companyId, table.installationIdHash),
    index("platform_registered_devices_company_user_status_updated_idx")
      .on(table.companyId, table.userId, table.status, table.updatedAt.desc())
  ]
);

export const userCredentials = platform.table(
  "user_credentials",
  {
    id: uuidPk.defaultRandom(),
    userId: uuid("user_id").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("platform_user_credentials_user_uq").on(table.userId),
    index("platform_user_credentials_status_idx").on(table.userId, table.status)
  ]
);

export const idempotencyKeys = platform.table(
  "idempotency_keys",
  {
    id: uuidPk.defaultRandom(),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    requestHash: text("request_hash").notNull(),
    responseHash: text("response_hash"),
    status: text("status").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    responseStatus: integer("response_status"),
    createdAt,
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("platform_idempotency_scope_actor_uq").on(table.scope, table.idempotencyKey, table.actorUserId),
    index("platform_idempotency_expires_idx").on(table.expiresAt),
    index("platform_idempotency_resource_idx")
      .on(table.resourceType, table.resourceId)
      .where(sql`${table.resourceId} is not null`)
  ]
);

export const outboxEvents = platform.table(
  "outbox_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: uuid("event_id").notNull().defaultRandom(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt,
    publishedAt: timestamp("published_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error")
  },
  (table) => [
    uniqueIndex("platform_outbox_event_id_uq").on(table.eventId),
    uniqueIndex("platform_outbox_idempotency_uq").on(table.idempotencyKey),
    index("platform_outbox_pending_idx").on(table.status, table.availableAt, table.id)
  ]
);

export const notifications = platform.table(
  "notifications",
  {
    id: uuidPk.defaultRandom(),
    actorUserId: uuid("actor_user_id"),
    targetUserId: uuid("target_user_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    readAt: timestamp("read_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt
  },
  (table) => [
    index("platform_notifications_target_status_idx").on(table.targetUserId, table.status, table.createdAt),
    index("platform_notifications_type_idx").on(table.eventType, table.createdAt)
  ]
);

export const emailDeliveries = platform.table(
  "email_deliveries",
  {
    id: uuidPk.defaultRandom(),
    provider: text("provider").notNull().default("resend"),
    templateKey: text("template_key").notNull(),
    purpose: text("purpose").notNull(),
    userId: uuid("user_id"),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("queued"),
    providerEmailId: text("provider_email_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    complainedAt: timestamp("complained_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt,
    updatedAt,
    version
  },
  (table) => [
    uniqueIndex("platform_email_deliveries_idempotency_uq").on(table.provider, table.idempotencyKey),
    uniqueIndex("platform_email_deliveries_provider_email_id_uq").on(table.provider, table.providerEmailId),
    index("platform_email_deliveries_user_created_idx").on(table.userId, table.createdAt),
    index("platform_email_deliveries_status_queued_idx").on(table.status, table.queuedAt)
  ]
);

export const emailEvents = platform.table(
  "email_events",
  {
    id: uuidPk.defaultRandom(),
    provider: text("provider").notNull().default("resend"),
    providerEventId: text("provider_event_id").notNull(),
    providerEmailId: text("provider_email_id"),
    eventType: text("event_type").notNull(),
    email: text("email"),
    deliveryId: uuid("delivery_id"),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("platform_email_events_provider_event_uq").on(table.provider, table.providerEventId),
    index("platform_email_events_provider_email_idx").on(table.providerEmailId),
    index("platform_email_events_type_received_idx").on(table.eventType, table.receivedAt)
  ]
);

export const adminWorkflows = platform.table(
  "admin_workflows",
  {
    id: uuidPk.defaultRandom(),
    workflowKey: text("workflow_key").notNull(),
    module: text("module").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("active"),
    stages: jsonb("stages").notNull().default([]),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("platform_admin_workflows_key_uq").on(table.workflowKey),
    index("platform_admin_workflows_module_status_idx").on(table.module, table.status)
  ]
);

export const adminPolicies = platform.table(
  "admin_policies",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id"),
    policyKey: text("policy_key").notNull(),
    module: text("module").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("active"),
    config: jsonb("config").notNull().default({}),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("platform_admin_policies_company_key_uq").on(sql`COALESCE(${table.companyId}, '00000000-0000-0000-0000-000000000000'::uuid)`, table.policyKey),
    index("platform_admin_policies_company_module_status_idx").on(table.companyId, table.module, table.status)
  ]
);

export const adminEmailTemplates = platform.table(
  "admin_email_templates",
  {
    id: uuidPk.defaultRandom(),
    templateKey: text("template_key").notNull(),
    module: text("module").notNull(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    locale: text("locale").notNull().default("en-IN"),
    status: text("status").notNull().default("active"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("platform_admin_email_templates_key_uq").on(table.templateKey),
    index("platform_admin_email_templates_module_status_idx").on(table.module, table.status)
  ]
);

export const adminNotificationChannels = platform.table(
  "admin_notification_channels",
  {
    id: uuidPk.defaultRandom(),
    eventKey: text("event_key").notNull(),
    module: text("module").notNull(),
    label: text("label").notNull(),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("platform_admin_notification_channels_key_uq").on(table.eventKey),
    index("platform_admin_notification_channels_module_status_idx").on(table.module, table.status)
  ]
);

export const adminMasterDataItems = platform.table(
  "admin_master_data_items",
  {
    id: uuidPk.defaultRandom(),
    masterKey: text("master_key").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("platform_admin_master_data_items_key_code_uq").on(table.masterKey, table.code),
    index("platform_admin_master_data_items_key_status_idx").on(table.masterKey, table.status, table.sortOrder, table.name)
  ]
);

export const adminSecuritySettings = platform.table(
  "admin_security_settings",
  {
    id: uuidPk.defaultRandom(),
    settingsKey: text("settings_key").notNull().default("default"),
    passwordMinLength: integer("password_min_length").notNull().default(10),
    passwordRequireSpecial: boolean("password_require_special").notNull().default(false),
    passwordRequireNumber: boolean("password_require_number").notNull().default(true),
    passwordExpiryDays: integer("password_expiry_days").notNull().default(90),
    sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(60),
    loginAttemptLimit: integer("login_attempt_limit").notNull().default(10),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    auditRoleChanges: boolean("audit_role_changes").notNull().default(true),
    ipDeviceAuditEnabled: boolean("ip_device_audit_enabled").notNull().default(true),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [uniqueIndex("platform_admin_security_settings_key_uq").on(table.settingsKey)]
);

export const processedEvents = platform.table(
  "processed_events",
  {
    consumerName: text("consumer_name").notNull(),
    eventId: uuid("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.consumerName, table.eventId] })]
);

export const attendancePunchEvents = attendance.table(
  "punch_events",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    workMode: text("work_mode").notNull().default("office"),
    source: text("source").notNull().default("web"),
    origin: text("origin").notNull().default("employee_manual_now"),
    regularizationRequestId: uuid("regularization_request_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("attendance_punch_events_id_company_uq").on(table.id, table.companyId),
    index("attendance_punch_company_employee_occurred_idx").on(table.companyId, table.employeeUserId, table.occurredAt),
    index("attendance_punch_event_type_idx").on(table.eventType, table.occurredAt),
    check("punch_events_source_check", sql`${table.source} IN ('web', 'web_geo', 'mobile', 'mobile_foreground', 'mobile_offline', 'kiosk', 'admin', 'auto_geofence')`)
  ]
);

export const attendanceSessions = attendance.table(
  "sessions",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    workDate: date("work_date").notNull(),
    status: text("status").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lastTransitionAt: timestamp("last_transition_at", { withTimezone: true }).notNull(),
    workMode: text("work_mode").notNull(),
    source: text("source").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("attendance_sessions_id_company_uq").on(table.id, table.companyId),
    uniqueIndex("attendance_sessions_single_open_idx").on(table.companyId, table.employeeUserId).where(sql`${table.closedAt} IS NULL AND ${table.deletedAt} IS NULL`),
    index("attendance_sessions_employee_history_idx").on(table.companyId, table.employeeUserId, table.checkedInAt),
    index("attendance_sessions_work_date_idx").on(table.companyId, table.workDate, table.employeeUserId),
    check("sessions_source_check", sql`${table.source} IN ('web', 'web_geo', 'mobile', 'mobile_foreground', 'mobile_offline', 'kiosk', 'admin', 'auto_geofence')`)
  ]
);

export const attendanceBreakSegments = attendance.table(
  "break_segments",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("attendance_break_segments_single_active_idx").on(table.companyId, table.sessionId).where(sql`${table.endedAt} IS NULL`),
    index("attendance_break_segments_session_history_idx").on(table.companyId, table.sessionId, table.startedAt)
  ]
);

export const attendanceEmployeeCommandStates = attendance.table(
  "employee_command_states",
  {
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    state: text("state").notNull().default("not_checked_in"),
    currentSessionId: uuid("current_session_id"),
    version,
    createdAt,
    updatedAt
  },
  (table) => [primaryKey({ columns: [table.companyId, table.employeeUserId] })]
);

export const attendanceCommandExecutions = attendance.table(
  "command_executions",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    platformIdempotencyKeyId: uuid("platform_idempotency_key_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    clientEventId: uuid("client_event_id"),
    requestHash: text("request_hash").notNull(),
    commandType: text("command_type").notNull(),
    commandOrigin: text("command_origin").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    sessionId: uuid("session_id"),
    punchEventId: uuid("punch_event_id"),
    requestSnapshot: jsonb("request_snapshot").notNull().default({}),
    responseSnapshot: jsonb("response_snapshot"),
    responseHash: text("response_hash"),
    responseStatus: integer("response_status"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt
  },
  (table) => [
    uniqueIndex("attendance_commands_platform_idempotency_key_uq")
      .on(table.platformIdempotencyKeyId)
      .where(sql`${table.platformIdempotencyKeyId} IS NOT NULL`),
    uniqueIndex("attendance_commands_legacy_idempotency_uq")
      .on(table.companyId, table.actorUserId, table.idempotencyKey)
      .where(sql`${table.platformIdempotencyKeyId} IS NULL`),
    uniqueIndex("attendance_commands_client_event_actor_uq")
      .on(table.companyId, table.actorUserId, table.clientEventId)
      .where(sql`${table.clientEventId} IS NOT NULL`),
    index("attendance_commands_employee_created_idx").on(table.companyId, table.employeeUserId, table.createdAt.desc()),
    index("attendance_commands_status_created_idx").on(table.companyId, table.status, table.createdAt.desc()),
    check("attendance_commands_idempotency_key_length_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 200`),
    check("attendance_commands_request_hash_length_check", sql`length(${table.requestHash}) = 64`),
    check("attendance_commands_response_status_valid", sql`${table.responseStatus} IS NULL OR ${table.responseStatus} BETWEEN 100 AND 599`),
    check("attendance_commands_response_hash_length_check", sql`${table.responseHash} IS NULL OR ${table.responseHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "attendance_commands_replay_metadata_complete_check",
      sql`${table.status} NOT IN ('completed', 'denied') OR (${table.responseSnapshot} IS NOT NULL AND ${table.responseHash} IS NOT NULL AND ${table.responseStatus} IS NOT NULL AND ${table.completedAt} IS NOT NULL)`
    )
  ]
);

export const attendanceEvents = attendance.table(
  "attendance_events",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    commandExecutionId: uuid("command_execution_id"),
    eventType: text("event_type").notNull(),
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload").notNull().default({}),
    payloadHash: text("payload_hash"),
    createdAt
  },
  (table) => [
    uniqueIndex("attendance_events_id_company_uq").on(table.id, table.companyId),
    index("attendance_events_employee_occurred_idx").on(table.companyId, table.employeeUserId, table.occurredAt.desc()),
    index("attendance_events_command_created_idx")
      .on(table.commandExecutionId, table.createdAt)
      .where(sql`${table.commandExecutionId} IS NOT NULL`),
    index("attendance_events_type_received_idx").on(table.companyId, table.eventType, table.receivedAt.desc()),
    check("attendance_events_source_check", sql`${table.source} IN ('web', 'web_geo', 'mobile', 'mobile_foreground', 'mobile_offline', 'kiosk', 'admin', 'auto_geofence', 'system')`),
    check("attendance_events_schema_version_check", sql`${table.schemaVersion} > 0`),
    check("attendance_events_payload_hash_check", sql`${table.payloadHash} IS NULL OR length(${table.payloadHash}) = 64`)
  ]
);

export const attendanceLocationEvidence = attendance.table(
  "location_evidence",
  {
    id: uuidPk.defaultRandom(),
    attendanceEventId: uuid("attendance_event_id").notNull(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    accuracyMeters: numeric("accuracy_meters", { precision: 10, scale: 2 }),
    altitudeMeters: numeric("altitude_meters", { precision: 10, scale: 2 }),
    provider: text("provider"),
    isMocked: boolean("is_mocked"),
    integrityStatus: text("integrity_status"),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    ageMs: integer("age_ms").notNull(),
    permissionState: text("permission_state").notNull().default("unknown"),
    coordinatesExpireAt: timestamp("coordinates_expire_at", { withTimezone: true }),
    coordinateRetentionClass: text("coordinate_retention_class"),
    coordinateRetentionSeconds: integer("coordinate_retention_seconds"),
    coordinatesPurgedAt: timestamp("coordinates_purged_at", { withTimezone: true }),
    retentionPolicyVersionId: uuid("retention_policy_version_id"),
    createdAt
  },
  (table) => [
    index("location_evidence_event_captured_idx").on(table.attendanceEventId, table.capturedAt),
    index("location_evidence_employee_captured_idx").on(table.companyId, table.employeeUserId, table.capturedAt.desc()),
    index("location_evidence_coordinate_purge_due_idx")
      .on(table.coordinatesExpireAt, table.id)
      .where(sql`${table.coordinatesExpireAt} IS NOT NULL AND ${table.coordinatesPurgedAt} IS NULL`),
    check("location_evidence_latitude_check", sql`${table.latitude} BETWEEN -90 AND 90`),
    check("location_evidence_longitude_check", sql`${table.longitude} BETWEEN -180 AND 180`),
    check("location_evidence_accuracy_meters_check", sql`${table.accuracyMeters} >= 0`),
    check("location_evidence_age_ms_nonnegative_check", sql`${table.ageMs} >= 0`),
    check("location_evidence_permission_state_check", sql`${table.permissionState} IN ('granted', 'denied', 'unavailable', 'unknown')`),
    check("location_evidence_provider_check", sql`${table.provider} IS NULL OR ${table.provider} IN ('browser', 'device', 'network', 'unknown')`),
    check("location_evidence_retention_class_check", sql`${table.coordinateRetentionClass} IS NULL OR btrim(${table.coordinateRetentionClass}) <> ''`),
    check("location_evidence_retention_seconds_check", sql`${table.coordinateRetentionSeconds} IS NULL OR ${table.coordinateRetentionSeconds} BETWEEN 60 AND 315360000`),
    check("location_evidence_coordinates_expire_after_received_check", sql`${table.coordinatesExpireAt} IS NULL OR ${table.coordinatesExpireAt} > ${table.receivedAt}`),
    check("location_evidence_coordinates_purge_after_received_check", sql`${table.coordinatesPurgedAt} IS NULL OR ${table.coordinatesPurgedAt} >= ${table.receivedAt}`),
    check("location_evidence_coordinates_by_permission_check", sql`(
      (
        ${table.permissionState} IN ('granted', 'unknown')
        AND ${table.coordinatesPurgedAt} IS NULL
        AND ${table.latitude} IS NOT NULL
        AND ${table.longitude} IS NOT NULL
        AND ${table.accuracyMeters} IS NOT NULL
        AND ${table.coordinatesExpireAt} IS NOT NULL
        AND ${table.coordinateRetentionClass} IS NOT NULL
        AND ${table.coordinateRetentionSeconds} IS NOT NULL
      )
      OR
      (
        ${table.permissionState} IN ('granted', 'unknown')
        AND ${table.coordinatesPurgedAt} IS NOT NULL
        AND ${table.latitude} IS NULL
        AND ${table.longitude} IS NULL
        AND ${table.altitudeMeters} IS NULL
        AND ${table.coordinatesExpireAt} IS NOT NULL
        AND ${table.coordinateRetentionClass} IS NOT NULL
        AND ${table.coordinateRetentionSeconds} IS NOT NULL
      )
      OR
      (
        ${table.permissionState} IN ('denied', 'unavailable')
        AND ${table.latitude} IS NULL
        AND ${table.longitude} IS NULL
        AND ${table.accuracyMeters} IS NULL
        AND ${table.altitudeMeters} IS NULL
        AND ${table.isMocked} IS NULL
        AND ${table.coordinatesExpireAt} IS NULL
        AND ${table.coordinatesPurgedAt} IS NULL
        AND ${table.coordinateRetentionClass} IS NULL
        AND ${table.coordinateRetentionSeconds} IS NULL
        AND ${table.retentionPolicyVersionId} IS NULL
      )
    )`),
    foreignKey({
      name: "location_evidence_event_company_fk",
      columns: [table.attendanceEventId, table.companyId],
      foreignColumns: [attendanceEvents.id, attendanceEvents.companyId]
    }).onUpdate("restrict").onDelete("restrict")
  ]
);

export const attendanceAttestationEvidence = attendance.table(
  "attestation_evidence",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    attendanceEventId: uuid("attendance_event_id").notNull(),
    registeredDeviceId: uuid("registered_device_id"),
    provider: text("provider").$type<"google_play_integrity" | "apple_app_attest">().notNull(),
    verificationStatus: text("verification_status").$type<"verified" | "rejected" | "indeterminate" | "error">().notNull(),
    adapterVersion: text("adapter_version").notNull(),
    challengeBindingHash: text("challenge_binding_hash"),
    artifactHash: text("artifact_hash"),
    normalizedVerdict: jsonb("normalized_verdict").$type<Readonly<Record<string, unknown>>>().notNull().default({}),
    providerMetadata: jsonb("provider_metadata").$type<Readonly<Record<string, unknown>>>().notNull().default({}),
    reasonCodes: jsonb("reason_codes").$type<readonly string[]>().notNull().default([]),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    providerIssuedAt: timestamp("provider_issued_at", { withTimezone: true }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    createdAt
  },
  (table) => [
    index("attestation_evidence_event_idx").on(table.companyId, table.attendanceEventId),
    index("attestation_evidence_registered_device_idx")
      .on(table.companyId, table.registeredDeviceId)
      .where(sql`${table.registeredDeviceId} IS NOT NULL`),
    index("attestation_evidence_provider_status_evaluated_idx")
      .on(table.companyId, table.provider, table.verificationStatus, table.evaluatedAt.desc()),
    check("attestation_evidence_provider_check", sql`${table.provider} IN ('google_play_integrity', 'apple_app_attest')`),
    check("attestation_evidence_verification_status_check", sql`${table.verificationStatus} IN ('verified', 'rejected', 'indeterminate', 'error')`),
    check("attestation_evidence_adapter_version_check", sql`btrim(${table.adapterVersion}) <> ''`),
    check("attestation_evidence_challenge_binding_hash_check", sql`${table.challengeBindingHash} IS NULL OR ${table.challengeBindingHash} ~ '^[0-9a-f]{64}$'`),
    check("attestation_evidence_artifact_hash_check", sql`${table.artifactHash} IS NULL OR ${table.artifactHash} ~ '^[0-9a-f]{64}$'`),
    check("attestation_evidence_normalized_verdict_object_check", sql`jsonb_typeof(${table.normalizedVerdict}) = 'object'`),
    check("attestation_evidence_provider_metadata_object_check", sql`jsonb_typeof(${table.providerMetadata}) = 'object'`),
    check("attestation_evidence_reason_codes_check", sql`attendance.attestation_reason_codes_are_safe(${table.reasonCodes})`)
  ]
);

export const attendanceLocationAccessAuditLogs = attendance.table(
  "location_access_audit_logs",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    subjectEmployeeUserId: uuid("subject_employee_user_id"),
    locationEvidenceId: uuid("location_evidence_id"),
    attendanceEventId: uuid("attendance_event_id"),
    action: text("action").notNull(),
    outcome: text("outcome").notNull().default("allowed"),
    reasonCode: text("reason_code"),
    requestId: text("request_id"),
    operationContext: text("operation_context"),
    exportRecordCount: integer("export_record_count"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt
  },
  (table) => [
    index("location_access_audit_company_created_idx").on(table.companyId, table.createdAt.desc()),
    index("location_access_audit_actor_created_idx").on(table.companyId, table.actorUserId, table.createdAt.desc()),
    index("location_access_audit_subject_created_idx")
      .on(table.companyId, table.subjectEmployeeUserId, table.createdAt.desc())
      .where(sql`${table.subjectEmployeeUserId} IS NOT NULL`),
    index("location_access_audit_evidence_idx")
      .on(table.companyId, table.locationEvidenceId, table.createdAt.desc())
      .where(sql`${table.locationEvidenceId} IS NOT NULL`),
    check("location_access_audit_action_check", sql`${table.action} IN ('attendance.location_coordinates.viewed', 'attendance.location_coordinates.exported')`),
    check("location_access_audit_outcome_check", sql`${table.outcome} IN ('allowed', 'denied')`),
    check("location_access_audit_metadata_object_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check("location_access_audit_no_coordinate_metadata_check", sql`attendance.location_access_audit_metadata_is_safe(${table.metadata})`),
    check("location_access_audit_reason_code_check", sql`attendance.location_audit_code_is_safe(${table.reasonCode})`),
    check("location_access_audit_request_id_check", sql`${table.requestId} IS NULL OR (${table.requestId} ~ '^[A-Za-z0-9_.:-]{1,128}$' AND ${table.requestId} !~ '-?[0-9]{1,3}\\.[0-9]{3,}')`),
    check("location_access_audit_operation_context_check", sql`attendance.location_audit_code_is_safe(${table.operationContext})`),
    check("location_access_audit_export_count_check", sql`${table.exportRecordCount} IS NULL OR ${table.exportRecordCount} >= 0`),
    check("location_access_audit_action_scope_check", sql`(
      (${table.action} = 'attendance.location_coordinates.viewed' AND ${table.locationEvidenceId} IS NOT NULL AND ${table.attendanceEventId} IS NOT NULL AND ${table.subjectEmployeeUserId} IS NOT NULL)
      OR
      (${table.action} = 'attendance.location_coordinates.exported' AND ${table.exportRecordCount} IS NOT NULL)
    )`),
  ]
);

export const attendanceDecisions = attendance.table(
  "attendance_decisions",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    attendanceEventId: uuid("attendance_event_id").notNull(),
    commandExecutionId: uuid("command_execution_id"),
    decisionType: text("decision_type").notNull(),
    outcome: text("outcome").notNull(),
    policyKey: text("policy_key").notNull(),
    policyVersion: text("policy_version").notNull(),
    evaluatorVersion: text("evaluator_version"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    evidenceDigest: text("evidence_digest"),
    policySnapshot: jsonb("policy_snapshot").notNull().default({}),
    evaluationContext: jsonb("evaluation_context").notNull().default({}),
    createdAt
  },
  (table) => [
    uniqueIndex("attendance_decisions_id_company_uq").on(table.id, table.companyId),
    index("attendance_evidence_decisions_event_evaluated_idx").on(table.attendanceEventId, table.evaluatedAt),
    index("attendance_evidence_decisions_command_evaluated_idx")
      .on(table.commandExecutionId, table.evaluatedAt)
      .where(sql`${table.commandExecutionId} IS NOT NULL`),
    index("attendance_evidence_decisions_employee_evaluated_idx").on(table.companyId, table.employeeUserId, table.evaluatedAt.desc()),
    check("attendance_decisions_outcome_check", sql`${table.outcome} IN ('passed', 'failed', 'not_applicable', 'indeterminate')`),
    check("attendance_decisions_evidence_digest_check", sql`${table.evidenceDigest} IS NULL OR length(${table.evidenceDigest}) = 64`),
    foreignKey({
      name: "attendance_decisions_event_company_fk",
      columns: [table.attendanceEventId, table.companyId],
      foreignColumns: [attendanceEvents.id, attendanceEvents.companyId]
    }).onUpdate("restrict").onDelete("restrict")
  ]
);

export const attendanceDecisionReasons = attendance.table(
  "decision_reasons",
  {
    id: uuidPk.defaultRandom(),
    attendanceDecisionId: uuid("attendance_decision_id").notNull(),
    companyId: uuid("company_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    category: text("category"),
    severity: text("severity"),
    ordinal: integer("ordinal").notNull().default(0),
    details: jsonb("details").notNull().default({}),
    createdAt
  },
  (table) => [
    uniqueIndex("attendance_decision_reasons_ordinal_uq").on(table.attendanceDecisionId, table.ordinal),
    check("attendance_decision_reasons_ordinal_check", sql`${table.ordinal} >= 0`),
    foreignKey({
      name: "decision_reasons_decision_company_fk",
      columns: [table.attendanceDecisionId, table.companyId],
      foreignColumns: [attendanceDecisions.id, attendanceDecisions.companyId]
    }).onUpdate("restrict").onDelete("restrict")
  ]
);

export const attendanceDailyRecords = attendance.table(
  "daily_records",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    workDate: date("work_date").notNull(),
    status: text("status").notNull(),
    dayClassification: text("day_classification").notNull().default("unknown"),
    presenceState: text("presence_state").notNull().default("unknown"),
    punctualityState: text("punctuality_state").notNull().default("unknown"),
    evidenceState: text("evidence_state").notNull().default("unknown"),
    approvalKind: text("approval_kind").notNull().default("none"),
    approvalState: text("approval_state").notNull().default("not_required"),
    payrollState: text("payroll_state").notNull().default("unprocessed"),
    firstCheckIn: timestamp("first_check_in", { withTimezone: true }),
    lastCheckOut: timestamp("last_check_out", { withTimezone: true }),
    workMinutes: integer("work_minutes").notNull().default(0),
    breakMinutes: integer("break_minutes").notNull().default(0),
    lateMinutes: integer("late_minutes").notNull().default(0),
    earlyOutMinutes: integer("early_out_minutes").notNull().default(0),
    workSeconds: integer("work_seconds").notNull().default(0),
    breakSeconds: integer("break_seconds").notNull().default(0),
    scheduledSeconds: integer("scheduled_seconds").notNull().default(0),
    lateSeconds: integer("late_seconds").notNull().default(0),
    earlyDepartureSeconds: integer("early_departure_seconds").notNull().default(0),
    workMode: text("work_mode"),
    note: text("note"),
    exceptionType: text("exception_type"),
    regularizationStatus: text("regularization_status"),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("attendance_daily_company_employee_date_uq").on(table.companyId, table.employeeUserId, table.workDate),
    index("attendance_daily_status_date_idx").on(table.status, table.workDate),
    index("attendance_daily_classification_date_idx").on(table.dayClassification, table.workDate),
    index("attendance_daily_presence_date_idx").on(table.presenceState, table.workDate),
    index("attendance_daily_exception_idx").on(table.exceptionType, table.workDate),
    check("attendance_daily_day_classification_check", sql`${table.dayClassification} IN ('working_day', 'weekend', 'holiday', 'leave', 'wfh', 'future', 'unknown')`),
    check("attendance_daily_presence_state_check", sql`${table.presenceState} IN ('not_started', 'present', 'partial', 'incomplete', 'absent', 'not_applicable', 'unknown')`),
    check("attendance_daily_punctuality_state_check", sql`${table.punctualityState} IN ('on_time', 'late', 'early_departure', 'late_and_early_departure', 'not_applicable', 'unknown')`),
    check("attendance_daily_evidence_state_check", sql`${table.evidenceState} IN ('complete', 'partial', 'missing', 'disputed', 'not_applicable', 'unknown')`),
    check("attendance_daily_approval_kind_check", sql`${table.approvalKind} IN ('none', 'regularization', 'leave', 'wfh', 'multiple')`),
    check("attendance_daily_approval_state_check", sql`${table.approvalState} IN ('not_required', 'pending', 'approved', 'returned', 'rejected', 'mixed', 'unknown')`),
    check("attendance_daily_payroll_state_check", sql`${table.payrollState} IN ('unprocessed', 'not_applicable', 'unknown')`),
    check("attendance_daily_seconds_nonnegative_check", sql`${table.workSeconds} >= 0 AND ${table.breakSeconds} >= 0 AND ${table.scheduledSeconds} >= 0 AND ${table.lateSeconds} >= 0 AND ${table.earlyDepartureSeconds} >= 0`)
  ]
);

export const attendanceRegularizationRequests = attendance.table(
  "regularization_requests",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    workDate: date("work_date").notNull(),
    reason: text("reason").notNull(),
    requestedPunches: jsonb("requested_punches").notNull().default([]),
    status: text("status").notNull(),
    currentApproverUserId: uuid("current_approver_user_id"),
    decisionRemarks: text("decision_remarks"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("attendance_regularization_requests_id_company_uq").on(table.id, table.companyId),
    index("attendance_regularizations_company_employee_date_idx").on(table.companyId, table.employeeUserId, table.workDate),
    index("attendance_regularizations_queue_idx").on(table.status, table.currentApproverUserId, table.createdAt)
  ]
);

export const attendanceRegularizationRequestItems = attendance.table(
  "regularization_request_items",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    regularizationRequestId: uuid("regularization_request_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    operation: text("operation").notNull(),
    targetPunchEventId: uuid("target_punch_event_id"),
    eventType: text("event_type"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt
  },
  (table) => [
    uniqueIndex("attendance_regularization_items_request_ordinal_uq").on(table.regularizationRequestId, table.ordinal),
    uniqueIndex("attendance_regularization_items_id_company_uq").on(table.id, table.companyId),
    index("attendance_regularization_items_company_request_idx").on(table.companyId, table.regularizationRequestId, table.ordinal),
    index("attendance_regularization_items_target_idx").on(table.companyId, table.targetPunchEventId).where(sql`${table.targetPunchEventId} IS NOT NULL`),
    check("attendance_regularization_items_ordinal_check", sql`${table.ordinal} >= 0`),
    check("attendance_regularization_items_operation_check", sql`${table.operation} IN ('add', 'replace', 'void')`),
    check("attendance_regularization_items_event_type_check", sql`${table.eventType} IS NULL OR ${table.eventType} IN ('check_in', 'check_out')`),
    check("attendance_regularization_items_operation_shape_check", sql`(${table.operation} = 'add' AND ${table.targetPunchEventId} IS NULL AND ${table.eventType} IS NOT NULL AND ${table.occurredAt} IS NOT NULL) OR (${table.operation} = 'replace' AND ${table.targetPunchEventId} IS NOT NULL AND ${table.eventType} IS NOT NULL AND ${table.occurredAt} IS NOT NULL) OR (${table.operation} = 'void' AND ${table.targetPunchEventId} IS NOT NULL AND ${table.eventType} IS NULL AND ${table.occurredAt} IS NULL)`)
  ]
);

export const attendanceRegularizationActions = attendance.table(
  "regularization_actions",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    regularizationRequestId: uuid("regularization_request_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    subjectEmployeeUserId: uuid("subject_employee_user_id").notNull(),
    actionKind: text("action_kind").notNull(),
    previousState: text("previous_state"),
    resultingState: text("resulting_state").notNull(),
    remarks: text("remarks"),
    resultingVersion: integer("resulting_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    migrationReconstructed: boolean("migration_reconstructed").notNull().default(false)
  },
  (table) => [
    uniqueIndex("attendance_regularization_actions_request_version_uq").on(table.regularizationRequestId, table.resultingVersion),
    uniqueIndex("attendance_regularization_actions_id_request_company_uq").on(table.id, table.regularizationRequestId, table.companyId),
    index("attendance_regularization_actions_company_request_idx").on(table.companyId, table.regularizationRequestId, table.occurredAt, table.id),
    check("attendance_regularization_actions_version_check", sql`${table.resultingVersion} > 0`),
    check("attendance_regularization_actions_kind_check", sql`${table.actionKind} IN ('submitted', 'approved', 'returned', 'rejected')`)
  ]
);

export const attendanceRegularizationCorrectionApplications = attendance.table(
  "regularization_correction_applications",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    regularizationRequestId: uuid("regularization_request_id").notNull(),
    regularizationRequestItemId: uuid("regularization_request_item_id").notNull(),
    regularizationActionId: uuid("regularization_action_id").notNull(),
    operation: text("operation").notNull(),
    targetPunchEventId: uuid("target_punch_event_id"),
    replacementPunchEventId: uuid("replacement_punch_event_id"),
    attendanceEventId: uuid("attendance_event_id"),
    appliedByUserId: uuid("applied_by_user_id").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("attendance_regularization_applications_item_uq").on(table.regularizationRequestItemId),
    uniqueIndex("attendance_regularization_applications_target_uq").on(table.targetPunchEventId).where(sql`${table.targetPunchEventId} IS NOT NULL`),
    uniqueIndex("attendance_regularization_applications_replacement_uq").on(table.replacementPunchEventId).where(sql`${table.replacementPunchEventId} IS NOT NULL`),
    index("attendance_regularization_applications_company_request_idx").on(table.companyId, table.regularizationRequestId, table.appliedAt, table.id),
    check("attendance_regularization_applications_operation_check", sql`${table.operation} IN ('add', 'replace', 'void')`)
  ]
);

export const attendancePolicies = attendance.table(
  "policies",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    policyKey: text("policy_key").notNull(),
    name: text("name").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("attendance_policies_company_key_uq")
      .on(table.companyId, table.policyKey, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("attendance_policies_company_status_idx")
      .on(table.companyId, table.status, table.policyKey)
      .where(sql`${table.deletedAt} IS NULL`)
  ]
);

export const attendancePolicyVersions = attendance.table(
  "policy_versions",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    policyId: uuid("policy_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    config: jsonb("config").notNull().default({}),
    createdByUserId: uuid("created_by_user_id"),
    createdAt
  },
  (table) => [
    uniqueIndex("attendance_policy_versions_policy_number_uq").on(table.policyId, table.versionNumber),
    index("attendance_policy_versions_lookup_idx").on(table.companyId, table.policyId, table.effectiveFrom, table.effectiveUntil)
  ]
);

export const attendancePolicyAssignments = attendance.table(
  "policy_assignments",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    policyId: uuid("policy_id").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    index("attendance_policy_assignments_lookup_idx")
      .on(table.companyId, table.scopeType, table.scopeId, table.status, table.effectiveFrom, table.effectiveUntil)
      .where(sql`${table.deletedAt} IS NULL`)
  ]
);

export const attendanceShiftTemplates = attendance.table(
  "shift_templates",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    isCompanyDefault: boolean("is_company_default").notNull().default(false),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("attendance_shift_templates_company_code_uq")
      .on(table.companyId, table.code)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("attendance_shift_templates_one_default_idx")
      .on(table.companyId)
      .where(sql`${table.isCompanyDefault} = true AND ${table.status} = 'active' AND ${table.deletedAt} IS NULL`),
    index("attendance_shift_templates_company_status_idx")
      .on(table.companyId, table.status, table.name)
      .where(sql`${table.deletedAt} IS NULL`)
  ]
);

export const attendanceShiftTemplateVersions = attendance.table(
  "shift_template_versions",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    templateId: uuid("template_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveUntil: date("effective_until"),
    localStartTime: time("local_start_time").notNull(),
    localEndTime: time("local_end_time").notNull(),
    endDayOffset: integer("end_day_offset").notNull().default(0),
    timezoneStrategy: text("timezone_strategy").notNull(),
    fixedTimezone: text("fixed_timezone"),
    eligibilityOpenBeforeStartMinutes: integer("eligibility_open_before_start_minutes").notNull().default(120),
    eligibilityCloseAfterEndMinutes: integer("eligibility_close_after_end_minutes").notNull().default(240),
    createdByUserId: uuid("created_by_user_id"),
    createdAt
  },
  (table) => [
    uniqueIndex("attendance_shift_versions_template_number_uq").on(table.templateId, table.versionNumber),
    index("attendance_shift_versions_lookup_idx").on(table.companyId, table.templateId, table.effectiveFrom, table.effectiveUntil)
  ]
);

export const attendanceShiftAssignments = attendance.table(
  "shift_assignments",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    templateId: uuid("template_id").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveUntil: date("effective_until"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    index("attendance_shift_assignments_lookup_idx")
      .on(table.companyId, table.employeeUserId, table.status, table.effectiveFrom, table.effectiveUntil)
      .where(sql`${table.deletedAt} IS NULL`)
  ]
);

export const attendanceShiftInstances = attendance.table(
  "shift_instances",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    workDate: date("work_date").notNull(),
    templateId: uuid("template_id").notNull(),
    templateVersionId: uuid("template_version_id").notNull(),
    assignmentId: uuid("assignment_id"),
    resolvedTimezone: text("resolved_timezone").notNull(),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }).notNull(),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }).notNull(),
    eligibilityStartAt: timestamp("eligibility_start_at", { withTimezone: true }).notNull(),
    eligibilityEndAt: timestamp("eligibility_end_at", { withTimezone: true }).notNull(),
    generationSource: text("generation_source").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt
  },
  (table) => [
    uniqueIndex("attendance_shift_instances_employee_date_uq")
      .on(table.companyId, table.employeeUserId, table.workDate)
      .where(sql`${table.deletedAt} IS NULL`),
    index("attendance_shift_instances_template_version_idx")
      .on(table.companyId, table.templateVersionId, table.workDate)
      .where(sql`${table.deletedAt} IS NULL`)
  ]
);

export const attendanceWorkSites = attendance.table(
  "work_sites",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    siteCode: text("site_code").notNull(),
    name: text("name").notNull(),
    siteType: text("site_type").notNull(),
    timezone: text("timezone").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({}),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("attendance_work_sites_company_code_uq")
      .on(table.companyId, table.siteCode)
      .where(sql`${table.deletedAt} IS NULL`),
    index("attendance_work_sites_company_active_name_idx")
      .on(table.companyId, table.isActive, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("attendance_work_sites_company_type_idx")
      .on(table.companyId, table.siteType, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("attendance_work_sites_id_company_uq").on(table.id, table.companyId),
    check("attendance_work_sites_site_code_not_blank_check", sql`btrim(${table.siteCode}) <> ''`),
    check("attendance_work_sites_name_not_blank_check", sql`btrim(${table.name}) <> ''`),
    check("attendance_work_sites_site_type_not_blank_check", sql`btrim(${table.siteType}) <> ''`),
    check("attendance_work_sites_timezone_not_blank_check", sql`btrim(${table.timezone}) <> ''`),
    check("attendance_work_sites_metadata_object_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check("attendance_work_sites_version_positive_check", sql`${table.version} > 0`)
  ]
);

export const attendanceGeofences = attendance.table(
  "geofences",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    workSiteId: uuid("work_site_id").notNull(),
    geofenceCode: text("geofence_code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    currentPublishedVersionId: uuid("current_published_version_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("attendance_geofences_site_code_uq")
      .on(table.companyId, table.workSiteId, table.geofenceCode)
      .where(sql`${table.deletedAt} IS NULL`),
    index("attendance_geofences_company_site_active_idx")
      .on(table.companyId, table.workSiteId, table.isActive, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("attendance_geofences_current_version_idx")
      .on(table.companyId, table.currentPublishedVersionId)
      .where(sql`${table.currentPublishedVersionId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    uniqueIndex("attendance_geofences_id_company_uq").on(table.id, table.companyId),
    check("attendance_geofences_code_not_blank_check", sql`btrim(${table.geofenceCode}) <> ''`),
    check("attendance_geofences_name_not_blank_check", sql`btrim(${table.name}) <> ''`),
    check("attendance_geofences_metadata_object_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check("attendance_geofences_version_positive_check", sql`${table.version} > 0`),
    foreignKey({
      name: "attendance_geofences_work_site_company_fk",
      columns: [table.workSiteId, table.companyId],
      foreignColumns: [attendanceWorkSites.id, attendanceWorkSites.companyId]
    }).onUpdate("restrict").onDelete("restrict")
  ]
);

export const attendanceGeofenceVersions = attendance.table(
  "geofence_versions",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id").notNull(),
    geofenceId: uuid("geofence_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    versionStatus: text("version_status").notNull().default("draft"),
    shapeType: text("shape_type").notNull(),
    shape: geometryShape("shape").notNull(),
    circleRadiusMeters: numeric("circle_radius_meters", { precision: 12, scale: 2 }),
    shapeMetadata: jsonb("shape_metadata").notNull().default({}),
    createdByUserId: uuid("created_by_user_id"),
    createdAt,
    publishedByUserId: uuid("published_by_user_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    canonicalHash: text("canonical_hash")
  },
  (table) => [
    uniqueIndex("attendance_geofence_versions_company_geofence_number_uq")
      .on(table.companyId, table.geofenceId, table.versionNumber),
    uniqueIndex("attendance_geofence_versions_id_company_geofence_uq")
      .on(table.id, table.companyId, table.geofenceId),
    index("attendance_geofence_versions_geofence_status_idx")
      .on(table.companyId, table.geofenceId, table.versionStatus, table.versionNumber),
    index("attendance_geofence_versions_effective_lookup_idx")
      .on(table.companyId, table.geofenceId, table.versionStatus, table.effectiveFrom, table.effectiveUntil)
      .where(sql`${table.versionStatus} = 'published'`),
    index("attendance_geofence_versions_published_circles_gist_idx")
      .using("gist", sql`(${table.shape}::geography)`)
      .where(sql`${table.shapeType} = 'circle' AND ${table.versionStatus} = 'published'`),
    index("attendance_geofence_versions_published_polygons_gist_idx")
      .using("gist", table.shape)
      .where(sql`${table.shapeType} = 'polygon' AND ${table.versionStatus} = 'published'`),
    check("attendance_geofence_versions_version_number_check", sql`${table.versionNumber} > 0`),
    check("attendance_geofence_versions_status_check", sql`${table.versionStatus} IN ('draft', 'published')`),
    check("attendance_geofence_versions_shape_type_check", sql`${table.shapeType} IN ('circle', 'polygon')`),
    check("attendance_geofence_versions_shape_metadata_object_check", sql`jsonb_typeof(${table.shapeMetadata}) = 'object'`),
    check("attendance_geofence_versions_publication_fields_check", sql`(${table.versionStatus} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.publishedByUserId} IS NULL AND ${table.canonicalHash} IS NULL) OR (${table.versionStatus} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.publishedByUserId} IS NOT NULL AND ${table.effectiveFrom} IS NOT NULL AND ${table.canonicalHash} ~ '^[0-9a-f]{64}$')`),
    check("attendance_geofence_versions_effective_period_check", sql`${table.effectiveUntil} IS NULL OR (${table.effectiveFrom} IS NOT NULL AND ${table.effectiveFrom} < ${table.effectiveUntil})`),
    check("attendance_geofence_versions_spatial_shape_check", sql`NOT ST_IsEmpty(${table.shape}) AND ST_SRID(${table.shape}) = 4326 AND ST_CoordDim(${table.shape}) = 2 AND ((${table.shapeType} = 'circle' AND ST_GeometryType(${table.shape}) = 'ST_Point' AND ${table.circleRadiusMeters} IS NOT NULL AND ${table.circleRadiusMeters} > 0 AND CASE WHEN ST_GeometryType(${table.shape}) = 'ST_Point' THEN ST_X(${table.shape}) BETWEEN -180 AND 180 AND ST_Y(${table.shape}) BETWEEN -90 AND 90 ELSE false END) OR (${table.shapeType} = 'polygon' AND ST_GeometryType(${table.shape}) IN ('ST_Polygon', 'ST_MultiPolygon') AND ${table.circleRadiusMeters} IS NULL AND ST_IsValid(${table.shape})))`),
    foreignKey({
      name: "attendance_geofence_versions_geofence_company_fk",
      columns: [table.geofenceId, table.companyId],
      foreignColumns: [attendanceGeofences.id, attendanceGeofences.companyId]
    }).onUpdate("restrict").onDelete("restrict")
  ]
);

export const leaveRequests = leaveWfh.table(
  "leave_requests",
  {
    id: uuidPk.defaultRandom(),
    requestCode: text("request_code").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    leaveType: text("leave_type").notNull(),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),
    halfDay: boolean("half_day").notNull().default(false),
    duration: numeric("duration", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    documentIds: jsonb("document_ids").notNull().default([]),
    status: text("status").notNull(),
    currentApproverUserId: uuid("current_approver_user_id"),
    decisionRemarks: text("decision_remarks"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("leave_requests_code_uq").on(table.requestCode),
    index("leave_requests_employee_date_idx").on(table.employeeUserId, table.dateFrom, table.dateTo),
    index("leave_requests_queue_idx").on(table.status, table.currentApproverUserId, table.createdAt)
  ]
);

export const wfhRequests = leaveWfh.table(
  "wfh_requests",
  {
    id: uuidPk.defaultRandom(),
    requestCode: text("request_code").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),
    halfDay: boolean("half_day").notNull().default(false),
    duration: numeric("duration", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    projectRef: text("project_ref"),
    status: text("status").notNull(),
    currentApproverUserId: uuid("current_approver_user_id"),
    decisionRemarks: text("decision_remarks"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("wfh_requests_code_uq").on(table.requestCode),
    index("wfh_requests_employee_date_idx").on(table.employeeUserId, table.dateFrom, table.dateTo),
    index("wfh_requests_queue_idx").on(table.status, table.currentApproverUserId, table.createdAt)
  ]
);

export const holidays = leaveWfh.table(
  "holidays",
  {
    id: uuidPk.defaultRandom(),
    companyId: uuid("company_id"),
    name: text("name").notNull(),
    holidayDate: date("holiday_date").notNull(),
    region: text("region").notNull().default("All"),
    optional: boolean("optional").notNull().default(false),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("holidays_company_region_date_name_uq").on(table.companyId, table.region, table.holidayDate, table.name),
    index("holidays_company_date_idx").on(table.companyId, table.holidayDate)
  ]
);

export const expenseTickets = expenses.table(
  "expense_tickets",
  {
    id: uuidPk.defaultRandom(),
    ticketNo: text("ticket_no").notNull(),
    requesterUserId: uuid("requester_user_id").notNull(),
    requesterRoleSnapshot: text("requester_role_snapshot").notNull(),
    departmentId: uuid("department_id").notNull(),
    expenseType: text("expense_type").notNull(),
    expenseSubType: text("expense_sub_type").notNull(),
    projectCode: text("project_code"),
    clientName: text("client_name"),
    taskTitle: text("task_title").notNull(),
    taskDescription: text("task_description").notNull(),
    location: text("location"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    estimatedAmount: numeric("estimated_amount", { precision: 14, scale: 2 }).notNull(),
    paymentType: text("payment_type").notNull(),
    advanceAmount: numeric("advance_amount", { precision: 14, scale: 2 }),
    advanceJustification: text("advance_justification"),
    managerVerifierId: uuid("manager_verifier_id"),
    managerBackupUserId: uuid("manager_backup_user_id"),
    financeApproverId: uuid("finance_approver_id"),
    status: text("status").notNull(),
    actualAmount: numeric("actual_amount", { precision: 14, scale: 2 }),
    varianceAmount: numeric("variance_amount", { precision: 14, scale: 2 }),
    paymentReferenceNo: text("payment_reference_no"),
    closureRemarks: text("closure_remarks"),
    contextPayload: jsonb("context_payload").notNull().default({}),
    routeSnapshot: jsonb("route_snapshot").notNull().default({}),
    policySnapshot: jsonb("policy_snapshot").notNull().default({}),
    version,
    createdAt,
    updatedAt,
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    deletedAt
  },
  (table) => [
    uniqueIndex("expenses_tickets_ticket_no_uq").on(table.ticketNo),
    index("expenses_tickets_requester_queue_idx").on(table.requesterUserId, table.status, table.createdAt),
    index("expenses_tickets_manager_queue_idx").on(table.managerVerifierId, table.status, table.createdAt),
    index("expenses_tickets_finance_queue_idx").on(table.financeApproverId, table.status, table.createdAt),
    index("expenses_tickets_department_queue_idx").on(table.departmentId, table.status, table.createdAt),
    index("expenses_tickets_status_hot_idx").on(table.status, table.updatedAt),
    index("expenses_tickets_type_subtype_idx").on(table.expenseType, table.expenseSubType, table.createdAt)
  ]
);

export const expenseLineItems = expenses.table("expense_line_items", {
  id: uuidPk.defaultRandom(),
  ticketId: uuid("ticket_id").notNull(),
  lineCategory: text("line_category").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }),
  vendorName: text("vendor_name"),
  createdAt,
  updatedAt,
  deletedAt
});

export const expenseApprovals = expenses.table(
  "expense_approvals",
  {
    id: uuidPk.defaultRandom(),
    ticketId: uuid("ticket_id").notNull(),
    approvalStage: text("approval_stage").notNull(),
    approverUserId: uuid("approver_user_id").notNull(),
    decision: text("decision").notNull(),
    remarks: text("remarks"),
    roleSnapshot: text("role_snapshot").notNull(),
    designationSnapshot: text("designation_snapshot"),
    routeSnapshot: jsonb("route_snapshot").notNull().default({}),
    actionAt: timestamp("action_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt
  },
  (table) => [
    index("expenses_approvals_ticket_stage_idx").on(table.ticketId, table.approvalStage, table.actionAt),
    index("expenses_approvals_approver_idx").on(table.approverUserId, table.actionAt),
    index("expenses_approvals_decision_idx").on(table.decision, table.actionAt)
  ]
);

export const managerBackupAssignments = expenses.table(
  "employee_reviewer_mappings",
  {
    id: uuidPk.defaultRandom(),
    employeeUserId: uuid("employee_user_id").notNull(),
    backupManagerUserId: uuid("reviewer_user_id").notNull(),
    assignedByUserId: uuid("assigned_by_user_id").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: text("status").notNull(),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    index("expenses_reviewer_mappings_employee_idx").on(table.employeeUserId, table.status, table.effectiveFrom, table.effectiveTo),
    index("expenses_reviewer_mappings_backup_idx").on(table.backupManagerUserId, table.status)
  ]
);

export const expenseDocuments = expenses.table(
  "expense_documents",
  {
    id: uuidPk.defaultRandom(),
    ticketId: uuid("ticket_id").notNull(),
    documentId: uuid("document_id").notNull(),
    documentType: text("document_type").notNull(),
    verificationStatus: text("verification_status").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("expenses_documents_ticket_type_idx").on(table.ticketId, table.documentType, table.verificationStatus)]
);

export const expensePayments = expenses.table(
  "expense_payments",
  {
    id: uuidPk.defaultRandom(),
    ticketId: uuid("ticket_id").notNull(),
    paymentType: text("payment_type").notNull(),
    approvedAmount: numeric("approved_amount", { precision: 14, scale: 2 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentMode: text("payment_mode").notNull(),
    referenceNo: text("reference_no").notNull(),
    settlementStatus: text("settlement_status"),
    settlementAmount: numeric("settlement_amount", { precision: 14, scale: 2 }),
    processedByUserId: uuid("processed_by_user_id").notNull(),
    createdAt
  },
  (table) => [
    index("expenses_payments_ticket_idx").on(table.ticketId),
    index("expenses_payments_processor_idx").on(table.processedByUserId, table.paymentDate),
    index("expenses_payments_settlement_idx").on(table.settlementStatus, table.paymentDate),
    uniqueIndex("expenses_payments_reference_no_uq").on(table.referenceNo)
  ]
);

export const expenseAuditLogs = expenses.table(
  "expense_audit_logs",
  {
    id: uuidPk.defaultRandom(),
    ticketId: uuid("ticket_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    eventType: text("event_type").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    remarks: text("remarks"),
    payloadHash: text("payload_hash"),
    createdAt
  },
  (table) => [
    index("expenses_audit_ticket_idx").on(table.ticketId, table.createdAt),
    index("expenses_audit_actor_idx").on(table.actorUserId, table.createdAt),
    index("expenses_audit_event_idx").on(table.eventType, table.createdAt)
  ]
);

export const expensePolicyRules = expenses.table("expense_policy_rules", {
  id: uuidPk.defaultRandom(),
  category: text("category").notNull(),
  subType: text("sub_type").notNull(),
  maxAmount: numeric("max_amount", { precision: 14, scale: 2 }),
  requiresAttachment: boolean("requires_attachment").notNull().default(false),
  requiresExceptionApproval: boolean("requires_exception_approval").notNull().default(false),
  requiredDocumentTypes: jsonb("required_document_types").notNull().default([]),
  slaHours: integer("sla_hours"),
  status: text("status").notNull(),
  createdAt,
  updatedAt,
  deletedAt
});

export const docMetadata = documents.table(
  "doc_metadata",
  {
    id: uuidPk.defaultRandom(),
    businessObjectType: text("business_object_type").notNull(),
    businessObjectId: uuid("business_object_id").notNull(),
    ownerUserId: uuid("owner_user_id"),
    classification: text("classification").notNull(),
    documentType: text("document_type").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256"),
    metadata: jsonb("metadata").notNull().default({}),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    index("documents_metadata_business_object_idx").on(table.businessObjectType, table.businessObjectId),
    index("documents_metadata_owner_classification_idx").on(table.ownerUserId, table.classification),
    index("documents_metadata_type_created_idx").on(table.documentType, table.createdAt),
    uniqueIndex("documents_metadata_storage_key_uq").on(table.storageKey)
  ]
);

export const docVersions = documents.table(
  "doc_versions",
  {
    id: uuidPk.defaultRandom(),
    documentId: uuid("document_id").notNull(),
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt
  },
  (table) => [
    uniqueIndex("documents_versions_document_version_uq").on(table.documentId, table.version),
    uniqueIndex("documents_versions_storage_key_uq").on(table.storageKey)
  ]
);

export const docPermissions = documents.table("doc_permissions", {
  id: uuidPk.defaultRandom(),
  documentId: uuid("document_id"),
  classification: text("classification"),
  roleKey: text("role_key").notNull(),
  permission: text("permission").notNull(),
  scopeRule: jsonb("scope_rule").notNull().default({}),
  status: text("status").notNull(),
  createdAt,
  updatedAt,
  deletedAt
});

export const docAccessLogs = documents.table(
  "doc_access_logs",
  {
    id: uuidPk.defaultRandom(),
    documentId: uuid("document_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    action: text("action").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    createdAt
  },
  (table) => [
    index("documents_access_document_idx").on(table.documentId, table.createdAt),
    index("documents_access_actor_idx").on(table.actorUserId, table.createdAt)
  ]
);

export const assetRecords = assets.table(
  "assets",
  {
    id: uuidPk.defaultRandom(),
    assetCode: text("asset_code").notNull(),
    qrHash: text("qr_hash").notNull(),
    assetType: text("asset_type").notNull(),
    name: text("name").notNull(),
    serialNo: text("serial_no"),
    status: text("status").notNull(),
    currentAssignedUserId: uuid("current_assigned_user_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("assets_asset_code_uq").on(table.assetCode),
    uniqueIndex("assets_qr_hash_uq").on(table.qrHash),
    index("assets_assigned_status_idx").on(table.currentAssignedUserId, table.status),
    index("assets_status_updated_idx").on(table.status, table.updatedAt)
  ]
);

export const assetAssignments = assets.table("asset_assignments", {
  id: uuidPk.defaultRandom(),
  assetId: uuid("asset_id").notNull(),
  assignedToUserId: uuid("assigned_to_user_id").notNull(),
  assignedByUserId: uuid("assigned_by_user_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  status: text("status").notNull(),
  createdAt,
  updatedAt
});

export const assetRecoveryTickets = assets.table("asset_recovery_tickets", {
  id: uuidPk.defaultRandom(),
  employeeUserId: uuid("employee_user_id").notNull(),
  assetId: uuid("asset_id").notNull(),
  status: text("status").notNull(),
  settlementStatus: text("settlement_status"),
  settlementAmount: numeric("settlement_amount", { precision: 12, scale: 2 }),
  settlementRemarks: text("settlement_remarks"),
  settledByUserId: uuid("settled_by_user_id"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt,
  updatedAt
});

export const assetRequests = assets.table(
  "asset_requests",
  {
    id: uuidPk.defaultRandom(),
    requestCode: text("request_code").notNull(),
    requesterUserId: uuid("requester_user_id").notNull(),
    requestType: text("request_type").notNull(),
    assetType: text("asset_type").notNull(),
    assetId: uuid("asset_id"),
    reason: text("reason").notNull(),
    priority: text("priority").notNull(),
    neededBy: date("needed_by"),
    preferredSpecs: jsonb("preferred_specs").notNull().default({}),
    status: text("status").notNull(),
    decisionByUserId: uuid("decision_by_user_id"),
    decisionAt: timestamp("decision_at", { withTimezone: true }),
    decisionRemarks: text("decision_remarks"),
    assignedAssetId: uuid("assigned_asset_id"),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("asset_requests_request_code_uq").on(table.requestCode),
    index("asset_requests_requester_status_idx").on(table.requesterUserId, table.status, table.createdAt),
    index("asset_requests_status_priority_idx").on(table.status, table.priority, table.createdAt)
  ]
);

export const assetAcknowledgements = assets.table(
  "asset_acknowledgements",
  {
    id: uuidPk.defaultRandom(),
    assetId: uuid("asset_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    assignmentId: uuid("assignment_id"),
    acknowledgementType: text("acknowledgement_type").notNull(),
    status: text("status").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt
  },
  (table) => [
    index("asset_ack_asset_employee_idx").on(table.assetId, table.employeeUserId, table.status),
    index("asset_ack_assignment_idx").on(table.assignmentId)
  ]
);

export const assetMaintenanceRecords = assets.table(
  "asset_maintenance_records",
  {
    id: uuidPk.defaultRandom(),
    assetId: uuid("asset_id").notNull(),
    maintenanceType: text("maintenance_type").notNull(),
    vendorId: uuid("vendor_id"),
    cost: numeric("cost", { precision: 14, scale: 2 }),
    startedOn: date("started_on").notNull(),
    completedOn: date("completed_on"),
    status: text("status").notNull(),
    notes: text("notes"),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    index("asset_maintenance_asset_status_idx").on(table.assetId, table.status, table.startedOn),
    index("asset_maintenance_vendor_idx").on(table.vendorId)
  ]
);

export const softwareVendors = assets.table(
  "software_vendors",
  {
    id: uuidPk.defaultRandom(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    contactEmail: text("contact_email"),
    phone: text("phone"),
    metadata: jsonb("metadata").notNull().default({}),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [uniqueIndex("software_vendors_name_uq").on(table.name)]
);

export const licenseEntitlements = assets.table("license_entitlements", {
  id: uuidPk.defaultRandom(),
  productId: uuid("product_id").notNull(),
  seatCount: integer("seat_count").notNull(),
  status: text("status").notNull(),
  createdAt,
  updatedAt
});

export const licenseActivations = assets.table("license_activations", {
  id: uuidPk.defaultRandom(),
  productId: uuid("product_id").notNull(),
  entitlementId: uuid("entitlement_id").notNull(),
  hardwareFingerprintHash: text("hardware_fingerprint_hash").notNull(),
  status: text("status").notNull(),
  createdAt,
  updatedAt
});

export const compromisedKeys = assets.table("compromised_keys", {
  id: uuidPk.defaultRandom(),
  keyHash: text("key_hash").notNull(),
  status: text("status").notNull(),
  createdAt,
  updatedAt
});

export const workSegments = timesheets.table(
  "work_segments",
  {
    id: uuidPk.defaultRandom(),
    employeeUserId: uuid("employee_user_id").notNull(),
    workDate: date("work_date").notNull(),
    projectCode: text("project_code"),
    taskCode: text("task_code"),
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
    description: text("description"),
    billable: boolean("billable").notNull().default(false),
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    index("timesheets_segments_employee_date_idx").on(table.employeeUserId, table.workDate),
    index("timesheets_segments_project_date_idx").on(table.projectCode, table.workDate)
  ]
);

export const workflowDefinitions = timesheets.table("workflow_definitions", {
  id: uuidPk.defaultRandom(),
  name: text("name").notNull(),
  module: text("module").notNull().default("timesheets"),
  definition: jsonb("definition").notNull(),
  version,
  status: text("status").notNull(),
  createdAt,
  updatedAt
});

export const timesheetSubmissions = timesheets.table(
  "timesheet_submissions",
  {
    id: uuidPk.defaultRandom(),
    employeeUserId: uuid("employee_user_id").notNull(),
    cycleStart: date("cycle_start").notNull(),
    cycleEnd: date("cycle_end").notNull(),
    status: text("status").notNull(),
    totalHours: numeric("total_hours", { precision: 6, scale: 2 }).notNull(),
    workflowDefinitionId: uuid("workflow_definition_id").notNull(),
    workflowSnapshot: jsonb("workflow_snapshot").notNull(),
    currentApproverUserId: uuid("current_approver_user_id"),
    createdAt,
    updatedAt,
    deletedAt,
    version
  },
  (table) => [
    uniqueIndex("timesheets_submissions_cycle_uq").on(table.employeeUserId, table.cycleStart, table.cycleEnd),
    index("timesheets_submissions_queue_idx").on(table.status, table.currentApproverUserId, table.updatedAt),
    index("timesheets_submissions_employee_idx").on(table.employeeUserId, table.status, table.cycleStart)
  ]
);

export const timesheetApprovalActions = timesheets.table("timesheet_approval_actions", {
  id: uuidPk.defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  decision: text("decision").notNull(),
  remarks: text("remarks"),
  createdAt
});

export const projectRecords = projects.table(
  "projects",
  {
    id: uuidPk.defaultRandom(),
    projectCode: text("project_code").notNull(),
    name: text("name").notNull(),
    clientName: text("client_name").notNull(),
    projectType: text("project_type").notNull(),
    billingType: text("billing_type").notNull(),
    managerUserId: uuid("manager_user_id").notNull(),
    departmentId: uuid("department_id"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull(),
    health: text("health").notNull(),
    description: text("description"),
    estimatedHours: numeric("estimated_hours", { precision: 10, scale: 2 }).notNull().default("0"),
    actualHours: numeric("actual_hours", { precision: 10, scale: 2 }).notNull().default("0"),
    estimatedBudget: numeric("estimated_budget", { precision: 14, scale: 2 }).notNull().default("0"),
    actualSpend: numeric("actual_spend", { precision: 14, scale: 2 }).notNull().default("0"),
    techStack: jsonb("tech_stack").notNull().default([]),
    priority: text("priority").notNull(),
    costCenter: text("cost_center"),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("projects_code_uq").on(table.projectCode),
    index("projects_status_manager_idx").on(table.status, table.managerUserId, table.updatedAt),
    index("projects_client_status_idx").on(table.clientName, table.status)
  ]
);

export const projectMembers = projects.table(
  "project_members",
  {
    id: uuidPk.defaultRandom(),
    projectId: uuid("project_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    projectRole: text("project_role").notNull(),
    allocationPercent: integer("allocation_percent").notNull().default(100),
    billable: boolean("billable").notNull().default(true),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    reportingLeadUserId: uuid("reporting_lead_user_id"),
    status: text("status").notNull(),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("project_members_active_user_uq").on(table.projectId, table.employeeUserId),
    index("project_members_employee_idx").on(table.employeeUserId, table.status)
  ]
);

export const projectAllocations = projects.table(
  "project_allocations",
  {
    id: uuidPk.defaultRandom(),
    projectId: uuid("project_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to"),
    allocationPercent: integer("allocation_percent").notNull(),
    billable: boolean("billable").notNull().default(true),
    notes: text("notes"),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    index("project_allocations_employee_date_idx").on(table.employeeUserId, table.dateFrom, table.dateTo),
    index("project_allocations_project_date_idx").on(table.projectId, table.dateFrom)
  ]
);

export const projectMilestones = projects.table(
  "project_milestones",
  {
    id: uuidPk.defaultRandom(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    ownerUserId: uuid("owner_user_id"),
    status: text("status").notNull(),
    startDate: date("start_date"),
    dueDate: date("due_date").notNull(),
    priority: text("priority").notNull(),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    index("project_milestones_project_status_idx").on(table.projectId, table.status, table.dueDate)
  ]
);

export const helpdeskCategories = helpdesk.table(
  "categories",
  {
    id: uuidPk.defaultRandom(),
    categoryKey: text("category_key").notNull(),
    label: text("label").notNull(),
    defaultAssigneeUserId: uuid("default_assignee_user_id"),
    defaultAssigneeName: text("default_assignee_name"),
    defaultAssigneeRole: text("default_assignee_role"),
    team: text("team").notNull(),
    active: boolean("active").notNull().default(true),
    subCategories: jsonb("sub_categories").notNull().default([]),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("helpdesk_categories_key_uq").on(table.categoryKey),
    index("helpdesk_categories_active_idx").on(table.active)
  ]
);

export const helpdeskTickets = helpdesk.table(
  "tickets",
  {
    id: uuidPk.defaultRandom(),
    ticketNo: text("ticket_no").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    categoryId: uuid("category_id").notNull(),
    categoryKey: text("category_key").notNull(),
    subCategory: text("sub_category"),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    requesterUserId: uuid("requester_user_id").notNull(),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email"),
    requesterDepartment: text("requester_department"),
    assigneeUserId: uuid("assignee_user_id"),
    assigneeName: text("assignee_name"),
    assigneeRole: text("assignee_role"),
    relatedAssetId: text("related_asset_id"),
    relatedProjectId: text("related_project_id"),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    resolution: text("resolution"),
    reopenCount: integer("reopen_count").notNull().default(0),
    escalated: boolean("escalated").notNull().default(false),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("helpdesk_tickets_no_uq").on(table.ticketNo),
    index("helpdesk_tickets_requester_idx").on(table.requesterUserId, table.createdAt),
    index("helpdesk_tickets_queue_idx").on(table.status, table.categoryKey, table.assigneeUserId, table.updatedAt)
  ]
);

export const helpdeskTicketComments = helpdesk.table(
  "ticket_comments",
  {
    id: uuidPk.defaultRandom(),
    ticketId: uuid("ticket_id").notNull(),
    authorUserId: uuid("author_user_id"),
    authorName: text("author_name").notNull(),
    authorRole: text("author_role"),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    documentIds: jsonb("document_ids").notNull().default([]),
    createdAt,
    deletedAt
  },
  (table) => [
    index("helpdesk_comments_ticket_idx").on(table.ticketId, table.createdAt)
  ]
);

export const helpdeskTicketAttachments = helpdesk.table(
  "ticket_attachments",
  {
    id: uuidPk.defaultRandom(),
    ticketId: uuid("ticket_id").notNull(),
    documentId: uuid("document_id"),
    attachmentType: text("attachment_type").notNull(),
    fileName: text("file_name").notNull(),
    sizeText: text("size_text"),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    uploadedByName: text("uploaded_by_name").notNull(),
    createdAt,
    deletedAt
  },
  (table) => [
    index("helpdesk_attachments_ticket_idx").on(table.ticketId, table.createdAt)
  ]
);

export const helpdeskTicketEvents = helpdesk.table(
  "ticket_events",
  {
    id: uuidPk.defaultRandom(),
    ticketId: uuid("ticket_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt
  },
  (table) => [
    index("helpdesk_events_ticket_idx").on(table.ticketId, table.createdAt)
  ]
);

export const emsEmployeeProfiles = ems.table(
  "employee_profiles",
  {
    id: uuidPk.defaultRandom(),
    employeeUserId: uuid("employee_user_id").notNull(),
    personalEmail: text("personal_email"),
    phone: text("phone"),
    alternatePhone: text("alternate_phone"),
    currentAddress: text("current_address"),
    permanentAddress: text("permanent_address"),
    city: text("city"),
    country: text("country"),
    emergencyContact: jsonb("emergency_contact").notNull(),
    personalDetails: jsonb("personal_details").notNull(),
    workPreferences: jsonb("work_preferences").notNull(),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("ems_employee_profiles_user_uq").on(table.employeeUserId),
    index("ems_employee_profiles_user_idx").on(table.employeeUserId)
  ]
);

export const emsProfileChangeRequests = ems.table(
  "profile_change_requests",
  {
    id: uuidPk.defaultRandom(),
    requestCode: text("request_code").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    fieldKey: text("field_key").notNull(),
    fieldLabel: text("field_label").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value").notNull(),
    reason: text("reason"),
    supportingDocumentIds: jsonb("supporting_document_ids").notNull(),
    status: text("status").notNull(),
    currentApproverUserId: uuid("current_approver_user_id"),
    decisionRemarks: text("decision_remarks"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("ems_profile_change_code_uq").on(table.requestCode),
    index("ems_profile_change_employee_idx").on(table.employeeUserId, table.createdAt),
    index("ems_profile_change_queue_idx").on(table.status, table.currentApproverUserId, table.createdAt)
  ]
);

export const emsServiceRequests = ems.table(
  "service_requests",
  {
    id: uuidPk.defaultRandom(),
    requestCode: text("request_code").notNull(),
    requesterUserId: uuid("requester_user_id").notNull(),
    requestType: text("request_type").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    documentIds: jsonb("document_ids").notNull(),
    status: text("status").notNull(),
    assigneeUserId: uuid("assignee_user_id"),
    decisionRemarks: text("decision_remarks"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("ems_service_requests_code_uq").on(table.requestCode),
    index("ems_service_requests_requester_idx").on(table.requesterUserId, table.createdAt),
    index("ems_service_requests_queue_idx").on(table.status, table.assigneeUserId, table.createdAt)
  ]
);

export const emsLetters = ems.table(
  "letters",
  {
    id: uuidPk.defaultRandom(),
    employeeUserId: uuid("employee_user_id").notNull(),
    letterType: text("letter_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    documentId: uuid("document_id"),
    issuedOn: date("issued_on"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [index("ems_letters_employee_idx").on(table.employeeUserId, table.createdAt)]
);

export const emsPolicies = ems.table(
  "policies",
  {
    id: uuidPk.defaultRandom(),
    policyCode: text("policy_code").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    versionLabel: text("version_label").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    documentId: uuid("document_id"),
    status: text("status").notNull(),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("ems_policies_code_uq").on(table.policyCode),
    index("ems_policies_active_idx").on(table.status, table.effectiveFrom)
  ]
);

export const emsPolicyAcknowledgements = ems.table(
  "policy_acknowledgements",
  {
    id: uuidPk.defaultRandom(),
    policyId: uuid("policy_id").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    status: text("status").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt
  },
  (table) => [uniqueIndex("ems_policy_ack_user_uq").on(table.policyId, table.employeeUserId)]
);

export const emsAdminChecklists = ems.table(
  "admin_checklists",
  {
    id: uuidPk.defaultRandom(),
    checklistType: text("checklist_type").notNull(),
    employeeUserId: uuid("employee_user_id").notNull(),
    status: text("status").notNull(),
    dueDate: date("due_date"),
    checklist: jsonb("checklist").notNull().default({}),
    remarks: text("remarks"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("ems_admin_checklists_type_employee_uq").on(table.checklistType, table.employeeUserId),
    index("ems_admin_checklists_queue_idx").on(table.checklistType, table.status, table.dueDate, table.updatedAt)
  ]
);

export const emsProbationReviews = ems.table(
  "probation_reviews",
  {
    id: uuidPk.defaultRandom(),
    employeeUserId: uuid("employee_user_id").notNull(),
    joiningOn: date("joining_on").notNull(),
    dueOn: date("due_on").notNull(),
    status: text("status").notNull(),
    extendedUntil: date("extended_until"),
    remarks: text("remarks"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    version,
    createdAt,
    updatedAt,
    deletedAt
  },
  (table) => [
    uniqueIndex("ems_probation_reviews_employee_uq").on(table.employeeUserId),
    index("ems_probation_reviews_queue_idx").on(table.status, table.dueOn, table.updatedAt)
  ]
);

export const schema = {
  departments,
  designations,
  users,
  roles,
  rolePermissions,
  userRoles,
  userSessions,
  companyProfiles,
  userSessionPreferences,
  registeredDevices,
  userCredentials,
  idempotencyKeys,
  outboxEvents,
  notifications,
  adminWorkflows,
  adminPolicies,
  adminEmailTemplates,
  adminNotificationChannels,
  adminMasterDataItems,
  adminSecuritySettings,
  processedEvents,
  attendancePunchEvents,
  attendanceSessions,
  attendanceBreakSegments,
  attendanceEmployeeCommandStates,
  attendanceCommandExecutions,
  attendanceEvents,
  attendanceLocationEvidence,
  attendanceAttestationEvidence,
  attendanceLocationAccessAuditLogs,
  attendanceDecisions,
  attendanceDecisionReasons,
  attendanceDailyRecords,
  attendanceRegularizationRequests,
  attendanceRegularizationRequestItems,
  attendanceRegularizationActions,
  attendanceRegularizationCorrectionApplications,
  attendancePolicies,
  attendancePolicyVersions,
  attendancePolicyAssignments,
  attendanceShiftTemplates,
  attendanceShiftTemplateVersions,
  attendanceShiftAssignments,
  attendanceShiftInstances,
  attendanceWorkSites,
  attendanceGeofences,
  attendanceGeofenceVersions,
  expenseTickets,
  expenseLineItems,
  expenseApprovals,
  managerBackupAssignments,
  expenseDocuments,
  expensePayments,
  expenseAuditLogs,
  expensePolicyRules,
  docMetadata,
  docVersions,
  docPermissions,
  docAccessLogs,
  assetRecords,
  assetAssignments,
  assetRequests,
  assetAcknowledgements,
  assetMaintenanceRecords,
  softwareVendors,
  assetRecoveryTickets,
  licenseEntitlements,
  licenseActivations,
  compromisedKeys,
  workSegments,
  workflowDefinitions,
  timesheetSubmissions,
  timesheetApprovalActions,
  projectRecords,
  projectMembers,
  projectAllocations,
  projectMilestones,
  helpdeskCategories,
  helpdeskTickets,
  helpdeskTicketComments,
  helpdeskTicketAttachments,
  helpdeskTicketEvents,
  emsEmployeeProfiles,
  emsProfileChangeRequests,
  emsServiceRequests,
  emsLetters,
  emsPolicies,
  emsPolicyAcknowledgements,
  emsAdminChecklists,
  emsProbationReviews
};
