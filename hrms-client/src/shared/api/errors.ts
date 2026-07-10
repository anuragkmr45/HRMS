import type { ApiErrorBody, ApiRecord } from "./types";

interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: ApiRecord;
  requestId?: string;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiRecord;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
    if (options.cause) this.cause = options.cause;
  }
}

export class ApiUnavailableError extends Error {
  constructor(
    message = "We could not reach the HRMS server. Please check your connection and try again.",
    cause?: unknown,
  ) {
    super(message);
    this.name = "ApiUnavailableError";
    if (cause) this.cause = cause;
  }
}

function friendlyApiMessage(status: number, message: string | undefined): string {
  const value = (message || "").trim();
  const normalized = value.toLowerCase();

  if (status === 401 && /invalid email or password|unauthorized/.test(normalized)) {
    return "Email or password is incorrect.";
  }
  if (/duplicate key value|unique constraint|23505/.test(normalized)) {
    return "A record with these details already exists.";
  }
  if (/foreign key constraint|violates foreign key|23503/.test(normalized)) {
    return "This item is linked to another record and cannot be changed right now.";
  }
  if (/not-null constraint|null value.*violates|expected .* received null/.test(normalized)) {
    return "Some required information is missing. Please review the form and try again.";
  }
  if (
    /internal server error|stack trace|econnrefused|enotfound|failed before a response/.test(
      normalized,
    )
  ) {
    return status >= 500
      ? "Something went wrong on the server. Please try again."
      : "We could not complete the request. Please try again.";
  }
  if (value) return value;
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "We could not find that record.";
  if (status === 409) return "This record changed. Refresh and try again.";
  if (status === 422) return "Please check the details and try again.";
  if (status === 429) return "Too many requests. Please wait and try again.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  return "Request failed.";
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  return undefined;
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  let parsed: Partial<ApiErrorBody> | undefined;

  try {
    parsed = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    parsed = undefined;
  }

  return new ApiError({
    status: response.status,
    code: parsed?.code || `HTTP_${response.status}`,
    message: friendlyApiMessage(response.status, parsed?.message || response.statusText),
    details: parsed?.details,
    requestId: parsed?.request_id || response.headers.get("x-request-id") || undefined,
    retryAfterSeconds,
  });
}

export function isApiBusinessError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status >= 400 && error.status < 500;
}

export function isApiUnavailableError(error: unknown): boolean {
  if (error instanceof ApiUnavailableError) return true;
  if (error instanceof ApiError) return error.status >= 500;
  return error instanceof TypeError;
}

export function shouldUseMockFallback(error: unknown): boolean {
  return isApiUnavailableError(error) && !isApiBusinessError(error);
}
