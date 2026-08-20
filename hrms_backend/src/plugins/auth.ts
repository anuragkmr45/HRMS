import fp from "fastify-plugin";
import { verifyJwt } from "#auth";
import { unauthorized } from "../platform/errors.js";

export interface SelectedAuthToken {
  token: string | undefined;
  source: "bearer" | "cookie" | "none";
}

export function selectAuthToken(input: {
  authorization?: string;
  cookieToken?: string;
}): SelectedAuthToken {
  const bearerToken = parseBearerToken(input.authorization);
  if (bearerToken !== undefined) {
    return { token: bearerToken, source: "bearer" };
  }
  const cookieToken = input.cookieToken?.trim();
  if (cookieToken) {
    return { token: cookieToken, source: "cookie" };
  }
  return { token: undefined, source: "none" };
}

export const authPlugin = fp(async (fastify) => {
  fastify.decorateRequest("actor");

  fastify.addHook("preHandler", async (request) => {
    const publicPaths = new Set([
      "/health/live",
      "/health/ready",
      "/api/v1/health/live",
      "/api/v1/health/ready",
      "/api/v1/auth/signup",
      "/api/v1/auth/verify-email",
      "/api/v1/auth/email-verifications/resend",
      "/api/v1/auth/set-password",
      "/api/v1/auth/password-reset/request",
      "/api/v1/auth/password-reset/confirm",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/onboarding/company-logo",
      "/api/v1/onboarding/company-bootstrap",
      "/api/v1/webhooks/resend"
    ]);
    if (fastify.config.OPENAPI_PUBLIC) {
      publicPaths.add("/api/v1/openapi.json");
    }
    const path = request.url.split("?")[0] ?? request.url;
    if (publicPaths.has(path)) {
      return;
    }
    if (fastify.config.OPENAPI_PUBLIC && (path === "/docs" || path.startsWith("/docs/"))) {
      return;
    }
    if (request.url.startsWith("/api/v1/assets/scan/")) {
      return;
    }

    const cookieToken = request.cookies?.[fastify.config.SESSION_COOKIE_NAME];
    const selected = selectAuthToken({
      authorization: request.headers.authorization,
      cookieToken
    });
    if (!selected.token) {
      throw selected.source === "bearer" ? unauthorized("Invalid or expired session") : unauthorized();
    }

    let claims: ReturnType<typeof verifyJwt>;
    try {
      claims = verifyJwt(selected.token, fastify.config.JWT_SECRET);
    } catch {
      throw unauthorized("Invalid or expired session");
    }
    const session = await fastify.store.sessionStore.get(claims.jti);
    if (!session || session.revoked_at) {
      throw unauthorized("Session has been revoked");
    }
    const actor = fastify.store.users.find((user) => user.id === claims.sub && !user.deleted_at);
    if (!actor) {
      throw unauthorized("User no longer exists");
    }
    request.actor = actor;
  });
});

function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const match = /^Bearer(?:\s+(.+))?$/iu.exec(authorization.trim());
  return match ? (match[1]?.trim() ?? "") : undefined;
}
