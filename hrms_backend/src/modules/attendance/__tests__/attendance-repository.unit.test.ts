import { describe, expect, it } from "vitest";
import {
  createMemoryDataStore,
  seedIds,
} from "../../../platform/data-store.js";
import { AttendanceRepository } from "../repository.js";

const companyA = "00000000-0000-4000-8000-000000000001";
const companyB = "00000000-0000-4000-8000-000000000002";

function punch(company_id: string, employee_user_id = seedIds.employee1) {
  return {
    company_id,
    employee_user_id,
    actor_user_id: employee_user_id,
    event_type: "check_in" as const,
    occurred_at: "2026-07-08T09:00:00.000Z",
    work_mode: "office" as const,
    source: "web" as const,
    origin: "employee_manual_now" as const,
    metadata: {},
  };
}

function day(company_id: string) {
  return {
    company_id,
    employee_user_id: seedIds.employee1,
    work_date: "2026-07-08",
    status: "present" as const,
    day_classification: "working_day" as const,
    presence_state: "present" as const,
    punctuality_state: "on_time" as const,
    evidence_state: "complete" as const,
    approval_kind: "none" as const,
    approval_state: "not_required" as const,
    payroll_state: "unprocessed" as const,
    first_check_in: null,
    last_check_out: null,
    work_minutes: 0,
    break_minutes: 0,
    late_minutes: 0,
    early_out_minutes: 0,
    work_seconds: 0,
    break_seconds: 0,
    scheduled_seconds: 28800,
    late_seconds: 0,
    early_departure_seconds: 0,
    work_mode: "office" as const,
    note: null,
    exception_type: null,
    regularization_status: null,
  };
}

describe("AttendanceRepository tenancy", () => {
  it("lists punches only within the requested company and employee", () => {
    const repository = new AttendanceRepository(createMemoryDataStore());
    repository.addPunch(punch(companyA));
    repository.addPunch(punch(companyB));

    expect(repository.listPunches(companyA, seedIds.employee1)).toHaveLength(1);
    expect(repository.listPunches(companyB, seedIds.employee1)).toHaveLength(1);
  });

  it("upserts day records by company, employee, and work date", () => {
    const repository = new AttendanceRepository(createMemoryDataStore());
    const first = repository.upsertDayRecord(day(companyA));
    const second = repository.upsertDayRecord({
      ...day(companyB),
      status: "late",
    });

    expect(first.id).not.toBe(second.id);
    expect(
      repository.dayRecord(companyA, seedIds.employee1, "2026-07-08")?.status,
    ).toBe("present");
    expect(
      repository.dayRecord(companyB, seedIds.employee1, "2026-07-08")?.status,
    ).toBe("late");
  });

  it("allows pending regularizations for the same employee/date in different companies", () => {
    const repository = new AttendanceRepository(createMemoryDataStore());
    const input = {
      employee_user_id: seedIds.employee1,
      submitted_by_user_id: seedIds.employee1,
      work_date: "2026-07-08",
      reason: "Missed punch",
      requested_punches: [],
      status: "pending" as const,
      current_approver_user_id: seedIds.manager,
    };
    repository.addRegularization({ ...input, company_id: companyA });
    repository.addRegularization({ ...input, company_id: companyB });

    expect(
      repository.listRegularizations({ companyIds: new Set([companyA]) }),
    ).toHaveLength(1);
    expect(
      repository.listRegularizations({ companyIds: new Set([companyB]) }),
    ).toHaveLength(1);
  });

  it("does not find or update a regularization across company scope", () => {
    const repository = new AttendanceRepository(createMemoryDataStore());
    const request = repository.addRegularization({
      ...{
        employee_user_id: seedIds.employee1,
        submitted_by_user_id: seedIds.employee1,
        work_date: "2026-07-08",
        reason: "Missed punch",
        requested_punches: [],
        status: "pending" as const,
        current_approver_user_id: seedIds.manager,
      },
      company_id: companyA,
    });

    expect(() =>
      repository.findRegularization(request.id, new Set([companyB])),
    ).toThrow();
  });
});
