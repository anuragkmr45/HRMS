import { createHash } from "node:crypto";
import type { AttendancePunchEventType, AuthUser, UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { conflict } from "../../platform/errors.js";
import { AttendanceDayStatuses, AttendancePunchEventTypes } from "#shared";
import {
  PostgresAttendanceCommandRepository,
  type AttendanceCommandTransactionRepository,
  type PlatformIdempotencyKeyRecord,
  type AttendanceSessionRecord,
} from "./command-repository.js";
import { decideAttendanceTransition } from "./session-transition.js";

export interface AttendanceCommandInput {
  event_type: AttendancePunchEventType;
  occurred_at?: string;
  work_mode: "office" | "remote" | "wfh" | "field";
  source: "web" | "mobile" | "kiosk" | "admin";
  metadata: Record<string, unknown>;
}

interface AttendanceCommandOutcome {
  response: Record<string, unknown>;
  responseStatus: number;
}

export const ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX = "attendance.punch";
export const ATTENDANCE_COMMAND_RESOURCE_TYPE = "attendance.command_execution";
export const ATTENDANCE_IDEMPOTENCY_EXPIRATION_INTERVAL = "24 hours";

export function canonicalJsonHash(value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(jsonRoundTrip(value))))
    .digest("hex");
}

export const canonicalAttendanceRequestHash = canonicalJsonHash;
export const canonicalAttendanceResponseHash = canonicalJsonHash;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function jsonRoundTrip(
  value: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Idempotency hash input must be JSON serializable.");
    }
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message === "Idempotency hash input must be JSON serializable."
    ) {
      throw error;
    }
    throw new TypeError("Idempotency hash input must be JSON serializable.", {
      cause: error,
    });
  }
}

export class AttendanceCommandService {
  constructor(private readonly store: MemoryDataStore) {}

