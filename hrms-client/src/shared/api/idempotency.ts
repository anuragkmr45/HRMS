import { ApiError, ApiUnavailableError } from "./errors";

const IDEMPOTENCY_SCOPE_PATTERN = /^[a-z][a-z0-9._-]{1,63}$/u;

export interface IdempotentMutation<TInput> {
  readonly idempotencyKey: string;
  readonly input: TInput;
}

export function createIdempotentMutation<TInput>(
  scope: string,
  input: TInput,
): IdempotentMutation<TInput> {
  if (!IDEMPOTENCY_SCOPE_PATTERN.test(scope)) {
    throw new Error("Idempotency scope must be 2-64 lowercase URL-safe characters.");
  }
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure UUID generation is unavailable.");
  }
  return Object.freeze({
    idempotencyKey: `${scope}:${globalThis.crypto.randomUUID()}`,
    input,
  });
}

export function retryIdempotentMutation(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiUnavailableError) return true;
  return (
    error instanceof ApiError &&
    (error.status === 408 || error.status === 425 || error.status >= 500)
  );
}

export function idempotentMutationRetryDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 2_000);
}
