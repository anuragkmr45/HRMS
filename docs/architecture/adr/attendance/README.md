# Attendance Architecture ADR Pack

Project: Hawkaii HRMS   
Date: 2026-07-13    
Domain: Attendance Architecture   
Review Required Before: Attendance migration work starts  

## Purpose

This ADR pack defines the architecture direction for the Attendance upgrade before Sprint 10 migration work begins.

The Attendance module is moving from a basic punch/daily-record model toward a tenant-safe, policy-driven, audit-first, geo-capable attendance engine.

This pack documents the core architecture decisions for:

1. Attendance bounded context ownership.
2. PostgreSQL-first command path.
3. Manual-vs-geo attendance semantics.
4. Mobile-ready contract direction.

These decisions must be reviewed before migration and implementation work starts.

## Source Documents

This ADR pack is based on the following Sprint 10 planning documents:

- `HRMS_Location_Attendance_Feature_Requirements.docx`
- `HRMS_Location_Attendance_Technical_Requirements.docx`
- `HRMS_Attendance_DB_Architecture_Upgrade_Plan.docx`

## Current Audit Blockers

The current Attendance implementation has the following blockers:

- Attendance command flow mutates in-memory state before PostgreSQL persistence.
- Attendance is not consistently tenant-safe.
- Company context is not deterministically resolved for every command.
- Geo attendance is not implemented.
- Browser geolocation is currently blocked by backend Permissions-Policy.
- There is no operational shift model.
- Effective shift start is hard-coded.
- Regularization does not fully preserve immutable workflow/action history.
- Existing attendance tables are too limited for immutable evidence, policy decisions, offline/mobile events, and payroll locking.

## ADR Index

| ADR | Decision Area | File |
|---|---|---|
| ADR-01 | Attendance bounded context | `01-attendance-bounded-context.md` |
| ADR-02 | DB-first command path | `02-db-first-attendance-command-path.md` |
| ADR-03 | Manual-vs-geo semantics | `03-manual-vs-geo-attendance-semantics.md` |
| ADR-04 | Mobile-ready contract direction | `04-mobile-ready-attendance-contract.md` |

## Architecture Direction Summary

Attendance will remain inside the existing Fastify backend deployment, but it will be treated as an isolated bounded context.

The target architecture follows a CQRS-lite model:

- Immutable evidence records.
- Immutable decision records.
- Mutable runtime sessions.
- Mutable daily projections.
- Append-only correction and approval history.
- PostgreSQL/PostGIS as the authoritative persistence and spatial evaluation layer.
- Transactional outbox for integration events created with attendance state changes.

## Non-Negotiable Principles

The following principles must hold across migration and implementation:

1. PostgreSQL is the source of truth for attendance mutations.
2. No attendance command is accepted until the database transaction commits.
3. Every attendance command must resolve actor, company, and subject employee.
4. Every attendance table and query must be company-scoped.
5. Manual attendance is a valid first-class channel when policy permits it.
6. Geo location is evidence, not the only source of attendance truth.
7. Rejected, provisional, and uncertain evidence must be recorded safely for audit.
8. Original evidence must not be overwritten by regularization.
9. Shift and policy versions must be resolved deterministically.
10. Exact coordinates must not be exposed in ordinary list/report responses.
11. Future mobile/offline support must be considered in command contracts from the beginning.

## Review Gate

Implementation and migration work should not begin until this ADR pack is reviewed and accepted by the project lead/backend lead.

At minimum, review should confirm:

- Attendance bounded context boundaries.
- Tenant/company scoping strategy.
- PostgreSQL-first transaction design.
- Idempotency and concurrency control direction.
- Manual-vs-geo attendance semantics.
- Evidence, decision, session, and projection separation.
- Mobile-ready API contract direction.
- Privacy and exact-location exposure boundaries.