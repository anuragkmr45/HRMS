import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createJwt, hashPasswordSync, verifyPasswordSync } from "#auth";
import {
  EmploymentStatuses,
  Permissions,
  Roles,
  type AdminPolicyConfigRecord,
  type AdminSecuritySettingsRecord,
  type AuthUser,
  type CoreUser,
  type Department,
  type Designation,
  type RoleKey,
  type UUID,
} from "#shared";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "../../platform/errors.js";
import type {
  AuthTokenRecord,
  CompanyProfileRecord,
  MemoryDataStore,
  UserCredentialRecord,
  UserSessionPreferenceRecord,
} from "../../platform/data-store.js";
import {
  buildDefaultAdminPolicies,
  nowIso,
  seedIds,
} from "../../platform/data-store.js";
import type { EmailDeliveryService } from "../../platform/email/email-delivery-service.js";
import type {
  EmailDeliveryMode,
  EmailDeliveryStatus,
} from "../../platform/email/types.js";
import { DocumentService } from "../documents/service.js";
import { AuthRepository } from "./repository.js";
import type {
  CompanyBootstrapInput,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  ResendEmailVerificationInput,
  SessionPreferenceInput,
  SetPasswordInput,
  SignupInput,
  VerifyEmailInput,
} from "./schemas.js";

export interface SessionRole {
  key: string;
  label: string;
  is_active: boolean;
  permissions: string[];
}

export interface SessionNavigationItem {
  key: string;
  label: string;
  path: string;
  permission: string | null;
}

export interface SessionContext {
  user: AuthUser;
  active_role: SessionRole;
  available_roles: SessionRole[];
  permissions: string[];
  navigation: SessionNavigationItem[];
  company: {
    id: string;
    name: string;
    timezone: string;
    logo_document_id?: string | null;
    logo_url?: string | null;
  };
  preferences: {
    active_role: string;
    landing_page: string;
    locale: string;
    timezone: string;
  };
  session_metadata: {
    auth_mode: "cookie_or_bearer";
    low_bandwidth_defaults: {
      page_size: number;
      max_page_size: number;
      use_include_for_nested_data: boolean;
    };
  };
  setup_required?: boolean;
  next_step?: "company_bootstrap";
  company_id?: UUID | null;
  dev_only?: Record<string, unknown>;
}

export interface CompanyLogoUploadInput {
  bootstrap_token: string;
  file_buffer: Buffer;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

interface GeneratedToken {
  raw: string;
  record: AuthTokenRecord;
}

interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
}

interface VerificationEmailSendInput {
  user: CoreUser;
  email: string;
  company: CompanyProfileRecord | null;
  metadata: () => Record<string, unknown>;
  context?: AuthRequestContext;
  enforceResendLimits: boolean;
}

interface VerificationEmailSendResult {
  generated: GeneratedToken | null;
  retryAfterSeconds: number;
  deliveryMode: EmailDeliveryMode;
  deliveryStatus: EmailDeliveryStatus | "not_configured" | null;
}

export class AuthService {
  private readonly repository: AuthRepository;

  constructor(
    private readonly store: MemoryDataStore,
    private readonly jwtSecret: string,
    private readonly emailDelivery?: EmailDeliveryService,
  ) {
    this.repository = new AuthRepository(store);
  }

  async login(input: LoginInput): Promise<{
    user: AuthUser;
    token: string;
    expires_at: string;
    jti: string;
    next_step?: "company_bootstrap";
    company_id?: UUID | null;
    dev_only?: Record<string, unknown>;
  }> {
    const user =
      input.email && input.password
        ? this.authenticatePassword(input.email, input.password)
        : this.authenticateEmployeeCode(input.employee_code ?? "");
    const jwt = createJwt(user, this.jwtSecret, this.sessionTtlSeconds());
    const bootstrap = this.createResumeBootstrapToken(user);
    await this.store.sessionStore.create({
      jti: jwt.jti,
      user_id: user.id,
      expires_at: jwt.expiresAt,
      revoked_at: null,
    });
    return {
      user,
      token: jwt.token,
      expires_at: jwt.expiresAt,
      jti: jwt.jti,
      ...(bootstrap
        ? {
            next_step: "company_bootstrap" as const,
            company_id: bootstrap.record.company_id,
            ...devOnly({ company_bootstrap_token: bootstrap.raw }),
          }
        : {}),
    };
  }

  async signup(input: SignupInput, context: AuthRequestContext = {}) {
    const email = normalizeEmail(input.email);
    const companySlug = slugify(input.company_slug ?? input.company_name);
    const existingCompany = this.repository.findCompanyBySlug(companySlug);
    if (
      existingCompany?.status === "active" &&
      existingCompany.bootstrap_completed_at
    ) {
      throw conflict("Company workspace has already been bootstrapped.", {
        company_slug: companySlug,
      });
    }
    const existingUser = this.repository.findUserByEmail(email);
    if (
      existingUser &&
      existingUser.employment_status === EmploymentStatuses.Active &&
      this.repository.findActiveCredential(existingUser.id)
    ) {
      throw conflict("Signup email is already verified.", {
        email: maskEmail(email),
      });
    }

    if (existingUser) {
      if (isPendingEmailVerification(existingUser)) {
        existingUser.full_name = input.full_name;
        existingUser.timezone = input.timezone;
        existingUser.email_verification_status = "pending";
        existingUser.version += 1;
        const company =
          this.companyForVerification(existingUser, email, companySlug) ??
          existingCompany ??
          null;
        const verification = await this.sendVerificationEmail({
          user: existingUser,
          email,
          company,
          metadata: () => {
            if (input.password) {
              assertPasswordMatchesSecurityPolicy(
                input.password,
                this.store.adminSecuritySettings,
              );
            }
            return {
              password_hash: input.password
                ? hashPasswordSync(input.password)
                : null,
              company_slug: company?.company_slug ?? companySlug,
              timezone: input.timezone,
              locale: input.locale,
              signup_retry: true,
            };
          },
          context,
          enforceResendLimits: true,
        });
        return this.signupVerificationResponse(
          existingUser,
          email,
          verification,
        );
      }
      return this.signupVerificationResponse(existingUser, email, {
        generated: null,
        retryAfterSeconds: this.resendCooldownSeconds(),
        deliveryMode: this.emailDelivery?.deliveryMode() ?? "disabled",
        deliveryStatus: null,
      });
    }

    const now = nowIso();
    const company =
      existingCompany ??
      this.createCompanyProfile(
        input.company_name,
        companySlug,
        input.timezone,
        input.locale,
        now,
      );
    const user = this.createPendingUser({
      email,
      fullName: input.full_name,
      timezone: input.timezone,
      now,
    });
    const verification = await this.sendVerificationEmail({
      user,
      email,
      company,
      metadata: () => {
        if (input.password) {
          assertPasswordMatchesSecurityPolicy(
            input.password,
            this.store.adminSecuritySettings,
          );
        }
        return {
          password_hash: input.password
            ? hashPasswordSync(input.password)
            : null,
          company_slug: company.company_slug,
          timezone: input.timezone,
          locale: input.locale,
        };
      },
      context,
      enforceResendLimits: false,
    });

    return this.signupVerificationResponse(user, email, verification);
  }

