# Resend Email Verification Deployment Runbook

Last updated: 2026-05-25

Use this runbook to deploy, configure, test, support, and troubleshoot Resend-backed email verification in staging and production. The architecture overview is in `docs/architecture/email-verification.md`.

## Scope

This runbook covers:

- Resend email verification and resend delivery
- password reset email delivery
- Resend webhook setup and support
- database migration validation
- staging and production smoke tests

It does not change the auth architecture. Resend is the transport provider only. Verification remains owned by the backend and `platform.auth_tokens`.

## Environment Variables

| Variable | Development required | Staging required | Production required | Example placeholder | Purpose and usage |
| --- | --- | --- | --- | --- | --- |
| `EMAIL_DELIVERY_MODE` | No | Yes, use `send` for real staging tests | Required; use `send` when public self-signup/reset email is enabled, or `disabled` for an approved closed launch | `log`, `send`, `disabled` | Controls email behavior. `log` records local/log delivery without Resend; `disabled` suppresses sending; `send` uses Resend. Resend secrets are required only when mode is `send`. |
| `EMAIL_DELIVERY_PROVIDER` | No | Yes | Yes | `resend` | Provider selector. Current implementation expects `resend`. |
| `RESEND_API_KEY` | Only when `EMAIL_DELIVERY_MODE=send` | Yes | Yes | `replace-with-resend-api-key` | Secret used by the Resend adapter when sending real email. Never commit. |
| `RESEND_FROM_EMAIL` | No, default exists | Yes | Yes | `Product Name <verify@example.com>` | Verified sender address used as the email `from` value. Use a Resend-verified domain. |
| `RESEND_FROM_NAME` | No | Optional | Optional | `Product Name` | Optional display name when `RESEND_FROM_EMAIL` is not already a full `Name <email>` value. |
| `RESEND_REPLY_TO_EMAIL` | No | Optional | Optional | `support@example.com` | Optional `reply_to` address sent to Resend. |
| `RESEND_WEBHOOK_SECRET` | Only for local webhook tests | Yes | Yes | `replace-with-resend-webhook-secret` | Secret from the Resend webhook configuration. Required for production and used for Svix-style signature verification. Never commit. |
| `FRONTEND_URL` | Yes, default exists | Yes | Yes | `https://staging-hrms.example.com` | Trusted public frontend URL used to build verification and password reset links. Do not use request `Host` headers. |
| `APP_URL` | No, defaults to `API_BASE_URL` | Recommended | Recommended | `https://staging-api.example.com` | Backend public URL/config value. The current verification/reset links use `FRONTEND_URL`; keep `APP_URL` aligned with the public backend URL for deployment consistency. |
| `RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` | No, default `300` | Yes, recommended `300` | Yes, recommended `300` | `300` | Rejects old or future webhook timestamps to reduce replay risk. Must be a positive integer. |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS` | No, default `60` | Recommended | Recommended | `60` | Per-email resend cooldown used by resend and repeated pending signup attempts. |
| `EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT` | No, default `5` | Recommended | Recommended | `5` | Per-email hourly verification send limit. |
| `EMAIL_VERIFICATION_RESEND_DAILY_LIMIT` | No, default `10` | Recommended | Recommended | `10` | Per-email daily verification send limit. |

The example files already use placeholders. Do not put real Resend API keys, webhook secrets, or production-only values in tracked files.

## Local Development

Use `.env.local` for local development. The tracked `.env.dev.example` is a hosted dev template, so do not copy it directly unless you replace hosted URLs, Neon, Valkey, and Cloudinary values with local ones.

```bash
cd hrms_backend
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm dev
```

For ordinary local development, keep:

```env
EMAIL_DELIVERY_MODE=log
EMAIL_DELIVERY_PROVIDER=resend
FRONTEND_URL=http://localhost:8080
```

Use `EMAIL_DELIVERY_MODE=send` locally only when intentionally testing real Resend delivery. Do not use production Resend API keys locally. Do not commit `.env`.

## Database Migration

Apply the DB migration in staging before enabling real email sending.

The migration `hrms_backend/src/db/migrations/0020_resend_email_delivery.sql` adds or updates:

- `core.users.email_verified_at`
- `core.users.email_verification_status`
- auth token metadata/revocation/send fields
- `platform.email_deliveries`
- `platform.email_events`

Existing active, non-deleted users are backfilled as verified so they are not locked out. Pending/unverified users remain pending or unverified.

Commands:

```bash
cd hrms_backend
pnpm db:migrate
pnpm db:verify:no-cross-schema-fks
```

For a built production artifact, use:

```bash
cd hrms_backend
pnpm build
pnpm db:migrate:prod
pnpm db:verify:no-cross-schema-fks
```

Safe staging validation queries:

```sql
SELECT email_verification_status, count(*)
FROM core.users
GROUP BY email_verification_status
ORDER BY email_verification_status;

