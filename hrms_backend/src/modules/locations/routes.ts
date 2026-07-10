import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { unauthorized } from "../../platform/errors.js";
import { searchIndiaLocations } from "./india-locations.js";

const indiaLocationQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

export const locationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/india", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = indiaLocationQuerySchema.parse(request.query);
    return searchIndiaLocations(query.search ?? "", query.limit);
  });
};
