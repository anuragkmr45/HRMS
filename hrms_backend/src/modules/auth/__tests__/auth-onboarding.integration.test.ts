import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { getLocalDemoPassword } from "#auth";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("auth onboarding and password APIs", () => {
  let app: FastifyInstance;
  const localDemoPassword = getLocalDemoPassword();

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("supports email verification, password setup, company bootstrap, and session preferences", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Acme HRMS",
        full_name: "Asha Founder",
        email: "asha.founder@example.test",
        timezone: "Asia/Kolkata"
      }
    });
    expect(signup.statusCode).toBe(200);
    expect(signup.json()).toMatchObject({
      verification_required: true,
      masked_email: "as**********@example.test",
      next_step: "verify_email"
    });
    const verificationToken = signup.json().dev_only.email_verification_token;
    expect(typeof verificationToken).toBe("string");

    const wrongEmail = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: verificationToken, email: "other@example.test" }
    });
    expect(wrongEmail.statusCode).toBe(400);

    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: verificationToken, email: "asha.founder@example.test" }
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({ verified: true, login_allowed: false, next_step: "set_password" });
    const passwordSetupToken = verify.json().dev_only.password_setup_token;
    const bootstrapToken = verify.json().dev_only.company_bootstrap_token;
    expect(typeof passwordSetupToken).toBe("string");
    expect(typeof bootstrapToken).toBe("string");

    const reusedVerify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: verificationToken }
    });
    expect(reusedVerify.statusCode).toBe(409);

    const setPasswordMismatch = await app.inject({
      method: "POST",
      url: "/api/v1/auth/set-password",
      payload: {
        token: passwordSetupToken,
        password: "FounderPass123",
        confirm_password: "FounderPass124"
      }
    });
    expect(setPasswordMismatch.statusCode).toBe(400);

    const setPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/set-password",
      payload: {
        token: passwordSetupToken,
        password: "FounderPass123",
        confirm_password: "FounderPass123"
      }
    });
    expect(setPassword.statusCode).toBe(200);
    expect(setPassword.json()).toMatchObject({ password_set: true, login_allowed: true, next_step: "login" });

    const loginBeforeBootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "asha.founder@example.test", password: "FounderPass123" }
    });
    expect(loginBeforeBootstrap.statusCode).toBe(200);
    expect(loginBeforeBootstrap.json().user.roles).toEqual(["Employee"]);
    expect(loginBeforeBootstrap.json()).toMatchObject({ next_step: "company_bootstrap" });
    const pendingSession = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(loginBeforeBootstrap.json().access_token)
    });
    expect(pendingSession.statusCode).toBe(200);
    expect(pendingSession.json()).toMatchObject({
      setup_required: true,
      next_step: "company_bootstrap"
    });
    const resumedBootstrapToken = pendingSession.json().dev_only.company_bootstrap_token;
    expect(typeof resumedBootstrapToken).toBe("string");

    const logoBody = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);
    const logoUpload = await multipartUpload(app, {
      url: "/api/v1/onboarding/company-logo",
      fields: { bootstrap_token: resumedBootstrapToken },
      file: {
        fieldName: "file",
        fileName: "acme-logo.jpg",
        mimeType: "image/jpeg",
        body: logoBody
      }
    });
    expect(logoUpload.statusCode).toBe(200);
    expect(logoUpload.json().company).toMatchObject({
      logo_document_id: expect.any(String),
      logo_file_name: "acme-logo.jpg",
      logo_mime_type: "image/jpeg",
      logo_size_bytes: logoBody.length
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/onboarding/company-bootstrap",
      payload: {
        bootstrap_token: resumedBootstrapToken,
        company_profile: {
          company_name: "Acme HRMS India",
          timezone: "Asia/Kolkata",
          locale: "en-IN",
          fiscal_year_start_month: 4
        },
        departments: ["Engineering", "Customer Success", "People Ops"],
        designations: ["Principal Engineer", "Customer Success Lead", "People Ops Manager"],
        first_admin_profile: {
          full_name: "Asha Admin",
          landing_page: "/admin-settings"
        }
      }
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().company).toMatchObject({
      company_name: "Acme HRMS India",
      status: "active",
      logo_document_id: logoUpload.json().company.logo_document_id
    });
    const bootstrappedCompanyId = bootstrap.json().company.id as string;
    const bootstrappedDepartments = app.store.departments.filter((department) => department.company_id === bootstrappedCompanyId);
    const bootstrappedDesignations = app.store.designations.filter((designation) => designation.company_id === bootstrappedCompanyId);
    expect(bootstrappedDepartments.map((department) => department.name)).toEqual(["Engineering", "Customer Success", "People Ops"]);
    expect(bootstrappedDesignations.map((designation) => designation.title)).toEqual(["Principal Engineer", "Customer Success Lead", "People Ops Manager"]);
    expect(app.store.adminPolicies.filter((policy) => policy.company_id === bootstrappedCompanyId).map((policy) => policy.policy_key).sort()).toEqual([
      "asset",
      "attendance",
      "expense",
      "leave",
      "sla",
      "timesheet"
    ]);
    expect(bootstrap.json().admin_user.roles).toContain("Admin");
    expect(bootstrap.json().admin_user.department_id).toBe(bootstrappedDepartments[0]?.id);
    expect(bootstrap.json().admin_user.designation_id).toBe(bootstrappedDesignations[0]?.id);
    expect(bootstrap.json().setup_progress).toMatchObject({ company_profile: "completed", first_admin: "completed" });

    const duplicateBootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/onboarding/company-bootstrap",
      payload: { bootstrap_token: bootstrapToken }
    });
    expect(duplicateBootstrap.statusCode).toBe(409);

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "asha.founder@example.test", password: "FounderPass123" }
    });
    expect(adminLogin.statusCode).toBe(200);
    expect(adminLogin.json().user.roles).toEqual(expect.arrayContaining(["Employee", "Admin"]));
    const token = adminLogin.json().access_token as string;

    const preference = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/session/preference",
      headers: authHeader(token),
      payload: { active_role_id: "Admin", company_id: bootstrap.json().company.id, landing_page: "/admin-settings" }
    });
    expect(preference.statusCode).toBe(200);
    expect(preference.json().active_role.key).toBe("Admin");
    expect(preference.json().preferences).toMatchObject({ active_role: "Admin", landing_page: "/admin-settings" });

    const invalidRole = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/session/preference",
      headers: authHeader(token),
      payload: { active_role_id: "Finance Manager" }
    });
    expect(invalidRole.statusCode).toBe(403);

    const duplicateCompany = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Acme HRMS India",
        company_slug: "acme-hrms",
        full_name: "Other User",
        email: "other.user@example.test",
        password: "OtherPass123",
        timezone: "Asia/Kolkata"
      }
    });
    expect(duplicateCompany.statusCode).toBe(409);

    const duplicateEmail = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Other Company",
        full_name: "Asha Founder",
        email: "asha.founder@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });
    expect(duplicateEmail.statusCode).toBe(409);
  });

  it("keeps password reset enumeration-safe and revokes existing sessions", async () => {
    const employee = await loginAs(app, "E1");

    const unknownReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "unknown@example.test" }
    });
    expect(unknownReset.statusCode).toBe(200);
    expect(unknownReset.json()).toMatchObject({ accepted: true, masked_email: "un*****@example.test" });
    expect(unknownReset.json().dev_only.password_reset_token).toBeNull();

    const resetRequest = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "e1@example.test" }
    });
    expect(resetRequest.statusCode).toBe(200);
    const resetToken = resetRequest.json().dev_only.password_reset_token;
    expect(typeof resetToken).toBe("string");

    const mismatch = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: resetToken, password: "ResetPass123", confirm_password: "ResetPass124" }
    });
    expect(mismatch.statusCode).toBe(400);

    const confirm = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: resetToken, password: "ResetPass123", confirm_password: "ResetPass123" }
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({ password_reset: true, next_step: "login" });
    expect(confirm.json().session_revoked_count).toBeGreaterThanOrEqual(1);

    const oldSession = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(employee.token)
    });
    expect(oldSession.statusCode).toBe(401);

    const oldPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "e1@example.test", password: localDemoPassword }
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "e1@example.test", password: "ResetPass123" }
    });
    expect(newPasswordLogin.statusCode).toBe(200);

    const reusedReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: resetToken, password: "ResetPass999", confirm_password: "ResetPass999" }
    });
    expect(reusedReset.statusCode).toBe(409);
  });
});

interface MultipartUploadInput {
  url: string;
  fields: Record<string, string>;
  file: {
    fieldName: string;
    fileName: string;
    mimeType: string;
    body: Buffer;
  };
}

function multipartUpload(app: FastifyInstance, input: MultipartUploadInput) {
  const boundary = `----hawkaii-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(input.fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(
    Buffer.from(
      `Content-Disposition: form-data; name="${input.file.fieldName}"; filename="${input.file.fileName}"\r\n`
    )
  );
  chunks.push(Buffer.from(`Content-Type: ${input.file.mimeType}\r\n\r\n`));
  chunks.push(input.file.body);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return app.inject({
    method: "POST",
    url: input.url,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`
    },
    payload: Buffer.concat(chunks)
  });
}
