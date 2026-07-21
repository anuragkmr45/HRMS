# Attendance State Wireframes and UI Copy

Task: `GEO-S10-019`
Status: Implementation-ready UX artifact
Owner: Pratik
Last updated: 2026-07-20

## Purpose

Define the shared attendance result and queue states for employee and manager surfaces. These wireframes specify hierarchy, actions, copy, responsive behavior, and accessibility; visual styling continues to use the existing HRMS design system.

## Design Rules

- Show the server verdict first, then the recorded time, policy consequence, and next action.
- Do not infer success from HTTP status alone; render the response `outcome` and stable `reason_code`.
- Separate presence, punctuality, evidence, review, and payroll concepts rather than compressing them into one badge.
- Use icon plus text, never color alone.
- Use a stable result region so loading and longer copy do not shift adjacent controls.
- Employee copy explains what happened and what they can do. Manager copy explains why an item needs attention and the decision scope.
- Do not expose coordinates, exact geofence distance, device fingerprint, or internal risk scores.
- A success toast may confirm the command, but the persistent result panel is the source of truth.

## Shared Employee Action Surface

### Desktop

```text
+-----------------------------------------------------------------------+
| Attendance                                      Mon, 20 Jul 2026       |
|-----------------------------------------------------------------------|
| Today                                                                 |
| [Status icon] Working                                                |
| Started 09:04 AM  |  3h 18m recorded  |  Office policy              |
|                                                                       |
| [ Start break ]                                      [ Clock out ]    |
|-----------------------------------------------------------------------|
| RESULT REGION (appears after an action; fixed minimum height)         |
| [Outcome icon] Outcome title                                          |
| Recorded at 09:04 AM                                                   |
| Explanation and next step.                                            |
| [Primary action when needed] [Secondary action when needed]           |
+-----------------------------------------------------------------------+
```

### Mobile

```text
+----------------------------------+
| Attendance            20 Jul     |
|----------------------------------|
| [Icon] Working                   |
| Started 09:04 AM                 |
| 3h 18m recorded                  |
|                                  |
| [ Clock out                 ]    |
| [ Start break               ]    |
|----------------------------------|
| [Outcome icon] Title             |
| Recorded at 09:04 AM             |
| Explanation wraps naturally.     |
| [Primary action             ]    |
| [Secondary action           ]    |
+----------------------------------+
```

On mobile, the primary action is full width and appears before secondary actions. The result title uses compact panel typography, not page-heading scale.

## Employee Result States

### 1. Accepted

Use when the attendance action is final and has no warning or review requirement.

```text
[Check icon] Clock-in recorded
Recorded at 09:04 AM
Your work session has started.
```

| Field | Copy |
| --- | --- |
| Clock in title | `Clock-in recorded` |
| Clock in body | `Your work session has started.` |
| Clock out title | `Clock-out recorded` |
| Clock out body | `Your work session ended at {time}.` |
| Break start title | `Break started` |
| Break end title | `Break ended` |
| Replay note | Do not show a second toast; render the same persistent result |

No follow-up action is displayed. The next valid attendance command comes from refreshed server context.

### 2. Accepted with Warning

Use when the action is final but a non-blocking policy warning applies.

```text
[Warning icon] Clock-in recorded with a warning
Recorded at 09:18 AM
Your clock-in was accepted. It is 3 minutes after your grace period.
[View today's record]
```

| Reason | Employee body copy |
| --- | --- |
| Late arrival | `Your clock-in was accepted. It is {minutes} minutes after your grace period.` |
| Low location accuracy | `Your clock-in was accepted, but location accuracy was lower than preferred.` |
| Approved fallback | `Your clock-in was accepted using the approved fallback method.` |
| Near session limit | `Your action was accepted. Remember to clock out before {time}.` |

Do not label this state `Failed`, `Pending`, or `Needs approval`.

### 3. Provisional

Use when the event is recorded but is not yet final because a defined automated or operational check is pending.

