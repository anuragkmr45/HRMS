# GEO-S10-010 Backend Implementation Sequencing Checklist

| Metadata | Value |
| --- | --- |
| Status | Planning artifact; no production behavior is changed by GEO-S10-010. |
| Domain | Attendance implementation sequencing |
| Owner | Tech lead during sprint planning |
| Commit / QA artifact | GEO-S10-010 |
| Source of truth | Current repository state, including `hrms_backend/src/modules/attendance/`, migrations, tests, OpenAPI, ADRs, and GEO-S10-009. |

## 1. Purpose

Implementation order is a correctness requirement for attendance, not a delivery preference. Deploying a route or command before its additive schema, tenant scope, idempotency record, runtime lock, or event contract exists can create broken sessions, inconsistent command outcomes, cross-company data exposure, unsafe replay, concurrent open sessions, incompatible consumers, or a mobile contract that cannot recover after a retry.

Existing manual attendance users must continue to use the current supported punch contract throughout this transition. Geo evidence and mobile-specific fields are additive capabilities, not prerequisites for manual check-in, check-out, break start, or break end. A replacement is not removable in the deployment that first introduces it.

## 2. Sequencing Principles

- [ ] Preserve existing manual attendance behavior until the replacement path is verified with regression, PostgreSQL integration, and compatibility evidence.
- [ ] Introduce and verify additive schema before any application code depends on it; review both forward migration and recovery/rollback procedures.
- [ ] Backfill and verify data before enforcing `NOT NULL`, unique, or foreign-key constraints.
- [ ] Scope every attendance query, command, constraint, lock, and idempotency resource by company.
- [ ] Establish durable idempotency, locking, and legal state transitions before geo commands reuse the command path.
- [ ] Keep GET and other read-only routes side-effect-free; materialization and repair belong to explicit commands or workers.
- [ ] Do not add coordinates, device metadata, mobile headers, or geo policy requirements to the existing manual punch contract.
- [ ] Keep manual and geo channel semantics, evidence, decisions, and reason codes explicit.
- [ ] Treat mobile contracts and OpenAPI schemas as versioned public contracts; clients submit evidence and the server decides state.
- [ ] Require observability, audit/outbox records, feature controls, disablement, and reconciliation paths before enabling a new mode.
- [ ] Do not run independent legacy and DB-first writes unless a tested reconciliation design makes one source authoritative.

## 3. Implementation Phases

### Phase 0 — Current-State Baseline and Compatibility Contract

**Entry:** planning begins before a behavior-changing attendance task.

- [ ] Inventory `POST /api/v1/attendance/punches`, punch/history, summary, calendar, regularization, exception, and export routes in `hrms_backend/src/modules/attendance/routes.ts` and `hrms_backend/src/platform/openapi.ts`.
- [ ] Record the current manual punch request/response, `Idempotency-Key` requirement, state transitions, policy windows, and user journeys.
- [ ] Identify dependencies on daily records, sessions, regularizations, holidays, attendance policy, auto-punch-out worker, dashboard/report readers, exports, and outbox consumers.
- [ ] Capture the baseline unit, integration, migration-history, schema-drift, OpenAPI, and manual API results before changing behavior.
- [ ] Write invariants: manual clients need no geo data; manual retries cannot duplicate a punch; the same user sees compatible response fields and state semantics.
- [ ] Define the company/location/policy/employee-group feature-control boundaries required for staged rollout.

**Exit gate:** existing manual behavior and compatibility expectations are documented and backed by passing baseline evidence.

### Phase 1 — Architecture and Migration Safety Foundation

**Entry:** Phase 0 baseline accepted.

- [ ] Confirm the bounded-context and DB-first direction in `docs/architecture/adr/attendance/01-attendance-bounded-context.md` and `docs/architecture/adr/attendance/02-postgreSQL-first-attendance-command-path` (the exact ADR-02 repository filename has no extension; GEO-S10-001/002 evidence).
- [ ] Run and require `pnpm db:verify:migration-history` and `pnpm db:verify:schema-drift` from `hrms_backend` in CI.
- [ ] Run `pnpm db:verify:no-cross-schema-fks`; identify and reject unsafe cross-schema dependencies.
- [ ] Review every migration for additive-first deployment, data backfill, constraint timing, failure handling, and recovery procedure.
- [ ] Ensure schema migrations ship and apply before the compatible application code that reads or writes them.

