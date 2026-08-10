import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import type { AttendancePunchSourceChannel } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import {
  AttendanceCommandService,
  isAttendanceReplayResponse,
} from "../command-service.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

const internalSourceChannels = [
  "mobile_foreground",
  "mobile_offline",
  "kiosk",
  "auto_geofence",
] as const satisfies readonly AttendancePunchSourceChannel[];

async function clearAttendanceRuntimeFixtures(app: TestApp): Promise<void> {
  const pool = app.store.pgPool;
  if (!pool) throw new Error("PostgreSQL pool is unavailable.");

  await pool.query(`
    TRUNCATE TABLE
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.punch_events,
      attendance.command_decisions,
      attendance.command_executions,
      attendance.employee_command_states,
      attendance.break_segments,
      attendance.sessions
    RESTART IDENTITY CASCADE
  `);

  await pool.query(`
    DELETE FROM platform.outbox_events
    WHERE aggregate_type = 'attendance'
  `);

  await pool.query(`
    DELETE FROM platform.idempotency_keys
    WHERE scope LIKE 'attendance.punch:%'
  `);
}

function employeeCompanyId(app: TestApp, employeeUserId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employeeUserId,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return companyId;
}

function testClientEventId(ordinal: number): string {
  return `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}`;
}

function isPersonalMobileSource(source: AttendancePunchSourceChannel): boolean {
  return source === "mobile" || source === "mobile_foreground" || source === "mobile_offline";
}

