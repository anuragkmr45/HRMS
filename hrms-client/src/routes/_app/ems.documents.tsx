import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/ui-kit";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Download,
  Eye,
  RefreshCw,
  AlertCircle,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  documentsApi,
  mapApiDocuments,
  useDocumentDeleteMutation,
  useDocumentUploadPolicy,
} from "@/domains/documents";
import {
  type EmsDocumentUploadBody,
  useEmsDocumentMutation,
  useEmsEmployeeDocuments,
} from "@/domains/ems";
import { useAuth } from "@/lib/auth";
import { isUuid, pageItems, toastApiError, useApiRouteEnabled } from "@/shared/api";
import { queryKeys } from "@/shared/query";
import { prepareDocumentUploadFile, uploadPolicyAccept } from "@/shared/uploads/documents";

export const Route = createFileRoute("/_app/ems/documents")({
  component: MyDocuments,
});

type DocStatus = "uploaded" | "pending" | "verified" | "rejected" | "missing";

interface Doc {
  id: string;
  name: string;
  category: string;
  status: DocStatus;
  uploadedOn?: string;
  remarks?: string;
}

const DOCS: Doc[] = [
  {
    id: "d1",
    name: "Offer Letter",
    category: "Onboarding",
    status: "verified",
    uploadedOn: "14 Mar 2022",
  },
  {
    id: "d2",
    name: "ID Proof — Passport",
    category: "Identity",
    status: "verified",
    uploadedOn: "14 Mar 2022",
  },
  {
    id: "d3",
    name: "Address Proof — Aadhaar",
    category: "Identity",
    status: "pending",
    uploadedOn: "02 May 2026",
  },
  {
    id: "d4",
    name: "Education Certificate",
    category: "Education",
    status: "uploaded",
    uploadedOn: "14 Mar 2022",
  },
  {
    id: "d5",
    name: "Experience Certificate",
    category: "Experience",
    status: "rejected",
    uploadedOn: "16 Mar 2022",
    remarks: "Document scan unclear, please re-upload a higher resolution copy.",
  },
  { id: "d6", name: "PAN Card", category: "Identity", status: "missing" },
  {
    id: "d7",
    name: "Company Policies — Acknowledgement",
    category: "Compliance",
    status: "verified",
    uploadedOn: "20 Mar 2022",
  },
  { id: "d8", name: "Other Documents", category: "Other", status: "missing" },
];

function statusToBadge(s: DocStatus) {
  const map: Record<DocStatus, { status: string; label: string }> = {
    verified: { status: "completed", label: "Verified" },
    pending: { status: "pending", label: "Pending verification" },
    uploaded: { status: "in_progress", label: "Uploaded" },
    rejected: { status: "rejected", label: "Rejected" },
    missing: { status: "draft", label: "Not uploaded" },
  };
  const m = map[s];
  return <StatusBadge status={m.status} label={m.label} />;
}

