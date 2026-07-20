# Attendance Status and Exception Copy Normalization

Task: `GEO-S10-020`
Status: Canonical naming and copy specification
Owner: Pratik
Last updated: 2026-07-20

## Objective

Define one unambiguous attendance vocabulary across API contracts, employee views, manager queues, administration, reports, exports, notifications, audit history, analytics, and tests.

## Current Problems

The current day `status` combines unrelated concepts:

- `present` and `absent` describe presence.
- `late` describes punctuality while also implying presence.
- `wfh` describes work mode.
- `leave`, `weekend`, and `holiday` describe schedule disposition.
- `future` describes a time projection rather than attendance.

The exception queue also uses `correction` as an exception type even though it is a request source/workflow, and the shared badge renders generic labels such as `Pending` or `Returned` without attendance context.

This makes filters non-exclusive, counts hard to interpret, and copy inconsistent between employee and manager views.

## Canonical Response Shape

Versioned attendance responses should expose dimensions independently:

```json
{
  "work_date": "2026-07-20",
  "day_kind": "working_day",
  "time_relation": "today",
  "work_mode": "office",
  "presence_status": "present",
  "punctuality_status": "late_arrival",
  "evidence_status": "verified",
  "review_status": "not_required",
  "payroll_status": "not_evaluated",
  "exceptions": ["late_arrival"]
}
```

Do not add a new all-purpose `status`. A UI summary may derive a primary label, but the underlying dimensions remain available and reportable.

## Day and Context Dimensions

### Day Kind

| API value | Canonical label | Guidance |
| --- | --- | --- |
| `working_day` | Working day | Attendance is expected according to the resolved schedule |
| `scheduled_off` | Scheduled day off | Employee-specific or company non-working day |
| `holiday` | Holiday | Named holiday from the applicable calendar |
| `approved_leave` | Approved leave | Approved leave covers the day or defined portion |
| `unassigned` | Schedule not assigned | Schedule resolution is incomplete; operational attention may be required |

Never use `Weekend` as a canonical status. A scheduled day off may occur on any weekday, and a weekend may be a working day.

### Time Relation

| API value | Label |
| --- | --- |
| `past` | Past day |
| `today` | Today |
| `future` | Upcoming day |

`future` is not presence and must not be counted as absent.

### Work Mode

| API value | Employee label | Manager/report label |
| --- | --- | --- |
| `office` | Office | Office |
| `remote` | Remote | Remote |
| `hybrid` | Hybrid | Hybrid |
| `field` | Field work | Field work |
| `unknown` | Not specified | Not specified |

Do not use `WFH` as a day status. Use `Remote` as the display label and preserve `wfh` only as a temporary v1 compatibility value.

## Presence Status

| API value | Employee label | Manager label | Meaning |
| --- | --- | --- | --- |
| `not_expected` | Not scheduled | Not expected | Attendance is not expected for the resolved day kind |
| `not_started` | Not started | Not started | Today is a working day and no session has started yet |
| `working` | Working | Working | At least one session is currently open |
| `present` | Present | Present | Finalized work satisfies the minimum presence rule |
| `partial` | Partial attendance | Partial attendance | Some work exists but final presence requirement is not met |
| `absent` | Absent | Absent | Final working day has no qualifying attendance or approved coverage |
| `unknown` | Attendance unavailable | Attendance unresolved | System cannot determine presence; never silently map to absent |

`present` does not mean `on time`, `evidence verified`, `approved`, or `payroll eligible`.

## Punctuality Status

| API value | Employee label | Manager label | Applicability |
| --- | --- | --- | --- |
| `not_applicable` | Not applicable | Not applicable | No schedule boundary or presence event to compare |
| `on_time` | On time | On time | Arrival and departure meet policy |
| `late_arrival` | Late arrival | Late arrival | Arrival exceeds grace period |
| `early_departure` | Early departure | Early departure | Final departure precedes allowed boundary |
| `late_and_early` | Late arrival and early departure | Late and early | Both exceptions apply |
| `unknown` | Timing not confirmed | Timing unresolved | Required schedule/event data is unavailable |

Never label the whole day `Late`. Render `Present` plus `Late arrival` when both are true.

## Evidence Status

