import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailProvider } from "./resend-email-provider.js";
import type { SendEmailInput } from "./types.js";

describe("ResendEmailProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fails fast when the Resend request exceeds the configured timeout", async () => {
    globalThis.fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal instanceof AbortSignal) {
        signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }
    })) as typeof fetch;

    const provider = new ResendEmailProvider("test-api-key", 1);

    await expect(provider.sendEmail(emailInput())).rejects.toMatchObject({
      code: "resend_request_timeout",
      status: 408
    });
  });
});

function emailInput(): SendEmailInput {
  return {
    from: "Hawkaii HRMS <verify@example.test>",
    to: "user@example.test",
    subject: "Verify your email",
    html: "<p>Verify</p>",
    text: "Verify",
    idempotencyKey: "email_verification:test"
  };
}
