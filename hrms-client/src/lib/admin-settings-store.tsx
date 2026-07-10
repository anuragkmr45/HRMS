import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/domains/admin";
import { timesheetsApi } from "@/domains/timesheets";
import { useApiRouteEnabled, withApiFallback } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { useAuth } from "./auth";
import { DEPARTMENTS as SEED_DEPTS } from "./mock/departments";
import { DESIGNATIONS as SEED_DSGN } from "./mock/designations";
import { ROLES, type Role, ROLE_LABELS } from "./mock/roles";
import { AUDIT_LOGS as SEED_AUDIT, type AuditLogEntry } from "./mock/audit-logs";

const ls = {
  get<T>(k: string, fb: T): T {
    if (typeof window === "undefined") return fb;
    try {
      const r = window.localStorage.getItem(k);
      return r ? (JSON.parse(r) as T) : fb;
    } catch {
      return fb;
    }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, JSON.stringify(v));
  },
};

// ---------- Types ----------
export interface CompanyProfile {
  name: string;
  website: string;
  industry: string;
  address: string;
  timezone: string;
  currency: string;
  financialYearStart: string; // e.g. "April"
  workingWeek: string; // e.g. "Mon-Fri"
  workHours: number;
  logoLabel: string; // placeholder
  logoUrl?: string | null;
  logoDocumentId?: string | null;
  logoFileName?: string | null;
  logoMimeType?: string | null;
  logoSizeBytes?: number | null;
}

export interface MasterRow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  meta?: string;
}

export type MasterKey =
  | "departments"
  | "designations"
  | "employmentTypes"
  | "workLocations"
  | "shifts"
  | "leaveTypes"
  | "expenseCategories"
  | "assetCategories"
  | "helpdeskCategories"
  | "projectRoles";

export type MasterData = Record<MasterKey, MasterRow[]>;

export const PERMISSION_GROUPS = [
  "Dashboard",
  "Employees",
  "EMS",
  "Attendance",
  "Leave/WFH",
  "Projects",
  "Team Utilization",
  "Timesheet",
  "Expense Management",
  "Assets",
  "Helpdesk",
  "Reports",
  "Admin Settings",
] as const;
export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "configure",
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface RoleConfig {
  key: string;
  label: string;
  description: string;
  builtin: boolean;
  assignedUsers: number;
  matrix: Record<PermissionGroup, Partial<Record<PermissionAction, boolean>>>;
}

export type WorkflowKey =
  | "leave"
  | "wfh"
  | "timesheet"
  | "expense"
  | "asset_request"
  | "helpdesk_escalation";

export interface WorkflowStage {
  id: string;
  approverType: "Reporting Manager" | "Role" | "Specific User";
  approverValue: string;
  escalateAfterDays: number;
  mandatoryRemarksOnReject: boolean;
}

export interface WorkflowConfig {
  key: WorkflowKey;
  label: string;
  active: boolean;
  stages: WorkflowStage[];
}

export interface PolicyAttendance {
  graceMinutes: number;
  halfDayAfterMinutes: number;
  autoMarkAbsentMinutes: number;
  allowRegularization: boolean;
  fullDayPunchWindow: boolean;
  punchInStart: string;
  punchInEnd: string;
  punchOutStart: string;
  punchOutEnd: string;
  autoPunchOutEnabled: boolean;
  autoPunchOutTime: string;
  allowOffDayPunches: boolean;
}
export interface PolicyLeave {
  casualPerYear: number;
  sickPerYear: number;
  earnedPerYear: number;
  carryForwardCap: number;
  encashmentAllowed: boolean;
}
export interface PolicyTimesheet {
  weeklyHours: number;
  minDailyHours: number;
  submitBy: string;
  lockAfterApproval: boolean;
}
export interface PolicyExpense {
  perDayLimit: number;
  receiptMandatoryAbove: number;
  selfApprovalAllowed: boolean;
  autoEscalateDays: number;
}
export interface PolicyAsset {
  damagePenalty: boolean;
  mandatoryAck: boolean;
  returnSlaDays: number;
  warrantyAlertDays: number;
}
export interface PolicySLA {
  urgentResponseHrs: number;
  urgentResolveHrs: number;
  highResponseHrs: number;
  highResolveHrs: number;
  normalResponseHrs: number;
  normalResolveHrs: number;
  lowResponseHrs: number;
  lowResolveHrs: number;
}

