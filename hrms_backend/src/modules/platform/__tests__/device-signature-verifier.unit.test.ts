import { describe, expect, it } from "vitest";
import { FakeDeviceSignatureVerifier } from "#testing";
import {
  deviceSignatureCanonicalPayloadSha256,
  type DeviceSignatureVerificationRequest,
} from "../device-signature-verifier.js";

const request: DeviceSignatureVerificationRequest = {
  companyId: "10000000-0000-4000-8000-000000000001",
  registeredDeviceId: "20000000-0000-4000-8000-000000000001",
  keyVersion: 3,
  algorithm: "ecdsa-p256-sha256",
  publicKeyFormat: "spki-pem",
  publicKeyMaterial: "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----",
  publicKeyFingerprintSha256: "a".repeat(64),
  canonicalPayload: JSON.stringify({
    client_event_id: "30000000-0000-4000-8000-000000000001",
    sequence: 42,
  }),
  signature: new Uint8Array([1, 2, 3, 4]),
  receivedAt: "2026-08-10T03:45:10.000Z",
  context: {
    client_event_id: "30000000-0000-4000-8000-000000000001",
    sequence: 42,
  },
};

describe("device signature verifier contract", () => {
  it("hashes canonical signed payload bytes deterministically", () => {
    expect(deviceSignatureCanonicalPayloadSha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(deviceSignatureCanonicalPayloadSha256(new Uint8Array([97, 98, 99]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("returns deterministic verified metadata from the reusable fake", async () => {
    const verifier = new FakeDeviceSignatureVerifier({
      mode: "verified",
      evaluatedAt: "2026-08-10T04:00:00.000Z",
      metadata: { fixture: "unit" },
    });

    const result = await verifier.verify(request);

    expect(result).toEqual({
      verificationStatus: "verified",
      adapterVersion: "fake-device-signature-verifier-v1",
      evaluatedAt: "2026-08-10T04:00:00.000Z",
      keyVersion: 3,
      publicKeyFingerprintSha256: "a".repeat(64),
      canonicalPayloadSha256: deviceSignatureCanonicalPayloadSha256(
        request.canonicalPayload,
      ),
      reasonCodes: ["device_signature.verified"],
      metadata: {
        algorithm: "ecdsa-p256-sha256",
        public_key_format: "spki-pem",
        fixture: "unit",
      },
    });
    expect(verifier.requests).toEqual([request]);
  });

  it("supports rejected, indeterminate, and adapter error result states", async () => {
    await expect(
      new FakeDeviceSignatureVerifier({ mode: "rejected" }).verify(request),
    ).resolves.toMatchObject({
      verificationStatus: "rejected",
      reasonCodes: ["device_signature.rejected"],
    });
    await expect(
      new FakeDeviceSignatureVerifier({ mode: "indeterminate" }).verify(request),
    ).resolves.toMatchObject({
      verificationStatus: "indeterminate",
      reasonCodes: ["device_signature.indeterminate"],
    });
    await expect(
      new FakeDeviceSignatureVerifier({ mode: "error" }).verify(request),
    ).resolves.toMatchObject({
      verificationStatus: "error",
      reasonCodes: ["device_signature.error"],
    });
  });

  it("supports operational failure paths for tests", async () => {
    const verifier = new FakeDeviceSignatureVerifier({
      mode: "throw",
      errorMessage: "verification backend unavailable",
    });

    await expect(verifier.verify(request)).rejects.toThrow(
      "verification backend unavailable",
    );
    expect(verifier.requests).toEqual([request]);
  });

  it("does not expose physical-location or payroll semantics", async () => {
    const result = await new FakeDeviceSignatureVerifier().verify(request);
    const serialized = JSON.stringify(result).toLowerCase();

    expect(serialized).not.toContain("location");
    expect(serialized).not.toContain("geofence");
    expect(serialized).not.toContain("presence");
    expect(serialized).not.toContain("attendance_legitimacy");
    expect(serialized).not.toContain("identity_proof");
    expect(serialized).not.toContain("attestation");
    expect(serialized).not.toContain("payroll");
  });
});
