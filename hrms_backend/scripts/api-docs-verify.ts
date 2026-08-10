import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  AttendanceCommandReasonCodeValues,
  AttendanceHistoricalCorrectionEventTypeValues,
  AttendanceLocationProviderValues,
  AttendanceOfflineSyncReasonCodeValues,
  AttendanceOfflineSyncStatusValues,
  AttendanceOfflineVerificationStatusValues,
} from "#shared";

type OpenApiDocument = {
  openapi?: string;
  tags?: Array<{ name?: string }>;
  paths?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JsonObject>;
  };
};

type PathItem = Record<string, Operation | undefined>;

type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: JsonObject; example?: unknown }>;
  };
  responses?: Record<string, unknown>;
};

type JsonObject = Record<string, unknown>;

const allowedTags = new Set([
  "Platform / Health",
  "Platform / Devices",
  "Auth & Sessions",
  "Core / Employees & Hierarchy",
  "Dashboard",
  "Expenses / Requester",
  "Expenses / Manager",
  "Finance Management",
  "Documents",
  "Assets",
  "Timesheets",
  "Attendance",
  "Leave / WFH / Holidays",
  "EMS",
  "Projects / Utilization",
  "Helpdesk",
  "Reports & Analytics",
  "Notifications",
  "Outbox / Platform Events",
  "Admin / Configuration"
]);

const bodyRequiredOperations = new Set([
  "PATCH /api/v1/auth/session/preference",
  "POST /api/v1/onboarding/company-bootstrap",
  "POST /api/v1/auth/password-reset/confirm",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/signup",
  "POST /api/v1/auth/login",
  "POST /api/v1/core/users",
  "PATCH /api/v1/core/users/{id}",
  "POST /api/v1/core/users/{id}/activate",
  "POST /api/v1/core/users/{id}/deactivate",
  "POST /api/v1/core/users/{id}/login/enable",
  "POST /api/v1/core/users/{id}/login/disable",
  "PUT /api/v1/core/users/{id}/roles",
  "POST /api/v1/expenses",
  "PATCH /api/v1/expenses/{id}",
  "POST /api/v1/expenses/{id}/submit",
  "POST /api/v1/expenses/{id}/withdraw",
  "POST /api/v1/expenses/{id}/clarifications",
  "PATCH /api/v1/core/users/{id}",
  "POST /api/v1/core/users/{id}/activate",
  "POST /api/v1/core/users/{id}/deactivate",
  "POST /api/v1/core/users/{id}/login/enable",
  "POST /api/v1/core/users/{id}/login/disable",
  "PUT /api/v1/core/users/{id}/roles",
  "POST /api/v1/expenses/{id}/manager/verify",
  "POST /api/v1/expenses/{id}/finance/approve",
  "POST /api/v1/expenses/{id}/finance/payment",
  "POST /api/v1/expenses/{id}/bills",
  "POST /api/v1/expenses/{id}/settlement",
  "POST /api/v1/manager-backups",
  "POST /api/v1/documents",
  "POST /api/v1/expenses/{id}/documents",
  "POST /api/v1/reports/exports",
  "POST /api/v1/assets/",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/assets/licenses/activate",
  "POST /api/v1/assets/licenses/validate",
  "POST /api/v1/assets/licenses/revoke",
  "POST /api/v1/assets/events/employee-terminated",
  "POST /api/v1/timesheets/work-segments",
  "POST /api/v1/timesheets/submissions",
  "POST /api/v1/timesheets/submissions/{id}/approve",
  "POST /api/v1/timesheets/workflow-definitions",
  "POST /api/v1/attendance/punches",
  "POST /api/v1/attendance/offline-sync",
  "POST /api/v1/attendance/regularizations",
  "POST /api/v1/attendance/regularizations/{id}/decision",
  "POST /api/v1/leave/requests",
  "POST /api/v1/leave/requests/{id}/decision",
  "POST /api/v1/leave/requests/{id}/cancel",
  "POST /api/v1/wfh/requests",
  "POST /api/v1/wfh/requests/{id}/decision",
  "PUT /api/v1/holidays/{id}",
  "PATCH /api/v1/ems/profile/me",
  "POST /api/v1/ems/profile-change-requests",
  "POST /api/v1/ems/profile-change-requests/{id}/decision",
  "POST /api/v1/ems/requests",
  "POST /api/v1/ems/letters/{id}/acknowledge",
  "POST /api/v1/ems/policies/{id}/acknowledge",
  "POST /api/v1/assets/requests",
  "POST /api/v1/assets/requests/{id}/cancel",
  "POST /api/v1/assets/requests/{id}/decision",
  "POST /api/v1/assets/vendors",
  "PATCH /api/v1/assets/vendors/{id}",
  "POST /api/v1/assets/recovery-queue/{id}/settlement",
  "POST /api/v1/assets/{id}/acknowledgements",
  "POST /api/v1/assets/{id}/maintenance",
  "POST /api/v1/projects",
  "PATCH /api/v1/projects/{id}",
  "POST /api/v1/projects/{id}/archive",
  "POST /api/v1/projects/{id}/members",
  "PATCH /api/v1/projects/{id}/members/{member_id}",
  "POST /api/v1/projects/{id}/allocations",
  "POST /api/v1/projects/{id}/milestones",
  "POST /api/v1/helpdesk/tickets",
  "PATCH /api/v1/helpdesk/tickets/{id}",
  "POST /api/v1/helpdesk/tickets/{id}/comments",
  "POST /api/v1/helpdesk/tickets/{id}/internal-notes",
  "POST /api/v1/helpdesk/tickets/{id}/attachments",
  "POST /api/v1/helpdesk/tickets/{id}/assign",
  "POST /api/v1/helpdesk/tickets/{id}/priority",
  "POST /api/v1/helpdesk/tickets/{id}/status",
  "POST /api/v1/helpdesk/tickets/{id}/resolve",
  "POST /api/v1/helpdesk/tickets/{id}/close",
  "POST /api/v1/helpdesk/tickets/{id}/reopen",
  "POST /api/v1/notifications/{id}/read"
]);

