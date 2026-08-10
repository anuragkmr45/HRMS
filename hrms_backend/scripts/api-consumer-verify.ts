import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type OpenApiDocument = {
  openapi?: string;
  tags?: Array<{ name?: string }>;
  paths?: Record<string, Record<string, unknown>>;
};

const requiredDocs = [
  "docs/api/API_CONSUMER_GUIDE.md",
  "docs/api/API_CORE_GUIDE.md",
  "docs/api/API_ROLE_ENDPOINT_MATRIX.md",
  "docs/api/API_AUTH_SESSION_GUIDE.md",
  "docs/api/API_ERROR_RESPONSE_GUIDE.md",
  "docs/api/API_FINANCE_GUIDE.md",
  "docs/api/API_DOCUMENTS_GUIDE.md",
  "docs/api/API_EXPENSE_WORKFLOW_GUIDE.md",
  "docs/api/API_ASSETS_GUIDE.md",
  "docs/api/API_TIMESHEETS_GUIDE.md",
  "docs/api/API_REPORTS_GUIDE.md",
  "docs/api/API_SWAGGER_QA_CHECKLIST.md",
  "docs/api/frontend-contract/README.md",
  "docs/api/frontend-contract/ENDPOINT_INDEX.md",
  "docs/api/frontend-contract/BUSINESS_RULES.md",
  "docs/api/frontend-contract/EXPENSE_FINANCE_FLOW.md",
  "docs/api/frontend-contract/FRONTEND_CODEX_NOTES.md",
  "docs/api/frontend-contract/FRONTEND_QA_CHECKLIST.md"
];


const requiredTags = [
  "Platform / Health",
  "Platform / Devices",
  "Auth & Sessions",
  "Core / Employees & Hierarchy",
  "Expenses / Requester",
  "Expenses / Manager",
  "Finance Management",
  "Documents",
  "Assets",
  "Timesheets",
  "Reports & Analytics",
  "Admin / Configuration",
  "Outbox / Platform Events"
];

const failures: string[] = [];

verifyOpenApi();
verifyFiles(requiredDocs, "consumer guide");
verifyCollectionArtifacts();
verifyFrontendContractPack();
verifyNoSecrets();

