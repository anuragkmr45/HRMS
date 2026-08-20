import type { Pool, PoolClient } from "pg";
import type { AuthUser, UUID } from "#shared";
import { Roles } from "#shared";
import {
  assertUserInCompanyMembershipContext,
  resolveActiveCompanyMembershipContext,
} from "../../platform/company-membership-context.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, notFound } from "../../platform/errors.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const payrollRelevantColumns = [
  "status",
  "day_classification",
  "presence_state",
  "punctuality_state",
  "evidence_state",
  "approval_kind",
  "approval_state",
  "payroll_state",
  "first_check_in",
  "last_check_out",
  "work_minutes",
  "break_minutes",
  "late_minutes",
  "early_out_minutes",
  "work_seconds",
  "break_seconds",
  "scheduled_seconds",
  "late_seconds",
  "early_departure_seconds",
  "work_mode",
  "exception_type",
  "regularization_status",
] as const;

type PayrollRelevantColumn = (typeof payrollRelevantColumns)[number];
interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

interface PayrollPeriodRow extends Record<string, unknown> {
  id: UUID;
  company_id: UUID;
  period_start: string | Date;
  period_end: string | Date;
  state: "open" | "locked";
  locked_at: Date | null;
  locked_by_user_id: UUID | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface SnapshotRow extends Record<string, unknown>, Record<PayrollRelevantColumn, unknown> {
  id: UUID;
  company_id: UUID;
  payroll_period_id: UUID;
  period_version: number;
  employee_user_id: UUID;
  work_date: string;
  source_daily_record_id: UUID;
  source_daily_record_version: number;
  finalized_at: Date;
}

interface AdjustmentRow extends Record<string, unknown> {
  id: UUID;
  employee_user_id: UUID;
  work_date: string;
  source_type: string;
  source_id: UUID;
  regularization_request_id: UUID | null;
  finalized_snapshot_id: UUID | null;
  finalized_values: Record<string, unknown>;
  corrected_values: Record<string, unknown>;
  delta_values: Record<string, unknown>;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export async function acquirePayrollAttendancePeriodLock(
  client: Queryable,
  companyId: UUID,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    ["attendance.payroll_period", companyId],
  );
}

export class AttendancePayrollPeriodService {
  constructor(private readonly store: MemoryDataStore) {}

  async createPeriod(
    actor: AuthUser,
    input: { company_id?: UUID; period_start: string; period_end: string },
  ) {
    const context = this.resolveContext(actor, "attendance.payroll_period.create", input.company_id);
    this.assertCanManage(actor);
    const range = normalizeRange(input.period_start, input.period_end);
    return this.withTransaction(async (client) => {
      await acquirePayrollAttendancePeriodLock(client, context.companyId);
      let period: PayrollPeriodRow | undefined;
      try {
        period = (await client.query<PayrollPeriodRow>(
          `INSERT INTO attendance.payroll_periods (
             company_id, period_start, period_end, state, version, created_at, updated_at
           )
           VALUES ($1,$2::date,$3::date,'open',1,transaction_timestamp(),transaction_timestamp())
           RETURNING *`,
          [context.companyId, range.periodStart, range.periodEnd],
        )).rows[0];
      } catch (error) {
        if (isPgPeriodConflict(error)) {
          throw conflict("Attendance payroll period range overlaps an existing period.", {
            company_id: context.companyId,
            period_start: range.periodStart,
            period_end: range.periodEnd,
          });
        }
        throw error;
      }
      if (!period) throw new Error("Payroll attendance period was not created.");
      await client.query(
        `INSERT INTO attendance.payroll_period_actions (
           company_id, payroll_period_id, action, actor_user_id, reason,
           resulting_version, occurred_at
         )
         VALUES ($1,$2,'created',$3,NULL,$4,transaction_timestamp())`,
        [context.companyId, period.id, actor.id, period.version],
      );
      return presentPeriod(period);
    });
  }

