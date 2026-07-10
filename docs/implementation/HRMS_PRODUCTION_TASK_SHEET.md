# Hawkaii HRMS Production Task Sheet

Last updated: 2026-06-30

## Executive Summary

This versioned report captures the completed Phase 6 backup/restore scripts, observability, deployment/security hardening, provider-based document storage, document upload compression hardening, media upload policy/profile-photo/onboarding-logo Cloudinary support, Admin Security Settings enforcement, EMS admin workflow hardening, Asset vendor/recovery/warranty-alert hardening, project document upload handoff, Helpdesk category configuration, CSV/JSON/XLSX export-file generation, EMS document upload-picker/delete flow, and browser e2e hardening slices after Dashboard, Employee CRUD/Admin, Attendance, Leave/WFH/Holidays, EMS, Projects/utilization, Helpdesk, Notifications, Asset workflow, Timesheet enhancement, Expense enhancement, Admin company profile, Admin master data, Admin RBAC, Admin workflow, Admin policy, Admin email template, Admin notification channel, Admin audit-log, non-expense Reports, employee/core backlog additions, EMS document wrappers, Attendance backlog completion, Leave/WFH export completion, verification guardrails, and API/browser e2e baselines. This root task sheet records current implementation status; the backend mirror lives at `hrms_backend/docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`.

## Current Verified Status

| Area | Status |
| --- | --- |
| Backend OpenAPI | 245 implemented operations across 214 paths |
| Planned operations remaining | 0 |
| Dashboard backend/frontend | Completed for backend summary API and frontend summary integration |
| Employee admin backend/frontend | Completed for employee create/update, lifecycle, login, roles, and org selectors |
| Attendance backend/frontend | Completed for punches, my/team summary, daily/monthly calendar, exceptions, regularization request/manager queue/decision, and export job metadata |
| Leave/WFH/Holidays backend/frontend | Completed for balances, leave requests, WFH requests, manager decisions, HR monitor, holidays, export job metadata, and visible frontend routes |
| EMS backend | Implemented for profile, profile change requests, HR profile decisions, employee document wrappers, generic service requests, HR service queue/decisions, letters, policy acknowledgements, onboarding/exit checklists, probation decisions, and policy update/publish workflow |
| EMS frontend | Integrated in `hrms-client` for dashboard profile signals, profile, employee document listing/downloads/uploads, requests, letters, policies, and HR admin document/profile/onboarding/probation/exit/policy/letter queues |
| Projects/utilization backend | Implemented for project CRUD, members, allocations, milestones/modules, project documents, project summary, and team utilization |
| Projects/utilization frontend | Integrated in `hrms-client` for `/projects`, `/projects/$id`, and `/team-utilization` in API mode; project detail now uploads/downloads attached documents through the existing Documents API in API mode |
| Helpdesk backend | Implemented for ticket CRUD, comments/internal notes, attachments, assignment, priority/status changes, resolve/close/reopen, category read/create/update/toggle configuration, and SLA report |
| Helpdesk frontend | Integrated in `hrms-client` for Helpdesk dashboard, my tickets, agent queue, ticket detail, category read/create/update/toggle configuration, SLA, and reports in API mode |
| Notifications backend | Implemented for authenticated feed, unread count, mark-read, and mark-all-read |
| Notifications frontend | Integrated in `hrms-client` topbar notification panel in API mode |
| Asset workflow backend | Implemented for asset requests, approvals, cancellations, acknowledgements, maintenance records, policy-driven warranty alerts, vendor list/create/update, recovery queue, and recovery settlement |
| Asset workflow frontend | Integrated in `hrms-client` asset store/API mode for visible asset request, acknowledgement, maintenance, policy-driven warranty alerts, vendor CRUD, and recovery settlement flows |
| Timesheet enhancements backend | Implemented for project summaries, missing submissions, productivity summary, submission detail, and selectors |
| Timesheet enhancements frontend | Integrated in `hrms-client` for project timesheet view, missing submission queue/report inputs, productivity/project report rollups, and form selectors in API mode |
| Expense enhancements backend | Implemented for metadata, dashboard summary, requester withdraw, and clarification thread |
| Expense enhancements frontend | Integrated in `hrms-client` for create-form metadata, expense dashboard summary cards, withdraw actions, and clarification comments in API mode |
| Admin company profile/settings | Completed for Admin-only company profile read/update API and `/admin-settings/company` frontend API-mode integration |
| Admin master data | Completed for department/designation list/create/update APIs and `/admin-settings/master-data` frontend API-mode integration for those two master groups |
| Admin RBAC | Completed for persistent RBAC role/permission configuration APIs and `/admin-settings/roles` frontend API-mode integration |
| Admin workflow configurations | Completed for Admin-only workflow config list/update APIs and `/admin-settings/workflows` frontend API-mode integration |
| Admin policies | Completed for Admin-only policy config list/update APIs and `/admin-settings/policies` frontend API-mode integration |
| Admin email templates | Completed for Admin-only email template list/update APIs and `/admin-settings/email-templates` frontend API-mode integration |
| Admin notification channels | Completed for Admin-only notification channel list/update APIs and `/admin-settings/notifications` frontend API-mode integration |
| Admin audit log | Completed for Admin/Auditor audit-log read API and `/admin-settings/audit` frontend API-mode integration |
| Admin security settings | Completed for Admin-only security-settings read/update APIs, `/admin-settings/security` frontend API-mode integration, and runtime enforcement for password rules, session timeout, and auth-rate caps; MFA remains disabled until a provider spec exists |
| Non-expense Reports backend | Completed for HR, attendance, leave/WFH, projects, timesheets, assets, helpdesk, audit, export list, and export detail report APIs |
| Non-expense Reports frontend | Integrated in `hrms-client` for HR, attendance, leave, projects, timesheet, assets, helpdesk, and audit report routes in API mode |
| Employee/core backlog backend | Completed for role assignment history, profile audit trail, employee import job metadata/status, and employee export job metadata APIs |
| Employee/core backlog frontend | Integrated in `hrms-client` for employee profile role history/audit tabs and API-backed employee export job queueing |
| Phase 6 verification guardrails | Hardened backend implementation and scalability checks now cover the full module set, 233-operation contract state, zero planned API backlog, synced frontend contract JSON, critical queue/report indexes, and frontend production API/mock fallback config |
| Phase 6 API e2e baseline | Completed backend API-level user-flow smoke for auth/session, core users, dashboard, timesheets, expenses, attendance, leave/WFH, EMS, projects/utilization, helpdesk, notifications, reports, and export metadata |
| Phase 6 browser e2e baseline | Completed Playwright smoke coverage in `hrms-client` for API-mode login, notification panel, employee self-service routes, HR/admin routes, reports/settings, projects, and team utilization |
| Phase 6 browser e2e hardening | Completed Playwright coverage for API-backed Helpdesk ticket creation, mobile authenticated shell navigation, and generated report export download handoff across all report routes |
| Phase 6 export generation | Completed document-backed export generation for employee/core CSV/XLSX, report CSV/XLSX, and attendance/Leave-WFH CSV/JSON/XLSX export APIs; frontend employee, Leave/WFH monitor, and route-wide ReportShell exports now open generated document downloads when returned |
| Phase 6 Cloudinary-only document storage | Removed the legacy local object-storage runtime path and made Cloudinary the backend-owned storage adapter for local, QA, test, and production. Local/QA/test use `CLOUDINARY_MOCK_UPLOADS=true`; production requires real Cloudinary values with mock uploads disabled. |
| Frontend expense create UX | Removed the visible Tax amount input from `/expenses/create`; created line items now use quantity times unit cost in the create-form total |
| Frontend EMS document upload UX | EMS documents now send real `multipart/form-data` file payloads and compress image uploads in the browser before backend upload |
| Phase 6 document upload compression | Added shared frontend upload preparation for image compression/size validation and backend server-side PDF compression before object storage with Ghostscript-backed, env-controlled fail-open behavior |
| Phase 6 media upload policy/profile photos | Added backend-owned media size/type/compression policy and employee profile-photo document upload plumbing so visible media upload limits come from backend config |
| EMS profile photo management | `/ems/profile` My profile tab now supports upload, replace, and remove actions for the current user's profile photo through the Core profile-photo APIs and Cloudinary-backed document storage |
| Phase 6 onboarding company logo upload | Added token-based onboarding logo upload through the backend Documents/Cloudinary adapter; the frontend compresses the logo, preserves the draft preview through refresh, and uploads the file before company bootstrap consumes the token |
| Phase 6 Helpdesk category configuration | Completed Admin/support-scoped Helpdesk category create/update/toggle APIs and connected the `/helpdesk/categories` UI actions to those APIs in API mode |
| Phase 6 deployment/security hardening | Completed baseline backend security headers, production CORS allowlisting, compose CORS env wiring, deployment verifier service-name alignment, and production-safe logger configuration |
| Phase 6 backup/restore scripts | Added PostgreSQL custom-format backup and guarded restore scripts plus package commands; live backup execution still requires PostgreSQL client tools on the operator host |
| Root task sheet | Versioned in the root monorepo under `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md` |

## Role/Page Product QA Matrix

This matrix records the product-engineering audit pass requested before final visible hardening. It is intentionally route-grouped so every visible role/page area has an owner status without duplicating the full generated route list.

| Role(s) | Route/page group | Current source | Backend endpoint(s) | Mutation behavior | States/permissions checked | Product QA status |
| --- | --- | --- | --- | --- | --- | --- |
| All authenticated roles | `/dashboard`, topbar notifications, shell navigation | Backend API in API mode | `/api/v1/dashboard/summary`, `/api/v1/notifications*`, `/api/v1/auth/me` | Notification mark-read/mark-all-read uses backend | Loading/API-ready indicator, mobile shell, role navigation smoke covered | Production-ready |
| Employee, Manager, HR/Admin | `/attendance`, `/attendance/calendar`, `/attendance/exceptions`, reports attendance | Backend API in API mode | `/api/v1/attendance*`, `/api/v1/reports/attendance/summary` | Punch, regularization request/decision, export metadata/document handoff | Empty/error/loading states and API e2e covered; browser approval coverage still needs expansion | Production-ready with P1 browser-flow coverage gap |
| Employee, Manager, HR/Admin | `/leave-wfh*`, leave reports | Backend API in API mode | `/api/v1/leave-wfh*`, `/api/v1/reports/leave-wfh/summary` | Apply/cancel/manager decision/HR monitor/export | API e2e covered; browser approval coverage still needs expansion | Production-ready with P1 browser-flow coverage gap |
| Employee, HR/Admin, Auditor | `/ems`, `/ems/profile`, `/ems/documents`, `/ems/requests`, `/ems/letters`, `/ems/policies`, `/ems/admin` | Backend API in API mode | `/api/v1/ems*`, `/api/v1/documents*` | Profile changes, service requests, document upload, policy acknowledgement, HR profile/request decisions, onboarding/exit checklist updates, probation decisions, policy publish/update, and letter generation use backend | Employee flows have API/browser smoke; EMS admin backend/frontend validation passed; deeper browser approval coverage pending | Production-ready with P1 browser-flow coverage gap |
| Main Admin, HR Admin, Auditor | `/employees`, `/employees/$id` | Backend API in API mode | `/api/v1/core/users*` | CRUD, lifecycle, login enable/disable, role replace, export metadata/document handoff | Backend/frontend validation passed; CSV import parsing still queued metadata only | Production-ready for visible employee admin except P1 import parsing |
| Project Manager, Main Admin, Finance | `/projects`, `/projects/$id`, `/team-utilization`, project reports | Backend API in API mode; project document upload/download and project portfolio export use existing Documents/Reports APIs | `/api/v1/projects*`, `/api/v1/team-utilization/summary`, `/api/v1/reports/projects/summary`, `/api/v1/reports/exports`, `/api/v1/documents*` | Project CRUD/status/member/allocation/milestone actions use backend; editable API-backed project detail can upload compressed document files and open generated download URLs; `/projects` Export creates a backend report document in API mode | Project/utilization route smoke covered; upload/browser export coverage still needs expansion | Production-ready with P1 project report-depth/browser-upload coverage gap |
| Finance Manager, Manager, Employee, Auditor | `/expenses*`, expense reports | Backend API in API mode | `/api/v1/expenses*`, `/api/v1/reports/expenses*` | Create, upload attachments, withdraw, clarify, manager/finance decisions use backend | Browser upload coverage exists through backend integration; route smoke covered | Production-ready with P1 browser decision-flow expansion gap |
| Employee, Manager | `/timesheet*`, timesheet reports | Backend API in API mode | `/api/v1/timesheets*`, `/api/v1/reports/timesheets/summary` | Segment/submission/approval flows use backend | API e2e covered; browser approval coverage pending | Production-ready with P1 browser decision-flow expansion gap |
| Asset Admin, Employee | `/assets*`, asset reports | Backend API in API mode | `/api/v1/assets*`, `/api/v1/reports/assets/summary` | Requests/approvals/acknowledgement/maintenance, policy-driven warranty alerts, vendor create/update, and recovery settlement use backend | API integration covered; route smoke covered; deeper browser approval/recovery coverage still needs expansion | Production-ready with P1 browser-flow coverage gap |
| Helpdesk Agent, Employee, Manager | `/helpdesk*`, helpdesk reports | Backend API in API mode | `/api/v1/helpdesk*`, `/api/v1/reports/helpdesk/summary` | Ticket create/update/comment/assign/status/category config use backend | Browser ticket create and category backend/frontend validation covered | Production-ready with P1 approval/attachment browser coverage gap |
| Admin, Auditor | `/admin-settings/*` | Backend API in API mode for company, departments/designations, RBAC config, workflows, policies, email templates, notification channels, audit, and security settings | `/api/v1/admin/*` | Admin security settings now persist password/session/rate/audit/security basics; MFA toggle is disabled until provider-backed MFA is specified | Admin/auditor permissions covered for audit; security settings are Admin-only | Production-ready for visible basic settings; MFA/provider enforcement intentionally deferred |
| Admin, Auditor, Finance, HR | `/reports*` | Backend API in API mode with generated CSV/XLSX document handoff for supported exports | `/api/v1/reports*`, `/api/v1/documents/{id}/download-url` | CSV and XLSX exports generate backend documents | Browser export download handoff covered route-wide | Production-ready for supported exports; P1 scheduling/retention gap |

## Admin Audit Log Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.audit.tsx` rendered audit rows from the Admin Settings local store | Replace production-critical local audit rows with backend-backed read behavior in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` persisted audit entries to `hawkaii_admin_audit_v1` | Keep local audit data only when API mode is disabled |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` listed `GET /api/v1/admin/audit-log` as planned | Implement the read endpoint with Admin/Auditor access, pagination, filters, OpenAPI docs, and integration tests |
| Existing backend support | Admin settings mutations already append durable `admin.*` outbox events | Derive the audit-log read model from admin outbox events instead of adding a second audit table |
| Deferred scope | Broader cross-module audit reports, export jobs, and runtime security-setting enforcement remain outside this slice | Keep this endpoint scoped to Admin Settings audit visibility |

## Non-Expense Reports Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | Historical Phase 5 note: Admin security settings was deferred while non-expense Reports were implemented first | Admin Security Settings is now completed in Phase 6 for password/session/rate/audit/security basics |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists 10 planned report operations: HR employees, attendance summary, leave/WFH summary, projects summary, timesheets summary, assets summary, helpdesk summary, cross-module audit, export list, and export detail | Add those operations under `/api/v1/reports/*` with OpenAPI docs and integration coverage |
| Existing backend support | `src/modules/reports` already provides expense reports and `POST /api/v1/reports/exports`; source data exists in Core, Attendance, Leave/WFH, Projects, Timesheets, Assets, Helpdesk, expense audit logs, and Outbox | Extend the existing reports module with read-only non-expense summaries; use existing outbox events as durable export job records instead of introducing a separate export table |
| Frontend report routes | `hrms-client/src/routes/_app/reports*.tsx` covers HR, attendance, leave, projects, timesheet, expenses, assets, helpdesk, and audit reports | Replace production-critical mock/local aggregation on non-expense report routes with backend report adapters in API mode |
| Current frontend data source | HR/attendance/audit reports still derive from mock/local stores or deterministic local synthesis; projects/assets/helpdesk/timesheet reports partially derive from stores that are already API-backed in API mode | Add report domain hooks and wire visible non-expense report routes to backend summaries while keeping local behavior only when API mode is disabled |
| Deferred scope | Scheduled reports, security settings, report-builder UX, and deeper e2e coverage are not represented in the current contract | Phase 6 now adds document-backed CSV/XLSX export generation; scheduling and retention remain production hardening |

