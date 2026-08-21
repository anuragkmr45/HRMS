CREATE TABLE IF NOT EXISTS attendance.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  state text NOT NULL DEFAULT 'open',
  locked_at timestamptz NULL,
  locked_by_user_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_payroll_periods_range_check
    CHECK (period_start <= period_end),
  CONSTRAINT attendance_payroll_periods_state_check
    CHECK (state IN ('open', 'locked')),
  CONSTRAINT attendance_payroll_periods_lock_shape_check
    CHECK (
      (state = 'open' AND locked_at IS NULL AND locked_by_user_id IS NULL)
      OR
      (state = 'locked' AND locked_at IS NOT NULL AND locked_by_user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_payroll_periods_company_range_uq
  ON attendance.payroll_periods (company_id, period_start, period_end);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_payroll_periods_no_overlap'
      AND conrelid = 'attendance.payroll_periods'::regclass
  ) THEN
    ALTER TABLE attendance.payroll_periods
      ADD CONSTRAINT attendance_payroll_periods_no_overlap
      EXCLUDE USING gist (
        company_id WITH =,
        daterange(period_start, period_end + 1, '[)') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS attendance_payroll_periods_company_state_idx
  ON attendance.payroll_periods (company_id, state, period_start, period_end);

CREATE TABLE IF NOT EXISTS attendance.payroll_period_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text NULL,
  resulting_version integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_payroll_period_actions_action_check
    CHECK (action IN ('created', 'locked', 'unlocked')),
  CONSTRAINT attendance_payroll_period_actions_unlock_reason_check
    CHECK (action <> 'unlocked' OR btrim(COALESCE(reason, '')) <> ''),
  CONSTRAINT attendance_payroll_period_actions_version_check
    CHECK (resulting_version > 0)
);

CREATE INDEX IF NOT EXISTS attendance_payroll_period_actions_period_idx
  ON attendance.payroll_period_actions (company_id, payroll_period_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS attendance.payroll_attendance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL,
  period_version integer NOT NULL,
  employee_user_id uuid NOT NULL,
  work_date date NOT NULL,
  status text NOT NULL,
  day_classification text NOT NULL,
  presence_state text NOT NULL,
  punctuality_state text NOT NULL,
  evidence_state text NOT NULL,
  approval_kind text NOT NULL,
  approval_state text NOT NULL,
  payroll_state text NOT NULL,
  first_check_in timestamptz NULL,
  last_check_out timestamptz NULL,
  work_minutes integer NOT NULL,
  break_minutes integer NOT NULL,
  late_minutes integer NOT NULL,
  early_out_minutes integer NOT NULL,
  work_seconds integer NOT NULL,
  break_seconds integer NOT NULL,
  scheduled_seconds integer NOT NULL,
  late_seconds integer NOT NULL,
  early_departure_seconds integer NOT NULL,
  work_mode text NULL,
  exception_type text NULL,
  regularization_status text NULL,
  source_daily_record_id uuid NOT NULL,
  source_daily_record_version integer NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_payroll_snapshots_version_check
    CHECK (period_version > 0),
  CONSTRAINT attendance_payroll_snapshots_seconds_check
    CHECK (
      work_seconds >= 0 AND break_seconds >= 0 AND scheduled_seconds >= 0
      AND late_seconds >= 0 AND early_departure_seconds >= 0
    ),
  CONSTRAINT attendance_payroll_snapshots_minutes_check
    CHECK (
      work_minutes >= 0 AND break_minutes >= 0
      AND late_minutes >= 0 AND early_out_minutes >= 0
    ),
  CONSTRAINT attendance_payroll_snapshots_source_version_check
    CHECK (source_daily_record_version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_payroll_snapshots_period_day_uq
  ON attendance.payroll_attendance_snapshots (
    company_id,
    payroll_period_id,
    period_version,
    employee_user_id,
    work_date
  );

CREATE INDEX IF NOT EXISTS attendance_payroll_snapshots_employee_date_idx
  ON attendance.payroll_attendance_snapshots (
    company_id,
    employee_user_id,
    work_date,
    payroll_period_id,
    period_version
  );

CREATE TABLE IF NOT EXISTS attendance.payroll_attendance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL,
  period_version integer NOT NULL,
  employee_user_id uuid NOT NULL,
  work_date date NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  regularization_request_id uuid NULL,
  finalized_snapshot_id uuid NULL,
  finalized_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  corrected_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  delta_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_payroll_adjustments_period_version_check
    CHECK (period_version > 0),
  CONSTRAINT attendance_payroll_adjustments_source_type_check
    CHECK (source_type IN ('attendance_regularization_item')),
  CONSTRAINT attendance_payroll_adjustments_status_check
    CHECK (status IN ('pending', 'applied', 'void')),
  CONSTRAINT attendance_payroll_adjustments_json_shape_check
    CHECK (
      jsonb_typeof(finalized_values) = 'object'
      AND jsonb_typeof(corrected_values) = 'object'
      AND jsonb_typeof(delta_values) = 'object'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_payroll_adjustments_source_uq
  ON attendance.payroll_attendance_adjustments (
    company_id,
    payroll_period_id,
    period_version,
    source_type,
    source_id
  );

CREATE INDEX IF NOT EXISTS attendance_payroll_adjustments_period_date_idx
  ON attendance.payroll_attendance_adjustments (
    company_id,
    payroll_period_id,
    period_version,
    work_date,
    employee_user_id
  );
