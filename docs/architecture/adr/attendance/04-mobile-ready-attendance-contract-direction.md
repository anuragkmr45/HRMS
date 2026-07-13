# ADR-004: Mobile-Ready Attendance Contract Direction

Project: Hawkaii HRMS     
Date: 2026-07-13    
Decision Type: API Contract / Future Compatibility  

## Context

The initial attendance rollout is web-first, but the backend must be ready for future mobile app support.

The Sprint roadmap expects future support for:

- Mobile app evidence.
- Offline sync.
- Device lifecycle.
- Replay protection.
- Client event IDs.
- Stable OpenAPI handoff.
- Reason-code responses.
- Future attestation signals.

Even before the native mobile app exists, the backend command model should not block mobile requirements.

Mobile introduces failure modes that normal web flows may not fully cover:

- Network retries.
- Offline event capture.
- Delayed submission.
- Duplicate replay.
- Device time drift.
- GPS accuracy variation.
- Location permission changes.
- App version differences.
- Device identity changes.
- Future device attestation.
- Event sequence conflicts.

If the command contract is designed only for the current web UI, the team may need a breaking API redesign during mobile handoff.

## Decision

Attendance APIs will use a mobile-ready command contract direction from the beginning.

The first implementation may support web-first behavior, but the request/response model must leave room for:

- `client_event_id`
- `source_channel`
- idempotency key
- captured time vs received time
- device metadata placeholders
- location evidence metadata
- offline batch submission
- replay detection
- stable reason-code responses
- future OpenAPI handoff

The server remains the final authority for attendance decisions.

Clients may submit evidence, but clients must not decide final attendance status, distance classification, session state, or payroll-final state.

## Contract Principles

Attendance command contracts must follow these principles:

1. Server decides final attendance outcome.
2. Client submits evidence, not final truth.
3. Every mutation is idempotent.
4. Every event has actor, company, and subject employee context.
5. Every command can be audited.
6. Every outcome has stable reason codes.
7. Location evidence is optional, required, or rejected based on effective policy.
8. Exact coordinates are never returned in ordinary responses.
9. Captured time and server received time are stored separately.
10. Offline/mobile compatibility is added without breaking web flows.

## Source Channel Direction

Attendance commands should identify their source channel.

Recommended direction:

```txt
web
mobile
mobile_offline
admin
system
kiosk_future