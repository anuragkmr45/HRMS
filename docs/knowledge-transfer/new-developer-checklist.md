# New Developer Checklist

Last verified from the repository: 2026-06-30.

Use this checklist for onboarding and first feature handoff.

## Day 0 Access

- Repository access.
- Package manager installed: pnpm 10.
- Node installed: Node 22+ locally, Node 24 recommended to match CI.
- Docker installed and running.
- Access to local-safe env values or an approved `.env.local` template.
- Access to dev/QA URLs if the developer will test hosted behavior.
- Access to project tracker and QA artifacts if required by team process.

## Day 1 Reading

Read in this order:

1. `README.md` at repository root.
2. `docs/README.md`.
3. `docs/knowledge-transfer/README.md`.
4. `docs/knowledge-transfer/project-overview.md`.
5. `docs/knowledge-transfer/local-development.md`.
6. The frontend or backend guide depending on assigned work.
7. `docs/knowledge-transfer/modules-and-roles.md`.
8. Existing deployment/process docs only as needed.

## Local Setup Validation

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

Validate:

- Frontend loads at `http://localhost:8080`.
- Backend ready health returns 200 at `http://localhost:3001/health/ready`.
- Login/session flow works with seeded data or assigned local credentials.
- At least one backend API request succeeds from frontend devtools network tab.

## Codebase Walkthrough

Trace one complete feature:

1. Open a route under `hrms-client/src/routes/_app/`.
2. Find the domain hook/API in `hrms-client/src/domains/<domain>/`.
3. Follow the call into `hrms-client/src/shared/api/client.ts`.
4. Find the backend route in `hrms_backend/src/modules/<module>/routes.ts`.
5. Follow route to service, repository/data store, policy, and tests.
6. Check the corresponding OpenAPI entry in `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`.

Recommended starter flows:

- Auth/session: `/login` -> `/api/v1/auth/login` -> `/api/v1/auth/me`.
- Employees: `/employees` -> `core` domain -> `/api/v1/core/users`.
- Expenses: `/expenses` -> `expenses` domain -> requester/manager/finance routes.
- Assets: `/assets` -> `assets` domain -> inventory/assignment routes.

## First PR Checklist

- Scope is clear and linked to a module.
- Roles affected are identified.
- Backend API changes regenerate docs.
- DB migrations are additive or clearly explained.
- Frontend routes and API adapters are updated together.
- Loading, empty, error, and permission states are handled.
- Tests/checks run are listed in handoff.
- QA test cases are suggested.
- Secrets are not included in code, docs, logs, or screenshots.

## Handoff Template

```text
Module:
Summary:
Roles affected:
Frontend routes changed:
Backend APIs changed:
DB migrations:
Env/config impact:
Media/email/Valkey impact:
Verification run:
QA scenarios:
Known risks:
Docs updated:
```

## KT Session Agenda

Use this for a 60 to 90 minute developer KT:

1. Product scope and role model.
2. Repo structure and separate frontend/backend package workflows.
3. Local setup and environment safety.
4. Auth/session and API request flow.
5. One module deep dive from route to database.
6. OpenAPI generation and frontend domain adapter conventions.
7. Testing and QA handoff expectations.
8. Deployment model and production blockers.
9. First assigned ticket and expected verification.

## Doc Maintenance Checklist

Update KT docs when any of these change:

- New module, route family, or role.
- New backend API tag or major endpoint group.
- Changed auth/session behavior.
- Changed environment variables or production blockers.
- New migration changes domain ownership or persistence rules.
- New worker or external integration.
- CI/CD or deployment flow changes.
- QA handoff process changes.

Documentation should point to source files and generated contracts rather than copying long endpoint schemas by hand.

