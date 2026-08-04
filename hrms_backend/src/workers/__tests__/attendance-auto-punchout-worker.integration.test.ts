import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "#testing";
import { buildRealApp } from "../../__tests__/real-infra.js";
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

describe("AttendanceAutoPunchoutWorker PostgreSQL outbox", () => {
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

  it("persists one missing-checkout event in the auto-punchout transaction", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const pool = app.store.pgPool!;
    await pool.query(
      `UPDATE platform.company_profiles
          SET working_week = 'Mon-Sun', timezone = 'Asia/Kolkata'
        WHERE id = $1`,
      [companyId],
    );
    await pool.query(
      `UPDATE platform.admin_policies
          SET company_id = $1,
              config = config || $2::jsonb
        WHERE (company_id = $1 OR company_id IS NULL)
          AND policy_key = 'attendance'
          AND status = 'active'
          AND deleted_at IS NULL`,
      [
        companyId,
        JSON.stringify({
          fullDayPunchWindow: true,
          autoPunchOutEnabled: true,
          autoPunchOutTime: "18:30",
        }),
      ],
    );
    const sessionId = randomUUID();
    const checkInId = randomUUID();
    await pool.query(
      `INSERT INTO attendance.sessions (
          id, company_id, employee_user_id, work_date, status, checked_in_at,
          last_transition_at, work_mode, source, metadata
        ) VALUES ($1, $2, $3, '2026-05-20', 'working', '2026-05-20T04:00:00.000Z',
          '2026-05-20T04:00:00.000Z', 'office', 'admin', '{}'::jsonb)`,
      [sessionId, companyId, employee.user.id],
    );
    await pool.query(
      `INSERT INTO attendance.punch_events (
          id, company_id, employee_user_id, actor_user_id, event_type, occurred_at,
          work_mode, source, origin, metadata
        ) VALUES ($1, $2, $3, $3, 'check_in', '2026-05-20T04:00:00.000Z',
          'office', 'admin', 'historical_correction', '{}'::jsonb)`,
      [checkInId, companyId, employee.user.id],
    );
    await app.store.persistence?.reload();

    const result = await new AttendanceAutoPunchoutWorker(app.store).runDue({
      referenceIso: "2026-05-20T14:00:00.000Z",
      batchSize: 10,
    });
    expect(result).toMatchObject({ skipped: false, closed_sessions: 1, punches_created: 1 });

    const rows = (await app.store.pgPool!.query<{
      aggregate_id: string;
      event_type: string;
      idempotency_key: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT aggregate_id, event_type, idempotency_key, payload
         FROM platform.outbox_events
        WHERE event_type = 'attendance.missing_checkout.detected'
        ORDER BY id`,
    )).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: "attendance.missing_checkout.detected",
      idempotency_key: `attendance.missing_checkout.detected:${rows[0]!.aggregate_id}`,
        payload: expect.objectContaining({
          schema_version: 1,
          company_id: companyId,
          actor_user_id: employee.user.id,
          subject_employee_user_id: employee.user.id,
        punch_event_id: rows[0]!.aggregate_id,
        work_date: "2026-05-20",
        occurred_at: "2026-05-20T13:00:00.000Z",
        origin: "system",
      }),
    });

    const repeated = await new AttendanceAutoPunchoutWorker(app.store).runDue({
      referenceIso: "2026-05-20T14:05:00.000Z",
      batchSize: 10,
    });
    expect(repeated.closed_sessions).toBe(0);
    const repeatedCount = (await app.store.pgPool!.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM platform.outbox_events
        WHERE event_type = 'attendance.missing_checkout.detected'`,
    )).rows[0]!.count;
    expect(repeatedCount).toBe(1);
  }, 30_000);
});
