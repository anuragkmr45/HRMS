import { describe, expect, it } from "vitest";
import { isAttendanceSessionSingleOpenViolation } from "../command-service.js";

describe("attendance session unique constraint classification", () => {
  it("classifies only the single-open-session index violation", () => {
    expect(
      isAttendanceSessionSingleOpenViolation({
        code: "23505",
        constraint: "attendance_sessions_single_open_idx",
      }),
    ).toBe(true);
    expect(
      isAttendanceSessionSingleOpenViolation({
        code: "23505",
        constraint: "attendance_punch_command_unique_idx",
      }),
    ).toBe(false);
    expect(
      isAttendanceSessionSingleOpenViolation({
        code: "23503",
        constraint: "attendance_sessions_single_open_idx",
      }),
    ).toBe(false);
  });
});
