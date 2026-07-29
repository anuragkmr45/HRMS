import type { UUID } from "#shared";

export const InvalidAttendanceMode = "__invalid_attendance_mode";
export const InvalidAttendanceGeoPolicyAction = "__invalid_geo_policy_action";

export type AttendanceMode =
  | "manual_only"
  | "geo_optional"
  | "geo_required"
  | "geo_preferred"
  | typeof InvalidAttendanceMode;
export type AttendanceApprovalMode = "disabled" | "approval_required";
export type AttendanceGeoPolicyAction = "allow" | "deny" | "manual_fallback";
export type NormalizedAttendanceGeoPolicyAction =
  | AttendanceGeoPolicyAction
  | typeof InvalidAttendanceGeoPolicyAction;
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
  locationUnavailableAction: NormalizedAttendanceGeoPolicyAction;
  permissionDeniedAction: NormalizedAttendanceGeoPolicyAction;
  outsideFenceAction: NormalizedAttendanceGeoPolicyAction;
  boundaryUncertainAction: NormalizedAttendanceGeoPolicyAction;
  staleEvidenceAction: NormalizedAttendanceGeoPolicyAction;
  accuracyExceededAction: NormalizedAttendanceGeoPolicyAction;
  effectiveGeofenceId: UUID | null;
  effectiveGeofenceIds: UUID[];
  geofenceGraceMeters: number;
  maxLocationAgeMs: number | null;
  maxAccuracyMeters: number | null;
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
  locationUnavailableAction: "allow",
  permissionDeniedAction: "allow",
  outsideFenceAction: "allow",
  boundaryUncertainAction: "allow",
  staleEvidenceAction: "allow",
  accuracyExceededAction: "allow",
  effectiveGeofenceId: null,
  effectiveGeofenceIds: [],
  geofenceGraceMeters: 0,
  maxLocationAgeMs: null,
  maxAccuracyMeters: null,
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
  const effectiveGeofenceId = uuidConfig(config, "effectiveGeofenceId", "effective_geofence_id");
  const locationUnavailableAction = geoActionConfig(
    config,
    "locationUnavailableAction",
    "location_unavailable_action",
    actionDefault(config, "locationUnavailableAction", "location_unavailable_action"),
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
    attendanceMode: attendanceModeConfig(config),
    fallbackApprovalMode: enumConfig(config, "fallbackApprovalMode", ["disabled", "approval_required"], defaultAttendancePolicyConfig.fallbackApprovalMode),
    regularizationMode: enumConfig(
      config,
      "regularizationMode",
      ["disabled", "approval_required"],
      allowRegularization ? "approval_required" : "disabled",
    ),
    locationUnavailableAction,
    permissionDeniedAction: geoActionConfig(
      config,
      "permissionDeniedAction",
      "permission_denied_action",
      actionDefault(config, "permissionDeniedAction", "permission_denied_action"),
    ),
    outsideFenceAction: geoActionConfig(
      config,
      "outsideFenceAction",
      "outside_fence_action",
      actionDefault(config, "outsideFenceAction", "outside_fence_action"),
    ),
    boundaryUncertainAction: geoActionConfig(config, "boundaryUncertainAction", "boundary_uncertain_action", locationUnavailableAction),
    staleEvidenceAction: geoActionConfig(config, "staleEvidenceAction", "stale_evidence_action", locationUnavailableAction),
    accuracyExceededAction: geoActionConfig(config, "accuracyExceededAction", "accuracy_exceeded_action", locationUnavailableAction),
    effectiveGeofenceId,
    effectiveGeofenceIds: uuidListConfig(config, effectiveGeofenceId),
    geofenceGraceMeters: numberAliasConfig(config, "geofenceGraceMeters", "geofence_grace_meters", defaultAttendancePolicyConfig.geofenceGraceMeters),
    maxLocationAgeMs: positiveIntegerOrNullConfig(config, "maxLocationAgeMs", "max_location_age_ms"),
    maxAccuracyMeters: positiveNumberOrNullConfig(config, "maxAccuracyMeters", "max_accuracy_meters"),
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

function numberAliasConfig(
  config: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback: number,
): number {
  const value = config[camelKey] ?? config[snakeKey];
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

function geoActionConfig(
  config: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback: NormalizedAttendanceGeoPolicyAction,
): NormalizedAttendanceGeoPolicyAction {
  const value = config[camelKey] ?? config[snakeKey];
  if (camelKey in config || snakeKey in config) {
    return typeof value === "string" && ["allow", "deny", "manual_fallback"].includes(value)
      ? (value as AttendanceGeoPolicyAction)
      : InvalidAttendanceGeoPolicyAction;
  }
  return typeof value === "string" && ["allow", "deny", "manual_fallback"].includes(value)
    ? (value as AttendanceGeoPolicyAction)
    : fallback;
}

function attendanceModeConfig(config: Record<string, unknown>): AttendanceMode {
  if (!("attendanceMode" in config)) return defaultAttendancePolicyConfig.attendanceMode;
  const value = config["attendanceMode"];
  return typeof value === "string" && ["manual_only", "geo_optional", "geo_required", "geo_preferred"].includes(value)
    ? (value as AttendanceMode)
    : InvalidAttendanceMode;
}

function actionDefault(
  config: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): AttendanceGeoPolicyAction {
  if (camelKey in config || snakeKey in config) return "deny";
  const mode = enumConfig(
    config,
    "attendanceMode",
    ["manual_only", "geo_optional", "geo_required", "geo_preferred"],
    defaultAttendancePolicyConfig.attendanceMode,
  );
  return mode === "geo_required" || mode === "geo_preferred" ? "deny" : "allow";
}

function uuidConfig(
  config: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): UUID | null {
  const value = config[camelKey] ?? config[snakeKey];
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null;
}

function uuidListConfig(
  config: Record<string, unknown>,
  fallbackGeofenceId: UUID | null,
): UUID[] {
  const value = config["effectiveGeofenceIds"] ?? config["effective_geofence_ids"];
  const source =
    Array.isArray(value) && value.length > 0
      ? value
      : fallbackGeofenceId
        ? [fallbackGeofenceId]
        : [];
  const unique = new Set<UUID>();
  for (const item of source) {
    if (
      typeof item === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(item.trim())
    ) {
      unique.add(item.trim() as UUID);
    }
  }
  return [...unique];
}

function positiveIntegerOrNullConfig(
  config: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): number | null {
  const value = config[camelKey] ?? config[snakeKey];
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function positiveNumberOrNullConfig(
  config: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): number | null {
  const value = config[camelKey] ?? config[snakeKey];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
