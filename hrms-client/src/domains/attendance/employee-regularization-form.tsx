import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, Clock3, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import {
  asRecord,
  text,
  toastApiError,
  toastApiSuccess,
  userFacingErrorMessage,
} from "@/shared/api";
import type {
  AttendanceRegularizationEventType,
  AttendanceRegularizationOperation,
  AttendanceRegularizationRecord,
} from "./api";
import { localIsoDate } from "./live";
import {
  REGULARIZATION_OPERATION_DESCRIPTION,
  buildRegularizationRequest,
  createRegularizationDraftItem,
  formatRegularizationWorkDate,
  monthsAgoLocalDate,
  previousLocalDate,
  regularizationPunchLabel,
  regularizationRequestOperationSummary,
  type RegularizationDraftItem,
  type RegularizationPunchOption,
} from "./regularization-form-model";
import {
  useAttendanceRegularizationMutation,
  useMyAttendancePunches,
  useMyAttendanceRegularizations,
} from "./queries";

interface SubmittedState {
  response: AttendanceRegularizationRecord;
  summaries: string[];
}

export function EmployeeRegularizationForm() {
  const mutation = useAttendanceRegularizationMutation();
  const itemSequence = useRef(1);
  const [workDate, setWorkDate] = useState("");
  const [reason, setReason] = useState("");
  const [draftItems, setRegularizationDraftItems] = useState<RegularizationDraftItem[]>([
    createRegularizationDraftItem("regularization-item-0"),
  ]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);

  const today = localIsoDate();
  const maximumWorkDate = previousLocalDate();
  const historyDateFrom = monthsAgoLocalDate(6);

  // listMyPunches uses date_from/date_to for its range. Passing only `date` would
  // silently return the default month-to-date range and could expose wrong targets.
  const punchesQuery = useMyAttendancePunches(
    {
      date_from: workDate || undefined,
      date_to: workDate || undefined,
      page: 1,
      page_size: 100,
    },
    Boolean(workDate),
  );
  const requestsQuery = useMyAttendanceRegularizations({
    date_from: historyDateFrom,
    date_to: today,
    page: 1,
    page_size: 10,
  });

  const punchOptions = useMemo<RegularizationPunchOption[]>(() => {
    return (punchesQuery.data?.items ?? [])
      .flatMap((value) => {
        const record = asRecord(value);
        const id = text(record.id);
        const eventType = text(record.event_type);
        const occurredAt = text(record.occurred_at);
        const recordWorkDate = text(record.work_date);
        const source = text(record.source);
        if (
          !id ||
          !occurredAt ||
          recordWorkDate !== workDate ||
          (eventType !== "check_in" && eventType !== "check_out")
        ) {
          return [];
        }
        return [
          {
            id,
            eventType: eventType as AttendanceRegularizationEventType,
            occurredAt,
            workDate: recordWorkDate,
            source,
            time:
              text(record.time) ||
              new Date(occurredAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              }),
          },
        ];
      })
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }, [punchesQuery.data, workDate]);

  const punchesBusy = Boolean(workDate) && punchesQuery.isFetching;
  const hasTargetOperation = draftItems.some(
    (item) => item.operation === "replace" || item.operation === "void",
  );

  const selectedTargetIds = useMemo(
    () => new Set(draftItems.map((item) => item.targetPunchEventId).filter(Boolean)),
    [draftItems],
  );

  const recentRequests = requestsQuery.data?.items ?? [];
  const unavailableTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const request of recentRequests) {
      if (request.status !== "pending" && request.status !== "approved") continue;
      for (const item of request.items ?? []) {
        if (item.target_punch_event_id) ids.add(item.target_punch_event_id);
      }
    }
    return ids;
  }, [recentRequests]);

  const updateRegularizationDraftItem = (key: string, patch: Partial<RegularizationDraftItem>) => {
    setRegularizationDraftItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
    setValidationErrors([]);
  };

  const changeOperation = (key: string, operation: AttendanceRegularizationOperation) => {
    setRegularizationDraftItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        return {
          ...item,
          operation,
          targetPunchEventId: operation === "add" ? "" : item.targetPunchEventId,
          time: operation === "void" ? "" : item.time,
        };
      }),
    );
    setValidationErrors([]);
  };

  const changeTargetPunch = (key: string, targetPunchEventId: string) => {
    const target = punchOptions.find((punch) => punch.id === targetPunchEventId);
    updateRegularizationDraftItem(key, {
      targetPunchEventId,
      eventType: target?.eventType ?? "check_in",
    });
  };

  const addRegularizationDraftItem = () => {
    if (draftItems.length >= 20) return;
    const key = `regularization-item-${itemSequence.current}`;
    itemSequence.current += 1;
    setRegularizationDraftItems((current) => [...current, createRegularizationDraftItem(key)]);
    setValidationErrors([]);
  };

  const removeRegularizationDraftItem = (key: string) => {
    if (draftItems.length === 1) return;
    setRegularizationDraftItems((current) => current.filter((item) => item.key !== key));
    setValidationErrors([]);
  };

  const changeWorkDate = (value: string) => {
    setWorkDate(value);
    setRegularizationDraftItems((current) =>
      current.map((item) => ({ ...item, targetPunchEventId: "" })),
    );
    setValidationErrors([]);
  };

  const buildRequest = () =>
    buildRegularizationRequest({
      workDate,
      reason,
      draftItems,
      punchOptions,
      unavailableTargetIds,
      today,
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = buildRequest();
    if (!result.body) {
      setValidationErrors(result.errors);
      return;
    }

    try {
      const response = await mutation.mutateAsync(result.body);
      setSubmitted({ response, summaries: result.summaries });
      setValidationErrors([]);
      toastApiSuccess(
        "Regularization request submitted",
        "Your manager can now review the requested attendance corrections.",
      );
    } catch (error) {
      toastApiError(error, "Attendance regularization request failed.");
    }
  };

  const resetForm = () => {
    itemSequence.current = 1;
    setWorkDate("");
    setReason("");
    setRegularizationDraftItems([createRegularizationDraftItem("regularization-item-0")]);
    setValidationErrors([]);
    setSubmitted(null);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="rounded-2xl border-border/60 p-5 xl:col-span-2">
        {submitted ? (
          <SubmittedRegularization state={submitted} onReset={resetForm} />
        ) : (
          <form
            data-testid="attendance-regularization-form"
            className="space-y-5"
            onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}
          >
            <div className="flex items-start gap-3">
              <div
                className={
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl " +
                  "bg-primary-soft text-primary"
                }
              >
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Correct historical attendance</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Request missing, incorrect, or duplicate check-in/check-out corrections. Original
                  attendance evidence is never edited.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="regularization-work-date">Attendance date</Label>
                <Input
                  id="regularization-work-date"
                  type="date"
                  value={workDate}
                  max={maximumWorkDate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    changeWorkDate(event.target.value)
                  }
                  className="mt-1.5"
                  required
                />
                {workDate && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {punchesBusy
                      ? "Loading correctable punches..."
                      : punchesQuery.isError
                        ? userFacingErrorMessage(
                            punchesQuery.error,
                            "Could not load punches for this date.",
                          )
                        : `${punchOptions.length} check-in/check-out punch${
                            punchOptions.length === 1 ? "" : "es"
                          } found.`}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Requested times are interpreted in your current device timezone.
                </p>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="regularization-reason">Reason</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {reason.length}/1000
                  </span>
                </div>
                <Textarea
                  id="regularization-reason"
                  rows={3}
                  value={reason}
                  minLength={3}
                  maxLength={1000}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                    setReason(event.target.value);
                    setValidationErrors([]);
                  }}
                  placeholder={
                    "Explain what happened and why the attendance record needs correction."
                  }
                  className="mt-1.5"
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold">Requested actions</h4>
                  <p className="text-xs text-muted-foreground">
                    Add up to 20 normalized correction actions in one request.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRegularizationDraftItem}
                  disabled={draftItems.length >= 20}
                >
                  <Plus className="h-4 w-4" /> Add action
                </Button>
              </div>

              {draftItems.map((draft, index) => (
                <div
                  key={draft.key}
                  data-testid={`regularization-action-${index + 1}`}
                  className="rounded-2xl border border-border/70 bg-muted/20 p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Action {index + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        {REGULARIZATION_OPERATION_DESCRIPTION[draft.operation]}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove action ${index + 1}`}
                      onClick={() => removeRegularizationDraftItem(draft.key)}
                      disabled={draftItems.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label htmlFor={`${draft.key}-operation`}>Correction type</Label>
                      <Select
                        value={draft.operation}
                        onValueChange={(value: string) =>
                          changeOperation(draft.key, value as AttendanceRegularizationOperation)
                        }
                      >
                        <SelectTrigger
                          id={`${draft.key}-operation`}
                          data-testid={`regularization-operation-${index + 1}`}
                          className="mt-1.5"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add">Add missing punch</SelectItem>
                          <SelectItem value="replace">Replace incorrect punch</SelectItem>
                          <SelectItem value="void">Remove duplicate punch</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(draft.operation === "replace" || draft.operation === "void") && (
                      <div className="md:col-span-2">
                        <Label htmlFor={`${draft.key}-target`}>Existing punch</Label>
                        <Select
                          value={draft.targetPunchEventId}
                          onValueChange={(value: string) => changeTargetPunch(draft.key, value)}
                          disabled={punchesBusy || punchOptions.length === 0}
                        >
                          <SelectTrigger
                            id={`${draft.key}-target`}
                            data-testid={`regularization-target-${index + 1}`}
                            className="mt-1.5"
                          >
                            <SelectValue placeholder="Select the punch to correct" />
                          </SelectTrigger>
                          <SelectContent>
                            {punchOptions.map((punch) => {
                              const selectedElsewhere =
                                selectedTargetIds.has(punch.id) &&
                                punch.id !== draft.targetPunchEventId;
                              const unavailable = unavailableTargetIds.has(punch.id);
                              return (
                                <SelectItem
                                  key={punch.id}
                                  value={punch.id}
                                  disabled={selectedElsewhere || unavailable}
                                >
                                  {regularizationPunchLabel(punch)}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {!punchesBusy && workDate && punchOptions.length === 0 && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            No correctable check-in/check-out punches exist on this date. Use “Add
                            missing punch” instead.
                          </p>
                        )}
                      </div>
                    )}

                    {draft.operation !== "void" && (
                      <>
                        <div>
                          <Label htmlFor={`${draft.key}-event-type`}>Requested punch</Label>
                          <Select
                            value={draft.eventType}
                            onValueChange={(value: string) =>
                              updateRegularizationDraftItem(draft.key, {
                                eventType: value as AttendanceRegularizationEventType,
                              })
                            }
                          >
                            <SelectTrigger
                              id={`${draft.key}-event-type`}
                              data-testid={`regularization-event-type-${index + 1}`}
                              className="mt-1.5"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="check_in">Check-in</SelectItem>
                              <SelectItem value="check_out">Check-out</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`${draft.key}-time`}>Requested time</Label>
                          <Input
                            id={`${draft.key}-time`}
                            data-testid={`regularization-time-${index + 1}`}
                            type="time"
                            step={60}
                            value={draft.time}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateRegularizationDraftItem(draft.key, { time: event.target.value })
                            }
                            className="mt-1.5"
                            required
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {validationErrors.length > 0 && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3"
              >
                <p className="text-sm font-semibold text-destructive">
                  Review the request before submitting
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-destructive">
                  {validationErrors.map((message, index) => (
                    <li key={`${index}-${message}`}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div
              className={
                "flex flex-col gap-3 border-t pt-4 sm:flex-row " +
                "sm:items-center sm:justify-between"
              }
            >
              <p className="text-xs text-muted-foreground">
                Your request is submitted as pending and requires manager approval.
              </p>
              <Button
                type="submit"
                data-testid="attendance-regularization-submit"
                className="rounded-full"
                disabled={mutation.isPending || (hasTargetOperation && punchesBusy)}
              >
                <Send className="h-4 w-4" />
                {mutation.isPending ? "Submitting..." : "Submit request"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <DataCard title="Recent regularization requests" description="Last six months">
        {requestsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading requests...</p>
        ) : requestsQuery.isError ? (
          <EmptyState
            title="Could not load requests"
            description={userFacingErrorMessage(
              requestsQuery.error,
              "Attendance regularization history failed to load.",
            )}
          />
        ) : recentRequests.length === 0 ? (
          <EmptyState
            title="No regularization requests"
            description="Submitted attendance corrections will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {recentRequests.map((request) => (
              <li key={request.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {formatRegularizationWorkDate(request.work_date)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {request.reason}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {regularizationRequestOperationSummary(request)} · {(request.items ?? []).length}{" "}
                  action
                  {(request.items ?? []).length === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}

function SubmittedRegularization({
  state,
  onReset,
}: {
  state: SubmittedState;
  onReset: () => void;
}) {
  const approver = asRecord(state.response.approver);
  const approverName = text(approver.full_name);

  return (
    <div
      data-testid="attendance-regularization-submitted"
      className="flex min-h-[420px] flex-col justify-center"
      aria-live="polite"
    >
      <div className="mx-auto max-w-xl text-center">
        <div
          className={
            "mx-auto grid h-16 w-16 place-items-center rounded-2xl " + "bg-success/15 text-success"
          }
        >
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="mt-4 flex justify-center">
          <StatusBadge status={state.response.status} />
        </div>
        <h3 className="mt-3 text-lg font-semibold">Regularization request submitted</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Corrections for {formatRegularizationWorkDate(state.response.work_date)} are now pending
          {approverName ? ` with ${approverName}` : " manager review"}.
        </p>
      </div>

      <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-border/70 bg-muted/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Requested actions
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {state.summaries.map((summary, index) => (
            <li key={`${index}-${summary}`} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{summary}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
          Reason: {state.response.reason}
        </p>
      </div>

      <div className="mt-6 flex justify-center">
        <Button type="button" variant="outline" className="rounded-full" onClick={onReset}>
          Submit another request
        </Button>
      </div>
    </div>
  );
}
