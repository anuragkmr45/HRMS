import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { seedIds } from "../../../platform/data-store.js";
import { AttendanceMigrationDryRunService } from "../migration-dry-run-service.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;
const day = "2026-05-18";
const shiftInstanceId = "12111111-1111-4111-8111-111111111111";
const templateId = "12111111-1111-4111-8111-111111111112";
const templateVersionId = "12111111-1111-4111-8111-111111111113";
const expectedSessionId = "92999999-9999-4999-8999-999999999901";

describe("PostgreSQL attendance migration dry-run service", () => {
  let app: TestApp;
  let companyId: string;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    companyId = await seedCompanyId(app);
    await insertEmployeeCommandState(app, companyId);
  }, 30_000);

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("reports match when stored legacy output agrees with candidate projection", async () => {
    await insertCompleteCandidateFixture(app, companyId);
    await insertMatchingProjection(app, companyId);

    const result = await service().run(baseInput());

    expect(result.summary.status).toBe("match");
    expect(result.per_day).toHaveLength(1);
    expect(result.per_day[0]).toMatchObject({
      work_date: day,
      status: "match",
    });
    expect(result.per_day[0]?.differences.changed.daily_records).toEqual([]);
    expect(result.source_counts).toMatchObject({
      legacy_punch_events: 4,
      active_legacy_punch_events: 4,
      soft_deleted_legacy_punch_events: 0,
      candidate_active_punch_facts: 4,
    });
  });

  it("classifies stored legacy output differences without failing the run", async () => {
    await insertCompleteCandidateFixture(app, companyId);
    await insertMatchingProjection(app, companyId, { workSeconds: 60 });

    const result = await service().run(baseInput());

    expect(result.summary.status).toBe("difference");
    expect(result.per_day[0]?.status).toBe("difference");
    expect(result.per_day[0]?.differences.changed.daily_records[0]).toMatchObject({
      key: day,
      existing: expect.objectContaining({ work_seconds: 60 }),
      expected: expect.objectContaining({ work_seconds: 30_600 }),
    });
  });

  it("retains soft-deleted punch evidence without using it as an active candidate fact", async () => {
    await insertCompleteCandidateFixture(app, companyId);
    await insertMatchingProjection(app, companyId);
    await insertSoftDeletedPunch(app, companyId);

    const result = await service().run(baseInput());

    expect(result.summary.status).toBe("match");
    expect(result.source_counts).toMatchObject({
      legacy_punch_events: 5,
      active_legacy_punch_events: 4,
      soft_deleted_legacy_punch_events: 1,
      candidate_active_punch_facts: 4,
    });
    expect(result.soft_deleted_legacy_punch_evidence).toEqual([
      expect.objectContaining({
        event_type: "check_in",
        occurred_at: "2026-05-18T08:00:00.000Z",
        deleted_at: "2026-05-18T08:05:00.000Z",
      }),
    ]);
    expect(result.per_day[0]?.diagnostics).toContainEqual(expect.objectContaining({
      code: "soft_deleted_legacy_punch_present",
    }));
  });

  it("does not mutate authoritative attendance state or projection run audit rows", async () => {
    await insertCompleteCandidateFixture(app, companyId);
    await insertMatchingProjection(app, companyId);
    const before = await authoritativeCounts(app, companyId);

    await service().run(baseInput());

    await expect(authoritativeCounts(app, companyId)).resolves.toEqual(before);
  });

  it("does not consume punch rows from another company", async () => {
    await insertCompleteCandidateFixture(app, companyId);
    await insertMatchingProjection(app, companyId);
    await insertOtherCompanyPunch(app);

    const result = await service().run(baseInput());

    expect(result.summary.status).toBe("match");
    expect(result.source_counts.legacy_punch_events).toBe(4);
    expect(result.source_counts.candidate_active_punch_facts).toBe(4);
  });

  it("reports blockers from existing replay validation when historical shift context is missing", async () => {
    await insertCompleteCandidateFixture(app, companyId);
    await insertMatchingProjection(app, companyId);
    await app.store.pgPool!.query(
      `UPDATE attendance.shift_instances
       SET deleted_at = '2026-05-20T00:00:00.000Z'
       WHERE id = $1`,
      [shiftInstanceId],
    );

    const result = await service().run(baseInput());

    expect(result.summary.status).toBe("blocked");
    expect(result.per_day[0]?.status).toBe("blocked");
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "missing_shift_instance",
      scope: `daily_records:${day}`,
    }));
  });

  function service() {
    return new AttendanceMigrationDryRunService(app.store.pgPool!);
  }

  function baseInput() {
    return {
      companyId,
      employeeUserId: seedIds.employee1,
      dateFrom: day,
      dateTo: day,
    };
  }
});

