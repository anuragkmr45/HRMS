import type { UUID } from "#shared";
import { AttendanceCommandService } from "../modules/attendance/command-service.js";
import {
  AttendanceService,
  type AttendanceAutoPunchOutClosure,
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

interface AttendanceAutoCheckoutCandidate {
  company_id: UUID;
  employee_user_id: UUID;
  session_id: UUID;
  work_date: string;
  checked_in_at: string;
}

export class AttendanceAutoPunchoutWorker {
  private readonly completedRunKeys = new Set<string>();

  constructor(private readonly store: MemoryDataStore) {}

  async runScheduled(
    input: { referenceIso?: string; includeCatchUp?: boolean } = {},
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const referenceIso = input.referenceIso ?? new Date().toISOString();
    if (this.store.pgPool && this.store.kind === "postgres") {
      return this.runDue({ referenceIso });
    }
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
    if (this.store.pgPool && this.store.kind === "postgres") {
      return this.runDueForCompanies({ ...input, referenceIso });
    }
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
    companyIds?: Set<UUID>,
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    if (this.store.pgPool && this.store.kind === "postgres") {
      return this.runDueWithPostgresLock(input, companyIds);
    }
    return this.runDueUnlocked(input, { companyIds: companyIds ?? new Set() });
  }

  private async runDueWithPostgresLock(
    input: AttendanceAutoPunchoutWorkerRunInput,
    companyIds?: Set<UUID>,
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

      try {
        return await this.runDuePostgresDbFirst(input, companyIds);
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
      companyIds?: ReadonlySet<UUID>;
    } = {},
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const service = new AttendanceService(this.store);
    const result = service.autoPunchOutExpiredSessionsForAll({
      ...input,
      companyIds: options.companyIds,
    });
    if (result.punches_created > 0 || result.day_records_recomputed > 0) {
      await this.store.persistence?.flush();
    }
    return {
      ...result,
      skipped: false,
      skip_reason: null,
      run_keys: [],
    };
  }

  private async runDuePostgresDbFirst(
    input: AttendanceAutoPunchoutWorkerRunInput,
    companyIds?: ReadonlySet<UUID>,
  ): Promise<AttendanceAutoPunchoutWorkerRunResult> {
    const referenceIso = input.referenceIso ?? new Date().toISOString();
    let cursor: { checkedInAt: string; sessionId: UUID } | null = null;
    let scannedCandidates = 0;
    const closures: AttendanceAutoPunchOutClosure[] = [];
    const service = new AttendanceCommandService(this.store);
    for (;;) {
      const candidates = await this.readOpenSessionCandidates({
        referenceIso,
        batchSize: input.batchSize,
        companyIds,
        cursor,
      });
      if (candidates.length === 0) break;
      scannedCandidates += candidates.length;
      for (const candidate of candidates) {
        const closure = await service.autoCheckoutOpenSession({
          companyId: candidate.company_id,
          employeeUserId: candidate.employee_user_id,
          sessionId: candidate.session_id,
          referenceIso,
        });
        if (closure) closures.push(closure);
      }
      const last = candidates.at(-1)!;
      cursor = {
        checkedInAt: last.checked_in_at,
        sessionId: last.session_id,
      };
    }
    if (scannedCandidates === 0) {
      return skippedResult(
        referenceIso,
        "attendance auto punch-out has no open sessions to scan",
      );
    }
    if (closures.length === 0) {
      return skippedResult(
        referenceIso,
        "attendance auto punch-out is not due yet",
      );
    }
    const result: AttendanceAutoPunchOutRunResult = {
      reference_iso: referenceIso,
      scanned_users: scannedCandidates,
      closed_sessions: closures.length,
      punches_created: closures.reduce(
        (total, closure) => total + closure.created_punches.length,
        0,
      ),
      day_records_recomputed: new Set(
        closures.map(
          (closure) =>
            `${closure.company_id}:${closure.employee_user_id}:${closure.work_date}`,
        ),
      ).size,
      closures,
    };
    return {
      ...result,
      skipped: false,
      skip_reason: null,
      run_keys: closures.map(
        (closure) =>
          `attendance:auto-punchout:${closure.company_id}:${closure.work_date}`,
      ),
    };
  }

  private async readOpenSessionCandidates(input: {
    referenceIso: string;
    batchSize?: number;
    companyIds?: ReadonlySet<UUID>;
    cursor?: { checkedInAt: string; sessionId: UUID } | null;
  }): Promise<AttendanceAutoCheckoutCandidate[]> {
    const client = await this.store.pgPool!.connect();
    const batchSize = Math.max(1, Math.floor(input.batchSize ?? 10_000));
    const companyIds = input.companyIds ? [...input.companyIds] : null;
    try {
      const result = await client.query<AttendanceAutoCheckoutCandidate>(
        `SELECT
           session.company_id,
           session.employee_user_id,
           session.id AS session_id,
           session.work_date::text AS work_date,
           session.checked_in_at::text AS checked_in_at
         FROM attendance.sessions session
         JOIN platform.company_profiles company
           ON company.id = session.company_id
          AND company.status = 'active'
         JOIN core.users employee
           ON employee.id = session.employee_user_id
          AND employee.deleted_at IS NULL
          AND employee.employment_status = 'active'
         WHERE session.closed_at IS NULL
           AND session.deleted_at IS NULL
           AND session.checked_in_at <= $1::timestamptz
           AND ($2::uuid[] IS NULL OR session.company_id = ANY($2::uuid[]))
           AND (
             $4::timestamptz IS NULL
             OR (session.checked_in_at, session.id) > ($4::timestamptz, $5::uuid)
           )
         ORDER BY session.checked_in_at ASC, session.id ASC
         LIMIT $3`,
        [
          input.referenceIso,
          companyIds,
          batchSize,
          input.cursor?.checkedInAt ?? null,
          input.cursor?.sessionId ?? null,
        ],
      );
      return result.rows;
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
