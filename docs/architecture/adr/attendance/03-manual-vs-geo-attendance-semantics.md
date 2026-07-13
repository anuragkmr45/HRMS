# ADR-03: Manual vs Geo Attendance Semantics

Project: Hawkaii HRMS     
Date: 2026-07-13  
Decision Type: Domain Semantics / Audit Semantics  

## Context

The new Attendance system must support both manual attendance and location-based attendance.

A key product requirement is that manual attendance remains a first-class admin-configurable channel. Geo location is evidence, not the only source of attendance truth.

This means Attendance must not be designed as a GPS-only system.

Organizations may configure different attendance modes depending on:

- Employee group.
- Department.
- Designation.
- Work site.
- Shift.
- Policy version.
- Work mode.
- Temporary fallback requirement.
- Regularization workflow.

Without clear manual-vs-geo semantics, the system can create audit and reporting problems:

- Manual entries may appear as geo-verified.
- Rejected geo evidence may be lost.
- Regularization may overwrite original punch history.
- Manager reports may expose exact coordinates unnecessarily.
- Payroll may treat provisional attendance as final.
- Employees may be incorrectly flagged for misconduct when GPS accuracy is poor.

## Decision

Manual attendance and geo attendance will be modeled as separate attendance channels with separate evidence, decision, approval, and reporting semantics.

Manual attendance is valid only when the effective policy permits it.

Geo attendance is valid only when the effective policy permits or requires it and the submitted location evidence satisfies configured validation rules.

Geo location is treated as evidence used by the server-side policy decision engine. It is not treated as the attendance truth by itself.

## Attendance Channels

The system should support the following channel direction:

```txt
manual
geo
regularization
admin
system
mobile_offline
kiosk_future