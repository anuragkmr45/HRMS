import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { LayoutDashboard, CalendarDays, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendanceLayout,
});

const ATTENDANCE_ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];
const ATTENDANCE_OVERSIGHT_ROLES: Role[] = ["hr_admin", "main_admin", "manager"];

const TABS = [
  { to: "/attendance", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/attendance/calendar", label: "Calendar", icon: CalendarDays, selfOnly: true },
  { to: "/attendance/exceptions", label: "Exceptions", icon: AlertTriangle, adminOnly: true },
];

function AttendanceLayout() {
  const { activeRole } = useAuth();
  const isAdminRole = activeRole && ATTENDANCE_ADMIN_ROLES.includes(activeRole);
  const isOversightRole = activeRole && ATTENDANCE_OVERSIGHT_ROLES.includes(activeRole);
  const visible = TABS.filter((tab) => {
    if (tab.adminOnly) return isAdminRole;
    if (tab.selfOnly) return !isOversightRole;
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
