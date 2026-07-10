import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getLocalDemoPassword } from "#auth";
import { buildApp } from "../app.js";
import { createMemoryDataStore } from "../platform/data-store.js";
import { buildRealApp } from "./real-infra.js";

type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<string, unknown>;
};

type OpenApiDocument = {
  openapi?: string;
  tags?: Array<{ name?: string }>;
  paths?: Record<string, Record<string, Operation | undefined>>;
};

const protectedExceptions = new Set([
  "GET /health/live",
  "GET /health/ready",
  "GET /api/v1/health/live",
  "GET /api/v1/health/ready",
  "GET /api/v1/openapi.json",
  "POST /api/v1/auth/signup",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/password-reset/confirm",
  "POST /api/v1/onboarding/company-logo",
  "POST /api/v1/onboarding/company-bootstrap",
  "POST /api/v1/webhooks/resend",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout",
  "POST /api/v1/assets/scan/{qr_hash}"
]);
const localDemoPassword = getLocalDemoPassword();

const expectedOperations = [
  "DELETE /api/v1/manager-backups/{id}",
  "GET /api/v1/admin/audit-log",
  "GET /api/v1/admin/company-profile",
  "GET /api/v1/admin/email-templates",
  "GET /api/v1/admin/master-data/departments",
  "GET /api/v1/admin/master-data/designations",
  "GET /api/v1/admin/master-data/{master_key}",
  "GET /api/v1/admin/notification-channels",
  "GET /api/v1/admin/policies",
  "GET /api/v1/admin/rbac/permissions",
  "GET /api/v1/admin/rbac/roles",
  "GET /api/v1/admin/security-settings",
  "GET /api/v1/admin/workflows",
  "GET /api/v1/assets/",
  "GET /api/v1/assets/recovery-queue",
  "GET /api/v1/assets/requests/my",
  "GET /api/v1/assets/requests/queue",
  "GET /api/v1/assets/vendors",
  "GET /api/v1/assets/warranty-alerts",
  "GET /api/v1/assets/{id}",
  "GET /api/v1/assets/{id}/maintenance",
  "PATCH /api/v1/assets/vendors/{id}",
  "POST /api/v1/admin/company-profile/logo",
  "POST /api/v1/assets/recovery-queue/{id}/settlement",
  "POST /api/v1/assets/vendors",
  "GET /api/v1/attendance/calendar/daily",
  "GET /api/v1/attendance/calendar/monthly",
  "GET /api/v1/attendance/exceptions",
  "GET /api/v1/attendance/punches/my",
  "GET /api/v1/attendance/regularizations/my",
  "GET /api/v1/attendance/regularizations/queue/manager",
  "GET /api/v1/attendance/summary/my",
  "GET /api/v1/attendance/summary/team",
  "GET /api/v1/auth/me",
  "POST /api/v1/webhooks/resend",
  "POST /api/v1/onboarding/company-logo",
  "GET /api/v1/core/master-data/org-selectors",
  "GET /api/v1/core/users",
  "DELETE /api/v1/core/users/{id}/profile-photo",
  "GET /api/v1/core/users/imports/{job_id}",
  "GET /api/v1/core/users/profile-photo-policy",
  "GET /api/v1/core/users/{id}",
  "GET /api/v1/core/users/{id}/audit",
  "GET /api/v1/core/users/{id}/roles/history",
  "GET /api/v1/core/users/{id}/subtree",
  "GET /api/v1/dashboard/summary",
  "DELETE /api/v1/documents/{id}",
  "GET /api/v1/documents",
  "GET /api/v1/documents/upload-policy",
  "GET /api/v1/documents/{id}",
  "GET /api/v1/documents/{id}/access-log",
  "GET /api/v1/documents/{id}/content",
  "GET /api/v1/ems/admin/exits",
  "GET /api/v1/ems/admin/onboarding",
  "GET /api/v1/ems/admin/probation",
  "GET /api/v1/ems/employees/{user_id}/documents",
  "GET /api/v1/ems/letters",
  "GET /api/v1/ems/policies",
  "GET /api/v1/ems/profile-change-requests/my",
  "GET /api/v1/ems/profile-change-requests/queue/hr",
  "GET /api/v1/ems/profile/me",
  "GET /api/v1/ems/requests/my",
  "GET /api/v1/ems/requests/queue/hr",
  "GET /api/v1/expenses/dashboard-summary",
  "GET /api/v1/expenses/metadata",
  "GET /api/v1/expenses/my",
  "GET /api/v1/expenses/queue/finance",
  "GET /api/v1/expenses/queue/manager",
  "GET /api/v1/expenses/{id}",
  "GET /api/v1/expenses/{id}/audit",
  "GET /api/v1/expenses/{id}/finance-detail",
  "GET /api/v1/expenses/{id}/timeline",
  "GET /api/v1/health/live",
  "GET /api/v1/health/ready",
  "GET /api/v1/helpdesk/categories",
  "GET /api/v1/helpdesk/sla-report",
  "GET /api/v1/helpdesk/tickets",
  "GET /api/v1/helpdesk/tickets/{id}",
  "GET /api/v1/holidays",
  "GET /api/v1/leave-wfh/hr-monitor",
  "GET /api/v1/leave/balances/my",
  "GET /api/v1/leave/balances/{user_id}",
  "GET /api/v1/leave/requests/my",
  "GET /api/v1/leave/requests/queue/manager",
  "GET /api/v1/manager-backups",
  "GET /api/v1/notifications",
  "GET /api/v1/notifications/unread-count",
  "GET /api/v1/openapi.json",
  "GET /api/v1/platform/finance-governance",
  "GET /api/v1/projects",
  "GET /api/v1/projects/{id}",
  "GET /api/v1/projects/{id}/allocations",
  "GET /api/v1/projects/{id}/documents",
  "GET /api/v1/projects/{id}/members",
  "GET /api/v1/projects/{id}/milestones",
  "GET /api/v1/projects/{id}/summary",
  "GET /api/v1/reports/expenses/advance-aging",
  "GET /api/v1/reports/expenses/audit",
  "GET /api/v1/reports/expenses/finance-analytics",
  "GET /api/v1/reports/expenses/finance-dashboard",
  "GET /api/v1/reports/expenses/finance-history",
  "GET /api/v1/reports/expenses/manager-history",
  "GET /api/v1/reports/expenses/manager-queue",
  "GET /api/v1/reports/expenses/my",
  "GET /api/v1/reports/expenses/payments",
  "GET /api/v1/reports/expenses/register",
  "GET /api/v1/reports/assets/summary",
  "GET /api/v1/reports/attendance/summary",
  "GET /api/v1/reports/audit",
  "GET /api/v1/reports/exports",
  "GET /api/v1/reports/exports/{id}",
  "GET /api/v1/reports/helpdesk/summary",
  "GET /api/v1/reports/hr/employees",
  "GET /api/v1/reports/leave-wfh/summary",
  "GET /api/v1/reports/projects/summary",
  "GET /api/v1/reports/timesheets/summary",
  "GET /api/v1/timesheets/queue/approver",
  "GET /api/v1/timesheets/missing-submissions",
  "GET /api/v1/timesheets/productivity-summary",
  "GET /api/v1/timesheets/projects/summary",
  "GET /api/v1/timesheets/selectors",
  "GET /api/v1/timesheets/submissions/{id}",
  "GET /api/v1/timesheets/submissions/my",
  "GET /api/v1/timesheets/work-segments",
  "GET /api/v1/timesheets/workflow-definitions",
  "GET /api/v1/team-utilization/summary",
  "GET /api/v1/wfh/requests/my",
  "GET /api/v1/wfh/requests/queue/manager",
  "GET /health/live",
  "GET /health/ready",
  "PATCH /api/v1/auth/session/preference",
  "PATCH /api/v1/admin/master-data/departments/{id}",
  "PATCH /api/v1/admin/master-data/designations/{id}",
  "PATCH /api/v1/admin/master-data/{master_key}/{id}",
  "PATCH /api/v1/admin/rbac/roles/{id}",
  "PATCH /api/v1/core/users/{id}",
  "PATCH /api/v1/ems/admin/exits/{id}",
  "PATCH /api/v1/ems/admin/onboarding/{id}",
  "PATCH /api/v1/expenses/{id}",
  "POST /api/v1/assets/",
  "POST /api/v1/assets/events/employee-terminated",
  "POST /api/v1/assets/licenses/activate",
  "POST /api/v1/assets/licenses/revoke",
  "POST /api/v1/assets/licenses/validate",
  "POST /api/v1/assets/requests",
  "POST /api/v1/assets/requests/{id}/cancel",
  "POST /api/v1/assets/requests/{id}/decision",
  "POST /api/v1/assets/scan/{qr_hash}",
  "POST /api/v1/assets/{id}/acknowledgements",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/maintenance",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/attendance/punches",
  "POST /api/v1/attendance/exports",
  "POST /api/v1/attendance/regularizations",
  "POST /api/v1/attendance/regularizations/{id}/decision",
  "POST /api/v1/leave-wfh/exports",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/password-reset/confirm",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/signup",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout",
  "POST /api/v1/admin/master-data/departments",
  "POST /api/v1/admin/master-data/designations",
  "POST /api/v1/admin/master-data/{master_key}",
  "POST /api/v1/admin/rbac/roles",
  "POST /api/v1/core/users",
  "POST /api/v1/core/users/exports",
  "POST /api/v1/core/users/imports",
  "POST /api/v1/core/users/{id}/activate",
  "POST /api/v1/core/users/{id}/deactivate",
  "POST /api/v1/core/users/{id}/login/disable",
  "POST /api/v1/core/users/{id}/login/enable",
  "POST /api/v1/core/users/{id}/profile-photo",
  "POST /api/v1/documents",
  "POST /api/v1/documents/{id}/download-url",
  "POST /api/v1/documents/{id}/verify",
  "POST /api/v1/ems/employees/{user_id}/documents",
  "PATCH /api/v1/ems/profile/me",
  "POST /api/v1/ems/letters/{id}/acknowledge",
  "POST /api/v1/ems/policies/{id}/acknowledge",
  "POST /api/v1/ems/admin/probation/{id}/decision",
  "POST /api/v1/ems/profile-change-requests",
  "POST /api/v1/ems/profile-change-requests/{id}/decision",
  "POST /api/v1/ems/requests",
  "POST /api/v1/ems/requests/{id}/decision",
  "POST /api/v1/expenses",
  "POST /api/v1/expenses/{id}/bills",
  "POST /api/v1/expenses/{id}/clarifications",
  "POST /api/v1/expenses/{id}/documents",
  "POST /api/v1/expenses/{id}/documents/{documentId}/verify",
  "POST /api/v1/expenses/{id}/finance/approve",
  "POST /api/v1/expenses/{id}/finance/payment",
  "POST /api/v1/expenses/{id}/manager/verify",
  "POST /api/v1/expenses/{id}/settlement",
  "POST /api/v1/expenses/{id}/submit",
  "POST /api/v1/expenses/{id}/withdraw",
  "PATCH /api/v1/helpdesk/categories/{id}",
  "POST /api/v1/helpdesk/categories",
  "PATCH /api/v1/helpdesk/tickets/{id}",
  "POST /api/v1/helpdesk/tickets",
  "POST /api/v1/helpdesk/tickets/{id}/assign",
  "POST /api/v1/helpdesk/tickets/{id}/attachments",
  "POST /api/v1/helpdesk/tickets/{id}/close",
  "POST /api/v1/helpdesk/tickets/{id}/comments",
  "POST /api/v1/helpdesk/tickets/{id}/internal-notes",
  "POST /api/v1/helpdesk/tickets/{id}/priority",
  "POST /api/v1/helpdesk/tickets/{id}/reopen",
  "POST /api/v1/helpdesk/tickets/{id}/resolve",
  "POST /api/v1/helpdesk/tickets/{id}/status",
  "POST /api/v1/leave/requests",
  "POST /api/v1/leave/requests/{id}/cancel",
  "POST /api/v1/leave/requests/{id}/decision",
  "POST /api/v1/manager-backups",
  "POST /api/v1/notifications/read-all",
  "POST /api/v1/notifications/{id}/read",
  "POST /api/v1/onboarding/company-bootstrap",
  "PATCH /api/v1/projects/{id}",
  "POST /api/v1/projects",
  "POST /api/v1/projects/{id}/allocations",
  "POST /api/v1/projects/{id}/archive",
  "POST /api/v1/projects/{id}/members",
  "PATCH /api/v1/projects/{id}/members/{member_id}",
  "POST /api/v1/projects/{id}/milestones",
  "POST /api/v1/reports/exports",
  "POST /api/v1/timesheets/submissions",
  "POST /api/v1/timesheets/submissions/{id}/approve",
  "POST /api/v1/timesheets/work-segments",
  "POST /api/v1/timesheets/workflow-definitions",
  "POST /api/v1/wfh/requests",
  "POST /api/v1/wfh/requests/{id}/decision",
  "PUT /api/v1/admin/company-profile",
  "PUT /api/v1/admin/email-templates/{template_key}",
  "PUT /api/v1/admin/notification-channels",
  "PUT /api/v1/admin/policies/{policy_key}",
  "PUT /api/v1/admin/rbac/roles/{id}/permissions",
  "PUT /api/v1/admin/security-settings",
  "PUT /api/v1/admin/workflows/{workflow_key}",
  "PUT /api/v1/ems/policies/{id}",
  "PUT /api/v1/holidays/{id}",
  "PUT /api/v1/core/users/{id}/roles",
  "PUT /api/v1/platform/finance-governance"
] as const;

