import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarClock, History, Pencil, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateShiftAssignmentsMutation,
  useCreateShiftTemplateMutation,
  useCreateShiftVersionMutation,
  useShiftAssignments,
  useShiftReferences,
  useShiftTemplates,
  useShiftVersions,
  useUpdateShiftAssignmentMutation,
  useUpdateShiftTemplateMutation,
} from "@/domains/admin/queries";
import type {
  ShiftTemplateRecord,
  ShiftTimezoneStrategy,
  ShiftVersionInput,
} from "@/domains/admin/api";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/admin-settings/shifts")({
  component: ShiftAdminScreen,
});

const today = () => new Date().toISOString().slice(0, 10);

const initialSchedule = (): ShiftVersionInput => ({
  effective_from: today(),
  effective_until: null,
  local_start_time: "09:00",
  local_end_time: "18:00",
  crosses_midnight: false,
  timezone_strategy: "company",
  fixed_timezone: null,
  eligibility_open_before_start_minutes: 120,
  eligibility_close_after_end_minutes: 240,
});

function ShiftAdminScreen() {
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const templatesQuery = useShiftTemplates(apiEnabled);
  const assignmentsQuery = useShiftAssignments(apiEnabled);
  const referencesQuery = useShiftReferences(apiEnabled);
  const createTemplate = useCreateShiftTemplateMutation();
  const updateTemplate = useUpdateShiftTemplateMutation();
  const createVersion = useCreateShiftVersionMutation();
  const createAssignments = useCreateShiftAssignmentsMutation();
  const updateAssignment = useUpdateShiftAssignmentMutation();

  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplateRecord | null>(null);
  const [versionTemplate, setVersionTemplate] = useState<ShiftTemplateRecord | null>(null);
  const [assignmentDialog, setAssignmentDialog] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    code: "",
    name: "",
    description: "",
    status: "active" as "active" | "inactive",
    is_company_default: false,
    schedule: initialSchedule(),
  });
  const [versionForm, setVersionForm] = useState<ShiftVersionInput>(initialSchedule);
  const [assignmentForm, setAssignmentForm] = useState({
    target_type: "employee" as "employee" | "department",
    target_id: "",
    template_id: "",
    effective_from: today(),
    effective_until: "",
  });

  const versionsQuery = useShiftVersions(versionTemplate?.id ?? null, apiEnabled);
  const templates = templatesQuery.data?.items ?? [];
  const assignments = assignmentsQuery.data?.items ?? [];
  const activeTemplates = templates.filter((template) => template.status === "active");
  const busy =
    createTemplate.isPending ||
    updateTemplate.isPending ||
    createVersion.isPending ||
    createAssignments.isPending;

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      code: "",
      name: "",
      description: "",
      status: "active",
      is_company_default: false,
      schedule: initialSchedule(),
    });
    setTemplateDialog(true);
  };

  const openEditTemplate = (template: ShiftTemplateRecord) => {
    setEditingTemplate(template);
    setTemplateForm({
      code: template.code,
      name: template.name,
      description: template.description ?? "",
      status: template.status,
      is_company_default: template.is_company_default,
      schedule: initialSchedule(),
    });
    setTemplateDialog(true);
  };

  const openVersions = (template: ShiftTemplateRecord) => {
    setVersionTemplate(template);
    const latest = template.latest_version;
    setVersionForm({
      ...initialSchedule(),
      local_start_time: latest?.local_start_time ?? "09:00",
      local_end_time: latest?.local_end_time ?? "18:00",
      crosses_midnight: latest?.crosses_midnight ?? false,
      timezone_strategy: latest?.timezone_strategy ?? "company",
      fixed_timezone: latest?.fixed_timezone ?? null,
      eligibility_open_before_start_minutes: latest?.eligibility_open_before_start_minutes ?? 120,
      eligibility_close_after_end_minutes: latest?.eligibility_close_after_end_minutes ?? 240,
    });
  };

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) return toast.error("Shift name is required.");
    if (!editingTemplate && !templateForm.code.trim()) {
      return toast.error("Shift code is required.");
    }
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          input: {
            name: templateForm.name,
            description: templateForm.description || null,
            status: templateForm.status,
            is_company_default: templateForm.status === "active" && templateForm.is_company_default,
            expected_version: editingTemplate.version,
          },
        });
        toast.success("Shift template updated.");
      } else {
        await createTemplate.mutateAsync({
          code: templateForm.code,
          name: templateForm.name,
          description: templateForm.description || null,
          is_company_default: templateForm.is_company_default,
          version: templateForm.schedule,
        });
        toast.success("Shift template created.");
      }
      setTemplateDialog(false);
    } catch (error) {
      toastApiError(error, "Unable to save shift template.");
    }
  };

  const saveVersion = async () => {
    if (!versionTemplate) return;
    try {
      await createVersion.mutateAsync({
        templateId: versionTemplate.id,
        input: versionForm,
      });
      toast.success("New shift version scheduled.");
      setVersionForm((current) => ({ ...current, effective_from: today(), effective_until: null }));
    } catch (error) {
      toastApiError(error, "Unable to create shift version.");
    }
  };

  const saveAssignment = async () => {
    if (!assignmentForm.target_id || !assignmentForm.template_id) {
      return toast.error("Select a target and shift template.");
    }
    try {
      const result = await createAssignments.mutateAsync({
        target_type: assignmentForm.target_type,
        target_id: assignmentForm.target_id,
        template_id: assignmentForm.template_id,
        effective_from: assignmentForm.effective_from,
        effective_until: assignmentForm.effective_until || null,
      });
      toast.success(
        result.created_count === 1
          ? "Shift assigned."
          : `Shift assigned to ${result.created_count} employees.`,
      );
      setAssignmentDialog(false);
    } catch (error) {
      toastApiError(error, "Unable to assign shift.");
    }
  };

  const toggleAssignment = async (id: string, version: number, isActive: boolean) => {
    try {
      await updateAssignment.mutateAsync({
        id,
        expectedVersion: version,
        status: isActive ? "inactive" : "active",
      });
      toast.success(isActive ? "Assignment deactivated." : "Assignment activated.");
    } catch (error) {
      toastApiError(error, "Unable to update assignment.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Shift scheduling</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Maintain effective-dated schedules and employee assignments.
          </p>
        </div>
        <Button onClick={openCreateTemplate}>
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">
            <CalendarClock className="mr-2 h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <Users className="mr-2 h-4 w-4" />
            Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <SectionState
            loading={templatesQuery.isLoading}
            error={templatesQuery.error}
            empty={templates.length === 0}
            emptyMessage="No shift templates are configured."
          >
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Current schedule</TableHead>
                    <TableHead>Effective period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div className="font-medium">{template.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {template.code}
                        </div>
                      </TableCell>
                      <TableCell>{scheduleLabel(template)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {effectivePeriod(template.latest_version)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={template.status === "active" ? "default" : "secondary"}>
                            {template.status}
                          </Badge>
                          {template.is_company_default && (
                            <Badge variant="outline">Company default</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Version history"
                            onClick={() => openVersions(template)}
                          >
                            <History className="h-4 w-4" />
                            <span className="sr-only">Version history</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit template"
                            onClick={() => openEditTemplate(template)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit template</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionState>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setAssignmentForm({
                  target_type: "employee",
                  target_id: "",
                  template_id: activeTemplates[0]?.id ?? "",
                  effective_from: today(),
                  effective_until: "",
                });
                setAssignmentDialog(true);
              }}
              disabled={activeTemplates.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Assign shift
            </Button>
          </div>
          <SectionState
            loading={assignmentsQuery.isLoading}
            error={assignmentsQuery.error}
            empty={assignments.length === 0}
            emptyMessage="No shift assignments are configured."
          >
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Effective period</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <div className="font-medium">{assignment.employee_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {assignment.employee_code}
                        </div>
                      </TableCell>
                      <TableCell>{assignment.department_name ?? "Unassigned"}</TableCell>
                      <TableCell>
                        <div>{assignment.template_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {assignment.template_code}
                        </div>
                      </TableCell>
                      <TableCell>
                        {assignment.effective_from} to {assignment.effective_until ?? "ongoing"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={assignment.status === "active"}
                            disabled={updateAssignment.isPending}
                            onCheckedChange={() =>
                              void toggleAssignment(
                                assignment.id,
                                assignment.version,
                                assignment.status === "active",
                              )
                            }
                            aria-label={`Toggle ${assignment.employee_name} assignment`}
                          />
                          <span className="text-xs capitalize">{assignment.status}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionState>
        </TabsContent>
      </Tabs>

      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit shift template" : "New shift template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update template identity and availability."
                : "Create the template and its first effective schedule version."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="shift-code">
              <Input
                id="shift-code"
                value={templateForm.code}
                disabled={Boolean(editingTemplate)}
                onChange={(event) =>
                  setTemplateForm((form) => ({ ...form, code: event.target.value.toUpperCase() }))
                }
                placeholder="NIGHT_01"
              />
            </Field>
            <Field label="Name" htmlFor="shift-name">
              <Input
                id="shift-name"
                value={templateForm.name}
                onChange={(event) =>
                  setTemplateForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="shift-description">
                <Textarea
                  id="shift-description"
                  value={templateForm.description}
                  onChange={(event) =>
                    setTemplateForm((form) => ({ ...form, description: event.target.value }))
                  }
                />
              </Field>
            </div>
            {editingTemplate && (
              <Field label="Status" htmlFor="shift-status">
                <Select
                  value={templateForm.status}
                  onValueChange={(value: "active" | "inactive") =>
                    setTemplateForm((form) => ({ ...form, status: value }))
                  }
                >
                  <SelectTrigger id="shift-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
            <SwitchField
              label="Company default"
              checked={templateForm.is_company_default}
              disabled={templateForm.status === "inactive"}
              onCheckedChange={(checked) =>
                setTemplateForm((form) => ({ ...form, is_company_default: checked }))
              }
            />
          </div>
          {!editingTemplate && (
            <div className="border-t pt-4">
              <ScheduleFields
                value={templateForm.schedule}
                onChange={(schedule) => setTemplateForm((form) => ({ ...form, schedule }))}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveTemplate()} disabled={busy}>
              {editingTemplate ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(versionTemplate)}
        onOpenChange={(open) => !open && setVersionTemplate(null)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{versionTemplate?.name} versions</DialogTitle>
            <DialogDescription>
              Versions are immutable. Add a new effective period when working hours change.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Effective period</TableHead>
                  <TableHead>Timezone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(versionsQuery.data?.items ?? []).map((version) => (
                  <TableRow key={version.id}>
                    <TableCell>v{version.version_number}</TableCell>
                    <TableCell>
                      {version.local_start_time} to {version.local_end_time}
                      {version.crosses_midnight ? " (+1 day)" : ""}
                    </TableCell>
                    <TableCell>{effectivePeriod(version)}</TableCell>
                    <TableCell>
                      {timezoneLabel(version.timezone_strategy, version.fixed_timezone)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">Schedule a new version</h3>
            <ScheduleFields value={versionForm} onChange={setVersionForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionTemplate(null)}>
              Close
            </Button>
            <Button
              onClick={() => void saveVersion()}
              disabled={createVersion.isPending || versionTemplate?.status !== "active"}
            >
              Add version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentDialog} onOpenChange={setAssignmentDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign shift</DialogTitle>
            <DialogDescription>
              Department assignments apply to its current active employees.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assign to" htmlFor="assignment-type">
              <Select
                value={assignmentForm.target_type}
                onValueChange={(value: "employee" | "department") =>
                  setAssignmentForm((form) => ({
                    ...form,
                    target_type: value,
                    target_id: "",
                  }))
                }
              >
                <SelectTrigger id="assignment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={assignmentForm.target_type === "employee" ? "Employee" : "Department"}>
              <Select
                value={assignmentForm.target_id}
                onValueChange={(value) =>
                  setAssignmentForm((form) => ({ ...form, target_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target" />
                </SelectTrigger>
                <SelectContent>
                  {assignmentForm.target_type === "employee"
                    ? (referencesQuery.data?.employees ?? []).map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name} ({employee.employee_code})
                        </SelectItem>
                      ))
                    : (referencesQuery.data?.departments ?? []).map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name} ({department.employee_count})
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Shift template">
              <Select
                value={assignmentForm.template_id}
                onValueChange={(value) =>
                  setAssignmentForm((form) => ({ ...form, template_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div />
            <Field label="Effective from" htmlFor="assignment-from">
              <Input
                id="assignment-from"
                type="date"
                value={assignmentForm.effective_from}
                onChange={(event) =>
                  setAssignmentForm((form) => ({ ...form, effective_from: event.target.value }))
                }
              />
            </Field>
            <Field label="Effective until" htmlFor="assignment-until">
              <Input
                id="assignment-until"
                type="date"
                min={assignmentForm.effective_from}
                value={assignmentForm.effective_until}
                onChange={(event) =>
                  setAssignmentForm((form) => ({ ...form, effective_until: event.target.value }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignmentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveAssignment()} disabled={createAssignments.isPending}>
              Assign shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleFields({
  value,
  onChange,
}: {
  value: ShiftVersionInput;
  onChange: (value: ShiftVersionInput) => void;
}) {
  const set = <K extends keyof ShiftVersionInput>(key: K, next: ShiftVersionInput[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Start time" htmlFor="schedule-start">
        <Input
          id="schedule-start"
          type="time"
          value={value.local_start_time}
          onChange={(event) => set("local_start_time", event.target.value)}
        />
      </Field>
      <Field label="End time" htmlFor="schedule-end">
        <Input
          id="schedule-end"
          type="time"
          value={value.local_end_time}
          onChange={(event) => set("local_end_time", event.target.value)}
        />
      </Field>
      <Field label="Effective from" htmlFor="schedule-from">
        <Input
          id="schedule-from"
          type="date"
          value={value.effective_from}
          onChange={(event) => set("effective_from", event.target.value)}
        />
      </Field>
      <Field label="Effective until" htmlFor="schedule-until">
        <Input
          id="schedule-until"
          type="date"
          min={value.effective_from}
          value={value.effective_until ?? ""}
          onChange={(event) => set("effective_until", event.target.value || null)}
        />
      </Field>
      <SwitchField
        label="Crosses midnight"
        checked={value.crosses_midnight}
        onCheckedChange={(checked) => set("crosses_midnight", checked)}
      />
      <Field label="Timezone strategy">
        <Select
          value={value.timezone_strategy}
          onValueChange={(strategy: ShiftTimezoneStrategy) => {
            onChange({
              ...value,
              timezone_strategy: strategy,
              fixed_timezone: strategy === "fixed" ? value.fixed_timezone : null,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="company">Company timezone</SelectItem>
            <SelectItem value="employee_with_company_fallback">Employee timezone</SelectItem>
            <SelectItem value="fixed">Fixed timezone</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {value.timezone_strategy === "fixed" ? (
        <Field label="IANA timezone" htmlFor="fixed-timezone">
          <Input
            id="fixed-timezone"
            value={value.fixed_timezone ?? ""}
            onChange={(event) => set("fixed_timezone", event.target.value)}
            placeholder="Asia/Kolkata"
          />
        </Field>
      ) : (
        <div />
      )}
      <div />
      <Field label="Open before (min)" htmlFor="open-before">
        <Input
          id="open-before"
          type="number"
          min={0}
          max={1440}
          value={value.eligibility_open_before_start_minutes}
          onChange={(event) =>
            set("eligibility_open_before_start_minutes", Number(event.target.value))
          }
        />
      </Field>
      <Field label="Close after (min)" htmlFor="close-after">
        <Input
          id="close-after"
          type="number"
          min={0}
          max={1440}
          value={value.eligibility_close_after_end_minutes}
          onChange={(event) =>
            set("eligibility_close_after_end_minutes", Number(event.target.value))
          }
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function SwitchField({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex h-9 items-center justify-between gap-3">
      <Label>{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SectionState({
  loading,
  error,
  empty,
  emptyMessage,
  children,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  if (loading)
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>;
  if (error) {
    return (
      <div className="border border-destructive/40 p-4 text-sm text-destructive">
        Shift data could not be loaded.
      </div>
    );
  }
  if (empty)
    return <div className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  return children;
}

function scheduleLabel(template: ShiftTemplateRecord): string {
  const version = template.latest_version;
  if (!version) return "Not scheduled";
  return `${version.local_start_time} to ${version.local_end_time}${
    version.crosses_midnight ? " (+1 day)" : ""
  }`;
}

function effectivePeriod(
  version: { effective_from: string; effective_until: string | null } | null,
): string {
  if (!version) return "Not scheduled";
  return `${version.effective_from} to ${version.effective_until ?? "ongoing"}`;
}

function timezoneLabel(strategy: ShiftTimezoneStrategy, fixedTimezone: string | null): string {
  if (strategy === "fixed") return fixedTimezone ?? "Fixed";
  if (strategy === "employee_with_company_fallback") return "Employee / company";
  return "Company";
}
