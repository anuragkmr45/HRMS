import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useTimesheets } from "@/lib/timesheets-store";
import { useTimesheetProductivitySummary, useTimesheetProjectSummary } from "@/domains/timesheets";
import { asArray, asRecord, isApiEnabled, numberValue, pageItems, text } from "@/shared/api";
import { useTimesheetsReport } from "@/domains/reports/queries";
import {
  TIMESHEET_STATUS_LABEL,
  type TimesheetEntryStatus,
  type TimesheetEntry,
  type TimesheetWeek,
} from "@/lib/mock/timesheets";
import { inDateRange } from "@/lib/reports/utils";

export const Route = createFileRoute("/_app/reports/timesheet")({ component: TimesheetReports });

function TimesheetReports() {
  const { entries, weeks } = useTimesheets();
  const apiMode = isApiEnabled();
  const reportQuery = useTimesheetsReport(apiMode);
  const productivityQuery = useTimesheetProductivitySummary(
    { date_from: "2026-01-01", date_to: "2026-12-31", group_by: "employee" },
    apiMode,
  );
  const projectSummaryQuery = useTimesheetProjectSummary(
    { page: 1, page_size: 100, date_from: "2026-01-01", date_to: "2026-12-31" },
    apiMode,
  );
  const report = asRecord(reportQuery.data);
  const sourceWeeks = apiMode ? (reportQuery.data?.items ?? []).map(weekFromReportApi) : weeks;
  const sourceEntries = apiMode ? (reportQuery.data?.items ?? []).map(entryFromReportApi) : entries;

  const filterEntries = (
    f: { from: string; to: string; department: string; employee: string; status: string },
    status?: string[],
  ) =>
    sourceEntries.filter((e) => {
      if (!inDateRange(e.date, f.from, f.to)) return false;
      if (f.employee !== "all" && e.employeeName !== f.employee) return false;
      const week = sourceWeeks.find(
        (w) => w.employeeId === e.employeeId && w.weekStart === e.weekStart,
      );
      if (status && week && !status.includes(week.status)) return false;
      if (f.department !== "all" && week && week.department !== f.department) return false;
      return true;
    });

  const entryCols: Column<TimesheetEntry>[] = [
    {
      key: "date",
      header: "Date",
      render: (e) => <span className="font-mono text-xs">{e.date}</span>,
    },
    {
      key: "employeeName",
      header: "Employee",
      render: (e) => <span className="font-medium">{e.employeeName}</span>,
    },
    {
      key: "projectCode",
      header: "Project",
      render: (e) => (
        <span className="text-sm">
          {e.projectCode} · {e.projectName}
        </span>
      ),
    },
    { key: "task", header: "Task", render: (e) => <span className="text-sm">{e.task}</span> },
    {
      key: "hours",
      header: "Hours",
      render: (e) => <span className="font-mono">{e.hours.toFixed(1)}</span>,
    },
    {
      key: "billable",
      header: "Billable",
      render: (e) => <StatusBadge status={e.billable ? "billable" : "non_billable"} />,
    },
  ];

  const weekCols: Column<TimesheetWeek>[] = [
    {
      key: "weekStart",
      header: "Week of",
      render: (w) => <span className="font-mono text-xs">{w.weekStart}</span>,
    },
    {
      key: "employeeName",
      header: "Employee",
      render: (w) => <span className="font-medium">{w.employeeName}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (w) => <span className="text-sm">{w.department}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (w) => <StatusBadge status={w.status} label={TIMESHEET_STATUS_LABEL[w.status]} />,
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (w) => <span className="text-xs text-muted-foreground">{w.submittedAt ?? "—"}</span>,
    },
    {
      key: "remarks",
      header: "Remarks",
      render: (w) => <span className="text-xs text-muted-foreground">{w.remarks ?? "—"}</span>,
    },
  ];

  const productivity = useMemo(() => {
    if (apiMode && asArray(report.productivity_rows).length > 0) {
      return asArray(report.productivity_rows).map((value) => {
        const row = asRecord(value);
        const hours = numberValue(row.total_hours);
        return {
          id: text(row.id, text(row.employee)),
          employee: text(row.employee),
          hours,
          billable: Math.round((hours * numberValue(row.billable_mix)) / 1000) / 10,
          util: numberValue(row.billable_mix),
        };
      });
    }
    if (apiMode && productivityQuery.data) {
      return asArray(asRecord(productivityQuery.data).breakdown).map((value) => {
        const row = asRecord(value);
        const hours = numberValue(row.total_hours, 0);
        const billable = numberValue(row.billable_hours, 0);
        return {
          id: text(row.id, text(row.label, "employee")),
          employee: text(row.label, "Employee"),
          hours,
          billable,
          util: numberValue(row.billable_percent, hours ? Math.round((billable / hours) * 100) : 0),
        };
      });
    }
    const m = new Map<string, { hours: number; billable: number }>();
    for (const e of sourceEntries) {
      const cur = m.get(e.employeeName) ?? { hours: 0, billable: 0 };
      cur.hours += e.hours;
      if (e.billable) cur.billable += e.hours;
      m.set(e.employeeName, cur);
    }
    return Array.from(m.entries()).map(([emp, v]) => ({
      id: emp,
      employee: emp,
      hours: v.hours,
      billable: v.billable,
      util: v.hours ? Math.round((v.billable / v.hours) * 100) : 0,
    }));
  }, [apiMode, productivityQuery.data, report.productivity_rows, sourceEntries]);

  const projectHours = useMemo(() => {
    if (apiMode && asArray(report.project_rows).length > 0) {
      return asArray(report.project_rows).map((value) => {
        const row = asRecord(value);
        return {
          id: text(row.id, text(row.label)),
          code: text(row.label, "PROJECT"),
          project: text(row.label, "Project"),
          hours: numberValue(row.value),
          billable: 0,
        };
      });
    }
    if (apiMode && projectSummaryQuery.data) {
      return pageItems(projectSummaryQuery.data).map((value) => {
        const row = asRecord(value);
        const project = asRecord(row.project);
        const totals = asRecord(row.totals);
        return {
          id: text(project.project_code, text(project.id, "project")),
          code: text(project.project_code, "PROJECT"),
          project: text(project.name, "Project"),
          hours: numberValue(totals.total_hours, 0),
          billable: numberValue(totals.billable_hours, 0),
        };
      });
    }
    const m = new Map<string, { hours: number; billable: number; project: string }>();
    for (const e of sourceEntries) {
      const k = e.projectCode;
      const cur = m.get(k) ?? { hours: 0, billable: 0, project: e.projectName };
      cur.hours += e.hours;
      if (e.billable) cur.billable += e.hours;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([code, v]) => ({
      id: code,
      code,
      project: v.project,
      hours: v.hours,
      billable: v.billable,
    }));
  }, [apiMode, projectSummaryQuery.data, report.project_rows, sourceEntries]);

  const statusOptions = Object.entries(TIMESHEET_STATUS_LABEL).map(([value, label]) => ({
    value,
    label,
  }));
  const reportEmployeePool = Array.from(new Set(sourceEntries.map((e) => e.employeeName)));

  if (
    apiMode &&
    (reportQuery.isLoading || productivityQuery.isLoading || projectSummaryQuery.isLoading)
  ) {
    return <div className="p-6 text-sm text-muted-foreground">Loading timesheet reports...</div>;
  }

  if (apiMode) {
    const error = reportQuery.error ?? productivityQuery.error ?? projectSummaryQuery.error;
    if (error instanceof Error) {
      return <div className="p-6 text-sm text-destructive">{error.message}</div>;
    }
  }

  return (
    <Tabs defaultValue="missing">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="missing">Missing</TabsTrigger>
        <TabsTrigger value="submitted">Submitted Hours</TabsTrigger>
        <TabsTrigger value="approved">Approved Hours</TabsTrigger>
        <TabsTrigger value="rejected">Rejected</TabsTrigger>
        <TabsTrigger value="prod">Productivity</TabsTrigger>
        <TabsTrigger value="proj">Project-wise</TabsTrigger>
      </TabsList>

      <TabsContent value="missing" className="mt-4">
        <ReportShell
          title="Missing Timesheet"
          description="Weeks where the timesheet is still in draft."
          facets={{
            showDepartment: true,
            showEmployee: true,
            employeePool: Array.from(new Set(sourceWeeks.map((w) => w.employeeName))),
          }}
          build={(f) =>
            sourceWeeks.filter(
              (w) =>
                w.status === "draft" &&
                (f.department === "all" || w.department === f.department) &&
                (f.employee === "all" || w.employeeName === f.employee),
            )
          }
          columns={weekCols}
          searchKeys={["employeeName", "department"]}
          exportName="missing-timesheets"
        />
      </TabsContent>

      <TabsContent value="submitted" className="mt-4">
        <ReportShell
          title="Submitted Hours"
          description="Entries belonging to submitted or pending weeks."
          facets={{
            showDepartment: true,
            showEmployee: true,
            showStatus: true,
            statusOptions,
            employeePool: reportEmployeePool,
          }}
          build={(f) => filterEntries(f, ["submitted", "pending"])}
          columns={entryCols}
          searchKeys={["employeeName", "projectCode", "task"]}
          exportName="submitted-hours"
        />
      </TabsContent>

      <TabsContent value="approved" className="mt-4">
        <ReportShell
          title="Approved Hours"
          description="Approved entries by employee and project."
          facets={{ showDepartment: true, showEmployee: true, employeePool: reportEmployeePool }}
          build={(f) => filterEntries(f, ["approved"])}
          columns={entryCols}
          searchKeys={["employeeName", "projectCode"]}
          exportName="approved-hours"
        />
      </TabsContent>

      <TabsContent value="rejected" className="mt-4">
        <ReportShell
          title="Rejected Timesheets"
          description="Weeks rejected or returned by managers."
          facets={{ showDepartment: true }}
          build={(f) =>
            sourceWeeks.filter(
              (w) =>
                (w.status === "rejected" || w.status === "returned") &&
                (f.department === "all" || w.department === f.department),
            )
          }
          columns={weekCols}
          searchKeys={["employeeName"]}
          exportName="rejected-timesheets"
        />
      </TabsContent>

      <TabsContent value="prod" className="mt-4">
        <ReportShell
          title="Employee Productivity"
          description="Hours logged and billable share."
          build={() => productivity}
          columns={[
            {
              key: "employee",
              header: "Employee",
              render: (r) => <span className="font-medium">{r.employee}</span>,
            },
            {
              key: "hours",
              header: "Hours",
              render: (r) => <span className="font-mono">{r.hours.toFixed(1)}</span>,
            },
            {
              key: "billable",
              header: "Billable",
              render: (r) => <span className="font-mono">{r.billable.toFixed(1)}</span>,
            },
            {
              key: "util",
              header: "Billable %",
              render: (r) => <span className="font-mono text-success">{r.util}%</span>,
            },
          ]}
          searchKeys={["employee"]}
          exportName="productivity"
        />
      </TabsContent>

      <TabsContent value="proj" className="mt-4">
        <ReportShell
          title="Project-wise Hours"
          description="Total and billable hours by project."
          build={() => projectHours}
          columns={[
            {
              key: "code",
              header: "Code",
              render: (r) => <span className="font-mono text-xs">{r.code}</span>,
            },
            {
              key: "project",
              header: "Project",
              render: (r) => <span className="font-medium">{r.project}</span>,
            },
            {
              key: "hours",
              header: "Hours",
              render: (r) => <span className="font-mono">{r.hours.toFixed(1)}</span>,
            },
            {
              key: "billable",
              header: "Billable",
              render: (r) => <span className="font-mono">{r.billable.toFixed(1)}</span>,
            },
          ]}
          searchKeys={["project", "code"]}
          exportName="project-hours"
        />
      </TabsContent>
    </Tabs>
  );
}

