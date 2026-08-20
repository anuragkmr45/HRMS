# Offline Attendance Sync Contract

Status: Proposed contract for Sprint 13 GEO-S13-004. This endpoint is not registered in Fastify and is not available in the generated OpenAPI contract.

## Purpose

Define the backend contract shape for future mobile offline attendance synchronization without mutating attendance state in Sprint 13.

The proposed future endpoint is:

```txt
POST /api/v1/attendance/offline-sync
```

Version one is authenticated self-service only. The server derives company and actor from the authenticated session or bearer token. Mobile payloads must not submit tenant, actor, employee, verification, payroll, or server timestamp fields.

## Non-Goals

- No executable sync ingestion endpoint.
- No offline batch or event persistence tables.
- No device registration API, attestation, signatures, or trust enforcement.
- No persistent sequence watermark.
- No historical attendance replayer.
- No offline verification or review workflow.
- No promotion from unverified to verified.
- No session, daily projection, outbox, payroll, or worker changes.
- No frontend or mobile queue implementation.

## Outbox Readiness

Sprint 13 GEO-S13-008 adds the `attendance.provisional.recorded` outbox event contract only. This document still does not define an executable ingestion endpoint, and the event is not emitted by current ordinary attendance commands.

The future producer belongs inside the future offline event-level ingestion transaction after one logical event is accepted provisionally with `verification_status=unverified` or `verification_status=review_required`. It must run only when the durable `client_event_id` check determines the logical event is not a replay. The future outbox identity is `aggregate_type=attendance`, `aggregate_id=attendance_event_id`, with a stable idempotency key derived from the accepted attendance event or authoritative provisional transition.

The provisional event payload is an explicit allowlist: schema version, company and actor IDs from server context, subject employee ID, attendance event ID, optional command ID, source channel, verification status, provisional reason code, captured time, and server receipt time. It must not contain exact coordinates, raw location evidence, request snapshots, device envelopes, device secrets, tokens, authorization inputs, or raw client metadata.

## Request Envelope

Top-level request fields:

```json
{
  "contract_version": "attendance.offline_sync.v1",
  "batch_id": "00000000-0000-4000-8000-000000000100",
  "device": {
    "device_id": "mobile-installation-handle",
    "platform": "android",
    "app_version": "2026.08.03",
    "os_version": "Android 15"
  },
  "events": [
    {
      "client_event_id": "00000000-0000-4000-8000-000000000101",
      "sequence": 42,
      "command_kind": "employee_manual_now",
      "captured_at": "2026-08-03T09:00:00.000+05:30",
      "source": "mobile_offline",
      "event_type": "check_in",
      "work_mode": "office",
      "metadata": {
        "network_state": "offline",
        "capture_method": "user_action",
        "client_timezone": "Asia/Calcutta"
      },
      "location": {
        "latitude": 12.971599,
        "longitude": 77.594566,
        "accuracy_meters": 18,
        "captured_at": "2026-08-03T08:59:58.000Z",
        "provider": "device",
        "permission_state": "granted"
      }
    }
  ]
}
```

`batch_id` is transport correlation metadata only. It is not replay identity.

`device` is required for this mobile-offline envelope and contains client-supplied informational device and application metadata. Device fields are untrusted: they do not determine company or actor, authorize attendance, prove registration or attestation, replace `client_event_id`, or provide cryptographic sequence trust.

Each event contains one logical attendance action. `sequence` must be a positive safe integer.

The batch, device, event, metadata, and location schemas are strict. They reject `company_id`, `actor_user_id`, `employee_id`, `employee_user_id`, `subject_employee_user_id`, `tenant_id`, `occurred_at`, `server_received_at`, `processed_at`, `payroll_state`, `verification_status`, and unknown nested identity or server-only fields.

## Timestamp Trust Model

- `events[].captured_at`: client-reported action capture time. It is untrusted audit and transport metadata.
- `events[].location.captured_at`: client-reported GPS sample time. It is distinct from event capture time.
- top-level `server_received_at`: future server-generated receipt time for the current batch request.
- per-result `server_received_at`: original server receipt time for that logical event. On replay this can differ from the current batch receipt time.
- `processed_at`: optional future server verification time.

`captured_at` must never be treated as authoritative attendance `occurred_at`. Current self-service attendance remains server-time authoritative.

## Replay Behavior

`client_event_id` remains the logical event identity. Future uniqueness scope is:

```txt
company_id + authenticated actor_user_id + client_event_id
```

`company_id` and `actor_user_id` come from server context only. `batch_id` never replaces event-level identity.

Expected future behavior:

- Same `client_event_id` and same canonical event: replay stored result.
- Same `client_event_id` and different canonical event: conflict.
- Same event submitted in another batch: replay, not a new mutation.
- In-flight event: deferred or processing conflict, not duplicate mutation.

The canonical event hash excludes `batch_id`, batch array position, `server_received_at`, `processed_at`, and response metadata. It includes semantic event content: `client_event_id`, `sequence`, `command_kind`, `captured_at`, `source`, `event_type`, `work_mode`, allowlisted metadata, and location evidence. Version one derives the semantic source channel as `mobile_offline` at the offline contract boundary; other source values are not accepted by this contract.

## Sequence Semantics

`sequence` is a positive monotonically increasing client value.

Future intended stream scope:

```txt
company + actor + device installation
```

Device identity is currently untrusted. Version one does not claim cryptographic trust, enforce persistent sequence watermarks, use sequence for authorization, or use sequence as the primary replay key.

Within one batch:

- Duplicate `client_event_id` values are invalid.
- Duplicate `sequence` values for the submitted device stream are invalid.
- Result order should match deterministic event order.

