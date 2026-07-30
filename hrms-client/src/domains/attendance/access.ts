import type { Role } from "@/lib/mock/roles";

export interface AttendanceAccess {
  readonly canViewAttendance: boolean;
  readonly canViewSelfAttendance: boolean;
  readonly canPunch: boolean;
  readonly canViewTeamAttendance: boolean;
  readonly canViewReviewQueue: boolean;
  readonly canDecideRegularizations: boolean;
}

const NO_ATTENDANCE_ACCESS: AttendanceAccess = Object.freeze({
  canViewAttendance: false,
  canViewSelfAttendance: false,
  canPunch: false,
  canViewTeamAttendance: false,
  canViewReviewQueue: false,
  canDecideRegularizations: false,
});

const ACCESS_BY_ROLE: Record<Role, AttendanceAccess> = {
  main_admin: access({ team: true, review: true, decide: true }),
  hr_admin: access({ team: true, review: true, decide: true }),
  employee: access({ self: true, punch: true }),
  manager: access({ self: true, punch: true, team: true, review: true, decide: true }),
  director: access({ self: true, punch: true, team: true, review: true, decide: true }),
  auditor: access({ team: true, review: true }),
  project_manager: access({
    self: true,
    punch: true,
    team: true,
    review: true,
    decide: true,
  }),
  finance_manager: access({ self: true, punch: true }),
  asset_admin: access({ self: true, punch: true }),
  helpdesk_agent: NO_ATTENDANCE_ACCESS,
};

export function attendanceAccessForRole(role: Role | null | undefined): AttendanceAccess {
  return role ? ACCESS_BY_ROLE[role] : NO_ATTENDANCE_ACCESS;
}

function access(
  capabilities: {
    self?: boolean;
    punch?: boolean;
    team?: boolean;
    review?: boolean;
    decide?: boolean;
  } = {},
): AttendanceAccess {
  return Object.freeze({
    canViewAttendance: true,
    canViewSelfAttendance: capabilities.self === true,
    canPunch: capabilities.punch === true,
    canViewTeamAttendance: capabilities.team === true,
    canViewReviewQueue: capabilities.review === true,
    canDecideRegularizations: capabilities.decide === true,
  });
}
