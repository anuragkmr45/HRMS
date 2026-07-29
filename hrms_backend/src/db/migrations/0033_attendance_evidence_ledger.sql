-- Immutable evidence and policy-evaluation ledger. These tables intentionally
-- remain distinct from command decisions and operational attendance projections.
CREATE TABLE IF NOT EXISTS attendance.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  actor_user_id uuid NULL,
  command_execution_id uuid NULL,
  event_type text NOT NULL,
  source text NOT NULL
    CHECK (source IN ('web', 'mobile', 'kiosk', 'admin', 'system')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  schema_version integer NOT NULL DEFAULT 1
    CHECK (schema_version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NULL
    CHECK (payload_hash IS NULL OR length(payload_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_events_employee_occurred_idx
  ON attendance.attendance_events (
    company_id,
    employee_user_id,
    occurred_at DESC
  );

CREATE INDEX IF NOT EXISTS attendance_events_command_created_idx
  ON attendance.attendance_events (command_execution_id, created_at)
  WHERE command_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_events_type_received_idx
  ON attendance.attendance_events (company_id, event_type, received_at DESC);


CREATE TABLE IF NOT EXISTS attendance.location_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_event_id uuid NOT NULL,
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(9,6) NOT NULL
    CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL
    CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(10,2) NOT NULL
    CHECK (accuracy_meters >= 0),
  altitude_meters numeric(10,2) NULL,
  provider text NULL,
  is_mocked boolean NULL,
  integrity_status text NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS location_evidence_event_captured_idx
  ON attendance.location_evidence (attendance_event_id, captured_at);

CREATE INDEX IF NOT EXISTS location_evidence_employee_captured_idx
  ON attendance.location_evidence (
    company_id,
    employee_user_id,
    captured_at DESC
  );


CREATE TABLE IF NOT EXISTS attendance.attendance_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  attendance_event_id uuid NOT NULL,
  command_execution_id uuid NULL,
  decision_type text NOT NULL,
  outcome text NOT NULL
    CHECK (outcome IN ('passed', 'failed', 'not_applicable', 'indeterminate')),
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  evaluator_version text NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  evidence_digest text NULL
    CHECK (evidence_digest IS NULL OR length(evidence_digest) = 64),
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_evidence_decisions_event_evaluated_idx
  ON attendance.attendance_decisions (attendance_event_id, evaluated_at);

CREATE INDEX IF NOT EXISTS attendance_evidence_decisions_command_evaluated_idx
  ON attendance.attendance_decisions (command_execution_id, evaluated_at)
  WHERE command_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_evidence_decisions_employee_evaluated_idx
  ON attendance.attendance_decisions (
    company_id,
    employee_user_id,
    evaluated_at DESC
  );


CREATE TABLE IF NOT EXISTS attendance.decision_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_decision_id uuid NOT NULL,
  company_id uuid NOT NULL,
  reason_code text NOT NULL,
  category text NULL,
  severity text NULL,
  ordinal integer NOT NULL DEFAULT 0
    CHECK (ordinal >= 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_decision_reasons_ordinal_uq
    UNIQUE (attendance_decision_id, ordinal)
);


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'attendance_events_immutable_trg'
      AND tgrelid = 'attendance.attendance_events'::regclass
  ) THEN
    CREATE TRIGGER attendance_events_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.attendance_events
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'location_evidence_immutable_trg'
      AND tgrelid = 'attendance.location_evidence'::regclass
  ) THEN
    CREATE TRIGGER location_evidence_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.location_evidence
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'attendance_decisions_immutable_trg'
      AND tgrelid = 'attendance.attendance_decisions'::regclass
  ) THEN
    CREATE TRIGGER attendance_decisions_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.attendance_decisions
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'decision_reasons_immutable_trg'
      AND tgrelid = 'attendance.decision_reasons'::regclass
  ) THEN
    CREATE TRIGGER decision_reasons_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.decision_reasons
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'command_decisions_immutable_trg'
      AND tgrelid = 'attendance.command_decisions'::regclass
  ) THEN
    CREATE TRIGGER command_decisions_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.command_decisions
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
