import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import {
  AttendanceCommandService,
  canonicalAttendanceResponseHash,
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
      }),
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND company_id = $6"),
      [
        commandId,
        "completed",
        null,
        null,
        JSON.stringify({ allowed: true }),
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
});

function commandRecord(
  companyId: string,
  responseSnapshot: Record<string, unknown> | null = { allowed: true },
): AttendanceCommandExecutionRecord {
  return {
    id: commandId,
    company_id: companyId,
    actor_user_id: "55555555-5555-4555-8555-000000000001",
    employee_user_id: "55555555-5555-4555-8555-000000000001",
    platform_idempotency_key_id: platformKeyId,
    idempotency_key: "same-text-key",
    request_hash: "request-hash",
    command_type: "check_in",
    occurred_at: "2026-07-08T04:00:00.000Z",
    status: "completed",
    session_id: null,
    punch_event_id: null,
    request_snapshot: {},
    response_snapshot: responseSnapshot,
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
