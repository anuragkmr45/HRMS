import type { FastifyPluginAsync } from "fastify";
import { locationRoutes } from "./routes.js";

const locationsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(locationRoutes, { prefix: "/api/v1/locations" });
};

export default locationsModule;
