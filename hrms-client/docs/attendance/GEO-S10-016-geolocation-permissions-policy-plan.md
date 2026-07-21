# Browser Geolocation and Permissions-Policy Readiness Plan

Task: `GEO-S10-016`
Status: Security and rollout plan; no header or runtime change in Sprint 10
Owner: Pratik
Last updated: 2026-07-20

## Objective

Prepare first-party web attendance for point-in-time browser geolocation without enabling continuous tracking, third-party frame access, or location collection outside a server-authorized attendance action.

## Current State

The Fastify API sets:

```http
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

The frontend is a separate TanStack Start/Vite deployment with a Vercel build configuration and no explicit document-response Permissions-Policy. The API response header governs API/docs documents, not a separately hosted frontend top-level document.

Browser geolocation also requires a secure context in production. Localhost is suitable for development browser testing; non-local HTTP deployments are not.

## Important SPA Constraint

Permissions Policy is established for the document. A client-side route transition cannot enable a feature that the top-level document response disabled.

Therefore this pattern is unreliable:

```text
Load /dashboard with geolocation=() -> client-side navigate to /attendance -> try to enable geo
```

The attendance route still runs in the original document and geolocation remains disabled.

## Header Decision

### API and documentation responses

Keep the current restrictive API header:

```http
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

The API and Swagger documents do not need browser location. This remains defense in depth.

### First-party frontend document

When browser geo attendance is production-ready, the frontend document response may use:

```http
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
```

This only makes the browser feature available to the same-origin document. It does not grant user permission and does not trigger location collection. Application code remains responsible for calling the API only after server context and a user gesture.

Do not allow wildcard or third-party origins. Do not add `allow="geolocation"` to any iframe. If attendance is embedded in the future, that requires a separate threat model and security approval.

### Stronger future isolation

If policy requires geolocation capability to be absent from all non-attendance documents, deploy attendance as a separate first-party document/origin with its own header. Do not force full page reloads on every SPA route transition merely to switch policy headers.

## Rollout Gate

The frontend header must remain unchanged until all are true:

1. `GET /api/v2/attendance/me/context` is implemented and tenant-safe.
2. Geo command API, evidence retention, and object authorization are implemented.
3. Admin policy version explicitly enables geo for a pilot scope.
4. Employee notice and fallback UX are approved.
5. Frontend hosting layer can set and test the document header.
6. HTTPS is verified in QA and production.
7. Browser permission, privacy, security, and E2E tests pass.
8. Rollback can disable geo policy without requiring a frontend deployment.

The document header enables capability; the backend feature/policy flag controls use.

## Collection Flow

1. Load fresh attendance context.
2. Confirm the selected action includes `browser_geo` and a non-`not_requested` location requirement.
3. Show purpose and retention notice before the first location request in the session.
4. Require an explicit user click on Check in/Check out or Share location.
5. Optionally inspect permission state for better copy; do not treat it as authorization.
6. Call `navigator.geolocation.getCurrentPosition` once.
7. Build an in-memory evidence object from coordinates, accuracy, and position timestamp.
8. Send it directly with the attendance command over HTTPS.
9. Clear references to the position after request serialization/completion.
10. Render only backend verdict/reason codes.

Never call `watchPosition`. Never collect location on page load, route hover, background timer, dashboard refresh, or unrelated actions.

## Geolocation Adapter

Browser-specific behavior belongs behind a small adapter:

```ts
interface PointLocationEvidence {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string;
  permissionState: "granted" | "prompt" | "denied" | "unknown";
  cached: boolean;
}

type GeolocationFailure =
  | { code: "unsupported" }
  | { code: "insecure_context" }
  | { code: "policy_blocked" }
  | { code: "permission_denied" }
  | { code: "position_unavailable" }
  | { code: "timeout" }
  | { code: "invalid_position" };

interface BrowserGeolocationAdapter {
  permissionState(): Promise<"granted" | "prompt" | "denied" | "unknown">;
  currentPosition(options: GeoRequestOptions): Promise<PointLocationEvidence>;
}
```

The adapter:

- Checks `window.isSecureContext` and feature availability.
- Uses `getCurrentPosition`, not `watchPosition`.
- Maps numeric browser errors to stable internal codes.
- Validates finite latitude/longitude/accuracy and valid ranges.
- Uses the position timestamp to calculate age.
- Does not decide inside/outside geofence.
- Does not log or persist position data.

## Request Options

Defaults are policy-driven and bounded:

```ts
{
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0
}
```