function weekFromReportApi(value: unknown): TimesheetWeek {
  const row = asRecord(value);
  return {
    id: text(row.id),
    employeeId: text(row.employee_user_id),
    employeeName: text(row.employee),
    department: text(row.department, "—"),
    weekStart: text(row.cycle_start),
    status: normalizeTimesheetStatus(text(row.status)),
    version: numberValue(row.version, 1),
    totalHours: numberValue(row.total_hours),
    billableHours: numberValue(row.billable_hours),
    nonBillableHours: numberValue(row.non_billable_hours),
    submittedAt: text(row.updated_at),
  };
}

function entryFromReportApi(value: unknown): TimesheetEntry {
  const row = asRecord(value);
  return {
    id: `${text(row.id)}-summary`,
    employeeId: text(row.employee_user_id),
    employeeName: text(row.employee),
    weekStart: text(row.cycle_start),
    date: text(row.cycle_end, text(row.cycle_start)),
    projectId: "summary",
    projectCode: "SUMMARY",
    projectName: `${numberValue(row.project_count)} project(s)`,
    task: "Timesheet cycle summary",
    billable: numberValue(row.billable_hours) > 0,
    hours: numberValue(row.total_hours),
    description: text(row.status),
  };
}

function normalizeTimesheetStatus(value: string): TimesheetEntryStatus {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized.includes("approved")) return "approved";
  if (normalized.includes("rejected")) return "rejected";
  if (normalized.includes("returned")) return "returned";
  if (normalized.includes("pending")) return "pending";
  if (normalized.includes("submitted")) return "submitted";
  return "draft";
}
