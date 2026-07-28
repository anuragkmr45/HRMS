import { z } from "zod";

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date must use YYYY-MM-DD.")
  .refine(
    (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
    "Date is invalid.",
  );

const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "Time must use HH:mm.");

const nullableText = z.string().trim().max(1000).nullable().optional();

export const shiftVersionInputSchema = z
  .object({
    effective_from: localDateSchema,
    effective_until: localDateSchema.nullable().optional(),
    local_start_time: localTimeSchema,
    local_end_time: localTimeSchema,
    crosses_midnight: z.boolean().default(false),
    timezone_strategy: z
      .enum(["company", "employee_with_company_fallback", "fixed"])
      .default("company"),
    fixed_timezone: z.string().trim().min(1).max(80).nullable().optional(),
    eligibility_open_before_start_minutes: z
      .number()
      .int()
      .min(0)
      .max(1440)
      .default(120),
    eligibility_close_after_end_minutes: z
      .number()
      .int()
      .min(0)
      .max(1440)
      .default(240),
  })
  .superRefine((value, context) => {
    if (value.effective_until && value.effective_until < value.effective_from) {
      context.addIssue({
        code: "custom",
        path: ["effective_until"],
        message: "Effective-until date cannot be before effective-from date.",
      });
    }
    if (value.timezone_strategy === "fixed" && !value.fixed_timezone) {
      context.addIssue({
        code: "custom",
        path: ["fixed_timezone"],
        message:
          "A fixed timezone is required for the fixed timezone strategy.",
      });
    }
    if (value.timezone_strategy !== "fixed" && value.fixed_timezone) {
      context.addIssue({
        code: "custom",
        path: ["fixed_timezone"],
        message:
          "Fixed timezone is only valid for the fixed timezone strategy.",
      });
    }
  });

export const shiftTemplateCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      /^[A-Za-z0-9_-]+$/u,
      "Code may contain letters, numbers, underscores, and hyphens.",
    ),
  name: z.string().trim().min(2).max(160),
  description: nullableText,
  is_company_default: z.boolean().default(false),
  version: shiftVersionInputSchema,
});

export const shiftTemplateUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: nullableText,
  status: z.enum(["active", "inactive"]).optional(),
  is_company_default: z.boolean().optional(),
  expected_version: z.number().int().min(1),
});

export const shiftAssignmentCreateSchema = z
  .object({
    target_type: z.enum(["employee", "department"]),
    target_id: z.uuid(),
    template_id: z.uuid(),
    effective_from: localDateSchema,
    effective_until: localDateSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      !value.effective_until || value.effective_until >= value.effective_from,
    {
      path: ["effective_until"],
      message: "Effective-until date cannot be before effective-from date.",
    },
  );

export const shiftAssignmentUpdateSchema = z
  .object({
    template_id: z.uuid().optional(),
    effective_from: localDateSchema.optional(),
    effective_until: localDateSchema.nullable().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    expected_version: z.number().int().min(1),
  })
  .refine(
    (value) =>
      !value.effective_from ||
      !value.effective_until ||
      value.effective_until >= value.effective_from,
    {
      path: ["effective_until"],
      message: "Effective-until date cannot be before effective-from date.",
    },
  );

export const shiftTemplateQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().max(160).optional(),
});

export const shiftAssignmentQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  template_id: z.uuid().optional(),
  department_id: z.uuid().optional(),
  search: z.string().trim().max(160).optional(),
});

export type ShiftVersionInput = z.infer<typeof shiftVersionInputSchema>;
export type ShiftTemplateCreateInput = z.infer<
  typeof shiftTemplateCreateSchema
>;
export type ShiftTemplateUpdateInput = z.infer<
  typeof shiftTemplateUpdateSchema
>;
export type ShiftAssignmentCreateInput = z.infer<
  typeof shiftAssignmentCreateSchema
>;
export type ShiftAssignmentUpdateInput = z.infer<
  typeof shiftAssignmentUpdateSchema
>;
export type ShiftTemplateQuery = z.infer<typeof shiftTemplateQuerySchema>;
export type ShiftAssignmentQuery = z.infer<typeof shiftAssignmentQuerySchema>;
