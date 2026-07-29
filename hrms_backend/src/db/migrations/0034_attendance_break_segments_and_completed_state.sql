-- This migration is deliberately repeatable because the integration-test
-- database setup replays the SQL schema before each isolated test app.
DO $$
DECLARE object_kind "char";
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_sessions_id_company_uq'
      AND conrelid = 'attendance.sessions'::regclass
  ) THEN
    SELECT relkind INTO object_kind
    FROM pg_class
    WHERE oid = 'attendance.attendance_sessions_id_company_uq'::regclass;

    IF object_kind = 'i' THEN
      ALTER TABLE attendance.sessions
        ADD CONSTRAINT attendance_sessions_id_company_uq
        UNIQUE USING INDEX attendance_sessions_id_company_uq;
    ELSE
      ALTER TABLE attendance.sessions
        ADD CONSTRAINT attendance_sessions_id_company_uq UNIQUE (id, company_id);
    END IF;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_object THEN
  -- The index lookup is absent on first application; ADD CONSTRAINT creates it.
  ALTER TABLE attendance.sessions
    ADD CONSTRAINT attendance_sessions_id_company_uq UNIQUE (id, company_id);
END $$;

CREATE TABLE IF NOT EXISTS attendance.break_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  session_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_break_segments_session_company_fk'
      AND conrelid = 'attendance.break_segments'::regclass
  ) THEN
    ALTER TABLE attendance.break_segments
      ADD CONSTRAINT attendance_break_segments_session_company_fk
      FOREIGN KEY (session_id, company_id)
      REFERENCES attendance.sessions (id, company_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_break_segments_time_check'
      AND conrelid = 'attendance.break_segments'::regclass
  ) THEN
    ALTER TABLE attendance.break_segments
      ADD CONSTRAINT attendance_break_segments_time_check
      CHECK (ended_at IS NULL OR ended_at >= started_at);
  END IF;
END $$;

-- Move legacy active-break facts before the runtime derives state exclusively
-- from break_segments. The anti-join keeps replay safe.
INSERT INTO attendance.break_segments (
  company_id, session_id, started_at, ended_at, created_at, updated_at
)
SELECT session.company_id, session.id, session.active_break_started_at,
  NULL, session.created_at, session.updated_at
FROM attendance.sessions session
WHERE session.active_break_started_at IS NOT NULL
  AND session.closed_at IS NULL
  AND session.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM attendance.break_segments break_segment
    WHERE break_segment.company_id = session.company_id
      AND break_segment.session_id = session.id
      AND break_segment.ended_at IS NULL
  );

-- Replace only the known legacy check that references the deprecated column.
-- This is a forward migration of that invariant, not startup cleanup.
DO $$
DECLARE legacy_constraint text;
BEGIN
  SELECT conname INTO legacy_constraint
  FROM pg_constraint
  WHERE conrelid = 'attendance.sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%active_break_started_at%'
  LIMIT 1;
  IF legacy_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE attendance.sessions DROP CONSTRAINT %I', legacy_constraint);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_sessions_status_check'
      AND conrelid = 'attendance.sessions'::regclass
  ) THEN
    ALTER TABLE attendance.sessions
      ADD CONSTRAINT attendance_sessions_status_check
      CHECK (
        (status IN ('working', 'on_break') AND closed_at IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL)
      );
  END IF;
END $$;

UPDATE attendance.sessions
SET active_break_started_at = NULL
WHERE active_break_started_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_break_segments_single_active_idx
  ON attendance.break_segments (company_id, session_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_break_segments_session_history_idx
  ON attendance.break_segments (company_id, session_id, started_at DESC);

CREATE OR REPLACE FUNCTION attendance.assert_break_segment_session_open()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM attendance.sessions session
    WHERE session.id = NEW.session_id
      AND session.company_id = NEW.company_id
      AND (session.closed_at IS NOT NULL OR session.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'attendance break segment requires an open session'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.assert_session_has_no_active_break_on_close()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM attendance.break_segments break_segment
    WHERE break_segment.company_id = NEW.company_id
      AND break_segment.session_id = NEW.id
      AND break_segment.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'completed attendance session cannot retain an active break'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'attendance_break_segments_session_open_trg'
      AND tgrelid = 'attendance.break_segments'::regclass
  ) THEN
    CREATE TRIGGER attendance_break_segments_session_open_trg
      BEFORE INSERT OR UPDATE OF company_id, session_id, started_at, ended_at
      ON attendance.break_segments
      FOR EACH ROW EXECUTE FUNCTION attendance.assert_break_segment_session_open();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'attendance_sessions_no_active_break_on_close_trg'
      AND tgrelid = 'attendance.sessions'::regclass
  ) THEN
    CREATE TRIGGER attendance_sessions_no_active_break_on_close_trg
      BEFORE UPDATE OF closed_at ON attendance.sessions
      FOR EACH ROW EXECUTE FUNCTION attendance.assert_session_has_no_active_break_on_close();
  END IF;
END $$;

-- Upgrade only the legacy state checks that do not permit COMPLETED.
DO $$
DECLARE legacy_constraint text;
BEGIN
  FOR legacy_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'attendance.employee_command_states'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%not_checked_in%'
      AND pg_get_constraintdef(oid) NOT LIKE '%completed%'
  LOOP
    EXECUTE format('ALTER TABLE attendance.employee_command_states DROP CONSTRAINT %I', legacy_constraint);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_employee_command_states_state_check'
      AND conrelid = 'attendance.employee_command_states'::regclass
  ) THEN
    ALTER TABLE attendance.employee_command_states
      ADD CONSTRAINT attendance_employee_command_states_state_check
      CHECK (state IN ('not_checked_in', 'working', 'on_break', 'completed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_employee_command_states_session_check'
      AND conrelid = 'attendance.employee_command_states'::regclass
  ) THEN
    ALTER TABLE attendance.employee_command_states
      ADD CONSTRAINT attendance_employee_command_states_session_check
      CHECK (
        (state = 'not_checked_in' AND current_session_id IS NULL)
        OR (state IN ('working', 'on_break', 'completed') AND current_session_id IS NOT NULL)
      );
  END IF;
END $$;

DO $$
DECLARE legacy_constraint text;
BEGIN
  SELECT conname INTO legacy_constraint
  FROM pg_constraint
  WHERE conrelid = 'attendance.command_decisions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%previous_state%'
    AND pg_get_constraintdef(oid) NOT LIKE '%completed%'
  LIMIT 1;
  IF legacy_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE attendance.command_decisions DROP CONSTRAINT %I', legacy_constraint);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_command_decisions_state_check'
      AND conrelid = 'attendance.command_decisions'::regclass
  ) THEN
    ALTER TABLE attendance.command_decisions
      ADD CONSTRAINT attendance_command_decisions_state_check
      CHECK (
        previous_state IN ('not_checked_in', 'working', 'on_break', 'completed')
        AND next_state IN ('not_checked_in', 'working', 'on_break', 'completed')
      );
  END IF;
END $$;
