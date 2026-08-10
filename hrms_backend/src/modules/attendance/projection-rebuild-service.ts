import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AttendanceDayRecord, AttendancePunchEventType, UUID } from "#shared";
import {
  AttendanceDayClassifications,
  AttendancePunchEventTypes,
  Roles,
} from "#shared";
import { forbidden } from "../../platform/errors.js";
import { isWorkingDate } from "../../platform/work-schedule.js";
import { canonicalJsonHash } from "./canonical-json.js";
import { ATTENDANCE_GEO_EVALUATOR_VERSION } from "./command-repository.js";
import {
  calculateSessionDurations,
  projectAttendanceDay,
  type AttendanceApprovalFact,
  type AttendanceDailyProjection,
} from "./daily-projection.js";

export type ProjectionRebuildMode = "reconcile" | "rebuild";
export type ProjectionRebuildStatus = "succeeded" | "failed";

export const PROJECTION_REBUILD_MAX_RANGE_DAYS = 62;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const recognizedEvaluatorVersions = new Set([
  ATTENDANCE_GEO_EVALUATOR_VERSION,
  "attendance-geo-v1",
]);

export class AttendanceProjectionReplayError extends Error {
  constructor(
    public readonly replayCode: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AttendanceProjectionRebuildInput {
  companyId: UUID;
  employeeUserId: UUID;
  requestedByUserId: UUID;
  dateFrom: string;
  dateTo: string;
  mode?: ProjectionRebuildMode;
}

export interface ProjectionDifferenceGroup {
  sessions: SafeProjectionDiff[];
  break_segments: SafeProjectionDiff[];
  daily_records: SafeProjectionDiff[];
}

export interface ProjectionRebuildDifferences {
  missing: ProjectionDifferenceGroup;
  unexpected: ProjectionDifferenceGroup;
  changed: ProjectionDifferenceGroup;
  blocked: SafeProjectionBlock[];
}

export interface AttendanceProjectionRebuildResult {
  run_id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  requested_date_range: { date_from: string; date_to: string };
  mode: ProjectionRebuildMode;
  status: ProjectionRebuildStatus;
  effective_source_record_count: number;
  deterministic_source_fingerprint: string;
  versions_encountered: VersionSummary;
  existing_projection_counts: ProjectionCounts;
  expected_projection_counts: ProjectionCounts;
  differences: ProjectionRebuildDifferences;
  safe_to_rebuild: boolean;
  rows_written: ProjectionRowsWritten;
  failure_code: string | null;
  sanitized_failure_details: string | null;
}

interface SafeProjectionDiff {
  key: string;
  existing?: Record<string, unknown> | null;
  expected?: Record<string, unknown> | null;
}

interface SafeProjectionBlock {
  code: string;
  scope: string;
  detail: string;
}

interface ProjectionCounts {
  sessions: number;
  break_segments: number;
  daily_records: number;
}

interface ProjectionRowsWritten {
  sessions_deleted: number;
  break_segments_deleted: number;
  sessions_inserted: number;
  break_segments_inserted: number;
  daily_records_upserted: number;
}

interface VersionSummary {
  evaluator_versions: string[];
  policy_versions: string[];
  policy_version_ids: string[];
  shift_instance_ids: string[];
  shift_template_version_ids: string[];
}

interface UserContext {
  id: UUID;
  timezone: string | null;
  roles: string[];
  company_id: UUID | null;
  employment_status: string;
}

interface CompanyContext {
  id: UUID;
  timezone: string;
  working_week: string;
}

interface ShiftInstanceRow {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  work_date: string;
  template_version_id: UUID;
  resolved_timezone: string;
  scheduled_start_at: Date;
  scheduled_end_at: Date;
  eligibility_start_at: Date;
  eligibility_end_at: Date;
}

interface PunchFactRow {
  id: UUID;
  session_id: UUID | null;
  event_type: AttendancePunchEventType;
  occurred_at: Date;
  work_mode: AttendanceDayRecord["work_mode"];
  source: string;
  origin: string;
  metadata: Record<string, unknown> | null;
  command_execution_id: UUID | null;
  command_origin: string | null;
  command_type: AttendancePunchEventType | null;
  command_decision_id: UUID | null;
  command_outcome: "allowed" | "denied" | null;
  previous_state: string | null;
  next_state: string | null;
  regularization_application_id: UUID | null;
  regularization_operation: string | null;
  policy_snapshot: Record<string, unknown> | null;
  evidence_snapshot: Record<string, unknown> | null;
  audit_decision_id: UUID | null;
  audit_outcome: "passed" | "failed" | "not_applicable" | "indeterminate" | null;
  audit_policy_version: string | null;
  evaluator_version: string | null;
  evaluation_context: Record<string, unknown> | null;
}

interface ExpectedSession {
  id: UUID;
  key: string;
  work_date: string;
  checked_in_at: string;
  closed_at: string;
  last_transition_at: string;
  work_mode: AttendanceDayRecord["work_mode"];
  source: string;
  metadata: Record<string, unknown>;
  temp_id: string;
  policy_snapshot: Record<string, unknown>;
}

interface ExpectedBreak {
  id: UUID;
  key: string;
  session_key: string;
  session_id: UUID;
  started_at: string;
  ended_at: string;
}

interface ExpectedProjection {
  sessions: ExpectedSession[];
  breaks: ExpectedBreak[];
  dailyRecords: AttendanceDailyProjection[];
}

interface ExistingProjection {
  sessions: SafeProjectionDiff[];
  breaks: SafeProjectionDiff[];
  dailyRecords: SafeProjectionDiff[];
  counts: ProjectionCounts;
}

interface ComputedProjectionResult {
  sourceRecordCount: number;
  sourceFingerprint: string;
  versions: VersionSummary;
  existingCounts: ProjectionCounts;
  expectedCounts: ProjectionCounts;
  differences: ProjectionRebuildDifferences;
  safeToRebuild: boolean;
  expected: ExpectedProjection;
}

export class AttendanceProjectionRebuildService {
  constructor(private readonly pool: Pool) {}

  async run(input: AttendanceProjectionRebuildInput): Promise<AttendanceProjectionRebuildResult> {
    const normalized = normalizeInput(input);
    let runId: UUID | null = null;
    try {
      await this.validateTenantAndAuthorization(this.pool, normalized);
      const started = await this.createStartedRun(normalized);
      runId = started.runId;
      const result = normalized.mode === "rebuild"
        ? await this.runRebuildTransaction(runId, normalized)
        : await this.runReconcileTransaction(runId, normalized);
      return result;
    } catch (error) {
      if (runId) {
        const failure = failureFromError(error);
        await this.markRunFailed(runId, failure.code, failure.details).catch(() => undefined);
      }
      throw error;
    }
  }

  private async createStartedRun(input: Required<AttendanceProjectionRebuildInput>) {
    const result = await this.pool.query<{ id: UUID }>(
      `INSERT INTO attendance.projection_rebuild_runs (
         company_id, employee_user_id, requested_by_user_id, mode, date_from,
         date_to, status, source_record_count, source_fingerprint,
         difference_summary, version_summary, rows_written, started_at
       )
       VALUES ($1,$2,$3,$4,$5::date,$6::date,'started',0,'pending','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,transaction_timestamp())
       RETURNING id`,
      [input.companyId, input.employeeUserId, input.requestedByUserId, input.mode, input.dateFrom, input.dateTo],
    );
    const runId = result.rows[0]?.id;
    if (!runId) throw new AttendanceProjectionReplayError("run_create_failed", "Projection rebuild run could not be created.");
    return { runId };
  }

  private async runReconcileTransaction(
    runId: UUID,
    input: Required<AttendanceProjectionRebuildInput>,
  ): Promise<AttendanceProjectionRebuildResult> {
    return this.inTransaction(async (client) => {
      await this.validateTenantAndAuthorization(client, input);
      await this.lockExistingEmployeeCommandState(client, input.companyId, input.employeeUserId);
      await this.acquireEmployeeAdvisoryLock(client, input.companyId, input.employeeUserId);
      const computed = await this.compute(client, input, false);
      const rowsWritten = emptyRowsWritten();
      await this.completeRun(client, runId, "succeeded", computed, rowsWritten);
      return resultFromComputed(runId, input, "succeeded", computed, rowsWritten, null, null);
    });
  }

  private async runRebuildTransaction(
    runId: UUID,
    input: Required<AttendanceProjectionRebuildInput>,
  ): Promise<AttendanceProjectionRebuildResult> {
    return this.inTransaction(async (client) => {
      await this.validateTenantAndAuthorization(client, input);
      await this.lockExistingEmployeeCommandState(client, input.companyId, input.employeeUserId);
      await this.acquireEmployeeAdvisoryLock(client, input.companyId, input.employeeUserId);
      const computed = await this.compute(client, input, true);
      if (!computed.safeToRebuild) {
        throw new AttendanceProjectionReplayError("range_not_safe_to_rebuild", "Projection rebuild range is blocked.");
      }
      const rowsWritten = await this.replaceProjections(client, input, computed.expected);
      await this.completeRun(client, runId, "succeeded", computed, rowsWritten);
      return resultFromComputed(runId, input, "succeeded", computed, rowsWritten, null, null);
    });
  }

  private async compute(
    client: PoolClient,
    input: Required<AttendanceProjectionRebuildInput>,
    failOnBlocked: boolean,
  ) {
    const context = await loadCompanyEmployeeContext(client, input.companyId, input.employeeUserId);
    const shifts = await loadShiftInstances(client, input.companyId, input.employeeUserId, input.dateFrom, input.dateTo);
    const blocks: SafeProjectionBlock[] = [];
    blocks.push(...shiftAmbiguityBlocks(shifts.rows));
    const requestedDates = datesBetween(input.dateFrom, input.dateTo);
    for (const date of requestedDates) {
      if (!shifts.byDate.has(date)) {
        blocks.push(block("missing_shift_instance", `daily_records:${date}`, "Historical shift instance is required for projection replay."));
      }
    }
    if (input.mode === "rebuild") {
      const currentLocalDate = dateInTimeZone(new Date().toISOString(), context.employeeTimeZone);
      if (input.dateFrom <= currentLocalDate && currentLocalDate <= input.dateTo) {
        blocks.push(block("current_local_date_in_range", "range", "Historical rebuild cannot include the employee current local attendance date."));
      }
    }

    const boundary = shiftBoundary(shifts.rows);
    const rawFacts = boundary
      ? await loadEffectivePunchFacts(client, input.companyId, input.employeeUserId, boundary.from, boundary.to)
      : [];
    const validation = validatePunchFacts(rawFacts);
    blocks.push(...validation.blocks);

    const replay = replayPunchFacts(rawFacts, shifts.rows, input.companyId, input.employeeUserId, input.dateFrom, input.dateTo);
    blocks.push(...replay.blocks);
    const openBlocks = await loadMutableBoundaryBlocks(client, input.companyId, input.employeeUserId, input.dateFrom, input.dateTo);
    blocks.push(...openBlocks);

    const dailyBlocks: SafeProjectionBlock[] = [];
    const expected = await buildExpectedDaily(
      client,
      input,
      context,
      shifts,
      replay.projection,
      blockedWorkDates(blocks, rawFacts, context.employeeTimeZone),
      dailyBlocks,
    );
    blocks.push(...dailyBlocks);
    const existing = await loadExistingProjection(client, input.companyId, input.employeeUserId, input.dateFrom, input.dateTo);
    const differences = diffProjection(existing, expected, blocks);
    const versions = summarizeVersions(rawFacts, shifts.rows, validation.evaluatorVersions);
    const fingerprint = canonicalJsonHash({
      facts: rawFacts.map((fact) => ({
        id: fact.id,
        session_id: fact.session_id,
        event_type: fact.event_type,
        occurred_at: fact.occurred_at.toISOString(),
        work_mode: fact.work_mode,
        source: fact.source,
        origin: fact.origin,
        command_execution_id: fact.command_execution_id,
        command_origin: fact.command_origin,
        command_type: fact.command_type,
        command_decision_id: fact.command_decision_id,
        command_outcome: fact.command_outcome,
        previous_state: fact.previous_state,
        next_state: fact.next_state,
        audit_decision_id: fact.audit_decision_id,
        audit_outcome: fact.audit_outcome,
        audit_policy_version: fact.audit_policy_version,
        evaluator_version: evaluatorVersionFor(fact),
        policy_snapshot_hash: canonicalJsonHash(fact.policy_snapshot ?? {}),
        evaluation_context_hash: canonicalJsonHash(safeEvaluationContext(fact.evaluation_context)),
      })),
      shifts: shifts.rows.map((shift) => ({
        id: shift.id,
        work_date: shift.work_date,
        template_version_id: shift.template_version_id,
        resolved_timezone: shift.resolved_timezone,
        scheduled_start_at: shift.scheduled_start_at.toISOString(),
        scheduled_end_at: shift.scheduled_end_at.toISOString(),
        eligibility_start_at: shift.eligibility_start_at.toISOString(),
        eligibility_end_at: shift.eligibility_end_at.toISOString(),
      })),
    });
    if (failOnBlocked && blocks.length > 0) {
      throw new AttendanceProjectionReplayError(blocks[0]!.code, blocks[0]!.detail);
    }
    return {
      sourceRecordCount: rawFacts.length,
      sourceFingerprint: fingerprint,
      versions,
      existingCounts: existing.counts,
      expectedCounts: countsForExpected(expected),
      differences,
      safeToRebuild: blocks.length === 0,
      expected,
    };
  }

  private async replaceProjections(
    client: PoolClient,
    input: Required<AttendanceProjectionRebuildInput>,
    expected: ExpectedProjection,
  ): Promise<ProjectionRowsWritten> {
    const targetSessionIds = (await client.query<{ id: UUID }>(
      `SELECT id
       FROM attendance.sessions
       WHERE company_id = $1 AND employee_user_id = $2
         AND work_date BETWEEN $3::date AND $4::date
         AND deleted_at IS NULL
       ORDER BY work_date, checked_in_at, id
       FOR UPDATE`,
      [input.companyId, input.employeeUserId, input.dateFrom, input.dateTo],
    )).rows.map((row) => row.id);
    const expectedSessionIds = expected.sessions.map((session) => session.id);
    const expectedBreakIds = expected.breaks.map((segment) => segment.id);
    const expectedSessionIdSet = new Set(expectedSessionIds);
    const staleSessionIds = targetSessionIds.filter((id) => !expectedSessionIdSet.has(id));
    const breakDelete = targetSessionIds.length === 0
      ? { rowCount: 0 }
      : await client.query(
          `DELETE FROM attendance.break_segments
           WHERE company_id = $1
             AND session_id = ANY($2::uuid[])
             AND id <> ALL($3::uuid[])`,
          [input.companyId, targetSessionIds, expectedBreakIds],
        );
    const sessionDelete = staleSessionIds.length === 0
      ? { rowCount: 0 }
      : await client.query(
          `UPDATE attendance.sessions
           SET deleted_at = transaction_timestamp(),
               updated_at = transaction_timestamp(),
               version = version + 1
           WHERE company_id = $1
             AND employee_user_id = $2
             AND id = ANY($3::uuid[])
             AND deleted_at IS NULL`,
          [input.companyId, input.employeeUserId, staleSessionIds],
        );

    const existingBreakRows = expectedBreakIds.length === 0
      ? []
      : (await client.query<{
          id: UUID;
          session_id: UUID;
          started_at: Date;
          ended_at: Date | null;
        }>(
          `SELECT id, session_id, started_at, ended_at
           FROM attendance.break_segments
           WHERE company_id = $1
             AND id = ANY($2::uuid[])
           FOR UPDATE`,
          [input.companyId, expectedBreakIds],
        )).rows;
    const existingBreakById = new Map(existingBreakRows.map((row) => [row.id, row]));
    const breakIdsNeedingWrite = new Set(
      expected.breaks
        .filter((segment) => {
          const current = existingBreakById.get(segment.id);
          return !current ||
            current.session_id !== segment.session_id ||
            current.started_at.toISOString() !== segment.started_at ||
            current.ended_at?.toISOString() !== segment.ended_at;
        })
        .map((segment) => segment.id),
    );
    const sessionIdsNeedingOpenBreakWrites = new Set(
      expected.breaks
        .filter((segment) => breakIdsNeedingWrite.has(segment.id))
        .map((segment) => segment.session_id),
    );

    const sessionIdsWritten = new Set<UUID>();
    for (const session of expected.sessions) {
      const status = sessionIdsNeedingOpenBreakWrites.has(session.id) ? "working" : "closed";
      const closedAt = status === "working" ? null : session.closed_at;
      const lastTransitionAt = status === "working" ? session.checked_in_at : session.last_transition_at;
      const written = await client.query(
        `INSERT INTO attendance.sessions (
           id, company_id, employee_user_id, work_date, status, checked_in_at,
           closed_at, last_transition_at, work_mode, source, metadata,
           version, created_at, updated_at, deleted_at
         )
         VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11::jsonb,1,transaction_timestamp(),transaction_timestamp(),NULL)
         ON CONFLICT (id) DO UPDATE SET
           work_date = EXCLUDED.work_date,
           status = EXCLUDED.status,
           checked_in_at = EXCLUDED.checked_in_at,
           closed_at = EXCLUDED.closed_at,
           last_transition_at = EXCLUDED.last_transition_at,
           work_mode = EXCLUDED.work_mode,
           source = EXCLUDED.source,
           metadata = EXCLUDED.metadata,
           deleted_at = NULL,
           version = attendance.sessions.version + 1,
           updated_at = transaction_timestamp()
         WHERE attendance.sessions.company_id = EXCLUDED.company_id
           AND attendance.sessions.employee_user_id = EXCLUDED.employee_user_id
           AND (
             attendance.sessions.work_date IS DISTINCT FROM EXCLUDED.work_date
             OR attendance.sessions.status IS DISTINCT FROM EXCLUDED.status
             OR attendance.sessions.checked_in_at IS DISTINCT FROM EXCLUDED.checked_in_at
             OR attendance.sessions.closed_at IS DISTINCT FROM EXCLUDED.closed_at
             OR attendance.sessions.last_transition_at IS DISTINCT FROM EXCLUDED.last_transition_at
             OR attendance.sessions.work_mode IS DISTINCT FROM EXCLUDED.work_mode
             OR attendance.sessions.source IS DISTINCT FROM EXCLUDED.source
             OR attendance.sessions.metadata IS DISTINCT FROM EXCLUDED.metadata
             OR attendance.sessions.deleted_at IS NOT NULL
           )`,
        [
          session.id,
          input.companyId,
          input.employeeUserId,
          session.work_date,
          status,
          session.checked_in_at,
          closedAt,
          lastTransitionAt,
          session.work_mode,
          session.source,
          JSON.stringify(session.metadata),
        ],
      );
      if ((written.rowCount ?? 0) > 0) sessionIdsWritten.add(session.id);
    }
    let breakRowsWritten = 0;
    for (const segment of expected.breaks) {
      if (!expectedSessionIdSet.has(segment.session_id)) throw new AttendanceProjectionReplayError("break_session_missing", "Break segment references a missing rebuilt session.");
      if (!breakIdsNeedingWrite.has(segment.id)) continue;
      const written = await client.query(
        `INSERT INTO attendance.break_segments (
           id, company_id, session_id, started_at, ended_at, created_at, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,transaction_timestamp(),transaction_timestamp())
         ON CONFLICT (id) DO UPDATE SET
           session_id = EXCLUDED.session_id,
           started_at = EXCLUDED.started_at,
           ended_at = EXCLUDED.ended_at,
           updated_at = transaction_timestamp()
         WHERE attendance.break_segments.company_id = EXCLUDED.company_id
           AND (
             attendance.break_segments.session_id IS DISTINCT FROM EXCLUDED.session_id
             OR attendance.break_segments.started_at IS DISTINCT FROM EXCLUDED.started_at
             OR attendance.break_segments.ended_at IS DISTINCT FROM EXCLUDED.ended_at
           )`,
        [segment.id, input.companyId, segment.session_id, segment.started_at, segment.ended_at],
      );
      breakRowsWritten += written.rowCount ?? 0;
    }
    for (const session of expected.sessions) {
      if (!sessionIdsNeedingOpenBreakWrites.has(session.id)) continue;
      const written = await client.query(
        `UPDATE attendance.sessions
         SET status = 'closed',
             closed_at = $4,
             last_transition_at = $5,
             updated_at = transaction_timestamp(),
             version = version + 1
         WHERE company_id = $1
           AND employee_user_id = $2
           AND id = $3
           AND (
             status IS DISTINCT FROM 'closed'
             OR closed_at IS DISTINCT FROM $4
             OR last_transition_at IS DISTINCT FROM $5
           )`,
        [input.companyId, input.employeeUserId, session.id, session.closed_at, session.last_transition_at],
      );
      if ((written.rowCount ?? 0) > 0) sessionIdsWritten.add(session.id);
    }
    let dailyRowsWritten = 0;
    for (const day of expected.dailyRecords) {
      dailyRowsWritten += await upsertDailyRecord(client, day);
    }
    return {
      sessions_deleted: sessionDelete.rowCount ?? 0,
      break_segments_deleted: breakDelete.rowCount ?? 0,
      sessions_inserted: sessionIdsWritten.size,
      break_segments_inserted: breakRowsWritten,
      daily_records_upserted: dailyRowsWritten,
    };
  }

  private async completeRun(
    client: PoolClient,
    runId: UUID,
    status: ProjectionRebuildStatus,
    computed: ComputedProjectionResult,
    rowsWritten: ProjectionRowsWritten,
  ): Promise<void> {
    await client.query(
      `UPDATE attendance.projection_rebuild_runs
       SET status = $2,
           source_record_count = $3,
           source_fingerprint = $4,
           difference_summary = $5::jsonb,
           version_summary = $6::jsonb,
           rows_written = $7::jsonb,
           completed_at = transaction_timestamp(),
           failure_code = NULL,
           sanitized_failure_details = NULL
       WHERE id = $1`,
      [
        runId,
        status,
        computed.sourceRecordCount,
        computed.sourceFingerprint,
        JSON.stringify(computed.differences),
        JSON.stringify(computed.versions),
        JSON.stringify(rowsWritten),
      ],
    );
  }

  private async markRunFailed(runId: UUID, code: string, details: string): Promise<void> {
    await this.pool.query(
      `UPDATE attendance.projection_rebuild_runs
       SET status = 'failed',
           failure_code = $2,
           sanitized_failure_details = $3,
           completed_at = transaction_timestamp()
       WHERE id = $1 AND status = 'started'`,
      [runId, code, details],
    );
  }

  private async validateTenantAndAuthorization(
    client: Pick<PoolClient | Pool, "query">,
    input: Required<AttendanceProjectionRebuildInput>,
  ): Promise<void> {
    const company = (await client.query<{ id: UUID }>(
      `SELECT id FROM platform.company_profiles WHERE id = $1 AND status = 'active'`,
      [input.companyId],
    )).rows[0];
    if (!company) throw new AttendanceProjectionReplayError("company_not_found", "Selected company is not active.");
    const actor = await loadUserContext(client, input.requestedByUserId);
    const employee = await loadUserContext(client, input.employeeUserId);
    if (!actor || !employee) {
      throw new AttendanceProjectionReplayError("user_not_found", "Actor or employee user is unavailable.");
    }
    if (actor.employment_status !== "active") {
      throw new AttendanceProjectionReplayError("actor_inactive", "Actor user is not active.");
    }
    if (employee.employment_status !== "active") {
      throw new AttendanceProjectionReplayError("employee_inactive", "Employee user is not active.");
    }
    if (!userBelongsToCompany(actor, input.companyId) || !userBelongsToCompany(employee, input.companyId)) {
      throw new AttendanceProjectionReplayError("cross_tenant_rejected", "Actor and employee must belong to the selected company.");
    }
    const canMaintain = actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.HRManager);
    if (!canMaintain) {
      throw forbidden("Only HR or Admin can run attendance projection reconciliation.");
    }
  }

  private async lockExistingEmployeeCommandState(client: PoolClient, companyId: UUID, employeeUserId: UUID): Promise<void> {
    const result = await client.query(
      `SELECT company_id, employee_user_id
       FROM attendance.employee_command_states
       WHERE company_id = $1 AND employee_user_id = $2
       FOR UPDATE`,
      [companyId, employeeUserId],
    );
    if (result.rowCount !== 1) {
      throw new AttendanceProjectionReplayError(
        "employee_command_state_missing",
        "Employee command-state row is required for shared attendance mutation serialization.",
      );
    }
  }

  private async acquireEmployeeAdvisoryLock(client: PoolClient, companyId: UUID, employeeUserId: UUID): Promise<void> {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [`attendance_projection_rebuild:${companyId}`, employeeUserId],
    );
  }

