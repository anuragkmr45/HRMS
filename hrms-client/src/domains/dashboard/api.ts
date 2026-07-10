import { apiRequest } from "@/shared/api";

export interface DashboardMetric {
  key: string;
  label: string;
  value: number | string;
  unit: "count" | "money" | "hours" | "status";
  source:
    | "core"
    | "expenses"
    | "documents"
    | "assets"
    | "timesheets"
    | "attendance"
    | "leave_wfh"
    | "notifications"
    | "outbox"
    | "system";
}

export interface DashboardSummary {
  generated_at: string;
  scope: {
    actor_user_id: string;
    employee_code: string;
    primary_role: string;
    roles: string[];
    visibility: "all" | "self_and_descendants";
  };
  cards: DashboardMetric[];
  workforce: {
    visible_employees: number;
    active_employees: number;
    inactive_employees: number;
    new_joiners_30d: number;
    departments: Array<{
      department_id: string;
      department_code: string;
      name: string;
      active_employees: number;
    }>;
  };
  approvals: {
    expense_manager_pending: number;
    expense_finance_pending: number;
    expense_total_pending: number;
    timesheet_pending: number;
    leave_pending: number;
    wfh_pending: number;
    document_verification_pending: number;
  };
  operations: {
    assets_total: number;
    assets_assigned: number;
    assets_recovery_pending: number;
    notifications_pending: number;
    outbox_pending: number;
  };
  workload: {
    work_segments_total: number;
    submitted_hours_total: string;
    timesheet_submissions_total: number;
    timesheet_submissions_approved: number;
    timesheet_submissions_returned: number;
  };
  attention: DashboardMetric[];
  unavailable_features: Array<{
    key: string;
    label: string;
    status: "not_implemented";
    notes: string;
  }>;
}

export const dashboardApi = {
  summary() {
    return apiRequest<DashboardSummary>("/api/v1/dashboard/summary");
  },
};
