import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useAdminSettings } from "@/lib/admin-settings-store";
import {
  useAdminAuditLog,
  useAdminEmailTemplates,
  useAdminNotificationChannels,
  useAdminPolicies,
  useAdminWorkflows,
  useCompanyProfile,
  useDepartmentMasters,
  useDesignationMasters,
  useExtendedMasterData,
  useRbacRoles,
} from "@/domains/admin/queries";
import { useApiRouteEnabled } from "@/shared/api";
import {
  Building2,
  Database,
  ShieldCheck,
  GitBranch,
  FileText,
  Mail,
  BellRing,
  Lock,
  ScrollText,
  Users,
  Briefcase,
  Clock,
  Plane,
  Timer,
  Wallet,
  Boxes,
  LifeBuoy,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/")({ component: AdminSettingsIndex });

interface CardDef {
  title: string;
  description: string;
  icon: typeof Building2;
  to: string;
  meta: () => string;
  mainOnly?: boolean;
}

function AdminSettingsIndex() {
  const { activeRole } = useAuth();
  const isMain = activeRole === "main_admin";
  const { company, masters, roles, workflows, templates, notifications, audit } =
    useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const companyQuery = useCompanyProfile(apiEnabled);
  const departmentsQuery = useDepartmentMasters(apiEnabled);
  const designationsQuery = useDesignationMasters(apiEnabled);
  const employmentTypesQuery = useExtendedMasterData("employmentTypes", apiEnabled);
  const workLocationsQuery = useExtendedMasterData("workLocations", apiEnabled);
  const shiftsQuery = useExtendedMasterData("shifts", apiEnabled);
  const rolesQuery = useRbacRoles(apiEnabled && isMain);
  const workflowsQuery = useAdminWorkflows(apiEnabled && isMain);
  const policiesQuery = useAdminPolicies(apiEnabled);
  const templatesQuery = useAdminEmailTemplates(apiEnabled);
  const notificationsQuery = useAdminNotificationChannels(apiEnabled);
  const auditQuery = useAdminAuditLog(apiEnabled && isMain);

  const cards: CardDef[] = [
    {
      title: "Company Profile",
      description: "Identity, currency, timezone & working week.",
      icon: Building2,
      to: "/admin-settings/company",
      meta: () =>
        textMeta(
          apiEnabled,
          companyQuery.isLoading,
          companyQuery.error,
          companyQuery.data?.company_name,
          company.name,
        ),
    },
    {
      title: "Departments",
      description: "Org units that group teams and reporting lines.",
      icon: Users,
      to: "/admin-settings/master-data",
      meta: () =>
        countMeta(
          apiEnabled,
          departmentsQuery.isLoading,
          departmentsQuery.error,
          departmentsQuery.data?.total ?? departmentsQuery.data?.items.length,
          masters.departments.length,
          "configured",
        ),
    },
    {
      title: "Designations",
      description: "Job titles and seniority levels.",
      icon: Users,
      to: "/admin-settings/master-data",
      meta: () =>
        countMeta(
          apiEnabled,
          designationsQuery.isLoading,
          designationsQuery.error,
          designationsQuery.data?.total ?? designationsQuery.data?.items.length,
          masters.designations.length,
          "configured",
        ),
    },
    {
      title: "Employment Types",
      description: "Full-time, part-time, intern, contractor.",
      icon: Users,
      to: "/admin-settings/master-data",
      meta: () =>
        countMeta(
          apiEnabled,
          employmentTypesQuery.isLoading,
          employmentTypesQuery.error,
          employmentTypesQuery.data?.total ?? employmentTypesQuery.data?.items.length,
          masters.employmentTypes.length,
          "configured",
        ),
    },
    {
      title: "Work Locations",
      description: "Offices, hubs and remote regions.",
      icon: Building2,
      to: "/admin-settings/master-data",
      meta: () =>
        countMeta(
          apiEnabled,
          workLocationsQuery.isLoading,
          workLocationsQuery.error,
          workLocationsQuery.data?.total ?? workLocationsQuery.data?.items.length,
          masters.workLocations.length,
          "configured",
        ),
    },
    {
      title: "Shifts",
      description: "Working hours and overlap windows.",
      icon: Clock,
      to: "/admin-settings/master-data",
      meta: () =>
        countMeta(
          apiEnabled,
          shiftsQuery.isLoading,
          shiftsQuery.error,
          shiftsQuery.data?.total ?? shiftsQuery.data?.items.length,
          masters.shifts.length,
          "configured",
        ),
    },
    {
      title: "Roles & Permissions",
      description: "Granular RBAC across every module.",
      icon: ShieldCheck,
      to: "/admin-settings/roles",
      meta: () =>
        countMeta(
          apiEnabled,
          rolesQuery.isLoading,
          rolesQuery.error,
          rolesQuery.data?.total ?? rolesQuery.data?.items.length,
          roles.length,
          "roles",
        ),
      mainOnly: true,
    },
    {
      title: "Approval Workflows",
      description: "Multi-stage approvals with escalations.",
      icon: GitBranch,
      to: "/admin-settings/workflows",
      meta: () =>
        activeRatioMeta(
          apiEnabled,
          workflowsQuery.isLoading,
          workflowsQuery.error,
          workflowsQuery.data?.items,
          workflows,
        ),
      mainOnly: true,
    },
    {
      title: "Leave Policy",
      description: "Quotas, carry-forward, encashment.",
      icon: Plane,
      to: "/admin-settings/policies",
      meta: () => policyMeta(apiEnabled, policiesQuery.isLoading, policiesQuery.error),
    },
    {
      title: "Attendance Policy",
      description: "Grace, half-day and absent rules.",
      icon: Clock,
      to: "/admin-settings/policies",
      meta: () => policyMeta(apiEnabled, policiesQuery.isLoading, policiesQuery.error),
    },
    {
      title: "Timesheet Policy",
      description: "Weekly hours, lock & deadlines.",
      icon: Timer,
      to: "/admin-settings/policies",
      meta: () => policyMeta(apiEnabled, policiesQuery.isLoading, policiesQuery.error),
    },
    {
      title: "Expense Policy",
      description: "Limits, receipts and self-approval rule.",
      icon: Wallet,
      to: "/admin-settings/policies",
      meta: () => policyMeta(apiEnabled, policiesQuery.isLoading, policiesQuery.error),
    },
    {
      title: "Asset Policy",
      description: "Acknowledgements, returns, warranty alerts.",
      icon: Boxes,
      to: "/admin-settings/policies",
      meta: () => policyMeta(apiEnabled, policiesQuery.isLoading, policiesQuery.error),
    },
    {
      title: "Helpdesk SLA",
      description: "Response & resolution targets per priority.",
      icon: LifeBuoy,
      to: "/admin-settings/policies",
      meta: () => policyMeta(apiEnabled, policiesQuery.isLoading, policiesQuery.error),
    },
    {
      title: "Email Templates",
      description: "Transactional emails to employees.",
      icon: Mail,
      to: "/admin-settings/email-templates",
      meta: () =>
        activeRatioMeta(
          apiEnabled,
          templatesQuery.isLoading,
          templatesQuery.error,
          templatesQuery.data?.items,
          templates,
        ),
    },
    {
      title: "Notification Settings",
      description: "Channels and event preferences.",
      icon: BellRing,
      to: "/admin-settings/notifications",
      meta: () =>
        countMeta(
          apiEnabled,
          notificationsQuery.isLoading,
          notificationsQuery.error,
          notificationsQuery.data?.items.length,
          notifications.length,
          "events",
        ),
    },
    {
      title: "Security Settings",
      description: "Passwords, sessions, MFA, attempt limits.",
      icon: Lock,
      to: "/admin-settings/security",
      meta: () => "Configured",
      mainOnly: true,
    },
    {
      title: "Audit Logs",
      description: "Immutable record of critical actions.",
      icon: ScrollText,
      to: "/admin-settings/audit",
      meta: () =>
        countMeta(
          apiEnabled,
          auditQuery.isLoading,
          auditQuery.error,
          auditQuery.data?.total ?? auditQuery.data?.items.length,
          audit.length,
          "entries",
        ),
      mainOnly: true,
    },
  ];

  const visible = cards.filter((c) => isMain || !c.mainOnly);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((c) => (
          <Link key={c.title} to={c.to} className="group">
            <Card className="h-full rounded-2xl border-border/60 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <c.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {c.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    {c.meta()}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function textMeta(
  apiEnabled: boolean,
  loading: boolean,
  error: unknown,
  value: string | null | undefined,
  fallback: string,
) {
  if (!apiEnabled) return fallback;
  if (loading) return "Loading...";
  if (error) return "Load failed";
  return value?.trim() || fallback;
}

function countMeta(
  apiEnabled: boolean,
  loading: boolean,
  error: unknown,
  value: number | undefined,
  fallback: number,
  label: string,
) {
  if (!apiEnabled) return `${fallback} ${label}`;
  if (loading) return "Loading...";
  if (error) return "Load failed";
  return `${value ?? 0} ${label}`;
}

function activeRatioMeta(
  apiEnabled: boolean,
  loading: boolean,
  error: unknown,
  apiItems: Array<{ active?: boolean }> | undefined,
  fallbackItems: Array<{ active?: boolean }>,
) {
  const items = apiEnabled ? apiItems : fallbackItems;
  if (apiEnabled && loading) return "Loading...";
  if (apiEnabled && error) return "Load failed";
  return `${(items ?? []).filter((item) => item.active).length}/${(items ?? []).length} active`;
}

function policyMeta(apiEnabled: boolean, loading: boolean, error: unknown) {
  if (!apiEnabled) return "Configured";
  if (loading) return "Loading...";
  if (error) return "Load failed";
  return "Configured";
}
