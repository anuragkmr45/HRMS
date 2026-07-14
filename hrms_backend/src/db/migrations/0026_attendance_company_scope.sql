-- GEO-S10-003: retain legacy rows for controlled backfill while requiring a
-- company context for all new runtime attendance writes.
ALTER TABLE attendance.punch_events ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE attendance.daily_records ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE attendance.regularization_requests ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE leave_wfh.holidays ADD COLUMN IF NOT EXISTS company_id uuid NULL;

-- The session preference is the current canonical user/company assignment.
UPDATE attendance.punch_events punch
SET company_id = preference.company_id
FROM platform.user_session_preferences preference
WHERE punch.company_id IS NULL
  AND preference.user_id = punch.employee_user_id
  AND preference.company_id IS NOT NULL;

UPDATE attendance.daily_records record
SET company_id = preference.company_id
FROM platform.user_session_preferences preference
WHERE record.company_id IS NULL
  AND preference.user_id = record.employee_user_id
  AND preference.company_id IS NOT NULL;

UPDATE attendance.regularization_requests request
SET company_id = preference.company_id
FROM platform.user_session_preferences preference
WHERE request.company_id IS NULL
  AND preference.user_id = request.employee_user_id
  AND preference.company_id IS NOT NULL;

ALTER TABLE attendance.daily_records DROP CONSTRAINT IF EXISTS daily_records_employee_user_id_work_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_daily_company_employee_date_uq
  ON attendance.daily_records (company_id, employee_user_id, work_date)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS attendance_punch_company_employee_occurred_idx
  ON attendance.punch_events (company_id, employee_user_id, occurred_at DESC)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS attendance_regularizations_company_employee_date_idx
  ON attendance.regularization_requests (company_id, employee_user_id, work_date DESC)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS holidays_company_date_idx
  ON leave_wfh.holidays (company_id, holiday_date)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL;
