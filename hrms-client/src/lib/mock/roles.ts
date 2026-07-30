export type Role =
  | "main_admin"
  | "hr_admin"
  | "employee"
  | "manager"
  | "director"
  | "auditor"
  | "project_manager"
  | "finance_manager"
  | "asset_admin"
  | "helpdesk_agent";

export interface RoleDefinition {
  key: Role;
  label: string;
  short: string;
  description: string;
  color: "primary" | "info" | "success" | "warning";
  modules: string[]; // route paths the role can access
}

export const ROLES: RoleDefinition[] = [
  {
    key: "main_admin",
    label: "Main Admin",
    short: "MA",
    description: "Full access to every workspace module and configuration.",
    color: "primary",
    modules: [
      "/dashboard",
      "/employees",
      "/ems",
      "/attendance",
      "/leave-wfh",
      "/projects",
      "/team-utilization",
      "/timesheet",
      "/expenses",
      "/assets",
      "/helpdesk",
      "/reports",
      "/admin-settings",
    ],
  },
  {
    key: "hr_admin",
    label: "HR Admin",
    short: "HR",
    description: "People operations: directory, attendance, leave and reports.",
    color: "primary",
    modules: [
      "/dashboard",
      "/employees",
      "/ems",
      "/attendance",
      "/leave-wfh",
      "/timesheet",
      "/helpdesk",
      "/reports",
      "/admin-settings",
    ],
  },
  {
    key: "employee",
    label: "Employee",
    short: "EM",
    description: "Self-service hub for personal data and day-to-day workflows.",
    color: "info",
    modules: [
      "/dashboard",
      "/ems",
      "/attendance",
      "/leave-wfh",
      "/timesheet",
      "/expenses",
      "/assets",
      "/helpdesk",
    ],
  },
  {
    key: "manager",
    label: "Manager",
    short: "MG",
    description: "Manage your reporting team's approvals and utilization.",
    color: "info",
    modules: [
      "/dashboard",
      "/employees",
      "/ems",
      "/attendance",
      "/leave-wfh",
      "/projects",
      "/team-utilization",
      "/timesheet",
      "/expenses",
      "/helpdesk",
      "/reports",
    ],
  },
  {
    key: "director",
    label: "Director",
    short: "DR",
    description: "Leadership view for team, reports and approval oversight.",
    color: "info",
    modules: [
      "/dashboard",
      "/employees",
      "/ems",
      "/attendance",
      "/leave-wfh",
      "/projects",
      "/team-utilization",
      "/timesheet",
      "/expenses",
      "/helpdesk",
      "/reports",
    ],
  },
  {
    key: "auditor",
    label: "Auditor",
    short: "AU",
    description: "Read-only governance and audit reporting.",
    color: "warning",
    modules: ["/dashboard", "/attendance", "/expenses", "/assets", "/helpdesk", "/reports"],
  },
  {
    key: "project_manager",
    label: "Project Manager",
    short: "PM",
    description: "Run projects, allocations, timesheets and delivery tracking.",
    color: "info",
    modules: [
      "/dashboard",
      "/ems",
      "/attendance",
      "/projects",
      "/team-utilization",
      "/timesheet",
      "/expenses",
      "/helpdesk",
      "/reports",
    ],
  },
  {
    key: "finance_manager",
    label: "Finance Manager",
    short: "FM",
    description: "Process expenses, settlements and finance-grade reporting.",
    color: "success",
    modules: [
      "/dashboard",
      "/ems",
      "/attendance",
      "/expenses",
      "/timesheet",
      "/reports",
      "/helpdesk",
    ],
  },
  {
    key: "asset_admin",
    label: "Asset / IT Admin",
    short: "IT",
    description: "Hardware lifecycle, allocations and IT helpdesk.",
    color: "warning",
    modules: ["/dashboard", "/ems", "/attendance", "/assets", "/helpdesk", "/reports"],
  },
  {
    key: "helpdesk_agent",
    label: "Helpdesk Agent",
    short: "HD",
    description: "Triage, resolve and close employee support tickets.",
    color: "warning",
    modules: ["/dashboard", "/ems", "/helpdesk", "/reports"],
  },
];

export const ROLE_MAP: Record<Role, RoleDefinition> = ROLES.reduce(
  (acc, r) => ({ ...acc, [r.key]: r }),
  {} as Record<Role, RoleDefinition>,
);

export const ROLE_LABELS: Record<Role, string> = Object.fromEntries(
  ROLES.map((r) => [r.key, r.label]),
) as Record<Role, string>;
