import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useHelpdesk, HELPDESK_AGENT_ROLES, categoryForRole } from "@/lib/helpdesk-store";
import { StatCard, DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { SlaBadge, PriorityBadge } from "@/components/helpdesk/badges";
import { computeSla, fmtRelative } from "@/lib/mock/helpdesk";
import {
  Ticket as TicketIcon,
  Inbox,
  UserCheck,
  Flame,
  Timer,
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_app/helpdesk/")({ component: HelpdeskDashboard });

function HelpdeskDashboard() {
  const { activeRole, user } = useAuth();
  const { tickets } = useHelpdesk();

  const isAgent = !!activeRole && (HELPDESK_AGENT_ROLES as readonly string[]).includes(activeRole);
  const myCats = categoryForRole(activeRole ?? null);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => !["closed", "resolved"].includes(t.status));
    const assignedToMe = tickets.filter(
      (t) => t.assignee === user?.name && !["closed", "resolved"].includes(t.status),
    );
    const high = open.filter((t) => t.priority === "Urgent" || t.priority === "High");
    const overdue = open.filter((t) => computeSla(t).resolutionState === "breached");
    const breached = open.filter((t) => computeSla(t).worst === "breached");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedToday = tickets.filter((t) => t.resolvedAt && new Date(t.resolvedAt) >= today);
    const reopened = tickets.filter((t) => t.reopenCount > 0);
    return {
      total: tickets.length,
      open: open.length,
      assignedToMe: assignedToMe.length,
      high: high.length,
      overdue: overdue.length,
      breached: breached.length,
      resolvedToday: resolvedToday.length,
      reopened: reopened.length,
    };
  }, [tickets, user]);

  // Employee dashboard
  if (!isAgent) {
    const mine = tickets.filter((t) => t.raisedBy === user?.name);
    const open = mine.filter((t) => !["closed", "resolved"].includes(t.status));
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <StatCard label="My tickets" value={mine.length} icon={TicketIcon} tone="primary" />
          <StatCard label="Open" value={open.length} icon={Inbox} tone="info" />
          <StatCard
            label="Awaiting response"
            value={open.filter((t) => !t.firstResponseAt).length}
            icon={Timer}
            tone="warning"
          />
          <StatCard
            label="Resolved"
            value={mine.filter((t) => t.status === "resolved" || t.status === "closed").length}
            icon={CheckCircle2}
            tone="success"
          />
        </div>
        <DataCard
          title="Recent tickets"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/helpdesk/my">
                View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {mine.length === 0 ? (
            <EmptyState
              icon={TicketIcon}
              title="No tickets yet"
              description="Use Raise ticket to get help from any team."
            />
          ) : (
            <ul className="divide-y">
              {mine.slice(0, 8).map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link to="/helpdesk/$id" params={{ id: t.id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.category} · {fmtRelative(t.createdAt)}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>
    );
  }

  // Agent / admin dashboard
  const myQueue = tickets.filter(
    (t) =>
      (t.assignee === user?.name || (myCats.includes(t.category) && !t.assignee)) &&
      !["closed", "resolved"].includes(t.status),
  );
  const overdueList = tickets
    .filter(
      (t) =>
        !["closed", "resolved"].includes(t.status) && computeSla(t).resolutionState === "breached",
    )
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="Total tickets" value={stats.total} icon={TicketIcon} tone="primary" />
        <StatCard label="Open" value={stats.open} icon={Inbox} tone="info" />
        <StatCard
          label="Assigned to me"
          value={stats.assignedToMe}
          icon={UserCheck}
          tone="primary"
        />
        <StatCard label="High priority" value={stats.high} icon={Flame} tone="warning" />
        <StatCard label="Overdue" value={stats.overdue} icon={Timer} tone="warning" />
        <StatCard label="SLA breached" value={stats.breached} icon={AlertTriangle} tone="warning" />
        <StatCard
          label="Resolved today"
          value={stats.resolvedToday}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard label="Reopened" value={stats.reopened} icon={RefreshCcw} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard
          title="My queue"
          description="Open tickets assigned to you or your team"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/helpdesk/queue">
                Open queue <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {myQueue.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Inbox zero"
              description="No open tickets in your queue."
            />
          ) : (
            <ul className="divide-y">
              {myQueue.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <Link to="/helpdesk/$id" params={{ id: t.id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.category} · {t.raisedBy}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <SlaBadge ticket={t} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard
          title="SLA breached"
          description="Tickets requiring immediate action"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/helpdesk/sla">
                SLA view <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {overdueList.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All on track"
              description="Nothing has breached SLA right now."
            />
          ) : (
            <ul className="divide-y">
              {overdueList.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <Link to="/helpdesk/$id" params={{ id: t.id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.assignee ?? "Unassigned"}
                    </p>
                  </Link>
                  <SlaBadge ticket={t} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>
    </div>
  );
}
