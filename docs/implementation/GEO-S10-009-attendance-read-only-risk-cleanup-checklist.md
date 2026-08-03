# GEO-S10-009 — Current Attendance Service Risk Cleanup Checklist

| Metadata | Value |
|---|---|
| Status | Documentation-only implementation-readiness checklist; no cleanup is implemented by this task. |
| Owner | GEO-S10-009 — current risk audit, cleanup checklist, dependency mapping, QA/definition-of-done specification. |
| Domain | Technical Debt — Attendance |
| Scope | Attendance read purity, regularization concurrency, and operational shift resolution. |
| Preconditions | Future implementation backlog IDs must be assigned before engineering begins. |
| Commit/QA Artifact | GEO-S10-009 |
| Backlog Mapping Status | Completed dependencies mapped; future implementation owners pending sprint-planning assignment. |

## 1. Objective

Translate the verified attendance audit blockers into implementation-ready checkpoints for later sprints. The intended outcome is a PostgreSQL-authoritative attendance system where GET requests are side-effect-free, regularization decisions are concurrency-safe, and every shift-sensitive calculation uses an effective operational shift rather than a fixed start time.

GEO-S10-009 is complete as the current-state audit and implementation-readiness artifact. Assignment of exact future implementation backlog IDs remains a sprint-planning action. No identifiers may be invented.

## 2. Scope

This checklist covers:

- GET-side mutations, synthesized day records, and lazy cache persistence.
- PostgreSQL-first regularization decisions and daily-projection concurrency control.
- Removal of the fixed `09:30` shift assumption and introduction of operational shift resolution.
- Migration, API compatibility, verification, release, and rollback checkpoints for those cleanups.

## 3. Non-goals

- Implementing geo-location or geofence functionality.
- Changing production TypeScript, tests, database schema, migrations, OpenAPI contracts, or package configuration in GEO-S10-009.
- Assigning or inventing future sprint backlog IDs.
- Redesigning unrelated attendance UX or changing public response contracts without approval.

## 4. Current-state risk summary

| Track | Current risk | Consequence if deferred |
|---|---|---|
| A — GET purity | Attendance read methods can resolve/recompute a day and write synthesized records into the shared in-memory store. | A read can alter cache state, create deferred persistence work, and amplify writes across employees and dates. |
| B — Regularization OCC | `expected_version` is checked against a process-local object, followed by an unconditional PostgreSQL cache upsert. | Multiple processes can accept conflicting decisions and last-writer-wins can overwrite request or projection state. |
| C — Operational shifts | Legacy projection assumes a 09:30 shift start; PostgreSQL projection does not resolve any effective shift. | Late, early-out, absence, and historical results can be incorrect or inconsistent across paths. |

## 5. Completed Sprint 10 dependencies

| Dependency | Completed foundation to preserve | Required treatment by future work |
|---|---|---|
| GEO-S10-003 | Company-scoped attendance tenancy. | Preserve `company_id` predicates and tenant-scoped uniqueness. |
| GEO-S10-004 | PostgreSQL-first attendance command/session foundation. | Use its transaction, lock, and command-boundary design as the reference for regularization commands. |
| GEO-S10-005 | Attendance command idempotency. | Preserve replay-safety/idempotency where future cleanup commands require it. |
| GEO-S10-006 | Runtime locking and concurrent command serialization. | Reuse established lock and error-mapping conventions. |
| GEO-S10-008 | Canonical attendance outbox event contract. | Preserve event names, explicit payload allowlists, schema versioning, producer keys, and aggregate identifiers. |

## 6. Track A — GET-side mutation removal

### Verified current behavior

- [`AttendanceService.resolveDay`](../../hrms_backend/src/modules/attendance/service.ts) calls recomputation or synthesis and writes with `upsertDayRecord`.
- Affected GETs are `GET /attendance/summary/my`, team attendance summary, monthly calendar, daily calendar, and attendance exceptions.
- Future, weekend, absence, holiday, and other synthesized day records can be created while processing a GET.
- GETs do not immediately flush attendance state to PostgreSQL, but a later attendance write can flush the mutated shared cache.
- `GET /attendance/punches/my` can invoke auto-punch-out logic and create a checkout punch in memory.
- Team-summary and exception reads multiply the behavior across visible employees multiplied by the selected date range.
- Dashboard and Reports consumers that only count, filter, and map existing attendance projections are verified safe read-only consumers.

### Cleanup checkpoints

