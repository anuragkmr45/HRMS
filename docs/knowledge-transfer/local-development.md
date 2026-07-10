# Local Development

Last verified from the repository: 2026-06-30.

## Requirements

- Node.js 22 or newer for the backend. CI currently uses Node 24.
- pnpm 10.25.0 or compatible pnpm 10.
- Docker Desktop or Docker Engine with Compose for local PostgreSQL and Valkey.
- Optional Ghostscript if testing local PDF compression outside the Docker image.

## Environment Files

Use untracked local env files for real values:

| Package | Local file | Tracked examples |
| --- | --- | --- |
| Backend | `hrms_backend/.env.local` | `.env.dev.example`, `.env.qa.example`, `.env.prod.example` |
| Frontend | local shell env or Vite mode env | `.env.dev.example`, `.env.qa.example`, `.env.prod.example` |

Do not commit `.env.local`. Do not paste secret values into docs, issues, screenshots, or PR descriptions.

## Backend Setup

From the repository root:

```bash
cd hrms_backend
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

What these commands do:

| Command | Purpose |
| --- | --- |
| `pnpm install` | Installs backend dependencies from `pnpm-lock.yaml`. |
| `pnpm dev:infra:up` | Starts local PostgreSQL and Valkey through `infra/docker/docker-compose.dev.yml`. |
| `pnpm db:migrate` | Applies all SQL migrations from `src/db/migrations/` to `DATABASE_URL`. |
| `pnpm release:seed` | Seeds representative release/demo data. |
| `pnpm dev` | Runs `tsx scripts/run-with-env.ts .env.local -- tsx src/server.ts`. |

Backend local URLs:

| Endpoint | URL |
| --- | --- |
| API base | `http://localhost:3001` |
| Liveness | `http://localhost:3001/health/live` |
| Readiness | `http://localhost:3001/health/ready` |
| Swagger UI | `http://localhost:3001/docs` |
| OpenAPI JSON | `http://localhost:3001/api/v1/openapi.json` |

## Frontend Setup

In a second terminal:

```bash
cd hrms-client
pnpm install
pnpm dev
```

Vite is configured to serve on:

```text
http://localhost:8080
```

Core frontend env keys:

| Key | Local value |
| --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3001` |
| `VITE_API_ENABLED` | `true` |
| `VITE_API_MOCK_FALLBACK` | Usually `true` for local demo tolerance, always `false` in QA/production. |
| `VITE_APP_ENV` | `local` or unset locally. |

## Running Backend In Docker

For a Dockerized backend runtime:

```bash
cd hrms_backend
pnpm docker:dev:up
pnpm docker:dev:verify
```

QA-style and production-style Docker commands also exist:

```bash
pnpm docker:qa:up
pnpm docker:qa:verify
pnpm docker:prod:config
pnpm docker:prod:up
```

Use QA/prod Docker commands only with the matching untracked env file and safe non-production secrets unless you are doing an approved production operation.

## Common Verification Commands

Backend:

```bash
cd hrms_backend
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm db:verify:no-cross-schema-fks
```

Frontend:

```bash
cd hrms-client
pnpm lint
pnpm build
pnpm api:production-config-guard
pnpm api:implemented-route-guard
pnpm api:frontend-contract:route-coverage
pnpm test:e2e
```

Run targeted checks during feature work and broader checks before handoff.

## Regenerating API Docs

When backend routes/schemas change:

```bash
cd hrms_backend
pnpm api:docs:generate
pnpm api:docs:verify
```

This updates:

- `hrms_backend/docs/api/openapi.json`
- `hrms_backend/docs/api/frontend-contract/openapi.json`
- `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`

The frontend has mirrored API docs under `hrms-client/docs/api/`; keep them in sync if the project process requires mirrored client-side references.

## Local Troubleshooting

| Symptom | Check |
| --- | --- |
| Backend cannot connect to DB | Confirm Docker services are up, `DATABASE_URL` points to local Postgres, and migrations ran. |
| Backend readiness fails | Check `/health/live` first, then inspect DB, Valkey, object storage, and env validation. |
| Login fails after refresh | Check cookie settings, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, and `COOKIE_SECURE` for local vs hosted mode. |
| Frontend calls wrong API | Check `VITE_API_BASE_URL` and browser devtools network tab. |
| Mock data appears unexpectedly | Check `VITE_API_ENABLED` and `VITE_API_MOCK_FALLBACK`; production mode forces fallback off. |
| Uploads do not persist locally | Local may use `CLOUDINARY_MOCK_UPLOADS=true`; use real Cloudinary values and set mock mode false to test persistence. |
| PDF compression fails locally | Install Ghostscript or rely on fail-open behavior if `PDF_COMPRESSION_FAIL_OPEN=true`. |

