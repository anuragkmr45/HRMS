import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";

test.beforeAll(async ({ request }) => {
  await expectBackendReady(request);
  await ensureHelpdeskCategory(request);
});

test.describe("production browser smoke", () => {
  test("employee self-service modules render against the backend API", async ({ page }) => {
    await login(page, "e1@example.test");
    await expectPlatformReady(page);

    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Notifications").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await expectModule(page, "/attendance", "Attendance", /This week|Department-wise attendance/);
    await expectModule(page, "/leave-wfh", "Leave & WFH", "Leave balances");
    await expectModule(page, "/ems", "Employee Self Service", "Company announcements", "EMS");
    await expectModule(page, "/timesheet", "Timesheet", /This week|Project|Submit/);
    await expectModule(page, "/expenses", "Expense Management", /Submitted|My recent tickets/);
    await expectModule(page, "/helpdesk", "Helpdesk", /Recent tickets|My queue/);
  });

  test("HR/admin routes render reports and configuration in API mode", async ({ page }) => {
    await login(page, "admin@example.test");
    await expectPlatformReady(page);

    await expectModule(page, "/employees", "Employees", /People|Add employee|Export/);
    await expectModule(page, "/attendance", "Attendance", "Department-wise attendance");
    await expectModule(page, "/leave-wfh", "Leave & WFH", "Apply leave");
    await page.getByRole("tab", { name: "Monitor", exact: true }).click();
    await expect(page.getByText(/Leave\/WFH monitor|Export/).first()).toBeVisible();
    await expectModule(page, "/reports", "Reports", /Every report supports|HR reports|Attendance/);
    await expectModule(page, "/admin-settings", "Admin Settings", "Company Profile");
  });

  test("project and utilization screens render in API mode", async ({ page }) => {
    await login(page, "admin@example.test");
    await expectPlatformReady(page);

    await expectModule(page, "/projects", "Projects", /Delivery|Add project|Export/);
    await expectModule(page, "/team-utilization", "Team Utilization", /Capacity|Bench|Overloaded/);
  });

  test("helpdesk ticket creation mutates backend state in API mode", async ({ page }) => {
    await login(page, "e1@example.test");
    await expectPlatformReady(page);

    await expectModule(page, "/helpdesk", "Helpdesk", /Recent tickets|My queue/);
    await page.getByRole("button", { name: "Raise ticket" }).click();

    const subject = `E2E browser ticket ${Date.now()}`;
    await page.getByPlaceholder("Short summary").fill(subject);
    await page
      .locator("textarea[placeholder^='Add as much detail']")
      .fill("Created by the production Playwright smoke suite to verify API-backed mutations.");

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/helpdesk/tickets") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Submit ticket" }).click();
    const createResponse = await createResponsePromise;

    await expectResponseOk(createResponse, "helpdesk ticket create");
    await expect(page).toHaveURL(/\/helpdesk\/TKT-/);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByText("Conversation", { exact: true })).toBeVisible();
  });

  test("mobile viewport supports authenticated shell navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "e1@example.test");

    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expectPlatformReady(page);

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible();
    await page.getByRole("link", { name: "Attendance", exact: true }).click();
    await expect(page).toHaveURL(/\/attendance/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeHidden();
    await expect(page.getByText(/This week|Department-wise attendance/).first()).toBeVisible();
  });

  test("report routes open generated backend export downloads", async ({ page }) => {
    test.setTimeout(120_000);

    await login(page, "admin@example.test");
    await captureWindowOpen(page);
    await expectPlatformReady(page);
    await expectModule(page, "/reports", "Reports", /Every report supports|HR reports|Attendance/);

    const reports = [
      { path: "/reports/hr", title: "HR Reports" },
      { path: "/reports/attendance", title: "Attendance Reports" },
      { path: "/reports/leave", title: "Leave & WFH Reports" },
      { path: "/reports/projects", title: "Project Reports" },
      { path: "/reports/timesheet", title: "Timesheet Reports" },
      { path: "/reports/expenses", title: "Expense Reports" },
      { path: "/reports/assets", title: "Asset Reports" },
      { path: "/reports/helpdesk", title: "Helpdesk Reports" },
      { path: "/reports/audit", title: "Audit Reports" },
    ];

    for (const [index, report] of reports.entries()) {
      if (index === 0) {
        await page.locator(`a[href='${report.path}']`).first().click();
      } else {
        await page.getByRole("tab", { name: report.title, exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(escapeRegExp(report.path)));
      await expect(page.getByRole("heading", { name: report.title }).first()).toBeVisible();

      await expectGeneratedExportDownload(page, report.title);
    }
  });
});

async function expectBackendReady(request: APIRequestContext): Promise<void> {
  const ready = await request.get(`${API_BASE_URL}/api/v1/health/ready`, {
    timeout: 5_000,
  });
  expect(
    ready.ok(),
    `Backend API must be running before browser e2e. Expected readiness at ${API_BASE_URL}/api/v1/health/ready, got ${ready.status()}.`,
  ).toBe(true);
}

