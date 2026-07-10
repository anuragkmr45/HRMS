import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { StatCard, StatusBadge, DataCard, EmptyState } from "@/components/ui-kit";
import {
  mapLetter,
  mapPolicy,
  mapProfile,
  useEmsLetters,
  useEmsPolicies,
  useEmsProfile,
} from "@/domains/ems";
import { useMyAttendanceSummary } from "@/domains/attendance";
import { currentLocalMonth, liveAttendanceToday, localIsoDate } from "@/domains/attendance/live";
import { useHolidays, useMyLeaveBalances, useMyWfhRequests } from "@/domains/leave-wfh";
import {
  asArray,
  asRecord,
  numberValue,
  pageItems,
  text,
  useApiRouteEnabled,
  userFacingErrorMessage,
  type ApiRecord,
} from "@/shared/api";
import {
  Briefcase,
  Mail,
  Phone,
  MapPin,
  Calendar,
  CalendarDays,
  Clock,
  Timer,
  Receipt,
  Laptop,
  LifeBuoy,
  FileText,
  Megaphone,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_app/ems/")({
  component: EmsDashboard,
});

const SELF_ATTENDANCE_EXCLUDED_ROLES = new Set(["hr_admin", "main_admin", "manager"]);

const ANNOUNCEMENTS = [
  {
    id: 1,
    title: "Q2 Town Hall — May 22",
    body: "Join the all-hands at 4 PM IST. Calendar invite shared.",
    tag: "Company",
  },
  {
    id: 2,
    title: "New leave policy effective June 1",
    body: "Earned leave accrual updated to 1.75 days/month.",
    tag: "HR",
  },
  {
    id: 3,
    title: "Office maintenance — 18 May",
    body: "BLR HQ closed for AC servicing. Plan WFH.",
    tag: "Facilities",
  },
];

const HOLIDAYS = [
  { name: "Buddha Purnima", date: "May 11, 2026", region: "IN" },
  { name: "Memorial Day", date: "May 26, 2026", region: "US" },
  { name: "Eid ul-Adha", date: "Jun 06, 2026", region: "AE / IN" },
];

const DAY_MS = 86_400_000;

function addDaysIso(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00.000Z") + days * DAY_MS).toISOString().slice(0, 10);
}

function weekRangeFor(date: string): { from: string; to: string } {
  const start = new Date(date + "T00:00:00.000Z");
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function shortDate(date: string): string {
  if (!date) return "";
  return new Date(date + "T00:00:00.000Z").toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function attendanceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    present: "Present",
    late: "Late",
    absent: "Absent",
    wfh: "WFH",
    leave: "On leave",
    weekend: "Off",
    holiday: "Holiday",
    future: "Pending",
  };
  return labels[status] ?? "No record";
}

function attendanceTone(
  status: string,
): "primary" | "success" | "warning" | "info" | "destructive" {
  if (status === "late") return "warning";
  if (status === "absent") return "destructive";
  if (["wfh", "leave", "holiday", "weekend"].includes(status)) return "info";
  return "success";
}

function queryHint(error: unknown, fallback: string): string {
  return userFacingErrorMessage(error, fallback);
}

function recordDate(record: ApiRecord): string {
  return text(record.date) || text(record.holiday_date) || text(record.work_date);
}

function durationOf(record: ApiRecord): number {
  return numberValue(record.duration, numberValue(record.days, 1));
}

