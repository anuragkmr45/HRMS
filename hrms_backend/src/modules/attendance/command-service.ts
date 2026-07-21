import { createHash } from "node:crypto";
import type { AttendancePunchEventType, AuthUser, UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { badRequest, conflict } from "../../platform/errors.js";
import { AttendanceDayStatuses, AttendancePunchEventTypes } from "#shared";
import {
  PostgresAttendanceCommandRepository,
  type AttendanceCommandTransactionRepository,
  type PlatformIdempotencyKeyRecord,
  type AttendanceSessionRecord,
} from "./command-repository.js";
import {
  buildPunchRecordedEvent,
  buildRegularizationDecisionEvent,
} from "./events.js";
import type { EffectiveAttendancePolicy } from "./policy-config.js";
import { resolveEffectiveAttendancePolicy } from "./policy-resolver.js";
import { decideAttendanceTransition } from "./session-transition.js";

export interface AttendanceCommandInput {
  event_type: AttendancePunchEventType;
  work_mode: "office" | "remote" | "wfh" | "field";
  source: "web" | "mobile" | "kiosk" | "admin";
  metadata: Record<string, unknown>;
}

export type AttendanceCommandKind =
  | "employee_manual_now"
  | "manager_assisted_now"
  | "historical_correction"
  | "approved_regularization";

export interface AttendanceCommandPrincipal {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId: UUID;
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
    subjectEmployeeUserId?: UUID;
    commandKind?: Exclude<AttendanceCommandKind, "historical_correction" | "approved_regularization">;
    timeZone: string;
    idempotencyKey: string;
    command: AttendanceCommandInput;
    isWorkingDayFor: (workDate: string) => boolean;
  }): Promise<Record<string, unknown>> {
    const pool = this.store.pgPool;
    if (!pool)
      throw new Error(
        "PostgreSQL attendance commands require a configured pgPool.",
      );
    const subjectEmployeeUserId = input.subjectEmployeeUserId ?? input.actor.id;
    const commandKind = input.commandKind ?? "employee_manual_now";
    const requestHash = canonicalAttendanceRequestHash({
      company_id: input.companyId,
      actor_user_id: input.actor.id,
      subject_employee_user_id: subjectEmployeeUserId,
      command_kind: commandKind,
      event_type: input.command.event_type,
      work_mode: input.command.work_mode,
      source: input.command.source,
      metadata: input.command.metadata,
    });
    const scope = `${ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX}:${commandKind}:${input.companyId}`;
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
            return this.replayCompletedCommand(
              tx,
              platformKey,
              requestHash,
              input.companyId,
            );
          }
          const occurredAt = await tx.getTransactionTimestamp();
          const policy = await resolveEffectiveAttendancePolicy(tx, {
            companyId: input.companyId,
            subjectEmployeeUserId,
            asOf: occurredAt,
          });
          const workDate = dateInTimeZone(occurredAt, input.timeZone);
          const command = await tx.createCommandExecution({
            companyId: input.companyId,
            actorUserId: input.actor.id,
            employeeUserId: subjectEmployeeUserId,
            platformIdempotencyKeyId: platformKey.id,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            commandType: input.command.event_type,
            commandOrigin: commandKind,
            occurredAt,
            requestSnapshot: {
              work_date: workDate,
              work_mode: input.command.work_mode,
              source: input.command.source,
              metadata: input.command.metadata,
            },
          });
          const evidencePayload = {
            schema_version: 1,
            command_type: input.command.event_type,
            work_mode: input.command.work_mode,
            source_channel: input.command.source,
          };
          const evidencePayloadHash = canonicalJsonHash(evidencePayload);
          const evidence = await tx.createAttendanceEvidenceEvent({
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            actorUserId: input.actor.id,
            commandExecutionId: command.id,
            eventType: input.command.event_type,
            source: input.command.source,
            occurredAt,
            receivedAt: occurredAt,
            payload: evidencePayload,
            payloadHash: evidencePayloadHash,
          });
          let state = await tx.ensureAndLockEmployeeState(
            input.companyId,
            subjectEmployeeUserId,
          );
          const open = await tx.findOpenSessionForUpdate(
            input.companyId,
            subjectEmployeeUserId,
          );
          const activeBreak = open
            ? await tx.findActiveBreakForUpdate(input.companyId, open.id)
            : null;
          const completed = open
            ? null
            : await tx.findCompletedSessionForWorkDateForUpdate(
                input.companyId,
                subjectEmployeeUserId,
                workDate,
              );
          const derived = deriveAttendanceRuntimeState(open, activeBreak, completed);
          const priorCompletedSession =
            state.state === "completed" && state.current_session_id
              ? await tx.findSessionForUpdate({
                  companyId: input.companyId,
                  employeeUserId: subjectEmployeeUserId,
                  sessionId: state.current_session_id,
                })
              : null;
          if (
            // Sprint 10 persisted NOT_STARTED after checkout. A current-cycle
            // completed session is authoritative during the rollout to the
            // COMPLETED runtime state, so repair that known legacy shape.
            state.state === "not_checked_in" &&
            state.current_session_id === null &&
            completed
          ) {
            state = await tx.updateEmployeeState({
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              state: derived.state,
              currentSessionId: derived.sessionId,
            });
          } else if (
            state.state === "completed" &&
            !completed &&
            !open &&
            priorCompletedSession?.closed_at &&
            priorCompletedSession.work_date !== workDate
          ) {
            // A completed runtime row from an earlier attendance cycle is
            // intentionally reloaded to NOT_STARTED for this cycle.
            state = await tx.updateEmployeeState({
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              state: derived.state,
              currentSessionId: derived.sessionId,
            });
          } else if (
            state.state !== derived.state ||
            state.current_session_id !== derived.sessionId
          ) {
            throw conflict(
              "Attendance session state is inconsistent; retry the command.",
            );
          }
          const stateDecision = decideAttendanceTransition(
            state.state,
            input.command.event_type,
          );
          const policyReason = policyBlocked(
            input.command.event_type,
            occurredAt,
            input.timeZone,
            policy,
            input.isWorkingDayFor(workDate),
            state.state,
          );
          const denied =
            !stateDecision.allowed ||
            Boolean(policyReason) ||
            Boolean(
              open?.last_transition_at &&
                Date.parse(occurredAt) < Date.parse(open.last_transition_at),
            );
          const reason = !stateDecision.allowed
            ? (stateDecision.reason_detail ?? "Attendance command was denied.")
            : (policyReason ??
              "Attendance timestamp precedes the previous session transition.");
          const code = !stateDecision.allowed
            ? (stateDecision.reason_code ?? "invalid_state_transition")
            : policyReason
              ? "policy_window_rejected"
              : "invalid_chronology";
          const auditDecision = await tx.createAttendanceAuditDecision({
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            attendanceEventId: evidence.id,
            commandExecutionId: command.id,
            decisionType: "manual_attendance",
            outcome: denied ? "failed" : "passed",
            policyKey: "attendance",
            policyVersion: policy.policyVersion,
            evaluatedAt: occurredAt,
            evidenceDigest: evidencePayloadHash,
            policySnapshot: policy,
            evaluationContext: {
              company_id: input.companyId,
              actor_user_id: input.actor.id,
              subject_employee_user_id: subjectEmployeeUserId,
              command_origin: commandKind,
              command_type: input.command.event_type,
              previous_state: state.state,
              open_session_id: open?.id ?? null,
              occurred_at: occurredAt,
              work_date: workDate,
            },
          });
          if (denied) {
            await tx.createAttendanceDecisionReason({
              attendanceDecisionId: auditDecision.id,
              companyId: input.companyId,
              reasonCode: code,
              category: policyReason ? "policy" : "state",
              severity: "error",
              ordinal: 0,
              details: { reason_detail: reason },
            });
            const previous = state.state;
            const decision = await tx.createDecision({
              commandExecutionId: command.id,
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              outcome: "denied",
              reasonCode: code as never,
              reasonDetail: reason,
              previousState: previous,
              nextState: previous,
              policySnapshot: policy,
              evidenceSnapshot: {
                state,
                company_id: input.companyId,
                actor_user_id: input.actor.id,
                subject_employee_user_id: subjectEmployeeUserId,
                command_origin: commandKind,
                attendance_event_id: evidence.id,
                evidence_payload_hash: evidencePayloadHash,
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
              punch_policy: policy,
            };
            await tx.completeCommand({
              commandExecutionId: command.id,
              companyId: input.companyId,
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
          const decision = await tx.createDecision({
            commandExecutionId: command.id,
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            outcome: "allowed",
            reasonCode: null,
            reasonDetail: null,
            previousState: stateDecision.previous_state,
            nextState: stateDecision.next_state,
            policySnapshot: policy,
            evidenceSnapshot: {
              state,
              company_id: input.companyId,
              actor_user_id: input.actor.id,
              subject_employee_user_id: subjectEmployeeUserId,
              command_origin: commandKind,
              attendance_event_id: evidence.id,
              evidence_payload_hash: evidencePayloadHash,
              open_session_id: open?.id ?? null,
              occurred_at: occurredAt,
            },
          });
          let session: AttendanceSessionRecord;
          try {
            session = await this.transition(
              tx,
              input.companyId,
              subjectEmployeeUserId,
              workDate,
              occurredAt,
              input.command,
              open,
              stateDecision.action,
            );
          } catch (error) {
            const mapped = attendanceTransitionConflict(error);
            if (mapped) throw mapped;
            throw error;
          }
          await tx.updateEmployeeState({
            companyId: input.companyId,
            employeeUserId: subjectEmployeeUserId,
            state: stateDecision.next_state,
            currentSessionId:
              stateDecision.next_state === "not_checked_in" ? null : session.id,
          });
          const punch = (
            await tx.insertPunchEvent({
              companyId: input.companyId,
              employeeUserId: subjectEmployeeUserId,
              actorUserId: input.actor.id,
              eventType: input.command.event_type,
              occurredAt,
              workMode: input.command.work_mode,
              source: input.command.source,
              origin: commandKind,
              metadata: input.command.metadata,
              commandExecutionId: command.id,
              sessionId: session.id,
              decisionId: decision.id,
            })
          ).rows[0]!;
          const day = await projectDay(
            tx,
            input.companyId,
            subjectEmployeeUserId,
            session.work_date,
            input.command.work_mode,
            policy.graceMinutes,
            input.timeZone,
            occurredAt,
          );
          await tx.insertOutboxEvent(
            buildPunchRecordedEvent({
              companyId: input.companyId,
              actorUserId: input.actor.id,
              subjectEmployeeUserId,
              commandId: command.id,
              decisionId: decision.id,
              sessionId: session.id,
              punchEventId: punch.id,
              punchType: input.command.event_type,
              occurredAt,
              workDate: session.work_date,
              workMode: input.command.work_mode,
              sourceChannel: input.command.source,
              origin: commandKind,
              dayStatus:
                typeof (day as { status?: unknown }).status === "string"
                  ? (day as { status: string }).status
                  : null,
            }),
          );
          const response = {
            allowed: true,
            command_id: command.id,
            decision_id: decision.id,
            session_id: session.id,
            punch_id: punch.id,
            punch: {
              id: punch.id,
              company_id: input.companyId,
              employee_user_id: subjectEmployeeUserId,
              actor_user_id: input.actor.id,
              origin: commandKind,
              ...input.command,
              occurred_at: occurredAt,
              created_at: punch.created_at,
              deleted_at: null,
            },
            day_status: day,
            next_allowed_actions: allowedActions(stateDecision.next_state),
            next_allowed_action:
              allowedActions(stateDecision.next_state)[0] ?? null,
            punch_policy: policy,
          };
          await tx.completeCommand({
            commandExecutionId: command.id,
            companyId: input.companyId,
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

  async executeHistoricalCorrection(input: {
    actor: AuthUser;
    principal: AttendanceCommandPrincipal;
    idempotencyKey: string;
    timeZone: string;
    commandKind: Extract<AttendanceCommandKind, "historical_correction" | "approved_regularization">;
    command: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    };
  }, existingTransaction?: AttendanceCommandTransactionRepository): Promise<Record<string, unknown>> {
    const pool = this.store.pgPool;
    if (!pool && !existingTransaction) throw new Error("PostgreSQL attendance commands require a configured pgPool.");
    const { principal } = input;
    const requestHash = canonicalAttendanceRequestHash({
      company_id: principal.companyId,
      actor_user_id: principal.actorUserId,
      subject_employee_user_id: principal.subjectEmployeeUserId,
      command_kind: input.commandKind,
      ...input.command,
    });
    const scope = `${ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX}:${input.commandKind}:${principal.companyId}`;
    const run = async (tx: AttendanceCommandTransactionRepository): Promise<AttendanceCommandOutcome> => {
      const platformKey = await this.acquirePlatformIdempotencyKey(tx, {
        scope,
        actorUserId: principal.actorUserId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      });
      if (platformKey.status === "completed") {
        return this.replayCompletedCommand(tx, platformKey, requestHash, principal.companyId);
      }
      const receivedAt = await tx.getTransactionTimestamp();
      if (Date.parse(input.command.occurred_at) >= Date.parse(receivedAt)) {
        throw badRequest("Historical correction occurrence time must be in the past.");
      }
      const policy = await resolveEffectiveAttendancePolicy(tx, {
        companyId: principal.companyId,
        subjectEmployeeUserId: principal.subjectEmployeeUserId,
        asOf: input.command.occurred_at,
      });
      const workDate = dateInTimeZone(input.command.occurred_at, input.timeZone);
      const command = await tx.createCommandExecution({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        employeeUserId: principal.subjectEmployeeUserId,
        platformIdempotencyKeyId: platformKey.id,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        commandType: input.command.event_type,
        commandOrigin: input.commandKind,
        occurredAt: input.command.occurred_at,
        requestSnapshot: {
          work_date: workDate,
          reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
          work_mode: input.command.work_mode,
          metadata: input.command.metadata,
        },
      });
      const evidencePayload = {
        schema_version: 1,
        command_kind: input.commandKind,
        reason: input.command.reason,
        linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
      };
      const evidenceDigest = canonicalAttendanceRequestHash(evidencePayload);
      const evidence = await tx.createAttendanceEvidenceEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        commandExecutionId: command.id,
        eventType: input.command.event_type,
        source: "admin",
        occurredAt: input.command.occurred_at,
        receivedAt,
        payload: evidencePayload,
        payloadHash: evidenceDigest,
      });
      const auditDecision = await tx.createAttendanceAuditDecision({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        attendanceEventId: evidence.id,
        commandExecutionId: command.id,
        decisionType: input.commandKind,
        outcome: "passed",
        policyKey: "attendance",
        policyVersion: policy.policyVersion,
        evaluatedAt: receivedAt,
        evidenceDigest,
        policySnapshot: policy,
        evaluationContext: {
          company_id: principal.companyId,
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          command_origin: input.commandKind,
          occurred_at: input.command.occurred_at,
          work_date: workDate,
        },
      });
      const decision = await tx.createDecision({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        outcome: "allowed",
        reasonCode: null,
        reasonDetail: null,
        previousState: "not_checked_in",
        nextState: "not_checked_in",
        policySnapshot: policy,
        evidenceSnapshot: {
          attendance_event_id: evidence.id,
          audit_decision_id: auditDecision.id,
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          command_origin: input.commandKind,
          reason: input.command.reason,
        },
      });
      const punch = (await tx.insertPunchEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        eventType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workMode: input.command.work_mode,
        source: "admin",
        origin: input.commandKind,
        regularizationRequestId: input.command.linked_regularization_request_id ?? null,
        metadata: {
          ...input.command.metadata,
          correction_reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
        },
        commandExecutionId: command.id,
        decisionId: decision.id,
      })).rows[0]!;
      const day = await projectHistoricalCorrectionDay(
        tx,
        principal.companyId,
        principal.subjectEmployeeUserId,
        workDate,
        input.command.work_mode,
        input.timeZone,
      );
      await tx.insertOutboxEvent(buildPunchRecordedEvent({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        subjectEmployeeUserId: principal.subjectEmployeeUserId,
        commandId: command.id,
        decisionId: decision.id,
        punchEventId: punch.id,
        punchType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workDate,
        workMode: input.command.work_mode,
        sourceChannel: "admin",
        origin: input.commandKind,
        dayStatus: typeof day.status === "string" ? day.status : null,
      }));
      const response = {
        allowed: true,
        command_id: command.id,
        decision_id: decision.id,
        punch_id: punch.id,
        punch: {
          id: punch.id,
          company_id: principal.companyId,
          employee_user_id: principal.subjectEmployeeUserId,
          actor_user_id: principal.actorUserId,
          event_type: input.command.event_type,
          occurred_at: input.command.occurred_at,
          work_mode: input.command.work_mode,
          source: "admin",
          origin: input.commandKind,
        },
        day_status: day,
      };
      await tx.completeCommand({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        status: "completed",
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
    };
    const result = existingTransaction
      ? await run(existingTransaction)
      : await new PostgresAttendanceCommandRepository(pool!).transaction(run);
    return result.response;
  }

  async decideRegularization(input: {
    actor: AuthUser;
    companyId: UUID;
    regularizationRequestId: UUID;
    employeeUserId: UUID;
    workDate: string;
    expectedVersion: number;
    reason: string;
    requestedPunches: Array<{ event_type: AttendancePunchEventType; occurred_at: string }>;
    remarks: string | null;
    decision: "approve" | "reject" | "return";
    timeZone: string;
    authorize: () => void;
  }): Promise<{ version: number; decidedAt: string; day: Record<string, unknown> }> {
    const pool = this.store.pgPool;
    if (!pool) throw new Error("PostgreSQL attendance commands require a configured pgPool.");
    return new PostgresAttendanceCommandRepository(pool).transaction(async (tx) => {
      const locked = (await tx.query<{
        company_id: UUID; employee_user_id: UUID; status: string; version: number;
      }>(`SELECT company_id, employee_user_id, status, version
          FROM attendance.regularization_requests
          WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [input.regularizationRequestId, input.companyId])).rows[0];
      if (!locked || locked.employee_user_id !== input.employeeUserId) {
        throw conflict("Attendance regularization request was modified by another actor.");
      }
      if (locked.status !== "pending" || locked.version !== input.expectedVersion) {
        throw conflict("Only the expected pending attendance regularization request can be decided.");
      }
      input.authorize();
      const updated = (await tx.query<{ version: number; decided_at: Date }>(
        `UPDATE attendance.regularization_requests
         SET status = $6, current_approver_user_id = NULL,
             decision_remarks = $3, decided_by_user_id = $4, decided_at = now(),
             version = version + 1, updated_at = now()
         WHERE id = $1 AND company_id = $2 AND version = $5
         RETURNING version, decided_at`,
        [input.regularizationRequestId, input.companyId, input.remarks, input.actor.id, input.expectedVersion, input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "returned"],
      )).rows[0];
      if (!updated) throw conflict("Attendance regularization request was modified by another actor.");
      for (const [ordinal, requested] of input.decision === "approve" ? input.requestedPunches.entries() : []) {
        if (requested.event_type !== "check_in" && requested.event_type !== "check_out") {
          throw badRequest("Approved regularizations may materialize only check-in and check-out facts.");
        }
        if (dateInTimeZone(requested.occurred_at, input.timeZone) !== input.workDate) {
          throw badRequest("Requested punch timestamps must fall on the regularization work_date.");
        }
        const idempotencyKey = `attendance.regularization.materialize:${canonicalAttendanceRequestHash({
          company_id: input.companyId,
          regularization_request_id: input.regularizationRequestId,
          approval_version: input.expectedVersion,
          subject_employee_user_id: input.employeeUserId,
          ordinal,
          event_type: requested.event_type,
          occurred_at: requested.occurred_at,
        })}`;
        await this.executeHistoricalCorrection({
          actor: input.actor,
          principal: { companyId: input.companyId, actorUserId: input.actor.id, subjectEmployeeUserId: input.employeeUserId },
          idempotencyKey,
          timeZone: input.timeZone,
          commandKind: "approved_regularization",
          command: {
            event_type: requested.event_type,
            occurred_at: requested.occurred_at,
            reason: input.reason,
            work_mode: "office",
            metadata: { decided_by_user_id: input.actor.id },
            linked_regularization_request_id: input.regularizationRequestId,
          },
        }, tx);
      }
      const day = input.decision === "approve"
        ? await projectHistoricalCorrectionDay(tx, input.companyId, input.employeeUserId, input.workDate, "office", input.timeZone)
        : ((await tx.query<Record<string, unknown>>(
            `SELECT * FROM attendance.daily_records
             WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date`,
            [input.companyId, input.employeeUserId, input.workDate],
          )).rows[0] ?? {});
      await tx.insertOutboxEvent(buildRegularizationDecisionEvent({
        companyId: input.companyId,
        actorUserId: input.actor.id,
        subjectEmployeeUserId: input.employeeUserId,
        regularizationRequestId: input.regularizationRequestId,
        workDate: input.workDate,
        decision: input.decision,
        previousStatus: "pending",
        nextStatus: input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "returned",
        version: updated.version,
        decidedAt: updated.decided_at.toISOString(),
      }));
      return { version: updated.version, decidedAt: updated.decided_at.toISOString(), day };
    });
  }

  /* Legacy method body retained below for replacement by the transaction-aware implementation. */
  private async executeHistoricalCorrectionLegacy(input: {
    actor: AuthUser;
    principal: AttendanceCommandPrincipal;
    idempotencyKey: string;
    timeZone: string;
    commandKind: Extract<AttendanceCommandKind, "historical_correction" | "approved_regularization">;
    command: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    };
    policy: { graceMinutes: number; policyVersion: string };
  }): Promise<Record<string, unknown>> {
    const pool = this.store.pgPool;
    if (!pool) throw new Error("PostgreSQL attendance commands require a configured pgPool.");
    const { principal } = input;
    const requestHash = canonicalAttendanceRequestHash({
      company_id: principal.companyId,
      actor_user_id: principal.actorUserId,
      subject_employee_user_id: principal.subjectEmployeeUserId,
      command_kind: input.commandKind,
      ...input.command,
    });
    const scope = `${ATTENDANCE_IDEMPOTENCY_SCOPE_PREFIX}:${input.commandKind}:${principal.companyId}`;
    const repository = new PostgresAttendanceCommandRepository(pool);
    const result = await repository.transaction<AttendanceCommandOutcome>(async (tx) => {
      const platformKey = await this.acquirePlatformIdempotencyKey(tx, {
        scope,
        actorUserId: principal.actorUserId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      });
      if (platformKey.status === "completed") {
        return this.replayCompletedCommand(tx, platformKey, requestHash, principal.companyId);
      }
      const receivedAt = await tx.getTransactionTimestamp();
      if (Date.parse(input.command.occurred_at) >= Date.parse(receivedAt)) {
        throw badRequest("Historical correction occurrence time must be in the past.");
      }
      const workDate = dateInTimeZone(input.command.occurred_at, input.timeZone);
      const command = await tx.createCommandExecution({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        employeeUserId: principal.subjectEmployeeUserId,
        platformIdempotencyKeyId: platformKey.id,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        commandType: input.command.event_type,
        commandOrigin: input.commandKind,
        occurredAt: input.command.occurred_at,
        requestSnapshot: {
          work_date: workDate,
          reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
          work_mode: input.command.work_mode,
          metadata: input.command.metadata,
        },
      });
      const evidencePayload = {
        schema_version: 1,
        command_kind: input.commandKind,
        reason: input.command.reason,
        linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
      };
      const evidenceDigest = canonicalAttendanceRequestHash(evidencePayload);
      const evidence = await tx.createAttendanceEvidenceEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        commandExecutionId: command.id,
        eventType: input.command.event_type,
        source: "admin",
        occurredAt: input.command.occurred_at,
        receivedAt,
        payload: evidencePayload,
        payloadHash: evidenceDigest,
      });
      const auditDecision = await tx.createAttendanceAuditDecision({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        attendanceEventId: evidence.id,
        commandExecutionId: command.id,
        decisionType: input.commandKind,
        outcome: "passed",
        policyKey: "attendance",
        policyVersion: input.policy.policyVersion,
        evaluatedAt: receivedAt,
        evidenceDigest,
        policySnapshot: input.policy,
        evaluationContext: {
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          occurred_at: input.command.occurred_at,
          work_date: workDate,
        },
      });
      const decision = await tx.createDecision({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        outcome: "allowed",
        reasonCode: null,
        reasonDetail: null,
        previousState: "not_checked_in",
        nextState: "not_checked_in",
        policySnapshot: input.policy,
        evidenceSnapshot: {
          attendance_event_id: evidence.id,
          audit_decision_id: auditDecision.id,
          actor_user_id: principal.actorUserId,
          subject_employee_user_id: principal.subjectEmployeeUserId,
          reason: input.command.reason,
        },
      });
      const punch = (await tx.insertPunchEvent({
        companyId: principal.companyId,
        employeeUserId: principal.subjectEmployeeUserId,
        actorUserId: principal.actorUserId,
        eventType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workMode: input.command.work_mode,
        source: "admin",
        origin: input.commandKind,
        regularizationRequestId: input.command.linked_regularization_request_id ?? null,
        metadata: {
          ...input.command.metadata,
          correction_reason: input.command.reason,
          linked_regularization_request_id: input.command.linked_regularization_request_id ?? null,
        },
        commandExecutionId: command.id,
        decisionId: decision.id,
      })).rows[0]!;
      const day = await projectHistoricalCorrectionDay(
        tx,
        principal.companyId,
        principal.subjectEmployeeUserId,
        workDate,
        input.command.work_mode,
        input.timeZone,
      );
      await tx.insertOutboxEvent(buildPunchRecordedEvent({
        companyId: principal.companyId,
        actorUserId: principal.actorUserId,
        subjectEmployeeUserId: principal.subjectEmployeeUserId,
        commandId: command.id,
        decisionId: decision.id,
        punchEventId: punch.id,
        punchType: input.command.event_type,
        occurredAt: input.command.occurred_at,
        workDate,
        workMode: input.command.work_mode,
        sourceChannel: "admin",
        origin: input.commandKind,
        dayStatus: typeof day.status === "string" ? day.status : null,
      }));
      const response = {
        allowed: true,
        command_id: command.id,
        decision_id: decision.id,
        punch_id: punch.id,
        punch: {
          id: punch.id,
          company_id: principal.companyId,
          employee_user_id: principal.subjectEmployeeUserId,
          actor_user_id: principal.actorUserId,
          event_type: input.command.event_type,
          occurred_at: input.command.occurred_at,
          work_mode: input.command.work_mode,
          source: "admin",
          origin: input.commandKind,
        },
        day_status: day,
      };
      await tx.completeCommand({
        commandExecutionId: command.id,
        companyId: principal.companyId,
        status: "completed",
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
    });
    return result.response;
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
    companyId: UUID,
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
    const command = await tx.findCommandExecutionById(
      key.resource_id,
      companyId,
    );
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

type PostgresConstraintError = {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
};

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

export function attendanceTransitionConflict(error: unknown) {
  if (isAttendanceSessionSingleOpenViolation(error)) {
    return conflict("The employee already has an open attendance session.", {
      reason_code: "already_checked_in",
    });
  }
  if (!isPostgresConstraintError(error)) return null;

  const constraint = typeof error.constraint === "string" ? error.constraint : "";
  const message = typeof error.message === "string" ? error.message : "";
  if (constraint === "attendance_break_segments_single_active_idx") {
    return conflict("An attendance break is already open.", {
      reason_code: "break_already_started",
    });
  }
  if (constraint === "attendance_break_segments_session_company_fk") {
    return conflict("Attendance break session ownership is invalid.", {
      reason_code: "session_ownership_invalid",
    });
  }
  if (message.includes("attendance break segment requires an open session")) {
    return conflict("An attendance session must be open before starting a break.", {
      reason_code: "no_open_session",
    });
  }
  if (message.includes("completed attendance session cannot retain an active break")) {
    return conflict("The open attendance break must be ended before checking out.", {
      reason_code: "open_break_must_end",
    });
  }
  return null;
}

function isPostgresConstraintError(
  error: unknown,
): error is PostgresConstraintError {
  return typeof error === "object" && error !== null && "code" in error;
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
      : state === "on_break"
        ? [AttendancePunchEventTypes.BreakEnd]
        : [];
}

function deriveAttendanceRuntimeState(
  open: AttendanceSessionRecord | null,
  activeBreak: { session_id: UUID } | null,
  completed: AttendanceSessionRecord | null,
): {
  state: "not_checked_in" | "working" | "on_break" | "completed";
  sessionId: UUID | null;
} {
  if (open) {
    return activeBreak
      ? { state: "on_break", sessionId: open.id }
      : { state: "working", sessionId: open.id };
  }
  if (completed) return { state: "completed", sessionId: completed.id };
  return { state: "not_checked_in", sessionId: null };
}
type CommandPolicy = Pick<
  EffectiveAttendancePolicy,
  | "fullDayPunchWindow"
  | "punchInStart"
  | "punchInEnd"
  | "punchOutStart"
  | "punchOutEnd"
  | "allowOffDayPunches"
  | "graceMinutes"
>;
type PunchProjectionRow = {
  session_id: UUID;
  checked_in_at: Date;
  closed_at: Date | null;
  event_type: AttendancePunchEventType | null;
  occurred_at: Date | null;
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
  _timeZone: string,
  asOf: string,
): Promise<Record<string, unknown>> {
  const asOfDate = new Date(asOf);
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error("Attendance projection received an invalid asOf timestamp.");
  }
  const sessionPunches = (
    await tx.query<PunchProjectionRow>(
      `SELECT s.id AS session_id, s.checked_in_at, s.closed_at,
          p.event_type, p.occurred_at
        FROM attendance.sessions s
        LEFT JOIN attendance.punch_events p
          ON p.session_id = s.id
          AND p.company_id = s.company_id
          AND p.employee_user_id = s.employee_user_id
          AND p.deleted_at IS NULL
        WHERE s.company_id = $1
          AND s.employee_user_id = $2
          AND s.work_date = $3::date
          AND s.deleted_at IS NULL
        ORDER BY s.checked_in_at, p.occurred_at, p.id`,
      [companyId, employeeId, workDate],
    )
  ).rows;
  const sessions = new Map<
    UUID,
    {
      checkedInAt: Date;
      closedAt: Date | null;
      punches: PunchProjectionRow[];
    }
  >();
  for (const row of sessionPunches) {
    const session = sessions.get(row.session_id) ?? {
      checkedInAt: row.checked_in_at,
      closedAt: row.closed_at,
      punches: [],
    };
    if (row.event_type && row.occurred_at) session.punches.push(row);
    sessions.set(row.session_id, session);
  }
  const orderedSessions = [...sessions.values()].sort(
    (a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime(),
  );
  const checkIn = orderedSessions[0]?.checkedInAt.toISOString() ?? null;
  const checkOut =
    orderedSessions
      .map((session) => session.closedAt)
      .filter((value): value is Date => value !== null)
      .at(-1)
      ?.toISOString() ?? null;
  let breaks = 0;
  let work = 0;
  for (const session of orderedSessions) {
    let breakStart: Date | null = null;
    for (const punch of session.punches) {
      if (punch.event_type === "break_start" && punch.occurred_at) {
        breakStart = punch.occurred_at;
      } else if (
        punch.event_type === "break_end" &&
        punch.occurred_at &&
        breakStart
      ) {
        breaks += Math.max(
          0,
          Math.round(
            (punch.occurred_at.getTime() - breakStart.getTime()) / 60000,
          ),
        );
        breakStart = null;
      }
    }
    const sessionEnd = session.closedAt ?? asOfDate;
    work += Math.max(
      0,
      Math.round(
        (sessionEnd.getTime() - session.checkedInAt.getTime()) / 60000,
      ),
    );
  }
  work = Math.max(0, work - breaks);
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

async function projectHistoricalCorrectionDay(
  tx: AttendanceCommandTransactionRepository,
  companyId: UUID,
  employeeUserId: UUID,
  workDate: string,
  workMode: string,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const facts = (await tx.query<{
    first_check_in: Date | null;
    last_check_out: Date | null;
  }>(
    `SELECT
       min(occurred_at) FILTER (WHERE event_type = 'check_in') AS first_check_in,
       max(occurred_at) FILTER (WHERE event_type = 'check_out') AS last_check_out
     FROM attendance.punch_events
     WHERE company_id = $1
       AND employee_user_id = $2
       AND deleted_at IS NULL
       AND (occurred_at AT TIME ZONE $3)::date = $4::date`,
    [companyId, employeeUserId, timeZone, workDate],
  )).rows[0];
  const firstCheckIn = facts?.first_check_in?.toISOString() ?? null;
  const lastCheckOut = facts?.last_check_out?.toISOString() ?? null;
  const workMinutes = firstCheckIn && lastCheckOut
    ? Math.max(0, Math.round((Date.parse(lastCheckOut) - Date.parse(firstCheckIn)) / 60_000))
    : 0;
  return (await tx.query<Record<string, unknown>>(
    `INSERT INTO attendance.daily_records (
       company_id, employee_user_id, work_date, status, first_check_in,
       last_check_out, work_minutes, break_minutes, late_minutes,
       early_out_minutes, work_mode, note, exception_type,
       regularization_status, version, created_at, updated_at, deleted_at
     ) VALUES ($1,$2,$3,'present',$4,$5,$6,0,0,0,$7,'Historical correction',NULL,NULL,1,now(),now(),NULL)
     ON CONFLICT (company_id,employee_user_id,work_date) DO UPDATE SET
       status = EXCLUDED.status,
       first_check_in = EXCLUDED.first_check_in,
       last_check_out = EXCLUDED.last_check_out,
       work_minutes = EXCLUDED.work_minutes,
       work_mode = EXCLUDED.work_mode,
       note = EXCLUDED.note,
       version = attendance.daily_records.version + 1,
       updated_at = now()
     RETURNING *`,
    [companyId, employeeUserId, workDate, firstCheckIn, lastCheckOut, workMinutes, workMode],
  )).rows[0] ?? {};
}