**Exit gate:** CI rejects migration-history/schema-drift violations, and schema-first deployment ordering is documented.

### Phase 2 — Tenant-Safe Attendance Data Model

**Entry:** Phase 1 gates pass.

- [ ] Preserve the GEO-S10-003 company scope foundation in migrations `0026_attendance_company_scope.sql` and `0028_finalize_attendance_company_scope.sql`.
- [ ] For any new table, add `company_id`, company-scoped indexes, and tenant-aware uniqueness before exposing the feature.
- [ ] Backfill legacy rows using an explicit, auditable resolver; fail rather than guess where company ownership is ambiguous.
- [ ] Measure and record backfill completeness before adding `NOT NULL` or final unique constraints.
- [ ] Verify every attendance query and mutation uses company scope, including regularizations, holidays, sessions, command records, evidence, decisions, workers, and reports.
- [ ] Add tenant-isolation integration tests for reads, commands, locks, and idempotency keys.

**Exit gate:** legacy records remain accessible and no attendance operation can cross a company boundary.

### Phase 3 — DB-First Session and Command State Foundation

**Entry:** Phase 2 tenant tests pass.

- [ ] Preserve GEO-S10-004 structures in `0029_attendance_command_transactions.sql`: sessions, employee command state, command executions, decisions, and the single-open-session index.
- [ ] Keep legal transitions centralized in `session-transition.ts` and cover allowed and denied transitions with unit tests.
- [ ] Route manual PostgreSQL punches through `AttendanceCommandService` and `PostgresAttendanceCommandRepository`; do not create a separate geo-only write path.
- [ ] Keep command execution, decision, session change, punch, projection, idempotency completion, and outbox insertion in one transaction.
- [ ] Do not introduce a parallel legacy write path unless its source of truth, reconciliation, and failure tests are explicitly approved.

**Exit gate:** manual punches use a durable DB-first state model while retaining their externally visible contract.

### Phase 4 — Idempotency and Replay Safety

**Entry:** Phase 3 command path is the authoritative manual write path.

- [ ] Preserve the GEO-S10-005 idempotency implementation/migration foundation in `command-service.ts`, `command-repository.ts`, and migrations `0030`–`0032`; preserve GEO-S10-007 PostgreSQL integration and concurrency verification in `attendance-command-idempotency.integration.test.ts`.
- [ ] Scope keys by attendance operation, company, and actor; canonical-hash all relevant command fields.
- [ ] Replay completed identical requests with the original response; reject an altered payload using the same key.
- [ ] Persist denied decisions and replay their deterministic outcome consistently.
- [ ] Define expiry and safe key-reuse behavior, including observability for expired reservations.
- [ ] Exercise the GEO-S10-007 PostgreSQL cases: completed-identical replay, changed-body rejection, denied-outcome replay, same textual key isolated by actor, expired-key replacement reservation, concurrent same-key serialization, and concurrent changed-body rejection.
- [ ] Retain parity expectations for supported memory tests without treating memory behavior as a substitute for PostgreSQL integration verification.

**Exit gate:** retries cannot create duplicate sessions/punches, and changed requests cannot claim an existing reservation.

### Phase 5 — Concurrency and Runtime Locking

**Entry:** Phase 4 idempotency tests pass.

- [ ] Preserve GEO-S10-006 locking through the employee command-state row and transaction-scoped row locks in `command-repository.ts`.
- [ ] Keep the partial unique single-open-session index as a database backstop; map index conflicts to stable domain errors.
- [ ] Serialize competing commands for one `(company_id, employee_user_id)` and keep locks clear of external calls.
- [ ] Test concurrent check-in, check-out, same-key retry, changed-body retry, separate employees, and lock-bypass unique-index protection using `attendance-runtime-lock.integration.test.ts` patterns.
- [ ] Document intentional error precedence between replay, policy rejection, chronology, transition, and conflict errors.

