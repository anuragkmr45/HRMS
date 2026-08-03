import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  attendancePunchCommandEnvelopeSchema,
  attendanceAssistedCurrentPunchSchema,
  attendanceHistoricalCorrectionSchema,
  attendanceRegularizationCreateSchema,
  attendanceRegularizationDecisionSchema,
  isoDateTimeSchema,
  paginationQuerySchema,
} from "#shared";
import { badRequest, unauthorized } from "../../platform/errors.js";
import { AttendanceService } from "./service.js";
import {
  ATTENDANCE_IDEMPOTENCY_REPLAY_HEADER,
  isAttendanceReplayResponse,
} from "./command-service.js";

const idParamSchema = z.object({ id: z.uuid() });
const geofencePublishParamSchema = z.object({
  geofenceId: z.uuid(),
  versionId: z.uuid(),
});
const employeeParamSchema = z.object({ employeeUserId: z.uuid() });
const isoDateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const monthQuerySchema = z.string().regex(/^\d{4}-\d{2}$/u);
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const clientEventIdHeaderSchema = z.uuid();

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
const geofenceVersionPublishSchema = z.object({
  effectiveFrom: isoDateTimeSchema,
  effectiveUntil: isoDateTimeSchema.nullish(),
}).strict();

export const attendanceRoutes: FastifyPluginAsync = async (fastify) => {
  const withReplayHeader = (
    reply: { header: (name: string, value: string) => unknown },
    response: Record<string, unknown>,
  ) => {
    if (isAttendanceReplayResponse(response)) {
      reply.header(ATTENDANCE_IDEMPOTENCY_REPLAY_HEADER, "true");
    }
    return response;
  };

  fastify.post("/punches", async (request, reply) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const idempotencyKey = clientEventIdHeaderSchema.parse(
      request.headers["idempotency-key"],
    );
    const service = new AttendanceService(fastify.store);
    const input = attendancePunchCommandEnvelopeSchema.parse(request.body);
    if (input.client_event_id !== idempotencyKey) {
      throw badRequest("Idempotency-Key header must match body client_event_id.", {
        header: "Idempotency-Key",
        field: "client_event_id",
      });
    }
    const response = fastify.store.kind === "postgres"
      ? await service.recordEmployeeManualNowPostgres(
        request.actor,
        input.command,
        idempotencyKey,
        {
          clientEventId: input.client_event_id,
          capturedAt: input.captured_at,
          device: input.device,
        },
      )
      : service.recordEmployeeManualNow(request.actor, input.command);
    return withReplayHeader(reply, response);
  });

  fastify.post("/employees/:employeeUserId/assisted-current-punches", async (request, reply) => {
    if (!request.actor) throw unauthorized();
    const idempotencyKey = idempotencyKeySchema.parse(request.headers["idempotency-key"]);
    const params = employeeParamSchema.parse(request.params);
    const input = attendanceAssistedCurrentPunchSchema.parse(request.body);
    const service = new AttendanceService(fastify.store);
    const response = fastify.store.kind === "postgres"
      ? await service.recordManagerAssistedCurrentPunchPostgres(request.actor, params.employeeUserId, input, idempotencyKey)
      : service.recordManagerAssistedCurrentPunch(request.actor, params.employeeUserId, input);
    return withReplayHeader(reply, response);
  });

  fastify.post("/employees/:employeeUserId/historical-corrections", async (request, reply) => {
    if (!request.actor) throw unauthorized();
    const idempotencyKey = idempotencyKeySchema.parse(request.headers["idempotency-key"]);
    const params = employeeParamSchema.parse(request.params);
    const input = attendanceHistoricalCorrectionSchema.parse(request.body);
    const response = await new AttendanceService(fastify.store).recordHistoricalCorrection(
      request.actor,
      params.employeeUserId,
      input,
      idempotencyKey,
    );
    return withReplayHeader(reply, response);
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
    const input = attendanceRegularizationDecisionSchema.parse(request.body);
    const service = new AttendanceService(fastify.store);
    if (fastify.store.kind === "postgres") {
      return service.decideRegularizationPostgres(request.actor, params.id, input);
    }
    return service.decideRegularization(request.actor, params.id, input);
  });

  fastify.post("/geofences/:geofenceId/versions/:versionId/publish", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = geofencePublishParamSchema.parse(request.params);
    const input = geofenceVersionPublishSchema.parse(request.body);
    return new AttendanceService(fastify.store).publishGeofenceVersion(
      request.actor,
      params.geofenceId,
      params.versionId,
      {
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil ?? null,
      },
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
