import { Redis as Valkey } from "iovalkey";
import type { FastifyInstance } from "fastify";

type HealthStatus = "ready" | "missing" | "unreachable" | "unmigrated" | "not_applicable";

export interface HealthCheckResult {
  status: HealthStatus;
  latency_ms?: number;
  detail?: string;
}

export interface ReadinessChecks {
  database: HealthCheckResult;
  valkey: HealthCheckResult;
  object_storage: HealthCheckResult;
}

export interface ReadinessResult {
  isReady: boolean;
  checks: ReadinessChecks;
}

export function createReadinessChecker(fastify: FastifyInstance, ttlMs = 30_000): () => Promise<ReadinessResult> {
  let cached: { expiresAt: number; result: ReadinessResult } | undefined;
  let pending: Promise<ReadinessResult> | undefined;

  return async () => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.result;
    }
    if (pending) {
      return pending;
    }

    pending = checkReadiness(fastify)
      .then((result) => {
        cached = {
          expiresAt: Date.now() + ttlMs,
          result
        };
        return result;
      })
      .finally(() => {
        pending = undefined;
      });

    return pending;
  };
}

export async function checkReadiness(fastify: FastifyInstance): Promise<{
  isReady: boolean;
  checks: ReadinessChecks;
}> {
  const checks = {
    database: await checkDatabase(fastify),
    valkey: await checkValkey(fastify),
    object_storage: await checkObjectStorage(fastify)
  };
  const isReady = Object.values(checks).every((check) => check.status === "ready" || check.status === "not_applicable");
  return { isReady, checks };
}

async function checkDatabase(fastify: FastifyInstance): Promise<HealthCheckResult> {
  if (fastify.store.kind !== "postgres") {
    return { status: "not_applicable" };
  }
  if (!fastify.config.DATABASE_URL || !fastify.store.pgPool) {
    return { status: "missing" };
  }
  const start = Date.now();
  try {
    const result = await fastify.store.pgPool.query<{ departments_table: string | null }>("select to_regclass('core.departments') as departments_table");
    const departmentsTable = result.rows[0]?.departments_table;
    if (!departmentsTable) {
      return { status: "unmigrated", latency_ms: Date.now() - start, detail: "core.departments table is missing" };
    }
    return { status: "ready", latency_ms: Date.now() - start };
  } catch (error) {
    return { status: "unreachable", latency_ms: Date.now() - start, detail: safeError(error) };
  }
}

async function checkValkey(fastify: FastifyInstance): Promise<HealthCheckResult> {
  if (fastify.store.kind !== "postgres") {
    return { status: "not_applicable" };
  }
  if (!fastify.config.VALKEY_URL) {
    return { status: "missing" };
  }
  const start = Date.now();
  const valkey = new Valkey(fastify.config.VALKEY_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000
  });
  try {
    await valkey.connect().catch((error: unknown) => {
      if (error instanceof Error && /already connecting|already connected/iu.test(error.message)) {
        return;
      }
      throw error;
    });
    const pong = await valkey.ping();
    return pong === "PONG"
      ? { status: "ready", latency_ms: Date.now() - start }
      : { status: "unreachable", latency_ms: Date.now() - start, detail: "ping did not return PONG" };
  } catch (error) {
    return { status: "unreachable", latency_ms: Date.now() - start, detail: safeError(error) };
  } finally {
    valkey.disconnect();
  }
}

async function checkObjectStorage(fastify: FastifyInstance): Promise<HealthCheckResult> {
  const objectStorage = fastify.store.objectStorage;
  if (!objectStorage) {
    return { status: "missing" };
  }
  const start = Date.now();
  try {
    const readyCheck = (objectStorage as { ensureReady?: () => Promise<void> }).ensureReady;
    if (readyCheck) {
      await readyCheck.call(objectStorage);
    }
    return { status: "ready", latency_ms: Date.now() - start };
  } catch (error) {
    return { status: "unreachable", latency_ms: Date.now() - start, detail: safeError(error) };
  }
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "postgres://[redacted]")
    .replace(/rediss?:\/\/[^\s]+/giu, "redis://[redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/gu, "[redacted]")
    .slice(0, 180);
}
