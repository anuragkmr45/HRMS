import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin policy settings", () => {
  let app: Awaited<ReturnType<typeof buildRealApp>>;

  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;

  function restoreDatabaseEnvironment(): void {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalTestDatabaseUrl === undefined) {
      delete process.env.TEST_DATABASE_URL;
    } else {
      process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
    }
  }

  beforeEach(async () => {
    restoreDatabaseEnvironment();

    app = await buildRealApp();
    await app.ready();
  }, 30_000);

  afterEach(async () => {
    await app.close();
    restoreDatabaseEnvironment();
  }, 30_000);
  
  it("lists policy configurations for admins only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/policies",
      headers: authHeader(employee.token),
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/policies",
      headers: authHeader(admin.token),
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
            allowOffDayPunches: false,
            attendanceMode: "manual_only",
            fallbackApprovalMode: "disabled",
            regularizationMode: "approval_required",
          }),
        }),
      ]),
    );
    expect(list.json().versions.attendance).toBe(1);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/admin/policies?module=leave_wfh&active_only=true",
      headers: authHeader(admin.token),
    });
    expect(filtered.statusCode).toBe(200);
    expect(
      filtered
        .json()
        .items.map((policy: { policy_key: string }) => policy.policy_key),
    ).toEqual(["leave"]);
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
          allowOffDayPunches: true,
          attendanceMode: "geo_optional",
          fallbackApprovalMode: "approval_required",
          regularizationMode: "disabled",
        },
      },
    });

    const updateBody = update.json();

    if (update.statusCode !== 200) {
      console.error(
        "Attendance policy update failed:",
        JSON.stringify(
          {
            statusCode: update.statusCode,
            body: updateBody,
          },
          null,
          2,
        ),
      );
    }

    expect(update.statusCode).toBe(200);

    expect(updateBody.policy).toMatchObject({
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
        allowOffDayPunches: true,
        attendanceMode: "geo_optional",
        fallbackApprovalMode: "approval_required",
        regularizationMode: "disabled",
      }),
    });

    const persistedVersion = await app.store.pgPool!.query<{
      version_number: number;
      config: Record<string, unknown>;
    }>(
      `SELECT version_number, config
       FROM attendance.policy_versions
      WHERE policy_id = $1
        AND version_number = $2`,
      [updateBody.policy.id, updateBody.policy.version],
    );

    expect(persistedVersion.rows).toHaveLength(1);

    expect(persistedVersion.rows[0]).toMatchObject({
      version_number: 2,
      config: expect.objectContaining({
        attendanceMode: "geo_optional",
        fallbackApprovalMode: "approval_required",
        regularizationMode: "disabled",
      }),
    });

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 1,
        config: {
          graceMinutes: 20,
        },
      },
    });

    expect(stale.statusCode).toBe(409);

    const invalid = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 2,
        config: {
          unknownField: true,
        },
      },
    });

    expect(invalid.statusCode).toBe(400);

    const invalidMode = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 2,
        config: {
          attendanceMode: "site_required",
        },
      },
    });

    expect(invalidMode.statusCode).toBe(400);

    const invalidTime = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/policies/attendance",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 2,
        config: {
          punchInStart: "25:00",
        },
      },
    });

    expect(invalidTime.statusCode).toBe(400);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.policy.updated");
  });
});
