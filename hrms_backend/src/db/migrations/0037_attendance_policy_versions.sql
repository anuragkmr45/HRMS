ALTER TABLE platform.admin_policies
  DROP CONSTRAINT IF EXISTS admin_policies_policy_key_key;

CREATE TABLE IF NOT EXISTS attendance.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES platform.company_profiles(id),
  policy_key text NOT NULL,
  name text NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid NULL REFERENCES core.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT attendance_policies_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT attendance_policies_id_company_uq UNIQUE (id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_policies_company_key_uq
  ON attendance.policies (company_id, policy_key, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_policies_company_status_idx
  ON attendance.policies (company_id, status, policy_key)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS attendance.policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  version_number integer NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES core.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_policy_versions_policy_company_fk
    FOREIGN KEY (policy_id, company_id)
    REFERENCES attendance.policies (id, company_id),
  CONSTRAINT attendance_policy_versions_id_company_uq UNIQUE (id, company_id),
  CONSTRAINT attendance_policy_versions_version_number_check
    CHECK (version_number > 0),
  CONSTRAINT attendance_policy_versions_effective_dates_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_policy_versions_policy_number_uq
  ON attendance.policy_versions (policy_id, version_number);

CREATE INDEX IF NOT EXISTS attendance_policy_versions_lookup_idx
  ON attendance.policy_versions (
    company_id,
    policy_id,
    effective_from,
    effective_until
  );

CREATE TABLE IF NOT EXISTS attendance.policy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  scope_type text NOT NULL,
  scope_id uuid NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid NULL REFERENCES core.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT attendance_policy_assignments_policy_company_fk
    FOREIGN KEY (policy_id, company_id)
    REFERENCES attendance.policies (id, company_id),
  CONSTRAINT attendance_policy_assignments_id_company_uq UNIQUE (id, company_id),
  CONSTRAINT attendance_policy_assignments_scope_type_check
    CHECK (scope_type IN ('employee', 'department', 'company')),
  CONSTRAINT attendance_policy_assignments_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT attendance_policy_assignments_scope_id_check
    CHECK (
      (scope_type = 'company' AND scope_id IS NULL)
      OR (scope_type IN ('employee', 'department') AND scope_id IS NOT NULL)
    ),
  CONSTRAINT attendance_policy_assignments_effective_dates_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS attendance_policy_assignments_lookup_idx
  ON attendance.policy_assignments (
    company_id,
    scope_type,
    scope_id,
    status,
    effective_from,
    effective_until
  )
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION attendance.reject_overlapping_policy_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance.policy_versions existing
    WHERE existing.policy_id = NEW.policy_id
      AND existing.company_id = NEW.company_id
      AND existing.id <> NEW.id
      AND NEW.effective_from < COALESCE(existing.effective_until, 'infinity'::timestamptz)
      AND COALESCE(NEW.effective_until, 'infinity'::timestamptz) > existing.effective_from
  ) THEN
    RAISE EXCEPTION 'overlapping attendance policy versions are not allowed'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_policy_versions_no_overlap';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.reject_overlapping_policy_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.deleted_at IS NULL AND EXISTS (
    SELECT 1
    FROM attendance.policy_assignments existing
    WHERE existing.company_id = NEW.company_id
      AND existing.scope_type = NEW.scope_type
      AND COALESCE(existing.scope_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          COALESCE(NEW.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND existing.id <> NEW.id
      AND existing.status = 'active'
      AND existing.deleted_at IS NULL
      AND NEW.effective_from < COALESCE(existing.effective_until, 'infinity'::timestamptz)
      AND COALESCE(NEW.effective_until, 'infinity'::timestamptz) > existing.effective_from
  ) THEN
    RAISE EXCEPTION 'overlapping active attendance policy assignments are not allowed'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_policy_assignments_no_active_overlap';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.validate_policy_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope_type = 'employee' AND NOT EXISTS (
    SELECT 1
    FROM platform.user_session_preferences preference
    WHERE preference.user_id = NEW.scope_id
      AND preference.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'attendance policy employee assignment must target an employee in the same company'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_policy_assignments_employee_company_fk';
  END IF;

  IF NEW.scope_type = 'department' AND NOT EXISTS (
    SELECT 1
    FROM core.departments department
    WHERE department.id = NEW.scope_id
      AND department.company_id = NEW.company_id
      AND department.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'attendance policy department assignment must target a department in the same company'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_policy_assignments_department_company_fk';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.prevent_policy_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.id = NEW.id
    AND OLD.company_id = NEW.company_id
    AND OLD.policy_id = NEW.policy_id
    AND OLD.version_number = NEW.version_number
    AND OLD.effective_from = NEW.effective_from
    AND OLD.config = NEW.config
    AND OLD.created_by_user_id IS NOT DISTINCT FROM NEW.created_by_user_id
    AND OLD.created_at = NEW.created_at
    AND OLD.effective_until IS NULL
    AND NEW.effective_until IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'immutable audit/log rows cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS attendance_policy_versions_no_overlap_trg
  ON attendance.policy_versions;
CREATE TRIGGER attendance_policy_versions_no_overlap_trg
  BEFORE INSERT OR UPDATE OF company_id, policy_id, effective_from, effective_until
  ON attendance.policy_versions
  FOR EACH ROW EXECUTE FUNCTION attendance.reject_overlapping_policy_version();

DROP TRIGGER IF EXISTS attendance_policy_assignments_no_overlap_trg
  ON attendance.policy_assignments;
CREATE TRIGGER attendance_policy_assignments_no_overlap_trg
  BEFORE INSERT OR UPDATE OF company_id, scope_type, scope_id, status, effective_from, effective_until, deleted_at
  ON attendance.policy_assignments
  FOR EACH ROW EXECUTE FUNCTION attendance.reject_overlapping_policy_assignment();

DROP TRIGGER IF EXISTS attendance_policy_assignments_scope_trg
  ON attendance.policy_assignments;
CREATE TRIGGER attendance_policy_assignments_scope_trg
  BEFORE INSERT OR UPDATE OF company_id, scope_type, scope_id
  ON attendance.policy_assignments
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_policy_assignment_scope();

DROP TRIGGER IF EXISTS attendance_policy_versions_immutable_trg
  ON attendance.policy_versions;
CREATE TRIGGER attendance_policy_versions_immutable_trg
  BEFORE UPDATE OR DELETE
  ON attendance.policy_versions
  FOR EACH ROW EXECUTE FUNCTION attendance.prevent_policy_version_mutation();

WITH source_policies AS (
  SELECT *
  FROM platform.admin_policies
  WHERE company_id IS NOT NULL
    AND policy_key = 'attendance'
    AND deleted_at IS NULL
)
INSERT INTO attendance.policies (
    id, company_id, policy_key, name, label, status,
    created_at, updated_at, deleted_at, version
  )
  SELECT
    admin.id,
    admin.company_id,
    admin.policy_key,
    admin.policy_key,
    admin.label,
    CASE WHEN admin.status IN ('active', 'inactive') THEN admin.status ELSE 'active' END,
    admin.created_at,
    admin.updated_at,
    admin.deleted_at,
    admin.version
  FROM source_policies admin
  ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at,
      version = EXCLUDED.version;

WITH source_policies AS (
  SELECT *
  FROM platform.admin_policies
  WHERE company_id IS NOT NULL
    AND policy_key = 'attendance'
    AND deleted_at IS NULL
)
INSERT INTO attendance.policy_versions (
  company_id, policy_id, version_number, effective_from, config, created_at
)
SELECT
  admin.company_id,
  admin.id,
  GREATEST(admin.version, 1),
  COALESCE(admin.updated_at, admin.created_at, now()),
  admin.config
    || jsonb_build_object(
      'attendanceMode', COALESCE(admin.config->>'attendanceMode', 'manual_only'),
      'fallbackApprovalMode', COALESCE(admin.config->>'fallbackApprovalMode', 'disabled'),
      'regularizationMode',
        COALESCE(
          admin.config->>'regularizationMode',
          CASE WHEN admin.config->>'allowRegularization' = 'true' THEN 'approval_required' ELSE 'disabled' END
        )
    ),
  COALESCE(admin.updated_at, admin.created_at, now())
FROM source_policies admin
ON CONFLICT (policy_id, version_number) DO NOTHING;

INSERT INTO attendance.policy_assignments (
  company_id, policy_id, scope_type, scope_id, effective_from, status,
  created_at, updated_at
)
SELECT
  admin.company_id,
  admin.id,
  'company',
  NULL,
  COALESCE(admin.updated_at, admin.created_at, now()),
  CASE WHEN admin.status = 'active' THEN 'active' ELSE 'inactive' END,
  COALESCE(admin.updated_at, admin.created_at, now()),
  COALESCE(admin.updated_at, admin.created_at, now())
FROM platform.admin_policies admin
WHERE admin.company_id IS NOT NULL
  AND admin.policy_key = 'attendance'
  AND admin.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM attendance.policy_assignments existing
    WHERE existing.company_id = admin.company_id
      AND existing.policy_id = admin.id
      AND existing.scope_type = 'company'
      AND existing.scope_id IS NULL
      AND existing.deleted_at IS NULL
  );
