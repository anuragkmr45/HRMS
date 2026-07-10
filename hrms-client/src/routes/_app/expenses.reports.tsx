import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useExpenses, fmtCurrency, ticketTotal } from "@/lib/expenses-store";
import { mapApiExpenseTickets } from "@/domains/expenses";
import { useExpenseFinanceAnalyticsReport, useExpenseRegisterReport } from "@/domains/reports";
import { DataCard, StatCard, EmptyState } from "@/components/ui-kit";
import { asRecord, numberValue, pageItems, useApiRouteEnabled } from "@/shared/api";
import {
  Banknote,
  Receipt,
  Briefcase,
  Megaphone,
  Building2,
  Hourglass,
  Wallet,
  ClipboardList,
} from "lucide-react";

export const Route = createFileRoute("/_app/expenses/reports")({ component: ExpenseReports });

function ageDays(iso?: string) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function ExpenseReports() {
  const { tickets } = useExpenses();
  const apiMode = useApiRouteEnabled(["/expenses", "/reports"]);
  const registerQuery = useExpenseRegisterReport(apiMode, { page: 1, page_size: 100 });
  const analyticsQuery = useExpenseFinanceAnalyticsReport(apiMode);
  const sourceTickets = useMemo(
    () => (apiMode ? mapApiExpenseTickets(pageItems(registerQuery.data), tickets) : tickets),
    [apiMode, registerQuery.data, tickets],
  );
  const analyticsSummary = asRecord(analyticsQuery.data?.summary);

  const advanceAging = useMemo(() => {
    const buckets = [
      { b: "0–7 d", min: 0, max: 7 },
      { b: "8–14 d", min: 8, max: 14 },
      { b: "15–30 d", min: 15, max: 30 },
      { b: "30+ d", min: 31, max: 9999 },
    ];
    return buckets.map((bk) => {
      const set = sourceTickets.filter(
        (t) =>
          t.paymentType === "advance" &&
          ["payment_released", "bills_submitted", "settlement_review"].includes(t.status) &&
          ageDays(t.payment?.paidOn) >= bk.min &&
          ageDays(t.payment?.paidOn) <= bk.max,
      );
      return {
        bucket: bk.b,
        count: set.length,
        total: set.reduce((s, t) => s + ticketTotal(t), 0),
      };
    });
  }, [sourceTickets]);

  const reimbursable = useMemo(
    () =>
      sourceTickets.filter(
        (t) =>
          t.paymentType === "reimbursement" &&
          ["finance_verified", "payment_released"].includes(t.status),
      ),
    [sourceTickets],
  );
  const projectAgg = useMemo(() => {
    const m = new Map<string, number>();
    sourceTickets
      .filter((t) => t.expenseType === "project")
      .forEach((t) =>
        m.set(
          t.project?.projectName ?? "—",
          (m.get(t.project?.projectName ?? "—") ?? 0) + ticketTotal(t),
        ),
      );
    return Array.from(m.entries())
      .map(([k, v]) => ({ name: k, total: v }))
      .sort((a, b) => b.total - a.total);
  }, [sourceTickets]);
  const salesAgg = useMemo(() => {
    const m = new Map<string, number>();
    sourceTickets
      .filter((t) => t.expenseType === "sales_presales")
      .forEach((t) =>
        m.set(t.sales?.client ?? "—", (m.get(t.sales?.client ?? "—") ?? 0) + ticketTotal(t)),
      );
    return Array.from(m.entries())
      .map(([k, v]) => ({ name: k, total: v }))
      .sort((a, b) => b.total - a.total);
  }, [sourceTickets]);
  const deptAgg = useMemo(() => {
    const m = new Map<string, number>();
    sourceTickets.forEach((t) => m.set(t.department, (m.get(t.department) ?? 0) + ticketTotal(t)));
    return Array.from(m.entries())
      .map(([k, v]) => ({ name: k, total: v }))
      .sort((a, b) => b.total - a.total);
  }, [sourceTickets]);
  const pendingApproval = useMemo(
    () =>
      sourceTickets.filter((t) => ["pending_manager", "finance_verification"].includes(t.status)),
    [sourceTickets],
  );
  const paymentRegister = useMemo(() => sourceTickets.filter((t) => t.payment), [sourceTickets]);
  const settlementPending = useMemo(
    () =>
      sourceTickets.filter((t) =>
        ["bills_submitted", "settlement_review", "pending_adjustment"].includes(t.status),
      ),
    [sourceTickets],
  );

  const apiError = registerQuery.error ?? analyticsQuery.error;

  if (apiMode && (registerQuery.isLoading || analyticsQuery.isLoading)) {
    return <div className="p-6 text-sm text-muted-foreground">Loading expense reports...</div>;
  }

  if (apiMode && apiError instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{apiError.message}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Advance outstanding"
          value={fmtCurrency(
            numberValue(
              analyticsSummary.advance_outstanding_amount,
              advanceAging.reduce((s, b) => s + b.total, 0),
            ),
          )}
          icon={Banknote}
          tone="primary"
        />
        <StatCard
          label="Reimbursement payable"
          value={fmtCurrency(reimbursable.reduce((s, t) => s + ticketTotal(t), 0))}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="Pending approval"
          value={pendingApproval.length}
          icon={Hourglass}
          tone="warning"
        />
        <StatCard
          label="Settlement pending"
          value={settlementPending.length}
          icon={ClipboardList}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Advance aging report" description="By payment age" padded={false}>
          <ul className="divide-y">
            {advanceAging.map((b) => (
              <li key={b.bucket} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{b.bucket}</p>
                  <p className="text-xs text-muted-foreground">{b.count} advances</p>
                </div>
                <span className="font-semibold">{fmtCurrency(b.total)}</span>
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard
          title="Reimbursement payable"
          description="Approved but not yet paid"
          padded={false}
        >
          {reimbursable.length === 0 ? (
            <EmptyState icon={Receipt} title="Nothing payable" />
          ) : (
            <ul className="divide-y">
              {reimbursable.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{t.taskTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.employee}
                    </p>
                  </div>
                  <span className="font-semibold">{fmtCurrency(ticketTotal(t))}</span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard
          title="Project expense report"
          padded={false}
          actions={<Briefcase className="h-4 w-4 text-muted-foreground" />}
        >
          <ul className="divide-y">
            {projectAgg.map((p) => (
              <li key={p.name} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium">{p.name}</p>
                <span className="font-semibold">{fmtCurrency(p.total)}</span>
              </li>
            ))}
          </ul>
        </DataCard>
        <DataCard
          title="Sales / Pre-sales report"
          padded={false}
          actions={<Megaphone className="h-4 w-4 text-muted-foreground" />}
        >
          <ul className="divide-y">
            {salesAgg.length === 0 ? (
              <li className="px-5 py-3 text-sm text-muted-foreground">No sales expenses logged.</li>
            ) : (
              salesAgg.map((p) => (
                <li key={p.name} className="flex items-center justify-between px-5 py-3">
                  <p className="text-sm font-medium">{p.name}</p>
                  <span className="font-semibold">{fmtCurrency(p.total)}</span>
                </li>
              ))
            )}
          </ul>
        </DataCard>

        <DataCard
          title="Department expense report"
          padded={false}
          actions={<Building2 className="h-4 w-4 text-muted-foreground" />}
        >
          <ul className="divide-y">
            {deptAgg.map((d) => (
              <li key={d.name} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium">{d.name}</p>
                <span className="font-semibold">{fmtCurrency(d.total)}</span>
              </li>
            ))}
          </ul>
        </DataCard>
        <DataCard title="Payment register" description="All payments released" padded={false}>
          <ul className="divide-y">
            {paymentRegister.length === 0 ? (
              <li className="px-5 py-3 text-sm text-muted-foreground">No payments yet.</li>
            ) : (
              paymentRegister.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {t.id} · {t.employee}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.payment?.mode.replace("_", " ")} · {t.payment?.reference}
                    </p>
                  </div>
                  <span className="font-semibold">{fmtCurrency(t.payment!.paidAmount)}</span>
                </li>
              ))
            )}
          </ul>
        </DataCard>

        <DataCard title="Pending approval report" padded={false} className="lg:col-span-2">
          {pendingApproval.length === 0 ? (
            <EmptyState icon={Hourglass} title="No pending approvals" />
          ) : (
            <ul className="divide-y">
              {pendingApproval.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{t.taskTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.employee} · waiting on{" "}
                      {t.status.includes("manager") ? t.manager : "Finance"}
                    </p>
                  </div>
                  <span className="font-semibold">{fmtCurrency(ticketTotal(t))}</span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Settlement pending report" padded={false} className="lg:col-span-2">
          {settlementPending.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No pending settlements" />
          ) : (
            <ul className="divide-y">
              {settlementPending.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{t.taskTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.employee} · bills{" "}
                      {t.settlement?.billsSubmitted ? "submitted" : "pending"}
                    </p>
                  </div>
                  <span className="font-semibold">{fmtCurrency(ticketTotal(t))}</span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>
    </div>
  );
}
