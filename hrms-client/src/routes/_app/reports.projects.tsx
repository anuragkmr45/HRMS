import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useProjects } from "@/lib/projects-store";
import {
  PROJECT_STATUS_LABEL,
  BILLING_TYPE_LABEL,
  type Project,
  type ProjectMember,
} from "@/lib/mock/projects";
import { inDateRange } from "@/lib/reports/utils";
import { useProjectsReport } from "@/domains/reports/queries";
import { asArray, asRecord, numberValue, text, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/reports/projects")({ component: ProjectReports });

interface AllocRow {
  id: string;
  project: string;
  code: string;
  employee: string;
  role: string;
  allocation: number;
  billable: boolean;
  manager: string;
}
interface HistoryRow {
  id: string;
  employee: string;
  project: string;
  code: string;
  role: string;
  from: string;
  to?: string;
}

function ProjectReports() {
  const { projects } = useProjects();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const reportQuery = useProjectsReport(apiMode);
  const report = asRecord(reportQuery.data);
  const sourceProjects = apiMode ? (reportQuery.data?.items ?? []).map(projectFromApi) : projects;

  const allocations: AllocRow[] = useMemo(
    () =>
      apiMode
        ? asArray(report.allocation_rows).map(allocationFromApi)
        : sourceProjects.flatMap((p) =>
            p.members.map((m: ProjectMember) => ({
              id: p.id + "-" + m.id,
              project: p.name,
              code: p.code,
              employee: m.name,
              role: m.role,
              allocation: m.allocation,
              billable: m.billable,
              manager: p.manager,
            })),
          ),
    [apiMode, report.allocation_rows, sourceProjects],
  );

  const history: HistoryRow[] = useMemo(
    () =>
      apiMode
        ? asArray(report.history_rows).map(historyFromApi)
        : sourceProjects.flatMap((p) =>
            p.members.map((m) => ({
              id: p.id + "-h-" + m.id,
              employee: m.name,
              project: p.name,
              code: p.code,
              role: m.role,
              from: m.startDate,
              to: m.endDate,
            })),
          ),
    [apiMode, report.history_rows, sourceProjects],
  );

  const utilizationRows = useMemo(() => {
    const m = new Map<string, { used: number; billable: number }>();
    for (const a of allocations) {
      const cur = m.get(a.employee) ?? { used: 0, billable: 0 };
      cur.used += a.allocation;
      if (a.billable) cur.billable += a.allocation;
      m.set(a.employee, cur);
    }
    if (apiMode) return asArray(report.utilization_rows).map(utilizationFromApi);
    return Array.from(m.entries()).map(([e, v]) => ({
      id: e,
      employee: e,
      used: v.used,
      billable: v.billable,
      mix: v.used ? Math.round((v.billable / v.used) * 100) : 0,
    }));
  }, [allocations, apiMode, report.utilization_rows]);

  if (apiMode && reportQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading project reports...</div>;
  }

  if (apiMode && reportQuery.error instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{reportQuery.error.message}</div>;
  }

  const projCols: Column<Project>[] = [
    {
      key: "code",
      header: "Code",
      render: (p) => <span className="font-mono text-xs">{p.code}</span>,
    },
    {
      key: "name",
      header: "Project",
      render: (p) => <span className="font-medium">{p.name}</span>,
    },
    { key: "client", header: "Client", render: (p) => <span className="text-sm">{p.client}</span> },
    {
      key: "manager",
      header: "Manager",
      render: (p) => <span className="text-sm">{p.manager}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (p) => <span className="text-sm">{p.department}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusBadge status={p.status} label={PROJECT_STATUS_LABEL[p.status]} />,
    },
    {
      key: "billing",
      header: "Billing",
      render: (p) => (
        <StatusBadge status={p.billingType} label={BILLING_TYPE_LABEL[p.billingType]} />
      ),
    },
    {
      key: "team",
      header: "Team",
      render: (p) => <span className="font-mono">{p.members.length}</span>,
    },
  ];

  const filterProjects = (f: { from: string; to: string; department: string; status: string }) =>
    sourceProjects.filter((p) => {
      if (!inDateRange(p.startDate, undefined, f.to) || !inDateRange(p.endDate, f.from, undefined))
        return false;
      if (f.department !== "all" && p.department !== f.department) return false;
      if (f.status !== "all" && p.status !== f.status) return false;
      return true;
    });

  const statusOptions = (
    Object.keys(PROJECT_STATUS_LABEL) as (keyof typeof PROJECT_STATUS_LABEL)[]
  ).map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }));

  return (
    <Tabs defaultValue="master">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="master">Project Master</TabsTrigger>
        <TabsTrigger value="alloc">Allocation</TabsTrigger>
        <TabsTrigger value="util">Utilization</TabsTrigger>
        <TabsTrigger value="history">Employee History</TabsTrigger>
        <TabsTrigger value="billable">Billable Mix</TabsTrigger>
        <TabsTrigger value="cost">Cost Summary</TabsTrigger>
      </TabsList>

      <TabsContent value="master" className="mt-4">
        <ReportShell
          title="Project Master"
          description="Every project across the organisation."
          facets={{ showDepartment: true, showStatus: true, statusOptions }}
          summary={[
            { label: "Projects", value: sourceProjects.length, tone: "info" },
            {
              label: "Active",
              value: sourceProjects.filter((p) => p.status === "active").length,
              tone: "success",
            },
          ]}
          build={(f) => filterProjects(f)}
          columns={projCols}
          searchKeys={["name", "code", "client", "manager"]}
          exportName="project-master"
        />
      </TabsContent>

      <TabsContent value="alloc" className="mt-4">
        <ReportShell<AllocRow>
          title="Project Allocation"
          description="Member allocations across projects."
          facets={{
            showEmployee: true,
            employeePool: Array.from(new Set(allocations.map((a) => a.employee))),
          }}
          build={(f) =>
            allocations.filter((a) => f.employee === "all" || a.employee === f.employee)
          }
          columns={[
            {
              key: "code",
              header: "Code",
              render: (a) => <span className="font-mono text-xs">{a.code}</span>,
            },
            {
              key: "project",
              header: "Project",
              render: (a) => <span className="font-medium">{a.project}</span>,
            },
            {
              key: "employee",
              header: "Employee",
              render: (a) => <span className="text-sm">{a.employee}</span>,
            },
            {
              key: "role",
              header: "Role",
              render: (a) => <span className="text-sm">{a.role}</span>,
            },
            {
              key: "allocation",
              header: "Allocation %",
              render: (a) => <span className="font-mono">{a.allocation}%</span>,
            },
            {
              key: "billable",
              header: "Billable",
              render: (a) => <StatusBadge status={a.billable ? "billable" : "non_billable"} />,
            },
            {
              key: "manager",
              header: "PM",
              render: (a) => <span className="text-sm">{a.manager}</span>,
            },
          ]}
          searchKeys={["employee", "project", "code"]}
          exportName="project-allocation"
        />
      </TabsContent>

      <TabsContent value="util" className="mt-4">
        <ReportShell
          title="Project Utilization"
          description="Allocation totals per employee, with billable share."
          build={() => utilizationRows}
          columns={[
            {
              key: "employee",
              header: "Employee",
              render: (r) => <span className="font-medium">{r.employee}</span>,
            },
            {
              key: "used",
              header: "Allocated %",
              render: (r) => (
                <span
                  className={`font-mono ${r.used > 100 ? "text-destructive" : "text-foreground"}`}
                >
                  {r.used}%
                </span>
              ),
            },
            {
              key: "billable",
              header: "Billable %",
              render: (r) => <span className="font-mono">{r.billable}%</span>,
            },
            {
              key: "mix",
              header: "Billable mix",
              render: (r) => <span className="font-mono text-success">{r.mix}%</span>,
            },
          ]}
          searchKeys={["employee"]}
          exportName="utilization"
        />
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <ReportShell<HistoryRow>
          title="Employee Project History"
          description="Past and current project assignments by employee."
          facets={{
            showEmployee: true,
            employeePool: Array.from(new Set(history.map((h) => h.employee))),
          }}
          build={(f) => history.filter((h) => f.employee === "all" || h.employee === f.employee)}
          columns={[
            {
              key: "employee",
              header: "Employee",
              render: (h) => <span className="font-medium">{h.employee}</span>,
            },
            {
              key: "code",
              header: "Code",
              render: (h) => <span className="font-mono text-xs">{h.code}</span>,
            },
            {
              key: "project",
              header: "Project",
              render: (h) => <span className="text-sm">{h.project}</span>,
            },
            {
              key: "role",
              header: "Role",
              render: (h) => <span className="text-sm">{h.role}</span>,
            },
            {
              key: "from",
              header: "From",
              render: (h) => <span className="font-mono text-xs">{h.from}</span>,
            },
            {
              key: "to",
              header: "To",
              render: (h) => <span className="font-mono text-xs">{h.to ?? "—"}</span>,
            },
          ]}
          searchKeys={["employee", "project"]}
          exportName="project-history"
        />
      </TabsContent>

      <TabsContent value="billable" className="mt-4">
        <ReportShell
          title="Billable vs Non-Billable"
          description="Project-level split of billable vs non-billable allocation."
          build={() =>
            sourceProjects.map((p) => {
              const total = p.members.reduce((s, m) => s + m.allocation, 0);
              const bill = p.members
                .filter((m) => m.billable)
                .reduce((s, m) => s + m.allocation, 0);
              return {
                id: p.id,
                code: p.code,
                name: p.name,
                total,
                billable: bill,
                nonBillable: total - bill,
                mix: total ? Math.round((bill / total) * 100) : 0,
              };
            })
          }
          columns={[
            {
              key: "code",
              header: "Code",
              render: (r) => <span className="font-mono text-xs">{r.code}</span>,
            },
            {
              key: "name",
              header: "Project",
              render: (r) => <span className="font-medium">{r.name}</span>,
            },
            {
              key: "billable",
              header: "Billable %",
              render: (r) => <span className="font-mono">{r.billable}%</span>,
            },
            {
              key: "nonBillable",
              header: "Non-billable %",
              render: (r) => <span className="font-mono">{r.nonBillable}%</span>,
            },
            {
              key: "mix",
              header: "Billable mix",
              render: (r) => <span className="font-mono text-success">{r.mix}%</span>,
            },
          ]}
          searchKeys={["name", "code"]}
          exportName="billable-mix"
        />
      </TabsContent>

      <TabsContent value="cost" className="mt-4">
        <ReportShell
          title="Project Cost Summary"
          description="Estimated cost per project based on team allocation and standard monthly capacity."
          build={() =>
            apiMode && asArray(report.cost_rows).length > 0
              ? asArray(report.cost_rows).map(costFromApi)
              : sourceProjects.map((p) => ({
                  id: p.id,
                  code: p.code,
                  name: p.name,
                  client: p.client,
                  team: p.members.length,
                  estCost: p.members.length * 16000,
                  status: p.status,
                }))
          }
          columns={[
            {
              key: "code",
              header: "Code",
              render: (r) => <span className="font-mono text-xs">{r.code}</span>,
            },
            {
              key: "name",
              header: "Project",
              render: (r) => <span className="font-medium">{r.name}</span>,
            },
            {
              key: "client",
              header: "Client",
              render: (r) => <span className="text-sm">{r.client}</span>,
            },
            {
              key: "team",
              header: "Team",
              render: (r) => <span className="font-mono">{r.team}</span>,
            },
            {
              key: "estCost",
              header: "Est. cost (USD)",
              render: (r) => <span className="font-mono">${r.estCost.toLocaleString()}</span>,
            },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <StatusBadge status={r.status} label={PROJECT_STATUS_LABEL[r.status]} />
              ),
            },
          ]}
          searchKeys={["name", "code", "client"]}
          exportName="project-cost"
        />
      </TabsContent>
    </Tabs>
  );
}