  async lockPeriod(
    actor: AuthUser,
    periodId: UUID,
    input: { company_id?: UUID; reason?: string | null },
  ) {
    const context = this.resolveContext(actor, "attendance.payroll_period.lock", input.company_id);
    this.assertCanManage(actor);
    return this.withTransaction(async (client) => {
      await acquirePayrollAttendancePeriodLock(client, context.companyId);
      const current = await this.lockPeriodRow(client, context.companyId, periodId);
      if (current.state !== "open") {
        throw conflict("Attendance payroll period is already locked.", {
          payroll_period_id: periodId,
          state: current.state,
        });
      }
      const nextVersion = current.version + 1;
      const snapshot = await client.query(
        `INSERT INTO attendance.payroll_attendance_snapshots (
           company_id, payroll_period_id, period_version, employee_user_id, work_date,
           status, day_classification, presence_state, punctuality_state,
           evidence_state, approval_kind, approval_state, payroll_state,
           first_check_in, last_check_out, work_minutes, break_minutes,
           late_minutes, early_out_minutes, work_seconds, break_seconds,
           scheduled_seconds, late_seconds, early_departure_seconds,
           work_mode, exception_type, regularization_status,
           source_daily_record_id, source_daily_record_version,
           finalized_at, created_at
         )
         SELECT company_id, $2, $3, employee_user_id, work_date,
           status, day_classification, presence_state, punctuality_state,
           evidence_state, approval_kind, approval_state, payroll_state,
           first_check_in, last_check_out, work_minutes, break_minutes,
           late_minutes, early_out_minutes, work_seconds, break_seconds,
           scheduled_seconds, late_seconds, early_departure_seconds,
           work_mode, exception_type, regularization_status,
           id, version, transaction_timestamp(), transaction_timestamp()
         FROM attendance.daily_records
         WHERE company_id = $1
           AND work_date BETWEEN $4::date AND $5::date
           AND deleted_at IS NULL
         ORDER BY employee_user_id, work_date`,
        [context.companyId, periodId, nextVersion, current.period_start, current.period_end],
      );
      const locked = (await client.query<PayrollPeriodRow>(
        `UPDATE attendance.payroll_periods
         SET state = 'locked',
             locked_at = transaction_timestamp(),
             locked_by_user_id = $3,
             version = $4,
             updated_at = transaction_timestamp()
         WHERE id = $1 AND company_id = $2 AND state = 'open'
         RETURNING *`,
        [periodId, context.companyId, actor.id, nextVersion],
      )).rows[0];
      if (!locked) {
        throw conflict("Attendance payroll period was modified by another actor.", {
          payroll_period_id: periodId,
        });
      }
      await client.query(
        `INSERT INTO attendance.payroll_period_actions (
           company_id, payroll_period_id, action, actor_user_id, reason,
           resulting_version, occurred_at
         )
         VALUES ($1,$2,'locked',$3,$4,$5,transaction_timestamp())`,
        [context.companyId, periodId, actor.id, normalizedOptionalReason(input.reason), locked.version],
      );
      return {
        ...presentPeriod(locked),
        snapshot_rows: snapshot.rowCount ?? 0,
      };
    });
  }

  async unlockPeriod(
    actor: AuthUser,
    periodId: UUID,
    input: { company_id?: UUID; reason: string },
  ) {
    const context = this.resolveContext(actor, "attendance.payroll_period.unlock", input.company_id);
    this.assertCanManage(actor);
    const reason = input.reason.trim();
    if (!reason) throw badRequest("Unlock reason is required.");
    return this.withTransaction(async (client) => {
      await acquirePayrollAttendancePeriodLock(client, context.companyId);
      const current = await this.lockPeriodRow(client, context.companyId, periodId);
      if (current.state !== "locked") {
        throw conflict("Only locked attendance payroll periods can be unlocked.", {
          payroll_period_id: periodId,
          state: current.state,
        });
      }
      const unlocked = (await client.query<PayrollPeriodRow>(
        `UPDATE attendance.payroll_periods
         SET state = 'open',
             locked_at = NULL,
             locked_by_user_id = NULL,
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE id = $1 AND company_id = $2 AND state = 'locked'
         RETURNING *`,
        [periodId, context.companyId],
      )).rows[0];
      if (!unlocked) {
        throw conflict("Attendance payroll period was modified by another actor.", {
          payroll_period_id: periodId,
        });
      }
      await client.query(
        `INSERT INTO attendance.payroll_period_actions (
           company_id, payroll_period_id, action, actor_user_id, reason,
           resulting_version, occurred_at
         )
         VALUES ($1,$2,'unlocked',$3,$4,$5,transaction_timestamp())`,
        [context.companyId, periodId, actor.id, reason, unlocked.version],
      );
      return presentPeriod(unlocked);
    });
  }

