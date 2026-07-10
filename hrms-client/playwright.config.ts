import { defineConfig, devices } from "@playwright/test";

const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 5173);
const frontendHost = process.env.E2E_FRONTEND_HOST ?? "localhost";
const baseURL = process.env.E2E_BASE_URL ?? `http://${frontendHost}:${frontendPort}`;
const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const skipWebServer = process.env.E2E_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/frontend-theme/**"],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: `pnpm exec vite dev --host ${frontendHost} --port ${frontendPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          VITE_API_BASE_URL: apiBaseURL,
          VITE_API_ENABLED: "true",
          VITE_API_MOCK_FALLBACK: "false",
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
