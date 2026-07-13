# ADR-001: Attendance as a Bounded Context inside the Existing Fastify Backend

Project: Hawkaii HRMS   
Date: 2026-07-13  
Decision Type: Architecture  

## Context

Attendance is becoming a more complex domain in Hawkaii HRMS.

The current implementation is sufficient for a basic punch list, but the Sprint 10 roadmap requires attendance to support:

- Manual check-in/check-out.
- Location-based evidence.
- Tenant-safe command execution.
- Shift and policy resolution.
- Manager review queues.
- Immutable audit history.
- Regularization with correction history.
- Future mobile app evidence.
- Offline sync readiness.
- Payroll-safe locking and finalization.

The Sprint 10 feature and technical requirements confirm that Attendance already exists as a Fastify module and that creating a separate microservice is not required at this stage.

However, Attendance can no longer be treated as a thin CRUD module. It has independent business rules, state transitions, policy decisions, evidence records, and privacy requirements.

## Decision

Attendance will remain inside the existing Fastify backend deployment, but it will be treated as an isolated bounded context.

The Attendance bounded context will own its own:

- Command handling.
- Policy resolution.
- Shift resolution.
- Geo evaluation orchestration.
- Manual attendance handling.
- Evidence recording.
- Decision recording.
- Runtime session state.
- Daily attendance projection.
- Regularization flow integration.
- Attendance-specific audit trail.
- Attendance query and reporting model.

Attendance must expose clear internal interfaces to other modules and must not directly leak its internal state machine or evidence model into unrelated domains.

## Scope Owned by Attendance

Attendance owns the following concepts:

### Command Concepts

- Check-in.
- Check-out.
- Break start.
- Break end.
- Manual attendance command.
- Geo attendance command.
- Regularization request.
- Regularization decision.
- Attendance correction event.
- Attendance void/suppression event.

### Configuration Concepts

- Attendance policies.
- Policy versions.
- Policy assignments.
- Work mode rules.
- Manual/geo requirement configuration.
- Fallback policy.
- Review policy.
- Retention policy.

### Scheduling Concepts

- Shift templates.
- Shift versions.
- Shift assignments.
- Shift instances.
- Cross-midnight attendance date resolution.
- Effective shift lookup.

### Site and Geo Concepts

- Work sites.
- Geofences.
- Geofence versions.
- Circle and polygon geofence definitions.
- Location evidence.
- Accuracy/age validation.
- Boundary uncertainty classification.

### Runtime and Projection Concepts

- Employee runtime attendance state.
- Sessions.
- Break segments.
- Daily summaries.
- Daily exceptions.
- Evidence state.
- Approval state.
- Finalization state.

### Audit and Correction Concepts

- Attendance events.
- Attendance decisions.
- Decision reasons.
- Regularization actions.
- Period locks.
- Immutable correction history.

## Scope Referenced but Not Owned by Attendance

Attendance may reference the following domains, but it must not own or mutate them directly:

| External Domain | Attendance Usage |
|---|---|
| Core/company | Resolve company and tenant scope. |
| Employee profile | Resolve subject employee and active employment. |
| Role/permissions | Authorize actor capabilities. |
| Department/designation | Resolve policy assignment scope. |
| Leave/WFH | Include approved leave/WFH context in daily projection. |
| Holidays | Classify working day, holiday, or weekly off. |
| Timesheets | Future reporting/correlation only. |
| Payroll | Finalized attendance output, not raw mutation ownership. |
| Reports | Read-only projections and exports. |

## Module Boundary Direction

The Attendance module should keep a clear internal structure:

```txt
src/modules/attendance/
  __tests__/
  events.ts
  index.ts
  policy.ts
  repository.ts
  routes.ts
  service.ts