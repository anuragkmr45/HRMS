import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useAssets, warrantyDaysLeft } from "@/lib/assets-store";
import type { Asset } from "@/lib/mock/assets";
import { inDateRange } from "@/lib/reports/utils";
import { useAssetsReport } from "@/domains/reports/queries";
import { asArray, asRecord, numberValue, text, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/reports/assets")({ component: AssetReports });

function AssetReports() {
  const { assets } = useAssets();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const reportQuery = useAssetsReport(apiMode);
  const report = asRecord(reportQuery.data);
  const sourceAssets = apiMode ? (reportQuery.data?.items ?? []).map(assetFromApi) : assets;

  if (apiMode && reportQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading asset reports...</div>;
  }

  if (apiMode && reportQuery.error instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{reportQuery.error.message}</div>;
  }

  const cols: Column<Asset>[] = [
    {
      key: "id",
      header: "Asset ID",
      render: (a) => <span className="font-mono text-xs">{a.id}</span>,
    },
    { key: "type", header: "Type", render: (a) => <span className="text-sm">{a.type}</span> },
    {
      key: "brand",
      header: "Brand",
      render: (a) => (
        <span className="text-sm">
          {a.brand} {a.model}
        </span>
      ),
    },
    {
      key: "serial",
      header: "Serial",
      render: (a) => <span className="font-mono text-xs">{a.serial}</span>,
    },
    {
      key: "assignedTo",
      header: "Assigned to",
      render: (a) => <span className="text-sm">{a.assignedTo ?? "—"}</span>,
    },
    {
      key: "location",
      header: "Location",
      render: (a) => <span className="text-sm">{a.location}</span>,
    },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
    {
      key: "warrantyExpiry",
      header: "Warranty",
      render: (a) => <span className="font-mono text-xs">{a.warrantyExpiry}</span>,
    },
  ];

  const statusOptions = ["available", "assigned", "repair", "lost", "damaged", "retired"].map(
    (s) => ({ value: s, label: s }),
  );
  const filter = (
    rows: Asset[],
    f: { from: string; to: string; department: string; employee: string; status: string },
  ) =>
    rows.filter((a) => {
      if (!inDateRange(a.purchaseDate, f.from, f.to)) return false;
      if (f.status !== "all" && a.status !== f.status) return false;
      if (f.employee !== "all" && a.assignedTo !== f.employee) return false;
      return true;
    });
  const employeePool = Array.from(
    new Set(sourceAssets.map((a) => a.assignedTo).filter(Boolean) as string[]),
  );

  const maintenance = apiMode
    ? asArray(report.maintenance_rows).map(maintenanceFromApi)
    : sourceAssets.flatMap((a) =>
        a.maintenance.map((m) => ({
          id: a.id + "-" + m.id,
          asset: a.id,
          brand: `${a.brand} ${a.model}`,
          type: m.type,
          date: m.date,
          vendor: m.vendor ?? "—",
          cost: m.cost ?? 0,
          notes: m.notes ?? "",
        })),
      );

  return (
    <Tabs defaultValue="inventory">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="assigned">Assigned</TabsTrigger>
        <TabsTrigger value="recovery">Recovery Pending</TabsTrigger>
        <TabsTrigger value="warranty">Warranty Expiry</TabsTrigger>
        <TabsTrigger value="dam">Damaged / Lost</TabsTrigger>
        <TabsTrigger value="maint">Maintenance</TabsTrigger>
      </TabsList>

      <TabsContent value="inventory" className="mt-4">
        <ReportShell
          title="Asset Inventory"
          description="Every asset across the workspace."
          facets={{ showStatus: true, statusOptions, showEmployee: true, employeePool }}
          summary={[
            { label: "Assets", value: sourceAssets.length, tone: "info" },
            {
              label: "Assigned",
              value: sourceAssets.filter((a) => a.status === "assigned").length,
              tone: "success",
            },
            {
              label: "Available",
              value: sourceAssets.filter((a) => a.status === "available").length,
            },
            {
              label: "In repair",
              value: sourceAssets.filter((a) => a.status === "repair").length,
              tone: "warning",
            },
          ]}
          build={(f) => filter(sourceAssets, f)}
          columns={cols}
          searchKeys={["id", "serial", "brand", "model", "assignedTo"]}
          exportName="asset-inventory"
        />
      </TabsContent>

      <TabsContent value="assigned" className="mt-4">
        <ReportShell
          title="Assigned Assets"
          description="Assets currently held by employees."
          facets={{ showEmployee: true, employeePool }}
          build={(f) =>
            filter(
              sourceAssets.filter((a) => a.status === "assigned"),
              f,
            )
          }
          columns={cols}
          searchKeys={["assignedTo", "id"]}
          exportName="assigned-assets"
        />
      </TabsContent>

      <TabsContent value="recovery" className="mt-4">
        <ReportShell
          title="Asset Recovery Pending"
          description="Assets to be recovered from notice / exited employees."
          build={() =>
            sourceAssets.filter(
              (a) =>
                a.status === "assigned" &&
                a.expectedReturn &&
                a.expectedReturn < new Date().toISOString().slice(0, 10),
            )
          }
          columns={cols}
          searchKeys={["assignedTo"]}
          exportName="asset-recovery"
        />
      </TabsContent>

      <TabsContent value="warranty" className="mt-4">
        <ReportShell
          title="Warranty Expiry"
          description="Assets with warranty expiring or expired."
          summary={[
            {
              label: "Expiring ≤60d",
              value: sourceAssets.filter((a) => {
                const d = warrantyDaysLeft(a.warrantyExpiry);
                return d >= 0 && d <= 60;
              }).length,
              tone: "warning",
            },
            {
              label: "Expired",
              value: sourceAssets.filter((a) => warrantyDaysLeft(a.warrantyExpiry) < 0).length,
              tone: "destructive",
            },
          ]}
          build={() => sourceAssets.filter((a) => warrantyDaysLeft(a.warrantyExpiry) <= 60)}
          columns={[
            ...cols,
            {
              key: "daysLeft",
              header: "Days left",
              render: (a) => {
                const d = warrantyDaysLeft(a.warrantyExpiry);
                return (
                  <span
                    className={`font-mono ${d < 0 ? "text-destructive" : d <= 14 ? "text-warning-foreground dark:text-warning" : "text-foreground"}`}
                  >
                    {d < 0 ? `${Math.abs(d)} expired` : d}
                  </span>
                );
              },
            },
          ]}
          searchKeys={["id", "brand"]}
          exportName="warranty-expiry"
        />
      </TabsContent>

      <TabsContent value="dam" className="mt-4">
        <ReportShell
          title="Damaged / Lost Assets"
          description="Assets marked lost or damaged."
          build={() => sourceAssets.filter((a) => a.status === "lost" || a.status === "damaged")}
          columns={cols}
          searchKeys={["id", "brand"]}
          exportName="damaged-lost-assets"
        />
      </TabsContent>

      <TabsContent value="maint" className="mt-4">
        <ReportShell
          title="Asset Maintenance"
          description="All maintenance and repair history."
          build={() => maintenance}
          columns={[
            {
              key: "asset",
              header: "Asset",
              render: (m) => <span className="font-mono text-xs">{m.asset}</span>,
            },
            {
              key: "brand",
              header: "Item",
              render: (m) => <span className="text-sm">{m.brand}</span>,
            },
            {
              key: "type",
              header: "Type",
              render: (m) => <span className="text-sm">{m.type}</span>,
            },
            {
              key: "date",
              header: "Date",
              render: (m) => <span className="font-mono text-xs">{m.date}</span>,
            },
            {
              key: "vendor",
              header: "Vendor",
              render: (m) => <span className="text-sm">{m.vendor}</span>,
            },
            {
              key: "cost",
              header: "Cost",
              render: (m) => <span className="font-mono">${m.cost.toLocaleString()}</span>,
            },
            {
              key: "notes",
              header: "Notes",
              render: (m) => <span className="text-xs text-muted-foreground">{m.notes}</span>,
            },
          ]}
          searchKeys={["asset", "vendor", "brand"]}
          exportName="asset-maintenance"
        />
      </TabsContent>
    </Tabs>
  );
}

function assetFromApi(value: unknown): Asset {
  const row = asRecord(value);
  return {
    id: text(row.asset_code, text(row.id)),
    type: text(row.type),
    category: "Hardware",
    brand: text(row.brand, text(row.name)),
    model: text(row.model),
    serial: text(row.serial_no),
    purchaseDate: text(row.created_at).slice(0, 10),
    vendor: "",
    invoiceNumber: "",
    warrantyExpiry: text(row.warranty_expiry, "2099-12-31"),
    cost: 0,
    location: text(row.location, "—"),
    condition: "good",
    status: assetStatusFromApi(text(row.status)),
    assignedTo: text(row.assigned_to),
    assignedToId: text(row.assigned_to_user_id),
    history: [],
    maintenance: [],
    documents: [],
    audit: [],
  };
}

function maintenanceFromApi(value: unknown) {
  const row = asRecord(value);
  return {
    id: text(row.id),
    asset: text(row.asset_code, text(row.asset_id)),
    brand: text(row.asset),
    type: text(row.type),
    date: text(row.date),
    vendor: text(row.vendor, "—"),
    cost: numberValue(row.cost),
    notes: text(row.notes),
  };
}

function assetStatusFromApi(status: string): Asset["status"] {
  if (status === "Assigned") return "assigned";
  if (status === "In Stock" || status === "Returned" || status === "Procured") return "available";
  if (status === "In Maintenance" || status === "Return Pending") return "repair";
  if (status === "Lost/Stolen") return "lost";
  if (status === "Retired") return "retired";
  return "available";
}