  verifyEmail(input: VerifyEmailInput) {
    const token = this.requireActiveToken(input.token, "email_verification");
    if (
      input.email &&
      token.email &&
      normalizeEmail(input.email) !== normalizeEmail(token.email)
    ) {
      throw badRequest("Verification token does not match the supplied email.");
    }
    const user = this.requireTokenUser(token);
    const now = nowIso();
    token.status = "used";
    token.used_at = now;
    user.email_verified_at = user.email_verified_at ?? now;
    user.email_verification_status = "verified";
    const passwordHash =
      typeof token.metadata.password_hash === "string"
        ? token.metadata.password_hash
        : null;
    let passwordSetupToken: GeneratedToken | null = null;
    if (passwordHash) {
      user.employment_status = EmploymentStatuses.Active;
      this.setCredential(user.id, passwordHash, now);
    } else {
      user.employment_status = EmploymentStatuses.Inactive;
      this.revokeActiveTokensForUser(user.id, "password_setup");
      passwordSetupToken = this.createToken({
        type: "password_setup",
        userId: user.id,
        email: token.email,
        companyId: token.company_id,
        ttlSeconds: 60 * 60,
        metadata: { reason: "email_verified_no_password" },
      });
    }
    user.version += 1;

    this.revokeActiveTokensForUser(user.id, "company_bootstrap");
    const bootstrap = this.createToken({
      type: "company_bootstrap",
      userId: user.id,
      email: token.email,
      companyId: token.company_id,
      ttlSeconds: 24 * 60 * 60,
      metadata: { reason: "email_verified" },
    });

    return {
      verified: true,
      user_id: user.id,
      company_id: token.company_id,
      login_allowed: Boolean(passwordHash),
      next_step: passwordHash ? "company_bootstrap" : "set_password",
      ...devOnly({
        company_bootstrap_token: bootstrap.raw,
        password_setup_token: passwordSetupToken?.raw ?? null,
      }),
    };
  }

  async resendEmailVerification(
    input: ResendEmailVerificationInput,
    context: AuthRequestContext = {},
  ) {
    const email = normalizeEmail(input.email);
    const user = this.repository.findUserByEmail(email);
    let generated: GeneratedToken | null = null;
    let retryAfterSeconds = this.resendCooldownSeconds();
    let deliveryMode: EmailDeliveryMode =
      this.emailDelivery?.deliveryMode() ?? "disabled";
    let deliveryStatus: VerificationEmailSendResult["deliveryStatus"] = null;
    if (user && isPendingEmailVerification(user)) {
      const company = input.company_slug
        ? (this.repository.findCompanyBySlug(input.company_slug) ?? null)
        : this.companyForVerification(user, email);
      const result = await this.sendVerificationEmail({
        user,
        email,
        company,
        metadata: () => ({ resend: true }),
        context,
        enforceResendLimits: true,
      });
      generated = result.generated;
      retryAfterSeconds = result.retryAfterSeconds;
      deliveryMode = result.deliveryMode;
      deliveryStatus = result.deliveryStatus;
    }
    return {
      accepted: true,
      masked_email: maskEmail(email),
      retry_after_seconds: retryAfterSeconds,
      email_delivery_mode: deliveryMode,
      email_delivery_status: deliveryStatus,
      email_delivery_notice: emailDeliveryNotice(deliveryMode, deliveryStatus),
      ...devOnly({ email_verification_token: generated?.raw ?? null }),
    };
  }

  setPassword(input: SetPasswordInput) {
    const token = this.requireActiveToken(input.token, "password_setup");
    const user = this.requireTokenUser(token);
    const now = nowIso();
    assertPasswordMatchesSecurityPolicy(
      input.password,
      this.store.adminSecuritySettings,
    );
    this.setCredential(user.id, hashPasswordSync(input.password), now);
    user.employment_status = EmploymentStatuses.Active;
    user.email_verified_at = user.email_verified_at ?? now;
    user.email_verification_status = "verified";
    user.version += 1;
    token.status = "used";
    token.used_at = now;
    return {
      password_set: true,
      login_allowed: true,
      user_id: user.id,
      next_step: "login",
    };
  }