function projectFromApi(value: unknown): Project {
  const row = asRecord(value);
  const status = text(row.status, "planned");
  return {
    id: text(row.id),
    version: numberValue(row.version, 1),
    code: text(row.code),
    name: text(row.name),
    client: text(row.client),
    type: text(row.project_type, "client") as Project["type"],
    billingType: text(row.billing, "fixed") as Project["billingType"],
    manager: text(row.manager),
    managerUserId: text(row.manager_user_id),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    status: (status === "archived" ? "completed" : status) as Project["status"],
    health: text(row.health, "green") as Project["health"],
    description: "",
    estimatedHours: numberValue(row.estimated_hours),
    actualHours: numberValue(row.actual_hours),
    estimatedBudget: numberValue(row.estimated_budget),
    actualSpend: numberValue(row.actual_spend),
    techStack: [],
    priority: text(row.priority, "medium") as Project["priority"],
    costCenter: "",
    department: text(row.department, "—"),
    departmentId: text(row.department_id),
    members: [],
    modules: [],
    documents: [],
    audit: [],
  };
}

function allocationFromApi(value: unknown): AllocRow {
  const row = asRecord(value);
  return {
    id: text(row.id),
    project: text(row.project),
    code: text(row.code),
    employee: text(row.employee),
    role: text(row.role),
    allocation: numberValue(row.allocation),
    billable: row.billable === true,
    manager: text(row.manager),
  };
}

function historyFromApi(value: unknown): HistoryRow {
  const row = asRecord(value);
  return {
    id: text(row.id),
    employee: text(row.employee),
    project: text(row.project),
    code: text(row.code),
    role: text(row.role),
    from: text(row.from),
    to: text(row.to),
  };
}

function utilizationFromApi(value: unknown) {
  const row = asRecord(value);
  return {
    id: text(row.id, text(row.employee)),
    employee: text(row.employee),
    used: numberValue(row.used),
    billable: numberValue(row.billable),
    mix: numberValue(row.mix),
  };
}

function costFromApi(value: unknown) {
  const row = asRecord(value);
  return {
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    client: text(row.client),
    team: numberValue(row.team),
    estCost: numberValue(row.estimated_budget),
    status: (text(row.status, "planned") === "archived"
      ? "completed"
      : text(row.status, "planned")) as Project["status"],
  };
}
