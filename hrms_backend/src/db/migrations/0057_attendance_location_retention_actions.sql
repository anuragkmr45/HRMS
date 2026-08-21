CREATE OR REPLACE FUNCTION attendance.redact_location_from_command_request_snapshot(input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  output jsonb := COALESCE(input, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(output) <> 'object' THEN
    RETURN output;
  END IF;

  IF output ? 'location' THEN
    output := jsonb_set(output, '{location}', 'null'::jsonb, false);
  END IF;

  IF jsonb_typeof(output #> '{command}') = 'object'
    AND (output #> '{command}') ? 'location'
  THEN
    output := jsonb_set(output, '{command,location}', 'null'::jsonb, false);
  END IF;

  IF jsonb_typeof(output #> '{envelope,command}') = 'object'
    AND (output #> '{envelope,command}') ? 'location'
  THEN
    output := jsonb_set(output, '{envelope,command,location}', 'null'::jsonb, false);
  END IF;

  output := output - 'latitude' - 'longitude' - 'altitude_meters' - 'raw_payload';
  RETURN output;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.redact_location_from_offline_event_payload(input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  output jsonb := COALESCE(input, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(output) <> 'object' THEN
    RETURN output;
  END IF;

  IF output ? 'location' THEN
    output := jsonb_set(output, '{location}', 'null'::jsonb, false);
  END IF;

  output := output - 'latitude' - 'longitude' - 'altitude_meters' - 'raw_payload';
  RETURN output;
END;
$$;

CREATE TABLE IF NOT EXISTS attendance.location_retention_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  location_evidence_id uuid NOT NULL,
  attendance_event_id uuid NULL,
  retention_policy_version_id uuid NULL,
  coordinate_retention_class text NULL,
  coordinate_retention_seconds integer NULL,
  coordinates_expire_at timestamptz NOT NULL,
  coordinates_purged_at timestamptz NOT NULL,
  action_type text NOT NULL,
  worker_origin text NOT NULL,
  worker_version text NOT NULL,
  storage_surfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
  redacted_command_snapshot_count integer NOT NULL DEFAULT 0,
  redacted_offline_event_payload_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT location_retention_actions_type_check
    CHECK (action_type IN ('attendance.location_coordinates.purged')),
  CONSTRAINT location_retention_actions_worker_origin_check
    CHECK (worker_origin IN ('attendance-coordinate-purge-worker')),
  CONSTRAINT location_retention_actions_worker_version_check
    CHECK (btrim(worker_version) <> ''),
  CONSTRAINT location_retention_actions_storage_surfaces_array_check
    CHECK (jsonb_typeof(storage_surfaces) = 'array'),
  CONSTRAINT location_retention_actions_storage_surfaces_check
    CHECK (
      storage_surfaces <@ '[
        "attendance.location_evidence",
        "attendance.command_executions.request_snapshot",
        "attendance.offline_event_inbox.event_payload"
      ]'::jsonb
    ),
  CONSTRAINT location_retention_actions_primary_surface_check
    CHECK (
      action_type <> 'attendance.location_coordinates.purged'
      OR storage_surfaces @> '["attendance.location_evidence"]'::jsonb
    ),
  CONSTRAINT location_retention_actions_command_count_check
    CHECK (redacted_command_snapshot_count >= 0),
  CONSTRAINT location_retention_actions_offline_count_check
    CHECK (redacted_offline_event_payload_count >= 0),
  CONSTRAINT location_retention_actions_command_surface_count_check
    CHECK (
      (redacted_command_snapshot_count > 0)
      = (storage_surfaces @> '["attendance.command_executions.request_snapshot"]'::jsonb)
    ),
  CONSTRAINT location_retention_actions_offline_surface_count_check
    CHECK (
      (redacted_offline_event_payload_count > 0)
      = (storage_surfaces @> '["attendance.offline_event_inbox.event_payload"]'::jsonb)
    ),
  CONSTRAINT location_retention_actions_expiry_order_check
    CHECK (coordinates_purged_at >= coordinates_expire_at),
  CONSTRAINT location_retention_actions_retention_seconds_check
    CHECK (
      coordinate_retention_seconds IS NULL
      OR coordinate_retention_seconds BETWEEN 60 AND 315360000
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS location_retention_actions_evidence_action_uq
  ON attendance.location_retention_actions (
    company_id,
    location_evidence_id,
    action_type
  );

CREATE INDEX IF NOT EXISTS location_retention_actions_company_created_idx
  ON attendance.location_retention_actions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS location_retention_actions_event_idx
  ON attendance.location_retention_actions (company_id, attendance_event_id)
  WHERE attendance_event_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'location_retention_actions_immutable_trg'
      AND tgrelid = 'attendance.location_retention_actions'::regclass
  ) THEN
    CREATE TRIGGER location_retention_actions_immutable_trg
      BEFORE UPDATE OR DELETE ON attendance.location_retention_actions
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
