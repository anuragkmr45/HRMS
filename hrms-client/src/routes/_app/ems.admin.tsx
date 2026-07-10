import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column, StatusBadge, EmptyState, StatCard } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { documentsApi, mapApiDocuments } from "@/domains/documents";
import {
  mapAdminChecklist,
  mapPolicy,
  mapProfileChange,
  mapProbationReview,
  mapRequest,
  useEmsAdminChecklistMutation,
  useEmsAdminExits,
  useEmsAdminOnboarding,
  useEmsAdminProbation,
  useEmsPolicyUpdateMutation,
  useEmsPolicies,
  useEmsProbationDecisionMutation,
  useEmsProfileDecisionMutation,
  useEmsRequestDecisionMutation,
  useHrEmsRequestQueue,
  useHrProfileChangeQueue,
} from "@/domains/ems";
import {
  isUuid,
  pageItems,
  toastApiError,
  useApiRouteEnabled,
  withApiFallback,
} from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { toast } from "sonner";
import {
  FileCheck2,
  UserCog,
  ClipboardList,
  BadgeCheck,
  LogOut,
  BookOpen,
  FileSignature,
  Check,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_app/ems/admin")({
  component: EmsAdmin,
});

const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];

interface DocRow {
  id: string;
  employee: string;
  doc: string;
  uploadedOn: string;
  status: string;
}
const DOC_QUEUE: DocRow[] = [
  {
    id: "D-501",
    employee: "Aryan Mehta",
    doc: "Address Proof",
    uploadedOn: "Today",
    status: "pending",
  },
  {
    id: "D-502",
    employee: "Fatima Noor",
    doc: "Education Certificate",
    uploadedOn: "Yesterday",
    status: "pending",
  },
  {
    id: "D-503",
    employee: "Jacob Owens",
    doc: "ID Proof — Passport",
    uploadedOn: "08 May",
    status: "pending",
  },
];

interface ProfRow {
  id: string;
  requestId?: string;
  employee: string;
  field: string;
  oldVal: string;
  newVal: string;
  raisedOn: string;
  status?: string;
  expectedVersion?: number;
}
const PROFILE_QUEUE: ProfRow[] = [
  {
    id: "P-201",
    employee: "Daniel Park",
    field: "Current address",
    oldVal: "Old St 12",
    newVal: "44 New Lane, BLR",
    raisedOn: "Today",
  },
  {
    id: "P-202",
    employee: "Aryan Mehta",
    field: "Phone",
    oldVal: "+91 90...",
    newVal: "+91 91...",
    raisedOn: "Yesterday",
  },
];

interface Onboard {
  id: string;
  name: string;
  status?: string;
  dueDate?: string;
  expectedVersion?: number;
  offer: boolean;
  docs: boolean;
  assets: boolean;
  access: boolean;
  orientation: boolean;
}
const ONBOARDING: Onboard[] = [
  {
    id: "local-onboarding-1",
    name: "Sneha Roy",
    status: "in_progress",
    dueDate: "—",
    offer: true,
    docs: true,
    assets: false,
    access: false,
    orientation: false,
  },
  {
    id: "local-onboarding-2",
    name: "Imran Ali",
    status: "pending",
    dueDate: "—",
    offer: true,
    docs: false,
    assets: false,
    access: false,
    orientation: false,
  },
];

interface Probation {
  id: string;
  employee: string;
  joining: string;
  due: string;
  status: string;
  extendedUntil?: string;
  expectedVersion?: number;
}
const PROBATION: Probation[] = [
  {
    id: "PB-12",
    employee: "Kabir Shah",
    joining: "14 Nov 2025",
    due: "14 May 2026",
    status: "pending",
  },
  {
    id: "PB-13",
    employee: "Lia Chen",
    joining: "01 Dec 2025",
    due: "01 Jun 2026",
    status: "pending",
  },
];

interface ExitRow {
  id: string;
  name: string;
  status?: string;
  expectedVersion?: number;
  clearance: boolean;
  assets: boolean;
  finance: boolean;
  letter: boolean;
  lwd: string;
}
const EXITS: ExitRow[] = [
  {
    id: "local-exit-1",
    name: "Vikram Reddy",
    status: "notice_period",
    clearance: true,
    assets: false,
    finance: false,
    letter: false,
    lwd: "31 May",
  },
];

