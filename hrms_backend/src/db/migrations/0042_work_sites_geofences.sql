CREATE TABLE IF NOT EXISTS attendance.work_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  site_code text NOT NULL,
  name text NOT NULL,
  site_type text NOT NULL,
  timezone text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT attendance_work_sites_id_company_uq UNIQUE (id, company_id),
  CONSTRAINT attendance_work_sites_site_code_not_blank_check
    CHECK (btrim(site_code) <> ''),
  CONSTRAINT attendance_work_sites_name_not_blank_check
    CHECK (btrim(name) <> ''),
  CONSTRAINT attendance_work_sites_site_type_not_blank_check
    CHECK (btrim(site_type) <> ''),
  CONSTRAINT attendance_work_sites_timezone_not_blank_check
    CHECK (btrim(timezone) <> ''),
  CONSTRAINT attendance_work_sites_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT attendance_work_sites_version_positive_check
    CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_work_sites_company_code_uq
  ON attendance.work_sites (company_id, site_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_work_sites_company_active_name_idx
  ON attendance.work_sites (company_id, is_active, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_work_sites_company_type_idx
  ON attendance.work_sites (company_id, site_type, name)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION attendance.validate_work_site_timezone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names timezone_name
    WHERE timezone_name.name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'work site timezone must be a valid PostgreSQL timezone name'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_work_sites_timezone_valid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_work_sites_timezone_valid_trg
  ON attendance.work_sites;
CREATE TRIGGER attendance_work_sites_timezone_valid_trg
  BEFORE INSERT OR UPDATE OF timezone
  ON attendance.work_sites
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_work_site_timezone();

CREATE TABLE IF NOT EXISTS attendance.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  work_site_id uuid NOT NULL,
  geofence_code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  current_published_version_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT attendance_geofences_work_site_company_fk
    FOREIGN KEY (work_site_id, company_id)
    REFERENCES attendance.work_sites (id, company_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT attendance_geofences_id_company_uq UNIQUE (id, company_id),
  CONSTRAINT attendance_geofences_code_not_blank_check
    CHECK (btrim(geofence_code) <> ''),
  CONSTRAINT attendance_geofences_name_not_blank_check
    CHECK (btrim(name) <> ''),
  CONSTRAINT attendance_geofences_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT attendance_geofences_version_positive_check
    CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_geofences_site_code_uq
  ON attendance.geofences (company_id, work_site_id, geofence_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_geofences_company_site_active_idx
  ON attendance.geofences (company_id, work_site_id, is_active, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_geofences_current_version_idx
  ON attendance.geofences (company_id, current_published_version_id)
  WHERE current_published_version_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS attendance.geofence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  geofence_id uuid NOT NULL,
  version_number integer NOT NULL,
  version_status text NOT NULL DEFAULT 'draft',
  shape_type text NOT NULL,
  shape geometry(Geometry, 4326) NOT NULL,
  circle_radius_meters numeric(12,2) NULL,
  shape_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by_user_id uuid NULL,
  published_at timestamptz NULL,
  CONSTRAINT attendance_geofence_versions_geofence_company_fk
    FOREIGN KEY (geofence_id, company_id)
    REFERENCES attendance.geofences (id, company_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT attendance_geofence_versions_company_geofence_number_uq
    UNIQUE (company_id, geofence_id, version_number),
  CONSTRAINT attendance_geofence_versions_id_company_geofence_uq
    UNIQUE (id, company_id, geofence_id),
  CONSTRAINT attendance_geofence_versions_version_number_check
    CHECK (version_number > 0),
  CONSTRAINT attendance_geofence_versions_status_check
    CHECK (version_status IN ('draft', 'published')),
  CONSTRAINT attendance_geofence_versions_shape_type_check
    CHECK (shape_type IN ('circle', 'polygon')),
  CONSTRAINT attendance_geofence_versions_shape_metadata_object_check
    CHECK (jsonb_typeof(shape_metadata) = 'object'),
  CONSTRAINT attendance_geofence_versions_publication_fields_check
    CHECK (
      (version_status = 'draft'
        AND published_at IS NULL
        AND published_by_user_id IS NULL)
      OR
      (version_status = 'published'
        AND published_at IS NOT NULL
        AND published_by_user_id IS NOT NULL)
    ),
  CONSTRAINT attendance_geofence_versions_spatial_shape_check
    CHECK (
      NOT ST_IsEmpty(shape)
      AND ST_SRID(shape) = 4326
      AND ST_CoordDim(shape) = 2
      AND (
        (
          shape_type = 'circle'
          AND ST_GeometryType(shape) = 'ST_Point'
          AND circle_radius_meters IS NOT NULL
          AND circle_radius_meters > 0
          AND CASE
            WHEN ST_GeometryType(shape) = 'ST_Point'
              THEN ST_X(shape) BETWEEN -180 AND 180
                AND ST_Y(shape) BETWEEN -90 AND 90
            ELSE false
          END
        )
        OR
        (
          shape_type = 'polygon'
          AND ST_GeometryType(shape) IN ('ST_Polygon', 'ST_MultiPolygon')
          AND circle_radius_meters IS NULL
          AND ST_IsValid(shape)
        )
      )
    )
);

CREATE INDEX IF NOT EXISTS attendance_geofence_versions_geofence_status_idx
  ON attendance.geofence_versions (
    company_id,
    geofence_id,
    version_status,
    version_number
  );

CREATE INDEX IF NOT EXISTS attendance_geofence_versions_published_circles_gist_idx
  ON attendance.geofence_versions
  USING gist ((shape::geography))
  WHERE shape_type = 'circle'
    AND version_status = 'published';

CREATE INDEX IF NOT EXISTS attendance_geofence_versions_published_polygons_gist_idx
  ON attendance.geofence_versions
  USING gist (shape)
  WHERE shape_type = 'polygon'
    AND version_status = 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_geofences_current_published_version_fk'
      AND conrelid = 'attendance.geofences'::regclass
  ) THEN
    ALTER TABLE attendance.geofences
      ADD CONSTRAINT attendance_geofences_current_published_version_fk
      FOREIGN KEY (current_published_version_id, company_id, id)
      REFERENCES attendance.geofence_versions (id, company_id, geofence_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION attendance.prevent_geofence_version_invalid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.version_status = 'published' THEN
      RAISE EXCEPTION 'published geofence versions cannot be updated or deleted'
        USING ERRCODE = '23514',
          CONSTRAINT = 'attendance_geofence_versions_published_immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.version_status = 'published' THEN
    RAISE EXCEPTION 'published geofence versions cannot be updated or deleted'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_geofence_versions_published_immutable';
  END IF;

  IF OLD.id <> NEW.id
    OR OLD.company_id <> NEW.company_id
    OR OLD.geofence_id <> NEW.geofence_id
    OR OLD.version_number <> NEW.version_number
    OR OLD.created_at <> NEW.created_at
    OR OLD.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id
  THEN
    RAISE EXCEPTION 'geofence version identity and provenance fields are immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_geofence_versions_identity_immutable';
  END IF;

  IF OLD.version_status = 'draft' AND NEW.version_status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.version_status = 'draft' AND NEW.version_status = 'published' THEN
    IF OLD.shape_type <> NEW.shape_type
      OR OLD.shape IS DISTINCT FROM NEW.shape
      OR OLD.circle_radius_meters IS DISTINCT FROM NEW.circle_radius_meters
      OR OLD.shape_metadata IS DISTINCT FROM NEW.shape_metadata
    THEN
      RAISE EXCEPTION 'publishing a geofence version may only change publication fields'
        USING ERRCODE = '23514',
          CONSTRAINT = 'attendance_geofence_versions_publish_only_fields';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'unsupported geofence version status transition'
    USING ERRCODE = '23514',
      CONSTRAINT = 'attendance_geofence_versions_status_transition';
END;
$$;

DROP TRIGGER IF EXISTS attendance_geofence_versions_immutability_trg
  ON attendance.geofence_versions;
CREATE TRIGGER attendance_geofence_versions_immutability_trg
  BEFORE UPDATE OR DELETE
  ON attendance.geofence_versions
  FOR EACH ROW EXECUTE FUNCTION attendance.prevent_geofence_version_invalid_mutation();

CREATE OR REPLACE FUNCTION attendance.validate_current_geofence_version_published()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  referenced_status text;
BEGIN
  IF NEW.current_published_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT version_status
    INTO referenced_status
  FROM attendance.geofence_versions version
  WHERE version.id = NEW.current_published_version_id
    AND version.company_id = NEW.company_id
    AND version.geofence_id = NEW.id;

  IF referenced_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'current geofence version must reference a published version'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_geofences_current_version_published';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_geofences_current_version_published_trg
  ON attendance.geofences;
CREATE CONSTRAINT TRIGGER attendance_geofences_current_version_published_trg
  AFTER INSERT OR UPDATE OF current_published_version_id
  ON attendance.geofences
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_current_geofence_version_published();
