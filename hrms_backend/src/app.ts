import "./platform/decorators.js";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type {
  AuthPersistenceFlushOptions,
  CompanyLogoPersistenceFlushOptions,
  DataStore,
  DomainPersistenceFlushOptions,
  PersistenceDomain
} from "./platform/data-store.js";
import { createMemoryDataStore } from "./platform/data-store.js";
import { createPostgresDataStore, type PostgresObjectStorageOptions } from "./platform/postgres-data-store.js";
import { createEmailDeliveryService } from "./platform/email/email-delivery-service.js";
import type { EmailProvider } from "./platform/email/types.js";
import { openApiComponents, openApiTags, swaggerTransform, swaggerTransformObject } from "./platform/openapi.js";
import { configPlugin } from "./plugins/config.js";
import { requestContextPlugin } from "./plugins/request-context.js";
import { errorsPlugin } from "./plugins/errors.js";
import { compressionPlugin } from "./plugins/compress.js";
import { cookiesPlugin } from "./plugins/cookies.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { securityHeadersPlugin } from "./plugins/security-headers.js";
import healthModule from "./modules/health/index.js";
import authModule from "./modules/auth/index.js";
import coreModule from "./modules/core/index.js";
import dashboardModule from "./modules/dashboard/index.js";
import platformModule from "./modules/platform/index.js";
import expensesModule from "./modules/expenses/index.js";
import documentsModule from "./modules/documents/index.js";
import reportsModule from "./modules/reports/index.js";
import assetsModule from "./modules/assets/index.js";
import timesheetsModule from "./modules/timesheets/index.js";
import attendanceModule from "./modules/attendance/index.js";
import leaveWfhModule from "./modules/leave-wfh/index.js";
import emsModule from "./modules/ems/index.js";
import projectsModule from "./modules/projects/index.js";
import helpdeskModule from "./modules/helpdesk/index.js";
import locationsModule from "./modules/locations/index.js";
import notificationsModule from "./modules/notifications/index.js";
import adminModule from "./modules/admin/index.js";
import webhooksModule from "./modules/webhooks/index.js";