| API value | Employee label | Manager label | Guidance |
| --- | --- | --- | --- |
| `not_required` | No evidence required | Not required | Policy does not require this evidence type |
| `verified` | Location verified | Evidence verified | Required evidence passed server verification |
| `accepted_with_warning` | Location accepted with warning | Evidence warning | Event accepted despite a non-blocking evidence warning |
| `unavailable` | Location unavailable | Evidence unavailable | Permission, timeout, or platform prevented evidence collection |
| `outside_allowed_site` | Location needs review | Outside allowed site | Do not expose exact distance or coordinates |
| `low_accuracy` | Location accuracy needs review | Low-accuracy evidence | Accuracy did not meet configured threshold |
| `expired` | Location check expired | Evidence expired | Evidence is older than the allowed action window |
| `invalid` | Location could not be verified | Evidence invalid | Payload failed integrity or validation checks |
| `not_collected` | Location not collected | Evidence not collected | Collection was intentionally skipped by mode/context |

Avoid `Geo failed`, `Bad location`, `Suspicious`, and `Fraud` unless a separate investigated finding supports such language.

## Review Status

Use `review_status` rather than generic approval `status`.

| API value | Employee label | Manager queue label | Meaning |
| --- | --- | --- | --- |
| `not_required` | No review required | Not required | Attendance is final without human review |
| `pending` | Awaiting review | Needs review | Assigned reviewer has not decided |
| `returned` | More information needed | Returned to employee | Employee action is required before another decision |
| `approved` | Approved | Approved | Requested change/evidence exception was accepted |
| `rejected` | Not approved | Rejected | Requested change was declined |
| `cancelled` | Cancelled | Cancelled | Employee cancelled before a terminal decision |
| `superseded` | Replaced by a newer request | Superseded | A newer request is authoritative |

Notification subjects include the object: `Attendance request approved`, not simply `Approved`.

## Payroll Status

Attendance UI must not imply payroll impact before payroll evaluation.

| API value | Employee label | HR/payroll label | Meaning |
| --- | --- | --- | --- |
| `not_evaluated` | Payroll impact not calculated | Not evaluated | Payroll has not consumed the day |
| `eligible` | Counted for payroll | Eligible | Current attendance result is eligible under payroll rules |
| `pending_review` | Payroll impact pending review | Pending review | Attendance/review dependency prevents final calculation |
| `held` | Payroll processing on hold | Held | Authorized hold exists; do not expose confidential reason by default |
| `excluded` | Not counted for payroll | Excluded | Day is intentionally excluded by payroll rule |
| `finalized` | Payroll attendance finalized | Finalized | Payroll attendance input is locked for the period |
| `adjustment_required` | Payroll adjustment required | Adjustment required | A post-finalization attendance change needs payroll handling |

Do not use `Paid`, `Unpaid`, or `Salary deducted` unless the payroll domain has produced that authoritative result.

## Command Outcome

This dimension describes the immediate result of a mutation, not the day:

| API value | Employee title | Manager/audit label |
| --- | --- | --- |
| `accepted` | `{Action} recorded` | Accepted |
| `accepted_with_warning` | `{Action} recorded with a warning` | Accepted with warning |
| `provisional` | `{Action} recorded provisionally` | Provisional |
| `review_required` | `{Action} recorded; review required` | Review required |
| `rejected` | `{Action} was not recorded` | Rejected |

The response includes `event_created: boolean` so copy does not infer recording from the outcome label.

## Exception Taxonomy

Use exceptions for observed attendance facts, not workflow state.

| API value | Employee label | Manager/report label | Default severity |
| --- | --- | --- | --- |
| `late_arrival` | Late arrival | Late arrival | Warning |
| `early_departure` | Early departure | Early departure | Warning |
| `missing_clock_in` | Clock-in missing | Missing clock-in | Critical |
| `missing_clock_out` | Clock-out missing | Missing clock-out | Critical |
| `insufficient_work_duration` | Work duration below requirement | Insufficient work duration | Warning |
| `unexpected_attendance` | Attendance on a non-working day | Unexpected attendance | Warning |
| `overlapping_session` | Attendance session conflict | Overlapping session | Critical |
| `location_unavailable` | Location unavailable | Location evidence unavailable | Warning |
| `outside_allowed_site` | Location needs review | Outside allowed site | Warning |
| `location_low_accuracy` | Location accuracy needs review | Low location accuracy | Warning |
| `schedule_unresolved` | Schedule needs attention | Schedule unresolved | Critical |

Remove `correction` from exception type. Represent it as `request_type: attendance_correction`, with one or more linked exception codes when applicable.

## Reason-Code Copy Contract

Every command or review outcome includes a stable machine `reason_code`. The client maps known codes to localized copy and uses a safe fallback for unknown codes.

Example keys:

```text
attendance.outcome.accepted.clock_in.title
attendance.outcome.rejected.outside_window.body
attendance.presence.partial.label
attendance.punctuality.late_arrival.label
attendance.evidence.outside_allowed_site.employee_label
attendance.review.pending.employee_label
attendance.payroll.not_evaluated.label
attendance.exception.missing_clock_out.manager_label
```

