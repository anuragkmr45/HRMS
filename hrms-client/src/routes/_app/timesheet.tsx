import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { LayoutDashboard, FileCheck2, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_app/timesheet")({
  component: TimesheetLayout,
});

const APPROVER_ROLES: Role[] = ["manager", "main_admin", "hr_admin", "project_manager"];
const PM_ROLES: Role[] = ["project_manager", "main_admin"];
const SELF_TIMESHEET_ROLES: Role[] = [
  "employee",
  "manager",
  "director",
  "project_manager",
  "finance_manager",
];

const TABS = [
  {
    to: "/timesheet",
    label: "My timesheet",
    icon: LayoutDashboard,
    exact: true,
    roles: SELF_TIMESHEET_ROLES,
  },
  { to: "/timesheet/approvals", label: "Approvals", icon: FileCheck2, roles: APPROVER_ROLES },
  { to: "/timesheet/projects", label: "Project view", icon: Briefcase, roles: PM_ROLES },
];

function TimesheetLayout() {
  const { activeRole } = useAuth();
  const isAdminRole = activeRole === "main_admin" || activeRole === "hr_admin";
  const visible = TABS.filter((t) => !t.roles || (activeRole && t.roles.includes(activeRole)));

  return (
    <>
      <PageHeader
        eyebrow="Time"
        title="Timesheet"
        description={
          isAdminRole
            ? "Review submitted timesheets, approval queues, and project utilization."
            : "Log time against projects, submit weekly, and approve at speed."
        }
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in">
        <Outlet />
      </div>
    </>
  );
}
