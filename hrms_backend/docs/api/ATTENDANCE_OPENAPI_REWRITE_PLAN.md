# Attendance OpenAPI-First Contract Rewrite Plan

Task: `GEO-S10-011`
Status: Proposed contract plan; no v2 routes are published by this artifact
Owners: Pratik (API/frontend contract), Debasish (backend architecture review)
Last updated: 2026-07-20

## 1. Objective

Define the stable HTTP contract for tenant-safe, DB-first manual and location-aware attendance before implementation begins. The contract must support the current web client, a future mobile client, deterministic retry behavior, server-driven policy decisions, and object-level authorization without exposing exact location evidence through general attendance responses.

This document is normative for attendance API implementation planning. It does not make planned APIs available. A route may enter generated OpenAPI only after its Zod schema, service behavior, persistence transaction, authorization, integration tests, and contract tests are implemented.

## 2. Current-State Audit

The current API exposes 12 attendance operations under `/api/v1/attendance`:

| Current operation | Current purpose | Contract issue | Planned disposition |
| --- | --- | --- | --- |
| `POST /punches` | Check in, break, resume, check out | One generic body and an untyped success object; no request idempotency header | Keep as a v1 compatibility adapter; replace with typed v2 commands |
| `GET /punches/my` | Employee punch history | Punches mix command, evidence, and projection concerns | Map to typed employee event history |
| `GET /summary/my` | Employee context and summaries | Also mutates expired sessions; response contains open-ended objects | Split current action context from historical summaries |
| `GET /summary/team` | Team totals and exceptions | Open-ended totals and exception objects | Replace with typed team summary/read models |
| `GET /calendar/monthly` | Monthly employee calendar | Day status mixes presence, punctuality, leave, and finalization | Return separated day classification fields |
| `GET /calendar/daily` | Daily scoped calendar | Several open-ended nested response objects | Return a typed paginated day projection |
| `POST /regularizations` | Employee correction request | No idempotency header or immutable correction contract | Replace with typed v2 regularization creation |
| `GET /regularizations/my` | Employee correction history | Broad status string and open requested-punch objects | Return typed request and action history |
| `GET /regularizations/queue/manager` | Manager/HR review queue | Queue counts and scope are not fully typed | Replace with typed review queue and capabilities |
| `POST /regularizations/{id}/decision` | Manager decision | Generic success response | Replace with a typed immutable decision result |
| `GET /exceptions` | Manager/HR exceptions | Generic item and totals schemas | Replace with reason-coded exception projections |
| `POST /exports` | Attendance export | Broad filter object | Keep asynchronous export behavior with typed filters |

Additional findings:

- Generated OpenAPI currently uses version `3.0.3` and many attendance schemas permit `additionalProperties`.
- The frontend attendance client relies heavily on `ApiRecord`, so schema drift is detected at runtime instead of compile time.
- The current error envelope is `{ code, message, details, request_id }`, not RFC 9457 problem details.
- `platform.idempotency_keys` exists, but attendance mutations do not currently consume an `Idempotency-Key` request header.
- API URL versioning is already established through `/api/v1`; a breaking attendance rewrite must not silently change v1 response meaning.

## 3. Versioning Decision

### 3.1 API version

Breaking attendance contracts will use `/api/v2/attendance`. Existing `/api/v1/attendance` routes remain available during a measured compatibility window.

Rules:

1. New v2 implementation writes only through the DB-first attendance transaction service.
2. V1 mutation routes become compatibility adapters to that same service before v2 is declared stable.
3. V1 and v2 must not maintain independent attendance state machines.
4. V1 responses remain shape-compatible until frontend migration is complete.
5. Deprecation headers are added only after the v2 web client is deployed:
   - `Deprecation: true`
   - `Sunset: <HTTP-date>` after a release-approved date exists
   - `Link: </api/v2/openapi.json>; rel="successor-version"`
6. V1 removal requires production usage evidence, a published migration guide, and release approval.

### 3.2 OpenAPI document version

The HTTP API version and OpenAPI Specification version are independent. The repository may continue generating OpenAPI 3.0.3 while v2 routes are implemented. Upgrading the generator to OpenAPI 3.2.0 is a separate platform change and requires Swagger UI, generator, contract test, and frontend tooling compatibility checks.

## 4. Target Route Inventory

Paths below are planned and must stay out of generated OpenAPI until implemented.

### 4.1 Employee context and commands

