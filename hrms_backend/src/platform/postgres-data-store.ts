import { existsSync, readFileSync, readdirSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { ValkeySessionStore } from "#auth";
import type { RoleKey } from "#shared";
import type {
  AssetRecord,
  AttendanceDayRecord,
  AttendancePunch,
  AttendanceRegularizationRequest,
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
  ExpenseTicket,
  FinanceGovernanceConfig,
  HelpdeskCategory,
  HelpdeskTicket,
  HelpdeskTicketAttachment,
  HelpdeskTicketComment,
  HelpdeskTicketEvent,
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
  TimesheetSubmission,
  WfhRequest
} from "#shared";
import {
  type AssetAssignmentRecord,
  type AssetStateEventRecord,
  type AdminMasterDataItemRecord,
  type AuthPersistenceFlushOptions,
  type AuthTokenRecord,
  type CompanyLogoPersistenceFlushOptions,
  type CompanyProfileRecord,
  type DataStore,
  type DomainPersistenceFlushOptions,
  type DocumentProcessingConfig,
  type DocumentAccessLogRecord,
  type DocumentVersionRecord,
  type ExpenseApprovalRecord,
  type LicenseActivation,
  type LicenseEntitlement,
  type NotificationRecord,
  type PersistenceDomain,
  type UserSessionPreferenceRecord,
  type WorkSegment,
  type WorkflowDefinitionRecord,
  buildDefaultAdminMasterDataItems,
  buildDefaultAdminSecuritySettings,
  createMemoryDataStore
} from "./data-store.js";
import type { EmailDeliveryRecord, EmailEventRecord } from "./email/types.js";
import { CloudinaryObjectStorage } from "./object-storage.js";

function optionalSet(values: readonly string[] | undefined): ReadonlySet<string> | undefined {
  return values?.length ? new Set(values) : undefined;
}

function hasAnyDomainFlushOption(options: DomainPersistenceFlushOptions): boolean {
  return Boolean(
    options.userIds?.length ||
    options.companyIds?.length ||
    options.documentIds?.length ||
    options.aggregateIds?.length ||
    options.emsProfileChangeRequestIds?.length ||
    options.emsServiceRequestIds?.length ||
    options.emsLetterIds?.length ||
    options.emsPolicyIds?.length ||
    options.emsAdminChecklistIds?.length ||
    options.emsProbationReviewIds?.length
  );
}

function shouldFlushId(id: string, filter: ReadonlySet<string> | undefined, filtered: boolean): boolean {
  return filtered ? Boolean(filter?.has(id)) : true;
}

export interface PostgresObjectStorageOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  resourceType: "auto" | "image" | "raw" | "video";
  uploadTransformation?: string;
  mockUploads: boolean;
}

export interface PostgresDataStoreOptions {
  databaseUrl: string;
  valkeyUrl: string;
  objectStorage: PostgresObjectStorageOptions;
  documentProcessing?: DocumentProcessingConfig;
  seedIfEmpty?: boolean;
}

const resetTables = [
  "helpdesk.ticket_events",
  "helpdesk.ticket_attachments",
  "helpdesk.ticket_comments",
  "helpdesk.tickets",
  "helpdesk.categories",
  "projects.project_milestones",
  "projects.project_allocations",
  "projects.project_members",
  "projects.projects",
  "ems.probation_reviews",
  "ems.admin_checklists",
  "ems.policy_acknowledgements",
  "ems.policies",
  "ems.letters",
  "ems.service_requests",
  "ems.profile_change_requests",
  "ems.employee_profiles",
  "leave_wfh.holidays",
  "leave_wfh.wfh_requests",
  "leave_wfh.leave_requests",
  "attendance.regularization_requests",
  "attendance.daily_records",
  "attendance.punch_events",
  "timesheets.timesheet_approval_actions",
  "timesheets.timesheet_submissions",
  "timesheets.workflow_definitions",
  "timesheets.work_segments",
  "assets.compromised_keys",
  "assets.license_activations",
  "assets.license_entitlements",
  "assets.asset_maintenance_records",
  "assets.asset_acknowledgements",
  "assets.asset_requests",
  "assets.asset_recovery_tickets",
  "assets.asset_state_events",
  "assets.asset_assignments",
  "assets.software_vendors",
  "assets.assets",
  "documents.doc_access_logs",
  "documents.doc_permissions",
  "documents.doc_versions",
  "documents.doc_metadata",
  "expenses.expense_policy_rules",
  "expenses.expense_audit_logs",
  "expenses.expense_payments",
  "expenses.expense_documents",
  "expenses.employee_reviewer_mappings",
  "expenses.expense_approvals",
  "expenses.expense_line_items",
  "expenses.expense_tickets",
  "platform.processed_events",
  "platform.email_events",
  "platform.email_deliveries",
  "platform.admin_master_data_items",
  "platform.admin_notification_channels",
  "platform.admin_email_templates",
  "platform.admin_policies",
  "platform.admin_workflows",
  "platform.notifications",
  "platform.outbox_events",
  "platform.idempotency_keys",
  "platform.user_sessions",
  "platform.auth_tokens",
  "platform.user_session_preferences",
  "platform.company_profiles",
  "platform.user_credentials",
  "platform.finance_governance_config",
  "core.user_roles",
  "core.role_permissions",
  "core.roles",
  "core.users",
  "core.designations",
  "core.departments"
];

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function asIsoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : asIso(value);
}

function asDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function asDateOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : asDate(value);
}

function asMoney(value: unknown): string | null {
  return value === null || value === undefined ? null : Number(value).toFixed(2);
}

function json(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function booleanRecord(value: unknown): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(json(value)).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
  );
}

function copyData(target: DataStore, source: DataStore): void {
  target.departments = source.departments;
  target.designations = source.designations;
  target.rbacRoles = source.rbacRoles;
  target.rbacRolePermissions = source.rbacRolePermissions;
  target.adminWorkflows = source.adminWorkflows;
  target.adminPolicies = source.adminPolicies;
  target.adminEmailTemplates = source.adminEmailTemplates;
  target.adminNotificationChannels = source.adminNotificationChannels;
  target.adminSecuritySettings = source.adminSecuritySettings;
  target.adminMasterDataItems = source.adminMasterDataItems;
  target.users = source.users;
  target.userCredentials = source.userCredentials;
  target.authTokens = source.authTokens;
  target.companyProfiles = source.companyProfiles;
  target.userSessionPreferences = source.userSessionPreferences;
  target.financeGovernanceConfig = source.financeGovernanceConfig;
  target.managerBackupAssignments = source.managerBackupAssignments;
  target.tickets = source.tickets;
  target.lineItems = source.lineItems;
  target.expenseApprovals = source.expenseApprovals;
  target.auditLogs = source.auditLogs;
  target.expenseDocuments = source.expenseDocuments;
  target.payments = source.payments;
  target.documents = source.documents;
  target.documentVersions = source.documentVersions;
  target.documentAccessLogs = source.documentAccessLogs;
  target.notifications = source.notifications;
  target.emailDeliveries = source.emailDeliveries;
  target.emailEvents = source.emailEvents;
  target.outbox = source.outbox;
  target.assets = source.assets;
  target.assetAssignments = source.assetAssignments;
  target.assetStateEvents = source.assetStateEvents;
  target.assetRequests = source.assetRequests;
  target.assetAcknowledgements = source.assetAcknowledgements;
  target.assetMaintenanceRecords = source.assetMaintenanceRecords;
  target.assetVendors = source.assetVendors;
  target.assetRecoveryTickets = source.assetRecoveryTickets;
  target.licenseEntitlements = source.licenseEntitlements;
  target.licenseActivations = source.licenseActivations;
  target.compromisedKeys = source.compromisedKeys;
  target.workSegments = source.workSegments;
  target.workflowDefinitions = source.workflowDefinitions;
  target.timesheetSubmissions = source.timesheetSubmissions;
  target.timesheetActions = source.timesheetActions;
  target.projects = source.projects;
  target.projectMembers = source.projectMembers;
  target.projectAllocations = source.projectAllocations;
  target.projectMilestones = source.projectMilestones;
  target.helpdeskCategories = source.helpdeskCategories;
  target.helpdeskTickets = source.helpdeskTickets;
  target.helpdeskComments = source.helpdeskComments;
  target.helpdeskAttachments = source.helpdeskAttachments;
  target.helpdeskEvents = source.helpdeskEvents;
  target.attendancePunches = source.attendancePunches;
  target.attendanceDayRecords = source.attendanceDayRecords;
  target.attendanceRegularizations = source.attendanceRegularizations;
  target.leaveRequests = source.leaveRequests;
  target.wfhRequests = source.wfhRequests;
  target.holidays = source.holidays;
  target.emsEmployeeProfiles = source.emsEmployeeProfiles;
  target.emsProfileChangeRequests = source.emsProfileChangeRequests;
  target.emsServiceRequests = source.emsServiceRequests;
  target.emsLetters = source.emsLetters;
  target.emsPolicies = source.emsPolicies;
  target.emsPolicyAcknowledgements = source.emsPolicyAcknowledgements;
  target.emsAdminChecklists = source.emsAdminChecklists;
  target.emsProbationReviews = source.emsProbationReviews;
  target.nextTicketNo = source.nextTicketNo;
  target.nextOutboxId = source.nextOutboxId;
}

function migrationSql(): string {
  const directories = ["src/db/migrations", "dist/src/db/migrations"];
  for (const directory of directories) {
    if (!existsSync(directory)) {
      continue;
    }
    const files = readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    if (files.length > 0) {
      return files.map((file) => readFileSync(`${directory}/${file}`, "utf8")).join("\n");
    }
  }
  throw new Error("SQL migrations are missing from src/db/migrations or dist/src/db/migrations");
}