| Checklist | Current behavior | Required change | Owner | Dependency | Required test/completion evidence |
|---|---|---|---|---|---|
| [ ] Define the read-path purity contract. | GET methods may reach repository writes through day resolution. | Declare attendance GET/query services side-effect-free: no repository writes, store-array mutation, cached-entity mutation, outbox emission, audit write, version increment, or timestamp update. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003 | Architecture decision and code review checklist identify allowed query interfaces only. |
| [ ] Introduce a pure query projector. | Read-time resolution persists/reuses daily records. | Split response-only derivation from persistent projection materialization; pure projection returns a detached response model. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003 | Unit tests show derived future/weekend/absence values without changing cache or database state. |
| [ ] Remove read-time daily-record upserts. | `resolveDay`/`recomputeDay` may write daily projections during GET. | Materialize or repair projections only in an explicit command, worker, or scheduled projection process. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004, GEO-S10-006 | Route tests prove every affected GET causes zero daily-record inserts/updates. |
| [ ] Isolate auto-punch-out from GET. | Punch-list GET can create a checkout in memory. | Move auto-punch-out exclusively to the transactional command/worker path; worker remains the only scheduled repair owner. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004, GEO-S10-005, GEO-S10-006 | Repeated GET tests create no punches; worker tests prove exactly-once transactional closure. |
| [ ] Bound expensive range reads. | Exceptions/team summary may resolve every employee/day. | Require pagination, bounded date ranges, and query plans that read existing projections or compute response-only values. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003 | Range-query test matrix covers large teams, pagination, and date-range limits. |
| [ ] Protect safe read consumers. | Dashboard/reports only consume existing projections. | Keep those services on a read-only attendance query interface; do not route them through materializing resolution. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003 | Dashboard/report regression tests show unchanged response contracts and zero writes. |

### Track A QA and definition of done

- [ ] Add database and cache write-spy tests for every affected GET route.
- [ ] Add repeated-GET tests proving idempotent, side-effect-free behavior.
- [ ] Add team and exception range-query tests covering employees multiplied by dates.
- [ ] Verify a GET cannot create punches, daily records, sessions, outbox events, audit records, versions, or timestamps.
- [ ] Verify a GET cannot create or close an attendance session.
- [ ] Verify worker-based auto-punch-out is exactly-once and transactional.
- [ ] Verify existing API response contracts remain compatible.

**Track A done when:** repeating any attendance GET causes zero persistent or shared-state mutations, GETs cannot create synthetic day records or session transitions, and projection materialization has one explicit command/worker owner.

## 7. Track B — PostgreSQL regularization OCC

### Verified current behavior

- Regularization decisions accept `expected_version`.
- The current service compares that value with an in-memory regularization object, then mutates request status/version and daily projection state in memory.
- PostgreSQL persistence later uses an unconditional upsert; no database-side `WHERE version = expected_version` protects the decision.
- Two application processes can read the same version and produce conflicting approve/reject decisions.
- Daily-projection versions can also be overwritten without database-level concurrency protection.
- The PostgreSQL punch-command path is the stronger reference implementation: transactions, runtime locking, and expected-version SQL predicates already exist there.

### Cleanup checkpoints

| Checklist | Current behavior | Required change | Owner | Dependency | Required test/completion evidence |
|---|---|---|---|---|---|
| [ ] Build a PostgreSQL-first regularization command service. | Route uses memory-first service logic. | Execute the complete regularization decision workflow through a dedicated PostgreSQL command service and transaction. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004 | Command boundary and transaction diagram reviewed; no accepted decision depends on local cache state. |
| [ ] Atomically validate and transition the request. | Version/pending-status checks are process-local. | Scope by `company_id`; atomically validate request ID, pending status, actor authorization, and expected version using `SELECT ... FOR UPDATE` plus protected update, or `UPDATE ... WHERE version = expected_version AND status = 'pending' RETURNING *`. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003, GEO-S10-006 | Stale/already-decided request returns deterministic HTTP 409. |
| [ ] Make daily-projection updates transactional. | Decision mutates daily projection in memory and later flushes it. | Serialize access to the `(company_id, employee_user_id, work_date)` projection row and update it inside the same transaction. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003, GEO-S10-004 | No lost daily-projection update under concurrent decision/punch/worker activity. |
| [ ] Persist immutable workflow history. | Request row is overwritten as the decision record. | Write an immutable regularization action-history record containing actor, before/after state, decision time, and correlation identifiers. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004 | Exactly one history record exists for the winning decision. |
| [ ] Write the canonical outbox event in the same transaction. | Cache persistence may decouple state and event production. | Insert the canonical GEO-S10-008 attendance outbox event with the request/projection changes. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-008 | Exactly one canonical event; rollback leaves neither state nor event committed. |
| [ ] Eliminate cache overwrite as source of truth. | Unconditional persistence can overwrite PostgreSQL rows. | Do not use broad cache flushes for regularization source-of-truth writes; reload/read through PostgreSQL after commit as needed. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004 | Cross-process test proves PostgreSQL determines the winning state. |
| [ ] Retain the public concurrency contract. | Clients submit `expected_version`. | Keep the public `expected_version` API contract unless a separate approved API change supersedes it. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-005 | OpenAPI/API regression confirms request and conflict-response compatibility. |

