# API Contract And Integrations

Last verified from the repository: 2026-06-30.

The backend OpenAPI contract is the canonical API reference. The frontend should consume API behavior through domain adapters and generated contract docs, not by guessing route shapes.

## Contract Files

| File | Purpose |
| --- | --- |
| `hrms_backend/docs/api/openapi.json` | Backend-generated OpenAPI JSON. |
| `hrms_backend/docs/api/frontend-contract/openapi.json` | Copied generated contract for frontend use. |
| `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md` | Generated human-readable endpoint index. |
| `hrms-client/docs/api/openapi.json` | Mirrored frontend-side API reference. |
| `hrms-client/docs/api/frontend-contract/ENDPOINT_INDEX.md` | Mirrored frontend-side endpoint index. |
| `hrms_backend/docs/api/collections/hrms-platform.postman_collection.json` | Postman collection. |
| `hrms_backend/docs/api/collections/curl-smoke-tests.sh` | Curl smoke examples. |

Current generated backend contract:

| Metric | Count |
| --- | --- |
| Operations | 245 |
| Paths | 214 |

## Operation Tags

| Tag | Operation Count |
| --- | ---: |
| Platform / Health | 6 |
| Auth & Sessions | 12 |
| Core / Employees & Hierarchy | 19 |
| Dashboard | 1 |
| Admin / Configuration | 34 |
| Expenses / Requester | 10 |
| Expenses / Manager | 3 |
| Finance Management | 13 |
| Documents | 10 |
| Reports & Analytics | 15 |
| Assets | 23 |
| Outbox / Platform Events | 1 |
| Timesheets | 12 |
| Attendance | 12 |
| Leave / WFH / Holidays | 15 |
| EMS | 23 |
| Projects / Utilization | 15 |
| Helpdesk | 17 |
| Notifications | 4 |

## Generate And Verify

```bash
cd hrms_backend
pnpm api:docs:generate
pnpm api:docs:verify
pnpm api:consumer:verify
```

`api:docs:generate` builds the Fastify app in memory mode and writes OpenAPI output. It also runs frontend contract generation.

## Frontend Consumption Pattern

Frontend API calls should flow through:

```text
route/component
  -> src/domains/<domain>/queries.ts
  -> src/domains/<domain>/api.ts
  -> src/shared/api/client.ts
  -> backend /api/v1/*
```

Avoid direct `fetch()` calls in feature screens unless there is a strong reason.

## Authentication Contract

Protected requests use either:

- HttpOnly session cookie, or
- `Authorization: Bearer <access_token>`

The frontend API client sends `credentials: "include"` and adds bearer auth when an access token is available.

Public backend paths are explicitly allowed in `hrms_backend/src/plugins/auth.ts`. Examples include health checks, login, signup, email verification, password reset, onboarding bootstrap/logo routes, and Resend webhook.

## Error Contract

Backend error response:

```json
{
  "code": "FORBIDDEN",
  "message": "Forbidden",
  "details": {},
  "request_id": "..."
}
```

Frontend error handling:

- `src/shared/api/errors.ts` parses the backend response.
- User-facing messages are normalized to avoid exposing stack traces or raw database messages.
- 401 responses notify auth state.
- 429 responses register retry-after cooldowns.

## Rate Limiting

Backend config keys:

- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_WINDOW_SECONDS`
- `RATE_LIMIT_READ_MAX`
- `RATE_LIMIT_WRITE_MAX`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_PUBLIC_MAX`

Frontend config keys:

- `VITE_API_RATE_LIMIT_ENABLED`
- `VITE_API_RATE_LIMIT_MAX_REQUESTS`
- `VITE_API_RATE_LIMIT_WINDOW_MS`
- `VITE_API_SEARCH_DEBOUNCE_MS`

## External Integrations

| Integration | Required In Hosted Environments | Notes |
| --- | --- | --- |
| PostgreSQL / Neon | Yes | Each env must have its own connection string or Neon branch. |
| Valkey / Render Key Value | Yes | Used for sessions, rate-limit state, and outbox streams. Do not share across environments. |
| Cloudinary | Yes for real media persistence | Hosted envs must set `CLOUDINARY_MOCK_UPLOADS=false`. |
| Resend | Required when email send mode is enabled | App owns token validity; Resend is only transport/delivery telemetry. |
| Vercel | Frontend hosting | One project per hosted environment is recommended. |
| Render | Backend API and worker hosting | API and worker deploy separately through deploy hooks. |

## Email Verification Flow

1. User signs up.
2. Backend creates pending company/user state and application-owned auth token.
3. Backend sends verification email through Resend when `EMAIL_DELIVERY_MODE=send`.
4. User opens frontend verification URL.
5. Frontend calls backend verification route with the token.
6. Backend validates token hash, expiry, single-use status, and user/company state.
7. User continues to password setup/login/company bootstrap depending on next step.

Relevant docs:

- `../architecture/email-verification.md`
- `../resend-email-verification-architecture-report.md`
- `../runbooks/resend-email-verification-deployment.md`

## Media Upload Flow

1. Frontend prepares `FormData` and sends file to backend.
2. Backend validates file limits and MIME type.
3. Backend may compress PDFs if enabled and Ghostscript is available.
4. Backend stores content through Cloudinary object storage adapter.
5. Backend writes document metadata/version rows.
6. Backend returns backend-owned metadata/download URL, not Cloudinary credentials.

Frontend must never receive `CLOUDINARY_API_SECRET`.

## Changing An API Safely

1. Update backend route/schema/service tests.
2. Run backend checks for the changed module.
3. Run `pnpm api:docs:generate` and `pnpm api:docs:verify`.
4. Update frontend domain adapter and query hooks.
5. Run frontend build and relevant route/API guards.
6. Update module KT or feature docs if behavior, roles, environment, or workflow changed.
7. Include request/response impact and QA scope in handoff.

