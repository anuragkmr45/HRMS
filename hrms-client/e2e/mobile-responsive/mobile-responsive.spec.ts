import { expect, test } from "@playwright/test";
import {
  ensureScreenshotDir,
  expectNoDocumentHorizontalOverflow,
  expectWithinViewport,
  installFrontendOnlyApiGuard,
  loginAsMainAdmin,
  saveResponsiveScreenshot,
} from "./helpers";

const ROUTES = [
  "/dashboard",
  "/ems",
  "/ems/admin",
  "/ems/approvals",
  "/ems/requests",
  "/ems/documents",
  "/ems/letters",
  "/ems/policies",
  "/ems/profile",
  "/attendance",
  "/attendance/calendar",
  "/attendance/exceptions",
  "/leave-wfh",
  "/leave-wfh/apply-leave",
  "/leave-wfh/apply-wfh",
  "/leave-wfh/approvals",
  "/leave-wfh/holidays",
  "/leave-wfh/monitor",
  "/timesheet",
  "/timesheet/approvals",
  "/timesheet/projects",
  "/expenses",
  "/expenses/create",
  "/expenses/my",
  "/expenses/review",
  "/expenses/finance",
  "/expenses/register",
  "/expenses/reports",
  "/reports",
  "/reports/hr",
  "/reports/attendance",
  "/reports/leave",
  "/reports/timesheet",
  "/reports/expenses",
  "/reports/assets",
  "/reports/projects",
  "/reports/helpdesk",
  "/reports/audit",
  "/admin-settings",
  "/admin-settings/company",
  "/admin-settings/master-data",
  "/admin-settings/roles",
  "/admin-settings/workflows",
  "/admin-settings/policies",
  "/admin-settings/email-templates",
  "/admin-settings/notifications",
  "/admin-settings/security",
  "/admin-settings/audit",
  "/employees",
  "/employees/EMP-1042",
  "/projects",
  "/projects/PRJ-301",
  "/team-utilization",
  "/assets",
  "/assets/inventory",
  "/assets/AST-7701",
  "/assets/my",
  "/assets/requests",
  "/assets/returns",
  "/assets/warranty",
  "/helpdesk",
  "/helpdesk/TKT-12001",
  "/helpdesk/my",
  "/helpdesk/queue",
  "/helpdesk/categories",
  "/helpdesk/sla",
  "/helpdesk/reports",
  "/expenses/EXP-9101",
] as const;

const SCREENSHOT_ROUTES = new Map<string, string>([
  ["/dashboard", "01-dashboard"],
  ["/ems", "02-ems"],
  ["/leave-wfh", "03-leave-wfh"],
  ["/leave-wfh/monitor", "04-leave-monitor"],
  ["/timesheet", "05-timesheet"],
  ["/timesheet/approvals", "06-timesheet-approvals"],
  ["/expenses/create", "07-expense-form"],
  ["/reports/audit", "08-reports-audit"],
  ["/admin-settings/roles", "09-admin-roles"],
  ["/helpdesk/queue", "10-helpdesk-queue"],
  ["/employees/EMP-1042", "16-employee-detail"],
  ["/projects/PRJ-301", "17-project-detail"],
  ["/assets/AST-7701", "18-asset-detail"],
  ["/expenses/EXP-9101", "19-expense-detail"],
  ["/helpdesk/TKT-12001", "20-helpdesk-detail"],
  ["/team-utilization", "21-team-utilization"],
]);

const PUBLIC_AUTH_ROUTES = [
  {
    path: "/login",
    screenshot: "22-login",
    visibleText: "Welcome back",
  },
  {
    path: "/signup",
    screenshot: "23-signup",
    visibleText: "Create your workspace",
  },
  {
    path: "/forgot-password",
    screenshot: "24-forgot-password",
    visibleText: "Forgot your password?",
  },
  {
    path: "/reset-password?token=mobile-responsive-reset-token",
    screenshot: "25-reset-password",
    visibleText: "Set a new password",
  },
  {
    path: "/set-password?token=mobile-responsive-setup-token",
    screenshot: "26-set-password",
    visibleText: "Set your password",
  },
  {
    path: "/verify-email?email=aanya%40hawkaii.com&state=sent&delivery_mode=log",
    screenshot: "27-verify-email",
    visibleText: "Check your inbox",
  },
] as const;

