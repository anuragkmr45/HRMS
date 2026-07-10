import { expect, test } from "@playwright/test";
import { unlink } from "node:fs/promises";
import path from "node:path";
import {
  chooseAppearance,
  ensureScreenshotDir,
  expectRootTheme,
  installConsoleErrorGuard,
  installFrontendOnlyApiGuard,
  loginAsMainAdmin,
  openAccountMenu,
  saveScreenshot,
  SCREENSHOT_DIR,
  THEME_STORAGE_KEY,
} from "./helpers";

test.describe.configure({ mode: "serial" });

let assertNoApiRequests: () => void;
let assertNoConsoleErrors: () => void;

test.beforeAll(async () => {
  await ensureScreenshotDir();
});

test.beforeEach(async ({ page }) => {
  assertNoApiRequests = installFrontendOnlyApiGuard(page);
  assertNoConsoleErrors = installConsoleErrorGuard(page);
});

test.afterEach(async () => {
  assertNoApiRequests();
  assertNoConsoleErrors();
});

test("boots in system dark mode without backend access", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript((key) => window.localStorage.removeItem(key), THEME_STORAGE_KEY);
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectRootTheme(page, "system", "dark");
});

test("explicit light preference overrides system dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(({ key, preference }) => window.localStorage.setItem(key, preference), {
    key: THEME_STORAGE_KEY,
    preference: "light",
  });
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectRootTheme(page, "light", "light");
});

test("explicit dark preference overrides system light", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(({ key, preference }) => window.localStorage.setItem(key, preference), {
    key: THEME_STORAGE_KEY,
    preference: "dark",
  });
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectRootTheme(page, "dark", "dark");
});

test("topbar toggle switches, persists, and supports keyboard activation", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await loginAsMainAdmin(page);
  await expectRootTheme(page, "system", "light");

  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await expectRootTheme(page, "dark", "dark");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await expectRootTheme(page, "dark", "dark");

  const toggleToLight = page.getByRole("button", { name: /switch to light mode/i }).first();
  await toggleToLight.focus();
  await page.keyboard.press("Enter");
  await expectRootTheme(page, "light", "light");
  await expect(page.getByRole("button", { name: /switch to dark mode/i }).first()).toBeFocused();

  await page.keyboard.press("Space");
  await expectRootTheme(page, "dark", "dark");
  await expect(page.getByRole("button", { name: /switch to light mode/i }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("account Appearance selector controls System, Light, and Dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await loginAsMainAdmin(page);

  await chooseAppearance(page, "Dark");
  await expectRootTheme(page, "dark", "dark");

  await chooseAppearance(page, "Light");
  await expectRootTheme(page, "light", "light");

  await chooseAppearance(page, "System");
  await expectRootTheme(page, "system", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expectRootTheme(page, "system", "dark");

  await openAccountMenu(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
});

test("uses View Transitions when available", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    const original = document.startViewTransition?.bind(document);
    window.__themeViewTransitionCalls = 0;
    if (original) {
      document.startViewTransition = (callback: () => void) => {
        window.__themeViewTransitionCalls += 1;
        return original(callback);
      };
    }
  });

  await loginAsMainAdmin(page);
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await expectRootTheme(page, "dark", "dark");

  const supportsViewTransition = await page.evaluate(
    () => typeof document.startViewTransition === "function",
  );
  if (!supportsViewTransition) {
    testInfo.annotations.push({
      type: "note",
      description: "Chromium build does not expose document.startViewTransition.",
    });
    return;
  }

  await expect
    .poll(() => page.evaluate(() => window.__themeViewTransitionCalls ?? 0))
    .toBeGreaterThan(0);
});

test("falls back when View Transitions are unavailable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Document.prototype, "startViewTransition", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        value: undefined,
      });
    } catch {
      // Older browsers can expose this differently; the theme should still switch.
    }
  });

  await loginAsMainAdmin(page);
  await expect(page.evaluate(() => typeof document.startViewTransition)).resolves.toBe("undefined");
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await expectRootTheme(page, "dark", "dark");
});

test("reduced motion skips the full-page View Transition path", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const original = document.startViewTransition?.bind(document);
    window.__themeViewTransitionCalls = 0;
    if (original) {
      document.startViewTransition = (callback: () => void) => {
        window.__themeViewTransitionCalls += 1;
        return original(callback);
      };
    }
  });

  await loginAsMainAdmin(page);
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await expectRootTheme(page, "dark", "dark");
  await expect.poll(() => page.evaluate(() => window.__themeViewTransitionCalls ?? 0)).toBe(0);
});

test("captures frontend-only theme screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: "dark" });
  await loginAsMainAdmin(page);
  await expectRootTheme(page, "system", "dark");
  await saveScreenshot(page, "01-default-system-dark.png");

  await chooseAppearance(page, "Light");
  await expectRootTheme(page, "light", "light");
  await saveScreenshot(page, "02-explicit-light-dashboard.png");

  await chooseAppearance(page, "Dark");
  await expectRootTheme(page, "dark", "dark");
  await saveScreenshot(page, "03-explicit-dark-dashboard.png");

  await openAccountMenu(page);
  await saveScreenshot(page, "04-appearance-menu.png");
  await page.keyboard.press("Escape");

  await page.goto("/reports/audit", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Audit Reports" }).first()).toBeVisible();
  await saveScreenshot(page, "05-reports-table-dark.png");

  await page.goto("/expenses/create", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("No self-processing policy")).toBeVisible();
  await expect(page.getByText("Expense Type")).toBeVisible();
  await saveScreenshot(page, "06-expense-form-dark.png");

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await page.getByRole("button", { name: /quick action/i }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await saveScreenshot(page, "07-dropdown-dark.png");
  await page.keyboard.press("Escape");

  await saveScreenshot(page, "08-sidebar-expanded-dark.png");
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
  await page.waitForTimeout(250);
  await saveScreenshot(page, "09-sidebar-collapsed-dark.png");
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
  await page.waitForTimeout(250);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await saveScreenshot(page, "10-mobile-dashboard-dark.png");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible();
  await expect(page.getByText("Appearance", { exact: true })).toBeVisible();
  await saveScreenshot(page, "11-mobile-sidebar-appearance.png");
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await saveScreenshot(page, "12-tablet-dashboard-dark.png");
});

test("records frontend-only theme toggle animation video", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    colorScheme: "light",
    viewport: { width: 1440, height: 960 },
    recordVideo: {
      dir: SCREENSHOT_DIR,
      size: { width: 1440, height: 960 },
    },
  });
  const page = await context.newPage();
  const assertNoManualApiRequests = installFrontendOnlyApiGuard(page);
  const assertNoManualConsoleErrors = installConsoleErrorGuard(page);

  try {
    await loginAsMainAdmin(page);
    await expectRootTheme(page, "system", "light");
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await expectRootTheme(page, "dark", "dark");
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /switch to light mode/i }).click();
    await expectRootTheme(page, "light", "light");
    await page.waitForTimeout(900);
  } finally {
    const video = page.video();
    await page.close();
    if (video) {
      const videoPath = await video.path().catch(() => null);
      const finalVideoPath = path.join(SCREENSHOT_DIR, "13-theme-toggle-frontend-only.webm");
      await video.saveAs(finalVideoPath);
      if (videoPath && path.resolve(videoPath) !== path.resolve(finalVideoPath)) {
        await unlink(videoPath).catch(() => undefined);
      }
    }
    await context.close();
  }

  assertNoManualApiRequests();
  assertNoManualConsoleErrors();
});

declare global {
  interface Window {
    __themeViewTransitionCalls?: number;
  }
}
