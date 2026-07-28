CREATE TABLE IF NOT EXISTS attendance.shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES platform.company_profiles(id),
  code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'active',
  is_company_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT attendance_shift_templates_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT attendance_shift_templates_id_company_uq UNIQUE (id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_shift_templates_company_code_uq
  ON attendance.shift_templates (company_id, code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_shift_templates_one_default_idx
  ON attendance.shift_templates (company_id)
  WHERE is_company_default = true
    AND status = 'active'
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_shift_templates_company_status_idx
  ON attendance.shift_templates (company_id, status, name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS attendance.shift_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version_number integer NOT NULL,
  effective_from date NOT NULL,
  effective_until date NULL,
  local_start_time time NOT NULL,
  local_end_time time NOT NULL,
  end_day_offset integer NOT NULL DEFAULT 0,
  timezone_strategy text NOT NULL,
  fixed_timezone text NULL,
  eligibility_open_before_start_minutes integer NOT NULL DEFAULT 120,
  eligibility_close_after_end_minutes integer NOT NULL DEFAULT 240,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_shift_versions_template_company_fk
    FOREIGN KEY (template_id, company_id)
    REFERENCES attendance.shift_templates (id, company_id),
  CONSTRAINT attendance_shift_versions_id_company_uq UNIQUE (id, company_id),
  CONSTRAINT attendance_shift_versions_version_number_check
    CHECK (version_number > 0),
  CONSTRAINT attendance_shift_versions_effective_dates_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CONSTRAINT attendance_shift_versions_end_day_offset_check
    CHECK (end_day_offset BETWEEN 0 AND 7),
  CONSTRAINT attendance_shift_versions_timezone_strategy_check
    CHECK (timezone_strategy IN ('company', 'employee_with_company_fallback', 'fixed')),
  CONSTRAINT attendance_shift_versions_fixed_timezone_check
    CHECK (
      (timezone_strategy = 'fixed' AND fixed_timezone IS NOT NULL)
      OR (timezone_strategy <> 'fixed')
    ),
  CONSTRAINT attendance_shift_versions_eligibility_check
    CHECK (
      eligibility_open_before_start_minutes >= 0
      AND eligibility_close_after_end_minutes >= 0
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_shift_versions_template_number_uq
  ON attendance.shift_template_versions (template_id, version_number);

CREATE INDEX IF NOT EXISTS attendance_shift_versions_lookup_idx
  ON attendance.shift_template_versions (
    company_id,
    template_id,
    effective_from,
    effective_until
  );

CREATE TABLE IF NOT EXISTS attendance.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL REFERENCES core.users(id),
  template_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_until date NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT attendance_shift_assignments_template_company_fk
    FOREIGN KEY (template_id, company_id)
    REFERENCES attendance.shift_templates (id, company_id),
  CONSTRAINT attendance_shift_assignments_id_company_uq UNIQUE (id, company_id),
  CONSTRAINT attendance_shift_assignments_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT attendance_shift_assignments_effective_dates_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS attendance_shift_assignments_lookup_idx
  ON attendance.shift_assignments (
    company_id,
    employee_user_id,
    status,
    effective_from,
    effective_until
  )
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION attendance.reject_overlapping_shift_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance.shift_template_versions existing
    WHERE existing.template_id = NEW.template_id
      AND existing.company_id = NEW.company_id
      AND existing.id <> NEW.id
      AND NEW.effective_from <= COALESCE(existing.effective_until, 'infinity'::date)
      AND COALESCE(NEW.effective_until, 'infinity'::date) >= existing.effective_from
  ) THEN
    RAISE EXCEPTION 'overlapping attendance shift template versions are not allowed'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_shift_versions_no_overlap';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.reject_overlapping_shift_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.deleted_at IS NULL AND EXISTS (
    SELECT 1
    FROM attendance.shift_assignments existing
    WHERE existing.company_id = NEW.company_id
      AND existing.employee_user_id = NEW.employee_user_id
      AND existing.id <> NEW.id
      AND existing.status = 'active'
      AND existing.deleted_at IS NULL
      AND NEW.effective_from <= COALESCE(existing.effective_until, 'infinity'::date)
      AND COALESCE(NEW.effective_until, 'infinity'::date) >= existing.effective_from
  ) THEN
    RAISE EXCEPTION 'overlapping active attendance shift assignments are not allowed'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_shift_assignments_no_active_overlap';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_shift_versions_no_overlap_trg
  ON attendance.shift_template_versions;
CREATE TRIGGER attendance_shift_versions_no_overlap_trg
  BEFORE INSERT OR UPDATE OF company_id, template_id, effective_from, effective_until
  ON attendance.shift_template_versions
  FOR EACH ROW EXECUTE FUNCTION attendance.reject_overlapping_shift_version();

DROP TRIGGER IF EXISTS attendance_shift_assignments_no_overlap_trg
  ON attendance.shift_assignments;
CREATE TRIGGER attendance_shift_assignments_no_overlap_trg
  BEFORE INSERT OR UPDATE OF company_id, employee_user_id, status, effective_from, effective_until, deleted_at
  ON attendance.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION attendance.reject_overlapping_shift_assignment();
