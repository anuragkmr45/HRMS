import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { walkFiles, read, fail, relativePath } from "./lib.js";

const violations: string[] = [];
const oldExpenseFlowRules = [
  { name: "old reviewer queue route", pattern: /\/api\/v1\/expenses\/queue\/reviewer|queue\/reviewer/u },
  { name: "old director queue route", pattern: /\/api\/v1\/expenses\/queue\/director|queue\/director/u },
  { name: "old finance reviewer frontend route", pattern: /\/finance\/reviewer/u },
  { name: "old finance director frontend route", pattern: /\/finance\/director/u },
  { name: "old reviewer action route", pattern: /\/api\/v1\/expenses\/(?:\{id\}|:[\w-]+|\$\{[^}]+\}|[^/]+)\/review|\/expenses\/\$\{[^}]+\}\/review/u },
  { name: "old director approval route", pattern: /\/api\/v1\/expenses\/(?:\{id\}|:[\w-]+|\$\{[^}]+\}|[^/]+)\/approve|\/expenses\/\$\{[^}]+\}\/approve/u },
  { name: "old open workflow status", pattern: /Pending Reviewer|Pending Director|Reviewer Returned|Director Returned|Reviewer Rejected|Director Rejected|Director Approved|Finance Verified|Admin Finance Exception/u },
  { name: "old reviewer mapping API", pattern: /expense-reviewers|reviewerMapping|Reviewer Mapping/u }
] as const;

function isTestFile(path: string): boolean {
  return path.includes("/__tests__/") || /\.(test|unit|integration|contract|e2e)\.ts$/u.test(path);
}

function isFrontendReferenceGuardFile(path: string): boolean {
  const rel = relativePath(path);
  return rel === "scripts/lint.ts" || rel === "scripts/verify-quality.ts" || rel === "scripts/api-docs-verify.ts";
}

function isOldFlowGuardSurface(path: string): boolean {
  const rel = relativePath(path);
  if (
    isTestFile(rel) ||
    rel.startsWith("src/db/migrations/") ||
    rel === "scripts/lint.ts" ||
    rel === "scripts/verify-quality.ts" ||
    rel === "scripts/standalone-human-qa.ts"
  ) {
    return false;
  }
  return rel.startsWith("src/") || rel.startsWith("scripts/") || rel.startsWith("docs/api/");
}

for (const file of [
  ...walkFiles("src", (path) => /\.(ts|tsx)$/u.test(path)),
  ...walkFiles("scripts", (path) => /\.(ts|tsx|js)$/u.test(path)),
  ...walkFiles("docs/api", (path) => /\.(json|md|yml|yaml)$/u.test(path))
]) {
  const content = read(file);
  const rel = relativePath(file);
  if (/\bfrom\s+["'](?:next|react|react-dom)(?:\/[^"']*)?["']/u.test(content)) {
    violations.push(`${rel}: backend must not import frontend libraries`);
  }
  if (!isFrontendReferenceGuardFile(file) && !isTestFile(rel) && /apps\/(?:web|finance-web|documents-web|assets-web)|NEXT_PUBLIC_/u.test(content) && !rel.startsWith("docs/api/")) {
    violations.push(`${rel}: backend must not depend on frontend monorepo paths or browser env variables`);
  }
  if (rel.endsWith("/routes.ts") && /UPDATE\s+|INSERT\s+|DELETE\s+|SELECT\s+/iu.test(content)) {
    violations.push(`${rel}: route handlers must not contain SQL business logic`);
  }
  if (rel.endsWith("/routes.ts") && /\.get\(".*(?:my|queue|reports?|documents|assets|users|work-segments|submissions)/u.test(content) && !content.includes("paginationQuerySchema")) {
    violations.push(`${rel}: list route must use paginationQuerySchema`);
  }
  if (isOldFlowGuardSurface(file)) {
    for (const rule of oldExpenseFlowRules) {
      if (rule.pattern.test(content)) {
        violations.push(`${rel}: active surface reintroduces ${rule.name}`);
      }
    }
  }
}

const packageJson = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
for (const dependency of ["next", "react", "react-dom"]) {
  if (packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency]) {
    violations.push(`package.json: frontend dependency ${dependency} must not be present`);
  }
}

const appBootstrap = read("src/app.ts");
if (/app\.decorate\("store",\s*createMemoryDataStore\(\)\)/u.test(appBootstrap)) {
  violations.push("src/app.ts: runtime store must not default to MemoryDataStore");
}
if (!/process\.env\.HRMS_DATA_STORE\s*\?\?\s*"postgres"/u.test(appBootstrap)) {
  violations.push("src/app.ts: runtime store must default to PostgreSQL");
}
if (!/HRMS_ALLOW_MEMORY_STORE/u.test(appBootstrap)) {
  violations.push("src/app.ts: memory store mode must require an explicit guard variable");
}

const outboxWorker = read("src/workers/outbox-worker.ts");
if (/constructor\([^)]*new MemoryStreamPublisher\(\)/su.test(outboxWorker)) {
  violations.push("src/workers/outbox-worker.ts: runtime outbox worker must not default to MemoryStreamPublisher");
}
const outboxRunner = read("src/workers/run-outbox-worker.ts");
if (!/new ValkeyStreamPublisher\(valkeyUrl\)/u.test(outboxRunner) || /new MemoryStreamPublisher/u.test(outboxRunner)) {
  violations.push("src/workers/run-outbox-worker.ts: runtime worker must use ValkeyStreamPublisher");
}

const documentService = read("src/modules/documents/service.ts");
if (/dev_adapter|object-storage\.local/u.test(documentService)) {
  violations.push("src/modules/documents/service.ts: document service must not use placeholder storage behavior");
}

for (const file of walkFiles("src", (path) => path.endsWith(".integration.test.ts"))) {
  const rel = relativePath(file);
  const content = read(file);
  if (content.includes("createMemoryDataStore") || /buildApp\(\)/u.test(content)) {
    violations.push(`${rel}: integration tests must use real PostgreSQL/Valkey/object-storage infrastructure`);
  }
}

const envExampleFiles = [".env.dev.example", ".env.qa.example", ".env.prod.example"].filter((file) => existsSync(file));
for (const envFile of envExampleFiles) {
  const content = read(envFile);
  for (const line of content.split(/\r?\n/u)) {
    if (/^NEXT_PUBLIC_/iu.test(line) || /^(WEB|ASSETS_WEB|FINANCE_WEB|DOCUMENTS_WEB)_/iu.test(line)) {
      violations.push(`${envFile}: frontend env variable is not allowed in standalone backend`);
    }
  }
}

const gitCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (gitCheck.status === 0) {
  const secretEnvFiles = [".env", ".env.local", ".env.test", ".env.docker", ".env.qa", ".env.prod"];
  const trackedEnv = spawnSync("git", ["ls-files", ...secretEnvFiles], { encoding: "utf8" }).stdout.trim();
  if (trackedEnv) {
    violations.push(`secret-bearing env files are tracked: ${trackedEnv}`);
  }
  const ignoreCheck = spawnSync("git", ["check-ignore", "-v", ".env.local", ".env.test", ".env.qa", ".env.prod"], {
    encoding: "utf8"
  });
  if (ignoreCheck.status !== 0) {
    violations.push(".env.local, .env.test, .env.qa, and .env.prod must be ignored");
  }
}

if (violations.length > 0) {
  fail(`Quality verification failed:\n${violations.join("\n")}`);
}

console.log("Quality verification passed.");