| Method and path | Operation ID | Success | Purpose |
| --- | --- | --- | --- |
| `GET /api/v2/attendance/me/context` | `getMyAttendanceContext` | `200 AttendanceContext` | Current session, policy mode, allowed actions, policy hints, and location requirement |
| `POST /api/v2/attendance/me/check-ins` | `createMyAttendanceCheckIn` | `201 AttendanceCommandResult` | Manual or geo-assisted check-in |
| `POST /api/v2/attendance/me/check-outs` | `createMyAttendanceCheckOut` | `201 AttendanceCommandResult` | Manual or geo-assisted check-out |
| `POST /api/v2/attendance/me/breaks/start` | `startMyAttendanceBreak` | `201 AttendanceCommandResult` | Start break for an open session |
| `POST /api/v2/attendance/me/breaks/end` | `endMyAttendanceBreak` | `201 AttendanceCommandResult` | End the active break |
| `GET /api/v2/attendance/me/events` | `listMyAttendanceEvents` | `200 AttendanceEventPage` | Immutable, privacy-filtered event history |
| `GET /api/v2/attendance/me/days` | `listMyAttendanceDays` | `200 AttendanceDayPage` | Daily attendance projections |
| `POST /api/v2/attendance/me/regularizations` | `createMyAttendanceRegularization` | `201 RegularizationResult` | Historical correction request |
| `GET /api/v2/attendance/me/regularizations` | `listMyAttendanceRegularizations` | `200 RegularizationPage` | Employee request/action history |

### 4.2 Manager and HR review

| Method and path | Operation ID | Success | Purpose |
| --- | --- | --- | --- |
| `GET /api/v2/attendance/team/review-queue` | `listAttendanceReviewQueue` | `200 AttendanceReviewPage` | Policy, evidence, exception, and regularization review queue |
| `POST /api/v2/attendance/regularizations/{id}/decisions` | `createAttendanceRegularizationDecision` | `201 RegularizationDecisionResult` | Immutable approve, return, or reject action |
| `GET /api/v2/attendance/team/days` | `listTeamAttendanceDays` | `200 AttendanceDayPage` | Object-authorized team day projections |
| `GET /api/v2/attendance/team/summary` | `getTeamAttendanceSummary` | `200 TeamAttendanceSummary` | Typed aggregate counts without exact coordinates |

### 4.3 Admin policy and site contracts

These routes are specified in later tasks and sprints, but their naming is reserved now to prevent drift:

- `/api/v2/attendance/admin/policies`
- `/api/v2/attendance/admin/policy-versions/{id}/publish`
- `/api/v2/attendance/admin/policy-versions/{id}/simulate`
- `/api/v2/attendance/admin/work-sites`
- `/api/v2/attendance/admin/geofences/{id}/versions`
- `/api/v2/attendance/admin/geofence-versions/{id}/publish`

Exact location evidence requires a separate restricted endpoint and explicit permission. It must not be embedded in employee lists, team summaries, exports, notifications, or outbox events.

## 5. Core Schemas

All concrete v2 schemas default to `additionalProperties: false`. Reusable schemas live in OpenAPI components and are referenced by operation schemas. Timestamps are RFC 3339 UTC values; attendance dates are ISO dates resolved using the effective company/shift timezone.

### 5.1 AttendanceContext

```json
{
  "generated_at": "2026-07-20T09:00:00.000Z",
  "company_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001",
  "attendance_date": "2026-07-20",
  "timezone": "Asia/Kolkata",
  "policy": {
    "version_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f010",
    "mode": "manual_geo_optional",
    "manual_fallback": "allowed",
    "location_retention_notice": "Location is requested only for this attendance action."
  },
  "session": null,
  "allowed_actions": [
    {
      "action": "check_in",
      "channels": ["manual", "browser_geo"],
      "location_requirement": "optional",
      "enabled": true,
      "reason_code": null
    }
  ],
  "capabilities": {
    "can_regularize": true,
    "can_view_history": true
  }
}
```

Policy mode enum:

- `manual_only`
- `manual_geo_optional`
- `geo_preferred`
- `geo_required`
- `geo_required_with_fallback`

Location requirement enum:

- `not_requested`
- `optional`
- `required`
- `required_or_fallback`

The client renders only actions returned by this endpoint. It must not reproduce shift, policy, geofence, or state-machine rules.

### 5.2 Attendance command request

Every attendance command requires:

- `Idempotency-Key` header: 16 to 128 visible ASCII characters, generated once per user action and reused only for retries of the same canonical request.
- Authenticated actor and active company context.
- `captured_at`: client observation timestamp.
- `source_channel`: initially `web`; later `mobile`, `kiosk`, or `admin` where policy permits.
- `client_event_id`: UUID generated by the client. Required for mobile/offline channels and accepted from web clients from day one.
- Optional `location` only when the context permits or requires browser geo.

