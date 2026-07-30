import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { EmailDeliveryRecord, EmailDeliveryStatus } from "./types.js";
import type { MemoryDataStore } from "../data-store.js";
import { nowIso } from "../data-store.js";
import { badRequest } from "../errors.js";

export interface ResendWebhookHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

export interface ResendWebhookVerificationOptions {
  timestampToleranceSeconds: number;
  nowSeconds?: () => number;
}

export interface ResendWebhookVerifier {
  verify(
    payload: string,
    headers: ResendWebhookHeaders,
    secret: string,
    options: ResendWebhookVerificationOptions,
  ): Record<string, unknown>;
}

export class SvixResendWebhookVerifier implements ResendWebhookVerifier {
  verify(
    payload: string,
    headers: ResendWebhookHeaders,
    secret: string,
    options: ResendWebhookVerificationOptions,
  ): Record<string, unknown> {
    if (!headers.id || !headers.timestamp || !headers.signature) {
      throw new Error("Missing Resend webhook signature headers.");
    }
    const timestampSeconds = Number(headers.timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      !Number.isInteger(timestampSeconds) ||
      timestampSeconds <= 0
    ) {
      throw new Error("Invalid Resend webhook timestamp.");
    }
    if (
      !Number.isFinite(options.timestampToleranceSeconds) ||
      !Number.isInteger(options.timestampToleranceSeconds) ||
      options.timestampToleranceSeconds <= 0
    ) {
      throw new Error("Invalid Resend webhook timestamp tolerance.");
    }
    const nowSeconds = options.nowSeconds?.() ?? currentUnixSeconds();
    if (
      !Number.isFinite(nowSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) >
        options.timestampToleranceSeconds
    ) {
      throw new Error(
        "Resend webhook timestamp is outside the allowed tolerance.",
      );
    }
    const signedPayload = `${headers.id}.${headers.timestamp}.${payload}`;
    const expected = createHmac("sha256", decodeWebhookSecret(secret))
      .update(signedPayload)
      .digest("base64");
    const candidates = headers.signature
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) =>
        part.startsWith("v1,") ? part.slice("v1,".length) : part,
      );
    if (!candidates.some((candidate) => safeEqualBase64(candidate, expected))) {
      throw new Error("Invalid Resend webhook signature.");
    }
    return JSON.parse(payload) as Record<string, unknown>;
  }
}

export interface ResendWebhookServiceOptions {
  timestampToleranceSeconds?: number;
  nowSeconds?: () => number;
}

export class ResendWebhookService {
  private readonly timestampToleranceSeconds: number;
  private readonly nowSeconds: () => number;

  constructor(
    private readonly store: MemoryDataStore,
    private readonly webhookSecret: string,
    options: ResendWebhookServiceOptions = {},
    private readonly verifier: ResendWebhookVerifier = new SvixResendWebhookVerifier(),
  ) {
    this.timestampToleranceSeconds = options.timestampToleranceSeconds ?? 300;
    this.nowSeconds = options.nowSeconds ?? currentUnixSeconds;
  }

  process(
    payload: string,
    headers: ResendWebhookHeaders,
  ): { received: true; duplicate: boolean; event_type?: string } {
    if (!this.webhookSecret) {
      throw badRequest("Resend webhook secret is not configured.");
    }
    const verified = this.verify(payload, headers);
    const providerEventId = eventId(verified, headers.id);
    const eventType =
      stringValue(verified.type) ??
      stringValue(verified.event_type) ??
      "unknown";
    const providerEmailId = providerEmailIdFrom(verified);
    const email = emailFrom(verified);
    const existing = this.store.emailEvents.find(
      (event) =>
        event.provider === "resend" &&
        event.provider_event_id === providerEventId,
    );
    if (existing) {
      return {
        received: true,
        duplicate: true,
        event_type: existing.event_type,
      };
    }

    const delivery = providerEmailId
      ? (this.store.emailDeliveries.find(
          (candidate) =>
            candidate.provider === "resend" &&
            candidate.provider_email_id === providerEmailId,
        ) ?? null)
      : null;
    const now = nowIso();
    this.store.emailEvents.push({
      id: randomUUID(),
      provider: "resend",
      provider_event_id: providerEventId,
      provider_email_id: providerEmailId,
      event_type: eventType,
      email,
      delivery_id: delivery?.id ?? null,
      payload: sanitizeWebhookPayload(verified),
      received_at: now,
      processed_at: now,
    });
    if (delivery) {
      updateDeliveryFromEvent(this.store, delivery, eventType, now);
    }
    return { received: true, duplicate: false, event_type: eventType };
  }

