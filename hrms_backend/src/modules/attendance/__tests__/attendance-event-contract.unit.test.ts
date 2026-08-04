import { describe, expect, it } from "vitest";
import {
  attendanceEvents,
  buildExportRequestedEvent,
  buildGeoRejectedEvent,
  buildMissingCheckoutDetectedEvent,
  buildPunchRecordedEvent,
  buildProvisionalRecordedEvent,
  buildRegularizationDecisionEvent,
  buildRegularizationSubmittedEvent,
} from "../events.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const commandId = "44444444-4444-4444-8444-444444444444";
const decisionId = "55555555-5555-4555-8555-555555555555";
const sessionId = "66666666-6666-4666-8666-666666666666";
const punchId = "77777777-7777-4777-8777-777777777777";
const requestId = "88888888-8888-4888-8888-888888888888";
const exportId = "99999999-9999-4999-8999-999999999999";
const attendanceEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const forbiddenPayloadKeys = new Set([
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coordinates",
  "coordinate",
  "geometry",
  "geography",
  "location",
  "location_evidence",
  "accuracy",
  "distance",
  "altitude",
  "boundary",
  "boundary_data",
  "raw_payload",
  "metadata",
  "request_snapshot",
  "response_snapshot",
  "device",
  "device_envelope",
  "device_attestation",
  "attestation",
  "push_token",
  "installation_id",
  "installation_hash",
  "fingerprint",
  "token",
  "authorization",
  "headers",
  "session_token",
  "ip",
  "ip_address",
  "user_agent",
  "idempotency_key",
  "client_idempotency_key",
  "request_hash",
  "reason",
  "remarks",
  "requested_punches",
  "filters",
  "columns",
  "file_name",
  "download_url",
  "url",
]);

function expectNoForbiddenPayloadKeys(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectNoForbiddenPayloadKeys(item, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.trim().toLowerCase().replaceAll("-", "_");
    expect(
      forbiddenPayloadKeys.has(normalized),
      `Forbidden payload key ${[...path, key].join(".")}`,
    ).toBe(false);
    expectNoForbiddenPayloadKeys(nested, [...path, key]);
  }
}