```json
{
  "client_event_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f020",
  "captured_at": "2026-07-20T08:59:58.000Z",
  "source_channel": "web",
  "work_mode": "office",
  "policy_version_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f010",
  "location": {
    "latitude": 19.076,
    "longitude": 72.8777,
    "accuracy_m": 24.5,
    "captured_at": "2026-07-20T08:59:57.000Z",
    "permission_state": "granted",
    "cached": false
  },
  "fallback_reason": null
}
```

Coordinates are constrained to valid WGS84 ranges. Accuracy and location age limits are policy inputs evaluated by the backend. Free-form metadata is not accepted on public command bodies.

### 5.3 AttendanceCommandResult

```json
{
  "event": {
    "id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f030",
    "event_type": "check_in",
    "channel": "browser_geo",
    "effective_at": "2026-07-20T09:00:00.000Z",
    "attendance_date": "2026-07-20"
  },
  "decision": {
    "verdict": "accepted",
    "reason_codes": ["inside_geofence"],
    "evidence_state": "verified",
    "review_required": false
  },
  "session": {
    "id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f040",
    "state": "working",
    "opened_at": "2026-07-20T09:00:00.000Z",
    "version": 1
  },
  "day": {
    "attendance_date": "2026-07-20",
    "day_classification": "working_day",
    "presence_status": "present",
    "punctuality_status": "on_time",
    "evidence_state": "verified",
    "approval_state": "not_required",
    "finalization_state": "open"
  },
  "allowed_actions": ["break_start", "check_out"],
  "idempotency": {
    "key": "att-01J2K4J0PKS3GX0E0Q4Q7P1A0B",
    "replayed": false
  }
}
```

Verdict enum:

- `accepted`
- `accepted_with_warning`
- `provisional`
- `review_required`
- `rejected`

A valid command that produces a policy verdict, including `rejected`, is a successful domain evaluation and returns the persisted decision result. Malformed requests, missing required evidence, authorization failures, idempotency conflicts, and invalid state transitions use problem responses.

### 5.4 Pagination

V2 list responses retain the repository's compact page contract during web migration:

```json
{
  "items": [],
  "page": 1,
  "page_size": 25,
  "total": 0
}
```

`page_size` is bounded to 100. Stable sort order and tie-breaker are documented per operation. Cursor pagination may be added for mobile event history only as an additive field after consumer verification.

## 6. Idempotency Contract

The `Idempotency-Key` behavior is an application contract. The IETF Idempotency-Key document is an expired Internet-Draft, so it is guidance rather than a published Internet Standard.

Server rules:

1. Scope uniqueness by company, actor, operation, and idempotency key.
2. Hash the canonical validated body, relevant path parameters, and effective company. Do not hash authorization headers or transport-only headers.
3. First request reserves the key and executes the command in the same database transaction as event, decision, session, projection, audit, and outbox writes.
4. Same key plus same request hash returns the original status and response with `Idempotent-Replayed: true`.
5. Same key plus different request hash returns `409 idempotency-key-reused`.
6. An in-flight key returns `409 idempotency-request-in-progress` with `Retry-After` when safe.
7. Missing key on a required mutation returns `400 idempotency-key-required`.
8. Keys are retained for at least 24 hours; the exact duration is configuration and must exceed all supported offline retry windows before mobile rollout.
9. Raw keys and request bodies must not be written to logs.

## 7. Error Model

V2 errors use `application/problem+json` and the RFC 9457 members `type`, `title`, `status`, `detail`, and `instance`. Stable machine-readable extensions are allowed.

During frontend migration, include compatibility extensions:

```json
{
  "type": "https://{controlled-docs-host}/problems/attendance/invalid-transition",
  "title": "Attendance action is not allowed",
  "status": 409,
  "detail": "Check out is not allowed because no attendance session is open.",
  "instance": "/api/v2/attendance/me/check-outs",
  "code": "ATTENDANCE_INVALID_TRANSITION",
  "request_id": "601fe7b7-6361-463e-ae66-5d972673dd27",
  "reason_code": "no_open_session",
  "allowed_actions": ["check_in"]
}
```

`type` must use a stable absolute URI on a controlled documentation host before implementation. Clients branch on `type` or `code`, never on `detail`.

