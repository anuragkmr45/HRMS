# Backend Guide

Last verified from the repository: 2026-06-30.

The backend lives in `hrms_backend/`. It is a standalone Node.js/TypeScript Fastify package with domain modules, PostgreSQL migrations, Valkey-backed runtime services, Cloudinary-backed object storage, Resend email delivery, OpenAPI generation, and Vitest test projects.

## Entry Points

| File | Purpose |
| --- | --- |
| `src/server.ts` | Loads env file and starts Fastify on `app.config.PORT`. |
| `src/app.ts` | Builds the Fastify app, registers plugins/modules, creates data store/email delivery, wires persistence flushes. |
| `src/plugins/config.ts` | Zod environment schema and production safety validation. |
| `src/platform/data-store.ts` | Memory data store and shared persistence interfaces. |
| `src/platform/postgres-data-store.ts` | PostgreSQL persistence adapter and Cloudinary object storage integration. |
| `src/db/schema.ts` | Drizzle schema definitions for domain schemas. |
| `src/db/migrations/` | Ordered SQL migrations. |
| `src/workers/` | Outbox and attendance auto punch-out workers. |

## Plugin Order

`buildApp()` registers cross-cutting plugins before domain modules:

1. Config
2. Request context
3. Error handler
4. Security headers
5. CORS
6. Multipart
7. Compression
8. Cookies
9. Swagger/OpenAPI
10. Auth
11. Rate limit
12. Webhooks and domain modules

This order matters because route handlers rely on `app.config`, `app.store`, `app.emailDelivery`, `request.requestId`, error normalization, cookies, and `request.actor`.

## Standard Module Shape

Most modules follow this layout:

```text
src/modules/<module>/
  index.ts          Registers routes with a prefix.
  routes.ts         HTTP routes, request parsing, response schemas.
  service.ts        Business workflow and orchestration.
  repository.ts     Persistence-specific reads/writes where needed.
  schemas.ts        Zod schemas and OpenAPI schema helpers.
  policy.ts         Authorization/scope helpers.
  state-machine.ts  Workflow transitions for modules with statuses.
  events.ts         Outbox/event helpers.
  errors.ts         Domain-specific error helpers.
  __tests__/        Unit or integration tests.
```

Not every module has every file. Small modules such as `dashboard`, `locations`, and `notifications` use a smaller shape.

## Registered Modules

| Module | Main Directory | Route Prefix |
| --- | --- | --- |
| Health | `src/modules/health` | `/health`, `/api/v1/health` |
| Webhooks | `src/modules/webhooks` | `/api/v1/webhooks` |
| Auth and onboarding | `src/modules/auth` | `/api/v1/auth`, `/api/v1/onboarding` |
| Core | `src/modules/core` | `/api/v1/core` |
| Dashboard | `src/modules/dashboard` | `/api/v1/dashboard` |
| Platform | `src/modules/platform` | `/api/v1/platform` |
| Expenses | `src/modules/expenses` | `/api/v1` expense paths |
| Documents | `src/modules/documents` | `/api/v1` document paths |
| Reports | `src/modules/reports` | `/api/v1/reports` |
| Assets | `src/modules/assets` | `/api/v1/assets` |
| Timesheets | `src/modules/timesheets` | `/api/v1/timesheets` |
| Attendance | `src/modules/attendance` | `/api/v1/attendance` |
| Leave/WFH | `src/modules/leave-wfh` | `/api/v1` leave/WFH paths |
| EMS | `src/modules/ems` | `/api/v1` EMS paths |
| Projects | `src/modules/projects` | `/api/v1` project paths |
| Helpdesk | `src/modules/helpdesk` | `/api/v1` helpdesk paths |
| Locations | `src/modules/locations` | `/api/v1/locations` |
| Notifications | `src/modules/notifications` | `/api/v1` notification paths |
| Admin | `src/modules/admin` | `/api/v1/admin` |

## Auth And Authorization

Important files:

| File | Purpose |
| --- | --- |
| `src/auth/index.ts` | Password hashing, JWT creation/verification, memory/Valkey session stores, permission helpers. |
| `src/plugins/auth.ts` | Fastify auth hook, public route allowlist, actor lookup. |
| `src/shared/constants.ts` | Backend role and permission constants. |
| `src/modules/*/policy.ts` | Domain-specific scope and authorization rules. |

Backend roles include `Employee`, `Reviewer`, `Director`, `Finance Manager`, `Admin`, `Auditor`, `Asset Manager`, and `HR Manager`. Frontend roles are not identical; translate them through session context and UI mapping instead of assuming string equality.

## Error Contract

Backend errors are normalized by `src/plugins/errors.ts`.

Standard shape:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": {},
  "request_id": "..."
}
```

Use helpers from `src/platform/errors.ts` for application errors:

- `badRequest`
- `unauthorized`
- `forbidden`
- `notFound`
- `conflict`
- `tooManyRequests`
- `selfApprovalBlocked`
- `missingRemarks`

Do not return raw database errors or stack traces to clients.

## Persistence Model

The backend supports memory and PostgreSQL-backed data store modes. Memory mode is used by some tests and API doc generation; production uses PostgreSQL plus object storage.

Key rules:

- Business logic belongs in services, not route handlers.
- Workflow transitions should live in state-machine helpers when status logic is non-trivial.
- Domain writes that emit business events should write outbox events.
- Workflow-critical mutations should leave audit history.
- Soft delete and version fields are common. Preserve optimistic concurrency when `expected_version` is part of the route.
- Do not add cross-schema SQL foreign keys.

## Workers

| Worker | Purpose | Main File |
| --- | --- | --- |
| Outbox worker | Publishes `platform.outbox_events` to Valkey streams and marks events published/retry/dead-letter. | `src/workers/outbox-worker.ts`, `src/workers/run-outbox-worker.ts` |
| Attendance auto punch-out | Closes expired attendance sessions based on active attendance policy and company timezone. | `src/workers/attendance-auto-punchout-worker.ts` |

Hosted deployments run API and worker separately. See `../deployment/hosted-deployment.md`.

## API Documentation

OpenAPI is generated from the Fastify app:

```bash
cd hrms_backend
pnpm api:docs:generate
pnpm api:docs:verify
```

Generated sources:

- `docs/api/openapi.json`
- `docs/api/frontend-contract/openapi.json`
- `docs/api/frontend-contract/ENDPOINT_INDEX.md`

The current generated contract contains 245 operations across 214 paths.

## Backend Checks

```bash
cd hrms_backend
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm test:e2e
pnpm db:verify:no-cross-schema-fks
pnpm verify:business
pnpm verify:quality
pnpm verify:implementation
pnpm verify:scalability
pnpm verify:regression
```

Integration tests require PostgreSQL, Valkey, and object storage configuration. Use `pnpm test:infra:up` for local test infrastructure.

## Adding A Backend Endpoint

1. Confirm the domain module and route prefix.
2. Add Zod request/response schemas.
3. Add route handler in `routes.ts`.
4. Put business behavior in `service.ts`.
5. Add repository/data-store changes if persistence is needed.
6. Enforce role/scope in service or `policy.ts`.
7. Add state-machine or event helpers when workflow status changes.
8. Write unit/integration/contract tests according to blast radius.
9. Regenerate and verify API docs.
10. Update frontend domain adapter and route coverage when the frontend consumes the endpoint.

