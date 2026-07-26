# GEO-S11-010 Employee Manual Attendance Widget QA Summary

Date: 2026-07-26
Project: HRMS
Domain: Attendance
Branch: GEO-S11-010

## Scope

Implemented one reusable employee manual attendance widget for the employee dashboard and
attendance page.

## Behavior Added

- Uses the server-generated attendance timestamp as the clock authority and advances it only by
  locally measured elapsed time.
- Derives the current session, work/break totals, policy messages, and available commands from the
  server attendance summary.
- Renders only server-allowed clock-in, break-start, break-end, and clock-out actions.
- Sends no browser-generated attendance timestamp, hardcoded office mode, or geolocation data.
- Adds a unique idempotency key to each manual command and reuses it when an uncertain command is
  retried during the mounted session.
- Blocks duplicate clicks while a command is in flight.
- Distinguishes accepted, rejected, and network-uncertain outcomes, with an explicit status refresh
  before another command is allowed after an uncertain result.
- Fails closed when the server does not provide a complete attendance context.
- Replaces the duplicated attendance controls in both employee surfaces with the shared widget.
- Adds a repository-local PostCSS configuration so builds do not inherit an incompatible user-level
  PostCSS plugin configuration.

## Compatibility Boundary

The current backend does not expose the planned Sprint 11 employee attendance context endpoint.
The client therefore translates `GET /api/v1/attendance/summary/my` through a typed compatibility
adapter. The adapter is isolated in `src/domains/attendance/context.ts` so it can be replaced when
the dedicated context contract is available.

Durable idempotency-key persistence across a browser reload remains part of GEO-S11-017. This task
provides safe in-session retry identity without inventing a client/server contract that is not yet
implemented.

## Verification

- Targeted ESLint over all changed attendance files: passed.
- Production client build (`pnpm build`): passed; 2,974 modules transformed.
- Static authority audit: passed; no browser-created punch timestamp, geolocation access, hardcoded
  office mode, or legacy direct punch hook remains in either employee surface.
- Client `/login` runtime response on port 8080: HTTP 200.
- Repository TypeScript check: blocked by existing errors outside this task in project forms, admin
  settings, employees, helpdesk, timesheets, and the local `@radix-ui/react-switch` installation.
  No attendance file was reported.
- Authenticated browser verification: blocked because Docker Desktop was not running, so PostgreSQL,
  Valkey, and the backend on port 3001 were unavailable.

## Safety Notes

No attendance mutation was triggered during QA. The unrelated working-tree modification in
`hrms_backend/tsconfig.json` was not changed or included in this task.
