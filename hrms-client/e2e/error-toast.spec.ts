import { expect, test, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL ?? "e1@example.test";

test.beforeAll(async ({ request }) => {
  const ready = await request.get(`${API_BASE_URL}/api/v1/health/ready`, { timeout: 5_000 });
  expect(
    ready.ok(),
    `Backend API must be running before browser e2e. Expected readiness at ${API_BASE_URL}/api/v1/health/ready, got ${ready.status()}.`,
  ).toBe(true);
});

test("API mutation failures show backend message and never show success", async ({ page }) => {
  await login(page, EMPLOYEE_EMAIL);

  await page.route("**/api/v1/helpdesk/tickets", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "VALIDATION_FAILED",
        message: "Backend rejected this ticket.",
        details: { fieldErrors: { subject: ["Use a more specific subject."] } },
        request_id: "req-toast-e2e",
      }),
    });
  });

  await page.goto("/helpdesk", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Raise ticket" }).click();
  await page.getByPlaceholder("Short summary").fill("Broken");
  await page
    .locator("textarea[placeholder^='Add as much detail']")
    .fill("This deliberately exercises the API error toast path.");
  await page.getByRole("button", { name: "Submit ticket" }).click();

  await expect(page.getByText("Backend rejected this ticket.")).toBeVisible();
  await expect(page.getByText(/subject: Use a more specific subject\./)).toBeVisible();
  await expect(page.getByText(/Request ID: req-toast-e2e/)).toBeVisible();
  await expect(page.getByText("Ticket created")).toHaveCount(0);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(LOCAL_DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
