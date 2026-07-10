import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

export interface LoginRequest {
  email: string;
  password: string;
  employee_code?: string;
}

export interface LoginResponse {
  user: ApiRecord;
  access_token: string;
  expires_at: string;
  company_id?: string | null;
  next_step?: "company_bootstrap";
  dev_only?: DevOnlyTokens;
  [key: string]: unknown;
}

export interface SessionRole {
  key: string;
  label: string;
  is_active?: boolean;
  permissions?: string[];
  [key: string]: unknown;
}

export interface SessionContextResponse {
  user: ApiRecord;
  active_role?: SessionRole;
  available_roles?: SessionRole[];
  permissions?: string[];
  company?: ApiRecord;
  company_id?: string | null;
  setup_required?: boolean;
  next_step?: "company_bootstrap";
  dev_only?: DevOnlyTokens;
  preferences?: ApiRecord;
  session_metadata?: ApiRecord;
  [key: string]: unknown;
}

export interface SessionPreferenceRequest {
  active_role_id?: string;
  active_role?: string;
  company_id?: string | null;
  landing_page?: string;
  locale?: string;
  timezone?: string;
}

interface DevOnlyTokens {
  email_verification_token?: string | null;
  password_setup_token?: string | null;
  company_bootstrap_token?: string | null;
  password_reset_token?: string | null;
  [key: string]: unknown;
}

interface DevOnlyResponse {
  dev_only?: DevOnlyTokens;
  [key: string]: unknown;
}

export interface SignupRequest {
  company_name: string;
  full_name: string;
  email: string;
  password?: string;
  timezone?: string;
  locale?: string;
  company_slug?: string;
  invite_token?: string;
}

export interface SignupResponse extends DevOnlyResponse {
  signup_id: string;
  verification_required: boolean;
  masked_email: string;
  next_step: "verify_email";
  retry_after_seconds: number;
  email_delivery_mode?: "send" | "log" | "disabled";
  email_delivery_status?: string | null;
  email_delivery_notice?: string | null;
}

export interface VerifyEmailRequest {
  token: string;
  email?: string;
}

export interface VerifyEmailResponse extends DevOnlyResponse {
  verified: boolean;
  user_id: string;
  company_id?: string | null;
  login_allowed: boolean;
  next_step: "company_bootstrap" | "set_password" | "login";
}

export interface ResendEmailVerificationRequest {
  email: string;
  company_slug?: string;
}

export interface ResendEmailVerificationResponse extends DevOnlyResponse {
  accepted: boolean;
  masked_email: string;
  retry_after_seconds: number;
  email_delivery_mode?: "send" | "log" | "disabled";
  email_delivery_status?: string | null;
  email_delivery_notice?: string | null;
}

export interface SetPasswordRequest {
  token: string;
  password: string;
  confirm_password: string;
}

export interface SetPasswordResponse {
  password_set: boolean;
  login_allowed: boolean;
  user_id: string;
  next_step: "login";
  [key: string]: unknown;
}

export interface PasswordResetRequest {
  email: string;
  company_slug?: string;
}

export interface PasswordResetRequestResponse extends DevOnlyResponse {
  accepted: boolean;
  masked_email: string;
  retry_after_seconds: number;
}

export interface PasswordResetConfirmResponse {
  password_reset: boolean;
  session_revoked_count: number;
  next_step: "login";
  [key: string]: unknown;
}

export interface CompanyBootstrapRequest {
  bootstrap_token: string;
  company_profile?: {
    company_name?: string;
    timezone?: string;
    locale?: string;
    fiscal_year_start_month?: number;
  };
  departments?: string[];
  designations?: string[];
  first_admin_profile?: {
    full_name?: string;
    landing_page?: string;
  };
}

export interface CompanyBootstrapResponse {
  company: ApiRecord;
  admin_user: ApiRecord;
  setup_progress: ApiRecord;
  next_steps: string[];
  preferences: ApiRecord;
  [key: string]: unknown;
}

export interface CompanyLogoUploadResponse {
  company: ApiRecord;
  document: ApiRecord;
  [key: string]: unknown;
}

export const authApi = {
  login(input: LoginRequest) {
    return apiRequest<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  logout() {
    return apiRequest<void>("/api/v1/auth/logout", { method: "POST" });
  },
  getSession() {
    return apiRequest<SessionContextResponse>("/api/v1/auth/me");
  },
  getSessionPartial() {
    return this.getSession();
  },
  updateSessionPreference(input: SessionPreferenceRequest) {
    return apiRequest<SessionContextResponse>("/api/v1/auth/session/preference", {
      method: "PATCH",
      body: input,
    });
  },
  signup(input: SignupRequest) {
    return apiRequest<SignupResponse>("/api/v1/auth/signup", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  verifyEmail(input: VerifyEmailRequest) {
    return apiRequest<VerifyEmailResponse>("/api/v1/auth/verify-email", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  resendEmailVerification(input: ResendEmailVerificationRequest) {
    return apiRequest<ResendEmailVerificationResponse>("/api/v1/auth/email-verifications/resend", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  setPassword(input: SetPasswordRequest) {
    return apiRequest<SetPasswordResponse>("/api/v1/auth/set-password", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  requestPasswordReset(input: PasswordResetRequest) {
    return apiRequest<PasswordResetRequestResponse>("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  confirmPasswordReset(input: SetPasswordRequest) {
    return apiRequest<PasswordResetConfirmResponse>("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  uploadCompanyLogo(input: FormData) {
    return apiRequest<CompanyLogoUploadResponse>("/api/v1/onboarding/company-logo", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  bootstrapCompany(input: CompanyBootstrapRequest) {
    return apiRequest<CompanyBootstrapResponse>("/api/v1/onboarding/company-bootstrap", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
};
