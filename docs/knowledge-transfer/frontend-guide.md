# Frontend Guide

Last verified from the repository: 2026-06-30.

The frontend lives in `hrms-client/`. It is a TanStack Start application using React, TanStack Router, TanStack Query, Vite, Tailwind CSS, Radix/shadcn UI primitives, custom Hawkaii UI-kit components, and Playwright for browser checks.

## Entry Points

| File | Purpose |
| --- | --- |
| `src/start.ts` | Starts the TanStack client runtime. |
| `src/server.ts` | TanStack Start server entry. |
| `src/router.tsx` | Router creation and route tree wiring. |
| `src/routeTree.gen.ts` | Generated route tree from file-based routes. |
| `src/routes/__root.tsx` | Root route, HTML shell, providers, head tags, error and 404 boundaries. |
| `src/routes/_app.tsx` | Authenticated app layout with sidebar, topbar, environment banner, and route outlet. |
| `vite.config.ts` | Vite, TanStack Start, Nitro, Tailwind, React, and alias configuration. |

## Directory Map

```text
hrms-client/src/
  routes/              File-based routes and app screens.
  components/          App shell, dashboards, feature components, reports, shared UI.
  components/ui/       shadcn/Radix-style primitive components.
  components/ui-kit/   Hawkaii product primitives such as DataTable, PageHeader, StatCard.
  domains/             Domain API adapters, queries, mappers, and exports.
  shared/api/          Fetch client, config, errors, session token, route gates, rate limiter.
  shared/query/        Query client, keys, timings.
  shared/uploads/      Upload helpers for profile photos and documents.
  lib/                 Auth provider, theme, stores, mock data, feature utilities.
  hooks/               Generic React hooks.
```

## Routing Model

TanStack Router uses file routes under `src/routes/`.

| Route Pattern | Purpose |
| --- | --- |
| `/` | Public landing/default route. |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/set-password`, `/verify-email`, `/onboarding` | Auth and onboarding screens. |
| `/_app` | Authenticated app shell. |
| `/_app/*.tsx` | Authenticated module routes such as dashboard, employees, attendance, expenses, assets, helpdesk, reports, admin settings. |

New app pages should usually be placed under `src/routes/_app/` and use existing page/header/table/form primitives.

## App Providers

`src/routes/__root.tsx` wraps the app with:

- `QueryClientProvider`
- `ThemeProvider`
- `AuthProvider`
- module stores such as `EmployeesProvider`, `LeaveProvider`, `ProjectsProvider`, `TimesheetsProvider`, `ExpensesProvider`, `AssetsProvider`, `HelpdeskProvider`, `AdminSettingsProvider`
- `TooltipProvider`
- `Toaster`

The module stores are still present for local/demo state and gradual integration. Backend-connected features should prefer domain APIs and React Query where available.

## Auth And Role State

Important files:

| File | Purpose |
| --- | --- |
| `src/lib/auth.tsx` | Auth provider, session bootstrap, login/logout, signup flow, password reset, company setup, role switching. |
| `src/lib/mock/roles.ts` | Frontend role definitions and visible module paths. |
| `src/components/app-sidebar.tsx` | Filters sidebar items by `ROLE_MAP[activeRole].modules`. |
| `src/domains/auth/api.ts` | Backend auth/session API calls. |

Frontend roles are UI navigation roles such as `main_admin`, `hr_admin`, `employee`, `manager`, `finance_manager`, `asset_admin`, and `helpdesk_agent`. Backend roles use labels such as `Admin`, `HR Manager`, `Employee`, `Reviewer`, `Finance Manager`, `Asset Manager`, and `Auditor`.

Do not rely on frontend visibility as security. Backend services enforce the real authorization policy.

## API Client

Key files under `src/shared/api/`:

| File | Purpose |
| --- | --- |
| `config.ts` | Reads `VITE_API_*` config, normalizes base URL, disables mock fallback in production. |
| `client.ts` | Builds URLs, attaches tokens, sends `credentials: "include"`, parses errors, supports mock fallback wrapper. |
| `errors.ts` | Converts backend error bodies to `ApiError` and user-safe messages. |
| `session.ts` | Stores/clears API access token and notifies on unauthorized responses. |
| `rate-limiter.ts` | Client-side request pacing and retry-after cooldown handling. |
| `route-gate.ts` | API route availability gating. |
| `operations.ts` | Operation count/status constants used by route coverage checks. |

The default API base is `http://localhost:3001`. Hosted values are supplied through Vercel env vars.

## Domain Adapter Pattern

Most backend-integrated domains follow this shape:

```text
src/domains/<domain>/
  api.ts       API request functions.
  queries.ts   React Query hooks and cache keys.
  mapper.ts    API-to-UI mapping when backend shape differs from UI shape.
  index.ts     Public exports.
```

Examples include `assets`, `attendance`, `auth`, `core`, `documents`, `ems`, `expenses`, `helpdesk`, `leave-wfh`, `notifications`, `projects`, `reports`, and `timesheets`.

When adding or changing an API-backed screen:

1. Add or update the domain API function in `api.ts`.
2. Add query/mutation hooks in `queries.ts`.
3. Keep mapping logic in `mapper.ts` if the backend shape should not leak into UI components.
4. Use shared query keys from `src/shared/query/keys.ts` when possible.
5. Make UI components consume hooks instead of calling `apiRequest()` directly.
6. Keep user-facing error messages friendly by using shared error helpers.

## UI Conventions

Use existing components before creating new ones:

| Need | Preferred Source |
| --- | --- |
| Primitive controls | `src/components/ui/` |
| Product table/card/page patterns | `src/components/ui-kit/` |
| App shell | `src/components/app-sidebar.tsx`, `src/components/topbar.tsx` |
| Dashboards | `src/components/dashboards/` |
| Reports layouts | `src/components/reports/report-shell.tsx` |
| Feature drawers/forms | Feature component folders such as `components/employees/`, `components/assets/`, `components/projects/` |

Styling is driven by Tailwind CSS and semantic tokens in `src/styles.css`. Keep new UI consistent with current dense product-app layouts.

## Main Route Groups

| Route Base | Domain |
| --- | --- |
| `/dashboard` | Dashboard |
| `/employees` | Core employees |
| `/ems` | Employee self-service |
| `/attendance` | Attendance |
| `/leave-wfh` | Leave, WFH, holidays |
| `/timesheet` | Timesheets |
| `/projects` | Projects |
| `/team-utilization` | Utilization |
| `/expenses` | Expenses and finance |
| `/assets` | Assets |
| `/helpdesk` | Helpdesk |
| `/reports` | Reports |
| `/admin-settings` | Admin configuration |

## Frontend Checks

```bash
cd hrms-client
pnpm lint
pnpm build
pnpm build:vercel
pnpm api:production-config-guard
pnpm api:implemented-route-guard
pnpm api:frontend-contract:route-coverage
pnpm test:e2e
pnpm test:e2e:mobile-responsive
pnpm test:e2e:frontend-theme
```

Use Playwright for workflow or rendering risk. For simple API adapter changes, a build plus route/API contract guard may be enough if no UI behavior changed.

## Adding A New Frontend Feature

1. Confirm the backend endpoint exists in `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`.
2. Add or update the domain adapter under `src/domains/<domain>/`.
3. Add query/mutation hooks.
4. Add route or component UI under `src/routes/_app/` or `src/components/<feature>/`.
5. Add sidebar/module visibility only if this is a new route family.
6. Add or update loading, empty, error, and success states.
7. Run frontend checks and any relevant backend contract generation checks.

