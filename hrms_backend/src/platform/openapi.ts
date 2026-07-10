import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";

type JsonSchema = Record<string, unknown>;
type RouteSchema = Record<string, unknown>;
type SwaggerTransformObjectInput = Parameters<NonNullable<FastifyDynamicSwaggerOptions["transformObject"]>>[0];

const uuid = (description: string, example = "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001"): JsonSchema => ({
  type: "string",
  format: "uuid",
  description,
  example
});

const date = (description: string, example = "2026-05-04"): JsonSchema => ({
  type: "string",
  format: "date",
  description,
  example
});

const dateTime = (description: string, example = "2026-05-04T10:00:00.000Z"): JsonSchema => ({
  type: "string",
  format: "date-time",
  description,
  example
});

const money = (description: string, example = "12500.00"): JsonSchema => ({
  type: "string",
  pattern: "^-?\\d{1,12}(\\.\\d{1,2})?$",
  description,
  example
});

const optionalString = (description: string, example: string): JsonSchema => ({
  type: "string",
  description,
  example
});

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: uuid("Resource UUID path parameter")
  }
};

const userIdParamSchema = {
  type: "object",
  required: ["user_id"],
  properties: {
    user_id: uuid("Employee user UUID path parameter")
  }
};

const workflowKeyParamSchema = {
  type: "object",
  required: ["workflow_key"],
  properties: {
    workflow_key: {
      type: "string",
      enum: ["leave", "wfh", "timesheet", "expense", "asset_request", "helpdesk_escalation"],
      example: "leave"
    }
  }
};

const policyKeyParamSchema = {
  type: "object",
  required: ["policy_key"],
  properties: {
    policy_key: {
      type: "string",
      enum: ["attendance", "leave", "timesheet", "expense", "asset", "sla"],
      example: "attendance"
    }
  }
};

const emailTemplateKeyParamSchema = {
  type: "object",
  required: ["template_key"],
  properties: {
    template_key: {
      type: "string",
      enum: ["invite", "verify", "reset", "leave", "expense", "ts_reminder", "ticket_update"],
      example: "invite"
    }
  }
};

const expenseDocumentParamSchema = {
  type: "object",
  required: ["id", "documentId"],
  properties: {
    id: uuid("Expense ticket UUID path parameter"),
    documentId: uuid("Expense document or document metadata UUID path parameter")
  }
};

const qrHashParamSchema = {
  type: "object",
  required: ["qr_hash"],
  properties: {
    qr_hash: {
      type: "string",
      minLength: 1,
      description: "Public QR/hash lookup value.",
      example: "release-qr-hash-lap-available"
    }
  }
};

const paginationQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1, default: 1, description: "1-based page number." },
    page_size: { type: "integer", minimum: 1, maximum: 100, default: 25, description: "Items per page." },
    sort: { type: "string", maxLength: 64, description: "Optional sort key supported by the endpoint." }
  }
};

const expectedVersionBodySchema = {
  type: "object",
  required: ["expected_version"],
  properties: {
    expected_version: { type: "integer", minimum: 1, description: "Optimistic concurrency version from the latest aggregate read.", example: 3 }
  }
};

const authSecurity = [{ sessionCookie: [] }, { bearerAuth: [] }];

const errorResponseSchema = {
  type: "object",
  required: ["code", "message", "request_id"],
  properties: {
    code: { type: "string", example: "VALIDATION_FAILED" },
    message: { type: "string", example: "Request validation failed" },
    details: {
      type: "object",
      additionalProperties: true,
      description: "Optional structured error details, including Zod formErrors/fieldErrors for validation failures."
    },
    request_id: { type: "string", example: "601fe7b7-6361-463e-ae66-5d972673dd27" }
  },
  additionalProperties: false
};

const conflictResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    code: { type: "string", example: "WORKFLOW_CONFLICT" },
    message: { type: "string", example: "The ticket was modified by another actor. Refresh and retry." }
  }
};

const rateLimitResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    code: { type: "string", example: "TOO_MANY_REQUESTS" },
    message: { type: "string", example: "Too many requests. Please wait and try again." },
    details: {
      type: "object",
      required: ["retry_after_seconds"],
      properties: {
        retry_after_seconds: { type: "integer", minimum: 1, example: 60 }
      },
      additionalProperties: true
    }
  }
};

const statusResponseSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", example: "ok" }
  },
  additionalProperties: true
};


const authDevOnlySchema = {
  type: "object",
  nullable: true,
  description: "Local/QA only token echo for automated testing. Production responses omit this object.",
  additionalProperties: true
};

const signupBodySchema = {
  type: "object",
  required: ["company_name", "full_name", "email"],
  properties: {
    company_name: { type: "string", minLength: 2, maxLength: 120, example: "Acme HRMS" },
    company_slug: { type: "string", minLength: 2, maxLength: 80, example: "acme-hrms" },
    full_name: { type: "string", minLength: 2, maxLength: 160, example: "Asha Founder" },
    email: { type: "string", format: "email", example: "asha.founder@example.test" },
    password: { type: "string", format: "password", minLength: 10, maxLength: 128, description: "Optional. If omitted, verify-email returns a password setup token/action." },
    timezone: { type: "string", default: "Asia/Kolkata", example: "Asia/Kolkata" },
    locale: { type: "string", default: "en-IN", example: "en-IN" },
    invite_token: { type: "string", description: "Reserved for invited employee onboarding.", example: "invite-token-from-email" }
  },
  additionalProperties: false
};

const signupResponseSchema = {
  type: "object",
  required: ["signup_id", "verification_required", "masked_email", "next_step", "retry_after_seconds"],
  properties: {
    signup_id: uuid("Signup/user context UUID"),
    verification_required: { type: "boolean", example: true },
    masked_email: { type: "string", example: "as**********@example.test" },
    next_step: { type: "string", enum: ["verify_email"], example: "verify_email" },
    retry_after_seconds: { type: "integer", minimum: 1, example: 60 },
    dev_only: authDevOnlySchema
  },
  additionalProperties: true
};

const verifyEmailBodySchema = {
  type: "object",
  required: ["token"],
  properties: {
    token: { type: "string", minLength: 16, description: "Email verification token from backend-delivered email link." },
    email: { type: "string", format: "email", description: "Optional UX correlation check.", example: "asha.founder@example.test" }
  },
  additionalProperties: false
};

const verifyEmailResponseSchema = {
  type: "object",
  required: ["verified", "user_id", "company_id", "login_allowed", "next_step"],
  properties: {
    verified: { type: "boolean", example: true },
    user_id: uuid("Verified user UUID"),
    company_id: { ...uuid("Company UUID"), nullable: true },
    login_allowed: { type: "boolean", example: true },
    next_step: { type: "string", enum: ["login", "set_password", "company_bootstrap"], example: "company_bootstrap" },
    dev_only: authDevOnlySchema
  },
  additionalProperties: true
};

const resendEmailVerificationBodySchema = {
  type: "object",
  required: ["email"],
  properties: {
    email: { type: "string", format: "email", example: "asha.founder@example.test" },
    company_slug: { type: "string", example: "acme-hrms" }
  },
  additionalProperties: false
};

const resendEmailVerificationResponseSchema = {
  type: "object",
  required: ["accepted", "masked_email", "retry_after_seconds"],
  properties: {
    accepted: { type: "boolean", example: true },
    masked_email: { type: "string", example: "as**********@example.test" },
    retry_after_seconds: { type: "integer", minimum: 1, example: 60 },
    dev_only: authDevOnlySchema
  },
  additionalProperties: true
};

const passwordSetBodySchema = {
  type: "object",
  required: ["token", "password", "confirm_password"],
  properties: {
    token: { type: "string", minLength: 16, description: "Password setup/reset token from email." },
    password: { type: "string", format: "password", minLength: 10, maxLength: 128, example: "ResetPass123" },
    confirm_password: { type: "string", format: "password", example: "ResetPass123" }
  },
  additionalProperties: false
};

const setPasswordResponseSchema = {
  type: "object",
  required: ["password_set", "login_allowed", "user_id", "next_step"],
  properties: {
    password_set: { type: "boolean", example: true },
    login_allowed: { type: "boolean", example: true },
    user_id: uuid("User UUID"),
    next_step: { type: "string", enum: ["login"], example: "login" }
  },
  additionalProperties: true
};

const passwordResetRequestResponseSchema = {
  type: "object",
  required: ["accepted", "masked_email", "retry_after_seconds"],
  properties: {
    accepted: { type: "boolean", example: true },
    masked_email: { type: "string", example: "e*@example.test" },
    retry_after_seconds: { type: "integer", minimum: 1, example: 60 },
    dev_only: authDevOnlySchema
  },
  additionalProperties: true
};

const passwordResetConfirmResponseSchema = {
  type: "object",
  required: ["password_reset", "session_revoked_count", "next_step"],
  properties: {
    password_reset: { type: "boolean", example: true },
    session_revoked_count: { type: "integer", minimum: 0, example: 1 },
    next_step: { type: "string", enum: ["login"], example: "login" }
  },
  additionalProperties: true
};

