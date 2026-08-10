import type { FastifyPluginAsync } from "fastify";
import { platformRoutes } from "./routes.js";

export type {
  DeviceSignatureCanonicalPayload,
  DeviceSignatureVerificationRequest,
  DeviceSignatureVerificationResult,
  DeviceSignatureVerificationStatus,
  DeviceSignatureVerifier,
} from "./device-signature-verifier.js";
export {
  deviceSignatureCanonicalPayloadSha256,
} from "./device-signature-verifier.js";

const platformModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(platformRoutes, { prefix: "/api/v1/platform" });
};

export default platformModule;
