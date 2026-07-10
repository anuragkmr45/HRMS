import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  PageHeader,
  StatCard,
  StatusBadge,
  UserAvatar,
  DataTable,
  type Column,
  ActionButton,
} from "@/components/ui-kit";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEmployees } from "@/lib/employees-store";
import { useAuth } from "@/lib/auth";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  type Employee,
  type EmployeeStatus,
  type EmploymentType,
} from "@/lib/mock/employees";
import { EmployeeFormDrawer } from "@/components/employees/employee-form-drawer";
import { useCreateUserExportMutation } from "@/domains/core";
import { documentsApi } from "@/domains/documents";
import { toastApiError, userFacingErrorMessage } from "@/shared/api";
import {
  Users,
  UserCheck,
  UserMinus,
  Sparkles,
  Plus,
  Download,
  ShieldOff,
  ShieldCheck,
  Eye,
  Pencil,
  KeyRound,
  Hourglass,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/employees")({
  head: () => ({ meta: [{ title: "Employees — Hawkaii HRMS" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const { employees, departments, designations, setStatus, setLogin, loading, error, isApiBacked } =
    useEmployees();
  const { activeRole, user } = useAuth();
  const navigate = useNavigate();
  const exportMutation = useCreateUserExportMutation();

  const isMain = activeRole === "main_admin";
  const isHr = activeRole === "hr_admin";
  const isManager = activeRole === "manager";
  const canEdit = isMain || isHr;

  // Manager sees only direct reports (mocked by user.name match);
  // Employee sees only own profile.
  const visible = useMemo(() => {
    if (isMain || isHr) return employees;
    if (isManager) return employees.filter((e) => e.manager === user?.name);
    if (activeRole === "employee") return employees.filter((e) => e.email === user?.email);
    return [];
  }, [employees, activeRole, isMain, isHr, isManager, user]);

  const [dept, setDept] = useState<string>("all");
  const [desg, setDesg] = useState<string>("all");
  const [status, setStatusFilter] = useState<string>("all");
  const [empType, setEmpType] = useState<string>("all");
  const [login, setLoginFilter] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [pendingRowAction, setPendingRowAction] = useState<{
    employeeId: string;
    type: "login" | "status";
  } | null>(null);

  const isPendingRowAction = (employeeId: string, type?: "login" | "status") =>
    pendingRowAction?.employeeId === employeeId && (!type || pendingRowAction.type === type);

  const runRowAction = async (
    employee: Employee,
    type: "login" | "status",
    action: () => Promise<void>,
  ) => {
    if (pendingRowAction) return;
    setPendingRowAction({ employeeId: employee.id, type });
    try {
      await action();
    } finally {
      setPendingRowAction(null);
    }
  };

  const filtered = useMemo(() => {
    return visible.filter((e) => {
      if (dept !== "all" && e.department !== dept) return false;
      if (desg !== "all" && e.designation !== desg) return false;
      if (status !== "all" && e.status !== status) return false;
      if (empType !== "all" && e.employmentType !== empType) return false;
      if (login !== "all" && String(e.loginEnabled) !== login) return false;
      return true;
    });
  }, [visible, dept, desg, status, empType, login]);

  const stats = useMemo(() => {
    const total = visible.length;
    const active = visible.filter((e) => e.status === "active" || e.status === "confirmed").length;
    const onProbation = visible.filter((e) => e.status === "probation").length;
    const newJoiners = visible.filter((e) => {
      const d = new Date(e.joinedAt);
      return Date.now() - d.getTime() < 1000 * 60 * 60 * 24 * 90;
    }).length;
    return { total, active, onProbation, newJoiners };
  }, [visible]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setFormOpen(true);
  };
  const goProfile = (id: string) => navigate({ to: "/employees/$id", params: { id } });

  const handleExport = async () => {
    const headers = [
      "ID",
      "Name",
      "Email",
      "Department",
      "Designation",
      "Manager",
      "Type",
      "Status",
      "Login",
      "Joined",
    ];
    if (isApiBacked) {
      try {
        const job = await exportMutation.mutateAsync({
          format: "csv",
          filters: {
            department: dept !== "all" ? dept : undefined,
            designation: desg !== "all" ? desg : undefined,
            status: status !== "all" ? status : undefined,
            employment_type: empType !== "all" ? empType : undefined,
            login_enabled: login !== "all" ? login === "true" : undefined,
          },
          columns: headers.map((header) => header.toLowerCase().replace(/\s+/g, "_")),
        });
        const jobId = String(job.job_id ?? job.export_id ?? "queued");
        if (typeof job.download_document_id === "string" && job.download_document_id) {
          const download = await documentsApi.createDownloadUrl(job.download_document_id);
          if (typeof download.url === "string" && download.url) {
            window.open(download.url, "_blank", "noopener,noreferrer");
          }
          toast.success("Export ready", {
            description: `Employee export ${jobId.slice(0, 8)} was generated by the backend.`,
          });
        } else {
          toast.success("Export job queued", {
            description: `Employee export ${jobId.slice(0, 8)} is waiting for a backend renderer.`,
          });
        }
      } catch {
        toast.error("Export failed", {
          description: "Employee export could not be generated by the backend.",
        });
      }
      return;
    }
    const rows = filtered.map((e) =>
      [
        e.id,
        e.name,
        e.email,
        e.department,
        e.designation,
        e.manager,
        e.employmentType,
        e.status,
        e.loginEnabled ? "Enabled" : "Disabled",
        e.joinedAt,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkaii-employees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported", { description: `${filtered.length} employees exported as CSV.` });
  };

  const columns: Column<Employee>[] = [
    {
      key: "name",
      header: "Employee",
      render: (e) => (
        <button onClick={() => goProfile(e.id)} className="text-left">
          <UserAvatar
            name={e.name}
            email={e.email}
            src={e.avatarUrl}
            tone={e.avatarTone ?? "primary"}
            showMeta
            subtitle={e.email}
          />
        </button>
      ),
    },
    {
      key: "id",
      header: "ID",
      render: (e) => <span className="text-xs font-medium text-muted-foreground">{e.id}</span>,
    },
    {
      key: "designation",
      header: "Job",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{e.designation}</p>
          <p className="truncate text-xs text-muted-foreground">{e.department}</p>
        </div>
      ),
    },
    {
      key: "manager",
      header: "Reporting to",
      render: (e) => <span className="text-sm text-muted-foreground">{e.manager}</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (e) => (
        <span className="text-xs text-muted-foreground">
          {EMPLOYMENT_TYPE_LABEL[e.employmentType]}
        </span>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (e) => (
        <span className="text-xs text-muted-foreground">
          {new Date(e.joinedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (e) => (
        <div className="inline-flex flex-wrap items-center justify-end gap-2">
          <StatusBadge status={e.status} label={EMPLOYEE_STATUS_LABEL[e.status]} />
          {isPendingRowAction(e.id, "status") && <InlineSaving label="Updating" />}
        </div>
      ),
    },
    {
      key: "login",
      header: "Login",
      render: (e) =>
        canEdit ? (
          <div className="inline-flex flex-wrap items-center justify-end gap-2">
            <Switch
              checked={e.loginEnabled}
              disabled={isPendingRowAction(e.id)}
              onCheckedChange={(c) => {
                void runRowAction(e, "login", async () => {
                  await setLogin(e.id, c);
                  toast.success(c ? "Login enabled" : "Login disabled", { description: e.name });
                }).catch((error) => toastApiError(error, "Login access could not be updated."));
              }}
            />
            {isPendingRowAction(e.id, "login") && <InlineSaving label="Saving" />}
          </div>
        ) : (
          <StatusBadge
            status={e.loginEnabled ? "active" : "inactive"}
            label={e.loginEnabled ? "Enabled" : "Disabled"}
          />
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Employees"
        description={`${visible.length} ${visible.length === 1 ? "person" : "people"} in your workspace.`}
        actions={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? "Queueing..." : "Export"}
            </ActionButton>
            {canEdit && (
              <ActionButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                Add employee
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total employees"
          value={stats.total}
          icon={Users}
          tone="primary"
          hint="In your view"
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon={UserCheck}
          tone="success"
          hint="Active + Confirmed"
        />
        <StatCard
          label="On probation"
          value={stats.onProbation}
          icon={Hourglass}
          tone="warning"
          hint="Within probation period"
        />
        <StatCard
          label="New joiners"
          value={stats.newJoiners}
          icon={Sparkles}
          tone="info"
          hint="Last 90 days"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        searchKeys={["name", "email", "id", "designation", "department", "location"]}
        emptyTitle="No employees match these filters"
        emptyDescription={
          error
            ? userFacingErrorMessage(error, "Employee data could not be loaded from the backend.")
            : "Try adjusting your search or clearing filters."
        }
        loading={loading}
        toolbarRight={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-9 w-[150px] rounded-full">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={desg} onValueChange={setDesg}>
              <SelectTrigger className="h-9 w-[160px] rounded-full">
                <SelectValue placeholder="Designation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All designations</SelectItem>
                {Array.from(new Set(designations.map((d) => d.title))).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(EMPLOYEE_STATUS_LABEL) as EmployeeStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {EMPLOYEE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={empType} onValueChange={setEmpType}>
              <SelectTrigger className="h-9 w-[130px] rounded-full">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={login} onValueChange={setLoginFilter}>
              <SelectTrigger className="h-9 w-[130px] rounded-full">
                <SelectValue placeholder="Login" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any login</SelectItem>
                <SelectItem value="true">Login enabled</SelectItem>
                <SelectItem value="false">Login disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        rowActions={(e) => {
          const actions: {
            label: string;
            onClick?: () => void;
            tone?: "default" | "destructive";
            disabled?: boolean;
          }[] = [{ label: "View profile", onClick: () => goProfile(e.id) }];
          if (canEdit) {
            actions.push({ label: "Edit", onClick: () => openEdit(e) });
            actions.push({ label: "Manage roles", onClick: () => goProfile(e.id) });
            actions.push({
              label: isPendingRowAction(e.id, "login")
                ? "Saving login..."
                : e.loginEnabled
                  ? "Disable login"
                  : "Enable login",
              disabled: isPendingRowAction(e.id),
              onClick: () => {
                void runRowAction(e, "login", async () => {
                  await setLogin(e.id, !e.loginEnabled);
                  toast.success(!e.loginEnabled ? "Login enabled" : "Login disabled", {
                    description: e.name,
                  });
                }).catch((error) => toastApiError(error, "Login access could not be updated."));
              },
            });
            if (!isApiBacked && e.status !== "notice_period" && e.status !== "exited") {
              actions.push({
                label: isPendingRowAction(e.id, "status")
                  ? "Updating status..."
                  : "Mark notice period",
                disabled: isPendingRowAction(e.id),
                onClick: () => {
                  void runRowAction(e, "status", async () => {
                    await setStatus(e.id, "notice_period");
                    toast.success("Marked notice period", { description: e.name });
                  }).catch((error) =>
                    toastApiError(error, "Employee status could not be updated."),
                  );
                },
              });
            }
            actions.push({
              label: isPendingRowAction(e.id, "status") ? "Deactivating..." : "Deactivate",
              tone: "destructive",
              disabled: isPendingRowAction(e.id),
              onClick: () => {
                void runRowAction(e, "status", async () => {
                  await setStatus(e.id, "inactive");
                  toast.success("Employee deactivated", { description: e.name });
                }).catch((error) => toastApiError(error, "Employee could not be deactivated."));
              },
            });
          }
          return actions;
        }}
      />

      <EmployeeFormDrawer open={formOpen} onOpenChange={setFormOpen} initial={editing} />

      {/* tiny legend so action icons feel intentional */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3" /> View
        </span>
        <span className="inline-flex items-center gap-1">
          <Pencil className="h-3 w-3" /> Edit
        </span>
        <span className="inline-flex items-center gap-1">
          <KeyRound className="h-3 w-3" /> Roles
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Enable
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldOff className="h-3 w-3" /> Disable
        </span>
        <span className="inline-flex items-center gap-1">
          <UserMinus className="h-3 w-3" /> Deactivate
        </span>
      </div>
    </>
  );
}

function InlineSaving({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <LoaderCircle className="h-3 w-3 animate-spin" />
      {label}
    </span>
  );
}
