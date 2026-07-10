# Frontend Architecture

Last verified from the repository: 2026-06-30.

The frontend package is `hrms-client/`. It uses TanStack Start, React 19, Vite, TanStack Router, TanStack Query, Tailwind CSS, Radix/shadcn primitives, custom Hawkaii UI-kit components, and Playwright.

## Source Layout

| Path | Responsibility |
| --- | --- |
| `src/routes/` | File-based TanStack routes. There are 87 `.tsx` route files. |
| `src/components/` | App shell, topbar/sidebar, dashboards, feature components, reports, UI primitives. |
| `src/components/ui/` | shadcn/Radix primitives. |
| `src/components/ui-kit/` | Product-specific reusable components. |
| `src/domains/` | Backend API adapters, query hooks, and mappers for 17 domains. |
| `src/shared/api/` | Fetch client, API config, errors, session token handling, client rate limiter. |
| `src/shared/query/` | Query client, keys, timings. |
| `src/shared/uploads/` | Upload preparation for documents/profile photos. |
| `src/lib/` | Auth provider, theme, stores, mock data, utilities. |

## Route Architecture

Public auth/onboarding routes:

- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/set-password`
- `/verify-email`
- `/onboarding`

Authenticated app shell:

- `src/routes/_app.tsx`

Authenticated route groups:

- dashboard
- employees
- EMS
- attendance
- leave/WFH
- timesheets
- projects
- team utilization
- expenses
- assets
- helpdesk
- reports
- admin settings

## App Providers

`src/routes/__root.tsx` wraps the route outlet with:

- React Query client
- theme provider
- auth provider
- module stores for local/demo fallback state
- tooltip provider
- toaster

The local stores remain part of the app shell for API-disabled local development and fallback paths. Production must run API mode with mock fallback disabled.

## API Adapter Pattern

Domain adapters live under `src/domains/<domain>/`.

Expected shape:

```text
api.ts       request functions
queries.ts   React Query hooks
mapper.ts    backend-to-UI mapping when needed
index.ts     exports
```

The shared API client in `src/shared/api/client.ts`:

- normalizes base URLs
- attaches bearer token when available
- sends `credentials: "include"`
- handles JSON and empty responses
- converts backend errors into `ApiError`
- notifies auth on protected 401 responses
- supports non-production mock fallback when configured

## Role Navigation

Frontend visible modules come from `ROLE_MAP` in `src/lib/mock/roles.ts`. The sidebar filters route links through `src/components/app-sidebar.tsx`.

This is not a security boundary. Backend services enforce role and object-scope policy.

## UI Rules

- Reuse `src/components/ui/` and `src/components/ui-kit/` before adding new primitives.
- Keep dense operational screens consistent with existing routes.
- Use domain query hooks instead of direct `fetch()` calls from route components.
- Preserve loading, empty, error, and permission states.
- Keep generated route tree changes from TanStack Router committed when route files change.

## Frontend Verification

Use these checks according to change scope:

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

