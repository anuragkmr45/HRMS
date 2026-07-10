import { createHmac, randomUUID } from "node:crypto";
import { EmploymentStatuses } from "#shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore, nowIso } from "../../../platform/data-store.js";
import type { DataStore } from "../../../platform/data-store.js";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../../../platform/email/types.js";

class FakeEmailProvider implements EmailProvider {
  readonly sent: SendEmailInput[] = [];
  fail = false;

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);
    if (this.fail) {
      throw new Error("simulated email provider failure");
    }
    return { providerEmailId: `resend_${this.sent.length}` };
  }
}

describe("auth transactional email delivery", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let app: FastifyInstance;
  let store: DataStore;
  let provider: FakeEmailProvider;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.NODE_ENV = "test";
    process.env.JWT_ACCESS_SECRET = "test-access-secret-change-me";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-change-me";
    process.env.EMAIL_DELIVERY_MODE = "send";
    process.env.EMAIL_DELIVERY_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-resend-api-key";
    process.env.RESEND_FROM_EMAIL = "verify@example.test";
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = "300";
    process.env.FRONTEND_URL = "https://hrms.example.test";
    process.env.API_BASE_URL = "http://localhost:3001";
    process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = "60";
    process.env.EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT = "5";
    process.env.EMAIL_VERIFICATION_RESEND_DAILY_LIMIT = "10";
    store = createMemoryDataStore();
    provider = new FakeEmailProvider();
    app = await buildApp({ dataStore: store, rateLimit: false, emailProvider: provider });
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    process.env = originalEnv;
  });

  it("sends signup verification email with a frontend link while storing only token hashes", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Example HRMS",
        full_name: "Asha Founder",
        email: "asha.email@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });

    expect(signup.statusCode).toBe(200);
    const body = signup.json();
    const rawToken = body.dev_only.email_verification_token as string;
    expect(rawToken).toEqual(expect.any(String));
    expect(provider.sent).toHaveLength(1);
    const sentEmail = provider.sent[0]!;
    expect(sentEmail.to).toBe("asha.email@example.test");
    expect(sentEmail.html).toContain("https://hrms.example.test/verify-email?token=");
    expect(sentEmail.html).not.toContain("localhost");
    expect(sentEmail.text).toContain("https://hrms.example.test/verify-email?token=");
    expect(sentEmail.idempotencyKey).toMatch(/^email_verification:/u);

    const token = store.authTokens.find((candidate) => candidate.token_type === "email_verification" && candidate.email === "asha.email@example.test");
    expect(token).toBeDefined();
    expect(token?.token_hash).not.toBe(rawToken);
    expect(token?.token_hash).toHaveLength(64);
    expect(token?.last_sent_at).toEqual(expect.any(String));
    expect(token?.send_count).toBe(1);

    const delivery = store.emailDeliveries.at(-1);
    expect(delivery).toMatchObject({
      provider: "resend",
      purpose: "email_verification",
      email: "asha.email@example.test",
      status: "sent",
      provider_email_id: "resend_1"
    });
    expect(JSON.stringify(delivery?.metadata)).not.toContain(rawToken);
  });

  it("marks users explicitly verified when the app-owned token is consumed", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Verify Inc",
        full_name: "Verified User",
        email: "verified.user@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });
    const rawToken = signup.json().dev_only.email_verification_token as string;

    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: rawToken, email: "verified.user@example.test" }
    });

    expect(verify.statusCode).toBe(200);
    const user = store.users.find((candidate) => candidate.email === "verified.user@example.test");
    const token = store.authTokens.find((candidate) => candidate.email === "verified.user@example.test" && candidate.token_type === "email_verification");
    expect(user?.email_verification_status).toBe("verified");
    expect(user?.email_verified_at).toEqual(expect.any(String));
    expect(token?.status).toBe("used");
    expect(token?.used_at).toEqual(expect.any(String));
  });

  it("rejects expired and revoked verification tokens", async () => {
    const expiredSignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Expired Token HRMS",
        full_name: "Expired Token User",
        email: "expired.token@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });
    const expiredRawToken = expiredSignup.json().dev_only.email_verification_token as string;
    const expiredToken = store.authTokens.find((candidate) => candidate.email === "expired.token@example.test" && candidate.token_type === "email_verification");
    expect(expiredToken).toBeDefined();
    expiredToken!.expires_at = isoMinutesAgo(1);

    const expiredVerify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: expiredRawToken, email: "expired.token@example.test" }
    });
    expect(expiredVerify.statusCode).toBe(400);
    expect(expiredToken!.status).toBe("expired");

    const revokedSignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Revoked Token HRMS",
        full_name: "Revoked Token User",
        email: "revoked.token@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });
    const revokedRawToken = revokedSignup.json().dev_only.email_verification_token as string;
    const revokedToken = store.authTokens.find((candidate) => candidate.email === "revoked.token@example.test" && candidate.token_type === "email_verification");
    expect(revokedToken).toBeDefined();
    revokedToken!.status = "revoked";
    revokedToken!.revoked_at = nowIso();

    const revokedVerify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: revokedRawToken, email: "revoked.token@example.test" }
    });
    expect(revokedVerify.statusCode).toBe(400);
  });

  it("keeps production signup responses free of raw dev-only tokens", async () => {
    await app.close();
    process.env.NODE_ENV = "production";
    process.env.JWT_ACCESS_SECRET = "prod-test-access-secret-6f8e9b7f3c9a4d2e8f1a0b5c";
    process.env.JWT_REFRESH_SECRET = "prod-test-refresh-secret-8c3f2a1e7d9b4a6f0e5c2b1a";
    process.env.CORS_ALLOWED_ORIGINS = "https://hrms.example.test";
    process.env.CLOUDINARY_MOCK_UPLOADS = "false";
    process.env.CLOUDINARY_CLOUD_NAME = "prodtestcloud";
    process.env.CLOUDINARY_API_KEY = "prodtestapikey";
    process.env.CLOUDINARY_API_SECRET = "prodtestapisecret";
    store = createMemoryDataStore();
    provider = new FakeEmailProvider();
    app = await buildApp({ dataStore: store, rateLimit: false, emailProvider: provider });
    await app.ready();

    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Production HRMS",
        full_name: "Prod User",
        email: "prod.user@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });

    expect(signup.statusCode).toBe(200);
    expect(signup.json().dev_only).toBeUndefined();
    expect(provider.sent).toHaveLength(1);

    const repeat = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Production HRMS",
        full_name: "Prod User Retry",
        email: "prod.user@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });

    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().dev_only).toBeUndefined();
    expect(repeat.json()).not.toHaveProperty("sent");
    expect(provider.sent).toHaveLength(1);
  });

  it("keeps resend enumeration-safe and enforces cooldown for pending users", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email-verifications/resend",
      payload: { email: "missing@example.test" }
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toMatchObject({ accepted: true });
    expect(unknown.json()).not.toHaveProperty("sent");
    expect(provider.sent).toHaveLength(0);

    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Cooldown HRMS",
        full_name: "Cooldown User",
        email: "cooldown.user@example.test",
        timezone: "Asia/Kolkata"
      }
    });
    expect(signup.statusCode).toBe(200);
    expect(provider.sent).toHaveLength(1);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email-verifications/resend",
      payload: { email: "cooldown.user@example.test" }
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json()).toMatchObject({ accepted: true });
    expect(blocked.json()).not.toHaveProperty("sent");
    expect(blocked.json().retry_after_seconds).toBeGreaterThan(0);
    expect(provider.sent).toHaveLength(1);
  });

  it("applies resend cooldown to repeated pending signup attempts", async () => {
    const email = "signup.cooldown@example.test";
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup Cooldown HRMS",
        full_name: "Signup Cooldown User",
        email,
        timezone: "Asia/Kolkata"
      }
    });
    expect(signup.statusCode).toBe(200);
    expect(provider.sent).toHaveLength(1);

    const repeat = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup Cooldown HRMS",
        full_name: "Signup Cooldown User Retry",
        email,
        timezone: "Asia/Kolkata"
      }
    });

    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).not.toHaveProperty("sent");
    expect(repeat.json().dev_only.email_verification_token).toBeNull();
    expect(provider.sent).toHaveLength(1);
  });

  it("allows repeated pending signup after cooldown according to resend limits", async () => {
    const email = "signup.after.cooldown@example.test";
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup After Cooldown HRMS",
        full_name: "Signup After Cooldown User",
        email,
        timezone: "Asia/Kolkata"
      }
    });
    expect(signup.statusCode).toBe(200);
    expect(provider.sent).toHaveLength(1);
    const firstToken = store.authTokens.find((token) => token.email === email && token.token_type === "email_verification" && token.status === "active");
    expect(firstToken).toBeDefined();
    firstToken!.last_sent_at = isoMinutesAgo(2);

    const repeat = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup After Cooldown HRMS",
        full_name: "Signup After Cooldown User Retry",
        email,
        timezone: "Asia/Kolkata"
      }
    });

    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).not.toHaveProperty("sent");
    expect(repeat.json().dev_only.email_verification_token).toEqual(expect.any(String));
    expect(provider.sent).toHaveLength(2);
    expect(firstToken!.status).toBe("revoked");
    expect(store.authTokens.filter((token) => token.email === email && token.token_type === "email_verification" && token.status === "active")).toHaveLength(1);
  });

  it("applies hourly and daily resend limits to repeated pending signup attempts", async () => {
    const hourlyEmail = "signup.hourly.limit@example.test";
    const hourlySignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup Hourly Limit HRMS",
        full_name: "Signup Hourly Limit User",
        email: hourlyEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(hourlySignup.statusCode).toBe(200);
    const hourlyInitialSends = provider.sent.length;
    const hourlyToken = store.authTokens.find((token) => token.email === hourlyEmail && token.token_type === "email_verification");
    expect(hourlyToken).toBeDefined();
    hourlyToken!.last_sent_at = isoMinutesAgo(2);
    for (const minutesAgo of [3, 4, 5, 6]) {
      addSentVerificationToken(store, hourlyEmail, isoMinutesAgo(minutesAgo));
    }

    const hourlyBlocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup Hourly Limit HRMS",
        full_name: "Signup Hourly Limit User Retry",
        email: hourlyEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(hourlyBlocked.statusCode).toBe(200);
    expect(hourlyBlocked.json()).not.toHaveProperty("sent");
    expect(hourlyBlocked.json().dev_only.email_verification_token).toBeNull();
    expect(provider.sent).toHaveLength(hourlyInitialSends);

    const dailyEmail = "signup.daily.limit@example.test";
    const dailySignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup Daily Limit HRMS",
        full_name: "Signup Daily Limit User",
        email: dailyEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(dailySignup.statusCode).toBe(200);
    const dailyInitialSends = provider.sent.length;
    const dailyToken = store.authTokens.find((token) => token.email === dailyEmail && token.token_type === "email_verification");
    expect(dailyToken).toBeDefined();
    dailyToken!.last_sent_at = isoHoursAgo(2);
    for (const hoursAgo of [3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      addSentVerificationToken(store, dailyEmail, isoHoursAgo(hoursAgo));
    }

    const dailyBlocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Signup Daily Limit HRMS",
        full_name: "Signup Daily Limit User Retry",
        email: dailyEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(dailyBlocked.statusCode).toBe(200);
    expect(dailyBlocked.json()).not.toHaveProperty("sent");
    expect(dailyBlocked.json().dev_only.email_verification_token).toBeNull();
    expect(provider.sent).toHaveLength(dailyInitialSends);
  });

  it("does not send verification email from repeated signup for verified active or suspended users", async () => {
    const verifiedSignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Verified Active Repeat HRMS",
        full_name: "Verified Active User",
        email: "verified.active.repeat@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });
    expect(verifiedSignup.statusCode).toBe(200);
    const verifiedRawToken = verifiedSignup.json().dev_only.email_verification_token as string;
    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: verifiedRawToken, email: "verified.active.repeat@example.test" }
    });
    expect(verified.statusCode).toBe(200);
    const sendsAfterVerification = provider.sent.length;

    const duplicateVerifiedSignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Verified Active Repeat HRMS",
        full_name: "Verified Active User Retry",
        email: "verified.active.repeat@example.test",
        password: "FounderPass123",
        timezone: "Asia/Kolkata"
      }
    });
    expect(duplicateVerifiedSignup.statusCode).toBe(409);
    expect(provider.sent).toHaveLength(sendsAfterVerification);

    const suspendedEmail = "suspended.signup.repeat@example.test";
    const suspendedSignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Suspended Repeat HRMS",
        full_name: "Suspended Repeat User",
        email: suspendedEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(suspendedSignup.statusCode).toBe(200);
    const suspendedUser = store.users.find((user) => user.email === suspendedEmail);
    expect(suspendedUser).toBeDefined();
    suspendedUser!.employment_status = EmploymentStatuses.Suspended;
    suspendedUser!.email_verification_status = "pending";
    const sendsBeforeSuspendedRepeat = provider.sent.length;

    const suspendedRepeat = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Suspended Repeat HRMS",
        full_name: "Suspended Repeat User Retry",
        email: suspendedEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(suspendedRepeat.statusCode).toBe(200);
    expect(suspendedRepeat.json()).not.toHaveProperty("sent");
    expect(suspendedRepeat.json().dev_only.email_verification_token).toBeNull();
    expect(provider.sent).toHaveLength(sendsBeforeSuspendedRepeat);

    const terminatedEmail = "terminated.signup.repeat@example.test";
    const terminatedSignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Terminated Repeat HRMS",
        full_name: "Terminated Repeat User",
        email: terminatedEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(terminatedSignup.statusCode).toBe(200);
    const terminatedUser = store.users.find((user) => user.email === terminatedEmail);
    expect(terminatedUser).toBeDefined();
    terminatedUser!.employment_status = EmploymentStatuses.Terminated;
    terminatedUser!.email_verification_status = "pending";
    const sendsBeforeTerminatedRepeat = provider.sent.length;

    const terminatedRepeat = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Terminated Repeat HRMS",
        full_name: "Terminated Repeat User Retry",
        email: terminatedEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(terminatedRepeat.statusCode).toBe(200);
    expect(terminatedRepeat.json()).not.toHaveProperty("sent");
    expect(terminatedRepeat.json().dev_only.email_verification_token).toBeNull();
    expect(provider.sent).toHaveLength(sendsBeforeTerminatedRepeat);
  });

  it("does not resend verification emails for already verified inactive users", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Verified Pending HRMS",
        full_name: "Verified Pending User",
        email: "verified.pending@example.test",
        timezone: "Asia/Kolkata"
      }
    });
    expect(signup.statusCode).toBe(200);
    const rawToken = signup.json().dev_only.email_verification_token as string;
    expect(provider.sent).toHaveLength(1);

    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: rawToken, email: "verified.pending@example.test" }
    });
    expect(verify.statusCode).toBe(200);

    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email-verifications/resend",
      payload: { email: "verified.pending@example.test" }
    });

    expect(resend.statusCode).toBe(200);
    expect(resend.json()).toMatchObject({ accepted: true });
    expect(resend.json()).not.toHaveProperty("sent");
    expect(provider.sent).toHaveLength(1);
    expect(
      store.authTokens.filter((token) => token.email === "verified.pending@example.test" && token.token_type === "email_verification" && token.status === "active")
    ).toHaveLength(0);
  });

  it("enforces hourly and daily resend limits without exposing account state", async () => {
    const hourlyEmail = "hourly.limit@example.test";
    const hourlySignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Hourly Limit HRMS",
        full_name: "Hourly Limit User",
        email: hourlyEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(hourlySignup.statusCode).toBe(200);
    const hourlyInitialSends = provider.sent.length;
    const hourlyToken = store.authTokens.find((token) => token.email === hourlyEmail && token.token_type === "email_verification");
    expect(hourlyToken).toBeDefined();
    hourlyToken!.last_sent_at = isoMinutesAgo(2);
    for (const minutesAgo of [3, 4, 5, 6]) {
      addSentVerificationToken(store, hourlyEmail, isoMinutesAgo(minutesAgo));
    }

    const hourlyBlocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email-verifications/resend",
      payload: { email: hourlyEmail }
    });
    expect(hourlyBlocked.statusCode).toBe(200);
    expect(hourlyBlocked.json()).toMatchObject({ accepted: true });
    expect(hourlyBlocked.json()).not.toHaveProperty("sent");
    expect(provider.sent).toHaveLength(hourlyInitialSends);

    const dailyEmail = "daily.limit@example.test";
    const dailySignup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Daily Limit HRMS",
        full_name: "Daily Limit User",
        email: dailyEmail,
        timezone: "Asia/Kolkata"
      }
    });
    expect(dailySignup.statusCode).toBe(200);
    const dailyInitialSends = provider.sent.length;
    const dailyToken = store.authTokens.find((token) => token.email === dailyEmail && token.token_type === "email_verification");
    expect(dailyToken).toBeDefined();
    dailyToken!.last_sent_at = isoHoursAgo(2);
    for (const hoursAgo of [3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      addSentVerificationToken(store, dailyEmail, isoHoursAgo(hoursAgo));
    }

    const dailyBlocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email-verifications/resend",
      payload: { email: dailyEmail }
    });
    expect(dailyBlocked.statusCode).toBe(200);
    expect(dailyBlocked.json()).toMatchObject({ accepted: true });
    expect(dailyBlocked.json()).not.toHaveProperty("sent");
    expect(provider.sent).toHaveLength(dailyInitialSends);
  });

  it("sends password reset email only for existing active users", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "unknown.reset@example.test" }
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toMatchObject({ accepted: true });
    expect(provider.sent).toHaveLength(0);

    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "e1@example.test" }
    });
    expect(reset.statusCode).toBe(200);
    expect(provider.sent).toHaveLength(1);
    const sentEmail = provider.sent[0]!;
    expect(sentEmail.html).toContain("https://hrms.example.test/reset-password?token=");
    expect(sentEmail.idempotencyKey).toMatch(/^password_reset:/u);
    expect(JSON.stringify(store.emailDeliveries.at(-1)?.metadata)).not.toContain(reset.json().dev_only.password_reset_token);
  });

  it("records provider failures without leaking internal errors to auth responses", async () => {
    provider.fail = true;
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        company_name: "Failure HRMS",
        full_name: "Failure User",
        email: "failure.user@example.test",
        timezone: "Asia/Kolkata"
      }
    });

    expect(signup.statusCode).toBe(200);
    const delivery = store.emailDeliveries.at(-1);
    expect(delivery?.status).toBe("failed");
    expect(delivery?.error_code).toBe("email_delivery_failed");
    expect(signup.body).not.toContain("simulated email provider failure");
  });
});

