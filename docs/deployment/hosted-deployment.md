# Hosted Deployment Guide

This guide describes the recommended hosted deployment shape for Hawkaii HRMS using:

- Frontend: Vercel for the TanStack Start frontend, using Nitro build output.
- Backend: Render Docker web service.
- Worker: Render Docker background worker.
- Database: Neon Postgres.
- Session/rate/outbox state: Render Key Value / Valkey.
- Media storage: Cloudinary.
- Transactional email: Resend.

## Recommended Domains

Use `https://hawkaii.in` as the production HRMS frontend so customers see the authentic product domain. Keep non-production environments and APIs on explicit subdomains.

| Environment | Frontend | Backend API |
| --- | --- | --- |
| Production | `https://hawkaii.in` | `https://api.hawkaii.in` |
| QA/UAT | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` |
| Dev | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` |

DNS records are normally CNAMEs:

| Host | Points to |
| --- | --- |
| root `@` / `qa` / `dev` | Frontend hosting provider |
| `api` / `qa-api` / `dev-api` | Render backend service custom domain |

## Backend Hosting On Render

Use the root `render.yaml` blueprint for production. It creates:

- `hawkaii-hrms-api`: Docker web service for Fastify.
- `hawkaii-hrms-outbox-worker`: Docker worker for outbox publishing.
- `hawkaii-hrms-valkey`: Render Key Value service.

The backend uses Docker because the app supports server-side PDF compression through Ghostscript, and the checked-in Dockerfile installs `ghostscript`.

For hosted non-production environments, use the environment-specific blueprints:

| Environment | Blueprint path | Frontend | Backend API |
| --- | --- | --- | --- |
| Dev | `infra/render/render.dev.yaml` | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` |
| QA/UAT | `infra/render/render.qa.yaml` | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` |
| Production | `render.yaml` | `https://hawkaii.in` | `https://api.hawkaii.in` |

Development work still happens locally. Hosted dev is for shared integration testing, customer-like demos, and testing real hosted services without touching QA or production.

## Branch-Based CI/CD

GitHub Actions workflow:

```text
.github/workflows/branch-ci-cd.yml
```

Branch mapping:

| Git branch | Environment | Frontend | Backend API | Render blueprint |
| --- | --- | --- | --- | --- |
| `dev` | Hosted dev | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` | `infra/render/render.dev.yaml` |
| `qa` | QA/UAT | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` | `infra/render/render.qa.yaml` |
| `main` | Production | `https://hawkaii.in` | `https://api.hawkaii.in` | `render.yaml` |

The workflow runs backend and frontend checks first. On push to `dev`, `qa`, or `main`, it triggers the matching Render API and worker deploy hooks only after checks pass. Current repo evidence shows `main` is the only production branch; `master` is intentionally not an active deploy branch.

Required GitHub repository secrets:

| Secret | Used for |
| --- | --- |
| `DEV_RENDER_API_DEPLOY_HOOK_URL` | Deploy hosted dev API |
| `DEV_RENDER_WORKER_DEPLOY_HOOK_URL` | Deploy hosted dev worker |
| `QA_RENDER_API_DEPLOY_HOOK_URL` | Deploy QA API |
| `QA_RENDER_WORKER_DEPLOY_HOOK_URL` | Deploy QA worker |
| `PROD_RENDER_API_DEPLOY_HOOK_URL` | Deploy production API |
| `PROD_RENDER_WORKER_DEPLOY_HOOK_URL` | Deploy production worker |

Render setup requirement:

- Configure each Render service to build from its matching Git branch.
- If you want CI-gated deployments, turn off Render auto-deploy and let GitHub Actions trigger deploy hooks.
- If Render auto-deploy stays enabled, Render can deploy before checks finish, which defeats the purpose of gated CI.
- Render service health checks should use `/api/v1/health/live`. Use `/api/v1/health/ready` for manual deployment smoke because it checks PostgreSQL, Valkey, and object storage and is intentionally heavier.

Frontend setup requirement:

- Create three Vercel frontend projects, or equivalent isolated Vercel deployments:
  - production project: branch main, custom domain https://hawkaii.in
  - QA project: branch qa, custom domain https://qa.hawkaii.in
  - hosted dev project: branch dev, custom domain https://dev.hawkaii.in
- Set Vercel project root directory to hrms-client.
- Set install command to pnpm install --frozen-lockfile.
- Set build command to pnpm build:vercel.
- Set each frontend project env from the matching tracked example file.
- The current GitHub workflow validates frontend builds. Vercel Git integration should perform frontend deployment, while GitHub Actions deploys the Render backend only.

### Production Domain Values

`render.yaml` is already set for the selected `hawkaii.in` domain:

| Key | Production value |
| --- | --- |
| `APP_URL` | `https://api.hawkaii.in` |
| `API_BASE_URL` | `https://api.hawkaii.in` |
| `FRONTEND_URL` | `https://hawkaii.in` |
| `CORS_ALLOWED_ORIGINS` | `https://hawkaii.in` |
| `CLOUDINARY_FOLDER` | `hawkaii-hrms/prod` or your preferred folder |
| `RESEND_FROM_EMAIL` | Verified sender, for example `Hawkaii HRMS <verify@hawkaii.in>` |
| `RESEND_REPLY_TO_EMAIL` | Support mailbox |

Render prompts for all `sync: false` values during setup. Use the same `DATABASE_URL`, Cloudinary credentials, and JWT secrets for the API and worker where applicable.

## Environment Isolation Decision

Use isolated hosted resources for dev, QA, and production. The recommended default is:

| Resource | Best choice | Why |
| --- | --- | --- |
| PostgreSQL / Neon | One Neon project with long-lived `main`/production, `qa`, and `dev` branches. Use separate connection strings per branch. | Neon branches are isolated copy-on-write clones. Neon documents that branch changes are independent and do not affect the parent branch, and that branches are intended for development and testing. This gives three database endpoints without manually maintaining three unrelated schemas. |
| Cloudinary | Separate Cloudinary product environments for prod/QA/dev if the plan supports it. Fallback: one product environment with strict folders `hawkaii-hrms/prod`, `hawkaii-hrms/qa`, `hawkaii-hrms/dev`. | Cloudinary states API credentials are product-environment-specific and paid accounts can have multiple product environments for production/staging or similar separation. The repo already supports different Cloudinary credentials and folders per env. |
| Valkey / Render Key Value | Separate Render Key Value instance per environment. | Render Key Value is used for caches/job queues. It does not have a branch model like Neon, so use separate instances to prevent session/rate/outbox collisions. |
| Render API/worker | Separate API and worker services per environment. | Render Blueprints can define web services, workers, and Key Value services. Separate services keep deploys, logs, scaling, and env vars isolated. |

Use separate Neon projects instead of branches only if compliance, billing ownership, region isolation, or stricter production access boundaries require it. Otherwise, long-lived branches are the fastest safe option for this team.

Evidence:

- Neon branching docs: https://neon.com/docs/introduction/branching
- Cloudinary product environment docs: https://cloudinary.com/documentation/solution_overview
- Render Key Value docs: https://render.com/docs/key-value
- Render Blueprint docs: https://render.com/docs/blueprint-spec

## Neon Postgres

Create one Neon project and long-lived branches:

| Environment | Neon branch | Backend env |
| --- | --- | --- |
| Production | `main` or `prod` | `NODE_ENV=production`, `APP_ENV=production` |
| QA/UAT | `qa` | `NODE_ENV=production`, `APP_ENV=qa` |
| Hosted dev | `dev` | `NODE_ENV=production`, `APP_ENV=development` |

Each branch must use its own pooled `DATABASE_URL`. Do not point dev or QA to the production connection string.

Use Neon pooled connection strings for `DATABASE_URL`:

```env
DATABASE_URL=postgresql://...pooler...neon.tech/...?sslmode=require
```

Then run backend migrations through Render's pre-deploy command:

```bash
pnpm db:migrate:prod
```

For local development, keep using the local Docker database unless you are explicitly testing a hosted integration issue.

## Cloudinary

Preferred setup:

| Environment | Cloudinary isolation | Folder |
| --- | --- | --- |
| Production | Production product environment | `hawkaii-hrms/prod` |
| QA/UAT | QA/staging product environment | `hawkaii-hrms/qa` |
| Hosted dev | Dev product environment | `hawkaii-hrms/dev` |

If the Cloudinary account has only one product environment, use the same cloud credentials but keep strict environment folders and never run QA/dev cleanup against `hawkaii-hrms/prod`.

All hosted environments should use:

```env
CLOUDINARY_MOCK_UPLOADS=false
```

Local development may still use mock uploads if the developer is not testing media persistence.

## Valkey / Render Key Value

Use one Render Key Value instance per hosted environment:

| Environment | Render Key Value service |
| --- | --- |
| Production | `hawkaii-hrms-valkey` |
| QA/UAT | `hawkaii-hrms-qa-valkey` |
| Hosted dev | `hawkaii-hrms-dev-valkey` |

Do not share Valkey across environments. It stores session, rate-limit, and outbox stream state, so sharing it can cross-contaminate login sessions, throttling, or worker processing.

## Backend Env Templates

Tracked backend examples:

| File | Purpose |
| --- | --- |
| `hrms_backend/.env.dev.example` | Hosted dev backend template for `https://dev-api.hawkaii.in` |
| `hrms_backend/.env.qa.example` | QA/UAT template |
| `hrms_backend/.env.prod.example` | Production template |

Important production/hosted values:

```env
TRUST_PROXY=true
COOKIE_SECURE=true
CLOUDINARY_MOCK_UPLOADS=false
OPENAPI_PUBLIC=false
```