async function seedCompanyId(app: TestApp): Promise<string> {
  const row = (
    await app.store.pgPool!.query<{ company_id: string }>(
      `SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1`,
      [seedIds.admin],
    )
  ).rows[0];
  if (!row?.company_id) throw new Error("Seed company is missing.");
  return row.company_id;
}

async function insertEmployeeCommandState(
  app: TestApp,
  companyId: string,
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.employee_command_states (
       company_id, employee_user_id, state, current_session_id, version,
       created_at, updated_at
     )
     VALUES ($1,$2,'completed',$3,1,
       '2026-05-01T00:00:00.000Z','2026-05-01T00:00:00.000Z')
     ON CONFLICT (company_id, employee_user_id) DO NOTHING`,
    [companyId, seedIds.employee1, expectedSessionId],
  );
}

async function insertCompleteCandidateFixture(
  app: TestApp,
  companyId: string,
): Promise<void> {
  await insertShiftInstance(app, companyId);
  await insertAcceptedPunch(app, companyId, {
    ordinal: 1,
    eventType: "check_in",
    occurredAt: "2026-05-18T09:00:00.000Z",
    previousState: "not_checked_in",
    nextState: "working",
  });
  await insertAcceptedPunch(app, companyId, {
    ordinal: 2,
    eventType: "break_start",
    occurredAt: "2026-05-18T13:00:00.000Z",
    previousState: "working",
    nextState: "on_break",
  });
  await insertAcceptedPunch(app, companyId, {
    ordinal: 3,
    eventType: "break_end",
    occurredAt: "2026-05-18T13:30:00.000Z",
    previousState: "on_break",
    nextState: "working",
  });
  await insertAcceptedPunch(app, companyId, {
    ordinal: 4,
    eventType: "check_out",
    occurredAt: "2026-05-18T18:00:00.000Z",
    previousState: "working",
    nextState: "completed",
  });
}

async function insertShiftInstance(app: TestApp, companyId: string): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.shift_templates (
       id, company_id, code, name, description, status, is_company_default,
       created_at, updated_at, deleted_at, version
     )
     VALUES ($1,$2,'migration-dry-run-test','Migration Dry Run Test',NULL,
       'active',false,'2026-05-01T00:00:00.000Z',
       '2026-05-01T00:00:00.000Z',NULL,1)
     ON CONFLICT (id) DO NOTHING`,
    [templateId, companyId],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.shift_template_versions (
       id, company_id, template_id, version_number, effective_from,
       effective_until, local_start_time, local_end_time, end_day_offset,
       timezone_strategy, fixed_timezone,
       eligibility_open_before_start_minutes,
       eligibility_close_after_end_minutes, created_by_user_id, created_at
     )
     VALUES ($1,$2,$3,1,'2026-05-01',NULL,'09:00','18:00',0,
       'fixed','UTC',540,720,$4,'2026-05-01T00:00:00.000Z')
     ON CONFLICT (id) DO NOTHING`,
    [templateVersionId, companyId, templateId, seedIds.admin],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.shift_instances (
       id, company_id, employee_user_id, work_date, template_id,
       template_version_id, assignment_id, resolved_timezone,
       scheduled_start_at, scheduled_end_at, eligibility_start_at,
       eligibility_end_at, generation_source, generated_at, deleted_at
    )
     VALUES ($1,$2,$3,$4::date,$5,$6,NULL,'UTC',
       '2026-05-18T09:00:00.000Z','2026-05-18T18:00:00.000Z',
       '2026-05-18T00:00:00.000Z','2026-05-19T06:00:00.000Z',
       'assignment','2026-05-01T00:00:00.000Z',NULL)`,
    [shiftInstanceId, companyId, seedIds.employee1, day, templateId, templateVersionId],
  );
}