  async requestPasswordReset(
    input: PasswordResetRequestInput,
    context: AuthRequestContext = {},
  ) {
    const email = normalizeEmail(input.email);
    const user = this.repository.findUserByEmail(email);

    let generated: GeneratedToken | null = null;
    let company: CompanyProfileRecord | null = null;

    if (
      user &&
      user.employment_status === EmploymentStatuses.Active &&
      this.repository.findActiveCredential(user.id)
    ) {
      // Apply resend abuse protection (cooldown + hourly + daily limits)
      const rateLimit = this.checkEmailSendLimit(email, "password_reset");

      if (!rateLimit.allowed) {
        return {
          accepted: true,
          masked_email: maskEmail(email),
          retry_after_seconds: rateLimit.retryAfterSeconds,
          ...devOnly({ password_reset_token: null }),
        };
      }

      company = input.company_slug
        ? this.repository.findCompanyBySlug(input.company_slug)
        : (this.store.companyProfiles.at(-1) ?? null);

      this.revokeActiveTokensForUser(user.id, "password_reset");

      generated = this.createToken({
        type: "password_reset",
        userId: user.id,
        email,
        companyId: company?.id ?? null,
        ttlSeconds: 60 * 60,
        metadata: { requested: true },
        context,
      });

      await this.emailDelivery?.queuePasswordResetEmail({
        user,
        token: generated.record,
        rawToken: generated.raw,
        companyName: company?.company_name ?? defaultCompany(user).company_name,
      });
    }

    return {
      accepted: true,
      masked_email: maskEmail(email),
      retry_after_seconds: this.resendCooldownSeconds(),
      ...devOnly({ password_reset_token: generated?.raw ?? null }),
    };
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput) {
    const token = this.requireActiveToken(input.token, "password_reset");
    const user = this.requireTokenUser(token);
    if (user.employment_status !== EmploymentStatuses.Active) {
      throw forbidden("User account is inactive or blocked");
    }
    const now = nowIso();
    assertPasswordMatchesSecurityPolicy(
      input.password,
      this.store.adminSecuritySettings,
    );
    this.setCredential(user.id, hashPasswordSync(input.password), now);
    token.status = "used";
    token.used_at = now;
    const revoked =
      (await this.store.sessionStore.revokeUser?.(user.id, "password_reset")) ??
      0;
    return {
      password_reset: true,
      session_revoked_count: revoked,
      next_step: "login",
    };
  }

  bootstrapCompany(input: CompanyBootstrapInput) {
    const token = this.requireActiveToken(
      input.bootstrap_token,
      "company_bootstrap",
    );
    const user = this.requireTokenUser(token);
    const company = token.company_id
      ? this.repository.findCompanyById(token.company_id)
      : null;
    if (!company) {
      throw notFound("Company bootstrap context not found");
    }
    if (company.bootstrap_completed_at || company.status === "active") {
      throw conflict("Company bootstrap has already been completed.", {
        company_id: company.id,
      });
    }
    const now = nowIso();
    company.company_name =
      input.company_profile.company_name ?? company.company_name;
    company.timezone = input.company_profile.timezone ?? company.timezone;
    company.locale = input.company_profile.locale ?? company.locale;
    company.fiscal_year_start_month =
      input.company_profile.fiscal_year_start_month ??
      company.fiscal_year_start_month;
    company.status = "active";
    company.bootstrap_completed_at = now;
    company.updated_at = now;
    company.version += 1;
    this.applyOnboardingMasterData(input, company.id, now);
    this.assignFirstAdminMasterData(user, company.id);

    if (!user.roles.includes(Roles.Admin)) {
      user.roles = uniqueRoles([...user.roles, Roles.Admin]);
    }
    user.full_name = input.first_admin_profile.full_name ?? user.full_name;
    user.employment_status = this.repository.findActiveCredential(user.id)
      ? EmploymentStatuses.Active
      : user.employment_status;
    user.version += 1;
    token.status = "used";
    token.used_at = now;

    const preference = this.savePreference(user, {
      active_role_id: Roles.Admin,
      company_id: company.id,
      landing_page: input.first_admin_profile.landing_page ?? "/dashboard",
      locale: company.locale,
      timezone: company.timezone,
    });

    return {
      company: presentCompany(company),
      admin_user: presentUser(user),
      setup_progress: {
        company_profile: "completed",
        first_admin: "completed",
        finance_governance: this.store.financeGovernanceConfig
          ? "configured"
          : "pending",
      },
      next_steps: ["login", "configure_core_master_data"],
      preferences: preference,
    };
  }

  async uploadCompanyLogo(input: CompanyLogoUploadInput) {
    const token = this.requireActiveToken(
      input.bootstrap_token,
      "company_bootstrap",
    );
    const user = this.requireTokenUser(token);
    const company = token.company_id
      ? this.repository.findCompanyById(token.company_id)
      : null;
    if (!company) {
      throw notFound("Company bootstrap context not found");
    }
    if (company.bootstrap_completed_at || company.status === "active") {
      throw conflict("Company bootstrap has already been completed.", {
        company_id: company.id,
      });
    }

    const documentService = new DocumentService(this.store);
    if (company.logo_document_id) {
      try {
        await documentService.delete(user, company.logo_document_id);
      } catch {
        // A missing previous draft logo should not block replacing it.
      }
    }

    const document = await documentService.upload(user, {
      business_object_type: "company_profile",
      business_object_id: company.id,
      owner_user_id: user.id,
      classification: "normal",
      document_type: "company_logo",
      file_name: input.file_name,
      mime_type: input.mime_type.trim().toLowerCase(),
      size_bytes: input.size_bytes,
      file_buffer: input.file_buffer,
      storage_metadata: {
        "x-cloudinary-transformation":
          this.store.documentProcessing.mediaUploads.cloudinaryTransformation,
      },
    });
    const objectUrl =
      stringFromMetadata(document.metadata.cloudinary_url) ??
      stringFromMetadata(document.metadata.object_url);
    company.logo_document_id = document.id;
    company.logo_url =
      objectUrl && /^https?:\/\//iu.test(objectUrl) ? objectUrl : null;
    company.logo_file_name = document.file_name;
    company.logo_mime_type = document.mime_type;
    company.logo_size_bytes = document.size_bytes;
    company.updated_at = nowIso();
    company.version += 1;

    return {
      company: presentCompany(company),
      document,
    };
  }

