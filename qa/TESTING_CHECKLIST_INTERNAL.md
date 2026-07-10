# Internal QA Checklist

This checklist summarizes `qa/TESTING_TEST_CASES.xlsx` for the first full hosted QA cycle.

## Timeline

- Sprint name: Hosted QA Cycle 1 - Strict 7-Day Execution
- QA start: `2026-06-10 09:00 IST`
- Planned completion: `2026-06-16`
- Final QA submission: `2026-06-16 18:00 IST`
- Daily submission cutoff: `20:00 IST`
- Final-day signoff package cutoff: `18:00 IST`

## Active Environment

- Active shared hosted QA/staging frontend: `https://hawkaii-hrms.vercel.app`
- Active shared hosted QA/staging API: `https://hawkaii-hrms-dev-gyvr.onrender.com`
- Future production: `https://hawkaii.in` and `https://api.hawkaii.in`
- Future QA: `https://qa.hawkaii.in` and `https://qa-api.hawkaii.in`
- Future hosted dev: `https://dev.hawkaii.in` and `https://dev-api.hawkaii.in`

Until the future domains and isolated services are live, treat Vercel plus Render as one shared hosted QA/staging environment. Future-domain and environment-isolation rows stay `Setup Required`.

## Coverage

- Total cases: 51
- P0: 28
- P1: 16
- P2: 7
- Day 1: 18 SP
- Day 2: 13 SP
- Day 3: 15 SP
- Day 4: 11 SP
- Day 5: 9 SP
- Day 6: 19 SP
- Day 7: 3 SP

## Daily Gates

- Day 1: P0 release gate and shared hosted environment readiness.
- Day 2: HR core workflows.
- Day 3: expense, documents, and media.
- Day 4: projects, assets, helpdesk, and notifications.
- Day 5: reports, admin policies, and business rules.
- Day 6: full regression, cross-browser, CI/CD, and future-domain readiness.
- Day 7: defect retest, risk confirmation, and final QA submission.

## Defect SLA

- Critical/P0 defect: report immediately; retest same day when fixed.
- High/P1 defect: report same day; retest by next execution day.
- Medium/P2 defect: log with evidence; include in final risk summary if not fixed.
- Blocked test: add blocker reason, owner, and next action. Do not silently skip.
- Any failed P0 must appear in the release signoff summary.

## Signoff Rules

- `Go`: all P0 passed, no unwaived P0 blockers, risks documented.
- `Conditional Go`: current shared QA/staging can proceed but setup-required future-domain or non-release-blocking risks remain.
- `No-Go`: any failed P0, unwaived release blocker, or unsafe production testing request.

Production create/update/delete testing remains disabled unless a safe production test tenant and reset process are explicitly documented.
