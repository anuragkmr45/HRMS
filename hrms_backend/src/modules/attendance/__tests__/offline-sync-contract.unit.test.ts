import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
  ATTENDANCE_OFFLINE_SYNC_MAX_BATCH_EVENTS,
  attendanceOfflineBatchRequestSchema,
  attendanceOfflineEventEnvelopeSchema,
  attendanceOfflineSyncResponseSchema,
  attendanceOfflineSyncResultSchema,
  attendanceOfflineSyncStatusValues,
  attendanceOfflineVerificationStatusValues,
  canonicalOfflineAttendanceEventHash,
  canonicalOfflineAttendanceEventProjection,
  type AttendanceOfflineEventEnvelope,
  type AttendanceOfflineSyncResult,
} from "../offline-sync-contract.js";
import { canonicalJsonHash } from "../canonical-json.js";

const batchId = "00000000-0000-4000-8000-000000000100";
const eventId = "00000000-0000-4000-8000-000000000101";

function event(
  overrides: Partial<AttendanceOfflineEventEnvelope> = {},
): AttendanceOfflineEventEnvelope {
  return attendanceOfflineEventEnvelopeSchema.parse({
    client_event_id: eventId,
    sequence: 42,
    command_kind: "employee_manual_now",
    captured_at: "2026-08-03T09:00:00.000+05:30",
    source: "mobile",
    event_type: "check_in",
    work_mode: "office",
    metadata: {
      network_state: "offline",
      capture_method: "user_action",
      client_timezone: "Asia/Calcutta",
    },
    location: {
      latitude: 12.971599,
      longitude: 77.594566,
      accuracy_meters: 18,
      captured_at: "2026-08-03T08:59:58.000Z",
      provider: "device",
      permission_state: "granted",
    },
    ...overrides,
  });
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
    batch_id: batchId,
    device: {
      device_id: "mobile-installation-handle",
      platform: "android",
      app_version: "2026.08.03",
      os_version: "Android 15",
    },
    events: [event()],
    ...overrides,
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    client_event_id: eventId,
    sequence: 42,
    sync_status: "accepted",
    verification_status: "unverified",
    replayed: false,
    reason_code: "offline_sync.accepted_unverified",
    server_received_at: "2026-08-03T03:45:10.000Z",
    processed_at: null,
    payroll_eligible: false,
    ...overrides,
  };
}

