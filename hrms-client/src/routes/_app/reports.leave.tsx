import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import {
  useLeave,
  LEAVE_TYPE_LABEL,
  HOLIDAYS,
  LEAVE_BALANCES,
  type LeaveRequest,
  type Holiday,
} from "@/lib/leave-store";
import { inDateRange } from "@/lib/reports/utils";
import { useLeaveWfhReport } from "@/domains/reports/queries";
import { asArray, asRecord, numberValue, text, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/reports/leave")({ component: LeaveReports });

function LeaveReports() {
  const { requests } = useLeave();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const reportQuery = useLeaveWfhReport(apiMode);
  const report = asRecord(reportQuery.data);
  const sourceRequests = apiMode
    ? (reportQuery.data?.items ?? []).map(leaveRequestFromApi)
    : requests;
  const apiBalanceRows = asArray(report.balance_rows).map((value) => {
    const row = asRecord(value);
    const leaveType = text(row.leave_type, text(row.type)) as keyof typeof LEAVE_TYPE_LABEL;
    return {
      id: text(row.id, leaveType),
      type: LEAVE_TYPE_LABEL[leaveType] ?? text(row.type),
      used: numberValue(row.used),
      total: numberValue(row.total),
      remaining: row.remaining === null ? 0 : numberValue(row.remaining),
    };
  });
  const apiHolidayRows = asArray(report.holiday_rows).map((value) => {
    const row = asRecord(value);
    return {
      id: text(row.id),
      name: text(row.name),
      date: text(row.date),
      region: text(row.region),
      optional: row.optional === true,
    } satisfies Holiday;
  });

  if (apiMode && reportQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading leave reports...</div>;
  }

  if (apiMode && reportQuery.error instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{reportQuery.error.message}</div>;
  }

  const filter = (
    rows: LeaveRequest[],
    f: { from: string; to: string; department: string; employee: string; status: string },
    kind?: "leave" | "wfh",
  ) =>
    rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (!inDateRange(r.fromDate, f.from, f.to)) return false;
      if (f.department !== "all" && r.department !== f.department) return false;
      if (f.employee !== "all" && r.employee !== f.employee) return false;
      if (f.status !== "all" && r.status !== f.status) return false;
      return true;
    });

  const cols: Column<LeaveRequest>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "employee",
      header: "Employee",
      render: (r) => <span className="font-medium">{r.employee}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (r) => <span className="text-sm">{r.department}</span>,
    },
    {
      key: "leaveType",
      header: "Type",
      render: (r) => (
        <span className="text-sm">{r.leaveType ? LEAVE_TYPE_LABEL[r.leaveType] : "WFH"}</span>
      ),
    },
    {
      key: "fromDate",
      header: "From",
      render: (r) => <span className="font-mono text-xs">{r.fromDate}</span>,
    },
    {
      key: "toDate",
      header: "To",
      render: (r) => <span className="font-mono text-xs">{r.toDate}</span>,
    },
    {
      key: "duration",
      header: "Days",
      render: (r) => <span className="font-mono">{r.duration}</span>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const statusOptions = [
    "draft",
    "submitted",
    "pending_manager",
    "approved",
    "rejected",
    "cancelled",
  ].map((s) => ({ value: s, label: s.replace("_", " ") }));

  const balanceRows =
    apiMode && apiBalanceRows.length > 0
      ? apiBalanceRows
      : LEAVE_BALANCES.map((b) => ({
          id: b.type,
          type: LEAVE_TYPE_LABEL[b.type],
          used: b.used,
          total: b.total,
          remaining: b.total - b.used,
        }));

  return (
    <Tabs defaultValue="balance">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="balance">Leave Balance</TabsTrigger>
        <TabsTrigger value="applied">Leave Applied</TabsTrigger>
        <TabsTrigger value="decisions">Approved / Rejected</TabsTrigger>
        <TabsTrigger value="wfh">WFH Report</TabsTrigger>
        <TabsTrigger value="holidays">Holiday Calendar</TabsTrigger>
      </TabsList>

      <TabsContent value="balance" className="mt-4">
        <ReportShell
          title="Leave Balance"
          description="Per-type leave balances for the current cycle."
          build={() => balanceRows}
          columns={[
            {
              key: "type",
              header: "Leave type",
              render: (r) => <span className="font-medium">{r.type}</span>,
            },
            {
              key: "used",
              header: "Used",
              render: (r) => <span className="font-mono">{r.used}</span>,
            },
            {
              key: "total",
              header: "Total",
              render: (r) => <span className="font-mono">{r.total}</span>,
            },
            {
              key: "remaining",
              header: "Remaining",
              render: (r) => <span className="font-mono text-success">{r.remaining}</span>,
            },
          ]}
          searchKeys={["type"]}
          exportName="leave-balance"
        />
      </TabsContent>

      <TabsContent value="applied" className="mt-4">
        <ReportShell
          title="Leave Applied"
          description="Every leave application across the workforce."
          facets={{
            showDepartment: true,
            showEmployee: true,
            showStatus: true,
            statusOptions,
            employeePool: Array.from(new Set(sourceRequests.map((r) => r.employee))),
          }}
          summary={[
            {
              label: "Applications",
              value: sourceRequests.filter((r) => r.kind === "leave").length,
              tone: "info",
            },
          ]}
          build={(f) => filter(sourceRequests, f, "leave")}
          columns={cols}
          searchKeys={["employee", "id"]}
          exportName="leave-applied"
        />
      </TabsContent>

      <TabsContent value="decisions" className="mt-4">
        <ReportShell
          title="Leave Approved / Rejected"
          description="Decision register for leave requests."
          facets={{
            showDepartment: true,
            showEmployee: true,
            showStatus: true,
            statusOptions,
            employeePool: Array.from(new Set(sourceRequests.map((r) => r.employee))),
          }}
          summary={[
            {
              label: "Approved",
              value: sourceRequests.filter((r) => r.status === "approved").length,
              tone: "success",
            },
            {
              label: "Rejected",
              value: sourceRequests.filter((r) => r.status === "rejected").length,
              tone: "destructive",
            },
          ]}
          build={(f) =>
            filter(
              sourceRequests.filter((r) => r.status === "approved" || r.status === "rejected"),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee", "id"]}
          exportName="leave-decisions"
        />
      </TabsContent>

      <TabsContent value="wfh" className="mt-4">
        <ReportShell
          title="WFH Report"
          description="Work-from-home applications by status."
          facets={{
            showDepartment: true,
            showEmployee: true,
            showStatus: true,
            statusOptions,
            employeePool: Array.from(new Set(sourceRequests.map((r) => r.employee))),
          }}
          build={(f) => filter(sourceRequests, f, "wfh")}
          columns={cols}
          searchKeys={["employee", "id"]}
          exportName="wfh"
        />
      </TabsContent>

      <TabsContent value="holidays" className="mt-4">
        <ReportShell
          title="Holiday Calendar"
          description="Public and optional holidays for the year."
          build={() =>
            apiMode && apiHolidayRows.length > 0 ? apiHolidayRows : (HOLIDAYS as Holiday[])
          }
          columns={[
            {
              key: "name",
              header: "Holiday",
              render: (h) => <span className="font-medium">{h.name}</span>,
            },
            {
              key: "date",
              header: "Date",
              render: (h) => <span className="font-mono text-xs">{h.date}</span>,
            },
            {
              key: "region",
              header: "Region",
              render: (h) => <span className="text-sm">{h.region}</span>,
            },
            {
              key: "optional",
              header: "Type",
              render: (h) => (
                <StatusBadge
                  status={h.optional ? "pending" : "active"}
                  label={h.optional ? "Optional" : "Mandatory"}
                />
              ),
            },
          ]}
          searchKeys={["name", "region"]}
          exportName="holidays"
        />
      </TabsContent>
    </Tabs>
  );
}

function leaveRequestFromApi(value: unknown): LeaveRequest {
  const row = asRecord(value);
  const kind = text(row.kind, "leave") as LeaveRequest["kind"];
  return {
    id: text(row.request_code, text(row.id)),
    kind,
    employee: text(row.employee),
    department: text(row.department, "—"),
    manager: "—",
    leaveType:
      kind === "leave" ? (text(row.leave_type, "casual") as LeaveRequest["leaveType"]) : undefined,
    fromDate: text(row.from_date),
    toDate: text(row.to_date),
    halfDay: false,
    duration: numberValue(row.duration),
    reason: "",
    projectRef: text(row.project_ref),
    status: text(row.status, "pending_manager") as LeaveRequest["status"],
    remarks: text(row.decision_remarks),
    createdAt: text(row.created_at),
    expectedVersion: numberValue(row.version, 1),
  };
}