SELECT count(*) AS active_without_verified_status
FROM core.users
WHERE employment_status = 'active'
  AND deleted_at IS NULL
  AND email_verification_status <> 'verified';

SELECT status, count(*)
FROM platform.auth_tokens
WHERE token_type = 'email_verification'
GROUP BY status
ORDER BY status;

SELECT status, count(*)
FROM platform.email_deliveries
GROUP BY status
ORDER BY status;
```

Rollback caution: do not roll back user verification fields blindly after users have verified. If rollback is needed, coordinate application version, migration state, and any user/token records created while the feature was live.

## Resend Domain And DNS Setup

1. Create or select the Resend account/project for the environment.
2. Add the sending domain or a subdomain. A subdomain such as `mail.example.com` or `verify.example.com` keeps auth mail reputation isolated.
3. Verify DNS records in Resend:
   - SPF
   - DKIM
   - DMARC recommended
4. Use a sender such as:

```text
Product Name <verify@hawkaii.in>
```

Keep auth and verification email on a trustworthy domain or subdomain. Confirm the domain status is verified in Resend before switching staging or production to `EMAIL_DELIVERY_MODE=send`. DNS propagation can take time; test with staging first.

## Resend Webhook Setup

Register this endpoint in Resend:

```text
POST https://your-api-domain.com/api/v1/webhooks/resend
```

Subscribe to these events:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.bounced`
- `email.failed`
- `email.complained`
- `email.suppressed`

Security behavior:

- The webhook route is public at routing level but protected by signature verification.
- Required headers are `svix-id`, `svix-timestamp`, and `svix-signature`.
- Raw request body is required for signature verification.
- `RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` rejects replayed, stale, and too-far-future webhook timestamps.
- Duplicate webhook events are deduplicated by provider event id, with `svix-id` as fallback.
- Webhook events update delivery status only.
- Webhook events must never mark users verified.

## Staging Checklist

1. Apply DB migration in staging:

```bash
cd hrms_backend
pnpm db:migrate
pnpm db:verify:no-cross-schema-fks
```

2. Set staging env:
   - `EMAIL_DELIVERY_MODE=send`
   - `EMAIL_DELIVERY_PROVIDER=resend`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `RESEND_WEBHOOK_SECRET`
   - `FRONTEND_URL`
   - `APP_URL`
   - `RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300`

3. Verify Resend domain DNS:
   - SPF
   - DKIM
   - DMARC recommended

4. Register Resend webhook:

```text
POST https://your-api-domain.com/api/v1/webhooks/resend
```

5. Subscribe to the required Resend email events listed above.

6. Test real signup:
   - signup creates pending user
   - verification email arrives
   - link uses the staging frontend domain
   - clicking link verifies user
   - verified user can log in

7. Test resend:
   - resend works once
   - immediate resend is blocked by cooldown
   - response does not reveal account existence

8. Test password reset:
   - reset email arrives
   - link uses the staging frontend domain
   - token works once only

9. Test webhook:
   - Resend dashboard shows delivery
   - backend stores event in `platform.email_events`
   - matching delivery row updates in `platform.email_deliveries`
   - duplicate webhook does not create duplicate processing

10. Confirm production-mode behavior in a production-like environment:
    - no `dev_only` token in responses
    - no raw token logs
    - no secrets in logs

Useful commands:

```bash
cd hrms_backend
pnpm run typecheck
pnpm run lint
pnpm test:integration src/modules/auth/__tests__/auth-email-delivery.integration.test.ts
pnpm api:docs:verify
```

## Production Checklist

1. Confirm staging passed.
2. Confirm DB migration applied.
3. Confirm production env vars are set outside the repo.
4. Confirm `EMAIL_DELIVERY_MODE=send`.
5. Confirm Resend production domain is verified.
6. Confirm webhook URL points to the production API.
7. Confirm webhook secret matches the production Resend webhook.
8. Confirm `FRONTEND_URL` is the production frontend URL.
9. Confirm `APP_URL` is the production backend URL if used by deployment tooling.
10. Confirm no dev-only token behavior is enabled.
11. Confirm no test API keys are used.
12. Confirm logs do not include:
    - raw verification tokens
    - raw reset tokens
    - API keys
    - webhook secrets
13. Run a real production smoke test with an internal test account.
14. Confirm email arrives.
15. Confirm verification link works.
16. Confirm login works after verification.
17. Confirm resend cooldown works.
18. Confirm password reset works.
19. Confirm webhook delivery events are stored.
20. Confirm duplicate webhook handling is idempotent.

Production-style commands:

```bash
cd hrms_backend
cp .env.prod.example .env.prod
# replace every production secret before starting; do not commit .env.prod
pnpm docker:prod:config
pnpm docker:prod:up
```

## Manual Test Scenarios

| Scenario | Precondition | Action | Expected result | Evidence |
| --- | --- | --- | --- | --- |
| New signup flow | Staging/prod env is configured with `EMAIL_DELIVERY_MODE=send` | Submit `POST /api/v1/auth/signup` through UI or API | Pending user and verification token created; email queued/sent | API response, `core.users`, `platform.auth_tokens`, `platform.email_deliveries`, Resend dashboard |
| Verify email success | User has active unexpired verification token | Click email link or call `POST /api/v1/auth/verify-email` | Token becomes used; user has `email_verified_at`; status is `verified` | API response, `platform.auth_tokens`, `core.users` |
| Expired verification token | Token expiry is in the past | Submit token | API returns invalid/expired error; token may be marked expired | API response, `platform.auth_tokens.status` |
| Reused verification token | Token already used | Submit token again | API rejects reuse | API response, `platform.auth_tokens.used_at` |
| Resend verification success | User is inactive pending/unverified and outside limits | Call `POST /api/v1/auth/email-verifications/resend` | Generic accepted response; email sent | API response, delivery row, Resend dashboard |
| Resend cooldown | Verification email was just sent | Call resend immediately | Generic accepted response; no second email | API response has retry guidance; no new delivery row |
| Resend hourly/daily limits | Email has reached configured limits | Call resend or repeat pending signup | Generic response; no email sent | `platform.auth_tokens.last_sent_at`, delivery count |
| Unknown email resend | Email does not exist | Call resend | Generic accepted response; no email sent | API response, no delivery row |
| Already verified resend | User is verified | Call resend | Generic accepted response; no email sent | API response, no delivery row |
| Password reset success | Active user has credential | Call password reset request and use link | Reset email arrives; token works once | API response, delivery row, `platform.auth_tokens` |
| Password reset token one-time use | Reset token already consumed | Submit token again | API rejects reuse | API response, `platform.auth_tokens.used_at` |
| Webhook valid signature | Resend webhook secret is correct | Send valid Resend webhook or replay from dashboard | `200` response and event stored | Resend dashboard, `platform.email_events`, app logs |
| Webhook invalid signature | Wrong/missing signature | Send webhook with invalid headers | `400` response; no event stored | API response/logs, `platform.email_events` |
| Webhook duplicate event | Same Resend/Svix event delivered twice | Replay the same event | Second valid delivery returns success but is duplicate | API response, one `platform.email_events` row |
| Bounced/failed email event | Email bounced/failed in Resend | Deliver bounce/failure webhook | Delivery status updates; webhook does not verify user | `platform.email_deliveries`, `core.users`, Resend dashboard |
| Production token exposure check | Production env active | Signup/resend/password reset | Response has no `dev_only`; logs contain no raw token | API response, logs |

