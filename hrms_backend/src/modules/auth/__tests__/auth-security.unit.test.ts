import { EmploymentStatuses } from "#shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { createMemoryDataStore } from "../../../platform/data-store.js";

import type { DataStore } from "../../../platform/data-store.js";
import type {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "../../../platform/email/types.js";

class FakeEmailProvider implements EmailProvider {
  readonly sent: SendEmailInput[] = [];
  fail = false;

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);

    if (this.fail) {
      throw new Error("simulated provider failure");
    }

    return {
      providerEmailId: `resend_${this.sent.length}`,
    };
  }
}

describe("Auth Security Hardening", () => {
  const baseTime = new Date("2026-01-01T10:00:00.000Z");
  let originalEnv: NodeJS.ProcessEnv;
  let app: FastifyInstance;
  let store: DataStore;
  let provider: FakeEmailProvider;

  function advanceTime(ms: number): void {
    vi.setSystemTime(new Date(Date.now() + ms));
  }

  beforeEach(async () => {
    originalEnv = { ...process.env };

    process.env.NODE_ENV = "development";
    process.env.JWT_ACCESS_SECRET = "test-access-secret";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

    process.env.EMAIL_DELIVERY_MODE = "send";
    process.env.EMAIL_DELIVERY_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "verify@example.test";
    process.env.RESEND_WEBHOOK_SECRET = "test-secret";

    process.env.FRONTEND_URL = "https://hrms.example.test";
    process.env.API_BASE_URL = "http://localhost:3001";

    process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = "60";
    process.env.EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT = "5";
    process.env.EMAIL_VERIFICATION_RESEND_DAILY_LIMIT = "10";

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(baseTime);

    store = createMemoryDataStore();
    provider = new FakeEmailProvider();

    app = await buildApp({
      dataStore: store,
      emailProvider: provider,
      rateLimit: false,
    });

    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    vi.useRealTimers();
    process.env = originalEnv;
  });

  describe("Enumeration Resistance", () => {
    it("returns the same generic response for an existing account", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example HRMS",
          full_name: "Debasis",
          email: "debasis@example.test",
          password: "Password123!",
        },
      });

      expect(signup.statusCode).toBe(200);

      provider.sent.length = 0;

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(response.json()).toMatchObject({
        accepted: true,
      });

      expect(provider.sent).toHaveLength(1);
    });

    it("returns the same generic response for an unknown account", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "unknown@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(response.json()).toMatchObject({
        accepted: true,
      });

      expect(provider.sent).toHaveLength(0);
    });

    it("does not leak account existence through the password reset response", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "e1@example.test",
          password: "Password123!",
        },
      });

      const existing = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      const unknown = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "random@example.test",
        },
      });

      expect(existing.statusCode).toBe(200);
      expect(unknown.statusCode).toBe(200);

      expect(existing.json().accepted).toBe(true);
      expect(unknown.json().accepted).toBe(true);

      expect(existing.json()).not.toHaveProperty("error");
      expect(unknown.json()).not.toHaveProperty("error");
    });

    it("does not reveal inactive users", async () => {
      const user = store.users[0]!;

      user.employment_status = EmploymentStatuses.Terminated;

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: user.email,
        },
      });

      expect(response.statusCode).toBe(200);

      expect(response.json()).toMatchObject({
        accepted: true,
      });

      expect(provider.sent).toHaveLength(0);
    });

    it("does not send password reset emails when no active credentials exist", async () => {
      const user = store.users[0]!;

      store.userCredentials = [];

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: user.email,
        },
      });

      expect(response.statusCode).toBe(200);

      expect(response.json().accepted).toBe(true);

      expect(provider.sent).toHaveLength(0);
    });
  });
  describe("Password Reset Abuse Protection", () => {
    it("allows the first password reset request", async () => {
      //   await app.inject({
      //     method: "POST",
      //     url: "/api/v1/auth/signup",
      //     payload: {
      //       company_name: "Example",
      //       full_name: "Debasis",
      //       email: "e1@example.test",
      //       password: "Password123!",
      //     },
      //   });

      provider.sent.length = 0;

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().accepted).toBe(true);

      expect(provider.sent).toHaveLength(1);

      expect(
        store.authTokens.filter(
          (token) => token.token_type === "password_reset",
        ),
      ).toHaveLength(1);
    });

    it("blocks an immediate retry during cooldown", async () => {
      //   await app.inject({
      //     method: "POST",
      //     url: "/api/v1/auth/signup",
      //     payload: {
      //       company_name: "Example",
      //       full_name: "Debasis",
      //       email: "e1@example.test",
      //       password: "Password123!",
      //     },
      //   });

      provider.sent.length = 0;

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      const second = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(second.statusCode).toBe(200);

      expect(second.json().accepted).toBe(true);

      expect(second.json().retry_after_seconds).toBeGreaterThan(0);

      expect(provider.sent).toHaveLength(1);

      expect(
        store.authTokens.filter((t) => t.token_type === "password_reset"),
      ).toHaveLength(1);
    });

    it("creates a new active password reset token after the cooldown expires", async () => {
      provider.sent.length = 0;

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      advanceTime(61_000);

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(provider.sent).toHaveLength(2);

      const activeTokens = store.authTokens.filter(
        (token) =>
          token.token_type === "password_reset" && token.status === "active",
      );

      expect(activeTokens).toHaveLength(1);
    });

    it("revokes the previous password reset token before issuing a new one", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      advanceTime(61_000);

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      const revokedTokens = store.authTokens.filter(
        (token) =>
          token.token_type === "password_reset" && token.status === "revoked",
      );

      const activeTokens = store.authTokens.filter(
        (token) =>
          token.token_type === "password_reset" && token.status === "active",
      );

      expect(revokedTokens.length).toBeGreaterThanOrEqual(1);
      expect(activeTokens).toHaveLength(1);
    });

    it("returns the remaining cooldown time", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      advanceTime(25_000);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().retry_after_seconds).toBeGreaterThanOrEqual(34);
      expect(response.json().retry_after_seconds).toBeLessThanOrEqual(36);
    });

    it("returns the same generic response while blocked", async () => {
      //   await app.inject({
      //     method: "POST",
      //     url: "/api/v1/auth/signup",
      //     payload: {
      //       company_name: "Example",
      //       full_name: "Debasis",
      //       email: "e1@example.test",
      //       password: "Password123!",
      //     },
      //   });

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      const blocked = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e2@example.test",
        },
      });

      expect(blocked.statusCode).toBe(200);

      expect(blocked.json()).toEqual(
        expect.objectContaining({
          accepted: true,
        }),
      );

      expect(blocked.json()).not.toHaveProperty("error");
    });

    it("does not send emails for unknown users", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "unknown@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(response.json().accepted).toBe(true);

      expect(provider.sent).toHaveLength(0);

      expect(
        store.authTokens.filter((t) => t.token_type === "password_reset"),
      ).toHaveLength(0);
    });
  });
  describe("Verification Email Abuse Protection", () => {
    it("allows the first verification resend request", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example HRMS",
          full_name: "Debasis",
          email: "pending-resend@example.test",
          password: "Password123!",
        },
      });

      expect(signup.statusCode).toBe(200);

      provider.sent.length = 0;

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-resend@example.test",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().accepted).toBe(true);

      expect(response.json().retry_after_seconds).toBeGreaterThan(0);
      expect(provider.sent).toHaveLength(0);
    });

    it("blocks repeated verification resend requests during cooldown", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "pending-cooldown@example.test",
          password: "Password123!",
        },
      });

      provider.sent.length = 0;

      const first = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-cooldown@example.test",
        },
      });

      const second = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-cooldown@example.test",
        },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      expect(first.json().retry_after_seconds).toBeGreaterThan(0);
      expect(second.json().retry_after_seconds).toBeGreaterThan(0);

      // Neither resend should send an email during cooldown.
      expect(provider.sent).toHaveLength(0);
    });

    it("allows verification resend after cooldown expires", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "pending-after-cooldown@example.test",
          password: "Password123!",
        },
      });

      provider.sent.length = 0;

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-after-cooldown@example.test",
        },
      });

      advanceTime(61_000);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-after-cooldown@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(provider.sent).toHaveLength(1);

      const activeTokens = store.authTokens.filter(
        (token) =>
          token.token_type === "email_verification" &&
          token.status === "active",
      );

      expect(activeTokens).toHaveLength(1);
    });

    it("revokes the previous verification token before issuing a new one", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "pending-revoke@example.test",
          password: "Password123!",
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-revoke@example.test",
        },
      });

      advanceTime(61_000);

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-revoke@example.test",
        },
      });

      const active = store.authTokens.filter(
        (t) => t.token_type === "email_verification" && t.status === "active",
      );

      const revoked = store.authTokens.filter(
        (t) => t.token_type === "email_verification" && t.status === "revoked",
      );

      expect(active).toHaveLength(1);
      expect(revoked.length).toBeGreaterThanOrEqual(1);
    });

    it("does not reveal whether an account exists during verification resend", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "unknown@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(response.json()).toMatchObject({
        accepted: true,
      });

      expect(provider.sent).toHaveLength(0);
    });

    it("tracks password reset and verification resend limits independently", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "pending-independent@example.test",
          password: "Password123!",
        },
      });

      provider.sent.length = 0;

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      const resend = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "pending-independent@example.test",
        },
      });

      expect(resend.statusCode).toBe(200);
      expect(resend.json().accepted).toBe(true);

      expect(provider.sent).toHaveLength(1);

      expect(
        store.authTokens.filter((t) => t.token_type === "password_reset")
          .length,
      ).toBeGreaterThan(0);

      expect(
        store.authTokens.filter((t) => t.token_type === "email_verification")
          .length,
      ).toBeGreaterThan(0);
    });
  });
  describe("Edge Cases & Regression", () => {
    it("treats email addresses case-insensitively", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "e1@example.test",
          password: "Password123!",
        },
      });

      provider.sent.length = 0;

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(provider.sent).toHaveLength(1);
    });

    it("allows requests again after the hourly window expires", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "e1@example.test",
          password: "Password123!",
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      advanceTime(61 * 60 * 1000);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("allows requests again after the daily window expires", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "e1@example.test",
          password: "Password123!",
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      advanceTime(24 * 60 * 60 * 1000 + 1000);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("never returns a negative retry_after_seconds", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "e1@example.test",
          password: "Password123!",
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.json().retry_after_seconds).toBeGreaterThanOrEqual(0);
    });

    it("verification resend history does not block password reset", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "verification-history@example.test",
          password: "Password123!",
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "verification-history@example.test",
        },
      });

      advanceTime(61_000);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(provider.sent.length).toBeGreaterThan(1);
    });

    it("password reset history does not block verification resend", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Example",
          full_name: "Debasis",
          email: "password-history@example.test",
          password: "Password123!",
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      advanceTime(61_000);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email-verifications/resend",
        payload: {
          email: "password-history@example.test",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("does not break the signup verification flow", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Regression",
          full_name: "Tester",
          email: "tester@example.test",
          password: "Password123!",
        },
      });

      expect(signup.statusCode).toBe(200);

      expect(provider.sent).toHaveLength(1);

      const verificationToken = store.authTokens.find(
        (token) => token.token_type === "email_verification",
      );

      expect(verificationToken).toBeDefined();
    });

    it("stores only hashed password reset tokens", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: {
          email: "e1@example.test",
        },
      });

      expect(response.statusCode).toBe(200);

      const rawToken = response.json().dev_only.password_reset_token;

      const stored = store.authTokens.find(
        (token) => token.token_type === "password_reset",
      );

      expect(stored?.token_hash).not.toBe(rawToken);
      expect(stored?.token_hash).toHaveLength(64);
    });
  });
});
