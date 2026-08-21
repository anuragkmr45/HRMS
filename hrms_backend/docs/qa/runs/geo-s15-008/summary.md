# GEO-S15-008 Release Branch Stabilization

## Scope And Objective

GEO-S15-008 is the Sprint 15 backend release stabilization artifact. It consolidates the backend release checklist, migration order, rollback/recovery notes, QA coordination points, frontend contract handoff, deployment considerations, release-blocker classification, and final merge-readiness status for the Sprint 15 release branch.

This task is documentation-only. Feature work, refactoring, technical-debt cleanup, performance redesign, schema changes, migration changes, frontend implementation, worker changes, infrastructure changes, configuration changes, and unrelated improvements are out of scope unless a proven release blocker requires a separately approved fix.

## Release Context

- Branch inspected for this task: `sprint-15/geo-s15-008`.
- GEO-S15-008 implementation output: this QA/release summary only.
- Static repository inspection found no confirmed release blocker in tracked files at the time this artifact was prepared.
- A clean working tree is useful context but is not release approval and does not by itself establish merge readiness.
- Local GEO-S15-008 release stabilization verification has now been recorded below. Hosted QA/deployment checks remain part of normal release execution before production release.

## Migration Order

Repository behavior:

- Migration files are discovered from `src/db/migrations` or `dist/src/db/migrations` and executed in filename-sorted order by `discoverMigrations` in `hrms_backend/scripts/db-migration-lib.ts`.
- Applied migration state is recorded in `platform.schema_migrations`.
- Migration checksums are immutable. A checksum mismatch fails validation and requires a new forward migration.
- Out-of-order pending migrations fail validation; older history must not be inserted behind already-applied migrations.
- The runner applies each pending migration in a transaction and records the migration in the ledger only after the SQL succeeds.
- No down migrations are defined or proposed for this release task.

Current migration chain:

1. `0001_initial.sql`
2. `0002_auth_onboarding.sql`
3. `0003_attendance.sql`
4. `0004_leave_wfh.sql`
5. `0005_ems.sql`
6. `0006_projects.sql`
7. `0007_helpdesk.sql`
8. `0008_notifications.sql`
9. `0009_asset_workflows.sql`
10. `0010_admin_company_profile.sql`
11. `0011_admin_master_data.sql`
12. `0012_admin_rbac.sql`
13. `0013_admin_workflows.sql`
14. `0014_admin_policies.sql`
15. `0015_admin_email_templates.sql`
16. `0016_admin_notification_channels.sql`
17. `0017_admin_security_settings.sql`
18. `0018_ems_admin_workflows.sql`
19. `0019_asset_vendor_recovery_workflows.sql`
20. `0020_resend_email_delivery.sql`
21. `0021_core_profile_photos.sql`
22. `0022_company_profile_logo.sql`
23. `0023_admin_extended_master_data.sql`
24. `0024_department_cost_center.sql`
25. `0025_company_scoped_master_policy.sql`
26. `0026_attendance_company_scope.sql`
27. `0027_company_scoped_holiday_uniqueness.sql`
28. `0028_finalize_attendance_company_scope.sql`
29. `0029_attendance_command_transactions.sql`
30. `0030_platform_attendance_idempotency_guard.sql`
31. `0031_attendance_command_platform_idempotency_reference.sql`
32. `0032_attendance_legacy_idempotency_unique_index.sql`
33. `0033_attendance_evidence_ledger.sql`
34. `0034_attendance_break_segments_and_completed_state.sql`
35. `0035_attendance_command_provenance.sql`
36. `0036_attendance_shift_templates.sql`
37. `0037_attendance_policy_versions.sql`
38. `0038_attendance_daily_summary_dimensions.sql`
39. `0039_attendance_command_decision_completed_state.sql`
40. `0040_regularization_normalized_items_actions.sql`
41. `0041_enable_postgis_btree_gist.sql`
42. `0042_work_sites_geofences.sql`
43. `0043_geofence_publish_validate.sql`
44. `0044_attendance_location_evidence_runtime.sql`
45. `0045_attendance_geo_policy_modes.sql`
46. `0046_attendance_web_geo_source.sql`
47. `0047_location_access_audit_retention.sql`
48. `0048_attendance_command_client_event_id.sql`
49. `0049_registered_devices.sql`
50. `0050_attendance_mobile_source_channels.sql`
51. `0051_attendance_attestation_evidence.sql`
52. `0052_attendance_projection_rebuild_runs.sql`
53. `0053_attendance_daily_dimension_checks.sql`
54. `0054_attendance_offline_event_inbox.sql`
55. `0055_attendance_offline_sequence_security.sql`
56. `0056_registered_device_key_versions.sql`
57. `0057_attendance_location_retention_actions.sql`
58. `0058_registered_devices_rls.sql`
59. `0059_attendance_payroll_period_locks.sql`

