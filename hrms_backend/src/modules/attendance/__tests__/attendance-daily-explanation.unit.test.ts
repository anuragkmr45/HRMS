import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { AttendanceService } from "../service.js";

describe("AttendanceService.dailyExplanation", () => {
  let store: ReturnType<typeof createMemoryDataStore>;
  let service: AttendanceService;

  beforeEach(() => {
    store = createMemoryDataStore();
    service = new AttendanceService(store);
  });

  it("returns separate dimensions and omits restricted event metadata", () => {
    const employee = user(seedIds.employee1);
    service.punch(employee, {
      event_type: "check_in",
      occurred_at: "2026-07-08T04:10:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {
        latitude: 18.5204303,
        longitude: 73.8567437,
        ip_address: "198.51.100.24",
        device_id: "restricted-device-identifier",
        attestation_payload: "restricted-attestation-payload"
      }
    });
    service.punch(employee, {
      event_type: "check_out",
      occurred_at: "2026-07-08T12:40:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {
        latitude: 18.5204303,
        longitude: 73.8567437
      }
    });

    const explanation = service.dailyExplanation(employee, {
      date: "2026-07-08"
    });

    expect(explanation.dimensions.map((dimension) => dimension.key)).toEqual([
      "day_classification",
      "presence_state",
      "punctuality_state",
      "evidence_state",
      "approval_state",
      "payroll_state"
    ]);
    expect(explanation.source_events).toHaveLength(2);
    expect(explanation.source_events[0]).toMatchObject({
      event_type: "check_in",
      source_channel: "web",
      verdict: "accepted",
      reason_codes: ["EVENT_ACCEPTED", "CHANNEL_WEB"]
    });
    expect(explanation.privacy.restricted_evidence_omitted).toBe(true);

    const serialized = JSON.stringify(explanation);
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("ip_address");
    expect(serialized).not.toContain("restricted-device-identifier");
    expect(serialized).not.toContain("restricted-attestation-payload");
    expect(serialized).not.toContain("metadata");
  });

  it("preserves projection dimensions supplied by the normalized daily summary", () => {
    const employee = user(seedIds.employee1);
    service.punch(employee, {
      event_type: "check_in",
      occurred_at: "2026-07-08T04:10:00.000Z",
      work_mode: "office",
      source: "web",
      metadata: {}
    });
    const record = store.attendanceDayRecords[0] as typeof store.attendanceDayRecords[number] & {
      day_classification: string;
      presence_state: string;
      punctuality_state: string;
      evidence_state: string;
      approval_state: string;
      payroll_state: string;
    };
    Object.assign(record, {
      day_classification: "working_day",
      presence_state: "incomplete",
      punctuality_state: "late",
      evidence_state: "partial",
      approval_state: "pending",
      payroll_state: "held"
    });

    const explanation = service.dailyExplanation(employee, {
      date: "2026-07-08"
    });
    const states = Object.fromEntries(
      explanation.dimensions.map((dimension) => [dimension.key, dimension.state])
    );

    expect(states).toMatchObject({
      day_classification: "working_day",
      presence_state: "incomplete",
      punctuality_state: "late",
      evidence_state: "partial",
      approval_state: "pending",
      payroll_state: "held"
    });
  });

  it("allows reporting-line managers and rejects unrelated employees", () => {
    const manager = user(seedIds.manager);
    const unrelatedEmployee = user(seedIds.financeManager);

    const visible = service.dailyExplanation(manager, {
      date: "2026-07-08",
      user_id: seedIds.employee1
    });

    expect(visible.employee.id).toBe(seedIds.employee1);
    expect(() =>
      service.dailyExplanation(unrelatedEmployee, {
        date: "2026-07-08",
        user_id: seedIds.employee1
      })
    ).toThrow(/limited to self, reporting hierarchy/iu);
  });

  it("allows system-wide attendance roles to inspect their own read-only summary", () => {
    const admin = user(seedIds.admin);

    const explanation = service.dailyExplanation(admin, {
      date: "2026-07-08"
    });

    expect(explanation.employee.id).toBe(admin.id);
    expect(explanation.dimensions).toHaveLength(6);
  });

  function user(id: string) {
    return store.users.find((candidate) => candidate.id === id)!;
  }
});
