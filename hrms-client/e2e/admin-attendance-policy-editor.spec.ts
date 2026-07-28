import { expect, test, type Page } from "@playwright/test";

const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";

test("admin can prepare and discard an attendance policy draft", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin-settings/policies", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Attendance policy" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Manual punches/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Location optional/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Location required/ })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Allow regularization requests" })).toBeVisible();

  const optionalMode = page.getByRole("radio", { name: /Location optional/ });
  const requiredMode = page.getByRole("radio", { name: /Location required/ });
  if (await optionalMode.isChecked()) {
    await requiredMode.click();
  } else {
    await optionalMode.click();
  }

  await expect(page.getByText("Draft changes")).toBeVisible();
  await expect(page.getByText("Manual fallback")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();

  await page.getByRole("button", { name: "Discard draft changes" }).click();
  await expect(page.getByText("Published")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
});

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill(LOCAL_DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
