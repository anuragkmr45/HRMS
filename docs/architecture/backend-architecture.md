# Backend Architecture

Last verified from the repository: 2026-06-30.

The backend package is `hrms_backend/`. It is a standalone Fastify API and worker runtime.

## Entry Points

| File | Purpose |
| --- | --- |
| `src/server.ts` | Loads `HRMS_ENV_FILE` or `.env.local`, builds the app, listens on configured port. |
| `src/app.ts` | Fastify construction, plugin registration, data store creation, email delivery creation, module registration. |
| `src/workers/run-outbox-worker.ts` | Production outbox worker entry. |

## Cross-Cutting Plugins

| Plugin | Purpose |
| --- | --- |
| `config.ts` | Zod env parsing and production safety validation. |
| `request-context.ts` | Request ID/correlation. |
| `errors.ts` | Standard API error shape. |
| `security-headers.ts` | API security headers. |
| `compress.ts` | Compression. |
| `cookies.ts` | Cookie handling. |
| `auth.ts` | JWT/session auth and `request.actor`. |
| `rate-limit.ts` | Runtime rate limiting. |

## Module Pattern

Most domains use this shape:

```text
src/modules/<module>/
  index.ts
  routes.ts
  service.ts
  repository.ts
  schemas.ts
  policy.ts
  state-machine.ts
  events.ts
  errors.ts
  __tests__/
```

Small modules may not need every file. Business behavior belongs in `service.ts`, not in route handlers.

## Route Prefixes

| Module | Prefix |
| --- | --- |
| Health | `/health`, `/api/v1/health` |
| Webhooks | `/api/v1/webhooks` |
| Auth | `/api/v1/auth` |
| Onboarding | `/api/v1/onboarding` |
| Core | `/api/v1/core` |
| Dashboard | `/api/v1/dashboard` |
| Platform | `/api/v1/platform` |
| Admin | `/api/v1/admin` |
| Assets | `/api/v1/assets` |
| Attendance | `/api/v1/attendance` |
| Timesheets | `/api/v1/timesheets` |
| Reports | `/api/v1/reports` |
| Locations | `/api/v1/locations` |
| Other product modules | Registered under `/api/v1` with route paths owned by each module. |

## Error Shape

All expected application errors should use `AppError` helpers from `src/platform/errors.ts`.

Standard response:

```json
{
  "code": "FORBIDDEN",
  "message": "Forbidden",
  "details": {},
  "request_id": "..."
}
```

Unhandled errors are logged and returned as generic internal server errors.

## Persistence

The app decorates Fastify with `app.store`.

Supported data store modes:

- memory store for tests and API doc generation
- PostgreSQL store for runtime

Successful mutations trigger targeted persistence flushes in `src/app.ts`. New mutation route prefixes must be checked against the flush target logic.

## Workers

| Worker | Purpose |
| --- | --- |
| Outbox worker | Publishes pending/retry outbox events to Valkey streams and marks published/retry/dead-letter state. |
| Attendance auto punch-out worker | Closes expired attendance sessions based on active attendance policy and company timezone. |

## Backend Verification

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

