# Environment Matrix

| Environment | Branch | Frontend | API | Backend `NODE_ENV` | Backend `APP_ENV` | Frontend `VITE_APP_ENV` | DB | Valkey | Cloudinary | Email |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local | feature/local | `http://localhost:8080` or local Vite URL | `http://localhost:3001` | `development` | `local` | local/unset | Local Docker Postgres | Local Docker Valkey | Mock allowed | log/disabled |
| Hosted dev | `dev` | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` | `production` | `development` | `development` | Neon `dev` branch | `hawkaii-hrms-dev-valkey` | `hawkaii-hrms/dev` or dev product env | log by default |
| QA/UAT | `qa` | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` | `production` | `qa` | `qa` | Neon `qa` branch | `hawkaii-hrms-qa-valkey` | `hawkaii-hrms/qa` or QA product env | disabled by default; send when Resend is configured |
| Production | `main` | `https://hawkaii.in` | `https://api.hawkaii.in` | `production` | `production` | `production` | Neon production branch | `hawkaii-hrms-valkey` | `hawkaii-hrms/prod` or prod product env | disabled by default; send when Resend is configured |

## Rules

- Local development remains local.
- Hosted dev is for shared integration validation and demos, not normal feature coding.
- QA and production must not use API mock fallback or mock Cloudinary.
- QA/dev/prod must not share database connection strings or Valkey services.
- Production OpenAPI/Swagger exposure should stay disabled with `OPENAPI_PUBLIC=false`.