const bodyRequiredOperations = [
  "POST /api/v1/onboarding/company-bootstrap",
  "POST /api/v1/auth/password-reset/confirm",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/signup",
  "PATCH /api/v1/auth/session/preference",
  "PUT /api/v1/admin/company-profile",
  "PUT /api/v1/admin/email-templates/{template_key}",
  "PUT /api/v1/admin/notification-channels",
  "PUT /api/v1/admin/policies/{policy_key}",
  "PUT /api/v1/admin/security-settings",
  "POST /api/v1/admin/master-data/departments",
  "PATCH /api/v1/admin/master-data/departments/{id}",
  "POST /api/v1/admin/master-data/designations",
  "PATCH /api/v1/admin/master-data/designations/{id}",
  "POST /api/v1/admin/master-data/{master_key}",
  "PATCH /api/v1/admin/master-data/{master_key}/{id}",
  "POST /api/v1/admin/rbac/roles",
  "PATCH /api/v1/admin/rbac/roles/{id}",
  "PUT /api/v1/admin/rbac/roles/{id}/permissions",
  "PUT /api/v1/admin/workflows/{workflow_key}",
  "POST /api/v1/auth/login",
  "POST /api/v1/core/users",
  "POST /api/v1/core/users/exports",
  "POST /api/v1/core/users/imports",
  "PATCH /api/v1/core/users/{id}",
  "POST /api/v1/core/users/{id}/activate",
  "POST /api/v1/core/users/{id}/deactivate",
  "POST /api/v1/core/users/{id}/login/enable",
  "POST /api/v1/core/users/{id}/login/disable",
  "PUT /api/v1/core/users/{id}/roles",
  "POST /api/v1/expenses",
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
  "POST /api/v1/expenses/{id}/documents",
  "POST /api/v1/expenses/{id}/settlement",
  "POST /api/v1/documents",
  "POST /api/v1/ems/employees/{user_id}/documents",
  "POST /api/v1/assets/",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/assets/events/employee-terminated",
  "POST /api/v1/assets/licenses/activate",
  "POST /api/v1/assets/licenses/revoke",
  "POST /api/v1/assets/licenses/validate",
  "POST /api/v1/assets/requests",
  "POST /api/v1/assets/requests/{id}/cancel",
  "POST /api/v1/assets/requests/{id}/decision",
  "POST /api/v1/assets/recovery-queue/{id}/settlement",
  "POST /api/v1/assets/vendors",
  "PATCH /api/v1/assets/vendors/{id}",
  "POST /api/v1/assets/{id}/acknowledgements",
  "POST /api/v1/assets/{id}/maintenance",
  "POST /api/v1/timesheets/work-segments",
  "POST /api/v1/timesheets/submissions",
  "POST /api/v1/timesheets/submissions/{id}/approve",
  "POST /api/v1/timesheets/workflow-definitions",
  "POST /api/v1/attendance/punches",
  "POST /api/v1/attendance/exports",
  "POST /api/v1/attendance/regularizations",
  "POST /api/v1/attendance/regularizations/{id}/decision",
  "POST /api/v1/leave-wfh/exports",
  "POST /api/v1/leave/requests",
  "POST /api/v1/leave/requests/{id}/decision",
  "POST /api/v1/leave/requests/{id}/cancel",
  "POST /api/v1/wfh/requests",
  "POST /api/v1/wfh/requests/{id}/decision",
  "PUT /api/v1/holidays/{id}",
  "PATCH /api/v1/ems/profile/me",
  "PATCH /api/v1/ems/admin/exits/{id}",
  "PATCH /api/v1/ems/admin/onboarding/{id}",
  "POST /api/v1/ems/admin/probation/{id}/decision",
  "POST /api/v1/ems/profile-change-requests",
  "POST /api/v1/ems/profile-change-requests/{id}/decision",
  "POST /api/v1/ems/requests",
  "POST /api/v1/ems/requests/{id}/decision",
  "POST /api/v1/ems/letters/{id}/acknowledge",
  "POST /api/v1/ems/policies/{id}/acknowledge",
  "PUT /api/v1/ems/policies/{id}",
  "POST /api/v1/projects",
  "PATCH /api/v1/projects/{id}",
  "POST /api/v1/projects/{id}/archive",
  "POST /api/v1/projects/{id}/members",
  "PATCH /api/v1/projects/{id}/members/{member_id}",
  "POST /api/v1/projects/{id}/allocations",
  "POST /api/v1/projects/{id}/milestones",
  "POST /api/v1/helpdesk/categories",
  "PATCH /api/v1/helpdesk/categories/{id}",
  "POST /api/v1/helpdesk/tickets",
  "PATCH /api/v1/helpdesk/tickets/{id}",
  "PUT /api/v1/admin/company-profile",
  "PUT /api/v1/admin/security-settings",
  "POST /api/v1/helpdesk/tickets/{id}/comments",
  "POST /api/v1/helpdesk/tickets/{id}/internal-notes",
  "POST /api/v1/helpdesk/tickets/{id}/attachments",
  "POST /api/v1/helpdesk/tickets/{id}/assign",
  "POST /api/v1/helpdesk/tickets/{id}/priority",
  "POST /api/v1/helpdesk/tickets/{id}/status",
  "POST /api/v1/helpdesk/tickets/{id}/resolve",
  "POST /api/v1/helpdesk/tickets/{id}/close",
  "POST /api/v1/helpdesk/tickets/{id}/reopen",
  "POST /api/v1/notifications/{id}/read",
  "POST /api/v1/notifications/read-all",
  "POST /api/v1/manager-backups",
  "POST /api/v1/reports/exports",
  "PUT /api/v1/platform/finance-governance"
];

