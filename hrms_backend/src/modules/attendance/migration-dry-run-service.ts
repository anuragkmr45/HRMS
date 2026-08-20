import type { Pool, PoolClient } from "pg";
import type { UUID } from "#shared";
import { canonicalJsonHash } from "./canonical-json.js";
import {
  AttendanceProjectionReplayError,
  PROJECTION_REBUILD_MAX_RANGE_DAYS,
  computeAttendanceProjectionCandidate,
  type AttendanceProjectionCandidateResult,
  type ProjectionRebuildDifferences,
  type SafeProjectionBlock,
  type SafeProjectionDiff,
  type VersionSummary,
} from "./projection-rebuild-service.js";

export type AttendanceMigrationDryRunDayStatus = "match" | "difference" | "blocked";

export type AttendanceMigrationDryRunDiagnosticCode =
  | "soft_deleted_legacy_punch_present"
  | "regularization_superseded"
  | "replacement_or_void_present"
  | "incomplete_session";

export interface AttendanceMigrationDryRunInput {
  companyId: UUID;
  employeeUserId: UUID;
  dateFrom: string;
  dateTo: string;
}

export interface AttendanceMigrationDryRunDiagnostic {
  code: AttendanceMigrationDryRunDiagnosticCode;
  scope: string;
  detail: string;
  evidence: Record<string, unknown>;
}

export interface AttendanceMigrationDryRunDayResult {
  work_date: string;
  status: AttendanceMigrationDryRunDayStatus;
  legacy_daily_record: Record<string, unknown> | null;
  differences: ProjectionRebuildDifferences;
  diagnostics: AttendanceMigrationDryRunDiagnostic[];
  blockers: SafeProjectionBlock[];
}

export interface AttendanceMigrationDryRunResult {
  scope: {
    company_id: UUID;
    employee_user_id: UUID;
    date_from: string;
    date_to: string;
  };
  summary: {
    status: AttendanceMigrationDryRunDayStatus;
    days: number;
    match_days: number;
    difference_days: number;
    blocked_days: number;
    diagnostics: number;
    blockers: number;
  };
  source_counts: {
    legacy_punch_events: number;
    active_legacy_punch_events: number;
    soft_deleted_legacy_punch_events: number;
    regularization_superseded_punch_events: number;
    legacy_daily_records: number;
    candidate_active_punch_facts: number;
  };
  soft_deleted_legacy_punch_evidence: SoftDeletedPunchEvidence[];
  per_day: AttendanceMigrationDryRunDayResult[];
  differences: ProjectionRebuildDifferences;
  diagnostics: AttendanceMigrationDryRunDiagnostic[];
  blockers: SafeProjectionBlock[];
  versions: VersionSummary;
  deterministic_fingerprints: {
    candidate_source: string;
    legacy_source: string;
    report: string;
  };
  safe_to_generate_candidate: boolean;
}

interface NormalizedDryRunInput {
  companyId: UUID;
  employeeUserId: UUID;
  dateFrom: string;
  dateTo: string;
}

interface DryRunContext {
  employeeTimeZone: string;
}

interface PunchSourceRow {
  id: UUID;
  event_type: string;
  occurred_at: Date;
  work_mode: string;
  source: string;
  origin: string;
  regularization_request_id: UUID | null;
  created_at: Date;
  deleted_at: Date | null;
  local_work_date: string;
  metadata: Record<string, unknown> | null;
  regularization_application_id: UUID | null;
  regularization_operation: string | null;
  replacement_punch_event_id: UUID | null;
}

