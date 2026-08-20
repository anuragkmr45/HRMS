import { createHash } from "node:crypto";

export function canonicalJsonHash(value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(jsonRoundTrip(value))))
    .digest("hex");
}

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