const occOperations = [
  "POST /api/v1/expenses/{id}/submit",
  "POST /api/v1/expenses/{id}/withdraw",
  "POST /api/v1/expenses/{id}/manager/verify",
  "POST /api/v1/expenses/{id}/finance/approve",
  "POST /api/v1/expenses/{id}/finance/payment",
  "POST /api/v1/expenses/{id}/settlement",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/acknowledgements",
  "POST /api/v1/assets/{id}/maintenance",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/assets/recovery-queue/{id}/settlement",
  "PATCH /api/v1/assets/vendors/{id}",
  "POST /api/v1/assets/requests/{id}/cancel",
  "POST /api/v1/assets/requests/{id}/decision",
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
  "PATCH /api/v1/helpdesk/categories/{id}",
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
  "POST /api/v1/notifications/{id}/read",
  "DELETE /api/v1/manager-backups/{id}",
  "PATCH /api/v1/admin/master-data/departments/{id}",
  "PATCH /api/v1/admin/master-data/designations/{id}",
  "PATCH /api/v1/admin/rbac/roles/{id}",
  "PUT /api/v1/admin/email-templates/{template_key}",
  "PUT /api/v1/admin/notification-channels",
  "PUT /api/v1/admin/policies/{policy_key}",
  "PUT /api/v1/admin/rbac/roles/{id}/permissions",
  "PUT /api/v1/admin/security-settings",
  "PUT /api/v1/admin/workflows/{workflow_key}",
  "PATCH /api/v1/ems/admin/exits/{id}",
  "PATCH /api/v1/ems/admin/onboarding/{id}",
  "POST /api/v1/ems/admin/probation/{id}/decision",
  "POST /api/v1/ems/requests/{id}/decision",
  "PUT /api/v1/ems/policies/{id}",
  "PATCH /api/v1/admin/master-data/{master_key}/{id}"
];

