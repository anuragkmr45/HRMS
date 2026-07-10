import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin policy settings", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists policy configurations for admins only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/policies",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/policies",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policy_key: "attendance",
          key: "attendance",
          label: "Attendance policy",
          active: true,
          version: 1,
          config: expect.objectContaining({
            graceMinutes: 10,
            allowRegularization: true,
            fullDayPunchWindow: true,
            punchInStart: "09:00",
            punchOutEnd: "23:59",
            autoPunchOutEnabled: true,
            autoPunchOutTime: "23:59",
            allowOffDayPunches: false
          })
        })
      ])
    );
    expect(list.json().versions.attendance).toBe(1);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/admin/policies?module=leave_wfh&active_only=true",
      headers: authHeader(admin.token)
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().items.map((policy: { policy_key: string }) => policy.policy_key)).toEqual(["leave"]);
  });

  it("updates policy config with OCC and validation", async () => {
    const admin = await loginAs(app, "ADM");

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        label: "Attendance guardrails",
        active: true,
        expected_version: 1,
        config: {
          graceMinutes: 15,
          allowRegularization: false,
          fullDayPunchWindow: false,
          punchInStart: "08:30",
          punchInEnd: "11:00",
          punchOutStart: "17:00",
          punchOutEnd: "22:30",
          autoPunchOutEnabled: false,
          autoPunchOutTime: "22:45",
          allowOffDayPunches: true
        }
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().policy).toMatchObject({
      policy_key: "attendance",
      label: "Attendance guardrails",
      active: true,
      version: 2,
      config: expect.objectContaining({
        graceMinutes: 15,
        halfDayAfterMinutes: 240,
        allowRegularization: false,
        fullDayPunchWindow: false,
        punchInStart: "08:30",
        punchOutEnd: "22:30",
        autoPunchOutEnabled: false,
        autoPunchOutTime: "22:45",
        allowOffDayPunches: true
      })
    });

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 1,
        config: { graceMinutes: 20 }
      }
    });
    expect(stale.statusCode).toBe(409);

    const invalid = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 2,
        config: { unknownField: true }
      }
    });
    expect(invalid.statusCode).toBe(400);

    const invalidTime = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 2,
        config: { punchInStart: "25:00" }
      }
    });
    expect(invalidTime.statusCode).toBe(400);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.policy.updated");
  });
});
