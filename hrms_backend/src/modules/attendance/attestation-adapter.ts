import type { ISODateTime } from "#shared";

export type AttestationProvider =
  | "google_play_integrity"
  | "apple_app_attest";

export type AttestationVerificationStatus =
  | "verified"
  | "rejected"
  | "indeterminate"
  | "error";
  
export type AttestationSha256Hex = string;

export type AttestationJsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: AttestationJsonValue }
  | readonly AttestationJsonValue[];

export type AttestationJsonObject = {
  readonly [key: string]: AttestationJsonValue;
};

export interface AttestationVerificationRequest {
  readonly artifact: string | Uint8Array;

  readonly expectedChallengeBindingHash?: AttestationSha256Hex;

  readonly expectedApplicationIdentifier?: string;

  readonly receivedAt: ISODateTime;
}

export interface AttestationVerificationResult {
  readonly verificationStatus: AttestationVerificationStatus;

  readonly normalizedVerdict: AttestationJsonObject;

  readonly reasonCodes: readonly string[];

  readonly providerIssuedAt?: ISODateTime;

  readonly evaluatedAt: ISODateTime;

  readonly artifactHash?: AttestationSha256Hex;

  readonly providerMetadata: AttestationJsonObject;

  readonly adapterVersion: string;
}

export interface AttestationAdapter {
  readonly provider: AttestationProvider;

  verify(
    request: AttestationVerificationRequest,
  ): Promise<AttestationVerificationResult>;
}