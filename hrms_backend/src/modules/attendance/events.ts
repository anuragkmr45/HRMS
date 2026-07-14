import type { MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";

export const attendanceEvents = {
  Punched: "attendance.punched",
  RegularizationSubmitted: "attendance.regularization_submitted",
  RegularizationApproved: "attendance.regularization_approved",
  RegularizationReturned: "attendance.regularization_returned",
  RegularizationRejected: "attendance.regularization_rejected",
  ExportRequested: "attendance.export_requested",
} as const;

export function appendAttendanceOutboxEvent(
  store: MemoryDataStore,
  input: {
    aggregateId: string;
    companyId: string;
    eventType: (typeof attendanceEvents)[keyof typeof attendanceEvents];
    payload: Record<string, unknown>;
    idempotencyKey: string;
  },
): void {
  appendOutboxEvent(store, {
    aggregateType: "attendance",
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    payload: { ...input.payload, company_id: input.companyId },
    idempotencyKey: input.idempotencyKey,
  });
}
