# System Architecture

Last verified from the repository: 2026-06-30.

Hawkaii HRMS is a two-package product monorepo:

- `hrms-client/` is the TanStack Start frontend.
- `hrms_backend/` is the Fastify backend API and worker package.

There is no root `package.json` workspace. Each package owns its own lockfile, scripts, and runtime checks.

## Runtime Topology

```text
Browser
  |
  | HTTPS, cookies, optional Authorization bearer token
  v
Vercel / local Vite frontend
  |
  | /api/v1 requests
  v
Render / local Fastify API
  |
  | PostgreSQL queries, Valkey session/outbox state, Cloudinary media writes,
  | Resend email sends and webhooks
  v
External/runtime services
```

Local development runs the frontend on `http://localhost:8080` and the backend on `http://localhost:3001`.

## Backend Composition

`hrms_backend/src/app.ts` is the central assembly point. It creates the Fastify instance, validates configuration, creates the runtime store and email delivery service, registers cross-cutting plugins, then registers domain modules.

Plugin order:

1. config
2. request context
3. error handling
4. security headers
5. CORS
6. multipart
7. compression
8. cookies
9. Swagger/OpenAPI
10. auth
11. rate limit
12. webhooks and domain modules

## Frontend Composition

`hrms-client/src/routes/__root.tsx` defines the root shell and providers. `hrms-client/src/routes/_app.tsx` defines the authenticated app layout with sidebar, topbar, environment banner, and outlet.

Frontend request flow:

```text
route/component
  -> domain query/mutation hook
  -> domain API adapter
  -> shared API client
  -> backend /api/v1/*
```

## Backend Modules

Current backend modules from `hrms_backend/src/modules/`:

| Module | Responsibility |
| --- | --- |
| `admin` | Company profile, master data, RBAC, workflows, policies, templates, channels, security, audit. |
| `assets` | Inventory, assignment, return, requests, acknowledgements, maintenance, vendors, recovery, licenses. |
| `attendance` | Punches, day records, summaries, calendars, regularization, exceptions, exports. |
| `auth` | Signup, verification, password setup/reset, login/logout, session context, company onboarding. |
| `core` | Employees, departments, designations, hierarchy, roles, profile photos, imports/exports. |
| `dashboard` | Role-aware dashboard summary. |
| `documents` | Upload, metadata, download URLs/content, verification, access logs, delete. |
| `ems` | Employee self-service, documents, requests, letters, policies, HR admin workflows. |
| `expenses` | Requester, manager, finance, payment, settlement, audit, backup assignments. |
| `health` | Liveness/readiness endpoints and deployment metadata. |
| `helpdesk` | Tickets, comments, internal notes, attachments, assignment, status, SLA, categories. |
| `leave-wfh` | Leave balances/requests, WFH requests, manager queues, holidays, exports. |
| `locations` | Location/selectors data. |
| `notifications` | Authenticated notification feed and read state. |
| `platform` | Finance governance and shared platform settings. |
| `projects` | Projects, members, allocations, milestones, documents, utilization. |
| `reports` | Cross-module reporting and generated export metadata. |
| `timesheets` | Work segments, submissions, approvals, workflow definitions, summaries. |
| `webhooks` | Resend webhook ingestion. |

## API Contract

The backend-generated OpenAPI contract currently has:

| Metric | Count |
| --- | ---: |
| Paths | 214 |
| Operations | 245 |

Source: `hrms_backend/docs/api/openapi.json`.

## Core Architectural Rules

- Backend APIs are the authority for business rules and permissions.
- Frontend role checks are UX/navigation only.
- Backend domain services own workflow rules; route handlers stay thin.
- PostgreSQL schemas are separated by domain.
- Cross-schema SQL foreign keys are intentionally disallowed.
- Documents/media always go through backend APIs and backend-owned object storage.
- Production must not use mock API fallback or mock object storage.
- Generated API docs must be regenerated when backend routes or schemas change.

