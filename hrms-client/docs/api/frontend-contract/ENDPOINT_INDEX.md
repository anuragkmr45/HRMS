# Endpoint Index

This file is generated from `docs/api/openapi.json` by `pnpm api:frontend-contract:generate`.

OpenAPI title: Hawkaii HRMS API

OpenAPI version: 0.1.0

Documented operations: 247

Use `openapi.json` for exact schemas and this index for frontend behavior notes.

## Platform / Health

Health and OpenAPI routes support runtime readiness checks and API tooling.

### POST /api/v1/webhooks/resend

| Field | Contract |
|---|---|
| Purpose | Resend webhook |
| Frontend use | Resend webhook |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

Schema: `object`.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `received` | boolean | required | - |
| `duplicate` | boolean | required | - |
| `event_type` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /health/live

| Field | Contract |
|---|---|
| Purpose | Liveness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /health/ready

| Field | Contract |
|---|---|
| Purpose | Readiness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/health/live

| Field | Contract |
|---|---|
| Purpose | Versioned liveness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/health/ready

| Field | Contract |
|---|---|
| Purpose | Versioned readiness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/openapi.json

| Field | Contract |
|---|---|
| Purpose | OpenAPI JSON |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Auth & Sessions

Authentication uses one platform session. Browser clients may rely on the HttpOnly cookie; API clients should use bearer tokens.

### POST /api/v1/auth/signup

| Field | Contract |
|---|---|
| Purpose | Signup |
| Frontend use | Signup |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_name` | string | required | minLength 2 |
| `company_slug` | string | optional | minLength 2 |
| `full_name` | string | required | minLength 2 |
| `email` | string<email> | required | - |
| `password` | string<password> | optional | Optional. If omitted, verify-email returns a password setup token/action.; minLength 10 |
| `timezone` | string | optional | default "Asia/Kolkata" |
| `locale` | string | optional | default "en-IN" |
| `invite_token` | string | optional | Reserved for invited employee onboarding. |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `signup_id` | string<uuid> | required | Signup/user context UUID |
| `verification_required` | boolean | required | - |
| `masked_email` | string | required | - |
| `next_step` | string enum("verify_email") | required | - |
| `retry_after_seconds` | integer | required | minimum 1 |
| `dev_only` | object | optional, nullable | Local/QA only token echo for automated testing. Production responses omit this object. |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/verify-email

| Field | Contract |
|---|---|
| Purpose | Verify email |
| Frontend use | Verify email |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | required | Email verification token from backend-delivered email link.; minLength 16 |
| `email` | string<email> | optional | Optional UX correlation check. |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `verified` | boolean | required | - |
| `user_id` | string<uuid> | required | Verified user UUID |
| `company_id` | string<uuid> | required, nullable | Company UUID |
| `login_allowed` | boolean | required | - |
| `next_step` | string enum("login", "set_password", "company_bootstrap") | required | - |
| `dev_only` | object | optional, nullable | Local/QA only token echo for automated testing. Production responses omit this object. |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/email-verifications/resend

| Field | Contract |
|---|---|
| Purpose | Resend email verification |
| Frontend use | Resend email verification |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string<email> | required | - |
| `company_slug` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `accepted` | boolean | required | - |
| `masked_email` | string | required | - |
| `retry_after_seconds` | integer | required | minimum 1 |
| `dev_only` | object | optional, nullable | Local/QA only token echo for automated testing. Production responses omit this object. |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/set-password

| Field | Contract |
|---|---|
| Purpose | Set password |
| Frontend use | Set password |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | required | Password setup/reset token from email.; minLength 16 |
| `password` | string<password> | required | minLength 10 |
| `confirm_password` | string<password> | required | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `password_set` | boolean | required | - |
| `login_allowed` | boolean | required | - |
| `user_id` | string<uuid> | required | User UUID |
| `next_step` | string enum("login") | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/password-reset/request

| Field | Contract |
|---|---|
| Purpose | Request password reset |
| Frontend use | Request password reset |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string<email> | required | - |
| `company_slug` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `accepted` | boolean | required | - |
| `masked_email` | string | required | - |
| `retry_after_seconds` | integer | required | minimum 1 |
| `dev_only` | object | optional, nullable | Local/QA only token echo for automated testing. Production responses omit this object. |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/password-reset/confirm

| Field | Contract |
|---|---|
| Purpose | Confirm password reset |
| Frontend use | Confirm password reset |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | required | Password setup/reset token from email.; minLength 16 |
| `password` | string<password> | required | minLength 10 |
| `confirm_password` | string<password> | required | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `password_reset` | boolean | required | - |
| `session_revoked_count` | integer | required | minimum 0 |
| `next_step` | string enum("login") | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/login

| Field | Contract |
|---|---|
| Purpose | Login |
| Frontend use | Login form. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public login; protected session routes require token/cookie. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string<email> | required | Seeded local QA user email. Example is the Finance Manager persona. |
| `password` | string<password> | required | Local Docker QA demo password. Never send this in URLs or logs.; minLength 8 |
| `employee_code` | string | optional | DEV-only fallback for legacy local QA scripts. Primary UI and consumer docs use email/password.; minLength 1 |



Example:

```json
{
  "email": "finance@example.test",
  "password": "LocalDev@123"
}
```

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Invalid email/password or inactive session. |
| `403` | Inactive or blocked user if policy denies login. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `user` | object | required | - |
| `access_token` | string | required | JWT access token for API clients. Do not hard-code this value. |
| `expires_at` | string<date-time> | required | Session expiration timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/logout

| Field | Contract |
|---|---|
| Purpose | Logout |
| Frontend use | Logout action. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/auth/me

| Field | Contract |
|---|---|
| Purpose | Current session |
| Frontend use | Session bootstrap, route guards, topbar user menu, and role-aware navigation. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `user` | object | required | - |
| `active_role` | object | required | - |
| `available_roles` | array of object | required | - |
| `permissions` | array of string | required | - |
| `navigation` | array of object | required | - |
| `company` | object | required | - |
| `preferences` | object | required | - |
| `session_metadata` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/auth/session/preference

| Field | Contract |
|---|---|
| Purpose | Update session preference |
| Frontend use | Update session preference |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `active_role_id` | string | optional | Role key/label assigned to the current user. |
| `active_role` | string | optional | Alias for active_role_id. |
| `company_id` | string<uuid> | optional, nullable | Company UUID |
| `landing_page` | string | optional | - |
| `locale` | string | optional | - |
| `timezone` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `user` | object | required | - |
| `active_role` | object | required | - |
| `available_roles` | array of object | required | - |
| `permissions` | array of string | required | - |
| `navigation` | array of object | required | - |
| `company` | object | required | - |
| `preferences` | object | required | - |
| `session_metadata` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/onboarding/company-logo

| Field | Contract |
|---|---|
| Purpose | Upload onboarding company logo |
| Frontend use | Upload onboarding company logo |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `bootstrap_token` | string | required | Active company bootstrap token issued after email verification.; minLength 16 |
| `file` | string<binary> | required | Company logo image. Backend media upload policy controls type, compression, and size. |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `company` | object | required | - |
| `document` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/onboarding/company-bootstrap

| Field | Contract |
|---|---|
| Purpose | Company bootstrap |
| Frontend use | Company bootstrap |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `bootstrap_token` | string | required | One-time company bootstrap token issued after email verification.; minLength 16 |
| `company_profile` | object | optional | - |
| `first_admin_profile` | object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `company` | object | required | - |
| `admin_user` | object | required | - |
| `setup_progress` | object | required | - |
| `next_steps` | array of string | required | - |
| `preferences` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Core / Employees & Hierarchy

Core APIs expose active employee identity and hierarchy context for role-aware frontend screens.

### GET /api/v1/core/master-data/org-selectors

| Field | Contract |
|---|---|
| Purpose | Org selectors |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `departments` | array of object | required | - |
| `designations` | array of object | required | - |
| `managers` | array of object | required | - |
| `roles` | array of object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users

| Field | Contract |
|---|---|
| Purpose | List users |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `q` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `designation_id` | query | no | string<uuid> | - |
| `role` | query | no | string | - |
| `employment_status` | query | no | string enum("active", "inactive", "terminated", "suspended") | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `login_state` | query | no | string enum("enabled", "disabled", "setup_pending") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users

| Field | Contract |
|---|---|
| Purpose | Create user |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `employee_code` | string | required | minLength 2 |
| `email` | string<email> | required | - |
| `full_name` | string | required | minLength 2 |
| `department_id` | string<uuid> | required | Department UUID |
| `designation_id` | string<uuid> | required | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Reporting manager user UUID |
| `roles` | array of string enum("Employee", "Reviewer", "Director", "Finance Manager", "Admin", "Auditor", "Asset Manager", "HR Manager") | optional | minItems 1 |
| `employment_status` | string enum("active", "inactive", "terminated", "suspended") | optional | - |
| `timezone` | string | optional, nullable | - |
| `joined_on` | string<date> | optional, nullable | Joining date |
| `login_enabled` | boolean | optional | When true, creates a password setup action instead of assigning a default password. |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/profile-photo-policy

| Field | Contract |
|---|---|
| Purpose | Get profile photo upload policy |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `max_bytes` | integer | required | minimum 1 |
| `max_width` | integer | required | minimum 1 |
| `max_height` | integer | required | minimum 1 |
| `jpeg_quality` | number | required | minimum 0.5 |
| `allowed_mime_types` | array of string | required | - |
| `output_mime_type` | string | required | - |
| `cloudinary_transformation` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users/{id}/profile-photo

| Field | Contract |
|---|---|
| Purpose | Upload profile photo |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string<binary> | required | JPEG, PNG, or WebP profile photo. The backend validates size and type from policy. |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### DELETE /api/v1/core/users/{id}/profile-photo

| Field | Contract |
|---|---|
| Purpose | Remove profile photo |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/{id}

| Field | Contract |
|---|---|
| Purpose | Get user |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/core/users/{id}

| Field | Contract |
|---|---|
| Purpose | Update user |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | minimum 1 |
| `email` | string<email> | optional | - |
| `full_name` | string | optional | minLength 2 |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Reporting manager user UUID |
| `employment_status` | string enum("active", "inactive", "terminated", "suspended") | optional | - |
| `timezone` | string | optional, nullable | - |
| `joined_on` | string<date> | optional, nullable | Joining date |
| `terminated_on` | string<date> | optional, nullable | Termination date |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users/{id}/activate

| Field | Contract |
|---|---|
| Purpose | Activate user |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | minimum 1 |
| `effective_date` | string<date> | optional | Effective date |
| `reason` | string | optional | - |
| `remarks` | string | optional | - |
| `status` | string enum("inactive", "terminated", "suspended") | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users/{id}/deactivate

| Field | Contract |
|---|---|
| Purpose | Deactivate user |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | minimum 1 |
| `effective_date` | string<date> | optional | Effective date |
| `reason` | string | optional | - |
| `remarks` | string | optional | - |
| `status` | string enum("inactive", "terminated", "suspended") | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users/{id}/login/enable

| Field | Contract |
|---|---|
| Purpose | Enable login setup |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | minimum 1 |
| `invite_email` | boolean | optional | - |
| `reason` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users/{id}/login/disable

| Field | Contract |
|---|---|
| Purpose | Disable login |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | minimum 1 |
| `invite_email` | boolean | optional | - |
| `reason` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/core/users/{id}/roles

| Field | Contract |
|---|---|
| Purpose | Replace roles |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `roles` | array of string enum("Employee", "Reviewer", "Director", "Finance Manager", "Admin", "Auditor", "Asset Manager", "HR Manager") | required | minItems 1 |
| `expected_version` | integer | required | minimum 1 |
| `remarks` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `email_verified_at` | string<date-time> | optional, nullable | - |
| `email_verification_status` | string enum("unverified", "pending", "verified", "bounced", "blocked") | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled", "setup_pending") | required | - |
| `role_labels` | array of string | required | - |
| `profile_photo_document_id` | string<uuid> | optional, nullable | Profile photo document UUID |
| `profile_photo_url` | string | optional, nullable | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/{id}/roles/history

| Field | Contract |
|---|---|
| Purpose | Role assignment history |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/{id}/audit

| Field | Contract |
|---|---|
| Purpose | Employee audit trail |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `event_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users/imports

