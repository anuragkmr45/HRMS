# Implementation Documentation

Last verified from the repository: 2026-06-30.

This folder tracks implementation status, coverage, and documentation completeness. It is not the place for operational steps; use `../runbooks/` for procedures and `../deployment/` for hosted setup.

## Implementation Set

| Document | Purpose |
| --- | --- |
| `HRMS_PRODUCTION_TASK_SHEET.md` | Large historical/current implementation task sheet and module completion log. |
| `implementation-status-index.md` | Short current implementation summary with source-of-truth pointers. |
| `documentation-coverage-audit.md` | Required documentation set, current coverage, gaps, and maintenance ownership. |

## Current Source Evidence

| Evidence | Current Value |
| --- | --- |
| Backend OpenAPI | 245 operations across 214 paths. |
| Backend modules | 19 module directories under `hrms_backend/src/modules/`. |
| Frontend route files | 87 `.tsx` route files under `hrms-client/src/routes/`. |
| Frontend domains | 17 domain adapter directories under `hrms-client/src/domains/`. |
| DB migrations | 25 SQL migrations under `hrms_backend/src/db/migrations/`. |

Regenerate or re-check these before making broad implementation claims.

