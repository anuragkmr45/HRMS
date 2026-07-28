import type { UUID } from "#shared";
import type {
  AttendanceApprovalMode,
  AttendanceGeoPolicyAction,
  AttendanceMode,
  EffectiveAttendancePolicy,
} from "./policy-config.js";

export const AttendanceGeoDecisionReasonCodes = {
  GeoNotRequired: "geo_not_required",
  GeoEvidenceMissing: "geo_evidence_missing",
  GeoPermissionDenied: "geo_permission_denied",
  GeoLocationUnavailable: "geo_location_unavailable",
  GeoFenceNotConfigured: "geo_fence_not_configured",
  GeoInsideFence: "geo_inside_fence",
  GeoOutsideFence: "geo_outside_fence",
  GeoPolicyModeUnknown: "geo_policy_mode_unknown",
  GeoActionUnknown: "geo_action_unknown",
  GeoManualFallbackAllowed: "geo_manual_fallback_allowed",
  GeoManualFallbackDisallowed: "geo_manual_fallback_disallowed",
} as const;

export type AttendanceGeoDecisionReasonCode =
  (typeof AttendanceGeoDecisionReasonCodes)[keyof typeof AttendanceGeoDecisionReasonCodes];

export type AttendanceGeoFactualOutcome =
  | "not_required"
  | "inside_fence"
  | "outside_fence"
  | "missing"
  | "permission_denied"
  | "location_unavailable"
  | "fence_not_configured";

export interface AttendanceGeoFenceReference {
  geofenceId: UUID;
  geofenceVersionId: UUID;
  workSiteId: UUID;
  versionNumber: number;
  shapeType: "circle" | "polygon";
  effectiveFrom: string;
  effectiveUntil: string | null;
  canonicalHash: string;
}

export interface AttendanceGeoEvaluationInput {
  policy: Pick<
    EffectiveAttendancePolicy,
    | "attendanceMode"
    | "fallbackApprovalMode"
    | "locationUnavailableAction"
    | "permissionDeniedAction"
    | "outsideFenceAction"
    | "effectiveGeofenceId"
    | "policyVersion"
    | "policyVersionId"
    | "policyVersionNumber"
  >;
  locationStatus:
    | { kind: "missing" }
    | { kind: "permission_denied" }
    | { kind: "location_unavailable" }
    | { kind: "coordinates"; fence: { configured: false } | { configured: true; inside: boolean; reference: AttendanceGeoFenceReference } };
}

export interface AttendanceGeoDecisionReason {
  reasonCode: AttendanceGeoDecisionReasonCode;
  category: "geo_policy";
  severity: "info" | "error";
  details: Record<string, unknown>;
}

export interface AttendanceGeoDecision {
  allowed: boolean;
  factualOutcome: AttendanceGeoFactualOutcome;
  selectedAction: AttendanceGeoPolicyAction;
  fallbackUsed: boolean;
  reasonCode: AttendanceGeoDecisionReasonCode;
  reasonDetail: string;
  geofence: AttendanceGeoFenceReference | null;
  reasons: AttendanceGeoDecisionReason[];
}

const validModes = new Set(["manual_only", "geo_optional", "geo_required", "geo_preferred"]);
const validActions = new Set(["allow", "deny", "manual_fallback"]);

