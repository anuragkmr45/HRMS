# Manual Attendance Frontend Architecture

Task: `GEO-S10-014`
Status: Implementation architecture pending DB-first attendance APIs
Owner: Pratik
Last updated: 2026-07-20

## Objective

Define the component, state, data, and retry architecture for manual check-in, break, resume, and check-out on the web. The first implementation must work without mobile support and without requesting browser location.

## Scope

Included:

- Employee manual attendance action panel.
- Check-in, break start, break end, and check-out commands.
- Current session and day status.
- Idempotent retry and duplicate-click prevention.
- Shared dashboard and attendance-page behavior.
- Loading, stale, offline, error, warning, provisional, and completion states.

Excluded:

- Browser geolocation collection.
- Admin policy editing.
- Historical regularization and manager decisions.
- Mobile offline queueing.
- Client-side policy or shift evaluation.

## Architectural Boundaries

```text
Route/page composition
  -> AttendanceActionPanel
    -> useAttendanceController
      -> context query
      -> command mutation
      -> idempotency-key factory
      -> query invalidation
    -> presentational session/status/action components
```

Rules:

- API calls and mutation identifiers stay in the attendance domain layer.
- Components receive typed view models and callbacks, not raw `ApiRecord` values.
- The controller coordinates one command at a time.
- The backend context and command result are authoritative.
- Local timer calculations are display-only.
- No attendance command is queued while offline.

## Proposed File Layout

```text
src/domains/attendance/
  api.ts
  contracts.ts
  context.ts
  commands.ts
  queries.ts
  query-keys.ts
  reason-codes.ts

src/components/attendance/
  attendance-action-panel.tsx
  attendance-session-status.tsx
  attendance-action-controls.tsx
  attendance-policy-hint.tsx
  attendance-result-message.tsx
  attendance-action-panel.test.tsx

src/routes/_app/
  attendance.index.tsx
```

`EmployeeAttendanceDashboard` imports the same `AttendanceActionPanel` in compact mode. It does not own a second command implementation.

## Domain Contracts

```ts
type ManualAttendanceAction = "check_in" | "break_start" | "break_end" | "check_out";

type AttendanceSessionState = "not_started" | "working" | "on_break" | "completed";

type AttendanceCommandVerdict =
  | "accepted"
  | "accepted_with_warning"
  | "provisional"
  | "review_required"
  | "rejected";

interface ManualActionCapability {
  action: ManualAttendanceAction;
  enabled: boolean;
  reasonCode: string | null;
}

interface ManualAttendanceViewModel {
  attendanceDate: string;
  timezone: string;
  sessionState: AttendanceSessionState;
  openedAt: string | null;
  breakStartedAt: string | null;
  closedAt: string | null;
  workSeconds: number;
  breakSeconds: number;
  actions: ManualActionCapability[];
  policyHint: string | null;
  contextGeneratedAt: string;
}
```

API response parsing is isolated in a normalizer that validates required fields. Unknown session states or actions fail closed and produce a recoverable contract error.

## UI State Machine

The view state is derived from query and mutation state, not stored as a second domain state machine.

| UI state | Entry condition | Controls |
| --- | --- | --- |
| `loading` | No context yet | Skeleton only |
| `ready` | Fresh context, online, no mutation | Server-enabled actions |
| `refreshing` | Context refetch with usable fresh data | Existing controls remain stable |
| `stale` | Context older than mutation threshold | Refresh; action click refreshes first |
| `submitting` | Command request in flight | All command controls disabled |
| `result` | Command returned a verdict | Next server actions plus status message |
| `offline` | Browser/network manager offline | Read-only status and reconnect message |
| `error` | Context failed without usable data | Retry context only |
| `contract_error` | Response cannot be normalized | Refresh and support reference; no mutation |

The UI must not optimistically transition a session. It may show a pending label, but working/on-break/completed state changes only from a successful server result or refreshed context.

## Component Responsibilities

### AttendanceActionPanel

- Owns layout and accessibility wiring.
- Receives density: `full` or `compact`.
- Renders session, timers, controls, status message, and policy hint.
- Does not call `fetch`, geolocation, storage, or policy logic directly.

### AttendanceSessionStatus

- Displays date, timezone, session state, start/end times, and evidence/approval state.
- Uses fixed rows to avoid layout shift.
- Formats timestamps in the context timezone.

### AttendanceActionControls

- Maps capability names to familiar Lucide icons and labels.
- Uses one primary action at a time:
  - Check in when not started.
  - Start break and Check out while working.
  - Resume while on break; Check out only if the server also enables it.
- Has stable button dimensions during pending state.
- Never renders an action not present and enabled in context.

### AttendanceResultMessage

- Uses verdict and reason codes.
- Is announced through a polite live region.
- Avoids duplicate success toast when the response is an idempotent replay.
- Does not expose request payloads or technical errors.

## Controller Contract

```ts
interface AttendanceController {
  view: ManualAttendanceViewModel | null;
  state: "loading" | "ready" | "refreshing" | "stale" | "submitting" | "offline" | "error";
  submit(action: ManualAttendanceAction): Promise<void>;
  retryContext(): Promise<void>;
  lastResult: AttendanceCommandResult | null;
  error: AttendanceUiError | null;
}
```

`submit` sequence:

1. Verify browser is online.
2. Reject calls while another command is pending.
3. Refresh context if stale.
4. Verify the refreshed context still enables the requested manual action.
5. Create or reuse the pending action's `Idempotency-Key` and `client_event_id`.
6. Send the typed command with `source_channel: "web"` and no location object.
7. Store only the returned result in component memory.
8. Invalidate context, day, event history, dashboard, and team summary query families.
9. Clear mutation identifiers only after success or a terminal non-retryable response.