export interface Policies {
  attendance: PolicyAttendance;
  leave: PolicyLeave;
  timesheet: PolicyTimesheet;
  expense: PolicyExpense;
  asset: PolicyAsset;
  sla: PolicySLA;
}

export interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  active: boolean;
}

export interface NotificationEvent {
  key: string;
  label: string;
  inApp: boolean;
  email: boolean;
  push: boolean; // placeholder
}

export interface SecuritySettings {
  passwordMinLength: number;
  passwordRequireSpecial: boolean;
  passwordRequireNumber: boolean;
  passwordExpiryDays: number;
  sessionTimeoutMinutes: number;
  mfaEnabled: boolean;
  loginAttemptLimit: number;
  auditRoleChanges: boolean;
  ipDeviceAuditEnabled: boolean;
}

// ---------- Defaults ----------
const DEFAULT_COMPANY: CompanyProfile = {
  name: "Hawkaii Technologies Pvt Ltd",
  website: "https://hawkaii.com",
  industry: "Software / SaaS",
  address: "12th Floor, Prestige Atlanta, Koramangala, Bengaluru 560095",
  timezone: "Asia/Kolkata (GMT+05:30)",
  currency: "INR — Indian Rupee",
  financialYearStart: "April",
  workingWeek: "Mon – Fri",
  workHours: 8,
  logoLabel: "HK",
};

const toMaster = (id: string, name: string, meta?: string): MasterRow => ({
  id,
  name,
  active: true,
  meta,
});

const DEFAULT_MASTERS: MasterData = {
  departments: SEED_DEPTS.map((d) => ({
    id: d.id,
    name: d.name,
    active: true,
    meta: `Head: ${d.head} • ${d.headcount} ppl`,
  })),
  designations: SEED_DSGN.map((d) => ({
    id: d.id,
    name: d.title,
    active: true,
    meta: `${d.level} • ${d.department}`,
  })),
  employmentTypes: [
    toMaster("ET-01", "Full-time"),
    toMaster("ET-02", "Part-time"),
    toMaster("ET-03", "Intern"),
    toMaster("ET-04", "Contractor"),
    toMaster("ET-05", "Consultant"),
  ],
  workLocations: [
    toMaster("WL-01", "Bengaluru HQ", "India"),
    toMaster("WL-02", "Mumbai Office", "India"),
    toMaster("WL-03", "Singapore", "APAC"),
    toMaster("WL-04", "Remote — India", "Distributed"),
    toMaster("WL-05", "Remote — Global", "Distributed"),
  ],
  shifts: [
    toMaster("SH-01", "General Shift", "09:30 – 18:30 IST"),
    toMaster("SH-02", "EU Overlap", "12:00 – 21:00 IST"),
    toMaster("SH-03", "US Overlap", "16:00 – 01:00 IST"),
  ],
  leaveTypes: [
    toMaster("LT-01", "Casual Leave", "12/year"),
    toMaster("LT-02", "Sick Leave", "10/year"),
    toMaster("LT-03", "Earned Leave", "18/year"),
    toMaster("LT-04", "Maternity", "26 weeks"),
    toMaster("LT-05", "Paternity", "10 days"),
    toMaster("LT-06", "Bereavement", "5 days"),
    toMaster("LT-07", "Comp-off", "On approval"),
  ],
  expenseCategories: [
    toMaster("EC-01", "Travel"),
    toMaster("EC-02", "Accommodation"),
    toMaster("EC-03", "Food"),
    toMaster("EC-04", "Client Entertainment"),
    toMaster("EC-05", "Software / Subscription"),
    toMaster("EC-06", "Hardware"),
    toMaster("EC-07", "Training"),
    toMaster("EC-08", "Misc"),
  ],
  assetCategories: [
    toMaster("AC-01", "Laptop"),
    toMaster("AC-02", "Desktop"),
    toMaster("AC-03", "Monitor"),
    toMaster("AC-04", "Mobile Phone"),
    toMaster("AC-05", "Accessory"),
    toMaster("AC-06", "Software License"),
  ],
  helpdeskCategories: [
    toMaster("HC-01", "IT"),
    toMaster("HC-02", "HR"),
    toMaster("HC-03", "Finance"),
    toMaster("HC-04", "Admin"),
    toMaster("HC-05", "Assets"),
    toMaster("HC-06", "Project Support"),
  ],
  projectRoles: [
    toMaster("PR-01", "Project Manager"),
    toMaster("PR-02", "Tech Lead"),
    toMaster("PR-03", "Developer"),
    toMaster("PR-04", "QA Engineer"),
    toMaster("PR-05", "Designer"),
    toMaster("PR-06", "Business Analyst"),
  ],
};