export function evaluateAttendanceGeoPolicy(
  input: AttendanceGeoEvaluationInput,
): AttendanceGeoDecision {
  const mode = input.policy.attendanceMode;
  if (!validModes.has(mode)) {
    return denied(
      "fence_not_configured",
      "deny",
      AttendanceGeoDecisionReasonCodes.GeoPolicyModeUnknown,
      "Attendance geo policy mode is not supported.",
      null,
      [{ policy_mode: mode }],
    );
  }

  if (mode === "manual_only") {
    return allowed(
      "not_required",
      "allow",
      false,
      AttendanceGeoDecisionReasonCodes.GeoNotRequired,
      "Geo evidence is not required by the resolved attendance policy.",
      null,
    );
  }

  const located = factualOutcome(input.locationStatus);
  const factual = located.outcome;
  const geofence = located.geofence;
  const reasonCode = factualReasonCode(factual);

  if (factual === "inside_fence") {
    return allowed(
      factual,
      "allow",
      false,
      reasonCode,
      "Location evidence is inside the effective geofence.",
      geofence,
    );
  }

  if (factual === "fence_not_configured") {
    if (mode === "geo_optional") {
      return allowed(
        factual,
        "allow",
        false,
        reasonCode,
        "No effective geofence is configured; geo-optional policy allows attendance.",
        geofence,
      );
    }
    return denied(
      factual,
      "deny",
      reasonCode,
      "No effective geofence is configured for the resolved attendance policy.",
      geofence,
    );
  }

  const action = selectedActionFor(mode as AttendanceMode, factual, input.policy);
  if (!validActions.has(action)) {
    return denied(
      factual,
      "deny",
      AttendanceGeoDecisionReasonCodes.GeoActionUnknown,
      "Attendance geo policy action is not supported.",
      geofence,
      [{ factual_reason_code: reasonCode, configured_action: action }],
    );
  }
  const selectedAction = action as AttendanceGeoPolicyAction;

  if (selectedAction === "allow") {
    return allowed(
      factual,
      selectedAction,
      false,
      reasonCode,
      reasonDetailFor(factual, "allowed by policy."),
      geofence,
    );
  }

  if (selectedAction === "manual_fallback") {
    if (input.policy.fallbackApprovalMode === "approval_required") {
      return allowed(
        factual,
        selectedAction,
        true,
        reasonCode,
        reasonDetailFor(factual, "accepted through explicit manual fallback policy."),
        geofence,
        AttendanceGeoDecisionReasonCodes.GeoManualFallbackAllowed,
      );
    }
    const result = decision(
      false,
      factual,
      selectedAction,
      false,
      reasonCode,
      reasonDetailFor(factual, "manual fallback is disabled by the resolved policy."),
      geofence,
      AttendanceGeoDecisionReasonCodes.GeoManualFallbackDisallowed,
    );
    result.reasonCode = AttendanceGeoDecisionReasonCodes.GeoManualFallbackDisallowed;
    result.reasons[1]!.severity = "error";
    return result;
  }

  return denied(
    factual,
    selectedAction,
    reasonCode,
    reasonDetailFor(factual, "denied by policy."),
    geofence,
  );
}

function selectedActionFor(
  mode: AttendanceMode,
  factual: AttendanceGeoFactualOutcome,
  policy: {
    locationUnavailableAction: string;
    permissionDeniedAction: string;
    outsideFenceAction: string;
    fallbackApprovalMode: AttendanceApprovalMode;
  },
): string {
  if (mode === "geo_optional" && (factual === "missing" || factual === "permission_denied" || factual === "location_unavailable")) {
    return "allow";
  }
  if (factual === "permission_denied") return policy.permissionDeniedAction;
  if (factual === "outside_fence") return policy.outsideFenceAction;
  return policy.locationUnavailableAction;
}

function factualOutcome(
  status: AttendanceGeoEvaluationInput["locationStatus"],
): { outcome: AttendanceGeoFactualOutcome; geofence: AttendanceGeoFenceReference | null } {
  if (status.kind === "missing") return { outcome: "missing", geofence: null };
  if (status.kind === "permission_denied") return { outcome: "permission_denied", geofence: null };
  if (status.kind === "location_unavailable") return { outcome: "location_unavailable", geofence: null };
  if (!status.fence.configured) return { outcome: "fence_not_configured", geofence: null };
  return {
    outcome: status.fence.inside ? "inside_fence" : "outside_fence",
    geofence: status.fence.reference,
  };
}

