import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = FastifyInstance;

const forbiddenPayloadKeys = new Set([
  "installation_id",
  "installation_id_hash",
  "installation_hash",
  "device_id",
  "push_token",
  "attestation",
  "provider_metadata",
  "headers",
  "ip_address",
  "user_agent",
  "metadata",
]);

describe("platform device registration API", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildRealApp();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("requires authentication for register and list", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/platform/devices",
      payload: { installation_id_hash: hash("a"), platform: "android" },
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/platform/devices",
    });

    expect(register.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
  });

  it("strictly validates device registration input", async () => {
    const employee = await loginAs(app, "E1");

    const invalidPlatform = await registerDevice(employee.token, {
      installation_id_hash: hash("b"),
      platform: "web",
    });
    const invalidHash = await registerDevice(employee.token, {
      installation_id_hash: "A".repeat(64),
      platform: "ios",
    });
    const clientIdentity = await registerDevice(employee.token, {
      installation_id_hash: hash("c"),
      platform: "android",
      company_id: "10000000-0000-4000-8000-000000000001",
      user_id: employee.user.id,
      status: "registered",
      owner_user_id: employee.user.id,
    });

    expect(invalidPlatform.statusCode).toBe(400);
    expect(invalidHash.statusCode).toBe(400);
    expect(clientIdentity.statusCode).toBe(400);
  });

  it("registers a first device with server-derived owner and one outbox event", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("d");

    const response = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      platform: "android",
      status: "registered",
    });
    expect(body.registered_device_id).toEqual(expect.any(String));
    expect(body.company_id).toBeUndefined();
    expect(body.user_id).toBeUndefined();
    expect(body.installation_id_hash).toBeUndefined();

    const rows = await app.store.pgPool!.query<{
      id: string;
      company_id: string;
      user_id: string;
      installation_id_hash: string;
      platform: string;
      status: string;
    }>(
      `SELECT id, company_id, user_id, installation_id_hash, platform, status
       FROM platform.registered_devices
       WHERE company_id = $1 AND installation_id_hash = $2`,
      [companyId, installationHash],
    );
    expect(rows.rows).toEqual([
      {
        id: body.registered_device_id,
        company_id: companyId,
        user_id: employee.user.id,
        installation_id_hash: installationHash,
        platform: "android",
        status: "registered",
      },
    ]);

    const events = await outboxEvents(body.registered_device_id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregate_type: "device",
      aggregate_id: body.registered_device_id,
      event_type: "platform.device.registered",
      idempotency_key: `platform.device.registered:${body.registered_device_id}`,
    });
    expect(events[0]!.payload).toEqual({
      schema_version: 1,
      company_id: companyId,
      user_id: employee.user.id,
      registered_device_id: body.registered_device_id,
      platform: "android",
      status: "registered",
      registered_at: body.created_at,
    });
    expectNoForbiddenPayloadKeys(events[0]!.payload);
  });

  it("retries same owner/company/installation without another row or event", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("e");

    const first = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "ios",
    });
    const retry = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "ios",
    });

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());

    const counts = await app.store.pgPool!.query<{
      devices: string;
      events: string;
    }>(
      `SELECT
         (SELECT count(*) FROM platform.registered_devices WHERE company_id = $1 AND installation_id_hash = $2) AS devices,
         (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = $3 AND event_type = 'platform.device.registered') AS events`,
      [companyId, installationHash, first.json().registered_device_id],
    );
    expect(counts.rows[0]).toEqual({ devices: "1", events: "1" });
  });

  it("keeps concurrent duplicate registration to one row and one event", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("f");

    const [left, right] = await Promise.all([
      registerDevice(employee.token, {
        installation_id_hash: installationHash,
        platform: "android",
      }),
      registerDevice(employee.token, {
        installation_id_hash: installationHash,
        platform: "android",
      }),
    ]);

    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 201]);
    expect(left.json()).toEqual(right.json());

    const counts = await app.store.pgPool!.query<{
      devices: string;
      events: string;
    }>(
      `SELECT
         (SELECT count(*) FROM platform.registered_devices WHERE company_id = $1 AND installation_id_hash = $2) AS devices,
         (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = $3 AND event_type = 'platform.device.registered') AS events`,
      [companyId, installationHash, left.json().registered_device_id],
    );
    expect(counts.rows[0]).toEqual({ devices: "1", events: "1" });
  });

  it("rejects cross-owner claims without mutating ownership", async () => {
    const employee1 = await loginAs(app, "E1");
    const employee2 = await loginAs(app, "E2");
    const companyId = await activeCompanyId(employee1.user.id);
    const installationHash = hash("1");

    const first = await registerDevice(employee1.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });
    const second = await registerDevice(employee2.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    const owner = await app.store.pgPool!.query<{ user_id: string }>(
      `SELECT user_id
       FROM platform.registered_devices
       WHERE company_id = $1 AND installation_id_hash = $2`,
      [companyId, installationHash],
    );
    expect(owner.rows[0]?.user_id).toBe(employee1.user.id);
    expect(await outboxEvents(first.json().registered_device_id)).toHaveLength(
      1,
    );
  });

  it.each([
    ["suspended", hash("2")],
    ["revoked", hash("3")],
  ] as const)(
    "rejects re-registration for %s devices",
    async (status, installationHash) => {
      const employee = await loginAs(app, "E1");
      const companyId = await activeCompanyId(employee.user.id);
      const deviceId = await insertDevice({
        companyId,
        userId: employee.user.id,
        installationHash,
        platform: "ios",
        status,
      });

      const response = await registerDevice(employee.token, {
        installation_id_hash: installationHash,
        platform: "ios",
      });

      expect(response.statusCode).toBe(409);
      const row = await app.store.pgPool!.query<{ status: string }>(
        `SELECT status FROM platform.registered_devices WHERE id = $1`,
        [deviceId],
      );
      expect(row.rows[0]?.status).toBe(status);
      expect(await outboxEvents(deviceId)).toHaveLength(0);
    },
  );

  it("lists only the authenticated actor's devices in the active company", async () => {
    const employee1 = await loginAs(app, "E1");
    const employee2 = await loginAs(app, "E2");
    const companyId = await activeCompanyId(employee1.user.id);
    const otherCompanyId = "10000000-0000-4000-8000-0000000000aa";
    const otherUserId = "20000000-0000-4000-8000-0000000000aa";
    await insertOtherCompanyUser(otherCompanyId, otherUserId);

    const ownRegistered = await registerDevice(employee1.token, {
      installation_id_hash: hash("4"),
      platform: "android",
    });
    const ownSuspended = await insertDevice({
      companyId,
      userId: employee1.user.id,
      installationHash: hash("5"),
      platform: "ios",
      status: "suspended",
    });
    const ownRevoked = await insertDevice({
      companyId,
      userId: employee1.user.id,
      installationHash: hash("6"),
      platform: "android",
      status: "revoked",
    });
    const otherUserDevice = await insertDevice({
      companyId,
      userId: employee2.user.id,
      installationHash: hash("7"),
      platform: "ios",
      status: "registered",
    });
    const otherCompanyDevice = await insertDevice({
      companyId: otherCompanyId,
      userId: otherUserId,
      installationHash: hash("8"),
      platform: "android",
      status: "registered",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/platform/devices",
      headers: authHeader(employee1.token),
    });

    expect(response.statusCode).toBe(200);
    const ids = response
      .json()
      .items.map(
        (item: { registered_device_id: string }) => item.registered_device_id,
      );
    expect(ids).toContain(ownRegistered.json().registered_device_id);
    expect(ids).toContain(ownSuspended);
    expect(ids).toContain(ownRevoked);
    expect(ids).not.toContain(otherUserDevice);
    expect(ids).not.toContain(otherCompanyDevice);
    expect(
      response.json().items.map((item: { status: string }) => item.status),
    ).toEqual(expect.arrayContaining(["registered", "revoked", "suspended"]));
  });

  it("rejects a retry when the installation platform conflicts with the existing registration", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("9");

    const first = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });

    const conflictingRetry = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "ios",
    });

    expect(first.statusCode).toBe(201);
    expect(conflictingRetry.statusCode).toBe(409);

    const rows = await app.store.pgPool!.query<{
      id: string;
      platform: string;
      user_id: string;
    }>(
      `SELECT id, platform, user_id
     FROM platform.registered_devices
     WHERE company_id = $1
       AND installation_id_hash = $2`,
      [companyId, installationHash],
    );

    expect(rows.rows).toEqual([
      {
        id: first.json().registered_device_id,
        platform: "android",
        user_id: employee.user.id,
      },
    ]);

    expect(await outboxEvents(first.json().registered_device_id)).toHaveLength(
      1,
    );
  });

  async function registerDevice(
    token: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: "POST",
      url: "/api/v1/platform/devices",
      headers: authHeader(token),
      payload,
    });
  }

  async function activeCompanyId(userId: string): Promise<string> {
    const result = await app.store.pgPool!.query<{ company_id: string }>(
      `SELECT company_id
       FROM platform.user_session_preferences
       WHERE user_id = $1`,
      [userId],
    );
    const companyId = result.rows[0]?.company_id;
    if (!companyId) throw new Error(`Missing active company for ${userId}`);
    return companyId;
  }

  async function insertDevice(input: {
    companyId: string;
    userId: string;
    installationHash: string;
    platform: "ios" | "android";
    status: "registered" | "suspended" | "revoked";
  }): Promise<string> {
    const result = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO platform.registered_devices (
         company_id, user_id, installation_id_hash, platform, status, status_changed_at
       )
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING id`,
      [
        input.companyId,
        input.userId,
        input.installationHash,
        input.platform,
        input.status,
      ],
    );
    return result.rows[0]!.id;
  }

  async function insertOtherCompanyUser(
    companyId: string,
    userId: string,
  ): Promise<void> {
    await app.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Device Registration Other Company', 'device-registration-other-company', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [companyId],
    );
    await app.store.pgPool!.query(
      `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
       VALUES ('30000000-0000-4000-8000-0000000000aa', $1, 'Employee', $2)
       ON CONFLICT (user_id) DO UPDATE
       SET active_role = EXCLUDED.active_role,
           company_id = EXCLUDED.company_id,
           updated_at = now()`,
      [userId, companyId],
    );
  }

  async function outboxEvents(registeredDeviceId: string): Promise<
    Array<{
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      idempotency_key: string;
    }>
  > {
    const result = await app.store.pgPool!.query<{
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      idempotency_key: string;
    }>(
      `SELECT aggregate_type, aggregate_id, event_type, payload, idempotency_key
       FROM platform.outbox_events
       WHERE aggregate_type = 'device'
         AND aggregate_id = $1
       ORDER BY id`,
      [registeredDeviceId],
    );
    return result.rows;
  }
});

function hash(prefix: string): string {
  return `${prefix}${"0".repeat(63)}`;
}

function expectNoForbiddenPayloadKeys(
  value: unknown,
  path: string[] = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectNoForbiddenPayloadKeys(item, [...path, String(index)]),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalized = key.trim().toLowerCase().replaceAll("-", "_");
    expect(
      forbiddenPayloadKeys.has(normalized),
      `Forbidden payload key ${[...path, key].join(".")}`,
    ).toBe(false);
    expectNoForbiddenPayloadKeys(nested, [...path, key]);
  }
}
