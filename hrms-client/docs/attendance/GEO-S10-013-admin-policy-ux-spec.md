# Admin Attendance Policy UX Specification

Task: `GEO-S10-013`
Status: Implementation specification pending versioned policy APIs
Owner: Pratik
Last updated: 2026-07-20

## Objective

Define an admin workflow for configuring, validating, simulating, publishing, and auditing attendance policy versions. Manual attendance remains first-class. Geo is an optional evidence channel controlled by policy, not a replacement for manual attendance.

## Current-State Gap

`admin-settings.policies.tsx` currently edits one flat attendance config and saves it directly through `PUT /api/v1/admin/policies/attendance` with optimistic concurrency. It supports punch windows, off-day punches, grace thresholds, auto punch-out, and regularization, but it does not support:

- Draft and published policy versions.
- Effective dates or assignment scope.
- Manual/geo channel modes.
- Fallback and review behavior.
- Location accuracy, age, retention, or privacy controls.
- Approval requirements.
- Simulation and publish-time impact review.

The new editor must not overload the current generic policy form. It becomes a dedicated Attendance Policy workspace under Admin Settings.

## Information Architecture

The workspace has five tabs with a persistent version header:

1. `Basics`
2. `Attendance channels`
3. `Rules and approvals`
4. `Privacy and retention`
5. `Assignments`

Persistent version header:

- Policy name and status: Draft, Scheduled, Published, Superseded.
- Version number and effective date/time.
- Unsaved-change indicator.
- `Save draft`, `Simulate`, and `Publish` commands.
- Overflow menu for duplicate draft, discard draft, and view audit history.

Only one command is primary in each lifecycle state. Published versions are read-only.

## Version Lifecycle

```text
No draft -> Create draft -> Edit/validate -> Simulate -> Publish now or schedule
Published -> Duplicate as draft -> Edit/validate -> Simulate -> Publish replacement
```

Rules:

- Editing never mutates a published version.
- A draft stores `expected_version` for OCC.
- Publish requires a successful server validation and simulation for at least one representative employee/shift context.
- Publishing records actor, timestamp, effective interval, change summary, and approval evidence when four-eyes approval is enabled.
- Scheduling rejects overlapping effective versions for the same assignment scope.
- A version in use can be superseded but not deleted.
- Discarding a draft requires confirmation and a reason when another reviewer has commented or approved it.

## Basics Tab

Fields:

| Field | Control | Validation |
| --- | --- | --- |
| Policy name | Text input | 2-120 characters, unique within company |
| Description | Text area | Maximum 500 characters |
| Company timezone | Read-only value with settings link | Required company setting |
| Effective from | Date and time inputs | Future for scheduled publish; company timezone |
| Effective until | Optional date and time inputs | Later than start; no overlap |
| Working-day source | Segmented control | Shift calendar or company calendar |
| Allow off-day attendance | Toggle | Requires review behavior selection |
| Regularization enabled | Toggle | Reveals request-window and approval controls |

## Attendance Channels Tab

### Mode

Use a single-select radio/segmented list with plain-language summaries:

| Mode | Meaning |
| --- | --- |
| `manual_only` | Employees check in/out without a location request |
| `manual_geo_optional` | Manual is always available; employees may share location |
| `geo_preferred` | Location is requested first; manual remains an allowed fallback |
| `geo_required` | Accepted attendance requires location evidence |
| `geo_required_with_fallback` | Location is required unless an approved fallback reason applies |

Changing mode updates a read-only employee experience preview. It does not silently alter fallback, review, or retention values.

### Manual channel

- Enable check-in, break, resume, and check-out separately only where backend state-machine rules permit.
- Punch window: full day or explicit check-in/check-out windows.
- Allowed work modes: office, remote, WFH, field.
- Off-day behavior: block, accept with warning, or require review.
- Manual evidence outcome: accepted, provisional, or review-required.

### Geo channel

Visible only when mode is not `manual_only`:

- Allowed work-site/geofence assignments.
- Maximum location age in seconds.
- Maximum accepted horizontal accuracy in metres.
- Boundary grace distance in metres.
- Poor-accuracy behavior: retry, provisional, review, or reject.
- Stale-location behavior: retry, fallback, review, or reject.
- Overlapping-geofence behavior must remain backend-defined and cannot be resolved by client ordering.
- Point-in-time collection notice. Continuous tracking is not an option.

### Fallback

Visible for preferred or fallback-enabled modes:

- Allowed system reasons: permission denied, unavailable, timeout, poor accuracy, stale fix, no assigned site, emergency exception.
- Employee explanation required toggle and character limit.
- Result: provisional or review-required.
- Approver scope: manager, HR, or configured attendance approver.
- Daily fallback limit and abuse-monitoring threshold.

## Rules and Approvals Tab

### Shift and punctuality

- Shift source and version are assignment-driven, not hard-coded times.
- Grace minutes.
- Late threshold and late classification.
- Half-day threshold.
- Auto-absent threshold.
- Cross-midnight shift behavior is shown read-only from the selected shift version.

Validation requires:

```text
0 <= grace < half-day threshold < auto-absent threshold
```

### Session safety

- One open session per employee/company is always enabled and read-only.
- Auto punch-out enabled toggle.
- Auto punch-out offset from shift end; do not configure a global wall-clock time for versioned shifts.
- Maximum session duration.
- Break requirement and maximum open-break duration.
- Auto-closed sessions: accepted with warning or review-required.

### Approval rules

- Regularization approval required.
- Geo fallback approval required.
- Boundary/poor-accuracy review required.
- Off-day attendance review required.
- Self-approval is always blocked and read-only.
- Approver resolution order is previewed from backend configuration.
- Payroll-period locks are visible but managed in the period-lock workspace.

