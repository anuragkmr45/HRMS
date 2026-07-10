# Security, Auth, And RBAC Architecture

Last verified from the repository: 2026-06-30.

## Authentication

Authentication is implemented in the backend through:

- `hrms_backend/src/auth/index.ts`
- `hrms_backend/src/plugins/auth.ts`
- `hrms_backend/src/modules/auth/`

Passwords use Node crypto `scrypt`. JWTs are HMAC-signed and include session JTI, subject user ID, employee code, roles, issued-at, and expiry claims.

## Session Model

Requests can authenticate with:

- configured session cookie, or
- `Authorization: Bearer <access_token>`

The backend validates the JWT signature, resolves the session by JTI from the session store, checks revocation state, loads the actor user, and decorates the request with `request.actor`.

Session records are backed by memory in local/test paths or Valkey/runtime persistence in hosted mode.

## Public Route Boundary

Public paths are explicitly listed in `src/plugins/auth.ts`. They include health checks, auth signup/login/logout/verification/reset paths, onboarding bootstrap/logo paths, Resend webhook, and OpenAPI/Swagger only when `OPENAPI_PUBLIC=true`.

Every other backend route should require an actor.

## Role Split

Frontend roles and backend roles are not the same system.

Frontend roles control navigation and UI visibility:

- `main_admin`
- `hr_admin`
- `employee`
- `manager`
- `director`
- `auditor`
- `project_manager`
- `finance_manager`
- `asset_admin`
- `helpdesk_agent`

Backend roles enforce business access:

- `Employee`
- `Reviewer`
- `Director`
- `Finance Manager`
- `Admin`
- `Auditor`
- `Asset Manager`
- `HR Manager`

Backend services and policies are authoritative. Frontend route guards are user experience only.

## Permissions

Backend permission constants live in `hrms_backend/src/shared/constants.ts`. Examples:

- `expense:create`
- `expense:manager-verify`
- `expense:finance-approve`
- `expense:finance`
- `expense:audit`
- `document:read`
- `document:write`
- `document:verify`
- `report:read`
- `project:read`
- `project:manage`
- `asset:manage`
- `timesheet:approve`
- `admin:*`

Admin Settings exposes persistent RBAC configuration, but runtime route/API enforcement still depends on existing backend role and permission policy unless a future dynamic enforcement migration changes that.

## Security Headers And CORS

The backend registers a security headers plugin and CORS config. Production must use explicit `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY=true`, and secure cookies.

Production blockers:

- weak/default JWT secrets
- `OPENAPI_PUBLIC=true` without approval
- credentialed CORS reflecting arbitrary origins
- frontend API mock fallback enabled
- mock Cloudinary enabled
- shared DB/Valkey across environments

## Rate Limits

Backend rate limit config:

- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_WINDOW_SECONDS`
- `RATE_LIMIT_READ_MAX`
- `RATE_LIMIT_WRITE_MAX`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_PUBLIC_MAX`

Frontend also has client request pacing to avoid unnecessary user-triggered bursts.

## Email Token Safety

Verification and password-reset raw tokens are not stored. Token truth lives in `platform.auth_tokens` as token hashes and metadata. Resend webhook events never mark users verified.

Detailed reference: `email-verification.md`.

