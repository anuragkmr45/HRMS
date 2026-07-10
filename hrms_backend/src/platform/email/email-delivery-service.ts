import { randomUUID } from "node:crypto";
import type { AdminEmailTemplateKey, AdminEmailTemplateRecord, CoreUser, UUID } from "#shared";
import type { AuthTokenRecord, MemoryDataStore } from "../data-store.js";
import { nowIso } from "../data-store.js";
import { renderEmailTemplate } from "./template-renderer.js";
import { ResendEmailError, ResendEmailProvider } from "./resend-email-provider.js";
import type {
  EmailDeliveryConfig,
  EmailDeliveryRecord,
  EmailDeliveryStatus,
  EmailProvider
} from "./types.js";

export interface TemplateEmailInput {
  templateKey: AdminEmailTemplateKey;
  purpose: string;
  userId: UUID | null;
  email: string;
  name: string;
  company: string;
  link: string;
  tokenRecordId: UUID;
  metadata?: Record<string, unknown>;
}

export interface VerificationEmailInput {
  user: CoreUser;
  token: AuthTokenRecord;
  rawToken: string;
  companyName: string;
}

export interface PasswordResetEmailInput {
  user: CoreUser;
  token: AuthTokenRecord;
  rawToken: string;
  companyName: string;
}

export class EmailDeliveryService {
  private readonly provider: EmailProvider | null;

  constructor(
    private readonly store: MemoryDataStore,
    private readonly config: EmailDeliveryConfig,
    provider?: EmailProvider
  ) {
    this.provider = provider ?? (config.mode === "send" ? new ResendEmailProvider(config.resendApiKey ?? "", config.resendRequestTimeoutMs) : null);
  }

  async queueVerificationEmail(input: VerificationEmailInput): Promise<EmailDeliveryRecord> {
    const link = this.buildFrontendLink("/verify-email", {
      token: input.rawToken,
      email: input.user.email
    });
    const delivery = await this.sendOrQueueTemplateEmail({
      templateKey: "verify",
      purpose: "email_verification",
      userId: input.user.id,
      email: input.user.email,
      name: input.user.full_name,
      company: input.companyName,
      link,
      tokenRecordId: input.token.id,
      metadata: { token_id: input.token.id }
    });
    markTokenSent(input.token);
    return delivery;
  }

  deliveryMode(): EmailDeliveryConfig["mode"] {
    return this.config.mode;
  }

  verificationTokenTtlSeconds(): number {
    return this.config.verificationTokenTtlSeconds;
  }

  resendCooldownSeconds(): number {
    return this.config.verificationResendCooldownSeconds;
  }

  resendHourlyLimit(): number {
    return this.config.verificationResendHourlyLimit;
  }

  resendDailyLimit(): number {
    return this.config.verificationResendDailyLimit;
  }

  async queuePasswordResetEmail(input: PasswordResetEmailInput): Promise<EmailDeliveryRecord> {
    const link = this.buildFrontendLink("/reset-password", {
      token: input.rawToken,
      email: input.user.email
    });
    const delivery = await this.sendOrQueueTemplateEmail({
      templateKey: "reset",
      purpose: "password_reset",
      userId: input.user.id,
      email: input.user.email,
      name: input.user.full_name,
      company: input.companyName,
      link,
      tokenRecordId: input.token.id,
      metadata: { token_id: input.token.id }
    });
    markTokenSent(input.token);
    return delivery;
  }

