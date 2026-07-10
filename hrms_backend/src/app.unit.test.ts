import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createMemoryDataStore, type DataStorePersistence } from "./platform/data-store.js";
import { authHeader, loginAs } from "#testing";

describe("app persistence flushing", () => {
  const originalAppEnv = process.env.APP_ENV;

  afterEach(() => {
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
  });

  it("uses auth-only persistence for signup, email verification, and password setup mutations", async () => {
    process.env.APP_ENV = "local";
    const store = createMemoryDataStore();
    let fullFlushCount = 0;
    let authFlushCount = 0;
    const authFlushOptions: Parameters<NonNullable<DataStorePersistence["flushAuth"]>>[0][] = [];
    const persistence: DataStorePersistence = {
      async flush() {
        fullFlushCount += 1;
      },
      async flushAuth(options) {
        authFlushCount += 1;
        authFlushOptions.push(options);
      },
      async reload() {},
      async close() {}
    };
    store.persistence = persistence;

    const app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
    try {
      const signup = await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Persistence Test",
          full_name: "Persistence User",
          email: "persistence.user@example.test",
          timezone: "Asia/Kolkata"
        }
      });
      expect(signup.statusCode).toBe(200);
      expect(authFlushCount).toBe(1);
      expect(fullFlushCount).toBe(0);
      expect(authFlushOptions[0]?.userIds).toContain(signup.json().signup_id);

      const verificationToken = signup.json().dev_only.email_verification_token;
      expect(typeof verificationToken).toBe("string");

      const verifyEmail = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        payload: { token: verificationToken }
      });
      expect(verifyEmail.statusCode).toBe(200);
      expect(authFlushCount).toBe(2);
      expect(fullFlushCount).toBe(0);
      expect(authFlushOptions[1]?.userIds).toContain(verifyEmail.json().user_id);

      const passwordSetupToken = verifyEmail.json().dev_only.password_setup_token;
      expect(typeof passwordSetupToken).toBe("string");

      const setPassword = await app.inject({
        method: "POST",
        url: "/api/v1/auth/set-password",
        payload: {
          token: passwordSetupToken,
          password: "Asdf@12345",
          confirm_password: "Asdf@12345"
        }
      });
      expect(setPassword.statusCode).toBe(200);
      expect(authFlushCount).toBe(3);
      expect(fullFlushCount).toBe(0);
      expect(authFlushOptions[2]?.userIds).toContain(setPassword.json().user_id);
    } finally {
      await app.close();
    }
  });

  it("uses EMS domain persistence for profile-change request and decision mutations", async () => {
    process.env.APP_ENV = "local";
    const store = createMemoryDataStore();
    let fullFlushCount = 0;
    const domainFlushes: Array<{
      domain: Parameters<NonNullable<DataStorePersistence["flushDomain"]>>[0];
      options: Parameters<NonNullable<DataStorePersistence["flushDomain"]>>[1];
    }> = [];
    const persistence: DataStorePersistence = {
      async flush() {
        fullFlushCount += 1;
      },
      async flushDomain(domain, options) {
        domainFlushes.push({ domain, options });
      },
      async reload() {},
      async close() {}
    };
    store.persistence = persistence;

    const app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
    try {
      const employee = await loginAs(app, "E1");
      const admin = await loginAs(app, "ADM");

      const request = await app.inject({
        method: "POST",
        url: "/api/v1/ems/profile-change-requests",
        headers: authHeader(employee.token),
        payload: {
          field_key: "phone",
          new_value: "+91 99998888777",
          reason: "changed phone no"
        }
      });
      expect(request.statusCode).toBe(200);
      const requestId = request.json().request_id;
      expect(fullFlushCount).toBe(0);
      expect(domainFlushes[0]).toMatchObject({
        domain: "ems",
        options: {
          emsProfileChangeRequestIds: [requestId],
          aggregateIds: [requestId]
        }
      });
      expect(request.headers["server-timing"]).toContain("handler");
      expect(request.headers["server-timing"]).toContain("persistence.ems");

      const decision = await app.inject({
        method: "POST",
        url: `/api/v1/ems/profile-change-requests/${requestId}/decision`,
        headers: authHeader(admin.token),
        payload: { decision: "approved", expected_version: 1 }
      });
      expect(decision.statusCode).toBe(200);
      expect(fullFlushCount).toBe(0);
      expect(domainFlushes[1]).toMatchObject({
        domain: "ems",
        options: {
          emsProfileChangeRequestIds: [requestId],
          aggregateIds: [requestId]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("uses Core domain persistence for dynamic user mutations", async () => {
    process.env.APP_ENV = "local";
    const store = createMemoryDataStore();
    let fullFlushCount = 0;
    const domainFlushes: Array<{
      domain: Parameters<NonNullable<DataStorePersistence["flushDomain"]>>[0];
      options: Parameters<NonNullable<DataStorePersistence["flushDomain"]>>[1];
    }> = [];
    const persistence: DataStorePersistence = {
      async flush() {
        fullFlushCount += 1;
      },
      async flushDomain(domain, options) {
        domainFlushes.push({ domain, options });
      },
      async reload() {},
      async close() {}
    };
    store.persistence = persistence;

    const app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
    try {
      const admin = await loginAs(app, "ADM");
      const target = store.users.find((user) => user.employee_code === "E2");
      expect(target).toBeDefined();

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/core/users/${target!.id}/deactivate`,
        headers: authHeader(admin.token),
        payload: { expected_version: target!.version, status: "inactive" }
      });
      expect(response.statusCode).toBe(200);
      expect(fullFlushCount).toBe(0);
      expect(domainFlushes[0]).toMatchObject({
        domain: "core",
        options: {
          userIds: [target!.id],
          aggregateIds: [target!.id]
        }
      });
      expect(response.headers["server-timing"]).toContain("persistence.core");
    } finally {
      await app.close();
    }
  });

  it("keeps an observable full persistence fallback for unmapped mutation routes", async () => {
    process.env.APP_ENV = "local";
    const store = createMemoryDataStore();
    let fullFlushCount = 0;
    let domainFlushCount = 0;
    const persistence: DataStorePersistence = {
      async flush() {
        fullFlushCount += 1;
      },
      async flushDomain() {
        domainFlushCount += 1;
      },
      async reload() {},
      async close() {}
    };
    store.persistence = persistence;

    const app = await buildApp({ dataStore: store, rateLimit: false });
    app.post("/api/v1/test-full-persistence-fallback", async () => ({ status: "ok" }));
    await app.ready();
    try {
      const admin = await loginAs(app, "ADM");
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/test-full-persistence-fallback",
        headers: authHeader(admin.token)
      });
      expect(response.statusCode).toBe(200);
      expect(fullFlushCount).toBe(1);
      expect(domainFlushCount).toBe(0);
      expect(response.headers["server-timing"]).toContain("persistence.full");
    } finally {
      await app.close();
    }
  });
});
