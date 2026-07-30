export const ATTENDANCE_WORK_MODES = ["office", "remote", "wfh", "field"] as const;

export type AttendanceWorkMode = (typeof ATTENDANCE_WORK_MODES)[number];
export type AttendanceSourceChannel = "web" | "mobile" | "kiosk";

export const BROWSER_ATTENDANCE_SOURCE = "web" as const satisfies AttendanceSourceChannel;

const WORK_MODE_LABELS: Record<AttendanceWorkMode, string> = {
  office: "Office",
  remote: "Remote",
  wfh: "WFH",
  field: "Field",
};

export function parseAttendanceWorkMode(value: unknown): AttendanceWorkMode | undefined {
  return typeof value === "string" && ATTENDANCE_WORK_MODES.includes(value as AttendanceWorkMode)
    ? (value as AttendanceWorkMode)
    : undefined;
}

export function attendanceWorkModeLabel(value: unknown): string | undefined {
  const mode = parseAttendanceWorkMode(value);
  return mode ? WORK_MODE_LABELS[mode] : undefined;
}
