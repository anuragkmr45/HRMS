import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../__tests__/real-infra.js";
import { PostgresAttendanceCommandRepository } from "../../modules/attendance/command-repository.js";
import { resolveEffectiveAttendancePolicy } from "../../modules/attendance/policy-resolver.js";
import { AttendanceAutoPunchoutWorker } from "../attendance-auto-punchout-worker.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

function employeeCompanyId(app: TestApp, employeeUserId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employeeUserId,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return companyId;
}

async function createAttendancePolicy(
  app: TestApp,
  input: {
    companyId: string;
    employeeUserId: string;
    name: string;
    autoPunchOutEnabled: boolean;
    autoPunchOutTime: string;
    versions?: Array<{
      versionNumber: number;
      effectiveFrom: string;
      effectiveUntil: string | null;
      autoPunchOutEnabled: boolean;
      autoPunchOutTime: string;
    }>;
  },
): Promise<void> {
  const policy = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.policies (
       company_id, policy_key, name, label, status, created_at, updated_at,
       deleted_at, version
     ) VALUES ($1, 'attendance', $2, $2, 'active', now(), now(), NULL, 1)
     RETURNING id`,
    [input.companyId, input.name],
  );
  const policyId = policy.rows[0]?.id;
  if (!policyId) throw new Error("Attendance policy fixture was not created.");
  for (const version of input.versions ?? [
    {
      versionNumber: 1,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: null,
      autoPunchOutEnabled: input.autoPunchOutEnabled,
      autoPunchOutTime: input.autoPunchOutTime,
    },
  ]) {
    await app.store.pgPool!.query(
      `INSERT INTO attendance.policy_versions (
         company_id, policy_id, version_number, effective_from, effective_until,
         config, created_at
       ) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::jsonb, now())`,
      [
        input.companyId,
        policyId,
        version.versionNumber,
        version.effectiveFrom,
        version.effectiveUntil,
        JSON.stringify({
          fullDayPunchWindow: true,
          autoPunchOutEnabled: version.autoPunchOutEnabled,
          autoPunchOutTime: version.autoPunchOutTime,
          graceMinutes: 0,
        }),
      ],
    );
  }
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_assignments (
       company_id, policy_id, scope_type, scope_id, effective_from,
       effective_until, status, created_at, updated_at, deleted_at, version
     ) VALUES ($1, $2, 'employee', $3, '2026-01-01T00:00:00.000Z',
       NULL, 'active', now(), now(), NULL, 1)`,
    [input.companyId, policyId, input.employeeUserId],
  );
}

