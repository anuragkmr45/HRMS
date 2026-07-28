import { describe, expect, it } from "vitest";
import {
  AttendanceGeoDecisionReasonCodes,
  evaluateAttendanceGeoPolicy,
  type AttendanceGeoEvaluationInput,
} from "../geo-policy.js";
import { normalizeAttendancePolicyConfig } from "../policy-config.js";

const geofence = {
  geofenceId: "11111111-1111-4111-8111-111111111111",
  geofenceVersionId: "22222222-2222-4222-8222-222222222222",
  workSiteId: "33333333-3333-4333-8333-333333333333",
  versionNumber: 1,
  shapeType: "polygon" as const,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveUntil: null,
  canonicalHash: "a".repeat(64),
};

function policy(
  overrides: Partial<AttendanceGeoEvaluationInput["policy"]> = {},
): AttendanceGeoEvaluationInput["policy"] {
  return {
    attendanceMode: "geo_required",
    fallbackApprovalMode: "disabled",
    locationUnavailableAction: "deny",
    permissionDeniedAction: "deny",
    outsideFenceAction: "deny",
    effectiveGeofenceId: geofence.geofenceId,
    policyVersion: "1",
    policyVersionId: geofence.geofenceVersionId,
    policyVersionNumber: 1,
    ...overrides,
  };
}

const statuses = {
  missing: { kind: "missing" as const },
  denied: { kind: "permission_denied" as const },
  unavailable: { kind: "location_unavailable" as const },
  inside: { kind: "coordinates" as const, fence: { configured: true as const, inside: true, reference: geofence } },
  outside: { kind: "coordinates" as const, fence: { configured: true as const, inside: false, reference: geofence } },
  noFence: { kind: "coordinates" as const, fence: { configured: false as const } },
};

type GeoPolicy = AttendanceGeoEvaluationInput["policy"];
type LocationStatus = AttendanceGeoEvaluationInput["locationStatus"];
type PolicyOverrides = Partial<GeoPolicy>;

