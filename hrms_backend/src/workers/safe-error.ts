const MAX_SAFE_ERROR_CODE_LENGTH = 80;
const SAFE_WORKER_ERROR_MESSAGE = "worker operation failed";

const ALLOWED_ERROR_NAMES = new Set([
  "AbortError",
  "AggregateError",
  "DatabaseError",
  "DriverError",
  "Error",
  "EvalError",
  "RangeError",
  "RedisError",
  "ReferenceError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
  "ValkeyError",
]);

const UNSAFE_CODE_SEGMENTS = new Set([
  "AUTH",
  "AUTHORIZATION",
  "COOKIE",
  "COORDINATE",
  "COORDINATES",
  "HASH",
  "HEADER",
  "HEADERS",
  "IDEMPOTENCY",
  "KEY",
  "LATITUDE",
  "LONGITUDE",
  "LNG",
  "PASSWORD",
  "PAYLOAD",
  "RAW",
  "SECRET",
  "SNAPSHOT",
  "TOKEN",
]);

export interface SafeErrorSummary {
  error_name: string;
  error_code?: string;
  error_message: string;
}

export interface SafeWorkerErrorLog extends SafeErrorSummary {
  worker: string;
  phase: string;
}

export function safeErrorSummary(error: unknown): SafeErrorSummary {
  const name = safeErrorName(error);
  const code = safeErrorCode(error);
  return code
    ? { error_name: name, error_code: code, error_message: SAFE_WORKER_ERROR_MESSAGE }
    : { error_name: name, error_message: SAFE_WORKER_ERROR_MESSAGE };
}

export function safeOutboxLastError(error: unknown): string {
  const summary = safeErrorSummary(error);
  const code = summary.error_code ? ` code=${summary.error_code}` : "";
  return `${summary.error_name}${code}: ${summary.error_message}`;
}

export function safeWorkerErrorLog(worker: string, phase: string, error: unknown): SafeWorkerErrorLog {
  return {
    worker: safeContextValue(worker, "worker"),
    phase: safeContextValue(phase, "phase"),
    ...safeErrorSummary(error),
  };
}

export function logWorkerError(worker: string, phase: string, error: unknown): void {
  console.error(JSON.stringify(safeWorkerErrorLog(worker, phase, error)));
}

function safeErrorName(error: unknown): string {
  const candidate = error instanceof Error ? error.name : typeof error;
  return ALLOWED_ERROR_NAMES.has(candidate) ? candidate : "Error";
}

function safeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string" && typeof code !== "number") {
    return undefined;
  }
  const normalized = String(code).trim();
  if (!isSafeMachineErrorCode(normalized)) {
    return undefined;
  }
  return normalized.slice(0, MAX_SAFE_ERROR_CODE_LENGTH);
}

function safeContextValue(value: string, fallback: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 80);
  return sanitized || fallback;
}

function isSafeMachineErrorCode(code: string): boolean {
  if (!/^(?:E[A-Z0-9_]{1,62}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,10})$/u.test(code)) {
    return false;
  }
  return code.split("_").every((segment) => !UNSAFE_CODE_SEGMENTS.has(segment));
}