Sprint 15 migration callouts:

- `0058_registered_devices_rls.sql` enables and forces row-level security on `platform.registered_devices` with the `platform_registered_devices_company_isolation` policy keyed by transaction-local `app.current_company_id`.
- `0059_attendance_payroll_period_locks.sql` adds attendance payroll periods, payroll period actions, payroll attendance snapshots, payroll attendance adjustments, and related constraints/indexes.
- `0059_attendance_payroll_period_locks.sql` depends on `btree_gist`, which is enabled earlier by `0041_enable_postgis_btree_gist.sql`.

## Backend Release Checklist

The checks below record the GEO-S15-008 evidence available for backend merge readiness. Hosted target-environment readiness, real adapter checks, and operational smoke remain required before production release.

| Gate | Command or evidence source | Status |
| --- | --- | --- |
| Apply pending migrations | `DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate` | PASS: `0 applied, 59 already applied` |
| Migration history and checksum validation | `DATABASE_URL="$TEST_DATABASE_URL" pnpm db:verify:migrations` | PASS: migration history verified for 59 files |
| Schema drift validation | `DATABASE_URL="$TEST_DATABASE_URL" pnpm db:verify:migrations` | PASS: schema drift passed |
| Migration status | `DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate:status` | PASS: `59 applied, 0 pending` |
| Backend typecheck | `pnpm typecheck` | PASS |
| Build compilation | `pnpm exec tsc -p tsconfig.build.json` | PASS |
| Alias processing | `pnpm exec tsc-alias -p tsconfig.build.json` | PASS |
| Migration packaging | copied `src/db/migrations/*.sql` to `dist/src/db/migrations` | PASS: 59 files |
| API docs verification | `pnpm api:docs:verify` | PASS |
| Frontend API consumer verification | `pnpm api:consumer:verify` | PASS |
| Contract tests | contract test project | PASS |
| Integration tests | integration test project | PASS |
| Diff whitespace check | `git diff --check` | PASS |
| Cross-schema FK validation | `pnpm db:verify:no-cross-schema-fks` | KNOWN BASELINE: historical violations only in `0036_attendance_shift_templates.sql` and `0037_attendance_policy_versions.sql`; technical lead instructed proceed |
| Backend lint | `pnpm lint` | KNOWN BASELINE: historical repository findings; no Sprint 15 lint regression identified |
| Full backend test aggregate | `pnpm test` | KNOWN BASELINE: stops during unit tests with 485/488 passing; three deterministic pre-existing failures documented below |
| Backend E2E aggregate | `pnpm test:e2e` | KNOWN BASELINE: production-user-flow smoke reaches existing attendance punch fixture and fails with HTTP 400 validation; outside GEO-S15-008 scope |
| Windows package build wrapper | `pnpm build` on Windows | KNOWN BASELINE: fails only at POSIX shell packaging commands; TypeScript build, alias processing, and migration packaging independently verified |
| Release DB verification | `pnpm release:verify:db` | NORMAL RELEASE EXECUTION: verify where real target adapters are available |
| Release service verification | `pnpm release:verify:services` | NORMAL RELEASE EXECUTION: verify where Valkey and object storage are available |
| Release adapter verification | `pnpm release:verify:adapters` | NORMAL RELEASE EXECUTION: verify where real target adapters are available |
| Release UAT automation | `pnpm release:uat` or environment-specific QA/UAT script | NORMAL RELEASE EXECUTION |
| API/worker compatibility | Confirm API and worker deploy from compatible commits | NORMAL RELEASE EXECUTION |
| Readiness smoke | `/api/v1/health/ready` in target environment | NORMAL RELEASE EXECUTION |
| Environment correctness | Confirm `APP_ENV`, `NODE_ENV`, `DATABASE_URL`, `VALKEY_URL`, Cloudinary, CORS, cookie, and email settings match target environment docs | NORMAL RELEASE EXECUTION |
| QA handoff | Confirm QA has changed APIs, migrations, release-sensitive areas, known risks, and blocker policy | REQUIRED BEFORE PRODUCTION RELEASE |
| Frontend handoff | Confirm frontend/QA use current OpenAPI/frontend-contract artifacts and registered-device/offline-sync expectations | REQUIRED BEFORE PRODUCTION RELEASE |

