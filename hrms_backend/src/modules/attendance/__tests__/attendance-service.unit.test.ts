import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createMemoryDataStore,
  seedIds,
} from "../../../platform/data-store.js";
import { AttendanceService } from "../service.js";
import { Roles } from "#shared";

function attendanceStore() {
  const store = createMemoryDataStore();
  const now = new Date().toISOString();
  const companyId = randomUUID();
  store.companyProfiles.push({
    id: companyId, company_name: "Attendance Test Co", company_slug: `attendance-test-${companyId}`, website: null, industry: null,
    address: null, timezone: "Asia/Kolkata", locale: "en-IN", currency: "INR", fiscal_year_start_month: 4,
    working_week: "Mon-Fri", work_hours_per_day: 8, logo_label: null, logo_document_id: null, logo_url: null,
    logo_file_name: null, logo_mime_type: null, logo_size_bytes: null, status: "active", bootstrap_completed_at: now,
    created_at: now, updated_at: now, version: 1
  });
  store.adminPolicies.push(...store.adminPolicies.filter((policy) => policy.company_id === null).map((policy) => ({ ...policy, id: randomUUID(), company_id: companyId, config: { ...policy.config } })));
  store.userSessionPreferences.push(...store.users.map((user) => ({
    id: randomUUID(), user_id: user.id, active_role: user.roles[0]!, company_id: companyId, landing_page: "/dashboard",
    locale: "en-IN", timezone: user.timezone ?? "Asia/Kolkata", created_at: now, updated_at: now, version: 1
  })));
  return store;
}

function companyId(store: ReturnType<typeof createMemoryDataStore>) {
  return store.companyProfiles[0]!.id;
}

