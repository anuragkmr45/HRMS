import { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  /** When false, breadcrumbs are hidden. Defaults to true except for top-level pages. */
  showBreadcrumbs?: boolean;
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  employees: "Employees",
  ems: "EMS",
  attendance: "Attendance",
  "leave-wfh": "Leave & WFH",
  projects: "Projects",
  "team-utilization": "Team Utilization",
  timesheet: "Timesheet",
  expenses: "Expenses",
  assets: "Assets",
  helpdesk: "Helpdesk",
  reports: "Reports",
  "admin-settings": "Admin Settings",
  "master-data": "Master Data",
  "email-templates": "Email Templates",
  approvals: "Approvals",
  inventory: "Inventory",
  warranty: "Warranty",
  requests: "Requests",
  returns: "Returns",
  my: "Mine",
  queue: "Queue",
  sla: "SLA",
  categories: "Categories",
  create: "Create",
  review: "Review",
  director: "Director",
  finance: "Finance",
  register: "Register",
  mapping: "Mapping",
  workflows: "Workflows",
  policies: "Policies",
  notifications: "Notifications",
  security: "Security",
  audit: "Audit",
  roles: "Roles",
  company: "Company",
  calendar: "Calendar",
  exceptions: "Exceptions",
  monitor: "Monitor",
  holidays: "Holidays",
  "apply-leave": "Apply Leave",
  "apply-wfh": "Apply WFH",
  letters: "Letters",
  documents: "Documents",
  profile: "Profile",
  admin: "Admin",
  index: "Overview",
};

function pretty(seg: string) {
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg];
  return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildCrumbs(path: string) {
  const parts = path.split("/").filter(Boolean);
  // Skip detail params (anything that looks like an id)
  const safe = parts.map((p, i) => ({
    raw: p,
    href: "/" + parts.slice(0, i + 1).join("/"),
    isParam: /^(EMP|TKT|EXP|AST|LV|TS|PRJ|AL|EM-|U-|[a-f0-9]{6,})/i.test(p) || /^\$/.test(p),
  }));
  return safe;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  showBreadcrumbs = true,
}: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = buildCrumbs(path);
  const showCrumbs = showBreadcrumbs && crumbs.length > 1;

  return (
    <div className="space-y-3">
      {showCrumbs && (
        <nav
          aria-label="Breadcrumb"
          className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 text-xs text-muted-foreground"
        >
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition hover:bg-accent hover:text-foreground"
          >
            <Home className="h-3 w-3" />
            <span className="hidden sm:inline">Home</span>
          </Link>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            const label = c.isParam ? c.raw : pretty(c.raw);
            return (
              <span key={c.href} className="inline-flex shrink-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 opacity-60" />
                {last || c.isParam ? (
                  <span className={last ? "font-medium text-foreground" : ""}>{label}</span>
                ) : (
                  <Link
                    to={c.href}
                    className="rounded-md px-1.5 py-0.5 transition hover:bg-accent hover:text-foreground"
                  >
                    {label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[26px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
