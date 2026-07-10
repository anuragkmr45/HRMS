# Data Architecture

Last verified from the repository: 2026-06-30.

The backend uses PostgreSQL with schema-per-domain ownership. Drizzle schema definitions live in `hrms_backend/src/db/schema.ts`; SQL migrations live in `hrms_backend/src/db/migrations/`.

## Domain Schemas

| Schema | Ownership |
| --- | --- |
| `core` | employees, departments, designations, roles, role permissions, user roles |
| `platform` | sessions, credentials, auth tokens, company profile, admin settings, notifications, outbox, email deliveries/events |
| `attendance` | punch events, daily records, regularization requests |
| `leave_wfh` | leave requests, WFH requests, holidays |
| `expenses` | expense tickets, line items, approvals, backups, documents, payments, audit logs, policy rules |
| `documents` | document metadata, versions, permissions, access logs |
| `assets` | assets, assignments, requests, acknowledgements, vendors, maintenance, licenses, recovery |
| `timesheets` | work segments, workflow definitions, submissions, approval actions |
| `projects` | project records, members, allocations, milestones |
| `helpdesk` | categories, tickets, comments, attachments, events |
| `ems` | employee profiles, change requests, service requests, letters, policies, acknowledgements, checklists, probation |

## Migration State

There are 25 ordered SQL migrations, ending with:

```text
0025_company_scoped_master_policy.sql
```

Migration command:

```bash
cd hrms_backend
pnpm db:migrate
```

Production artifact command:

```bash
pnpm db:migrate:prod
```

## No Cross-Schema Foreign Keys

Cross-schema SQL foreign keys are intentionally prohibited. This keeps domains independently evolvable and avoids migration coupling across schemas.

Verification:

```bash
cd hrms_backend
pnpm db:verify:no-cross-schema-fks
```

Cross-domain consistency must be enforced in services/repositories.

## Object Storage Boundary

Document metadata is stored in PostgreSQL. File content is stored through the backend object-storage adapter. Clients must not write directly to Cloudinary or receive Cloudinary secrets.

Document-related tables:

- `documents.doc_metadata`
- `documents.doc_versions`
- `documents.doc_permissions`
- `documents.doc_access_logs`

## Export Data

Generated exports produce backend document records and return document IDs or metadata for download handoff. Secure download still goes through backend document APIs.

## Seed Data

Relevant seed scripts:

- `src/platform/seed-dev.ts`
- `scripts/seed-release-data.ts`
- `scripts/seed-qa-data.ts`

Common commands:

```bash
pnpm seed:dev
pnpm release:seed
pnpm qa:seed
```

Do not enable automatic production seeding unless explicitly approved.

