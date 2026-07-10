import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore, seedIds, type MemoryDataStore } from "../../../platform/data-store.js";
import { AuthService } from "../service.js";

describe("auth session preference admin recovery guard", () => {
  it("blocks moving the last recoverable Admin out of an organization", () => {
    const store = createMemoryDataStore();
    const service = new AuthService(store, "test-secret");
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const currentCompanyId = addCompany(store, "current-company", "11111111-1111-4111-8111-000000000001");
    const nextCompanyId = addCompany(store, "next-company", "22222222-2222-4222-8222-000000000001");
    assignPreference(store, admin.id, currentCompanyId);

    expect(() => service.updateSessionPreference(admin, { company_id: nextCompanyId })).toThrowError(
      "At least one active Admin with login access must remain in this organization."
    );
    expect(store.userSessionPreferences.find((preference) => preference.user_id === admin.id)?.company_id).toBe(currentCompanyId);
  });

  it("allows company preference changes when a recoverable Admin remains", () => {
    const store = createMemoryDataStore();
    const service = new AuthService(store, "test-secret");
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const currentCompanyId = addCompany(store, "current-company", "11111111-1111-4111-8111-000000000001");
    const nextCompanyId = addCompany(store, "next-company", "22222222-2222-4222-8222-000000000001");
    const backupAdmin = addCompanyAdmin(store, "backup");
    assignPreference(store, admin.id, currentCompanyId);
    assignPreference(store, backupAdmin.id, currentCompanyId);

    const session = service.updateSessionPreference(admin, { company_id: nextCompanyId });

    expect(session.company.id).toBe(nextCompanyId);
    expect(store.userSessionPreferences.find((preference) => preference.user_id === admin.id)?.company_id).toBe(nextCompanyId);
  });
});

function addCompany(store: MemoryDataStore, suffix: string, companyId: string) {
  store.companyProfiles.push({
    id: companyId,
    company_name: `Company ${suffix}`,
    company_slug: suffix,
    website: null,
    industry: null,
    address: null,
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    currency: "INR",
    fiscal_year_start_month: 4,
    working_week: "Mon-Fri",
    work_hours_per_day: 8,
    logo_label: null,
    logo_document_id: null,
    logo_url: null,
    logo_file_name: null,
    logo_mime_type: null,
    logo_size_bytes: null,
    status: "active",
    bootstrap_completed_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    version: 1
  });
  return companyId;
}

function addCompanyAdmin(store: MemoryDataStore, suffix: string) {
  const base = store.users.find((user) => user.id === seedIds.admin)!;
  const user = {
    ...base,
    id: "33333333-3333-4333-8333-000000000001",
    employee_code: `ADM-${suffix.toUpperCase()}`,
    email: `admin-${suffix}@example.test`,
    full_name: `Admin ${suffix}`,
    version: 1
  };
  store.users.push(user);
  store.userCredentials.push({
    id: "44444444-4444-4444-8444-000000000001",
    user_id: user.id,
    password_hash: `hash-${suffix}`,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null
  });
  return user;
}

function assignPreference(store: MemoryDataStore, userId: string, companyId: string) {
  store.userSessionPreferences.push({
    id: `55555555-5555-4555-8555-${String(store.userSessionPreferences.length + 1).padStart(12, "0")}`,
    user_id: userId,
    active_role: Roles.Admin,
    company_id: companyId,
    landing_page: "/dashboard",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    version: 1
  });
}
