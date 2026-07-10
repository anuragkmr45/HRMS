import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useExpenses } from "@/lib/expenses-store";
import { STATUS_LABEL, type ExpenseTicket, type ExpenseStatus } from "@/lib/expenses-store";
import { mapApiExpenseTickets } from "@/domains/expenses";
import {
  useExpenseFinanceAnalyticsReport,
  useExpenseFinanceDashboardReport,
  useExpenseManagerQueueReport,
  useExpenseRegisterReport,
} from "@/domains/reports";
import { asRecord, numberValue, pageItems, useApiRouteEnabled } from "@/shared/api";
import { inDateRange } from "@/lib/reports/utils";

export const Route = createFileRoute("/_app/reports/expenses")({ component: ExpenseReports });

function totalOf(t: ExpenseTicket) {
  return (
    t.lineItems.reduce((s, li) => s + li.quantity * li.unitCost + (li.taxAmount ?? 0), 0) ||
    t.estimatedAmount
  );
}

function ExpenseReports() {
  const { tickets } = useExpenses();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const registerQuery = useExpenseRegisterReport(apiMode, { page: 1, page_size: 100 });
  const managerQueueQuery = useExpenseManagerQueueReport(apiMode, { page: 1, page_size: 100 });
  const financeDashboardQuery = useExpenseFinanceDashboardReport(apiMode, {
    page: 1,
    page_size: 100,
  });
  const analyticsQuery = useExpenseFinanceAnalyticsReport(apiMode);

  const registerTickets = useMemo(
    () => (apiMode ? mapApiExpenseTickets(pageItems(registerQuery.data), tickets) : tickets),
    [apiMode, registerQuery.data, tickets],
  );
  const managerQueueTickets = useMemo(
    () =>
      apiMode
        ? mapApiExpenseTickets(pageItems(managerQueueQuery.data), tickets)
        : tickets.filter((t) => t.status === "pending_manager"),
    [apiMode, managerQueueQuery.data, tickets],
  );
  const financeDashboardTickets = useMemo(
    () =>
      apiMode
        ? mapApiExpenseTickets(pageItems(financeDashboardQuery.data), tickets)
        : tickets.filter((t) => t.stage === "finance" || t.status === "finance_hold"),
    [apiMode, financeDashboardQuery.data, tickets],
  );
  const analyticsSummary = asRecord(analyticsQuery.data?.summary);

  const filter = (
    rows: ExpenseTicket[],
    f: { from: string; to: string; department: string; employee: string; status: string },
  ) =>
    rows.filter((t) => {
      if (!inDateRange(t.startDate, f.from, f.to)) return false;
      if (f.department !== "all" && t.department !== f.department) return false;
      if (f.employee !== "all" && t.employee !== f.employee) return false;
      if (f.status !== "all" && t.status !== f.status) return false;
      return true;
    });

  const cols: Column<ExpenseTicket>[] = [
    { key: "id", header: "ID", render: (t) => <span className="font-mono text-xs">{t.id}</span> },
    {
      key: "employee",
      header: "Employee",
      render: (t) => <span className="font-medium">{t.employee}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (t) => <span className="text-sm">{t.department}</span>,
    },
    {
      key: "expenseType",
      header: "Type",
      render: (t) => <span className="text-sm">{t.expenseType.replace("_", " ")}</span>,
    },
    {
      key: "subType",
      header: "Sub-type",
      render: (t) => <span className="text-sm">{t.subType}</span>,
    },
    {
      key: "startDate",
      header: "Date",
      render: (t) => <span className="font-mono text-xs">{t.startDate}</span>,
    },
    {
      key: "estimatedAmount",
      header: "Amount",
      render: (t) => <span className="font-mono">${totalOf(t).toLocaleString()}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusBadge status={t.status} label={STATUS_LABEL[t.status]} />,
    },
  ];

  const statusOptions = (Object.keys(STATUS_LABEL) as ExpenseStatus[]).map((s) => ({
    value: s,
    label: STATUS_LABEL[s],
  }));
  const employeePool = Array.from(new Set(registerTickets.map((t) => t.employee)));

  const aging = useMemo(
    () =>
      registerTickets
        .filter((t) => t.paymentType === "advance" && t.status !== "closed")
        .map((t) => ({
          id: t.id,
          employee: t.employee,
          amount: totalOf(t),
          age: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000),
          status: t.status,
        })),
    [registerTickets],
  );

  const payments = useMemo(
    () =>
      registerTickets
        .filter((t) => t.payment)
        .map((t) => ({
          id: t.id,
          employee: t.employee,
          paidAmount: t.payment!.paidAmount,
          mode: t.payment!.mode,
          paidOn: t.payment!.paidOn,
          ref: t.payment!.reference,
          status: t.status,
        })),
    [registerTickets],
  );

  const apiError =
    registerQuery.error ??
    managerQueueQuery.error ??
    financeDashboardQuery.error ??
    analyticsQuery.error;

  if (
    apiMode &&
    (registerQuery.isLoading ||
      managerQueueQuery.isLoading ||
      financeDashboardQuery.isLoading ||
      analyticsQuery.isLoading)
  ) {
    return <div className="p-6 text-sm text-muted-foreground">Loading expense reports...</div>;
  }

  if (apiMode && apiError instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{apiError.message}</div>;
  }

  return (
    <Tabs defaultValue="register">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="register">Register</TabsTrigger>
        <TabsTrigger value="pending">Pending Approval</TabsTrigger>
        <TabsTrigger value="finance">Finance Pending</TabsTrigger>
        <TabsTrigger value="advance">Advance Aging</TabsTrigger>
        <TabsTrigger value="reim">Reimbursement</TabsTrigger>
        <TabsTrigger value="proj">Project Expense</TabsTrigger>
        <TabsTrigger value="sales">Sales Expense</TabsTrigger>
        <TabsTrigger value="settle">Settlement Pending</TabsTrigger>
        <TabsTrigger value="payreg">Payment Register</TabsTrigger>
      </TabsList>

      <TabsContent value="register" className="mt-4">
        <ReportShell
          title="Expense Register"
          description="Every expense ticket on file."
          facets={{
            showDepartment: true,
            showEmployee: true,
            showStatus: true,
            statusOptions,
            employeePool,
          }}
          summary={[
            {
              label: "Tickets",
              value: numberValue(analyticsSummary.total_tickets, registerTickets.length),
              tone: "info",
            },
            {
              label: "Closed",
              value: numberValue(
                analyticsSummary.closed,
                registerTickets.filter((t) => t.status === "closed").length,
              ),
              tone: "success",
            },
            {
              label: "In progress",
              value: registerTickets.filter(
                (t) => t.status !== "closed" && t.status !== "withdrawn",
              ).length,
              tone: "warning",
            },
          ]}
          build={(f) => filter(registerTickets, f)}
          columns={cols}
          searchKeys={["id", "employee", "department"]}
          exportName="expense-register"
        />
      </TabsContent>

      <TabsContent value="pending" className="mt-4">
        <ReportShell
          title="Pending Approval"
          description="Tickets waiting on manager verification."
          facets={{ showDepartment: true, showEmployee: true, employeePool }}
          build={(f) => filter(managerQueueTickets, f)}
          columns={cols}
          searchKeys={["id", "employee"]}
          exportName="pending-approval"
        />
      </TabsContent>

      <TabsContent value="finance" className="mt-4">
        <ReportShell
          title="Finance Pending"
          description="Tickets sitting in finance verification or hold."
          facets={{ showDepartment: true }}
          build={(f) => filter(financeDashboardTickets, f)}
          columns={cols}
          searchKeys={["id", "employee"]}
          exportName="finance-pending"
        />
      </TabsContent>

      <TabsContent value="advance" className="mt-4">
        <ReportShell
          title="Advance Aging"
          description="Open advances by age."
          build={() => aging}
          columns={[
            {
              key: "id",
              header: "ID",
              render: (r) => <span className="font-mono text-xs">{r.id}</span>,
            },
            {
              key: "employee",
              header: "Employee",
              render: (r) => <span className="font-medium">{r.employee}</span>,
            },
            {
              key: "amount",
              header: "Amount",
              render: (r) => <span className="font-mono">${r.amount.toLocaleString()}</span>,
            },
            {
              key: "age",
              header: "Age (days)",
              render: (r) => (
                <span
                  className={`font-mono ${r.age > 30 ? "text-destructive" : "text-foreground"}`}
                >
                  {r.age}
                </span>
              ),
            },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          searchKeys={["employee"]}
          exportName="advance-aging"
        />
      </TabsContent>

      <TabsContent value="reim" className="mt-4">
        <ReportShell
          title="Reimbursement Payable"
          description="Approved reimbursements awaiting payout."
          build={(f) =>
            filter(
              registerTickets.filter(
                (t) => t.paymentType === "reimbursement" && t.status === "finance_verified",
              ),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="reimbursement-payable"
        />
      </TabsContent>

      <TabsContent value="proj" className="mt-4">
        <ReportShell
          title="Project Expense"
          description="All project-typed expenses."
          facets={{ showDepartment: true }}
          build={(f) =>
            filter(
              registerTickets.filter((t) => t.expenseType === "project"),
              f,
            )
          }
          columns={cols}
          searchKeys={["id", "employee"]}
          exportName="project-expenses"
        />
      </TabsContent>

      <TabsContent value="sales" className="mt-4">
        <ReportShell
          title="Sales / Pre-Sales Expense"
          description="Sales-related expense tickets."
          facets={{ showDepartment: true }}
          build={(f) =>
            filter(
              registerTickets.filter((t) => t.expenseType === "sales_presales"),
              f,
            )
          }
          columns={cols}
          searchKeys={["id", "employee"]}
          exportName="sales-expenses"
        />
      </TabsContent>

      <TabsContent value="settle" className="mt-4">
        <ReportShell
          title="Settlement Pending"
          description="Advances awaiting settlement after payment."
          build={(f) =>
            filter(
              registerTickets.filter(
                (t) => t.stage === "settlement" || t.status === "pending_adjustment",
              ),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="settlement-pending"
        />
      </TabsContent>

      <TabsContent value="payreg" className="mt-4">
        <ReportShell
          title="Payment Register"
          description="Payments released through finance."
          build={() => payments}
          columns={[
            {
              key: "id",
              header: "Ticket",
              render: (r) => <span className="font-mono text-xs">{r.id}</span>,
            },
            {
              key: "employee",
              header: "Employee",
              render: (r) => <span className="font-medium">{r.employee}</span>,
            },
            {
              key: "paidAmount",
              header: "Amount",
              render: (r) => <span className="font-mono">${r.paidAmount.toLocaleString()}</span>,
            },
            {
              key: "mode",
              header: "Mode",
              render: (r) => <span className="text-sm">{r.mode}</span>,
            },
            {
              key: "paidOn",
              header: "Paid on",
              render: (r) => <span className="font-mono text-xs">{r.paidOn}</span>,
            },
            {
              key: "ref",
              header: "Reference",
              render: (r) => <span className="font-mono text-xs">{r.ref}</span>,
            },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          searchKeys={["employee", "ref"]}
          exportName="payment-register"
        />
      </TabsContent>
    </Tabs>
  );
}
