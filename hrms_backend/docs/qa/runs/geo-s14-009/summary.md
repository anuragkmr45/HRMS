# GEO-S14-009 Performance Assessment

## Scope

- Assessed attendance event and punch storage for Sprint 14 performance readiness.
- Assessed location, evidence, geo-decision, geofence reference, and daily attendance summary storage.
- Preserved the synchronous web attendance punch constraint: the punch path must remain fast, so new indexes on tables written before response commit require measured evidence.
- Completed this ticket as an evidence-backed performance/QA artifact only. No schema, migration, partitioning, runtime, frontend, Kafka, or service-split change is part of this task.

## Relevant Tables And Current Indexes

### Attendance Punch Facts

`attendance.punch_events`

- Definition: `hrms_backend/src/db/schema.ts` `attendancePunchEvents`.
- Base migration: `hrms_backend/src/db/migrations/0003_attendance.sql`.
- Command/session traceability: `hrms_backend/src/db/migrations/0029_attendance_command_transactions.sql`.
- Provenance fields and indexes: `hrms_backend/src/db/migrations/0035_attendance_command_provenance.sql`.
- Primary key: `id`.
- Unique constraints/indexes:
  - `attendance_punch_events_id_company_uq` on `(id, company_id)`.
  - `attendance_punch_command_unique_idx` on `(command_execution_id)` where `command_execution_id IS NOT NULL`.
- Read/support indexes:
  - `attendance_punch_employee_occurred_idx` on `(employee_user_id, occurred_at DESC)` where `deleted_at IS NULL`.
  - `attendance_punch_company_employee_occurred_idx` on `(company_id, employee_user_id, occurred_at)`.
  - `attendance_punch_event_type_idx` on `(event_type, occurred_at DESC)` where `deleted_at IS NULL`.
  - `attendance_punch_session_occurred_idx` on `(company_id, session_id, occurred_at)` where `deleted_at IS NULL AND session_id IS NOT NULL`.
  - `attendance_punch_company_actor_occurred_idx` on `(company_id, actor_user_id, occurred_at DESC)` where `deleted_at IS NULL`.
  - `attendance_punch_regularization_idx` on `(regularization_request_id)` where `regularization_request_id IS NOT NULL`.
- Watch item: the legacy partial employee/time index and the company-scoped employee/time index overlap conceptually. Do not remove either without `pg_stat_user_indexes`, plan, and workload evidence.

### Attendance Evidence Ledger

`attendance.attendance_events`

- Definition: `hrms_backend/src/db/schema.ts` `attendanceEvents`.
- Migration: `hrms_backend/src/db/migrations/0033_attendance_evidence_ledger.sql`.
- Primary key: `id`.
- Unique constraint/index: `attendance_events_id_company_uq` on `(id, company_id)`.
- Indexes:
  - `attendance_events_employee_occurred_idx` on `(company_id, employee_user_id, occurred_at DESC)`.
  - `attendance_events_command_created_idx` on `(command_execution_id, created_at)` where `command_execution_id IS NOT NULL`.
  - `attendance_events_type_received_idx` on `(company_id, event_type, received_at DESC)`.

`attendance.location_evidence`

- Definition: `hrms_backend/src/db/schema.ts` `attendanceLocationEvidence`.
- Migrations: `hrms_backend/src/db/migrations/0033_attendance_evidence_ledger.sql`, `hrms_backend/src/db/migrations/0047_location_access_audit_retention.sql`.
- Primary key: `id`.
- Foreign key: `(attendance_event_id, company_id)` references `attendance.attendance_events(id, company_id)`.
- Indexes:
  - `location_evidence_event_captured_idx` on `(attendance_event_id, captured_at)`.
  - `location_evidence_employee_captured_idx` on `(company_id, employee_user_id, captured_at DESC)`.
  - `location_evidence_coordinate_purge_due_idx` on `(coordinates_expire_at, id)` where `coordinates_expire_at IS NOT NULL AND coordinates_purged_at IS NULL`.

`attendance.attendance_decisions`

