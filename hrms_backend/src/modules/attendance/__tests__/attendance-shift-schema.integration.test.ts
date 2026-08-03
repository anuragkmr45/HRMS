import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { PostgresAttendanceShiftRepository } from "../shift-repository.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

function employeeCompanyId(app: TestApp, employeeUserId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employeeUserId,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return companyId;
}

async function createTemplate(
  app: TestApp,
  input: {
    companyId: string;
    code: string;
    isDefault?: boolean;
    start?: string;
    end?: string;
    effectiveFrom?: string;
    effectiveUntil?: string | null;
  },
): Promise<{ templateId: string; versionId: string }> {
  const pool = app.store.pgPool!;
  const template = await pool.query<{ id: string }>(
    `INSERT INTO attendance.shift_templates (
      company_id, code, name, description, status, is_company_default,
      created_at, updated_at, deleted_at, version
    ) VALUES ($1, $2, $2, NULL, 'active', $3, now(), now(), NULL, 1)
    RETURNING id`,
    [input.companyId, input.code, input.isDefault ?? false],
  );
  const templateId = template.rows[0]?.id;
  if (!templateId) throw new Error("Shift template fixture was not created.");

  const version = await pool.query<{ id: string }>(
    `INSERT INTO attendance.shift_template_versions (
      company_id, template_id, version_number, effective_from,
      effective_until, local_start_time, local_end_time, end_day_offset,
      timezone_strategy, fixed_timezone,
      eligibility_open_before_start_minutes,
      eligibility_close_after_end_minutes,
      created_by_user_id,
      created_at
    ) VALUES ($1, $2, 1, $3::date, $4::date, $5::time, $6::time, 0,
      'company', NULL, 60, 30, NULL, now())
    RETURNING id`,
    [
      input.companyId,
      templateId,
      input.effectiveFrom ?? "2026-01-01",
      input.effectiveUntil ?? null,
      input.start ?? "10:00",
      input.end ?? "18:00",
    ],
  );
  const versionId = version.rows[0]?.id;
  if (!versionId) throw new Error("Shift version fixture was not created.");
  return { templateId, versionId };
}

