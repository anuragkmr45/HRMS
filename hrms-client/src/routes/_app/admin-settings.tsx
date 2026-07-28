import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Building2,
  Database,
  ShieldCheck,
  GitBranch,
  FileText,
  Mail,
  BellRing,
  Lock,
  ScrollText,
  CalendarClock,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("hawkaii_session");
      const role = raw ? (JSON.parse(raw).role as string | null) : null;
      if (role && role !== "main_admin" && role !== "hr_admin") {
        throw redirect({ to: "/dashboard" });
      }
    } catch (e) {
      if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
    }
  },
  component: AdminSettingsLayout,
});

interface Tab {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  mainOnly?: boolean;
  exact?: boolean;
}

const TABS: Tab[] = [
  { to: "/admin-settings", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin-settings/company", label: "Company", icon: Building2 },
  { to: "/admin-settings/master-data", label: "Master Data", icon: Database },
  { to: "/admin-settings/shifts", label: "Shifts", icon: CalendarClock },
  { to: "/admin-settings/roles", label: "Roles & Permissions", icon: ShieldCheck, mainOnly: true },
  { to: "/admin-settings/workflows", label: "Approval Workflows", icon: GitBranch, mainOnly: true },
  { to: "/admin-settings/policies", label: "Policies", icon: FileText },
  { to: "/admin-settings/email-templates", label: "Email Templates", icon: Mail },
  { to: "/admin-settings/notifications", label: "Notifications", icon: BellRing },
  { to: "/admin-settings/security", label: "Security", icon: Lock, mainOnly: true },
  { to: "/admin-settings/audit", label: "Audit Logs", icon: ScrollText, mainOnly: true },
];

function AdminSettingsLayout() {
  const { activeRole } = useAuth();
  const isMain = activeRole === "main_admin";
  const visible = TABS.filter((t) => isMain || !t.mainOnly);

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Admin Settings"
        description={
          isMain
            ? "Configure your company, master data, RBAC, approval workflows, policies and security."
            : "Manage HR-related configuration: master data, policies, templates and notifications."
        }
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in">
        <Outlet />
      </div>
    </>
  );
}
