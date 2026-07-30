import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { attendanceAccessForRole } from "@/domains/attendance";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, CalendarDays, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendanceLayout,
});

const TABS = [
  { to: "/attendance", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/attendance/calendar", label: "Calendar", icon: CalendarDays, capability: "self" },
  {
    to: "/attendance/exceptions",
    label: "Review queue",
    icon: ClipboardCheck,
    capability: "review",
  },
];

function AttendanceLayout() {
  const { activeRole } = useAuth();
  const access = attendanceAccessForRole(activeRole);
  if (!access.canViewAttendance) return <Navigate to="/dashboard" />;

  const visible = TABS.filter((tab) => {
    if (tab.capability === "self") return access.canViewSelfAttendance;
    if (tab.capability === "review") return access.canViewReviewQueue;
    return true;
  });

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Attendance"
        description="Track punch-ins, work hours, exceptions and team-wide presence."
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in">
        <Outlet />
      </div>
    </>
  );
}
