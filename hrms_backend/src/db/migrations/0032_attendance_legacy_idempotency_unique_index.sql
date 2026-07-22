CREATE UNIQUE INDEX IF NOT EXISTS attendance_commands_legacy_idempotency_uq
  ON attendance.command_executions (
    company_id,
    actor_user_id,
    idempotency_key
  )
  WHERE platform_idempotency_key_id IS NULL;
