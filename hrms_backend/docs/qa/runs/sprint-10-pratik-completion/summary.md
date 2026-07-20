# Sprint 10 Pratik Completion Index

Date: 2026-07-20
Base branch: `dev` at `f08ac6a`
Final branch: `GEO-S10-021`
Scope: `GEO-S10-011` through `GEO-S10-021`

## Delivery Model

Each task has an exact task-ID branch and focused commit. Branches are stacked in task order, so `GEO-S10-021` contains the complete Sprint 10 Pratik artifact set while each earlier branch remains independently reviewable at its task commit.

Sprint 10 tasks are architecture, UX, contract, security, copy, and QA planning deliverables. Runtime v2 routes and frontend behavior were intentionally not published before their schemas, services, authorization, persistence, and tests are implemented together.

## Task Index

| Task | Branch | Commit | Primary artifact |
| --- | --- | --- | --- |
| `GEO-S10-011` | `GEO-S10-011` | `1c8b38e` | `docs/api/ATTENDANCE_OPENAPI_REWRITE_PLAN.md` |
| `GEO-S10-012` | `GEO-S10-012` | `317da4a` | `hrms-client/docs/attendance/GEO-S10-012-context-api-ux-plan.md` |
| `GEO-S10-013` | `GEO-S10-013` | `4f1c201` | `hrms-client/docs/attendance/GEO-S10-013-admin-policy-ux-spec.md` |
| `GEO-S10-014` | `GEO-S10-014` | `e384b38` | `hrms-client/docs/attendance/GEO-S10-014-manual-frontend-architecture.md` |
| `GEO-S10-015` | `GEO-S10-015` | `b4467f2` | `hrms-client/docs/attendance/GEO-S10-015-regularization-manager-ux-plan.md` |
| `GEO-S10-016` | `GEO-S10-016` | `864c4cd` | `hrms-client/docs/attendance/GEO-S10-016-geolocation-permissions-policy-plan.md` |
| `GEO-S10-017` | `GEO-S10-017` | `c032405` | `hrms-client/docs/attendance/GEO-S10-017-role-route-access-plan.md` |
| `GEO-S10-018` | `GEO-S10-018` | `4748824` | `hrms-client/docs/attendance/GEO-S10-018-api-client-idempotency-plan.md` |
| `GEO-S10-019` | `GEO-S10-019` | `abb52d7` | `hrms-client/docs/attendance/GEO-S10-019-attendance-state-wireframes-copy.md` |
| `GEO-S10-020` | `GEO-S10-020` | `f1c2a75` | `hrms-client/docs/attendance/GEO-S10-020-status-exception-copy-normalization.md` |
| `GEO-S10-021` | `GEO-S10-021` | `185ae20` | `docs/qa/fixtures/ATTENDANCE_WEB_FIXTURE_PLAN.md` and matrix JSON |

Every task also has a review summary at `docs/qa/runs/<task-id>/summary.md`.

## Implementation Order

The artifacts define this production sequence:

1. Implement versioned persistence, policy assignment, authorization, idempotency reservation, command service, and OpenAPI contract.
2. Add server-driven attendance context and typed capability responses.
3. Add shared frontend status/copy and idempotent mutation infrastructure.
4. Implement the common employee action panel, manual flow, and uncertain-outcome reconciliation.
5. Enable one-shot geolocation behind release-gated document headers and policy modes.
6. Implement employee regularization and manager/auditor queue/detail experiences.
7. Implement draft/publish policy administration.
8. Load the synthetic fixture matrix and execute contract, browser, security, privacy, timezone, and cross-browser suites.
9. Run shadow comparison and staged rollout before v1 deprecation.

## Cross-Artifact Decisions

- The backend is the sole authority for tenant, hierarchy, subject, policy, and mutation authorization.
- Attendance context drives available actions, evidence mode, capabilities, warnings, and copy reason codes.
- Manual attendance remains a first-class mode; geolocation is never assumed.
- Browser location is one-shot and user-initiated; `watchPosition` is prohibited.
- API/docs keep `geolocation=()`; the first-party frontend document may use `geolocation=(self)` only at release readiness.
- One user action owns one idempotency key across equivalent retries; changed requests require new keys.
- Presence, punctuality, work mode, evidence, review, payroll, day kind, and time relation are independent dimensions.
- Managers receive hierarchy/assignment-scoped queues; auditors are read-only; self-approval and cross-tenant access are blocked.
- Raw coordinates, keys, credentials, free text, and sensitive evidence are excluded from general responses, storage, logs, analytics, and QA evidence.

## Verification Results

- 11 exact task branches present with expected commit subjects.
- 11 task QA summaries present.
- 9 frontend attendance planning artifacts plus API contract and QA fixture plans present.
- `git diff --check` passes for the complete stack.
- All created text/JSON artifacts contain ASCII only.
- Fixture JSON parses successfully.
- Fixture reference audit passes: 2 tenants, 15 users, 3 shifts, 6 policies, 5 evidence samples, and 28 scenarios.
- No versioned `/api/v2/attendance` route is published in runtime source or OpenAPI.
- Diff from `dev` contains no runtime source, dependency, generated, environment, or lockfile changes.

Application test suites were not run because this sprint changed no runtime code. The fixture matrix is structurally validated; v2 scenario execution is explicitly pending implementation and must not be reported as passed before linked CI evidence exists.

## Review Guidance

- Review each branch for its task-specific deliverable.
- Review `GEO-S10-021` for integration consistency across all Sprint 10 decisions.
- Merge the stack in order or merge only the final stacked branch, but do not merge each branch independently into a target that already contains its ancestor commits without checking duplicate PR scope.
- Update tracker status with branch, commit, artifact, and CI link rather than free-form `Done` or `Tested successfully` claims.