// Build default RBAC roles from existing role catalog
const ROLE_TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  main_admin: "Full access to every workspace module and configuration.",
  hr_admin: "People operations: directory, attendance, leave and reports.",
  admin: "Operational administrator with broad config rights.",
  employee: "Self-service hub for personal data and day-to-day workflows.",
  manager: "Manage your reporting team's approvals and utilization.",
  director: "Leadership view for team, reports and approval oversight.",
  team_lead: "Lead a small squad — approve timesheets and leave.",
  module_lead: "Owns a delivery module within a project.",
  project_manager: "Run projects, allocations, timesheets and delivery.",
  finance_manager: "Process expenses, settlements and finance reporting.",
  asset_admin: "Hardware lifecycle, allocations and IT helpdesk.",
  helpdesk_agent: "Triage, resolve and close employee support tickets.",
  auditor: "Read-only access for compliance and audit.",
};

const EXTRA_ROLE_KEYS = ["admin", "team_lead", "module_lead", "auditor", "director"] as const;

function emptyMatrix(): Record<PermissionGroup, Partial<Record<PermissionAction, boolean>>> {
  const m = {} as Record<PermissionGroup, Partial<Record<PermissionAction, boolean>>>;
  for (const g of PERMISSION_GROUPS) m[g] = {};
  return m;
}

function defaultMatrixFor(roleKey: string): RoleConfig["matrix"] {
  const m = emptyMatrix();
  const set = (g: PermissionGroup, acts: PermissionAction[]) => {
    acts.forEach((a) => (m[g][a] = true));
  };
  const all: PermissionAction[] = [
    "view",
    "create",
    "edit",
    "delete",
    "approve",
    "export",
    "configure",
  ];
  const ro: PermissionAction[] = ["view", "export"];

  if (roleKey === "main_admin") {
    for (const g of PERMISSION_GROUPS) set(g, all);
    return m;
  }
  if (roleKey === "auditor") {
    for (const g of PERMISSION_GROUPS) set(g, ro);
    return m;
  }

  set("Dashboard", ["view"]);
  set("EMS", ["view", "create", "edit"]);

  switch (roleKey) {
    case "hr_admin":
      set("Employees", ["view", "create", "edit", "export"]);
      set("Attendance", ["view", "edit", "approve", "export"]);
      set("Leave/WFH", ["view", "approve", "export"]);
      set("Reports", ["view", "export"]);
      set("Admin Settings", ["view", "configure"]);
      break;
    case "admin":
      set("Employees", ["view", "edit"]);
      set("Helpdesk", ["view", "edit", "approve"]);
      set("Admin Settings", ["view"]);
      break;
    case "employee":
      set("Attendance", ["view", "create"]);
      set("Leave/WFH", ["view", "create"]);
      set("Timesheet", ["view", "create", "edit"]);
      set("Expense Management", ["view", "create"]);
      set("Assets", ["view"]);
      set("Helpdesk", ["view", "create"]);
      break;
    case "manager":
    case "director":
      set("Employees", ["view"]);
      set("Attendance", ["view", "approve", "export"]);
      set("Leave/WFH", ["view", "approve"]);
      set("Timesheet", ["view", "approve"]);
      set("Expense Management", ["view", "approve"]);
      set("Reports", ["view", "export"]);
      break;
    case "team_lead":
      set("Timesheet", ["view", "approve"]);
      set("Leave/WFH", ["view", "approve"]);
      break;
    case "module_lead":
      set("Projects", ["view", "edit"]);
      set("Timesheet", ["view", "approve"]);
      break;
    case "project_manager":
      set("Projects", ["view", "create", "edit", "approve", "export"]);
      set("Team Utilization", ["view", "export"]);
      set("Timesheet", ["view", "approve", "export"]);
      set("Reports", ["view", "export"]);
      break;
    case "finance_manager":
      set("Expense Management", ["view", "approve", "export", "configure"]);
      set("Reports", ["view", "export"]);
      break;
    case "asset_admin":
      set("Assets", ["view", "create", "edit", "delete", "approve", "export"]);
      set("Helpdesk", ["view", "edit", "approve"]);
      break;
    case "helpdesk_agent":
      set("Helpdesk", ["view", "create", "edit", "approve"]);
      break;
  }
  return m;
}

