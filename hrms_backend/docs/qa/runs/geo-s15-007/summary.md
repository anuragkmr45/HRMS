# GEO-S15-007 QA Summary

## Scope

- Task: Final backend security review fixes for Sprint 15.
- Domain: Security.
- Reviewed implementation scope covers object authorization, tenant scope, idempotency, location access, and sensitive logging.
- No repository artifact containing the original GEO-S15-007 security finding list was found during inspection; this implementation is based on repository inspection and the ticket scope.

## Security Review Status

- Object authorization: inspected attendance routes/services/repositories that accept resource IDs; current code already loads tenant-owned resources inside active-company and object authorization boundaries.
- Tenant scope: inspected active-company resolution, attendance repositories, geofence publishing, platform device paths, and offline replay paths; current code already scopes reads/writes/updates by company where required.
- Idempotency: inspected platform attendance idempotency, durable `client_event_id`, stored-response replay, and offline sequence replay; current code already scopes by company, actor, device where applicable, and rejects changed payload replay.
- Location access: inspected exact-coordinate access service, location evidence retention, purge worker, and offline payload surfaces; no public exact-coordinate route was found, and the internal exact-coordinate service is tenant-scoped, retention-aware, and audit-before-return.
- Sensitive logging: one code-level defect was confirmed and fixed in the outbox worker execution path.

## Confirmed Finding

- Severity: not specified.
- Category: sensitive logs.
- Finding: `src/workers/run-outbox-worker.ts` emitted raw `Error` objects with `console.error(..., error)`, and `src/workers/outbox-worker.ts` persisted raw `error.message` into `platform.outbox_events.last_error`.
- Risk: third-party, Valkey, or database driver errors can include command arguments, payload fragments, idempotency values, coordinates, authorization values, cookies, tokens, secrets, or arbitrary nested metadata. Those paths bypass Fastify/Pino redaction.

## Implemented Remediation

- Added a narrow worker safe-error formatter that keeps only bounded operational fields: worker, phase, tightly constrained error name/classification, tightly constrained safe machine error code when available, and a fixed internal message.
- Replaced raw worker `console.error(..., error)` calls with structured safe JSON error logs.
- Updated in-memory and Postgres outbox retry paths to store only the safe bounded error summary in `last_error`.
- The formatter does not serialize arbitrary error objects, nested driver metadata, stack, cause, command, payload, or arbitrary `error.message` text. Worker logs and `last_error` use the fixed message `worker operation failed`.
- Error names are allowlisted to conventional classifications. Error codes must match a constrained machine-code shape and are omitted if they contain sensitive code segments.

## Regression Test Evidence

- Added unit coverage for a simulated driver error containing canaries for latitude, longitude, bearer authorization, cookie, token/secret, `raw_payload`, `idempotency_key`, and fake command/payload contents.
- Added fail-closed unit coverage for the short opaque canary `q7X2p91z` in `error.message`, `error.name`, `error.code`, command, and payload metadata.
- Assertions verify canaries do not appear in worker emitted logs.
- Assertions verify canaries do not appear in memory outbox `last_error`.
- Assertions verify the same safe `last_error` value is passed to the Postgres outbox update path.
- Assertions verify useful operational metadata remains: worker, phase, allowed error name/classification, safe error code when valid, and fixed worker failure message.

## Validation Results

- `node_modules/.bin/vitest.cmd run --project unit src/workers/__tests__/outbox-safe-error.unit.test.ts`: passed, 1 file, 6 tests.
- `node_modules/.bin/vitest.cmd run --project unit src/platform/logger-redaction.unit.test.ts`: passed, 1 file, 1 test.
- `node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit`: passed.
- `git diff --check`: passed; Git reported existing LF-to-CRLF working-copy warnings for the two modified worker files.

## Database And Migration Impact

- No schema migration was created.
- No schema migration is required because the fix changes runtime log/error formatting and the existing `platform.outbox_events.last_error` column continues to store text.
- Migration verification was not required for this change.

## Residual Risks

- An internal exact-coordinate access service exists, but no public exact-coordinate route was found. Any future route must enforce explicit actor/object authorization, tenant scope, retention checks, and audit-before-return.
- Historical `platform.outbox_events.last_error` values created before this fix may contain unsanitized third-party error text. No destructive cleanup migration was created.
- The original external/Sprint-15 security-review finding artifact was not present in the repository, so this implementation is based on repository inspection and the GEO-S15-007 ticket scope.

## Pilot Release Conclusion

- The confirmed code-level sensitive worker error leakage path has been remediated with focused regression coverage.
- Previously inspected object authorization, tenant scope, idempotency, and location-access systems were intentionally left unchanged because no concrete defect was identified in those paths for this task.
