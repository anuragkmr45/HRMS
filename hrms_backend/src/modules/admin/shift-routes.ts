import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { unauthorized } from "../../platform/errors.js";
import {
  shiftAssignmentCreateSchema,
  shiftAssignmentQuerySchema,
  shiftAssignmentUpdateSchema,
  shiftTemplateCreateSchema,
  shiftTemplateQuerySchema,
  shiftTemplateUpdateSchema,
  shiftVersionInputSchema,
} from "./shift-schemas.js";
import { ShiftAdminService } from "./shift-service.js";

const idParamSchema = z.object({ id: z.uuid() });

export const shiftAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/templates", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ShiftAdminService(fastify.store).listTemplates(
      request.actor,
      shiftTemplateQuerySchema.parse(request.query),
    );
  });

  fastify.post("/templates", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ShiftAdminService(fastify.store).createTemplate(
      request.actor,
      shiftTemplateCreateSchema.parse(request.body),
    );
  });

  fastify.patch("/templates/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ShiftAdminService(fastify.store).updateTemplate(
      request.actor,
      params.id,
      shiftTemplateUpdateSchema.parse(request.body),
    );
  });

  fastify.get("/templates/:id/versions", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ShiftAdminService(fastify.store).listVersions(
      request.actor,
      params.id,
    );
  });

  fastify.post("/templates/:id/versions", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ShiftAdminService(fastify.store).createVersion(
      request.actor,
      params.id,
      shiftVersionInputSchema.parse(request.body),
    );
  });

  fastify.get("/assignments", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ShiftAdminService(fastify.store).listAssignments(
      request.actor,
      shiftAssignmentQuerySchema.parse(request.query),
    );
  });

  fastify.post("/assignments", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ShiftAdminService(fastify.store).createAssignments(
      request.actor,
      shiftAssignmentCreateSchema.parse(request.body),
    );
  });

  fastify.patch("/assignments/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ShiftAdminService(fastify.store).updateAssignment(
      request.actor,
      params.id,
      shiftAssignmentUpdateSchema.parse(request.body),
    );
  });

  fastify.get("/references", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ShiftAdminService(fastify.store).references(request.actor);
  });
};
