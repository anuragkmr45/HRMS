import { randomUUID } from "node:crypto";
import type { OutboxEvent } from "#shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryDataStore, type MemoryDataStore, nowIso } from "../../platform/data-store.js";
import { OutboxWorker } from "../outbox-worker.js";
import { logWorkerError } from "../safe-error.js";

const sensitiveCanaries = [
  "12.971599",
  "77.594566",
  "canary-bearer-token",
  "canary-cookie",
  "canary-secret",
  "raw_payload",
  "idem-key-canary",
  "fake-command-payload",
  "q7X2p91z",
];

describe("outbox worker safe error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits worker failure logs without raw driver error contents", () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = sensitiveDriverError();

    logWorkerError("outbox", "publish-cycle", error);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = String(logSpy.mock.calls[0]?.[0]);
    expect(output).toContain("\"worker\":\"outbox\"");
    expect(output).toContain("\"phase\":\"publish-cycle\"");
    expect(output).toContain("\"error_name\":\"DriverError\"");
    expect(output).toContain("\"error_code\":\"VALKEY_CONNECTION_REFUSED\"");
    expect(output).toContain("worker operation failed");
    assertNoSensitiveCanaries(output);
  });

  it("fails closed when message, name, and code contain unknown sensitive text", () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = unknownSensitiveError();

    logWorkerError("outbox", "publish-cycle", error);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = String(logSpy.mock.calls[0]?.[0]);
    expect(output).toContain("\"worker\":\"outbox\"");
    expect(output).toContain("\"phase\":\"publish-cycle\"");
    expect(output).toContain("\"error_name\":\"Error\"");
    expect(output).toContain("worker operation failed");
    expect(output).not.toContain("error_code");
    assertNoSensitiveCanaries(output);
  });

  it("stores only a safe bounded last_error for memory outbox failures", async () => {
    const store = createMemoryDataStore();
    store.outbox.push(outboxEvent());
    const worker = new OutboxWorker(store, {
      async publish() {
        throw sensitiveDriverError();
      },
    });

    const result = await worker.publishPending(1);

    expect(result).toEqual({ published: 0, dead_lettered: 0 });
    expect(store.outbox[0]?.status).toBe("retry");
    expect(store.outbox[0]?.last_error).toContain("DriverError code=VALKEY_CONNECTION_REFUSED");
    expect(store.outbox[0]?.last_error).toContain("worker operation failed");
    assertNoSensitiveCanaries(store.outbox[0]?.last_error ?? "");
  });

  it("stores a generic last_error for memory failures with unknown sensitive text", async () => {
    const store = createMemoryDataStore();
    store.outbox.push(outboxEvent());
    const worker = new OutboxWorker(store, {
      async publish() {
        throw unknownSensitiveError();
      },
    });

    const result = await worker.publishPending(1);

    expect(result).toEqual({ published: 0, dead_lettered: 0 });
    expect(store.outbox[0]?.last_error).toBe("Error: worker operation failed");
    assertNoSensitiveCanaries(store.outbox[0]?.last_error ?? "");
  });

  it("uses the same safe last_error in the Postgres outbox update path", async () => {
    const store = createMemoryDataStore();
    let updateParams: unknown[] | undefined;
    const client: FakePgClient = {
      async query(sql: string, params?: unknown[]) {
        if (/SELECT \*/u.test(sql)) {
          return { rows: [outboxRow()] };
        }
        if (/UPDATE platform\.outbox_events/u.test(sql)) {
          updateParams = params;
        }
        return { rows: [] };
      },
      release() {
        return undefined;
      },
    };
    const postgresStore = store as unknown as {
      kind: "postgres";
      pgPool: unknown;
    };
    postgresStore.kind = "postgres";
    postgresStore.pgPool = { connect: async () => client };
    const worker = new OutboxWorker(store, {
      async publish() {
        throw sensitiveDriverError();
      },
    });

    const result = await worker.publishPending(1);

    expect(result).toEqual({ published: 0, dead_lettered: 0 });
    expect(updateParams?.[1]).toBe("retry");
    expect(updateParams?.[2]).toBe(1);
    const lastError = String(updateParams?.[3]);
    expect(lastError).toContain("DriverError code=VALKEY_CONNECTION_REFUSED");
    expect(lastError).toContain("worker operation failed");
    assertNoSensitiveCanaries(lastError);
  });

  it("uses a generic Postgres last_error update value for unknown sensitive text", async () => {
    const updateParams = await capturePostgresLastErrorUpdateParams(unknownSensitiveError());

    const lastError = String(updateParams?.[3]);
    expect(lastError).toBe("Error: worker operation failed");
    assertNoSensitiveCanaries(lastError);
  });
});

