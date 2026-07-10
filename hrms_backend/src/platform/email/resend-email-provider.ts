import type { EmailProvider, SendEmailInput, SendEmailResult } from "./types.js";

interface ResendSendResponse {
  id?: string;
  data?: { id?: string };
  error?: { name?: string; message?: string };
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly requestTimeoutMs = 5000
  ) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          from: input.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          reply_to: input.replyTo,
          tags: input.tags
        })
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new ResendEmailError(408, "resend_request_timeout", `Resend email request timed out after ${this.requestTimeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new ResendEmailError(
        response.status,
        payload.error?.name ?? "resend_request_failed",
        payload.error?.message ?? `Resend email request failed with status ${response.status}`
      );
    }
    const providerEmailId = payload.data?.id ?? payload.id;
    if (!providerEmailId) {
      throw new ResendEmailError(response.status, "resend_missing_email_id", "Resend response did not include an email id.");
    }
    return { providerEmailId };
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

export class ResendEmailError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ResendEmailError";
  }
}

async function safeJson(response: Response): Promise<ResendSendResponse> {
  try {
    const value = await response.json();
    return value && typeof value === "object" ? value as ResendSendResponse : {};
  } catch {
    return {};
  }
}
