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
      nextState: AttendanceCommandStates.Completed,
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
      name: "rejects break start without check-in",
      state: AttendanceCommandStates.NotCheckedIn,
      command: AttendancePunchEventTypes.BreakStart,
      reason: AttendanceDecisionReasonCodes.NoOpenSession,
    },
    {
      name: "rejects break end without an open break",
      state: AttendanceCommandStates.NotCheckedIn,
      command: AttendancePunchEventTypes.BreakEnd,
      reason: AttendanceDecisionReasonCodes.NoOpenBreak,
    },
    {
      name: "rejects checkout without check-in",
      state: AttendanceCommandStates.NotCheckedIn,
      command: AttendancePunchEventTypes.CheckOut,
      reason: AttendanceDecisionReasonCodes.NoOpenSession,
    },
    {
      name: "rejects duplicate check-in when a session is already open",
      state: AttendanceCommandStates.Working,
      command: AttendancePunchEventTypes.CheckIn,
      reason: AttendanceDecisionReasonCodes.AlreadyCheckedIn,
    },
    {
      name: "rejects break end while working without an open break",
      state: AttendanceCommandStates.Working,
      command: AttendancePunchEventTypes.BreakEnd,
      reason: AttendanceDecisionReasonCodes.NoOpenBreak,
    },
    {
      name: "rejects duplicate check-in while on break",
      state: AttendanceCommandStates.OnBreak,
      command: AttendancePunchEventTypes.CheckIn,
      reason: AttendanceDecisionReasonCodes.AlreadyCheckedIn,
    },
    {
      name: "rejects duplicate break start while already on break",
      state: AttendanceCommandStates.OnBreak,
      command: AttendancePunchEventTypes.BreakStart,
      reason: AttendanceDecisionReasonCodes.BreakAlreadyStarted,
    },
    {
      name: "rejects checkout while a break is open",
      state: AttendanceCommandStates.OnBreak,
      command: AttendancePunchEventTypes.CheckOut,
      reason: AttendanceDecisionReasonCodes.OpenBreakMustEnd,
    },
    {
      name: "rejects completed-cycle check-in",
      state: AttendanceCommandStates.Completed,
      command: AttendancePunchEventTypes.CheckIn,
      reason: AttendanceDecisionReasonCodes.AttendanceCycleCompleted,
    },
    {
      name: "rejects completed-cycle break start",
      state: AttendanceCommandStates.Completed,
      command: AttendancePunchEventTypes.BreakStart,
      reason: AttendanceDecisionReasonCodes.AttendanceCycleCompleted,
    },
    {
      name: "rejects completed-cycle break end",
      state: AttendanceCommandStates.Completed,
      command: AttendancePunchEventTypes.BreakEnd,
      reason: AttendanceDecisionReasonCodes.AttendanceCycleCompleted,
    },
    {
      name: "rejects completed-cycle checkout",
      state: AttendanceCommandStates.Completed,
      command: AttendancePunchEventTypes.CheckOut,
      reason: AttendanceDecisionReasonCodes.AttendanceCycleCompleted,
    },
  ] as const;

  it.each(deniedCases)(
    "$name",
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
