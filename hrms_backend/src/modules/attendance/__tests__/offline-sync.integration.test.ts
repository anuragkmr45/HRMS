import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION } from "../offline-sync-contract.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("attendance offline sync ingestion", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
    await clearAttendanceRuntimeFixtures(app);
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

  it("accepts an unverified provisional event without live attendance mutation", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });

    const response = await sync(app, employee.token, batch(registeredDeviceId, [
      event({ sequence: 42 }),
    ]));

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toMatchObject({
      sequence: 42,
      sync_status: "accepted",
      verification_status: "unverified",
      replayed: false,
      reason_code: "offline_sync.accepted_unverified",
      payroll_eligible: false,
    });
    await expectCounts(app, {
      inbox: "1",
      events: "1",
      locationEvidence: "1",
      sessions: "0",
      punches: "0",
      dailyRecords: "0",
      provisionalOutbox: "1",
    });
  });

  it("replays the same event without duplicating durable rows or outbox", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });
    const payload = batch(registeredDeviceId, [event({ sequence: 7 })]);

    const first = await sync(app, employee.token, payload);
    const replay = await sync(app, employee.token, payload);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().results[0]).toMatchObject({
      client_event_id: first.json().results[0].client_event_id,
      sequence: 7,
      sync_status: "replayed",
      verification_status: "unverified",
      replayed: true,
      reason_code: "offline_sync.replayed",
      server_received_at: first.json().results[0].server_received_at,
    });
    await expectCounts(app, {
      inbox: "1",
      events: "1",
      locationEvidence: "1",
      sessions: "0",
      punches: "0",
      dailyRecords: "0",
      provisionalOutbox: "1",
    });
  });

  it("returns changed-body conflict for reused client_event_id", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });
    const clientEventId = randomUUID();

    const first = await sync(app, employee.token, batch(registeredDeviceId, [
      event({ client_event_id: clientEventId, sequence: 1, event_type: "check_in" }),
    ]));
    const changed = await sync(app, employee.token, batch(registeredDeviceId, [
      event({ client_event_id: clientEventId, sequence: 1, event_type: "check_out" }),
    ]));

    expect(first.statusCode).toBe(200);
    expect(changed.statusCode).toBe(200);
    expect(changed.json().results[0]).toMatchObject({
      sync_status: "conflict",
      verification_status: "rejected",
      reason_code: "offline_sync.changed_body_conflict",
    });
    await expectCounts(app, {
      inbox: "1",
      events: "1",
      locationEvidence: "1",
      sessions: "0",
      punches: "0",
      dailyRecords: "0",
      provisionalOutbox: "1",
    });
  });

  it("rejects a different event that reuses a device sequence", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });

    await sync(app, employee.token, batch(registeredDeviceId, [event({ sequence: 5 })]));
    const duplicate = await sync(app, employee.token, batch(registeredDeviceId, [
      event({ sequence: 5, client_event_id: randomUUID() }),
    ]));

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().results[0]).toMatchObject({
      sync_status: "rejected",
      verification_status: "rejected",
      reason_code: "offline_sync.duplicate_sequence",
    });
    await expectCounts(app, {
      inbox: "1",
      events: "1",
      locationEvidence: "1",
      sessions: "0",
      punches: "0",
      dailyRecords: "0",
      provisionalOutbox: "1",
    });
  });

  it("classifies sequence gap and out-of-order arrivals", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });

    await sync(app, employee.token, batch(registeredDeviceId, [event({ sequence: 1 })]));
    const gap = await sync(app, employee.token, batch(registeredDeviceId, [
      event({ sequence: 3 }),
    ]));
    const outOfOrder = await sync(app, employee.token, batch(registeredDeviceId, [
      event({ sequence: 2 }),
    ]));

    expect(gap.json().results[0]).toMatchObject({
      sync_status: "deferred",
      verification_status: "review_required",
      reason_code: "offline_sync.sequence_gap",
    });
    expect(outOfOrder.json().results[0]).toMatchObject({
      sync_status: "deferred",
      verification_status: "review_required",
      reason_code: "offline_sync.sequence_out_of_order",
    });
    await expectCounts(app, {
      inbox: "3",
      events: "3",
      locationEvidence: "3",
      sessions: "0",
      punches: "0",
      dailyRecords: "0",
      provisionalOutbox: "1",
    });
  });

  it("preserves request order in a mixed batch", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });
    const replayedEvent = event({ sequence: 10 });
    await sync(app, employee.token, batch(registeredDeviceId, [replayedEvent]));

    const response = await sync(app, employee.token, batch(registeredDeviceId, [
      replayedEvent,
      event({ sequence: 12 }),
      event({ sequence: 11 }),
    ]));

    expect(response.statusCode).toBe(200);
    expect(response.json().results.map((result: { sequence: number }) => result.sequence)).toEqual([10, 12, 11]);
    expect(response.json().results.map((result: { sync_status: string }) => result.sync_status)).toEqual([
      "replayed",
      "accepted",
      "accepted",
    ]);
  });

  it("requires registered_device_id and enforces device lifecycle", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const suspendedDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
      status: "suspended",
    });
    const revokedDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
      status: "revoked",
    });

    const missing = await sync(app, employee.token, batch(undefined, [event({ sequence: 1 })]));
    const suspended = await sync(app, employee.token, batch(suspendedDeviceId, [event({ sequence: 1 })]));
    const revoked = await sync(app, employee.token, batch(revokedDeviceId, [event({ sequence: 1 })]));

    expect(missing.statusCode).toBe(400);
    expect(missing.json().details.reason_code).toBe("mobile_registered_device_required");
    expect(suspended.statusCode).toBe(409);
    expect(suspended.json().details.reason_code).toBe("mobile_registered_device_suspended");
    expect(revoked.statusCode).toBe(409);
    expect(revoked.json().details.reason_code).toBe("mobile_registered_device_revoked");
    await expectCounts(app, {
      inbox: "0",
      events: "0",
      locationEvidence: "0",
      sessions: "0",
      punches: "0",
      dailyRecords: "0",
      provisionalOutbox: "0",
    });
  });

  it("fails closed for unowned devices and isolates tenants", async () => {
    const employee = await loginAs(app, "E1");
    const peer = await loginAs(app, "E2");
    const employeeCompany = employeeCompanyId(app, employee.user.id);
    const peerCompany = employeeCompanyId(app, peer.user.id);
    const peerDeviceId = await insertRegisteredDevice(app, {
      companyId: peerCompany,
      userId: peer.user.id,
    });
    const sameCompanyPeerDeviceId = await insertRegisteredDevice(app, {
      companyId: employeeCompany,
      userId: peer.user.id,
    });

    const crossTenant = await sync(app, employee.token, batch(peerDeviceId, [event({ sequence: 1 })]));
    const unowned = await sync(app, employee.token, batch(sameCompanyPeerDeviceId, [event({ sequence: 1 })]));

    expect(crossTenant.statusCode).toBe(409);
    expect(crossTenant.json().details.reason_code).toBe("mobile_registered_device_unavailable");
    expect(unowned.statusCode).toBe(409);
    expect(unowned.json().details.reason_code).toBe("mobile_registered_device_unavailable");
  });

  it("handles concurrent requests for the same client_event_id safely", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });
    const payload = batch(registeredDeviceId, [event({ client_event_id: randomUUID(), sequence: 1 })]);

    const [first, second] = await Promise.all([
      sync(app, employee.token, payload),
      sync(app, employee.token, payload),
    ]);

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect([first.json().results[0].sync_status, second.json().results[0].sync_status].sort()).toEqual([
      "accepted",
      "replayed",
    ]);
    await expectCounts(app, {
      inbox: "1",
      events: "1",
      locationEvidence: "1",
      sessions: "0",
      punches: "0",
      dailyRecords: "0",
      provisionalOutbox: "1",
    });
  });

  it("keeps existing batch schema limits and duplicate validation", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = employeeCompanyId(app, employee.user.id);
    const registeredDeviceId = await insertRegisteredDevice(app, {
      companyId,
      userId: employee.user.id,
    });
    const oversized = await sync(app, employee.token, batch(
      registeredDeviceId,
      Array.from({ length: 51 }, (_, index) => event({ sequence: index + 1 })),
    ));
    const duplicateInBatch = await sync(app, employee.token, batch(registeredDeviceId, [
      event({ sequence: 1 }),
      event({ sequence: 1 }),
    ]));

    expect(oversized.statusCode).toBe(400);
    expect(duplicateInBatch.statusCode).toBe(400);
  });
});

