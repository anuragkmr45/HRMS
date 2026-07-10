# Operations Runbooks

Last verified from the repository: 2026-06-30.

This document points new developers to the operational model and the most important runbooks. It is not a replacement for the deployment docs under `docs/deployment/`.

## Hosted Architecture

| Layer | Hosted Service |
| --- | --- |
| Frontend | Vercel, one project per hosted environment. |
| Backend API | Render Docker web service. |
| Background worker | Render Docker worker. |
| Database | Neon PostgreSQL. |
| Session/rate/outbox state | Render Key Value / Valkey. |
| Media storage | Cloudinary. |
| Transactional email | Resend. |

Primary reference: `../deployment/hosted-deployment.md`.

## Environment Matrix

| Environment | Branch | Frontend | API | Backend `APP_ENV` | Frontend `VITE_APP_ENV` |
| --- | --- | --- | --- | --- | --- |
| Local | feature/local | `http://localhost:8080` | `http://localhost:3001` | `local` | local/unset |
| Hosted dev | `dev` | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` | `development` | `development` |
| QA/UAT | `qa` | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` | `qa` | `qa` |
| Production | `main` | `https://hawkaii.in` | `https://api.hawkaii.in` | `production` | `production` |

Full reference: `../deployment/environment-matrix.md`.

## Health Checks

| Endpoint | Purpose |
| --- | --- |
| `/health/live` | Lightweight liveness. |
| `/health/ready` | Readiness, including dependencies. |
| `/api/v1/health/live` | Versioned liveness. |
| `/api/v1/health/ready` | Versioned readiness for hosted smoke checks. |

Hosted post-deploy smoke examples:

```bash
curl -i https://dev-api.hawkaii.in/api/v1/health/ready
curl -i https://qa-api.hawkaii.in/api/v1/health/ready
curl -i https://api.hawkaii.in/api/v1/health/ready
```

## Deploy Flow

Frontend:

- Vercel Git integration deploys the matching branch/project.
- Project root is `hrms-client`.
- Build command is `pnpm build:vercel`.

Backend:

- GitHub Actions validates backend/frontend checks.
- On push to `dev`, `qa`, or `main`, Actions triggers matching Render API and worker deploy hooks.
- Render builds from Docker and runs API/worker services separately.

Required GitHub secrets:

- `DEV_RENDER_API_DEPLOY_HOOK_URL`
- `DEV_RENDER_WORKER_DEPLOY_HOOK_URL`
- `QA_RENDER_API_DEPLOY_HOOK_URL`
- `QA_RENDER_WORKER_DEPLOY_HOOK_URL`
- `PROD_RENDER_API_DEPLOY_HOOK_URL`
- `PROD_RENDER_WORKER_DEPLOY_HOOK_URL`

## Secrets And Config

Backend hosted secrets include:

- `DATABASE_URL`
- `VALKEY_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `RESEND_API_KEY` when email send mode is enabled
- `RESEND_WEBHOOK_SECRET` when Resend webhooks are enabled

Frontend hosted env includes:

- `VITE_APP_ENV`
- `VITE_APP_VERSION`
- `VITE_BUILD_SHA`
- `VITE_API_BASE_URL`
- `VITE_API_ENABLED=true`
- `VITE_API_MOCK_FALLBACK=false`

Reference: `../deployment/secrets-checklist.md`.

## Production Blockers

Do not ship production when any of these are true:

- Weak/default JWT secrets.
- `CLOUDINARY_MOCK_UPLOADS=true`.
- Frontend mock fallback enabled.
- `OPENAPI_PUBLIC=true` without explicit approval.
- Email send mode enabled without Resend API key, verified sender, and webhook secret.
- Dev/QA/prod share the same `DATABASE_URL` or Valkey service.
- Migrations have not been applied.
- Backend or frontend build checks fail.
- Login/session restore or health checks fail.

## Rollback

Start with `../deployment/rollback-runbook.md`.

General order:

1. Identify whether the issue is frontend, backend API, worker, DB migration, or external service config.
2. Preserve evidence: URL, request ID, logs, deploy SHA, role/user, exact time.
3. If API is unhealthy, roll back Render API service to the previous successful deploy.
4. If worker is causing event churn, stop/roll back the worker service.
5. If frontend is broken but API is healthy, roll back Vercel deployment.
6. Treat DB rollback as a separate approved operation. Prefer forward fixes unless a tested rollback script exists.

## DNS

Reference: `../deployment/dns-checklist.md`.

Expected production hostnames:

- `hawkaii.in`
- `api.hawkaii.in`

Expected non-production hostnames:

- `dev.hawkaii.in`
- `dev-api.hawkaii.in`
- `qa.hawkaii.in`
- `qa-api.hawkaii.in`

## Email Delivery Operations

Reference docs:

- `../architecture/email-verification.md`
- `../runbooks/resend-email-verification-deployment.md`

Important points:

- `EMAIL_DELIVERY_MODE=log` is suitable for local development.
- `EMAIL_DELIVERY_MODE=disabled` can be used before opening public signup.
- `EMAIL_DELIVERY_MODE=send` requires Resend config and verified sender/domain.
- Resend webhooks record delivery telemetry; token validity is controlled by backend auth token records.

## Media Operations

Cloudinary production rules:

- Use real Cloudinary credentials.
- Keep per-environment product environments or strict folders.
- Do not expose API secret to frontend.
- Keep `CLOUDINARY_MOCK_UPLOADS=false` in hosted QA and production.

## Incident Notes For Developers

When investigating incidents:

- Always capture `request_id` from API errors.
- Check environment banner/build SHA on frontend in dev/QA.
- Check backend health metadata for `app_env`, `node_env`, `version`, and `build_sha`.
- Compare frontend `VITE_API_BASE_URL` with the active backend environment.
- Confirm worker and API are on compatible deploy SHAs after backend releases.