  private async inTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeInput(input: AttendanceProjectionRebuildInput): Required<AttendanceProjectionRebuildInput> {
  const mode = input.mode ?? "reconcile";
  const checks: Array<[string, string]> = [
    ["company_id", input.companyId],
    ["employee_user_id", input.employeeUserId],
    ["requested_by_user_id", input.requestedByUserId],
  ];
  for (const [field, value] of checks) {
    if (!uuidPattern.test(value)) {
      throw new AttendanceProjectionReplayError("invalid_uuid", `${field} must be a UUID.`);
    }
  }
  if (mode !== "reconcile" && mode !== "rebuild") {
    throw new AttendanceProjectionReplayError("invalid_mode", "Mode must be reconcile or rebuild.");
  }
  if (!isStrictIsoDate(input.dateFrom) || !isStrictIsoDate(input.dateTo)) {
    throw new AttendanceProjectionReplayError("invalid_date", "date_from and date_to must use YYYY-MM-DD.");
  }
  if (input.dateFrom > input.dateTo) {
    throw new AttendanceProjectionReplayError("invalid_date_range", "date_from must be on or before date_to.");
  }
  if (datesBetween(input.dateFrom, input.dateTo).length > PROJECTION_REBUILD_MAX_RANGE_DAYS) {
    throw new AttendanceProjectionReplayError("date_range_too_large", `Projection rebuild range cannot exceed ${PROJECTION_REBUILD_MAX_RANGE_DAYS} days.`);
  }
  return { ...input, mode };
}

async function loadUserContext(client: Pick<PoolClient | Pool, "query">, userId: UUID): Promise<UserContext | null> {
  return (await client.query<UserContext>(
    `SELECT users.id,
        users.timezone,
        users.employment_status,
        preference.company_id,
        COALESCE(array_agg(user_role.role_key ORDER BY user_role.role_key)
          FILTER (WHERE user_role.role_key IS NOT NULL), '{}') AS roles
     FROM core.users users
     LEFT JOIN platform.user_session_preferences preference
       ON preference.user_id = users.id
     LEFT JOIN core.user_roles user_role
       ON user_role.user_id = users.id
      AND user_role.status = 'active'
      AND user_role.deleted_at IS NULL
      AND user_role.effective_from <= CURRENT_DATE
      AND (user_role.effective_to IS NULL OR user_role.effective_to >= CURRENT_DATE)
     WHERE users.id = $1 AND users.deleted_at IS NULL
     GROUP BY users.id, users.timezone, users.employment_status, preference.company_id`,
    [userId],
  )).rows[0] ?? null;
}

async function loadCompanyEmployeeContext(
  client: PoolClient,
  companyId: UUID,
  employeeUserId: UUID,
): Promise<{ company: CompanyContext; employeeTimeZone: string }> {
  const company = (await client.query<CompanyContext>(
    `SELECT id, timezone, working_week FROM platform.company_profiles WHERE id = $1 AND status = 'active'`,
    [companyId],
  )).rows[0];
  const employee = await loadUserContext(client, employeeUserId);
  if (!company || !employee) throw new AttendanceProjectionReplayError("projection_context_missing", "Company or employee context is unavailable.");
  return { company, employeeTimeZone: employee.timezone ?? company.timezone };
}

async function loadShiftInstances(
  client: PoolClient,
  companyId: UUID,
  employeeUserId: UUID,
  dateFrom: string,
  dateTo: string,
): Promise<{ rows: ShiftInstanceRow[]; byDate: Map<string, ShiftInstanceRow> }> {
  const rows = (await client.query<ShiftInstanceRow>(
    `SELECT id, company_id, employee_user_id, work_date::text, template_version_id,
        resolved_timezone, scheduled_start_at, scheduled_end_at,
        eligibility_start_at, eligibility_end_at
     FROM attendance.shift_instances
     WHERE company_id = $1 AND employee_user_id = $2
       AND work_date BETWEEN $3::date AND $4::date
       AND deleted_at IS NULL
     ORDER BY work_date, id`,
    [companyId, employeeUserId, dateFrom, dateTo],
  )).rows;
  return { rows, byDate: new Map(rows.map((row) => [row.work_date, row])) };
}

async function loadEffectivePunchFacts(
  client: PoolClient,
  companyId: UUID,
  employeeUserId: UUID,
  from: string,
  to: string,
): Promise<PunchFactRow[]> {
  return (await client.query<PunchFactRow>(
    `SELECT punch.id, punch.session_id, punch.event_type, punch.occurred_at, punch.work_mode,
        punch.source, punch.origin, punch.metadata, punch.command_execution_id,
        command.command_origin, command.command_type,
        command_decision.id AS command_decision_id,
        command_decision.outcome AS command_outcome,
        command_decision.previous_state,
        command_decision.next_state,
        command_decision.policy_snapshot,
        command_decision.evidence_snapshot,
        application.id AS regularization_application_id,
        application.operation AS regularization_operation,
        audit_decision.id AS audit_decision_id,
        audit_decision.outcome AS audit_outcome,
        audit_decision.policy_version AS audit_policy_version,
        audit_decision.evaluator_version,
        audit_decision.evaluation_context
     FROM attendance.punch_events punch
     LEFT JOIN attendance.regularization_correction_applications application
       ON application.company_id = punch.company_id
      AND application.target_punch_event_id = punch.id
     LEFT JOIN attendance.command_decisions command_decision
       ON command_decision.company_id = punch.company_id
      AND command_decision.id = punch.decision_id
     LEFT JOIN attendance.command_executions command
       ON command.company_id = punch.company_id
      AND command.id = punch.command_execution_id
     LEFT JOIN attendance.attendance_decisions audit_decision
       ON audit_decision.company_id = punch.company_id
      AND audit_decision.command_execution_id = punch.command_execution_id
     WHERE punch.company_id = $1
       AND punch.employee_user_id = $2
       AND punch.deleted_at IS NULL
       AND application.id IS NULL
       AND punch.occurred_at >= $3
       AND punch.occurred_at <= $4
     ORDER BY punch.occurred_at ASC, punch.id ASC`,
    [companyId, employeeUserId, from, to],
  )).rows;
}

function validatePunchFacts(facts: PunchFactRow[]): { blocks: SafeProjectionBlock[]; evaluatorVersions: string[] } {
  const blocks: SafeProjectionBlock[] = [];
  const evaluatorVersions = new Set<string>();
  const byPunch = new Map<UUID, number>();
  for (const fact of facts) {
    byPunch.set(fact.id, (byPunch.get(fact.id) ?? 0) + 1);
    const isSystemAutoPunchOut = isSystemAutoPunchOutFact(fact);
    if (!isSystemAutoPunchOut) {
      if (fact.command_outcome !== "allowed" || fact.audit_outcome !== "passed") {
        blocks.push(block("missing_authoritative_decision", `punch_events:${fact.id}`, "Accepted punch fact lacks matching allowed command and passed attendance decisions."));
      }
      if (fact.command_type !== fact.event_type) {
        blocks.push(block("contradictory_command_type", `punch_events:${fact.id}`, "Punch event type does not match its command execution."));
      }
      if (!["employee_manual_now", "manager_assisted_now", "historical_correction", "approved_regularization"].includes(fact.command_origin ?? "")) {
        blocks.push(block("unknown_command_origin", `punch_events:${fact.id}`, "Punch fact has an unsupported command origin."));
      }
      if (!isRecordedTransitionCompatible(fact)) {
        blocks.push(block("contradictory_transition", `punch_events:${fact.id}`, "Recorded command decision transition is incompatible with the punch fact."));
      }
      if (!fact.policy_snapshot || Object.keys(fact.policy_snapshot).length === 0) {
        blocks.push(block("missing_policy_snapshot", `punch_events:${fact.id}`, "Accepted punch fact lacks stored policy snapshot."));
      }
    } else if (fact.source !== "admin") {
      blocks.push(block("invalid_system_fact", `punch_events:${fact.id}`, "System auto-punchout fact has invalid provenance."));
    }
    const evaluatorVersion = evaluatorVersionFor(fact);
    if (evaluatorVersion) evaluatorVersions.add(evaluatorVersion);
    if (isEvaluationDependent(fact) && (!evaluatorVersion || !recognizedEvaluatorVersions.has(evaluatorVersion))) {
      blocks.push(block("unsupported_evaluator_version", `punch_events:${fact.id}`, "Evaluation-dependent attendance decision has missing or unsupported evaluator metadata."));
    }
  }
  for (const [punchId, count] of byPunch) {
    if (count > 1) {
      blocks.push(block("duplicate_authoritative_decision", `punch_events:${punchId}`, "Punch fact joined to more than one authoritative decision row."));
    }
  }
  return { blocks, evaluatorVersions: [...evaluatorVersions].sort() };
}

function isSystemAutoPunchOutFact(fact: PunchFactRow): boolean {
  return (
    fact.origin === "system" &&
    fact.event_type === AttendancePunchEventTypes.CheckOut &&
    fact.metadata?.auto_punch_out === true
  );
}

function replayPunchFacts(
  facts: PunchFactRow[],
  shifts: ShiftInstanceRow[],
  companyId: UUID,
  employeeUserId: UUID,
  dateFrom: string,
  dateTo: string,
): { projection: ExpectedProjection; blocks: SafeProjectionBlock[] } {
  const blocks: SafeProjectionBlock[] = [];
  const sessions: ExpectedSession[] = [];
  const breaks: ExpectedBreak[] = [];
  let open: ExpectedSession | null = null;
  let openBreak: ExpectedBreak | null = null;
  for (const fact of facts) {
    const occurredAt = fact.occurred_at.toISOString();
    switch (fact.event_type) {
      case AttendancePunchEventTypes.CheckIn: {
        if (open) {
          blocks.push(block("ambiguous_transition", `punch_events:${fact.id}`, "Check-in encountered while a replay session is already open."));
          continue;
        }
        const shift = shiftForOccurredAt(shifts, fact.occurred_at);
        if (!shift) {
          blocks.push(block("missing_shift_instance", `punch_events:${fact.id}`, "Check-in cannot be assigned to exactly one historical shift instance."));
          continue;
        }
        const key = `${shift.work_date}:${occurredAt}:${fact.id}`;
        const sessionId = fact.session_id ?? deterministicUuid([
          "attendance-session",
          companyId,
          employeeUserId,
          shift.work_date,
          fact.id,
        ]);
        open = {
          id: sessionId,
          key,
          temp_id: key,
          work_date: shift.work_date,
          checked_in_at: occurredAt,
          closed_at: occurredAt,
          last_transition_at: occurredAt,
          work_mode: fact.work_mode,
          source: fact.source,
          metadata: { rebuilt_from_punch_event_id: fact.id },
          policy_snapshot: fact.policy_snapshot ?? {},
        };
        break;
      }
      case AttendancePunchEventTypes.BreakStart:
        if (!open || openBreak) {
          blocks.push(block("ambiguous_transition", `punch_events:${fact.id}`, "Break start encountered without exactly one working replay session."));
          continue;
        }
        openBreak = {
          id: deterministicUuid([
            "attendance-break-segment",
            open.id,
            fact.id,
          ]),
          key: `${open.work_date}:${open.checked_in_at}:${occurredAt}`,
          session_key: open.key,
          session_id: open.id,
          started_at: occurredAt,
          ended_at: occurredAt,
        };
        open.last_transition_at = occurredAt;
        break;
      case AttendancePunchEventTypes.BreakEnd:
        if (!open || !openBreak) {
          blocks.push(block("ambiguous_transition", `punch_events:${fact.id}`, "Break end encountered without an open replay break."));
          continue;
        }
        openBreak.ended_at = occurredAt;
        breaks.push(openBreak);
        openBreak = null;
        open.last_transition_at = occurredAt;
        break;
      case AttendancePunchEventTypes.CheckOut:
        if (!open || (openBreak && !isSystemAutoPunchOutFact(fact))) {
          blocks.push(block("ambiguous_transition", `punch_events:${fact.id}`, "Check-out encountered without one closable replay session."));
          continue;
        }
        if (openBreak) {
          openBreak.ended_at = occurredAt;
          breaks.push(openBreak);
          openBreak = null;
        }
        open.closed_at = occurredAt;
        open.last_transition_at = occurredAt;
        sessions.push(open);
        open = null;
        break;
      default:
        blocks.push(block("unsupported_punch_event_type", `punch_events:${fact.id}`, "Unsupported attendance punch event type in replay."));
    }
  }
  if (open || openBreak) {
    blocks.push(block("unresolved_session", "range", "Replay ended with an unresolved session or break."));
  }
  const rangedSessions = sessions
    .filter((session) => session.work_date >= dateFrom && session.work_date <= dateTo)
    .sort(compareBy("work_date", "checked_in_at", "key"));
  const rangedSessionKeys = new Set(rangedSessions.map((session) => session.key));
  const rangedBreaks = breaks
    .filter((segment) => rangedSessionKeys.has(segment.session_key))
    .sort(compareBy("session_key", "started_at", "key"));
  return {
    projection: { sessions: rangedSessions, breaks: rangedBreaks, dailyRecords: [] },
    blocks,
  };
}

async function buildExpectedDaily(
  client: PoolClient,
  input: Required<AttendanceProjectionRebuildInput>,
  context: { company: CompanyContext; employeeTimeZone: string },
  shifts: { byDate: Map<string, ShiftInstanceRow> },
  projection: ExpectedProjection,
  preBlockedDates: Set<string>,
  blocks: SafeProjectionBlock[],
): Promise<ExpectedProjection> {
  const dailyRecords: AttendanceDailyProjection[] = [];
  for (const workDate of datesBetween(input.dateFrom, input.dateTo)) {
    if (preBlockedDates.has(workDate)) continue;
    const sessions = projection.sessions.filter((session) => session.work_date === workDate);
    const sessionKeys = new Set(sessions.map((session) => session.key));
    const segments = projection.breaks.filter((segment) => sessionKeys.has(segment.session_key));
    const durations = calculateSessionDurations({
      sessions: sessions.map((session) => ({
        id: session.key,
        startedAt: session.checked_in_at,
        endedAt: session.closed_at,
      })),
      breaks: segments.map((segment) => ({
        sessionId: segment.session_key,
        startedAt: segment.started_at,
        endedAt: segment.ended_at,
      })),
      asOf: new Date().toISOString(),
    });
    const calendar = await loadCalendarFacts(client, input.companyId, input.employeeUserId, workDate);
    const approval = await loadApprovalFacts(client, input.companyId, input.employeeUserId, workDate);
    const shift = shifts.byDate.get(workDate);
    if (!shift) {
      blocks.push(block("missing_shift_instance", `daily_records:${workDate}`, "Historical shift instance is required for daily projection."));
      continue;
    }
    const workingWeek = workingWeekForHistoricalDay(workDate, calendar, sessions);
    if (!workingWeek) {
      blocks.push(block(
        "historical_working_week_missing",
        `daily_records:${workDate}`,
        "Historical working-week context is required for deterministic daily classification.",
      ));
      continue;
    }
    const dayClassification = calendar.leaveApproved
      ? AttendanceDayClassifications.Leave
      : calendar.wfhApproved
        ? AttendanceDayClassifications.Wfh
        : calendar.holiday
          ? AttendanceDayClassifications.Holiday
          : !isWorkingDate(workDate, workingWeek, new Set())
            ? AttendanceDayClassifications.Weekend
            : sessions[0]?.work_mode === "wfh"
              ? AttendanceDayClassifications.Wfh
              : AttendanceDayClassifications.WorkingDay;
    dailyRecords.push(projectAttendanceDay({
      companyId: input.companyId,
      employeeUserId: input.employeeUserId,
      workDate,
      asOf: shift.eligibility_end_at.toISOString(),
      dayClassification,
      firstCheckIn: sessions[0]?.checked_in_at ?? null,
      lastCheckOut: sessions.at(-1)?.closed_at ?? null,
      hasOpenSession: false,
      hasIncompleteEvidence: false,
      incompleteIsException: false,
      workMode: sessions[0]?.work_mode ?? "office",
      workSeconds: durations.workSeconds,
      breakSeconds: durations.breakSeconds,
      scheduledStartAt: shift.scheduled_start_at.toISOString(),
      scheduledEndAt: shift.scheduled_end_at.toISOString(),
      graceSeconds: graceSecondsFromSessionPolicies(sessions),
      approvalFacts: approval.approvalFacts,
      existingApproval: approval.existingApproval,
      regularizationStatus: approval.regularizationStatus,
    }));
  }
  return { ...projection, dailyRecords };
}

async function loadCalendarFacts(client: PoolClient, companyId: UUID, employeeUserId: UUID, workDate: string) {
  const row = (await client.query<{
    holiday: boolean;
    leave_approved: boolean;
    wfh_approved: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM leave_wfh.holidays h
         WHERE h.company_id = $1 AND h.holiday_date = $3::date
           AND h.optional = false AND h.deleted_at IS NULL) AS holiday,
       EXISTS (SELECT 1 FROM leave_wfh.leave_requests l
         WHERE l.employee_user_id = $2 AND l.status = 'approved'
           AND $3::date BETWEEN l.date_from AND l.date_to AND l.deleted_at IS NULL) AS leave_approved,
       EXISTS (SELECT 1 FROM leave_wfh.wfh_requests w
         WHERE w.employee_user_id = $2 AND w.status = 'approved'
           AND $3::date BETWEEN w.date_from AND w.date_to AND w.deleted_at IS NULL) AS wfh_approved`,
    [companyId, employeeUserId, workDate],
  )).rows[0];
  return {
    holiday: row?.holiday ?? false,
    leaveApproved: row?.leave_approved ?? false,
    wfhApproved: row?.wfh_approved ?? false,
  };
}

async function loadApprovalFacts(client: PoolClient, companyId: UUID, employeeUserId: UUID, workDate: string) {
  const rows = (await client.query<{ kind: "regularization" | "leave" | "wfh"; state: string }>(
    `(SELECT 'regularization'::text AS kind, status AS state
       FROM attendance.regularization_requests
       WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date AND deleted_at IS NULL
       ORDER BY updated_at DESC, id DESC
       LIMIT 1)
     UNION ALL
     SELECT 'leave'::text, CASE status WHEN 'pending_manager' THEN 'pending' ELSE status END
       FROM leave_wfh.leave_requests
       WHERE employee_user_id = $2 AND $3::date BETWEEN date_from AND date_to
         AND status <> 'cancelled' AND deleted_at IS NULL
     UNION ALL
     SELECT 'wfh'::text, CASE status WHEN 'pending_manager' THEN 'pending' ELSE status END
       FROM leave_wfh.wfh_requests
       WHERE employee_user_id = $2 AND $3::date BETWEEN date_from AND date_to
         AND status <> 'cancelled' AND deleted_at IS NULL`,
    [companyId, employeeUserId, workDate],
  )).rows;
  const approvalFacts = rows.filter(
    (row): row is { kind: AttendanceApprovalFact["kind"]; state: AttendanceApprovalFact["state"] } =>
      ["regularization", "leave", "wfh"].includes(row.kind) &&
      ["pending", "approved", "returned", "rejected"].includes(row.state),
  );
  return {
    approvalFacts,
    existingApproval: null,
    regularizationStatus: (
      rows.find((row) => row.kind === "regularization")?.state as
        AttendanceDayRecord["regularization_status"] | undefined
    ) ?? null,
  };
}

async function loadExistingProjection(
  client: PoolClient,
  companyId: UUID,
  employeeUserId: UUID,
  dateFrom: string,
  dateTo: string,
): Promise<ExistingProjection> {
  const sessions = (await client.query<{
    id: UUID;
    work_date: string;
    status: string;
    checked_in_at: Date;
    closed_at: Date | null;
    last_transition_at: Date;
    work_mode: string;
    source: string;
  }>(
    `SELECT id, work_date::text, status, checked_in_at, closed_at, last_transition_at, work_mode, source
     FROM attendance.sessions
     WHERE company_id = $1 AND employee_user_id = $2
       AND work_date BETWEEN $3::date AND $4::date
       AND deleted_at IS NULL
     ORDER BY work_date, checked_in_at, id`,
    [companyId, employeeUserId, dateFrom, dateTo],
  )).rows.map((row) => {
    const key = `${row.work_date}:${row.checked_in_at.toISOString()}`;
    return { key, existing: normalizeExistingSession(row), expected: null };
  });
  const breaks = (await client.query<{
    session_work_date: string;
    session_checked_in_at: Date;
    started_at: Date;
    ended_at: Date | null;
  }>(
    `SELECT session.work_date::text AS session_work_date,
        session.checked_in_at AS session_checked_in_at,
        segment.started_at,
        segment.ended_at
     FROM attendance.break_segments segment
     JOIN attendance.sessions session
       ON session.id = segment.session_id AND session.company_id = segment.company_id
     WHERE segment.company_id = $1
       AND session.employee_user_id = $2
       AND session.work_date BETWEEN $3::date AND $4::date
       AND session.deleted_at IS NULL
     ORDER BY session.work_date, session.checked_in_at, segment.started_at, segment.id`,
    [companyId, employeeUserId, dateFrom, dateTo],
  )).rows.map((row) => {
    const key = `${row.session_work_date}:${row.session_checked_in_at.toISOString()}:${row.started_at.toISOString()}`;
    return { key, existing: normalizeExistingBreak(row), expected: null };
  });
  const dailyRecords = (await client.query<Record<string, unknown>>(
    `SELECT company_id, employee_user_id, work_date::text, status, day_classification, presence_state,
        punctuality_state, evidence_state, approval_kind, approval_state,
        payroll_state, first_check_in, last_check_out, work_minutes,
        break_minutes, late_minutes, early_out_minutes, work_seconds,
        break_seconds, scheduled_seconds, late_seconds,
        early_departure_seconds, work_mode, note, exception_type,
        regularization_status
     FROM attendance.daily_records
     WHERE company_id = $1 AND employee_user_id = $2
       AND work_date BETWEEN $3::date AND $4::date
       AND deleted_at IS NULL
     ORDER BY work_date`,
    [companyId, employeeUserId, dateFrom, dateTo],
  )).rows.map((row) => ({
    key: String(row.work_date),
    existing: normalizeDates(row),
    expected: null,
  }));
  return {
    sessions,
    breaks,
    dailyRecords,
    counts: {
      sessions: sessions.length,
      break_segments: breaks.length,
      daily_records: dailyRecords.length,
    },
  };
}

async function loadMutableBoundaryBlocks(
  client: PoolClient,
  companyId: UUID,
  employeeUserId: UUID,
  dateFrom: string,
  dateTo: string,
): Promise<SafeProjectionBlock[]> {
  const rows = (await client.query<{ id: UUID; active_breaks: string }>(
    `SELECT session.id,
        (SELECT count(*) FROM attendance.break_segments segment
         WHERE segment.company_id = session.company_id
           AND segment.session_id = session.id
           AND segment.ended_at IS NULL)::text AS active_breaks
     FROM attendance.sessions session
     WHERE session.company_id = $1
       AND session.employee_user_id = $2
       AND session.work_date BETWEEN $3::date AND $4::date
       AND session.deleted_at IS NULL
       AND session.closed_at IS NULL
     ORDER BY session.work_date, session.checked_in_at, session.id`,
    [companyId, employeeUserId, dateFrom, dateTo],
  )).rows;
  return rows.map((row) => block(
    Number(row.active_breaks) > 0 ? "active_break_overlaps_range" : "open_session_overlaps_range",
    `sessions:${row.id}`,
    "Mutable projection has an unresolved historical session or break inside the requested range.",
  ));
}

async function upsertDailyRecord(client: PoolClient, projection: AttendanceDailyProjection): Promise<number> {
  const result = await client.query(
    `INSERT INTO attendance.daily_records (
       company_id, employee_user_id, work_date, status, day_classification,
       presence_state, punctuality_state, evidence_state, approval_kind,
       approval_state, payroll_state, first_check_in, last_check_out,
       work_minutes, break_minutes, late_minutes, early_out_minutes,
       work_seconds, break_seconds, scheduled_seconds, late_seconds,
       early_departure_seconds, work_mode, note, exception_type,
       regularization_status, version, created_at, updated_at, deleted_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,1,transaction_timestamp(),transaction_timestamp(),NULL
     )
     ON CONFLICT (company_id, employee_user_id, work_date) DO UPDATE SET
       status = EXCLUDED.status,
       day_classification = EXCLUDED.day_classification,
       presence_state = EXCLUDED.presence_state,
       punctuality_state = EXCLUDED.punctuality_state,
       evidence_state = EXCLUDED.evidence_state,
       approval_kind = EXCLUDED.approval_kind,
       approval_state = EXCLUDED.approval_state,
       payroll_state = EXCLUDED.payroll_state,
       first_check_in = EXCLUDED.first_check_in,
       last_check_out = EXCLUDED.last_check_out,
       work_minutes = EXCLUDED.work_minutes,
       break_minutes = EXCLUDED.break_minutes,
       late_minutes = EXCLUDED.late_minutes,
       early_out_minutes = EXCLUDED.early_out_minutes,
       work_seconds = EXCLUDED.work_seconds,
       break_seconds = EXCLUDED.break_seconds,
       scheduled_seconds = EXCLUDED.scheduled_seconds,
       late_seconds = EXCLUDED.late_seconds,
       early_departure_seconds = EXCLUDED.early_departure_seconds,
       work_mode = EXCLUDED.work_mode,
       note = EXCLUDED.note,
       exception_type = EXCLUDED.exception_type,
       regularization_status = EXCLUDED.regularization_status,
       version = attendance.daily_records.version + 1,
       updated_at = transaction_timestamp(),
       deleted_at = NULL
     WHERE attendance.daily_records.status IS DISTINCT FROM EXCLUDED.status
       OR attendance.daily_records.day_classification IS DISTINCT FROM EXCLUDED.day_classification
       OR attendance.daily_records.presence_state IS DISTINCT FROM EXCLUDED.presence_state
       OR attendance.daily_records.punctuality_state IS DISTINCT FROM EXCLUDED.punctuality_state
       OR attendance.daily_records.evidence_state IS DISTINCT FROM EXCLUDED.evidence_state
       OR attendance.daily_records.approval_kind IS DISTINCT FROM EXCLUDED.approval_kind
       OR attendance.daily_records.approval_state IS DISTINCT FROM EXCLUDED.approval_state
       OR attendance.daily_records.payroll_state IS DISTINCT FROM EXCLUDED.payroll_state
       OR attendance.daily_records.first_check_in IS DISTINCT FROM EXCLUDED.first_check_in
       OR attendance.daily_records.last_check_out IS DISTINCT FROM EXCLUDED.last_check_out
       OR attendance.daily_records.work_minutes IS DISTINCT FROM EXCLUDED.work_minutes
       OR attendance.daily_records.break_minutes IS DISTINCT FROM EXCLUDED.break_minutes
       OR attendance.daily_records.late_minutes IS DISTINCT FROM EXCLUDED.late_minutes
       OR attendance.daily_records.early_out_minutes IS DISTINCT FROM EXCLUDED.early_out_minutes
       OR attendance.daily_records.work_seconds IS DISTINCT FROM EXCLUDED.work_seconds
       OR attendance.daily_records.break_seconds IS DISTINCT FROM EXCLUDED.break_seconds
       OR attendance.daily_records.scheduled_seconds IS DISTINCT FROM EXCLUDED.scheduled_seconds
       OR attendance.daily_records.late_seconds IS DISTINCT FROM EXCLUDED.late_seconds
       OR attendance.daily_records.early_departure_seconds IS DISTINCT FROM EXCLUDED.early_departure_seconds
       OR attendance.daily_records.work_mode IS DISTINCT FROM EXCLUDED.work_mode
       OR attendance.daily_records.note IS DISTINCT FROM EXCLUDED.note
       OR attendance.daily_records.exception_type IS DISTINCT FROM EXCLUDED.exception_type
       OR attendance.daily_records.regularization_status IS DISTINCT FROM EXCLUDED.regularization_status
       OR attendance.daily_records.deleted_at IS NOT NULL`,
    [
      projection.company_id, projection.employee_user_id, projection.work_date,
      projection.status, projection.day_classification, projection.presence_state,
      projection.punctuality_state, projection.evidence_state, projection.approval_kind,
      projection.approval_state, projection.payroll_state, projection.first_check_in,
      projection.last_check_out, projection.work_minutes, projection.break_minutes,
      projection.late_minutes, projection.early_out_minutes, projection.work_seconds,
      projection.break_seconds, projection.scheduled_seconds, projection.late_seconds,
      projection.early_departure_seconds, projection.work_mode, projection.note,
      projection.exception_type, projection.regularization_status,
    ],
  );
  return result.rowCount ?? 0;
}

function diffProjection(
  existing: ExistingProjection,
  expected: ExpectedProjection,
  blocks: SafeProjectionBlock[],
): ProjectionRebuildDifferences {
  return {
    missing: {
      sessions: missingDiffs(existing.sessions, expected.sessions.map(expectedSessionDiff)),
      break_segments: missingDiffs(existing.breaks, expected.breaks.map(expectedBreakDiff)),
      daily_records: missingDiffs(existing.dailyRecords, expected.dailyRecords.map(expectedDailyDiff)),
    },
    unexpected: {
      sessions: unexpectedDiffs(existing.sessions, expected.sessions.map(expectedSessionDiff)),
      break_segments: unexpectedDiffs(existing.breaks, expected.breaks.map(expectedBreakDiff)),
      daily_records: unexpectedDiffs(existing.dailyRecords, expected.dailyRecords.map(expectedDailyDiff)),
    },
    changed: {
      sessions: changedDiffs(existing.sessions, expected.sessions.map(expectedSessionDiff)),
      break_segments: changedDiffs(existing.breaks, expected.breaks.map(expectedBreakDiff)),
      daily_records: changedDiffs(existing.dailyRecords, expected.dailyRecords.map(expectedDailyDiff)),
    },
    blocked: [...blocks].sort(compareBy("code", "scope", "detail")),
  };
}

function expectedSessionDiff(session: ExpectedSession): SafeProjectionDiff {
  return {
    key: `${session.work_date}:${session.checked_in_at}`,
    existing: null,
    expected: {
      work_date: session.work_date,
      status: "closed",
      checked_in_at: session.checked_in_at,
      closed_at: session.closed_at,
      last_transition_at: session.last_transition_at,
      work_mode: session.work_mode,
      source: session.source,
    },
  };
}

function expectedBreakDiff(segment: ExpectedBreak): SafeProjectionDiff {
  return {
    key: segment.key,
    existing: null,
    expected: {
      started_at: segment.started_at,
      ended_at: segment.ended_at,
    },
  };
}

function expectedDailyDiff(record: AttendanceDailyProjection): SafeProjectionDiff {
  return {
    key: record.work_date,
    existing: null,
    expected: normalizeDates(record as unknown as Record<string, unknown>),
  };
}

function missingDiffs(existing: SafeProjectionDiff[], expected: SafeProjectionDiff[]): SafeProjectionDiff[] {
  const existingKeys = new Set(existing.map((item) => item.key));
  return expected.filter((item) => !existingKeys.has(item.key)).sort(compareBy("key"));
}

function unexpectedDiffs(existing: SafeProjectionDiff[], expected: SafeProjectionDiff[]): SafeProjectionDiff[] {
  const expectedKeys = new Set(expected.map((item) => item.key));
  return existing.filter((item) => !expectedKeys.has(item.key)).sort(compareBy("key"));
}

function changedDiffs(existing: SafeProjectionDiff[], expected: SafeProjectionDiff[]): SafeProjectionDiff[] {
  const existingByKey = new Map(existing.map((item) => [item.key, item]));
  return expected.flatMap((item) => {
    const current = existingByKey.get(item.key);
    if (!current || canonicalJsonHash(current.existing ?? {}) === canonicalJsonHash(item.expected ?? {})) {
      return [];
    }
    return [{ key: item.key, existing: current.existing ?? null, expected: item.expected ?? null }];
  }).sort(compareBy("key"));
}

function normalizeExistingSession(row: {
  work_date: string;
  status: string;
  checked_in_at: Date;
  closed_at: Date | null;
  last_transition_at: Date;
  work_mode: string;
  source: string;
}): Record<string, unknown> {
  return {
    work_date: row.work_date,
    status: row.status,
    checked_in_at: row.checked_in_at.toISOString(),
    closed_at: row.closed_at?.toISOString() ?? null,
    last_transition_at: row.last_transition_at.toISOString(),
    work_mode: row.work_mode,
    source: row.source,
  };
}

function normalizeExistingBreak(row: {
  started_at: Date;
  ended_at: Date | null;
}): Record<string, unknown> {
  return {
    started_at: row.started_at.toISOString(),
    ended_at: row.ended_at?.toISOString() ?? null,
  };
}

function normalizeDates(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ]));
}

function summarizeVersions(
  facts: PunchFactRow[],
  shifts: ShiftInstanceRow[],
  evaluatorVersions: string[],
): VersionSummary {
  const policyVersions = new Set<string>();
  const policyVersionIds = new Set<string>();
  for (const fact of facts) {
    if (fact.audit_policy_version) policyVersions.add(fact.audit_policy_version);
    const id = fact.policy_snapshot?.policyVersionId;
    if (typeof id === "string") policyVersionIds.add(id);
  }
  return {
    evaluator_versions: evaluatorVersions,
    policy_versions: [...policyVersions].sort(),
    policy_version_ids: [...policyVersionIds].sort(),
    shift_instance_ids: shifts.map((shift) => shift.id).sort(),
    shift_template_version_ids: [...new Set(shifts.map((shift) => shift.template_version_id))].sort(),
  };
}

function resultFromComputed(
  runId: UUID,
  input: Required<AttendanceProjectionRebuildInput>,
  status: ProjectionRebuildStatus,
  computed: ComputedProjectionResult,
  rowsWritten: ProjectionRowsWritten,
  failureCode: string | null,
  failureDetails: string | null,
): AttendanceProjectionRebuildResult {
  return {
    run_id: runId,
    company_id: input.companyId,
    employee_user_id: input.employeeUserId,
    requested_date_range: { date_from: input.dateFrom, date_to: input.dateTo },
    mode: input.mode,
    status,
    effective_source_record_count: computed.sourceRecordCount,
    deterministic_source_fingerprint: computed.sourceFingerprint,
    versions_encountered: computed.versions,
    existing_projection_counts: computed.existingCounts,
    expected_projection_counts: computed.expectedCounts,
    differences: computed.differences,
    safe_to_rebuild: computed.safeToRebuild,
    rows_written: rowsWritten,
    failure_code: failureCode,
    sanitized_failure_details: failureDetails,
  };
}

function countsForExpected(expected: ExpectedProjection): ProjectionCounts {
  return {
    sessions: expected.sessions.length,
    break_segments: expected.breaks.length,
    daily_records: expected.dailyRecords.length,
  };
}

function emptyRowsWritten(): ProjectionRowsWritten {
  return {
    sessions_deleted: 0,
    break_segments_deleted: 0,
    sessions_inserted: 0,
    break_segments_inserted: 0,
    daily_records_upserted: 0,
  };
}

function shiftBoundary(shifts: ShiftInstanceRow[]): { from: string; to: string } | null {
  if (shifts.length === 0) return null;
  const sortedStart = shifts.map((shift) => shift.eligibility_start_at).sort((a, b) => a.getTime() - b.getTime());
  const sortedEnd = shifts.map((shift) => shift.eligibility_end_at).sort((a, b) => b.getTime() - a.getTime());
  return {
    from: sortedStart[0]!.toISOString(),
    to: sortedEnd[0]!.toISOString(),
  };
}

function shiftForOccurredAt(shifts: ShiftInstanceRow[], occurredAt: Date): ShiftInstanceRow | null {
  const timestamp = occurredAt.getTime();
  const matches = shifts.filter((shift) =>
    shift.eligibility_start_at.getTime() <= timestamp &&
    timestamp < shift.eligibility_end_at.getTime()
  );
  return matches.length === 1 ? matches[0]! : null;
}

function shiftAmbiguityBlocks(shifts: ShiftInstanceRow[]): SafeProjectionBlock[] {
  const blocks: SafeProjectionBlock[] = [];
  const byDate = new Map<string, ShiftInstanceRow[]>();
  for (const shift of shifts) {
    const rows = byDate.get(shift.work_date) ?? [];
    rows.push(shift);
    byDate.set(shift.work_date, rows);
  }
  for (const [workDate, rows] of byDate) {
    if (rows.length > 1) {
      blocks.push(block(
        "duplicate_shift_instance",
        `shift_instances:${workDate}`,
        "Historical shift context has more than one active shift instance for the same work date.",
      ));
    }
    const sorted = [...rows].sort((left, right) => left.eligibility_start_at.getTime() - right.eligibility_start_at.getTime());
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      if (current.eligibility_start_at.getTime() < previous.eligibility_end_at.getTime()) {
        blocks.push(block(
          "ambiguous_shift_eligibility",
          `shift_instances:${workDate}`,
          "Historical shift eligibility windows overlap for the same work date.",
        ));
        break;
      }
    }
  }
  return blocks.sort(compareBy("code", "scope", "detail"));
}

function isEvaluationDependent(fact: PunchFactRow): boolean {
  return Boolean(fact.evaluation_context?.geo_policy);
}

function evaluatorVersionFor(fact: PunchFactRow): string | null {
  if (fact.evaluator_version) return fact.evaluator_version;
  const geo = fact.evaluation_context?.geo_policy;
  if (geo && typeof geo === "object" && "evaluator_version" in geo) {
    const value = (geo as Record<string, unknown>).evaluator_version;
    return typeof value === "string" ? value : null;
  }
  return null;
}

function userBelongsToCompany(user: UserContext, companyId: UUID): boolean {
  return user.company_id === companyId;
}

function blockedWorkDates(
  blocks: SafeProjectionBlock[],
  facts: PunchFactRow[],
  timeZone: string,
): Set<string> {
  const byPunchId = new Map(facts.map((fact) => [fact.id, fact]));
  const dates = new Set<string>();
  for (const item of blocks) {
    const scopedDate = dateFromBlockScope(item.scope);
    if (scopedDate) {
      dates.add(scopedDate);
      continue;
    }
    if (item.scope.startsWith("punch_events:")) {
      const punchId = item.scope.slice("punch_events:".length);
      const fact = byPunchId.get(punchId as UUID);
      if (fact) dates.add(dateInTimeZone(fact.occurred_at.toISOString(), timeZone));
    }
  }
  return dates;
}

function dateFromBlockScope(scope: string): string | null {
  const value = scope.split(":")[1];
  return value && isStrictIsoDate(value) ? value : null;
}

function workingWeekForHistoricalDay(
  workDate: string,
  calendar: { holiday: boolean; leaveApproved: boolean; wfhApproved: boolean },
  sessions: ExpectedSession[],
): string | null {
  if (calendar.holiday || calendar.leaveApproved || calendar.wfhApproved) return "Mon-Sun";
  const values = sessions
    .map((session) => policyWorkingWeek(session.policy_snapshot))
    .filter((value): value is string => value !== null);
  if (values.length === 0) return null;
  const first = values[0]!;
  return values.every((value) => value === first) ? first : null;
}

function policyWorkingWeek(snapshot: Record<string, unknown>): string | null {
  const direct = stringPolicyValue(snapshot.workingWeek) ?? stringPolicyValue(snapshot.working_week);
  if (direct) return direct;
  const attendance = snapshot.attendance_policy;
  if (attendance && typeof attendance === "object" && !Array.isArray(attendance)) {
    const data = attendance as Record<string, unknown>;
    return stringPolicyValue(data.workingWeek) ?? stringPolicyValue(data.working_week);
  }
  const config = snapshot.config;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const data = config as Record<string, unknown>;
    return stringPolicyValue(data.workingWeek) ?? stringPolicyValue(data.working_week);
  }
  return null;
}

function stringPolicyValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isStrictIsoDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day;
}

function isRecordedTransitionCompatible(fact: PunchFactRow): boolean {
  if (fact.origin === "system" && fact.metadata?.auto_punch_out === true) return true;
  if (fact.command_origin === "historical_correction" || fact.command_origin === "approved_regularization") {
    return fact.command_outcome === "allowed" && fact.command_type === fact.event_type;
  }
  const transition = `${fact.previous_state ?? ""}->${fact.next_state ?? ""}`;
  switch (fact.event_type) {
    case AttendancePunchEventTypes.CheckIn:
      return transition === "not_checked_in->working";
    case AttendancePunchEventTypes.BreakStart:
      return transition === "working->on_break";
    case AttendancePunchEventTypes.BreakEnd:
      return transition === "on_break->working";
    case AttendancePunchEventTypes.CheckOut:
      return transition === "working->completed" || transition === "working->not_checked_in";
    default:
      return false;
  }
}

function deterministicUuid(parts: readonly string[]): UUID {
  const hash = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  const variant = (8 + (Number.parseInt(hash.slice(16, 17), 16) % 4)).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}` as UUID;
}

function safeEvaluationContext(context: Record<string, unknown> | null): Record<string, unknown> {
  if (!context) return {};
  const geoPolicy = context.geo_policy;
  if (!geoPolicy || typeof geoPolicy !== "object" || Array.isArray(geoPolicy)) return {};
  const policy = geoPolicy as Record<string, unknown>;
  return {
    geo_policy: {
      allowed: policy.allowed,
      decision: policy.decision,
      evaluator_version: policy.evaluator_version,
      geofence_id: policy.geofence_id,
      geofence_version_id: policy.geofence_version_id,
      reason_code: policy.reason_code,
    },
  };
}

function graceSecondsFromSessionPolicies(sessions: ExpectedSession[]): number {
  if (sessions.length === 0) return 0;
  const values = sessions.map((session) => policyGraceSeconds(session.policy_snapshot));
  if (values.some((value) => value === null)) {
    throw new AttendanceProjectionReplayError(
      "missing_policy_grace",
      "Historical policy snapshot is missing grace-period configuration required for daily projection.",
    );
  }
  const first = values[0]!;
  if (values.some((value) => value !== first)) {
    throw new AttendanceProjectionReplayError(
      "ambiguous_policy_grace",
      "Historical policy snapshots disagree on grace-period configuration for the same work date.",
    );
  }
  return first;
}

function policyGraceSeconds(snapshot: Record<string, unknown>): number | null {
  const directSeconds = numericPolicyValue(snapshot.graceSeconds);
  if (directSeconds !== null) return directSeconds;
  const directMinutes = numericPolicyValue(snapshot.graceMinutes);
  if (directMinutes !== null) return directMinutes * 60;
  const attendance = snapshot.attendance_policy;
  if (attendance && typeof attendance === "object" && !Array.isArray(attendance)) {
    const data = attendance as Record<string, unknown>;
    const nestedSeconds = numericPolicyValue(data.graceSeconds);
    if (nestedSeconds !== null) return nestedSeconds;
    const nestedMinutes = numericPolicyValue(data.graceMinutes);
    if (nestedMinutes !== null) return nestedMinutes * 60;
  }
  return null;
}

function numericPolicyValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function block(code: string, scope: string, detail: string): SafeProjectionBlock {
  return { code, scope, detail };
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

function dateInTimeZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const data = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${data.year}-${data.month}-${data.day}`;
}

function compareBy<T>(...keys: string[]) {
  return (left: T, right: T) => {
    for (const key of keys) {
      const leftValue = (left as Record<string, unknown>)[key];
      const rightValue = (right as Record<string, unknown>)[key];
      const comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
      if (comparison !== 0) return comparison;
    }
    return 0;
  };
}

function failureFromError(error: unknown): { code: string; details: string } {
  if (error instanceof AttendanceProjectionReplayError) {
    return { code: error.replayCode, details: sanitizeFailure(error.message) };
  }
  return {
    code: "projection_rebuild_internal_error",
    details: "Attendance projection rebuild failed.",
  };
}

function sanitizeFailure(message: string): string {
  return message
    .replace(/-?\d{1,3}\.\d{3,}/gu, "[redacted-coordinate]")
    .replace(/\s+/gu, " ")
    .slice(0, 500);
}