```text
[Clock icon] Clock-in recorded provisionally
Recorded at 09:04 AM
You can continue working. We are completing an attendance check.
Status usually updates within {duration}.
[Check status]
```

Rules:

- Keep the normal next attendance action available only when server context permits it.
- Do not promise approval or payroll outcome.
- `Check status` refreshes context; it does not resubmit the command.
- If no service-level estimate exists, omit the duration line.

### 4. Review Required

Use when the event is recorded and a person must review evidence or a policy exception.

```text
[Review icon] Clock-in recorded; review required
Recorded at 09:04 AM
Your attendance was saved and sent for review because the required
location evidence was unavailable.
[View request]  [Add supporting note]
```

| Reason | Employee body copy |
| --- | --- |
| Required location unavailable | `Your attendance was saved and sent for review because the required location evidence was unavailable.` |
| Outside allowed site | `Your attendance was saved and sent for review because the location did not match an assigned workplace.` |
| Schedule exception | `Your attendance was saved and sent for review because it was outside your assigned schedule.` |
| Manual correction | `Your correction request was sent to {approver_label} for review.` |

If supporting notes are not permitted by context, omit that action. Never reveal precise geofence thresholds.

### 5. Rejected

Use when no attendance event was created. The title must state this explicitly.

```text
[Error icon] Clock-in was not recorded
No attendance event was created.
Clock-in is not allowed on a company non-working day.
[View schedule]
```

| Reason | Employee body copy | Action |
| --- | --- | --- |
| Invalid sequence | `Finish or correct your current attendance session before trying again.` | `View today's record` |
| Outside allowed window | `Clock-in is available from {start_time} to {end_time}.` | `View schedule` |
| Non-working day | `Clock-in is not allowed on a company non-working day.` | `View schedule` |
| Required location denied | `Location access is required by your attendance policy.` | `Enable location` |
| Required location unavailable | `We could not verify the required location. Try again when location is available.` | `Try again` |
| Unauthorized | `Your current role cannot perform this attendance action.` | `Return to attendance` |
| Conflict/stale context | `Attendance changed since this page loaded. Review the latest status before trying again.` | `Refresh status` |

Do not show `Something went wrong` for a known business rejection. Do not offer `Try again` for deterministic policy blocks unless conditions can change.

### 6. Outcome Not Confirmed

Use after a timeout or network loss where the request may have reached the server.

```text
[Connection icon] Outcome not confirmed
We lost connection before the result arrived. Do not start a new action yet.
[Check status]  [Retry same action]
```

`Retry same action` is shown only while the original idempotency identity and unchanged request are available. Page load never retries automatically.

## Location Permission States

Location prompts appear only after fresh server context says location is applicable and the user starts an attendance action.

### Browser Prompt Not Yet Requested

```text
[Location icon] Allow location for this action
Your attendance policy requires a one-time location check. HRMS does
not track your location continuously.
[Continue to browser prompt]  [Cancel]
```

### Permission Denied, Fallback Allowed

```text
[Location-off icon] Location is off
You can use the approved fallback method. This attendance action will
be sent for review.
[Use fallback]  [Open browser help]
```

### Permission Denied, Location Required

```text
[Location-off icon] Location is required
Your attendance policy requires location for this action. Allow location
for this site in your browser, then try again.
[Open browser help]  [Cancel]
```

### Unavailable or Timed Out

```text
[Location warning icon] Location could not be confirmed
We could not get a reliable location within the allowed time.
[Try location again]  [Use fallback, when allowed]
```

Browser-help content must be selected from detected permission state and supported browser family; do not claim the application can open browser settings directly.

## Manager Queue Surface

### Desktop List and Detail

```text
+-----------------------------------+-----------------------------------+
| Attendance review                 | Request detail                    |
| [Needs review 8] [Provisional 2]  | Priya S. - 20 Jul 2026            |
|-----------------------------------|-----------------------------------|
| [Review] Priya S.       09:04 AM  | [Review required]                 |
| Required evidence unavailable     | Clock-in recorded at 09:04 AM     |
|                                   | Reason: Location unavailable      |
| [Warning] Aman K.        09:18 AM | Evidence: Unavailable             |
| Late arrival                      | Policy: Bengaluru office v4       |
|                                   | Employee note: ...                |
|                                   |                                   |
|                                   | [Approve] [Return] [Reject]       |
+-----------------------------------+-----------------------------------+
```