const ASSIGNED_COUNT_OVERRIDES: Record<string, number> = {
  main_admin: 2,
  hr_admin: 4,
  admin: 3,
  employee: 168,
  manager: 14,
  director: 2,
  team_lead: 12,
  module_lead: 9,
  project_manager: 7,
  finance_manager: 3,
  asset_admin: 2,
  helpdesk_agent: 5,
  auditor: 1,
};

function buildDefaultRoles(): RoleConfig[] {
  const fromCatalog: RoleConfig[] = ROLES.map((r) => ({
    key: r.key,
    label: r.label,
    description: ROLE_TEMPLATE_DESCRIPTIONS[r.key] ?? r.description,
    builtin: true,
    assignedUsers: ASSIGNED_COUNT_OVERRIDES[r.key] ?? 1,
    matrix: defaultMatrixFor(r.key),
  }));
  const extras: RoleConfig[] = EXTRA_ROLE_KEYS.map((k) => ({
    key: k,
    label: k
      .split("_")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(" "),
    description: ROLE_TEMPLATE_DESCRIPTIONS[k] ?? "",
    builtin: true,
    assignedUsers: ASSIGNED_COUNT_OVERRIDES[k] ?? 0,
    matrix: defaultMatrixFor(k),
  }));
  return [...fromCatalog, ...extras];
}

const stage = (
  n: number,
  type: WorkflowStage["approverType"],
  val: string,
  esc = 2,
): WorkflowStage => ({
  id: `s_${n}_${Math.random().toString(36).slice(2, 7)}`,
  approverType: type,
  approverValue: val,
  escalateAfterDays: esc,
  mandatoryRemarksOnReject: true,
});

const DEFAULT_WORKFLOWS: WorkflowConfig[] = [
  {
    key: "leave",
    label: "Leave approval",
    active: true,
    stages: [stage(1, "Reporting Manager", "Direct manager", 2), stage(2, "Role", "HR Admin", 3)],
  },
  {
    key: "wfh",
    label: "WFH approval",
    active: true,
    stages: [stage(1, "Reporting Manager", "Direct manager", 1)],
  },
  {
    key: "timesheet",
    label: "Timesheet approval",
    active: true,
    stages: [
      stage(1, "Reporting Manager", "Direct manager", 2),
      stage(2, "Role", "Project Manager", 2),
    ],
  },
  {
    key: "expense",
    label: "Expense approval",
    active: true,
    stages: [
      stage(1, "Reporting Manager", "Direct manager", 2),
      stage(2, "Role", "Finance Manager", 3),
    ],
  },
  {
    key: "asset_request",
    label: "Asset request approval",
    active: true,
    stages: [
      stage(1, "Reporting Manager", "Direct manager", 2),
      stage(2, "Role", "IT / Asset Admin", 2),
    ],
  },
  {
    key: "helpdesk_escalation",
    label: "Helpdesk escalation",
    active: true,
    stages: [
      stage(1, "Role", "Helpdesk Agent", 1),
      stage(2, "Role", "Module Owner", 1),
      stage(3, "Specific User", "Aanya Mehta (Main Admin)", 1),
    ],
  },
];

