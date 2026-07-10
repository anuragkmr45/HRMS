# Secrets Checklist

Do not commit real secret values. Store hosted secrets in GitHub, Render, Vercel, Neon, Cloudinary, and Resend dashboards as appropriate.

## GitHub Actions Secrets

- `DEV_RENDER_API_DEPLOY_HOOK_URL`
- `DEV_RENDER_WORKER_DEPLOY_HOOK_URL`
- `QA_RENDER_API_DEPLOY_HOOK_URL`
- `QA_RENDER_WORKER_DEPLOY_HOOK_URL`
- `PROD_RENDER_API_DEPLOY_HOOK_URL`
- `PROD_RENDER_WORKER_DEPLOY_HOOK_URL`

## Render Backend Secrets Per Environment

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `RESEND_API_KEY` where email send mode is enabled
- `RESEND_WEBHOOK_SECRET` where Resend webhooks are enabled
- `BUILD_SHA` if not set automatically by the platform

## Vercel Frontend Env Per Environment

- `VITE_APP_ENV`
- `VITE_APP_VERSION`
- `VITE_BUILD_SHA`
- `VITE_API_BASE_URL`
- `VITE_API_ENABLED=true`
- `VITE_API_MOCK_FALLBACK=false`

## Production Blockers

- Weak/default JWT secrets.
- `CLOUDINARY_MOCK_UPLOADS=true`.
- `EMAIL_DELIVERY_MODE=send` without `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`.
- `OPENAPI_PUBLIC=true` unless explicitly approved.
- Frontend mock fallback enabled.
- QA/dev/prod sharing the same `DATABASE_URL` or Valkey connection.

## Email Delivery Optional Startup

Resend is optional for initial hosted setup. QA and production may start with:

```env
EMAIL_DELIVERY_MODE=disabled
```

In that mode the application remains usable for existing/admin-created users, and signup/verification pages show a clear message that email delivery is disabled. Enable `send` before opening public self-signup.
