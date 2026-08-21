ALTER TABLE platform.registered_devices
  ADD COLUMN IF NOT EXISTS offline_sequence_cursor bigint NOT NULL DEFAULT 0;

UPDATE platform.registered_devices device
SET offline_sequence_cursor = history.max_sequence
FROM (
  SELECT
    company_id,
    actor_user_id,
    registered_device_id,
    max(sequence) AS max_sequence
  FROM attendance.offline_event_inbox
  GROUP BY company_id, actor_user_id, registered_device_id
) history
WHERE device.company_id = history.company_id
  AND device.user_id = history.actor_user_id
  AND device.id = history.registered_device_id
  AND device.offline_sequence_cursor < history.max_sequence;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_registered_devices_offline_sequence_cursor_check'
      AND conrelid = 'platform.registered_devices'::regclass
  ) THEN
    ALTER TABLE platform.registered_devices
      ADD CONSTRAINT platform_registered_devices_offline_sequence_cursor_check
      CHECK (offline_sequence_cursor >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendance.offline_sync_security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  registered_device_id uuid NOT NULL,
  client_event_id uuid NOT NULL,
  observed_sequence bigint NOT NULL,
  expected_sequence bigint NULL,
  signal_type text NOT NULL,
  conflicting_client_event_id uuid NULL,
  observed_event_hash text NULL,
  existing_event_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_offline_sync_security_observed_sequence_check
    CHECK (observed_sequence > 0),
  CONSTRAINT attendance_offline_sync_security_expected_sequence_check
    CHECK (expected_sequence IS NULL OR expected_sequence > 0),
  CONSTRAINT attendance_offline_sync_security_signal_type_check
    CHECK (signal_type IN (
      'changed_body_conflict',
      'duplicate_sequence',
      'sequence_gap',
      'sequence_out_of_order'
    )),
  CONSTRAINT attendance_offline_sync_security_observed_hash_check
    CHECK (observed_event_hash IS NULL OR observed_event_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT attendance_offline_sync_security_existing_hash_check
    CHECK (existing_event_hash IS NULL OR existing_event_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS attendance_offline_sync_security_device_created_idx
  ON attendance.offline_sync_security_audit_logs (
    company_id,
    registered_device_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS attendance_offline_sync_security_signal_created_idx
  ON attendance.offline_sync_security_audit_logs (
    company_id,
    signal_type,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS attendance_offline_sync_security_client_event_idx
  ON attendance.offline_sync_security_audit_logs (
    company_id,
    actor_user_id,
    client_event_id,
    created_at DESC
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'offline_sync_security_audit_immutable_trg'
      AND tgrelid = 'attendance.offline_sync_security_audit_logs'::regclass
  ) THEN
    CREATE TRIGGER offline_sync_security_audit_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.offline_sync_security_audit_logs
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
