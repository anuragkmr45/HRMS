# Hawkaii HRMS QA Checklist

This is the client-friendly QA summary for the first full hosted QA cycle.

## Timeline

- QA start: `2026-06-10 09:00 IST`
- Planned completion: `2026-06-16`
- Final QA submission: `2026-06-16 18:00 IST`
- Daily evidence/status submission: `20:00 IST`

## Hosted QA Environment

- Frontend: `https://hawkaii-hrms.vercel.app`
- API: `https://hawkaii-hrms-dev-gyvr.onrender.com`

The future production, QA, and hosted-dev Hawkaii domains are tracked as readiness items until those isolated services are live.

## Execution Order

1. P0 release gate and environment readiness.
2. HR core workflows.
3. Expense, documents, and media.
4. Projects, assets, helpdesk, and notifications.
5. Reports, admin policies, and business rules.
6. Full regression, cross-browser checks, and deployment readiness.
7. Defect retest and final QA submission.

## Release Blockers

- Login, logout, or session failure.
- Cross-company or unauthorized data exposure.
- Production or hosted QA using mock API/storage fallback for signoff-critical flows.
- Broken expense approval, payment, or settlement flow.
- Document upload/open/delete failure in hosted QA.
- Any failed P0 without explicit waiver.

Production data-changing tests are not part of this cycle unless a safe test tenant and reset process are documented.
