# Implementation Status Index

Last verified from the repository: 2026-06-30.

This is the short implementation index. The detailed historical log remains in `HRMS_PRODUCTION_TASK_SHEET.md`.

## Current Verified Snapshot

| Area | Evidence |
| --- | --- |
| Backend API contract | `hrms_backend/docs/api/openapi.json` has 245 operations across 214 paths. |
| Backend domains | 19 module directories exist under `hrms_backend/src/modules/`. |
| Frontend routes | 87 route files exist under `hrms-client/src/routes/`. |
| Frontend API domains | 17 domain folders exist under `hrms-client/src/domains/`. |
| Database migrations | 25 SQL migrations exist under `hrms_backend/src/db/migrations/`. |
| Hosted deployment docs | `docs/deployment/` covers environment matrix, hosted deployment, CI/CD, DNS, secrets, verification, and rollback. |
| KT docs | `docs/knowledge-transfer/` contains onboarding, architecture, frontend/backend, database, modules, testing, operations, and checklist docs. |

## Implementation Sources Of Truth

| Question | Source |
| --- | --- |
| Which API routes are implemented? | `hrms_backend/docs/api/openapi.json`, `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md` |
| Which frontend routes exist? | `hrms-client/src/routes/`, `hrms-client/src/routeTree.gen.ts` |
| Which backend modules exist? | `hrms_backend/src/app.ts`, `hrms_backend/src/modules/` |
| Which DB schema exists? | `hrms_backend/src/db/schema.ts`, `hrms_backend/src/db/migrations/` |
| Which hosted environments exist? | `docs/deployment/environment-matrix.md` |
| Which work remains or was deferred historically? | `HRMS_PRODUCTION_TASK_SHEET.md`, `qa/FUTURE_SCOPE_AFTER_TEST_SHEET.md` |

## Verification Commands

Backend:

```bash
cd hrms_backend
pnpm typecheck
pnpm build
pnpm api:docs:verify
pnpm db:verify:no-cross-schema-fks
pnpm verify:implementation
pnpm verify:scalability
```

Frontend:

```bash
cd hrms-client
pnpm api:production-config-guard
pnpm api:implemented-route-guard
pnpm api:frontend-contract:route-coverage
pnpm build
```

## Status Rules

- A backend API is implemented only when it appears in generated OpenAPI and has code/tests/docs evidence.
- A frontend feature is API-integrated only when the route uses a domain adapter/query hook in API mode.
- A migration is current only when it is in `src/db/migrations/`, applies successfully, and passes the no-cross-schema-FK guard.
- Hosted readiness requires both API health and frontend login/session smoke.