function EmsDashboard() {
  const { user, activeRole } = useAuth();
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const profileQuery = useEmsProfile(apiEnabled);
  const policiesQuery = useEmsPolicies({ page: 1, page_size: 10 }, apiEnabled);
  const lettersQuery = useEmsLetters({ page: 1, page_size: 10 }, apiEnabled);
  const [now, setNow] = useState(new Date());
  const todayIso = localIsoDate();
  const weekRange = useMemo(() => weekRangeFor(todayIso), [todayIso]);
  const hasSelfAttendance = !activeRole || !SELF_ATTENDANCE_EXCLUDED_ROLES.has(activeRole);
  const attendanceQuery = useMyAttendanceSummary(
    { date_from: todayIso, date_to: todayIso, month: currentLocalMonth() },
    apiEnabled && hasSelfAttendance,
  );
  const leaveBalancesQuery = useMyLeaveBalances(
    { year: Number(todayIso.slice(0, 4)), page: 1, page_size: 25 },
    apiEnabled,
  );
  const wfhQuery = useMyWfhRequests(
    { date_from: weekRange.from, date_to: weekRange.to, page: 1, page_size: 25 },
    apiEnabled,
  );
  const holidaysQuery = useHolidays(
    { year: Number(todayIso.slice(0, 4)), page: 1, page_size: 50 },
    apiEnabled,
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const showDemoData = !apiEnabled;
  if (!user) return null;
  const apiProfile = profileQuery.data ? mapProfile(profileQuery.data) : null;
  const policyRows = apiEnabled ? pageItems(policiesQuery.data).map(mapPolicy) : [];
  const letterRows = apiEnabled ? pageItems(lettersQuery.data).map(mapLetter) : [];
  const pendingPolicies = policyRows.filter(
    (policy) => policy.acknowledgementStatus === "pending",
  ).length;
  const availableLetters = letterRows.filter((letter) => letter.status === "available").length;
  const attendancePayload = asRecord(attendanceQuery.data);
  const todayRecord = asRecord(attendancePayload.today);
  const liveToday = liveAttendanceToday(todayRecord, attendancePayload.generated_at, now);
  const todayStatus = text(todayRecord.status);
  const todayValue = !hasSelfAttendance
    ? "N/A"
    : attendanceQuery.isLoading
      ? "..."
      : attendanceQuery.isError
        ? "Issue"
        : attendanceStatusLabel(todayStatus);
  const todayHint = !hasSelfAttendance
    ? "Not required for this role"
    : attendanceQuery.isLoading
      ? "Loading live attendance"
      : attendanceQuery.isError
        ? queryHint(attendanceQuery.error, "Attendance unavailable")
        : text(todayRecord.in_time)
          ? `In ${text(todayRecord.in_time)} · ${liveToday.hours}`
          : text(todayRecord.detail, "No punch-in recorded");
  const leaveBalances = asArray(asRecord(leaveBalancesQuery.data).balances).map(asRecord);
  const leaveAvailable = leaveBalances.reduce((total, balance) => {
    const leaveType = text(balance.leave_type);
    return leaveType === "unpaid" ? total : total + numberValue(balance.available);
  }, 0);
  const leavePending = leaveBalances.reduce(
    (total, balance) => total + numberValue(balance.pending),
    0,
  );
  const leaveValue = leaveBalancesQuery.isLoading
    ? "..."
    : leaveBalancesQuery.isError
      ? "Issue"
      : formatDays(leaveAvailable);
  const leaveHint = leaveBalancesQuery.isLoading
    ? "Loading leave balance"
    : leaveBalancesQuery.isError
      ? queryHint(leaveBalancesQuery.error, "Leave balance unavailable")
      : leavePending > 0
        ? `${formatDays(leavePending)} pending approval`
        : "available days";
  const wfhRows = pageItems<ApiRecord>(wfhQuery.data).map(asRecord);
  const approvedWfhDays = wfhRows
    .filter((request) => text(request.status) === "approved")
    .reduce((total, request) => total + durationOf(request), 0);
  const pendingWfhDays = wfhRows
    .filter((request) => text(request.status) === "pending_manager")
    .reduce((total, request) => total + durationOf(request), 0);
  const holidayRows = asArray(asRecord(holidaysQuery.data).holidays)
    .map(asRecord)
    .filter((holiday) => {
      const date = recordDate(holiday);
      return date >= todayIso && date <= addDaysIso(todayIso, 30);
    })
    .sort((left, right) => recordDate(left).localeCompare(recordDate(right)))
    .slice(0, 4);
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="space-y-6 pt-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="glass-panel ems-profile-card rounded-2xl border-border/60 lg:col-span-1">
          <div className="p-6 text-center" style={{ background: "var(--gradient-hero)" }}>
            <Avatar className="mx-auto h-20 w-20 ring-4 ring-background">
              {apiProfile?.user.profilePhotoUrl && (
                <AvatarImage src={apiProfile.user.profilePhotoUrl} alt={apiProfile.user.fullName} />
              )}
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h3 className="mt-3 text-lg font-semibold">{apiProfile?.user.fullName ?? user.name}</h3>
            <p className="text-xs text-muted-foreground">
              {apiProfile?.designation ?? user.designation}
            </p>
            <span className="mt-3 inline-flex rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
              {activeRole && ROLE_LABELS[activeRole]}
            </span>
          </div>
          <ul className="space-y-3 p-6 text-sm">
            <li className="flex items-center gap-2.5 text-muted-foreground">
              <Mail className="h-4 w-4" /> {apiProfile?.user.email ?? user.email}
            </li>
            <li className="flex items-center gap-2.5 text-muted-foreground">
              <Briefcase className="h-4 w-4" /> {apiProfile?.department ?? user.department}
            </li>
            <li className="flex items-center gap-2.5 text-muted-foreground">
              <MapPin className="h-4 w-4" />{" "}
              {apiProfile?.city
                ? `${apiProfile.city}, ${apiProfile.country}`
                : showDemoData
                  ? "Bangalore, IN"
                  : "Location not set"}
            </li>
            <li className="flex items-center gap-2.5 text-muted-foreground">
              <Phone className="h-4 w-4" />{" "}
              {apiProfile?.phone ?? (showDemoData ? "+91 98xxx xxxxx" : "Phone not set")}
            </li>
            <li className="flex items-center gap-2.5 text-muted-foreground">
              <Calendar className="h-4 w-4" /> Joined{" "}
              {apiProfile?.joinedOn ?? (showDemoData ? "Mar 2022" : "not set")}
            </li>
          </ul>
          <div className="border-t p-4">
            <Button asChild variant="outline" className="w-full rounded-full">
              <Link to="/ems/profile">View profile</Link>
            </Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label={hasSelfAttendance ? "Today" : "Attendance"}
              value={showDemoData && hasSelfAttendance ? "Present" : todayValue}
              hint={showDemoData && hasSelfAttendance ? "In at 09:08" : todayHint}
              icon={Clock}
              tone={
                !hasSelfAttendance
                  ? "info"
                  : showDemoData
                    ? "success"
                    : attendanceQuery.isError
                      ? "destructive"
                      : attendanceTone(todayStatus)
              }
              className="ems-kpi-card"
            />
            <StatCard
              label="Leave balance"
              value={showDemoData ? "12" : leaveValue}
              hint={showDemoData ? "days remaining" : leaveHint}
              tone="info"
              className="ems-kpi-card"
            />
            <StatCard
              label="Pending policies"
              value={apiEnabled ? pendingPolicies : "1"}
              hint="to acknowledge"
              icon={Timer}
              tone="warning"
              className="ems-kpi-card"
            />
            <StatCard
              label="Available letters"
              value={apiEnabled ? availableLetters : "2"}
              hint="ready to review"
              icon={Receipt}
              tone="primary"
              className="ems-kpi-card"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DataCard
              title="My WFH this week"
              description={
                showDemoData ? "Hybrid policy: 2 days/week" : "Approved and pending requests"
              }
              className="glass-panel ems-profile-card"
            >
              {showDemoData ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">WFH used</span>
                    <span className="font-semibold">1 / 2 days</span>
                  </div>
                  <Progress value={50} className="h-2" />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
                      <StatusBadge key={d} status={i === 2 ? "wfh" : "present"} label={d} />
                    ))}
                  </div>
                </div>
              ) : wfhQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading WFH requests...</p>
              ) : wfhQuery.isError ? (
                <EmptyState
                  icon={CalendarDays}
                  title="Could not load WFH"
                  description={queryHint(wfhQuery.error, "WFH requests unavailable")}
                />
              ) : approvedWfhDays > 0 || pendingWfhDays > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">This week</span>
                    <span className="font-semibold">
                      {formatDays(approvedWfhDays)} approved · {formatDays(pendingWfhDays)} pending
                    </span>
                  </div>
                  <Progress value={Math.min(100, approvedWfhDays * 50)} className="h-2" />
                  <div className="space-y-2">
                    {wfhRows.slice(0, 3).map((request) => (
                      <div
                        key={text(request.id) || text(request.request_code)}
                        className="ems-inline-row flex items-center justify-between rounded-xl px-3 py-2 text-sm"
                      >
                        <span className="font-medium">
                          {shortDate(text(request.date_from))} - {shortDate(text(request.date_to))}
                        </span>
                        <StatusBadge
                          status={text(request.status) === "approved" ? "approved" : "pending"}
                          label={text(request.status) === "approved" ? "Approved" : "Pending"}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No WFH this week"
                  description="Approved or pending WFH requests for this week will appear here."
                  action={
                    <Button asChild variant="outline" className="rounded-full">
                      <Link to="/leave-wfh">Open Leave & WFH</Link>
                    </Button>
                  }
                />
              )}
            </DataCard>

            <DataCard
              title="My assets"
              description={showDemoData ? "3 assigned to you" : "Live inventory opens in Assets"}
              className="glass-panel ems-profile-card"
            >
              {showDemoData ? (
                <ul className="space-y-2.5 text-sm">
                  {[
                    { name: "MacBook Pro 14” M3", tag: "AST-2041" },
                    { name: "Dell U2723QE Monitor", tag: "AST-1188" },
                    { name: "Logitech MX Keys", tag: "AST-0902" },
                  ].map((a) => (
                    <li
                      key={a.tag}
                      className="ems-inline-row flex items-center justify-between rounded-xl px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <Laptop className="h-4 w-4 text-primary" />
                        <span className="font-medium">{a.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{a.tag}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={Laptop}
                  title="No live asset summary here"
                  description="Assigned assets are managed in the Assets module."
                  action={
                    <Button asChild variant="outline" className="rounded-full">
                      <Link to="/assets/my">Open my assets</Link>
                    </Button>
                  }
                />
              )}
            </DataCard>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard
          title="Company announcements"
          description="Latest updates from leadership and HR"
          className="glass-panel ems-profile-card lg:col-span-2"
        >
          {showDemoData ? (
            <ul className="divide-y">
              {ANNOUNCEMENTS.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {a.tag}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Announcements will appear after they are published for this workspace."
            />
          )}
        </DataCard>

        <DataCard
          title="Upcoming holidays"
          description="Next 30 days"
          className="glass-panel ems-profile-card"
        >
          {showDemoData ? (
            <ul className="space-y-3">
              {HOLIDAYS.map((h) => (
                <li key={h.name} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.region}</p>
                  </div>
                  <span className="text-xs font-semibold text-primary">{h.date}</span>
                </li>
              ))}
            </ul>
          ) : holidaysQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading holidays...</p>
          ) : holidaysQuery.isError ? (
            <EmptyState
              icon={CalendarDays}
              title="Could not load holidays"
              description={queryHint(holidaysQuery.error, "Holiday calendar unavailable")}
            />
          ) : holidayRows.length > 0 ? (
            <ul className="space-y-3">
              {holidayRows.map((holiday) => {
                const date = recordDate(holiday);
                return (
                  <li
                    key={text(holiday.id) || date}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <p className="font-medium">{text(holiday.name, "Holiday")}</p>
                      <p className="text-xs text-muted-foreground">
                        {text(holiday.region, "Company")}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-primary">{shortDate(date)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No holidays in the next 30 days"
              description="Company holidays configured by Admin will appear here."
              action={
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/leave-wfh/holidays">Open holidays</Link>
                </Button>
              }
            />
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DataCard
          title="My helpdesk tickets"
          description="Recent activity"
          className="glass-panel ems-profile-card"
        >
          {showDemoData ? (
            <ul className="space-y-2.5 text-sm">
              {[
                {
                  id: "TKT-12044",
                  subject: "Mac running slow after update",
                  status: "in_progress",
                },
                { id: "TKT-12012", subject: "VPN reconnect prompt", status: "closed" },
              ].map((t) => (
                <li
                  key={t.id}
                  className="ems-inline-row flex items-center justify-between rounded-xl px-3 py-2.5"
                >
                  <div>
                    <p className="font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">{t.id}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={LifeBuoy}
              title="No live ticket summary here"
              description="Use Helpdesk to view and raise real tickets."
              action={
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/helpdesk/my">Open my tickets</Link>
                </Button>
              }
            />
          )}
        </DataCard>

        <DataCard
          title="My documents"
          description="Personal documents"
          className="glass-panel ems-profile-card"
        >
          {showDemoData ? (
            <ul className="space-y-2.5 text-sm">
              {[
                { name: "Offer Letter", status: "verified" },
                { name: "ID Proof — Passport", status: "verified" },
                { name: "Address Proof", status: "pending" },
              ].map((d) => (
                <li
                  key={d.name}
                  className="ems-inline-row flex items-center justify-between rounded-xl px-3 py-2.5"
                >
                  <span className="font-medium">{d.name}</span>
                  <StatusBadge
                    status={d.status === "verified" ? "completed" : "pending"}
                    label={d.status === "verified" ? "Verified" : "Pending"}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FileText}
              title="Open documents for live files"
              description="Your uploaded and generated documents are listed in the Documents tab."
              action={
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/ems/documents">Open documents</Link>
                </Button>
              }
            />
          )}
        </DataCard>
      </div>
    </div>
  );
}
