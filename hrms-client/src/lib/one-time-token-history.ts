const MAX_COMPLETED_TOKEN_MARKERS = 40;

export function hasCompletedOneTimeToken(storageKey: string, token: string | undefined): boolean {
  if (!token) return false;
  try {
    return readCompletedTokenMarkers(storageKey).includes(tokenMarker(token));
  } catch {
    return false;
  }
}

export function rememberCompletedOneTimeToken(storageKey: string, token: string | undefined): void {
  if (!token) return;
  try {
    const markers = readCompletedTokenMarkers(storageKey);
    const next = [...markers.filter((marker) => marker !== tokenMarker(token)), tokenMarker(token)];
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify(next.slice(-MAX_COMPLETED_TOKEN_MARKERS)),
    );
  } catch {
    // Best-effort browser-history protection; the backend still enforces one-time token use.
  }
}

function readCompletedTokenMarkers(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((value): value is string => typeof value === "string")
    : [];
}

function tokenMarker(token: string): string {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${token.length}:${(hash >>> 0).toString(36)}`;
}
