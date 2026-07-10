import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { DataTable, type Column, StatusBadge, EmptyState, Modal } from "@/components/ui-kit";
import { toast } from "sonner";
import { mapRequest, useEmsRequestMutation, useMyEmsRequests } from "@/domains/ems";
import { pageItems, toastApiError, useApiRouteEnabled } from "@/shared/api";
import { Plus, Inbox, Send } from "lucide-react";

export const Route = createFileRoute("/_app/ems/requests")({
  component: MyRequests,
});

type ReqType = "profile_update" | "document_verification" | "letter" | "asset" | "hr_support";
type ReqStatus = "pending" | "approved" | "rejected" | "returned" | "in_progress" | "closed";

interface ReqRow {
  id: string;
  type: ReqType;
  subject: string;
  raisedOn: string;
  status: ReqStatus;
  approver: string;
}

const TYPE_LABEL: Record<ReqType, string> = {
  profile_update: "Profile update",
  document_verification: "Document verification",
  letter: "Letter request",
  asset: "Asset request",
  hr_support: "HR support",
};

const SEED: ReqRow[] = [
  {
    id: "REQ-1041",
    type: "letter",
    subject: "Salary certificate for visa",
    raisedOn: "08 May 2026",
    status: "in_progress",
    approver: "HR Admin",
  },
  {
    id: "REQ-1038",
    type: "asset",
    subject: "Request for second monitor",
    raisedOn: "06 May 2026",
    status: "pending",
    approver: "IT Admin",
  },
  {
    id: "REQ-1029",
    type: "profile_update",
    subject: "Update current address",
    raisedOn: "01 May 2026",
    status: "approved",
    approver: "HR Admin",
  },
  {
    id: "REQ-1011",
    type: "hr_support",
    subject: "Provident fund query",
    raisedOn: "22 Apr 2026",
    status: "rejected",
    approver: "HR Admin",
  },
];

function MyRequests() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const requestsQuery = useMyEmsRequests({ page: 1, page_size: 25 }, apiEnabled);
  const createMutation = useEmsRequestMutation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReqType>("hr_support");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const rows: ReqRow[] = apiEnabled
    ? pageItems(requestsQuery.data).map((item) => {
        const request = mapRequest(item);
        return {
          id: request.requestCode,
          type: request.type as ReqType,
          subject: request.subject,
          raisedOn: request.raisedOn,
          status: request.status as ReqStatus,
          approver: request.approver,
        };
      })
    : SEED;

  const submit = () => {
    if (!subject.trim()) return toast.error("Subject is required");
    if (!details.trim()) return toast.error("Details are required");
    if (!apiEnabled) {
      setOpen(false);
      setSubject("");
      setDetails("");
      toast.success("Request submitted");
      return;
    }
    createMutation.mutate(
      {
        request_type: type,
        subject,
        description: details,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setSubject("");
          setDetails("");
          toast.success("Request submitted");
        },
        onError: (error) => toastApiError(error, "Request could not be submitted."),
      },
    );
  };

  const columns: Column<ReqRow>[] = [
    {
      key: "id",
      header: "Reference",
      render: (r) => <span className="font-mono text-xs">{r.id}</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (r) => <span className="text-sm">{TYPE_LABEL[r.type]}</span>,
    },
    {
      key: "subject",
      header: "Subject",
      render: (r) => <span className="text-sm font-medium">{r.subject}</span>,
    },
    { key: "approver", header: "Approver", render: (r) => <>{r.approver}</> },
    { key: "raisedOn", header: "Raised on", render: (r) => <>{r.raisedOn}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="ems-tab-intro flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Submitted requests</p>
          <p className="mt-1 text-sm text-muted-foreground">
            All your submitted requests in one place.
          </p>
        </div>
        <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New request
        </Button>
      </div>

      {apiEnabled && requestsQuery.isLoading ? (
        <DataTable rows={[]} columns={columns} loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description={
            requestsQuery.error
              ? "Requests could not be loaded from the backend."
              : "Click ‘New request’ to raise one."
          }
        />
      ) : (
        <DataTable rows={rows} columns={columns} />
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="New request"
        description="Submit a request to HR or IT."
        footer={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={submit} disabled={createMutation.isPending}>
              <Send className="mr-1.5 h-4 w-4" /> Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Request type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReqType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="subj">Subject</Label>
            <Input
              id="subj"
              className="mt-1"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief subject line"
            />
          </div>
          <div>
            <Label htmlFor="det">Details</Label>
            <Textarea
              id="det"
              className="mt-1"
              rows={4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add any details that will help the approver"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
