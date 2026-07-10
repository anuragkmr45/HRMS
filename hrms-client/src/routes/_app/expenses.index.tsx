import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useExpenseDashboardSummary } from "@/domains/expenses";
import { asArray, asRecord, numberValue, text } from "@/shared/api";
import { MANAGER_ROLES, useExpenses, fmtCurrency, ticketTotal } from "@/lib/expenses-store";
import { StatCard, DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Receipt,
  Hourglass,
  BadgeCheck,
  Wallet,
  Hand,
  Ban,
  ClipboardCheck,
  FileWarning,
  Banknote,
} from "lucide-react";

export const Route = createFileRoute("/_app/expenses/")({ component: ExpensesDashboard });

function ExpensesDashboard() {
  const { activeRole, user } = useAuth();
  const { tickets, isApiBacked } = useExpenses();
  const dashboardQuery = useExpenseDashboardSummary({}, isApiBacked);
  const me = user?.name ?? "You";
  const summaryCards = useMemo(
    () =>
      asArray(asRecord(dashboardQuery.data).cards).map((item) => {
        const row = asRecord(item);
        return {
          key: text(row.key),
          value: numberValue(row.value, 0),
          amount: text(row.amount),
        };
      }),
    [dashboardQuery.data],
  );
  const queueCounts = asRecord(asRecord(dashboardQuery.data).queue_counts);
  const summaryValue = (key: string, fallback: number) =>
    summaryCards.find((card) => card.key === key)?.value ?? fallback;
  const summaryAmount = (key: string, fallback: number) => {
    const amount = summaryCards.find((card) => card.key === key)?.amount;
    return amount ? Number(amount) : fallback;
  };

  const mine = useMemo(
    () => tickets.filter((t) => t.employee === me || t.employeeId === "self"),
    [tickets, me],
  );

  if (activeRole === "finance_manager" || activeRole === "main_admin") {
    const verifPending = tickets.filter((t) => t.status === "finance_verification");
    const payPending = tickets.filter((t) => t.status === "finance_verified");
    const settlement = tickets.filter((t) =>
      ["bills_submitted", "settlement_review", "pending_adjustment"].includes(t.status),
    );
    const advanceAging = tickets.filter(
      (t) => t.paymentType === "advance" && t.status === "payment_released",
    );
    const reimbursable = tickets.filter(
      (t) => t.paymentType === "reimbursement" && t.status === "finance_verified",
    );

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Verification pending"
            value={summaryValue("finance_pending", verifPending.length)}
            icon={ClipboardCheck}
            tone="warning"
          />
          <StatCard
            label="Payment pending"
            value={summaryValue("payment_pending", payPending.length)}
            hint={fmtCurrency(
              summaryAmount(
                "payment_pending",
                payPending.reduce((s, t) => s + ticketTotal(t), 0),
              ),
            )}
            icon={Wallet}
            tone="info"
          />
          <StatCard
            label="Settlement pending"
            value={summaryValue("settlement_pending", settlement.length)}
            icon={Hourglass}
            tone="warning"
          />
          <StatCard
            label="Advance aging"
            value={advanceAging.length}
            icon={Banknote}
            tone="primary"
          />
          <StatCard
            label="Reimbursement payable"
            value={reimbursable.length}
            icon={Receipt}
            tone="success"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QueueList
            title="Verification queue"
            rows={verifPending}
            link="/expenses/finance"
            emptyIcon={ClipboardCheck}
          />
          <QueueList
            title="Settlement pending"
            rows={settlement}
            link="/expenses/finance"
            emptyIcon={Hourglass}
          />
        </div>
      </div>
    );
  }

  const canReviewExpenses = Boolean(
    (activeRole && MANAGER_ROLES.includes(activeRole)) ||
    user?.roles.some((role) => MANAGER_ROLES.includes(role)),
  );

  if (canReviewExpenses) {
    const queue = tickets.filter((t) => t.status === "pending_manager");
    const returned = tickets.filter((t) => t.status === "manager_returned");
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <StatCard
            label="Pending verification"
            value={numberValue(queueCounts.manager_pending, queue.length)}
            icon={ClipboardCheck}
            tone="warning"
          />
          <StatCard label="Returned to employee" value={returned.length} icon={Hand} tone="info" />
          <StatCard
            label="Approved this month"
            value={
              tickets.filter((t) =>
                t.approvals.some((a) => a.role === "Manager" && a.status === "approved"),
              ).length
            }
            icon={BadgeCheck}
            tone="success"
          />
        </div>
        <QueueList
          title="Pending manager verification"
          rows={queue}
          link="/expenses/review"
          emptyIcon={ClipboardCheck}
        />
      </div>
    );
  }

  // Employee-facing dashboard (default)
  const submitted = mine.filter((t) => t.status !== "draft");
  const pending = mine.filter((t) =>
    ["pending_manager", "finance_verification"].includes(t.status),
  );
  const approved = mine.filter((t) =>
    [
      "finance_verified",
      "payment_released",
      "bills_submitted",
      "settlement_review",
      "closed",
    ].includes(t.status),
  );
  const paymentPending = mine.filter((t) => t.status === "finance_verified");
  const settlementPending = mine.filter((t) =>
    ["bills_submitted", "settlement_review", "pending_adjustment"].includes(t.status),
  );
  const rejected = mine.filter((t) => ["manager_rejected", "manager_returned"].includes(t.status));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Submitted"
          value={summaryValue("submitted", submitted.length)}
          icon={Receipt}
          tone="primary"
        />
        <StatCard
          label="Pending approval"
          value={summaryValue("pending_approval", pending.length)}
          icon={Hourglass}
          tone="warning"
        />
        <StatCard
          label="Approved"
          value={summaryValue("approved", approved.length)}
          icon={BadgeCheck}
          tone="success"
        />
        <StatCard
          label="Payment pending"
          value={summaryValue("payment_pending", paymentPending.length)}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="Settlement pending"
          value={summaryValue("settlement_pending", settlementPending.length)}
          icon={FileWarning}
          tone="warning"
        />
        <StatCard
          label="Returned / Rejected"
          value={summaryValue("returned_or_rejected", rejected.length)}
          icon={Ban}
          tone="destructive"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QueueList
          title="My recent tickets"
          rows={mine.slice(0, 6)}
          link="/expenses/my"
          emptyIcon={Receipt}
        />
        <QueueList title="Action needed" rows={rejected} link="/expenses/my" emptyIcon={Hand} />
      </div>
    </div>
  );
}

function QueueList({
  title,
  rows,
  link,
  emptyIcon: Icon,
}: {
  title: string;
  rows: ReturnType<typeof useExpenses>["tickets"];
  link: string;
  emptyIcon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <DataCard
      title={title}
      padded={false}
      actions={
        <Button asChild size="sm" variant="ghost" className="text-primary">
          <Link to={link}>
            Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Icon} title="Nothing here" description="You're all caught up." />
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <Link to="/expenses/$id" params={{ id: r.id }} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.taskTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {r.id} · {r.employee} · {fmtCurrency(ticketTotal(r))}
                </p>
              </Link>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </DataCard>
  );
}
