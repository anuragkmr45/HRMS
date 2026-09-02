# Device Registration Event Contract

Status: Contract available for Sprint 13 GEO-S13-008. Runtime producer deferred.

`platform.device.registered` represents the future successful creation of an initial `platform.registered_devices` row with status `registered`. It does not represent device activation, trust approval, authentication approval, attestation verification, or notification delivery readiness.

Current backend code does not expose an executable device-registration route or service. The future producer belongs in that future initial device-registration transaction after the row is created and only once for that registered device.

Recommended future outbox identity:

- `aggregate_type`: `device`
- `aggregate_id`: `registered_device_id`
- `idempotency_key`: `platform.device.registered:<registered_device_id>`

Payload allowlist:

- `schema_version`
- `company_id`
- `user_id`
- `registered_device_id`
- `platform`
- `status`
- `registered_at`

The payload must never contain installation IDs or hashes, push tokens, attestation verdicts or artifacts, attestation challenge hashes, provider metadata, fingerprints, authentication/session tokens, HTTP headers, IP addresses, user agents, or arbitrary metadata.
