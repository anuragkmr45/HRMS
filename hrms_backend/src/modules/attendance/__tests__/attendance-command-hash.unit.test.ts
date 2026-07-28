import { describe, expect, it } from "vitest";
import {
  canonicalAttendanceRequestHash,
  canonicalAttendanceResponseHash,
} from "../command-service.js";
import type { CreateAttendanceDecisionInput } from "../command-repository.js";
import { attendanceLocationEvidenceSchema } from "#shared";

function acceptCommandDecisionReason(
  _reasonCode: CreateAttendanceDecisionInput["reasonCode"],
): void {}

describe("attendance command request hashing", () => {
  const command = {
    company_id: "11111111-1111-4111-8111-111111111111",
    actor_user_id: "22222222-2222-4222-8222-222222222222",
    event_type: "check_in",
    occurred_at: "2026-07-14T04:00:00.000Z",
    work_mode: "office",
    source: "web",
    metadata: { device: { os: "android", version: 1 }, location: "office" },
  };

  it("is stable for the same effective request and nested metadata ordering", () => {
    expect(canonicalAttendanceRequestHash(command)).toBe(
      canonicalAttendanceRequestHash({
        ...command,
        metadata: { location: "office", device: { version: 1, os: "android" } },
      }),
    );
  });

  it("changes when the effective command changes", () => {
    expect(canonicalAttendanceRequestHash(command)).not.toBe(
      canonicalAttendanceRequestHash({ ...command, event_type: "check_out" }),
    );
  });

  it("preserves array order while canonicalizing nested object keys", () => {
    const first = canonicalAttendanceRequestHash({
      ...command,
      metadata: {
        locations: ["office", "home"],
        device: { version: 1, os: "android" },
      },
    });
    const reorderedObject = canonicalAttendanceRequestHash({
      ...command,
      metadata: {
        device: { os: "android", version: 1 },
        locations: ["office", "home"],
      },
    });
    const reorderedArray = canonicalAttendanceRequestHash({
      ...command,
      metadata: {
        locations: ["home", "office"],
        device: { os: "android", version: 1 },
      },
    });

    expect(first).toBe(reorderedObject);
    expect(first).not.toBe(reorderedArray);
  });

  it("keeps an omitted occurred_at stable across retries", () => {
    const firstRequest = { ...command, occurred_at: null };
    const retryRequest = {
      ...command,
      occurred_at: null,
      metadata: { location: "office", device: { version: 1, os: "android" } },
    };
    expect(canonicalAttendanceRequestHash(firstRequest)).toBe(
      canonicalAttendanceRequestHash(retryRequest),
    );
    expect(canonicalAttendanceRequestHash(firstRequest)).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it("matches JSON persistence semantics for dates and nested key ordering", () => {
    const response = {
      command_id: "command",
      punch: {
        id: "punch",
        occurred_at: new Date("2026-07-14T04:00:00.000Z"),
        metadata: { b: 2, a: 1 },
      },
    };
    const persisted = JSON.parse(JSON.stringify(response)) as Record<
      string,
      unknown
    >;
    const reordered = {
      punch: {
        metadata: { a: 1, b: 2 },
        occurred_at: "2026-07-14T04:00:00.000Z",
        id: "punch",
      },
      command_id: "command",
    };

    expect(canonicalAttendanceResponseHash(response)).toBe(
      canonicalAttendanceResponseHash(persisted),
    );
    expect(canonicalAttendanceResponseHash(response)).toBe(
      canonicalAttendanceResponseHash(reordered),
    );
    expect(canonicalAttendanceResponseHash(response)).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it("keeps response array order significant", () => {
    expect(
      canonicalAttendanceResponseHash({ events: ["check_in", "check_out"] }),
    ).not.toBe(
      canonicalAttendanceResponseHash({ events: ["check_out", "check_in"] }),
    );
  });
});

describe("attendance command decision reason typing", () => {
  it("accepts stable command and geo reason codes only", () => {
    acceptCommandDecisionReason("geo_evidence_missing");
    acceptCommandDecisionReason("policy_window_rejected");
    acceptCommandDecisionReason(null);

    // @ts-expect-error arbitrary reason codes must not cross the repository boundary.
    acceptCommandDecisionReason("arbitrary_reason");
  });
});

describe("attendance location evidence request schema", () => {
  const point = {
    latitude: 12.971599,
    longitude: 77.594566,
    accuracy_meters: 8.5,
    captured_at: "2026-07-14T04:00:00.000Z",
    provider: "browser",
  };

  it("accepts granted or unknown permission states for point evidence", () => {
    expect(
      attendanceLocationEvidenceSchema.safeParse({
        ...point,
        permission_state: "granted",
      }).success,
    ).toBe(true);
    expect(
      attendanceLocationEvidenceSchema.safeParse({
        ...point,
        permission_state: "unknown",
      }).success,
    ).toBe(true);
  });

  it("rejects denied or unavailable permission states for point evidence", () => {
    expect(
      attendanceLocationEvidenceSchema.safeParse({
        ...point,
        permission_state: "denied",
      }).success,
    ).toBe(false);
    expect(
      attendanceLocationEvidenceSchema.safeParse({
        ...point,
        permission_state: "unavailable",
      }).success,
    ).toBe(false);
  });

  it("accepts denied or unavailable location evidence without coordinates", () => {
    expect(
      attendanceLocationEvidenceSchema.safeParse({
        permission_state: "denied",
        provider: "browser",
      }).success,
    ).toBe(true);
    expect(
      attendanceLocationEvidenceSchema.safeParse({
        permission_state: "unavailable",
        captured_at: "2026-07-14T04:00:00.000Z",
        age_ms: 60_000,
      }).success,
    ).toBe(true);
  });
});
