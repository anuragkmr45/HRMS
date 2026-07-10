# Deployment Documentation

Last verified from the repository: 2026-06-30.

This folder contains hosted deployment references for Hawkaii HRMS.

## Deployment Set

| Document | Purpose |
| --- | --- |
| `environment-matrix.md` | Environment URLs, branch mapping, backend/frontend env modes, DB/Valkey/Cloudinary/email isolation. |
| `hosted-deployment.md` | Full hosted architecture and setup guide for Vercel, Render, Neon, Valkey, Cloudinary, and Resend. |
| `ci-cd-runbook.md` | GitHub Actions and branch/deploy hook behavior. |
| `deployment-verification-checklist.md` | Pre-deploy, deploy, and post-deploy verification gates. |
| `dns-checklist.md` | DNS, SSL, CORS, and cookie domain checks. |
| `secrets-checklist.md` | Required secrets and production blockers. |
| `rollback-runbook.md` | Backend, frontend, database, media, and signoff rollback guidance. |

## Environment Summary

| Branch | Environment | Frontend | API |
| --- | --- | --- | --- |
| feature branches | Local/PR | local Vite | local Fastify |
| `dev` | Hosted dev | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` |
| `qa` | QA/UAT | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` |
| `main` | Production | `https://hawkaii.in` | `https://api.hawkaii.in` |

## Source Files

| File | Purpose |
| --- | --- |
| `.github/workflows/branch-ci-cd.yml` | Branch checks and Render deploy hooks. |
| `render.yaml` | Production Render API/worker/Valkey blueprint. |
| `infra/render/render.dev.yaml` | Hosted dev Render blueprint. |
| `infra/render/render.qa.yaml` | QA Render blueprint. |
| `hrms-client/vercel.json` | Vercel frontend build settings. |
| `hrms_backend/infra/docker/` | Local/QA/prod Docker runtime definitions. |

## Deployment Rules

- Hosted dev, QA, and production must not share database or Valkey resources.
- Production frontend must have API mock fallback disabled.
- QA and production must not use mock Cloudinary.
- Production OpenAPI/Swagger should stay disabled unless explicitly approved.
- Backend API and worker should deploy from compatible commits.
- Migrations must be applied before traffic uses routes that depend on them.

