# ADR-05: Attendance Outbox Event Contract

## Status

Accepted for Sprint 10 GEO-S10-008.

## Contract

New attendance outbox rows use these event names:

- `attendance.punch.recorded`
- `attendance.provisional.recorded`
- `attendance.geo.rejected`
- `attendance.missing_checkout.detected`
- `attendance.regularization.submitted`
- `attendance.regularization.approved`
- `attendance.regularization.returned`
- `attendance.regularization.rejected`
- `attendance.export.requested`

Every payload has `schema_version: 1`, `company_id`, and `actor_user_id`. Employee-specific payloads also have `subject_employee_user_id`.

`aggregate_type` remains `attendance`, so the stream remains `hrms.attendance`. A punch event uses `punch_event_id` as `aggregate_id` in every producer path. Provisional events use `attendance_event_id`; geo rejection events use the denied command `decision_id`; missing-checkout events use the synthetic checkout `punch_event_id`. Regularization events use `regularization_request_id`; export events use `export_job_id`.

Payloads are built from explicit allowlists. Punch events contain only identity/correlation IDs, punch type, time, work mode, source channel, and day status. Provisional events contain only identity/correlation IDs, source channel, verification status, reason code, capture time, and receipt time. Geo rejection events contain only identity/correlation IDs, source channel, selected action, factual outcome, reason code, fallback flag, and decision time. Missing-checkout events contain only identity/correlation IDs, work date, synthetic checkout time, and system origin. Regularization events contain only workflow IDs, statuses, dates, versions, and decision time. Export events contain only export job ID, format, and status.

Current runtime producers exist for punch recorded, geo rejected, missing checkout, regularization submitted/approved/returned/rejected, and export requested. `attendance.provisional.recorded` is contract-only until a future offline event-level ingestion workflow exists. Its future producer belongs in that future transaction after the event is accepted provisionally and only when durable `client_event_id` handling determines the event is not a replay.

No ordinary attendance event may contain raw request snapshots, metadata, location evidence, latitude/longitude, coordinates/geometry/geography, accuracy or distance, device data, IP/user-agent/header/cookie/token data, idempotency keys or hashes, free-form reasons or remarks, error stacks, filters, columns, filenames, or download URLs. Exact coordinates remain accessible only through a future restricted evidence API.

Historical outbox events are not backfilled or renamed. Producers do not dual-publish old names.

## Versioning

Consumers must branch on both event name and `schema_version`. Unknown event names or schema versions are failures and must not be silently marked processed.

## Delivery and consumer rules

Delivery is at least once. A consumer deduplicates by its stable `consumer_name` plus the envelope `event_id`, using `platform.processed_events`.

For database-side consumers, the processed marker and all database side effects must commit in the same transaction. A failed handler must roll back the marker. Different consumer names may process the same event independently. Consumers must not assume global ordering or log raw payloads.

External side effects must use `event_id` as their idempotency key, or be represented by another transactional outbox. A publisher acknowledgement is not a consumer processed marker.
