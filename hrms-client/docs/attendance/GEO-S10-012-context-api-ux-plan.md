# Server-Driven Attendance Context API UX Plan

Task: `GEO-S10-012`
Status: Approved implementation plan pending backend context API
Owner: Pratik
Last updated: 2026-07-20

## Objective

Make the attendance UI render the actions and guidance returned by `GET /api/v2/attendance/me/context`. The frontend must not duplicate attendance policy, shift, session, geofence, fallback, or regularization rules.

## Current UX Audit

The client currently has two employee punch surfaces:

- `src/routes/_app/attendance.index.tsx`
- `src/components/dashboards/employee-attendance-dashboard.tsx`

Both infer actions from `summary/my.today.next_allowed_actions`, construct generic punch bodies, and parse responses through `ApiRecord`. This creates four risks:

1. Policy and current-session state are mixed with historical summary data.
2. The dashboard and attendance page can drift in behavior and copy.
3. There is no typed representation of manual/geo policy or location requirements.
4. A page refresh or network retry can render stale actions without an explicit context version.

## Target Frontend Architecture

Create one domain-level context query and one shared action component:

```text
domains/attendance/context.ts
  AttendanceContext types
  normalizeAttendanceContext

domains/attendance/api.ts
  getMyContext()

domains/attendance/queries.ts
  useMyAttendanceContext()

domains/attendance/mutations.ts
  useAttendanceCommand()

components/attendance/attendance-action-panel.tsx
  shared state and action rendering

routes/_app/attendance.index.tsx
  full context, day details, history

components/dashboards/employee-attendance-dashboard.tsx
  compact wrapper around the same panel
```

The full page and dashboard may use different density, but they must consume the same context, action model, command helper, reason-code copy, and loading/error behavior.

## Typed Context View Model

The UI consumes a normalized model rather than reading arbitrary properties:

```ts
type AttendancePolicyMode =
  | "manual_only"
  | "manual_geo_optional"
  | "geo_preferred"
  | "geo_required"
  | "geo_required_with_fallback";

type AttendanceActionName = "check_in" | "break_start" | "break_end" | "check_out";
type AttendanceChannel = "manual" | "browser_geo";
type LocationRequirement = "not_requested" | "optional" | "required" | "required_or_fallback";

interface AttendanceAllowedAction {
  action: AttendanceActionName;
  channels: AttendanceChannel[];
  locationRequirement: LocationRequirement;
  enabled: boolean;
  reasonCode: string | null;
}

interface AttendanceContextViewModel {
  generatedAt: string;
  attendanceDate: string;
  timezone: string;
  policyVersionId: string;
  policyMode: AttendancePolicyMode;
  retentionNotice: string | null;
  session: AttendanceSessionViewModel | null;
  actions: AttendanceAllowedAction[];
  canRegularize: boolean;
}
```

Unknown enum values fail closed: hide the affected mutation, show a refresh action, and record a client diagnostic without exposing response contents.

## Page States

| State | UI behavior | Available commands |
| --- | --- | --- |
| Initial loading | Stable action-panel skeleton; no buttons that can mutate | None |
| Context ready | Render current session, policy hint, and server-enabled actions | Exactly those returned by context |
| Refreshing | Keep current content visible with buttons disabled only if context is stale | None while stale |
| Empty actions | Explain completed day, non-working day, locked period, or policy restriction using reason-code copy | Regularization only when capability permits |
| Context error | Compact error with Retry; history remains available if separately loaded | None |
| Unauthorized | Use shared session-expiry handling | None |
| Offline | Show last known session as stale and disable new commands | None |
| Command pending | Disable all attendance command buttons and preserve layout | None |
| Command replayed | Treat as success, refresh context, and avoid duplicate toast | Server result actions |

Context older than 60 seconds is stale for mutation purposes. It can remain visible for orientation, but an action click must refresh it before requesting evidence or sending a command.

## Policy-Mode Flows

### Manual only

- Never call the browser Geolocation API.
- Do not show location permission copy or icons.
- Send the selected command through the `manual` channel.
- Show only shift/session guidance returned by context.

### Manual with optional geo

- Primary action follows product policy: manual by default unless the server marks browser geo preferred.
- Offer a small channel menu only when both channels are returned.
- Explain that sharing location is optional and applies only to this action.
- Permission denial falls back to manual without an error when manual remains allowed.

### Geo preferred

- Primary action requests point-in-time location after the user clicks.
- Provide a visible "Continue without location" action only when the server includes manual or approved fallback.
- If location is unavailable, return to the channel choice with reason-specific copy.

### Geo required

- Primary action requests point-in-time location after explicit click.
- Do not render a manual bypass.
- Permission denial, timeout, or unavailable location produces a non-destructive state with Retry and policy guidance.
- Never continuously watch location.

### Geo required with approved fallback

