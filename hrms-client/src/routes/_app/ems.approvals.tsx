import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column, StatusBadge, EmptyState } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import { CheckSquare, Inbox, Check, X } from "lucide-react";
import { isApiEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/ems/approvals")({
  component: MyApprovals,
});

const APPROVER_ROLES: Role[] = [
  "manager",
  "project_manager",
  "hr_admin",
  "finance_manager",
  "main_admin",
  "asset_admin",
  "helpdesk_agent",
];

interface Row {
  id: string;
  person: string;
  subject: string;
  raisedOn: string;
  status: string;
}

const LEAVE: Row[] = [
  {
    id: "LV-2041",
    person: "Daniel Park",
    subject: "Earned leave 15-19 May",
    raisedOn: "08 May",
    status: "pending",
  },
  {
    id: "LV-2040",
    person: "Fatima Noor",
    subject: "Sick leave 12 May",
    raisedOn: "08 May",
    status: "pending",
  },
];
const WFH: Row[] = [
  {
    id: "WFH-118",
    person: "Aryan Mehta",
    subject: "WFH on 14 May (Wed)",
    raisedOn: "07 May",
    status: "pending",
  },
];
const TS: Row[] = [
  {
    id: "TS-W19",
    person: "Fatima Noor",
    subject: "Week of 5 May (40h)",
    raisedOn: "10 May",
    status: "pending",
  },
  {
    id: "TS-W19b",
    person: "Jacob Owens",
    subject: "Week of 5 May (38h)",
    raisedOn: "10 May",
    status: "pending",
  },
];
const EXP: Row[] = [
  {
    id: "EXP-401",
    person: "Daniel Park",
    subject: "Client lunch — USD 84.50",
    raisedOn: "06 May",
    status: "pending",
  },
];
const ASSET: Row[] = [
  {
    id: "AST-R12",
    person: "Aryan Mehta",
    subject: "Request: 4K monitor",
    raisedOn: "06 May",
    status: "pending",
  },
];
const HD: Row[] = [
  {
    id: "TKT-12044",
    person: "Daniel Park",
    subject: "Mac running slow — escalation",
    raisedOn: "Today",
    status: "open",
  },
];

const LIVE_APPROVAL_MODULES = [
  {
    label: "Leave & WFH",
    description: "Approve leave and WFH requests.",
    to: "/leave-wfh/approvals",
  },
  {
    label: "Timesheets",
    description: "Review submitted timesheets.",
    to: "/timesheet/approvals",
  },
  {
    label: "Expenses",
    description: "Verify or return expense claims.",
    to: "/expenses/review",
  },
  {
    label: "Assets",
    description: "Review asset requests and acknowledgements.",
    to: "/assets/requests",
  },
  {
    label: "Helpdesk",
    description: "Work assigned support queue tickets.",
    to: "/helpdesk/queue",
  },
] as const;

function ApprovalTable({ rows, kind }: { rows: Row[]; kind: string }) {
  const [data, setData] = useState(rows);
  const act = (id: string, ok: boolean) => {
    setData((d) => d.filter((r) => r.id !== id));
    toast.success(`${kind} ${ok ? "approved" : "rejected"}`);
  };
  const columns: Column<Row>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "person", header: "Requester", render: (r) => <>{r.person}</> },
    {
      key: "subject",
      header: "Subject",
      render: (r) => <span className="font-medium">{r.subject}</span>,
    },
    { key: "raisedOn", header: "Raised", render: (r) => <>{r.raisedOn}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex gap-2">
          <Button size="sm" className="h-7 rounded-full" onClick={() => act(r.id, true)}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            onClick={() => act(r.id, false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];
  if (data.length === 0)
    return (
      <EmptyState
        icon={CheckSquare}
        title="All caught up"
        description="No pending items in this queue."
      />
    );
  return <DataTable rows={data} columns={columns} />;
}

function MyApprovals() {
  const { activeRole } = useAuth();
  if (!activeRole || !APPROVER_ROLES.includes(activeRole)) return <Navigate to="/ems" />;
  if (isApiEnabled()) {
    return (
      <div className="space-y-4 pt-4">
        <div className="ems-tab-intro p-4">
          <p className="text-sm font-medium">Approval workbench</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Live approvals are handled inside each workflow module so this page does not show demo
            queue data for API-backed workspaces.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {LIVE_APPROVAL_MODULES.map((module) => (
            <Card key={module.to} className="ems-record-card rounded-2xl p-4">
              <div className="flex h-full flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold">{module.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
                </div>
                <Button asChild variant="outline" className="mt-auto rounded-full">
                  <Link to={module.to}>Open queue</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="ems-tab-intro p-4">
        <p className="text-sm font-medium">Approval workbench</p>
        <p className="mt-1 text-sm text-muted-foreground">Pending items waiting on your action.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Leave", v: LEAVE.length },
          { l: "WFH", v: WFH.length },
          { l: "Timesheet", v: TS.length },
          { l: "Expense", v: EXP.length },
          { l: "Asset", v: ASSET.length },
          { l: "Helpdesk", v: HD.length },
        ].map((s) => (
          <Card key={s.l} className="ems-kpi-card rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">{s.l}</p>
            <p className="mt-1 text-2xl font-semibold">{s.v}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="leave" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="wfh">WFH</TabsTrigger>
          <TabsTrigger value="ts">Timesheet</TabsTrigger>
          <TabsTrigger value="exp">Expense</TabsTrigger>
          <TabsTrigger value="asset">Asset</TabsTrigger>
          <TabsTrigger value="hd">Helpdesk</TabsTrigger>
        </TabsList>
        <TabsContent value="leave" className="mt-4">
          <ApprovalTable rows={LEAVE} kind="Leave" />
        </TabsContent>
        <TabsContent value="wfh" className="mt-4">
          <ApprovalTable rows={WFH} kind="WFH" />
        </TabsContent>
        <TabsContent value="ts" className="mt-4">
          <ApprovalTable rows={TS} kind="Timesheet" />
        </TabsContent>
        <TabsContent value="exp" className="mt-4">
          <ApprovalTable rows={EXP} kind="Expense" />
        </TabsContent>
        <TabsContent value="asset" className="mt-4">
          <ApprovalTable rows={ASSET} kind="Asset" />
        </TabsContent>
        <TabsContent value="hd" className="mt-4">
          <ApprovalTable rows={HD} kind="Ticket" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