const occOperations = new Set([
  "POST /api/v1/expenses/{id}/submit",
  "POST /api/v1/expenses/{id}/withdraw",
  "POST /api/v1/expenses/{id}/manager/verify",
  "POST /api/v1/expenses/{id}/finance/approve",
  "POST /api/v1/expenses/{id}/finance/payment",
  "POST /api/v1/expenses/{id}/bills",
  "POST /api/v1/expenses/{id}/settlement",
  "DELETE /api/v1/manager-backups/{id}",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/assets/requests/{id}/cancel",
  "POST /api/v1/assets/requests/{id}/decision",
  "PATCH /api/v1/assets/vendors/{id}",
  "POST /api/v1/assets/recovery-queue/{id}/settlement",
  "POST /api/v1/assets/{id}/acknowledgements",
  "POST /api/v1/assets/{id}/maintenance",
  "POST /api/v1/timesheets/submissions/{id}/approve",
  "POST /api/v1/attendance/regularizations/{id}/decision",
  "POST /api/v1/leave/requests/{id}/decision",
  "POST /api/v1/leave/requests/{id}/cancel",
  "POST /api/v1/wfh/requests/{id}/decision",
  "PUT /api/v1/holidays/{id}",
  "PATCH /api/v1/ems/profile/me",
  "POST /api/v1/ems/profile-change-requests/{id}/decision",
  "POST /api/v1/ems/letters/{id}/acknowledge",
  "POST /api/v1/ems/policies/{id}/acknowledge",
  "PATCH /api/v1/projects/{id}",
  "POST /api/v1/projects/{id}/archive",
  "POST /api/v1/projects/{id}/members",
  "PATCH /api/v1/projects/{id}/members/{member_id}",
  "POST /api/v1/projects/{id}/allocations",
  "POST /api/v1/projects/{id}/milestones",
  "PATCH /api/v1/helpdesk/tickets/{id}",
  "POST /api/v1/helpdesk/tickets/{id}/comments",
  "POST /api/v1/helpdesk/tickets/{id}/internal-notes",
  "POST /api/v1/helpdesk/tickets/{id}/attachments",
  "POST /api/v1/helpdesk/tickets/{id}/assign",
  "POST /api/v1/helpdesk/tickets/{id}/priority",
  "POST /api/v1/helpdesk/tickets/{id}/status",
  "POST /api/v1/helpdesk/tickets/{id}/resolve",
  "POST /api/v1/helpdesk/tickets/{id}/close",
  "POST /api/v1/helpdesk/tickets/{id}/reopen",
  "POST /api/v1/notifications/{id}/read"
]);

