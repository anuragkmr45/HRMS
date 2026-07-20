# GEO-S10-020 QA Summary

Date: 2026-07-20
Branch: `GEO-S10-020`
Owner: Pratik
Domain: Attendance Status and Exception Copy
Story points: 3

## Deliverable

Created `hrms-client/docs/attendance/GEO-S10-020-status-exception-copy-normalization.md`.

## Evidence Reviewed

- Backend attendance day and regularization enums.
- Exception generation, queue response, reports, and summary counts.
- Frontend calendar labels, attendance summaries, exception queues, and shared status badge.
- `GEO-S10-019` employee and manager result copy.

## Key Findings

- The current day status mixes presence, punctuality, work mode, schedule disposition, and time relation.
- `missing_punch` does not identify which boundary is missing.
- `correction` is a request type rather than an observed exception.
- Generic `Pending`, `Returned`, and `Rejected` labels omit the affected attendance object.

## Decision

Normalize independent day kind, time relation, work mode, presence, punctuality, evidence, review, and payroll dimensions. Keep exception codes factual and use stable reason-code-driven localized copy.

## Verification

- Run `git diff --check`.
- Confirm every current day, exception, and regularization value has a migration mapping.
- Confirm employee, manager, and HR/payroll copy is specified.
- Confirm unknown values and ambiguous `missing_punch` fail safely.

