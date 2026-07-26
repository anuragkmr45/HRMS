import { useCallback, useRef, useState } from "react";
import { isApiUnavailableError, userFacingErrorMessage } from "@/shared/api";
import type { AttendancePunchEventType } from "./api";
import { useManualAttendanceMutation } from "./queries";

export type ManualAttendanceResultKind = "accepted" | "rejected" | "uncertain";

export interface ManualAttendanceResult {
  kind: ManualAttendanceResultKind;
  action: AttendancePunchEventType;
  title: string;
  message: string;
}

interface PendingAttendanceAction {
  action: AttendancePunchEventType;
  idempotencyKey: string;
}

interface UseManualAttendanceActionOptions {
  sourceView: "attendance_page" | "dashboard";
  onDeterministicFailure?: () => void;
}

const ACTION_COPY: Record<
  AttendancePunchEventType,
  { acceptedTitle: string; acceptedMessage: string; rejectedTitle: string }
> = {
  check_in: {
    acceptedTitle: "Clock-in recorded",
    acceptedMessage: "Your work session has started.",
    rejectedTitle: "Clock-in was not recorded",
  },
  break_start: {
    acceptedTitle: "Break started",
    acceptedMessage: "Your break is now being recorded.",
    rejectedTitle: "Break was not started",
  },
  break_end: {
    acceptedTitle: "Work resumed",
    acceptedMessage: "Your break has ended.",
    rejectedTitle: "Work was not resumed",
  },
  check_out: {
    acceptedTitle: "Clock-out recorded",
    acceptedMessage: "Your work session has ended.",
    rejectedTitle: "Clock-out was not recorded",
  },
};

function createIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure action identity is unavailable in this browser.");
  }
  return `attendance-${globalThis.crypto.randomUUID()}`;
}

export function useManualAttendanceAction({
  sourceView,
  onDeterministicFailure,
}: UseManualAttendanceActionOptions) {
  const mutation = useManualAttendanceMutation();
  const pendingAction = useRef<PendingAttendanceAction | null>(null);
  const inFlight = useRef(false);
  const [result, setResult] = useState<ManualAttendanceResult | null>(null);

  const execute = useCallback(
    async (action: AttendancePunchEventType, retry = false) => {
      if (inFlight.current || mutation.isPending) return;

      let identity = retry ? pendingAction.current : null;
      if (!identity || identity.action !== action) {
        try {
          identity = { action, idempotencyKey: createIdempotencyKey() };
        } catch (error) {
          pendingAction.current = null;
          setResult({
            kind: "rejected",
            action,
            title: ACTION_COPY[action].rejectedTitle,
            message: userFacingErrorMessage(
              error,
              "This browser cannot create a secure attendance request.",
            ),
          });
          return;
        }
      }
      pendingAction.current = identity;
      inFlight.current = true;

      try {
        await mutation.mutateAsync({
          action,
          idempotencyKey: identity.idempotencyKey,
          sourceView,
        });
        pendingAction.current = null;
        setResult({
          kind: "accepted",
          action,
          title: ACTION_COPY[action].acceptedTitle,
          message: ACTION_COPY[action].acceptedMessage,
        });
      } catch (error) {
        if (isApiUnavailableError(error)) {
          setResult({
            kind: "uncertain",
            action,
            title: "Outcome not confirmed",
            message:
              "The connection ended before the result arrived. Check the latest status before starting another action.",
          });
          return;
        }

        pendingAction.current = null;
        setResult({
          kind: "rejected",
          action,
          title: ACTION_COPY[action].rejectedTitle,
          message: userFacingErrorMessage(error, "The attendance request could not be completed."),
        });
        onDeterministicFailure?.();
      } finally {
        inFlight.current = false;
      }
    },
    [mutation, onDeterministicFailure, sourceView],
  );

  const retry = useCallback(async () => {
    if (!pendingAction.current) return;
    await execute(pendingAction.current.action, true);
  }, [execute]);

  const clearResult = useCallback(() => {
    if (result?.kind !== "uncertain") pendingAction.current = null;
    setResult(null);
  }, [result?.kind]);

  const reconcile = useCallback(
    (allowedActions: AttendancePunchEventType[]) => {
      const pending = pendingAction.current;
      if (result?.kind !== "uncertain" || !pending || allowedActions.includes(pending.action)) {
        return;
      }

      pendingAction.current = null;
      setResult({
        kind: "accepted",
        action: pending.action,
        title: "Latest attendance status loaded",
        message:
          "The server no longer offers this action. Review the current session status before continuing.",
      });
    },
    [result?.kind],
  );

  return {
    execute,
    retry,
    clearResult,
    reconcile,
    result,
    isPending: mutation.isPending,
    canRetry: result?.kind === "uncertain" && pendingAction.current !== null,
  };
}