interface SoftDeletedPunchEvidence {
  punch_event_id: UUID;
  work_date: string;
  event_type: string;
  occurred_at: string;
  work_mode: string;
  source: string;
  origin: string;
  regularization_request_id: UUID | null;
  created_at: string;
  deleted_at: string;
  metadata_keys: string[];
  metadata_fingerprint: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export class AttendanceMigrationDryRunService {
  constructor(private readonly pool: Pool) {}

  async run(input: AttendanceMigrationDryRunInput): Promise<AttendanceMigrationDryRunResult> {
    const normalized = normalizeInput(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const candidate = await computeAttendanceProjectionCandidate(client, {
        ...normalized,
        mode: "reconcile",
      });
      const context = await loadDryRunContext(client, normalized);
      const punches = await loadLegacyPunchSources(client, normalized, context.employeeTimeZone);
      const legacyDailyRecords = await loadLegacyDailyRecords(client, normalized);
      const diagnostics = buildDiagnostics(punches, legacyDailyRecords);
      const softDeletedEvidence = softDeletedPunchEvidence(punches);
      const perDay = buildPerDayResults({
        input: normalized,
        candidate,
        legacyDailyRecords,
        punches,
        diagnostics,
      });
      const summary = summarizePerDay(perDay);
      const legacySourceFingerprint = canonicalJsonHash({
        punches: punches.map((punch) => ({
          id: punch.id,
          event_type: punch.event_type,
          occurred_at: punch.occurred_at.toISOString(),
          work_mode: punch.work_mode,
          source: punch.source,
          origin: punch.origin,
          regularization_request_id: punch.regularization_request_id,
          deleted_at: punch.deleted_at?.toISOString() ?? null,
          regularization_application_id: punch.regularization_application_id,
          regularization_operation: punch.regularization_operation,
          replacement_punch_event_id: punch.replacement_punch_event_id,
          metadata_hash: canonicalJsonHash(punch.metadata ?? {}),
        })),
        daily_records: legacyDailyRecords.map((record) => normalizeDates(record)),
      });
      const resultWithoutFingerprints = {
        scope: {
          company_id: normalized.companyId,
          employee_user_id: normalized.employeeUserId,
          date_from: normalized.dateFrom,
          date_to: normalized.dateTo,
        },
        summary,
        source_counts: sourceCounts(punches, legacyDailyRecords, candidate),
        soft_deleted_legacy_punch_evidence: softDeletedEvidence,
        per_day: perDay,
        differences: candidate.differences,
        diagnostics,
        blockers: candidate.differences.blocked,
        versions: candidate.versions,
        safe_to_generate_candidate: candidate.safeToRebuild,
      };
      const reportFingerprint = canonicalJsonHash({
        ...resultWithoutFingerprints,
        deterministic_fingerprints: {
          candidate_source: candidate.sourceFingerprint,
          legacy_source: legacySourceFingerprint,
        },
      });
      await client.query("COMMIT");
      return {
        ...resultWithoutFingerprints,
        deterministic_fingerprints: {
          candidate_source: candidate.sourceFingerprint,
          legacy_source: legacySourceFingerprint,
          report: reportFingerprint,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeInput(input: AttendanceMigrationDryRunInput): NormalizedDryRunInput {
  const checks: Array<[string, string]> = [
    ["company_id", input.companyId],
    ["employee_user_id", input.employeeUserId],
  ];
  for (const [field, value] of checks) {
    if (!uuidPattern.test(value)) {
      throw new AttendanceProjectionReplayError("invalid_uuid", `${field} must be a UUID.`);
    }
  }
  if (!isStrictIsoDate(input.dateFrom) || !isStrictIsoDate(input.dateTo)) {
    throw new AttendanceProjectionReplayError("invalid_date", "date_from and date_to must use YYYY-MM-DD.");
  }
  if (input.dateFrom > input.dateTo) {
    throw new AttendanceProjectionReplayError("invalid_date_range", "date_from must be on or before date_to.");
  }
  if (datesBetween(input.dateFrom, input.dateTo).length > PROJECTION_REBUILD_MAX_RANGE_DAYS) {
    throw new AttendanceProjectionReplayError("date_range_too_large", `Migration dry-run range cannot exceed ${PROJECTION_REBUILD_MAX_RANGE_DAYS} days.`);
  }
  return input;
}

async function loadDryRunContext(
  client: PoolClient,
  input: NormalizedDryRunInput,
): Promise<DryRunContext> {
  const row = (await client.query<{
    company_timezone: string | null;
    employee_timezone: string | null;
  }>(
    `SELECT company.timezone AS company_timezone, employee.timezone AS employee_timezone
     FROM platform.company_profiles company
     JOIN platform.user_session_preferences preference
       ON preference.company_id = company.id
      AND preference.user_id = $2
     JOIN core.users employee
       ON employee.id = preference.user_id
      AND employee.deleted_at IS NULL
     WHERE company.id = $1
       AND company.status = 'active'`,
    [input.companyId, input.employeeUserId],
  )).rows[0];
  if (!row) {
    throw new AttendanceProjectionReplayError("projection_context_missing", "Company or employee context is unavailable.");
  }
  return { employeeTimeZone: row.employee_timezone ?? row.company_timezone ?? "UTC" };
}

async function loadLegacyPunchSources(
  client: PoolClient,
  input: NormalizedDryRunInput,
  timeZone: string,
): Promise<PunchSourceRow[]> {
  return (await client.query<PunchSourceRow>(
    `SELECT punch.id, punch.event_type, punch.occurred_at, punch.work_mode,
        punch.source, punch.origin, punch.regularization_request_id,
        punch.created_at, punch.deleted_at,
        (punch.occurred_at AT TIME ZONE $3)::date::text AS local_work_date,
        punch.metadata,
        application.id AS regularization_application_id,
        application.operation AS regularization_operation,
        application.replacement_punch_event_id
     FROM attendance.punch_events punch
     LEFT JOIN attendance.regularization_correction_applications application
       ON application.company_id = punch.company_id
      AND application.target_punch_event_id = punch.id
     WHERE punch.company_id = $1
       AND punch.employee_user_id = $2
       AND (punch.occurred_at AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date
     ORDER BY punch.occurred_at, punch.id`,
    [input.companyId, input.employeeUserId, timeZone, input.dateFrom, input.dateTo],
  )).rows;
}

async function loadLegacyDailyRecords(
  client: PoolClient,
  input: NormalizedDryRunInput,
): Promise<Record<string, unknown>[]> {
  return (await client.query<Record<string, unknown>>(
    `SELECT company_id, employee_user_id, work_date::text, status, day_classification, presence_state,
        punctuality_state, evidence_state, approval_kind, approval_state,
        payroll_state, first_check_in, last_check_out, work_minutes,
        break_minutes, late_minutes, early_out_minutes, work_seconds,
        break_seconds, scheduled_seconds, late_seconds,
        early_departure_seconds, work_mode, note, exception_type,
        regularization_status
     FROM attendance.daily_records
     WHERE company_id = $1
       AND employee_user_id = $2
       AND work_date BETWEEN $3::date AND $4::date
       AND deleted_at IS NULL
     ORDER BY work_date`,
    [input.companyId, input.employeeUserId, input.dateFrom, input.dateTo],
  )).rows.map(normalizeDates);
}

function buildDiagnostics(
  punches: PunchSourceRow[],
  legacyDailyRecords: Record<string, unknown>[],
): AttendanceMigrationDryRunDiagnostic[] {
  const diagnostics: AttendanceMigrationDryRunDiagnostic[] = [];
  for (const punch of punches) {
    if (punch.deleted_at) {
      diagnostics.push({
        code: "soft_deleted_legacy_punch_present",
        scope: `punch_events:${punch.id}`,
        detail: "Legacy punch is soft-deleted and is reported as migration evidence, but is not used as an active candidate fact.",
        evidence: {
          punch_event_id: punch.id,
          work_date: punch.local_work_date,
          event_type: punch.event_type,
          occurred_at: punch.occurred_at.toISOString(),
          deleted_at: punch.deleted_at.toISOString(),
        },
      });
    }
    if (punch.regularization_application_id) {
      diagnostics.push({
        code: "regularization_superseded",
        scope: `punch_events:${punch.id}`,
        detail: "Legacy punch is superseded by a regularization correction application.",
        evidence: {
          punch_event_id: punch.id,
          work_date: punch.local_work_date,
          regularization_application_id: punch.regularization_application_id,
          operation: punch.regularization_operation,
          replacement_punch_event_id: punch.replacement_punch_event_id,
        },
      });
    }
    if (punch.regularization_operation === "replace" || punch.regularization_operation === "void") {
      diagnostics.push({
        code: "replacement_or_void_present",
        scope: `punch_events:${punch.id}`,
        detail: "Legacy punch participates in an approved replacement or void correction.",
        evidence: {
          punch_event_id: punch.id,
          work_date: punch.local_work_date,
          operation: punch.regularization_operation,
          replacement_punch_event_id: punch.replacement_punch_event_id,
        },
      });
    }
  }
  for (const record of legacyDailyRecords) {
    if (
      record.presence_state === "incomplete" ||
      (record.first_check_in && !record.last_check_out) ||
      record.exception_type === "missing_punch"
    ) {
      diagnostics.push({
        code: "incomplete_session",
        scope: `daily_records:${String(record.work_date)}`,
        detail: "Stored legacy daily record indicates incomplete or missing-punch attendance evidence.",
        evidence: {
          work_date: record.work_date,
          presence_state: record.presence_state,
          exception_type: record.exception_type,
          first_check_in: record.first_check_in,
          last_check_out: record.last_check_out,
        },
      });
    }
  }
  return diagnostics.sort(compareBy("code", "scope"));
}

function softDeletedPunchEvidence(punches: PunchSourceRow[]): SoftDeletedPunchEvidence[] {
  return punches
    .filter((punch) => punch.deleted_at)
    .map((punch) => ({
      punch_event_id: punch.id,
      work_date: punch.local_work_date,
      event_type: punch.event_type,
      occurred_at: punch.occurred_at.toISOString(),
      work_mode: punch.work_mode,
      source: punch.source,
      origin: punch.origin,
      regularization_request_id: punch.regularization_request_id,
      created_at: punch.created_at.toISOString(),
      deleted_at: punch.deleted_at!.toISOString(),
      metadata_keys: Object.keys(punch.metadata ?? {}).sort(),
      metadata_fingerprint: canonicalJsonHash(punch.metadata ?? {}),
    }));
}

function buildPerDayResults(input: {
  input: NormalizedDryRunInput;
  candidate: AttendanceProjectionCandidateResult;
  legacyDailyRecords: Record<string, unknown>[];
  punches: PunchSourceRow[];
  diagnostics: AttendanceMigrationDryRunDiagnostic[];
}): AttendanceMigrationDryRunDayResult[] {
  const legacyDailyByDate = new Map(input.legacyDailyRecords.map((record) => [String(record.work_date), record]));
  const punchDateById = new Map(input.punches.map((punch) => [punch.id, punch.local_work_date]));
  return datesBetween(input.input.dateFrom, input.input.dateTo).map((workDate) => {
    const blockers = input.candidate.differences.blocked.filter((item) =>
      blockAppliesToDate(item, workDate, punchDateById)
    );
    const differences = filterDifferencesForDate(input.candidate.differences, workDate);
    const hasDifference = hasAnyDifference(differences);
    const status: AttendanceMigrationDryRunDayStatus = blockers.length > 0
      ? "blocked"
      : hasDifference
        ? "difference"
        : "match";
    return {
      work_date: workDate,
      status,
      legacy_daily_record: legacyDailyByDate.get(workDate) ?? null,
      differences,
      diagnostics: input.diagnostics.filter((item) =>
        diagnosticAppliesToDate(item, workDate, punchDateById)
      ),
      blockers,
    };
  });
}

function filterDifferencesForDate(
  differences: ProjectionRebuildDifferences,
  workDate: string,
): ProjectionRebuildDifferences {
  return {
    missing: filterDifferenceGroupForDate(differences.missing, workDate),
    unexpected: filterDifferenceGroupForDate(differences.unexpected, workDate),
    changed: filterDifferenceGroupForDate(differences.changed, workDate),
    blocked: differences.blocked.filter((item) => dateFromScope(item.scope) === workDate),
  };
}

function filterDifferenceGroupForDate(
  group: ProjectionRebuildDifferences["missing"],
  workDate: string,
): ProjectionRebuildDifferences["missing"] {
  return {
    sessions: group.sessions.filter((item) => diffAppliesToDate(item, workDate)),
    break_segments: group.break_segments.filter((item) => diffAppliesToDate(item, workDate)),
    daily_records: group.daily_records.filter((item) => item.key === workDate),
  };
}

function diffAppliesToDate(item: SafeProjectionDiff, workDate: string): boolean {
  return item.key === workDate || item.key.startsWith(`${workDate}:`);
}

function blockAppliesToDate(
  block: SafeProjectionBlock,
  workDate: string,
  punchDateById: ReadonlyMap<UUID, string>,
): boolean {
  const scopedDate = dateFromScope(block.scope);
  if (scopedDate) return scopedDate === workDate;
  if (block.scope.startsWith("punch_events:")) {
    return punchDateById.get(block.scope.slice("punch_events:".length) as UUID) === workDate;
  }
  return block.scope === "range";
}

function diagnosticAppliesToDate(
  diagnostic: AttendanceMigrationDryRunDiagnostic,
  workDate: string,
  punchDateById: ReadonlyMap<UUID, string>,
): boolean {
  const evidenceDate = diagnostic.evidence.work_date;
  if (evidenceDate === workDate) return true;
  if (diagnostic.scope.startsWith("daily_records:")) {
    return diagnostic.scope.slice("daily_records:".length) === workDate;
  }
  if (diagnostic.scope.startsWith("punch_events:")) {
    return punchDateById.get(diagnostic.scope.slice("punch_events:".length) as UUID) === workDate;
  }
  return false;
}

function hasAnyDifference(differences: ProjectionRebuildDifferences): boolean {
  return (
    differences.missing.sessions.length > 0 ||
    differences.missing.break_segments.length > 0 ||
    differences.missing.daily_records.length > 0 ||
    differences.unexpected.sessions.length > 0 ||
    differences.unexpected.break_segments.length > 0 ||
    differences.unexpected.daily_records.length > 0 ||
    differences.changed.sessions.length > 0 ||
    differences.changed.break_segments.length > 0 ||
    differences.changed.daily_records.length > 0
  );
}

function summarizePerDay(perDay: AttendanceMigrationDryRunDayResult[]): AttendanceMigrationDryRunResult["summary"] {
  const matchDays = perDay.filter((day) => day.status === "match").length;
  const differenceDays = perDay.filter((day) => day.status === "difference").length;
  const blockedDays = perDay.filter((day) => day.status === "blocked").length;
  return {
    status: blockedDays > 0 ? "blocked" : differenceDays > 0 ? "difference" : "match",
    days: perDay.length,
    match_days: matchDays,
    difference_days: differenceDays,
    blocked_days: blockedDays,
    diagnostics: perDay.reduce((total, day) => total + day.diagnostics.length, 0),
    blockers: perDay.reduce((total, day) => total + day.blockers.length, 0),
  };
}

function sourceCounts(
  punches: PunchSourceRow[],
  legacyDailyRecords: Record<string, unknown>[],
  candidate: AttendanceProjectionCandidateResult,
): AttendanceMigrationDryRunResult["source_counts"] {
  return {
    legacy_punch_events: punches.length,
    active_legacy_punch_events: punches.filter((punch) => !punch.deleted_at).length,
    soft_deleted_legacy_punch_events: punches.filter((punch) => punch.deleted_at).length,
    regularization_superseded_punch_events: punches.filter((punch) => punch.regularization_application_id).length,
    legacy_daily_records: legacyDailyRecords.length,
    candidate_active_punch_facts: candidate.sourceRecordCount,
  };
}

function dateFromScope(scope: string): string | null {
  const value = scope.split(":")[1];
  return value && isStrictIsoDate(value) ? value : null;
}

function normalizeDates(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ]));
}

function isStrictIsoDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day;
}

function datesBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (current.getTime() <= end.getTime()) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

function compareBy<T>(...keys: string[]) {
  return (left: T, right: T) => {
    for (const key of keys) {
      const leftValue = String((left as Record<string, unknown>)[key] ?? "");
      const rightValue = String((right as Record<string, unknown>)[key] ?? "");
      const comparison = leftValue.localeCompare(rightValue);
      if (comparison !== 0) return comparison;
    }
    return 0;
  };
}
