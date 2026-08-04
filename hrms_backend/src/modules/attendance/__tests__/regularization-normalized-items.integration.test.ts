import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("regularization normalized items and actions", () => {
  let app: FastifyInstance;

  function restoreDatabaseUrl(): void {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }

  async function reopenWithoutReset(): Promise<void> {
    await app.close();
    restoreDatabaseUrl();
    app = await buildRealApp({ reset: false });
    await app.ready();
  }

  const forbiddenPayloadKeys = new Set([
    "latitude",
    "longitude",
    "lat",
    "lng",
    "coordinates",
    "coordinate",
    "geometry",
    "geography",
    "location",
    "location_evidence",
    "accuracy",
    "distance",
    "altitude",
    "raw_payload",
    "request_snapshot",
    "response_snapshot",
    "metadata",
    "reason",
    "remarks",
    "requested_punches",
  ]);

  function expectNoForbiddenPayloadKeys(value: unknown, path: string[] = []): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => expectNoForbiddenPayloadKeys(item, [...path, String(index)]));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.trim().toLowerCase().replaceAll("-", "_");
      expect(
        forbiddenPayloadKeys.has(normalized),
        `Forbidden payload key ${[...path, key].join(".")}`,
      ).toBe(false);
      expectNoForbiddenPayloadKeys(nested, [...path, key]);
    }
  }

  async function outboxRows(input: { aggregateId: string; eventType: string }) {
    return (await app.store.pgPool!.query<{
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT aggregate_id, event_type, payload
         FROM platform.outbox_events
        WHERE aggregate_id = $1 AND event_type = $2
        ORDER BY id`,
      [input.aggregateId, input.eventType],
    )).rows;
  }

  function companyIdFor(userId: string): string {
    const companyId = app.store.userSessionPreferences.find(
      (preference) => preference.user_id === userId,
    )?.company_id;
    if (!companyId) throw new Error("Company fixture was not found.");
    return companyId;
  }

  async function insertPunchFixture(input: {
    id?: string;
    companyId: string;
    employeeUserId: string;
    actorUserId?: string;
    eventType?: "check_in" | "check_out";
    occurredAt: string;
  }): Promise<string> {
    const punchId = input.id ?? randomUUID();
    const actorUserId = input.actorUserId ?? input.employeeUserId;
    const eventType = input.eventType ?? "check_in";
    await app.store.pgPool!.query(
      `INSERT INTO attendance.punch_events (
         id, company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,'office','web','employee_manual_now','{}')`,
      [punchId, input.companyId, input.employeeUserId, actorUserId, eventType, input.occurredAt],
    );
    app.store.attendancePunches.push({
      id: punchId,
      company_id: input.companyId,
      employee_user_id: input.employeeUserId,
      actor_user_id: actorUserId,
      event_type: eventType,
      occurred_at: input.occurredAt,
      work_mode: "office",
      source: "web",
      origin: "employee_manual_now",
      regularization_request_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
      deleted_at: null,
    });
    return punchId;
  }

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      restoreDatabaseUrl();
    }
  });

  it("persists legacy punches as immutable ADD items with a submitted action", async () => {
    const employee = await loginAs(app, "E1");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-19",
        reason: "Missed morning punch",
        requested_punches: [{ event_type: "check_in", occurred_at: "2026-05-19T03:30:00.000Z" }],
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      requested_punches: [{ event_type: "check_in", occurred_at: "2026-05-19T03:30:00.000Z" }],
      items: [{ ordinal: 0, operation: "add", target_punch_event_id: null, event_type: "check_in" }],
    });

    const pool = app.store.pgPool!;
    const item = (await pool.query(
      `SELECT * FROM attendance.regularization_request_items WHERE regularization_request_id = $1`,
      [response.json().id],
    )).rows[0];
    const action = (await pool.query(
      `SELECT * FROM attendance.regularization_actions WHERE regularization_request_id = $1`,
      [response.json().id],
    )).rows[0];
    expect(item).toMatchObject({ operation: "add", ordinal: 0, target_punch_event_id: null, event_type: "check_in" });
    expect(action).toMatchObject({ action_kind: "submitted", previous_state: null, resulting_state: "pending", resulting_version: 1 });
    await expect(pool.query(
      `UPDATE attendance.regularization_request_items SET ordinal = 1 WHERE id = $1`,
      [item.id],
    )).rejects.toThrow(/immutable/iu);
    await expect(pool.query(
      `DELETE FROM attendance.regularization_actions WHERE id = $1`,
      [action.id],
    )).rejects.toThrow(/immutable/iu);

    await pool.query(
      `UPDATE attendance.regularization_requests
       SET requested_punches = '[{"event_type":"check_out","occurred_at":"2026-05-19T12:00:00.000Z"}]'::jsonb
       WHERE id = $1`,
      [response.json().id],
    );
    const manager = await loginAs(app, "D1");
    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${response.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await pool.query(
      `SELECT event_type, occurred_at FROM attendance.punch_events
       WHERE regularization_request_id = $1`,
      [response.json().id],
    )).rows).toMatchObject([{
      event_type: "check_in",
      occurred_at: new Date("2026-05-19T03:30:00.000Z"),
    }]);
  });

  it("backfills legacy JSON in deterministic order and reconstructs only provable actions", async () => {
    const employee = app.store.users.find((user) => user.employee_code === "E1")!;
    const manager = app.store.users.find((user) => user.employee_code === "D1")!;
    const companyId = app.store.userSessionPreferences.find((preference) => preference.user_id === employee.id)!.company_id;
    const requestId = randomUUID();
    const pool = app.store.pgPool!;
    await pool.query(
      `INSERT INTO attendance.regularization_requests (
         id, company_id, employee_user_id, submitted_by_user_id, work_date, reason,
         requested_punches, status, current_approver_user_id, version
       ) VALUES ($1,$2,$3,$3,'2026-05-18','Legacy request',$4::jsonb,'pending',$5,1)`,
      [
        requestId,
        companyId,
        employee.id,
        JSON.stringify([
          { event_type: "check_in", occurred_at: "2026-05-18T03:30:00.000Z" },
          { event_type: "check_out", occurred_at: "2026-05-18T12:30:00.000Z" },
        ]),
        manager.id,
      ],
    );

    await pool.query(readFileSync("src/db/migrations/0040_regularization_normalized_items_actions.sql", "utf8"));
    const items = (await pool.query(
      `SELECT ordinal, operation, event_type FROM attendance.regularization_request_items
       WHERE regularization_request_id = $1 ORDER BY ordinal`,
      [requestId],
    )).rows;
    const actions = (await pool.query(
      `SELECT action_kind, resulting_version, migration_reconstructed
       FROM attendance.regularization_actions WHERE regularization_request_id = $1`,
      [requestId],
    )).rows;
    expect(items).toEqual([
      { ordinal: 0, operation: "add", event_type: "check_in" },
      { ordinal: 1, operation: "add", event_type: "check_out" },
    ]);
    expect(actions).toEqual([{ action_kind: "submitted", resulting_version: 1, migration_reconstructed: true }]);

    await reopenWithoutReset();
    const reloadedEmployee = await loginAs(app, "E1");
    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/regularizations/my?date_from=2026-05-18&date_to=2026-05-18&page=1&page_size=20",
      headers: authHeader(reloadedEmployee.token),
    });
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json().items).toContainEqual(expect.objectContaining({
      id: requestId,
      items: [
        expect.objectContaining({ ordinal: 0, operation: "add", event_type: "check_in" }),
        expect.objectContaining({ ordinal: 1, operation: "add", event_type: "check_out" }),
      ],
    }));
  });

  it("enforces ADD, REPLACE, and VOID item shapes in PostgreSQL", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = app.store.userSessionPreferences.find((preference) => preference.user_id === employee.user.id)!.company_id!;
    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-14",
        reason: "Constraint fixture",
        items: [{ operation: "add", event_type: "check_in", occurred_at: "2026-05-14T03:30:00.000Z" }],
      },
    });
    expect(request.statusCode, request.body).toBe(200);
    const targetId = randomUUID();
    const pool = app.store.pgPool!;
    await pool.query(
      `INSERT INTO attendance.punch_events (
         id, company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, metadata
       ) VALUES ($1,$2,$3,$3,'check_in','2026-05-14T03:00:00.000Z','office','web','employee_manual_now','{}')`,
      [targetId, companyId, employee.user.id],
    );

    const insertItem = (operation: string, target: string | null, eventType: string | null, occurredAt: string | null) =>
      pool.query(
        `INSERT INTO attendance.regularization_request_items (
           company_id, regularization_request_id, ordinal, operation,
           target_punch_event_id, event_type, occurred_at
         ) VALUES ($1,$2,1,$3,$4,$5,$6)`,
        [companyId, request.json().id, operation, target, eventType, occurredAt],
      );
    await expect(insertItem("add", targetId, "check_in", "2026-05-14T04:00:00.000Z"))
      .rejects.toThrow(/operation_shape/iu);
    await expect(insertItem("replace", null, "check_in", "2026-05-14T04:00:00.000Z"))
      .rejects.toThrow(/operation_shape/iu);
    await expect(insertItem("void", targetId, "check_in", "2026-05-14T04:00:00.000Z"))
      .rejects.toThrow(/operation_shape/iu);
  });

  it("applies REPLACE then VOID append-only and prevents reusing a corrected target", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const companyId = app.store.userSessionPreferences.find((preference) => preference.user_id === employee.user.id)!.company_id!;
    const targetId = randomUUID();
    const pool = app.store.pgPool!;
    await pool.query(
      `INSERT INTO attendance.punch_events (
         id, company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, metadata
       ) VALUES ($1,$2,$3,$3,'check_in','2026-05-20T03:30:00.000Z','office','web','employee_manual_now','{}')`,
      [targetId, companyId, employee.user.id],
    );
    app.store.attendancePunches.push({
      id: targetId,
      company_id: companyId,
      employee_user_id: employee.user.id,
      actor_user_id: employee.user.id,
      event_type: "check_in",
      occurred_at: "2026-05-20T03:30:00.000Z",
      work_mode: "office",
      source: "web",
      origin: "employee_manual_now",
      regularization_request_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
      deleted_at: null,
    });

    const replace = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-20",
        reason: "Correct morning punch",
        items: [{
          operation: "replace",
          target_punch_event_id: targetId,
          event_type: "check_in",
          occurred_at: "2026-05-20T04:00:00.000Z",
        }],
      },
    });
    expect(replace.statusCode, replace.body).toBe(200);
    expect(replace.json().requested_punches).toEqual([{
      event_type: "check_in",
      occurred_at: "2026-05-20T04:00:00.000Z",
    }]);
    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${replace.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const repeatedApproval = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${replace.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(repeatedApproval.statusCode).toBe(409);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_actions
       WHERE regularization_request_id = $1 AND action_kind = 'approved'`,
      [replace.json().id],
    )).rows[0].count).toBe(1);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_correction_applications
       WHERE regularization_request_id = $1`,
      [replace.json().id],
    )).rows[0].count).toBe(1);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE regularization_request_id = $1`,
      [replace.json().id],
    )).rows[0].count).toBe(1);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM platform.outbox_events
       WHERE aggregate_id = $1 AND event_type = 'attendance.regularization.approved'`,
      [replace.json().id],
    )).rows[0].count).toBe(1);

    const firstApplication = (await pool.query(
      `SELECT * FROM attendance.regularization_correction_applications
       WHERE regularization_request_id = $1`,
      [replace.json().id],
    )).rows[0];
    expect(firstApplication).toMatchObject({ operation: "replace", target_punch_event_id: targetId });
    expect(firstApplication.replacement_punch_event_id).toBeTruthy();
    expect(firstApplication.regularization_action_id).toBeTruthy();
    expect((await pool.query(
      `SELECT action.action_kind, action.actor_user_id, action.subject_employee_user_id,
              item.operation AS item_operation, item.target_punch_event_id AS item_target,
              application.applied_by_user_id, application.attendance_event_id
       FROM attendance.regularization_correction_applications application
       JOIN attendance.regularization_actions action
         ON action.id = application.regularization_action_id
        AND action.regularization_request_id = application.regularization_request_id
        AND action.company_id = application.company_id
       JOIN attendance.regularization_request_items item
         ON item.id = application.regularization_request_item_id
        AND item.company_id = application.company_id
       WHERE application.id = $1`,
      [firstApplication.id],
    )).rows[0]).toMatchObject({
      action_kind: "approved",
      actor_user_id: manager.user.id,
      subject_employee_user_id: employee.user.id,
      item_operation: "replace",
      item_target: targetId,
      applied_by_user_id: manager.user.id,
    });
    await expect(pool.query(
      `UPDATE attendance.regularization_correction_applications SET applied_at = now() WHERE id = $1`,
      [firstApplication.id],
    )).rejects.toThrow(/immutable/iu);
    await expect(pool.query(
      `DELETE FROM attendance.regularization_correction_applications WHERE id = $1`,
      [firstApplication.id],
    )).rejects.toThrow(/immutable/iu);
    expect((await pool.query(`SELECT count(*)::int AS count FROM attendance.punch_events WHERE id = $1`, [targetId])).rows[0].count).toBe(1);

    const duplicateTarget = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-20",
        reason: "Attempt duplicate correction",
        items: [{ operation: "void", target_punch_event_id: targetId }],
      },
    });
    expect(duplicateTarget.statusCode).toBe(409);

    const voidRequest = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-20",
        reason: "Void replacement punch",
        items: [{ operation: "void", target_punch_event_id: firstApplication.replacement_punch_event_id }],
      },
    });
    expect(voidRequest.statusCode, voidRequest.body).toBe(200);
    expect(voidRequest.json().requested_punches).toEqual([]);
    const voided = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${voidRequest.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(voided.statusCode, voided.body).toBe(200);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE id IN ($1, $2)`,
      [targetId, firstApplication.replacement_punch_event_id],
    )).rows[0].count).toBe(2);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_correction_applications
       WHERE regularization_request_id IN ($1, $2)`,
      [replace.json().id, voidRequest.json().id],
    )).rows[0].count).toBe(2);
  });

  it("allows one deterministic winner for concurrent approval", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-16",
        reason: "Concurrent approval check",
        items: [{ operation: "add", event_type: "check_in", occurred_at: "2026-05-16T03:30:00.000Z" }],
      },
    });
    expect(request.statusCode, request.body).toBe(200);

    const decisions = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
        headers: authHeader(manager.token),
        payload: { decision: "approve", expected_version: 1 },
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
        headers: authHeader(manager.token),
        payload: { decision: "approve", expected_version: 1 },
      }),
    ]);
    expect(
      decisions.map((response) => response.statusCode).sort(),
      decisions.map((response) => response.body).join("\n"),
    ).toEqual([200, 409]);

    const pool = app.store.pgPool!;
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_actions
       WHERE regularization_request_id = $1 AND action_kind = 'approved'`,
      [request.json().id],
    )).rows[0].count).toBe(1);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_correction_applications
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(1);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(1);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM platform.outbox_events
       WHERE aggregate_id = $1 AND event_type = 'attendance.regularization.approved'`,
      [request.json().id],
    )).rows[0].count).toBe(1);
  });

  it("rejects non-approver and self regularization decisions without side effects", async () => {
    const employee = await loginAs(app, "E1");
    const peer = await loginAs(app, "E2");
    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-24",
        reason: "Unauthorized decision check",
        items: [{ operation: "add", event_type: "check_in", occurred_at: "2026-05-24T03:30:00.000Z" }],
      },
    });
    expect(request.statusCode, request.body).toBe(200);

    const peerDecision = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(peer.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(peerDecision.statusCode).toBe(403);

    const selfDecision = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(employee.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(selfDecision.statusCode).toBe(403);

    const pool = app.store.pgPool!;
    expect((await pool.query(
      `SELECT status, version FROM attendance.regularization_requests WHERE id = $1`,
      [request.json().id],
    )).rows[0]).toMatchObject({ status: "pending", version: 1 });
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_actions
       WHERE regularization_request_id = $1 AND action_kind <> 'submitted'`,
      [request.json().id],
    )).rows[0].count).toBe(0);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(0);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM platform.outbox_events
       WHERE aggregate_id = $1 AND event_type = 'attendance.regularization.approved'`,
      [request.json().id],
    )).rows[0].count).toBe(0);
  });

  it("rejects regularization items targeting another employee or company before creating a request", async () => {
    const employee = await loginAs(app, "E1");
    const otherEmployee = await loginAs(app, "E2");
    const companyId = companyIdFor(employee.user.id);
    const otherEmployeePunchId = await insertPunchFixture({
      companyId,
      employeeUserId: otherEmployee.user.id,
      occurredAt: "2026-05-25T03:30:00.000Z",
    });
    const foreignCompanyPunchId = await insertPunchFixture({
      companyId: randomUUID(),
      employeeUserId: employee.user.id,
      occurredAt: "2026-05-26T03:30:00.000Z",
    });
    const outboxBefore = app.store.outbox.length;

    const otherEmployeeTarget = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-25",
        reason: "Target another employee",
        items: [{
          operation: "replace",
          target_punch_event_id: otherEmployeePunchId,
          event_type: "check_in",
          occurred_at: "2026-05-25T04:00:00.000Z",
        }],
      },
    });
    expect(otherEmployeeTarget.statusCode).toBe(400);
    expect(otherEmployeeTarget.body).toContain("Target punch does not belong to the regularization employee.");

    const foreignCompanyTarget = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-26",
        reason: "Target foreign company punch",
        items: [{
          operation: "replace",
          target_punch_event_id: foreignCompanyPunchId,
          event_type: "check_in",
          occurred_at: "2026-05-26T04:00:00.000Z",
        }],
      },
    });
    expect(foreignCompanyTarget.statusCode).toBe(400);
    expect(foreignCompanyTarget.body).toContain("Target punch does not belong to the active company.");
    expect(app.store.outbox).toHaveLength(outboxBefore);
  });

  it("authorizes regularization decisions against the locked database row", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const peer = await loginAs(app, "E2");
    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-27",
        reason: "Approver race check",
        items: [{ operation: "add", event_type: "check_in", occurred_at: "2026-05-27T03:30:00.000Z" }],
      },
    });
    expect(request.statusCode, request.body).toBe(200);
    expect(app.store.attendanceRegularizations.find(
      (candidate) => candidate.id === request.json().id,
    )?.current_approver_user_id).toBe(manager.user.id);

    await app.store.pgPool!.query(
      `UPDATE attendance.regularization_requests
          SET current_approver_user_id = $1
        WHERE id = $2`,
      [peer.user.id, request.json().id],
    );

    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(denied.statusCode, denied.body).toBe(403);

    const pool = app.store.pgPool!;
    expect((await pool.query(
      `SELECT status, version, current_approver_user_id
         FROM attendance.regularization_requests
        WHERE id = $1`,
      [request.json().id],
    )).rows[0]).toMatchObject({
      status: "pending",
      version: 1,
      current_approver_user_id: peer.user.id,
    });
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_actions
       WHERE regularization_request_id = $1 AND action_kind = 'approved'`,
      [request.json().id],
    )).rows[0].count).toBe(0);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(0);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM platform.outbox_events
       WHERE aggregate_id = $1 AND event_type = 'attendance.regularization.approved'`,
      [request.json().id],
    )).rows[0].count).toBe(0);
  });

  it("allows only one concurrent correction across requests targeting the same punch", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = app.store.userSessionPreferences.find((preference) => preference.user_id === employee.user.id)!.company_id!;
    const manager = app.store.users.find((user) => user.employee_code === "D1")!;
    const targetId = randomUUID();
    const pool = app.store.pgPool!;
    await pool.query(
      `INSERT INTO attendance.punch_events (
         id, company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, metadata
       ) VALUES ($1,$2,$3,$3,'check_in','2026-05-13T03:30:00.000Z','office','web','employee_manual_now','{}')`,
      [targetId, companyId, employee.user.id],
    );
    app.store.attendancePunches.push({
      id: targetId,
      company_id: companyId,
      employee_user_id: employee.user.id,
      actor_user_id: employee.user.id,
      event_type: "check_in",
      occurred_at: "2026-05-13T03:30:00.000Z",
      work_mode: "office",
      source: "web",
      origin: "employee_manual_now",
      regularization_request_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
      deleted_at: null,
    });
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-13",
        reason: "First target correction",
        items: [{
          operation: "replace",
          target_punch_event_id: targetId,
          event_type: "check_in",
          occurred_at: "2026-05-13T04:00:00.000Z",
        }],
      },
    });
    expect(first.statusCode, first.body).toBe(200);

    const secondRequestId = randomUUID();
    const secondItemId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO attendance.regularization_requests (
           id, company_id, employee_user_id, submitted_by_user_id, work_date, reason,
           requested_punches, status, current_approver_user_id, version
         ) VALUES ($1,$2,$3,$3,'2026-05-13','Second target correction',$4::jsonb,'pending',$5,1)`,
        [
          secondRequestId,
          companyId,
          employee.user.id,
          JSON.stringify([{ event_type: "check_in", occurred_at: "2026-05-13T04:15:00.000Z" }]),
          manager.id,
        ],
      );
      await client.query(
        `INSERT INTO attendance.regularization_request_items (
           id, company_id, regularization_request_id, ordinal, operation,
           target_punch_event_id, event_type, occurred_at
         ) VALUES ($1,$2,$3,0,'replace',$4,'check_in','2026-05-13T04:15:00.000Z')`,
        [secondItemId, companyId, secondRequestId, targetId],
      );
      await client.query(
        `INSERT INTO attendance.regularization_actions (
           company_id, regularization_request_id, actor_user_id, subject_employee_user_id,
           action_kind, previous_state, resulting_state, resulting_version
         ) VALUES ($1,$2,$3,$3,'submitted',NULL,'pending',1)`,
        [companyId, secondRequestId, employee.user.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await reopenWithoutReset();
    const reloadedManager = await loginAs(app, "D1");
    const requestIds = [first.json().id, secondRequestId];
    const decisions = await Promise.all(requestIds.map((requestId) => app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${requestId}/decision`,
      headers: authHeader(reloadedManager.token),
      payload: { decision: "approve", expected_version: 1 },
    })));
    expect(
      decisions.map((response) => response.statusCode).sort(),
      decisions.map((response) => response.body).join("\n"),
    ).toEqual([200, 409]);
    const losingRequestId = requestIds[decisions.findIndex((response) => response.statusCode === 409)]!;

    const reloadedPool = app.store.pgPool!;
    expect((await reloadedPool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_correction_applications
       WHERE target_punch_event_id = $1`,
      [targetId],
    )).rows[0].count).toBe(1);
    expect((await reloadedPool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE regularization_request_id = ANY($1::uuid[])`,
      [requestIds],
    )).rows[0].count).toBe(1);
    expect((await reloadedPool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_actions
       WHERE regularization_request_id = ANY($1::uuid[]) AND action_kind = 'approved'`,
      [requestIds],
    )).rows[0].count).toBe(1);
    expect((await reloadedPool.query(
      `SELECT count(*)::int AS count FROM platform.outbox_events
       WHERE aggregate_id = ANY($1::uuid[]) AND event_type = 'attendance.regularization.approved'`,
      [requestIds],
    )).rows[0].count).toBe(1);
    expect((await reloadedPool.query(
      `SELECT status, version FROM attendance.regularization_requests WHERE id = $1`,
      [losingRequestId],
    )).rows[0]).toMatchObject({ status: "pending", version: 1 });
  });

  it("emits safe approved and rejected regularization decision events once", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const approvedRequest = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-21",
        reason: "Approval event payload check",
        items: [
          { operation: "add", event_type: "check_in", occurred_at: "2026-05-21T03:30:00.000Z" },
          { operation: "add", event_type: "check_out", occurred_at: "2026-05-21T12:30:00.000Z" },
        ],
      },
    });
    expect(approvedRequest.statusCode, approvedRequest.body).toBe(200);
    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${approvedRequest.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const rejectedRequest = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-22",
        reason: "Rejected event payload check",
        items: [{ operation: "add", event_type: "check_in", occurred_at: "2026-05-22T03:30:00.000Z" }],
      },
    });
    expect(rejectedRequest.statusCode, rejectedRequest.body).toBe(200);
    const rejected = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${rejectedRequest.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "reject", remarks: "Insufficient evidence", expected_version: 1 },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const repeatedReject = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${rejectedRequest.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "reject", remarks: "Insufficient evidence", expected_version: 1 },
    });
    expect(repeatedReject.statusCode).toBe(409);

    const approvedRows = await outboxRows({
      aggregateId: approvedRequest.json().id,
      eventType: "attendance.regularization.approved",
    });
    const rejectedRows = await outboxRows({
      aggregateId: rejectedRequest.json().id,
      eventType: "attendance.regularization.rejected",
    });
    expect(approvedRows).toHaveLength(1);
    expect(rejectedRows).toHaveLength(1);
    expect(approvedRows[0]!.payload).toMatchObject({
      company_id: approved.json().company_id,
      regularization_request_id: approvedRequest.json().id,
      next_status: "approved",
      version: 2,
    });
    expect(rejectedRows[0]!.payload).toMatchObject({
      company_id: rejected.json().company_id,
      regularization_request_id: rejectedRequest.json().id,
      next_status: "rejected",
      version: 2,
    });
    expectNoForbiddenPayloadKeys(approvedRows[0]!.payload);
    expectNoForbiddenPayloadKeys(rejectedRows[0]!.payload);
  });

  it("rolls back request state when action insertion fails", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const companyId = app.store.userSessionPreferences.find((preference) => preference.user_id === employee.user.id)!.company_id!;
    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-15",
        reason: "Rollback approval check",
        items: [{ operation: "add", event_type: "check_in", occurred_at: "2026-05-15T03:30:00.000Z" }],
      },
    });
    expect(request.statusCode, request.body).toBe(200);
    const pool = app.store.pgPool!;
    await pool.query(
      `INSERT INTO attendance.regularization_actions (
         company_id, regularization_request_id, actor_user_id, subject_employee_user_id,
         action_kind, previous_state, resulting_state, resulting_version
       ) VALUES ($1,$2,$3,$4,'approved','pending','approved',2)`,
      [companyId, request.json().id, manager.user.id, employee.user.id],
    );

    const failed = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);
    expect((await pool.query(
      `SELECT status, version FROM attendance.regularization_requests WHERE id = $1`,
      [request.json().id],
    )).rows[0]).toMatchObject({ status: "pending", version: 1 });
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_correction_applications
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(0);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(0);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM platform.outbox_events
       WHERE aggregate_id = $1 AND event_type = 'attendance.regularization.approved'`,
      [request.json().id],
    )).rows[0].count).toBe(0);
  });

  it("records return atomically without applying punches or corrections", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-17",
        reason: "Review requested punch",
        items: [{ operation: "add", event_type: "check_in", occurred_at: "2026-05-17T03:30:00.000Z" }],
      },
    });
    const returned = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "return", remarks: "Please confirm the time", expected_version: 1 },
    });
    expect(returned.statusCode, returned.body).toBe(200);
    const pool = app.store.pgPool!;
    expect((await pool.query(
      `SELECT action_kind FROM attendance.regularization_actions
       WHERE regularization_request_id = $1 ORDER BY resulting_version`,
      [request.json().id],
    )).rows).toEqual([{ action_kind: "submitted" }, { action_kind: "returned" }]);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.regularization_correction_applications
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(0);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM attendance.punch_events
       WHERE regularization_request_id = $1`,
      [request.json().id],
    )).rows[0].count).toBe(0);
  });
});
