import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import {
  AttendanceCommandService,
  canonicalAttendanceResponseHash,
  isAttendanceReplayResponse,
} from "../command-service.js";
import {
  PostgresAttendanceCommandRepository,
  type AttendanceCommandExecutionRecord,
  type PlatformIdempotencyKeyRecord,
} from "../command-repository.js";

const companyAId = "11111111-1111-4111-8111-000000000001";
const companyBId = "22222222-2222-4222-8222-000000000001";
const commandId = "33333333-3333-4333-8333-000000000001";
const platformKeyId = "44444444-4444-4444-8444-000000000001";

describe("PostgresAttendanceCommandRepository tenancy", () => {
  it("looks up a command only in the supplied company", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [commandRecord(companyAId)] });
    const repository = repositoryFor(query);

    const result = await repository.transaction((tx) =>
      tx.findCommandExecutionById(commandId, companyAId),
    );

    expect(result?.company_id).toBe(companyAId);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND company_id = $2"),
      [commandId, companyAId],
    );
  });

  it("does not return a command from another company", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = repositoryFor(query);

    await expect(
      repository.transaction((tx) =>
        tx.findCommandExecutionById(commandId, companyBId),
      ),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND company_id = $2"),
      [commandId, companyBId],
    );
  });

  it("completes only a command in the supplied company", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [commandRecord(companyAId)] });
    const repository = repositoryFor(query);

    await repository.transaction((tx) =>
      tx.completeCommand({
        commandExecutionId: commandId,
        companyId: companyAId,
        status: "completed",
        responseSnapshot: { allowed: true },
        responseHash: canonicalAttendanceResponseHash({ allowed: true }),
        responseStatus: 200,
      }),
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND company_id = $8"),
      [
        commandId,
        "completed",
        null,
        null,
        JSON.stringify({ allowed: true }),
        canonicalAttendanceResponseHash({ allowed: true }),
        200,
        companyAId,
      ],
    );
  });

  it("uses company-scoped command lookup when replaying an idempotency key", async () => {
    const response = { allowed: true, command_id: commandId };
    const command = commandRecord(companyAId, response);
    const findCommandExecutionById = vi.fn().mockResolvedValue(command);
    const service = new AttendanceCommandService(createMemoryDataStore());
    const replay = (
      service as unknown as {
        replayCompletedCommand: (
          tx: { findCommandExecutionById: typeof findCommandExecutionById },
          key: PlatformIdempotencyKeyRecord,
          requestHash: string,
          companyId: string,
        ) => Promise<unknown>;
      }
    ).replayCompletedCommand;

    await replay(
      { findCommandExecutionById },
      platformKey(response),
      command.request_hash,
      companyAId,
    );

    expect(findCommandExecutionById).toHaveBeenCalledWith(
      commandId,
      companyAId,
    );
  });

  it("looks up durable client events by company and actor", async () => {
    const command = commandRecord(companyAId);
    const query = vi.fn().mockResolvedValue({ rows: [command] });
    const repository = repositoryFor(query);

    const result = await repository.transaction((tx) =>
      tx.findCommandByClientEventIdForUpdate({
        companyId: companyAId,
        actorUserId: command.actor_user_id,
        clientEventId: command.client_event_id!,
      }),
    );

    expect(result?.id).toBe(commandId);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND client_event_id = $3"),
      [companyAId, command.actor_user_id, command.client_event_id],
    );
    const lookupSql = query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes("client_event_id = $3"));
    expect(lookupSql).toContain("FOR UPDATE");
  });

  it("replays a matching durable client event with replay metadata", () => {
    const response = { allowed: true, command_id: commandId };
    const command = commandRecord(companyAId, response, 202);
    const service = new AttendanceCommandService(createMemoryDataStore());
    const replay = (
      service as unknown as {
        replayCompletedCommandFromCommand: (
          command: AttendanceCommandExecutionRecord,
          requestHash: string,
        ) => { response: Record<string, unknown>; responseStatus: number; replayed?: boolean };
      }
    ).replayCompletedCommandFromCommand;

    const outcome = replay(command, command.request_hash);

    expect(outcome).toMatchObject({ response, responseStatus: 202, replayed: true });
    expect(isAttendanceReplayResponse(outcome.response)).toBe(false);
  });

  it("rejects corrupt durable replay metadata", () => {
    const service = new AttendanceCommandService(createMemoryDataStore());
    const replay = (
      service as unknown as {
        replayCompletedCommandFromCommand: (
          command: AttendanceCommandExecutionRecord,
          requestHash: string,
        ) => unknown;
      }
    ).replayCompletedCommandFromCommand;
    const command = {
      ...commandRecord(companyAId, { allowed: true }),
      response_hash: "b".repeat(64),
    };

    expect(() => replay(command, command.request_hash)).toThrow(
      "Durable attendance command replay response integrity check failed.",
    );
  });

  it("does not infer durable replay status from command status", () => {
    const response = { allowed: false, reason_detail: "Stored denial" };
    const command = commandRecord(companyAId, response, 418);
    const service = new AttendanceCommandService(createMemoryDataStore());
    const replay = (
      service as unknown as {
        replayCompletedCommandFromCommand: (
          command: AttendanceCommandExecutionRecord,
          requestHash: string,
        ) => { response: Record<string, unknown>; responseStatus: number; replayed?: boolean };
      }
    ).replayCompletedCommandFromCommand;

    const outcome = replay(command, command.request_hash);

    expect(outcome.responseStatus).toBe(418);
  });

  it("rejects a durable client event reused with a different canonical hash", () => {
    const service = new AttendanceCommandService(createMemoryDataStore());
    const replay = (
      service as unknown as {
        replayCompletedCommandFromCommand: (
          command: AttendanceCommandExecutionRecord,
          requestHash: string,
        ) => unknown;
      }
    ).replayCompletedCommandFromCommand;

    expect(() => replay(commandRecord(companyAId), "different-hash")).toThrow(
      "Client event was already used with a different attendance command.",
    );
  });
});

