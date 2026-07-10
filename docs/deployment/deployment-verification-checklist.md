# Deployment Verification Checklist

Last verified from the repository: 2026-06-30.

Use this checklist before and after hosted deployments.

## Pre-Deploy Checks

Backend:

```bash
cd hrms_backend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm api:docs:verify
pnpm db:verify:no-cross-schema-fks
```

Frontend:

```bash
cd hrms-client
pnpm install --frozen-lockfile
pnpm api:production-config-guard
pnpm build:vercel
```

For larger backend releases also run:

```bash
cd hrms_backend
pnpm test
pnpm verify:business
pnpm verify:quality
pnpm verify:implementation
pnpm verify:scalability
pnpm verify:regression
```

## Environment Config Checks

| Check | Dev | QA | Production |
| --- | --- | --- | --- |
| `NODE_ENV=production` for hosted backend | yes | yes | yes |
| `APP_ENV` correct | `development` | `qa` | `production` |
| `VITE_APP_ENV` correct | `development` | `qa` | `production` |
| `VITE_API_MOCK_FALLBACK=false` | yes | yes | yes |
| `CLOUDINARY_MOCK_UPLOADS=false` | yes for hosted dev | yes | yes |
| Separate DB/Valkey | yes | yes | yes |
| `OPENAPI_PUBLIC=false` | optional | optional | required unless approved |
| Secure cookies | yes | yes | yes |

## Migration Checks

Before deploying API code that depends on new schema:

```bash
cd hrms_backend
pnpm db:migrate:prod
pnpm db:verify:no-cross-schema-fks
```

If using Render pre-deploy commands, verify the migration command ran successfully in service logs.

## Post-Deploy API Smoke

Run the matching environment:

```bash
curl -i https://dev-api.hawkaii.in/api/v1/health/ready
curl -i https://qa-api.hawkaii.in/api/v1/health/ready
curl -i https://api.hawkaii.in/api/v1/health/ready
```

Expected:

- HTTP 200
- `status` is `ok`
- `app_env` matches environment
- database dependency is `ok`
- Valkey dependency is `ok`
- object storage dependency is `ok`
- version/build SHA are identifiable when configured

## Post-Deploy Frontend Smoke

Validate:

- frontend URL loads
- environment banner appears in hosted dev/QA
- login works
- refresh restores session through `/api/v1/auth/me`
- sidebar route visibility matches active role
- one backend-backed list screen loads
- one mutation works in the changed module
- no browser console error points to the wrong API base URL

## Module-Specific Smoke

| Changed Area | Smoke |
| --- | --- |
| Auth/email | Signup/verify or password reset in the target environment. |
| Documents/media | Upload and download one safe test file. |
| Expenses | Create ticket and view it in manager/finance queue when applicable. |
| Attendance | Punch in/out or load summary/calendar. |
| Leave/WFH | Apply and load manager queue. |
| Admin settings | Change a non-destructive setting and verify persistence after refresh. |
| Reports/exports | Generate or load an export and verify document handoff if supported. |
| Worker/outbox | Confirm worker service is running and no unexpected dead-letter growth. |

## Failure Handling

- If checks fail before deploy, do not deploy.
- If backend health fails after deploy, roll back API and worker together where possible.
- If frontend points to the wrong API, roll back or correct Vercel env and redeploy.
- If migration fails, stop deploy and follow `rollback-runbook.md`.
- Preserve request IDs, deploy SHA, environment, user/role, and timestamps for incident notes.

