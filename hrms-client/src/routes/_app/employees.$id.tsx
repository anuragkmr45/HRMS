import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, UserAvatar, EmptyState, ActionButton } from "@/components/ui-kit";
import { useEmployees } from "@/lib/employees-store";
import { useAuth } from "@/lib/auth";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/mock/roles";
import { ASSETS } from "@/lib/mock/assets";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  WORK_MODE_LABEL,
  GENDER_LABEL,
  type Employee,
  type EmployeeDocument,
} from "@/lib/mock/employees";
import { EmployeeFormDrawer } from "@/components/employees/employee-form-drawer";
import {
  coreApi,
  mapApiAuditEntries,
  mapApiRoleHistoryEntries,
  mapApiUserToEmployee,
  useUserAudit,
  useUserRoleHistory,
} from "@/domains/core";
import { queryKeys, queryTimings } from "@/shared/query";
import { pageItems, toastApiError } from "@/shared/api";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  Cake,
  ChevronRight,
  Clock,
  FileText,
  Laptop,
  LifeBuoy,
  Mail,
  MapPin,
  Phone,
  Pencil,
  ShieldCheck,
  Timer,
  TrendingUp,
  Upload,
  UserCheck,
  Users2,
  Wallet,
  CalendarDays,
  Activity,
  History,
  CheckCircle2,
  XCircle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/employees/$id")({
  head: ({ params }) => ({ meta: [{ title: `Employee ${params.id} — Hawkaii HRMS` }] }),
  component: EmployeeProfilePage,
});

function EmployeeProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { employees, setLogin, setRoles, setStatus, loading, error, isApiBacked } = useEmployees();
  const { activeRole, user } = useAuth();
  const isMain = activeRole === "main_admin";
  const isHr = activeRole === "hr_admin";
  const canEdit = isMain || isHr;
  const employeeFromList = employees.find((e) => e.id === id);
  const detailQuery = useQuery({
    queryKey: queryKeys.detail("core", "user", employeeFromList?.apiId ?? id),
    queryFn: () => coreApi.getUserPartial(employeeFromList?.apiId as string),
    enabled: Boolean(employeeFromList?.apiId),
    staleTime: queryTimings.detailStaleMs,
  });
  const subtreeQuery = useQuery({
    queryKey: queryKeys.list("core", "user-subtree", {
      userId: employeeFromList?.apiId ?? id,
      page_size: 1,
    }),
    queryFn: () => coreApi.getUserSubtree(employeeFromList?.apiId as string),
    enabled: Boolean(employeeFromList?.apiId),
    staleTime: queryTimings.detailStaleMs,
  });
  const canReadSensitiveTimeline = canEdit || user?.email === employeeFromList?.email;
  const roleHistoryQuery = useUserRoleHistory(
    employeeFromList?.apiId,
    Boolean(employeeFromList?.apiId && canReadSensitiveTimeline),
  );
  const auditQuery = useUserAudit(
    employeeFromList?.apiId,
    Boolean(employeeFromList?.apiId && canReadSensitiveTimeline),
  );
  const employee = detailQuery.data
    ? mapApiUserToEmployee(detailQuery.data, employeeFromList)
    : employeeFromList;
  const subtreeTotal =
    typeof subtreeQuery.data?.total_active_descendants === "number"
      ? subtreeQuery.data.total_active_descendants
      : typeof subtreeQuery.data?.total === "number"
        ? subtreeQuery.data.total
        : undefined;
  const roleHistory = roleHistoryQuery.data
    ? mapApiRoleHistoryEntries(pageItems(roleHistoryQuery.data))
    : (employee?.roleHistory ?? []);
  const auditEntries = auditQuery.data
    ? mapApiAuditEntries(pageItems(auditQuery.data))
    : (employee?.audit ?? []);
  const [editOpen, setEditOpen] = useState(false);

  const isOwner = user?.email === employee?.email;
  const isManagerOf = activeRole === "manager" && employee?.manager === user?.name;
  const canView = canEdit || isOwner || isManagerOf;

  if (!employee && loading) {
    return (
      <Card className="rounded-2xl border-border/60 p-12">
        <EmptyState
          title="Loading employee profile"
          description="Fetching employee data from Hawkaii HRMS."
        />
      </Card>
    );
  }

  if (!employee) {
    return (
      <Card className="rounded-2xl border-border/60 p-12">
        <EmptyState
          title="Employee not found"
          description={
            error
              ? "Employee data could not be loaded from the backend."
              : `No employee with ID ${id} exists in this workspace.`
          }
          action={
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/employees">Back to employees</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  if (!canView) {
    return (
      <Card className="rounded-2xl border-border/60 p-12">
        <EmptyState
          title="You don't have access"
          description="Your current role does not include permission to view this employee profile."
          action={
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/employees">Back to employees</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <button
        onClick={() => navigate({ to: "/employees" })}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All employees
      </button>

      {/* Profile hero */}
      <Card className="overflow-hidden rounded-2xl border-border/60">
        <div className="p-6" style={{ background: "var(--gradient-hero)" }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <UserAvatar
                name={employee.name}
                src={employee.avatarUrl}
                size="lg"
                tone={employee.avatarTone ?? "primary"}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {employee.name}
                  </h1>
                  <StatusBadge
                    status={employee.status}
                    label={EMPLOYEE_STATUS_LABEL[employee.status]}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {employee.designation} • {employee.department}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="font-medium text-foreground">{employee.id}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {employee.email}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {employee.location}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="h-3 w-3" /> Reports to {employee.manager}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && !isApiBacked && (
                <ActionButton
                  size="sm"
                  variant="secondary"
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </ActionButton>
              )}
              {canEdit && (
                <ActionButton
                  size="sm"
                  variant="secondary"
                  icon={<History className="h-4 w-4" />}
                  onClick={() => {
                    const nextStatus =
                      employee.status === "notice_period" ? "active" : "notice_period";
                    void setStatus(employee.id, nextStatus)
                      .then(() =>
                        toast.success(
                          employee.status === "notice_period"
                            ? "Notice cleared"
                            : "Marked notice period",
                        ),
                      )
                      .catch((error) =>
                        toastApiError(error, "Employee status could not be updated."),
                      );
                  }}
                >
                  {employee.status === "notice_period" ? "Clear notice" : "Notice period"}
                </ActionButton>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <QuickStat label="Tenure" value={tenure(employee.joinedAt)} />
          <QuickStat label="Work mode" value={WORK_MODE_LABEL[employee.workMode]} />
          <QuickStat label="Type" value={EMPLOYMENT_TYPE_LABEL[employee.employmentType]} />
          <QuickStat
            label="Login"
            value={employee.loginEnabled ? "Enabled" : "Disabled"}
            tone={employee.loginEnabled ? "success" : "muted"}
          />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-auto flex-nowrap rounded-full bg-secondary p-1">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-full px-3 py-1.5 text-xs"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5 space-y-4">
          <OverviewTab employee={employee} canEdit={canEdit} setLogin={setLogin} />
        </TabsContent>

        <TabsContent value="personal" className="mt-5 space-y-4">
          <PersonalTab employee={employee} />
        </TabsContent>

        <TabsContent value="job" className="mt-5 space-y-4">
          <JobTab employee={employee} subtreeTotal={subtreeTotal} />
        </TabsContent>

        <TabsContent value="access" className="mt-5 space-y-4">
          <AccessTab
            employee={employee}
            canEdit={canEdit}
            onToggleLogin={(c) => {
              void setLogin(employee.id, c)
                .then(() => toast.success(c ? "Login enabled" : "Login disabled"))
                .catch((error) => toastApiError(error, "Login access could not be updated."));
            }}
            onSaveRoles={(rs) => {
              void setRoles(employee.id, rs)
                .then(() => toast.success("Roles updated"))
                .catch((error) => toastApiError(error, "Roles could not be updated."));
            }}
            roleHistory={roleHistory}
            historyLoading={roleHistoryQuery.isLoading}
            historyError={roleHistoryQuery.error instanceof Error ? roleHistoryQuery.error : null}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-5 space-y-4">
          <DocumentsTab documents={employee.documents} />
        </TabsContent>

        <TabsContent value="attendance" className="mt-5">
          <ModulePreview icon={Clock} title="Attendance" path="/attendance" />
        </TabsContent>
        <TabsContent value="leave" className="mt-5">
          <ModulePreview icon={CalendarDays} title="Leave & WFH" path="/leave-wfh" />
        </TabsContent>
        <TabsContent value="timesheet" className="mt-5">
          <ModulePreview icon={Timer} title="Timesheets" path="/timesheet" />
        </TabsContent>
        <TabsContent value="projects" className="mt-5">
          <ModulePreview icon={Briefcase} title="Projects" path="/projects" />
        </TabsContent>
        <TabsContent value="expenses" className="mt-5">
          <ModulePreview icon={Wallet} title="Expenses" path="/expenses" />
        </TabsContent>
        <TabsContent value="assets" className="mt-5">
          <AssetsTab employeeName={employee.name} />
        </TabsContent>
        <TabsContent value="helpdesk" className="mt-5">
          <ModulePreview icon={LifeBuoy} title="Helpdesk" path="/helpdesk" />
        </TabsContent>
        <TabsContent value="performance" className="mt-5">
          <ModulePreview icon={TrendingUp} title="Performance" path="/reports" />
        </TabsContent>

        <TabsContent value="audit" className="mt-5 space-y-4">
          <AuditTab
            entries={auditEntries}
            loading={auditQuery.isLoading}
            error={auditQuery.error instanceof Error ? auditQuery.error : null}
          />
        </TabsContent>
      </Tabs>

      <EmployeeFormDrawer open={editOpen} onOpenChange={setEditOpen} initial={employee} />
    </>
  );
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "personal", label: "Personal" },
  { value: "job", label: "Job" },
  { value: "access", label: "Access & Roles" },
  { value: "documents", label: "Documents" },
  { value: "attendance", label: "Attendance" },
  { value: "leave", label: "Leave & WFH" },
  { value: "timesheet", label: "Timesheets" },
  { value: "projects", label: "Projects" },
  { value: "expenses", label: "Expenses" },
  { value: "assets", label: "Assets" },
  { value: "helpdesk", label: "Helpdesk" },
  { value: "performance", label: "Performance" },
  { value: "audit", label: "Audit Trail" },
];

/* ───────────── Tabs ───────────── */

function OverviewTab({
  employee,
  canEdit,
  setLogin,
}: {
  employee: Employee;
  canEdit: boolean;
  setLogin: (id: string, enabled: boolean) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="rounded-2xl border-border/60 p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold">Profile snapshot</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field icon={Building2} label="Department" value={employee.department} />
          <Field icon={Briefcase} label="Designation" value={employee.designation} />
          <Field icon={UserCheck} label="Reporting manager" value={employee.manager} />
          <Field icon={Calendar} label="Joined" value={formatDate(employee.joinedAt)} />
          <Field
            icon={MapPin}
            label="Work location"
            value={`${employee.location} • ${WORK_MODE_LABEL[employee.workMode]}`}
          />
          <Field icon={Mail} label="Company email" value={employee.email} />
          <Field icon={Phone} label="Phone" value={employee.phone || "—"} />
          <Field icon={Clock} label="Shift" value={employee.shift} />
        </div>
      </Card>
      <Card className="rounded-2xl border-border/60 p-5">
        <h3 className="text-sm font-semibold">Account access</h3>
        {canEdit && (
          <div className="mt-3 flex items-center justify-between rounded-xl border bg-secondary/30 p-3">
            <div>
              <p className="text-sm font-medium">Login access</p>
              <p className="text-xs text-muted-foreground">Toggle to disable sign-in.</p>
            </div>
            <Switch
              checked={employee.loginEnabled}
              onCheckedChange={(c) => {
                void setLogin(employee.id, c)
                  .then(() => toast.success(c ? "Login enabled" : "Login disabled"))
                  .catch((error) => toastApiError(error, "Login access could not be updated."));
              }}
            />
          </div>
        )}
        {!canEdit && (
          <div className="mt-3 rounded-xl border bg-secondary/30 p-3">
            <p className="text-sm font-medium">
              {employee.loginEnabled ? "Login enabled" : "Login disabled"}
            </p>
            <p className="text-xs text-muted-foreground">Contact HR to request access changes.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function PersonalTab({ employee }: { employee: Employee }) {
  return (
    <Card className="rounded-2xl border-border/60 p-5">
      <h3 className="text-sm font-semibold">Personal details</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          icon={UserCheck}
          label="Gender"
          value={employee.gender ? GENDER_LABEL[employee.gender] : "—"}
        />
        <Field
          icon={Cake}
          label="Date of birth"
          value={employee.dob ? formatDate(employee.dob) : "—"}
        />
        <Field icon={Mail} label="Personal email" value={employee.personalEmail || "—"} />
        <Field icon={Phone} label="Contact number" value={employee.phone || "—"} />
        <Field icon={MapPin} label="Location" value={employee.location} />
      </div>
    </Card>
  );
}

function JobTab({ employee, subtreeTotal }: { employee: Employee; subtreeTotal?: number }) {
  return (
    <Card className="rounded-2xl border-border/60 p-5">
      <h3 className="text-sm font-semibold">Employment</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field icon={Calendar} label="Date of joining" value={formatDate(employee.joinedAt)} />
        <Field
          icon={Briefcase}
          label="Employment type"
          value={EMPLOYMENT_TYPE_LABEL[employee.employmentType]}
        />
        <Field icon={Building2} label="Department" value={employee.department} />
        <Field icon={Briefcase} label="Designation" value={employee.designation} />
        <Field icon={UserCheck} label="Reporting to" value={employee.manager} />
        <Field
          icon={Users2}
          label="Active descendants"
          value={subtreeTotal == null ? "—" : String(subtreeTotal)}
        />
        <Field icon={MapPin} label="Work mode" value={WORK_MODE_LABEL[employee.workMode]} />
        <Field icon={Clock} label="Shift" value={employee.shift} />
        <Field
          icon={Hourglass}
          label="Probation end"
          value={employee.probationEndDate ? formatDate(employee.probationEndDate) : "—"}
        />
        <Field icon={Activity} label="Notice period" value={`${employee.noticeDays} days`} />
        <Field icon={History} label="Lifecycle" value={EMPLOYEE_STATUS_LABEL[employee.status]} />
      </div>
    </Card>
  );
}

function AccessTab({
  employee,
  canEdit,
  onToggleLogin,
  onSaveRoles,
  roleHistory,
  historyLoading,
  historyError,
}: {
  employee: Employee;
  canEdit: boolean;
  onToggleLogin: (c: boolean) => void;
  onSaveRoles: (roles: string[]) => void;
  roleHistory: Employee["roleHistory"];
  historyLoading: boolean;
  historyError: Error | null;
}) {
  const [draft, setDraft] = useState<string[]>(employee.systemRoles);
  const dirty = draft.join(",") !== employee.systemRoles.join(",");

  const previewModules = Array.from(
    new Set(ROLES.filter((r) => draft.includes(r.key)).flatMap((r) => r.modules)),
  );

  const toggle = (k: Role) =>
    setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="rounded-2xl border-border/60 p-5 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Assigned roles</h3>
          {canEdit && dirty && (
            <Button
              size="sm"
              className="rounded-full text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
              onClick={() => onSaveRoles(draft)}
            >
              Save changes
            </Button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROLES.map((r) => {
            const checked = draft.includes(r.key);
            return (
              <button
                key={r.key}
                type="button"
                disabled={!canEdit}
                onClick={() => toggle(r.key)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  checked
                    ? "border-primary bg-primary-soft/60"
                    : "border-border bg-card hover:bg-accent/40",
                  !canEdit && "cursor-not-allowed opacity-80 hover:bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{r.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {r.description}
                    </p>
                  </div>
                  <Checkbox checked={checked} className="mt-0.5" disabled={!canEdit} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Module permissions preview
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {previewModules.map((m) => (
              <span
                key={m}
                className="rounded-full border bg-card px-2.5 py-0.5 text-[11px] font-medium"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border-border/60 p-5">
        <h3 className="text-sm font-semibold">Login</h3>
        <div className="mt-3 flex items-center justify-between rounded-xl border bg-secondary/30 p-3">
          <div>
            <p className="text-sm font-medium">{employee.loginEnabled ? "Enabled" : "Disabled"}</p>
            <p className="text-xs text-muted-foreground">
              Last login: {employee.lastLoginAt ? formatDateTime(employee.lastLoginAt) : "Never"}
            </p>
          </div>
          {canEdit && <Switch checked={employee.loginEnabled} onCheckedChange={onToggleLogin} />}
        </div>

        <h3 className="mt-5 text-sm font-semibold">Role change history</h3>
        <ul className="mt-3 space-y-3">
          {historyLoading && (
            <li className="text-xs text-muted-foreground">Loading role history...</li>
          )}
          {historyError && (
            <li className="text-xs text-destructive">
              Role history could not be loaded from the backend.
            </li>
          )}
          {!historyLoading && !historyError && roleHistory.length === 0 && (
            <li className="text-xs text-muted-foreground">No role changes recorded yet.</li>
          )}
          {!historyLoading &&
            !historyError &&
            roleHistory.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div className="mt-1 grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-primary">
                  <ShieldCheck className="h-3 w-3" />
                </div>
                <div className="flex-1 text-xs">
                  <p className="font-medium">
                    {h.from.length === 0
                      ? "Initial"
                      : h.from.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ")}{" "}
                    → {h.to.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ")}
                  </p>
                  <p className="text-muted-foreground">
                    {h.actor} • {formatDateTime(h.at)}
                  </p>
                </div>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function DocumentsTab({ documents }: { documents: EmployeeDocument[] }) {
  const CATS: { key: EmployeeDocument["category"]; label: string }[] = [
    { key: "offer_letter", label: "Offer letter" },
    { key: "id_proof", label: "ID proof" },
    { key: "address_proof", label: "Address proof" },
    { key: "education", label: "Educational certificates" },
    { key: "experience", label: "Experience certificates" },
    { key: "agreement", label: "Agreement files" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">All onboarding documents in one place.</p>
        <Button variant="outline" size="sm" className="rounded-full" disabled>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
        </Button>
      </div>
      {CATS.map((c) => {
        const docs = documents.filter((d) => d.category === c.key);
        return (
          <Card key={c.key} className="rounded-2xl border-border/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{c.label}</p>
              <span className="text-xs text-muted-foreground">
                {docs.length} file{docs.length === 1 ? "" : "s"}
              </span>
            </div>
            {docs.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No documents uploaded.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-xl border bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.size} • {formatDate(d.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          d.verified
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-warning/40 bg-warning/15 text-warning-foreground dark:border-warning/30 dark:bg-warning/15 dark:text-warning",
                        )}
                      >
                        {d.verified ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {d.verified ? "Verified" : "Pending"}
                      </span>
                      <Button variant="ghost" size="sm" className="rounded-full">
                        <Download className="mr-1 h-3.5 w-3.5" /> Download
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function AssetsTab({ employeeName }: { employeeName: string }) {
  const assets = ASSETS.filter((a) => a.assignedTo === employeeName);
  if (assets.length === 0) {
    return (
      <Card className="rounded-2xl border-border/60 p-12">
        <EmptyState
          icon={Laptop}
          title="No assets assigned"
          description="Assigned hardware and peripherals will appear here."
        />
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {assets.map((a) => (
        <Card
          key={a.id}
          className="flex items-center justify-between rounded-2xl border-border/60 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <Laptop className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {a.brand} {a.model}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.id} • {a.serial}
              </p>
            </div>
          </div>
          <StatusBadge status={a.status} />
        </Card>
      ))}
    </div>
  );
}

function ModulePreview({
  icon: Icon,
  title,
  path,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  path: string;
}) {
  return (
    <Card className="rounded-2xl border-border/60 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Personal {title.toLowerCase()} data for this employee will live here once the {title} module
        is wired up.
      </p>
      <div className="mt-4">
        <Button asChild variant="outline" className="rounded-full">
          <Link to={path}>
            Open {title} <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function AuditTab({
  entries,
  loading,
  error,
}: {
  entries: Employee["audit"];
  loading: boolean;
  error: Error | null;
}) {
  return (
    <Card className="rounded-2xl border-border/60 p-5">
      <h3 className="text-sm font-semibold">Audit trail</h3>
      <p className="text-xs text-muted-foreground">Every change made to this profile.</p>
      <ol className="mt-5 relative ml-2 border-l border-border">
        {loading && <li className="ml-4 text-xs text-muted-foreground">Loading audit trail...</li>}
        {error && (
          <li className="ml-4 text-xs text-destructive">
            Audit trail could not be loaded from the backend.
          </li>
        )}
        {!loading &&
          !error &&
          entries.map((a) => (
            <li key={a.id} className="mb-5 ml-4">
              <div className="absolute -left-[5px] mt-1 grid h-2.5 w-2.5 place-items-center rounded-full bg-primary" />
              <p className="text-sm font-medium">{a.action}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.actor} • {formatDateTime(a.at)}
              </p>
              {a.remarks && <p className="mt-1 text-xs text-muted-foreground">{a.remarks}</p>}
            </li>
          ))}
        {!loading && !error && entries.length === 0 && (
          <li className="ml-4 text-xs text-muted-foreground">No changes recorded yet.</li>
        )}
      </ol>
    </Card>
  );
}

/* ───────────── Building blocks ───────────── */

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function QuickStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <div className="bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          tone === "success" && "text-success",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Hourglass({ className }: { className?: string }) {
  return <Timer className={className} />;
}

/* ───────────── Helpers ───────────── */

function tenure(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (months < 12) return `${Math.max(months, 0)} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}y ${m}m` : `${y}y`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
