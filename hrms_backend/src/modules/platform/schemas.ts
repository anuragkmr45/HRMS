import { z } from "zod";

export const deviceRegistrationSchema = z.object({
  installation_id_hash: z.string().regex(/^[0-9a-f]{64}$/u),
  platform: z.enum(["ios", "android"])
}).strict();

export const deviceLifecycleReasonSchema = z.enum([
  "lost",
  "replaced",
  "user_requested",
  "security",
  "administrative",
]);

export const deviceLifecycleSchema = z.object({
  reason: deviceLifecycleReasonSchema.optional(),
}).strict();

export const financeGovernanceUpdateSchema = z.object({
  primary_finance_manager_user_id: z.uuid(),
  manager_backup_user_id: z.uuid().nullable(),
  finance_approval_backup_user_id: z.uuid().nullable(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  expected_version: z.number().int().min(1)
});
