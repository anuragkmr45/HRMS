import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlarmClock, CalendarDays, Clock, Coffee, Play, Square, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataCard, EmptyState, StatCard, StatusBadge } from "@/components/ui-kit";
import {
  useAttendancePunchMutation,
  useMyAttendanceSummary,
  type AttendancePunchEventType,
} from "@/domains/attendance";
import {
  currentLocalMonth,
  formatAttendanceMinutes,
  liveAttendanceToday,
} from "@/domains/attendance/live";
import {
  asRecord,
  createIdempotentMutation,
  numberValue,
  text,
  userFacingErrorMessage,
} from "@/shared/api";

function currentMonth(): string {
  return currentLocalMonth();
}

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "Attendance request failed.");
}

function formatMinutes(minutes: number): string {
  return formatAttendanceMinutes(minutes);
}

export function EmployeeAttendanceDashboard() {
  const [now, setNow] = useState(new Date());
  const query = useMyAttendanceSummary({ month: currentMonth(), page: 1, page_size: 1 });
  const punchMutation = useAttendancePunchMutation();
  const data = asRecord(query.data);
  const today = asRecord(data.today);
  const summary = asRecord(data.summary);
  const weeklyBalance = asRecord(data.weekly_balance ?? summary.weekly_balance);
  const liveToday = liveAttendanceToday(today, data.generated_at, now);
  const nextAllowedActions = liveToday.nextAllowedActions;
  const targetHours = text(today.target_hours, text(summary.target_hours));
  const punchPolicy = asRecord(today.punch_policy);
  const punchBlockedReason = text(punchPolicy.blocked_reason);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const canPunch = (eventType: AttendancePunchEventType) => nextAllowedActions.includes(eventType);
  const punch = async (eventType: AttendancePunchEventType, successMessage: string) => {
    try {
      await punchMutation.mutateAsync(
        createIdempotentMutation("attendance.punch", {
          event_type: eventType,
          occurred_at: new Date().toISOString(),
          work_mode: "office",
          source: "web",
          metadata: { source_view: "dashboard" },
        }),
      );
      toast.success(successMessage);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

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
      <DataCard
        title="Today attendance"
        description="Your attendance action failed to load"
        actions={
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/attendance">Open attendance</Link>
          </Button>
        }
      >
        <EmptyState title="Could not load attendance" description={errorMessage(query.error)} />
      </DataCard>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-3xl border-border/60 shadow-sm">
        <div className="p-6 sm:p-7" style={{ background: "var(--gradient-hero)" }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {now.toLocaleDateString(undefined, { weekday: "long" })}
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {now.toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>
            <StatusBadge status={status} label={statusLabel} />
          </div>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
                {now.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {text(today.in_time)
                  ? `Punched in at ${text(today.in_time)}`
                  : "Ready when your day starts."}
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {canPunch("check_in") && (
                  <Button
                    className="rounded-full px-5 text-primary-foreground"
                    disabled={disableActions}
                    onClick={() => punch("check_in", "Punched in")}
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Play className="mr-1.5 h-4 w-4" /> Punch in
                  </Button>
                )}
                {canPunch("break_start") && (
                  <Button
                    variant="outline"
                    className="rounded-full px-5"
                    disabled={disableActions}
                    onClick={() => punch("break_start", "Break started")}
                  >
                    <Coffee className="mr-1.5 h-4 w-4" /> Start break
                  </Button>
                )}
                {canPunch("break_end") && (
                  <Button
                    className="rounded-full px-5 text-primary-foreground"
                    disabled={disableActions}
                    onClick={() => punch("break_end", "Resumed work")}
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Play className="mr-1.5 h-4 w-4" /> Resume
                  </Button>
                )}
                {canPunch("check_out") && (
                  <Button
                    variant="outline"
                    className="rounded-full border-destructive/30 px-5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={disableActions}
                    onClick={() => punch("check_out", "Punched out")}
                  >
                    <Square className="mr-1.5 h-4 w-4" /> Punch out
                  </Button>
                )}
                {!query.isLoading && nextAllowedActions.length === 0 && (
                  <Button asChild variant="outline" className="rounded-full px-5">
                    <Link to="/attendance">View attendance</Link>
                  </Button>
                )}
              </div>
              {!query.isLoading && nextAllowedActions.length === 0 && punchBlockedReason && (
                <p className="max-w-sm text-left text-xs text-muted-foreground sm:text-right">
                  {punchBlockedReason}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x border-t text-center">
          <div className="p-4">
            <p className="text-xs text-muted-foreground">Today</p>
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
              {query.isLoading ? "..." : targetHours}
            </p>
          </div>
        </div>
      </Card>

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
          label="Late arrivals"
          value={query.isLoading ? "..." : numberValue(summary.late)}
          hint="current month"
          icon={AlarmClock}
          tone="warning"
        />
        <StatCard
          label="Attendance days"
          value={query.isLoading ? "..." : numberValue(summary.present)}
          hint="present this month"
          icon={CalendarDays}
          tone="success"
        />
      </div>

      <DataCard title="Weekly balance" description="Off-day work offsets weekday shortage first">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Required"
            value={query.isLoading ? "..." : text(weeklyBalance.required_weekly_hours, "0h 00m")}
            hint="elapsed working days"
            icon={TimerReset}
            tone="primary"
          />
          <StatCard
            label="Shortage"
            value={query.isLoading ? "..." : text(weeklyBalance.weekday_shortage_hours, "0h 00m")}
            hint="before off-day cover"
            icon={AlarmClock}
            tone="warning"
          />
          <StatCard
            label="Off-day cover"
            value={query.isLoading ? "..." : text(weeklyBalance.compensated_hours, "0h 00m")}
            hint="covered by off-day work"
            icon={CalendarDays}
            tone="success"
          />
          <StatCard
            label="Overtime"
            value={query.isLoading ? "..." : text(weeklyBalance.overtime_hours, "0h 00m")}
            hint="after target is met"
            icon={Clock}
            tone="info"
          />
        </div>
      </DataCard>

      <DataCard title="Quick actions" description="Common employee workflows">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Button asChild variant="outline" className="h-12 justify-start rounded-2xl">
            <Link to="/attendance">
              <TimerReset className="mr-2 h-4 w-4" /> Regularize attendance
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 justify-start rounded-2xl">
            <Link to="/leave-wfh">
              <CalendarDays className="mr-2 h-4 w-4" /> Apply leave / WFH
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 justify-start rounded-2xl">
            <Link to="/timesheet">
              <Clock className="mr-2 h-4 w-4" /> Log timesheet
            </Link>
          </Button>
        </div>
      </DataCard>
    </div>
  );
}
