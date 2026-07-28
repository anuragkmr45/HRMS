import type { PolicyAttendance } from "@/lib/admin-settings-store";

export function validateAttendancePolicy(value: PolicyAttendance): string[] {
  const errors: string[] = [];
  const minuteFields: Array<[string, number]> = [
    ["Grace minutes", value.graceMinutes],
    ["Half-day threshold", value.halfDayAfterMinutes],
    ["Auto-absent threshold", value.autoMarkAbsentMinutes],
  ];

  for (const [label, fieldValue] of minuteFields) {
    if (!Number.isInteger(fieldValue) || fieldValue < 0 || fieldValue > 1440) {
      errors.push(`${label} must be a whole number from 0 to 1440.`);
    }
  }

  if (value.halfDayAfterMinutes > value.autoMarkAbsentMinutes) {
    errors.push("Half-day threshold cannot be greater than the auto-absent threshold.");
  }

  if (!value.fullDayPunchWindow) {
    const timeFields: Array<[string, string]> = [
      ["Punch-in start", value.punchInStart],
      ["Punch-in end", value.punchInEnd],
      ["Punch-out start", value.punchOutStart],
      ["Punch-out end", value.punchOutEnd],
    ];
    for (const [label, fieldValue] of timeFields) {
      if (!isTime(fieldValue)) errors.push(`${label} must use a valid 24-hour time.`);
    }
  }

  if (value.autoPunchOutEnabled && !isTime(value.autoPunchOutTime)) {
    errors.push("Auto punch-out time must use a valid 24-hour time.");
  }
  if (value.attendanceMode === "manual_only" && value.fallbackApprovalMode !== "disabled") {
    errors.push("Manual-only attendance cannot enable a location fallback.");
  }
  if (value.allowRegularization !== (value.regularizationMode === "approval_required")) {
    errors.push("Regularization availability and approval mode must be consistent.");
  }

  return errors;
}

export function attendancePoliciesEqual(left: PolicyAttendance, right: PolicyAttendance): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}
