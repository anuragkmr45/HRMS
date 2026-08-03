import type { UUID } from "#shared";

export type ShiftTimezoneStrategy =
  | "company"
  | "employee_with_company_fallback"
  | "fixed";

export type ShiftResolutionSource =
  | "assignment"
  | "company_default"
  | "built_in_default";

export interface ShiftCompanyInput {
  id: UUID;
  timezone: string;
  work_hours_per_day?: number | null;
}

export interface ShiftEmployeeInput {
  id: UUID;
  timezone?: string | null;
}

export interface ShiftTemplateInput {
  id: UUID;
  company_id: UUID;
  code: string;
  name: string;
  description?: string | null;
  status: "active" | "inactive";
  is_company_default: boolean;
  deleted_at?: string | null;
}

export interface ShiftTemplateVersionInput {
  id: UUID;
  company_id: UUID;
  template_id: UUID;
  version_number: number;
  effective_from: string;
  effective_until?: string | null;
  local_start_time: string;
  local_end_time: string;
  end_day_offset: number;
  timezone_strategy: ShiftTimezoneStrategy;
  fixed_timezone?: string | null;
  eligibility_open_before_start_minutes: number;
  eligibility_close_after_end_minutes: number;
}

export interface ShiftAssignmentInput {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID;
  template_id: UUID;
  effective_from: string;
  effective_until?: string | null;
  status: "active" | "inactive";
  deleted_at?: string | null;
}

export interface ResolvedEmployeeShift {
  company_id: UUID;
  employee_user_id: UUID;
  work_date: string;
  source: ShiftResolutionSource;
  assignment: ShiftAssignmentInput | null;
  template: ShiftTemplateInput;
  version: ShiftTemplateVersionInput;
  resolved_timezone: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  eligibility_start_at: string;
  eligibility_end_at: string;
}

export const BUILT_IN_STANDARD_SHIFT_TEMPLATE: ShiftTemplateInput = {
  id: "00000000-0000-0000-0000-000000090030",
  company_id: "00000000-0000-0000-0000-000000000000",
  code: "BUILT_IN_STANDARD_0930",
  name: "Built-in Standard Shift",
  description:
    "Compatibility fallback used only when no persisted shift configuration exists.",
  status: "active",
  is_company_default: false,
  deleted_at: null,
};

export const BUILT_IN_STANDARD_SHIFT_VERSION: ShiftTemplateVersionInput = {
  id: "00000000-0000-0000-0000-000000090031",
  company_id: "00000000-0000-0000-0000-000000000000",
  template_id: BUILT_IN_STANDARD_SHIFT_TEMPLATE.id,
  version_number: 1,
  effective_from: "0001-01-01",
  effective_until: null,
  local_start_time: "09:30",
  local_end_time: "17:30",
  end_day_offset: 0,
  timezone_strategy: "company",
  fixed_timezone: null,
  eligibility_open_before_start_minutes: 120,
  eligibility_close_after_end_minutes: 240,
};

export class ShiftResolutionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function resolveEmployeeShift(input: {
  company: ShiftCompanyInput;
  employee: ShiftEmployeeInput;
  workDate: string;
  templates: ShiftTemplateInput[];
  versions: ShiftTemplateVersionInput[];
  assignments: ShiftAssignmentInput[];
}): ResolvedEmployeeShift {
  assertLocalDate(input.workDate);

  const activeAssignments = input.assignments.filter(
    (assignment) =>
      assignment.company_id === input.company.id &&
      assignment.employee_user_id === input.employee.id &&
      assignment.status === "active" &&
      !assignment.deleted_at &&
      isEffectiveOn(assignment, input.workDate),
  );
  if (activeAssignments.length > 1) {
    throw new ShiftResolutionError(
      "Multiple active shift assignments apply to the employee work date.",
      "overlapping_active_shift_assignments",
      { employee_user_id: input.employee.id, work_date: input.workDate },
    );
  }

  const assignment = activeAssignments[0] ?? null;
  const activeTemplates = input.templates.filter(
    (template) =>
      template.company_id === input.company.id &&
      template.status === "active" &&
      !template.deleted_at,
  );

  if (assignment) {
    const template = activeTemplates.find(
      (candidate) => candidate.id === assignment.template_id,
    );
    if (!template) {
      throw new ShiftResolutionError(
        "The active shift assignment points to an inactive or missing template.",
        "assigned_shift_template_unavailable",
        { assignment_id: assignment.id, template_id: assignment.template_id },
      );
    }
    return resolveTemplateVersion({
      company: input.company,
      employee: input.employee,
      workDate: input.workDate,
      source: "assignment",
      assignment,
      template,
      versions: input.versions,
    });
  }

  const defaults = activeTemplates.filter(
    (template) => template.is_company_default,
  );
  if (defaults.length > 1) {
    throw new ShiftResolutionError(
      "Multiple active company-default shift templates apply.",
      "multiple_active_default_shift_templates",
      { company_id: input.company.id },
    );
  }

  const defaultTemplate = defaults[0] ?? null;
  if (defaultTemplate) {
    return resolveTemplateVersion({
      company: input.company,
      employee: input.employee,
      workDate: input.workDate,
      source: "company_default",
      assignment: null,
      template: defaultTemplate,
      versions: input.versions,
    });
  }

  const timezone = validatedTimeZone(input.company.timezone, {
    code: "invalid_company_timezone",
    field: "company.timezone",
  });
  const durationMinutes = Math.max(
    1,
    Math.round((input.company.work_hours_per_day ?? 8) * 60),
  );
  const endClock = addMinutesToClock(
    BUILT_IN_STANDARD_SHIFT_VERSION.local_start_time,
    durationMinutes,
  );
  return buildResolvedShift({
    companyId: input.company.id,
    employeeId: input.employee.id,
    workDate: input.workDate,
    source: "built_in_default",
    assignment: null,
    template: {
      ...BUILT_IN_STANDARD_SHIFT_TEMPLATE,
      company_id: input.company.id,
    },
    version: {
      ...BUILT_IN_STANDARD_SHIFT_VERSION,
      company_id: input.company.id,
      local_end_time: endClock.clock,
      end_day_offset: endClock.dayOffset,
    },
    timezone,
  });
}

