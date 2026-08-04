import { describe, expect, it } from "vitest";
import { EmploymentStatuses, Roles } from "#shared";
import {
  assertUserInCompanyMembershipContext,
  resolveActiveCompanyMembershipContext,
} from "../company-membership-context.js";
import {
  createMemoryDataStore,
  seedIds,
  type MemoryDataStore,
} from "../data-store.js";

const otherCompanyId = "11111111-1111-4111-8111-000000000001";
const missingCompanyId = "22222222-2222-4222-8222-000000000001";

describe("company membership context", () => {
  it("resolves a valid active user, preference, role, and company", () => {
    const store = createMemoryDataStore();
    const context = resolve(store);

    expect(context).toMatchObject({
      userId: seedIds.admin,
      companyId: preferenceFor(store, seedIds.admin).company_id,
      activeRole: Roles.Admin,
    });
  });

  it("returns the exact stored company instead of the first active company", () => {
    const store = createMemoryDataStore();
    addCompany(store, otherCompanyId, "other-company");
    preferenceFor(store, seedIds.admin).company_id = otherCompanyId;

    expect(resolve(store).companyId).toBe(otherCompanyId);
  });

  it("rejects a missing user", () => {
    const store = createMemoryDataStore();

    expect(() =>
      resolveActiveCompanyMembershipContext(store, {
        userId: "33333333-3333-4333-8333-000000000001",
        operation: "test.resolve",
      }),
    ).toThrowError("User no longer exists");
  });

  it("rejects a deleted user", () => {
    const store = createMemoryDataStore();
    userFor(store).deleted_at = "2026-01-02T00:00:00.000Z";

    expect(() => resolve(store)).toThrowError("User no longer exists");
  });

  it("rejects an inactive user when active employment is required", () => {
    const store = createMemoryDataStore();
    userFor(store).employment_status = EmploymentStatuses.Inactive;

    expect(() => resolve(store)).toThrowError(
      "User account is inactive or blocked",
    );
  });

  it("rejects a missing session preference", () => {
    const store = createMemoryDataStore();
    store.userSessionPreferences.splice(
      store.userSessionPreferences.findIndex(
        (preference) => preference.user_id === seedIds.admin,
      ),
      1,
    );

    expect(() => resolve(store)).toThrowError("Company context is required");
  });

  it("rejects a preference with a null company ID", () => {
    const store = createMemoryDataStore();
    preferenceFor(store, seedIds.admin).company_id = null;

    expect(() => resolve(store)).toThrowError("Company context is required");
  });

  it("rejects a preference pointing to a missing company", () => {
    const store = createMemoryDataStore();
    preferenceFor(store, seedIds.admin).company_id = missingCompanyId;

    expect(() => resolve(store)).toThrowError("Company context is required");
  });

  it("rejects a preference pointing to an inactive company", () => {
    const store = createMemoryDataStore();
    const company = store.companyProfiles[0];
    if (!company) throw new Error("Seed company is missing");
    company.status = "inactive";

    expect(() => resolve(store)).toThrowError("Company context is required");
  });

  it("rejects a stored active role that is not assigned to the user", () => {
    const store = createMemoryDataStore();
    preferenceFor(store, seedIds.admin).active_role = Roles.Employee;
    userFor(store).roles = [Roles.Admin];

    expect(() => resolve(store)).toThrowError(
      "Selected role is not assigned to this user.",
    );
  });

  it("rejects a requested-company mismatch", () => {
    const store = createMemoryDataStore();

    expect(() => resolve(store, otherCompanyId)).toThrowError(
      "Requested company does not match",
    );
  });

  it("accepts a requested company that matches the assignment", () => {
    const store = createMemoryDataStore();
    const companyId = preferenceFor(store, seedIds.admin).company_id;

    expect(resolve(store, companyId).companyId).toBe(companyId);
  });

  it("accepts a target user in the same company context", () => {
    const store = createMemoryDataStore();
    const companyId = preferenceFor(store, seedIds.admin).company_id;

    expect(
      assertUserInCompanyMembershipContext(store, {
        userId: seedIds.admin,
        companyId: companyId!,
        operation: "test.same_company",
        requireActiveEmployment: true,
      }).companyId,
    ).toBe(companyId);
  });

  it("rejects a target user from another company context", () => {
    const store = createMemoryDataStore();

    expect(() =>
      assertUserInCompanyMembershipContext(store, {
        userId: seedIds.admin,
        companyId: otherCompanyId,
        operation: "test.same_company",
      }),
    ).toThrowError("Requested company does not match");
  });

  it("does not mutate store records", () => {
    const store = createMemoryDataStore();
    const before = JSON.stringify(store);

    resolve(store);

    expect(JSON.stringify(store)).toBe(before);
  });
});

function resolve(store: MemoryDataStore, requestedCompanyId?: string | null) {
  return resolveActiveCompanyMembershipContext(store, {
    userId: seedIds.admin,
    requestedCompanyId,
    operation: "test.resolve",
    requireActiveEmployment: true,
  });
}

function userFor(store: MemoryDataStore) {
  const user = store.users.find((candidate) => candidate.id === seedIds.admin);
  if (!user) throw new Error("Seed admin is missing");
  return user;
}

function preferenceFor(store: MemoryDataStore, userId: string) {
  const preference = store.userSessionPreferences.find(
    (candidate) => candidate.user_id === userId,
  );
  if (!preference) throw new Error("Seed preference is missing");
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
