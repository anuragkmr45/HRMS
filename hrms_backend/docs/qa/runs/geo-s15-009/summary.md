# GEO-S15-009 Performance Evidence Summary

## Scope

- Task: Performance tuning fixes.
- Domain: Performance.
- Deliverable intent: fix slow queries or indexes discovered by QA/load smoke for context, punch, geofence, and review queues.
- Engineering rule: only confirmed performance issues may justify code, query, index, migration, cache, dependency, or architecture changes.
- Outcome: targeted inspection and local Docker TEST-database measurements found zero confirmed performance bottlenecks.

This ticket is completed as a documentation-only QA artifact. No application source code, query logic, schema, migration, test, dependency, cache, or benchmark framework change was made.

## Exact Ticket Path Mapping

| Ticket term | Runtime path | Interpretation evidence |
| --- | --- | --- |
| Context | `GET /api/v1/auth/me` | Current authenticated session, company, role, permissions, navigation, and preference context. Repository docs describe role/session context through this endpoint. |
| Punch | `POST /api/v1/attendance/punches` | Current self-service attendance command path. The API contract describes the mobile-ready punch command envelope and idempotency behavior. |
| Geofence | Runtime geofence evaluation inside the punch command path through `evaluateEffectiveGeofence` | Punch processing applies geo policy and geofence evaluation when policy requires location/geofence checks. |
| Review queue | `GET /api/v1/attendance/regularizations/queue/manager` | Manager attendance regularization review queue. OpenAPI and migration guide name this endpoint as the manager regularization queue. |

## Existing Performance Tooling

- `pnpm verify:scalability` exists and verifies migration/index/module coverage. It is not a runtime load benchmark.
- Docker test infrastructure exists.
- Functional smoke and UAT scripts exist.
- No `autocannon`, `k6`, `artillery`, dedicated benchmark runner, `pg_stat_statements` helper, or load-smoke harness was found.
- Static scalability verifier result: passed with full module queue/report/index coverage.

## Performance Thresholds

No route-specific latency SLO, p95/p99 target, or formal performance acceptance threshold exists in the repository. No threshold is inferred or invented for this ticket.

## Environment Used

Measurements used only the isolated local Docker TEST database, `hrms_platform_test`, and local Valkey.

The repository `.env` files contained remote URLs where `TEST_DATABASE_URL` and `DATABASE_URL` could resolve to the same remote target. Those remote targets were deliberately not used.

Application bootstrap requires `DATABASE_URL`, so during this QA process `DATABASE_URL` was explicitly pointed at the same isolated local Docker test database represented by `TEST_DATABASE_URL`.

- No remote database was used.
- No production database was used.
- Repository files were not changed during measurement.

## Dataset Representativeness

Initial relevant row counts:

| Table | Rows |
| --- | ---: |
| `core.users` | 10 |
| `core.user_roles` | 12 |
| `platform.company_profiles` | 1 |
| `platform.user_session_preferences` | 10 |
| `attendance.punch_events` | 0 initially, 2 after tiny punch samples |
| `attendance.sessions` | 0 initially, 2 after tiny punch samples |
| `attendance.regularization_requests` | 0 |
| `attendance.geofences` | 0 |
| `attendance.geofence_versions` | 0 |

This dataset is not representative of production-scale attendance workloads. The measurements confirm path wiring, basic request timing in a small local environment, and index eligibility for the probed SQL shapes. They do not prove production-scale performance.

## Context Evidence

Path: `GET /api/v1/auth/me`

Request sample:

| Metric | Value |
| --- | ---: |
| Samples | 30 Fastify inject requests |
| Status | 200 |
| p50 | 2.34ms |
| p95 | 4.495ms |
| p99 | 5.306ms |

SQL startup probes:

| Probe | Observed plan/evidence |
| --- | --- |
| `loadUsers` | Sequential scans over 10 users and 12 roles, hash join, execution 0.420ms, buffers hit 8. |
| `loadUserSessionPreferences` | Sequential scan over 10 rows, execution 0.655ms, buffers hit 7. |

Classification: **B. MEASURED - NO CONFIRMED ISSUE**

## Punch Evidence

Path: `POST /api/v1/attendance/punches`

First valid command sample:

| Metric | Value |
| --- | ---: |
| Status | 200 |
| Duration | 139.312ms |

Same-key replay sample:

| Metric | Value |
| --- | ---: |
| Samples | 20 |
| Status | 200 |
| Replay header | `true` |
| p50 | 9.955ms |
| p95 | 11.234ms |
| p99 | 11.244ms |

SQL probes:

| Query area | Observed plan/evidence |
| --- | --- |
| Command replay lookup | Used `attendance_commands_client_event_actor_uq`, 1 row, execution 0.136ms. |
| Employee command state lock | Used `employee_command_states_pkey`, 1 row, execution 0.085ms. |
| Open-session lookup | Used `attendance_sessions_employee_history_idx`, 1 row, execution 0.116ms. |
| Punch-history equivalent | Used `attendance_punch_company_employee_occurred_idx`, 1 row, execution 0.200ms. |
| Startup punch-events scan | 2 rows, execution 0.098ms. |

No concurrent lock/contention evidence was collected. The single 139.312ms first-command sample is not treated as a confirmed bottleneck because the dataset is tiny, there is no performance budget, and there is no repeated representative first-write/load evidence.

Classification: **C. INSUFFICIENT EVIDENCE**

## Geofence Evidence

Path: runtime geofence evaluation inside `POST /api/v1/attendance/punches` through `evaluateEffectiveGeofence`.

No runtime geofence rows existed in the local Docker TEST database.

Runtime-evaluation `EXPLAIN (ANALYZE, BUFFERS)` with one candidate:

| Metric | Value |
| --- | ---: |
| Candidate count | 1 |
| Returned rows | 0 |
| Warmed execution | 0.397ms |

Observed plan notes:

- Existing geofence index path was used.
- `attendance_geofence_versions_effective_lookup_idx` was planned but not executed because no matching geofence row existed.
- Spatial predicates were not actually exercised.

This evidence confirms query shape and index eligibility only. It cannot prove runtime spatial performance under realistic geofence shapes or candidate counts.

Classification: **C. INSUFFICIENT EVIDENCE**

## Review Queue Evidence

Path: `GET /api/v1/attendance/regularizations/queue/manager`

Request sample:

| Metric | Value |
| --- | ---: |
| Samples | 30 |
| Status | 200 |
| Queue size | 0 |
| p50 | 2.352ms |
| p95 | 3.668ms |
| p99 | 5.303ms |

SQL probes:

| Query area | Observed plan/evidence |
| --- | --- |
| Equivalent queue SQL | Used `attendance_regularizations_queue_idx`, returned 0 rows, execution 0.043ms, buffers hit 2. |
| Startup regularization scan | 0 rows, execution 0.037ms. |

The empty queue is not representative of production-scale review workloads.

Classification: **C. INSUFFICIENT EVIDENCE**

## Overall Classification

| Path | Classification |
| --- | --- |
| Context | **B. MEASURED - NO CONFIRMED ISSUE** |
| Punch | **C. INSUFFICIENT EVIDENCE** |
| Geofence | **C. INSUFFICIENT EVIDENCE** |
| Review queues | **C. INSUFFICIENT EVIDENCE** |

Confirmed performance issues: **none**

## Engineering Decision

No performance implementation is justified for GEO-S15-009.

The existing evidence does not justify:

- new indexes;
- query rewrites;
- partitioning;
- caching;
- architecture changes.

This preserves the GEO-S14-009 evidence-driven performance policy: do not add speculative indexes, partitioning, or other performance changes without measured evidence from the relevant workload.

## Missing Evidence For Future Optimization

A future performance change would require representative evidence such as:

- realistic attendance row counts;
- realistic geofence shapes and candidate counts;
- realistic regularization queue cardinality;
- repeated first-write punch samples;
- concurrent punch and lock-wait measurements;
- `EXPLAIN (ANALYZE, BUFFERS)` on representative tenant, date, user, and queue distributions;
- `pg_stat_statements` or slow-query evidence;
- a defined performance budget or SLO where applicable.

## Before/After Evidence Statement

The ticket asks for before/after evidence. Because zero fixes were justified or implemented:

- baseline measurements are documented above;
- there is no post-change measurement;
- no performance improvement is claimed.

Manufacturing an artificial before/after result would contradict the evidence-only policy for this task.
