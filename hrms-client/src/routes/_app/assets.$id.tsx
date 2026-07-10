import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useEmployees } from "@/lib/employees-store";
import { useAssets, warrantyDaysLeft, fmtMoney, ASSET_ADMIN_ROLES } from "@/lib/assets-store";
import { assetsApi, mapApiAsset } from "@/domains/assets";
import { isUuid, toastApiError, userFacingErrorMessage, withApiFallback } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { DataCard, StatusBadge } from "@/components/ui-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Wrench,
  Undo2,
  FileText,
  Plus,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";
import type { AssetCondition, MaintenanceEntry } from "@/lib/mock/assets";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/assets/$id")({ component: AssetDetail });

function AssetDetail() {
  const { id } = useParams({ from: "/_app/assets/$id" });
  const { activeRole } = useAuth();
  const {
    assets,
    assignAsset,
    returnAsset,
    setStatus,
    addMaintenance,
    loading,
    error,
    isApiBacked,
  } = useAssets();
  const { employees } = useEmployees();
  const listAsset = assets.find((a) => a.id === id);
  const detailQuery = useQuery({
    queryKey: queryKeys.detail("assets", "asset", id),
    queryFn: () =>
      withApiFallback(
        async () => mapApiAsset(await assetsApi.get(id), listAsset),
        () => listAsset as NonNullable<typeof listAsset>,
      ),
    enabled: isUuid(id),
    staleTime: queryTimings.detailStaleMs,
  });
  const asset = detailQuery.data ?? listAsset;
  const isAdmin = !!activeRole && (ASSET_ADMIN_ROLES as readonly string[]).includes(activeRole);

  if (!asset) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <h2 className="text-lg font-semibold">
          {loading || detailQuery.isLoading ? "Loading asset" : "Asset not found"}
        </h2>
        {(error || detailQuery.error) && (
          <p className="mt-3 text-sm text-destructive">
            {userFacingErrorMessage(
              error ?? detailQuery.error,
              "Asset data could not be loaded from the backend.",
            )}
          </p>
        )}
        <Button asChild className="mt-4">
          <Link to="/assets/inventory">Back to inventory</Link>
        </Button>
      </div>
    );
  }

  const days = warrantyDaysLeft(asset.warrantyExpiry);
  const expired = days < 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/assets/inventory">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Inventory
            </Link>
          </Button>
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold tracking-tight">
              {asset.brand} {asset.model}
            </h2>
            <p className="break-words text-xs text-muted-foreground">
              {asset.id} · {asset.serial} · {asset.type}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <StatusBadge status={asset.status} />
          {isAdmin && asset.status !== "assigned" && (
            <AssignDialog
              employees={employees.map((e) => ({ id: e.apiId ?? e.id, name: e.name }))}
              onAssign={(emp, eid, on, ret, cond, rem) => {
                void assignAsset(asset.id, emp, eid, on, ret, cond, rem)
                  .then(() => toast.success(`Assigned to ${emp}`))
                  .catch((error) => toastApiError(error, "Asset could not be assigned."));
              }}
            />
          )}
          {isAdmin && asset.status === "assigned" && (
            <ReturnDialog
              onReturn={(d, c, r) => {
                void returnAsset(asset.id, d, c, r)
                  .then(() => toast.success("Asset returned to inventory"))
                  .catch((error) => toastApiError(error, "Asset could not be returned."));
              }}
            />
          )}
          {isAdmin && asset.status !== "repair" && asset.status !== "retired" && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (isApiBacked) {
                  toast.error("Create a maintenance record to move this asset into repair.");
                  return;
                }
                setStatus(asset.id, "repair", "Marco Rossi", "Sent for service");
                toast.success("Marked as in repair");
              }}
            >
              <Wrench className="mr-1.5 h-4 w-4" />
              Send to repair
            </Button>
          )}
        </div>
      </div>

      {expired && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Warranty expired {Math.abs(days)} days ago.
        </div>
      )}

      <Tabs defaultValue="overview" className="min-w-0">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Assignment History</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <DataCard title="Asset details" className="lg:col-span-2">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 md:grid-cols-3">
                <Info k="Type" v={asset.type} />
                <Info k="Category" v={asset.category} />
                <Info k="Brand" v={asset.brand} />
                <Info k="Model" v={asset.model} />
                <Info k="Serial" v={asset.serial} />
                <Info k="Vendor" v={asset.vendor} />
                <Info k="Invoice #" v={asset.invoiceNumber} />
                <Info k="Purchased" v={asset.purchaseDate} />
                <Info
                  k="Warranty"
                  v={`${asset.warrantyExpiry} (${days < 0 ? "expired" : days + "d left"})`}
                />
                <Info k="Cost" v={fmtMoney(asset.cost)} />
                <Info k="Location" v={asset.location} />
                <Info k="Condition" v={<span className="uppercase">{asset.condition}</span>} />
              </dl>
            </DataCard>
            <DataCard title="Current assignment">
              {asset.assignedTo ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{asset.assignedTo}</p>
                  <p className="text-xs text-muted-foreground">Assigned on {asset.assignedOn}</p>
                  {asset.expectedReturn && (
                    <p className="text-xs text-muted-foreground">
                      Expected return: {asset.expectedReturn}
                    </p>
                  )}
                  <div className="pt-1">
                    <StatusBadge
                      status={asset.history[0]?.acknowledged ? "confirmed" : "pending"}
                      label={
                        asset.history[0]?.acknowledged ? "Acknowledged" : "Pending acknowledgement"
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not currently assigned. Available in <strong>{asset.location}</strong>.
                </p>
              )}
            </DataCard>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <DataCard title="Assignment history" padded={false}>
            {asset.history.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No assignment history yet.
              </p>
            ) : (
              <ul className="divide-y">
                {asset.history.map((h) => (
                  <li
                    key={h.id}
                    className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-5 md:items-center"
                  >
                    <div>
                      <p className="text-sm font-medium">{h.employee}</p>
                      <p className="text-xs text-muted-foreground">{h.employeeId}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Assigned</p>
                      <p className="text-sm">{h.assignedOn}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Returned</p>
                      <p className="text-sm">{h.returnedOn ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Condition</p>
                      <p className="text-sm uppercase">
                        {h.conditionAtHandover}
                        {h.conditionAtReturn ? ` → ${h.conditionAtReturn}` : ""}
                      </p>
                    </div>
                    <div className="md:text-right">
                      <StatusBadge
                        status={h.acknowledged ? "confirmed" : "pending"}
                        label={h.acknowledged ? "Acknowledged" : "Pending"}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <DataCard
            title="Maintenance & repair log"
            actions={
              isAdmin ? (
                <MaintenanceDialog
                  onAdd={(e) => {
                    void addMaintenance(asset.id, e)
                      .then(() => toast.success("Maintenance logged"))
                      .catch((error) => toastApiError(error, "Maintenance could not be logged."));
                  }}
                />
              ) : undefined
            }
          >
            {asset.maintenance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No maintenance records yet.</p>
            ) : (
              <ul className="space-y-3">
                {asset.maintenance.map((m) => (
                  <li key={m.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {m.type}
                          {m.vendor ? ` · ${m.vendor}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.date}
                          {m.cost ? ` · ${fmtMoney(m.cost)}` : ""}
                        </p>
                      </div>
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {m.notes && <p className="mt-2 text-xs text-muted-foreground">{m.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DataCard title="Documents">
            {asset.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded for this asset.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {asset.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {d.kind}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DataCard title="Audit trail" padded={false}>
            <ul className="divide-y">
              {asset.audit.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{a.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.at).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.actor}
                    {a.remarks ? ` · ${a.remarks}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </DataCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-sm">{v}</dd>
    </div>
  );
}

function AssignDialog({
  employees,
  onAssign,
}: {
  employees: { id: string; name: string }[];
  onAssign: (
    emp: string,
    eid: string,
    on: string,
    ret: string,
    cond: AssetCondition,
    rem: string,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [eid, setEid] = useState(employees[0]?.id ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const [on, setOn] = useState(today);
  const [ret, setRet] = useState("");
  const [cond, setCond] = useState<AssetCondition>("good");
  const [rem, setRem] = useState("");
  const submit = () => {
    const emp = employees.find((e) => e.id === eid);
    if (!emp) return;
    onAssign(emp.name, emp.id, on, ret, cond, rem);
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="rounded-full text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <ClipboardCheck className="mr-1.5 h-4 w-4" />
          Assign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
          <DialogDescription>
            Hand over to an employee with condition & return date.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <Label>Employee</Label>
            <Select value={eid} onValueChange={setEid}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {e.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Assignment date</Label>
            <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Expected return</Label>
            <Input type="date" value={ret} onChange={(e) => setRet(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Condition at handover</Label>
            <Select value={cond} onValueChange={(v) => setCond(v as AssetCondition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["new", "good", "fair", "poor"] as AssetCondition[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Remarks</Label>
            <Textarea rows={2} value={rem} onChange={(e) => setRem(e.target.value)} />
          </div>
          <Card className="sm:col-span-2 rounded-xl border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
            Employee acknowledgement will be requested in their EMS inbox after handover.
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            Confirm assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({
  onReturn,
}: {
  onReturn: (d: string, c: AssetCondition, r: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [d, setD] = useState(today);
  const [c, setC] = useState<AssetCondition>("good");
  const [r, setR] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full">
          <Undo2 className="mr-1.5 h-4 w-4" />
          Mark returned
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return asset</DialogTitle>
          <DialogDescription>Reclaim and set condition at return.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Return date</Label>
            <Input type="date" value={d} onChange={(e) => setD(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Condition</Label>
            <Select value={c} onValueChange={(v) => setC(v as AssetCondition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["new", "good", "fair", "poor"] as AssetCondition[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Recovery remarks</Label>
            <Textarea rows={2} value={r} onChange={(e) => setR(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onReturn(d, c, r);
              setOpen(false);
            }}
            className="rounded-full"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceDialog({ onAdd }: { onAdd: (m: MaintenanceEntry) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MaintenanceEntry["type"]>("service");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState(0);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <Plus className="mr-1 h-4 w-4" />
          Log service
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log maintenance</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as MaintenanceEntry["type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["service", "repair", "inspection", "upgrade"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Vendor</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Cost (USD)</Label>
            <Input
              type="number"
              value={cost || ""}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onAdd({
                id: "m_" + Math.random().toString(36).slice(2, 8),
                date: new Date().toISOString().slice(0, 10),
                type,
                vendor,
                cost,
                notes,
              });
              setOpen(false);
            }}
            className="rounded-full"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
