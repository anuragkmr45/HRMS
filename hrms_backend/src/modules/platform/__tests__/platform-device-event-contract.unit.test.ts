import { describe, expect, it } from "vitest";
import {
  buildDeviceRegisteredEvent,
  platformDeviceEvents,
} from "../events.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const registeredDeviceId = "33333333-3333-4333-8333-333333333333";

const forbiddenPayloadKeys = new Set([
  "installation_id",
  "installation_hash",
  "push_token",
  "attestation",
  "challenge_hash",
  "provider_metadata",
  "fingerprint",
  "authorization",
  "session_token",
  "headers",
  "ip_address",
  "user_agent",
  "metadata",
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

describe("platform device outbox event contract", () => {
  it("uses the canonical device event name", () => {
    expect(platformDeviceEvents).toEqual({
      DeviceRegistered: "platform.device.registered",
    });
  });

  it("allowlists initial device registration without secrets or trust evidence", () => {
    const event = buildDeviceRegisteredEvent({
      companyId,
      userId,
      registeredDeviceId,
      platform: "android",
      registeredAt: "2026-08-03T03:30:03.000Z",
      installation_hash: "a".repeat(64),
      push_token: "private",
      attestation: { provider_metadata: { fingerprint: "secret" } },
      ip_address: "203.0.113.10",
      user_agent: "private-agent",
    } as Parameters<typeof buildDeviceRegisteredEvent>[0]);

    expect(event).toEqual({
      aggregateType: "device",
      aggregateId: registeredDeviceId,
      eventType: "platform.device.registered",
      idempotencyKey: `platform.device.registered:${registeredDeviceId}`,
      payload: {
        schema_version: 1,
        company_id: companyId,
        user_id: userId,
        registered_device_id: registeredDeviceId,
        platform: "android",
        status: "registered",
        registered_at: "2026-08-03T03:30:03.000Z",
      },
    });
    expectNoForbiddenPayloadKeys(event.payload);
  });
});
