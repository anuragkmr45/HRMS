import type { AuthUser, TimesheetSubmission } from "#shared";
import { Roles } from "#shared";
import { forbidden } from "../../platform/errors.js";

const SELF_TIMESHEET_ROLES: readonly string[] = [
  Roles.Employee,
  Roles.Reviewer,
  Roles.Director,
  Roles.FinanceManager
];

export function canUseSelfTimesheet(actor: AuthUser): boolean {
  return actor.roles.some((role) => SELF_TIMESHEET_ROLES.includes(role));
}

export function assertCanUseSelfTimesheet(actor: AuthUser): void {
  if (!canUseSelfTimesheet(actor)) {
    throw forbidden("Self timesheet is available only to employee self-service roles.");
  }
}

export function assertTimesheetOwner(actor: AuthUser, employeeUserId: string): void {
  if (actor.id !== employeeUserId && !actor.roles.includes(Roles.Admin)) {
    throw forbidden("Timesheet owner access required");
  }
}

export function assertCurrentApprover(actor: AuthUser, submission: TimesheetSubmission): void {
  if (submission.current_approver_user_id !== actor.id && !actor.roles.includes(Roles.Admin)) {
    throw forbidden("Only the current approver can act on this timesheet");
  }
}
