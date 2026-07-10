import { z } from "zod";

export const loginSchema = z
  .object({
    email: z.email().optional(),
    password: z.string().min(1).optional(),
    employee_code: z.string().min(1).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const hasPasswordCredentials = Boolean(value.email || value.password);
    const hasEmployeeCode = Boolean(value.employee_code);
    if (!hasPasswordCredentials && !hasEmployeeCode) {
      context.addIssue({ code: "custom", path: ["email"], message: "Email is required." });
      context.addIssue({ code: "custom", path: ["password"], message: "Password is required." });
      return;
    }
    if (hasPasswordCredentials) {
      if (!value.email) {
        context.addIssue({ code: "custom", path: ["email"], message: "Email is required." });
      }
      if (!value.password) {
        context.addIssue({ code: "custom", path: ["password"], message: "Password is required." });
      }
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;


const strongPasswordSchema = z
  .string()
  .min(1)
  .max(128);

export const signupSchema = z
  .object({
    company_name: z.string().min(2).max(120),
    full_name: z.string().min(2).max(160),
    email: z.email(),
    password: strongPasswordSchema.optional(),
    timezone: z.string().min(1).max(64).default("Asia/Kolkata"),
    locale: z.string().min(2).max(16).default("en-IN"),
    company_slug: z.string().min(2).max(80).optional(),
    invite_token: z.string().min(16).optional()
  })
  .strict();

export const verifyEmailSchema = z.object({
  token: z.string().min(16),
  email: z.email().optional()
}).strict();

export const resendEmailVerificationSchema = z.object({
  email: z.email(),
  company_slug: z.string().min(2).max(80).optional()
}).strict();

export const setPasswordSchema = z.object({
  token: z.string().min(16),
  password: strongPasswordSchema,
  confirm_password: z.string().min(1)
}).strict().superRefine((value, context) => {
  if (value.password !== value.confirm_password) {
    context.addIssue({ code: "custom", path: ["confirm_password"], message: "Passwords do not match." });
  }
});

export const passwordResetRequestSchema = z.object({
  email: z.email(),
  company_slug: z.string().min(2).max(80).optional()
}).strict();

export const passwordResetConfirmSchema = setPasswordSchema;

export const companyBootstrapSchema = z.object({
  bootstrap_token: z.string().min(16),
  company_profile: z.object({
    company_name: z.string().min(2).max(120).optional(),
    timezone: z.string().min(1).max(64).optional(),
    locale: z.string().min(2).max(16).optional(),
    fiscal_year_start_month: z.number().int().min(1).max(12).optional()
  }).default({}),
  departments: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  designations: z.array(z.string().trim().min(1).max(120)).max(150).optional(),
  first_admin_profile: z.object({
    full_name: z.string().min(2).max(160).optional(),
    landing_page: z.string().min(1).max(120).optional()
  }).default({})
}).strict();

export const sessionPreferenceSchema = z.object({
  active_role_id: z.string().min(1).optional(),
  active_role: z.string().min(1).optional(),
  company_id: z.uuid().nullable().optional(),
  landing_page: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(16).optional(),
  timezone: z.string().min(1).max(64).optional()
}).strict().superRefine((value, context) => {
  if (!value.active_role_id && !value.active_role && !value.company_id && !value.landing_page && !value.locale && !value.timezone) {
    context.addIssue({ code: "custom", path: ["active_role_id"], message: "At least one preference field is required." });
  }
});

export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendEmailVerificationInput = z.infer<typeof resendEmailVerificationSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type CompanyBootstrapInput = z.infer<typeof companyBootstrapSchema>;
export type SessionPreferenceInput = z.infer<typeof sessionPreferenceSchema>;