  updateSessionPreference(actor: AuthUser, input: SessionPreferenceInput) {
    const user = this.store.users.find(
      (candidate) => candidate.id === actor.id && !candidate.deleted_at,
    );
    if (!user) {
      throw unauthorized("User no longer exists");
    }
    const currentPreference = this.repository.sessionPreferenceFor(user.id);
    const nextCompanyId =
      input.company_id === undefined
        ? (currentPreference?.company_id ?? null)
        : input.company_id;
    if (nextCompanyId !== (currentPreference?.company_id ?? null)) {
      this.requireOrgAdminRecoveryPathAfterCompanyChange(
        user,
        currentPreference?.company_id ?? null,
        nextCompanyId,
      );
    }
    this.savePreference(user, input);
    return this.sessionContext(user);
  }

  sessionContext(user: AuthUser): SessionContext {
    const bootstrap = this.createResumeBootstrapToken(user);
    const availableRoles = user.roles.map((role) => ({
      key: role,
      label: role,
      is_active: true,
      permissions: permissionsForRole(role),
    }));
    const preference = this.repository.sessionPreferenceFor(user.id);
    const preferredRole =
      preference && user.roles.includes(preference.active_role as RoleKey)
        ? preference.active_role
        : null;
    const activeRole = availableRoles.find(
      (role) => role.key === preferredRole,
    ) ??
      availableRoles[0] ?? {
        key: Roles.Employee,
        label: Roles.Employee,
        is_active: true,
        permissions: permissionsForRole(Roles.Employee),
      };
    const permissions = unique(permissionsForRole(activeRole.key));
    const company = preference?.company_id
      ? (this.repository.findCompanyById(preference.company_id) ??
        defaultCompany(user))
      : (this.store.companyProfiles.find(
          (candidate) => candidate.status === "active",
        ) ?? defaultCompany(user));
    const timezone =
      preference?.timezone ?? readTimezone(user) ?? company.timezone;
    const locale = preference?.locale ?? company.locale;

    return {
      user,
      active_role: activeRole,
      available_roles: availableRoles,
      permissions,
      navigation: navigationFor(permissions, [activeRole.key]),
      company: {
        id: company.id,
        name: company.company_name,
        timezone,
        logo_document_id: company.logo_document_id,
        logo_url: company.logo_url,
      },
      preferences: {
        active_role: activeRole.key,
        landing_page: preference?.landing_page ?? "/dashboard",
        locale,
        timezone,
      },
      session_metadata: {
        auth_mode: "cookie_or_bearer",
        low_bandwidth_defaults: {
          page_size: 25,
          max_page_size: 100,
          use_include_for_nested_data: true,
        },
      },
      ...(bootstrap
        ? {
            setup_required: true,
            next_step: "company_bootstrap" as const,
            company_id: bootstrap.record.company_id,
            ...devOnly({ company_bootstrap_token: bootstrap.raw }),
          }
        : {}),
    };
  }

  private authenticateEmployeeCode(employeeCode: string): AuthUser {
    const user = this.repository.findUserByEmployeeCode(employeeCode);
    if (!user) {
      throw unauthorized("Invalid email or password");
    }
    return user;
  }

  private authenticatePassword(email: string, password: string): AuthUser {
    const user = this.repository.findUserByEmail(email);
    if (!user) {
      throw unauthorized("Invalid email or password");
    }
    if (user.employment_status !== "active") {
      throw forbidden("User account is inactive or blocked");
    }
    const passwordHash = this.repository.findActivePasswordHash(user.id);
    if (!passwordHash || !verifyPasswordSync(password, passwordHash)) {
      throw unauthorized("Invalid email or password");
    }
    return user;
  }

  private sessionTtlSeconds(): number {
    return Math.max(
      60,
      this.store.adminSecuritySettings.session_timeout_minutes * 60,
    );
  }

  async logout(jti: string): Promise<void> {
    await this.store.sessionStore.revoke(jti, "logout");
  }

  private createPendingUser(input: {
    email: string;
    fullName: string;
    timezone: string;
    now: string;
  }): CoreUser {
    const employeeCode = nextSignupEmployeeCode(this.store);
    const user: CoreUser = {
      id: randomUUID(),
      employee_code: employeeCode,
      email: input.email,
      full_name: input.fullName,
      department_id: seedIds.departmentSales,
      designation_id: seedIds.designationEmployee,
      roles: [Roles.Employee],
      employment_status: EmploymentStatuses.Inactive,
      email_verified_at: null,
      email_verification_status: "pending",
      hierarchy_path: `ONBOARDING.${employeeCode}`,
      manager_user_id: null,
      timezone: input.timezone,
      joined_on: input.now.slice(0, 10),
      terminated_on: null,
      deleted_at: null,
      version: 1,
    };
    this.store.users.push(user);
    return user;
  }

  private createCompanyProfile(
    companyName: string,
    companySlug: string,
    timezone: string,
    locale: string,
    now: string,
  ): CompanyProfileRecord {
    const company: CompanyProfileRecord = {
      id: randomUUID(),
      company_name: companyName,
      company_slug: companySlug,
      website: null,
      industry: null,
      address: null,
      timezone,
      locale,
      currency: "INR",
      fiscal_year_start_month: 4,
      working_week: "Mon-Fri",
      work_hours_per_day: 8,
      logo_label: companyName.slice(0, 2).toUpperCase(),
      logo_document_id: null,
      logo_url: null,
      logo_file_name: null,
      logo_mime_type: null,
      logo_size_bytes: null,
      status: "pending",
      bootstrap_completed_at: null,
      created_at: now,
      updated_at: now,
      version: 1,
    };
    this.store.companyProfiles.push(company);
    return company;
  }

