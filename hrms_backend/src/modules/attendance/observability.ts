import { metrics, type Attributes, type Counter, type Histogram } from "@opentelemetry/api";
import type { AttendancePunchEventType, AttendancePunchSourceChannel } from "#shared";

export const attendanceMetricNames = {
  decisionCount: "hrms.attendance.decision.count",
  locationAccuracy: "hrms.attendance.location.accuracy",
  reviewQueueAge: "hrms.attendance.review_queue.age",
  duplicateEventCount: "hrms.attendance.duplicate_event.count",
} as const;

export type AttendanceDecisionOutcome = "allowed" | "denied";

export interface AttendanceDecisionObservation {
  sourceChannel: AttendancePunchSourceChannel | "unknown";
  outcome: AttendanceDecisionOutcome;
  decisionType: string;
  commandOrigin: string;
  eventType?: AttendancePunchEventType | "check_out";
  reasonCode?: string | null;
}

export interface AttendanceLocationAccuracyObservation {
  sourceChannel: AttendancePunchSourceChannel | "unknown";
  accuracyMeters: number | null | undefined;
}

export interface AttendanceReviewQueueAgeObservation {
  ageSeconds: number;
  queue: "attendance_regularization_manager";
  status: "pending";
}

export interface AttendanceDuplicateEventObservation {
  duplicateKind:
    | "client_event_replay"
    | "platform_idempotency_replay"
    | "offline_client_event_replay"
    | "offline_changed_body_conflict"
    | "offline_duplicate_sequence"
    | "offline_sequence_gap"
    | "offline_sequence_out_of_order";
  sourceChannel: AttendancePunchSourceChannel | "mobile_offline" | "unknown";
  reasonCode?: string | null;
}

export interface AttendanceObservabilityTestSink {
  decision?(attributes: Attributes): void;
  locationAccuracy?(value: number, attributes: Attributes): void;
  reviewQueueAge?(value: number, attributes: Attributes): void;
  duplicateEvent?(attributes: Attributes): void;
  log?(fields: SafeAttendanceLogFields, message: string): void;
}

export type SafeAttendanceLogFields = Attributes & {
  event: string;
};

type AttendanceObservabilityLogger = (
  fields: SafeAttendanceLogFields,
  message: string,
) => void;

let decisionCounter: Counter | null = null;
let locationAccuracyHistogram: Histogram | null = null;
let reviewQueueAgeHistogram: Histogram | null = null;
let duplicateEventCounter: Counter | null = null;
let logger: AttendanceObservabilityLogger | null = null;
let testSink: AttendanceObservabilityTestSink | null = null;

export function setAttendanceObservabilityLogger(
  nextLogger: AttendanceObservabilityLogger | null,
): void {
  logger = nextLogger;
}

export function setAttendanceObservabilityTestSink(
  sink: AttendanceObservabilityTestSink | null,
): void {
  testSink = sink;
}

export function accuracyBucket(
  accuracyMeters: number | null | undefined,
): "0_25m" | "25_50m" | "50_100m" | "100_250m" | "250m_plus" | "unknown" {
  if (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters)) {
    return "unknown";
  }
  if (accuracyMeters <= 25) return "0_25m";
  if (accuracyMeters <= 50) return "25_50m";
  if (accuracyMeters <= 100) return "50_100m";
  if (accuracyMeters <= 250) return "100_250m";
  return "250m_plus";
}

export function recordAttendanceDecision(
  observation: AttendanceDecisionObservation,
): void {
  safeObserve(() => {
    const attributes = compactAttributes({
      source_channel: bounded(observation.sourceChannel),
      outcome: bounded(observation.outcome),
      decision_type: bounded(observation.decisionType),
      command_origin: bounded(observation.commandOrigin),
      event_type: bounded(observation.eventType ?? "unknown"),
      reason_code: bounded(observation.reasonCode ?? "none"),
    });
    getDecisionCounter().add(1, attributes);
    testSink?.decision?.(attributes);
    safeLog({
      event: "attendance.decision.observed",
      ...attributes,
    }, "Attendance decision observed");
  });
}

