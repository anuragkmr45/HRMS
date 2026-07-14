import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  attendancePunchSchema,
  attendanceRegularizationCreateSchema,
  attendanceRegularizationDecisionSchema,
  paginationQuerySchema,
} from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { AttendanceService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const isoDateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const monthQuerySchema = z.string().regex(/^\d{4}-\d{2}$/u);
const idempotencyKeySchema = z.string().trim().min(8).max(200);

const attendanceQuerySchema = paginationQuerySchema.extend({
  company_id: z.uuid().optional(),
  date: isoDateQuerySchema.optional(),
  date_from: isoDateQuerySchema.optional(),
  date_to: isoDateQuerySchema.optional(),
  month: monthQuerySchema.optional(),
  user_id: z.uuid().optional(),
  department_id: z.uuid().optional(),
  status: z.string().optional(),
  exception_type: z
    .enum(["late", "missing_punch", "absent", "early_out", "correction"])
    .optional(),
});
const attendanceExportFiltersSchema = z.object({
  user_id: z.uuid().optional(),
  employee_user_id: z.uuid().optional(),
  department_id: z.uuid().optional(),
  status: z.string().optional(),
  date_from: isoDateQuerySchema.optional(),
  date_to: isoDateQuerySchema.optional(),
});

const attendanceExportSchema = z.object({
  company_id: z.uuid().optional(),
  filters: attendanceExportFiltersSchema.optional(),
  columns: z.array(z.string().min(1).max(80)).max(80).optional(),
  format: z.enum(["csv", "xlsx", "json"]).optional(),
});

export const attendanceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/punches", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const idempotencyKey = idempotencyKeySchema.parse(request.headers["idempotency-key"]);
    const service = new AttendanceService(fastify.store);
    const input = { ...attendancePunchSchema.parse(request.body), idempotency_key: idempotencyKey };
    return fastify.store.kind === "postgres"
      ? await service.punchPostgres(request.actor, input)
      : service.punch(request.actor, input);
  });

  fastify.get("/punches/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).listMyPunches(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/summary/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).mySummary(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/summary/team", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).teamSummary(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/calendar/monthly", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).monthlyCalendar(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/calendar/daily", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).dailyCalendar(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.post("/regularizations", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).createRegularization(
      request.actor,
      attendanceRegularizationCreateSchema.parse(request.body),
    );
  });

  fastify.get("/regularizations/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).myRegularizations(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/regularizations/queue/manager", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).managerRegularizationQueue(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.post("/regularizations/:id/decision", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AttendanceService(fastify.store).decideRegularization(
      request.actor,
      params.id,
      attendanceRegularizationDecisionSchema.parse(request.body),
    );
  });

  fastify.get("/exceptions", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).exceptions(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.post("/exports", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).createExportJob(
      request.actor,
      attendanceExportSchema.parse(request.body ?? {}),
    );
  });
};
