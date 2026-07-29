import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore } from "../../../platform/data-store.js";

describe("admin shift scheduling", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const store = createMemoryDataStore();
    const createdAt = new Date().toISOString();
    store.companyProfiles.push({
      id: "10000000-0000-4000-8000-000000000001",
      company_name: "Hawkaii HRMS",
      company_slug: "hawkaii-hrms",
      website: null,
      industry: null,
      address: null,
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      currency: "INR",
      fiscal_year_start_month: 4,
      working_week: "Mon-Fri",
      work_hours_per_day: 8,
      logo_label: null,
      logo_document_id: null,
      logo_url: null,
      logo_file_name: null,
      logo_mime_type: null,
      logo_size_bytes: null,
      status: "active",
      bootstrap_completed_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
      version: 1,
    });
    app = await buildApp({
      dataStore: store,
      rateLimit: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("protects shift administration and enforces immutable non-overlapping versions", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/shifts/templates",
      headers: authHeader(employee.token),
    });
    expect(forbidden.statusCode).toBe(403);

    const inconsistentSchedule = await app.inject({
      method: "POST",
      url: "/api/v1/admin/shifts/templates",
      headers: authHeader(admin.token),
      payload: {
        code: "INVALID_NIGHT",
        name: "Invalid night shift",
        is_company_default: false,
        version: schedule({
          local_start_time: "08:00",
          local_end_time: "17:00",
          crosses_midnight: true,
        }),
      },
    });
    expect(inconsistentSchedule.statusCode).toBe(400);

    const created = await createTemplate(app, admin.token);
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json().template).toMatchObject({
      code: "NIGHT_01",
      name: "Night operations",
      is_company_default: true,
      version: 1,
      latest_version: {
        version_number: 1,
        crosses_midnight: true,
      },
    });

    const templateId = created.json().template.id as string;
    const overlapping = await app.inject({
      method: "POST",
      url: `/api/v1/admin/shifts/templates/${templateId}/versions`,
      headers: authHeader(admin.token),
      payload: schedule({
        effective_from: "2026-08-01",
        effective_until: "2026-12-31",
      }),
    });
    expect(overlapping.statusCode).toBe(409);

    const nextVersion = await app.inject({
      method: "POST",
      url: `/api/v1/admin/shifts/templates/${templateId}/versions`,
      headers: authHeader(admin.token),
      payload: schedule({
        effective_from: "2027-01-01",
        effective_until: null,
        local_start_time: "21:00",
        local_end_time: "06:00",
      }),
    });
    expect(nextVersion.statusCode).toBe(200);
    expect(nextVersion.json().version).toMatchObject({
      version_number: 2,
      effective_from: "2027-01-01",
      crosses_midnight: true,
    });

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/shifts/templates/${templateId}`,
      headers: authHeader(admin.token),
      payload: {
        name: "Night operations revised",
        expected_version: 1,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().template).toMatchObject({
      name: "Night operations revised",
      version: 2,
    });

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/shifts/templates/${templateId}`,
      headers: authHeader(admin.token),
      payload: {
        name: "Stale update",
        expected_version: 1,
      },
    });
    expect(stale.statusCode).toBe(409);
  });

  it("expands a department assignment to active employees and rejects overlaps atomically", async () => {
    const admin = await loginAs(app, "ADM");
    const created = await createTemplate(app, admin.token);
    expect(created.statusCode, created.body).toBe(200);
    const templateId = created.json().template.id as string;

    const references = await app.inject({
      method: "GET",
      url: "/api/v1/admin/shifts/references",
      headers: authHeader(admin.token),
    });
    expect(references.statusCode).toBe(200);
    const department = (
      references.json().departments as Array<{
        id: string;
        employee_count: number;
      }>
    ).find((candidate) => candidate.employee_count > 0);
    expect(department).toBeDefined();

    const assignment = await app.inject({
      method: "POST",
      url: "/api/v1/admin/shifts/assignments",
      headers: authHeader(admin.token),
      payload: {
        target_type: "department",
        target_id: department!.id,
        template_id: templateId,
        effective_from: "2026-07-01",
        effective_until: "2026-12-31",
      },
    });
    expect(assignment.statusCode).toBe(200);
    expect(assignment.json().created_count).toBe(department!.employee_count);
    expect(assignment.json().items).toHaveLength(department!.employee_count);

    const overlap = await app.inject({
      method: "POST",
      url: "/api/v1/admin/shifts/assignments",
      headers: authHeader(admin.token),
      payload: {
        target_type: "department",
        target_id: department!.id,
        template_id: templateId,
        effective_from: "2026-08-01",
        effective_until: "2026-09-30",
      },
    });
    expect(overlap.statusCode).toBe(409);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/shifts/assignments",
      headers: authHeader(admin.token),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(department!.employee_count);
    expect(
      app.store.outbox.some(
        (event) => event.event_type === "admin.shift_assignment.created",
      ),
    ).toBe(true);
  });
});

function createTemplate(app: FastifyInstance, token: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/admin/shifts/templates",
    headers: authHeader(token),
    payload: {
      code: "night_01",
      name: "Night operations",
      description: "Cross-midnight support shift",
      is_company_default: true,
      version: schedule(),
    },
  });
}

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    effective_from: "2026-01-01",
    effective_until: "2026-12-31",
    local_start_time: "22:00",
    local_end_time: "07:00",
    crosses_midnight: true,
    timezone_strategy: "company",
    fixed_timezone: null,
    eligibility_open_before_start_minutes: 120,
    eligibility_close_after_end_minutes: 240,
    ...overrides,
  };
}
