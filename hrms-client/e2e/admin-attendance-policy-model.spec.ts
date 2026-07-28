import { expect, test } from "@playwright/test";
import {
  attendancePoliciesEqual,
  validateAttendancePolicy,
} from "../src/domains/admin/attendance-policy-model";
import type { PolicyAttendance } from "../src/lib/admin-settings-store";

const validPolicy: PolicyAttendance = {
  graceMinutes: 10,
  halfDayAfterMinutes: 240,
  autoMarkAbsentMinutes: 480,
  allowRegularization: true,
  attendanceMode: "manual_only",
  fallbackApprovalMode: "disabled",
  regularizationMode: "approval_required",
  fullDayPunchWindow: true,
  punchInStart: "09:00",
  punchInEnd: "11:00",
  punchOutStart: "17:00",
  punchOutEnd: "23:59",
  autoPunchOutEnabled: true,
  autoPunchOutTime: "23:59",
  allowOffDayPunches: false,
};

test.describe("attendance policy model", () => {
  test("accepts a valid production policy", () => {
    expect(validateAttendancePolicy(validPolicy)).toEqual([]);
  });

  test("rejects contradictory modes and invalid thresholds", () => {
    const errors = validateAttendancePolicy({
      ...validPolicy,
      graceMinutes: -1,
      halfDayAfterMinutes: 600,
      autoMarkAbsentMinutes: 480,
      fallbackApprovalMode: "approval_required",
      allowRegularization: false,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "Grace minutes must be a whole number from 0 to 1440.",
        "Half-day threshold cannot be greater than the auto-absent threshold.",
        "Manual-only attendance cannot enable a location fallback.",
        "Regularization availability and approval mode must be consistent.",
      ]),
    );
  });

  test("detects draft changes", () => {
    expect(attendancePoliciesEqual(validPolicy, { ...validPolicy })).toBe(true);
    expect(
      attendancePoliciesEqual(validPolicy, {
        ...validPolicy,
        attendanceMode: "geo_optional",
      }),
    ).toBe(false);
  });
});
