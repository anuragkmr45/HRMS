import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { unauthorized } from "../../platform/errors.js";
import { PlatformService } from "./service.js";
import { deviceLifecycleSchema, deviceRegistrationSchema, financeGovernanceUpdateSchema } from "./schemas.js";

const deviceIdParamSchema = z.object({ deviceId: z.uuid() });

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

  fastify.post("/devices/:deviceId/revoke", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = deviceIdParamSchema.parse(request.params);
    const body = deviceLifecycleSchema.parse(request.body ?? {});
    return new PlatformService(fastify.store).revokeDevice(
      request.actor,
      params.deviceId,
      body,
    );
  });

  fastify.post("/devices/:deviceId/suspend", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = deviceIdParamSchema.parse(request.params);
    const body = deviceLifecycleSchema.parse(request.body ?? {});
    return new PlatformService(fastify.store).suspendDevice(
      request.actor,
      params.deviceId,
      body,
    );
  });

  fastify.post("/devices/:deviceId/restore", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = deviceIdParamSchema.parse(request.params);
    const body = deviceLifecycleSchema.parse(request.body ?? {});
    return new PlatformService(fastify.store).restoreDevice(
      request.actor,
      params.deviceId,
      body,
    );
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
