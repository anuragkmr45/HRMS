import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useHelpdesk } from "@/lib/helpdesk-store";
import { DataCard, DrawerForm, ActionButton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Settings2, Trash2 } from "lucide-react";
import type { CategoryConfig, SubCategory, TicketCategory } from "@/lib/mock/helpdesk";
import { toast } from "sonner";
import { SLA_MATRIX } from "@/lib/mock/helpdesk";
import { toastApiError } from "@/shared/api";

export const Route = createFileRoute("/_app/helpdesk/categories")({ component: CategoriesScreen });

function CategoriesScreen() {
  const { categories, upsertCategory, toggleCategory } = useHelpdesk();
  const [editing, setEditing] = useState<CategoryConfig | null>(null);
  const runAction = (work: () => void | Promise<void>, success: string) => {
    void Promise.resolve()
      .then(work)
      .then(() => toast.success(success))
      .catch((error) => toastApiError(error, "Category update failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Category configuration</h2>
          <p className="text-sm text-muted-foreground">
            Routes, default assignees and SLA references for ticket categories.
          </p>
        </div>
        <ActionButton
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            setEditing({
              key: "" as TicketCategory,
              label: "",
              defaultAssignee: "",
              defaultAssigneeRole: "",
              team: "",
              active: true,
              subCategories: [],
            })
          }
        >
          Add category
        </ActionButton>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {categories.map((c) => (
          <DataCard
            key={c.key}
            title={c.label}
            description={`${c.team} · default assignee ${c.defaultAssignee || "Unassigned"}`}
            actions={
              <div className="flex items-center gap-2">
                <Switch
                  checked={c.active}
                  onCheckedChange={(v) => {
                    runAction(
                      () => toggleCategory(c.key, v),
                      v ? "Category enabled" : "Category disabled",
                    );
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {c.subCategories.map((s) => (
                  <span
                    key={s.key}
                    className="inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 text-[11px] font-medium"
                  >
                    {s.label}
                  </span>
                ))}
                {c.subCategories.length === 0 && (
                  <span className="text-xs text-muted-foreground">No sub-categories yet.</span>
                )}
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-[11px] text-muted-foreground">
                <p className="font-medium text-foreground">SLA reference</p>
                <p>
                  Urgent {SLA_MATRIX.Urgent.responseHours}h / {SLA_MATRIX.Urgent.resolutionHours}h ·
                  High {SLA_MATRIX.High.responseHours}h / {SLA_MATRIX.High.resolutionHours}h ·
                  Medium {SLA_MATRIX.Medium.responseHours}h / {SLA_MATRIX.Medium.resolutionHours}h ·
                  Low {SLA_MATRIX.Low.responseHours}h / {SLA_MATRIX.Low.resolutionHours}h
                </p>
              </div>
            </div>
          </DataCard>
        ))}
      </div>

      {editing && (
        <CategoryEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            runAction(() => upsertCategory(c), "Category saved");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: CategoryConfig;
  onClose: () => void;
  onSave: (c: CategoryConfig) => void;
}) {
  const [c, setC] = useState<CategoryConfig>(initial);
  const [newSub, setNewSub] = useState("");

  const addSub = () => {
    if (!newSub.trim()) return;
    const sub: SubCategory = {
      key: newSub.toLowerCase().replace(/\s+/g, "-"),
      label: newSub.trim(),
    };
    setC({ ...c, subCategories: [...c.subCategories, sub] });
    setNewSub("");
  };
  const removeSub = (k: string) =>
    setC({ ...c, subCategories: c.subCategories.filter((s) => s.key !== k) });

  return (
    <DrawerForm
      open
      onOpenChange={(v) => !v && onClose()}
      title={initial.key ? "Edit category" : "Add category"}
      description="Route tickets to the right team and default assignee."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!c.key || !c.label) return toast.error("Key and label are required");
              onSave(c);
            }}
          >
            Save category
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Key</Label>
            <Input
              value={c.key}
              onChange={(e) => setC({ ...c, key: e.target.value as TicketCategory })}
              placeholder="IT"
              disabled={!!initial.key}
            />
          </div>
          <div className="space-y-2">
            <Label>Display label</Label>
            <Input value={c.label} onChange={(e) => setC({ ...c, label: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Default assignee</Label>
            <Input
              value={c.defaultAssignee}
              onChange={(e) => setC({ ...c, defaultAssignee: e.target.value })}
              placeholder="Linh Tran"
            />
          </div>
          <div className="space-y-2">
            <Label>Assignee role</Label>
            <Input
              value={c.defaultAssigneeRole}
              onChange={(e) => setC({ ...c, defaultAssigneeRole: e.target.value })}
              placeholder="Helpdesk Specialist"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Team</Label>
          <Input value={c.team} onChange={(e) => setC({ ...c, team: e.target.value })} />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted-foreground">
              Inactive categories are hidden from the raise-ticket form.
            </p>
          </div>
          <Switch checked={c.active} onCheckedChange={(v) => setC({ ...c, active: v })} />
        </div>
        <div className="space-y-2">
          <Label>Sub-categories</Label>
          <div className="space-y-2">
            {c.subCategories.map((s) => (
              <div
                key={s.key}
                className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
              >
                <span>
                  {s.label} <span className="text-xs text-muted-foreground">· {s.key}</span>
                </span>
                <Button size="icon" variant="ghost" onClick={() => removeSub(s.key)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              placeholder="VPN / Network"
            />
            <Button variant="outline" onClick={addSub}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </DrawerForm>
  );
}
