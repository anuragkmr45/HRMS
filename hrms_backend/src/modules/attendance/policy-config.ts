import type { UUID } from "#shared";

export type AttendanceMode = "manual_only" | "geo_optional" | "geo_required";
export type AttendanceApprovalMode = "disabled" | "approval_required";
export type AttendancePolicySource = "assignment" | "built_in";
export type AttendanceAssignmentScopeType = "employee" | "department" | "company" | "built_in";

export interface NormalizedAttendancePolicyConfig {
  graceMinutes: number;
  halfDayAfterMinutes: number;
  autoMarkAbsentMinutes: number;
  allowRegularization: boolean;
  fullDayPunchWindow: boolean;
  punchInStart: string;
  punchInEnd: string;
  punchOutStart: string;
  punchOutEnd: string;
  autoPunchOutEnabled: boolean;
  autoPunchOutTime: string;
  allowOffDayPunches: boolean;
  attendanceMode: AttendanceMode;
  fallbackApprovalMode: AttendanceApprovalMode;
  regularizationMode: AttendanceApprovalMode;
}

export interface EffectiveAttendancePolicy extends NormalizedAttendancePolicyConfig, Record<string, unknown> {
  schemaVersion: 1;
  resolverVersion: "attendance-policy-resolver-v1";
  source: AttendancePolicySource;
  asOf: string;
  policyKey: "attendance";
  policyId: UUID | null;
  policyVersionId: UUID | null;
  policyVersionNumber: number | null;
  legacyPolicyVersion: string;
  policyVersion: string;
  assignmentId: UUID | null;
  assignmentScopeType: AttendanceAssignmentScopeType;
  assignmentScopeId: UUID | null;
  scopeRank: number;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  config: NormalizedAttendancePolicyConfig;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/u;

const defaultAttendancePolicyConfig: NormalizedAttendancePolicyConfig = {
  graceMinutes: 10,
  halfDayAfterMinutes: 240,
  autoMarkAbsentMinutes: 480,
  allowRegularization: true,
  fullDayPunchWindow: true,
  punchInStart: "09:00",
  punchInEnd: "11:00",
  punchOutStart: "17:00",
  punchOutEnd: "23:59",
  autoPunchOutEnabled: true,
  autoPunchOutTime: "23:59",
  allowOffDayPunches: false,
  attendanceMode: "manual_only",
  fallbackApprovalMode: "disabled",
  regularizationMode: "approval_required",
};

export function normalizeAttendancePolicyConfig(
  value: Record<string, unknown> | null | undefined,
): NormalizedAttendancePolicyConfig {
  const config = value ?? {};
  const allowRegularization = booleanConfig(
    config,
    "allowRegularization",
    defaultAttendancePolicyConfig.allowRegularization,
  );
  return {
    graceMinutes: numberConfig(config, "graceMinutes", defaultAttendancePolicyConfig.graceMinutes),
    halfDayAfterMinutes: numberConfig(config, "halfDayAfterMinutes", defaultAttendancePolicyConfig.halfDayAfterMinutes),
    autoMarkAbsentMinutes: numberConfig(config, "autoMarkAbsentMinutes", defaultAttendancePolicyConfig.autoMarkAbsentMinutes),
    allowRegularization,
    fullDayPunchWindow: booleanConfig(config, "fullDayPunchWindow", defaultAttendancePolicyConfig.fullDayPunchWindow),
    punchInStart: timeConfig(config, "punchInStart", defaultAttendancePolicyConfig.punchInStart),
    punchInEnd: timeConfig(config, "punchInEnd", defaultAttendancePolicyConfig.punchInEnd),
    punchOutStart: timeConfig(config, "punchOutStart", defaultAttendancePolicyConfig.punchOutStart),
    punchOutEnd: timeConfig(config, "punchOutEnd", defaultAttendancePolicyConfig.punchOutEnd),
    autoPunchOutEnabled: booleanConfig(config, "autoPunchOutEnabled", defaultAttendancePolicyConfig.autoPunchOutEnabled),
    autoPunchOutTime: timeConfig(config, "autoPunchOutTime", defaultAttendancePolicyConfig.autoPunchOutTime),
    allowOffDayPunches: booleanConfig(config, "allowOffDayPunches", defaultAttendancePolicyConfig.allowOffDayPunches),
    attendanceMode: enumConfig(config, "attendanceMode", ["manual_only", "geo_optional", "geo_required"], defaultAttendancePolicyConfig.attendanceMode),
    fallbackApprovalMode: enumConfig(config, "fallbackApprovalMode", ["disabled", "approval_required"], defaultAttendancePolicyConfig.fallbackApprovalMode),
    regularizationMode: enumConfig(
      config,
      "regularizationMode",
      ["disabled", "approval_required"],
      allowRegularization ? "approval_required" : "disabled",
    ),
  };
}

export function builtInAttendancePolicy(asOf: string): EffectiveAttendancePolicy {
  const config = normalizeAttendancePolicyConfig({});
  return {
    schemaVersion: 1,
    resolverVersion: "attendance-policy-resolver-v1",
    source: "built_in",
    asOf,
    policyKey: "attendance",
    policyId: null,
    policyVersionId: null,
    policyVersionNumber: null,
    legacyPolicyVersion: "built-in-default",
    policyVersion: "built-in-default",
    assignmentId: null,
    assignmentScopeType: "built_in",
    assignmentScopeId: null,
    scopeRank: 0,
    effectiveFrom: null,
    effectiveUntil: null,
    config,
    ...config,
  };
}

function numberConfig(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function booleanConfig(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof config[key] === "boolean" ? config[key] : fallback;
}

function timeConfig(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && timePattern.test(value.trim()) ? value.trim() : fallback;
}

function enumConfig<T extends string>(
  config: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = config[key];
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}
