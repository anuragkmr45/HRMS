import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Operation = Record<string, any>;
type OpenApiDocument = {
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, Operation>>;
};

type OperationRow = {
  key: string;
  path: string;
  tag: string;
  operation: Operation;
};

const tick = String.fromCharCode(96);
const bar = String.fromCharCode(124);
const apiPath = join(process.cwd(), "docs/api/openapi.json");
const outputDir = join(process.cwd(), "docs/api/frontend-contract");
const spec = JSON.parse(readFileSync(apiPath, "utf8")) as OpenApiDocument;
const operations = collectOperations(spec);

mkdirSync(outputDir, { recursive: true });
copyFileSync(apiPath, join(outputDir, "openapi.json"));
writeFileSync(join(outputDir, "ENDPOINT_INDEX.md"), `${renderEndpointIndex()}\n`);
console.log(`Frontend endpoint contract generated for ${operations.length} operations.`);

function collectOperations(document: OpenApiDocument): OperationRow[] {
  const rows: OperationRow[] = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = item[method];
      if (!operation) {
        continue;
      }
      const upper = method.toUpperCase();
      rows.push({ key: `${upper} ${path}`, path, tag: operation.tags?.[0] ?? "Untagged", operation });
    }
  }
  return rows;
}

function renderEndpointIndex(): string {
  const groups = new Map<string, OperationRow[]>();
  for (const operation of operations) {
    const group = groups.get(operation.tag) ?? [];
    group.push(operation);
    groups.set(operation.tag, group);
  }
  const sections = [...groups.entries()].map(([tag, rows]) => [
    `## ${tag}`,
    moduleIntro(tag),
    ...rows.map(renderOperation)
  ].join("\n\n"));
  return [
    "# Endpoint Index",
    `This file is generated from ${code("docs/api/openapi.json")} by ${code("pnpm api:frontend-contract:generate")}.`,
    `OpenAPI title: ${spec.info?.title ?? "Hawkaii HRMS API"}`,
    `OpenAPI version: ${spec.info?.version ?? "unknown"}`,
    `Documented operations: ${operations.length}`,
    `Use ${code("openapi.json")} for exact schemas and this index for frontend behavior notes.`,
    sections.join("\n\n")
  ].join("\n\n");
}

function renderOperation(row: OperationRow): string {
  const operation = row.operation;
  return [
    `### ${row.key}`,
    table([
      ["Purpose", operation.summary ?? operation.description ?? "Backend operation"],
      ["Frontend use", frontendUse(row)],
      ["Auth", authText(operation)],
      ["Roles/scope", roleText(row.tag, row.path)]
    ]),
    renderParameters(operation),
    renderRequest(operation),
    renderResponses(operation),
    "**Frontend behavior notes**",
    businessNotes(row).map((note) => `- ${note}`).join("\n")
  ].join("\n\n");
}

function table(rows: string[][]): string {
  return [
    `${bar} Field ${bar} Contract ${bar}`,
    `${bar}---${bar}---${bar}`,
    ...rows.map((row) => `${bar} ${row[0] ?? ""} ${bar} ${escapeTable(row[1] ?? "")} ${bar}`)
  ].join("\n");
}

function renderParameters(operation: Operation): string {
  const params = operation.parameters as Array<Record<string, any>> | undefined;
  if (!params?.length) {
    return "**Path/query parameters**\n\nNo path or query parameters.";
  }
  const rows = params.map((parameter) =>
    `${bar} ${code(parameter.name ?? "unknown")} ${bar} ${parameter.in ?? "query"} ${bar} ${parameter.required ? "yes" : "no"} ${bar} ${schemaType(parameter.schema)} ${bar} ${escapeTable(schemaDescription(parameter.schema) ?? "-")} ${bar}`
  );
  return [
    "**Path/query parameters**",
    `${bar} Name ${bar} In ${bar} Required ${bar} Type ${bar} Notes ${bar}`,
    `${bar}---${bar}---${bar}---:${bar}---${bar}---${bar}`,
    ...rows
  ].join("\n");
}

