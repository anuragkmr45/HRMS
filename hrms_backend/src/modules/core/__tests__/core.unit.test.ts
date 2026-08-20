import { describe, expect, it } from "vitest";
import { createMemoryDataStore, seedIds, type MemoryDataStore } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
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
    addCompanyProfile(store, companyA);
    assignCompany(store, admin.id, companyA);

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
    addCompanyProfile(store, companyA);
    const masterData = addCompanyMasterData(store, companyA);
    assignCompany(store, admin.id, companyA);

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
      company_id: companyA,
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
    addCompanyProfile(store, companyA);
    addCompanyProfile(store, companyB);
    const companyAData = addCompanyMasterData(store, companyA);
    const companyBData = addCompanyMasterData(store, companyB);
    assignCompany(store, admin.id, companyA);

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
      addCompanyProfile(store, companyA);
      assignCompany(store, actor.id, companyA);
      store.userCredentials
        .filter((credential) => credential.user_id === actor.id)
        .forEach((credential) => {
          credential.status = "revoked";
        });
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
    addCompanyProfile(store, companyA);
    addCompanyProfile(store, companyB);
    assignCompany(store, actor.id, companyA);
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

  it("fails closed for missing or stale active company context on export and import reads", async () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const documentsBefore = store.documents.length;
    const outboxBefore = store.outbox.length;

    assignCompany(store, admin.id, null);
    await expect(service.createExportJob(admin, { format: "csv", filters: {} })).rejects.toThrowError(
      "Company context is required",
    );
    expect(() => service.getImportJob(admin, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toThrowError(
      "Company context is required",
    );

    assignCompany(store, admin.id, companyB);
    await expect(service.createExportJob(admin, { format: "csv", filters: {} })).rejects.toThrowError(
      "Company context is required",
    );
    expect(store.documents).toHaveLength(documentsBefore);
    expect(store.outbox).toHaveLength(outboxBefore);
  });

  it("exports only employees visible in the actor active company", async () => {
    const store = createMemoryDataStore();
    store.objectStorage = new MemoryObjectStorage();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const otherCompanyEmployee = store.users.find((user) => user.id === seedIds.employee2)!;
    const defaultCompanyId = defaultCompany(store);
    addCompanyProfile(store, companyB);
    assignCompany(store, otherCompanyEmployee.id, companyB);

    const exportJob = await service.createExportJob(admin, {
      format: "csv",
      filters: {},
      columns: ["employee_code", "full_name"]
    });

    expect(exportJob.row_count).toBe(
      store.users.filter((user) => !user.deleted_at && companyForUser(store, user.id) === defaultCompanyId).length,
    );
    const document = store.documents.find((candidate) => candidate.id === exportJob.download_document_id);
    expect(document).toBeTruthy();
    const object = await store.objectStorage?.getObject(document!.storage_key);
    const csv = object?.body.toString("utf8") ?? "";
    expect(csv).toContain("ADM");
    expect(csv).toContain("E1");
    expect(csv).not.toContain("E2");
  });

  it("rejects foreign-company export filters before generating documents", async () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    addCompanyProfile(store, companyB);
    const foreignData = addCompanyMasterData(store, companyB);
    const documentsBefore = store.documents.length;
    const outboxBefore = store.outbox.length;

    await expect(service.createExportJob(admin, {
      format: "csv",
      filters: { department_id: foreignData.department.id },
    })).rejects.toThrowError("Active department not found");
    await expect(service.createExportJob(admin, {
      format: "csv",
      filters: { designation_id: foreignData.designation.id },
    })).rejects.toThrowError("Active designation not found");

    expect(store.documents).toHaveLength(documentsBefore);
    expect(store.outbox).toHaveLength(outboxBefore);
  });

  it("does not enqueue employee export side effects for unauthorized actors", async () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const manager = store.users.find((user) => user.id === seedIds.manager)!;
    const documentsBefore = store.documents.length;
    const outboxBefore = store.outbox.length;

    await expect(service.createExportJob(manager, { format: "csv", filters: {} })).rejects.toThrowError(
      "Only Admin, HR Manager, and Auditor users can export employee profiles.",
    );
    expect(store.documents).toHaveLength(documentsBefore);
    expect(store.outbox).toHaveLength(outboxBefore);
  });

  it("scopes employee import jobs by company and requester context", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    addCompanyProfile(store, companyB);
    const otherAdmin = addCompanyAdmin(store, "import-b", companyB);

    const job = service.createImportJob(admin, { file_name: "employees.csv", dry_run: true });
    const event = store.outbox.find(
      (candidate) => candidate.aggregate_type === "core.user_import" && candidate.aggregate_id === job.job_id,
    );
    expect(event?.payload).toMatchObject({
      company_id: defaultCompany(store),
      actor_user_id: admin.id,
    });

    expect(() => service.getImportJob(otherAdmin, job.job_id)).toThrowError("Employee import job not found.");
    expect(service.getImportJob(admin, job.job_id)).toMatchObject({
      job_id: job.job_id,
      status: "queued",
    });
  });

});

function defaultCompany(store: MemoryDataStore): string {
  const companyId = store.companyProfiles[0]?.id;
  if (!companyId) throw new Error("Default company fixture is unavailable.");
  return companyId;
}

function companyForUser(store: MemoryDataStore, userId: string): string | null {
  return store.userSessionPreferences.find((preference) => preference.user_id === userId)?.company_id ?? null;
}

function addCompanyProfile(store: MemoryDataStore, companyId: string) {
  if (store.companyProfiles.some((company) => company.id === companyId)) return;
  const base = store.companyProfiles[0]!;
  store.companyProfiles.push({
    ...base,
    id: companyId,
    company_name: `Company ${companyId}`,
    company_slug: `company-${companyId.slice(0, 8)}`,
    status: "active",
    version: 1
  });
}

function assignCompany(store: MemoryDataStore, userId: string, companyId: string | null) {
  const existing = store.userSessionPreferences.find((preference) => preference.user_id === userId);
  if (existing) {
    existing.company_id = companyId;
    existing.updated_at = "2026-01-01T00:00:00.000Z";
    existing.version += 1;
    return;
  }
  store.userSessionPreferences.push({
    id: `55555555-5555-4555-8555-${userId.replace(/[^0-9a-f]/giu, "").padStart(12, "0").slice(0, 12)}`,
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

function addCompanyAdmin(store: MemoryDataStore, suffix: string, companyId: string) {
  addCompanyProfile(store, companyId);
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
