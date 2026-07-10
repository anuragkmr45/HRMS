# Incident Response Runbook

Last verified from the repository: 2026-06-30.

Use this runbook when QA, hosted dev, or production has a user-visible issue.

## First Five Minutes

1. Identify environment: local, hosted dev, QA, or production.
2. Capture exact URL, user, role, time, and action.
3. Capture API `request_id` from error response or network tab.
4. Check API readiness.
5. Check recent deploys, migrations, env changes, and worker deploys.

## Triage Matrix

| Symptom | First Check |
| --- | --- |
| Frontend blank or route fails | Vercel deployment, browser console, frontend env `VITE_API_BASE_URL`. |
| API health down | Render API logs, DB/Valkey/object storage dependency status. |
| Login/session fails | cookies, CORS, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, JWT/session secrets, Valkey. |
| Upload/download fails | Cloudinary config, document service logs, object storage dependency in readiness. |
| Email verification fails | Resend delivery mode, sender/domain, webhook secret, auth token records. |
| Approval/workflow wrong | backend module service/policy, role mapping, expected version conflicts. |
| Worker backlog | outbox worker logs, Valkey connectivity, dead-letter count. |

## Stabilization

Production stabilization order:

1. Stop further deploys.
2. Preserve evidence.
3. If API deploy caused outage, roll back API and worker to previous compatible deploy.
4. If frontend deploy caused outage, roll back Vercel deployment.
5. If migration caused issue, pause and assess forward-fix vs restore with release owner.
6. If external service config caused issue, correct config and redeploy/restart only the affected service.

## Required Evidence

- request ID
- environment
- deploy/build SHA
- API response status/body excerpt without secrets
- user role/persona
- recent commit/deploy
- migration/version involved
- screenshots or video when UI-specific

## Closeout

After mitigation:

- confirm health readiness
- confirm login/logout
- confirm affected workflow
- confirm no cross-environment data exposure
- document root cause and fix
- update relevant runbook or deployment doc if the response procedure changed

