DO $$
DECLARE legacy_constraint text;
BEGIN
  FOR legacy_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'attendance.command_decisions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%next_state%'
      AND pg_get_constraintdef(oid) NOT LIKE '%completed%'
  LOOP
    EXECUTE format(
      'ALTER TABLE attendance.command_decisions DROP CONSTRAINT %I',
      legacy_constraint
    );
  END LOOP;
END $$;