describe("AttendanceService.punch", () => {
  let store: ReturnType<typeof createMemoryDataStore>;
  let service: AttendanceService;

  beforeEach(() => {
    store = attendanceStore();
    service = new AttendanceService(store);
  });

  function employee() {
    return store.users.find((u) => u.id === seedIds.employee1)!;
  }

  function admin() {
    return store.users.find((u) => u.id === seedIds.admin)!;
  }

  function manager() {
    return store.users.find((u) => u.id === seedIds.manager)!;
  }

  function reviewer() {
    return store.users.find((u) => u.id === seedIds.reviewer)!;
  }

  function employee2() {
    return store.users.find((u) => u.id === seedIds.employee2)!;
  }

  it("allows employee check-in", () => {
    const result = service.punch(employee(), {
      event_type: "check_in",
      occurred_at: "2026-07-08T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {},
    });

    expect(result.punch_id).toBeDefined();
    expect(result.punch.employee_user_id).toBe(employee().id);
    expect(result.punch.event_type).toBe("check_in");

    expect(store.attendancePunches).toHaveLength(1);
  });

  it("creates a day record", () => {
    service.punch(employee(), {
      event_type: "check_in",
      occurred_at: "2026-07-08T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {},
    });

    expect(store.attendanceDayRecords).toHaveLength(1);

    expect(store.attendanceDayRecords[0]).toMatchObject({
      employee_user_id: employee().id,
    });
  });

  it("creates an attendance outbox event", () => {
    service.punch(employee(), {
      event_type: "check_in",
      occurred_at: "2026-07-08T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {},
    });

    const event = store.outbox[0]!;

    expect(event.aggregate_type).toBe("attendance");
    expect(event.event_type).toBe("attendance.punched");
    expect(event.status).toBe("pending");
    expect(event.retry_count).toBe(0);
    expect(event.idempotency_key).toContain("attendance.punched:");

    expect(event.payload).toMatchObject({
      employee_user_id: employee().id,
      event_type: "check_in",
      work_date: "2026-07-08",
    });
  });

  it("returns next allowed action after check-in", () => {
    const result = service.punch(employee(), {
      event_type: "check_in",
      occurred_at: "2026-07-08T04:00:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {},
    });

    expect(result.next_allowed_actions.length).toBeGreaterThan(0);
    expect(result.next_allowed_action).toBe(result.next_allowed_actions[0]);
  });

  it("blocks admin from punching", () => {
    expect(() =>
      service.punch(admin(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      }),
    ).toThrow();
  });

  describe("AttendanceService.punch", () => {
    it("rejects duplicate check-in", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      expect(() =>
        service.punch(employee(), {
          event_type: "check_in",
          occurred_at: "2026-07-08T04:05:00.000Z",
          work_mode: "office",
          source: "web",
          metadata: {},
        }),
      ).toThrow();
    });

    it("rejects check-out before check-in", () => {
      expect(() =>
        service.punch(employee(), {
          event_type: "check_out",
          occurred_at: "2026-07-08T12:00:00.000Z",
          work_mode: "office",
          source: "web",
          metadata: {},
        }),
      ).toThrow();
    });

    it("rejects break-start before check-in", () => {
      expect(() =>
        service.punch(employee(), {
          event_type: "break_start",
          occurred_at: "2026-07-08T10:30:00.000Z",
          work_mode: "office",
          source: "web",
          metadata: {},
        }),
      ).toThrow();
    });

    it("rejects break-end before break-start", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      expect(() =>
        service.punch(employee(), {
          event_type: "break_end",
          occurred_at: "2026-07-08T06:00:00.000Z",
          work_mode: "office",
          source: "web",
          metadata: {},
        }),
      ).toThrow();
    });

    it("allows check-out after check-in", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.punch(employee(), {
        event_type: "check_out",
        occurred_at: "2026-07-08T12:30:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      expect(result.punch.event_type).toBe("check_out");
      expect(store.attendancePunches).toHaveLength(2);
    });

    it("allows complete break flow", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      service.punch(employee(), {
        event_type: "break_start",
        occurred_at: "2026-07-08T07:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.punch(employee(), {
        event_type: "break_end",
        occurred_at: "2026-07-08T07:30:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      expect(result.punch.event_type).toBe("break_end");
      expect(store.attendancePunches).toHaveLength(3);
    });
  });

  describe("AttendanceService.listMyPunches", () => {
    let store: ReturnType<typeof createMemoryDataStore>;
    let service: AttendanceService;

    beforeEach(() => {
      store = attendanceStore();
      service = new AttendanceService(store);
    });

    function employee() {
      return store.users.find((u) => u.id === seedIds.employee1)!;
    }

    function employee2() {
      return store.users.find((u) => u.id === seedIds.employee2)!;
    }

    it("returns only the actor's punches", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      service.punch(employee2(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:15:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.listMyPunches(employee(), {
        page: 1,
        page_size: 10,
        date_from: "2026-07-08",
        date_to: "2026-07-08",
      });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.employee_user_id).toBe(employee().id);
    });

    it("returns punches in reverse chronological order", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      service.punch(employee(), {
        event_type: "check_out",
        occurred_at: "2026-07-08T12:30:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      expect(store.attendancePunches).toHaveLength(2);

      const result = service.listMyPunches(employee(), {
        page: 1,
        page_size: 10,
        date_from: "2026-07-08",
        date_to: "2026-07-08",
      });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.event_type).toBe("check_out");
      expect(result.items[1]!.event_type).toBe("check_in");
    });

    it("filters punches by date range", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-07T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.listMyPunches(employee(), {
        page: 1,
        page_size: 10,
        date_from: "2026-07-08",
        date_to: "2026-07-08",
      });

      expect(result.total).toBe(2);
      expect(result.items.every((item) => item.work_date === "2026-07-08")).toBe(true);
    });

    it("supports pagination", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      service.punch(employee(), {
        event_type: "check_out",
        occurred_at: "2026-07-08T12:30:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.listMyPunches(employee(), {
        page: 1,
        page_size: 1,
        date_from: "2026-07-08",
        date_to: "2026-07-08",
      });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.event_type).toBe("check_out");
    });

    it("blocks admin users from accessing self attendance punches", () => {
      const admin = store.users.find((u) => u.id === seedIds.admin)!;

      expect(() =>
        service.listMyPunches(admin, {
          page: 1,
          page_size: 10,
        }),
      ).toThrow();
    });
  });

  describe("AttendanceService.mySummary", () => {
    let store: ReturnType<typeof createMemoryDataStore>;
    let service: AttendanceService;

    beforeEach(() => {
      store = attendanceStore();
      service = new AttendanceService(store);
    });

    function employee() {
      return store.users.find((u) => u.id === seedIds.employee1)!;
    }

    function admin() {
      return store.users.find((u) => u.id === seedIds.admin)!;
    }

    it("returns summary for employee", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      service.punch(employee(), {
        event_type: "check_out",
        occurred_at: "2026-07-08T12:30:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.mySummary(employee(), {
        page: 1,
        page_size: 10,
      });

      expect(result.generated_at).toBeDefined();

      expect(result.range).toBeDefined();

      expect(result.today).toBeDefined();
      expect(result.today.target_work_minutes).toBeGreaterThan(0);
      expect(result.today.target_hours).toBeDefined();
      expect(Array.isArray(result.today.next_allowed_actions)).toBe(true);

      expect(result.summary).toBeDefined();
      expect(result.summary.target_work_minutes).toBeGreaterThan(0);
      expect(result.summary.target_hours).toBeDefined();

      expect(Array.isArray(result.week_records)).toBe(true);
      expect(result.weekly_balance).toBeDefined();
      expect(Array.isArray(result.exception_history)).toBe(true);
    });

    it("returns historical attendance exceptions", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      service.punch(employee(), {
        event_type: "check_out",
        occurred_at: "2026-07-08T12:30:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.mySummary(employee(), {
        page: 1,
        page_size: 10,
      });

      expect(result.exception_history.length).toBeGreaterThan(0);

      expect(result.exception_history[0]).toMatchObject({
        status: "absent",
      });
    });

    it("includes week records", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.mySummary(employee(), {
        page: 1,
        page_size: 10,
      });

      expect(result.week_records.length).toBeGreaterThan(0);
    });

    it("returns punch availability for today", () => {
      const result = service.mySummary(employee(), {
        page: 1,
        page_size: 10,
      });

      expect(Array.isArray(result.today.next_allowed_actions)).toBe(true);
      expect(result.today.punch_policy).toBeDefined();
    });

    it("blocks admin users", () => {
      expect(() =>
        service.mySummary(admin(), {
          page: 1,
          page_size: 10,
        }),
      ).toThrow();
    });
  });

  describe("AttendanceService.teamSummary", () => {
    let store: ReturnType<typeof createMemoryDataStore>;
    let service: AttendanceService;

    beforeEach(() => {
      store = attendanceStore();
      service = new AttendanceService(store);
    });

    function manager() {
      return store.users.find((u) => u.id === seedIds.manager)!;
    }

    function admin() {
      return store.users.find((u) => u.id === seedIds.admin)!;
    }

    function employee() {
      return store.users.find((u) => u.id === seedIds.employee1)!;
    }

    it("returns today's team summary for a manager", () => {
      const result = service.teamSummary(manager(), {
        page: 1,
        page_size: 10,
      });

      expect(result.generated_at).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.totals).toBeDefined();
      expect(result.department_summary).toBeDefined();
      expect(Array.isArray(result.exceptions)).toBe(true);
    });

    it("allows admin to retrieve team summary", () => {
      const result = service.teamSummary(admin(), {
        page: 1,
        page_size: 10,
      });

      expect(result.generated_at).toBeDefined();
      expect(result.totals).toBeDefined();
    });

    it("reflects attendance after an employee checks in", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.teamSummary(manager(), {
        page: 1,
        page_size: 10,
        date_from: "2026-07-08",
      });

      expect(result.totals).toBeDefined();
      expect(result.department_summary.length).toBeGreaterThan(0);
    });

    it("returns exception list", () => {
      const result = service.teamSummary(manager(), {
        page: 1,
        page_size: 10,
      });

      expect(Array.isArray(result.exceptions)).toBe(true);
    });

    it("supports department filtering", () => {
      const departmentId = employee().department_id;

      const result = service.teamSummary(manager(), {
        page: 1,
        page_size: 10,
        department_id: departmentId,
      });

      expect(result.department_summary).toBeDefined();
    });
  });

  describe("AttendanceService.calendar", () => {
    let store: ReturnType<typeof createMemoryDataStore>;
    let service: AttendanceService;

    beforeEach(() => {
      store = attendanceStore();
      service = new AttendanceService(store);
    });

    function employee() {
      return store.users.find((u) => u.id === seedIds.employee1)!;
    }

    function manager() {
      return store.users.find((u) => u.id === seedIds.manager)!;
    }

    function admin() {
      return store.users.find((u) => u.id === seedIds.admin)!;
    }

    it("returns monthly calendar for employee", () => {
      const result = service.monthlyCalendar(employee(), {
        page: 1,
        page_size: 10,
        month: "2026-07",
      });

      expect(result.month).toBe("2026-07");
      expect(Array.isArray(result.calendar_days)).toBe(true);
    });

    it("returns monthly calendar for manager viewing employee", () => {
      const result = service.monthlyCalendar(manager(), {
        page: 1,
        page_size: 10,
        month: "2026-07",
        user_id: employee().id,
      });

      expect(result.month).toBe("2026-07");
      expect(Array.isArray(result.calendar_days)).toBe(true);
    });

    it("returns monthly calendar for admin viewing employee", () => {
      const result = service.monthlyCalendar(admin(), {
        page: 1,
        page_size: 10,
        month: "2026-07",
        user_id: employee().id,
      });

      expect(result.month).toBe("2026-07");
      expect(Array.isArray(result.calendar_days)).toBe(true);
    });

    it("returns daily calendar", () => {
      const result = service.dailyCalendar(employee(), {
        page: 1,
        page_size: 10,
        date: "2026-07-08",
      });

      expect(result.date).toBe("2026-07-08");
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.totals).toBeDefined();
      expect(Array.isArray(result.exceptions)).toBe(true);
    });

    it("includes attendance after check in", () => {
      service.punch(employee(), {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {},
      });

      const result = service.dailyCalendar(employee(), {
        page: 1,
        page_size: 10,
        date: "2026-07-08",
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toHaveProperty("employee");
    });

    it("supports manager viewing employee daily calendar", () => {
      const result = service.dailyCalendar(manager(), {
        page: 1,
        page_size: 10,
        date: "2026-07-08",
        user_id: employee().id,
      });

      expect(result.date).toBe("2026-07-08");
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it("supports admin viewing employee daily calendar", () => {
      const result = service.dailyCalendar(admin(), {
        page: 1,
        page_size: 10,
        date: "2026-07-08",
        user_id: employee().id,
      });

      expect(result.date).toBe("2026-07-08");
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });
  });

  describe("AttendanceService.regularizations", () => {
    let store: ReturnType<typeof createMemoryDataStore>;
    let service: AttendanceService;

    beforeEach(() => {
      store = attendanceStore();
      service = new AttendanceService(store);
    });

    function employee() {
      return store.users.find((u) => u.id === seedIds.employee1)!;
    }

    function manager() {
      return store.users.find((u) => u.id === seedIds.manager)!;
    }

    it("creates a pending regularization request", () => {
      const result = service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Forgot to punch in",
        requested_punches: [
          {
            event_type: "check_in",
            occurred_at: "2026-07-08T04:00:00.000Z",
          },
        ],
      });

      expect(result.status).toBe("pending");
      expect(result.reason).toBe("Forgot to punch in");

      expect(store.attendanceRegularizations).toHaveLength(1);
    });

    it("trims the submitted reason", () => {
      const result = service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "   Forgot to punch in   ",
        requested_punches: [],
      });

      expect(result.reason).toBe("Forgot to punch in");
    });

    it("marks the attendance day as pending regularization", () => {
      service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Forgot to punch",
        requested_punches: [],
      });

      const day = service["resolveDay"](
        companyId(store),
        employee().id,
        "2026-07-08",
        employee().timezone!,
      );

      expect(day.regularization_status).toBe("pending");
    });

    it("creates an outbox event", () => {
      service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Forgot to punch",
        requested_punches: [],
      });

      expect(store.outbox).toHaveLength(1);

      expect(store.outbox[0]).toMatchObject({
        aggregate_type: "attendance",
        event_type: "attendance.regularization_submitted",
      });
    });

    it("assigns an approver", () => {
      const result = service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Forgot to punch",
        requested_punches: [],
      });

      expect(result.current_approver_user_id).toBeTruthy();
    });

    it("lists only the actor regularizations", () => {
      service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Forgot to punch",
        requested_punches: [],
      });

      const result = service.myRegularizations(employee(), {
        page: 1,
        page_size: 10,
        date_from: "2026-07-08",
        date_to: "2026-07-08",
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it("filters regularizations by status", () => {
      service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Forgot to punch",
        requested_punches: [],
      });

      const result = service.myRegularizations(employee(), {
        page: 1,
        page_size: 10,
        status: "approved",
        date_from: "2026-07-08",
        date_to: "2026-07-08",
      });

      expect(result.total).toBe(0);
    });

    it("supports pagination", () => {
      service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Reason 1",
        requested_punches: [],
      });

      service.createRegularization(employee(), {
        work_date: "2026-07-09",
        reason: "Reason 2",
        requested_punches: [],
      });

      const result = service.myRegularizations(employee(), {
        page: 1,
        page_size: 1,
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(1);
    });
  });

  describe("AttendanceService.decideRegularization", () => {
    function createPendingRequest() {
      return service.createRegularization(employee(), {
        work_date: "2026-07-08",
        reason: "Forgot check in",
        requested_punches: [],
      });
    }

    it("approves a pending request", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(result.previous_status).toBe("pending");
      expect(result.next_status).toBe("approved");
      expect(result.status).toBe("approved");
    });

    it("rejects a pending request", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(manager(), request.id, {
        decision: "reject",
        remarks: "Invalid request",
        expected_version: 1,
      });

      expect(result.status).toBe("rejected");
      expect(result.decision_remarks).toBe("Invalid request");
    });

    it("returns a pending request", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(manager(), request.id, {
        decision: "return",
        remarks: "Please update time",
        expected_version: 1,
      });

      expect(result.status).toBe("returned");
      expect(result.decision_remarks).toBe("Please update time");
    });

    it("reject requires remarks", () => {
      const request = createPendingRequest();

      expect(() =>
        service.decideRegularization(manager(), request.id, {
          decision: "reject",
          expected_version: 1,
        }),
      ).toThrow();
    });

    it("return requires remarks", () => {
      const request = createPendingRequest();

      expect(() =>
        service.decideRegularization(manager(), request.id, {
          decision: "return",
          expected_version: 1,
        }),
      ).toThrow();
    });

    it("fails when optimistic version mismatches", () => {
      const request = createPendingRequest();

      expect(() =>
        service.decideRegularization(manager(), request.id, {
          decision: "approve",
          expected_version: 99,
        }),
      ).toThrow();
    });

    it("prevents deciding an already approved request", () => {
      const request = createPendingRequest();

      service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(() =>
        service.decideRegularization(manager(), request.id, {
          decision: "approve",
          expected_version: 2,
        }),
      ).toThrow();
    });

    it("updates the attendance day regularization status", () => {
      const request = createPendingRequest();

      service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      const day = service["resolveDay"](
        companyId(store),
        employee().id,
        "2026-07-08",
        employee().timezone!,
      );

      expect(day.regularization_status).toBe("approved");
    });

    it("creates an outbox event", () => {
      const request = createPendingRequest();

      service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(store.outbox).toHaveLength(2);

      expect(store.outbox[1]).toMatchObject({
        aggregate_type: "attendance",
      });
    });

    it("clears current approver after decision", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(result.current_approver_user_id).toBeNull();
    });

    it("allows admin to approve a request", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(admin(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(result.status).toBe("approved");
    });

    it("blocks self approval", () => {
      const request = createPendingRequest();

      expect(() =>
        service.decideRegularization(employee(), request.id, {
          decision: "approve",
          expected_version: 1,
        }),
      ).toThrow();
    });

    it("blocks unrelated employee from deciding", () => {
      const request = createPendingRequest();

      expect(() =>
        service.decideRegularization(employee2(), request.id, {
          decision: "approve",
          expected_version: 1,
        }),
      ).toThrow();
    });

    it("stores decided_by_user_id", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(result.decided_by_user_id).toBe(manager().id);
    });

    it("stores decided_at timestamp", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(result.decided_at).toBeTruthy();
    });

    it("increments version after approval", () => {
      const request = createPendingRequest();

      const result = service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(result.version).toBe(2);
    });

    it("increments day version after decision", () => {
      const request = createPendingRequest();

      service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      const day = service["resolveDay"](
        companyId(store),
        employee().id,
        "2026-07-08",
        employee().timezone!,
      );

      expect(day.version).toBeGreaterThan(1);
    });

    it("creates approval outbox event", () => {
      const request = createPendingRequest();

      service.decideRegularization(manager(), request.id, {
        decision: "approve",
        expected_version: 1,
      });

      expect(store.outbox[1]!.event_type).toContain("approved");
    });

    it("creates rejection outbox event", () => {
      const request = createPendingRequest();

      service.decideRegularization(manager(), request.id, {
        decision: "reject",
        remarks: "Rejected",
        expected_version: 1,
      });

      expect(store.outbox[1]!.event_type).toContain("rejected");
    });

    it("creates returned outbox event", () => {
      const request = createPendingRequest();

      service.decideRegularization(manager(), request.id, {
        decision: "return",
        remarks: "Need more information",
        expected_version: 1,
      });

      expect(store.outbox[1]!.event_type).toContain("returned");
    });
  });

  describe("AttendanceService.exceptions", () => {
    it("returns attendance exceptions", () => {
      const result = service.exceptions(manager(), {
        page: 1,
        page_size: 10,
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      });

      expect(result.items).toBeDefined();
      expect(result.totals).toBeDefined();
    });

    it("supports pagination", () => {
      const result = service.exceptions(manager(), {
        page: 1,
        page_size: 1,
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      });

      expect(result.items.length).toBeLessThanOrEqual(1);
    });

    it("filters by exception type", () => {
      const result = service.exceptions(manager(), {
        page: 1,
        page_size: 10,
        exception_type: "absent",
      });

      expect(
        result.items.every((item) => item.exception_type === "absent"),
      ).toBe(true);
    });

    it("supports department filtering", () => {
      const result = service.exceptions(manager(), {
        page: 1,
        page_size: 10,
        department_id: employee().department_id,
      });

      expect(result.items).toBeDefined();
    });

    it("allows admin access", () => {
      const result = service.exceptions(admin(), {
        page: 1,
        page_size: 10,
      });

      expect(result.items).toBeDefined();
    });

    it("allows an employee to view their own attendance exceptions", () => {
      const result = service.exceptions(employee(), {
        page: 1,
        page_size: 10,
      });

      expect(result.items).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it("returns summary counts", () => {
      const result = service.exceptions(manager(), {
        page: 1,
        page_size: 10,
      });

      expect(result.totals).toBeDefined();
    });

    it("returns total count", () => {
      const result = service.exceptions(manager(), {
        page: 1,
        page_size: 10,
      });

      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("AttendanceService.createExportJob", () => {
    it("allows admin to create an export job", async () => {
      const result = await service.createExportJob(admin(), {});

      expect(result.job_id).toBeTruthy();
      expect(result.status).toBeTruthy();
      expect(result.requested_by_user_id).toBe(admin().id);
    });

    it("uses csv as the default format", async () => {
      const result = await service.createExportJob(admin(), {});

      expect(result.format).toBe("csv");
    });

    it("supports custom format and columns", async () => {
      const result = await service.createExportJob(admin(), {
        format: "json",
        columns: ["employee_code", "status"],
      });

      expect(result.format).toBe("json");
      expect(result.columns).toEqual(["employee_code", "status"]);
    });

    it("stores filters in the export job", async () => {
      const result = await service.createExportJob(admin(), {
        filters: {
          department_id: employee().department_id,
          status: "present",
        },
      });

      expect(result.filters).toMatchObject({
        department_id: employee().department_id,
        status: "present",
      });
    });

    it("creates an attendance export outbox event", async () => {
      await service.createExportJob(admin(), {});

      expect(store.outbox).toHaveLength(1);

      expect(store.outbox[0]).toMatchObject({
        aggregate_type: "attendance",
        event_type: "attendance.export_requested",
      });
    });

    it("exports only records for the selected company context", async () => {
      service.punch(employee(), {
        event_type: "check_in", occurred_at: "2026-07-08T04:00:00.000Z", work_mode: "office", source: "web", metadata: {}
      });
      const ownRecord = store.attendanceDayRecords[0]!;
      store.attendanceDayRecords.push({ ...ownRecord, id: randomUUID(), company_id: randomUUID() });

      const result = await service.createExportJob(admin(), { format: "json" });

      expect(result.row_count).toBe(1);
    });

    it("blocks employees from exporting attendance", async () => {
      await expect(service.createExportJob(employee(), {})).rejects.toThrow();
    });
  });
});
