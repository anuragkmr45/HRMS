# GEO-S10-012 QA Summary

Date: 2026-07-20
Branch: `GEO-S10-012`
Owner: Pratik
Domain: Web Attendance
Story points: 5

## Deliverable

Created `hrms-client/docs/attendance/GEO-S10-012-context-api-ux-plan.md` for the server-driven attendance context experience.

## Evidence Reviewed

- Existing attendance overview employee flow.
- Existing employee dashboard attendance widget.
- Attendance API/query layer and shared API error handling.
- `GEO-S10-011` v2 attendance contract plan.
- Supplied location attendance feature and technical requirements.

## Decisions

- Replace duplicated action logic with one typed context query and shared action panel.
- Render exactly the server-provided allowed actions.
- Treat stale/offline context as read-only.
- Request point-in-time browser location only after explicit action and only when context permits it.
- Never persist or log coordinates in the web client.
- Refresh context after successful, replayed, provisional, review-required, or rejected commands.

## Acceptance Review

- Manual-only flow: covered.
- Optional geo flow: covered.
- Required geo flow: covered.
- Required geo with fallback: covered.
- Current-session rendering: covered.
- Permission, stale, offline, retry, accessibility, and telemetry states: covered.
- Unit, integration, and E2E matrix: covered.

## Verification

- Run `git diff --check`.
- Confirm the plan references both current employee attendance surfaces.
- Confirm no production route or UI behavior changed before the backend context endpoint exists.

