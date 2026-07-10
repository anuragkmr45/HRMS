# Database And Data

Last verified from the repository: 2026-06-30.

The backend uses PostgreSQL with separate schemas for each domain. Drizzle schema definitions live in `hrms_backend/src/db/schema.ts`; SQL migrations live in `hrms_backend/src/db/migrations/`.

## Domain Schemas

| Schema | Main Tables |
| --- | --- |
| `core` | departments, designations, users, roles, role_permissions, user_roles |
| `platform` | sessions, credentials, auth tokens, idempotency keys, outbox events, notifications, email deliveries/events, company profile, admin config tables, processed events |
| `attendance` | punch events, daily records, regularization requests |
| `leave_wfh` | leave requests, WFH requests, holidays |
| `expenses` | expense tickets, line items, approvals, manager backups, documents, payments, audit logs, policy rules |
| `documents` | document metadata, versions, permissions, access logs |
| `assets` | assets, assignments, recovery tickets, requests, acknowledgements, maintenance records, vendors, licenses, compromised keys |
| `timesheets` | work segments, workflow definitions, submissions, approval actions |
| `projects` | projects, members, allocations, milestones |
| `helpdesk` | categories, tickets, comments, attachments, events |
| `ems` | employee profiles, profile change requests, service requests, letters, policies, acknowledgements, admin checklists, probation reviews |

## Migration Order

Current migration files:

```text
0001_initial.sql
0002_auth_onboarding.sql
0003_attendance.sql
0004_leave_wfh.sql
0005_ems.sql
0006_projects.sql
0007_helpdesk.sql
0008_notifications.sql
0009_asset_workflows.sql
0010_admin_company_profile.sql
0011_admin_master_data.sql
0012_admin_rbac.sql
0013_admin_workflows.sql
0014_admin_policies.sql
0015_admin_email_templates.sql
0016_admin_notification_channels.sql
0017_admin_security_settings.sql
0018_ems_admin_workflows.sql
0019_asset_vendor_recovery_workflows.sql
0020_resend_email_delivery.sql
0021_core_profile_photos.sql
0022_company_profile_logo.sql
0023_admin_extended_master_data.sql
0024_department_cost_center.sql
0025_company_scoped_master_policy.sql
```

`scripts/db-migrate.ts` reads every SQL file in sorted order and applies the combined migration text to `DATABASE_URL`.

## Migration Commands

Local:

```bash
cd hrms_backend
pnpm db:migrate
```

Production build/runtime:

```bash
pnpm build
pnpm db:migrate:prod
```

Cross-schema FK guard:

```bash
pnpm db:verify:no-cross-schema-fks
```

## Data Store Modes

| Mode | Purpose |
| --- | --- |
| Memory | Tests, local API doc generation, limited dev paths. |
| PostgreSQL | Normal runtime persistence with database, Valkey session/outbox support, and object storage. |

The app creates the runtime store in `buildApp()` through `createRuntimeStore()` and decorates Fastify with `app.store`.

## Persistence Flush Behavior

After successful mutations, `src/app.ts` chooses a persistence flush target by method/path/status:

- Auth-only mutations flush auth data.
- Company bootstrap/logo routes flush the matching company bootstrap/logo domain.
- Domain mutation prefixes flush the relevant persistence domain, such as `core`, `expenses`, `assets`, `projects`, `documents`, or `platform`.
- Unknown successful mutations fall back to full persistence flush and log a warning.

This matters for performance and correctness when adding new mutation routes.

## No Cross-Schema Foreign Keys

The backend intentionally avoids cross-schema SQL foreign keys. Reasons:

- Keeps domain schemas independently evolvable.
- Prevents migrations in one domain from taking hard dependencies on another.
- Keeps seeded/test data and future extraction easier.

Application services and repositories must enforce cross-domain relationships. Run `pnpm db:verify:no-cross-schema-fks` after schema/migration changes.

## Seed Data

Important commands:

```bash
pnpm release:seed
pnpm seed:dev
pnpm qa:seed
pnpm qa:seed:extras
```

Seed personas and release data are under:

- `hrms_backend/src/platform/seed-dev.ts`
- `hrms_backend/src/platform/seed-personas.ts`
- `hrms_backend/scripts/seed-release-data.ts`
- `hrms_backend/scripts/seed-qa-data.ts`

Do not enable production auto-seeding. `HRMS_SEED_IF_EMPTY` must stay controlled and environment-specific.

## Object Storage Data

Document/media metadata lives in PostgreSQL. Binary file content is stored through the backend object storage adapter.

Main paths:

- `hrms_backend/src/platform/object-storage.ts`
- `hrms_backend/src/modules/documents/`
- `hrms_backend/src/shared/uploads/` on the frontend

Production and hosted environments must use real Cloudinary values and `CLOUDINARY_MOCK_UPLOADS=false`. Local development may use mock uploads when not testing persistence.

## Sessions And Tokens

| Data | Storage |
| --- | --- |
| Access JWT | Returned to client and used as bearer token. |
| Session cookie | Browser cookie using `SESSION_COOKIE_NAME`. |
| Session record | Memory or Valkey-backed session store. |
| Auth tokens | `platform.auth_tokens`, including email verification, password setup/reset, and company bootstrap. |
| User credentials | `platform.user_credentials`. |

Email verification and password reset tokens are application-owned. Resend delivery status does not decide token validity.

## Backup And Restore

Backend scripts exist for database backup and restore:

```bash
cd hrms_backend
pnpm backup:db
pnpm restore:db
```

Use hosted platform backup tools for production-grade recovery. See `../deployment/rollback-runbook.md` and the hosted provider dashboards for approved production operations.