interface LetterRow {
  id: string;
  requestId?: string;
  employee: string;
  type: string;
  raisedOn: string;
  status: string;
  expectedVersion?: number;
}
const LETTERS: LetterRow[] = [
  {
    id: "LR-401",
    employee: "Daniel Park",
    type: "Salary Certificate",
    raisedOn: "08 May",
    status: "in_progress",
  },
  {
    id: "LR-402",
    employee: "Fatima Noor",
    type: "Experience Letter",
    raisedOn: "06 May",
    status: "pending",
  },
];

interface PolicyRow {
  id: string;
  name: string;
  category?: string;
  version: string;
  updated: string;
  ack: string;
  status?: string;
  documentId?: string;
  expectedVersion?: number;
}

const POLICIES: PolicyRow[] = [
  {
    id: "local-policy-1",
    name: "Attendance policy",
    version: "v3.1",
    updated: "12 Jan 2026",
    ack: "94%",
  },
  {
    id: "local-policy-2",
    name: "Leave policy",
    version: "v4.0",
    updated: "01 Jun 2026",
    ack: "61%",
  },
  { id: "local-policy-3", name: "WFH policy", version: "v2.0", updated: "15 Mar 2026", ack: "88%" },
];

const ONBOARDING_STEPS: Array<
  [keyof Pick<Onboard, "offer" | "docs" | "assets" | "access" | "orientation">, string]
> = [
  ["offer", "Offer accepted"],
  ["docs", "Docs verified"],
  ["assets", "Assets allocated"],
  ["access", "Access provisioned"],
  ["orientation", "Orientation"],
];

const EXIT_STEPS: Array<
  [keyof Pick<ExitRow, "clearance" | "assets" | "finance" | "letter">, string]
> = [
  ["clearance", "Manager clearance"],
  ["assets", "Assets returned"],
  ["finance", "Finance settled"],
  ["letter", "Relieving letter"],
];

function isoDateAfterDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function bumpPolicyVersion(version: string) {
  const match = version.match(/^v?(\d+)(?:\.(\d+))?$/i);
  if (!match) return `${version} updated`;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? "0") + 1;
  return `v${major}.${minor}`;
}

function DocQueue() {
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled(["/ems", "/documents"]);
  const documentsQuery = useQuery({
    queryKey: queryKeys.list("documents", "verification-queue", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => mapApiDocuments(pageItems(await documentsApi.list({ page_size: 100 }))),
        () =>
          DOC_QUEUE.map((row) => ({
            id: row.id,
            name: row.doc,
            category: row.doc,
            status: row.status === "pending" ? ("pending" as const) : ("uploaded" as const),
            uploadedOn: row.uploadedOn,
            owner: row.employee,
            classification: "normal",
            businessObjectType: "employee",
            businessObjectId: "",
          })),
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.realtimeStaleMs,
  });
  const verifyMutation = useMutation({
    mutationFn: (id: string) => documentsApi.verify(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("documents") });
      toast.success("Document verified");
    },
    onError: (error) => toastApiError(error, "Document could not be verified."),
  });
  const rows: DocRow[] = apiEnabled
    ? (documentsQuery.data ?? [])
        .filter((document) => document.status !== "verified")
        .map((document) => ({
          id: document.id,
          employee: document.owner,
          doc: document.category,
          uploadedOn: document.uploadedOn ?? "—",
          status: document.status,
        }))
    : DOC_QUEUE;
  const cols: Column<DocRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    { key: "doc", header: "Document", render: (r) => <span className="font-medium">{r.doc}</span> },
    { key: "uploadedOn", header: "Uploaded", render: (r) => <>{r.uploadedOn}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "a",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            disabled={apiEnabled && (!isUuid(row.id) || verifyMutation.isPending)}
            onClick={() => {
              if (!apiEnabled || !isUuid(row.id)) {
                toast.success("Document verified");
                return;
              }
              verifyMutation.mutate(row.id);
            }}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            onClick={() => toast("Rejection note required")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      loading={apiEnabled && documentsQuery.isLoading}
      emptyTitle="No documents pending"
      emptyDescription={
        documentsQuery.error
          ? "Document verification queue could not be loaded from the backend."
          : "All visible documents are verified."
      }
    />
  );
}

