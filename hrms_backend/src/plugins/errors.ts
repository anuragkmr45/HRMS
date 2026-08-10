import fp from "fastify-plugin";
import { ZodError } from "zod";
import { ErrorCodes } from "#shared";
import { AppError } from "../platform/errors.js";

type HttpError = Error & {
  code?: string;
  statusCode?: number;
};

const approvedAppErrorHeaders = new Set(["Idempotency-Replayed"]);

export const errorsPlugin = fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      for (const [header, value] of Object.entries(error.headers ?? {})) {
        if (approvedAppErrorHeaders.has(header)) {
          reply.header(header, value);
        }
      }
      reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
        request_id: request.requestId
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        code: ErrorCodes.ValidationFailed,
        message: "Request validation failed",
        details: error.flatten(),
        request_id: request.requestId
      });
      return;
    }

    const httpError = error as HttpError;
    if (isFastifyClientValidationError(httpError)) {
      reply.status(httpError.statusCode ?? 400).send({
        code: ErrorCodes.ValidationFailed,
        message: "Request validation failed",
        details: {
          formErrors: [httpError.message],
          fieldErrors: {}
        },
        request_id: request.requestId
      });
      return;
    }

    request.log.error({ err: error }, "Unhandled API error");
    reply.status(500).send({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      request_id: request.requestId
    });
  });
});

function isFastifyClientValidationError(error: HttpError): boolean {
  return (
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    (error.code?.startsWith("FST_ERR_CTP_") ?? false)
  );
}