**Exit gate:** concurrent commands cannot create multiple open sessions or inconsistent command state.

### Phase 6 — Manual Attendance Stabilization

**Entry:** Phases 1–5 pass; geo code remains disabled/not exposed.

- [ ] Run the complete manual matrix: check-in/out, breaks, duplicates, denied transitions, overnight behavior, regularization, holidays, summaries, calendars, exceptions, exports, workers, audit events, dashboards, and reports.
- [ ] Verify manual OpenAPI and response compatibility; manual punches must not require coordinates, device metadata, or mobile-only headers.
- [ ] Complete or explicitly schedule the GEO-S10-009 blockers: GET purity, PostgreSQL regularization OCC, and operational shift resolution/09:30 removal.
- [ ] Mark each GEO-S10-009 item as **geo rollout blocker** or **post-geo cleanup**. GET mutation, regularization races, and shift-result inconsistency are blockers; no assumption may silently classify them otherwise.
- [ ] Replace or backlog in-memory optimistic concurrency and read-side materialization; worker-owned mutations must be explicit and observable.

**Exit gate:** manual attendance is stable on the DB-first command path and no geo requirement changes existing manual users.

### Phase 7 — Attendance Event and Audit Contract

**Entry:** manual mutations are stable and transactionally durable.

- [ ] Preserve GEO-S10-008 names, payload allowlists, schema version, aggregate IDs, and producer keys in `events.ts` and `docs/architecture/adr/attendance/05-attendance-outbox-event-contract.md`.
- [ ] Include schema version, company, actor, subject, aggregate, and command context where applicable; exclude raw location, device, request, and idempotency data from ordinary events.
- [ ] Verify memory and PostgreSQL producer paths emit equivalent allowed payloads.
- [ ] Verify transactional outbox durability, at-least-once delivery, consumer deduplication, replay expectations, and additive-field compatibility.
- [ ] Add mutation-to-event assertions for new geo decisions before rollout controls permit geo use.

**Exit gate:** each attendance mutation emits a stable, tenant-safe, versioned audit/event record.

### Phase 8 — Geo Domain Model and Policy Layer

**Entry:** Phase 6 manual stabilization and Phase 7 event gates pass.

- [ ] Model geo as a separate channel and evidence/decision path, consistent with ADR-03; geo evidence does not replace manual semantics.
- [ ] Define additive evidence fields: captured timestamp, received timestamp, coordinates, accuracy in meters, source, device metadata, mock/integrity signal, and policy/version identifiers.
- [ ] Define server-side work-site/geofence and policy resolution; route schemas pass evidence to a domain command, not generic route logic.
- [ ] Specify missing, stale, inaccurate, mocked, denied, and unavailable-location outcomes as deny, warning, or recorded exception with stable reason codes.
- [ ] Use additive, company-scoped migrations. Existing `0033_attendance_evidence_ledger.sql` is evidence-ledger groundwork, not proof that geo policy or geo commands are production-ready.
- [ ] Keep geo columns optional for historical/manual records, protect exact coordinates from normal APIs/logs/events, and record geo-specific decisions/reasons.

**Exit gate:** geo data and policies are modeled without changing the manual attendance contract.

### Phase 9 — Geo Command Integration

**Entry:** Phase 8 migrations, policy tests, and privacy review pass.

- [ ] Introduce explicit geo command variants or a versioned compatible extension; reject ambiguous commands that could become both manual and geo punches.
- [ ] Reuse tenancy, session transition, idempotency, runtime locking, command execution/decision, and event infrastructure from Phases 2–7.
- [ ] Persist submitted evidence and the server decision in the command transaction; geo validation must not bypass state transitions.
- [ ] Define mobile retry and decision replay behavior for network loss.
- [ ] Add PostgreSQL tests for geofence boundary, accuracy, stale timestamp, duplicate request, concurrent request, invalid transition, and policy denial.
- [ ] Gate enablement by company, work site, policy, or employee group; provide a configuration disablement that leaves manual attendance available.

**Exit gate:** geo commands have the same durable guarantees as manual commands and can be disabled independently.

### Phase 10 — Mobile API Readiness