function ProfileQueue() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const queueQuery = useHrProfileChangeQueue({ page: 1, page_size: 50 }, apiEnabled);
  const decisionMutation = useEmsProfileDecisionMutation();
  const rows: ProfRow[] = apiEnabled
    ? pageItems(queueQuery.data).map((item) => {
        const request = mapProfileChange(item);
        return {
          id: request.requestCode,
          requestId: request.id,
          employee: request.employee,
          field: request.field,
          oldVal: request.oldValue,
          newVal: request.newValue,
          raisedOn: request.raisedOn,
          status: request.status,
          expectedVersion: request.expectedVersion,
        };
      })
    : PROFILE_QUEUE;
  const decide = (row: ProfRow, decision: "approved" | "rejected") => {
    if (!apiEnabled || !row.requestId || !row.expectedVersion) {
      toast.success(decision === "approved" ? "Update approved" : "Update rejected");
      return;
    }
    decisionMutation.mutate(
      {
        id: row.requestId,
        input: {
          decision,
          expected_version: row.expectedVersion,
          remarks: decision === "rejected" ? "Rejected from EMS admin queue." : undefined,
        },
      },
      {
        onSuccess: () =>
          toast.success(decision === "approved" ? "Update approved" : "Update rejected"),
        onError: (error) => toastApiError(error, "Profile update decision could not be saved."),
      },
    );
  };
  const cols: Column<ProfRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    { key: "field", header: "Field", render: (r) => <>{r.field}</> },
    {
      key: "oldVal",
      header: "Current",
      render: (r) => <span className="text-muted-foreground">{r.oldVal}</span>,
    },
    {
      key: "newVal",
      header: "Requested",
      render: (r) => <span className="font-medium">{r.newVal}</span>,
    },
    { key: "raisedOn", header: "Raised", render: (r) => <>{r.raisedOn}</> },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status ?? "pending"} />,
    },
    {
      key: "a",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            disabled={decisionMutation.isPending || (apiEnabled && row.status !== "pending")}
            onClick={() => decide(row, "approved")}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            disabled={decisionMutation.isPending || (apiEnabled && row.status !== "pending")}
            onClick={() => decide(row, "rejected")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      loading={apiEnabled && queueQuery.isLoading}
      emptyTitle="No profile changes"
      emptyDescription={
        queueQuery.error
          ? "EMS profile queue could not be loaded from the backend."
          : "Submitted employee profile changes will appear here."
      }
    />
  );
}

