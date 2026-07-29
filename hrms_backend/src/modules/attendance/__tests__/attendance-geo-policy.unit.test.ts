import { describe, expect, it } from "vitest";
import { AttendanceCoordinateRetentionDefaults } from "#shared";
import {
  AttendanceGeoDecisionReasonCodes,
  evaluateAttendanceGeoPolicy,
  type AttendanceGeoEvaluationInput,
  type AttendanceGeoEvidenceWideEvaluation,
  type AttendanceGeoSafeEvaluation,
  type AttendanceGeoSpatialCategory,
} from "../geo-policy.js";
import { classifyAttendanceGeoSpatialCategory } from "../command-repository.js";
import {
  normalizeAttendancePolicyConfig,
  resolveCoordinateRetention,
} from "../policy-config.js";

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
    boundaryUncertainAction: "deny",
    staleEvidenceAction: "deny",
    accuracyExceededAction: "deny",
    effectiveGeofenceId: geofence.geofenceId,
    effectiveGeofenceIds: [geofence.geofenceId],
    policyVersion: "1",
    policyVersionId: geofence.geofenceVersionId,
    policyVersionNumber: 1,
    ...overrides,
  };
}

type GeoPolicy = AttendanceGeoEvaluationInput["policy"];
type LocationStatus = AttendanceGeoEvaluationInput["locationStatus"];
type PolicyOverrides = Partial<GeoPolicy>;

function safeEvaluation(
  category: AttendanceGeoSpatialCategory,
  overrides: Partial<AttendanceGeoSafeEvaluation> = {},
): AttendanceGeoSafeEvaluation {
  return {
    category,
    evaluator_version: "attendance-geo-v2",
    candidate_count: 1,
    valid_candidate_count: 1,
    inside_match_count: category === "inside_confident" ? 1 : 0,
    multiple_inside_matches: false,
    selected_candidate_ordinal: 1,
    selected_work_site_id: geofence.workSiteId,
    selected_geofence_id: geofence.geofenceId,
    selected_geofence_version_id: geofence.geofenceVersionId,
    selected_shape_type: geofence.shapeType,
    selection_reason: category,
    grace_meters: 0,
    signed_margin_meters: category === "inside_confident" ? 20 : category === "outside_confident" ? -20 : 2,
    reported_accuracy_meters: 5,
    ...overrides,
  };
}

function evidenceWideEvaluation(
  category: AttendanceGeoEvidenceWideEvaluation["category"],
  overrides: Partial<AttendanceGeoEvidenceWideEvaluation> = {},
): AttendanceGeoEvidenceWideEvaluation {
  return {
    category,
    evaluator_version: "attendance-geo-v2",
    evidence_age_ms: 120_000,
    reported_accuracy_meters: 50,
    ...overrides,
  };
}

function coordinates(category: AttendanceGeoSpatialCategory): LocationStatus {
  return {
    kind: "coordinates",
    fence: {
      configured: true,
      category,
      reference: geofence,
      evaluation: safeEvaluation(category),
    },
  };
}

const statuses = {
  missing: { kind: "missing" as const },
  denied: { kind: "permission_denied" as const },
  unavailable: { kind: "location_unavailable" as const },
  stale: { kind: "stale_evidence" as const, evaluation: evidenceWideEvaluation("stale_evidence") },
  inaccurate: { kind: "accuracy_exceeded" as const, evaluation: evidenceWideEvaluation("accuracy_exceeded") },
  inside: coordinates("inside_confident"),
  outside: coordinates("outside_confident"),
  boundary: coordinates("boundary_uncertain"),
  noFence: { kind: "coordinates" as const, fence: { configured: false as const } },
};

