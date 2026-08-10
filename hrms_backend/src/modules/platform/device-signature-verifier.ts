import { createHash } from "node:crypto";
import type { ISODateTime, UUID } from "#shared";

export type DeviceSignatureVerificationStatus =
  | "verified"
  | "rejected"
  | "indeterminate"
  | "error";

export type DeviceSignatureCanonicalPayload = string | Uint8Array;

export interface DeviceSignatureVerificationRequest {
  readonly companyId: UUID;
  readonly registeredDeviceId: UUID;
  readonly keyVersion: number;
  readonly algorithm: string;
  readonly publicKeyFormat: string;
  readonly publicKeyMaterial: string;
  readonly publicKeyFingerprintSha256: string;
  readonly canonicalPayload: DeviceSignatureCanonicalPayload;
  readonly signature: Uint8Array;
  readonly receivedAt: ISODateTime;
  readonly context?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface DeviceSignatureVerificationResult {
  readonly verificationStatus: DeviceSignatureVerificationStatus;
  readonly adapterVersion: string;
  readonly evaluatedAt: ISODateTime;
  readonly keyVersion: number;
  readonly publicKeyFingerprintSha256: string;
  readonly canonicalPayloadSha256: string;
  readonly reasonCodes: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface DeviceSignatureVerifier {
  verify(
    request: DeviceSignatureVerificationRequest,
  ): Promise<DeviceSignatureVerificationResult>;
}

export function deviceSignatureCanonicalPayloadSha256(
  payload: DeviceSignatureCanonicalPayload,
): string {
  return createHash("sha256").update(payload).digest("hex");
}
