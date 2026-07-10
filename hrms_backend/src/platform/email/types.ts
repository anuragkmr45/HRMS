import type { AdminEmailTemplateKey, ISODateTime, UUID } from "#shared";

export type EmailDeliveryProviderName = "resend";
export type EmailDeliveryMode = "send" | "log" | "disabled";

export type EmailDeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "failed"
  | "bounced"
  | "complained"
  | "suppressed"
  | "disabled";

export interface EmailDeliveryConfig {
  provider: EmailDeliveryProviderName;
  mode: EmailDeliveryMode;
  resendApiKey?: string;
  resendFromEmail: string;
  resendFromName?: string;
  resendReplyToEmail?: string;
  resendWebhookSecret?: string;
  resendRequestTimeoutMs: number;
  frontendUrl: string;
  appUrl: string;
  verificationTokenTtlSeconds: number;
  verificationResendCooldownSeconds: number;
  verificationResendHourlyLimit: number;
  verificationResendDailyLimit: number;
}

export interface EmailDeliveryRecord {
  id: UUID;
  provider: EmailDeliveryProviderName;
  template_key: AdminEmailTemplateKey;
  purpose: string;
  user_id: UUID | null;
  email: string;
  subject: string;
  status: EmailDeliveryStatus;
  provider_email_id: string | null;
  idempotency_key: string;
  error_code: string | null;
  error_message: string | null;
  queued_at: ISODateTime;
  sent_at: ISODateTime | null;
  delivered_at: ISODateTime | null;
  failed_at: ISODateTime | null;
  bounced_at: ISODateTime | null;
  complained_at: ISODateTime | null;
  metadata: Record<string, unknown>;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  version: number;
}

export interface EmailEventRecord {
  id: UUID;
  provider: EmailDeliveryProviderName;
  provider_event_id: string;
  provider_email_id: string | null;
  event_type: string;
  email: string | null;
  delivery_id: UUID | null;
  payload: Record<string, unknown>;
  received_at: ISODateTime;
  processed_at: ISODateTime | null;
}

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  providerEmailId: string;
}

export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

export interface RenderedEmailTemplate {
  subject: string;
  text: string;
  html: string;
}
