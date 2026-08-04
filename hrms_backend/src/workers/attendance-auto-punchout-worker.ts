import type { AttendanceDayRecord, AttendancePunch, UUID } from "#shared";
import type { PoolClient } from "pg";
import {
  AttendanceService,
  type AttendanceAutoPunchOutRunResult,
} from "../modules/attendance/service.js";
import type { MemoryDataStore } from "../platform/data-store.js";

export interface AttendanceAutoPunchoutWorkerRunInput {
  referenceIso?: string;
  batchSize?: number;
}

export interface AttendanceAutoPunchoutWorkerRunResult extends AttendanceAutoPunchOutRunResult {
  skipped: boolean;
  skip_reason: string | null;
  run_keys: string[];
}

const ATTENDANCE_AUTO_PUNCHOUT_LOCK_NAMESPACE = 20_260_606;
const ATTENDANCE_AUTO_PUNCHOUT_LOCK_ID = 1;
const DEFAULT_AUTO_PUNCHOUT_TIME = "23:59";

interface AttendanceAutoPunchoutSchedule {
  companyId: UUID;
  enabled: boolean;
  autoPunchOutTime: string;
  timeZone: string;
  referenceIso: string;
  localDate: string;
  previousLocalDate: string;
  localClock: string;
}

export class AttendanceAutoPunchoutWorker {
  private readonly completedRunKeys = new Set<string>();

  constructor(private readonly store: MemoryDataStore) {}

  async runScheduled(
    input: { referenceIso?: string; includeCatchUp?: boolean } = {},
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const referenceIso = input.referenceIso ?? new Date().toISOString();
    const schedules = await this.readSchedules(referenceIso);
    const dueSchedules = schedules
      .flatMap((schedule) =>
        schedule.enabled
          ? [
              {
                schedule,
                runKeys: this.dueRunKeys(
                  schedule,
                  Boolean(input.includeCatchUp),
                ),
              },
            ]
          : [],
      )
      .filter((item) => item.runKeys.length > 0);
    if (dueSchedules.length === 0) {
      return skippedResult(
        referenceIso,
        schedules.some((schedule) => schedule.enabled)
          ? "attendance auto punch-out is not due yet"
          : "attendance auto punch-out is disabled by policy",
      );
    }

    const results: AttendanceAutoPunchOutRunResult[] = [];
    const runKeys: string[] = [];
    const failures: unknown[] = [];
    let skippedExecutions = 0;
    for (const { schedule, runKeys: companyRunKeys } of dueSchedules) {
      try {
        const result = await this.runDueForCompanies(
          { referenceIso: schedule.referenceIso },
          new Set([schedule.companyId]),
        );
        if (result.skipped) {
          skippedExecutions += 1;
          continue;
        }
        results.push(result);
        for (const runKey of companyRunKeys) {
          this.completedRunKeys.add(runKey);
          runKeys.push(runKey);
        }
      } catch (error) {
        failures.push(error);
        // A single company must not prevent other tenants from being processed.
      }
    }
    if (results.length === 0) {
      if (failures.length === dueSchedules.length) {
        throw failures[0];
      }
      if (skippedExecutions === dueSchedules.length) {
        return skippedResult(
          referenceIso,
          "attendance auto punch-out worker execution was skipped",
        );
      }
      return skippedResult(
        referenceIso,
        "attendance auto punch-out did not complete for any due company",
      );
    }
    return aggregateResult(referenceIso, results, runKeys);
  }

  async runDue(
    input: AttendanceAutoPunchoutWorkerRunInput = {},
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const referenceIso = input.referenceIso ?? new Date().toISOString();
    const companyIds = new Set(
      (await this.readSchedules(referenceIso))
        .filter((schedule) => schedule.enabled)
        .map((schedule) => schedule.companyId),
    );
    if (companyIds.size === 0) {
      return skippedResult(
        referenceIso,
        "attendance auto punch-out is disabled by policy",
      );
    }
    return this.runDueForCompanies({ ...input, referenceIso }, companyIds);
  }

