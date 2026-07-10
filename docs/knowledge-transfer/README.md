# Knowledge Transfer Pack

Last verified from the repository: 2026-06-30.

This pack is for onboarding developers to the whole Hawkaii HRMS project. It explains the current full-stack system as it exists in this repository: a TanStack Start frontend, a Fastify backend, PostgreSQL domain schemas, Valkey-backed sessions/outbox streams, Cloudinary media storage, and Resend email delivery.

## Reading Order

1. `project-overview.md`
2. `local-development.md`
3. `architecture.md`
4. `frontend-guide.md`
5. `backend-guide.md`
6. `database-and-data.md`
7. `api-contract-and-integrations.md`
8. `modules-and-roles.md`
9. `testing-release-qa.md`
10. `operations-runbooks.md`
11. `new-developer-checklist.md`

## Repository Shape

| Path | Purpose |
| --- | --- |
| `hrms-client/` | TanStack Start/React frontend, file-based routes, domain API adapters, UI components, Playwright tests, frontend contract checks. |
| `hrms_backend/` | Fastify API, PostgreSQL migrations, domain services, OpenAPI generation, workers, Docker runtime, Vitest tests. |
| `docs/` | Root documentation, KT pack, deployment runbooks, process docs, implementation status. |
| `qa/` | QA planning, evidence registers, validation logs, and test workbooks. |
| `infra/` | Render environment blueprints for hosted dev and QA. |
| `.github/workflows/branch-ci-cd.yml` | Branch checks and backend deploy-hook workflow. |

There is no root package manager workspace. The frontend and backend each have their own `package.json`, lockfile, install, and verification commands.

## Cross-Reference To Full Docs

| Need | Use |
| --- | --- |
| Whole-system architecture | `../architecture/README.md` |
| Hosted deployment setup | `../deployment/README.md` |
| Current implementation status | `../implementation/implementation-status-index.md` |
| Documentation completeness audit | `../implementation/documentation-coverage-audit.md` |
| Delivery and QA process | `../process/README.md` |
| Operational procedures | `../runbooks/README.md` |

## First Commands To Know

Backend:

```bash
cd hrms_backend
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

Frontend:

```bash
cd hrms-client
pnpm install
pnpm dev
```

Main local URLs:

| Service | URL |
| --- | --- |
| Frontend Vite app | `http://localhost:8080` |
| Backend API | `http://localhost:3001` |
| Backend ready health | `http://localhost:3001/health/ready` |
| Swagger UI, when public | `http://localhost:3001/docs` |
| OpenAPI JSON, when public | `http://localhost:3001/api/v1/openapi.json` |

## Practical Onboarding Rule

When changing product behavior, follow the flow from UI route to frontend domain adapter to backend route to service to repository/data store. Do not start from generated OpenAPI alone; the generated contract is excellent for exact request/response shape, but the code explains role scope, workflow rules, persistence behavior, and user-facing states.

## Important Caution

Do not copy values from `.env.local` into documentation, commits, screenshots, or tickets. Use only tracked `.env.*.example` files and environment docs when documenting configuration.
