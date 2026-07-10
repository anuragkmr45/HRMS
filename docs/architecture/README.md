# Architecture Documentation

Last verified from the repository: 2026-06-30.

This folder contains architecture documents for the current Hawkaii HRMS system. The intent is to explain durable system decisions and code boundaries. Operational procedures belong in `../runbooks/`; deployment environment setup belongs in `../deployment/`; onboarding summaries belong in `../knowledge-transfer/`.

## Architecture Set

| Document | Purpose |
| --- | --- |
| `system-architecture.md` | End-to-end runtime shape, package boundaries, request flow, and module map. |
| `frontend-architecture.md` | TanStack Start frontend structure, routing, auth state, domain adapters, UI conventions. |
| `backend-architecture.md` | Fastify backend composition, plugins, module conventions, workers, errors, tests. |
| `data-architecture.md` | PostgreSQL schemas, migrations, persistence adapters, seed data, exports, and no-cross-schema-FK rule. |
| `security-auth-rbac.md` | Auth, sessions, cookies, role split, permission boundaries, rate limits, production safety. |
| `integrations-events.md` | Cloudinary, Resend, Valkey, outbox, health, generated exports, and external boundary rules. |
| `email-verification.md` | Detailed Resend-backed email verification architecture. |

## Evidence Used

These docs were checked against:

- `README.md`
- `hrms_backend/src/app.ts`
- `hrms_backend/src/plugins/*.ts`
- `hrms_backend/src/modules/*`
- `hrms_backend/src/db/schema.ts`
- `hrms_backend/src/db/migrations/`
- `hrms_backend/docs/api/openapi.json`
- `hrms-client/src/routes/`
- `hrms-client/src/domains/`
- `hrms-client/src/shared/api/`
- `docs/deployment/*`

## Maintenance Rule

Update this folder when any of these change:

- module boundaries or route prefixes
- auth/session/RBAC behavior
- persistence schema or migration policy
- deployment-critical integration architecture
- worker/event behavior
- frontend route/domain-adapter conventions

