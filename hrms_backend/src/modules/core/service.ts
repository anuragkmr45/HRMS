import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthUser, CoreUser, Department, Designation, DocumentMetadata, OutboxEvent, RoleKey, UUID } from "#shared";
import { DocumentClassifications, EmploymentStatuses, Roles } from "#shared";
import { badRequest, conflict, forbidden, notFound } from "../../platform/errors.js";
import type { AuthTokenRecord, MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { createGeneratedExportDocument, type GeneratedExportFormat } from "../../platform/generated-exports.js";
import { DocumentService } from "../documents/service.js";
import { appendCoreOutboxEvent } from "./events.js";
import { CoreRepository } from "./repository.js";

export interface SubtreeUser extends CoreUser {
  depth: number;
}

export interface UserSubtreeResult {
  items: SubtreeUser[];
  page: number;
  page_size: number;
  total: number;
  total_active_descendants: number;
  max_depth: number;
  summary: {
    root_user_id: UUID;
    root_employee_code: string;
    root_full_name: string;
    total_active_descendants: number;
    max_depth: number;
  };
}

export interface UserDirectoryQuery {
  page: number;
  page_size: number;
  q?: string;
  department_id?: UUID;
  designation_id?: UUID;
  role?: string;
  employment_status?: string;
  manager_user_id?: UUID;
  login_state?: LoginState;
  sort?: string;
}

export type LoginState = "enabled" | "disabled" | "setup_pending";

export interface UserReference {
  id: UUID;
  employee_code: string;
  full_name: string;
}

export interface DepartmentReference {
  id: UUID;
  department_code: string;
  name: string;
  cost_center: string | null;
}

export interface DesignationReference {
  id: UUID;
  designation_code: string;
  title: string;
  level: number | null;
}

export interface CoreUserListItem extends CoreUser {
  department: DepartmentReference | null;
  designation: DesignationReference | null;
  manager: UserReference | null;
  display_label: string;
  status: string;
  login_state: LoginState;
  role_labels: string[];
}

export interface CoreUserDetail extends CoreUserListItem {
  reporting_line: UserReference[];
  role_assignments: Array<{ role: string; status: "active" }>;
  direct_reports_summary: {
    total: number;
    active: number;
  };
  documents_summary: {
    total: number;
    restricted: number;
  };
  assets_summary: {
    assigned: number;
    recovery_pending: number;
  };
  attendance_summary: {
    status: "not_available";
  };
  leave_summary: {
    pending_leave: number;
    approved_leave_ytd: number;
    pending_wfh: number;
    approved_wfh_ytd: number;
  };
  timesheet_summary: {
    total_submissions: number;
    pending_approval: number;
    approved: number;
  };
  expense_summary: {
    total_requests: number;
    open_requests: number;
    closed_requests: number;
  };
  profile_tabs_available: string[];
}

export interface UserDirectoryResult {
  items: CoreUserListItem[];
  page: number;
  page_size: number;
  total: number;
  summary: {
    total_visible: number;
    total_active: number;
    total_inactive: number;
    total_suspended: number;
    total_terminated: number;
    filters_applied: string[];
    sort: string;
  };
}

export interface UserCreateInput {
  employee_code: string;
  email: string;
  full_name: string;
  department_id: UUID;
  designation_id: UUID;
  manager_user_id?: UUID | null;
  roles?: RoleKey[];
  employment_status?: CoreUser["employment_status"];
  timezone?: string | null;
  joined_on?: string | null;
  login_enabled?: boolean;
}

export interface UserUpdateInput {
  email?: string;
  full_name?: string;
  department_id?: UUID;
  designation_id?: UUID;
  manager_user_id?: UUID | null;
  employment_status?: CoreUser["employment_status"];
  timezone?: string | null;
  joined_on?: string | null;
  terminated_on?: string | null;
  expected_version: number;
}

export interface UserStatusInput {
  expected_version: number;
  effective_date?: string;
  reason?: string;
  remarks?: string;
  status?: Extract<CoreUser["employment_status"], "inactive" | "terminated" | "suspended">;
}

export interface UserLoginInput {
  expected_version: number;
  invite_email?: boolean;
  reason?: string;
}

export interface UserRolesInput {
  roles: RoleKey[];
  expected_version: number;
  remarks?: string;
}

export interface UserHistoryQuery {
  page: number;
  page_size: number;
  sort?: string;
}

export interface UserAuditQuery extends UserHistoryQuery {
  event_type?: string;
  date_from?: string;
  date_to?: string;
}

export interface UserImportInput {
  document_id?: UUID;
  file_name?: string;
  dry_run?: boolean;
  mapping?: Record<string, string>;
}

export interface UserExportInput {
  format: "csv" | "xlsx";
  filters: Record<string, unknown>;
  columns?: string[];
}

export interface ProfilePhotoPolicy {
  max_bytes: number;
  max_width: number;
  max_height: number;
  jpeg_quality: number;
  allowed_mime_types: string[];
  output_mime_type: "image/jpeg";
  cloudinary_transformation: string;
}

export interface ProfilePhotoUploadInput {
  file_buffer: Buffer;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface CoreUserMutationResult extends CoreUserDetail {
  onboarding?: {
    setup_required: boolean;
    invite_sent: boolean;
    next_step: "set_password" | "none";
    dev_only?: {
      password_setup_token: string | null;
    };
  };
  sessions_revoked?: number;
}

export interface OrgSelectorsResult {
  departments: DepartmentReference[];
  designations: DesignationReference[];
  managers: UserReference[];
  roles: Array<{ key: RoleKey; label: string }>;
}

export class CoreService {
  private readonly repository: CoreRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new CoreRepository(store);
  }

  listUsers(actor: AuthUser, params: UserDirectoryQuery): UserDirectoryResult {
    const visibleUsers = this.visibleUsersFor(actor);
    const filtered = this.sortUsers(visibleUsers.filter((user) => this.matchesDirectoryFilters(user, params)), params.sort);
    const start = (params.page - 1) * params.page_size;
    const items = filtered.slice(start, start + params.page_size).map((user) => this.toListItem(user));
    return {
      items,
      page: params.page,
      page_size: params.page_size,
      total: filtered.length,
      summary: {
        total_visible: visibleUsers.length,
        total_active: visibleUsers.filter((user) => user.employment_status === "active").length,
        total_inactive: visibleUsers.filter((user) => user.employment_status === "inactive").length,
        total_suspended: visibleUsers.filter((user) => user.employment_status === "suspended").length,
        total_terminated: visibleUsers.filter((user) => user.employment_status === "terminated").length,
        filters_applied: appliedFilters(params),
        sort: params.sort ?? "employee_code"
      }
    };
  }

  orgSelectors(actor: AuthUser): OrgSelectorsResult {
    const actorCompanyId = this.companyIdForUser(actor.id);
    const managerCandidates = this.visibleUsersFor(actor)
      .filter((user) => user.employment_status === EmploymentStatuses.Active)
      .map((user) => toUserReference(user));
    return {
      departments: this.repository.departments()
        .filter((department) => department.status === "active" && this.isMasterDataInCompany(department.company_id, actorCompanyId))
        .map(toDepartmentReference),
      designations: this.repository.designations()
        .filter((designation) => designation.status === "active" && this.isMasterDataInCompany(designation.company_id, actorCompanyId))
        .map(toDesignationReference),
      managers: managerCandidates,
      roles: allowedRoleKeys.map((role) => ({ key: role, label: role }))
    };
  }

  createUser(actor: AuthUser, input: UserCreateInput): CoreUserMutationResult {
    requirePeopleManager(actor);
    const employeeCode = normalizeEmployeeCode(input.employee_code);
    const email = normalizeEmail(input.email);
    if (this.store.users.some((user) => normalizeEmployeeCode(user.employee_code) === employeeCode && !user.deleted_at)) {
      throw conflict("Employee code already exists.", { employee_code: employeeCode });
    }
    if (this.store.users.some((user) => normalizeEmail(user.email) === email && !user.deleted_at)) {
      throw conflict("Email already exists.", { email });
    }
    const actorCompanyId = this.companyIdForUser(actor.id);
    this.requireDepartment(actorCompanyId, input.department_id);
    this.requireDesignation(actorCompanyId, input.designation_id);
    const manager = input.manager_user_id ? this.requireActiveManager(actor, input.manager_user_id) : null;
    const roles = this.normalizeRoles(input.roles ?? [Roles.Employee]);
    requireCanAssignRoles(actor, roles);

    const now = nowIso();
    const user: CoreUser = {
      id: randomUUID(),
      employee_code: employeeCode,
      email,
      full_name: normalizeText(input.full_name, "Full name"),
      department_id: input.department_id,
      designation_id: input.designation_id,
      roles,
      employment_status: input.employment_status ?? EmploymentStatuses.Inactive,
      hierarchy_path: hierarchyPathFor(employeeCode, manager),
      manager_user_id: manager?.id ?? null,
      timezone: normalizeOptional(input.timezone),
      joined_on: input.joined_on ?? now.slice(0, 10),
      terminated_on: null,
      deleted_at: null,
      version: 1
    };
    this.store.users.push(user);
    this.assignUserToActorCompany(actor, user, now);
    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.created",
      payload: { user_id: user.id, employee_code: user.employee_code, actor_user_id: actor.id, roles: user.roles },
      idempotencyKey: `core.user.created:${user.id}`
    });
    const onboarding = input.login_enabled ? this.queuePasswordSetup(user, "employee_create") : undefined;
    return this.withMutationMetadata(this.toDetail(user), onboarding ? { onboarding } : {});
  }

  updateUser(actor: AuthUser, id: UUID, input: UserUpdateInput): CoreUserMutationResult {
    requirePeopleManager(actor);
    const user = this.requireUserForWrite(actor, id);
    requireExpectedVersion(user, input.expected_version);
    if (input.employment_status !== undefined && input.employment_status !== EmploymentStatuses.Active) {
      this.requireOrgAdminRecoveryPath(user, {
        employmentStatus: input.employment_status
      });
    }

    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      const duplicate = this.store.users.find((candidate) => candidate.id !== user.id && normalizeEmail(candidate.email) === email && !candidate.deleted_at);
      if (duplicate) {
        throw conflict("Email already exists.", { email });
      }
      user.email = email;
    }
    if (input.full_name !== undefined) {
      user.full_name = normalizeText(input.full_name, "Full name");
    }
    if (input.department_id !== undefined) {
      this.requireDepartment(this.companyIdForUser(actor.id), input.department_id);
      user.department_id = input.department_id;
    }
    if (input.designation_id !== undefined) {
      this.requireDesignation(this.companyIdForUser(actor.id), input.designation_id);
      user.designation_id = input.designation_id;
    }
    if (input.manager_user_id !== undefined) {
      this.updateManager(actor, user, input.manager_user_id);
    }
    if (input.employment_status !== undefined) {
      user.employment_status = input.employment_status;
      if (input.employment_status !== EmploymentStatuses.Terminated) {
        user.terminated_on = input.terminated_on ?? null;
      }
    }
    if (input.timezone !== undefined) {
      user.timezone = normalizeOptional(input.timezone);
    }
    if (input.joined_on !== undefined) {
      user.joined_on = input.joined_on;
    }
    if (input.terminated_on !== undefined) {
      user.terminated_on = input.terminated_on;
    }
    user.version += 1;
    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.updated",
      payload: { user_id: user.id, employee_code: user.employee_code, actor_user_id: actor.id },
      idempotencyKey: `core.user.updated:${user.id}:${user.version}`
    });
    return this.toDetail(user);
  }

  async uploadProfilePhoto(
    actor: AuthUser,
    id: UUID,
    input: ProfilePhotoUploadInput,
    policy: ProfilePhotoPolicy
  ): Promise<CoreUserMutationResult> {
    const user = this.requireUserForRead(actor, id);
    if (actor.id !== user.id) {
      requirePeopleManager(actor);
    }
    const normalizedMime = input.mime_type.trim().toLowerCase();
    if (!policy.allowed_mime_types.includes(normalizedMime)) {
      throw badRequest("Profile photo must be a JPEG, PNG, or WebP image.", {
        allowed_mime_types: policy.allowed_mime_types
      });
    }
    if (input.file_buffer.length <= 0) {
      throw badRequest("Profile photo upload is empty.");
    }
    if (input.file_buffer.length > policy.max_bytes || input.size_bytes > policy.max_bytes) {
      throw badRequest("Profile photo is larger than the configured upload limit.", {
        max_bytes: policy.max_bytes,
        actual_bytes: Math.max(input.file_buffer.length, input.size_bytes)
      });
    }

    const documentService = new DocumentService(this.store);
    const document = await documentService.upload(actor, {
      business_object_type: "core_user",
      business_object_id: user.id,
      owner_user_id: user.id,
      classification: DocumentClassifications.Normal,
      document_type: "profile_photo",
      file_name: input.file_name,
      mime_type: normalizedMime,
      size_bytes: input.size_bytes,
      file_buffer: input.file_buffer,
      storage_metadata: {
        "x-cloudinary-transformation": policy.cloudinary_transformation,
        "x-hrms-profile-photo": "true"
      }
    });

    const previousDocumentId = user.profile_photo_document_id;
    user.profile_photo_document_id = document.id;
    user.profile_photo_url = profilePhotoUrl(document);
    user.version += 1;

    if (previousDocumentId && previousDocumentId !== document.id) {
      const previous = this.store.documents.find((candidate) => candidate.id === previousDocumentId && !candidate.deleted_at);
      if (previous) {
        await documentService.delete(actor, previous.id);
      }
    }

    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.profile_photo_uploaded",
      payload: {
        user_id: user.id,
        employee_code: user.employee_code,
        document_id: document.id,
        actor_user_id: actor.id,
        mime_type: normalizedMime,
        size_bytes: input.size_bytes
      },
      idempotencyKey: `core.user.profile_photo_uploaded:${user.id}:${document.id}`
    });
    return this.toDetail(user);
  }

  async removeProfilePhoto(actor: AuthUser, id: UUID): Promise<CoreUserMutationResult> {
    const user = this.requireUserForRead(actor, id);
    if (actor.id !== user.id) {
      requirePeopleManager(actor);
    }

    const previousDocumentId = user.profile_photo_document_id;
    if (previousDocumentId) {
      const previous = this.store.documents.find((candidate) => candidate.id === previousDocumentId && !candidate.deleted_at);
      if (previous) {
        await new DocumentService(this.store).delete(actor, previous.id);
      }
    }

    if (!previousDocumentId && !user.profile_photo_url) {
      return this.toDetail(user);
    }

    user.profile_photo_document_id = null;
    user.profile_photo_url = null;
    user.version += 1;

    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.profile_photo_removed",
      payload: {
        user_id: user.id,
        employee_code: user.employee_code,
        previous_document_id: previousDocumentId,
        actor_user_id: actor.id
      },
      idempotencyKey: `core.user.profile_photo_removed:${user.id}:${user.version}`
    });
    return this.toDetail(user);
  }

  activateUser(actor: AuthUser, id: UUID, input: UserStatusInput): CoreUserMutationResult {
    requirePeopleManager(actor);
    const user = this.requireUserForWrite(actor, id);
    requireExpectedVersion(user, input.expected_version);
    if (user.employment_status === EmploymentStatuses.Active) {
      throw conflict("Employee is already active.", { id });
    }
    user.employment_status = EmploymentStatuses.Active;
    user.terminated_on = null;
    user.version += 1;
    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.activated",
      payload: { user_id: user.id, employee_code: user.employee_code, actor_user_id: actor.id, remarks: input.remarks ?? null },
      idempotencyKey: `core.user.activated:${user.id}:${user.version}`
    });
    return this.toDetail(user);
  }

  deactivateUser(actor: AuthUser, id: UUID, input: UserStatusInput): CoreUserMutationResult {
    requirePeopleManager(actor);
    const user = this.requireUserForWrite(actor, id);
    requireNotSelfLifecycleMutation(actor, user);
    requireExpectedVersion(user, input.expected_version);
    const nextStatus = input.status ?? EmploymentStatuses.Inactive;
    if (user.employment_status === nextStatus) {
      throw conflict("Employee already has the requested inactive status.", { id, status: nextStatus });
    }
    this.requireOrgAdminRecoveryPath(user, {
      employmentStatus: nextStatus,
      loginUsable: false
    });
    user.employment_status = nextStatus;
    user.terminated_on = nextStatus === EmploymentStatuses.Terminated ? input.effective_date ?? nowIso().slice(0, 10) : null;
    const now = nowIso();
    for (const credential of this.store.userCredentials.filter((credential) => credential.user_id === user.id && !credential.deleted_at)) {
      credential.status = "revoked";
      credential.updated_at = now;
    }
    user.version += 1;
    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: nextStatus === EmploymentStatuses.Terminated ? "core.user.terminated" : "core.user.deactivated",
      payload: {
        user_id: user.id,
        employee_code: user.employee_code,
        actor_user_id: actor.id,
        status: nextStatus,
        reason: input.reason ?? null,
        effective_date: input.effective_date ?? null
      },
      idempotencyKey: `core.user.deactivated:${user.id}:${user.version}`
    });
    return this.toDetail(user);
  }

  async disableLogin(actor: AuthUser, id: UUID, input: UserLoginInput): Promise<CoreUserMutationResult> {
    requirePeopleManager(actor);
    const user = this.requireUserForWrite(actor, id);
    requireNotSelfLifecycleMutation(actor, user);
    requireExpectedVersion(user, input.expected_version);
    const activeCredentials = this.store.userCredentials.filter((credential) => credential.user_id === user.id && credential.status === "active" && !credential.deleted_at);
    if (activeCredentials.length === 0 && this.loginState(user.id) !== "setup_pending") {
      throw conflict("Login is already disabled.", { id });
    }
    this.requireOrgAdminRecoveryPath(user, {
      loginUsable: false
    });
    const now = nowIso();
    for (const credential of activeCredentials) {
      credential.status = "revoked";
      credential.updated_at = now;
    }
    this.revokeActivePasswordSetupTokens(user.id);
    const sessionsRevoked = await this.store.sessionStore.revokeUser?.(user.id, "login_disabled") ?? 0;
    user.version += 1;
    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.login_disabled",
      payload: { user_id: user.id, employee_code: user.employee_code, actor_user_id: actor.id, sessions_revoked: sessionsRevoked, reason: input.reason ?? null },
      idempotencyKey: `core.user.login_disabled:${user.id}:${user.version}`
    });
    return this.withMutationMetadata(this.toDetail(user), { sessions_revoked: sessionsRevoked });
  }

  enableLogin(actor: AuthUser, id: UUID, input: UserLoginInput): CoreUserMutationResult {
    requirePeopleManager(actor);
    const user = this.requireUserForWrite(actor, id);
    requireNotSelfLifecycleMutation(actor, user);
    requireExpectedVersion(user, input.expected_version);
    if (this.loginState(user.id) === "enabled") {
      throw conflict("Login is already enabled.", { id });
    }
    const onboarding = this.queuePasswordSetup(user, "employee_login_enable");
    user.version += 1;
    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.login_setup_requested",
      payload: { user_id: user.id, employee_code: user.employee_code, actor_user_id: actor.id, invite_email: Boolean(input.invite_email) },
      idempotencyKey: `core.user.login_setup_requested:${user.id}:${user.version}`
    });
    return this.withMutationMetadata(this.toDetail(user), { onboarding });
  }

  replaceRoles(actor: AuthUser, id: UUID, input: UserRolesInput): CoreUserMutationResult {
    const user = this.requireUserForWrite(actor, id);
    requireExpectedVersion(user, input.expected_version);
    const roles = this.normalizeRoles(input.roles);
    requireCanAssignRoles(actor, roles, user);
    if (actor.id === user.id && user.roles.includes(Roles.Admin) && !roles.includes(Roles.Admin)) {
      throw forbidden("Admin users cannot remove their own admin role.");
    }
    this.requireOrgAdminRecoveryPath(user, {
      roles
    });
    const previousRoles = [...user.roles];
    user.roles = roles;
    user.version += 1;
    const preference = this.store.userSessionPreferences.find((candidate) => candidate.user_id === user.id);
    if (preference && !roles.includes(preference.active_role)) {
      preference.active_role = roles[0] ?? Roles.Employee;
      preference.updated_at = nowIso();
      preference.version += 1;
    }
    appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user",
      aggregateId: user.id,
      eventType: "core.user.roles_replaced",
      payload: { user_id: user.id, employee_code: user.employee_code, actor_user_id: actor.id, previous_roles: previousRoles, roles, remarks: input.remarks ?? null },
      idempotencyKey: `core.user.roles_replaced:${user.id}:${user.version}`
    });
    return this.toDetail(user);
  }

  roleHistory(actor: AuthUser, id: UUID, query: UserHistoryQuery) {
    const user = this.requireUserForRead(actor, id);
    if (!canReadSensitiveUserTimeline(actor, user)) {
      throw forbidden("You do not have access to this employee role history.");
    }
    const roleEvents = this.userTimelineEvents(user.id)
      .filter((event) => event.event_type === "core.user.roles_replaced" || event.event_type === "core.user.created")
      .map((event) => this.presentRoleHistoryEvent(user, event));
    const rows = roleEvents.length > 0 ? roleEvents : [this.presentCurrentRoleHistory(user)];
    const sorted = sortByCreatedAt(rows, query.sort);
    return pageWithSummary(sorted, query.page, query.page_size, {
      current_roles: user.roles,
      history_events: roleEvents.length
    });
  }

  auditTrail(actor: AuthUser, id: UUID, query: UserAuditQuery) {
    const user = this.requireUserForRead(actor, id);
    if (!canReadSensitiveUserTimeline(actor, user)) {
      throw forbidden("You do not have access to this employee audit trail.");
    }
    const rows = this.userTimelineEvents(user.id)
      .filter((event) => !query.event_type || event.event_type === query.event_type)
      .filter((event) => !query.date_from || event.created_at.slice(0, 10) >= query.date_from)
      .filter((event) => !query.date_to || event.created_at.slice(0, 10) <= query.date_to)
      .map((event) => this.presentAuditEvent(user, event));
    const sorted = sortByCreatedAt(rows, query.sort);
    return pageWithSummary(sorted, query.page, query.page_size, {
      events: sorted.length,
      last_event_at: sorted[0]?.created_at ?? null
    });
  }

  createImportJob(actor: AuthUser, input: UserImportInput) {
    requirePeopleManager(actor);
    const jobId = randomUUID();
    const event = appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user_import",
      aggregateId: jobId,
      eventType: "core.users.import_requested",
      payload: {
        actor_user_id: actor.id,
        document_id: input.document_id ?? null,
        file_name: normalizeOptional(input.file_name),
        dry_run: Boolean(input.dry_run),
        mapping: input.mapping ?? {},
        status: "queued",
        accepted_rows: 0,
        rejected_rows: 0,
        row_errors: [],
        created_users: []
      },
      idempotencyKey: `core.users.import_requested:${jobId}`
    });
    return this.presentImportJob(event);
  }

  getImportJob(actor: AuthUser, jobId: UUID) {
    requirePeopleManager(actor);
    const event = this.store.outbox.find((candidate) => candidate.aggregate_type === "core.user_import" && candidate.aggregate_id === jobId);
    if (!event) {
      throw notFound("Employee import job not found.", { job_id: jobId });
    }
    return this.presentImportJob(event);
  }

  async createExportJob(actor: AuthUser, input: UserExportInput) {
    requireEmployeeExportAccess(actor);
    const jobId = randomUUID();
    const columns = input.columns ?? defaultEmployeeExportColumns;
    const rows = this.exportUserRows(input.filters, columns);
    const generated = await createGeneratedExportDocument(this.store, {
      actor,
      businessObjectType: "core_user_export",
      businessObjectId: jobId,
      reportType: "core/users",
      format: input.format as GeneratedExportFormat,
      rows,
      columns,
      filters: input.filters,
      filePrefix: "employee-export"
    });
    const event = appendCoreOutboxEvent(this.store, {
      aggregateType: "core.user_export",
      aggregateId: jobId,
      eventType: "core.users.export_requested",
      payload: {
        actor_user_id: actor.id,
        format: input.format,
        filters: input.filters,
        columns,
        status: generated.status,
        adapter: generated.adapter,
        download_document_id: generated.download_document_id,
        download_url: generated.download_url,
        file_name: generated.file_name,
        row_count: generated.row_count,
        size_bytes: generated.size_bytes,
        generated_at: generated.generated_at
      },
      idempotencyKey: `core.users.export_requested:${jobId}`
    });
    return this.presentExportJob(event);
  }

  getUser(id: UUID): CoreUser;
  getUser(actor: AuthUser, id: UUID): CoreUserDetail;
  getUser(actorOrId: AuthUser | UUID, maybeId?: UUID): CoreUser | CoreUserDetail {
    const id = maybeId ?? actorOrId;
    const user = this.repository.findUser(id as UUID);
    if (!user) {
      throw notFound("User not found", { id });
    }
    if (!maybeId) {
      return user;
    }
    const actor = actorOrId as AuthUser;
    if (!this.canReadUser(actor, user)) {
      throw forbidden("You do not have access to this employee profile");
    }
    return this.toDetail(user);
  }

  resolveSubtree(managerUserId: UUID): CoreUser[] {
    const manager = this.repository.findActiveUser(managerUserId);
    if (!manager) {
      throw notFound("Manager not found", { id: managerUserId });
    }
    const prefix = `${manager.hierarchy_path}.`;
    return this.repository
      .listUsers()
      .filter((user) => user.employment_status === "active" && user.hierarchy_path.startsWith(prefix));
  }

  resolveSubtreeView(actor: AuthUser, managerUserId: UUID, page: number, pageSize: number): UserSubtreeResult {
    const manager = this.repository.findActiveUser(managerUserId);
    if (!manager) {
      throw notFound("Manager not found", { id: managerUserId });
    }
    if (!this.canReadSubtree(actor, manager)) {
      throw forbidden("You do not have access to this hierarchy subtree");
    }
    const rootDepth = hierarchyDepth(manager.hierarchy_path);
    const items = this.resolveSubtree(managerUserId).map((user) => ({
      ...user,
      depth: Math.max(1, hierarchyDepth(user.hierarchy_path) - rootDepth)
    }));
    const start = (page - 1) * pageSize;
    const maxDepth = items.reduce((max, user) => Math.max(max, user.depth), 0);
    return {
      items: items.slice(start, start + pageSize),
      page,
      page_size: pageSize,
      total: items.length,
      total_active_descendants: items.length,
      max_depth: maxDepth,
      summary: {
        root_user_id: manager.id,
        root_employee_code: manager.employee_code,
        root_full_name: manager.full_name,
        total_active_descendants: items.length,
        max_depth: maxDepth
      }
    };
  }

  resolveImmediateManager(userId: UUID): CoreUser | null {
    const user = this.repository.findActiveUser(userId);
    if (!user?.manager_user_id) {
      return null;
    }
    return this.repository.findActiveUser(user.manager_user_id);
  }

  resolveDirectorOrHoD(userId: UUID): CoreUser | null {
    const user = this.repository.findActiveUser(userId);
    if (!user) {
      return null;
    }
    const department = this.store.departments.find((candidate) => candidate.id === user.department_id && !candidate.deleted_at);
    if (department?.director_user_id) {
      const director = this.repository.findActiveUser(department.director_user_id);
      if (director) {
        return director;
      }
    }
    return this.store.users.find((candidate) => candidate.roles.includes(Roles.Director) && candidate.department_id === user.department_id && candidate.employment_status === "active" && !candidate.deleted_at) ?? null;
  }

  resolveAlternateApprover(excludedUserIds: readonly UUID[]): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.employment_status === "active" &&
          !user.deleted_at &&
          user.roles.includes(Roles.Director) &&
          !excludedUserIds.includes(user.id)
      ) ?? null
    );
  }

  resolveFinanceManager(excludedUserIds: readonly UUID[]): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.employment_status === "active" &&
          !user.deleted_at &&
          user.roles.includes(Roles.FinanceManager) &&
          !excludedUserIds.includes(user.id)
      ) ?? null
    );
  }

  private visibleUsersFor(actor: AuthUser): CoreUser[] {
    const users = this.repository.listUsers().filter((user) => this.isInActorCompany(actor, user));
    if (hasPrivilegedProfileRead(actor)) {
      return users;
    }
    return users.filter(
      (user) =>
        user.id === actor.id ||
        (user.employment_status === "active" && user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`))
    );
  }

  private companyIdForUser(userId: UUID): UUID | null {
    return this.store.userSessionPreferences.find((preference) => preference.user_id === userId)?.company_id ?? null;
  }

  private isInActorCompany(actor: AuthUser, user: CoreUser): boolean {
    const actorCompanyId = this.companyIdForUser(actor.id);
    if (!actorCompanyId) {
      return true;
    }
    return user.id === actor.id || this.companyIdForUser(user.id) === actorCompanyId;
  }

  private isMasterDataInCompany(recordCompanyId: UUID | null, actorCompanyId: UUID | null): boolean {
    return actorCompanyId ? recordCompanyId === actorCompanyId : recordCompanyId === null;
  }

  private assignUserToActorCompany(actor: AuthUser, user: CoreUser, now: string): void {
    const actorPreference = this.store.userSessionPreferences.find((preference) => preference.user_id === actor.id);
    if (!actorPreference?.company_id) {
      return;
    }
    const existing = this.store.userSessionPreferences.find((preference) => preference.user_id === user.id);
    const activeRole = user.roles[0] ?? Roles.Employee;
    if (existing) {
      existing.company_id = actorPreference.company_id;
      existing.active_role = activeRole;
      existing.locale = actorPreference.locale;
      existing.timezone = user.timezone ?? actorPreference.timezone;
      existing.updated_at = now;
      existing.version += 1;
      return;
    }
    this.store.userSessionPreferences.push({
      id: randomUUID(),
      user_id: user.id,
      active_role: activeRole,
      company_id: actorPreference.company_id,
      landing_page: "/dashboard",
      locale: actorPreference.locale,
      timezone: user.timezone ?? actorPreference.timezone,
      created_at: now,
      updated_at: now,
      version: 1
    });
  }

  private matchesDirectoryFilters(user: CoreUser, params: UserDirectoryQuery): boolean {
    const q = params.q?.trim().toLowerCase();
    if (q && ![user.full_name, user.employee_code, user.email].some((value) => value.toLowerCase().includes(q))) {
      return false;
    }
    if (params.department_id && user.department_id !== params.department_id) {
      return false;
    }
    if (params.designation_id && user.designation_id !== params.designation_id) {
      return false;
    }
    if (params.manager_user_id && user.manager_user_id !== params.manager_user_id) {
      return false;
    }
    if (params.role && !user.roles.includes(params.role as CoreUser["roles"][number])) {
      return false;
    }
    if (params.employment_status && user.employment_status !== params.employment_status) {
      return false;
    }
    if (params.login_state && this.loginState(user.id) !== params.login_state) {
      return false;
    }
    return true;
  }

  private sortUsers(users: CoreUser[], sort = "employee_code"): CoreUser[] {
    const descending = sort.startsWith("-");
    const key = descending ? sort.slice(1) : sort;
    const allowed = new Set(["employee_code", "full_name", "email", "department", "designation", "joined_on", "employment_status"]);
    const sortKey = allowed.has(key) ? key : "employee_code";
    return [...users].sort((left, right) => {
      const compared = this.valueForSort(left, sortKey).localeCompare(this.valueForSort(right, sortKey));
      return descending ? -compared : compared;
    });
  }

  private valueForSort(user: CoreUser, key: string): string {
    switch (key) {
      case "department":
        return this.departmentFor(user.department_id)?.name ?? "";
      case "designation":
        return this.designationFor(user.designation_id)?.title ?? "";
      case "joined_on":
        return user.joined_on ?? "";
      case "full_name":
        return user.full_name;
      case "email":
        return user.email;
      case "employment_status":
        return user.employment_status;
      case "employee_code":
      default:
        return user.employee_code;
    }
  }

  private toListItem(user: CoreUser): CoreUserListItem {
    const department = this.departmentFor(user.department_id);
    const designation = this.designationFor(user.designation_id);
    const manager = user.manager_user_id ? this.repository.findUser(user.manager_user_id) : null;
    return {
      ...user,
      department: department ? toDepartmentReference(department) : null,
      designation: designation ? toDesignationReference(designation) : null,
      manager: manager ? toUserReference(manager) : null,
      display_label: `${user.employee_code} - ${user.full_name}`,
      status: user.employment_status,
      login_state: this.loginState(user.id),
      role_labels: [...user.roles]
    };
  }

  private toDetail(user: CoreUser): CoreUserDetail {
    const item = this.toListItem(user);
    const directReports = this.repository.listUsers().filter((candidate) => candidate.manager_user_id === user.id && !candidate.deleted_at);
    const documents = this.store.documents.filter((document) => document.owner_user_id === user.id && !document.deleted_at);
    const assignedAssets = this.store.assets.filter((asset) => asset.current_assigned_user_id === user.id && !asset.deleted_at);
    const recoveryTickets = this.store.assetRecoveryTickets.filter((ticket) => ticket.employee_user_id === user.id && ticket.status !== "closed");
    const submissions = this.store.timesheetSubmissions.filter((submission) => submission.employee_user_id === user.id && !submission.deleted_at);
    const expenseTickets = this.store.tickets.filter((ticket) => ticket.requester_user_id === user.id && !ticket.deleted_at);

    return {
      ...item,
      reporting_line: this.reportingLine(user),
      role_assignments: user.roles.map((role) => ({ role, status: "active" })),
      direct_reports_summary: {
        total: directReports.length,
        active: directReports.filter((candidate) => candidate.employment_status === "active").length
      },
      documents_summary: {
        total: documents.length,
        restricted: documents.filter((document) => document.classification !== "normal").length
      },
      assets_summary: {
        assigned: assignedAssets.length,
        recovery_pending: recoveryTickets.length
      },
      attendance_summary: { status: "not_available" },
      leave_summary: {
        pending_leave: this.store.leaveRequests.filter((request) => request.employee_user_id === user.id && request.status === "pending_manager" && !request.deleted_at).length,
        approved_leave_ytd: this.store.leaveRequests.filter((request) => request.employee_user_id === user.id && request.status === "approved" && request.date_from.startsWith(new Date().getUTCFullYear().toString()) && !request.deleted_at).length,
        pending_wfh: this.store.wfhRequests.filter((request) => request.employee_user_id === user.id && request.status === "pending_manager" && !request.deleted_at).length,
        approved_wfh_ytd: this.store.wfhRequests.filter((request) => request.employee_user_id === user.id && request.status === "approved" && request.date_from.startsWith(new Date().getUTCFullYear().toString()) && !request.deleted_at).length
      },
      timesheet_summary: {
        total_submissions: submissions.length,
        pending_approval: submissions.filter((submission) => submission.status === "Pending Approval").length,
        approved: submissions.filter((submission) => submission.status === "Approved").length
      },
      expense_summary: {
        total_requests: expenseTickets.length,
        open_requests: expenseTickets.filter((ticket) => !["Closed", "Cancelled"].includes(ticket.status)).length,
        closed_requests: expenseTickets.filter((ticket) => ticket.status === "Closed").length
      },
      profile_tabs_available: ["profile", "reporting", "roles", "documents", "assets", "attendance", "leave", "timesheets", "expenses"]
    };
  }

  private reportingLine(user: CoreUser): UserReference[] {
    const line: UserReference[] = [];
    const seen = new Set<UUID>();
    let current = user.manager_user_id ? this.repository.findUser(user.manager_user_id) : null;
    while (current && !seen.has(current.id)) {
      line.unshift(toUserReference(current));
      seen.add(current.id);
      current = current.manager_user_id ? this.repository.findUser(current.manager_user_id) : null;
    }
    return line;
  }

  private departmentFor(id: UUID): Department | null {
    return this.repository.departments().find((department) => department.id === id) ?? null;
  }

  private designationFor(id: UUID): Designation | null {
    return this.repository.designations().find((designation) => designation.id === id) ?? null;
  }

  private loginState(userId: UUID): LoginState {
    if (this.store.userCredentials.some((credential) => credential.user_id === userId && credential.status === "active" && !credential.deleted_at)) {
      return "enabled";
    }
    if (this.store.authTokens.some((token) => token.user_id === userId && token.token_type === "password_setup" && token.status === "active" && Date.parse(token.expires_at) > Date.now())) {
      return "setup_pending";
    }
    return "disabled";
  }

  private requireOrgAdminRecoveryPath(
    targetUser: CoreUser,
    next: {
      roles?: readonly RoleKey[];
      employmentStatus?: CoreUser["employment_status"];
      loginUsable?: boolean;
    }
  ): void {
    if (!targetUser.roles.includes(Roles.Admin)) {
      return;
    }
    if (this.orgRecoveryAdminCountAfter(targetUser, next) > 0) {
      return;
    }
    throw conflict("At least one active Admin with login access must remain in this organization.");
  }

  private orgRecoveryAdminCountAfter(
    targetUser: CoreUser,
    next: {
      roles?: readonly RoleKey[];
      employmentStatus?: CoreUser["employment_status"];
      loginUsable?: boolean;
    }
  ): number {
    const targetCompanyId = this.companyIdForUser(targetUser.id);
    return this.store.users.filter((candidate) => {
      if (candidate.deleted_at) {
        return false;
      }
      if (this.companyIdForUser(candidate.id) !== targetCompanyId) {
        return false;
      }
      const roles = candidate.id === targetUser.id ? next.roles ?? candidate.roles : candidate.roles;
      if (!roles.includes(Roles.Admin)) {
        return false;
      }
      const employmentStatus = candidate.id === targetUser.id ? next.employmentStatus ?? candidate.employment_status : candidate.employment_status;
      if (employmentStatus !== EmploymentStatuses.Active) {
        return false;
      }
      const loginUsable = candidate.id === targetUser.id ? next.loginUsable ?? this.hasLoginRecoveryAccess(candidate.id) : this.hasLoginRecoveryAccess(candidate.id);
      return loginUsable;
    }).length;
  }

  private hasLoginRecoveryAccess(userId: UUID): boolean {
    const state = this.loginState(userId);
    return state === "enabled" || state === "setup_pending";
  }

  private canReadSubtree(actor: AuthUser, root: CoreUser): boolean {
    if (!this.isInActorCompany(actor, root)) {
      return false;
    }
    if (hasPrivilegedProfileRead(actor)) {
      return true;
    }
    return actor.id === root.id || root.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
  }

  private canReadUser(actor: AuthUser, user: CoreUser): boolean {
    if (!this.isInActorCompany(actor, user)) {
      return false;
    }
    if (hasPrivilegedProfileRead(actor)) {
      return true;
    }
    return actor.id === user.id || user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
  }

  private requireUserForRead(actor: AuthUser, id: UUID): CoreUser {
    const user = this.repository.findUser(id);
    if (!user) {
      throw notFound("User not found", { id });
    }
    if (!this.canReadUser(actor, user)) {
      throw forbidden("You do not have access to this employee profile");
    }
    return user;
  }

  private requireUserForWrite(actor: AuthUser, id: UUID): CoreUser {
    const user = this.repository.findUser(id);
    if (!user) {
      throw notFound("User not found", { id });
    }
    if (!this.isInActorCompany(actor, user)) {
      throw forbidden("You do not have access to this employee profile");
    }
    return user;
  }

  private requireDepartment(companyId: UUID | null, id: UUID): Department {
    const department = this.repository.departments().find(
      (candidate) =>
        candidate.id === id &&
        candidate.status === "active" &&
        this.isMasterDataInCompany(candidate.company_id, companyId)
    );
    if (!department) {
      throw notFound("Active department not found", { id });
    }
    return department;
  }

  private requireDesignation(companyId: UUID | null, id: UUID): Designation {
    const designation = this.repository.designations().find(
      (candidate) =>
        candidate.id === id &&
        candidate.status === "active" &&
        this.isMasterDataInCompany(candidate.company_id, companyId)
    );
    if (!designation) {
      throw notFound("Active designation not found", { id });
    }
    return designation;
  }

  private requireActiveManager(actor: AuthUser, id: UUID): CoreUser {
    const manager = this.repository.findActiveUser(id);
    if (!manager) {
      throw notFound("Active manager not found", { id });
    }
    if (!this.isInActorCompany(actor, manager)) {
      throw forbidden("Manager must belong to the active company.");
    }
    return manager;
  }

  private updateManager(actor: AuthUser, user: CoreUser, managerUserId: UUID | null): void {
    const oldPrefix = `${user.hierarchy_path}.`;
    const manager = managerUserId ? this.requireActiveManager(actor, managerUserId) : null;
    if (manager?.id === user.id || (manager && manager.hierarchy_path.startsWith(oldPrefix))) {
      throw badRequest("Manager cannot be the employee or one of their descendants.");
    }
    const nextPath = hierarchyPathFor(user.employee_code, manager);
    if (nextPath === user.hierarchy_path && user.manager_user_id === (manager?.id ?? null)) {
      return;
    }
    const previousPath = user.hierarchy_path;
    user.manager_user_id = manager?.id ?? null;
    user.hierarchy_path = nextPath;
    for (const candidate of this.store.users) {
      if (candidate.id !== user.id && candidate.hierarchy_path.startsWith(`${previousPath}.`)) {
        candidate.hierarchy_path = `${nextPath}.${candidate.hierarchy_path.slice(previousPath.length + 1)}`;
        candidate.version += 1;
      }
    }
  }

  private normalizeRoles(roles: readonly RoleKey[]): RoleKey[] {
    if (!roles.length) {
      throw badRequest("At least one role is required.");
    }
    const unique = [...new Set(roles)];
    const invalid = unique.filter((role) => !allowedRoleKeys.includes(role));
    if (invalid.length > 0) {
      throw badRequest("One or more roles are not supported.", { roles: invalid });
    }
    return unique;
  }

  private queuePasswordSetup(user: CoreUser, reason: string): CoreUserMutationResult["onboarding"] {
    this.revokeActivePasswordSetupTokens(user.id);
    const raw = randomBytes(32).toString("base64url");
    const now = nowIso();
    const token: AuthTokenRecord = {
      id: randomUUID(),
      token_hash: tokenHash(raw),
      token_type: "password_setup",
      user_id: user.id,
      email: user.email,
      company_id: this.store.companyProfiles.find((company) => company.status === "active")?.id ?? null,
      status: "active",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      used_at: null,
      revoked_at: null,
      created_ip_hash: null,
      user_agent_hash: null,
      last_sent_at: null,
      send_count: 0,
      created_at: now,
      metadata: { reason }
    };
    this.store.authTokens.push(token);
    return {
      setup_required: true,
      invite_sent: false,
      next_step: "set_password",
      ...devOnly({ password_setup_token: raw })
    };
  }

  private revokeActivePasswordSetupTokens(userId: UUID): void {
    for (const token of this.store.authTokens.filter((candidate) => candidate.user_id === userId && candidate.token_type === "password_setup" && candidate.status === "active")) {
      token.status = "revoked";
      token.revoked_at = nowIso();
    }
  }

  private withMutationMetadata(detail: CoreUserDetail, metadata: Partial<CoreUserMutationResult>): CoreUserMutationResult {
    return Object.assign(detail, metadata);
  }

  private userTimelineEvents(userId: UUID): OutboxEvent[] {
    return this.store.outbox.filter((event) => event.aggregate_type === "core.user" && event.aggregate_id === userId);
  }

  private presentRoleHistoryEvent(user: CoreUser, event: OutboxEvent) {
    const payload = event.payload;
    const toRoles = roleArray(payload.roles);
    const fromRoles = roleArray(payload.previous_roles);
    return {
      id: event.event_id,
      event_id: event.event_id as string | null,
      user_id: user.id,
      employee_code: user.employee_code,
      actor_user_id: stringOrNull(payload.actor_user_id),
      actor: this.userLabel(stringOrNull(payload.actor_user_id)),
      from_roles: event.event_type === "core.user.created" ? [] : fromRoles,
      to_roles: event.event_type === "core.user.created" ? roleArray(payload.roles, user.roles) : toRoles,
      remarks: stringOrNull(payload.remarks),
      source_event_type: event.event_type,
      created_at: event.created_at
    };
  }

  private presentCurrentRoleHistory(user: CoreUser) {
    return {
      id: `current:${user.id}`,
      event_id: null as string | null,
      user_id: user.id,
      employee_code: user.employee_code,
      actor_user_id: null,
      actor: "System",
      from_roles: [],
      to_roles: user.roles,
      remarks: "Current active role assignment." as string | null,
      source_event_type: "core.user.current_roles",
      created_at: nowIso()
    };
  }

  private presentAuditEvent(user: CoreUser, event: OutboxEvent) {
    const payload = event.payload;
    return {
      id: event.event_id,
      event_id: event.event_id,
      user_id: user.id,
      employee_code: user.employee_code,
      event_type: event.event_type,
      action: auditAction(event.event_type),
      actor_user_id: stringOrNull(payload.actor_user_id),
      actor: this.userLabel(stringOrNull(payload.actor_user_id)),
      remarks: stringOrNull(payload.remarks ?? payload.reason),
      metadata: redactedAuditMetadata(payload),
      created_at: event.created_at
    };
  }

  private presentImportJob(event: OutboxEvent) {
    const payload = event.payload;
    const actorUserId = stringOrNull(payload.actor_user_id);
    return {
      job_id: event.aggregate_id,
      event_id: event.event_id,
      status: stringValue(payload.status, event.status),
      outbox_status: event.status,
      dry_run: Boolean(payload.dry_run),
      accepted_rows: numberValue(payload.accepted_rows),
      rejected_rows: numberValue(payload.rejected_rows),
      row_errors: Array.isArray(payload.row_errors) ? payload.row_errors : [],
      created_users: Array.isArray(payload.created_users) ? payload.created_users : [],
      file: {
        document_id: stringOrNull(payload.document_id),
        file_name: stringOrNull(payload.file_name)
      },
      mapping: recordValue(payload.mapping),
      created_by_user_id: actorUserId,
      created_by: this.userLabel(actorUserId),
      adapter: "outbox-queued-placeholder",
      created_at: event.created_at,
      updated_at: event.published_at ?? event.failed_at ?? event.created_at
    };
  }

  private presentExportJob(event: OutboxEvent) {
    const payload = event.payload;
    const actorUserId = stringOrNull(payload.actor_user_id);
    return {
      job_id: event.aggregate_id,
      export_id: event.aggregate_id,
      event_id: event.event_id,
      status: stringValue(payload.status, event.status),
      outbox_status: event.status,
      format: stringValue(payload.format, "csv"),
      filters: recordValue(payload.filters),
      columns: Array.isArray(payload.columns) ? payload.columns.filter((column) => typeof column === "string") : defaultEmployeeExportColumns,
      download_document_id: stringOrNull(payload.download_document_id),
      download_url: stringOrNull(payload.download_url),
      created_by_user_id: actorUserId,
      created_by: this.userLabel(actorUserId),
      adapter: stringValue(payload.adapter, "outbox-queued-placeholder"),
      file_name: stringOrNull(payload.file_name),
      row_count: numberValue(payload.row_count),
      size_bytes: numberOrNull(payload.size_bytes),
      generated_at: stringOrNull(payload.generated_at),
      created_at: event.created_at,
      updated_at: event.published_at ?? event.failed_at ?? event.created_at
    };
  }

  private exportUserRows(filters: Record<string, unknown>, columns: readonly string[]): Array<Record<string, unknown>> {
    const include = new Set(columns);
    const wants = (key: string) => include.size === 0 || include.has(key);
    return this.store.users
      .filter((user) => !user.deleted_at)
      .filter((user) => !textFilter(filters.department_id) || user.department_id === textFilter(filters.department_id))
      .filter((user) => !textFilter(filters.designation_id) || user.designation_id === textFilter(filters.designation_id))
      .filter((user) => {
        const departmentName = textFilter(filters.department);
        if (!departmentName) return true;
        const department = this.store.departments.find((candidate) => candidate.id === user.department_id);
        return department?.name === departmentName;
      })
      .filter((user) => {
        const designationTitle = textFilter(filters.designation);
        if (!designationTitle) return true;
        const designation = this.store.designations.find((candidate) => candidate.id === user.designation_id);
        return designation?.title === designationTitle;
      })
      .filter((user) => !textFilter(filters.status) || user.employment_status === textFilter(filters.status))
      .filter((user) => !textFilter(filters.employment_status) || user.employment_status === textFilter(filters.employment_status))
      .filter((user) => !textFilter(filters.role) || user.roles.includes(textFilter(filters.role) as RoleKey))
      .filter((user) => {
        if (typeof filters.login_enabled !== "boolean") return true;
        return this.loginState(user.id) === "enabled" ? filters.login_enabled : !filters.login_enabled;
      })
      .map((user) => {
        const detail = this.toListItem(user);
        const row: Record<string, unknown> = {
          id: detail.id,
          employee_code: detail.employee_code,
          name: detail.full_name,
          full_name: detail.full_name,
          email: detail.email,
          department: detail.department?.name ?? "",
          designation: detail.designation?.title ?? "",
          manager: detail.manager?.full_name ?? "",
          type: "",
          employment_status: detail.employment_status,
          status: detail.employment_status,
          login_state: detail.login_state,
          login: detail.login_state,
          roles: detail.roles.join(", "),
          joined: detail.joined_on ?? "",
          joined_on: detail.joined_on ?? ""
        };
        if (include.size === 0) {
          return row;
        }
        return Object.fromEntries(Object.entries(row).filter(([key]) => wants(key)));
      });
  }

  private userLabel(userId: string | null): string {
    if (!userId) {
      return "System";
    }
    const user = this.repository.findUser(userId);
    return user ? `${user.employee_code} - ${user.full_name}` : userId;
  }
}

function hierarchyDepth(path: string): number {
  return path.split(".").filter(Boolean).length;
}

function hasPrivilegedProfileRead(actor: AuthUser): boolean {
  const privilegedRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.HRManager];
  return actor.roles.some((role) => privilegedRoles.includes(role));
}

function requirePeopleManager(actor: AuthUser): void {
  if (!actor.roles.some((role) => role === Roles.Admin || role === Roles.HRManager)) {
    throw forbidden("Only Admin and HR Manager users can manage employee profiles.");
  }
}

function requireNotSelfLifecycleMutation(actor: AuthUser, user: CoreUser): void {
  if (actor.id === user.id) {
    throw forbidden("Use another Admin or HR Manager account to change your own employment or login access.");
  }
}

function requireEmployeeExportAccess(actor: AuthUser): void {
  if (!actor.roles.some((role) => role === Roles.Admin || role === Roles.HRManager || role === Roles.Auditor)) {
    throw forbidden("Only Admin, HR Manager, and Auditor users can export employee profiles.");
  }
}

function canReadSensitiveUserTimeline(actor: AuthUser, user: CoreUser): boolean {
  return hasPrivilegedProfileRead(actor) || actor.id === user.id;
}

function requireCanAssignRoles(actor: AuthUser, roles: readonly RoleKey[], target?: CoreUser): void {
  if (actor.roles.includes(Roles.Admin)) {
    return;
  }
  if (actor.roles.includes(Roles.HRManager) && !roles.includes(Roles.Admin) && !target?.roles.includes(Roles.Admin)) {
    return;
  }
  throw forbidden("Only Admin users can assign privileged roles.");
}

function requireExpectedVersion(user: CoreUser, expectedVersion: number): void {
  if (user.version !== expectedVersion) {
    throw conflict("Employee profile was modified by another actor. Refresh and retry.", {
      expected_version: expectedVersion,
      current_version: user.version
    });
  }
}

const allowedRoleKeys = Object.values(Roles) as RoleKey[];

function normalizeEmployeeCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/u.test(normalized)) {
    throw badRequest("Employee code must be 2-32 letters, numbers, hyphens, or underscores.");
  }
  return normalized;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeText(value: string, field: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length < 2) {
    throw badRequest(`${field} is required.`);
  }
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function ltreeLabel(value: string): string {
  const label = value.toUpperCase().replace(/[^A-Z0-9_]/gu, "_");
  return /^[A-Z_]/u.test(label) ? label : `U_${label}`;
}

function hierarchyPathFor(employeeCode: string, manager: CoreUser | null): string {
  const label = ltreeLabel(employeeCode);
  return manager ? `${manager.hierarchy_path}.${label}` : label;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function devOnly(value: NonNullable<CoreUserMutationResult["onboarding"]>["dev_only"]): Pick<NonNullable<CoreUserMutationResult["onboarding"]>, "dev_only"> | object {
  return process.env.NODE_ENV === "production" ? {} : { dev_only: value };
}

function toUserReference(user: CoreUser): UserReference {
  return {
    id: user.id,
    employee_code: user.employee_code,
    full_name: user.full_name
  };
}

function toDepartmentReference(department: Department): DepartmentReference {
  return {
    id: department.id,
    department_code: department.department_code,
    name: department.name,
    cost_center: department.cost_center
  };
}

function toDesignationReference(designation: Designation): DesignationReference {
  return {
    id: designation.id,
    designation_code: designation.designation_code,
    title: designation.title,
    level: designation.level
  };
}

function profilePhotoUrl(document: DocumentMetadata): string | null {
  const objectUrl = typeof document.metadata.object_url === "string" ? document.metadata.object_url : "";
  const cloudinaryUrl = typeof document.metadata.cloudinary_url === "string" ? document.metadata.cloudinary_url : "";
  const candidate = cloudinaryUrl || objectUrl;
  return /^https?:\/\//iu.test(candidate) ? candidate : null;
}

function appliedFilters(params: UserDirectoryQuery): string[] {
  return ["q", "department_id", "designation_id", "role", "employment_status", "manager_user_id", "login_state"].filter((key) => Boolean(params[key as keyof UserDirectoryQuery]));
}

const defaultEmployeeExportColumns = [
  "employee_code",
  "full_name",
  "email",
  "department",
  "designation",
  "manager",
  "employment_status",
  "login_state",
  "roles",
  "joined_on"
];

function pageWithSummary<T>(items: T[], page: number, pageSize: number, summary: Record<string, unknown>) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    page_size: pageSize,
    total: items.length,
    summary
  };
}

function sortByCreatedAt<T extends { created_at: string }>(rows: T[], sort = "-created_at"): T[] {
  const descending = sort !== "created_at";
  return [...rows].sort((left, right) => {
    const compared = left.created_at.localeCompare(right.created_at);
    return descending ? -compared : compared;
  });
}

function roleArray(value: unknown, fallback: readonly RoleKey[] = []): RoleKey[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value.filter((role): role is RoleKey => typeof role === "string" && allowedRoleKeys.includes(role as RoleKey));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textFilter(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function redactedAuditMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/token|secret|password|hash/iu.test(key)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

function auditAction(eventType: string): string {
  switch (eventType) {
    case "core.user.created":
      return "Profile created";
    case "core.user.updated":
      return "Profile updated";
    case "core.user.activated":
      return "Employee activated";
    case "core.user.deactivated":
      return "Employee deactivated";
    case "core.user.terminated":
      return "Employee terminated";
    case "core.user.login_disabled":
      return "Login disabled";
    case "core.user.login_setup_requested":
      return "Login setup requested";
    case "core.user.roles_replaced":
      return "Roles updated";
    case "core.user.profile_photo_uploaded":
      return "Profile photo uploaded";
    case "core.user.profile_photo_removed":
      return "Profile photo removed";
    default:
      return eventType;
  }
}
