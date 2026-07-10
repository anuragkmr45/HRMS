# Integrations And Events Architecture

Last verified from the repository: 2026-06-30.

This document describes external integrations and event flow boundaries.

## Integration Map

| Integration | Purpose | Main Code |
| --- | --- | --- |
| PostgreSQL / Neon | Relational domain persistence. | `hrms_backend/src/platform/postgres-data-store.ts` |
| Valkey | Session/runtime state, rate-limit state, outbox stream publishing. | `hrms_backend/src/auth/index.ts`, `hrms_backend/src/workers/outbox-worker.ts` |
| Cloudinary | Backend-owned media/document/object storage. | `hrms_backend/src/platform/object-storage.ts` |
| Resend | Transactional email transport for verification and reset. | `hrms_backend/src/platform/email/` |
| Vercel | Frontend hosting. | `hrms-client/vercel.json`, `hrms-client/scripts/build-vercel.mjs` |
| Render | Backend API and worker hosting. | `render.yaml`, `infra/render/*.yaml` |

## Outbox Events

Business mutations can emit records to `platform.outbox_events`. The outbox worker reads pending/retry events and publishes them to Valkey streams.

Stream name pattern:

```text
hrms.<aggregate_type>
```

Event lifecycle:

```text
pending -> published
pending/retry -> retry -> dead_letter
```

The worker uses row locking for PostgreSQL-backed runs and retries failed publishes before marking events dead-letter.

## Email Delivery Events

Resend send attempts and webhook delivery telemetry are stored separately from auth token truth:

- `platform.email_deliveries`
- `platform.email_events`
- `platform.auth_tokens`

Webhook telemetry can update delivery status. It must not verify users.

## Object Storage Events

Document uploads are backend mediated:

1. Client sends multipart request to backend.
2. Backend validates MIME and size limits.
3. Backend may compress images/PDFs according to policy.
4. Backend writes to object storage.
5. Backend stores metadata/version/access records.
6. Client receives backend-owned metadata or download URL.

## Generated Exports

Report, attendance, leave/WFH, and employee exports can generate backend document records for supported formats. Export download handoff uses Documents APIs rather than exposing storage credentials.

## Health And Observability

Health endpoints return environment and dependency status:

- `/health/live`
- `/health/ready`
- `/api/v1/health/live`
- `/api/v1/health/ready`

Readiness includes data store, database, Valkey, object storage, app env, node env, version, build SHA, and uptime.