## Known Baseline Findings

These findings are documented as pre-existing or environment-specific baseline issues. They are not classified as Sprint 15 release blockers for GEO-S15-008.

1. `pnpm db:verify:no-cross-schema-fks` reports historical violations only in `0036_attendance_shift_templates.sql` and `0037_attendance_policy_versions.sql`. These predate Sprint 15. The issue was raised with the technical lead, who instructed the team to proceed.
2. `pnpm lint` reports historical repository findings. Git comparison against `sprint-14/geo-s14-009` confirmed the reported files are pre-existing relative to Sprint 15 except `scripts/api-docs-verify.ts`; the Sprint 15 diff there only added payroll-period endpoint verification entries and did not introduce the reported frontend-only monorepo reference. No Sprint 15 lint regression was identified.
3. `pnpm test` stops during unit tests with 485/488 passing. Three deterministic failures remain in `auth-email-delivery.unit.test.ts`, `dashboard.unit.test.ts`, and `projects.unit.test.ts`. Git comparison against `sprint-14/geo-s14-009` confirms the affected modules and failing test files were not changed during Sprint 15.
4. `pnpm test:e2e` reaches the production-user-flow smoke but fails on the existing attendance punch fixture with HTTP 400 validation. `production-user-flows.e2e.test.ts` was not changed during Sprint 15. This is an existing baseline E2E issue outside GEO-S15-008 scope; do not modify the E2E test or attendance implementation in this task.
5. `pnpm build` on Windows fails only at the POSIX shell packaging commands, `mkdir -p` and `cp`. TypeScript build, `tsc-alias`, and migration packaging were independently verified successfully. This is a local Windows shell portability limitation, not a Sprint 15 backend build regression.

## Rollback And Recovery Notes

Repository-supported rollback strategy:

- Treat migrations as forward-oriented unless a specific migration explicitly documents a safe rollback.
- Stop deployment when a bad migration is detected.
- Preserve and verify the affected database backup or provider snapshot.
- Prefer a forward corrective migration for bad schema or data changes.
- Restore the database only when necessary, with business acceptance of data-loss risk and a verified backup.
- Keep API and worker deploys compatible. Roll back API and worker together where possible if runtime, schema, outbox, or payload mismatch is suspected.
- Do not bulk-delete Cloudinary folders during rollback unless the release owner confirms uploaded assets were created only by the failed release and are safe to remove.
- Do not invent down migrations or destructive cleanup for GEO-S15-008.

## QA Coordination

QA should focus on release-sensitive Sprint 15 behavior already evidenced by repository tests and artifacts rather than expanding scope into new feature work.

Release-sensitive areas:

- Registered-device RLS isolation: `0058_registered_devices_rls.sql`, `hrms_backend/src/platform/tenant-db-context.ts`, and `hrms_backend/src/platform/__tests__/registered-devices-rls.integration.test.ts`.
- Mobile registered-device enforcement: `hrms_backend/src/modules/attendance/command-service.ts`, `hrms_backend/src/modules/attendance/offline-sync-service.ts`, and generated OpenAPI/frontend-contract docs.
- Offline sync replay/conflict/deferred handling: `hrms_backend/src/modules/attendance/offline-sync-service.ts` and `hrms_backend/src/modules/attendance/__tests__/offline-sync.integration.test.ts`.
- Payroll period create/lock/unlock/summary behavior: `hrms_backend/src/modules/attendance/payroll-period-service.ts`, `hrms_backend/src/modules/attendance/routes.ts`, and `hrms_backend/src/modules/attendance/__tests__/attendance.integration.test.ts`.
- Projection rebuild behavior with locked payroll: `hrms_backend/src/modules/attendance/projection-rebuild-service.ts` and `hrms_backend/src/modules/attendance/__tests__/attendance-projection-rebuild.integration.test.ts`.
- Worker/log redaction safety: `hrms_backend/src/workers/safe-error.ts`, `hrms_backend/src/workers/outbox-worker.ts`, `hrms_backend/src/workers/run-outbox-worker.ts`, and `hrms_backend/docs/qa/runs/geo-s15-007/summary.md`.

QA handoff must include backend APIs changed, DB migrations changed, known risks/blockers, release-gate P0 expectations, and evidence references. Any failed P0, unwaived release blocker, unsafe production-testing request, failed migration verification, readiness-smoke failure, or API/worker incompatibility should prevent release approval until resolved or formally waived.

## Frontend Coordination

GEO-S15-008 introduces no frontend feature implementation. Coordination is still required because Sprint 15 backend contracts affect frontend and mobile integration behavior.

Frontend and QA should use the current generated contract pack:

- `hrms_backend/docs/api/openapi.json`
- `hrms_backend/docs/api/frontend-contract/openapi.json`
- `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`
- `hrms_backend/docs/api/API_ATTENDANCE_MIGRATION_GUIDE.md`

Compatibility expectations:

- Platform device endpoints are part of the current contract for mobile installation registration and device lifecycle.
- Attendance mobile source channels require a valid registered device where the backend enforces it.
- `POST /api/v1/attendance/offline-sync` requires the offline sync envelope, stable `client_event_id`, monotonic device sequence semantics, and registered-device context.
- Accepted offline events are provisional and must not be treated by clients as immediate authoritative payroll finalization.
- Frontend/API consumers should not infer that no coordination is needed merely because GEO-S15-008 itself changes only documentation.

## Deployment And Environment Considerations

Repository-confirmed deployment considerations:

- Render API services use `pnpm db:migrate:prod` as the backend pre-deploy command.
- Render worker services use `pnpm worker:start`; API and worker must deploy from compatible commits.
- Hosted dev, QA, and production require environment-specific PostgreSQL, Valkey, and object-storage configuration.
- QA and production must not use API mock fallback or mock Cloudinary storage.
- `/api/v1/health/live` is used for service health checks; `/api/v1/health/ready` is the documented readiness smoke because it checks PostgreSQL, Valkey, and object storage.
- `0041_enable_postgis_btree_gist.sql` requires migration-role ability to enable/use `postgis` and `btree_gist`; provider support alone is not sufficient without target-environment verification.
- Environment-specific values such as `APP_ENV`, `NODE_ENV`, `DATABASE_URL`, `VALKEY_URL`, `CLOUDINARY_*`, `CORS_ALLOWED_ORIGINS`, cookie security, and email delivery mode must match the target environment documentation before release.

## Release Blockers And Non-Blockers

Confirmed current blocker classification:

- No confirmed Sprint 15 release blocker remains.
- GEO-S15-008 introduces no code, schema, configuration, frontend, worker, or infrastructure changes.
- Known pre-existing baseline issues are documented above and intentionally not expanded into this task.
- Hosted QA/deployment checks such as target-environment readiness, real adapters, and operational smoke remain part of normal release execution before production release.

Blockers if observed during verification:

- Migration apply/history/drift/checksum failure.
- Missing required PostGIS or `btree_gist` support in the target database role/environment.
- New Sprint 15 cross-schema FK regression beyond the documented historical baseline.
- New Sprint 15 lint, typecheck, build, automated test, API docs verification, API consumer verification, or required release adapter regression.
- Failed `/api/v1/health/ready` readiness smoke.
- API and worker running incompatible commits.
- Wrong target environment configuration, shared DB/Valkey across environments, mock Cloudinary in QA/production, or incorrect CORS/cookie settings.
- Failed P0 QA without approved waiver.

Non-blocking and out of scope for GEO-S15-008:

- Unrelated technical debt.
- Performance redesign, partitioning, or index changes without measured release-blocker evidence.
- Historical cleanup of pre-existing `platform.outbox_events.last_error` values.
- Future exact-coordinate public routes.
- Future dynamic RBAC assignment or enforcement migration.
- New frontend implementation.
- New rollback mechanisms or down migrations.

## Final Merge Readiness

Status model:

- `READY`: required release gates have passed, QA/frontend handoff is complete, and no release blockers remain.
- `BLOCKED`: a release blocker remains unresolved or unwaived.

Current GEO-S15-008 status: `READY FOR MERGE - no confirmed Sprint 15 release blocker; known pre-existing baseline issues documented. Hosted QA/deployment checks remain required before production release.`

## Files Inspected Or Referenced

- `hrms_backend/package.json`
- `hrms_backend/scripts/db-migration-lib.ts`
- `hrms_backend/scripts/db-migrate.ts`
- `hrms_backend/scripts/db-migration-status.ts`
- `hrms_backend/scripts/verify-migration-history.ts`
- `hrms_backend/scripts/verify-schema-drift.ts`
- `hrms_backend/scripts/verify-release-db.ts`
- `hrms_backend/scripts/verify-release-services.ts`
- `hrms_backend/scripts/verify-release-adapters.ts`
- `hrms_backend/src/db/migrations/0041_enable_postgis_btree_gist.sql`
- `hrms_backend/src/db/migrations/0058_registered_devices_rls.sql`
- `hrms_backend/src/db/migrations/0059_attendance_payroll_period_locks.sql`
- `hrms_backend/src/modules/attendance/command-service.ts`
- `hrms_backend/src/modules/attendance/offline-sync-service.ts`
- `hrms_backend/src/modules/attendance/payroll-period-service.ts`
- `hrms_backend/src/modules/attendance/projection-rebuild-service.ts`
- `hrms_backend/src/modules/attendance/routes.ts`
- `hrms_backend/src/platform/tenant-db-context.ts`
- `hrms_backend/src/workers/safe-error.ts`
- `hrms_backend/src/workers/outbox-worker.ts`
- `hrms_backend/src/workers/run-outbox-worker.ts`
- `hrms_backend/docs/api/openapi.json`
- `hrms_backend/docs/api/frontend-contract/openapi.json`
- `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`
- `hrms_backend/docs/api/API_ATTENDANCE_MIGRATION_GUIDE.md`
- `hrms_backend/docs/qa/runs/geo-s15-007/summary.md`
- `docs/deployment/rollback-runbook.md`
- `docs/deployment/hosted-deployment.md`
- `docs/deployment/deployment-verification-checklist.md`
- `docs/deployment/environment-matrix.md`
- `docs/runbooks/worker-operations-runbook.md`
- `docs/runbooks/health-and-smoke-runbook.md`
- `docs/process/qa-handoff-process.md`
- `docs/process/release-governance.md`
- `.github/workflows/branch-ci-cd.yml`