  async summary(
    actor: AuthUser,
    periodId: UUID,
    input: { company_id?: UUID },
  ) {
    const context = this.resolveContext(actor, "attendance.payroll_period.summary", input.company_id);
    this.assertCanRead(actor);
    return this.withClient(async (client) => {
      const period = await this.findPeriod(client, context.companyId, periodId);
      const actions = (await client.query(
        `SELECT action, actor_user_id, reason, resulting_version, occurred_at
         FROM attendance.payroll_period_actions
         WHERE company_id = $1 AND payroll_period_id = $2
         ORDER BY occurred_at, id`,
        [context.companyId, periodId],
      )).rows.map(normalizeRow);
      if (period.state === "locked") {
        const snapshots = (await client.query<SnapshotRow>(
          `SELECT *
           FROM attendance.payroll_attendance_snapshots
           WHERE company_id = $1 AND payroll_period_id = $2 AND period_version = $3
           ORDER BY work_date, employee_user_id`,
          [context.companyId, periodId, period.version],
        )).rows;
        const adjustments = (await client.query<AdjustmentRow>(
          `SELECT *
           FROM attendance.payroll_attendance_adjustments
           WHERE company_id = $1 AND payroll_period_id = $2 AND period_version = $3
           ORDER BY created_at, id`,
          [context.companyId, periodId, period.version],
        )).rows;
        return {
          generated_at: new Date().toISOString(),
          period: presentPeriod(period),
          finalized: true,
          base_source: "finalized_snapshot",
          base: summarizeRows(snapshots.map(payrollValuesFromRecord)),
          rows: snapshots.map((row) => normalizeRow(row)),
          adjustments: adjustments.map((row) => normalizeRow(row)),
          adjustment_summary: summarizeAdjustments(adjustments),
          actions,
        };
      }
      const liveRows = (await client.query(
        `SELECT *
         FROM attendance.daily_records
         WHERE company_id = $1
           AND work_date BETWEEN $2::date AND $3::date
           AND deleted_at IS NULL
         ORDER BY work_date, employee_user_id`,
        [context.companyId, period.period_start, period.period_end],
      )).rows;
      return {
        generated_at: new Date().toISOString(),
        period: presentPeriod(period),
        finalized: false,
        base_source: "live_daily_records",
        base: summarizeRows(liveRows.map(payrollValuesFromRecord)),
        rows: liveRows.map(normalizeRow),
        adjustments: [],
        adjustment_summary: { count: 0, pending: 0 },
        actions,
      };
    });
  }