- Definition: `hrms_backend/src/db/schema.ts` `attendanceDecisions`.
- Migration: `hrms_backend/src/db/migrations/0033_attendance_evidence_ledger.sql`.
- Primary key: `id`.
- Unique constraint/index: `attendance_decisions_id_company_uq` on `(id, company_id)`.
- Foreign key: `(attendance_event_id, company_id)` references `attendance.attendance_events(id, company_id)`.
- Indexes:
  - `attendance_evidence_decisions_event_evaluated_idx` on `(attendance_event_id, evaluated_at)`.
  - `attendance_evidence_decisions_command_evaluated_idx` on `(command_execution_id, evaluated_at)` where `command_execution_id IS NOT NULL`.
  - `attendance_evidence_decisions_employee_evaluated_idx` on `(company_id, employee_user_id, evaluated_at DESC)`.

`attendance.decision_reasons`

- Definition: `hrms_backend/src/db/schema.ts` `attendanceDecisionReasons`.
- Migration: `hrms_backend/src/db/migrations/0033_attendance_evidence_ledger.sql`.
- Primary key: `id`.
- Unique constraint/index: `attendance_decision_reasons_ordinal_uq` on `(attendance_decision_id, ordinal)`.
- Foreign key: `(attendance_decision_id, company_id)` references `attendance.attendance_decisions(id, company_id)`.

`attendance.attestation_evidence`

- Definition: `hrms_backend/src/db/schema.ts` `attendanceAttestationEvidence`.
- Migration: `hrms_backend/src/db/migrations/0051_attendance_attestation_evidence.sql`.
- Primary key: `id`.
- Indexes:
  - `attestation_evidence_event_idx` on `(company_id, attendance_event_id)`.
  - `attestation_evidence_registered_device_idx` on `(company_id, registered_device_id)` where `registered_device_id IS NOT NULL`.
  - `attestation_evidence_provider_status_evaluated_idx` on `(company_id, provider, verification_status, evaluated_at DESC)`.
- Current application note: runtime insertion is not used by the web punch path inspected for this ticket. The migration comments define it as a provider-neutral placeholder and require future persistence to validate logical references in the same transaction.

### Daily Attendance Summaries

`attendance.daily_records`

- Definition: `hrms_backend/src/db/schema.ts` `attendanceDailyRecords`.
- Base migration: `hrms_backend/src/db/migrations/0003_attendance.sql`.
- Company scoping: `hrms_backend/src/db/migrations/0026_attendance_company_scope.sql`, finalized by `hrms_backend/src/db/migrations/0028_finalize_attendance_company_scope.sql`.
- Dimension indexes: `hrms_backend/src/db/migrations/0038_attendance_daily_summary_dimensions.sql`.
- Primary key: `id`.
- Unique constraint/index: `attendance_daily_company_employee_date_uq` on `(company_id, employee_user_id, work_date)`.
- Indexes:
  - `attendance_daily_status_date_idx` on `(status, work_date DESC)` where `deleted_at IS NULL` from the initial migration.
  - `attendance_daily_exception_idx` on `(exception_type, work_date DESC)` where `deleted_at IS NULL` from the initial migration.
  - `attendance_daily_classification_date_idx` on `(day_classification, work_date)`.
  - `attendance_daily_presence_date_idx` on `(presence_state, work_date)`.
- Confirmed support: the unique `(company_id, employee_user_id, work_date)` key supports synchronous punch projection upserts and employee/date lookups.

### Geofence Reference And Version Tables

`attendance.work_sites`, `attendance.geofences`, `attendance.geofence_versions`

- Definitions: `hrms_backend/src/db/schema.ts` `attendanceWorkSites`, `attendanceGeofences`, `attendanceGeofenceVersions`.
- Extensions: `hrms_backend/src/db/migrations/0041_enable_postgis_btree_gist.sql`.
- Schema and spatial indexes: `hrms_backend/src/db/migrations/0042_work_sites_geofences.sql`.
- Effective-version fields and exclusion constraint: `hrms_backend/src/db/migrations/0043_geofence_publish_validate.sql`.
- Key indexes:
  - `attendance_work_sites_company_code_uq` on `(company_id, site_code)` where `deleted_at IS NULL`.
  - `attendance_work_sites_company_active_name_idx` on `(company_id, is_active, name)` where `deleted_at IS NULL`.
  - `attendance_work_sites_company_type_idx` on `(company_id, site_type, name)` where `deleted_at IS NULL`.
  - `attendance_geofences_site_code_uq` on `(company_id, work_site_id, geofence_code)` where `deleted_at IS NULL`.
  - `attendance_geofences_company_site_active_idx` on `(company_id, work_site_id, is_active, name)` where `deleted_at IS NULL`.
  - `attendance_geofences_current_version_idx` on `(company_id, current_published_version_id)` where `current_published_version_id IS NOT NULL AND deleted_at IS NULL`.
  - `attendance_geofence_versions_geofence_status_idx` on `(company_id, geofence_id, version_status, version_number)`.
  - `attendance_geofence_versions_effective_lookup_idx` on `(company_id, geofence_id, version_status, effective_from, effective_until)` where `version_status = 'published'`.
  - `attendance_geofence_versions_published_circles_gist_idx` using GiST on `(shape::geography)` where `shape_type = 'circle' AND version_status = 'published'`.
  - `attendance_geofence_versions_published_polygons_gist_idx` using GiST on `shape` where `shape_type = 'polygon' AND version_status = 'published'`.
  - `attendance_geofence_versions_published_period_no_overlap` exclusion constraint on `(company_id, geofence_id, tstzrange(effective_from, effective_until, '[)'))` where `version_status = 'published'`.

