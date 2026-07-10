# Developer Handoff Template

Last verified from the repository: 2026-06-30.

Use this template for dev-to-QA handoff, new-developer transfer, or release notes when a task changes product behavior.

## Template

```text
Title:
Owner:
Date:
Branch/commit:

Summary:

Modules changed:

Roles affected:

Frontend routes changed:

Backend APIs changed:

Database migrations:

Environment/config/secrets impact:

Media/email/Valkey/worker impact:

API contract docs updated:

User-visible behavior:

Verification commands run:

Manual checks run:

QA scenarios:

Known risks:

Rollback notes:

Docs updated:
```

## Minimum Required Fields

For every handoff, fill:

- summary
- modules changed
- roles affected
- frontend routes changed
- backend APIs changed
- DB migrations
- verification commands
- QA scenarios
- known risks
- rollback notes

Use `none` only when checked and not applicable.

## Example Verification Block

```text
Verification commands run:
- Backend: pnpm typecheck, pnpm test:integration -- <module>, pnpm api:docs:verify
- Frontend: pnpm build, pnpm api:production-config-guard
- Manual: login as Employee and Manager in QA, create request, approve request
```

## Evidence Expectations

Attach or record:

- environment URL
- user/role used
- request ID for API defects
- screenshot or video for UI defects
- document/upload proof when file handling changed
- deploy SHA/build SHA for hosted validation