  private applyOnboardingMasterData(
    input: CompanyBootstrapInput,
    companyId: UUID,
    now: string,
  ): void {
    upsertDepartments(
      this.store.departments,
      companyId,
      input.departments ?? [],
    );
    upsertDesignations(
      this.store.designations,
      companyId,
      input.designations ?? [],
    );
    upsertAdminPolicies(this.store.adminPolicies, companyId, now);
  }

  private assignFirstAdminMasterData(user: CoreUser, companyId: UUID): void {
    const department = this.store.departments.find(
      (candidate) =>
        candidate.company_id === companyId &&
        candidate.status === "active" &&
        !candidate.deleted_at,
    );
    const designation = this.store.designations.find(
      (candidate) =>
        candidate.company_id === companyId &&
        candidate.status === "active" &&
        !candidate.deleted_at,
    );
    if (department) {
      user.department_id = department.id;
    }
    if (designation) {
      user.designation_id = designation.id;
    }
  }

  private createToken(input: {
    type: AuthTokenRecord["token_type"];
    userId: UUID | null;
    email: string | null;
    companyId: UUID | null;
    ttlSeconds: number;
    metadata: Record<string, unknown>;
    context?: AuthRequestContext;
  }): GeneratedToken {
    const raw = randomBytes(32).toString("base64url");
    const now = nowIso();
    const record: AuthTokenRecord = {
      id: randomUUID(),
      token_hash: tokenHash(raw),
      token_type: input.type,
      user_id: input.userId,
      email: input.email,
      company_id: input.companyId,
      status: "active",
      expires_at: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
      used_at: null,
      revoked_at: null,
      created_ip_hash: hashContextValue(input.context?.ip),
      user_agent_hash: hashContextValue(input.context?.userAgent),
      last_sent_at: null,
      send_count: 0,
      created_at: now,
      metadata: input.metadata,
    };
    this.store.authTokens.push(record);
    return { raw, record };
  }

  private createResumeBootstrapToken(user: AuthUser): GeneratedToken | null {
    const company = this.pendingBootstrapCompanyForUser(user);
    if (!company) {
      return null;
    }
    return this.createToken({
      type: "company_bootstrap",
      userId: user.id,
      email: user.email,
      companyId: company.id,
      ttlSeconds: 24 * 60 * 60,
      metadata: { reason: "resume_company_bootstrap" },
    });
  }

  private pendingBootstrapCompanyForUser(
    user: AuthUser,
  ): CompanyProfileRecord | null {
    const companyIds = this.store.authTokens
      .filter((token) => token.user_id === user.id && token.company_id)
      .map((token) => token.company_id as UUID);
    for (const companyId of [...new Set(companyIds)].reverse()) {
      const company = this.repository.findCompanyById(companyId);
      if (
        company &&
        !company.bootstrap_completed_at &&
        company.status !== "active"
      ) {
        return company;
      }
    }
    return null;
  }

  private requireActiveToken(
    rawToken: string,
    type: AuthTokenRecord["token_type"],
  ): AuthTokenRecord {
    const token = this.repository.findTokenByHash(tokenHash(rawToken), type);
    if (!token) {
      throw badRequest("Invalid or expired token.");
    }
    if (token.status === "used") {
      throw conflict("Token has already been used.", { token_type: type });
    }
    if (
      token.status !== "active" ||
      Date.parse(token.expires_at) <= Date.now()
    ) {
      token.status = token.status === "active" ? "expired" : token.status;
      throw badRequest("Invalid or expired token.");
    }
    return token;
  }

  private requireTokenUser(token: AuthTokenRecord): CoreUser {
    const user = token.user_id
      ? this.store.users.find(
          (candidate) =>
            candidate.id === token.user_id && !candidate.deleted_at,
        )
      : null;
    if (!user) {
      throw notFound("Token user context not found");
    }
    return user;
  }

  private revokeActiveTokensForUser(
    userId: UUID,
    tokenType: AuthTokenRecord["token_type"],
  ): void {
    const now = nowIso();
    for (const token of this.repository.activeTokensForUser(
      userId,
      tokenType,
    )) {
      token.status = "revoked";
      token.revoked_at = now;
    }
  }

  private verificationTokenTtlSeconds(): number {
    return this.emailDelivery?.verificationTokenTtlSeconds() ?? 24 * 60 * 60;
  }

  private resendCooldownSeconds(): number {
    return this.emailDelivery?.resendCooldownSeconds() ?? 60;
  }

  private checkEmailSendLimit(
    email: string,
    tokenType: AuthTokenRecord["token_type"],
  ):
    | { allowed: true; retryAfterSeconds: number }
    | { allowed: false; retryAfterSeconds: number } {
    const now = Date.now();
    const cooldownSeconds = this.resendCooldownSeconds();
    const cooldownMs = cooldownSeconds * 1000;

    const hourlyLimit = this.emailDelivery?.resendHourlyLimit() ?? 5;
    const dailyLimit = this.emailDelivery?.resendDailyLimit() ?? 10;

    const sends = this.repository
      .tokensForEmail(email, tokenType)
      .map((token) => Date.parse(token.last_sent_at ?? token.created_at))
      .filter((sentAt) => Number.isFinite(sentAt))
      .sort((a, b) => b - a);

    const latest = sends[0] ?? 0;

    if (latest && now - latest < cooldownMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((cooldownMs - (now - latest)) / 1000),
      };
    }

    const hourlySends = sends.filter((sentAt) => now - sentAt < 60 * 60 * 1000);

