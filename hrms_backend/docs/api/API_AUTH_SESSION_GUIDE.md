# API Auth Session Guide

Date: 2026-05-01

## Login

`POST /api/v1/auth/login`

This DEV/local Docker QA login now uses one platform email/password flow for all web zones. It is backed by safe seeded users for QA and Swagger testing. The seeded password is read from `LOCAL_DEMO_PASSWORD` in the selected env file. Password hashes are stored separately from Core user records in `platform.user_credentials` and are never returned by Core APIs.

`employee_code` remains accepted as a DEV-only fallback for legacy local scripts. Production SSO, MFA, identity provider, password reset delivery, and lifecycle sync remain HIR-001.

Request body:

```json
{
  "email": "finance@example.test",
  "password": "LocalDev@123"
}
```

Success response includes:

```json
{
  "user": {
    "employee_code": "N1",
    "email": "finance@example.test",
    "roles": ["Finance Manager"]
  },
  "access_token": "<jwt-access-token>",
  "expires_at": "2026-05-01T12:24:20.000Z"
}
```

The API also sets the configured HttpOnly session cookie containing the same session credential as `access_token`. Local insecure runtimes use `SameSite=Lax`; hosted HTTPS runtimes with `COOKIE_SECURE=true` use `SameSite=None; Secure` so browser session bootstrap works when the frontend and API are on different hosted origins. Swagger and mobile clients should use the returned bearer token for protected calls.

Login is rate-limited at 10 attempts per minute per IP by default. A `429 TOO_MANY_REQUESTS` response means the client should wait for `Retry-After` before trying again.

## Native Mobile Authentication

Current implemented behavior:

1. Login over HTTPS with `POST /api/v1/auth/login`.
2. Read `access_token` from the JSON response.
3. Ignore `Set-Cookie` for native authentication. Native applications must not emulate or depend on the browser session cookie.
4. Store the bearer credential only in OS-provided secure credential storage.
5. Send `Authorization: Bearer <access_token>` to protected APIs.
6. Handle RBAC, tenant, and active-company API errors exactly like browser/API clients.
7. On `401` from expiry or server-side revocation, re-authenticate. Refresh is not currently supported.
8. Send `Authorization: Bearer <access_token>` to `POST /api/v1/auth/logout` so the current server-side session can be revoked.
9. Delete the credential from device secure storage after logout.

Current limitations:

- There is no separate refresh token and no `/api/v1/auth/refresh` endpoint.
- `JWT_REFRESH_SECRET` exists in configuration but does not imply a supported refresh API.
- Clients must not invent or depend on undocumented cookie-based refresh behavior.

Future recommendation:

If refresh-token support is required later, implement it as a separately scoped security feature with explicit issuance, rotation, persistence or replay protection, revocation, and native transport semantics.

## Current User

`GET /api/v1/auth/me`

Headers:

```text
Authorization: Bearer <access_token>
```

Returns the authenticated actor resolved by backend auth middleware.

If both `Authorization: Bearer <access_token>` and the browser session cookie are sent, the explicit bearer credential is selected first. A stale browser cookie does not break a valid bearer request. An invalid explicit bearer credential returns the normal `401` API error and does not fall back to another identity through cookies.

## Logout

`POST /api/v1/auth/logout`

Logout revokes the Valkey-backed server-side session when the current session cookie or explicit bearer token is valid and always clears the browser session cookie. This makes logout safe to call from any topbar even if the local cookie is already stale or missing. Bearer-token clients should send the current bearer token to logout, then drop the token client-side after logout.

When both cookie and bearer credentials are present on logout, the explicit bearer credential is used for server-side revocation and the browser cookie is still cleared.

## CSRF Transport Separation

The backend currently has no dedicated CSRF middleware. Browser cookie authentication and native bearer authentication are different credential transport modes. Native bearer requests do not require a browser CSRF token.

If dedicated CSRF protection is introduced later, it must protect unsafe cookie-authenticated browser requests without requiring CSRF credentials for pure bearer-authenticated native requests. Do not weaken browser CSRF protection to support mobile clients.

## Validation And Auth Errors

No body:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": {
    "formErrors": ["Body cannot be empty when content-type is set to 'application/json'"],
    "fieldErrors": {}
  },
  "request_id": "..."
}
```

Invalid body:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Email is required."],
      "password": ["Password is required."]
    }
  },
  "request_id": "..."
}
```

Protected route without auth:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required",
  "request_id": "..."
}
```

Malformed or expired session/bearer token:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Invalid or expired session",
  "request_id": "..."
}
```

Revoked server-side session:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Session has been revoked",
  "request_id": "..."
}
```

Authenticated but unauthorized:

```json
{
  "code": "FORBIDDEN",
  "message": "Forbidden",
  "request_id": "..."
}
```

Missing active-company context:

```json
{
  "code": "COMPANY_CONTEXT_REQUIRED",
  "message": "Company context is required for this operation.",
  "request_id": "..."
}
```

## Consumer Notes

- Primary UI login uses `email` and `password`.
- Local seeded password for Docker QA personas comes from `LOCAL_DEMO_PASSWORD`; the local example value is `LocalDev@123`.
- `employee_code` is DEV-only fallback behavior for older scripts, not the preferred UI flow.
- Forgot password is a safe UI placeholder in DEV; production reset policy/provider remains HIR.
- Never place secrets in `NEXT_PUBLIC_` variables.
- Do not persist tokens beyond the local QA session in test tools.
