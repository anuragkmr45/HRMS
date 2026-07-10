import fp from "fastify-plugin";
import { z } from "zod";
import { runtimeDefaults } from "../config/runtime-defaults.js";

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());
const booleanEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  return value;
}, z.boolean());

const configSchema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_ENV: z.enum(["local", "development", "qa", "production"]).optional(),
  APP_VERSION: z.string().default("0.1.0"),
  BUILD_SHA: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  JWT_ACCESS_SECRET: z.string().min(16).default("local-dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("local-dev-refresh-secret-change-me"),
  SESSION_COOKIE_NAME: z.string().default("hrms_session"),
  JWT_SECRET: z.string().min(16).optional(),
  COOKIE_SECURE: booleanEnv.default(false),
  DATABASE_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  VALKEY_URL: z.string().optional(),
  HRMS_SEED_IF_EMPTY: booleanEnv.default(false),
  CLOUDINARY_CLOUD_NAME: z.string().default("local-cloudinary-mock"),
  CLOUDINARY_API_KEY: z.string().default("local-cloudinary-key"),
  CLOUDINARY_API_SECRET: z.string().default("local-cloudinary-secret"),
  CLOUDINARY_FOLDER: z.string().default("hawkaii-hrms"),
  CLOUDINARY_RESOURCE_TYPE: z.enum(["auto", "image", "raw", "video"]).default("auto"),
  CLOUDINARY_UPLOAD_TRANSFORMATION: z.string().default("q_auto:eco,f_auto"),
  CLOUDINARY_MOCK_UPLOADS: booleanEnv.default(true),
  MEDIA_UPLOAD_MAX_BYTES: z.coerce.number().int().min(128 * 1024).default(runtimeDefaults.MEDIA_UPLOAD_MAX_BYTES),
  MEDIA_IMAGE_MAX_WIDTH: z.coerce.number().int().min(256).max(4096).default(runtimeDefaults.MEDIA_IMAGE_MAX_WIDTH),
  MEDIA_IMAGE_MAX_HEIGHT: z.coerce.number().int().min(256).max(4096).default(runtimeDefaults.MEDIA_IMAGE_MAX_HEIGHT),
  MEDIA_IMAGE_JPEG_QUALITY: z.coerce.number().min(0.5).max(0.95).default(runtimeDefaults.MEDIA_IMAGE_JPEG_QUALITY),
  MEDIA_ALLOWED_MIME_TYPES: z.string().default(runtimeDefaults.MEDIA_ALLOWED_MIME_TYPES),
  MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION: z.string().default(runtimeDefaults.MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION),
  COMPANY_LOGO_MAX_BYTES: z.coerce.number().int().min(50 * 1024).default(runtimeDefaults.COMPANY_LOGO_MAX_BYTES),
  COMPANY_LOGO_MAX_WIDTH: z.coerce.number().int().min(128).max(2048).default(runtimeDefaults.COMPANY_LOGO_MAX_WIDTH),
  COMPANY_LOGO_MAX_HEIGHT: z.coerce.number().int().min(128).max(2048).default(runtimeDefaults.COMPANY_LOGO_MAX_HEIGHT),
  COMPANY_LOGO_JPEG_QUALITY: z.coerce.number().min(0.5).max(0.95).default(runtimeDefaults.COMPANY_LOGO_JPEG_QUALITY),
  COMPANY_LOGO_ALLOWED_MIME_TYPES: z.string().default(runtimeDefaults.COMPANY_LOGO_ALLOWED_MIME_TYPES),
  COMPANY_LOGO_CLOUDINARY_TRANSFORMATION: z.string().default(runtimeDefaults.COMPANY_LOGO_CLOUDINARY_TRANSFORMATION),
  PROFILE_PHOTO_MAX_BYTES: z.coerce.number().int().min(50 * 1024).default(runtimeDefaults.PROFILE_PHOTO_MAX_BYTES),
  PROFILE_PHOTO_MAX_WIDTH: z.coerce.number().int().min(128).max(2048).default(runtimeDefaults.PROFILE_PHOTO_MAX_WIDTH),
  PROFILE_PHOTO_MAX_HEIGHT: z.coerce.number().int().min(128).max(2048).default(runtimeDefaults.PROFILE_PHOTO_MAX_HEIGHT),
  PROFILE_PHOTO_JPEG_QUALITY: z.coerce.number().min(0.5).max(0.95).default(runtimeDefaults.PROFILE_PHOTO_JPEG_QUALITY),
  PROFILE_PHOTO_ALLOWED_MIME_TYPES: z.string().default(runtimeDefaults.PROFILE_PHOTO_ALLOWED_MIME_TYPES),
  PROFILE_PHOTO_CLOUDINARY_TRANSFORMATION: z.string().default(runtimeDefaults.PROFILE_PHOTO_CLOUDINARY_TRANSFORMATION),
  PDF_COMPRESSION_ENABLED: booleanEnv.default(true),
  PDF_COMPRESSION_BINARY: z.string().default("gs"),
  PDF_COMPRESSION_QUALITY: z.enum(["screen", "ebook", "printer", "prepress", "default"]).default("ebook"),
  PDF_COMPRESSION_MIN_BYTES: z.coerce.number().int().min(0).default(runtimeDefaults.PDF_COMPRESSION_MIN_BYTES),
  PDF_COMPRESSION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  PDF_COMPRESSION_FAIL_OPEN: booleanEnv.default(true),
  API_BASE_URL: z.string().default("http://localhost:3001"),
  APP_URL: optionalUrl,
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  EMAIL_DELIVERY_PROVIDER: z.literal("resend").default("resend"),
  EMAIL_DELIVERY_MODE: z.enum(["send", "log", "disabled"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("Hawkaii HRMS <verify@example.test>"),
  RESEND_FROM_NAME: z.string().optional(),
  RESEND_REPLY_TO_EMAIL: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  RESEND_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),
  RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(runtimeDefaults.EMAIL_VERIFICATION_TOKEN_TTL_SECONDS),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(1).default(runtimeDefaults.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS),
  EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT: z.coerce.number().int().min(1).default(runtimeDefaults.EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT),
  EMAIL_VERIFICATION_RESEND_DAILY_LIMIT: z.coerce.number().int().min(1).default(runtimeDefaults.EMAIL_VERIFICATION_RESEND_DAILY_LIMIT),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  RATE_LIMIT_ENABLED: booleanEnv.default(true),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_READ_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WRITE_MAX: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().min(1).default(60),
  TRUST_PROXY: booleanEnv.default(false),
  OPENAPI_PUBLIC: booleanEnv.optional()
}).superRefine((config, context) => {
  const appEnv = config.APP_ENV ?? (config.NODE_ENV === "production" ? "production" : "local");
  const localLikeEnvironments = new Set(["development", "local"]);
  const requireField = (field: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET" | "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "RESEND_WEBHOOK_SECRET" | "FRONTEND_URL") => {
    if (!config[field]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required when transactional email delivery is enabled.`
      });
    }
  };

  if (appEnv === "production" && config.NODE_ENV !== "production") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NODE_ENV"],
      message: "NODE_ENV must be 'production' when APP_ENV is production."
    });
  }
  if (["qa", "production"].includes(appEnv) && config.NODE_ENV !== "production") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NODE_ENV"],
      message: "Hosted QA and production must run with NODE_ENV=production."
    });
  }
  if (config.EMAIL_DELIVERY_MODE === "send") {
    requireField("RESEND_API_KEY");
    requireField("RESEND_FROM_EMAIL");
    requireField("FRONTEND_URL");
    requireField("RESEND_WEBHOOK_SECRET");
  }
  if (config.CLOUDINARY_MOCK_UPLOADS && !localLikeEnvironments.has(appEnv)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CLOUDINARY_MOCK_UPLOADS"],
      message: "CLOUDINARY_MOCK_UPLOADS can only be true in local or development APP_ENV environments."
    });
  }
  if (appEnv === "production") {
    for (const field of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      requireField(field);
      if (/local-|change-me|replace-/iu.test(config[field])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must be a production-owned secret.`
        });
      }
    }
    if (config.CLOUDINARY_MOCK_UPLOADS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLOUDINARY_MOCK_UPLOADS"],
        message: "CLOUDINARY_MOCK_UPLOADS cannot be true in production."
      });
    }
    for (const field of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const) {
      if (!config[field] || /^replace-|^local-|mock/iu.test(config[field])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must be a real Cloudinary value in production.`
        });
      }
    }
  }
}).transform((config) => ({
  ...config,
  APP_ENV: config.APP_ENV ?? (config.NODE_ENV === "production" ? "production" : "local"),
  JWT_SECRET: config.JWT_SECRET ?? config.JWT_ACCESS_SECRET,
  APP_URL: config.APP_URL ?? config.API_BASE_URL,
  OPENAPI_PUBLIC: config.OPENAPI_PUBLIC ?? (config.APP_ENV ?? (config.NODE_ENV === "production" ? "production" : "local")) !== "production"
}));

export const configPlugin = fp(async (fastify) => {
  const config = configSchema.parse({
    ...runtimeDefaults,
    ...process.env
  });
  fastify.decorate("config", config);
});
