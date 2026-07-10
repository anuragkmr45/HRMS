import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryDataStore, nowIso } from "../data-store.js";
import { ResendWebhookService } from "./resend-webhook-service.js";
import type { EmailDeliveryRecord } from "./types.js";

describe("ResendWebhookService", () => {
  const secret = "test-secret";

  it("processes a valid webhook", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    const result = service.process(payload, headers);

    expect(result).toEqual({
      received: true,
      duplicate: false,
      event_type: "email.sent",
    });

    expect(store.emailEvents).toHaveLength(1);

    expect(store.emailDeliveries[0]!.status).toBe("sent");
  });

  it("rejects when webhook secret is not configured", () => {
    const store = createMemoryDataStore();

    const service = new ResendWebhookService(store, "");

    expect(() =>
      service.process("{}", {
        id: "msg_test",
        timestamp: "1700000000",
        signature: "v1,test",
      }),
    ).toThrowError("Resend webhook secret is not configured.");
  });

  it("rejects when svix-id header is missing", () => {
    const store = createMemoryDataStore();

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: "email_123",
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    expect(() =>
      service.process(payload, {
        ...headers,
        id: undefined,
      }),
    ).toThrowError("Invalid Resend webhook signature.");
  });

  it("rejects when svix-timestamp header is missing", () => {
    const store = createMemoryDataStore();

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: "email_123",
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    expect(() =>
      service.process(payload, {
        ...headers,
        timestamp: undefined,
      }),
    ).toThrowError("Invalid Resend webhook signature.");
  });

  it("rejects when svix-signature header is missing", () => {
    const store = createMemoryDataStore();

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: "email_123",
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    expect(() =>
      service.process(payload, {
        ...headers,
        signature: undefined,
      }),
    ).toThrowError("Invalid Resend webhook signature.");
  });

  it("rejects an invalid webhook signature", () => {
    const store = createMemoryDataStore();

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: "email_123",
      },
    });

    const service = new ResendWebhookService(store, secret);

    expect(() =>
      service.process(payload, {
        id: "msg_test",
        timestamp: Math.floor(Date.now() / 1000).toString(),
        signature: "v1,this-is-not-valid",
      }),
    ).toThrowError("Invalid Resend webhook signature.");
  });

  it("rejects a webhook outside the timestamp tolerance", () => {
    const store = createMemoryDataStore();

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: "email_123",
      },
    });

    const service = new ResendWebhookService(store, secret, {
      timestampToleranceSeconds: 300,
      nowSeconds: () => 1000,
    });

    const id = "msg_test";

    const timestamp = "600";

    const signature = sign(secret, id, timestamp, payload);

    expect(() =>
      service.process(payload, {
        id,
        timestamp,
        signature: `v1,${signature}`,
      }),
    ).toThrowError("Invalid Resend webhook signature.");
  });

  it("rejects a malformed timestamp", () => {
    const store = createMemoryDataStore();

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: "email_123",
      },
    });

    const service = new ResendWebhookService(store, secret);

    expect(() =>
      service.process(payload, {
        id: "msg_test",
        timestamp: "abc",
        signature: "v1,test",
      }),
    ).toThrowError("Invalid Resend webhook signature.");
  });

  it("stores the webhook event after successful verification", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(store.emailEvents).toHaveLength(1);

    const event = store.emailEvents[0]!;

    expect(event.provider).toBe("resend");
    expect(event.provider_email_id).toBe(delivery.provider_email_id);
    expect(event.event_type).toBe("email.sent");
    expect(event.email).toBe(delivery.email);
    expect(event.delivery_id).toBe(delivery.id);
  });

  it("returns duplicate=true when the same webhook is received twice", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      id: "evt_123",
      type: "email.sent",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    const first = service.process(payload, headers);

    const second = service.process(payload, headers);

    expect(first.duplicate).toBe(false);

    expect(second).toEqual({
      received: true,
      duplicate: true,
      event_type: "email.sent",
    });

    expect(store.emailEvents).toHaveLength(1);
  });

  it("updates delivery status to sent", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("sent");

    expect(delivery.sent_at).not.toBeNull();

    expect(delivery.version).toBe(2);
  });

  it("updates delivery status to delivered", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    delivery.status = "sent";

    const payload = JSON.stringify({
      type: "email.delivered",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("delivered");

    expect(delivery.delivered_at).not.toBeNull();

    expect(delivery.version).toBe(2);
  });

  it("updates delivery status to delivery_delayed", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.delivery_delayed",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("delivery_delayed");
  });

  it("updates delivery status to failed", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.failed",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("failed");

    expect(delivery.failed_at).not.toBeNull();
  });

  it("stores unknown webhook events without changing delivery status", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.some_new_event",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("queued");

    expect(store.emailEvents).toHaveLength(1);

    expect(store.emailEvents[0]!.event_type).toBe("email.some_new_event");
  });

  it("updates delivery status to bounced", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("bounced");
    expect(delivery.bounced_at).not.toBeNull();
  });

  it("updates delivery status to complained", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.complained",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("complained");
    expect(delivery.complained_at).not.toBeNull();
  });

  it("updates delivery status to suppressed", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.suppressed",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(delivery.status).toBe("suppressed");
  });

  it("marks verification user as bounced", () => {
    const store = createMemoryDataStore();

    const user = store.users[0]!;

    user.email_verification_status = "pending";

    const delivery = createDelivery(store);

    delivery.user_id = user.id;
    delivery.purpose = "email_verification";

    const payload = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(user.email_verification_status).toBe("bounced");
  });

  it("blocks user after complaint", () => {
    const store = createMemoryDataStore();

    const user = store.users[0]!;

    user.email_verification_status = "pending";

    const delivery = createDelivery(store);

    delivery.user_id = user.id;
    delivery.purpose = "email_verification";

    const payload = JSON.stringify({
      type: "email.complained",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(user.email_verification_status).toBe("blocked");
  });

  it("blocks user after suppression", () => {
    const store = createMemoryDataStore();

    const user = store.users[0]!;

    user.email_verification_status = "pending";

    const delivery = createDelivery(store);

    delivery.user_id = user.id;
    delivery.purpose = "email_verification";

    const payload = JSON.stringify({
      type: "email.suppressed",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(user.email_verification_status).toBe("blocked");
  });

  it("does not modify already verified users", () => {
    const store = createMemoryDataStore();

    const user = store.users[0]!;

    user.email_verification_status = "verified";

    const delivery = createDelivery(store);

    delivery.user_id = user.id;
    delivery.purpose = "email_verification";

    const payload = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    expect(user.email_verification_status).toBe("verified");
  });

  it("redacts sensitive values before storing payload", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);

    const payload = JSON.stringify({
      type: "email.sent",
      token: "abc123",
      password: "secret-password",
      secret: "top-secret",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const service = new ResendWebhookService(store, secret);

    service.process(payload, headers);

    const event = store.emailEvents[0]!;

    expect(event.payload.token).toBe("[redacted]");
    expect(event.payload.password).toBe("[redacted]");
    expect(event.payload.secret).toBe("[redacted]");
  });

  it("does not regress a delivered email back to sent", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);
    delivery.status = "delivered";

    const service = new ResendWebhookService(store, secret);

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const result = service.process(payload, headers);

    expect(result).toEqual({
      received: true,
      duplicate: false,
      event_type: "email.sent",
    });

    expect(delivery.status).toBe("delivered");
    expect(store.emailEvents).toHaveLength(1);
    expect(store.emailEvents[0]!.event_type).toBe("email.sent");
  });

  it("does not regress a bounced email back to delivered", () => {
    const store = createMemoryDataStore();

    const delivery = createDelivery(store);
    delivery.status = "bounced";

    const service = new ResendWebhookService(store, secret);

    const payload = JSON.stringify({
      type: "email.sent",
      data: {
        email_id: delivery.provider_email_id,
        to: [delivery.email],
      },
    });

    const headers = createHeaders(secret, payload);

    const result = service.process(payload, headers);

    expect(result).toEqual({
      received: true,
      duplicate: false,
      event_type: "email.sent",
    });

    
    expect(delivery.status).toBe("bounced");
    expect(store.emailEvents).toHaveLength(1);
    expect(store.emailEvents[0]!.event_type).toBe("email.sent");
  });
});

// Helper functions

function createHeaders(secret: string, payload: string) {
  const id = "msg_test";

  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = sign(secret, id, timestamp, payload);

  return {
    id,
    timestamp,
    signature: `v1,${signature}`,
  };
}

function sign(secret: string, id: string, timestamp: string, payload: string) {
  return createHmac("sha256", Buffer.from(secret))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
}

// Creates a delivery in the store for testing purposes
function createDelivery(
  store: ReturnType<typeof createMemoryDataStore>,
): EmailDeliveryRecord {
  const delivery: EmailDeliveryRecord = {
    id: "delivery-1",
    provider: "resend",
    template_key: "verify",
    purpose: "email_verification",
    user_id: null,
    email: "user@example.com",
    subject: "Verify",

    status: "queued",

    provider_email_id: "email_123",
    idempotency_key: "verify",

    error_code: null,
    error_message: null,

    queued_at: nowIso(),
    sent_at: null,
    delivered_at: null,
    failed_at: null,
    bounced_at: null,
    complained_at: null,

    metadata: {},

    created_at: nowIso(),
    updated_at: nowIso(),

    version: 1,
  };

  store.emailDeliveries.push(delivery);

  return delivery;
}