| Field | Contract |
|---|---|
| Purpose | Create employee import job |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `document_id` | string<uuid> | optional | Uploaded employee import document UUID |
| `file_name` | string | optional | minLength 1 |
| `dry_run` | boolean | optional | - |
| `mapping` | object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `job_id` | string<uuid> | required | Employee import job UUID |
| `event_id` | string<uuid> | required | Source outbox event UUID |
| `status` | string | required | - |
| `outbox_status` | string | optional | - |
| `dry_run` | boolean | required | - |
| `accepted_rows` | integer | required | minimum 0 |
| `rejected_rows` | integer | required | minimum 0 |
| `row_errors` | array of object | required | - |
| `created_users` | array of object | required | - |
| `file` | object | required | - |
| `mapping` | object | required | - |
| `created_by_user_id` | string<uuid> | optional, nullable | Actor user UUID |
| `created_by` | string | required | - |
| `adapter` | string | required | - |
| `created_at` | string<date-time> | required | Job creation timestamp |
| `updated_at` | string<date-time> | required | Job update timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/imports/{job_id}

| Field | Contract |
|---|---|
| Purpose | Get employee import job |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `job_id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `job_id` | string<uuid> | required | Employee import job UUID |
| `event_id` | string<uuid> | required | Source outbox event UUID |
| `status` | string | required | - |
| `outbox_status` | string | optional | - |
| `dry_run` | boolean | required | - |
| `accepted_rows` | integer | required | minimum 0 |
| `rejected_rows` | integer | required | minimum 0 |
| `row_errors` | array of object | required | - |
| `created_users` | array of object | required | - |
| `file` | object | required | - |
| `mapping` | object | required | - |
| `created_by_user_id` | string<uuid> | optional, nullable | Actor user UUID |
| `created_by` | string | required | - |
| `adapter` | string | required | - |
| `created_at` | string<date-time> | required | Job creation timestamp |
| `updated_at` | string<date-time> | required | Job update timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/core/users/exports

| Field | Contract |
|---|---|
| Purpose | Create employee export job |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | string enum("csv", "xlsx") | optional | default "csv" |
| `filters` | object | optional | - |
| `columns` | array of string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `job_id` | string<uuid> | required | Employee export job UUID |
| `export_id` | string<uuid> | required | Employee export job UUID |
| `event_id` | string<uuid> | required | Source outbox event UUID |
| `status` | string | required | - |
| `outbox_status` | string | optional | - |
| `format` | string enum("csv", "xlsx") | required | - |
| `filters` | object | required | - |
| `columns` | array of string | required | - |
| `download_document_id` | string<uuid> | optional, nullable | Document UUID once generated |
| `download_url` | string | optional, nullable | - |
| `created_by_user_id` | string<uuid> | optional, nullable | Actor user UUID |
| `created_by` | string | required | - |
| `adapter` | string | required | - |
| `file_name` | string | optional, nullable | - |
| `row_count` | integer | optional | minimum 0 |
| `size_bytes` | integer | optional, nullable | minimum 0 |
| `generated_at` | string<date-time> | optional, nullable | Export file generation timestamp |
| `created_at` | string<date-time> | required | Job creation timestamp |
| `updated_at` | string<date-time> | required | Job update timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/{id}/subtree

| Field | Contract |
|---|---|
| Purpose | Hierarchy subordinate subtree |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `total_active_descendants` | integer | required | Total active, non-deleted descendants under the requested root.; minimum 0 |
| `max_depth` | integer | required | Deepest relative level returned in the full active subtree.; minimum 0 |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/locations/india

| Field | Contract |
|---|---|
| Purpose | Search India locations |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `search` | query | no | string | - |
| `limit` | query | no | integer | default 30; minimum 1 |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | required | - |
| `type` | string enum("city", "state") | required | - |
| `city` | string | required, nullable | - |
| `state` | string | required | - |
| `country` | string enum("India") | required | - |
| `country_code` | string enum("IN") | required | - |
| `label` | string | required | - |
| `value` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Dashboard

Backend-owned API group.

### GET /api/v1/dashboard/summary

| Field | Contract |
|---|---|
| Purpose | Dashboard summary |
| Frontend use | Dashboard summary |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Dashboard summary generation timestamp |
| `scope` | object | required | - |
| `cards` | array of object | required | - |
| `workforce` | object | required | - |
| `approvals` | object | required | - |
| `operations` | object | required | - |
| `workload` | object | required | - |
| `attention` | array of object | required | - |
| `unavailable_features` | array of object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Admin / Configuration

Configuration APIs are admin-only operational surfaces for finance governance, manager backups, and workflow definitions.

### GET /api/v1/platform/finance-governance

| Field | Contract |
|---|---|
| Purpose | Read finance governance configuration |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/platform/finance-governance

| Field | Contract |
|---|---|
| Purpose | Update finance governance configuration |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `primary_finance_manager_user_id` | string<uuid> | required | Configured primary finance manager UUID |
| `manager_backup_user_id` | string<uuid> | required, nullable | Configured manager backup UUID |
| `finance_approval_backup_user_id` | string<uuid> | required, nullable | Configured finance backup UUID |
| `effective_from` | string<date> | required | Effective from |
| `effective_to` | string<date> | optional, nullable | Effective to |
| `status` | string enum("active", "inactive") | required | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/manager-backups

| Field | Contract |
|---|---|
| Purpose | List manager backups |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/manager-backups

| Field | Contract |
|---|---|
| Purpose | Create manager backup |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `employee_user_id` | string<uuid> | required | Employee user UUID |
| `backup_manager_user_id` | string<uuid> | required | Backup manager user UUID |
| `effective_from` | string<date> | required | Effective from |
| `effective_to` | string<date> | optional | Effective to |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### DELETE /api/v1/manager-backups/{id}

| Field | Contract |
|---|---|
| Purpose | Revoke manager backup |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `expected_version` | query | no | integer | minimum 1 |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/workflow-definitions

| Field | Contract |
|---|---|
| Purpose | Upsert workflow definition |
| Frontend use | Upsert workflow definition |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | required | - |
| `definition` | object | required | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/company-profile

| Field | Contract |
|---|---|
| Purpose | Read company profile |
| Frontend use | Read company profile |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Company profile UUID |
| `company_name` | string | required | - |
| `company_slug` | string | required | - |
| `name` | string | optional | - |
| `website` | string | optional, nullable | - |
| `industry` | string | optional, nullable | - |
| `address` | string | optional, nullable | - |
| `timezone` | string | required | - |
| `locale` | string | required | - |
| `currency` | string | required | - |
| `fiscal_year_start_month` | integer | required | minimum 1 |
| `financial_year_start` | string | optional | - |
| `working_week` | string | required | - |
| `work_hours_per_day` | number | required | minimum 1 |
| `work_hours` | number | optional | minimum 1 |
| `logo_label` | string | optional, nullable | - |
| `logoLabel` | string | optional, nullable | - |
| `logo_document_id` | string<uuid> | optional, nullable | Company logo document UUID |
| `logoDocumentId` | string<uuid> | optional, nullable | Company logo document UUID |
| `logo_url` | string | optional, nullable | - |
| `logoUrl` | string | optional, nullable | - |
| `logo_file_name` | string | optional, nullable | - |
| `logo_mime_type` | string | optional, nullable | - |
| `logo_size_bytes` | integer | optional, nullable | minimum 0 |
| `status` | string enum("pending", "active", "inactive") | required | - |
| `bootstrap_completed_at` | string<date-time> | optional, nullable | Bootstrap completion timestamp |
| `updated_at` | string<date-time> | required | Last update timestamp |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/admin/company-profile

| Field | Contract |
|---|---|
| Purpose | Update company profile |
| Frontend use | Update company profile |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_name` | string | optional | minLength 2 |
| `website` | string | optional, nullable | - |
| `industry` | string | optional, nullable | - |
| `address` | string | optional, nullable | - |
| `timezone` | string | optional | minLength 2 |
| `locale` | string | optional | minLength 2 |
| `currency` | string | optional | minLength 2 |
| `fiscal_year_start_month` | integer | optional | minimum 1 |
| `working_week` | string | optional | minLength 3 |
| `work_hours_per_day` | number | optional | minimum 1 |
| `logo_label` | string | optional, nullable | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Company profile UUID |
| `company_name` | string | required | - |
| `company_slug` | string | required | - |
| `name` | string | optional | - |
| `website` | string | optional, nullable | - |
| `industry` | string | optional, nullable | - |
| `address` | string | optional, nullable | - |
| `timezone` | string | required | - |
| `locale` | string | required | - |
| `currency` | string | required | - |
| `fiscal_year_start_month` | integer | required | minimum 1 |
| `financial_year_start` | string | optional | - |
| `working_week` | string | required | - |
| `work_hours_per_day` | number | required | minimum 1 |
| `work_hours` | number | optional | minimum 1 |
| `logo_label` | string | optional, nullable | - |
| `logoLabel` | string | optional, nullable | - |
| `logo_document_id` | string<uuid> | optional, nullable | Company logo document UUID |
| `logoDocumentId` | string<uuid> | optional, nullable | Company logo document UUID |
| `logo_url` | string | optional, nullable | - |
| `logoUrl` | string | optional, nullable | - |
| `logo_file_name` | string | optional, nullable | - |
| `logo_mime_type` | string | optional, nullable | - |
| `logo_size_bytes` | integer | optional, nullable | minimum 0 |
| `status` | string enum("pending", "active", "inactive") | required | - |
| `bootstrap_completed_at` | string<date-time> | optional, nullable | Bootstrap completion timestamp |
| `updated_at` | string<date-time> | required | Last update timestamp |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/admin/company-profile/logo

| Field | Contract |
|---|---|
| Purpose | Upload company logo |
| Frontend use | Upload company logo |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string<binary> | required | Company logo image. Backend company-logo policy controls type, compression dimensions, and size. |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `company` | object | required | - |
| `document` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/master-data/departments

| Field | Contract |
|---|---|
| Purpose | List departments |
| Frontend use | List departments |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `search` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/admin/master-data/departments

