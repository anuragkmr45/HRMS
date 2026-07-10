import { defineConfig, devices } from "@playwright/test";

const frontendPort = Number(process.env.E2E_MOBILE_RESPONSIVE_PORT ?? 5179);
const baseURL = process.env.E2E_MOBILE_RESPONSIVE_BASE_URL ?? `http://127.0.0.1:${frontendPort}`;
const skipWebServer = process.env.E2E_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e/mobile-responsive",
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  outputDir: "../design-audit/mobile-responsive-output/playwright-output",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: `pnpm exec vite dev --host 127.0.0.1 --port ${frontendPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          VITE_API_BASE_URL: "http://127.0.0.1:3001",
          VITE_API_ENABLED: "false",
          VITE_API_MOCK_FALLBACK: "true",
        },
      },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
  ],
});
