import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DataTable, type Column, ActionButton, Modal } from "@/components/ui-kit";
import {
  useAdminSettings,
  MASTER_LABELS,
  type MasterKey,
  type MasterRow,
} from "@/lib/admin-settings-store";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";
import {
  useCreateDepartmentMasterMutation,
  useCreateDesignationMasterMutation,
  useCreateExtendedMasterDataMutation,
  useDepartmentMasters,
  useDesignationMasters,
  useExtendedMasterData,
  useUpdateDepartmentMasterMutation,
  useUpdateDesignationMasterMutation,
  useUpdateExtendedMasterDataMutation,
} from "@/domains/admin/queries";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const KEYS: MasterKey[] = [
  "departments",
  "designations",
  "employmentTypes",
  "workLocations",
  "shifts",
  "leaveTypes",
  "expenseCategories",
  "assetCategories",
  "helpdeskCategories",
  "projectRoles",
];

interface SearchParams {
  tab?: MasterKey;
}

const toMasterKey = (value: unknown): MasterKey | undefined => {
  return typeof value === "string" && KEYS.includes(value as MasterKey)
    ? (value as MasterKey)
    : undefined;
};

export const Route = createFileRoute("/_app/admin-settings/master-data")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    tab: toMasterKey(s.tab),
  }),
  component: MasterDataScreen,
});

type CoreApiMasterKey = "departments" | "designations";
type ExtendedApiMasterKey = Exclude<MasterKey, CoreApiMasterKey>;
type ApiMasterKey = CoreApiMasterKey | ExtendedApiMasterKey;
type ApiMasterRow = MasterRow & {
  code: string;
  version: number;
  apiKind: ApiMasterKey;
  sortOrder?: number;
};

const EXTENDED_MASTER_KEYS: readonly ExtendedApiMasterKey[] = [
  "employmentTypes",
  "workLocations",
  "shifts",
  "leaveTypes",
  "expenseCategories",
  "assetCategories",
  "helpdeskCategories",
  "projectRoles",
];

const API_MASTER_KEYS: readonly ApiMasterKey[] = [...KEYS];

