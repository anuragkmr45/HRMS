import type {
  AttendanceRegularizationBody,
  AttendanceRegularizationEventType,
  AttendanceRegularizationItem,
  AttendanceRegularizationOperation,
  AttendanceRegularizationRecord,
} from "./api";
import { localIsoDate } from "./live";

export const REGULARIZATION_EVENT_LABEL: Record<AttendanceRegularizationEventType, string> = {
  check_in: "Check-in",
  check_out: "Check-out",
};

export const REGULARIZATION_OPERATION_LABEL: Record<AttendanceRegularizationOperation, string> = {
  add: "Add missing punch",
  replace: "Replace incorrect punch",
  void: "Remove duplicate punch",
};

export const REGULARIZATION_OPERATION_DESCRIPTION: Record<
  AttendanceRegularizationOperation,
  string
> = {
  add: "Create a missing historical check-in or check-out.",
  replace: "Keep the original evidence and request a corrected punch.",
  void: "Keep the original evidence but exclude it from attendance calculations.",
};

export interface RegularizationDraftItem {
  key: string;
  operation: AttendanceRegularizationOperation;
  targetPunchEventId: string;
  eventType: AttendanceRegularizationEventType;
  time: string;
}

export interface RegularizationPunchOption {
  id: string;
  eventType: AttendanceRegularizationEventType;
  occurredAt: string;
  workDate: string;
  time: string;
  source: string;
}

export interface BuildRegularizationRequestInput {
  workDate: string;
  reason: string;
  draftItems: RegularizationDraftItem[];
  punchOptions: RegularizationPunchOption[];
  unavailableTargetIds: ReadonlySet<string>;
  today: string;
}

export interface BuildRegularizationRequestResult {
  body: AttendanceRegularizationBody | null;
  errors: string[];
  summaries: string[];
}

export function createRegularizationDraftItem(key: string): RegularizationDraftItem {
  return {
    key,
    operation: "add",
    targetPunchEventId: "",
    eventType: "check_in",
    time: "",
  };
}

export function previousLocalDate(now = new Date()): string {
  const value = new Date(now);
  value.setDate(value.getDate() - 1);
  return localIsoDate(value);
}

export function monthsAgoLocalDate(months: number, now = new Date()): string {
  const value = new Date(now.getFullYear(), now.getMonth() - Math.max(0, months), 1);
  return localIsoDate(value);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && localIsoDate(parsed) === value;
}

export function localDateTimeToIso(workDate: string, time: string): string | null {
  if (!isValidIsoDate(workDate) || !/^\d{2}:\d{2}$/u.test(time)) return null;

  const value = new Date(`${workDate}T${time}:00`);
  const normalizedTime = `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes(),
  ).padStart(2, "0")}`;

  if (
    Number.isNaN(value.getTime()) ||
    localIsoDate(value) !== workDate ||
    normalizedTime !== time
  ) {
    return null;
  }

  return value.toISOString();
}

export function formatRegularizationWorkDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatRegularizationTime(value: string): string {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return value;

  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function regularizationPunchLabel(punch: RegularizationPunchOption): string {
  const source = punch.source.trim().replaceAll("_", " ");
  return `${REGULARIZATION_EVENT_LABEL[punch.eventType]} at ${punch.time}${
    source ? ` · ${source}` : ""
  }`;
}

export function regularizationRequestOperationSummary(
  request: AttendanceRegularizationRecord,
): string {
  const operations = Array.from(new Set((request.items ?? []).map((item) => item.operation)));
  if (operations.length === 0) return "Historical correction";
  return operations.map((operation) => REGULARIZATION_OPERATION_LABEL[operation]).join(", ");
}

export function buildRegularizationRequest(
  input: BuildRegularizationRequestInput,
): BuildRegularizationRequestResult {
  const errors: string[] = [];
  const items: AttendanceRegularizationItem[] = [];
  const summaries: string[] = [];
  const targetIds = new Set<string>();
  const addKeys = new Set<string>();
  const trimmedReason = input.reason.trim();

  if (!input.workDate) {
    errors.push("Select the historical attendance date.");
  } else if (!isValidIsoDate(input.workDate)) {
    errors.push("Select a valid historical attendance date.");
  } else if (input.workDate >= input.today) {
    errors.push("Regularization is available only for dates before today.");
  }

  if (trimmedReason.length < 3) {
    errors.push("Reason must contain at least 3 characters.");
  }
  if (trimmedReason.length > 1000) {
    errors.push("Reason cannot exceed 1000 characters.");
  }
  if (input.draftItems.length === 0 || input.draftItems.length > 20) {
    errors.push("Add between 1 and 20 correction actions.");
  }

  input.draftItems.forEach((draft, index) => {
    const itemNumber = index + 1;
    const target = draft.targetPunchEventId
      ? input.punchOptions.find((punch) => punch.id === draft.targetPunchEventId)
      : undefined;

    if (draft.operation === "replace" || draft.operation === "void") {
      if (!draft.targetPunchEventId || !target || target.workDate !== input.workDate) {
        errors.push(`Action ${itemNumber}: select a punch from the chosen date.`);
        return;
      }
      if (input.unavailableTargetIds.has(draft.targetPunchEventId)) {
        errors.push(
          `Action ${itemNumber}: this punch already has a pending or approved correction.`,
        );
        return;
      }
      if (targetIds.has(draft.targetPunchEventId)) {
        errors.push(`Action ${itemNumber}: the same punch cannot be corrected twice.`);
        return;
      }
      targetIds.add(draft.targetPunchEventId);
    }

    if (draft.operation === "void") {
      items.push({
        operation: "void",
        target_punch_event_id: draft.targetPunchEventId,
      });
      summaries.push(`Remove ${regularizationPunchLabel(target!)}`);
      return;
    }

    if (!draft.time) {
      errors.push(`Action ${itemNumber}: enter the requested punch time.`);
      return;
    }
    if (!input.workDate) return;

    const occurredAt = localDateTimeToIso(input.workDate, draft.time);
    if (!occurredAt) {
      errors.push(
        `Action ${itemNumber}: enter a valid time on ${formatRegularizationWorkDate(
          input.workDate,
        )}.`,
      );
      return;
    }

    if (draft.operation === "add") {
      const duplicateKey = `${draft.eventType}:${occurredAt}`;
      if (addKeys.has(duplicateKey)) {
        errors.push(`Action ${itemNumber}: this missing punch is already included.`);
        return;
      }
      addKeys.add(duplicateKey);
      items.push({
        operation: "add",
        event_type: draft.eventType,
        occurred_at: occurredAt,
      });
      summaries.push(
        `Add ${REGULARIZATION_EVENT_LABEL[draft.eventType]} at ${formatRegularizationTime(
          draft.time,
        )}`,
      );
      return;
    }

    items.push({
      operation: "replace",
      target_punch_event_id: draft.targetPunchEventId,
      event_type: draft.eventType,
      occurred_at: occurredAt,
    });
    summaries.push(
      `Replace ${regularizationPunchLabel(target!)} with ${
        REGULARIZATION_EVENT_LABEL[draft.eventType]
      } at ${formatRegularizationTime(draft.time)}`,
    );
  });

  return {
    body:
      errors.length === 0
        ? {
            work_date: input.workDate,
            reason: trimmedReason,
            items,
          }
        : null,
    errors,
    summaries,
  };
}
