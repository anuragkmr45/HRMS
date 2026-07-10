# Hawkaii HRMS Documentation

Last verified from the repository: 2026-06-30.

This directory is the main documentation entry point for the Hawkaii HRMS monorepo. It contains knowledge-transfer material for new developers, deployment runbooks, process references, architecture notes, and implementation status.

## Start Here

New developers should start with the KT pack:

- `knowledge-transfer/README.md` - reading order and onboarding path.
- `knowledge-transfer/project-overview.md` - product, repo, modules, and ownership map.
- `knowledge-transfer/local-development.md` - local backend/frontend setup.
- `knowledge-transfer/frontend-guide.md` - frontend architecture and route conventions.
- `knowledge-transfer/backend-guide.md` - backend architecture and module conventions.
- `knowledge-transfer/database-and-data.md` - schemas, migrations, persistence, and seed data.
- `knowledge-transfer/api-contract-and-integrations.md` - API contract, client integration, and external services.
- `knowledge-transfer/modules-and-roles.md` - role/module matrix and business workflows.
- `knowledge-transfer/testing-release-qa.md` - verification, CI, QA handoff, and release checks.
- `knowledge-transfer/operations-runbooks.md` - hosted operations and incident references.
- `knowledge-transfer/new-developer-checklist.md` - day-one checklist and first PR checklist.

## Existing Documentation Map

| Area | Documents |
| --- | --- |
| Architecture | `architecture/README.md`, `architecture/system-architecture.md`, `architecture/frontend-architecture.md`, `architecture/backend-architecture.md`, `architecture/data-architecture.md`, `architecture/security-auth-rbac.md`, `architecture/integrations-events.md` |
| Product and implementation status | `implementation/README.md`, `implementation/implementation-status-index.md`, `implementation/HRMS_PRODUCTION_TASK_SHEET.md` |
| Documentation coverage | `implementation/documentation-coverage-audit.md` |
| Email verification architecture | `architecture/email-verification.md`, `resend-email-verification-architecture-report.md` |
| Email verification deployment | `runbooks/resend-email-verification-deployment.md` |
| Hosted deployment | `deployment/README.md`, `deployment/hosted-deployment.md`, `deployment/environment-matrix.md`, `deployment/deployment-verification-checklist.md`, `deployment/secrets-checklist.md` |
| CI/CD and rollback | `deployment/ci-cd-runbook.md`, `deployment/rollback-runbook.md`, `deployment/dns-checklist.md` |
| Delivery process | `process/README.md`, `process/agile-delivery-plan.md`, `process/branching-release-process.md`, `process/release-governance.md`, `process/documentation-maintenance-process.md` |
| QA process | `process/qa-handoff-process.md`, `process/definition-of-ready.md`, `process/definition-of-done.md`, `process/sprint-ceremonies.md`, `process/developer-handoff-template.md` |
| Operations runbooks | `runbooks/README.md`, `runbooks/health-and-smoke-runbook.md`, `runbooks/incident-response-runbook.md`, `runbooks/database-backup-restore-runbook.md`, `runbooks/worker-operations-runbook.md`, `runbooks/media-storage-runbook.md` |

## Source Of Truth Rules

- Backend API behavior is sourced from `hrms_backend/docs/api/openapi.json` and generated frontend contract docs under `hrms_backend/docs/api/frontend-contract/`.
- Frontend API adapter behavior is sourced from `hrms-client/src/domains/*` and `hrms-client/src/shared/api/*`.
- Database schema and migration order are sourced from `hrms_backend/src/db/schema.ts` and `hrms_backend/src/db/migrations/`.
- Hosted environment values must come from the tracked example files and secret stores, not from `.env.local`.
- Stale or older handoff notes should not override the KT pack when they conflict with current code.
