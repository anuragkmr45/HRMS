import { Link } from "@tanstack/react-router";
import { AlarmClock, CalendarDays, Clock, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeManualAttendanceWidget, useMyAttendanceSummary } from "@/domains/attendance";
import { DataCard, EmptyState, StatCard } from "@/components/ui-kit";
import { currentLocalMonth, formatAttendanceMinutes } from "@/domains/attendance/live";
import { asRecord, numberValue, text, userFacingErrorMessage } from "@/shared/api";

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
  const query = useMyAttendanceSummary({ month: currentMonth(), page: 1, page_size: 50 });
  const data = asRecord(query.data);
  const summary = asRecord(data.summary);
  const weeklyBalance = asRecord(data.weekly_balance ?? summary.weekly_balance);

  if (query.isError) {
    return (
      <div className="space-y-4">
        <EmployeeManualAttendanceWidget variant="compact" sourceView="dashboard" />
        <DataCard
          title="Attendance summary unavailable"
          description="Monthly and weekly totals"
          actions={
            <Button asChild variant="outline">
              <Link to="/attendance">Open attendance</Link>
            </Button>
          }
        >
          <EmptyState title="Could not load attendance" description={errorMessage(query.error)} />
        </DataCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <EmployeeManualAttendanceWidget variant="compact" sourceView="dashboard" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="MTD work hours"
          value={query.isLoading ? "..." : formatMinutes(numberValue(summary.work_minutes))}
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
