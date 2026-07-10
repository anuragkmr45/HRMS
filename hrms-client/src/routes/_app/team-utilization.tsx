import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader,
  StatCard,
  StatusBadge,
  DataTable,
  type Column,
  ActionButton,
  EmptyState,
  UserAvatar,
} from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { useEmployees } from "@/lib/employees-store";
import { useProjects } from "@/lib/projects-store";
import { useTimesheets } from "@/lib/timesheets-store";
import { DEMO_LAST_WEEK } from "@/lib/mock/timesheets";
import { useTeamUtilizationSummary } from "@/domains/projects";
import { asArray, asRecord, isApiEnabled, numberValue, text } from "@/shared/api";
import {
  Activity,
  Users,
  Clock,
  DollarSign,
  Coffee,
  TrendingUp,
  AlertTriangle,
  Sofa,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/team-utilization")({
  head: () => ({ meta: [{ title: "Team Utilization — Hawkaii HRMS" }] }),
  component: UtilizationPage,
});

const CAPACITY = 40;

interface CapRow {
  id: string;
  name: string;
  department: string;
  designation: string;
  available: number;
  allocated: number;
  submitted: number;
  billable: number;
  nonBillable: number;
  utilization: number;
  status: "bench" | "underutilized" | "healthy" | "overloaded";
  projects: { code: string; name: string; allocation: number }[];
  skills: string[];
}

