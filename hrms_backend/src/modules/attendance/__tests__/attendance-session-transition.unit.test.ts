import { describe, expect, it } from "vitest";
import { AttendancePunchEventTypes } from "#shared";
import {
  AttendanceCommandStates,
  AttendanceDecisionReasonCodes,
  AttendanceTransitionActions,
  decideAttendanceTransition,
  type AttendanceCommandState,
} from "../session-transition.js";

describe("attendance session transitions", () => {
  const allowedCases = [
    {
      state: AttendanceCommandStates.NotCheckedIn,
      command: AttendancePunchEventTypes.CheckIn,
      action: AttendanceTransitionActions.OpenSession,
      nextState: AttendanceCommandStates.Working,
    },
    {
      state: AttendanceCommandStates.Working,
      command: AttendancePunchEventTypes.BreakStart,
      action: AttendanceTransitionActions.StartBreak,
      nextState: AttendanceCommandStates.OnBreak,
    },
    {
      state: AttendanceCommandStates.OnBreak,
      command: AttendancePunchEventTypes.BreakEnd,
      action: AttendanceTransitionActions.EndBreak,
      nextState: AttendanceCommandStates.Working,
    },
    {
      state: AttendanceCommandStates.Working,
      command: AttendancePunchEventTypes.CheckOut,
      action: AttendanceTransitionActions.CloseSession,
      nextState: AttendanceCommandStates.NotCheckedIn,
    },
  ] as const;

  it.each(allowedCases)(
    "allows $command when state is $state",
    ({ state, command, action, nextState }) => {
      const decision = decideAttendanceTransition(state, command);

      expect(decision).toEqual({
        allowed: true,
        previous_state: state,
        next_state: nextState,
        action,
        reason_code: null,
        reason_detail: null,
      });
    },
  );

  const deniedCases = [
    {
      state: AttendanceCommandStates.NotCheckedIn,
      command: AttendancePunchEventTypes.BreakStart,
      reason: AttendanceDecisionReasonCodes.NoOpenSession,
    },
    {
      state: AttendanceCommandStates.NotCheckedIn,
      command: AttendancePunchEventTypes.BreakEnd,
      reason: AttendanceDecisionReasonCodes.NoOpenBreak,
    },
    {
      state: AttendanceCommandStates.NotCheckedIn,
      command: AttendancePunchEventTypes.CheckOut,
      reason: AttendanceDecisionReasonCodes.NoOpenSession,
    },
    {
      state: AttendanceCommandStates.Working,
      command: AttendancePunchEventTypes.CheckIn,
      reason: AttendanceDecisionReasonCodes.AlreadyCheckedIn,
    },
    {
      state: AttendanceCommandStates.Working,
      command: AttendancePunchEventTypes.BreakEnd,
      reason: AttendanceDecisionReasonCodes.NoOpenBreak,
    },
    {
      state: AttendanceCommandStates.OnBreak,
      command: AttendancePunchEventTypes.CheckIn,
      reason: AttendanceDecisionReasonCodes.AlreadyCheckedIn,
    },
    {
      state: AttendanceCommandStates.OnBreak,
      command: AttendancePunchEventTypes.BreakStart,
      reason: AttendanceDecisionReasonCodes.BreakAlreadyStarted,
    },
    {
      state: AttendanceCommandStates.OnBreak,
      command: AttendancePunchEventTypes.CheckOut,
      reason: AttendanceDecisionReasonCodes.OpenBreakMustEnd,
    },
  ] as const;

  it.each(deniedCases)(
    "denies $command when state is $state",
    ({ state, command, reason }) => {
      const decision = decideAttendanceTransition(
        state as AttendanceCommandState,
        command,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.previous_state).toBe(state);
      expect(decision.next_state).toBe(state);
      expect(decision.action).toBe(AttendanceTransitionActions.None);
      expect(decision.reason_code).toBe(reason);
      expect(decision.reason_detail).toBeTruthy();
    },
  );
});
