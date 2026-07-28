# GEO-S11-012 Manager Review Queue QA Summary

Date: 2026-07-28
Project: Hawkaii HRMS
Domain: Attendance / Manager UX
Branch: GEO-S11-012

## Scope

Implemented the Sprint 11 manager review queue for attendance regularization requests:

```text
/attendance/approvals
  -> ManagerAttendanceReviewQueue
  -> attendance React Query hooks
  -> GET /api/v1/attendance/regularizations/queue/manager
  -> POST /api/v1/attendance/regularizations/:id/decision
```

## Behavior Added

- Manager, Director, HR Admin, and Main Admin workspaces expose the Review queue attendance tab.
- Route access fails closed for roles outside the frontend attendance-review policy.
- The backend remains authoritative for object-level employee and approver scope.
- Managers can filter requests by month and pending, returned, approved, or rejected status.
- Queue counts, client-side search, loading/error/empty states, and server pagination are supported.
- Request details show employee, work date, reason, submission metadata, status, and a sanitized
  correction-evidence summary.
- Pending requests support approve, return, and reject actions.
- Return and reject require remarks; all remarks are limited to 1,000 characters.
- Decisions send the current request version and recover from HTTP 409 conflicts by closing stale
  details and refreshing the queue.
- Successful decisions invalidate attendance queries and remove the decided request from the pending
  view.
- Raw coordinates, arbitrary evidence metadata, employee user IDs, punch target IDs, and company IDs
  are not carried into the presentation model.

## Dependency Compatibility

- The queue uses the manager endpoint introduced in the Sprint 11 attendance backend chain.
- Legacy `requested_punches` responses remain readable for the current development backend.
- Normalized `items` from `GEO-S11-008` and `GEO-S11-009` support `add`, `replace`, and `void`;
  items are ordered by their canonical ordinal.
- The UI does not invent a separate provisional geo-decision endpoint. If a future backend supplies a
  location evidence summary, only whitelisted source, outcome, reason code, and capture time fields
  are rendered.

## Verification

Passed:

```text
pnpm typecheck
pnpm build
pnpm exec eslint <GEO-S11-012 changed TypeScript files>
E2E_SKIP_WEB_SERVER=1 pnpm exec playwright test \
  e2e/attendance-manager-review-model.spec.ts --project=chromium
pnpm exec playwright test e2e/attendance-manager-review.spec.ts --project=chromium
```

Results:

- TypeScript: passed.
- Production Vite/Nitro build: passed.
- Targeted ESLint: passed.
- Queue model and security tests: 4 passed.
- Authenticated browser/API workflow: 1 passed.
- Browser workflow created an employee request, opened it as the assigned reviewer, verified the
  sanitized evidence summary, submitted required return remarks, and received a successful backend
  decision response with the expected version.

Repository-wide `pnpm lint` remains blocked by the existing CRLF/LF Prettier mismatch across many
unrelated files. The files changed for `GEO-S11-012` pass targeted ESLint and Prettier checks.
