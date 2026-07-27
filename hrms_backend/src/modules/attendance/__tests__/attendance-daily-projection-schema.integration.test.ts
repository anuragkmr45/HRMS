import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

describe("PostgreSQL attendance daily projection schema", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("exposes every canonical dimension and second duration as non-null", async () => {
    const columns = await app.store.pgPool!.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'attendance' AND table_name = 'daily_records'`,
    );
    const byName = new Map(columns.rows.map((row) => [row.column_name, row]));
    for (const name of [
      "day_classification", "presence_state", "punctuality_state",
      "evidence_state", "approval_kind", "approval_state", "payroll_state",
      "work_seconds", "break_seconds", "scheduled_seconds", "late_seconds",
      "early_departure_seconds",
    ]) {
      expect(byName.get(name), name).toMatchObject({ is_nullable: "NO" });
    }
  });

  it("rejects negative canonical durations and preserves company/date uniqueness", async () => {
    const companyId = randomUUID();
    const employeeUserId = randomUUID();
    const insert = (workSeconds: number) => app.store.pgPool!.query(
      `INSERT INTO attendance.daily_records (
         company_id, employee_user_id, work_date, status, work_seconds
       ) VALUES ($1, $2, '2026-07-20', 'present', $3)`,
      [companyId, employeeUserId, workSeconds],
    );
    await expect(insert(-1)).rejects.toMatchObject({
      constraint: "attendance_daily_seconds_nonnegative_check",
    });
    await insert(60);
    await expect(insert(60)).rejects.toMatchObject({
      constraint: "attendance_daily_company_employee_date_uq",
    });
    await app.store.pgPool!.query(
      `DELETE FROM attendance.daily_records
       WHERE company_id = $1 AND employee_user_id = $2`,
      [companyId, employeeUserId],
    );
  });
});