const listOperations = [
  "GET /api/v1/core/users",
  "GET /api/v1/core/users/{id}/audit",
  "GET /api/v1/core/users/{id}/roles/history",
  "GET /api/v1/admin/master-data/departments",
  "GET /api/v1/admin/master-data/designations",
  "GET /api/v1/admin/master-data/{master_key}",
  "GET /api/v1/admin/rbac/roles",
  "GET /api/v1/admin/audit-log",
  "GET /api/v1/expenses/my",
  "GET /api/v1/expenses/queue/manager",
  "GET /api/v1/expenses/queue/finance",
  "GET /api/v1/manager-backups",
  "GET /api/v1/documents",
  "GET /api/v1/documents/{id}/access-log",
  "GET /api/v1/reports/expenses/my",
  "GET /api/v1/reports/expenses/manager-queue",
  "GET /api/v1/reports/expenses/manager-history",
  "GET /api/v1/reports/expenses/finance-history",
  "GET /api/v1/reports/expenses/register",
  "GET /api/v1/reports/expenses/advance-aging",
  "GET /api/v1/reports/expenses/payments",
  "GET /api/v1/reports/expenses/audit",
  "GET /api/v1/reports/assets/summary",
  "GET /api/v1/reports/attendance/summary",
  "GET /api/v1/reports/audit",
  "GET /api/v1/reports/exports",
  "GET /api/v1/reports/helpdesk/summary",
  "GET /api/v1/reports/hr/employees",
  "GET /api/v1/reports/leave-wfh/summary",
  "GET /api/v1/reports/projects/summary",
  "GET /api/v1/reports/timesheets/summary",
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
  "GET /api/v1/attendance/calendar/daily",
  "GET /api/v1/attendance/calendar/monthly",
  "GET /api/v1/attendance/regularizations/my",
  "GET /api/v1/attendance/regularizations/queue/manager",
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
  "GET /api/v1/ems/employees/{user_id}/documents",
  "GET /api/v1/ems/admin/onboarding",
  "GET /api/v1/ems/admin/probation",
  "GET /api/v1/ems/admin/exits",
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
];

