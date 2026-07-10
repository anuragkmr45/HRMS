import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StatCard,
  StatusBadge,
  ActionButton,
  EmptyState,
  ApprovalTimeline,
} from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { useEmployees } from "@/lib/employees-store";
import { useProjects } from "@/lib/projects-store";
import { useTimesheets } from "@/lib/timesheets-store";
import { useTimesheetSelectors } from "@/domains/timesheets";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  asArray,
  asRecord,
  isApiEnabled,
  text,
  toastApiError,
  userFacingErrorMessage,
} from "@/shared/api";
import { isWorkingDate } from "@/lib/work-schedule";
import {
  TIMESHEET_STATUS_LABEL,
  startOfWeek,
  isoDate,
  addDays,
  currentWeekStartIso,
  type TimesheetEntry,
} from "@/lib/mock/timesheets";
import type { Role } from "@/lib/mock/roles";
import {
  Plus,
  Save,
  Send,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  DollarSign,
  Coffee,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/timesheet/")({
  component: MyTimesheetPage,
});

interface RowDraft {
  id: string;
  projectId: string;
  task: string;
  billable: boolean;
  description: string;
  hours: Record<string, number>; // date -> hours
}

const SELF_TIMESHEET_ROLES: Role[] = [
  "employee",
  "manager",
  "director",
  "project_manager",
  "finance_manager",
];

function MyTimesheetPage() {
  const { activeRole } = useAuth();

  if (!activeRole || !SELF_TIMESHEET_ROLES.includes(activeRole)) {
    if (activeRole === "main_admin" || activeRole === "hr_admin") {
      return <Navigate to="/timesheet/approvals" />;
    }

    return <Navigate to="/dashboard" />;
  }

  return <MyTimesheetSelfServicePage />;
}

