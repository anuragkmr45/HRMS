const ACCESS_TOKEN_STORAGE_KEY = "hawkaii_api_access_token";

function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    else window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    // Session restore should never break the app if browser storage is unavailable.
  }
}

let accessToken: string | null = readStoredAccessToken();

export const API_UNAUTHORIZED_EVENT = "hawkaii:api-unauthorized";

export function setApiAccessToken(token: string | null | undefined): void {
  accessToken = token || null;
  writeStoredAccessToken(accessToken);
}

export function getApiAccessToken(): string | null {
  return accessToken;
}

export function clearApiAccessToken(): void {
  accessToken = null;
  writeStoredAccessToken(null);
}

export function notifyApiUnauthorized(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(API_UNAUTHORIZED_EVENT));
}

export function onApiUnauthorized(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(API_UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handler);
}