function batch(
  registeredDeviceId: string | undefined,
  events: Array<Record<string, unknown>>,
) {
  return {
    contract_version: ATTENDANCE_OFFLINE_SYNC_CONTRACT_VERSION,
    batch_id: randomUUID(),
    device: {
      ...(registeredDeviceId ? { registered_device_id: registeredDeviceId } : {}),
      device_id: "mobile-installation-handle",
      platform: "android",
      app_version: "2026.08.03",
      os_version: "Android 15",
    },
    events,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    client_event_id: randomUUID(),
    sequence: 1,
    command_kind: "employee_manual_now",
    captured_at: "2026-08-03T09:00:00.000+05:30",
    source: "mobile_offline",
    event_type: "check_in",
    work_mode: "office",
    metadata: {
      network_state: "offline",
      capture_method: "user_action",
      client_timezone: "Asia/Calcutta",
    },
    location: {
      latitude: 12.971599,
      longitude: 77.594566,
      accuracy_meters: 18,
      captured_at: "2026-08-03T08:59:58.000Z",
      provider: "device",
      permission_state: "granted",
    },
    ...overrides,
  };
}

async function sync(
  app: TestApp,
  token: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/attendance/offline-sync",
    headers: authHeader(token),
    payload,
  });
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
    .update(`offline-sync:${randomUUID()}`)
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

