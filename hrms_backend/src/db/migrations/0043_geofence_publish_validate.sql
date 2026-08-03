ALTER TABLE attendance.geofence_versions
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NULL,
  ADD COLUMN IF NOT EXISTS effective_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS canonical_hash text NULL;

CREATE OR REPLACE FUNCTION attendance.geofence_shape_canonical_hash(
  input_shape_type text,
  input_shape geometry,
  input_circle_radius_meters numeric
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(encode(digest(convert_to(
    'geofence-shape:v1|'
      || input_shape_type
      || '|'
      || ST_SRID(input_shape)::text
      || '|'
      || encode(ST_AsEWKB(ST_Normalize(ST_Force2D(input_shape)), 'XDR'), 'hex')
      || '|'
      || CASE
        WHEN input_shape_type = 'circle'
          THEN input_circle_radius_meters::numeric(12,2)::text
        ELSE 'null'
      END,
    'UTF8'
  ), 'sha256'), 'hex'));
$$;

LOCK TABLE attendance.geofence_versions IN ACCESS EXCLUSIVE MODE;

-- Migration-only backfill for rows published before GEO-S12-003 fields existed.
-- The existing immutability trigger correctly blocks all later published-row
-- updates; this transaction-scoped bypass is limited to the required new
-- derived columns and published immutability remains enforced after migration.
ALTER TABLE attendance.geofence_versions
  DISABLE TRIGGER attendance_geofence_versions_immutability_trg;

UPDATE attendance.geofence_versions
SET effective_from = COALESCE(effective_from, published_at, created_at),
    canonical_hash = attendance.geofence_shape_canonical_hash(
      shape_type,
      shape,
      circle_radius_meters
    )
WHERE version_status = 'published'
  AND (
    effective_from IS NULL
    OR canonical_hash IS NULL
  );

ALTER TABLE attendance.geofence_versions
  ENABLE TRIGGER attendance_geofence_versions_immutability_trg;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance.geofence_versions version
    WHERE version.version_status = 'published'
      AND (
        version.effective_from IS NULL
        OR version.canonical_hash !~ '^[0-9a-f]{64}$'
      )
  ) THEN
    RAISE EXCEPTION 'published geofence versions require effective_from and canonical_hash after GEO-S12-003 backfill'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_geofence_versions_published_backfill_required_fields';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance.geofence_versions newer
    JOIN attendance.geofence_versions existing
      ON existing.company_id = newer.company_id
     AND existing.geofence_id = newer.geofence_id
     AND existing.id <> newer.id
     AND existing.version_status = 'published'
     AND tstzrange(existing.effective_from, existing.effective_until, '[)') &&
         tstzrange(newer.effective_from, newer.effective_until, '[)')
    WHERE newer.version_status = 'published'
  ) THEN
    RAISE EXCEPTION 'existing overlapping published geofence periods must be resolved before GEO-S12-003 migration'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_geofence_versions_existing_published_period_overlap';
  END IF;
END $$;

ALTER TABLE attendance.geofence_versions
  DROP CONSTRAINT IF EXISTS attendance_geofence_versions_publication_fields_check,
  ADD CONSTRAINT attendance_geofence_versions_publication_fields_check
    CHECK (
      (
        version_status = 'draft'
        AND published_at IS NULL
        AND published_by_user_id IS NULL
        AND canonical_hash IS NULL
      )
      OR
      (
        version_status = 'published'
        AND published_at IS NOT NULL
        AND published_by_user_id IS NOT NULL
        AND effective_from IS NOT NULL
        AND canonical_hash ~ '^[0-9a-f]{64}$'
      )
    ),
  DROP CONSTRAINT IF EXISTS attendance_geofence_versions_effective_period_check,
  ADD CONSTRAINT attendance_geofence_versions_effective_period_check
    CHECK (
      effective_until IS NULL
      OR (
        effective_from IS NOT NULL
        AND effective_from < effective_until
      )
    );

CREATE INDEX IF NOT EXISTS attendance_geofence_versions_effective_lookup_idx
  ON attendance.geofence_versions (
    company_id,
    geofence_id,
    version_status,
    effective_from,
    effective_until
  )
  WHERE version_status = 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_geofence_versions_published_period_no_overlap'
      AND conrelid = 'attendance.geofence_versions'::regclass
  ) THEN
    ALTER TABLE attendance.geofence_versions
      ADD CONSTRAINT attendance_geofence_versions_published_period_no_overlap
      EXCLUDE USING gist (
        company_id WITH =,
        geofence_id WITH =,
        tstzrange(effective_from, effective_until, '[)') WITH &&
      )
      WHERE (version_status = 'published');
  END IF;
END $$;