  private verify(
    payload: string,
    headers: ResendWebhookHeaders,
  ): Record<string, unknown> {
    try {
      return this.verifier.verify(payload, headers, this.webhookSecret, {
        timestampToleranceSeconds: this.timestampToleranceSeconds,
        nowSeconds: this.nowSeconds,
      });
    } catch {
      throw badRequest("Invalid Resend webhook signature.");
    }
  }
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const VERIFICATION_BLOCK_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.suppressed",
]);

const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<EmailDeliveryStatus, ReadonlySet<EmailDeliveryStatus>>
> = {
  queued: new Set([
    "sent",
    "delivery_delayed",
    "delivered",
    "failed",
    "bounced",
    "complained",
    "suppressed",
    "disabled",
  ]),

  sent: new Set([
    "delivery_delayed",
    "delivered",
    "failed",
    "bounced",
    "complained",
    "suppressed",
  ]),

  delivery_delayed: new Set([
    "delivered",
    "failed",
    "bounced",
    "complained",
    "suppressed",
  ]),

  delivered: new Set(),

  bounced: new Set(),

  failed: new Set(),

  complained: new Set(),

  suppressed: new Set(),

  disabled: new Set(),
};

const SENSITIVE_KEYS = new Set([
  "token",
  "password",
  "secret",
  "authorization",
  "access_token",
  "refresh_token",
  "api_key",
  "cookie",
]);

const SENSITIVE_VALUE_PATTERN = /token=|password|secret/iu;

function canTransitionStatus(
  current: EmailDeliveryStatus,
  next: EmailDeliveryStatus,
): boolean {
  if (current === next) {
    return true;
  }

  return ALLOWED_STATUS_TRANSITIONS[current].has(next);
}

function updateDeliveryFromEvent(
  store: MemoryDataStore,
  delivery: EmailDeliveryRecord,
  eventType: string,
  timestamp: string,
): void {
  const status = statusFor(eventType);
  if (!status) {
    return;
  }

  if (!canTransitionStatus(delivery.status, status)) {
    return;
  }

  delivery.status = status;
  delivery.updated_at = timestamp;
  delivery.version += 1;
  if (eventType === "email.sent") {
    delivery.sent_at = delivery.sent_at ?? timestamp;
  } else if (eventType === "email.delivered") {
    delivery.delivered_at = timestamp;
  } else if (eventType === "email.failed" || eventType === "email.suppressed") {
    delivery.failed_at = timestamp;
  } else if (eventType === "email.bounced") {
    delivery.bounced_at = timestamp;
  } else if (eventType === "email.complained") {
    delivery.complained_at = timestamp;
  }

  if (
    delivery.purpose === "email_verification" &&
    delivery.user_id &&
    VERIFICATION_BLOCK_EVENTS.has(eventType)
  ) {
    const user = store.users.find(
      (candidate) => candidate.id === delivery.user_id && !candidate.deleted_at,
    );
    if (user && user.email_verification_status !== "verified") {
      user.email_verification_status =
        eventType === "email.bounced" ? "bounced" : "blocked";
      user.version += 1;
    }
  }
}

function statusFor(eventType: string): EmailDeliveryStatus | null {
  switch (eventType) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.delivery_delayed":
      return "delivery_delayed";
    case "email.bounced":
      return "bounced";
    case "email.failed":
      return "failed";
    case "email.complained":
      return "complained";
    case "email.suppressed":
      return "suppressed";
    default:
      return null;
  }
}

function decodeWebhookSecret(secret: string): Buffer {
  if (secret.startsWith("whsec_")) {
    return Buffer.from(secret.slice("whsec_".length), "base64");
  }
  return Buffer.from(secret, "utf8");
}

function safeEqualBase64(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function eventId(
  payload: Record<string, unknown>,
  fallback: string | undefined,
): string {
  return stringValue(payload.id) ?? fallback ?? randomUUID();
}

function providerEmailIdFrom(payload: Record<string, unknown>): string | null {
  const data = recordValue(payload.data);
  return (
    stringValue(data.email_id) ??
    stringValue(data.emailId) ??
    stringValue(data.id) ??
    stringValue(recordValue(data.email).id)
  );
}

function emailFrom(payload: Record<string, unknown>): string | null {
  const data = recordValue(payload.data);
  const to = data.to;
  if (Array.isArray(to)) {
    return typeof to[0] === "string" ? to[0] : null;
  }
  return stringValue(to) ?? stringValue(data.email);
}

function sanitizeWebhookPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return sanitize(payload) as Record<string, unknown>;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => {
        const normalizedKey = key.toLowerCase();

        return [
          key,
          SENSITIVE_KEYS.has(normalizedKey) ? "[redacted]" : sanitize(val),
        ];
      }),
    );
  }

  if (typeof value === "string" && SENSITIVE_VALUE_PATTERN.test(value)) {
    return "[redacted]";
  }

  return value;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