### Track B QA and definition of done

- [ ] Two concurrent approvals produce one success and one conflict.
- [ ] Concurrent approve/reject produces one committed decision.
- [ ] Cross-process PostgreSQL integration test proves database arbitration.
- [ ] Exactly one regularization action-history record is written.
- [ ] Exactly one canonical outbox event is written.
- [ ] No duplicate approved punches are created.
- [ ] No daily-projection update is lost.
- [ ] Tenant isolation tests cover company-scoped request and projection access.
- [ ] Transaction rollback tests cover projection or outbox insertion failure.
- [ ] Replay and stale-version tests retain deterministic HTTP 409 behavior.

**Track B done when:** PostgreSQL determines the winning decision and request state, daily projection, history, and outbox event commit atomically. Concurrent decisions cannot overwrite one another.

## 8. Track C — Operational shifts and 09:30 removal

### Verified current behavior

- The legacy daily projection creates a fixed `09:30` shift-start timestamp.
- Late arrival, early departure, and automatic absence are derived from that timestamp.
- End time is inferred from company daily working hours, not an effective employee shift.
- Seed/master data includes a “General Shift 09:30 - 18:30 IST” label, but attendance does not resolve it as an operational assignment.
- The attendance database lacks operational shift-template, shift-version, assignment, and shift-instance tables.
- PostgreSQL punch projection writes late/early-out values without effective-shift evaluation.
- Legacy and PostgreSQL command paths can therefore produce inconsistent projections.

### Cleanup checkpoints