if (failures.length > 0) {
  console.error(`API consumer handoff verification failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("API consumer handoff verification passed.");

function verifyOpenApi(): void {
  const path = "docs/api/openapi.json";
  if (!existsSync(path)) {
    failures.push(`${path} is missing.`);
    return;
  }
  const spec = JSON.parse(readFileSync(path, "utf8")) as OpenApiDocument;
  if (!spec.openapi?.startsWith("3.")) {
    failures.push("OpenAPI artifact must be OpenAPI 3.x.");
  }
  const login = spec.paths?.["/api/v1/auth/login"]?.post as {
    requestBody?: { content?: Record<string, { schema?: { required?: unknown[]; properties?: Record<string, unknown> } }> };
  } | undefined;
  const loginSchema = login?.requestBody?.content?.["application/json"]?.schema;
  if (!loginSchema?.required?.includes("email") || !loginSchema.required.includes("password") || !loginSchema.properties?.email || !loginSchema.properties.password) {
    failures.push("Login OpenAPI request body must require email and password.");
  }
  if (!loginSchema?.properties?.employee_code) {
    failures.push("Login OpenAPI request body must document DEV-only employee_code fallback.");
  }
  if (!(login as { responses?: Record<string, unknown> } | undefined)?.responses?.["429"]) {
    failures.push("Login OpenAPI operation must document rate limit response 429.");
  }

  const tags = new Set(spec.tags?.map((tag) => tag.name));
  for (const tag of requiredTags) {
    if (!tags.has(tag)) {
      failures.push(`OpenAPI missing required tag: ${tag}`);
    }
  }
}

function verifyFiles(paths: string[], label: string): void {
  for (const path of paths) {
    if (!existsSync(path)) {
      failures.push(`Missing ${label}: ${path}`);
      continue;
    }
    if (statSync(path).size < 200) {
      failures.push(`${label} appears too small: ${path}`);
    }
  }
}

function verifyCollectionArtifacts(): void {
  const postman = "docs/api/collections/hrms-platform.postman_collection.json";
  const curlSuite = "docs/api/collections/curl-smoke-tests.sh";
  if (!existsSync(postman)) {
    failures.push(`${postman} is missing.`);
  } else {
    const collection = JSON.parse(readFileSync(postman, "utf8")) as { item?: unknown[] };
    if (!Array.isArray(collection.item) || collection.item.length < 6) {
      failures.push(`${postman} must contain grouped API consumer requests.`);
    }
  }
  if (!existsSync(curlSuite)) {
    failures.push(`${curlSuite} is missing.`);
  } else {
    const script = readFileSync(curlSuite, "utf8");
    for (const marker of ["auth_login", "finance_queue", "documents_list", "asset_qr_scan", "timesheet_submit_example"]) {
      if (!script.includes(marker)) {
        failures.push(`${curlSuite} missing marker ${marker}.`);
      }
    }
  }
}

function verifyFrontendContractPack(): void {
  const root = "docs/api/frontend-contract";
  const sourceOpenApi = "docs/api/openapi.json";
  const contractOpenApi = join(root, "openapi.json");
  if (!existsSync(contractOpenApi)) {
    failures.push(`${contractOpenApi} is missing.`);
    return;
  }

  const source = readFileSync(sourceOpenApi, "utf8");
  const contract = readFileSync(contractOpenApi, "utf8");
  if (source !== contract) {
    failures.push(`${contractOpenApi} must match ${sourceOpenApi}. Run pnpm api:docs:generate.`);
  }

  const spec = JSON.parse(source) as OpenApiDocument;
  const operations = collectOperations(spec);
  if (operations.length < 68) {
    failures.push(`Expected at least 68 OpenAPI operations, found ${operations.length}.`);
  }

  const endpointIndexPath = join(root, "ENDPOINT_INDEX.md");
  const endpointIndex = existsSync(endpointIndexPath) ? readFileSync(endpointIndexPath, "utf8") : "";
  for (const operation of operations) {
    if (!endpointIndex.includes(`### ${operation}`)) {
      failures.push(`${endpointIndexPath} missing operation ${operation}.`);
    }
  }
  for (const tag of requiredTags) {
    if (!endpointIndex.includes(`## ${tag}`)) {
      failures.push(`${endpointIndexPath} missing tag section ${tag}.`);
    }
  }

  const businessRules = readIfExists(join(root, "BUSINESS_RULES.md"));
  for (const marker of ["expected_version", "request_id", "Retry-After", "Do not query PostgreSQL", "object storage"]) {
    if (!businessRules.includes(marker)) {
      failures.push(`BUSINESS_RULES.md missing frontend rule marker: ${marker}`);
    }
  }

  const codexNotes = readIfExists(join(root, "FRONTEND_CODEX_NOTES.md"));
  for (const marker of ["Do not invent routes", "Do not query PostgreSQL", "Preserve Manager -> Finance vocabulary", "request_id", "Retry-After"]) {
    if (!codexNotes.includes(marker)) {
      failures.push(`FRONTEND_CODEX_NOTES.md missing Codex marker: ${marker}`);
    }
  }

  const expenseFlow = readIfExists(join(root, "EXPENSE_FINANCE_FLOW.md"));
  for (const marker of ["Pending Manager Verification", "Manager Verified", "Finance Approved", "Payment Released", "Bills Submitted", "Closed"]) {
    if (!expenseFlow.includes(marker)) {
      failures.push(`EXPENSE_FINANCE_FLOW.md missing workflow status: ${marker}`);
    }
  }

  const legacyReviewer = "review" + "er";
  const legacyDirector = "direct" + "or";
  const legacyFinanceVerified = "Finance " + "Verified";
  const activeOldFlowPatterns = [
    new RegExp(`/api/v1/expenses/queue/${legacyReviewer}|queue/${legacyReviewer}`, "iu"),
    new RegExp(`/api/v1/expenses/queue/${legacyDirector}|queue/${legacyDirector}`, "iu"),
    new RegExp(`/finance/${legacyReviewer}|/finance/${legacyDirector}`, "iu"),
    new RegExp([
      `Pending ${capitalize(legacyReviewer)}`,
      `Pending ${capitalize(legacyDirector)}`,
      `${capitalize(legacyReviewer)} Returned`,
      `${capitalize(legacyDirector)} Returned`,
      `${capitalize(legacyReviewer)} Rejected`,
      `${capitalize(legacyDirector)} Rejected`,
      `${capitalize(legacyDirector)} Approved`,
      legacyFinanceVerified,
      "Admin Finance " + "Exception"
    ].join("|"), "iu")
  ];
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    for (const pattern of activeOldFlowPatterns) {
      if (pattern.test(content)) {
        failures.push(`${file} documents removed old expense flow pattern ${pattern}.`);
      }
    }
  }
}

function collectOperations(spec: OpenApiDocument): string[] {
  const operations: string[] = [];
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (methods[method]) {
        operations.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return operations;
}

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function verifyNoSecrets(): void {
  const roots = ["docs/api"];
  const forbidden = [
    /JWT_(ACCESS|REFRESH)_SECRET\s*=/iu,
    /CLOUDINARY_API_SECRET\s*=/iu,
    /VALKEY_PASSWORD\s*=/iu,
    /postgres:\/\/postgres:postgres/iu,
    /postgres(?:ql)?:\/\/[^\s"'`]+/iu,
    /DATABASE_URL\s*=/iu
  ];
  for (const root of roots) {
    for (const file of walk(root)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(content)) {
          failures.push(`${file} contains forbidden secret-like content matching ${pattern}.`);
        }
      }
    }
  }
}

function walk(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  const stat = statSync(path);
  if (!stat.isDirectory()) {
    return [path];
  }
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
