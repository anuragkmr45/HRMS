DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_user_session_preferences_user_company_uq'
      AND conrelid = 'platform.user_session_preferences'::regclass
  ) THEN
    ALTER TABLE platform.user_session_preferences
      ADD CONSTRAINT platform_user_session_preferences_user_company_uq
      UNIQUE (user_id, company_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform.registered_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  installation_id_hash text NOT NULL,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'registered',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_registered_devices_id_company_uq
    UNIQUE (id, company_id),
  CONSTRAINT platform_registered_devices_company_fk
    FOREIGN KEY (company_id)
    REFERENCES platform.company_profiles (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT platform_registered_devices_user_company_fk
    FOREIGN KEY (user_id, company_id)
    REFERENCES platform.user_session_preferences (user_id, company_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT platform_registered_devices_platform_check
    CHECK (platform IN ('ios', 'android')),
  CONSTRAINT platform_registered_devices_status_check
    CHECK (status IN ('registered', 'suspended', 'revoked')),
  CONSTRAINT platform_registered_devices_installation_hash_check
    CHECK (installation_id_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_registered_devices_status_changed_at_check
    CHECK (status_changed_at >= created_at),
  CONSTRAINT platform_registered_devices_updated_at_check
    CHECK (updated_at >= created_at),
  CONSTRAINT platform_registered_devices_company_installation_uq
    UNIQUE (company_id, installation_id_hash)
);

CREATE INDEX IF NOT EXISTS platform_registered_devices_company_user_status_updated_idx
  ON platform.registered_devices (company_id, user_id, status, updated_at DESC);

COMMENT ON TABLE platform.registered_devices IS
  'Lifecycle registry for future mobile app device registrations; not an attestation, authentication, authorization, or attendance enforcement source.';
COMMENT ON COLUMN platform.registered_devices.installation_id_hash IS
  'Hash of an application-generated high-entropy installation identifier; never store IMEI, serial, MAC, advertising ID, hardware fingerprint, token, private key, raw attestation payload, or another secret.';
COMMENT ON COLUMN platform.registered_devices.status IS
  'Registration lifecycle status only; it does not indicate trust, verification, attestation, authentication approval, or authorization approval.';