| Field | Contract |
|---|---|
| Purpose | Create department |
| Frontend use | Create department |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | required | minLength 2 |
| `code` | string | optional | minLength 2 |
| `department_code` | string | optional | minLength 2 |
| `parent_id` | string<uuid> | optional, nullable | Parent department UUID |
| `parent_department_id` | string<uuid> | optional, nullable | Parent department UUID |
| `status` | string enum("active", "inactive") | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `department` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/admin/master-data/departments/{id}

| Field | Contract |
|---|---|
| Purpose | Update department |
| Frontend use | Update department |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | minLength 2 |
| `code` | string | optional | minLength 2 |
| `department_code` | string | optional | minLength 2 |
| `parent_id` | string<uuid> | optional, nullable | Parent department UUID |
| `parent_department_id` | string<uuid> | optional, nullable | Parent department UUID |
| `status` | string enum("active", "inactive") | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `department` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/master-data/designations

| Field | Contract |
|---|---|
| Purpose | List designations |
| Frontend use | List designations |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `search` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/admin/master-data/designations

| Field | Contract |
|---|---|
| Purpose | Create designation |
| Frontend use | Create designation |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | minLength 2 |
| `title` | string | optional | minLength 2 |
| `code` | string | optional | minLength 2 |
| `designation_code` | string | optional | minLength 2 |
| `level` | integer | optional, nullable | minimum 0 |
| `status` | string enum("active", "inactive") | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `designation` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/admin/master-data/designations/{id}

| Field | Contract |
|---|---|
| Purpose | Update designation |
| Frontend use | Update designation |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | minLength 2 |
| `title` | string | optional | minLength 2 |
| `code` | string | optional | minLength 2 |
| `designation_code` | string | optional | minLength 2 |
| `level` | integer | optional, nullable | minimum 0 |
| `status` | string enum("active", "inactive") | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `designation` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/master-data/{master_key}

| Field | Contract |
|---|---|
| Purpose | List extended master data |
| Frontend use | List extended master data |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `search` | query | no | string | - |
| `master_key` | path | yes | string enum("employmentTypes", "workLocations", "shifts", "leaveTypes", "expenseCategories", "assetCategories", "helpdeskCategories", "projectRoles") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/admin/master-data/{master_key}

| Field | Contract |
|---|---|
| Purpose | Create extended master data |
| Frontend use | Create extended master data |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `master_key` | path | yes | string enum("employmentTypes", "workLocations", "shifts", "leaveTypes", "expenseCategories", "assetCategories", "helpdeskCategories", "projectRoles") | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | required | minLength 2 |
| `code` | string | optional | minLength 2 |
| `description` | string | optional, nullable | - |
| `status` | string enum("active", "inactive") | optional | - |
| `sort_order` | integer | optional | minimum 0 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `item` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/admin/master-data/{master_key}/{id}

| Field | Contract |
|---|---|
| Purpose | Update extended master data |
| Frontend use | Update extended master data |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `master_key` | path | yes | string enum("employmentTypes", "workLocations", "shifts", "leaveTypes", "expenseCategories", "assetCategories", "helpdeskCategories", "projectRoles") | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | minLength 2 |
| `code` | string | optional | minLength 2 |
| `description` | string | optional, nullable | - |
| `status` | string enum("active", "inactive") | optional | - |
| `sort_order` | integer | optional | minimum 0 |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `item` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/rbac/roles

| Field | Contract |
|---|---|
| Purpose | List RBAC roles |
| Frontend use | List RBAC roles |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `active_only` | query | no | boolean | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/admin/rbac/roles

| Field | Contract |
|---|---|
| Purpose | Create RBAC role |
| Frontend use | Create RBAC role |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `role_key` | string | optional | minLength 2 |
| `key` | string | optional | minLength 2 |
| `name` | string | required | minLength 2 |
| `description` | string | optional | - |
| `permission_ids` | array of string | optional | default [] |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `role` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/admin/rbac/roles/{id}

| Field | Contract |
|---|---|
| Purpose | Update RBAC role |
| Frontend use | Update RBAC role |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | minLength 2 |
| `description` | string | optional | - |
| `status` | string enum("active", "inactive") | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `role` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/rbac/permissions

| Field | Contract |
|---|---|
| Purpose | List RBAC permissions |
| Frontend use | List RBAC permissions |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `module` | query | no | string | - |
| `search` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/admin/rbac/roles/{id}/permissions

| Field | Contract |
|---|---|
| Purpose | Replace RBAC role permissions |
| Frontend use | Replace RBAC role permissions |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `permission_ids` | array of string | required | - |
| `expected_version` | integer | required | minimum 1 |
| `remarks` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `role` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/workflows

| Field | Contract |
|---|---|
| Purpose | List admin workflow configurations |
| Frontend use | List admin workflow configurations |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `module` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `workflows` | array of object | required | - |
| `versions` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/admin/workflows/{workflow_key}

| Field | Contract |
|---|---|
| Purpose | Update admin workflow configuration |
| Frontend use | Update admin workflow configuration |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `workflow_key` | path | yes | string enum("leave", "wfh", "timesheet", "expense", "asset_request", "helpdesk_escalation") | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | string | optional | minLength 2 |
| `active` | boolean | optional | - |
| `status` | string enum("active", "inactive") | optional | - |
| `stages` | array of object | optional | minItems 1 |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `workflow` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/policies

| Field | Contract |
|---|---|
| Purpose | List admin policy configurations |
| Frontend use | List admin policy configurations |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `module` | query | no | string | - |
| `active_only` | query | no | boolean | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `policies` | array of object | required | - |
| `versions` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/admin/policies/{policy_key}

| Field | Contract |
|---|---|
| Purpose | Update admin policy configuration |
| Frontend use | Update admin policy configuration |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `policy_key` | path | yes | string enum("attendance", "leave", "timesheet", "expense", "asset", "sla") | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | string | optional | minLength 2 |
| `active` | boolean | optional | - |
| `status` | string enum("active", "inactive") | optional | - |
| `config` | object | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `policy` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/email-templates

| Field | Contract |
|---|---|
| Purpose | List admin email templates |
| Frontend use | List admin email templates |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `module` | query | no | string | - |
| `locale` | query | no | string | - |
| `active_only` | query | no | boolean | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `templates` | array of object | required | - |
| `versions` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/admin/email-templates/{template_key}

| Field | Contract |
|---|---|
| Purpose | Update admin email template |
| Frontend use | Update admin email template |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `template_key` | path | yes | string enum("invite", "verify", "reset", "leave", "expense", "ts_reminder", "ticket_update") | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | minLength 2 |
| `subject` | string | optional | minLength 2 |
| `body` | string | optional | minLength 2 |
| `locale` | string | optional | minLength 2 |
| `active` | boolean | optional | - |
| `status` | string enum("active", "inactive") | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `template` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/notification-channels

| Field | Contract |
|---|---|
| Purpose | List admin notification channels |
| Frontend use | List admin notification channels |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `module` | query | no | string | - |
| `active_only` | query | no | boolean | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `channels` | array of object | required | - |
| `events` | array of object | required | - |
| `versions` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/admin/notification-channels

| Field | Contract |
|---|---|
| Purpose | Update admin notification channels |
| Frontend use | Update admin notification channels |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `channels` | array of object | required | minItems 1 |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `channels` | array of object | required | - |
| `events` | array of object | required | - |
| `versions` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/audit-log

| Field | Contract |
|---|---|
| Purpose | Admin settings audit log |
| Frontend use | Admin settings audit log |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `module` | query | no | string | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `from` | query | no | string<date-time> | - |
| `to` | query | no | string<date-time> | - |
| `date_from` | query | no | string<date-time> | - |
| `date_to` | query | no | string<date-time> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/admin/security-settings

| Field | Contract |
|---|---|
| Purpose | Read admin security settings |
| Frontend use | Read admin security settings |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Admin security settings UUID |
| `settings_key` | string enum("default") | required | - |
| `password_min_length` | integer | required | minimum 8 |
| `passwordMinLength` | integer | required | minimum 8 |
| `password_require_special` | boolean | required | - |
| `passwordRequireSpecial` | boolean | required | - |
| `password_require_number` | boolean | required | - |
| `passwordRequireNumber` | boolean | required | - |
| `password_expiry_days` | integer | required | minimum 0 |
| `passwordExpiryDays` | integer | required | minimum 0 |
| `session_timeout_minutes` | integer | required | minimum 5 |
| `sessionTimeoutMinutes` | integer | required | minimum 5 |
| `login_attempt_limit` | integer | required | minimum 1 |
| `loginAttemptLimit` | integer | required | minimum 1 |
| `mfa_enabled` | boolean enum(false) | required | - |
| `mfaEnabled` | boolean enum(false) | required | - |
| `audit_role_changes` | boolean | required | - |
| `auditRoleChanges` | boolean | required | - |
| `ip_device_audit_enabled` | boolean | required | - |
| `ipDeviceAuditEnabled` | boolean | required | - |
| `updated_at` | string<date-time> | required | Admin security settings update timestamp |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/admin/security-settings

| Field | Contract |
|---|---|
| Purpose | Update admin security settings |
| Frontend use | Update admin security settings |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `password_min_length` | integer | optional | minimum 8 |
| `passwordMinLength` | integer | optional | minimum 8 |
| `password_require_special` | boolean | optional | - |
| `passwordRequireSpecial` | boolean | optional | - |
| `password_require_number` | boolean | optional | - |
| `passwordRequireNumber` | boolean | optional | - |
| `password_expiry_days` | integer | optional | minimum 0 |
| `passwordExpiryDays` | integer | optional | minimum 0 |
| `session_timeout_minutes` | integer | optional | minimum 5 |
| `sessionTimeoutMinutes` | integer | optional | minimum 5 |
| `login_attempt_limit` | integer | optional | minimum 1 |
| `loginAttemptLimit` | integer | optional | minimum 1 |
| `mfa_enabled` | boolean enum(false) | optional | - |
| `mfaEnabled` | boolean enum(false) | optional | - |
| `audit_role_changes` | boolean | optional | - |
| `auditRoleChanges` | boolean | optional | - |
| `ip_device_audit_enabled` | boolean | optional | - |
| `ipDeviceAuditEnabled` | boolean | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `settings` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Expenses / Requester

Requester APIs power employee expense self-service.

### POST /api/v1/expenses

| Field | Contract |
|---|---|
| Purpose | Create expense |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `submit` | boolean | optional | When true, route immediately into the approval workflow.; default false |
| `expense_type` | string enum("Project", "SalesPreSales") | required | - |
| `expense_sub_type` | string | required | - |
| `project_code` | string | optional | Required for Project expenses. |
| `client_name` | string | optional | Required for Sales/Pre-Sales expenses. |
| `task_title` | string | required | minLength 1 |
| `task_description` | string | required | minLength 1 |
| `location` | string | optional | - |
| `start_date` | string<date> | required | Expense start date |
| `end_date` | string<date> | required | Expense end date |
| `estimated_amount` | string | required | Total estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | required | - |
| `advance_amount` | string | optional | Requested advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `advance_justification` | string | optional | - |
| `line_items` | array of object | required | minItems 1 |



Example:

```json
{
  "submit": true,
  "expense_type": "Project",
  "expense_sub_type": "Project Travel",
  "project_code": "PRJ-100",
  "task_title": "Client implementation travel",
  "task_description": "Travel for implementation workshop",
  "location": "Mumbai",
  "start_date": "2026-05-01",
  "end_date": "2026-05-03",
  "estimated_amount": "1000.00",
  "payment_type": "Advance",
  "advance_amount": "500.00",
  "line_items": [
    {
      "line_category": "travel",
      "description": "Flight",
      "line_total": "700.00"
    },
    {
      "line_category": "lodging",
      "description": "Hotel",
      "line_total": "300.00"
    }
  ]
}
```

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/my

| Field | Contract |
|---|---|
| Purpose | My expenses |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/metadata

| Field | Contract |
|---|---|
| Purpose | Expense metadata |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Metadata generation timestamp |
| `actor_scope` | object | optional | - |
| `expense_types` | array of object | required | - |
| `expense_sub_types` | array of object | required | - |
| `project_expense_types` | array of object | optional | - |
| `payment_types` | array of object | required | - |
| `currencies` | array of object | required | - |
| `document_types` | array of object | required | - |
| `policy_hints` | object | required | - |
| `selectors` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/dashboard-summary

| Field | Contract |
|---|---|
| Purpose | Expense dashboard summary |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `status` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Summary generation timestamp |
| `scope` | object | required | - |
| `cards` | array of object | required | - |
| `queue_counts` | object | required | - |
| `aging` | array of object | required | - |
| `totals` | object | required | - |
| `rows` | array of object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}

| Field | Contract |
|---|---|
| Purpose | Expense detail |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/expenses/{id}

| Field | Contract |
|---|---|
| Purpose | Edit expense placeholder |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

Schema: `object`.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Edit endpoint is intentionally restricted in this delivery. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/submit

| Field | Contract |
|---|---|
| Purpose | Submit expense |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/withdraw

| Field | Contract |
|---|---|
| Purpose | Withdraw expense |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | minimum 1 |
| `remarks` | string | optional | Required once the ticket has been submitted. |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `expense` | object | required | - |
| `version` | integer | required | minimum 1 |
| `timeline_event` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/clarifications

| Field | Contract |
|---|---|
| Purpose | Add expense clarification |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | required | minLength 1 |
| `document_ids` | array of string<uuid> | optional | default [] |
| `expected_version` | integer | optional | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `clarification` | object | required | - |
| `thread` | array of object | required | - |
| `expense_version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}/timeline

| Field | Contract |
|---|---|
| Purpose | Expense workflow timeline |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_type` | string | required | - |
| `label` | string | required | - |
| `stage` | string enum("requester", "manager", "finance", "documents", "closure") | required | - |
| `actor_user_id` | string<uuid> | required | Actor user UUID |
| `actor_name` | string | required | - |
| `timestamp` | string<date-time> | required | Timeline event timestamp |
| `remarks` | string | required, nullable | - |
| `status_from` | string | required, nullable | - |
| `status_to` | string | required, nullable | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Expenses / Manager

Manager APIs power relationship-based verification. A manager role is not required; backend resolves direct manager or configured backup.

### GET /api/v1/expenses/queue/manager

| Field | Contract |
|---|---|
| Purpose | Manager queue |
| Frontend use | `/finance/manager` verification workspace. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Assigned direct manager or valid manager backup; requester self-verification is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/manager/verify

| Field | Contract |
|---|---|
| Purpose | Manager verification decision |
| Frontend use | `/finance/manager` verification workspace. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Assigned direct manager or valid manager backup; requester self-verification is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approve", "reject", "return") | required | - |
| `remarks` | string | optional | Required for reject/return decisions. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Manager return/reject require remarks; requester self-verification is blocked server-side.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/documents/{documentId}/verify

| Field | Contract |
|---|---|
| Purpose | Verify expense document |
| Frontend use | Verify expense document |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Assigned direct manager or valid manager backup; requester self-verification is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |
| `documentId` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Finance Management

Finance APIs handle queue, approval, payment release, bills, settlement, audit, dashboard, and analytics.

### GET /api/v1/expenses/queue/finance

| Field | Contract |
|---|---|
| Purpose | Finance queue |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string enum("sla", "created_at", "amount", "status") | default "sla" |
| `status` | query | no | string enum("Manager Verified", "Finance Hold", "Clarification Required", "Finance Approved", "Payment Released", "Bills Submitted", "Pending Adjustment", "Closed") | - |
| `requester` | query | no | string | - |
| `department` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `payment_type` | query | no | string enum("Advance", "ReimbursementAccrued") | - |
| `expense_type` | query | no | string enum("Project", "SalesPreSales") | - |
| `expense_sub_type` | query | no | string | - |
| `amount_min` | query | no | string | pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `amount_max` | query | no | string | pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `document_status` | query | no | string enum("any", "complete", "missing") | default "any" |
| `sla_bucket` | query | no | string enum("any", "0-24h", "24-72h", "72h-plus") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}/finance-detail

| Field | Contract |
|---|---|
| Purpose | Finance ticket detail |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/finance/approve

| Field | Contract |
|---|---|
| Purpose | Finance approve or hold |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("verify", "hold", "clarification") | required | - |
| `remarks` | string | optional | Required for hold or clarification. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Finance approval starts only after manager verification; hold/clarification-style decisions require remarks.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/finance/payment

| Field | Contract |
|---|---|
| Purpose | Release payment |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `payment_date` | string<date> | required | Payment release date |
| `amount` | string | required | Payment amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_mode` | string | required | minLength 1 |
| `reference_no` | string | required | minLength 1 |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/bills

| Field | Contract |
|---|---|
| Purpose | Submit bills |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/settlement

| Field | Contract |
|---|---|
| Purpose | Approve settlement |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `actual_amount` | string | required | Actual submitted/verified expense amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}/audit

| Field | Contract |
|---|---|
| Purpose | Expense audit log |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/finance-dashboard

| Field | Contract |
|---|---|
| Purpose | Finance dashboard dataset |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | optional | - |
| `cards` | array of object | required | - |
| `filters` | object | required | - |
| `aging_buckets` | array of object | required | - |
| `payable_totals` | object | required | - |
| `exception_counts` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/finance-history

| Field | Contract |
|---|---|
| Purpose | Finance action history |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/finance-analytics

| Field | Contract |
|---|---|
| Purpose | Finance analytics |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Report generation timestamp |
| `cards` | array of object | required | - |
| `aging_buckets` | array of object | required | - |
| `payable_totals` | object | required | - |
| `exception_counts` | object | required | - |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/advance-aging

| Field | Contract |
|---|---|
| Purpose | Advance aging report |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/payments

| Field | Contract |
|---|---|
| Purpose | Payment register |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/audit

| Field | Contract |
|---|---|
| Purpose | Finance audit report |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Documents

Document APIs manage metadata and authorized object-storage access. The frontend never talks to object storage directly.

### GET /api/v1/documents

| Field | Contract |
|---|---|
| Purpose | List documents |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `business_object_type` | query | no | string | - |
| `business_object_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/documents

| Field | Contract |
|---|---|
| Purpose | Upload document metadata |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**

No path or query parameters.

**Request body**

Document binary is handled through the backend object-storage adapter. Do not send object-storage credentials.

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | minLength 1 |
| `file_name` | string | required | minLength 1 |
| `mime_type` | string | required | minLength 1 |
| `size_bytes` | integer | required | minimum 1 |
| `checksum_sha256` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/documents

| Field | Contract |
|---|---|
| Purpose | Upload expense document |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Document binary is handled through the backend object-storage adapter. Do not send object-storage credentials.

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | minLength 1 |
| `file_name` | string | required | minLength 1 |
| `mime_type` | string | required | minLength 1 |
| `size_bytes` | integer | required | minimum 1 |
| `checksum_sha256` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/documents/upload-policy

| Field | Contract |
|---|---|
| Purpose | Get media upload policy |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `max_bytes` | integer | required | minimum 131072 |
| `image_max_width` | integer | required | minimum 256 |
| `image_max_height` | integer | required | minimum 256 |
| `image_jpeg_quality` | number | required | minimum 0.5 |
| `allowed_mime_types` | array of string | required | - |
| `image_output_mime_type` | string enum("image/jpeg") | required | - |
| `cloudinary_transformation` | string | required | - |
| `company_logo` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/documents/{id}

| Field | Contract |
|---|---|
| Purpose | Document metadata |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### DELETE /api/v1/documents/{id}

| Field | Contract |
|---|---|
| Purpose | Delete document |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `document_id` | string<uuid> | required | - |
| `status` | string enum("deleted") | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/documents/{id}/download-url

| Field | Contract |
|---|---|
| Purpose | Create download URL |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string<uri> | required | - |
| `expires_at` | string<date-time> | required | Download URL expiration |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Download URLs are short-lived sensitive values; do not log or persist them.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/documents/{id}/content

| Field | Contract |
|---|---|
| Purpose | Download local document content |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `string<binary>`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/documents/{id}/verify

| Field | Contract |
|---|---|
| Purpose | Verify document |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/documents/{id}/access-log

| Field | Contract |
|---|---|
| Purpose | Document access log |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Reports & Analytics

Reports are role-scoped API-backed datasets and export requests.

### GET /api/v1/reports/expenses/my

| Field | Contract |
|---|---|
| Purpose | My expense report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |
| `cards` | array of object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/manager-queue

| Field | Contract |
|---|---|
| Purpose | Manager queue report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | optional | - |
| `cards` | array of object | required | - |
| `filters` | object | required | - |
| `queue_counts` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/manager-history

| Field | Contract |
|---|---|
| Purpose | Manager action history |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/register

| Field | Contract |
|---|---|
| Purpose | Expense register |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |
| `export_columns` | array of string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/hr/employees

| Field | Contract |
|---|---|
| Purpose | HR employee report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/attendance/summary

| Field | Contract |
|---|---|
| Purpose | Attendance report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/leave-wfh/summary

| Field | Contract |
|---|---|
| Purpose | Leave and WFH report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/projects/summary

| Field | Contract |
|---|---|
| Purpose | Project portfolio report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/timesheets/summary

| Field | Contract |
|---|---|
| Purpose | Timesheet report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/assets/summary

| Field | Contract |
|---|---|
| Purpose | Asset report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/helpdesk/summary

| Field | Contract |
|---|---|
| Purpose | Helpdesk report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/audit

| Field | Contract |
|---|---|
| Purpose | Cross-module audit report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/exports