describe("CORS configuration", () => {
  it("allows configured local frontend origins for credentialed write preflights", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
    process.env.NODE_ENV = "development";
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:3000,http://localhost:8080";
    const localApp = await buildApp({ dataStore: createMemoryDataStore(), rateLimit: false });
    try {
      await localApp.ready();
      const preflight = await localApp.inject({
        method: "OPTIONS",
        url: "/api/v1/core/users/3bbda5f8-e717-4598-bc73-11cac0bee411",
        headers: {
          origin: "http://localhost:8080",
          "access-control-request-method": "PATCH",
          "access-control-request-headers": "content-type,authorization"
        }
      });
      expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
      expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
      expect(String(preflight.headers["access-control-allow-methods"])).toContain("PATCH");

      const deniedPreflight = await localApp.inject({
        method: "OPTIONS",
        url: "/api/v1/core/users/3bbda5f8-e717-4598-bc73-11cac0bee411",
        headers: {
          origin: "http://localhost:9090",
          "access-control-request-method": "PATCH",
          "access-control-request-headers": "content-type,authorization"
        }
      });
      expect(deniedPreflight.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await localApp.close();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousAllowedOrigins === undefined) {
        delete process.env.CORS_ALLOWED_ORIGINS;
      } else {
        process.env.CORS_ALLOWED_ORIGINS = previousAllowedOrigins;
      }
    }
  });
});

describe("Auth guard", () => {
  it("sets browser session cookies for local and hosted refresh flows", async () => {
    const previousCookieSecure = process.env.COOKIE_SECURE;
    try {
      process.env.COOKIE_SECURE = "false";
      const localApp = await buildApp({ dataStore: createMemoryDataStore(), rateLimit: false });
      try {
        await localApp.ready();
        const login = await localApp.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { email: "finance@example.test", password: localDemoPassword }
        });
        const setCookie = cookieHeader(login.headers["set-cookie"]);
        expect(login.statusCode).toBe(200);
        expect(setCookie).toContain("SameSite=Lax");
        expect(setCookie).not.toContain("Secure");
      } finally {
        await localApp.close();
      }

      process.env.COOKIE_SECURE = "true";
      const hostedApp = await buildApp({ dataStore: createMemoryDataStore(), rateLimit: false });
      try {
        await hostedApp.ready();
        const login = await hostedApp.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { email: "finance@example.test", password: localDemoPassword }
        });
        const loginCookie = cookieHeader(login.headers["set-cookie"]);
        expect(login.statusCode).toBe(200);
        expect(loginCookie).toContain("SameSite=None");
        expect(loginCookie).toContain("Secure");

        const logout = await hostedApp.inject({ method: "POST", url: "/api/v1/auth/logout" });
        const clearCookie = cookieHeader(logout.headers["set-cookie"]);
        expect(logout.statusCode).toBe(200);
        expect(clearCookie).toContain("SameSite=None");
        expect(clearCookie).toContain("Secure");
      } finally {
        await hostedApp.close();
      }
    } finally {
      if (previousCookieSecure === undefined) {
        delete process.env.COOKIE_SECURE;
      } else {
        process.env.COOKIE_SECURE = previousCookieSecure;
      }
    }
  });

  it("does not flush persistence for invalid login attempts", async () => {
    const store = createMemoryDataStore();
    let flushCalls = 0;
    store.persistence = {
      async flush() {
        flushCalls += 1;
        throw new Error("flush should not run for failed login");
      },
      async reload() {
        // no-op test persistence
      },
      async close() {
        // no-op test persistence
      }
    };
    const localApp = await buildApp({ dataStore: store, rateLimit: false });
    try {
      await localApp.ready();
      const response = await localApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "missing-user@example.test",
          password: "WrongPassword123"
        }
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: "UNAUTHORIZED",
        message: "Invalid email or password"
      });
      expect(flushCalls).toBe(0);
    } finally {
      await localApp.close();
    }
  });

  it("does not flush persistence for successful login and logout", async () => {
    const store = createMemoryDataStore();
    let flushCalls = 0;
    store.persistence = {
      async flush() {
        flushCalls += 1;
        throw new Error("flush should not run for session-only auth mutations");
      },
      async reload() {
        // no-op test persistence
      },
      async close() {
        // no-op test persistence
      }
    };
    const localApp = await buildApp({ dataStore: store, rateLimit: false });
    try {
      await localApp.ready();
      const login = await localApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "admin@example.test",
          password: localDemoPassword
        }
      });
      expect(login.statusCode).toBe(200);

      const logout = await localApp.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: {
          cookie: cookieHeader(login.headers["set-cookie"])
        }
      });
      expect(logout.statusCode).toBe(200);
      expect(flushCalls).toBe(0);
    } finally {
      await localApp.close();
    }
  });

  it("returns 401 for stale or malformed bearer tokens instead of leaking a 500", async () => {
    const localApp = await buildApp({ dataStore: createMemoryDataStore(), rateLimit: false });
    try {
      await localApp.ready();
      const response = await localApp.inject({
        method: "GET",
        url: "/api/v1/core/users",
        headers: {
          authorization: "Bearer stale-token"
        }
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: "UNAUTHORIZED",
        message: "Invalid or expired session"
      });
    } finally {
      await localApp.close();
    }
  });
});

