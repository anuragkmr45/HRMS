ALTER TABLE attendance.daily_records
  ADD COLUMN IF NOT EXISTS day_classification text,
  ADD COLUMN IF NOT EXISTS presence_state text,
  ADD COLUMN IF NOT EXISTS punctuality_state text,
  ADD COLUMN IF NOT EXISTS evidence_state text,
  ADD COLUMN IF NOT EXISTS approval_kind text,
  ADD COLUMN IF NOT EXISTS approval_state text,
  ADD COLUMN IF NOT EXISTS payroll_state text,
  ADD COLUMN IF NOT EXISTS work_seconds integer,
  ADD COLUMN IF NOT EXISTS break_seconds integer,
  ADD COLUMN IF NOT EXISTS scheduled_seconds integer,
  ADD COLUMN IF NOT EXISTS late_seconds integer,
  ADD COLUMN IF NOT EXISTS early_departure_seconds integer;

UPDATE attendance.daily_records
SET
  day_classification = COALESCE(
    day_classification,
    CASE status
      WHEN 'weekend' THEN 'weekend'
      WHEN 'holiday' THEN 'holiday'
      WHEN 'leave' THEN 'leave'
      WHEN 'wfh' THEN 'wfh'
      WHEN 'future' THEN 'future'
      WHEN 'present' THEN 'working_day'
      WHEN 'late' THEN 'working_day'
      WHEN 'absent' THEN 'working_day'
      ELSE 'unknown'
    END
  ),
  presence_state = COALESCE(
    presence_state,
    CASE
      WHEN status = 'future' THEN 'not_started'
      WHEN first_check_in IS NOT NULL AND last_check_out IS NOT NULL THEN 'present'
      WHEN status IN ('present', 'late') THEN 'present'
      WHEN status = 'absent' THEN 'absent'
      WHEN first_check_in IS NOT NULL AND last_check_out IS NULL THEN 'incomplete'
      WHEN first_check_in IS NOT NULL OR last_check_out IS NOT NULL OR work_minutes > 0 THEN 'partial'
      WHEN status IN ('weekend', 'holiday', 'leave') THEN 'not_applicable'
      WHEN status = 'wfh' THEN 'not_started'
      ELSE 'unknown'
    END
  ),
  punctuality_state = COALESCE(
    punctuality_state,
    CASE
      WHEN late_minutes > 0 AND early_out_minutes > 0 THEN 'late_and_early_departure'
      WHEN status = 'late' OR late_minutes > 0 THEN 'late'
      WHEN early_out_minutes > 0 THEN 'early_departure'
      WHEN status = 'present' THEN 'on_time'
      WHEN status IN ('absent', 'future', 'weekend', 'holiday', 'leave', 'wfh') THEN 'not_applicable'
      ELSE 'unknown'
    END
  ),
  evidence_state = COALESCE(
    evidence_state,
    CASE
      WHEN exception_type = 'missing_punch' OR (first_check_in IS NOT NULL AND last_check_out IS NULL) THEN 'partial'
      WHEN first_check_in IS NOT NULL AND last_check_out IS NOT NULL THEN 'complete'
      WHEN status = 'absent' THEN 'missing'
      WHEN status IN ('weekend', 'holiday', 'leave', 'future', 'wfh') THEN 'not_applicable'
      ELSE 'unknown'
    END
  ),
  approval_kind = COALESCE(
    approval_kind,
    CASE
      WHEN regularization_status IS NOT NULL THEN 'regularization'
      WHEN status = 'leave' THEN 'leave'
      WHEN status = 'wfh' THEN 'wfh'
      ELSE 'none'
    END
  ),
  approval_state = COALESCE(
    approval_state,
    CASE
      WHEN regularization_status IN ('pending', 'approved', 'returned', 'rejected') THEN regularization_status
      WHEN status IN ('leave', 'wfh') THEN 'unknown'
      ELSE 'not_required'
    END
  ),
  payroll_state = COALESCE(payroll_state, 'unprocessed'),
  work_seconds = COALESCE(work_seconds, GREATEST(work_minutes, 0) * 60),
  break_seconds = COALESCE(break_seconds, GREATEST(break_minutes, 0) * 60),
  scheduled_seconds = COALESCE(scheduled_seconds, 0),
  late_seconds = COALESCE(late_seconds, GREATEST(late_minutes, 0) * 60),
  early_departure_seconds = COALESCE(early_departure_seconds, GREATEST(early_out_minutes, 0) * 60);

