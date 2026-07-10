# QA Timeline Execution Plan

## Sprint

- Sprint name: Hosted QA Cycle 1 - Strict 7-Day Execution
- Start date/time: `2026-06-10 09:00 IST`
- Completion date/time: `2026-06-16 18:00 IST`
- Final submission date/time: `2026-06-16 18:00 IST`
- Active frontend: `https://hawkaii-hrms.vercel.app`
- Active API: `https://hawkaii-hrms-dev-gyvr.onrender.com`

The current Vercel and Render deployment is one shared hosted QA/staging environment. Future production, QA, and hosted-dev domains remain setup-required until live.

## Daily Execution Plan

| Day | Date | Scope | Submission Due |
| --- | --- | --- | --- |
| Day 1 | 2026-06-10 | P0 release gate, current hosted URL/API health, auth/session, signup/email verification, onboarding, RBAC, storage smoke | 20:00 IST |
| Day 2 | 2026-06-11 | HR core: employee profile, attendance, leave/WFH, manager/HR decisions, timesheet, EMS profile | 20:00 IST |
| Day 3 | 2026-06-12 | Expense workflow, self-approval prevention, documents, media, Cloudinary behavior | 20:00 IST |
| Day 4 | 2026-06-13 | Projects, assets, helpdesk, notifications, role-specific menu behavior | 20:00 IST |
| Day 5 | 2026-06-14 | Reports/export, admin settings, policy preview, business rule traceability | 20:00 IST |
| Day 6 | 2026-06-15 | Full regression, mobile/cross-browser, CI/CD, CORS/session, future-domain readiness | 20:00 IST |
| Day 7 | 2026-06-16 | Defect retest, final risks, blocked items, execution summary, signoff package | 18:00 IST |

## Exit Criteria

- All assigned P0 rows are passed, failed with defect ID, or explicitly setup-required/blocked with owner and next action.
- All failed P0 rows appear in the release signoff summary.
- All evidence links or references are added before daily cutoff.
- No production data-changing test is executed without a documented safe tenant and reset process.
- Final signoff includes release recommendation, open risks, blocked/setup-required items, and waiver status if any.

## Blocker Escalation

- P0 blocker: notify QA Lead and Release Manager immediately.
- P1 blocker: notify QA Lead the same day.
- P2 blocker: log by daily cutoff and include in final risk summary if unresolved.
- Environment/domain setup blocker: keep row `Setup Required` until live evidence exists.

## Defect Severity SLA

- Critical/P0 defect: report immediately; retest same day when fixed.
- High/P1 defect: report same day; retest by next execution day.
- Medium/P2 defect: log with evidence; include in final risk summary if not fixed.
- Blocked test: add blocker reason, owner, and next action. Do not silently skip.

## Retest Rules

- Retest P0 fixes same day when available.
- Retest P1 fixes by the next execution day.
- Retest P2 fixes by final day if included in signoff scope.
- Keep both failure evidence and retest evidence.

## Future Cycle Non-Blockers

- Future isolated `hawkaii.in`, `qa.hawkaii.in`, and `dev.hawkaii.in` domain validation can move to the environment-readiness cycle if current shared QA/staging release gate passes.
- Deeper automation, performance/load testing, and advanced browser matrix can move to later cycles unless a P0 defect is found.
- P2 visual polish or edge browser variation can move forward with documented known risk.
