import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ShiftResolutionError,
  resolveEmployeeShift,
  type ShiftAssignmentInput,
  type ShiftCompanyInput,
  type ShiftEmployeeInput,
  type ShiftTemplateInput,
  type ShiftTemplateVersionInput,
} from "../shift-resolver.js";

const companyId = randomUUID();
const otherCompanyId = randomUUID();
const employeeId = randomUUID();
const templateId = randomUUID();
const defaultTemplateId = randomUUID();

const company: ShiftCompanyInput = {
  id: companyId,
  timezone: "Asia/Kolkata",
  work_hours_per_day: 8,
};

const employee: ShiftEmployeeInput = {
  id: employeeId,
  timezone: "America/New_York",
};

function template(
  overrides: Partial<ShiftTemplateInput> = {},
): ShiftTemplateInput {
  return {
    id: templateId,
    company_id: companyId,
    code: "GENERAL",
    name: "General",
    status: "active",
    is_company_default: false,
    deleted_at: null,
    ...overrides,
  };
}

function version(
  overrides: Partial<ShiftTemplateVersionInput> = {},
): ShiftTemplateVersionInput {
  return {
    id: randomUUID(),
    company_id: companyId,
    template_id: templateId,
    version_number: 1,
    effective_from: "2026-01-01",
    effective_until: null,
    local_start_time: "10:00",
    local_end_time: "18:00",
    end_day_offset: 0,
    timezone_strategy: "company",
    fixed_timezone: null,
    eligibility_open_before_start_minutes: 60,
    eligibility_close_after_end_minutes: 30,
    ...overrides,
  };
}

function assignment(
  overrides: Partial<ShiftAssignmentInput> = {},
): ShiftAssignmentInput {
  return {
    id: randomUUID(),
    company_id: companyId,
    employee_user_id: employeeId,
    template_id: templateId,
    effective_from: "2026-01-01",
    effective_until: null,
    status: "active",
    deleted_at: null,
    ...overrides,
  };
}

