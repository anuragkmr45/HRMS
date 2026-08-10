CREATE TABLE IF NOT EXISTS attendance.projection_rebuild_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,

  mode text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  status text NOT NULL,

  source_record_count integer NOT NULL DEFAULT 0,
  source_fingerprint text NOT NULL,
  difference_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  version_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  rows_written jsonb NOT NULL DEFAULT '{}'::jsonb,

  failure_code text NULL,
  sanitized_failure_details text NULL,

  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT projection_rebuild_runs_mode_check
    CHECK (mode IN ('reconcile', 'rebuild')),
  CONSTRAINT projection_rebuild_runs_status_check
    CHECK (status IN ('started', 'succeeded', 'failed')),
  CONSTRAINT projection_rebuild_runs_date_range_check
    CHECK (date_from <= date_to),
  CONSTRAINT projection_rebuild_runs_source_count_check
    CHECK (source_record_count >= 0),
  CONSTRAINT projection_rebuild_runs_source_fingerprint_check
    CHECK (source_fingerprint ~ '^[0-9a-f]{64}$' OR source_fingerprint = 'pending'),
  CONSTRAINT projection_rebuild_runs_failure_shape_check
    CHECK (
      (status = 'failed' AND failure_code IS NOT NULL)
      OR
      (status <> 'failed' AND failure_code IS NULL AND sanitized_failure_details IS NULL)
    ),
  CONSTRAINT projection_rebuild_runs_completed_shape_check
    CHECK (
      (status = 'started' AND completed_at IS NULL)
      OR
      (status <> 'started' AND completed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS projection_rebuild_runs_employee_range_idx
  ON attendance.projection_rebuild_runs (
    company_id,
    employee_user_id,
    date_from,
    date_to,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS projection_rebuild_runs_status_created_idx
  ON attendance.projection_rebuild_runs (
    company_id,
    status,
    created_at DESC
  );