function resolveTemplateVersion(input: {
  company: ShiftCompanyInput;
  employee: ShiftEmployeeInput;
  workDate: string;
  source: ShiftResolutionSource;
  assignment: ShiftAssignmentInput | null;
  template: ShiftTemplateInput;
  versions: ShiftTemplateVersionInput[];
}): ResolvedEmployeeShift {
  const effectiveVersions = input.versions.filter(
    (version) =>
      version.company_id === input.company.id &&
      version.template_id === input.template.id &&
      isEffectiveOn(version, input.workDate),
  );
  if (effectiveVersions.length > 1) {
    throw new ShiftResolutionError(
      "Multiple shift template versions apply to the work date.",
      "overlapping_shift_template_versions",
      { template_id: input.template.id, work_date: input.workDate },
    );
  }
  const version = effectiveVersions[0];
  if (!version) {
    throw new ShiftResolutionError(
      "No shift template version is effective for the work date.",
      "shift_template_version_unavailable",
      { template_id: input.template.id, work_date: input.workDate },
    );
  }
  return buildResolvedShift({
    companyId: input.company.id,
    employeeId: input.employee.id,
    workDate: input.workDate,
    source: input.source,
    assignment: input.assignment,
    template: input.template,
    version,
    timezone: resolveTimeZone(input.company, input.employee, version),
  });
}

function buildResolvedShift(input: {
  companyId: UUID;
  employeeId: UUID;
  workDate: string;
  source: ShiftResolutionSource;
  assignment: ShiftAssignmentInput | null;
  template: ShiftTemplateInput;
  version: ShiftTemplateVersionInput;
  timezone: string;
}): ResolvedEmployeeShift {
  const start = localDateTimeToUtcIso(
    input.workDate,
    input.version.local_start_time,
    input.timezone,
  );
  const end = localDateTimeToUtcIso(
    addDays(input.workDate, input.version.end_day_offset),
    input.version.local_end_time,
    input.timezone,
  );
  if (Date.parse(end) <= Date.parse(start)) {
    throw new ShiftResolutionError(
      "Resolved shift end must be after the shift start.",
      "invalid_shift_schedule",
      { version_id: input.version.id },
    );
  }
  return {
    company_id: input.companyId,
    employee_user_id: input.employeeId,
    work_date: input.workDate,
    source: input.source,
    assignment: input.assignment,
    template: input.template,
    version: input.version,
    resolved_timezone: input.timezone,
    scheduled_start_at: start,
    scheduled_end_at: end,
    eligibility_start_at: addMinutes(
      start,
      -input.version.eligibility_open_before_start_minutes,
    ),
    eligibility_end_at: addMinutes(
      end,
      input.version.eligibility_close_after_end_minutes,
    ),
  };
}

function resolveTimeZone(
  company: ShiftCompanyInput,
  employee: ShiftEmployeeInput,
  version: ShiftTemplateVersionInput,
): string {
  if (version.timezone_strategy === "fixed") {
    return validatedTimeZone(version.fixed_timezone, {
      code: "invalid_fixed_shift_timezone",
      field: "fixed_timezone",
    });
  }
  const companyZone = validatedTimeZone(company.timezone, {
    code: "invalid_company_timezone",
    field: "company.timezone",
  });
  if (version.timezone_strategy === "employee_with_company_fallback") {
    return isValidTimeZone(employee.timezone) ? employee.timezone : companyZone;
  }
  return companyZone;
}

function isEffectiveOn(
  value: { effective_from: string; effective_until?: string | null },
  workDate: string,
): boolean {
  return (
    value.effective_from <= workDate &&
    (!value.effective_until || value.effective_until >= workDate)
  );
}

function assertLocalDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new ShiftResolutionError(
      "Shift work date must be a local ISO date.",
      "invalid_shift_work_date",
      { work_date: value },
    );
  }
}

function validatedTimeZone(
  value: string | null | undefined,
  error: { code: string; field: string },
): string {
  if (isValidTimeZone(value)) return value;
  throw new ShiftResolutionError(
    "Shift timezone configuration is invalid.",
    error.code,
    { field: error.field, timezone: value ?? null },
  );
}

function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function localDateTimeToUtcIso(
  localDate: string,
  localTime: string,
  timeZone: string,
): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = localTime.split(":").map(Number);
  let guess = Date.UTC(year!, month! - 1, day!, hour, minute, second);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedParts(new Date(guess), timeZone);
    const renderedUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    const desiredUtc = Date.UTC(year!, month! - 1, day!, hour, minute, second);
    const next = guess - (renderedUtc - desiredUtc);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}

function zonedParts(value: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: Number(map.get("hour")),
    minute: Number(map.get("minute")),
    second: Number(map.get("second")),
  };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addMinutesToClock(clock: string, minutes: number): {
  clock: string;
  dayOffset: number;
} {
  const [hourText = "0", minuteText = "0"] = clock.split(":");
  const total = Number(hourText) * 60 + Number(minuteText) + minutes;
  const dayOffset = Math.floor(total / 1440);
  const normalized = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return {
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    dayOffset,
  };
}
