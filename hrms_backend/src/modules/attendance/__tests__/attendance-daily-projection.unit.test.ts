import { describe, expect, it } from "vitest";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  AttendanceEvidenceStates,
  AttendancePresenceStates,
  AttendancePunctualityStates,
} from "#shared";
import {
  calculateSessionDurations,
  mergeAttendanceApprovals,
  projectAttendanceDay,
  secondsToLegacyMinutes,
  type AttendanceDailyProjectionInput,
} from "../daily-projection.js";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeUserId = "00000000-0000-4000-8000-000000000002";

function projection(
  overrides: Partial<AttendanceDailyProjectionInput> = {},
) {
  return projectAttendanceDay({
    companyId,
    employeeUserId,
    workDate: "2026-07-20",
    asOf: "2026-07-20T18:00:00.000Z",
    dayClassification: AttendanceDayClassifications.WorkingDay,
    firstCheckIn: "2026-07-20T09:00:00.000Z",
    lastCheckOut: "2026-07-20T17:00:00.000Z",
    hasOpenSession: false,
    workMode: "office",
    workSeconds: 28_800,
    breakSeconds: 0,
    scheduledStartAt: "2026-07-20T09:00:00.000Z",
    scheduledEndAt: "2026-07-20T17:00:00.000Z",
    graceSeconds: 600,
    ...overrides,
  });
}

describe("attendance daily projection", () => {
  it("projects normal presence and canonical second durations", () => {
    expect(projection()).toMatchObject({
      status: AttendanceDayStatuses.Present,
      presence_state: AttendancePresenceStates.Present,
      punctuality_state: AttendancePunctualityStates.OnTime,
      evidence_state: AttendanceEvidenceStates.Complete,
      work_seconds: 28_800,
      work_minutes: 480,
      scheduled_seconds: 28_800,
      payroll_state: "unprocessed",
    });
  });

  it.each([
    {
      name: "late arrival",
      firstCheckIn: "2026-07-20T09:20:00.000Z",
      lastCheckOut: "2026-07-20T17:00:00.000Z",
      punctuality: AttendancePunctualityStates.Late,
      status: AttendanceDayStatuses.Late,
    },
    {
      name: "early departure",
      firstCheckIn: "2026-07-20T09:00:00.000Z",
      lastCheckOut: "2026-07-20T16:30:00.000Z",
      punctuality: AttendancePunctualityStates.EarlyDeparture,
      status: AttendanceDayStatuses.Present,
    },
    {
      name: "late and early departure",
      firstCheckIn: "2026-07-20T09:20:00.000Z",
      lastCheckOut: "2026-07-20T16:30:00.000Z",
      punctuality: AttendancePunctualityStates.LateAndEarlyDeparture,
      status: AttendanceDayStatuses.Late,
    },
  ])("projects $name independently", ({ firstCheckIn, lastCheckOut, punctuality, status }) => {
    expect(projection({ firstCheckIn, lastCheckOut })).toMatchObject({
      punctuality_state: punctuality,
      status,
    });
  });

  it("distinguishes absent, future, and incomplete days", () => {
    const noEvidence = {
      firstCheckIn: null,
      lastCheckOut: null,
      workSeconds: 0,
      breakSeconds: 0,
    };
    expect(projection(noEvidence).presence_state).toBe(AttendancePresenceStates.Absent);
    expect(projection({
      ...noEvidence,
      dayClassification: AttendanceDayClassifications.Future,
    })).toMatchObject({
      status: AttendanceDayStatuses.Future,
      presence_state: AttendancePresenceStates.NotStarted,
    });
    expect(projection({
      lastCheckOut: null,
      hasOpenSession: true,
      incompleteIsException: true,
      workSeconds: 1800,
    })).toMatchObject({
      presence_state: AttendancePresenceStates.Incomplete,
      evidence_state: AttendanceEvidenceStates.Partial,
      exception_type: "missing_punch",
    });
  });

  it.each([
    [AttendanceDayClassifications.Holiday, AttendanceDayStatuses.Holiday],
    [AttendanceDayClassifications.Weekend, AttendanceDayStatuses.Weekend],
  ] as const)("keeps %s classification when work is recorded", (dayClassification, status) => {
    expect(projection({ dayClassification })).toMatchObject({
      day_classification: dayClassification,
      presence_state: AttendancePresenceStates.Present,
      status,
    });
  });

  it("projects approved leave and WFH without claiming attendance presence", () => {
    expect(projection({
      dayClassification: AttendanceDayClassifications.Leave,
      firstCheckIn: null,
      lastCheckOut: null,
      workSeconds: 0,
      approvalFacts: [{ kind: AttendanceApprovalKinds.Leave, state: AttendanceApprovalStates.Approved }],
    })).toMatchObject({
      status: AttendanceDayStatuses.Leave,
      presence_state: AttendancePresenceStates.NotApplicable,
      approval_kind: AttendanceApprovalKinds.Leave,
      approval_state: AttendanceApprovalStates.Approved,
    });
    expect(projection({
      dayClassification: AttendanceDayClassifications.Wfh,
      firstCheckIn: null,
      lastCheckOut: null,
      workSeconds: 0,
      workMode: "wfh",
      approvalFacts: [{ kind: AttendanceApprovalKinds.Wfh, state: AttendanceApprovalStates.Approved }],
    })).toMatchObject({
      status: AttendanceDayStatuses.Wfh,
      presence_state: AttendancePresenceStates.NotStarted,
    });
  });

  it("preserves a prior approval and represents multiple sources explicitly", () => {
    expect(mergeAttendanceApprovals(
      [{ kind: AttendanceApprovalKinds.Regularization, state: AttendanceApprovalStates.Approved }],
      { approval_kind: AttendanceApprovalKinds.Leave, approval_state: AttendanceApprovalStates.Approved },
    )).toEqual({
      approvalKind: AttendanceApprovalKinds.Multiple,
      approvalState: AttendanceApprovalStates.Approved,
    });
  });

  it("floors legacy minute values at the compatibility boundary", () => {
    expect(secondsToLegacyMinutes(3_599)).toBe(59);
    expect(projection({ workSeconds: 3_599 }).work_minutes).toBe(59);
  });

  it("sums multiple sessions and session-owned breaks without double counting", () => {
    expect(calculateSessionDurations({
      sessions: [
        { id: "session-1", startedAt: "2026-07-20T09:00:00.000Z", endedAt: "2026-07-20T12:00:00.000Z" },
        { id: "session-2", startedAt: "2026-07-20T13:00:00.000Z", endedAt: "2026-07-20T17:00:00.000Z" },
      ],
      breaks: [
        { sessionId: "session-1", startedAt: "2026-07-20T10:00:00.000Z", endedAt: "2026-07-20T10:15:00.000Z" },
        { sessionId: "session-2", startedAt: "2026-07-20T15:00:00.000Z", endedAt: "2026-07-20T15:30:00.000Z" },
      ],
      asOf: "2026-07-20T18:00:00.000Z",
    })).toEqual({ workSeconds: 22_500, breakSeconds: 2_700 });
  });
});
