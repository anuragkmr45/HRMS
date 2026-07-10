import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  type Column,
  StatusBadge,
  EmptyState,
  StatCard,
  Modal,
} from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { LEAVE_TYPE_LABEL, type LeaveRequest } from "@/lib/leave-store";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import { CheckSquare, Check, X, MessageCircle, CalendarDays, Home } from "lucide-react";
import {
  requestsFromPage,
  useLeaveManagerQueue,
  useLeaveWfhDecisionMutation,
  useWfhManagerQueue,
} from "@/domains/leave-wfh";
import { userFacingErrorMessage } from "@/shared/api";

export const Route = createFileRoute("/_app/leave-wfh/approvals")({
  component: ApprovalsPage,
});

const APPROVER: Role[] = ["manager", "project_manager", "hr_admin", "main_admin"];

function ApprovalsPage() {
  const { activeRole } = useAuth();
  const leaveQueue = useLeaveManagerQueue({ page: 1, page_size: 50 });
  const wfhQueue = useWfhManagerQueue({ page: 1, page_size: 50 });
  const decisionMutation = useLeaveWfhDecisionMutation();

  const [modal, setModal] = useState<{
    open: boolean;
    req?: LeaveRequest;
    action?: "rejected" | "returned";
  }>({ open: false });
  const [remark, setRemark] = useState("");

  const leaves = useMemo(() => requestsFromPage(leaveQueue.data), [leaveQueue.data]);
  const wfhs = useMemo(() => requestsFromPage(wfhQueue.data), [wfhQueue.data]);
  const loadError = leaveQueue.error ?? wfhQueue.error ?? null;
  const isLoading = leaveQueue.isLoading || wfhQueue.isLoading;

  if (!activeRole || !APPROVER.includes(activeRole)) return <Navigate to="/leave-wfh" />;

  const decide = async (
    r: LeaveRequest,
    decision: "approve" | "reject" | "return",
    remarks?: string,
  ) => {
    try {
      await decisionMutation.mutateAsync({
        kind: r.kind,
        id: r.id,
        input: {
          decision,
          remarks,
          expected_version: r.expectedVersion ?? 1,
        },
      });
      toast.success(
        `${r.id} ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "returned"}`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const openModal = (r: LeaveRequest, action: "rejected" | "returned") => {
    setModal({ open: true, req: r, action });
    setRemark("");
  };
  const submitModal = async () => {
    if (!modal.req || !modal.action) return;
    if (!remark.trim()) return toast.error("Remarks are required");
    await decide(modal.req, modal.action === "rejected" ? "reject" : "return", remark.trim());
    setModal({ open: false });
  };

  function Queue({ rows, kind }: { rows: LeaveRequest[]; kind: "leave" | "wfh" }) {
    if (loadError)
      return (
        <EmptyState
          icon={CheckSquare}
          title="Could not load approvals"
          description={errorMessage(loadError)}
        />
      );
    if (isLoading)
      return <p className="text-sm text-muted-foreground">Loading approval queue...</p>;
    if (rows.length === 0)
      return (
        <EmptyState
          icon={CheckSquare}
          title="All caught up"
          description="No requests pending your action."
        />
      );
    const cols: Column<LeaveRequest>[] = [
      { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
      {
        key: "employee",
        header: "Employee",
        render: (r) => (
          <>
            <div className="font-medium">{r.employee}</div>
            <div className="text-xs text-muted-foreground">{r.department}</div>
          </>
        ),
      },
      ...(kind === "leave"
        ? [
            {
              key: "type",
              header: "Type",
              render: (r: LeaveRequest) => <>{LEAVE_TYPE_LABEL[r.leaveType!]}</>,
            },
          ]
        : []),
      {
        key: "dates",
        header: "Dates",
        render: (r) => (
          <span className="text-sm">
            {r.fromDate} → {r.toDate}
          </span>
        ),
      },
      {
        key: "duration",
        header: "Duration",
        render: (r) => (
          <span className="tabular-nums">
            {r.duration}d{r.halfDay ? " (½)" : ""}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Reason",
        render: (r) => (
          <span
            className="block max-w-[260px] truncate text-sm text-muted-foreground"
            title={r.reason}
          >
            {r.reason}
          </span>
        ),
      },
      { key: "status", header: "Status", render: (r) => <StatusBadge status="pending" /> },
      {
        key: "a",
        header: "Actions",
        render: (r) => (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 rounded-full"
              disabled={decisionMutation.isPending}
              onClick={() => void decide(r, "approve")}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full"
              onClick={() => openModal(r, "rejected")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-full"
              onClick={() => openModal(r, "returned")}
              title="Return for clarification"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ];
    return <DataTable rows={rows} columns={cols} searchKeys={["employee", "reason"]} />;
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Pending leave" value={leaves.length} icon={CalendarDays} tone="warning" />
        <StatCard label="Pending WFH" value={wfhs.length} icon={Home} tone="info" />
        <StatCard label="Approved (this week)" value="0" icon={Check} tone="success" />
      </div>

      <Tabs defaultValue="leave">
        <TabsList>
          <TabsTrigger value="leave">Leave requests ({leaves.length})</TabsTrigger>
          <TabsTrigger value="wfh">WFH requests ({wfhs.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="leave" className="mt-4">
          <Queue rows={leaves} kind="leave" />
        </TabsContent>
        <TabsContent value="wfh" className="mt-4">
          <Queue rows={wfhs} kind="wfh" />
        </TabsContent>
      </Tabs>

      <Modal
        open={modal.open}
        onOpenChange={(v) => setModal({ open: v })}
        title={modal.action === "rejected" ? "Reject request" : "Return for clarification"}
        description={modal.req ? `${modal.req.id} · ${modal.req.employee}` : ""}
        footer={
          <>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setModal({ open: false })}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={decisionMutation.isPending}
              onClick={() => void submitModal()}
            >
              {modal.action === "rejected" ? "Reject" : "Return"}
            </Button>
          </>
        }
      >
        <div>
          <Label htmlFor="rk">Remarks {modal.action === "rejected" ? "(required)" : ""}</Label>
          <Textarea
            id="rk"
            rows={4}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className="mt-1.5"
            placeholder="Explain your decision so the employee can understand."
          />
        </div>
      </Modal>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "Leave/WFH approval request failed.");
}