async function insertAcceptedPunch(
  app: TestApp,
  companyId: string,
  input: {
    ordinal: number;
    eventType: "check_in" | "break_start" | "break_end" | "check_out";
    occurredAt: string;
    previousState: string;
    nextState: string;
  },
): Promise<void> {
  const ids = idsFor(input.ordinal);
  await app.store.pgPool!.query(
    `INSERT INTO attendance.command_executions (
       id, company_id, actor_user_id, employee_user_id, idempotency_key,
       request_hash, command_type, command_origin, occurred_at, status,
       session_id, punch_event_id, request_snapshot, response_snapshot,
       response_hash, response_status, completed_at, created_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,'employee_manual_now',$8,'completed',
       $11,$9,'{}'::jsonb,'{}'::jsonb,$10,200,$8,$8)`,
    [
      ids.command,
      companyId,
      seedIds.employee1,
      seedIds.employee1,
      `migration-dry-run-${input.ordinal}`,
      "a".repeat(64),
      input.eventType,
      input.occurredAt,
      ids.punch,
      "b".repeat(64),
      expectedSessionId,
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.command_decisions (
       id, command_execution_id, company_id, employee_user_id, outcome,
       reason_code, reason_detail, previous_state, next_state,
       policy_snapshot, evidence_snapshot, created_at
     )
     VALUES ($1,$2,$3,$4,'allowed',NULL,NULL,$5,$6,$7::jsonb,$8::jsonb,$9)`,
    [
      ids.commandDecision,
      ids.command,
      companyId,
      seedIds.employee1,
      input.previousState,
      input.nextState,
      JSON.stringify(testPolicySnapshot()),
      JSON.stringify({ attendance_event_id: ids.attendanceEvent }),
      input.occurredAt,
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.attendance_events (
       id, company_id, employee_user_id, actor_user_id, command_execution_id,
       event_type, source, occurred_at, received_at, schema_version, payload,
       payload_hash, created_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,'admin',$7,$7,1,'{}'::jsonb,$8,$7)`,
    [
      ids.attendanceEvent,
      companyId,
      seedIds.employee1,
      seedIds.employee1,
      ids.command,
      input.eventType,
      input.occurredAt,
      "c".repeat(64),
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.attendance_decisions (
       id, company_id, employee_user_id, attendance_event_id,
       command_execution_id, decision_type, outcome, policy_key,
       policy_version, evaluator_version, evaluated_at, evidence_digest,
       policy_snapshot, evaluation_context, created_at
     )
     VALUES ($1,$2,$3,$4,$5,'manual_attendance','passed','attendance','test-v1',
       'attendance-geo-v2',$6,$7,$8::jsonb,$9::jsonb,$6)`,
    [
      ids.auditDecision,
      companyId,
      seedIds.employee1,
      ids.attendanceEvent,
      ids.command,
      input.occurredAt,
      "d".repeat(64),
      JSON.stringify({
        policyVersionId: "22222222-2222-4222-8222-222222222222",
        policyVersion: "test-v1",
      }),
      JSON.stringify({
        geo_policy: {
          allowed: true,
          evaluator_version: "attendance-geo-v2",
          geofence_id: null,
          geofence_version_id: null,
        },
      }),
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.punch_events (
       id, company_id, employee_user_id, actor_user_id, event_type,
       occurred_at, work_mode, source, origin, regularization_request_id,
       command_execution_id, session_id, decision_id, metadata, created_at,
       deleted_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,'office','admin','employee_manual_now',NULL,
       $7,$9,$8,'{}'::jsonb,$6,NULL)`,
    [
      ids.punch,
      companyId,
      seedIds.employee1,
      seedIds.employee1,
      input.eventType,
      input.occurredAt,
      ids.command,
      ids.commandDecision,
      expectedSessionId,
    ],
  );
}

async function insertMatchingProjection(
  app: TestApp,
  companyId: string,
  input: { workSeconds?: number } = {},
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.sessions (
       id, company_id, employee_user_id, work_date, status, checked_in_at,
       closed_at, last_transition_at, work_mode, source, metadata,
       version, created_at, updated_at, deleted_at
     )
     VALUES ($1,$2,$3,$4::date,'working','2026-05-18T09:00:00.000Z',
       NULL,'2026-05-18T13:30:00.000Z',
       'office','admin','{}'::jsonb,1,'2026-05-18T09:00:00.000Z',
       '2026-05-18T13:30:00.000Z',NULL)`,
    [expectedSessionId, companyId, seedIds.employee1, day],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.break_segments (
       company_id, session_id, started_at, ended_at, created_at, updated_at
     )
     VALUES ($1,$2,'2026-05-18T13:00:00.000Z',
       '2026-05-18T13:30:00.000Z','2026-05-18T13:00:00.000Z',
       '2026-05-18T13:30:00.000Z')`,
    [companyId, expectedSessionId],
  );
  await app.store.pgPool!.query(
    `UPDATE attendance.sessions
     SET status = 'closed',
         closed_at = '2026-05-18T18:00:00.000Z',
         last_transition_at = '2026-05-18T18:00:00.000Z',
         updated_at = '2026-05-18T18:00:00.000Z'
     WHERE id = $1
       AND company_id = $2`,
    [expectedSessionId, companyId],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.daily_records (
       company_id, employee_user_id, work_date, status, day_classification,
       presence_state, punctuality_state, evidence_state, approval_kind,
       approval_state, payroll_state, first_check_in, last_check_out,
       work_minutes, break_minutes, late_minutes, early_out_minutes,
       work_seconds, break_seconds, scheduled_seconds, late_seconds,
       early_departure_seconds, work_mode, note, exception_type,
       regularization_status, version, created_at, updated_at, deleted_at
     )
     VALUES ($1,$2,$3::date,'present','working_day','present','on_time',
       'complete','none','not_required','unprocessed',
       '2026-05-18T09:00:00.000Z','2026-05-18T18:00:00.000Z',
       $4,30,0,0,$5,1800,32400,0,0,'office',NULL,NULL,NULL,1,
       '2026-05-18T09:00:00.000Z','2026-05-18T18:00:00.000Z',NULL)`,
    [
      companyId,
      seedIds.employee1,
      day,
      Math.floor((input.workSeconds ?? 30_600) / 60),
      input.workSeconds ?? 30_600,
    ],
  );
}

async function insertSoftDeletedPunch(app: TestApp, companyId: string): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.punch_events (
       id, company_id, employee_user_id, actor_user_id, event_type,
       occurred_at, work_mode, source, origin, regularization_request_id,
       metadata, created_at, deleted_at
     )
     VALUES ($1,$2,$3,$3,'check_in','2026-05-18T08:00:00.000Z',
       'office','web','employee_manual_now',NULL,$4::jsonb,
       '2026-05-18T08:00:00.000Z','2026-05-18T08:05:00.000Z')`,
    [
      "12888888-8888-4888-8888-000000000099",
      companyId,
      seedIds.employee1,
      JSON.stringify({ reason: "legacy soft delete fixture" }),
    ],
  );
}

async function insertOtherCompanyPunch(app: TestApp): Promise<void> {
  const otherCompanyId = "12000000-0000-4000-8000-000000000001";
  await app.store.pgPool!.query(
    `INSERT INTO platform.company_profiles (
       id, company_name, company_slug, timezone, locale,
       fiscal_year_start_month, status, bootstrap_completed_at,
       currency, working_week, work_hours_per_day, logo_label
     )
     VALUES ($1,'Other Co','migration-dry-run-other-co','UTC','en-IN',
       4,'active','2026-05-01T00:00:00.000Z',
       'INR','Mon-Fri',8,'OC')
     ON CONFLICT (id) DO NOTHING`,
    [otherCompanyId],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.punch_events (
       company_id, employee_user_id, actor_user_id, event_type, occurred_at,
       work_mode, source, origin, metadata, created_at, deleted_at
     )
     VALUES ($1,$2,$2,'check_in','2026-05-18T07:00:00.000Z',
       'office','web','employee_manual_now','{}'::jsonb,
       '2026-05-18T07:00:00.000Z',NULL)`,
    [otherCompanyId, seedIds.employee1],
  );
}

async function authoritativeCounts(app: TestApp, companyId: string) {
  return (
    await app.store.pgPool!.query<Record<string, string>>(
      `SELECT
       (SELECT count(*) FROM attendance.sessions WHERE company_id = $1) AS sessions,
       (SELECT count(*) FROM attendance.break_segments WHERE company_id = $1) AS break_segments,
       (SELECT count(*) FROM attendance.daily_records WHERE company_id = $1) AS daily_records,
       (SELECT count(*) FROM attendance.attendance_events WHERE company_id = $1) AS attendance_events,
       (SELECT count(*) FROM attendance.attendance_decisions WHERE company_id = $1) AS attendance_decisions,
       (SELECT count(*) FROM attendance.projection_rebuild_runs WHERE company_id = $1) AS projection_rebuild_runs,
       (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type = 'attendance') AS outbox_events,
       (SELECT count(*) FROM attendance.employee_command_states WHERE company_id = $1) AS command_states`,
      [companyId],
    )
  ).rows[0];
}

function testPolicySnapshot(): Record<string, unknown> {
  return {
    policyVersionId: "22222222-2222-4222-8222-222222222222",
    policyVersion: "test-v1",
    graceMinutes: 15,
    workingWeek: "Mon-Fri",
  };
}

function idsFor(ordinal: number) {
  const suffix = String(ordinal).padStart(12, "0");
  return {
    command: `13333333-3333-4333-8333-${suffix}`,
    commandDecision: `14444444-4444-4444-8444-${suffix}`,
    attendanceEvent: `15555555-5555-4555-8555-${suffix}`,
    auditDecision: `16666666-6666-4666-8666-${suffix}`,
    punch: `18888888-8888-4888-8888-${suffix}`,
  };
}
