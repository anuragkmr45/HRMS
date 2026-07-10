import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAdminSettings,
  type WorkflowConfig,
  type WorkflowKey,
  type WorkflowStage,
} from "@/lib/admin-settings-store";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";
import { useAdminWorkflows, useUpdateAdminWorkflowMutation } from "@/domains/admin/queries";
import type { AdminWorkflowRecord } from "@/domains/admin/api";
import {
  Plus,
  Trash2,
  ArrowDown,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  GitBranch,
  MessageSquareWarning,
  Route as RouteIcon,
  Save,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin-settings/workflows")({
  component: WorkflowsScreen,
});

const APPROVER_TYPES: WorkflowStage["approverType"][] = [
  "Reporting Manager",
  "Role",
  "Specific User",
];

const WORKFLOW_COPY: Record<WorkflowKey, { module: string; description: string }> = {
  leave: {
    module: "Leave",
    description: "Controls leave approval routing before balance and calendar updates are final.",
  },
  wfh: {
    module: "Work from home",
    description: "Routes WFH requests through the reporting chain or a selected approving role.",
  },
  timesheet: {
    module: "Timesheets",
    description: "Defines who validates submitted hours before payroll and project reporting.",
  },
  expense: {
    module: "Expenses",
    description: "Moves claims from manager verification to finance review without self-approval.",
  },
  asset_request: {
    module: "Assets",
    description: "Controls asset request approvals before inventory allocation is permitted.",
  },
  helpdesk_escalation: {
    module: "Helpdesk",
    description: "Defines escalation owners when SLA routing requires an additional decision.",
  },
};

type ScreenWorkflow = WorkflowConfig & {
  version?: number;
};

