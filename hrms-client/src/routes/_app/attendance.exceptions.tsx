import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, StatusBadge, EmptyState, StatCard } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { AlarmClock, LogOut, ClipboardX, Wrench, Check, X } from "lucide-react";
import {
  attendanceAccessForRole,
  useAttendanceExceptions,
  useAttendanceRegularizationDecisionMutation,
} from "@/domains/attendance";
import {
  asArray,
  asRecord,
  boolValue,
  numberValue,
  text,
  userFacingErrorMessage,
} from "@/shared/api";

export const Route = createFileRoute("/_app/attendance/exceptions")({
  component: ExceptionsPage,
});

interface Row {
  id: string;
  requestId: string | null;
  employee: string;
  date: string;
  detail: string;
  status: string;
  exceptionType: string;
  expectedVersion: number;
  canDecide: boolean;
}

function displayDate(value: string): string {
  if (!value) return "Today";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "Attendance exception request failed.");
}

function rowsFromResponse(value: unknown): Row[] {
  return asArray(value).map((item) => {
    const row = asRecord(item);
    const requestId = text(row.request_id);
    return {
      id: text(row.id),
      requestId: requestId || null,
      employee: text(row.employee, "Employee"),
      date: text(row.date),
      detail: text(row.detail),
      status: text(row.status, "pending"),
      exceptionType: text(row.exception_type, "correction"),
      expectedVersion: numberValue(row.expected_version, 1),
      canDecide: boolValue(row.can_decide),
    };
  });
}

function Queue({
  rows,
  kind,
  decision,
  allowDecisions,
}: {
  rows: Row[];
  kind: string;
  decision: ReturnType<typeof useAttendanceRegularizationDecisionMutation>;
  allowDecisions: boolean;
}) {
  const act = async (row: Row, ok: boolean) => {
    if (!allowDecisions || !row.canDecide) return;
    if (!row.requestId) {
      toast.error("Only submitted correction requests can be decided from this queue.");
      return;
    }
    try {
      await decision.mutateAsync({
        id: row.requestId,
        input: {
          decision: ok ? "approve" : "reject",
          expected_version: row.expectedVersion,
          remarks: ok ? undefined : `Rejected from ${kind.toLowerCase()} queue.`,
        },
      });
      toast.success(`${kind} ${ok ? "approved" : "rejected"}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const cols: Column<Row>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "employee",
      header: "Employee",
      render: (r) => <span className="font-medium">{r.employee}</span>,
    },
    { key: "date", header: "Date", render: (r) => <>{displayDate(r.date)}</> },
    {
      key: "detail",
      header: "Detail",
      render: (r) => <span className="text-muted-foreground">{r.detail}</span>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];
  if (allowDecisions) {
    cols.push({
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.canDecide ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 rounded-full"
              disabled={decision.isPending}
              onClick={() => act(r, true)}
              aria-label="Approve correction"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full"
              disabled={decision.isPending}
              onClick={() => act(r, false)}
              aria-label="Reject correction"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No action</span>
        ),
    });
  }
  if (rows.length === 0)
    return <EmptyState title="All clear" description={`No ${kind.toLowerCase()} pending.`} />;
  return <DataTable rows={rows} columns={cols} searchKeys={["employee", "detail"]} />;
}

function ExceptionsPage() {
  const { activeRole } = useAuth();
  const access = attendanceAccessForRole(activeRole);
  const allowed = access.canViewReviewQueue;
  const query = useAttendanceExceptions({ page: 1, page_size: 100 }, allowed);
  const decision = useAttendanceRegularizationDecisionMutation();
  if (!allowed) return <Navigate to="/attendance" />;

  const data = asRecord(query.data);
  const rows = rowsFromResponse(data.items);
  const totals = asRecord(data.totals);
  const late = rows.filter((row) => row.exceptionType === "late");
  const missing = rows.filter((row) => row.exceptionType === "missing_punch");
  const absent = rows.filter((row) => row.exceptionType === "absent");
  const corrections = rows.filter((row) => row.exceptionType === "correction");

  if (query.isError) {
    return (
      <div className="pt-2">
        <EmptyState
          title="Could not load attendance exceptions"
          description={errorMessage(query.error)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Late arrivals"
          value={query.isLoading ? "..." : numberValue(totals.late)}
          icon={AlarmClock}
          tone="warning"
        />
        <StatCard
          label="Missing punch-out"
          value={query.isLoading ? "..." : numberValue(totals.missing_punch)}
          icon={LogOut}
          tone="warning"
        />
        <StatCard
          label="Absent w/o leave"
          value={query.isLoading ? "..." : numberValue(totals.absent)}
          icon={ClipboardX}
          tone="destructive"
        />
        <StatCard
          label="Manual corrections"
          value={query.isLoading ? "..." : numberValue(totals.correction)}
          icon={Wrench}
          tone="info"
        />
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading attendance exception queues...</p>
      ) : (
        <Tabs defaultValue="late">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="late">Late</TabsTrigger>
            <TabsTrigger value="missing">Missing punch-out</TabsTrigger>
            <TabsTrigger value="absent">Absent</TabsTrigger>
            <TabsTrigger value="correction">Corrections</TabsTrigger>
          </TabsList>
          <TabsContent value="late" className="mt-4">
            <Queue
              rows={late}
              kind="Late"
              decision={decision}
              allowDecisions={access.canDecideRegularizations}
            />
          </TabsContent>
          <TabsContent value="missing" className="mt-4">
            <Queue
              rows={missing}
              kind="Missing punch-out"
              decision={decision}
              allowDecisions={access.canDecideRegularizations}
            />
          </TabsContent>
          <TabsContent value="absent" className="mt-4">
            <Queue
              rows={absent}
              kind="Absence"
              decision={decision}
              allowDecisions={access.canDecideRegularizations}
            />
          </TabsContent>
          <TabsContent value="correction" className="mt-4">
            <Queue
              rows={corrections}
              kind="Correction"
              decision={decision}
              allowDecisions={access.canDecideRegularizations}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
