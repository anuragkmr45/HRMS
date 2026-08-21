# Attendance API Migration Guide

Date: 2026-08-21

This guide documents the current backend attendance API contracts for client
migration planning. It does not introduce `/api/v2`, new endpoint paths, new
schemas, new deprecation headers, or removal dates.

Current runtime and contract sources of truth:

- `docs/api/openapi.json`
- `docs/api/API_CONSUMER_GUIDE.md`
- `docs/api/API_ATTENDANCE_IDEMPOTENCY_GUIDE.md`
- `src/modules/attendance/routes.ts`
- `src/shared/schemas.ts`
- `src/modules/attendance/command-service.ts`
- `src/modules/attendance/offline-sync-contract.ts`
- `src/modules/attendance/offline-sync-service.ts`
- `src/modules/platform/routes.ts`
- `src/modules/platform/device-service.ts`
- `src/plugins/auth.ts`
- `src/modules/auth/routes.ts`
- `src/__tests__/contracts.contract.test.ts`

Historical or proposed documentation that may be stale:

- `docs/api/OFFLINE_ATTENDANCE_SYNC_CONTRACT.md`

## Compatibility Summary

All active attendance APIs are currently under `/api/v1`. There is no active
attendance `/api/v2` backend contract.

`POST /api/v1/attendance/punches` accepts both:

- the current command envelope with `client_event_id`, `captured_at`, `device`,
  and `command`; and
- the legacy direct punch body with top-level `event_type`, `work_mode`,
  `source`, `metadata`, and `location`.

The current command envelope is the recommended contract for new and migrated
clients. The legacy direct body remains supported for compatibility, but it is
not formally deprecated in OpenAPI and no removal date is implemented.

The only relevant formal deprecation currently present in the public contract is
the `requested_punches` compatibility field on attendance regularization create
requests. New clients should use `items`.

## Endpoint Inventory

### Attendance Commands

| Method | Path | Purpose | Contract status |
|---|---|---|---|
| `POST` | `/api/v1/attendance/punches` | Employee self-service attendance punch. Accepts current envelope and legacy direct body. | Current endpoint with legacy body compatibility |
| `POST` | `/api/v1/attendance/offline-sync` | Mobile offline attendance batch ingestion through the provisional offline inbox/evidence workflow. | Current mobile/offline endpoint |
| `POST` | `/api/v1/attendance/employees/{employeeUserId}/assisted-current-punches` | Admin/HR assisted current punch for another employee. | Current privileged endpoint |
| `POST` | `/api/v1/attendance/employees/{employeeUserId}/historical-corrections` | Admin/HR historical check-in/check-out correction. | Current privileged endpoint |
| `POST` | `/api/v1/attendance/regularizations` | Employee regularization request. | Current endpoint with deprecated `requested_punches` field |
| `POST` | `/api/v1/attendance/regularizations/{id}/decision` | Manager decision on a regularization request. | Current manager endpoint |

All command endpoints require an authenticated actor. Self-service and mobile
clients should use `Authorization: Bearer <access_token>`. Browser clients may
use the session cookie issued by login.

### Attendance Reads

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/attendance/punches/my` | Employee punch history for the authenticated actor |
| `GET` | `/api/v1/attendance/summary/my` | Employee attendance summary |
| `GET` | `/api/v1/attendance/summary/team` | Manager team attendance summary |
| `GET` | `/api/v1/attendance/calendar/monthly` | Monthly attendance calendar |
| `GET` | `/api/v1/attendance/calendar/daily` | Daily attendance calendar details |
| `GET` | `/api/v1/attendance/regularizations/my` | Employee regularization requests |
| `GET` | `/api/v1/attendance/regularizations/queue/manager` | Manager regularization queue |

Read endpoints are not migration drivers for punch submission, but clients often
use them to confirm accepted or replayed actions.

### Platform Device Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/platform/devices` | Register a mobile installation for the authenticated user and active company |
| `GET` | `/api/v1/platform/devices` | List the authenticated user's registered, suspended, and revoked devices |
| `POST` | `/api/v1/platform/devices/{deviceId}/revoke` | Revoke a registered or suspended device |
| `POST` | `/api/v1/platform/devices/{deviceId}/suspend` | Admin-only device suspension |
| `POST` | `/api/v1/platform/devices/{deviceId}/restore` | Admin-only restore from suspended to registered |

