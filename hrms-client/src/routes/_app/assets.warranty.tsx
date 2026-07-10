import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAssets, warrantyDaysLeft, fmtMoney } from "@/lib/assets-store";
import { DataCard, EmptyState, PhoneInput, StatCard } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import { ShieldAlert, ShieldCheck, Wrench, Building2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useApiRouteEnabled } from "@/shared/api";
import {
  useAssetVendorMutation,
  useAssetVendors,
  useAssetWarrantyAlerts,
  type AssetVendorView,
  type AssetWarrantyAlertView,
} from "@/domains/assets";

export const Route = createFileRoute("/_app/assets/warranty")({ component: WarrantyScreen });

function WarrantyScreen() {
  const { assets } = useAssets();
  const apiEnabled = useApiRouteEnabled(["/assets"]);
  const vendorQuery = useAssetVendors({ page_size: 100 }, apiEnabled);
  const warrantyAlertQuery = useAssetWarrantyAlerts({ page_size: 100 }, apiEnabled);
  const vendorMutation = useAssetVendorMutation();
  const [vendorEditor, setVendorEditor] = useState<AssetVendorView | "new" | null>(null);

  const derivedWarrantyAlerts = useMemo<AssetWarrantyAlertView[]>(
    () =>
      assets
        .map((asset) => ({
          assetId: asset.id,
          assetCode: asset.id,
          assetType: asset.type,
          name: `${asset.brand} ${asset.model}`.trim(),
          brand: asset.brand,
          model: asset.model,
          vendor: asset.vendor,
          warrantyExpiry: asset.warrantyExpiry,
          daysLeft: warrantyDaysLeft(asset.warrantyExpiry),
          severity: (warrantyDaysLeft(asset.warrantyExpiry) < 0
            ? "expired"
            : warrantyDaysLeft(asset.warrantyExpiry) <= 14
              ? "critical"
              : "warning") as AssetWarrantyAlertView["severity"],
          assignedTo: asset.assignedTo ?? "",
        }))
        .filter((alert) => alert.daysLeft <= 60)
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [assets],
  );
  const warrantyAlerts =
    apiEnabled && warrantyAlertQuery.data ? warrantyAlertQuery.data.items : derivedWarrantyAlerts;
  const alertWindowDays = apiEnabled ? (warrantyAlertQuery.data?.alert_window_days ?? 60) : 60;
  const alertsLoading = apiEnabled && warrantyAlertQuery.isLoading && !warrantyAlertQuery.data;
  const alertsError =
    apiEnabled && warrantyAlertQuery.error instanceof Error ? warrantyAlertQuery.error : null;
  const expired = warrantyAlerts.filter((x) => x.daysLeft < 0);
  const soon = warrantyAlerts.filter((x) => x.daysLeft >= 0);

  const maintenance = useMemo(
    () =>
      assets
        .flatMap((a) => a.maintenance.map((m) => ({ a, m })))
        .sort((x, y) => y.m.date.localeCompare(x.m.date)),
    [assets],
  );

  const derivedVendors = useMemo<AssetVendorView[]>(() => {
    const map = new Map<string, { name: string; assets: number; warranties: number }>();
    assets.forEach((a) => {
      const cur = map.get(a.vendor) ?? { name: a.vendor, assets: 0, warranties: 0 };
      cur.assets += 1;
      if (warrantyDaysLeft(a.warrantyExpiry) >= 0) cur.warranties += 1;
      map.set(a.vendor, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.assets - a.assets)
      .map((vendor) => ({
        id: vendor.name,
        name: vendor.name,
        status: "active",
        contactEmail: "",
        phone: "",
        assets: vendor.assets,
        warranties: vendor.warranties,
        version: 1,
      }));
  }, [assets]);
  const vendors = apiEnabled && vendorQuery.data ? vendorQuery.data.items : derivedVendors;
  const vendorLoading = apiEnabled && vendorQuery.isLoading && !vendorQuery.data;
  const vendorError = apiEnabled && vendorQuery.error instanceof Error ? vendorQuery.error : null;

  const saveVendor = async (input: {
    id?: string;
    name: string;
    contact_email?: string | null;
    phone?: string | null;
    status: "active" | "inactive";
    expected_version?: number;
  }) => {
    if (!apiEnabled) {
      toast.success("Vendor saved locally for this demo session");
      setVendorEditor(null);
      return;
    }
    await vendorMutation.mutateAsync({
      id: input.id,
      input: {
        name: input.name,
        contact_email: input.contact_email || null,
        phone: input.phone || null,
        status: input.status,
        expected_version: input.expected_version,
      },
    });
    toast.success(input.id ? "Vendor updated" : "Vendor created");
    setVendorEditor(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label={`Expiring (${alertWindowDays}d)`}
          value={soon.length}
          icon={ShieldAlert}
          tone="warning"
        />
        <StatCard label="Expired" value={expired.length} icon={AlertTriangle} tone="destructive" />
        <StatCard
          label="Active warranties"
          value={assets.length - expired.length}
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label="Maintenance logs"
          value={maintenance.length}
          hint={fmtMoney(maintenance.reduce((s, x) => s + (x.m.cost ?? 0), 0))}
          icon={Wrench}
          tone="info"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Warranty expiring" description="Action recommended" padded={false}>
          {alertsLoading ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              Loading warranty alerts...
            </div>
          ) : alertsError ? (
            <div className="px-5 py-8 text-sm text-destructive">{alertsError.message}</div>
          ) : warrantyAlerts.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="All warranties healthy" />
          ) : (
            <ul className="divide-y">
              {warrantyAlerts.map((alert) => (
                <li
                  key={alert.assetId}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <Link to="/assets/$id" params={{ id: alert.assetId }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {alert.brand || alert.assetType} {alert.model || alert.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {alert.assetCode} · {alert.vendor} · {alert.warrantyExpiry}
                    </p>
                  </Link>
                  <span
                    className={`text-xs font-medium ${alert.daysLeft < 0 ? "text-destructive" : alert.daysLeft <= 14 ? "text-warning-foreground dark:text-warning" : "text-muted-foreground"}`}
                  >
                    {alert.daysLeft < 0
                      ? `${Math.abs(alert.daysLeft)}d expired`
                      : `${alert.daysLeft}d left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard
          title="Maintenance history"
          description="Recent service logs across the fleet"
          padded={false}
        >
          {maintenance.length === 0 ? (
            <EmptyState icon={Wrench} title="No maintenance recorded yet" />
          ) : (
            <ul className="divide-y">
              {maintenance.slice(0, 10).map(({ a, m }) => (
                <li key={a.id + m.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/assets/$id"
                      params={{ id: a.id }}
                      className="text-sm font-medium hover:underline"
                    >
                      {a.brand} {a.model}
                    </Link>
                    <span className="text-xs text-muted-foreground">{m.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.id} · <span className="capitalize">{m.type}</span>
                    {m.vendor ? ` · ${m.vendor}` : ""}
                    {m.cost ? ` · ${fmtMoney(m.cost)}` : ""}
                  </p>
                  {m.notes && <p className="mt-1 text-xs text-muted-foreground">{m.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <DataCard
        title="Vendors"
        description="Suppliers and AMC partners"
        padded={false}
        actions={
          <Button size="sm" onClick={() => setVendorEditor("new")}>
            Add vendor
          </Button>
        }
      >
        {vendorLoading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">Loading vendors...</div>
        ) : vendorError ? (
          <div className="px-5 py-8 text-sm text-destructive">{vendorError.message}</div>
        ) : vendors.length === 0 ? (
          <EmptyState icon={Building2} title="No vendors" />
        ) : (
          <ul className="divide-y">
            {vendors.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {apiEnabled
                      ? `${v.status} · ${v.contactEmail || v.phone || "No contact saved"}`
                      : `${v.assets} assets · ${v.warranties} active warranties`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-primary"
                  onClick={() => setVendorEditor(v)}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DataCard>
      <VendorDialog
        open={Boolean(vendorEditor)}
        vendor={vendorEditor === "new" ? null : vendorEditor}
        saving={vendorMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setVendorEditor(null);
        }}
        onSave={saveVendor}
      />
    </div>
  );
}

function VendorDialog({
  open,
  vendor,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  vendor: AssetVendorView | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    id?: string;
    name: string;
    contact_email?: string | null;
    phone?: string | null;
    status: "active" | "inactive";
    expected_version?: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [email, setEmail] = useState(vendor?.contactEmail ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(vendor?.status ?? "active");

  useEffect(() => {
    setName(vendor?.name ?? "");
    setEmail(vendor?.contactEmail ?? "");
    setPhone(vendor?.phone ?? "");
    setStatus(vendor?.status ?? "active");
  }, [vendor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? "Vendor details" : "Add vendor"}</DialogTitle>
          <DialogDescription>
            Vendor records support warranty and maintenance workflows.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Vendor name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Contact email</Label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vendor-phone">Phone</Label>
              <PhoneInput id="vendor-phone" value={phone} onChange={setPhone} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={() => {
              void onSave({
                id: vendor?.id,
                name: name.trim(),
                contact_email: email.trim() || null,
                phone: phone.trim() || null,
                status,
                expected_version: vendor?.version,
              }).catch((error: Error) => toast.error(error.message));
            }}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
