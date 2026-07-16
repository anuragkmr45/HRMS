ALTER TABLE attendance.command_executions
  ADD COLUMN IF NOT EXISTS platform_idempotency_key_id uuid NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'attendance.command_executions'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%(company_id, actor_user_id, idempotency_key)%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE attendance.command_executions DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_commands_platform_idempotency_key_uq
  ON attendance.command_executions (platform_idempotency_key_id)
  WHERE platform_idempotency_key_id IS NOT NULL;
