import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHelpdesk } from "@/lib/helpdesk-store";
import { DataCard, DataTable, StatCard, type Column } from "@/components/ui-kit";
import { SlaBadge, PriorityBadge } from "@/components/helpdesk/badges";
import {
  computeSla,
  fmtDateTime,
  SLA_MATRIX,
  type Ticket,
  type TicketPriority,
} from "@/lib/mock/helpdesk";
import { Timer, AlertTriangle, ShieldCheck, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/helpdesk/sla")({ component: SlaScreen });

function SlaScreen() {
  const { tickets } = useHelpdesk();
  const navigate = useNavigate();

  const open = useMemo(
    () => tickets.filter((t) => !["closed", "resolved"].includes(t.status)),
    [tickets],
  );

  const onTrack = open.filter((t) => computeSla(t).worst === "on_track").length;
  const nearBreach = open.filter((t) => computeSla(t).worst === "near_breach").length;
  const breached = open.filter((t) => computeSla(t).worst === "breached").length;

  const cols: Column<Ticket>[] = [
    {
      key: "id",
      header: "Ticket",
      render: (t) => (
        <button
          onClick={() => navigate({ to: "/helpdesk/$id", params: { id: t.id } })}
          className="text-left"
        >
          <p className="font-mono text-xs font-semibold text-primary">{t.id}</p>
          <p className="mt-0.5 truncate text-sm font-medium">{t.subject}</p>
        </button>
      ),
    },
    { key: "priority", header: "Priority", render: (t) => <PriorityBadge priority={t.priority} /> },
    {
      key: "category",
      header: "Category",
      render: (t) => <span className="text-sm">{t.category}</span>,
    },
    {
      key: "assignee",
      header: "Assignee",
      render: (t) => <span className="text-sm">{t.assignee ?? "Unassigned"}</span>,
    },
    {
      key: "first",
      header: "First response",
      render: (t) => {
        const sla = computeSla(t);
        return (
          <div className="text-xs">
            <p
              className={
                sla.responseState === "breached"
                  ? "font-medium text-destructive"
                  : "text-foreground"
              }
            >
              {t.firstResponseAt ? "Sent " + fmtDateTime(t.firstResponseAt) : "Pending"}
            </p>
            <p className="text-muted-foreground">Due {fmtDateTime(sla.responseDueAt)}</p>
          </div>
        );
      },
    },
    {
      key: "resolve",
      header: "Resolution",
      render: (t) => {
        const sla = computeSla(t);
        return (
          <div className="text-xs">
            <p className="text-muted-foreground">Due {fmtDateTime(sla.resolutionDueAt)}</p>
          </div>
        );
      },
    },
    { key: "status", header: "SLA", render: (t) => <SlaBadge ticket={t} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="Open tickets" value={open.length} icon={Activity} tone="primary" />
        <StatCard label="On track" value={onTrack} icon={ShieldCheck} tone="success" />
        <StatCard label="Near breach" value={nearBreach} icon={Timer} tone="warning" />
        <StatCard label="Breached" value={breached} icon={AlertTriangle} tone="warning" />
      </div>

      <DataCard title="SLA policy" description="Response and resolution targets by priority">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(SLA_MATRIX) as TicketPriority[]).map((p) => {
            const policy = SLA_MATRIX[p];
            return (
              <div key={p} className="rounded-xl border bg-card p-4">
                <PriorityBadge priority={p} />
                <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Response</p>
                    <p className="text-base font-semibold">{policy.responseHours}h</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Resolution</p>
                    <p className="text-base font-semibold">{policy.resolutionHours}h</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DataCard>

      <DataTable
        columns={cols}
        rows={open}
        searchKeys={["subject", "id", "category", "assignee"] as (keyof Ticket)[]}
        emptyTitle="No open tickets"
        emptyDescription="Nothing to track right now."
      />
    </div>
  );
}
