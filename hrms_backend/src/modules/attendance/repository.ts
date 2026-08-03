import { randomUUID } from "node:crypto";
import type {
  AttendanceDayRecord,
  AttendancePunch,
  AttendanceRegularizationAction,
  AttendanceRegularizationCorrectionApplication,
  AttendanceRegularizationRequest,
  AttendanceRegularizationRequestItem,
  UUID,
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

function dateInTimeZone(value: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to UTC below.
  }
  return value.slice(0, 10);
}

export class AttendanceRepository {
  constructor(private readonly store: MemoryDataStore) {}

  addPunch(
    input: Omit<AttendancePunch, "id" | "created_at" | "deleted_at" | "regularization_request_id"> & {
      regularization_request_id?: UUID | null;
    },
  ): AttendancePunch {
    const punch: AttendancePunch = {
      id: randomUUID(),
      created_at: nowIso(),
      deleted_at: null,
      regularization_request_id: input.regularization_request_id ?? null,
      ...input,
    };
    this.store.attendancePunches.push(punch);
    return punch;
  }

  listPunches(
    companyId: UUID,
    employeeUserId: UUID,
    dateFrom?: string,
    dateTo?: string,
    timeZone = "UTC",
  ): AttendancePunch[] {
    const supersededTargets = new Set(
      this.store.attendanceRegularizationCorrectionApplications
        .filter((application) => application.company_id === companyId)
        .flatMap((application) => application.target_punch_event_id ? [application.target_punch_event_id] : []),
    );
    return this.store.attendancePunches
      .filter((punch) => {
        if (
          punch.company_id !== companyId ||
          punch.employee_user_id !== employeeUserId ||
          punch.deleted_at ||
          supersededTargets.has(punch.id)
        ) {
          return false;
        }
        const date = dateInTimeZone(punch.occurred_at, timeZone);
        if (dateFrom && date < dateFrom) {
          return false;
        }
        if (dateTo && date > dateTo) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  }

  dayRecord(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
  ): AttendanceDayRecord | null {
    return (
      this.store.attendanceDayRecords.find(
        (record) =>
          record.company_id === companyId &&
          record.employee_user_id === employeeUserId &&
          record.work_date === workDate &&
          !record.deleted_at,
      ) ?? null
    );
  }

  upsertDayRecord(
    input: Omit<
      AttendanceDayRecord,
      "id" | "created_at" | "updated_at" | "version" | "deleted_at"
    >,
  ): AttendanceDayRecord {
    const existing = this.dayRecord(
      input.company_id,
      input.employee_user_id,
      input.work_date,
    );
    const now = nowIso();
    if (!existing) {
      const record: AttendanceDayRecord = {
        id: randomUUID(),
        version: 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        ...input,
      };
      this.store.attendanceDayRecords.push(record);
      return record;
    }
    if (Object.entries(input).every(([key, value]) =>
      JSON.stringify(existing[key as keyof AttendanceDayRecord]) === JSON.stringify(value)
    )) return existing;
    Object.assign(existing, input);
    existing.version += 1;
    existing.updated_at = now;
    return existing;
  }

  listDayRecords(query: {
    companyIds: Set<UUID>;
    userIds?: Set<UUID>;
    dateFrom?: string;
    dateTo?: string;
  }): AttendanceDayRecord[] {
    return this.store.attendanceDayRecords
      .filter((record) => {
        if (record.deleted_at) {
          return false;
        }
        if (!query.companyIds.has(record.company_id)) {
          return false;
        }
        if (query.userIds && !query.userIds.has(record.employee_user_id)) {
          return false;
        }
        if (query.dateFrom && record.work_date < query.dateFrom) {
          return false;
        }
        if (query.dateTo && record.work_date > query.dateTo) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          a.work_date.localeCompare(b.work_date) ||
          a.employee_user_id.localeCompare(b.employee_user_id),
      );
  }

  addRegularization(
    input: Omit<
      AttendanceRegularizationRequest,
      | "id"
      | "created_at"
      | "updated_at"
      | "version"
      | "deleted_at"
      | "decided_at"
      | "decided_by_user_id"
      | "decision_remarks"
      | "items"
      | "requested_punches"
    > & {
      items: Array<Pick<AttendanceRegularizationRequestItem,
        "operation" | "target_punch_event_id" | "event_type" | "occurred_at">>;
    },
  ): AttendanceRegularizationRequest {
    const duplicate = this.store.attendanceRegularizations.find(
      (request) =>
        request.company_id === input.company_id &&
        request.employee_user_id === input.employee_user_id &&
        request.work_date === input.work_date &&
        request.status === "pending" &&
        !request.deleted_at,
    );
    if (duplicate) {
      throw conflict(
        "A pending attendance regularization request already exists for this date.",
        {
          request_id: duplicate.id,
        },
      );
    }
    const now = nowIso();
    const requestId = randomUUID();
    const items: AttendanceRegularizationRequestItem[] = input.items.map((item, ordinal) => ({
      id: randomUUID(),
      company_id: input.company_id,
      regularization_request_id: requestId,
      ordinal,
      operation: item.operation,
      target_punch_event_id: item.target_punch_event_id,
      event_type: item.event_type,
      occurred_at: item.occurred_at,
      created_at: now,
    }));
    const request: AttendanceRegularizationRequest = {
      id: requestId,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      decided_at: null,
      decided_by_user_id: null,
      decision_remarks: null,
      ...input,
      items,
      requested_punches: items.flatMap((item) =>
        item.event_type && item.occurred_at
          ? [{ event_type: item.event_type, occurred_at: item.occurred_at }]
          : [],
      ),
    };
    this.store.attendanceRegularizations.push(request);
    this.appendRegularizationAction({
      company_id: request.company_id,
      regularization_request_id: request.id,
      actor_user_id: request.submitted_by_user_id,
      subject_employee_user_id: request.employee_user_id,
      action_kind: "submitted",
      previous_state: null,
      resulting_state: "pending",
      remarks: null,
      resulting_version: 1,
      occurred_at: now,
      migration_reconstructed: false,
    });
    return request;
  }

  appendRegularizationAction(
    input: Omit<AttendanceRegularizationAction, "id">,
  ): AttendanceRegularizationAction {
    const duplicate = this.store.attendanceRegularizationActions.find(
      (action) =>
        action.regularization_request_id === input.regularization_request_id &&
        action.resulting_version === input.resulting_version,
    );
    if (duplicate) {
      throw conflict("Attendance regularization transition was already recorded.");
    }
    const action = { id: randomUUID(), ...input };
    this.store.attendanceRegularizationActions.push(action);
    return action;
  }

  addRegularizationCorrectionApplication(
    input: Omit<AttendanceRegularizationCorrectionApplication, "id">,
  ): AttendanceRegularizationCorrectionApplication {
    const duplicateItem = this.store.attendanceRegularizationCorrectionApplications.some(
      (application) => application.regularization_request_item_id === input.regularization_request_item_id,
    );
    const duplicateTarget = input.target_punch_event_id &&
      this.store.attendanceRegularizationCorrectionApplications.some(
        (application) => application.target_punch_event_id === input.target_punch_event_id,
      );
    if (duplicateItem || duplicateTarget) {
      throw conflict("Attendance regularization correction was already applied.");
    }
    const application = { id: randomUUID(), ...input };
    this.store.attendanceRegularizationCorrectionApplications.push(application);
    return application;
  }

  findRegularization(
    id: UUID,
    companyIds: Set<UUID>,
  ): AttendanceRegularizationRequest {
    const request = this.store.attendanceRegularizations.find(
      (candidate) =>
        candidate.id === id &&
        companyIds.has(candidate.company_id) &&
        !candidate.deleted_at,
    );
    if (!request) {
      throw notFound("Attendance regularization request not found", { id });
    }
    return request;
  }

  updateRegularizationVersioned(
    id: UUID,
    companyIds: Set<UUID>,
    expectedVersion: number,
    mutator: (request: AttendanceRegularizationRequest) => void,
  ): AttendanceRegularizationRequest {
    const request = this.findRegularization(id, companyIds);
    if (request.version !== expectedVersion) {
      throw conflict(
        "Attendance regularization request was modified by another actor.",
        {
          aggregate: "attendance_regularization",
          id,
        },
      );
    }
    mutator(request);
    request.version += 1;
    request.updated_at = nowIso();
    return request;
  }

  listRegularizations(query: {
    companyIds: Set<UUID>;
    userIds?: Set<UUID>;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }): AttendanceRegularizationRequest[] {
    return this.store.attendanceRegularizations
      .filter((request) => {
        if (request.deleted_at) {
          return false;
        }
        if (!query.companyIds.has(request.company_id)) {
          return false;
        }
        if (query.userIds && !query.userIds.has(request.employee_user_id)) {
          return false;
        }
        if (query.status && request.status !== query.status) {
          return false;
        }
        if (query.dateFrom && request.work_date < query.dateFrom) {
          return false;
        }
        if (query.dateTo && request.work_date > query.dateTo) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
