CREATE TABLE IF NOT EXISTS attendance.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  work_date date NOT NULL,

  status text NOT NULL
    CHECK (status IN ('working', 'on_break', 'closed')),

  checked_in_at timestamptz NOT NULL,
  closed_at timestamptz NULL,
  active_break_started_at timestamptz NULL,
  -- This is deliberately separate from updated_at: client supplied event time
  -- chronology is a domain invariant, not an implementation timestamp.
  last_transition_at timestamptz NOT NULL,

  work_mode text NOT NULL
    CHECK (work_mode IN ('office', 'remote', 'wfh', 'field')),

  source text NOT NULL
    CHECK (source IN ('web', 'mobile', 'kiosk', 'admin')),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,

  CHECK (
    (
      status = 'working'
      AND closed_at IS NULL
      AND active_break_started_at IS NULL
    )
    OR
    (
      status = 'on_break'
      AND closed_at IS NULL
      AND active_break_started_at IS NOT NULL
    )
    OR
    (
      status = 'closed'
      AND closed_at IS NOT NULL
      AND active_break_started_at IS NULL
    )
  )
);

ALTER TABLE attendance.sessions
  ADD COLUMN IF NOT EXISTS last_transition_at timestamptz;

UPDATE attendance.sessions
SET last_transition_at = COALESCE(closed_at, active_break_started_at, checked_in_at)
WHERE last_transition_at IS NULL;

ALTER TABLE attendance.sessions
  ALTER COLUMN last_transition_at SET NOT NULL;

-- Final database invariant: an employee cannot have multiple open sessions
-- in the same company.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_single_open_idx
  ON attendance.sessions (company_id, employee_user_id)
  WHERE closed_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_sessions_employee_history_idx
  ON attendance.sessions (
    company_id,
    employee_user_id,
    checked_in_at DESC
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_sessions_work_date_idx
  ON attendance.sessions (
    company_id,
    work_date,
    employee_user_id
  )
  WHERE deleted_at IS NULL;


-- Stable aggregate row used for SELECT ... FOR UPDATE.
-- This row exists even before an employee's first attendance session.
CREATE TABLE IF NOT EXISTS attendance.employee_command_states (
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,

  state text NOT NULL DEFAULT 'not_checked_in'
    CHECK (state IN ('not_checked_in', 'working', 'on_break')),

  current_session_id uuid NULL,

  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (company_id, employee_user_id),

  CHECK (
    (state = 'not_checked_in' AND current_session_id IS NULL)
    OR
    (state IN ('working', 'on_break') AND current_session_id IS NOT NULL)
  )
);


CREATE TABLE IF NOT EXISTS attendance.command_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,

  idempotency_key text NOT NULL,
  request_hash text NOT NULL,

  command_type text NOT NULL
    CHECK (
      command_type IN (
        'check_in',
        'break_start',
        'break_end',
        'check_out'
      )
    ),

  occurred_at timestamptz NOT NULL,

  status text NOT NULL
    CHECK (
      status IN (
        'received',
        'allowed',
        'denied',
        'completed'
      )
    ),

  session_id uuid NULL,
  punch_event_id uuid NULL,

  request_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_snapshot jsonb NULL,

  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CHECK (length(request_hash) = 64),

  UNIQUE (company_id, actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS attendance_commands_employee_created_idx
  ON attendance.command_executions (
    company_id,
    employee_user_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS attendance_commands_status_created_idx
  ON attendance.command_executions (
    company_id,
    status,
    created_at DESC
  );


-- Immutable outcome of command evaluation.
CREATE TABLE IF NOT EXISTS attendance.command_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  command_execution_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,

  outcome text NOT NULL
    CHECK (outcome IN ('allowed', 'denied')),

  reason_code text NULL,
  reason_detail text NULL,

  previous_state text NOT NULL
    CHECK (
      previous_state IN (
        'not_checked_in',
        'working',
        'on_break'
      )
    ),

  next_state text NOT NULL
    CHECK (
      next_state IN (
        'not_checked_in',
        'working',
        'on_break'
      )
    ),

  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    (outcome = 'allowed' AND reason_code IS NULL)
    OR
    (outcome = 'denied' AND reason_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS attendance_decisions_employee_created_idx
  ON attendance.command_decisions (
    company_id,
    employee_user_id,
    created_at DESC
  );


-- Add relational traceability to immutable punch events.
-- Existing legacy punches remain valid with null command/session/decision IDs.
ALTER TABLE attendance.punch_events
  ADD COLUMN IF NOT EXISTS command_execution_id uuid NULL;

ALTER TABLE attendance.punch_events
  ADD COLUMN IF NOT EXISTS session_id uuid NULL;

ALTER TABLE attendance.punch_events
  ADD COLUMN IF NOT EXISTS decision_id uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_punch_command_unique_idx
  ON attendance.punch_events (command_execution_id)
  WHERE command_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_punch_session_occurred_idx
  ON attendance.punch_events (
    company_id,
    session_id,
    occurred_at
  )
  WHERE deleted_at IS NULL AND session_id IS NOT NULL;