function MasterDataScreen() {
  const { masters, addMaster, updateMaster, toggleMasterActive, deleteMaster } = useAdminSettings();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const activeKey = search.tab ?? "departments";
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const departmentsQuery = useDepartmentMasters(apiEnabled);
  const designationsQuery = useDesignationMasters(apiEnabled);
  const employmentTypesQuery = useExtendedMasterData("employmentTypes", apiEnabled);
  const workLocationsQuery = useExtendedMasterData("workLocations", apiEnabled);
  const shiftsQuery = useExtendedMasterData("shifts", apiEnabled);
  const leaveTypesQuery = useExtendedMasterData("leaveTypes", apiEnabled);
  const expenseCategoriesQuery = useExtendedMasterData("expenseCategories", apiEnabled);
  const assetCategoriesQuery = useExtendedMasterData("assetCategories", apiEnabled);
  const helpdeskCategoriesQuery = useExtendedMasterData("helpdeskCategories", apiEnabled);
  const projectRolesQuery = useExtendedMasterData("projectRoles", apiEnabled);
  const createDepartment = useCreateDepartmentMasterMutation();
  const updateDepartment = useUpdateDepartmentMasterMutation();
  const createDesignation = useCreateDesignationMasterMutation();
  const updateDesignation = useUpdateDesignationMasterMutation();
  const createExtendedMaster = useCreateExtendedMasterDataMutation();
  const updateExtendedMaster = useUpdateExtendedMasterDataMutation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const departmentRows = useMemo<ApiMasterRow[]>(
    () =>
      (departmentsQuery.data?.items ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.code,
        meta: row.code,
        active: row.active,
        code: row.code,
        version: row.version,
        apiKind: "departments",
      })),
    [departmentsQuery.data?.items],
  );
  const designationRows = useMemo<ApiMasterRow[]>(
    () =>
      (designationsQuery.data?.items ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.code,
        meta: row.level == null ? row.code : `${row.code} · Level ${row.level}`,
        active: row.active,
        code: row.code,
        version: row.version,
        apiKind: "designations",
      })),
    [designationsQuery.data?.items],
  );
  const extendedQueries: Record<ExtendedApiMasterKey, ReturnType<typeof useExtendedMasterData>> = {
    employmentTypes: employmentTypesQuery,
    workLocations: workLocationsQuery,
    shifts: shiftsQuery,
    leaveTypes: leaveTypesQuery,
    expenseCategories: expenseCategoriesQuery,
    assetCategories: assetCategoriesQuery,
    helpdeskCategories: helpdeskCategoriesQuery,
    projectRoles: projectRolesQuery,
  };

  const startAdd = () => {
    if (!canMutate(activeKey)) return;
    setEditing(null);
    setForm({ name: "", description: "" });
    setOpen(true);
  };
  const startEdit = (row: MasterRow) => {
    if (!canMutate(activeKey)) return;
    setEditing(row);
    setForm({ name: row.name, description: row.description ?? "" });
    setOpen(true);
  };

  const setActiveKey = (key: MasterKey) => {
    setOpen(false);
    setEditing(null);
    void navigate({
      to: "/admin-settings/master-data",
      search: { tab: key },
      replace: true,
    });
  };

  const onSave = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    try {
      if (apiEnabled && isApiMasterKey(activeKey)) {
        await saveApiMaster();
      } else if (editing) {
        updateMaster(activeKey, editing.id, { name: form.name, description: form.description });
        toast.success(`${MASTER_LABELS[activeKey].replace(/s$/, "")} updated`);
      } else {
        addMaster(activeKey, form.name, form.description);
        toast.success(`Added to ${MASTER_LABELS[activeKey]}`);
      }
      setOpen(false);
    } catch (error) {
      toastApiError(error, "Master data update failed");
    }
  };

  const columns = (key: MasterKey): Column<MasterRow>[] => [
    {
      key: "id",
      header: "ID",
      render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span>,
    },
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "meta",
      header: "Details",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.meta ?? r.description ?? "—"}</span>
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (r) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={r.active}
            disabled={!canMutate(key)}
            onCheckedChange={() => void toggleActive(key, r)}
          />
          <span className="text-xs">{r.active ? "Active" : "Inactive"}</span>
        </div>
      ),
    },
  ];

  function isApiMasterKey(key: MasterKey): key is ApiMasterKey {
    return API_MASTER_KEYS.includes(key as ApiMasterKey);
  }

  function canMutate(key: MasterKey): boolean {
    return !apiEnabled || isApiMasterKey(key);
  }

  function rowsFor(key: MasterKey): MasterRow[] {
    if (!apiEnabled) return masters[key];
    if (key === "departments") return departmentRows;
    if (key === "designations") return designationRows;
    if (isExtendedApiMasterKey(key)) return extendedRowsFor(key);
    return [];
  }

  function loadingFor(key: MasterKey): boolean {
    if (!apiEnabled) return false;
    if (key === "departments") return departmentsQuery.isLoading;
    if (key === "designations") return designationsQuery.isLoading;
    if (isExtendedApiMasterKey(key)) return extendedQueries[key].isLoading;
    return false;
  }

  function errorFor(key: MasterKey): Error | null {
    if (!apiEnabled) return null;
    if (key === "departments")
      return departmentsQuery.error instanceof Error ? departmentsQuery.error : null;
    if (key === "designations")
      return designationsQuery.error instanceof Error ? designationsQuery.error : null;
    if (isExtendedApiMasterKey(key)) {
      const error = extendedQueries[key].error;
      return error instanceof Error ? error : null;
    }
    return null;
  }

  function isExtendedApiMasterKey(key: MasterKey): key is ExtendedApiMasterKey {
    return EXTENDED_MASTER_KEYS.includes(key as ExtendedApiMasterKey);
  }

  function extendedRowsFor(key: ExtendedApiMasterKey): ApiMasterRow[] {
    return (extendedQueries[key].data?.items ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      meta: row.description ? `${row.code} · ${row.description}` : row.code,
      active: row.active,
      code: row.code,
      version: row.version,
      apiKind: key,
      sortOrder: row.sort_order,
    }));
  }

  async function saveApiMaster() {
    const code = normalizeCode(form.description || form.name);
    if (activeKey === "departments") {
      const current = editing as ApiMasterRow | null;
      if (current) {
        await updateDepartment.mutateAsync({
          id: current.id,
          input: {
            name: form.name,
            code,
            expected_version: current.version,
          },
        });
        toast.success("Department updated");
      } else {
        await createDepartment.mutateAsync({ name: form.name, code });
        toast.success("Department added");
      }
      return;
    }

    if (activeKey === "designations") {
      const current = editing as ApiMasterRow | null;
      if (current) {
        await updateDesignation.mutateAsync({
          id: current.id,
          input: {
            title: form.name,
            code,
            expected_version: current.version,
          },
        });
        toast.success("Designation updated");
      } else {
        await createDesignation.mutateAsync({ title: form.name, code });
        toast.success("Designation added");
      }
      return;
    }

    if (isExtendedApiMasterKey(activeKey)) {
      const current = editing as ApiMasterRow | null;
      const extendedCode = normalizeCode(current?.code || form.name);
      const description = form.description.trim() || null;
      if (current) {
        await updateExtendedMaster.mutateAsync({
          masterKey: activeKey,
          id: current.id,
          input: {
            name: form.name,
            code: extendedCode,
            description,
            expected_version: current.version,
          },
        });
        toast.success(`${MASTER_LABELS[activeKey].replace(/s$/, "")} updated`);
      } else {
        await createExtendedMaster.mutateAsync({
          masterKey: activeKey,
          input: { name: form.name, code: extendedCode, description },
        });
        toast.success(`Added to ${MASTER_LABELS[activeKey]}`);
      }
      return;
    }

    const current = editing as ApiMasterRow | null;
    if (current) {
      throw new Error(`Unsupported master data group: ${activeKey}`);
    } else {
      throw new Error(`Unsupported master data group: ${activeKey}`);
    }
  }

  async function toggleActive(key: MasterKey, row: MasterRow) {
    try {
      if (apiEnabled && key === "departments") {
        const apiRow = row as ApiMasterRow;
        await updateDepartment.mutateAsync({
          id: apiRow.id,
          input: {
            status: apiRow.active ? "inactive" : "active",
            expected_version: apiRow.version,
          },
        });
        toast.success(apiRow.active ? "Department deactivated" : "Department activated");
        return;
      }
      if (apiEnabled && key === "designations") {
        const apiRow = row as ApiMasterRow;
        await updateDesignation.mutateAsync({
          id: apiRow.id,
          input: {
            status: apiRow.active ? "inactive" : "active",
            expected_version: apiRow.version,
          },
        });
        toast.success(apiRow.active ? "Designation deactivated" : "Designation activated");
        return;
      }
      if (apiEnabled && isExtendedApiMasterKey(key)) {
        const apiRow = row as ApiMasterRow;
        await updateExtendedMaster.mutateAsync({
          masterKey: key,
          id: apiRow.id,
          input: {
            status: apiRow.active ? "inactive" : "active",
            expected_version: apiRow.version,
          },
        });
        toast.success(
          apiRow.active
            ? `${MASTER_LABELS[key].replace(/s$/, "")} deactivated`
            : `${MASTER_LABELS[key].replace(/s$/, "")} activated`,
        );
        return;
      }
      toggleMasterActive(key, row.id);
    } catch (error) {
      toastApiError(error, "Master data update failed");
    }
  }

  async function deactivateRow(key: MasterKey, row: MasterRow) {
    if (apiEnabled && isApiMasterKey(key)) {
      if (!row.active) return;
      await toggleActive(key, row);
      return;
    }
    deleteMaster(key, row.id);
    toast.success("Deleted");
  }

  return (
    <Tabs value={activeKey} onValueChange={(v) => setActiveKey(v as MasterKey)}>
      <TabsList className="h-auto w-full justify-start">
        {KEYS.map((k) => (
          <TabsTrigger key={k} value={k}>
            {MASTER_LABELS[k]}
          </TabsTrigger>
        ))}
      </TabsList>

      {KEYS.map((k) => (
        <TabsContent key={k} value={k} className="mt-4">
          <Card className="rounded-2xl border-border/60 p-0">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <p className="text-sm font-semibold">{MASTER_LABELS[k]}</p>
                <p className="text-xs text-muted-foreground">
                  {`${rowsFor(k).length} record${rowsFor(k).length === 1 ? "" : "s"}`}
                </p>
                {errorFor(k) && (
                  <p className="mt-1 text-xs text-destructive">{errorFor(k)?.message}</p>
                )}
              </div>
              <ActionButton
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={startAdd}
                disabled={!canMutate(k)}
              >
                Add
              </ActionButton>
            </div>
            <DataTable
              columns={columns(k)}
              rows={rowsFor(k)}
              searchKeys={["name", "id", "meta", "description"]}
              loading={loadingFor(k)}
              rowActions={(row) => [
                { label: "Edit", onClick: () => startEdit(row) },
                {
                  label: row.active ? "Deactivate" : "Activate",
                  onClick: canMutate(k) ? () => void toggleActive(k, row) : undefined,
                },
                ...(!apiEnabled && canMutate(k)
                  ? [
                      {
                        label: "Delete",
                        tone: "destructive" as const,
                        onClick: () => void deactivateRow(k, row),
                      },
                    ]
                  : []),
              ]}
              emptyTitle={`No ${MASTER_LABELS[k].toLowerCase()} yet`}
              emptyDescription={undefined}
            />
          </Card>
        </TabsContent>
      ))}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={
          editing
            ? `Edit ${MASTER_LABELS[activeKey].replace(/s$/, "")}`
            : `Add ${MASTER_LABELS[activeKey].replace(/s$/, "")}`
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onSave}
              style={{ background: "var(--gradient-primary)" }}
              className="text-primary-foreground"
            >
              {editing ? "Save changes" : "Add"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Engineering"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={
                apiEnabled && (activeKey === "departments" || activeKey === "designations")
                  ? "Optional code, e.g. ENG"
                  : "Short description"
              }
            />
          </div>
          {editing && canMutate(activeKey) && (
            <button
              onClick={() => {
                void deactivateRow(activeKey, editing);
                setOpen(false);
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" />{" "}
              {apiEnabled ? "Deactivate this record" : "Delete this record"}
            </button>
          )}
        </div>
      </Modal>
    </Tabs>
  );
}

function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
