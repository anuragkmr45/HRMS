import {
  AlertCircle,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  Laptop,
  ListChecks,
  Network,
  Receipt,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataCard, EmptyState, SkeletonStats, StatCard, StatusBadge } from "@/components/ui-kit";
import type { DashboardMetric, DashboardSummary } from "@/domains/dashboard";

interface Props {
  summary?: DashboardSummary;
  loading: boolean;
  error?: Error | null;
}

const CARD_META: Record<
  string,
  {
    icon: typeof Users;
    tone: "primary" | "success" | "warning" | "info" | "destructive";
  }
> = {
  active_employees: { icon: Users, tone: "primary" },
  pending_expense_approvals: { icon: Receipt, tone: "warning" },
  pending_timesheet_approvals: { icon: Timer, tone: "warning" },
  assigned_assets: { icon: Laptop, tone: "success" },
  documents_pending_verification: { icon: FileCheck2, tone: "info" },
  submitted_hours: { icon: ClipboardCheck, tone: "primary" },
};

export function BackendDashboardSummary({ summary, loading, error }: Props) {
  if (loading) {
    return <SkeletonStats count={6} className="md:grid-cols-3 xl:grid-cols-6" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Dashboard data unavailable</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {summary.cards.map((card) => {
          const meta = CARD_META[card.key] ?? { icon: ClipboardCheck, tone: "primary" as const };
          return (
            <StatCard
              key={card.key}
              label={card.label}
              value={formatMetricValue(card)}
              hint={metricHint(card, summary)}
              icon={meta.icon}
              tone={meta.tone}
              className="dashboard-metric-card"
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <DataCard
          title="Headcount by department"
          description="Active employees across your workspace structure"
          className="glass-panel dashboard-glass-card"
          padded={false}
        >
          {summary.workforce.departments.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No active departments"
              description="Departments added during company setup will appear here."
            />
          ) : (
            <ul className="max-h-[28rem] overflow-auto p-2">
              {summary.workforce.departments.map((department) => (
                <DepartmentRow
                  key={department.department_id}
                  department={department}
                  maxHeadcount={Math.max(
                    1,
                    ...summary.workforce.departments.map((item) => item.active_employees),
                  )}
                />
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard
          title="Approval queue"
          description="Work waiting for leadership attention"
          className="glass-panel dashboard-glass-card"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/reports">
                View reports <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          <QueuePanel summary={summary} />
        </DataCard>

        <DataCard
          title="Operations"
          description="System health and setup signals"
          className="glass-panel dashboard-glass-card"
          padded={false}
        >
          <OperationsPanel summary={summary} />
        </DataCard>
      </div>
    </div>
  );
}

function DepartmentRow({
  department,
  maxHeadcount,
}: {
  department: DashboardSummary["workforce"]["departments"][number];
  maxHeadcount: number;
}) {
  const percentage = Math.max(4, Math.round((department.active_employees / maxHeadcount) * 100));
  const isEmpty = department.active_employees === 0;
  return (
    <li className="dashboard-liquid-row rounded-xl px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{department.name}</p>
          <p className="text-xs uppercase text-muted-foreground">{department.department_code}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">{department.active_employees}</p>
          <p className="text-[11px] text-muted-foreground">{isEmpty ? "Unassigned" : "active"}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/70">
        <div
          className="h-full rounded-full bg-primary/70 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%`, opacity: isEmpty ? 0.22 : 1 }}
        />
      </div>
    </li>
  );
}

function QueuePanel({ summary }: { summary: DashboardSummary }) {
  const total =
    summary.approvals.expense_manager_pending +
    summary.approvals.expense_finance_pending +
    summary.approvals.timesheet_pending +
    summary.approvals.leave_pending +
    summary.approvals.wfh_pending +
    summary.approvals.document_verification_pending;
  return (
    <div className="space-y-3 p-3">
      {total === 0 ? (
        <div className="dashboard-liquid-hero rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-success/25 bg-success/10 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">All approval lanes are clear</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                New employee requests, expense reviews, timesheets, leave/WFH and document checks
                will surface here as soon as they need action.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <ul className="space-y-2">
        <QueueRow
          label="Manager expenses"
          value={summary.approvals.expense_manager_pending}
          status="pending"
          to="/expenses/review"
          icon={Receipt}
        />
        <QueueRow
          label="Finance expenses"
          value={summary.approvals.expense_finance_pending}
          status="pending"
          to="/expenses/finance"
          icon={ShieldCheck}
        />
        <QueueRow
          label="Timesheets"
          value={summary.approvals.timesheet_pending}
          status="pending"
          to="/timesheet/approvals"
          icon={Timer}
        />
        <QueueRow
          label="Leave & WFH"
          value={summary.approvals.leave_pending + summary.approvals.wfh_pending}
          status="pending"
          to="/leave-wfh/approvals"
          icon={ListChecks}
        />
        <QueueRow
          label="Documents"
          value={summary.approvals.document_verification_pending}
          status="pending"
          to="/documents"
          icon={FileCheck2}
        />
      </ul>
    </div>
  );
}

function OperationsPanel({ summary }: { summary: DashboardSummary }) {
  const setupNeedsPeople = summary.workforce.active_employees <= 1;
  const syncClear = summary.operations.outbox_pending === 0;
  const notificationsClear = summary.operations.notifications_pending === 0;
  return (
    <div className="space-y-3 p-3">
      <div className="dashboard-liquid-hero rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Network className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {setupNeedsPeople ? "Workspace setup is ready" : "Workspace is operational"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {setupNeedsPeople
                ? "Departments are configured. Add employees to start seeing team capacity, approvals and operations activity."
                : "Live operational signals are being summarized from assets, notifications and integration events."}
            </p>
          </div>
        </div>
        {setupNeedsPeople && (
          <Button asChild size="sm" className="mt-4 h-8 rounded-xl">
            <Link to="/employees">Add first employee</Link>
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        <QueueRow
          label="Total assets"
          value={summary.operations.assets_total}
          icon={Boxes}
          to="/assets"
        />
        <QueueRow
          label="Asset recoveries"
          value={summary.operations.assets_recovery_pending}
          status="pending"
          to="/assets/returns"
          icon={Laptop}
        />
        <SignalRow
          label="Notifications"
          clear={notificationsClear}
          value={summary.operations.notifications_pending}
        />
        <SignalRow label="Sync queue" clear={syncClear} value={summary.operations.outbox_pending} />
      </ul>
    </div>
  );
}

function QueueRow({
  label,
  value,
  status,
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  status?: string;
  icon?: typeof Boxes;
  to?: string;
}) {
  const content = (
    <>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="truncate text-sm font-medium">{label}</span>
    </>
  );

  return (
    <li className="dashboard-liquid-row flex items-center justify-between gap-3 rounded-xl px-3.5 py-3">
      {to ? (
        <Link to={to} className="flex min-w-0 items-center gap-2 hover:text-primary">
          {content}
        </Link>
      ) : (
        <div className="flex min-w-0 items-center gap-2">{content}</div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{value}</span>
        {status && value > 0 ? (
          <StatusBadge status={status} />
        ) : (
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            Clear
          </span>
        )}
      </div>
    </li>
  );
}

function SignalRow({ label, clear, value }: { label: string; clear: boolean; value: number }) {
  return (
    <li className="dashboard-liquid-row flex items-center justify-between gap-3 rounded-xl px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <CheckCircle2 className={clear ? "h-4 w-4 text-success" : "h-4 w-4 text-warning"} />
        <span className="truncate text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{value}</span>
        <span
          className={
            clear
              ? "rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-success"
              : "rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[11px] text-warning"
          }
        >
          {clear ? "Healthy" : "Watch"}
        </span>
      </div>
    </li>
  );
}

function formatMetricValue(metric: DashboardMetric): string {
  if (typeof metric.value === "number") return metric.value.toLocaleString();
  if (metric.unit === "hours") return `${metric.value} h`;
  return metric.value;
}

function metricHint(metric: DashboardMetric, summary: DashboardSummary): string | undefined {
  switch (metric.key) {
    case "active_employees":
      return `${summary.workforce.visible_employees.toLocaleString()} visible`;
    case "pending_expense_approvals":
      return `${summary.approvals.expense_total_pending.toLocaleString()} waiting`;
    case "pending_timesheet_approvals":
      return `${summary.workload.timesheet_submissions_total.toLocaleString()} submissions`;
    case "assigned_assets":
      return `${summary.operations.assets_assigned.toLocaleString()} / ${summary.operations.assets_total.toLocaleString()}`;
    case "documents_pending_verification":
      return "Needs review";
    case "submitted_hours":
      return `${summary.workload.work_segments_total.toLocaleString()} segments`;
    default:
      return undefined;
  }
}