describe("attendance outbox event contract", () => {
  it("uses the exact canonical event names", () => {
    expect(attendanceEvents).toEqual({
      PunchRecorded: "attendance.punch.recorded",
      ProvisionalRecorded: "attendance.provisional.recorded",
      GeoRejected: "attendance.geo.rejected",
      MissingCheckoutDetected: "attendance.missing_checkout.detected",
      RegularizationSubmitted: "attendance.regularization.submitted",
      RegularizationApproved: "attendance.regularization.approved",
      RegularizationReturned: "attendance.regularization.returned",
      RegularizationRejected: "attendance.regularization.rejected",
      ExportRequested: "attendance.export.requested",
    });
  });

  it("allowlists the punch payload and keeps the punch event as aggregate ID", () => {
    const event = buildPunchRecordedEvent({
      companyId,
      actorUserId: actorId,
      subjectEmployeeUserId: employeeId,
      commandId,
      decisionId,
      sessionId,
      punchEventId: punchId,
      punchType: "check_in",
      occurredAt: "2026-07-16T04:00:00.000Z",
      workDate: "2026-07-16",
      workMode: "office",
      sourceChannel: "mobile",
      dayStatus: "present",
      latitude: 12.971599,
      longitude: 77.594566,
      coordinates: [77.594566, 12.971599],
      metadata: { nested: { device: { attestation: "secret" } } },
      token: "secret-token",
      ip_address: "203.0.113.10",
      user_agent: "private-agent",
    } as Parameters<typeof buildPunchRecordedEvent>[0]);

    expect(event.aggregateId).toBe(punchId);
    expect(event.idempotencyKey).toBe(`attendance.punch.recorded:${punchId}`);
    expect(event.payload).toEqual({
      schema_version: 1,
      company_id: companyId,
      actor_user_id: actorId,
      subject_employee_user_id: employeeId,
      command_id: commandId,
      decision_id: decisionId,
      session_id: sessionId,
      punch_event_id: punchId,
      punch_type: "check_in",
      occurred_at: "2026-07-16T04:00:00.000Z",
      work_date: "2026-07-16",
      work_mode: "office",
      source_channel: "mobile",
      origin: "employee_manual_now",
      day_status: "present",
    });
    expect(JSON.stringify(event.payload)).not.toContain("attestation");
    expectNoForbiddenPayloadKeys(event.payload);
  });

  it("allowlists provisional attendance without copying location or device evidence", () => {
    const event = buildProvisionalRecordedEvent({
      companyId,
      actorUserId: actorId,
      subjectEmployeeUserId: employeeId,
      attendanceEventId,
      commandId,
      sourceChannel: "mobile_offline",
      verificationStatus: "unverified",
      provisionalReasonCode: "offline_sync.accepted_unverified",
      capturedAt: "2026-08-03T09:00:00.000+05:30",
      receivedAt: "2026-08-03T03:30:03.000Z",
      location: { latitude: 12.971599, longitude: 77.594566 },
      device_envelope: { nested: { installation_hash: "a".repeat(64) } },
    } as Parameters<typeof buildProvisionalRecordedEvent>[0]);

    expect(event).toMatchObject({
      aggregateId: attendanceEventId,
      eventType: "attendance.provisional.recorded",
      idempotencyKey: `attendance.provisional.recorded:${attendanceEventId}`,
    });
    expect(event.payload).toEqual({
      schema_version: 1,
      company_id: companyId,
      actor_user_id: actorId,
      subject_employee_user_id: employeeId,
      attendance_event_id: attendanceEventId,
      command_id: commandId,
      source_channel: "mobile_offline",
      verification_status: "unverified",
      provisional_reason_code: "offline_sync.accepted_unverified",
      captured_at: "2026-08-03T09:00:00.000+05:30",
      received_at: "2026-08-03T03:30:03.000Z",
    });
    expectNoForbiddenPayloadKeys(event.payload);
  });

  it("allowlists rejected geo attempts without copying geo evaluations", () => {
    const event = buildGeoRejectedEvent({
      companyId,
      actorUserId: actorId,
      subjectEmployeeUserId: employeeId,
      commandId,
      decisionId,
      sourceChannel: "web_geo",
      selectedAction: "deny",
      factualOutcome: "outside_confident",
      reasonCode: "geo_outside_fence",
      fallbackUsed: false,
      decidedAt: "2026-08-03T04:00:00.000Z",
      geoDecision: {
        evaluation: { distance: 18, coordinates: [77.594566, 12.971599] },
      },
      location_evidence: { raw_payload: { accuracy_meters: 8 } },
    } as Parameters<typeof buildGeoRejectedEvent>[0]);

    expect(event).toMatchObject({
      aggregateId: decisionId,
      eventType: "attendance.geo.rejected",
      idempotencyKey: `attendance.geo.rejected:${decisionId}`,
    });
    expect(event.payload).toEqual({
      schema_version: 1,
      company_id: companyId,
      actor_user_id: actorId,
      subject_employee_user_id: employeeId,
      command_id: commandId,
      decision_id: decisionId,
      source_channel: "web_geo",
      selected_action: "deny",
      factual_outcome: "outside_confident",
      reason_code: "geo_outside_fence",
      fallback_used: false,
      decided_at: "2026-08-03T04:00:00.000Z",
    });
    expectNoForbiddenPayloadKeys(event.payload);
  });

  it("allowlists missing-checkout detection once per synthetic checkout punch", () => {
    const event = buildMissingCheckoutDetectedEvent({
      companyId,
      actorUserId: employeeId,
      subjectEmployeeUserId: employeeId,
      attendanceSessionId: sessionId,
      punchEventId: punchId,
      workDate: "2026-08-03",
      occurredAt: "2026-08-03T13:00:00.000Z",
      metadata: { nested: { location: { lat: 12.971599 } } },
    } as Parameters<typeof buildMissingCheckoutDetectedEvent>[0]);

    expect(event).toMatchObject({
      aggregateId: punchId,
      eventType: "attendance.missing_checkout.detected",
      idempotencyKey: `attendance.missing_checkout.detected:${punchId}`,
    });
    expect(event.payload).toEqual({
      schema_version: 1,
      company_id: companyId,
      actor_user_id: employeeId,
      subject_employee_user_id: employeeId,
      attendance_session_id: sessionId,
      punch_event_id: punchId,
      work_date: "2026-08-03",
      occurred_at: "2026-08-03T13:00:00.000Z",
      origin: "system",
    });
    expectNoForbiddenPayloadKeys(event.payload);
  });

  it("does not inherit regularization reasons or remarks", () => {
    const submitted = buildRegularizationSubmittedEvent({
      companyId,
      actorUserId: actorId,
      subjectEmployeeUserId: employeeId,
      regularizationRequestId: requestId,
      assignedApproverUserId: actorId,
      workDate: "2026-07-16",
      status: "pending",
      version: 1,
      reason: "Missed punch because of a private appointment",
      requested_punches: [{ coordinates: [77.594566, 12.971599] }],
    } as Parameters<typeof buildRegularizationSubmittedEvent>[0]);
    const decided = buildRegularizationDecisionEvent({
      companyId,
      actorUserId: actorId,
      subjectEmployeeUserId: employeeId,
      regularizationRequestId: requestId,
      workDate: "2026-07-16",
      decision: "reject",
      previousStatus: "pending",
      nextStatus: "rejected",
      version: 2,
      decidedAt: "2026-07-16T05:00:00.000Z",
      remarks: "Contains private location evidence",
    } as Parameters<typeof buildRegularizationDecisionEvent>[0]);

    expect(submitted.payload).toMatchObject({ schema_version: 1, version: 1 });
    expect(decided.payload).toMatchObject({ schema_version: 1, version: 2 });
    for (const event of [submitted, decided]) {
      expectNoForbiddenPayloadKeys(event.payload);
    }
  });

  it("allowlists exports without export configuration or download capabilities", () => {
    const event = buildExportRequestedEvent({
      companyId,
      actorUserId: actorId,
      exportJobId: exportId,
      format: "csv",
      status: "ready",
      filters: { employee_user_id: employeeId, latitude: 12.971599 },
      columns: ["employee", "coordinates"],
      download_url: "https://example.test/signed-download",
      file_name: "sensitive-export.csv",
    } as Parameters<typeof buildExportRequestedEvent>[0]);

    expect(event.aggregateId).toBe(exportId);
    expect(event.payload).toEqual({
      schema_version: 1,
      company_id: companyId,
      actor_user_id: actorId,
      export_job_id: exportId,
      format: "csv",
      status: "ready",
    });
    expectNoForbiddenPayloadKeys(event.payload);
  });
});
