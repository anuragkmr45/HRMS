import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/ui-kit";
import { toast } from "sonner";
import { mapPolicy, useEmsPolicies, useEmsPolicyAcknowledgeMutation } from "@/domains/ems";
import { pageItems, toastApiError, useApiRouteEnabled } from "@/shared/api";
import { BookOpen, Download, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/ems/policies")({
  component: MyPolicies,
});

interface Policy {
  id: string;
  name: string;
  version: string;
  updatedOn: string;
  acknowledged: boolean;
  acknowledgementVersion?: number;
  documentId?: string;
}

const POLICIES: Policy[] = [
  {
    id: "P1",
    name: "Attendance policy",
    version: "v3.1",
    updatedOn: "12 Jan 2026",
    acknowledged: true,
  },
  {
    id: "P2",
    name: "Leave policy",
    version: "v4.0",
    updatedOn: "01 Jun 2026",
    acknowledged: false,
  },
  {
    id: "P3",
    name: "Expense & reimbursement policy",
    version: "v2.4",
    updatedOn: "20 Feb 2026",
    acknowledged: true,
  },
  {
    id: "P4",
    name: "IT asset policy",
    version: "v1.8",
    updatedOn: "05 Apr 2026",
    acknowledged: true,
  },
  {
    id: "P5",
    name: "Work from home policy",
    version: "v2.0",
    updatedOn: "15 Mar 2026",
    acknowledged: true,
  },
  {
    id: "P6",
    name: "Code of conduct",
    version: "v5.2",
    updatedOn: "01 Jan 2026",
    acknowledged: true,
  },
];

function MyPolicies() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const policiesQuery = useEmsPolicies({ page: 1, page_size: 25 }, apiEnabled);
  const acknowledgeMutation = useEmsPolicyAcknowledgeMutation();
  const rows: Policy[] = apiEnabled
    ? pageItems(policiesQuery.data).map((item) => {
        const policy = mapPolicy(item);
        return {
          id: policy.id,
          name: policy.title,
          version: policy.versionLabel,
          updatedOn: policy.effectiveFrom,
          acknowledged: policy.acknowledgementStatus === "acknowledged",
          acknowledgementVersion: policy.acknowledgementVersion,
          documentId: policy.documentId,
        };
      })
    : POLICIES;
  const acknowledge = (policy: Policy) => {
    if (!apiEnabled || !policy.acknowledgementVersion) return toast.success("Policy acknowledged");
    acknowledgeMutation.mutate(
      { id: policy.id, expectedVersion: policy.acknowledgementVersion },
      {
        onSuccess: () => toast.success("Policy acknowledged"),
        onError: (error) => toastApiError(error, "Policy could not be acknowledged."),
      },
    );
  };
  return (
    <div className="space-y-4 pt-4">
      <div className="ems-tab-intro p-4">
        <p className="text-sm font-medium">Policy library</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Read and acknowledge company policies. New versions appear at the top.
        </p>
      </div>
      {apiEnabled && policiesQuery.error ? (
        <EmptyState
          title="Policies could not be loaded"
          description="The backend EMS policies API returned an error."
        />
      ) : null}
      {apiEnabled && policiesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading policies from backend...</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((p) => (
          <Card key={p.id} className="ems-record-card rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="ems-record-icon">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{p.name}</p>
                  {p.acknowledged ? (
                    <StatusBadge status="completed" label="Acknowledged" />
                  ) : (
                    <StatusBadge status="pending" label="Action needed" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.version} · Updated {p.updatedOn}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      toast(
                        p.documentId ? "Opening policy..." : "Policy document is not attached yet.",
                      )
                    }
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Read
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      toast(
                        p.documentId ? "Download started" : "Policy document is not attached yet.",
                      )
                    }
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                  {!p.acknowledged && (
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={acknowledgeMutation.isPending}
                      onClick={() => acknowledge(p)}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
