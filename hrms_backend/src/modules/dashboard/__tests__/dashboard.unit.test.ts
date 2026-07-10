import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { DashboardService } from "../service.js";

describe("dashboard summary scoping", () => {
  it("limits privileged dashboard metrics to the actor active company", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const finance = addCompanyDepartment(store, "company-a", "FIN", "Finance");
    addCompanyDepartment(store, "company-a", "DESIGN", "Design");
    addCompanyDepartment(store, "company-b", "OPS", "Operations");
    admin.department_id = finance.id;
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

    const summary = new DashboardService(store).summary(admin);

    expect(summary.scope).toMatchObject({
      employee_code: "ADM",
      visibility: "all"
    });
    expect(summary.workforce.visible_employees).toBe(1);
    expect(summary.workforce.active_employees).toBe(1);
    expect(summary.workforce.departments.map((department) => ({
      code: department.department_code,
      active_employees: department.active_employees
    }))).toEqual([
      { code: "DESIGN", active_employees: 0 },
      { code: "FIN", active_employees: 1 }
    ]);
    expect(summary.cards.find((card) => card.key === "active_employees")?.value).toBe(1);
    expect(summary.cards.find((card) => card.key === "attendance_exceptions")?.value).toBe(0);
    expect(summary.operations.assets_total).toBe(0);
    expect(summary.operations.notifications_pending).toBe(0);
    expect(summary.operations.outbox_pending).toBe(0);
  });
});

function addCompanyDepartment(store: ReturnType<typeof createMemoryDataStore>, companyId: string, code: string, name: string) {
  const department = {
    id: `dept-${companyId}-${code}`,
    company_id: companyId,
    department_code: code,
    name,
    cost_center: null,
    parent_department_id: null,
    director_user_id: null,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  store.departments.push(department);
  return department;
}
