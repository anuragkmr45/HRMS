# GEO-S10-019 QA Summary

Date: 2026-07-20
Branch: `GEO-S10-019`
Owner: Pratik
Domain: Attendance State Wireframes and Copy
Story points: 5

## Deliverable

Created `hrms-client/docs/attendance/GEO-S10-019-attendance-state-wireframes-copy.md`.

## Coverage

- Employee desktop and mobile attendance action/result layouts.
- Manager desktop split view and mobile list/detail flow.
- Accepted, accepted with warning, provisional, review required, rejected, and uncertain results.
- Browser location permission, denial, fallback, unavailable, and timeout states.
- Decision dialogs, loading, empty, error, responsive, accessibility, privacy, and analytics requirements.

## Key Decisions

- Persistent server outcome, not toast or HTTP status, is the source of truth.
- Copy always states whether an attendance event was recorded.
- Manager decisions use record-level allowed actions and meaningful remarks.
- Exact coordinates, distances, thresholds, and internal risk data are never displayed.

## Verification

- Run `git diff --check`.
- Confirm all six employee result states and all manager variants are present.
- Confirm desktop/mobile and location-permission wireframes are present.
- Confirm every rejected state distinguishes retryable from deterministic policy blocks.