export interface BuildAppOptions {
  logger?: boolean;
  dataStore?: DataStore;
  emailProvider?: EmailProvider;
  dataStoreMode?: "postgres" | "memory";
  seedIfEmpty?: boolean;
  rateLimit?: false | {
    authMax?: number;
    publicMax?: number;
    readMax?: number;
    writeMax?: number;
    windowSeconds?: number;
  };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(options.logger ?? false),
    genReqId: () => crypto.randomUUID(),
    trustProxy: booleanFromEnv(process.env.TRUST_PROXY, false)
  });

  await app.register(configPlugin);
  if (options.rateLimit && typeof options.rateLimit === "object") {
    app.config.RATE_LIMIT_AUTH_MAX = options.rateLimit.authMax ?? app.config.RATE_LIMIT_AUTH_MAX;
    app.config.RATE_LIMIT_PUBLIC_MAX = options.rateLimit.publicMax ?? app.config.RATE_LIMIT_PUBLIC_MAX;
    app.config.RATE_LIMIT_READ_MAX = options.rateLimit.readMax ?? app.config.RATE_LIMIT_READ_MAX;
    app.config.RATE_LIMIT_WRITE_MAX = options.rateLimit.writeMax ?? app.config.RATE_LIMIT_WRITE_MAX;
    app.config.RATE_LIMIT_WINDOW_SECONDS = options.rateLimit.windowSeconds ?? app.config.RATE_LIMIT_WINDOW_SECONDS;
  }
  const store = options.dataStore ?? await createRuntimeStore(app.config, options);
  app.decorate("store", store);
  app.decorate("emailDelivery", createEmailDeliveryService(store, {
    provider: app.config.EMAIL_DELIVERY_PROVIDER,
    mode: app.config.EMAIL_DELIVERY_MODE,
    resendApiKey: app.config.RESEND_API_KEY,
    resendFromEmail: app.config.RESEND_FROM_EMAIL,
    resendFromName: app.config.RESEND_FROM_NAME,
    resendReplyToEmail: app.config.RESEND_REPLY_TO_EMAIL,
    resendWebhookSecret: app.config.RESEND_WEBHOOK_SECRET,
    resendRequestTimeoutMs: app.config.RESEND_REQUEST_TIMEOUT_MS,
    frontendUrl: app.config.FRONTEND_URL,
    appUrl: app.config.APP_URL,
    verificationTokenTtlSeconds: app.config.EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
    verificationResendCooldownSeconds: app.config.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    verificationResendHourlyLimit: app.config.EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT,
    verificationResendDailyLimit: app.config.EMAIL_VERIFICATION_RESEND_DAILY_LIMIT
  }, options.emailProvider));
  const requestStartTimes = new WeakMap<object, bigint>();
  app.addHook("onRequest", async (request) => {
    requestStartTimes.set(request, process.hrtime.bigint());
  });
  app.addHook("onSend", async (request, reply, payload) => {
    const requestStartedAt = requestStartTimes.get(request);
    if (requestStartedAt) {
      appendServerTiming(reply, "handler", requestStartedAt);
    }
    if (app.store.persistence) {
      const flushTarget = persistenceFlushTarget(request.method, request.url, reply.statusCode);
      const startedAt = process.hrtime.bigint();
      if (flushTarget.kind === "auth" && app.store.persistence.flushAuth) {
        await app.store.persistence.flushAuth(authPersistenceFlushOptions(payload));
        appendServerTiming(reply, "persistence.auth", startedAt);
      } else if (flushTarget.kind === "company-bootstrap" && app.store.persistence.flushCompanyBootstrap) {
        await app.store.persistence.flushCompanyBootstrap(authPersistenceFlushOptions(payload));
        appendServerTiming(reply, "persistence.company_bootstrap", startedAt);
      } else if (flushTarget.kind === "company-logo" && app.store.persistence.flushCompanyLogo) {
        await app.store.persistence.flushCompanyLogo(companyLogoPersistenceFlushOptions(payload));
        appendServerTiming(reply, "persistence.company_logo", startedAt);
      } else if (flushTarget.kind === "domain" && app.store.persistence.flushDomain) {
        await app.store.persistence.flushDomain(flushTarget.domain, domainPersistenceFlushOptions(flushTarget.domain, payload));
        appendServerTiming(reply, `persistence.${flushTarget.domain.replace("-", "_")}`, startedAt);
      } else if (flushTarget.kind === "full") {
        request.log.warn(
          { method: request.method, route: request.routeOptions.url ?? (request.url.split("?")[0] ?? request.url) },
          "Using full persistence flush fallback for mutation route"
        );
        await app.store.persistence.flush();
        appendServerTiming(reply, "persistence.full", startedAt);
      }
    }
    return payload;
  });
  app.addHook("onClose", async () => {
    await app.store.persistence?.close();
  });
  await app.register(requestContextPlugin);
  await app.register(errorsPlugin);
  await app.register(securityHeadersPlugin);
  await app.register(cors, corsOptions(app.config));
  await app.register(multipart, {
    limits: {
      fileSize: Math.max(
        app.config.MEDIA_UPLOAD_MAX_BYTES,
        app.config.PROFILE_PHOTO_MAX_BYTES,
        app.config.COMPANY_LOGO_MAX_BYTES
      )
    }
  });
  await app.register(compressionPlugin);
  await app.register(cookiesPlugin);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Hawkaii HRMS API",
        version: "0.1.0"
      },
      tags: openApiTags,
      components: openApiComponents as never
    },
    transform: swaggerTransform,
    transformObject: swaggerTransformObject
  });
  if (app.config.OPENAPI_PUBLIC) {
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }
  await app.register(authPlugin);
  if (options.rateLimit !== false) {
    await app.register(rateLimitPlugin);
  }
  await app.register(webhooksModule);
  await app.register(healthModule);
  await app.register(authModule);
  await app.register(coreModule);
  await app.register(dashboardModule);
  await app.register(platformModule);
  await app.register(expensesModule);
  await app.register(documentsModule);
  await app.register(reportsModule);
  await app.register(assetsModule);
  await app.register(timesheetsModule);
  await app.register(attendanceModule);
  await app.register(leaveWfhModule);
  await app.register(emsModule);
  await app.register(projectsModule);
  await app.register(helpdeskModule);
  await app.register(locationsModule);
  await app.register(notificationsModule);
  await app.register(adminModule);

  if (app.config.OPENAPI_PUBLIC) {
    app.get("/api/v1/openapi.json", async () => app.swagger());
  }

  return app;
}

function booleanFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const sessionOnlyMutationRoutes = new Set([
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout"
]);

const authOnlyMutationRoutes = new Set([
  "POST /api/v1/auth/signup",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/password-reset/confirm",
  "PATCH /api/v1/auth/session/preference"
]);

const companyBootstrapMutationRoutes = new Set([
  "POST /api/v1/onboarding/company-bootstrap"
]);

const companyLogoMutationRoutes = new Set([
  "POST /api/v1/onboarding/company-logo"
]);

type PersistenceFlushTarget =
  | { kind: "none" }
  | { kind: "auth" }
  | { kind: "company-bootstrap" }
  | { kind: "company-logo" }
  | { kind: "domain"; domain: PersistenceDomain }
  | { kind: "full" };

const domainMutationPrefixes: Array<{ prefix: string; domain: PersistenceDomain }> = [
  { prefix: "/api/v1/core", domain: "core" },
  { prefix: "/api/v1/ems", domain: "ems" },
  { prefix: "/api/v1/attendance", domain: "attendance" },
  { prefix: "/api/v1/leave-wfh", domain: "leave-wfh" },
  { prefix: "/api/v1/timesheets", domain: "timesheets" },
  { prefix: "/api/v1/expenses", domain: "expenses" },
  { prefix: "/api/v1/assets", domain: "assets" },
  { prefix: "/api/v1/projects", domain: "projects" },
  { prefix: "/api/v1/helpdesk", domain: "helpdesk" },
  { prefix: "/api/v1/documents", domain: "documents" },
  { prefix: "/api/v1/admin", domain: "platform" },
  { prefix: "/api/v1/platform", domain: "platform" },
  { prefix: "/api/v1/manager-backups", domain: "platform" },
  { prefix: "/api/v1/notifications", domain: "platform" },
  { prefix: "/api/v1/webhooks", domain: "platform" }
];

function persistenceFlushTarget(method: string, url: string, statusCode: number): PersistenceFlushTarget {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { kind: "none" };
  }
  if (statusCode < 200 || statusCode >= 400) {
    return { kind: "none" };
  }
  const path = url.split("?")[0] ?? url;
  const routeKey = `${method.toUpperCase()} ${path}`;
  if (sessionOnlyMutationRoutes.has(routeKey)) {
    return { kind: "none" };
  }
  if (authOnlyMutationRoutes.has(routeKey)) {
    return { kind: "auth" };
  }
  if (companyBootstrapMutationRoutes.has(routeKey)) {
    return { kind: "company-bootstrap" };
  }
  if (companyLogoMutationRoutes.has(routeKey)) {
    return { kind: "company-logo" };
  }
  const domain = domainForMutationPath(path);
  return domain ? { kind: "domain", domain } : { kind: "full" };
}

function domainForMutationPath(path: string): PersistenceDomain | null {
  const match = domainMutationPrefixes.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
  return match?.domain ?? null;
}

function domainPersistenceFlushOptions(domain: PersistenceDomain, payload: unknown): DomainPersistenceFlushOptions | undefined {
  const record = responsePayloadRecord(payload);
  if (!record) return undefined;
  if (domain === "ems") return emsPersistenceFlushOptions(record);
  if (domain === "core") return corePersistenceFlushOptions(record);
  if (domain === "documents") return documentPersistenceFlushOptions(record);
  return aggregatePersistenceFlushOptions(record);
}