- `enableHighAccuracy` is a preference; browser/device behavior remains variable.
- `timeout` must be finite and produce a fallback/retry state.
- `maximumAge` defaults to zero for attendance evidence. A policy may permit a small age, but the backend always validates actual age.
- Do not loop indefinitely for a better accuracy reading.
- A second attempt requires another explicit user action unless the UI clearly presents Retry.

## Permission-State UX

| State | User experience |
| --- | --- |
| `prompt` | Show purpose/retention notice, then browser prompt after action click |
| `granted` | Request one position after action click; do not imply permanent permission |
| `denied` | Explain browser permission is blocked; show policy-approved manual/fallback action only if context provides it |
| `unknown` | Proceed through the normal user-initiated request and handle result |
| Policy blocked | Report app configuration issue; do not instruct user to repeatedly change browser permission |
| Insecure context | Block geo command and report deployment configuration issue |

The app must not claim it can reset browser permission. Guidance remains browser-neutral: use the site's permission controls/settings, then retry.

## Policy Modes

- `manual_only`: do not instantiate/call the geolocation adapter.
- `manual_geo_optional`: request only when the user selects the geo channel.
- `geo_preferred`: geo is primary; manual is shown only when returned by context.
- `geo_required`: no client-created bypass after denial/failure.
- `geo_required_with_fallback`: fallback reason and review state come from the server contract.

Changing browser permission does not change backend policy.

## Data Handling

Coordinates and accuracy must not enter:

- React Query cache.
- Component state beyond the active command closure.
- Local/session storage or IndexedDB.
- URL, route state, or query string.
- Analytics, logs, console output, breadcrumbs, error monitoring, or toast text.
- Service worker cache.
- General attendance history objects.

Only the encrypted command request transports evidence. General results return evidence state and reason codes, not coordinates.

## Hosting Implementation Plan

1. Identify the authoritative frontend document response layer for each environment: Vite dev, TanStack/Nitro preview, Vercel, and any reverse proxy.
2. Add a testable frontend security-header configuration with `geolocation=(self)` behind a release-controlled environment flag.
3. Keep camera and microphone denied.
4. Verify that no upstream proxy overwrites or duplicates the header.
5. Add a production-config guard that rejects wildcard geolocation allowlists.
6. Keep Fastify API headers unchanged unless the API begins serving the frontend document.
7. Document rollback: set all attendance geo policies to manual/disabled first, then restore `geolocation=()` in the next frontend deployment if required.

Do not infer frontend document policy from an XHR response header.

## Security Tests

- Frontend top-level document has the expected header in QA/production.
- API/docs responses retain `geolocation=()`.
- Camera and microphone remain disabled everywhere.
- No wildcard or third-party geolocation allowlist.
- Geo unavailable in insecure non-local contexts.
- Manual-only flow never invokes adapter methods.
- Geo call occurs only after an enabled action and user click.
- Cross-company/policy manipulation cannot enable a geo command.
- Coordinates absent from logs, analytics, query cache, URL, errors, and general responses.

## Browser and E2E Matrix

- Chromium desktop and Android viewport emulation.
- Firefox desktop.
- WebKit desktop and iPhone viewport emulation.
- Permission prompt, granted, denied, unavailable, timeout, stale, and poor-accuracy results.
- Direct load on attendance route and client-side navigation from dashboard.
- Reload, back/forward, role/company switch, tab background/foreground.
- Manual fallback available and unavailable.
- Header enabled, disabled, malformed, and overwritten configurations.

Canvas/map validation is not part of this task; admin map UI belongs to Sprint 12.

## Monitoring

Allowed aggregate metrics:

- Adapter supported/insecure/policy-blocked counts.
- Permission category counts.
- Acquisition success/timeout/unavailable duration buckets.
- Backend verdict/reason-code counts.

No metric or trace includes coordinates, exact accuracy, employee identity plus location, idempotency key, or raw evidence payload.

## Acceptance Criteria

- Header ownership is correctly separated between API and frontend document responses.
- SPA document-policy limitations are documented and tested.
- Frontend geolocation allowlist is same-origin only and release-gated.
- Collection is one-shot, action-driven, policy-driven, secure-context-only, and never continuous.
- Manual-only mode never touches geolocation.
- Coordinates remain transient and excluded from client persistence/telemetry.
- Permission/failure/fallback UX, rollout, rollback, security, browser coverage, and monitoring are specified.

## References

- [W3C Geolocation](https://www.w3.org/TR/geolocation/)
- [W3C Permissions Policy](https://www.w3.org/TR/permissions-policy-1/)
- `GEO-S10-011` attendance API contract plan
- `GEO-S10-012` attendance context UX plan