| Checklist | Current behavior | Required change | Owner | Dependency | Required test/completion evidence |
|---|---|---|---|---|---|
| [ ] Introduce operational shift storage. | Shift labels are generic master data rather than schedule semantics. | Add versioned shift templates, immutable template versions, employee assignments with effective-date ranges, and resolved shift instances. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003 | Migration/backfill and data-model review cover tenant scope, effective dates, and retention. |
| [ ] Implement one effective-shift resolver. | Legacy code assumes 09:30; PostgreSQL code does not resolve shifts. | Resolve shift from company timezone and employee assignment; support grace/policy overrides, explicit no-assignment fallback, and cross-midnight attendance-date attribution. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004 | Resolver unit tests cover assignment precedence, timezone, and overnight attribution. |
| [ ] Share the resolver across all attendance paths. | Commands, worker, regularizations, exceptions, reads, and reports can disagree. | Use the same resolver for punch commands, daily projection, auto-punch-out worker, regularization decisions, exception detection, GET projection, and reports. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004, GEO-S10-006 | Contract tests prove identical inputs result in consistent shift-sensitive values across paths. |
| [ ] Snapshot historical shift context. | Daily results derive from mutable defaults/current company hours. | Snapshot effective shift ID/version used for every attendance decision or projection so later policy/template changes do not rewrite history. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-004, GEO-S10-008 | Historical recomputation test preserves the original shift-version linkage. |
| [ ] Remove the 09:30 assumption. | Production application logic constructs a fixed 09:30 timestamp. | Remove literals that assume 09:30; do not silently retain it as fallback unless an approved company policy explicitly requires it. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | Operational-shift data model checkpoint | Static search and behavior tests show no production shift-sensitive 09:30 fallback. |
| [ ] Define compatibility fallback. | Employees without assignments implicitly inherit fixed behavior. | Define explicit, auditable fallback behavior for employees without an assignment and expose it through approved policy/configuration semantics. | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` | GEO-S10-003 | Test fixtures and API compatibility review cover unassigned employees. |

### Track C QA and definition of done

- [ ] 09:30 standard shift.
- [ ] 10:00 shift.
- [ ] Flexible shift.
- [ ] Cross-midnight shift.
- [ ] Assignment change with effective dates.
- [ ] Company-timezone boundary.
- [ ] Daylight-saving boundary where applicable.
- [ ] Holiday/non-working day.
- [ ] Grace-period boundary.
- [ ] Employee without an assignment.
- [ ] Historical recomputation after a shift-version change.
- [ ] Consistent results across command, worker, GET projection, and reports.

**Track C done when:** no attendance decision depends on a hard-coded 09:30 value, each shift-sensitive calculation uses the effective operational shift, historical records retain the effective shift version, and all execution/read/report paths agree.

## 9. Migration and compatibility considerations

- [ ] Design additive, company-scoped schema migrations for shift templates, versions, assignments, instances, and regularization action history.
- [ ] Define a backfill strategy for existing daily records without silently recalculating historical attendance under new shift rules.
- [ ] Preserve tenant-scoped unique keys and company predicates from GEO-S10-003.
- [ ] Replace broad cache flush persistence with transaction-owned writes for regularizations and their projections.
- [ ] Provide an explicit repair/reprojection workflow, with observability and idempotency, rather than materializing data during GET.
- [ ] Define rollback behavior for partially deployed schema, resolver, worker, and projection changes.

## 10. API/OpenAPI compatibility checkpoints

- [ ] Preserve existing attendance GET response fields while moving calculations to pure query projections.
- [ ] Preserve `expected_version` request semantics and deterministic 409 conflict behavior.
- [ ] Do not expose sensitive evidence or future shift internals in ordinary attendance/report list responses.
- [ ] Version/document any newly required operational-shift or regularization-history APIs through the approved API process.
- [ ] Preserve GEO-S10-008 event names, schema version, aggregate IDs, producer keys, and payload allowlists.
- [ ] Regenerate and verify OpenAPI only in the future implementation task after route/schema changes are approved.

## 11. Testing and QA matrix

| Area | Minimum evidence |
|---|---|
| GET purity | Cache and database write spies; repeated route calls; no version/timestamp/punch/day/outbox/audit changes; large range behavior. |
| Worker | Exactly-once auto-punch-out; transactional success/failure; no GET-triggered closure. |
| Regularization | Concurrent approve/approve and approve/reject; cross-process PostgreSQL arbitration; tenant isolation; stale/replay; rollback; no duplicate punches/events/history. |
| Projection consistency | Same raw attendance input produces matching command, worker, query, exception, dashboard, and report values. |
| Shifts | Standard, alternate, flexible, cross-midnight, effective-date, timezone, daylight-saving, holiday, grace, unassigned, and historical-version scenarios. |
| Compatibility | Existing attendance routes, expected-version conflict semantics, report/dashboard response contracts, and canonical outbox contract regressions. |

## 12. Release and rollback gates

- [ ] Assigned future backlog IDs and sequencing approved.
- [ ] Migration plan reviewed with backup, forward-only, and rollback/recovery steps.
- [ ] Cross-process PostgreSQL QA passes in representative infrastructure.
- [ ] GET purity telemetry confirms zero attendance writes from read routes.
- [ ] Worker monitoring distinguishes scheduled projection repair from query traffic.
- [ ] Outbox contract validation passes.
- [ ] API compatibility and performance/range limits are approved.
- [ ] Release rollback does not leave partially committed regularization, projection, or outbox state.

## 13. Backlog ownership mapping

| Work item | Ownership | Dependency | Implementation owner |
|---|---|---|---|
| GEO-S10-009 | Current risk audit, implementation cleanup checklist, dependency mapping, QA and definition-of-done specification. | GEO-S10-003, GEO-S10-004, GEO-S10-005, GEO-S10-006, GEO-S10-008 | This documentation task. |
| GET-side mutation removal | Strict read purity, pure projector, worker-owned materialization, read QA. | GEO-S10-003, GEO-S10-004, GEO-S10-005, GEO-S10-006 | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` |
| PostgreSQL regularization OCC | Transactional decision, projection update, action history, canonical outbox, cross-process QA. | GEO-S10-003, GEO-S10-004, GEO-S10-005, GEO-S10-006, GEO-S10-008 | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` |
| Operational shift model and 09:30 removal | Versioned shifts, effective resolver, historical snapshots, shared execution/reporting use. | GEO-S10-003, GEO-S10-004, GEO-S10-006, GEO-S10-008 | `UNASSIGNED — FUTURE SPRINT BACKLOG ID REQUIRED` |

Exact future implementation IDs were not found in repository documentation or task sheets. No GEO-S11 or GEO-S12 identifiers have been invented. Sprint planning must assign the IDs before implementation begins; replacing `UNASSIGNED` markers is a checklist gate, not an engineering assumption.

## 14. Backlog assignment gate

- [ ] Product/engineering lead assigns the GET-purity cleanup ID.
- [ ] Product/engineering lead assigns the PostgreSQL regularization/OCC cleanup ID.
- [ ] Product/engineering lead assigns the operational-shifts cleanup ID.
- [ ] Dependencies and sequencing are confirmed.
- [ ] Assigned IDs replace all `UNASSIGNED` markers.
- [ ] Each implementation PR references GEO-S10-009.
- [ ] Each implementation task links back to its corresponding checklist section.

## 15. Consolidated definition of done

- [ ] Attendance GETs are side-effect-free in memory and PostgreSQL.
- [ ] Only explicit commands/workers materialize or repair attendance projections.
- [ ] Regularization decisions are company-scoped, atomic, PostgreSQL-authoritative, replay-safe where required, and concurrency-safe across processes.
- [ ] Request, projection, immutable action history, and canonical outbox event commit or roll back together.
- [ ] No shift-sensitive production logic depends on a hard-coded 09:30 value.
- [ ] Every shift-sensitive attendance result resolves and snapshots the effective operational shift.
- [ ] Command, worker, GET projection, dashboard, and report outputs are consistent.
- [ ] All QA, compatibility, release, rollback, and backlog-assignment gates above are complete.

## 16. Audit evidence/reference locations

| Evidence | Location |
|---|---|
| Attendance routes, service, repository, command service/repository | `hrms_backend/src/modules/attendance/` |
| Read-time day resolution and materialization symbols | `hrms_backend/src/modules/attendance/service.ts`: `AttendanceService.resolveDay` (line 1685), `AttendanceService.recomputeDay` (line 1542), `AttendanceService.getOrSynthesizeDay` (line 1730) |
| GET-side auto-punch-out symbols | `hrms_backend/src/modules/attendance/service.ts`: `AttendanceService.listMyPunches` (line 465), `AttendanceService.addAutoPunchOutIfExpired` (line 1309) |
| Regularization decision/OCC symbols | `hrms_backend/src/modules/attendance/service.ts`: `AttendanceService.decideRegularization` (line 894); `hrms_backend/src/modules/attendance/repository.ts`: `AttendanceRepository.updateRegularizationVersioned` (line 216) |
| GET flush exclusion and mutation flush selection | `hrms_backend/src/app.ts` |
| PostgreSQL attendance cache flush/upsert methods | `hrms_backend/src/platform/postgres-data-store.ts`: `PostgresPersistence.flushAttendance` (line 3716), including daily-record and regularization-request upserts |
| PostgreSQL command daily projection method | `hrms_backend/src/modules/attendance/command-service.ts`: `projectDay` (line 620) |
| PostgreSQL expected-version session transitions | `hrms_backend/src/modules/attendance/command-repository.ts`: `AttendanceCommandTransactionRepository.startBreak` (line 675), `endBreak` (line 729), and `closeSession` (line 786) |
| Attendance schema and migrations | `hrms_backend/src/db/schema.ts`, `hrms_backend/src/db/migrations/0003_attendance.sql`, `hrms_backend/src/db/migrations/0029_attendance_command_transactions.sql` |
| Shared attendance schemas/types | `hrms_backend/src/shared/schemas.ts`, `hrms_backend/src/shared/types.ts` |
| Worker behavior | `hrms_backend/src/workers/attendance-auto-punchout-worker.ts` |
| Dashboard/report read consumers | `hrms_backend/src/modules/dashboard/service.ts`, `hrms_backend/src/modules/reports/service.ts` |
| Attendance tests | `hrms_backend/src/modules/attendance/__tests__/`, `hrms_backend/src/workers/__tests__/` |
| Architecture direction | `docs/architecture/adr/attendance/` |

## 17. Explicit unresolved items

1. Future sprint backlog IDs for all three implementation tracks are unassigned.
2. Product and engineering must approve operational-shift fallback behavior for employees without an assignment.
3. Migration/backfill ownership and historical attendance preservation rules require sprint-level design approval.
4. This checklist does not authorize implementation of geo functionality.