### Mobile

The queue is a list of full-width rows. Selecting a row navigates to a dedicated detail route; do not squeeze list and detail side-by-side. A sticky footer may contain decision commands, but it must not cover evidence or validation errors.

## Manager State Copy

| State | Queue label | Detail summary | Available action |
| --- | --- | --- | --- |
| Accepted | `Recorded` | `Attendance is final; no review is required.` | View only |
| Accepted warning | `Warning` | `Attendance is final with a policy warning: {reason_label}.` | View only unless policy creates a separate exception |
| Provisional | `Check in progress` | `Attendance is recorded while an automated check completes.` | Refresh; no decision unless server grants one |
| Review required | `Needs review` | `Attendance is recorded and requires a decision for: {reason_label}.` | Approve, return, or reject according to `allowed_actions` |
| Rejected | `Not recorded` | `The employee action was rejected and no attendance event was created.` | View audit detail; no approval |
| Outcome unknown | Never appears as a manager queue state | Client transport uncertainty is reconciled before queue classification | None |

Decision dialog copy:

- Approve title: `Approve this attendance request?`
- Approve body: `This confirms the requested attendance change for {employee_name} on {date}.`
- Return title: `Return for more information?`
- Return body: `Explain what the employee needs to provide.`
- Reject title: `Reject this attendance request?`
- Reject body: `The attendance change will not be applied. A reason is required.`
- Conflict: `This request changed while you were reviewing it. The latest version is now shown.`
- No longer authorized: `This request is no longer assigned to you.`

Never use a generated remark such as `Rejected from correction queue.` The reviewer enters a meaningful reason where required.

## Loading, Empty, and Error Copy

| Surface | State | Copy |
| --- | --- | --- |
| Employee context | Loading | `Loading today's attendance...` |
| Employee context | Unavailable | `Today's attendance is unavailable. Try again before recording an action.` |
| Employee history | Empty | `No attendance activity is recorded for this period.` |
| Manager queue | Loading | `Loading attendance requests...` |
| Manager queue | Empty | `No attendance requests need your review.` |
| Manager queue | Error | `Attendance requests could not be loaded. Try again.` |
| Detail | Removed/resolved | `This request is no longer available in your queue.` |
| Access denied | Forbidden | `You do not have access to this attendance view.` |

## Accessibility Requirements

- Persistent result panel uses `role="status"` for accepted states and `role="alert"` only for rejected or action-blocking states.
- After submission, move focus to the result heading without scrolling the user past the next action.
- Queue state and decision buttons have explicit accessible names including action and employee/request context.
- Do not announce a live timer every second; expose a readable elapsed value and update announcements only at meaningful intervals.
- Dialog focus is trapped and returns to the originating queue row.
- Status icons are decorative when adjacent text provides the name.
- All state colors meet contrast requirements in light and dark themes.
- Long translations wrap without truncating the result title or covering actions.

## Analytics Events

Allowed event fields are operation, normalized outcome, reason code, fallback availability, permission category, viewport class, and build version. Do not include names, coordinates, exact accuracy, reason text, note text, idempotency key, request ID, or raw evidence.

## Acceptance Checklist

- Employee desktop and mobile action surfaces are defined.
- Manager desktop and mobile queue/detail surfaces are defined.
- Accepted, accepted-warning, provisional, review-required, rejected, and uncertain outcomes have exact copy.
- Location permission not-requested, denied, fallback, unavailable, and timeout states are defined.
- Primary and secondary actions come from server capabilities and allowed actions.
- Copy clearly distinguishes recorded from not recorded.
- Accessibility, responsive layout, privacy, and failure behavior are specified.
- Copy keys and final enum mapping are normalized in `GEO-S10-020` before implementation.
