import { expect, test, type Page } from "@playwright/test";
import {
  attendanceSummary,
  managerQueueResponse,
  openAttendance,
  prepareAttendancePage,
  previousLocalDate,
  transitionFor,
  type CapturedPunch,
  type ManualSessionState,
} from "./attendance-regression.helpers";

test.setTimeout(120_000);

test("completes check-in, break, resume, and check-out using server context", async ({ page }) => {
  await prepareAttendancePage(page);
  let state: ManualSessionState = "not_started";
  const punches: CapturedPunch[] = [];

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary(state)),
    });
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    punches.push({
      body,
      idempotencyKey: route.request().headers()["idempotency-key"],
    });
    state = transitionFor(String(body.event_type));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);

  await completeAction(page, "Clock in", "Clock-in recorded", "Start break");
  await completeAction(page, "Start break", "Break started", "Resume work");
  await completeAction(page, "Resume work", "Work resumed", "Clock out");
  await page.getByRole("button", { name: "Clock out" }).click();

  await expect(page.getByText("Clock-out recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Your work session has ended.", { exact: true })).toBeVisible();
  expect(punches.map(({ body }) => body)).toEqual([
    punchBody("check_in"),
    punchBody("break_start"),
    punchBody("break_end"),
    punchBody("check_out"),
  ]);
  expect(punches.every(({ idempotencyKey }) => Boolean(idempotencyKey))).toBe(true);
  expect(new Set(punches.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(4);
});

test("retries an uncertain punch with the same request identity", async ({ page }) => {
  await prepareAttendancePage(page);
  let state: ManualSessionState = "not_started";
  const punches: CapturedPunch[] = [];

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary(state)),
    });
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    punches.push({
      body: route.request().postDataJSON() as Record<string, unknown>,
      idempotencyKey: route.request().headers()["idempotency-key"],
    });
    if (punches.length === 1) {
      await route.abort("connectionfailed");
      return;
    }
    state = "open";
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in" }).click();

  await expect(page.getByText("Outcome not confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry same action" }).click();
  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start break" })).toBeVisible();
  expect(punches).toHaveLength(2);
  expect(punches[1]).toEqual(punches[0]);
});

test("shows a deterministic punch rejection and keeps the valid action available", async ({
  page,
}) => {
  await prepareAttendancePage(page);
  let requests = 0;

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary("not_started")),
    });
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "PUNCH_WINDOW_CLOSED",
        message: "The configured clock-in window is closed.",
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in" }).click();

  await expect(page.getByText("Clock-in was not recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("The configured clock-in window is closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clock in" })).toBeEnabled();
  expect(requests).toBe(1);
});

test("submits a normalized historical regularization request", async ({ page }) => {
  await prepareAttendancePage(page);
  const workDate = previousLocalDate();
  let submittedBody: Record<string, unknown> | undefined;

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary("not_started")),
    });
  });
  await page.route("**/api/v1/attendance/regularizations", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    const items = submittedBody.items as Array<Record<string, unknown>>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "regularization-created-1",
        work_date: submittedBody.work_date,
        reason: submittedBody.reason,
        status: "pending",
        version: 1,
        approver: { full_name: "Reporting Manager" },
        items: items.map((item, index) => ({
          ...item,
          id: `created-item-${index + 1}`,
          ordinal: index + 1,
          target_punch_event_id: null,
        })),
      }),
    });
  });

  await openAttendance(page);
  await page.getByLabel("Attendance date").fill(workDate);
  await page.getByLabel("Reason").fill("Missed check-in after an approved client visit.");
  await page.getByTestId("regularization-time-1").fill("09:15");
  await page.getByTestId("attendance-regularization-submit").click();

  const submittedPanel = page.getByTestId("attendance-regularization-submitted");
  await expect(submittedPanel).toBeVisible();
  await expect(
    submittedPanel.getByRole("heading", { name: "Regularization request submitted" }),
  ).toBeVisible();
  expect(submittedBody).toBeDefined();
  const requestBody = submittedBody as Record<string, unknown>;
  expect(requestBody).toMatchObject({
    work_date: workDate,
    reason: "Missed check-in after an approved client visit.",
    items: [{ operation: "add", event_type: "check_in" }],
  });
  const submittedItem = (requestBody.items as Array<Record<string, unknown>>)[0];
  expect(String(submittedItem.occurred_at)).toContain(workDate);
});

test("manager reviews and approves an assigned correction", async ({ page }) => {
  await prepareAttendancePage(page, "Reviewer");
  let includeRequest = true;
  let decisionBody: Record<string, unknown> | undefined;

  await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(managerQueueResponse(includeRequest)),
    });
  });
  await page.route(
    "**/api/v1/attendance/regularizations/regularization-review-1/decision",
    async (route) => {
      decisionBody = route.request().postDataJSON() as Record<string, unknown>;
      includeRequest = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "regularization-review-1", status: "approved", version: 5 }),
      });
    },
  );

  await openAttendance(page, "/attendance/approvals");
  await expect(page.getByRole("heading", { name: "Manager review queue" })).toBeVisible();
  await page
    .getByRole("table")
    .getByText("Missed check-in after client meeting", { exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Scoped Employee" })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Approve request", exact: true }).click();

  await expect(page.getByText("Approve request completed", { exact: true })).toBeVisible();
  expect(decisionBody).toEqual({ decision: "approve", expected_version: 4 });
  await expect(
    page.getByRole("table").getByText("Missed check-in after client meeting", { exact: true }),
  ).toHaveCount(0);
});

test("manager queue exposes a recoverable loading error", async ({ page }) => {
  await prepareAttendancePage(page, "Reviewer");
  let requests = 0;
  await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ATTENDANCE_QUEUE_UNAVAILABLE",
        message: "The attendance review queue is temporarily unavailable.",
      }),
    });
  });

  await openAttendance(page, "/attendance/approvals");

  await expect(page.getByText("Review queue unavailable", { exact: true })).toBeVisible();
  await expect(
    page.getByText("The attendance review queue is temporarily unavailable."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => requests).toBeGreaterThan(1);
});

async function completeAction(
  page: Page,
  action: string,
  result: string,
  nextAction: string,
): Promise<void> {
  await page.getByRole("button", { name: action, exact: true }).click();
  await expect(page.getByText(result, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: nextAction, exact: true })).toBeVisible();
}

function punchBody(eventType: string): Record<string, unknown> {
  return {
    event_type: eventType,
    source: "web",
    metadata: { source_view: "attendance_page" },
  };
}
