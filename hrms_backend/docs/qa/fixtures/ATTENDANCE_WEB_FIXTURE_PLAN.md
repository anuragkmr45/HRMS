# Web Attendance QA Fixture and Test Data Plan

Task: `GEO-S10-021`
Status: Reusable matrix defined; implementation is gated by versioned attendance contracts
Owner: Pratik
Last updated: 2026-07-20

## Deliverable

The machine-readable fixture catalog is:

`docs/qa/fixtures/attendance-web-v2.fixture-matrix.json`

It contains synthetic tenants, sites, shifts, policies, users, evidence samples, and 28 deterministic scenarios. No production or copied employee data is permitted.

## Existing Evidence Audit

The repository already has attendance unit and integration coverage using the shared development seed:

- Attendance policy, repository, service, route integration, and auto-punchout tests.
- Seed personas for Admin, Employee, Manager/Reviewer, and other roles.
- Existing coverage for action sequence, summaries, calendars, manager regularization, OCC, exception visibility, and worker idempotence.

No `GEO-S10-021` artifact or reusable web-attendance matrix existed when this task was audited. The tracker state `Tested successfully` is therefore treated as prior status, not as sufficient repository evidence for the new v2 web/geo requirements.

## Fixture Principles

- Deterministic time: tests inject the matrix anchor clock; no `Date.now()` dependency.
- Tenant-local dates: work date is resolved using assignment/site/company timezone rules, never test-runner timezone.
- Synthetic identity: stable fixture IDs and employee codes contain no names, emails, or credentials.
- Isolation: each scenario starts from a reset snapshot or declares ordered preconditions.
- Contract-first: v2-only fields are not inserted into current production tables until migrations and schemas exist.
- Privacy: coordinates are synthetic and remain only in dedicated evidence fixtures; logs and snapshots redact them.
- Minimal coupling: tests select fixtures by stable ID, not array index or seed insertion order.

## Coverage Map

| Area | Fixture/scenario coverage |
| --- | --- |
| Tenancy | Alpha and Beta tenants; cross-tenant negative `AWF-024` |
| Roles | Employee, assigned/unassigned manager, HR, Admin, Auditor, inactive user |
| Hierarchy | Two independent manager teams and explicit approver assignments |
| Shifts | Day, overnight, scheduled off, India and New York timezone resolution |
| Policy modes | Manual only, location optional, preferred, required, required with fallback |
| Manual actions | Check-in, break start/end, check-out, invalid sequence |
| Geolocation | Inside, outside, low accuracy, stale, denied, timeout, fallback |
| Outcomes | Accepted, warning, review required, rejected, replayed |
| Review | Submit, assigned manager approve, out-of-scope manager, self-approval, stale version |
| Idempotency | Same key/same request and same key/changed request |
| Privacy | General responses, exports, logs, and telemetry redaction |

## Test Builder Contract

Implement one builder in backend testing utilities after the v2 data model lands:

```ts
type AttendanceFixtureHandle = {
  clock: TestClock;
  tenant(id: string): TenantHandle;
  user(id: string): AuthenticatedUserHandle;
  scenario(id: string): AttendanceScenario;
  reset(): Promise<void>;
};

async function loadAttendanceFixture(
  id: "attendance-web-v2",
  options?: { scenarioIds?: string[] },
): Promise<AttendanceFixtureHandle>;
```

The loader must validate references before writing, insert tenants in isolated schemas/databases where supported, hash test credentials through normal auth setup, and return tokens only in memory. It must not expose a production seed command.

## Execution Layers

### Unit

- Policy mode resolution and allowed actions.
- Geofence verdict from synthetic evidence.
- Work-date assignment for day/overnight/timezone boundaries.
- Status normalization and reason-code mapping.
- Request fingerprint and idempotency state transitions.

### API Contract and Integration

- Load context, perform commands, reconcile history, and review regularizations.
- Assert response schemas and normalized problem codes.
- Repeat all authorization and tenant-negative scenarios directly against APIs.
- Assert command reservation, replay, conflict, and concurrent execution behavior.

### Browser

- Mock only the browser Geolocation and Permissions APIs; use the real API service and fixture database.
- Cover permission prompt, denial, timeout, unavailable, and successful one-shot acquisition.
- Verify manual-only mode never calls geolocation.
- Verify page reload after uncertain mutation does not auto-submit.
- Verify employee and manager layouts at desktop and mobile widths.
- Verify keyboard, focus, live-region, contrast, and long-copy behavior.

## Geolocation Mock Inputs

Browser test adapters map fixture evidence IDs to standards-shaped callbacks:

```ts
navigator.geolocation.getCurrentPosition(
  success({ coords: { latitude, longitude, accuracy }, timestamp }),
  error({ code, message }),
  options,
);
```

Tests assert the client calls `getCurrentPosition` only after a user action and never calls `watchPosition`. Error messages from the browser are not copied into analytics or user-visible server reason text.

## Scenario Isolation

- Default mode: reset database snapshot before each scenario.
- Ordered mode: run only declared `preconditions` in sequence, under one scenario transaction/snapshot.
- Parallel mode: allocate a unique database/schema and browser storage state per worker.
- Idempotency scenarios use explicit test-only keys generated by the test helper; snapshots redact them.
- Clean `sessionStorage`, service workers, cookies, query cache, and permission mocks between browser tests.

## Data Lifecycle

- Fixture files are version-controlled and reviewed like contract code.
- Generated rows carry a test-run marker and synthetic tenant IDs.
- Hosted QA reset is allowlisted to non-production environments and fixture tenant prefixes.
- Teardown deletes only rows belonging to the current test-run marker.
- Test evidence retains normalized IDs and verdicts, not raw coordinates or credentials.
- Any change to enum values, policy modes, or scenario expectations requires fixture version review.

## CI Suites

| Suite | Trigger | Matrix subset |
| --- | --- | --- |
| Pull request smoke | Every PR | Manual happy path, required geo happy path, manager approval, tenant negative |
| Attendance contract | Attendance/shared API changes | All 28 API scenarios |
| Browser Chromium | Attendance client changes | Core employee, permission, uncertain outcome, manager flows |
| Cross-browser | Nightly/release | Chromium, Firefox, WebKit permission and layout cases |
| Security/privacy | Nightly/release | Scope, self-approval, cross-tenant, redaction, inactive user |
| Timezone | Nightly/release | Overnight and tenant timezone cases |

## Exit Criteria

- JSON parses and all IDs/references/scenario IDs are unique.
- Every Sprint 10 policy mode and normalized result state has at least one scenario.
- Manual and geo flows include positive and negative cases.
- Managers, HR, Admin, Auditor, employee, inactive, and cross-tenant actors are covered.
- Browser tests prove one-shot, user-initiated geolocation and no auto-replay.
- Test outputs contain no raw coordinates, keys, credentials, or free-form notes.
- The tracker may remain `Tested successfully` only when linked CI run evidence identifies commit, environment, matrix version, and passing scenario IDs.
