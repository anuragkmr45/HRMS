import { afterEach, describe, expect, it } from "vitest";
import {
  accuracyBucket,
  recordAttendanceDecision,
  recordAttendanceDuplicateEvent,
  recordAttendanceLocationAccuracy,
  recordAttendanceReviewQueueAge,
  setAttendanceObservabilityLogger,
  setAttendanceObservabilityTestSink,
  type SafeAttendanceLogFields,
} from "../observability.js";

describe("attendance observability helper", () => {
  afterEach(() => {
    setAttendanceObservabilityLogger(null);
    setAttendanceObservabilityTestSink(null);
  });

  it("records decision, accuracy, queue age, and duplicate instruments with low-cardinality attributes", () => {
    const decisions: unknown[] = [];
    const accuracies: Array<{ value: number; attributes: unknown }> = [];
    const queueAges: Array<{ value: number; attributes: unknown }> = [];
    const duplicates: unknown[] = [];
    const logs: SafeAttendanceLogFields[] = [];
    setAttendanceObservabilityTestSink({
      decision: (attributes) => decisions.push(attributes),
      locationAccuracy: (value, attributes) => accuracies.push({ value, attributes }),
      reviewQueueAge: (value, attributes) => queueAges.push({ value, attributes }),
      duplicateEvent: (attributes) => duplicates.push(attributes),
      log: (fields) => logs.push(fields),
    });

    recordAttendanceDecision({
      sourceChannel: "web_geo",
      outcome: "allowed",
      decisionType: "manual_attendance",
      commandOrigin: "employee_manual_now",
      eventType: "check_in",
      reasonCode: null,
    });
    recordAttendanceLocationAccuracy({ sourceChannel: "web_geo", accuracyMeters: 42 });
    recordAttendanceReviewQueueAge({
      ageSeconds: 123,
      queue: "attendance_regularization_manager",
      status: "pending",
    });
    recordAttendanceDuplicateEvent({
      duplicateKind: "offline_duplicate_sequence",
      sourceChannel: "mobile_offline",
      reasonCode: "offline_sync.duplicate_sequence",
    });

    expect(decisions).toEqual([
      {
        source_channel: "web_geo",
        outcome: "allowed",
        decision_type: "manual_attendance",
        command_origin: "employee_manual_now",
        event_type: "check_in",
        reason_code: "none",
      },
    ]);
    expect(accuracies).toEqual([
      {
        value: 42,
        attributes: {
          source_channel: "web_geo",
          accuracy_bucket: "25_50m",
        },
      },
    ]);
    expect(queueAges).toEqual([
      {
        value: 123,
        attributes: {
          queue: "attendance_regularization_manager",
          status: "pending",
        },
      },
    ]);
    expect(duplicates).toEqual([
      {
        duplicate_kind: "offline_duplicate_sequence",
        source_channel: "mobile_offline",
        reason_code: "offline_sync.duplicate_sequence",
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/employee_id|company_id|client_event_id|latitude|longitude|coordinates/u);
    expect(logs.map((log) => log.event)).toEqual([
      "attendance.decision.observed",
      "attendance.location_accuracy.observed",
      "attendance.review_queue_age.observed",
      "attendance.duplicate_event.observed",
    ]);
  });

  it("keeps accuracy buckets bounded and swallows telemetry failures", () => {
    setAttendanceObservabilityTestSink({
      decision: () => {
        throw new Error("sink failed");
      },
    });
    expect(() =>
      recordAttendanceDecision({
        sourceChannel: "web",
        outcome: "denied",
        decisionType: "manual_attendance",
        commandOrigin: "employee_manual_now",
        eventType: "check_out",
        reasonCode: "invalid_state_transition",
      }),
    ).not.toThrow();

    expect(accuracyBucket(undefined)).toBe("unknown");
    expect(accuracyBucket(0)).toBe("0_25m");
    expect(accuracyBucket(25)).toBe("0_25m");
    expect(accuracyBucket(50)).toBe("25_50m");
    expect(accuracyBucket(100)).toBe("50_100m");
    expect(accuracyBucket(250)).toBe("100_250m");
    expect(accuracyBucket(251)).toBe("250m_plus");
  });
});