function employeeCompanyId(app: TestApp, employeeUserId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employeeUserId,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return companyId;
}

async function clearAttendanceRuntimeFixtures(app: TestApp): Promise<void> {
  await app.store.pgPool!.query(`
    TRUNCATE TABLE
      attendance.offline_event_inbox,
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.punch_events,
      attendance.command_decisions,
      attendance.command_executions,
      attendance.employee_command_states,
      attendance.break_segments,
      attendance.sessions,
      attendance.daily_records
    RESTART IDENTITY CASCADE
  `);
  await app.store.pgPool!.query(`
    DELETE FROM platform.outbox_events
    WHERE aggregate_type = 'attendance'
  `);
  await app.store.pgPool!.query(`
    DELETE FROM platform.idempotency_keys
    WHERE scope LIKE 'attendance.punch:%'
  `);
}

async function expectCounts(
  app: TestApp,
  expected: {
    inbox: string;
    events: string;
    locationEvidence: string;
    sessions: string;
    punches: string;
    dailyRecords: string;
    provisionalOutbox: string;
  },
): Promise<void> {
  const counts = await app.store.pgPool!.query<{
    inbox: string;
    events: string;
    location_evidence: string;
    sessions: string;
    punches: string;
    daily_records: string;
    provisional_outbox: string;
  }>(
    `SELECT
      (SELECT count(*) FROM attendance.offline_event_inbox) AS inbox,
      (SELECT count(*) FROM attendance.attendance_events) AS events,
      (SELECT count(*) FROM attendance.location_evidence) AS location_evidence,
      (SELECT count(*) FROM attendance.sessions) AS sessions,
      (SELECT count(*) FROM attendance.punch_events) AS punches,
      (SELECT count(*) FROM attendance.daily_records) AS daily_records,
      (SELECT count(*) FROM platform.outbox_events WHERE event_type = 'attendance.provisional.recorded') AS provisional_outbox`,
  );
  expect(counts.rows[0]).toEqual({
    inbox: expected.inbox,
    events: expected.events,
    location_evidence: expected.locationEvidence,
    sessions: expected.sessions,
    punches: expected.punches,
    daily_records: expected.dailyRecords,
    provisional_outbox: expected.provisionalOutbox,
  });
}
