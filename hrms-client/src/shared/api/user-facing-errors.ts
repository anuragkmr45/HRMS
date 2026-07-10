import { toast } from "sonner";
import { ApiError, ApiUnavailableError } from "./errors";
import { asArray, asRecord, text } from "./records";

export interface UserFacingError {
  title: string;
  description?: string;
  status?: number;
  code?: string;
  requestId?: string;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")
    ? trimmed
    : `${trimmed}.`;
}

function detailsFromUnknown(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(detailsFromUnknown);
  const record = asRecord(value);
  const messages: string[] = [];

  for (const entry of asArray(record.formErrors)) {
    const message = text(entry);
    if (message) messages.push(message);
  }

  const fieldErrors = asRecord(record.fieldErrors);
  for (const [field, fieldValue] of Object.entries(fieldErrors)) {
    for (const entry of detailsFromUnknown(fieldValue)) {
      messages.push(`${field}: ${entry}`);
    }
  }

  for (const [field, fieldValue] of Object.entries(record)) {
    if (field === "formErrors" || field === "fieldErrors") continue;
    for (const entry of detailsFromUnknown(fieldValue)) {
      messages.push(`${field}: ${entry}`);
    }
  }

  return Array.from(new Set(messages.filter(Boolean)));
}

function fallbackTitle(error: ApiError, fallback: string): string {
  if (error.message && error.message !== "Request failed.") return error.message;
  if (error.status === 401) return "Please sign in again.";
  if (error.status === 403) return "You do not have access to perform this action.";
  if (error.status === 404) return "The requested record was not found.";
  if (error.status === 409) return "This record changed. Refresh and try again.";
  if (error.status === 422) return "Please check the highlighted details.";
  if (error.status === 429) return "Too many requests. Please wait and try again.";
  if (error.status >= 500) return "The server could not complete the request.";
  return fallback;
}

function isNetworkFailureMessage(message: string): boolean {
  return /failed before a response|failed to fetch|networkerror|econnrefused|enotfound/i.test(
    message,
  );
}

export function formatUserFacingError(
  error: unknown,
  fallback = "Something went wrong.",
): UserFacingError {
  if (error instanceof ApiError) {
    const details = detailsFromUnknown(error.details);
    const description = [
      ...details.slice(0, 4).map(sentence),
      error.retryAfterSeconds != null
        ? `Try again in ${error.retryAfterSeconds} seconds.`
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      title: fallbackTitle(error, fallback),
      description: description || undefined,
      status: error.status,
      code: error.code,
      requestId: error.requestId,
    };
  }

  if (error instanceof ApiUnavailableError) {
    const message = error.message || "We could not reach the HRMS server. Please try again.";
    if (/not connected to the HRMS server/i.test(message)) {
      return {
        title: "This feature is not available in this environment.",
        description: "Ask an administrator to enable backend API mode before using this feature.",
      };
    }
    return {
      title: "We could not reach HRMS.",
      description: "Please check your internet connection and try again.",
    };
  }

  if (error instanceof Error) {
    const message = error.message || fallback;
    if (isNetworkFailureMessage(message)) {
      return {
        title: "We could not reach HRMS.",
        description: "Please check your internet connection and try again.",
      };
    }
    return { title: message };
  }

  return { title: fallback };
}

export function userFacingErrorMessage(error: unknown, fallback?: string): string {
  const formatted = formatUserFacingError(error, fallback);
  return formatted.description ? `${formatted.title} ${formatted.description}` : formatted.title;
}

export function toastApiError(error: unknown, fallback?: string): void {
  const formatted = formatUserFacingError(error, fallback);
  toast.error(formatted.title, {
    description: formatted.description,
  });
}

export function toastApiSuccess(message: string, description?: string): void {
  toast.success(message, { description });
}