## Query-To-Index Mapping

| Workload | Query/function | Filters and order | Existing supporting index |
| --- | --- | --- | --- |
| Web punch | `AttendanceService.punchPostgres`, `hrms_backend/src/modules/attendance/service.ts`; `AttendanceCommandService.execute`, `hrms_backend/src/modules/attendance/command-service.ts` | Fastify `POST /punches` enters through `hrms_backend/src/modules/attendance/routes.ts`; transaction creates command/evidence/decision/session/punch/daily rows | Existing unique and lookup indexes on command execution, sessions, break segments, punch events, daily records |
| Web punch | `PostgresAttendanceCommandRepository.findCommandByClientEventIdForUpdate` | `command_executions WHERE company_id = ? AND actor_user_id = ? AND client_event_id = ? FOR UPDATE` | `attendance_commands_client_event_actor_uq` |
| Web punch | `PostgresAttendanceCommandRepository.createCommandExecution` | `INSERT ... ON CONFLICT (platform_idempotency_key_id) WHERE platform_idempotency_key_id IS NOT NULL` | `attendance_commands_platform_idempotency_key_uq` |
| Web punch | `PostgresAttendanceCommandRepository.ensureAndLockEmployeeState` | `employee_command_states WHERE company_id = ? AND employee_user_id = ? FOR UPDATE` | Primary key `(company_id, employee_user_id)` |
| Web punch | `PostgresAttendanceCommandRepository.findOpenSessionForUpdate` | `sessions WHERE company_id = ? AND employee_user_id = ? AND closed_at IS NULL AND deleted_at IS NULL ORDER BY checked_in_at DESC LIMIT 1 FOR UPDATE` | `attendance_sessions_single_open_idx`; employee-history index can support employee session history |
| Web punch | `PostgresAttendanceCommandRepository.findActiveBreakForUpdate` | `break_segments WHERE company_id = ? AND session_id = ? AND ended_at IS NULL FOR UPDATE` | `attendance_break_segments_single_active_idx` |
| Web punch | `PostgresAttendanceCommandRepository.findCompletedSessionForWorkDateForUpdate` | `sessions WHERE company_id = ? AND employee_user_id = ? AND work_date = ? AND closed_at IS NOT NULL AND deleted_at IS NULL ORDER BY closed_at DESC LIMIT 1 FOR UPDATE` | Existing session employee/date indexes are plausible; validate with EXPLAIN before adding anything |
| Web punch | `PostgresAttendanceCommandRepository.evaluateEffectiveGeofence` | Candidate geofence IDs, `geofences.company_id`, `geofence.id`, active/non-deleted geofences, `geofence_versions.version_status = 'published'`, effective period filters, spatial calculations, ordered by candidate/effective/version | `attendance_geofences_company_site_active_idx`, `attendance_geofence_versions_effective_lookup_idx`; published circle/polygon GiST indexes exist for spatial shapes, but planner usage needs representative runtime spatial validation |
| Web punch | `projectDay` in `hrms_backend/src/modules/attendance/command-service.ts` | Sessions and breaks for one company/employee/work_date ordered by session/break time; daily projection upsert by company/employee/work_date | `attendance_sessions_work_date_idx`, `attendance_break_segments_session_history_idx`, `attendance_punch_session_occurred_idx`, `attendance_daily_company_employee_date_uq` |
| Worker | `AttendanceCoordinatePurgeWorker.purgeExpired`, `hrms_backend/src/workers/attendance-coordinate-purge-worker.ts` | `location_evidence` with non-null coordinates, due `coordinates_expire_at`, not purged, ordered by `coordinates_expire_at, id`, `FOR UPDATE SKIP LOCKED`, `LIMIT` | `location_evidence_coordinate_purge_due_idx` |
| Background rebuild | `loadEffectivePunchFacts`, `hrms_backend/src/modules/attendance/projection-rebuild-service.ts` | `punch_events WHERE company_id = ? AND employee_user_id = ? AND deleted_at IS NULL AND occurred_at BETWEEN ? AND ?`, joins correction applications, command decisions, command executions, attendance decisions, ordered by `punch.occurred_at, punch.id` | `attendance_punch_company_employee_occurred_idx`, `attendance_regularization_applications_target_uq`, `command_decisions_command_execution_id_key`, command execution PK, `attendance_evidence_decisions_command_evaluated_idx` |
| Background rebuild | `loadExistingProjection`, `hrms_backend/src/modules/attendance/projection-rebuild-service.ts` | Sessions, break segments, and daily records by company/employee/date range, ordered by date/time | `attendance_sessions_work_date_idx`, `attendance_break_segments_session_history_idx`, `attendance_daily_company_employee_date_uq`; employee-first session/date-range ordering is a watch item |
| Background rebuild | `upsertDailyRecord`, `hrms_backend/src/modules/attendance/projection-rebuild-service.ts` | `INSERT INTO attendance.daily_records ... ON CONFLICT (company_id, employee_user_id, work_date) DO UPDATE` | `attendance_daily_company_employee_date_uq` |
| Read/reporting | `AttendanceRepository.listPunches` and `AttendanceRepository.listDayRecords`, `hrms_backend/src/modules/attendance/repository.ts` | In-memory filtering over arrays populated by `PostgresDataStore.loadAttendancePunches` and `loadAttendanceDayRecords` | Per-request DB indexes are not used for these API reads; startup load uses full-table order queries |