    if (hourlySends.length >= hourlyLimit) {
      const oldestHourly = Math.min(...hourlySends);

      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((oldestHourly + 60 * 60 * 1000 - now) / 1000),
        ),
      };
    }

    const dailySends = sends.filter(
      (sentAt) => now - sentAt < 24 * 60 * 60 * 1000,
    );

    if (dailySends.length >= dailyLimit) {
      const oldestDaily = Math.min(...dailySends);

      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((oldestDaily + 24 * 60 * 60 * 1000 - now) / 1000),
        ),
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: cooldownSeconds,
    };
  }

  private async sendVerificationEmail(
    input: VerificationEmailSendInput,
  ): Promise<VerificationEmailSendResult> {
    
    if (input.enforceResendLimits) {
      console.log("sendVerificationEmail called");
      const rateLimit = this.checkEmailSendLimit(
        input.email,
        "email_verification",
      );
      console.log(rateLimit);
      if (!rateLimit.allowed) {
        return {
          generated: null,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          deliveryMode: this.emailDelivery?.deliveryMode() ?? "disabled",
          deliveryStatus: null,
        };
      }
    }
    const metadata = input.metadata();
    this.revokeActiveTokensForUser(input.user.id, "email_verification");
    const generated = this.createToken({
      type: "email_verification",
      userId: input.user.id,
      email: input.email,
      companyId: input.company?.id ?? null,
      ttlSeconds: this.verificationTokenTtlSeconds(),
      metadata,
      context: input.context,
    });
    const delivery = await this.emailDelivery?.queueVerificationEmail({
      user: input.user,
      token: generated.record,
      rawToken: generated.raw,
      companyName:
        input.company?.company_name ?? defaultCompany(input.user).company_name,
    });
    return {
      generated,
      retryAfterSeconds: this.resendCooldownSeconds(),
      deliveryMode: this.emailDelivery?.deliveryMode() ?? "disabled",
      deliveryStatus: delivery?.status ?? "not_configured",
    };
  }

  private signupVerificationResponse(
    user: CoreUser,
    email: string,
    verification: VerificationEmailSendResult,
  ) {
    return {
      signup_id: user.id,
      verification_required: true,
      masked_email: maskEmail(email),
      next_step: "verify_email",
      retry_after_seconds: verification.retryAfterSeconds,
      email_delivery_mode: verification.deliveryMode,
      email_delivery_status: verification.deliveryStatus,
      email_delivery_notice: emailDeliveryNotice(
        verification.deliveryMode,
        verification.deliveryStatus,
      ),
      ...devOnly({
        email_verification_token: verification.generated?.raw ?? null,
      }),
    };
  }

  private companyForVerification(
    user: CoreUser,
    email: string,
    companySlug?: string,
  ): CompanyProfileRecord | null {
    if (companySlug) {
      const company = this.repository.findCompanyBySlug(companySlug);
      if (company) {
        return company;
      }
    }
    const tokenCompanyId = [...this.store.authTokens]
      .reverse()
      .find(
        (token) =>
          token.token_type === "email_verification" &&
          token.user_id === user.id &&
          token.email?.toLowerCase() === email.toLowerCase() &&
          token.company_id,
      )?.company_id;
    return tokenCompanyId
      ? this.repository.findCompanyById(tokenCompanyId)
      : null;
  }

  private setCredential(
    userId: UUID,
    passwordHash: string,
    now: string,
  ): UserCredentialRecord {
    const existing = this.store.userCredentials.find(
      (credential) => credential.user_id === userId && !credential.deleted_at,
    );
    if (existing) {
      existing.password_hash = passwordHash;
      existing.status = "active";
      existing.updated_at = now;
      return existing;
    }
    const credential: UserCredentialRecord = {
      id: randomUUID(),
      user_id: userId,
      password_hash: passwordHash,
      status: "active",
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    this.store.userCredentials.push(credential);
    return credential;
  }

  private savePreference(
    user: CoreUser,
    input: SessionPreferenceInput,
  ): UserSessionPreferenceRecord {
    const current = this.repository.sessionPreferenceFor(user.id);
    const activeRole = (input.active_role_id ??
      input.active_role ??
      current?.active_role ??
      user.roles[0] ??
      Roles.Employee) as RoleKey;
    if (!user.roles.includes(activeRole)) {
      throw forbidden("Selected role is not assigned to this user.", {
        active_role: activeRole,
      });
    }
    if (
      input.company_id &&
      !this.repository.findCompanyById(input.company_id)
    ) {
      throw notFound("Company not found", { company_id: input.company_id });
    }
    const now = nowIso();
    const preference: UserSessionPreferenceRecord = {
      id: current?.id ?? randomUUID(),
      user_id: user.id,
      active_role: activeRole,
      company_id:
        input.company_id === undefined
          ? (current?.company_id ?? null)
          : input.company_id,
      landing_page: input.landing_page ?? current?.landing_page ?? "/dashboard",
      locale: input.locale ?? current?.locale ?? "en-IN",
      timezone:
        input.timezone ??
        current?.timezone ??
        readTimezone(user) ??
        "Asia/Kolkata",
      created_at: current?.created_at ?? now,
      updated_at: now,
      version: (current?.version ?? 0) + 1,
    };
    return this.repository.upsertSessionPreference(preference);
  }

  private requireOrgAdminRecoveryPathAfterCompanyChange(
    user: CoreUser,
    currentCompanyId: UUID | null,
    nextCompanyId: UUID | null,
  ): void {
    if (!user.roles.includes(Roles.Admin)) {
      return;
    }
    if (
      this.companyRecoveryAdminCountAfterPreferenceChange(
        user.id,
        currentCompanyId,
        nextCompanyId,
      ) > 0
    ) {
      return;
    }
    throw conflict(
      "At least one active Admin with login access must remain in this organization.",
    );
  }

  private companyRecoveryAdminCountAfterPreferenceChange(
    userId: UUID,
    currentCompanyId: UUID | null,
    nextCompanyId: UUID | null,
  ): number {
    return this.store.users.filter((candidate) => {
      if (
        candidate.deleted_at ||
        !candidate.roles.includes(Roles.Admin) ||
        candidate.employment_status !== EmploymentStatuses.Active
      ) {
        return false;
      }
      const candidateCompanyId =
        candidate.id === userId
          ? nextCompanyId
          : (this.repository.sessionPreferenceFor(candidate.id)?.company_id ??
            null);
      if (candidateCompanyId !== currentCompanyId) {
        return false;
      }
      return this.hasLoginRecoveryAccess(candidate.id);
    }).length;
  }

  private hasLoginRecoveryAccess(userId: UUID): boolean {
    if (this.repository.findActiveCredential(userId)) {
      return true;
    }
    return this.store.authTokens.some(
      (token) =>
        token.user_id === userId &&
        token.token_type === "password_setup" &&
        token.status === "active" &&
        Date.parse(token.expires_at) > Date.now(),
    );
  }
}

