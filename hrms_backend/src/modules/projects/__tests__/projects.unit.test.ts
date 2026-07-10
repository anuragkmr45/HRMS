import { describe, expect, it } from "vitest";
import {
  ProjectBillingTypes,
  ProjectHealthStatuses,
  ProjectPriorities,
  ProjectStatuses,
  ProjectTypes,
  Roles
} from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { ProjectsService } from "../service.js";

describe("project company visibility", () => {
  it("hides legacy seed projects when the actor has an active company preference", () => {
    const store = createMemoryDataStore();
    const service = new ProjectsService(store);
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

    const emptyList = service.listProjects(admin, {
      page: 1,
      page_size: 25
    });
    expect(emptyList.total).toBe(0);

    const create = service.createProject(admin, {
      project_code: "ORG-PROJ",
      name: "Org Project",
      client_name: "Internal",
      project_type: ProjectTypes.Internal,
      billing_type: ProjectBillingTypes.Internal,
      manager_user_id: admin.id,
      start_date: "2026-06-01",
      end_date: "2026-12-31",
      status: ProjectStatuses.Active,
      health: ProjectHealthStatuses.Green,
      estimated_hours: "100.00",
      estimated_budget: "0.00",
      tech_stack: [],
      priority: ProjectPriorities.Medium
    });

    expect(create.project.project_code).toBe("ORG-PROJ");
    const scopedList = service.listProjects(admin, {
      page: 1,
      page_size: 25
    });
    expect(scopedList.items.map((project) => project.project_code)).toEqual(["ORG-PROJ"]);
  });
});