| Field | Contract |
|---|---|
| Purpose | List export jobs |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `user_id` | query | no | string<uuid> | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `project_id` | query | no | string<uuid> | - |
| `assigned_to_user_id` | query | no | string<uuid> | - |
| `actor_user_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `client` | query | no | string | - |
| `category_id` | query | no | string<uuid> | - |
| `module` | query | no | string | - |
| `action` | query | no | string | - |
| `report_type` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/reports/exports

| Field | Contract |
|---|---|
| Purpose | Create export job |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | string enum("csv", "xlsx") | optional | default "csv" |
| `report_type` | string | optional | default "expense" |
| `filters` | object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Export job UUID |
| `export_id` | string<uuid> | required | Export job UUID |
| `event_id` | string<uuid> | required | Outbox event UUID |
| `report_type` | string | required | - |
| `format` | string enum("csv", "xlsx") | required | - |
| `status` | string | required | - |
| `outbox_status` | string | optional | - |
| `created_by_user_id` | string<uuid> | optional, nullable | Creator UUID |
| `created_by` | string | optional, nullable | - |
| `filters` | object | optional | - |
| `download_document_id` | string<uuid> | optional, nullable | Generated document UUID |
| `download_url` | string | optional, nullable | - |
| `adapter` | string | optional | - |
| `file_name` | string | optional, nullable | - |
| `row_count` | integer | optional | minimum 0 |
| `size_bytes` | integer | optional, nullable | minimum 0 |
| `generated_at` | string<date-time> | optional, nullable | Export file generation timestamp |
| `created_at` | string<date-time> | required | Created timestamp |
| `updated_at` | string<date-time> | required | Updated timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/exports/{id}

| Field | Contract |
|---|---|
| Purpose | Get export job |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Export job UUID |
| `export_id` | string<uuid> | required | Export job UUID |
| `event_id` | string<uuid> | required | Outbox event UUID |
| `report_type` | string | required | - |
| `format` | string enum("csv", "xlsx") | required | - |
| `status` | string | required | - |
| `outbox_status` | string | optional | - |
| `created_by_user_id` | string<uuid> | optional, nullable | Creator UUID |
| `created_by` | string | optional, nullable | - |
| `filters` | object | optional | - |
| `download_document_id` | string<uuid> | optional, nullable | Generated document UUID |
| `download_url` | string | optional, nullable | - |
| `adapter` | string | optional | - |
| `file_name` | string | optional, nullable | - |
| `row_count` | integer | optional | minimum 0 |
| `size_bytes` | integer | optional, nullable | minimum 0 |
| `generated_at` | string<date-time> | optional, nullable | Export file generation timestamp |
| `created_at` | string<date-time> | required | Created timestamp |
| `updated_at` | string<date-time> | required | Updated timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Assets

Asset APIs cover inventory, assignment/return, safe QR scan, and software license lifecycle.

### GET /api/v1/assets/

| Field | Contract |
|---|---|
| Purpose | List assets |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/

| Field | Contract |
|---|---|
| Purpose | Create asset |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/warranty-alerts

| Field | Contract |
|---|---|
| Purpose | Asset warranty alerts |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `window_days` | query | no | integer | minimum 0 |
| `include_expired` | query | no | boolean | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `alert_window_days` | integer | required | - |
| `generated_at` | string<date-time> | required | Generation timestamp |
| `counts` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/{id}

| Field | Contract |
|---|---|
| Purpose | Asset detail |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/{id}/assign

| Field | Contract |
|---|---|
| Purpose | Assign asset |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `assigned_to_user_id` | string<uuid> | required | Employee user UUID |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/{id}/return

| Field | Contract |
|---|---|
| Purpose | Return asset |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/scan/{qr_hash}

| Field | Contract |
|---|---|
| Purpose | Safe QR scan |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public safe QR scan returns limited data only. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `qr_hash` | path | yes | string | minLength 1 |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `qr_hash` | string | required | - |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `status` | string | required | - |
| `assigned` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/licenses/activate

| Field | Contract |
|---|---|
| Purpose | Activate license |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `product_id` | string<uuid> | required | Software product UUID |
| `entitlement_id` | string<uuid> | required | Entitlement UUID |
| `hardware_fingerprint` | string | required | minLength 8 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/licenses/validate

| Field | Contract |
|---|---|
| Purpose | Validate license |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `product_id` | string<uuid> | required | Software product UUID |
| `hardware_fingerprint` | string | required | minLength 8 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/licenses/revoke

| Field | Contract |
|---|---|
| Purpose | Revoke license/device |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `hardware_fingerprint` | string | required | minLength 8 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/requests

| Field | Contract |
|---|---|
| Purpose | Create asset request |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `request_type` | string enum("new", "replacement", "repair", "return") | required | - |
| `asset_type` | string | required | minLength 1 |
| `asset_id` | string<uuid> | optional, nullable | Related asset UUID |
| `reason` | string | required | minLength 3 |
| `priority` | string enum("low", "medium", "high", "urgent") | optional | - |
| `needed_by` | string<date> | optional, nullable | - |
| `preferred_specs` | object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `request` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/requests/my

| Field | Contract |
|---|---|
| Purpose | List my asset requests |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/requests/queue

| Field | Contract |
|---|---|
| Purpose | Asset request queue |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/requests/{id}/decision

| Field | Contract |
|---|---|
| Purpose | Decide asset request |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approved", "rejected", "returned", "fulfilled") | required | - |
| `remarks` | string | optional, nullable | - |
| `expected_version` | integer | required | minimum 1 |
| `asset_id` | string<uuid> | optional, nullable | Assigned asset UUID |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `request` | object | required | - |
| `assigned_asset` | object | optional, nullable | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/requests/{id}/cancel

| Field | Contract |
|---|---|
| Purpose | Cancel asset request |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `request` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/{id}/acknowledgements

| Field | Contract |
|---|---|
| Purpose | Acknowledge asset handover |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `acknowledgement_type` | string enum("received", "returned") | required | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `asset` | object | required | - |
| `acknowledgement` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/{id}/maintenance

| Field | Contract |
|---|---|
| Purpose | List asset maintenance |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/{id}/maintenance

| Field | Contract |
|---|---|
| Purpose | Create asset maintenance |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `maintenance_type` | string enum("repair", "preventive", "warranty", "inspection", "other") | required | - |
| `vendor_id` | string<uuid> | optional, nullable | Vendor UUID |
| `cost` | string | optional, nullable | - |
| `started_on` | string<date> | required | - |
| `completed_on` | string<date> | optional, nullable | - |
| `status` | string enum("scheduled", "in_progress", "completed", "cancelled") | optional | - |
| `notes` | string | optional, nullable | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `maintenance` | object | required | - |
| `asset` | object | required | - |
| `asset_version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/vendors

| Field | Contract |
|---|---|
| Purpose | List asset vendors |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/vendors

| Field | Contract |
|---|---|
| Purpose | Create asset vendor |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | required | minLength 2 |
| `contact_email` | string<email> | optional, nullable | - |
| `phone` | string | optional, nullable | - |
| `status` | string enum("active", "inactive") | optional | - |
| `metadata` | object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `vendor` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/assets/vendors/{id}

| Field | Contract |
|---|---|
| Purpose | Update asset vendor |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | minLength 2 |
| `contact_email` | string<email> | optional, nullable | - |
| `phone` | string | optional, nullable | - |
| `status` | string enum("active", "inactive") | optional | - |
| `metadata` | object | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `vendor` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/recovery-queue

| Field | Contract |
|---|---|
| Purpose | Asset recovery queue |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/recovery-queue/{id}/settlement

| Field | Contract |
|---|---|
| Purpose | Settle asset recovery ticket |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `settlement_status` | string enum("recovered", "deduction", "waived", "lost_damaged") | required | - |
| `settlement_amount` | string | optional, nullable | - |
| `remarks` | string | optional, nullable | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `asset` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Outbox / Platform Events

Platform event routes are protected runtime integrations and should not be exposed as normal UI actions.

### POST /api/v1/assets/events/employee-terminated

| Field | Contract |
|---|---|
| Purpose | Consume employee terminated event |
| Frontend use | Consume employee terminated event |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Protected runtime/platform event consumer; not a normal frontend screen API. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `employee_user_id` | string<uuid> | required | Terminated employee UUID |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Runtime integration route; do not expose as a normal user-facing frontend action.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Timesheets

Timesheet APIs cover work segments, submissions, approver queues, decisions, and workflow definitions.

### GET /api/v1/timesheets/work-segments

| Field | Contract |
|---|---|
| Purpose | List work segments |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/work-segments

| Field | Contract |
|---|---|
| Purpose | Create work segment |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `work_date` | string<date> | required | Work date |
| `project_code` | string | optional | - |
| `task_code` | string | optional | - |
| `hours` | string | required | Hours as fixed precision decimal; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `description` | string | optional | - |
| `billable` | boolean | optional | default false |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/submissions

| Field | Contract |
|---|---|
| Purpose | Submit timesheet cycle |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `cycle_start` | string<date> | required | Cycle start |
| `cycle_end` | string<date> | required | Cycle end |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/submissions/my

| Field | Contract |
|---|---|
| Purpose | My timesheet submissions |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/queue/approver

| Field | Contract |
|---|---|
| Purpose | Approver queue |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("Pending Approval", "Approved", "Returned", "Rejected") | - |
| `employee_user_id` | query | no | string<uuid> | - |
| `cycle_start` | query | no | string<date> | - |
| `cycle_end` | query | no | string<date> | - |
| `project_code` | query | no | string | minLength 1 |
| `billable` | query | no | boolean | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/projects/summary

| Field | Contract |
|---|---|
| Purpose | Project timesheet summary |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `cycle_start` | query | no | string<date> | - |
| `cycle_end` | query | no | string<date> | - |
| `project_id` | query | no | string<uuid> | - |
| `project_code` | query | no | string | minLength 1 |
| `user_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("employee", "project", "department", "week") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/missing-submissions

| Field | Contract |
|---|---|
| Purpose | Missing timesheet submissions |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `cycle_start` | query | no | string<date> | - |
| `cycle_end` | query | no | string<date> | - |
| `project_id` | query | no | string<uuid> | - |
| `project_code` | query | no | string | minLength 1 |
| `user_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("employee", "project", "department", "week") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/productivity-summary