describe("Resend webhook processing", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let app: FastifyInstance;
  let store: DataStore;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.NODE_ENV = "test";
    process.env.JWT_ACCESS_SECRET = "test-access-secret-change-me";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-change-me";
    process.env.EMAIL_DELIVERY_MODE = "log";
    process.env.RESEND_FROM_EMAIL = "verify@example.test";
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = "300";
    process.env.FRONTEND_URL = "https://hrms.example.test";
    store = createMemoryDataStore();
    app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    process.env = originalEnv;
  });

  it("rejects missing webhook signatures", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ id: "evt_missing", type: "email.delivered", data: { email_id: "resend_1" } })
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects invalid webhook signatures", async () => {
    const payload = JSON.stringify({ id: "evt_invalid", type: "email.delivered", data: { email_id: "resend_1" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...signedWebhookHeaders("msg_invalid", svixTimestamp(), payload, "wrong-secret"), "content-type": "application/json" },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(store.emailEvents).toHaveLength(0);
  });

  it("accepts webhook timestamps inside tolerance", async () => {
    const payload = JSON.stringify({ id: "evt_timestamp_valid", type: "email.sent", data: { email_id: "resend_valid_timestamp" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...signedWebhookHeaders("msg_timestamp_valid", svixTimestamp(-299), payload, "test-webhook-secret"), "content-type": "application/json" },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ received: true, duplicate: false, event_type: "email.sent" });
    expect(store.emailEvents).toHaveLength(1);
  });

  it("rejects webhook timestamps older than tolerance", async () => {
    const payload = JSON.stringify({ id: "evt_timestamp_old", type: "email.delivered", data: { email_id: "resend_old_timestamp" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...signedWebhookHeaders("msg_timestamp_old", svixTimestamp(-301), payload, "test-webhook-secret"), "content-type": "application/json" },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(store.emailEvents).toHaveLength(0);
  });

  it("rejects webhook timestamps too far in the future", async () => {
    const payload = JSON.stringify({ id: "evt_timestamp_future", type: "email.delivered", data: { email_id: "resend_future_timestamp" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...signedWebhookHeaders("msg_timestamp_future", svixTimestamp(301), payload, "test-webhook-secret"), "content-type": "application/json" },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(store.emailEvents).toHaveLength(0);
  });

  it("rejects non-numeric webhook timestamps", async () => {
    const payload = JSON.stringify({ id: "evt_timestamp_invalid", type: "email.delivered", data: { email_id: "resend_invalid_timestamp" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...signedWebhookHeaders("msg_timestamp_invalid", "not-a-number", payload, "test-webhook-secret"), "content-type": "application/json" },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(store.emailEvents).toHaveLength(0);
  });

  it("rejects missing webhook timestamps", async () => {
    const payload = JSON.stringify({ id: "evt_timestamp_missing", type: "email.delivered", data: { email_id: "resend_missing_timestamp" } });
    const headers = signedWebhookHeaders("msg_timestamp_missing", svixTimestamp(), payload, "test-webhook-secret");
    delete headers["svix-timestamp"];
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...headers, "content-type": "application/json" },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(store.emailEvents).toHaveLength(0);
  });

  it("stores deduplicated webhook events, updates delivery status, and never verifies users from webhook data", async () => {
    const pendingUser = store.users.find((user) => user.email === "e1@example.test");
    expect(pendingUser).toBeDefined();
    pendingUser!.email_verified_at = null;
    pendingUser!.email_verification_status = "pending";
    pendingUser!.version += 1;
    store.emailDeliveries.push({
      id: "00000000-0000-4000-8000-000000000001",
      provider: "resend",
      template_key: "verify",
      purpose: "email_verification",
      user_id: pendingUser!.id,
      email: pendingUser!.email,
      subject: "Verify",
      status: "sent",
      provider_email_id: "resend_delivery_1",
      idempotency_key: "email_verification:test-token",
      error_code: null,
      error_message: null,
      queued_at: nowIso(),
      sent_at: nowIso(),
      delivered_at: null,
      failed_at: null,
      bounced_at: null,
      complained_at: null,
      metadata: {},
      created_at: nowIso(),
      updated_at: nowIso(),
      version: 1
    });

    const payload = JSON.stringify({
      id: "evt_delivered_1",
      type: "email.delivered",
      data: {
        email_id: "resend_delivery_1",
        to: ["e1@example.test"],
        html: "https://hrms.example.test/verify-email?token=secret"
      }
    });
    const headers = signedWebhookHeaders("msg_1", svixTimestamp(), payload, "test-webhook-secret");
    const delivered = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...headers, "content-type": "application/json" },
      payload
    });

    expect(delivered.statusCode).toBe(200);
    expect(delivered.json()).toMatchObject({ received: true, duplicate: false, event_type: "email.delivered" });
    expect(store.emailEvents).toHaveLength(1);
    expect(JSON.stringify(store.emailEvents[0]!.payload)).not.toContain("secret");
    expect(store.emailDeliveries[0]!.status).toBe("delivered");
    expect(store.emailDeliveries[0]!.delivered_at).toEqual(expect.any(String));
    expect(pendingUser!.email_verified_at).toBeNull();
    expect(pendingUser!.email_verification_status).toBe("pending");

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...headers, "content-type": "application/json" },
      payload
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ received: true, duplicate: true });
    expect(store.emailEvents).toHaveLength(1);
  });

  it("updates verification delivery bounces without marking users verified", async () => {
    const user = store.users.find((candidate) => candidate.email === "e1@example.test");
    expect(user).toBeDefined();
    user!.email_verified_at = null;
    user!.email_verification_status = "pending";
    store.emailDeliveries.push({
      id: "00000000-0000-4000-8000-000000000002",
      provider: "resend",
      template_key: "verify",
      purpose: "email_verification",
      user_id: user!.id,
      email: user!.email,
      subject: "Verify",
      status: "sent",
      provider_email_id: "resend_delivery_2",
      idempotency_key: "email_verification:test-token-2",
      error_code: null,
      error_message: null,
      queued_at: nowIso(),
      sent_at: nowIso(),
      delivered_at: null,
      failed_at: null,
      bounced_at: null,
      complained_at: null,
      metadata: {},
      created_at: nowIso(),
      updated_at: nowIso(),
      version: 1
    });

    const payload = JSON.stringify({
      id: "evt_bounced_1",
      type: "email.bounced",
      data: { email_id: "resend_delivery_2", to: ["e1@example.test"] }
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/resend",
      headers: { ...signedWebhookHeaders("msg_2", svixTimestamp(1), payload, "test-webhook-secret"), "content-type": "application/json" },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(store.emailDeliveries[0]!.status).toBe("bounced");
    expect(store.emailDeliveries[0]!.bounced_at).toEqual(expect.any(String));
    expect(user!.email_verified_at).toBeNull();
    expect(user!.email_verification_status).toBe("bounced");
  });
});

function signedWebhookHeaders(id: string, timestamp: string, payload: string, secret: string): Record<string, string> {
  const signature = createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`
  };
}

function svixTimestamp(offsetSeconds = 0): string {
  return String(Math.floor(Date.now() / 1000) + offsetSeconds);
}

function addSentVerificationToken(store: DataStore, email: string, sentAt: string): void {
  store.authTokens.push({
    id: randomUUID(),
    token_hash: randomUUID().replace(/-/gu, "").padEnd(64, "0").slice(0, 64),
    token_type: "email_verification",
    user_id: null,
    email,
    company_id: null,
    status: "revoked",
    expires_at: isoHoursAgo(-24),
    used_at: null,
    revoked_at: sentAt,
    created_ip_hash: null,
    user_agent_hash: null,
    last_sent_at: sentAt,
    send_count: 1,
    created_at: sentAt,
    metadata: { test: true }
  });
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