function corePersistenceFlushOptions(record: Record<string, unknown>): DomainPersistenceFlushOptions | undefined {
  const user = nestedPayloadRecord(record.user);
  const document = nestedPayloadRecord(record.document);
  const userIds = uniqueStrings([record.user_id, record.id, user?.id]);
  const companyIds = uniqueStrings([record.company_id, user?.company_id]);
  const documentIds = uniqueStrings([record.document_id, document?.id, user?.profile_photo_document_id]);
  const aggregateIds = uniqueStrings([record.aggregate_id, record.user_id, user?.id, record.id]);
  if (!userIds.length && !companyIds.length && !documentIds.length && !aggregateIds.length) return undefined;
  return {
    ...(userIds.length ? { userIds } : {}),
    ...(companyIds.length ? { companyIds } : {}),
    ...(documentIds.length ? { documentIds } : {}),
    ...(aggregateIds.length ? { aggregateIds } : {})
  };
}

function emsPersistenceFlushOptions(record: Record<string, unknown>): DomainPersistenceFlushOptions | undefined {
  const request = nestedPayloadRecord(record.request);
  const profile = nestedPayloadRecord(record.profile);
  const profileBody = nestedPayloadRecord(profile?.profile);
  const profileUser = nestedPayloadRecord(profileBody?.user);
  const generatedLetter = nestedPayloadRecord(record.generated_letter);
  const letter = nestedPayloadRecord(record.letter) ?? generatedLetter;
  const policy = nestedPayloadRecord(record.policy);
  const checklist = nestedPayloadRecord(record.checklist);
  const review = nestedPayloadRecord(record.review);
  const document = nestedPayloadRecord(record.document);

  const requestId = firstString(record.request_id, request?.id);
  const requestEmployeeUserId = firstString(request?.employee_user_id, request?.requester_user_id);
  const userIds = uniqueStrings([record.user_id, requestEmployeeUserId, profileUser?.id]);
  const documentIds = uniqueStrings([record.document_id, document?.id, letter?.document_id, policy?.document_id]);
  const profileChangeRequestIds = request && "field_key" in request ? uniqueStrings([requestId]) : [];
  const serviceRequestIds = request && "request_type" in request ? uniqueStrings([requestId]) : [];
  const letterIds = uniqueStrings([letter?.id]);
  const policyIds = uniqueStrings([policy?.id]);
  const adminChecklistIds = uniqueStrings([checklist?.id]);
  const probationReviewIds = uniqueStrings([review?.id]);
  const aggregateIds = uniqueStrings([
    requestId,
    letter?.id,
    policy?.id,
    checklist?.id,
    review?.id,
    document?.id
  ]);

  if (
    !userIds.length &&
    !documentIds.length &&
    !profileChangeRequestIds.length &&
    !serviceRequestIds.length &&
    !letterIds.length &&
    !policyIds.length &&
    !adminChecklistIds.length &&
    !probationReviewIds.length &&
    !aggregateIds.length
  ) {
    return undefined;
  }

  return {
    ...(userIds.length ? { userIds } : {}),
    ...(documentIds.length ? { documentIds } : {}),
    ...(profileChangeRequestIds.length ? { emsProfileChangeRequestIds: profileChangeRequestIds } : {}),
    ...(serviceRequestIds.length ? { emsServiceRequestIds: serviceRequestIds } : {}),
    ...(letterIds.length ? { emsLetterIds: letterIds } : {}),
    ...(policyIds.length ? { emsPolicyIds: policyIds } : {}),
    ...(adminChecklistIds.length ? { emsAdminChecklistIds: adminChecklistIds } : {}),
    ...(probationReviewIds.length ? { emsProbationReviewIds: probationReviewIds } : {}),
    ...(aggregateIds.length ? { aggregateIds } : {})
  };
}

function documentPersistenceFlushOptions(record: Record<string, unknown>): DomainPersistenceFlushOptions | undefined {
  const document = nestedPayloadRecord(record.document);
  const documentIds = uniqueStrings([record.document_id, document?.id, record.id]);
  const aggregateIds = uniqueStrings([record.aggregate_id, record.document_id, document?.id, record.id]);
  if (!documentIds.length && !aggregateIds.length) return undefined;
  return {
    ...(documentIds.length ? { documentIds } : {}),
    ...(aggregateIds.length ? { aggregateIds } : {})
  };
}

