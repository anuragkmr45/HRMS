export type AttendanceReviewStatus = "pending" | "approved" | "returned" | "rejected";
export type AttendanceReviewDecision = "approve" | "return" | "reject";
export type AttendanceReviewOperation = "add" | "replace" | "void";

export interface AttendanceReviewEvidence {
  id: string;
  operation: AttendanceReviewOperation | "geo";
  title: string;
  detail: string | null;
  occurredAt: string | null;
}

export interface AttendanceReviewRequest {
  id: string;
  employeeName: string;
  employeeCode: string;
  workDate: string;
  reason: string;
  status: AttendanceReviewStatus;
  version: number;
  createdAt: string | null;
  decidedAt: string | null;
  decisionRemarks: string | null;
  evidence: AttendanceReviewEvidence[];
  canDecide: boolean;
}

export interface AttendanceReviewQueue {
  items: AttendanceReviewRequest[];
  counts: Record<AttendanceReviewStatus | "total", number>;
  page: number;
  pageSize: number;
  total: number;
}

const REVIEW_STATUSES = new Set<AttendanceReviewStatus>([
  "pending",
  "approved",
  "returned",
  "rejected",
]);

const REVIEW_OPERATIONS = new Set<AttendanceReviewOperation>(["add", "replace", "void"]);

const GEO_OUTCOMES = new Set([
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
]);

const GEO_REASON_CODES = new Set([
  "geo_not_required",
  "geo_evidence_missing",
  "geo_permission_denied",
  "geo_location_unavailable",
  "geo_fence_not_configured",
  "geo_inside_fence",
  "geo_outside_fence",
  "geo_boundary_uncertain",
  "geo_stale_evidence",
  "geo_accuracy_exceeded",
  "geo_policy_mode_unknown",
  "geo_action_unknown",
  "geo_manual_fallback_allowed",
  "geo_manual_fallback_disallowed",
]);

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableString(value: unknown): string | null {
  const parsed = stringValue(value).trim();
  return parsed || null;
}

function isoDateTime(value: unknown): string | null {
  const parsed = nullableString(value);
  if (!parsed || Number.isNaN(Date.parse(parsed))) return null;
  return parsed;
}

function humanizeToken(value: unknown, fallback: string): string {
  const token = stringValue(value)
    .trim()
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9_-]+/gu, " ")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!token) return fallback;
  return token.replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function reviewStatus(value: unknown): AttendanceReviewStatus {
  const status = stringValue(value).toLowerCase() as AttendanceReviewStatus;
  return REVIEW_STATUSES.has(status) ? status : "pending";
}

function eventLabel(value: unknown): string {
  return humanizeToken(value, "Attendance punch");
}

function operation(value: unknown): AttendanceReviewOperation {
  const parsed = stringValue(value).toLowerCase() as AttendanceReviewOperation;
  return REVIEW_OPERATIONS.has(parsed) ? parsed : "add";
}

function operationEvidence(itemValue: unknown, index: number): AttendanceReviewEvidence {
  const item = record(itemValue);
  const itemOperation = operation(item.operation);
  const event = eventLabel(item.event_type);
  const occurredAt = isoDateTime(item.occurred_at);
  const title =
    itemOperation === "replace"
      ? `Replace ${event}`
      : itemOperation === "void"
        ? "Remove recorded punch"
        : `Add ${event}`;

  return {
    id: stringValue(item.id, `item-${index + 1}`),
    operation: itemOperation,
    title,
    detail:
      itemOperation === "void"
        ? "The original punch remains in the audit trail."
        : occurredAt
          ? null
          : "Requested time was not supplied.",
    occurredAt,
  };
}

function legacyPunchEvidence(itemValue: unknown, index: number): AttendanceReviewEvidence {
  const item = record(itemValue);
  return {
    id: `legacy-${index + 1}`,
    operation: "add",
    title: `Add ${eventLabel(item.event_type)}`,
    detail: null,
    occurredAt: isoDateTime(item.occurred_at),
  };
}