const DEFAULT_POLICIES: Policies = {
  attendance: {
    graceMinutes: 10,
    halfDayAfterMinutes: 240,
    autoMarkAbsentMinutes: 480,
    allowRegularization: true,
    fullDayPunchWindow: true,
    punchInStart: "09:00",
    punchInEnd: "11:00",
    punchOutStart: "17:00",
    punchOutEnd: "23:59",
    autoPunchOutEnabled: true,
    autoPunchOutTime: "23:59",
    allowOffDayPunches: false,
  },
  leave: {
    casualPerYear: 12,
    sickPerYear: 10,
    earnedPerYear: 18,
    carryForwardCap: 30,
    encashmentAllowed: true,
  },
  timesheet: {
    weeklyHours: 40,
    minDailyHours: 6,
    submitBy: "Monday 11:00 AM",
    lockAfterApproval: true,
  },
  expense: {
    perDayLimit: 5000,
    receiptMandatoryAbove: 500,
    selfApprovalAllowed: false,
    autoEscalateDays: 3,
  },
  asset: { damagePenalty: true, mandatoryAck: true, returnSlaDays: 5, warrantyAlertDays: 60 },
  sla: {
    urgentResponseHrs: 1,
    urgentResolveHrs: 4,
    highResponseHrs: 4,
    highResolveHrs: 24,
    normalResponseHrs: 8,
    normalResolveHrs: 48,
    lowResponseHrs: 24,
    lowResolveHrs: 96,
  },
};

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    key: "invite",
    name: "Employee Invite",
    subject: "Welcome to {{company}} — set up your account",
    body: "Hi {{name}},\n\nYou've been invited to join {{company}} on Hawkaii HRMS. Click the link below to set your password and complete onboarding.\n\n{{link}}\n\n— People Ops",
    active: true,
  },
  {
    key: "verify",
    name: "Email Verification",
    subject: "Verify your email for {{company}}",
    body: "Hi {{name}},\n\nPlease verify your email by clicking the link below.\n\n{{link}}\n\nThis link expires in 24 hours.",
    active: true,
  },
  {
    key: "reset",
    name: "Password Reset",
    subject: "Reset your {{company}} password",
    body: "Hi {{name}},\n\nUse the link below to reset your password. If you didn't request this, you can ignore this email.\n\n{{link}}",
    active: true,
  },
  {
    key: "leave",
    name: "Leave Approval",
    subject: "Your leave request was {{status}}",
    body: "Hi {{name}},\n\nYour leave request from {{from}} to {{to}} has been {{status}} by {{approver}}.\n\nRemarks: {{remarks}}",
    active: true,
  },
  {
    key: "expense",
    name: "Expense Approval",
    subject: "Expense {{id}} {{status}}",
    body: "Hi {{name}},\n\nYour expense claim {{id}} for {{amount}} has been {{status}}.\n\nRemarks: {{remarks}}",
    active: true,
  },
  {
    key: "ts_reminder",
    name: "Timesheet Reminder",
    subject: "Submit your weekly timesheet",
    body: "Hi {{name}},\n\nFriendly reminder to submit your timesheet for week ending {{week}} before {{deadline}}.",
    active: true,
  },
  {
    key: "ticket_update",
    name: "Helpdesk Ticket Update",
    subject: "Ticket {{id}} updated — {{status}}",
    body: "Hi {{name}},\n\nTicket {{id}} ({{title}}) is now {{status}}.\n\nLatest update: {{message}}",
    active: true,
  },
];

const DEFAULT_NOTIFICATIONS: NotificationEvent[] = [
  { key: "employee_invited", label: "Employee invited", inApp: true, email: true, push: false },
  { key: "leave_requested", label: "Leave requested", inApp: true, email: true, push: false },
  {
    key: "timesheet_submitted",
    label: "Timesheet submitted",
    inApp: true,
    email: false,
    push: false,
  },
  { key: "expense_submitted", label: "Expense submitted", inApp: true, email: true, push: false },
  { key: "payment_released", label: "Payment released", inApp: true, email: true, push: false },
  { key: "asset_assigned", label: "Asset assigned", inApp: true, email: true, push: false },
  {
    key: "ticket_assigned",
    label: "Helpdesk ticket assigned",
    inApp: true,
    email: true,
    push: false,
  },
  { key: "sla_breached", label: "SLA breached", inApp: true, email: true, push: true },
];

const DEFAULT_SECURITY: SecuritySettings = {
  passwordMinLength: 10,
  passwordRequireSpecial: true,
  passwordRequireNumber: true,
  passwordExpiryDays: 90,
  sessionTimeoutMinutes: 60,
  mfaEnabled: false,
  loginAttemptLimit: 5,
  auditRoleChanges: true,
  ipDeviceAuditEnabled: true,
};