**Entry:** Phase 9 command semantics and reason codes are stable behind rollout controls.

- [ ] Publish a versioned mobile attendance contract with `Idempotency-Key`, client request/event identifier, source channel, server time, device-captured time, and current session state.
- [ ] Define coordinate/accuracy units, metadata limits, authentication, rate limits, privacy-safe logging, retry/timeout/offline-queue behavior, and duplicate submission outcomes.
- [ ] Do not trust device claims for authorization; return stable machine-readable reason codes and next allowed action.
- [ ] Keep response shapes backward-compatible and free of UI assumptions; do not expose sensitive evidence through unrelated APIs.
- [ ] Update `hrms_backend/src/platform/openapi.ts`/generated contracts and add request/response contract tests and examples.

**Exit gate:** a mobile client can safely retry commands and recover its state from server responses.

### Phase 11 — Controlled Rollout and Migration

**Entry:** all preceding exit gates and production-readiness review pass.

- [ ] Deploy additive migrations first, then compatible backend code with geo disabled.
- [ ] Verify manual attendance health before enabling geo for internal/pilot companies.
- [ ] Monitor command conflicts, denials, duplicate/replay rates, lock contention, event delivery, worker behavior, and mobile retries.
- [ ] Expand incrementally with per-scope controls; retain a configuration rollback to manual attendance.
- [ ] Reconcile sessions, punches, decisions, evidence, projections, and outbox records before advancing rollout.
- [ ] Do not remove legacy behavior until usage, reconciliation, rollback testing, and compatibility evidence prove it unnecessary.

**Exit gate:** geo/mobile enablement is incremental and does not interrupt manual attendance.

### Phase 12 — Legacy Cleanup

**Entry:** rollout has met its agreed evidence and retention period.

- [ ] Remove compatibility, dual-read, and fallback paths only with an explicit owner, deadline, migration state, and client-usage evidence.
- [ ] Complete remaining GEO-S10-009 debt checkpoints and enforce final constraints only after old records/clients migrate.
- [ ] Update operational runbooks, ADRs, OpenAPI, monitoring, and migration/compatibility history.

**Exit gate:** no legacy path remains without an explicit compatibility reason, owner, and removal plan.

## 4. Dependency Matrix

| Sequence | Capability | Prerequisite | Blocking condition | Safe rollout mechanism | Verification evidence | Rollback path | Related task/reference |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Baseline contract | Current routes/tests/OpenAPI inventory | Unknown manual behavior | Documentation + baseline capture | Unit/integration/OpenAPI baseline | No behavior change | GEO-S10-010 |
| 1 | Architecture/migration safety | ADR review; migration guards | Drift/history/cross-schema failure | CI gate | `db:verify:migrations`, no-cross-schema guard | Halt code deploy | GEO-S10-001 — bounded-context architecture association verified; GEO-S10-002 — migration-safety association verified |
| 2 | Company scoping | Additive company columns/backfill | Any unscoped/ambiguous row or query | Additive migration then verified backfill | `0026`, `0028`, tenant tests | Compatible code, restore/recover migration plan | GEO-S10-003 |
| 3 | DB-first commands/sessions | Company scope | Parallel writes or missing transaction | Route only PostgreSQL commands to new path | `0029`, command/session tests | Keep verified manual route; do not dual-write | GEO-S10-004 |
| 4 | Idempotency | Durable command record | No canonical replay/hash behavior | Required header; transaction reservation | `0030`–`0032`, `attendance-command-idempotency.integration.test.ts` | Disable new caller/channel; retain records | GEO-S10-005 — implementation and migration foundation; GEO-S10-007 — PostgreSQL integration verification |
| 5 | Runtime locks | Command state + idempotency | Unmapped constraint conflict/race | Transactional lock + DB backstop | runtime-lock integration tests | Disable new mode; preserve lock/index | GEO-S10-006 |
| 6 | Manual stabilization | Phases 1–5 | GEO-S10-009 blockers unresolved | Geo disabled | Manual regression + worker/API evidence | Manual-only configuration | GEO-S10-009; future backlog IDs TBD by tech lead |
| 7 | Audit/outbox | Transactional mutation path | Unstable events or sensitive payload | Canonical allowlisted events | event-contract tests, ADR-05 | Keep event schema/version; do not rename history | GEO-S10-008 |
| 8 | Geo model/policy | Manual + audit stable | Mandatory geo fields or undefined policy | Additive schema; flags off | policy/evidence/privacy tests | Disable geo policy; retain evidence safely | Future backlog ID TBD by tech lead |
| 9 | Geo commands | Phases 2–8 | Bypass of command guarantees | Scope-based flags/pilot tenants | PostgreSQL concurrency/replay/policy tests | Disable geo; continue manual | Future backlog ID TBD by tech lead |
| 10 | Mobile contract | Stable geo/manual commands | Breaking/mobile-unsafe contract | Versioned OpenAPI contract | Contract/retry/limit tests | Maintain previous API version | Future backlog ID TBD by tech lead |
| 11–12 | Pilot/cleanup | All gates | No reconciliation/rollback proof | Gradual controls and owners | Production telemetry + reconciliation | Flag rollback; defer deletion | Future backlog IDs TBD by tech lead |

