import { describe, expect, it } from "vitest";
import { canonicalAttendanceRequestHash } from "../command-service.js";

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
    expect(canonicalAttendanceRequestHash(command)).toBe(canonicalAttendanceRequestHash({ ...command, metadata: { location: "office", device: { version: 1, os: "android" } } }));
  });

  it("changes when the effective command changes", () => {
    expect(canonicalAttendanceRequestHash(command)).not.toBe(canonicalAttendanceRequestHash({ ...command, event_type: "check_out" }));
  });
});