function renderRequest(operation: Operation): string {
  const body = operation.requestBody as Record<string, any> | undefined;
  const content = body?.content as Record<string, Record<string, any>> | undefined;
  if (!content) {
    return "**Request body**\n\nNo request body.";
  }
  const parts = Object.entries(content).map(([contentType, media]) => {
    const schema = media.schema as Record<string, any> | undefined;
    const example = media.example ?? schema?.example;
    const exampleBlock = example === undefined ? "" : `\n\nExample:\n\n${tick.repeat(3)}json\n${JSON.stringify(example, null, 2)}\n${tick.repeat(3)}`;
    return [
      `Content type: ${code(contentType)}`,
      `Required: ${body?.required ? "yes" : "no"}`,
      schemaFieldTable(schema),
      exampleBlock
    ].filter(Boolean).join("\n\n");
  });
  return ["**Request body**", body?.description ?? "", ...parts].filter(Boolean).join("\n\n");
}

function renderResponses(operation: Operation): string {
  const responses = operation.responses as Record<string, Record<string, any>> | undefined;
  if (!responses) {
    return "**Responses**\n\nNo responses documented.";
  }
  const rows = Object.entries(responses).map(([status, response]) =>
    `${bar} ${code(status)} ${bar} ${escapeTable(response.description ?? defaultStatusDescription(status))} ${bar}`
  );
  const success = Object.entries(responses).find(([status]) => status.startsWith("2"));
  const successSchema = success?.[1].content?.["application/json"]?.schema;
  const successTable = successSchema ? `\n\nSuccess body highlights:\n\n${schemaFieldTable(successSchema)}` : "";
  return ["**Responses**", `${bar} Status ${bar} Meaning ${bar}`, `${bar}---${bar}---${bar}`, ...rows].join("\n") + successTable;
}

function schemaFieldTable(schema: Record<string, any> | undefined): string {
  if (!schema) {
    return "Schema is not declared in OpenAPI.";
  }
  const objectSchema = schema.type === "array" ? schema.items : schema;
  if (!objectSchema?.properties) {
    return `Schema: ${code(schemaType(schema))}.`;
  }
  const required = new Set<string>(objectSchema.required ?? []);
  const fields = Object.entries(objectSchema.properties as Record<string, Record<string, any>>);
  const rows = fields.slice(0, 30).map(([name, property]) => {
    const flags = [required.has(name) ? "required" : "optional", property.nullable ? "nullable" : ""].filter(Boolean).join(", ");
    return `${bar} ${code(name)} ${bar} ${schemaType(property)} ${bar} ${flags} ${bar} ${escapeTable(schemaDescription(property) ?? "-")} ${bar}`;
  });
  const clipped = fields.length > 30 ? `\n\nOnly the first 30 top-level fields are listed here; use ${code("openapi.json")} for the full schema.` : "";
  return [
    `${bar} Field ${bar} Type ${bar} Required ${bar} Notes ${bar}`,
    `${bar}---${bar}---${bar}---${bar}---${bar}`,
    ...rows
  ].join("\n") + clipped;
}

function schemaType(schema: Record<string, any> | undefined): string {
  if (!schema) {
    return "unknown";
  }
  const base = Array.isArray(schema.type) ? schema.type.join(" / ") : schema.type ?? (schema.properties ? "object" : "unknown");
  const format = schema.format ? `<${schema.format}>` : "";
  const item = schema.type === "array" && schema.items ? ` of ${schemaType(schema.items)}` : "";
  const values = schema.enum ? ` enum(${schema.enum.map((value: unknown) => JSON.stringify(value)).join(", ")})` : "";
  return `${base}${format}${item}${values}`;
}

function schemaDescription(schema: Record<string, any> | undefined): string | undefined {
  if (!schema) {
    return undefined;
  }
  const notes = [schema.description];
  if (schema.default !== undefined) notes.push(`default ${JSON.stringify(schema.default)}`);
  if (schema.minimum !== undefined) notes.push(`minimum ${schema.minimum}`);
  if (schema.minLength !== undefined) notes.push(`minLength ${schema.minLength}`);
  if (schema.minItems !== undefined) notes.push(`minItems ${schema.minItems}`);
  if (schema.pattern) notes.push(`pattern ${schema.pattern}`);
  return notes.filter(Boolean).join("; ") || undefined;
}

