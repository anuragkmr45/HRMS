import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { seedIds } from "../../../platform/data-store.js";
import {
  AttendanceProjectionRebuildService,
  AttendanceProjectionReplayError,
} from "../projection-rebuild-service.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;
const day = "2026-05-18";
const nextDay = "2026-05-19";
const shiftInstanceId = "11111111-1111-4111-8111-111111111111";
const nextShiftInstanceId = "11111111-1111-4111-8111-111111111114";
const templateId = "11111111-1111-4111-8111-111111111112";
const templateVersionId = "11111111-1111-4111-8111-111111111113";
const expectedSessionId = "99999999-9999-4999-8999-999999999901";

describe("PostgreSQL attendance projection rebuild service", () => {
  let app: TestApp;
  let companyId: string;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    companyId = await seedCompanyId(app);
    await insertEmployeeCommandState(app, companyId);
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
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("detects corrupted projections in reconcile mode without mutation", async () => {
    await insertCorruptedProjection(app, companyId);
    const before = await projectionCounts(app, companyId);

    const result = await service().run(baseInput("reconcile"));

    expect(result.status).toBe("succeeded");
    expect(result.safe_to_rebuild).toBe(true);
    expect(result.effective_source_record_count).toBe(4);
    expect(result.differences.missing.break_segments).toHaveLength(1);
    expect(result.differences.changed.sessions).toHaveLength(1);
    expect(result.differences.changed.daily_records).toHaveLength(1);
    await expect(projectionCounts(app, companyId)).resolves.toEqual(before);
  });

  it("atomically repairs corrupted projections and is idempotent on repeat", async () => {
    await insertCorruptedProjection(app, companyId);

    const first = await service().run(baseInput("rebuild"));
    const afterFirst = await projectionSnapshot(app, companyId);
    const second = await service().run(baseInput("rebuild"));
    const afterSecond = await projectionSnapshot(app, companyId);

    expect(first.rows_written.sessions_inserted).toBe(1);
    expect(first.rows_written.break_segments_inserted).toBe(1);
    expect(afterFirst.session_count).toBe(1);
    expect(afterFirst.break_count).toBe(1);
    expect(afterFirst.work_seconds).toBe(30_600);
    expect(afterFirst.break_seconds).toBe(1_800);
    expect(second.status).toBe("succeeded");
    expect(afterSecond).toEqual(afterFirst);
  });

  it("leaves immutable facts unchanged across rebuild", async () => {
    await insertCorruptedProjection(app, companyId);
    const before = await immutableCounts(app, companyId);

    await service().run(baseInput("rebuild"));

    await expect(immutableCounts(app, companyId)).resolves.toEqual(before);
  });

  it("fails closed and records a sanitized failed run when evaluator metadata is unsupported", async () => {
    await insertAcceptedPunch(app, companyId, {
      ordinal: 5,
      eventType: "check_in",
      occurredAt: "2026-05-18T08:00:00.000Z",
      previousState: "not_checked_in",
      nextState: "working",
      evaluatorVersion: "attendance-geo-v999",
    });

    await expect(service().run(baseInput("rebuild"))).rejects.toBeInstanceOf(
      AttendanceProjectionReplayError,
    );
    const failed = await app.store.pgPool!.query<{
      status: string;
      failure_code: string;
    }>(
      `SELECT status, failure_code
       FROM attendance.projection_rebuild_runs
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [companyId],
    );
    expect(failed.rows[0]).toMatchObject({
      status: "failed",
      failure_code: "unsupported_evaluator_version",
    });
  });

  it("blocks rebuild when required historical shift context is missing", async () => {
    await app.store.pgPool!.query(
      `UPDATE attendance.shift_instances
       SET deleted_at = '2026-05-20T00:00:00.000Z'
       WHERE id = $1`,
      [shiftInstanceId],
    );

    const reconcile = await service().run(baseInput("reconcile"));
    expect(reconcile.safe_to_rebuild).toBe(false);
    expect(reconcile.differences.blocked[0]?.code).toBe(
      "missing_shift_instance",
    );
    await expect(service().run(baseInput("rebuild"))).rejects.toBeInstanceOf(
      AttendanceProjectionReplayError,
    );
  });

  it("excludes replaced and voided punch facts through regularization applications", async () => {
    await insertAcceptedPunch(app, companyId, {
      ordinal: 5,
      eventType: "check_in",
      occurredAt: "2026-05-18T08:30:00.000Z",
      previousState: "not_checked_in",
      nextState: "working",
    });
    await insertRegularizationApplication(app, companyId, {
      operation: "void",
      targetOrdinal: 5,
      applicationId: "77777777-7777-4777-8777-777777777701",
    });

    const result = await service().run(baseInput("reconcile"));

    expect(result.effective_source_record_count).toBe(4);
    expect(result.differences.blocked).toEqual([]);
  });

  it("fails closed without creating command-state rows during rebuild locking", async () => {
    await app.store.pgPool!.query(
      `DELETE FROM attendance.employee_command_states
       WHERE company_id = $1 AND employee_user_id = $2`,
      [companyId, seedIds.employee1],
    );

    await expect(service().run(baseInput("rebuild"))).rejects.toMatchObject({
      replayCode: "employee_command_state_missing",
    });
    const stateRows = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) FROM attendance.employee_command_states
       WHERE company_id = $1 AND employee_user_id = $2`,
      [companyId, seedIds.employee1],
    );
    expect(Number(stateRows.rows[0]?.count ?? 0)).toBe(0);
  });

  it("uses historical working week from policy snapshots after company config changes", async () => {
    await app.store.pgPool!.query(
      `UPDATE platform.company_profiles SET working_week = 'Sun' WHERE id = $1`,
      [companyId],
    );

    const result = await service().run(baseInput("reconcile"));

    expect(result.safe_to_rebuild).toBe(true);
    expect(result.differences.blocked).toEqual([]);
    expect(
      result.differences.missing.daily_records[0]?.expected?.day_classification,
    ).toBe("working_day");
  });

  it("continues reconciling unaffected dates when another date is blocked", async () => {
    await insertShiftInstance(app, companyId, {
      id: nextShiftInstanceId,
      workDate: nextDay,
      scheduledStartAt: "2026-05-19T09:00:00.000Z",
      scheduledEndAt: "2026-05-19T18:00:00.000Z",
      eligibilityStartAt: "2026-05-19T00:00:00.000Z",
      eligibilityEndAt: "2026-05-20T06:00:00.000Z",
    });
    await insertAcceptedPunch(app, companyId, {
      ordinal: 6,
      eventType: "check_in",
      occurredAt: "2026-05-19T09:00:00.000Z",
      previousState: "not_checked_in",
      nextState: "working",
      sessionId: "99999999-9999-4999-8999-999999999906",
    });
    await insertAcceptedPunch(app, companyId, {
      ordinal: 7,
      eventType: "check_out",
      occurredAt: "2026-05-19T18:00:00.000Z",
      previousState: "working",
      nextState: "completed",
      sessionId: "99999999-9999-4999-8999-999999999906",
    });
    await app.store.pgPool!.query(
      `UPDATE attendance.shift_instances SET deleted_at = '2026-05-21T00:00:00.000Z' WHERE id = $1`,
      [nextShiftInstanceId],
    );
    const before = await projectionCounts(app, companyId);

    const result = await service().run({
      ...baseInput("reconcile"),
      dateTo: nextDay,
    });

    expect(result.safe_to_rebuild).toBe(false);
    expect(result.differences.blocked.map((item) => item.scope)).toContain(
      `daily_records:${nextDay}`,
    );
    expect(
      result.differences.missing.daily_records.some((item) => item.key === day),
    ).toBe(true);
    expect(
      result.differences.missing.daily_records.some(
        (item) => item.key === nextDay,
      ),
    ).toBe(false);
    await expect(projectionCounts(app, companyId)).resolves.toEqual(before);
  });

  it("replays system auto-punchout checkout as closing an open break and session", async () => {
    await deletePunchOrdinals(app, [3, 4]);
    await insertSystemAutoPunchOut(app, companyId, {
      ordinal: 5,
      occurredAt: "2026-05-18T18:00:00.000Z",
    });

    const result = await service().run(baseInput("rebuild"));
    const projection = await app.store.pgPool!.query<{
      session_closed_at: Date | null;
      break_ended_at: Date | null;
      blocked: unknown;
    }>(
      `SELECT
         (SELECT closed_at
          FROM attendance.sessions
          WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date) AS session_closed_at,
         (SELECT ended_at
          FROM attendance.break_segments
          WHERE company_id = $1) AS break_ended_at,
         $4::jsonb AS blocked`,
      [
        companyId,
        seedIds.employee1,
        day,
        JSON.stringify(result.differences.blocked),
      ],
    );

    expect(
      result.differences.blocked.filter(
        (item) => item.code === "ambiguous_transition",
      ),
    ).toEqual([]);
    expect(projection.rows[0]?.session_closed_at?.toISOString()).toBe(
      "2026-05-18T18:00:00.000Z",
    );
    expect(projection.rows[0]?.break_ended_at?.toISOString()).toBe(
      "2026-05-18T18:00:00.000Z",
    );
  });

  it("does not let ordinary checkout close an open replay break implicitly", async () => {
    await deletePunchOrdinals(app, [3]);

    const result = await service().run(baseInput("reconcile"));

    expect(result.differences.blocked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ambiguous_transition",
          scope: `punch_events:${idsFor(4).punch}`,
        }),
      ]),
    );
  });

  function service() {
    return new AttendanceProjectionRebuildService(app.store.pgPool!);
  }

  function baseInput(mode: "reconcile" | "rebuild") {
    return {
      companyId,
      employeeUserId: seedIds.employee1,
      requestedByUserId: seedIds.admin,
      dateFrom: day,
      dateTo: day,
      mode,
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

async function insertShiftInstance(
  app: TestApp,
  companyId: string,
  input: {
    id?: string;
    workDate?: string;
    scheduledStartAt?: string;
    scheduledEndAt?: string;
    eligibilityStartAt?: string;
    eligibilityEndAt?: string;
  } = {},
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.shift_templates (
       id, company_id, code, name, description, status, is_company_default,
       created_at, updated_at, deleted_at, version
     )
     VALUES ($1,$2,'projection-rebuild-test','Projection Rebuild Test',NULL,
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
     VALUES ($1,$2,$3,$4::date,$5,$6,NULL,'UTC',$7,$8,$9,$10,'assignment','2026-05-01T00:00:00.000Z',NULL)`,
    [
      input.id ?? shiftInstanceId,
      companyId,
      seedIds.employee1,
      input.workDate ?? day,
      templateId,
      templateVersionId,
      input.scheduledStartAt ?? "2026-05-18T09:00:00.000Z",
      input.scheduledEndAt ?? "2026-05-18T18:00:00.000Z",
      input.eligibilityStartAt ?? "2026-05-18T00:00:00.000Z",
      input.eligibilityEndAt ?? "2026-05-19T06:00:00.000Z",
    ],
  );
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
     VALUES ($1,$2,'not_checked_in',NULL,1,
       '2026-05-01T00:00:00.000Z','2026-05-01T00:00:00.000Z')
     ON CONFLICT (company_id, employee_user_id) DO NOTHING`,
    [companyId, seedIds.employee1],
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
    evaluatorVersion?: string;
    sessionId?: string;
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
      `projection-rebuild-${input.ordinal}`,
      "a".repeat(64),
      input.eventType,
      input.occurredAt,
      ids.punch,
      "b".repeat(64),
      input.sessionId ?? expectedSessionId,
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
       $10,$6,$7,$8::jsonb,$9::jsonb,$6)`,
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
          evaluator_version: input.evaluatorVersion ?? "attendance-geo-v2",
          geofence_id: null,
          geofence_version_id: null,
        },
      }),
      input.evaluatorVersion ?? "attendance-geo-v2",
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
      input.sessionId ?? expectedSessionId,
    ],
  );
}

async function insertSystemAutoPunchOut(
  app: TestApp,
  companyId: string,
  input: { ordinal: number; occurredAt: string },
): Promise<void> {
  const ids = idsFor(input.ordinal);
  await app.store.pgPool!.query(
    `INSERT INTO attendance.punch_events (
       id, company_id, employee_user_id, actor_user_id, event_type,
       occurred_at, work_mode, source, origin, regularization_request_id,
       command_execution_id, session_id, decision_id, metadata, created_at,
       deleted_at
     )
     VALUES ($1,$2,$3,$4,'check_out',$5,'office','admin','system',NULL,
       NULL,$6,NULL,$7::jsonb,$5,NULL)`,
    [
      ids.punch,
      companyId,
      seedIds.employee1,
      seedIds.employee1,
      input.occurredAt,
      expectedSessionId,
      JSON.stringify({
        auto_punch_out: true,
        auto_punch_out_time: "18:00",
        auto_punch_out_trigger: "worker",
      }),
    ],
  );
}

async function deletePunchOrdinals(
  app: TestApp,
  ordinals: number[],
): Promise<void> {
  const ids = ordinals.map(idsFor);

  await app.store.pgPool!.query(
    `DELETE FROM attendance.punch_events WHERE id = ANY($1::uuid[])`,
    [ids.map((item) => item.punch)],
  );
}

function testPolicySnapshot(): Record<string, unknown> {
  return {
    policyVersionId: "22222222-2222-4222-8222-222222222222",
    policyVersion: "test-v1",
    graceMinutes: 15,
    workingWeek: "Mon-Fri",
  };
}

async function insertCorruptedProjection(
  app: TestApp,
  companyId: string,
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.sessions (
       id, company_id, employee_user_id, work_date, status, checked_in_at,
       closed_at, last_transition_at, work_mode, source, metadata,
       version, created_at, updated_at, deleted_at
     )
     VALUES ('99999999-9999-4999-8999-999999999901',$1,$2,$3::date,'closed',
       '2026-05-18T09:00:00.000Z','2026-05-18T17:00:00.000Z',
       '2026-05-18T17:00:00.000Z','office','admin','{}'::jsonb,1,
       '2026-05-18T09:00:00.000Z','2026-05-18T17:00:00.000Z',NULL)`,
    [companyId, seedIds.employee1, day],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.daily_records (
       company_id, employee_user_id, work_date, status, work_seconds, break_seconds
     )
     VALUES ($1,$2,$3::date,'present',60,0)`,
    [companyId, seedIds.employee1, day],
  );
}

async function insertRegularizationApplication(
  app: TestApp,
  companyId: string,
  input: { operation: "void"; targetOrdinal: number; applicationId: string },
): Promise<void> {
  const target = idsFor(input.targetOrdinal);
  const requestId = "77777777-7777-4777-8777-777777777711";
  const itemId = "77777777-7777-4777-8777-777777777712";
  const actionId = "77777777-7777-4777-8777-777777777713";
  await app.store.pgPool!.query(
    `INSERT INTO attendance.regularization_requests (
       id, company_id, employee_user_id, work_date, reason,
       requested_punches, status, current_approver_user_id,
       decision_remarks, decided_by_user_id, decided_at, version,
       created_at, updated_at, deleted_at, submitted_by_user_id
     )
     VALUES ($1,$2,$3,$4::date,'Projection rebuild fixture',
       '[]'::jsonb,'approved',NULL,NULL,$5,
       '2026-05-18T20:00:00.000Z',2,
       '2026-05-18T19:00:00.000Z','2026-05-18T20:00:00.000Z',
       NULL,$3)`,
    [requestId, companyId, seedIds.employee1, day, seedIds.admin],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.regularization_request_items (
       id, company_id, regularization_request_id, ordinal, operation,
       target_punch_event_id, event_type, occurred_at, created_at
     )
     VALUES ($1,$2,$3,0,$4,$5,NULL,NULL,'2026-05-18T19:00:00.000Z')`,
    [itemId, companyId, requestId, input.operation, target.punch],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.regularization_actions (
       id, company_id, regularization_request_id, actor_user_id,
       subject_employee_user_id, action_kind, previous_state,
       resulting_state, remarks, resulting_version, occurred_at,
       migration_reconstructed
     )
     VALUES ($1,$2,$3,$4,$5,'approved','pending','approved',
       NULL,2,'2026-05-18T20:00:00.000Z',false)`,
    [actionId, companyId, requestId, seedIds.admin, seedIds.employee1],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.regularization_correction_applications (
       id, company_id, regularization_request_id, regularization_request_item_id,
       regularization_action_id, operation, target_punch_event_id,
       replacement_punch_event_id, attendance_event_id, applied_by_user_id,
       applied_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,$8,
       '2026-05-18T20:00:00.000Z')`,
    [
      input.applicationId,
      companyId,
      requestId,
      itemId,
      actionId,
      input.operation,
      target.punch,
      seedIds.admin,
    ],
  );
}

async function projectionCounts(app: TestApp, companyId: string) {
  const row = (
    await app.store.pgPool!.query<{
      sessions: string;
      breaks: string;
      daily: string;
    }>(
      `SELECT
       (SELECT count(*) FROM attendance.sessions WHERE company_id = $1 AND employee_user_id = $2 AND deleted_at IS NULL) AS sessions,
       (SELECT count(*) FROM attendance.break_segments WHERE company_id = $1) AS breaks,
       (SELECT count(*) FROM attendance.daily_records WHERE company_id = $1 AND employee_user_id = $2 AND deleted_at IS NULL) AS daily`,
      [companyId, seedIds.employee1],
    )
  ).rows[0]!;
  return {
    sessions: Number(row.sessions),
    breaks: Number(row.breaks),
    daily: Number(row.daily),
  };
}

async function projectionSnapshot(app: TestApp, companyId: string) {
  return (
    await app.store.pgPool!.query<{
      session_count: number;
      break_count: number;
      work_seconds: number;
      break_seconds: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM attendance.sessions WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date AND deleted_at IS NULL) AS session_count,
       (SELECT count(*)::int FROM attendance.break_segments segment JOIN attendance.sessions session ON session.id = segment.session_id AND session.company_id = segment.company_id WHERE segment.company_id = $1 AND session.employee_user_id = $2 AND session.work_date = $3::date AND session.deleted_at IS NULL) AS break_count,
       (SELECT work_seconds FROM attendance.daily_records WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date) AS work_seconds,
       (SELECT break_seconds FROM attendance.daily_records WHERE company_id = $1 AND employee_user_id = $2 AND work_date = $3::date) AS break_seconds`,
      [companyId, seedIds.employee1, day],
    )
  ).rows[0]!;
}

async function immutableCounts(app: TestApp, companyId: string) {
  return (
    await app.store.pgPool!.query<Record<string, string>>(
      `SELECT
       (SELECT count(*) FROM attendance.punch_events WHERE company_id = $1) AS punches,
       (SELECT count(*) FROM attendance.command_decisions WHERE company_id = $1) AS command_decisions,
       (SELECT count(*) FROM attendance.attendance_decisions WHERE company_id = $1) AS attendance_decisions,
       (SELECT count(*) FROM attendance.attendance_events WHERE company_id = $1) AS attendance_events`,
      [companyId],
    )
  ).rows[0];
}

function idsFor(ordinal: number) {
  const suffix = String(ordinal).padStart(12, "0");
  return {
    command: `33333333-3333-4333-8333-${suffix}`,
    commandDecision: `44444444-4444-4444-8444-${suffix}`,
    attendanceEvent: `55555555-5555-4555-8555-${suffix}`,
    auditDecision: `66666666-6666-4666-8666-${suffix}`,
    punch: `88888888-8888-4888-8888-${suffix}`,
  };
}
