import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore } from "../../../platform/data-store.js";

describe("GET /api/v1/attendance/daily-explanations", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      dataStore: createMemoryDataStore(),
      rateLimit: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the authenticated employee's privacy-safe explanation", async () => {
    const employee = await loginAs(app, "E1");
    const punch = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-07-08T04:10:00.000Z",
        work_mode: "office",
        source: "web",
        metadata: {
          latitude: 18.5204303,
          device_id: "restricted-device-identifier"
        }
      }
    });
    expect(punch.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/daily-explanations?date=2026-07-08",
      headers: authHeader(employee.token)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      work_date: "2026-07-08",
      employee: {
        id: employee.user.id,
        employee_code: "E1"
      },
      privacy: {
        restricted_evidence_omitted: true
      }
    });
    expect(response.json().dimensions).toHaveLength(6);
    expect(response.json().source_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "check_in",
          occurred_at: "2026-07-08T04:10:00.000Z",
          source_channel: "web"
        })
      ])
    );
    expect(response.body).not.toContain("latitude");
    expect(response.body).not.toContain("restricted-device-identifier");
    expect(response.body).not.toContain("metadata");
  });

  it("enforces reporting-hierarchy object scope", async () => {
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const employee = await loginAs(app, "E1");
    const url =
      `/api/v1/attendance/daily-explanations?date=2026-07-08&user_id=${employee.user.id}`;

    const visible = await app.inject({
      method: "GET",
      url,
      headers: authHeader(manager.token)
    });
    expect(visible.statusCode).toBe(200);
    expect(visible.json().employee.id).toBe(employee.user.id);

    const forbidden = await app.inject({
      method: "GET",
      url,
      headers: authHeader(finance.token)
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("rejects malformed dates and employee identifiers", async () => {
    const employee = await loginAs(app, "E1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/daily-explanations?date=08-07-2026&user_id=not-a-uuid",
      headers: authHeader(employee.token)
    });

    expect(response.statusCode).toBe(400);
  });
});
