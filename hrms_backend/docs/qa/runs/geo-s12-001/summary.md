# GEO-S12-001 QA Run

## Scope

Provision PostgreSQL/PostGIS capability for future geo work without implementing geofence logic, frontend behavior,
geometry/geography schema columns, or client-trusted location decisions.

## Files Changed

- `.github/workflows/branch-ci-cd.yml`
- `hrms_backend/infra/docker/docker-compose.dev.yml`
- `hrms_backend/infra/docker/docker-compose.qa.yml`
- `hrms_backend/infra/docker/docker-compose.prod.yml`
- `hrms_backend/scripts/verify-release-db.ts`
- `hrms_backend/src/db/migrations/0041_enable_postgis_btree_gist.sql`
- `hrms_backend/src/db/__tests__/postgis-btree-gist.integration.test.ts`
- `docs/knowledge-transfer/local-development.md`
- `docs/deployment/hosted-deployment.md`
- `hrms_backend/docs/qa/runs/geo-s12-001/summary.md`

## Implementation Notes

- PostgreSQL image parity: all local, QA, production Compose, and CI service image references now use
  `postgis/postgis:16-3.5-alpine`.
- Migration `0041_enable_postgis_btree_gist.sql` uses only `CREATE EXTENSION IF NOT EXISTS postgis;` and
  `CREATE EXTENSION IF NOT EXISTS btree_gist;`.
- The release verifier now requires `postgis` and `btree_gist`, and runs a read-only `SELECT PostGIS_Version();`
  functional probe.
- The focused integration test requires an isolated `TEST_DATABASE_URL`, checks installed extensions via
  `pg_extension`, proves deterministic PostGIS distance behavior, and validates a `btree_gist` UUID plus `tstzrange`
  exclusion constraint.

## Operational Notes

- Hosted rollout still requires operator verification on each branch database and production database.
- Stop deployment if the migration role cannot create either extension.
- Rollback must not use `DROP EXTENSION`; restore from backup or roll forward after review.
- Existing Docker volumes are not reinitialized by the image tag change. Do not delete or recreate valuable, shared,
  hosted, QA, or production database storage for this rollout.
- No production or shared database was modified during this implementation pass.

## Verification Log

- `git status --short`
  - Result: clean before implementation.
- `git branch --show-current`
  - Result: `sprint-12/geo-s12-001`.
- `git diff --check`
  - Result: passed before DB verification. Git reported only line-ending warnings for touched files.
- `git diff --check -- <GEO-S12 files>`
  - Result: passed after implementation. Git reported only line-ending warnings for touched tracked files.
- `CI=true pnpm.cmd install`
  - Result: passed after sandboxed pnpm registry access was blocked and left `node_modules` incomplete.
- `CI=true pnpm.cmd typecheck`
  - Result: passed.
- `POSTGRES_HOST_PORT=56543 VALKEY_HOST_PORT=56544 docker compose -f infra/docker/docker-compose.qa.yml -p hawkaii_hrms_backend_geo_s12 up -d --wait postgres valkey`
  - Result: passed. Started isolated services using `postgis/postgis:16-3.5-alpine`.
- URL isolation check
  - Result: `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_qa`;
    `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test`; confirmed distinct.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test CI=true pnpm.cmd db:migrate`
  - Result: passed. Applied 41 migrations, including `0041_enable_postgis_btree_gist.sql`.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test CI=true pnpm.cmd db:migrate:status`
  - Result: passed. Total files: 41; applied: 41; pending: 0.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test CI=true pnpm.cmd db:verify:migrations`
  - Result: passed. Migration history verified; schema drift gate passed.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_qa TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test CI=true pnpm.cmd db:verify:no-cross-schema-fks`
  - Result: failed on existing attendance cross-schema FK references in migrations `0036` and `0037`; no GEO-S12 migration references were reported.
- `docker exec hawkaii_hrms_backend_geo_s12-postgres-1 psql -U postgres -d hrms_platform_test -c "SELECT extname FROM pg_extension WHERE extname IN ('postgis','btree_gist') ORDER BY extname;"`
  - Result: passed; returned `btree_gist` and `postgis`.
- `docker exec hawkaii_hrms_backend_geo_s12-postgres-1 psql -U postgres -d hrms_platform_test -c "SELECT PostGIS_Version();"`
  - Result: passed; returned `3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_qa TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test CI=true pnpm.cmd exec vitest run --project integration src/db/__tests__/postgis-btree-gist.integration.test.ts`
  - Result: passed. 1 file, 1 test.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test CI=true pnpm.cmd release:seed`
  - Result: passed against isolated test DB.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test HRMS_REPORT_DIR=docs/qa/runs/geo-s12-001 CI=true pnpm.cmd release:verify:db`
  - Result: failed on existing cross-schema FKs. The generated verifier artifact still recorded
    `verified PostGIS functional execution (3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1)`.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_qa TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56543/hrms_platform_test CI=true pnpm.cmd test:integration`
  - Result: inconclusive; timed out after 424 seconds before producing a completed suite result.
- `docker compose -f infra/docker/docker-compose.qa.yml -p hawkaii_hrms_backend_geo_s12 down`
  - Result: passed. Stopped and removed isolated containers/network without deleting named volumes.
- Final worktree-wide `git diff --check`
  - Result: failed only on unrelated `hrms_backend/src/modules/reports/__tests__/reports.integration.test.ts:19`
    trailing whitespace. That file is outside GEO-S12-001 and was left untouched.
