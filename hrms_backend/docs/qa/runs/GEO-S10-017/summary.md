# GEO-S10-017 QA Summary

Date: 2026-07-20
Branch: `GEO-S10-017`
Owner: Pratik
Domain: Frontend Role and Route Access
Story points: 5

## Deliverable

Created `hrms-client/docs/attendance/GEO-S10-017-role-route-access-plan.md`.

## Evidence Reviewed

- Frontend role normalization, active-role switching, and module map.
- App authentication/onboarding route shell.
- Attendance layout, overview, calendar, and exceptions route checks.
- Backend attendance route, service, and policy enforcement.

## Findings

- Managers receive a team overview but are blocked from the manager-capable exception queue.
- Auditors can read attendance under backend policy but have no frontend attendance module.
- Project manager maps to backend Reviewer, making label-based authorization unsafe.
- Role arrays are duplicated and direct-route checks can diverge from tab visibility.

## Decision

Use server-derived operation capabilities for attendance tabs, route loaders, query enablement, and controls. Keep tenant, hierarchy, subject, self-approval, and mutation authorization on the backend.

## Verification

- Run `git diff --check`.
- Confirm each current attendance role constant and route is represented in the audit.
- Confirm employee, manager, HR, Admin, Auditor, Director, and Project Manager outcomes are specified.
- Confirm direct API, cross-tenant, out-of-hierarchy, active-role switch, and deep-link tests are included.