function WorkflowsScreen() {
  const localSettings = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const workflowsQuery = useAdminWorkflows(apiEnabled);
  const updateWorkflow = useUpdateAdminWorkflowMutation();
  const [drafts, setDrafts] = useState<Record<string, ScreenWorkflow>>({});

  const apiWorkflows = useMemo(
    () => (workflowsQuery.data?.items ?? []).map(workflowFromApi),
    [workflowsQuery.data?.items],
  );

  useEffect(() => {
    if (!apiEnabled) return;
    setDrafts(Object.fromEntries(apiWorkflows.map((workflow) => [workflow.key, workflow])));
  }, [apiEnabled, apiWorkflows]);

  const workflows = apiEnabled
    ? apiWorkflows.map((workflow) => drafts[workflow.key] ?? workflow)
    : localSettings.workflows;
  const loading = apiEnabled && workflowsQuery.isLoading;
  const error = apiEnabled && workflowsQuery.error instanceof Error ? workflowsQuery.error : null;
  const workflowStats = useMemo(() => {
    const active = workflows.filter((workflow) => workflow.active).length;
    const stages = workflows.reduce((sum, workflow) => sum + workflow.stages.length, 0);
    const mandatoryRemarks = workflows.reduce(
      (sum, workflow) =>
        sum + workflow.stages.filter((stage) => stage.mandatoryRemarksOnReject).length,
      0,
    );
    return { total: workflows.length, active, stages, mandatoryRemarks };
  }, [workflows]);

  function updateWorkflowDraft(
    key: WorkflowKey,
    updater: (workflow: WorkflowConfig) => WorkflowConfig,
  ) {
    if (!apiEnabled) return;
    setDrafts((current) => {
      const workflow = current[key] ?? apiWorkflows.find((candidate) => candidate.key === key);
      if (!workflow) return current;
      return { ...current, [key]: { ...updater(workflow), version: workflow.version } };
    });
  }

  function toggleWorkflow(key: WorkflowKey) {
    if (!apiEnabled) {
      localSettings.toggleWorkflow(key);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({ ...workflow, active: !workflow.active }));
  }

  function addStage(key: WorkflowKey) {
    if (!apiEnabled) {
      localSettings.addStage(key);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({
      ...workflow,
      stages: [...workflow.stages, newStage(workflow)],
    }));
  }

  function updateStage(key: WorkflowKey, stageId: string, patch: Partial<WorkflowStage>) {
    if (!apiEnabled) {
      localSettings.updateStage(key, stageId, patch);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({
      ...workflow,
      stages: workflow.stages.map((stage) =>
        stage.id === stageId ? { ...stage, ...patch } : stage,
      ),
    }));
  }

  function removeStage(key: WorkflowKey, stageId: string) {
    if (!apiEnabled) {
      localSettings.removeStage(key, stageId);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({
      ...workflow,
      stages: workflow.stages.filter((stage) => stage.id !== stageId),
    }));
  }

  async function saveWorkflow(workflow: ScreenWorkflow) {
    if (!apiEnabled || !workflow.version) return;
    try {
      await updateWorkflow.mutateAsync({
        workflowKey: workflow.key,
        input: {
          label: workflow.label,
          active: workflow.active,
          expected_version: workflow.version,
          stages: workflow.stages.map((stage, index) => ({
            id: stage.id,
            order: index + 1,
            approverType: stage.approverType,
            approverValue: stage.approverValue,
            escalateAfterDays: stage.escalateAfterDays,
            mandatoryRemarksOnReject: stage.mandatoryRemarksOnReject,
          })),
        },
      });
      toast.success("Workflow saved");
    } catch (saveError) {
      toastApiError(saveError, "Workflow update failed");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" />
              Approval workflow control
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Route approvals by module</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure each module as a separate approval chain. Every chain keeps its own status,
              approvers, escalation window and rejection rule.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:min-w-[280px]">
            <MetricTile label="Workflows" value={workflowStats.total} icon={RouteIcon} />
            <MetricTile label="Active" value={workflowStats.active} icon={CheckCircle2} />
            <MetricTile label="Stages" value={workflowStats.stages} icon={UserRoundCheck} />
            <MetricTile
              label="Remarks required"
              value={workflowStats.mandatoryRemarks}
              icon={MessageSquareWarning}
            />
          </div>
        </div>
      </section>

      <Card className="flex items-start gap-3 rounded-2xl border-warning/40 bg-warning/5 p-4 text-sm dark:border-warning/30 dark:bg-warning/10">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground dark:text-warning" />
        <div>
          <p className="font-medium text-foreground">Self-approval protection is enforced.</p>
          <p className="mt-0.5 text-muted-foreground">
            Even if a requester matches an approver rule, their own request routes to the next
            eligible approver in the configured chain.
          </p>
        </div>
      </Card>

      {loading ? (
        <Card className="rounded-2xl border-border/60 p-6 text-sm text-muted-foreground">
          Loading workflow configuration...
        </Card>
      ) : error ? (
        <Card className="rounded-2xl border-border/60 p-6 text-sm text-destructive">
          {error.message}
        </Card>
      ) : workflows.length === 0 ? (
        <Card className="rounded-2xl border-border/60 p-8 text-center text-sm text-muted-foreground">
          No approval workflows have been configured yet.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.key}
              wf={workflow}
              apiEnabled={apiEnabled}
              saving={updateWorkflow.isPending}
              onToggle={toggleWorkflow}
              onAddStage={addStage}
              onUpdateStage={updateStage}
              onRemoveStage={removeStage}
              onSave={saveWorkflow}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof GitBranch;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-semibold leading-none">{value}</p>
    </div>
  );
}

function WorkflowCard({
  wf,
  apiEnabled,
  saving,
  onToggle,
  onAddStage,
  onUpdateStage,
  onRemoveStage,
  onSave,
}: {
  wf: ScreenWorkflow;
  apiEnabled: boolean;
  saving: boolean;
  onToggle: (key: WorkflowKey) => void;
  onAddStage: (key: WorkflowKey) => void;
  onUpdateStage: (key: WorkflowKey, stageId: string, patch: Partial<WorkflowStage>) => void;
  onRemoveStage: (key: WorkflowKey, stageId: string) => void;
  onSave: (workflow: ScreenWorkflow) => void;
}) {
  const copy = WORKFLOW_COPY[wf.key] ?? {
    module: wf.label,
    description: "Configure the approval chain for this workflow.",
  };
  const totalEscalationDays = wf.stages.reduce(
    (sum, stage) => sum + Number(stage.escalateAfterDays || 0),
    0,
  );

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 p-0">
      <div className="border-b bg-muted/20 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {copy.module}
              </Badge>
              <Badge
                variant="outline"
                className={
                  wf.active
                    ? "border-success/40 bg-success/10 text-success-foreground"
                    : "border-muted-foreground/30 text-muted-foreground"
                }
              >
                {wf.active ? "Active" : "Disabled"}
              </Badge>
            </div>
            <h3 className="mt-2 text-base font-semibold">{wf.label}</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
              <span className="text-xs text-muted-foreground">Enabled</span>
              <Switch checked={wf.active} onCheckedChange={() => onToggle(wf.key)} />
            </div>
            {apiEnabled && (
              <Button
                size="sm"
                onClick={() => onSave(wf)}
                disabled={saving}
                style={{ background: "var(--gradient-primary)" }}
                className="text-primary-foreground"
              >
                <Save className="mr-1.5 h-4 w-4" />
                Save workflow
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[300px_1fr]">
        <aside className="border-b bg-background p-5 lg:border-b-0 lg:border-r">
          <div className="space-y-3">
            <WorkflowFact
              icon={RouteIcon}
              label="Approval model"
              value="Linear sequence"
              detail="Stages run from top to bottom."
            />
            <WorkflowFact
              icon={UserRoundCheck}
              label="Configured stages"
              value={String(wf.stages.length)}
              detail={wf.stages.length === 1 ? "Single approver step" : "Multiple approver steps"}
            />
            <WorkflowFact
              icon={Clock3}
              label="Escalation window"
              value={`${totalEscalationDays} day${totalEscalationDays === 1 ? "" : "s"}`}
              detail="Total configured escalation time."
            />
            <WorkflowFact
              icon={MessageSquareWarning}
              label="Reject remarks"
              value={`${wf.stages.filter((stage) => stage.mandatoryRemarksOnReject).length}/${wf.stages.length}`}
              detail="Stages requiring rejection comments."
            />
          </div>

          <div className="mt-5 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground dark:border-warning/30 dark:bg-warning/10">
            <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground dark:text-warning" />
              Change impact
            </div>
            New submissions use the latest saved workflow. Existing in-flight requests keep their
            current timeline.
          </div>
        </aside>

        <div className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Approval chain</p>
              <p className="text-xs text-muted-foreground">
                Keep each stage focused: who approves, when to escalate, and what is required on
                rejection.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onAddStage(wf.key)}>
              <Plus className="mr-1 h-4 w-4" /> Add stage
            </Button>
          </div>

          <div className="space-y-3">
            {wf.stages.map((stage, idx) => (
              <StageEditor
                key={stage.id}
                workflow={wf}
                stage={stage}
                index={idx}
                canRemove={wf.stages.length > 1}
                onUpdateStage={onUpdateStage}
                onRemoveStage={onRemoveStage}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function WorkflowFact({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof GitBranch;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-sm font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function StageEditor({
  workflow,
  stage,
  index,
  canRemove,
  onUpdateStage,
  onRemoveStage,
}: {
  workflow: ScreenWorkflow;
  stage: WorkflowStage;
  index: number;
  canRemove: boolean;
  onUpdateStage: (key: WorkflowKey, stageId: string, patch: Partial<WorkflowStage>) => void;
  onRemoveStage: (key: WorkflowKey, stageId: string) => void;
}) {
  const stageTitle =
    stage.approverType === "Reporting Manager"
      ? "Manager approval"
      : stage.approverType === "Role"
        ? "Role-based approval"
        : "Named user approval";

  return (
    <div className="relative rounded-2xl border bg-card p-4 shadow-sm">
      {index > 0 && (
        <div className="absolute -top-5 left-8 flex h-5 items-center text-muted-foreground">
          <ArrowDown className="h-4 w-4" />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-semibold">
              Stage {index + 1}: {stageTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              This approver must act before the request moves to the next stage.
            </p>
          </div>
        </div>
        {canRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start text-destructive"
            onClick={() => onRemoveStage(workflow.key, stage.id)}
            title="Remove stage"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_220px]">
        <section className="rounded-xl border bg-background p-3">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Approver routing
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Approver type</Label>
              <Select
                value={stage.approverType}
                onValueChange={(value) =>
                  onUpdateStage(workflow.key, stage.id, {
                    approverType: value as WorkflowStage["approverType"],
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {stage.approverType === "Reporting Manager"
                  ? "Manager scope"
                  : stage.approverType === "Role"
                    ? "Role"
                    : "User"}
              </Label>
              <Input
                className="h-9"
                value={stage.approverValue}
                onChange={(event) =>
                  onUpdateStage(workflow.key, stage.id, { approverValue: event.target.value })
                }
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-background p-3">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Escalation
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Escalate after</Label>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 max-w-[96px]"
                type="number"
                min={0}
                value={stage.escalateAfterDays}
                onChange={(event) =>
                  onUpdateStage(workflow.key, stage.id, {
                    escalateAfterDays: Number(event.target.value),
                  })
                }
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border bg-muted/20 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Decision rule
            </p>
            <p className="text-sm font-medium">Require remarks when rejecting at this stage</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {stage.mandatoryRemarksOnReject ? "Required" : "Optional"}
            </span>
            <Switch
              checked={stage.mandatoryRemarksOnReject}
              onCheckedChange={(value) =>
                onUpdateStage(workflow.key, stage.id, { mandatoryRemarksOnReject: value })
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function workflowFromApi(workflow: AdminWorkflowRecord): ScreenWorkflow {
  return {
    key: workflow.key as WorkflowKey,
    label: workflow.label,
    active: workflow.active,
    version: workflow.version,
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      approverType: stage.approverType,
      approverValue: stage.approverValue,
      escalateAfterDays: stage.escalateAfterDays,
      mandatoryRemarksOnReject: stage.mandatoryRemarksOnReject,
    })),
  };
}

function newStage(workflow: WorkflowConfig): WorkflowStage {
  const order = workflow.stages.length + 1;
  return {
    id: `${workflow.key}_stage_${Date.now().toString(36)}_${order}`,
    approverType: "Role",
    approverValue: "Manager",
    escalateAfterDays: 2,
    mandatoryRemarksOnReject: true,
  };
}
