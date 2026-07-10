import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataCard, StatusBadge, EmptyState } from "@/components/ui-kit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { useAttendanceMonthlyCalendar } from "@/domains/attendance";
import {
  asArray,
  asRecord,
  numberValue,
  text,
  userFacingErrorMessage,
  type ApiRecord,
} from "@/shared/api";

export const Route = createFileRoute("/_app/attendance/calendar")({
  component: AttendanceCalendar,
});

const ATTENDANCE_OVERSIGHT_ROLES: Role[] = ["hr_admin", "main_admin", "manager"];

type DayStatus = "present" | "wfh" | "late" | "absent" | "leave" | "weekend" | "holiday" | "future";

const STATUS_CLS: Record<DayStatus, string> = {
  present: "bg-success/15 text-success border-success/30",
  wfh: "bg-info/15 text-info border-info/30",
  late: "bg-warning/20 text-warning-foreground border-warning/40 dark:bg-warning/15 dark:text-warning dark:border-warning/30",
  absent: "bg-destructive/15 text-destructive border-destructive/30",
  leave: "bg-primary-soft text-primary border-primary/30",
  weekend: "bg-muted text-muted-foreground/60 border-border",
  holiday: "bg-info/15 text-info border-info/30",
  future: "bg-background text-muted-foreground/40 border-dashed border-border",
};

function monthValue(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function records(value: unknown): ApiRecord[] {
  return asArray(value).map(asRecord);
}

function dayNumber(record: ApiRecord): number {
  const date = text(record.work_date);
  const day = Number(date.slice(-2));
  return Number.isFinite(day) ? day : 0;
}

function dayStatus(record: ApiRecord | undefined): DayStatus {
  const status = text(record?.status, "future");
  return status in STATUS_CLS ? (status as DayStatus) : "future";
}

const STATUS_LABELS: Record<DayStatus, string> = {
  present: "Present",
  wfh: "WFH",
  late: "Late",
  absent: "Absent",
  leave: "Leave",
  weekend: "Non-working",
  holiday: "Holiday",
  future: "Upcoming",
};

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "Attendance calendar request failed.");
}

function selectedDayDetail(record: ApiRecord | undefined, status: DayStatus): string {
  if (!record) return "No attendance for this day.";
  const detail = text(record.detail);
  if (detail && detail !== "No attendance for this day") return detail;
  if (status === "holiday") return text(record.note, "Company holiday");
  if (status === "weekend") return "Company non-working day";
  if (status === "future") return "Upcoming day";
  return detail || "No attendance for this day.";
}

function AttendanceCalendar() {
  const { activeRole } = useAuth();
  if (activeRole && ATTENDANCE_OVERSIGHT_ROLES.includes(activeRole)) {
    return <Navigate to="/attendance" />;
  }

  return <EmployeeAttendanceCalendar />;
}

function EmployeeAttendanceCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<number>(today.getDate());
  const query = useAttendanceMonthlyCalendar({
    month: monthValue(cursor.y, cursor.m),
    page: 1,
    page_size: 40,
  });
  const payload = asRecord(query.data);
  const calendarDays = records(payload.calendar_days);
  const summary = asRecord(payload.summary);
  const data = useMemo(() => {
    const map = new Map<number, ApiRecord>();
    for (const record of calendarDays) map.set(dayNumber(record), record);
    return map;
  }, [calendarDays]);

  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const selectedRecord = data.get(selected);
  const selectedStatus = dayStatus(selectedRecord);

  return (
    <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-3">
      <Card className="rounded-2xl border-border/60 p-5 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{monthName}</h3>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={prev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={next}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {query.isError ? (
          <EmptyState title="Could not load calendar" description={errorMessage(query.error)} />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={"e" + i} />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const day = i + 1;
                const record = data.get(day);
                const status = dayStatus(record);
                const isSelected = day === selected;
                return (
                  <button
                    key={day}
                    onClick={() => setSelected(day)}
                    className={cn(
                      "relative aspect-square rounded-xl border p-1.5 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-sm",
                      STATUS_CLS[status],
                      isSelected && "ring-2 ring-primary ring-offset-1",
                      query.isLoading && "animate-pulse",
                    )}
                  >
                    <span className="font-semibold">{day}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              {(
                ["present", "wfh", "late", "absent", "leave", "holiday", "weekend"] as DayStatus[]
              ).map((status) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 rounded-full border",
                      STATUS_CLS[status],
                    )}
                  />
                  <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <div className="space-y-4">
        <DataCard
          title={`Day ${selected}`}
          description={new Date(cursor.y, cursor.m, selected).toDateString()}
        >
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading day attendance...</p>
          ) : selectedRecord ? (
            <div className="space-y-3 text-sm">
              <StatusBadge
                status={selectedStatus === "leave" ? "approved" : selectedStatus}
                label={STATUS_LABELS[selectedStatus]}
              />
              {(text(selectedRecord.in_time) ||
                text(selectedRecord.out_time) ||
                numberValue(selectedRecord.work_minutes) > 0) && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/40 p-2">
                    <p className="text-[11px] text-muted-foreground">In</p>
                    <p className="font-semibold tabular-nums">
                      {text(selectedRecord.in_time, "-")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-2">
                    <p className="text-[11px] text-muted-foreground">Out</p>
                    <p className="font-semibold tabular-nums">
                      {text(selectedRecord.out_time, "-")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-2">
                    <p className="text-[11px] text-muted-foreground">Hours</p>
                    <p className="font-semibold tabular-nums">
                      {text(selectedRecord.hours, "0h 00m")}
                    </p>
                  </div>
                </div>
              )}
              <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                {selectedDayDetail(selectedRecord, selectedStatus)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance for this day.</p>
          )}
        </DataCard>

        <DataCard title="Month summary">
          <ul className="space-y-2 text-sm">
            {(
              [
                ["present", "Present"],
                ["wfh", "WFH"],
                ["late", "Late"],
                ["absent", "Absent"],
                ["leave", "On leave"],
                ["holiday", "Holiday"],
              ] as [DayStatus, string][]
            ).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">
                  {query.isLoading ? "..." : numberValue(summary[key])}
                </span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </div>
  );
}
