import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  Clock3,
  MapPinCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, StatusBadge, UserAvatar, type Column } from "@/components/ui-kit";
import { ApiError, userFacingErrorMessage } from "@/shared/api";
import {
  useAttendanceRegularizationDecisionMutation,
  useManagerAttendanceRegularizationQueue,
} from "./queries";
import {
  attendanceDecisionRemarksError,
  formatAttendanceReviewDate,
  formatAttendanceReviewDateTime,
  parseAttendanceReviewQueue,
  type AttendanceReviewDecision,
  type AttendanceReviewEvidence,
  type AttendanceReviewRequest,
  type AttendanceReviewStatus,
} from "./manager-review-model";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: AttendanceReviewStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "returned", label: "Returned" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const DECISION_COPY: Record<
  AttendanceReviewDecision,
  { title: string; description: string; submit: string }
> = {
  approve: {
    title: "Approve correction",
    description: "Apply the requested attendance correction to the employee's record.",
    submit: "Approve request",
  },
  return: {
    title: "Return for changes",
    description: "Send the request back to the employee with clear correction guidance.",
    submit: "Return request",
  },
  reject: {
    title: "Reject correction",
    description: "Close this request without applying the proposed correction.",
    submit: "Reject request",
  },
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function EvidenceIcon({ evidence }: { evidence: AttendanceReviewEvidence }) {
  if (evidence.operation === "replace") return <RefreshCw className="h-4 w-4" />;
  if (evidence.operation === "void") return <Trash2 className="h-4 w-4" />;
  if (evidence.operation === "geo") return <MapPinCheck className="h-4 w-4" />;
  return <Plus className="h-4 w-4" />;
}

function DecisionButton({
  decision,
  onClick,
  disabled,
}: {
  decision: AttendanceReviewDecision;
  onClick: () => void;
  disabled: boolean;
}) {
  if (decision === "approve") {
    return (
      <Button onClick={onClick} disabled={disabled}>
        <Check className="h-4 w-4" />
        Approve
      </Button>
    );
  }
  if (decision === "return") {
    return (
      <Button variant="outline" onClick={onClick} disabled={disabled}>
        <RotateCcw className="h-4 w-4" />
        Return
      </Button>
    );
  }
  return (
    <Button variant="destructive" onClick={onClick} disabled={disabled}>
      <X className="h-4 w-4" />
      Reject
    </Button>
  );
}

export function ManagerAttendanceReviewQueue({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState<AttendanceReviewStatus>("pending");
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AttendanceReviewRequest | null>(null);
  const [decision, setDecision] = useState<AttendanceReviewDecision | null>(null);
  const [remarks, setRemarks] = useState("");
  const [remarksError, setRemarksError] = useState<string | null>(null);

  const queueQuery = useManagerAttendanceRegularizationQueue(
    { page, page_size: PAGE_SIZE, status, month },
    enabled,
  );
  const decisionMutation = useAttendanceRegularizationDecisionMutation();
  const queue = useMemo(() => parseAttendanceReviewQueue(queueQuery.data), [queueQuery.data]);
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return queue.items;
    return queue.items.filter((item) =>
      [item.employeeName, item.employeeCode, item.reason, item.workDate].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [queue.items, search]);
  const pageCount = Math.max(1, Math.ceil(queue.total / queue.pageSize));

  const columns = useMemo<Column<AttendanceReviewRequest>[]>(
    () => [
      {
        key: "employee",
        header: "Employee",
        render: (request) => (
          <div className="flex min-w-[12rem] items-center gap-2.5">
            <UserAvatar name={request.employeeName} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{request.employeeName}</p>
              <p className="text-xs text-muted-foreground">{request.employeeCode}</p>
            </div>
          </div>
        ),
      },
      {
        key: "workDate",
        header: "Work date",
        render: (request) => (
          <span className="whitespace-nowrap text-sm">
            {formatAttendanceReviewDate(request.workDate)}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Request",
        className: "min-w-[16rem]",
        render: (request) => (
          <div className="max-w-sm">
            <p className="line-clamp-2 text-sm text-foreground">{request.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {request.evidence.length} evidence item{request.evidence.length === 1 ? "" : "s"}
            </p>
          </div>
        ),
      },
      {
        key: "createdAt",
        header: "Submitted",
        render: (request) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatAttendanceReviewDateTime(request.createdAt)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (request) => <StatusBadge status={request.status} />,
      },
    ],
    [],
  );

  const changeStatus = (value: string) => {
    setStatus(value as AttendanceReviewStatus);
    setPage(1);
    setSelected(null);
  };

  const changeMonth = (value: string) => {
    setMonth(value || currentMonth());
    setPage(1);
    setSelected(null);
  };

  const openDecision = (nextDecision: AttendanceReviewDecision) => {
    setRemarks("");
    setRemarksError(null);
    decisionMutation.reset();
    setDecision(nextDecision);
  };

  const closeDecision = () => {
    if (decisionMutation.isPending) return;
    setDecision(null);
    setRemarks("");
    setRemarksError(null);
  };

  const submitDecision = async () => {
    if (!selected || !decision) return;
    const validationError = attendanceDecisionRemarksError(decision, remarks);
    if (validationError) {
      setRemarksError(validationError);
      return;
    }

    try {
      await decisionMutation.mutateAsync({
        id: selected.id,
        input: {
          decision,
          expected_version: selected.version,
          remarks: remarks.trim() || undefined,
        },
      });
      toast.success(`${DECISION_COPY[decision].submit} completed`, {
        description: `${selected.employeeName}'s request has been updated.`,
      });
      setDecision(null);
      setSelected(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("This request changed before your decision was saved.", {
          description: "The queue has been refreshed. Review the latest version and try again.",
        });
        setDecision(null);
        setSelected(null);
        await queueQuery.refetch();
        return;
      }
      setRemarksError(userFacingErrorMessage(error, "The attendance decision could not be saved."));
    }
  };

  if (queueQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Review queue unavailable</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {userFacingErrorMessage(
              queueQuery.error,
              "The manager attendance queue could not be loaded.",
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => queueQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Manager review queue</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Review attendance corrections assigned to your approval scope.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="attendance-review-search">Search requests</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="attendance-review-search"
                value={search}
                className="pl-9"
                placeholder="Employee, code or reason"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor="attendance-review-month">Review month</Label>
            <Input
              id="attendance-review-month"
              type="month"
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
            />
          </div>
        </div>
      </div>

      <Tabs value={status} onValueChange={changeStatus}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:w-auto sm:grid-cols-4">
          {STATUS_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value} className="gap-2">
              {option.label}
              <span className="min-w-5 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                {queue.counts[option.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={visibleItems}
        loading={queueQuery.isLoading || queueQuery.isPlaceholderData}
        hideToolbar
        emptyTitle={`No ${status} requests`}
        emptyDescription={`There are no ${status} attendance corrections for ${month}.`}
        onRowClick={setSelected}
        rowActions={(request) => [
          {
            label: request.status === "pending" ? "Review request" : "View request",
            onClick: () => setSelected(request),
          },
        ]}
      />

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing page <span className="font-medium text-foreground">{queue.page}</span> of{" "}
          <span className="font-medium text-foreground">{pageCount}</span> ({queue.total} requests)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1 || queueQuery.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={page >= pageCount || queueQuery.isFetching}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <div className="flex min-h-full flex-col">
              <SheetHeader className="pr-8">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="text-xs text-muted-foreground">{selected.employeeCode}</span>
                </div>
                <SheetTitle>{selected.employeeName}</SheetTitle>
                <SheetDescription>
                  Attendance correction for {formatAttendanceReviewDate(selected.workDate)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 flex-1 space-y-6">
                <section>
                  <h3 className="text-sm font-semibold">Request reason</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {selected.reason}
                  </p>
                </section>

                <section>
                  <h3 className="text-sm font-semibold">Evidence summary</h3>
                  {selected.evidence.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No structured correction evidence was supplied.
                    </p>
                  ) : (
                    <div className="mt-2 divide-y rounded-md border">
                      {selected.evidence.map((evidence) => (
                        <div key={evidence.id} className="flex gap-3 p-3">
                          <span className="mt-0.5 text-primary">
                            <EvidenceIcon evidence={evidence} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{evidence.title}</p>
                            {evidence.occurredAt && (
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatAttendanceReviewDateTime(evidence.occurredAt)}
                              </p>
                            )}
                            {evidence.detail && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {evidence.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="grid grid-cols-1 gap-3 border-y py-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="mt-1">{formatAttendanceReviewDateTime(selected.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Work date</p>
                    <p className="mt-1">{formatAttendanceReviewDate(selected.workDate)}</p>
                  </div>
                  {selected.decidedAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">Decision recorded</p>
                      <p className="mt-1">{formatAttendanceReviewDateTime(selected.decidedAt)}</p>
                    </div>
                  )}
                  {selected.decisionRemarks && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Decision remarks</p>
                      <p className="mt-1 whitespace-pre-wrap">{selected.decisionRemarks}</p>
                    </div>
                  )}
                </section>
              </div>

              {selected.canDecide && (
                <div className="sticky bottom-0 mt-6 flex flex-wrap justify-end gap-2 border-t bg-background py-4">
                  <DecisionButton
                    decision="return"
                    disabled={decisionMutation.isPending}
                    onClick={() => openDecision("return")}
                  />
                  <DecisionButton
                    decision="reject"
                    disabled={decisionMutation.isPending}
                    onClick={() => openDecision("reject")}
                  />
                  <DecisionButton
                    decision="approve"
                    disabled={decisionMutation.isPending}
                    onClick={() => openDecision("approve")}
                  />
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(decision)} onOpenChange={(open) => !open && closeDecision()}>
        <DialogContent>
          {decision && selected && (
            <>
              <DialogHeader>
                <DialogTitle>{DECISION_COPY[decision].title}</DialogTitle>
                <DialogDescription>
                  {DECISION_COPY[decision].description} This action applies to{" "}
                  {selected.employeeName}'s request for{" "}
                  {formatAttendanceReviewDate(selected.workDate)}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="attendance-decision-remarks">
                  Remarks {decision === "approve" ? "(optional)" : "(required)"}
                </Label>
                <Textarea
                  id="attendance-decision-remarks"
                  value={remarks}
                  maxLength={1000}
                  rows={5}
                  aria-invalid={Boolean(remarksError)}
                  aria-describedby={remarksError ? "attendance-decision-error" : undefined}
                  placeholder={
                    decision === "approve"
                      ? "Add an optional note for the audit trail."
                      : "Explain what the employee needs to know."
                  }
                  onChange={(event) => {
                    setRemarks(event.target.value);
                    if (remarksError) setRemarksError(null);
                  }}
                />
                <div className="flex justify-between gap-3 text-xs">
                  <p
                    id="attendance-decision-error"
                    className={remarksError ? "text-destructive" : "text-muted-foreground"}
                    role={remarksError ? "alert" : undefined}
                  >
                    {remarksError ?? "Remarks are stored in the decision audit trail."}
                  </p>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {remarks.length}/1000
                  </span>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={closeDecision}
                  disabled={decisionMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={decision === "reject" ? "destructive" : "default"}
                  onClick={submitDecision}
                  disabled={decisionMutation.isPending}
                >
                  {decisionMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : decision === "approve" ? (
                    <Check className="h-4 w-4" />
                  ) : decision === "return" ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  {decisionMutation.isPending ? "Saving" : DECISION_COPY[decision].submit}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