async function insertRegisteredDevice(
  app: TestApp,
  input: {
    companyId: string;
    userId: string;
    status?: "registered" | "suspended" | "revoked";
  },
): Promise<string> {
  const installationHash = createHash("sha256")
    .update(`attendance-source-channel:${randomUUID()}`)
    .digest("hex");
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO platform.registered_devices (
       company_id, user_id, installation_id_hash, platform, status, status_changed_at
     )
     VALUES ($1, $2, $3, 'android', $4, now())
     RETURNING id`,
    [input.companyId, input.userId, installationHash, input.status ?? "registered"],
  );
  return result.rows[0]!.id;
}

describe("attendance source channel provenance", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    await clearAttendanceRuntimeFixtures(app);

    const policy = app.store.adminPolicies.find(
      (candidate) => candidate.policy_key === "attendance",
    );
    if (!policy) throw new Error("Attendance policy fixture is unavailable.");
    policy.config = {
      ...policy.config,
      fullDayPunchWindow: true,
      allowOffDayPunches: true,
    };
  }, 30_000);

  afterEach(async () => {
    try {
      if (app) await clearAttendanceRuntimeFixtures(app);
    } finally {
      try {
        await app?.close();
      } finally {
        if (originalDatabaseUrl === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = originalDatabaseUrl;
        }
      }
    }
  });

  it("keeps internal-only channels out of the public punch request boundary", async () => {
    const employee = await loginAs(app, "E1");
    const clientEventId = testClientEventId(10);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: { ...authHeader(employee.token), "idempotency-key": clientEventId },
      payload: {
        client_event_id: clientEventId,
        captured_at: "2026-08-03T09:00:00.000+05:30",
        device: null,
        command: {
          event_type: "check_in",
          work_mode: "office",
          source: "mobile_offline",
          metadata: {},
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("accepts new source channels in PostgreSQL checks and rejects unknown values", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const pool = app.store.pgPool!;

    await pool.query(
      `INSERT INTO attendance.attendance_events (
        company_id, employee_user_id, actor_user_id, event_type, source,
        occurred_at, received_at, payload, payload_hash
       ) VALUES ($1, $2, $2, 'check_in', 'system', now(), now(), '{}'::jsonb, repeat('a', 64))`,
      [companyId, employee.user.id],
    );

    await expect(pool.query(
      `INSERT INTO attendance.punch_events (
        company_id, employee_user_id, actor_user_id, event_type, occurred_at,
        work_mode, source, metadata
       ) VALUES ($1, $2, $2, 'check_in', now(), 'office', 'unknown_channel', '{}'::jsonb)`,
      [companyId, employee.user.id],
    )).rejects.toMatchObject({ code: "23514" });

    await expect(pool.query(
      `INSERT INTO attendance.sessions (
        company_id, employee_user_id, work_date, status, checked_in_at,
        closed_at, last_transition_at, work_mode, source, metadata
       ) VALUES ($1, $2, current_date, 'closed', now(), now(), now(), 'office', 'unknown_channel', '{}'::jsonb)`,
      [companyId, employee.user.id],
    )).rejects.toMatchObject({ code: "23514" });

    await expect(pool.query(
      `INSERT INTO attendance.attendance_events (
        company_id, employee_user_id, actor_user_id, event_type, source,
        occurred_at, received_at, payload, payload_hash
       ) VALUES ($1, $2, $2, 'check_in', 'unknown_channel', now(), now(), '{}'::jsonb, repeat('b', 64))`,
      [companyId, employee.user.id],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it.each(internalSourceChannels)(
    "propagates trusted internal source channel %s through command decisions and attendance facts",
    async (source) => {
      await clearAttendanceRuntimeFixtures(app);
      const employee = await loginAs(app, "E1");
      const companyId = employeeCompanyId(app, employee.user.id);
      const clientEventId = testClientEventId(100 + internalSourceChannels.indexOf(source));
      const registeredDeviceId = isPersonalMobileSource(source)
        ? await insertRegisteredDevice(app, {
            companyId,
            userId: employee.user.id,
          })
        : null;

      const response = await new AttendanceCommandService(app.store).execute({
        actor: employee.user,
        companyId,
        timeZone: "Asia/Kolkata",
        idempotencyKey: clientEventId,
        clientEnvelope: {
          clientEventId,
          capturedAt: "2026-08-03T09:00:00.000+05:30",
          device: {
            ...(registeredDeviceId ? { registered_device_id: registeredDeviceId } : {}),
            platform: "android",
            app_version: "2026.08.03",
          },
        },
        command: {
          event_type: "check_in",
          work_mode: "office",
          source,
          metadata: {},
        },
        isWorkingDayFor: () => true,
      });

      expect(response).toMatchObject({ allowed: true, punch: { source } });

      const persisted = await app.store.pgPool!.query<{
        request_source: string | null;
        envelope_source: string | null;
        attendance_event_source: string;
        audit_context_source: string | null;
        decision_evidence_source: string | null;
        punch_source: string;
        session_source: string;
        outbox_source_channel: string | null;
      }>(
        `SELECT
          command.request_snapshot ->> 'source' AS request_source,
          command.request_snapshot #>> '{envelope,command,source}' AS envelope_source,
          event.source AS attendance_event_source,
          audit.evaluation_context ->> 'source_channel' AS audit_context_source,
          decision.evidence_snapshot ->> 'source_channel' AS decision_evidence_source,
          punch.source AS punch_source,
          session.source AS session_source,
          outbox.payload ->> 'source_channel' AS outbox_source_channel
         FROM attendance.command_executions command
         JOIN attendance.attendance_events event
           ON event.command_execution_id = command.id
         JOIN attendance.attendance_decisions audit
           ON audit.command_execution_id = command.id
         JOIN attendance.command_decisions decision
           ON decision.command_execution_id = command.id
         JOIN attendance.punch_events punch
           ON punch.command_execution_id = command.id
         JOIN attendance.sessions session
           ON session.id = punch.session_id
         JOIN platform.outbox_events outbox
           ON outbox.aggregate_id = punch.id
          AND outbox.event_type = 'attendance.punch.recorded'
        WHERE command.id = $1`,
        [response.command_id],
      );

      expect(persisted.rows[0]).toEqual({
        request_source: source,
        envelope_source: source,
        attendance_event_source: source,
        audit_context_source: source,
        decision_evidence_source: source,
        punch_source: source,
        session_source: source,
        outbox_source_channel: source,
      });
    },
  );

  it("replays mobile_offline by durable client_event_id without duplicate mutations", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const clientEventId = testClientEventId(300);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });
    const service = new AttendanceCommandService(app.store);
    const input = {
      actor: employee.user,
      companyId,
      timeZone: "Asia/Kolkata",
      idempotencyKey: clientEventId,
      clientEnvelope: {
        clientEventId,
        capturedAt: "2026-08-03T09:00:00.000+05:30",
        device: {
          registered_device_id: registeredDeviceId,
          platform: "android" as const,
          app_version: "2026.08.03",
        },
      },
      command: {
        event_type: "check_in" as const,
        work_mode: "office" as const,
        source: "mobile_offline" as const,
        metadata: {},
      },
      isWorkingDayFor: () => true,
    };

    const first = await service.execute(input);
    const replay = await service.execute(input);

    expect(isAttendanceReplayResponse(replay)).toBe(true);
    expect(replay).toEqual(JSON.parse(JSON.stringify(first)));

    const counts = await app.store.pgPool!.query<{
      commands: string;
      events: string;
      audit_decisions: string;
      command_decisions: string;
      sessions: string;
      punches: string;
      outbox_events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM attendance.command_executions WHERE client_event_id = $1) AS commands,
        (SELECT count(*) FROM attendance.attendance_events) AS events,
        (SELECT count(*) FROM attendance.attendance_decisions) AS audit_decisions,
        (SELECT count(*) FROM attendance.command_decisions) AS command_decisions,
        (SELECT count(*) FROM attendance.sessions) AS sessions,
        (SELECT count(*) FROM attendance.punch_events) AS punches,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type = 'attendance') AS outbox_events`,
      [clientEventId],
    );

    expect(counts.rows[0]).toEqual({
      commands: "1",
      events: "1",
      audit_decisions: "1",
      command_decisions: "1",
      sessions: "1",
      punches: "1",
      outbox_events: "1",
    });
  });
});
