CREATE TABLE IF NOT EXISTS attendance.offline_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  registered_device_id uuid NOT NULL,
  device_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_event_id uuid NOT NULL,
  sequence bigint NOT NULL,
  event_hash text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attendance_event_id uuid NULL,
  sync_status text NOT NULL,
  verification_status text NOT NULL,
  reason_code text NULL,
  server_received_at timestamptz NOT NULL,
  processed_at timestamptz NULL,
  response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payroll_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_offline_event_inbox_sequence_positive_check
    CHECK (sequence > 0),
  CONSTRAINT attendance_offline_event_inbox_event_hash_check
    CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT attendance_offline_event_inbox_sync_status_check
    CHECK (sync_status IN ('accepted', 'replayed', 'conflict', 'rejected', 'deferred')),
  CONSTRAINT attendance_offline_event_inbox_verification_status_check
    CHECK (verification_status IN ('unverified', 'review_required', 'rejected')),
  CONSTRAINT attendance_offline_event_inbox_reason_code_check
    CHECK (
      reason_code IS NULL OR reason_code IN (
        'offline_sync.accepted_unverified',
        'offline_sync.replayed',
        'offline_sync.changed_body_conflict',
        'offline_sync.validation_failed',
        'offline_sync.processing_deferred',
        'offline_sync.sequence_gap',
        'offline_sync.sequence_out_of_order',
        'offline_sync.duplicate_sequence',
        'offline_sync.review_required'
      )
    ),
  CONSTRAINT attendance_offline_event_inbox_payroll_ineligible_check
    CHECK (payroll_eligible = false),
  CONSTRAINT attendance_offline_event_inbox_device_snapshot_object_check
    CHECK (jsonb_typeof(device_snapshot) = 'object'),
  CONSTRAINT attendance_offline_event_inbox_event_payload_object_check
    CHECK (jsonb_typeof(event_payload) = 'object'),
  CONSTRAINT attendance_offline_event_inbox_response_snapshot_object_check
    CHECK (jsonb_typeof(response_snapshot) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_offline_event_client_uq
  ON attendance.offline_event_inbox (
    company_id,
    actor_user_id,
    client_event_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS attendance_offline_event_device_sequence_uq
  ON attendance.offline_event_inbox (
    company_id,
    actor_user_id,
    registered_device_id,
    sequence
  );

CREATE INDEX IF NOT EXISTS attendance_offline_event_device_sequence_idx
  ON attendance.offline_event_inbox (
    company_id,
    actor_user_id,
    registered_device_id,
    sequence DESC
  );

CREATE INDEX IF NOT EXISTS attendance_offline_event_status_received_idx
  ON attendance.offline_event_inbox (
    company_id,
    sync_status,
    verification_status,
    server_received_at DESC
  );

CREATE INDEX IF NOT EXISTS attendance_offline_event_attendance_event_idx
  ON attendance.offline_event_inbox (
    company_id,
    attendance_event_id
  )
  WHERE attendance_event_id IS NOT NULL;