describe("offline attendance sync contract", () => {
  it("parses a valid batch request", () => {
    expect(attendanceOfflineBatchRequestSchema.parse(batch())).toMatchObject({
      contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
      batch_id: batchId,
      device: { device_id: "mobile-installation-handle" },
      events: [{ client_event_id: eventId, source: "mobile" }],
    });
  });

  it("requires strict untrusted device metadata", () => {
    const { device: _device, ...withoutDevice } = batch();

    expect(attendanceOfflineBatchRequestSchema.safeParse(withoutDevice).success).toBe(false);
    expect(attendanceOfflineBatchRequestSchema.safeParse(batch({ device: null })).success).toBe(false);
    expect(attendanceOfflineBatchRequestSchema.safeParse(batch({
      device: {
        device_id: "mobile-installation-handle",
        platform: "android",
        company_id: "00000000-0000-4000-8000-000000000306",
      },
    })).success).toBe(false);
  });

  it("rejects empty and oversized event arrays", () => {
    expect(attendanceOfflineBatchRequestSchema.safeParse(batch({ events: [] })).success).toBe(false);
    expect(attendanceOfflineBatchRequestSchema.safeParse(batch({
      events: Array.from({ length: ATTENDANCE_OFFLINE_SYNC_MAX_BATCH_EVENTS + 1 }, (_, index) =>
        event({
          client_event_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          sequence: index + 1,
        }),
      ),
    })).success).toBe(false);
  });

  it("rejects invalid contract versions", () => {
    expect(attendanceOfflineBatchRequestSchema.safeParse(batch({
      contract_version: "attendance.offline_sync.v2",
    })).success).toBe(false);
  });

  it("requires positive safe integer event sequences", () => {
    expect(attendanceOfflineEventEnvelopeSchema.safeParse({
      ...event(),
      sequence: 1,
    }).success).toBe(true);
    expect(attendanceOfflineEventEnvelopeSchema.safeParse({
      ...event(),
      sequence: Number.MAX_SAFE_INTEGER,
    }).success).toBe(true);
    expect(attendanceOfflineEventEnvelopeSchema.safeParse({
      ...event(),
      sequence: 0,
    }).success).toBe(false);
    expect(attendanceOfflineEventEnvelopeSchema.safeParse({
      ...event(),
      sequence: -1,
    }).success).toBe(false);
    expect(attendanceOfflineEventEnvelopeSchema.safeParse({
      ...event(),
      sequence: 1.5,
    }).success).toBe(false);
    expect(attendanceOfflineEventEnvelopeSchema.safeParse({
      ...event(),
      sequence: Number.MAX_SAFE_INTEGER + 1,
    }).success).toBe(false);
  });

  it("uses the same positive safe integer sequence schema for results", () => {
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sequence: Number.MAX_SAFE_INTEGER,
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({ sequence: 0 })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({ sequence: -1 })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({ sequence: 1.5 })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sequence: Number.MAX_SAFE_INTEGER + 1,
    })).success).toBe(false);
  });

  it("rejects duplicate client_event_id values inside one batch", () => {
    const parsed = attendanceOfflineBatchRequestSchema.safeParse(batch({
      events: [
        event({ sequence: 1 }),
        event({ sequence: 2 }),
      ],
    }));

    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.flatten())).toContain("Duplicate client_event_id");
  });

  it("rejects duplicate sequence values inside one submitted device stream", () => {
    const parsed = attendanceOfflineBatchRequestSchema.safeParse(batch({
      events: [
        event({ client_event_id: "00000000-0000-4000-8000-000000000201", sequence: 7 }),
        event({ client_event_id: "00000000-0000-4000-8000-000000000202", sequence: 7 }),
      ],
    }));

    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.flatten())).toContain("Duplicate sequence");
  });

  it.each([
    ["company_id", "00000000-0000-4000-8000-000000000301"],
    ["actor_user_id", "00000000-0000-4000-8000-000000000302"],
    ["employee_id", "00000000-0000-4000-8000-000000000303"],
    ["employee_user_id", "00000000-0000-4000-8000-000000000304"],
    ["subject_employee_user_id", "00000000-0000-4000-8000-000000000305"],
  ])("rejects payload identity field %s", (field, value) => {
    expect(attendanceOfflineBatchRequestSchema.safeParse(batch({ [field]: value })).success).toBe(false);
    expect(attendanceOfflineEventEnvelopeSchema.safeParse({
      ...event(),
      [field]: value,
    }).success).toBe(false);
  });

  it.each(["occurred_at", "server_received_at", "processed_at"])(
    "rejects server-only timestamp %s from requests",
    (field) => {
      expect(attendanceOfflineEventEnvelopeSchema.safeParse({
        ...event(),
        [field]: "2026-08-03T03:45:10.000Z",
      }).success).toBe(false);
    },
  );

  it("rejects server-only fields inside nested location evidence", () => {
    expect(attendanceOfflineBatchRequestSchema.safeParse(batch({
      events: [{
        ...event(),
        location: {
          latitude: 12.971599,
          longitude: 77.594566,
          accuracy_meters: 18,
          captured_at: "2026-08-03T08:59:58.000Z",
          provider: "device",
          permission_state: "granted",
          server_received_at: "2026-08-03T03:45:10.000Z",
        },
      }],
    })).success).toBe(false);
  });

  it("keeps event captured_at and location captured_at separate", () => {
    const parsed = attendanceOfflineEventEnvelopeSchema.parse(event());

    expect(parsed.captured_at).toBe("2026-08-03T09:00:00.000+05:30");
    expect(parsed.location).toMatchObject({
      captured_at: "2026-08-03T08:59:58.000Z",
    });
  });

  it("hashes canonical event content independently of batch_id and transport fields", () => {
    const first = canonicalOfflineAttendanceEventHash({
      ...event(),
      batch_id: "00000000-0000-4000-8000-000000000901",
      server_received_at: "2026-08-03T03:45:10.000Z",
      processed_at: "2026-08-03T03:50:10.000Z",
      response_metadata: { request_id: "req-1" },
    } as AttendanceOfflineEventEnvelope);
    const second = canonicalOfflineAttendanceEventHash({
      ...event(),
      batch_id: "00000000-0000-4000-8000-000000000902",
      server_received_at: "2026-08-03T04:45:10.000Z",
      processed_at: null,
      response_metadata: { request_id: "req-2" },
    } as AttendanceOfflineEventEnvelope);

    expect(first).toBe(second);
  });

  it("offline event hashing uses the shared canonical JSON utility", () => {
    const parsed = event();

    expect(canonicalOfflineAttendanceEventHash(parsed)).toBe(
      canonicalJsonHash(canonicalOfflineAttendanceEventProjection(parsed)),
    );
  });

  it("canonical hashing is independent of object-key order", () => {
    const first = canonicalOfflineAttendanceEventHash(event({
      metadata: {
        network_state: "offline",
        capture_method: "user_action",
        client_timezone: "Asia/Calcutta",
      },
    }));
    const second = canonicalOfflineAttendanceEventHash(event({
      metadata: {
        client_timezone: "Asia/Calcutta",
        capture_method: "user_action",
        network_state: "offline",
      },
    }));

    expect(first).toBe(second);
  });

  it.each([
    ["command kind", { command_kind: "manager_assisted_now" }],
    ["captured_at", { captured_at: "2026-08-03T09:05:00.000+05:30" }],
    ["sequence", { sequence: 43 }],
    ["event_type", { event_type: "check_out" }],
    ["work_mode", { work_mode: "field" }],
    ["allowlisted metadata", {
      metadata: {
        network_state: "offline",
        capture_method: "system_retry",
        client_timezone: "Asia/Calcutta",
      },
    }],
    ["location evidence", {
      location: {
        latitude: 12.97,
        longitude: 77.59,
        accuracy_meters: 35,
        captured_at: "2026-08-03T08:59:58.000Z",
        provider: "device",
        permission_state: "granted",
      },
    }],
  ])("changes the hash when %s changes", (_name, override) => {
    expect(canonicalOfflineAttendanceEventHash(event())).not.toBe(
      canonicalOfflineAttendanceEventHash({
        ...event(),
        ...override,
      } as AttendanceOfflineEventEnvelope),
    );
  });

  it("keeps synchronization and verification statuses separate", () => {
    expect(attendanceOfflineSyncStatusValues).toEqual([
      "accepted",
      "replayed",
      "conflict",
      "rejected",
      "deferred",
    ]);
    expect(attendanceOfflineVerificationStatusValues).toEqual([
      "unverified",
      "review_required",
      "rejected",
    ]);
    expect(attendanceOfflineVerificationStatusValues).not.toContain("accepted");
  });

  it.each(["unverified", "review_required"] as const)(
    "requires %s results to be payroll ineligible",
    (verificationStatus) => {
      const reasonCode =
        verificationStatus === "review_required"
          ? "offline_sync.review_required"
          : "offline_sync.accepted_unverified";

      expect(
        attendanceOfflineSyncResultSchema.parse(
          result({
            verification_status: verificationStatus,
            reason_code: reasonCode,
            payroll_eligible: false,
          }),
        ).payroll_eligible,
      ).toBe(false);

      expect(
        attendanceOfflineSyncResultSchema.safeParse(
          result({
            verification_status: verificationStatus,
            reason_code: reasonCode,
            payroll_eligible: true,
          }),
        ).success,
      ).toBe(false);
    },
  );

  it("makes payroll ineligibility a literal false contract", () => {
    const parsed = attendanceOfflineSyncResultSchema.parse(result({
      payroll_eligible: false,
    }));

    expect(parsed.payroll_eligible).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      payroll_eligible: true,
    })).success).toBe(false);
    expectTypeOf(parsed.payroll_eligible).toEqualTypeOf<false>();
    expectTypeOf<AttendanceOfflineSyncResult["payroll_eligible"]>().toEqualTypeOf<false>();
  });

  it("requires replayed results to carry a consistent replay indicator", () => {
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "replayed",
      replayed: false,
      reason_code: "offline_sync.replayed",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      replayed: true,
      reason_code: "offline_sync.accepted_unverified",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse({
      ...result(),
      replayed: undefined,
    }).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      replayed: false,
      reason_code: "offline_sync.accepted_unverified",
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "replayed",
      replayed: true,
      reason_code: "offline_sync.replayed",
    })).success).toBe(true);
  });

  it("enforces synchronization and verification status compatibility", () => {
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      verification_status: "unverified",
      reason_code: "offline_sync.accepted_unverified",
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      verification_status: "review_required",
      reason_code: "offline_sync.review_required",
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      verification_status: "rejected",
      reason_code: "offline_sync.accepted_unverified",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "conflict",
      verification_status: "rejected",
      reason_code: "offline_sync.changed_body_conflict",
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "conflict",
      verification_status: "review_required",
      reason_code: "offline_sync.changed_body_conflict",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "rejected",
      verification_status: "rejected",
      reason_code: "offline_sync.validation_failed",
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "rejected",
      verification_status: "unverified",
      reason_code: "offline_sync.validation_failed",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "deferred",
      verification_status: "review_required",
      reason_code: "offline_sync.sequence_gap",
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "deferred",
      verification_status: "unverified",
      reason_code: "offline_sync.sequence_gap",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "deferred",
      verification_status: "rejected",
      reason_code: "offline_sync.sequence_gap",
    })).success).toBe(false);
    for (const verification_status of attendanceOfflineVerificationStatusValues) {
      expect(attendanceOfflineSyncResultSchema.safeParse(result({
        sync_status: "replayed",
        verification_status,
        replayed: true,
        reason_code: "offline_sync.replayed",
      })).success).toBe(true);
    }
  });

  it("rejects contradictory reason-code and sync-status pairs", () => {
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      verification_status: "review_required",
      reason_code: "offline_sync.review_required",
    })).success).toBe(true);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      verification_status: "review_required",
      reason_code: "offline_sync.accepted_unverified",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      reason_code: "offline_sync.changed_body_conflict",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "conflict",
      verification_status: "rejected",
      reason_code: "offline_sync.accepted_unverified",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "conflict",
      verification_status: "rejected",
      reason_code: "offline_sync.review_required",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "deferred",
      verification_status: "review_required",
      reason_code: "offline_sync.validation_failed",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      reason_code: "offline_sync.duplicate_sequence",
    })).success).toBe(false);
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      sync_status: "accepted",
      reason_code: null,
    })).success).toBe(true);
  });

  it("response contracts never expose exact coordinates", () => {
    expect(attendanceOfflineSyncResultSchema.safeParse(result({
      latitude: 12.971599,
      longitude: 77.594566,
    })).success).toBe(false);
    expect(attendanceOfflineSyncResponseSchema.safeParse({
      contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
      batch_id: batchId,
      server_received_at: "2026-08-03T03:45:10.000Z",
      results: [result()],
      location: { latitude: 12.971599, longitude: 77.594566 },
    }).success).toBe(false);
  });

  it("documentation-style request and response examples conform to schemas", () => {
    const requestExample = batch();
    const responseExample = {
      contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
      batch_id: batchId,
      server_received_at: "2026-08-03T03:45:10.000Z",
      results: [
        result(),
        result({
          sync_status: "replayed",
          replayed: true,
          reason_code: "offline_sync.replayed",
        }),
        result({
          sync_status: "conflict",
          verification_status: "rejected",
          reason_code: "offline_sync.changed_body_conflict",
        }),
        result({
          client_event_id: "00000000-0000-4000-8000-000000000120",
          sequence: 99,
          sync_status: "deferred",
          verification_status: "review_required",
          reason_code: "offline_sync.sequence_gap",
        }),
      ],
    };

    expect(attendanceOfflineBatchRequestSchema.safeParse(requestExample).success).toBe(true);
    expect(attendanceOfflineSyncResponseSchema.safeParse(responseExample).success).toBe(true);
  });

  it("canonical projection contains only semantic event fields", () => {
    expect(canonicalOfflineAttendanceEventProjection({
      ...event(),
      batch_id: batchId,
      server_received_at: "2026-08-03T03:45:10.000Z",
    } as AttendanceOfflineEventEnvelope)).toEqual({
      client_event_id: eventId,
      sequence: 42,
      command_kind: "employee_manual_now",
      captured_at: "2026-08-03T09:00:00.000+05:30",
      source: "mobile",
      event_type: "check_in",
      work_mode: "office",
      metadata: {
        network_state: "offline",
        capture_method: "user_action",
        client_timezone: "Asia/Calcutta",
      },
      location: {
        latitude: 12.971599,
        longitude: 77.594566,
        accuracy_meters: 18,
        captured_at: "2026-08-03T08:59:58.000Z",
        provider: "device",
        permission_state: "granted",
      },
    });
  });
});