function aggregatePersistenceFlushOptions(record: Record<string, unknown>): DomainPersistenceFlushOptions | undefined {
  const nestedCandidates = [
    nestedPayloadRecord(record.ticket),
    nestedPayloadRecord(record.asset),
    nestedPayloadRecord(record.request),
    nestedPayloadRecord(record.project),
    nestedPayloadRecord(record.submission),
    nestedPayloadRecord(record.punch),
    nestedPayloadRecord(record.leave_request),
    nestedPayloadRecord(record.wfh_request),
    nestedPayloadRecord(record.holiday),
    nestedPayloadRecord(record.vendor),
    nestedPayloadRecord(record.category),
    nestedPayloadRecord(record.workflow),
    nestedPayloadRecord(record.policy),
    nestedPayloadRecord(record.template),
    nestedPayloadRecord(record.notification)
  ];
  const aggregateIds = uniqueStrings([
    record.id,
    record.request_id,
    record.ticket_id,
    record.asset_id,
    record.project_id,
    record.submission_id,
    record.aggregate_id,
    ...nestedCandidates.flatMap((candidate) => [candidate?.id, candidate?.aggregate_id])
  ]);
  return aggregateIds.length ? { aggregateIds } : undefined;
}

function firstString(...values: readonly unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function authPersistenceFlushOptions(payload: unknown): AuthPersistenceFlushOptions | undefined {
  const record = responsePayloadRecord(payload);
  if (!record) return undefined;

  const company = nestedPayloadRecord(record.company);
  const adminUser = nestedPayloadRecord(record.admin_user);
  const user = nestedPayloadRecord(record.user);
  const userIds = uniqueStrings([record.user_id, record.signup_id, adminUser?.id, user?.id]);
  const companyIds = uniqueStrings([record.company_id, company?.id, company?.company_id]);
  if (!userIds.length && !companyIds.length) return undefined;
  return {
    ...(userIds.length ? { userIds } : {}),
    ...(companyIds.length ? { companyIds } : {})
  };
}

function companyLogoPersistenceFlushOptions(payload: unknown): CompanyLogoPersistenceFlushOptions | undefined {
  const record = responsePayloadRecord(payload);
  if (!record) return undefined;

  const company = nestedPayloadRecord(record.company);
  const document = nestedPayloadRecord(record.document);
  const companyIds = uniqueStrings([record.company_id, company?.id, company?.company_id]);
  const documentIds = uniqueStrings([record.document_id, document?.id]);
  if (!companyIds.length && !documentIds.length) return undefined;
  return {
    ...(companyIds.length ? { companyIds } : {}),
    ...(documentIds.length ? { documentIds } : {})
  };
}

function responsePayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (payload == null) return null;
  const raw = Buffer.isBuffer(payload)
    ? payload.toString("utf8")
    : typeof payload === "string"
      ? payload
      : null;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nestedPayloadRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
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

async function createRuntimeStore(config: FastifyInstance["config"], options: BuildAppOptions): Promise<DataStore> {
  const mode = options.dataStoreMode ?? process.env.HRMS_DATA_STORE ?? "postgres";
  if (mode === "memory") {
    if (process.env.HRMS_ALLOW_MEMORY_STORE !== "true") {
      throw new Error("MemoryDataStore is allowed only when HRMS_ALLOW_MEMORY_STORE=true is set explicitly.");
    }
    const store = createMemoryDataStore();
    store.documentProcessing = {
      pdfCompression: {
        enabled: config.PDF_COMPRESSION_ENABLED,
        binary: config.PDF_COMPRESSION_BINARY,
        quality: config.PDF_COMPRESSION_QUALITY,
        minBytes: config.PDF_COMPRESSION_MIN_BYTES,
        timeoutMs: config.PDF_COMPRESSION_TIMEOUT_MS,
        failOpen: config.PDF_COMPRESSION_FAIL_OPEN
      },
      mediaUploads: mediaUploadPolicyFromConfig(config),
      companyLogoUploads: companyLogoUploadPolicyFromConfig(config)
    };
    return store;
  }

  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL-backed runtime state.");
  }
  if (!config.VALKEY_URL) {
    throw new Error("VALKEY_URL is required for Valkey-backed sessions and outbox publishing.");
  }

  const seedIfEmpty = options.seedIfEmpty ?? config.HRMS_SEED_IF_EMPTY;

  return createPostgresDataStore({
    databaseUrl: config.DATABASE_URL,
    valkeyUrl: config.VALKEY_URL,
    objectStorage: objectStorageOptions(config),
    documentProcessing: {
      pdfCompression: {
        enabled: config.PDF_COMPRESSION_ENABLED,
        binary: config.PDF_COMPRESSION_BINARY,
        quality: config.PDF_COMPRESSION_QUALITY,
        minBytes: config.PDF_COMPRESSION_MIN_BYTES,
        timeoutMs: config.PDF_COMPRESSION_TIMEOUT_MS,
        failOpen: config.PDF_COMPRESSION_FAIL_OPEN
      },
      mediaUploads: mediaUploadPolicyFromConfig(config),
      companyLogoUploads: companyLogoUploadPolicyFromConfig(config)
    },
    seedIfEmpty
  });
}

