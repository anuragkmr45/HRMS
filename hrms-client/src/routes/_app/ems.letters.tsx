import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/ui-kit";
import { toast } from "sonner";
import {
  mapLetter,
  useEmsLetterAcknowledgeMutation,
  useEmsLetters,
  useEmsRequestMutation,
} from "@/domains/ems";
import { pageItems, toastApiError, useApiRouteEnabled } from "@/shared/api";
import { FileSignature, Download, Send, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/ems/letters")({
  component: MyLetters,
});

interface Letter {
  id: string;
  name: string;
  description: string;
  status: "available" | "request" | "requested" | "in_progress" | "acknowledged";
  issuedOn?: string;
  expectedVersion?: number;
  documentId?: string;
}

const LETTERS: Letter[] = [
  {
    id: "L1",
    name: "Offer Letter",
    description: "Initial offer from Hawkaii",
    status: "available",
    issuedOn: "01 Mar 2022",
  },
  {
    id: "L2",
    name: "Appointment Letter",
    description: "Joining confirmation letter",
    status: "available",
    issuedOn: "14 Mar 2022",
  },
  {
    id: "L3",
    name: "Confirmation Letter",
    description: "Issued post probation completion",
    status: "available",
    issuedOn: "14 Sep 2022",
  },
  {
    id: "L4",
    name: "Experience Letter",
    description: "Employment evidence — request anytime",
    status: "request",
  },
  { id: "L5", name: "Relieving Letter", description: "Issued at exit only", status: "request" },
  {
    id: "L6",
    name: "Salary Certificate",
    description: "For loans, visas, account opening",
    status: "in_progress",
  },
];

function statusBadge(s: Letter["status"]) {
  if (s === "available") return <StatusBadge status="completed" label="Available" />;
  if (s === "acknowledged") return <StatusBadge status="completed" label="Acknowledged" />;
  if (s === "in_progress") return <StatusBadge status="in_progress" label="In progress" />;
  if (s === "requested") return <StatusBadge status="pending" label="Requested" />;
  return <StatusBadge status="draft" label="On request" />;
}

function MyLetters() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const lettersQuery = useEmsLetters({ page: 1, page_size: 25 }, apiEnabled);
  const acknowledgeMutation = useEmsLetterAcknowledgeMutation();
  const requestMutation = useEmsRequestMutation();
  const rows: Letter[] = apiEnabled
    ? pageItems(lettersQuery.data).map((item) => {
        const letter = mapLetter(item);
        return {
          id: letter.id,
          name: letter.title,
          description: letter.description,
          status: letter.status as Letter["status"],
          issuedOn: letter.issuedOn,
          expectedVersion: letter.expectedVersion,
          documentId: letter.documentId,
        };
      })
    : LETTERS;
  const requestLetter = (name: string) => {
    if (!apiEnabled) return toast.success("Letter request sent to HR");
    requestMutation.mutate(
      {
        request_type: "letter",
        subject: `${name} request`,
        description: `Please issue ${name}.`,
      },
      {
        onSuccess: () => toast.success("Letter request sent to HR"),
        onError: (error) => toastApiError(error, "Letter request could not be submitted."),
      },
    );
  };
  const acknowledge = (letter: Letter) => {
    if (!apiEnabled || !letter.expectedVersion) return toast.success("Letter acknowledged");
    acknowledgeMutation.mutate(
      { id: letter.id, expectedVersion: letter.expectedVersion },
      {
        onSuccess: () => toast.success("Letter acknowledged"),
        onError: (error) => toastApiError(error, "Letter could not be acknowledged."),
      },
    );
  };
  return (
    <div className="space-y-4 pt-4">
      <div className="ems-tab-intro p-4">
        <p className="text-sm font-medium">Letters and certificates</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Download issued letters or request new ones from HR.
        </p>
      </div>
      {apiEnabled && lettersQuery.error ? (
        <EmptyState
          title="Letters could not be loaded"
          description="The backend EMS letters API returned an error."
        />
      ) : null}
      {apiEnabled && lettersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading letters from backend...</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((l) => (
          <Card key={l.id} className="ems-record-card rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div className="ems-record-icon">
                <FileSignature className="h-5 w-5" />
              </div>
              {statusBadge(l.status)}
            </div>
            <div className="mt-3">
              <p className="text-sm font-semibold">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.description}</p>
              {l.issuedOn && (
                <p className="mt-1 text-xs text-muted-foreground">Issued: {l.issuedOn}</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {l.status === "available" || l.status === "acknowledged" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      toast(
                        l.documentId
                          ? "Opening preview..."
                          : "Letter document is not attached yet.",
                      )
                    }
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      toast(
                        l.documentId ? "Download started" : "Letter document is not attached yet.",
                      )
                    }
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={acknowledgeMutation.isPending || l.status === "acknowledged"}
                    onClick={() => acknowledge(l)}
                  >
                    Acknowledge
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={
                    l.status === "in_progress" ||
                    l.status === "requested" ||
                    requestMutation.isPending
                  }
                  onClick={() => requestLetter(l.name)}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {l.status === "in_progress" || l.status === "requested"
                    ? "Requested"
                    : "Request letter"}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