Repository evidence verifies the following scope associations: GEO-S10-001 for attendance bounded-context architecture (`01-attendance-bounded-context.md`); GEO-S10-002 for migration safety (migration verification scripts and CI-facing package commands); GEO-S10-003 through -006 for the labeled tenant, command, idempotency, and locking artifacts; GEO-S10-007 for PostgreSQL idempotency integration verification; GEO-S10-008 for the canonical outbox contract; and GEO-S10-009 for the read-purity, regularization, and shift cleanup checklist. GEO-S10-001 and -002 do not have standalone task-document labels in the inspected files, but their scope association is verified by repository artifacts. Future geo-model ownership remains genuinely unknown and is **TBD by tech lead**.

## 5. Unsafe Partial States to Avoid

| Prohibited state | User impact | Prevention gate |
| --- | --- | --- |
| Application code before its migration | Requests fail or partially persist | Schema-first deployment and migration verification |
| `NOT NULL` before verified backfill | Existing attendance becomes unreadable/unwritable | Completeness query and approved backfill |
| Tenant column without query scope | Cross-company attendance exposure or mutation | Tenant tests and company predicates |
| Independent legacy/DB-first writes | Divergent punches, sessions, projections, or events | One authoritative path or tested reconciliation |
| Geo fields mandatory for manual punches | Existing web/manual users cannot punch | Separate manual/geo schemas and regression test |
| Mobile retries without durable idempotency | Duplicate punches/sessions | Canonical hash and replay integration tests |
| Single-open-session index without domain mapping | Opaque 500 errors during races | Stable conflict mapping + concurrency test |
| Locks without concurrency tests | Production-only inconsistent state | PostgreSQL simultaneous-command tests |
| Geo policy before audit/event support | Unexplained denials and unsafe evidence trail | Decision/reason/outbox gate |
| Renamed events without compatibility | Consumers drop or misinterpret mutations | Versioned canonical contract and consumer review |
| Manual removal before proven geo rollout | Attendance outage for unsupported users | Pilot/reconciliation/rollback gate |
| Read-only route repairs/mutates attendance | Repeated GET changes punches/days/state | GEO-S10-009 GET-purity completion |
| Hard-coded attendance time affects clients | Incorrect late/absence/early-out decisions | Operational-shift resolver and compatibility tests |

## 6. Sprint Planning Checklist

For every future backlog item, the tech lead must confirm:

- [ ] Database prerequisite, migration order, backfill/constraint timing, and recovery procedure.
- [ ] API/OpenAPI/mobile contract impact and backward-compatibility strategy.
- [ ] Feature flag or rollout control, disablement behavior, and owner.
- [ ] Required unit, PostgreSQL integration, concurrency, migration, OpenAPI/mobile contract, and regression tests.
- [ ] Tenant isolation, idempotency/replay, locking/error precedence, audit/outbox, observability, and privacy requirements.
- [ ] Rollback/reconciliation strategy, documentation/runbook updates, accountable owner, and dependent backlog IDs.

## 7. Definition of Ready

