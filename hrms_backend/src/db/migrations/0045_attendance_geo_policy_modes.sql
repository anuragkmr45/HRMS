-- GEO-S12-005: allow status-only location evidence for denied/unavailable
-- browser location outcomes without fabricating coordinates.
ALTER TABLE attendance.location_evidence
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL,
  ALTER COLUMN accuracy_meters DROP NOT NULL;

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
    coordinates_expire_at = NULL
  WHERE permission_state IN ('denied', 'unavailable');

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

DO $$
BEGIN
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
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND accuracy_meters IS NOT NULL
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
        )
      );
  END IF;
END $$;
