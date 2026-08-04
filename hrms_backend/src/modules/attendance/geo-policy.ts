import type { AttendanceGeoDecisionReasonCode, UUID } from "#shared";
import { AttendanceGeoDecisionReasonCodes as SharedAttendanceGeoDecisionReasonCodes } from "#shared";
import type {
  AttendanceApprovalMode,
  AttendanceGeoPolicyAction,
  AttendanceMode,
  EffectiveAttendancePolicy,
} from "./policy-config.js";

export const AttendanceGeoDecisionReasonCodes = SharedAttendanceGeoDecisionReasonCodes;
export type { AttendanceGeoDecisionReasonCode };

export type AttendanceGeoFactualOutcome =
  | "not_required"
  | "inside_confident"
  | "outside_confident"
  | "boundary_uncertain"
  | "stale_evidence"
  | "accuracy_exceeded"
  | "missing"
  | "permission_denied"
  | "location_unavailable"
  | "fence_not_configured";

export type AttendanceGeoSpatialCategory =
  | "inside_confident"
  | "outside_confident"
  | "boundary_uncertain";

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

export interface AttendanceGeoSafeEvaluation {
  category: AttendanceGeoSpatialCategory;
  evaluator_version: string;
  candidate_count: number;
  valid_candidate_count: number;
  inside_match_count: number;
  multiple_inside_matches: boolean;
  selected_candidate_ordinal: number;
  selected_work_site_id: UUID;
  selected_geofence_id: UUID;
  selected_geofence_version_id: UUID;
  selected_shape_type: "circle" | "polygon";
  selection_reason: string;
  distance_meters?: number;
  boundary_distance_meters?: number;
  radius_meters?: number;
  grace_meters: number;
  effective_radius_meters?: number;
  signed_margin_meters: number;
  reported_accuracy_meters: number;
  evidence_age_ms?: number;
  max_location_age_ms?: number | null;
  max_accuracy_meters?: number | null;
}

export interface AttendanceGeoEvidenceWideEvaluation {
  category: "stale_evidence" | "accuracy_exceeded";
  evaluator_version: string;
  evidence_age_ms: number;
  reported_accuracy_meters: number;
  max_location_age_ms?: number | null;
  max_accuracy_meters?: number | null;
}

export interface AttendanceGeoNoEffectiveEvaluation {
  category: "no_effective_geofence";
  evaluator_version: string;
  candidate_count: number;
  valid_candidate_count: number;
}

type AttendanceGeoDecisionEvaluation =
  | AttendanceGeoSafeEvaluation
  | AttendanceGeoEvidenceWideEvaluation
  | AttendanceGeoNoEffectiveEvaluation;

export interface AttendanceGeoEvaluationInput {
  policy: Pick<
    EffectiveAttendancePolicy,
    | "attendanceMode"
    | "fallbackApprovalMode"
    | "locationUnavailableAction"
    | "permissionDeniedAction"
    | "outsideFenceAction"
    | "boundaryUncertainAction"
    | "staleEvidenceAction"
    | "accuracyExceededAction"
    | "effectiveGeofenceId"
    | "effectiveGeofenceIds"
    | "policyVersion"
    | "policyVersionId"
    | "policyVersionNumber"
  >;
  locationStatus:
    | { kind: "missing" }
    | { kind: "permission_denied" }
    | { kind: "location_unavailable" }
    | { kind: "stale_evidence"; evaluation: AttendanceGeoEvidenceWideEvaluation }
    | { kind: "accuracy_exceeded"; evaluation: AttendanceGeoEvidenceWideEvaluation }
    | {
        kind: "coordinates";
        fence:
          | { configured: false; evaluation?: AttendanceGeoNoEffectiveEvaluation }
          | {
              configured: true;
              category: AttendanceGeoSpatialCategory;
              reference: AttendanceGeoFenceReference;
              evaluation: AttendanceGeoSafeEvaluation;
            };
      };
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
  evaluation: AttendanceGeoDecisionEvaluation | null;
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
  const evaluation = located.evaluation;
  const reasonCode = factualReasonCode(factual);

  if (factual === "inside_confident") {
    return allowed(
      factual,
      "allow",
      false,
      reasonCode,
      "Location evidence is confidently inside the effective geofence.",
      geofence,
      undefined,
      evaluation,
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
        undefined,
        evaluation,
      );
    }
    return denied(
      factual,
      "deny",
      reasonCode,
      "No effective geofence is configured for the resolved attendance policy.",
      geofence,
      evaluation,
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
      evaluation,
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
      undefined,
      evaluation,
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
        evaluation,
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
      evaluation,
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
    evaluation,
  );
}

