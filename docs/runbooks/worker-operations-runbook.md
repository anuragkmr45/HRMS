# Worker Operations Runbook

Last verified from the repository: 2026-06-30.

This runbook covers backend background workers.

## Workers

| Worker | Main Files | Purpose |
| --- | --- | --- |
| Outbox worker | `src/workers/outbox-worker.ts`, `src/workers/run-outbox-worker.ts` | Publishes pending business events to Valkey streams. |
| Attendance auto punch-out worker | `src/workers/attendance-auto-punchout-worker.ts` | Closes expired attendance sessions according to policy/timezone. |

## Local Outbox Worker

```bash
cd hrms_backend
pnpm worker:outbox
```

Production worker command:

```bash
pnpm worker:start
```

## Outbox Event States

```text
pending
retry
published
dead_letter
```

If publishing fails repeatedly, events become `dead_letter`.

## Worker Deployment

Hosted Render uses a separate worker service. Deploy the API and worker from compatible commits because they share:

- database schema
- event payload shapes
- Valkey stream names
- shared package code

## Troubleshooting Outbox

Symptoms:

- notifications or async side effects delayed
- Valkey errors in logs
- dead-letter count grows
- worker crashes after API deploy

Checks:

1. Confirm worker service is running.
2. Confirm `VALKEY_URL` is correct for the environment.
3. Confirm DB migrations applied.
4. Inspect worker logs for payload/schema errors.
5. Check whether API and worker are on compatible deploys.
6. Roll back worker with API if schema/event mismatch is suspected.

## Attendance Auto Punch-Out

The attendance worker reads active attendance policy and company timezone. It uses a PostgreSQL advisory lock in Postgres mode to avoid duplicate runs.

Checks:

- attendance policy is active and enabled
- company timezone is correct
- worker lock is not held by another process
- generated checkout punches are not duplicated
- daily records recompute after closure

## Escalation

If worker behavior risks data integrity:

1. Stop or pause worker service.
2. Keep API available if safe.
3. Preserve logs and affected event IDs.
4. Fix code/config/schema.
5. Restart worker after validation.