Registered device APIs are part of the attendance migration path for native
mobile clients because mobile attendance evidence requires a valid
`registered_device_id`.

## Self-Service Punch Contract

### Current Envelope

Use the current envelope for all new web, kiosk, and online mobile clients:

Online mobile envelope example:

```json
{
  "client_event_id": "00000000-0000-4000-8000-000000000101",
  "captured_at": "2026-08-21T09:00:00.000+05:30",
  "device": {
    "registered_device_id": "registered-device-uuid-for-mobile",
    "device_id": "client-installation-or-browser-handle",
    "platform": "android",
    "app_version": "2026.08.21",
    "os_version": "Android 15"
  },
  "command": {
    "event_type": "check_in",
    "work_mode": "office",
    "source": "mobile",
    "metadata": {
      "client_timezone": "Asia/Kolkata"
    },
    "location": {
      "latitude": 12.971599,
      "longitude": 77.594566,
      "accuracy_meters": 18,
      "captured_at": "2026-08-21T08:59:58.000+05:30",
      "provider": "device",
      "permission_state": "granted"
    }
  }
}
```

Required header:

```text
Idempotency-Key: <same UUID as body client_event_id>
```

For the current envelope, `Idempotency-Key` must be a UUID and must equal
`client_event_id`. The backend derives company, actor, and subject employee from
the authenticated request; clients must not submit those identities.

`captured_at` records when the client captured the action. Ordinary current
self-service punch execution still uses the backend command flow for
authoritative attendance state; clients should not treat `captured_at` as a
permission to backdate ordinary self-service punches.

### Legacy Direct Body

The same endpoint also accepts the legacy direct body:

```json
{
  "event_type": "check_in",
  "work_mode": "office",
  "source": "web",
  "metadata": {
    "client_timezone": "Asia/Kolkata"
  }
}
```

The route still requires `Idempotency-Key` for the legacy body, but the legacy
body has no `client_event_id`, no command envelope, and no durable client-event
identity. It receives platform idempotency protection for the active 24-hour
idempotency window only.

### Punch Fields

`event_type` is required and must be one of:

- `check_in`
- `break_start`
- `break_end`
- `check_out`

`work_mode` defaults to `office` when omitted. Supported values are defined in
the shared attendance schemas.

Public self-service punch `source` values are:

- `web`
- `web_geo`
- `mobile`
- `kiosk`

`mobile_offline` is accepted only by the offline sync event contract, not by the
ordinary `/api/v1/attendance/punches` public body.

`metadata` is optional. For `web_geo`, clients must not submit trusted
geofence/location decision fields in metadata. The backend owns trusted
geofence/location decision data.

### Location Evidence

Coordinate evidence includes:

- `latitude`
- `longitude`
- `accuracy_meters`
- `captured_at`
- optional `age_ms`
- optional `provider`: `browser`, `device`, `network`, or `unknown`
- optional `permission_state`: `granted` or `unknown`
- optional `altitude_meters`
- optional `is_mocked`
- optional `integrity_status`

Failure evidence uses `permission_state` `denied` or `unavailable` and must not
include coordinates. For `source: "web_geo"`, location evidence is required.

## Idempotency And Replay Contract

### Scope

For ordinary self-service punches, the platform idempotency scope is scoped by:

- attendance command kind;
- company;
- authenticated actor user;
- `Idempotency-Key`.

For current envelope requests, durable client-event replay is scoped by:

- company;
- authenticated actor user;
- `client_event_id`.

The current envelope therefore keeps replay protection beyond the 24-hour
platform idempotency-key retention window. The legacy direct body does not have
that durable `client_event_id` protection.

### Request Hashing

