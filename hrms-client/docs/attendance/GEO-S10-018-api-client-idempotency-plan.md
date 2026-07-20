# API Client Idempotency Support Plan

Task: `GEO-S10-018`
Status: Implementation-ready plan; depends on versioned API support
Owner: Pratik
Last updated: 2026-07-20

## Objective

Provide one reusable web-client mechanism that generates an idempotency identity once per user action, reuses it only for equivalent retries, survives uncertain browser request outcomes, and never stores sensitive attendance payloads.

This is an application-level contract coordinated with `GEO-S10-011`. The `Idempotency-Key` Internet-Draft is useful design guidance but is not a published Internet Standard.

## Current-State Audit

- `apiRequest` supports caller-provided headers but has no typed idempotency option.
- Attendance punch, regularization, decision, and export mutations do not send an idempotency header.
- TanStack Query mutations have no shared identity or uncertain-outcome recovery policy.
- Browser retries after a timeout can create a second attendance event because the client cannot identify the original command.
- Backend outbox event idempotency exists, but it prevents duplicate downstream events rather than duplicate incoming commands.
- `platform.idempotency_keys` exists in the backend schema, but attendance routes do not currently consume the request header.

## Scope

Initial consumers:

- Attendance punch in/out, break start/end, and manual action commands.
- Attendance regularization create and decision commands.
- Attendance exports and policy publish commands where the API marks the header required.

The primitive is reusable by other domains, but this task must not retrofit unrelated mutations before their API contracts define replay semantics.

## Public Client API

Extend the shared request options without requiring callers to construct headers:

```ts
interface ApiRequestOptions {
  // Existing options omitted.
  idempotencyKey?: string;
}
```

`apiRequest` validates and writes `Idempotency-Key`. It must reject attempts to provide both `idempotencyKey` and a conflicting raw header.

Add a higher-level action API:

```ts
type MutationIdentity = Readonly<{
  actionId: string;
  idempotencyKey: string;
  clientEventId: string;
  operation: string;
  requestFingerprint: string;
  createdAt: string;
  expiresAt: string;
}>;

type BeginMutationInput = {
  operation: string;
  companyId: string;
  userId: string;
  activeRoleId: string;
  canonicalRequest: unknown;
};

interface IdempotentMutationStore {
  begin(input: BeginMutationInput): Promise<MutationIdentity>;
  getForRetry(actionId: string, canonicalRequest: unknown): Promise<MutationIdentity>;
  markUncertain(actionId: string): void;
  complete(actionId: string): void;
  abandon(actionId: string): void;
  clearSessionScope(): void;
}
```

`actionId` is a local handle for UI state. `idempotencyKey` is sent in the header. `clientEventId` is included only when the versioned command schema requires it. All values use `crypto.randomUUID()`; no timestamp, email, employee ID, company ID, action type, or coordinates are encoded in them.

## Storage Model

Use an in-memory map backed by `sessionStorage` for unresolved actions. Do not use `localStorage`, cookies, URL parameters, React Query persisted cache, or analytics storage.

Persist only:

```ts
type StoredMutationIdentity = {
  actionId: string;
  idempotencyKey: string;
  clientEventId: string;
  operation: string;
  requestFingerprint: string;
  sessionScopeHash: string;
  state: "prepared" | "in_flight" | "uncertain";
  createdAt: string;
  expiresAt: string;
};
```

Never persist the request body, reason text, coordinates, evidence, access token, person name, user ID, company ID, role ID, response body, or error detail.

`sessionScopeHash` is a one-way digest of the authenticated company, user, and active-role identifiers used only to prevent cross-session reuse. It is not sent to the server. Records expire after the server-advertised idempotency retention period, capped at 24 hours in the client. Terminal success and deterministic business failure remove the record immediately.

## Canonical Request Fingerprint

The retry guard computes a SHA-256 digest over:

```text
API version + HTTP method + normalized path + canonical query + canonical JSON body
```

Canonicalization must:

- Recursively sort object keys.
- Preserve array order.
- Normalize absent optional fields according to the command schema.
- Preserve exact string and numeric values; never round coordinates before hashing.
- Reject `FormData`, streams, functions, `undefined` array members, non-finite numbers, and cyclic values unless an operation supplies a dedicated fingerprint adapter.
- Use UTF-8 bytes and Web Crypto `subtle.digest`.

The fingerprint is a client-side misuse guard. The backend independently binds each key to its own canonical request hash.

## Mutation Lifecycle

```text
user gesture
  -> validate current server context and form
  -> canonicalize final request
  -> begin identity (prepared)
  -> persist identity before fetch
  -> send request (in_flight)
  -> classify outcome
       success/replayed success -> complete and remove
       deterministic 4xx        -> complete and remove
       timeout/network/5xx       -> mark uncertain and retain
       abort before send         -> abandon and remove
       unknown abort timing      -> mark uncertain and retain
```

The UI action owns the identity, not a component render or a single fetch call. Rerenders, query invalidation, and button double-click prevention do not create a new key for the same action.

## Retry Rules

Reuse the existing identity only when all are true:

