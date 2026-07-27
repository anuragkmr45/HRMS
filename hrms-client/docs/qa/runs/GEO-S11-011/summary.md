# GEO-S11-011 Employee Regularization Form QA Summary

Date: 2026-07-27
Project: Hawkaii HRMS
Domain: Attendance / Web Regularization
Branch: GEO-S11-011
Developer account for push and PR: Spidy2924

## Scope

Implemented the employee historical-attendance regularization form required by Sprint 11 task
`GEO-S11-011`.

The change is frontend-only and follows the repository domain-adapter pattern:

```text
attendance page
  -> EmployeeRegularizationForm
  -> attendance React Query hooks
  -> attendanceApi
  -> POST /api/v1/attendance/regularizations
```

## Behavior Added

- Employee selects a historical work date; today and future dates are rejected.
- Employee provides a required reason between 3 and 1,000 characters.
- Employee can submit between 1 and 20 normalized correction actions.
- Supported canonical actions are:
  - `add`: add a missing check-in or check-out.
  - `replace`: select an existing punch ID and request its replacement.
  - `void`: select an existing punch ID and request its exclusion without deleting history.
- Existing target punches are loaded only for the selected work date.
- Stale punch data retained by React Query is filtered by `work_date`, and target actions are blocked
  while the selected date is refreshing.
- A punch already targeted by a pending or approved request in the loaded history is disabled.
- Client validation blocks duplicate ADD actions and duplicate target use in one request.
- The API adapter writes only the canonical `items` field; it does not submit legacy
  `requested_punches`.
- A successful backend response replaces the form with a submitted-state view showing status,
  work date, reason, requested actions, and assigned approver when available.
- Recent employee regularization requests show normalized operation summaries and current status.
- Backend error responses use the shared user-safe error helpers.
- No raw coordinates, internal request IDs, stack traces, or database details are exposed.

## Dependency Boundary

This task depends on the normalized regularization contract implemented by PR #30 / Sprint task
`GEO-S11-008`, and is designed on top of the employee attendance frontend foundation in PR #32 /
`GEO-S11-010`.

Before runtime acceptance, the target integration branch must contain both dependency sets. Do not
exercise this UI against a backend that still accepts only legacy `requested_punches`.

## Verification Completed In The Solution Sandbox

- Strict isolated TypeScript verification for the API types, request model, and React component:
  passed.
- Pure request-builder tests: passed for canonical `add`, `replace`, and `void` payloads.
- Validation tests: passed for current/future date, short reason, duplicate ADD, and unavailable
  target-punch rejection.
- Manual static review confirmed that target queries use `date_from` and `date_to`, not the
  unsupported `date` shortcut used by other attendance queries.
- Manual static review confirmed that `replace` and `void` use real punch IDs returned by
  `GET /api/v1/attendance/punches/my`.

A complete repository build was not executed in the solution sandbox because direct GitHub clone
access was unavailable. The developer must run the repository commands below after applying the
patch on `GEO-S11-011`.

## Required Developer Verification

```bash
cd hrms-client
pnpm install --frozen-lockfile
pnpm format
pnpm lint
pnpm typecheck
pnpm api:production-config-guard
pnpm api:implemented-route-guard
pnpm api:frontend-contract:route-coverage
pnpm build:vercel
```

Run authenticated browser verification against a backend containing the normalized API:

1. Log in as an employee self-service user.
2. Open `/attendance`.
3. Submit one ADD request for a historical missing check-in.
4. Submit one REPLACE request using a real existing punch ID.
5. Submit one VOID request using a real existing punch ID.
6. Confirm the submitted-state view appears only after a successful backend response.
7. Confirm the request appears in recent history with `Pending` status.
8. Confirm today/future dates, short reasons, duplicate ADD actions, duplicate targets, and missing
   target selections are blocked.
9. Confirm manager review sees the same normalized item details through the existing queue API.
10. Confirm no other attendance dashboard, calendar, punch, or role-routing behavior regresses.

## Git Identity And PR Rule

The patch must be applied, committed, pushed, and submitted as a pull request by Pratik using the
GitHub account `Spidy2924`. No commit or PR should originate from the connected `anuragkmr45`
account for this task.
