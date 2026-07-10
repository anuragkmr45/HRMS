import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useEmployees } from "@/lib/employees-store";
import { inDateRange } from "@/lib/reports/utils";
import { useAttendanceReport } from "@/domains/reports/queries";
import { asRecord, numberValue, text, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/reports/attendance")({ component: AttendanceReports });

interface AttRow {
  id: string;
  date: string;
  employee: string;
  department: string;
  status: "present" | "late" | "absent" | "wfh" | "leave";
  inTime: string;
  outTime: string;
  hours: number;
  note?: string;
}

// Deterministic synth so values are stable across renders
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function buildAttendance(employees: { id: string; name: string; department: string }[]): AttRow[] {
  const out: AttRow[] = [];
  const today = new Date();
  for (let d = 0; d < 30; d++) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    if (day.getDay() === 0 || day.getDay() === 6) continue; // skip weekends
    const iso = day.toISOString().slice(0, 10);
    for (const e of employees) {
      const r = hash(e.id + iso) % 100;
      let status: AttRow["status"] = "present";
      let inTime = "09:05";
      let outTime = "18:10";
      let hours = 9;
      if (r < 5) {
        status = "absent";
        inTime = "";
        outTime = "";
        hours = 0;
      } else if (r < 12) {
        status = "leave";
        inTime = "";
        outTime = "";
        hours = 0;
      } else if (r < 22) {
        status = "wfh";
      } else if (r < 35) {
        status = "late";
        const mins = (r % 50) + 15;
        inTime = `09:${mins.toString().padStart(2, "0")}`;
        hours = 8.5;
      }
      out.push({
        id: e.id + "-" + iso,
        date: iso,
        employee: e.name,
        department: e.department,
        status,
        inTime,
        outTime,
        hours,
        note: status === "late" ? `Late · ${(r % 50) + 15} min` : undefined,
      });
    }
  }
  return out;
}

function AttendanceReports() {
  const { employees } = useEmployees();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const reportQuery = useAttendanceReport(apiMode);
  const localRows = useMemo(
    () =>
      buildAttendance(employees.map((e) => ({ id: e.id, name: e.name, department: e.department }))),
    [employees],
  );
  const all = apiMode ? (reportQuery.data?.items ?? []).map(attendanceFromApi) : localRows;

  if (apiMode && reportQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading attendance reports...</div>;
  }

  if (apiMode && reportQuery.error instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{reportQuery.error.message}</div>;
  }

  const baseFilter = (
    rows: AttRow[],
    f: { from: string; to: string; department: string; employee: string; status: string },
  ) =>
    rows.filter((r) => {
      if (!inDateRange(r.date, f.from, f.to)) return false;
      if (f.department !== "all" && r.department !== f.department) return false;
      if (f.employee !== "all" && r.employee !== f.employee) return false;
      if (f.status !== "all" && r.status !== f.status) return false;
      return true;
    });

  const cols: Column<AttRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="font-mono text-xs">{r.date}</span>,
    },
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
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "inTime",
      header: "In",
      render: (r) => <span className="font-mono text-sm">{r.inTime || "—"}</span>,
    },
    {
      key: "outTime",
      header: "Out",
      render: (r) => <span className="font-mono text-sm">{r.outTime || "—"}</span>,
    },
    {
      key: "hours",
      header: "Hours",
      render: (r) => <span className="font-mono text-sm">{r.hours.toFixed(1)}</span>,
    },
    {
      key: "note",
      header: "Note",
      render: (r) => <span className="text-xs text-muted-foreground">{r.note ?? "—"}</span>,
    },
  ];

  const statusOptions = ["present", "late", "absent", "wfh", "leave"].map((s) => ({
    value: s,
    label: s,
  }));

  return (
    <Tabs defaultValue="daily">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="daily">Daily Attendance</TabsTrigger>
        <TabsTrigger value="late">Late Arrivals</TabsTrigger>
        <TabsTrigger value="early">Early Departures</TabsTrigger>
        <TabsTrigger value="absent">Absenteeism</TabsTrigger>
        <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
        <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
      </TabsList>

      <TabsContent value="daily" className="mt-4">
        <ReportShell
          title="Daily Attendance"
          description="Day-wise attendance with in/out times and worked hours."
          facets={{ showDepartment: true, showEmployee: true, showStatus: true, statusOptions }}
          summary={[
            { label: "Records", value: all.length, tone: "info" },
            {
              label: "Present today",
              value: all.filter((r) => r.date === all[0]?.date && r.status === "present").length,
              tone: "success",
            },
            {
              label: "WFH today",
              value: all.filter((r) => r.date === all[0]?.date && r.status === "wfh").length,
              tone: "info",
            },
            {
              label: "Absent today",
              value: all.filter((r) => r.date === all[0]?.date && r.status === "absent").length,
              tone: "destructive",
            },
          ]}
          build={(f) => baseFilter(all, f)}
          columns={cols}
          searchKeys={["employee", "department"]}
          exportName="daily-attendance"
        />
      </TabsContent>

      <TabsContent value="late" className="mt-4">
        <ReportShell
          title="Late Arrivals"
          description="Employees who clocked in after 09:15."
          facets={{ showDepartment: true, showEmployee: true }}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.status === "late"),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="late-arrivals"
        />
      </TabsContent>

      <TabsContent value="early" className="mt-4">
        <ReportShell
          title="Early Departures"
          description="Employees who logged off before 17:30."
          facets={{ showDepartment: true, showEmployee: true }}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.hours > 0 && r.hours < 8),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="early-departures"
        />
      </TabsContent>

      <TabsContent value="absent" className="mt-4">
        <ReportShell
          title="Absenteeism Report"
          description="Unplanned absences without leave approval."
          facets={{ showDepartment: true, showEmployee: true }}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.status === "absent"),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="absenteeism"
        />
      </TabsContent>

      <TabsContent value="monthly" className="mt-4">
        <MonthlySummary all={all} />
      </TabsContent>

      <TabsContent value="exceptions" className="mt-4">
        <ReportShell
          title="Attendance Exceptions"
          description="Late arrivals, missed punches and partial days."
          facets={{ showDepartment: true, showEmployee: true }}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.status === "late" || r.status === "absent"),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="attendance-exceptions"
        />
      </TabsContent>
    </Tabs>
  );
}