Rules:

- Keys describe domain, dimension, value, audience when needed, and content role.
- API messages are diagnostic fallbacks, not primary localized UI copy.
- Unknown enum value: label `Status unavailable`, preserve raw value only in restricted diagnostics.
- Unknown reason code: `We could not explain this attendance result. Refresh the status or contact HR if it continues.`
- Variables are typed and formatted by locale; never build sentences by concatenating fragments.
- Dates, times, durations, names, and approver labels are variables, not embedded in translation keys.

## Primary Display Precedence

When space allows only one summary title, derive it in this order without discarding secondary dimensions:

1. Active command result that needs immediate user action.
2. `review_status` of `returned` or `pending`.
3. Critical exception.
4. Current `presence_status` (`working`, `not_started`).
5. Final `presence_status` (`present`, `partial`, `absent`, `not_expected`).

Punctuality, evidence, review, and payroll remain visible as secondary labeled facts. Never overwrite `Absent` with `Rejected` when the rejection refers only to a correction request.

## Tone and Forbidden Copy

Use factual, neutral, reversible language.

| Avoid | Use |
| --- | --- |
| `Punch successful` | `Clock-in recorded` |
| `Punch failed` | `Clock-in was not recorded` |
| `Geo failed` | `Location could not be confirmed` |
| `Outside fence` | `Outside allowed site` |
| `Pending` | `Awaiting attendance review` or the specific pending object |
| `Regularized` | `Attendance correction approved` |
| `Invalid attendance` | Specific exception or `Attendance unresolved` |
| `Absent w/o leave` | `Absent without approved leave` |
| `Salary deduction` | Authoritative payroll result only |
| `Rejected by system` | State the policy condition that prevented recording |

## Migration Mapping

| Current value | Target mapping |
| --- | --- |
| Day `present` | `presence_status=present`; punctuality independently resolved |
| Day `late` | `presence_status=present`, `punctuality_status=late_arrival`, exception `late_arrival` |
| Day `absent` | `presence_status=absent`; exception only when operational attention is needed |
| Day `wfh` | `work_mode=remote`; resolve presence separately |
| Day `leave` | `day_kind=approved_leave`, `presence_status=not_expected` |
| Day `weekend` | `day_kind=scheduled_off`, `presence_status=not_expected` |
| Day `holiday` | `day_kind=holiday`, `presence_status=not_expected` |
| Day `future` | `time_relation=future`; resolve day kind, leave presence as `not_started` or `not_expected` by contract |
| Exception `late` | `late_arrival` |
| Exception `early_out` | `early_departure` |
| Exception `missing_punch` | `missing_clock_in` or `missing_clock_out`; no ambiguous target |
| Exception `correction` | `request_type=attendance_correction`; preserve linked factual exception separately |
| Regularization `pending` | `review_status=pending` |
| Regularization `returned` | `review_status=returned` |

During v1 compatibility, adapters derive target dimensions and include a `mapping_quality` diagnostic of `exact`, `inferred`, or `unknown` in internal telemetry only. Ambiguous `missing_punch` must not be guessed when event order cannot identify the missing boundary.

## Implementation Ownership

- Backend/shared contract owns enum values and invariants.
- Frontend attendance domain owns typed copy maps and presentation composition.
- Localization files own human copy; route components do not embed status labels.
- Shared generic `StatusBadge` may own visual tones, but attendance passes an explicit canonical label and semantic tone.
- Reports and exports use the same canonical dictionary, with dimension-specific columns.

## Verification Matrix

- Contract tests enumerate every value and reject unknown request filters.
- Unit tests cover copy for employee, manager, HR/payroll, and unknown fallbacks.
- Migration tests cover every current day, exception, and regularization value.
- Reports prove `present + late` is not double-counted after normalization.
- Calendar tests show day kind, presence, and punctuality without conflicting labels.
- Accessibility tests prove labels remain understandable without color.
- Localization pseudo-locale tests detect truncation and concatenated fragments.
- Analytics schema tests reject raw labels, free text, and unknown high-cardinality values.

## Acceptance Criteria

- Presence, punctuality, evidence, review, payroll, day kind, work mode, and time relation are separate.
- Every canonical value has audience-appropriate copy and a localization-key pattern.
- Exceptions describe facts; correction remains a request type.
- `missing_punch` is split into clock-in and clock-out variants.
- Primary display precedence does not hide secondary state.
- Current v1 values have explicit migration mappings.
- Ambiguous and unknown values fail safely without misclassifying absence or payroll.

