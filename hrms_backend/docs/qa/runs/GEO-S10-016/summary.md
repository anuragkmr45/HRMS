# GEO-S10-016 QA Summary

Date: 2026-07-20
Branch: `GEO-S10-016`
Owner: Pratik
Domain: Browser Geo Readiness
Story points: 5

## Deliverable

Created `hrms-client/docs/attendance/GEO-S10-016-geolocation-permissions-policy-plan.md`.

## Evidence Reviewed

- Fastify security-header plugin and contract coverage.
- Frontend Vite/TanStack/Vercel deployment configuration.
- `GEO-S10-011` and `GEO-S10-012` contracts.
- W3C Geolocation and Permissions Policy specifications.

## Key Decision

Keep API/docs responses at `geolocation=()`. When geo attendance is release-ready, configure the first-party frontend document as `geolocation=(self)` because SPA route transitions cannot enable a feature disabled on the original document. Actual collection remains gated by fresh server context and explicit user action.

## Safety Guarantees

- No continuous `watchPosition` use.
- No collection on load/background/unrelated routes.
- Manual-only mode never calls geolocation.
- No wildcard/third-party frame allowlist.
- Coordinates remain transient and absent from client storage, telemetry, URLs, logs, and general attendance responses.
- Camera and microphone remain disabled.

## Verification

- Run `git diff --check`.
- Confirm the plan distinguishes frontend document and API response headers.
- Confirm release and rollback gates are explicit.
- Confirm this planning task changes no runtime header or permission behavior.

