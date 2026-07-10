import type { AttendanceDayRecord, AttendancePunch } from "#shared";
import type { PoolClient } from "pg";
import { AttendanceService, type AttendanceAutoPunchOutRunResult } from "../modules/attendance/service.js";
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

  async runScheduled(input: { referenceIso?: string; includeCatchUp?: boolean } = {}): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const schedule = await this.readSchedule(input.referenceIso);
    if (!schedule.enabled) {
      return skippedResult(schedule.referenceIso, "attendance auto punch-out is disabled by policy");
    }

    const dueRunKeys = this.dueRunKeys(schedule, Boolean(input.includeCatchUp));
    if (dueRunKeys.length === 0) {
      return skippedResult(schedule.referenceIso, "attendance auto punch-out is not due yet");
    }

    const result = await this.runDue({ referenceIso: schedule.referenceIso });
    if (!result.skipped) {
      for (const runKey of dueRunKeys) {
        this.completedRunKeys.add(runKey);
      }
    }
    return {
      ...result,
      run_keys: dueRunKeys
    };
  }

  async runDue(input: AttendanceAutoPunchoutWorkerRunInput = {}): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    if (this.store.pgPool && this.store.kind === "postgres") {
      return this.runDueWithPostgresLock(input);
    }
    return this.runDueUnlocked(input);
  }

  private dueRunKeys(schedule: AttendanceAutoPunchoutSchedule, includeCatchUp: boolean): string[] {
    const previousRunKey = `${schedule.timeZone}:${schedule.previousLocalDate}`;
    const currentRunKey = `${schedule.timeZone}:${schedule.localDate}`;
    const keys: string[] = [];
    if (includeCatchUp && !this.completedRunKeys.has(previousRunKey)) {
      keys.push(previousRunKey);
    }
    if (schedule.localClock >= schedule.autoPunchOutTime && !this.completedRunKeys.has(currentRunKey)) {
      keys.push(currentRunKey);
    }
    return keys;
  }

  private async readSchedule(referenceIso = new Date().toISOString()): Promise<AttendanceAutoPunchoutSchedule> {
    if (this.store.pgPool && this.store.kind === "postgres") {
      const client = await this.store.pgPool.connect();
      try {
        const policyResult = await client.query<{ config: Record<string, unknown> | null }>(
          `SELECT config
           FROM platform.admin_policies
           WHERE policy_key = 'attendance'
             AND status = 'active'
             AND deleted_at IS NULL
           LIMIT 1`
        );
        const companyResult = await client.query<{ timezone: string | null }>(
          `SELECT timezone
           FROM platform.company_profiles
           WHERE status = 'active'
           ORDER BY updated_at DESC
           LIMIT 1`
        );
        return scheduleFromConfig(
          policyResult.rows[0]?.config ?? {},
          companyResult.rows[0]?.timezone ?? "Asia/Kolkata",
          referenceIso
        );
      } finally {
        client.release();
      }
    }

    const policy = this.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "attendance" && candidate.status === "active" && !candidate.deleted_at
    );
    const company = this.store.companyProfiles.find((candidate) => candidate.status === "active") ?? this.store.companyProfiles[0];
    return scheduleFromConfig(policy?.config ?? {}, company?.timezone ?? "Asia/Kolkata", referenceIso);
  }

  private async runDueWithPostgresLock(input: AttendanceAutoPunchoutWorkerRunInput): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const client = await this.store.pgPool!.connect();
    let locked = false;
    try {
      const lockResult = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1, $2) AS locked",
        [ATTENDANCE_AUTO_PUNCHOUT_LOCK_NAMESPACE, ATTENDANCE_AUTO_PUNCHOUT_LOCK_ID]
      );
      locked = Boolean(lockResult.rows[0]?.locked);
      if (!locked) {
        return skippedResult(input.referenceIso, "attendance auto punch-out worker lock is held by another process");
      }

      await this.store.persistence?.reload();
      const result = await this.runDueUnlocked(input, { persistPostgresDirectly: true });
      await this.store.persistence?.reload();
      return result;
    } finally {
      if (locked) {
        await client.query(
          "SELECT pg_advisory_unlock($1, $2)",
          [ATTENDANCE_AUTO_PUNCHOUT_LOCK_NAMESPACE, ATTENDANCE_AUTO_PUNCHOUT_LOCK_ID]
        ).catch(() => undefined);
      }
      client.release();
    }
  }

  private async runDueUnlocked(
    input: AttendanceAutoPunchoutWorkerRunInput,
    options: { persistPostgresDirectly?: boolean } = {}
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const service = new AttendanceService(this.store);
    const result = service.autoPunchOutExpiredSessionsForAll(input);
    if (options.persistPostgresDirectly && result.punches_created > 0) {
      await this.persistPostgresAttendanceChanges(result);
    } else if (!options.persistPostgresDirectly && (result.punches_created > 0 || result.day_records_recomputed > 0)) {
      await this.store.persistence?.flush();
    }
    return {
      ...result,
      skipped: false,
      skip_reason: null,
      run_keys: []
    };
  }

  private async persistPostgresAttendanceChanges(result: AttendanceAutoPunchOutRunResult): Promise<void> {
    if (!this.store.pgPool) {
      return;
    }
    const client = await this.store.pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE attendance.punch_events IN SHARE ROW EXCLUSIVE MODE");
      await client.query("LOCK TABLE attendance.daily_records IN SHARE ROW EXCLUSIVE MODE");
      for (const closure of result.closures) {
        const duplicateCheckout = await client.query(
          `SELECT id
           FROM attendance.punch_events
           WHERE employee_user_id = $1
             AND event_type = 'check_out'
             AND deleted_at IS NULL
             AND occurred_at >= $2
             AND occurred_at <= $3
           LIMIT 1`,
          [closure.employee_user_id, closure.first_check_in_at, closure.closed_at]
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

function skippedResult(referenceIso: string | undefined, reason: string): AttendanceAutoPunchoutWorkerRunResult {
  return {
    reference_iso: referenceIso ?? new Date().toISOString(),
    scanned_users: 0,
    closed_sessions: 0,
    punches_created: 0,
    day_records_recomputed: 0,
    closures: [],
    skipped: true,
    skip_reason: reason,
    run_keys: []
  };
}

function scheduleFromConfig(
  config: Record<string, unknown>,
  timeZone: string,
  referenceIso: string
): AttendanceAutoPunchoutSchedule {
  const localDate = dateInTimeZone(referenceIso, timeZone);
  return {
    enabled: booleanConfig(config, "autoPunchOutEnabled", true),
    autoPunchOutTime: timeConfig(config, "autoPunchOutTime", DEFAULT_AUTO_PUNCHOUT_TIME),
    timeZone,
    referenceIso,
    localDate,
    previousLocalDate: addDays(localDate, -1),
    localClock: timeInTimeZone(referenceIso, timeZone)
  };
}

function booleanConfig(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function timeConfig(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value.trim()) ? value.trim() : fallback;
}

function dateInTimeZone(value: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
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
      hourCycle: "h23"
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

async function insertPunch(client: PoolClient, punch: AttendancePunch): Promise<void> {
  await client.query(
    `INSERT INTO attendance.punch_events (
      id, employee_user_id, event_type, occurred_at, work_mode, source,
      metadata, created_at, deleted_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
    ON CONFLICT (id) DO NOTHING`,
    [
      punch.id,
      punch.employee_user_id,
      punch.event_type,
      punch.occurred_at,
      punch.work_mode,
      punch.source,
      JSON.stringify(punch.metadata),
      punch.created_at,
      punch.deleted_at
    ]
  );
}

async function upsertDayRecord(client: PoolClient, day: AttendanceDayRecord): Promise<void> {
  await client.query(
    `INSERT INTO attendance.daily_records (
      id, employee_user_id, work_date, status, first_check_in, last_check_out,
      work_minutes, break_minutes, late_minutes, early_out_minutes, work_mode,
      note, exception_type, regularization_status, version, created_at, updated_at, deleted_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (employee_user_id, work_date) DO UPDATE
    SET status = EXCLUDED.status,
        first_check_in = EXCLUDED.first_check_in,
        last_check_out = EXCLUDED.last_check_out,
        work_minutes = EXCLUDED.work_minutes,
        break_minutes = EXCLUDED.break_minutes,
        late_minutes = EXCLUDED.late_minutes,
        early_out_minutes = EXCLUDED.early_out_minutes,
        work_mode = EXCLUDED.work_mode,
        note = EXCLUDED.note,
        exception_type = EXCLUDED.exception_type,
        regularization_status = EXCLUDED.regularization_status,
        version = EXCLUDED.version,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at`,
    [
      day.id,
      day.employee_user_id,
      day.work_date,
      day.status,
      day.first_check_in,
      day.last_check_out,
      day.work_minutes,
      day.break_minutes,
      day.late_minutes,
      day.early_out_minutes,
      day.work_mode,
      day.note,
      day.exception_type,
      day.regularization_status,
      day.version,
      day.created_at,
      day.updated_at,
      day.deleted_at
    ]
  );
}
