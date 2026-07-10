# Project Overview

Last verified from the repository: 2026-06-30.

Hawkaii HRMS is a workforce operations platform covering HR, attendance, leave/WFH, timesheets, expenses, projects, assets, helpdesk, reporting, and admin governance. The repository is a product monorepo containing both application code and operational documentation.

## Product Areas

| Area | What It Covers |
| --- | --- |
| Auth and onboarding | Signup, email verification, password setup/reset, login/logout, session context, company bootstrap. |
| Dashboard | Role-aware summaries and quick actions. |
| Core employees | Employee directory, hierarchy, departments, designations, profile photos, import/export, audit trail. |
| Attendance | Punch in/out, breaks, summaries, exceptions, regularization, calendar, auto punch-out worker. |
| Leave and WFH | Leave requests, WFH requests, approvals, balances, holidays, monitor views. |
| EMS | Employee self-service profile, documents, profile change requests, HR approvals, policies, letters, probation, exits. |
| Timesheets | Work segments, submissions, approval queues, workflow definitions, project summaries. |
| Expenses and finance | Draft tickets, submit, manager verification, finance approval, payment release, settlement, documents, audit. |
| Projects | Project records, members, allocations, milestones, documents, utilization views. |
| Assets | Inventory, assignment, returns, requests, acknowledgements, vendors, maintenance, licenses, recovery workflows. |
| Helpdesk | Tickets, comments, internal notes, attachments, assignment, priority/status, SLA reports, categories. |
| Documents and media | Upload, replace, metadata, download URL/content, verification, access logs, delete. |
| Reports | HR, attendance, leave, timesheet, projects, expenses, assets, helpdesk, audit analytics and exports. |
| Admin settings | Company profile, master data, RBAC, workflows, policies, email templates, notification channels, security, audit logs. |
| Platform | Health, outbox, notifications, finance governance, sessions, rate limits, deployment metadata. |

## Code Ownership Map

| Concern | Main Files |
| --- | --- |
| Backend app assembly | `hrms_backend/src/app.ts`, `hrms_backend/src/server.ts` |
| Backend modules | `hrms_backend/src/modules/<module>/` |
| Backend shared constants/types | `hrms_backend/src/shared/` |
| Backend auth/session utilities | `hrms_backend/src/auth/index.ts`, `hrms_backend/src/plugins/auth.ts` |
| Backend config validation | `hrms_backend/src/plugins/config.ts`, `hrms_backend/src/config/runtime-defaults.ts` |
| Backend database schema | `hrms_backend/src/db/schema.ts`, `hrms_backend/src/db/migrations/` |
| Backend persistence adapters | `hrms_backend/src/platform/data-store.ts`, `hrms_backend/src/platform/postgres-data-store.ts` |
| Backend workers | `hrms_backend/src/workers/` |
| Frontend app shell | `hrms-client/src/routes/__root.tsx`, `hrms-client/src/routes/_app.tsx` |
| Frontend routes | `hrms-client/src/routes/`, especially `src/routes/_app/*.tsx` |
| Frontend domain adapters | `hrms-client/src/domains/<domain>/` |
| Frontend API client | `hrms-client/src/shared/api/` |
| Frontend auth and role state | `hrms-client/src/lib/auth.tsx`, `hrms-client/src/lib/mock/roles.ts` |
| Frontend shared UI | `hrms-client/src/components/ui/`, `hrms-client/src/components/ui-kit/` |
| Frontend mock/demo state | `hrms-client/src/lib/mock/`, `hrms-client/src/lib/*-store.tsx` |

## Current Technology Stack

| Layer | Stack |
| --- | --- |
| Frontend | TanStack Start, React 19, Vite 7, TanStack Router, TanStack Query, Tailwind CSS 4, Radix/shadcn UI, lucide-react, Playwright. |
| Backend | Node.js, TypeScript, Fastify 5, Zod, Drizzle schema definitions, PostgreSQL, Valkey, Pino, Vitest. |
| Storage and integrations | PostgreSQL, Valkey, Cloudinary-compatible object storage, Resend transactional email. |
| Deployment | Vercel for frontend, Render Docker API service, Render Docker worker, Neon Postgres, Render Key Value/Valkey. |
| CI/CD | GitHub Actions checks for backend/frontend and Render deploy hooks for backend and worker. |

## Branch And Environment Model

| Branch | Environment | Frontend | API |
| --- | --- | --- | --- |
| Feature branches | Local and PR checks | Local Vite | Local API |
| `dev` | Hosted dev | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` |
| `qa` | QA/UAT | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` |
| `main` | Production | `https://hawkaii.in` | `https://api.hawkaii.in` |

See `../deployment/environment-matrix.md` and `../deployment/hosted-deployment.md` for full environment details.

## Source Of Truth Documents

| Question | Start Here |
| --- | --- |
| What is implemented? | `../implementation/HRMS_PRODUCTION_TASK_SHEET.md` and `../../hrms_backend/docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md` |
| What API operations exist? | `../../hrms_backend/docs/api/openapi.json` and `../../hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md` |
| What frontend routes exist? | `../../hrms-client/src/routes/` and `../../hrms-client/src/routeTree.gen.ts` |
| What DB schema exists? | `../../hrms_backend/src/db/schema.ts` and `../../hrms_backend/src/db/migrations/` |
| How do deployments work? | `../deployment/hosted-deployment.md` and `../deployment/ci-cd-runbook.md` |
| How should QA handoff work? | `../process/qa-handoff-process.md` |

## Notes On Older Docs

`hrms-client/HANDOFF.md` is useful as a historical frontend overview, but parts of it are stale because the Fastify backend now exists and many modules have backend API integration. Treat this KT pack, backend API docs, and current source files as newer references.