function MyDocuments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled(["/ems", "/documents"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<Doc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const documentsQuery = useEmsEmployeeDocuments(user?.id, { page: 1, page_size: 100 }, apiEnabled);
  const uploadPolicyQuery = useDocumentUploadPolicy(apiEnabled);
  const uploadMutation = useEmsDocumentMutation(user?.id);
  const deleteMutation = useDocumentDeleteMutation();
  const docs = apiEnabled ? mapApiDocuments(pageItems(documentsQuery.data)) : DOCS;
  const loading = apiEnabled && documentsQuery.isLoading;
  const error = documentsQuery.error instanceof Error ? documentsQuery.error : null;

  async function downloadDocument(document: Doc) {
    if (!apiEnabled || !isUuid(document.id)) {
      toast.success("Download started");
      return;
    }
    try {
      const response = await documentsApi.createDownloadUrl(document.id);
      const url = typeof response.url === "string" ? response.url : "";
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("Download URL was not returned.");
    } catch {
      toast.error("Document download could not be started.");
    }
  }

  function requestDeleteDocument(document: Doc) {
    if (!apiEnabled || !isUuid(document.id)) {
      toast.message("Delete is available when documents are loaded from the backend.");
      return;
    }
    setDeleteTarget(document);
  }

  async function confirmDeleteDocument() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") });
      toast.success("Document deleted", { description: deleteTarget.name });
      setDeleteTarget(null);
    } catch (deleteError) {
      toastApiError(deleteError, "Document could not be deleted.");
    }
  }

  function startUpload(document?: Doc) {
    if (!apiEnabled) {
      toast.success(document ? "Replace flow" : "Upload dialog opened");
      return;
    }
    if (!user?.id) {
      toast.error("User session is not ready.");
      return;
    }
    setUploadTarget(document ?? null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function uploadSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const target = uploadTarget;
    try {
      const prepared = await prepareDocumentUploadFile(file, uploadPolicyQuery.data);
      const formData = new FormData();
      formData.set("file", prepared.file);
      formData.set("classification", classificationFor(target));
      formData.set("document_type", documentTypeFor(target));
      formData.set("file_name", prepared.file.name);
      formData.set("mime_type", prepared.file.type || "application/octet-stream");
      formData.set("size_bytes", String(prepared.file.size));
      if (target && isUuid(target.id)) {
        formData.set("replace_document_id", target.id);
      }
      await uploadMutation.mutateAsync(formData);
      toast.success(target ? "Replacement uploaded" : "Document uploaded", {
        description: `${prepared.file.name} is pending verification.`,
      });
      setUploadTarget(null);
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Document upload failed.");
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={uploadPolicyAccept(uploadPolicyQuery.data)}
        className="sr-only"
        onChange={(event) => void uploadSelectedFile(event)}
      />

      <div className="ems-tab-intro flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Upload, replace, and track verification status of your personal documents.
        </p>
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => startUpload()}
          disabled={apiEnabled && uploadMutation.isPending}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {apiEnabled && uploadMutation.isPending ? "Uploading" : "Upload document"}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Document data could not be loaded from the backend.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="ems-record-card h-48 animate-pulse rounded-2xl p-5" />
            ))
          : docs.map((d) => (
              <Card key={d.id} className="ems-record-card rounded-2xl p-5">
                <div className="flex items-start justify-between">
                  <div className="ems-record-icon">
                    <FileText className="h-5 w-5" />
                  </div>
                  {statusToBadge(d.status)}
                </div>
                <div className="mt-3">
                  <p className="text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.category}</p>
                  {d.uploadedOn && (
                    <p className="mt-1 text-xs text-muted-foreground">Uploaded: {d.uploadedOn}</p>
                  )}
                </div>
                {d.status === "rejected" && d.remarks && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{d.remarks}</span>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {d.status === "missing" || d.status === "rejected" ? (
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => startUpload(d)}
                      disabled={apiEnabled && uploadMutation.isPending}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => void downloadDocument(d)}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => void downloadDocument(d)}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => startUpload(d)}
                        disabled={apiEnabled && uploadMutation.isPending}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Replace
                      </Button>
                    </>
                  )}
                  {apiEnabled && d.status !== "missing" && isUuid(d.id) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-destructive hover:text-destructive"
                      onClick={() => requestDeleteDocument(d)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {deleteMutation.isPending && deleteMutation.variables === d.id
                        ? "Deleting"
                        : "Delete"}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
      </div>

      <DeleteDocumentDialog
        document={deleteTarget}
        busy={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDeleteDocument()}
      />
    </div>
  );
}

function DeleteDocumentDialog({
  document,
  busy,
  onOpenChange,
  onConfirm,
}: {
  document: Doc | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={Boolean(document)} onOpenChange={onOpenChange}>
      <AlertDialogContent className="overflow-hidden rounded-2xl border-destructive/20 p-0 shadow-2xl data-[state=open]:duration-300">
        <div className="relative border-b border-destructive/10 bg-gradient-to-br from-destructive/12 via-background to-primary-soft/50 p-6">
          <div className="absolute right-5 top-5 h-16 w-16 rounded-full bg-destructive/10 blur-2xl" />
          <AlertDialogHeader className="relative space-y-3 text-left">
            <div className="flex items-center gap-3">
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-destructive/15 text-destructive shadow-sm ring-1 ring-destructive/20">
                <span className="absolute inset-0 rounded-2xl animate-ping bg-destructive/10" />
                <Trash2 className="relative h-5 w-5" />
              </span>
              <div>
                <AlertDialogTitle className="text-xl">Delete document?</AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  This removes the uploaded file from storage and hides it from your document list.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Selected document
            </p>
            <p className="mt-2 break-words text-sm font-semibold">{document?.name ?? "Document"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {document?.category ?? "Employee document"}
            </p>
          </div>

          <div className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This action cannot be undone from the app. Upload the document again if it is needed
              later.
            </p>
          </div>
        </div>

        <AlertDialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
          <AlertDialogCancel disabled={busy} className="rounded-full">
            Keep document
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 transition hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Deleting..." : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function documentTypeFor(document: Doc | null): string {
  return slug(document?.category || document?.name || "employee_document");
}

function classificationFor(document: Doc | null): EmsDocumentUploadBody["classification"] {
  const value = `${document?.category ?? ""} ${document?.name ?? ""}`.toLowerCase();
  if (value.includes("medical")) return "medical";
  if (value.includes("compensation") || value.includes("salary") || value.includes("payroll")) {
    return "compensation";
  }
  if (value.includes("legal")) return "legal";
  if (value.includes("finance") || value.includes("tax")) return "finance";
  return "normal";
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "_")
      .replace(/^_+|_+$/gu, "")
      .slice(0, 80) || "employee_document"
  );
}