describe("API contracts", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("exposes OpenAPI and typed health responses", async () => {
    const health = await app.inject({ method: "GET", url: "/health/live" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok", service: "hawkaii-hrms-api" });

    const versionedHealth = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(versionedHealth.statusCode).toBe(200);
    expect(versionedHealth.json()).toEqual({ status: "ok", service: "hawkaii-hrms-api" });

    const openapi = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json().info.title).toBe("Hawkaii HRMS API");

    const docs = await app.inject({ method: "GET", url: "/docs" });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers["content-type"]).toContain("text/html");
  });

  it("sets baseline security headers and enforces production CORS allowlist", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
    const previousLogLevel = process.env.LOG_LEVEL;
    const previousEmailMode = process.env.EMAIL_DELIVERY_MODE;
    const previousCloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const previousCloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
    const previousCloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
    const previousCloudinaryMockUploads = process.env.CLOUDINARY_MOCK_UPLOADS;
    const previousResendApiKey = process.env.RESEND_API_KEY;
    const previousResendFromEmail = process.env.RESEND_FROM_EMAIL;
    const previousResendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://hrms.example.com";
    process.env.LOG_LEVEL = "warn";
    process.env.EMAIL_DELIVERY_MODE = "send";
    process.env.CLOUDINARY_CLOUD_NAME = "prod-contract-cloud";
    process.env.CLOUDINARY_API_KEY = "prod-contract-cloudinary-key";
    process.env.CLOUDINARY_API_SECRET = "prod-contract-cloudinary-secret";
    process.env.CLOUDINARY_MOCK_UPLOADS = "false";
    process.env.RESEND_API_KEY = "test-resend-api-key";
    process.env.RESEND_FROM_EMAIL = "verify@example.test";
    process.env.RESEND_WEBHOOK_SECRET = "test-resend-webhook-secret";
    process.env.FRONTEND_URL = "https://hrms.example.com";
    const secureApp = await buildApp({ dataStore: createMemoryDataStore(), logger: true, rateLimit: false });
    try {
      await secureApp.ready();
      expect(secureApp.log.level).toBe("warn");
      const health = await secureApp.inject({ method: "GET", url: "/health/live" });
      expect(health.headers["x-content-type-options"]).toBe("nosniff");
      expect(health.headers["x-frame-options"]).toBe("DENY");
      expect(health.headers["referrer-policy"]).toBe("no-referrer");
      expect(health.headers["permissions-policy"]).toContain("camera=()");
      expect(health.headers["strict-transport-security"]).toContain("max-age=15552000");

      const allowedPreflight = await secureApp.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/login",
        headers: {
          origin: "https://hrms.example.com",
          "access-control-request-method": "POST"
        }
      });
      expect(allowedPreflight.headers["access-control-allow-origin"]).toBe("https://hrms.example.com");
      expect(allowedPreflight.headers["access-control-allow-credentials"]).toBe("true");

      const deniedPreflight = await secureApp.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/login",
        headers: {
          origin: "https://evil.example.com",
          "access-control-request-method": "POST"
        }
      });
      expect(deniedPreflight.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await secureApp.close();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousAllowedOrigins === undefined) {
        delete process.env.CORS_ALLOWED_ORIGINS;
      } else {
        process.env.CORS_ALLOWED_ORIGINS = previousAllowedOrigins;
      }
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
      if (previousEmailMode === undefined) {
        delete process.env.EMAIL_DELIVERY_MODE;
      } else {
        process.env.EMAIL_DELIVERY_MODE = previousEmailMode;
      }
      if (previousCloudinaryCloudName === undefined) {
        delete process.env.CLOUDINARY_CLOUD_NAME;
      } else {
        process.env.CLOUDINARY_CLOUD_NAME = previousCloudinaryCloudName;
      }
      if (previousCloudinaryApiKey === undefined) {
        delete process.env.CLOUDINARY_API_KEY;
      } else {
        process.env.CLOUDINARY_API_KEY = previousCloudinaryApiKey;
      }
      if (previousCloudinaryApiSecret === undefined) {
        delete process.env.CLOUDINARY_API_SECRET;
      } else {
        process.env.CLOUDINARY_API_SECRET = previousCloudinaryApiSecret;
      }
      if (previousCloudinaryMockUploads === undefined) {
        delete process.env.CLOUDINARY_MOCK_UPLOADS;
      } else {
        process.env.CLOUDINARY_MOCK_UPLOADS = previousCloudinaryMockUploads;
      }
      if (previousResendApiKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = previousResendApiKey;
      }
      if (previousResendFromEmail === undefined) {
        delete process.env.RESEND_FROM_EMAIL;
      } else {
        process.env.RESEND_FROM_EMAIL = previousResendFromEmail;
      }
      if (previousResendWebhookSecret === undefined) {
        delete process.env.RESEND_WEBHOOK_SECRET;
      } else {
        process.env.RESEND_WEBHOOK_SECRET = previousResendWebhookSecret;
      }
      if (previousFrontendUrl === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = previousFrontendUrl;
      }
    }
  });

  it("returns typed OCC errors", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/my"
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().request_id).toBeDefined();
    expect(response.json().code).toBe("UNAUTHORIZED");
  });

  it("documents the auth login request body and error responses for Swagger try-it-out", async () => {
    const spec = await openApiSpec(app);
    const login = operation(spec, "POST /api/v1/auth/login");
    const schema = login.requestBody?.content?.["application/json"]?.schema;

    expect(login.tags).toEqual(["Auth & Sessions"]);
    expect(login.security).toEqual([]);
    expect(schema?.required).toContain("email");
    expect(schema?.required).toContain("password");
    expect((schema?.properties as Record<string, unknown>).email).toBeDefined();
    expect((schema?.properties as Record<string, unknown>).password).toBeDefined();
    expect((schema?.properties as Record<string, unknown>).employee_code).toBeDefined();
    for (const statusCode of ["200", "400", "401", "403", "429", "500"]) {
      expect(login.responses?.[statusCode]).toBeDefined();
    }
  });

  it("rate limits API clients with typed 429 responses while leaving health checks open", async () => {
    const limitedApp = await buildApp({
      dataStore: createMemoryDataStore(),
      rateLimit: {
        authMax: 5,
        readMax: 2,
        writeMax: 2,
        windowSeconds: 60
      }
    });
    try {
      await limitedApp.ready();
      const login = await limitedApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "finance@example.test", password: localDemoPassword }
      });
      expect(login.statusCode).toBe(200);
      const token = login.json().access_token as string;

      const firstRead = await limitedApp.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
      const secondRead = await limitedApp.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
      const limitedRead = await limitedApp.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
      expect(firstRead.statusCode).toBe(200);
      expect(secondRead.statusCode).toBe(200);
      expect(limitedRead.statusCode).toBe(429);
      expect(limitedRead.json()).toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please wait and try again."
      });
      expect(limitedRead.json().details.retry_after_seconds).toBeGreaterThan(0);
      expect(limitedRead.json().request_id).toBeDefined();
      expect(limitedRead.headers["retry-after"]).toBeDefined();
      expect(limitedRead.headers["x-ratelimit-limit"]).toBe("2");

      for (let index = 0; index < 4; index += 1) {
        const invalid = await limitedApp.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { email: "finance@example.test", password: "wrong-password" }
        });
        expect([401, 429]).toContain(invalid.statusCode);
      }
      const limitedLogin = await limitedApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "finance@example.test", password: "wrong-password" }
      });
      expect(limitedLogin.statusCode).toBe(429);
      expect(limitedLogin.json().code).toBe("TOO_MANY_REQUESTS");

      const health = await limitedApp.inject({ method: "GET", url: "/api/v1/health/live" });
      expect(health.statusCode).toBe(200);
    } finally {
      await limitedApp.close();
    }
  });

  it("returns the documented validation error for empty or invalid login bodies", async () => {
    const emptyBody = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: ""
    });
    expect(emptyBody.statusCode).toBe(400);
    expect(emptyBody.json().code).toBe("VALIDATION_FAILED");
    expect(emptyBody.json().request_id).toBeDefined();

    const invalidBody = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {}
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json().code).toBe("VALIDATION_FAILED");
    expect(invalidBody.json().details.fieldErrors.email).toBeDefined();
    expect(invalidBody.json().details.fieldErrors.password).toBeDefined();
  });

  it("authenticates email/password and keeps invalid credential errors generic", async () => {
    const success = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "finance@example.test", password: localDemoPassword }
    });
    expect(success.statusCode).toBe(200);
    expect(success.json().access_token).toBeTruthy();
    expect(success.json().user.email).toBe("finance@example.test");
    expect(JSON.stringify(success.json())).not.toContain("password_hash");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "finance@example.test", password: "wrong-password" }
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().message).toBe("Invalid email or password");
    expect(JSON.stringify(invalid.json())).not.toContain(localDemoPassword);
  });

  it("keeps logout idempotent for stale or missing local sessions", async () => {
    const noSession = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout"
    });
    expect(noSession.statusCode).toBe(200);
    expect(noSession.json()).toEqual({ status: "ok" });
    expect(noSession.headers["set-cookie"]).toBeDefined();

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "finance@example.test", password: localDemoPassword }
    });
    const cookie = login.headers["set-cookie"];
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? "" }
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ status: "ok" });
  });

  it("documents tags, success schemas, security, params, and list query contracts", async () => {
    const spec = await openApiSpec(app);
    const rows = operations(spec);

    expect(spec.openapi).toBe("3.0.3");
    expect(rows.map((row) => row.key).sort()).toEqual([...expectedOperations].sort());
    expect(rows.length).toBe(245);

    for (const row of rows) {
      expect(row.operation.tags?.length, `${row.key} tag`).toBeGreaterThan(0);
      expect(row.operation.summary || row.operation.description, `${row.key} summary`).toBeTruthy();
      expect(Object.keys(row.operation.responses ?? {}).some((status) => status.startsWith("2")), `${row.key} 2xx response`).toBe(true);
      if (!protectedExceptions.has(row.key)) {
        expect(row.operation.security?.length, `${row.key} security`).toBeGreaterThan(0);
      }
      for (const param of row.path.matchAll(/\{([^}]+)\}/gu)) {
        expect(
          row.operation.parameters?.some((documented) => documented.in === "path" && documented.name === param[1] && documented.required !== false),
          `${row.key} path parameter ${param[1]}`
        ).toBe(true);
      }
    }

    for (const key of listOperations) {
      const documented = operation(spec, key).parameters?.some((parameter) => parameter.in === "query" && parameter.name === "page");
      expect(documented, `${key} pagination query`).toBe(true);
    }
  });

  it("omits removed reviewer/director expense surfaces from OpenAPI", async () => {
    const spec = await openApiSpec(app);
    const serializedPaths = JSON.stringify(spec.paths ?? {});

    for (const removedPath of [
      "/api/v1/expenses/queue/reviewer",
      "/api/v1/expenses/queue/director",
      "/api/v1/expenses/{id}/review",
      "/api/v1/expenses/{id}/approve",
      "/api/v1/reports/expenses/director-dashboard"
    ]) {
      expect(serializedPaths).not.toContain(removedPath);
    }
  });

  it("documents finance bodies, grouping, and OCC 409 responses", async () => {
    const spec = await openApiSpec(app);

    for (const key of bodyRequiredOperations) {
      expect(hasJsonBody(operation(spec, key)), `${key} request body`).toBe(true);
    }

    for (const key of occOperations) {
      expect(operation(spec, key).responses?.["409"], `${key} OCC response`).toBeDefined();
    }

    const financeKeys = operations(spec)
      .filter(({ path }) =>
        path.includes("/queue/finance") ||
        path.includes("/finance-detail") ||
        path.includes("/finance/") ||
        (path.includes("/expenses/") && path.includes("/settlement")) ||
        path.includes("/finance-analytics") ||
        path.includes("/finance-dashboard") ||
        path.includes("/advance-aging") ||
        path.includes("/payments")
      )
      .map(({ key }) => key);
    expect(financeKeys.length).toBeGreaterThan(0);
    for (const key of financeKeys) {
      expect(operation(spec, key).tags).toContain("Finance Management");
    }
  });

  it("documents hierarchy subtree and expense timeline consumer shapes", async () => {
    const spec = await openApiSpec(app);
    const subtree = operation(spec, "GET /api/v1/core/users/{id}/subtree");
    const timeline = operation(spec, "GET /api/v1/expenses/{id}/timeline");
    const subtreeSerialized = JSON.stringify(subtree);
    const timelineSerialized = JSON.stringify(timeline);

    expect(subtree.summary).toBe("Hierarchy subordinate subtree");
    expect(subtreeSerialized).toContain("total_active_descendants");
    expect(subtreeSerialized).toContain("max_depth");
    expect(subtreeSerialized).toContain("depth");
    expect(subtreeSerialized).toContain("HR Manager");

    expect(timeline.summary).toBe("Expense workflow timeline");
    for (const field of ["event_type", "label", "stage", "actor_name", "status_from", "status_to"]) {
      expect(timelineSerialized).toContain(field);
    }
  });

  it("documents expanded auth/core session and employee detail contracts", async () => {
    const spec = await openApiSpec(app);
    const sessionSerialized = JSON.stringify(operation(spec, "GET /api/v1/auth/me"));
    const usersSerialized = JSON.stringify(operation(spec, "GET /api/v1/core/users"));
    const userDetailSerialized = JSON.stringify(operation(spec, "GET /api/v1/core/users/{id}"));

    for (const field of ["active_role", "available_roles", "permissions", "navigation", "company", "preferences", "session_metadata", "low_bandwidth_defaults"]) {
      expect(sessionSerialized).toContain(field);
    }
    for (const field of ["department_id", "designation_id", "manager_user_id", "login_state", "filters_applied", "total_visible"]) {
      expect(usersSerialized).toContain(field);
    }
    for (const field of ["reporting_line", "role_assignments", "documents_summary", "assets_summary", "attendance_summary", "leave_summary", "timesheet_summary", "expense_summary", "profile_tabs_available"]) {
      expect(userDetailSerialized).toContain(field);
    }
  });

  it("keeps OpenAPI examples secret-free and standalone backend-free of frontend imports", async () => {
    const spec = await openApiSpec(app);
    const serialized = JSON.stringify(spec);

    expect(serialized).not.toMatch(/JWT_(ACCESS|REFRESH)_SECRET/iu);
    expect(serialized).not.toMatch(/CLOUDINARY_API_SECRET|VALKEY_PASSWORD/iu);
    expect(serialized).not.toMatch(/postgres:\/\/postgres:postgres/iu);

    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    expect(packageJson).not.toMatch(/"(?:next|react|react-dom)"\s*:/u);

    for (const file of walkTsFiles(join(process.cwd(), "src"))) {
      if (file.includes("/__tests__/") || /\.(test|unit|integration|contract|e2e)\.ts$/u.test(file)) {
        continue;
      }
      const content = readFileSync(file, "utf8");
      expect(content, file).not.toMatch(/\bfrom\s+["'](?:next|react|react-dom)(?:\/[^"']*)?["']/u);
      expect(content, file).not.toMatch(/apps\/(?:web|finance-web|documents-web|assets-web)|NEXT_PUBLIC_/u);
    }
  });
});