describe("attendance geo policy evaluator", () => {
  it.each([
    ["missing", statuses.missing],
    ["permission denied", statuses.denied],
    ["unavailable", statuses.unavailable],
    ["coordinates supplied", statuses.inside],
  ])("allows manual_only with %s location", (_name, locationStatus) => {
    const decision = evaluateAttendanceGeoPolicy({
      policy: policy({ attendanceMode: "manual_only" }),
      locationStatus,
    });
    expect(decision).toMatchObject({
      allowed: true,
      factualOutcome: "not_required",
      selectedAction: "allow",
      fallbackUsed: false,
      reasonCode: AttendanceGeoDecisionReasonCodes.GeoNotRequired,
    });
  });

  const optionalCases: Array<[string, LocationStatus, boolean, string, PolicyOverrides?, boolean?]> = [
    ["inside", statuses.inside, true, "geo_inside_fence"],
    ["missing", statuses.missing, true, "geo_evidence_missing"],
    ["permission denied", statuses.denied, true, "geo_permission_denied"],
    ["unavailable", statuses.unavailable, true, "geo_location_unavailable"],
    ["outside allow", statuses.outside, true, "geo_outside_fence", { outsideFenceAction: "allow" as const }],
    ["outside deny", statuses.outside, false, "geo_outside_fence", { outsideFenceAction: "deny" as const }],
    [
      "outside fallback",
      statuses.outside,
      true,
      "geo_outside_fence",
      { outsideFenceAction: "manual_fallback" as const, fallbackApprovalMode: "approval_required" as const },
      true,
    ],
    ["no effective fence", statuses.noFence, true, "geo_fence_not_configured"],
  ];
  it.each(optionalCases)("evaluates geo_optional %s", (_name, locationStatus, allowed, reasonCode, overrides = {}, fallbackUsed = false) => {
    const basePolicy = policy({
      attendanceMode: "geo_optional",
      locationUnavailableAction: "allow",
      permissionDeniedAction: "allow",
      outsideFenceAction: "allow",
    });
    const decision = evaluateAttendanceGeoPolicy({
      policy: { ...basePolicy, ...overrides },
      locationStatus,
    });
    expect(decision.allowed).toBe(allowed);
    expect(decision.reasonCode).toBe(reasonCode);
    expect(decision.fallbackUsed).toBe(fallbackUsed);
  });

  const requiredCases: Array<[string, LocationStatus, PolicyOverrides, boolean, string, boolean]> = [
    ["inside", statuses.inside, {}, true, "geo_inside_fence", false],
    ["missing default deny", statuses.missing, {}, false, "geo_evidence_missing", false],
    ["missing explicit fallback", statuses.missing, { locationUnavailableAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, "geo_evidence_missing", true],
    ["unavailable default deny", statuses.unavailable, {}, false, "geo_location_unavailable", false],
    ["unavailable explicit fallback", statuses.unavailable, { locationUnavailableAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, "geo_location_unavailable", true],
    ["permission denied default deny", statuses.denied, {}, false, "geo_permission_denied", false],
    ["permission denied explicit fallback", statuses.denied, { permissionDeniedAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, "geo_permission_denied", true],
    ["outside allow", statuses.outside, { outsideFenceAction: "allow" }, true, "geo_outside_fence", false],
    ["outside deny", statuses.outside, { outsideFenceAction: "deny" }, false, "geo_outside_fence", false],
    ["outside fallback", statuses.outside, { outsideFenceAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, "geo_outside_fence", true],
    ["no effective fence", statuses.noFence, {}, false, "geo_fence_not_configured", false],
  ];
  it.each(requiredCases)("evaluates geo_required %s", (_name, locationStatus, overrides, allowed, reasonCode, fallbackUsed) => {
    const decision = evaluateAttendanceGeoPolicy({
      policy: policy(overrides),
      locationStatus,
    });
    expect(decision.allowed).toBe(allowed);
    expect(decision.reasonCode).toBe(reasonCode);
    expect(decision.fallbackUsed).toBe(fallbackUsed);
  });

  const preferredCases: Array<[string, LocationStatus, PolicyOverrides, boolean, boolean]> = [
    ["missing allow", statuses.missing, { locationUnavailableAction: "allow" }, true, false],
    ["missing deny", statuses.missing, { locationUnavailableAction: "deny" }, false, false],
    ["missing fallback", statuses.missing, { locationUnavailableAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, true],
    ["permission denied allow", statuses.denied, { permissionDeniedAction: "allow" }, true, false],
    ["permission denied deny", statuses.denied, { permissionDeniedAction: "deny" }, false, false],
    ["permission denied fallback", statuses.denied, { permissionDeniedAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, true],
    ["unavailable allow", statuses.unavailable, { locationUnavailableAction: "allow" }, true, false],
    ["unavailable deny", statuses.unavailable, { locationUnavailableAction: "deny" }, false, false],
    ["unavailable fallback", statuses.unavailable, { locationUnavailableAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, true],
    ["outside allow", statuses.outside, { outsideFenceAction: "allow" }, true, false],
    ["outside deny", statuses.outside, { outsideFenceAction: "deny" }, false, false],
    ["outside fallback", statuses.outside, { outsideFenceAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, true],
  ];
  it.each(preferredCases)("evaluates geo_preferred %s", (_name, locationStatus, overrides, allowed, fallbackUsed) => {
    const decision = evaluateAttendanceGeoPolicy({
      policy: policy({ attendanceMode: "geo_preferred", ...overrides }),
      locationStatus,
    });
    expect(decision.allowed).toBe(allowed);
    expect(decision.fallbackUsed).toBe(fallbackUsed);
  });

  it("does not infer fallback from geo_preferred mode alone", () => {
    const decision = evaluateAttendanceGeoPolicy({
      policy: policy({ attendanceMode: "geo_preferred", locationUnavailableAction: "deny" }),
      locationStatus: statuses.missing,
    });
    expect(decision).toMatchObject({ allowed: false, fallbackUsed: false });
  });

  it("defaults a missing stored mode to manual_only", () => {
    const normalized = normalizeAttendancePolicyConfig({});
    expect(normalized.attendanceMode).toBe("manual_only");

    const decision = evaluateAttendanceGeoPolicy({
      policy: policy(normalized),
      locationStatus: statuses.missing,
    });

    expect(decision).toMatchObject({
      allowed: true,
      reasonCode: AttendanceGeoDecisionReasonCodes.GeoNotRequired,
    });
  });

  it("fails closed for invalid stored mode and action after normalization", () => {
    const invalidMode = normalizeAttendancePolicyConfig({
      attendanceMode: "site_required",
    });
    expect(
      evaluateAttendanceGeoPolicy({
        policy: policy(invalidMode),
        locationStatus: statuses.missing,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: AttendanceGeoDecisionReasonCodes.GeoPolicyModeUnknown,
    });

    const invalidAction = normalizeAttendancePolicyConfig({
      attendanceMode: "geo_required",
      outsideFenceAction: "review",
    });
    expect(
      evaluateAttendanceGeoPolicy({
        policy: policy(invalidAction),
        locationStatus: statuses.outside,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: AttendanceGeoDecisionReasonCodes.GeoActionUnknown,
    });
  });

  it.each([
    ["missing", statuses.missing, "locationUnavailableAction", "geo_evidence_missing"],
    ["permission denied", statuses.denied, "permissionDeniedAction", "geo_permission_denied"],
    ["unavailable", statuses.unavailable, "locationUnavailableAction", "geo_location_unavailable"],
    ["outside fence", statuses.outside, "outsideFenceAction", "geo_outside_fence"],
  ] as const)(
    "keeps factual and fallback-disallowed reasons for disallowed %s fallback",
    (_name, locationStatus, actionKey, factualReasonCode) => {
      const decision = evaluateAttendanceGeoPolicy({
        policy: policy({ [actionKey]: "manual_fallback", fallbackApprovalMode: "disabled" }),
        locationStatus,
      });

      expect(decision).toMatchObject({
        allowed: false,
        reasonCode: AttendanceGeoDecisionReasonCodes.GeoManualFallbackDisallowed,
        fallbackUsed: false,
      });
      expect(decision.reasons.map((reason) => reason.reasonCode)).toEqual([
        factualReasonCode,
        AttendanceGeoDecisionReasonCodes.GeoManualFallbackDisallowed,
      ]);
    },
  );

  it("fails closed for unknown mode, unknown action, and contradictory fallback configuration", () => {
    expect(
      evaluateAttendanceGeoPolicy({
        policy: policy({ attendanceMode: "site_required" as never }),
        locationStatus: statuses.missing,
      }),
    ).toMatchObject({ allowed: false, reasonCode: AttendanceGeoDecisionReasonCodes.GeoPolicyModeUnknown });

    expect(
      evaluateAttendanceGeoPolicy({
        policy: policy({ outsideFenceAction: "review" as never }),
        locationStatus: statuses.outside,
      }),
    ).toMatchObject({ allowed: false, reasonCode: AttendanceGeoDecisionReasonCodes.GeoActionUnknown });

    expect(
      evaluateAttendanceGeoPolicy({
        policy: policy({ outsideFenceAction: "manual_fallback" }),
        locationStatus: statuses.outside,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: AttendanceGeoDecisionReasonCodes.GeoManualFallbackDisallowed,
      fallbackUsed: false,
    });
    expect(
      evaluateAttendanceGeoPolicy({
        policy: policy({ outsideFenceAction: "manual_fallback" }),
        locationStatus: statuses.outside,
      }).reasons.map((reason) => reason.reasonCode),
    ).toEqual([
      AttendanceGeoDecisionReasonCodes.GeoOutsideFence,
      AttendanceGeoDecisionReasonCodes.GeoManualFallbackDisallowed,
    ]);
  });
});
