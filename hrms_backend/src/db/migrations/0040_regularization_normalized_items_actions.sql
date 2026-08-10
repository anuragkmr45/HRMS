-- GEO-S11-008: normalized regularization intents and immutable applications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_regularization_requests_id_company_uq'
      AND conrelid = 'attendance.regularization_requests'::regclass
  ) THEN
    ALTER TABLE attendance.regularization_requests
      ADD CONSTRAINT attendance_regularization_requests_id_company_uq
      UNIQUE (id, company_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_punch_events_id_company_uq'
      AND conrelid = 'attendance.punch_events'::regclass
  ) THEN
    ALTER TABLE attendance.punch_events
      ADD CONSTRAINT attendance_punch_events_id_company_uq
      UNIQUE (id, company_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_events_id_company_uq'
      AND conrelid = 'attendance.attendance_events'::regclass
  ) THEN
    ALTER TABLE attendance.attendance_events
      ADD CONSTRAINT attendance_events_id_company_uq
      UNIQUE (id, company_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendance.regularization_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  regularization_request_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  operation text NOT NULL CHECK (operation IN ('add', 'replace', 'void')),
  target_punch_event_id uuid NULL,
  event_type text NULL CHECK (event_type IS NULL OR event_type IN ('check_in', 'check_out')),
  occurred_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_regularization_items_request_company_fk
    FOREIGN KEY (regularization_request_id, company_id)
    REFERENCES attendance.regularization_requests (id, company_id),
  CONSTRAINT attendance_regularization_items_target_company_fk
    FOREIGN KEY (target_punch_event_id, company_id)
    REFERENCES attendance.punch_events (id, company_id),
  CONSTRAINT attendance_regularization_items_operation_shape_check CHECK (
    (operation = 'add' AND target_punch_event_id IS NULL AND event_type IS NOT NULL AND occurred_at IS NOT NULL)
    OR
    (operation = 'replace' AND target_punch_event_id IS NOT NULL AND event_type IS NOT NULL AND occurred_at IS NOT NULL)
    OR
    (operation = 'void' AND target_punch_event_id IS NOT NULL AND event_type IS NULL AND occurred_at IS NULL)
  ),
  CONSTRAINT attendance_regularization_items_request_ordinal_uq
    UNIQUE (regularization_request_id, ordinal),
  CONSTRAINT attendance_regularization_items_id_company_uq
    UNIQUE (id, company_id)
);

CREATE INDEX IF NOT EXISTS attendance_regularization_items_company_request_idx
  ON attendance.regularization_request_items (company_id, regularization_request_id, ordinal);

CREATE INDEX IF NOT EXISTS attendance_regularization_items_target_idx
  ON attendance.regularization_request_items (company_id, target_punch_event_id)
  WHERE target_punch_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS attendance.regularization_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  regularization_request_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  subject_employee_user_id uuid NOT NULL,
  action_kind text NOT NULL CHECK (action_kind IN ('submitted', 'approved', 'returned', 'rejected')),
  previous_state text NULL CHECK (previous_state IS NULL OR previous_state IN ('pending', 'approved', 'returned', 'rejected')),
  resulting_state text NOT NULL CHECK (resulting_state IN ('pending', 'approved', 'returned', 'rejected')),
  remarks text NULL,
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  migration_reconstructed boolean NOT NULL DEFAULT false,
  CONSTRAINT attendance_regularization_actions_request_company_fk
    FOREIGN KEY (regularization_request_id, company_id)
    REFERENCES attendance.regularization_requests (id, company_id),
  CONSTRAINT attendance_regularization_actions_transition_check CHECK (
    (action_kind = 'submitted' AND previous_state IS NULL AND resulting_state = 'pending')
    OR
    (action_kind = 'approved' AND previous_state = 'pending' AND resulting_state = 'approved')
    OR
    (action_kind = 'returned' AND previous_state = 'pending' AND resulting_state = 'returned')
    OR
    (action_kind = 'rejected' AND previous_state = 'pending' AND resulting_state = 'rejected')
  ),
  CONSTRAINT attendance_regularization_actions_request_version_uq
    UNIQUE (regularization_request_id, resulting_version),
  CONSTRAINT attendance_regularization_actions_id_request_company_uq
    UNIQUE (id, regularization_request_id, company_id)
);

