# Database Backup And Restore Runbook

Last verified from the repository: 2026-06-30.

Use this runbook for PostgreSQL backup/restore operations and migration safety checks.

## Scripts

Backend package scripts:

```bash
cd hrms_backend
pnpm backup:db
pnpm restore:db
```

Migration scripts:

```bash
pnpm db:migrate
pnpm db:migrate:prod
pnpm db:verify:no-cross-schema-fks
```

## Backup Before Risky Changes

Before risky data work:

1. Identify target environment and database branch.
2. Confirm `DATABASE_URL` points to the intended environment.
3. Take provider snapshot/backup in Neon or approved DB platform.
4. Optionally run `pnpm backup:db` where operator tooling is configured.
5. Record backup ID/path, timestamp, and operator.

## Restore Rules

Restore is high risk. Do not restore production unless:

- release owner approves
- business accepts possible data loss
- backup is verified
- restore target is confirmed
- API/worker/frontend compatibility is understood

Prefer forward corrective migrations for bad schema/data changes.

## Migration Safety

Before deploy:

```bash
cd hrms_backend
pnpm db:migrate
pnpm db:verify:no-cross-schema-fks
```

Hosted production should use built artifact migration:

```bash
pnpm build
pnpm db:migrate:prod
```

## If Migration Fails

1. Stop deploy.
2. Capture migration error and environment.
3. Do not retry blindly if partial changes may have applied.
4. Inspect migration idempotency.
5. Snapshot current DB state.
6. Apply a tested corrective migration or restore only with approval.

## Post-Operation Validation

- API readiness is 200.
- Login works.
- A representative list route loads.
- Changed module workflow works.
- No cross-schema FK guard failures.
- Worker logs show no schema-related errors.

