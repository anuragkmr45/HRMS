# Architecture

Last verified from the repository: 2026-06-30.

## Runtime View

```text
Browser
  |
  | TanStack Start frontend, fetch with credentials and optional bearer token
  v
Frontend app: hrms-client
  |
  | /api/v1 requests through shared API client and domain adapters
  v
Fastify API: hrms_backend
  |
  | plugins: config, request context, errors, security headers, CORS, multipart,
  | compression, cookies, Swagger/OpenAPI, auth, rate limit
  v
Domain modules
  |
  | services + repositories + policy/state-machine helpers
  v
PostgreSQL domain schemas

Supporting services:
  - Valkey for session records, rate-limit state, and outbox stream publishing.
  - Cloudinary-compatible storage for documents, profile photos, company logo, and media.
  - Resend for email verification and password reset delivery.
  - Background workers for outbox publishing and attendance auto punch-out.
```

## Backend Request Flow

1. `hrms_backend/src/server.ts` loads the environment file and calls `buildApp()`.
2. `hrms_backend/src/app.ts` creates Fastify, validates config, creates the runtime data store, wires email delivery, and registers plugins.
3. `authPlugin` reads the session cookie or bearer token, verifies JWT claims, resolves the session from the session store, and decorates `request.actor`.
4. Route handlers validate request input with Zod or Fastify schemas.
5. Route handlers delegate business behavior to services.
6. Services enforce role/scope/workflow rules and call repositories or the shared data store.
7. Successful mutations flush the affected persistence domain and may write outbox/audit records.
8. Errors return the standard API shape from `errorsPlugin`.

## Backend Module Registration

The API registers modules in `hrms_backend/src/app.ts`. Key prefixes:

| Module | Prefix |
| --- | --- |
| Health | `/health/*`, `/api/v1/health/*` |
| Webhooks | `/api/v1/webhooks` |
| Auth | `/api/v1/auth` |
| Onboarding | `/api/v1/onboarding` |
| Core employees | `/api/v1/core` |
| Dashboard | `/api/v1/dashboard` |
| Platform | `/api/v1/platform` |
| Expenses | `/api/v1/expenses`, plus finance/manager subpaths |
| Documents | `/api/v1/documents` |
| Reports | `/api/v1/reports` |
| Assets | `/api/v1/assets` |
| Timesheets | `/api/v1/timesheets` |
| Attendance | `/api/v1/attendance` |
| Leave/WFH | `/api/v1/leave-wfh` |
| EMS | `/api/v1/ems` |
| Projects | `/api/v1/projects` |
| Helpdesk | `/api/v1/helpdesk` |
| Locations | `/api/v1/locations` |
| Notifications | `/api/v1/notifications` |
| Admin | `/api/v1/admin` |

## Frontend Request Flow

1. `hrms-client/src/routes/__root.tsx` creates app-level providers: React Query, theme, auth, module stores, tooltip provider, and toaster.
2. `hrms-client/src/routes/_app.tsx` protects the authenticated app shell and redirects unauthenticated users to `/login`.
3. Sidebar visibility comes from `ROLE_MAP[activeRole].modules` in `hrms-client/src/lib/mock/roles.ts` and `hrms-client/src/components/app-sidebar.tsx`.
4. Feature routes call domain hooks or APIs under `hrms-client/src/domains/<domain>/`.
5. Domain APIs call `apiRequest()` in `hrms-client/src/shared/api/client.ts`.
6. The shared API client attaches the access token when present, uses `credentials: "include"`, handles API errors, and notifies auth on 401.
7. Some older/demo paths still have local store or mock fallback support. Production mode disables API mock fallback.

## Data Architecture

The backend uses PostgreSQL schemas per domain:

```text
core
platform
expenses
documents
assets
timesheets
attendance
leave_wfh
ems
projects
helpdesk
```

The project intentionally avoids cross-schema SQL foreign keys. Domain relationships are enforced in service/repository logic and verified by `pnpm db:verify:no-cross-schema-fks`.

## Auth And Session Architecture

- Password hashing uses Node crypto `scrypt`.
- JWTs are HMAC-signed and include `sub`, `jti`, `roles`, `employee_code`, `iat`, and `exp`.
- Sessions are stored in memory locally/test or Valkey/PostgreSQL-backed runtime state depending on store mode.
- Requests authenticate through either the configured session cookie or `Authorization: Bearer <token>`.
- The frontend persists the access token client-side for API calls and also sends cookies for session restore.
- Public backend paths are explicitly listed in `hrms_backend/src/plugins/auth.ts`.

## Persistence And Events

- `createMemoryDataStore()` supports tests and local generation tasks.
- `createPostgresDataStore()` uses PostgreSQL plus Cloudinary object storage options.
- Mutating routes trigger a targeted persistence flush when possible; otherwise the app logs and falls back to a full flush.
- Business events are written to `platform.outbox_events`.
- `OutboxWorker` publishes pending events to Valkey streams named like `hrms.<aggregate_type>`.

## External Integrations

| Integration | Purpose | Main Code |
| --- | --- | --- |
| Cloudinary | Backend-owned media/document persistence. | `hrms_backend/src/platform/object-storage.ts` |
| Resend | Email verification and password reset delivery. | `hrms_backend/src/platform/email/` |
| Valkey | Sessions, rate limits, outbox stream publishing. | `hrms_backend/src/auth/index.ts`, `hrms_backend/src/workers/outbox-worker.ts` |
| Neon/PostgreSQL | Hosted relational persistence. | `hrms_backend/src/platform/postgres-data-store.ts` |
| Vercel | Frontend hosting. | `hrms-client/vercel.json`, `hrms-client/scripts/build-vercel.mjs` |
| Render | Backend API and worker hosting. | `render.yaml`, `infra/render/` |

