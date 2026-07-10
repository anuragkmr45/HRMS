import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useAssets, warrantyDaysLeft, fmtMoney } from "@/lib/assets-store";
import { StatCard, DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Boxes,
  PackageCheck,
  Laptop,
  ShieldAlert,
  Inbox,
  Undo2,
  Wrench,
  Ban,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_app/assets/")({ component: AssetsDashboard });

function AssetsDashboard() {
  const { activeRole, user } = useAuth();
  const { assets, requests } = useAssets();

  const totals = useMemo(() => {
    const total = assets.length;
    const assigned = assets.filter((a) => a.status === "assigned").length;
    const available = assets.filter((a) => a.status === "available").length;
    const repair = assets.filter((a) => a.status === "repair").length;
    const retired = assets.filter((a) => a.status === "retired").length;
    const lostDamaged = assets.filter((a) => a.status === "lost" || a.status === "damaged").length;
    const warrantySoon = assets.filter((a) => {
      const d = warrantyDaysLeft(a.warrantyExpiry);
      return d >= 0 && d <= 60;
    }).length;
    const expired = assets.filter((a) => warrantyDaysLeft(a.warrantyExpiry) < 0).length;
    return { total, assigned, available, repair, retired, lostDamaged, warrantySoon, expired };
  }, [assets]);

  const pendingReqs = requests.filter((r) => r.status === "pending");
  const returnPending = requests.filter((r) => r.type === "return" && r.status === "pending");
  const expiringList = assets
    .map((a) => ({ a, d: warrantyDaysLeft(a.warrantyExpiry) }))
    .filter((x) => x.d <= 60)
    .sort((x, y) => x.d - y.d)
    .slice(0, 6);

  // Employee view
  if (activeRole === "employee") {
    const mine = assets.filter((a) => a.assignedTo === user?.name);
    const myReqs = requests.filter((r) => r.raisedBy === user?.name);
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="My assets" value={mine.length} icon={Laptop} tone="primary" />
          <StatCard
            label="Open requests"
            value={myReqs.filter((r) => r.status === "pending").length}
            icon={Inbox}
            tone="warning"
          />
          <StatCard
            label="To acknowledge"
            value={mine.filter((a) => a.history[0] && !a.history[0].acknowledged).length}
            icon={ShieldCheck}
            tone="info"
          />
          <StatCard
            label="Approved requests"
            value={myReqs.filter((r) => r.status === "approved").length}
            icon={PackageCheck}
            tone="success"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DataCard
            title="My assigned assets"
            padded={false}
            actions={
              <Button asChild size="sm" variant="ghost" className="text-primary">
                <Link to="/assets/my">
                  Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          >
            {mine.length === 0 ? (
              <EmptyState icon={Laptop} title="No assets assigned" />
            ) : (
              <ul className="divide-y">
                {mine.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.brand} {a.model}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.id} · {a.serial}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
          <DataCard
            title="My requests"
            padded={false}
            actions={
              <Button asChild size="sm" variant="ghost" className="text-primary">
                <Link to="/assets/requests">
                  Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          >
            {myReqs.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No requests yet"
                description="Raise a new asset request when you need something."
              />
            ) : (
              <ul className="divide-y">
                {myReqs.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.assetType} · {r.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.id} · {r.priority}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </div>
      </div>
    );
  }

  // Admin / IT / HR view
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-4">
        <StatCard
          label="Total assets"
          value={totals.total}
          hint={fmtMoney(assets.reduce((s, a) => s + a.cost, 0)) + " value"}
          icon={Boxes}
          tone="primary"
        />
        <StatCard
          label="Assigned"
          value={totals.assigned}
          hint={`${Math.round((totals.assigned / Math.max(1, totals.total)) * 100)}% utilised`}
          icon={PackageCheck}
          tone="success"
        />
        <StatCard label="Available" value={totals.available} icon={Laptop} tone="info" />
        <StatCard label="Under repair" value={totals.repair} icon={Wrench} tone="warning" />
        <StatCard label="Retired" value={totals.retired} icon={Ban} tone="info" />
        <StatCard
          label="Warranty expiring"
          value={totals.warrantySoon}
          hint="Next 60 days"
          icon={ShieldAlert}
          tone="warning"
        />
        <StatCard label="Asset requests" value={pendingReqs.length} icon={Inbox} tone="primary" />
        <StatCard
          label="Return pending"
          value={returnPending.length}
          hint="From exits / reclaim"
          icon={Undo2}
          tone="warning"
        />
      </div>

      {totals.expired > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span>
            <strong>{totals.expired}</strong> assets are out of warranty — review for AMC renewal or
            retirement.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard
          title="Asset requests"
          description="Awaiting admin action"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/assets/requests">
                View <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {pendingReqs.length === 0 ? (
            <EmptyState icon={Inbox} title="No requests pending" />
          ) : (
            <ul className="divide-y">
              {pendingReqs.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.assetType} · {r.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.id} · {r.raisedBy} · {r.priority}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard
          title="Warranty expiring"
          description="Next 60 days"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/assets/warranty">
                Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {expiringList.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nothing expiring soon" />
          ) : (
            <ul className="divide-y">
              {expiringList.map(({ a, d }) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <Link to="/assets/$id" params={{ id: a.id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.brand} {a.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.id} · {a.assignedTo ?? "Unassigned"}
                    </p>
                  </Link>
                  <span
                    className={`text-xs font-medium ${d < 0 ? "text-destructive" : d <= 14 ? "text-warning-foreground dark:text-warning" : "text-muted-foreground"}`}
                  >
                    {d < 0 ? `${Math.abs(d)}d expired` : `${d}d left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>
    </div>
  );
}