CREATE INDEX IF NOT EXISTS attendance_regularization_actions_company_request_idx
  ON attendance.regularization_actions (company_id, regularization_request_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS attendance.regularization_correction_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  regularization_request_id uuid NOT NULL,
  regularization_request_item_id uuid NOT NULL,
  regularization_action_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('add', 'replace', 'void')),
  target_punch_event_id uuid NULL,
  replacement_punch_event_id uuid NULL,
  attendance_event_id uuid NULL,
  applied_by_user_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_regularization_applications_request_company_fk
    FOREIGN KEY (regularization_request_id, company_id)
    REFERENCES attendance.regularization_requests (id, company_id),
  CONSTRAINT attendance_regularization_applications_item_company_fk
    FOREIGN KEY (regularization_request_item_id, company_id)
    REFERENCES attendance.regularization_request_items (id, company_id),
  CONSTRAINT attendance_regularization_applications_action_request_company_fk
    FOREIGN KEY (regularization_action_id, regularization_request_id, company_id)
    REFERENCES attendance.regularization_actions (id, regularization_request_id, company_id),
  CONSTRAINT attendance_regularization_applications_target_company_fk
    FOREIGN KEY (target_punch_event_id, company_id)
    REFERENCES attendance.punch_events (id, company_id),
  CONSTRAINT attendance_regularization_applications_replacement_company_fk
    FOREIGN KEY (replacement_punch_event_id, company_id)
    REFERENCES attendance.punch_events (id, company_id),
  CONSTRAINT attendance_regularization_applications_event_company_fk
    FOREIGN KEY (attendance_event_id, company_id)
    REFERENCES attendance.attendance_events (id, company_id),
  CONSTRAINT attendance_regularization_applications_shape_check CHECK (
    (operation = 'add' AND target_punch_event_id IS NULL AND replacement_punch_event_id IS NOT NULL AND attendance_event_id IS NOT NULL)
    OR
    (operation = 'replace' AND target_punch_event_id IS NOT NULL AND replacement_punch_event_id IS NOT NULL AND attendance_event_id IS NOT NULL)
    OR
    (operation = 'void' AND target_punch_event_id IS NOT NULL AND replacement_punch_event_id IS NULL AND attendance_event_id IS NULL)
  ),
  CONSTRAINT attendance_regularization_applications_item_uq
    UNIQUE (regularization_request_item_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_regularization_applications_target_uq
  ON attendance.regularization_correction_applications (target_punch_event_id)
  WHERE target_punch_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_regularization_applications_replacement_uq
  ON attendance.regularization_correction_applications (replacement_punch_event_id)
  WHERE replacement_punch_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_regularization_applications_company_request_idx
  ON attendance.regularization_correction_applications (company_id, regularization_request_id, applied_at, id);

DO $$
DECLARE
  invalid_request_id uuid;
  invalid_ordinal bigint;
  legacy_item jsonb;
BEGIN
  SELECT id INTO invalid_request_id
  FROM attendance.regularization_requests request
  WHERE NOT EXISTS (
    SELECT 1
    FROM attendance.regularization_request_items item
    WHERE item.regularization_request_id = request.id
  )
    AND jsonb_typeof(requested_punches) IS DISTINCT FROM 'array'
  LIMIT 1;
  IF invalid_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'GEO-S11-008 migration: requested_punches is not an array for regularization request %', invalid_request_id;
  END IF;

  SELECT id INTO invalid_request_id
  FROM attendance.regularization_requests request
  WHERE NOT EXISTS (
    SELECT 1
    FROM attendance.regularization_request_items item
    WHERE item.regularization_request_id = request.id
  )
    AND jsonb_array_length(requested_punches) = 0
  LIMIT 1;
  IF invalid_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'GEO-S11-008 migration: requested_punches is empty and cannot be normalized for regularization request %', invalid_request_id;
  END IF;

  SELECT request_id, ordinality, item
  INTO invalid_request_id, invalid_ordinal, legacy_item
  FROM (
    SELECT request.id AS request_id, punch.ordinality, punch.item
    FROM attendance.regularization_requests request
    CROSS JOIN LATERAL jsonb_array_elements(request.requested_punches)
      WITH ORDINALITY AS punch(item, ordinality)
    WHERE NOT EXISTS (
      SELECT 1
      FROM attendance.regularization_request_items normalized_item
      WHERE normalized_item.regularization_request_id = request.id
    )
  ) legacy
  WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
     OR item->>'event_type' NOT IN ('check_in', 'check_out')
     OR jsonb_typeof(item->'occurred_at') IS DISTINCT FROM 'string'
  LIMIT 1;
  IF invalid_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'GEO-S11-008 migration: malformed requested_punches item for request %, ordinal %, value %',
      invalid_request_id, invalid_ordinal, legacy_item;
  END IF;

  FOR invalid_request_id, invalid_ordinal, legacy_item IN
    SELECT request.id, punch.ordinality, punch.item
    FROM attendance.regularization_requests request
    CROSS JOIN LATERAL jsonb_array_elements(request.requested_punches)
      WITH ORDINALITY AS punch(item, ordinality)
    WHERE NOT EXISTS (
      SELECT 1
      FROM attendance.regularization_request_items normalized_item
      WHERE normalized_item.regularization_request_id = request.id
    )
  LOOP
    BEGIN
      PERFORM (legacy_item->>'occurred_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'GEO-S11-008 migration: invalid occurred_at for request %, ordinal %, value %',
        invalid_request_id, invalid_ordinal, legacy_item->>'occurred_at';
    END;
  END LOOP;
END $$;

INSERT INTO attendance.regularization_request_items (
  company_id, regularization_request_id, ordinal, operation, event_type, occurred_at, created_at
)
SELECT
  request.company_id,
  request.id,
  (punch.ordinality - 1)::integer,
  'add',
  punch.item->>'event_type',
  (punch.item->>'occurred_at')::timestamptz,
  request.created_at
FROM attendance.regularization_requests request
CROSS JOIN LATERAL jsonb_array_elements(request.requested_punches)
  WITH ORDINALITY AS punch(item, ordinality)
WHERE NOT EXISTS (
  SELECT 1
  FROM attendance.regularization_request_items normalized_item
  WHERE normalized_item.regularization_request_id = request.id
)
ON CONFLICT (regularization_request_id, ordinal) DO NOTHING;

INSERT INTO attendance.regularization_actions (
  company_id, regularization_request_id, actor_user_id, subject_employee_user_id,
  action_kind, previous_state, resulting_state, remarks, resulting_version,
  occurred_at, migration_reconstructed
)
SELECT
  company_id, id, submitted_by_user_id, employee_user_id,
  'submitted', NULL, 'pending', NULL, 1, created_at, true
FROM attendance.regularization_requests
ON CONFLICT (regularization_request_id, resulting_version) DO NOTHING;

INSERT INTO attendance.regularization_actions (
  company_id, regularization_request_id, actor_user_id, subject_employee_user_id,
  action_kind, previous_state, resulting_state, remarks, resulting_version,
  occurred_at, migration_reconstructed
)
SELECT
  company_id, id, decided_by_user_id, employee_user_id,
  status, 'pending', status, decision_remarks, version, decided_at, true
FROM attendance.regularization_requests
WHERE status IN ('approved', 'returned', 'rejected')
  AND decided_by_user_id IS NOT NULL
  AND decided_at IS NOT NULL
ON CONFLICT (regularization_request_id, resulting_version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_regularization_items_immutable_trg') THEN
    CREATE TRIGGER attendance_regularization_items_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.regularization_request_items
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_regularization_actions_immutable_trg') THEN
    CREATE TRIGGER attendance_regularization_actions_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.regularization_actions
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_regularization_applications_immutable_trg') THEN
    CREATE TRIGGER attendance_regularization_applications_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.regularization_correction_applications
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