## Troubleshooting And Support

### Verification email not received

Check:

- `EMAIL_DELIVERY_MODE`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- Resend domain status
- Resend dashboard logs
- `platform.email_deliveries`
- spam/junk folder
- bounce, complaint, or suppression events

### Verification link uses wrong domain

Check:

- `FRONTEND_URL`
- frontend deployment URL
- whether an operator accidentally expected request `Host` header behavior

The backend builds verification and password reset links from `FRONTEND_URL`.

### Webhook returns 400

Check:

- `RESEND_WEBHOOK_SECRET`
- raw body handling for `application/json`
- `svix-id`
- `svix-timestamp`
- `svix-signature`
- `RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`
- server clock drift

### Webhook events appear duplicated

Resend/Svix webhooks are at-least-once. Duplicates are expected. The backend deduplicates by provider event id, with `svix-id` as fallback, and returns success for valid duplicate events.

### User cannot log in after signup

Check:

- `core.users.employment_status`
- `core.users.email_verified_at`
- `core.users.email_verification_status`
- `platform.auth_tokens.status`
- `platform.auth_tokens.expires_at`
- whether the user signed up without a password and must complete the password setup step

### Resend button does not send another email

Check:

- `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS`
- `EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT`
- `EMAIL_VERIFICATION_RESEND_DAILY_LIMIT`
- pending/unverified status
- already verified account suppression
- suspended/terminated user state

### Password reset email not sent

Check:

- `EMAIL_DELIVERY_MODE`
- user exists and is active with a credential
- `platform.email_deliveries`
- Resend dashboard errors
- provider failure fields on delivery row

### Emails are bouncing

Check:

- recipient address
- domain reputation
- Resend bounce event details
- `platform.email_deliveries.status`
- `core.users.email_verification_status` if bounce handling updated it

### Production exposes a dev-only token

Treat this as a security incident.

Check:

- `NODE_ENV`
- production deployment config
- auth email tests
- application logs
- API gateway/proxy response rewriting

## Security Checklist

- [ ] Raw verification/reset tokens are never stored.
- [ ] Raw verification/reset tokens are never logged.
- [ ] Production responses do not expose tokens.
- [ ] Verification uses app-owned token validation.
- [ ] Webhook events never verify users.
- [ ] Webhook signature verification uses raw body.
- [ ] Webhook timestamp tolerance is enforced.
- [ ] Webhook events are deduplicated.
- [ ] Verification links use trusted `FRONTEND_URL`.
- [ ] Resend API key and webhook secret are never committed.
- [ ] Resend responses/errors do not leak secrets.
- [ ] Unknown-email and already-verified flows are non-enumerating.
- [ ] Resend cooldown/hourly/daily limits are enforced.
- [ ] Repeated pending signup cannot bypass resend limits.
- [ ] Existing active users are not locked out by migration.

## Operational Monitoring

Monitor Resend dashboard:

- sent
- delivered
- delivery delayed
- bounced
- failed
- complained
- suppressed

Monitor database:

- `platform.email_deliveries`
- `platform.email_events`
- `platform.auth_tokens`
- `core.users.email_verified_at`
- `core.users.email_verification_status`

Monitor application logs:

- safe delivery failures
- webhook verification failures
- rate-limit events
- resend cooldown and limit events

Alerts to consider:

- high bounce rate
- high failed email count
- webhook `400` spike
- signup verification failure spike
- Resend quota/rate-limit errors
- many resend attempts from the same IP or email

## References

- [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email)
- [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend Usage Limits](https://resend.com/docs/api-reference/rate-limit)
- [Resend Webhook Verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Resend Webhook Event Types](https://resend.com/docs/webhooks/event-types)
- [Resend Webhook Retries and Replays](https://resend.com/docs/webhooks/retries-and-replays)
- [Resend Domains](https://resend.com/docs/dashboard/domains/introduction)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [Fastify Hooks](https://fastify.dev/docs/latest/Reference/Hooks/)
- [Fastify Content Type Parser](https://fastify.dev/docs/latest/Reference/ContentTypeParser/)
