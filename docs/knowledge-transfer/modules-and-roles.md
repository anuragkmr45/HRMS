# Modules And Roles

Last verified from the repository: 2026-06-30.

This document maps product modules to frontend routes, backend domains, roles, and key workflow concepts.

## Role Model

The system has frontend navigation roles and backend authorization roles.

Frontend roles live in `hrms-client/src/lib/mock/roles.ts`:

| Frontend Role | Main Use |
| --- | --- |
| `main_admin` | Full workspace access and configuration. |
| `hr_admin` | HR operations, employees, EMS, attendance, leave, reports, admin settings. |
| `employee` | Self-service workflows. |
| `manager` | Team approvals, team reports, employee capabilities. |
| `director` | Leadership approval and oversight. |
| `auditor` | Governance and read-oriented reports. |
| `project_manager` | Projects, allocations, timesheets, delivery tracking. |
| `finance_manager` | Expense finance processing and finance reports. |
| `asset_admin` | Asset/IT operations and inventory. |
| `helpdesk_agent` | Ticket triage and resolution. |

Backend roles live in `hrms_backend/src/shared/constants.ts`:

| Backend Role | Main Permissions |
| --- | --- |
| `Employee` | Expense create, document read. |
| `Reviewer` | Expense manager verification, report read, document read. |
| `Director` | Senior approval and report/document read. |
| `Finance Manager` | Finance approval, finance queue, document verification, reports. |
| `Admin` | Admin wildcard. |
| `Auditor` | Expense audit, reports, document read. |
| `Asset Manager` | Asset management and document read. |
| `HR Manager` | HR document write/read and reports. |

The frontend hides routes based on active role, but backend services are the authority for permissions and workflow access.

## Navigation Groups

Sidebar groups are defined in `hrms-client/src/components/app-sidebar.tsx`.

| Group | Routes |
| --- | --- |
| Workspace | `/dashboard`, `/ems`, `/attendance`, `/leave-wfh`, `/timesheet` |
| Operations | `/employees`, `/projects`, `/team-utilization`, `/expenses`, `/assets`, `/helpdesk` |
| Insights | `/reports`, `/admin-settings` |

## Module Matrix

| Product Module | Frontend Routes | Frontend Domain | Backend Module | Backend API Area |
| --- | --- | --- | --- | --- |
| Auth and onboarding | `/login`, `/signup`, `/verify-email`, `/set-password`, `/forgot-password`, `/reset-password`, `/onboarding` | `src/domains/auth` | `src/modules/auth` | `/api/v1/auth`, `/api/v1/onboarding` |
| Dashboard | `/dashboard` | `src/domains/dashboard` | `src/modules/dashboard` | `/api/v1/dashboard` |
| Employees/Core | `/employees`, `/employees/$id` | `src/domains/core` | `src/modules/core` | `/api/v1/core` |
| EMS | `/ems`, `/ems/profile`, `/ems/documents`, `/ems/requests`, `/ems/approvals`, `/ems/policies`, `/ems/letters`, `/ems/admin` | `src/domains/ems` | `src/modules/ems` | `/api/v1/ems` |
| Attendance | `/attendance`, `/attendance/calendar`, `/attendance/exceptions` | `src/domains/attendance` | `src/modules/attendance` | `/api/v1/attendance` |
| Leave/WFH | `/leave-wfh`, `/leave-wfh/apply-leave`, `/leave-wfh/apply-wfh`, `/leave-wfh/approvals`, `/leave-wfh/monitor`, `/leave-wfh/holidays` | `src/domains/leave-wfh` | `src/modules/leave-wfh` | `/api/v1/leave-wfh` |
| Timesheets | `/timesheet`, `/timesheet/approvals`, `/timesheet/projects` | `src/domains/timesheets` | `src/modules/timesheets` | `/api/v1/timesheets` |
| Projects | `/projects`, `/projects/$id`, `/team-utilization` | `src/domains/projects` | `src/modules/projects` | `/api/v1/projects` |
| Expenses | `/expenses`, `/expenses/create`, `/expenses/my`, `/expenses/review`, `/expenses/finance`, `/expenses/register`, `/expenses/reports`, `/expenses/$id` | `src/domains/expenses` | `src/modules/expenses` | `/api/v1/expenses`, manager, finance paths |
| Assets | `/assets`, `/assets/inventory`, `/assets/my`, `/assets/requests`, `/assets/returns`, `/assets/warranty`, `/assets/$id` | `src/domains/assets` | `src/modules/assets` | `/api/v1/assets` |
| Helpdesk | `/helpdesk`, `/helpdesk/my`, `/helpdesk/queue`, `/helpdesk/categories`, `/helpdesk/sla`, `/helpdesk/reports`, `/helpdesk/$id` | `src/domains/helpdesk` | `src/modules/helpdesk` | `/api/v1/helpdesk` |
| Documents | Used inside EMS, expenses, assets, admin/company logo | `src/domains/documents` | `src/modules/documents` | `/api/v1/documents` |
| Reports | `/reports`, `/reports/hr`, `/reports/attendance`, `/reports/leave`, `/reports/timesheet`, `/reports/projects`, `/reports/expenses`, `/reports/assets`, `/reports/helpdesk`, `/reports/audit` | `src/domains/reports` | `src/modules/reports` | `/api/v1/reports` |
| Admin Settings | `/admin-settings`, `/admin-settings/company`, `/admin-settings/master-data`, `/admin-settings/roles`, `/admin-settings/workflows`, `/admin-settings/policies`, `/admin-settings/email-templates`, `/admin-settings/notifications`, `/admin-settings/security`, `/admin-settings/audit` | `src/domains/admin`, `src/domains/platform` | `src/modules/admin`, `src/modules/platform` | `/api/v1/admin`, `/api/v1/platform` |
| Notifications | Topbar/feed usage | `src/domains/notifications` | `src/modules/notifications` | `/api/v1/notifications` |
| Locations | Selectors and location data | `src/domains/locations` | `src/modules/locations` | `/api/v1/locations` |

