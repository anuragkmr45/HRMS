# Runbooks

Last verified from the repository: 2026-06-30.

Runbooks are operational procedures. Architecture decisions belong in `../architecture/`; deployment setup belongs in `../deployment/`.

## Runbook Set

| Runbook | Purpose |
| --- | --- |
| `health-and-smoke-runbook.md` | Health checks and post-deploy smoke procedure. |
| `incident-response-runbook.md` | First-response procedure for production/QA incidents. |
| `database-backup-restore-runbook.md` | Backup/restore scripts, safety checks, and rollback cautions. |
| `worker-operations-runbook.md` | Outbox worker and attendance auto punch-out worker operations. |
| `media-storage-runbook.md` | Cloudinary/media/document upload and download troubleshooting. |
| `resend-email-verification-deployment.md` | Resend email verification deployment and support. |

## General Incident Data To Capture

- environment
- frontend URL and API URL
- user and active role
- request ID
- build SHA/deploy SHA
- timestamp with timezone
- screenshots or response excerpts
- recent deploys/migrations/config changes

## Safety Rules

- Do not run production destructive actions without release owner approval.
- Do not paste secrets into tickets, docs, chat, logs, or screenshots.
- Prefer forward corrective migrations over database restore unless restore is approved and tested.
- Roll back API and worker together when backend event/schema compatibility is in doubt.