function authText(operation: Operation): string {
  if (Array.isArray(operation.security) && operation.security.length === 0) {
    return "Public. No bearer token or session cookie required.";
  }
  return `Protected. Send either the HttpOnly session cookie or ${code("Authorization: Bearer <access_token>")}.`;
}

function roleText(tag: string, path: string): string {
  const roleByTag: Record<string, string> = {
    "Platform / Health": "Public health/OpenAPI surface only; no sensitive config values.",
    "Platform / Devices": "Authenticated current user's active-company mobile devices only; company and owner are derived server-side.",
    "Core / Employees & Hierarchy": "Admin/HR/Auditor broad read; other users scoped to self or own hierarchy.",
    "Expenses / Requester": "Requester-owned records plus backend-approved manager/finance/admin/auditor read scope.",
    "Expenses / Manager": "Assigned direct manager or valid manager backup; requester self-verification is blocked.",
    "Finance Management": "Finance Manager or configured Finance/Admin backup; requester self-processing is blocked.",
    "Documents": "Classification and business-object policy apply; storage credentials are never exposed.",
    "Timesheets": "Employees manage own work; configured approvers action queues; Admin manages definitions.",
    "Reports & Analytics": "Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope.",
    "Admin / Configuration": "Admin/configuration persona only unless backend grants narrower operational permission.",
    "Outbox / Platform Events": "Protected runtime/platform event consumer; not a normal frontend screen API."
  };
  if (tag === "Auth & Sessions") return path.endsWith("/login") ? "Public login; protected session routes require token/cookie." : "Authenticated current user only.";
  if (tag === "Assets") return path.includes("/scan/") ? "Public safe QR scan returns limited data only." : "Asset Manager/Admin for mutations; scoped read/audit by policy.";
  return roleByTag[tag] ?? "Backend RBAC/ABAC decides access.";
}

function frontendUse(row: OperationRow): string {
  const path = row.path;
  const tag = row.tag;
  if (path.includes("/health") || path.endsWith("/openapi.json")) return "Runtime status, deployment diagnostics, or API tooling.";
  if (path.includes("/auth/login")) return "Login form.";
  if (path.includes("/auth/logout")) return "Logout action.";
  if (path.includes("/auth/me")) return "Session bootstrap, route guards, topbar user menu, and role-aware navigation.";
  if (tag === "Platform / Devices") return "Mobile app device registration, retry handling, and owner-scoped device management views.";
  if (path.includes("finance-governance") || path.includes("manager-backups")) return "Admin configuration for finance governance and backup routing.";
  if (path.includes("/queue/manager") || path.includes("/manager/verify")) return `${code("/finance/manager")} verification workspace.`;
  if (tag === "Finance Management") return "Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports.";
  if (tag === "Expenses / Requester") return "Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline.";
  if (tag === "Documents") return "Document upload, list, metadata, download URL, verification, and access-log widgets.";
  if (tag === "Assets") return "Asset inventory, assignment/return, QR scan, and software license screens.";
  if (tag === "Timesheets") return "Work segment entry, submissions, approver queue, decisions, and workflow definition admin.";
  if (tag === "Core / Employees & Hierarchy") return "Employee directory, hierarchy, selectors, and audit context.";
  if (tag === "Reports & Analytics") return "Report tables, filters, analytics panels, and export jobs.";
  return row.operation.summary ?? "Frontend API integration.";
}

