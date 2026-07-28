import { expect, test } from "@playwright/test";
import {
  attendanceDecisionRemarksError,
  parseAttendanceReviewQueue,
} from "../src/domains/attendance/manager-review-model";

test.describe("attendance manager review model", () => {
  test("maps normalized regularization items and queue metadata", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "reg-101",
          employee: {
            full_name: "Pratik Sharma",
            employee_code: "EMP-101",
          },
          work_date: "2026-07-18",
          reason: "The office check-out was not recorded.",
          status: "pending",
          version: 4,
          created_at: "2026-07-19T08:30:00.000Z",
          items: [
            {
              id: "item-2",
              ordinal: 2,
              operation: "replace",
              target_punch_event_id: "punch-private",
              event_type: "check_out",
              occurred_at: "2026-07-18T12:30:00.000Z",
            },
            {
              id: "item-1",
              ordinal: 1,
              operation: "void",
              target_punch_event_id: "punch-duplicate",
            },
          ],
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
      queue_counts: {
        total: 7,
        pending: 1,
        approved: 3,
        returned: 2,
        rejected: 1,
      },
    });

    expect(queue).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      counts: {
        total: 7,
        pending: 1,
        approved: 3,
        returned: 2,
        rejected: 1,
      },
    });
    expect(queue.items[0]).toMatchObject({
      id: "reg-101",
      employeeName: "Pratik Sharma",
      employeeCode: "EMP-101",
      workDate: "2026-07-18",
      status: "pending",
      version: 4,
      canDecide: true,
    });
    expect(queue.items[0].evidence).toEqual([
      {
        id: "item-1",
        operation: "void",
        title: "Remove recorded punch",
        detail: "The original punch remains in the audit trail.",
        occurredAt: null,
      },
      {
        id: "item-2",
        operation: "replace",
        title: "Replace Check Out",
        detail: null,
        occurredAt: "2026-07-18T12:30:00.000Z",
      },
    ]);
  });

  test("supports the legacy requested-punches contract", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "legacy-1",
          employee: "Legacy Employee",
          employee_code: "EMP-OLD",
          work_date: "2026-07-01",
          reason: "Missing check-in",
          status: "approved",
          version: 2,
          requested_punches: [
            {
              event_type: "check_in",
              occurred_at: "2026-07-01T03:30:00.000Z",
            },
          ],
        },
      ],
    });

    expect(queue.items[0]).toMatchObject({
      employeeName: "Legacy Employee",
      employeeCode: "EMP-OLD",
      status: "approved",
      canDecide: false,
    });
    expect(queue.items[0].evidence[0]).toMatchObject({
      operation: "add",
      title: "Add Check In",
      occurredAt: "2026-07-01T03:30:00.000Z",
    });
  });

  test("whitelists location evidence and discards raw coordinates", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "geo-1",
          employee: { full_name: "Scoped Employee", employee_code: "EMP-GEO" },
          status: "pending",
          version: 1,
          latitude: 19.076,
          longitude: 72.8777,
          geo_evidence_summary: {
            source: "geo",
            outcome: "outside_confident",
            reason_code: "geo_boundary_uncertain",
            captured_at: "2026-07-18T03:35:00.000Z",
            latitude: 19.076,
            longitude: 72.8777,
            raw_coordinates: "19.076,72.8777",
          },
        },
      ],
    });

    expect(queue.items[0].evidence).toContainEqual({
      id: "geo-summary",
      operation: "geo",
      title: "Location evidence: Outside Confident",
      detail: "Reason: Geo Boundary Uncertain",
      occurredAt: "2026-07-18T03:35:00.000Z",
    });

    const renderedModel = JSON.stringify(queue);
    expect(renderedModel).not.toContain("19.076");
    expect(renderedModel).not.toContain("72.8777");
    expect(renderedModel).not.toContain("raw_coordinates");
  });

  test("fails closed for malformed rows and validates decision remarks", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        { employee: "Missing identifier", status: "pending", version: 1 },
        { id: "no-version", status: "unexpected-status", version: 0 },
      ],
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      id: "no-version",
      status: "pending",
      canDecide: false,
    });
    expect(attendanceDecisionRemarksError("approve", "")).toBeNull();
    expect(attendanceDecisionRemarksError("return", " ")).toContain("required");
    expect(attendanceDecisionRemarksError("reject", "Insufficient evidence")).toBeNull();
    expect(attendanceDecisionRemarksError("approve", "a".repeat(1001))).toContain("1,000");
  });
});
