import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { AttendanceRepository } from "../repository.js";

describe("AttendanceRepository", () => {
  describe("addPunch", () => {
    it("creates and stores a punch", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      const punch = repository.addPunch({
        employee_user_id: seedIds.employee1,
        event_type: "check_in",
        occurred_at: "2026-07-08T09:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      expect(punch.id).toBeDefined();
      expect(punch.created_at).toBeDefined();
      expect(punch.deleted_at).toBeNull();

      expect(store.attendancePunches).toHaveLength(1);
      expect(store.attendancePunches[0]).toEqual(punch);
    });
  });

  describe("listPunches", () => {
    it("returns punches ordered by occurred_at", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      repository.addPunch({
        employee_user_id: seedIds.employee1,
        event_type: "check_out",
        occurred_at: "2026-07-08T18:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      repository.addPunch({
        employee_user_id: seedIds.employee1,
        event_type: "check_in",
        occurred_at: "2026-07-08T09:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      const punches = repository.listPunches(seedIds.employee1);

      expect(punches).toHaveLength(2);
      expect(punches[0]!.event_type).toBe("check_in");
      expect(punches[1]!.event_type).toBe("check_out");
    });

    it("filters by employee", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      repository.addPunch({
        employee_user_id: seedIds.employee1,
        event_type: "check_in",
        occurred_at: "2026-07-08T09:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      repository.addPunch({
        employee_user_id: seedIds.employee2,
        event_type: "check_in",
        occurred_at: "2026-07-08T09:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      expect(repository.listPunches(seedIds.employee1)).toHaveLength(1);
      expect(repository.listPunches(seedIds.employee2)).toHaveLength(1);
    });

    it("filters deleted punches", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      const punch = repository.addPunch({
        employee_user_id: seedIds.employee1,
        event_type: "check_in",
        occurred_at: "2026-07-08T09:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      punch.deleted_at = "2026-07-08T12:00:00.000Z";

      expect(repository.listPunches(seedIds.employee1)).toEqual([]);
    });

    it("filters by date range", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      repository.addPunch({
        employee_user_id: seedIds.employee1,
        event_type: "check_in",
        occurred_at: "2026-07-07T09:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      repository.addPunch({
        employee_user_id: seedIds.employee1,
        event_type: "check_in",
        occurred_at: "2026-07-08T09:00:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {}
      });

      const punches = repository.listPunches(
        seedIds.employee1,
        "2026-07-08",
        "2026-07-08"
      );

      expect(punches).toHaveLength(1);
      expect(punches[0]!.occurred_at.startsWith("2026-07-08")).toBe(true);
    });
  });

  describe("dayRecord", () => {
    it("returns null when record does not exist", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      expect(
        repository.dayRecord(seedIds.employee1, "2026-07-08")
      ).toBeNull();
    });

    it("returns existing day record", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      const record = repository.upsertDayRecord({
        employee_user_id: seedIds.employee1,
        work_date: "2026-07-08",
        status: "present",
        first_check_in: null,
        last_check_out: null,
        work_minutes: 0,
        break_minutes: 0,
        late_minutes: 0,
        early_out_minutes: 0,
        work_mode: "office",
        note: null,
        exception_type: null,
        regularization_status: null
      });

      expect(
        repository.dayRecord(seedIds.employee1, "2026-07-08")
      ).toEqual(record);
    });
  });

  describe("upsertDayRecord", () => {
    it("creates a new day record", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      const record = repository.upsertDayRecord({
        employee_user_id: seedIds.employee1,
        work_date: "2026-07-08",
        status: "present",
        first_check_in: null,
        last_check_out: null,
        work_minutes: 480,
        break_minutes: 60,
        late_minutes: 0,
        early_out_minutes: 0,
        work_mode: "office",
        note: null,
        exception_type: null,
        regularization_status: null
      });

      expect(record.version).toBe(1);
      expect(store.attendanceDayRecords).toHaveLength(1);
    });

    it("updates existing record and increments version", () => {
      const store = createMemoryDataStore();
      const repository = new AttendanceRepository(store);

      repository.upsertDayRecord({
        employee_user_id: seedIds.employee1,
        work_date: "2026-07-08",
        status: "present",
        first_check_in: null,
        last_check_out: null,
        work_minutes: 480,
        break_minutes: 60,
        late_minutes: 0,
        early_out_minutes: 0,
        work_mode: "office",
        note: null,
        exception_type: null,
        regularization_status: null
      });

      const updated = repository.upsertDayRecord({
        employee_user_id: seedIds.employee1,
        work_date: "2026-07-08",
        status: "present",
        first_check_in: null,
        last_check_out: null,
        work_minutes: 510,
        break_minutes: 60,
        late_minutes: 0,
        early_out_minutes: 0,
        work_mode: "office",
        note: "updated",
        exception_type: null,
        regularization_status: null
      });

      expect(updated.version).toBe(2);
      expect(updated.work_minutes).toBe(510);
      expect(updated.note).toBe("updated");
    });
  });

  describe("listDayRecords", () => {
  it("filters by user ids", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    repository.upsertDayRecord({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      status: "present",
      first_check_in: null,
      last_check_out: null,
      work_minutes: 480,
      break_minutes: 60,
      late_minutes: 0,
      early_out_minutes: 0,
      work_mode: "office",
      note: null,
      exception_type: null,
      regularization_status: null
    });

    repository.upsertDayRecord({
      employee_user_id: seedIds.employee2,
      work_date: "2026-07-08",
      status: "present",
      first_check_in: null,
      last_check_out: null,
      work_minutes: 420,
      break_minutes: 45,
      late_minutes: 0,
      early_out_minutes: 0,
      work_mode: "office",
      note: null,
      exception_type: null,
      regularization_status: null
    });

    const records = repository.listDayRecords({
      userIds: new Set([seedIds.employee1])
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.employee_user_id).toBe(seedIds.employee1);
  });

  it("filters by date range", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    repository.upsertDayRecord({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-07",
      status: "present",
      first_check_in: null,
      last_check_out: null,
      work_minutes: 480,
      break_minutes: 60,
      late_minutes: 0,
      early_out_minutes: 0,
      work_mode: "office",
      note: null,
      exception_type: null,
      regularization_status: null
    });

    repository.upsertDayRecord({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      status: "present",
      first_check_in: null,
      last_check_out: null,
      work_minutes: 480,
      break_minutes: 60,
      late_minutes: 0,
      early_out_minutes: 0,
      work_mode: "office",
      note: null,
      exception_type: null,
      regularization_status: null
    });

    const records = repository.listDayRecords({
      dateFrom: "2026-07-08",
      dateTo: "2026-07-08"
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.work_date).toBe("2026-07-08");
  });
});

describe("addRegularization", () => {
  it("creates a pending request", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    const request = repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [
        {
          event_type: "check_out",
          occurred_at: "2026-07-08T18:00:00.000Z"
        }
      ],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    expect(request.version).toBe(1);
    expect(request.status).toBe("pending");
    expect(store.attendanceRegularizations).toHaveLength(1);
  });

  it("rejects duplicate pending requests", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    expect(() =>
      repository.addRegularization({
        employee_user_id: seedIds.employee1,
        work_date: "2026-07-08",
        reason: "Duplicate",
        requested_punches: [],
        status: "pending",
        current_approver_user_id: seedIds.manager
      })
    ).toThrow();
  });
});