async function expectPlatformReady(page: Page): Promise<void> {
  await expect(page.getByLabel(/^(Connected|Platform API ready)$/)).toBeVisible();
}

async function ensureHelpdeskCategory(request: APIRequestContext): Promise<void> {
  const token = await apiLogin(request, "admin@example.test");
  const headers = authHeaders(token);
  const categoryResponse = await request.get(
    `${API_BASE_URL}/api/v1/helpdesk/categories?active_only=false`,
    { headers },
  );
  await expectApiResponseOk(categoryResponse, "helpdesk categories lookup");

  const categoryBody = (await categoryResponse.json()) as {
    categories?: {
      id?: string;
      category_key?: string;
      active?: boolean;
      version?: number;
    }[];
  };
  const existing = categoryBody.categories?.find((category) => category.category_key === "IT");
  if (existing?.active) return;

  if (existing?.id && existing.version) {
    const updateResponse = await request.patch(
      `${API_BASE_URL}/api/v1/helpdesk/categories/${existing.id}`,
      {
        headers,
        data: { expected_version: existing.version, active: true },
      },
    );
    await expectApiResponseOk(updateResponse, "helpdesk IT category activation");
    return;
  }

  const createResponse = await request.post(`${API_BASE_URL}/api/v1/helpdesk/categories`, {
    headers,
    data: {
      category_key: "IT",
      label: "IT Support",
      team: "IT Operations",
      active: true,
      sub_categories: [
        { key: "vpn", label: "VPN / Network" },
        { key: "software", label: "Software install" },
      ],
    },
  });

  if (createResponse.status() !== 409) {
    await expectApiResponseOk(createResponse, "helpdesk IT category create");
  }
}

async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
    data: { email, password: LOCAL_DEMO_PASSWORD },
  });
  await expectApiResponseOk(response, `${email} API login`);
  const body = (await response.json()) as { access_token?: unknown };
  expect(typeof body.access_token, `${email} API login should return an access token`).toBe(
    "string",
  );
  return body.access_token as string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.waitForFunction(() => {
    const emailInput = document.querySelector("#email");
    const passwordInput = document.querySelector("#password");
    return Boolean(
      emailInput &&
      passwordInput &&
      "_valueTracker" in emailInput &&
      "_valueTracker" in passwordInput,
    );
  });
  const emailInput = page.locator("#email");
  const passwordInput = page.locator("#password");
  await emailInput.fill(email);
  await passwordInput.fill(LOCAL_DEMO_PASSWORD);
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(LOCAL_DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
}

async function expectModule(
  page: Page,
  path: string,
  title: string,
  visibleText: string | RegExp,
  linkName = title,
): Promise<void> {
  await page.getByRole("link", { name: linkName, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(escapeRegExp(path)));
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
  await expect(page.getByText(visibleText).first()).toBeVisible();
}

async function expectGeneratedExportDownload(page: Page, reportTitle: string): Promise<void> {
  await resetOpenedUrls(page);

  const exportResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/reports/exports") && response.request().method() === "POST",
  );
  const downloadResponsePromise = page.waitForResponse(
    (response) =>
      /\/api\/v1\/documents\/[^/]+\/download-url$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "Export CSV" }).first().click();

  await expectResponseOk(await exportResponsePromise, `${reportTitle} export create`);
  await expectResponseOk(await downloadResponsePromise, `${reportTitle} export download URL`);

  await expect
    .poll(async () => (await openedUrls(page)).length, {
      message: `${reportTitle} should call window.open with the generated download URL`,
    })
    .toBeGreaterThan(0);
}

async function expectResponseOk(
  response: Awaited<ReturnType<Page["waitForResponse"]>>,
  label: string,
) {
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    expect(response.ok(), `${label} returned ${response.status()}: ${body}`).toBe(true);
    return;
  }
  expect(response.ok(), `${label} returned ${response.status()}`).toBe(true);
}

async function expectApiResponseOk(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
  label: string,
) {
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    expect(response.ok(), `${label} returned ${response.status()}: ${body}`).toBe(true);
    return;
  }
  expect(response.ok(), `${label} returned ${response.status()}`).toBe(true);
}

async function captureWindowOpen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as Window & {
      __hrmsOpenedUrls?: string[];
    };
    win.__hrmsOpenedUrls = [];
    win.open = ((url?: string | URL) => {
      win.__hrmsOpenedUrls?.push(String(url ?? ""));
      return null;
    }) as typeof window.open;
  });
}

async function resetOpenedUrls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as Window & {
      __hrmsOpenedUrls?: string[];
    };
    win.__hrmsOpenedUrls = [];
  });
}

async function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const win = window as Window & {
      __hrmsOpenedUrls?: string[];
    };
    return win.__hrmsOpenedUrls ?? [];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
