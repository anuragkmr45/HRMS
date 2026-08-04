import type { FastifyPluginAsync } from "fastify";
import { attendanceRoutes } from "./routes.js";

export type {
  AttestationAdapter,
  AttestationJsonObject,
  AttestationJsonValue,
  AttestationProvider,
  AttestationSha256Hex,
  AttestationVerificationRequest,
  AttestationVerificationResult,
  AttestationVerificationStatus,
} from "./attestation-adapter.js";

const attendanceModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(attendanceRoutes, { prefix: "/api/v1/attendance" });
};

export default attendanceModule;
