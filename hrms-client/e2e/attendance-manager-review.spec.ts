import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";
const TEST_REASON_PREFIX = "Manager review browser test";

test("manager reviews and returns an assigned attendance correction", async ({ page, request }) => {
  await cleanupBrowserTestRegularizations(request);
  const reason = `${TEST_REASON_PREFIX} ${Date.now()}`;
  const regularization = await createEmployeeRegularization(request, reason);

  await login(page, "reviewer@example.test");
  await activateManagerRole(page);
  await page.getByRole("link", { name: "Attendance", exact: true }).first().click();
  await page.getByRole("tab", { name: "Review queue", exact: true }).click();

  await expect(page).toHaveURL(/\/attendance\/approvals$/);
  await expect(page.getByRole("heading", { name: "Manager review queue" })).toBeVisible();
  const reasonCell = page.getByRole("table").getByText(reason, { exact: true });
  await expect(reasonCell).toBeVisible();

  await reasonCell.click();
  await expect(page.getByRole("heading", { name: regularization.employeeName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence summary" })).toBeVisible();
  await expect(page.getByText("Add Check In", { exact: true })).toBeVisible();
  await expect(page.getByText(/latitude|longitude|coordinates/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Return", exact: true }).click();
  const remarks = "Please confirm the requested time and submit the supporting context.";
  await page.getByLabel("Remarks (required)").fill(remarks);

  const decisionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/attendance/regularizations/${regularization.id}/decision`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Return request", exact: true }).click();
  const decisionResponse = await decisionResponsePromise;

  expect(decisionResponse.ok(), await decisionResponse.text()).toBe(true);
  expect(decisionResponse.request().postDataJSON()).toEqual({
    decision: "return",
    expected_version: regularization.version,
    remarks,
  });
  await expect(page.getByText("Return request completed")).toBeVisible();
  await expect(page.getByRole("table").getByText(reason, { exact: true })).toHaveCount(0);
});

async function createEmployeeRegularization(
  request: APIRequestContext,
  reason: string,
): Promise<{ id: string; version: number; employeeName: string }> {
  const accessToken = await apiLogin(request, "e1@example.test");
  const workDate = previousLocalDate();
  const response = await request.post(`${API_BASE_URL}/api/v1/attendance/regularizations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      work_date: workDate,
      reason,
      requested_punches: [
        {
          event_type: "check_in",
          occurred_at: new Date(`${workDate}T09:30:00+05:30`).toISOString(),
        },
      ],
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Regularization create failed (${response.status()}): ${await response.text()}`,
    );
  }
  const body = (await response.json()) as {
    id?: unknown;
    version?: unknown;
    employee?: { full_name?: unknown };
  };
  expect(typeof body.id).toBe("string");
  expect(typeof body.version).toBe("number");

  return {
    id: body.id as string,
    version: body.version as number,
    employeeName:
      typeof body.employee?.full_name === "string" ? body.employee.full_name : "Employee One",
  };
}

async function cleanupBrowserTestRegularizations(request: APIRequestContext): Promise<void> {
  const accessToken = await apiLogin(request, "reviewer@example.test");
  const response = await request.get(
    `${API_BASE_URL}/api/v1/attendance/regularizations/queue/manager?page=1&page_size=100&status=pending`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok()) {
    throw new Error(
      `Manager queue cleanup failed (${response.status()}): ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    items?: Array<{ id?: unknown; reason?: unknown; version?: unknown }>;
  };
  const testRequests = (body.items ?? []).filter(
    (item) => typeof item.reason === "string" && item.reason.startsWith(TEST_REASON_PREFIX),
  );

  for (const item of testRequests) {
    if (typeof item.id !== "string" || typeof item.version !== "number") continue;
    const decisionResponse = await request.post(
      `${API_BASE_URL}/api/v1/attendance/regularizations/${item.id}/decision`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          decision: "return",
          expected_version: item.version,
          remarks: "Closed by the repeatable browser test setup.",
        },
      },
    );
    if (!decisionResponse.ok()) {
      throw new Error(
        `Browser test cleanup decision failed (${decisionResponse.status()}): ${await decisionResponse.text()}`,
      );
    }
  }
}

async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
    data: { email, password: LOCAL_DEMO_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`${email} login failed (${response.status()}): ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token?: unknown };
  expect(typeof body.access_token).toBe("string");
  return body.access_token as string;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(LOCAL_DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function activateManagerRole(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click();
  const managerRole = page.getByRole("menuitem", { name: "Manager", exact: true });
  if (await managerRole.isVisible()) {
    await managerRole.click();
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Manager");
  } else {
    await page.keyboard.press("Escape");
  }
}

function previousLocalDate(): string {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}
