import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { verifyJwt } from "#auth";
import { badRequest, unauthorized } from "../../platform/errors.js";
import { AuthService } from "./service.js";
import {
  companyBootstrapSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  resendEmailVerificationSchema,
  sessionPreferenceSchema,
  setPasswordSchema,
  signupSchema,
  verifyEmailSchema
} from "./schemas.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/signup", async (request) => {
    const body = signupSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).signup(body, requestContext(request));
  });

  fastify.post("/verify-email", async (request) => {
    const body = verifyEmailSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).verifyEmail(body);
  });

  fastify.post("/email-verifications/resend", async (request) => {
    const body = resendEmailVerificationSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).resendEmailVerification(body, requestContext(request));
  });

  fastify.post("/set-password", async (request) => {
    const body = setPasswordSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).setPassword(body);
  });

  fastify.post("/password-reset/request", async (request) => {
    const body = passwordResetRequestSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).requestPasswordReset(body, requestContext(request));
  });

  fastify.post("/password-reset/confirm", async (request) => {
    const body = passwordResetConfirmSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).confirmPasswordReset(body);
  });

  fastify.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const service = new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery);
    const result = await service.login(body);
    reply.setCookie(fastify.config.SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: sessionCookieSameSite(fastify.config.COOKIE_SECURE),
      secure: fastify.config.COOKIE_SECURE,
      path: "/",
      expires: new Date(result.expires_at)
    });
    return {
      user: result.user,
      access_token: result.token,
      expires_at: result.expires_at,
      ...(result.next_step ? { next_step: result.next_step } : {}),
      ...(result.company_id ? { company_id: result.company_id } : {}),
      ...(result.dev_only ? { dev_only: result.dev_only } : {})
    };
  });

  fastify.post("/logout", async (request, reply) => {
    const token = request.cookies?.[fastify.config.SESSION_COOKIE_NAME];
    if (token) {
      try {
        const claims = verifyJwt(token, fastify.config.JWT_SECRET);
        const service = new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery);
        await service.logout(claims.jti);
      } catch {
        // Clear stale/invalid browser cookies without leaking token validity.
      }
    }
    reply.clearCookie(fastify.config.SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: sessionCookieSameSite(fastify.config.COOKIE_SECURE),
      secure: fastify.config.COOKIE_SECURE,
      path: "/"
    });
    return { status: "ok" };
  });

  fastify.get("/me", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).sessionContext(request.actor);
  });

  fastify.patch("/session/preference", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = sessionPreferenceSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).updateSessionPreference(request.actor, body);
  });
};

export const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/company-logo", async (request, reply) => {
    const startedAt = process.hrtime.bigint();
    const upload = await parseCompanyLogoUpload(request);
    appendServerTiming(reply, "multipart", startedAt);
    const uploadStartedAt = process.hrtime.bigint();
    const result = await new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).uploadCompanyLogo(upload);
    appendServerTiming(reply, "logo_upload", uploadStartedAt);
    appendServerTiming(reply, "handler", startedAt);
    return result;
  });

  fastify.post("/company-bootstrap", async (request) => {
    const body = companyBootstrapSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET, fastify.emailDelivery).bootstrapCompany(body);
  });
};

async function parseCompanyLogoUpload(request: FastifyRequest) {
  if (!request.isMultipart()) {
    throw badRequest("Company logo upload must be multipart form data");
  }
  const fields: Record<string, unknown> = {};
  let fileBuffer: Buffer | undefined;
  let fileName = "";
  let mimeType = "";
  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuffer = await part.toBuffer();
      fileName = part.filename;
      mimeType = part.mimetype || "application/octet-stream";
      continue;
    }
    fields[part.fieldname] = part.value;
  }
  const bootstrapToken = typeof fields.bootstrap_token === "string" ? fields.bootstrap_token : "";
  if (!bootstrapToken) {
    throw badRequest("Company setup token is required for logo upload");
  }
  if (!fileBuffer || fileBuffer.length <= 0) {
    throw badRequest("Company logo file is required");
  }
  return {
    bootstrap_token: bootstrapToken,
    file_buffer: fileBuffer,
    file_name: fileName || "company-logo",
    mime_type: mimeType,
    size_bytes: fileBuffer.length
  };
}

function sessionCookieSameSite(cookieSecure: boolean): "lax" | "none" {
  return cookieSecure ? "none" : "lax";
}

function appendServerTiming(reply: FastifyReply, name: string, startedAt: bigint): void {
  const value = `${name};dur=${durationMs(startedAt).toFixed(1)}`;
  const existing = reply.getHeader("Server-Timing");
  const prefix = typeof existing === "string"
    ? existing
    : Array.isArray(existing)
      ? existing.join(", ")
      : "";
  reply.header("Server-Timing", prefix ? `${prefix}, ${value}` : value);
}

function durationMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function requestContext(request: FastifyRequest): { ip: string; userAgent?: string } {
  const userAgent = request.headers["user-agent"];
  return {
    ip: request.ip,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent
  };
}
