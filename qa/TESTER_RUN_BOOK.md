# Tester Run Book

## Purpose

Use `qa/TESTING_TEST_CASES.xlsx` as the execution source of truth for the first full hosted QA cycle.

## Timeline

- QA start: `2026-06-10 09:00 IST`
- Planned completion: `2026-06-16`
- Final QA submission: `2026-06-16 18:00 IST`
- Daily submission cutoff: `20:00 IST`
- Final-day signoff cutoff: `18:00 IST`

## Environment URLs

Active shared hosted QA/staging:

- Frontend: `https://hawkaii-hrms.vercel.app`
- API: `https://hawkaii-hrms-dev-gyvr.onrender.com`

Future target domains:

- Production: `https://hawkaii.in` and `https://api.hawkaii.in`
- QA: `https://qa.hawkaii.in` and `https://qa-api.hawkaii.in`
- Hosted dev: `https://dev.hawkaii.in` and `https://dev-api.hawkaii.in`

Do not treat future production, QA, or hosted-dev domains as isolated/live until deployment evidence exists. Rows for those checks remain `Setup Required`.

## Execution Lanes

1. P0 Release Gate.
2. Deployment Smoke.
3. Core HR Regression.
4. Finance/Expense Regression.
5. Documents/Media Regression.
6. Workflow/Admin Regression.
7. Reports/Export Regression.
8. Permission/Security Regression.
9. Mobile/Cross-Browser Regression.
10. CI-CD/Environment Readiness.
11. Defect Retest / Final Signoff.

## Filling The Workbook

- Start with the `Execution Summary` tab to confirm timeline, active URLs, total cases, and release recommendation rules.
- Open `How To Use` for the short workflow and `Tester Guide` for column-by-column instructions.
- Use `Main Test Cases` when filtering all 51 cases by day, owner, lane, priority, or status.
- Use detailed tabs when working in one focused area, for example `P0 Smoke UAT Gate`, `Sprint Regression`, `Full Regression`, or `Deployment Smoke`.
- Execute rows by `Execution Day`.
- Keep `Actual Result` factual.
- Add evidence for every executed row: screenshot, export file, API response/request ID, email/notification, or document URL.
- Use `Pass`, `Fail`, `Blocked`, `Setup Required`, `Not Run`, or `Not Applicable`.
- Add `Defect ID` for every failure.
- Add `Blocked Reason`, owner, and next action for every blocked/setup-required row.
- Submit each day by the cutoff in `Daily Submission Due`.

## Workbook Column Guide

- `Test Case ID`: unique row ID. Use it in screenshots, defect tickets, and evidence names.
- `Execution Day`: day to run the row. Do not move it unless QA Lead approves.
- `Planned Start Date` / `Planned End Date`: planned execution date for the row.
- `Daily Submission Due`: deadline for that row's evidence and status.
- `Final Submission Due`: final QA package deadline.
- `Completion Owner`: person/team responsible for executing the case.
- `Reviewer / Signoff Owner`: person/team responsible for reviewing evidence and status.
- `Execution Lane`: workstream such as P0 gate, Core HR, Expense, Documents, Reports, Mobile, or CI/CD readiness.
- `Priority`: P0 blocks release/signoff, P1 is important regression, P2 is lower-risk or future readiness.
- `Story Points`: testing effort estimate. Do not change it during execution unless QA Lead approves.
- `Preconditions`: setup that must exist before testing.
- `Steps`: concise actions to perform.
- `Expected Result`: what must happen for the row to pass.
- `Status`: current test state.
- `Actual Result`: what actually happened.
- `Evidence Link / Screenshot Ref`: link, file name, request ID, export file, document URL, notification/email evidence, or CI run URL.
- `Defect ID`: required when status is `Fail`.
- `Blocked Reason`: required when status is `Blocked` or `Setup Required`.
- `Retest Due Date`: deadline for retesting a fixed defect.
- `Submission Status`: whether the evidence has been submitted or reviewed.

## Status Meanings

- `Not Run`: testing has not started.
- `Pass`: expected result matched and evidence is attached.
- `Fail`: feature was testable but behaved incorrectly; add defect ID and evidence.
- `Blocked`: tester cannot execute because data, credential, role, setup, or environment is missing.
- `Setup Required`: row depends on future domain/service/environment setup that is not live.
- `Not Applicable`: reviewer-approved reason why this row does not apply to this cycle.

## Defect SLA

- Critical/P0 defect: report immediately; retest same day when fixed.
- High/P1 defect: report same day; retest by next execution day.
- Medium/P2 defect: log with evidence; include in final risk summary if not fixed.
- Blocked test: add blocker reason, owner, and next action. Do not silently skip.
- Any failed P0 must appear in the release signoff summary.

## Retest Rules

- Retest fixed P0 items the same day when a fix is available.
- Retest fixed P1 items no later than the next execution day.
- Retest P2 items by Day 7 if they affect signoff confidence.
- Keep original failure evidence and add new retest evidence.

## Role Safety

Use dedicated QA users through the approved access method. Backend permissions are the source of truth. If UI hides an action but a direct API call allows it, log a security/business defect. If UI shows an action but backend forbids it, backend is correct and the UI may still need a defect.

## Production Safety

Production create/update/delete testing is disabled unless a safe production test tenant and reset process are explicitly documented. If the safe tenant/reset process is missing, mark production mutation rows `Blocked` or `Setup Required`.

## Cloudinary Storage Check

Hosted QA signoff must use real Cloudinary behavior for document/media persistence. Upload a safe test document, open it, and confirm the link remains valid where the environment supports it. Do not upload personal or sensitive documents.

## Email Verification Check

In hosted QA, opening the verification link should show a confirmation step and should not auto-submit. Verification completes only after user action.

## Empty Workspace Check

Create or bootstrap a new company only in the active QA/staging environment. Dashboards and module pages should show empty real org-scoped states, not unrelated demo data.

## CI/CD Manual Check

Review GitHub Actions evidence. PRs should run checks only. Pushes to `dev`, `qa`, and `main` should deploy only after checks pass, once the corresponding isolated hosted services exist. Production should require GitHub Environment approval.

## Local QA Setup - macOS

Prerequisites proven by repo scripts: Node 22+, pnpm 10+, Docker with Compose.

Backend:

```bash
cd hrms_backend
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

Frontend:

```bash
cd hrms-client
pnpm install
pnpm dev
```

Health check: `http://localhost:3001/api/v1/health/ready`.

## Local QA Setup - Ubuntu/Linux

Use Node 22+, pnpm 10+, Docker Engine with Compose. Use the same backend/frontend commands as macOS.

## Local QA Setup - Windows

Use WSL2 or Git Bash for POSIX-style commands. Install Node 22+, pnpm 10+, and Docker Desktop with WSL2 integration. Run the same backend/frontend commands from WSL2.

## Common Errors

- Missing Cloudinary credentials: mark storage tests `Blocked` or `Setup Required`.
- Wrong API domain: stop testing and fix frontend environment configuration.
- 401 while still viewing dashboard: log auth/session defect with request ID.
- Empty data: pass only if workspace is expected to be empty.