interface FakePgClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}

function sensitiveDriverError(): Error & { code: string; command: unknown; payload: unknown } {
  const error = new Error(
    "Valkey command args payload=fake-command-payload latitude=12.971599 longitude=77.594566 " +
      "authorization=Bearer canary-bearer-token cookie=canary-cookie token=canary-secret " +
      "raw_payload={secret:true} idempotency_key=idem-key-canary",
  ) as Error & { code: string; command: unknown; payload: unknown };
  error.name = "DriverError";
  error.code = "VALKEY_CONNECTION_REFUSED";
  error.command = {
    args: [
      "payload",
      { latitude: "12.971599", longitude: "77.594566", raw_payload: "canary-secret" },
      "idempotency_key",
      "idem-key-canary",
    ],
  };
  error.payload = {
    authorization: "Bearer canary-bearer-token",
    cookie: "canary-cookie",
    token: "canary-secret",
  };
  return error;
}

function unknownSensitiveError(): Error & { code: string; command: unknown; payload: unknown } {
  const error = new Error("connection rejected with q7X2p91z") as Error & {
    code: string;
    command: unknown;
    payload: unknown;
  };
  error.name = "q7X2p91z";
  error.code = "q7X2p91z";
  error.command = { args: ["q7X2p91z"] };
  error.payload = { opaque: "q7X2p91z" };
  return error;
}

async function capturePostgresLastErrorUpdateParams(error: Error): Promise<unknown[] | undefined> {
  const store = createMemoryDataStore();
  let updateParams: unknown[] | undefined;
  const client: FakePgClient = {
    async query(sql: string, params?: unknown[]) {
      if (/SELECT \*/u.test(sql)) {
        return { rows: [outboxRow()] };
      }
      if (/UPDATE platform\.outbox_events/u.test(sql)) {
        updateParams = params;
      }
      return { rows: [] };
    },
    release() {
      return undefined;
    },
  };
  const postgresStore = store as unknown as {
    kind: "postgres";
    pgPool: unknown;
  };
  postgresStore.kind = "postgres";
  postgresStore.pgPool = { connect: async () => client };
  const worker = new OutboxWorker(store, {
    async publish() {
      throw error;
    },
  });

  const result = await worker.publishPending(1);

  expect(result).toEqual({ published: 0, dead_lettered: 0 });
  expect(updateParams?.[1]).toBe("retry");
  expect(updateParams?.[2]).toBe(1);
  return updateParams;
}

function outboxEvent(): OutboxEvent {
  return {
    id: 1,
    event_id: randomUUID(),
    aggregate_type: "attendance",
    aggregate_id: randomUUID(),
    event_type: "attendance.provisional.recorded",
    payload: {
      raw_payload: "fake-command-payload",
      latitude: "12.971599",
      longitude: "77.594566",
    },
    idempotency_key: "idem-key-canary",
    status: "pending",
    retry_count: 0,
    available_at: nowIso(),
    created_at: nowIso(),
    published_at: null,
    failed_at: null,
    last_error: null,
  };
}

function outboxRow(): Record<string, unknown> {
  const event = outboxEvent();
  return {
    ...event,
    failed_at: null,
    last_error: null,
  };
}

function assertNoSensitiveCanaries(value: string): void {
  for (const canary of sensitiveCanaries) {
    expect(value).not.toContain(canary);
  }
}
