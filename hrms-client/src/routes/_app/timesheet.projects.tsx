import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StatCard,
  DataTable,
  type Column,
  StatusBadge,
  EmptyState,
  UserAvatar,
} from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { useProjects } from "@/lib/projects-store";
import { useTimesheets } from "@/lib/timesheets-store";
import { DEMO_LAST_WEEK, previousWeekStartIso } from "@/lib/mock/timesheets";
import { useTimesheetProjectSummary } from "@/domains/timesheets";
import {
  asArray,
  asRecord,
  isApiEnabled,
  isUuid,
  numberValue,
  pageItems,
  text,
  userFacingErrorMessage,
} from "@/shared/api";
import { Briefcase, Clock, DollarSign, AlertTriangle, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/timesheet/projects")({
  component: ProjectViewPage,
});

interface MemberRow {
  id: string;
  name: string;
  employeeId: string;
  total: number;
  billable: number;
  nonBillable: number;
  submitted: boolean;
}

function cycleEnd(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function ProjectViewPage() {
  const { user, activeRole } = useAuth();
  const { projects } = useProjects();
  const { entries, weeks, loading, error } = useTimesheets();
  const apiMode = isApiEnabled();

  const isAdmin = activeRole === "main_admin";
  const myProjects = useMemo(
    () => (isAdmin ? projects : projects.filter((p) => p.manager === user?.name)),
    [projects, user, isAdmin],
  );

  const [projectId, setProjectId] = useState<string>(myProjects[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState<string>(() =>
    apiMode ? previousWeekStartIso() : DEMO_LAST_WEEK,
  );

  const project = myProjects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!projectId && myProjects[0]) setProjectId(myProjects[0].id);
  }, [myProjects, projectId]);

  const summaryQuery = useTimesheetProjectSummary(
    {
      page: 1,
      page_size: 50,
      cycle_start: weekStart,
      cycle_end: cycleEnd(weekStart),
      ...(project?.code ? { project_code: project.code } : {}),
      ...(projectId && isUuid(projectId) ? { project_id: projectId } : {}),
    },
    apiMode && Boolean(project),
  );

  const weekOptions = useMemo(() => {
    const set = new Set(weeks.map((w) => w.weekStart));
    return Array.from(set).sort().reverse();
  }, [weeks]);

  const projectEntries = useMemo(
    () => entries.filter((e) => e.projectId === projectId && e.weekStart === weekStart),
    [entries, projectId, weekStart],
  );

  const memberRows: MemberRow[] = useMemo(() => {
    if (apiMode) {
      const item = asRecord(
        pageItems(summaryQuery.data).find((row) => {
          const projectRecord = asRecord(asRecord(row).project);
          return (
            text(projectRecord.id) === projectId ||
            text(projectRecord.project_code) === project?.code
          );
        }) ?? pageItems(summaryQuery.data)[0],
      );
      return asArray(item.members).map((value) => {
        const row = asRecord(value);
        const userRecord = asRecord(row.user);
        const total = numberValue(row.total_hours, 0);
        const billable = numberValue(row.billable_hours, 0);
        return {
          id: text(row.id, text(userRecord.id, "member")),
          name: text(userRecord.full_name, "Employee"),
          employeeId: text(userRecord.employee_code ?? row.employee_user_id, "EMP"),
          total,
          billable,
          nonBillable: numberValue(row.non_billable_hours, Math.max(0, total - billable)),
          submitted: Boolean(row.submitted),
        };
      });
    }
    if (!project) return [];
    return project.members.map((m) => {
      const mEntries = projectEntries.filter((e) => e.employeeId === m.employeeId);
      const total = mEntries.reduce((s, e) => s + e.hours, 0);
      const billable = mEntries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
      const submitted = weeks.some(
        (w) =>
          w.employeeId === m.employeeId &&
          w.weekStart === weekStart &&
          (w.status === "approved" || w.status === "pending"),
      );
      return {
        id: m.id,
        name: m.name,
        employeeId: m.employeeId,
        total,
        billable,
        nonBillable: total - billable,
        submitted,
      };
    });
  }, [apiMode, project, projectEntries, projectId, summaryQuery.data, weeks, weekStart]);

  const totals = useMemo(() => {
    const total = memberRows.reduce((s, r) => s + r.total, 0);
    const billable = memberRows.reduce((s, r) => s + r.billable, 0);
    const missing = memberRows.filter((r) => !r.submitted).length;
    return { total, billable, nonBillable: total - billable, missing };
  }, [memberRows]);

  const cols: Column<MemberRow>[] = [
    {
      key: "name",
      header: "Member",
      render: (r) => (
        <UserAvatar
          name={r.name}
          email={r.employeeId}
          tone="primary"
          showMeta
          subtitle={r.employeeId}
        />
      ),
    },
    {
      key: "total",
      header: "Hours",
      render: (r) => <span className="text-sm font-semibold">{r.total.toFixed(1)}h</span>,
    },
    {
      key: "mix",
      header: "Billable mix",
      render: (r) => {
        const pct = r.total ? Math.round((r.billable / r.total) * 100) : 0;
        return (
          <div className="w-32">
            <div className="flex items-center justify-between text-xs">
              <span>{pct}%</span>
              <span className="text-muted-foreground">
                {r.billable.toFixed(1)} / {r.total.toFixed(1)}h
              </span>
            </div>
            <Progress value={pct} className="mt-1 h-1.5" />
          </div>
        );
      },
    },
    {
      key: "submitted",
      header: "Submission",
      render: (r) =>
        r.submitted ? (
          <StatusBadge status="approved" label="Submitted" />
        ) : (
          <StatusBadge status="rejected" label="Missing" />
        ),
    },
  ];

  if (myProjects.length === 0) {
    return (
      <Card className="rounded-2xl border-border/60 p-10">
        <EmptyState
          icon={Briefcase}
          title="No projects to review"
          description="You don't manage any projects yet."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <div className="min-w-0 lg:min-w-[200px] lg:flex-1">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Project
            </p>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {myProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 lg:min-w-[180px]">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Week
            </p>
            <Select value={weekStart} onValueChange={setWeekStart}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((w) => (
                  <SelectItem key={w} value={w}>
                    Week of{" "}
                    {new Date(w).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">Timesheets could not be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {userFacingErrorMessage(error, "Timesheets could not be loaded.")}
          </p>
        </Card>
      )}
      {summaryQuery.error instanceof Error && (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            Project summary could not be loaded
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {userFacingErrorMessage(summaryQuery.error, "Project summary could not be loaded.")}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total hours"
          value={totals.total.toFixed(1)}
          icon={Clock}
          tone="primary"
          hint="This week"
        />
        <StatCard
          label="Billable"
          value={totals.billable.toFixed(1)}
          icon={DollarSign}
          tone="success"
          hint={`${totals.total ? Math.round((totals.billable / totals.total) * 100) : 0}% mix`}
        />
        <StatCard
          label="Non-billable"
          value={totals.nonBillable.toFixed(1)}
          icon={Activity}
          tone="warning"
          hint="Internal time"
        />
        <StatCard
          label="Missing submissions"
          value={totals.missing}
          icon={AlertTriangle}
          tone={totals.missing ? "destructive" : "info"}
          hint="Of project members"
        />
      </div>

      <DataTable
        columns={cols}
        rows={memberRows}
        searchKeys={["name", "employeeId"]}
        loading={loading || (apiMode && summaryQuery.isLoading)}
        emptyTitle="No team members"
      />
    </div>
  );
}