## EMS Admin Workflow Hardening Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `/ems/admin` has real API-backed document verification, profile-change queue, and letter request queue reads, but onboarding, probation, exit checklist, policy publish, and letter generate/send actions still use static arrays/toasts | Replace visible static admin workflow tabs/actions with persisted EMS APIs in API mode |
| Current data source | Static `ONBOARDING`, `PROBATION`, `EXITS`, `POLICIES`, and letter action toasts in `hrms-client/src/routes/_app/ems.admin.tsx` | Add EMS admin domain APIs/hooks and keep local rows only when API mode is disabled |
| Existing backend support | EMS already persists employee profiles, profile-change requests, service requests, letters, policies, and policy acknowledgements | Extend the existing EMS module rather than adding a separate HR admin module |
| Minimal slice | Onboarding checklist list/update; probation queue list/decision; exit checklist list/update; policy publish/update; EMS request decision that can generate a letter from a letter service request | Add OpenAPI docs, integration tests, and frontend wiring for these visible actions |
| Deferred scope | Full onboarding task orchestration, provider-generated letter PDF templates, automated asset/finance clearance, and deeper browser approval coverage | Keep these as production-hardening follow-ups unless a visible route already requires them |

## EMS Admin Workflow Hardening Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `POST /api/v1/ems/requests/{id}/decision`, `GET/PATCH /api/v1/ems/admin/onboarding`, `GET /api/v1/ems/admin/probation`, `POST /api/v1/ems/admin/probation/{id}/decision`, `GET/PATCH /api/v1/ems/admin/exits`, and `PUT /api/v1/ems/policies/{id}` | The slice persists onboarding/exit checklists and probation reviews, generates an available HR letter when a letter service request is approved, and emits EMS outbox events for admin workflow decisions |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm verify:implementation`, `pnpm verify:scalability`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, and `pnpm test:contracts` passed | The first EMS integration run was executed in parallel with contract tests and hit a shared test DB reset race; the suite passed when rerun sequentially after selecting the seeded Offer Letter explicitly in the acknowledgement assertion |
| Frontend integration | Connected `/ems/admin` onboarding, probation, exit, policy, and letter-generation actions to EMS APIs in API mode | API-disabled development keeps local rows; production API mode no longer silently uses the static admin workflow rows for visible actions |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, production config guard, implemented-route guard, route coverage, and `pnpm build` passed | Lint keeps 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 229 operations across 202 paths; frontend contract snapshots were synced from backend | Planned operations remaining stay at 0 |

## Asset Vendor/Recovery Hardening Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `POST /api/v1/assets/vendors`, `PATCH /api/v1/assets/vendors/{id}`, and `POST /api/v1/assets/recovery-queue/{id}/settlement` | Vendor mutations use OCC where applicable and emit outbox audit events; recovery settlement closes offboarding tickets, records settlement details, clears active assignment, and updates the linked asset status |
| Backend persistence | Added migration `0019_asset_vendor_recovery_workflows.sql` with recovery settlement fields, ticket versioning, settlement index, and active-vendor uniqueness | No cross-schema SQL foreign keys were introduced |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm verify:implementation`, `pnpm verify:scalability`, `pnpm db:verify:no-cross-schema-fks`, assets integration test, and `pnpm test:contracts` passed | `tsx`-based commands needed escalation because sandbox IPC blocks local pipe creation; DB-backed tests ran serially against QA infra |
| Frontend integration | Connected `/assets/warranty` vendor create/update and `/assets/returns` offboarding recovery settlement to backend APIs in API mode | API-disabled development keeps existing local/demo behavior; production API mode no longer treats vendor cards and recovery queue actions as read-only/static |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, production config guard, implemented-route guard, route coverage, and `pnpm build` passed | Lint keeps 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 232 operations across 204 paths; frontend contract snapshots were synced from backend | Planned operations remaining stay at 0 |

## Non-Expense Reports Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/reports/hr/employees`, `/attendance/summary`, `/leave-wfh/summary`, `/projects/summary`, `/timesheets/summary`, `/assets/summary`, `/helpdesk/summary`, `/audit`, `/exports`, and `/exports/{id}` | Phase 6 now upgrades report export create/list/detail to include generated document metadata for CSV/XLSX exports while keeping outbox events |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, reports integration test, and `pnpm test:contracts` passed | One first contract run failed because it was run in parallel with another DB-resetting integration test; rerun alone passed |
| Frontend integration | Added report domain API/hooks and connected HR, attendance, leave, projects, timesheet, assets, helpdesk, and audit report routes to `/api/v1/reports/*` in API mode | API-disabled development keeps the existing local/mock report derivations |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend and frontend contract docs now show 206 implemented operations and 11 planned operations remaining | `Reports & Analytics` now counts 15 implemented operations |

## Employee/Core Backlog Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | After non-expense Reports, the task sheet and gap audit listed 11 planned operations remaining; the largest unblocked group was the five employee/core operations | Complete employee/core before EMS document wrappers, attendance export/aliases, and leave/WFH export |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` listed role history, employee audit, import job create/status, and export job create under `/api/v1/core/users/*` | Implement those five endpoints with OpenAPI docs, contract tests, and core integration coverage |
| Existing backend support | Core user mutations already emit durable `core.user.*` outbox events | Derive role history/audit from existing outbox events; use outbox job metadata for import/export requests until real import parsing/export file generation is implemented |
| Frontend employee routes | `/employees` has an Export action; `/employees/$id` renders role history and audit trail from local employee arrays | Queue backend export jobs in API mode and replace detail role/audit timelines with backend reads when the actor has access |
| Deferred scope | There is no visible employee import screen yet; actual CSV/XLSX import parsing is not implemented | Phase 6 now adds document-backed CSV employee export generation; import processing and upload/import UI remain production hardening or future visible route work |

## Employee/Core Backlog Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/core/users/{id}/roles/history`, `GET /api/v1/core/users/{id}/audit`, `POST /api/v1/core/users/imports`, `GET /api/v1/core/users/imports/{job_id}`, and `POST /api/v1/core/users/exports` | History/audit are backed by core outbox events; Phase 6 now generates document-backed CSV employee exports, while import jobs remain queued metadata until processors exist |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, core integration test, and `pnpm test:contracts` passed | Non-escalated `tsx`/DB test runs hit sandbox IPC/network restrictions and passed when rerun with local QA infra access |
| Frontend integration | Added Core API hooks for role history, audit, and export job creation; `/employees/$id` now reads role/audit data from backend in API mode; `/employees` queues backend export jobs when API-backed | API-disabled development keeps local role/audit arrays and local CSV export |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 211 operations; frontend contract snapshots were synced from backend | Planned operations remaining drop from 11 to 6 |

## EMS Document Wrapper Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | The remaining planned operation list is down to 6; the next unblocked group is the two EMS employee document wrapper operations | Implement the wrappers before Attendance aliases/export and Leave/WFH export |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/ems/employees/{user_id}/documents` and `POST /api/v1/ems/employees/{user_id}/documents` as planned | Add EMS routes, service methods, OpenAPI docs, contract coverage, and EMS integration tests |
| Existing backend support | `DocumentService` already owns object storage, metadata, classification policy, download URLs, verification, and document access logs | Reuse Documents as the source of truth; do not add a parallel EMS document table |
| Object identity | Existing document tests and QA scripts use `business_object_type = "employee"` with `business_object_id` set to the employee user id | EMS wrapper should scope employee documents through that existing object identity |
| Frontend route | `hrms-client/src/routes/_app/ems.documents.tsx` currently lists all visible documents through `documentsApi.list({ page_size: 100 })` and downloads through Documents APIs | Replace the list with the EMS employee wrapper in API mode; keep download through Documents APIs |
| Upload UI | The visible EMS document route has placeholder Upload/Replace buttons only; there is no file/input flow wired to backend upload | Add frontend adapter/hook for the POST wrapper, but do not invent a new upload UI in this slice |
| Access policy | EMS policy allows self, HR/Admin, Auditor, and scoped reporting hierarchy to see EMS users; Documents policy still controls classification read/download rules | Wrapper must require EMS employee visibility and then rely on Documents classification policy for returned documents |

## EMS Document Wrapper Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/ems/employees/{user_id}/documents` and `POST /api/v1/ems/employees/{user_id}/documents` | Wrappers reuse the existing Documents module/object storage with `business_object_type = "employee"` and path `user_id` as the business object id |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, and `pnpm test:contracts` passed | Non-escalated `tsx`/DB/Docker runs were sandbox-blocked and passed when rerun with local QA infra access |
| Frontend integration | Added EMS document API adapter/hooks and connected `/ems/documents` to the employee-scoped wrapper in API mode | Download URLs continue to use existing Documents APIs; Phase 6 now adds a real file picker for Upload/Replace that sends selected-file metadata to the EMS wrapper |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 213 operations across 188 paths; frontend contract snapshots were synced from backend | Planned operations remaining drop from 6 to 4 |

## Attendance Backlog Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | The remaining planned operation list is down to 4; the next group is the three Attendance completion endpoints | Implement Attendance before the final Leave/WFH export endpoint |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/attendance/calendar/daily`, `GET /api/v1/attendance/regularizations/queue/manager`, and `POST /api/v1/attendance/exports` as planned | Add routes, service methods, OpenAPI docs, contract coverage, and attendance integration tests |
| Existing backend support | Attendance already has punches, my/team summaries, monthly calendar, my regularizations, regularization decisions, exceptions, permissions, and outbox events | Reuse existing day synthesis, visible-user scoping, regularization repository, and outbox job metadata patterns |
| Frontend routes | `/attendance/calendar` uses monthly calendar; `/attendance/exceptions` uses exceptions for HR queues; `/reports/attendance` uses the Reports summary API plus local CSV export | Add Attendance domain adapters/hooks for the new endpoints; avoid broad UI rewrites unless a visible screen directly needs the new route |
| Export behavior | Existing report exports originally used queued metadata backed by outbox | Phase 6 now generates document-backed CSV/JSON/XLSX attendance exports |

## Attendance Backlog Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/attendance/calendar/daily`, `GET /api/v1/attendance/regularizations/queue/manager`, and `POST /api/v1/attendance/exports` | Daily calendar reuses existing day synthesis and visibility policy; manager queue scopes pending regularizations to assigned managers or HR/Admin/Auditor; exports queue outbox metadata only |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, and `pnpm test:contracts` passed | Non-escalated DB/tsx runs were sandbox-blocked and passed when rerun with local QA infra access |
| Frontend integration | Added Attendance domain API methods/hooks for the daily calendar, manager queue, and export job endpoints | Existing visible routes already use monthly calendar, exceptions, and Reports APIs; no extra screen rewrite was required for these completion aliases |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 216 operations across 191 paths | Planned operations remaining drop from 4 to 1; the remaining planned endpoint is `POST /api/v1/leave-wfh/exports` |

## Leave/WFH Export Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend API | Added `POST /api/v1/leave-wfh/exports` | Phase 6 now generates document-backed CSV/JSON/XLSX Leave/WFH exports for HR/Admin/Auditor actors |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, Leave/WFH integration test, and `pnpm test:contracts` passed | Non-escalated DB/tsx commands are sandbox-blocked in this environment; validation passed with local QA infra access |
| Frontend integration | Added Leave/WFH export API adapter/hook and connected `/leave-wfh/monitor` Export in API mode | API mode queues a backend export job; API-disabled development keeps the previous local CSV export |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 217 operations across 192 paths | Planned operations remaining drop from 1 to 0 |

## Phase 6 Verification Guardrails

