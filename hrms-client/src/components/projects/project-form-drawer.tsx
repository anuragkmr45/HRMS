import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepperForm, type Step } from "@/components/ui-kit";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEmployees } from "@/lib/employees-store";
import { nextProjectId, useProjects } from "@/lib/projects-store";
import {
  type Project,
  type ProjectType,
  type BillingType,
  type Priority,
  type ProjectMember,
  PROJECT_TYPE_LABEL,
  BILLING_TYPE_LABEL,
  PRIORITY_LABEL,
} from "@/lib/mock/projects";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Project | null;
  actor?: string;
}

interface FormState {
  name: string;
  code: string;
  client: string;
  type: ProjectType;
  billingType: BillingType;
  manager: string;
  managerUserId: string;
  startDate: string;
  endDate: string;
  description: string;
  estimatedHours: number;
  estimatedBudget: number;
  techStack: string;
  priority: Priority;
  costCenter: string;
  department: string;
  departmentId: string;
  members: ProjectMember[];
}

const empty = (): FormState => ({
  name: "",
  code: "",
  client: "",
  type: "client",
  billingType: "fixed",
  manager: "",
  managerUserId: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  description: "",
  estimatedHours: 0,
  estimatedBudget: 0,
  techStack: "",
  priority: "medium",
  costCenter: "",
  department: "Engineering",
  departmentId: "",
  members: [],
});

