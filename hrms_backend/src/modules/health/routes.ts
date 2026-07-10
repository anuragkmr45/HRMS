import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { createReadinessChecker } from "./service.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const checkReadiness = createReadinessChecker(fastify);

  const live = async () => ({
    status: "ok",
    service: "hawkaii-hrms-api",
    app_env: fastify.config.APP_ENV,
    version: fastify.config.APP_VERSION,
    build_sha: fastify.config.BUILD_SHA ?? null,
    uptime_seconds: Math.round(process.uptime())
  });

  const ready = async (_request: unknown, reply: FastifyReply) => {
    const readiness = await checkReadiness();
    const checks = readiness.checks;
    return reply.status(readiness.isReady ? 200 : 503).send({
      status: readiness.isReady ? "ok" : "degraded",
      app_env: fastify.config.APP_ENV,
      node_env: fastify.config.NODE_ENV,
      version: fastify.config.APP_VERSION,
      build_sha: fastify.config.BUILD_SHA ?? null,
      uptime_seconds: Math.round(process.uptime()),
      data_store: fastify.store.kind,
      dependencies: checks,
      database: checks.database.status,
      valkey: checks.valkey.status,
      object_storage: checks.object_storage.status
    });
  };

  fastify.get("/health/live", live);
  fastify.get("/health/ready", ready);
  fastify.get("/api/v1/health/live", live);
  fastify.get("/api/v1/health/ready", ready);
};