  private resolveContext(actor: AuthUser, operation: string, requestedCompanyId?: UUID | null) {
    return resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      requestedCompanyId,
      operation,
      requireActiveEmployment: true,
    });
  }

  private assertCanManage(actor: AuthUser): void {
    if (actor.roles.some((role) => role === Roles.Admin || role === Roles.HRManager || role === Roles.FinanceManager)) {
      return;
    }
    throw forbidden("Only Admin, HR, or Finance can manage attendance payroll periods.");
  }

  private assertCanRead(actor: AuthUser): void {
    if (actor.roles.some((role) =>
      role === Roles.Admin ||
      role === Roles.HRManager ||
      role === Roles.FinanceManager ||
      role === Roles.Auditor
    )) {
      return;
    }
    throw forbidden("Only Admin, HR, Finance, or Auditor can read attendance payroll period summaries.");
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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

  private async withClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  private requirePool(): Pool {
    if (!this.store.pgPool) {
      throw badRequest("Attendance payroll periods require PostgreSQL persistence.");
    }
    return this.store.pgPool;
  }

  private async lockPeriodRow(client: PoolClient, companyId: UUID, periodId: UUID): Promise<PayrollPeriodRow> {
    const period = (await client.query<PayrollPeriodRow>(
      `SELECT *, period_start::text AS period_start, period_end::text AS period_end
       FROM attendance.payroll_periods
       WHERE id = $1 AND company_id = $2
       FOR UPDATE`,
      [periodId, companyId],
    )).rows[0];
    if (!period) throw notFound("Attendance payroll period not found.", { payroll_period_id: periodId });
    return period;
  }

  private async findPeriod(client: PoolClient, companyId: UUID, periodId: UUID): Promise<PayrollPeriodRow> {
    const period = (await client.query<PayrollPeriodRow>(
      `SELECT *, period_start::text AS period_start, period_end::text AS period_end
       FROM attendance.payroll_periods
       WHERE id = $1 AND company_id = $2`,
      [periodId, companyId],
    )).rows[0];
    if (!period) throw notFound("Attendance payroll period not found.", { payroll_period_id: periodId });
    return period;
  }
}

export async function recordApprovedRegularizationPayrollAdjustments(
  client: Queryable,
  input: {
    companyId: UUID;
    employeeUserId: UUID;
    workDate: string;
    regularizationRequestId: UUID;
    regularizationRequestItemIds: UUID[];
    correctedDay: Record<string, unknown>;
  },
): Promise<void> {
  const period = (await client.query<PayrollPeriodRow>(
    `SELECT p.id, p.company_id, p.period_start::text AS period_start,
        p.period_end::text AS period_end, p.state, p.locked_at,
        p.locked_by_user_id, p.version, p.created_at, p.updated_at
     FROM attendance.payroll_periods p
     WHERE p.company_id = $1
       AND p.state = 'locked'
       AND $2::date BETWEEN p.period_start AND p.period_end
     ORDER BY p.period_start DESC, p.id
     LIMIT 1`,
    [input.companyId, input.workDate],
  )).rows[0];
  if (!period) return;
  const snapshot = (await client.query<SnapshotRow>(
    `SELECT *, work_date::text AS work_date
     FROM attendance.payroll_attendance_snapshots
     WHERE company_id = $1
       AND payroll_period_id = $2
       AND period_version = $3
       AND employee_user_id = $4
       AND work_date = $5::date
     LIMIT 1`,
    [input.companyId, period.id, period.version, input.employeeUserId, input.workDate],
  )).rows[0] ?? null;
  const finalizedValues = snapshot ? payrollValuesFromRecord(snapshot) : {};
  const correctedValues = payrollValuesFromRecord(input.correctedDay);
  const deltaValues = payrollDelta(finalizedValues, correctedValues);
  for (const itemId of input.regularizationRequestItemIds) {
    await client.query(
      `INSERT INTO attendance.payroll_attendance_adjustments (
         company_id, payroll_period_id, period_version, employee_user_id, work_date,
         source_type, source_id, regularization_request_id, finalized_snapshot_id,
         finalized_values, corrected_values, delta_values, status,
         created_at, updated_at
       )
       VALUES (
         $1,$2,$3,$4,$5::date,'attendance_regularization_item',$6,$7,$8,
         $9::jsonb,$10::jsonb,$11::jsonb,'pending',
         transaction_timestamp(),transaction_timestamp()
       )
       ON CONFLICT (company_id, payroll_period_id, period_version, source_type, source_id)
       DO UPDATE SET
         corrected_values = EXCLUDED.corrected_values,
         delta_values = EXCLUDED.delta_values,
         updated_at = transaction_timestamp()
       WHERE attendance.payroll_attendance_adjustments.corrected_values IS DISTINCT FROM EXCLUDED.corrected_values
          OR attendance.payroll_attendance_adjustments.delta_values IS DISTINCT FROM EXCLUDED.delta_values`,
      [
        input.companyId,
        period.id,
        period.version,
        input.employeeUserId,
        input.workDate,
        itemId,
        input.regularizationRequestId,
        snapshot?.id ?? null,
        JSON.stringify(finalizedValues),
        JSON.stringify(correctedValues),
        JSON.stringify(deltaValues),
      ],
    );
  }
}

