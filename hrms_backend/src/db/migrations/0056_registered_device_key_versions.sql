-- GEO-S14-005: versioned registered-device public-key storage pattern only.
-- Logical references are intentionally not database foreign keys under the
-- current migration policy. Future application code that writes these rows
-- must validate company_id + registered_device_id ownership in the same
-- transaction before insert/update.

CREATE TABLE IF NOT EXISTS platform.registered_device_key_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  registered_device_id uuid NOT NULL,
  key_version integer NOT NULL,
  algorithm text NOT NULL,
  public_key_format text NOT NULL,
  public_key_material text NOT NULL,
  public_key_fingerprint_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz NULL,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT platform_registered_device_key_versions_device_version_uq
    UNIQUE (company_id, registered_device_id, key_version),
  CONSTRAINT platform_registered_device_key_versions_device_fingerprint_uq
    UNIQUE (company_id, registered_device_id, public_key_fingerprint_sha256),
  CONSTRAINT platform_registered_device_key_versions_key_version_check
    CHECK (key_version > 0),
  CONSTRAINT platform_registered_device_key_versions_algorithm_check
    CHECK (btrim(algorithm) <> ''),
  CONSTRAINT platform_registered_device_key_versions_public_key_format_check
    CHECK (btrim(public_key_format) <> ''),
  CONSTRAINT platform_device_key_versions_public_key_material_check
    CHECK (btrim(public_key_material) <> ''),
  CONSTRAINT platform_registered_device_key_versions_fingerprint_check
    CHECK (public_key_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_registered_device_key_versions_status_check
    CHECK (status IN ('active', 'retired', 'revoked')),
  CONSTRAINT platform_device_key_versions_effective_interval_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CONSTRAINT platform_registered_device_key_versions_updated_at_check
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS platform_registered_device_key_versions_lookup_idx
  ON platform.registered_device_key_versions (
    company_id,
    registered_device_id,
    status,
    key_version DESC
  );

COMMENT ON TABLE platform.registered_device_key_versions IS
  'Versioned public-key records for registered devices. Device signatures are cryptographic authenticity/integrity signals over signed bytes only; they are never proof of physical location, employee presence, attendance legitimacy, identity, attestation success, authorization, or payroll eligibility.';
COMMENT ON COLUMN platform.registered_device_key_versions.registered_device_id IS
  'Logical reference to platform.registered_devices. Future application code must validate registered_device_id with company_id before writing; no database foreign key is intentionally present.';
COMMENT ON COLUMN platform.registered_device_key_versions.public_key_material IS
  'Public verification key material only. Private device signing keys must never be stored server-side.';
COMMENT ON COLUMN platform.registered_device_key_versions.public_key_fingerprint_sha256 IS
  'Lowercase SHA-256 hex fingerprint of the stored public key material for lookup and audit correlation.';