const EXTRA_AUDIT: AuditLogEntry[] = [
  {
    id: "AL-1006",
    actor: "Aanya Mehta",
    action: "updated.policy",
    target: "expense.perDayLimit 4000→5000",
    module: "Admin Settings",
    at: "2026-05-09 14:02",
    ip: "10.0.4.12",
  },
  {
    id: "AL-1007",
    actor: "Rahul Verma",
    action: "updated.role",
    target: "hr_admin permissions",
    module: "Admin Settings",
    at: "2026-05-08 16:11",
    ip: "10.0.4.18",
  },
  {
    id: "AL-1008",
    actor: "Aanya Mehta",
    action: "added.master",
    target: "Work Location: Singapore",
    module: "Admin Settings",
    at: "2026-05-07 10:55",
    ip: "10.0.4.12",
  },
  {
    id: "AL-1009",
    actor: "Marco Rossi",
    action: "updated.workflow",
    target: "expense — aligned manager to finance flow",
    module: "Admin Settings",
    at: "2026-05-06 11:42",
    ip: "10.0.4.27",
  },
  {
    id: "AL-1010",
    actor: "Aanya Mehta",
    action: "rotated.security",
    target: "passwordExpiryDays 60→90",
    module: "Admin Settings",
    at: "2026-05-05 09:18",
    ip: "10.0.4.12",
  },
];

const DEFAULT_AUDIT: AuditLogEntry[] = [...EXTRA_AUDIT, ...SEED_AUDIT];

// ---------- Context ----------
interface Ctx {
  company: CompanyProfile;
  setCompany: (c: CompanyProfile) => void;

  masters: MasterData;
  addMaster: (k: MasterKey, name: string, description?: string) => void;
  updateMaster: (k: MasterKey, id: string, patch: Partial<MasterRow>) => void;
  toggleMasterActive: (k: MasterKey, id: string) => void;
  deleteMaster: (k: MasterKey, id: string) => void;

  roles: RoleConfig[];
  togglePermission: (roleKey: string, group: PermissionGroup, action: PermissionAction) => void;
  toggleAllForGroup: (roleKey: string, group: PermissionGroup, value: boolean) => void;
  updateRoleMeta: (
    roleKey: string,
    patch: Partial<Pick<RoleConfig, "label" | "description">>,
  ) => void;

  workflows: WorkflowConfig[];
  toggleWorkflow: (k: WorkflowKey) => void;
  addStage: (k: WorkflowKey) => void;
  updateStage: (k: WorkflowKey, stageId: string, patch: Partial<WorkflowStage>) => void;
  removeStage: (k: WorkflowKey, stageId: string) => void;

  policies: Policies;
  setPolicy: <K extends keyof Policies>(k: K, patch: Partial<Policies[K]>) => void;

  templates: EmailTemplate[];
  updateTemplate: (key: string, patch: Partial<EmailTemplate>) => void;

  notifications: NotificationEvent[];
  toggleNotification: (key: string, channel: "inApp" | "email" | "push") => void;

  security: SecuritySettings;
  setSecurity: (patch: Partial<SecuritySettings>) => void;

  audit: AuditLogEntry[];
  log: (entry: Omit<AuditLogEntry, "id" | "at" | "ip"> & { ip?: string }) => void;
}

const Ctx_ = React.createContext<Ctx | null>(null);