  private dueRunKeys(
    schedule: AttendanceAutoPunchoutSchedule,
    includeCatchUp: boolean,
  ): string[] {
    const previousRunKey = `attendance:auto-punchout:${schedule.companyId}:${schedule.previousLocalDate}`;
    const currentRunKey = `attendance:auto-punchout:${schedule.companyId}:${schedule.localDate}`;
    const keys: string[] = [];
    if (includeCatchUp && !this.completedRunKeys.has(previousRunKey)) {
      keys.push(previousRunKey);
    }
    if (
      schedule.localClock >= schedule.autoPunchOutTime &&
      !this.completedRunKeys.has(currentRunKey)
    ) {
      keys.push(currentRunKey);
    }
    return keys;
  }

  private async readSchedules(
    referenceIso = new Date().toISOString(),
  ): Promise<AttendanceAutoPunchoutSchedule[]> {
    if (this.store.pgPool && this.store.kind === "postgres") {
      const client = await this.store.pgPool.connect();
      try {
        const result = await client.query<{
          company_id: UUID;
          timezone: string | null;
          config: Record<string, unknown> | null;
        }>(
          `SELECT company.id AS company_id, company.timezone, policy.config
           FROM platform.company_profiles company
           JOIN platform.admin_policies policy
             ON policy.company_id = company.id
            AND policy.policy_key = 'attendance'
            AND policy.status = 'active'
            AND policy.deleted_at IS NULL
           WHERE company.status = 'active'`,
        );
        return result.rows.map((row) =>
          scheduleFromConfig(
            row.company_id,
            row.config ?? {},
            row.timezone ?? "Asia/Kolkata",
            referenceIso,
          ),
        );
      } finally {
        client.release();
      }
    }

    return this.store.companyProfiles
      .filter((company) => company.status === "active")
      .flatMap((company) => {
        const policy = this.store.adminPolicies.find(
          (candidate) =>
            candidate.company_id === company.id &&
            candidate.policy_key === "attendance" &&
            candidate.status === "active" &&
            !candidate.deleted_at,
        );
        return policy
          ? [
              scheduleFromConfig(
                company.id,
                policy.config,
                company.timezone,
                referenceIso,
              ),
            ]
          : [];
      });
  }

  private async runDueForCompanies(
    input: AttendanceAutoPunchoutWorkerRunInput,
    companyIds: Set<UUID>,
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    if (this.store.pgPool && this.store.kind === "postgres") {
      return this.runDueWithPostgresLock(input, companyIds);
    }
    return this.runDueUnlocked(input, { companyIds });
  }

  private async runDueWithPostgresLock(
    input: AttendanceAutoPunchoutWorkerRunInput,
    companyIds: Set<UUID>,
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const client = await this.store.pgPool!.connect();
    let locked = false;
    try {
      const lockResult = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1, $2) AS locked",
        [
          ATTENDANCE_AUTO_PUNCHOUT_LOCK_NAMESPACE,
          ATTENDANCE_AUTO_PUNCHOUT_LOCK_ID,
        ],
      );
      locked = Boolean(lockResult.rows[0]?.locked);
      if (!locked) {
        return skippedResult(
          input.referenceIso,
          "attendance auto punch-out worker lock is held by another process",
        );
      }

