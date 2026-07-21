-- GEO-S11-004: provenance is first-class; employee_user_id remains the
-- compatibility subject column on existing attendance facts.
ALTER TABLE attendance.punch_events
  ADD COLUMN IF NOT EXISTS actor_user_id uuid NULL;

ALTER TABLE attendance.punch_events
  ADD COLUMN IF NOT EXISTS origin text NULL;

ALTER TABLE attendance.punch_events
  ADD COLUMN IF NOT EXISTS regularization_request_id uuid NULL;

CREATE OR REPLACE FUNCTION attendance.apply_punch_provenance_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actor_user_id := COALESCE(NEW.actor_user_id, NEW.employee_user_id);
  NEW.origin := COALESCE(NEW.origin, 'employee_manual_now');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_punch_provenance_defaults ON attendance.punch_events;
CREATE TRIGGER attendance_punch_provenance_defaults
  BEFORE INSERT ON attendance.punch_events
  FOR EACH ROW EXECUTE FUNCTION attendance.apply_punch_provenance_defaults();

UPDATE attendance.punch_events
SET actor_user_id = employee_user_id
WHERE actor_user_id IS NULL;

UPDATE attendance.punch_events
SET origin = 'employee_manual_now'
WHERE origin IS NULL;

ALTER TABLE attendance.punch_events
  ALTER COLUMN origin SET DEFAULT 'employee_manual_now';

ALTER TABLE attendance.punch_events
  ALTER COLUMN actor_user_id SET NOT NULL;

ALTER TABLE attendance.punch_events
  ALTER COLUMN origin SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_punch_origin_check'
  ) THEN
    ALTER TABLE attendance.punch_events
      ADD CONSTRAINT attendance_punch_origin_check
      CHECK (origin IN (
        'employee_manual_now',
        'manager_assisted_now',
        'historical_correction',
        'approved_regularization',
        'system'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS attendance_punch_company_actor_occurred_idx
  ON attendance.punch_events (company_id, actor_user_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_punch_regularization_idx
  ON attendance.punch_events (regularization_request_id)
  WHERE regularization_request_id IS NOT NULL;

ALTER TABLE attendance.regularization_requests
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid NULL;

CREATE OR REPLACE FUNCTION attendance.apply_regularization_submitter_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.submitted_by_user_id := COALESCE(NEW.submitted_by_user_id, NEW.employee_user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_regularization_submitter_default ON attendance.regularization_requests;
CREATE TRIGGER attendance_regularization_submitter_default
  BEFORE INSERT ON attendance.regularization_requests
  FOR EACH ROW EXECUTE FUNCTION attendance.apply_regularization_submitter_default();

UPDATE attendance.regularization_requests
SET submitted_by_user_id = employee_user_id
WHERE submitted_by_user_id IS NULL;

ALTER TABLE attendance.regularization_requests
  ALTER COLUMN submitted_by_user_id SET NOT NULL;

ALTER TABLE attendance.command_executions
  ADD COLUMN IF NOT EXISTS command_origin text NOT NULL DEFAULT 'employee_manual_now';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_command_origin_check'
  ) THEN
    ALTER TABLE attendance.command_executions
      ADD CONSTRAINT attendance_command_origin_check
      CHECK (command_origin IN (
        'employee_manual_now',
        'manager_assisted_now',
        'historical_correction',
        'approved_regularization'
      ));
  END IF;
END $$;
