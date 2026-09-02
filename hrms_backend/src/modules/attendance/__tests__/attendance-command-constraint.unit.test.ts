import { describe, expect, it } from "vitest";
import {
  attendanceTransitionConflict,
  isAttendanceSessionSingleOpenViolation,
} from "../command-service.js";

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

describe("attendance break constraint classification", () => {
  it.each([
    [
      { code: "23505", constraint: "attendance_break_segments_single_active_idx" },
      "break_already_started",
    ],
    [
      { code: "23503", constraint: "attendance_break_segments_session_company_fk" },
      "session_ownership_invalid",
    ],
    [
      { code: "23514", message: "attendance break segment requires an open session" },
      "no_open_session",
    ],
    [
      { code: "23514", message: "completed attendance session cannot retain an active break" },
      "open_break_must_end",
    ],
  ])("maps %j to a workflow conflict", (error, reasonCode) => {
    expect(attendanceTransitionConflict(error)).toMatchObject({
      statusCode: 409,
      details: { reason_code: reasonCode },
    });
  });
});
