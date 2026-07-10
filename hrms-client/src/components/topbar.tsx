import { useRouterState, useNavigate, Link } from "@tanstack/react-router";
import {
  LogOut,
  ChevronDown,
  Check,
  Plus,
  User as UserIcon,
  Settings as SettingsIcon,
  Server,
  WifiOff,
  Briefcase,
  Receipt,
  Plane,
  LifeBuoy,
  Timer,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useApiReady } from "@/domains/platform";
import { useAuth, ROLE_MAP } from "@/lib/auth";
import { UserAvatar } from "@/components/ui-kit/user-avatar";
import { NotificationPanel } from "@/components/ui-kit/notification-panel";
import { isApiEnabled } from "@/shared/api";
import { AppearanceMenuItems } from "@/components/theme/appearance-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/employees": "Employees",
  "/ems": "Employee Self Service",
  "/attendance": "Attendance",
  "/leave-wfh": "Leave & WFH",
  "/projects": "Projects",
  "/team-utilization": "Team Utilization",
  "/timesheet": "Timesheet",
  "/expenses": "Expense Management",
  "/assets": "Assets",
  "/helpdesk": "Helpdesk",
  "/reports": "Reports",
  "/admin-settings": "Admin Settings",
};

interface QuickAction {
  label: string;
  to: string;
  icon: typeof Plus;
  hint: string;
  requires?: string; // role-key
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Apply leave", to: "/leave-wfh/apply-leave", icon: Plane, hint: "Personal" },
  { label: "Submit timesheet", to: "/timesheet", icon: Timer, hint: "Personal" },
  { label: "New expense claim", to: "/expenses/create", icon: Receipt, hint: "Personal" },
  { label: "Raise a ticket", to: "/helpdesk", icon: LifeBuoy, hint: "Support" },
  { label: "Create project", to: "/projects", icon: Briefcase, hint: "Manager" },
];

export function Topbar() {
  const { user, activeRole, setActiveRole, logout } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const apiEnabled = isApiEnabled();
  const apiReady = useApiReady(apiEnabled);
  const title =
    PAGE_TITLES[path] ??
    Object.entries(PAGE_TITLES).find(([k]) => path.startsWith(k + "/"))?.[1] ??
    "Hawkaii HRMS";
  const platformStatus = !apiEnabled
    ? "disabled"
    : apiReady.isLoading
      ? "checking"
      : apiReady.data?.status === "ok"
        ? "ready"
        : "unavailable";
  const platformLabel =
    platformStatus === "ready"
      ? "Connected"
      : platformStatus === "checking"
        ? "Checking connection"
        : platformStatus === "disabled"
          ? "Connection not configured"
          : "Connection unavailable";

  if (!user || !activeRole) return null;
  const switchableRoles = Array.from(new Set(user.roles));

  return (
    <header className="glass-topbar sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 sm:px-6">
      <SidebarTrigger className="text-muted-foreground" />

      {/* Page title */}
      <div className="ml-1 hidden min-w-0 sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          Hawkaii HRMS
        </p>
        <h1 className="-mt-0.5 truncate text-sm font-semibold">{title}</h1>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Quick action menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="hidden rounded-full text-primary-foreground shadow-sm lg:inline-flex"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Plus className="mr-1 h-4 w-4" /> Quick action
              <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Create
            </DropdownMenuLabel>
            {QUICK_ACTIONS.map((a) => (
              <DropdownMenuItem key={a.to} asChild>
                <Link to={a.to} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <a.icon className="h-4 w-4 text-muted-foreground" />
                    {a.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                    {a.hint}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <NotificationPanel />

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={platformLabel}
              className="glass-control inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground"
            >
              {platformStatus === "ready" ? (
                <Server className="h-4 w-4 text-success" />
              ) : (
                <WifiOff
                  className={`h-4 w-4 ${platformStatus === "checking" ? "text-warning" : "text-destructive"}`}
                />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>{platformLabel}</TooltipContent>
        </Tooltip>

        <ThemeToggle className="hidden lg:inline-flex" />

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="glass-control flex items-center gap-2 rounded-full border px-1.5 py-1 text-left transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
              aria-label="Account menu"
            >
              <UserAvatar name={user.name} size="sm" />
              <div className="hidden pr-1 text-xs leading-tight lg:block">
                <p className="font-semibold">{user.name.split(" ")[0]}</p>
                <p className="text-muted-foreground">{ROLE_MAP[activeRole].label}</p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground lg:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="font-semibold">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/ems">
                <UserIcon className="mr-2 h-4 w-4" /> My Profile
              </Link>
            </DropdownMenuItem>
            {(activeRole === "main_admin" || activeRole === "hr_admin") && (
              <DropdownMenuItem asChild>
                <Link to="/admin-settings">
                  <SettingsIcon className="mr-2 h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
            )}
            <AppearanceMenuItems />
            {switchableRoles.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Active role
                </DropdownMenuLabel>
                {switchableRoles.map((role) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => setActiveRole(role)}
                    className={role === activeRole ? "font-medium text-primary" : undefined}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${role === activeRole ? "opacity-100" : "opacity-0"}`}
                    />
                    {ROLE_MAP[role].label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
