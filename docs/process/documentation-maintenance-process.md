# Documentation Maintenance Process

Last verified from the repository: 2026-06-30.

Documentation changes are part of implementation, not a separate cleanup phase. Use this process to decide which docs must be updated with each code/config change.

## Required Documentation Checks By Change Type

| Change Type | Required Docs To Check |
| --- | --- |
| Backend API route/schema | `hrms_backend/docs/api/*`, `docs/implementation/implementation-status-index.md`, `docs/knowledge-transfer/api-contract-and-integrations.md` |
| Backend module boundary | `docs/architecture/backend-architecture.md`, `docs/architecture/system-architecture.md`, `docs/knowledge-transfer/backend-guide.md` |
| Frontend route or domain adapter | `docs/architecture/frontend-architecture.md`, `docs/knowledge-transfer/frontend-guide.md`, `docs/knowledge-transfer/modules-and-roles.md` |
| Database migration/schema | `docs/architecture/data-architecture.md`, `docs/knowledge-transfer/database-and-data.md`, deployment verification docs if deploy order changes |
| Auth/session/RBAC/security | `docs/architecture/security-auth-rbac.md`, `docs/deployment/secrets-checklist.md`, `docs/process/qa-handoff-process.md` |
| External integration | `docs/architecture/integrations-events.md`, matching `docs/runbooks/*`, deployment secrets/checklist |
| Worker behavior | `docs/architecture/integrations-events.md`, `docs/runbooks/worker-operations-runbook.md` |
| Hosted deployment config | `docs/deployment/*`, `docs/runbooks/health-and-smoke-runbook.md` |
| QA or release process | `docs/process/*`, `docs/knowledge-transfer/testing-release-qa.md` |
| New developer onboarding | `docs/knowledge-transfer/*`, `docs/README.md` |

## Generated Docs Rule

Do not hand-edit generated OpenAPI operation detail when backend routes/schemas change. Run:

```bash
cd hrms_backend
pnpm api:docs:generate
pnpm api:docs:verify
```

Then sync mirrored frontend contract docs if the team workflow requires it.

## Review Checklist

Before handoff, answer:

- Did the API contract change?
- Did a visible route, role, workflow, or state change?
- Did migration or seed behavior change?
- Did env/config/secrets/deployment behavior change?
- Did an operational procedure change?
- Did QA need new evidence or test cases?

If yes, update the matching docs before marking done.

## Doc Quality Rules

- Link to source files and generated contracts instead of duplicating long schema details.
- Keep current-state summaries separate from historical task notes.
- Use exact environment names and URLs from `docs/deployment/environment-matrix.md`.
- Never include `.env.local` values or real secrets.
- Mark deferred work explicitly as deferred; do not imply it is implemented.

