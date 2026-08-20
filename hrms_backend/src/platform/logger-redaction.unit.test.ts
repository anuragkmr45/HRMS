import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { loggerRedactionOptions } from "./logger-redaction.js";

describe("logger redaction", () => {
  it("redacts representative attendance and security fields while preserving safe observability metadata", () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = pino({ redact: loggerRedactionOptions() }, stream);

    logger.info({
      req: {
        headers: {
          authorization: "Bearer secret-token",
          cookie: "session=secret-cookie",
          "x-api-key": "secret-api-key",
        },
        body: {
          password: "secret-password",
          token: "body-token",
          push_token: "push-token",
          session_token: "session-token",
          secret: "body-secret",
          command: {
            location: {
              latitude: 12.971599,
              longitude: 77.594566,
              coordinates: [77.594566, 12.971599],
              raw_payload: { provider: "raw" },
            },
            metadata: {
              raw_payload: { nested: true },
            },
          },
          events: [
            {
              location: {
                latitude: 13.1,
                longitude: 77.7,
                raw_payload: { nested: true },
              },
            },
          ],
          signature: "device-signature",
          canonicalPayload: "signed-bytes",
          publicKeyMaterial: "public-key-material",
          attestation: { provider_metadata: "sensitive" },
          device_attestation: { provider_metadata: "device-sensitive" },
          artifact: "attestation-artifact",
          artifact_hash: "attestation-artifact-hash",
        },
      },
      res: {
        headers: {
          "set-cookie": "session=secret-cookie",
        },
      },
      observability: {
        event: "attendance.decision.observed",
        source_channel: "web_geo",
        outcome: "allowed",
        accuracy_bucket: "0_25m",
      },
    }, "redaction test");

    expect(output).toContain("[REDACTED]");
    expect(output).toContain("attendance.decision.observed");
    expect(output).toContain("web_geo");
    expect(output).toContain("0_25m");
    expect(output).not.toContain("12.971599");
    expect(output).not.toContain("77.594566");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("secret-cookie");
    expect(output).not.toContain("secret-api-key");
    expect(output).not.toContain("secret-password");
    expect(output).not.toContain("body-secret");
    expect(output).not.toContain("push-token");
    expect(output).not.toContain("session-token");
    expect(output).not.toContain("device-signature");
    expect(output).not.toContain("signed-bytes");
    expect(output).not.toContain("public-key-material");
    expect(output).not.toContain("attestation-artifact");
    expect(output).not.toContain("attestation-artifact-hash");
  });
});