Future runtime behavior should classify gaps, lower/out-of-order sequences, same-sequence different events, and device reset or reinstallation as synchronization facts for review. Sequence anomalies must not be treated as permission to apply historical events directly to the current session state.

## Response Envelope

Transport sync status is separate from attendance verification status.

Sync statuses:

```txt
accepted
replayed
conflict
rejected
deferred
```

Verification statuses:

```txt
unverified
review_required
rejected
```

Per-event result:

```json
{
  "client_event_id": "00000000-0000-4000-8000-000000000101",
  "sequence": 42,
  "sync_status": "accepted",
  "verification_status": "unverified",
  "replayed": false,
  "reason_code": "offline_sync.accepted_unverified",
  "server_received_at": "2026-08-03T03:45:10.000Z",
  "processed_at": null,
  "payroll_eligible": false
}
```

`replayed` is required and must agree with `sync_status`: it is `true` only when `sync_status=replayed`.

Compatibility rules:

- `sync_status=accepted` can use `verification_status=unverified` or `review_required`, but not `rejected`.
- `sync_status=conflict` must use `verification_status=rejected`.
- `sync_status=rejected` must use `verification_status=rejected`.
- `sync_status=deferred` must use `verification_status=review_required`.
- `sync_status=replayed` may preserve any previously stored verification result: `unverified`, `review_required`, or `rejected`.

Reason-code compatibility:

- `offline_sync.accepted_unverified`: `sync_status=accepted`.
- `offline_sync.replayed`: `sync_status=replayed`.
- `offline_sync.changed_body_conflict`: `sync_status=conflict`.
- `offline_sync.validation_failed`: `sync_status=rejected`.
- `offline_sync.processing_deferred`, `offline_sync.sequence_gap`, and `offline_sync.sequence_out_of_order`: `sync_status=deferred`.
- `offline_sync.duplicate_sequence`: request or batch validation; it is not an accepted result.

The response must not contain exact coordinates, raw location evidence, raw request snapshots, device secrets, tokens, or authorization inputs.

## Payroll Safety Invariant

Unverified offline events must never finalize payroll unless a future explicit policy permits it.

For Sprint 13 contract semantics, `payroll_eligible` is always the literal value `false`.

An `accepted` sync result means the future transport accepted the event for replay/review processing. It does not mean verified attendance, final attendance, or payroll-ready time.

## Partial Batch Semantics

Future synchronization may partially accept a batch. Each event receives its own result, and clients must persist terminal event results individually. A rejected or conflicted event must not force successful replay of unrelated events to be retried with a new `client_event_id`.

## Examples

Successful unverified batch result:

```json
{
  "contract_version": "attendance.offline_sync.v1",
  "batch_id": "00000000-0000-4000-8000-000000000100",
  "server_received_at": "2026-08-03T03:45:10.000Z",
  "results": [
    {
      "client_event_id": "00000000-0000-4000-8000-000000000101",
      "sequence": 42,
      "sync_status": "accepted",
      "verification_status": "unverified",
      "replayed": false,
      "reason_code": "offline_sync.accepted_unverified",
      "server_received_at": "2026-08-03T03:45:10.000Z",
      "processed_at": null,
      "payroll_eligible": false
    }
  ]
}
```

Replayed item:

```json
{
  "contract_version": "attendance.offline_sync.v1",
  "batch_id": "00000000-0000-4000-8000-000000000100",
  "server_received_at": "2026-08-03T04:46:00.000Z",
  "results": [
    {
      "client_event_id": "00000000-0000-4000-8000-000000000101",
      "sequence": 42,
      "sync_status": "replayed",
      "verification_status": "unverified",
      "replayed": true,
      "reason_code": "offline_sync.replayed",
      "server_received_at": "2026-08-03T03:45:10.000Z",
      "processed_at": null,
      "payroll_eligible": false
    }
  ]
}
```

In this replay example, the current batch receipt is `2026-08-03T04:46:00.000Z`, while the original event receipt is `2026-08-03T03:45:10.000Z`.

Changed-body conflict:

```json
{
  "client_event_id": "00000000-0000-4000-8000-000000000101",
  "sequence": 42,
  "sync_status": "conflict",
  "verification_status": "rejected",
  "replayed": false,
  "reason_code": "offline_sync.changed_body_conflict",
  "server_received_at": "2026-08-03T03:47:00.000Z",
  "processed_at": null,
  "payroll_eligible": false
}
```

Sequence gap or out-of-order item:

```json
{
  "client_event_id": "00000000-0000-4000-8000-000000000120",
  "sequence": 99,
  "sync_status": "deferred",
  "verification_status": "review_required",
  "replayed": false,
  "reason_code": "offline_sync.sequence_gap",
  "server_received_at": "2026-08-03T03:48:00.000Z",
  "processed_at": null,
  "payroll_eligible": false
}
```

Unverified result:

```json
{
  "client_event_id": "00000000-0000-4000-8000-000000000130",
  "sequence": 100,
  "sync_status": "accepted",
  "verification_status": "unverified",
  "replayed": false,
  "reason_code": "offline_sync.accepted_unverified",
  "server_received_at": "2026-08-03T03:49:00.000Z",
  "processed_at": null,
  "payroll_eligible": false
}
```

## Sprint 14 Deferrals

- Executable offline synchronization ingestion.
- Offline batch and event persistence tables.
- Device registration APIs.
- Device attestation or signatures.
- Persistent device sequence watermarks.
- Historical attendance replayer.
- Offline verification and review workflow.
- Promotion from unverified to verified.
- Session or daily projection reconstruction.
- Payroll export and finalization integration.
- Background synchronization workers.
- Mobile/frontend queue implementation.