## Web-Punch Write Amplification Assessment

The synchronous punch path begins at `POST /api/v1/attendance/punches` in `hrms_backend/src/modules/attendance/routes.ts`, enters `AttendanceService.punchPostgres`, and executes a single PostgreSQL transaction in `AttendanceCommandService.execute` through `PostgresAttendanceCommandRepository.transaction`.

Important tables written before HTTP commit/response can include:

- `platform.idempotency_keys`
- `attendance.command_executions`
- `attendance.attendance_events`
- `attendance.location_evidence` when location evidence is supplied
- `attendance.attendance_decisions`
- `attendance.decision_reasons`
- `attendance.command_decisions`
- `attendance.sessions`
- `attendance.break_segments` for break transitions
- `attendance.employee_command_states`
- `attendance.punch_events`
- `attendance.daily_records`
- `platform.outbox_events`

Every additional index on these synchronously written tables adds persistent insert/update maintenance cost. No new index should be added to this path unless local and production-like evidence shows a concrete query needs it and the write cost is acceptable.

## Confirmed Findings

- No proven missing event, location, geo, or daily-record index currently requires a migration.
- No proven redundant index is safe to remove.
- `attendance.daily_records` unique key `(company_id, employee_user_id, work_date)` supports punch projection upsert and employee/date access.
- Location coordinate purge is already covered by `location_evidence_coordinate_purge_due_idx`.
- Effective geofence/version lookup has appropriate B-tree/effective-period indexes, and published spatial shapes have dedicated partial GiST indexes. Planner usage should be validated with representative runtime spatial queries before making index changes.
- The repository contains no credible current evidence requiring PostgreSQL table partitioning.

## Watch Items

- `attendance.punch_events` has conceptual overlap between the legacy partial `(employee_user_id, occurred_at DESC) WHERE deleted_at IS NULL` index and the company-scoped `(company_id, employee_user_id, occurred_at)` index. Removal requires `pg_stat_user_indexes`, query-plan, and workload evidence. `idx_scan = 0` alone is not sufficient evidence for index removal; statistics must cover a representative workload period and be interpreted relative to statistics resets and deployment/restart history.
- Session rebuild reads are employee/date-range oriented, while `attendance_sessions_work_date_idx` is ordered `(company_id, work_date, employee_user_id)`. Any employee-first session index needs EXPLAIN evidence for the rebuild workload before implementation.