function objectStorageOptions(config: FastifyInstance["config"]): PostgresObjectStorageOptions {
  return {
    cloudName: config.CLOUDINARY_CLOUD_NAME,
    apiKey: config.CLOUDINARY_API_KEY,
    apiSecret: config.CLOUDINARY_API_SECRET,
    folder: config.CLOUDINARY_FOLDER,
    resourceType: config.CLOUDINARY_RESOURCE_TYPE,
    uploadTransformation: config.MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION || config.CLOUDINARY_UPLOAD_TRANSFORMATION,
    mockUploads: config.CLOUDINARY_MOCK_UPLOADS
  };
}

function mediaUploadPolicyFromConfig(config: FastifyInstance["config"]) {
  return {
    maxBytes: config.MEDIA_UPLOAD_MAX_BYTES,
    imageMaxWidth: config.MEDIA_IMAGE_MAX_WIDTH,
    imageMaxHeight: config.MEDIA_IMAGE_MAX_HEIGHT,
    imageJpegQuality: config.MEDIA_IMAGE_JPEG_QUALITY,
    allowedMimeTypes: config.MEDIA_ALLOWED_MIME_TYPES
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    imageOutputMimeType: "image/jpeg" as const,
    cloudinaryTransformation: config.MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION
  };
}

function companyLogoUploadPolicyFromConfig(config: FastifyInstance["config"]) {
  return {
    maxBytes: config.COMPANY_LOGO_MAX_BYTES,
    imageMaxWidth: config.COMPANY_LOGO_MAX_WIDTH,
    imageMaxHeight: config.COMPANY_LOGO_MAX_HEIGHT,
    imageJpegQuality: config.COMPANY_LOGO_JPEG_QUALITY,
    allowedMimeTypes: config.COMPANY_LOGO_ALLOWED_MIME_TYPES
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    imageOutputMimeType: "image/jpeg" as const,
    cloudinaryTransformation: config.COMPANY_LOGO_CLOUDINARY_TRANSFORMATION
  };
}

function corsOptions(config: FastifyInstance["config"]): Parameters<typeof cors>[1] {
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

  if (allowedOrigins.length === 0 && config.NODE_ENV !== "production") {
    return { origin: true, credentials: true, methods };
  }

  const allowed = new Set(allowedOrigins);
  return {
    credentials: true,
    methods,
    origin(origin, callback) {
      if (!origin) {
        callback(null, false);
        return;
      }
      callback(null, allowed.has(origin));
    }
  };
}

function loggerOptions(enabled: boolean): false | {
  level: string;
  redact: { paths: string[]; censor: string };
} {
  if (!enabled) {
    return false;
  }

  return {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    redact: {
      censor: "[REDACTED]",
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
        "res.headers['set-cookie']",
        "*.password",
        "*.token",
        "*.access_token",
        "*.refresh_token",
        "*.JWT_ACCESS_SECRET",
        "*.JWT_REFRESH_SECRET",
        "*.RESEND_API_KEY",
        "*.RESEND_WEBHOOK_SECRET"
      ]
    }
  };
}
