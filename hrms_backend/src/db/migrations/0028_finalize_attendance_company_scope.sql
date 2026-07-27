-- GEO-S10-003: finalize strict attendance and holiday company scoping.

WITH active_company_count AS (
  SELECT COUNT(*) AS total
  FROM platform.company_profiles
  WHERE status = 'active'
),
single_active_company AS (
  SELECT id
  FROM platform.company_profiles
  WHERE status = 'active'
    AND (SELECT total FROM active_company_count) = 1
  LIMIT 1
)
UPDATE leave_wfh.holidays holiday
SET company_id = company.id
FROM single_active_company company
WHERE holiday.company_id IS NULL;

-- Backfill unresolved attendance rows only when there is exactly one active company.
WITH active_company_count AS (
  SELECT COUNT(*) AS total
  FROM platform.company_profiles
  WHERE status = 'active'
),
single_active_company AS (
  SELECT id
  FROM platform.company_profiles
  WHERE status = 'active'
    AND (SELECT total FROM active_company_count) = 1
  LIMIT 1
)
UPDATE attendance.punch_events punch
SET company_id = company.id
FROM single_active_company company
WHERE punch.company_id IS NULL;

WITH active_company_count AS (
  SELECT COUNT(*) AS total
  FROM platform.company_profiles
  WHERE status = 'active'
),
single_active_company AS (
  SELECT id
  FROM platform.company_profiles
  WHERE status = 'active'
    AND (SELECT total FROM active_company_count) = 1
  LIMIT 1
)
UPDATE attendance.daily_records record
SET company_id = company.id
FROM single_active_company company
WHERE record.company_id IS NULL;

WITH active_company_count AS (
  SELECT COUNT(*) AS total
  FROM platform.company_profiles
  WHERE status = 'active'
),
single_active_company AS (
  SELECT id
  FROM platform.company_profiles
  WHERE status = 'active'
    AND (SELECT total FROM active_company_count) = 1
  LIMIT 1
)
UPDATE attendance.regularization_requests request
SET company_id = company.id
FROM single_active_company company
WHERE request.company_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM attendance.punch_events WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot make attendance.punch_events.company_id NOT NULL because some rows have no company context.';
  END IF;

  IF EXISTS (SELECT 1 FROM attendance.daily_records WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot make attendance.daily_records.company_id NOT NULL because some rows have no company context.';
  END IF;

  IF EXISTS (SELECT 1 FROM attendance.regularization_requests WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot make attendance.regularization_requests.company_id NOT NULL because some rows have no company context.';
  END IF;

  IF EXISTS (SELECT 1 FROM leave_wfh.holidays WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot make leave_wfh.holidays.company_id NOT NULL because some holidays have no company context.';
  END IF;
END $$;

ALTER TABLE attendance.punch_events
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE attendance.daily_records
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE attendance.regularization_requests
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE leave_wfh.holidays
  ALTER COLUMN company_id SET NOT NULL;

DROP INDEX IF EXISTS attendance.attendance_daily_company_employee_date_uq;
CREATE UNIQUE INDEX attendance_daily_company_employee_date_uq
  ON attendance.daily_records (company_id, employee_user_id, work_date);

DROP INDEX IF EXISTS attendance.attendance_punch_company_employee_occurred_idx;
CREATE INDEX attendance_punch_company_employee_occurred_idx
  ON attendance.punch_events (company_id, employee_user_id, occurred_at);

DROP INDEX IF EXISTS attendance.attendance_regularizations_company_employee_date_idx;
CREATE INDEX attendance_regularizations_company_employee_date_idx
  ON attendance.regularization_requests (company_id, employee_user_id, work_date);

DROP INDEX IF EXISTS leave_wfh.holidays_company_date_idx;
CREATE INDEX holidays_company_date_idx
  ON leave_wfh.holidays (company_id, holiday_date);

DROP INDEX IF EXISTS leave_wfh.holidays_company_region_date_name_uq;
CREATE UNIQUE INDEX holidays_company_region_date_name_uq
  ON leave_wfh.holidays (company_id, region, holiday_date, name);