function expectShiftError(code: string, action: () => unknown): void {
  try {
    action();
    throw new Error("Expected shift resolution to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ShiftResolutionError);
    expect((error as ShiftResolutionError).code).toBe(code);
  }
}

describe("attendance shift resolver", () => {
  it("isolates company shift configuration", () => {
    const result = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [
        template({
          company_id: otherCompanyId,
          is_company_default: true,
        }),
      ],
      versions: [
        version({
          company_id: otherCompanyId,
        }),
      ],
      assignments: [],
    });

    expect(result.source).toBe("built_in_default");
    expect(result.template.company_id).toBe(companyId);
  });

  it("selects the employee assignment before the company default", () => {
    const result = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [
        template(),
        template({
          id: defaultTemplateId,
          code: "DEFAULT",
          is_company_default: true,
        }),
      ],
      versions: [
        version(),
        version({
          template_id: defaultTemplateId,
          local_start_time: "09:00",
          local_end_time: "17:00",
        }),
      ],
      assignments: [assignment()],
    });

    expect(result.source).toBe("assignment");
    expect(result.template.id).toBe(templateId);
    expect(result.assignment?.template_id).toBe(templateId);
  });

  it("uses the company default when no assignment applies", () => {
    const result = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [
        template({
          id: defaultTemplateId,
          code: "DEFAULT",
          is_company_default: true,
        }),
      ],
      versions: [
        version({
          template_id: defaultTemplateId,
          local_start_time: "09:00",
          local_end_time: "17:00",
        }),
      ],
      assignments: [],
    });

    expect(result.source).toBe("company_default");
    expect(result.scheduled_start_at).toBe("2026-07-08T03:30:00.000Z");
    expect(result.scheduled_end_at).toBe("2026-07-08T11:30:00.000Z");
  });

  it("uses the centralized built-in fallback when no configuration exists", () => {
    const result = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [],
      versions: [],
      assignments: [],
    });

    expect(result.source).toBe("built_in_default");
    expect(result.template.code).toBe("BUILT_IN_STANDARD_0930");
    expect(result.scheduled_start_at).toBe("2026-07-08T04:00:00.000Z");
    expect(result.scheduled_end_at).toBe("2026-07-08T12:00:00.000Z");
  });

  it("selects versions on inclusive boundary dates", () => {
    const oldVersion = version({
      version_number: 1,
      effective_from: "2026-01-01",
      effective_until: "2026-07-08",
      local_start_time: "08:00",
      local_end_time: "16:00",
    });
    const newVersion = version({
      version_number: 2,
      effective_from: "2026-07-09",
      local_start_time: "11:00",
      local_end_time: "19:00",
    });
    const first = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [template()],
      versions: [oldVersion, newVersion],
      assignments: [assignment()],
    });
    const second = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-09",
      templates: [template()],
      versions: [oldVersion, newVersion],
      assignments: [assignment()],
    });

    expect(first.version.version_number).toBe(1);
    expect(second.version.version_number).toBe(2);
  });

  it("uses company timezone strategy", () => {
    const result = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [template()],
      versions: [version({ timezone_strategy: "company" })],
      assignments: [assignment()],
    });

    expect(result.resolved_timezone).toBe("Asia/Kolkata");
  });

  it("uses employee timezone strategy and falls back to company timezone", () => {
    const withEmployee = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [template()],
      versions: [version({ timezone_strategy: "employee_with_company_fallback" })],
      assignments: [assignment()],
    });
    const withFallback = resolveEmployeeShift({
      company,
      employee: { ...employee, timezone: null },
      workDate: "2026-07-08",
      templates: [template()],
      versions: [version({ timezone_strategy: "employee_with_company_fallback" })],
      assignments: [assignment()],
    });

    expect(withEmployee.resolved_timezone).toBe("America/New_York");
    expect(withFallback.resolved_timezone).toBe("Asia/Kolkata");
  });

  it("uses fixed timezone strategy and rejects invalid fixed timezone", () => {
    const fixed = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [template()],
      versions: [
        version({
          timezone_strategy: "fixed",
          fixed_timezone: "Europe/London",
        }),
      ],
      assignments: [assignment()],
    });

    expect(fixed.resolved_timezone).toBe("Europe/London");
    expectShiftError("invalid_fixed_shift_timezone", () =>
      resolveEmployeeShift({
        company,
        employee,
        workDate: "2026-07-08",
        templates: [template()],
        versions: [
          version({
            timezone_strategy: "fixed",
            fixed_timezone: "Not/AZone",
          }),
        ],
        assignments: [assignment()],
      }),
    );
  });

  it("resolves normal same-day shifts and eligibility windows", () => {
    const result = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [template()],
      versions: [version()],
      assignments: [assignment()],
    });

    expect(result.scheduled_start_at).toBe("2026-07-08T04:30:00.000Z");
    expect(result.scheduled_end_at).toBe("2026-07-08T12:30:00.000Z");
    expect(result.eligibility_start_at).toBe("2026-07-08T03:30:00.000Z");
    expect(result.eligibility_end_at).toBe("2026-07-08T13:00:00.000Z");
  });

  it("uses explicit end-day offset for cross-midnight shifts", () => {
    const result = resolveEmployeeShift({
      company,
      employee,
      workDate: "2026-07-08",
      templates: [template()],
      versions: [
        version({
          local_start_time: "22:00",
          local_end_time: "06:00",
          end_day_offset: 1,
        }),
      ],
      assignments: [assignment()],
    });

    expect(result.scheduled_start_at).toBe("2026-07-08T16:30:00.000Z");
    expect(result.scheduled_end_at).toBe("2026-07-09T00:30:00.000Z");
  });

  it("rejects overlapping effective versions and assignments deterministically", () => {
    expectShiftError("overlapping_shift_template_versions", () =>
      resolveEmployeeShift({
        company,
        employee,
        workDate: "2026-07-08",
        templates: [template()],
        versions: [
          version({ effective_from: "2026-01-01", effective_until: "2026-07-31" }),
          version({ effective_from: "2026-07-01", version_number: 2 }),
        ],
        assignments: [assignment()],
      }),
    );

    expectShiftError("overlapping_active_shift_assignments", () =>
      resolveEmployeeShift({
        company,
        employee,
        workDate: "2026-07-08",
        templates: [template()],
        versions: [version()],
        assignments: [
          assignment({ effective_from: "2026-01-01", effective_until: "2026-07-31" }),
          assignment({ effective_from: "2026-07-01" }),
        ],
      }),
    );
  });
});