function selectedActionFor(
  mode: AttendanceMode,
  factual: AttendanceGeoFactualOutcome,
  policy: {
    locationUnavailableAction: string;
    permissionDeniedAction: string;
    outsideFenceAction: string;
    boundaryUncertainAction: string;
    staleEvidenceAction: string;
    accuracyExceededAction: string;
    fallbackApprovalMode: AttendanceApprovalMode;
  },
): string {
  if (mode === "geo_optional" && (factual === "missing" || factual === "permission_denied" || factual === "location_unavailable")) {
    return "allow";
  }
  if (factual === "permission_denied") return policy.permissionDeniedAction;
  if (factual === "outside_confident") return policy.outsideFenceAction;
  if (factual === "boundary_uncertain") return policy.boundaryUncertainAction;
  if (factual === "stale_evidence") return policy.staleEvidenceAction;
  if (factual === "accuracy_exceeded") return policy.accuracyExceededAction;
  return policy.locationUnavailableAction;
}

function factualOutcome(
  status: AttendanceGeoEvaluationInput["locationStatus"],
): { outcome: AttendanceGeoFactualOutcome; geofence: AttendanceGeoFenceReference | null; evaluation: AttendanceGeoDecisionEvaluation | null } {
  if (status.kind === "missing") return { outcome: "missing", geofence: null, evaluation: null };
  if (status.kind === "permission_denied") return { outcome: "permission_denied", geofence: null, evaluation: null };
  if (status.kind === "location_unavailable") return { outcome: "location_unavailable", geofence: null, evaluation: null };
  if (status.kind === "stale_evidence") return { outcome: "stale_evidence", geofence: null, evaluation: status.evaluation };
  if (status.kind === "accuracy_exceeded") return { outcome: "accuracy_exceeded", geofence: null, evaluation: status.evaluation };
  if (!status.fence.configured) {
    return { outcome: "fence_not_configured", geofence: null, evaluation: status.fence.evaluation ?? null };
  }
  return {
    outcome: status.fence.category,
    geofence: status.fence.reference,
    evaluation: status.fence.evaluation,
  };
}

function factualReasonCode(
  factual: AttendanceGeoFactualOutcome,
): AttendanceGeoDecisionReasonCode {
  switch (factual) {
    case "not_required":
      return AttendanceGeoDecisionReasonCodes.GeoNotRequired;
    case "inside_confident":
      return AttendanceGeoDecisionReasonCodes.GeoInsideFence;
    case "outside_confident":
      return AttendanceGeoDecisionReasonCodes.GeoOutsideFence;
    case "boundary_uncertain":
      return AttendanceGeoDecisionReasonCodes.GeoBoundaryUncertain;
    case "stale_evidence":
      return AttendanceGeoDecisionReasonCodes.GeoStaleEvidence;
    case "accuracy_exceeded":
      return AttendanceGeoDecisionReasonCodes.GeoAccuracyExceeded;
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
  evaluation?: AttendanceGeoDecisionEvaluation | null,
): AttendanceGeoDecision {
  return decision(true, factualOutcome, selectedAction, fallbackUsed, reasonCode, reasonDetail, geofence, fallbackReasonCode, evaluation);
}

function denied(
  factualOutcome: AttendanceGeoFactualOutcome,
  selectedAction: AttendanceGeoPolicyAction,
  reasonCode: AttendanceGeoDecisionReasonCode,
  reasonDetail: string,
  geofence: AttendanceGeoFenceReference | null,
  evaluation: AttendanceGeoDecisionEvaluation | null = null,
  extraDetails: Array<Record<string, unknown>> = [],
): AttendanceGeoDecision {
  const result = decision(false, factualOutcome, selectedAction, false, reasonCode, reasonDetail, geofence, undefined, evaluation);
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
  evaluation: AttendanceGeoDecisionEvaluation | null = null,
): AttendanceGeoDecision {
  const details = {
    factual_outcome: factualOutcome,
    selected_action: selectedAction,
    fallback_used: fallbackUsed,
    geofence_id: geofence?.geofenceId ?? null,
    geofence_version_id: geofence?.geofenceVersionId ?? null,
    reason_detail: reasonDetail,
    evaluation,
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
    evaluation,
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
          : factual === "outside_confident"
            ? "Location evidence is confidently outside the effective geofence"
            : factual === "boundary_uncertain"
              ? "Location evidence is within boundary uncertainty"
              : factual === "stale_evidence"
                ? "Location evidence is stale"
                : factual === "accuracy_exceeded"
                  ? "Location accuracy exceeds policy"
                  : "No effective geofence is configured";
  return `${prefix}; ${suffix}`;
}