| Status | Problem type suffix | Usage |
| --- | --- | --- |
| `400` | `validation-failed` | Invalid syntax, shape, ranges, or required idempotency header |
| `401` | `authentication-required` | Missing or invalid session |
| `403` | `attendance-action-forbidden` | Role, company, employee, site, or evidence object not authorized |
| `404` | `attendance-resource-not-found` | Authorized lookup cannot find the resource |
| `409` | `invalid-transition` | Command conflicts with current attendance session state |
| `409` | `idempotency-key-reused` | Same key used with a different canonical request |
| `409` | `idempotency-request-in-progress` | Matching command is still executing |
| `409` | `version-conflict` | Optimistic concurrency mismatch |
| `422` | `location-evidence-required` | Policy requires location and no approved fallback was supplied |
| `422` | `attendance-policy-unresolvable` | No unique effective policy/shift/site assignment can be resolved |
| `423` | `attendance-period-locked` | Payroll/attendance period is finalized |
| `429` | `rate-limit-exceeded` | Client command rate exceeded; include `Retry-After` |
| `500` | `internal-error` | Safe generic error without internals, coordinates, or policy secrets |

Validation extensions use an `errors` array with JSON Pointer locations. Problem payloads must never include exact coordinates, geofence geometry, raw request bodies, stack traces, SQL details, secrets, or existence information for unauthorized objects.

## 8. OpenAPI Authoring Rules

Each implemented v2 operation must include:

- Stable `operationId`, attendance tag, summary, and behavior description.
- Cookie and bearer security alternatives matching the existing API.
- Explicit path, query, header, and request body schemas.
- Typed success schema and all applicable problem responses.
- `Idempotency-Key` request header on every mutation.
- `Idempotent-Replayed` response header on replayable mutations.
- `Retry-After` on rate-limit and in-progress responses where applicable.
- Sanitized examples with synthetic IDs and coordinates.
- No `additionalProperties: true` for concrete domain objects.
- Explicit enum values and nullable fields.
- `readOnly` identifiers/timestamps and `writeOnly` sensitive inputs where tooling supports them.
- Contract tests that compare generated operations and validate representative responses.

The generated OpenAPI document remains the source of truth. Handwritten examples in this plan do not replace generated schemas.

## 9. Frontend Migration Contract

The web client migration must:

1. Replace attendance `ApiRecord` responses with generated or manually maintained explicit TypeScript types that mirror OpenAPI.
2. Extend the shared error parser to read RFC 9457 `detail` while retaining v1 `message` compatibility.
3. Add a reusable attendance mutation helper that owns one idempotency key per user action and preserves it across network retries.
4. Render actions only from `AttendanceContext.allowed_actions`.
5. Request browser geolocation only after the context declares it optional or required and the user initiates an attendance action.
6. Never make a client-side geofence result authoritative.
7. Invalidate context, employee day, and event queries after a successful command or replay.
8. Show reason-code-based copy for provisional, review-required, fallback, and rejection states.

## 10. Delivery Sequence

1. Approve dependencies from `GEO-S10-001` through `GEO-S10-010`, especially company context, DB-first transaction, idempotency, and one-open-session decisions.
2. Add shared v2 Zod schemas and TypeScript domain types without registering routes.
3. Implement `GET /me/context` over tenant-safe policy/session reads and add contract tests.
4. Implement one DB-first check-in transaction with idempotency and typed problem responses.
5. Add check-out and break transitions through the same command service.
6. Bridge v1 `POST /punches` to the command service.
7. Implement typed event/day reads and regularization workflows.
8. Migrate the web attendance client and collect v1/v2 parity evidence.
9. Publish deprecation headers and migration documentation.
10. Remove v1 only after usage, UAT, and release gates pass.

## 11. Acceptance Criteria

- Every current attendance operation has an explicit keep, replace, or bridge decision.
- Planned routes, operation IDs, success statuses, request headers, and response components are named.
- Context supports manual-only, optional-geo, preferred-geo, required-geo, and approved-fallback modes.
- Mutation idempotency defines reservation, replay, mismatch, in-progress, retention, and logging behavior.
- Errors follow RFC 9457 conventions while providing a controlled migration path for current clients.
- Exact location evidence is excluded from general responses, exports, notifications, logs, and outbox contracts.
- API versioning prevents silent breaking changes to `/api/v1`.
- The plan identifies implementation dependencies and test gates.
- Generated OpenAPI is unchanged until real v2 behavior exists.

## 12. References

- [OpenAPI Specification 3.2.0](https://spec.openapis.org/oas/v3.2.0.html)
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [IETF Idempotency-Key HTTP Header Internet-Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (expired draft; guidance only)
- `HRMS_Location_Attendance_Technical_Requirements.docx`
- `HRMS_Location_Attendance_Feature_Requirements.docx`
- `HRMS_Attendance_DB_Architecture_Upgrade_Plan.docx`

