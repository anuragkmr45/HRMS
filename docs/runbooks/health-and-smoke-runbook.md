# Health And Smoke Runbook

Last verified from the repository: 2026-06-30.

Use this runbook after deploys and when investigating basic availability.

## Health Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/health/live` | Lightweight liveness. |
| `/health/ready` | Readiness with dependency checks. |
| `/api/v1/health/live` | Versioned liveness. |
| `/api/v1/health/ready` | Versioned readiness. |

## Hosted Commands

```bash
curl -i https://dev-api.hawkaii.in/api/v1/health/ready
curl -i https://qa-api.hawkaii.in/api/v1/health/ready
curl -i https://api.hawkaii.in/api/v1/health/ready
```

Expected for healthy service:

- HTTP 200
- `status: "ok"`
- expected `app_env`
- expected `node_env`
- database dependency healthy
- Valkey dependency healthy
- object storage dependency healthy
- build metadata identifiable when configured

## Local Commands

```bash
curl -i http://localhost:3001/health/live
curl -i http://localhost:3001/health/ready
```

If local readiness fails:

1. Confirm Docker Postgres and Valkey are running.
2. Confirm `DATABASE_URL` points to local DB.
3. Run `pnpm db:migrate`.
4. Check Cloudinary/mock upload config.

## Frontend Smoke

For the matching environment:

1. Open frontend URL.
2. Confirm environment banner in hosted dev/QA.
3. Log in.
4. Refresh and confirm session restore.
5. Open dashboard.
6. Open one backend-backed list route.
7. Run one safe mutation in the changed module.
8. Confirm no browser console/network calls target the wrong environment.

## API Smoke By Module

| Area | Smoke |
| --- | --- |
| Auth | `/api/v1/auth/me` after login. |
| Dashboard | Dashboard summary loads. |
| Documents | Upload/download a small safe file in non-production. |
| Reports | Load one summary and export when supported. |
| Admin | Load company profile or audit log as Admin. |
| Notifications | Load feed and mark one read. |

## Escalation

If readiness is degraded:

- capture response body and request ID if present
- identify failing dependency
- check recent deploy/migration/config changes
- move to `incident-response-runbook.md`

