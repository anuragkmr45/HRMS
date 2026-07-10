ALTER TABLE core.departments
  ADD COLUMN IF NOT EXISTS company_id uuid NULL REFERENCES platform.company_profiles(id);

ALTER TABLE core.designations
  ADD COLUMN IF NOT EXISTS company_id uuid NULL REFERENCES platform.company_profiles(id);

ALTER TABLE platform.admin_policies
  ADD COLUMN IF NOT EXISTS company_id uuid NULL REFERENCES platform.company_profiles(id);

ALTER TABLE core.departments
  DROP CONSTRAINT IF EXISTS core_departments_department_code_key;

ALTER TABLE core.designations
  DROP CONSTRAINT IF EXISTS core_designations_designation_code_key;

ALTER TABLE platform.admin_policies
  DROP CONSTRAINT IF EXISTS platform_admin_policies_policy_key_key;

DROP INDEX IF EXISTS core_departments_code_active_uq;
DROP INDEX IF EXISTS core_designations_code_active_uq;
DROP INDEX IF EXISTS platform_admin_policies_key_uq;

CREATE UNIQUE INDEX IF NOT EXISTS core_departments_company_code_uq
  ON core.departments (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), department_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS core_departments_company_status_idx
  ON core.departments (company_id, status, name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS core_designations_company_code_uq
  ON core.designations (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), designation_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS core_designations_company_status_idx
  ON core.designations (company_id, status, title)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_policies_company_key_uq
  ON platform.admin_policies (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), policy_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_admin_policies_company_module_status_idx
  ON platform.admin_policies(company_id, module, status)
  WHERE deleted_at IS NULL;