const K = {
  company: "hawkaii_admin_company_v1",
  masters: "hawkaii_admin_masters_v1",
  roles: "hawkaii_admin_roles_v1",
  workflows: "hawkaii_admin_workflows_v1",
  policies: "hawkaii_admin_policies_v1",
  templates: "hawkaii_admin_templates_v1",
  notifications: "hawkaii_admin_notifications_v1",
  security: "hawkaii_admin_security_v1",
  audit: "hawkaii_admin_audit_v1",
};

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export function AdminSettingsProvider({ children }: { children: React.ReactNode }) {
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const { user } = useAuth();
  const canManageManagerBackups = user?.roles.includes("main_admin") ?? false;
  const [company, setCompanyState] = React.useState<CompanyProfile>(DEFAULT_COMPANY);
  const [masters, setMasters] = React.useState<MasterData>(DEFAULT_MASTERS);
  const [roles, setRoles] = React.useState<RoleConfig[]>(buildDefaultRoles());
  const [workflows, setWorkflows] = React.useState<WorkflowConfig[]>(DEFAULT_WORKFLOWS);
  const [policies, setPolicies] = React.useState<Policies>(DEFAULT_POLICIES);
  const [templates, setTemplates] = React.useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [notifications, setNotifications] =
    React.useState<NotificationEvent[]>(DEFAULT_NOTIFICATIONS);
  const [security, setSecurityState] = React.useState<SecuritySettings>(DEFAULT_SECURITY);
  const [audit, setAudit] = React.useState<AuditLogEntry[]>(DEFAULT_AUDIT);

  React.useEffect(() => {
    setCompanyState(ls.get(K.company, DEFAULT_COMPANY));
    setMasters(ls.get(K.masters, DEFAULT_MASTERS));
    setRoles(ls.get(K.roles, buildDefaultRoles()));
    setWorkflows(ls.get(K.workflows, DEFAULT_WORKFLOWS));
    setPolicies(ls.get(K.policies, DEFAULT_POLICIES));
    setTemplates(ls.get(K.templates, DEFAULT_TEMPLATES));
    setNotifications(ls.get(K.notifications, DEFAULT_NOTIFICATIONS));
    setSecurityState(ls.get(K.security, DEFAULT_SECURITY));
    setAudit(ls.get(K.audit, DEFAULT_AUDIT));
  }, []);

  useQuery({
    queryKey: queryKeys.detail("admin", "finance-governance", "current"),
    queryFn: () =>
      withApiFallback<unknown>(
        () => adminApi.getFinanceGovernance(),
        () => policies.expense,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.referenceStaleMs,
  });

  useQuery({
    queryKey: queryKeys.list("admin", "manager-backups"),
    queryFn: () =>
      withApiFallback(
        () => adminApi.listManagerBackups(),
        () => [],
      ),
    enabled: apiEnabled && canManageManagerBackups,
    staleTime: queryTimings.referenceStaleMs,
  });

  useQuery({
    queryKey: queryKeys.list("timesheets", "workflow-definitions"),
    queryFn: () =>
      withApiFallback<unknown>(
        () => timesheetsApi.listWorkflowDefinitions({ page_size: 100 }),
        () => ({
          items: workflows,
          page: 1,
          page_size: workflows.length,
          total: workflows.length,
        }),
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.referenceStaleMs,
  });

  const log: Ctx["log"] = (entry) => {
    const next: AuditLogEntry = {
      id: uid("AL").toUpperCase(),
      at: new Date().toISOString().slice(0, 16).replace("T", " "),
      ip: entry.ip ?? "10.0.4.12",
      ...entry,
    };
    setAudit((prev) => {
      const n = [next, ...prev];
      ls.set(K.audit, n);
      return n;
    });
  };

  const setCompany: Ctx["setCompany"] = (c) => {
    setCompanyState(c);
    ls.set(K.company, c);
    log({
      actor: "Aanya Mehta",
      action: "updated.company",
      target: c.name,
      module: "Admin Settings",
    });
  };

  const addMaster: Ctx["addMaster"] = (k, name, description) => {
    setMasters((prev) => {
      const row: MasterRow = {
        id: uid(k.slice(0, 2).toUpperCase()),
        name,
        description,
        active: true,
      };
      const n = { ...prev, [k]: [row, ...prev[k]] };
      ls.set(K.masters, n);
      return n;
    });
    log({
      actor: "Aanya Mehta",
      action: "added.master",
      target: `${k}: ${name}`,
      module: "Admin Settings",
    });
  };
  const updateMaster: Ctx["updateMaster"] = (k, id, patch) =>
    setMasters((prev) => {
      const n = { ...prev, [k]: prev[k].map((r) => (r.id === id ? { ...r, ...patch } : r)) };
      ls.set(K.masters, n);
      return n;
    });
  const toggleMasterActive: Ctx["toggleMasterActive"] = (k, id) =>
    setMasters((prev) => {
      const n = {
        ...prev,
        [k]: prev[k].map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
      };
      ls.set(K.masters, n);
      return n;
    });
  const deleteMaster: Ctx["deleteMaster"] = (k, id) =>
    setMasters((prev) => {
      const n = { ...prev, [k]: prev[k].filter((r) => r.id !== id) };
      ls.set(K.masters, n);
      return n;
    });

  const persistRoles = (n: RoleConfig[]) => {
    setRoles(n);
    ls.set(K.roles, n);
  };
  const togglePermission: Ctx["togglePermission"] = (roleKey, group, action) => {
    persistRoles(
      roles.map((r) =>
        r.key === roleKey
          ? {
              ...r,
              matrix: {
                ...r.matrix,
                [group]: { ...r.matrix[group], [action]: !r.matrix[group][action] },
              },
            }
          : r,
      ),
    );
  };
  const toggleAllForGroup: Ctx["toggleAllForGroup"] = (roleKey, group, value) => {
    persistRoles(
      roles.map((r) => {
        if (r.key !== roleKey) return r;
        const next: Partial<Record<PermissionAction, boolean>> = {};
        PERMISSION_ACTIONS.forEach((a) => (next[a] = value));
        return { ...r, matrix: { ...r.matrix, [group]: next } };
      }),
    );
  };
  const updateRoleMeta: Ctx["updateRoleMeta"] = (roleKey, patch) => {
    persistRoles(roles.map((r) => (r.key === roleKey ? { ...r, ...patch } : r)));
  };

  const persistWf = (n: WorkflowConfig[]) => {
    setWorkflows(n);
    ls.set(K.workflows, n);
  };
  const toggleWorkflow: Ctx["toggleWorkflow"] = (k) =>
    persistWf(workflows.map((w) => (w.key === k ? { ...w, active: !w.active } : w)));
  const addStage: Ctx["addStage"] = (k) =>
    persistWf(
      workflows.map((w) =>
        w.key === k
          ? { ...w, stages: [...w.stages, stage(w.stages.length + 1, "Role", "Manager", 2)] }
          : w,
      ),
    );
  const updateStage: Ctx["updateStage"] = (k, stageId, patch) =>
    persistWf(
      workflows.map((w) =>
        w.key === k
          ? { ...w, stages: w.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)) }
          : w,
      ),
    );
  const removeStage: Ctx["removeStage"] = (k, stageId) =>
    persistWf(
      workflows.map((w) =>
        w.key === k ? { ...w, stages: w.stages.filter((s) => s.id !== stageId) } : w,
      ),
    );

  const setPolicy: Ctx["setPolicy"] = (k, patch) =>
    setPolicies((prev) => {
      const n = { ...prev, [k]: { ...prev[k], ...patch } };
      ls.set(K.policies, n);
      return n;
    });

  const updateTemplate: Ctx["updateTemplate"] = (key, patch) =>
    setTemplates((prev) => {
      const n = prev.map((t) => (t.key === key ? { ...t, ...patch } : t));
      ls.set(K.templates, n);
      return n;
    });

  const toggleNotification: Ctx["toggleNotification"] = (key, channel) =>
    setNotifications((prev) => {
      const n = prev.map((e) => (e.key === key ? { ...e, [channel]: !e[channel] } : e));
      ls.set(K.notifications, n);
      return n;
    });

  const setSecurity: Ctx["setSecurity"] = (patch) =>
    setSecurityState((prev) => {
      const n = { ...prev, ...patch };
      ls.set(K.security, n);
      return n;
    });

  const value: Ctx = {
    company,
    setCompany,
    masters,
    addMaster,
    updateMaster,
    toggleMasterActive,
    deleteMaster,
    roles,
    togglePermission,
    toggleAllForGroup,
    updateRoleMeta,
    workflows,
    toggleWorkflow,
    addStage,
    updateStage,
    removeStage,
    policies,
    setPolicy,
    templates,
    updateTemplate,
    notifications,
    toggleNotification,
    security,
    setSecurity,
    audit,
    log,
  };

  return <Ctx_.Provider value={value}>{children}</Ctx_.Provider>;
}

export function useAdminSettings() {
  const ctx = React.useContext(Ctx_);
  if (!ctx) throw new Error("useAdminSettings must be used within AdminSettingsProvider");
  return ctx;
}

// Helpers
export const MASTER_LABELS: Record<MasterKey, string> = {
  departments: "Departments",
  designations: "Designations",
  employmentTypes: "Employment Types",
  workLocations: "Work Locations",
  shifts: "Shifts",
  leaveTypes: "Leave Types",
  expenseCategories: "Expense Categories",
  assetCategories: "Asset Categories",
  helpdeskCategories: "Helpdesk Categories",
  projectRoles: "Project Roles",
};

export { ROLE_LABELS };
export type { Role };