function safeGeoEvidence(row: Record<string, unknown>): AttendanceReviewEvidence | null {
  const summary = record(row.geo_evidence_summary ?? row.evidence_summary);
  const source = stringValue(summary.source ?? summary.method).toLowerCase();
  const rawOutcome = stringValue(summary.outcome).toLowerCase();
  const rawReasonCode = stringValue(summary.reason_code).toLowerCase();
  const outcome = GEO_OUTCOMES.has(rawOutcome) ? rawOutcome : null;
  const reasonCode = GEO_REASON_CODES.has(rawReasonCode) ? rawReasonCode : null;

  if (!outcome && !reasonCode && source !== "geo" && source !== "location") return null;

  return {
    id: "geo-summary",
    operation: "geo",
    title: `Location evidence: ${humanizeToken(outcome, "Available")}`,
    detail: reasonCode ? `Reason: ${humanizeToken(reasonCode, "Not specified")}` : null,
    occurredAt: isoDateTime(summary.captured_at),
  };
}

function reviewEvidence(row: Record<string, unknown>): AttendanceReviewEvidence[] {
  const normalizedItems = array(row.items);
  const corrections =
    normalizedItems.length > 0
      ? [...normalizedItems]
          .sort(
            (left, right) =>
              numberValue(record(left).ordinal, Number.MAX_SAFE_INTEGER) -
              numberValue(record(right).ordinal, Number.MAX_SAFE_INTEGER),
          )
          .map(operationEvidence)
      : array(row.requested_punches).map(legacyPunchEvidence);
  const geoEvidence = safeGeoEvidence(row);
  return geoEvidence ? [...corrections, geoEvidence] : corrections;
}

function reviewRequest(value: unknown): AttendanceReviewRequest | null {
  const row = record(value);
  const id = stringValue(row.id).trim();
  if (!id) return null;

  const employee = record(row.employee);
  const status = reviewStatus(row.status);
  const version = Math.max(0, Math.trunc(numberValue(row.version)));

  return {
    id,
    employeeName:
      stringValue(employee.full_name ?? row.employee_name ?? row.employee, "Unknown employee") ||
      "Unknown employee",
    employeeCode: stringValue(employee.employee_code ?? row.employee_code, "UNKNOWN") || "UNKNOWN",
    workDate: stringValue(row.work_date ?? row.date),
    reason: stringValue(row.reason, "No reason supplied."),
    status,
    version,
    createdAt: nullableString(row.created_at),
    decidedAt: nullableString(row.decided_at),
    decisionRemarks: nullableString(row.decision_remarks),
    evidence: reviewEvidence(row),
    canDecide: status === "pending" && version > 0,
  };
}

function count(value: unknown): number {
  return Math.max(0, Math.trunc(numberValue(value)));
}

export function parseAttendanceReviewQueue(value: unknown): AttendanceReviewQueue {
  const response = record(value);
  const items = array(response.items)
    .map(reviewRequest)
    .filter((item): item is AttendanceReviewRequest => item !== null);
  const counts = record(response.queue_counts);

  return {
    items,
    counts: {
      total: count(counts.total ?? response.total ?? items.length),
      pending: count(counts.pending),
      approved: count(counts.approved),
      returned: count(counts.returned),
      rejected: count(counts.rejected),
    },
    page: Math.max(1, Math.trunc(numberValue(response.page, 1))),
    pageSize: Math.max(1, Math.trunc(numberValue(response.page_size, 20))),
    total: count(response.total ?? items.length),
  };
}

export function attendanceDecisionRemarksError(
  decision: AttendanceReviewDecision,
  remarks: string,
): string | null {
  const trimmed = remarks.trim();
  if ((decision === "reject" || decision === "return") && !trimmed) {
    return "Remarks are required when rejecting or returning a request.";
  }
  if (trimmed.length > 1000) {
    return "Remarks cannot exceed 1,000 characters.";
  }
  return null;
}

export function formatAttendanceReviewDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (!value || Number.isNaN(parsed.getTime())) return value || "Not available";
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatAttendanceReviewDateTime(value: string | null): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