describe("PostgreSQL attendance shift schema and generation", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("enforces company-scoped template code uniqueness and one active default", async () => {
    const employee = app.store.users.find((user) => user.employee_code === "E1");
    if (!employee) throw new Error("Employee fixture is unavailable.");
    const companyId = employeeCompanyId(app, employee.id);
    await createTemplate(app, {
      companyId,
      code: "GENERAL",
      isDefault: true,
    });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.shift_templates (
          company_id, code, name, status, is_company_default,
          created_at, updated_at, deleted_at, version
        ) VALUES ($1, 'GENERAL', 'Duplicate', 'active', false, now(), now(), NULL, 1)`,
        [companyId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "attendance_shift_templates_company_code_uq",
    });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.shift_templates (
          company_id, code, name, status, is_company_default,
          created_at, updated_at, deleted_at, version
        ) VALUES ($1, 'SECOND', 'Second', 'active', true, now(), now(), NULL, 1)`,
        [companyId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "attendance_shift_templates_one_default_idx",
    });
  });

  it("rejects overlapping effective versions and active assignments", async () => {
    const employee = app.store.users.find((user) => user.employee_code === "E1");
    if (!employee) throw new Error("Employee fixture is unavailable.");
    const companyId = employeeCompanyId(app, employee.id);
    const { templateId } = await createTemplate(app, {
      companyId,
      code: "NIGHT",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2026-07-31",
    });

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.shift_template_versions (
          company_id, template_id, version_number, effective_from,
          local_start_time, local_end_time, end_day_offset, timezone_strategy,
          eligibility_open_before_start_minutes,
          eligibility_close_after_end_minutes,
          created_at
        ) VALUES ($1, $2, 2, '2026-07-01', '11:00', '19:00', 0, 'company', 60, 30, now())`,
        [companyId, templateId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "attendance_shift_versions_no_overlap",
    });

    await app.store.pgPool!.query(
      `INSERT INTO attendance.shift_assignments (
        company_id, employee_user_id, template_id, effective_from,
        effective_until, status, created_at, updated_at, deleted_at, version
      ) VALUES ($1, $2, $3, '2026-01-01', '2026-07-31', 'active', now(), now(), NULL, 1)`,
      [companyId, employee.id, templateId],
    );

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.shift_assignments (
          company_id, employee_user_id, template_id, effective_from,
          status, created_at, updated_at, deleted_at, version
        ) VALUES ($1, $2, $3, '2026-07-01', 'active', now(), now(), NULL, 1)`,
        [companyId, employee.id, templateId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "attendance_shift_assignments_no_active_overlap",
    });
  });

  it("generates one stable shift instance per employee work date", async () => {
    const employee = app.store.users.find((user) => user.employee_code === "E1");
    if (!employee) throw new Error("Employee fixture is unavailable.");
    const companyId = employeeCompanyId(app, employee.id);
    const { templateId, versionId } = await createTemplate(app, {
      companyId,
      code: "GENERAL",
      isDefault: true,
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2026-07-08",
    });
    const repository = new PostgresAttendanceShiftRepository(app.store.pgPool!);

    const first = await repository.generateEmployeeShiftInstance({
      companyId,
      employeeUserId: employee.id,
      workDate: "2026-07-08",
    });
    const replay = await repository.generateEmployeeShiftInstance({
      companyId,
      employeeUserId: employee.id,
      workDate: "2026-07-08",
    });

    expect(replay.id).toBe(first.id);
    expect(first.template_id).toBe(templateId);
    expect(first.template_version_id).toBe(versionId);

    const laterVersion = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO attendance.shift_template_versions (
        company_id, template_id, version_number, effective_from,
        local_start_time, local_end_time, end_day_offset, timezone_strategy,
        eligibility_open_before_start_minutes,
        eligibility_close_after_end_minutes,
        created_at
      ) VALUES ($1, $2, 2, '2026-07-09', '11:00', '19:00', 0, 'company', 60, 30, now())
      RETURNING id`,
      [companyId, templateId],
    );
    const afterChange = await repository.generateEmployeeShiftInstance({
      companyId,
      employeeUserId: employee.id,
      workDate: "2026-07-08",
    });
    const nextDay = await repository.generateEmployeeShiftInstance({
      companyId,
      employeeUserId: employee.id,
      workDate: "2026-07-09",
    });
    const counts = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) FROM attendance.shift_instances
       WHERE company_id = $1 AND employee_user_id = $2 AND work_date = '2026-07-08'`,
      [companyId, employee.id],
    );

    expect(afterChange.id).toBe(first.id);
    expect(afterChange.template_version_id).toBe(versionId);
    expect(nextDay.template_version_id).toBe(laterVersion.rows[0]?.id);
    expect(counts.rows[0]?.count).toBe("1");
  });

  it("materializes the built-in fallback only during explicit generation", async () => {
    const employee = app.store.users.find((user) => user.employee_code === "E1");
    if (!employee) throw new Error("Employee fixture is unavailable.");
    const companyId = employeeCompanyId(app, employee.id);
    const repository = new PostgresAttendanceShiftRepository(app.store.pgPool!);

    const resolved = await repository.resolveEmployeeShift({
      companyId,
      employeeUserId: employee.id,
      workDate: "2026-07-08",
    });
    const before = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*) FROM attendance.shift_templates WHERE company_id = $1`,
      [companyId],
    );
    const generated = await repository.generateEmployeeShiftInstance({
      companyId,
      employeeUserId: employee.id,
      workDate: "2026-07-08",
    });
    const after = await app.store.pgPool!.query<{
      templates: string;
      versions: string;
      source: string;
    }>(
      `SELECT
        (SELECT count(*) FROM attendance.shift_templates WHERE company_id = $1) AS templates,
        (SELECT count(*) FROM attendance.shift_template_versions WHERE company_id = $1) AS versions,
        (SELECT generation_source FROM attendance.shift_instances WHERE id = $2) AS source`,
      [companyId, generated.id],
    );

    expect(resolved.source).toBe("built_in_default");
    expect(before.rows[0]?.count).toBe("0");
    expect(after.rows[0]).toEqual({
      templates: "1",
      versions: "1",
      source: "built_in_default",
    });
  });
});
