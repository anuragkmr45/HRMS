-- GEO-S13-006: provider-neutral attestation evidence placeholders only.
-- Logical references are intentionally not database foreign keys under the
-- current migration policy. Future persistence must validate, inside the same
-- transaction:
-- 1. Resolve company server-side.
-- 2. Load attendance_event_id with company_id.
-- 3. Reject when no matching event exists.
-- 4. When registered_device_id is provided, load it with company_id.
-- 5. Reject when no matching device exists.
-- 6. Insert this immutable evidence row.

CREATE OR REPLACE FUNCTION attendance.attestation_reason_codes_are_safe(input jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  item jsonb;
  item_text text;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  FOR item IN SELECT jsonb_array_elements(input)
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN
      RETURN false;
    END IF;

    item_text := item #>> '{}';
    IF item_text !~ '^[a-z0-9][a-z0-9_.:-]{0,127}$' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

CREATE TABLE IF NOT EXISTS attendance.attestation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  attendance_event_id uuid NOT NULL,
  registered_device_id uuid NULL,
  provider text NOT NULL,
  verification_status text NOT NULL,
  adapter_version text NOT NULL,
  challenge_binding_hash text NULL,
  artifact_hash text NULL,
  normalized_verdict jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL,
  provider_issued_at timestamptz NULL,
  evaluated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attestation_evidence_provider_check
    CHECK (provider IN ('google_play_integrity', 'apple_app_attest')),
  CONSTRAINT attestation_evidence_verification_status_check
    CHECK (verification_status IN ('verified', 'rejected', 'indeterminate', 'error')),
  CONSTRAINT attestation_evidence_adapter_version_check
    CHECK (btrim(adapter_version) <> ''),
  CONSTRAINT attestation_evidence_challenge_binding_hash_check
    CHECK (challenge_binding_hash IS NULL OR challenge_binding_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT attestation_evidence_artifact_hash_check
    CHECK (artifact_hash IS NULL OR artifact_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT attestation_evidence_normalized_verdict_object_check
    CHECK (jsonb_typeof(normalized_verdict) = 'object'),
  CONSTRAINT attestation_evidence_provider_metadata_object_check
    CHECK (jsonb_typeof(provider_metadata) = 'object'),
  CONSTRAINT attestation_evidence_reason_codes_check
    CHECK (attendance.attestation_reason_codes_are_safe(reason_codes))
);

CREATE INDEX IF NOT EXISTS attestation_evidence_event_idx
  ON attendance.attestation_evidence (company_id, attendance_event_id);

CREATE INDEX IF NOT EXISTS attestation_evidence_registered_device_idx
  ON attendance.attestation_evidence (company_id, registered_device_id)
  WHERE registered_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attestation_evidence_provider_status_evaluated_idx
  ON attendance.attestation_evidence (
    company_id,
    provider,
    verification_status,
    evaluated_at DESC
  );

COMMENT ON TABLE attendance.attestation_evidence IS
  'Immutable provider-neutral attestation evidence placeholders. Attestation is a security/risk signal only, never proof of location, geofence presence, identity, attendance legitimacy, payroll eligibility, authentication, or authorization.';
COMMENT ON COLUMN attendance.attestation_evidence.attendance_event_id IS
  'Logical reference to attendance.attendance_events. Future application code must validate attendance_event_id with company_id in the same transaction before insert; no database foreign key is intentionally present.';
COMMENT ON COLUMN attendance.attestation_evidence.registered_device_id IS
  'Optional logical reference to platform.registered_devices. Future application code must validate registered_device_id with company_id in the same transaction before insert; no database foreign key is intentionally present.';
COMMENT ON COLUMN attendance.attestation_evidence.artifact_hash IS
  'One-way SHA-256 lowercase hexadecimal hash of the attestation artifact when retained for correlation; raw Play Integrity tokens and App Attest assertions must not be logged or persisted.';
COMMENT ON COLUMN attendance.attestation_evidence.provider_metadata IS
  'Allowlisted non-sensitive provider metadata only. Do not store raw provider responses, private keys, device secrets, certificate chains, hardware identifiers, advertising IDs, or exact location data.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'attestation_evidence_immutable_trg'
      AND tgrelid = 'attendance.attestation_evidence'::regclass
  ) THEN
    CREATE TRIGGER attestation_evidence_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.attestation_evidence
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
