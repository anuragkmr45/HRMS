# Release Signoff Summary

## Current Scope

Strict 7-day hosted QA execution for Hawkaii HRMS on the active shared hosted QA/staging deployment.

## Timeline

- QA start: `2026-06-10 09:00 IST`
- Planned completion: `2026-06-16`
- Final submission: `2026-06-16 18:00 IST`

## Active Environment

- Frontend: `https://hawkaii-hrms.vercel.app`
- API: `https://hawkaii-hrms-dev-gyvr.onrender.com`

Future `hawkaii.in`, `qa.hawkaii.in`, and `dev.hawkaii.in` domain checks remain setup-required until isolated services are live.

## Release Gate

- All executable P0 tests in `qa/TESTING_TEST_CASES.xlsx` must pass or have an approved waiver.
- Any failed P0 is `No-Go` unless explicitly waived.
- Any P0 setup-required environment item makes the recommendation `Conditional Go` or `No-Go`, not `Go`.
- Production create/update/delete testing is disabled without a documented safe test tenant and reset process.

## Day-Wise Execution Points

- Day 1: 18 story points
- Day 2: 13 story points
- Day 3: 15 story points
- Day 4: 11 story points
- Day 5: 9 story points
- Day 6: 19 story points
- Day 7: 3 story points

## Known Manual Inputs

- Future domain DNS records and certificates.
- Render deploy hooks and secrets.
- Neon branch connection strings.
- Cloudinary credentials/product environments.
- Resend secrets and verified sender.
- GitHub Environment protection settings.
- Safe production test tenant and reset process if production mutation testing is ever requested.
