import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useHelpdesk, HELPDESK_AGENT_ROLES } from "@/lib/helpdesk-store";
import { useEmployees } from "@/lib/employees-store";
import { documentsApi, useDocumentUploadPolicy } from "@/domains/documents";
import { toastApiError } from "@/shared/api";
import { queryKeys } from "@/shared/query";
import {
  formatBytes,
  prepareDocumentUploadFile,
  uploadPolicyAccept,
} from "@/shared/uploads/documents";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge, EmptyState } from "@/components/ui-kit";
import { SlaBadge, PriorityBadge } from "@/components/helpdesk/badges";
import {
  computeSla,
  fmtDateTime,
  fmtRelative,
  SLA_MATRIX,
  type TicketPriority,
} from "@/lib/mock/helpdesk";
import {
  ArrowLeft,
  MessageSquare,
  Paperclip,
  AlertOctagon,
  CheckCircle2,
  RefreshCcw,
  UserCog,
  Flame,
  Lock,
  Send,
  Upload,
  Download,
  Activity,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/helpdesk/$id")({ component: TicketDetailScreen });

function TicketDetailScreen() {
  const { id } = Route.useParams();
  const { user, activeRole } = useAuth();
  const {
    tickets,
    addComment,
    addAttachment,
    changePriority,
    assign,
    setStatus,
    resolve,
    close,
    reopen,
    escalate,
    isApiBacked,
  } = useHelpdesk();
  const { employees } = useEmployees();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = tickets.find((x) => x.id === id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPolicyQuery = useDocumentUploadPolicy(isApiBacked);

  const isAgent = !!activeRole && (HELPDESK_AGENT_ROLES as readonly string[]).includes(activeRole);
  const actor = user?.name ?? "Anonymous";

  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [attachName, setAttachName] = useState("");

  const sla = useMemo(() => (t ? computeSla(t) : null), [t]);

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!t) throw new Error("Ticket is not loaded.");
      const prepared = await prepareDocumentUploadFile(file, uploadPolicyQuery.data);
      const formData = new FormData();
      formData.set("business_object_type", "helpdesk_ticket");
      formData.set("business_object_id", t.id);
      formData.set("classification", "normal");
      formData.set("document_type", "supporting_document");
      formData.set("file_name", prepared.file.name);
      formData.set("mime_type", prepared.file.type || "application/octet-stream");
      formData.set("size_bytes", String(prepared.file.size));
      formData.set("file", prepared.file);
      const document = await documentsApi.create(formData);
      const documentId =
        typeof document.id === "string"
          ? document.id
          : typeof document.document_id === "string"
            ? document.document_id
            : "";
      if (!documentId) throw new Error("The backend did not return a document id.");
      await addAttachment(
        t.id,
        prepared.file.name,
        actor,
        documentId,
        formatBytes(prepared.file.size),
      );
      return prepared;
    },
    onSuccess: (prepared) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.domain("helpdesk") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.domain("documents") });
      toast.success("Attachment uploaded", {
        description: prepared.compressed
          ? `${prepared.file.name} was compressed and attached.`
          : `${prepared.file.name} is attached to this ticket.`,
      });
    },
    onError: (error) => {
      toastApiError(error, "Attachment upload failed.");
    },
  });

  if (!t) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={MessageSquare}
          title="Ticket not found"
          description="It may have been deleted or the link is incorrect."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild variant="outline">
            <Link to="/helpdesk">Back to helpdesk</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const isOwner = t.raisedBy === user?.name;
  const isAssignee = t.assignee === user?.name;
  const canManage = isAgent || isAssignee;
  const isClosed = t.status === "closed";

  const runAction = (work: () => void | Promise<void>, success: string) => {
    void Promise.resolve()
      .then(work)
      .then(() => toast.success(success))
      .catch((error) => toastApiError(error, "Helpdesk action failed"));
  };

  const submitComment = () => {
    if (!comment.trim()) return toast.error("Add a message");
    runAction(
      () => addComment(t.id, comment.trim(), actor, activeRole ?? undefined, internal),
      internal ? "Internal note added" : "Comment added",
    );
    setComment("");
    setInternal(false);
  };

  const submitAttachment = () => {
    if (!attachName.trim()) return;
    runAction(() => addAttachment(t.id, attachName.trim(), actor), "Attachment added");
    setAttachName("");
  };

  const uploadSelectedAttachment = (file: File | undefined) => {
    if (!file) return;
    uploadAttachment.mutate(file);
  };

  const downloadAttachment = (documentId?: string) => {
    if (!documentId) {
      toast.error("Download unavailable", {
        description: "This attachment only has filename metadata in the backend.",
      });
      return;
    }
    runAction(async () => {
      const response = await documentsApi.createDownloadUrl(documentId);
      const url = typeof response.url === "string" ? response.url : "";
      if (!url) throw new Error("The backend did not return a download URL.");
      window.open(url, "_blank", "noopener,noreferrer");
    }, "Download URL opened");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/helpdesk" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <span className="font-mono text-xs font-semibold text-muted-foreground">{t.id}</span>
        <StatusBadge status={t.status} />
        <PriorityBadge priority={t.priority} />
        <SlaBadge ticket={t} />
        {t.escalated && (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <Flame className="h-3 w-3" /> Escalated
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-xl font-semibold leading-tight">{t.subject}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Raised by <span className="font-medium text-foreground">{t.raisedBy}</span>
              {t.raisedByDept && <> · {t.raisedByDept}</>} · {fmtRelative(t.createdAt)}
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/90">{t.description}</p>

            {(t.relatedAssetId || t.relatedProjectId) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3 text-xs text-muted-foreground">
                {t.relatedAssetId && (
                  <span>
                    Related asset:{" "}
                    <span className="font-mono text-foreground">{t.relatedAssetId}</span>
                  </span>
                )}
                {t.relatedProjectId && (
                  <span>
                    Related project:{" "}
                    <span className="font-mono text-foreground">{t.relatedProjectId}</span>
                  </span>
                )}
              </div>
            )}
          </Card>

          {/* Conversation */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <p className="text-sm font-semibold">Conversation</p>
              <span className="text-xs text-muted-foreground">{t.comments.length} messages</span>
            </div>
            <div className="space-y-4 p-5">
              {t.comments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No messages yet — start the conversation below.
                </p>
              )}
              {t.comments.map((c) => {
                const mine = c.author === user?.name;
                return (
                  <div key={c.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                    <div
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                      )}
                    >
                      {c.author
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl border px-3.5 py-2.5",
                        mine ? "bg-primary/10 border-primary/20" : "bg-card",
                        c.internal && "border-warning/40 bg-warning/10 dark:border-warning/30",
                      )}
                    >
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{c.author}</span>
                        {c.authorRole && <span>· {c.authorRole}</span>}
                        <span>· {fmtRelative(c.at)}</span>
                        {c.internal && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/30 px-1.5 py-0.5 text-warning-foreground dark:bg-warning/15 dark:text-warning">
                            <Lock className="h-3 w-3" /> Internal
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t bg-muted/30 p-4">
              {isClosed ? (
                <p className="text-center text-xs text-muted-foreground">
                  This ticket is closed. Reopen to add new messages.
                </p>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Write a reply…"
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      {canManage && (
                        <>
                          <input
                            type="checkbox"
                            checked={internal}
                            onChange={(e) => setInternal(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border"
                          />
                          Internal note (hidden from requester)
                        </>
                      )}
                    </label>
                    <Button size="sm" onClick={submitComment}>
                      <Send className="mr-1 h-3.5 w-3.5" /> Send
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Attachments */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <p className="text-sm font-semibold">Attachments</p>
              <span className="text-xs text-muted-foreground">{t.attachments.length} files</span>
            </div>
            <ul className="divide-y">
              {t.attachments.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-muted-foreground">
                  No files attached yet.
                </li>
              )}
              {t.attachments.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {f.by} · {fmtRelative(f.at)} · {f.size}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isApiBacked && !f.documentId}
                    onClick={() => downloadAttachment(f.documentId)}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" /> Download
                  </Button>
                </li>
              ))}
            </ul>
            {!isClosed && (
              <div className="flex items-center gap-2 border-t bg-muted/30 px-5 py-3">
                {isApiBacked ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={uploadPolicyAccept(uploadPolicyQuery.data)}
                      className="hidden"
                      onChange={(event) => {
                        uploadSelectedAttachment(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadAttachment.isPending}
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      {uploadAttachment.isPending ? "Uploading" : "Upload file"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      value={attachName}
                      onChange={(e) => setAttachName(e.target.value)}
                      placeholder="filename.pdf"
                      className="h-9"
                    />
                    <Button size="sm" variant="outline" onClick={submitAttachment}>
                      <Upload className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <p className="text-sm font-semibold">Ticket details</p>
            <Detail label="Category" value={t.category} />
            <Detail label="Sub-category" value={t.subCategory || "—"} />
            <Detail label="Priority" value={<PriorityBadge priority={t.priority} />} />
            <Detail label="Status" value={<StatusBadge status={t.status} />} />
            <Detail label="Assignee" value={t.assignee ?? "Unassigned"} sub={t.assigneeRole} />
            <Detail label="Created" value={fmtDateTime(t.createdAt)} />
            <Detail label="Last update" value={fmtRelative(t.updatedAt)} />
            {t.resolvedAt && <Detail label="Resolved" value={fmtDateTime(t.resolvedAt)} />}
            {t.closedAt && <Detail label="Closed" value={fmtDateTime(t.closedAt)} />}
            {t.reopenCount > 0 && <Detail label="Reopen count" value={String(t.reopenCount)} />}
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">SLA tracker</p>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-muted-foreground">Response target</p>
                <p className="mt-1 text-base font-semibold">
                  {SLA_MATRIX[t.priority].responseHours}h
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Due {fmtDateTime(sla!.responseDueAt)}
                </p>
                <p
                  className={cn(
                    "mt-1 text-[11px] font-medium",
                    sla!.responseState === "breached" && "text-destructive",
                    sla!.responseState === "near_breach" &&
                      "text-warning-foreground dark:text-warning",
                  )}
                >
                  {t.firstResponseAt ? "Sent " + fmtDateTime(t.firstResponseAt) : "Pending"}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-muted-foreground">Resolution target</p>
                <p className="mt-1 text-base font-semibold">
                  {SLA_MATRIX[t.priority].resolutionHours}h
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Due {fmtDateTime(sla!.resolutionDueAt)}
                </p>
                <SlaBadge ticket={t} />
              </div>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <p className="text-sm font-semibold">Actions</p>
            {canManage && !isClosed && (
              <>
                <PriorityChanger
                  current={t.priority}
                  onChange={(p) => {
                    runAction(() => changePriority(t.id, p, actor), "Priority updated");
                  }}
                />
                <AssignDialog
                  current={t.assignee}
                  options={employees.map((e) => ({ name: e.name, role: e.designation }))}
                  onAssign={(name, role) => {
                    runAction(() => assign(t.id, name, role, actor), "Assigned to " + name);
                  }}
                />
                {t.status !== "in_progress" && t.status !== "resolved" && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    size="sm"
                    onClick={() => {
                      runAction(() => setStatus(t.id, "in_progress", actor), "Marked in progress");
                    }}
                  >
                    <Activity className="mr-2 h-3.5 w-3.5" /> Mark in progress
                  </Button>
                )}
                {t.status !== "on_hold" && t.status !== "resolved" && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    size="sm"
                    onClick={() => {
                      runAction(
                        () => setStatus(t.id, "on_hold", actor, "Put on hold from frontend"),
                        "Put on hold",
                      );
                    }}
                  >
                    <Clock className="mr-2 h-3.5 w-3.5" /> Put on hold
                  </Button>
                )}
                <ResolveDialog
                  onResolve={(r) => {
                    runAction(() => resolve(t.id, r, actor), "Ticket resolved");
                  }}
                />
                <EscalateDialog
                  onEscalate={(r) => {
                    runAction(() => escalate(t.id, r, actor), "Ticket escalated");
                  }}
                />
              </>
            )}
            {(isOwner || canManage) && t.status === "resolved" && (
              <Button
                variant="outline"
                className="w-full justify-start"
                size="sm"
                onClick={() => {
                  runAction(() => close(t.id, actor), "Ticket closed");
                }}
              >
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Close ticket
              </Button>
            )}
            {(isOwner || canManage) && (t.status === "resolved" || t.status === "closed") && (
              <ReopenDialog
                onReopen={(r) => {
                  runAction(() => reopen(t.id, r, actor), "Ticket reopened");
                }}
              />
            )}
            {!canManage && !isOwner && (
              <p className="text-xs text-muted-foreground">
                You don't have permissions to act on this ticket.
              </p>
            )}
          </Card>

          {t.resolution && (
            <Card className="space-y-2 p-5">
              <p className="text-sm font-semibold">Resolution</p>
              <p className="rounded-md bg-success/10 px-3 py-2 text-xs text-success">
                {t.resolution}
              </p>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="border-b px-5 py-3">
              <p className="text-sm font-semibold">Activity timeline</p>
            </div>
            <ol className="space-y-3 p-5">
              {t.events
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{e.action}</p>
                      {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {e.actor} · {fmtRelative(e.at)}
                      </p>
                    </div>
                  </li>
                ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className="font-medium">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function PriorityChanger({
  current,
  onChange,
}: {
  current: TicketPriority;
  onChange: (p: TicketPriority) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Change priority</Label>
      <Select value={current} onValueChange={(v) => onChange(v as TicketPriority)}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["Low", "Medium", "High", "Urgent"] as TicketPriority[]).map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AssignDialog({
  current,
  options,
  onAssign,
}: {
  current?: string;
  options: { name: string; role: string }[];
  onAssign: (n: string, r: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current ?? "");
  const role = options.find((o) => o.name === name)?.role ?? "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start" size="sm">
          <UserCog className="mr-2 h-3.5 w-3.5" /> Assign / Reassign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign ticket</DialogTitle>
          <DialogDescription>
            Pick the agent or specialist who'll own this ticket.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Assignee</Label>
          <Select value={name} onValueChange={setName}>
            <SelectTrigger>
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {options.map((o) => (
                <SelectItem key={o.name} value={o.name}>
                  {o.name} · {o.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (name) {
                onAssign(name, role);
                setOpen(false);
              }
            }}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ onResolve }: { onResolve: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full justify-start" size="sm">
          <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Resolve ticket
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve ticket</DialogTitle>
          <DialogDescription>Add a brief resolution note for the requester.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What was the fix?"
          rows={4}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (text.trim()) {
                onResolve(text.trim());
                setText("");
                setOpen(false);
              }
            }}
          >
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({ onReopen }: { onReopen: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start" size="sm">
          <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Reopen ticket
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen ticket</DialogTitle>
          <DialogDescription>Tell the agent why this needs another look.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reason for reopening"
          rows={3}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (text.trim()) {
                onReopen(text.trim());
                setText("");
                setOpen(false);
              }
            }}
          >
            Reopen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscalateDialog({ onEscalate }: { onEscalate: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-destructive hover:text-destructive"
          size="sm"
        >
          <AlertOctagon className="mr-2 h-3.5 w-3.5" /> Escalate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escalate ticket</DialogTitle>
          <DialogDescription>Escalation also bumps priority by one level.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Why are you escalating?"
          rows={3}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (text.trim()) {
                onEscalate(text.trim());
                setText("");
                setOpen(false);
              }
            }}
          >
            Escalate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