const listOperations = new Set([
  "GET /api/v1/core/users",
  "GET /api/v1/core/users/{id}/subtree",
  "GET /api/v1/expenses/my",
  "GET /api/v1/expenses/queue/manager",
  "GET /api/v1/expenses/queue/finance",
  "GET /api/v1/expenses/{id}/audit",
  "GET /api/v1/manager-backups",
  "GET /api/v1/documents",
  "GET /api/v1/documents/{id}/access-log",
  "GET /api/v1/reports/expenses/my",
  "GET /api/v1/reports/expenses/manager-queue",
  "GET /api/v1/reports/expenses/finance-dashboard",
  "GET /api/v1/reports/expenses/register",
  "GET /api/v1/reports/expenses/advance-aging",
  "GET /api/v1/reports/expenses/payments",
  "GET /api/v1/reports/expenses/audit",
  "GET /api/v1/assets/",
  "GET /api/v1/assets/recovery-queue",
  "GET /api/v1/assets/requests/my",
  "GET /api/v1/assets/requests/queue",
  "GET /api/v1/assets/vendors",
  "GET /api/v1/assets/{id}/maintenance",
  "GET /api/v1/timesheets/work-segments",
  "GET /api/v1/timesheets/submissions/my",
  "GET /api/v1/timesheets/queue/approver",
  "GET /api/v1/timesheets/projects/summary",
  "GET /api/v1/timesheets/missing-submissions",
  "GET /api/v1/timesheets/workflow-definitions",
  "GET /api/v1/attendance/punches/my",
  "GET /api/v1/attendance/summary/my",
  "GET /api/v1/attendance/summary/team",
  "GET /api/v1/attendance/calendar/monthly",
  "GET /api/v1/attendance/regularizations/my",
  "GET /api/v1/attendance/exceptions",
  "GET /api/v1/leave/balances/my",
  "GET /api/v1/leave/balances/{user_id}",
  "GET /api/v1/leave/requests/my",
  "GET /api/v1/leave/requests/queue/manager",
  "GET /api/v1/wfh/requests/my",
  "GET /api/v1/wfh/requests/queue/manager",
  "GET /api/v1/leave-wfh/hr-monitor",
  "GET /api/v1/holidays",
  "GET /api/v1/ems/profile-change-requests/my",
  "GET /api/v1/ems/profile-change-requests/queue/hr",
  "GET /api/v1/ems/requests/my",
  "GET /api/v1/ems/requests/queue/hr",
  "GET /api/v1/ems/letters",
  "GET /api/v1/ems/policies",
  "GET /api/v1/projects",
  "GET /api/v1/projects/{id}/members",
  "GET /api/v1/projects/{id}/allocations",
  "GET /api/v1/projects/{id}/milestones",
  "GET /api/v1/projects/{id}/documents",
  "GET /api/v1/team-utilization/summary",
  "GET /api/v1/helpdesk/tickets",
  "GET /api/v1/helpdesk/categories",
  "GET /api/v1/helpdesk/sla-report",
  "GET /api/v1/notifications"
]);

process.env.HRMS_ALLOW_MEMORY_STORE ??= "true";
process.env.HRMS_DATA_STORE ??= "memory";

const failures: string[] = [];
const { buildApp } = await import("../src/app.js");
const app = await buildApp({ dataStoreMode: "memory" });
await app.ready();

try {
  const spec = app.swagger() as OpenApiDocument;
  verifySpec(spec);
  verifyStandaloneBoundary();
  verifyNoSecrets(spec);
} finally {
  await app.close();
}

