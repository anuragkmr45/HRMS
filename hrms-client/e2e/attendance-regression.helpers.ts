import { expect, type Page } from "@playwright/test";

export type ManualSessionState = "not_started" | "open" | "on_break" | "completed";
export type AttendanceTestRole = "Employee" | "Reviewer";

export interface CapturedPunch {
  body: Record<string, unknown>;
  idempotencyKey: string | undefined;
}

export async function prepareAttendancePage(
  page: Page,
  role: AttendanceTestRole = "Employee",
): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "attendance-regression-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        notifications: [],
        unread_count: 0,
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 0,
      }),
    });
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    const roles = role === "Reviewer" ? ["Employee", "Reviewer"] : ["Employee"];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: `regression-${role.toLowerCase()}`,
          employee_code: "REG-001",
          email: "regression@example.test",
          full_name: "Regression User",
          roles,
        },
        active_role: { key: role, label: role, is_active: true },
        available_roles: roles.map((availableRole) => ({
          key: availableRole,
          label: availableRole,
          is_active: true,
        })),
        permissions: [],
        setup_required: false,
      }),
    });
  });
}

export async function openAttendance(page: Page, path = "/attendance"): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`, "u"));
}

export function attendanceSummary(state: ManualSessionState): Record<string, unknown> {
  const now = new Date();
  const generatedAt = now.toISOString();
  const workDate = localIsoDate(now);
  const started = state !== "not_started";
  const completed = state === "completed";
  const allowedActions =
    state === "not_started"
      ? ["check_in"]
      : state === "open"
        ? ["break_start", "check_out"]
        : state === "on_break"
          ? ["break_end"]
          : [];

  return {
    generated_at: generatedAt,
    today: {
      work_date: workDate,
      status: completed ? "present" : started ? "working" : "absent",
      detail: completed ? "Completed" : started ? "Working" : "Not started",
      first_check_in: started ? generatedAt : null,
      last_check_out: completed ? generatedAt : null,
      in_time: started ? "09:30" : null,
      out_time: completed ? "18:00" : null,
      work_minutes: completed ? 510 : started ? 60 : 0,
      break_minutes: state === "on_break" || completed ? 15 : 0,
      target_work_minutes: 480,
      next_allowed_actions: allowedActions,
      work_mode: "office",
      punch_policy: {
        blocked_reason: null,
        blocked_action_reasons: {},
      },
    },
    summary: {
      work_minutes: completed ? 510 : 0,
      late: 0,
      absent: 0,
      target_work_minutes: 480,
    },
    week_records: [],
    exception_history: [],
  };
}

export function transitionFor(action: string): ManualSessionState {
  if (action === "check_in" || action === "break_end") return "open";
  if (action === "break_start") return "on_break";
  if (action === "check_out") return "completed";
  throw new Error(`Unsupported attendance action: ${action}`);
}

export function previousLocalDate(): string {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return localIsoDate(value);
}

export function managerQueueResponse(includeRequest = true): Record<string, unknown> {
  const item = {
    id: "regularization-review-1",
    employee: {
      full_name: "Scoped Employee",
      employee_code: "EMP-101",
    },
    work_date: previousLocalDate(),
    reason: "Missed check-in after client meeting",
    status: "pending",
    version: 4,
    created_at: new Date().toISOString(),
    items: [
      {
        id: "regularization-item-1",
        ordinal: 1,
        operation: "add",
        event_type: "check_in",
        occurred_at: new Date().toISOString(),
      },
    ],
  };

  return {
    items: includeRequest ? [item] : [],
    queue_counts: {
      total: includeRequest ? 1 : 0,
      pending: includeRequest ? 1 : 0,
      approved: 0,
      returned: 0,
      rejected: 0,
    },
    page: 1,
    page_size: 20,
    total: includeRequest ? 1 : 0,
    total_pages: includeRequest ? 1 : 0,
  };
}

function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