## Privacy and Retention Tab

The page separates evidence retention from attendance record retention.

| Setting | Required behavior |
| --- | --- |
| Location evidence retention | Bounded numeric days with organization policy maximum |
| Decision metadata retention | Independent bounded duration |
| Exact-coordinate access | Restricted permission set; never default manager access |
| Coordinate export | Disabled by default; requires separate security approval |
| Employee notice | Required text shown before first location request |
| Purpose statement | Required and versioned |
| Redaction after expiry | Preview of fields retained versus removed |

The UI must state that general attendance history remains after exact location expiry. It must never display stored coordinates in the policy editor.

## Assignments Tab

Assignment precedence is displayed exactly as the backend resolver applies it:

1. Employee exception.
2. Shift/site assignment.
3. Department/location group.
4. Company default.

Features:

- Filterable assignment table with scope type, scope name, effective range, and policy version.
- Add assignment drawer with object lookup constrained to active company.
- Overlap and ambiguity validation returned by the backend.
- Impact count before publish: employees, shifts, sites, and departments affected.
- Sample employee context preview without exposing unrelated employee data.

Frontend ordering is informational. The backend remains authoritative when resolving a policy.

## Validation and Error Presentation

Validation runs in three layers:

1. Immediate field constraints for format and range.
2. Cross-field draft validation returned by the policy API.
3. Publish validation for assignments, effective periods, referenced versions, and approval.

Errors appear in a summary at the top and inline at the related control. Warnings do not block `Save draft`; errors block simulation and publish. The client uses stable error/reason codes and never parses human-readable detail.

Critical validation cases:

- Geo mode without an active site/geofence assignment.
- Required geo with no behavior for permission denial.
- Fallback enabled with no approver or result state.
- Retention outside organization limits.
- Invalid threshold ordering.
- Auto punch-out earlier than valid shift end semantics.
- Effective period overlap or assignment ambiguity.
- Published dependencies changed or archived while draft was open.
- OCC version conflict.

## Simulation

Simulation is read-only and sends no attendance event. Inputs:

- Representative employee or synthetic assignment context.
- Date/time and source channel.
- Permission state, accuracy, location age, and inside/boundary/outside scenario.
- Manual/fallback reason where relevant.

Output:

- Resolved policy, shift, site, and geofence version IDs.
- Allowed channels/actions.
- Decision verdict and ordered reason codes.
- Review/approver requirement.
- Retention treatment.

The UI labels simulation as a policy preview, not proof of a future attendance result.

## Publish Review

The publish dialog is a focused review, not a generic confirmation:

- Version and effective time.
- Changed fields grouped by tab.
- Impacted assignment counts.
- Simulation status.
- Warnings and blocking errors.
- Required approval status.
- Mandatory publish note.

The publish command carries an idempotency key and current draft version. On success, the UI opens the immutable published view and invalidates policy, assignment, audit, and employee-context caches.

## Current Field Migration

| Current field | Versioned destination |
| --- | --- |
| `fullDayPunchWindow` | Manual channel punch-window mode |
| `punchInStart`, `punchInEnd` | Legacy/default shift window until shift versions are assigned |
| `punchOutStart`, `punchOutEnd` | Legacy/default shift window until shift versions are assigned |
| `allowOffDayPunches` | Off-day behavior |
| `graceMinutes` | Punctuality grace |
| `halfDayAfterMinutes` | Half-day threshold |
| `autoMarkAbsentMinutes` | Auto-absent threshold |
| `autoPunchOutEnabled` | Session safety toggle |
| `autoPunchOutTime` | Migrated to shift-relative auto-close offset after review |
| `allowRegularization` | Regularization enabled |

Migration imports the current config as version 1 of the company default manual-only policy. No geo collection is enabled by migration.

## Authorization and Audit

- Page access requires backend permission to manage attendance policies.
- Read, edit draft, simulate, publish, approve, and view restricted audit evidence are separate capabilities.
- Route visibility is UX only; every API call enforces company and object authorization.
- Save, publish, schedule, supersede, assignment, and discard actions write immutable audit events.
- Exact values classified as secrets or location evidence do not appear in general audit payloads.

## Responsive and Accessibility Requirements

- Desktop uses a restrained two-column form; mobile uses one column with a sticky version/action bar.
- Tabs become a horizontal scroll list without truncating labels.
- Every input has a visible label, description, and associated error.
- Mode selection works with keyboard and screen reader controls.
- Warnings and errors use text and icons in addition to color.
- Publish review traps focus and restores it to the publish command.

## Test Plan

Component tests:

- Mode-dependent fields and no geo controls for manual-only.
- Cross-field errors and warning summary links.
- Published read-only behavior.
- OCC refresh/reapply flow.
- Restricted permissions hide actions, not data returned without authorization.

Integration tests:

- Create, edit, validate, simulate, publish, schedule, supersede, and discard draft.
- Assignment ambiguity and effective-period overlap.
- Publish approval and self-approval rejection.
- Migration from every current attendance field.
- Context cache invalidation after publish.

E2E tests:

- Publish manual-only company default.
- Publish optional-geo policy with retention notice.
- Required geo blocked without site assignment.
- Required-with-fallback publish and employee context preview.
- Keyboard and mobile-browser policy editing.

## Acceptance Criteria

- Manual and all geo modes are explicit and mutually exclusive.
- Fallback, retention, approval, assignment, and publish workflows are defined.
- Existing fields map to a safe manual-only version without data loss.
- Published versions are immutable and every mutation is authorized, audited, OCC-protected, and idempotent where retryable.
- Validation prevents ambiguous or unusable policy versions.
- The admin preview reflects backend resolution and never makes a policy decision locally.
