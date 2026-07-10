import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAssets, warrantyDaysLeft, fmtMoney } from "@/lib/assets-store";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { documentsApi } from "@/domains/documents";
import { useCreateReportExportMutation } from "@/domains/reports";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Download } from "lucide-react";
import type { Asset, AssetStatus } from "@/lib/mock/assets";
import { AssetFormDrawer } from "@/components/assets/asset-form-drawer";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/assets/inventory")({ component: Inventory });

function Inventory() {
  const { assets, loading, error, isApiBacked } = useAssets();
  const exportMutation = useCreateReportExportMutation();
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<AssetStatus | "all">("all");
  const [assignedFilter, setAssignedFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [warrantyF, setWarrantyF] = useState<"all" | "active" | "expiring" | "expired">("all");
  const [open, setOpen] = useState(false);

  const types = useMemo(() => Array.from(new Set(assets.map((a) => a.type))).sort(), [assets]);

  const rows = useMemo(
    () =>
      assets.filter((a) => {
        if (type !== "all" && a.type !== type) return false;
        if (status !== "all" && a.status !== status) return false;
        if (assignedFilter === "assigned" && !a.assignedTo) return false;
        if (assignedFilter === "unassigned" && a.assignedTo) return false;
        const d = warrantyDaysLeft(a.warrantyExpiry);
        if (warrantyF === "active" && d <= 60) return false;
        if (warrantyF === "expiring" && (d < 0 || d > 60)) return false;
        if (warrantyF === "expired" && d >= 0) return false;
        return true;
      }),
    [assets, type, status, assignedFilter, warrantyF],
  );

  const columns: Column<Asset>[] = [
    {
      key: "id",
      header: "Asset ID",
      render: (a) => (
        <Link
          to="/assets/$id"
          params={{ id: a.id }}
          className="font-medium text-primary hover:underline"
        >
          {a.id}
        </Link>
      ),
    },
    { key: "type", header: "Type", render: (a) => <span className="text-sm">{a.type}</span> },
    {
      key: "model",
      header: "Brand · Model",
      render: (a) => (
        <div>
          <p className="text-sm font-medium">
            {a.brand} {a.model}
          </p>
          <p className="text-xs text-muted-foreground">{a.serial}</p>
        </div>
      ),
    },
    {
      key: "warranty",
      header: "Warranty",
      render: (a) => {
        const d = warrantyDaysLeft(a.warrantyExpiry);
        return (
          <span
            className={`text-xs font-medium ${d < 0 ? "text-destructive" : d <= 60 ? "text-warning-foreground dark:text-warning" : "text-muted-foreground"}`}
          >
            {d < 0 ? `Expired ${Math.abs(d)}d ago` : `${d}d left`}
          </span>
        );
      },
    },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
    {
      key: "assignedTo",
      header: "Assigned To",
      render: (a) => <span className="text-sm">{a.assignedTo ?? "—"}</span>,
    },
    {
      key: "location",
      header: "Location",
      render: (a) => <span className="text-sm text-muted-foreground">{a.location}</span>,
    },
    {
      key: "condition",
      header: "Condition",
      render: (a) => (
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {a.condition}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      render: (a) => <span className="text-sm font-medium">{fmtMoney(a.cost)}</span>,
    },
  ];

  const exportCsv = async () => {
    const headers = [
      "ID",
      "Type",
      "Brand",
      "Model",
      "Serial",
      "Status",
      "Assigned To",
      "Location",
      "Warranty",
      "Cost",
    ];
    if (isApiBacked) {
      try {
        const job = await exportMutation.mutateAsync({
          format: "csv",
          report_type: "assets/summary",
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
            description: `Asset export ${jobId} was generated by the backend.`,
          });
        } else {
          toast.success("Export queued", {
            description: `Asset export ${jobId} is waiting for a backend renderer.`,
          });
        }
      } catch (err) {
        toast.error("Export failed", {
          description:
            err instanceof Error ? err.message : "The backend could not generate the asset export.",
        });
      }
      return;
    }
    const csv = [headers.join(",")]
      .concat(
        rows.map((a) =>
          [
            a.id,
            a.type,
            a.brand,
            a.model,
            a.serial,
            a.status,
            a.assignedTo ?? "",
            a.location,
            a.warrantyExpiry,
            a.cost,
          ].join(","),
        ),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "assets-inventory.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Filter
            label="Type"
            value={type}
            onChange={setType}
            options={[{ v: "all", l: "All types" }, ...types.map((t) => ({ v: t, l: t }))]}
          />
          <Filter
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as AssetStatus | "all")}
            options={[
              { v: "all", l: "All status" },
              "available",
              "assigned",
              "repair",
              "lost",
              "damaged",
              "retired",
            ].map((s) =>
              typeof s === "string"
                ? { v: s, l: s === "all" ? "All status" : s.charAt(0).toUpperCase() + s.slice(1) }
                : s,
            )}
          />
          <Filter
            label="Assigned"
            value={assignedFilter}
            onChange={(v) => setAssignedFilter(v as typeof assignedFilter)}
            options={[
              { v: "all", l: "All" },
              { v: "assigned", l: "Assigned" },
              { v: "unassigned", l: "Unassigned" },
            ]}
          />
          <Filter
            label="Warranty"
            value={warrantyF}
            onChange={(v) => setWarrantyF(v as typeof warrantyF)}
            options={[
              { v: "all", l: "All warranties" },
              { v: "active", l: "Active" },
              { v: "expiring", l: "Expiring (60d)" },
              { v: "expired", l: "Expired" },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={isApiBacked && exportMutation.isPending}
            className="rounded-full"
          >
            <Download className="mr-2 h-4 w-4" />
            {isApiBacked && exportMutation.isPending ? "Exporting..." : "Export"}
          </Button>
          <Button
            onClick={() => setOpen(true)}
            className="rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        </div>
      </div>

      <DataTable<Asset>
        columns={columns}
        rows={rows}
        searchKeys={["id", "brand", "model", "serial", "assignedTo", "location"]}
        emptyTitle="No assets match"
        emptyDescription={
          error
            ? "Asset inventory could not be loaded from the backend."
            : "Adjust the filters or add a new asset."
        }
        loading={loading}
      />

      <AssetFormDrawer open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
