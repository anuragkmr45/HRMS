import { expect, test, type Page } from "@playwright/test";
import { attendanceAccessForRole } from "../src/domains/attendance/access";

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "attendance-access-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        notifications: [],
        unread_count: 0,
        pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
      }),
    });
  });
});

test("maps attendance capabilities to the backend role policy", () => {
  expect(attendanceAccessForRole("employee")).toMatchObject({
    canViewSelfAttendance: true,
    canPunch: true,
    canViewTeamAttendance: false,
    canViewReviewQueue: false,
  });
  expect(attendanceAccessForRole("manager")).toMatchObject({
    canViewSelfAttendance: true,
    canViewTeamAttendance: true,
    canViewReviewQueue: true,
    canDecideRegularizations: true,
  });
  expect(attendanceAccessForRole("auditor")).toMatchObject({
    canViewAttendance: true,
    canViewSelfAttendance: false,
    canViewTeamAttendance: true,
    canViewReviewQueue: true,
    canDecideRegularizations: false,
  });
  expect(attendanceAccessForRole("helpdesk_agent").canViewAttendance).toBe(false);
});

test("manager receives hierarchy-scoped overview and review actions", async ({ page }) => {
  const requests = await mockAttendanceReads(page);
  await mockSession(page, {
    activeRole: "Reviewer",
    roles: ["Employee", "Reviewer"],
  });
  await mockReviewQueue(page, true);

  await openAttendance(page);

  await expect(page.getByRole("tab", { name: "Calendar" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Review queue" })).toBeVisible();
  await expect.poll(() => requests.team).toBe(1);
  expect(requests.self).toBe(0);

  await page.getByRole("tab", { name: "Review queue" }).click();
  await page.getByRole("tab", { name: "Corrections" }).click();

  await expect(
    page.getByRole("table").getByText("Scoped correction request").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve correction" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject correction" })).toBeVisible();
});

test("auditor receives attendance oversight without mutation affordances", async ({ page }) => {
  const requests = await mockAttendanceReads(page);
  await mockSession(page, { activeRole: "Auditor", roles: ["Auditor"] });
  await mockReviewQueue(page, true);

  await openAttendance(page);

  await expect(page.getByRole("tab", { name: "Calendar" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Review queue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Punch in" })).toHaveCount(0);
  await expect.poll(() => requests.team).toBe(1);
  expect(requests.self).toBe(0);

  await page.getByRole("tab", { name: "Review queue" }).click();
  await page.getByRole("tab", { name: "Corrections" }).click();

  await expect(
    page.getByRole("table").getByText("Scoped correction request").first(),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve correction" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject correction" })).toHaveCount(0);
});

test("employee receives only self-service attendance actions", async ({ page }) => {
  const requests = await mockAttendanceReads(page);
  await mockSession(page, { activeRole: "Employee", roles: ["Employee"] });

  await openAttendance(page);

  await expect(page.getByRole("tab", { name: "Calendar" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Review queue" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Punch in" })).toBeVisible();
  await expect.poll(() => requests.self).toBe(1);
  expect(requests.team).toBe(0);
});

async function mockSession(
  page: Page,
  input: { activeRole: string; roles: string[] },
): Promise<void> {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: `access-${input.activeRole.toLowerCase()}`,
          employee_code: "ACCESS-001",
          email: "access@example.test",
          full_name: "Attendance Access User",
          roles: input.roles,
        },
        active_role: {
          key: input.activeRole,
          label: input.activeRole,
          is_active: true,
        },
        available_roles: input.roles.map((role) => ({
          key: role,
          label: role,
          is_active: true,
        })),
        permissions: [],
        setup_required: false,
      }),
    });
  });
}

async function mockAttendanceReads(page: Page): Promise<{ self: number; team: number }> {
  const requests = { self: 0, team: 0 };
  await page.route("**/api/v1/attendance/summary/team**", async (route) => {
    requests.team += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated_at: new Date().toISOString(),
        totals: {
          total: 1,
          present: 1,
          absent: 0,
          late: 0,
          early_out: 0,
          wfh: 0,
          on_leave: 0,
        },
        department_summary: [],
        exceptions: [],
      }),
    });
  });
  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    requests.self += 1;
    const workDate = new Date().toISOString().slice(0, 10);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated_at: new Date().toISOString(),
        today: {
          work_date: workDate,
          status: "absent",
          work_minutes: 0,
          break_minutes: 0,
          next_allowed_actions: ["check_in"],
        },
        summary: { work_minutes: 0, late: 0, absent: 0 },
        week_records: [],
        exception_history: [],
      }),
    });
  });
  return requests;
}

async function mockReviewQueue(page: Page, apiClaimsCanDecide: boolean): Promise<void> {
  await page.route("**/api/v1/attendance/exceptions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "regularization-1",
            request_id: "regularization-1",
            employee: "Scoped Employee",
            date: "2026-07-25",
            detail: "Scoped correction request",
            status: "pending",
            exception_type: "correction",
            expected_version: 1,
            can_decide: apiClaimsCanDecide,
          },
        ],
        totals: { late: 0, missing_punch: 0, absent: 0, correction: 1 },
        page: 1,
        page_size: 100,
        total: 1,
        total_pages: 1,
      }),
    });
  });
}

async function openAttendance(page: Page): Promise<void> {
  await page.goto("/attendance");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/attendance$/);
}