A geo/mobile item is ready only when its prerequisites are complete; manual-attendance impact, schema rollout order, API compatibility, idempotency/concurrency behavior, audit/event behavior, feature controls/rollback, and test evidence are explicitly documented.

## 8. Definition of Done

A phase is done only when code, migrations, tests, OpenAPI, and documentation agree; manual regression, applicable PostgreSQL/concurrency, migration-history/schema-drift, and tenant-isolation checks pass; rollback/disablement is exercised or documented; no partial state can break manual users; and evidence is attached to its backlog item or PR.

## 9. Recommended Sprint Grouping

| Group | Scope | Execution rule |
| --- | --- | --- |
| Foundation and blockers | Migration guards, tenant gaps, command transaction defects | Sequential before feature work |
| Manual stabilization | GEO-S10-009 GET purity, regularization OCC, shifts | May split internally only after shared schema/command ownership is agreed; must complete before geo enablement |
| Geo data and policy | Additive evidence, sites/geofences, policy/reason model | Can design in parallel with manual stabilization; cannot enable or integrate commands before it completes |
| Geo command implementation | Command variant, persistence, replay/lock/event reuse | Sequential after manual stabilization, geo model, and audit gates |
| Mobile contract readiness | Versioned schemas, examples, retry/limits/privacy tests | Can prepare contracts alongside geo command work; release only after command semantics stabilize |
| Pilot rollout | Disabled-by-default deploy, internal/pilot flags, telemetry/reconciliation | Sequential after all product/operational gates |
| Legacy cleanup | Remove fallbacks and enforce final constraints | Sequential after pilot success and compatibility evidence |

## 10. Final Planning Decision Summary

**Critical path:** migration safety → tenant scope → DB-first session/command model → durable idempotency → runtime locking → manual stabilization/GEO-S10-009 blockers → canonical audit/outbox → geo policy/model → geo command integration → versioned mobile contract → pilot rollout → cleanup.

**Earliest safe geo development:** policy/data-model design may begin in parallel after the DB-first foundations are accepted, but geo command implementation must wait for manual stabilization and audit/event gates.

**Earliest safe mobile integration:** after a versioned contract has stable idempotency, retry, session-state, reason-code, privacy, and OpenAPI contract evidence; this is not established merely by current `source: mobile` enum support.

**Before geo production enablement:** all Phase 6–10 gates must pass, including company-scoped rollout controls, PostgreSQL concurrency/replay tests, audit/event evidence, observability, reconciliation, and configuration rollback to manual attendance.

**Before legacy removal:** pilot usage, client migration, reconciliation, rollback exercise, retention requirements, and an explicitly approved cleanup plan must prove the legacy path is no longer required.

## Evidence Locations

- Attendance module/routes/services/repositories/tests: `hrms_backend/src/modules/attendance/`.
- PostgreSQL command path: `command-service.ts`, `command-repository.ts`, and `session-transition.ts` in that module.
- Attendance migrations: `hrms_backend/src/db/migrations/0003_attendance.sql`, `0026_attendance_company_scope.sql`, `0028_finalize_attendance_company_scope.sql`, `0029_attendance_command_transactions.sql`, `0030`–`0033`.
- Auto-punch-out and outbox workers: `hrms_backend/src/workers/` and worker tests.
- Current API contract: `hrms_backend/src/platform/openapi.ts` and `hrms_backend/docs/api/openapi.json`.
- Architecture/event direction: `docs/architecture/adr/attendance/`.
- Current cleanup blockers: `docs/implementation/GEO-S10-009-attendance-read-only-risk-cleanup-checklist.md`.

## Unresolved Task/Backlog Mappings

1. GEO-S10-001 and GEO-S10-002 have verified scope associations but no standalone task-document label in the inspected files; this is a documentation-traceability gap, not unknown ownership.
2. Future implementation IDs for GET purity, PostgreSQL regularization OCC, operational shifts, geo policy, geo command integration, mobile contract, pilot rollout, and cleanup are **TBD by tech lead**.
3. Tech lead/product must classify each GEO-S10-009 checkpoint as a geo rollout blocker or deferred post-geo work and approve fallback behavior for employees without an operational shift assignment.
