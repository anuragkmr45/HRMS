# GEO-S10-018 QA Summary

Date: 2026-07-20
Branch: `GEO-S10-018`
Owner: Pratik
Domain: API Client Idempotency
Story points: 5

## Deliverable

Created `hrms-client/docs/attendance/GEO-S10-018-api-client-idempotency-plan.md`.

## Evidence Reviewed

- Shared API request options, error parsing, session events, and rate limiting.
- Attendance API functions and TanStack Query mutation hooks.
- Backend idempotency schema and attendance outbox idempotency behavior.
- `GEO-S10-011` server contract and `GEO-S10-014` mutation architecture.

## Key Decisions

- Add a typed idempotency option plus a reusable action-identity lifecycle.
- Generate opaque identifiers with Web Crypto.
- Persist only unresolved identity metadata in `sessionStorage`; never persist command bodies or coordinates.
- Fingerprint canonical requests and reject key reuse after any request change.
- Restore uncertain state after reload without automatically replaying a command.
- Clear identities at authentication, company, and active-role boundaries.

## Verification

- Run `git diff --check`.
- Confirm punch, regularization, decision, export, and policy publish migration is covered.
- Confirm same-request replay, changed-request conflict, concurrency, scope, expiry, and redaction tests are specified.
- Confirm the IETF document is identified as an expired draft, not a standard.