if (failures.length > 0) {
  console.error(`API docs verification failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("API docs verification passed.");

function verifySpec(spec: OpenApiDocument): void {
  if (!spec.openapi?.startsWith("3.")) {
    failures.push("OpenAPI document must be version 3.x.");
  }

  const topLevelTags = new Set(spec.tags?.map((tag) => tag.name).filter(Boolean));
  for (const tag of allowedTags) {
    if (!topLevelTags.has(tag)) {
      failures.push(`Missing top-level tag: ${tag}`);
    }
  }

  const operations = collectOperations(spec);
  if (operations.length < 50) {
    failures.push(`Expected at least 50 documented operations, found ${operations.length}.`);
  }

  for (const { key, method, path, operation } of operations) {
    if (!operation.tags?.length) {
      failures.push(`${key} must have a tag.`);
    }
    for (const tag of operation.tags ?? []) {
      if (!allowedTags.has(tag)) {
        failures.push(`${key} uses unknown tag ${tag}.`);
      }
    }
    if (!operation.summary && !operation.description) {
      failures.push(`${key} must have a summary or description.`);
    }
    if (!has2xxResponse(operation)) {
      failures.push(`${key} must document a 2xx response.`);
    }
    if (isProtected(method, path) && (!operation.security || operation.security.length === 0)) {
      failures.push(`${key} must document session/bearer security.`);
    }
    for (const paramName of path.matchAll(/\{([^}]+)\}/gu)) {
      const name = paramName[1];
      const documented = operation.parameters?.some((parameter) => parameter.in === "path" && parameter.name === name && parameter.required !== false);
      if (!documented) {
        failures.push(`${key} must document path parameter ${name}.`);
      }
    }
    if (bodyRequiredOperations.has(key) && !hasJsonRequestBody(operation)) {
      failures.push(`${key} must document a JSON request body.`);
    }
    if (listOperations.has(key) && !hasQueryParameter(operation, "page")) {
      failures.push(`${key} must document pagination query parameters.`);
    }
    if (occOperations.has(key) && !operation.responses?.["409"]) {
      failures.push(`${key} must document OCC conflict response 409.`);
    }
  }

  verifyLoginOperation(spec);
  verifyHierarchyAndTimeline(spec);
  verifyFinanceGrouping(spec);
  verifyAttendanceContract(spec);
}

function verifyLoginOperation(spec: OpenApiDocument): void {
  const login = spec.paths?.["/api/v1/auth/login"]?.post;
  if (!login) {
    failures.push("POST /api/v1/auth/login is missing from OpenAPI.");
    return;
  }

  const schema = login.requestBody?.content?.["application/json"]?.schema as JsonObject | undefined;
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const properties = isObject(schema?.properties) ? schema.properties : {};
  if (!required.includes("email") || !required.includes("password") || !isObject(properties.email) || !isObject(properties.password)) {
    failures.push("Login request body must require email and password.");
  }
  if (!isObject(properties.employee_code)) {
    failures.push("Login request body must document DEV-only employee_code fallback.");
  }
  for (const statusCode of ["200", "400", "401", "403", "429", "500"]) {
    if (!login.responses?.[statusCode]) {
      failures.push(`Login operation must document ${statusCode} response.`);
    }
  }
  if (login.security && login.security.length > 0) {
    failures.push("Login operation must not require session/bearer security.");
  }
}

function verifyFinanceGrouping(spec: OpenApiDocument): void {
  for (const { key, path, operation } of collectOperations(spec)) {
    const isFinanceRoute =
      path.includes("/queue/finance") ||
      path.includes("/finance-detail") ||
      path.includes("/finance/") ||
      (path.includes("/expenses/") && path.includes("/settlement")) ||
      path.includes("/bills") ||
      path.includes("/finance-analytics") ||
      path.includes("/finance-dashboard") ||
      path.includes("/advance-aging") ||
      path.includes("/payments") ||
      path === "/api/v1/reports/expenses/audit";
    if (isFinanceRoute && !operation.tags?.includes("Finance Management")) {
      failures.push(`${key} must be grouped under Finance Management.`);
    }
  }
}

function verifyAttendanceContract(spec: OpenApiDocument): void {
  const punch = spec.paths?.["/api/v1/attendance/punches"]?.post;
  const punchRequest = jsonBodySchema(punch);
  const location = getObject(punchRequest, "properties", "command", "properties", "location");
  expectEnum(
    getObject(location, "oneOf", 0, "properties", "provider", "enum"),
    [...AttendanceLocationProviderValues],
    "Attendance punch location provider enum",
  );
  expectEnum(
    getObject(location, "oneOf", 1, "properties", "provider", "enum"),
    [...AttendanceLocationProviderValues],
    "Attendance punch failure-location provider enum",
  );
  if (JSON.stringify(location ?? {}).includes("\"gps\"") || JSON.stringify(location ?? {}).includes("\"manual\"")) {
    failures.push("Attendance location provider docs must not include gps/manual.");
  }

  const punchResponse = responseJsonSchema(punch, "200");
  const punchRequired = getObject(punchResponse, "properties", "punch", "required");
  if (Array.isArray(punchRequired) && (punchRequired.includes("work_date") || punchRequired.includes("time"))) {
    failures.push("Attendance command punch response must not require work_date/time.");
  }

  const punch409 = responseJsonSchema(punch, "409");
  expectEnum(
    getObject(punch409, "properties", "details", "properties", "reason_code", "enum"),
    [...AttendanceCommandReasonCodeValues],
    "Attendance 409 details.reason_code enum",
  );

  const assisted = spec.paths?.["/api/v1/attendance/employees/{employeeUserId}/assisted-current-punches"]?.post;
  if (!getObject(jsonBodySchema(assisted), "properties", "location")) {
    failures.push("Manager-assisted current punch docs must include optional location evidence.");
  }

  const historical = spec.paths?.["/api/v1/attendance/employees/{employeeUserId}/historical-corrections"]?.post;
  expectEnum(
    getObject(jsonBodySchema(historical), "properties", "event_type", "enum"),
    [...AttendanceHistoricalCorrectionEventTypeValues],
    "Attendance historical correction event_type enum",
  );

  const offlineResult = spec.components?.schemas?.AttendanceOfflineSyncResult;
  const offlineSync = spec.paths?.["/api/v1/attendance/offline-sync"]?.post;
  const offlineRequest = jsonBodySchema(offlineSync);
  if (!offlineRequest || getObject(offlineRequest, "properties", "events", "maxItems") !== 50) {
    failures.push("Attendance offline-sync request must document the existing max batch size of 50.");
  }
  const offlineResponse = responseJsonSchema(offlineSync, "200");
  if (!getObject(offlineResponse, "properties", "results")) {
    failures.push("Attendance offline-sync response must document per-event results.");
  }
  expectEnum(
    getObject(offlineResult, "properties", "sync_status", "enum"),
    [...AttendanceOfflineSyncStatusValues],
    "Attendance offline sync_status enum",
  );
  expectEnum(
    getObject(offlineResult, "properties", "verification_status", "enum"),
    [...AttendanceOfflineVerificationStatusValues],
    "Attendance offline verification_status enum",
  );
  expectEnum(
    getObject(offlineResult, "properties", "reason_code", "enum"),
    [...AttendanceOfflineSyncReasonCodeValues],
    "Attendance offline reason_code enum",
  );

  for (const componentName of [
    "AttendanceLocationEvidenceInput",
    "AttendanceGeoEvaluation",
    "AttendanceBusinessErrorDetails",
    "AttendancePunchCommandResponse",
    "AttendanceRegularizationItem",
    "AttendanceGeofenceCircleShape",
    "AttendanceGeofencePolygonShape",
    "AttendanceGeofencePublishedVersion",
    "AttendanceOfflineEventEnvelope",
    "AttendanceOfflineBatchEnvelope",
    "AttendanceOfflineSyncResponse",
  ]) {
    if (!spec.components?.schemas?.[componentName]) {
      failures.push(`Missing attendance OpenAPI component ${componentName}.`);
    }
  }
}

function jsonBodySchema(operation: Operation | undefined): JsonObject | undefined {
  return operation?.requestBody?.content?.["application/json"]?.schema;
}

function responseJsonSchema(
  operation: Operation | undefined,
  statusCode: string,
): JsonObject | undefined {
  const response = operation?.responses?.[statusCode];
  if (!isObject(response)) return undefined;
  return getObject(response, "content", "application/json", "schema") as JsonObject | undefined;
}

function getObject(
  value: unknown,
  ...path: Array<string | number>
): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (!isObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function expectEnum(value: unknown, expected: string[], label: string): void {
  if (!Array.isArray(value)) {
    failures.push(`${label} must be an enum.`);
    return;
  }
  const actual = value.map(String);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label} must equal ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`);
  }
}

