import type { FastifyInstance } from "fastify";
import type { AuthUser, ISODateTime } from "#shared";
import {
  deviceSignatureCanonicalPayloadSha256,
  type DeviceSignatureVerificationRequest,
  type DeviceSignatureVerificationResult,
  type DeviceSignatureVerificationStatus,
  type DeviceSignatureVerifier,
} from "../modules/platform/device-signature-verifier.js";

export async function loginAs(app: FastifyInstance, employeeCode: string): Promise<{ token: string; user: AuthUser }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { employee_code: employeeCode }
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${employeeCode}: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { access_token: string; user: AuthUser };
  return { token: body.access_token, user: body.user };
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export type FakeDeviceSignatureVerifierMode =
  | DeviceSignatureVerificationStatus
  | "throw";

export interface FakeDeviceSignatureVerifierOptions {
  mode?: FakeDeviceSignatureVerifierMode;
  adapterVersion?: string;
  evaluatedAt?: ISODateTime;
  reasonCodes?: readonly string[];
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
  errorMessage?: string;
}

export class FakeDeviceSignatureVerifier implements DeviceSignatureVerifier {
  readonly requests: DeviceSignatureVerificationRequest[] = [];

  private mode: FakeDeviceSignatureVerifierMode;
  private adapterVersion: string;
  private evaluatedAt: ISODateTime;
  private reasonCodes?: readonly string[];
  private metadata: Readonly<Record<string, string | number | boolean | null>>;
  private errorMessage: string;

  constructor(options: FakeDeviceSignatureVerifierOptions = {}) {
    this.mode = options.mode ?? "verified";
    this.adapterVersion = options.adapterVersion ?? "fake-device-signature-verifier-v1";
    this.evaluatedAt = options.evaluatedAt ?? "2026-08-10T00:00:00.000Z";
    this.reasonCodes = options.reasonCodes;
    this.metadata = options.metadata ?? {};
    this.errorMessage = options.errorMessage ?? "Fake device signature verifier failure.";
  }

  configure(options: FakeDeviceSignatureVerifierOptions): void {
    this.mode = options.mode ?? this.mode;
    this.adapterVersion = options.adapterVersion ?? this.adapterVersion;
    this.evaluatedAt = options.evaluatedAt ?? this.evaluatedAt;
    this.reasonCodes = options.reasonCodes ?? this.reasonCodes;
    this.metadata = options.metadata ?? this.metadata;
    this.errorMessage = options.errorMessage ?? this.errorMessage;
  }

  async verify(
    request: DeviceSignatureVerificationRequest,
  ): Promise<DeviceSignatureVerificationResult> {
    this.requests.push(request);
    if (this.mode === "throw") {
      throw new Error(this.errorMessage);
    }

    return {
      verificationStatus: this.mode,
      adapterVersion: this.adapterVersion,
      evaluatedAt: this.evaluatedAt,
      keyVersion: request.keyVersion,
      publicKeyFingerprintSha256: request.publicKeyFingerprintSha256,
      canonicalPayloadSha256: deviceSignatureCanonicalPayloadSha256(
        request.canonicalPayload,
      ),
      reasonCodes: this.reasonCodes ?? defaultDeviceSignatureReasonCodes(this.mode),
      metadata: {
        algorithm: request.algorithm,
        public_key_format: request.publicKeyFormat,
        ...this.metadata,
      },
    };
  }
}

function defaultDeviceSignatureReasonCodes(
  status: DeviceSignatureVerificationStatus,
): readonly string[] {
  switch (status) {
    case "verified":
      return ["device_signature.verified"];
    case "rejected":
      return ["device_signature.rejected"];
    case "indeterminate":
      return ["device_signature.indeterminate"];
    case "error":
      return ["device_signature.error"];
  }
}

export const projectTravelPayload = {
  submit: true,
  expense_type: "Project",
  expense_sub_type: "Project Travel",
  project_code: "PRJ-100",
  task_title: "Client implementation travel",
  task_description: "Travel for implementation workshop",
  location: "Mumbai",
  start_date: "2026-05-01",
  end_date: "2026-05-03",
  estimated_amount: "1000.00",
  payment_type: "Advance",
  advance_amount: "500.00",
  line_items: [
    {
      line_category: "travel",
      description: "Flight",
      line_total: "700.00"
    },
    {
      line_category: "lodging",
      description: "Hotel",
      line_total: "300.00"
    }
  ]
};