function OnboardingChecklist() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const onboardingQuery = useEmsAdminOnboarding({ page: 1, page_size: 50 }, apiEnabled);
  const updateMutation = useEmsAdminChecklistMutation("onboarding");
  const rows: Onboard[] = apiEnabled
    ? pageItems(onboardingQuery.data).map((item) => {
        const row = mapAdminChecklist(item);
        return {
          id: row.id,
          name: row.employee,
          status: row.status,
          dueDate: row.dueDate,
          expectedVersion: row.expectedVersion,
          offer: row.checklist.offer ?? false,
          docs: row.checklist.docs ?? false,
          assets: row.checklist.assets ?? false,
          access: row.checklist.access ?? false,
          orientation: row.checklist.orientation ?? false,
        };
      })
    : ONBOARDING;
  const update = (
    row: Onboard,
    key: keyof Pick<Onboard, "offer" | "docs" | "assets" | "access" | "orientation">,
    checked: boolean,
    label: string,
  ) => {
    if (!apiEnabled || !isUuid(row.id) || !row.expectedVersion) {
      toast.success(`${label} updated`);
      return;
    }
    updateMutation.mutate(
      {
        id: row.id,
        input: { expected_version: row.expectedVersion, checklist: { [key]: checked } },
      },
      {
        onSuccess: () => toast.success(`${label} updated`),
        onError: (error) => toastApiError(error, "Onboarding checklist could not be updated."),
      },
    );
  };

  if (apiEnabled && onboardingQuery.isLoading) {
    return (
      <EmptyState title="Loading onboarding checklist" description="Fetching onboarding tasks." />
    );
  }
  if (apiEnabled && onboardingQuery.error) {
    return (
      <EmptyState
        title="Onboarding checklist unavailable"
        description="The onboarding queue could not be loaded from the backend."
      />
    );
  }
  if (!rows.length) {
    return (
      <EmptyState
        title="No onboarding tasks"
        description="New hire onboarding checklists will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((o) => (
        <Card key={o.name} className="ems-record-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{o.name}</p>
              <p className="text-xs text-muted-foreground">Due: {o.dueDate ?? "—"}</p>
            </div>
            <StatusBadge status={o.status ?? "in_progress"} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {ONBOARDING_STEPS.map(([k, label]) => (
              <label
                key={k}
                className="ems-check-item flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={o[k]}
                  disabled={updateMutation.isPending}
                  onCheckedChange={(checked) => update(o, k, checked === true, label)}
                />
                <span className={o[k] ? "" : "text-muted-foreground"}>{label}</span>
              </label>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ProbationQueue() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const probationQuery = useEmsAdminProbation({ page: 1, page_size: 50 }, apiEnabled);
  const decisionMutation = useEmsProbationDecisionMutation();
  const rows: Probation[] = apiEnabled
    ? pageItems(probationQuery.data).map((item) => {
        const row = mapProbationReview(item);
        return {
          id: row.id,
          employee: row.employee,
          joining: row.joining,
          due: row.due,
          status: row.status,
          extendedUntil: row.extendedUntil,
          expectedVersion: row.expectedVersion,
        };
      })
    : PROBATION;
  const decide = (row: Probation, decision: "confirmed" | "extended") => {
    if (!apiEnabled || !isUuid(row.id) || !row.expectedVersion) {
      toast.success(decision === "confirmed" ? "Confirmation issued" : "Probation extended");
      return;
    }
    decisionMutation.mutate(
      {
        id: row.id,
        input: {
          decision,
          expected_version: row.expectedVersion,
          extended_until: decision === "extended" ? isoDateAfterDays(30) : undefined,
          remarks:
            decision === "extended"
              ? "Probation extended from EMS admin queue."
              : "Probation confirmed from EMS admin queue.",
        },
      },
      {
        onSuccess: () =>
          toast.success(decision === "confirmed" ? "Confirmation issued" : "Probation extended"),
        onError: (error) => toastApiError(error, "Probation decision could not be saved."),
      },
    );
  };
  const cols: Column<Probation>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    { key: "joining", header: "Joining", render: (r) => <>{r.joining}</> },
    { key: "due", header: "Confirmation due", render: (r) => <>{r.due}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "a",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            disabled={
              decisionMutation.isPending ||
              (apiEnabled && !["pending", "extended"].includes(row.status))
            }
            onClick={() => decide(row, "confirmed")}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            disabled={decisionMutation.isPending || (apiEnabled && row.status !== "pending")}
            onClick={() => decide(row, "extended")}
          >
            Extend
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      loading={apiEnabled && probationQuery.isLoading}
      emptyTitle="No probation reviews"
      emptyDescription={
        probationQuery.error
          ? "Probation queue could not be loaded from the backend."
          : "Upcoming probation reviews will appear here."
      }
    />
  );
}

function ExitChecklist() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const exitsQuery = useEmsAdminExits({ page: 1, page_size: 50 }, apiEnabled);
  const updateMutation = useEmsAdminChecklistMutation("exit");
  const rows: ExitRow[] = apiEnabled
    ? pageItems(exitsQuery.data).map((item) => {
        const row = mapAdminChecklist(item);
        return {
          id: row.id,
          name: row.employee,
          status: row.status,
          expectedVersion: row.expectedVersion,
          clearance: row.checklist.clearance ?? false,
          assets: row.checklist.assets ?? false,
          finance: row.checklist.finance ?? false,
          letter: row.checklist.letter ?? false,
          lwd: row.dueDate,
        };
      })
    : EXITS;
  const update = (
    row: ExitRow,
    key: keyof Pick<ExitRow, "clearance" | "assets" | "finance" | "letter">,
    checked: boolean,
    label: string,
  ) => {
    if (!apiEnabled || !isUuid(row.id) || !row.expectedVersion) {
      toast.success(`${label} updated`);
      return;
    }
    updateMutation.mutate(
      {
        id: row.id,
        input: { expected_version: row.expectedVersion, checklist: { [key]: checked } },
      },
      {
        onSuccess: () => toast.success(`${label} updated`),
        onError: (error) => toastApiError(error, "Exit checklist could not be updated."),
      },
    );
  };

  if (apiEnabled && exitsQuery.isLoading) {
    return <EmptyState title="Loading exit checklist" description="Fetching exit tasks." />;
  }
  if (apiEnabled && exitsQuery.error) {
    return (
      <EmptyState
        title="Exit checklist unavailable"
        description="The exit queue could not be loaded from the backend."
      />
    );
  }
  if (!rows.length) {
    return (
      <EmptyState title="No exit tasks" description="Employee exit checklists will appear here." />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((e) => (
        <Card key={e.name} className="ems-record-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{e.name}</p>
              <p className="text-xs text-muted-foreground">Last working day: {e.lwd}</p>
            </div>
            <StatusBadge status={e.status ?? "notice_period"} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {EXIT_STEPS.map(([k, label]) => (
              <label
                key={k}
                className="ems-check-item flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={e[k]}
                  disabled={updateMutation.isPending}
                  onCheckedChange={(checked) => update(e, k, checked === true, label)}
                />
                <span className={e[k] ? "" : "text-muted-foreground"}>{label}</span>
              </label>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PolicyMgmt() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const policiesQuery = useEmsPolicies({ page: 1, page_size: 50 }, apiEnabled);
  const policyMutation = useEmsPolicyUpdateMutation();
  const rows: PolicyRow[] = apiEnabled
    ? pageItems(policiesQuery.data).map((item) => {
        const policy = mapPolicy(item);
        return {
          id: policy.id,
          name: policy.title,
          category: policy.category,
          version: policy.versionLabel,
          updated: policy.effectiveFrom,
          ack: policy.acknowledgementStatus,
          status: policy.status,
          documentId: policy.documentId,
          expectedVersion: policy.expectedVersion,
        };
      })
    : POLICIES;
  const publish = (policy: PolicyRow) => {
    if (!apiEnabled || !isUuid(policy.id) || !policy.expectedVersion) {
      toast.success("New version published");
      return;
    }
    policyMutation.mutate(
      {
        id: policy.id,
        input: {
          expected_version: policy.expectedVersion,
          title: policy.name,
          category: policy.category,
          version_label: bumpPolicyVersion(policy.version),
          effective_from: todayIsoDate(),
          document_id: policy.documentId || null,
          status: "active",
        },
      },
      {
        onSuccess: () => toast.success("New version published"),
        onError: (error) => toastApiError(error, "Policy version could not be published."),
      },
    );
  };

  if (apiEnabled && policiesQuery.isLoading) {
    return <EmptyState title="Loading policies" description="Fetching policy records." />;
  }
  if (apiEnabled && policiesQuery.error) {
    return (
      <EmptyState
        title="Policies unavailable"
        description="EMS policy records could not be loaded from the backend."
      />
    );
  }
  if (!rows.length) {
    return <EmptyState title="No policies" description="Published policies will appear here." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {rows.map((p) => (
        <Card key={p.name} className="ems-record-card rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.version} · Updated {p.updated}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
              {p.ack} acked
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full" disabled>
              Edit
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              disabled={policyMutation.isPending}
              onClick={() => publish(p)}
            >
              Publish version
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function LetterQueue() {
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const queueQuery = useHrEmsRequestQueue({ page: 1, page_size: 50, type: "letter" }, apiEnabled);
  const decisionMutation = useEmsRequestDecisionMutation();
  const rows: LetterRow[] = apiEnabled
    ? pageItems(queueQuery.data).map((item) => {
        const request = mapRequest(item);
        return {
          id: request.requestCode,
          requestId: request.id,
          employee: request.requester,
          type: request.subject,
          raisedOn: request.raisedOn,
          status: request.status,
          expectedVersion: request.expectedVersion,
        };
      })
    : LETTERS;
  const generate = (row: LetterRow) => {
    if (!apiEnabled || !row.requestId || !row.expectedVersion) {
      toast.success("Letter generated");
      return;
    }
    decisionMutation.mutate(
      {
        id: row.requestId,
        input: {
          decision: "approved",
          expected_version: row.expectedVersion,
          remarks: "Generated from EMS admin letter queue.",
        },
      },
      {
        onSuccess: () => toast.success("Letter generated"),
        onError: (error) => toastApiError(error, "Letter could not be generated."),
      },
    );
  };
  const cols: Column<LetterRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    {
      key: "type",
      header: "Letter type",
      render: (r) => <span className="font-medium">{r.type}</span>,
    },
    { key: "raisedOn", header: "Raised", render: (r) => <>{r.raisedOn}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "a",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            disabled={
              decisionMutation.isPending ||
              (apiEnabled && !["pending", "in_progress"].includes(row.status))
            }
            onClick={() => generate(row)}
          >
            Generate
          </Button>
          <Button size="sm" variant="outline" className="h-7 rounded-full" disabled>
            Send
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      loading={apiEnabled && queueQuery.isLoading}
      emptyTitle="No letters in queue"
      emptyDescription={
        queueQuery.error
          ? "EMS letter request queue could not be loaded from the backend."
          : "Employee letter requests will appear here."
      }
    />
  );
}

function EmsAdmin() {
  const { activeRole } = useAuth();
  const apiEnabled = useApiRouteEnabled(["/ems", "/documents"]);
  const canAccess = Boolean(activeRole && ADMIN_ROLES.includes(activeRole));
  const documentsCountQuery = useQuery({
    queryKey: queryKeys.list("documents", "verification-count", { page_size: 100 }),
    queryFn: () => documentsApi.list({ page: 1, page_size: 100 }),
    enabled: apiEnabled && canAccess,
    staleTime: queryTimings.realtimeStaleMs,
  });
  const profileCountQuery = useHrProfileChangeQueue(
    { page: 1, page_size: 1 },
    apiEnabled && canAccess,
  );
  const probationCountQuery = useEmsAdminProbation(
    { page: 1, page_size: 1 },
    apiEnabled && canAccess,
  );
  const letterCountQuery = useHrEmsRequestQueue(
    { page: 1, page_size: 1, type: "letter" },
    apiEnabled && canAccess,
  );
  if (!activeRole || !ADMIN_ROLES.includes(activeRole)) return <Navigate to="/ems" />;
  const docsToVerify = apiEnabled
    ? mapApiDocuments(pageItems(documentsCountQuery.data)).filter(
        (document) => document.status !== "verified",
      ).length
    : DOC_QUEUE.length;
  const profileUpdates = apiEnabled ? (profileCountQuery.data?.total ?? 0) : PROFILE_QUEUE.length;
  const probationDue = apiEnabled ? (probationCountQuery.data?.total ?? 0) : PROBATION.length;
  const lettersInQueue = apiEnabled ? (letterCountQuery.data?.total ?? 0) : LETTERS.length;

  return (
    <div className="space-y-4 pt-4">
      <div className="ems-tab-intro p-4">
        <p className="text-sm font-medium">People operations command center</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational queues for the people-ops team.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Docs to verify"
          value={docsToVerify}
          icon={FileCheck2}
          tone="warning"
          className="ems-kpi-card"
        />
        <StatCard
          label="Profile updates"
          value={profileUpdates}
          icon={UserCog}
          tone="info"
          className="ems-kpi-card"
        />
        <StatCard
          label="Probation due"
          value={probationDue}
          icon={BadgeCheck}
          tone="primary"
          className="ems-kpi-card"
        />
        <StatCard
          label="Letters in queue"
          value={lettersInQueue}
          icon={FileSignature}
          tone="success"
          className="ems-kpi-card"
        />
      </div>

      <Tabs defaultValue="docs">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="docs">
            <FileCheck2 className="mr-1.5 h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="profile">
            <UserCog className="mr-1.5 h-4 w-4" />
            Profile updates
          </TabsTrigger>
          <TabsTrigger value="onboard">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Onboarding
          </TabsTrigger>
          <TabsTrigger value="probation">
            <BadgeCheck className="mr-1.5 h-4 w-4" />
            Probation
          </TabsTrigger>
          <TabsTrigger value="exit">
            <LogOut className="mr-1.5 h-4 w-4" />
            Exits
          </TabsTrigger>
          <TabsTrigger value="policy">
            <BookOpen className="mr-1.5 h-4 w-4" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="letter">
            <FileSignature className="mr-1.5 h-4 w-4" />
            Letters
          </TabsTrigger>
        </TabsList>
        <TabsContent value="docs" className="mt-4">
          {DOC_QUEUE.length ? <DocQueue /> : <EmptyState title="No documents pending" />}
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          {PROFILE_QUEUE.length ? <ProfileQueue /> : <EmptyState title="No profile changes" />}
        </TabsContent>
        <TabsContent value="onboard" className="mt-4">
          <OnboardingChecklist />
        </TabsContent>
        <TabsContent value="probation" className="mt-4">
          <ProbationQueue />
        </TabsContent>
        <TabsContent value="exit" className="mt-4">
          <ExitChecklist />
        </TabsContent>
        <TabsContent value="policy" className="mt-4">
          <PolicyMgmt />
        </TabsContent>
        <TabsContent value="letter" className="mt-4">
          <LetterQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}
