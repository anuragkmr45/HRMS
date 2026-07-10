import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useEmployees } from "@/lib/employees-store";
import { ROLE_LABELS } from "@/lib/auth";
import { inDateRange } from "@/lib/reports/utils";
import type { Employee } from "@/lib/mock/employees";
import { useHrEmployeeReport } from "@/domains/reports/queries";
import { asArray, asRecord, boolValue, text, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/reports/hr")({ component: HrReports });

function HrReports() {
  const { employees, departments } = useEmployees();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const reportQuery = useHrEmployeeReport(apiMode);
  const reportEmployees = apiMode
    ? (reportQuery.data?.items ?? []).map(employeeFromApi)
    : employees;
  const sourceEmployees = apiMode ? reportEmployees : employees;

  const empCols: Column<Employee>[] = [
    {
      key: "id",
      header: "Emp ID",
      render: (e) => <span className="font-mono text-xs">{e.id}</span>,
    },
    { key: "name", header: "Name", render: (e) => <span className="font-medium">{e.name}</span> },
    {
      key: "designation",
      header: "Designation",
      render: (e) => <span className="text-sm">{e.designation}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (e) => <span className="text-sm">{e.department}</span>,
    },
    {
      key: "manager",
      header: "Manager",
      render: (e) => <span className="text-sm">{e.manager}</span>,
    },
    {
      key: "location",
      header: "Location",
      render: (e) => <span className="text-sm">{e.location}</span>,
    },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status} /> },
    {
      key: "joinedAt",
      header: "Joined",
      render: (e) => <span className="text-xs text-muted-foreground">{e.joinedAt}</span>,
    },
  ];

  const filterEmployees = (
    f: { from: string; to: string; department: string; employee: string; status: string },
    dateField?: keyof Employee,
  ) =>
    sourceEmployees.filter((e) => {
      if (f.department !== "all" && e.department !== f.department) return false;
      if (f.employee !== "all" && e.name !== f.employee) return false;
      if (f.status !== "all" && e.status !== f.status) return false;
      if (dateField && !inDateRange(e[dateField] as string | undefined, f.from, f.to)) return false;
      return true;
    });

  const statusOptions = [
    "active",
    "probation",
    "confirmed",
    "notice_period",
    "exited",
    "onboarding",
    "invited",
    "draft",
  ].map((s) => ({ value: s, label: s.replace("_", " ") }));

  const deptHeadcount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of sourceEmployees) m.set(e.department, (m.get(e.department) ?? 0) + 1);
    return Array.from(m.entries()).map(([dept, count]) => ({ id: dept, dept, count }));
  }, [sourceEmployees]);

  const desigHeadcount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of sourceEmployees) m.set(e.designation, (m.get(e.designation) ?? 0) + 1);
    return Array.from(m.entries()).map(([d, c]) => ({ id: d, designation: d, count: c }));
  }, [sourceEmployees]);

  const roleAccess = useMemo(() => {
    return sourceEmployees.map((e) => ({
      id: e.id,
      name: e.name,
      department: e.department,
      roles: e.systemRoles.map((r) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r).join(", "),
      loginEnabled: e.loginEnabled,
      lastLoginAt: e.lastLoginAt ?? "—",
    }));
  }, [sourceEmployees]);

  if (apiMode && reportQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading HR reports...</div>;
  }

  if (apiMode && reportQuery.error instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{reportQuery.error.message}</div>;
  }

  return (
    <Tabs defaultValue="master">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="master">Employee Master</TabsTrigger>
        <TabsTrigger value="joiners">New Joiners</TabsTrigger>
        <TabsTrigger value="exits">Exit Report</TabsTrigger>
        <TabsTrigger value="dept">Department Headcount</TabsTrigger>
        <TabsTrigger value="desig">Designation Headcount</TabsTrigger>
        <TabsTrigger value="role">Role Access</TabsTrigger>
        <TabsTrigger value="onboarding">Onboarding Pending</TabsTrigger>
        <TabsTrigger value="notice">Notice Period</TabsTrigger>
      </TabsList>

      <TabsContent value="master" className="mt-4">
        <ReportShell
          title="Employee Master Report"
          description="Complete directory of employees with department, designation, and status."
          facets={{ showDepartment: true, showEmployee: true, showStatus: true, statusOptions }}
          summary={[
            { label: "Total employees", value: sourceEmployees.length, tone: "info" },
            {
              label: "Active",
              value: sourceEmployees.filter(
                (e) => e.status === "active" || e.status === "confirmed",
              ).length,
              tone: "success",
            },
            { label: "Departments", value: departments.length },
            {
              label: "On notice",
              value: sourceEmployees.filter((e) => e.status === "notice_period").length,
              tone: "warning",
            },
          ]}
          build={(f) => filterEmployees(f, "joinedAt")}
          columns={empCols}
          searchKeys={["name", "id", "department", "designation", "email"]}
          exportName="employee-master"
        />
      </TabsContent>

      <TabsContent value="joiners" className="mt-4">
        <ReportShell
          title="New Joiner Report"
          description="Employees joined within the selected date range."
          facets={{ showDepartment: true }}
          summary={[
            {
              label: "Joiners in range",
              value: sourceEmployees.filter((e) => inDateRange(e.joinedAt, undefined, undefined))
                .length,
              tone: "info",
            },
          ]}
          build={(f) => filterEmployees(f, "joinedAt")}
          columns={empCols}
          searchKeys={["name", "id"]}
          exportName="new-joiners"
        />
      </TabsContent>

      <TabsContent value="exits" className="mt-4">
        <ReportShell
          title="Exit Report"
          description="Employees with exited or notice-period status."
          facets={{ showDepartment: true }}
          summary={[
            {
              label: "Exited",
              value: sourceEmployees.filter((e) => e.status === "exited").length,
              tone: "destructive",
            },
            {
              label: "Serving notice",
              value: sourceEmployees.filter((e) => e.status === "notice_period").length,
              tone: "warning",
            },
          ]}
          build={(f) =>
            filterEmployees(f).filter((e) => e.status === "exited" || e.status === "notice_period")
          }
          columns={empCols}
          searchKeys={["name", "id"]}
          exportName="exits"
        />
      </TabsContent>

      <TabsContent value="dept" className="mt-4">
        <ReportShell
          title="Department Headcount"
          description="Total people in every department."
          summary={[{ label: "Departments", value: departments.length, tone: "info" }]}
          build={() => deptHeadcount}
          columns={[
            {
              key: "dept",
              header: "Department",
              render: (r) => <span className="font-medium">{r.dept}</span>,
            },
            {
              key: "count",
              header: "Headcount",
              render: (r) => <span className="font-mono">{r.count}</span>,
            },
          ]}
          searchKeys={["dept"]}
          exportName="department-headcount"
        />
      </TabsContent>

      <TabsContent value="desig" className="mt-4">
        <ReportShell
          title="Designation Headcount"
          description="Headcount grouped by designation."
          build={() => desigHeadcount}
          columns={[
            {
              key: "designation",
              header: "Designation",
              render: (r) => <span className="font-medium">{r.designation}</span>,
            },
            {
              key: "count",
              header: "Headcount",
              render: (r) => <span className="font-mono">{r.count}</span>,
            },
          ]}
          searchKeys={["designation"]}
          exportName="designation-headcount"
        />
      </TabsContent>

      <TabsContent value="role" className="mt-4">
        <ReportShell
          title="Role Access Report"
          description="System role assignments and login enablement."
          facets={{ showDepartment: true }}
          build={(f) =>
            roleAccess.filter((r) => f.department === "all" || r.department === f.department)
          }
          columns={[
            {
              key: "id",
              header: "Emp ID",
              render: (r) => <span className="font-mono text-xs">{r.id}</span>,
            },
            {
              key: "name",
              header: "Name",
              render: (r) => <span className="font-medium">{r.name}</span>,
            },
            {
              key: "department",
              header: "Department",
              render: (r) => <span className="text-sm">{r.department}</span>,
            },
            {
              key: "roles",
              header: "Roles",
              render: (r) => <span className="text-sm">{r.roles}</span>,
            },
            {
              key: "loginEnabled",
              header: "Login",
              render: (r) => <StatusBadge status={r.loginEnabled ? "active" : "inactive"} />,
            },
            {
              key: "lastLoginAt",
              header: "Last login",
              render: (r) => <span className="text-xs text-muted-foreground">{r.lastLoginAt}</span>,
            },
          ]}
          searchKeys={["name", "id", "department", "roles"]}
          exportName="role-access"
        />
      </TabsContent>

      <TabsContent value="onboarding" className="mt-4">
        <ReportShell
          title="Onboarding Pending Report"
          description="Employees in invited, draft or onboarding stage with pending steps."
          facets={{ showDepartment: true }}
          summary={[
            {
              label: "Onboarding",
              value: sourceEmployees.filter((e) => e.status === "onboarding").length,
              tone: "info",
            },
            {
              label: "Invited",
              value: sourceEmployees.filter((e) => e.status === "invited").length,
              tone: "info",
            },
          ]}
          build={(f) =>
            filterEmployees(f).filter((e) => ["invited", "draft", "onboarding"].includes(e.status))
          }
          columns={empCols}
          searchKeys={["name", "id"]}
          exportName="onboarding-pending"
        />
      </TabsContent>

      <TabsContent value="notice" className="mt-4">
        <ReportShell
          title="Notice Period Report"
          description="Employees serving notice with their notice days configured."
          facets={{ showDepartment: true }}
          build={(f) => filterEmployees(f).filter((e) => e.status === "notice_period")}
          columns={[
            ...empCols,
            {
              key: "noticeDays",
              header: "Notice days",
              render: (e) => <span className="font-mono text-sm">{e.noticeDays}</span>,
            },
          ]}
          searchKeys={["name", "id"]}
          exportName="notice-period"
        />
      </TabsContent>
    </Tabs>
  );
}

function employeeFromApi(value: unknown): Employee {
  const record = asRecord(value);
  const roles = asArray(record.roles)
    .map((role) => text(role))
    .filter(Boolean);
  const fullName = text(record.full_name);
  const [firstName = fullName, ...restName] = fullName.split(" ").filter(Boolean);
  return {
    id: text(record.employee_code, text(record.id)),
    apiId: text(record.id),
    firstName,
    lastName: restName.join(" ") || "—",
    name: fullName,
    email: text(record.email),
    phone: "",
    designation: text(record.designation_title),
    department: text(record.department_name),
    manager: text(record.manager_label, "—"),
    location: text(record.location, "—"),
    workMode: "office",
    status: text(record.status, "active") as Employee["status"],
    employmentType: "full_time",
    joinedAt: text(record.joined_on, ""),
    noticeDays: Number(record.notice_days ?? 0),
    shift: "General",
    systemRoles: roles,
    loginEnabled: boolValue(record.login_enabled),
    lastLoginAt: text(record.last_login_at, "—"),
    audit: [],
    roleHistory: [],
    documents: [],
  };
}