## Partitioning Assessment

Do not partition attendance event, location/evidence, or daily summary tables now.

Current evidence:

- No migration uses `PARTITION BY`, `ATTACH PARTITION`, BRIN, hypertables, or other partitioning support.
- Existing performance decisions are index-led: partial B-tree indexes, unique constraints, GiST spatial indexes, and an exclusion constraint for published geofence effective periods.
- The inspected application access patterns have plausible existing index coverage.
- No production row counts, latency measurements, index bloat statistics, query degradation, or retention backlog evidence was available in the repository inspection.

Assumptions not sufficient for partitioning:

- Attendance and evidence tables can grow over time.
- Append-heavy evidence tables may eventually need storage-management work.
- Rebuild/reporting paths may become more expensive as history grows.

Future evidence-based triggers:

- Sustained query degradation on important access patterns despite correct indexes.
- Significant append-table or index bloat causing maintenance pressure.
- Coordinate retention/purge batches failing to keep up with incoming evidence.
- Startup or reporting reads becoming operationally slow because of full-table attendance loads.
- Demonstrated partition-pruning benefit on representative production-like date or tenant workloads.

No row-count threshold is invented for this decision.

## Architecture Decision

Keep the current PostgreSQL/Fastify attendance architecture. Do not introduce Kafka, service splitting, or unrelated architecture for GEO-S14-009. Optimize only when measured evidence warrants a targeted change.

## Reproducible Validation Appendix

These SQL statements are non-destructive. Local or test-database EXPLAIN results on small datasets are useful for query-shape validation, but they are not production-scale evidence. Production-like cardinality, data distribution, and realistic parameter values are required before approving index removal, index addition, or partitioning work.

### Table Activity Statistics

```sql
SELECT
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'attendance'
  AND relname IN (
    'punch_events',
    'attendance_events',
    'location_evidence',
    'attendance_decisions',
    'decision_reasons',
    'attestation_evidence',
    'daily_records',
    'sessions',
    'break_segments',
    'geofences',
    'geofence_versions'
  )
ORDER BY relname;
```

### Index Usage Statistics

```sql
SELECT
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'attendance'
  AND relname IN (
    'punch_events',
    'attendance_events',
    'location_evidence',
    'attendance_decisions',
    'decision_reasons',
    'attestation_evidence',
    'daily_records',
    'sessions',
    'break_segments',
    'geofences',
    'geofence_versions'
  )
ORDER BY relname, indexrelname;
```

### Table And Index Sizes

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind,
  pg_size_pretty(pg_relation_size(c.oid)) AS relation_size,
  pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'attendance'
  AND c.relname IN (
    'punch_events',
    'attendance_events',
    'location_evidence',
    'attendance_decisions',
    'decision_reasons',
    'attestation_evidence',
    'daily_records',
    'sessions',
    'break_segments',
    'geofences',
    'geofence_versions'
  )
ORDER BY pg_total_relation_size(c.oid) DESC, c.relname;
```

### Punch Event Company/Employee/Time Range

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  punch.id,
  punch.session_id,
  punch.event_type,
  punch.occurred_at,
  punch.work_mode,
  punch.source,
  punch.origin,
  punch.metadata,
  punch.command_execution_id
FROM attendance.punch_events punch
WHERE punch.company_id = $1
  AND punch.employee_user_id = $2
  AND punch.deleted_at IS NULL
  AND punch.occurred_at >= $3::timestamptz
  AND punch.occurred_at <= $4::timestamptz
ORDER BY punch.occurred_at ASC, punch.id ASC;
```

### Daily Record Company/Employee/Date Range

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  company_id,
  employee_user_id,
  work_date,
  status,
  day_classification,
  presence_state,
  punctuality_state,
  evidence_state,
  approval_kind,
  approval_state,
  payroll_state,
  first_check_in,
  last_check_out,
  work_seconds,
  break_seconds,
  scheduled_seconds,
  exception_type,
  regularization_status
FROM attendance.daily_records
WHERE company_id = $1
  AND employee_user_id = $2
  AND work_date BETWEEN $3::date AND $4::date
  AND deleted_at IS NULL