      await this.store.persistence?.reload();
      try {
        return await this.runDueUnlocked(input, {
          persistPostgresDirectly: true,
          companyIds,
        });
      } finally {
        await this.store.persistence?.reload();
      }
    } finally {
      if (locked) {
        await client
          .query("SELECT pg_advisory_unlock($1, $2)", [
            ATTENDANCE_AUTO_PUNCHOUT_LOCK_NAMESPACE,
            ATTENDANCE_AUTO_PUNCHOUT_LOCK_ID,
          ])
          .catch(() => undefined);
      }
      client.release();
    }
  }

  private async runDueUnlocked(
    input: AttendanceAutoPunchoutWorkerRunInput,
    options: {
      persistPostgresDirectly?: boolean;
      companyIds?: ReadonlySet<UUID>;
    } = {},
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const service = new AttendanceService(this.store);
    const result = service.autoPunchOutExpiredSessionsForAll({
      ...input,
      companyIds: options.companyIds,
    });
    if (options.persistPostgresDirectly && result.punches_created > 0) {
      await this.persistPostgresAttendanceChanges(result);
    } else if (
      !options.persistPostgresDirectly &&
      (result.punches_created > 0 || result.day_records_recomputed > 0)
    ) {
      await this.store.persistence?.flush();
    }
    return {
      ...result,
      skipped: false,
      skip_reason: null,
      run_keys: [],
    };
  }

  private async persistPostgresAttendanceChanges(
    result: AttendanceAutoPunchOutRunResult,
  ): Promise<void> {
    if (!this.store.pgPool) {
      return;
    }
    const client = await this.store.pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "LOCK TABLE attendance.punch_events IN SHARE ROW EXCLUSIVE MODE",
      );
      await client.query(
        "LOCK TABLE attendance.daily_records IN SHARE ROW EXCLUSIVE MODE",
      );
      for (const closure of result.closures) {
        const duplicateCheckout = await client.query(
          `SELECT id
           FROM attendance.punch_events
           WHERE company_id = $1
             AND employee_user_id = $2
             AND event_type = 'check_out'
             AND deleted_at IS NULL
             AND occurred_at >= $3
             AND occurred_at <= $4
           LIMIT 1`,
          [
            closure.company_id,
            closure.employee_user_id,
            closure.first_check_in_at,
            closure.closed_at,
          ],
        );
        if (duplicateCheckout.rowCount && duplicateCheckout.rowCount > 0) {
          continue;
        }
        for (const punch of closure.created_punches) {
          await insertPunch(client, punch);
        }
        if (closure.day_record) {
          await upsertDayRecord(client, closure.day_record);
        }
        await persistOutboxEvents(
          client,
          this.store,
          new Set(closure.created_punches.map((punch) => punch.id)),
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function skippedResult(
  referenceIso: string | undefined,
  reason: string,
): AttendanceAutoPunchoutWorkerRunResult {
  return {
    reference_iso: referenceIso ?? new Date().toISOString(),
    scanned_users: 0,
    closed_sessions: 0,
    punches_created: 0,
    day_records_recomputed: 0,
    closures: [],
    skipped: true,
    skip_reason: reason,
    run_keys: [],
  };
}

function aggregateResult(
  referenceIso: string,
  results: AttendanceAutoPunchOutRunResult[],
  runKeys: string[],
): AttendanceAutoPunchoutWorkerRunResult {
  return {
    reference_iso: referenceIso,
    scanned_users: results.reduce(
      (total, result) => total + result.scanned_users,
      0,
    ),
    closed_sessions: results.reduce(
      (total, result) => total + result.closed_sessions,
      0,
    ),
    punches_created: results.reduce(
      (total, result) => total + result.punches_created,
      0,
    ),
    day_records_recomputed: results.reduce(
      (total, result) => total + result.day_records_recomputed,
      0,
    ),
    closures: results.flatMap((result) => result.closures),
    skipped: false,
    skip_reason: null,
    run_keys: runKeys,
  };
}

function scheduleFromConfig(
  companyId: UUID,
  config: Record<string, unknown>,
  timeZone: string,
  referenceIso: string,
): AttendanceAutoPunchoutSchedule {
  const localDate = dateInTimeZone(referenceIso, timeZone);
  return {
    companyId,
    enabled: booleanConfig(config, "autoPunchOutEnabled", true),
    autoPunchOutTime: timeConfig(
      config,
      "autoPunchOutTime",
      DEFAULT_AUTO_PUNCHOUT_TIME,
    ),
    timeZone,
    referenceIso,
    localDate,
    previousLocalDate: addDays(localDate, -1),
    localClock: timeInTimeZone(referenceIso, timeZone),
  };
}

function booleanConfig(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function timeConfig(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = config[key];
  return typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/u.test(value.trim())
    ? value.trim()
    : fallback;
}

function dateInTimeZone(value: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to UTC below.
  }
  return value.slice(0, 10);
}

function timeInTimeZone(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  } catch {
    return value.slice(11, 16);
  }
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function insertPunch(
  client: PoolClient,
  punch: AttendancePunch,
): Promise<void> {
  await client.query(
    `INSERT INTO attendance.punch_events (
      id, company_id, employee_user_id, actor_user_id, event_type, occurred_at,
      work_mode, source, origin, metadata, created_at, deleted_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
    ON CONFLICT (id) DO NOTHING`,
    [
      punch.id,
      punch.company_id,
      punch.employee_user_id,
      punch.actor_user_id,
      punch.event_type,
      punch.occurred_at,
      punch.work_mode,
      punch.source,
      punch.origin,
      JSON.stringify(punch.metadata),
      punch.created_at,
      punch.deleted_at,
    ],
  );
}

async function upsertDayRecord(
  client: PoolClient,
  day: AttendanceDayRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO attendance.daily_records (
      id, company_id, employee_user_id, work_date, status, day_classification,
      presence_state, punctuality_state, evidence_state, approval_kind, approval_state,
      payroll_state, first_check_in, last_check_out, work_minutes, break_minutes,
      late_minutes, early_out_minutes, work_seconds, break_seconds, scheduled_seconds,
      late_seconds, early_departure_seconds, work_mode, note, exception_type,
      regularization_status, version, created_at, updated_at, deleted_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
    ON CONFLICT (company_id, employee_user_id, work_date) DO UPDATE
    SET status = EXCLUDED.status,
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
        version = EXCLUDED.version,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at`,
    [
      day.id,
      day.company_id,
      day.employee_user_id,
      day.work_date,
      day.status,
      day.day_classification,
      day.presence_state,
      day.punctuality_state,
      day.evidence_state,
      day.approval_kind,
      day.approval_state,
      day.payroll_state,
      day.first_check_in,
      day.last_check_out,
      day.work_minutes,
      day.break_minutes,
      day.late_minutes,
      day.early_out_minutes,
      day.work_seconds,
      day.break_seconds,
      day.scheduled_seconds,
      day.late_seconds,
      day.early_departure_seconds,
      day.work_mode,
      day.note,
      day.exception_type,
      day.regularization_status,
      day.version,
      day.created_at,
      day.updated_at,
      day.deleted_at,
    ],
  );
}

async function persistOutboxEvents(
  client: PoolClient,
  store: MemoryDataStore,
  aggregateIds: ReadonlySet<string>,
): Promise<void> {
  for (const event of store.outbox) {
    if (!aggregateIds.has(event.aggregate_id)) continue;
    await client.query(
      `INSERT INTO platform.outbox_events (
        id, event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key,
        status, retry_count, available_at, created_at, published_at, failed_at, last_error
      )
      OVERRIDING SYSTEM VALUE
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status, retry_count = EXCLUDED.retry_count,
          available_at = EXCLUDED.available_at, published_at = EXCLUDED.published_at,
          failed_at = EXCLUDED.failed_at, last_error = EXCLUDED.last_error`,
      [
        event.id,
        event.event_id,
        event.aggregate_type,
        event.aggregate_id,
        event.event_type,
        JSON.stringify(event.payload),
        event.idempotency_key,
        event.status,
        event.retry_count,
        event.available_at,
        event.created_at,
        event.published_at,
        event.failed_at,
        event.last_error,
      ],
    );
  }
}
