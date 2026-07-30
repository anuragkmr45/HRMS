import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { StatCard, DataCard, StatusBadge, EmptyState } from "@/components/ui-kit";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserX,
  AlarmClock,
  LogOut,
  Home,
  CalendarDays,
  ClipboardX,
  Play,
  Pause,
  Square,
  Clock,
  Building2,
} from "lucide-react";
import type { Role } from "@/lib/mock/roles";
import {
  useAttendancePunchMutation,
  useMyAttendanceSummary,
  useTeamAttendanceSummary,
  type AttendancePunchEventType,
} from "@/domains/attendance";
import { currentLocalMonth, localIsoDate, liveAttendanceToday } from "@/domains/attendance/live";
import {
  asArray,
  asRecord,
  createIdempotentMutation,
  numberValue,
  text,
  userFacingErrorMessage,
  type ApiRecord,
} from "@/shared/api";

export const Route = createFileRoute("/_app/attendance/")({
  component: AttendanceOverview,
});

const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin", "manager"];

function AttendanceOverview() {
  const { activeRole } = useAuth();
  const isAdmin = activeRole && ADMIN_ROLES.includes(activeRole);
  return isAdmin ? <AdminView /> : <EmployeeView />;
}

function records(value: unknown): ApiRecord[] {
  return asArray(value).map(asRecord);
}

function todayIsoDate(): string {
  return localIsoDate();
}

function currentMonth(): string {
  return currentLocalMonth();
}

function formatMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}m`;
}

function displayDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "Today";
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "Attendance request failed.");
}

function AdminView() {
  const query = useTeamAttendanceSummary({ date_from: todayIsoDate(), page: 1, page_size: 8 });
  const data = asRecord(query.data);
  const totals = asRecord(data.totals);
  const departments = records(data.department_summary);
  const exceptions = records(data.exceptions);
  const total = numberValue(totals.total);
  const present = numberValue(totals.present);
  const presentHint = total > 0 ? `${Math.round((present / total) * 100)}%` : undefined;

  if (query.isError) {
    return (
      <div className="pt-2">
        <DataCard title="Attendance unavailable" description="Today">
          <EmptyState title="Could not load attendance" description={errorMessage(query.error)} />
        </DataCard>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard
          label="Total"
          value={query.isLoading ? "..." : total}
          icon={Users}
          tone="primary"
        />
        <StatCard
          label="Present"
          value={query.isLoading ? "..." : present}
          hint={presentHint}
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          label="Absent"
          value={query.isLoading ? "..." : numberValue(totals.absent)}
          icon={UserX}
          tone="destructive"
        />
        <StatCard
          label="Late"
          value={query.isLoading ? "..." : numberValue(totals.late)}
          icon={AlarmClock}
          tone="warning"
        />
        <StatCard
          label="Early out"
          value={query.isLoading ? "..." : numberValue(totals.early_out)}
          icon={LogOut}
          tone="warning"
        />
        <StatCard
          label="WFH"
          value={query.isLoading ? "..." : numberValue(totals.wfh)}
          icon={Home}
          tone="info"
        />
        <StatCard
          label="On leave"
          value={query.isLoading ? "..." : numberValue(totals.on_leave)}
          icon={CalendarDays}
          tone="info"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Department-wise attendance" description="Today" className="lg:col-span-2">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading department attendance...</p>
          ) : departments.length === 0 ? (
            <EmptyState
              title="No department attendance"
              description="No active employees matched this view."
            />
          ) : (
            <ul className="space-y-3">
              {departments.map((department) => {
                const id = text(department.department_id, text(department.name));
                const presentCount = numberValue(department.present);
                const strength = numberValue(department.strength);
                const pct = numberValue(
                  department.attendance_percent,
                  strength > 0 ? Math.round((presentCount / strength) * 100) : 0,
                );
                return (
                  <li key={id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{text(department.name, "Department")}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {presentCount}/{strength} · {pct}%
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </li>
                );
              })}
            </ul>
          )}
        </DataCard>

        <DataCard title="Attendance exceptions" description="Needs attention">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading exceptions...</p>
          ) : exceptions.length === 0 ? (
            <EmptyState
              title="All clear"
              description="No attendance exceptions need action today."
            />
          ) : (
            <ul className="space-y-2.5">
              {exceptions.map((exception) => (
                <li
                  key={text(exception.id)}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">{text(exception.employee, "Employee")}</p>
                    <p className="text-xs text-muted-foreground">{text(exception.detail)}</p>
                  </div>
                  <StatusBadge status={text(exception.status, "pending")} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>
    </div>
  );
}

function EmployeeView() {
  const [now, setNow] = useState(new Date());
  const query = useMyAttendanceSummary({ month: currentMonth(), page: 1, page_size: 50 });
  const punchMutation = useAttendancePunchMutation();
  const data = asRecord(query.data);
  const today = asRecord(data.today);
  const summary = asRecord(data.summary);
  const liveToday = liveAttendanceToday(today, data.generated_at, now);
  const weekRecords = records(data.week_records).map((record) =>
    text(record.work_date) === text(today.work_date)
      ? {
          ...record,
          hours: liveToday.hours,
          break_hours: liveToday.breakHours,
          work_minutes: liveToday.workMinutes,
          break_minutes: liveToday.breakMinutes,
        }
      : record,
  );
  const exceptionHistory = records(data.exception_history);
  const nextAllowedActions = liveToday.nextAllowedActions;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const punch = async (eventType: AttendancePunchEventType, successMessage: string) => {
    try {
      await punchMutation.mutateAsync(
        createIdempotentMutation("attendance.punch", {
          event_type: eventType,
          occurred_at: new Date().toISOString(),
          work_mode: "office",
          source: "web",
          metadata: {},
        }),
      );
      toast.success(successMessage);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const canPunch = (eventType: AttendancePunchEventType) => nextAllowedActions.includes(eventType);
  const status = text(today.status, query.isLoading ? "loading" : "absent");
  const statusLabel =
    nextAllowedActions.length === 0 &&
    status !== "absent" &&
    status !== "future" &&
    status !== "weekend"
      ? "Completed"
      : text(today.detail, status.replaceAll("_", " "));
  const disableActions = query.isLoading || punchMutation.isPending;

  if (query.isError) {
    return (
      <div className="pt-2">
        <DataCard title="My attendance" description="Today">
          <EmptyState title="Could not load attendance" description={errorMessage(query.error)} />
        </DataCard>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-border/60 lg:col-span-2">
          <div className="p-6" style={{ background: "var(--gradient-hero)" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {now.toLocaleDateString(undefined, { weekday: "long" })}
                </p>
                <p className="text-2xl font-semibold">
                  {now.toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <StatusBadge status={status} label={statusLabel} />
            </div>
            <p className="mt-4 text-5xl font-bold tabular-nums tracking-tight">
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
            {text(today.in_time) && (
              <p className="mt-1 text-xs text-muted-foreground">
                Punched in at {text(today.in_time)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x border-t text-center">
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Total today</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {query.isLoading ? "..." : liveToday.hours}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Break</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {query.isLoading ? "..." : liveToday.breakHours}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Target</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {query.isLoading
                  ? "..."
                  : text(today.target_hours, text(summary.target_hours, "0h 00m"))}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t p-4">
            {canPunch("check_in") && (
              <Button
                className="rounded-full"
                disabled={disableActions}
                onClick={() => punch("check_in", "Punched in")}
              >
                <Play className="mr-1.5 h-4 w-4" /> Punch in
              </Button>
            )}
            {canPunch("break_start") && (
              <Button
                variant="outline"
                className="rounded-full"
                disabled={disableActions}
                onClick={() => punch("break_start", "Break started")}
              >
                <Pause className="mr-1.5 h-4 w-4" /> Start break
              </Button>
            )}
            {canPunch("break_end") && (
              <Button
                className="rounded-full"
                disabled={disableActions}
                onClick={() => punch("break_end", "Resumed work")}
              >
                <Play className="mr-1.5 h-4 w-4" /> Resume
              </Button>
            )}
            {canPunch("check_out") && (
              <Button
                className="rounded-full"
                disabled={disableActions}
                onClick={() => punch("check_out", "Punched out")}
              >
                <Square className="mr-1.5 h-4 w-4" /> Punch out
              </Button>
            )}
            {!query.isLoading && nextAllowedActions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {status === "future" || status === "weekend"
                  ? "No attendance action is available for this day."
                  : "Day completed. See you tomorrow."}
              </p>
            )}
          </div>
        </Card>

        <DataCard title="This week" description="Mon to Sun">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading week records...</p>
          ) : weekRecords.length === 0 ? (
            <EmptyState
              title="No records"
              description="No attendance records are available this week."
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {weekRecords.map((record) => (
                <li
                  key={text(record.work_date)}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{displayDate(record.work_date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {text(record.in_time, "-")} - {text(record.out_time, "-")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold">{text(record.hours, "0h 00m")}</p>
                    <StatusBadge status={text(record.status, "pending")} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="MTD work hours"
          value={
            query.isLoading
              ? "..."
              : formatMinutes(
                  numberValue(summary.work_minutes) +
                    (liveToday.workMinutes - numberValue(today.work_minutes)),
                )
          }
          hint="current month"
          icon={Clock}
          tone="primary"
        />
        <StatCard
          label="Late this month"
          value={query.isLoading ? "..." : numberValue(summary.late)}
          hint="threshold: 3"
          icon={AlarmClock}
          tone="warning"
        />
        <StatCard
          label="Absent w/o leave"
          value={query.isLoading ? "..." : numberValue(summary.absent)}
          icon={ClipboardX}
          tone={numberValue(summary.absent) > 0 ? "destructive" : "success"}
        />
      </div>

      <DataCard title="Late & absent history" description="Last 30 days">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading exception history...</p>
        ) : exceptionHistory.length === 0 ? (
          <EmptyState
            title="No exceptions"
            description="No late or absent records in this period."
          />
        ) : (
          <ul className="divide-y text-sm">
            {exceptionHistory.map((record) => (
              <li
                key={`${text(record.date)}-${text(record.reason)}`}
                className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{displayDate(record.date)}</p>
                  <p className="text-xs text-muted-foreground">{text(record.reason)}</p>
                </div>
                <StatusBadge status={text(record.status, "pending")} />
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
