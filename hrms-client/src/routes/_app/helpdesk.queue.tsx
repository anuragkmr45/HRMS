import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useHelpdesk, categoryForRole } from "@/lib/helpdesk-store";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SlaBadge, PriorityBadge } from "@/components/helpdesk/badges";
import { computeSla, fmtRelative, type Ticket } from "@/lib/mock/helpdesk";

export const Route = createFileRoute("/_app/helpdesk/queue")({ component: AgentQueueScreen });

function AgentQueueScreen() {
  const { user, activeRole } = useAuth();
  const { tickets } = useHelpdesk();
  const navigate = useNavigate();

  const myCats = categoryForRole(activeRole ?? null);
  const isAdmin = activeRole === "main_admin";

  const inScope = useMemo(
    () =>
      tickets.filter((t) => isAdmin || myCats.includes(t.category) || t.assignee === user?.name),
    [tickets, isAdmin, myCats, user],
  );

  const groups = useMemo(() => {
    const open = inScope.filter((t) => !["closed", "resolved"].includes(t.status));
    return {
      new: inScope.filter((t) => t.status === "new"),
      mine: open.filter((t) => t.assignee === user?.name),
      unassigned: inScope.filter((t) => !t.assignee && t.status !== "closed"),
      overdue: open.filter((t) => computeSla(t).resolutionState === "breached"),
      escalated: inScope.filter((t) => t.escalated && t.status !== "closed"),
      resolved: inScope.filter((t) => t.status === "resolved"),
      closed: inScope.filter((t) => t.status === "closed"),
    };
  }, [inScope, user]);

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
    {
      key: "requester",
      header: "Requester",
      render: (t) => (
        <div className="text-xs">
          <p className="font-medium text-foreground">{t.raisedBy}</p>
          <p className="text-muted-foreground">{t.raisedByDept ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (t) => <span className="text-sm">{t.category}</span>,
    },
    { key: "priority", header: "Priority", render: (t) => <PriorityBadge priority={t.priority} /> },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    {
      key: "assignee",
      header: "Assignee",
      render: (t) => <span className="text-sm">{t.assignee ?? "Unassigned"}</span>,
    },
    { key: "sla", header: "SLA", render: (t) => <SlaBadge ticket={t} /> },
    {
      key: "age",
      header: "Age",
      render: (t) => (
        <span className="text-xs text-muted-foreground">{fmtRelative(t.createdAt)}</span>
      ),
    },
  ];

  const Table = ({ rows }: { rows: Ticket[] }) => (
    <DataTable
      columns={cols}
      rows={rows}
      searchKeys={["subject", "id", "raisedBy", "category", "assignee"] as (keyof Ticket)[]}
      emptyTitle="No tickets in this view"
      emptyDescription="Try a different tab or wait for new tickets."
      rowActions={(t) => [
        { label: "Open", onClick: () => navigate({ to: "/helpdesk/$id", params: { id: t.id } }) },
      ]}
    />
  );

  return (
    <Tabs defaultValue="mine">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="new">New ({groups.new.length})</TabsTrigger>
        <TabsTrigger value="mine">Assigned to me ({groups.mine.length})</TabsTrigger>
        <TabsTrigger value="unassigned">Unassigned ({groups.unassigned.length})</TabsTrigger>
        <TabsTrigger value="overdue">Overdue ({groups.overdue.length})</TabsTrigger>
        <TabsTrigger value="escalated">Escalated ({groups.escalated.length})</TabsTrigger>
        <TabsTrigger value="resolved">Resolved ({groups.resolved.length})</TabsTrigger>
        <TabsTrigger value="closed">Closed ({groups.closed.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="new" className="mt-4">
        <Table rows={groups.new} />
      </TabsContent>
      <TabsContent value="mine" className="mt-4">
        <Table rows={groups.mine} />
      </TabsContent>
      <TabsContent value="unassigned" className="mt-4">
        <Table rows={groups.unassigned} />
      </TabsContent>
      <TabsContent value="overdue" className="mt-4">
        <Table rows={groups.overdue} />
      </TabsContent>
      <TabsContent value="escalated" className="mt-4">
        <Table rows={groups.escalated} />
      </TabsContent>
      <TabsContent value="resolved" className="mt-4">
        <Table rows={groups.resolved} />
      </TabsContent>
      <TabsContent value="closed" className="mt-4">
        <Table rows={groups.closed} />
      </TabsContent>
    </Tabs>
  );
}
