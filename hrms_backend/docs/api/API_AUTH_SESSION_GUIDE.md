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

The API also sets the configured HttpOnly session cookie. Local insecure runtimes use `SameSite=Lax`; hosted HTTPS runtimes with `COOKIE_SECURE=true` use `SameSite=None; Secure` so browser refresh/session bootstrap works when the frontend and API are on different hosted origins. Swagger and mobile clients should use the returned bearer token for protected calls.

Login is rate-limited at 10 attempts per minute per IP by default. A `429 TOO_MANY_REQUESTS` response means the client should wait for `Retry-After` before trying again.

## Current User

`GET /api/v1/auth/me`

Headers:

```text
Authorization: Bearer <access_token>
```

Returns the authenticated actor resolved by backend auth middleware.

## Logout

`POST /api/v1/auth/logout`

Logout revokes the Valkey-backed session when the current session cookie is valid and always clears the browser session cookie. This makes logout safe to call from any topbar even if the local cookie is already stale or missing. Bearer-token clients should drop the token client-side after logout.

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

## Consumer Notes

- Primary UI login uses `email` and `password`.
- Local seeded password for Docker QA personas comes from `LOCAL_DEMO_PASSWORD`; the local example value is `LocalDev@123`.
- `employee_code` is DEV-only fallback behavior for older scripts, not the preferred UI flow.
- Forgot password is a safe UI placeholder in DEV; production reset policy/provider remains HIR.
- Never place secrets in `NEXT_PUBLIC_` variables.
- Do not persist tokens beyond the local QA session in test tools.
