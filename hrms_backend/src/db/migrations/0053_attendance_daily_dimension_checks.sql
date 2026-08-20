ALTER TABLE attendance.daily_records
  DROP CONSTRAINT IF EXISTS attendance_daily_day_classification_check,
  DROP CONSTRAINT IF EXISTS attendance_daily_presence_state_check,
  DROP CONSTRAINT IF EXISTS attendance_daily_punctuality_state_check,
  DROP CONSTRAINT IF EXISTS attendance_daily_evidence_state_check;

ALTER TABLE attendance.daily_records
  ADD CONSTRAINT attendance_daily_day_classification_check
    CHECK (day_classification IN ('working_day', 'weekend', 'holiday', 'leave', 'wfh', 'future', 'unknown')),
  ADD CONSTRAINT attendance_daily_presence_state_check
    CHECK (presence_state IN ('not_started', 'present', 'partial', 'incomplete', 'absent', 'not_applicable', 'unknown')),
  ADD CONSTRAINT attendance_daily_punctuality_state_check
    CHECK (punctuality_state IN ('on_time', 'late', 'early_departure', 'late_and_early_departure', 'not_applicable', 'unknown')),
  ADD CONSTRAINT attendance_daily_evidence_state_check
    CHECK (evidence_state IN ('complete', 'partial', 'missing', 'disputed', 'not_applicable', 'unknown'));