describe("findRegularization", () => {
  it("finds an existing request", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    const created = repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    expect(repository.findRegularization(created.id)).toEqual(created);
  });

  it("throws when request is missing", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    expect(() =>
      repository.findRegularization(randomUUID())
    ).toThrow();
  });
});

describe("updateRegularizationVersioned", () => {
  it("updates matching version", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    const request = repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    const updated = repository.updateRegularizationVersioned(
      request.id,
      1,
      (item) => {
        item.status = "approved";
      }
    );

    expect(updated.status).toBe("approved");
    expect(updated.version).toBe(2);
  });

  it("throws optimistic concurrency conflict", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    const request = repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    expect(() =>
      repository.updateRegularizationVersioned(
        request.id,
        99,
        () => {}
      )
    ).toThrow();
  });
});

describe("listRegularizations", () => {
  it("filters by status", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    repository.addRegularization({
      employee_user_id: seedIds.employee2,
      work_date: "2026-07-09",
      reason: "Medical",
      requested_punches: [],
      status: "approved",
      current_approver_user_id: seedIds.manager
    });

    const pending = repository.listRegularizations({
      status: "pending"
    });

    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe("pending");
  });

  it("filters by user ids", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    repository.addRegularization({
      employee_user_id: seedIds.employee2,
      work_date: "2026-07-09",
      reason: "Medical",
      requested_punches: [],
      status: "approved",
      current_approver_user_id: seedIds.manager
    });

    const result = repository.listRegularizations({
      userIds: new Set([seedIds.employee2])
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.employee_user_id).toBe(seedIds.employee2);
  });

  it("filters by date range", () => {
    const store = createMemoryDataStore();
    const repository = new AttendanceRepository(store);

    repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Forgot checkout",
      requested_punches: [],
      status: "pending",
      current_approver_user_id: seedIds.manager
    });

    repository.addRegularization({
      employee_user_id: seedIds.employee1,
      work_date: "2026-07-10",
      reason: "Medical",
      requested_punches: [],
      status: "approved",
      current_approver_user_id: seedIds.manager
    });

    const result = repository.listRegularizations({
      dateFrom: "2026-07-09",
      dateTo: "2026-07-10"
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.work_date).toBe("2026-07-10");
  });
});
});