| Field | Contract |
|---|---|
| Purpose | Timesheet productivity summary |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `cycle_start` | query | no | string<date> | - |
| `cycle_end` | query | no | string<date> | - |
| `project_id` | query | no | string<uuid> | - |
| `project_code` | query | no | string | minLength 1 |
| `user_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("employee", "project", "department", "week") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `cards` | object | required | - |
| `series` | array of object | required | - |
| `breakdown` | array of object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/selectors

| Field | Contract |
|---|---|
| Purpose | Timesheet selectors |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `include` | query | no | string | - |
| `date` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `projects` | array of object | required | - |
| `tasks` | array of object | required | - |
| `cycles` | array of object | required | - |
| `approvers` | array of object | required | - |
| `workflow_definitions` | array of object | required | - |
| `rules` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/submissions/{id}

| Field | Contract |
|---|---|
| Purpose | Timesheet submission detail |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Timesheet submission UUID |
| `employee_user_id` | string<uuid> | required | Employee/member UUID |
| `cycle_start` | string<date> | required | Cycle start |
| `cycle_end` | string<date> | required | Cycle end |
| `status` | string enum("Draft", "Submitted", "Pending Approval", "Approved", "Returned", "Rejected") | required | - |
| `total_hours` | string | required | Submitted total hours; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `workflow_definition_id` | string<uuid> | optional | Workflow definition UUID |
| `workflow_snapshot` | object | optional | - |
| `current_approver_user_id` | string<uuid> | optional, nullable | Current approver UUID |
| `version` | integer | required | minimum 1 |
| `employee` | object | required, nullable | - |
| `member` | object | required | Employee/member profile, department/designation, member_role, and manager reference. |
| `cycle` | object | required | - |
| `project_summary` | object | required | - |
| `hours_summary` | object | required | - |
| `workflow_metadata` | object | required | - |
| `segments` | array of object | required | - |
| `workflow_history` | array of object | required | - |
| `last_decision` | object | required, nullable | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/submissions/{id}/approve

| Field | Contract |
|---|---|
| Purpose | Timesheet decision |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approve", "reject", "return") | required | - |
| `remarks` | string | optional | Required for reject/return decisions. Trimmed before storage. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Timesheet submission UUID |
| `employee_user_id` | string<uuid> | required | Employee/member UUID |
| `cycle_start` | string<date> | required | Cycle start |
| `cycle_end` | string<date> | required | Cycle end |
| `status` | string enum("Draft", "Submitted", "Pending Approval", "Approved", "Returned", "Rejected") | required | - |
| `total_hours` | string | required | Submitted total hours; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `workflow_definition_id` | string<uuid> | optional | Workflow definition UUID |
| `workflow_snapshot` | object | optional | - |
| `current_approver_user_id` | string<uuid> | optional, nullable | Current approver UUID |
| `version` | integer | required | minimum 1 |
| `employee` | object | required, nullable | - |
| `member` | object | required | Employee/member profile, department/designation, member_role, and manager reference. |
| `cycle` | object | required | - |
| `project_summary` | object | required | - |
| `hours_summary` | object | required | - |
| `workflow_metadata` | object | required | - |
| `previous_status` | string | required | - |
| `next_status` | string | required | - |
| `decision` | string enum("approve", "return", "reject") | required | - |
| `audit_event` | object | required | - |
| `workflow_history` | array of object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/workflow-definitions

| Field | Contract |
|---|---|
| Purpose | List workflow definitions |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Attendance

Backend-owned API group.

### POST /api/v1/attendance/punches

| Field | Contract |
|---|---|
| Purpose | Record punch |
| Frontend use | Record punch |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_type` | string enum("check_in", "break_start", "break_end", "check_out") | required | - |
| `occurred_at` | string<date-time> | optional | Punch timestamp |
| `work_mode` | string enum("office", "remote", "wfh", "field") | optional | default "office" |
| `source` | string enum("web", "mobile", "kiosk", "admin") | optional | default "web" |
| `metadata` | object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/punches/my

| Field | Contract |
|---|---|
| Purpose | My punch events |
| Frontend use | My punch events |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/summary/my

| Field | Contract |
|---|---|
| Purpose | My attendance summary |
| Frontend use | My attendance summary |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Summary generation timestamp |
| `range` | object | required | - |
| `today` | object | required | - |
| `summary` | object | required | - |
| `week_records` | array of object | required | - |
| `exception_history` | array of object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/summary/team

| Field | Contract |
|---|---|
| Purpose | Team attendance summary |
| Frontend use | Team attendance summary |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Summary generation timestamp |
| `date` | string<date> | required | Attendance date |
| `totals` | object | required | - |
| `department_summary` | array of object | required | - |
| `exceptions` | array of object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/calendar/monthly

| Field | Contract |
|---|---|
| Purpose | Monthly attendance calendar |
| Frontend use | Monthly attendance calendar |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Calendar generation timestamp |
| `month` | string | required | - |
| `user` | object | required | - |
| `calendar_days` | array of object | required | - |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/calendar/daily

| Field | Contract |
|---|---|
| Purpose | Daily attendance calendar |
| Frontend use | Daily attendance calendar |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `generated_at` | string<date-time> | required | Daily calendar generation timestamp |
| `date` | string<date> | required | Attendance date |
| `summary` | object | required | - |
| `exceptions` | array of object | required | - |
| `totals` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/daily-explanations

| Field | Contract |
|---|---|
| Purpose | Explain daily attendance |
| Frontend use | Explain daily attendance |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `date` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Explanation generation timestamp |
| `work_date` | string<date> | required | Explained work date |
| `employee` | object | required | - |
| `summary` | object | required | - |
| `dimensions` | array of object | required | minItems 6 |
| `reasons` | array of object | required | - |
| `source_events` | array of object | required | - |
| `regularization` | object | required, nullable | - |
| `privacy` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/attendance/regularizations

| Field | Contract |
|---|---|
| Purpose | Submit attendance regularization |
| Frontend use | Submit attendance regularization |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `work_date` | string<date> | required | Regularization work date |
| `reason` | string | required | minLength 3 |
| `requested_punches` | array of object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Regularization request UUID |
| `employee_user_id` | string<uuid> | required | Employee user UUID |
| `work_date` | string<date> | required | Work date |
| `reason` | string | required | - |
| `requested_punches` | array of object | optional | - |
| `status` | string enum("pending", "approved", "returned", "rejected") | required | - |
| `current_approver_user_id` | string<uuid> | optional, nullable | Current approver user UUID |
| `decision_remarks` | string | optional, nullable | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/regularizations/my

| Field | Contract |
|---|---|
| Purpose | My regularization requests |
| Frontend use | My regularization requests |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/regularizations/queue/manager

| Field | Contract |
|---|---|
| Purpose | Manager regularization queue |
| Frontend use | `/finance/manager` verification workspace. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/attendance/regularizations/{id}/decision

| Field | Contract |
|---|---|
| Purpose | Decide attendance regularization |
| Frontend use | Decide attendance regularization |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approve", "reject", "return") | required | - |
| `remarks` | string | optional | Required for reject/return decisions. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/attendance/exceptions

| Field | Contract |
|---|---|
| Purpose | Attendance exceptions |
| Frontend use | Attendance exceptions |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `date` | query | no | string<date> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `month` | query | no | string | pattern ^\d{4}-\d{2}$ |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `status` | query | no | string | - |
| `exception_type` | query | no | string enum("late", "missing_punch", "absent", "early_out", "correction") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/attendance/exports

| Field | Contract |
|---|---|
| Purpose | Create attendance export job |
| Frontend use | Create attendance export job |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `filters` | object | optional | - |
| `columns` | array of string | optional | - |
| `format` | string enum("csv", "xlsx", "json") | optional | default "csv" |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `job_id` | string<uuid> | required | Attendance export job UUID |
| `status` | string enum("queued", "ready") | required | - |
| `format` | string enum("csv", "xlsx", "json") | required | - |
| `filters` | object | required | - |
| `columns` | array of string | required | - |
| `created_at` | string<date-time> | required | Export job creation timestamp |
| `download_document_id` | string<uuid> | optional, nullable | Generated document UUID |
| `download_url` | string | optional, nullable | - |
| `adapter` | string | optional | - |
| `file_name` | string | optional, nullable | - |
| `row_count` | integer | optional | minimum 0 |
| `size_bytes` | integer | optional, nullable | minimum 0 |
| `generated_at` | string<date-time> | optional, nullable | Export file generation timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Leave / WFH / Holidays

Backend-owned API group.

### GET /api/v1/leave/balances/my

| Field | Contract |
|---|---|
| Purpose | My leave balances |
| Frontend use | My leave balances |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Balance generation timestamp |
| `year` | integer | required | - |
| `user` | object | required | - |
| `balances` | array of object | required | - |
| `accruals` | array of object | optional | - |
| `pending_requests_summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/leave/balances/{user_id}

| Field | Contract |
|---|---|
| Purpose | Employee leave balances |
| Frontend use | Employee leave balances |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |
| `user_id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Balance generation timestamp |
| `year` | integer | required | - |
| `user` | object | required | - |
| `balances` | array of object | required | - |
| `accruals` | array of object | optional | - |
| `pending_requests_summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/leave/requests

| Field | Contract |
|---|---|
| Purpose | Apply leave |
| Frontend use | Apply leave |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `leave_type` | string enum("casual", "sick", "earned", "unpaid", "comp_off") | required | - |
| `date_from` | string<date> | required | Leave start date |
| `date_to` | string<date> | required | Leave end date |
| `half_day` | boolean | optional | default false |
| `reason` | string | required | minLength 3 |
| `document_ids` | array of string<uuid> | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/leave/requests/my

| Field | Contract |
|---|---|
| Purpose | My leave requests |
| Frontend use | My leave requests |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/leave/requests/queue/manager

| Field | Contract |
|---|---|
| Purpose | Manager leave approval queue |
| Frontend use | `/finance/manager` verification workspace. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/leave/requests/{id}/decision

| Field | Contract |
|---|---|
| Purpose | Decide leave request |
| Frontend use | Decide leave request |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approve", "reject", "return") | required | - |
| `remarks` | string | optional | Required for reject/return decisions. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/leave/requests/{id}/cancel

| Field | Contract |
|---|---|
| Purpose | Cancel leave request |
| Frontend use | Cancel leave request |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/wfh/requests

| Field | Contract |
|---|---|
| Purpose | Apply WFH |
| Frontend use | Apply WFH |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `date_from` | string<date> | required | WFH start date |
| `date_to` | string<date> | required | WFH end date |
| `half_day` | boolean | optional | default false |
| `reason` | string | required | minLength 3 |
| `project_ref` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/wfh/requests/my

| Field | Contract |
|---|---|
| Purpose | My WFH requests |
| Frontend use | My WFH requests |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/wfh/requests/queue/manager

| Field | Contract |
|---|---|
| Purpose | Manager WFH approval queue |
| Frontend use | `/finance/manager` verification workspace. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/wfh/requests/{id}/decision

| Field | Contract |
|---|---|
| Purpose | Decide WFH request |
| Frontend use | Decide WFH request |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approve", "reject", "return") | required | - |
| `remarks` | string | optional | Required for reject/return decisions. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/leave-wfh/hr-monitor

| Field | Contract |
|---|---|
| Purpose | HR Leave/WFH monitor |
| Frontend use | HR Leave/WFH monitor |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/leave-wfh/exports

| Field | Contract |
|---|---|
| Purpose | Create Leave/WFH export job |
| Frontend use | Create Leave/WFH export job |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `filters` | object | optional | - |
| `columns` | array of string | optional | - |
| `format` | string enum("csv", "xlsx", "json") | optional | default "csv" |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `job_id` | string<uuid> | required | Leave/WFH export job UUID |
| `status` | string enum("queued", "ready") | required | - |
| `format` | string enum("csv", "xlsx", "json") | required | - |
| `filters` | object | required | - |
| `columns` | array of string | required | - |
| `created_at` | string<date-time> | required | Export job creation timestamp |
| `download_document_id` | string<uuid> | optional, nullable | Generated document UUID |
| `download_url` | string | optional, nullable | - |
| `adapter` | string | optional | - |
| `file_name` | string | optional, nullable | - |
| `row_count` | integer | optional | minimum 0 |
| `size_bytes` | integer | optional, nullable | minimum 0 |
| `generated_at` | string<date-time> | optional, nullable | Export file generation timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/holidays

| Field | Contract |
|---|---|
| Purpose | Holiday calendar |
| Frontend use | Holiday calendar |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `year` | query | no | integer | minimum 2000 |
| `leave_type` | query | no | string enum("casual", "sick", "earned", "unpaid", "comp_off") | - |
| `status` | query | no | string enum("pending_manager", "approved", "returned", "rejected", "cancelled") | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |
| `request_kind` | query | no | string enum("leave", "wfh") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `holidays` | array of object | required | - |
| `calendar_metadata` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/holidays/{id}

| Field | Contract |
|---|---|
| Purpose | Upsert holiday |
| Frontend use | Upsert holiday |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | required | minLength 2 |
| `date` | string<date> | required | Holiday date |
| `region` | string | optional | default "All" |
| `optional` | boolean | optional | default false |
| `expected_version` | integer | optional | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

## EMS

Backend-owned API group.

### GET /api/v1/ems/profile/me

| Field | Contract |
|---|---|
| Purpose | My EMS profile |
| Frontend use | My EMS profile |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `profile` | object | required | - |
| `reporting_line` | array of object | required | - |
| `emergency_contacts` | array of object | required | - |
| `summaries` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/ems/profile/me

| Field | Contract |
|---|---|
| Purpose | Update my EMS profile |
| Frontend use | Update my EMS profile |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `personal_email` | string<email> | optional | - |
| `phone` | string | optional | - |
| `alternate_phone` | string | optional | - |
| `current_address` | string | optional | - |
| `permanent_address` | string | optional | - |
| `city` | string | optional | - |
| `country` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/profile-change-requests

| Field | Contract |
|---|---|
| Purpose | Submit profile change request |
| Frontend use | Submit profile change request |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `field_key` | string | required | - |
| `field_label` | string | optional | - |
| `new_value` | string | required | - |
| `reason` | string | optional | - |
| `supporting_document_ids` | array of string<uuid> | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/profile-change-requests/my

| Field | Contract |
|---|---|
| Purpose | My profile change requests |
| Frontend use | My profile change requests |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/profile-change-requests/queue/hr

| Field | Contract |
|---|---|
| Purpose | HR profile change queue |
| Frontend use | HR profile change queue |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/profile-change-requests/{id}/decision

| Field | Contract |
|---|---|
| Purpose | Decide profile change request |
| Frontend use | Decide profile change request |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approved", "returned", "rejected") | required | - |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/requests

| Field | Contract |
|---|---|
| Purpose | Submit EMS service request |
| Frontend use | Submit EMS service request |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `request_type` | string enum("profile_update", "document_verification", "letter", "asset", "hr_support") | required | - |
| `subject` | string | required | - |
| `description` | string | required | - |
| `document_ids` | array of string<uuid> | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/requests/my

| Field | Contract |
|---|---|
| Purpose | My EMS service requests |
| Frontend use | My EMS service requests |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/requests/queue/hr

| Field | Contract |
|---|---|
| Purpose | HR EMS service request queue |
| Frontend use | HR EMS service request queue |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/requests/{id}/decision

| Field | Contract |
|---|---|
| Purpose | Decide EMS service request |
| Frontend use | Decide EMS service request |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approved", "returned", "rejected", "closed") | required | - |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/admin/onboarding

| Field | Contract |
|---|---|
| Purpose | EMS admin onboarding queue |
| Frontend use | EMS admin onboarding queue |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/ems/admin/onboarding/{id}

| Field | Contract |
|---|---|
| Purpose | Update EMS onboarding checklist |
| Frontend use | Update EMS onboarding checklist |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `checklist` | object | optional | - |
| `status` | string enum("pending", "in_progress", "completed") | optional | - |
| `due_date` | string<date> | optional, nullable | - |
| `remarks` | string | optional, nullable | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/admin/probation

| Field | Contract |
|---|---|
| Purpose | EMS admin probation queue |
| Frontend use | EMS admin probation queue |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/admin/probation/{id}/decision

| Field | Contract |
|---|---|
| Purpose | Decide EMS probation review |
| Frontend use | Decide EMS probation review |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("confirmed", "extended") | required | - |
| `extended_until` | string<date> | optional | - |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/admin/exits

| Field | Contract |
|---|---|
| Purpose | EMS admin exit checklist queue |
| Frontend use | EMS admin exit checklist queue |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/ems/admin/exits/{id}

| Field | Contract |
|---|---|
| Purpose | Update EMS exit checklist |
| Frontend use | Update EMS exit checklist |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `checklist` | object | optional | - |
| `status` | string enum("pending", "in_progress", "completed") | optional | - |
| `due_date` | string<date> | optional, nullable | - |
| `remarks` | string | optional, nullable | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/letters

| Field | Contract |
|---|---|
| Purpose | My EMS letters |
| Frontend use | My EMS letters |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/letters/{id}/acknowledge

| Field | Contract |
|---|---|
| Purpose | Acknowledge EMS letter |
| Frontend use | Acknowledge EMS letter |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/policies

| Field | Contract |
|---|---|
| Purpose | My EMS policies |
| Frontend use | My EMS policies |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `type` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `department_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/policies/{id}/acknowledge

