import { describe, expect, it } from "vitest";
import { createMemoryDataStore, seedIds, type MemoryDataStore } from "../../../platform/data-store.js";
import { Roles } from "#shared";
import { CoreService } from "../service.js";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";

describe("core hierarchy", () => {
  it("resolves ltree-style subtree without recursive traversal", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const subtree = service.resolveSubtree(seedIds.reviewer);
    expect(subtree.map((user) => user.employee_code).sort()).toEqual(["E1", "E2", "E3"]);
  });

  it("excludes inactive users from active lookup", () => {
    const store = createMemoryDataStore();
    store.users.find((user) => user.id === seedIds.employee1)!.employment_status = "inactive";
    const service = new CoreService(store);
    const subtree = service.resolveSubtree(seedIds.reviewer);
    expect(subtree.map((user) => user.employee_code)).not.toContain("E1");
  });

  it("filters and enriches the employee directory for scoped frontend tables", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const result = service.listUsers(admin, {
      page: 1,
      page_size: 10,
      manager_user_id: seedIds.manager,
      role: Roles.Employee,
      login_state: "enabled",
      sort: "-employee_code"
    });

    expect(result.total).toBe(3);
    expect(result.summary.filters_applied.sort()).toEqual(["login_state", "manager_user_id", "role"]);
    expect(result.items.map((user) => user.employee_code)).toEqual(["E3", "E2", "E1"]);
    expect(result.items[0]).toMatchObject({
      department: { department_code: "SALES" },
      designation: { designation_code: "EMPLOYEE" },
      manager: { employee_code: "D1" },
      login_state: "enabled",
      display_label: "E3 - Employee E3"
    });
  });

  it("limits privileged employee directory reads to the active company when a company preference exists", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.userSessionPreferences.push({
      id: "pref-admin-company-a",
      user_id: admin.id,
      active_role: Roles.Admin,
      company_id: "company-a",
      landing_page: "/dashboard",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      version: 1
    });

    const result = service.listUsers(admin, {
      page: 1,
      page_size: 25,
      sort: "employee_code"
    });

    expect(result.total).toBe(1);
    expect(result.items.map((user) => user.employee_code)).toEqual(["ADM"]);
  });

  it("assigns newly created employees to the actor active company", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const masterData = addCompanyMasterData(store, "company-a");
    store.userSessionPreferences.push({
      id: "pref-admin-company-a",
      user_id: admin.id,
      active_role: Roles.Admin,
      company_id: "company-a",
      landing_page: "/dashboard",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      version: 1
    });

    const created = service.createUser(admin, {
      employee_code: "NEW1",
      email: "new1@example.test",
      full_name: "New Employee",
      department_id: masterData.department.id,
      designation_id: masterData.designation.id,
      roles: [Roles.Employee],
      employment_status: "active"
    });

    expect(created.employee_code).toBe("NEW1");
    expect(store.userSessionPreferences.find((preference) => preference.user_id === created.id)).toMatchObject({
      company_id: "company-a",
      active_role: Roles.Employee
    });
    const result = service.listUsers(admin, {
      page: 1,
      page_size: 25,
      sort: "employee_code"
    });
    expect(result.items.map((user) => user.employee_code)).toEqual(["ADM", "NEW1"]);
  });

  it("rejects cross-company department and designation assignments", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const companyAData = addCompanyMasterData(store, "company-a");
    const companyBData = addCompanyMasterData(store, "company-b");
    store.userSessionPreferences.push({
      id: "pref-admin-company-a",
      user_id: admin.id,
      active_role: Roles.Admin,
      company_id: "company-a",
      landing_page: "/dashboard",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      version: 1
    });

    expect(() =>
      service.createUser(admin, {
        employee_code: "NEW2",
        email: "new2@example.test",
        full_name: "Cross Company Department",
        department_id: companyBData.department.id,
        designation_id: companyAData.designation.id,
        roles: [Roles.Employee],
        employment_status: "active"
      })
    ).toThrowError("Active department not found");

    expect(() =>
      service.createUser(admin, {
        employee_code: "NEW3",
        email: "new3@example.test",
        full_name: "Cross Company Designation",
        department_id: companyAData.department.id,
        designation_id: companyBData.designation.id,
        roles: [Roles.Employee],
        employment_status: "active"
      })
    ).toThrowError("Active designation not found");
  });

  it("returns employee detail summaries without loading unavailable modules", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const detail = service.getUser(admin, seedIds.manager);

    expect(detail.direct_reports_summary).toEqual({ total: 3, active: 3 });
    expect(detail.reporting_line.map((user) => user.employee_code)).toEqual(["S1"]);
    expect(detail.profile_tabs_available).toContain("expenses");
    expect(detail.attendance_summary.status).toBe("not_available");
    expect(detail.leave_summary).toEqual({
      pending_leave: 0,
      approved_leave_ytd: 0,
      pending_wfh: 0,
      approved_wfh_ytd: 0
    });
  });

  it("blocks every Core path that would remove the last recoverable Admin in an organization", async () => {
    const actorStore = createMemoryDataStore();
    const actor = actorStore.users.find((user) => user.id === seedIds.admin)!;

    for (const action of ["patch-status", "deactivate", "disable-login", "remove-admin-role"] as const) {
      const store = createMemoryDataStore();
      const service = new CoreService(store);
      const targetAdmin = addCompanyAdmin(store, "last", companyA);

      const run = () => {
        switch (action) {
          case "patch-status":
            return service.updateUser(actor, targetAdmin.id, {
              expected_version: 1,
              employment_status: "inactive"
            });
          case "deactivate":
            return service.deactivateUser(actor, targetAdmin.id, {
              expected_version: 1,
              status: "inactive"
            });
          case "disable-login":
            return service.disableLogin(actor, targetAdmin.id, {
              expected_version: 1
            });
          case "remove-admin-role":
            return service.replaceRoles(actor, targetAdmin.id, {
              expected_version: 1,
              roles: [Roles.Employee]
            });
        }
      };

      await expect(Promise.resolve().then(run)).rejects.toMatchObject({
        statusCode: 409,
        message: "At least one active Admin with login access must remain in this organization."
      });
    }
  });

  it("allows Admin lifecycle changes when another recoverable Admin remains in the same organization", async () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const actor = store.users.find((user) => user.id === seedIds.admin)!;
    const targetAdmin = addCompanyAdmin(store, "target", companyA);
    addCompanyAdmin(store, "backup", companyA);
    addCompanyAdmin(store, "other-company", companyB);

    const result = service.deactivateUser(actor, targetAdmin.id, {
      expected_version: 1,
      status: "inactive"
    });

    expect(result.employment_status).toBe("inactive");
    expect(store.userCredentials.find((credential) => credential.user_id === targetAdmin.id)?.status).toBe("revoked");
  });

});