const companyBootstrapBodySchema = {
  type: "object",
  required: ["bootstrap_token"],
  properties: {
    bootstrap_token: { type: "string", minLength: 16, description: "One-time company bootstrap token issued after email verification." },
    company_profile: {
      type: "object",
      properties: {
        company_name: { type: "string", example: "Acme HRMS India" },
        timezone: { type: "string", example: "Asia/Kolkata" },
        locale: { type: "string", example: "en-IN" },
        fiscal_year_start_month: { type: "integer", minimum: 1, maximum: 12, example: 4 }
      },
      additionalProperties: false
    },
    first_admin_profile: {
      type: "object",
      properties: {
        full_name: { type: "string", example: "Asha Admin" },
        landing_page: { type: "string", example: "/admin-settings" }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

const companyLogoUploadBodySchema = {
  type: "object",
  required: ["bootstrap_token", "file"],
  properties: {
    bootstrap_token: { type: "string", minLength: 16, description: "Active company bootstrap token issued after email verification." },
    file: { type: "string", format: "binary", description: "Company logo image. Backend media upload policy controls type, compression, and size." }
  },
  additionalProperties: false
};

const adminCompanyLogoUploadBodySchema = {
  type: "object",
  required: ["file"],
  properties: {
    file: { type: "string", format: "binary", description: "Company logo image. Backend company-logo policy controls type, compression dimensions, and size." }
  },
  additionalProperties: false
};

const companyBootstrapResponseSchema = {
  type: "object",
  required: ["company", "admin_user", "setup_progress", "next_steps", "preferences"],
  properties: {
    company: { type: "object", additionalProperties: true },
    admin_user: { type: "object", additionalProperties: true },
    setup_progress: { type: "object", additionalProperties: true },
    next_steps: { type: "array", items: { type: "string" }, example: ["login", "configure_core_master_data"] },
    preferences: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const sessionPreferenceBodySchema = {
  type: "object",
  properties: {
    active_role_id: { type: "string", description: "Role key/label assigned to the current user.", example: "Admin" },
    active_role: { type: "string", description: "Alias for active_role_id.", example: "Finance Manager" },
    company_id: { ...uuid("Company UUID"), nullable: true },
    landing_page: { type: "string", example: "/dashboard" },
    locale: { type: "string", example: "en-IN" },
    timezone: { type: "string", example: "Asia/Kolkata" }
  },
  additionalProperties: false
};

const authUserSchema = {
  type: "object",
  required: ["id", "employee_code", "email", "full_name", "roles"],
  properties: {
    id: uuid("Authenticated user UUID"),
    employee_code: { type: "string", example: "N1" },
    email: { type: "string", format: "email", example: "finance@example.test" },
    full_name: { type: "string", example: "Finance Manager" },
    department_id: uuid("Department UUID"),
    designation_id: uuid("Designation UUID"),
    manager_user_id: { ...uuid("Manager user UUID"), nullable: true },
    hierarchy_path: { type: "string", example: "CEO.FIN.N1" },
    employment_status: { type: "string", example: "active" },
    email_verified_at: { type: "string", format: "date-time", nullable: true, example: "2026-01-01T00:00:00.000Z" },
    email_verification_status: { type: "string", enum: ["unverified", "pending", "verified", "bounced", "blocked"], example: "verified" },
    timezone: { type: "string", example: "Asia/Kolkata" },
    roles: { type: "array", items: { type: "string" }, example: ["Finance Manager"] }
  },
  additionalProperties: true
};

const sessionRoleSchema = {
  type: "object",
  required: ["key", "label", "is_active", "permissions"],
  properties: {
    key: { type: "string", example: "Finance Manager" },
    label: { type: "string", example: "Finance Manager" },
    is_active: { type: "boolean", example: true },
    permissions: { type: "array", items: { type: "string" }, example: ["expense:finance"] }
  },
  additionalProperties: false
};

const navigationItemSchema = {
  type: "object",
  required: ["key", "label", "path", "permission"],
  properties: {
    key: { type: "string", example: "finance" },
    label: { type: "string", example: "Finance" },
    path: { type: "string", example: "/expenses/finance" },
    permission: { type: "string", nullable: true, example: "expense:finance" }
  },
  additionalProperties: false
};

const authSessionContextSchema = {
  type: "object",
  required: ["user", "active_role", "available_roles", "permissions", "navigation", "company", "preferences", "session_metadata"],
  properties: {
    user: authUserSchema,
    active_role: sessionRoleSchema,
    available_roles: { type: "array", items: sessionRoleSchema },
    permissions: { type: "array", items: { type: "string" }, example: ["expense:finance", "report:read"] },
    navigation: { type: "array", items: navigationItemSchema },
    company: {
      type: "object",
      required: ["id", "name", "timezone"],
      properties: {
        id: { type: "string", example: "local-hawkaii-hrms" },
        name: { type: "string", example: "HRMS" },
        timezone: { type: "string", example: "Asia/Kolkata" }
      },
      additionalProperties: false
    },
    preferences: {
      type: "object",
      required: ["active_role", "landing_page", "locale", "timezone"],
      properties: {
        active_role: { type: "string", example: "Finance Manager" },
        landing_page: { type: "string", example: "/dashboard" },
        locale: { type: "string", example: "en-IN" },
        timezone: { type: "string", example: "Asia/Kolkata" }
      },
      additionalProperties: false
    },
    session_metadata: {
      type: "object",
      required: ["auth_mode", "low_bandwidth_defaults"],
      properties: {
        auth_mode: { type: "string", example: "cookie_or_bearer" },
        low_bandwidth_defaults: {
          type: "object",
          required: ["page_size", "max_page_size", "use_include_for_nested_data"],
          properties: {
            page_size: { type: "integer", example: 25 },
            max_page_size: { type: "integer", example: 100 },
            use_include_for_nested_data: { type: "boolean", example: true }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

const adminCompanyProfileSchema = {
  type: "object",
  required: [
    "id",
    "company_name",
    "company_slug",
    "timezone",
    "locale",
    "currency",
    "fiscal_year_start_month",
    "working_week",
    "work_hours_per_day",
    "status",
    "updated_at",
    "version"
  ],
  properties: {
    id: uuid("Company profile UUID"),
    company_name: { type: "string", example: "Hawkaii HRMS" },
    company_slug: { type: "string", example: "hawkaii-hrms" },
    name: { type: "string", example: "Hawkaii HRMS" },
    website: { type: "string", nullable: true, example: "https://hawkaii.com" },
    industry: { type: "string", nullable: true, example: "Software / SaaS" },
    address: { type: "string", nullable: true, example: "Bengaluru" },
    timezone: { type: "string", example: "Asia/Kolkata" },
    locale: { type: "string", example: "en-IN" },
    currency: { type: "string", example: "INR" },
    fiscal_year_start_month: { type: "integer", minimum: 1, maximum: 12, example: 4 },
    financial_year_start: { type: "string", example: "April" },
    working_week: { type: "string", example: "Mon-Fri" },
    work_hours_per_day: { type: "number", minimum: 1, maximum: 24, example: 8 },
    work_hours: { type: "number", minimum: 1, maximum: 24, example: 8 },
    logo_label: { type: "string", nullable: true, example: "HK" },
    logoLabel: { type: "string", nullable: true, example: "HK" },
    logo_document_id: { ...uuid("Company logo document UUID"), nullable: true },
    logoDocumentId: { ...uuid("Company logo document UUID"), nullable: true },
    logo_url: { type: "string", nullable: true, example: "https://res.cloudinary.com/example/image/upload/hawkaii-hrms/company-logo.jpg" },
    logoUrl: { type: "string", nullable: true, example: "https://res.cloudinary.com/example/image/upload/hawkaii-hrms/company-logo.jpg" },
    logo_file_name: { type: "string", nullable: true, example: "company-logo.jpg" },
    logo_mime_type: { type: "string", nullable: true, example: "image/jpeg" },
    logo_size_bytes: { type: "integer", nullable: true, minimum: 0, example: 48120 },
    status: { type: "string", enum: ["pending", "active", "inactive"], example: "active" },
    bootstrap_completed_at: { ...dateTime("Bootstrap completion timestamp"), nullable: true },
    updated_at: dateTime("Last update timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const adminCompanyProfileUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    company_name: { type: "string", minLength: 2, maxLength: 160, example: "Hawkaii HRMS India" },
    website: { type: "string", nullable: true, maxLength: 240, example: "https://hawkaii.com" },
    industry: { type: "string", nullable: true, maxLength: 160, example: "Software / SaaS" },
    address: { type: "string", nullable: true, maxLength: 1000, example: "Bengaluru" },
    timezone: { type: "string", minLength: 2, maxLength: 80, example: "Asia/Kolkata" },
    locale: { type: "string", minLength: 2, maxLength: 20, example: "en-IN" },
    currency: { type: "string", minLength: 2, maxLength: 64, example: "INR" },
    fiscal_year_start_month: { type: "integer", minimum: 1, maximum: 12, example: 4 },
    working_week: { type: "string", minLength: 3, maxLength: 40, example: "Mon-Fri" },
    work_hours_per_day: { type: "number", minimum: 1, maximum: 24, example: 8 },
    logo_label: { type: "string", nullable: true, maxLength: 8, example: "HK" },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminMasterDataQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    active_only: { type: "boolean", description: "When true, return only active rows.", example: true },
    search: { type: "string", maxLength: 160, description: "Search by code or display name.", example: "Sales" }
  }
};

const adminDepartmentSchema = {
  type: "object",
  required: ["id", "department_code", "code", "name", "status", "active", "version"],
  properties: {
    id: uuid("Department UUID"),
    department_code: { type: "string", example: "SALES" },
    code: { type: "string", example: "SALES" },
    name: { type: "string", example: "Sales" },
    parent_department_id: { ...uuid("Parent department UUID"), nullable: true },
    parent_id: { ...uuid("Parent department UUID"), nullable: true },
    director_user_id: { ...uuid("Director user UUID"), nullable: true },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    deleted_at: { ...dateTime("Soft-delete timestamp"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminDesignationSchema = {
  type: "object",
  required: ["id", "designation_code", "code", "title", "name", "status", "active", "version"],
  properties: {
    id: uuid("Designation UUID"),
    designation_code: { type: "string", example: "ENGINEER" },
    code: { type: "string", example: "ENGINEER" },
    title: { type: "string", example: "Engineer" },
    name: { type: "string", example: "Engineer" },
    level: { type: "integer", nullable: true, minimum: 0, maximum: 100, example: 3 },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    deleted_at: { ...dateTime("Soft-delete timestamp"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminDepartmentCreateBody = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "Engineering" },
    code: { type: "string", minLength: 2, maxLength: 40, example: "ENG" },
    department_code: { type: "string", minLength: 2, maxLength: 40, example: "ENG" },
    parent_id: { ...uuid("Parent department UUID"), nullable: true },
    parent_department_id: { ...uuid("Parent department UUID"), nullable: true },
    status: { type: "string", enum: ["active", "inactive"], example: "active" }
  },
  additionalProperties: false
};

const adminDepartmentUpdateBody = {
  ...adminDepartmentCreateBody,
  required: ["expected_version"],
  properties: {
    ...adminDepartmentCreateBody.properties,
    expected_version: { type: "integer", minimum: 1, example: 1 }
  }
};

const adminDesignationCreateBody = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "Engineer" },
    title: { type: "string", minLength: 2, maxLength: 160, example: "Engineer" },
    code: { type: "string", minLength: 2, maxLength: 40, example: "ENGINEER" },
    designation_code: { type: "string", minLength: 2, maxLength: 40, example: "ENGINEER" },
    level: { type: "integer", nullable: true, minimum: 0, maximum: 100, example: 3 },
    status: { type: "string", enum: ["active", "inactive"], example: "active" }
  },
  additionalProperties: false
};

const adminDesignationUpdateBody = {
  ...adminDesignationCreateBody,
  required: ["expected_version"],
  properties: {
    ...adminDesignationCreateBody.properties,
    expected_version: { type: "integer", minimum: 1, example: 1 }
  }
};

const adminExtendedMasterDataKeyParamSchema = {
  type: "object",
  required: ["master_key"],
  properties: {
    master_key: {
      type: "string",
      enum: [
        "employmentTypes",
        "workLocations",
        "shifts",
        "leaveTypes",
        "expenseCategories",
        "assetCategories",
        "helpdeskCategories",
        "projectRoles"
      ],
      example: "employmentTypes"
    }
  }
};

const adminExtendedMasterDataIdParamSchema = {
  type: "object",
  required: ["master_key", "id"],
  properties: {
    ...adminExtendedMasterDataKeyParamSchema.properties,
    id: uuid("Master data item UUID")
  }
};

const adminExtendedMasterDataSchema = {
  type: "object",
  required: ["id", "master_key", "key", "code", "name", "status", "active", "sort_order", "metadata", "updated_at", "version"],
  properties: {
    id: uuid("Master data item UUID"),
    master_key: { type: "string", example: "employmentTypes" },
    key: { type: "string", example: "employmentTypes" },
    code: { type: "string", example: "FULL_TIME" },
    name: { type: "string", example: "Full-time" },
    description: { type: "string", nullable: true, example: "Regular employment type" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    sort_order: { type: "integer", minimum: 0, example: 10 },
    metadata: { type: "object", additionalProperties: true },
    updated_at: dateTime("Last update timestamp"),
    deleted_at: { ...dateTime("Soft-delete timestamp"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminExtendedMasterDataCreateBody = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "Full-time" },
    code: { type: "string", minLength: 2, maxLength: 40, example: "FULL_TIME" },
    description: { type: "string", nullable: true, maxLength: 1000, example: "Regular employment type" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    sort_order: { type: "integer", minimum: 0, maximum: 100000, example: 10 }
  },
  additionalProperties: false
};

const adminExtendedMasterDataUpdateBody = {
  ...adminExtendedMasterDataCreateBody,
  required: ["expected_version"],
  properties: {
    ...adminExtendedMasterDataCreateBody.properties,
    expected_version: { type: "integer", minimum: 1, example: 1 }
  }
};

const adminRbacRoleSchema = {
  type: "object",
  required: [
    "id",
    "role_key",
    "key",
    "name",
    "label",
    "description",
    "status",
    "active",
    "builtin",
    "protected_system_role",
    "assigned_users",
    "permission_ids",
    "permissions",
    "updated_at",
    "version"
  ],
  properties: {
    id: uuid("RBAC role UUID"),
    role_key: { type: "string", example: "HR Manager" },
    key: { type: "string", example: "HR Manager" },
    name: { type: "string", example: "HR Manager" },
    label: { type: "string", example: "HR Manager" },
    description: { type: "string", example: "People operations access." },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    builtin: { type: "boolean", example: true },
    protected_system_role: { type: "boolean", example: false },
    assigned_users: { type: "integer", minimum: 0, example: 4 },
    permission_ids: { type: "array", items: { type: "string", example: "employees:view" } },
    permissions: { type: "array", items: { type: "string", example: "employees:view" } },
    updated_at: dateTime("RBAC role update timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminRbacPermissionSchema = {
  type: "object",
  required: ["id", "permission_id", "group", "module", "action", "label", "description"],
  properties: {
    id: { type: "string", example: "employees:view" },
    permission_id: { type: "string", example: "employees:view" },
    group: { type: "string", example: "Employees" },
    module: { type: "string", example: "Employees" },
    action: { type: "string", enum: ["view", "create", "edit", "delete", "approve", "export", "configure"], example: "view" },
    label: { type: "string", example: "Employees view" },
    description: { type: "string", example: "Allows view access for Employees." }
  },
  additionalProperties: false
};

const adminRbacRoleCreateBody = {
  type: "object",
  required: ["name"],
  properties: {
    role_key: { type: "string", minLength: 2, maxLength: 80, example: "HR Business Partner" },
    key: { type: "string", minLength: 2, maxLength: 80, example: "HR Business Partner" },
    name: { type: "string", minLength: 2, maxLength: 160, example: "HR Business Partner" },
    description: { type: "string", maxLength: 1000, example: "Custom HR role." },
    permission_ids: { type: "array", items: { type: "string", example: "employees:view" }, default: [] }
  },
  additionalProperties: false
};

const adminRbacRoleUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "HR Operations" },
    description: { type: "string", maxLength: 1000, example: "Updated role description." },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminRbacPermissionsReplaceBody = {
  type: "object",
  required: ["permission_ids", "expected_version"],
  properties: {
    permission_ids: { type: "array", items: { type: "string", example: "employees:view" } },
    expected_version: { type: "integer", minimum: 1, example: 1 },
    remarks: { type: "string", maxLength: 1000, example: "Quarterly role review." }
  },
  additionalProperties: false
};

const adminWorkflowStageSchema = {
  type: "object",
  required: [
    "id",
    "order",
    "approver_type",
    "approverType",
    "approver_value",
    "approverValue",
    "escalate_after_days",
    "escalateAfterDays",
    "mandatory_remarks_on_reject",
    "mandatoryRemarksOnReject"
  ],
  properties: {
    id: { type: "string", example: "leave_stage_1" },
    order: { type: "integer", minimum: 1, example: 1 },
    approver_type: { type: "string", enum: ["Reporting Manager", "Role", "Specific User"], example: "Reporting Manager" },
    approverType: { type: "string", enum: ["Reporting Manager", "Role", "Specific User"], example: "Reporting Manager" },
    approver_value: { type: "string", example: "Direct manager" },
    approverValue: { type: "string", example: "Direct manager" },
    escalate_after_days: { type: "integer", minimum: 0, maximum: 30, example: 2 },
    escalateAfterDays: { type: "integer", minimum: 0, maximum: 30, example: 2 },
    mandatory_remarks_on_reject: { type: "boolean", example: true },
    mandatoryRemarksOnReject: { type: "boolean", example: true }
  },
  additionalProperties: false
};

const adminWorkflowSchema = {
  type: "object",
  required: ["id", "workflow_key", "key", "module", "label", "status", "active", "stages", "updated_at", "version"],
  properties: {
    id: uuid("Admin workflow configuration UUID"),
    workflow_key: { type: "string", enum: ["leave", "wfh", "timesheet", "expense", "asset_request", "helpdesk_escalation"], example: "leave" },
    key: { type: "string", enum: ["leave", "wfh", "timesheet", "expense", "asset_request", "helpdesk_escalation"], example: "leave" },
    module: { type: "string", example: "leave_wfh" },
    label: { type: "string", example: "Leave approval" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    stages: { type: "array", items: adminWorkflowStageSchema },
    updated_at: dateTime("Admin workflow update timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminWorkflowUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    label: { type: "string", minLength: 2, maxLength: 160, example: "Leave approval" },
    active: { type: "boolean", example: true },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    stages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["approver_type", "approver_value"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80, example: "leave_stage_1" },
          order: { type: "integer", minimum: 1, maximum: 20, example: 1 },
          approver_type: { type: "string", enum: ["Reporting Manager", "Role", "Specific User"], example: "Reporting Manager" },
          approverType: { type: "string", enum: ["Reporting Manager", "Role", "Specific User"], example: "Reporting Manager" },
          approver_value: { type: "string", minLength: 1, maxLength: 160, example: "Direct manager" },
          approverValue: { type: "string", minLength: 1, maxLength: 160, example: "Direct manager" },
          escalate_after_days: { type: "integer", minimum: 0, maximum: 30, example: 2 },
          escalateAfterDays: { type: "integer", minimum: 0, maximum: 30, example: 2 },
          mandatory_remarks_on_reject: { type: "boolean", example: true },
          mandatoryRemarksOnReject: { type: "boolean", example: true }
        },
        additionalProperties: false
      }
    },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminPolicySchema = {
  type: "object",
  required: ["id", "policy_key", "key", "module", "label", "status", "active", "config", "updated_at", "version"],
  properties: {
    id: uuid("Admin policy configuration UUID"),
    policy_key: { type: "string", enum: ["attendance", "leave", "timesheet", "expense", "asset", "sla"], example: "attendance" },
    key: { type: "string", enum: ["attendance", "leave", "timesheet", "expense", "asset", "sla"], example: "attendance" },
    module: { type: "string", example: "attendance" },
    label: { type: "string", example: "Attendance policy" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    config: {
      type: "object",
      additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }] },
      example: { graceMinutes: 10, allowRegularization: true, autoPunchOutEnabled: true, autoPunchOutTime: "23:59" }
    },
    updated_at: dateTime("Admin policy update timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminPolicyUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    label: { type: "string", minLength: 2, maxLength: 160, example: "Attendance policy" },
    active: { type: "boolean", example: true },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    config: {
      type: "object",
      additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }] },
      example: { graceMinutes: 15, allowRegularization: true, autoPunchOutEnabled: true, autoPunchOutTime: "22:30" }
    },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminEmailTemplateSchema = {
  type: "object",
  required: ["id", "template_key", "key", "module", "name", "subject", "body", "locale", "status", "active", "updated_at", "version"],
  properties: {
    id: uuid("Admin email template UUID"),
    template_key: { type: "string", enum: ["invite", "verify", "reset", "leave", "expense", "ts_reminder", "ticket_update"], example: "invite" },
    key: { type: "string", enum: ["invite", "verify", "reset", "leave", "expense", "ts_reminder", "ticket_update"], example: "invite" },
    module: { type: "string", example: "auth" },
    name: { type: "string", example: "Employee Invite" },
    subject: { type: "string", example: "Welcome to {{company}} - set up your account" },
    body: { type: "string", example: "Hi {{name}},\\n\\nYou've been invited to join {{company}}.\\n\\n{{link}}" },
    locale: { type: "string", example: "en-IN" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    updated_at: dateTime("Admin email template update timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminEmailTemplateUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "Employee Invite" },
    subject: { type: "string", minLength: 2, maxLength: 240, example: "Welcome to {{company}}" },
    body: { type: "string", minLength: 2, maxLength: 5000, example: "Hi {{name}},\\n\\n{{link}}" },
    locale: { type: "string", minLength: 2, maxLength: 20, example: "en-IN" },
    active: { type: "boolean", example: true },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminNotificationEventKeys = [
  "employee_invited",
  "leave_requested",
  "timesheet_submitted",
  "expense_submitted",
  "payment_released",
  "asset_assigned",
  "ticket_assigned",
  "sla_breached"
] as const;

const adminNotificationChannelSchema = {
  type: "object",
  required: [
    "id",
    "event_key",
    "key",
    "module",
    "label",
    "in_app_enabled",
    "inApp",
    "email_enabled",
    "email",
    "push_enabled",
    "push",
    "status",
    "active",
    "updated_at",
    "version"
  ],
  properties: {
    id: uuid("Admin notification channel UUID"),
    event_key: { type: "string", enum: [...adminNotificationEventKeys], example: "leave_requested" },
    key: { type: "string", enum: [...adminNotificationEventKeys], example: "leave_requested" },
    module: { type: "string", example: "leave_wfh" },
    label: { type: "string", example: "Leave requested" },
    in_app_enabled: { type: "boolean", example: true },
    inApp: { type: "boolean", example: true },
    email_enabled: { type: "boolean", example: true },
    email: { type: "boolean", example: true },
    push_enabled: { type: "boolean", example: false },
    push: { type: "boolean", example: false },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    active: { type: "boolean", example: true },
    updated_at: dateTime("Admin notification channel update timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminNotificationChannelsResponse = {
  type: "object",
  required: ["items", "channels", "events", "versions", "version"],
  properties: {
    items: { type: "array", items: adminNotificationChannelSchema },
    channels: { type: "array", items: adminNotificationChannelSchema },
    events: { type: "array", items: adminNotificationChannelSchema },
    versions: {
      type: "object",
      additionalProperties: { type: "integer", minimum: 1 },
      example: { leave_requested: 1, expense_submitted: 1 }
    },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminNotificationChannelInputSchema = {
  type: "object",
  properties: {
    event_key: { type: "string", enum: [...adminNotificationEventKeys], example: "leave_requested" },
    key: { type: "string", enum: [...adminNotificationEventKeys], example: "leave_requested" },
    label: { type: "string", minLength: 2, maxLength: 160, example: "Leave requested" },
    in_app_enabled: { type: "boolean", example: true },
    inApp: { type: "boolean", example: true },
    email_enabled: { type: "boolean", example: true },
    email: { type: "boolean", example: true },
    push_enabled: { type: "boolean", example: false },
    push: { type: "boolean", example: false },
    active: { type: "boolean", example: true },
    status: { type: "string", enum: ["active", "inactive"], example: "active" }
  },
  additionalProperties: false
};

const adminNotificationChannelsUpdateBody = {
  type: "object",
  required: ["channels", "expected_version"],
  properties: {
    channels: { type: "array", minItems: 1, maxItems: 8, items: adminNotificationChannelInputSchema },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminSecuritySettingsSchema = {
  type: "object",
  required: [
    "id",
    "settings_key",
    "password_min_length",
    "passwordMinLength",
    "password_require_special",
    "passwordRequireSpecial",
    "password_require_number",
    "passwordRequireNumber",
    "password_expiry_days",
    "passwordExpiryDays",
    "session_timeout_minutes",
    "sessionTimeoutMinutes",
    "login_attempt_limit",
    "loginAttemptLimit",
    "mfa_enabled",
    "mfaEnabled",
    "audit_role_changes",
    "auditRoleChanges",
    "ip_device_audit_enabled",
    "ipDeviceAuditEnabled",
    "updated_at",
    "version"
  ],
  properties: {
    id: uuid("Admin security settings UUID"),
    settings_key: { type: "string", enum: ["default"], example: "default" },
    password_min_length: { type: "integer", minimum: 8, maximum: 128, example: 10 },
    passwordMinLength: { type: "integer", minimum: 8, maximum: 128, example: 10 },
    password_require_special: { type: "boolean", example: false },
    passwordRequireSpecial: { type: "boolean", example: false },
    password_require_number: { type: "boolean", example: true },
    passwordRequireNumber: { type: "boolean", example: true },
    password_expiry_days: { type: "integer", minimum: 0, maximum: 730, example: 90 },
    passwordExpiryDays: { type: "integer", minimum: 0, maximum: 730, example: 90 },
    session_timeout_minutes: { type: "integer", minimum: 5, maximum: 1440, example: 60 },
    sessionTimeoutMinutes: { type: "integer", minimum: 5, maximum: 1440, example: 60 },
    login_attempt_limit: { type: "integer", minimum: 1, maximum: 100, example: 10 },
    loginAttemptLimit: { type: "integer", minimum: 1, maximum: 100, example: 10 },
    mfa_enabled: { type: "boolean", enum: [false], example: false },
    mfaEnabled: { type: "boolean", enum: [false], example: false },
    audit_role_changes: { type: "boolean", example: true },
    auditRoleChanges: { type: "boolean", example: true },
    ip_device_audit_enabled: { type: "boolean", example: true },
    ipDeviceAuditEnabled: { type: "boolean", example: true },
    updated_at: dateTime("Admin security settings update timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminSecuritySettingsUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    password_min_length: { type: "integer", minimum: 8, maximum: 128, example: 12 },
    passwordMinLength: { type: "integer", minimum: 8, maximum: 128, example: 12 },
    password_require_special: { type: "boolean", example: true },
    passwordRequireSpecial: { type: "boolean", example: true },
    password_require_number: { type: "boolean", example: true },
    passwordRequireNumber: { type: "boolean", example: true },
    password_expiry_days: { type: "integer", minimum: 0, maximum: 730, example: 90 },
    passwordExpiryDays: { type: "integer", minimum: 0, maximum: 730, example: 90 },
    session_timeout_minutes: { type: "integer", minimum: 5, maximum: 1440, example: 45 },
    sessionTimeoutMinutes: { type: "integer", minimum: 5, maximum: 1440, example: 45 },
    login_attempt_limit: { type: "integer", minimum: 1, maximum: 100, example: 5 },
    loginAttemptLimit: { type: "integer", minimum: 1, maximum: 100, example: 5 },
    mfa_enabled: { type: "boolean", enum: [false], example: false },
    mfaEnabled: { type: "boolean", enum: [false], example: false },
    audit_role_changes: { type: "boolean", example: true },
    auditRoleChanges: { type: "boolean", example: true },
    ip_device_audit_enabled: { type: "boolean", example: true },
    ipDeviceAuditEnabled: { type: "boolean", example: true },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const adminAuditLogQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    module: { type: "string", example: "RBAC" },
    actor_user_id: uuid("Filter by actor user UUID"),
    from: dateTime("Filter from timestamp"),
    to: dateTime("Filter to timestamp"),
    date_from: dateTime("Filter from timestamp alias"),
    date_to: dateTime("Filter to timestamp alias")
  }
};

const adminAuditLogEntrySchema = {
  type: "object",
  required: [
    "id",
    "event_id",
    "actor",
    "actor_user_id",
    "action",
    "event_type",
    "target",
    "module",
    "aggregate_type",
    "aggregate_id",
    "status",
    "at",
    "created_at",
    "ip"
  ],
  properties: {
    id: { type: "string", example: "AL-1001" },
    event_id: uuid("Outbox event UUID"),
    actor: { type: "string", example: "ADM - HR Admin" },
    actor_user_id: { ...uuid("Actor user UUID"), nullable: true },
    action: { type: "string", example: "admin.rbac.role.updated" },
    event_type: { type: "string", example: "admin.rbac.role.updated" },
    target: { type: "string", example: "Finance Manager" },
    module: { type: "string", example: "RBAC" },
    aggregate_type: { type: "string", example: "rbac_role" },
    aggregate_id: uuid("Aggregate UUID"),
    status: { type: "string", example: "pending" },
    at: dateTime("Audit event timestamp"),
    created_at: dateTime("Audit event creation timestamp"),
    ip: { type: "string", example: "server" }
  },
  additionalProperties: false
};

const userReferenceSchema = {
  type: "object",
  required: ["id", "employee_code", "full_name"],
  properties: {
    id: uuid("User UUID"),
    employee_code: { type: "string", example: "E1" },
    full_name: { type: "string", example: "Employee E1" }
  },
  additionalProperties: false
};

const departmentReferenceSchema = {
  type: "object",
  required: ["id", "department_code", "name"],
  properties: {
    id: uuid("Department UUID"),
    department_code: { type: "string", example: "SALES" },
    name: { type: "string", example: "Sales" }
  },
  additionalProperties: false
};

const designationReferenceSchema = {
  type: "object",
  required: ["id", "designation_code", "title", "level"],
  properties: {
    id: uuid("Designation UUID"),
    designation_code: { type: "string", example: "EMPLOYEE" },
    title: { type: "string", example: "Employee" },
    level: { type: "integer", nullable: true, example: 1 }
  },
  additionalProperties: false
};

const coreUserListItemSchema = {
  ...authUserSchema,
  required: ["id", "employee_code", "email", "full_name", "roles", "department", "designation", "manager", "display_label", "status", "login_state", "role_labels"],
  properties: {
    ...authUserSchema.properties,
    department: { ...departmentReferenceSchema, nullable: true },
    designation: { ...designationReferenceSchema, nullable: true },
    manager: { ...userReferenceSchema, nullable: true },
    display_label: { type: "string", example: "E1 - Employee E1" },
    status: { type: "string", example: "active" },
    login_state: { type: "string", enum: ["enabled", "disabled", "setup_pending"], example: "enabled" },
    role_labels: { type: "array", items: { type: "string" }, example: ["Employee"] },
    profile_photo_document_id: { ...uuid("Profile photo document UUID"), nullable: true },
    profile_photo_url: { type: "string", nullable: true, example: "https://res.cloudinary.com/example/image/upload/profile.jpg" }
  },
  additionalProperties: true
};

const coreUserListResponseSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary"],
  properties: {
    items: { type: "array", items: coreUserListItemSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    summary: {
      type: "object",
      required: ["total_visible", "total_active", "total_inactive", "total_suspended", "total_terminated", "filters_applied", "sort"],
      properties: {
        total_visible: { type: "integer", minimum: 0, example: 10 },
        total_active: { type: "integer", minimum: 0, example: 10 },
        total_inactive: { type: "integer", minimum: 0, example: 0 },
        total_suspended: { type: "integer", minimum: 0, example: 0 },
        total_terminated: { type: "integer", minimum: 0, example: 0 },
        filters_applied: { type: "array", items: { type: "string" }, example: ["department_id", "role"] },
        sort: { type: "string", example: "employee_code" }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

const coreUserDetailSchema = {
  ...coreUserListItemSchema,
  required: [...coreUserListItemSchema.required, "reporting_line", "role_assignments", "direct_reports_summary", "documents_summary", "assets_summary", "attendance_summary", "leave_summary", "timesheet_summary", "expense_summary", "profile_tabs_available"],
  properties: {
    ...coreUserListItemSchema.properties,
    reporting_line: { type: "array", items: userReferenceSchema },
    role_assignments: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "status"],
        properties: {
          role: { type: "string", example: "Employee" },
          status: { type: "string", example: "active" }
        },
        additionalProperties: false
      }
    },
    direct_reports_summary: { type: "object", additionalProperties: true },
    documents_summary: { type: "object", additionalProperties: true },
    assets_summary: { type: "object", additionalProperties: true },
    attendance_summary: { type: "object", additionalProperties: true },
    leave_summary: { type: "object", additionalProperties: true },
    timesheet_summary: { type: "object", additionalProperties: true },
    expense_summary: { type: "object", additionalProperties: true },
    profile_tabs_available: { type: "array", items: { type: "string" }, example: ["profile", "reporting", "roles", "documents", "assets", "attendance", "leave", "timesheets", "expenses"] }
  },
  additionalProperties: true
};

const coreRoleSchema = {
  type: "string",
  enum: ["Employee", "Reviewer", "Director", "Finance Manager", "Admin", "Auditor", "Asset Manager", "HR Manager"],
  example: "Employee"
};

const coreUserCreateBodySchema = {
  type: "object",
  required: ["employee_code", "email", "full_name", "department_id", "designation_id"],
  properties: {
    employee_code: { type: "string", minLength: 2, maxLength: 32, example: "EMP1001" },
    email: { type: "string", format: "email", example: "new.employee@example.test" },
    full_name: { type: "string", minLength: 2, maxLength: 160, example: "New Employee" },
    department_id: uuid("Department UUID"),
    designation_id: uuid("Designation UUID"),
    manager_user_id: { ...uuid("Reporting manager user UUID"), nullable: true },
    roles: { type: "array", items: coreRoleSchema, minItems: 1, example: ["Employee"] },
    employment_status: { type: "string", enum: ["active", "inactive", "terminated", "suspended"], example: "inactive" },
    timezone: { type: "string", nullable: true, example: "Asia/Kolkata" },
    joined_on: { ...date("Joining date"), nullable: true },
    login_enabled: { type: "boolean", description: "When true, creates a password setup action instead of assigning a default password.", example: true }
  },
  additionalProperties: false
};

const coreUserUpdateBodySchema = {
  type: "object",
  required: ["expected_version"],
  properties: {
    expected_version: { type: "integer", minimum: 1, example: 1 },
    email: { type: "string", format: "email", example: "employee.changed@example.test" },
    full_name: { type: "string", minLength: 2, maxLength: 160, example: "Employee Changed" },
    department_id: uuid("Department UUID"),
    designation_id: uuid("Designation UUID"),
    manager_user_id: { ...uuid("Reporting manager user UUID"), nullable: true },
    employment_status: { type: "string", enum: ["active", "inactive", "terminated", "suspended"], example: "active" },
    timezone: { type: "string", nullable: true, example: "Asia/Kolkata" },
    joined_on: { ...date("Joining date"), nullable: true },
    terminated_on: { ...date("Termination date"), nullable: true }
  },
  additionalProperties: false
};

const coreProfilePhotoPolicySchema = {
  type: "object",
  required: ["max_bytes", "max_width", "max_height", "jpeg_quality", "allowed_mime_types", "output_mime_type", "cloudinary_transformation"],
  properties: {
    max_bytes: { type: "integer", minimum: 1, example: 2097152 },
    max_width: { type: "integer", minimum: 1, example: 512 },
    max_height: { type: "integer", minimum: 1, example: 512 },
    jpeg_quality: { type: "number", minimum: 0.5, maximum: 0.95, example: 0.82 },
    allowed_mime_types: { type: "array", items: { type: "string" }, example: ["image/jpeg", "image/png", "image/webp"] },
    output_mime_type: { type: "string", example: "image/jpeg" },
    cloudinary_transformation: { type: "string", example: "c_fill,g_face,w_512,h_512,q_auto:eco,f_auto" }
  },
  additionalProperties: false
};

const coreProfilePhotoUploadBodySchema = {
  type: "object",
  required: ["file"],
  properties: {
    file: { type: "string", format: "binary", description: "JPEG, PNG, or WebP profile photo. The backend validates size and type from policy." }
  },
  additionalProperties: true
};

const coreUserStatusBodySchema = {
  type: "object",
  required: ["expected_version"],
  properties: {
    expected_version: { type: "integer", minimum: 1, example: 1 },
    effective_date: date("Effective date"),
    reason: { type: "string", maxLength: 500, example: "Voluntary exit" },
    remarks: { type: "string", maxLength: 1000, example: "Approved by HR" },
    status: { type: "string", enum: ["inactive", "terminated", "suspended"], example: "inactive" }
  },
  additionalProperties: false
};

const coreUserLoginBodySchema = {
  type: "object",
  required: ["expected_version"],
  properties: {
    expected_version: { type: "integer", minimum: 1, example: 1 },
    invite_email: { type: "boolean", example: true },
    reason: { type: "string", maxLength: 500, example: "Access no longer required" }
  },
  additionalProperties: false
};

const coreUserRolesBodySchema = {
  type: "object",
  required: ["roles", "expected_version"],
  properties: {
    roles: { type: "array", items: coreRoleSchema, minItems: 1, example: ["Employee", "HR Manager"] },
    expected_version: { type: "integer", minimum: 1, example: 1 },
    remarks: { type: "string", maxLength: 1000, example: "Role change approved by HR" }
  },
  additionalProperties: false
};

const coreUserAuditQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    event_type: { type: "string", maxLength: 120, example: "core.user.roles_replaced" },
    date_from: date("Audit lower date filter"),
    date_to: date("Audit upper date filter")
  }
};

const coreImportJobParamSchema = {
  type: "object",
  required: ["job_id"],
  properties: {
    job_id: uuid("Employee import job UUID path parameter")
  }
};

const coreUserRoleHistoryEntrySchema = {
  type: "object",
  required: ["id", "user_id", "employee_code", "actor", "from_roles", "to_roles", "source_event_type", "created_at"],
  properties: {
    id: { type: "string", example: "018f9f4a-7f9a-7c15-8f25-6f7f96f9001" },
    event_id: { ...uuid("Source outbox event UUID"), nullable: true },
    user_id: uuid("Employee user UUID"),
    employee_code: { type: "string", example: "E1" },
    actor_user_id: { ...uuid("Actor user UUID"), nullable: true },
    actor: { type: "string", example: "ADM - Priya Menon" },
    from_roles: { type: "array", items: coreRoleSchema, example: ["Employee"] },
    to_roles: { type: "array", items: coreRoleSchema, example: ["Employee", "HR Manager"] },
    remarks: { type: "string", nullable: true, example: "Role change approved by HR" },
    source_event_type: { type: "string", example: "core.user.roles_replaced" },
    created_at: dateTime("History event timestamp")
  },
  additionalProperties: false
};

const coreUserAuditEntrySchema = {
  type: "object",
  required: ["id", "event_id", "user_id", "employee_code", "event_type", "action", "actor", "created_at"],
  properties: {
    id: uuid("Audit event UUID"),
    event_id: uuid("Outbox event UUID"),
    user_id: uuid("Employee user UUID"),
    employee_code: { type: "string", example: "E1" },
    event_type: { type: "string", example: "core.user.updated" },
    action: { type: "string", example: "Profile updated" },
    actor_user_id: { ...uuid("Actor user UUID"), nullable: true },
    actor: { type: "string", example: "ADM - Priya Menon" },
    remarks: { type: "string", nullable: true, example: "Returned to service" },
    metadata: { type: "object", additionalProperties: true },
    created_at: dateTime("Audit event timestamp")
  },
  additionalProperties: false
};

const coreUserImportBodySchema = {
  type: "object",
  properties: {
    document_id: uuid("Uploaded employee import document UUID"),
    file_name: { type: "string", minLength: 1, maxLength: 240, example: "employees-may-2026.csv" },
    dry_run: { type: "boolean", example: true },
    mapping: { type: "object", additionalProperties: { type: "string" }, example: { email: "Email", employee_code: "Employee ID" } }
  },
  additionalProperties: false
};

const coreUserExportBodySchema = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["csv", "xlsx"], default: "csv", example: "csv" },
    filters: { type: "object", additionalProperties: true, example: { department_id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9001" } },
    columns: { type: "array", maxItems: 80, items: { type: "string", maxLength: 80 }, example: ["employee_code", "full_name", "email", "roles"] }
  },
  additionalProperties: false
};

const coreUserImportJobSchema = {
  type: "object",
  required: ["job_id", "event_id", "status", "dry_run", "accepted_rows", "rejected_rows", "row_errors", "created_users", "file", "mapping", "created_by", "adapter", "created_at", "updated_at"],
  properties: {
    job_id: uuid("Employee import job UUID"),
    event_id: uuid("Source outbox event UUID"),
    status: { type: "string", example: "queued" },
    outbox_status: { type: "string", example: "pending" },
    dry_run: { type: "boolean", example: true },
    accepted_rows: { type: "integer", minimum: 0, example: 0 },
    rejected_rows: { type: "integer", minimum: 0, example: 0 },
    row_errors: { type: "array", items: { type: "object", additionalProperties: true } },
    created_users: { type: "array", items: { type: "object", additionalProperties: true } },
    file: {
      type: "object",
      required: ["document_id", "file_name"],
      properties: {
        document_id: { ...uuid("Uploaded import document UUID"), nullable: true },
        file_name: { type: "string", nullable: true, example: "employees-may-2026.csv" }
      },
      additionalProperties: false
    },
    mapping: { type: "object", additionalProperties: true },
    created_by_user_id: { ...uuid("Actor user UUID"), nullable: true },
    created_by: { type: "string", example: "ADM - Priya Menon" },
    adapter: { type: "string", example: "outbox-queued-placeholder" },
    created_at: dateTime("Job creation timestamp"),
    updated_at: dateTime("Job update timestamp")
  },
  additionalProperties: false
};

const coreUserExportJobSchema = {
  type: "object",
  required: ["job_id", "export_id", "event_id", "status", "format", "filters", "columns", "created_by", "adapter", "created_at", "updated_at"],
  properties: {
    job_id: uuid("Employee export job UUID"),
    export_id: uuid("Employee export job UUID"),
    event_id: uuid("Source outbox event UUID"),
    status: { type: "string", example: "ready" },
    outbox_status: { type: "string", example: "pending" },
    format: { type: "string", enum: ["csv", "xlsx"], example: "csv" },
    filters: { type: "object", additionalProperties: true },
    columns: { type: "array", items: { type: "string" } },
    download_document_id: { ...uuid("Document UUID once generated"), nullable: true },
    download_url: { type: "string", nullable: true },
    created_by_user_id: { ...uuid("Actor user UUID"), nullable: true },
    created_by: { type: "string", example: "ADM - Priya Menon" },
    adapter: { type: "string", example: "cloudinary-generated-csv" },
    file_name: { type: "string", nullable: true, example: "employee-export-2026-05-23.csv" },
    row_count: { type: "integer", minimum: 0, example: 25 },
    size_bytes: { type: "integer", nullable: true, minimum: 0, example: 2048 },
    generated_at: { ...dateTime("Export file generation timestamp"), nullable: true },
    created_at: dateTime("Job creation timestamp"),
    updated_at: dateTime("Job update timestamp")
  },
  additionalProperties: false
};

const coreUserMutationResponseSchema = {
  ...coreUserDetailSchema,
  properties: {
    ...coreUserDetailSchema.properties,
    onboarding: {
      type: "object",
      required: ["setup_required", "invite_sent", "next_step"],
      properties: {
        setup_required: { type: "boolean", example: true },
        invite_sent: { type: "boolean", example: false },
        next_step: { type: "string", enum: ["set_password", "none"], example: "set_password" },
        dev_only: authDevOnlySchema
      },
      additionalProperties: true
    },
    sessions_revoked: { type: "integer", minimum: 0, example: 1 }
  },
  additionalProperties: true
};

const orgSelectorsResponseSchema = {
  type: "object",
  required: ["departments", "designations", "managers", "roles"],
  properties: {
    departments: { type: "array", items: departmentReferenceSchema },
    designations: { type: "array", items: designationReferenceSchema },
    managers: { type: "array", items: userReferenceSchema },
    roles: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "label"],
        properties: {
          key: coreRoleSchema,
          label: coreRoleSchema
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

const subtreeUserSchema = {
  ...authUserSchema,
  required: [...authUserSchema.required, "depth"],
  properties: {
    ...authUserSchema.properties,
    depth: {
      type: "integer",
      minimum: 1,
      description: "Relative hierarchy depth below the requested root. Direct reports are depth 1.",
      example: 1
    }
  }
};

const subtreeResponseSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary", "total_active_descendants", "max_depth"],
  properties: {
    items: { type: "array", items: subtreeUserSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    total_active_descendants: {
      type: "integer",
      minimum: 0,
      description: "Total active, non-deleted descendants under the requested root.",
      example: 3
    },
    max_depth: {
      type: "integer",
      minimum: 0,
      description: "Deepest relative level returned in the full active subtree.",
      example: 1
    },
    summary: {
      type: "object",
      required: ["root_user_id", "root_employee_code", "root_full_name", "total_active_descendants", "max_depth"],
      properties: {
        root_user_id: uuid("Requested root user UUID"),
        root_employee_code: { type: "string", example: "D1" },
        root_full_name: { type: "string", example: "Delivery Manager" },
        total_active_descendants: { type: "integer", minimum: 0, example: 3 },
        max_depth: { type: "integer", minimum: 0, example: 1 }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false,
  example: {
    items: [
      {
        id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001",
        employee_code: "E1",
        email: "employee@example.test",
        full_name: "Employee One",
        department_id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f010",
        designation_id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f020",
        hierarchy_path: "CEO.SALES.D1.E1",
        employment_status: "active",
        roles: ["Employee"],
        depth: 1
      }
    ],
    page: 1,
    page_size: 25,
    total: 3,
    total_active_descendants: 3,
    max_depth: 1,
    summary: {
      root_user_id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f000",
      root_employee_code: "D1",
      root_full_name: "Delivery Manager",
      total_active_descendants: 3,
      max_depth: 1
    }
  }
};

const ticketSchema = {
  type: "object",
  required: ["id", "ticket_no", "requester_user_id", "status", "version"],
  properties: {
    id: uuid("Expense ticket UUID"),
    ticket_no: { type: "string", example: "EXP-2026-1042" },
    requester_user_id: uuid("Requester user UUID"),
    requester_role_snapshot: { type: "string", example: "Employee / Software Engineer" },
    department_id: uuid("Department UUID"),
    expense_type: { type: "string", enum: ["Project", "SalesPreSales"], example: "Project" },
    expense_sub_type: {
      type: "string",
      enum: [
        "Project Travel",
        "Material Consumables",
        "Lodging & Boarding",
        "Client Meeting",
        "Demo / Presentation",
        "Marketing Event",
        "Sales Travel",
        "Misc Sales Expense"
      ],
      example: "Project Travel"
    },
    project_code: { type: "string", nullable: true, example: "PRJ-100" },
    client_name: { type: "string", nullable: true, example: null },
    task_title: { type: "string", example: "Client implementation travel" },
    estimated_amount: money("Estimated amount"),
    payment_type: { type: "string", enum: ["Advance", "ReimbursementAccrued"], example: "Advance" },
    advance_amount: { ...money("Advance amount"), nullable: true },
    actual_amount: { ...money("Actual amount"), nullable: true },
    variance_amount: { ...money("Settlement variance amount"), nullable: true },
    payment_reference_no: { type: "string", nullable: true, example: "NEFT-9931" },
    assigned_finance_actor_user_id: { ...uuid("Assigned finance-stage actor UUID"), nullable: true },
    manager_verifier_id: { ...uuid("Assigned manager verifier UUID"), nullable: true },
    manager_verifier_label: { type: "string", nullable: true, example: "D1 - Manager D1" },
    finance_approver_id: { ...uuid("Assigned finance approver UUID"), nullable: true },
    finance_approver_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    assigned_finance_actor_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    primary_finance_manager_user_id: { ...uuid("Configured primary finance manager UUID"), nullable: true },
    primary_finance_manager_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    finance_approval_backup_user_id: { ...uuid("Configured fallback finance approver UUID"), nullable: true },
    finance_backup_applied: {
      type: "boolean",
      description: "True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup.",
      example: false
    },
    governance_warning_codes: {
      type: "array",
      items: { type: "string" },
      description: "Route/governance warning markers preserved from the ticket route snapshot.",
      example: ["primary_finance_manager_assigned"]
    },
    status: {
      type: "string",
      example: "Manager Verified"
    },
    version: { type: "integer", minimum: 1, example: 4 },
    created_at: dateTime("Creation timestamp"),
    updated_at: dateTime("Last update timestamp"),
    submitted_at: { ...dateTime("Submission timestamp"), nullable: true },
    closed_at: { ...dateTime("Closure timestamp"), nullable: true }
  },
  additionalProperties: true
};

const expenseTimelineEventSchema = {
  type: "object",
  required: ["event_type", "label", "stage", "actor_user_id", "actor_name", "timestamp", "remarks", "status_from", "status_to"],
  properties: {
    event_type: { type: "string", example: "expense.manager.approve" },
    label: { type: "string", example: "Manager approve" },
    stage: { type: "string", enum: ["requester", "manager", "finance", "documents", "closure"], example: "manager" },
    actor_user_id: uuid("Actor user UUID"),
    actor_name: { type: "string", example: "D1 - Manager D1" },
    timestamp: dateTime("Timeline event timestamp"),
    remarks: { type: "string", nullable: true, example: "Approved." },
    status_from: { type: "string", nullable: true, example: "Pending Manager Verification" },
    status_to: { type: "string", nullable: true, example: "Manager Verified" }
  },
  additionalProperties: false
};

const assetSchema = {
  type: "object",
  required: ["id", "asset_code", "asset_type", "name", "status", "version"],
  properties: {
    id: uuid("Asset UUID"),
    asset_code: { type: "string", example: "LAP-001" },
    asset_type: { type: "string", example: "Laptop" },
    name: { type: "string", example: "ThinkPad T-Series" },
    serial_no: { type: "string", nullable: true, example: "SN-001" },
    qr_hash: { type: "string", example: "release-qr-hash-lap-available" },
    status: { type: "string", example: "In Stock" },
    assigned_to_user_id: { ...uuid("Assigned employee UUID"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const assetRequestSchema = {
  type: "object",
  required: ["id", "request_code", "requester_user_id", "request_type", "asset_type", "reason", "priority", "status", "version", "created_at"],
  properties: {
    id: uuid("Asset request UUID"),
    request_code: { type: "string", example: "REQ-401" },
    requester_user_id: uuid("Requester user UUID"),
    requester_name: { type: "string", nullable: true, example: "Employee E1" },
    request_type: { type: "string", enum: ["new", "replacement", "repair", "return"], example: "new" },
    asset_type: { type: "string", example: "Laptop" },
    asset_id: { ...uuid("Related asset UUID"), nullable: true },
    reason: { type: "string", example: "Project onboarding" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"], example: "medium" },
    needed_by: { type: "string", format: "date", nullable: true, example: "2026-06-01" },
    preferred_specs: { type: "object", additionalProperties: true },
    status: { type: "string", enum: ["pending", "approved", "rejected", "returned", "fulfilled", "cancelled"], example: "pending" },
    decision_by_user_id: { ...uuid("Decision actor UUID"), nullable: true },
    decision_by_name: { type: "string", nullable: true, example: "Asset Manager" },
    decision_at: dateTime("Decision timestamp"),
    decision_remarks: { type: "string", nullable: true, example: "Approved." },
    assigned_asset_id: { ...uuid("Assigned asset UUID"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 },
    created_at: dateTime("Created timestamp"),
    updated_at: dateTime("Updated timestamp")
  },
  additionalProperties: true
};

const assetRequestBodySchema = {
  type: "object",
  required: ["request_type", "asset_type", "reason"],
  properties: {
    request_type: { type: "string", enum: ["new", "replacement", "repair", "return"], example: "new" },
    asset_type: { type: "string", minLength: 1, maxLength: 80, example: "Laptop" },
    asset_id: { ...uuid("Related asset UUID"), nullable: true },
    reason: { type: "string", minLength: 3, maxLength: 2000, example: "Project onboarding" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"], example: "medium" },
    needed_by: { type: "string", format: "date", nullable: true, example: "2026-06-01" },
    preferred_specs: { type: "object", additionalProperties: true }
  },
  additionalProperties: false
};

const assetRequestDecisionBodySchema = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["approved", "rejected", "returned", "fulfilled"], example: "approved" },
    remarks: { type: "string", nullable: true, example: "Approved for onboarding." },
    expected_version: { type: "integer", minimum: 1, example: 1 },
    asset_id: { ...uuid("Assigned asset UUID"), nullable: true }
  },
  additionalProperties: false
};

const assetMaintenanceSchema = {
  type: "object",
  required: ["id", "asset_id", "maintenance_type", "started_on", "status", "version"],
  properties: {
    id: uuid("Maintenance record UUID"),
    asset_id: uuid("Asset UUID"),
    maintenance_type: { type: "string", enum: ["repair", "preventive", "warranty", "inspection", "other"], example: "repair" },
    vendor_id: { ...uuid("Vendor UUID"), nullable: true },
    vendor_name: { type: "string", nullable: true, example: "Lenovo India" },
    cost: { type: "string", nullable: true, example: "1200.00" },
    started_on: { type: "string", format: "date", example: "2026-05-23" },
    completed_on: { type: "string", format: "date", nullable: true, example: "2026-05-24" },
    status: { type: "string", enum: ["scheduled", "in_progress", "completed", "cancelled"], example: "in_progress" },
    notes: { type: "string", nullable: true, example: "Keyboard replacement." },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const assetVendorSchema = {
  type: "object",
  required: ["id", "name", "status", "version"],
  properties: {
    id: uuid("Vendor UUID"),
    name: { type: "string", example: "Lenovo India" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    contact_email: { type: "string", nullable: true, example: "support@lenovo.example.test" },
    phone: { type: "string", nullable: true, example: "+91-00000-00000" },
    metadata: { type: "object", additionalProperties: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const assetVendorCreateBodySchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "Apple Enterprise" },
    contact_email: { type: "string", format: "email", nullable: true, example: "support@apple.example.test" },
    phone: { type: "string", nullable: true, example: "+91-00000-00000" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    metadata: { type: "object", additionalProperties: true }
  },
  additionalProperties: false
};

const assetVendorUpdateBodySchema = {
  type: "object",
  required: ["expected_version"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "Apple Enterprise" },
    contact_email: { type: "string", format: "email", nullable: true, example: "support@apple.example.test" },
    phone: { type: "string", nullable: true, example: "+91-00000-00000" },
    status: { type: "string", enum: ["active", "inactive"], example: "active" },
    metadata: { type: "object", additionalProperties: true },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const assetWarrantyAlertSchema = {
  type: "object",
  required: ["asset_id", "asset_code", "asset_type", "name", "warranty_expiry", "days_left", "severity"],
  properties: {
    asset_id: uuid("Asset UUID"),
    asset_code: { type: "string", example: "LAP-001" },
    asset_type: { type: "string", example: "Laptop" },
    name: { type: "string", example: "ThinkPad T-Series" },
    brand: { type: "string", nullable: true, example: "Lenovo" },
    model: { type: "string", nullable: true, example: "T14" },
    vendor: { type: "string", nullable: true, example: "Lenovo India" },
    warranty_expiry: { type: "string", format: "date", example: "2026-06-30" },
    days_left: { type: "integer", example: 14 },
    severity: { type: "string", enum: ["expired", "critical", "warning"], example: "critical" },
    assigned_to_user_id: { ...uuid("Assigned user UUID"), nullable: true },
    assigned_to_name: { type: "string", nullable: true, example: "Ananya Rao" }
  },
  additionalProperties: true
};

const assetWarrantyAlertsQuerySchema = {
  type: "object",
  properties: {
    ...paginationQuerySchema.properties,
    window_days: { type: "integer", minimum: 0, maximum: 365, example: 60 },
    include_expired: { type: "boolean", example: true }
  },
  additionalProperties: false
};

const assetRecoveryTicketSchema = {
  type: "object",
  required: ["id", "employee_user_id", "asset_id", "status", "version", "created_at"],
  properties: {
    id: uuid("Recovery ticket UUID"),
    employee_user_id: uuid("Employee user UUID"),
    asset_id: uuid("Asset UUID"),
    status: { type: "string", enum: ["open", "in_progress", "closed"], example: "open" },
    settlement_status: { type: "string", enum: ["recovered", "deduction", "waived", "lost_damaged"], nullable: true, example: "recovered" },
    settlement_amount: { type: "string", nullable: true, example: "2500.00" },
    settlement_remarks: { type: "string", nullable: true, example: "Recovered during exit clearance." },
    settled_by_user_id: { ...uuid("Settlement actor UUID"), nullable: true },
    settled_at: { ...dateTime("Settlement timestamp"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 },
    employee: { type: "object", nullable: true, additionalProperties: true },
    asset: { ...assetSchema, nullable: true },
    created_at: dateTime("Created timestamp"),
    updated_at: dateTime("Updated timestamp")
  },
  additionalProperties: true
};

const assetRecoverySettlementBodySchema = {
  type: "object",
  required: ["settlement_status", "expected_version"],
  properties: {
    settlement_status: { type: "string", enum: ["recovered", "deduction", "waived", "lost_damaged"], example: "recovered" },
    settlement_amount: { type: "string", nullable: true, example: "2500.00" },
    remarks: { type: "string", nullable: true, example: "Recovered during exit clearance." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const documentSchema = {
  type: "object",
  required: ["id", "business_object_type", "business_object_id", "classification", "document_type"],
  properties: {
    id: uuid("Document metadata UUID"),
    business_object_type: { type: "string", example: "expense_ticket" },
    business_object_id: uuid("Business object UUID"),
    classification: {
      type: "string",
      enum: ["normal", "finance", "medical", "compensation", "legal", "audit"],
      example: "finance"
    },
    document_type: { type: "string", example: "receipt" },
    file_name: { type: "string", example: "receipt.pdf" },
    mime_type: { type: "string", example: "application/pdf" },
    size_bytes: { type: "integer", minimum: 1, example: 2000 },
    verification_status: { type: "string", example: "pending" }
  },
  additionalProperties: true
};

const dashboardMetricSchema = {
  type: "object",
  required: ["key", "label", "value", "unit", "source"],
  properties: {
    key: { type: "string", example: "pending_expense_approvals" },
    label: { type: "string", example: "Pending expense approvals" },
    value: {
      oneOf: [
        { type: "integer", minimum: 0, example: 3 },
        { type: "string", example: "42.00" }
      ]
    },
    unit: { type: "string", enum: ["count", "money", "hours", "status"], example: "count" },
    source: {
      type: "string",
      enum: ["core", "expenses", "documents", "assets", "timesheets", "attendance", "leave_wfh", "notifications", "outbox", "system"],
      example: "expenses"
    }
  },
  additionalProperties: false
};

const dashboardSummarySchema = {
  type: "object",
  required: ["generated_at", "scope", "cards", "workforce", "approvals", "operations", "workload", "attention", "unavailable_features"],
  properties: {
    generated_at: dateTime("Dashboard summary generation timestamp"),
    scope: {
      type: "object",
      required: ["actor_user_id", "employee_code", "primary_role", "roles", "visibility"],
      properties: {
        actor_user_id: uuid("Authenticated actor UUID"),
        employee_code: { type: "string", example: "D1" },
        primary_role: { type: "string", example: "Employee" },
        roles: { type: "array", items: { type: "string" }, example: ["Employee"] },
        visibility: { type: "string", enum: ["all", "self_and_descendants"], example: "self_and_descendants" }
      },
      additionalProperties: false
    },
    cards: { type: "array", items: dashboardMetricSchema },
    workforce: {
      type: "object",
      required: ["visible_employees", "active_employees", "inactive_employees", "new_joiners_30d", "departments"],
      properties: {
        visible_employees: { type: "integer", minimum: 0, example: 4 },
        active_employees: { type: "integer", minimum: 0, example: 4 },
        inactive_employees: { type: "integer", minimum: 0, example: 0 },
        new_joiners_30d: { type: "integer", minimum: 0, example: 1 },
        departments: {
          type: "array",
          items: {
            type: "object",
            required: ["department_id", "department_code", "name", "active_employees"],
            properties: {
              department_id: uuid("Department UUID"),
              department_code: { type: "string", example: "SALES" },
              name: { type: "string", example: "Sales" },
              active_employees: { type: "integer", minimum: 0, example: 4 }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    approvals: {
      type: "object",
      required: ["expense_manager_pending", "expense_finance_pending", "expense_total_pending", "timesheet_pending", "document_verification_pending"],
      properties: {
        expense_manager_pending: { type: "integer", minimum: 0, example: 1 },
        expense_finance_pending: { type: "integer", minimum: 0, example: 0 },
        expense_total_pending: { type: "integer", minimum: 0, example: 1 },
        timesheet_pending: { type: "integer", minimum: 0, example: 1 },
        document_verification_pending: { type: "integer", minimum: 0, example: 0 }
      },
      additionalProperties: false
    },
    operations: {
      type: "object",
      required: ["assets_total", "assets_assigned", "assets_recovery_pending", "notifications_pending", "outbox_pending"],
      properties: {
        assets_total: { type: "integer", minimum: 0, example: 1 },
        assets_assigned: { type: "integer", minimum: 0, example: 1 },
        assets_recovery_pending: { type: "integer", minimum: 0, example: 0 },
        notifications_pending: { type: "integer", minimum: 0, example: 1 },
        outbox_pending: { type: "integer", minimum: 0, example: 1 }
      },
      additionalProperties: false
    },
    workload: {
      type: "object",
      required: ["work_segments_total", "submitted_hours_total", "timesheet_submissions_total", "timesheet_submissions_approved", "timesheet_submissions_returned"],
      properties: {
        work_segments_total: { type: "integer", minimum: 0, example: 2 },
        submitted_hours_total: { type: "string", example: "10.00" },
        timesheet_submissions_total: { type: "integer", minimum: 0, example: 1 },
        timesheet_submissions_approved: { type: "integer", minimum: 0, example: 0 },
        timesheet_submissions_returned: { type: "integer", minimum: 0, example: 0 }
      },
      additionalProperties: false
    },
    attention: { type: "array", items: dashboardMetricSchema },
    unavailable_features: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "label", "status", "notes"],
        properties: {
          key: { type: "string", example: "leave_wfh_holidays" },
          label: { type: "string", example: "Leave, WFH, and holidays" },
          status: { type: "string", enum: ["not_implemented"], example: "not_implemented" },
          notes: { type: "string", example: "Leave/WFH/holiday workflows are scheduled for Phase 3 and are not counted in this dashboard yet." }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

const paginated = (itemSchema: JsonSchema) => ({
  type: "object",
  required: ["items", "page", "page_size", "total"],
  properties: {
    items: { type: "array", items: itemSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 1 }
  },
  additionalProperties: false
});

const attendanceQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    date: date("Single date filter", "2026-05-20"),
    date_from: date("Start date filter", "2026-05-01"),
    date_to: date("End date filter", "2026-05-31"),
    month: { type: "string", pattern: "^\\d{4}-\\d{2}$", example: "2026-05" },
    user_id: uuid("Optional employee user UUID"),
    department_id: uuid("Optional department UUID"),
    status: { type: "string", example: "pending" },
    exception_type: {
      type: "string",
      enum: ["late", "missing_punch", "absent", "early_out", "correction"],
      example: "missing_punch"
    }
  }
};

const attendancePunchBody = {
  type: "object",
  required: ["event_type"],
  properties: {
    event_type: { type: "string", enum: ["check_in", "break_start", "break_end", "check_out"], example: "check_in" },
    occurred_at: dateTime("Punch timestamp"),
    work_mode: { type: "string", enum: ["office", "remote", "wfh", "field"], default: "office", example: "office" },
    source: { type: "string", enum: ["web", "mobile", "kiosk", "admin"], default: "web", example: "web" },
    metadata: { type: "object", additionalProperties: true }
  },
  additionalProperties: false
};

const attendancePunchSchema = {
  type: "object",
  required: ["id", "employee_user_id", "event_type", "occurred_at", "work_date", "time"],
  properties: {
    id: uuid("Attendance punch UUID"),
    employee_user_id: uuid("Employee user UUID"),
    event_type: { type: "string", enum: ["check_in", "break_start", "break_end", "check_out"], example: "check_in" },
    occurred_at: dateTime("Punch timestamp"),
    work_date: date("Work date"),
    time: { type: "string", nullable: true, example: "09:10" },
    work_mode: { type: "string", example: "office" },
    source: { type: "string", example: "web" }
  },
  additionalProperties: true
};

const attendanceDaySchema = {
  type: "object",
  required: ["id", "employee_user_id", "work_date", "status", "work_minutes", "version"],
  properties: {
    id: uuid("Attendance day UUID"),
    employee_user_id: uuid("Employee user UUID"),
    work_date: date("Work date"),
    status: { type: "string", enum: ["present", "late", "absent", "wfh", "leave", "weekend", "holiday", "future"], example: "present" },
    first_check_in: { ...dateTime("First check-in"), nullable: true },
    last_check_out: { ...dateTime("Last check-out"), nullable: true },
    in_time: { type: "string", nullable: true, example: "09:10" },
    out_time: { type: "string", nullable: true, example: "18:20" },
    hours: { type: "string", example: "9h 10m" },
    target_hours: { type: "string", example: "8h 00m" },
    work_minutes: { type: "integer", minimum: 0, example: 550 },
    target_work_minutes: { type: "integer", minimum: 0, example: 480 },
    break_minutes: { type: "integer", minimum: 0, example: 30 },
    late_minutes: { type: "integer", minimum: 0, example: 0 },
    early_out_minutes: { type: "integer", minimum: 0, example: 0 },
    exception_type: { type: "string", nullable: true, example: "late" },
    regularization_status: { type: "string", nullable: true, example: "pending" },
    detail: { type: "string", example: "9h 10m" },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const attendanceSummarySchema = {
  type: "object",
  required: ["generated_at", "range", "today", "summary", "week_records", "exception_history"],
  properties: {
    generated_at: dateTime("Summary generation timestamp"),
    range: { type: "object", additionalProperties: true },
    today: attendanceDaySchema,
    summary: { type: "object", additionalProperties: true },
    week_records: { type: "array", items: attendanceDaySchema },
    exception_history: { type: "array", items: { type: "object", additionalProperties: true } }
  },
  additionalProperties: true
};

const attendanceTeamSummarySchema = {
  type: "object",
  required: ["generated_at", "date", "totals", "department_summary", "exceptions"],
  properties: {
    generated_at: dateTime("Summary generation timestamp"),
    date: date("Attendance date"),
    totals: { type: "object", additionalProperties: true },
    department_summary: { type: "array", items: { type: "object", additionalProperties: true } },
    exceptions: { type: "array", items: { type: "object", additionalProperties: true } }
  },
  additionalProperties: true
};

const attendanceCalendarSchema = {
  type: "object",
  required: ["generated_at", "month", "user", "calendar_days", "summary"],
  properties: {
    generated_at: dateTime("Calendar generation timestamp"),
    month: { type: "string", example: "2026-05" },
    user: { type: "object", additionalProperties: true },
    calendar_days: { type: "array", items: attendanceDaySchema },
    summary: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};
const attendanceDailyCalendarSchema = {
  ...paginated(attendanceDaySchema),
  required: ["items", "page", "page_size", "total", "generated_at", "date", "summary", "exceptions", "totals"],
  properties: {
    ...(paginated(attendanceDaySchema).properties as RouteSchema),
    generated_at: dateTime("Daily calendar generation timestamp"),
    date: date("Attendance date"),
    summary: { type: "object", additionalProperties: true },
    exceptions: { type: "array", items: { type: "object", additionalProperties: true } },
    totals: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const attendanceRegularizationCreateBody = {
  type: "object",
  required: ["work_date", "reason"],
  properties: {
    work_date: date("Regularization work date"),
    reason: { type: "string", minLength: 3, maxLength: 1000, example: "Forgot to punch out." },
    requested_punches: {
      type: "array",
      items: {
        type: "object",
        required: ["event_type", "occurred_at"],
        properties: {
          event_type: { type: "string", enum: ["check_in", "break_start", "break_end", "check_out"], example: "check_out" },
          occurred_at: dateTime("Requested punch timestamp")
        }
      }
    }
  },
  additionalProperties: false
};

const attendanceRegularizationDecisionBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["approve", "reject", "return"], example: "approve" },
    remarks: { type: "string", description: "Required for reject/return decisions.", example: "Approved." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const attendanceRegularizationSchema = {
  type: "object",
  required: ["id", "employee_user_id", "work_date", "reason", "status", "version"],
  properties: {
    id: uuid("Regularization request UUID"),
    employee_user_id: uuid("Employee user UUID"),
    work_date: date("Work date"),
    reason: { type: "string", example: "Forgot to punch out." },
    requested_punches: { type: "array", items: { type: "object", additionalProperties: true } },
    status: { type: "string", enum: ["pending", "approved", "returned", "rejected"], example: "pending" },
    current_approver_user_id: { ...uuid("Current approver user UUID"), nullable: true },
    decision_remarks: { type: "string", nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};
const attendanceExportBody = {
  type: "object",
  properties: {
    filters: { type: "object", additionalProperties: true },
    columns: { type: "array", maxItems: 80, items: { type: "string", maxLength: 80 }, example: ["employee_code", "employee", "date", "status"] },
    format: { type: "string", enum: ["csv", "xlsx", "json"], default: "csv", example: "csv" }
  },
  additionalProperties: false
};
const attendanceExportResponseSchema = {
  type: "object",
  required: ["job_id", "status", "format", "filters", "columns", "created_at"],
  properties: {
    job_id: uuid("Attendance export job UUID"),
    status: { type: "string", enum: ["queued", "ready"], example: "ready" },
    format: { type: "string", enum: ["csv", "xlsx", "json"], example: "csv" },
    filters: { type: "object", additionalProperties: true },
    columns: { type: "array", items: { type: "string" } },
    created_at: dateTime("Export job creation timestamp"),
    download_document_id: { ...uuid("Generated document UUID"), nullable: true },
    download_url: { type: "string", nullable: true },
    adapter: { type: "string", example: "cloudinary-generated-csv" },
    file_name: { type: "string", nullable: true, example: "attendance-export-2026-05-23.csv" },
    row_count: { type: "integer", minimum: 0, example: 25 },
    size_bytes: { type: "integer", nullable: true, minimum: 0, example: 2048 },
    generated_at: { ...dateTime("Export file generation timestamp"), nullable: true }
  },
  additionalProperties: true
};

const leaveWfhQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    year: { type: "integer", minimum: 2000, maximum: 2100, example: 2026 },
    leave_type: { type: "string", enum: ["casual", "sick", "earned", "unpaid", "comp_off"], example: "casual" },
    status: { type: "string", enum: ["pending_manager", "approved", "returned", "rejected", "cancelled"], example: "pending_manager" },
    date_from: date("Start date filter", "2026-05-01"),
    date_to: date("End date filter", "2026-05-31"),
    user_id: uuid("Optional employee user UUID"),
    department_id: uuid("Optional department UUID"),
    request_kind: { type: "string", enum: ["leave", "wfh"], example: "leave" }
  }
};

const leaveRequestCreateBody = {
  type: "object",
  required: ["leave_type", "date_from", "date_to", "reason"],
  properties: {
    leave_type: { type: "string", enum: ["casual", "sick", "earned", "unpaid", "comp_off"], example: "casual" },
    date_from: date("Leave start date", "2026-05-26"),
    date_to: date("Leave end date", "2026-05-27"),
    half_day: { type: "boolean", default: false, example: false },
    reason: { type: "string", minLength: 3, maxLength: 1000, example: "Family travel" },
    document_ids: { type: "array", items: uuid("Supporting document UUID") }
  },
  additionalProperties: false
};

const wfhRequestCreateBody = {
  type: "object",
  required: ["date_from", "date_to", "reason"],
  properties: {
    date_from: date("WFH start date", "2026-05-28"),
    date_to: date("WFH end date", "2026-05-28"),
    half_day: { type: "boolean", default: false, example: false },
    reason: { type: "string", minLength: 3, maxLength: 1000, example: "Remote work due to home installation" },
    project_ref: { type: "string", maxLength: 120, example: "QA-PRJ-001" }
  },
  additionalProperties: false
};

const leaveWfhDecisionBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["approve", "reject", "return"], example: "approve" },
    remarks: { type: "string", description: "Required for reject/return decisions.", example: "Approved." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const leaveWfhCancelBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    remarks: { type: "string", maxLength: 1000, example: "Plans changed." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const holidayUpsertBody = {
  type: "object",
  required: ["name", "date"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160, example: "Foundation Day" },
    date: date("Holiday date", "2026-12-24"),
    region: { type: "string", default: "All", example: "All" },
    optional: { type: "boolean", default: false, example: true },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const leaveBalanceResponseSchema = {
  type: "object",
  required: ["generated_at", "year", "user", "balances", "pending_requests_summary"],
  properties: {
    generated_at: dateTime("Balance generation timestamp"),
    year: { type: "integer", example: 2026 },
    user: { type: "object", additionalProperties: true },
    balances: {
      type: "array",
      items: {
        type: "object",
        required: ["leave_type", "label", "total", "used", "pending", "available"],
        properties: {
          leave_type: { type: "string", enum: ["casual", "sick", "earned", "unpaid", "comp_off"], example: "casual" },
          label: { type: "string", example: "Casual Leave" },
          total: { type: "number", example: 12 },
          used: { type: "number", example: 2 },
          pending: { type: "number", example: 1 },
          available: { type: "number", nullable: true, example: 9 }
        },
        additionalProperties: true
      }
    },
    accruals: { type: "array", items: { type: "object", additionalProperties: true } },
    pending_requests_summary: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const leaveRequestSchema = {
  type: "object",
  required: ["id", "request_code", "employee_user_id", "leave_type", "date_from", "date_to", "duration", "status", "version"],
  properties: {
    id: uuid("Leave request UUID"),
    request_code: { type: "string", example: "LV-2026-0001" },
    employee_user_id: uuid("Employee user UUID"),
    leave_type: { type: "string", enum: ["casual", "sick", "earned", "unpaid", "comp_off"], example: "casual" },
    date_from: date("Leave start date", "2026-05-26"),
    date_to: date("Leave end date", "2026-05-27"),
    duration: { type: "number", example: 2 },
    status: { type: "string", enum: ["pending_manager", "approved", "returned", "rejected", "cancelled"], example: "pending_manager" },
    current_approver_user_id: { ...uuid("Current approver user UUID"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const wfhRequestSchema = {
  type: "object",
  required: ["id", "request_code", "employee_user_id", "date_from", "date_to", "duration", "status", "version"],
  properties: {
    id: uuid("WFH request UUID"),
    request_code: { type: "string", example: "WFH-2026-0001" },
    employee_user_id: uuid("Employee user UUID"),
    date_from: date("WFH start date", "2026-05-28"),
    date_to: date("WFH end date", "2026-05-28"),
    duration: { type: "number", example: 1 },
    project_ref: { type: "string", nullable: true, example: "QA-PRJ-001" },
    status: { type: "string", enum: ["pending_manager", "approved", "returned", "rejected", "cancelled"], example: "pending_manager" },
    current_approver_user_id: { ...uuid("Current approver user UUID"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const holidaysResponseSchema = {
  type: "object",
  required: ["holidays", "calendar_metadata"],
  properties: {
    holidays: { type: "array", items: { type: "object", additionalProperties: true } },
    calendar_metadata: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};
const leaveWfhExportBody = {
  type: "object",
  properties: {
    filters: { type: "object", additionalProperties: true },
    columns: { type: "array", maxItems: 80, items: { type: "string", maxLength: 80 }, example: ["employee_code", "employee", "kind", "date_from", "date_to", "status"] },
    format: { type: "string", enum: ["csv", "xlsx", "json"], default: "csv", example: "csv" }
  },
  additionalProperties: false
};
const leaveWfhExportResponseSchema = {
  type: "object",
  required: ["job_id", "status", "format", "filters", "columns", "created_at"],
  properties: {
    job_id: uuid("Leave/WFH export job UUID"),
    status: { type: "string", enum: ["queued", "ready"], example: "ready" },
    format: { type: "string", enum: ["csv", "xlsx", "json"], example: "csv" },
    filters: { type: "object", additionalProperties: true },
    columns: { type: "array", items: { type: "string" } },
    created_at: dateTime("Export job creation timestamp"),
    download_document_id: { ...uuid("Generated document UUID"), nullable: true },
    download_url: { type: "string", nullable: true },
    adapter: { type: "string", example: "cloudinary-generated-csv" },
    file_name: { type: "string", nullable: true, example: "leave-wfh-export-2026-05-23.csv" },
    row_count: { type: "integer", minimum: 0, example: 25 },
    size_bytes: { type: "integer", nullable: true, minimum: 0, example: 2048 },
    generated_at: { ...dateTime("Export file generation timestamp"), nullable: true }
  },
  additionalProperties: true
};

const emsQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    status: { type: "string", example: "pending" },
    type: { type: "string", example: "hr_support" },
    user_id: uuid("Employee user UUID filter"),
    department_id: uuid("Department UUID filter")
  }
};
const emsDocumentQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    document_type: { type: "string", example: "identity_proof" }
  }
};

const emsProfilePatchBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    personal_email: { type: "string", format: "email", example: "employee.personal@example.com" },
    phone: { type: "string", example: "+91 98000 00000" },
    alternate_phone: { type: "string", example: "+91 99000 00000" },
    current_address: { type: "string", example: "12 Indiranagar, Bangalore" },
    permanent_address: { type: "string", example: "12 Indiranagar, Bangalore" },
    city: { type: "string", example: "Bangalore" },
    country: { type: "string", example: "India" },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const emsProfileChangeCreateBody = {
  type: "object",
  required: ["field_key", "new_value"],
  properties: {
    field_key: { type: "string", example: "current_address" },
    field_label: { type: "string", example: "Current address" },
    new_value: { type: "string", example: "44 New Lane, Bangalore" },
    reason: { type: "string", example: "Moved to a new residence." },
    supporting_document_ids: { type: "array", items: uuid("Supporting document UUID") }
  },
  additionalProperties: false
};

const emsDecisionBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["approved", "returned", "rejected"], example: "approved" },
    remarks: { type: "string", example: "Verified and approved." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const emsRequestCreateBody = {
  type: "object",
  required: ["request_type", "subject", "description"],
  properties: {
    request_type: { type: "string", enum: ["profile_update", "document_verification", "letter", "asset", "hr_support"], example: "hr_support" },
    subject: { type: "string", example: "Provident fund query" },
    description: { type: "string", example: "Please help me verify my PF nomination status." },
    document_ids: { type: "array", items: uuid("Supporting document UUID") }
  },
  additionalProperties: false
};

const emsServiceRequestDecisionBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["approved", "returned", "rejected", "closed"], example: "approved" },
    remarks: { type: "string", example: "Generated and sent to employee." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const emsAdminChecklistUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    checklist: {
      type: "object",
      additionalProperties: { type: "boolean" },
      example: { offer: true, docs: true, assets: false }
    },
    status: { type: "string", enum: ["pending", "in_progress", "completed"], example: "in_progress" },
    due_date: { type: "string", format: "date", nullable: true, example: "2026-06-10" },
    remarks: { type: "string", nullable: true, example: "Documents are pending." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const emsProbationDecisionBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["confirmed", "extended"], example: "confirmed" },
    extended_until: { type: "string", format: "date", example: "2026-08-01" },
    remarks: { type: "string", example: "Performance goals met." },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const emsPolicyUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    title: { type: "string", example: "Leave policy" },
    category: { type: "string", example: "Leave" },
    version_label: { type: "string", example: "v4.1" },
    effective_from: { type: "string", format: "date", example: "2026-06-01" },
    document_id: { ...uuid("Policy document UUID"), nullable: true },
    status: { type: "string", enum: ["active", "inactive", "superseded"], example: "active" },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const emsProfileResponseSchema = {
  type: "object",
  required: ["profile", "reporting_line", "emergency_contacts", "summaries"],
  properties: {
    profile: { type: "object", additionalProperties: true },
    reporting_line: { type: "array", items: { type: "object", additionalProperties: true } },
    emergency_contacts: { type: "array", items: { type: "object", additionalProperties: true } },
    summaries: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const emsProfileChangeSchema = {
  type: "object",
  required: ["id", "request_code", "employee_user_id", "field_key", "new_value", "status", "version"],
  properties: {
    id: uuid("EMS profile change UUID"),
    request_code: { type: "string", example: "EMS-PC-2026-0001" },
    employee_user_id: uuid("Employee user UUID"),
    field_key: { type: "string", example: "current_address" },
    field_label: { type: "string", example: "Current address" },
    old_value: { type: "string", nullable: true },
    new_value: { type: "string", example: "44 New Lane, Bangalore" },
    status: { type: "string", enum: ["pending", "approved", "returned", "rejected"], example: "pending" },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const emsServiceRequestSchema = {
  type: "object",
  required: ["id", "request_code", "requester_user_id", "request_type", "subject", "status", "version"],
  properties: {
    id: uuid("EMS service request UUID"),
    request_code: { type: "string", example: "EMS-REQ-2026-0001" },
    requester_user_id: uuid("Requester user UUID"),
    request_type: { type: "string", enum: ["profile_update", "document_verification", "letter", "asset", "hr_support"], example: "hr_support" },
    subject: { type: "string", example: "Provident fund query" },
    status: { type: "string", enum: ["pending", "in_progress", "approved", "returned", "rejected", "closed"], example: "pending" },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const emsLetterSchema = {
  type: "object",
  required: ["id", "letter_type", "title", "status", "version"],
  properties: {
    id: uuid("EMS letter UUID"),
    letter_type: { type: "string", example: "offer_letter" },
    title: { type: "string", example: "Offer Letter" },
    description: { type: "string", example: "Initial offer from Hawkaii HRMS" },
    status: { type: "string", enum: ["available", "requested", "in_progress", "acknowledged"], example: "available" },
    issued_on: date("Letter issue date", "2026-01-01"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const emsPolicySchema = {
  type: "object",
  required: ["id", "policy_code", "title", "category", "version_label", "acknowledgement_status", "acknowledgement_version"],
  properties: {
    id: uuid("EMS policy UUID"),
    policy_code: { type: "string", example: "LEAVE" },
    title: { type: "string", example: "Leave policy" },
    category: { type: "string", example: "Leave" },
    version_label: { type: "string", example: "v4.0" },
    acknowledgement_status: { type: "string", enum: ["pending", "acknowledged"], example: "pending" },
    acknowledgement_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const emsAdminChecklistSchema = {
  type: "object",
  required: ["id", "checklist_type", "employee_user_id", "status", "checklist", "version"],
  properties: {
    id: uuid("EMS admin checklist UUID"),
    checklist_type: { type: "string", enum: ["onboarding", "exit"], example: "onboarding" },
    employee_user_id: uuid("Employee user UUID"),
    employee: { type: "object", additionalProperties: true },
    status: { type: "string", enum: ["pending", "in_progress", "completed"], example: "in_progress" },
    due_date: { type: "string", format: "date", nullable: true, example: "2026-06-10" },
    checklist: { type: "object", additionalProperties: { type: "boolean" } },
    remarks: { type: "string", nullable: true },
    completed_at: { ...dateTime("Checklist completion timestamp"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const emsProbationReviewSchema = {
  type: "object",
  required: ["id", "employee_user_id", "joining_on", "due_on", "status", "version"],
  properties: {
    id: uuid("EMS probation review UUID"),
    employee_user_id: uuid("Employee user UUID"),
    employee: { type: "object", additionalProperties: true },
    joining_on: { type: "string", format: "date", example: "2026-01-01" },
    due_on: { type: "string", format: "date", example: "2026-07-01" },
    status: { type: "string", enum: ["pending", "confirmed", "extended"], example: "pending" },
    extended_until: { type: "string", format: "date", nullable: true, example: "2026-08-01" },
    remarks: { type: "string", nullable: true },
    decided_by_user_id: uuid("Decision actor UUID"),
    decided_at: { ...dateTime("Decision timestamp"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};
const emsEmployeeDocumentListSchema = {
  ...paginated(documentSchema),
  required: ["items", "page", "page_size", "total", "document_summary"],
  properties: {
    ...(paginated(documentSchema).properties as RouteSchema),
    document_summary: {
      type: "object",
      required: ["total", "verified", "pending_verification", "restricted", "by_type"],
      properties: {
        total: { type: "integer", example: 3 },
        verified: { type: "integer", example: 1 },
        pending_verification: { type: "integer", example: 2 },
        restricted: { type: "integer", example: 1 },
        by_type: { type: "object", additionalProperties: { type: "integer" } }
      },
      additionalProperties: true
    }
  },
  additionalProperties: true
};

const validationErrorExample = {
  code: "VALIDATION_FAILED",
  message: "Request validation failed",
  details: {
    formErrors: ["Invalid input: expected object, received undefined"],
    fieldErrors: {}
  },
  request_id: "601fe7b7-6361-463e-ae66-5d972673dd27"
};

const rateLimitErrorExample = {
  code: "TOO_MANY_REQUESTS",
  message: "Too many requests. Please wait and try again.",
  details: { retry_after_seconds: 60 },
  request_id: "601fe7b7-6361-463e-ae66-5d972673dd27"
};

const commonErrorResponses = {
  400: { description: "Validation failed or invalid business request.", content: { "application/json": { schema: errorResponseSchema, example: validationErrorExample } } },
  401: { description: "Authentication required or invalid session.", content: { "application/json": { schema: errorResponseSchema } } },
  403: { description: "Authenticated actor is not allowed to perform this action.", content: { "application/json": { schema: errorResponseSchema } } },
  404: { description: "Resource not found.", content: { "application/json": { schema: errorResponseSchema } } },
  409: { description: "Optimistic concurrency conflict.", content: { "application/json": { schema: conflictResponseSchema } } },
  500: { description: "Unhandled server error.", content: { "application/json": { schema: errorResponseSchema } } }
};

const rateLimitErrorResponse = {
  429: { description: "Rate limit exceeded. Retry after the documented delay.", content: { "application/json": { schema: rateLimitResponseSchema, example: rateLimitErrorExample } } }
};

const success = (schema: JsonSchema, description = "Successful response.") => ({
  description,
  content: {
    "application/json": {
      schema
    }
  }
});

const operation = (
  tag: string,
  summary: string,
  description: string,
  options: RouteSchema = {},
  protectedRoute = true
): RouteSchema => ({
  tags: [tag],
  summary,
  description,
  ...(protectedRoute ? { security: authSecurity } : { security: [] }),
  response: {
    200: success((options.response200 as JsonSchema | undefined) ?? statusResponseSchema),
    ...commonErrorResponses,
    ...(options.rateLimited === false ? {} : rateLimitErrorResponse),
    ...(options.response as Record<string, unknown> | undefined)
  },
  ...without(options, ["response200", "response", "rateLimited"])
});

function without(input: RouteSchema, keys: readonly string[]): RouteSchema {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));
}


const expenseReportQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    status: { type: "string", description: "Expense status filter.", example: "Manager Verified" },
    expense_type: { type: "string", description: "Expense type filter.", example: "Project" },
    expense_sub_type: { type: "string", description: "Expense subtype filter.", example: "Project Travel" },
    payment_type: { type: "string", description: "Payment type filter.", example: "Advance" },
    department_id: uuid("Department filter UUID"),
    requester_user_id: uuid("Requester filter UUID"),
    manager_user_id: uuid("Manager/backup filter UUID"),
    finance_user_id: uuid("Finance actor filter UUID"),
    date_from: date("Created-at lower date filter"),
    date_to: date("Created-at upper date filter"),
    document_status: { type: "string", enum: ["any", "complete", "missing", "pending", "not_required"], default: "any", example: "missing" }
  }
};

const reportCardSchema = {
  type: "object",
  required: ["key", "label", "count"],
  properties: {
    key: { type: "string", example: "pending_finance_approval" },
    label: { type: "string", example: "Pending Finance Approval" },
    count: { type: "integer", minimum: 0, example: 3 },
    amount: money("Optional card amount", "25000.00")
  },
  additionalProperties: true
};

const documentSummarySchema = {
  type: "object",
  required: ["status", "required_document_types", "missing_document_types", "uploaded_document_count", "verified_document_count"],
  properties: {
    status: { type: "string", enum: ["complete", "missing", "pending", "not_required"], example: "missing" },
    required_document_types: { type: "array", items: { type: "string" }, example: ["receipt"] },
    missing_document_types: { type: "array", items: { type: "string" }, example: ["receipt"] },
    uploaded_document_count: { type: "integer", minimum: 0, example: 1 },
    verified_document_count: { type: "integer", minimum: 0, example: 0 },
    pending_document_count: { type: "integer", minimum: 0, example: 1 },
    rejected_document_count: { type: "integer", minimum: 0, example: 0 },
    total_required_document_count: { type: "integer", minimum: 0, example: 1 }
  },
  additionalProperties: false
};

const paymentSummarySchema = {
  type: "object",
  nullable: true,
  additionalProperties: true,
  properties: {
    payment_id: uuid("Payment UUID"),
    approved_amount: money("Approved amount", "500.00"),
    paid_amount: money("Paid amount", "500.00"),
    reference_no: { type: "string", example: "PAY-001" },
    settlement_status: { type: "string", nullable: true, example: "pending" },
    settlement_amount: money("Settlement amount", "0.00")
  }
};

const workflowSummarySchema = {
  type: "object",
  required: ["current_status", "action_required_by", "age_hours", "aging_bucket"],
  properties: {
    current_status: { type: "string", example: "Manager Verified" },
    action_required_by: { type: "string", enum: ["requester", "manager", "finance", "none"], example: "finance" },
    current_actor_user_id: { ...uuid("Current actor UUID"), nullable: true },
    current_actor_label: { type: "string", nullable: true, example: "N1 - Finance Manager" },
    age_hours: { type: "integer", minimum: 0, example: 4 },
    aging_bucket: { type: "string", example: "0-24h" },
    manager_action_required: { type: "boolean", example: false },
    finance_action_required: { type: "boolean", example: true },
    document_action_required: { type: "boolean", example: false },
    settlement_action_required: { type: "boolean", example: false }
  },
  additionalProperties: false
};

const amountSummarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    estimated_amount: money("Estimated amount", "1000.00"),
    advance_amount: { ...money("Advance amount", "500.00"), nullable: true },
    actual_amount: { ...money("Actual amount", "500.00"), nullable: true },
    variance_amount: { ...money("Variance amount", "0.00"), nullable: true },
    approved_amount: { ...money("Approved amount", "500.00"), nullable: true },
    paid_amount: { ...money("Paid amount", "500.00"), nullable: true }
  }
};

const expenseReportTicketSchema = {
  ...ticketSchema,
  properties: {
    ...ticketSchema.properties,
    requester_employee_code: { type: "string", nullable: true, example: "E1" },
    requester_name: { type: "string", nullable: true, example: "Employee E1" },
    requester_label: { type: "string", example: "E1 - Employee E1" },
    department_code: { type: "string", nullable: true, example: "SALES" },
    department_name: { type: "string", nullable: true, example: "Sales" },
    manager_verifier_label: { type: "string", nullable: true, example: "D1 - Manager D1" },
    assigned_finance_actor_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    document_summary: documentSummarySchema,
    payment_summary: paymentSummarySchema,
    workflow_summary: workflowSummarySchema,
    amount_summary: amountSummarySchema
  },
  additionalProperties: true
};

const expenseReportListSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary", "cards", "filters"],
  properties: {
    items: { type: "array", items: expenseReportTicketSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    summary: { type: "object", additionalProperties: true },
    cards: { type: "array", items: reportCardSchema },
    filters: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const managerQueueReportSchema = {
  ...expenseReportListSchema,
  required: ["items", "page", "page_size", "total", "queue_counts", "cards", "filters"],
  properties: {
    ...expenseReportListSchema.properties,
    queue_counts: { type: "object", additionalProperties: true }
  }
};

const historyReportSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary", "filters"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: true } },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    summary: { type: "object", additionalProperties: true },
    filters: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const financeDashboardReportSchema = {
  ...expenseReportListSchema,
  required: ["items", "page", "page_size", "total", "cards", "aging_buckets", "payable_totals", "exception_counts", "filters"],
  properties: {
    ...expenseReportListSchema.properties,
    aging_buckets: { type: "array", items: { type: "object", additionalProperties: true } },
    payable_totals: { type: "object", additionalProperties: true },
    exception_counts: { type: "object", additionalProperties: true }
  }
};

const registerReportSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "totals", "filters", "export_columns"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: true } },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    totals: { type: "object", additionalProperties: true },
    filters: { type: "object", additionalProperties: true },
    export_columns: { type: "array", items: { type: "string" }, example: ["ticket_no", "payment_reference_no"] }
  },
  additionalProperties: true
};

const financeAnalyticsSchema = {
  type: "object",
  required: ["generated_at", "cards", "aging_buckets", "payable_totals", "exception_counts", "summary"],
  properties: {
    generated_at: dateTime("Report generation timestamp"),
    cards: { type: "array", items: reportCardSchema },
    aging_buckets: { type: "array", items: { type: "object", additionalProperties: true } },
    payable_totals: { type: "object", additionalProperties: true },
    exception_counts: { type: "object", additionalProperties: true },
    summary: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const reportSummaryQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    department_id: uuid("Department filter UUID"),
    user_id: uuid("User filter UUID"),
    employee_user_id: uuid("Employee user filter UUID"),
    project_id: uuid("Project filter UUID"),
    assigned_to_user_id: uuid("Assigned user filter UUID"),
    actor_user_id: uuid("Audit actor filter UUID"),
    status: { type: "string", example: "active" },
    type: { type: "string", example: "Laptop" },
    request_kind: { type: "string", enum: ["leave", "wfh"], example: "leave" },
    client: { type: "string", example: "Acme" },
    category_id: uuid("Helpdesk category UUID"),
    module: { type: "string", example: "Admin" },
    action: { type: "string", example: "updated" },
    report_type: { type: "string", example: "attendance" },
    date_from: date("Lower date filter"),
    date_to: date("Upper date filter")
  }
};

const genericReportSummarySchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "totals", "filters"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: true } },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 12 },
    totals: { type: "object", additionalProperties: true },
    filters: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const reportExportJobSchema = {
  type: "object",
  required: ["id", "export_id", "event_id", "report_type", "format", "status", "created_at", "updated_at"],
  properties: {
    id: uuid("Export job UUID"),
    export_id: uuid("Export job UUID"),
    event_id: uuid("Outbox event UUID"),
    report_type: { type: "string", example: "attendance" },
    format: { type: "string", enum: ["csv", "xlsx"], example: "csv" },
    status: { type: "string", example: "ready" },
    outbox_status: { type: "string", example: "pending" },
    created_by_user_id: { ...uuid("Creator UUID"), nullable: true },
    created_by: { type: "string", nullable: true, example: "ADM - HR Admin" },
    filters: { type: "object", additionalProperties: true },
    download_document_id: { ...uuid("Generated document UUID"), nullable: true },
    download_url: { type: "string", nullable: true },
    adapter: { type: "string", example: "cloudinary-generated-csv" },
    file_name: { type: "string", nullable: true, example: "report-hr-employees-2026-05-23.csv" },
    row_count: { type: "integer", minimum: 0, example: 25 },
    size_bytes: { type: "integer", nullable: true, minimum: 0, example: 2048 },
    generated_at: { ...dateTime("Export file generation timestamp"), nullable: true },
    created_at: dateTime("Created timestamp"),
    updated_at: dateTime("Updated timestamp")
  },
  additionalProperties: true
};

const reportExportCreateBodySchema = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["csv", "xlsx"], default: "csv" },
    report_type: { type: "string", default: "expense", example: "attendance" },
    filters: { type: "object", additionalProperties: true }
  },
  additionalProperties: false
};


const timesheetApproverQueueQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    status: { type: "string", enum: ["Pending Approval", "Approved", "Returned", "Rejected"], description: "Optional queue status filter. Omit for active pending approvals.", example: "Pending Approval" },
    employee_user_id: uuid("Employee/member UUID filter"),
    cycle_start: date("Only cycles starting on or after this date", "2026-05-04"),
    cycle_end: date("Only cycles ending on or before this date", "2026-05-08"),
    project_code: { type: "string", minLength: 1, description: "Project code present in at least one submitted work segment.", example: "PRJ-100" },
    billable: { type: "boolean", description: "When set, requires at least one matching billable/non-billable segment.", example: true }
  }
};

const timesheetAnalyticsQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    date_from: date("Start date", "2026-05-04"),
    date_to: date("End date", "2026-05-08"),
    cycle_start: date("Timesheet cycle start", "2026-05-04"),
    cycle_end: date("Timesheet cycle end", "2026-05-08"),
    project_id: uuid("Project UUID"),
    project_code: { type: "string", minLength: 1, example: "PRJ-100" },
    user_id: uuid("Employee user UUID"),
    group_by: { type: "string", enum: ["employee", "project", "department", "week"], example: "employee" }
  }
};

const timesheetSelectorsQuerySchema = {
  type: "object",
  properties: {
    include: { type: "string", description: "Comma-separated selector groups to include.", example: "projects,tasks,cycles,approvers,rules" },
    date: date("Context date for generated cycle selectors", "2026-05-04")
  },
  additionalProperties: false
};

const timesheetUserSummarySchema = {
  type: "object",
  required: ["id", "employee_code", "full_name"],
  properties: {
    id: uuid("User UUID"),
    employee_code: { type: "string", example: "E1" },
    full_name: { type: "string", example: "Employee E1" },
    email: { type: "string", format: "email", example: "e1@example.test" },
    department_id: uuid("Department UUID"),
    department: { type: "object", nullable: true, additionalProperties: true },
    designation_id: uuid("Designation UUID"),
    designation: { type: "object", nullable: true, additionalProperties: true },
    roles: { type: "array", items: { type: "string" }, example: ["Employee"] }
  },
  additionalProperties: true
};

const timesheetActionSchema = {
  type: "object",
  required: ["id", "submission_id", "actor_user_id", "actor_label", "decision", "created_at"],
  properties: {
    id: uuid("Timesheet workflow action UUID"),
    submission_id: uuid("Timesheet submission UUID"),
    actor_user_id: uuid("Actor UUID"),
    actor_label: { type: "string", example: "D1 - Manager D1" },
    actor: { ...timesheetUserSummarySchema, nullable: true },
    decision: { type: "string", enum: ["submitted", "approve", "return", "reject", "workflow_definition_created"], example: "approve" },
    remarks: { type: "string", nullable: true, example: "Approved." },
    created_at: dateTime("Action timestamp")
  },
  additionalProperties: true
};

const timesheetSubmissionResponseSchema = {
  type: "object",
  required: ["id", "employee_user_id", "cycle_start", "cycle_end", "status", "total_hours", "version", "employee", "member", "cycle", "project_summary", "hours_summary", "workflow_metadata"],
  properties: {
    id: uuid("Timesheet submission UUID"),
    employee_user_id: uuid("Employee/member UUID"),
    cycle_start: date("Cycle start", "2026-05-04"),
    cycle_end: date("Cycle end", "2026-05-08"),
    status: { type: "string", enum: ["Draft", "Submitted", "Pending Approval", "Approved", "Returned", "Rejected"], example: "Pending Approval" },
    total_hours: money("Submitted total hours", "10.00"),
    workflow_definition_id: uuid("Workflow definition UUID"),
    workflow_snapshot: { type: "object", additionalProperties: true },
    current_approver_user_id: { ...uuid("Current approver UUID"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 },
    employee: { ...timesheetUserSummarySchema, nullable: true },
    member: { type: "object", additionalProperties: true, description: "Employee/member profile, department/designation, member_role, and manager reference." },
    cycle: {
      type: "object",
      required: ["start", "end", "total_days", "expected_work_days"],
      properties: {
        start: date("Cycle start", "2026-05-04"),
        end: date("Cycle end", "2026-05-08"),
        total_days: { type: "integer", minimum: 1, example: 5 },
        expected_work_days: { type: "integer", minimum: 0, example: 5 }
      }
    },
    project_summary: {
      type: "object",
      required: ["project_codes", "task_codes", "project_breakdown"],
      properties: {
        project_codes: { type: "array", items: { type: "string" }, example: ["PRJ-100"] },
        task_codes: { type: "array", items: { type: "string" }, example: ["DEV"] },
        primary_project_code: { type: "string", nullable: true, example: "PRJ-100" },
        client_name: { type: "string", nullable: true, example: null },
        project_breakdown: { type: "array", items: { type: "object", additionalProperties: true } }
      },
      additionalProperties: true
    },
    hours_summary: {
      type: "object",
      required: ["submitted_hours", "expected_hours", "missing_hours", "variance_hours", "billable_hours", "non_billable_hours", "segment_count"],
      properties: {
        submitted_hours: money("Submitted hours", "10.00"),
        expected_hours: money("Expected cycle hours", "40.00"),
        missing_hours: money("Expected minus submitted when positive", "30.00"),
        variance_hours: money("Submitted minus expected", "-30.00"),
        billable_hours: money("Billable submitted hours", "8.00"),
        non_billable_hours: money("Non-billable submitted hours", "2.00"),
        segment_count: { type: "integer", minimum: 0, example: 2 }
      }
    },
    workflow_metadata: {
      type: "object",
      required: ["workflow_definition_id", "workflow_snapshot", "can_actor_decide", "expected_version", "allowed_decisions", "remarks_required_for"],
      properties: {
        workflow_definition_id: uuid("Workflow definition UUID"),
        workflow_snapshot: { type: "object", additionalProperties: true },
        current_approver: { ...timesheetUserSummarySchema, nullable: true },
        can_actor_decide: { type: "boolean", example: true },
        expected_version: { type: "integer", minimum: 1, example: 1 },
        allowed_decisions: { type: "array", items: { type: "string", enum: ["approve", "return", "reject"] }, example: ["approve", "return", "reject"] },
        remarks_required_for: { type: "array", items: { type: "string" }, example: ["return", "reject"] }
      },
      additionalProperties: true
    }
  },
  additionalProperties: true
};

const timesheetApproverQueueResponseSchema = {
  ...paginated(timesheetSubmissionResponseSchema),
  required: ["items", "page", "page_size", "total", "summary"],
  properties: {
    ...paginated(timesheetSubmissionResponseSchema).properties,
    items: {
      type: "array",
      items: {
        ...timesheetSubmissionResponseSchema,
        required: [...(timesheetSubmissionResponseSchema.required as string[]), "queue_context", "decision_history", "last_decision"],
        properties: {
          ...timesheetSubmissionResponseSchema.properties,
          queue_context: {
            type: "object",
            required: ["action_required", "current_actor_is_admin_override", "expected_version", "missing_submission_context"],
            properties: {
              action_required: { type: "boolean", example: true },
              current_actor_is_admin_override: { type: "boolean", example: false },
              expected_version: { type: "integer", minimum: 1, example: 1 },
              missing_submission_context: { type: "object", additionalProperties: true }
            },
            additionalProperties: true
          },
          decision_history: { type: "array", items: timesheetActionSchema },
          last_decision: { ...timesheetActionSchema, nullable: true }
        }
      }
    },
    summary: {
      type: "object",
      required: ["total_pending", "total_returned", "total_rejected", "admin_override_view", "filters_applied", "sort"],
      properties: {
        total_pending: { type: "integer", minimum: 0, example: 1 },
        total_returned: { type: "integer", minimum: 0, example: 0 },
        total_rejected: { type: "integer", minimum: 0, example: 0 },
        admin_override_view: { type: "boolean", example: false },
        filters_applied: { type: "array", items: { type: "string" }, example: ["project_code", "billable"] },
        sort: { type: "string", example: "employee_code" }
      },
      additionalProperties: true
    }
  },
  additionalProperties: false
};

const timesheetDecisionResponseSchema = {
  ...timesheetSubmissionResponseSchema,
  required: [...(timesheetSubmissionResponseSchema.required as string[]), "previous_status", "next_status", "decision", "audit_event", "workflow_history"],
  properties: {
    ...timesheetSubmissionResponseSchema.properties,
    previous_status: { type: "string", example: "Pending Approval" },
    next_status: { type: "string", example: "Approved" },
    decision: { type: "string", enum: ["approve", "return", "reject"], example: "approve" },
    audit_event: timesheetActionSchema,
    workflow_history: { type: "array", items: timesheetActionSchema }
  },
  additionalProperties: true
};

const timesheetSubmissionDetailResponseSchema = {
  ...timesheetSubmissionResponseSchema,
  required: [...(timesheetSubmissionResponseSchema.required as string[]), "segments", "workflow_history", "last_decision"],
  properties: {
    ...timesheetSubmissionResponseSchema.properties,
    segments: { type: "array", items: { type: "object", additionalProperties: true } },
    workflow_history: { type: "array", items: timesheetActionSchema },
    last_decision: { ...timesheetActionSchema, nullable: true }
  },
  additionalProperties: true
};

const timesheetProjectSummaryResponseSchema = {
  ...paginated({ type: "object", additionalProperties: true }),
  required: ["items", "page", "page_size", "total", "totals"],
  properties: {
    ...paginated({ type: "object", additionalProperties: true }).properties,
    totals: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const timesheetMissingSubmissionsResponseSchema = {
  ...paginated({ type: "object", additionalProperties: true }),
  required: ["items", "page", "page_size", "total", "summary"],
  properties: {
    ...paginated({ type: "object", additionalProperties: true }).properties,
    summary: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const timesheetProductivitySummaryResponseSchema = {
  type: "object",
  required: ["cards", "series", "breakdown", "filters"],
  properties: {
    cards: { type: "object", additionalProperties: true },
    series: { type: "array", items: { type: "object", additionalProperties: true } },
    breakdown: { type: "array", items: { type: "object", additionalProperties: true } },
    filters: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const timesheetSelectorsResponseSchema = {
  type: "object",
  required: ["projects", "tasks", "cycles", "approvers", "workflow_definitions", "rules"],
  properties: {
    projects: { type: "array", items: { type: "object", additionalProperties: true } },
    tasks: { type: "array", items: { type: "object", additionalProperties: true } },
    cycles: { type: "array", items: { type: "object", additionalProperties: true } },
    approvers: { type: "array", items: timesheetUserSummarySchema },
    workflow_definitions: { type: "array", items: { type: "object", additionalProperties: true } },
    rules: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const expenseCreateBody = {
  type: "object",
  required: ["expense_type", "expense_sub_type", "task_title", "task_description", "start_date", "end_date", "estimated_amount", "payment_type", "line_items"],
  properties: {
    submit: { type: "boolean", default: false, description: "When true, route immediately into the approval workflow.", example: true },
    expense_type: { type: "string", enum: ["Project", "SalesPreSales"], example: "Project" },
    expense_sub_type: { type: "string", example: "Project Travel" },
    project_code: { type: "string", description: "Required for Project expenses.", example: "PRJ-100" },
    client_name: { type: "string", description: "Required for Sales/Pre-Sales expenses.", example: "Northwind" },
    task_title: { type: "string", minLength: 1, example: "Client implementation travel" },
    task_description: { type: "string", minLength: 1, example: "Travel for implementation workshop" },
    location: { type: "string", example: "Mumbai" },
    start_date: date("Expense start date", "2026-05-01"),
    end_date: date("Expense end date", "2026-05-03"),
    estimated_amount: money("Total estimated amount"),
    payment_type: { type: "string", enum: ["Advance", "ReimbursementAccrued"], example: "Advance" },
    advance_amount: money("Requested advance amount", "500.00"),
    advance_justification: { type: "string", example: "Client travel requires upfront payment." },
    line_items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["line_category", "description", "line_total"],
        properties: {
          line_category: { type: "string", example: "travel" },
          description: { type: "string", example: "Flight" },
          quantity: money("Quantity", "1.00"),
          unit_cost: money("Unit cost", "700.00"),
          line_total: money("Line total", "700.00"),
          tax_amount: money("Tax amount", "0.00"),
          vendor_name: { type: "string", example: "Airline" }
        }
      }
    }
  },
  example: {
    submit: true,
    expense_type: "Project",
    expense_sub_type: "Project Travel",
    project_code: "PRJ-100",
    task_title: "Client implementation travel",
    task_description: "Travel for implementation workshop",
    location: "Mumbai",
    start_date: "2026-05-01",
    end_date: "2026-05-03",
    estimated_amount: "1000.00",
    payment_type: "Advance",
    advance_amount: "500.00",
    line_items: [
      { line_category: "travel", description: "Flight", line_total: "700.00" },
      { line_category: "lodging", description: "Hotel", line_total: "300.00" }
    ]
  }
};

const expenseDecisionBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["approve", "reject", "return"], example: "approve" },
    remarks: { type: "string", description: "Required for reject/return decisions.", example: "Approved." },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  }
};

const financeVerifyBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["verify", "hold", "clarification"], example: "verify" },
    remarks: { type: "string", description: "Required for hold or clarification.", example: "Documents verified." },
    expected_version: { type: "integer", minimum: 1, example: 3 }
  }
};

const paymentReleaseBody = {
  type: "object",
  required: ["payment_date", "amount", "payment_mode", "reference_no", "expected_version"],
  properties: {
    payment_date: date("Payment release date", "2026-05-04"),
    amount: money("Payment amount", "500.00"),
    payment_mode: { type: "string", minLength: 1, example: "NEFT" },
    reference_no: { type: "string", minLength: 1, example: "PAY-001" },
    expected_version: { type: "integer", minimum: 1, example: 4 }
  }
};

const settlementBody = {
  type: "object",
  required: ["actual_amount", "expected_version"],
  properties: {
    actual_amount: money("Actual submitted/verified expense amount", "500.00"),
    remarks: { type: "string", example: "Bills verified and settlement complete." },
    expected_version: { type: "integer", minimum: 1, example: 5 }
  }
};

const expenseDashboardQuery = {
  type: "object",
  properties: {
    date_from: date("Created date from", "2026-05-01"),
    date_to: date("Created date to", "2026-05-31"),
    status: { type: "string", example: "Pending Manager Verification" }
  },
  additionalProperties: false
};

const expenseMetadataSchema = {
  type: "object",
  required: ["generated_at", "expense_types", "expense_sub_types", "payment_types", "currencies", "document_types", "policy_hints", "selectors"],
  properties: {
    generated_at: dateTime("Metadata generation timestamp"),
    actor_scope: { type: "object", additionalProperties: true },
    expense_types: { type: "array", items: { type: "object", additionalProperties: true } },
    expense_sub_types: { type: "array", items: { type: "object", additionalProperties: true } },
    project_expense_types: { type: "array", items: { type: "object", additionalProperties: true } },
    payment_types: { type: "array", items: { type: "object", additionalProperties: true } },
    currencies: { type: "array", items: { type: "object", additionalProperties: true } },
    document_types: { type: "array", items: { type: "object", additionalProperties: true } },
    policy_hints: { type: "object", additionalProperties: true },
    selectors: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const expenseDashboardSummarySchema = {
  type: "object",
  required: ["generated_at", "scope", "cards", "queue_counts", "aging", "totals", "rows"],
  properties: {
    generated_at: dateTime("Summary generation timestamp"),
    scope: { type: "object", additionalProperties: true },
    cards: { type: "array", items: { type: "object", additionalProperties: true } },
    queue_counts: { type: "object", additionalProperties: true },
    aging: { type: "array", items: { type: "object", additionalProperties: true } },
    totals: { type: "object", additionalProperties: true },
    rows: { type: "array", items: ticketSchema }
  },
  additionalProperties: true
};

const expenseWithdrawBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    expected_version: { type: "integer", minimum: 1, example: 1 },
    remarks: { type: "string", description: "Required once the ticket has been submitted.", example: "Trip cancelled before manager approval." }
  },
  additionalProperties: false
};

const expenseWithdrawResponseSchema = {
  type: "object",
  required: ["expense", "version", "timeline_event"],
  properties: {
    expense: ticketSchema,
    version: { type: "integer", minimum: 1, example: 2 },
    timeline_event: expenseTimelineEventSchema
  },
  additionalProperties: true
};

const expenseClarificationBody = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 4000, example: "Please attach the GST invoice for this claim." },
    document_ids: { type: "array", items: uuid("Document metadata UUID"), default: [] },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const expenseClarificationResponseSchema = {
  type: "object",
  required: ["clarification", "thread", "expense_version"],
  properties: {
    clarification: { type: "object", additionalProperties: true },
    thread: { type: "array", items: { type: "object", additionalProperties: true } },
    expense_version: { type: "integer", minimum: 1, example: 3 }
  },
  additionalProperties: true
};

const projectQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    status: { type: "string", enum: ["planned", "active", "on_hold", "completed", "cancelled", "archived"], example: "active" },
    client: { type: "string", example: "NorthBank" },
    manager_user_id: uuid("Project manager user UUID"),
    search: { type: "string", example: "payments" },
    include: { type: "string", example: "members,allocations,milestones,documents,summary" },
    active_only: { type: "boolean", example: true },
    role: { type: "string", example: "Engineer" },
    user_id: uuid("Employee user UUID"),
    date_from: date("Start date filter", "2026-05-01"),
    date_to: date("End date filter", "2026-05-31"),
    document_type: { type: "string", example: "sow" },
    department_id: uuid("Department UUID"),
    group_by: { type: "string", enum: ["department", "manager"], example: "department" }
  }
};

const projectBody = {
  type: "object",
  required: ["project_code", "name", "client_name", "manager_user_id", "start_date", "end_date"],
  properties: {
    project_code: { type: "string", minLength: 2, maxLength: 40, example: "ATL-PAY" },
    name: { type: "string", minLength: 2, maxLength: 180, example: "Atlas Payments Platform" },
    client_name: { type: "string", minLength: 1, maxLength: 180, example: "NorthBank" },
    project_type: { type: "string", enum: ["client", "internal"], default: "client", example: "client" },
    billing_type: { type: "string", enum: ["fixed", "hourly", "retainer", "internal"], default: "fixed", example: "fixed" },
    manager_user_id: uuid("Project manager user UUID"),
    department_id: uuid("Owning department UUID"),
    start_date: date("Project start date", "2026-05-01"),
    end_date: date("Project end date", "2026-09-30"),
    status: { type: "string", enum: ["planned", "active", "on_hold", "completed", "cancelled", "archived"], default: "planned", example: "active" },
    health: { type: "string", enum: ["green", "amber", "red"], default: "green", example: "green" },
    description: { type: "string", maxLength: 2000, example: "Client implementation project." },
    estimated_hours: money("Estimated project hours", "1200.00"),
    estimated_budget: money("Estimated project budget", "250000.00"),
    tech_stack: { type: "array", items: { type: "string" }, example: ["TypeScript", "PostgreSQL"] },
    priority: { type: "string", enum: ["low", "medium", "high", "critical"], default: "medium", example: "high" },
    cost_center: { type: "string", nullable: true, example: "CC-DEL-01" }
  },
  additionalProperties: false
};

const projectUpdateBody = {
  ...projectBody,
  required: ["expected_version"],
  properties: {
    ...projectBody.properties,
    expected_version: { type: "integer", minimum: 1, example: 1 }
  }
};

const projectArchiveBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    remarks: { type: "string", example: "Delivery completed and documents archived." },
    expected_version: { type: "integer", minimum: 1, example: 3 }
  },
  additionalProperties: false
};

const projectMemberBody = {
  type: "object",
  required: ["user_id", "project_role", "start_date", "expected_version"],
  properties: {
    user_id: uuid("Employee user UUID"),
    project_role: { type: "string", example: "Engineer" },
    allocation_percent: { type: "integer", minimum: 0, maximum: 200, default: 100, example: 80 },
    billable: { type: "boolean", default: true, example: true },
    start_date: date("Assignment start date", "2026-05-01"),
    end_date: date("Assignment end date", "2026-09-30"),
    reporting_lead_user_id: uuid("Reporting lead user UUID"),
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const projectMemberUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    project_role: { type: "string", example: "Senior Engineer" },
    allocation_percent: { type: "integer", minimum: 0, maximum: 200, example: 100 },
    billable: { type: "boolean", example: true },
    start_date: date("Assignment start date", "2026-05-01"),
    end_date: date("Assignment end date", "2026-09-30"),
    reporting_lead_user_id: uuid("Reporting lead user UUID"),
    status: { type: "string", enum: ["active", "removed"], example: "removed" },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const projectAllocationBody = {
  type: "object",
  required: ["user_id", "date_from", "allocation_percent", "expected_version"],
  properties: {
    user_id: uuid("Employee user UUID"),
    date_from: date("Allocation start date", "2026-05-01"),
    date_to: date("Allocation end date", "2026-09-30"),
    allocation_percent: { type: "integer", minimum: 0, maximum: 200, example: 75 },
    billable: { type: "boolean", default: true, example: true },
    notes: { type: "string", example: "Ramp to full-time allocation next sprint." },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const projectMilestoneBody = {
  type: "object",
  required: ["name", "due_date", "expected_version"],
  properties: {
    name: { type: "string", example: "Payments core launch" },
    owner_user_id: uuid("Milestone owner user UUID"),
    status: { type: "string", enum: ["planned", "in_progress", "completed", "on_hold"], default: "planned", example: "planned" },
    start_date: date("Milestone start date", "2026-05-01"),
    due_date: date("Milestone due date", "2026-08-15"),
    priority: { type: "string", enum: ["low", "medium", "high", "critical"], default: "medium", example: "high" },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const projectSchema = {
  type: "object",
  required: ["id", "project_code", "name", "client_name", "status", "version", "counts"],
  properties: {
    id: uuid("Project UUID"),
    project_code: { type: "string", example: "ATL-PAY" },
    code: { type: "string", example: "ATL-PAY" },
    name: { type: "string", example: "Atlas Payments Platform" },
    client_name: { type: "string", example: "NorthBank" },
    client: { type: "string", example: "NorthBank" },
    project_type: { type: "string", example: "client" },
    type: { type: "string", example: "client" },
    billing_type: { type: "string", example: "fixed" },
    billingType: { type: "string", example: "fixed" },
    manager_user_id: uuid("Project manager user UUID"),
    manager: { type: "object", additionalProperties: true },
    department: { type: "object", nullable: true, additionalProperties: true },
    start_date: date("Project start date", "2026-05-01"),
    end_date: date("Project end date", "2026-09-30"),
    status: { type: "string", example: "active" },
    health: { type: "string", example: "green" },
    description: { type: "string", nullable: true },
    estimated_hours: money("Estimated hours", "1200.00"),
    actual_hours: money("Actual hours", "420.00"),
    estimated_budget: money("Estimated budget", "250000.00"),
    actual_spend: money("Actual spend", "120000.00"),
    tech_stack: { type: "array", items: { type: "string" } },
    priority: { type: "string", example: "high" },
    cost_center: { type: "string", nullable: true },
    version: { type: "integer", minimum: 1, example: 1 },
    counts: { type: "object", additionalProperties: true },
    permissions: { type: "object", additionalProperties: true },
    members: { type: "array", items: { type: "object", additionalProperties: true } },
    allocations: { type: "array", items: { type: "object", additionalProperties: true } },
    milestones: { type: "array", items: { type: "object", additionalProperties: true } },
    modules: { type: "array", items: { type: "object", additionalProperties: true } },
    documents: { type: "array", items: { type: "object", additionalProperties: true } },
    summary: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const helpdeskQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    status: { type: "string", enum: ["new", "assigned", "in_progress", "on_hold", "resolved", "closed", "reopened", "escalated"], example: "in_progress" },
    priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"], example: "High" },
    category_id: uuid("Helpdesk category UUID"),
    category_key: { type: "string", enum: ["IT", "HR", "Finance", "Admin", "Assets", "Project Support"], example: "IT" },
    assignee_id: uuid("Assigned agent user UUID"),
    requester_id: uuid("Requester user UUID"),
    active_only: { type: "boolean", example: true },
    search: { type: "string", example: "vpn" },
    date_from: date("Created-at lower date filter", "2026-05-01"),
    date_to: date("Created-at upper date filter", "2026-05-31")
  }
};

const helpdeskSubCategorySchema = {
  type: "object",
  required: ["key", "label"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 80, example: "vpn" },
    label: { type: "string", minLength: 1, maxLength: 120, example: "VPN / Network" }
  },
  additionalProperties: false
};

const helpdeskCategorySchema = {
  type: "object",
  required: ["id", "category_key", "label", "team", "active", "sub_categories", "version"],
  properties: {
    id: uuid("Helpdesk category UUID"),
    category_key: { type: "string", enum: ["IT", "HR", "Finance", "Admin", "Assets", "Project Support"], example: "IT" },
    label: { type: "string", example: "IT Support" },
    default_assignee_user_id: { ...uuid("Default assignee user UUID"), nullable: true },
    default_assignee_name: { type: "string", nullable: true, example: "Asset Manager" },
    default_assignee_role: { type: "string", nullable: true, example: "asset_manager" },
    team: { type: "string", example: "IT Operations" },
    active: { type: "boolean", example: true },
    sub_categories: { type: "array", items: helpdeskSubCategorySchema },
    version: { type: "integer", minimum: 1, example: 2 },
    created_at: dateTime("Category creation time"),
    updated_at: dateTime("Category update time"),
    sla: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const helpdeskCategoryCreateBody = {
  type: "object",
  required: ["category_key", "label", "team"],
  properties: {
    category_key: { type: "string", enum: ["IT", "HR", "Finance", "Admin", "Assets", "Project Support"], example: "IT" },
    label: { type: "string", minLength: 1, maxLength: 120, example: "IT Support" },
    default_assignee_user_id: { ...uuid("Default assignee user UUID"), nullable: true },
    default_assignee_name: { type: "string", nullable: true, example: "Asset Manager" },
    default_assignee_role: { type: "string", nullable: true, example: "asset_manager" },
    team: { type: "string", minLength: 1, maxLength: 120, example: "IT Operations" },
    active: { type: "boolean", default: true, example: true },
    sub_categories: { type: "array", maxItems: 40, items: helpdeskSubCategorySchema }
  },
  additionalProperties: false
};

const helpdeskCategoryUpdateBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    label: { type: "string", minLength: 1, maxLength: 120, example: "IT Support" },
    default_assignee_user_id: { ...uuid("Default assignee user UUID"), nullable: true },
    default_assignee_name: { type: "string", nullable: true, example: "Asset Manager" },
    default_assignee_role: { type: "string", nullable: true, example: "asset_manager" },
    team: { type: "string", minLength: 1, maxLength: 120, example: "IT Operations" },
    active: { type: "boolean", example: false },
    sub_categories: { type: "array", maxItems: 40, items: helpdeskSubCategorySchema },
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const helpdeskCategoryMutationResponse = {
  type: "object",
  required: ["category", "version"],
  properties: {
    category: helpdeskCategorySchema,
    version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const helpdeskTicketBody = {
  type: "object",
  required: ["subject", "description"],
  properties: {
    category_id: uuid("Helpdesk category UUID"),
    category_key: { type: "string", enum: ["IT", "HR", "Finance", "Admin", "Assets", "Project Support"], example: "IT" },
    subject: { type: "string", minLength: 3, maxLength: 180, example: "VPN not connecting" },
    description: { type: "string", minLength: 3, maxLength: 4000, example: "The VPN client times out after 30 seconds." },
    sub_category: { type: "string", maxLength: 120, example: "vpn" },
    priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"], default: "Medium", example: "High" },
    document_ids: { type: "array", items: uuid("Document UUID") },
    attachment_name: { type: "string", maxLength: 240, example: "vpn-error.png" },
    related_asset_id: { type: "string", example: "AST-7710" },
    related_project_id: { type: "string", example: "HAW-HRMS" }
  },
  additionalProperties: false
};

const helpdeskTicketUpdateBody = {
  ...helpdeskTicketBody,
  required: ["expected_version"],
  properties: {
    ...helpdeskTicketBody.properties,
    expected_version: { type: "integer", minimum: 1, example: 2 }
  }
};

const helpdeskCommentBody = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 4000, example: "Looking into this now." },
    document_ids: { type: "array", items: uuid("Document UUID") },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const helpdeskAttachmentBody = {
  type: "object",
  properties: {
    document_id: uuid("Document UUID"),
    attachment_type: { type: "string", default: "supporting_document", example: "supporting_document" },
    file_name: { type: "string", example: "vpn-error.png" },
    size_text: { type: "string", example: "240 KB" },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const helpdeskAssignBody = {
  type: "object",
  required: ["assignee_user_id", "expected_version"],
  properties: {
    assignee_user_id: uuid("Assignee user UUID"),
    remarks: { type: "string", example: "Routing to IT operations." },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const helpdeskPriorityBody = {
  type: "object",
  required: ["priority", "expected_version"],
  properties: {
    priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"], example: "Urgent" },
    remarks: { type: "string", example: "Customer impact is blocking work." },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const helpdeskStatusBody = {
  type: "object",
  required: ["status", "expected_version"],
  properties: {
    status: { type: "string", enum: ["new", "assigned", "in_progress", "on_hold", "reopened", "escalated"], example: "in_progress" },
    remarks: { type: "string", example: "Waiting for vendor confirmation." },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const helpdeskResolveBody = {
  type: "object",
  required: ["resolution", "expected_version"],
  properties: {
    resolution: { type: "string", minLength: 3, maxLength: 2000, example: "Reset VPN profile and confirmed connection." },
    document_ids: { type: "array", items: uuid("Document UUID") },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  },
  additionalProperties: false
};

const helpdeskCloseBody = {
  type: "object",
  required: ["expected_version"],
  properties: {
    satisfaction: { type: "integer", minimum: 1, maximum: 5, example: 5 },
    remarks: { type: "string", example: "Confirmed fixed." },
    expected_version: { type: "integer", minimum: 1, example: 3 }
  },
  additionalProperties: false
};

const helpdeskReopenBody = {
  type: "object",
  required: ["reason", "expected_version"],
  properties: {
    reason: { type: "string", minLength: 3, maxLength: 1000, example: "The same VPN error returned." },
    expected_version: { type: "integer", minimum: 1, example: 4 }
  },
  additionalProperties: false
};

const helpdeskTicketSchema = {
  type: "object",
  required: ["id", "ticket_no", "subject", "category_key", "priority", "status", "requester_user_id", "version"],
  properties: {
    id: uuid("Helpdesk ticket UUID"),
    ticket_no: { type: "string", example: "TKT-12001" },
    display_id: { type: "string", example: "TKT-12001" },
    subject: { type: "string", example: "VPN not connecting" },
    description: { type: "string", example: "VPN client times out." },
    category_id: uuid("Helpdesk category UUID"),
    category_key: { type: "string", example: "IT" },
    category: { type: "object", additionalProperties: true },
    sub_category: { type: "string", nullable: true, example: "vpn" },
    priority: { type: "string", example: "High" },
    status: { type: "string", example: "in_progress" },
    requester_user_id: uuid("Requester user UUID"),
    requester_name: { type: "string", example: "Employee E1" },
    requester_email: { type: "string", nullable: true, example: "e1@example.test" },
    requester_department: { type: "string", nullable: true, example: "Sales" },
    assignee_user_id: uuid("Assigned agent user UUID"),
    assignee_name: { type: "string", nullable: true, example: "Asset Manager" },
    assignee_role: { type: "string", nullable: true, example: "Asset Manager" },
    first_response_at: dateTime("First public agent response time"),
    resolved_at: dateTime("Resolution time"),
    closed_at: dateTime("Closure time"),
    resolution: { type: "string", nullable: true },
    reopen_count: { type: "integer", minimum: 0, example: 0 },
    escalated: { type: "boolean", example: false },
    sla: { type: "object", additionalProperties: true },
    counts: { type: "object", additionalProperties: true },
    comments: { type: "array", items: { type: "object", additionalProperties: true } },
    attachments: { type: "array", items: { type: "object", additionalProperties: true } },
    events: { type: "array", items: { type: "object", additionalProperties: true } },
    version: { type: "integer", minimum: 1, example: 2 },
    created_at: dateTime("Created timestamp"),
    updated_at: dateTime("Updated timestamp")
  },
  additionalProperties: true
};

const helpdeskMutationResponse = {
  type: "object",
  required: ["ticket", "version"],
  properties: {
    ticket: helpdeskTicketSchema,
    version: { type: "integer", minimum: 1, example: 2 },
    ticket_version: { type: "integer", minimum: 1, example: 2 },
    comment: { type: "object", additionalProperties: true },
    note: { type: "object", additionalProperties: true },
    attachment: { type: "object", additionalProperties: true },
    sla: { type: "object", additionalProperties: true },
    resolved_at: dateTime("Resolution time"),
    closed_at: dateTime("Closure time"),
    reopened_at: dateTime("Reopen time")
  },
  additionalProperties: true
};

const notificationsQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    unread_only: { type: "boolean", example: true },
    type: { type: "string", maxLength: 80, example: "approval" }
  }
};

const notificationSchema = {
  type: "object",
  required: ["id", "type", "title", "description", "category", "read", "status", "created_at", "version"],
  properties: {
    id: uuid("Notification UUID"),
    type: { type: "string", example: "expense.submitted" },
    title: { type: "string", example: "Timesheet submitted" },
    description: { type: "string", example: "Employee E1 submitted the current week for approval." },
    category: { type: "string", enum: ["approval", "mention", "system", "alert"], example: "approval" },
    action_url: { type: "string", nullable: true, example: "/timesheet/approvals" },
    actor_user_id: uuid("Actor user UUID"),
    actor_name: { type: "string", nullable: true, example: "Employee E1" },
    target_user_id: uuid("Target user UUID"),
    read: { type: "boolean", example: false },
    status: { type: "string", enum: ["pending", "sent", "dead_letter"], example: "pending" },
    read_at: dateTime("Read timestamp"),
    created_at: dateTime("Created timestamp"),
    updated_at: dateTime("Updated timestamp"),
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const notificationMarkReadBody = {
  type: "object",
  properties: {
    expected_version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: false
};

const notificationReadAllBody = {
  type: "object",
  properties: {
    type: { type: "string", maxLength: 80, example: "approval" },
    before: dateTime("Only notifications created before this timestamp")
  },
  additionalProperties: false
};

const notificationMarkReadResponse = {
  type: "object",
  required: ["notification", "unread_count"],
  properties: {
    notification: notificationSchema,
    unread_count: { type: "integer", minimum: 0, example: 2 }
  },
  additionalProperties: false
};

const notificationReadAllResponse = {
  type: "object",
  required: ["updated_count", "unread_count"],
  properties: {
    updated_count: { type: "integer", minimum: 0, example: 3 },
    unread_count: { type: "integer", minimum: 0, example: 0 }
  },
  additionalProperties: false
};

const documentUploadBody = {
  type: "object",
  required: ["business_object_type", "business_object_id", "classification", "document_type", "file_name", "mime_type", "size_bytes"],
  properties: {
    business_object_type: { type: "string", example: "expense_ticket" },
    business_object_id: uuid("Business object UUID"),
    classification: { type: "string", enum: ["normal", "finance", "medical", "compensation", "legal", "audit"], example: "finance" },
    document_type: { type: "string", minLength: 1, example: "receipt" },
    file_name: { type: "string", minLength: 1, example: "receipt.pdf" },
    mime_type: { type: "string", minLength: 1, example: "application/pdf" },
    size_bytes: { type: "integer", minimum: 1, example: 2000 },
    checksum_sha256: { type: "string", example: "b94d27b9934d3e08a52e52d7da7dabfade" }
  },
  description: "Document binary is handled through the backend object-storage adapter. Do not send object-storage credentials."
};

const documentUploadPolicySchema = {
  type: "object",
  required: [
    "max_bytes",
    "image_max_width",
    "image_max_height",
    "image_jpeg_quality",
    "allowed_mime_types",
    "image_output_mime_type",
    "cloudinary_transformation",
    "company_logo"
  ],
  properties: {
    max_bytes: { type: "integer", minimum: 131072, example: 10485760 },
    image_max_width: { type: "integer", minimum: 256, example: 1600 },
    image_max_height: { type: "integer", minimum: 256, example: 1600 },
    image_jpeg_quality: { type: "number", minimum: 0.5, maximum: 0.95, example: 0.82 },
    allowed_mime_types: {
      type: "array",
      items: { type: "string" },
      example: ["application/pdf", "image/jpeg", "image/png", "image/webp"]
    },
    image_output_mime_type: { type: "string", enum: ["image/jpeg"], example: "image/jpeg" },
    cloudinary_transformation: { type: "string", example: "q_auto:eco,f_auto" },
    company_logo: {
      type: "object",
      required: [
        "max_bytes",
        "image_max_width",
        "image_max_height",
        "image_jpeg_quality",
        "allowed_mime_types",
        "image_output_mime_type",
        "cloudinary_transformation"
      ],
      properties: {
        max_bytes: { type: "integer", minimum: 51200, example: 2097152 },
        image_max_width: { type: "integer", minimum: 128, example: 512 },
        image_max_height: { type: "integer", minimum: 128, example: 512 },
        image_jpeg_quality: { type: "number", minimum: 0.5, maximum: 0.95, example: 0.82 },
        allowed_mime_types: {
          type: "array",
          items: { type: "string" },
          example: ["image/jpeg", "image/png", "image/webp"]
        },
        image_output_mime_type: { type: "string", enum: ["image/jpeg"], example: "image/jpeg" },
        cloudinary_transformation: { type: "string", example: "c_fit,w_512,h_512,q_auto:eco,f_auto" }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

const expenseDocumentUploadBody = {
  ...documentUploadBody,
  required: ["classification", "document_type", "file_name", "mime_type", "size_bytes"],
  properties: without(documentUploadBody.properties as RouteSchema, ["business_object_type", "business_object_id"])
};
const emsDocumentUploadBody = {
  ...expenseDocumentUploadBody,
  properties: {
    ...(expenseDocumentUploadBody.properties as RouteSchema),
    replace_document_id: uuid("Existing EMS document UUID to replace")
  },
  description: "EMS employee document upload metadata. The path employee user id is used as the business object id; binary storage is handled by the backend object-storage adapter."
};

const routeDocs: Record<string, RouteSchema> = {
  "GET /health/live": operation("Platform / Health", "Liveness check", "Unversioned container liveness probe.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /health/ready": operation("Platform / Health", "Readiness check", "Unversioned readiness probe showing configured PostgreSQL, Valkey, and object-storage adapters.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /api/v1/health/live": operation("Platform / Health", "Versioned liveness check", "Versioned liveness probe for API clients.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /api/v1/health/ready": operation("Platform / Health", "Versioned readiness check", "Versioned readiness probe for API clients.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /api/v1/openapi.json": operation("Platform / Health", "OpenAPI JSON", "Returns the generated OpenAPI 3.0 contract used by Swagger UI.", { response200: { type: "object", additionalProperties: true }, rateLimited: false }, false),
  "POST /api/v1/webhooks/resend": operation("Platform / Health", "Resend webhook", "Accepts Resend transactional email webhooks after raw-body Svix signature verification, stores deduplicated provider events, and updates email delivery status. Webhook events never mark a user email as verified.", {
    body: { type: "object", additionalProperties: true },
    response200: {
      type: "object",
      required: ["received", "duplicate"],
      properties: {
        received: { type: "boolean", example: true },
        duplicate: { type: "boolean", example: false },
        event_type: { type: "string", example: "email.delivered" }
      },
      additionalProperties: false
    },
    rateLimited: false
  }, false),

  "POST /api/v1/auth/signup": operation("Auth & Sessions", "Signup", "Creates a pending workspace signup identity with hashed token-based email verification and queues a transactional verification email. Duplicate verified emails and bootstrapped company slugs return 409. Password is optional; if omitted, verify-email leads to set-password. Local/QA responses include dev_only tokens for automation; production omits them.", { body: signupBodySchema, response200: signupResponseSchema }, false),
  "POST /api/v1/auth/verify-email": operation("Auth & Sessions", "Verify email", "Consumes a one-time app-owned email verification token, marks the user email as verified, activates the pending identity when a password exists, or issues a password setup action when no password was supplied. Resend webhook events are not trusted for verification. Reused tokens return 409 and expired/invalid tokens return 400.", { body: verifyEmailBodySchema, response200: verifyEmailResponseSchema }, false),
  "POST /api/v1/auth/email-verifications/resend": operation("Auth & Sessions", "Resend email verification", "Enumeration-safe resend endpoint for pending signups. The response is accepted for unknown or already-verified emails and does not reveal whether an email was sent; pending users are protected by cooldown/hourly/daily resend limits. Local/QA may include a dev_only token when a pending identity exists.", { body: resendEmailVerificationBodySchema, response200: resendEmailVerificationResponseSchema }, false),
  "POST /api/v1/auth/set-password": operation("Auth & Sessions", "Set password", "Sets the initial password for an invited or verified account using a one-time password_setup token. Password confirmation is required, reused tokens return 409, and successful setup enables login.", { body: passwordSetBodySchema, response200: setPasswordResponseSchema }, false),
  "POST /api/v1/auth/password-reset/request": operation("Auth & Sessions", "Request password reset", "Enumeration-safe password reset request. The response shape is the same for existing and unknown emails; Local/QA may include a dev_only token only for automation.", { body: resendEmailVerificationBodySchema, response200: passwordResetRequestResponseSchema }, false),
  "POST /api/v1/auth/password-reset/confirm": operation("Auth & Sessions", "Confirm password reset", "Consumes a one-time password_reset token, replaces the active password hash, and revokes active sessions for the user. Reused tokens return 409 and invalid/expired tokens return 400.", { body: passwordSetBodySchema, response200: passwordResetConfirmResponseSchema }, false),
  "POST /api/v1/onboarding/company-logo": operation("Auth & Sessions", "Upload onboarding company logo", "Uploads the pending company logo through the backend object-storage adapter using an active company bootstrap token. Images follow the global media upload policy and are transformed by Cloudinary when real storage is configured.", { body: companyLogoUploadBodySchema, response200: { type: "object", required: ["company", "document"], properties: { company: adminCompanyProfileSchema, document: documentSchema }, additionalProperties: true } }, false),
  "POST /api/v1/onboarding/company-bootstrap": operation("Auth & Sessions", "Company bootstrap", "Completes first-company setup using the one-time company bootstrap token issued after email verification. The bootstrap user is promoted to Admin, company preferences are saved, and duplicate bootstrap attempts return 409.", { body: companyBootstrapBodySchema, response200: companyBootstrapResponseSchema }, false),
  "PATCH /api/v1/auth/session/preference": operation("Auth & Sessions", "Update session preference", "Persists active role, optional company context, landing page, locale, and timezone for the current authenticated user. The selected role must already be assigned to the user; otherwise the backend returns 403.", { body: sessionPreferenceBodySchema, response200: authSessionContextSchema }),
  "POST /api/v1/auth/login": operation(
    "Auth & Sessions",
    "Login",
    "Authenticates the platform using email/password and establishes shared session context for all web zones. Successful login also sets the configured HttpOnly session cookie. A DEV-only `employee_code` fallback remains available for local QA scripts, but the primary consumer contract is email/password.",
    {
      body: {
        type: "object",
        required: ["email", "password"],
        additionalProperties: false,
        properties: {
          email: {
            type: "string",
            format: "email",
            description: "Seeded local QA user email. Example is the Finance Manager persona.",
            example: "finance@example.test"
          },
          password: {
            type: "string",
            format: "password",
            minLength: 8,
            description: "Local Docker QA demo password. Never send this in URLs or logs.",
            example: "LocalDev@123"
          },
          employee_code: {
            type: "string",
            minLength: 1,
            description: "DEV-only fallback for legacy local QA scripts. Primary UI and consumer docs use email/password.",
            example: "N1"
          }
        },
        example: { email: "finance@example.test", password: "LocalDev@123" }
      },
      response200: {
        type: "object",
        required: ["user", "access_token", "expires_at"],
        properties: {
          user: authUserSchema,
          access_token: { type: "string", description: "JWT access token for API clients. Do not hard-code this value.", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
          expires_at: dateTime("Session expiration timestamp")
        }
      },
      response: {
        401: { description: "Invalid email/password or inactive session.", content: { "application/json": { schema: errorResponseSchema } } },
        403: { description: "Inactive or blocked user if policy denies login.", content: { "application/json": { schema: errorResponseSchema } } }
      }
    },
    false
  ),
  "POST /api/v1/auth/logout": operation("Auth & Sessions", "Logout", "Revokes the current Valkey-backed session when a valid cookie is present and always clears the browser session cookie. Safe to call when no session is present.", { response200: statusResponseSchema }, false),
  "GET /api/v1/auth/me": operation("Auth & Sessions", "Current session", "Returns the authenticated actor resolved from bearer token or session cookie, including active role, available roles, permissions, navigation hints, company context, preferences, and low-bandwidth client defaults.", { response200: authSessionContextSchema }),

  "GET /api/v1/core/master-data/org-selectors": operation("Core / Employees & Hierarchy", "Org selectors", "Returns active departments, designations, manager candidates, and backend role labels used by employee create/edit forms. The list is scoped by the authenticated actor where manager visibility is restricted.", { response200: orgSelectorsResponseSchema }),
  "GET /api/v1/core/users": operation("Core / Employees & Hierarchy", "List users", "Paginated employee/user search for authorized modules and admins. Supports frontend table filters, manager scoping, login-state filters, sorting, compact org references, and summary counts.", { querystring: { ...paginationQuerySchema, properties: { ...paginationQuerySchema.properties, q: { type: "string", description: "Optional employee code/name/email search.", example: "E1" }, department_id: uuid("Filter by department UUID"), designation_id: uuid("Filter by designation UUID"), role: { type: "string", description: "Filter by assigned role label.", example: "Employee" }, employment_status: { type: "string", enum: ["active", "inactive", "terminated", "suspended"], example: "active" }, manager_user_id: uuid("Filter by direct manager UUID"), login_state: { type: "string", enum: ["enabled", "disabled", "setup_pending"], example: "enabled" } } }, response200: coreUserListResponseSchema }),
  "POST /api/v1/core/users": operation("Core / Employees & Hierarchy", "Create user", "Creates a Core employee profile with department, designation, reporting manager, roles, lifecycle status, and optional password setup action. The API never creates a shared/default production password; login enablement queues password setup.", { body: coreUserCreateBodySchema, response200: coreUserMutationResponseSchema }),
  "GET /api/v1/core/users/profile-photo-policy": operation("Core / Employees & Hierarchy", "Get profile photo upload policy", "Returns backend-owned profile photo upload limits, allowed image MIME types, compression dimensions, and Cloudinary upload transformation so clients can compress before upload.", { response200: coreProfilePhotoPolicySchema }),
  "GET /api/v1/core/users/{id}": operation("Core / Employees & Hierarchy", "Get user", "Returns one Core employee/user record with reporting line, role assignments, login state, and compact cross-module summaries for employee detail tabs.", { params: idParamSchema, response200: coreUserDetailSchema }),
  "PATCH /api/v1/core/users/{id}": operation("Core / Employees & Hierarchy", "Update user", "Updates an employee profile, org placement, manager, lifecycle fields, and optimistic concurrency version. Manager changes update descendant hierarchy paths and block hierarchy cycles.", { params: idParamSchema, body: coreUserUpdateBodySchema, response200: coreUserMutationResponseSchema }),
  "POST /api/v1/core/users/{id}/profile-photo": operation("Core / Employees & Hierarchy", "Upload profile photo", "Uploads a compressed employee profile photo through the document storage pipeline. Admin/HR can update employee photos; employees can update their own. Real storage uses Cloudinary with a profile-specific transformation.", { params: idParamSchema, body: coreProfilePhotoUploadBodySchema, response200: coreUserMutationResponseSchema }),
  "DELETE /api/v1/core/users/{id}/profile-photo": operation("Core / Employees & Hierarchy", "Remove profile photo", "Deletes the current profile-photo document when one exists and clears profile photo metadata. Admin/HR can remove employee photos; employees can remove their own.", { params: idParamSchema, response200: coreUserMutationResponseSchema }),
  "POST /api/v1/core/users/{id}/activate": operation("Core / Employees & Hierarchy", "Activate user", "Reactivates an inactive, suspended, or terminated employee profile with optimistic concurrency protection.", { params: idParamSchema, body: coreUserStatusBodySchema, response200: coreUserMutationResponseSchema }),
  "POST /api/v1/core/users/{id}/deactivate": operation("Core / Employees & Hierarchy", "Deactivate user", "Deactivates, suspends, or terminates an employee, revokes active login credentials, and emits a platform event for downstream offboarding workflows such as asset recovery.", { params: idParamSchema, body: coreUserStatusBodySchema, response200: coreUserMutationResponseSchema }),
  "POST /api/v1/core/users/{id}/login/enable": operation("Core / Employees & Hierarchy", "Enable login setup", "Starts login enablement by issuing a one-time password setup action. Local/QA responses include a dev_only token; production must deliver the setup action via configured email/notification provider before sign-in succeeds.", { params: idParamSchema, body: coreUserLoginBodySchema, response200: coreUserMutationResponseSchema }),
  "POST /api/v1/core/users/{id}/login/disable": operation("Core / Employees & Hierarchy", "Disable login", "Revokes active user credentials, revokes active sessions where the session store supports it, and marks login disabled with optimistic concurrency protection.", { params: idParamSchema, body: coreUserLoginBodySchema, response200: coreUserMutationResponseSchema }),
  "PUT /api/v1/core/users/{id}/roles": operation("Core / Employees & Hierarchy", "Replace roles", "Replaces backend role assignments for an employee. Admin can assign all roles; HR Manager can assign non-admin roles and cannot modify admin users. Active session preference is adjusted if the previous active role is removed.", { params: idParamSchema, body: coreUserRolesBodySchema, response200: coreUserMutationResponseSchema }),
  "GET /api/v1/core/users/{id}/roles/history": operation("Core / Employees & Hierarchy", "Role assignment history", "Returns a paginated role assignment timeline backed by durable core user outbox events. Admin, HR Manager, Auditor, and the employee themself can read it; managers do not receive sensitive role history unless they have HR/Admin/Auditor scope.", { params: idParamSchema, querystring: paginationQuerySchema, response200: { ...paginated(coreUserRoleHistoryEntrySchema), additionalProperties: true } }),
  "GET /api/v1/core/users/{id}/audit": operation("Core / Employees & Hierarchy", "Employee audit trail", "Returns profile, lifecycle, login, and role audit events for an employee. Secret/token-like payload keys are redacted before returning metadata.", { params: idParamSchema, querystring: coreUserAuditQuerySchema, response200: { ...paginated(coreUserAuditEntrySchema), additionalProperties: true } }),
  "POST /api/v1/core/users/imports": operation("Core / Employees & Hierarchy", "Create employee import job", "Queues an employee import job from an uploaded document reference or file metadata. This slice records durable job metadata in the transactional outbox; row parsing and generated user creation remain production hardening work.", { body: coreUserImportBodySchema, response200: coreUserImportJobSchema }),
  "GET /api/v1/core/users/imports/{job_id}": operation("Core / Employees & Hierarchy", "Get employee import job", "Returns an employee import job status, counts, row errors, and created-user preview from durable outbox metadata.", { params: coreImportJobParamSchema, response200: coreUserImportJobSchema }),
  "POST /api/v1/core/users/exports": operation("Core / Employees & Hierarchy", "Create employee export job", "Creates CSV or XLSX employee export documents for HR/Admin/Auditor users when object storage is configured.", { body: coreUserExportBodySchema, response200: coreUserExportJobSchema }),
  "GET /api/v1/core/users/{id}/subtree": operation(
    "Core / Employees & Hierarchy",
    "Hierarchy subordinate subtree",
    "Returns the active, non-deleted subordinate hierarchy below a user. Admin, HR Manager, and Auditor can inspect any active root; other actors can inspect only self or a root inside their own hierarchy path. The response is backed by the ltree-style hierarchy path and includes relative depth and summary counts.",
    { params: idParamSchema, querystring: paginationQuerySchema, response200: subtreeResponseSchema }
  ),
  "GET /api/v1/dashboard/summary": operation(
    "Dashboard",
    "Dashboard summary",
    "Returns a role-scoped dashboard summary assembled from implemented backend modules only: Core users, Expenses, Documents, Assets, Timesheets, Attendance, Leave/WFH, Notifications, and Outbox. Missing modules such as Helpdesk and Projects are explicitly marked not_implemented instead of returning mock counts.",
    { response200: dashboardSummarySchema }
  ),
  "POST /api/v1/projects": operation("Projects / Utilization", "Create project", "Creates a project with core delivery metadata, owning manager, dates, budget/effort estimates, and optimistic concurrency version. Admin can create for any active manager; non-admin managers can create projects for themselves.", { body: projectBody, response200: { type: "object", required: ["project", "version"], properties: { project: projectSchema, version: { type: "integer", example: 1 } }, additionalProperties: true } }),
  "GET /api/v1/projects": operation("Projects / Utilization", "List projects", "Lists projects visible to portfolio roles, assigned project managers, reporting managers, and project members. Supports status, client, manager, search, pagination, and totals.", { querystring: projectQuerySchema, response200: { ...paginated(projectSchema), additionalProperties: true } }),
  "GET /api/v1/projects/{id}": operation("Projects / Utilization", "Project detail", "Returns one project detail with optional included members, allocation history, milestones/modules, documents, and summary data.", { params: idParamSchema, querystring: projectQuerySchema, response200: projectSchema }),
  "PATCH /api/v1/projects/{id}": operation("Projects / Utilization", "Update project", "Updates project metadata with optimistic concurrency protection. Only Admin or the assigned project manager can mutate the project.", { params: idParamSchema, body: projectUpdateBody, response200: { type: "object", required: ["project", "version"], properties: { project: projectSchema, version: { type: "integer", example: 2 } }, additionalProperties: true } }),
  "POST /api/v1/projects/{id}/archive": operation("Projects / Utilization", "Archive project", "Archives a project with optimistic concurrency. Active projects with active members must first be moved out of active delivery state or members removed.", { params: idParamSchema, body: projectArchiveBody, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/projects/{id}/members": operation("Projects / Utilization", "List project members", "Lists members assigned to a project with active-only and role filters.", { params: idParamSchema, querystring: projectQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/projects/{id}/members": operation("Projects / Utilization", "Add project member", "Adds an active employee to a project and creates the initial allocation row with project-level optimistic concurrency.", { params: idParamSchema, body: projectMemberBody, response200: { type: "object", additionalProperties: true } }),
  "PATCH /api/v1/projects/{id}/members/{member_id}": operation("Projects / Utilization", "Update project member", "Updates or removes a project member with member-level optimistic concurrency and returns project version/capacity warnings.", { params: { type: "object", required: ["id", "member_id"], properties: { id: uuid("Project UUID"), member_id: uuid("Project member UUID") } }, body: projectMemberUpdateBody, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/projects/{id}/allocations": operation("Projects / Utilization", "List allocation history", "Lists project allocation entries with employee and date-range filters, plus allocation totals.", { params: idParamSchema, querystring: projectQuerySchema, response200: { ...paginated({ type: "object", additionalProperties: true }), additionalProperties: true } }),
  "POST /api/v1/projects/{id}/allocations": operation("Projects / Utilization", "Create allocation", "Creates an allocation entry for an active project member, updates the member allocation snapshot, and returns capacity warnings.", { params: idParamSchema, body: projectAllocationBody, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/projects/{id}/milestones": operation("Projects / Utilization", "List milestones", "Lists project modules/milestones visible to project-scoped users.", { params: idParamSchema, querystring: projectQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/projects/{id}/milestones": operation("Projects / Utilization", "Create milestone", "Creates a project module/milestone with project-level optimistic concurrency.", { params: idParamSchema, body: projectMilestoneBody, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/projects/{id}/documents": operation("Projects / Utilization", "List project documents", "Lists project-scoped documents from the existing Documents module metadata. Downloads and verification continue through Documents APIs.", { params: idParamSchema, querystring: projectQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/projects/{id}/summary": operation("Projects / Utilization", "Project summary", "Returns project cards, timesheet rollups, expense rollups, and allocation summary derived from implemented backend modules.", { params: idParamSchema, querystring: projectQuerySchema, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/team-utilization/summary": operation("Projects / Utilization", "Team utilization summary", "Returns bench, overload, capacity, billable/non-billable, and utilization analytics without client-side all-user aggregation.", { querystring: projectQuerySchema, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/helpdesk/tickets": operation("Helpdesk", "Create helpdesk ticket", "Creates a helpdesk ticket for the authenticated employee, snapshots requester context, assigns the category default agent when configured, and starts SLA tracking server-side.", { body: helpdeskTicketBody, response200: helpdeskMutationResponse }),
  "GET /api/v1/helpdesk/tickets": operation("Helpdesk", "List helpdesk tickets", "Lists requester-owned, assigned, or category-scoped helpdesk tickets with pagination, filters, and queue counts.", { querystring: helpdeskQuerySchema, response200: { ...paginated(helpdeskTicketSchema), additionalProperties: true } }),
  "GET /api/v1/helpdesk/tickets/{id}": operation("Helpdesk", "Helpdesk ticket detail", "Returns ticket detail, comments, attachments, events, SLA state, and optimistic concurrency version for authorized requesters and agents.", { params: idParamSchema, response200: helpdeskTicketSchema }),
  "PATCH /api/v1/helpdesk/tickets/{id}": operation("Helpdesk", "Update helpdesk ticket", "Updates allowed ticket fields with optimistic concurrency protection. Closed tickets must be reopened before mutation.", { params: idParamSchema, body: helpdeskTicketUpdateBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/comments": operation("Helpdesk", "Add public ticket comment", "Adds a requester-visible ticket comment and records first-response time when the first public agent response is added.", { params: idParamSchema, body: helpdeskCommentBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/internal-notes": operation("Helpdesk", "Add internal ticket note", "Adds an internal support note visible only to helpdesk agents and scoped managers.", { params: idParamSchema, body: helpdeskCommentBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/attachments": operation("Helpdesk", "Attach helpdesk document", "Attaches backend document metadata or a local file reference to a ticket. Binary upload and secure download stay owned by the Documents module.", { params: idParamSchema, body: helpdeskAttachmentBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/assign": operation("Helpdesk", "Assign helpdesk ticket", "Assigns or reassigns a ticket to an active employee using optimistic concurrency and activity timeline events.", { params: idParamSchema, body: helpdeskAssignBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/priority": operation("Helpdesk", "Change helpdesk priority", "Changes priority, recalculates SLA, and requires remarks when escalating to urgent priority.", { params: idParamSchema, body: helpdeskPriorityBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/status": operation("Helpdesk", "Change helpdesk status", "Changes operational ticket status for assigned/category-scoped agents. Resolve and close use dedicated endpoints.", { params: idParamSchema, body: helpdeskStatusBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/resolve": operation("Helpdesk", "Resolve helpdesk ticket", "Resolves an open ticket with resolution notes, sets resolved timestamp, and preserves SLA metadata.", { params: idParamSchema, body: helpdeskResolveBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/close": operation("Helpdesk", "Close helpdesk ticket", "Closes a resolved ticket by requester or agent with optimistic concurrency protection.", { params: idParamSchema, body: helpdeskCloseBody, response200: helpdeskMutationResponse }),
  "POST /api/v1/helpdesk/tickets/{id}/reopen": operation("Helpdesk", "Reopen helpdesk ticket", "Reopens a resolved or closed ticket with a requester/agent reason and increments reopen count.", { params: idParamSchema, body: helpdeskReopenBody, response200: helpdeskMutationResponse }),
  "GET /api/v1/helpdesk/categories": operation("Helpdesk", "List helpdesk categories", "Returns active ticket categories, default routing metadata, sub-categories, and SLA hints used by the raise-ticket flow.", { querystring: helpdeskQuerySchema, response200: { type: "object", required: ["categories", "sla"], properties: { categories: { type: "array", items: helpdeskCategorySchema }, sla: { type: "object", additionalProperties: true }, actor_scope: { type: "string", example: "requester" } }, additionalProperties: true } }),
  "POST /api/v1/helpdesk/categories": operation("Helpdesk", "Create helpdesk category", "Creates a helpdesk category configuration for scoped helpdesk managers. Category keys use the current supported category set so ticket routing remains compatible with role scopes.", { body: helpdeskCategoryCreateBody, response200: helpdeskCategoryMutationResponse }),
  "PATCH /api/v1/helpdesk/categories/{id}": operation("Helpdesk", "Update helpdesk category", "Updates helpdesk category routing, active status, and sub-categories with optimistic concurrency.", { params: idParamSchema, body: helpdeskCategoryUpdateBody, response200: helpdeskCategoryMutationResponse }),
  "GET /api/v1/helpdesk/sla-report": operation("Helpdesk", "Helpdesk SLA report", "Returns SLA compliance rows and totals for helpdesk managers, admins, and auditors.", { querystring: helpdeskQuerySchema, response200: { ...paginated({ type: "object", additionalProperties: true }), additionalProperties: true } }),
  "GET /api/v1/notifications": operation("Notifications", "List notifications", "Lists authenticated user notifications for the topbar panel with pagination, unread-only, and type/category filtering.", { querystring: notificationsQuerySchema, response200: paginated(notificationSchema) }),
  "GET /api/v1/notifications/unread-count": operation("Notifications", "Unread notification count", "Returns the authenticated user's unread notification count for the topbar badge.", { response200: { type: "object", required: ["unread_count"], properties: { unread_count: { type: "integer", minimum: 0, example: 2 }, latest_created_at: dateTime("Latest unread notification timestamp") }, additionalProperties: false } }),
  "POST /api/v1/notifications/{id}/read": operation("Notifications", "Mark notification read", "Marks one owned notification as read. `expected_version` is optional for topbar interactions but enforces OCC when supplied.", { params: idParamSchema, body: notificationMarkReadBody, response200: notificationMarkReadResponse }),
  "POST /api/v1/notifications/read-all": operation("Notifications", "Mark all notifications read", "Marks all visible unread notifications as read, optionally scoped by type/category or timestamp.", { body: notificationReadAllBody, response200: notificationReadAllResponse }),
  "POST /api/v1/attendance/punches": operation(
    "Attendance",
    "Record punch",
    "Records a check-in, break, resume, or check-out punch for the authenticated employee. Duplicate or out-of-sequence punches return 409 with next allowed actions.",
    { body: attendancePunchBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/attendance/punches/my": operation(
    "Attendance",
    "My punch events",
    "Lists authenticated employee punch events with date range pagination.",
    { querystring: attendanceQuerySchema, response200: paginated(attendancePunchSchema) }
  ),
  "GET /api/v1/attendance/summary/my": operation(
    "Attendance",
    "My attendance summary",
    "Returns authenticated employee attendance summary cards, today's day status, week records, and exception history for a date range or month.",
    { querystring: attendanceQuerySchema, response200: attendanceSummarySchema }
  ),
  "GET /api/v1/attendance/summary/team": operation(
    "Attendance",
    "Team attendance summary",
    "Returns manager/HR/Admin scoped attendance totals, department mix, and compact exceptions for a selected date.",
    { querystring: attendanceQuerySchema, response200: attendanceTeamSummarySchema }
  ),
  "GET /api/v1/attendance/calendar/monthly": operation(
    "Attendance",
    "Monthly attendance calendar",
    "Returns a monthly attendance calendar for self or an in-scope employee. HR, Admin, and Auditor can view all employees; managers can view their hierarchy.",
    { querystring: attendanceQuerySchema, response200: attendanceCalendarSchema }
  ),
  "GET /api/v1/attendance/calendar/daily": operation(
    "Attendance",
    "Daily attendance calendar",
    "Returns day-level attendance records for self, a selected in-scope employee, or a visible team with regularization flags and compact exceptions.",
    { querystring: attendanceQuerySchema, response200: attendanceDailyCalendarSchema }
  ),
  "POST /api/v1/attendance/regularizations": operation(
    "Attendance",
    "Submit attendance regularization",
    "Submits a missing or incorrect punch regularization request for the authenticated employee and routes it to the immediate manager or Admin fallback.",
    { body: attendanceRegularizationCreateBody, response200: attendanceRegularizationSchema }
  ),
  "GET /api/v1/attendance/regularizations/my": operation(
    "Attendance",
    "My regularization requests",
    "Lists authenticated employee regularization requests with status and date filters.",
    { querystring: attendanceQuerySchema, response200: paginated(attendanceRegularizationSchema) }
  ),
  "GET /api/v1/attendance/regularizations/queue/manager": operation(
    "Attendance",
    "Manager regularization queue",
    "Lists attendance regularization requests assigned to the authenticated manager, or all in-scope requests for HR/Admin/Auditor monitor views.",
    { querystring: attendanceQuerySchema, response200: { ...paginated(attendanceRegularizationSchema), additionalProperties: true } }
  ),
  "POST /api/v1/attendance/regularizations/{id}/decision": operation(
    "Attendance",
    "Decide attendance regularization",
    "Approves, returns, or rejects an attendance regularization request with optimistic concurrency. Reject/return require remarks and self-processing is blocked.",
    { params: idParamSchema, body: attendanceRegularizationDecisionBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/attendance/exceptions": operation(
    "Attendance",
    "Attendance exceptions",
    "Lists late, missing punch, absent, early-out, and correction exceptions visible to HR/Admin/Auditor or a reporting manager.",
    { querystring: attendanceQuerySchema, response200: { ...paginated({ type: "object", additionalProperties: true }), additionalProperties: true } }
  ),
  "POST /api/v1/attendance/exports": operation(
    "Attendance",
    "Create attendance export job",
    "Creates CSV, JSON, or XLSX attendance export documents for HR/Admin/Auditor users when object storage is configured.",
    { body: attendanceExportBody, response200: attendanceExportResponseSchema }
  ),
  "GET /api/v1/leave/balances/my": operation(
    "Leave / WFH / Holidays",
    "My leave balances",
    "Returns authenticated employee leave balances, accrual placeholder, and pending Leave/WFH request counts for a selected year.",
    { querystring: leaveWfhQuerySchema, response200: leaveBalanceResponseSchema }
  ),
  "GET /api/v1/leave/balances/{user_id}": operation(
    "Leave / WFH / Holidays",
    "Employee leave balances",
    "Returns leave balances for an in-scope employee. HR/Admin/Auditor can view all users; managers can view reporting hierarchy.",
    { params: userIdParamSchema, querystring: leaveWfhQuerySchema, response200: leaveBalanceResponseSchema }
  ),
  "POST /api/v1/leave/requests": operation(
    "Leave / WFH / Holidays",
    "Apply leave",
    "Submits a Leave request for the authenticated employee, validates date range, overlap, and available non-unpaid balance, then routes it to the immediate manager or Admin fallback.",
    { body: leaveRequestCreateBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/leave/requests/my": operation(
    "Leave / WFH / Holidays",
    "My leave requests",
    "Lists authenticated employee Leave requests with status and date filters.",
    { querystring: leaveWfhQuerySchema, response200: paginated(leaveRequestSchema) }
  ),
  "GET /api/v1/leave/requests/queue/manager": operation(
    "Leave / WFH / Holidays",
    "Manager leave approval queue",
    "Lists Leave requests assigned to the authenticated manager, or all matching requests for HR/Admin decision actors.",
    { querystring: leaveWfhQuerySchema, response200: { ...paginated(leaveRequestSchema), additionalProperties: true } }
  ),
  "POST /api/v1/leave/requests/{id}/decision": operation(
    "Leave / WFH / Holidays",
    "Decide leave request",
    "Approves, returns, or rejects a pending Leave request with optimistic concurrency. Reject/return require remarks and self-processing is blocked.",
    { params: idParamSchema, body: leaveWfhDecisionBody, response200: { type: "object", additionalProperties: true } }
  ),
  "POST /api/v1/leave/requests/{id}/cancel": operation(
    "Leave / WFH / Holidays",
    "Cancel leave request",
    "Cancels an own pending/returned Leave request, with HR/Admin override and optimistic concurrency protection.",
    { params: idParamSchema, body: leaveWfhCancelBody, response200: { type: "object", additionalProperties: true } }
  ),
  "POST /api/v1/wfh/requests": operation(
    "Leave / WFH / Holidays",
    "Apply WFH",
    "Submits a Work From Home request for the authenticated employee, validates date range and active Leave/WFH overlap, then routes it to the immediate manager or Admin fallback.",
    { body: wfhRequestCreateBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/wfh/requests/my": operation(
    "Leave / WFH / Holidays",
    "My WFH requests",
    "Lists authenticated employee WFH requests with status and date filters.",
    { querystring: leaveWfhQuerySchema, response200: paginated(wfhRequestSchema) }
  ),
  "GET /api/v1/wfh/requests/queue/manager": operation(
    "Leave / WFH / Holidays",
    "Manager WFH approval queue",
    "Lists WFH requests assigned to the authenticated manager, or all matching requests for HR/Admin decision actors.",
    { querystring: leaveWfhQuerySchema, response200: { ...paginated(wfhRequestSchema), additionalProperties: true } }
  ),
  "POST /api/v1/wfh/requests/{id}/decision": operation(
    "Leave / WFH / Holidays",
    "Decide WFH request",
    "Approves, returns, or rejects a pending WFH request with optimistic concurrency. Reject/return require remarks and self-processing is blocked.",
    { params: idParamSchema, body: leaveWfhDecisionBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/leave-wfh/hr-monitor": operation(
    "Leave / WFH / Holidays",
    "HR Leave/WFH monitor",
    "Lists Leave and WFH requests visible to HR/Admin/Auditor with request-kind, status, employee, department, and date filters.",
    { querystring: leaveWfhQuerySchema, response200: { ...paginated({ type: "object", additionalProperties: true }), additionalProperties: true } }
  ),
  "POST /api/v1/leave-wfh/exports": operation(
    "Leave / WFH / Holidays",
    "Create Leave/WFH export job",
    "Creates CSV, JSON, or XLSX Leave/WFH export documents for HR/Admin/Auditor users when object storage is configured.",
    { body: leaveWfhExportBody, response200: leaveWfhExportResponseSchema }
  ),
  "GET /api/v1/holidays": operation(
    "Leave / WFH / Holidays",
    "Holiday calendar",
    "Returns the company holiday calendar for a selected year.",
    { querystring: leaveWfhQuerySchema, response200: holidaysResponseSchema }
  ),
  "PUT /api/v1/holidays/{id}": operation(
    "Leave / WFH / Holidays",
    "Upsert holiday",
    "Creates or updates a holiday calendar entry. HR Manager or Admin role is required; expected_version enforces optimistic concurrency when updating.",
    { params: idParamSchema, body: holidayUpsertBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/profile/me": operation(
    "EMS",
    "My EMS profile",
    "Returns the authenticated employee self-service profile assembled from Core identity plus EMS personal profile fields, reporting line, emergency contacts, and compact EMS summaries.",
    { response200: emsProfileResponseSchema }
  ),
  "PATCH /api/v1/ems/profile/me": operation(
    "EMS",
    "Update my EMS profile",
    "Updates fields that policy allows direct self-service edits for, guarded by expected_version. Restricted fields should use profile-change requests instead.",
    { body: emsProfilePatchBody, response200: { type: "object", additionalProperties: true } }
  ),
  "POST /api/v1/ems/profile-change-requests": operation(
    "EMS",
    "Submit profile change request",
    "Submits a profile change request for HR/Admin approval. Duplicate pending requests for the same field are rejected with 409.",
    { body: emsProfileChangeCreateBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/profile-change-requests/my": operation(
    "EMS",
    "My profile change requests",
    "Lists authenticated employee profile change requests with status filters.",
    { querystring: emsQuerySchema, response200: paginated(emsProfileChangeSchema) }
  ),
  "GET /api/v1/ems/profile-change-requests/queue/hr": operation(
    "EMS",
    "HR profile change queue",
    "Lists HR/Admin-scoped profile change requests, defaulting to pending requests.",
    { querystring: emsQuerySchema, response200: { ...paginated(emsProfileChangeSchema), additionalProperties: true } }
  ),
  "POST /api/v1/ems/profile-change-requests/{id}/decision": operation(
    "EMS",
    "Decide profile change request",
    "Approves, returns, or rejects a pending profile change request with optimistic concurrency. Return/reject require remarks and self-processing is blocked.",
    { params: idParamSchema, body: emsDecisionBody, response200: { type: "object", additionalProperties: true } }
  ),
  "POST /api/v1/ems/requests": operation(
    "EMS",
    "Submit EMS service request",
    "Creates a generic EMS service request for HR or support follow-up.",
    { body: emsRequestCreateBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/requests/my": operation(
    "EMS",
    "My EMS service requests",
    "Lists authenticated employee EMS service requests with type and status filters.",
    { querystring: emsQuerySchema, response200: paginated(emsServiceRequestSchema) }
  ),
  "GET /api/v1/ems/requests/queue/hr": operation(
    "EMS",
    "HR EMS service request queue",
    "Lists HR/Admin-scoped EMS service requests for operational follow-up.",
    { querystring: emsQuerySchema, response200: { ...paginated(emsServiceRequestSchema), additionalProperties: true } }
  ),
  "POST /api/v1/ems/requests/{id}/decision": operation(
    "EMS",
    "Decide EMS service request",
    "Approves, returns, rejects, or closes an EMS service request with optimistic concurrency. Approving a letter request creates an available EMS letter for the requester.",
    { params: idParamSchema, body: emsServiceRequestDecisionBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/admin/onboarding": operation(
    "EMS",
    "EMS admin onboarding queue",
    "Lists HR/Admin onboarding checklists for the visible EMS admin onboarding tab.",
    { querystring: emsQuerySchema, response200: paginated(emsAdminChecklistSchema) }
  ),
  "PATCH /api/v1/ems/admin/onboarding/{id}": operation(
    "EMS",
    "Update EMS onboarding checklist",
    "Updates onboarding checklist steps and status with optimistic concurrency.",
    { params: idParamSchema, body: emsAdminChecklistUpdateBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/admin/probation": operation(
    "EMS",
    "EMS admin probation queue",
    "Lists HR/Admin probation reviews with due dates and employee context.",
    { querystring: emsQuerySchema, response200: paginated(emsProbationReviewSchema) }
  ),
  "POST /api/v1/ems/admin/probation/{id}/decision": operation(
    "EMS",
    "Decide EMS probation review",
    "Confirms or extends an employee probation review with optimistic concurrency.",
    { params: idParamSchema, body: emsProbationDecisionBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/admin/exits": operation(
    "EMS",
    "EMS admin exit checklist queue",
    "Lists HR/Admin exit checklists for visible manager, asset, finance, and relieving-letter clearance steps.",
    { querystring: emsQuerySchema, response200: paginated(emsAdminChecklistSchema) }
  ),
  "PATCH /api/v1/ems/admin/exits/{id}": operation(
    "EMS",
    "Update EMS exit checklist",
    "Updates exit clearance checklist steps and status with optimistic concurrency.",
    { params: idParamSchema, body: emsAdminChecklistUpdateBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/letters": operation(
    "EMS",
    "My EMS letters",
    "Lists HR letters visible to the authenticated employee. HR/Admin can filter by user_id.",
    { querystring: emsQuerySchema, response200: paginated(emsLetterSchema) }
  ),
  "POST /api/v1/ems/letters/{id}/acknowledge": operation(
    "EMS",
    "Acknowledge EMS letter",
    "Acknowledges a letter assigned to the authenticated employee with optimistic concurrency.",
    { params: idParamSchema, body: expectedVersionBodySchema, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/policies": operation(
    "EMS",
    "My EMS policies",
    "Lists active company policies assigned to the authenticated employee with acknowledgement status and acknowledgement summary.",
    { querystring: emsQuerySchema, response200: { ...paginated(emsPolicySchema), additionalProperties: true } }
  ),
  "POST /api/v1/ems/policies/{id}/acknowledge": operation(
    "EMS",
    "Acknowledge EMS policy",
    "Acknowledges the current active version of a policy for the authenticated employee with optimistic concurrency.",
    { params: idParamSchema, body: expectedVersionBodySchema, response200: { type: "object", additionalProperties: true } }
  ),
  "PUT /api/v1/ems/policies/{id}": operation(
    "EMS",
    "Update EMS policy",
    "Updates or publishes a visible EMS policy entry for HR/Admin policy management with optimistic concurrency.",
    { params: idParamSchema, body: emsPolicyUpdateBody, response200: { type: "object", additionalProperties: true } }
  ),
  "GET /api/v1/ems/employees/{user_id}/documents": operation(
    "EMS",
    "List employee EMS documents",
    "Lists employee-scoped EMS documents through the existing Documents module metadata. EMS user visibility is checked first, then document classification policy controls which rows are returned.",
    { params: userIdParamSchema, querystring: emsDocumentQuerySchema, response200: emsEmployeeDocumentListSchema }
  ),
  "POST /api/v1/ems/employees/{user_id}/documents": operation(
    "EMS",
    "Attach employee EMS document",
    "Uploads employee-scoped EMS document metadata using the existing backend object-storage adapter. Employees can attach their own allowed documents; HR/Admin can attach official or restricted employee documents.",
    {
      params: userIdParamSchema,
      body: emsDocumentUploadBody,
      response200: {
        type: "object",
        required: ["document", "access_policy"],
        properties: {
          document: documentSchema,
          access_policy: { type: "object", additionalProperties: true }
        },
        additionalProperties: true
      }
    }
  ),
  "GET /api/v1/admin/company-profile": operation(
    "Admin / Configuration",
    "Read company profile",
    "Returns the active company profile and operational settings used by Admin Settings. Admin role is required.",
    { response200: adminCompanyProfileSchema }
  ),
  "PUT /api/v1/admin/company-profile": operation(
    "Admin / Configuration",
    "Update company profile",
    "Updates company profile and locale/fiscal settings with optimistic concurrency. Admin role is required and the company slug remains stable.",
    { body: adminCompanyProfileUpdateBody, response200: adminCompanyProfileSchema }
  ),
  "POST /api/v1/admin/company-profile/logo": operation(
    "Admin / Configuration",
    "Upload company logo",
    "Uploads or replaces the active company logo through the backend document storage adapter. The company-logo upload policy is returned from /api/v1/documents/upload-policy and uses stricter image-only size and compression limits before Cloudinary upload.",
    { body: adminCompanyLogoUploadBodySchema, response200: { type: "object", required: ["company", "document"], properties: { company: adminCompanyProfileSchema, document: documentSchema }, additionalProperties: true } }
  ),
  "GET /api/v1/admin/master-data/departments": operation(
    "Admin / Configuration",
    "List departments",
    "Lists core departments for Admin Settings master-data management. Admin and HR Manager roles can read the list.",
    { querystring: adminMasterDataQuerySchema, response200: paginated(adminDepartmentSchema) }
  ),
  "POST /api/v1/admin/master-data/departments": operation(
    "Admin / Configuration",
    "Create department",
    "Creates a department master row with duplicate-code protection. Admin and HR Manager roles can mutate master data.",
    {
      body: adminDepartmentCreateBody,
      response200: {
        type: "object",
        required: ["department", "version"],
        properties: { department: adminDepartmentSchema, version: { type: "integer", example: 1 } },
        additionalProperties: false
      }
    }
  ),
  "PATCH /api/v1/admin/master-data/departments/{id}": operation(
    "Admin / Configuration",
    "Update department",
    "Updates department name, code, parent, or active status with optimistic concurrency. Deactivation is blocked while active employees reference the department.",
    {
      params: idParamSchema,
      body: adminDepartmentUpdateBody,
      response200: {
        type: "object",
        required: ["department", "version"],
        properties: { department: adminDepartmentSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/master-data/designations": operation(
    "Admin / Configuration",
    "List designations",
    "Lists core designations for Admin Settings master-data management. Admin and HR Manager roles can read the list.",
    { querystring: adminMasterDataQuerySchema, response200: paginated(adminDesignationSchema) }
  ),
  "POST /api/v1/admin/master-data/designations": operation(
    "Admin / Configuration",
    "Create designation",
    "Creates a designation master row with duplicate-code protection. Admin and HR Manager roles can mutate master data.",
    {
      body: adminDesignationCreateBody,
      response200: {
        type: "object",
        required: ["designation", "version"],
        properties: { designation: adminDesignationSchema, version: { type: "integer", example: 1 } },
        additionalProperties: false
      }
    }
  ),
  "PATCH /api/v1/admin/master-data/designations/{id}": operation(
    "Admin / Configuration",
    "Update designation",
    "Updates designation title, code, level, or active status with optimistic concurrency. Deactivation is blocked while active employees reference the designation.",
    {
      params: idParamSchema,
      body: adminDesignationUpdateBody,
      response200: {
        type: "object",
        required: ["designation", "version"],
        properties: { designation: adminDesignationSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/master-data/{master_key}": operation(
    "Admin / Configuration",
    "List extended master data",
    "Lists persistent Admin Settings master-data rows for employment types, work locations, shifts, leave types, expense categories, asset categories, helpdesk categories, and project roles.",
    { params: adminExtendedMasterDataKeyParamSchema, querystring: adminMasterDataQuerySchema, response200: paginated(adminExtendedMasterDataSchema) }
  ),
  "POST /api/v1/admin/master-data/{master_key}": operation(
    "Admin / Configuration",
    "Create extended master data",
    "Creates a persistent row for an Admin Settings master-data group with duplicate-code protection. Admin and HR Manager roles can mutate master data.",
    {
      params: adminExtendedMasterDataKeyParamSchema,
      body: adminExtendedMasterDataCreateBody,
      response200: {
        type: "object",
        required: ["item", "version"],
        properties: { item: adminExtendedMasterDataSchema, version: { type: "integer", example: 1 } },
        additionalProperties: false
      }
    }
  ),
  "PATCH /api/v1/admin/master-data/{master_key}/{id}": operation(
    "Admin / Configuration",
    "Update extended master data",
    "Updates an Admin Settings master-data row name, code, description, sort order, or active status with optimistic concurrency.",
    {
      params: adminExtendedMasterDataIdParamSchema,
      body: adminExtendedMasterDataUpdateBody,
      response200: {
        type: "object",
        required: ["item", "version"],
        properties: { item: adminExtendedMasterDataSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/rbac/roles": operation(
    "Admin / Configuration",
    "List RBAC roles",
    "Lists persistent RBAC role configuration for Admin Settings. This slice records configuration without changing the existing fixed-role runtime authorization policy.",
    { querystring: { ...paginationQuerySchema, properties: { ...paginationQuerySchema.properties, active_only: { type: "boolean", example: true } } }, response200: paginated(adminRbacRoleSchema) }
  ),
  "POST /api/v1/admin/rbac/roles": operation(
    "Admin / Configuration",
    "Create RBAC role",
    "Creates a custom RBAC role configuration with initial permission IDs. Admin role is required.",
    {
      body: adminRbacRoleCreateBody,
      response200: {
        type: "object",
        required: ["role", "version"],
        properties: { role: adminRbacRoleSchema, version: { type: "integer", example: 1 } },
        additionalProperties: false
      }
    }
  ),
  "PATCH /api/v1/admin/rbac/roles/{id}": operation(
    "Admin / Configuration",
    "Update RBAC role",
    "Updates RBAC role metadata or active status with optimistic concurrency. Protected system roles cannot be deactivated.",
    {
      params: idParamSchema,
      body: adminRbacRoleUpdateBody,
      response200: {
        type: "object",
        required: ["role", "version"],
        properties: { role: adminRbacRoleSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/rbac/permissions": operation(
    "Admin / Configuration",
    "List RBAC permissions",
    "Lists the Admin Settings permission catalog by module/group/action for the RBAC matrix UI.",
    {
      querystring: {
        type: "object",
        properties: {
          module: { type: "string", example: "Employees" },
          search: { type: "string", example: "view" }
        }
      },
      response200: {
        type: "object",
        required: ["items"],
        properties: { items: { type: "array", items: adminRbacPermissionSchema } },
        additionalProperties: false
      }
    }
  ),
  "PUT /api/v1/admin/rbac/roles/{id}/permissions": operation(
    "Admin / Configuration",
    "Replace RBAC role permissions",
    "Replaces a role's RBAC permission IDs with optimistic concurrency. Protected Admin role permissions cannot be replaced in this slice.",
    {
      params: idParamSchema,
      body: adminRbacPermissionsReplaceBody,
      response200: {
        type: "object",
        required: ["role", "version"],
        properties: { role: adminRbacRoleSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/workflows": operation(
    "Admin / Configuration",
    "List admin workflow configurations",
    "Lists persistent Admin Settings approval workflow configuration. This slice records configuration without changing existing feature-specific approval engines.",
    {
      querystring: {
        type: "object",
        properties: {
          module: { type: "string", example: "leave_wfh" }
        }
      },
      response200: {
        type: "object",
        required: ["items", "workflows", "versions"],
        properties: {
          items: { type: "array", items: adminWorkflowSchema },
          workflows: { type: "array", items: adminWorkflowSchema },
          versions: {
            type: "object",
            additionalProperties: { type: "integer", minimum: 1 },
            example: { leave: 1, expense: 1 }
          }
        },
        additionalProperties: false
      }
    }
  ),
  "PUT /api/v1/admin/workflows/{workflow_key}": operation(
    "Admin / Configuration",
    "Update admin workflow configuration",
    "Updates one Admin Settings workflow configuration with optimistic concurrency. Runtime approval routing remains owned by each feature module until the later policy migration.",
    {
      params: workflowKeyParamSchema,
      body: adminWorkflowUpdateBody,
      response200: {
        type: "object",
        required: ["workflow", "version"],
        properties: { workflow: adminWorkflowSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/policies": operation(
    "Admin / Configuration",
    "List admin policy configurations",
    "Lists persistent Admin Settings policy configuration. This slice records policy values without changing existing feature-specific runtime enforcement.",
    {
      querystring: {
        type: "object",
        properties: {
          module: { type: "string", example: "attendance" },
          active_only: { type: "boolean", example: true }
        }
      },
      response200: {
        type: "object",
        required: ["items", "policies", "versions"],
        properties: {
          items: { type: "array", items: adminPolicySchema },
          policies: { type: "array", items: adminPolicySchema },
          versions: {
            type: "object",
            additionalProperties: { type: "integer", minimum: 1 },
            example: { attendance: 1, leave: 1 }
          }
        },
        additionalProperties: false
      }
    }
  ),
  "PUT /api/v1/admin/policies/{policy_key}": operation(
    "Admin / Configuration",
    "Update admin policy configuration",
    "Updates one Admin Settings policy configuration with optimistic concurrency. Runtime policy enforcement remains owned by each feature module until the later policy migration.",
    {
      params: policyKeyParamSchema,
      body: adminPolicyUpdateBody,
      response200: {
        type: "object",
        required: ["policy", "version"],
        properties: { policy: adminPolicySchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/email-templates": operation(
    "Admin / Configuration",
    "List admin email templates",
    "Lists Admin Settings email templates without exposing provider credentials or SMTP secrets.",
    {
      querystring: {
        type: "object",
        properties: {
          module: { type: "string", example: "auth" },
          locale: { type: "string", example: "en-IN" },
          active_only: { type: "boolean", example: true }
        }
      },
      response200: {
        type: "object",
        required: ["items", "templates", "versions"],
        properties: {
          items: { type: "array", items: adminEmailTemplateSchema },
          templates: { type: "array", items: adminEmailTemplateSchema },
          versions: {
            type: "object",
            additionalProperties: { type: "integer", minimum: 1 },
            example: { invite: 1, reset: 1 }
          }
        },
        additionalProperties: false
      }
    }
  ),
  "PUT /api/v1/admin/email-templates/{template_key}": operation(
    "Admin / Configuration",
    "Update admin email template",
    "Updates one Admin Settings email template with optimistic concurrency. Delivery provider configuration is not exposed here.",
    {
      params: emailTemplateKeyParamSchema,
      body: adminEmailTemplateUpdateBody,
      response200: {
        type: "object",
        required: ["template", "version"],
        properties: { template: adminEmailTemplateSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/admin/notification-channels": operation(
    "Admin / Configuration",
    "List admin notification channels",
    "Lists Admin Settings notification event channel preferences. This records configured channels only; provider secrets and runtime delivery filtering remain in later production hardening.",
    {
      querystring: {
        type: "object",
        properties: {
          module: { type: "string", example: "leave_wfh" },
          active_only: { type: "boolean", example: true }
        }
      },
      response200: adminNotificationChannelsResponse
    }
  ),
  "PUT /api/v1/admin/notification-channels": operation(
    "Admin / Configuration",
    "Update admin notification channels",
    "Updates Admin Settings notification event channel preferences with optimistic concurrency. This does not expose SMTP, push, or provider secrets.",
    {
      body: adminNotificationChannelsUpdateBody,
      response200: adminNotificationChannelsResponse
    }
  ),
  "GET /api/v1/admin/audit-log": operation(
    "Admin / Configuration",
    "Admin settings audit log",
    "Lists Admin Settings audit entries derived from durable admin outbox events. Secret values are redacted because payloads expose only event metadata.",
    {
      querystring: adminAuditLogQuerySchema,
      response200: paginated(adminAuditLogEntrySchema)
    }
  ),
  "GET /api/v1/admin/security-settings": operation(
    "Admin / Configuration",
    "Read admin security settings",
    "Returns the enforced Admin Settings security policy for password setup/reset, session TTL, auth rate limits, and audit toggles. MFA is intentionally not enabled in this release.",
    { response200: adminSecuritySettingsSchema }
  ),
  "PUT /api/v1/admin/security-settings": operation(
    "Admin / Configuration",
    "Update admin security settings",
    "Persists basic security settings with optimistic concurrency. Password policy, session TTL, and auth rate-limit changes are enforced by backend runtime paths; MFA must remain false until a provider flow is specified.",
    {
      body: adminSecuritySettingsUpdateBody,
      response200: {
        type: "object",
        required: ["settings", "version"],
        properties: { settings: adminSecuritySettingsSchema, version: { type: "integer", example: 2 } },
        additionalProperties: false
      }
    }
  ),
  "GET /api/v1/platform/finance-governance": operation(
    "Admin / Configuration",
    "Read finance governance configuration",
    "Returns the active global finance governance configuration, manager backup, finance backup, candidate actors, validity flags, and blocking issues.",
    {
      response200: {
        type: "object",
        additionalProperties: true
      }
    }
  ),
  "PUT /api/v1/platform/finance-governance": operation(
    "Admin / Configuration",
    "Update finance governance configuration",
    "Updates the single active global finance manager plus configured manager and finance backups using optimistic concurrency. Only Admin can mutate this state.",
    {
      body: {
        type: "object",
        required: ["primary_finance_manager_user_id", "manager_backup_user_id", "finance_approval_backup_user_id", "effective_from", "status", "expected_version"],
        properties: {
          primary_finance_manager_user_id: uuid("Configured primary finance manager UUID"),
          manager_backup_user_id: { ...uuid("Configured manager backup UUID"), nullable: true },
          finance_approval_backup_user_id: { ...uuid("Configured finance backup UUID"), nullable: true },
          effective_from: date("Effective from"),
          effective_to: { ...date("Effective to"), nullable: true },
          status: { type: "string", enum: ["active", "inactive"], example: "active" },
          expected_version: { type: "integer", minimum: 1, example: 1 }
        }
      },
      response200: {
        type: "object",
        additionalProperties: true
      }
    }
  ),

  "POST /api/v1/expenses": operation("Expenses / Requester", "Create expense", "Creates an expense draft or submitted ticket. Business routing and self-approval prevention remain backend-owned.", { body: expenseCreateBody, response200: ticketSchema }),
  "GET /api/v1/expenses/my": operation("Expenses / Requester", "My expenses", "Lists the authenticated requester's expense tickets.", { querystring: paginationQuerySchema, response200: paginated(ticketSchema) }),
  "GET /api/v1/expenses/metadata": operation("Expenses / Requester", "Expense metadata", "Returns expense form metadata, policy hints, required document selectors, currencies, payment types, and project/client selectors for API-backed expense forms.", { response200: expenseMetadataSchema }),
  "GET /api/v1/expenses/dashboard-summary": operation("Expenses / Requester", "Expense dashboard summary", "Returns role-aware dashboard cards, queue counts, aging buckets, totals, and compact visible rows for the expense dashboard.", { querystring: expenseDashboardQuery, response200: expenseDashboardSummarySchema }),
  "GET /api/v1/expenses/{id}": operation("Expenses / Requester", "Expense detail", "Reads an expense ticket if the actor has object-level access.", { params: idParamSchema, response200: ticketSchema }),
  "PATCH /api/v1/expenses/{id}": operation("Expenses / Requester", "Edit expense placeholder", "Currently restricted by backend policy and returns a documented business validation error.", { params: idParamSchema, body: { type: "object", additionalProperties: true }, response: { 400: { description: "Edit endpoint is intentionally restricted in this delivery.", content: { "application/json": { schema: errorResponseSchema } } } } }),
  "POST /api/v1/expenses/{id}/submit": operation("Expenses / Requester", "Submit expense", "Submits a draft or returned expense using OCC expected_version.", { params: idParamSchema, body: expectedVersionBodySchema, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/withdraw": operation("Expenses / Requester", "Withdraw expense", "Withdraws a requester-owned draft, submitted, pending-manager, or manager-returned expense with OCC expected_version. Remarks are required after submission.", { params: idParamSchema, body: expenseWithdrawBody, response200: expenseWithdrawResponseSchema }),
  "POST /api/v1/expenses/{id}/clarifications": operation("Expenses / Requester", "Add expense clarification", "Appends a durable object-scoped clarification message and returns the current thread. Requester, assigned manager, assigned finance actor, Admin, and Auditor can read according to expense object policy.", { params: idParamSchema, body: expenseClarificationBody, response200: expenseClarificationResponseSchema }),
  "GET /api/v1/expenses/queue/manager": operation("Expenses / Manager", "Manager queue", "Lists expense tickets assigned to the authenticated manager or configured manager backup.", { querystring: paginationQuerySchema, response200: paginated(ticketSchema) }),
  "POST /api/v1/expenses/{id}/manager/verify": operation("Expenses / Manager", "Manager verification decision", "Manager approve/reject/return decision. Reject/return require remarks; self-processing and OCC conflicts are enforced.", { params: idParamSchema, body: expenseDecisionBody, response200: ticketSchema }),

  "GET /api/v1/expenses/queue/finance": operation("Finance Management", "Finance queue", "Role-scoped finance operations queue with status, requester, department, date, payment, type/subtype, amount, document, SLA, and sort filters. On finance-manager self-requests, the configured finance backup may see only explicitly routed tickets.", {
    querystring: {
      ...paginationQuerySchema,
      properties: {
        ...paginationQuerySchema.properties,
        status: { type: "string", enum: ["Manager Verified", "Finance Hold", "Clarification Required", "Finance Approved", "Payment Released", "Bills Submitted", "Pending Adjustment", "Closed"] },
        requester: optionalString("Requester employee code or name filter.", "E1"),
        department: optionalString("Department code or name filter.", "Engineering"),
        date_from: date("Created date from"),
        date_to: date("Created date to"),
        payment_type: { type: "string", enum: ["Advance", "ReimbursementAccrued"] },
        expense_type: { type: "string", enum: ["Project", "SalesPreSales"] },
        expense_sub_type: { type: "string", example: "Project Travel" },
        amount_min: money("Minimum estimated amount", "1000.00"),
        amount_max: money("Maximum estimated amount", "100000.00"),
        document_status: { type: "string", enum: ["any", "complete", "missing"], default: "any" },
        sla_bucket: { type: "string", enum: ["any", "0-24h", "24-72h", "72h-plus"], default: "any" },
        sort: { type: "string", enum: ["sla", "created_at", "amount", "status"], default: "sla" }
      }
    },
    response200: paginated(ticketSchema)
  }),
  "GET /api/v1/expenses/{id}/finance-detail": operation("Finance Management", "Finance ticket detail", "Finance-only read model with ticket, line items, documents, payments, approvals, audit, policy warnings, settlement summary, and governance actor assignment metadata.", { params: idParamSchema, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/expenses/{id}/finance/approve": operation("Finance Management", "Finance approve or hold", "The assigned finance approver approves, holds, or requests clarification after manager verification. Normally this is the configured primary Finance Manager; for finance-manager self-requests it may be the configured Finance/Admin backup. Hold/clarification require remarks; self-processing and OCC conflicts are enforced.", { params: idParamSchema, body: financeVerifyBody, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/finance/payment": operation("Finance Management", "Release payment", "The assigned finance-stage actor releases advance or reimbursement payment with date, amount, mode, reference, and OCC expected_version.", { params: idParamSchema, body: paymentReleaseBody, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/bills": operation("Finance Management", "Submit bills", "Marks bills as submitted for a paid expense. Used before settlement and closure checks.", { params: idParamSchema, body: expectedVersionBodySchema, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/documents/{documentId}/verify": operation("Expenses / Manager", "Verify expense document", "Assigned manager or manager backup verifies an uploaded expense document. Finance settlement remains blocked until every required document for the expense subtype is verified.", { params: expenseDocumentParamSchema, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/settlement": operation("Finance Management", "Approve settlement", "Finalizes settlement and calculates payable/recoverable/no-balance state. Required documents must be verified before closure.", { params: idParamSchema, body: settlementBody, response200: ticketSchema }),
  "GET /api/v1/expenses/{id}/timeline": operation(
    "Expenses / Requester",
    "Expense workflow timeline",
    "Object-scoped visual timeline for an expense ticket. It is derived from immutable audit events and intentionally returns display-safe fields instead of raw audit payloads. Requester, assigned manager/finance actor, Admin, and Auditor can read according to backend object policy.",
    { params: idParamSchema, response200: { type: "array", items: expenseTimelineEventSchema } }
  ),
  "GET /api/v1/expenses/{id}/audit": operation("Finance Management", "Expense audit log", "Immutable expense audit log. Finance/Admin/Auditor and object-scoped actors may read according to backend policy.", { params: idParamSchema, querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/manager-backups": operation("Admin / Configuration", "List manager backups", "Lists active/effective-dated manager backup assignments.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/manager-backups": operation("Admin / Configuration", "Create manager backup", "Creates an effective-dated manager backup assignment. Self mappings and inactive users are blocked.", { body: { type: "object", required: ["employee_user_id", "backup_manager_user_id", "effective_from"], properties: { employee_user_id: uuid("Employee user UUID"), backup_manager_user_id: uuid("Backup manager user UUID"), effective_from: date("Effective from"), effective_to: date("Effective to") } }, response200: { type: "object", additionalProperties: true } }),
  "DELETE /api/v1/manager-backups/{id}": operation("Admin / Configuration", "Revoke manager backup", "Soft-revokes a manager backup assignment. Optional expected_version query supports OCC where available.", { params: idParamSchema, querystring: { type: "object", properties: { expected_version: { type: "integer", minimum: 1, example: 1 } } }, response200: { type: "object", additionalProperties: true } }),

  "POST /api/v1/documents": operation("Documents", "Upload document metadata", "Creates secure document metadata and stores the file through the backend object storage adapter. Object-storage credentials are never exposed.", { body: documentUploadBody, response200: documentSchema }),
  "POST /api/v1/expenses/{id}/documents": operation("Documents", "Upload expense document", "Uploads metadata for an expense ticket document using the path ticket id as business object id.", { params: idParamSchema, body: expenseDocumentUploadBody, response200: documentSchema }),
  "GET /api/v1/documents": operation("Documents", "List documents", "Lists documents visible to the actor with optional business object filters.", { querystring: { ...paginationQuerySchema, properties: { ...paginationQuerySchema.properties, business_object_type: { type: "string", example: "expense_ticket" }, business_object_id: uuid("Business object UUID") } }, response200: paginated(documentSchema) }),
  "GET /api/v1/documents/upload-policy": operation("Documents", "Get media upload policy", "Returns backend-owned media upload limits, allowed MIME types, image compression settings, and Cloudinary transformation used by EMS, expenses, projects, helpdesk, and document uploads.", { response200: documentUploadPolicySchema }),
  "GET /api/v1/documents/{id}": operation("Documents", "Document metadata", "Returns document metadata if classification and object-level access policies allow.", { params: idParamSchema, response200: documentSchema }),
  "DELETE /api/v1/documents/{id}": operation("Documents", "Delete document", "Removes the stored document object and marks the document metadata as deleted after the same write-access policy check. Deleted documents no longer appear in document lists.", { params: idParamSchema, response200: { type: "object", required: ["document_id", "status"], properties: { document_id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["deleted"] } } } }),
  "POST /api/v1/documents/{id}/download-url": operation("Documents", "Create download URL", "Returns a short-lived backend-generated download URL for allowed actors. Does not expose storage credentials.", { params: idParamSchema, response200: { type: "object", required: ["url", "expires_at"], properties: { url: { type: "string", format: "uri", example: "http://localhost:3001/api/v1/documents/downloads/local-token" }, expires_at: dateTime("Download URL expiration") } } }),
  "GET /api/v1/documents/{id}/content": operation("Documents", "Download local document content", "Streams document bytes through the backend for local/mock object storage after the same document access policy check. Real Cloudinary deployments continue to use provider HTTPS URLs from the download-url endpoint.", { params: idParamSchema, response200: { type: "string", format: "binary" } }),
  "POST /api/v1/documents/{id}/verify": operation("Documents", "Verify document", "Marks a document as verified when actor has Finance/HR/Admin classification authority.", { params: idParamSchema, response200: documentSchema }),
  "GET /api/v1/documents/{id}/access-log": operation("Documents", "Document access log", "Paginated immutable document access log for auditors/admins.", { params: idParamSchema, querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),

  "GET /api/v1/reports/expenses/my": operation("Reports & Analytics", "My expense report", "Paginated requester-owned expense report with filters, dashboard cards, totals, document summary, payment summary, and workflow action hints for compact frontend list/cards.", { querystring: expenseReportQuerySchema, response200: expenseReportListSchema }),
  "GET /api/v1/reports/expenses/manager-queue": operation("Reports & Analytics", "Manager queue report", "Manager-scoped queue report with direct/backup assignment counts, aging, amount cards, missing-document indicators, and manager_action_required flags.", { querystring: expenseReportQuerySchema, response200: managerQueueReportSchema }),
  "GET /api/v1/reports/expenses/manager-history": operation("Reports & Analytics", "Manager action history", "Manager-scoped history of verified, returned, and rejected requests with remarks, deciding actor, previous/next status, and audit route metadata.", { querystring: expenseReportQuerySchema, response200: historyReportSchema }),
  "GET /api/v1/reports/expenses/finance-dashboard": operation("Finance Management", "Finance dashboard dataset", "Finance dashboard dataset with cards, aging buckets, payable/recoverable totals, exception counts, document risks, and compact ticket rows.", { querystring: expenseReportQuerySchema, response200: financeDashboardReportSchema }),
  "GET /api/v1/reports/expenses/finance-history": operation("Finance Management", "Finance action history", "Finance history of approval, hold, payment, and settlement actions with actor labels, payment metadata, remarks, and audit event information.", { querystring: expenseReportQuerySchema, response200: historyReportSchema }),
  "GET /api/v1/reports/expenses/finance-analytics": operation("Finance Management", "Finance analytics", "Finance cockpit analytics: cards, aging buckets, payable totals, exception counts, status distribution, spend trend, department/type spend, settlement variance, policy risks, and high-value watchlists.", { response200: financeAnalyticsSchema }),
  "GET /api/v1/reports/expenses/register": operation("Reports & Analytics", "Expense register", "Role-scoped expense register with accounting columns, totals, export column hints, document status, payment reference, settlement delta, filters, and compact rows.", { querystring: expenseReportQuerySchema, response200: registerReportSchema }),
  "GET /api/v1/reports/expenses/advance-aging": operation("Finance Management", "Advance aging report", "Finance report of open advances awaiting bills, settlement, adjustment, or closure.", { querystring: paginationQuerySchema, response200: paginated(ticketSchema) }),
  "GET /api/v1/reports/expenses/payments": operation("Finance Management", "Payment register", "Finance payment release register with ticket context.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/reports/expenses/audit": operation("Finance Management", "Finance audit report", "Read-only audit report for Finance/Auditor/Admin roles.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/reports/hr/employees": operation("Reports & Analytics", "HR employee report", "HR/Admin/Auditor employee master report with headcount, department/designation breakdowns, role access rows, and filters.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/attendance/summary": operation("Reports & Analytics", "Attendance report", "Attendance report rows for daily status, work hours, late/early exceptions, and department/status rollups.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/leave-wfh/summary": operation("Reports & Analytics", "Leave and WFH report", "Leave/WFH report rows with balances, holidays, request status breakdowns, and duration totals.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/projects/summary": operation("Reports & Analytics", "Project portfolio report", "Project report rows with allocations, utilization, assignment history, and cost rollups.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/timesheets/summary": operation("Reports & Analytics", "Timesheet report", "Timesheet report rows with submitted hours, billable mix, project rollups, and productivity rows.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/assets/summary": operation("Reports & Analytics", "Asset report", "Asset report rows with inventory status, maintenance history, recovery queue, and type/status breakdowns.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/helpdesk/summary": operation("Reports & Analytics", "Helpdesk report", "Helpdesk report rows with open/closed/SLA rollups, agent performance, category, employee, and resolution rows.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/audit": operation("Reports & Analytics", "Cross-module audit report", "Admin/Auditor cross-module audit report assembled from expense audit logs, outbox events, asset events, and helpdesk events.", { querystring: reportSummaryQuerySchema, response200: genericReportSummarySchema }),
  "GET /api/v1/reports/exports": operation("Reports & Analytics", "List export jobs", "Lists report export jobs backed by durable outbox events. Admin/Auditor can see all; other users see their own jobs.", { querystring: reportSummaryQuerySchema, response200: paginated(reportExportJobSchema) }),
  "GET /api/v1/reports/exports/{id}": operation("Reports & Analytics", "Get export job", "Returns one report export job and generated document reference when available.", { params: idParamSchema, response200: reportExportJobSchema }),
  "POST /api/v1/reports/exports": operation("Reports & Analytics", "Create export job", "Creates a CSV or XLSX report export document backed by object storage and durable outbox metadata.", { body: reportExportCreateBodySchema, response200: reportExportJobSchema }),

  "POST /api/v1/assets/": operation("Assets", "Create asset", "Creates an asset inventory record. Asset/Admin role required.", { body: { type: "object", required: ["asset_code", "asset_type", "name"], properties: { asset_code: { type: "string", example: "LAP-001" }, asset_type: { type: "string", example: "Laptop" }, name: { type: "string", example: "ThinkPad T-Series" }, serial_no: { type: "string", example: "SN-001" } } }, response200: assetSchema }),
  "GET /api/v1/assets/": operation("Assets", "List assets", "Paginated asset inventory list.", { querystring: paginationQuerySchema, response200: paginated(assetSchema) }),
  "GET /api/v1/assets/{id}": operation("Assets", "Asset detail", "Returns full asset details for Asset/Admin actors.", { params: idParamSchema, response200: assetSchema }),
  "POST /api/v1/assets/{id}/assign": operation("Assets", "Assign asset", "Assigns an asset to an employee with OCC expected_version.", { params: idParamSchema, body: { type: "object", required: ["assigned_to_user_id", "expected_version"], properties: { assigned_to_user_id: uuid("Employee user UUID"), expected_version: { type: "integer", minimum: 1, example: 1 } } }, response200: assetSchema }),
  "POST /api/v1/assets/{id}/return": operation("Assets", "Return asset", "Returns/recover an asset with OCC expected_version.", { params: idParamSchema, body: expectedVersionBodySchema, response200: assetSchema }),
  "POST /api/v1/assets/scan/{qr_hash}": operation("Assets", "Safe QR scan", "Public-safe QR/hash lookup that intentionally omits internal IDs, cost, and sensitive metadata.", { params: qrHashParamSchema, response200: { type: "object", required: ["qr_hash", "asset_code", "asset_type", "name", "status", "assigned"], properties: { qr_hash: { type: "string", example: "release-qr-hash-lap-available" }, asset_code: { type: "string", example: "LAP-001" }, asset_type: { type: "string", example: "Laptop" }, name: { type: "string", example: "ThinkPad T-Series" }, status: { type: "string", example: "In Stock" }, assigned: { type: "string", example: "unassigned" } } } }, false),
  "POST /api/v1/assets/licenses/activate": operation("Assets", "Activate license", "Activates a software license entitlement for a hardware fingerprint.", { body: { type: "object", required: ["product_id", "entitlement_id", "hardware_fingerprint"], properties: { product_id: uuid("Software product UUID"), entitlement_id: uuid("Entitlement UUID"), hardware_fingerprint: { type: "string", minLength: 8, example: "HW-FINGERPRINT-001" } } }, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/assets/licenses/validate": operation("Assets", "Validate license", "Validates software license binding for a hardware fingerprint.", { body: { type: "object", required: ["product_id", "hardware_fingerprint"], properties: { product_id: uuid("Software product UUID"), hardware_fingerprint: { type: "string", minLength: 8, example: "HW-FINGERPRINT-001" } } }, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/assets/licenses/revoke": operation("Assets", "Revoke license/device", "Revokes a hardware fingerprint or compromised key/device binding.", { body: { type: "object", required: ["hardware_fingerprint"], properties: { hardware_fingerprint: { type: "string", minLength: 8, example: "HW-FINGERPRINT-001" } } }, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/assets/events/employee-terminated": operation("Outbox / Platform Events", "Consume employee terminated event", "Protected local event consumer that moves assigned assets into recovery workflow when an employee is terminated.", { body: { type: "object", required: ["employee_user_id"], properties: { employee_user_id: uuid("Terminated employee UUID") } }, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/assets/warranty-alerts": operation("Assets", "Asset warranty alerts", "Lists expired and soon-expiring asset warranties using the Admin asset policy warranty alert window unless a narrower window is requested.", { querystring: assetWarrantyAlertsQuerySchema, response200: { ...paginated(assetWarrantyAlertSchema), required: ["items", "page", "page_size", "total", "alert_window_days", "generated_at", "counts"], properties: { ...paginated(assetWarrantyAlertSchema).properties, alert_window_days: { type: "integer", example: 60 }, generated_at: dateTime("Generation timestamp"), counts: { type: "object", required: ["expired", "critical", "warning"], properties: { expired: { type: "integer", example: 1 }, critical: { type: "integer", example: 2 }, warning: { type: "integer", example: 3 } }, additionalProperties: false } }, additionalProperties: true } }),
  "POST /api/v1/assets/requests": operation("Assets", "Create asset request", "Creates an authenticated employee asset request for new, replacement, repair, or return needs.", { body: assetRequestBodySchema, response200: { type: "object", required: ["request", "version"], properties: { request: assetRequestSchema, version: { type: "integer", minimum: 1, example: 1 } }, additionalProperties: false } }),
  "GET /api/v1/assets/requests/my": operation("Assets", "List my asset requests", "Lists asset requests raised by the authenticated employee.", { querystring: paginationQuerySchema, response200: paginated(assetRequestSchema) }),
  "GET /api/v1/assets/requests/queue": operation("Assets", "Asset request queue", "Lists asset requests for Asset/Admin actors with queue counts.", { querystring: paginationQuerySchema, response200: { ...paginated(assetRequestSchema), additionalProperties: true } }),
  "POST /api/v1/assets/requests/{id}/decision": operation("Assets", "Decide asset request", "Approves, rejects, returns, or fulfills an asset request with OCC expected_version.", { params: idParamSchema, body: assetRequestDecisionBodySchema, response200: { type: "object", required: ["request", "version"], properties: { request: assetRequestSchema, assigned_asset: { ...assetSchema, nullable: true }, version: { type: "integer", minimum: 1, example: 2 } }, additionalProperties: true } }),
  "POST /api/v1/assets/requests/{id}/cancel": operation("Assets", "Cancel asset request", "Cancels a requester-owned pending asset request with OCC expected_version.", { params: idParamSchema, body: expectedVersionBodySchema, response200: { type: "object", required: ["request", "version"], properties: { request: assetRequestSchema, version: { type: "integer", minimum: 1, example: 2 } }, additionalProperties: false } }),
  "POST /api/v1/assets/{id}/acknowledgements": operation("Assets", "Acknowledge asset handover", "Marks an assigned asset as received or returned by the assigned employee.", { params: idParamSchema, body: { type: "object", required: ["acknowledgement_type", "expected_version"], properties: { acknowledgement_type: { type: "string", enum: ["received", "returned"], example: "received" }, expected_version: { type: "integer", minimum: 1, example: 1 } }, additionalProperties: false }, response200: { type: "object", required: ["asset", "acknowledgement", "version"], properties: { asset: assetSchema, acknowledgement: { type: "object", additionalProperties: true }, version: { type: "integer", minimum: 1, example: 2 } }, additionalProperties: false } }),
  "GET /api/v1/assets/{id}/maintenance": operation("Assets", "List asset maintenance", "Lists maintenance records for an asset.", { params: idParamSchema, querystring: paginationQuerySchema, response200: paginated(assetMaintenanceSchema) }),
  "POST /api/v1/assets/{id}/maintenance": operation("Assets", "Create asset maintenance", "Creates a maintenance, warranty, repair, or inspection record and updates asset state with OCC expected_version.", { params: idParamSchema, body: { type: "object", required: ["maintenance_type", "started_on", "expected_version"], properties: { maintenance_type: { type: "string", enum: ["repair", "preventive", "warranty", "inspection", "other"], example: "repair" }, vendor_id: { ...uuid("Vendor UUID"), nullable: true }, cost: { type: "string", nullable: true, example: "1200.00" }, started_on: { type: "string", format: "date", example: "2026-05-23" }, completed_on: { type: "string", format: "date", nullable: true, example: "2026-05-24" }, status: { type: "string", enum: ["scheduled", "in_progress", "completed", "cancelled"], example: "in_progress" }, notes: { type: "string", nullable: true, example: "Keyboard replacement." }, expected_version: { type: "integer", minimum: 1, example: 1 } }, additionalProperties: false }, response200: { type: "object", required: ["maintenance", "asset", "asset_version"], properties: { maintenance: assetMaintenanceSchema, asset: assetSchema, asset_version: { type: "integer", minimum: 1, example: 2 } }, additionalProperties: false } }),
  "GET /api/v1/assets/vendors": operation("Assets", "List asset vendors", "Lists asset vendors, warranty partners, and selector metadata for asset workflows.", { querystring: paginationQuerySchema, response200: paginated(assetVendorSchema) }),
  "POST /api/v1/assets/vendors": operation("Assets", "Create asset vendor", "Creates a vendor or warranty partner used by maintenance and warranty workflows. Asset/Admin role required.", { body: assetVendorCreateBodySchema, response200: { type: "object", required: ["vendor", "version"], properties: { vendor: assetVendorSchema, version: { type: "integer", minimum: 1, example: 1 } }, additionalProperties: false } }),
  "PATCH /api/v1/assets/vendors/{id}": operation("Assets", "Update asset vendor", "Updates vendor contact/status details with OCC expected_version. Asset/Admin role required.", { params: idParamSchema, body: assetVendorUpdateBodySchema, response200: { type: "object", required: ["vendor", "version"], properties: { vendor: assetVendorSchema, version: { type: "integer", minimum: 1, example: 2 } }, additionalProperties: false } }),
  "GET /api/v1/assets/recovery-queue": operation("Assets", "Asset recovery queue", "Lists assets pending recovery from offboarding or termination events.", { querystring: paginationQuerySchema, response200: { ...paginated(assetRecoveryTicketSchema), additionalProperties: true } }),
  "POST /api/v1/assets/recovery-queue/{id}/settlement": operation("Assets", "Settle asset recovery ticket", "Closes an offboarding asset recovery ticket, updates the linked asset status, and records recovery settlement details with OCC expected_version.", { params: idParamSchema, body: assetRecoverySettlementBodySchema, response200: { type: "object", required: ["ticket", "asset", "version"], properties: { ticket: assetRecoveryTicketSchema, asset: assetSchema, version: { type: "integer", minimum: 1, example: 2 } }, additionalProperties: false } }),

  "POST /api/v1/timesheets/work-segments": operation("Timesheets", "Create work segment", "Creates or updates a daily work segment for the authenticated employee.", { body: { type: "object", required: ["work_date", "hours"], properties: { work_date: date("Work date", "2026-06-01"), project_code: { type: "string", example: "QA-PRJ-001" }, task_code: { type: "string", example: "QA-TASK-001" }, hours: money("Hours as fixed precision decimal", "8.00"), description: { type: "string", example: "Implementation work" }, billable: { type: "boolean", default: false, example: true } } }, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/timesheets/work-segments": operation("Timesheets", "List work segments", "Paginated work segment list scoped by actor.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/timesheets/submissions": operation("Timesheets", "Submit timesheet cycle", "Submits a timesheet cycle for approval.", { body: { type: "object", required: ["cycle_start", "cycle_end"], properties: { cycle_start: date("Cycle start", "2026-06-01"), cycle_end: date("Cycle end", "2026-06-07") } }, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/timesheets/submissions/my": operation("Timesheets", "My timesheet submissions", "Lists authenticated employee timesheet submissions.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/timesheets/queue/approver": operation("Timesheets", "Approver queue", "Timesheet approval queue for the authenticated approver with compact project/member metadata, cycle hours, expected-hours context, decision history, and admin override visibility. Omit status for active pending approvals; Admin can use status to inspect returned/rejected history.", { querystring: timesheetApproverQueueQuerySchema, response200: timesheetApproverQueueResponseSchema }),
  "GET /api/v1/timesheets/projects/summary": operation("Timesheets", "Project timesheet summary", "Returns project-level timesheet rollups, member submitted/missing state, billable split, and cycle totals for the actor's visible project scope.", { querystring: timesheetAnalyticsQuerySchema, response200: timesheetProjectSummaryResponseSchema }),
  "GET /api/v1/timesheets/missing-submissions": operation("Timesheets", "Missing timesheet submissions", "Returns visible employees with missing or under-submitted timesheet cycles, including manager and reminder context.", { querystring: timesheetAnalyticsQuerySchema, response200: timesheetMissingSubmissionsResponseSchema }),
  "GET /api/v1/timesheets/productivity-summary": operation("Timesheets", "Timesheet productivity summary", "Returns backend-derived productivity cards, time series, and breakdown rows grouped by employee, project, department, or week.", { querystring: timesheetAnalyticsQuerySchema, response200: timesheetProductivitySummaryResponseSchema }),
  "GET /api/v1/timesheets/selectors": operation("Timesheets", "Timesheet selectors", "Returns visible projects, task selectors, cycles, approvers, workflow definitions, and rules for timesheet forms.", { querystring: timesheetSelectorsQuerySchema, response200: timesheetSelectorsResponseSchema }),
  "GET /api/v1/timesheets/submissions/{id}": operation("Timesheets", "Timesheet submission detail", "Returns one visible submission with segments, project/member/hour metadata, workflow history, and latest decision.", { params: idParamSchema, response200: timesheetSubmissionDetailResponseSchema }),
  "POST /api/v1/timesheets/submissions/{id}/approve": operation("Timesheets", "Timesheet decision", "Approves, rejects, or returns a timesheet submission with OCC expected_version. Reject/return require remarks. The response preserves top-level submission fields and adds previous_status, next_status, audit_event, workflow_history, member/project/hour metadata, and allowed next actions.", { params: idParamSchema, body: { type: "object", required: ["decision", "expected_version"], properties: { decision: { type: "string", enum: ["approve", "reject", "return"], example: "approve" }, remarks: { type: "string", description: "Required for reject/return decisions. Trimmed before storage.", example: "Approved." }, expected_version: { type: "integer", minimum: 1, example: 1 } } }, response200: timesheetDecisionResponseSchema }),
  "GET /api/v1/timesheets/workflow-definitions": operation("Timesheets", "List workflow definitions", "Lists timesheet workflow definitions.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/timesheets/workflow-definitions": operation("Admin / Configuration", "Upsert workflow definition", "Creates or updates a timesheet workflow definition. Admin role required by backend policy.", { body: { type: "object", required: ["name", "definition"], properties: { name: { type: "string", example: "Default Manager Approval" }, definition: { type: "object", required: ["approver_strategy"], properties: { approver_strategy: { type: "string", enum: ["ltree_manager", "project_manager", "hr_manager"], example: "ltree_manager" }, require_billable_review: { type: "boolean", default: false } } } } }, response200: { type: "object", additionalProperties: true } })
};

export const openApiTags = [
  { name: "Platform / Health", description: "Liveness, readiness, and OpenAPI contract endpoints." },
  { name: "Auth & Sessions", description: "Login, logout, and current session context." },
  { name: "Core / Employees & Hierarchy", description: "Core employee identity and ltree hierarchy lookup." },
  { name: "Dashboard", description: "Role-scoped dashboard summaries derived from implemented backend modules." },
  { name: "Expenses / Requester", description: "Requester-owned expense creation and read flows." },
  { name: "Expenses / Manager", description: "Manager verification queue, document checks, and decision workflow." },
  { name: "Finance Management", description: "Finance queue, approval, payment, settlement, analytics, audit, and finance reports." },
  { name: "Documents", description: "Secure document metadata, object-storage-backed file access, verification, and access logs." },
  { name: "Assets", description: "Asset inventory, QR scan, assignment, recovery, and license workflows." },
  { name: "Timesheets", description: "Work segments, submissions, approval queues, and workflow definitions." },
  { name: "Attendance", description: "Punches, summaries, calendars, exceptions, and regularization workflows." },
  { name: "Leave / WFH / Holidays", description: "Leave balances, leave/WFH request workflows, HR monitor, and holiday calendar contracts." },
  { name: "EMS", description: "Employee self-service profile, requests, HR letters, and policy acknowledgement workflows." },
  { name: "Projects / Utilization", description: "Project CRUD, delivery team allocation, milestones, project summaries, and utilization analytics." },
  { name: "Helpdesk", description: "Ticket creation, support queue, comments, attachments, assignment, SLA tracking, and ticket lifecycle workflow." },
  { name: "Reports & Analytics", description: "Role-scoped expense registers and export readiness." },
  { name: "Notifications", description: "User notification feed, unread badge count, and read-state mutations." },
  { name: "Outbox / Platform Events", description: "Transactional outbox and protected local event consumer contracts." },
  { name: "Admin / Configuration", description: "Administrative configuration endpoints." }
];

export const openApiComponents = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "JWT access token returned by `/api/v1/auth/login`."
    },
    sessionCookie: {
      type: "apiKey",
      in: "cookie",
      name: "hrms_session",
      description: "HttpOnly session cookie set by login. Actual cookie name is environment-configured."
    }
  },
  schemas: {
    ErrorResponse: errorResponseSchema,
    ConflictResponse: conflictResponseSchema,
    RateLimitResponse: rateLimitResponseSchema,
    EmsProfile: emsProfileResponseSchema,
    EmsProfileChangeRequest: emsProfileChangeSchema,
    EmsServiceRequest: emsServiceRequestSchema,
    EmsLetter: emsLetterSchema,
    EmsPolicy: emsPolicySchema,
    Project: projectSchema,
    HelpdeskTicket: helpdeskTicketSchema
  }
};

export const swaggerTransform: NonNullable<FastifyDynamicSwaggerOptions["transform"]> = ({ schema, url, route }) => {
  const method = Array.isArray(route.method) ? route.method[0] : route.method;
  const docs = routeDocs[`${method} ${normaliseRoutePath(url)}`];
  if (!docs) {
    return { schema, url };
  }

  return {
    schema: {
      ...(schema as RouteSchema | undefined),
      ...docs
    },
    url
  };
};

function normaliseRoutePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
}

export const swaggerTransformObject = ((documentObject: SwaggerTransformObjectInput) => {
  if (!("openapiObject" in documentObject)) {
    return documentObject.swaggerObject;
  }
  const { openapiObject } = documentObject;
  return {
    ...openapiObject,
    tags: openApiTags,
    components: {
      ...openapiObject.components,
      schemas: {
        ...openApiComponents.schemas,
        ...openapiObject.components?.schemas
      },
      securitySchemes: openApiComponents.securitySchemes
    }
  } as never;
}) as NonNullable<FastifyDynamicSwaggerOptions["transformObject"]>;
