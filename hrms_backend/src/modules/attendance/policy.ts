import type { AuthUser, CoreUser } from "#shared";
import { Roles } from "#shared";
import { forbidden, selfApprovalBlocked } from "../../platform/errors.js";

const SYSTEM_WIDE_ATTENDANCE_ROLES: readonly string[] = [
  Roles.Admin,
  Roles.HRManager,
  Roles.Auditor,
];
const SELF_ATTENDANCE_ROLES: readonly string[] = [
  Roles.Employee,
  Roles.Reviewer,
  Roles.Director,
  Roles.FinanceManager,
  Roles.AssetManager,
];

export function canUseSelfAttendance(actor: AuthUser): boolean {
  const hasSystemWideAttendanceRole = actor.roles.some((role) =>
    SYSTEM_WIDE_ATTENDANCE_ROLES.includes(role),
  );

  if (hasSystemWideAttendanceRole) {
    return false;
  }

  return actor.roles.some((role) => SELF_ATTENDANCE_ROLES.includes(role));
}

export function assertCanUseSelfAttendance(actor: AuthUser): void {
  if (!canUseSelfAttendance(actor)) {
    throw forbidden(
      "Self attendance is available only to employee self-service roles.",
    );
  }
}

export function canSeeAllAttendance(actor: AuthUser): boolean {
  return actor.roles.some((role) =>
    SYSTEM_WIDE_ATTENDANCE_ROLES.includes(role),
  );
}

export function canSeeAttendanceUser(actor: AuthUser, user: CoreUser): boolean {
  if (actor.id === user.id || canSeeAllAttendance(actor)) {
    return true;
  }
  return user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
}

export function assertCanSeeAttendanceUser(
  actor: AuthUser,
  user: CoreUser,
): void {
  if (!canSeeAttendanceUser(actor, user)) {
    throw forbidden(
      "Attendance access is limited to self, reporting hierarchy, HR, Admin, or Auditor users.",
    );
  }
}

export function assertCanDecideRegularization(
  actor: AuthUser,
  request: {
    employee_user_id: string;
    current_approver_user_id: string | null;
  },
): void {
  if (actor.id === request.employee_user_id) {
    throw selfApprovalBlocked("attendance_regularization_decision");
  }
  if (
    canManageAllAttendance(actor) ||
    request.current_approver_user_id === actor.id
  ) {
    return;
  }
  throw forbidden(
    "Only the assigned manager, HR, or Admin can decide this regularization request.",
  );
}

export function canManageAllAttendance(actor: AuthUser): boolean {
  return actor.roles.some(
    (role) => role === Roles.Admin || role === Roles.HRManager,
  );
}

export function assertCanAssistCurrentPunch(
  actor: AuthUser,
  subject: CoreUser,
): void {
  if (actor.roles.includes(Roles.Auditor)) {
    throw forbidden("Auditor users cannot record attendance punches.");
  }
  if (canManageAllAttendance(actor)) return;
  if (
    actor.id !== subject.id &&
    subject.hierarchy_path.startsWith(`${actor.hierarchy_path}.`)
  ) {
    return;
  }
  throw forbidden(
    "Only a reporting manager, HR, or Admin can record an assisted current punch.",
  );
}

export function assertCanCreateHistoricalCorrection(
  actor: AuthUser,
): void {
  if (!canManageAllAttendance(actor)) {
    throw forbidden("Only HR or Admin can create a historical attendance correction.");
  }
}