function factualReasonCode(
  factual: AttendanceGeoFactualOutcome,
): AttendanceGeoDecisionReasonCode {
  switch (factual) {
    case "not_required":
      return AttendanceGeoDecisionReasonCodes.GeoNotRequired;
    case "inside_fence":
      return AttendanceGeoDecisionReasonCodes.GeoInsideFence;
    case "outside_fence":
      return AttendanceGeoDecisionReasonCodes.GeoOutsideFence;
    case "missing":
      return AttendanceGeoDecisionReasonCodes.GeoEvidenceMissing;
    case "permission_denied":
      return AttendanceGeoDecisionReasonCodes.GeoPermissionDenied;
    case "location_unavailable":
      return AttendanceGeoDecisionReasonCodes.GeoLocationUnavailable;
    case "fence_not_configured":
      return AttendanceGeoDecisionReasonCodes.GeoFenceNotConfigured;
  }
}

function allowed(
  factualOutcome: AttendanceGeoFactualOutcome,
  selectedAction: AttendanceGeoPolicyAction,
  fallbackUsed: boolean,
  reasonCode: AttendanceGeoDecisionReasonCode,
  reasonDetail: string,
  geofence: AttendanceGeoFenceReference | null,
  fallbackReasonCode?: AttendanceGeoDecisionReasonCode,
): AttendanceGeoDecision {
  return decision(true, factualOutcome, selectedAction, fallbackUsed, reasonCode, reasonDetail, geofence, fallbackReasonCode);
}

function denied(
  factualOutcome: AttendanceGeoFactualOutcome,
  selectedAction: AttendanceGeoPolicyAction,
  reasonCode: AttendanceGeoDecisionReasonCode,
  reasonDetail: string,
  geofence: AttendanceGeoFenceReference | null,
  extraDetails: Array<Record<string, unknown>> = [],
): AttendanceGeoDecision {
  const result = decision(false, factualOutcome, selectedAction, false, reasonCode, reasonDetail, geofence);
  for (const [index, details] of extraDetails.entries()) {
    Object.assign(result.reasons[index]?.details ?? {}, details);
  }
  return result;
}

function decision(
  allowedValue: boolean,
  factualOutcome: AttendanceGeoFactualOutcome,
  selectedAction: AttendanceGeoPolicyAction,
  fallbackUsed: boolean,
  reasonCode: AttendanceGeoDecisionReasonCode,
  reasonDetail: string,
  geofence: AttendanceGeoFenceReference | null,
  fallbackReasonCode?: AttendanceGeoDecisionReasonCode,
): AttendanceGeoDecision {
  const details = {
    factual_outcome: factualOutcome,
    selected_action: selectedAction,
    fallback_used: fallbackUsed,
    geofence_id: geofence?.geofenceId ?? null,
    geofence_version_id: geofence?.geofenceVersionId ?? null,
    reason_detail: reasonDetail,
  };
  const reasons: AttendanceGeoDecisionReason[] = [
    {
      reasonCode,
      category: "geo_policy",
      severity: allowedValue ? "info" : "error",
      details,
    },
  ];
  if (fallbackReasonCode) {
    reasons.push({
      reasonCode: fallbackReasonCode,
      category: "geo_policy",
      severity: "info",
      details,
    });
  }
  return {
    allowed: allowedValue,
    factualOutcome,
    selectedAction,
    fallbackUsed,
    reasonCode,
    reasonDetail,
    geofence,
    reasons,
  };
}

function reasonDetailFor(
  factual: AttendanceGeoFactualOutcome,
  suffix: string,
): string {
  const prefix =
    factual === "missing"
      ? "Location evidence is missing"
      : factual === "permission_denied"
        ? "Location permission was denied"
        : factual === "location_unavailable"
          ? "Location is unavailable"
          : factual === "outside_fence"
            ? "Location evidence is outside the effective geofence"
            : "No effective geofence is configured";
  return `${prefix}; ${suffix}`;
}