function addCompanyAdmin(store: MemoryDataStore, suffix: string, companyId: string) {
  const base = store.users.find((user) => user.id === seedIds.admin)!;
  const user = {
    ...base,
    id: `33333333-3333-4333-8333-${suffix.padStart(12, "0").slice(0, 12)}`,
    employee_code: `ADM-${suffix.toUpperCase().slice(0, 12)}`,
    email: `admin-${suffix}@example.test`,
    full_name: `Admin ${suffix}`,
    version: 1
  };
  store.users.push(user);
  store.userCredentials.push({
    id: `44444444-4444-4444-8444-${suffix.padStart(12, "0").slice(0, 12)}`,
    user_id: user.id,
    password_hash: `hash-${suffix}`,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null
  });
  store.userSessionPreferences.push({
    id: `55555555-5555-4555-8555-${suffix.padStart(12, "0").slice(0, 12)}`,
    user_id: user.id,
    active_role: Roles.Admin,
    company_id: companyId,
    landing_page: "/dashboard",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    version: 1
  });
  return user;
}

function addCompanyMasterData(store: MemoryDataStore, companyId: string) {
  const safeSuffix = companyId.replace(/[^a-z0-9]/giu, "").slice(0, 8).toUpperCase();
  const department = {
    id: `66666666-6666-4666-8666-${safeSuffix.padStart(12, "0").slice(0, 12)}`,
    company_id: companyId,
    department_code: `D-${safeSuffix}`,
    name: `Department ${companyId}`,
    cost_center: null,
    parent_department_id: null,
    director_user_id: null,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  const designation = {
    id: `77777777-7777-4777-8777-${safeSuffix.padStart(12, "0").slice(0, 12)}`,
    company_id: companyId,
    designation_code: `G-${safeSuffix}`,
    title: `Designation ${companyId}`,
    level: 1,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  store.departments.push(department);
  store.designations.push(designation);
  return { department, designation };
}
