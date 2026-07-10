import { apiConfig, isApiEnabled, isMockFallbackEnabled } from "./config";
import { apiErrorFromResponse, ApiUnavailableError, shouldUseMockFallback } from "./errors";
import { getApiAccessToken, notifyApiUnauthorized } from "./session";
import {
  registerDefaultCooldown,
  registerRetryAfter,
  waitForClientRateLimit,
} from "./rate-limiter";
import type { ApiRecord, HttpMethod, QueryValue } from "./types";

export interface ApiRequestOptions {
  method?: HttpMethod;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  auth?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${apiConfig.baseUrl}${normalizedPath}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

export async function apiRequest<T = ApiRecord>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (!isApiEnabled()) {
    throw new ApiUnavailableError(
      "This feature is not connected to the HRMS server in this environment.",
    );
  }

  await waitForClientRateLimit();

  const headers = new Headers(options.headers);
  const token = getApiAccessToken();
  const hasBody = options.body !== undefined;

  if (token && options.auth !== false) headers.set("Authorization", `Bearer ${token}`);
  if (hasBody && !isFormData(options.body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? (hasBody ? "POST" : "GET"),
      credentials: "include",
      headers,
      body: hasBody
        ? isFormData(options.body)
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
      signal: options.signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(
      "We could not reach the HRMS server. Please check your internet connection and try again.",
      error,
    );
  }

  if (!response.ok) {
    const apiError = await apiErrorFromResponse(response);
    if (response.status === 429) {
      if (apiError.retryAfterSeconds != null) registerRetryAfter(apiError.retryAfterSeconds);
      else registerDefaultCooldown();
    }
    if (response.status === 401 && options.auth !== false) {
      notifyApiUnauthorized();
    }
    throw apiError;
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) return undefined as T;
  return (await response.json()) as T;
}

export async function withApiFallback<T>(apiCall: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!isApiEnabled()) {
    if (isMockFallbackEnabled()) return fallback();
    throw new ApiUnavailableError(
      "This page is not connected to the HRMS server in this environment.",
    );
  }

  try {
    return await apiCall();
  } catch (error) {
    if (isMockFallbackEnabled() && shouldUseMockFallback(error)) return fallback();
    throw error;
  }
}
