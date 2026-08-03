-- GEO-S12-008: exact-location access audit and coordinate retention foundation.
-- Exact coordinates remain isolated to attendance.location_evidence and may be
-- redacted only by the tightly scoped retention purge transition below.

CREATE OR REPLACE FUNCTION attendance.location_audit_normalized_key(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '_' FROM lower(regexp_replace(
    regexp_replace(btrim(COALESCE(input, '')), '([a-z0-9])([A-Z])', '\1_\2', 'g'),
    '[[:space:]-]+',
    '_',
    'g'
  )));
$$;

CREATE OR REPLACE FUNCTION attendance.location_audit_code_is_safe(input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT input IS NULL
    OR (
      input ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND input !~ '-?[0-9]{1,3}\.[0-9]{3,}'
      AND attendance.location_audit_normalized_key(input) <> ALL (ARRAY[
        'lat',
        'latitude',
        'lng',
        'long',
        'longitude',
        'coordinate',
        'coordinates',
        'altitude',
        'altitude_meters',
        'geo_point',
        'point',
        'geometry',
        'geography',
        'raw_payload',
        'location'
      ])
    );
$$;

CREATE OR REPLACE FUNCTION attendance.location_access_audit_metadata_is_safe(input jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  item record;
  normalized_key text;
  allowed_keys text[] := ARRAY[
    'audit_scope',
    'date_from',
    'date_to',
    'employee_count',
    'export_format',
    'filter_hash',
    'filters',
    'format',
    'record_count',
    'request_scope',
    'report_key',
    'ui_surface',
    'work_date'
  ];
  forbidden_keys text[] := ARRAY[
    'lat',
    'latitude',
    'lng',
    'long',
    'longitude',
    'coordinate',
    'coordinates',
    'altitude',
    'altitude_meters',
    'geo_point',
    'point',
    'geometry',
    'geography',
    'raw_payload',
    'location'
  ];
BEGIN
  IF input IS NULL THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(input) = 'object' THEN
    FOR item IN SELECT key, value FROM jsonb_each(input)
    LOOP
      normalized_key := attendance.location_audit_normalized_key(item.key);
      IF normalized_key = ANY (forbidden_keys) OR normalized_key <> ALL (allowed_keys) THEN
        RETURN false;
      END IF;
      IF NOT attendance.location_access_audit_metadata_is_safe(item.value) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  IF jsonb_typeof(input) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(input)
    LOOP
      IF NOT attendance.location_access_audit_metadata_is_safe(item.value) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  IF jsonb_typeof(input) = 'string' THEN
    RETURN length(input #>> '{}') <= 128
      AND input #>> '{}' !~* '(-?[0-9]{1,3}\.[0-9]{3,})';
  END IF;

  IF jsonb_typeof(input) = 'number' THEN
    RETURN input #>> '{}' ~ '^-?[0-9]+$';
  END IF;

  RETURN jsonb_typeof(input) IN ('boolean', 'null');
END;
$$;

CREATE TABLE IF NOT EXISTS attendance.location_access_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  subject_employee_user_id uuid NULL,
  location_evidence_id uuid NULL,
  attendance_event_id uuid NULL,
  action text NOT NULL,
  outcome text NOT NULL DEFAULT 'allowed',
  reason_code text NULL,
  request_id text NULL,
  operation_context text NULL,
  export_record_count integer NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_access_audit_action_check
    CHECK (action IN (
      'attendance.location_coordinates.viewed',
      'attendance.location_coordinates.exported'
    )),
  CONSTRAINT location_access_audit_outcome_check
    CHECK (outcome IN ('allowed', 'denied')),
  CONSTRAINT location_access_audit_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT location_access_audit_no_coordinate_metadata_check
    CHECK (attendance.location_access_audit_metadata_is_safe(metadata)),
  CONSTRAINT location_access_audit_reason_code_check
    CHECK (attendance.location_audit_code_is_safe(reason_code)),
  CONSTRAINT location_access_audit_request_id_check
    CHECK (
      request_id IS NULL
      OR (
        request_id ~ '^[A-Za-z0-9_.:-]{1,128}$'
        AND request_id !~ '-?[0-9]{1,3}\.[0-9]{3,}'
      )
    ),
  CONSTRAINT location_access_audit_operation_context_check
    CHECK (attendance.location_audit_code_is_safe(operation_context)),
  CONSTRAINT location_access_audit_export_count_check
    CHECK (export_record_count IS NULL OR export_record_count >= 0),
  CONSTRAINT location_access_audit_action_scope_check
    CHECK (
      (
        action = 'attendance.location_coordinates.viewed'
        AND location_evidence_id IS NOT NULL
        AND attendance_event_id IS NOT NULL
        AND subject_employee_user_id IS NOT NULL
      )
      OR
      (
        action = 'attendance.location_coordinates.exported'
        AND export_record_count IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS location_access_audit_company_created_idx
  ON attendance.location_access_audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS location_access_audit_actor_created_idx
  ON attendance.location_access_audit_logs (company_id, actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS location_access_audit_subject_created_idx
  ON attendance.location_access_audit_logs (company_id, subject_employee_user_id, created_at DESC)
  WHERE subject_employee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS location_access_audit_evidence_idx
  ON attendance.location_access_audit_logs (company_id, location_evidence_id, created_at DESC)
  WHERE location_evidence_id IS NOT NULL;

CREATE OR REPLACE FUNCTION attendance.validate_location_access_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.action = 'attendance.location_coordinates.viewed'
    AND NOT EXISTS (
      SELECT 1
      FROM attendance.location_evidence evidence
      WHERE evidence.id = NEW.location_evidence_id
        AND evidence.company_id = NEW.company_id
        AND evidence.attendance_event_id = NEW.attendance_event_id
        AND evidence.employee_user_id = NEW.subject_employee_user_id
    )
  THEN
    RAISE EXCEPTION 'location access audit evidence relationship does not exist'
      USING ERRCODE = '23514',
            CONSTRAINT = 'location_access_audit_evidence_relationship_check';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS location_access_audit_insert_validate_trg
  ON attendance.location_access_audit_logs;
CREATE TRIGGER location_access_audit_insert_validate_trg
  BEFORE INSERT ON attendance.location_access_audit_logs
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_location_access_audit_insert();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'location_access_audit_immutable_trg'
      AND tgrelid = 'attendance.location_access_audit_logs'::regclass
  ) THEN
    CREATE TRIGGER location_access_audit_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.location_access_audit_logs
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

ALTER TABLE attendance.location_evidence
  ADD COLUMN IF NOT EXISTS coordinate_retention_class text NULL,
  ADD COLUMN IF NOT EXISTS coordinate_retention_seconds integer NULL,
  ADD COLUMN IF NOT EXISTS coordinates_purged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS retention_policy_version_id uuid NULL;

COMMENT ON COLUMN attendance.location_evidence.coordinate_retention_class IS
  'Snapshotted named coordinate-retention class resolved when exact coordinates were collected.';
COMMENT ON COLUMN attendance.location_evidence.coordinate_retention_seconds IS
  'Snapshotted retention duration in seconds resolved from attendance policy at evidence creation.';
COMMENT ON COLUMN attendance.location_evidence.coordinates_purged_at IS
  'Set once by the retention purge transition after exact coordinate fields are redacted.';
COMMENT ON COLUMN attendance.location_evidence.retention_policy_version_id IS
  'Attendance policy version used to resolve coordinate retention, when persisted policy resolution was available.';

-- Backfill existing exact-coordinate rows using the centralized runtime default
-- class name and 30-day default duration. Expiry is based on received_at because
-- it is the authoritative server receipt timestamp already present on every row.
DO $$
DECLARE
  immutable_trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'location_evidence_immutable_trg'
      AND tgrelid = 'attendance.location_evidence'::regclass
  ) INTO immutable_trigger_exists;

  IF immutable_trigger_exists THEN
    ALTER TABLE attendance.location_evidence
      DISABLE TRIGGER location_evidence_immutable_trg;
  END IF;

  UPDATE attendance.location_evidence
  SET
    latitude = NULL,
    longitude = NULL,
    accuracy_meters = NULL,
    altitude_meters = NULL,
    is_mocked = NULL,
    provider = CASE
      WHEN provider IS NULL OR provider IN ('browser', 'device', 'network', 'unknown') THEN provider
      ELSE NULL
    END,
    raw_payload = '{}'::jsonb,
    coordinate_retention_class = NULL,
    coordinate_retention_seconds = NULL,
    coordinates_expire_at = NULL,
    coordinates_purged_at = NULL,
    retention_policy_version_id = NULL
  WHERE permission_state IN ('denied', 'unavailable');

  UPDATE attendance.location_evidence
  SET
    coordinate_retention_class = COALESCE(coordinate_retention_class, 'standard'),
    coordinate_retention_seconds = COALESCE(coordinate_retention_seconds, 2592000),
    coordinates_expire_at = COALESCE(coordinates_expire_at, received_at + make_interval(secs => 2592000))
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND coordinates_purged_at IS NULL
    AND permission_state NOT IN ('denied', 'unavailable');

  IF immutable_trigger_exists THEN
    ALTER TABLE attendance.location_evidence
      ENABLE TRIGGER location_evidence_immutable_trg;
  END IF;
EXCEPTION WHEN others THEN
  IF immutable_trigger_exists THEN
    ALTER TABLE attendance.location_evidence
      ENABLE TRIGGER location_evidence_immutable_trg;
  END IF;
  RAISE;
END $$;

ALTER TABLE attendance.location_evidence
  DROP CONSTRAINT IF EXISTS location_evidence_coordinates_expire_after_received_check,
  DROP CONSTRAINT IF EXISTS location_evidence_coordinates_by_permission_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_retention_class_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_retention_class_check
      CHECK (coordinate_retention_class IS NULL OR btrim(coordinate_retention_class) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_retention_seconds_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_retention_seconds_check
      CHECK (
        coordinate_retention_seconds IS NULL
        OR coordinate_retention_seconds BETWEEN 60 AND 315360000
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_coordinates_expire_after_received_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_coordinates_expire_after_received_check
      CHECK (coordinates_expire_at IS NULL OR coordinates_expire_at > received_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_coordinates_purge_after_received_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_coordinates_purge_after_received_check
      CHECK (coordinates_purged_at IS NULL OR coordinates_purged_at >= received_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_coordinates_by_permission_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_coordinates_by_permission_check
      CHECK (
        (
          permission_state IN ('granted', 'unknown')
          AND coordinates_purged_at IS NULL
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND accuracy_meters IS NOT NULL
          AND coordinates_expire_at IS NOT NULL
          AND coordinate_retention_class IS NOT NULL
          AND coordinate_retention_seconds IS NOT NULL
        )
        OR
        (
          permission_state IN ('granted', 'unknown')
          AND coordinates_purged_at IS NOT NULL
          AND latitude IS NULL
          AND longitude IS NULL
          AND altitude_meters IS NULL
          AND coordinates_expire_at IS NOT NULL
          AND coordinate_retention_class IS NOT NULL
          AND coordinate_retention_seconds IS NOT NULL
        )
        OR
        (
          permission_state IN ('denied', 'unavailable')
          AND latitude IS NULL
          AND longitude IS NULL
          AND accuracy_meters IS NULL
          AND altitude_meters IS NULL
          AND is_mocked IS NULL
          AND coordinates_expire_at IS NULL
          AND coordinates_purged_at IS NULL
          AND coordinate_retention_class IS NULL
          AND coordinate_retention_seconds IS NULL
          AND retention_policy_version_id IS NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS location_evidence_coordinate_purge_due_idx
  ON attendance.location_evidence (coordinates_expire_at, id)
  WHERE coordinates_expire_at IS NOT NULL
    AND coordinates_purged_at IS NULL;

CREATE OR REPLACE FUNCTION attendance.validate_location_evidence_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.retention_policy_version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM attendance.policy_versions policy_version
      WHERE policy_version.id = NEW.retention_policy_version_id
        AND policy_version.company_id = NEW.company_id
    )
  THEN
    RAISE EXCEPTION 'location evidence retention policy version does not exist for this company'
      USING ERRCODE = '23514',
            CONSTRAINT = 'location_evidence_policy_version_company_check';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS location_evidence_insert_validate_trg
  ON attendance.location_evidence;
CREATE TRIGGER location_evidence_insert_validate_trg
  BEFORE INSERT ON attendance.location_evidence
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_location_evidence_insert();

CREATE OR REPLACE FUNCTION attendance.prevent_location_evidence_invalid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable audit/log rows cannot be updated or deleted';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.coordinates_purged_at IS NULL
    AND NEW.coordinates_purged_at IS NOT NULL
    AND OLD.coordinates_expire_at IS NOT NULL
    AND OLD.coordinates_expire_at <= now()
    AND NEW.coordinates_purged_at = now()
    AND NEW.coordinates_purged_at >= OLD.coordinates_expire_at
    AND OLD.latitude IS NOT NULL
    AND OLD.longitude IS NOT NULL
    AND NEW.latitude IS NULL
    AND NEW.longitude IS NULL
    AND NEW.altitude_meters IS NULL
    AND NEW.id = OLD.id
    AND NEW.attendance_event_id = OLD.attendance_event_id
    AND NEW.company_id = OLD.company_id
    AND NEW.employee_user_id = OLD.employee_user_id
    AND NEW.captured_at = OLD.captured_at
    AND NEW.received_at = OLD.received_at
    AND NEW.accuracy_meters IS NOT DISTINCT FROM OLD.accuracy_meters
    AND NEW.provider IS NOT DISTINCT FROM OLD.provider
    AND NEW.is_mocked IS NOT DISTINCT FROM OLD.is_mocked
    AND NEW.integrity_status IS NOT DISTINCT FROM OLD.integrity_status
    AND NEW.age_ms = OLD.age_ms
    AND NEW.permission_state = OLD.permission_state
    AND NEW.coordinates_expire_at IS NOT DISTINCT FROM OLD.coordinates_expire_at
    AND NEW.coordinate_retention_class IS NOT DISTINCT FROM OLD.coordinate_retention_class
    AND NEW.coordinate_retention_seconds IS NOT DISTINCT FROM OLD.coordinate_retention_seconds
    AND NEW.retention_policy_version_id IS NOT DISTINCT FROM OLD.retention_policy_version_id
    AND NEW.created_at = OLD.created_at
    AND NEW.raw_payload = '{}'::jsonb
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'immutable audit/log rows cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS location_evidence_immutable_trg
  ON attendance.location_evidence;
CREATE TRIGGER location_evidence_immutable_trg
  BEFORE UPDATE OR DELETE ON attendance.location_evidence
  FOR EACH ROW EXECUTE FUNCTION attendance.prevent_location_evidence_invalid_mutation();