function attendanceFromApi(value: unknown): AttRow {
  const record = asRecord(value);
  return {
    id: text(record.id),
    date: text(record.date),
    employee: text(record.employee),
    department: text(record.department, "—"),
    status: text(record.status, "present") as AttRow["status"],
    inTime: text(record.in_time),
    outTime: text(record.out_time),
    hours: numberValue(record.hours),
    note: text(record.note),
  };
}

function MonthlySummary({ all }: { all: AttRow[] }) {
  const summary = useMemo(() => {
    const m = new Map<
      string,
      { present: number; late: number; absent: number; wfh: number; leave: number; total: number }
    >();
    for (const r of all) {
      const cur = m.get(r.employee) ?? {
        present: 0,
        late: 0,
        absent: 0,
        wfh: 0,
        leave: 0,
        total: 0,
      };
      cur[r.status] += 1;
      cur.total += 1;
      m.set(r.employee, cur);
    }
    return Array.from(m.entries()).map(([emp, v]) => ({
      id: emp,
      employee: emp,
      ...v,
      attendance: Math.round(((v.present + v.late + v.wfh) / Math.max(1, v.total)) * 100),
    }));
  }, [all]);

  return (
    <ReportShell
      title="Monthly Attendance Summary"
      description="Per-employee attendance percentage over the last 30 days."
      build={() => summary}
      columns={[
        {
          key: "employee",
          header: "Employee",
          render: (r) => <span className="font-medium">{r.employee}</span>,
        },
        {
          key: "present",
          header: "Present",
          render: (r) => <span className="font-mono">{r.present}</span>,
        },
        { key: "late", header: "Late", render: (r) => <span className="font-mono">{r.late}</span> },
        {
          key: "absent",
          header: "Absent",
          render: (r) => <span className="font-mono">{r.absent}</span>,
        },
        { key: "wfh", header: "WFH", render: (r) => <span className="font-mono">{r.wfh}</span> },
        {
          key: "leave",
          header: "Leave",
          render: (r) => <span className="font-mono">{r.leave}</span>,
        },
        {
          key: "attendance",
          header: "Attendance %",
          render: (r) => (
            <span
              className={`font-mono ${r.attendance < 80 ? "text-destructive" : "text-success"}`}
            >
              {r.attendance}%
            </span>
          ),
        },
      ]}
      searchKeys={["employee"]}
      exportName="monthly-attendance"
    />
  );
}
