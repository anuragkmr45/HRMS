ALTER TABLE attendance.command_executions
  ADD COLUMN IF NOT EXISTS client_event_id uuid NULL;

ALTER TABLE attendance.command_executions
  ADD COLUMN IF NOT EXISTS response_status integer NULL;

ALTER TABLE attendance.command_executions
  ADD COLUMN IF NOT EXISTS response_hash text NULL;

UPDATE attendance.command_executions
SET client_event_id = (request_snapshot #>> '{envelope,client_event_id}')::uuid
WHERE client_event_id IS NULL
  AND request_snapshot #>> '{envelope,client_event_id}' IS NOT NULL
  AND request_snapshot #>> '{envelope,client_event_id}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE attendance.command_executions AS command
SET
  response_status = key.response_status,
  response_hash = key.response_hash
FROM platform.idempotency_keys AS key
WHERE command.platform_idempotency_key_id = key.id
  AND command.response_status IS NULL
  AND command.response_hash IS NULL
  AND command.response_snapshot IS NOT NULL
  AND command.completed_at IS NOT NULL
  AND command.status IN ('completed', 'denied')
  AND key.status = 'completed'
  AND key.resource_type = 'attendance.command_execution'
  AND key.resource_id = command.id
  AND key.response_status BETWEEN 100 AND 599
  AND key.response_hash ~ '^[0-9a-f]{64}$';

CREATE UNIQUE INDEX IF NOT EXISTS attendance_commands_client_event_actor_uq
  ON attendance.command_executions (
    company_id,
    actor_user_id,
    client_event_id
  )
  WHERE client_event_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_commands_response_status_valid'
      AND conrelid = 'attendance.command_executions'::regclass
  ) THEN
    ALTER TABLE attendance.command_executions
      ADD CONSTRAINT attendance_commands_response_status_valid
      CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_commands_response_hash_length_check'
      AND conrelid = 'attendance.command_executions'::regclass
  ) THEN
    ALTER TABLE attendance.command_executions
      ADD CONSTRAINT attendance_commands_response_hash_length_check
      CHECK (response_hash IS NULL OR response_hash ~ '^[0-9a-f]{64}$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_commands_replay_metadata_complete_check'
      AND conrelid = 'attendance.command_executions'::regclass
  ) THEN
    ALTER TABLE attendance.command_executions
      ADD CONSTRAINT attendance_commands_replay_metadata_complete_check
      CHECK (
        status NOT IN ('completed', 'denied')
        OR (
          response_snapshot IS NOT NULL
          AND response_status IS NOT NULL
          AND response_hash IS NOT NULL
          AND completed_at IS NOT NULL
        )
      )
      NOT VALID;
  END IF;
END $$;
