export const AttendanceLocationProviderValues = [
  "browser",
  "device",
  "network",
  "unknown",
] as const;

export type AttendanceLocationProviderValue =
  (typeof AttendanceLocationProviderValues)[number];

export const AttendanceHistoricalCorrectionEventTypeValues = [
  "check_in",
  "check_out",
] as const;

export type AttendanceHistoricalCorrectionEventType =
  (typeof AttendanceHistoricalCorrectionEventTypeValues)[number];

export const AttendanceSessionTransitionReasonCodes = {
  AlreadyCheckedIn: "already_checked_in",
  NoOpenSession: "no_open_session",
  BreakAlreadyStarted: "break_already_started",
  NoOpenBreak: "no_open_break",
  OpenBreakMustEnd: "open_break_must_end",
  AttendanceCycleCompleted: "attendance_cycle_completed",
  SessionOwnershipInvalid: "session_ownership_invalid",
} as const;

export const AttendanceSessionTransitionReasonCodeValues = Object.values(
  AttendanceSessionTransitionReasonCodes,
);

export type AttendanceSessionTransitionReasonCode =
  (typeof AttendanceSessionTransitionReasonCodeValues)[number];

export const AttendanceAdditionalCommandReasonCodeValues = [
  "policy_window_rejected",
  "invalid_chronology",
  "invalid_state_transition",
] as const;

export type AttendanceAdditionalCommandReasonCode =
  (typeof AttendanceAdditionalCommandReasonCodeValues)[number];

export const AttendanceGeoDecisionReasonCodes = {
  GeoNotRequired: "geo_not_required",
  GeoEvidenceMissing: "geo_evidence_missing",
  GeoPermissionDenied: "geo_permission_denied",
  GeoLocationUnavailable: "geo_location_unavailable",
  GeoFenceNotConfigured: "geo_fence_not_configured",
  GeoInsideFence: "geo_inside_fence",
  GeoOutsideFence: "geo_outside_fence",
  GeoBoundaryUncertain: "geo_boundary_uncertain",
  GeoStaleEvidence: "geo_stale_evidence",
  GeoAccuracyExceeded: "geo_accuracy_exceeded",
  GeoPolicyModeUnknown: "geo_policy_mode_unknown",
  GeoActionUnknown: "geo_action_unknown",
  GeoManualFallbackAllowed: "geo_manual_fallback_allowed",
  GeoManualFallbackDisallowed: "geo_manual_fallback_disallowed",
} as const;

export const AttendanceGeoDecisionReasonCodeValues = Object.values(
  AttendanceGeoDecisionReasonCodes,
);

export type AttendanceGeoDecisionReasonCode =
  (typeof AttendanceGeoDecisionReasonCodeValues)[number];

export const AttendanceCommandReasonCodeValues = [
  ...AttendanceSessionTransitionReasonCodeValues,
  ...AttendanceAdditionalCommandReasonCodeValues,
  ...AttendanceGeoDecisionReasonCodeValues,
] as const;

export type AttendanceCommandReasonCode =
  (typeof AttendanceCommandReasonCodeValues)[number];

export const AttendanceOfflineSyncContractVersion = "attendance.offline_sync.v1";

export const AttendanceOfflineSyncStatusValues = [
  "accepted",
  "replayed",
  "conflict",
  "rejected",
  "deferred",
] as const;

export type AttendanceOfflineSyncStatus =
  (typeof AttendanceOfflineSyncStatusValues)[number];

export const AttendanceOfflineVerificationStatusValues = [
  "unverified",
  "review_required",
  "rejected",
] as const;

export type AttendanceOfflineVerificationStatus =
  (typeof AttendanceOfflineVerificationStatusValues)[number];

export const AttendanceOfflineSyncReasonCodeValues = [
  "offline_sync.accepted_unverified",
  "offline_sync.replayed",
  "offline_sync.changed_body_conflict",
  "offline_sync.validation_failed",
  "offline_sync.processing_deferred",
  "offline_sync.sequence_gap",
  "offline_sync.sequence_out_of_order",
  "offline_sync.duplicate_sequence",
  "offline_sync.review_required",
] as const;

export type AttendanceOfflineSyncReasonCode =
  (typeof AttendanceOfflineSyncReasonCodeValues)[number];

export const AttendanceGeoFactualOutcomeValues = [
  "not_required",
  "inside_confident",
  "outside_confident",
  "boundary_uncertain",
  "stale_evidence",
  "accuracy_exceeded",
  "missing",
  "permission_denied",
  "location_unavailable",
  "fence_not_configured",
] as const;

export type AttendanceGeoFactualOutcome =
  (typeof AttendanceGeoFactualOutcomeValues)[number];

export const AttendanceGeoPolicyActionValues = [
  "allow",
  "deny",
  "manual_fallback",
] as const;

export type AttendanceGeoPolicyAction =
  (typeof AttendanceGeoPolicyActionValues)[number];