function MyTimesheetSelfServicePage() {
  const { user } = useAuth();
  const { employees } = useEmployees();
  const { projects } = useProjects();
  const { entries, weeks, loading, error, saveWeekEntries, ensureWeek, setWeekStatus } =
    useTimesheets();
  const apiMode = isApiEnabled();
  const [savingAction, setSavingAction] = useState<"draft" | "submit" | null>(null);

  // Identify current employee from user (fall back to demo employee)
  const me = useMemo(() => {
    return (
      employees.find((e) => e.email === user?.email) ??
      employees.find((e) => e.id === "EMP-1042") ??
      employees[0] ?? {
        id: user?.id ?? "self",
        name: user?.name ?? "Employee",
        department: user?.department ?? "General",
        manager: "Manager",
      }
    );
  }, [employees, user]);

  const myProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.members.some((m) => m.employeeId === me.id) && p.status !== "cancelled",
      ),
    [projects, me],
  );

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => {
    const base = apiMode
      ? new Date(currentWeekStartIso() + "T00:00:00.000Z")
      : startOfWeek(new Date("2026-05-11T00:00:00.000Z"));
    return isoDate(addDays(base, weekOffset * 7));
  }, [apiMode, weekOffset]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => isoDate(addDays(new Date(weekStart), i))),
    [weekStart],
  );

  const selectorsQuery = useTimesheetSelectors(
    { include: "projects,tasks,cycles,approvers,rules", date: weekStart },
    apiMode,
  );

  const selectorProjects = useMemo(() => {
    const tasks = asArray(asRecord(selectorsQuery.data).tasks).map((value) => ({
      name: text(asRecord(value).name ?? asRecord(value).task_code, "General"),
    }));
    return asArray(asRecord(selectorsQuery.data).projects).map((value) => {
      const row = asRecord(value);
      return {
        id: text(row.id, text(row.project_code, "project")),
        code: text(row.project_code ?? row.code, "PROJECT"),
        name: text(row.name, "Project"),
        modules: tasks.length ? tasks : [{ name: "General" }],
      };
    });
  }, [selectorsQuery.data]);

  const timesheetProjects = selectorProjects.length ? selectorProjects : myProjects;
  const selectorRules = asRecord(asRecord(selectorsQuery.data).rules);
  const targetWeeklyHours = Number(selectorRules.target_weekly_hours ?? 40) || 40;
  const workingWeek = text(selectorRules.working_week, "Mon-Fri");
  const holidayDates = useMemo(
    () =>
      new Set(
        asArray(selectorRules.holiday_dates)
          .map((date) => text(date))
          .filter(Boolean),
      ),
    [selectorRules.holiday_dates],
  );

  const week = useMemo(
    () => ensureWeek(me.id, me.name, me.department, weekStart),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me.id, weekStart, weeks.length],
  );

  const weekEntries = useMemo(
    () => entries.filter((e) => e.employeeId === me.id && e.weekStart === weekStart),
    [entries, me.id, weekStart],
  );

  // Build row drafts from entries
  const buildRowsFromEntries = (): RowDraft[] => {
    const map = new Map<string, RowDraft>();
    for (const e of weekEntries) {
      const key = `${e.projectId}::${e.task}::${e.billable}`;
      if (!map.has(key)) {
        map.set(key, {
          id: "row_" + Math.random().toString(36).slice(2, 8),
          projectId: e.projectId,
          task: e.task,
          billable: e.billable,
          description: e.description,
          hours: {},
        });
      }
      map.get(key)!.hours[e.date] = e.hours;
    }
    return Array.from(map.values());
  };

  const [rows, setRows] = useState<RowDraft[]>([]);
  const [view, setView] = useState<"week" | "day">("week");
  const [activeDay, setActiveDay] = useState(weekDays[0]);
  const isMobile = useIsMobile();

  useEffect(() => {
    setRows(buildRowsFromEntries());
    setActiveDay(weekDays[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, weekEntries.length]);

  useEffect(() => {
    if (isMobile) setView("day");
  }, [isMobile]);

  const readOnly = week.status === "approved" || week.status === "pending";

  const totals = useMemo(() => {
    let total = 0;
    let billable = 0;
    let nonBillable = 0;
    for (const r of rows) {
      for (const d of weekDays) {
        const h = Number(r.hours[d]) || 0;
        total += h;
        if (r.billable) billable += h;
        else nonBillable += h;
      }
    }
    const dayTotals: Record<string, number> = {};
    for (const d of weekDays) {
      dayTotals[d] = rows.reduce((s, r) => s + (Number(r.hours[d]) || 0), 0);
    }
    return { total, billable, nonBillable, dayTotals };
  }, [rows, weekDays]);

  const addRow = () => {
    if (timesheetProjects.length === 0) {
      toast.error("No projects assigned", { description: "Ask your PM to add you to a project." });
      return;
    }
    const p = timesheetProjects[0];
    setRows((r) => [
      ...r,
      {
        id: "row_" + Math.random().toString(36).slice(2, 8),
        projectId: p.id,
        task: p.modules[0]?.name ?? "General",
        billable: true,
        description: "",
        hours: {},
      },
    ]);
  };

  const removeRow = (id: string) => setRows((r) => r.filter((x) => x.id !== id));

  const updateRow = (id: string, patch: Partial<RowDraft>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const updateHours = (id: string, date: string, value: string) => {
    const num = value === "" ? 0 : Number(value);
    if (Number.isNaN(num) || num < 0 || num > 24) return;
    setRows((r) => r.map((x) => (x.id === id ? { ...x, hours: { ...x.hours, [date]: num } } : x)));
  };

  const copyPreviousDay = (rowId: string, dayIdx: number) => {
    if (dayIdx === 0) return;
    const prev = weekDays[dayIdx - 1];
    const cur = weekDays[dayIdx];
    setRows((r) =>
      r.map((x) =>
        x.id === rowId ? { ...x, hours: { ...x.hours, [cur]: x.hours[prev] ?? 0 } } : x,
      ),
    );
  };

  const persistRows = async (status: "draft" | "pending") => {
    const nextEntries: Array<Omit<TimesheetEntry, "id">> = [];
    rows.forEach((r) => {
      const project =
        timesheetProjects.find((p) => p.id === r.projectId) ??
        projects.find((p) => p.id === r.projectId);
      if (!project) return;
      weekDays.forEach((d) => {
        const h = Number(r.hours[d]) || 0;
        if (h > 0) {
          nextEntries.push({
            employeeId: me.id,
            employeeName: me.name,
            weekStart,
            date: d,
            projectId: project.id,
            projectCode: project.code,
            projectName: project.name,
            task: r.task,
            billable: r.billable,
            hours: h,
            description: r.description,
          });
        }
      });
    });
    await saveWeekEntries(nextEntries, { employeeId: me.id, weekStart });
    if (status === "pending") await setWeekStatus(week.id, status);
  };

  const onSaveDraft = async () => {
    if (readOnly) return;
    setSavingAction("draft");
    try {
      await persistRows("draft");
      toast.success("Draft saved");
    } catch (err) {
      toastApiError(err, "Could not save draft");
    } finally {
      setSavingAction(null);
    }
  };
  const onSubmitWeek = async () => {
    if (readOnly) return;
    if (totals.total === 0) {
      toast.error("Add some hours before submitting");
      return;
    }
    setSavingAction("submit");
    try {
      await persistRows("pending");
      toast.success("Week submitted for approval");
    } catch (err) {
      toastApiError(err, "Could not submit week");
    } finally {
      setSavingAction(null);
    }
  };

  const dateLabel = (d: string, opts?: Intl.DateTimeFormatOptions) =>
    new Date(d).toLocaleDateString(
      undefined,
      opts ?? { weekday: "short", month: "short", day: "numeric" },
    );

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <Card className="rounded-2xl border-border/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 px-1 sm:flex-none sm:px-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="truncate">
                  Week of{" "}
                  {dateLabel(weekDays[0], { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {dateLabel(weekDays[0])} — {dateLabel(weekDays[6])}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              This week
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge status={week.status} label={TIMESHEET_STATUS_LABEL[week.status]} />
            <Tabs value={view} onValueChange={(v) => setView(v as "week" | "day")}>
              <TabsList>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="day">Day</TabsTrigger>
              </TabsList>
            </Tabs>
            {!readOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSaveDraft}
                  disabled={loading || savingAction !== null}
                >
                  <Save className="mr-1 h-4 w-4" /> Save draft
                </Button>
                <ActionButton
                  size="sm"
                  icon={<Send className="h-4 w-4" />}
                  onClick={onSubmitWeek}
                  disabled={loading || savingAction !== null}
                >
                  {savingAction === "submit" ? "Submitting" : "Submit week"}
                </ActionButton>
              </>
            )}
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
      {selectorsQuery.error instanceof Error && (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            Timesheet options could not be loaded
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {userFacingErrorMessage(selectorsQuery.error, "Timesheet options could not be loaded.")}
          </p>
        </Card>
      )}

      {/* Stats */}
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
          icon={Coffee}
          tone="warning"
          hint="Internal time"
        />
        <StatCard
          label="Capacity gap"
          value={`${Math.max(0, targetWeeklyHours - totals.total).toFixed(1)}h`}
          icon={AlertTriangle}
          tone={totals.total < targetWeeklyHours ? "destructive" : "info"}
          hint={`Target ${targetWeeklyHours.toFixed(1)}h`}
        />
      </div>

      {(week.status === "rejected" || week.status === "returned") && week.remarks && (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            {week.status === "rejected" ? "Rejected" : "Returned for changes"} by {week.decidedBy}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">"{week.remarks}"</p>
        </Card>
      )}

      {/* Grid */}
      {view === "week" ? (
        <Card className="overflow-hidden rounded-2xl border-border/60">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/40 text-left">
                  <th className="min-w-[260px] px-4 py-3 font-medium">Project / task</th>
                  <th className="px-3 py-3 text-center font-medium">Billable</th>
                  {weekDays.map((d, i) => {
                    const isWeekend = !isWorkingDate(d, workingWeek, holidayDates);
                    return (
                      <th
                        key={d}
                        className={cn(
                          "px-2 py-3 text-center font-medium",
                          isWeekend && "bg-muted/40",
                        )}
                      >
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {new Date(d).toLocaleDateString(undefined, { weekday: "short" })}
                        </div>
                        <div className="text-xs font-semibold">
                          {new Date(d).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 text-center font-medium">Total</th>
                  {!readOnly && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8">
                      <EmptyState
                        icon={Clock}
                        title={loading ? "Loading timesheet" : "No entries yet for this week"}
                        description={
                          loading
                            ? "Fetching current backend timesheet entries."
                            : readOnly
                              ? "Nothing submitted."
                              : "Click 'Add row' to log hours against your projects."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const rowTotal = weekDays.reduce((s, d) => s + (Number(r.hours[d]) || 0), 0);
                    return (
                      <tr key={r.id} className="border-t hover:bg-accent/30">
                        <td className="px-4 py-2 align-top">
                          <Select
                            value={r.projectId}
                            onValueChange={(v) => updateRow(r.id, { projectId: v })}
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-8 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {timesheetProjects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.code} · {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={r.task}
                            disabled={readOnly}
                            onChange={(e) => updateRow(r.id, { task: e.target.value })}
                            placeholder="Task / module"
                            className="mt-1.5 h-7 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          <Switch
                            checked={r.billable}
                            disabled={readOnly}
                            onCheckedChange={(c) => updateRow(r.id, { billable: c })}
                          />
                        </td>
                        {weekDays.map((d, i) => {
                          const isWeekend = !isWorkingDate(d, workingWeek, holidayDates);
                          return (
                            <td
                              key={d}
                              className={cn("px-1 py-2 align-middle", isWeekend && "bg-muted/30")}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  max={24}
                                  step={0.5}
                                  disabled={readOnly}
                                  value={r.hours[d] ?? ""}
                                  onChange={(e) => updateHours(r.id, d, e.target.value)}
                                  className="h-8 w-14 text-center text-xs"
                                  placeholder="—"
                                />
                                {!readOnly && i > 0 && (
                                  <button
                                    title="Copy previous day"
                                    onClick={() => copyPreviousDay(r.id, i)}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-semibold">
                          {rowTotal.toFixed(1)}
                        </td>
                        {!readOnly && (
                          <td className="px-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeRow(r.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t bg-secondary/30 text-xs font-semibold">
                  <td colSpan={2} className="px-4 py-3 text-right text-muted-foreground">
                    Daily totals
                  </td>
                  {weekDays.map((d) => (
                    <td
                      key={d}
                      className={cn(
                        "px-2 py-3 text-center",
                        !isWorkingDate(d, workingWeek, holidayDates) && "bg-muted/40",
                      )}
                    >
                      {totals.dayTotals[d].toFixed(1)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center text-primary">{totals.total.toFixed(1)}</td>
                  {!readOnly && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {!readOnly && (
            <div className="border-t bg-card p-3">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-1 h-4 w-4" /> Add row
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <DayView
          weekDays={weekDays}
          activeDay={activeDay}
          workingWeek={workingWeek}
          holidayDates={holidayDates}
          onDayChange={setActiveDay}
          rows={rows}
          dayTotals={totals.dayTotals}
          myProjects={timesheetProjects}
          readOnly={readOnly}
          onAddRow={addRow}
          onUpdateRow={updateRow}
          onUpdateHours={updateHours}
          onRemoveRow={removeRow}
        />
      )}

      {/* Approval timeline */}
      {(week.status === "pending" ||
        week.status === "approved" ||
        week.status === "rejected" ||
        week.status === "returned") && (
        <Card className="rounded-2xl border-border/60 p-5">
          <p className="mb-3 text-sm font-semibold">Approval timeline</p>
          <ApprovalTimeline
            steps={[
              {
                approver: me.name,
                role: "Submitted",
                status: "approved",
                at: week.submittedAt ? new Date(week.submittedAt).toLocaleString() : "—",
              },
              {
                approver: week.decidedBy ?? me.manager,
                role: "Manager review",
                status:
                  week.status === "approved"
                    ? "approved"
                    : week.status === "rejected"
                      ? "rejected"
                      : week.status === "returned"
                        ? "rejected"
                        : "pending",
                at: week.decidedAt ? new Date(week.decidedAt).toLocaleString() : undefined,
                remark: week.remarks,
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

interface DayProps {
  weekDays: string[];
  activeDay: string;
  workingWeek: string;
  holidayDates: ReadonlySet<string>;
  onDayChange: (d: string) => void;
  rows: RowDraft[];
  dayTotals: Record<string, number>;
  myProjects: Array<{ id: string; code: string; name: string }>;
  readOnly: boolean;
  onAddRow: () => void;
  onUpdateRow: (id: string, patch: Partial<RowDraft>) => void;
  onUpdateHours: (id: string, date: string, value: string) => void;
  onRemoveRow: (id: string) => void;
}

function DayView({
  weekDays,
  activeDay,
  workingWeek,
  holidayDates,
  onDayChange,
  rows,
  dayTotals,
  myProjects,
  readOnly,
  onAddRow,
  onUpdateRow,
  onUpdateHours,
  onRemoveRow,
}: DayProps) {
  const dayRows = rows.filter((r) => (r.hours[activeDay] ?? 0) > 0 || !r.hours[activeDay]);
  return (
    <Card className="rounded-2xl border-border/60 p-4">
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {weekDays.map((d, i) => (
          <button
            key={d}
            onClick={() => onDayChange(d)}
            className={cn(
              "min-w-[4.5rem] flex-none rounded-xl border px-3 py-2 text-center text-xs transition sm:min-w-0",
              activeDay === d
                ? "border-primary bg-primary-soft text-primary"
                : "border-border hover:bg-accent",
              !isWorkingDate(d, workingWeek, holidayDates) && activeDay !== d && "bg-muted/40",
            )}
          >
            <span className="font-medium">
              {new Date(d).toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <span className="mt-0.5 text-[11px] font-semibold">
              {dayTotals[d]?.toFixed(1) ?? "0.0"}h
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {dayRows.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
            No entries for this day yet.
          </p>
        )}
        {dayRows.map((r) => (
          <div
            key={r.id}
            className="grid min-w-0 items-center gap-2 rounded-xl border bg-card p-3 sm:grid-cols-12"
          >
            <div className="min-w-0 sm:col-span-4">
              <Label className="text-[11px]">Project</Label>
              <Select
                value={r.projectId}
                disabled={readOnly}
                onValueChange={(v) => onUpdateRow(r.id, { projectId: v })}
              >
                <SelectTrigger className="h-8 text-xs">
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
            <div className="min-w-0 sm:col-span-3">
              <Label className="text-[11px]">Task</Label>
              <Input
                className="h-8 text-xs"
                value={r.task}
                disabled={readOnly}
                onChange={(e) => onUpdateRow(r.id, { task: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Hours</Label>
              <Input
                className="h-8 text-xs"
                type="number"
                min={0}
                max={24}
                step={0.5}
                disabled={readOnly}
                value={r.hours[activeDay] ?? ""}
                onChange={(e) => onUpdateHours(r.id, activeDay, e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 pt-3 sm:col-span-3 sm:pt-0">
              <div>
                <Label className="text-[11px]">Billable</Label>
                <div className="pt-1">
                  <Switch
                    checked={r.billable}
                    disabled={readOnly}
                    onCheckedChange={(c) => onUpdateRow(r.id, { billable: c })}
                  />
                </div>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  onClick={() => onRemoveRow(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
            <div className="sm:col-span-12">
              <Label className="text-[11px]">Description</Label>
              <Textarea
                className="text-xs"
                rows={2}
                value={r.description}
                disabled={readOnly}
                onChange={(e) => onUpdateRow(r.id, { description: e.target.value })}
                placeholder="What did you work on?"
              />
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={onAddRow}>
            <Plus className="mr-1 h-4 w-4" /> Add entry
          </Button>
        </div>
      )}
    </Card>
  );
}
