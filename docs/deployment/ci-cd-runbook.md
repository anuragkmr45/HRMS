# CI/CD Runbook

## Workflow And Required Checks

The required workflow is `.github/workflows/branch-ci-cd.yml`.

GitHub rulesets must require these exact contexts from the **GitHub Actions** source:

- `Branch CI/CD / Backend checks`
- `Branch CI/CD / Frontend checks`

`Branch CI/CD` is the workflow name. `Backend checks` and `Frontend checks` are fixed job display names. Neither required job uses a matrix, dynamic suffix, path filter, or change-detection skip, so both jobs report on every covered pull request.

## Triggers And Concurrency

The workflow runs on:

- pull requests targeting `dev`, `qa`, `main`, or `release-*`;
- pushes to `dev`, `qa`, `main`, or `release-*`;
- manual `workflow_dispatch` runs for CI verification.

`main` is the documented production branch. `master` is intentionally not a trigger. A `release-*` branch receives CI only and is not mapped to a hosted deployment.

Concurrency groups runs by pull request or branch ref. A newer commit cancels an older in-progress run for the same pull request. Push and manual runs are not cancelled, so a Render deployment that has started cannot be interrupted by this workflow's concurrency policy. A newer push to the same deployment branch waits for the earlier run to finish.

Manual dispatch is validation-only. It never invokes a deployment job.

## Toolchain Selection

Both applications run on Node.js 24 and pnpm 10.25.0.

Evidence for Node.js 24:

- the backend requires Node.js 22 or newer in `hrms_backend/package.json`;
- `hrms_backend/infra/docker/Dockerfile` uses the Node.js 24 image;
- the previous workflow and repository developer documentation already selected Node.js 24;
- both current dependency graphs are compatible with Node.js 24.

Evidence for pnpm 10.25.0:

- `hrms_backend/package.json` declares `packageManager: pnpm@10.25.0`;
- `hrms-client/package.json` declares `packageManager: pnpm@10.25.0`;
- both lockfiles use pnpm lockfile format 9.

Each job uses its own package metadata and cache key:

| Application | Working directory | pnpm metadata | Cache dependency |
| --- | --- | --- | --- |
| Backend | `hrms_backend` | `hrms_backend/package.json` | `hrms_backend/pnpm-lock.yaml` |
| Frontend | `hrms-client` | `hrms-client/package.json` | `hrms-client/pnpm-lock.yaml` |

The workflow uses `actions/checkout@v7`, `pnpm/action-setup@v6`, and `actions/setup-node@v6`. Checkout does not persist credentials. Dependency caching covers the pnpm store, not `node_modules`.

## Backend Checks

The `Backend checks` job runs from `hrms_backend` with a 45-minute timeout:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm db:migrate
pnpm db:verify:no-cross-schema-fks
pnpm test
pnpm build
```

`pnpm test` is blocking and runs the repository's unit, contract, integration, and backend E2E Vitest projects. The E2E project does not use `--passWithNoTests`, so removing its tests cannot silently turn the project green.

### Backend CI Services

The job starts isolated GitHub Actions service containers:

- PostgreSQL `16-alpine`, matching the repository's Docker Compose manifests;
- Valkey `9.0.3-alpine`, matching the repository's Docker Compose manifests.

PostgreSQL uses a dedicated `hrms_ci` user and `hrms_ci_test` database with a non-production, run-scoped password. The job exposes the isolated database through `TEST_DATABASE_URL`. `DATABASE_URL` is set only for the migration step, so the integration-test reset guard continues to verify that tests use their explicit test database.

The job uses `NODE_ENV=test`, run-scoped CI-only JWT/demo credentials, mock Cloudinary storage, and log-only email delivery. `APP_ENV` is deliberately not forced at job scope so tests that validate production-mode configuration can derive the correct environment from their temporary `NODE_ENV` value. The job does not load `.env.local`, `.env.qa`, `.env.prod`, or any production credential. It does not call live Cloudinary, Resend, webhooks, production databases, or hosted services. No separate Redis, S3-compatible storage, worker, or email service is required by the current test adapters.

## Frontend Checks

The `Frontend checks` job runs from `hrms-client` with a 30-minute timeout:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm api:production-config-guard
pnpm build:vercel
```

`pnpm build:vercel` is the production build selected by `hrms-client/vercel.json`; it sets the Nitro Vercel preset and builds from source. CI does not trust or publish committed `.output` or `.vercel` state.

The CI build uses non-secret values:

- `VITE_APP_ENV=ci`
- `VITE_APP_VERSION=0.1.0-ci`
- `VITE_BUILD_SHA` from the workflow commit SHA
- `VITE_API_BASE_URL=http://127.0.0.1:3001`
- `VITE_API_ENABLED=true`
- `VITE_API_MOCK_FALLBACK=false`

No GitHub secret or variable is required for frontend CI.

No unit or component test framework is configured in the frontend package. The current Playwright suite is intentionally excluded from this required job: it requires a separately running, seeded backend; mutates helpdesk and export state; and includes screenshot/video-oriented suites. Run Playwright only in a dedicated, isolated E2E environment after a non-mutating PR smoke subset is defined. Do not present the required frontend check as having run Playwright.

## Deployment Behavior

Pull requests, `release-*` pushes, and manual dispatches never run the backend deployment job. Backend deployment runs only after both required CI jobs pass on a push to an approved branch:

| Branch | GitHub environment | Render target | Frontend deployment |
| --- | --- | --- | --- |
| `dev` | `development` | hosted-dev API and worker | Vercel Git integration for the hosted-dev project |
| `qa` | `qa` | QA API and worker | Vercel Git integration for the QA project |
| `main` | `production` | production API and worker | Vercel Git integration for the production project |
| `release-*` | none | none | none |

The Render job invokes the existing API and worker deploy hooks. Render performs `pnpm db:migrate:prod` as the API pre-deploy command from the matching blueprint. Deploy hooks are asynchronous, so the workflow does not claim that a successful hook request is a completed deployment. Verify the resulting Render deploy and `/api/v1/health/ready` response in the target environment.

The frontend is not deployed by GitHub Actions. `hrms-client/vercel.json` and the hosted-deployment guide define Vercel's frozen install and `pnpm build:vercel` commands. Keep Vercel Git integration limited to the mapped `dev`, `qa`, and `main` projects. Disable pull-request preview deployments or configure an equivalent ignored-build policy so pull requests do not deploy.

## Required Environments, Secrets, And Variables

Create these GitHub environments:

- `development`
- `qa`
- `production`, with required reviewer protection for production releases

The existing Render hook names are:

- `DEV_RENDER_API_DEPLOY_HOOK_URL`
- `DEV_RENDER_WORKER_DEPLOY_HOOK_URL`
- `QA_RENDER_API_DEPLOY_HOOK_URL`
- `QA_RENDER_WORKER_DEPLOY_HOOK_URL`
- `PROD_RENDER_API_DEPLOY_HOOK_URL`
- `PROD_RENDER_WORKER_DEPLOY_HOOK_URL`

Store hook values as GitHub environment or repository secrets; never as variables or committed text. No GitHub Actions variable is required by the workflow.

Render still requires the application secrets documented in `secrets-checklist.md`, including isolated `DATABASE_URL`, JWT, Cloudinary, and optional Resend values. Vercel requires the matching environment's non-secret and secret frontend configuration from the tracked `.env.*.example` templates. These hosting-platform values are not exposed to pull-request jobs.

## Rerunning A Failure

1. Open the failed `Branch CI/CD` run in the repository's **Actions** tab.
2. Inspect the first failing step in `Backend checks` or `Frontend checks`.
3. After correcting code, lockfiles, configuration, or deployment secrets, use **Re-run failed jobs**. Use **Re-run all jobs** when a service-container or cache issue may have affected both jobs.
4. Use **Run workflow** for manual CI verification. Manual runs do not deploy.
5. For a failed Render hook job, confirm the matching GitHub environment and both hook secrets, then rerun the failed job. Inspect Render logs for the actual build, migration, and service result.

## Troubleshooting

### Expected — waiting for status to be reported

- Confirm the pull request targets `dev`, `qa`, `main`, or a branch matching `release-*`.
- Confirm the ruleset context spelling exactly matches the two required contexts above.
- Confirm the selected source is GitHub Actions, not Vercel or another GitHub App.
- Confirm `.github/workflows/branch-ci-cd.yml` still has workflow name `Branch CI/CD` and job names `Backend checks` and `Frontend checks`.
- Confirm no top-level `paths` or `paths-ignore` filter was added.
- Synchronize the pull request or rerun the workflow for its current head commit. A run attached only to an older commit does not satisfy the new head.

### Wrong status-check source

GitHub Actions owns the two required checks. In the ruleset, remove a same-named context selected from another integration and reselect the context whose source is GitHub Actions. `Vercel` is a separate deployment status and must not replace `Frontend checks`.

### Frozen lockfile failures

Run pnpm 10.25.0 in the failing application directory, update that application's `package.json` and `pnpm-lock.yaml` together, and commit both. There is no root pnpm workspace and no root application lockfile. Never work around drift by dropping `--frozen-lockfile`.

### Backend database or Valkey readiness failures

- Inspect the PostgreSQL and Valkey service-container health logs.
- Confirm the pinned images can be pulled and ports 5432 and 6379 are available on the runner.
- Confirm `TEST_DATABASE_URL` targets `hrms_ci_test` and the migration step temporarily maps `DATABASE_URL` to that URL.
- Distinguish a health-check failure from a SQL migration failure; the latter appears in `Migrate test database`.
- Do not replace the CI URLs with a developer, QA, Neon, or production URL.

### Frontend build environment failures

- Confirm all six CI-safe `VITE_*` values above are still present and mock fallback is false.
- Run `pnpm api:production-config-guard` before `pnpm build:vercel` locally.
- Do not copy a mutable hosted API URL or production credentials into pull-request CI.
- For a Vercel-only failure, inspect the mapped Vercel project's root directory, install/build commands, and environment variables separately from GitHub Actions.

## Required Checks, Code Scanning, And Deployment Statuses

- **Required status checks:** `Branch CI/CD / Backend checks` and `Branch CI/CD / Frontend checks`, both produced by GitHub Actions.
- **Code scanning:** CodeQL is a separate ruleset tool, not a substitute for lint, typecheck, tests, or builds. No advanced CodeQL workflow is checked in. Verify or enable GitHub CodeQL default setup for `javascript-typescript` and the protected target branches before requiring `CodeQL` in the ruleset.
- **Vercel:** Vercel statuses describe external frontend deployment/build behavior. They are not either required GitHub Actions check.
- **Render:** `Deploy backend` is a post-CI deployment job for approved branch pushes. It is not one of the two required status checks and a successful hook request still requires Render-side deployment verification.
