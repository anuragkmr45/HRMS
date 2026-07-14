import type { AttendancePunchEventType } from "#shared";
import { AttendancePunchEventTypes } from "#shared";

export const AttendanceCommandStates = {
  NotCheckedIn: "not_checked_in",
  Working: "working",
  OnBreak: "on_break",
} as const;

export type AttendanceCommandState =
  (typeof AttendanceCommandStates)[keyof typeof AttendanceCommandStates];

export const AttendanceTransitionActions = {
  OpenSession: "open_session",
  StartBreak: "start_break",
  EndBreak: "end_break",
  CloseSession: "close_session",
  None: "none",
} as const;

export type AttendanceTransitionAction =
  (typeof AttendanceTransitionActions)[keyof typeof AttendanceTransitionActions];

export const AttendanceDecisionReasonCodes = {
  AlreadyCheckedIn: "already_checked_in",
  NoOpenSession: "no_open_session",
  BreakAlreadyStarted: "break_already_started",
  NoOpenBreak: "no_open_break",
  OpenBreakMustEnd: "open_break_must_end",
} as const;

export type AttendanceDecisionReasonCode =
  (typeof AttendanceDecisionReasonCodes)[keyof typeof AttendanceDecisionReasonCodes];

export interface AllowedAttendanceTransition {
  allowed: true;
  previous_state: AttendanceCommandState;
  next_state: AttendanceCommandState;
  action: Exclude<
    AttendanceTransitionAction,
    typeof AttendanceTransitionActions.None
  >;
  reason_code: null;
  reason_detail: null;
}

export interface DeniedAttendanceTransition {
  allowed: false;
  previous_state: AttendanceCommandState;
  next_state: AttendanceCommandState;
  action: typeof AttendanceTransitionActions.None;
  reason_code: AttendanceDecisionReasonCode;
  reason_detail: string;
}

export type AttendanceTransitionDecision =
  | AllowedAttendanceTransition
  | DeniedAttendanceTransition;

export function decideAttendanceTransition(
  currentState: AttendanceCommandState,
  commandType: AttendancePunchEventType,
): AttendanceTransitionDecision {
  switch (currentState) {
    case AttendanceCommandStates.NotCheckedIn:
      return decideWhenNotCheckedIn(commandType);

    case AttendanceCommandStates.Working:
      return decideWhenWorking(commandType);

    case AttendanceCommandStates.OnBreak:
      return decideWhenOnBreak(commandType);

    default:
      return assertNever(currentState);
  }
}

function decideWhenNotCheckedIn(
  commandType: AttendancePunchEventType,
): AttendanceTransitionDecision {
  switch (commandType) {
    case AttendancePunchEventTypes.CheckIn:
      return allowed(
        AttendanceCommandStates.NotCheckedIn,
        AttendanceCommandStates.Working,
        AttendanceTransitionActions.OpenSession,
      );

    case AttendancePunchEventTypes.BreakStart:
      return denied(
        AttendanceCommandStates.NotCheckedIn,
        AttendanceDecisionReasonCodes.NoOpenSession,
        "An attendance session must be open before starting a break.",
      );

    case AttendancePunchEventTypes.BreakEnd:
      return denied(
        AttendanceCommandStates.NotCheckedIn,
        AttendanceDecisionReasonCodes.NoOpenBreak,
        "There is no open attendance break to end.",
      );

    case AttendancePunchEventTypes.CheckOut:
      return denied(
        AttendanceCommandStates.NotCheckedIn,
        AttendanceDecisionReasonCodes.NoOpenSession,
        "There is no open attendance session to check out from.",
      );

    default:
      return assertNever(commandType);
  }
}

function decideWhenWorking(
  commandType: AttendancePunchEventType,
): AttendanceTransitionDecision {
  switch (commandType) {
    case AttendancePunchEventTypes.CheckIn:
      return denied(
        AttendanceCommandStates.Working,
        AttendanceDecisionReasonCodes.AlreadyCheckedIn,
        "The employee already has an open attendance session.",
      );

    case AttendancePunchEventTypes.BreakStart:
      return allowed(
        AttendanceCommandStates.Working,
        AttendanceCommandStates.OnBreak,
        AttendanceTransitionActions.StartBreak,
      );

    case AttendancePunchEventTypes.BreakEnd:
      return denied(
        AttendanceCommandStates.Working,
        AttendanceDecisionReasonCodes.NoOpenBreak,
        "There is no open attendance break to end.",
      );

    case AttendancePunchEventTypes.CheckOut:
      return allowed(
        AttendanceCommandStates.Working,
        AttendanceCommandStates.NotCheckedIn,
        AttendanceTransitionActions.CloseSession,
      );

    default:
      return assertNever(commandType);
  }
}

function decideWhenOnBreak(
  commandType: AttendancePunchEventType,
): AttendanceTransitionDecision {
  switch (commandType) {
    case AttendancePunchEventTypes.CheckIn:
      return denied(
        AttendanceCommandStates.OnBreak,
        AttendanceDecisionReasonCodes.AlreadyCheckedIn,
        "The employee already has an open attendance session.",
      );

    case AttendancePunchEventTypes.BreakStart:
      return denied(
        AttendanceCommandStates.OnBreak,
        AttendanceDecisionReasonCodes.BreakAlreadyStarted,
        "An attendance break is already open.",
      );

    case AttendancePunchEventTypes.BreakEnd:
      return allowed(
        AttendanceCommandStates.OnBreak,
        AttendanceCommandStates.Working,
        AttendanceTransitionActions.EndBreak,
      );

    case AttendancePunchEventTypes.CheckOut:
      return denied(
        AttendanceCommandStates.OnBreak,
        AttendanceDecisionReasonCodes.OpenBreakMustEnd,
        "The open attendance break must be ended before checking out.",
      );

    default:
      return assertNever(commandType);
  }
}

function allowed(
  previousState: AttendanceCommandState,
  nextState: AttendanceCommandState,
  action: AllowedAttendanceTransition["action"],
): AllowedAttendanceTransition {
  return {
    allowed: true,
    previous_state: previousState,
    next_state: nextState,
    action,
    reason_code: null,
    reason_detail: null,
  };
}

function denied(
  currentState: AttendanceCommandState,
  reasonCode: AttendanceDecisionReasonCode,
  reasonDetail: string,
): DeniedAttendanceTransition {
  return {
    allowed: false,
    previous_state: currentState,
    next_state: currentState,
    action: AttendanceTransitionActions.None,
    reason_code: reasonCode,
    reason_detail: reasonDetail,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unsupported attendance transition value: ${String(value)}`);
}
