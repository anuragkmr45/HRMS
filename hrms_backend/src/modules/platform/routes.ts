import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../platform/errors.js";
import { PlatformService } from "./service.js";
import { deviceRegistrationSchema, financeGovernanceUpdateSchema } from "./schemas.js";

export const platformRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/devices", async (request, reply) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = deviceRegistrationSchema.parse(request.body);
    const result = await new PlatformService(fastify.store).registerDevice(request.actor, body);
    if (result.created) {
      reply.code(201);
    }
    return result.device;
  });

  fastify.get("/devices", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new PlatformService(fastify.store).listDevices(request.actor);
  });

  fastify.get("/finance-governance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new PlatformService(fastify.store).getFinanceGovernance(request.actor);
  });

  fastify.put("/finance-governance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = financeGovernanceUpdateSchema.parse(request.body);
    return new PlatformService(fastify.store).updateFinanceGovernance(request.actor, body);
  });
};