  async execute(input: {
    actor: AuthUser;
    companyId: UUID;
    timeZone: string;
    receivedAt: string;
    idempotencyKey: string;
    command: AttendanceCommandInput;
    policy: {
      fullDayPunchWindow: boolean;
      punchInStart: string;
      punchInEnd: string;
      punchOutStart: string;
      punchOutEnd: string;
      allowOffDayPunches: boolean;
      graceMinutes: number;
    };
    isWorkingDay: boolean;
  }): Promise<Record<string, unknown>> {
    const pool = this.store.pgPool;
    if (!pool)
      throw new Error(
        "PostgreSQL attendance commands require a configured pgPool.",
      );
    const requestedOccurredAt = input.command.occurred_at ?? null;
    const occurredAt = input.command.occurred_at ?? input.receivedAt;
    const workDate = dateInTimeZone(occurredAt, input.timeZone);
    const requestHash = canonicalAttendanceRequestHash({
      company_id: input.companyId,
      actor_user_id: input.actor.id,
      employee_user_id: input.actor.id,
      event_type: input.command.event_type,
      occurred_at: requestedOccurredAt,
      work_mode: input.command.work_mode,
      source: input.command.source,
      metadata: input.command.metadata,
    });
    const scope = `${ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX}:${input.companyId}`;
    const repository = new PostgresAttendanceCommandRepository(pool);
    try {
      const result = await repository.transaction<AttendanceCommandOutcome>(
        async (tx) => {
          const platformKey = await this.acquirePlatformIdempotencyKey(tx, {
            scope,
            actorUserId: input.actor.id,
            idempotencyKey: input.idempotencyKey,
            requestHash,
          });
          if (platformKey.status === "completed") {
            return this.replayCompletedCommand(tx, platformKey, requestHash);
          }
          const state = await tx.ensureAndLockEmployeeState(
            input.companyId,
            input.actor.id,
          );
          const command = await tx.createCommandExecution({
            companyId: input.companyId,
            actorUserId: input.actor.id,
            employeeUserId: input.actor.id,
            platformIdempotencyKeyId: platformKey.id,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            commandType: input.command.event_type,
            occurredAt,
            requestSnapshot: {
              occurred_at: requestedOccurredAt,
              effective_occurred_at: occurredAt,
              work_date: workDate,
              work_mode: input.command.work_mode,
              source: input.command.source,
              metadata: input.command.metadata,
            },
          });
          const open = await tx.findOpenSessionForUpdate(
            input.companyId,
            input.actor.id,
          );
          const stateDecision = decideAttendanceTransition(
            state.state,
            input.command.event_type,
          );
          const policyReason = policyBlocked(
            input.command.event_type,
            occurredAt,
            input.timeZone,
            input.policy,
            input.isWorkingDay,
            state.state,
          );
          if (
            !stateDecision.allowed ||
            policyReason ||
            (open?.last_transition_at &&
              Date.parse(occurredAt) < Date.parse(open.last_transition_at))
          ) {
            const reason = !stateDecision.allowed
              ? stateDecision.reason_detail
              : (policyReason ??
                "Client timestamp precedes the previous session transition.");
            const code = !stateDecision.allowed
              ? stateDecision.reason_code
              : policyReason
                ? "policy_window_rejected"
                : "invalid_chronology";
            const previous = state.state;
            const decision = await tx.createDecision({
              commandExecutionId: command.id,
              companyId: input.companyId,
              employeeUserId: input.actor.id,
              outcome: "denied",
              reasonCode: code as never,
              reasonDetail: reason,
              previousState: previous,
              nextState: previous,
              policySnapshot: input.policy,
              evidenceSnapshot: {
                state,
                open_session_id: open?.id ?? null,
                occurred_at: occurredAt,
              },
            });
            const response = {
              allowed: false,
              command_id: command.id,
              decision_id: decision.id,
              reason_code: code,
              reason_detail: reason,
              next_allowed_actions: allowedActions(previous),
              punch_policy: input.policy,
            };
            await tx.completeCommand({
              commandExecutionId: command.id,
              status: "denied",
              responseSnapshot: response,
            });
            await tx.completePlatformIdempotencyKey({
              id: platformKey.id,
              resourceType: ATTENDANCE_COMMAND_RESOURCE_TYPE,
              resourceId: command.id,
              responseHash: canonicalAttendanceResponseHash(response),
              responseStatus: 409,
            });
            return { response, responseStatus: 409 };
          }
          if (
            (state.current_session_id &&
              open?.id !== state.current_session_id) ||
            (state.state === "not_checked_in" && open)
          )
            throw conflict(
              "Attendance session state is inconsistent; retry the command.",
            );
          const decision = await tx.createDecision({
            commandExecutionId: command.id,
            companyId: input.companyId,
            employeeUserId: input.actor.id,
            outcome: "allowed",
            reasonCode: null,
            reasonDetail: null,
            previousState: stateDecision.previous_state,
            nextState: stateDecision.next_state,
            policySnapshot: input.policy,
            evidenceSnapshot: {
              state,
              open_session_id: open?.id ?? null,
              occurred_at: occurredAt,
            },
          });
          let session: AttendanceSessionRecord;
          try {
            session = await this.transition(
              tx,
              input.companyId,
              input.actor.id,
              workDate,
              occurredAt,
              input.command,
              open,
              stateDecision.action,
            );
          } catch (error) {
            if (isAttendanceSessionSingleOpenViolation(error))
              throw conflict(
                "The employee already has an open attendance session.",
              );
            throw error;
          }
          await tx.updateEmployeeState({
            companyId: input.companyId,
            employeeUserId: input.actor.id,
            state: stateDecision.next_state,
            currentSessionId:
              stateDecision.next_state === "not_checked_in" ? null : session.id,
          });
          const punch = (
            await tx.insertPunchEvent({
              companyId: input.companyId,
              employeeUserId: input.actor.id,
              eventType: input.command.event_type,
              occurredAt,
              workMode: input.command.work_mode,
              source: input.command.source,
              metadata: input.command.metadata,
              commandExecutionId: command.id,
              sessionId: session.id,
              decisionId: decision.id,
            })
          ).rows[0]!;
          const day = await projectDay(
            tx,
            input.companyId,
            input.actor.id,
            session.work_date,
            input.command.work_mode,
            input.policy.graceMinutes,
            input.timeZone,
          );
          await tx.insertOutboxEvent(command.id, {
            company_id: input.companyId,
            command_id: command.id,
            decision_id: decision.id,
            session_id: session.id,
            punch_id: punch.id,
            employee_user_id: input.actor.id,
            event_type: input.command.event_type,
            occurred_at: occurredAt,
            work_date: session.work_date,
            day_status: (day as { status?: unknown }).status ?? null,
          });
          const response = {
            allowed: true,
            command_id: command.id,
            decision_id: decision.id,
            session_id: session.id,
            punch_id: punch.id,
            punch: {
              id: punch.id,
              company_id: input.companyId,
              employee_user_id: input.actor.id,
              ...input.command,
              occurred_at: occurredAt,
              created_at: punch.created_at,
              deleted_at: null,
            },
            day_status: day,
            next_allowed_actions: allowedActions(stateDecision.next_state),
            next_allowed_action:
              allowedActions(stateDecision.next_state)[0] ?? null,
            punch_policy: input.policy,
          };
          await tx.completeCommand({
            commandExecutionId: command.id,
            status: "completed",
            sessionId: session.id,
            punchEventId: punch.id,
            responseSnapshot: response,
          });
          await tx.completePlatformIdempotencyKey({
            id: platformKey.id,
            resourceType: ATTENDANCE_COMMAND_RESOURCE_TYPE,
            resourceId: command.id,
            responseHash: canonicalAttendanceResponseHash(response),
            responseStatus: 200,
          });
          return { response, responseStatus: 200 };
        },
      );
      if (result.responseStatus === 409) {
        const response = result.response;
        throw conflict(
          String(
            response["reason_detail"] ??
              "Attendance punch is duplicate or out of sequence.",
          ),
          {
            reason_code: response["reason_code"],
            next_allowed_actions: response["next_allowed_actions"],
            punch_policy: response["punch_policy"],
          },
        );
      }
      return result.response;
    } catch (error) {
      if (isAttendanceIdempotencyUniqueViolation(error)) {
        throw conflict(
          "Attendance command conflicts with an existing command. Retry with a new idempotency key.",
        );
      }
      throw error;
    }
  }