## Core Workflows

### Auth And Company Bootstrap

- Signup creates pending company/user state.
- Email verification validates an app-owned token.
- Password setup and login establish the user session.
- First admin may need company bootstrap before normal app access.
- The authenticated session context drives active role, role switcher, permissions, and navigation.

### Expense Workflow

Typical flow:

```text
Draft
  -> Submitted
  -> Pending Manager Verification
  -> Manager Verified
  -> Finance Approved
  -> Payment Released
  -> Bills Submitted / Pending Adjustment
  -> Closed
```

Alternative states include manager return/reject, finance hold, clarification required, routing exception, and cancellation. Self-approval/self-processing is blocked by backend policy.

### Attendance Workflow

- Employees punch in, start/end breaks, and punch out.
- Daily records aggregate punch events.
- Exceptions/regularization requests support corrections.
- Attendance policy controls auto punch-out behavior.
- The worker can close expired sessions based on company timezone and configured auto punch-out time.

### Leave/WFH Workflow

- Employee applies for leave or WFH.
- Approvers review, approve, reject, or return based on workflow/policy.
- HR/Admin monitor views see broader queues and holidays.
- Reports consume role-scoped leave/WFH records.

### Timesheet Workflow

- Work segments are recorded against projects or work categories.
- Employees submit timesheets.
- Approvers review queue items.
- Workflow definitions are admin-controlled.
- Project summaries and missing submission reports support delivery governance.

### Asset Workflow

- Asset manager creates inventory.
- Assets can be assigned, returned, maintained, retired, or marked lost/stolen.
- Employees can request assets and acknowledge assignments.
- Vendors, warranties, licenses, recovery tickets, and compromised keys are part of the asset domain.

### Helpdesk Workflow

- Employees create tickets with category/priority.
- Agents/admins triage, assign, comment, add internal notes, resolve, close, or reopen.
- SLA reporting is available through helpdesk reports.
- Attachments go through backend document/media handling.

### Admin Configuration

Admin settings control:

- Company profile and logo.
- Master data.
- RBAC roles and permissions.
- Approval workflows.
- Policies.
- Email templates.
- Notification channels.
- Security settings.
- Audit logs.

Changing admin config can affect multiple modules. Treat these changes as high-risk and include cross-module QA.

## Adding Or Changing A Module

1. Identify the route group, frontend domain, backend module, and OpenAPI tag.
2. Confirm roles and backend permissions.
3. Add backend behavior first when the screen needs durable state.
4. Regenerate API docs.
5. Add frontend adapter/query hooks.
6. Update route coverage and any role navigation maps.
7. Update this document if new routes, roles, statuses, or workflows are added.