function verifyHierarchyAndTimeline(spec: OpenApiDocument): void {
  const subtree = spec.paths?.["/api/v1/core/users/{id}/subtree"]?.get;
  const subtreeSerialized = JSON.stringify(subtree ?? {});
  for (const marker of ["total_active_descendants", "max_depth", "depth", "HR Manager"]) {
    if (!subtreeSerialized.includes(marker)) {
      failures.push(`Core subtree docs must include ${marker}.`);
    }
  }

  const timeline = spec.paths?.["/api/v1/expenses/{id}/timeline"]?.get;
  const timelineSerialized = JSON.stringify(timeline ?? {});
  for (const marker of ["event_type", "label", "stage", "actor_name", "status_from", "status_to"]) {
    if (!timelineSerialized.includes(marker)) {
      failures.push(`Expense timeline docs must include ${marker}.`);
    }
  }
}

function collectOperations(spec: OpenApiDocument): Array<{ key: string; method: string; path: string; operation: Operation }> {
  const rows: Array<{ key: string; method: string; path: string; operation: Operation }> = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method];
      if (operation) {
        const upperMethod = method.toUpperCase();
        rows.push({ key: `${upperMethod} ${path}`, method: upperMethod, path, operation });
      }
    }
  }
  return rows;
}

function has2xxResponse(operation: Operation): boolean {
  return Object.keys(operation.responses ?? {}).some((statusCode) => statusCode.startsWith("2"));
}