  private async acquirePlatformIdempotencyKey(
    tx: AttendanceCommandTransactionRepository,
    input: {
      scope: string;
      actorUserId: UUID;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<PlatformIdempotencyKeyRecord> {
    let existing = await tx.findPlatformIdempotencyKeyForUpdate(input);
    if (existing?.is_expired) {
      const deleted = await tx.deleteExpiredPlatformIdempotencyKey(existing.id);
      if (deleted) {
        existing = null;
      } else {
        throw new Error(
          "Expired platform idempotency key could not be replaced.",
        );
      }
    }

    if (!existing) {
      const claimed = await tx.claimPlatformIdempotencyKey({
        ...input,
        expiresIn: ATTENDANCE_IDEMPOTENCY_EXPIRATION_INTERVAL,
      });
      if (claimed) return claimed;
      existing = await tx.findPlatformIdempotencyKeyForUpdate(input);
    }

    if (!existing)
      throw new Error("Platform idempotency key claim could not be resolved.");
    if (existing.request_hash !== input.requestHash) {
      throw conflict(
        "Idempotency key was already used with a different attendance command.",
      );
    }
    if (existing.status === "processing") {
      throw conflict(
        "Attendance command with this idempotency key is still being processed.",
      );
    }
    return existing;
  }

  private async replayCompletedCommand(
    tx: AttendanceCommandTransactionRepository,
    key: PlatformIdempotencyKeyRecord,
    requestHash: string,
  ): Promise<AttendanceCommandOutcome> {
    if (key.status !== "completed") {
      throw new Error("Completed platform idempotency key is inconsistent.");
    }
    if (key.request_hash !== requestHash)
      throw conflict(
        "Idempotency key was already used with a different attendance command.",
      );
    if (
      key.resource_type !== ATTENDANCE_COMMAND_RESOURCE_TYPE ||
      !key.resource_id ||
      !key.response_hash ||
      !key.response_status
    ) {
      throw new Error("Completed platform idempotency key is inconsistent.");
    }
    const command = await tx.findCommandExecutionById(key.resource_id);
    if (
      !command?.response_snapshot ||
      command.platform_idempotency_key_id !== key.id
    ) {
      throw new Error(
        "Completed attendance idempotency resource is inconsistent.",
      );
    }
    if (
      command.request_hash !== key.request_hash ||
      command.actor_user_id !== key.actor_user_id ||
      (command.status !== "completed" && command.status !== "denied") ||
      !command.completed_at
    ) {
      throw new Error(
        "Completed attendance idempotency command is inconsistent.",
      );
    }
    if (
      canonicalAttendanceResponseHash(command.response_snapshot) !==
      key.response_hash
    ) {
      throw new Error(
        "Attendance idempotency replay response integrity check failed.",
      );
    }
    if (key.response_status !== 200 && key.response_status !== 409) {
      throw new Error(
        "Completed attendance idempotency response status is inconsistent.",
      );
    }
    return {
      response: command.response_snapshot,
      responseStatus: key.response_status,
    };
  }

  private async transition(
    tx: AttendanceCommandTransactionRepository,
    companyId: UUID,
    employeeId: UUID,
    workDate: string,
    occurredAt: string,
    command: AttendanceCommandInput,
    open: AttendanceSessionRecord | null,
    action: string,
  ): Promise<AttendanceSessionRecord> {
    if (action === "open_session")
      return tx.createSession({
        companyId,
        employeeUserId: employeeId,
        workDate,
        checkedInAt: occurredAt,
        workMode: command.work_mode,
        source: command.source,
        metadata: command.metadata,
      });
    if (!open) throw conflict("There is no open attendance session.");
    const args = {
      sessionId: open.id,
      companyId,
      employeeUserId: employeeId,
      expectedVersion: open.version,
      occurredAt,
    };
    if (action === "start_break") return tx.startBreak(args);
    if (action === "end_break") return tx.endBreak(args);
    return tx.closeSession(args);
  }
}

type PostgresConstraintError = { code?: unknown; constraint?: unknown };

function isUniqueViolation(error: unknown): error is PostgresConstraintError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PostgresConstraintError).code === "23505"
  );
}