The backend hashes a canonical JSON representation of the command. Object keys
are sorted recursively and array order remains significant.

For current envelopes, the hashed request includes the normalized command,
`client_event_id`, `captured_at`, and device envelope.

For legacy direct bodies, the hashed request includes server-derived company,
actor, subject, command kind, event type, work mode, source, sanitized metadata,
and location evidence.

### Replay Behavior

Retry the same logical command with the same `Idempotency-Key`, the same
`client_event_id`, and the same canonical request body.

Replay returns the stored business response semantics and emits:

```text
Idempotency-Replayed: true
```

The replay is semantic business-response replay, not byte-for-byte HTTP replay.
The current request still receives its own transport headers such as
`x-request-id`.

The header is omitted on first execution.

### Conflict Behavior

If the same `client_event_id` is reused with a changed canonical request body,
the backend returns `409 Conflict` with a client-event reuse error.

If the same platform `Idempotency-Key` is reused within the platform idempotency
window with a changed canonical request body, the backend returns
`409 Conflict`.

If the same platform key is observed while the original command is still marked
as processing, the backend returns `409 Conflict`.

Persisted business denials are terminal processed outcomes. They may replay with
`Idempotency-Replayed: true`, but clients must not regenerate identifiers and
loop indefinitely.

## Authentication Compatibility

Protected APIs accept either:

- the session cookie issued by `/api/v1/auth/login`; or
- `Authorization: Bearer <access_token>`.

When both are present, bearer token selection takes precedence over cookie
selection. Native mobile clients should use bearer authentication and should not
depend on browser cookie transport.

Mobile attendance evidence requires registered-device enforcement for personal
mobile source channels. For public APIs this affects:

- `source: "mobile"` on `POST /api/v1/attendance/punches`;
- `source: "mobile_offline"` events submitted to
  `POST /api/v1/attendance/offline-sync`.

When a mobile source requires registration and no `registered_device_id` is
provided, the backend returns a validation error with reason code
`mobile_registered_device_required`. Suspended, revoked, unavailable, unowned, or
cross-company devices are rejected with conflict responses and device-specific
reason codes.

## Device Registration Contract

Register a native installation before sending mobile attendance:

```json
{
  "installation_id_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "platform": "android"
}
```

`installation_id_hash` is a lowercase 64-character SHA-256 hex value.
`platform` must be `ios` or `android`.

Successful registration returns a read model:

```json
{
  "registered_device_id": "registered-device-uuid",
  "platform": "android",
  "status": "registered",
  "status_changed_at": "2026-08-21T09:00:00.000Z",
  "created_at": "2026-08-21T09:00:00.000Z",
  "updated_at": "2026-08-21T09:00:00.000Z"
}
```

Registration is idempotent for the same authenticated owner, active company,
installation hash, and platform. Re-registering a suspended or revoked device,
or registering the same installation for a different owner, is rejected.

Lifecycle request bodies may include:

```json
{
  "reason": "user_requested"
}
```

Supported lifecycle reasons are `lost`, `replaced`, `user_requested`,
`security`, and `administrative`.

## Offline Sync Contract

Endpoint:

```text
POST /api/v1/attendance/offline-sync
```

The offline sync request does not use a top-level `Idempotency-Key`. Replay
identity is per event through `client_event_id`.

Top-level request fields:

- `contract_version`: must be `attendance.offline_sync.v1`
- `batch_id`: UUID transport correlation identifier
- `device`: required mobile device envelope; runtime requires
  `registered_device_id`
- `events`: one to 50 events

Each event requires:

- `client_event_id`
- `sequence`
- `command_kind`: `employee_manual_now`
- `captured_at`
- `source`: `mobile_offline`
- `event_type`: `check_in`, `break_start`, `break_end`, or `check_out`

Optional/default event fields:

- `work_mode`, defaulting to `office`
- `metadata`
- `location`

Offline metadata is strict and may include:

- `app_session_id`
- `app_state`: `foreground`, `background`, `terminated`, or `unknown`
- `capture_method`: `user_action` or `system_retry`
- `client_timezone`
- `network_state`: `offline`, `online`, or `unknown`
- `offline_reason`: `network_unavailable`, `app_backgrounded`,
  `manual_retry`, or `unknown`
