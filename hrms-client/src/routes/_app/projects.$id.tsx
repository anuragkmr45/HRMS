import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  StatusBadge,
  StatCard,
  ActionButton,
  EmptyState,
  UserAvatar,
  DataTable,
  type Column,
  ApprovalTimeline,
} from "@/components/ui-kit";
import { useProjects } from "@/lib/projects-store";
import { useAuth } from "@/lib/auth";
import { ProjectFormDrawer } from "@/components/projects/project-form-drawer";
import { documentsApi, useDocumentUploadPolicy } from "@/domains/documents";
import { queryKeys } from "@/shared/query";
import { prepareDocumentUploadFile, uploadPolicyAccept } from "@/shared/uploads/documents";
import {
  type ProjectMember,
  type ProjectModule,
  type ProjectDocument,
  PROJECT_STATUS_LABEL,
  PROJECT_HEALTH_LABEL,
  BILLING_TYPE_LABEL,
  PROJECT_TYPE_LABEL,
  PRIORITY_LABEL,
  MODULE_STATUS_LABEL,
} from "@/lib/mock/projects";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  DollarSign,
  Users,
  Activity,
  AlertTriangle,
  FileText,
  Pencil,
  TrendingUp,
  Building2,
  Wallet,
  History,
  CheckCircle2,
  Trash2,
  Upload,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/$id")({
  head: ({ params }) => ({ meta: [{ title: `Project ${params.id} — Hawkaii HRMS` }] }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { projects, removeMember, setStatus, loading, error, isApiBacked } = useProjects();
  const { activeRole, user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === id);

  const [editOpen, setEditOpen] = useState(false);

  const isMain = activeRole === "main_admin";
  const isPM = activeRole === "project_manager" && project?.manager === user?.name;
  const isFinance = activeRole === "finance_manager";
  const canEdit = project?.permissions?.can_edit ?? (isMain || isPM);
  const canManageDocuments = canEdit && isApiBacked;
  const uploadPolicyQuery = useDocumentUploadPolicy(canManageDocuments);

  const uploadDocument = useMutation({
    mutationFn: async (file: File) => {
      if (!project) throw new Error("Project is not loaded.");
      const prepared = await prepareDocumentUploadFile(file, uploadPolicyQuery.data);
      const formData = new FormData();
      formData.set("business_object_type", "project");
      formData.set("business_object_id", project.id);
      formData.set("classification", "normal");
      formData.set("document_type", "other");
      formData.set("file_name", prepared.file.name);
      formData.set("mime_type", prepared.file.type || "application/octet-stream");
      formData.set("size_bytes", String(prepared.file.size));
      formData.set("file", prepared.file);
      return documentsApi.create(formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("documents") });
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("projects") });
    },
  });

  const handleDocumentUpload = (file: File | undefined) => {
    if (!file) return;
    uploadDocument
      .mutateAsync(file)
      .then(() => toast.success("Project document uploaded"))
      .catch((err) =>
        toast.error("Document upload failed", {
          description: err instanceof Error ? err.message : "The backend did not accept the file.",
        }),
      );
  };

  const downloadDocument = (document: ProjectDocument) => {
    documentsApi
      .createDownloadUrl(document.id)
      .then((response) => {
        const url = typeof response.url === "string" ? response.url : "";
        if (!url) throw new Error("Download URL was not returned.");
        window.open(url, "_blank", "noopener,noreferrer");
      })
      .catch((err) =>
        toast.error("Download failed", {
          description:
            err instanceof Error ? err.message : "The backend did not return a file URL.",
        }),
      );
  };

  if (!project) {
    return (
      <Card className="rounded-2xl border-border/60 p-12">
        <EmptyState
          icon={Briefcase}
          title={
            error ? "Project could not load" : loading ? "Loading project" : "Project not found"
          }
          description={
            error
              ? error.message
              : loading
                ? "Waiting for the backend project detail."
                : "It may have been removed or you don't have access."
          }
          action={
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => navigate({ to: "/projects" })}
            >
              Back to projects
            </ActionButton>
          }
        />
      </Card>
    );
  }

  const changeStatus = (status: typeof project.status, label: string) => {
    Promise.resolve(setStatus(project.id, status, user?.name))
      .then(() => toast.success(label))
      .catch((err) =>
        toast.error("Project update failed", {
          description:
            err instanceof Error
              ? err.message
              : "The backend API did not accept the status change.",
        }),
      );
  };

  const progress = project.estimatedHours
    ? Math.min(100, Math.round((project.actualHours / project.estimatedHours) * 100))
    : 0;
  const budgetUsed = project.estimatedBudget
    ? Math.min(100, Math.round((project.actualSpend / project.estimatedBudget) * 100))
    : 0;
  const totalAllocation = project.members.reduce((s, m) => s + m.allocation, 0);
  const overAllocated = project.members.filter((m) => m.allocation > 100);
  const benchOpportunity = project.members.filter((m) => m.allocation < 50);

  const memberColumns: Column<ProjectMember>[] = [
    {
      key: "name",
      header: "Member",
      render: (m) => (
        <UserAvatar
          name={m.name}
          email={m.employeeId}
          tone="primary"
          showMeta
          subtitle={m.employeeId}
        />
      ),
    },
    { key: "role", header: "Role", render: (m) => <span className="text-sm">{m.role}</span> },
    {
      key: "alloc",
      header: "Allocation",
      render: (m) => (
        <div className="w-32">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">{m.allocation}%</span>
            {m.allocation > 100 && <span className="text-destructive">Over</span>}
          </div>
          <Progress value={Math.min(100, m.allocation)} className="mt-1 h-1.5" />
        </div>
      ),
    },
    {
      key: "billable",
      header: "Billable",
      render: (m) => <StatusBadge status={m.billable ? "billable" : "non_billable"} />,
    },
    {
      key: "lead",
      header: "Reporting lead",
      render: (m) => (
        <span className="text-sm text-muted-foreground">{m.reportingLead ?? "—"}</span>
      ),
    },
    {
      key: "dates",
      header: "Assignment",
      render: (m) => (
        <div className="text-xs">
          <p>
            {new Date(m.startDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {m.endDate && (
            <p className="text-muted-foreground">
              →{" "}
              {new Date(m.endDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      ),
    },
  ];

  const moduleColumns: Column<ProjectModule>[] = [
    {
      key: "name",
      header: "Module",
      render: (m) => <span className="text-sm font-medium">{m.name}</span>,
    },
    { key: "lead", header: "Lead", render: (m) => <span className="text-sm">{m.lead}</span> },
    {
      key: "status",
      header: "Status",
      render: (m) => <StatusBadge status={m.status} label={MODULE_STATUS_LABEL[m.status]} />,
    },
    {
      key: "dates",
      header: "Timeline",
      render: (m) => (
        <span className="text-xs text-muted-foreground">
          {new Date(m.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
          →{" "}
          {new Date(m.endDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (m) => (
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            m.priority === "critical" && "border-destructive/30 bg-destructive/10 text-destructive",
            m.priority === "high" &&
              "border-warning/40 bg-warning/15 text-warning-foreground dark:border-warning/30 dark:bg-warning/15 dark:text-warning",
            m.priority === "medium" && "border-info/30 bg-info/10 text-info",
            m.priority === "low" && "border-border bg-muted text-muted-foreground",
          )}
        >
          {PRIORITY_LABEL[m.priority]}
        </span>
      ),
    },
  ];

  const docColumns: Column<ProjectDocument>[] = [
    {
      key: "name",
      header: "Document",
      render: (d) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{d.name}</span>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (d) => (
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{d.category}</span>
      ),
    },
    { key: "size", header: "Size", render: (d) => <span className="text-xs">{d.size}</span> },
    {
      key: "by",
      header: "Uploaded by",
      render: (d) => <span className="text-xs text-muted-foreground">{d.uploadedBy}</span>,
    },
    {
      key: "at",
      header: "Uploaded",
      render: (d) => (
        <span className="text-xs text-muted-foreground">
          {new Date(d.uploadedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={!isApiBacked}
          onClick={() => downloadDocument(d)}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Download
        </Button>
      ),
    },
  ];

  return (
    <>
      <div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All projects
        </Link>
      </div>

      <PageHeader
        eyebrow={`${PROJECT_TYPE_LABEL[project.type]} · ${project.code}`}
        title={project.name}
        description={project.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status} label={PROJECT_STATUS_LABEL[project.status]} />
            <StatusBadge status={project.health} label={PROJECT_HEALTH_LABEL[project.health]} />
            {canEdit && (
              <ActionButton
                size="sm"
                variant="secondary"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </ActionButton>
            )}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start rounded-full bg-secondary/50 p-1">
          <TabsTrigger value="overview" className="rounded-full">
            Overview
          </TabsTrigger>
          <TabsTrigger value="team" className="rounded-full">
            Team
          </TabsTrigger>
          <TabsTrigger value="allocation" className="rounded-full">
            Allocation
          </TabsTrigger>
          <TabsTrigger value="modules" className="rounded-full">
            Modules
          </TabsTrigger>
          <TabsTrigger value="timesheets" className="rounded-full">
            Timesheets
          </TabsTrigger>
          {(isMain || isPM || isFinance) && (
            <TabsTrigger value="expenses" className="rounded-full">
              Expenses
            </TabsTrigger>
          )}
          <TabsTrigger value="documents" className="rounded-full">
            Documents
          </TabsTrigger>
          <TabsTrigger value="reports" className="rounded-full">
            Reports
          </TabsTrigger>
          <TabsTrigger value="audit" className="rounded-full">
            Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-2xl border-border/60 p-5 lg:col-span-2">
              <div className="grid gap-5 sm:grid-cols-2">
                <SummaryRow icon={Building2} label="Client" value={project.client} />
                <SummaryRow icon={Briefcase} label="Project manager" value={project.manager} />
                <SummaryRow
                  icon={Calendar}
                  label="Timeline"
                  value={`${fmt(project.startDate)} → ${fmt(project.endDate)}`}
                />
                <SummaryRow
                  icon={Wallet}
                  label="Billing type"
                  value={BILLING_TYPE_LABEL[project.billingType]}
                />
                <SummaryRow icon={Users} label="Department" value={project.department} />
                <SummaryRow
                  icon={DollarSign}
                  label="Cost center"
                  value={project.costCenter || "—"}
                />
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium">Effort</span>
                    <span className="text-muted-foreground">
                      {project.actualHours.toLocaleString()} /{" "}
                      {project.estimatedHours.toLocaleString()} hrs
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium">Budget vs actual</span>
                    <span className="text-muted-foreground">
                      ${project.actualSpend.toLocaleString()} / $
                      {project.estimatedBudget.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={budgetUsed} className="h-2" />
                </div>
              </div>

              {project.techStack.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tech stack
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.techStack.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border bg-secondary/40 px-2.5 py-0.5 text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div className="space-y-4">
              <StatCard
                label="Team size"
                value={project.members.length}
                icon={Users}
                tone="info"
                hint={`${totalAllocation}% total allocation`}
              />
              <StatCard
                label="Effort progress"
                value={`${progress}%`}
                icon={Activity}
                tone="primary"
                hint="Hours consumed"
              />
              <StatCard
                label="Budget used"
                value={`${budgetUsed}%`}
                icon={TrendingUp}
                tone={budgetUsed > 90 ? "destructive" : "success"}
                hint="Of estimated"
              />
              {canEdit && (
                <Card className="rounded-2xl border-border/60 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Quick actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {project.status !== "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => changeStatus("active", "Project active")}
                      >
                        Mark active
                      </Button>
                    )}
                    {project.status !== "on_hold" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => changeStatus("on_hold", "On hold")}
                      >
                        Put on hold
                      </Button>
                    )}
                    {project.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => changeStatus("completed", "Completed")}
                      >
                        Close out
                      </Button>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Team */}
        <TabsContent value="team" className="space-y-3">
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Project team</p>
                <p className="text-xs text-muted-foreground">
                  {project.members.length} members assigned
                </p>
              </div>
              {canEdit && (
                <ActionButton
                  size="sm"
                  variant="secondary"
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => setEditOpen(true)}
                >
                  Manage team
                </ActionButton>
              )}
            </div>
          </Card>

          {project.members.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={Users}
                title="No members yet"
                description="Add team members to start tracking allocation and timesheets."
              />
            </Card>
          ) : (
            <DataTable
              columns={memberColumns}
              rows={project.members}
              searchKeys={["name", "role", "employeeId"]}
              rowActions={
                canEdit
                  ? (m) => [
                      {
                        label: "Remove from project",
                        tone: "destructive",
                        onClick: () => {
                          Promise.resolve(removeMember(project.id, m.id, user?.name))
                            .then(() => toast.success("Member removed", { description: m.name }))
                            .catch((err) =>
                              toast.error("Member removal failed", {
                                description:
                                  err instanceof Error
                                    ? err.message
                                    : "The backend API did not accept the team change.",
                              }),
                            );
                        },
                      },
                    ]
                  : undefined
              }
            />
          )}
        </TabsContent>

        {/* Allocation */}
        <TabsContent value="allocation" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Total allocation"
              value={`${totalAllocation}%`}
              icon={Activity}
              tone="primary"
              hint={`${project.members.length} members`}
            />
            <StatCard
              label="Over-allocated"
              value={overAllocated.length}
              icon={AlertTriangle}
              tone={overAllocated.length ? "destructive" : "success"}
              hint=">100% allocation"
            />
            <StatCard
              label="Bench opportunity"
              value={benchOpportunity.length}
              icon={Users}
              tone="info"
              hint="<50% allocation"
            />
          </div>

          <Card className="rounded-2xl border-border/60 p-5">
            <p className="mb-4 text-sm font-semibold">Capacity by member</p>
            <div className="space-y-4">
              {project.members.map((m) => {
                const tone =
                  m.allocation > 100
                    ? "bg-destructive"
                    : m.allocation < 50
                      ? "bg-info"
                      : "bg-primary";
                return (
                  <div key={m.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{m.name}</span>
                      <span
                        className={cn(
                          "font-semibold",
                          m.allocation > 100 && "text-destructive",
                          m.allocation < 50 && "text-info",
                        )}
                      >
                        {m.allocation}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full transition-all", tone)}
                        style={{ width: `${Math.min(100, m.allocation)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {project.members.length === 0 && (
                <p className="text-xs text-muted-foreground">No allocation to chart yet.</p>
              )}
            </div>
          </Card>

          {overAllocated.length > 0 && (
            <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Over-allocation warning</p>
                  <p className="text-xs text-muted-foreground">
                    {overAllocated.map((m) => m.name).join(", ")}{" "}
                    {overAllocated.length === 1 ? "is" : "are"} allocated above 100%.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Modules */}
        <TabsContent value="modules">
          {project.modules.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={CheckCircle2}
                title="No modules yet"
                description="Break the project into delivery modules to track progress."
              />
            </Card>
          ) : (
            <DataTable
              columns={moduleColumns}
              rows={project.modules}
              searchKeys={["name", "lead"]}
            />
          )}
        </TabsContent>

        {/* Timesheets */}
        <TabsContent value="timesheets">
          <Card className="rounded-2xl border-border/60 p-10">
            <EmptyState
              icon={Clock}
              title="Project timesheets"
              description="Submitted hours from the timesheet module appear here once team members log time against this project."
              action={
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate({ to: "/timesheet" })}
                >
                  Open timesheet
                </ActionButton>
              }
            />
          </Card>
        </TabsContent>

        {/* Expenses */}
        {(isMain || isPM || isFinance) && (
          <TabsContent value="expenses">
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={Wallet}
                title="Project expenses"
                description="Reimbursements and direct project spend will be summarised here."
                action={
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate({ to: "/expenses" })}
                  >
                    Open expenses
                  </ActionButton>
                }
              />
            </Card>
          </TabsContent>
        )}

        {/* Documents */}
        <TabsContent value="documents" className="space-y-3">
          <div className="flex items-center justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept={uploadPolicyAccept(uploadPolicyQuery.data)}
              className="hidden"
              onChange={(event) => {
                handleDocumentUpload(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            {canManageDocuments && (
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadDocument.isPending}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                {uploadDocument.isPending ? "Uploading..." : "Upload document"}
              </Button>
            )}
          </div>
          {project.documents.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-10">
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description={
                  canManageDocuments
                    ? "Upload project documents to keep scope, contracts, and working files attached."
                    : "Project documents will appear here once they are attached."
                }
              />
            </Card>
          ) : (
            <DataTable
              columns={docColumns}
              rows={project.documents}
              searchKeys={["name", "category", "uploadedBy"]}
            />
          )}
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Project hours"
              value={project.actualHours.toLocaleString()}
              icon={Clock}
              tone="primary"
              hint={`Of ${project.estimatedHours.toLocaleString()} estimated`}
            />
            <StatCard
              label="Billable hours"
              value={isApiBacked ? "—" : Math.round(project.actualHours * 0.85).toLocaleString()}
              icon={DollarSign}
              tone="success"
              hint={isApiBacked ? "Use project reports" : "~85% billable mix"}
            />
            <StatCard
              label="Non-billable"
              value={isApiBacked ? "—" : Math.round(project.actualHours * 0.15).toLocaleString()}
              icon={Activity}
              tone="warning"
              hint={isApiBacked ? "Use project reports" : "Internal time"}
            />
            <StatCard
              label="Team utilization"
              value={`${Math.min(100, Math.round(totalAllocation / Math.max(1, project.members.length)))}%`}
              icon={Users}
              tone="info"
              hint="Avg allocation"
            />
          </div>

          <Card className="rounded-2xl border-border/60 p-5">
            <p className="mb-3 text-sm font-semibold">Expense summary</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <KPI
                label="Estimated budget"
                value={`$${project.estimatedBudget.toLocaleString()}`}
              />
              <KPI label="Actual spend" value={`$${project.actualSpend.toLocaleString()}`} />
              <KPI
                label="Variance"
                value={`$${(project.estimatedBudget - project.actualSpend).toLocaleString()}`}
                tone={project.actualSpend > project.estimatedBudget ? "down" : "up"}
              />
            </div>
          </Card>
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit">
          <Card className="rounded-2xl border-border/60 p-5">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Audit trail</p>
            </div>
            <ApprovalTimeline
              steps={project.audit
                .slice()
                .reverse()
                .map((a) => ({
                  status: "approved" as const,
                  approver: a.actor,
                  role: a.action,
                  at: new Date(a.at).toLocaleString(),
                  remark: a.remarks,
                }))}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <ProjectFormDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={project}
        actor={user?.name ?? "System"}
      />
    </>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold",
          tone === "up" && "text-success",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
