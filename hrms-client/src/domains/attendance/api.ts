import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export type AttendancePunchEventType = "check_in" | "break_start" | "break_end" | "check_out";
export type AttendanceRegularizationEventType = Extract<
  AttendancePunchEventType,
  "check_in" | "check_out"
>;
export type AttendanceRegularizationOperation = "add" | "replace" | "void";
export type AttendanceRegularizationStatus = "pending" | "approved" | "returned" | "rejected";

export type AttendanceRegularizationItem =
  | {
      operation: "add";
      event_type: AttendanceRegularizationEventType;
      occurred_at: string;
    }
  | {
      operation: "replace";
      target_punch_event_id: string;
      event_type: AttendanceRegularizationEventType;
      occurred_at: string;
    }
  | {
      operation: "void";
      target_punch_event_id: string;
    };

export interface AttendanceQuery extends PageQuery {
  date?: string;
  date_from?: string;
  date_to?: string;
  month?: string;
  user_id?: string;
  department_id?: string;
  status?: string;
  exception_type?: string;
}

export interface AttendancePunchBody extends ApiRecord {
  event_type: AttendancePunchEventType;
  occurred_at?: string;
  work_mode?: "office" | "remote" | "wfh" | "field";
  source?: "web" | "mobile" | "kiosk" | "admin";
  metadata?: ApiRecord;
}

export interface AttendanceRegularizationBody extends ApiRecord {
  work_date: string;
  reason: string;
  items: AttendanceRegularizationItem[];
}

export interface AttendanceRegularizationItemRecord extends ApiRecord {
  id: string;
  ordinal: number;
  operation: AttendanceRegularizationOperation;
  target_punch_event_id: string | null;
  event_type: AttendanceRegularizationEventType | null;
  occurred_at: string | null;
}

export interface AttendanceRegularizationRecord extends ApiRecord {
  id: string;
  work_date: string;
  reason: string;
  status: AttendanceRegularizationStatus;
  version: number;
  items: AttendanceRegularizationItemRecord[];
  approver?: ApiRecord | null;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceRegularizationDecisionBody extends ExpectedVersionBody {
  decision: "approve" | "reject" | "return";
  remarks?: string;
}

export interface AttendanceExportBody extends ApiRecord {
  filters?: ApiRecord;
  columns?: string[];
  format?: "csv" | "xlsx" | "json";
}

export const attendanceApi = {
  punch(input: AttendancePunchBody) {
    return apiRequest<ApiRecord>("/api/v1/attendance/punches", {
      method: "POST",
      body: input,
    });
  },
  listMyPunches(query: AttendanceQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/attendance/punches/my", { query });
  },
  mySummary(query: AttendanceQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/attendance/summary/my", { query });
  },
  teamSummary(query: AttendanceQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/attendance/summary/team", { query });
  },
  monthlyCalendar(query: AttendanceQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/attendance/calendar/monthly", { query });
  },
  dailyCalendar(query: AttendanceQuery = {}) {
    return apiRequest<
      PaginatedResponse<ApiRecord> & {
        summary?: ApiRecord;
        exceptions?: ApiRecord[];
        totals?: ApiRecord;
      }
    >("/api/v1/attendance/calendar/daily", { query });
  },
  createRegularization(input: AttendanceRegularizationBody) {
    return apiRequest<AttendanceRegularizationRecord>("/api/v1/attendance/regularizations", {
      method: "POST",
      body: input,
    });
  },
  listMyRegularizations(query: AttendanceQuery = {}) {
    return apiRequest<PaginatedResponse<AttendanceRegularizationRecord>>(
      "/api/v1/attendance/regularizations/my",
      { query },
    );
  },
  managerRegularizationQueue(query: AttendanceQuery = {}) {
    return apiRequest<
      PaginatedResponse<AttendanceRegularizationRecord> & { queue_counts?: ApiRecord }
    >("/api/v1/attendance/regularizations/queue/manager", { query });
  },
  decideRegularization(id: string, input: AttendanceRegularizationDecisionBody) {
    return apiRequest<AttendanceRegularizationRecord>(
      `/api/v1/attendance/regularizations/${id}/decision`,
      {
        method: "POST",
        body: input,
      },
    );
  },
  listExceptions(query: AttendanceQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { totals?: ApiRecord }>(
      "/api/v1/attendance/exceptions",
      { query },
    );
  },
  createExport(input: AttendanceExportBody) {
    return apiRequest<ApiRecord>("/api/v1/attendance/exports", {
      method: "POST",
      body: input,
    });
  },
};