function permissionsForRole(role: string): string[] {
  switch (role) {
    case Roles.Admin:
      return Object.values(Permissions);
    case Roles.FinanceManager:
      return [
        Permissions.ExpenseFinanceApprove,
        Permissions.ExpenseFinance,
        Permissions.ReportRead,
        Permissions.DocumentRead,
      ];
    case Roles.Reviewer:
    case Roles.Director:
      return [
        Permissions.ExpenseCreate,
        Permissions.ExpenseManagerVerify,
        Permissions.ReportRead,
        Permissions.DocumentRead,
      ];
    case Roles.Auditor:
      return [
        Permissions.ExpenseAudit,
        Permissions.ReportRead,
        Permissions.DocumentRead,
      ];
    case Roles.AssetManager:
      return [
        Permissions.AssetManage,
        Permissions.DocumentRead,
        Permissions.ReportRead,
      ];
    case Roles.HRManager:
      return [Permissions.ReportRead, Permissions.DocumentRead];
    case Roles.Employee:
    default:
      return [Permissions.ExpenseCreate, Permissions.DocumentRead];
  }
}

function navigationFor(
  permissions: readonly string[],
  roles: readonly string[],
): SessionNavigationItem[] {
  const permissionSet = new Set(permissions);
  const items: SessionNavigationItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      path: "/dashboard",
      permission: null,
    },
    {
      key: "my-expenses",
      label: "My Expenses",
      path: "/expenses",
      permission: Permissions.ExpenseCreate,
    },
    {
      key: "documents",
      label: "Documents",
      path: "/documents",
      permission: Permissions.DocumentRead,
    },
  ];
  if (permissionSet.has(Permissions.ExpenseManagerVerify)) {
    items.push({
      key: "manager-expenses",
      label: "Expense Approvals",
      path: "/expenses/review",
      permission: Permissions.ExpenseManagerVerify,
    });
  }
  if (permissionSet.has(Permissions.ExpenseFinance)) {
    items.push({
      key: "finance",
      label: "Finance",
      path: "/expenses/finance",
      permission: Permissions.ExpenseFinance,
    });
  }
  if (permissionSet.has(Permissions.AssetManage)) {
    items.push({
      key: "assets",
      label: "Assets",
      path: "/assets",
      permission: Permissions.AssetManage,
    });
  }
  if (permissionSet.has(Permissions.ReportRead)) {
    items.push({
      key: "reports",
      label: "Reports",
      path: "/reports",
      permission: Permissions.ReportRead,
    });
  }
  if (roles.includes(Roles.Admin) || permissionSet.has(Permissions.Admin)) {
    items.push({
      key: "admin-settings",
      label: "Admin Settings",
      path: "/admin-settings",
      permission: Permissions.Admin,
    });
  }
  return items.filter(
    (item) => item.permission === null || permissionSet.has(item.permission),
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueRoles(values: readonly RoleKey[]): RoleKey[] {
  return [...new Set(values)];
}

function assertPasswordMatchesSecurityPolicy(
  password: string,
  policy: AdminSecuritySettingsRecord,
): void {
  const errors: string[] = [];
  if (password.length < policy.password_min_length) {
    errors.push(
      `Password must be at least ${policy.password_min_length} characters.`,
    );
  }
  if (!/[A-Z]/u.test(password)) {
    errors.push("Password must include an uppercase letter.");
  }
  if (!/[a-z]/u.test(password)) {
    errors.push("Password must include a lowercase letter.");
  }
  if (policy.password_require_number && !/[0-9]/u.test(password)) {
    errors.push("Password must include a number.");
  }
  if (policy.password_require_special && !/[^A-Za-z0-9]/u.test(password)) {
    errors.push("Password must include a special character.");
  }
  if (errors.length > 0) {
    throw badRequest("Password does not meet the current security policy.", {
      errors,
    });
  }
}

function readTimezone(user: AuthUser): string | null {
  return "timezone" in user && typeof user.timezone === "string"
    ? user.timezone
    : null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const prefix = local.slice(0, 2) || "**";
  return `${prefix}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || "hrms";
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashContextValue(value: string | undefined): string | null {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

function nextSignupEmployeeCode(store: MemoryDataStore): string {
  let index = store.users.length + 1;
  let code = `ONB${String(index).padStart(4, "0")}`;
  while (store.users.some((user) => user.employee_code === code)) {
    index += 1;
    code = `ONB${String(index).padStart(4, "0")}`;
  }
  return code;
}

function devOnly(value: Record<string, unknown>): Record<string, unknown> {
  const appEnv =
    process.env.APP_ENV ??
    (process.env.NODE_ENV === "production" ? "production" : "local");
  return ["local", "development"].includes(appEnv) ? { dev_only: value } : {};
}

function emailDeliveryNotice(
  mode: EmailDeliveryMode,
  status: VerificationEmailSendResult["deliveryStatus"],
): string | null {
  if (
    mode === "disabled" ||
    status === "disabled" ||
    status === "not_configured"
  ) {
    return "Email delivery is disabled for this environment. Ask an administrator to complete verification, or use the development setup shortcut in dev.";
  }
  if (mode === "log") {
    return "Email delivery is in log mode for this environment. Use the development setup shortcut, or ask an administrator to inspect the generated verification link.";
  }
  if (status === "failed") {
    return "The verification email could not be sent. Ask an administrator to check the email delivery configuration.";
  }
  return null;
}

function upsertDepartments(
  departments: Department[],
  companyId: UUID,
  names: readonly string[],
): void {
  for (const name of uniqueMasterNames(names)) {
    const existing = departments.find(
      (department) =>
        department.company_id === companyId &&
        sameMasterName(department.name, name),
    );
    if (existing) {
      if (
        existing.name !== name ||
        existing.status !== "active" ||
        existing.deleted_at !== null
      ) {
        existing.name = name;
        existing.status = "active";
        existing.deleted_at = null;
        existing.version += 1;
      }
      continue;
    }
    departments.push({
      id: randomUUID(),
      company_id: companyId,
      department_code: uniqueMasterCode(
        name,
        departments
          .filter((department) => department.company_id === companyId)
          .map((department) => department.department_code),
        "DEPT",
      ),
      name,
      cost_center: null,
      parent_department_id: null,
      director_user_id: null,
      status: "active",
      deleted_at: null,
      version: 1,
    });
  }
}

function upsertDesignations(
  designations: Designation[],
  companyId: UUID,
  names: readonly string[],
): void {
  for (const [index, name] of uniqueMasterNames(names).entries()) {
    const existing = designations.find(
      (designation) =>
        designation.company_id === companyId &&
        sameMasterName(designation.title, name),
    );
    if (existing) {
      if (
        existing.title !== name ||
        existing.status !== "active" ||
        existing.deleted_at !== null
      ) {
        existing.title = name;
        existing.status = "active";
        existing.deleted_at = null;
        existing.version += 1;
      }
      continue;
    }
    designations.push({
      id: randomUUID(),
      company_id: companyId,
      designation_code: uniqueMasterCode(
        name,
        designations
          .filter((designation) => designation.company_id === companyId)
          .map((designation) => designation.designation_code),
        "DESG",
      ),
      title: name,
      level: index + 1,
      status: "active",
      deleted_at: null,
      version: 1,
    });
  }
}

function upsertAdminPolicies(
  policies: AdminPolicyConfigRecord[],
  companyId: UUID,
  now: string,
): void {
  const existingKeys = new Set(
    policies
      .filter((policy) => policy.company_id === companyId && !policy.deleted_at)
      .map((policy) => policy.policy_key),
  );
  for (const policy of buildDefaultAdminPolicies(now, companyId)) {
    if (!existingKeys.has(policy.policy_key)) {
      policies.push(policy);
    }
  }
}

function uniqueMasterNames(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = value.trim().replace(/\s+/gu, " ");
    const key = normalizedMasterName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function sameMasterName(left: string, right: string): boolean {
  return normalizedMasterName(left) === normalizedMasterName(right);
}

function normalizedMasterName(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function uniqueMasterCode(
  name: string,
  existingCodes: readonly string[],
  fallback: string,
): string {
  const existing = new Set(existingCodes.map((code) => code.toUpperCase()));
  const base = (
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu, "_")
      .replace(/^_+|_+$/gu, "") || fallback
  ).slice(0, 36);
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    const suffix = `_${index}`;
    candidate = `${base.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    index += 1;
  }
  return candidate;
}

function presentCompany(company: CompanyProfileRecord) {
  return {
    id: company.id,
    company_name: company.company_name,
    company_slug: company.company_slug,
    website: company.website,
    industry: company.industry,
    address: company.address,
    timezone: company.timezone,
    locale: company.locale,
    currency: company.currency,
    fiscal_year_start_month: company.fiscal_year_start_month,
    working_week: company.working_week,
    work_hours_per_day: company.work_hours_per_day,
    logo_label: company.logo_label,
    logo_document_id: company.logo_document_id,
    logo_url: company.logo_url,
    logo_file_name: company.logo_file_name,
    logo_mime_type: company.logo_mime_type,
    logo_size_bytes: company.logo_size_bytes,
    status: company.status,
    bootstrap_completed_at: company.bootstrap_completed_at,
    version: company.version,
  };
}

function presentUser(user: CoreUser) {
  return {
    id: user.id,
    employee_code: user.employee_code,
    email: user.email,
    full_name: user.full_name,
    roles: user.roles,
    employment_status: user.employment_status,
    email_verified_at: user.email_verified_at ?? null,
    email_verification_status: user.email_verification_status ?? "unverified",
    version: user.version,
  };
}

function isPendingEmailVerification(user: CoreUser): boolean {
  const status = user.email_verification_status ?? "unverified";
  return (
    user.employment_status === EmploymentStatuses.Inactive &&
    (status === "pending" || status === "unverified")
  );
}

function defaultCompany(user: AuthUser): CompanyProfileRecord {
  return {
    id: "local-hawkaii-hrms",
    company_name: "Hawkaii HRMS",
    company_slug: "hawkaii-hrms",
    website: null,
    industry: null,
    address: null,
    timezone: readTimezone(user) ?? "Asia/Kolkata",
    locale: "en-IN",
    currency: "INR",
    fiscal_year_start_month: 4,
    working_week: "Mon-Fri",
    work_hours_per_day: 8,
    logo_label: "HK",
    logo_document_id: null,
    logo_url: null,
    logo_file_name: null,
    logo_mime_type: null,
    logo_size_bytes: null,
    status: "active",
    bootstrap_completed_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    version: 1,
  };
}

function stringFromMetadata(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
