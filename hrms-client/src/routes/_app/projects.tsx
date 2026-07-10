import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  PageHeader,
  StatCard,
  StatusBadge,
  DataTable,
  type Column,
  ActionButton,
  UserAvatar,
} from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects } from "@/lib/projects-store";
import { useAuth } from "@/lib/auth";
import { useEmployees } from "@/lib/employees-store";
import { documentsApi } from "@/domains/documents";
import { useCreateReportExportMutation } from "@/domains/reports";
import { ProjectFormDrawer } from "@/components/projects/project-form-drawer";
import {
  type Project,
  type ProjectStatus,
  type BillingType,
  PROJECT_STATUS_LABEL,
  PROJECT_HEALTH_LABEL,
  BILLING_TYPE_LABEL,
} from "@/lib/mock/projects";
import {
  Briefcase,
  Plus,
  Download,
  Activity,
  CircleDot,
  CheckCircle2,
  PauseCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({ meta: [{ title: "Projects — Hawkaii HRMS" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { projects, setStatus, loading, error, isApiBacked } = useProjects();
  const { departments } = useEmployees();
  const { activeRole, user } = useAuth();
  const navigate = useNavigate();
  const exportMutation = useCreateReportExportMutation();

  const isMain = activeRole === "main_admin";
  const isPM = activeRole === "project_manager";
  const isManager = activeRole === "manager";
  const isFinance = activeRole === "finance_manager";
  const canEdit = isMain || isPM;

  const visible = useMemo(() => {
    if (isMain || isFinance) return projects;
    if (isPM) return projects.filter((p) => p.manager === user?.name);
    if (isManager)
      return projects.filter((p) => p.members.some((m) => m.reportingLead === user?.name));
    // employee
    return projects.filter((p) => p.members.some((m) => m.name === user?.name));
  }, [projects, isMain, isPM, isManager, isFinance, user]);

  const [status, setStatusFilter] = useState<string>("all");
  const [pm, setPm] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [dept, setDept] = useState<string>("all");
  const [billing, setBilling] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const pms = useMemo(() => Array.from(new Set(projects.map((p) => p.manager))), [projects]);

  const filtered = useMemo(() => {
    return visible.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (pm !== "all" && p.manager !== pm) return false;
      if (type !== "all" && p.type !== type) return false;
      if (dept !== "all" && p.department !== dept) return false;
      if (billing !== "all" && p.billingType !== billing) return false;
      return true;
    });
  }, [visible, status, pm, type, dept, billing]);

  const stats = useMemo(() => {
    return {
      total: visible.length,
      active: visible.filter((p) => p.status === "active").length,
      onHold: visible.filter((p) => p.status === "on_hold").length,
      completed: visible.filter((p) => p.status === "completed").length,
    };
  }, [visible]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setFormOpen(true);
  };
  const goDetail = (id: string) => navigate({ to: "/projects/$id", params: { id } });

  const changeStatus = (p: Project, nextStatus: Project["status"], label: string) => {
    Promise.resolve(setStatus(p.id, nextStatus, user?.name))
      .then(() => toast.success(label, { description: p.name }))
      .catch((err) =>
        toast.error("Project update failed", {
          description:
            err instanceof Error
              ? err.message
              : "The backend API did not accept the status change.",
        }),
      );
  };

  const handleExport = async () => {
    const headers = [
      "Code",
      "Name",
      "Client",
      "Type",
      "Manager",
      "Start",
      "End",
      "Team",
      "Billing",
      "Status",
      "Health",
    ];
    if (isApiBacked) {
      try {
        const job = await exportMutation.mutateAsync({
          format: "csv",
          report_type: "projects/summary",
          filters: {
            status: status !== "all" ? status : undefined,
            type: type !== "all" ? type : undefined,
          },
        });
        const jobId = String(job.job_id ?? job.export_id ?? "created").slice(0, 8);
        if (typeof job.download_document_id === "string" && job.download_document_id) {
          const download = await documentsApi.createDownloadUrl(job.download_document_id);
          if (typeof download.url === "string" && download.url) {
            window.open(download.url, "_blank", "noopener,noreferrer");
          }
          toast.success("Export ready", {
            description: `Project export ${jobId} was generated by the backend.`,
          });
        } else {
          toast.success("Export queued", {
            description: `Project export ${jobId} is waiting for a backend renderer.`,
          });
        }
      } catch (err) {
        toast.error("Export failed", {
          description:
            err instanceof Error
              ? err.message
              : "The backend could not generate the project export.",
        });
      }
      return;
    }
    const rows = filtered.map((p) =>
      [
        p.code,
        p.name,
        p.client,
        p.type,
        p.manager,
        p.startDate,
        p.endDate,
        p.members.length,
        p.billingType,
        p.status,
        p.health,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkaii-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported", { description: `${filtered.length} projects exported as CSV.` });
  };

  const columns: Column<Project>[] = [
    {
      key: "code",
      header: "Code",
      render: (p) => (
        <button
          onClick={() => goDetail(p.id)}
          className="font-mono text-xs font-semibold text-primary hover:underline"
        >
          {p.code}
        </button>
      ),
    },
    {
      key: "name",
      header: "Project",
      render: (p) => (
        <button onClick={() => goDetail(p.id)} className="text-left">
          <p className="text-sm font-semibold leading-tight">{p.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.description}</p>
        </button>
      ),
    },
    { key: "client", header: "Client", render: (p) => <span className="text-sm">{p.client}</span> },
    {
      key: "type",
      header: "Type",
      render: (p) => <StatusBadge status={p.type} />,
    },
    {
      key: "manager",
      header: "Manager",
      render: (p) => (
        <UserAvatar name={p.manager} email={p.managerEmail ?? ""} tone="primary" showMeta={false} />
      ),
    },
    {
      key: "timeline",
      header: "Timeline",
      render: (p) => (
        <div className="text-xs">
          <p className="font-medium">
            {new Date(p.startDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className="text-muted-foreground">
            →{" "}
            {new Date(p.endDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      ),
    },
    {
      key: "team",
      header: "Team",
      render: (p) => <span className="text-sm font-medium">{p.members.length}</span>,
    },
    {
      key: "billing",
      header: "Billing",
      render: (p) => (
        <StatusBadge status={p.billingType} label={BILLING_TYPE_LABEL[p.billingType]} />
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusBadge status={p.status} label={PROJECT_STATUS_LABEL[p.status]} />,
    },
    {
      key: "health",
      header: "Health",
      render: (p) => <StatusBadge status={p.health} label={PROJECT_HEALTH_LABEL[p.health]} />,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Projects"
        description={
          loading
            ? "Loading projects from Hawkaii HRMS."
            : error
              ? "Project data could not be loaded from the backend."
              : `${visible.length} ${visible.length === 1 ? "project" : "projects"} in your view.`
        }
        actions={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={handleExport}
              disabled={isApiBacked && exportMutation.isPending}
            >
              {isApiBacked && exportMutation.isPending ? "Exporting" : "Export"}
            </ActionButton>
            {canEdit && (
              <ActionButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                Add project
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total projects"
          value={stats.total}
          icon={Briefcase}
          tone="primary"
          hint="In your view"
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon={Activity}
          tone="success"
          hint="In flight"
        />
        <StatCard
          label="On hold"
          value={stats.onHold}
          icon={PauseCircle}
          tone="warning"
          hint="Paused"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          icon={CheckCircle2}
          tone="info"
          hint="Closed out"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        searchKeys={["name", "code", "client", "manager", "department"]}
        emptyTitle={
          error
            ? "Projects could not load"
            : loading
              ? "Loading projects"
              : "No projects match these filters"
        }
        emptyDescription={
          error
            ? error.message
            : loading
              ? "Waiting for the backend project portfolio."
              : "Try clearing filters or adjusting the search."
        }
        toolbarRight={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pm} onValueChange={setPm}>
              <SelectTrigger className="h-9 w-[160px] rounded-full">
                <SelectValue placeholder="Manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {pms.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 w-[130px] rounded-full">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Client + Internal</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
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
            <Select value={billing} onValueChange={setBilling}>
              <SelectTrigger className="h-9 w-[140px] rounded-full">
                <SelectValue placeholder="Billing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All billing</SelectItem>
                {(Object.keys(BILLING_TYPE_LABEL) as BillingType[]).map((b) => (
                  <SelectItem key={b} value={b}>
                    {BILLING_TYPE_LABEL[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        rowActions={(p) => {
          const actions: {
            label: string;
            onClick?: () => void;
            tone?: "default" | "destructive";
          }[] = [{ label: "Open project", onClick: () => goDetail(p.id) }];
          const canEditProject = p.permissions?.can_edit ?? canEdit;
          if (canEditProject) {
            actions.push({ label: "Edit", onClick: () => openEdit(p) });
            if (p.status !== "active") {
              actions.push({
                label: "Mark active",
                onClick: () => changeStatus(p, "active", "Project marked active"),
              });
            }
            if (p.status !== "on_hold") {
              actions.push({
                label: "Put on hold",
                onClick: () => changeStatus(p, "on_hold", "Project on hold"),
              });
            }
            if (p.status !== "completed") {
              actions.push({
                label: "Mark completed",
                onClick: () => changeStatus(p, "completed", "Project completed"),
              });
            }
            actions.push({
              label: "Cancel project",
              tone: "destructive",
              onClick: () => changeStatus(p, "cancelled", "Project cancelled"),
            });
          }
          return actions;
        }}
      />

      <ProjectFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        actor={user?.name ?? "System"}
      />

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CircleDot className="h-3 w-3 text-success" /> Green = on track
        </span>
        <span className="inline-flex items-center gap-1">
          <CircleDot className="h-3 w-3 text-warning-foreground dark:text-warning" /> Amber = at
          risk
        </span>
        <span className="inline-flex items-center gap-1">
          <CircleDot className="h-3 w-3 text-destructive" /> Red = critical
        </span>
      </div>
    </>
  );
}
