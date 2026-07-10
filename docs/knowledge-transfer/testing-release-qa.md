# Testing, Release, And QA

Last verified from the repository: 2026-06-30.

This project has separate backend and frontend verification loops plus root process/QA docs.

## Backend Test Stack

Backend tests use Vitest projects configured in `hrms_backend/vitest.config.ts`.

Common commands:

```bash
cd hrms_backend
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm test:e2e
pnpm test
```

Integration tests need PostgreSQL, Valkey, and object storage-compatible config. Use:

```bash
pnpm test:infra:up
pnpm test:integration
pnpm test:infra:down
```

## Backend Verification Scripts

| Command | Purpose |
| --- | --- |
| `pnpm db:verify:no-cross-schema-fks` | Ensures migrations do not introduce cross-schema foreign keys. |
| `pnpm verify:business` | Business-rule verification. |
| `pnpm verify:quality` | Quality gate checks. |
| `pnpm verify:implementation` | Implementation/task-sheet consistency checks. |
| `pnpm verify:scalability` | Scalability/readiness checks. |
| `pnpm verify:regression` | Regression verification script. |
| `pnpm release:uat` | Release UAT runner. |
| `pnpm qa:uat` | QA UAT bundle for QA environment. |
| `pnpm qa:human` | Full human QA artifact runner. |

## Frontend Test Stack

Frontend checks use ESLint, Vite builds, contract guard scripts, and Playwright.

Common commands:

```bash
cd hrms-client
pnpm lint
pnpm build
pnpm build:vercel
pnpm api:production-config-guard
pnpm api:implemented-route-guard
pnpm api:frontend-contract:route-coverage
pnpm test:e2e
pnpm test:e2e:mobile-responsive
pnpm test:e2e:frontend-theme
```

## When To Run What

| Change Type | Minimum Verification |
| --- | --- |
| Backend service logic | `pnpm typecheck`, targeted unit/integration tests, relevant verify script. |
| Backend route/schema | Backend tests plus `pnpm api:docs:generate` and `pnpm api:docs:verify`. |
| DB migration | `pnpm db:migrate` on local/test DB, integration tests, `pnpm db:verify:no-cross-schema-fks`. |
| Frontend route/component | `pnpm lint`, `pnpm build`, relevant Playwright or route guard. |
| Frontend API adapter | `pnpm build`, route/API contract guard, backend contract verification if shape changed. |
| Auth/RBAC/security | Backend auth tests, frontend route guard checks, QA role matrix. |
| Upload/document/media | Backend integration tests, frontend upload flow check, Cloudinary/mock mode confirmation. |
| Deployment/env changes | Production config guard, hosted health checks, deployment runbook checks. |

## CI/CD Checks

Workflow:

```text
.github/workflows/branch-ci-cd.yml
```

Backend CI:

- Setup pnpm 10.25.0.
- Setup Node 24.
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm build`

Frontend CI:

- Setup pnpm 10.25.0.
- Setup Node 24.
- `pnpm install --frozen-lockfile`
- `pnpm api:production-config-guard`
- `pnpm build:vercel`

Deploy job triggers Render API and worker deploy hooks on push or manual workflow dispatch after checks pass.

## Branch Flow

| Branch | Purpose | Deploys |
| --- | --- | --- |
| Feature branch | Local development and PR work | No hosted deploy |
| `dev` | Shared integration | Hosted dev frontend/API |
| `qa` | QA/UAT | QA frontend/API |
| `main` | Production | Production frontend/API |

See `../deployment/ci-cd-runbook.md` and `../process/branching-release-process.md`.

## QA Handoff Checklist

Every meaningful handoff should include:

- Feature/module changed.
- Roles affected.
- Environment affected.
- Backend APIs changed.
- Frontend routes changed.
- DB migrations changed.
- Media/email/Valkey impact.
- Verification commands run.
- Known risks or blockers.
- Suggested test cases.

This matches `../process/qa-handoff-process.md`.

## QA Evidence

Collect:

- Screenshots or video.
- API response with `request_id`.
- Uploaded/downloaded file proof.
- Role/user used.
- Environment URL.
- Test case ID.

Backend QA artifacts are generally written under `hrms_backend/docs/qa/runs/`. Frontend QA artifacts are under `hrms-client/docs/qa/runs/`. Root QA planning lives under `qa/`.

## Release Gate Principles

- Production must use real backend APIs, not mock fallback.
- Production must not run seed/demo data.
- Production media uploads must use real Cloudinary config with mock uploads disabled.
- Production email delivery must use verified Resend sender/domain config when enabled.
- OpenAPI docs, route coverage, build checks, and targeted E2E should pass before release.
- User-facing actions should show success only after backend success.
- Sensitive values belong in secret stores, not source.

## Regression Scope By Module

| Module Changed | Suggested QA Focus |
| --- | --- |
| Auth/onboarding | Signup, verification, set password, login, session restore, role switching, company bootstrap. |
| Core employees | CRUD, hierarchy filters, role changes, profile photo, audit trail, imports/exports. |
| Attendance | Punch flows, breaks, calendar, exceptions, regularization, dashboard summaries, auto punch-out. |
| Leave/WFH | Apply, approval/reject/return, monitor, balances, holidays, reports. |
| Expenses | Draft, submit, manager queue, finance queue, payment, settlement, documents, audit. |
| Assets | Inventory, assign/return, requests, warranty, vendors, maintenance, employee view. |
| Helpdesk | Ticket create/detail, comments, internal notes, assignment, status, SLA, reports. |
| Admin settings | Master data, RBAC, workflows, policies, templates, security, audit logs. |
| Reports | Filters, role scope, pagination, export/document IDs, aggregate correctness. |