export function ProjectFormDrawer({ open, onOpenChange, initial, actor = "System" }: Props) {
  const { projects, upsert } = useProjects();
  const { employees, departments } = useEmployees();
  const [form, setForm] = useState<FormState>(empty());

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        code: initial.code,
        client: initial.client,
        type: initial.type,
        billingType: initial.billingType,
        manager: initial.manager,
        managerUserId: initial.managerUserId ?? "",
        startDate: initial.startDate,
        endDate: initial.endDate,
        description: initial.description,
        estimatedHours: initial.estimatedHours,
        estimatedBudget: initial.estimatedBudget,
        techStack: initial.techStack.join(", "),
        priority: initial.priority,
        costCenter: initial.costCenter,
        department: initial.department,
        departmentId: initial.departmentId ?? "",
        members: initial.members,
      });
    } else {
      setForm(empty());
    }
  }, [open, initial]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const managers = useMemo(
    () =>
      Array.from(
        new Set(
          employees
            .filter(
              (e) => e.systemRoles.includes("project_manager") || e.systemRoles.includes("manager"),
            )
            .map((e) => e.apiId ?? e.id),
        ),
      ),
    [employees],
  );

  const addMember = () =>
    update("members", [
      ...form.members,
      {
        id: "m_" + Math.random().toString(36).slice(2, 8),
        employeeId: employees[0]?.id ?? "",
        employeeUserId: employees[0]?.apiId,
        name: employees[0]?.name ?? "",
        role: "Engineer",
        allocation: 50,
        overAllocationAcknowledged: false,
        overAllocationReason: "",
        billable: true,
        startDate: form.startDate,
        endDate: undefined,
      },
    ]);

  const updateMember = (idx: number, patch: Partial<ProjectMember>) =>
    update(
      "members",
      form.members.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    );

  const removeMember = (idx: number) =>
    update(
      "members",
      form.members.filter((_, i) => i !== idx),
    );

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    if (!form.manager) {
      toast.error("Project manager is required");
      return;
    }
    if (
      form.members.some((member) => member.allocation > 100 && !member.overAllocationAcknowledged)
    ) {
      toast.error("Over-allocation must be acknowledged", {
        description: "Confirm the warning for every member above 100% allocation before saving.",
      });
      return;
    }
    const id = initial?.id ?? nextProjectId(projects);
    const next: Project = {
      id,
      code: form.code.trim() || id.replace("PRJ-", "P"),
      name: form.name.trim(),
      client: form.client.trim() || (form.type === "internal" ? "Hawkaii" : "—"),
      type: form.type,
      billingType: form.billingType,
      manager: form.manager,
      managerUserId: form.managerUserId || undefined,
      startDate: form.startDate,
      endDate: form.endDate || form.startDate,
      status: initial?.status ?? "planned",
      health: initial?.health ?? "green",
      description: form.description,
      estimatedHours: Number(form.estimatedHours) || 0,
      actualHours: initial?.actualHours ?? 0,
      estimatedBudget: Number(form.estimatedBudget) || 0,
      actualSpend: initial?.actualSpend ?? 0,
      techStack: form.techStack
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      priority: form.priority,
      costCenter: form.costCenter,
      department: form.department,
      departmentId: form.departmentId || undefined,
      members: form.members,
      modules: initial?.modules ?? [],
      documents: initial?.documents ?? [],
      audit: initial?.audit ?? [],
      version: initial?.version,
      permissions: initial?.permissions,
    };
    try {
      await upsert(next, actor);
      toast.success(initial ? "Project updated" : "Project created", { description: next.name });
      onOpenChange(false);
    } catch (error) {
      toast.error(initial ? "Project update failed" : "Project creation failed", {
        description:
          error instanceof Error ? error.message : "The backend API did not accept the project.",
      });
    }
  };

  const steps: Step[] = [
    {
      title: "Basics",
      description: "Identity & timeline",
      content: (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Project name *</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Atlas Payments Platform"
            />
          </div>
          <div>
            <Label>Project code</Label>
            <Input
              value={form.code}
              onChange={(e) => update("code", e.target.value)}
              placeholder="ATL-PAY"
            />
          </div>
          <div>
            <Label>Client name</Label>
            <Input
              value={form.client}
              onChange={(e) => update("client", e.target.value)}
              placeholder={form.type === "internal" ? "Hawkaii" : "NorthBank"}
            />
          </div>
          <div>
            <Label>Project type</Label>
            <Select value={form.type} onValueChange={(v) => update("type", v as ProjectType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PROJECT_TYPE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Billing type</Label>
            <Select
              value={form.billingType}
              onValueChange={(v) => update("billingType", v as BillingType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(BILLING_TYPE_LABEL) as BillingType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {BILLING_TYPE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Project manager *</Label>
            <Select
              value={form.managerUserId || form.manager}
              onValueChange={(v) => {
                const employee = employees.find((e) => e.apiId === v || e.id === v || e.name === v);
                update("managerUserId", employee?.apiId ?? v);
                update("manager", employee?.name ?? v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select PM" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((m) => {
                  const employee = employees.find(
                    (e) => e.apiId === m || e.id === m || e.name === m,
                  );
                  return (
                    <SelectItem key={m} value={m}>
                      {employee?.name ?? m}
                    </SelectItem>
                  );
                })}
                {managers.length === 0 &&
                  employees.slice(0, 8).map((e) => (
                    <SelectItem key={e.apiId ?? e.id} value={e.apiId ?? e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Start date</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => update("startDate", e.target.value)}
            />
          </div>
          <div>
            <Label>End date</Label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => update("endDate", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              placeholder="What is this project about?"
            />
          </div>
        </div>
      ),
    },
    {
      title: "Planning",
      description: "Effort, budget, ownership",
      content: (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Estimated hours</Label>
            <Input
              type="number"
              value={form.estimatedHours}
              onChange={(e) => update("estimatedHours", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Estimated budget (USD)</Label>
            <Input
              type="number"
              value={form.estimatedBudget}
              onChange={(e) => update("estimatedBudget", Number(e.target.value))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Technology stack</Label>
            <Input
              value={form.techStack}
              onChange={(e) => update("techStack", e.target.value)}
              placeholder="TypeScript, Node.js, AWS"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Comma-separated</p>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => update("priority", v as Priority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PRIORITY_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cost center</Label>
            <Input
              value={form.costCenter}
              onChange={(e) => update("costCenter", e.target.value)}
              placeholder="CC-DEL-01"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Department</Label>
            <Select
              value={form.departmentId || form.department}
              onValueChange={(v) => {
                const department = departments.find(
                  (d) => d.apiId === v || d.id === v || d.name === v,
                );
                update("departmentId", department?.apiId ?? v);
                update("department", department?.name ?? v);
                if (department?.costCenter && !form.costCenter.trim()) {
                  update("costCenter", department.costCenter);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.apiId ?? d.id} value={d.apiId ?? d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ),
    },
    {
      title: "Team",
      description: "Initial allocations",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Add the founding team. You can adjust allocations later.
            </p>
            <Button variant="outline" size="sm" onClick={addMember} className="rounded-full">
              <Plus className="mr-1 h-4 w-4" /> Add member
            </Button>
          </div>

          {form.members.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No team members yet. Click{" "}
              <span className="font-medium text-foreground">Add member</span> to get started.
            </div>
          )}

          <div className="space-y-3">
            {form.members.map((m, i) => (
              <div key={m.id} className="rounded-xl border bg-card p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Employee</Label>
                    <Select
                      value={m.employeeUserId || m.employeeId}
                      onValueChange={(v) => {
                        const emp = employees.find((e) => e.apiId === v || e.id === v);
                        updateMember(i, {
                          employeeId: emp?.id ?? v,
                          employeeUserId: emp?.apiId ?? v,
                          name: emp?.name ?? "",
                        });
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.apiId ?? e.id} value={e.apiId ?? e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Project role</Label>
                    <Input
                      className="h-9"
                      value={m.role}
                      onChange={(e) => updateMember(i, { role: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Allocation %</Label>
                    <Input
                      className="h-9"
                      type="number"
                      min={0}
                      max={200}
                      value={m.allocation}
                      onChange={(e) => updateMember(i, { allocation: Number(e.target.value) })}
                    />
                  </div>
                  {m.allocation > 100 && (
                    <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 sm:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-warning-foreground dark:text-warning">
                            Allocation is above 100%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Save only if the authorized project owner accepts this capacity risk.
                          </p>
                        </div>
                        <Switch
                          checked={Boolean(m.overAllocationAcknowledged)}
                          onCheckedChange={(checked) =>
                            updateMember(i, { overAllocationAcknowledged: checked })
                          }
                        />
                      </div>
                      <Input
                        className="mt-3 h-9"
                        value={m.overAllocationReason ?? ""}
                        onChange={(e) => updateMember(i, { overAllocationReason: e.target.value })}
                        placeholder="Reason for temporary over-allocation"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-5">
                    <Label className="text-xs">Billable</Label>
                    <Switch
                      checked={m.billable}
                      onCheckedChange={(c) => updateMember(i, { billable: c })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Assignment start</Label>
                    <Input
                      className="h-9"
                      type="date"
                      value={m.startDate}
                      onChange={(e) => updateMember(i, { startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Assignment end</Label>
                    <Input
                      className="h-9"
                      type="date"
                      value={m.endDate ?? ""}
                      onChange={(e) => updateMember(i, { endDate: e.target.value || undefined })}
                    />
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => removeMember(i)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>{initial ? "Edit project" : "Add project"}</SheetTitle>
          <SheetDescription>
            {initial
              ? "Update project details, planning and team."
              : "Set up a new project in 3 quick steps."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <StepperForm
            steps={steps}
            onComplete={submit}
            completeLabel={initial ? "Save changes" : "Create project"}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
