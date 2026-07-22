ALTER TABLE platform.idempotency_keys
  ADD COLUMN IF NOT EXISTS resource_type text NULL;

ALTER TABLE platform.idempotency_keys
  ADD COLUMN IF NOT EXISTS resource_id uuid NULL;

ALTER TABLE platform.idempotency_keys
  ADD COLUMN IF NOT EXISTS response_status integer NULL;

ALTER TABLE platform.idempotency_keys
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_idempotency_response_status_valid'
      AND conrelid = 'platform.idempotency_keys'::regclass
  ) THEN
    ALTER TABLE platform.idempotency_keys
      ADD CONSTRAINT platform_idempotency_response_status_valid
      CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS platform_idempotency_resource_idx
  ON platform.idempotency_keys (resource_type, resource_id)
  WHERE resource_id IS NOT NULL;
