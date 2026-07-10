import { expect, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  "../design-audit/mobile-responsive-output/screenshots",
);

export async function ensureScreenshotDir() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
}

export function installFrontendOnlyApiGuard(page: Page) {
  const unexpected: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    const isBackendHost = url.host === "127.0.0.1:3001" || url.host === "localhost:3001";
    const isApiPath = url.pathname.startsWith("/api/");
    if (isBackendHost || isApiPath) {
      unexpected.push(`${request.method()} ${request.url()}`);
    }
  });

  return () => {
    expect(unexpected, "mobile responsive QA must not make backend/API requests").toEqual([]);
  };
}

export async function loginAsMainAdmin(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
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
  await page.locator("#email").fill("aanya@hawkaii.com");
  await page.locator("#password").fill("LocalDev@123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
}

export async function expectNoDocumentHorizontalOverflow(page: Page, route: string) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      rootOverflow: root.scrollWidth - root.clientWidth,
      bodyOverflow: body.scrollWidth - body.clientWidth,
    };
  });

  expect(result.rootOverflow, `${route} root horizontal overflow`).toBeLessThanOrEqual(1);
  expect(result.bodyOverflow, `${route} body horizontal overflow`).toBeLessThanOrEqual(1);
}

export async function expectWithinViewport(page: Page, locator: Locator, label: string) {
  await expect(locator, `${label} should be visible`).toBeVisible();

  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        const viewport = page.viewportSize();
        if (!box || !viewport) return false;

        return (
          box.x >= -1 &&
          box.y >= -1 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height + 1
        );
      },
      {
        message: `${label} should settle inside the viewport`,
        timeout: 2_000,
      },
    )
    .toBe(true);

  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box, `${label} should have a bounding box`).not.toBeNull();
  expect(viewport, `${label} should have a viewport`).not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
}

export async function saveResponsiveScreenshot(page: Page, fileName: string) {
  await ensureScreenshotDir();
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, fileName),
    fullPage: true,
    animations: "disabled",
  });
}
