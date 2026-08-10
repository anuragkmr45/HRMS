# GEO-S12-002 QA Summary

## Scope

- Implemented a focused database-schema change for work sites, logical geofences, and geofence versions.
- Kept the change limited to schema SQL, Drizzle schema declarations, integration tests, and this QA artifact.
- Did not add APIs, services, repositories, outbox/runtime behavior, workers, or cross-schema SQL foreign keys.

## Schema Implemented

- Added migration `0042_work_sites_geofences.sql`.
- Added `attendance.work_sites` with tenant-scoped site codes, active flag, non-empty text checks, timezone validation through `pg_timezone_names`, JSONB object metadata, and audit/version columns without cross-schema foreign keys.
- Added `attendance.geofences` with tenant-safe work-site relationship, active flag, nullable `current_published_version_id`, metadata checks, and tenant/site/code uniqueness.
- Added `attendance.geofence_versions` with immutable version rows, `shape geometry(Geometry, 4326)`, `shape_type` values `circle` and `polygon`, `version_status` values `draft` and `published`, publication field consistency checks, and per-geofence version uniqueness.
- Updated `src/db/schema.ts` with the new tables, columns, indexes, checks, and same-schema composite foreign keys. Drizzle's built-in PostGIS helper in `drizzle-orm@0.44.7` only emits point geometry, so `customType` is used for `geometry(Geometry,4326)`.
- The deferrable circular current-published-version FK is implemented in SQL, not as a Drizzle table-builder FK, because modeling both sides directly creates a TypeScript circular initializer.

## Integrity and Immutability

- No cross-schema foreign keys were introduced by `0042`.
- `work_sites.timezone` is enforced by `attendance.validate_work_site_timezone()` and a trigger that checks `pg_timezone_names`.
- `geofences.current_published_version_id` uses a nullable composite FK to `geofence_versions(id, company_id, geofence_id)` and a deferred constraint trigger that requires the pointed version to be `published`.
- `geofence_versions` allows draft edits and draft deletes, prevents identity/provenance changes even while draft, permits only `draft -> published`, permits only status/publication field changes during publish, and rejects update/delete of published rows.
- No `superseded` status was added; replacing the current pointer leaves prior published rows intact.

## Spatial Rules and Indexes

- Circle versions require `shape_type = 'circle'`, `ST_Point`, SRID 4326, 2D coordinates, longitude/latitude bounds, and a positive `circle_radius_meters`.
- Polygon versions require `shape_type = 'polygon'`, `ST_Polygon` or `ST_MultiPolygon`, SRID 4326, 2D valid non-empty geometry, and no circle radius.
- Added partial GiST index for published circles: `USING gist ((shape::geography)) WHERE shape_type = 'circle' AND version_status = 'published'`.
- Added partial GiST index for published polygons: `USING gist (shape) WHERE shape_type = 'polygon' AND version_status = 'published'`.

## Commands and Results

- `pnpm.cmd install --config.node-linker=hoisted`: passed after sandboxed pnpm left `node_modules` without usable package links.
- `pnpm.cmd typecheck`: passed.
- `pnpm.cmd db:verify:migrations`: failed before reaching `0042`; existing checksum mismatch on `0034_attendance_break_segments_and_completed_state.sql`.
- `pnpm.cmd db:verify:no-cross-schema-fks`: failed on existing violations in `0036_attendance_shift_templates.sql` and `0037_attendance_policy_versions.sql`; `0042_work_sites_geofences.sql` was not listed.
- `pnpm.cmd vitest run src/db/__tests__/postgis-btree-gist.integration.test.ts`: failed because `TEST_DATABASE_URL` equals `DATABASE_URL`, and the test refuses to reset the main database.
- `pnpm.cmd vitest run src/modules/attendance/__tests__/geofence-schema.integration.test.ts`: suite loaded, but all tests were skipped after `beforeAll` failed with the same isolated database guard.
- `git diff --check`: passed; only Git reported the existing LF-to-CRLF working-copy warning for `src/db/schema.ts`.
