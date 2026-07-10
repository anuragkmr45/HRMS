import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useExpenses,
  fmtCurrency,
  ticketTotal,
  lineTotal,
  HIGH_VALUE_THRESHOLD,
  MANAGER_ROLES,
  FINANCE_ROLES,
  type ExpenseTicket,
} from "@/lib/expenses-store";
import {
  expensesApi,
  mapApiExpenseApprovals,
  mapApiExpenseAudit,
  mapApiExpenseTicket,
} from "@/domains/expenses";
import {
  isUuid,
  pageItems,
  toastApiError,
  userFacingErrorMessage,
  withApiFallback,
} from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  DataCard,
  StatusBadge,
  ApprovalTimeline,
  EmptyState,
  type ApprovalStep,
} from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  AlertTriangle,
  Banknote,
  FileText,
  MessageSquare,
  History,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/expenses/$id")({ component: ExpenseDetail });

type Action =
  | null
  | "manager_approve"
  | "manager_return"
  | "manager_reject"
  | "fin_hold"
  | "fin_pay"
  | "fin_settle"
  | "fin_close";

function ExpenseDetail() {
  const { id } = Route.useParams();
  const { byId, managerAction, financeAction, addComment, submitDraft, withdraw, loading, error } =
    useExpenses();
  const { activeRole, user } = useAuth();
  const nav = useNavigate();
  const listTicket = byId(id);
  const detailQuery = useQuery({
    queryKey: queryKeys.detail("expenses", "ticket", id),
    queryFn: () =>
      withApiFallback(
        async () => mapApiExpenseTicket(await expensesApi.get(id), listTicket),
        () => listTicket as ExpenseTicket,
      ),
    enabled: isUuid(id),
    staleTime: queryTimings.detailStaleMs,
  });
  const timelineQuery = useQuery({
    queryKey: queryKeys.list("expenses", "timeline", { id }),
    queryFn: () =>
      withApiFallback(
        () => expensesApi.timeline(id),
        () => [],
      ),
    enabled: isUuid(id),
    staleTime: queryTimings.detailStaleMs,
  });
  const auditQuery = useQuery({
    queryKey: queryKeys.list("expenses", "audit", { id, page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        () => expensesApi.audit(id, { page_size: 100 }),
        () => ({ items: [], page: 1, page_size: 100, total: 0 }),
      ),
    enabled: isUuid(id),
    staleTime: queryTimings.detailStaleMs,
  });
  const baseTicket = detailQuery.data ?? listTicket;
  const t = baseTicket
    ? {
        ...baseTicket,
        approvals: mapApiExpenseApprovals(timelineQuery.data ?? [], baseTicket.approvals),
        audit: mapApiExpenseAudit(
          timelineQuery.data ?? pageItems(auditQuery.data),
          baseTicket.audit,
        ),
      }
    : undefined;
  const [action, setAction] = useState<Action>(null);
  const [remark, setRemark] = useState("");
  const [comment, setComment] = useState("");

  if (!t) {
    return (
      <div className="rounded-2xl border bg-card p-10">
        <EmptyState
          icon={Receipt}
          title={loading || detailQuery.isLoading ? "Loading ticket" : "Ticket not found"}
          description={
            error || detailQuery.error
              ? userFacingErrorMessage(
                  error ?? detailQuery.error,
                  "Expense ticket data could not be loaded from the backend.",
                )
              : "The expense ticket you're looking for doesn't exist."
          }
          action={<Button onClick={() => nav({ to: "/expenses/my" })}>Back to my expenses</Button>}
        />
      </div>
    );
  }

  const total = ticketTotal(t);
  const me = user?.name ?? "You";
  const isRequester = me === t.employee;
  const canReviewExpenses = Boolean(
    (activeRole && MANAGER_ROLES.includes(activeRole)) ||
    user?.roles.some((role) => MANAGER_ROLES.includes(role)),
  );
  const canFinanceExpenses = Boolean(
    (activeRole && FINANCE_ROLES.includes(activeRole)) ||
    user?.roles.some((role) => FINANCE_ROLES.includes(role)),
  );
  const isManager = canReviewExpenses && me !== t.employee;
  const isFinance = canFinanceExpenses && me !== t.employee;
  const isClosed = ["closed", "withdrawn", "manager_rejected"].includes(t.status);
  const highValue = total >= HIGH_VALUE_THRESHOLD;

  const submitAction = async () => {
    if (!action) return;
    const needRemark = ["manager_return", "manager_reject", "fin_hold"].includes(action);
    if (needRemark && !remark.trim()) {
      toast.error("Remarks are required for this action.");
      return;
    }
    try {
      switch (action) {
        case "manager_approve":
          await managerAction(t.id, "approve", me, remark);
          break;
        case "manager_return":
          await managerAction(t.id, "return", me, remark);
          break;
        case "manager_reject":
          await managerAction(t.id, "reject", me, remark);
          break;
        case "fin_hold":
          await financeAction(t.id, "hold", me, { remark });
          break;
      }
      toast.success("Action recorded");
      setAction(null);
      setRemark("");
    } catch (error) {
      toastApiError(error, "Expense action could not be recorded.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/expenses/my" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {highValue && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning-foreground dark:border-warning/30 dark:bg-warning/15 dark:text-warning">
              <AlertTriangle className="h-3.5 w-3.5" /> High-value · {fmtCurrency(total)}
            </span>
          )}
          <StatusBadge status={t.status} />
        </div>
      </div>

      <Card className="rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t.id}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{t.taskTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.taskDescription}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">{t.employee}</strong> · {t.department}
              </span>
              <span>Manager: {t.manager}</span>
              <span>
                {t.startDate} → {t.endDate}
              </span>
              <span>Location: {t.location}</span>
              <span className="capitalize">Payment: {t.paymentType}</span>
              <span className="capitalize">Priority: {t.priority}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{fmtCurrency(total)}</p>
            <p className="text-xs text-muted-foreground">
              Estimated {fmtCurrency(t.estimatedAmount)}
            </p>
          </div>
        </div>
      </Card>

      {!isClosed && (
        <div className="flex flex-wrap gap-2">
          {isManager && t.status === "pending_manager" && (
            <>
              <Button
                onClick={() => {
                  setAction("manager_approve");
                  setRemark("");
                }}
              >
                Verify
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setAction("manager_return");
                  setRemark("");
                }}
              >
                Return with remarks
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setAction("manager_reject");
                  setRemark("");
                }}
              >
                Reject
              </Button>
            </>
          )}
          {isFinance && (
            <>
              {t.status === "finance_verification" && (
                <Button
                  onClick={() => {
                    void financeAction(t.id, "verify", me)
                      .then(() => toast.success("Verified"))
                      .catch((error) => toastApiError(error, "Finance verification failed."));
                  }}
                >
                  Verify
                </Button>
              )}
              {["finance_verification", "finance_verified"].includes(t.status) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAction("fin_hold");
                    setRemark("");
                  }}
                >
                  Put on hold
                </Button>
              )}
              {t.status === "finance_verified" && (
                <Button onClick={() => setAction("fin_pay")}>Release payment</Button>
              )}
              {t.status === "payment_released" && t.paymentType === "advance" && (
                <Button
                  onClick={() => {
                    void financeAction(t.id, "mark_bills", me)
                      .then(() => toast.success("Bills marked received"))
                      .catch((error) =>
                        toastApiError(error, "Bills could not be marked received."),
                      );
                  }}
                >
                  Mark bills received
                </Button>
              )}
              {["bills_submitted", "settlement_review"].includes(t.status) && (
                <Button onClick={() => setAction("fin_settle")}>Review settlement</Button>
              )}
              {(t.status === "settlement_review" ||
                (t.status === "payment_released" && t.paymentType === "reimbursement")) && (
                <Button onClick={() => setAction("fin_close")}>Close ticket</Button>
              )}
            </>
          )}
          {isRequester && t.status === "draft" && (
            <Button
              onClick={() => {
                void submitDraft(t.id, me)
                  .then(() => {
                    toast.success("Draft submitted for manager verification");
                    nav({ to: "/expenses/my" });
                  })
                  .catch((error) => toastApiError(error, "Draft could not be submitted."));
              }}
            >
              Submit draft
            </Button>
          )}
          {isRequester && t.status === "pending_manager" && (
            <Button
              variant="outline"
              onClick={() => {
                void withdraw(t.id, me)
                  .then(() => {
                    toast.success("Ticket withdrawn");
                    nav({ to: "/expenses/my" });
                  })
                  .catch((error) => toastApiError(error, "Ticket could not be withdrawn."));
              }}
            >
              Withdraw ticket
            </Button>
          )}
        </div>
      )}
      {isClosed && (
        <div className="rounded-xl border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          This ticket is read-only ({t.status.replace("_", " ")}).
        </div>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="lineitems">Line items</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="finance">Finance & Settlement</TabsTrigger>
          <TabsTrigger value="timeline">Approval Timeline</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DataCard title="Expense details">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Info k="Type" v={t.expenseType === "project" ? "Project" : "Sales / Pre-Sales"} />
              <Info k="Sub-Type" v={t.subType} />
              <Info k="Submitted" v={t.submittedAt?.slice(0, 10) ?? "—"} />
              <Info k="Stage" v={<span className="capitalize">{t.stage}</span>} />
            </dl>
            {t.remarks && (
              <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs italic text-muted-foreground">
                "{t.remarks}"
              </p>
            )}
          </DataCard>
          <DataCard title={t.expenseType === "project" ? "Project context" : "Sales context"}>
            {t.project && (
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Info k="Project Code" v={t.project.projectCode} />
                <Info k="Project" v={t.project.projectName} />
                <Info k="Project Manager" v={t.project.projectManager} />
                <Info k="Cost Center" v={t.project.costCenter} />
                <Info
                  k="Project Expense Type"
                  v={<span className="capitalize">{t.project.projectExpenseType}</span>}
                />
              </dl>
            )}
            {t.sales && (
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Info k="Client" v={t.sales.client} />
                <Info k="Opportunity" v={t.sales.opportunity} />
                <Info k="Meeting Type" v={t.sales.meetingType} />
                <Info k="Sales Owner" v={t.sales.salesOwner} />
                <Info
                  k="Expected Outcome"
                  v={<span className="text-muted-foreground">{t.sales.expectedOutcome}</span>}
                  className="col-span-2"
                />
              </dl>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="lineitems" className="mt-4">
          <DataCard title="Line items" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs">
                  <tr>
                    <th className="p-3 text-left">Category</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-left">Vendor</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Unit cost</th>
                    <th className="p-3 text-right">Tax</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {t.lineItems.map((li) => (
                    <tr key={li.id} className="border-t">
                      <td className="p-3">{li.category}</td>
                      <td className="p-3 text-muted-foreground">{li.description}</td>
                      <td className="p-3">{li.vendor}</td>
                      <td className="p-3 text-right">{li.quantity}</td>
                      <td className="p-3 text-right">{fmtCurrency(li.unitCost)}</td>
                      <td className="p-3 text-right">{fmtCurrency(li.taxAmount)}</td>
                      <td className="p-3 text-right font-medium">{fmtCurrency(lineTotal(li))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-secondary/30">
                    <td
                      colSpan={6}
                      className="p-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Total
                    </td>
                    <td className="p-3 text-right text-base font-semibold">{fmtCurrency(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </DataCard>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DataCard title="Documents">
            {t.documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents"
                description="No supporting documents attached."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {t.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {d.kind} · {d.uploadedAt.slice(0, 10)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="finance" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DataCard title="Finance & Payment">
            {t.payment ? (
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Info
                  k="Paid amount"
                  v={<span className="font-semibold">{fmtCurrency(t.payment.paidAmount)}</span>}
                />
                <Info
                  k="Mode"
                  v={<span className="capitalize">{t.payment.mode.replace("_", " ")}</span>}
                />
                <Info k="Date" v={t.payment.paidOn} />
                <Info k="Reference" v={<code className="text-xs">{t.payment.reference}</code>} />
                {t.payment.remarks && (
                  <Info k="Remarks" v={t.payment.remarks} className="col-span-2" />
                )}
              </dl>
            ) : (
              <EmptyState
                icon={Banknote}
                title="No payment yet"
                description="Payment information appears once finance releases funds."
              />
            )}
          </DataCard>
          <DataCard title="Settlement">
            {t.settlement ? (
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Info k="Advance" v={fmtCurrency(t.settlement.advanceAmount)} />
                <Info k="Actual spent" v={fmtCurrency(t.settlement.actualSpent)} />
                <Info
                  k="Balance"
                  v={
                    t.settlement.balance === 0 ? (
                      "Settled"
                    ) : t.settlement.balance > 0 ? (
                      <span className="text-destructive">
                        Recoverable: {fmtCurrency(t.settlement.balance)}
                      </span>
                    ) : (
                      <span className="text-success">
                        Payable: {fmtCurrency(Math.abs(t.settlement.balance))}
                      </span>
                    )
                  }
                />
                <Info k="Bills submitted" v={t.settlement.billsSubmitted ? "Yes" : "No"} />
                {t.settlement.remarks && (
                  <Info k="Remarks" v={t.settlement.remarks} className="col-span-2" />
                )}
              </dl>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No settlement yet"
                description="Visible once payment is released."
              />
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <DataCard title="Approval timeline">
            {t.approvals.length === 0 ? (
              <EmptyState
                icon={History}
                title="Not submitted"
                description="Submit the ticket to start the approval flow."
              />
            ) : (
              <ApprovalTimeline
                steps={t.approvals.map<ApprovalStep>((a) => ({
                  approver: a.by,
                  role: `${a.role} · ${a.action}`,
                  status: a.status,
                  remark: a.remark,
                  at: a.at.slice(0, 16).replace("T", " "),
                }))}
              />
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DataCard title="Audit trail" padded={false}>
            <ul className="divide-y">
              {t.audit.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{a.what}</p>
                    <p className="text-xs text-muted-foreground">by {a.by}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.at.slice(0, 16).replace("T", " ")}
                  </p>
                </li>
              ))}
            </ul>
          </DataCard>
        </TabsContent>

        <TabsContent value="comments" className="mt-4">
          <DataCard title="Comments">
            {t.comments.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No comments yet" />
            ) : (
              <ul className="space-y-2">
                {t.comments.map((c, i) => (
                  <li key={i} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{c.by}</span>
                      <span>{c.at.slice(0, 16).replace("T", " ")}</span>
                    </div>
                    <p className="mt-1 text-sm">{c.text}</p>
                  </li>
                ))}
              </ul>
            )}
            {!isClosed && (
              <div className="mt-3 flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment…"
                />
                <Button
                  onClick={() => {
                    if (!comment.trim()) return;
                    void addComment(t.id, me, comment.trim())
                      .then(() => {
                        setComment("");
                        toast.success("Comment added");
                      })
                      .catch((error) => toastApiError(error, "Comment could not be added."));
                  }}
                >
                  Post
                </Button>
              </div>
            )}
          </DataCard>
        </TabsContent>
      </Tabs>

      {/* Remark dialog (approve/return/reject/hold) */}
      <Dialog
        open={!!action && action !== "fin_pay" && action !== "fin_settle" && action !== "fin_close"}
        onOpenChange={(o) => !o && setAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionTitle(action)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>
              Remarks {needsRemark(action) && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              rows={4}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Add context for the requester / next approver…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitAction()}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={action === "fin_pay"}
        onClose={() => setAction(null)}
        ticket={t}
        me={me}
      />
      <SettlementDialog
        open={action === "fin_settle"}
        onClose={() => setAction(null)}
        ticket={t}
        me={me}
      />
      <CloseDialog
        open={action === "fin_close"}
        onClose={() => setAction(null)}
        ticket={t}
        me={me}
      />
    </div>
  );
}

function actionTitle(a: Action) {
  switch (a) {
    case "manager_approve":
      return "Verify as manager";
    case "manager_return":
      return "Return to requester";
    case "manager_reject":
      return "Reject expense";
    case "fin_hold":
      return "Put on finance hold";
    default:
      return "Confirm action";
  }
}
function needsRemark(a: Action) {
  return ["manager_return", "manager_reject", "fin_hold"].includes(a ?? "");
}

function PaymentDialog({
  open,
  onClose,
  ticket,
  me,
}: {
  open: boolean;
  onClose: () => void;
  ticket: ExpenseTicket;
  me: string;
}) {
  const { financeAction } = useExpenses();
  const [amount, setAmount] = useState(ticketTotal(ticket));
  const [mode, setMode] = useState<"bank_transfer" | "cash" | "card" | "upi">("bank_transfer");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release payment</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="col-span-1">
            <Label>Paid amount</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="col-span-1">
            <Label>Payment mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["bank_transfer", "upi", "card", "cash"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1">
            <Label>Payment date</Label>
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div className="col-span-1">
            <Label>Reference / UTR</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR / TXN ID"
            />
          </div>
          <div className="col-span-2">
            <Label>Finance remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!reference.trim()) {
                toast.error("Reference number required.");
                return;
              }
              void financeAction(ticket.id, "release_payment", me, {
                payment: { paidAmount: amount, mode, paidOn, reference, remarks },
              })
                .then(() => {
                  toast.success("Payment released");
                  onClose();
                })
                .catch((error) => toastApiError(error, "Payment could not be released."));
            }}
          >
            Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettlementDialog({
  open,
  onClose,
  ticket,
  me,
}: {
  open: boolean;
  onClose: () => void;
  ticket: ExpenseTicket;
  me: string;
}) {
  const { financeAction } = useExpenses();
  const initial = ticket.settlement;
  const [advance, setAdvance] = useState(initial?.advanceAmount ?? ticket.payment?.paidAmount ?? 0);
  const [actual, setActual] = useState(initial?.actualSpent ?? ticketTotal(ticket));
  const [bills, setBills] = useState(initial?.billsSubmitted ?? false);
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const balance = advance - actual;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review settlement</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Advance amount</Label>
            <Input
              type="number"
              value={advance}
              onChange={(e) => setAdvance(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Actual spent</Label>
            <Input
              type="number"
              value={actual}
              onChange={(e) => setActual(Number(e.target.value))}
            />
          </div>
          <div className="col-span-2 rounded-lg bg-muted/40 p-3 text-sm">
            Balance:{" "}
            {balance === 0 ? (
              "Settled"
            ) : balance > 0 ? (
              <span className="font-semibold text-destructive">
                Recoverable {fmtCurrency(balance)}
              </span>
            ) : (
              <span className="font-semibold text-success">
                Payable {fmtCurrency(Math.abs(balance))}
              </span>
            )}
          </div>
          <div className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bills} onChange={(e) => setBills(e.target.checked)} />{" "}
            Bills submitted
          </div>
          <div className="col-span-2">
            <Label>Settlement remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void financeAction(ticket.id, "review_settlement", me, {
                settlement: {
                  advanceAmount: advance,
                  actualSpent: actual,
                  balance,
                  billsSubmitted: bills,
                  remarks,
                },
              })
                .then(() => {
                  toast.success("Settlement updated");
                  onClose();
                })
                .catch((error) => toastApiError(error, "Settlement could not be updated."));
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({
  open,
  onClose,
  ticket,
  me,
}: {
  open: boolean;
  onClose: () => void;
  ticket: ExpenseTicket;
  me: string;
}) {
  const { financeAction } = useExpenses();
  const blocked = ticket.paymentType === "advance" && !ticket.settlement?.billsSubmitted;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close ticket</DialogTitle>
        </DialogHeader>
        {blocked ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Settlement cannot be closed — required bills are not yet submitted by the requester.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Once closed, this ticket becomes read-only and no further actions are allowed.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={blocked}
            onClick={() => {
              void financeAction(ticket.id, "close", me)
                .then(() => {
                  toast.success("Ticket closed");
                  onClose();
                })
                .catch((error) => toastApiError(error, "Ticket could not be closed."));
            }}
          >
            Close ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ k, v, className = "" }: { k: string; v: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-sm">{v}</dd>
    </div>
  );
}
