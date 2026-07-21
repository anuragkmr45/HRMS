import { randomUUID } from "node:crypto";
import type { Holiday, LeaveRequest, UUID, WfhRequest } from "#shared";
import { LeaveRequestStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export interface LeaveWfhListQuery {
  userIds?: Set<UUID>;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

function overlaps(input: { from: string; to: string }, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && input.to < dateFrom) {
    return false;
  }
  if (dateTo && input.from > dateTo) {
    return false;
  }
  return true;
}

export class LeaveWfhRepository {
  constructor(private readonly store: MemoryDataStore) {}

  nextRequestCode(prefix: "LV" | "WFH"): string {
    const year = new Date().getUTCFullYear();
    const count =
      prefix === "LV"
        ? this.store.leaveRequests.length + 1
        : this.store.wfhRequests.length + 1;
    return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
  }

  addLeaveRequest(input: Omit<LeaveRequest, "id" | "created_at" | "updated_at" | "version" | "deleted_at" | "decided_at" | "decided_by_user_id" | "decision_remarks" | "cancelled_at">): LeaveRequest {
    const now = nowIso();
    const request: LeaveRequest = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      decided_at: null,
      decided_by_user_id: null,
      decision_remarks: null,
      cancelled_at: null,
      ...input
    };
    this.store.leaveRequests.push(request);
    return request;
  }

  addWfhRequest(input: Omit<WfhRequest, "id" | "created_at" | "updated_at" | "version" | "deleted_at" | "decided_at" | "decided_by_user_id" | "decision_remarks" | "cancelled_at">): WfhRequest {
    const now = nowIso();
    const request: WfhRequest = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      decided_at: null,
      decided_by_user_id: null,
      decision_remarks: null,
      cancelled_at: null,
      ...input
    };
    this.store.wfhRequests.push(request);
    return request;
  }

  findLeaveRequest(id: UUID): LeaveRequest {
    const request = this.store.leaveRequests.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!request) {
      throw notFound("Leave request not found", { id });
    }
    return request;
  }

  findWfhRequest(id: UUID): WfhRequest {
    const request = this.store.wfhRequests.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!request) {
      throw notFound("WFH request not found", { id });
    }
    return request;
  }

  updateLeaveRequestVersioned(id: UUID, expectedVersion: number, mutator: (request: LeaveRequest) => void): LeaveRequest {
    const request = this.findLeaveRequest(id);
    if (request.version !== expectedVersion) {
      throw conflict("Leave request was modified by another actor.", { aggregate: "leave_request", id });
    }
    mutator(request);
    request.version += 1;
    request.updated_at = nowIso();
    return request;
  }

  updateWfhRequestVersioned(id: UUID, expectedVersion: number, mutator: (request: WfhRequest) => void): WfhRequest {
    const request = this.findWfhRequest(id);
    if (request.version !== expectedVersion) {
      throw conflict("WFH request was modified by another actor.", { aggregate: "wfh_request", id });
    }
    mutator(request);
    request.version += 1;
    request.updated_at = nowIso();
    return request;
  }

  listLeaveRequests(query: LeaveWfhListQuery = {}): LeaveRequest[] {
    return this.store.leaveRequests
      .filter((request) => {
        if (request.deleted_at) {
          return false;
        }
        if (query.userIds && !query.userIds.has(request.employee_user_id)) {
          return false;
        }
        if (query.status && request.status !== query.status) {
          return false;
        }
        return overlaps({ from: request.date_from, to: request.date_to }, query.dateFrom, query.dateTo);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  listWfhRequests(query: LeaveWfhListQuery = {}): WfhRequest[] {
    return this.store.wfhRequests
      .filter((request) => {
        if (request.deleted_at) {
          return false;
        }
        if (query.userIds && !query.userIds.has(request.employee_user_id)) {
          return false;
        }
        if (query.status && request.status !== query.status) {
          return false;
        }
        return overlaps({ from: request.date_from, to: request.date_to }, query.dateFrom, query.dateTo);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  activeRequestsForUser(userId: UUID, dateFrom: string, dateTo: string): Array<LeaveRequest | WfhRequest> {
    const activeStatuses = new Set<string>([
      LeaveRequestStatuses.PendingManager,
      LeaveRequestStatuses.Approved
    ]);
    return [
      ...this.listLeaveRequests({ userIds: new Set([userId]) }),
      ...this.listWfhRequests({ userIds: new Set([userId]) })
    ].filter((request) => activeStatuses.has(request.status) && overlaps({ from: request.date_from, to: request.date_to }, dateFrom, dateTo));
  }

  findHoliday(id: UUID, companyId: UUID): Holiday | null {
    return this.store.holidays.find((candidate) => candidate.id === id && candidate.company_id === companyId && !candidate.deleted_at) ?? null;
  }

  upsertHoliday(id: UUID, input: Omit<Holiday, "id" | "created_at" | "updated_at" | "version" | "deleted_at"> & { expected_version?: number }): Holiday {
    const existing = this.findHoliday(id, input.company_id ?? "");
    const duplicate = this.store.holidays.find(
      (candidate) =>
        candidate.id !== id &&
        candidate.company_id === input.company_id &&
        !candidate.deleted_at &&
        candidate.region === input.region &&
        candidate.holiday_date === input.holiday_date &&
        candidate.name.toLowerCase() === input.name.toLowerCase()
    );
    if (duplicate) {
      throw conflict("Holiday with the same name, date, and region already exists.", { holiday_id: duplicate.id });
    }
    const now = nowIso();
    if (!existing) {
      const holiday: Holiday = {
        id,
        company_id: input.company_id,
        name: input.name,
        holiday_date: input.holiday_date,
        region: input.region,
        optional: input.optional,
        version: 1,
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
      this.store.holidays.push(holiday);
      return holiday;
    }
    if (input.expected_version && existing.version !== input.expected_version) {
      throw conflict("Holiday was modified by another actor.", { aggregate: "holiday", id });
    }
    existing.name = input.name;
    existing.holiday_date = input.holiday_date;
    existing.region = input.region;
    existing.optional = input.optional;
    existing.version += 1;
    existing.updated_at = now;
    return existing;
  }

  listHolidays(companyId: UUID, year?: number): Holiday[] {
    return this.store.holidays
      .filter((holiday) => {
        if (holiday.deleted_at) {
          return false;
        }
        if (holiday.company_id !== companyId) {
          return false;
        }
        return year ? holiday.holiday_date.startsWith(`${year}-`) : true;
      })
      .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date) || a.name.localeCompare(b.name));
  }
}