test.describe.configure({ mode: "serial" });

let assertNoApiRequests: () => void;

test.beforeAll(async () => {
  await ensureScreenshotDir();
});

test.beforeEach(async ({ page }) => {
  assertNoApiRequests = installFrontendOnlyApiGuard(page);
});

test.afterEach(async () => {
  assertNoApiRequests();
});

test("main authenticated routes do not create mobile document overflow", async ({
  page,
}, testInfo) => {
  await loginAsMainAdmin(page);

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expectNoDocumentHorizontalOverflow(page, route);

    const screenshotName = SCREENSHOT_ROUTES.get(route);
    if (screenshotName) {
      await saveResponsiveScreenshot(
        page,
        `${screenshotName}-${testInfo.project.name.replace(/\W+/g, "-")}.png`,
      );
    }
  }
});

test("public auth routes do not create mobile document overflow", async ({ page }, testInfo) => {
  for (const route of PUBLIC_AUTH_ROUTES) {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(route.visibleText).first()).toBeVisible();
    await expectNoDocumentHorizontalOverflow(page, route.path);
    await saveResponsiveScreenshot(
      page,
      `${route.screenshot}-${testInfo.project.name.replace(/\W+/g, "-")}.png`,
    );
  }
});

test("authenticated floating controls stay inside the mobile viewport", async ({
  page,
}, testInfo) => {
  const projectName = testInfo.project.name.replace(/\W+/g, "-");
  const isMobileProject = testInfo.project.name.includes("mobile");

  await loginAsMainAdmin(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

  if (isMobileProject) {
    await page.getByRole("button", { name: /toggle sidebar/i }).click();
    const sidebar = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
    await expectWithinViewport(page, sidebar, "mobile sidebar");
    await expect(page.getByText("Appearance")).toBeVisible();
    await expectNoDocumentHorizontalOverflow(page, "mobile sidebar open");
    await saveResponsiveScreenshot(page, `11-mobile-sidebar-${projectName}.png`);
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
  }

  await page.getByRole("button", { name: "Account menu" }).click();
  const accountMenu = page.getByRole("menu");
  await expectWithinViewport(page, accountMenu, "account menu");
  await expect(page.getByText("Appearance")).toBeVisible();
  await saveResponsiveScreenshot(page, `12-account-menu-${projectName}.png`);
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeHidden();

  await page.getByRole("button", { name: "Notifications" }).click();
  const notificationPanel = page.locator("[data-radix-popper-content-wrapper]").last();
  await expectWithinViewport(page, notificationPanel, "notification popover");
  await expect(page.getByText("Notifications")).toBeVisible();
  await saveResponsiveScreenshot(page, `13-notification-popover-${projectName}.png`);
  await page.keyboard.press("Escape");
  await expect(notificationPanel).toBeHidden();

  await page.goto("/helpdesk", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Raise ticket" }).click();
  const ticketDrawer = page.getByRole("dialog", { name: "Raise a ticket" });
  await expectWithinViewport(page, ticketDrawer, "raise ticket drawer");
  await expectNoDocumentHorizontalOverflow(page, "raise ticket drawer open");
  await saveResponsiveScreenshot(page, `14-raise-ticket-drawer-${projectName}.png`);
  await page.keyboard.press("Escape");
  await expect(ticketDrawer).toBeHidden();

  await page.goto("/employees", { waitUntil: "domcontentloaded" });
  const rowActions = page.getByRole("button", { name: "Row actions" }).first();
  await expect(rowActions).toBeVisible();
  await rowActions.click();
  const rowActionsMenu = page.getByRole("menu");
  await expectWithinViewport(page, rowActionsMenu, "row actions menu");
  await saveResponsiveScreenshot(page, `15-row-actions-menu-${projectName}.png`);
  await page.keyboard.press("Escape");
  await expect(rowActionsMenu).toBeHidden();
});