  async sendOrQueueTemplateEmail(input: TemplateEmailInput): Promise<EmailDeliveryRecord> {
    const idempotencyKey = `${input.purpose}:${input.tokenRecordId}`;
    const existing = this.store.emailDeliveries.find(
      (delivery) => delivery.provider === this.config.provider && delivery.idempotency_key === idempotencyKey
    );
    if (existing) {
      return existing;
    }

    const template = this.templateFor(input.templateKey);
    const rendered = renderEmailTemplate(template, {
      name: input.name,
      company: input.company,
      link: input.link,
      email: input.email
    });
    const now = nowIso();
    const delivery: EmailDeliveryRecord = {
      id: randomUUID(),
      provider: this.config.provider,
      template_key: input.templateKey,
      purpose: input.purpose,
      user_id: input.userId,
      email: input.email,
      subject: rendered.subject,
      status: "queued",
      provider_email_id: null,
      idempotency_key: idempotencyKey,
      error_code: null,
      error_message: null,
      queued_at: now,
      sent_at: null,
      delivered_at: null,
      failed_at: null,
      bounced_at: null,
      complained_at: null,
      metadata: {
        ...safeMetadata(input.metadata),
        template_key: input.templateKey,
        purpose: input.purpose
      },
      created_at: now,
      updated_at: now,
      version: 1
    };
    this.store.emailDeliveries.push(delivery);

    if (this.config.mode === "disabled") {
      updateDeliveryStatus(delivery, "disabled", now);
      return delivery;
    }
    if (this.config.mode === "log") {
      delivery.provider_email_id = `log_${delivery.id}`;
      updateDeliveryStatus(delivery, "sent", now);
      return delivery;
    }

    if (!this.provider) {
      recordFailure(delivery, "email_provider_missing", "Email delivery provider is not configured.", now);
      return delivery;
    }

    try {
      const result = await this.provider.sendEmail({
        from: this.fromAddress(),
        to: input.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: this.config.resendReplyToEmail,
        idempotencyKey,
        tags: [
          { name: "purpose", value: safeTagValue(input.purpose) },
          { name: "template", value: safeTagValue(input.templateKey) }
        ]
      });
      delivery.provider_email_id = result.providerEmailId;
      updateDeliveryStatus(delivery, "sent", nowIso());
      return delivery;
    } catch (error) {
      recordFailure(delivery, safeErrorCode(error), safeErrorMessage(error), nowIso());
      return delivery;
    }
  }

  private templateFor(templateKey: AdminEmailTemplateKey): Pick<AdminEmailTemplateRecord, "subject" | "body"> {
    return this.store.adminEmailTemplates.find((template) => template.template_key === templateKey && template.status === "active" && !template.deleted_at)
      ?? fallbackTemplate(templateKey);
  }

  private buildFrontendLink(path: string, query: Record<string, string>): string {
    const url = new URL(path, this.config.frontendUrl);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private fromAddress(): string {
    if (!this.config.resendFromName || /<.+>/u.test(this.config.resendFromEmail)) {
      return this.config.resendFromEmail;
    }
    return `${this.config.resendFromName} <${this.config.resendFromEmail}>`;
  }
}

export function createEmailDeliveryService(
  store: MemoryDataStore,
  config: EmailDeliveryConfig,
  provider?: EmailProvider
): EmailDeliveryService {
  return new EmailDeliveryService(store, config, provider);
}

function markTokenSent(token: AuthTokenRecord): void {
  const now = nowIso();
  token.last_sent_at = now;
  token.send_count += 1;
}

function updateDeliveryStatus(delivery: EmailDeliveryRecord, status: EmailDeliveryStatus, timestamp: string): void {
  delivery.status = status;
  delivery.updated_at = timestamp;
  delivery.version += 1;
  if (status === "sent") {
    delivery.sent_at = timestamp;
  }
}

function recordFailure(delivery: EmailDeliveryRecord, code: string, message: string, timestamp: string): void {
  delivery.status = "failed";
  delivery.error_code = code;
  delivery.error_message = message;
  delivery.failed_at = timestamp;
  delivery.updated_at = timestamp;
  delivery.version += 1;
}

function fallbackTemplate(templateKey: AdminEmailTemplateKey): Pick<AdminEmailTemplateRecord, "subject" | "body"> {
  switch (templateKey) {
    case "reset":
      return {
        subject: "Reset your {{company}} password",
        body: "Hi {{name}},\n\nUse the link below to reset your password. If you didn't request this, you can ignore this email.\n\n{{link}}"
      };
    case "verify":
    default:
      return {
        subject: "Verify your email for {{company}}",
        body: "Hi {{name}},\n\nPlease verify your email by clicking the link below.\n\n{{link}}\n\nThis link expires in 24 hours."
      };
  }
}

function safeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !/token|secret|password/iu.test(key) || key === "token_id")
  );
}

function safeErrorCode(error: unknown): string {
  if (error instanceof ResendEmailError) {
    return error.code.slice(0, 120);
  }
  return "email_delivery_failed";
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Email delivery failed.";
  return message.replace(/re_[a-zA-Z0-9_-]+/gu, "[redacted]").slice(0, 500);
}

function safeTagValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 256);
}
