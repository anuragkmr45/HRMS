# Hawkaii HRMS Backend

Standalone Fastify backend for Hawkaii HRMS. This project is extracted from the original monorepo as a single backend package and keeps the exact backend domains: Auth, Core Employee Management, Expense/Finance, Documents, Reports, Assets, Timesheets, Platform infrastructure, PostgreSQL migrations, outbox, object storage, API docs, and backend tests.

## Requirements

- Node.js 22+
- pnpm 10+
- Docker Desktop or Docker Engine with Compose

## Local Development

```bash
# Keep real local values in .env.local.
# The tracked .env.dev.example is for hosted dev; if you copy it, replace hosted URLs, Neon, Valkey, and Cloudinary values with local ones.
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

Local, QA, and production document/media uploads use the Cloudinary storage adapter. Local `.env.local` may use `CLOUDINARY_MOCK_UPLOADS=true` for developer-only flows, but the tracked dev/QA/production examples are hosted templates and set real Cloudinary persistence with `CLOUDINARY_MOCK_UPLOADS=false`.

```env
CLOUDINARY_CLOUD_NAME=local-cloudinary-mock
CLOUDINARY_API_KEY=local-cloudinary-key
CLOUDINARY_API_SECRET=local-cloudinary-secret
CLOUDINARY_FOLDER=hawkaii-hrms-dev
CLOUDINARY_RESOURCE_TYPE=auto
CLOUDINARY_UPLOAD_TRANSFORMATION=q_auto:eco,f_auto
CLOUDINARY_MOCK_UPLOADS=true
```

For real Cloudinary uploads, replace the dashboard values and disable mock mode:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_MOCK_UPLOADS=false
```

Do not expose `CLOUDINARY_API_SECRET` or any object-storage credential to the frontend. Files are uploaded to the backend first; the backend stores them through Cloudinary and returns a backend-issued download URL.

Image uploads are compressed in the frontend before they reach the backend. PDF uploads are compressed server-side before object storage when `PDF_COMPRESSION_ENABLED=true`; this uses Ghostscript (`PDF_COMPRESSION_BINARY`, default `gs`) and defaults to fail-open behavior so uploads continue if local Ghostscript is not installed. The production Docker image installs Ghostscript for this path.

API endpoints:

- API: `http://localhost:3001`
- Health: `http://localhost:3001/health/ready`
- Swagger UI: `http://localhost:3001/docs`
- OpenAPI JSON: `http://localhost:3001/api/v1/openapi.json`

## Transactional Email / Resend

Email verification and password reset delivery use the backend `EmailDeliveryService` with Resend as the transport provider. The backend still owns token generation, token hashing, expiry, single-use verification, resend limits, and user verification state.

Local development should usually keep email delivery in log mode:

```env
EMAIL_DELIVERY_PROVIDER=resend
EMAIL_DELIVERY_MODE=log
FRONTEND_URL=http://localhost:8080
```

For staging or production real delivery, set `EMAIL_DELIVERY_MODE=send`, provide `RESEND_API_KEY`, use a verified `RESEND_FROM_EMAIL`, set the public `FRONTEND_URL`, and configure `RESEND_WEBHOOK_SECRET`. The Resend webhook endpoint is:

```text
POST /api/v1/webhooks/resend
```

Apply migrations before enabling real delivery:

```bash
pnpm db:migrate
pnpm db:verify:no-cross-schema-fks
```

Detailed architecture and deployment guidance:

- `../docs/architecture/email-verification.md`
- `../docs/runbooks/resend-email-verification-deployment.md`

## Docker Runtime

```bash
# Use .env.local with local Docker database and Valkey values.
pnpm docker:dev:up
pnpm docker:dev:verify
```

QA runtime:

```bash
cp .env.qa.example .env.qa
pnpm docker:qa:up
pnpm docker:qa:verify
```

Production-style runtime:

```bash
cp .env.prod.example .env.prod
# replace every production secret before starting
pnpm docker:prod:config
pnpm docker:prod:up
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm db:verify:no-cross-schema-fks
pnpm verify:business
pnpm verify:quality
pnpm verify:implementation
pnpm verify:scalability
pnpm verify:regression
```

Integration tests require PostgreSQL, Valkey, and object storage. Use `pnpm test:infra:up` before `pnpm test:integration` or point `TEST_DATABASE_URL` in your untracked env file to your own services. The dev example keeps mock Cloudinary available so tests do not require external Cloudinary credentials.