ORDER BY work_date;
```

### Location Coordinate Purge Batch

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  evidence.id,
  evidence.company_id,
  evidence.attendance_event_id,
  evidence.coordinates_expire_at
FROM attendance.location_evidence evidence
WHERE evidence.latitude IS NOT NULL
  AND evidence.longitude IS NOT NULL
  AND evidence.coordinates_expire_at IS NOT NULL
  AND evidence.coordinates_expire_at <= now()
  AND evidence.coordinates_purged_at IS NULL
ORDER BY evidence.coordinates_expire_at, evidence.id
LIMIT 500;
```

### Open Session Auto-Punch-Out Scan

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  session.company_id,
  session.employee_user_id,
  session.id AS session_id,
  session.work_date::text AS work_date,
  session.checked_in_at::text AS checked_in_at
FROM attendance.sessions session
JOIN platform.company_profiles company
  ON company.id = session.company_id
 AND company.status = 'active'
JOIN core.users employee
  ON employee.id = session.employee_user_id
 AND employee.deleted_at IS NULL
 AND employee.employment_status = 'active'
WHERE session.closed_at IS NULL
  AND session.deleted_at IS NULL
  AND session.checked_in_at <= $1::timestamptz
ORDER BY session.checked_in_at ASC, session.id ASC
LIMIT 10000;
```

### Employee Session Date-Range Rebuild Watch Item

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  id,
  work_date::text,
  status,
  checked_in_at,
  closed_at,
  last_transition_at,
  work_mode,
  source
FROM attendance.sessions
WHERE company_id = $1
  AND employee_user_id = $2
  AND work_date BETWEEN $3::date AND $4::date
  AND deleted_at IS NULL
ORDER BY work_date, checked_in_at, id;
```

### Effective Geofence Version Lookup

```sql
EXPLAIN (ANALYZE, BUFFERS)
WITH candidates AS (
  SELECT candidate.geofence_id, candidate.ordinal::integer AS candidate_ordinal
  FROM unnest($2::uuid[]) WITH ORDINALITY AS candidate(geofence_id, ordinal)
)
SELECT
  candidates.candidate_ordinal,
  geofence.id AS geofence_id,
  version.id AS geofence_version_id,
  geofence.work_site_id,
  version.version_number,
  version.shape_type,
  version.effective_from,
  version.effective_until
FROM candidates
JOIN attendance.geofences geofence
  ON geofence.company_id = $1
 AND geofence.id = candidates.geofence_id
 AND geofence.is_active = true
 AND geofence.deleted_at IS NULL
JOIN attendance.geofence_versions version
  ON version.geofence_id = geofence.id
 AND version.company_id = geofence.company_id
WHERE version.version_status = 'published'
  AND version.effective_from <= $3::timestamptz
  AND (version.effective_until IS NULL OR $3::timestamptz < version.effective_until)
ORDER BY candidates.candidate_ordinal ASC, version.effective_from DESC, version.version_number DESC;
```

This EXPLAIN scenario is intentionally limited to candidate geofence plus published effective-version lookup. Actual GiST planner usage should be validated separately with the exact runtime spatial predicate from `PostgresAttendanceCommandRepository.evaluateEffectiveGeofence` and representative data before making any spatial-index changes.

## Verification Log

- `git status --short`
  - Result before implementation: clean.
- Repository convention inspection
  - Result: GEO QA artifacts use `hrms_backend/docs/qa/runs/<geo-task>/summary.md`; no required central QA index was found in the narrow inspection.
- Implementation
  - Result: added this documentation-only artifact. No migration, schema, runtime, frontend, Kafka, or service split was added.
- `Select-String -Path hrms_backend/docs/qa/runs/geo-s14-009/summary.md -Pattern '[ \t]$'`
  - Result: passed; no trailing whitespace found in the new artifact.
- `git diff --check`
  - Result: passed; no whitespace errors reported in tracked changes. The new artifact is untracked until staged.
- `pnpm.cmd verify:scalability`
  - Result: initial noninteractive run failed before the verifier because pnpm attempted dependency bootstrap without a TTY. A `CI=true` retry in the sandbox timed out on restricted registry access.
- `CI=true pnpm.cmd install`
  - Result: passed with escalated network access; restored `hrms_backend/node_modules` after the sandboxed bootstrap attempt recreated it.
- `.\\node_modules\\.bin\\tsx.cmd scripts\\verify-scalability.ts`
  - Result: passed; printed `Scalability verification passed with full module queue/report/index coverage.`