- Request location first.
- On permission denial, timeout, stale fix, or poor accuracy, show the fallback reason choices returned or accepted by the server contract.
- A fallback command is visibly marked as provisional or review-required after the result.
- The client does not decide whether fallback is acceptable.

## Current Session Rendering

The action panel has fixed regions so dynamic status cannot shift controls:

1. Attendance date and timezone.
2. Session state: not started, working, on break, completed, or review required.
3. Started time, elapsed work time, and elapsed break time.
4. Evidence/approval status when relevant.
5. Server-enabled action controls.
6. One contextual reason or policy hint.

Elapsed timers are display-only calculations based on server timestamps and `generated_at`. They never determine whether an action is allowed. Refresh context when the tab regains visibility or the local display crosses a date boundary in the company timezone.

## Action Interaction

1. User activates a server-enabled action.
2. Client refreshes stale context.
3. Client selects the only channel or presents the server-supported channel choice.
4. Browser location is requested only for `browser_geo`.
5. Client creates one idempotency key and client event ID for the user action.
6. Command is sent once; transport retry reuses both identifiers.
7. The result renders accepted, warning, provisional, review-required, or rejected status.
8. Context, current day, event history, and dashboard queries are invalidated.
9. Focus moves to the status message, then returns to the next enabled action when appropriate.

Double-clicks are blocked by the pending state. Navigation during a request does not create a second command; the domain mutation owns the in-flight identifiers until success or terminal failure.

## Location Permission UX

- Request permission only in a secure first-party context and only after a user gesture.
- Display the server-provided retention notice before the first request in a session.
- Distinguish denied, unavailable, timeout, stale, and poor-accuracy outcomes.
- Do not claim that browser permission can be changed from inside the app.
- Provide browser-neutral guidance to use site controls/settings.
- Do not cache or persist coordinates in local storage, session storage, query cache, analytics, error monitoring, or toast content.
- Clear in-memory coordinates immediately after command serialization.

## Query and Cache Rules

- Query key: `attendance/context/me` plus active company and active role identifiers.
- `staleTime`: at most 30 seconds; mutation freshness threshold: 60 seconds.
- Refetch on window focus and network reconnect.
- Clear context cache on logout, company switch, or role switch.
- Never persist context or location evidence to browser storage.
- Invalidate context after every command result, including replay and rejection.
- Historical summary failure must not overwrite a successfully loaded context panel.

## Accessibility

- Action controls use buttons with icons and visible labels.
- Pending state uses `aria-busy`; status updates use a polite live region.
- Permission dialogs and fallback choices are keyboard and screen-reader operable.
- Color is never the only indicator of accepted, warning, provisional, review, or rejected state.
- Focus order is date/session, actions, policy hint, then secondary navigation.
- Button dimensions remain stable while labels and loading indicators change.

## Analytics and Logging

Allowed telemetry:

- Context load success/failure and duration.
- Action name, selected channel category, result verdict, and reason code.
- Permission state category.
- Whether a command was a replay.

Forbidden telemetry:

- Latitude, longitude, geofence geometry, full command body, exact workplace address, idempotency key, client event ID, or free-form fallback text.

## Implementation Dependencies

- `GEO-S10-011`: v2 contract names and schemas.
- Backend company/tenant context decision from `GEO-S10-003`.
- DB-first command behavior from `GEO-S10-004`.
- Idempotency behavior from `GEO-S10-005`.
- Policy and shift resolution contracts from Sprint 11.
- Controlled geolocation Permissions-Policy change from `GEO-S10-016`.

## Test Matrix

Unit/component tests:

- Maps every policy mode and location requirement.
- Hides disabled/unknown actions.
- Does not call geolocation in manual-only mode.
- Requests location only after click.
- Reuses mutation identifiers on retry.
- Disables actions for stale, offline, pending, unauthorized, and error states.
- Renders current session and reason-code copy.

Integration tests:

- Context refresh after command, replay, provisional result, and rejection.
- Company/role switch clears context.
- Dashboard and attendance page expose identical allowed actions.
- Permission denied with and without fallback.

E2E tests:

- Manual-only check-in through check-out.
- Optional geo accepted and skipped.
- Required geo granted, denied, unavailable, and timeout.
- Required geo fallback enters review state.
- Responsive and keyboard flows on desktop and mobile browser viewports.

## Acceptance Criteria

- One shared action component drives both existing employee attendance surfaces.
- The frontend never derives allowed actions from policy fields or local session guesses.
- All five policy modes have explicit user flows.
- Browser location is point-in-time, user-initiated, and never requested in manual-only mode.
- Stale/offline/error contexts cannot mutate attendance.
- Current session, policy hint, permission state, result verdict, and fallback are understandable without exposing coordinates.
- Cache invalidation, role/company switching, accessibility, telemetry, and tests are specified.