- `note`

The submitted batch must not contain duplicate `client_event_id` values or
duplicate `sequence` values.

### Offline Ordering

The backend maintains a per-registered-device sequence cursor.

- `sequence == cursor + 1`: eligible for accepted processing and advances the
  contiguous cursor.
- `sequence > cursor + 1`: deferred for review because of a sequence gap.
- `sequence <= cursor` with a different event: deferred or rejected according to
  duplicate/out-of-order checks.
- existing same sequence with a different event: rejected as a duplicate
  sequence conflict.

Results are returned in the same order as the submitted request events.

### Offline Result Values

Per-event `sync_status` values include:

- `accepted`
- `replayed`
- `conflict`
- `deferred`
- `rejected`

Verification values include:

- `unverified`
- `review_required`
- `rejected`

Accepted offline events are provisional and `payroll_eligible` is `false`.
Accepted/deferred events are persisted through the offline inbox/evidence
workflow. Accepted events emit `attendance.provisional.recorded`. They do not
immediately create authoritative punches, sessions, daily records, or payroll
state.

## Recommended Client Workflows

### Web

1. Authenticate through `/api/v1/auth/login`.
2. Use cookie transport for browser UI or bearer transport for API clients.
3. For each logical punch, generate one UUID.
4. Send `POST /api/v1/attendance/punches` with the current envelope.
5. Set `Idempotency-Key` to the same UUID as `client_event_id`.
6. Use `source: "web"` or `source: "web_geo"`.
7. For `web_geo`, include browser location evidence or permission failure
   evidence.
8. Treat `Idempotency-Replayed: true` as a terminal replayed result.

### Online Mobile

1. Authenticate with bearer token transport.
2. Register the installation with `POST /api/v1/platform/devices`.
3. Store the returned `registered_device_id` in secure local storage.
4. For each logical punch, generate one UUID.
5. Send `POST /api/v1/attendance/punches` with the current envelope.
6. Set `Idempotency-Key` to the same UUID as `client_event_id`.
7. Use `source: "mobile"` and include `device.registered_device_id`.
8. If the device is suspended or revoked, stop submitting mobile attendance and
   send the user through the product's re-registration/support flow.

### Offline Mobile

1. Authenticate while online and register the installation.
2. Persist offline events locally with stable `client_event_id` and monotonic
   per-device `sequence`.
3. When connectivity returns, submit `POST /api/v1/attendance/offline-sync`.
4. Do not send a top-level `Idempotency-Key`.
5. Include `contract_version`, `batch_id`, `device.registered_device_id`, and
   one to 50 events.
6. Preserve event order and sequence values across retries.
7. Handle `accepted`, `replayed`, `conflict`, `deferred`, and `rejected`
   per-event results independently.
8. Do not assume accepted offline events immediately mutate authoritative
   attendance sessions or payroll state.

## Curl Examples

Set common variables:

```bash
BASE_URL="http://localhost:3101"
ACCESS_TOKEN="<access_token>"
IDEMPOTENCY_KEY="00000000-0000-4000-8000-000000000101"
REGISTERED_DEVICE_ID="<registered_device_id>"
```

Current web punch:

```bash
curl -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "content-type: application/json" \
  -d '{
    "client_event_id": "00000000-0000-4000-8000-000000000101",
    "captured_at": "2026-08-21T09:00:00.000+05:30",
    "device": {
      "device_id": "web-browser-session",
      "platform": "web",
      "app_version": "2026.08.21",
      "os_version": "Windows 11"
    },
    "command": {
      "event_type": "check_in",
      "work_mode": "office",
      "source": "web",
      "metadata": {
        "client_timezone": "Asia/Kolkata"
      }
    }
  }'
```

Current `web_geo` punch:

```bash
curl -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: 00000000-0000-4000-8000-000000000102" \
  -H "content-type: application/json" \
  -d '{
    "client_event_id": "00000000-0000-4000-8000-000000000102",
    "captured_at": "2026-08-21T09:00:00.000+05:30",
    "device": {
      "device_id": "web-browser-session",
      "platform": "web",
      "app_version": "2026.08.21",
      "os_version": "Windows 11"
    },
    "command": {
      "event_type": "check_in",
      "work_mode": "office",
      "source": "web_geo",
      "location": {
        "latitude": 12.971599,
        "longitude": 77.594566,
        "accuracy_meters": 18,
        "captured_at": "2026-08-21T08:59:58.000+05:30",
        "provider": "browser",
        "permission_state": "granted"
      }
    }
  }'
```

Legacy direct punch body:

```bash
curl -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: legacy-key-0001" \
  -H "content-type: application/json" \
  -d '{
    "event_type": "check_in",
    "work_mode": "office",
    "source": "web",
    "metadata": {
      "client_timezone": "Asia/Kolkata"
    }
  }'
```

Register a mobile device:

```bash
curl -sS -X POST "$BASE_URL/api/v1/platform/devices" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "installation_id_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "platform": "android"
  }'
```

Online mobile punch:

```bash
curl -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: 00000000-0000-4000-8000-000000000103" \
  -H "content-type: application/json" \
  -d '{
    "client_event_id": "00000000-0000-4000-8000-000000000103",
    "captured_at": "2026-08-21T09:00:00.000+05:30",
    "device": {
      "registered_device_id": "'"$REGISTERED_DEVICE_ID"'",
      "device_id": "mobile-installation-handle",
      "platform": "android",
      "app_version": "2026.08.21",
      "os_version": "Android 15"
    },
    "command": {
      "event_type": "check_in",
      "work_mode": "office",
      "source": "mobile",
      "metadata": {
        "client_timezone": "Asia/Kolkata"
      }
    }
  }'
```

Offline sync batch:

```bash
curl -sS -X POST "$BASE_URL/api/v1/attendance/offline-sync" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "contract_version": "attendance.offline_sync.v1",
    "batch_id": "00000000-0000-4000-8000-000000000200",
    "device": {
      "registered_device_id": "'"$REGISTERED_DEVICE_ID"'",
      "device_id": "mobile-installation-handle",
      "platform": "android",
      "app_version": "2026.08.21",
      "os_version": "Android 15"
    },
    "events": [
      {
        "client_event_id": "00000000-0000-4000-8000-000000000201",
        "sequence": 1,
        "command_kind": "employee_manual_now",
        "captured_at": "2026-08-21T09:00:00.000+05:30",
        "source": "mobile_offline",
        "event_type": "check_in",
        "work_mode": "office",
        "metadata": {
          "network_state": "offline",
          "capture_method": "user_action",
          "client_timezone": "Asia/Kolkata"
        }
      }
    ]
  }'
```

Replay check with the exact same envelope:

```bash
REPLAY_KEY="00000000-0000-4000-8000-000000000301"
REPLAY_BODY='{
  "client_event_id": "00000000-0000-4000-8000-000000000301",
  "captured_at": "2026-08-21T09:00:00.000+05:30",
  "device": {
    "device_id": "web-browser-session",
    "platform": "web",
    "app_version": "2026.08.21",
    "os_version": "Windows 11"
  },
  "command": {
    "event_type": "check_in",
    "work_mode": "office",
    "source": "web",
    "metadata": {
      "client_timezone": "Asia/Kolkata"
    }
  }
}'

curl -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $REPLAY_KEY" \
  -H "content-type: application/json" \
  -d "$REPLAY_BODY"

curl -i -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $REPLAY_KEY" \
  -H "content-type: application/json" \
  -d "$REPLAY_BODY"
```

The second request is the replay check. Expect the response headers to include
`Idempotency-Replayed: true`.

Changed-body conflict check:

```bash
CONFLICT_KEY="00000000-0000-4000-8000-000000000302"
CONFLICT_ORIGINAL='{
  "client_event_id": "00000000-0000-4000-8000-000000000302",
  "captured_at": "2026-08-21T09:00:00.000+05:30",
  "device": {
    "device_id": "web-browser-session",
    "platform": "web",
    "app_version": "2026.08.21",
    "os_version": "Windows 11"
  },
  "command": {
    "event_type": "check_in",
    "work_mode": "office",
    "source": "web"
  }
}'
CONFLICT_CHANGED='{
  "client_event_id": "00000000-0000-4000-8000-000000000302",
  "captured_at": "2026-08-21T09:00:00.000+05:30",
  "device": {
    "device_id": "web-browser-session",
    "platform": "web",
    "app_version": "2026.08.21",
    "os_version": "Windows 11"
  },
  "command": {
    "event_type": "check_out",
    "work_mode": "office",
    "source": "web"
  }
}'

curl -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $CONFLICT_KEY" \
  -H "content-type: application/json" \
  -d "$CONFLICT_ORIGINAL"

curl -i -sS -X POST "$BASE_URL/api/v1/attendance/punches" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $CONFLICT_KEY" \
  -H "content-type: application/json" \
  -d "$CONFLICT_CHANGED"
```

The second request reuses the same `Idempotency-Key` and `client_event_id` with
a changed command. Expect `409 Conflict`.

## Postman Examples

Recommended collection variables:

| Variable | Example |
|---|---|
| `base_url` | `http://localhost:3101` |
| `access_token` | Login response `access_token` |
| `idempotency_key` | `00000000-0000-4000-8000-000000000101` |
| `client_event_id` | Same value as `idempotency_key` for current punch envelope |
| `registered_device_id` | Response value from `POST /api/v1/platform/devices` |
| `batch_id` | Offline sync UUID |

### Current Web Punch

Prerequisite: authenticate first and set `access_token`. Use a fresh UUID for
each logical punch and set `client_event_id` to the same value as
`idempotency_key`.

Headers:

```text
Authorization: Bearer {{access_token}}
Idempotency-Key: {{idempotency_key}}
content-type: application/json
```

Body:

```json
{
  "client_event_id": "{{client_event_id}}",
  "captured_at": "2026-08-21T09:00:00.000+05:30",
  "device": {
    "device_id": "web-browser-session",
    "platform": "web",
    "app_version": "2026.08.21",
    "os_version": "Windows 11"
  },
  "command": {
    "event_type": "check_in",
    "work_mode": "office",
    "source": "web",
    "metadata": {
      "client_timezone": "Asia/Kolkata"
    }
  }
}
```

### Online Mobile Punch

Prerequisite: authenticate with bearer auth, register the installation with
`POST /api/v1/platform/devices`, and set `registered_device_id` from the
registration response. `source: "mobile"` requires the registered device.

Headers:

```text
Authorization: Bearer {{access_token}}
Idempotency-Key: {{idempotency_key}}
content-type: application/json
```

Body:

```json
{
  "client_event_id": "{{client_event_id}}",
  "captured_at": "2026-08-21T09:00:00.000+05:30",
  "device": {
    "registered_device_id": "{{registered_device_id}}",
    "device_id": "mobile-installation-handle",
    "platform": "android",
    "app_version": "2026.08.21",
    "os_version": "Android 15"
  },
  "command": {
    "event_type": "check_in",
    "work_mode": "office",
    "source": "mobile",
    "metadata": {
      "client_timezone": "Asia/Kolkata"
    }
  }
}
```

### Offline Sync

Prerequisite: authenticate with bearer auth and register the mobile installation.
Offline sync does not use a top-level `Idempotency-Key`. The request must include
`device.registered_device_id`, and each event must carry its own
`client_event_id`. Handle per-event `sync_status` and `verification_status`
independently.

Headers:

```text
Authorization: Bearer {{access_token}}
content-type: application/json
```

Body:

```json
{
  "contract_version": "attendance.offline_sync.v1",
  "batch_id": "{{batch_id}}",
  "device": {
    "registered_device_id": "{{registered_device_id}}",
    "device_id": "mobile-installation-handle",
    "platform": "android",
    "app_version": "2026.08.21",
    "os_version": "Android 15"
  },
  "events": [
    {
      "client_event_id": "00000000-0000-4000-8000-000000000401",
      "sequence": 1,
      "command_kind": "employee_manual_now",
      "captured_at": "2026-08-21T09:00:00.000+05:30",
      "source": "mobile_offline",
      "event_type": "check_in",
      "work_mode": "office",
      "metadata": {
        "network_state": "offline",
        "capture_method": "user_action",
        "client_timezone": "Asia/Kolkata"
      }
    }
  ]
}
```

Postman test for replay:

```javascript
pm.test("replay header is present on repeated request", function () {
  pm.expect(pm.response.headers.get("Idempotency-Replayed")).to.eql("true");
});
```

Run that test only on the second submission of the same request.

## Regularization Migration Note

`POST /api/v1/attendance/regularizations` still accepts the deprecated
compatibility field `requested_punches`. Each compatibility entry is normalized
to an `items` entry with operation `add`.

New clients should send `items` directly. Responses may still include derived
`requested_punches` for compatibility, but that derived representation cannot
fully represent all `items` operations such as void operations.

## Deprecation Plan

Already implemented:

- no attendance punch endpoint is formally deprecated;
- no attendance punch endpoint has a `Deprecation` header;
- no attendance punch endpoint has a `Sunset` header;
- no attendance punch endpoint has an implemented removal date;
- regularization create field `requested_punches` is formally deprecated in the
  OpenAPI schema.

Documented-only recommendation for future work:

1. Announce that new clients must use the current punch envelope.
2. Add observability for legacy direct-body usage by client/application.
3. Migrate web, kiosk, and mobile clients to the envelope.
4. Confirm no unsupported clients rely on legacy direct-body submission.
5. In a separately approved backend change, add deprecation response headers or
   OpenAPI deprecation flags if product policy chooses to deprecate the legacy
   direct body.
6. Publish a removal window only after the deprecation mechanism and date are
   approved.

Until those steps are implemented, do not describe the legacy direct body as
removed, sunset, or formally deprecated.

## QA Checklist

- Confirm `POST /api/v1/attendance/punches` current envelope succeeds with
  matching UUID `Idempotency-Key` and `client_event_id`.
- Repeat the same current-envelope request and confirm
  `Idempotency-Replayed: true`.
- Reuse the same `client_event_id` with a changed body and confirm
  `409 Conflict`.
- Confirm the legacy direct body still succeeds with an `Idempotency-Key`.
- Reuse the same platform `Idempotency-Key` with a changed legacy direct punch
  body and confirm `409 Conflict`.
- Confirm a valid `source: "web_geo"` punch with granted coordinate evidence
  succeeds.
- Confirm `source: "web_geo"` without location evidence is rejected.
- Confirm `source: "mobile"` without `device.registered_device_id` is rejected.
- Register a mobile device and confirm online mobile punch succeeds with
  `source: "mobile"`.
- Suspend a registered device and confirm mobile attendance using that
  `registered_device_id` is rejected.
- Revoke a registered device and confirm mobile attendance using that
  `registered_device_id` is rejected.
- Submit offline sync with one to 50 events and no top-level `Idempotency-Key`.
- Repeat an offline event with the same `client_event_id` and unchanged event
  body and confirm per-event `sync_status: "replayed"`.
- Repeat an offline event with the same `client_event_id` and a changed event
  body and confirm per-event conflict behavior.
- Submit an offline event with a sequence gap and confirm per-event deferred or
  review behavior.
- Confirm accepted offline events are provisional and not immediately reflected
  as authoritative sessions, daily records, or payroll state.
- Confirm regularization clients use `items` instead of deprecated
  `requested_punches`.

## Known Documentation Gaps

Some older backend docs were written before device registration and offline sync
were implemented. When this guide conflicts with older proposed-contract text,
use the current OpenAPI artifact, route implementations, shared schemas, command
service, offline sync service, platform device service, and contract tests as
the source of truth.