async function createOpenSession(
  app: TestApp,
  input: {
    companyId: string;
    employeeUserId: string;
    workDate?: string;
    checkedInAt?: string;
    status?: "working" | "on_break";
    activeBreakStartedAt?: string;
  },
): Promise<string> {
  const sessionId = randomUUID();
  const checkedInAt = input.checkedInAt ?? "2026-05-20T04:00:00.000Z";
  const workDate = input.workDate ?? "2026-05-20";
  const lastTransitionAt = input.activeBreakStartedAt ?? checkedInAt;
  await app.store.pgPool!.query(
    `INSERT INTO attendance.sessions (
       id, company_id, employee_user_id, work_date, status, checked_in_at,
       last_transition_at, work_mode, source, metadata
     ) VALUES ($1, $2, $3, $4::date, $5, $6::timestamptz,
       $7::timestamptz, 'office', 'admin', '{}'::jsonb)`,
    [
      sessionId,
      input.companyId,
      input.employeeUserId,
      workDate,
      input.status ?? "working",
      checkedInAt,
      lastTransitionAt,
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.employee_command_states (
       company_id, employee_user_id, state, current_session_id, version,
       created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 1, now(), now())
     ON CONFLICT (company_id, employee_user_id) DO UPDATE
       SET state = EXCLUDED.state,
           current_session_id = EXCLUDED.current_session_id,
           version = attendance.employee_command_states.version + 1,
           updated_at = now()`,
    [
      input.companyId,
      input.employeeUserId,
      input.status === "on_break" ? "on_break" : "working",
      sessionId,
    ],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.punch_events (
       company_id, employee_user_id, actor_user_id, event_type, occurred_at,
       work_mode, source, origin, metadata, session_id
     ) VALUES ($1, $2, $2, 'check_in', $3::timestamptz,
       'office', 'admin', 'historical_correction', '{}'::jsonb, $4)`,
    [input.companyId, input.employeeUserId, checkedInAt, sessionId],
  );
  if (input.activeBreakStartedAt) {
    await app.store.pgPool!.query(
      `INSERT INTO attendance.break_segments (
         company_id, session_id, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3::timestamptz, NULL, now(), now())`,
      [input.companyId, sessionId, input.activeBreakStartedAt],
    );
    await app.store.pgPool!.query(
      `INSERT INTO attendance.punch_events (
         company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, metadata, session_id
       ) VALUES ($1, $2, $2, 'break_start', $3::timestamptz,
         'office', 'admin', 'historical_correction', '{}'::jsonb, $4)`,
      [
        input.companyId,
        input.employeeUserId,
        input.activeBreakStartedAt,
        sessionId,
      ],
    );
  }
  return sessionId;
}

async function createSecondCompanyForEmployee(
  app: TestApp,
  employeeUserId: string,
): Promise<string> {
  const companyId = randomUUID();
  await app.store.pgPool!.query(
    `INSERT INTO platform.company_profiles (
       id, company_name, company_slug, timezone, locale,
       fiscal_year_start_month, status, bootstrap_completed_at,
       currency, working_week, work_hours_per_day, logo_label
     ) VALUES ($1, 'Tenant B', $2, 'Asia/Kolkata', 'en-IN',
       4, 'active', now(), 'INR', 'Mon-Sun', 8, 'TB')`,
    [companyId, `tenant-b-${companyId}`],
  );
  await app.store.pgPool!.query(
    `UPDATE platform.user_session_preferences
       SET company_id = $2, updated_at = now()
     WHERE user_id = $1`,
    [employeeUserId, companyId],
  );
  await app.store.persistence?.reload();
  return companyId;
}

async function resolvePolicyVersionFor(
  app: TestApp,
  input: { companyId: string; employeeUserId: string; asOf: string },
): Promise<string> {
  return new PostgresAttendanceCommandRepository(app.store.pgPool!).transaction(
    async (tx) => {
      const policy = await resolveEffectiveAttendancePolicy(tx, {
        companyId: input.companyId,
        subjectEmployeeUserId: input.employeeUserId,
        asOf: input.asOf,
      });
      return policy.policyVersion;
    },
  );
}

describe("AttendanceAutoPunchoutWorker PostgreSQL DB-first flow", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("closes an eligible authoritative session and writes projection and outbox in one command transaction", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    await createAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      name: "auto_checkout_due",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "18:30",
    });
    const sessionId = await createOpenSession(app, {
      companyId,
      employeeUserId: employee.user.id,
    });

    const result = await new AttendanceAutoPunchoutWorker(app.store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
      batchSize: 10,
    });

    expect(result).toMatchObject({
      skipped: false,
      closed_sessions: 1,
      punches_created: 1,
    });
    const closure = result.closures[0];
    expect(closure?.first_check_in_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(closure?.last_open_punch_id).toBe(closure?.first_check_in_id);
    const row = (
      await app.store.pgPool!.query<{
        closed_at: Date | null;
        state: string;
        checkout_count: number;
        check_in_id: string | null;
        last_check_out: Date | null;
        missing_outbox: number;
        punch_outbox: number;
      }>(
        `SELECT
         session.closed_at,
         state.state,
         (SELECT count(*)::int FROM attendance.punch_events punch
           WHERE punch.company_id = session.company_id
             AND punch.employee_user_id = session.employee_user_id
             AND punch.session_id = session.id
             AND punch.event_type = 'check_out'
             AND punch.origin = 'system'
             AND punch.source = 'admin'
             AND punch.metadata->>'auto_punch_out' = 'true') AS checkout_count,
         (SELECT punch.id::text FROM attendance.punch_events punch
           WHERE punch.company_id = session.company_id
             AND punch.employee_user_id = session.employee_user_id
             AND punch.session_id = session.id
             AND punch.event_type = 'check_in'
           ORDER BY punch.occurred_at, punch.id
           LIMIT 1) AS check_in_id,
         day.last_check_out,
         (SELECT count(*)::int FROM platform.outbox_events outbox
           WHERE outbox.event_type = 'attendance.missing_checkout.detected'
             AND outbox.payload->>'attendance_session_id' = session.id::text) AS missing_outbox,
         (SELECT count(*)::int FROM platform.outbox_events outbox
           WHERE outbox.event_type = 'attendance.punch.recorded'
             AND outbox.payload->>'session_id' = session.id::text
             AND outbox.payload->>'origin' = 'system') AS punch_outbox
       FROM attendance.sessions session
       JOIN attendance.employee_command_states state
         ON state.company_id = session.company_id
        AND state.employee_user_id = session.employee_user_id
       LEFT JOIN attendance.daily_records day
         ON day.company_id = session.company_id
        AND day.employee_user_id = session.employee_user_id
        AND day.work_date = session.work_date
       WHERE session.id = $1`,
        [sessionId],
      )
    ).rows[0];

    expect(row?.closed_at?.toISOString()).toBe("2026-05-20T13:00:00.000Z");
    expect(row?.state).toBe("completed");
    expect(row?.checkout_count).toBe(1);
    expect(closure?.first_check_in_id).toBe(row?.check_in_id);
    expect(row?.last_check_out?.toISOString()).toBe("2026-05-20T13:00:00.000Z");
    expect(row?.missing_outbox).toBe(1);
    expect(row?.punch_outbox).toBe(1);
  }, 30_000);

  it("keyset-pages beyond an earlier ineligible open session in the same run", async () => {
    const employeeA = await loginAs(app, "E1");
    const employeeB = await loginAs(app, "E2");
    const companyAId = employeeCompanyId(app, employeeA.user.id);
    const companyBId = employeeCompanyId(app, employeeB.user.id);
    await createAttendancePolicy(app, {
      companyId: companyAId,
      employeeUserId: employeeA.user.id,
      name: "earlier_not_due",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "23:59",
    });
    await createAttendancePolicy(app, {
      companyId: companyBId,
      employeeUserId: employeeB.user.id,
      name: "later_due",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "18:30",
    });
    const earlierSessionId = await createOpenSession(app, {
      companyId: companyAId,
      employeeUserId: employeeA.user.id,
      checkedInAt: "2026-05-20T03:00:00.000Z",
    });
    const laterSessionId = await createOpenSession(app, {
      companyId: companyBId,
      employeeUserId: employeeB.user.id,
      checkedInAt: "2026-05-20T04:00:00.000Z",
    });

    const result = await new AttendanceAutoPunchoutWorker(app.store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
      batchSize: 1,
    });

    expect(result.scanned_users).toBeGreaterThanOrEqual(2);
    expect(result.closed_sessions).toBe(1);
    const sessions = (
      await app.store.pgPool!.query<{
        id: string;
        closed_at: Date | null;
      }>(
        `SELECT id, closed_at
       FROM attendance.sessions
       WHERE id = ANY($1::uuid[])`,
        [[earlierSessionId, laterSessionId]],
      )
    ).rows;
    expect(
      sessions.find((session) => session.id === earlierSessionId)?.closed_at,
    ).toBeNull();
    expect(
      sessions.find((session) => session.id === laterSessionId)?.closed_at,
    ).toBeInstanceOf(Date);
  }, 30_000);

  it("uses tenant-specific effective policy and skips a different tenant that is not due", async () => {
    const employeeA = await loginAs(app, "E1");
    const employeeB = await loginAs(app, "E2");
    const companyAId = employeeCompanyId(app, employeeA.user.id);
    const companyBId = await createSecondCompanyForEmployee(
      app,
      employeeB.user.id,
    );
    await createAttendancePolicy(app, {
      companyId: companyAId,
      employeeUserId: employeeA.user.id,
      name: "tenant_a_due",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "18:30",
    });
    await createAttendancePolicy(app, {
      companyId: companyBId,
      employeeUserId: employeeB.user.id,
      name: "tenant_b_not_due",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "23:59",
    });
    await expect(
      resolvePolicyVersionFor(app, {
        companyId: companyAId,
        employeeUserId: employeeA.user.id,
        asOf: "2026-05-20T14:00:00.000Z",
      }),
    ).resolves.toBe("1");
    await expect(
      resolvePolicyVersionFor(app, {
        companyId: companyBId,
        employeeUserId: employeeB.user.id,
        asOf: "2026-05-20T14:00:00.000Z",
      }),
    ).resolves.toBe("1");
    const sessionAId = await createOpenSession(app, {
      companyId: companyAId,
      employeeUserId: employeeA.user.id,
    });
    const sessionBId = await createOpenSession(app, {
      companyId: companyBId,
      employeeUserId: employeeB.user.id,
    });

    const result = await new AttendanceAutoPunchoutWorker(app.store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
      batchSize: 10,
    });

    expect(result.closed_sessions).toBe(1);
    const sessions = (
      await app.store.pgPool!.query<{
        id: string;
        company_id: string;
        closed_at: Date | null;
      }>(
        `SELECT id, company_id, closed_at
       FROM attendance.sessions
       WHERE id = ANY($1::uuid[])
       ORDER BY id`,
        [[sessionAId, sessionBId]],
      )
    ).rows;
    expect(sessions.find((session) => session.id === sessionAId)).toMatchObject(
      {
        company_id: companyAId,
        closed_at: expect.any(Date),
      },
    );
    expect(sessions.find((session) => session.id === sessionBId)).toMatchObject(
      {
        company_id: companyBId,
        closed_at: null,
      },
    );
  }, 30_000);

  it("uses the policy effective when the attendance session started", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    await createAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      name: "reference_time_policy",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "18:30",
      versions: [
        {
          versionNumber: 1,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveUntil: "2026-05-20T10:00:00.000Z",
          autoPunchOutEnabled: true,
          autoPunchOutTime: "23:59",
        },
        {
          versionNumber: 2,
          effectiveFrom: "2026-05-20T10:00:00.000Z",
          effectiveUntil: null,
          autoPunchOutEnabled: true,
          autoPunchOutTime: "18:30",
        },
      ],
    });
    const sessionId = await createOpenSession(app, {
      companyId,
      employeeUserId: employee.user.id,
      checkedInAt: "2026-05-20T04:00:00.000Z",
    });
    await expect(
      resolvePolicyVersionFor(app, {
        companyId,
        employeeUserId: employee.user.id,
        asOf: "2026-05-20T04:00:00.000Z",
      }),
    ).resolves.toBe("1");
    await expect(
      resolvePolicyVersionFor(app, {
        companyId,
        employeeUserId: employee.user.id,
        asOf: "2026-05-20T14:00:00.000Z",
      }),
    ).resolves.toBe("2");

    const result = await new AttendanceAutoPunchoutWorker(app.store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
    });

    expect(result.closed_sessions).toBe(0);
    expect(result.skipped).toBe(true);

    const session = (
      await app.store.pgPool!.query<{ closed_at: Date | null }>(
        `SELECT closed_at FROM attendance.sessions WHERE id = $1`,
        [sessionId],
      )
    ).rows[0];

    expect(session?.closed_at).toBeNull();
  }, 30_000);

  it("is retry-safe and closes an active break before session checkout", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    await createAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      name: "auto_checkout_break",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "18:30",
    });
    const sessionId = await createOpenSession(app, {
      companyId,
      employeeUserId: employee.user.id,
      status: "on_break",
      activeBreakStartedAt: "2026-05-20T07:00:00.000Z",
    });
    const worker = new AttendanceAutoPunchoutWorker(app.store);

    const first = await worker.runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
    });
    const second = await worker.runDue({
      referenceIso: "2026-05-20T14:05:00.000Z",
    });

    expect(first.closed_sessions).toBe(1);
    expect(second.skipped).toBe(true);
    const row = (
      await app.store.pgPool!.query<{
        closed_at: Date | null;
        active_breaks: number;
        checkout_count: number;
        missing_outbox: number;
      }>(
        `SELECT
         session.closed_at,
         (SELECT count(*)::int FROM attendance.break_segments segment
           WHERE segment.company_id = session.company_id
             AND segment.session_id = session.id
             AND segment.ended_at IS NULL) AS active_breaks,
         (SELECT count(*)::int FROM attendance.punch_events punch
           WHERE punch.company_id = session.company_id
             AND punch.session_id = session.id
             AND punch.event_type = 'check_out'
             AND punch.origin = 'system') AS checkout_count,
         (SELECT count(*)::int FROM platform.outbox_events outbox
           WHERE outbox.event_type = 'attendance.missing_checkout.detected'
             AND outbox.payload->>'attendance_session_id' = session.id::text) AS missing_outbox
       FROM attendance.sessions session
       WHERE session.id = $1`,
        [sessionId],
      )
    ).rows[0];

    expect(row?.closed_at?.toISOString()).toBe("2026-05-20T13:00:00.000Z");
    expect(row?.active_breaks).toBe(0);
    expect(row?.checkout_count).toBe(1);
    expect(row?.missing_outbox).toBe(1);
  }, 30_000);

  it("does not duplicate checkout when the session is already manually closed before the worker runs", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    await createAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      name: "manual_race",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "18:30",
    });
    const sessionId = await createOpenSession(app, {
      companyId,
      employeeUserId: employee.user.id,
    });
    await app.store.pgPool!.query(
      `UPDATE attendance.sessions
         SET status = 'closed',
             closed_at = '2026-05-20T13:00:00.000Z',
             last_transition_at = '2026-05-20T13:00:00.000Z',
             version = version + 1,
             updated_at = now()
       WHERE id = $1`,
      [sessionId],
    );
    await app.store.pgPool!.query(
      `UPDATE attendance.employee_command_states
         SET state = 'completed',
             current_session_id = $1,
             version = version + 1,
             updated_at = now()
       WHERE company_id = $2 AND employee_user_id = $3`,
      [sessionId, companyId, employee.user.id],
    );
    await app.store.pgPool!.query(
      `INSERT INTO attendance.punch_events (
         company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, metadata, session_id
       ) VALUES ($1, $2, $2, 'check_out', '2026-05-20T13:00:00.000Z',
         'office', 'web', 'employee_manual_now', '{}'::jsonb, $3)`,
      [companyId, employee.user.id, sessionId],
    );

    const result = await new AttendanceAutoPunchoutWorker(app.store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
    });

    expect(result.skipped).toBe(true);
    const counts = (
      await app.store.pgPool!.query<{
        checkout_count: number;
        system_checkout_count: number;
        missing_outbox: number;
      }>(
        `SELECT
         (count(*) FILTER (WHERE event_type = 'check_out'))::int AS checkout_count,
         (count(*) FILTER (WHERE event_type = 'check_out' AND origin = 'system'))::int AS system_checkout_count,
         (SELECT count(*)::int FROM platform.outbox_events
           WHERE event_type = 'attendance.missing_checkout.detected') AS missing_outbox
       FROM attendance.punch_events
       WHERE company_id = $1 AND employee_user_id = $2 AND session_id = $3`,
        [companyId, employee.user.id, sessionId],
      )
    ).rows[0];

    expect(counts).toEqual({
      checkout_count: 1,
      system_checkout_count: 0,
      missing_outbox: 0,
    });
  }, 30_000);

  it("keeps authoritative state consistent when manual checkout races auto-checkout", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    await createAttendancePolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      name: "manual_auto_race",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "18:30",
    });
    const sessionId = await createOpenSession(app, {
      companyId,
      employeeUserId: employee.user.id,
    });
    const worker = new AttendanceAutoPunchoutWorker(app.store);

    const manualClientEventId = "00000000-0000-4000-8000-000000000701";

    const [manual, auto] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/attendance/punches",
        headers: {
          ...authHeader(employee.token),
          "idempotency-key": manualClientEventId,
        },
        payload: {
          client_event_id: manualClientEventId,
          captured_at: "2026-05-20T14:00:00.000Z",
          device: null,
          command: {
            event_type: "check_out",
            work_mode: "office",
            source: "web",
            metadata: {},
          },
        },
      }),
      worker.runDue({
        referenceIso: "2026-05-20T14:00:00.000Z",
        batchSize: 1,
      }),
    ]);

    expect([200, 409]).toContain(manual.statusCode);
    expect(auto.closed_sessions === 1 || auto.skipped).toBe(true);
    const persisted = (
      await app.store.pgPool!.query<{
        state: string;
        current_session_id: string | null;
        status: string;
        open_sessions: number;
        active_breaks: number;
        checkout_count: number;
        system_checkout_count: number;
        missing_outbox: number;
      }>(
        `SELECT
         runtime.state,
         runtime.current_session_id,
         session.status,
         (SELECT count(*)::int FROM attendance.sessions open_session
           WHERE open_session.company_id = session.company_id
             AND open_session.employee_user_id = session.employee_user_id
             AND open_session.closed_at IS NULL
             AND open_session.deleted_at IS NULL) AS open_sessions,
         (SELECT count(*)::int FROM attendance.break_segments segment
           WHERE segment.company_id = session.company_id
             AND segment.session_id = session.id
             AND segment.ended_at IS NULL) AS active_breaks,
         (SELECT count(*)::int FROM attendance.punch_events punch
           WHERE punch.company_id = session.company_id
             AND punch.employee_user_id = session.employee_user_id
             AND punch.session_id = session.id
             AND punch.event_type = 'check_out'
             AND punch.deleted_at IS NULL) AS checkout_count,
         (SELECT count(*)::int FROM attendance.punch_events punch
           WHERE punch.company_id = session.company_id
             AND punch.employee_user_id = session.employee_user_id
             AND punch.session_id = session.id
             AND punch.event_type = 'check_out'
             AND punch.origin = 'system'
             AND punch.deleted_at IS NULL) AS system_checkout_count,
         (SELECT count(*)::int FROM platform.outbox_events outbox
           WHERE outbox.event_type = 'attendance.missing_checkout.detected'
             AND outbox.payload->>'attendance_session_id' = session.id::text) AS missing_outbox
       FROM attendance.sessions session
       JOIN attendance.employee_command_states runtime
         ON runtime.company_id = session.company_id
        AND runtime.employee_user_id = session.employee_user_id
       WHERE session.id = $1`,
        [sessionId],
      )
    ).rows[0];

    expect(persisted).toMatchObject({
      status: "closed",
      open_sessions: 0,
      active_breaks: 0,
      checkout_count: 1,
    });

    expect(["completed", "not_checked_in"]).toContain(persisted?.state);
    if (persisted?.state === "completed") {
      expect(persisted.current_session_id).toBe(sessionId);
    } else {
      expect(persisted?.current_session_id).toBeNull();
    }
    expect(persisted?.system_checkout_count).toBeLessThanOrEqual(1);
    expect(persisted?.missing_outbox).toBe(persisted?.system_checkout_count);
  }, 30_000);
});
