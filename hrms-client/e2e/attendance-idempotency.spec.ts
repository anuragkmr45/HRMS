import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await mockUnrelatedApiReads(page);
  await mockAuthenticatedSession(page);
  await mockAttendanceSummary(page);
});

test("reuses one idempotency key when an uncertain punch is retried", async ({ page }) => {
  const requests: Array<{ body: string | null; key: string | undefined }> = [];
  await page.route("**/api/v1/attendance/punches", async (route) => {
    requests.push({
      body: route.request().postData(),
      key: route.request().headers()["idempotency-key"],
    });
    const retry = requests.length > 1;
    await route.fulfill({
      status: retry ? 200 : 503,
      contentType: "application/json",
      body: retry ? "{}" : JSON.stringify({ code: "UNAVAILABLE", message: "Retry safely." }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Punch in" }).click();

  await expect.poll(() => requests).toHaveLength(2);
  expect(requests[0].key).toMatch(/^attendance\.punch:[0-9a-f-]{36}$/u);
  expect(requests[1].key).toBe(requests[0].key);
  expect(requests[1].body).toBe(requests[0].body);
  await expect(page.getByText("Punched in")).toBeVisible();
});

test("creates a fresh idempotency key for each completed punch action", async ({ page }) => {
  const keys: Array<string | undefined> = [];
  await page.route("**/api/v1/attendance/punches", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);
  const punchButton = page.getByRole("button", { name: "Punch in" });
  await punchButton.click();
  await expect.poll(() => keys).toHaveLength(1);
  await expect(punchButton).toBeEnabled();
  await punchButton.click();

  await expect.poll(() => keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).not.toBe(keys[0]);
});

test("does not retry an idempotency conflict", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/v1/attendance/punches", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "IDEMPOTENCY_CONFLICT",
        message: "Idempotency key conflict.",
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Punch in" }).click();

  await expect(page.getByText("Idempotency key conflict.")).toBeVisible();
  expect(requestCount).toBe(1);
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
        week_records: [],
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
