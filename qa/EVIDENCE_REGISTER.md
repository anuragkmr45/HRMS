# Evidence Register

Evidence ID: EV-001
Topic: Repo discovery
Claim: Consolidated repo has backend, frontend, docs, and qa folders.
Evidence source file(s): pwd, ls, git status
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Use /Users/anuragkumar/Desktop/hawkaii-hrms as active root.

Evidence ID: EV-002
Topic: Backend roles
Claim: Backend role constants include Admin, Employee, Reviewer, Finance Manager, Auditor, Director.
Evidence source file(s): hrms_backend/src/shared/constants.ts and seed/store references
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Map Reviewer to Manager in user-facing frontend.

Evidence ID: EV-003
Topic: Expense policy
Claim: Manager/finance actions are guarded by policy helpers and expense route snapshot.
Evidence source file(s): hrms_backend/src/modules/expenses/policy.ts, service.ts
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Remove Admin self-processing bypass and require independent approvers.

Evidence ID: EV-004
Topic: Attendance policy
Claim: Attendance service computes daily records, punch windows, and summaries.
Evidence source file(s): hrms_backend/src/modules/attendance/service.ts
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Add check-in work date grouping and weekly balance fields.

Evidence ID: EV-005
Topic: Documents
Claim: Doc access logs are immutable; storage adapter supports removeObject.
Evidence source file(s): 0001_initial.sql, documents/service.ts, object-storage.ts
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Hard-delete metadata/storage while preserving immutable access logs.

Evidence ID: EV-006
Topic: Cloudinary
Claim: Cloudinary adapter supports mock and real modes.
Evidence source file(s): object-storage.ts, config.ts
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Block mock outside local/dev/test.

Evidence ID: EV-007
Topic: Email verification UI
Claim: Verify page previously auto-submitted token on open.
Evidence source file(s): hrms-client/src/routes/verify-email.tsx
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Auto-submit only in dev/local.

Evidence ID: EV-008
Topic: Projects
Claim: Project member/allocation schemas accept allocation percent.
Evidence source file(s): shared/schemas.ts, projects/service.ts
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Require acknowledgement for >100 percent allocation.

Evidence ID: EV-009
Topic: Admin policies
Claim: Admin policies are persisted and rendered in settings.
Evidence source file(s): admin/service.ts, admin-settings.policies.tsx
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Expose read-only leave calculation preview.

Evidence ID: EV-010
Topic: Verification
Claim: Backend/Frontend typechecks, builds, lint, docs, DB FK, unit/contracts/integration command results captured.
Evidence source file(s): `qa/QA_TIMELINE_VALIDATION_LOG.md`
Relevant command(s): See `qa/QA_TIMELINE_VALIDATION_LOG.md` for current QA artifact validation; earlier implementation evidence is retained in git history.
Confidence: High
Decision: Use as release verification evidence.