export function recordAttendanceLocationAccuracy(
  observation: AttendanceLocationAccuracyObservation,
): void {
  safeObserve(() => {
    if (
      typeof observation.accuracyMeters !== "number" ||
      !Number.isFinite(observation.accuracyMeters) ||
      observation.accuracyMeters < 0
    ) {
      return;
    }
    const attributes = compactAttributes({
      source_channel: bounded(observation.sourceChannel),
      accuracy_bucket: accuracyBucket(observation.accuracyMeters),
    });
    getLocationAccuracyHistogram().record(observation.accuracyMeters, attributes);
    testSink?.locationAccuracy?.(observation.accuracyMeters, attributes);
    safeLog({
      event: "attendance.location_accuracy.observed",
      ...attributes,
    }, "Attendance location accuracy observed");
  });
}

export function recordAttendanceReviewQueueAge(
  observation: AttendanceReviewQueueAgeObservation,
): void {
  safeObserve(() => {
    const ageSeconds = Math.max(0, observation.ageSeconds);
    if (!Number.isFinite(ageSeconds)) return;
    const attributes = compactAttributes({
      queue: observation.queue,
      status: observation.status,
    });
    getReviewQueueAgeHistogram().record(ageSeconds, attributes);
    testSink?.reviewQueueAge?.(ageSeconds, attributes);
    safeLog({
      event: "attendance.review_queue_age.observed",
      ...attributes,
    }, "Attendance review queue age observed");
  });
}

export function recordAttendanceDuplicateEvent(
  observation: AttendanceDuplicateEventObservation,
): void {
  safeObserve(() => {
    const attributes = compactAttributes({
      duplicate_kind: observation.duplicateKind,
      source_channel: bounded(observation.sourceChannel),
      reason_code: bounded(observation.reasonCode ?? "none"),
    });
    getDuplicateEventCounter().add(1, attributes);
    testSink?.duplicateEvent?.(attributes);
    safeLog({
      event: "attendance.duplicate_event.observed",
      ...attributes,
    }, "Attendance duplicate or replay event observed");
  });
}

function getDecisionCounter(): Counter {
  decisionCounter ??= metrics
    .getMeter("hawkaii-hrms.attendance")
    .createCounter(attendanceMetricNames.decisionCount, {
      description: "Finalized attendance decisions by bounded outcome and source.",
    });
  return decisionCounter;
}

function getLocationAccuracyHistogram(): Histogram {
  locationAccuracyHistogram ??= metrics
    .getMeter("hawkaii-hrms.attendance")
    .createHistogram(attendanceMetricNames.locationAccuracy, {
      description: "Attendance location accuracy measurements.",
      unit: "m",
    });
  return locationAccuracyHistogram;
}

function getReviewQueueAgeHistogram(): Histogram {
  reviewQueueAgeHistogram ??= metrics
    .getMeter("hawkaii-hrms.attendance")
    .createHistogram(attendanceMetricNames.reviewQueueAge, {
      description: "Pending manager attendance regularization queue age.",
      unit: "s",
    });
  return reviewQueueAgeHistogram;
}

function getDuplicateEventCounter(): Counter {
  duplicateEventCounter ??= metrics
    .getMeter("hawkaii-hrms.attendance")
    .createCounter(attendanceMetricNames.duplicateEventCount, {
      description: "Attendance duplicate, replay, and offline sequence security classifications.",
    });
  return duplicateEventCounter;
}

function safeLog(fields: SafeAttendanceLogFields, message: string): void {
  try {
    logger?.(fields, message);
    testSink?.log?.(fields, message);
  } catch {
    // Observability must never affect attendance behavior.
  }
}

function safeObserve(observe: () => void): void {
  try {
    observe();
  } catch {
    // Observability must never affect attendance behavior.
  }
}

function bounded(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll(/[^a-z0-9_.-]/gu, "_");
  return normalized.slice(0, 80) || "unknown";
}

function compactAttributes(input: Record<string, string | number | boolean | null | undefined>): Attributes {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined),
  ) as Attributes;
}