ALTER TABLE attendance.daily_records
  ALTER COLUMN day_classification SET DEFAULT 'unknown',
  ALTER COLUMN presence_state SET DEFAULT 'unknown',
  ALTER COLUMN punctuality_state SET DEFAULT 'unknown',
  ALTER COLUMN evidence_state SET DEFAULT 'unknown',
  ALTER COLUMN approval_kind SET DEFAULT 'none',
  ALTER COLUMN approval_state SET DEFAULT 'not_required',
  ALTER COLUMN payroll_state SET DEFAULT 'unprocessed',
  ALTER COLUMN work_seconds SET DEFAULT 0,
  ALTER COLUMN break_seconds SET DEFAULT 0,
  ALTER COLUMN scheduled_seconds SET DEFAULT 0,
  ALTER COLUMN late_seconds SET DEFAULT 0,
  ALTER COLUMN early_departure_seconds SET DEFAULT 0,
  ALTER COLUMN day_classification SET NOT NULL,
  ALTER COLUMN presence_state SET NOT NULL,
  ALTER COLUMN punctuality_state SET NOT NULL,
  ALTER COLUMN evidence_state SET NOT NULL,
  ALTER COLUMN approval_kind SET NOT NULL,
  ALTER COLUMN approval_state SET NOT NULL,
  ALTER COLUMN payroll_state SET NOT NULL,
  ALTER COLUMN work_seconds SET NOT NULL,
  ALTER COLUMN break_seconds SET NOT NULL,
  ALTER COLUMN scheduled_seconds SET NOT NULL,
  ALTER COLUMN late_seconds SET NOT NULL,
  ALTER COLUMN early_departure_seconds SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_day_classification_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_day_classification_check
      CHECK (day_classification IN ('working_day', 'weekend', 'holiday', 'leave', 'wfh', 'future', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_presence_state_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_presence_state_check
      CHECK (presence_state IN ('not_started', 'present', 'partial', 'incomplete', 'absent', 'not_applicable', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_punctuality_state_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_punctuality_state_check
      CHECK (punctuality_state IN ('on_time', 'late', 'early_departure', 'late_and_early_departure', 'not_applicable', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_evidence_state_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_evidence_state_check
      CHECK (evidence_state IN ('complete', 'partial', 'missing', 'disputed', 'not_applicable', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_approval_kind_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_approval_kind_check
      CHECK (approval_kind IN ('none', 'regularization', 'leave', 'wfh', 'multiple'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_approval_state_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_approval_state_check
      CHECK (approval_state IN ('not_required', 'pending', 'approved', 'returned', 'rejected', 'mixed', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_payroll_state_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_payroll_state_check
      CHECK (payroll_state IN ('unprocessed', 'not_applicable', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_seconds_nonnegative_check') THEN
    ALTER TABLE attendance.daily_records ADD CONSTRAINT attendance_daily_seconds_nonnegative_check
      CHECK (
        work_seconds >= 0 AND break_seconds >= 0 AND scheduled_seconds >= 0
        AND late_seconds >= 0 AND early_departure_seconds >= 0
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS attendance_daily_classification_date_idx
  ON attendance.daily_records (day_classification, work_date);

CREATE INDEX IF NOT EXISTS attendance_daily_presence_date_idx
  ON attendance.daily_records (presence_state, work_date);
