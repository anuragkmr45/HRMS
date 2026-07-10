import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
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
import {
  TIMESHEET_STATUS_LABEL,
  type TimesheetWeek,
  DEMO_LAST_WEEK,
  previousWeekStartIso,
} from "@/lib/mock/timesheets";
import { useTimesheetMissingSubmissions } from "@/domains/timesheets";
import {
  asRecord,
  isApiEnabled,
  numberValue,
  pageItems,
  text,
  toastApiError,
  userFacingErrorMessage,
} from "@/shared/api";
import {
  CheckCircle2,
  XCircle,
  CornerUpLeft,
  Clock,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/timesheet/approvals")({
  component: ApprovalsPage,
});

interface Row {
  id: string;
  weekId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  weekStart: string;
  total: number;
  billable: number;
  missing: number;
  status: TimesheetWeek["status"];
  remarks?: string;
  decidedBy?: string;
}

const TARGET = 40;

function cycleEnd(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function ApprovalsPage() {
  const { user, activeRole } = useAuth();
  const { employees } = useEmployees();
  const { projects } = useProjects();
  const { entries, weeks, loading, error, isApiBacked, setWeekStatus } = useTimesheets();
  const apiMode = isApiEnabled();
  const defaultReviewWeek = useMemo(
    () => (apiMode ? previousWeekStartIso() : DEMO_LAST_WEEK),
    [apiMode],
  );
  const missingQuery = useTimesheetMissingSubmissions(
    {
      page: 1,
      page_size: 100,
      cycle_start: defaultReviewWeek,
      cycle_end: cycleEnd(defaultReviewWeek),
    },
    apiMode,
  );

  const isAdmin = activeRole === "main_admin" || activeRole === "hr_admin";

  // For PM/Manager scope: limit to direct reports / project members
  const scopedEmployees = useMemo(() => {
    if (isAdmin) return employees;
    if (activeRole === "manager") return employees.filter((e) => e.manager === user?.name);
    if (activeRole === "project_manager") {
      const ids = new Set<string>();
      projects
        .filter((p) => p.manager === user?.name)
        .forEach((p) => p.members.forEach((m) => ids.add(m.employeeId)));
      return employees.filter((e) => ids.has(e.id));
    }
    return [];
  }, [employees, projects, activeRole, user, isAdmin]);

  const buildRow = (w: TimesheetWeek): Row => {
    const wkEntries = entries.filter(
      (e) => e.employeeId === w.employeeId && e.weekStart === w.weekStart,
    );
    const total = w.totalHours ?? wkEntries.reduce((s, e) => s + e.hours, 0);
    const billable =
      w.billableHours ?? wkEntries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
    return {
      id: w.id,
      weekId: w.id,
      employeeId: w.employeeId,
      employeeName: w.employeeName,
      department: w.department,
      weekStart: w.weekStart,
      total,
      billable,
      missing: w.missingHours ?? Math.max(0, TARGET - total),
      status: w.status,
      remarks: w.remarks,
      decidedBy: w.decidedBy,
    };
  };

  const scopedWeeks = useMemo(() => {
    const ids = new Set(scopedEmployees.map((e) => e.id));
    if (isApiBacked && ids.size === 0) return weeks;
    return weeks.filter((w) => ids.has(w.employeeId));
  }, [weeks, scopedEmployees, isApiBacked]);

  const pending = scopedWeeks
    .filter((w) => w.status === "pending" || w.status === "submitted")
    .map(buildRow);
  const approved = scopedWeeks.filter((w) => w.status === "approved").map(buildRow);
  const rejected = scopedWeeks
    .filter((w) => w.status === "rejected" || w.status === "returned")
    .map(buildRow);

  // Missing: scoped employees who have no week record for last week
  const localMissing: Row[] = useMemo(() => {
    const submittedIds = new Set(
      scopedWeeks.filter((w) => w.weekStart === defaultReviewWeek).map((w) => w.employeeId),
    );
    return scopedEmployees
      .filter(
        (e) =>
          !submittedIds.has(e.id) &&
          (e.status === "active" || e.status === "confirmed" || e.status === "probation"),
      )
      .map((e) => ({
        id: `missing_${e.id}`,
        weekId: "",
        employeeId: e.id,
        employeeName: e.name,
        department: e.department,
        weekStart: defaultReviewWeek,
        total: 0,
        billable: 0,
        missing: TARGET,
        status: "draft" as const,
      }));
  }, [defaultReviewWeek, scopedEmployees, scopedWeeks]);

  const apiMissing: Row[] = useMemo(
    () =>
      pageItems(missingQuery.data).map((value) => {
        const row = asRecord(value);
        const userRecord = asRecord(row.user);
        const cycle = asRecord(row.cycle);
        return {
          id: text(row.id, `missing_${text(row.employee_user_id, "employee")}`),
          weekId: text(row.submission_id),
          employeeId: text(userRecord.employee_code ?? row.employee_user_id, "EMP"),
          employeeName: text(userRecord.full_name, "Employee"),
          department: text(asRecord(userRecord.department).name, "General"),
          weekStart: text(cycle.start, defaultReviewWeek),
          total: numberValue(row.submitted_hours, 0),
          billable: 0,
          missing: numberValue(row.missing_hours, TARGET),
          status: "draft" as const,
        };
      }),
    [defaultReviewWeek, missingQuery.data],
  );

  const missing = apiMode && missingQuery.data ? apiMissing : localMissing;
  const missingLoading = loading || (apiMode && missingQuery.isLoading);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [returnFor, setReturnFor] = useState<Row | null>(null);
  const [remarks, setRemarks] = useState("");

  const toggleAll = (rows: Row[], on: boolean) => {
    const next = new Set(selected);
    rows.forEach((r) => (on ? next.add(r.id) : next.delete(r.id)));
    setSelected(next);
  };
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelected(next);
  };

  const approveOne = async (r: Row) => {
    try {
      await setWeekStatus(r.weekId, "approved", user?.name);
      toast.success("Approved", { description: `${r.employeeName} · ${r.weekStart}` });
    } catch (err) {
      toastApiError(err, "Could not approve timesheet");
    }
  };
  const bulkApprove = async () => {
    let n = 0;
    try {
      for (const r of pending) {
        if (selected.has(r.id)) {
          await setWeekStatus(r.weekId, "approved", user?.name);
          n++;
        }
      }
      toast.success(`${n} weeks approved`);
      setSelected(new Set());
    } catch (err) {
      toastApiError(err, "Could not bulk approve timesheets");
    }
  };
  const submitReject = async () => {
    if (!rejectFor) return;
    if (!remarks.trim()) {
      toast.error("Remarks are required");
      return;
    }
    try {
      await setWeekStatus(rejectFor.weekId, "rejected", user?.name, remarks.trim());
      toast.success("Rejected", { description: `${rejectFor.employeeName}` });
      setRejectFor(null);
      setRemarks("");
    } catch (err) {
      toastApiError(err, "Could not reject timesheet");
    }
  };
  const submitReturn = async () => {
    if (!returnFor) return;
    if (!remarks.trim()) {
      toast.error("Remarks are required");
      return;
    }
    try {
      await setWeekStatus(returnFor.weekId, "returned", user?.name, remarks.trim());
      toast.success("Returned for changes", { description: `${returnFor.employeeName}` });
      setReturnFor(null);
      setRemarks("");
    } catch (err) {
      toastApiError(err, "Could not return timesheet");
    }
  };

  const buildColumns = (rows: Row[], showActions: boolean, showSelect: boolean): Column<Row>[] => {
    const cols: Column<Row>[] = [];
    if (showSelect) {
      cols.push({
        key: "sel",
        header: " ",
        render: (r) => (
          <Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => toggle(r.id, !!c)} />
        ),
        className: "w-8",
      });
    }
    cols.push(
      {
        key: "employee",
        header: "Employee",
        render: (r) => (
          <UserAvatar
            name={r.employeeName}
            email={r.employeeId}
            tone="primary"
            showMeta
            subtitle={r.department}
          />
        ),
      },
      {
        key: "week",
        header: "Week",
        render: (r) => (
          <span className="text-xs">
            {new Date(r.weekStart).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        ),
      },
      {
        key: "total",
        header: "Total",
        render: (r) => <span className="text-sm font-semibold">{r.total.toFixed(1)}h</span>,
      },
      {
        key: "billable",
        header: "Billable",
        render: (r) => <span className="text-sm">{r.billable.toFixed(1)}h</span>,
      },
      {
        key: "missing",
        header: "Missing",
        render: (r) =>
          r.missing > 0 ? (
            <span className="text-sm font-semibold text-destructive">{r.missing.toFixed(1)}h</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        key: "status",
        header: "Status",
        render: (r) => (
          <StatusBadge
            status={r.status === "submitted" ? "pending" : r.status}
            label={TIMESHEET_STATUS_LABEL[r.status]}
          />
        ),
      },
    );
    if (showActions) {
      cols.push({
        key: "actions",
        header: "Actions",
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => approveOne(r)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => {
                setRejectFor(r);
                setRemarks("");
              }}
            >
              <XCircle className="mr-1 h-3.5 w-3.5 text-destructive" /> Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => {
                setReturnFor(r);
                setRemarks("");
              }}
            >
              <CornerUpLeft className="mr-1 h-3.5 w-3.5" /> Return
            </Button>
          </div>
        ),
      });
    }
    return cols;
  };

  const stats = {
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    missing: missing.length,
  };

  return (
    <div className="space-y-4">
      {error && (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            Timesheet approvals could not be loaded
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {userFacingErrorMessage(error, "Timesheet approvals could not be loaded.")}
          </p>
        </Card>
      )}
      {missingQuery.error instanceof Error && (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            Missing submissions could not be loaded
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {userFacingErrorMessage(missingQuery.error, "Missing submissions could not be loaded.")}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={Clock}
          tone="warning"
          hint="Action required"
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          tone="success"
          hint="In your scope"
        />
        <StatCard
          label="Rejected / Returned"
          value={stats.rejected}
          icon={XCircle}
          tone="destructive"
          hint="With remarks"
        />
        <StatCard
          label="Missing submissions"
          value={stats.missing}
          icon={AlertTriangle}
          tone="info"
          hint="Last week"
        />
      </div>

      <Tabs defaultValue="pending" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({stats.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({stats.rejected})</TabsTrigger>
            <TabsTrigger value="missing">Missing ({stats.missing})</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleAll(pending, true)}>
              Select all pending
            </Button>
            <ActionButton
              size="sm"
              icon={<ListChecks className="h-4 w-4" />}
              onClick={bulkApprove}
              disabled={selected.size === 0}
            >
              Bulk approve ({selected.size})
            </ActionButton>
          </div>
        </div>

        <TabsContent value="pending">
          {pending.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={CheckCircle2}
                title="All clear"
                description="No timesheets pending your approval."
              />
            </Card>
          ) : (
            <DataTable
              columns={buildColumns(pending, true, true)}
              rows={pending}
              searchKeys={["employeeName", "department"]}
              loading={loading}
              emptyTitle="Nothing pending"
            />
          )}
        </TabsContent>

        <TabsContent value="approved">
          <DataTable
            columns={buildColumns(approved, false, false)}
            rows={approved}
            searchKeys={["employeeName", "department"]}
            loading={loading}
            emptyTitle="No approved weeks yet"
          />
        </TabsContent>

        <TabsContent value="rejected">
          {rejected.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={XCircle}
                title="Nothing rejected"
                description="No rejections or returns in your scope."
              />
            </Card>
          ) : (
            <div className="space-y-2">
              <DataTable
                columns={buildColumns(rejected, false, false)}
                rows={rejected}
                searchKeys={["employeeName"]}
                loading={loading}
              />
              <Card className="rounded-2xl border-border/60 p-4 text-xs text-muted-foreground">
                Tip: Returned weeks become editable for the employee. Rejected weeks remain locked
                until re-submission.
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="missing">
          {missing.length === 0 && !missingLoading ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={CheckCircle2}
                title="No missing submissions"
                description="Everyone in your scope submitted last week."
              />
            </Card>
          ) : (
            <DataTable
              columns={buildColumns(missing, false, false)}
              rows={missing}
              searchKeys={["employeeName", "department"]}
              loading={missingLoading}
              emptyTitle="No missing submissions"
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject timesheet</DialogTitle>
            <DialogDescription>
              {rejectFor?.employeeName} · Week of{" "}
              {rejectFor &&
                new Date(rejectFor.weekStart).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-xs font-medium">Remarks (required)</p>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              placeholder="Why are you rejecting this week?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitReject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={!!returnFor} onOpenChange={(o) => !o && setReturnFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return for changes</DialogTitle>
            <DialogDescription>
              {returnFor?.employeeName} · Week of{" "}
              {returnFor &&
                new Date(returnFor.weekStart).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-xs font-medium">What needs fixing? (required)</p>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              placeholder="Add task descriptions, fix hours, etc."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnFor(null)}>
              Cancel
            </Button>
            <ActionButton onClick={submitReturn}>Return</ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