## Idempotency and Retry Lifecycle

One user gesture creates one pending command identity:

```ts
interface PendingAttendanceCommand {
  action: ManualAttendanceAction;
  idempotencyKey: string;
  clientEventId: string;
  capturedAt: string;
  requestFingerprint: string;
}
```

Rules:

- Generate IDs with `crypto.randomUUID()` and an attendance-specific key prefix.
- Keep the pending identity in memory, scoped to the mounted controller.
- Retry network timeout, connection loss, and configured 5xx responses with the same identity and body.
- Never reuse an identity for a changed action, timestamp, work mode, company, or policy version.
- A key-reused conflict is terminal and requires a new user action after context refresh.
- An in-progress conflict honors `Retry-After` and preserves the same identity.
- A replay response is success and triggers normal cache refresh.
- Do not use `localStorage` for Sprint 11 manual web attendance. Persistent/offline identity is deferred to the mobile/offline contract.

## Error and Retry Policy

| Failure | UI behavior | Identifier behavior |
| --- | --- | --- |
| Client validation | Inline correction; no request | Not created |
| Offline before send | Read-only offline message | Not created |
| Network failure after send may have started | Retry action with clear status | Preserve |
| `400` validation | Safe message and refresh context | Clear |
| `401` | Shared session-expiry flow | Clear |
| `403` | Permission/policy message and refresh | Clear |
| `409` invalid transition | Refresh and show new allowed actions | Clear |
| `409` key in progress | Retry after server delay | Preserve |
| `409` key reused | Contract error; require new action | Clear |
| `422` policy/evidence requirement | Reason-code guidance | Clear |
| `423` locked period | Read-only locked state | Clear |
| `429` | Respect `Retry-After`; keep controls disabled until elapsed | Preserve only if server defines replay-safe retry |
| `5xx` or timeout | Retry same command or cancel and refresh | Preserve until resolved |

Cancel does not imply the server cancelled processing. After cancellation, refresh context before allowing another command.

## Timer Model

- Compute elapsed display from server `generated_at`, session timestamps, and current clock.
- Recalculate once per second only while visible and session is working/on-break.
- Pause interval work when the document is hidden.
- Clamp negative durations to zero.
- On visibility return, refetch context before resuming display.
- Company timezone determines attendance date; browser local date does not.
- Timers never auto-submit break or check-out commands.

## Query Design

```text
attendance/context/me/{companyId}/{role}
attendance/days/me/{filters}
attendance/events/me/{filters}
attendance/regularizations/me/{filters}
attendance/team/summary/{filters}
```

- Context stale time: 30 seconds maximum.
- No persisted query cache for attendance context.
- Clear all attendance queries on company/role switch and logout.
- Use `placeholderData` only for historical lists, not for a different company context.
- Command success/replay invalidates the attendance domain and dashboard summary.
- Avoid broad application-wide invalidation.

## Layout

Full mode:

- Unframed page section with date/status header.
- Stable two-column desktop layout: session summary and action controls.
- Compact metrics row for work, break, and target time.
- Policy/reason message below controls.

Compact dashboard mode:

- Same session state and controls with reduced metrics.
- One line of policy/reason copy.
- Link to attendance history.

Mobile:

- One column.
- Primary command is full width.
- Secondary commands are equal-width controls below it.
- No horizontal overflow for timestamps, error copy, or long translated labels.

## Migration from Current Components

1. Add typed v2 contracts and normalizers alongside current v1 API.
2. Add controller and action panel behind a v2 route-capability check.
3. Replace command logic in `EmployeeAttendanceDashboard` with compact panel.
4. Replace employee command logic in `attendance.index.tsx` with full panel.
5. Keep existing historical v1 summary/calendar reads until v2 day reads are complete.
6. Run v1/v2 action parity tests in QA.
7. Remove `liveAttendanceToday` action inference after both surfaces use context.
8. Remove `AttendancePunchBody.metadata` usage from public UI commands.

No partial rollout may leave one surface on local action inference and the other on server context for the same user population.

## Security and Privacy

- Backend remains authoritative for action, actor, company, policy, session, and object access.
- No location permission or location payload exists in manual-only implementation.
- Do not log bodies, command IDs, idempotency keys, tokens, or exact employee schedule details.
- Sanitize error messages through the shared API error layer.
- Disable actions while company/role context is switching.

## Verification Plan

Unit tests:

- Context normalization and fail-closed unknown values.
- Display timer calculations and visibility behavior.
- Action mapping for every session state.
- Retry classification and pending-identity lifecycle.

Component tests:

- Stable loading/pending/error layouts.
- No disallowed action rendered.
- Duplicate click submits one command.
- Replay result does not duplicate success feedback.
- Keyboard focus and live-region announcements.

Integration/E2E tests:

- Check in, start break, resume, and check out.
- Timeout after send followed by idempotent replay.
- Concurrent second-tab invalid transition followed by context refresh.
- Offline before action and disconnect after send.
- Role/company switch during stale context.
- Desktop, compact dashboard, and mobile viewport parity.

## Acceptance Criteria

- One controller and action panel serve both employee attendance surfaces.
- Manual attendance never requests location.
- UI transitions only from server context/results.
- Every mutation uses one stable idempotency key per user action.
- Retries cannot duplicate attendance events.
- Offline mode is read-only until a later offline contract is implemented.
- Timers are display-only, timezone-safe, and resource-conscious.
- Types, component boundaries, migration order, security, accessibility, and tests are implementation-ready.

