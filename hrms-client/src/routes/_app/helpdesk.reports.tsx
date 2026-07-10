import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHelpdesk } from "@/lib/helpdesk-store";
import { DataCard, StatCard } from "@/components/ui-kit";
import { computeSla, type Ticket, type TicketCategory } from "@/lib/mock/helpdesk";
import { BarChart3, Timer, AlertTriangle, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/helpdesk/reports")({ component: ReportsScreen });

function ReportsScreen() {
  const { tickets } = useHelpdesk();

  const byCategory = useMemo(() => {
    const map = new Map<TicketCategory, { total: number; open: number; breached: number }>();
    for (const t of tickets) {
      const k = t.category;
      const cur = map.get(k) ?? { total: 0, open: 0, breached: 0 };
      cur.total += 1;
      if (!["closed", "resolved"].includes(t.status)) cur.open += 1;
      if (computeSla(t).worst === "breached" && !["closed", "resolved"].includes(t.status))
        cur.breached += 1;
      map.set(k, cur);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [tickets]);

  const byAgent = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        resolved: number;
        avgResolveH: number;
        sumResolveH: number;
        resolvedCount: number;
      }
    >();
    for (const t of tickets) {
      if (!t.assignee) continue;
      const cur = map.get(t.assignee) ?? {
        total: 0,
        resolved: 0,
        avgResolveH: 0,
        sumResolveH: 0,
        resolvedCount: 0,
      };
      cur.total += 1;
      if (t.resolvedAt) {
        cur.resolved += 1;
        cur.sumResolveH +=
          (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
        cur.resolvedCount += 1;
      }
      map.set(t.assignee, cur);
    }
    return Array.from(map.entries())
      .map(([agent, v]) => ({
        agent,
        ...v,
        avgResolveH: v.resolvedCount ? Math.round((v.sumResolveH / v.resolvedCount) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [tickets]);

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tickets) {
      const k = t.raisedByDept ?? "Unknown";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([dept, count]) => ({ dept, count }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tickets) {
      map.set(t.raisedBy, (map.get(t.raisedBy) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [tickets]);

  const totalResolved = tickets.filter((t) => t.resolvedAt);
  const avgResolutionH = totalResolved.length
    ? Math.round(
        (totalResolved.reduce(
          (s, t) =>
            s + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000,
          0,
        ) /
          totalResolved.length) *
          10,
      ) / 10
    : 0;
  const slaBreaches = tickets.filter((t) => computeSla(t).worst === "breached").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="Total tickets" value={tickets.length} icon={BarChart3} tone="primary" />
        <StatCard label="Resolved" value={totalResolved.length} icon={Activity} tone="success" />
        <StatCard label="Avg resolution" value={avgResolutionH + "h"} icon={Timer} tone="info" />
        <StatCard label="SLA breaches" value={slaBreaches} icon={AlertTriangle} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Tickets by category">
          <ul className="space-y-3">
            {byCategory.map((c) => {
              const max = Math.max(1, ...byCategory.map((x) => x.total));
              const pct = (c.total / max) * 100;
              return (
                <li key={c.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{c.key}</span>
                    <span className="text-muted-foreground">
                      {c.total} · {c.open} open · {c.breached} breached
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </DataCard>

        <DataCard title="Agent performance">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium">Agent</th>
                <th className="text-right font-medium">Total</th>
                <th className="text-right font-medium">Resolved</th>
                <th className="text-right font-medium">Avg time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byAgent.map((a) => (
                <tr key={a.agent}>
                  <td className="py-2">{a.agent}</td>
                  <td className="py-2 text-right">{a.total}</td>
                  <td className="py-2 text-right">{a.resolved}</td>
                  <td className="py-2 text-right">{a.avgResolveH}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>

        <DataCard title="Tickets by department">
          <ul className="space-y-3">
            {byDept.map((d) => {
              const max = Math.max(1, ...byDept.map((x) => x.count));
              return (
                <li key={d.dept} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{d.dept}</span>
                    <span className="text-muted-foreground">{d.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-info"
                      style={{ width: `${(d.count / max) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </DataCard>

        <DataCard title="Top requesters">
          <ul className="divide-y">
            {byEmployee.map((e) => (
              <li key={e.name} className="flex items-center justify-between py-2 text-sm">
                <span>{e.name}</span>
                <span className="text-muted-foreground">{e.count} tickets</span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </div>
  );
}
