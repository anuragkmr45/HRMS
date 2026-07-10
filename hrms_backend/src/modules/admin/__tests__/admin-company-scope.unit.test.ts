import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { AdminService } from "../service.js";

describe("admin company-scoped master data", () => {
  it("lists and mutates departments and designations only for the actor company", () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    assignCompany(store, admin.id, companyA);
    const companyAData = addCompanyMasterData(store, companyA, "A");
    const companyBData = addCompanyMasterData(store, companyB, "B");

    expect(service.listDepartments(admin, { page: 1, page_size: 25 }).items.map((department) => department.name)).toEqual([
      companyAData.department.name
    ]);
    expect(service.listDesignations(admin, { page: 1, page_size: 25 }).items.map((designation) => designation.title)).toEqual([
      companyAData.designation.title
    ]);

    expect(() =>
      service.updateDepartment(admin, companyBData.department.id, {
        expected_version: 1,
        name: "Should Not Update"
      })
    ).toThrowError("Department not found");
    expect(() =>
      service.updateDesignation(admin, companyBData.designation.id, {
        expected_version: 1,
        title: "Should Not Update"
      })
    ).toThrowError("Designation not found");
  });

  it("creates company-scoped policy defaults instead of sharing global defaults", () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    assignCompany(store, admin.id, companyA);

    const policies = service.listAdminPolicies(admin, {}).policies;

    expect(policies.map((policy) => policy.policy_key).sort()).toEqual(["asset", "attendance", "expense", "leave", "sla", "timesheet"]);
    expect(store.adminPolicies.filter((policy) => policy.company_id === companyA)).toHaveLength(6);
    expect(store.adminPolicies.filter((policy) => policy.company_id === null)).toHaveLength(6);
  });
});

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";

function assignCompany(store: ReturnType<typeof createMemoryDataStore>, userId: string, companyId: string) {
  store.userSessionPreferences.push({
    id: `pref-${companyId}`,
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

function addCompanyMasterData(store: ReturnType<typeof createMemoryDataStore>, companyId: string, suffix: string) {
  const department = {
    id: `dept-${suffix}`,
    company_id: companyId,
    department_code: `D-${suffix}`,
    name: `Department ${suffix}`,
    cost_center: null,
    parent_department_id: null,
    director_user_id: null,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  const designation = {
    id: `desg-${suffix}`,
    company_id: companyId,
    designation_code: `G-${suffix}`,
    title: `Designation ${suffix}`,
    level: 1,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  store.departments.push(department);
  store.designations.push(designation);
  return { department, designation };
}
