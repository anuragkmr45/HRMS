# Frontend Attendance Role and Route Access Cleanup Plan

Task: `GEO-S10-017`
Status: Implementation-ready plan; no runtime authorization change in Sprint 10
Owner: Pratik
Last updated: 2026-07-20

## Objective

Replace duplicated attendance role arrays with server-derived capabilities so navigation, route entry, queries, and actions consistently reflect the access enforced by the backend.

Frontend checks improve usability only. The API remains responsible for tenant isolation, hierarchy scope, self-approval prevention, record visibility, and permission checks.

## Current-State Audit

| Surface | Current frontend rule | Backend behavior | Gap |
| --- | --- | --- | --- |
| Attendance module | Role must include `/attendance` in the local role map | Authenticated users are evaluated per operation | Local module lists can drift from API permissions |
| Overview | `hr_admin`, `main_admin`, and `manager` receive team view | HR/Admin/Auditor can see all; managers see hierarchy; self roles see self | Auditor has no frontend module; director handling is ambiguous |
| Calendar | HR/Admin/Manager are redirected | Monthly calendar can authorize self or visible subject | Route rule is role-based instead of subject/capability-based |
| Exceptions | Only HR/Admin can enter | Manager queue supports assigned managers; HR/Admin/Auditor can read scoped data | Managers cannot reach their queue; auditor read-only view is missing |
| Decisions | Page is hidden from managers | Assigned manager, HR, or Admin can decide; self-approval is blocked | Valid manager action is unavailable in UI |
| Role switching | Local role labels map to backend active role | API session owns available and active roles | Unsupported or stale local mappings can produce the wrong navigation |

Additional findings:

- Attendance access constants are repeated in the layout, overview, calendar, and exceptions routes.
- The app-level route protects authentication and onboarding, but not module authorization.
- A hidden tab is not equivalent to a guarded route; direct URLs still mount route components before local redirects.
- `project_manager` maps to backend `Reviewer`, so local labels alone cannot define attendance hierarchy authority.
- The exceptions page uses one broad query and conditionally renders decisions from `can_decide`; route access should likewise distinguish read from decide.

## Target Capability Model

The attendance context response proposed by `GEO-S10-011` is the source of UI entitlements. It returns operation-specific capabilities for the current actor and optional subject.

```ts
type AttendanceCapabilities = {
  self: {
    view: boolean;
    record: boolean;
    regularize: boolean;
  };
  team: {
    view: boolean;
    viewExceptions: boolean;
    decideRegularization: boolean;
    export: boolean;
  };
  policy: {
    view: boolean;
    editDraft: boolean;
    publish: boolean;
  };
};
```

Capabilities are computed by the server from tenant, active role, hierarchy, policy assignment, and subject. The client must not infer `team.view` from a role string.

## Route Policy

| Route | Required capability | Intended experience |
| --- | --- | --- |
| `/attendance` | `self.view` or `team.view` | Self panel, team panel, or both as authorized |
| `/attendance/calendar` | `self.view` | Personal calendar; an authorized subject calendar uses an explicit subject route/query later |
| `/attendance/regularizations` | `self.view` | Employee request history and create action when `self.regularize` |
| `/attendance/exceptions` | `team.viewExceptions` | Read-only queue when decision capability is false |
| `/attendance/exceptions/:id` | `team.viewExceptions` | Scoped evidence detail; decision controls require record `can_decide` and capability |
| `/admin-settings/attendance-policy` | `policy.view` | Read-only or editable according to policy capabilities |

The route hierarchy should expose a single metadata object:

```ts
export const attendanceRoutePolicy = {
  overview: anyOf("self.view", "team.view"),
  calendar: requires("self.view"),
  regularizations: requires("self.view"),
  exceptions: requires("team.viewExceptions"),
  policy: requires("policy.view"),
} as const;
```

Route loaders evaluate the policy before protected data hooks run. Unauthorized direct navigation renders an access-denied state or redirects to the closest authorized attendance route; it never starts the protected query first.

## Role Outcomes

Roles remain useful labels, not authorization logic.

| Backend actor | Expected default attendance experience |
| --- | --- |
| Employee/self-service role | Personal actions, calendar, and regularization history |
| Assigned manager/reviewer | Personal access when granted plus scoped team overview and assigned exception queue |
| HR manager | Tenant-wide operational overview, queue, and permitted decisions |
| Admin | Tenant-wide operational and policy administration access |
| Auditor | Tenant-wide read-only overview, exceptions, evidence metadata, and exports; no mutation controls |
| Director | Whatever capabilities the server grants; do not assume hierarchy access from the label |
| Project manager | No attendance manager authority unless the server grants it for the active role/hierarchy |