| Field | Contract |
|---|---|
| Purpose | Acknowledge EMS policy |
| Frontend use | Acknowledge EMS policy |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/ems/policies/{id}

| Field | Contract |
|---|---|
| Purpose | Update EMS policy |
| Frontend use | Update EMS policy |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | optional | - |
| `category` | string | optional | - |
| `version_label` | string | optional | - |
| `effective_from` | string<date> | optional | - |
| `document_id` | string<uuid> | optional, nullable | Policy document UUID |
| `status` | string enum("active", "inactive", "superseded") | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/ems/employees/{user_id}/documents

| Field | Contract |
|---|---|
| Purpose | List employee EMS documents |
| Frontend use | List employee EMS documents |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `document_type` | query | no | string | - |
| `user_id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `document_summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/ems/employees/{user_id}/documents

| Field | Contract |
|---|---|
| Purpose | Attach employee EMS document |
| Frontend use | Attach employee EMS document |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `user_id` | path | yes | string<uuid> | - |

**Request body**

EMS employee document upload metadata. The path employee user id is used as the business object id; binary storage is handled by the backend object-storage adapter.

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | minLength 1 |
| `file_name` | string | required | minLength 1 |
| `mime_type` | string | required | minLength 1 |
| `size_bytes` | integer | required | minimum 1 |
| `checksum_sha256` | string | optional | - |
| `replace_document_id` | string<uuid> | optional | Existing EMS document UUID to replace |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `document` | object | required | - |
| `access_policy` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Projects / Utilization

Backend-owned API group.

### GET /api/v1/projects

| Field | Contract |
|---|---|
| Purpose | List projects |
| Frontend use | List projects |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/projects

| Field | Contract |
|---|---|
| Purpose | Create project |
| Frontend use | Create project |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `project_code` | string | required | minLength 2 |
| `name` | string | required | minLength 2 |
| `client_name` | string | required | minLength 1 |
| `project_type` | string enum("client", "internal") | optional | default "client" |
| `billing_type` | string enum("fixed", "hourly", "retainer", "internal") | optional | default "fixed" |
| `manager_user_id` | string<uuid> | required | Project manager user UUID |
| `department_id` | string<uuid> | optional | Owning department UUID |
| `start_date` | string<date> | required | Project start date |
| `end_date` | string<date> | required | Project end date |
| `status` | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | optional | default "planned" |
| `health` | string enum("green", "amber", "red") | optional | default "green" |
| `description` | string | optional | - |
| `estimated_hours` | string | optional | Estimated project hours; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `estimated_budget` | string | optional | Estimated project budget; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `tech_stack` | array of string | optional | - |
| `priority` | string enum("low", "medium", "high", "critical") | optional | default "medium" |
| `cost_center` | string | optional, nullable | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `project` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/projects/{id}

| Field | Contract |
|---|---|
| Purpose | Project detail |
| Frontend use | Project detail |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Project UUID |
| `project_code` | string | required | - |
| `code` | string | optional | - |
| `name` | string | required | - |
| `client_name` | string | required | - |
| `client` | string | optional | - |
| `project_type` | string | optional | - |
| `type` | string | optional | - |
| `billing_type` | string | optional | - |
| `billingType` | string | optional | - |
| `manager_user_id` | string<uuid> | optional | Project manager user UUID |
| `manager` | object | optional | - |
| `department` | object | optional, nullable | - |
| `start_date` | string<date> | optional | Project start date |
| `end_date` | string<date> | optional | Project end date |
| `status` | string | required | - |
| `health` | string | optional | - |
| `description` | string | optional, nullable | - |
| `estimated_hours` | string | optional | Estimated hours; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_hours` | string | optional | Actual hours; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `estimated_budget` | string | optional | Estimated budget; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_spend` | string | optional | Actual spend; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `tech_stack` | array of string | optional | - |
| `priority` | string | optional | - |
| `cost_center` | string | optional, nullable | - |
| `version` | integer | required | minimum 1 |
| `counts` | object | required | - |
| `permissions` | object | optional | - |
| `members` | array of object | optional | - |
| `allocations` | array of object | optional | - |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/projects/{id}

| Field | Contract |
|---|---|
| Purpose | Update project |
| Frontend use | Update project |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `project_code` | string | optional | minLength 2 |
| `name` | string | optional | minLength 2 |
| `client_name` | string | optional | minLength 1 |
| `project_type` | string enum("client", "internal") | optional | default "client" |
| `billing_type` | string enum("fixed", "hourly", "retainer", "internal") | optional | default "fixed" |
| `manager_user_id` | string<uuid> | optional | Project manager user UUID |
| `department_id` | string<uuid> | optional | Owning department UUID |
| `start_date` | string<date> | optional | Project start date |
| `end_date` | string<date> | optional | Project end date |
| `status` | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | optional | default "planned" |
| `health` | string enum("green", "amber", "red") | optional | default "green" |
| `description` | string | optional | - |
| `estimated_hours` | string | optional | Estimated project hours; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `estimated_budget` | string | optional | Estimated project budget; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `tech_stack` | array of string | optional | - |
| `priority` | string enum("low", "medium", "high", "critical") | optional | default "medium" |
| `cost_center` | string | optional, nullable | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `project` | object | required | - |
| `version` | integer | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/projects/{id}/archive

| Field | Contract |
|---|---|
| Purpose | Archive project |
| Frontend use | Archive project |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/projects/{id}/members

| Field | Contract |
|---|---|
| Purpose | List project members |
| Frontend use | List project members |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/projects/{id}/members

| Field | Contract |
|---|---|
| Purpose | Add project member |
| Frontend use | Add project member |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `user_id` | string<uuid> | required | Employee user UUID |
| `project_role` | string | required | - |
| `allocation_percent` | integer | optional | default 100; minimum 0 |
| `billable` | boolean | optional | default true |
| `start_date` | string<date> | required | Assignment start date |
| `end_date` | string<date> | optional | Assignment end date |
| `reporting_lead_user_id` | string<uuid> | optional | Reporting lead user UUID |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/projects/{id}/members/{member_id}

