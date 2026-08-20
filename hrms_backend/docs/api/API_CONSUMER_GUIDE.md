# API Consumer Guide

Date: 2026-05-01

## Runtime URLs

Use Docker portable QA for consumer testing:

| Purpose | URL |
|---|---|
| API base URL | `http://localhost:3101` |
| Swagger UI | `http://localhost:3101/docs` |
| OpenAPI JSON | `http://localhost:3101/api/v1/openapi.json` |
| Static OpenAPI artifact | `docs/api/openapi.json` |
| Core guide | `docs/api/API_CORE_GUIDE.md` |
| Curl suite | `docs/api/collections/curl-smoke-tests.sh` |
| Postman collection | `docs/api/collections/hrms-platform.postman_collection.json` |

All business APIs are under `/api/v1`. Health also has unversioned `/health/live` and `/health/ready`.

## Local Personas

Safe local QA personas:

| Email | Code | Role |
|---|---|---|
| `e1@example.test` | `E1` | Employee requester |
| `manager@example.test` | `D1` | Assigned manager |
| `executive@example.test` | `S1` | Employee / manager backup |
| `finance@example.test` | `N1` | Finance Manager |
| `finance2@example.test` | `N2` | Alternate Finance User |
| `admin@example.test` | `ADM` | Admin / HR Admin |
| `hrm@example.test` | `HRM` | HR Manager |
| `assets@example.test` | `AST` | Asset Admin |
| `auditor@example.test` | `AUD` | Auditor |
| `timesheet.approver@example.test` | `TSA` | Timesheet Approver |

These are local QA seeds only. Do not use production credentials in examples or docs.

The login model for this DEV/local Docker QA runtime uses seeded email/password credentials through one platform login. Seeded accounts use the `LOCAL_DEMO_PASSWORD` value from the selected env file. Password hashes are stored outside Core user read models. The legacy `employee_code` login remains a DEV-only fallback for older QA scripts. Production SSO/MFA/identity-provider selection and reset delivery remain HIR.

## Auth Pattern

Login:

```bash
curl -sS -X POST http://localhost:3101/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"finance@example.test\",\"password\":\"${LOCAL_DEMO_PASSWORD:-LocalDev@123}\"}"
```

The success response returns `access_token` and also sets the configured HttpOnly session cookie. The cookie contains the same session credential for browser transport. API/mobile clients should send:

```text
Authorization: Bearer <access_token>
```

Browser clients can use the session cookie. Backend RBAC/ABAC remains the source of truth.

## Native Mobile Authentication

Recommended current flow:

1. Login over HTTPS.
2. Read `access_token` from the JSON response.
3. Ignore and do not depend on any `Set-Cookie` value for native authentication.
4. Store the credential using OS secure credential storage.
5. Send `Authorization: Bearer <access_token>` to protected APIs.
6. Handle RBAC, tenant, active-company, validation, conflict, and rate-limit errors exactly like other clients.
7. On `401` caused by expiry or revocation, re-authenticate because refresh is not currently supported.
8. Send the bearer credential to `POST /api/v1/auth/logout` so the current server-side session can be revoked.
9. Delete the credential from device secure storage after logout.
10. Do not use browser cookies as the native session mechanism.

Current limitations:

- There is no separate refresh token and no `/api/v1/auth/refresh` endpoint.
- `JWT_REFRESH_SECRET` existing in configuration does not imply a supported refresh API.
- Clients must not invent or depend on undocumented cookie-based refresh behavior.

Future recommendation: if refresh-token support is required later, implement it as a separately scoped security feature with explicit issuance, rotation, persistence or replay protection, revocation, and native transport semantics.

CSRF note: the backend currently has no dedicated CSRF middleware. Native bearer requests do not require browser CSRF credentials. If CSRF protection is introduced later, it should protect unsafe cookie-authenticated browser requests without requiring CSRF credentials for pure bearer-authenticated native requests.

## Common Response Rules

- Money values are strings, for example `"12500.00"`.
- Timestamps are ISO 8601 strings.
- UUID path parameters use UUID format.
- Lists use `page` and `page_size`; some routes also support `sort` and domain filters.
- Mutations that change workflow state require `expected_version` for OCC.
- `403` means authenticated but forbidden by role/object policy.
- `400 COMPANY_CONTEXT_REQUIRED` means the authenticated user does not have a valid active-company context for the operation.
- `409` means stale `expected_version`; refresh the object and retry.
- `429` means the client crossed an API rate limit; wait for `Retry-After` before retrying.
- Error responses include `request_id`; include it in defect reports.
- `/api/v1/core/users/{id}/subtree` is the hierarchy/subordinate lookup for active descendants and includes `summary`, `total_active_descendants`, `max_depth`, and row-level `depth`.
- `/api/v1/expenses/{id}/timeline` is the display-safe audit timeline for expense workflow status movement. It does not expose raw audit payloads.

## Rate Limits

Business API routes under `/api/v1/**` are rate-limited as a platform safety control. Health checks, Swagger UI, and OpenAPI JSON are exempt.

Defaults in DEV/Docker QA:

| Bucket | Default |
|---|---|
| Auth login | 10 requests/minute/IP |
| Public asset scan | 60 requests/minute/IP |
| General reads | 120 requests/minute/user-or-IP |
| Mutations | 60 requests/minute/user-or-IP |

`429 TOO_MANY_REQUESTS` responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and the standard `request_id`.

Local operators can tune limits with `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_READ_MAX`, `RATE_LIMIT_WRITE_MAX`, `RATE_LIMIT_AUTH_MAX`, and `RATE_LIMIT_PUBLIC_MAX`.

## API Priority Order

1. Auth/Login
2. Finance Management
3. Employee expense request workflow
4. Documents
5. Expenses workflow
6. Assets
7. Timesheets, Core, Reports, Platform

Finance UI note: employees raise expense requests at `/finance/requests/new` with the label `Raise Expense Request`. The API underneath is `POST /api/v1/expenses`; own dashboard and request detail use `GET /api/v1/expenses/my`, `GET /api/v1/expenses/{id}`, and `GET /api/v1/expenses/{id}/timeline`.

## Security Boundaries

- Frontends and mobile clients must call Fastify APIs only.
- No client should read PostgreSQL, object storage, Valkey, or internal services directly.
- Document download URLs are backend-generated and authorization-checked.
- Object-storage credentials are never returned by the API.
- Production provider, identity, TLS/cookie, and finance export decisions remain HIR-blocked.