function businessNotes(row: OperationRow): string[] {
  const notes = [
    `Display backend ${code("message")} and retain ${code("request_id")} for support.`,
    `Treat ${code("401")} as authentication failure and ${code("403")} as real permission denial.`
  ];
  const parameters = row.operation.parameters as Array<Record<string, any>> | undefined;
  if (parameters?.some((parameter) => parameter.in === "query" && parameter.name === "page")) notes.push(`Paginated list: send ${code("page")} and ${code("page_size")}; do not fetch unbounded lists.`);
  if (schemaHasProperty(row.operation.requestBody as Record<string, any> | undefined, "expected_version")) notes.push(`OCC mutation: send ${code("expected_version")}; on ${code("409")}, refetch latest object/version and ask the user to retry.`);
  if (row.path.includes("expenses")) {
    notes.push("Expense money values are decimal strings; do not use floating-point math for persisted amounts.");
    notes.push("Closed expense tickets are read-only unless a future correction API explicitly allows edits.");
  }
  if (row.path.includes("manager/verify")) notes.push("Manager return/reject require remarks; requester self-verification is blocked server-side.");
  if (row.path.includes("finance/approve")) notes.push("Finance approval starts only after manager verification; hold/clarification-style decisions require remarks.");
  if (row.path.includes("documents")) notes.push("Use backend document APIs only; never expose object-storage credentials or direct bucket paths.");
  if (row.path.includes("download-url")) notes.push("Download URLs are short-lived sensitive values; do not log or persist them.");
  if (row.tag === "Outbox / Platform Events") notes.push("Runtime integration route; do not expose as a normal user-facing frontend action.");
  notes.push(`Respect ${code("429")} and ${code("Retry-After")}; never build tight retry loops.`);
  return notes;
}

function schemaHasProperty(body: Record<string, any> | undefined, propertyName: string): boolean {
  const content = body?.content as Record<string, Record<string, any>> | undefined;
  for (const media of Object.values(content ?? {})) {
    if (media.schema?.properties?.[propertyName]) return true;
  }
  return false;
}

function moduleIntro(tag: string): string {
  const notes: Record<string, string> = {
    "Platform / Health": "Health and OpenAPI routes support runtime readiness checks and API tooling.",
    "Platform / Devices": "Device APIs register and list the authenticated user's mobile app installations in the active company.",
    "Auth & Sessions": "Authentication uses one platform session. Browser clients may rely on the HttpOnly cookie; API clients should use bearer tokens.",
    "Core / Employees & Hierarchy": "Core APIs expose active employee identity and hierarchy context for role-aware frontend screens.",
    "Expenses / Requester": "Requester APIs power employee expense self-service.",
    "Expenses / Manager": "Manager APIs power relationship-based verification. A manager role is not required; backend resolves direct manager or configured backup.",
    "Finance Management": "Finance APIs handle queue, approval, payment release, bills, settlement, audit, dashboard, and analytics.",
    "Documents": "Document APIs manage metadata and authorized object-storage access. The frontend never talks to object storage directly.",
    "Reports & Analytics": "Reports are role-scoped API-backed datasets and export requests.",
    "Assets": "Asset APIs cover inventory, assignment/return, safe QR scan, and software license lifecycle.",
    "Timesheets": "Timesheet APIs cover work segments, submissions, approver queues, decisions, and workflow definitions.",
    "Admin / Configuration": "Configuration APIs are admin-only operational surfaces for finance governance, manager backups, and workflow definitions.",
    "Outbox / Platform Events": "Platform event routes are protected runtime integrations and should not be exposed as normal UI actions."
  };
  return notes[tag] ?? "Backend-owned API group.";
}

function defaultStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    "400": "Invalid request or business precondition failure.",
    "401": "Missing, expired, or invalid authentication.",
    "403": "Authenticated but forbidden by role/object policy.",
    "404": "Resource not found or not visible to this actor.",
    "409": "Optimistic concurrency conflict or workflow state conflict.",
    "429": "Rate limit exceeded; respect Retry-After.",
    "500": "Unexpected server error; report request_id."
  };
  return status.startsWith("2") ? "Successful response." : descriptions[status] ?? "Documented API response.";
}

function code(value: string): string {
  return tick + value + tick;
}

function escapeTable(value: string): string {
  return String(value).split(bar).join(`\\${bar}`).split("\n").join("<br>");
}