function UtilizationPage() {
  const { user, activeRole } = useAuth();
  const { employees } = useEmployees();
  const { projects } = useProjects();
  const { entries } = useTimesheets();
  const apiMode = isApiEnabled();
  const utilizationQuery = useTeamUtilizationSummary({ page: 1, page_size: 100 }, apiMode);

  const isMain = activeRole === "main_admin";
  const isPM = activeRole === "project_manager";
  const isManager = activeRole === "manager";

  const scopedEmployees = useMemo(() => {
    if (isMain || activeRole === "hr_admin")
      return employees.filter((e) => e.status !== "exited" && e.status !== "inactive");
    if (isManager) return employees.filter((e) => e.manager === user?.name);
    if (isPM) {
      const ids = new Set<string>();
      projects
        .filter((p) => p.manager === user?.name)
        .forEach((p) => p.members.forEach((m) => ids.add(m.employeeId)));
      return employees.filter((e) => ids.has(e.id));
    }
    return employees.filter((e) => e.email === user?.email);
  }, [employees, projects, activeRole, user, isMain, isManager, isPM]);

  const localRows: CapRow[] = useMemo(() => {
    return scopedEmployees.map((e) => {
      const memberOf = projects
        .filter((p) => p.status !== "cancelled" && p.status !== "completed")
        .flatMap((p) =>
          p.members
            .filter((m) => m.employeeId === e.id)
            .map((m) => ({ code: p.code, name: p.name, allocation: m.allocation })),
        );
      const allocPct = memberOf.reduce((s, m) => s + m.allocation, 0);
      const allocated = (allocPct / 100) * CAPACITY;
      const submitted = entries
        .filter((x) => x.employeeId === e.id && x.weekStart === DEMO_LAST_WEEK)
        .reduce((s, x) => s + x.hours, 0);
      const utilization = Math.round((allocated / CAPACITY) * 100);
      let status: CapRow["status"] = "healthy";
      if (allocPct === 0) status = "bench";
      else if (allocPct < 50) status = "underutilized";
      else if (allocPct > 100) status = "overloaded";
      return {
        id: e.id,
        name: e.name,
        department: e.department,
        designation: e.designation,
        available: CAPACITY,
        allocated,
        submitted,
        billable: entries
          .filter((x) => x.employeeId === e.id && x.weekStart === DEMO_LAST_WEEK && x.billable)
          .reduce((s, x) => s + x.hours, 0),
        nonBillable: entries
          .filter((x) => x.employeeId === e.id && x.weekStart === DEMO_LAST_WEEK && !x.billable)
          .reduce((s, x) => s + x.hours, 0),
        utilization,
        status,
        projects: memberOf,
        skills: [e.designation, e.department],
      };
    });
  }, [scopedEmployees, projects, entries]);

  const apiRows: CapRow[] = useMemo(() => {
    return asArray(asRecord(utilizationQuery.data).employees).map((value) => {
      const row = asRecord(value);
      const userRecord = asRecord(row.user);
      const department = asRecord(row.department);
      const designation = asRecord(row.designation);
      return {
        id: text(userRecord.employee_code ?? userRecord.id, "EMP"),
        name: text(userRecord.full_name, "Employee"),
        department: text(department.name, "—"),
        designation: text(designation.title, "Employee"),
        available: numberValue(row.available_hours, CAPACITY),
        allocated: numberValue(row.allocated_hours, 0),
        submitted: numberValue(row.submitted_hours, 0),
        billable: numberValue(row.billable_hours, 0),
        nonBillable: numberValue(row.non_billable_hours, 0),
        utilization: numberValue(row.utilization_percent, 0),
        status: text(row.status, "healthy") as CapRow["status"],
        projects: asArray(row.projects).map((project) => {
          const projectRecord = asRecord(project);
          return {
            code: text(projectRecord.code, "PROJECT"),
            name: text(projectRecord.name, "Project"),
            allocation: numberValue(projectRecord.allocation_percent, 0),
          };
        }),
        skills: [text(designation.title, "Employee"), text(department.name, "—")],
      };
    });
  }, [utilizationQuery.data]);

  const rows = useMemo(
    () => (apiMode ? (utilizationQuery.data ? apiRows : []) : localRows),
    [apiMode, apiRows, localRows, utilizationQuery.data],
  );

  const stats = useMemo(() => {
    const cap = rows.length * CAPACITY;
    const allocated = rows.reduce((s, r) => s + r.allocated, 0);
    const submitted = rows.reduce((s, r) => s + r.submitted, 0);
    const billable = rows.reduce((s, r) => s + r.billable, 0);
    const nonBillable = rows.reduce((s, r) => s + r.nonBillable, 0);
    const avgUtil = rows.length
      ? Math.round(rows.reduce((s, r) => s + r.utilization, 0) / rows.length)
      : 0;
    const bench = rows.filter((r) => r.status === "bench").length;
    const overloaded = rows.filter((r) => r.status === "overloaded").length;
    return { cap, allocated, submitted, billable, nonBillable, avgUtil, bench, overloaded };
  }, [rows]);

  const handleExport = () => {
    const headers = [
      "Employee",
      "Department",
      "Designation",
      "Available",
      "Allocated",
      "Submitted",
      "Utilization %",
      "Status",
    ];
    const csvRows = rows.map((r) =>
      [
        r.name,
        r.department,
        r.designation,
        r.available,
        r.allocated.toFixed(1),
        r.submitted.toFixed(1),
        r.utilization,
        r.status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkaii-utilization-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported", { description: `${rows.length} rows exported.` });
  };

  const statusBadge = (s: CapRow["status"]) => {
    const map = {
      bench: { status: "inactive", label: "Bench" },
      underutilized: { status: "pending", label: "Underutilized" },
      healthy: { status: "active", label: "Healthy" },
      overloaded: { status: "rejected", label: "Overloaded" },
    } as const;
    return <StatusBadge status={map[s].status} label={map[s].label} />;
  };

  const capacityCols: Column<CapRow>[] = [
    {
      key: "name",
      header: "Employee",
      render: (r) => (
        <UserAvatar name={r.name} email={r.id} tone="primary" showMeta subtitle={r.designation} />
      ),
    },
    {
      key: "dept",
      header: "Department",
      render: (r) => <span className="text-xs">{r.department}</span>,
    },
    {
      key: "avail",
      header: "Available",
      render: (r) => <span className="text-sm">{r.available}h</span>,
    },
    {
      key: "alloc",
      header: "Allocated",
      render: (r) => <span className="text-sm font-semibold">{r.allocated.toFixed(1)}h</span>,
    },
    {
      key: "sub",
      header: "Submitted",
      render: (r) => <span className="text-sm">{r.submitted.toFixed(1)}h</span>,
    },
    {
      key: "util",
      header: "Utilization",
      render: (r) => {
        const tone =
          r.utilization > 100 ? "bg-destructive" : r.utilization < 50 ? "bg-info" : "bg-primary";
        return (
          <div className="w-32">
            <div className="flex items-center justify-between text-xs">
              <span className={cn("font-semibold", r.utilization > 100 && "text-destructive")}>
                {r.utilization}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full", tone)}
                style={{ width: `${Math.min(100, r.utilization)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
  ];

  const benchRows = rows.filter((r) => r.status === "bench");
  const overloadRows = rows.filter((r) => r.status === "overloaded");

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Team Utilization"
        description={
          utilizationQuery.isLoading
            ? "Loading utilization from Hawkaii HRMS."
            : utilizationQuery.error instanceof Error
              ? "Utilization data could not be loaded from the backend."
              : `Capacity, allocation and billability across ${rows.length} ${rows.length === 1 ? "person" : "people"}.`
        }
        actions={
          <ActionButton
            size="sm"
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExport}
          >
            Export
          </ActionButton>
        }
      />

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="bench">Bench ({benchRows.length})</TabsTrigger>
          <TabsTrigger value="overload">Overload ({overloadRows.length})</TabsTrigger>
          <TabsTrigger value="billable">Billable mix</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total capacity"
              value={`${stats.cap}h`}
              icon={Clock}
              tone="primary"
              hint={`${rows.length} × ${CAPACITY}h/wk`}
            />
            <StatCard
              label="Allocated"
              value={`${stats.allocated.toFixed(0)}h`}
              icon={Activity}
              tone="info"
              hint="Planned this week"
            />
            <StatCard
              label="Submitted"
              value={`${stats.submitted.toFixed(0)}h`}
              icon={TrendingUp}
              tone="success"
              hint="Last full week"
            />
            <StatCard
              label="Avg utilization"
              value={`${stats.avgUtil}%`}
              icon={Users}
              tone={stats.avgUtil > 90 ? "destructive" : stats.avgUtil < 50 ? "warning" : "primary"}
              hint="Across team"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Billable hours"
              value={`${stats.billable.toFixed(0)}h`}
              icon={DollarSign}
              tone="success"
              hint="Last week"
            />
            <StatCard
              label="Non-billable"
              value={`${stats.nonBillable.toFixed(0)}h`}
              icon={Coffee}
              tone="warning"
              hint="Internal time"
            />
            <StatCard
              label="On bench"
              value={stats.bench}
              icon={Sofa}
              tone={stats.bench ? "info" : "success"}
              hint="Available now"
            />
            <StatCard
              label="Overloaded"
              value={stats.overloaded}
              icon={AlertTriangle}
              tone={stats.overloaded ? "destructive" : "success"}
              hint=">100% allocation"
            />
          </div>
        </TabsContent>

        <TabsContent value="capacity">
          <DataTable
            columns={capacityCols}
            rows={rows}
            searchKeys={["name", "department", "designation"]}
            emptyTitle={
              utilizationQuery.error instanceof Error
                ? "Utilization could not load"
                : utilizationQuery.isLoading
                  ? "Loading utilization"
                  : "No team data"
            }
            emptyDescription={
              utilizationQuery.error instanceof Error
                ? utilizationQuery.error.message
                : utilizationQuery.isLoading
                  ? "Waiting for backend utilization analytics."
                  : undefined
            }
          />
        </TabsContent>

        <TabsContent value="bench">
          {benchRows.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={Users}
                title="No one on the bench"
                description="Everyone is allocated to at least one active project."
              />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {benchRows.map((r) => (
                <Card key={r.id} className="rounded-2xl border-border/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <UserAvatar
                      name={r.name}
                      email={r.id}
                      tone="info"
                      showMeta
                      subtitle={`${r.designation} · ${r.department}`}
                    />
                    {statusBadge(r.status)}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Available from</p>
                      <p className="font-semibold">Now</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Capacity</p>
                      <p className="font-semibold">{CAPACITY}h / week</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Skills
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {r.skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border bg-secondary/40 px-2 py-0.5 text-[11px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-primary-soft/50 p-2 text-[11px] text-primary">
                    Suggested fit: projects in {r.department}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="overload">
          {overloadRows.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={AlertTriangle}
                title="No one is overloaded"
                description="All allocations are within healthy limits."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {overloadRows.map((r) => (
                <Card key={r.id} className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <UserAvatar
                      name={r.name}
                      email={r.id}
                      tone="warning"
                      showMeta
                      subtitle={`${r.designation} · ${r.department}`}
                    />
                    <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground">
                      {r.utilization}% allocated
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {r.projects.map((p) => (
                      <div key={p.code} className="flex items-center justify-between text-xs">
                        <span>
                          <span className="font-mono font-semibold">{p.code}</span> · {p.name}
                        </span>
                        <span className="font-semibold">{p.allocation}%</span>
                      </div>
                    ))}
                    <Progress value={Math.min(100, r.utilization)} className="h-1.5" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="billable" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Billable"
              value={`${stats.billable.toFixed(0)}h`}
              icon={DollarSign}
              tone="success"
            />
            <StatCard
              label="Non-billable"
              value={`${stats.nonBillable.toFixed(0)}h`}
              icon={Coffee}
              tone="warning"
            />
            <StatCard
              label="Billable %"
              value={`${stats.submitted ? Math.round((stats.billable / stats.submitted) * 100) : 0}%`}
              icon={TrendingUp}
              tone="primary"
            />
          </div>
          <Card className="rounded-2xl border-border/60 p-5">
            <p className="mb-3 text-sm font-semibold">Billable vs non-billable</p>
            <div className="space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>Billable</span>
                  <span className="font-semibold text-success">{stats.billable.toFixed(0)}h</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-success"
                    style={{
                      width: `${stats.submitted ? (stats.billable / stats.submitted) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>Non-billable</span>
                  <span className="font-semibold text-warning-foreground dark:text-warning">
                    {stats.nonBillable.toFixed(0)}h
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-warning"
                    style={{
                      width: `${stats.submitted ? (stats.nonBillable / stats.submitted) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
          <DataTable
            columns={[
              {
                key: "name",
                header: "Employee",
                render: (r: CapRow) => (
                  <UserAvatar
                    name={r.name}
                    email={r.id}
                    tone="primary"
                    showMeta
                    subtitle={r.department}
                  />
                ),
              },
              {
                key: "sub",
                header: "Submitted",
                render: (r) => <span className="text-sm">{r.submitted.toFixed(1)}h</span>,
              },
              {
                key: "mix",
                header: "Billable mix",
                render: (r) => {
                  const billable = r.billable;
                  const pct = r.submitted ? Math.round((billable / r.submitted) * 100) : 0;
                  return (
                    <div className="w-32">
                      <div className="flex items-center justify-between text-xs">
                        <span>{pct}%</span>
                        <span className="text-muted-foreground">{billable.toFixed(1)}h</span>
                      </div>
                      <Progress value={pct} className="mt-1 h-1.5" />
                    </div>
                  );
                },
              },
            ]}
            rows={rows}
            searchKeys={["name", "department"]}
            emptyTitle="No utilization data"
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