- The prior outcome is uncertain or the server explicitly requests a retry.
- Operation, session scope, and request fingerprint are unchanged.
- The identity has not expired.
- The user selected retry for the same pending action, or an explicit bounded automatic retry policy allows it.

Create a new identity when the user edits any command field, starts a new action after a deterministic response, changes company or active role, or abandons the prior action.

Never silently replay an uncertain attendance mutation on page load. Restore an "Outcome not confirmed" state, fetch current attendance context/history using the client event ID if supported, and offer `Check status` or `Retry same action`.

## Response Semantics

The versioned API should return:

- `201` or `200` for first completion.
- The same success status and semantically equivalent body for a completed replay.
- `Idempotency-Replayed: true` as an optional diagnostic response header exposed by CORS.
- `409 idempotency-key-reused` when the key is bound to a different request.
- `409 idempotency-in-progress` plus bounded `Retry-After` while the original command is executing.
- `400 idempotency-key-required` or `400 idempotency-key-invalid` for contract violations.

The client treats replayed success as success and emits one success notification. A fingerprint conflict is a programming error: clear the pending identity, suppress automatic retry, show safe guidance, and report operation/build metadata without the key or payload.

## Integration with TanStack Query

Domain mutation hooks expose action-oriented methods rather than accepting an idempotency key from components:

```ts
const punch = useIdempotentMutation({
  operation: "attendance.punch",
  mutationFn: ({ body, identity }) =>
    attendanceApi.punch(body, { idempotencyKey: identity.idempotencyKey }),
  invalidate: attendanceInvalidationPlan,
});
```

The wrapper:

- Creates the identity after validation and before network dispatch.
- Sets TanStack Query mutation retry to `false` by default for commands.
- Allows bounded automatic retry only for explicitly configured transport failures, with the same identity.
- Separates server `Retry-After` waiting from global client rate limiting.
- Completes storage before invalidating queries and notifying success.
- Prevents parallel execution of the same local action while allowing distinct actions with distinct keys.

## Security and Privacy

- Validate keys as 16-128 visible ASCII characters before sending.
- Never accept a key from URL state, server-rendered HTML, form input, or untrusted message events.
- Do not log, trace, report, or display the key, client event ID, fingerprint, or storage content.
- Redact `Idempotency-Key` in browser network instrumentation and backend logs.
- Clear pending identities on logout, authentication failure, company change, active-role change, and account switch.
- Treat storage as unavailable: Safari private mode, quota failure, SSR, and disabled storage must fall back to in-memory behavior without failing the action.
- Do not make the idempotency key an authorization credential; normal authentication and authorization always apply.

## Implementation Sequence

1. Finalize backend reservation, fingerprint, replay, retention, and error contracts.
2. Add `idempotencyKey` to `ApiRequestOptions` with validation and conflict tests.
3. Implement Web Crypto ID generation, canonicalization, fingerprinting, and storage adapter.
4. Implement the action lifecycle and outcome classifier.
5. Add `useIdempotentMutation` and session cleanup wiring.
6. Migrate attendance punch, regularization create, decision, export, and policy publish one operation at a time.
7. Add uncertain-outcome reconciliation UI and normalized copy.
8. Enable rollout per operation only after backend contract and replay tests pass.

## Test Plan

### Unit

- UUID generation uses Web Crypto and keys satisfy length/character constraints.
- Semantically identical canonical requests produce the same fingerprint.
- Changed method, path, query, or body produces a different fingerprint.
- Conflicting caller header is rejected.
- Storage unavailable falls back to memory.
- Expired, wrong-scope, corrupt, and unknown-version records are removed.
- Logout, company change, role change, and 401 clear all identities.

### Client Integration

- Double click results in one active action identity and one command.
- Timeout then retry sends the same key and body.
- Editing after timeout creates a new action/key and does not reuse the original.
- Reload after uncertainty restores guidance but does not auto-submit.
- Replayed success produces one toast and normal cache invalidation.
- `idempotency-in-progress` honors bounded `Retry-After` without creating a key.
- Two independent tabs generate distinct keys; server semantics protect both commands.

### Contract and End-to-End

- Same key and same request returns the original result without a second punch/event.
- Same key and changed request returns the stable conflict problem.
- Concurrent same-key requests do not both execute.
- Cross-user, cross-company, and cross-operation use cannot replay another command.
- Redaction tests prove keys and payloads are absent from logs and telemetry.
- Retention expiry matches published API behavior.

## Acceptance Criteria

- One user action owns one key across all equivalent retries.
- A changed action cannot reuse an old key.
- Uncertain outcomes survive reload only within the authenticated session and are never auto-replayed.
- Sensitive request and response data are not persisted.
- Session/company/role boundaries prevent identity reuse.
- All attendance command hooks use the shared mechanism after backend support lands.
- Replay, conflict, in-progress, timeout, concurrent, tenant, and redaction cases are tested.

## References

- `GEO-S10-011` attendance API contract rewrite plan.
- `GEO-S10-014` manual attendance frontend architecture.
- [IETF Idempotency-Key HTTP Header Internet-Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (expired draft; guidance only).
