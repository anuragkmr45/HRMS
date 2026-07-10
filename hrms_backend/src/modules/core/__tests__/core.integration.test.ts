import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("core hierarchy API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns active subordinate subtree with summary/depth and hierarchy scoping", async () => {
    const reviewer = await loginAs(app, "D1");
    const employee = await loginAs(app, "E1");
    const auditor = await loginAs(app, "AUD");

    const reviewerSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(reviewer.token)
    });
    expect(reviewerSubtree.statusCode).toBe(200);
    expect(reviewerSubtree.json().total_active_descendants).toBe(3);
    expect(reviewerSubtree.json().max_depth).toBe(1);
    expect(reviewerSubtree.json().summary.root_employee_code).toBe("D1");
    expect(reviewerSubtree.json().items.map((user: { employee_code: string }) => user.employee_code).sort()).toEqual(["E1", "E2", "E3"]);
    expect(reviewerSubtree.json().items.every((user: { depth: number }) => user.depth === 1)).toBe(true);

    const ownSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${employee.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(ownSubtree.statusCode).toBe(200);
    expect(ownSubtree.json().total).toBe(0);

    const ancestorAttempt = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(ancestorAttempt.statusCode).toBe(403);

    const auditorSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(auditor.token)
    });
    expect(auditorSubtree.statusCode).toBe(200);
  });

  it("returns enriched session context and scoped employee directory/detail shapes", async () => {
    const manager = await loginAs(app, "D1");
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(manager.token)
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().active_role.key).toBe("Employee");
    expect(session.json().permissions).toContain("expense:create");
    expect(session.json().navigation.map((item: { key: string }) => item.key)).toContain("dashboard");
    expect(session.json().company.timezone).toBe("Asia/Kolkata");
    expect(session.json().session_metadata.low_bandwidth_defaults).toMatchObject({ page_size: 25, max_page_size: 100 });

    const managerDirectory = await app.inject({
      method: "GET",
      url: "/api/v1/core/users?page=1&page_size=10&role=Employee&sort=employee_code",
      headers: authHeader(manager.token)
    });
    expect(managerDirectory.statusCode).toBe(200);
    expect(managerDirectory.json().items.map((user: { employee_code: string }) => user.employee_code)).toEqual(["D1", "E1", "E2", "E3"]);
    expect(managerDirectory.json().items[0].department.department_code).toBe("SALES");
    expect(managerDirectory.json().items[0].login_state).toBe("enabled");

    const adminFiltered = await app.inject({
      method: "GET",
      url: `/api/v1/core/users?page=1&page_size=10&department_id=${manager.user.department_id}&manager_user_id=${manager.user.id}&login_state=enabled`,
      headers: authHeader(admin.token)
    });
    expect(adminFiltered.statusCode).toBe(200);
    expect(adminFiltered.json().total).toBe(3);
    expect(adminFiltered.json().summary.filters_applied.sort()).toEqual(["department_id", "login_state", "manager_user_id"]);

    const employeeDetail = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${employee.user.id}`,
      headers: authHeader(manager.token)
    });
    expect(employeeDetail.statusCode).toBe(200);
    expect(employeeDetail.json().manager.employee_code).toBe("D1");
    expect(employeeDetail.json().profile_tabs_available).toContain("timesheets");
    expect(employeeDetail.json().expense_summary.total_requests).toBe(0);

    const forbiddenDetail = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${manager.user.id}`,
      headers: authHeader(employee.token)
    });
    expect(forbiddenDetail.statusCode).toBe(403);
  });

  it("prevents people managers from deactivating or changing their own login access", async () => {
    const admin = await loginAs(app, "ADM");
    const expectedVersion = 1;

    const selfDeactivate = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${admin.user.id}/deactivate`,
      headers: authHeader(admin.token),
      payload: { expected_version: expectedVersion, status: "inactive" }
    });
    expect(selfDeactivate.statusCode).toBe(403);

    const selfDisableLogin = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${admin.user.id}/login/disable`,
      headers: authHeader(admin.token),
      payload: { expected_version: expectedVersion }
    });
    expect(selfDisableLogin.statusCode).toBe(403);

    const selfEnableLogin = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${admin.user.id}/login/enable`,
      headers: authHeader(admin.token),
      payload: { expected_version: expectedVersion, invite_email: true }
    });
    expect(selfEnableLogin.statusCode).toBe(403);

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(admin.token)
    });
    expect(session.statusCode).toBe(200);
  });

  it("supports admin employee CRUD, login setup, role replacement, and lifecycle actions", async () => {
    const admin = await loginAs(app, "ADM");
    const manager = await loginAs(app, "D1");

    const selectors = await app.inject({
      method: "GET",
      url: "/api/v1/core/master-data/org-selectors",
      headers: authHeader(admin.token)
    });
    expect(selectors.statusCode).toBe(200);
    expect(selectors.json().departments.length).toBeGreaterThan(0);
    expect(selectors.json().roles.map((role: { key: string }) => role.key)).toContain("HR Manager");

    const forbiddenCreate = await app.inject({
      method: "POST",
      url: "/api/v1/core/users",
      headers: authHeader(manager.token),
      payload: {
        employee_code: "QA1000",
        email: "qa1000@example.test",
        full_name: "Forbidden Create",
        department_id: manager.user.department_id,
        designation_id: manager.user.designation_id
      }
    });
    expect(forbiddenCreate.statusCode).toBe(403);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/core/users",
      headers: authHeader(admin.token),
      payload: {
        employee_code: "QA1001",
        email: "qa1001@example.test",
        full_name: "QA Employee",
        department_id: manager.user.department_id,
        designation_id: manager.user.designation_id,
        manager_user_id: manager.user.id,
        roles: ["Employee"],
        employment_status: "active",
        login_enabled: true,
        joined_on: "2026-05-22"
      }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      employee_code: "QA1001",
      login_state: "setup_pending",
      manager: { employee_code: "D1" },
      version: 1
    });
    expect(create.json().onboarding.dev_only.password_setup_token).toEqual(expect.any(String));

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/core/users/${create.json().id}`,
      headers: authHeader(admin.token),
      payload: {
        full_name: "QA Employee Updated",
        expected_version: 1
      }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ full_name: "QA Employee Updated", version: 2 });

    const disableLogin = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${create.json().id}/login/disable`,
      headers: authHeader(admin.token),
      payload: { expected_version: 2, reason: "setup cancelled" }
    });
    expect(disableLogin.statusCode).toBe(200);
    expect(disableLogin.json()).toMatchObject({ login_state: "disabled", sessions_revoked: 0, version: 3 });

    const enableLogin = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${create.json().id}/login/enable`,
      headers: authHeader(admin.token),
      payload: { expected_version: 3, invite_email: true }
    });
    expect(enableLogin.statusCode).toBe(200);
    expect(enableLogin.json()).toMatchObject({ login_state: "setup_pending", version: 4 });

    const setupToken = enableLogin.json().onboarding.dev_only.password_setup_token;
    const setPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/set-password",
      payload: { token: setupToken, password: "NewUserPass123", confirm_password: "NewUserPass123" }
    });
    expect(setPassword.statusCode).toBe(200);

    const afterPassword = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${create.json().id}`,
      headers: authHeader(admin.token)
    });
    expect(afterPassword.statusCode).toBe(200);
    expect(afterPassword.json()).toMatchObject({ login_state: "enabled", version: 5 });

    const roles = await app.inject({
      method: "PUT",
      url: `/api/v1/core/users/${create.json().id}/roles`,
      headers: authHeader(admin.token),
      payload: { roles: ["Employee", "HR Manager"], expected_version: 5, remarks: "Promoted to HR support" }
    });
    expect(roles.statusCode).toBe(200);
    expect(roles.json().role_labels).toEqual(["Employee", "HR Manager"]);
    expect(roles.json().version).toBe(6);

    const roleHistory = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${create.json().id}/roles/history?page=1&page_size=10`,
      headers: authHeader(admin.token)
    });
    expect(roleHistory.statusCode).toBe(200);
    expect(roleHistory.json().items[0]).toMatchObject({
      source_event_type: "core.user.roles_replaced",
      from_roles: ["Employee"],
      to_roles: ["Employee", "HR Manager"],
      remarks: "Promoted to HR support"
    });

    const audit = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${create.json().id}/audit?page=1&page_size=10&event_type=core.user.roles_replaced`,
      headers: authHeader(admin.token)
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().items).toHaveLength(1);
    expect(audit.json().items[0]).toMatchObject({ action: "Roles updated", event_type: "core.user.roles_replaced" });
    expect(JSON.stringify(audit.json().items[0].metadata)).not.toMatch(/token|password/iu);

    const managerHistory = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${create.json().id}/roles/history?page=1&page_size=10`,
      headers: authHeader(manager.token)
    });
    expect(managerHistory.statusCode).toBe(403);

    const importJob = await app.inject({
      method: "POST",
      url: "/api/v1/core/users/imports",
      headers: authHeader(admin.token),
      payload: {
        file_name: "employees.csv",
        dry_run: true,
        mapping: { employee_code: "Employee ID", email: "Email" }
      }
    });
    expect(importJob.statusCode).toBe(200);
    expect(importJob.json()).toMatchObject({
      status: "queued",
      dry_run: true,
      accepted_rows: 0,
      rejected_rows: 0,
      adapter: "outbox-queued-placeholder"
    });

    const importPoll = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/imports/${importJob.json().job_id}`,
      headers: authHeader(admin.token)
    });
    expect(importPoll.statusCode).toBe(200);
    expect(importPoll.json().job_id).toBe(importJob.json().job_id);

    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/core/users/exports",
      headers: authHeader(admin.token),
      payload: {
        format: "csv",
        filters: { department_id: manager.user.department_id },
        columns: ["employee_code", "full_name", "roles"]
      }
    });
    expect(exportJob.statusCode).toBe(200);
    expect(exportJob.json()).toMatchObject({
      status: "ready",
      format: "csv",
      adapter: `${app.store.objectStorage?.kind}-generated-csv`,
      download_document_id: expect.any(String)
    });
    await expect(app.store.objectStorage?.statObject(app.store.documents.find((document) => document.id === exportJob.json().download_document_id)?.storage_key ?? "")).resolves.toMatchObject({
      size: expect.any(Number)
    });

    const xlsxExport = await app.inject({
      method: "POST",
      url: "/api/v1/core/users/exports",
      headers: authHeader(admin.token),
      payload: {
        format: "xlsx",
        filters: { department_id: manager.user.department_id },
        columns: ["employee_code", "full_name", "roles"]
      }
    });
    expect(xlsxExport.statusCode).toBe(200);
    expect(xlsxExport.json()).toMatchObject({
      status: "ready",
      format: "xlsx",
      adapter: `${app.store.objectStorage?.kind}-generated-xlsx`,
      file_name: expect.stringMatching(/\.xlsx$/u),
      download_document_id: expect.any(String)
    });
    const xlsxDocument = app.store.documents.find((document) => document.id === xlsxExport.json().download_document_id);
    expect(xlsxDocument).toMatchObject({
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      document_type: "core_user_export_export"
    });
    await expect(app.store.objectStorage?.statObject(xlsxDocument?.storage_key ?? "")).resolves.toMatchObject({
      size: expect.any(Number)
    });

    const forbiddenExport = await app.inject({
      method: "POST",
      url: "/api/v1/core/users/exports",
      headers: authHeader(manager.token),
      payload: { format: "csv", filters: {} }
    });
    expect(forbiddenExport.statusCode).toBe(403);

    const stalePatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/core/users/${create.json().id}`,
      headers: authHeader(admin.token),
      payload: {
        full_name: "Stale Update",
        expected_version: 5
      }
    });
    expect(stalePatch.statusCode).toBe(409);

    const deactivate = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${create.json().id}/deactivate`,
      headers: authHeader(admin.token),
      payload: { expected_version: 6, status: "inactive", reason: "Access ended" }
    });
    expect(deactivate.statusCode).toBe(200);
    expect(deactivate.json()).toMatchObject({ employment_status: "inactive", login_state: "disabled", version: 7 });
    expect(app.store.outbox.some((event) => event.event_type === "core.user.deactivated" && event.aggregate_id === create.json().id)).toBe(true);

    const inactiveLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "qa1001@example.test", password: "NewUserPass123" }
    });
    expect(inactiveLogin.statusCode).toBe(403);

    const activate = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${create.json().id}/activate`,
      headers: authHeader(admin.token),
      payload: { expected_version: 7, remarks: "Returned to service" }
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json()).toMatchObject({ employment_status: "active", version: 8 });
  });

  it("uploads employee profile photos through the document storage policy", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const policy = await app.inject({
      method: "GET",
      url: "/api/v1/core/users/profile-photo-policy",
      headers: authHeader(admin.token)
    });
    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      max_bytes: 2 * 1024 * 1024,
      max_width: 512,
      max_height: 512,
      allowed_mime_types: expect.arrayContaining(["image/jpeg", "image/png", "image/webp"])
    });

    const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
    const upload = await multipartUpload(app, {
      url: `/api/v1/core/users/${employee.user.id}/profile-photo`,
      token: admin.token,
      file: {
        fieldName: "file",
        fileName: "employee-profile.jpg",
        mimeType: "image/jpeg",
        body
      }
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json()).toMatchObject({
      id: employee.user.id,
      profile_photo_document_id: expect.any(String),
      version: 2
    });
    const document = app.store.documents.find((candidate) => candidate.id === upload.json().profile_photo_document_id);
    expect(document).toMatchObject({
      business_object_type: "core_user",
      business_object_id: employee.user.id,
      owner_user_id: employee.user.id,
      document_type: "profile_photo",
      mime_type: "image/jpeg"
    });
    expect(document?.metadata).toMatchObject({
      cloudinary_upload_compressed: app.store.objectStorage?.kind === "cloudinary",
      stored_size_bytes: body.length
    });

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/v1/core/users/${employee.user.id}/profile-photo`,
      headers: authHeader(employee.token)
    });
    expect(remove.statusCode).toBe(200);
    expect(remove.json()).toMatchObject({
      id: employee.user.id,
      profile_photo_document_id: null,
      profile_photo_url: null,
      version: 3
    });
    expect(app.store.documents.find((candidate) => candidate.id === document?.id)).toBeUndefined();

    const oversized = await multipartUpload(app, {
      url: `/api/v1/core/users/${employee.user.id}/profile-photo`,
      token: admin.token,
      file: {
        fieldName: "file",
        fileName: "too-large.jpg",
        mimeType: "image/jpeg",
        body: Buffer.alloc(policy.json().max_bytes + 1, 1)
      }
    });
    expect(oversized.statusCode).toBe(400);
    expect(oversized.json().message).toContain("larger than the configured upload limit");
  });

});

interface MultipartUploadInput {
  url: string;
  token: string;
  file: {
    fieldName: string;
    fileName: string;
    mimeType: string;
    body: Buffer;
  };
}

function multipartUpload(app: FastifyInstance, input: MultipartUploadInput) {
  const boundary = `----hawkaii-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(
    Buffer.from(
      `Content-Disposition: form-data; name="${input.file.fieldName}"; filename="${input.file.fileName}"\r\n`
    )
  );
  chunks.push(Buffer.from(`Content-Type: ${input.file.mimeType}\r\n\r\n`));
  chunks.push(input.file.body);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return app.inject({
    method: "POST",
    url: input.url,
    headers: {
      ...authHeader(input.token),
      "content-type": `multipart/form-data; boundary=${boundary}`
    },
    payload: Buffer.concat(chunks)
  });
}
