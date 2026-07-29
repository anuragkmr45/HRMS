import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";

test.beforeAll(async ({ request }) => {
  await expectBackendReady(request);
});

test("employee can inspect a privacy-safe daily attendance explanation", async ({ page }) => {
  await login(page, "e1@example.test");
  await page.goto("/attendance/daily-detail");

  await expect(page).toHaveURL(/\/attendance\/daily-detail/);
  await expect(page.getByRole("heading", { name: "Status dimensions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source events" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Decision reasons" })).toBeVisible();
  await expect(
    page.getByText("Restricted location, device, network, and attestation evidence is omitted."),
  ).toBeVisible();

  for (const dimension of ["Day", "Presence", "Punctuality", "Evidence", "Approval", "Payroll"]) {
    await expect(page.getByRole("heading", { name: dimension, exact: true })).toBeVisible();
  }
});

test("manager can inspect an employee within the reporting hierarchy", async ({ page }) => {
  await login(page, "reviewer@example.test");
  await page.goto("/attendance/daily-detail");

  const employeeSelect = page.getByLabel("Employee");
  await expect(employeeSelect).toBeEnabled();
  await employeeSelect.click();
  await page.getByRole("option", { name: "E1 - Employee E1" }).click();

  await expect(page.getByRole("heading", { name: "Employee E1" })).toBeVisible();
  await expect(page.getByText("E1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Status dimensions" })).toBeVisible();
});

async function expectBackendReady(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${API_BASE_URL}/api/v1/health/ready`, {
    timeout: 5_000,
  });
  expect(
    response.ok(),
    `Backend API must be ready at ${API_BASE_URL}; received ${response.status()}.`,
  ).toBe(true);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
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
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(LOCAL_DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/iu }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
}
