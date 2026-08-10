DROP INDEX IF EXISTS leave_wfh.holidays_region_date_name_uq;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_company_region_date_name_uq
  ON leave_wfh.holidays (company_id, region, holiday_date, name)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL;