export async function resetPostgresDatabase(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query(migrationSql());
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${resetTables.join(", ")} RESTART IDENTITY`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createPostgresDataStore(options: PostgresDataStoreOptions): Promise<DataStore> {
  const pool = new Pool({ connectionString: options.databaseUrl });
  const objectStorage = new CloudinaryObjectStorage(options.objectStorage);
  await objectStorage.ensureReady();
  const documentProcessing = options.documentProcessing;

  const store = createMemoryDataStore();
  store.kind = "postgres";
  store.pgPool = pool;
  store.sessionStore = new ValkeySessionStore(options.valkeyUrl);
  store.objectStorage = objectStorage;
  if (documentProcessing) {
    store.documentProcessing = documentProcessing;
  }
  store.persistence = new PostgresPersistence(pool, store);
  await store.persistence.reload();

  if (options.seedIfEmpty && store.users.length === 0) {
    const seed = createMemoryDataStore();
    copyData(store, seed);
    store.kind = "postgres";
    store.pgPool = pool;
    store.sessionStore = new ValkeySessionStore(options.valkeyUrl);
    store.objectStorage = objectStorage;
    if (documentProcessing) {
      store.documentProcessing = documentProcessing;
    }
    store.persistence = new PostgresPersistence(pool, store);
    await store.persistence.flush();
    await store.persistence.reload();
  }

  return store;
}

class PostgresPersistence {
  constructor(
    private readonly pool: Pool,
    private readonly store: DataStore
  ) {}

  async reload(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const loaded = createMemoryDataStore();
      loaded.kind = "postgres";
      loaded.departments = await this.loadDepartments(client);
      loaded.designations = await this.loadDesignations(client);
      loaded.rbacRoles = await this.loadRbacRoles(client);
      loaded.rbacRolePermissions = await this.loadRbacRolePermissions(client);
      loaded.adminWorkflows = await this.loadAdminWorkflows(client);
      loaded.adminPolicies = await this.loadAdminPolicies(client);
      loaded.adminEmailTemplates = await this.loadAdminEmailTemplates(client);
      loaded.adminNotificationChannels = await this.loadAdminNotificationChannels(client);
      loaded.adminSecuritySettings = await this.loadAdminSecuritySettings(client);
      loaded.adminMasterDataItems = await this.loadAdminMasterDataItems(client);
      loaded.users = await this.loadUsers(client);
      loaded.userCredentials = await this.loadUserCredentials(client);
      loaded.authTokens = await this.loadAuthTokens(client);
      loaded.companyProfiles = await this.loadCompanyProfiles(client);
      loaded.userSessionPreferences = await this.loadUserSessionPreferences(client);
      loaded.financeGovernanceConfig = await this.loadFinanceGovernanceConfig(client);
      loaded.managerBackupAssignments = await this.loadManagerBackupAssignments(client);
      loaded.tickets = await this.loadTickets(client);
      loaded.lineItems = await this.loadLineItems(client);
      loaded.expenseApprovals = await this.loadExpenseApprovals(client);
      loaded.auditLogs = await this.loadAuditLogs(client);
      loaded.expenseDocuments = await this.loadExpenseDocuments(client);
      loaded.payments = await this.loadPayments(client);
      loaded.documents = await this.loadDocuments(client);
      loaded.documentVersions = await this.loadDocumentVersions(client);
      loaded.documentAccessLogs = await this.loadDocumentAccessLogs(client);
      loaded.notifications = await this.loadNotifications(client);
      loaded.emailDeliveries = await this.loadEmailDeliveries(client);
      loaded.emailEvents = await this.loadEmailEvents(client);
      loaded.outbox = await this.loadOutbox(client);
      loaded.assets = await this.loadAssets(client);
      loaded.assetAssignments = await this.loadAssetAssignments(client);
      loaded.assetStateEvents = await this.loadAssetStateEvents(client);
      loaded.assetRequests = await this.loadAssetRequests(client);
      loaded.assetAcknowledgements = await this.loadAssetAcknowledgements(client);
      loaded.assetMaintenanceRecords = await this.loadAssetMaintenanceRecords(client);
      loaded.assetVendors = await this.loadAssetVendors(client);
      loaded.assetRecoveryTickets = await this.loadAssetRecoveryTickets(client);
      loaded.licenseEntitlements = await this.loadLicenseEntitlements(client);
      loaded.licenseActivations = await this.loadLicenseActivations(client);
      loaded.compromisedKeys = await this.loadCompromisedKeys(client);
      loaded.workSegments = await this.loadWorkSegments(client);
      loaded.workflowDefinitions = await this.loadWorkflowDefinitions(client);
      loaded.timesheetSubmissions = await this.loadTimesheetSubmissions(client);
      loaded.timesheetActions = await this.loadTimesheetActions(client);
      loaded.projects = await this.loadProjects(client);
      loaded.projectMembers = await this.loadProjectMembers(client);
      loaded.projectAllocations = await this.loadProjectAllocations(client);
      loaded.projectMilestones = await this.loadProjectMilestones(client);
      loaded.helpdeskCategories = await this.loadHelpdeskCategories(client);
      loaded.helpdeskTickets = await this.loadHelpdeskTickets(client);
      loaded.helpdeskComments = await this.loadHelpdeskComments(client);
      loaded.helpdeskAttachments = await this.loadHelpdeskAttachments(client);
      loaded.helpdeskEvents = await this.loadHelpdeskEvents(client);
      loaded.attendancePunches = await this.loadAttendancePunches(client);
      loaded.attendanceDayRecords = await this.loadAttendanceDayRecords(client);
      loaded.attendanceRegularizations = await this.loadAttendanceRegularizations(client);
      loaded.leaveRequests = await this.loadLeaveRequests(client);
      loaded.wfhRequests = await this.loadWfhRequests(client);
      loaded.holidays = await this.loadHolidays(client);
      loaded.emsEmployeeProfiles = await this.loadEmsEmployeeProfiles(client);
      loaded.emsProfileChangeRequests = await this.loadEmsProfileChangeRequests(client);
      loaded.emsServiceRequests = await this.loadEmsServiceRequests(client);
      loaded.emsLetters = await this.loadEmsLetters(client);
      loaded.emsPolicies = await this.loadEmsPolicies(client);
      loaded.emsPolicyAcknowledgements = await this.loadEmsPolicyAcknowledgements(client);
      loaded.emsAdminChecklists = await this.loadEmsAdminChecklists(client);
      loaded.emsProbationReviews = await this.loadEmsProbationReviews(client);
      loaded.nextOutboxId = Math.max(1, ...loaded.outbox.map((event) => event.id + 1));
      loaded.nextTicketNo = this.nextTicketNumber(loaded.tickets);
      copyData(this.store, loaded);
    } finally {
      client.release();
    }
  }

  async flush(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.flushCore(client);
      await this.flushPlatform(client);
      await this.flushExpenses(client);
      await this.flushDocuments(client);
      await this.flushAssets(client);
      await this.flushTimesheets(client);
      await this.flushProjects(client);
      await this.flushHelpdesk(client);
      await this.flushAttendance(client);
      await this.flushLeaveWfh(client);
      await this.flushEms(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushAuth(options: AuthPersistenceFlushOptions = {}): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.flushAuthCore(client, options);
      await this.flushAuthPlatform(client, options);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushCompanyBootstrap(options: AuthPersistenceFlushOptions = {}): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.flushCoreMasterData(client);
      await this.flushAuthCore(client, options);
      await this.flushAuthPlatform(client, options);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushCompanyLogo(options: CompanyLogoPersistenceFlushOptions = {}): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.flushCompanyProfiles(client, optionalSet(options.companyIds));
      const documentIds = optionalSet(options.documentIds);
      await this.flushDocuments(client, documentIds);
      await this.flushOutbox(client, documentIds);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushDomain(domain: PersistenceDomain, options: DomainPersistenceFlushOptions = {}): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const aggregateIds = optionalSet(options.aggregateIds);
      switch (domain) {
        case "core":
          await this.flushAuthCore(client, { userIds: options.userIds });
          await this.flushAuthPlatform(client, {
            userIds: options.userIds,
            companyIds: options.companyIds
          });
          if (options.documentIds?.length) {
            await this.flushDocuments(client, optionalSet(options.documentIds));
          }
          await this.flushOutbox(client, aggregateIds ?? optionalSet(options.userIds));
          break;
        case "platform":
          await this.flushPlatform(client);
          break;
        case "expenses":
          await this.flushExpenses(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "documents":
          await this.flushDocuments(client, optionalSet(options.documentIds));
          await this.flushOutbox(client, aggregateIds ?? optionalSet(options.documentIds));
          break;
        case "assets":
          await this.flushAssets(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "timesheets":
          await this.flushTimesheets(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "projects":
          await this.flushProjects(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "helpdesk":
          await this.flushHelpdesk(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "attendance":
          await this.flushAttendance(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "leave-wfh":
          await this.flushLeaveWfh(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "ems":
          await this.flushEms(client, options);
          await this.flushOutbox(client, aggregateIds);
          if (options.documentIds?.length) {
            await this.flushDocuments(client, optionalSet(options.documentIds));
          }
          break;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if ("close" in this.store.sessionStore && typeof this.store.sessionStore.close === "function") {
      await this.store.sessionStore.close();
    }
    await this.pool.end();
  }

  private nextTicketNumber(tickets: readonly ExpenseTicket[]): number {
    const max = tickets.reduce((current, ticket) => {
      const match = /EXP-\d{4}-(\d+)/u.exec(ticket.ticket_no);
      return Math.max(current, match ? Number(match[1]) : 0);
    }, 0);
    return max + 1;
  }

  private async flushAuthPlatform(client: PoolClient, options: AuthPersistenceFlushOptions): Promise<void> {
    const companyIds = optionalSet(options.companyIds);
    const userIds = optionalSet(options.userIds);

    await this.flushCompanyProfiles(client, companyIds);
    for (const preference of this.store.userSessionPreferences) {
      if (userIds && !userIds.has(preference.user_id)) continue;
      await client.query(
        `INSERT INTO platform.user_session_preferences (
          id, user_id, active_role, company_id, landing_page, locale, timezone, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO UPDATE
        SET active_role = EXCLUDED.active_role, company_id = EXCLUDED.company_id,
            landing_page = EXCLUDED.landing_page, locale = EXCLUDED.locale,
            timezone = EXCLUDED.timezone, updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          preference.id,
          preference.user_id,
          preference.active_role,
          preference.company_id,
          preference.landing_page,
          preference.locale,
          preference.timezone,
          preference.created_at,
          preference.updated_at,
          preference.version
        ]
      );
    }
    for (const token of this.store.authTokens) {
      if (userIds && (!token.user_id || !userIds.has(token.user_id))) continue;
      if (!userIds && companyIds && (!token.company_id || !companyIds.has(token.company_id))) continue;
      await client.query(
        `INSERT INTO platform.auth_tokens (
          id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at,
          revoked_at, created_ip_hash, user_agent_hash, last_sent_at, send_count, created_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            used_at = EXCLUDED.used_at,
            revoked_at = EXCLUDED.revoked_at,
            last_sent_at = EXCLUDED.last_sent_at,
            send_count = EXCLUDED.send_count,
            metadata = EXCLUDED.metadata`,
        [
          token.id,
          token.token_hash,
          token.token_type,
          token.user_id,
          token.email,
          token.company_id,
          token.status,
          token.expires_at,
          token.used_at,
          token.revoked_at,
          token.created_ip_hash,
          token.user_agent_hash,
          token.last_sent_at,
          token.send_count,
          token.created_at,
          JSON.stringify(token.metadata)
        ]
      );
    }
    for (const delivery of this.store.emailDeliveries) {
      if (userIds && (!delivery.user_id || !userIds.has(delivery.user_id))) continue;
      await client.query(
        `INSERT INTO platform.email_deliveries (
          id, provider, template_key, purpose, user_id, email, subject, status, provider_email_id,
          idempotency_key, error_code, error_message, queued_at, sent_at, delivered_at,
          failed_at, bounced_at, complained_at, metadata, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            provider_email_id = EXCLUDED.provider_email_id,
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message,
            sent_at = EXCLUDED.sent_at,
            delivered_at = EXCLUDED.delivered_at,
            failed_at = EXCLUDED.failed_at,
            bounced_at = EXCLUDED.bounced_at,
            complained_at = EXCLUDED.complained_at,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            version = EXCLUDED.version`,
        [
          delivery.id,
          delivery.provider,
          delivery.template_key,
          delivery.purpose,
          delivery.user_id,
          delivery.email,
          delivery.subject,
          delivery.status,
          delivery.provider_email_id,
          delivery.idempotency_key,
          delivery.error_code,
          delivery.error_message,
          delivery.queued_at,
          delivery.sent_at,
          delivery.delivered_at,
          delivery.failed_at,
          delivery.bounced_at,
          delivery.complained_at,
          JSON.stringify(delivery.metadata),
          delivery.created_at,
          delivery.updated_at,
          delivery.version
        ]
      );
    }
  }

  private async flushCompanyProfiles(client: PoolClient, companyIds?: ReadonlySet<string>): Promise<void> {
    for (const company of this.store.companyProfiles) {
      if (companyIds && !companyIds.has(company.id)) continue;
      await client.query(
        `INSERT INTO platform.company_profiles (
          id, company_name, company_slug, website, industry, address, timezone, locale, currency,
          fiscal_year_start_month, working_week, work_hours_per_day, logo_label,
          logo_document_id, logo_url, logo_file_name, logo_mime_type, logo_size_bytes,
          status, bootstrap_completed_at, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (id) DO UPDATE
        SET company_name = EXCLUDED.company_name, website = EXCLUDED.website,
            industry = EXCLUDED.industry, address = EXCLUDED.address, timezone = EXCLUDED.timezone,
            locale = EXCLUDED.locale, currency = EXCLUDED.currency,
            fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
            working_week = EXCLUDED.working_week, work_hours_per_day = EXCLUDED.work_hours_per_day,
            logo_label = EXCLUDED.logo_label,
            logo_document_id = EXCLUDED.logo_document_id,
            logo_url = EXCLUDED.logo_url,
            logo_file_name = EXCLUDED.logo_file_name,
            logo_mime_type = EXCLUDED.logo_mime_type,
            logo_size_bytes = EXCLUDED.logo_size_bytes,
            status = EXCLUDED.status, bootstrap_completed_at = EXCLUDED.bootstrap_completed_at,
            updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          company.id,
          company.company_name,
          company.company_slug,
          company.website,
          company.industry,
          company.address,
          company.timezone,
          company.locale,
          company.currency,
          company.fiscal_year_start_month,
          company.working_week,
          company.work_hours_per_day,
          company.logo_label,
          company.logo_document_id,
          company.logo_url,
          company.logo_file_name,
          company.logo_mime_type,
          company.logo_size_bytes,
          company.status,
          company.bootstrap_completed_at,
          company.created_at,
          company.updated_at,
          company.version
        ]
      );
    }
  }

  private async loadDepartments(client: PoolClient): Promise<Department[]> {
    const { rows } = await client.query(
      "SELECT id, company_id, department_code, name, cost_center, parent_department_id, director_user_id, status, deleted_at, version FROM core.departments ORDER BY department_code"
    );
    return rows.map((row) => ({ ...row, deleted_at: asIsoOrNull(row.deleted_at) }));
  }

  private async loadDesignations(client: PoolClient): Promise<Designation[]> {
    const { rows } = await client.query("SELECT id, company_id, designation_code, title, level, status, deleted_at, version FROM core.designations ORDER BY level NULLS LAST, designation_code");
    return rows.map((row) => ({ ...row, deleted_at: asIsoOrNull(row.deleted_at) }));
  }

  private async loadRbacRoles(client: PoolClient) {
    const { rows } = await client.query("SELECT id, role_key, name, description, status, builtin, created_at, updated_at, deleted_at, version FROM core.roles ORDER BY role_key");
    return rows.map((row) => ({
      id: row.id,
      role_key: row.role_key,
      name: row.name,
      description: row.description,
      status: row.status,
      builtin: row.builtin,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadRbacRolePermissions(client: PoolClient) {
    const { rows } = await client.query("SELECT id, role_key, permission_id, status, created_at, updated_at, deleted_at FROM core.role_permissions ORDER BY role_key, permission_id");
    return rows.map((row) => ({
      id: row.id,
      role_key: row.role_key,
      permission_id: row.permission_id,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAdminWorkflows(client: PoolClient): Promise<AdminWorkflowConfigRecord[]> {
    const { rows } = await client.query(`
      SELECT id, workflow_key, module, label, status, stages, created_at, updated_at, deleted_at, version
      FROM platform.admin_workflows
      ORDER BY workflow_key
    `);
    return rows.map((row) => ({
      id: row.id,
      workflow_key: row.workflow_key,
      module: row.module,
      label: row.label,
      status: row.status,
      stages: Array.isArray(row.stages) ? row.stages : [],
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadAdminPolicies(client: PoolClient): Promise<AdminPolicyConfigRecord[]> {
    const { rows } = await client.query(`
      SELECT id, company_id, policy_key, module, label, status, config, created_at, updated_at, deleted_at, version
      FROM platform.admin_policies
      ORDER BY policy_key
    `);
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      policy_key: row.policy_key,
      module: row.module,
      label: row.label,
      status: row.status,
      config: json(row.config),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadAdminEmailTemplates(client: PoolClient): Promise<AdminEmailTemplateRecord[]> {
    const { rows } = await client.query(`
      SELECT id, template_key, module, name, subject, body, locale, status, created_at, updated_at, deleted_at, version
      FROM platform.admin_email_templates
      ORDER BY template_key
    `);
    return rows.map((row) => ({
      id: row.id,
      template_key: row.template_key,
      module: row.module,
      name: row.name,
      subject: row.subject,
      body: row.body,
      locale: row.locale,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadAdminNotificationChannels(client: PoolClient): Promise<AdminNotificationChannelRecord[]> {
    const { rows } = await client.query(`
      SELECT id, event_key, module, label, in_app_enabled, email_enabled, push_enabled, status, created_at, updated_at, deleted_at, version
      FROM platform.admin_notification_channels
      ORDER BY event_key
    `);
    return rows.map((row) => ({
      id: row.id,
      event_key: row.event_key,
      module: row.module,
      label: row.label,
      in_app_enabled: row.in_app_enabled,
      email_enabled: row.email_enabled,
      push_enabled: row.push_enabled,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadAdminSecuritySettings(client: PoolClient): Promise<AdminSecuritySettingsRecord> {
    const { rows } = await client.query(`
      SELECT
        id, settings_key, password_min_length, password_require_special, password_require_number,
        password_expiry_days, session_timeout_minutes, login_attempt_limit, mfa_enabled,
        audit_role_changes, ip_device_audit_enabled, created_at, updated_at, deleted_at, version
      FROM platform.admin_security_settings
      WHERE settings_key = 'default'
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      return buildDefaultAdminSecuritySettings(new Date().toISOString());
    }
    return {
      id: row.id,
      settings_key: "default",
      password_min_length: row.password_min_length,
      password_require_special: row.password_require_special,
      password_require_number: row.password_require_number,
      password_expiry_days: row.password_expiry_days,
      session_timeout_minutes: row.session_timeout_minutes,
      login_attempt_limit: row.login_attempt_limit,
      mfa_enabled: false,
      audit_role_changes: row.audit_role_changes,
      ip_device_audit_enabled: row.ip_device_audit_enabled,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    };
  }

  private async loadAdminMasterDataItems(client: PoolClient): Promise<AdminMasterDataItemRecord[]> {
    const { rows } = await client.query(`
      SELECT id, master_key, code, name, description, status, sort_order, metadata, created_at, updated_at, deleted_at, version
      FROM platform.admin_master_data_items
      ORDER BY master_key, sort_order, name
    `);
    if (rows.length === 0) {
      return buildDefaultAdminMasterDataItems(new Date().toISOString());
    }
    return rows.map((row) => ({
      id: row.id,
      master_key: row.master_key,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      sort_order: row.sort_order,
      metadata: json(row.metadata),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadUsers(client: PoolClient): Promise<CoreUser[]> {
    const { rows } = await client.query(`
      SELECT
        u.id, u.employee_code, u.email, u.full_name, u.department_id, u.designation_id,
        u.manager_user_id, u.hierarchy_path::text AS hierarchy_path, u.employment_status,
        u.email_verified_at, u.email_verification_status,
        u.profile_photo_document_id, u.profile_photo_url,
        u.timezone, u.joined_on, u.terminated_on, u.deleted_at, u.version,
        COALESCE(array_agg(DISTINCT ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL AND ur.status = 'active' AND ur.deleted_at IS NULL), '{}') AS roles
      FROM core.users u
      LEFT JOIN core.user_roles ur ON ur.user_id = u.id
      GROUP BY u.id
      ORDER BY u.employee_code
    `);
    return rows.map((row) => ({
      ...row,
      roles: row.roles as RoleKey[],
      email_verified_at: asIsoOrNull(row.email_verified_at),
      email_verification_status: row.email_verification_status ?? "unverified",
      joined_on: asDateOrNull(row.joined_on),
      terminated_on: asDateOrNull(row.terminated_on),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadUserCredentials(client: PoolClient): Promise<DataStore["userCredentials"]> {
    const { rows } = await client.query(`
      SELECT id, user_id, password_hash, status, created_at, updated_at, deleted_at
      FROM platform.user_credentials
      WHERE deleted_at IS NULL
      ORDER BY user_id
    `);
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      password_hash: row.password_hash,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }


  private async loadAuthTokens(client: PoolClient): Promise<AuthTokenRecord[]> {
    const { rows } = await client.query(`
      SELECT id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at,
        revoked_at, created_ip_hash, user_agent_hash, last_sent_at, send_count, created_at, metadata
      FROM platform.auth_tokens
      ORDER BY created_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      token_hash: row.token_hash,
      token_type: row.token_type,
      user_id: row.user_id,
      email: row.email,
      company_id: row.company_id,
      status: row.status,
      expires_at: asIso(row.expires_at),
      used_at: asIsoOrNull(row.used_at),
      revoked_at: asIsoOrNull(row.revoked_at),
      created_ip_hash: row.created_ip_hash,
      user_agent_hash: row.user_agent_hash,
      last_sent_at: asIsoOrNull(row.last_sent_at),
      send_count: row.send_count ?? 0,
      created_at: asIso(row.created_at),
      metadata: json(row.metadata)
    }));
  }

  private async loadCompanyProfiles(client: PoolClient): Promise<CompanyProfileRecord[]> {
    const { rows } = await client.query(`
      SELECT id, company_name, company_slug, website, industry, address, timezone, locale, currency,
        fiscal_year_start_month, working_week, work_hours_per_day, logo_label,
        logo_document_id, logo_url, logo_file_name, logo_mime_type, logo_size_bytes,
        status, bootstrap_completed_at, created_at, updated_at, version
      FROM platform.company_profiles
      ORDER BY created_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      company_name: row.company_name,
      company_slug: row.company_slug,
      website: row.website,
      industry: row.industry,
      address: row.address,
      timezone: row.timezone,
      locale: row.locale,
      currency: row.currency,
      fiscal_year_start_month: row.fiscal_year_start_month,
      working_week: row.working_week,
      work_hours_per_day: Number(row.work_hours_per_day),
      logo_label: row.logo_label,
      logo_document_id: row.logo_document_id,
      logo_url: row.logo_url,
      logo_file_name: row.logo_file_name,
      logo_mime_type: row.logo_mime_type,
      logo_size_bytes: row.logo_size_bytes === null ? null : Number(row.logo_size_bytes),
      status: row.status,
      bootstrap_completed_at: asIsoOrNull(row.bootstrap_completed_at),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      version: row.version
    }));
  }

  private async loadUserSessionPreferences(client: PoolClient): Promise<UserSessionPreferenceRecord[]> {
    const { rows } = await client.query(`
      SELECT id, user_id, active_role, company_id, landing_page, locale, timezone, created_at, updated_at, version
      FROM platform.user_session_preferences
      ORDER BY updated_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      active_role: row.active_role,
      company_id: row.company_id,
      landing_page: row.landing_page,
      locale: row.locale,
      timezone: row.timezone,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      version: row.version
    }));
  }

  private async loadFinanceGovernanceConfig(client: PoolClient): Promise<FinanceGovernanceConfig | null> {
    const { rows } = await client.query(`
      SELECT
        id,
        scope_key,
        primary_finance_manager_user_id,
        finance_self_request_fallback_user_id,
        manager_backup_user_id,
        finance_approval_backup_user_id,
        status,
        effective_from,
        effective_to,
        updated_by_user_id,
        created_at,
        updated_at,
        deleted_at,
        version
      FROM platform.finance_governance_config
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      scope_key: row.scope_key,
      primary_finance_manager_user_id: row.primary_finance_manager_user_id,
      manager_backup_user_id: row.manager_backup_user_id,
      finance_approval_backup_user_id: row.finance_approval_backup_user_id ?? row.finance_self_request_fallback_user_id,
      status: row.status,
      effective_from: asDate(row.effective_from),
      effective_to: asDateOrNull(row.effective_to),
      updated_by_user_id: row.updated_by_user_id,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    };
  }

  private async loadManagerBackupAssignments(client: PoolClient): Promise<ManagerBackupAssignment[]> {
    const { rows } = await client.query("SELECT * FROM expenses.employee_reviewer_mappings ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      backup_manager_user_id: row.backup_manager_user_id ?? row.reviewer_user_id,
      assigned_by_user_id: row.assigned_by_user_id,
      effective_from: asDate(row.effective_from),
      effective_to: asDateOrNull(row.effective_to),
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadTickets(client: PoolClient): Promise<ExpenseTicket[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_tickets ORDER BY created_at, ticket_no");
    return rows.map((row) => ({
      id: row.id,
      ticket_no: row.ticket_no,
      requester_user_id: row.requester_user_id,
      requester_role_snapshot: row.requester_role_snapshot,
      department_id: row.department_id,
      expense_type: row.expense_type,
      expense_sub_type: row.expense_sub_type,
      project_code: row.project_code,
      client_name: row.client_name,
      task_title: row.task_title,
      task_description: row.task_description,
      location: row.location,
      start_date: asDate(row.start_date),
      end_date: asDate(row.end_date),
      estimated_amount: asMoney(row.estimated_amount) ?? "0.00",
      payment_type: row.payment_type,
      advance_amount: asMoney(row.advance_amount),
      advance_justification: row.advance_justification,
      manager_verifier_id: row.manager_verifier_id ?? row.assigned_reviewer_id ?? row.director_approver_id,
      manager_backup_user_id: row.manager_backup_user_id,
      finance_approver_id: row.finance_approver_id ?? row.finance_manager_id,
      status: row.status,
      actual_amount: asMoney(row.actual_amount),
      variance_amount: asMoney(row.variance_amount),
      payment_reference_no: row.payment_reference_no,
      closure_remarks: row.closure_remarks,
      context_payload: json(row.context_payload),
      route_snapshot: json(row.route_snapshot),
      policy_snapshot: json(row.policy_snapshot),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      submitted_at: asIsoOrNull(row.submitted_at),
      closed_at: asIsoOrNull(row.closed_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadLineItems(client: PoolClient): Promise<ExpenseLineItem[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_line_items ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      line_category: row.line_category,
      description: row.description,
      quantity: asMoney(row.quantity),
      unit_cost: asMoney(row.unit_cost),
      line_total: asMoney(row.line_total) ?? "0.00",
      tax_amount: asMoney(row.tax_amount),
      vendor_name: row.vendor_name
    }));
  }

  private async loadExpenseApprovals(client: PoolClient): Promise<ExpenseApprovalRecord[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_approvals ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      approval_stage: row.approval_stage,
      approver_user_id: row.approver_user_id,
      decision: row.decision,
      remarks: row.remarks,
      role_snapshot: row.role_snapshot,
      designation_snapshot: row.designation_snapshot,
      route_snapshot: json(row.route_snapshot),
      action_at: asIso(row.action_at),
      created_at: asIso(row.created_at)
    }));
  }

  private async loadAuditLogs(client: PoolClient): Promise<ExpenseAuditLog[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_audit_logs ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      actor_user_id: row.actor_user_id,
      event_type: row.event_type,
      old_value: row.old_value,
      new_value: row.new_value,
      remarks: row.remarks,
      payload_hash: row.payload_hash,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadExpenseDocuments(client: PoolClient): Promise<ExpenseDocument[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_documents ORDER BY uploaded_at, id");
    return rows.map((row) => ({ ...row, uploaded_at: asIso(row.uploaded_at) }));
  }

  private async loadPayments(client: PoolClient): Promise<ExpensePayment[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_payments ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      payment_type: row.payment_type,
      approved_amount: asMoney(row.approved_amount) ?? "0.00",
      paid_amount: asMoney(row.paid_amount) ?? "0.00",
      payment_date: asDate(row.payment_date),
      payment_mode: row.payment_mode,
      reference_no: row.reference_no,
      settlement_status: row.settlement_status,
      settlement_amount: asMoney(row.settlement_amount),
      processed_by_user_id: row.processed_by_user_id,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadDocuments(client: PoolClient): Promise<DocumentMetadata[]> {
    const { rows } = await client.query("SELECT * FROM documents.doc_metadata ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      business_object_type: row.business_object_type,
      business_object_id: row.business_object_id,
      owner_user_id: row.owner_user_id,
      classification: row.classification,
      document_type: row.document_type,
      current_version: row.current_version,
      file_name: row.file_name,
      storage_key: row.storage_key,
      mime_type: row.mime_type,
      size_bytes: Number(row.size_bytes),
      checksum_sha256: row.checksum_sha256,
      metadata: json(row.metadata),
      created_by_user_id: row.created_by_user_id,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadDocumentVersions(client: PoolClient): Promise<DocumentVersionRecord[]> {
    const { rows } = await client.query("SELECT * FROM documents.doc_versions ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      document_id: row.document_id,
      version: row.version,
      storage_key: row.storage_key,
      file_name: row.file_name,
      size_bytes: Number(row.size_bytes),
      checksum_sha256: row.checksum_sha256,
      created_by_user_id: row.created_by_user_id,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadDocumentAccessLogs(client: PoolClient): Promise<DocumentAccessLogRecord[]> {
    const { rows } = await client.query("SELECT * FROM documents.doc_access_logs ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      document_id: row.document_id,
      actor_user_id: row.actor_user_id,
      action: row.action,
      decision: row.decision,
      reason: row.reason,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadNotifications(client: PoolClient): Promise<NotificationRecord[]> {
    const { rows } = await client.query("SELECT * FROM platform.notifications ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      actor_user_id: row.actor_user_id,
      target_user_id: row.target_user_id,
      event_type: row.event_type,
      payload: json(row.payload),
      status: row.status,
      read_at: asIsoOrNull(row.read_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadEmailDeliveries(client: PoolClient): Promise<EmailDeliveryRecord[]> {
    const { rows } = await client.query(`
      SELECT id, provider, template_key, purpose, user_id, email, subject, status, provider_email_id,
        idempotency_key, error_code, error_message, queued_at, sent_at, delivered_at, failed_at,
        bounced_at, complained_at, metadata, created_at, updated_at, version
      FROM platform.email_deliveries
      ORDER BY created_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      template_key: row.template_key,
      purpose: row.purpose,
      user_id: row.user_id,
      email: row.email,
      subject: row.subject,
      status: row.status,
      provider_email_id: row.provider_email_id,
      idempotency_key: row.idempotency_key,
      error_code: row.error_code,
      error_message: row.error_message,
      queued_at: asIso(row.queued_at),
      sent_at: asIsoOrNull(row.sent_at),
      delivered_at: asIsoOrNull(row.delivered_at),
      failed_at: asIsoOrNull(row.failed_at),
      bounced_at: asIsoOrNull(row.bounced_at),
      complained_at: asIsoOrNull(row.complained_at),
      metadata: json(row.metadata),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      version: row.version
    }));
  }

  private async loadEmailEvents(client: PoolClient): Promise<EmailEventRecord[]> {
    const { rows } = await client.query(`
      SELECT id, provider, provider_event_id, provider_email_id, event_type, email, delivery_id, payload, received_at, processed_at
      FROM platform.email_events
      ORDER BY received_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      provider_event_id: row.provider_event_id,
      provider_email_id: row.provider_email_id,
      event_type: row.event_type,
      email: row.email,
      delivery_id: row.delivery_id,
      payload: json(row.payload),
      received_at: asIso(row.received_at),
      processed_at: asIsoOrNull(row.processed_at)
    }));
  }

  private async loadOutbox(client: PoolClient): Promise<OutboxEvent[]> {
    const { rows } = await client.query("SELECT * FROM platform.outbox_events ORDER BY id");
    return rows.map((row) => ({
      id: Number(row.id),
      event_id: row.event_id,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      event_type: row.event_type,
      payload: json(row.payload),
      idempotency_key: row.idempotency_key,
      status: row.status,
      retry_count: row.retry_count,
      available_at: asIso(row.available_at),
      created_at: asIso(row.created_at),
      published_at: asIsoOrNull(row.published_at),
      failed_at: asIsoOrNull(row.failed_at),
      last_error: row.last_error
    }));
  }

  private async loadAssets(client: PoolClient): Promise<AssetRecord[]> {
    const { rows } = await client.query("SELECT * FROM assets.assets ORDER BY created_at, asset_code");
    return rows.map((row) => ({
      id: row.id,
      asset_code: row.asset_code,
      qr_hash: row.qr_hash,
      asset_type: row.asset_type,
      name: row.name,
      serial_no: row.serial_no,
      status: row.status,
      current_assigned_user_id: row.current_assigned_user_id,
      metadata: json(row.metadata),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAssetAssignments(client: PoolClient): Promise<AssetAssignmentRecord[]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_assignments ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      assigned_to_user_id: row.assigned_to_user_id,
      assigned_by_user_id: row.assigned_by_user_id,
      assigned_at: asIso(row.assigned_at),
      returned_at: asIsoOrNull(row.returned_at),
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadAssetStateEvents(client: PoolClient): Promise<AssetStateEventRecord[]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_state_events ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      actor_user_id: row.actor_user_id,
      event_type: row.event_type,
      payload: json(row.payload),
      created_at: asIso(row.created_at)
    }));
  }

  private async loadAssetRequests(client: PoolClient): Promise<DataStore["assetRequests"]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_requests ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      requester_user_id: row.requester_user_id,
      request_type: row.request_type,
      asset_type: row.asset_type,
      asset_id: row.asset_id,
      reason: row.reason,
      priority: row.priority,
      needed_by: asDateOrNull(row.needed_by),
      preferred_specs: json(row.preferred_specs),
      status: row.status,
      decision_by_user_id: row.decision_by_user_id,
      decision_at: asIsoOrNull(row.decision_at),
      decision_remarks: row.decision_remarks,
      assigned_asset_id: row.assigned_asset_id,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAssetAcknowledgements(client: PoolClient): Promise<DataStore["assetAcknowledgements"]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_acknowledgements ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      employee_user_id: row.employee_user_id,
      assignment_id: row.assignment_id,
      acknowledgement_type: row.acknowledgement_type,
      status: row.status,
      acknowledged_at: asIsoOrNull(row.acknowledged_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadAssetMaintenanceRecords(client: PoolClient): Promise<DataStore["assetMaintenanceRecords"]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_maintenance_records ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      maintenance_type: row.maintenance_type,
      vendor_id: row.vendor_id,
      cost: asMoney(row.cost),
      started_on: asDate(row.started_on),
      completed_on: asDateOrNull(row.completed_on),
      status: row.status,
      notes: row.notes,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAssetVendors(client: PoolClient): Promise<DataStore["assetVendors"]> {
    const { rows } = await client.query("SELECT * FROM assets.software_vendors ORDER BY name, id");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status ?? "active",
      contact_email: row.contact_email,
      phone: row.phone,
      metadata: json(row.metadata),
      version: row.version ?? 1,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at ?? row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAssetRecoveryTickets(client: PoolClient): Promise<DataStore["assetRecoveryTickets"]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_recovery_tickets ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      asset_id: row.asset_id,
      status: row.status,
      settlement_status: row.settlement_status,
      settlement_amount: asMoney(row.settlement_amount),
      settlement_remarks: row.settlement_remarks,
      settled_by_user_id: row.settled_by_user_id,
      settled_at: asIsoOrNull(row.settled_at),
      version: row.version ?? 1,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadLicenseEntitlements(client: PoolClient): Promise<LicenseEntitlement[]> {
    const { rows } = await client.query("SELECT * FROM assets.license_entitlements ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      seat_count: row.seat_count,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadLicenseActivations(client: PoolClient): Promise<LicenseActivation[]> {
    const { rows } = await client.query("SELECT * FROM assets.license_activations ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      entitlement_id: row.entitlement_id,
      hardware_fingerprint_hash: row.hardware_fingerprint_hash,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadCompromisedKeys(client: PoolClient): Promise<DataStore["compromisedKeys"]> {
    const { rows } = await client.query("SELECT * FROM assets.compromised_keys ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      key_hash: row.key_hash,
      status: row.status,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadWorkSegments(client: PoolClient): Promise<WorkSegment[]> {
    const { rows } = await client.query("SELECT * FROM timesheets.work_segments ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      work_date: asDate(row.work_date),
      project_code: row.project_code,
      task_code: row.task_code,
      hours: asMoney(row.hours) ?? "0.00",
      description: row.description,
      billable: row.billable,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadWorkflowDefinitions(client: PoolClient): Promise<WorkflowDefinitionRecord[]> {
    const { rows } = await client.query("SELECT * FROM timesheets.workflow_definitions ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      module: row.module,
      definition: row.definition,
      version: row.version,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadTimesheetSubmissions(client: PoolClient): Promise<TimesheetSubmission[]> {
    const { rows } = await client.query("SELECT * FROM timesheets.timesheet_submissions ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      cycle_start: asDate(row.cycle_start),
      cycle_end: asDate(row.cycle_end),
      status: row.status,
      total_hours: asMoney(row.total_hours) ?? "0.00",
      workflow_definition_id: row.workflow_definition_id,
      workflow_snapshot: json(row.workflow_snapshot),
      current_approver_user_id: row.current_approver_user_id,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadTimesheetActions(client: PoolClient): Promise<DataStore["timesheetActions"]> {
    const { rows } = await client.query("SELECT * FROM timesheets.timesheet_approval_actions ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      submission_id: row.submission_id,
      actor_user_id: row.actor_user_id,
      decision: row.decision,
      remarks: row.remarks,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadProjects(client: PoolClient): Promise<ProjectRecord[]> {
    const { rows } = await client.query("SELECT * FROM projects.projects ORDER BY project_code");
    return rows.map((row) => ({
      id: row.id,
      project_code: row.project_code,
      name: row.name,
      client_name: row.client_name,
      project_type: row.project_type,
      billing_type: row.billing_type,
      manager_user_id: row.manager_user_id,
      department_id: row.department_id,
      start_date: asDate(row.start_date),
      end_date: asDate(row.end_date),
      status: row.status,
      health: row.health,
      description: row.description,
      estimated_hours: asMoney(row.estimated_hours) ?? "0.00",
      actual_hours: asMoney(row.actual_hours) ?? "0.00",
      estimated_budget: asMoney(row.estimated_budget) ?? "0.00",
      actual_spend: asMoney(row.actual_spend) ?? "0.00",
      tech_stack: Array.isArray(row.tech_stack) ? row.tech_stack : [],
      priority: row.priority,
      cost_center: row.cost_center,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadProjectMembers(client: PoolClient): Promise<ProjectMemberRecord[]> {
    const { rows } = await client.query("SELECT * FROM projects.project_members ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      employee_user_id: row.employee_user_id,
      project_role: row.project_role,
      allocation_percent: row.allocation_percent,
      billable: Boolean(row.billable),
      start_date: asDate(row.start_date),
      end_date: asDateOrNull(row.end_date),
      reporting_lead_user_id: row.reporting_lead_user_id,
      status: row.status,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadProjectAllocations(client: PoolClient): Promise<ProjectAllocationRecord[]> {
    const { rows } = await client.query("SELECT * FROM projects.project_allocations ORDER BY date_from DESC, id");
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      employee_user_id: row.employee_user_id,
      date_from: asDate(row.date_from),
      date_to: asDateOrNull(row.date_to),
      allocation_percent: row.allocation_percent,
      billable: Boolean(row.billable),
      notes: row.notes,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadProjectMilestones(client: PoolClient): Promise<ProjectMilestoneRecord[]> {
    const { rows } = await client.query("SELECT * FROM projects.project_milestones ORDER BY due_date, id");
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      owner_user_id: row.owner_user_id,
      status: row.status,
      start_date: asDateOrNull(row.start_date),
      due_date: asDate(row.due_date),
      priority: row.priority,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadHelpdeskCategories(client: PoolClient): Promise<HelpdeskCategory[]> {
    const { rows } = await client.query("SELECT * FROM helpdesk.categories ORDER BY category_key");
    return rows.map((row) => ({
      id: row.id,
      category_key: row.category_key,
      label: row.label,
      default_assignee_user_id: row.default_assignee_user_id,
      default_assignee_name: row.default_assignee_name,
      default_assignee_role: row.default_assignee_role,
      team: row.team,
      active: Boolean(row.active),
      sub_categories: Array.isArray(row.sub_categories) ? row.sub_categories : [],
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadHelpdeskTickets(client: PoolClient): Promise<HelpdeskTicket[]> {
    const { rows } = await client.query("SELECT * FROM helpdesk.tickets ORDER BY created_at DESC, ticket_no DESC");
    return rows.map((row) => ({
      id: row.id,
      ticket_no: row.ticket_no,
      subject: row.subject,
      description: row.description,
      category_id: row.category_id,
      category_key: row.category_key,
      sub_category: row.sub_category,
      priority: row.priority,
      status: row.status,
      requester_user_id: row.requester_user_id,
      requester_name: row.requester_name,
      requester_email: row.requester_email,
      requester_department: row.requester_department,
      assignee_user_id: row.assignee_user_id,
      assignee_name: row.assignee_name,
      assignee_role: row.assignee_role,
      related_asset_id: row.related_asset_id,
      related_project_id: row.related_project_id,
      first_response_at: asIsoOrNull(row.first_response_at),
      resolved_at: asIsoOrNull(row.resolved_at),
      closed_at: asIsoOrNull(row.closed_at),
      resolution: row.resolution,
      reopen_count: row.reopen_count,
      escalated: Boolean(row.escalated),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadHelpdeskComments(client: PoolClient): Promise<HelpdeskTicketComment[]> {
    const { rows } = await client.query("SELECT * FROM helpdesk.ticket_comments ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      author_user_id: row.author_user_id,
      author_name: row.author_name,
      author_role: row.author_role,
      body: row.body,
      internal: Boolean(row.internal),
      document_ids: Array.isArray(row.document_ids) ? row.document_ids : [],
      created_at: asIso(row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadHelpdeskAttachments(client: PoolClient): Promise<HelpdeskTicketAttachment[]> {
    const { rows } = await client.query("SELECT * FROM helpdesk.ticket_attachments ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      document_id: row.document_id,
      attachment_type: row.attachment_type,
      file_name: row.file_name,
      size_text: row.size_text,
      uploaded_by_user_id: row.uploaded_by_user_id,
      uploaded_by_name: row.uploaded_by_name,
      created_at: asIso(row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadHelpdeskEvents(client: PoolClient): Promise<HelpdeskTicketEvent[]> {
    const { rows } = await client.query("SELECT * FROM helpdesk.ticket_events ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      actor_user_id: row.actor_user_id,
      actor_name: row.actor_name,
      action: row.action,
      detail: row.detail,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadAttendancePunches(client: PoolClient): Promise<AttendancePunch[]> {
    const { rows } = await client.query("SELECT * FROM attendance.punch_events ORDER BY occurred_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      event_type: row.event_type,
      occurred_at: asIso(row.occurred_at),
      work_mode: row.work_mode,
      source: row.source,
      metadata: json(row.metadata),
      created_at: asIso(row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAttendanceDayRecords(client: PoolClient): Promise<AttendanceDayRecord[]> {
    const { rows } = await client.query("SELECT * FROM attendance.daily_records ORDER BY work_date, employee_user_id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      work_date: asDate(row.work_date),
      status: row.status,
      first_check_in: asIsoOrNull(row.first_check_in),
      last_check_out: asIsoOrNull(row.last_check_out),
      work_minutes: row.work_minutes,
      break_minutes: row.break_minutes,
      late_minutes: row.late_minutes,
      early_out_minutes: row.early_out_minutes,
      work_mode: row.work_mode,
      note: row.note,
      exception_type: row.exception_type,
      regularization_status: row.regularization_status,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAttendanceRegularizations(client: PoolClient): Promise<AttendanceRegularizationRequest[]> {
    const { rows } = await client.query("SELECT * FROM attendance.regularization_requests ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      work_date: asDate(row.work_date),
      reason: row.reason,
      requested_punches: Array.isArray(row.requested_punches) ? row.requested_punches : [],
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadLeaveRequests(client: PoolClient): Promise<LeaveRequest[]> {
    const { rows } = await client.query("SELECT * FROM leave_wfh.leave_requests ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      employee_user_id: row.employee_user_id,
      leave_type: row.leave_type,
      date_from: asDate(row.date_from),
      date_to: asDate(row.date_to),
      half_day: Boolean(row.half_day),
      duration: Number(row.duration),
      reason: row.reason,
      document_ids: Array.isArray(row.document_ids) ? row.document_ids : [],
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      cancelled_at: asIsoOrNull(row.cancelled_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadWfhRequests(client: PoolClient): Promise<WfhRequest[]> {
    const { rows } = await client.query("SELECT * FROM leave_wfh.wfh_requests ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      employee_user_id: row.employee_user_id,
      date_from: asDate(row.date_from),
      date_to: asDate(row.date_to),
      half_day: Boolean(row.half_day),
      duration: Number(row.duration),
      reason: row.reason,
      project_ref: row.project_ref,
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      cancelled_at: asIsoOrNull(row.cancelled_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadHolidays(client: PoolClient): Promise<Holiday[]> {
    const { rows } = await client.query("SELECT * FROM leave_wfh.holidays ORDER BY holiday_date, name");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      holiday_date: asDate(row.holiday_date),
      region: row.region,
      optional: Boolean(row.optional),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadEmsEmployeeProfiles(client: PoolClient): Promise<EmsEmployeeProfile[]> {
    const { rows } = await client.query("SELECT * FROM ems.employee_profiles ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      personal_email: row.personal_email,
      phone: row.phone,
      alternate_phone: row.alternate_phone,
      current_address: row.current_address,
      permanent_address: row.permanent_address,
      city: row.city,
      country: row.country,
      emergency_contact: json(row.emergency_contact),
      personal_details: json(row.personal_details),
      work_preferences: json(row.work_preferences),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadEmsProfileChangeRequests(client: PoolClient): Promise<EmsProfileChangeRequest[]> {
    const { rows } = await client.query("SELECT * FROM ems.profile_change_requests ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      employee_user_id: row.employee_user_id,
      field_key: row.field_key,
      field_label: row.field_label,
      old_value: row.old_value,
      new_value: row.new_value,
      reason: row.reason,
      supporting_document_ids: Array.isArray(row.supporting_document_ids) ? row.supporting_document_ids : [],
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadEmsServiceRequests(client: PoolClient): Promise<EmsServiceRequest[]> {
    const { rows } = await client.query("SELECT * FROM ems.service_requests ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      requester_user_id: row.requester_user_id,
      request_type: row.request_type,
      subject: row.subject,
      description: row.description,
      document_ids: Array.isArray(row.document_ids) ? row.document_ids : [],
      status: row.status,
      assignee_user_id: row.assignee_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadEmsLetters(client: PoolClient): Promise<EmsLetter[]> {
    const { rows } = await client.query("SELECT * FROM ems.letters ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      letter_type: row.letter_type,
      title: row.title,
      description: row.description,
      status: row.status,
      document_id: row.document_id,
      issued_on: asDateOrNull(row.issued_on),
      acknowledged_at: asIsoOrNull(row.acknowledged_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadEmsPolicies(client: PoolClient): Promise<EmsPolicy[]> {
    const { rows } = await client.query("SELECT * FROM ems.policies ORDER BY effective_from DESC, title");
    return rows.map((row) => ({
      id: row.id,
      policy_code: row.policy_code,
      title: row.title,
      category: row.category,
      version_label: row.version_label,
      effective_from: asDate(row.effective_from),
      document_id: row.document_id,
      status: row.status,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadEmsPolicyAcknowledgements(client: PoolClient): Promise<EmsPolicyAcknowledgement[]> {
    const { rows } = await client.query("SELECT * FROM ems.policy_acknowledgements ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      policy_id: row.policy_id,
      employee_user_id: row.employee_user_id,
      status: row.status,
      acknowledged_at: asIsoOrNull(row.acknowledged_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadEmsAdminChecklists(client: PoolClient): Promise<EmsAdminChecklist[]> {
    const { rows } = await client.query("SELECT * FROM ems.admin_checklists ORDER BY updated_at DESC, id");
    return rows.map((row) => ({
      id: row.id,
      checklist_type: row.checklist_type,
      employee_user_id: row.employee_user_id,
      status: row.status,
      due_date: asDateOrNull(row.due_date),
      checklist: booleanRecord(row.checklist),
      remarks: row.remarks,
      completed_at: asIsoOrNull(row.completed_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadEmsProbationReviews(client: PoolClient): Promise<EmsProbationReview[]> {
    const { rows } = await client.query("SELECT * FROM ems.probation_reviews ORDER BY due_on, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      joining_on: asDate(row.joining_on),
      due_on: asDate(row.due_on),
      status: row.status,
      extended_until: asDateOrNull(row.extended_until),
      remarks: row.remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async flushCore(client: PoolClient): Promise<void> {
    await this.flushCoreMasterData(client);
    for (const role of this.store.rbacRoles) {
      await client.query(
        `INSERT INTO core.roles (id, role_key, name, description, status, builtin, deleted_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (role_key) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status,
             builtin = EXCLUDED.builtin, deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version,
             updated_at = now()`,
        [role.id, role.role_key, role.name, role.description, role.status, role.builtin, role.deleted_at, role.version]
      );
    }
    for (const permission of this.store.rbacRolePermissions) {
      await client.query(
        `INSERT INTO core.role_permissions (id, role_key, permission_id, status, deleted_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (role_key, permission_id) DO UPDATE
         SET status = EXCLUDED.status, deleted_at = EXCLUDED.deleted_at, updated_at = now()`,
        [permission.id, permission.role_key, permission.permission_id, permission.status, permission.deleted_at]
      );
    }
    await this.flushCoreUsersAndCredentials(client);
  }

  private async flushCoreMasterData(client: PoolClient): Promise<void> {
    for (const designation of this.store.designations) {
      await client.query(
        `INSERT INTO core.designations (id, company_id, designation_code, title, level, status, deleted_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             designation_code = EXCLUDED.designation_code, title = EXCLUDED.title, level = EXCLUDED.level,
             status = EXCLUDED.status, deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version,
             updated_at = now()`,
        [designation.id, designation.company_id, designation.designation_code, designation.title, designation.level, designation.status, designation.deleted_at, designation.version]
      );
    }
    for (const department of this.store.departments) {
      await client.query(
        `INSERT INTO core.departments (id, company_id, department_code, name, cost_center, parent_department_id, director_user_id, status, deleted_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             department_code = EXCLUDED.department_code, name = EXCLUDED.name,
             cost_center = EXCLUDED.cost_center,
             parent_department_id = EXCLUDED.parent_department_id,
             director_user_id = EXCLUDED.director_user_id, status = EXCLUDED.status,
             deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version,
             updated_at = now()`,
        [
          department.id,
          department.company_id,
          department.department_code,
          department.name,
          department.cost_center,
          department.parent_department_id,
          department.director_user_id,
          department.status,
          department.deleted_at,
          department.version
        ]
      );
    }
  }

  private async flushAuthCore(client: PoolClient, options: AuthPersistenceFlushOptions): Promise<void> {
    await this.flushCoreUsersAndCredentials(client, optionalSet(options.userIds));
  }

  private async flushCoreUsersAndCredentials(client: PoolClient, userIds?: ReadonlySet<string>): Promise<void> {
    for (const user of this.store.users) {
      if (userIds && !userIds.has(user.id)) continue;
      await client.query(
        `INSERT INTO core.users (
          id, employee_code, email, full_name, department_id, designation_id, manager_user_id,
          hierarchy_path, employment_status, email_verified_at, email_verification_status,
          profile_photo_document_id, profile_photo_url, timezone, joined_on, terminated_on, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ltree, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE
        SET employee_code = EXCLUDED.employee_code, email = EXCLUDED.email, full_name = EXCLUDED.full_name,
            department_id = EXCLUDED.department_id, designation_id = EXCLUDED.designation_id,
            manager_user_id = EXCLUDED.manager_user_id, hierarchy_path = EXCLUDED.hierarchy_path,
            employment_status = EXCLUDED.employment_status,
            email_verified_at = EXCLUDED.email_verified_at,
            email_verification_status = EXCLUDED.email_verification_status,
            profile_photo_document_id = EXCLUDED.profile_photo_document_id,
            profile_photo_url = EXCLUDED.profile_photo_url,
            timezone = EXCLUDED.timezone,
            joined_on = EXCLUDED.joined_on, terminated_on = EXCLUDED.terminated_on,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version, updated_at = now()`,
        [
          user.id,
          user.employee_code,
          user.email,
          user.full_name,
          user.department_id,
          user.designation_id,
          user.manager_user_id,
          user.hierarchy_path,
          user.employment_status,
          user.email_verified_at,
          user.email_verification_status ?? "unverified",
          user.profile_photo_document_id ?? null,
          user.profile_photo_url ?? null,
          user.timezone,
          user.joined_on,
          user.terminated_on,
          user.deleted_at,
          user.version
        ]
      );
      await client.query("DELETE FROM core.user_roles WHERE user_id = $1", [user.id]);
      for (const role of user.roles) {
        await client.query(
          `INSERT INTO core.user_roles (user_id, role_key, status, effective_from)
           VALUES ($1, $2, 'active', '2026-01-01')`,
          [user.id, role]
        );
      }
    }
    for (const credential of this.store.userCredentials) {
      if (userIds && !userIds.has(credential.user_id)) continue;
      await client.query(
        `INSERT INTO platform.user_credentials (
          id, user_id, password_hash, status, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          credential.id,
          credential.user_id,
          credential.password_hash,
          credential.status,
          credential.created_at,
          credential.updated_at,
          credential.deleted_at
        ]
      );
    }
  }

  private async flushPlatform(client: PoolClient): Promise<void> {
    for (const company of this.store.companyProfiles) {
      await client.query(
        `INSERT INTO platform.company_profiles (
          id, company_name, company_slug, website, industry, address, timezone, locale, currency,
          fiscal_year_start_month, working_week, work_hours_per_day, logo_label,
          logo_document_id, logo_url, logo_file_name, logo_mime_type, logo_size_bytes,
          status, bootstrap_completed_at, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (id) DO UPDATE
        SET company_name = EXCLUDED.company_name, website = EXCLUDED.website,
            industry = EXCLUDED.industry, address = EXCLUDED.address, timezone = EXCLUDED.timezone,
            locale = EXCLUDED.locale, currency = EXCLUDED.currency,
            fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
            working_week = EXCLUDED.working_week, work_hours_per_day = EXCLUDED.work_hours_per_day,
            logo_label = EXCLUDED.logo_label,
            logo_document_id = EXCLUDED.logo_document_id,
            logo_url = EXCLUDED.logo_url,
            logo_file_name = EXCLUDED.logo_file_name,
            logo_mime_type = EXCLUDED.logo_mime_type,
            logo_size_bytes = EXCLUDED.logo_size_bytes,
            status = EXCLUDED.status, bootstrap_completed_at = EXCLUDED.bootstrap_completed_at,
            updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          company.id,
          company.company_name,
          company.company_slug,
          company.website,
          company.industry,
          company.address,
          company.timezone,
          company.locale,
          company.currency,
          company.fiscal_year_start_month,
          company.working_week,
          company.work_hours_per_day,
          company.logo_label,
          company.logo_document_id,
          company.logo_url,
          company.logo_file_name,
          company.logo_mime_type,
          company.logo_size_bytes,
          company.status,
          company.bootstrap_completed_at,
          company.created_at,
          company.updated_at,
          company.version
        ]
      );
    }
    for (const workflow of this.store.adminWorkflows) {
      await client.query(
        `INSERT INTO platform.admin_workflows (
          id, workflow_key, module, label, status, stages, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
        ON CONFLICT (workflow_key) DO UPDATE
        SET module = EXCLUDED.module, label = EXCLUDED.label, status = EXCLUDED.status,
            stages = EXCLUDED.stages, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          workflow.id,
          workflow.workflow_key,
          workflow.module,
          workflow.label,
          workflow.status,
          JSON.stringify(workflow.stages),
          workflow.created_at,
          workflow.updated_at,
          workflow.deleted_at,
          workflow.version
        ]
      );
    }
    for (const policy of this.store.adminPolicies) {
      await client.query(
        `INSERT INTO platform.admin_policies (
          id, company_id, policy_key, module, label, status, config, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET company_id = EXCLUDED.company_id,
            policy_key = EXCLUDED.policy_key,
            module = EXCLUDED.module, label = EXCLUDED.label, status = EXCLUDED.status,
            config = EXCLUDED.config, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          policy.id,
          policy.company_id,
          policy.policy_key,
          policy.module,
          policy.label,
          policy.status,
          JSON.stringify(policy.config),
          policy.created_at,
          policy.updated_at,
          policy.deleted_at,
          policy.version
        ]
      );
    }
    for (const template of this.store.adminEmailTemplates) {
      await client.query(
        `INSERT INTO platform.admin_email_templates (
          id, template_key, module, name, subject, body, locale, status, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (template_key) DO UPDATE
        SET module = EXCLUDED.module, name = EXCLUDED.name, subject = EXCLUDED.subject,
            body = EXCLUDED.body, locale = EXCLUDED.locale, status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          template.id,
          template.template_key,
          template.module,
          template.name,
          template.subject,
          template.body,
          template.locale,
          template.status,
          template.created_at,
          template.updated_at,
          template.deleted_at,
          template.version
        ]
      );
    }
    for (const channel of this.store.adminNotificationChannels) {
      await client.query(
        `INSERT INTO platform.admin_notification_channels (
          id, event_key, module, label, in_app_enabled, email_enabled, push_enabled, status, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (event_key) DO UPDATE
        SET module = EXCLUDED.module, label = EXCLUDED.label,
            in_app_enabled = EXCLUDED.in_app_enabled, email_enabled = EXCLUDED.email_enabled,
            push_enabled = EXCLUDED.push_enabled, status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          channel.id,
          channel.event_key,
          channel.module,
          channel.label,
          channel.in_app_enabled,
          channel.email_enabled,
          channel.push_enabled,
          channel.status,
          channel.created_at,
          channel.updated_at,
          channel.deleted_at,
          channel.version
        ]
      );
    }
    for (const item of this.store.adminMasterDataItems) {
      await client.query(
        `INSERT INTO platform.admin_master_data_items (
          id, master_key, code, name, description, status, sort_order, metadata, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET master_key = EXCLUDED.master_key,
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            sort_order = EXCLUDED.sort_order,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          item.id,
          item.master_key,
          item.code,
          item.name,
          item.description,
          item.status,
          item.sort_order,
          JSON.stringify(item.metadata),
          item.created_at,
          item.updated_at,
          item.deleted_at,
          item.version
        ]
      );
    }
    const security = this.store.adminSecuritySettings;
    await client.query(
      `INSERT INTO platform.admin_security_settings (
        id, settings_key, password_min_length, password_require_special, password_require_number,
        password_expiry_days, session_timeout_minutes, login_attempt_limit, mfa_enabled,
        audit_role_changes, ip_device_audit_enabled, created_at, updated_at, deleted_at, version
      )
      VALUES ($1, 'default', $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (settings_key) DO UPDATE
      SET password_min_length = EXCLUDED.password_min_length,
          password_require_special = EXCLUDED.password_require_special,
          password_require_number = EXCLUDED.password_require_number,
          password_expiry_days = EXCLUDED.password_expiry_days,
          session_timeout_minutes = EXCLUDED.session_timeout_minutes,
          login_attempt_limit = EXCLUDED.login_attempt_limit,
          mfa_enabled = false,
          audit_role_changes = EXCLUDED.audit_role_changes,
          ip_device_audit_enabled = EXCLUDED.ip_device_audit_enabled,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          version = EXCLUDED.version`,
      [
        security.id,
        security.password_min_length,
        security.password_require_special,
        security.password_require_number,
        security.password_expiry_days,
        security.session_timeout_minutes,
        security.login_attempt_limit,
        security.audit_role_changes,
        security.ip_device_audit_enabled,
        security.created_at,
        security.updated_at,
        security.deleted_at,
        security.version
      ]
    );
    for (const preference of this.store.userSessionPreferences) {
      await client.query(
        `INSERT INTO platform.user_session_preferences (
          id, user_id, active_role, company_id, landing_page, locale, timezone, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO UPDATE
        SET active_role = EXCLUDED.active_role, company_id = EXCLUDED.company_id,
            landing_page = EXCLUDED.landing_page, locale = EXCLUDED.locale,
            timezone = EXCLUDED.timezone, updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          preference.id,
          preference.user_id,
          preference.active_role,
          preference.company_id,
          preference.landing_page,
          preference.locale,
          preference.timezone,
          preference.created_at,
          preference.updated_at,
          preference.version
        ]
      );
    }
    for (const token of this.store.authTokens) {
      await client.query(
        `INSERT INTO platform.auth_tokens (
          id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at,
          revoked_at, created_ip_hash, user_agent_hash, last_sent_at, send_count, created_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            used_at = EXCLUDED.used_at,
            revoked_at = EXCLUDED.revoked_at,
            last_sent_at = EXCLUDED.last_sent_at,
            send_count = EXCLUDED.send_count,
            metadata = EXCLUDED.metadata`,
        [
          token.id,
          token.token_hash,
          token.token_type,
          token.user_id,
          token.email,
          token.company_id,
          token.status,
          token.expires_at,
          token.used_at,
          token.revoked_at,
          token.created_ip_hash,
          token.user_agent_hash,
          token.last_sent_at,
          token.send_count,
          token.created_at,
          JSON.stringify(token.metadata)
        ]
      );
    }
    if (this.store.financeGovernanceConfig) {
      const config = this.store.financeGovernanceConfig;
      await client.query(
        `INSERT INTO platform.finance_governance_config (
          id,
          scope_key,
          primary_finance_manager_user_id,
          finance_self_request_fallback_user_id,
          manager_backup_user_id,
          finance_approval_backup_user_id,
          status,
          effective_from,
          effective_to,
          updated_by_user_id,
          created_at,
          updated_at,
          deleted_at,
          version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET primary_finance_manager_user_id = EXCLUDED.primary_finance_manager_user_id,
            finance_self_request_fallback_user_id = EXCLUDED.finance_self_request_fallback_user_id,
            manager_backup_user_id = EXCLUDED.manager_backup_user_id,
            finance_approval_backup_user_id = EXCLUDED.finance_approval_backup_user_id,
            status = EXCLUDED.status,
            effective_from = EXCLUDED.effective_from,
            effective_to = EXCLUDED.effective_to,
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          config.id,
          config.scope_key,
          config.primary_finance_manager_user_id,
          config.finance_approval_backup_user_id,
          config.manager_backup_user_id,
          config.finance_approval_backup_user_id,
          config.status,
          config.effective_from,
          config.effective_to,
          config.updated_by_user_id,
          config.created_at,
          config.updated_at,
          config.deleted_at,
          config.version
        ]
      );
    }
    for (const notification of this.store.notifications) {
      await client.query(
        `INSERT INTO platform.notifications (
          id, actor_user_id, target_user_id, event_type, payload, status, read_at, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET actor_user_id = EXCLUDED.actor_user_id,
            target_user_id = EXCLUDED.target_user_id,
            event_type = EXCLUDED.event_type,
            payload = EXCLUDED.payload,
            status = EXCLUDED.status,
            read_at = EXCLUDED.read_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at`,
        [
          notification.id,
          notification.actor_user_id,
          notification.target_user_id,
          notification.event_type,
          JSON.stringify(notification.payload),
          notification.status,
          notification.read_at,
          notification.version,
          notification.created_at,
          notification.updated_at
        ]
      );
    }
    for (const delivery of this.store.emailDeliveries) {
      await client.query(
        `INSERT INTO platform.email_deliveries (
          id, provider, template_key, purpose, user_id, email, subject, status, provider_email_id,
          idempotency_key, error_code, error_message, queued_at, sent_at, delivered_at, failed_at,
          bounced_at, complained_at, metadata, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            provider_email_id = EXCLUDED.provider_email_id,
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message,
            sent_at = EXCLUDED.sent_at,
            delivered_at = EXCLUDED.delivered_at,
            failed_at = EXCLUDED.failed_at,
            bounced_at = EXCLUDED.bounced_at,
            complained_at = EXCLUDED.complained_at,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            version = EXCLUDED.version`,
        [
          delivery.id,
          delivery.provider,
          delivery.template_key,
          delivery.purpose,
          delivery.user_id,
          delivery.email,
          delivery.subject,
          delivery.status,
          delivery.provider_email_id,
          delivery.idempotency_key,
          delivery.error_code,
          delivery.error_message,
          delivery.queued_at,
          delivery.sent_at,
          delivery.delivered_at,
          delivery.failed_at,
          delivery.bounced_at,
          delivery.complained_at,
          JSON.stringify(delivery.metadata),
          delivery.created_at,
          delivery.updated_at,
          delivery.version
        ]
      );
    }
    for (const event of this.store.emailEvents) {
      await client.query(
        `INSERT INTO platform.email_events (
          id, provider, provider_event_id, provider_email_id, event_type, email, delivery_id, payload, received_at, processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        ON CONFLICT (provider, provider_event_id) DO UPDATE
        SET provider_email_id = EXCLUDED.provider_email_id,
            email = EXCLUDED.email,
            delivery_id = EXCLUDED.delivery_id,
            payload = EXCLUDED.payload,
            processed_at = EXCLUDED.processed_at`,
        [
          event.id,
          event.provider,
          event.provider_event_id,
          event.provider_email_id,
          event.event_type,
          event.email,
          event.delivery_id,
          JSON.stringify(event.payload),
          event.received_at,
          event.processed_at
        ]
      );
    }
    await this.flushOutbox(client);
  }

  private async flushOutbox(client: PoolClient, aggregateIds?: ReadonlySet<string>): Promise<void> {
    for (const event of this.store.outbox) {
      if (aggregateIds && !aggregateIds.has(event.aggregate_id)) continue;
      await client.query(
        `INSERT INTO platform.outbox_events (
          id, event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key,
          status, retry_count, available_at, created_at, published_at, failed_at, last_error
        )
        OVERRIDING SYSTEM VALUE
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, retry_count = EXCLUDED.retry_count,
            available_at = EXCLUDED.available_at, published_at = EXCLUDED.published_at,
            failed_at = EXCLUDED.failed_at, last_error = EXCLUDED.last_error`,
        [
          event.id,
          event.event_id,
          event.aggregate_type,
          event.aggregate_id,
          event.event_type,
          JSON.stringify(event.payload),
          event.idempotency_key,
          event.status,
          event.retry_count,
          event.available_at,
          event.created_at,
          event.published_at,
          event.failed_at,
          event.last_error
        ]
      );
    }
  }

  private async flushExpenses(client: PoolClient): Promise<void> {
    for (const mapping of this.store.managerBackupAssignments) {
      await client.query(
        `INSERT INTO expenses.employee_reviewer_mappings (
          id, employee_user_id, reviewer_user_id, assigned_by_user_id, effective_from,
          effective_to, status, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET reviewer_user_id = EXCLUDED.reviewer_user_id, effective_to = EXCLUDED.effective_to,
            status = EXCLUDED.status, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          mapping.id,
          mapping.employee_user_id,
          mapping.backup_manager_user_id,
          mapping.assigned_by_user_id,
          mapping.effective_from,
          mapping.effective_to,
          mapping.status,
          mapping.created_at,
          mapping.updated_at,
          mapping.deleted_at,
          mapping.version
        ]
      );
    }
    for (const ticket of this.store.tickets) {
      await client.query(
        `INSERT INTO expenses.expense_tickets (
          id, ticket_no, requester_user_id, requester_role_snapshot, department_id, expense_type,
          expense_sub_type, project_code, client_name, task_title, task_description, location,
          start_date, end_date, estimated_amount, payment_type, advance_amount, advance_justification,
          assigned_reviewer_id, director_approver_id, finance_manager_id,
          manager_verifier_id, manager_backup_user_id, finance_approver_id,
          status, actual_amount, variance_amount, payment_reference_no, closure_remarks, context_payload, route_snapshot,
          policy_snapshot, version, created_at, updated_at, submitted_at, closed_at, deleted_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
          $30::jsonb, $31::jsonb, $32::jsonb, $33, $34, $35, $36, $37, $38
        )
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, assigned_reviewer_id = EXCLUDED.assigned_reviewer_id,
            director_approver_id = EXCLUDED.director_approver_id, finance_manager_id = EXCLUDED.finance_manager_id,
            manager_verifier_id = EXCLUDED.manager_verifier_id,
            manager_backup_user_id = EXCLUDED.manager_backup_user_id,
            finance_approver_id = EXCLUDED.finance_approver_id,
            actual_amount = EXCLUDED.actual_amount, variance_amount = EXCLUDED.variance_amount,
            payment_reference_no = EXCLUDED.payment_reference_no, closure_remarks = EXCLUDED.closure_remarks,
            context_payload = EXCLUDED.context_payload, route_snapshot = EXCLUDED.route_snapshot,
            policy_snapshot = EXCLUDED.policy_snapshot, version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at, submitted_at = EXCLUDED.submitted_at,
            closed_at = EXCLUDED.closed_at, deleted_at = EXCLUDED.deleted_at`,
        [
          ticket.id,
          ticket.ticket_no,
          ticket.requester_user_id,
          ticket.requester_role_snapshot,
          ticket.department_id,
          ticket.expense_type,
          ticket.expense_sub_type,
          ticket.project_code,
          ticket.client_name,
          ticket.task_title,
          ticket.task_description,
          ticket.location,
          ticket.start_date,
          ticket.end_date,
          ticket.estimated_amount,
          ticket.payment_type,
          ticket.advance_amount,
          ticket.advance_justification,
          ticket.manager_verifier_id,
          null,
          ticket.finance_approver_id,
          ticket.manager_verifier_id,
          ticket.manager_backup_user_id,
          ticket.finance_approver_id,
          ticket.status,
          ticket.actual_amount,
          ticket.variance_amount,
          ticket.payment_reference_no,
          ticket.closure_remarks,
          JSON.stringify(ticket.context_payload),
          JSON.stringify(ticket.route_snapshot),
          JSON.stringify(ticket.policy_snapshot),
          ticket.version,
          ticket.created_at,
          ticket.updated_at,
          ticket.submitted_at,
          ticket.closed_at,
          ticket.deleted_at
        ]
      );
    }
    for (const item of this.store.lineItems) {
      await client.query(
        `INSERT INTO expenses.expense_line_items (
          id, ticket_id, line_category, description, quantity, unit_cost, line_total,
          tax_amount, vendor_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET line_category = EXCLUDED.line_category, description = EXCLUDED.description,
            quantity = EXCLUDED.quantity, unit_cost = EXCLUDED.unit_cost,
            line_total = EXCLUDED.line_total, tax_amount = EXCLUDED.tax_amount,
            vendor_name = EXCLUDED.vendor_name, updated_at = now()`,
        [
          item.id,
          item.ticket_id,
          item.line_category,
          item.description,
          item.quantity,
          item.unit_cost,
          item.line_total,
          item.tax_amount,
          item.vendor_name
        ]
      );
    }
    for (const approval of this.store.expenseApprovals) {
      await client.query(
        `INSERT INTO expenses.expense_approvals (
          id, ticket_id, approval_stage, approver_user_id, decision, remarks,
          role_snapshot, designation_snapshot, route_snapshot, action_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        ON CONFLICT (id) DO NOTHING`,
        [
          approval.id,
          approval.ticket_id,
          approval.approval_stage,
          approval.approver_user_id,
          approval.decision,
          approval.remarks,
          approval.role_snapshot,
          approval.designation_snapshot,
          JSON.stringify(approval.route_snapshot),
          approval.action_at,
          approval.created_at
        ]
      );
    }
    for (const audit of this.store.auditLogs) {
      await client.query(
        `INSERT INTO expenses.expense_audit_logs (
          id, ticket_id, actor_user_id, event_type, old_value, new_value, remarks, payload_hash, created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING`,
        [
          audit.id,
          audit.ticket_id,
          audit.actor_user_id,
          audit.event_type,
          audit.old_value ? JSON.stringify(audit.old_value) : null,
          audit.new_value ? JSON.stringify(audit.new_value) : null,
          audit.remarks,
          audit.payload_hash,
          audit.created_at
        ]
      );
    }
    for (const document of this.store.expenseDocuments) {
      await client.query(
        `INSERT INTO expenses.expense_documents (
          id, ticket_id, document_id, document_type, verification_status, uploaded_by, uploaded_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET verification_status = EXCLUDED.verification_status`,
        [
          document.id,
          document.ticket_id,
          document.document_id,
          document.document_type,
          document.verification_status,
          document.uploaded_by,
          document.uploaded_at
        ]
      );
    }
    for (const payment of this.store.payments) {
      await client.query(
        `INSERT INTO expenses.expense_payments (
          id, ticket_id, payment_type, approved_amount, paid_amount, payment_date,
          payment_mode, reference_no, settlement_status, settlement_amount, processed_by_user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET paid_amount = EXCLUDED.paid_amount, settlement_status = EXCLUDED.settlement_status,
            settlement_amount = EXCLUDED.settlement_amount`,
        [
          payment.id,
          payment.ticket_id,
          payment.payment_type,
          payment.approved_amount,
          payment.paid_amount,
          payment.payment_date,
          payment.payment_mode,
          payment.reference_no,
          payment.settlement_status,
          payment.settlement_amount,
          payment.processed_by_user_id,
          payment.created_at
        ]
      );
    }
  }

  private async flushDocuments(client: PoolClient, documentIds?: ReadonlySet<string>): Promise<void> {
    for (const document of this.store.documents) {
      if (documentIds && !documentIds.has(document.id)) continue;
      await client.query(
        `INSERT INTO documents.doc_metadata (
          id, business_object_type, business_object_id, owner_user_id, classification, document_type,
          current_version, file_name, storage_key, mime_type, size_bytes, checksum_sha256,
          metadata, created_by_user_id, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE
        SET current_version = EXCLUDED.current_version, file_name = EXCLUDED.file_name,
            storage_key = EXCLUDED.storage_key, mime_type = EXCLUDED.mime_type,
            size_bytes = EXCLUDED.size_bytes, checksum_sha256 = EXCLUDED.checksum_sha256,
            metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          document.id,
          document.business_object_type,
          document.business_object_id,
          document.owner_user_id,
          document.classification,
          document.document_type,
          document.current_version,
          document.file_name,
          document.storage_key,
          document.mime_type,
          document.size_bytes,
          document.checksum_sha256,
          JSON.stringify(document.metadata),
          document.created_by_user_id,
          document.created_at,
          document.updated_at,
          document.deleted_at
        ]
      );
    }
    for (const version of this.store.documentVersions) {
      if (documentIds && !documentIds.has(version.document_id)) continue;
      await client.query(
        `INSERT INTO documents.doc_versions (
          id, document_id, version, storage_key, file_name, size_bytes, checksum_sha256,
          created_by_user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING`,
        [
          version.id,
          version.document_id,
          version.version,
          version.storage_key,
          version.file_name,
          version.size_bytes,
          version.checksum_sha256,
          version.created_by_user_id,
          version.created_at
        ]
      );
    }
    for (const log of this.store.documentAccessLogs) {
      if (documentIds && !documentIds.has(log.document_id)) continue;
      await client.query(
        `INSERT INTO documents.doc_access_logs (id, document_id, actor_user_id, action, decision, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [log.id, log.document_id, log.actor_user_id, log.action, log.decision, log.reason, log.created_at]
      );
    }
  }

  private async flushAssets(client: PoolClient): Promise<void> {
    for (const asset of this.store.assets) {
      await client.query(
        `INSERT INTO assets.assets (
          id, asset_code, qr_hash, asset_type, name, serial_no, status,
          current_assigned_user_id, metadata, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET asset_code = EXCLUDED.asset_code, qr_hash = EXCLUDED.qr_hash,
            asset_type = EXCLUDED.asset_type, name = EXCLUDED.name, serial_no = EXCLUDED.serial_no,
            status = EXCLUDED.status, current_assigned_user_id = EXCLUDED.current_assigned_user_id,
            metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          asset.id,
          asset.asset_code,
          asset.qr_hash,
          asset.asset_type,
          asset.name,
          asset.serial_no,
          asset.status,
          asset.current_assigned_user_id,
          JSON.stringify(asset.metadata),
          asset.created_at,
          asset.updated_at,
          asset.deleted_at,
          asset.version
        ]
      );
    }
    for (const assignment of this.store.assetAssignments) {
      await client.query(
        `INSERT INTO assets.asset_assignments (
          id, asset_id, assigned_to_user_id, assigned_by_user_id, assigned_at, returned_at,
          status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET returned_at = EXCLUDED.returned_at, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          assignment.id,
          assignment.asset_id,
          assignment.assigned_to_user_id,
          assignment.assigned_by_user_id,
          assignment.assigned_at,
          assignment.returned_at,
          assignment.status,
          assignment.created_at,
          assignment.updated_at
        ]
      );
    }
    for (const event of this.store.assetStateEvents) {
      await client.query(
        `INSERT INTO assets.asset_state_events (id, asset_id, actor_user_id, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (id) DO NOTHING`,
        [event.id, event.asset_id, event.actor_user_id, event.event_type, JSON.stringify(event.payload), event.created_at]
      );
    }
    for (const request of this.store.assetRequests) {
      await client.query(
        `INSERT INTO assets.asset_requests (
          id, request_code, requester_user_id, request_type, asset_type, asset_id, reason, priority,
          needed_by, preferred_specs, status, decision_by_user_id, decision_at, decision_remarks,
          assigned_asset_id, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, decision_by_user_id = EXCLUDED.decision_by_user_id,
            decision_at = EXCLUDED.decision_at, decision_remarks = EXCLUDED.decision_remarks,
            assigned_asset_id = EXCLUDED.assigned_asset_id, version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.requester_user_id,
          request.request_type,
          request.asset_type,
          request.asset_id,
          request.reason,
          request.priority,
          request.needed_by,
          JSON.stringify(request.preferred_specs),
          request.status,
          request.decision_by_user_id,
          request.decision_at,
          request.decision_remarks,
          request.assigned_asset_id,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at
        ]
      );
    }
    for (const acknowledgement of this.store.assetAcknowledgements) {
      await client.query(
        `INSERT INTO assets.asset_acknowledgements (
          id, asset_id, employee_user_id, assignment_id, acknowledgement_type, status,
          acknowledged_at, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, acknowledged_at = EXCLUDED.acknowledged_at,
            version = EXCLUDED.version, updated_at = EXCLUDED.updated_at`,
        [
          acknowledgement.id,
          acknowledgement.asset_id,
          acknowledgement.employee_user_id,
          acknowledgement.assignment_id,
          acknowledgement.acknowledgement_type,
          acknowledgement.status,
          acknowledgement.acknowledged_at,
          acknowledgement.version,
          acknowledgement.created_at,
          acknowledgement.updated_at
        ]
      );
    }
    for (const maintenance of this.store.assetMaintenanceRecords) {
      await client.query(
        `INSERT INTO assets.asset_maintenance_records (
          id, asset_id, maintenance_type, vendor_id, cost, started_on, completed_on,
          status, notes, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, completed_on = EXCLUDED.completed_on, notes = EXCLUDED.notes,
            version = EXCLUDED.version, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          maintenance.id,
          maintenance.asset_id,
          maintenance.maintenance_type,
          maintenance.vendor_id,
          maintenance.cost,
          maintenance.started_on,
          maintenance.completed_on,
          maintenance.status,
          maintenance.notes,
          maintenance.version,
          maintenance.created_at,
          maintenance.updated_at,
          maintenance.deleted_at
        ]
      );
    }
    for (const vendor of this.store.assetVendors) {
      await client.query(
        `INSERT INTO assets.software_vendors (
          id, name, status, contact_email, phone, metadata, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, status = EXCLUDED.status, contact_email = EXCLUDED.contact_email,
            phone = EXCLUDED.phone, metadata = EXCLUDED.metadata, version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          vendor.id,
          vendor.name,
          vendor.status,
          vendor.contact_email,
          vendor.phone,
          JSON.stringify(vendor.metadata),
          vendor.version,
          vendor.created_at,
          vendor.updated_at,
          vendor.deleted_at
        ]
      );
    }
    for (const ticket of this.store.assetRecoveryTickets) {
      await client.query(
        `INSERT INTO assets.asset_recovery_tickets (
          id, employee_user_id, asset_id, status, settlement_status, settlement_amount,
          settlement_remarks, settled_by_user_id, settled_at, version, created_at, updated_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             settlement_status = EXCLUDED.settlement_status,
             settlement_amount = EXCLUDED.settlement_amount,
             settlement_remarks = EXCLUDED.settlement_remarks,
             settled_by_user_id = EXCLUDED.settled_by_user_id,
             settled_at = EXCLUDED.settled_at,
             version = EXCLUDED.version,
             updated_at = EXCLUDED.updated_at`,
        [
          ticket.id,
          ticket.employee_user_id,
          ticket.asset_id,
          ticket.status,
          ticket.settlement_status,
          ticket.settlement_amount,
          ticket.settlement_remarks,
          ticket.settled_by_user_id,
          ticket.settled_at,
          ticket.version,
          ticket.created_at,
          ticket.updated_at
        ]
      );
    }
    for (const entitlement of this.store.licenseEntitlements) {
      await client.query(
        `INSERT INTO assets.license_entitlements (id, product_id, seat_count, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET seat_count = EXCLUDED.seat_count, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          entitlement.id,
          entitlement.product_id,
          entitlement.seat_count,
          entitlement.status,
          entitlement.created_at,
          entitlement.updated_at
        ]
      );
    }
    for (const activation of this.store.licenseActivations) {
      await client.query(
        `INSERT INTO assets.license_activations (
          id, product_id, entitlement_id, hardware_fingerprint_hash, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          activation.id,
          activation.product_id,
          activation.entitlement_id,
          activation.hardware_fingerprint_hash,
          activation.status,
          activation.created_at,
          activation.updated_at
        ]
      );
    }
    for (const key of this.store.compromisedKeys) {
      await client.query(
        `INSERT INTO assets.compromised_keys (id, key_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (key_hash) DO UPDATE
         SET status = EXCLUDED.status, updated_at = now()`,
        [key.id, key.key_hash, key.status, key.created_at]
      );
    }
  }

  private async flushTimesheets(client: PoolClient): Promise<void> {
    for (const segment of this.store.workSegments) {
      await client.query(
        `INSERT INTO timesheets.work_segments (
          id, employee_user_id, work_date, project_code, task_code, hours,
          description, billable, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET hours = EXCLUDED.hours, description = EXCLUDED.description,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          segment.id,
          segment.employee_user_id,
          segment.work_date,
          segment.project_code,
          segment.task_code,
          segment.hours,
          segment.description,
          segment.billable,
          segment.created_at,
          segment.updated_at,
          segment.deleted_at
        ]
      );
    }
    for (const workflow of this.store.workflowDefinitions) {
      await client.query(
        `INSERT INTO timesheets.workflow_definitions (
          id, name, module, definition, version, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
        SET definition = EXCLUDED.definition, version = EXCLUDED.version,
            status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          workflow.id,
          workflow.name,
          workflow.module,
          JSON.stringify(workflow.definition),
          workflow.version,
          workflow.status,
          workflow.created_at,
          workflow.updated_at
        ]
      );
    }
    for (const submission of this.store.timesheetSubmissions) {
      await client.query(
        `INSERT INTO timesheets.timesheet_submissions (
          id, employee_user_id, cycle_start, cycle_end, status, total_hours,
          workflow_definition_id, workflow_snapshot, current_approver_user_id,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, total_hours = EXCLUDED.total_hours,
            workflow_snapshot = EXCLUDED.workflow_snapshot,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            version = EXCLUDED.version, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          submission.id,
          submission.employee_user_id,
          submission.cycle_start,
          submission.cycle_end,
          submission.status,
          submission.total_hours,
          submission.workflow_definition_id,
          JSON.stringify(submission.workflow_snapshot),
          submission.current_approver_user_id,
          submission.version,
          submission.created_at,
          submission.updated_at,
          submission.deleted_at
        ]
      );
    }
    for (const action of this.store.timesheetActions) {
      await client.query(
        `INSERT INTO timesheets.timesheet_approval_actions (
          id, submission_id, actor_user_id, decision, remarks, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING`,
        [
          action.id,
          action.submission_id,
          action.actor_user_id,
          action.decision,
          action.remarks,
          action.created_at
        ]
      );
    }
  }

  private async flushProjects(client: PoolClient): Promise<void> {
    for (const project of this.store.projects) {
      await client.query(
        `INSERT INTO projects.projects (
          id, project_code, name, client_name, project_type, billing_type,
          manager_user_id, department_id, start_date, end_date, status, health,
          description, estimated_hours, actual_hours, estimated_budget, actual_spend,
          tech_stack, priority, cost_center, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $22, $23, $24)
        ON CONFLICT (id) DO UPDATE
        SET project_code = EXCLUDED.project_code,
            name = EXCLUDED.name,
            client_name = EXCLUDED.client_name,
            project_type = EXCLUDED.project_type,
            billing_type = EXCLUDED.billing_type,
            manager_user_id = EXCLUDED.manager_user_id,
            department_id = EXCLUDED.department_id,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            status = EXCLUDED.status,
            health = EXCLUDED.health,
            description = EXCLUDED.description,
            estimated_hours = EXCLUDED.estimated_hours,
            actual_hours = EXCLUDED.actual_hours,
            estimated_budget = EXCLUDED.estimated_budget,
            actual_spend = EXCLUDED.actual_spend,
            tech_stack = EXCLUDED.tech_stack,
            priority = EXCLUDED.priority,
            cost_center = EXCLUDED.cost_center,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          project.id,
          project.project_code,
          project.name,
          project.client_name,
          project.project_type,
          project.billing_type,
          project.manager_user_id,
          project.department_id,
          project.start_date,
          project.end_date,
          project.status,
          project.health,
          project.description,
          project.estimated_hours,
          project.actual_hours,
          project.estimated_budget,
          project.actual_spend,
          JSON.stringify(project.tech_stack),
          project.priority,
          project.cost_center,
          project.version,
          project.created_at,
          project.updated_at,
          project.deleted_at
        ]
      );
    }
    for (const member of this.store.projectMembers) {
      await client.query(
        `INSERT INTO projects.project_members (
          id, project_id, employee_user_id, project_role, allocation_percent,
          billable, start_date, end_date, reporting_lead_user_id, status,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET project_role = EXCLUDED.project_role,
            allocation_percent = EXCLUDED.allocation_percent,
            billable = EXCLUDED.billable,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            reporting_lead_user_id = EXCLUDED.reporting_lead_user_id,
            status = EXCLUDED.status,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          member.id,
          member.project_id,
          member.employee_user_id,
          member.project_role,
          member.allocation_percent,
          member.billable,
          member.start_date,
          member.end_date,
          member.reporting_lead_user_id,
          member.status,
          member.version,
          member.created_at,
          member.updated_at,
          member.deleted_at
        ]
      );
    }
    for (const allocation of this.store.projectAllocations) {
      await client.query(
        `INSERT INTO projects.project_allocations (
          id, project_id, employee_user_id, date_from, date_to, allocation_percent,
          billable, notes, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET date_from = EXCLUDED.date_from,
            date_to = EXCLUDED.date_to,
            allocation_percent = EXCLUDED.allocation_percent,
            billable = EXCLUDED.billable,
            notes = EXCLUDED.notes,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          allocation.id,
          allocation.project_id,
          allocation.employee_user_id,
          allocation.date_from,
          allocation.date_to,
          allocation.allocation_percent,
          allocation.billable,
          allocation.notes,
          allocation.version,
          allocation.created_at,
          allocation.updated_at,
          allocation.deleted_at
        ]
      );
    }
    for (const milestone of this.store.projectMilestones) {
      await client.query(
        `INSERT INTO projects.project_milestones (
          id, project_id, name, owner_user_id, status, start_date, due_date,
          priority, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            owner_user_id = EXCLUDED.owner_user_id,
            status = EXCLUDED.status,
            start_date = EXCLUDED.start_date,
            due_date = EXCLUDED.due_date,
            priority = EXCLUDED.priority,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          milestone.id,
          milestone.project_id,
          milestone.name,
          milestone.owner_user_id,
          milestone.status,
          milestone.start_date,
          milestone.due_date,
          milestone.priority,
          milestone.version,
          milestone.created_at,
          milestone.updated_at,
          milestone.deleted_at
        ]
      );
    }
  }

  private async flushHelpdesk(client: PoolClient): Promise<void> {
    for (const category of this.store.helpdeskCategories) {
      await client.query(
        `INSERT INTO helpdesk.categories (
          id, category_key, label, default_assignee_user_id, default_assignee_name,
          default_assignee_role, team, active, sub_categories, version,
          created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET category_key = EXCLUDED.category_key,
            label = EXCLUDED.label,
            default_assignee_user_id = EXCLUDED.default_assignee_user_id,
            default_assignee_name = EXCLUDED.default_assignee_name,
            default_assignee_role = EXCLUDED.default_assignee_role,
            team = EXCLUDED.team,
            active = EXCLUDED.active,
            sub_categories = EXCLUDED.sub_categories,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          category.id,
          category.category_key,
          category.label,
          category.default_assignee_user_id,
          category.default_assignee_name,
          category.default_assignee_role,
          category.team,
          category.active,
          JSON.stringify(category.sub_categories),
          category.version,
          category.created_at,
          category.updated_at,
          category.deleted_at
        ]
      );
    }
    for (const ticket of this.store.helpdeskTickets) {
      await client.query(
        `INSERT INTO helpdesk.tickets (
          id, ticket_no, subject, description, category_id, category_key, sub_category,
          priority, status, requester_user_id, requester_name, requester_email,
          requester_department, assignee_user_id, assignee_name, assignee_role,
          related_asset_id, related_project_id, first_response_at, resolved_at, closed_at,
          resolution, reopen_count, escalated, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
        ON CONFLICT (id) DO UPDATE
        SET ticket_no = EXCLUDED.ticket_no,
            subject = EXCLUDED.subject,
            description = EXCLUDED.description,
            category_id = EXCLUDED.category_id,
            category_key = EXCLUDED.category_key,
            sub_category = EXCLUDED.sub_category,
            priority = EXCLUDED.priority,
            status = EXCLUDED.status,
            requester_user_id = EXCLUDED.requester_user_id,
            requester_name = EXCLUDED.requester_name,
            requester_email = EXCLUDED.requester_email,
            requester_department = EXCLUDED.requester_department,
            assignee_user_id = EXCLUDED.assignee_user_id,
            assignee_name = EXCLUDED.assignee_name,
            assignee_role = EXCLUDED.assignee_role,
            related_asset_id = EXCLUDED.related_asset_id,
            related_project_id = EXCLUDED.related_project_id,
            first_response_at = EXCLUDED.first_response_at,
            resolved_at = EXCLUDED.resolved_at,
            closed_at = EXCLUDED.closed_at,
            resolution = EXCLUDED.resolution,
            reopen_count = EXCLUDED.reopen_count,
            escalated = EXCLUDED.escalated,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          ticket.id,
          ticket.ticket_no,
          ticket.subject,
          ticket.description,
          ticket.category_id,
          ticket.category_key,
          ticket.sub_category,
          ticket.priority,
          ticket.status,
          ticket.requester_user_id,
          ticket.requester_name,
          ticket.requester_email,
          ticket.requester_department,
          ticket.assignee_user_id,
          ticket.assignee_name,
          ticket.assignee_role,
          ticket.related_asset_id,
          ticket.related_project_id,
          ticket.first_response_at,
          ticket.resolved_at,
          ticket.closed_at,
          ticket.resolution,
          ticket.reopen_count,
          ticket.escalated,
          ticket.version,
          ticket.created_at,
          ticket.updated_at,
          ticket.deleted_at
        ]
      );
    }
    for (const comment of this.store.helpdeskComments) {
      await client.query(
        `INSERT INTO helpdesk.ticket_comments (
          id, ticket_id, author_user_id, author_name, author_role, body,
          internal, document_ids, created_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET author_user_id = EXCLUDED.author_user_id,
            author_name = EXCLUDED.author_name,
            author_role = EXCLUDED.author_role,
            body = EXCLUDED.body,
            internal = EXCLUDED.internal,
            document_ids = EXCLUDED.document_ids,
            deleted_at = EXCLUDED.deleted_at`,
        [
          comment.id,
          comment.ticket_id,
          comment.author_user_id,
          comment.author_name,
          comment.author_role,
          comment.body,
          comment.internal,
          JSON.stringify(comment.document_ids),
          comment.created_at,
          comment.deleted_at
        ]
      );
    }
    for (const attachment of this.store.helpdeskAttachments) {
      await client.query(
        `INSERT INTO helpdesk.ticket_attachments (
          id, ticket_id, document_id, attachment_type, file_name, size_text,
          uploaded_by_user_id, uploaded_by_name, created_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET document_id = EXCLUDED.document_id,
            attachment_type = EXCLUDED.attachment_type,
            file_name = EXCLUDED.file_name,
            size_text = EXCLUDED.size_text,
            uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
            uploaded_by_name = EXCLUDED.uploaded_by_name,
            deleted_at = EXCLUDED.deleted_at`,
        [
          attachment.id,
          attachment.ticket_id,
          attachment.document_id,
          attachment.attachment_type,
          attachment.file_name,
          attachment.size_text,
          attachment.uploaded_by_user_id,
          attachment.uploaded_by_name,
          attachment.created_at,
          attachment.deleted_at
        ]
      );
    }
    for (const event of this.store.helpdeskEvents) {
      await client.query(
        `INSERT INTO helpdesk.ticket_events (
          id, ticket_id, actor_user_id, actor_name, action, detail, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET actor_user_id = EXCLUDED.actor_user_id,
            actor_name = EXCLUDED.actor_name,
            action = EXCLUDED.action,
            detail = EXCLUDED.detail`,
        [
          event.id,
          event.ticket_id,
          event.actor_user_id,
          event.actor_name,
          event.action,
          event.detail,
          event.created_at
        ]
      );
    }
  }

  private async flushAttendance(client: PoolClient): Promise<void> {
    for (const punch of this.store.attendancePunches) {
      await client.query(
        `INSERT INTO attendance.punch_events (
          id, employee_user_id, event_type, occurred_at, work_mode, source,
          metadata, created_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET event_type = EXCLUDED.event_type,
            occurred_at = EXCLUDED.occurred_at,
            work_mode = EXCLUDED.work_mode,
            source = EXCLUDED.source,
            metadata = EXCLUDED.metadata,
            deleted_at = EXCLUDED.deleted_at`,
        [
          punch.id,
          punch.employee_user_id,
          punch.event_type,
          punch.occurred_at,
          punch.work_mode,
          punch.source,
          JSON.stringify(punch.metadata),
          punch.created_at,
          punch.deleted_at
        ]
      );
    }
    for (const day of this.store.attendanceDayRecords) {
      await client.query(
        `INSERT INTO attendance.daily_records (
          id, employee_user_id, work_date, status, first_check_in, last_check_out,
          work_minutes, break_minutes, late_minutes, early_out_minutes, work_mode,
          note, exception_type, regularization_status, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE
        SET employee_user_id = EXCLUDED.employee_user_id,
            work_date = EXCLUDED.work_date,
            status = EXCLUDED.status,
            first_check_in = EXCLUDED.first_check_in,
            last_check_out = EXCLUDED.last_check_out,
            work_minutes = EXCLUDED.work_minutes,
            break_minutes = EXCLUDED.break_minutes,
            late_minutes = EXCLUDED.late_minutes,
            early_out_minutes = EXCLUDED.early_out_minutes,
            work_mode = EXCLUDED.work_mode,
            note = EXCLUDED.note,
            exception_type = EXCLUDED.exception_type,
            regularization_status = EXCLUDED.regularization_status,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          day.id,
          day.employee_user_id,
          day.work_date,
          day.status,
          day.first_check_in,
          day.last_check_out,
          day.work_minutes,
          day.break_minutes,
          day.late_minutes,
          day.early_out_minutes,
          day.work_mode,
          day.note,
          day.exception_type,
          day.regularization_status,
          day.version,
          day.created_at,
          day.updated_at,
          day.deleted_at
        ]
      );
    }
    for (const request of this.store.attendanceRegularizations) {
      await client.query(
        `INSERT INTO attendance.regularization_requests (
          id, employee_user_id, work_date, reason, requested_punches, status,
          current_approver_user_id, decision_remarks, decided_by_user_id,
          decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET reason = EXCLUDED.reason,
            requested_punches = EXCLUDED.requested_punches,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.employee_user_id,
          request.work_date,
          request.reason,
          JSON.stringify(request.requested_punches),
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at
        ]
      );
    }
  }

  private async flushLeaveWfh(client: PoolClient): Promise<void> {
    for (const request of this.store.leaveRequests) {
      await client.query(
        `INSERT INTO leave_wfh.leave_requests (
          id, request_code, employee_user_id, leave_type, date_from, date_to,
          half_day, duration, reason, document_ids, status, current_approver_user_id,
          decision_remarks, decided_by_user_id, decided_at, cancelled_at,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (id) DO UPDATE
        SET request_code = EXCLUDED.request_code,
            leave_type = EXCLUDED.leave_type,
            date_from = EXCLUDED.date_from,
            date_to = EXCLUDED.date_to,
            half_day = EXCLUDED.half_day,
            duration = EXCLUDED.duration,
            reason = EXCLUDED.reason,
            document_ids = EXCLUDED.document_ids,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            cancelled_at = EXCLUDED.cancelled_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.employee_user_id,
          request.leave_type,
          request.date_from,
          request.date_to,
          request.half_day,
          request.duration,
          request.reason,
          JSON.stringify(request.document_ids),
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.cancelled_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at
        ]
      );
    }
    for (const request of this.store.wfhRequests) {
      await client.query(
        `INSERT INTO leave_wfh.wfh_requests (
          id, request_code, employee_user_id, date_from, date_to, half_day,
          duration, reason, project_ref, status, current_approver_user_id,
          decision_remarks, decided_by_user_id, decided_at, cancelled_at,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE
        SET request_code = EXCLUDED.request_code,
            date_from = EXCLUDED.date_from,
            date_to = EXCLUDED.date_to,
            half_day = EXCLUDED.half_day,
            duration = EXCLUDED.duration,
            reason = EXCLUDED.reason,
            project_ref = EXCLUDED.project_ref,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            cancelled_at = EXCLUDED.cancelled_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.employee_user_id,
          request.date_from,
          request.date_to,
          request.half_day,
          request.duration,
          request.reason,
          request.project_ref,
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.cancelled_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at
        ]
      );
    }
    for (const holiday of this.store.holidays) {
      await client.query(
        `INSERT INTO leave_wfh.holidays (
          id, name, holiday_date, region, optional, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            holiday_date = EXCLUDED.holiday_date,
            region = EXCLUDED.region,
            optional = EXCLUDED.optional,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          holiday.id,
          holiday.name,
          holiday.holiday_date,
          holiday.region,
          holiday.optional,
          holiday.version,
          holiday.created_at,
          holiday.updated_at,
          holiday.deleted_at
        ]
      );
    }
  }

  private async flushEms(client: PoolClient, options: DomainPersistenceFlushOptions = {}): Promise<void> {
    const filtered = hasAnyDomainFlushOption(options);
    const userIds = optionalSet(options.userIds);
    const profileChangeRequestIds = optionalSet(options.emsProfileChangeRequestIds);
    const serviceRequestIds = optionalSet(options.emsServiceRequestIds);
    const letterIds = optionalSet(options.emsLetterIds);
    const policyIds = optionalSet(options.emsPolicyIds);
    const adminChecklistIds = optionalSet(options.emsAdminChecklistIds);
    const probationReviewIds = optionalSet(options.emsProbationReviewIds);
    for (const profile of this.store.emsEmployeeProfiles) {
      if (!shouldFlushId(profile.employee_user_id, userIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.employee_profiles (
          id, employee_user_id, personal_email, phone, alternate_phone, current_address,
          permanent_address, city, country, emergency_contact, personal_details,
          work_preferences, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE
        SET personal_email = EXCLUDED.personal_email,
            phone = EXCLUDED.phone,
            alternate_phone = EXCLUDED.alternate_phone,
            current_address = EXCLUDED.current_address,
            permanent_address = EXCLUDED.permanent_address,
            city = EXCLUDED.city,
            country = EXCLUDED.country,
            emergency_contact = EXCLUDED.emergency_contact,
            personal_details = EXCLUDED.personal_details,
            work_preferences = EXCLUDED.work_preferences,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          profile.id,
          profile.employee_user_id,
          profile.personal_email,
          profile.phone,
          profile.alternate_phone,
          profile.current_address,
          profile.permanent_address,
          profile.city,
          profile.country,
          JSON.stringify(profile.emergency_contact),
          JSON.stringify(profile.personal_details),
          JSON.stringify(profile.work_preferences),
          profile.version,
          profile.created_at,
          profile.updated_at,
          profile.deleted_at
        ]
      );
    }
    for (const request of this.store.emsProfileChangeRequests) {
      if (!shouldFlushId(request.id, profileChangeRequestIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.profile_change_requests (
          id, request_code, employee_user_id, field_key, field_label, old_value,
          new_value, reason, supporting_document_ids, status, current_approver_user_id,
          decision_remarks, decided_by_user_id, decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE
        SET field_label = EXCLUDED.field_label,
            old_value = EXCLUDED.old_value,
            new_value = EXCLUDED.new_value,
            reason = EXCLUDED.reason,
            supporting_document_ids = EXCLUDED.supporting_document_ids,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.employee_user_id,
          request.field_key,
          request.field_label,
          request.old_value,
          request.new_value,
          request.reason,
          JSON.stringify(request.supporting_document_ids),
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at
        ]
      );
    }
    for (const request of this.store.emsServiceRequests) {
      if (!shouldFlushId(request.id, serviceRequestIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.service_requests (
          id, request_code, requester_user_id, request_type, subject, description,
          document_ids, status, assignee_user_id, decision_remarks, decided_by_user_id,
          decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE
        SET subject = EXCLUDED.subject,
            description = EXCLUDED.description,
            document_ids = EXCLUDED.document_ids,
            status = EXCLUDED.status,
            assignee_user_id = EXCLUDED.assignee_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.requester_user_id,
          request.request_type,
          request.subject,
          request.description,
          JSON.stringify(request.document_ids),
          request.status,
          request.assignee_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at
        ]
      );
    }
    for (const letter of this.store.emsLetters) {
      if (!shouldFlushId(letter.id, letterIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.letters (
          id, employee_user_id, letter_type, title, description, status,
          document_id, issued_on, acknowledged_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            document_id = EXCLUDED.document_id,
            issued_on = EXCLUDED.issued_on,
            acknowledged_at = EXCLUDED.acknowledged_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          letter.id,
          letter.employee_user_id,
          letter.letter_type,
          letter.title,
          letter.description,
          letter.status,
          letter.document_id,
          letter.issued_on,
          letter.acknowledged_at,
          letter.version,
          letter.created_at,
          letter.updated_at,
          letter.deleted_at
        ]
      );
    }
    for (const policy of this.store.emsPolicies) {
      if (!shouldFlushId(policy.id, policyIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.policies (
          id, policy_code, title, category, version_label, effective_from,
          document_id, status, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            category = EXCLUDED.category,
            version_label = EXCLUDED.version_label,
            effective_from = EXCLUDED.effective_from,
            document_id = EXCLUDED.document_id,
            status = EXCLUDED.status,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          policy.id,
          policy.policy_code,
          policy.title,
          policy.category,
          policy.version_label,
          policy.effective_from,
          policy.document_id,
          policy.status,
          policy.version,
          policy.created_at,
          policy.updated_at,
          policy.deleted_at
        ]
      );
    }
    for (const acknowledgement of this.store.emsPolicyAcknowledgements) {
      if (
        filtered &&
        !policyIds?.has(acknowledgement.policy_id) &&
        !userIds?.has(acknowledgement.employee_user_id)
      ) {
        continue;
      }
      await client.query(
        `INSERT INTO ems.policy_acknowledgements (
          id, policy_id, employee_user_id, status, acknowledged_at, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            acknowledged_at = EXCLUDED.acknowledged_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at`,
        [
          acknowledgement.id,
          acknowledgement.policy_id,
          acknowledgement.employee_user_id,
          acknowledgement.status,
          acknowledgement.acknowledged_at,
          acknowledgement.version,
          acknowledgement.created_at,
          acknowledgement.updated_at
        ]
      );
    }
    for (const checklist of this.store.emsAdminChecklists) {
      if (!shouldFlushId(checklist.id, adminChecklistIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.admin_checklists (
          id, checklist_type, employee_user_id, status, due_date, checklist, remarks,
          completed_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            due_date = EXCLUDED.due_date,
            checklist = EXCLUDED.checklist,
            remarks = EXCLUDED.remarks,
            completed_at = EXCLUDED.completed_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          checklist.id,
          checklist.checklist_type,
          checklist.employee_user_id,
          checklist.status,
          checklist.due_date,
          JSON.stringify(checklist.checklist),
          checklist.remarks,
          checklist.completed_at,
          checklist.version,
          checklist.created_at,
          checklist.updated_at,
          checklist.deleted_at
        ]
      );
    }
    for (const review of this.store.emsProbationReviews) {
      if (!shouldFlushId(review.id, probationReviewIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.probation_reviews (
          id, employee_user_id, joining_on, due_on, status, extended_until, remarks,
          decided_by_user_id, decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET due_on = EXCLUDED.due_on,
            status = EXCLUDED.status,
            extended_until = EXCLUDED.extended_until,
            remarks = EXCLUDED.remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          review.id,
          review.employee_user_id,
          review.joining_on,
          review.due_on,
          review.status,
          review.extended_until,
          review.remarks,
          review.decided_by_user_id,
          review.decided_at,
          review.version,
          review.created_at,
          review.updated_at,
          review.deleted_at
        ]
      );
    }
  }
}