function commandRecord(
  companyId: string,
  responseSnapshot: Record<string, unknown> | null = { allowed: true },
  responseStatus = 200,
): AttendanceCommandExecutionRecord {
  return {
    id: commandId,
    company_id: companyId,
    actor_user_id: "55555555-5555-4555-8555-000000000001",
    employee_user_id: "55555555-5555-4555-8555-000000000001",
    platform_idempotency_key_id: platformKeyId,
    idempotency_key: "same-text-key",
    client_event_id: "66666666-6666-4666-8666-000000000001",
    request_hash: "request-hash",
    command_type: "check_in",
    command_origin: "employee_manual_now",
    occurred_at: "2026-07-08T04:00:00.000Z",
    status: "completed",
    session_id: null,
    punch_event_id: null,
    request_snapshot: {},
    response_snapshot: responseSnapshot,
    response_hash: responseSnapshot
      ? canonicalAttendanceResponseHash(responseSnapshot)
      : null,
    response_status: responseSnapshot ? responseStatus : null,
    completed_at: "2026-07-08T04:00:01.000Z",
    created_at: "2026-07-08T04:00:00.000Z",
  };
}

function platformKey(
  response: Record<string, unknown>,
): PlatformIdempotencyKeyRecord {
  return {
    id: platformKeyId,
    scope: `attendance.punch:${companyAId}`,
    idempotency_key: "same-text-key",
    actor_user_id: "55555555-5555-4555-8555-000000000001",
    request_hash: "request-hash",
    response_hash: canonicalAttendanceResponseHash(response),
    status: "completed",
    resource_type: "attendance.command_execution",
    resource_id: commandId,
    response_status: 200,
    created_at: new Date("2026-07-08T04:00:00.000Z"),
    expires_at: new Date("2026-07-09T04:00:00.000Z"),
    completed_at: new Date("2026-07-08T04:00:01.000Z"),
    is_expired: false,
  };
}

function repositoryFor(query: ReturnType<typeof vi.fn>) {
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return new PostgresAttendanceCommandRepository(pool);
}