async function openApiSpec(app: FastifyInstance): Promise<OpenApiDocument> {
  const response = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
  expect(response.statusCode).toBe(200);
  return response.json() as OpenApiDocument;
}

function cookieHeader(header: string | string[] | undefined): string {
  return Array.isArray(header) ? header.join("; ") : header ?? "";
}

function operations(spec: OpenApiDocument): Array<{ key: string; method: string; path: string; operation: Operation }> {
  const rows: Array<{ key: string; method: string; path: string; operation: Operation }> = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const endpoint = pathItem[method];
      if (endpoint) {
        const upperMethod = method.toUpperCase();
        rows.push({ key: `${upperMethod} ${path}`, method: upperMethod, path, operation: endpoint });
      }
    }
  }
  return rows;
}

function operation(spec: OpenApiDocument, key: string): Operation {
  const found = operations(spec).find((row) => row.key === key)?.operation;
  expect(found, key).toBeDefined();
  return found as Operation;
}

function hasJsonBody(operation: Operation): boolean {
  return Boolean(operation.requestBody?.content?.["application/json"]?.schema);
}

function walkTsFiles(dir: string): string[] {
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "dist"].includes(entry)) {
      continue;
    }
    const child = join(dir, entry);
    const childStat = statSync(child);
    if (childStat.isDirectory()) {
      files.push(...walkTsFiles(child));
    } else if (/\.(ts|tsx)$/u.test(child)) {
      files.push(child);
    }
  }
  return files;
}