For users with multiple roles, all navigation and requests use the server-confirmed active role. Switching role invalidates attendance context, summaries, queues, and route decisions before navigating.

## Frontend Architecture

Add one attendance authorization module under `src/domains/attendance/access/`:

```text
access/
  capabilities.ts       # schema and capability paths
  route-policy.ts       # route-to-capability declaration
  use-attendance-access.ts
  attendance-route-guard.tsx
```

Responsibilities:

- Validate capability payloads at the API boundary and fail closed for missing/unknown fields.
- Expose `can(path)` and `firstAuthorizedRoute()` without importing role definitions.
- Generate attendance tabs from route policy so tabs and direct-route guards cannot diverge.
- Distinguish page read capability from record-level `can_decide`.
- Keep loaders/hooks disabled until session and capability context are ready.
- Clear cached capability-bearing data after active-role change, logout, company change, or 401/403.

Do not create a generic application-wide RBAC framework in this task. Establish the attendance pattern first, then promote it only after a second module proves the abstraction.

## Backend Contract Requirements

The server remains authoritative and must:

- Bind every request to the authenticated company; ignore client-supplied tenant scope.
- Apply self, hierarchy, HR/Admin, and auditor visibility on every list and detail endpoint.
- Return only scoped queue records; never depend on frontend filtering.
- Re-evaluate decision authority at mutation time and block self-approval.
- Return stable `403` problem codes for forbidden capability, subject, and active-role cases.
- Return record-level actions such as `can_decide` only as a UI hint; mutation authorization is repeated server-side.
- Avoid exposing sensitive evidence fields unless the operation and record scope both allow them.

## Migration Sequence

1. Add capability fields to the versioned attendance context contract and contract tests.
2. Add the typed access module and fail-closed parser.
3. Generate attendance tabs and overview mode from capabilities.
4. Move direct-route checks into loaders/guards before queries execute.
5. Enable managers to reach their scoped exceptions queue.
6. Enable auditor read-only surfaces only after response-field review and tests.
7. Remove `ADMIN_ROLES`, `ATTENDANCE_ADMIN_ROLES`, and `ATTENDANCE_OVERSIGHT_ROLES` from attendance routes.
8. Remove attendance authorization dependence on `ROLE_MAP.modules`; retain it temporarily for unrelated modules.
9. Add telemetry for denied route decisions using capability code only, with no employee or evidence data.

## Failure and Loading Behavior

- Session loading: stable page skeleton; no protected request.
- Context loading: stable attendance shell skeleton; no flash of unauthorized tabs.
- Context `401`: existing global logout/session-expired flow.
- Context `403`: access-denied page with a route to the dashboard.
- Context unavailable: retry state; do not fall back to role inference.
- Capability removed while open: cancel/invalidate queries, close mutation dialogs, and navigate to the first authorized route.
- Record decision returns `403` or `409`: preserve the queue, refresh the record, and show normalized guidance.

## Test Plan

### Unit

- Each route policy accepts only the intended capability combinations.
- Missing or malformed capability fields fail closed.
- First-authorized-route selection is deterministic.
- Read-only users never receive mutation controls.
- Role switching clears capability-dependent cache keys.

### Component and Router

- Employee cannot enter team exception routes by direct URL.
- Assigned manager sees only the manager queue and can act only where `can_decide` is true.
- HR/Admin see tenant-scoped operational routes.
- Auditor sees read-only queue/detail/export UI with no action buttons.
- Project manager without attendance capability cannot inherit manager access from its local mapping.
- Unauthorized queries are not sent before redirect/access-denied rendering.

### API and End-to-End

- Repeat every sensitive route and mutation directly without the UI for unauthorized actors.
- Verify cross-tenant IDs, out-of-hierarchy subjects, self-approval, stale active role, and forged capability payload attempts fail.
- Verify switching from privileged to unprivileged active role immediately removes cached data and routes.
- Verify browser back/forward and deep links do not reveal protected content.

## Acceptance Criteria

- Attendance navigation, route guards, data hooks, and actions use one server-derived capability model.
- Managers can access only their assigned/scoped queue.
- Auditors are read-only and receive only reviewed fields.
- Project-manager and director labels do not accidentally grant manager access.
- Protected queries do not execute before authorization is known.
- Active-role changes invalidate all attendance authorization and data state.
- Backend authorization remains mandatory and is covered by tenant, hierarchy, and mutation tests.
- Existing duplicated attendance role arrays are removed during implementation.

## Dependencies

- `GEO-S10-011` versioned attendance context contract.
- `GEO-S10-012` server-driven attendance context UX.
- `GEO-S10-015` regularization and manager queue UX plan.
