import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await mockUnrelatedApiReads(page);
  await mockAuthenticatedSession(page);
  await mockAttendanceSummary(page);
});

test("sends the selected work mode through the web channel", async ({ page }) => {
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/v1/attendance/punches", async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);
  await expect(page.getByText("Punch source: Web browser")).toBeVisible();
  await page.getByRole("radio", { name: "Remote", exact: true }).click();
  await page.getByRole("button", { name: "Punch in" }).click();

  await expect
    .poll(() => requestBody)
    .toEqual({
      event_type: "check_in",
      source: "web",
      work_mode: "remote",
    });
  await expect(page.getByText("Remote", { exact: true })).toHaveCount(2);
});

test("leaves work mode unset when company policy should choose the default", async ({ page }) => {
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/v1/attendance/punches", async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);
  await expect(page.getByText("Company default")).toBeVisible();
  await page.getByRole("button", { name: "Punch in" }).click();

  await expect
    .poll(() => requestBody)
    .toEqual({
      event_type: "check_in",
      source: "web",
    });
});

async function mockAttendanceSummary(page: Page): Promise<void> {
  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    const workDate = new Date().toISOString().slice(0, 10);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated_at: new Date().toISOString(),
        today: {
          work_date: workDate,
          status: "absent",
          work_minutes: 0,
          break_minutes: 0,
          next_allowed_actions: ["check_in"],
        },
        summary: { work_minutes: 0, late: 0, absent: 0 },
        week_records: [
          {
            work_date: workDate,
            status: "present",
            work_mode: "remote",
            hours: "8h 00m",
          },
        ],
        exception_history: [],
      }),
    });
  });
}

async function openAttendance(page: Page): Promise<void> {
  await page.goto("/attendance");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/attendance$/);
}

async function mockUnrelatedApiReads(page: Page): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        notifications: [],
        unread_count: 0,
        pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
      }),
    });
  });
}

async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "attendance-e2e-token");
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "attendance-e2e-user",
          employee_code: "E2E-001",
          email: "attendance@example.test",
          full_name: "Attendance Employee",
          roles: ["Employee"],
        },
        active_role: { key: "employee", label: "Employee", is_active: true },
        available_roles: [{ key: "employee", label: "Employee", is_active: true }],
        permissions: [],
        setup_required: false,
      }),
    });
  });
}