| Area | Completed fact | Notes |
| --- | --- | --- |
| Implementation verifier | `scripts/verify-implementation.ts` now checks the full backend module manifest, app module registration, schema migrations, mutating-route auth guards, OpenAPI operation floor, zero planned API backlog, and synced frontend contract JSON | This replaces the old early-phase verifier that only covered the initial health/auth/core/expenses/documents/assets/timesheets modules |
| Scalability verifier | `scripts/verify-scalability.ts` now checks critical indexes across Core, Auth/session/outbox, Expenses, Documents, Assets, Asset workflows, Timesheets, Attendance, Leave/WFH, EMS, Projects, Helpdesk, Notifications, and Admin settings | This keeps the first Phase 6 guardrail scoped to source-controlled checks; deeper load/performance testing remains a separate production-hardening task |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm verify:implementation`, and `pnpm verify:scalability` passed | The two verifier scripts needed escalation only because `tsx` IPC pipe creation is blocked in the sandbox |
| Frontend production config guard | `hrms-client/scripts/production-config-guard.mjs` verifies production mode forces `mockFallback=false`, API mode defaults enabled, and env files do not set `VITE_API_MOCK_FALLBACK=true` or `VITE_API_ENABLED=false` | Added package script `pnpm api:production-config-guard` for repeatable frontend validation |
| Frontend validation | `pnpm api:production-config-guard`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, and route coverage passed | Lint still reports the existing 39 Fast Refresh warnings |

## Phase 6 API E2E Baseline

| Area | Completed fact | Notes |
| --- | --- | --- |
| API e2e smoke | Added `src/__tests__/production-user-flows.e2e.test.ts` to exercise key employee, manager, admin, and reporting workflows through the Fastify API against QA infra | Covers login/session, employee directory/detail, timesheet segment/submission, expense creation, dashboard approvals, attendance check-in/check-out, leave approval, EMS profile-change approval, project/member/utilization, helpdesk ticket creation, notifications read state, report summaries, and report export queue metadata |
| Seeded actors | Uses local demo credentials for employee, peer, and admin; manager uses the seeded `D1` helper session | The `reviewer@example.test` email/password path is not active in the current QA seed, so the smoke test uses the existing test helper for manager context instead of changing auth seed behavior |
| Backend validation | `pnpm test:e2e`, `pnpm typecheck`, `pnpm build`, and `pnpm lint` passed | First two e2e runs exposed seed/session and display-status expectations; the test was corrected to match current production API behavior before the passing run |
| Deferred coverage | Browser-level frontend e2e, scheduled exports, retention policy automation, and route-wide browser export-download assertions remain Phase 6 hardening work | The new smoke test is API-level coverage, not a replacement for Playwright/browser coverage |

## Phase 6 Browser E2E Baseline

| Area | Completed fact | Notes |
| --- | --- | --- |
| Playwright setup | Added `@playwright/test`, `playwright.config.ts`, and `pnpm test:e2e` scripts in `hrms-client` | The config starts the frontend in API mode with `VITE_API_ENABLED=true` and `VITE_API_MOCK_FALLBACK=false`; backend API must be running at `E2E_API_BASE_URL` |
| Browser smoke | Added `e2e/production-smoke.spec.ts` | Covers UI login, API-ready indicator, notification popover, employee self-service routes, HR/admin route rendering, Reports/Admin Settings, Projects, and Team Utilization |
| Frontend validation | `pnpm test:e2e`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, production config guard, and `pnpm build` passed | Playwright ran against QA infra plus a live backend server. Lint keeps 39 existing Fast Refresh warnings; build keeps existing chunk-size/Wrangler log warnings |
| Browser hardening | Expanded `e2e/production-smoke.spec.ts` | Adds API-backed Helpdesk ticket creation, mobile sidebar/navigation coverage, and generated backend report export download handoff checks for HR, attendance, leave/WFH, project, timesheet, expense, asset, helpdesk, and audit report routes |
| Frontend validation | `pnpm test:e2e`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, production config guard, and `pnpm build` passed | Playwright now runs 6 Chromium tests against QA backend API mode. The report query default was aligned to backend pagination max `page_size=100`; lint keeps 39 existing Fast Refresh warnings and build keeps existing chunk-size/Wrangler log warnings |
| Deferred coverage | Browser e2e now covers smoke, one create mutation, mobile shell navigation, and generated report downloads | Approval/decision flows and upload flows remain production hardening |

## Phase 6 Export File Generation

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend export generation | Added `src/platform/generated-exports.ts` and wired employee/core, report, attendance, and Leave/WFH export APIs to create supported-format document records through the configured object-storage adapter | Existing outbox events are still emitted for audit/retry visibility; unsupported XLSX requests remain queued metadata with `xlsx-renderer-pending` until a workbook renderer is selected |
| Backend download handoff | Export responses now return `status: "ready"`, Cloudinary-prefixed adapters such as `cloudinary-generated-csv`, `download_document_id`, file name, row count, size bytes, and generated timestamp for supported formats | Secure download still goes through `POST /api/v1/documents/{id}/download-url`; object-storage credentials are not exposed |
| Frontend export handoff | `/employees`, `/leave-wfh/monitor`, and route-wide `/reports/*` `ReportShell` export buttons now request a Documents API download URL when a backend export response includes `download_document_id` | Local CSV generation remains only for API-disabled development mode; browser e2e should still add explicit download assertions |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, report/core/attendance/Leave-WFH integration tests, `pnpm test:contracts`, and `pnpm test:e2e` passed | The first combined integration command was stopped after stalling on shared DB resets; the same affected suites passed one at a time with verbose output |
| Frontend validation | `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, production config guard, implemented-route guard, route coverage, and `pnpm build` passed | Lint keeps 39 existing Fast Refresh warnings; build exits 0 with the existing chunk-size and Wrangler log warnings |

## Phase 6 Document Upload Compression Hardening

| Area | Completed fact | Notes |
| --- | --- | --- |
| Frontend upload preparation | Added `src/shared/uploads/documents.ts` and reused it from EMS documents and expense create attachments | Browser image uploads are compressed to JPEG when smaller and all selected files are checked against the backend 10 MB multipart limit before submission/attachment |
| Backend PDF compression | Added `src/platform/pdf-compression.ts` and wired `DocumentService.upload` to compress detected PDFs before object storage | Uses Ghostscript through `PDF_COMPRESSION_*` env keys. `PDF_COMPRESSION_FAIL_OPEN=true` keeps uploads available if Ghostscript is missing or compression fails, while metadata records attempted/compressed/reason/size fields |
| Runtime/deployment wiring | Added PDF compression and Cloudinary env keys to tracked examples and Docker compose runtime anchors, removed the legacy object-storage service/dependencies from local/QA/prod compose files, and installed `ghostscript` in the backend Docker image | Local/test/QA use Cloudinary mock mode and do not require external credentials; production examples require real Cloudinary credentials with `CLOUDINARY_MOCK_UPLOADS=false` |
| Documentation | Updated README and Documents API guide | Documented that frontend image compression reduces browser-to-backend upload size, while server PDF compression reduces backend-to-object-storage stored/download size after the original upload reaches the backend |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test:unit -- --runInBand`, `pnpm api:docs:verify`, and `pnpm docker:prod:config` passed | `pnpm lint` and `pnpm api:docs:verify` needed escalation because `tsx` IPC sockets are blocked in the sandbox; no OpenAPI operation count changed |
| Upload journey verification | Expanded the Documents integration suite to use real multipart payloads for PDF, image, and text/general file uploads, plus expense and EMS wrapper uploads | Verified upload, object-storage stat, list visibility, EMS list wrapper, download-url handoff, expense document attachment, provider metadata, and PDF compression fail-open metadata |
| Frontend validation | `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, and `pnpm build` passed | Lint keeps 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |

## Admin Notification Channels Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.notifications.tsx` renders notification event rows with In-app, Email, and Push toggles | Replace production-critical localStorage toggles with backend-backed read/update in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` persists notifications to `hawkaii_admin_notifications_v1` | Keep localStorage behavior only when API mode is disabled |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `PUT /api/v1/admin/notification-channels` as planned | Implement `PUT` plus a UI-required `GET /api/v1/admin/notification-channels` so the screen can load current backend settings |
| Existing backend support | User notification feed APIs and `platform.notifications` already exist for topbar read-state | Add separate Admin settings persistence for channel/event preferences; do not change feed delivery behavior in this slice |
| Deferred scope | Provider secrets, SMTP/push delivery setup, runtime notification dispatch filtering, and per-user preferences are not represented in the current UI | Persist Admin Settings channel preferences only and document runtime enforcement as later delivery-provider hardening |

## Admin Company Profile Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.company.tsx` renders the Company settings form for name, website, industry, address, timezone, currency, fiscal-year start, working week, work hours, and logo label | Replace production-critical local save with backend-backed read/update in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` initializes company settings from `localStorage` key `hawkaii_admin_company_v1` and `DEFAULT_COMPANY` | Keep local storage behavior only when the backend API is disabled or explicit non-production fallback is active |
| Existing frontend API domain | `hrms-client/src/domains/admin/api.ts` only covers finance governance, manager backups, and timesheet workflow definition calls | Add company profile read/update adapter and React Query hooks |
| Existing backend data | `platform.company_profiles` exists from onboarding with core fields: company name, slug, timezone, locale, fiscal-year month, status, bootstrap timestamps, and version | Extend the table/model with settings needed by the active Company UI while preserving existing auth/onboarding behavior |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/admin/company-profile` and `PUT /api/v1/admin/company-profile` as planned | Implement these two endpoints with Admin-only access, OCC on update, OpenAPI docs, and integration tests |
| Risks | Existing seeded local stores can have no persisted company profile because auth falls back to a default context | Admin profile service should create/return a safe default read model when no profile exists, then persist on update |

## Helpdesk Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend routes | `hrms-client/src/routes/_app/helpdesk*.tsx` provides dashboard, my tickets, agent queue, ticket detail, categories, SLA, and reports views | Replace production-critical localStorage data with backend-backed domain adapter/store |
| Current data source | `hrms-client/src/lib/helpdesk-store.tsx` persists tickets/categories to `hawkaii_tickets_v1` and `hawkaii_helpdesk_categories_v1` | Keep only explicit non-production fallback after API integration |
| Mock model | `hrms-client/src/lib/mock/helpdesk.ts` defines categories, priorities, statuses, comments, attachments, events, SLA matrix, and seeded tickets | Mirror visible model in backend response mapping so layout/styling stays stable |
| Visible actions | Raise ticket, add public comment, add internal note, add attachment reference, change priority, assign/reassign, set status, resolve, close, reopen, escalate, edit/toggle categories, view SLA/report rollups | Implement the smallest complete Helpdesk API slice that supports these actions |
| Planned backend contract | Gap report lists 15 operations: create/list/get/update tickets; comments, internal notes, attachments; assign, priority, status, resolve, close, reopen; categories; SLA report | Implement these 15 operations under `/api/v1/helpdesk/*` with OpenAPI docs/tests |
| Role expectations | UI scopes queue by admin/helpdesk/asset/HR/finance roles and category ownership | Backend policy should allow requesters to manage their own tickets, admins to manage all, and category/assignee roles to manage scoped queues |
| Risks | No existing Helpdesk DB schema/module; UI uses friendly category/priority labels while backend patterns usually use constants and versioned writes | Add new schema/migration without cross-schema FKs; include OCC versions on mutations; document any label mapping |

## Helpdesk API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/helpdesk/tickets` | Raise ticket drawer | Creates requester ticket with category SLA and optional document IDs |
| `GET` | `/api/v1/helpdesk/tickets` | Helpdesk dashboard, my tickets, queue, reports | Supports requester, assignee, admin/support scope filters and returns queue counts |
| `GET` | `/api/v1/helpdesk/tickets/{id}` | `/helpdesk/$id` detail | Returns ticket, visible comments, attachments, events, category, SLA, and version |
| `PATCH` | `/api/v1/helpdesk/tickets/{id}` | Domain adapter available | Versioned subject/description/category/priority update within policy |
| `POST` | `/api/v1/helpdesk/tickets/{id}/comments` | Ticket detail public comments | Adds requester/support visible comment |
| `POST` | `/api/v1/helpdesk/tickets/{id}/internal-notes` | Ticket detail support note | Adds support-only note; hidden from requester detail |
| `POST` | `/api/v1/helpdesk/tickets/{id}/attachments` | Ticket detail attachment reference | Adds document reference metadata to the ticket |
| `POST` | `/api/v1/helpdesk/tickets/{id}/assign` | Agent queue/detail assignment | Assigns or reassigns ticket with OCC version checks |
| `POST` | `/api/v1/helpdesk/tickets/{id}/priority` | Agent queue/detail priority controls | Updates priority and SLA; urgent priority escalates when appropriate |
| `POST` | `/api/v1/helpdesk/tickets/{id}/status` | Queue/detail status controls and escalate action | Changes operational status with transition and remarks validation |
| `POST` | `/api/v1/helpdesk/tickets/{id}/resolve` | Queue/detail resolve action | Resolves ticket with resolution text |
| `POST` | `/api/v1/helpdesk/tickets/{id}/close` | Ticket detail close action | Closes resolved tickets from requester/admin scope |
| `POST` | `/api/v1/helpdesk/tickets/{id}/reopen` | Ticket detail reopen action | Reopens closed/resolved tickets within the configured policy window |
| `GET` | `/api/v1/helpdesk/categories` | Helpdesk category screens and ticket form | Lists active/inactive category metadata and SLA hints |
| `POST` | `/api/v1/helpdesk/categories` | Helpdesk category configuration | Creates a supported category-key configuration when the key is not already configured |
| `PATCH` | `/api/v1/helpdesk/categories/{id}` | Helpdesk category edit/toggle actions | Versioned update for label, assignment hints, team, active flag, and sub-category metadata |
| `GET` | `/api/v1/helpdesk/sla-report` | Helpdesk SLA/report screens | Returns SLA rollups and per-category/assignee report rows |

Phase 6 completed Helpdesk category create/update/toggle configuration. Broader `/api/v1/reports/helpdesk/summary` was completed later in the non-expense Reports slice.

## Phase 6 Helpdesk Category Configuration Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `POST /api/v1/helpdesk/categories` and `PATCH /api/v1/helpdesk/categories/{id}` | Mutations require a Helpdesk manager/Admin-style actor and use optimistic concurrency on update |
| Frontend integration | `/helpdesk/categories` create/edit/toggle actions now call the Helpdesk category APIs in API mode | API-disabled development keeps the local category store behavior |
| Contract docs | Backend and frontend OpenAPI/frontend contract docs now show 219 operations across 193 paths | Planned operations remaining stays at 0 |
| Validation | Backend typecheck/build/lint/docs/consumer checks, DB migration/FK checks, focused Helpdesk integration test, contract tests, frontend typecheck/lint/route guards/route coverage/build passed | A first parallel contract/helpdesk run deadlocked during DB reset; the focused test and contract suite passed when rerun serially |
| Deferred scope | Arbitrary new category keys remain deferred until the Helpdesk ticket category enum and role-scope model are generalized | Current create API accepts the existing supported category-key set and returns conflict for seeded duplicate keys |

## Phase 6 Deployment And Security Hardening

| Area | Completed fact | Notes |
| --- | --- | --- |
| Security headers | Added `securityHeadersPlugin` with `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and production/HSTS headers | This is a baseline API hardening layer and does not replace edge/WAF policy |
| Production CORS | Added `CORS_ALLOWED_ORIGINS` config. Development/QA can keep permissive local CORS when no allowlist is configured; production only reflects explicitly configured origins | Prevents credentialed production CORS from reflecting arbitrary origins |
| Compose/env wiring | Added `CORS_ALLOWED_ORIGINS` to dev/QA/prod compose environments and env examples | `docker compose --env-file .env.prod.example -f infra/docker/docker-compose.prod.yml -p hawkaii_hrms_backend_prod config` validates the tracked example configuration |
| Deployment verifier | Updated `scripts/verify-dev-deployment.ts` to expect `hawkaii-hrms-api`, `hawkaii-hrms-migrate`, and `hawkaii-hrms-outbox-worker` by default, with env overrides for alternate compose service names | Fixes stale verifier assumptions left from the old `api`/`migrate`/`outbox-worker` service IDs |
| Observability | Added `LOG_LEVEL` env wiring and production-safe Fastify/Pino logger options with redaction for authorization, cookies, API keys, tokens, passwords, and JWT secret fields | Existing `x-request-id` response propagation remains the request correlation mechanism |
| Validation | Backend typecheck, build, lint, implementation guard, contract tests, QA migration, and prod compose config parsing passed | Local untracked `.env.prod` still lacks `CORS_ALLOWED_ORIGINS` and contains `API_BASE_URL=http://api:3001`; operators should sync it from `.env.prod.example` before using `pnpm docker:prod:*` locally |

## Phase 6 Backup And Restore Scripts

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backup command | Added `pnpm backup:db`, backed by `scripts/backup-db.ts` | Uses `pg_dump --format=custom --no-owner --no-privileges`, writes to `HRMS_BACKUP_DIR` or `backups/`, and creates a SHA-256 manifest |
| Restore command | Added `pnpm restore:db`, backed by `scripts/restore-db.ts` | Requires `HRMS_RESTORE_FILE` and explicit `HRMS_RESTORE_CONFIRM=restore`; supports `RESTORE_DATABASE_URL` override |
| Repository hygiene | Added `backups/` to `.gitignore` | Prevents local dump files and manifests from being committed |
| Validation | `pnpm typecheck`, `pnpm build`, and `pnpm lint` passed | Live backup/restore execution was not run because `pg_dump`/`pg_restore` are not installed on this host PATH |

## Notifications Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend surface | `hrms-client/src/components/ui-kit/notification-panel.tsx` renders the topbar notification popover on every app route | Replace static `NOTIFICATIONS` reads with backend-backed queries in API mode |
| Current data source | `hrms-client/src/lib/mock/notifications.ts` supplied static read/unread rows | Keep static rows only as explicit non-production fallback |
| Visible actions | Topbar shows unread badge, lists feed rows, marks one notification read by clicking it, and marks all visible rows read | Implement feed, unread count, mark-read, and mark-all-read endpoints |
| Planned backend contract | Gap report listed 4 notification operations under `/api/v1/notifications*` | Implement those 4 operations with OpenAPI docs/tests |
| Existing backend data | Workflow code already writes notification records into the in-memory store; no durable table existed before this slice | Add `platform.notifications` migration, persistence loading/flushing, and owner-scoped service/repository |
| Deferred scope | Topbar notification read-state is separate from Admin notification channel preferences | Runtime delivery-provider filtering remains production hardening; Admin channel preferences are completed in Phase 5 |

## Notifications API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/notifications` | Topbar notification popover | Lists owned notifications with pagination, unread-only, and type/category filters |
| `GET` | `/api/v1/notifications/unread-count` | Topbar unread badge | Returns unread count and latest unread timestamp |
| `POST` | `/api/v1/notifications/{id}/read` | Clicking an unread notification | Owner-scoped read-state mutation with optional `expected_version` OCC |
| `POST` | `/api/v1/notifications/read-all` | Mark all read action | Marks all visible unread notifications read, optionally filtered by type or timestamp |

## Asset Workflow Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend routes | `hrms-client/src/routes/_app/assets*.tsx` exposes inventory, my assets, requests, returns/recovery, warranty/vendors, and detail/maintenance views | Replace production-critical mock/local request, acknowledgement, maintenance, vendor, and recovery behavior with backend APIs in API mode |
| Current data source before slice | `hrms-client/src/lib/assets-store.tsx` hydrated assets from existing backend APIs but kept requests, acknowledgements, maintenance additions, vendors, and recovery rows in local/mock state | Add backend endpoints and map visible UI actions through `src/domains/assets/api.ts` |
| Visible actions | Request asset, approve/reject/fulfill/cancel requests, acknowledge assignment, add maintenance, list vendors, and review recovery queue | Implement a minimal workflow slice with OCC on request decisions/cancellations |
| Existing backend support | Base asset inventory, assignment, return, and license APIs already existed | Extend, do not replace, the existing assets module and persistence model |
| Deferred scope | Warranty renewal automation, vendor delete/deactivation beyond status updates, advanced settlement accounting, and asset reports are broader admin/report features | Vendor create/update and recovery settlement are now completed; keep the remaining items for production hardening unless current UI requires them |

## Asset Workflow API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/assets/requests` | `/assets/requests` request form | Creates a requester-scoped asset request |
| `GET` | `/api/v1/assets/requests/my` | `/assets/requests` employee view | Lists the signed-in user's asset requests |
| `GET` | `/api/v1/assets/requests/queue` | `/assets/requests` asset admin queue | Lists approval/fulfillment queue rows |
| `POST` | `/api/v1/assets/requests/{id}/decision` | Asset manager approval/rejection/fulfillment controls | Versioned request decision with optional remarks and assigned asset |
| `POST` | `/api/v1/assets/requests/{id}/cancel` | Requester cancellation | Versioned cancellation for pending requests |
| `POST` | `/api/v1/assets/{id}/acknowledgements` | `/assets/my` acknowledgement action | Records asset assignment acknowledgement |
| `GET` | `/api/v1/assets/{id}/maintenance` | `/assets/$id` maintenance tab | Lists asset maintenance records |
| `POST` | `/api/v1/assets/{id}/maintenance` | `/assets/$id` maintenance entry form | Adds a maintenance record and updates asset status when applicable |
| `GET` | `/api/v1/assets/vendors` | `/assets/warranty` vendor selector/cards | Lists software/hardware vendor metadata |
| `POST` | `/api/v1/assets/vendors` | `/assets/warranty` add vendor action | Creates a vendor or warranty partner |
| `PATCH` | `/api/v1/assets/vendors/{id}` | `/assets/warranty` edit vendor action | Versioned update of vendor contact/status details |
| `GET` | `/api/v1/assets/recovery-queue` | `/assets/returns` recovery queue | Lists assets assigned to inactive or terminated users |
| `POST` | `/api/v1/assets/recovery-queue/{id}/settlement` | `/assets/returns` mark returned action | Versioned recovery settlement that closes the ticket and updates linked asset assignment/status |

## Timesheet Enhancements Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Existing backend | `src/modules/timesheets` already implements work segments, my submissions, approver queue, approve/return/reject decisions, and workflow definitions | Extend the module with the 5 planned read endpoints instead of replacing existing workflow behavior |
| Planned contract gap | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists project summaries, missing submissions, productivity summary, submission detail, and selectors as planned Timesheet APIs | Implement those endpoints under `/api/v1/timesheets/*` with OpenAPI/docs/tests |
| Frontend routes | `hrms-client/src/routes/_app/timesheet.index.tsx`, `timesheet.approvals.tsx`, `timesheet.projects.tsx`, and `reports.timesheet.tsx` use `src/lib/timesheets-store.tsx` plus client aggregation | Add API adapter/store support so project view, missing submissions, productivity, and selectors use backend data in API mode |
| Current frontend data source | Segments, my submissions, and approval queue are API-backed in API mode; project summaries, missing submissions, productivity, and selectors are still derived from local store/project data | Keep explicit local fallback only through existing non-production config |
| Visible actions | My timesheet save/submit and manager approve/return/reject are already wired to backend APIs; project view and reports need backend rollups | Implement read-oriented APIs first; no new mutation surface is needed for this slice |
| Deferred scope | Export jobs and full timesheet report endpoints remain part of Phase 5 reports | Keep CSV/export behavior client-side for now unless report APIs are implemented later |

## Timesheet Enhancements API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/timesheets/projects/summary` | `/timesheet/projects`, `/reports/timesheet` project-wise rollup | Returns project/member submitted hours, billable split, missing submissions, and totals |
| `GET` | `/api/v1/timesheets/missing-submissions` | `/timesheet/approvals` missing tab | Returns visible missing or under-submitted cycles with manager/reminder context |
| `GET` | `/api/v1/timesheets/productivity-summary` | `/reports/timesheet` productivity tab | Returns backend-derived cards, series, and grouped breakdown rows |
| `GET` | `/api/v1/timesheets/submissions/{id}` | Domain adapter/detail-ready workflow | Returns visible submission detail, segments, workflow history, and latest decision |
| `GET` | `/api/v1/timesheets/selectors` | `/timesheet` forms | Returns visible projects, task selectors, cycles, approvers, workflow definitions, and rules |

## Expense Enhancements Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Existing backend | `src/modules/expenses` already implements create, my list, detail, submit, manager queue/decision, finance queue/detail/decision/payment/bills/settlement, document verification, timeline, audit, and expense reports | Extend the existing module with the 4 planned read/mutation endpoints rather than replacing workflow behavior |
| Planned contract gap | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists 4 Expenses/Finance additions: metadata, dashboard summary, withdraw, and clarification thread | Implement those endpoints under `/api/v1/expenses/*` with OpenAPI docs/tests |
| Frontend routes | `hrms-client/src/routes/_app/expenses*.tsx` exposes dashboard cards, create form selectors, my expenses withdraw action, detail comments tab, manager review, finance queue, register, and reports | Wire metadata, dashboard summary, withdraw, and comments/clarifications through the expense domain adapter in API mode |
| Current frontend data source | Expense create/list/manager/finance workflow has API calls in API mode, but dashboard cards are client-aggregated, withdraw is local-only, comments are local-only, and form metadata is static/free text | Replace production-critical local behavior with backend APIs while keeping existing non-production fallback path |
| Persistence | Expense audit logs are already durable in memory/Postgres and include event payload JSON | Store clarification thread entries as expense audit events to avoid a new table for this small slice |
| Risks | Existing frontend maps backend `Cancelled` to closed, while the UI has a separate `withdrawn` status | Update frontend mapping when withdraw API is integrated |

## Expense Enhancements API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/expenses/metadata` | `/expenses/create` selectors/forms | Returns expense types, subtype groups, payment types, currencies, document requirements, policy hints, and project/client selector metadata |
| `GET` | `/api/v1/expenses/dashboard-summary` | `/expenses` dashboard | Returns role-aware cards, queue counts, aging buckets, totals, and compact rows derived from visible expense tickets |
| `POST` | `/api/v1/expenses/{id}/withdraw` | `/expenses/my`, `/expenses/$id` requester action | Requester-only withdrawal for draft, submitted, pending-manager, or manager-returned tickets with OCC and remarks policy |
| `POST` | `/api/v1/expenses/{id}/clarifications` | `/expenses/$id` comments/clarification tab | Appends a durable clarification message and returns the current object-scoped thread |

## Admin Company Profile API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/company-profile` | `/admin-settings/company` initial form load | Returns active company profile, locale/fiscal settings, working week, work hours, logo label, and version |
| `PUT` | `/api/v1/admin/company-profile` | `/admin-settings/company` save action | Admin-only optimistic-concurrency update for company profile/settings while keeping company slug stable |

## Admin Master Data Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists six planned Admin Settings endpoints for departments/designations only: list, create, and patch for each resource | Implement the six planned endpoints under `/api/v1/admin/master-data/*`; do not invent APIs for other master-data tabs in this slice |
| Existing backend model | `core.departments` and `core.designations` already exist and are exposed read-only through `/api/v1/core/master-data/org-selectors`; they do not yet expose admin mutation APIs | Reuse the existing core data model, add version columns for optimistic concurrency, and emit admin master-data outbox events |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.master-data.tsx` shows ten tabs, but only `departments` and `designations` have planned backend endpoints | Connect departments/designations to backend APIs in API mode; keep unsupported tabs local/deferred and avoid silently claiming production persistence |
| Current frontend data source | `hrms-client/src/lib/admin-settings-store.tsx` persists master rows in `localStorage` key `hawkaii_admin_masters_v1` | Replace production-critical department/designation local mutations with backend-backed list/create/update/toggle behavior |
| Visible actions | The UI supports list/search, add, edit, activate/deactivate, and delete | Map delete/deactivate behavior to versioned `PATCH status=inactive`; no hard-delete endpoint is planned |
| Deferred scope | Employment types, work locations, shifts, leave types, expense categories, asset categories, helpdesk categories, and project roles do not have planned APIs in the current contract | Leave these tabs deferred until later Admin/policy modules define persistent backend behavior |

## Admin Master Data API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/master-data/departments` | `/admin-settings/master-data` departments tab | Lists departments with pagination, search, and active-only filtering |
| `POST` | `/api/v1/admin/master-data/departments` | `/admin-settings/master-data` add department action | Creates a department with duplicate-code protection |
| `PATCH` | `/api/v1/admin/master-data/departments/{id}` | `/admin-settings/master-data` edit/activate/deactivate department actions | Versioned update; deactivation is blocked while active employees reference the department |
| `GET` | `/api/v1/admin/master-data/designations` | `/admin-settings/master-data` designations tab | Lists designations with pagination, search, and active-only filtering |
| `POST` | `/api/v1/admin/master-data/designations` | `/admin-settings/master-data` add designation action | Creates a designation with duplicate-code protection |
| `PATCH` | `/api/v1/admin/master-data/designations/{id}` | `/admin-settings/master-data` edit/activate/deactivate designation actions | Versioned update; deactivation is blocked while active employees reference the designation |

## Admin RBAC Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists five RBAC endpoints under `/api/v1/admin/rbac/*`: list/create/update roles, list permissions, and replace role permissions | Implement the five planned endpoints with Admin-only access, OCC, OpenAPI docs, and integration tests |
| Existing backend auth | Runtime auth currently uses fixed `Roles` and `Permissions` constants for login/session/navigation and role checks | Implement persistent RBAC configuration without changing existing authorization enforcement semantics in this slice; document dynamic enforcement as a later hardening item |
| Existing backend data | `core.roles` and `core.user_roles` exist; `core.roles` currently lacks description/status/builtin/version and there is no role-permission table | Extend `core.roles`, add a role-permission mapping table, seed defaults from existing role constants, and preserve no-cross-schema-FK policy |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.roles.tsx` renders role cards, role metadata editing, and a permission matrix | Replace localStorage-backed role matrix with RBAC API reads/saves in API mode while keeping local fallback only when API mode is disabled |
| Current frontend data source | `hrms-client/src/lib/admin-settings-store.tsx` persists role config in `localStorage` key `hawkaii_admin_roles_v1` | Wire role list, permission catalog, metadata update, and permission replacement through `src/domains/admin/*` |
| Deferred scope | Assigning custom RBAC roles to users and using edited permission matrices for runtime route/API enforcement requires a broader authorization-policy migration | Keep employee role assignment backed by existing Core user roles until that migration is explicitly designed |

## Admin RBAC API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/rbac/roles` | `/admin-settings/roles` role cards and active role editor | Lists persistent role configuration with assigned user counts, permission IDs, protected-role flags, and pagination |
| `POST` | `/api/v1/admin/rbac/roles` | `/admin-settings/roles` add-role modal | Creates custom RBAC role configuration with initial permission IDs and duplicate key protection |
| `PATCH` | `/api/v1/admin/rbac/roles/{id}` | `/admin-settings/roles` role metadata editor | Versioned role name/description/status update; built-in Admin cannot be deactivated |
| `GET` | `/api/v1/admin/rbac/permissions` | `/admin-settings/roles` permission matrix catalog | Lists supported permission groups/actions used by the matrix UI |
| `PUT` | `/api/v1/admin/rbac/roles/{id}/permissions` | `/admin-settings/roles` save permissions | Replaces custom-role permission IDs with OCC; built-in Admin permissions are protected |

Deferred from this RBAC slice: edited permission matrices are persisted for Admin Settings configuration but runtime authorization still uses the existing fixed backend role and permission policy. Migrating route/API enforcement and employee custom-role assignment to dynamic RBAC is a later security architecture slice.

## Admin Workflow Config Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.workflows.tsx` renders Approval Workflows for leave, WFH, timesheet, expense, asset request, and helpdesk escalation | Replace localStorage-only workflow configuration with backend-backed reads/saves in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` persists workflows to `hawkaii_admin_workflows_v1` with active flags and linear stage lists | Keep local behavior only when API mode is disabled |
| Visible actions | Toggle workflow active/disabled, add/remove stages, change approver type/value, edit escalation days, and toggle mandatory rejection remarks | Implement list/update APIs that persist full workflow configuration with OCC |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/admin/workflows` and `PUT /api/v1/admin/workflows/{workflow_key}` | Implement these two endpoints with Admin-only access, OpenAPI docs, persistence, and integration tests |
| Existing backend behavior | Runtime workflow decisions are still implemented inside each feature module; the Admin settings screen currently has no backend persistence | Persist configuration for Admin Settings without changing feature runtime approval routing in this slice |
| Risks | Current UI stage IDs are client-generated and not tied to live approval engines | Normalize stage shape on the backend and document runtime enforcement as deferred |

## Projects / Utilization API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/projects` | `/projects` add project drawer | Create project metadata with assigned manager |
| `GET` | `/api/v1/projects` | `/projects`, project store consumers | List visible projects with members, allocations, milestones, documents, and summary in API mode |
| `GET` | `/api/v1/projects/{id}` | `/projects/$id` | Project detail with include support |
| `PATCH` | `/api/v1/projects/{id}` | `/projects`, `/projects/$id` | Versioned project metadata/status update |
| `POST` | `/api/v1/projects/{id}/archive` | Domain adapter available | Archive project after active members are cleared or project is closed/paused |
| `GET` | `/api/v1/projects/{id}/members` | Domain adapter available | List project members |
| `POST` | `/api/v1/projects/{id}/members` | Project drawer team step | Add member and create initial allocation |
| `PATCH` | `/api/v1/projects/{id}/members/{member_id}` | Project drawer/team removal | Versioned member update/remove |
| `GET` | `/api/v1/projects/{id}/allocations` | Domain adapter available | Allocation history/list |
| `POST` | `/api/v1/projects/{id}/allocations` | Domain adapter available | Add allocation history row and update member allocation |
| `GET` | `/api/v1/projects/{id}/milestones` | Domain adapter available | List milestones/modules |
| `POST` | `/api/v1/projects/{id}/milestones` | Domain adapter available | Add milestone/module |
| `GET` | `/api/v1/projects/{id}/documents` | `/projects/$id` documents tab | Lists existing document records attached to business object type `project` |
| `GET` | `/api/v1/projects/{id}/summary` | `/projects/$id` | Project timesheet, expense, and allocation summary |
| `GET` | `/api/v1/team-utilization/summary` | `/team-utilization` | Capacity, allocation, submitted hours, bench, and overload analytics |

Deferred from the original Projects/utilization plan: richer project reports, project-specific timesheet submission detail, and upload/attach document UX remain planned for later report/document hardening phases.

## Task Table

| Phase | Feature/module | Task | Backend status | Frontend status | Tests run | Result | Files changed | Suggested/actual commit message |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | Attendance | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, dashboard integration regression, `pnpm test:contracts` | Passed. One parallel contract run raced with DB reset; rerun alone passed. | `src/modules/attendance/*`, `src/db/migrations/0003_attendance.sql`, shared schemas/types/constants, store persistence, dashboard summary, OpenAPI/docs/contracts | `feat(attendance): implement attendance APIs` |
| 3 | Attendance | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build`, offline frozen lockfile check, legacy-client search | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/attendance/*`, attendance routes, frontend API docs, dependency/env cleanup, deleted legacy external data-client files | `feat(attendance): connect attendance screens to backend APIs` |
| 3 | Leave/WFH/Holidays | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, leave/WFH integration test, dashboard integration regression, attendance/core integration regressions, `pnpm test:contracts` | Passed. First non-escalated DB test failed due sandbox network restriction, rerun with test infra access passed. | `src/modules/leave-wfh/*`, `src/db/migrations/0004_leave_wfh.sql`, shared schemas/types/constants, store persistence, dashboard/core summaries, OpenAPI/docs/contracts | `feat(leave): implement leave WFH and holiday APIs` |
| 3 | Leave/WFH/Holidays | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/leave-wfh/*`, leave/WFH routes, status badge, leave store typing, frontend API docs | `feat(leave): connect leave WFH and holiday screens to backend APIs` |
| 3 | EMS | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, `pnpm test:contracts` | Passed. First non-escalated EMS test failed due sandbox DB networking; rerun with test infra access passed. | `src/modules/ems/*`, `src/db/migrations/0005_ems.sql`, shared schemas/types/constants, store persistence, OpenAPI/docs/contracts | `feat(ems): implement employee self-service APIs` |
| 3 | EMS | Integrate frontend routes | Completed in `hrms-client` | Completed for visible EMS profile/request/letter/policy/admin queues | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/ems/*`, EMS route files, frontend API docs | `feat(ems): connect employee self-service screens to backend APIs` |
| 4 | Projects/utilization | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, projects integration test, `pnpm test:contracts` | Passed. Non-escalated Docker/DB/tsx commands were blocked by sandbox and passed when rerun with allowed infra access. | `src/modules/projects/*`, `src/db/migrations/0006_projects.sql`, shared schemas/types/constants, store persistence, OpenAPI/docs/contracts | `feat(projects): implement project and utilization APIs` |
| 4 | Projects/utilization | Integrate frontend routes | Completed in `hrms-client` | Completed for `/projects`, `/projects/$id`, and `/team-utilization` | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint now has 39 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/projects/*`, `src/lib/projects-store.tsx`, project routes, project form drawer, frontend API docs | `feat(projects): connect project and utilization screens to backend APIs` |
| 4 | Helpdesk | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, Helpdesk integration test, `pnpm test:contracts` | Passed. The FK verifier was fixed to load test env defaults and use `TEST_DATABASE_URL`; non-escalated DB/test runs are sandbox-blocked but reruns with local DB access passed against the QA stack. | `src/modules/helpdesk/*`, `src/db/migrations/0007_helpdesk.sql`, shared schemas/types/constants, store persistence, OpenAPI/docs/contracts, `scripts/verify-no-cross-schema-fks.ts` | `feat(helpdesk): implement helpdesk APIs` |
| 4 | Helpdesk | Integrate frontend routes | Completed in `hrms-client` | Completed for `/helpdesk`, `/helpdesk/my`, `/helpdesk/queue`, `/helpdesk/$id`, `/helpdesk/categories`, `/helpdesk/sla`, and `/helpdesk/reports` | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/helpdesk/*`, `src/lib/helpdesk-store.tsx`, Helpdesk routes/components, frontend API docs | `feat(helpdesk): connect helpdesk screens to backend APIs` |
| 4 | Notifications | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, Notifications integration test, `pnpm test:contracts` | Passed. Non-escalated DB/tsx runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/notifications/*`, `src/db/migrations/0008_notifications.sql`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(notifications): implement notification feed APIs` |
| 4 | Notifications | Integrate topbar panel | Completed in `hrms-client` | Completed for the topbar notification panel in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/notifications/*`, `src/components/ui-kit/notification-panel.tsx`, `src/lib/mock/notifications.ts`, frontend API docs | `feat(notifications): connect topbar notifications to backend APIs` |
| 4 | Asset workflows | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, assets integration test, `pnpm test:contracts` | Passed. OpenAPI generated 165 operations across 147 paths. | `src/db/migrations/0009_asset_workflows.sql`, `src/modules/assets/*`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(assets): implement asset workflow APIs` |
| 4 | Asset workflows | Integrate frontend asset screens | Completed in `hrms-client` | Completed for requests, acknowledgements, maintenance, vendors, and recovery queue in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/assets/*`, `src/lib/assets-store.tsx`, `src/lib/mock/assets.ts`, frontend API docs | `feat(assets): connect asset workflow screens to backend APIs` |
| 4 | Timesheet enhancements | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, timesheets integration test, `pnpm test:contracts` | Passed. OpenAPI generated 170 operations across 152 paths. Non-escalated DB/tsx runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/timesheets/*`, OpenAPI/docs/contracts | `feat(timesheets): implement timesheet analytics APIs` |
| 4 | Timesheet enhancements | Integrate frontend timesheet screens | Completed in `hrms-client` | Completed for project view, missing submission queue, productivity/project report rollups, and form selectors in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/timesheets/*`, `src/routes/_app/timesheet*.tsx`, `src/routes/_app/reports.timesheet.tsx`, frontend API docs | `feat(timesheets): connect timesheet analytics screens to backend APIs` |
| 4 | Expense enhancements | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, expense integration test, `pnpm test:contracts` | Passed. OpenAPI generated 174 operations across 156 paths. Non-escalated DB/tsx runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/expenses/*`, OpenAPI/docs/contracts | `feat(expenses): implement metadata summary withdraw and clarifications` |
| 4 | Expense enhancements | Integrate frontend expense screens | Completed in `hrms-client` | Completed for create metadata, dashboard summary, withdraw action, and clarification comments in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/expenses/*`, `src/lib/expenses-store.tsx`, expense routes, frontend API docs | `feat(expenses): connect metadata summary and clarification flows` |
| 5 | Admin company profile/settings | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin company integration test, `pnpm test:contracts` | Passed. OpenAPI generated 176 operations across 157 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0010_admin_company_profile.sql`, company profile persistence/model, OpenAPI/docs/contracts | `feat(admin): implement company profile settings APIs` |
| 5 | Admin company profile/settings | Integrate frontend company settings screen | Completed in `hrms-client` | Completed for `/admin-settings/company` read/update in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.company.tsx`, frontend API docs | `feat(admin): connect company settings to backend API` |
| 5 | Admin master data | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin master-data integration test, `pnpm test:contracts` | Passed. OpenAPI generated 182 operations across 161 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0011_admin_master_data.sql`, `src/shared/types.ts`, `src/db/schema.ts`, core persistence, OpenAPI/docs/contracts | `feat(admin): implement master data settings APIs` |
| 5 | Admin master data | Integrate frontend master-data screen | Completed in `hrms-client` | Completed for `/admin-settings/master-data` departments/designations in API mode; unsupported master groups are explicitly deferred in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.master-data.tsx`, frontend API docs | `feat(admin): connect master data settings to backend API` |
| 5 | Admin RBAC | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin RBAC integration test, `pnpm test:contracts` | Passed. OpenAPI generated 187 operations across 165 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0012_admin_rbac.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement RBAC settings APIs` |
| 5 | Admin RBAC | Integrate frontend roles screen | Completed in `hrms-client` | Completed for `/admin-settings/roles` list/create/update/permission replacement in API mode; local store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.roles.tsx`, frontend API docs | `feat(admin): connect RBAC settings to backend API` |
| 5 | Admin workflow configurations | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin workflow integration test, `pnpm test:contracts` | Passed. OpenAPI generated 189 operations across 167 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0013_admin_workflows.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement workflow settings APIs` |
| 5 | Admin workflow configurations | Integrate frontend workflow screen | Completed in `hrms-client` | Completed for `/admin-settings/workflows` list/edit/save in API mode; local workflow store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.workflows.tsx`, frontend API docs | `feat(admin): connect workflow settings to backend API` |
| 5 | Admin policies | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin policy integration test, `pnpm test:contracts` | Passed. OpenAPI generated 191 operations across 169 paths. One contract rerun was needed after removing the non-paginated policy list from the pagination-only assertion. | `src/modules/admin/*`, `src/db/migrations/0014_admin_policies.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement policy settings APIs` |
| 5 | Admin policies | Integrate frontend policies screen | Completed in `hrms-client` | Completed for `/admin-settings/policies` list/edit/save in API mode; local policy store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.policies.tsx`, frontend API docs | `feat(admin): connect policy settings to backend API` |
| 5 | Admin email templates | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin email-template integration test, `pnpm test:contracts` | Passed. OpenAPI generated 193 operations across 171 paths. The update endpoint was added because the visible email-template UI has save/toggle behavior. | `src/modules/admin/*`, `src/db/migrations/0015_admin_email_templates.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement email template settings APIs` |
| 5 | Admin email templates | Integrate frontend email-template screen | Completed in `hrms-client` | Completed for `/admin-settings/email-templates` list/edit/save/toggle in API mode; local template store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.email-templates.tsx`, frontend API docs | `feat(admin): connect email templates to backend API` |
| 5 | Admin notification channels | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin notification-channel integration test, `pnpm test:contracts` | Passed. OpenAPI generated 195 operations across 172 paths. A read endpoint was added because the visible UI must load current backend settings before toggles save. | `src/modules/admin/*`, `src/db/migrations/0016_admin_notification_channels.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement notification channel settings APIs` |
| 5 | Admin notification channels | Integrate frontend notifications screen | Completed in `hrms-client` | Completed for `/admin-settings/notifications` list/toggle/save in API mode; local notification store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.notifications.tsx`, frontend API docs | `feat(admin): connect notification settings to backend API` |
| 5 | Admin audit log | Implement backend API | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin audit-log integration test, `pnpm test:contracts` | Passed. OpenAPI generated 196 operations across 173 paths. The audit read model is derived from existing durable admin outbox events. | `src/modules/admin/*`, OpenAPI/docs/contracts, admin audit-log integration test | `feat(admin): implement audit log API` |
| 5 | Admin audit log | Integrate frontend audit screen | Completed in `hrms-client` | Completed for `/admin-settings/audit` read/filter display in API mode; local audit store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.audit.tsx`, frontend API docs | `feat(admin): connect audit log to backend API` |
| 5 | Non-expense Reports | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, reports integration test, `pnpm test:contracts` | Passed. OpenAPI generated 206 operations across 182 paths. First contract run failed due a parallel DB reset with the reports integration test; rerun alone passed. | `src/modules/reports/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(reports): implement non-expense report APIs` |
| 5 | Non-expense Reports | Integrate frontend report screens | Completed in `hrms-client` | Completed for HR, attendance, leave, projects, timesheet, assets, helpdesk, and audit report routes in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/reports/*`, `src/routes/_app/reports*.tsx`, frontend API docs | `feat(reports): connect non-expense report screens to backend APIs` |
| 5 | Employee/core backlog | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, core integration test, `pnpm test:contracts` | Passed. OpenAPI generated 211 operations across 187 paths. Non-escalated `tsx`/DB runs were sandbox-blocked and passed when rerun with local QA infra access. | `src/modules/core/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(core): implement employee history import and export APIs` |
| 5 | Employee/core backlog | Integrate frontend employee screens | Completed in `hrms-client` | Completed for employee profile role history/audit reads and API-backed employee export job queueing | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/core/*`, `src/routes/_app/employees.tsx`, `src/routes/_app/employees.$id.tsx`, frontend API docs | `feat(employees): connect employee history and export APIs` |
| 5 | EMS document wrappers | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, `pnpm test:contracts` | Passed. OpenAPI generated 213 operations across 188 paths. Non-escalated `tsx`/DB/Docker runs were sandbox-blocked and passed when rerun with local QA infra access. | `src/modules/ems/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(ems): add employee document wrapper APIs` |
| 5 | EMS document wrappers | Integrate frontend EMS documents screen | Completed in `hrms-client` | Completed for `/ems/documents` list/download behavior in API mode; Phase 6 later added selected-file Upload/Replace handoff | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/ems/*`, `src/routes/_app/ems.documents.tsx`, frontend API docs | `feat(ems): connect document screen to backend wrappers` |
| 6 | EMS document upload/delete picker | Replace fake Upload/Replace UI with selected-file metadata upload and add complete document removal | Completed through generic `DELETE /api/v1/documents/{id}` with object-storage removal, soft-deleted metadata, OpenAPI, and Documents integration coverage | Completed for `/ems/documents` global Upload, per-document Replace, and per-document Delete actions in API mode | Backend `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, Documents integration test, `pnpm test:contracts`; frontend `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint keeps 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. One parallel DB validation run deadlocked; serial reruns passed. | `src/modules/documents/*`, `src/platform/openapi.ts`, contract/OpenAPI docs, `hrms-client/src/domains/documents/*`, `hrms-client/src/routes/_app/ems.documents.tsx` | `feat(documents): add document delete flow` |
| 5 | Attendance backlog | Implement completion APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, `pnpm test:contracts` | Passed. OpenAPI generated 216 operations across 191 paths. Non-escalated DB/tsx runs were sandbox-blocked and passed when rerun with local QA infra access. | `src/modules/attendance/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(attendance): complete daily queue and export APIs` |
| 5 | Attendance backlog | Add frontend adapters/hooks | Completed in `hrms-client` | Completed for domain-level access to daily calendar, manager regularization queue, and export job APIs | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/attendance/*`, frontend API docs after sync | `feat(attendance): add completion endpoint adapters` |
| 5 | Leave/WFH export | Implement export API | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, Leave/WFH integration test, `pnpm test:contracts` | Passed. OpenAPI generated 217 operations across 192 paths and planned operations remaining dropped to 0. | `src/modules/leave-wfh/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(leave): implement leave WFH export API` |
| 5 | Leave/WFH export | Connect monitor export | Completed in `hrms-client` | Completed for `/leave-wfh/monitor` export job queueing in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/leave-wfh/*`, `src/routes/_app/leave-wfh.monitor.tsx`, frontend API docs after sync | `feat(leave): connect Leave WFH export action` |
| 6 | Production hardening guardrails | Harden backend verification scripts | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm verify:implementation`, `pnpm verify:scalability` | Passed. `verify:implementation` now guards the full 233-operation contract completion state and `verify:scalability` checks critical indexes across all implemented modules. | `scripts/verify-implementation.ts`, `scripts/verify-scalability.ts` | `chore(verify): harden production readiness checks` |
| 6 | Production API config | Guard frontend production API/mock fallback config | N/A | Completed in `hrms-client` | `pnpm api:production-config-guard`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage | Passed. Lint has the existing 39 Fast Refresh warnings and no new errors. | `hrms-client/package.json`, `hrms-client/scripts/production-config-guard.mjs` | `chore(frontend): guard production API config` |
| 6 | API e2e baseline | Add cross-module backend API user-flow smoke | Completed | N/A | `pnpm test:e2e`, `pnpm typecheck`, `pnpm build`, `pnpm lint` | Passed. Covers auth/session, core users, dashboard, timesheets, expenses, attendance, leave/WFH, EMS, projects/utilization, helpdesk, notifications, reports, and export metadata. | `src/__tests__/production-user-flows.e2e.test.ts`, task sheet | `test(e2e): add production user-flow smoke` |
| 6 | Browser e2e baseline | Add Playwright smoke for API-mode frontend routes | N/A | Completed in `hrms-client` | `pnpm test:e2e`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, `pnpm api:implemented-route-guard`, `pnpm api:frontend-contract:route-coverage`, `pnpm api:production-config-guard`, `pnpm build` | Passed. Browser smoke uses QA backend API mode with mock fallback disabled and covers employee, HR/admin, projects/utilization, and notification surfaces. | `hrms-client/e2e/*`, `playwright.config.ts`, package/lockfile, ESLint config, `.gitignore`, task sheet | `test(e2e): add frontend browser smoke baseline` |
| 6 | Browser e2e hardening | Add mutation, mobile, and report export-download browser coverage | N/A | Completed in `hrms-client` | `pnpm test:e2e`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, `pnpm api:implemented-route-guard`, `pnpm api:frontend-contract:route-coverage`, `pnpm api:production-config-guard`, `pnpm build` | Passed. Playwright now runs 6 Chromium tests covering API-backed Helpdesk ticket creation, mobile authenticated sidebar navigation, and generated report export download URL handoff across all report routes. | `hrms-client/e2e/production-smoke.spec.ts`, `hrms-client/src/domains/reports/queries.ts`, task sheet | `test(e2e): expand production browser coverage` |
| 6 | Export file generation | Generate document-backed supported-format exports | Completed for employee/core CSV/XLSX, report CSV/XLSX, and attendance/Leave-WFH CSV/JSON/XLSX exports | Completed for employee list, Leave/WFH monitor, and route-wide ReportShell download handoff in API mode | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, targeted integration tests, `pnpm test:contracts`, `pnpm test:e2e`, frontend typecheck/lint/guards/build | Passed. OpenAPI remains 233 operations across 205 paths; response schemas expose generated document metadata and XLSX now renders through the shared export generator. | `src/platform/generated-exports.ts`, export services/tests/OpenAPI/docs, frontend employee, Leave/WFH monitor, and ReportShell routes, frontend contract docs | `feat(exports): generate document-backed CSV exports` / `feat(exports): open generated export downloads` / `feat(reports): open generated report exports` / `feat(exports): render XLSX export documents` |
| 6 | XLSX workbook rendering | Replace queued XLSX placeholder with real generated workbook files | Completed through the shared generated export document pipeline with XLSX MIME type, `.xlsx` filenames, object-storage upload, and employee/report integration coverage | Existing frontend export handoff automatically opens generated XLSX documents when requested by API clients; no route source change required for this backend slice | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, core and reports integration tests, `pnpm test:contracts`, frontend route/contract/config guards | Passed. OpenAPI remains 233 operations across 205 paths. Frontend contract guards passed after docs sync. | `src/platform/generated-exports.ts`, core/reports integration tests, OpenAPI/frontend contract docs, API guides | `feat(exports): render XLSX export documents` |
| 6 | Helpdesk category configuration | Add real category create/update/toggle behavior | Completed for `POST /api/v1/helpdesk/categories` and `PATCH /api/v1/helpdesk/categories/{id}` | Completed for `/helpdesk/categories` create/edit/toggle actions in API mode | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, Helpdesk integration test, `pnpm test:contracts`, frontend typecheck/lint/route guards/build | Passed. OpenAPI now has 219 operations across 193 paths. First parallel DB-resetting validation deadlocked; serial reruns passed. | `src/modules/helpdesk/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs, `hrms-client/src/domains/helpdesk/api.ts`, `hrms-client/src/lib/helpdesk-store.tsx` | `feat(helpdesk): add category configuration APIs` / `feat(helpdesk): connect category configuration actions` |
| 6 | Deployment/security hardening | Add backend security headers, production CORS allowlist, compose env wiring, and verifier service-name sync | Completed for backend API runtime and Docker compose verification scripts | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm verify:implementation`, QA `pnpm db:migrate`, `pnpm test:contracts`, `pnpm docker:prod:config`, tracked `.env.prod.example` compose config parse | Passed. `pnpm docker:prod:config` also exposed a local untracked `.env.prod` drift warning; `.env.prod.example` validates cleanly. | `src/plugins/security-headers.ts`, `src/app.ts`, config/decorator types, env examples, compose files, `scripts/verify-dev-deployment.ts`, contract test | `chore(security): harden API headers and production CORS` |
| 6 | Observability | Add production-safe logger level and redaction defaults | Completed with `LOG_LEVEL` env examples/compose wiring and Fastify logger redaction when `logger: true` is used | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, QA `pnpm db:migrate`, `pnpm test:contracts` | Passed. Contract coverage confirms `LOG_LEVEL` is honored alongside the security-header/CORS test. | `src/app.ts`, env examples, compose files, contract test | `chore(observability): configure production-safe API logging` |
| 6 | Backup/restore | Add guarded database backup and restore scripts | Completed for source-controlled PostgreSQL custom-format backup/restore commands | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint` | Passed. Live backup/restore execution not run because PostgreSQL client tools are not installed on this host PATH. | `scripts/backup-db.ts`, `scripts/restore-db.ts`, `package.json`, `.gitignore` | `chore(ops): add database backup and restore scripts` |
| 6 | Document upload compression | Add server-side PDF compression before object storage | Completed for detected PDF uploads through Documents/EMS wrapper paths | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test:unit -- --runInBand`, `pnpm api:docs:verify`, `pnpm docker:prod:config` | Passed. `tsx`-based lint/docs verify needed escalation due sandbox IPC restrictions. OpenAPI remains 219 operations across 193 paths. | `src/platform/pdf-compression.ts`, `src/modules/documents/service.ts`, config/decorator/store wiring, env examples, Docker compose files, Dockerfile, README, Documents API guide | `feat(documents): add PDF compression before object storage upload` |
| 6 | Document upload preparation | Share browser image compression and upload-size validation | N/A | Completed for `/ems/documents` uploads and `/expenses/create` attachment selection | `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/shared/uploads/documents.ts`, `hrms-client/src/routes/_app/ems.documents.tsx`, `hrms-client/src/routes/_app/expenses.create.tsx` | `feat(documents): share upload preparation across document forms` |
| 6 | Document upload journey verification | Prove binary multipart uploads across document surfaces | Completed for generic Documents, Expense document, and EMS employee document upload routes | Already covered by the prior shared upload preparation validation | `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run --project integration src/modules/documents/__tests__/documents.integration.test.ts` | Passed. The integration suite now exercises PDF/image/text upload bytes, compression metadata, storage stat, list, download URL, and wrapper paths against QA infra. | `src/modules/documents/__tests__/documents.integration.test.ts`, task sheet | `test(documents): cover multipart upload journeys` |
| 6 | Cloudinary-only object storage | Remove the legacy local object-storage provider from runtime code/config and use Cloudinary for document/media storage | Completed for runtime config, datastore wiring, document upload/download, generated exports, release verification scripts, Docker compose service removal, env examples, README/API docs, task sheets, and tests | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `HRMS_ENV_FILE=.env.dev.example pnpm test:contracts`, `HRMS_ENV_FILE=.env.dev.example pnpm exec vitest run --project integration src/modules/documents/__tests__/documents.integration.test.ts`, Docker dev/QA/prod compose config parse, storage-reference grep | Passed. Initial docs/lint commands needed escalation because `tsx` IPC sockets are blocked in the sandbox. Initial contract/document integration attempt failed due missing DB and then parallel DB-reset contention; serial reruns passed after starting updated test infra. | `src/platform/object-storage.ts`, config/decorator/app/store wiring, release verification scripts, Docker compose files, env examples, README, API docs, task sheets, tests | `feat(storage): make Cloudinary the only object storage adapter` |
| 6 | Media upload policy/profile photos/onboarding logo | Make visible image/media uploads backend-policy-driven and Cloudinary-backed | Completed for `GET /api/v1/documents/upload-policy`, employee profile-photo document upload metadata, profile-photo removal, and token-based `POST /api/v1/onboarding/company-logo` before company bootstrap | Completed for employee profile-photo upload controls, `/ems/profile` current-user upload/replace/remove, and onboarding company-logo compression/draft persistence/upload in API mode | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, auth onboarding, core, and documents integration tests, `pnpm test:contracts`, frontend typecheck/lint/route guards/build | Passed. This slice had a lower then-current OpenAPI count; current OpenAPI count is listed in Current Verified Status. Frontend lint keeps existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `src/db/migrations/0021_core_profile_photos.sql`, `src/db/migrations/0022_company_profile_logo.sql`, `src/modules/core/*`, `src/modules/auth/*`, `src/modules/documents/*`, OpenAPI/contract docs, `hrms-client/src/routes/_app/ems.profile.tsx`, `hrms-client/src/routes/onboarding.tsx`, employee routes/forms, shared upload helpers | Pending commit |
| 6 | Admin security settings | Persist and enforce visible security basics | Completed for `GET /api/v1/admin/security-settings` and `PUT /api/v1/admin/security-settings`; runtime password setup/reset/signup, session timeout, and auth-rate caps use persisted settings | Completed for `/admin-settings/security` in API mode with Save/Reset, loading, empty/error, and success/error toast behavior; API-disabled development keeps local draft storage | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin-security integration test, `pnpm test:contracts`, frontend typecheck/lint/guards/build | Passed. OpenAPI now has 221 operations across 194 paths. MFA remains disabled/provider-pending by design. | `src/modules/admin/*`, `src/modules/auth/*`, `src/plugins/rate-limit.ts`, `src/db/migrations/0017_admin_security_settings.sql`, OpenAPI/docs/contracts, `hrms-client/src/domains/admin/*`, `hrms-client/src/routes/_app/admin-settings.security.tsx` | `feat(admin): implement security settings enforcement` / `feat(admin): connect security settings to backend API` |
| 6 | EMS admin workflows | Persist visible HR admin onboarding, probation, exit, policy, and letter-generation actions | Completed for eight EMS admin workflow endpoints and persistence for checklists/probation reviews | Completed for `/ems/admin` in API mode with backend-backed onboarding, probation, exit, policy publish, and letter generate actions; API-disabled development keeps local rows | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm verify:implementation`, `pnpm verify:scalability`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, `pnpm test:contracts`, frontend typecheck/lint/guards/build | Passed. OpenAPI now has 229 operations across 202 paths. One EMS integration rerun was required after avoiding a parallel DB-reset race with contract tests. | `src/db/migrations/0018_ems_admin_workflows.sql`, `src/modules/ems/*`, EMS persistence/schema/OpenAPI/contracts, `hrms-client/src/domains/ems/*`, `hrms-client/src/routes/_app/ems.admin.tsx` | `feat(ems): implement admin workflow APIs` / `feat(ems): connect admin workflow screens to backend APIs` |
| 6 | Asset vendor/recovery hardening | Persist vendor mutations and recovery settlement | Completed for vendor create/update and recovery settlement APIs with persistence, OpenAPI, contract, and integration coverage | Completed for `/assets/warranty` vendor create/update and `/assets/returns` recovery settlement in API mode; API-disabled development keeps local/demo behavior | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm verify:implementation`, `pnpm verify:scalability`, `pnpm db:verify:no-cross-schema-fks`, assets integration test, `pnpm test:contracts`, frontend format/typecheck/lint/guards/build | Passed. OpenAPI now has 232 operations across 204 paths. | `src/db/migrations/0019_asset_vendor_recovery_workflows.sql`, asset module/schema/persistence/OpenAPI/contracts, `hrms-client/src/domains/assets/*`, `hrms-client/src/routes/_app/assets.warranty.tsx`, `hrms-client/src/routes/_app/assets.returns.tsx` | `feat(assets): implement vendor and recovery settlement APIs` / `feat(assets): connect vendor and recovery workflows` |
| 6 | Project document upload handoff | Attach project documents through existing Documents API | Backend project document list and generic document upload/download APIs already complete | Completed for `/projects/$id` documents tab in API mode with file picker, shared image compression/size validation, multipart project attachment upload, download URL action, loading/success/error toasts, and local/demo upload disabled | `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint keeps 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/routes/_app/projects.$id.tsx` | `feat(projects): add project document upload flow` |
| 6 | Project portfolio export handoff | Route visible `/projects` export through backend Reports/Documents APIs | Existing Reports export API already supports `projects/summary` and generated CSV/XLSX document handoff | Completed for `/projects` Export in API mode; API-disabled development keeps browser-local CSV export | `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint keeps 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/routes/_app/projects.tsx` | `feat(projects): open backend portfolio exports` |
| 6 | Asset warranty alerts | Derive warranty alert list from Admin asset policy | Completed for `GET /api/v1/assets/warranty-alerts` with asset/Admin scope, policy-driven alert window, expired/critical/warning counts, OpenAPI, contract, and integration coverage | Completed for `/assets/warranty` in API mode; the page now reads the backend alert window/items and keeps the 60-day local derivation only when API mode is disabled | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm verify:implementation`, `pnpm verify:scalability`, `pnpm db:verify:no-cross-schema-fks`, assets integration test, `pnpm test:contracts`, frontend format/typecheck/lint/guards/build | Passed. OpenAPI now has 233 operations across 205 paths. | `src/modules/assets/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs, `hrms-client/src/domains/assets/*`, `hrms-client/src/routes/_app/assets.warranty.tsx` | `feat(assets): add policy driven warranty alerts` / `feat(assets): use warranty alert API` |

## Remaining Blockers

| Priority | Blocker |
| --- | --- |
| P1 | Browser-level e2e still needs approval/decision and upload-flow coverage; route smoke, one create mutation, mobile viewport navigation, and generated report export download checks are now covered |
| P1 | Warranty provider notifications/escalation automation remain deferred until delivery-provider rules are specified; policy-driven warranty alerts are now API-backed |
| P1 | Project-specific report depth remains planned; project document upload/download and portfolio export are now API-backed |
| P1 | Scheduled exports, export retention cleanup, and import row parsing remain production hardening |
| P1 | Admin master-data tabs beyond departments/designations remain deferred until backend APIs are defined |
| P1 | Dynamic RBAC runtime enforcement and custom-role assignment to employees remain deferred; this slice persists Admin Settings RBAC configuration only |
| P1 | MFA/provider-level security enforcement remains intentionally deferred; basic Admin Security Settings now persist and enforce password/session/rate/audit/security configuration |
| P2 | Frontend lint keeps 39 existing Fast Refresh warnings |
| P2 | Frontend build keeps chunk-size/Wrangler log warnings but exits successfully |

## Validation Results

Backend:

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `pnpm lint`: passed with escalation due `tsx` IPC sandboxing
- `pnpm test:unit -- --runInBand`: passed, including PDF compression disabled/fail-open/fail-closed coverage
- `pnpm exec vitest run --project integration src/modules/documents/__tests__/documents.integration.test.ts`: passed, 3 tests covering restricted access plus multipart PDF/image/text upload, expense document upload, EMS document upload/delete, list/download handoff, storage stat/removal, and compression metadata
- `pnpm exec vitest run --project integration src/modules/admin/__tests__/admin-security.integration.test.ts`: passed, 2 tests covering Admin-only read/update, OCC conflict, and runtime password policy behavior
- `pnpm test:e2e`: passed, 1 API-level production user-flow smoke test covering auth/session, core users, dashboard, timesheets, expenses, attendance, leave/WFH, EMS, projects/utilization, helpdesk, notifications, reports, and export metadata
- `pnpm api:docs:generate`: passed with escalation due `tsx` IPC sandboxing; generated 236 operation frontend contract after the document content and delete endpoint fixes
- `pnpm api:docs:verify`: passed
- `pnpm api:consumer:verify`: passed with escalation due `tsx` IPC sandboxing
- `pnpm db:verify:no-cross-schema-fks`: passed after verifier fix; no cross-schema SQL foreign keys found in migrations or PostgreSQL metadata
- `pnpm exec vitest run --project integration src/modules/attendance/__tests__/attendance.integration.test.ts`: passed, 3 tests; non-escalated run failed on sandboxed DB networking and passed with local QA infra access
- `pnpm exec vitest run --project integration src/modules/leave-wfh/__tests__/leave-wfh.integration.test.ts`: passed, 2 tests; non-escalated DB access is sandbox-blocked and validation passed with local QA infra access
- `pnpm exec vitest run --project integration src/modules/ems/__tests__/ems.integration.test.ts`: passed, 4 tests covering profile/service request/policy/letter flows, EMS employee document wrappers, and EMS admin onboarding/probation/exit/policy actions; one parallel run failed due a shared test DB reset race with contract tests and passed when rerun sequentially
- `pnpm exec vitest run --project integration src/modules/assets/__tests__/assets.integration.test.ts`: passed, 3 tests covering QR scan/termination recovery, license guardrails, asset request/acknowledgement/maintenance, vendor create/update, recovery queue, and recovery settlement
- Asset warranty-alert validation: assets integration test now passes 4 tests covering QR/recovery, license guardrails, policy-driven warranty alerts with forbidden employee access and custom alert window, and asset request/acknowledgement/maintenance/vendor/recovery workflows
- `pnpm exec vitest run --project integration src/modules/core/__tests__/core.integration.test.ts`: passed, 3 tests; non-escalated run failed on sandboxed DB networking and passed with local QA infra access
- `pnpm exec vitest run --project integration src/modules/core/__tests__/core.integration.test.ts src/modules/reports/__tests__/reports.integration.test.ts`: passed, 5 tests after adding XLSX export document assertions for employee/core and report exports; non-escalated run failed on sandboxed DB networking and passed with local QA infra access
- `pnpm test:contracts`: passed, 14 tests after adding security-header and production CORS allowlist coverage; non-escalated DB access is sandbox-blocked and validation passed with local QA infra access
- `pnpm verify:implementation`: passed with escalation due `tsx` IPC sandboxing; now covers full module registration, zero planned API backlog, and contract sync guardrails
- `pnpm verify:scalability`: passed with escalation due `tsx` IPC sandboxing; now covers critical indexes across all implemented backend modules
- `pnpm docker:prod:config`: passed compose parsing and shows PDF compression env pass-through; local untracked `.env.prod` still warns that `CORS_ALLOWED_ORIGINS` is unset
- `docker compose --env-file .env.prod.example -f infra/docker/docker-compose.prod.yml -p hawkaii_hrms_backend_prod config`: passed with tracked production example values and no CORS/API service-name drift
- `pnpm backup:db` / `pnpm restore:db`: not run because `pg_dump`/`pg_restore` are not installed on this host PATH; scripts compile through typecheck/build

Frontend:

- `pnpm format`: passed
- `pnpm exec tsc -p tsconfig.json --noEmit`: passed
- `pnpm lint`: passed with 39 existing warnings
- `pnpm api:production-config-guard`: passed; production mock fallback is disabled and API mode is required
- `pnpm api:implemented-route-guard`: passed, 59 files against 205 paths
- `pnpm api:frontend-contract:route-coverage`: passed, 85 routes across 15 groups
- XLSX export docs sync validation: frontend route guard, route coverage, and production config guard passed after copying regenerated OpenAPI/frontend contract docs from the backend
- Project document upload handoff validation: `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed after wiring `/projects/$id` document upload/download actions through the Documents API
- Project portfolio export handoff validation: `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed after wiring `/projects` Export to the Reports export and Documents download APIs in API mode
- Asset warranty-alert frontend validation: `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, production config guard, and `pnpm build` passed after wiring `/assets/warranty` to the warranty-alert API; route guard now scans 59 files against 205 OpenAPI paths
- `pnpm test:e2e`: passed, 6 Playwright Chromium tests against QA backend API mode; current coverage includes route smoke, Helpdesk ticket creation, mobile shell navigation, and generated report export download handoff across all report routes
- `pnpm build`: passed with existing chunk-size/Wrangler log warnings

## Assumptions

- EMS profile change requests intentionally model one field per request because the current UI submits one selected field at a time.
- EMS decisions use status values (`approved`, `returned`, `rejected`) rather than leave/WFH action verbs.
- EMS generic service requests support create/list/HR queue plus admin decision for the visible letter-generation workflow; richer assignment workflows stay planned for later HR operations.
- EMS employee document wrappers reuse the existing Documents module and `business_object_type = "employee"` instead of adding a parallel EMS document table.
- EMS document downloads, verification, access logs, and object-storage behavior remain owned by the existing Documents APIs.
- EMS document Upload/Replace now uses a real file picker in API mode and sends `multipart/form-data` file bytes to the EMS document wrapper. Download URLs, verification, access logs, and object-storage behavior remain owned by the Documents APIs.
- Browser image compression reduces client-to-backend upload size for image documents. Server-side PDF compression runs after the backend receives the PDF, so it reduces backend-to-object-storage storage/download size but does not reduce the initial browser-to-backend PDF upload bandwidth.
- EMS admin onboarding, probation, exits, policy publish, and letter generation actions now use backend APIs in API mode; full onboarding task orchestration and provider-generated PDF templates remain production hardening.
- Projects list responses intentionally include members, allocations, milestones/modules, documents, and summary by default so the existing project store can hydrate visible screens without adding a generated client layer.
- Project document APIs list documents attached to `business_object_type = "project"`; `/projects/$id` now uses the generic Documents API for project attachment upload/download in API mode instead of adding a separate project storage surface.
- `/projects` uses the existing `projects/summary` Reports export surface for portfolio exports in API mode; unsupported list filters such as billing type still apply to the visible table but are not all backend report filters yet.
- Helpdesk category mutation is now implemented for the existing supported category-key set. Arbitrary new category keys remain deferred until the Helpdesk ticket category enum and category role-scope model are generalized.
- Helpdesk attachment APIs accept document references only; real upload/replace remains part of the existing Documents/upload hardening work.
- Notifications read-state is scoped to the topbar feed; Admin notification channel preferences are now persisted by the Admin Settings API, while runtime delivery-provider filtering remains deferred.
- Asset workflow requests intentionally extend the existing asset module rather than creating a separate module so base inventory, assignment, return, and license behavior remain unchanged.
- Asset warranty alerts now use the Admin asset policy `warrantyAlertDays` in API mode; provider-backed notification/escalation automation remains deferred until delivery rules are specified.
- Asset vendor create/update is implemented for the visible `/assets/warranty` vendor workflow; delete/deactivation beyond status changes remains deferred hardening.
- Asset recovery settlement is implemented for open offboarding recovery tickets; advanced settlement accounting and automated finance deductions remain deferred until finance policy rules are specified.
- Timesheet enhancements intentionally add read-oriented analytics/selector endpoints only; existing segment, submission, and approval mutation behavior remains unchanged.
- Timesheet report routes now use the Reports summary API in API mode; document-backed timesheet export files remain production hardening.
- Expense clarification messages are persisted as durable expense audit events for this slice; a dedicated clarification table is deferred unless richer threaded features are required later.
- Expense withdrawal maps backend `Cancelled` to frontend `withdrawn`; withdrawal is limited to requester-owned draft, submitted, pending-manager, or manager-returned tickets.
- Expense dashboard summary returns compact role-aware cards and rows; detailed accounting reports remain under the existing expense report endpoints.
- Admin company profile extends the existing onboarding `platform.company_profiles` table so auth/company bootstrap state remains the source for tenant identity.
- Admin company profile updates emit `admin.company_profile.updated` outbox events as the durable audit hook until the broader Admin audit log API is implemented.
- Company profile updates intentionally keep `company_slug` stable; display/profile fields can change without migrating tenant identifiers.
- `/admin-settings/company` uses the backend in API mode and keeps localStorage only for API-disabled development.
- Admin master data implements departments/designations only because those are the only planned master-data endpoints in the current contract.
- Department/designation delete UI behavior maps to versioned deactivation; hard delete is not exposed.
- Department/designation deactivation is blocked while active employees reference the row to avoid breaking employee/org selectors.
- Unsupported Admin master-data tabs are disabled in API mode instead of silently persisting local-only production data.
- Admin RBAC persists role metadata and permission matrices for the Admin Settings UI without changing the existing fixed-role backend authorization checks in this slice.
- Built-in Admin role permissions are protected from replacement, and the Admin role cannot be deactivated.
- Custom RBAC roles can be created and configured, but assigning those custom roles to users and enforcing them at runtime requires a later RBAC policy migration.
- `/admin-settings/roles` uses backend APIs in API mode for role list/create/update/permission replacement and keeps localStorage role state only when API mode is disabled.
- Admin workflow configurations persist approval-stage settings for the Admin Settings UI without changing existing runtime approval engines in leave, WFH, timesheets, expenses, assets, or helpdesk in this slice.
- Workflow stage IDs remain client/backend configuration identifiers; runtime workflow history continues to use each feature module's existing records.
- `/admin-settings/workflows` uses backend APIs in API mode for list/edit/save behavior and keeps localStorage workflow state only when API mode is disabled.
- Admin policies persist the visible Admin Settings policy values without changing existing runtime enforcement inside attendance, leave/WFH, timesheets, expenses, assets, or helpdesk in this slice.
- Policy config is validated against the current visible UI fields and merged with the existing policy config on update.
- `/admin-settings/policies` uses backend APIs in API mode for list/edit/save behavior and keeps localStorage policy state only when API mode is disabled.
- Admin email templates persist the visible Admin Settings template subject, body, active status, locale, and metadata without adding SMTP/provider delivery configuration in this slice.
- The `PUT /api/v1/admin/email-templates/{template_key}` endpoint was added because the current frontend UI has visible save/toggle behavior, even though the old backlog only listed the read endpoint.
- `/admin-settings/email-templates` uses backend APIs in API mode for list/edit/save behavior and keeps localStorage template state only when API mode is disabled.
- Admin notification channels persist the visible Admin Settings In-app, Email, and Push event toggles without adding provider secrets, SMTP/push setup, or runtime notification delivery filtering in this slice.
- The `GET /api/v1/admin/notification-channels` endpoint was added because the current frontend UI must load current channel settings before saving toggle changes, even though the old backlog only listed the update endpoint.
- `/admin-settings/notifications` uses backend APIs in API mode for list/toggle/save behavior and keeps localStorage notification settings only when API mode is disabled.
- Admin audit log is derived from durable admin outbox events instead of a new audit table so existing Admin Settings mutation audit hooks remain the source of truth.
- `/admin-settings/audit` uses the backend API in API mode and keeps the local audit store only when API mode is disabled.
- Cross-module audit reporting is now available through `/api/v1/reports/audit`; `/admin-settings/audit` remains scoped to Admin Settings audit visibility.
- Admin Security Settings persist the visible password, session, login-attempt, audit-retention, IP allowlist, device-trust, and attachment-scan fields. Runtime enforcement is currently wired for password policy, session timeout, and auth-rate cap; audit retention, IP allowlist, device trust, and attachment-scan switches are persisted for admin governance and provider/runtime follow-up.
- MFA remains explicitly disabled in backend and frontend until a provider-backed MFA flow is specified; the frontend switch is disabled instead of pretending to enforce MFA.
- `/admin-settings/security` uses backend APIs in API mode and keeps local draft storage only when API mode is disabled.
- Non-expense Reports are read-only summaries derived from already implemented module stores; they do not introduce new source-of-truth workflow tables.
- Report export create/list/detail now generates document-backed CSV/XLSX exports for supported report types while preserving outbox events for audit visibility. Scheduling and retention automation are deferred to production hardening.
- Frontend report routes use the backend in API mode and keep local/mock aggregation only when API mode is disabled.
- Attendance daily calendar and manager regularization queue are added as backend completion endpoints/adapters; existing visible attendance routes already use monthly calendar, exceptions, and Reports APIs, so no route layout rewrite was required.
- Attendance and Leave/WFH export create now generate document-backed CSV/JSON/XLSX files when object storage is configured; scheduling, retention, and broader browser download coverage remain production hardening.
- Production CORS now requires `CORS_ALLOWED_ORIGINS`; development and QA compose files keep local frontend origins by default for API-mode validation.
- The local untracked `.env.prod` file is operator-owned and was not edited by this task; sync it from `.env.prod.example` before local production compose runs.
- Server startup uses `LOG_LEVEL` and redacts authorization, cookie, API-key, token, password, and JWT secret fields from Pino logs when `logger: true` is enabled.
- Backup/restore scripts assume PostgreSQL client tools (`pg_dump` and `pg_restore`) are installed on the operator host or CI runner.
- The Phase 6 API e2e smoke uses local demo password login for employee, peer, and admin actors, and uses the existing seeded `D1` test helper session for manager context because the reviewer email/password account is not active in the current QA seed.
- The Phase 6 browser e2e smoke waits for client hydration before UI login and uses client-side navigation after login because the current frontend stores the bearer token in memory; full-page route reload auth persistence remains a separate hardening consideration.
- Employee/core import jobs remain queued metadata only; actual import row parsing and user-creation previews still need an import processor.

## Commit Messages

| Feature | Message | Status |
| --- | --- | --- |
| Helpdesk backend | `feat(helpdesk): implement helpdesk APIs` | Committed in `hrms_backend` as `504da18` |
| Helpdesk frontend | `feat(helpdesk): connect helpdesk screens to backend APIs` | Committed in `hrms-client` as `50412ce` |
| Notifications backend | `feat(notifications): implement notification feed APIs` | Committed in `hrms_backend` as `75525cc` |
| Notifications frontend | `feat(notifications): connect topbar notifications to backend APIs` | Committed in `hrms-client` as `4ae6531` |
| Asset workflows backend | `feat(assets): implement asset workflow APIs` | Committed in `hrms_backend` as `bfc719f` |
| Asset workflows frontend | `feat(assets): connect asset workflow screens to backend APIs` | Committed in `hrms-client` as `6989a2f` |
| Timesheet enhancements backend | `feat(timesheets): implement timesheet analytics APIs` | Committed in `hrms_backend` as `b67fa38` |
| Timesheet enhancements frontend | `feat(timesheets): connect timesheet analytics screens to backend APIs` | Committed in `hrms-client` as `c256ff0` |
| DB verifier fix | `fix(db): make cross-schema verifier use test env` | Committed in `hrms_backend` as `0bfa017` |
| Expense enhancements backend | `feat(expenses): implement metadata summary withdraw and clarifications` | Committed in `hrms_backend` as `1fea48a` |
| Expense enhancements frontend | `feat(expenses): connect metadata summary and clarification flows` | Committed in `hrms-client` as `61ac090` |
| Admin company profile backend | `feat(admin): implement company profile settings APIs` | Committed in `hrms_backend` as `64ee990` |
| Admin company profile frontend | `feat(admin): connect company settings to backend API` | Committed in `hrms-client` as `0808920` |
| Admin master data backend | `feat(admin): implement master data settings APIs` | Committed in `hrms_backend` as `1e1904c` |
| Admin master data frontend | `feat(admin): connect master data settings to backend API` | Committed in `hrms-client` as `8ffaaab` |
| Admin RBAC backend | `feat(admin): implement RBAC settings APIs` | Committed in `hrms_backend` as `bff0a60` |
| Admin RBAC frontend | `feat(admin): connect RBAC settings to backend API` | Committed in `hrms-client` as `998c312` |
| Admin RBAC task sheet | `docs(admin): record RBAC completion` | Committed in `hrms_backend` as `34ddf95` |
| Admin workflow backend | `feat(admin): implement workflow settings APIs` | Committed in `hrms_backend` as `34b1633` |
| Admin workflow frontend | `feat(admin): connect workflow settings to backend API` | Committed in `hrms-client` as `56b749c` |
| Admin workflow task sheet | `docs(admin): record workflow settings completion` | Committed in `hrms_backend` as `21df259` |
| Admin policy backend | `feat(admin): implement policy settings APIs` | Committed in `hrms_backend` as `441648a` |
| Admin policy frontend | `feat(admin): connect policy settings to backend API` | Committed in `hrms-client` as `d0091d0` |
| Admin policy task sheet | `docs(admin): record policy settings completion` | Committed in `hrms_backend` as `28d2402` |
| Admin email templates backend | `feat(admin): implement email template settings APIs` | Committed in `hrms_backend` as `6778966` |
| Admin email templates frontend | `feat(admin): connect email templates to backend API` | Committed in `hrms-client` as `fd991af` |
| Admin email templates task sheet | `docs(admin): record email template settings completion` | Committed in `hrms_backend` as `08b851e` |
| Admin notification channels backend | `feat(admin): implement notification channel settings APIs` | Committed in `hrms_backend` as `0a2a25f` |
| Admin notification channels frontend | `feat(admin): connect notification settings to backend API` | Committed in `hrms-client` as `3b7d24c` |
| Admin notification channels task sheet | `docs(admin): record notification channel settings completion` | Committed in `hrms_backend` as `bbed1e6` |
| Admin audit log backend | `feat(admin): implement audit log API` | Committed in `hrms_backend` as `4029ec4` |
| Admin audit log frontend | `feat(admin): connect audit log to backend API` | Committed in `hrms-client` as `7b05ee4` |
| Admin audit log task sheet | `docs(admin): record audit log completion` | Committed in `hrms_backend` as `8985eac` |
| Non-expense Reports backend | `feat(reports): implement non-expense report APIs` | Committed in `hrms_backend` as `ae8f0d2` |
| Non-expense Reports frontend | `feat(reports): connect non-expense report screens to backend APIs` | Committed in `hrms-client` as `d8c25a7` |
| Non-expense Reports task sheet | `docs(reports): record non-expense reports completion` | Committed in `hrms_backend` as `fb5564c` |
| Employee/core backlog backend | `feat(core): implement employee history import and export APIs` | Committed in `hrms_backend` as `89e8548` |
| Employee/core backlog frontend | `feat(employees): connect employee history and export APIs` | Committed in `hrms-client` as `9972127` |
| Employee/core backlog task sheet | `docs(core): record employee core backlog completion` | Committed in `hrms_backend` as `edd2e72` |
| EMS document wrappers backend | `feat(ems): add employee document wrapper APIs` | Committed in `hrms_backend` as `166f664` |
| EMS document wrappers frontend | `feat(ems): connect document screen to backend wrappers` | Committed in `hrms-client` as `4efbbdf` |
| EMS document wrappers task sheet | `docs(ems): record document wrapper completion` | Committed in `hrms_backend` as `c5e4b89` |
| EMS document upload picker frontend | `feat(ems): add document upload picker` | Committed in `hrms-client` as `ca0b0c0` |
| Attendance backlog backend | `feat(attendance): complete daily queue and export APIs` | Committed in `hrms_backend` as `51a166c` |
| Attendance backlog frontend | `feat(attendance): add completion endpoint adapters` | Committed in `hrms-client` as `36c47e6` |
| Attendance backlog task sheet | `docs(attendance): record backlog completion` | Committed in `hrms_backend` as `e280dea` |
| Leave/WFH export backend | `feat(leave): implement leave WFH export API` | Committed in `hrms_backend` as `c30c814` |
| Leave/WFH export frontend | `feat(leave): connect Leave WFH export action` | Committed in `hrms-client` as `fd197b0` |
| Leave/WFH export task sheet | `docs(leave): record export completion` | Committed in `hrms_backend` as `4328b28` |
| Phase 6 verification guardrails | `chore(verify): harden production readiness checks` | Committed in `hrms_backend` as `0a7f47b` |
| Phase 6 frontend production config guard | `chore(frontend): guard production API config` | Committed in `hrms-client` as `0e5d958` |
| Phase 6 API e2e baseline | `test(e2e): add production user-flow smoke` | Committed in `hrms_backend` as `e799b34` |
| Phase 6 browser e2e baseline | `test(e2e): add frontend browser smoke baseline` | Committed in `hrms-client` as `436df10` |
| Phase 6 browser e2e hardening | `test(e2e): expand production browser coverage` | Committed in `hrms-client` as `f95e1ea` |
| Phase 6 export generation backend | `feat(exports): generate document-backed CSV exports` | Committed in `hrms_backend` as `957e1f7` |
| Phase 6 export generation frontend | `feat(exports): open generated export downloads` | Committed in `hrms-client` as `5f2ad46` |
| Phase 6 report export frontend | `feat(reports): open generated report exports` | Committed in `hrms-client` as `4f33cfa` |
| Phase 6 export generation task sheet | `docs(exports): record document-backed export generation` | Committed in `hrms_backend` as `6f011c9` |
| Phase 6 EMS document upload picker task sheet | `docs(ems): record document upload picker` | Committed in `hrms_backend` as `b76371c` |
| Phase 6 Helpdesk category backend | `feat(helpdesk): add category configuration APIs` | Committed in `hrms_backend` as `7fbd1a0` |
| Phase 6 Helpdesk category frontend | `feat(helpdesk): connect category configuration actions` | Committed in `hrms-client` as `526e1c9` |
| Phase 6 Helpdesk category task sheet | `docs(helpdesk): record category configuration completion` | Committed in `hrms_backend` as `df59cc6` |
| Phase 6 deployment/security hardening | `chore(security): harden API headers and production CORS` | Committed in `hrms_backend` as `4c7dc45` |
| Phase 6 observability hardening | `chore(observability): configure production-safe API logging` | Committed in `hrms_backend` as `1e8b365` |
| Phase 6 backup/restore scripts | `chore(ops): add database backup and restore scripts` | Committed in `hrms_backend` as `6a1f1c5` |
| Cloudinary document storage backend | `feat(documents): migrate storage to Cloudinary` | Committed in `hrms_backend` as `c38ad2f` |
| Expense/document upload frontend | `feat(documents): compress uploads and simplify expense create` | Committed in `hrms-client` as `9f1604f` |
| Legacy Supabase cleanup frontend | `chore(frontend): remove legacy Supabase artifacts` | Committed in `hrms-client` as `d5f2c68` |
| Document PDF compression backend | `feat(documents): add PDF compression before Cloudinary upload` | Committed in `hrms_backend` as `fc86ab8` |
| Shared document upload preparation frontend | `feat(documents): share upload preparation across document forms` | Committed in `hrms-client` as `b4cd326` |
| Admin security settings backend | `feat(admin): implement security settings enforcement` | Committed in `hrms_backend` as `af6f874` |
| Admin security settings frontend | `feat(admin): connect security settings to backend API` | Committed in `hrms-client` as `f41e798` |
| EMS admin workflow backend | `feat(ems): implement admin workflow APIs` | Committed in `hrms_backend` as `ee76dec` |
| EMS admin workflow frontend | `feat(ems): connect admin workflow screens to backend APIs` | Committed in `hrms-client` as `6ee3829` |
| Asset vendor/recovery backend | `feat(assets): implement vendor and recovery settlement APIs` | Committed in `hrms_backend` as `66a592b` |
| Asset vendor/recovery frontend | `feat(assets): connect vendor and recovery workflows` | Committed in `hrms-client` as `e7fe602` |
| Project document upload frontend | `feat(projects): add project document upload flow` | Committed in `hrms-client` as `24bf569` |
| Asset warranty alerts backend | `feat(assets): add policy driven warranty alerts` | Committed in `hrms_backend` as `954e883` |
| Asset warranty alerts frontend | `feat(assets): use warranty alert API` | Committed in `hrms-client` as `edc9391` |
| XLSX export rendering backend | `feat(exports): render XLSX export documents` | Committed in `hrms_backend` as `a36bd2f` |
| XLSX export docs frontend | `docs(exports): sync XLSX export contract docs` | Committed in `hrms-client` as `48d0735` |
| Project portfolio export frontend | `feat(projects): open backend portfolio exports` | Committed in `hrms-client` as `06a49fa` |

## Codex Sprint Update - Need-Action QA/Business Logic Implementation

| Task ID | BLQ ID | Feature/Area | Business Rule | Implementation Status | Files Changed | Verification Status | Tester Priority | Tester Scope | Notes / Blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HRMS-NA-001 | BLQ-001 | Roles/personas | Backend roles are source of truth; user-facing Reviewer means Manager | Implemented | `hrms-client/src/lib/auth.tsx`, `hrms-client/src/lib/mock/roles.ts`, `hrms-client/src/routes/_app/dashboard.tsx` | Backend/frontend typecheck and frontend guards passed | P0 | Smoke / Sprint Regression | Director and Auditor are explicit frontend roles; Helpdesk Agent is not invented as backend API role |
| HRMS-NA-002 | BLQ-002/003 | Expense routing | Requester cannot self-process; v1 flow is Manager then Finance Manager | Implemented | `hrms_backend/src/modules/expenses/*`, `hrms_backend/src/modules/platform/service.ts`, expense tests | Full backend integration passed with local mock Cloudinary | P0 | Smoke / Full Regression | Missing independent approver blocks submission with business error |
| HRMS-NA-003 | BLQ-004 | Admin workflow configs | Verify save/refresh; only claim runtime behavior where consumed | Verified / Partially Future Scope | Existing admin workflow APIs/UI | Frontend build/guards passed; QA artifacts mark runtime-wide consumption as future proof item | P0 | Sprint Regression | Current workflow settings are persisted/configuration-facing unless module-specific consumer exists |
| HRMS-NA-004 | BLQ-005/006/007 | Attendance | Admin policy/working days drive target hours; off-day and midnight behavior visible | Implemented | `hrms_backend/src/modules/attendance/service.ts`, employee attendance dashboard | Targeted and full integration passed | P0 | Smoke / Sprint Regression | Adds weekly required, shortage, off-day worked, compensated, overtime fields |
| HRMS-NA-005 | BLQ-008 | Leave preview | Read-only leave calculation preview for Admin | Implemented | `hrms_backend/src/modules/admin/service.ts`, `hrms-client/src/routes/_app/admin-settings.policies.tsx` | Typecheck/build passed | P0 | Sprint Regression | Editable leave policy remains future scope |
| HRMS-NA-006 | BLQ-011/012 | Projects/cost center | Cost center optional/autofill; over-allocation requires acknowledgement | Implemented | project backend schemas/service, project drawer/store/API, department metadata | Targeted project integration and frontend build passed | P1 | Sprint Regression | Full request/approval workflow beyond ack path is future scope |
| HRMS-NA-007 | BLQ-013/014 | Documents | Confirmed hard delete where safe; immutable audit retained | Implemented with DB-policy caveat | `hrms_backend/src/modules/documents/service.ts`, core/doc tests | Full integration passed with local mock Cloudinary | P0 | Smoke / Full Regression | DB immutable trigger preserves access logs; metadata/storage/link rows are removed |
| HRMS-NA-008 | BLQ-015 | Cloudinary | QA/UAT/prod require real Cloudinary; mock only local/dev/test | Implemented / Verified | `config.ts`, `object-storage.ts`, QA docs | Config guard/build passed; local real-Cloudinary run fails without credentials as expected | P0 | Release Gate | UAT must set real credentials and `CLOUDINARY_MOCK_UPLOADS=false` |
| HRMS-NA-009 | BLQ-016 | Email verification | Non-local link open requires explicit confirmation | Implemented | `hrms-client/src/routes/verify-email.tsx`, auth email test | Auth integration passed | P1 | Smoke / Security | Backend token validation unchanged |
| HRMS-NA-010 | BLQ-024 | Empty workspace | No demo/seed fallback outside explicit local/demo mode | Implemented / Guarded | `hrms_backend/src/app.ts`, frontend production config guard | Production config guard passed | P0 | Smoke / Security | Full historical tenant scoping remains hardening where tables lack ownership |
| HRMS-QA-001 | QA | Enterprise QA artifacts | Maintain tester-ready workbook, internal/client checklists, and timeline plans | Completed | `qa/*`, `qa/scripts/validate_testing_workbook.py` | XLSX/DOCX updated and timeline validator passed | P0 | QA Execution | Obsolete generators were removed so the strict timeline artifacts remain the source of truth |

## Codex Sprint Update - Full Product QA Artifact Upgrade

| Task ID | Feature/Area | Scope | Status | Artifact(s) | Story Points / Sprint Plan | Verification | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HRMS-QA-UPGRADE-001 | Full software QA workbook | Rebuilt the QA workbook into a strict first hosted QA cycle with P0/P1/P2 test tabs, timeline fields, execution lanes, role matrix, business traceability, test data, defect log, future scope, execution summary, and signoff tabs | Completed | `qa/TESTING_TEST_CASES.xlsx` | 51 cases across 2026-06-10 to 2026-06-16; day totals are 18, 13, 15, 11, 9, 19, and 3 story points | `PYTHONPATH=/private/tmp/hawkaii-openpyxl python3 qa/scripts/validate_testing_workbook.py` passed | Current Vercel plus Render deployment is treated as shared hosted QA/staging until isolated domains are live |
| HRMS-QA-UPGRADE-002 | Role Permission Matrix | Expanded role matrix from high-level role rows to module/action-level rows for Employee, Manager/Reviewer, Director, Finance Manager, Admin, Auditor, Asset Manager, HR Manager, Helpdesk Agent alignment, and Project Manager assignment behavior | Completed | Workbook tab `Role Permission Matrix` | Included across Sprint 1 to Sprint 3 cases | QA artifact validator passed role matrix depth checks | Backend/API policy remains source of truth; user-facing Manager language replaces Reviewer where applicable |
| HRMS-QA-UPGRADE-003 | Business Rule Traceability | Expanded BLQ traceability for BLQ-001 through BLQ-025 with priority, risk, related modules, roles, APIs/screens, positive/negative/regression IDs, release-gate flag, status, evidence needs, and future-scope flags | Completed | Workbook tab `Business Rule Traceability` | Tied to workbook test IDs and sprint rows | QA artifact validator confirmed all BLQ IDs are represented | Future-scope items are captured only after workbook generation |
| HRMS-QA-UPGRADE-004 | Tester manual | Rewrote tester run book with strict 7-day execution order, submission cutoffs, defect SLA, request ID capture, macOS/Ubuntu/Windows setup guidance, Cloudinary/API-mode rules, role safety, and signoff conditions | Completed | `qa/TESTER_RUN_BOOK.md` | Supports Hosted QA Cycle 1 from 2026-06-10 to 2026-06-16 | QA timeline validator confirmed required run book sections are present | Production mutation testing remains disabled without safe tenant/reset evidence |
| HRMS-QA-UPGRADE-005 | Client/internal QA summaries | Regenerated client-safe checklist, internal checklist, and client DOCX summary from the strict hosted QA timeline | Completed | `qa/TESTING_CHECKLIST_CLIENT.md`, `qa/TESTING_CHECKLIST_INTERNAL.md`, `qa/TESTING_CHECKLIST_CLIENT.docx` | Summary docs point testers to the 2026-06-10 through 2026-06-16 execution order | DOCX/XLSX generated by stdlib script; timeline validator passed workbook and docs checks | Client document avoids internal code paths and real credentials |
| HRMS-QA-UPGRADE-006 | External sprint sheet update | Prepared exact patch rows for the external HRMS sprint workbook because safe spreadsheet editing libraries are unavailable in this environment | Completed as patch | `qa/TASK_SHEET_UPDATE_AUDIT.md`, `qa/TASK_SHEET_UPDATE_PATCH.md` | Patch includes sprint/story-point rows and QA upgrade rows | External workbook was not modified directly | Candidate external workbook: `/Users/anuragkumar/Desktop/Tasks/HRMS.xlsx` |

## Next Steps

1. Phase 6 API and browser e2e baselines are implemented for core backend API user flows and frontend API-mode route smoke coverage.
2. Backend OpenAPI now has 245 operations across 214 paths; planned operations remaining are 0.
3. Phase 6 verification guardrails are hardened for full-module implementation coverage, zero planned API backlog, frontend contract sync, critical migration index coverage, and frontend production API/mock fallback config.
4. Employee/core CSV/XLSX, report CSV/XLSX, and Attendance/Leave-WFH CSV/JSON/XLSX exports now generate backend documents and return `download_document_id`; employee import parsing, scheduled exports, and retention cleanup remain production hardening.
5. Next roadmap scope: continue Phase 6 with approval/upload browser coverage, provider-backed warranty notification automation if specified, project-specific report depth, import/scheduled-export/retention hardening, dynamic RBAC assignment/enforcement, and release-readiness reporting.

## Codex Sprint Update - Deployment Hardening, Agile Delivery, QA Upgrade

| Task ID | Sprint | Story Points | Priority | Status | Description | Acceptance Criteria | Verification | QA/Test Cases | Notes |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| HRMS-DEPLOY-001 | Sprint 1 | 5 | P0 | Implemented | Branch-based CI/CD for `dev`, `qa`, and `main` | PRs run checks without deploy; pushes deploy the matching hosted backend after checks pass | GitHub workflow YAML parsed | CI-CD Validation sheet | Production branch is `main` based on current repo evidence |
| HRMS-DEPLOY-002 | Sprint 1 | 5 | P0 | Implemented | Environment isolation for Render API/worker/Valkey and hosted env examples | Dev, QA, and production have separate Render blueprints, DB URLs, Valkey services, Cloudinary folders, and frontend/API domains | Render YAML parse passed | Data Isolation / Deployment Smoke | Real secrets remain dashboard-managed |
| HRMS-DEPLOY-003 | Sprint 1 | 3 | P0 | Implemented | Backend deployment env model | `APP_ENV` separates app environment from `NODE_ENV`; hosted QA/prod require optimized `NODE_ENV=production` | Backend typecheck/build | Secrets Config Checklist | `APP_ENV=local/development/qa/production` |
| HRMS-DEPLOY-004 | Sprint 1 | 2 | P1 | Implemented | Release metadata | Health endpoints expose app env, version, build SHA, and uptime without secrets | Backend typecheck/build | Deployment Smoke | Build SHA must be supplied by deployment env |
| HRMS-QA-DEPLOY-001 | Hosted QA Cycle 1 | 5 | P0 | Implemented | Deployment-aware QA workbook and tester manual | Workbook includes deployment smoke, CI/CD, DNS/CORS, data isolation, secrets, rollback, role matrix, traceability, execution summary, and signoff | QA timeline validation script | `qa/TESTING_TEST_CASES.xlsx` | 51 cases assigned across 2026-06-10 through 2026-06-16 |
| HRMS-PROCESS-001 | Hosted QA Cycle 1 | 3 | P1 | Implemented | Agile delivery docs | Branching, DoR, DoD, QA handoff, release governance, and strict hosted QA timeline documented | Docs under `docs/process` plus `qa/QA_TIMELINE_EXECUTION_PLAN.md` | Agile Sprint Plan / QA Timeline | Hosted QA daily evidence due by 20:00 IST, final package due by 2026-06-16 18:00 IST |
