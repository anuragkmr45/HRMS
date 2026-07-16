import type { Pool, PoolClient } from "pg";
import type { AttendancePunchEventType, UUID } from "#shared";
import type { AttendanceOutboxEventContract } from "./events.js";
import type {
  AttendanceCommandState,
  AttendanceDecisionReasonCode,
} from "./session-transition.js";

export interface AttendanceEmployeeCommandStateRecord {
  company_id: UUID;
  employee_user_id: UUID;
  state: AttendanceCommandState;
  current_session_id: UUID | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type AttendanceCommandExecutionStatus =
  | "received"
  | "allowed"
  | "denied"
  | "completed";

export interface AttendanceCommandExecutionRecord {
  id: UUID;
  company_id: UUID;
  actor_user_id: UUID;
  employee_user_id: UUID;
  platform_idempotency_key_id: UUID | null;
  idempotency_key: string;
  request_hash: string;
  command_type: AttendancePunchEventType;
  occurred_at: string;
  status: AttendanceCommandExecutionStatus;
  session_id: UUID | null;
  punch_event_id: UUID | null;
  request_snapshot: Record<string, unknown>;
  response_snapshot: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string;
}

export type PlatformIdempotencyStatus = "processing" | "completed";

export interface PlatformIdempotencyKeyRecord {
  id: UUID;
  scope: string;
  idempotency_key: string;
  actor_user_id: UUID;
  request_hash: string;
  response_hash: string | null;
  status: PlatformIdempotencyStatus;
  resource_type: string | null;
  resource_id: UUID | null;
  response_status: number | null;
  created_at: Date;
  expires_at: Date;
  completed_at: Date | null;
  is_expired: boolean;
}

export interface ClaimPlatformIdempotencyKeyInput {
  scope: string;
  idempotencyKey: string;
  actorUserId: UUID;
  requestHash: string;
  expiresIn: string;
}

export interface AttendanceCommandDecisionRecord {
  id: UUID;
  command_execution_id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  outcome: "allowed" | "denied";
  reason_code: AttendanceDecisionReasonCode | null;
  reason_detail: string | null;
  previous_state: AttendanceCommandState;
  next_state: AttendanceCommandState;
  policy_snapshot: Record<string, unknown>;
  evidence_snapshot: Record<string, unknown>;
  created_at: string;
}

export interface CreateAttendanceCommandInput {
  companyId: UUID;
  actorUserId: UUID;
  employeeUserId: UUID;
  platformIdempotencyKeyId: UUID;
  idempotencyKey: string;
  requestHash: string;
  commandType: AttendancePunchEventType;
  occurredAt: string;
  requestSnapshot: Record<string, unknown>;
}

export interface CreateAttendanceDecisionInput {
  commandExecutionId: UUID;
  companyId: UUID;
  employeeUserId: UUID;
  outcome: "allowed" | "denied";
  reasonCode: AttendanceDecisionReasonCode | null;
  reasonDetail: string | null;
  previousState: AttendanceCommandState;
  nextState: AttendanceCommandState;
  policySnapshot: Record<string, unknown>;
  evidenceSnapshot: Record<string, unknown>;
}

export interface CompleteAttendanceCommandInput {
  commandExecutionId: UUID;
  status: "denied" | "completed";
  sessionId?: UUID | null;
  punchEventId?: UUID | null;
  responseSnapshot: Record<string, unknown>;
}

export type AttendanceSessionStatus = "working" | "on_break" | "closed";

export interface AttendanceSessionRecord {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  work_date: string;
  status: AttendanceSessionStatus;
  checked_in_at: string;
  closed_at: string | null;
  active_break_started_at: string | null;
  last_transition_at: string;
  work_mode: "office" | "remote" | "wfh" | "field";
  source: "web" | "mobile" | "kiosk" | "admin";
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateAttendanceSessionInput {
  companyId: UUID;
  employeeUserId: UUID;
  workDate: string;
  checkedInAt: string;
  workMode: AttendanceSessionRecord["work_mode"];
  source: AttendanceSessionRecord["source"];
  metadata: Record<string, unknown>;
}

export interface UpdateAttendanceEmployeeStateInput {
  companyId: UUID;
  employeeUserId: UUID;
  state: AttendanceCommandState;
  currentSessionId: UUID | null;
}

export class AttendanceCommandIdempotencyConflict extends Error {}

export class PostgresAttendanceCommandRepository {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(
    operation: (
      repository: AttendanceCommandTransactionRepository,
    ) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const repository = new AttendanceCommandTransactionRepository(client);

      const result = await operation(repository);

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

export class AttendanceCommandTransactionRepository {
  constructor(private readonly client: PoolClient) {}

  /** Escape hatch for the small projection/outbox statements owned by this
   * aggregate. It intentionally exposes only the transaction-scoped client. */
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) {
    return this.client.query<T>(text, values);
  }

  async findPlatformIdempotencyKeyForUpdate(input: {
    scope: string;
    actorUserId: UUID;
    idempotencyKey: string;
  }): Promise<PlatformIdempotencyKeyRecord | null> {
    const result = await this.client.query<PlatformIdempotencyKeyRecord>(
      `SELECT id, scope, idempotency_key, actor_user_id, request_hash,
          response_hash, status, resource_type, resource_id, response_status,
          created_at, expires_at, completed_at, expires_at <= now() AS is_expired
        FROM platform.idempotency_keys
        WHERE scope = $1 AND actor_user_id = $2 AND idempotency_key = $3
        FOR UPDATE`,
      [input.scope, input.actorUserId, input.idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async claimPlatformIdempotencyKey(
    input: ClaimPlatformIdempotencyKeyInput,
  ): Promise<PlatformIdempotencyKeyRecord | null> {
    const result = await this.client.query<PlatformIdempotencyKeyRecord>(
      `INSERT INTO platform.idempotency_keys (
          scope, idempotency_key, actor_user_id, request_hash, response_hash,
          status, resource_type, resource_id, response_status, created_at,
          expires_at, completed_at
        )
        VALUES ($1, $2, $3, $4, NULL, 'processing', NULL, NULL, NULL, now(), now() + $5::interval, NULL)
        ON CONFLICT (scope, idempotency_key, actor_user_id) DO NOTHING
        RETURNING id, scope, idempotency_key, actor_user_id, request_hash,
          response_hash, status, resource_type, resource_id, response_status,
          created_at, expires_at, completed_at, false AS is_expired`,
      [
        input.scope,
        input.idempotencyKey,
        input.actorUserId,
        input.requestHash,
        input.expiresIn,
      ],
    );
    return result.rows[0] ?? null;
  }

  async deleteExpiredPlatformIdempotencyKey(id: UUID): Promise<boolean> {
    const result = await this.client.query<{ id: UUID }>(
      `DELETE FROM platform.idempotency_keys
        WHERE id = $1 AND expires_at <= now()`,
      [id],
    );
    return result.rowCount === 1;
  }

  async completePlatformIdempotencyKey(input: {
    id: UUID;
    resourceType: string;
    resourceId: UUID;
    responseHash: string;
    responseStatus: number;
  }): Promise<PlatformIdempotencyKeyRecord> {
    const result = await this.client.query<PlatformIdempotencyKeyRecord>(
      `UPDATE platform.idempotency_keys
        SET status = 'completed', resource_type = $2, resource_id = $3,
            response_hash = $4, response_status = $5, completed_at = now()
        WHERE id = $1 AND status = 'processing'
        RETURNING id, scope, idempotency_key, actor_user_id, request_hash,
          response_hash, status, resource_type, resource_id, response_status,
          created_at, expires_at, completed_at, false AS is_expired`,
      [
        input.id,
        input.resourceType,
        input.resourceId,
        input.responseHash,
        input.responseStatus,
      ],
    );
    const key = result.rows[0];
    if (!key)
      throw new Error("Platform idempotency key could not be completed.");
    return key;
  }

  async findCommandExecutionById(
    commandExecutionId: UUID,
  ): Promise<AttendanceCommandExecutionRecord | null> {
    const result = await this.client.query<AttendanceCommandExecutionRecord>(
      `SELECT id, company_id, actor_user_id, employee_user_id, platform_idempotency_key_id, idempotency_key,
          request_hash, command_type, occurred_at, status, session_id,
          punch_event_id, request_snapshot, response_snapshot, completed_at, created_at
        FROM attendance.command_executions WHERE id = $1`,
      [commandExecutionId],
    );
    return result.rows[0] ?? null;
  }

  async ensureAndLockEmployeeState(
    companyId: UUID,
    employeeUserId: UUID,
  ): Promise<AttendanceEmployeeCommandStateRecord> {
    await this.client.query(
      `INSERT INTO attendance.employee_command_states (
        company_id,
        employee_user_id,
        state,
        current_session_id,
        version,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'not_checked_in', NULL, 1, now(), now())
      ON CONFLICT (company_id, employee_user_id)
      DO NOTHING`,
      [companyId, employeeUserId],
    );

    const result =
      await this.client.query<AttendanceEmployeeCommandStateRecord>(
        `SELECT
          company_id,
          employee_user_id,
          state,
          current_session_id,
          version,
          created_at,
          updated_at
        FROM attendance.employee_command_states
        WHERE company_id = $1
          AND employee_user_id = $2
        FOR UPDATE`,
        [companyId, employeeUserId],
      );

    const state = result.rows[0];

    if (!state) {
      throw new Error(
        "Unable to acquire employee attendance command state lock.",
      );
    }

    return state;
  }

  async findCommandByIdempotencyKey(input: {
    companyId: UUID;
    actorUserId: UUID;
    idempotencyKey: string;
  }): Promise<AttendanceCommandExecutionRecord | null> {
    const result = await this.client.query<AttendanceCommandExecutionRecord>(
      `SELECT
          id,
          company_id,
          actor_user_id,
          employee_user_id,
          platform_idempotency_key_id,
          idempotency_key,
          request_hash,
          command_type,
          occurred_at,
          status,
          session_id,
          punch_event_id,
          request_snapshot,
          response_snapshot,
          completed_at,
          created_at
        FROM attendance.command_executions
        WHERE company_id = $1
          AND actor_user_id = $2
          AND idempotency_key = $3`,
      [input.companyId, input.actorUserId, input.idempotencyKey],
    );

    return result.rows[0] ?? null;
  }

  async createCommandExecution(
    input: CreateAttendanceCommandInput,
  ): Promise<AttendanceCommandExecutionRecord> {
    const result = await this.client.query<AttendanceCommandExecutionRecord>(
      `INSERT INTO attendance.command_executions (
          company_id,
          actor_user_id,
          employee_user_id,
          platform_idempotency_key_id,
          idempotency_key,
          request_hash,
          command_type,
          occurred_at,
          status,
          session_id,
          punch_event_id,
          request_snapshot,
          response_snapshot,
          completed_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'received',
          NULL,
          NULL,
          $9::jsonb,
          NULL,
          NULL,
          now()
        )
        ON CONFLICT (platform_idempotency_key_id)
          WHERE platform_idempotency_key_id IS NOT NULL
          DO NOTHING
        RETURNING
          id,
          company_id,
          actor_user_id,
          employee_user_id,
          platform_idempotency_key_id,
          idempotency_key,
          request_hash,
          command_type,
          occurred_at,
          status,
          session_id,
          punch_event_id,
          request_snapshot,
          response_snapshot,
          completed_at,
          created_at`,
      [
        input.companyId,
        input.actorUserId,
        input.employeeUserId,
        input.platformIdempotencyKeyId,
        input.idempotencyKey,
        input.requestHash,
        input.commandType,
        input.occurredAt,
        JSON.stringify(input.requestSnapshot),
      ],
    );

    const command = result.rows[0];

    if (!command) {
      throw new AttendanceCommandIdempotencyConflict();
    }

    return command;
  }

  async createDecision(
    input: CreateAttendanceDecisionInput,
  ): Promise<AttendanceCommandDecisionRecord> {
    const result = await this.client.query<AttendanceCommandDecisionRecord>(
      `INSERT INTO attendance.command_decisions (
          command_execution_id,
          company_id,
          employee_user_id,
          outcome,
          reason_code,
          reason_detail,
          previous_state,
          next_state,
          policy_snapshot,
          evidence_snapshot,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::jsonb,
          $10::jsonb,
          now()
        )
        RETURNING
          id,
          command_execution_id,
          company_id,
          employee_user_id,
          outcome,
          reason_code,
          reason_detail,
          previous_state,
          next_state,
          policy_snapshot,
          evidence_snapshot,
          created_at`,
      [
        input.commandExecutionId,
        input.companyId,
        input.employeeUserId,
        input.outcome,
        input.reasonCode,
        input.reasonDetail,
        input.previousState,
        input.nextState,
        JSON.stringify(input.policySnapshot),
        JSON.stringify(input.evidenceSnapshot),
      ],
    );

    const decision = result.rows[0];

    if (!decision) {
      throw new Error("Attendance command decision was not created.");
    }

    return decision;
  }

  async completeCommand(
    input: CompleteAttendanceCommandInput,
  ): Promise<AttendanceCommandExecutionRecord> {
    const result = await this.client.query<AttendanceCommandExecutionRecord>(
      `UPDATE attendance.command_executions
        SET status = $2,
            session_id = $3,
            punch_event_id = $4,
            response_snapshot = $5::jsonb,
            completed_at = now()
        WHERE id = $1
        RETURNING
          id,
          company_id,
          actor_user_id,
          employee_user_id,
          idempotency_key,
          request_hash,
          command_type,
          occurred_at,
          status,
          session_id,
          punch_event_id,
          request_snapshot,
          response_snapshot,
          completed_at,
          created_at`,
      [
        input.commandExecutionId,
        input.status,
        input.sessionId ?? null,
        input.punchEventId ?? null,
        JSON.stringify(input.responseSnapshot),
      ],
    );

    const command = result.rows[0];

    if (!command) {
      throw new Error("Attendance command execution was not completed.");
    }

    return command;
  }

  async findOpenSessionForUpdate(
    companyId: UUID,
    employeeUserId: UUID,
  ): Promise<AttendanceSessionRecord | null> {
    const result = await this.client.query<AttendanceSessionRecord>(
      `SELECT
      id,
      company_id,
      employee_user_id,
      work_date,
      status,
      checked_in_at,
      closed_at,
      active_break_started_at,
      last_transition_at,
      work_mode,
      source,
      metadata,
      version,
      created_at,
      updated_at,
      deleted_at
    FROM attendance.sessions
    WHERE company_id = $1
      AND employee_user_id = $2
      AND closed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY checked_in_at DESC
    LIMIT 1
    FOR UPDATE`,
      [companyId, employeeUserId],
    );

    return result.rows[0] ?? null;
  }

  async createSession(
    input: CreateAttendanceSessionInput,
  ): Promise<AttendanceSessionRecord> {
    const result = await this.client.query<AttendanceSessionRecord>(
      `INSERT INTO attendance.sessions (
      company_id,
      employee_user_id,
      work_date,
      status,
      checked_in_at,
      closed_at,
      active_break_started_at,
      last_transition_at,
      work_mode,
      source,
      metadata,
      version,
      created_at,
      updated_at,
      deleted_at
    )
    VALUES (
      $1,
      $2,
      $3,
      'working',
      $4,
      NULL,
      NULL,
      $4,
      $5,
      $6,
      $7::jsonb,
      1,
      now(),
      now(),
      NULL
    )
    RETURNING
      id,
      company_id,
      employee_user_id,
      work_date,
      status,
      checked_in_at,
      closed_at,
      active_break_started_at,
      last_transition_at,
      work_mode,
      source,
      metadata,
      version,
      created_at,
      updated_at,
      deleted_at`,
      [
        input.companyId,
        input.employeeUserId,
        input.workDate,
        input.checkedInAt,
        input.workMode,
        input.source,
        JSON.stringify(input.metadata),
      ],
    );

    const session = result.rows[0];

    if (!session) {
      throw new Error("Attendance session was not created.");
    }

    return session;
  }

  async startBreak(input: {
    sessionId: UUID;
    companyId: UUID;
    employeeUserId: UUID;
    expectedVersion: number;
    occurredAt: string;
  }): Promise<AttendanceSessionRecord> {
    const result = await this.client.query<AttendanceSessionRecord>(
      `UPDATE attendance.sessions
    SET status = 'on_break',
        active_break_started_at = $5,
        last_transition_at = $5,
        version = version + 1,
        updated_at = now()
    WHERE id = $1 AND company_id = $2 AND employee_user_id = $3 AND version = $4
      AND status = 'working'
      AND closed_at IS NULL
      AND deleted_at IS NULL
      AND $5::timestamptz >= last_transition_at
    RETURNING
      id,
      company_id,
      employee_user_id,
      work_date,
      status,
      checked_in_at,
      closed_at,
      active_break_started_at,
      last_transition_at,
      work_mode,
      source,
      metadata,
      version,
      created_at,
      updated_at,
      deleted_at`,
      [
        input.sessionId,
        input.companyId,
        input.employeeUserId,
        input.expectedVersion,
        input.occurredAt,
      ],
    );

    const session = result.rows[0];

    if (!session) {
      throw new Error("Attendance session could not transition to on-break.");
    }

    return session;
  }

  async endBreak(input: {
    sessionId: UUID;
    companyId: UUID;
    employeeUserId: UUID;
    expectedVersion: number;
    occurredAt: string;
  }): Promise<AttendanceSessionRecord> {
    const result = await this.client.query<AttendanceSessionRecord>(
      `UPDATE attendance.sessions
    SET status = 'working',
        active_break_started_at = NULL,
        last_transition_at = $5,
        version = version + 1,
        updated_at = now()
    WHERE id = $1 AND company_id = $2 AND employee_user_id = $3 AND version = $4
      AND status = 'on_break'
      AND active_break_started_at IS NOT NULL
      AND closed_at IS NULL
      AND deleted_at IS NULL
      AND $5::timestamptz >= last_transition_at
    RETURNING
      id,
      company_id,
      employee_user_id,
      work_date,
      status,
      checked_in_at,
      closed_at,
      active_break_started_at,
      last_transition_at,
      work_mode,
      source,
      metadata,
      version,
      created_at,
      updated_at,
      deleted_at`,
      [
        input.sessionId,
        input.companyId,
        input.employeeUserId,
        input.expectedVersion,
        input.occurredAt,
      ],
    );

    const session = result.rows[0];

    if (!session) {
      throw new Error(
        "Attendance session could not transition from on-break to working.",
      );
    }

    return session;
  }

  async closeSession(input: {
    sessionId: UUID;
    companyId: UUID;
    employeeUserId: UUID;
    expectedVersion: number;
    occurredAt: string;
  }): Promise<AttendanceSessionRecord> {
    const result = await this.client.query<AttendanceSessionRecord>(
      `UPDATE attendance.sessions
    SET status = 'closed',
        closed_at = $5,
        active_break_started_at = NULL,
        last_transition_at = $5,
        version = version + 1,
        updated_at = now()
    WHERE id = $1 AND company_id = $2 AND employee_user_id = $3 AND version = $4
      AND status = 'working'
      AND closed_at IS NULL
      AND active_break_started_at IS NULL
      AND deleted_at IS NULL
      AND $5::timestamptz >= last_transition_at
    RETURNING
      id,
      company_id,
      employee_user_id,
      work_date,
      status,
      checked_in_at,
      closed_at,
      active_break_started_at,
      last_transition_at,
      work_mode,
      source,
      metadata,
      version,
      created_at,
      updated_at,
      deleted_at`,
      [
        input.sessionId,
        input.companyId,
        input.employeeUserId,
        input.expectedVersion,
        input.occurredAt,
      ],
    );

    const session = result.rows[0];

    if (!session) {
      throw new Error("Attendance session could not be closed.");
    }

    return session;
  }

  async updateEmployeeState(
    input: UpdateAttendanceEmployeeStateInput,
  ): Promise<AttendanceEmployeeCommandStateRecord> {
    const result =
      await this.client.query<AttendanceEmployeeCommandStateRecord>(
        `UPDATE attendance.employee_command_states
      SET state = $3,
          current_session_id = $4,
          version = version + 1,
          updated_at = now()
      WHERE company_id = $1
        AND employee_user_id = $2
      RETURNING
        company_id,
        employee_user_id,
        state,
        current_session_id,
        version,
        created_at,
        updated_at`,
        [
          input.companyId,
          input.employeeUserId,
          input.state,
          input.currentSessionId,
        ],
      );

    const state = result.rows[0];

    if (!state) {
      throw new Error("Employee attendance command state was not updated.");
    }

    return state;
  }

  async insertPunchEvent(input: {
    companyId: UUID;
    employeeUserId: UUID;
    eventType: AttendancePunchEventType;
    occurredAt: string;
    workMode: string;
    source: string;
    metadata: Record<string, unknown>;
    commandExecutionId: UUID;
    sessionId: UUID;
    decisionId: UUID;
  }) {
    return this.query<
      { id: UUID; created_at: string } & Record<string, unknown>
    >(
      `INSERT INTO attendance.punch_events (company_id, employee_user_id, event_type, occurred_at, work_mode, source, metadata, command_execution_id, session_id, decision_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING id, created_at`,
      [
        input.companyId,
        input.employeeUserId,
        input.eventType,
        input.occurredAt,
        input.workMode,
        input.source,
        JSON.stringify(input.metadata),
        input.commandExecutionId,
        input.sessionId,
        input.decisionId,
      ],
    );
  }

  async insertOutboxEvent(event: AttendanceOutboxEventContract) {
    return this.query(
      `INSERT INTO platform.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       VALUES ('attendance',$1,$2,$3::jsonb,$4)`,
      [
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.payload),
        event.idempotencyKey,
      ],
    );
  }
}
