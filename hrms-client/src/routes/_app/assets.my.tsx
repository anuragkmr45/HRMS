import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useAssets, warrantyDaysLeft, fmtMoney } from "@/lib/assets-store";
import { DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Laptop, ShieldCheck, Inbox, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { toastApiError, userFacingErrorMessage } from "@/shared/api";

export const Route = createFileRoute("/_app/assets/my")({ component: MyAssets });

function MyAssets() {
  const { user } = useAuth();
  const { assets, acknowledgeAssignment, loading, error } = useAssets();
  const mine = assets.filter((a) => a.assignedTo === user?.name);

  return (
    <div className="space-y-4">
      {mine.length === 0 ? (
        <DataCard title="My assets">
          <EmptyState
            icon={Laptop}
            title={loading ? "Loading assigned assets" : "Nothing assigned yet"}
            description={
              error
                ? userFacingErrorMessage(
                    error,
                    "Assigned asset data could not be loaded from the backend.",
                  )
                : "When IT hands you a device, it will show up here."
            }
          />
        </DataCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mine.map((a) => {
            const d = warrantyDaysLeft(a.warrantyExpiry);
            const latest = a.history[0];
            const ack = latest?.acknowledged;
            return (
              <Card key={a.id} className="overflow-hidden rounded-2xl border-border/60">
                <div className="flex items-start gap-3 border-b p-4">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {a.brand} {a.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.id} · {a.type} · {a.serial}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 text-sm">
                  <Row k="Assigned on" v={a.assignedOn ?? "—"} />
                  <Row k="Expected return" v={a.expectedReturn ?? "—"} />
                  <Row k="Condition" v={<span className="uppercase">{a.condition}</span>} />
                  <Row k="Cost" v={fmtMoney(a.cost)} />
                  <Row
                    k="Warranty"
                    v={
                      <span
                        className={
                          d < 0
                            ? "text-destructive font-medium"
                            : d <= 60
                              ? "font-medium text-warning-foreground dark:text-warning"
                              : ""
                        }
                      >
                        {d < 0 ? `Expired ${Math.abs(d)}d ago` : `${d}d left`}
                      </span>
                    }
                  />
                  <Row k="Location" v={a.location} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 p-3">
                  {ack ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Acknowledged
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        void acknowledgeAssignment(a.id, user?.name ?? "You")
                          .then(() => toast.success("Receipt acknowledged"))
                          .catch((error) =>
                            toastApiError(error, "Receipt could not be acknowledged."),
                          );
                      }}
                    >
                      Acknowledge receipt
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/assets/$id" params={{ id: a.id }}>
                        Details
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="rounded-full">
                      <Link to="/assets/requests">Raise issue</Link>
                    </Button>
                  </div>
                </div>
                {d < 0 && (
                  <div className="flex items-center gap-2 border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Warranty expired — contact IT for renewal.
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <DataCard
        title="Need something else?"
        description="Raise a request for a new asset, replacement, repair or return."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            className="rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Link to="/assets/requests">
              <Inbox className="mr-1.5 h-4 w-4" />
              Raise asset request
            </Link>
          </Button>
        </div>
      </DataCard>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="mt-0.5">{v}</p>
    </div>
  );
}
