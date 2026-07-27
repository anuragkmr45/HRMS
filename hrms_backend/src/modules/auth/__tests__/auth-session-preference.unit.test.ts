import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import {
  createMemoryDataStore,
  seedIds,
  type MemoryDataStore,
} from "../../../platform/data-store.js";
import { AuthService } from "../service.js";

const otherCompanyId = "11111111-1111-4111-8111-000000000001";
const staleCompanyId = "22222222-2222-4222-8222-000000000001";

describe("auth session preference company assignment", () => {
  it("preserves the assigned company when company_id is omitted", () => {
    const store = createMemoryDataStore();
    const admin = adminFor(store);
    const companyId = preferenceFor(store, admin.id).company_id;

    const session = serviceFor(store).updateSessionPreference(admin, {
      locale: "en-US",
    });

    expect(session.company.id).toBe(companyId);
    expect(preferenceFor(store, admin.id)).toMatchObject({
      company_id: companyId,
      locale: "en-US",
    });
  });

  it("accepts an idempotent company ID", () => {
    const store = createMemoryDataStore();
    const admin = adminFor(store);
    const companyId = preferenceFor(store, admin.id).company_id;

    const session = serviceFor(store).updateSessionPreference(admin, {
      company_id: companyId,
    });

    expect(session.company.id).toBe(companyId);
  });

  it("rejects a different existing active company without mutating the preference", () => {
    const store = createMemoryDataStore();
    const admin = adminFor(store);
    addCompany(store, otherCompanyId, "other-company");
    const before = JSON.stringify(preferenceFor(store, admin.id));

    expect(() =>
      serviceFor(store).updateSessionPreference(admin, {
        company_id: otherCompanyId,
      }),
    ).toThrowError(
      "Company assignment cannot be changed through session preferences.",
    );
    expect(JSON.stringify(preferenceFor(store, admin.id))).toBe(before);
  });

  it("rejects clearing an assigned company", () => {
    const store = createMemoryDataStore();

    expect(() =>
      serviceFor(store).updateSessionPreference(adminFor(store), {
        company_id: null,
      }),
    ).toThrowError(
      "Company assignment cannot be changed through session preferences.",
    );
  });

  it("continues to update role, locale, timezone, and landing page", () => {
    const store = createMemoryDataStore();
    const admin = adminFor(store);

    const session = serviceFor(store).updateSessionPreference(admin, {
      active_role_id: Roles.Admin,
      landing_page: "/reports",
      locale: "en-US",
      timezone: "UTC",
    });

    expect(session.preferences).toEqual({
      active_role: Roles.Admin,
      landing_page: "/reports",
      locale: "en-US",
      timezone: "UTC",
    });
  });

  it("returns the exact assigned active company", () => {
    const store = createMemoryDataStore();
    addCompany(store, otherCompanyId, "other-company");
    preferenceFor(store, seedIds.admin).company_id = otherCompanyId;

    expect(serviceFor(store).sessionContext(adminFor(store)).company.id).toBe(
      otherCompanyId,
    );
  });

  it("does not fall back to the first active company when the assignment is missing", () => {
    const store = createMemoryDataStore();
    store.userSessionPreferences.splice(
      store.userSessionPreferences.findIndex(
        (preference) => preference.user_id === seedIds.admin,
      ),
      1,
    );

    expect(() =>
      serviceFor(store).sessionContext(adminFor(store)),
    ).toThrowError("Company context is required");
  });

  it("rejects a stale company reference", () => {
    const store = createMemoryDataStore();
    preferenceFor(store, seedIds.admin).company_id = staleCompanyId;

    expect(() =>
      serviceFor(store).sessionContext(adminFor(store)),
    ).toThrowError("Company context is required");
  });

  it("rejects an inactive assigned company", () => {
    const store = createMemoryDataStore();
    const companyId = preferenceFor(store, seedIds.admin).company_id;
    const company = store.companyProfiles.find(
      (candidate) => candidate.id === companyId,
    );
    if (!company) throw new Error("Seed company is missing");
    company.status = "inactive";

    expect(() =>
      serviceFor(store).sessionContext(adminFor(store)),
    ).toThrowError("Company context is required");
  });

  it("rejects an invalid stored active role", () => {
    const store = createMemoryDataStore();
    preferenceFor(store, seedIds.admin).active_role = Roles.Employee;
    adminFor(store).roles = [Roles.Admin];

    expect(() =>
      serviceFor(store).sessionContext(adminFor(store)),
    ).toThrowError("Selected role is not assigned to this user.");
  });

  it("returns pending bootstrap session context through its bootstrap token", async () => {
    const store = createMemoryDataStore();
    const service = serviceFor(store);
    const signup = await service.signup({
      company_name: "Bootstrap Company",
      full_name: "Bootstrap Founder",
      email: "bootstrap-founder@example.test",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      password: "Founder@12345",
    });
    const token = (
      signup as typeof signup & {
        dev_only: { email_verification_token: string };
      }
    ).dev_only.email_verification_token;
    const verified = service.verifyEmail({ token });
    const pendingUser = store.users.find(
      (user) => user.id === verified.user_id,
    );
    if (!pendingUser) throw new Error("Pending user is missing");

    const session = service.sessionContext(pendingUser);

    expect(session).toMatchObject({
      setup_required: true,
      next_step: "company_bootstrap",
      company_id: verified.company_id,
    });
  });

  it("bootstrap completion creates a valid initial preference", async () => {
    const store = createMemoryDataStore();
    const service = serviceFor(store);
    const signup = await service.signup({
      company_name: "Completed Bootstrap",
      full_name: "Completed Founder",
      email: "completed-founder@example.test",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      password: "Founder@12345",
    });
    const verificationToken = (
      signup as typeof signup & {
        dev_only: { email_verification_token: string };
      }
    ).dev_only.email_verification_token;
    const verification = service.verifyEmail({ token: verificationToken });
    const verified = verification as typeof verification & {
      dev_only: { company_bootstrap_token: string };
    };

    const completed = service.bootstrapCompany({
      bootstrap_token: verified.dev_only.company_bootstrap_token,
      company_profile: {},
      first_admin_profile: {},
    });

    expect(preferenceFor(store, completed.admin_user.id)).toMatchObject({
      company_id: completed.company.id,
      active_role: Roles.Admin,
    });
    expect(
      service.sessionContext(adminFor(store, completed.admin_user.id)).company
        .id,
    ).toBe(completed.company.id);
  });
});

function serviceFor(store: MemoryDataStore) {
  return new AuthService(store, "test-secret");
}

function adminFor(store: MemoryDataStore, userId = seedIds.admin) {
  const user = store.users.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Admin is missing");
  return user;
}

function preferenceFor(store: MemoryDataStore, userId: string) {
  const preference = store.userSessionPreferences.find(
    (candidate) => candidate.user_id === userId,
  );
  if (!preference) throw new Error("Session preference is missing");
  return preference;
}

function addCompany(store: MemoryDataStore, id: string, slug: string) {
  const source = store.companyProfiles[0];
  if (!source) throw new Error("Seed company is missing");
  store.companyProfiles.push({
    ...source,
    id,
    company_name: `Company ${slug}`,
    company_slug: slug,
  });
}