export function payrollValuesFromRecord(record: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const column of payrollRelevantColumns) {
    const value = record[column];
    values[column] = value instanceof Date ? value.toISOString() : value ?? null;
  }
  return values;
}

function payrollDelta(
  finalizedValues: Record<string, unknown>,
  correctedValues: Record<string, unknown>,
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const key of ["work_seconds", "break_seconds", "late_seconds", "early_departure_seconds", "work_minutes", "break_minutes", "late_minutes", "early_out_minutes"]) {
    const before = Number(finalizedValues[key] ?? 0);
    const after = Number(correctedValues[key] ?? 0);
    delta[key] = after - before;
  }
  for (const key of ["status", "day_classification", "presence_state", "punctuality_state", "evidence_state", "approval_kind", "approval_state", "regularization_status"]) {
    if ((finalizedValues[key] ?? null) !== (correctedValues[key] ?? null)) {
      delta[key] = { from: finalizedValues[key] ?? null, to: correctedValues[key] ?? null };
    }
  }
  return delta;
}

function normalizeRange(periodStart: string, periodEnd: string) {
  if (!isoDatePattern.test(periodStart) || !isoDatePattern.test(periodEnd)) {
    throw badRequest("Payroll attendance period dates must use YYYY-MM-DD.");
  }
  if (periodStart > periodEnd) {
    throw badRequest("Payroll attendance period start must be on or before end.");
  }
  return { periodStart, periodEnd };
}

function normalizedOptionalReason(reason: string | null | undefined): string | null {
  const normalized = reason?.trim();
  return normalized ? normalized : null;
}

function isPgPeriodConflict(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "23505" || error.code === "23P01");
}

function presentPeriod(period: PayrollPeriodRow) {
  return {
    id: period.id,
    company_id: period.company_id,
    period_start: presentDate(period.period_start),
    period_end: presentDate(period.period_end),
    state: period.state,
    locked_at: period.locked_at?.toISOString() ?? null,
    locked_by_user_id: period.locked_by_user_id,
    version: period.version,
    created_at: period.created_at.toISOString(),
    updated_at: period.updated_at.toISOString(),
  };
}

function presentDate(value: string | Date): string {
  if (!(value instanceof Date)) return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function summarizeRows(rows: Record<string, unknown>[]) {
  const count = rows.length;
  const totalWorkSeconds = rows.reduce((total, row) => total + Number(row.work_seconds ?? 0), 0);
  const totalScheduledSeconds = rows.reduce((total, row) => total + Number(row.scheduled_seconds ?? 0), 0);
  return {
    records: count,
    present: rows.filter((row) => row.presence_state === "present").length,
    absent: rows.filter((row) => row.presence_state === "absent").length,
    incomplete: rows.filter((row) => row.presence_state === "incomplete" || row.presence_state === "partial").length,
    leave: rows.filter((row) => row.day_classification === "leave").length,
    wfh: rows.filter((row) => row.day_classification === "wfh").length,
    total_work_seconds: totalWorkSeconds,
    total_scheduled_seconds: totalScheduledSeconds,
    total_late_seconds: rows.reduce((total, row) => total + Number(row.late_seconds ?? 0), 0),
    total_early_departure_seconds: rows.reduce((total, row) => total + Number(row.early_departure_seconds ?? 0), 0),
  };
}

function summarizeAdjustments(rows: AdjustmentRow[]) {
  return {
    count: rows.length,
    pending: rows.filter((row) => row.status === "pending").length,
  };
}

function normalizeRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}
