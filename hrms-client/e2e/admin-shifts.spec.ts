import { expect, test, type Page, type Route } from "@playwright/test";

test("admin manages effective-dated shift templates and assignments", async ({ page }) => {
  await installShiftAdminApi(page);
  await page.goto("/admin-settings/shifts", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("main").getByRole("heading", { name: "Admin Settings" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shift scheduling" })).toBeVisible();
  await expect(page.getByText("Night operations")).toBeVisible();
  await expect(page.getByText("22:00 to 07:00 (+1 day)")).toBeVisible();
  await expect(page.getByText("Company default")).toBeVisible();

  await page.getByRole("button", { name: "New template" }).click();
  await expect(page.getByRole("dialog", { name: "New shift template" })).toBeVisible();
  await expect(page.getByText("Crosses midnight")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("tab", { name: "Assignments" }).click();
  await expect(page.getByText("Ananya Rao")).toBeVisible();
  await expect(page.getByText("Engineering")).toBeVisible();
});

test("shift administration remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installShiftAdminApi(page);
  await page.goto("/admin-settings/shifts", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Shift scheduling" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New template" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole("button", { name: "New template" }).click();
  const dialog = page.getByRole("dialog", { name: "New shift template" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds?.width ?? 0).toBeLessThanOrEqual(390);
});

async function installShiftAdminApi(page: Page): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") {
      return json(route, {
        user: {
          id: "10000000-0000-4000-8000-000000000001",
          email: "admin@example.test",
          employee_code: "ADM",
          full_name: "Admin User",
          roles: ["Admin"],
          employment_status: "active",
        },
        available_roles: [{ key: "Admin", label: "Admin" }],
        active_role: { key: "Admin", label: "Admin" },
        preferences: {
          active_role: "Admin",
          landing_page: "/dashboard",
          locale: "en-IN",
          timezone: "Asia/Kolkata",
        },
        company: {
          id: "20000000-0000-4000-8000-000000000001",
          company_name: "Hawkaii HRMS",
          status: "active",
        },
        session_metadata: { auth_mode: "cookie_or_bearer", low_bandwidth_defaults: {} },
      });
    }
    if (path === "/api/v1/admin/shifts/templates") {
      return json(route, {
        total: 1,
        items: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            company_id: "20000000-0000-4000-8000-000000000001",
            code: "NIGHT_01",
            name: "Night operations",
            description: "Cross-midnight support",
            status: "active",
            is_company_default: true,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z",
            version: 1,
            latest_version: {
              id: "40000000-0000-4000-8000-000000000001",
              template_id: "30000000-0000-4000-8000-000000000001",
              version_number: 1,
              effective_from: "2026-07-01",
              effective_until: null,
              local_start_time: "22:00",
              local_end_time: "07:00",
              end_day_offset: 1,
              crosses_midnight: true,
              timezone_strategy: "company",
              fixed_timezone: null,
              eligibility_open_before_start_minutes: 120,
              eligibility_close_after_end_minutes: 240,
              created_at: "2026-07-01T00:00:00.000Z",
            },
          },
        ],
      });
    }
    if (path === "/api/v1/admin/shifts/assignments") {
      return json(route, {
        total: 1,
        items: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            company_id: "20000000-0000-4000-8000-000000000001",
            employee_user_id: "60000000-0000-4000-8000-000000000001",
            template_id: "30000000-0000-4000-8000-000000000001",
            effective_from: "2026-07-01",
            effective_until: null,
            status: "active",
            employee_name: "Ananya Rao",
            employee_code: "E101",
            department_id: "70000000-0000-4000-8000-000000000001",
            department_name: "Engineering",
            template_code: "NIGHT_01",
            template_name: "Night operations",
            version: 1,
          },
        ],
      });
    }
    if (path === "/api/v1/admin/shifts/references") {
      return json(route, {
        employees: [
          {
            id: "60000000-0000-4000-8000-000000000001",
            employee_code: "E101",
            name: "Ananya Rao",
            department_id: "70000000-0000-4000-8000-000000000001",
          },
        ],
        departments: [
          {
            id: "70000000-0000-4000-8000-000000000001",
            code: "ENG",
            name: "Engineering",
            employee_count: 1,
          },
        ],
      });
    }
    return json(route, {});
  });
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
