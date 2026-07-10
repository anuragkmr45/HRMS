import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const THEME_STORAGE_KEY = "hawkaii-theme";
export const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  "../design-audit/dark-theme-output/screenshots/frontend-theme-e2e",
);

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

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
    expect(unexpected, "frontend-only theme QA must not make backend/API requests").toEqual([]);
  };
}

export function installConsoleErrorGuard(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  return () => {
    expect(errors, "theme QA should not trigger browser console errors").toEqual([]);
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

export async function expectRootTheme(
  page: Page,
  preference: ThemePreference,
  resolvedTheme: ResolvedTheme,
) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = document.documentElement;
          return {
            preference: root.dataset.theme,
            resolvedTheme: root.dataset.resolvedTheme,
            darkClass: root.classList.contains("dark"),
            colorScheme: root.style.colorScheme,
            storedPreference: window.localStorage.getItem("hawkaii-theme"),
          };
        }),
      { message: `root theme should resolve ${preference}/${resolvedTheme}` },
    )
    .toEqual({
      preference,
      resolvedTheme,
      darkClass: resolvedTheme === "dark",
      colorScheme: resolvedTheme,
      storedPreference: preference,
    });
}

export async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByText("Appearance", { exact: true })).toBeVisible();
}

export async function chooseAppearance(page: Page, label: "System" | "Light" | "Dark") {
  await openAccountMenu(page);
  await page.getByRole("menuitemradio", { name: new RegExp(label, "i") }).click();
}

export async function saveScreenshot(page: Page, fileName: string) {
  await ensureScreenshotDir();
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, fileName),
    fullPage: true,
    animations: "disabled",
  });
}