function hasJsonRequestBody(operation: Operation): boolean {
  return Boolean(operation.requestBody?.content?.["application/json"]?.schema);
}

function hasQueryParameter(operation: Operation, name: string): boolean {
  return operation.parameters?.some((parameter) => parameter.in === "query" && parameter.name === name) ?? false;
}

function isProtected(method: string, path: string): boolean {
  if (path.startsWith("/health/") || path.startsWith("/api/v1/health/") || path === "/api/v1/openapi.json") {
    return false;
  }
  if (method === "POST" && path.startsWith("/api/v1/auth/") && path !== "/api/v1/auth/session/preference") {
    return false;
  }
  if (method === "POST" && path === "/api/v1/onboarding/company-bootstrap") {
    return false;
  }
  if (method === "POST" && path === "/api/v1/onboarding/company-logo") {
    return false;
  }
  if (method === "POST" && path === "/api/v1/webhooks/resend") {
    return false;
  }
  if (method === "POST" && path === "/api/v1/auth/logout") {
    return false;
  }
  if (method === "POST" && path === "/api/v1/assets/scan/{qr_hash}") {
    return false;
  }
  return true;
}

function verifyStandaloneBoundary(): void {
  const packageJson = readFileSync("package.json", "utf8");
  if (/"(?:next|react|react-dom)"\s*:/u.test(packageJson)) {
    failures.push("package.json includes frontend dependencies.");
  }
  for (const file of walkFiles("src")) {
    if (file.includes("/__tests__/") || /\.(test|unit|integration|contract|e2e)\.ts$/u.test(file)) {
      continue;
    }
    const content = readFileSync(file, "utf8");
    if (/\bfrom\s+["'](?:next|react|react-dom)(?:\/[^"']*)?["']/u.test(content)) {
      failures.push(`${relative(process.cwd(), file)} imports frontend library code.`);
    }
    if (/apps\/(?:web|finance-web|documents-web|assets-web)|NEXT_PUBLIC_/u.test(content)) {
      failures.push(`${relative(process.cwd(), file)} contains frontend-only monorepo references.`);
    }
  }
}

function verifyNoSecrets(spec: OpenApiDocument): void {
  const serialized = JSON.stringify(spec);
  const forbiddenPatterns = [
    /JWT_(ACCESS|REFRESH)_SECRET/iu,
    /CLOUDINARY_API_SECRET/iu,
    /VALKEY_PASSWORD/iu,
    /postgres:\/\/postgres:postgres/iu
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) {
      failures.push(`OpenAPI examples include forbidden secret-like value matching ${pattern}.`);
    }
  }
}

function walkFiles(dir: string): string[] {
  const root = join(process.cwd(), dir);
  const files: string[] = [];
  visit(root, files);
  return files;
}

function visit(path: string, files: string[]): void {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (["node_modules", ".next", "dist"].includes(entry)) {
        continue;
      }
      visit(join(path, entry), files);
    }
    return;
  }
  if (/\.(ts|tsx)$/u.test(path)) {
    files.push(path);
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