export function isAttendanceSessionSingleOpenViolation(
  error: unknown,
): boolean {
  return (
    isUniqueViolation(error) &&
    error.constraint === "attendance_sessions_single_open_idx"
  );
}

function isAttendanceIdempotencyUniqueViolation(error: unknown): boolean {
  return (
    isUniqueViolation(error) &&
    [
      "idempotency_keys_scope_idempotency_key_actor_user_id_key",
      "attendance_commands_platform_idempotency_key_uq",
    ].includes(typeof error.constraint === "string" ? error.constraint : "")
  );
}
function allowedActions(state: string): AttendancePunchEventType[] {
  return state === "not_checked_in"
    ? [AttendancePunchEventTypes.CheckIn]
    : state === "working"
      ? [
          AttendancePunchEventTypes.BreakStart,
          AttendancePunchEventTypes.CheckOut,
        ]
      : [AttendancePunchEventTypes.BreakEnd];
}
type CommandPolicy = {
  fullDayPunchWindow: boolean;
  punchInStart: string;
  punchInEnd: string;
  punchOutStart: string;
  punchOutEnd: string;
  allowOffDayPunches: boolean;
  graceMinutes: number;
};
type PunchProjectionRow = {
  event_type: AttendancePunchEventType;
  occurred_at: string;
  work_mode: string;
} & Record<string, unknown>;
function policyBlocked(
  type: AttendancePunchEventType,
  at: string,
  zone: string,
  policy: CommandPolicy,
  working: boolean,
  state: string,
): string | null {
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
  if (
    type === "check_in" &&
    state === "not_checked_in" &&
    !policy.allowOffDayPunches &&
    !working
  )
    return "Punch-in is not allowed on company off days.";
  if (policy.fullDayPunchWindow) return null;
  const range: [string, string] | null =
    type === "check_in"
      ? [policy.punchInStart, policy.punchInEnd]
      : type === "check_out"
        ? [policy.punchOutStart, policy.punchOutEnd]
        : null;
  if (!range) return null;
  const now = toMinutes(local),
    start = toMinutes(range[0]),
    end = toMinutes(range[1]);
  if (
    (start <= end && (now < start || now > end)) ||
    (start > end && now > end && now < start)
  )
    return `Punch-${type === "check_in" ? "in" : "out"} is allowed between ${range[0]} and ${range[1]}.`;
  return null;
}
function toMinutes(value: string): number {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
}
function dateInTimeZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const data = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${data.year}-${data.month}-${data.day}`;
}
async function projectDay(
  tx: AttendanceCommandTransactionRepository,
  companyId: UUID,
  employeeId: UUID,
  workDate: string,
  workMode: string,
  grace: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const punches = (
    await tx.query<PunchProjectionRow>(
      `SELECT event_type, occurred_at, work_mode FROM attendance.punch_events WHERE company_id=$1 AND employee_user_id=$2 AND deleted_at IS NULL AND occurred_at >= $3::date AND occurred_at < ($3::date + interval '2 days') ORDER BY occurred_at`,
      [companyId, employeeId, workDate],
    )
  ).rows;
  const checkIn =
    punches.find((p) => p.event_type === "check_in")?.occurred_at ?? null;
  const checkOut =
    punches.filter((p) => p.event_type === "check_out").at(-1)?.occurred_at ??
    null;
  let breakStart: string | null = null,
    breaks = 0;
  for (const p of punches) {
    if (p.event_type === "break_start") {
      breakStart = p.occurred_at;
    } else if (p.event_type === "break_end" && breakStart !== null) {
      const breakStartedAt = breakStart;
      breaks += Math.max(
        0,
        Math.round(
          (Date.parse(p.occurred_at) - Date.parse(breakStartedAt)) / 60000,
        ),
      );
      breakStart = null;
    }
  }
  const work = checkIn
    ? Math.max(
        0,
        Math.round(
          ((checkOut ? Date.parse(checkOut) : Date.now()) -
            Date.parse(checkIn)) /
            60000,
        ) - breaks,
      )
    : 0;
  const status =
    workMode === "wfh"
      ? AttendanceDayStatuses.Wfh
      : AttendanceDayStatuses.Present;
  const row = (
    await tx.query<Record<string, unknown>>(
      `INSERT INTO attendance.daily_records (company_id,employee_user_id,work_date,status,first_check_in,last_check_out,work_minutes,break_minutes,late_minutes,early_out_minutes,work_mode,note,exception_type,regularization_status,version,created_at,updated_at,deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,NULL,NULL,NULL,1,now(),now(),NULL) ON CONFLICT (company_id,employee_user_id,work_date) DO UPDATE SET status=EXCLUDED.status,first_check_in=EXCLUDED.first_check_in,last_check_out=EXCLUDED.last_check_out,work_minutes=EXCLUDED.work_minutes,break_minutes=EXCLUDED.break_minutes,work_mode=EXCLUDED.work_mode,version=attendance.daily_records.version+1,updated_at=now() RETURNING *`,
      [
        companyId,
        employeeId,
        workDate,
        status,
        checkIn,
        checkOut,
        work,
        breaks,
        workMode,
      ],
    )
  ).rows[0];
  return row ?? {};
}
