-- Complete GEO-S12-004 location evidence metadata and tenant-safe ledger links.
-- Historical migration 0033 remains unchanged; this forward migration only
-- adds missing runtime-support columns and constraints.

ALTER TABLE attendance.location_evidence
  ADD COLUMN IF NOT EXISTS age_ms integer,
  ADD COLUMN IF NOT EXISTS permission_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS coordinates_expire_at timestamptz NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance.location_evidence
    WHERE age_ms IS NULL
      AND GREATEST(
        FLOOR(EXTRACT(EPOCH FROM (received_at - captured_at)) * 1000),
        0
      ) > 2147483647
  ) THEN
    RAISE EXCEPTION 'Cannot backfill location_evidence age_ms: derived value exceeds PostgreSQL integer range.';
  END IF;

  UPDATE attendance.location_evidence
  SET age_ms = GREATEST(
    FLOOR(EXTRACT(EPOCH FROM (received_at - captured_at)) * 1000),
    0
  )::integer
  WHERE age_ms IS NULL;

  IF EXISTS (
    SELECT 1
    FROM attendance.location_evidence
    WHERE age_ms < 0
  ) THEN
    RAISE EXCEPTION 'Cannot add location_evidence age constraint: negative age_ms rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance.location_evidence
    WHERE permission_state NOT IN ('granted', 'denied', 'unavailable', 'unknown')
  ) THEN
    RAISE EXCEPTION 'Cannot add location_evidence permission constraint: unsupported permission_state rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance.location_evidence
    WHERE provider IS NOT NULL
      AND provider NOT IN ('browser', 'device', 'network', 'unknown')
  ) THEN
    RAISE EXCEPTION 'Cannot add location_evidence provider constraint: unsupported provider rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance.location_evidence
    WHERE coordinates_expire_at IS NOT NULL
      AND coordinates_expire_at <= received_at
  ) THEN
    RAISE EXCEPTION 'Cannot add location_evidence retention constraint: coordinates_expire_at must be after received_at.';
  END IF;
END $$;

ALTER TABLE attendance.location_evidence
  ALTER COLUMN age_ms SET NOT NULL,
  ALTER COLUMN age_ms DROP DEFAULT;

ALTER TABLE attendance.location_evidence
  DROP CONSTRAINT IF EXISTS location_evidence_coordinates_expire_after_capture_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_age_ms_nonnegative_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_age_ms_nonnegative_check
      CHECK (age_ms >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_permission_state_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_permission_state_check
      CHECK (permission_state IN ('granted', 'denied', 'unavailable', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_provider_check'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_provider_check
      CHECK (provider IS NULL OR provider IN ('browser', 'device', 'network', 'unknown'));
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
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance.location_evidence location
    LEFT JOIN attendance.attendance_events event
      ON event.id = location.attendance_event_id
     AND event.company_id = location.company_id
    WHERE event.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add tenant-safe FK: location_evidence rows reference missing or cross-tenant attendance_events.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance.attendance_decisions decision
    LEFT JOIN attendance.attendance_events event
      ON event.id = decision.attendance_event_id
     AND event.company_id = decision.company_id
    WHERE event.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add tenant-safe FK: attendance_decisions rows reference missing or cross-tenant attendance_events.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance.decision_reasons reason
    LEFT JOIN attendance.attendance_decisions decision
      ON decision.id = reason.attendance_decision_id
     AND decision.company_id = reason.company_id
    WHERE decision.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add tenant-safe FK: decision_reasons rows reference missing or cross-tenant attendance_decisions.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_events_id_company_uq'
      AND conrelid = 'attendance.attendance_events'::regclass
  ) THEN
    ALTER TABLE attendance.attendance_events
      ADD CONSTRAINT attendance_events_id_company_uq
      UNIQUE (id, company_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_decisions_id_company_uq'
      AND conrelid = 'attendance.attendance_decisions'::regclass
  ) THEN
    ALTER TABLE attendance.attendance_decisions
      ADD CONSTRAINT attendance_decisions_id_company_uq
      UNIQUE (id, company_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_evidence_event_company_fk'
      AND conrelid = 'attendance.location_evidence'::regclass
  ) THEN
    ALTER TABLE attendance.location_evidence
      ADD CONSTRAINT location_evidence_event_company_fk
      FOREIGN KEY (attendance_event_id, company_id)
      REFERENCES attendance.attendance_events (id, company_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_decisions_event_company_fk'
      AND conrelid = 'attendance.attendance_decisions'::regclass
  ) THEN
    ALTER TABLE attendance.attendance_decisions
      ADD CONSTRAINT attendance_decisions_event_company_fk
      FOREIGN KEY (attendance_event_id, company_id)
      REFERENCES attendance.attendance_events (id, company_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'decision_reasons_decision_company_fk'
      AND conrelid = 'attendance.decision_reasons'::regclass
  ) THEN
    ALTER TABLE attendance.decision_reasons
      ADD CONSTRAINT decision_reasons_decision_company_fk
      FOREIGN KEY (attendance_decision_id, company_id)
      REFERENCES attendance.attendance_decisions (id, company_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT;
  END IF;
END $$;