describe("attendance geo policy evaluator", () => {
  it.each([
    [10, 10, "inside_confident"],
    [9.999, 10, "boundary_uncertain"],
    [-10, 10, "boundary_uncertain"],
    [-10.001, 10, "outside_confident"],
  ] as const)(
    "classifies signed margin %s with accuracy %s as %s",
    (signedMarginMeters, reportedAccuracyMeters, expected) => {
      expect(classifyAttendanceGeoSpatialCategory(signedMarginMeters, reportedAccuracyMeters)).toBe(expected);
    },
  );

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
    ["boundary allow", statuses.boundary, true, "geo_boundary_uncertain", { boundaryUncertainAction: "allow" as const }],
    ["stale allow", statuses.stale, true, "geo_stale_evidence", { staleEvidenceAction: "allow" as const }],
    ["accuracy allow", statuses.inaccurate, true, "geo_accuracy_exceeded", { accuracyExceededAction: "allow" as const }],
    ["no effective fence", statuses.noFence, true, "geo_fence_not_configured"],
  ];
  it.each(optionalCases)("evaluates geo_optional %s", (_name, locationStatus, allowed, reasonCode, overrides = {}, fallbackUsed = false) => {
    const basePolicy = policy({
      attendanceMode: "geo_optional",
      locationUnavailableAction: "allow",
      permissionDeniedAction: "allow",
      outsideFenceAction: "allow",
      boundaryUncertainAction: "allow",
      staleEvidenceAction: "allow",
      accuracyExceededAction: "allow",
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
    ["boundary default deny", statuses.boundary, {}, false, "geo_boundary_uncertain", false],
    ["boundary allow", statuses.boundary, { boundaryUncertainAction: "allow" }, true, "geo_boundary_uncertain", false],
    ["boundary fallback", statuses.boundary, { boundaryUncertainAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, "geo_boundary_uncertain", true],
    ["stale default deny", statuses.stale, {}, false, "geo_stale_evidence", false],
    ["stale allow", statuses.stale, { staleEvidenceAction: "allow" }, true, "geo_stale_evidence", false],
    ["accuracy default deny", statuses.inaccurate, {}, false, "geo_accuracy_exceeded", false],
    ["accuracy allow", statuses.inaccurate, { accuracyExceededAction: "allow" }, true, "geo_accuracy_exceeded", false],
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
    ["boundary allow", statuses.boundary, { boundaryUncertainAction: "allow" }, true, false],
    ["boundary deny", statuses.boundary, { boundaryUncertainAction: "deny" }, false, false],
    ["boundary fallback", statuses.boundary, { boundaryUncertainAction: "manual_fallback", fallbackApprovalMode: "approval_required" }, true, true],
    ["stale allow", statuses.stale, { staleEvidenceAction: "allow" }, true, false],
    ["accuracy deny", statuses.inaccurate, { accuracyExceededAction: "deny" }, false, false],
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
    expect(normalized.effectiveGeofenceIds).toEqual([]);
    expect(normalized.geofenceGraceMeters).toBe(0);
    expect(normalized.maxLocationAgeMs).toBeNull();
    expect(normalized.maxAccuracyMeters).toBeNull();
    expect(normalized.coordinateRetentionClasses).toEqual({
      [AttendanceCoordinateRetentionDefaults.Class]: AttendanceCoordinateRetentionDefaults.Seconds,
    });
    expect(normalized.defaultCoordinateRetentionClass).toBe(
      AttendanceCoordinateRetentionDefaults.Class,
    );

    const decision = evaluateAttendanceGeoPolicy({
      policy: policy(normalized),
      locationStatus: statuses.missing,
    });

    expect(decision).toMatchObject({
      allowed: true,
      reasonCode: AttendanceGeoDecisionReasonCodes.GeoNotRequired,
    });
  });

  it("normalizes coordinate retention classes and resolves the active default", () => {
    const normalized = normalizeAttendancePolicyConfig({
      coordinateRetentionClasses: {
        standard: 2_592_000,
        short: 86_400,
        "ops-review": 604_800,
        Bad: 86_400,
        zero: 0,
        too_short: AttendanceCoordinateRetentionDefaults.MinSeconds - 1,
        too_long: AttendanceCoordinateRetentionDefaults.MaxSeconds + 1,
        fractional: 86_400.5,
        infinite: Number.POSITIVE_INFINITY,
      },
      defaultCoordinateRetentionClass: "short",
    });

    expect(normalized.coordinateRetentionClasses).toEqual({
      standard: 2_592_000,
      short: 86_400,
      "ops-review": 604_800,
    });
    expect(normalized.defaultCoordinateRetentionClass).toBe("short");
    expect(resolveCoordinateRetention(normalized)).toEqual({
      retentionClass: "short",
      retentionSeconds: 86_400,
    });
  });

  it("falls back to a configured coordinate retention class when the default is invalid", () => {
    const normalized = normalizeAttendancePolicyConfig({
      coordinate_retention_classes: {
        extended: 7_776_000,
      },
      default_coordinate_retention_class: "missing",
    });

    expect(normalized.coordinateRetentionClasses).toEqual({
      extended: 7_776_000,
    });
    expect(normalized.defaultCoordinateRetentionClass).toBe("extended");
    expect(resolveCoordinateRetention(normalized)).toEqual({
      retentionClass: "extended",
      retentionSeconds: 7_776_000,
    });
  });

  it("normalizes new geofence candidate and threshold policy keys", () => {
    const normalized = normalizeAttendancePolicyConfig({
      attendanceMode: "geo_required",
      boundaryUncertainAction: "allow",
      staleEvidenceAction: "deny",
      accuracyExceededAction: "manual_fallback",
      effectiveGeofenceId: geofence.geofenceId,
      effectiveGeofenceIds: [geofence.geofenceId, geofence.geofenceId, geofence.geofenceVersionId],
      geofenceGraceMeters: 15.5,
      maxLocationAgeMs: 60_000,
      maxAccuracyMeters: 35,
    });

    expect(normalized).toMatchObject({
      boundaryUncertainAction: "allow",
      staleEvidenceAction: "deny",
      accuracyExceededAction: "manual_fallback",
      effectiveGeofenceIds: [geofence.geofenceId, geofence.geofenceVersionId],
      geofenceGraceMeters: 15.5,
      maxLocationAgeMs: 60_000,
      maxAccuracyMeters: 35,
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
    ["boundary", statuses.boundary, "boundaryUncertainAction", "geo_boundary_uncertain"],
    ["stale", statuses.stale, "staleEvidenceAction", "geo_stale_evidence"],
    ["accuracy", statuses.inaccurate, "accuracyExceededAction", "geo_accuracy_exceeded"],
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