With `COOKIE_SECURE=true`, backend login/logout cookies are emitted as `SameSite=None; Secure`. Keep this enabled for hosted dev, QA, and production so a browser refresh can restore the session through `/api/v1/auth/me` when the frontend and API are deployed on separate origins.

Environment keys are intentionally explicit:

```env
NODE_ENV=production   # hosted dev, QA/UAT, and production optimized runtime
APP_ENV=development   # hosted dev
APP_ENV=qa            # QA/UAT
APP_ENV=production    # production
```

For dev and QA/UAT, `OPENAPI_PUBLIC=true` can stay enabled if testers need Swagger UI. For production, keep it false unless you explicitly decide to expose docs.

Health endpoints include safe deployment metadata:

```text
app_env
node_env
version
build_sha
uptime_seconds
```

Set `APP_VERSION` and `BUILD_SHA` in hosted environments so testers can identify the deployed version without exposing secrets.

## Frontend Hosting

The frontend is TanStack Start configured for Vercel through Nitro. The Vite config uses nitro/vite for production builds, and hrms-client/vercel.json pins the Vercel install and build commands.

Create one Vercel project per hosted environment for the clearest free-tier isolation:

| Environment | Git branch | Vercel project root | Domain | API env |
| --- | --- | --- | --- | --- |
| Hosted dev | dev | hrms-client | https://dev.hawkaii.in | https://dev-api.hawkaii.in |
| QA/UAT | qa | hrms-client | https://qa.hawkaii.in | https://qa-api.hawkaii.in |
| Production | main | hrms-client | https://hawkaii.in | https://api.hawkaii.in |

Use these Vercel settings for every frontend project:

| Setting | Value |
| --- | --- |
| Root directory | hrms-client |
| Install command | pnpm install --frozen-lockfile |
| Build command | pnpm build:vercel |
| Output directory | leave empty / framework default |

Tracked frontend hosted examples:

| File | Purpose |
| --- | --- |
| hrms-client/.env.dev.example | Hosted dev frontend |
| hrms-client/.env.qa.example | Hosted QA frontend |
| hrms-client/.env.prod.example | Production frontend |

Production frontend env:

    VITE_API_BASE_URL=https://api.hawkaii.in
    VITE_API_ENABLED=true
    VITE_API_MOCK_FALLBACK=false

QA frontend env:

    VITE_API_BASE_URL=https://qa-api.hawkaii.in
    VITE_API_ENABLED=true
    VITE_API_MOCK_FALLBACK=false

Dev frontend env:

    VITE_API_BASE_URL=https://dev-api.hawkaii.in
    VITE_API_ENABLED=true
    VITE_API_MOCK_FALLBACK=false

Do not enable a separate GitHub Actions frontend deploy unless Vercel Git deploys are disabled.

## Deployment Checklist

1. Create Neon `main`/production, `qa`, and `dev` branches and copy each branch's pooled connection string to the matching Render environment.
2. Create Render API, worker, and Key Value services:
   - hosted dev: `infra/render/render.dev.yaml`
   - QA/UAT: `infra/render/render.qa.yaml`
   - production: `render.yaml`
3. Set Render secret values:
   - `DATABASE_URL`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `RESEND_API_KEY` only when `EMAIL_DELIVERY_MODE=send`
   - `RESEND_WEBHOOK_SECRET` only when `EMAIL_DELIVERY_MODE=send`
4. Add Render custom domain:
   - `api.hawkaii.in`
   - `qa-api.hawkaii.in`
   - `dev-api.hawkaii.in`
5. Add frontend custom domains:
   - `hawkaii.in`
   - `qa.hawkaii.in`
   - `dev.hawkaii.in`
6. Set frontend env vars for each environment.
7. Confirm backend health:

```bash
curl https://api.hawkaii.in/api/v1/health/ready
```

8. Run QA smoke:
   - login/logout
   - signup/email verification, or disabled-email message when Resend is intentionally off
   - document upload/download/delete
   - profile photo upload
   - attendance punch
   - expense approval flow
   - report export

## Production Security Defaults

Production should use:

```env
COOKIE_SECURE=true
TRUST_PROXY=true
OPENAPI_PUBLIC=false
CLOUDINARY_MOCK_UPLOADS=false
EMAIL_DELIVERY_MODE=disabled  # switch to send after Resend secrets are configured
VITE_API_MOCK_FALLBACK=false
```

Do not set `COOKIE_SECURE=false` on hosted HTTPS services. It will cause the browser session cookie to be unsuitable for cross-origin refresh/session bootstrap.

Resend is optional during initial hosted setup. If `EMAIL_DELIVERY_MODE=disabled`, the API still starts and the frontend tells users that verification email delivery is disabled. Enable `send` with real Resend secrets before opening public self-signup.

Do not run seed scripts against production unless you are intentionally creating a new controlled demo workspace.