| Field | Contract |
|---|---|
| Purpose | Update project member |
| Frontend use | Update project member |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |
| `member_id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `project_role` | string | optional | - |
| `allocation_percent` | integer | optional | minimum 0 |
| `billable` | boolean | optional | - |
| `start_date` | string<date> | optional | Assignment start date |
| `end_date` | string<date> | optional | Assignment end date |
| `reporting_lead_user_id` | string<uuid> | optional | Reporting lead user UUID |
| `status` | string enum("active", "removed") | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/projects/{id}/allocations

| Field | Contract |
|---|---|
| Purpose | List allocation history |
| Frontend use | List allocation history |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/projects/{id}/allocations

| Field | Contract |
|---|---|
| Purpose | Create allocation |
| Frontend use | Create allocation |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `user_id` | string<uuid> | required | Employee user UUID |
| `date_from` | string<date> | required | Allocation start date |
| `date_to` | string<date> | optional | Allocation end date |
| `allocation_percent` | integer | required | minimum 0 |
| `billable` | boolean | optional | default true |
| `notes` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/projects/{id}/milestones

| Field | Contract |
|---|---|
| Purpose | List milestones |
| Frontend use | List milestones |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/projects/{id}/milestones

| Field | Contract |
|---|---|
| Purpose | Create milestone |
| Frontend use | Create milestone |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | required | - |
| `owner_user_id` | string<uuid> | optional | Milestone owner user UUID |
| `status` | string enum("planned", "in_progress", "completed", "on_hold") | optional | default "planned" |
| `start_date` | string<date> | optional | Milestone start date |
| `due_date` | string<date> | required | Milestone due date |
| `priority` | string enum("low", "medium", "high", "critical") | optional | default "medium" |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/projects/{id}/documents

| Field | Contract |
|---|---|
| Purpose | List project documents |
| Frontend use | List project documents |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/projects/{id}/summary

| Field | Contract |
|---|---|
| Purpose | Project summary |
| Frontend use | Project summary |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/team-utilization/summary

| Field | Contract |
|---|---|
| Purpose | Team utilization summary |
| Frontend use | Team utilization summary |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("planned", "active", "on_hold", "completed", "cancelled", "archived") | - |
| `client` | query | no | string | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `search` | query | no | string | - |
| `include` | query | no | string | - |
| `active_only` | query | no | boolean | - |
| `role` | query | no | string | - |
| `user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `group_by` | query | no | string enum("department", "manager") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Helpdesk

Backend-owned API group.

### GET /api/v1/helpdesk/tickets

| Field | Contract |
|---|---|
| Purpose | List helpdesk tickets |
| Frontend use | List helpdesk tickets |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("new", "assigned", "in_progress", "on_hold", "resolved", "closed", "reopened", "escalated") | - |
| `priority` | query | no | string enum("Low", "Medium", "High", "Urgent") | - |
| `category_id` | query | no | string<uuid> | - |
| `category_key` | query | no | string enum("IT", "HR", "Finance", "Admin", "Assets", "Project Support") | - |
| `assignee_id` | query | no | string<uuid> | - |
| `requester_id` | query | no | string<uuid> | - |
| `active_only` | query | no | boolean | - |
| `search` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets

| Field | Contract |
|---|---|
| Purpose | Create helpdesk ticket |
| Frontend use | Create helpdesk ticket |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `category_id` | string<uuid> | optional | Helpdesk category UUID |
| `category_key` | string enum("IT", "HR", "Finance", "Admin", "Assets", "Project Support") | optional | - |
| `subject` | string | required | minLength 3 |
| `description` | string | required | minLength 3 |
| `sub_category` | string | optional | - |
| `priority` | string enum("Low", "Medium", "High", "Urgent") | optional | default "Medium" |
| `document_ids` | array of string<uuid> | optional | - |
| `attachment_name` | string | optional | - |
| `related_asset_id` | string | optional | - |
| `related_project_id` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/helpdesk/tickets/{id}

| Field | Contract |
|---|---|
| Purpose | Helpdesk ticket detail |
| Frontend use | Helpdesk ticket detail |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Helpdesk ticket UUID |
| `ticket_no` | string | required | - |
| `display_id` | string | optional | - |
| `subject` | string | required | - |
| `description` | string | optional | - |
| `category_id` | string<uuid> | optional | Helpdesk category UUID |
| `category_key` | string | required | - |
| `category` | object | optional | - |
| `sub_category` | string | optional, nullable | - |
| `priority` | string | required | - |
| `status` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_name` | string | optional | - |
| `requester_email` | string | optional, nullable | - |
| `requester_department` | string | optional, nullable | - |
| `assignee_user_id` | string<uuid> | optional | Assigned agent user UUID |
| `assignee_name` | string | optional, nullable | - |
| `assignee_role` | string | optional, nullable | - |
| `first_response_at` | string<date-time> | optional | First public agent response time |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `resolution` | string | optional, nullable | - |
| `reopen_count` | integer | optional | minimum 0 |
| `escalated` | boolean | optional | - |
| `sla` | object | optional | - |
| `counts` | object | optional | - |
| `comments` | array of object | optional | - |
| `attachments` | array of object | optional | - |
| `events` | array of object | optional | - |
| `version` | integer | required | minimum 1 |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/helpdesk/tickets/{id}

| Field | Contract |
|---|---|
| Purpose | Update helpdesk ticket |
| Frontend use | Update helpdesk ticket |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `category_id` | string<uuid> | optional | Helpdesk category UUID |
| `category_key` | string enum("IT", "HR", "Finance", "Admin", "Assets", "Project Support") | optional | - |
| `subject` | string | optional | minLength 3 |
| `description` | string | optional | minLength 3 |
| `sub_category` | string | optional | - |
| `priority` | string enum("Low", "Medium", "High", "Urgent") | optional | default "Medium" |
| `document_ids` | array of string<uuid> | optional | - |
| `attachment_name` | string | optional | - |
| `related_asset_id` | string | optional | - |
| `related_project_id` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/comments

| Field | Contract |
|---|---|
| Purpose | Add public ticket comment |
| Frontend use | Add public ticket comment |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | required | minLength 1 |
| `document_ids` | array of string<uuid> | optional | - |
| `expected_version` | integer | optional | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/internal-notes

| Field | Contract |
|---|---|
| Purpose | Add internal ticket note |
| Frontend use | Add internal ticket note |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | required | minLength 1 |
| `document_ids` | array of string<uuid> | optional | - |
| `expected_version` | integer | optional | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/attachments

| Field | Contract |
|---|---|
| Purpose | Attach helpdesk document |
| Frontend use | Attach helpdesk document |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `document_id` | string<uuid> | optional | Document UUID |
| `attachment_type` | string | optional | default "supporting_document" |
| `file_name` | string | optional | - |
| `size_text` | string | optional | - |
| `expected_version` | integer | optional | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/assign

| Field | Contract |
|---|---|
| Purpose | Assign helpdesk ticket |
| Frontend use | Assign helpdesk ticket |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `assignee_user_id` | string<uuid> | required | Assignee user UUID |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/priority

| Field | Contract |
|---|---|
| Purpose | Change helpdesk priority |
| Frontend use | Change helpdesk priority |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `priority` | string enum("Low", "Medium", "High", "Urgent") | required | - |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/status

| Field | Contract |
|---|---|
| Purpose | Change helpdesk status |
| Frontend use | Change helpdesk status |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string enum("new", "assigned", "in_progress", "on_hold", "reopened", "escalated") | required | - |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/resolve

| Field | Contract |
|---|---|
| Purpose | Resolve helpdesk ticket |
| Frontend use | Resolve helpdesk ticket |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `resolution` | string | required | minLength 3 |
| `document_ids` | array of string<uuid> | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/close

| Field | Contract |
|---|---|
| Purpose | Close helpdesk ticket |
| Frontend use | Close helpdesk ticket |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `satisfaction` | integer | optional | minimum 1 |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/tickets/{id}/reopen

| Field | Contract |
|---|---|
| Purpose | Reopen helpdesk ticket |
| Frontend use | Reopen helpdesk ticket |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | required | minLength 3 |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `ticket` | object | required | - |
| `version` | integer | required | minimum 1 |
| `ticket_version` | integer | optional | minimum 1 |
| `comment` | object | optional | - |
| `note` | object | optional | - |
| `attachment` | object | optional | - |
| `sla` | object | optional | - |
| `resolved_at` | string<date-time> | optional | Resolution time |
| `closed_at` | string<date-time> | optional | Closure time |
| `reopened_at` | string<date-time> | optional | Reopen time |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/helpdesk/categories

| Field | Contract |
|---|---|
| Purpose | List helpdesk categories |
| Frontend use | List helpdesk categories |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("new", "assigned", "in_progress", "on_hold", "resolved", "closed", "reopened", "escalated") | - |
| `priority` | query | no | string enum("Low", "Medium", "High", "Urgent") | - |
| `category_id` | query | no | string<uuid> | - |
| `category_key` | query | no | string enum("IT", "HR", "Finance", "Admin", "Assets", "Project Support") | - |
| `assignee_id` | query | no | string<uuid> | - |
| `requester_id` | query | no | string<uuid> | - |
| `active_only` | query | no | boolean | - |
| `search` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `categories` | array of object | required | - |
| `sla` | object | required | - |
| `actor_scope` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/helpdesk/categories

| Field | Contract |
|---|---|
| Purpose | Create helpdesk category |
| Frontend use | Create helpdesk category |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `category_key` | string enum("IT", "HR", "Finance", "Admin", "Assets", "Project Support") | required | - |
| `label` | string | required | minLength 1 |
| `default_assignee_user_id` | string<uuid> | optional, nullable | Default assignee user UUID |
| `default_assignee_name` | string | optional, nullable | - |
| `default_assignee_role` | string | optional, nullable | - |
| `team` | string | required | minLength 1 |
| `active` | boolean | optional | default true |
| `sub_categories` | array of object | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `category` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/helpdesk/categories/{id}

| Field | Contract |
|---|---|
| Purpose | Update helpdesk category |
| Frontend use | Update helpdesk category |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | string | optional | minLength 1 |
| `default_assignee_user_id` | string<uuid> | optional, nullable | Default assignee user UUID |
| `default_assignee_name` | string | optional, nullable | - |
| `default_assignee_role` | string | optional, nullable | - |
| `team` | string | optional | minLength 1 |
| `active` | boolean | optional | - |
| `sub_categories` | array of object | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `category` | object | required | - |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/helpdesk/sla-report

| Field | Contract |
|---|---|
| Purpose | Helpdesk SLA report |
| Frontend use | Helpdesk SLA report |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string enum("new", "assigned", "in_progress", "on_hold", "resolved", "closed", "reopened", "escalated") | - |
| `priority` | query | no | string enum("Low", "Medium", "High", "Urgent") | - |
| `category_id` | query | no | string<uuid> | - |
| `category_key` | query | no | string enum("IT", "HR", "Finance", "Admin", "Assets", "Project Support") | - |
| `assignee_id` | query | no | string<uuid> | - |
| `requester_id` | query | no | string<uuid> | - |
| `active_only` | query | no | boolean | - |
| `search` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Notifications

Backend-owned API group.

### GET /api/v1/notifications

| Field | Contract |
|---|---|
| Purpose | List notifications |
| Frontend use | List notifications |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `unread_only` | query | no | boolean | - |
| `type` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/notifications/unread-count

| Field | Contract |
|---|---|
| Purpose | Unread notification count |
| Frontend use | Unread notification count |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `unread_count` | integer | required | minimum 0 |
| `latest_created_at` | string<date-time> | optional | Latest unread notification timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/notifications/{id}/read

| Field | Contract |
|---|---|
| Purpose | Mark notification read |
| Frontend use | Mark notification read |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | optional | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `notification` | object | required | - |
| `unread_count` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/notifications/read-all

| Field | Contract |
|---|---|
| Purpose | Mark all notifications read |
| Frontend use | Mark all notifications read |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Backend RBAC/ABAC decides access. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | optional | - |
| `before` | string<date-time> | optional | Only notifications created before this timestamp |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `updated_count` | integer | required | minimum 0 |
| `unread_count` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.
