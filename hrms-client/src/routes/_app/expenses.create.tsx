import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useExpenseMetadata } from "@/domains/expenses";
import { useIndiaLocations } from "@/domains/locations";
import { useDocumentUploadPolicy } from "@/domains/documents";
import { asArray, asRecord, text, toastApiError } from "@/shared/api";
import {
  useExpenses,
  fmtCurrency,
  type LineItem,
  type ExpenseType,
  type PaymentType,
  type Priority,
} from "@/lib/expenses-store";
import { StepperForm, DataCard } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ChevronsUpDown, FileText, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { prepareDocumentUploadFile, uploadPolicyAccept } from "@/shared/uploads/documents";

interface SearchParams {
  step?: number;
}

const EXPENSE_CREATE_STEP_COUNT = 5;
const EXPENSE_CREATE_DRAFT_KEY = "hawkaii_expense_create_draft_v1";

const toSearchStep = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  const step = Math.trunc(parsed);
  if (step < 1 || step > EXPENSE_CREATE_STEP_COUNT) return undefined;
  return step;
};

export const Route = createFileRoute("/_app/expenses/create")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    step: toSearchStep(s.step),
  }),
  component: CreateExpense,
});

interface FormState {
  expenseType: ExpenseType;
  subType: string;
  taskTitle: string;
  taskDescription: string;
  startDate: string;
  endDate: string;
  location: string;
  estimatedAmount: number;
  paymentType: PaymentType;
  priority: Priority;
  remarks: string;
  // project
  projectCode: string;
  projectName: string;
  projectManager: string;
  costCenter: string;
  projectExpenseType: "travel" | "material" | "lodging" | "misc";
  // sales
  client: string;
  opportunity: string;
  meetingType: string;
  salesOwner: string;
  expectedOutcome: string;
  lineItems: LineItem[];
  documents: {
    id: string;
    name: string;
    kind: "bill" | "receipt" | "ticket" | "hotel" | "vendor" | "other";
  }[];
}

const initial: FormState = {
  expenseType: "project",
  subType: "",
  taskTitle: "",
  taskDescription: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  location: "",
  estimatedAmount: 0,
  paymentType: "reimbursement",
  priority: "normal",
  remarks: "",
  projectCode: "",
  projectName: "",
  projectManager: "",
  costCenter: "",
  projectExpenseType: "travel",
  client: "",
  opportunity: "",
  meetingType: "Discovery",
  salesOwner: "",
  expectedOutcome: "",
  lineItems: [
    {
      id: "li1",
      category: "",
      description: "",
      quantity: 1,
      unitCost: 0,
      taxAmount: 0,
      vendor: "",
    },
  ],
  documents: [],
};

interface StoredExpenseDraft {
  form: FormState;
  step: number;
  savedAt: string;
}

interface LocationOption {
  value: string;
  label: string;
  code: string;
  city: string;
  state: string;
  country: string;
  description: string;
}

const createInitialForm = (): FormState => ({
  ...initial,
  lineItems: initial.lineItems.map((item) => ({ ...item })),
  documents: [],
});

const clampStepIndex = (step: unknown): number => {
  const parsed =
    typeof step === "number" ? step : typeof step === "string" ? Number(step) : Number.NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(EXPENSE_CREATE_STEP_COUNT - 1, Math.max(0, Math.trunc(parsed)));
};

const draftStorageKey = (userId?: string) => `${EXPENSE_CREATE_DRAFT_KEY}:${userId ?? "guest"}`;

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatIndianAmountInput = (value: number) => {
  if (!value) return "";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
};

const parseIndianAmountInput = (value: string) => {
  const sanitized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const [wholePart, ...decimalParts] = sanitized.split(".");
  const decimalPart = decimalParts.join("").slice(0, 2);
  const normalized = decimalParts.length ? `${wholePart}.${decimalPart}` : wholePart;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLineItems = (value: unknown): LineItem[] => {
  const items = asArray(value)
    .map((item, index) => {
      const record = asRecord(item);
      return {
        id: text(record.id) || `li${index + 1}`,
        category: text(record.category),
        description: text(record.description),
        quantity: Math.max(0, toNumber(record.quantity, 1)),
        unitCost: Math.max(0, toNumber(record.unitCost, 0)),
        taxAmount: Math.max(0, toNumber(record.taxAmount, 0)),
        vendor: text(record.vendor),
      };
    })
    .filter((item) => item.id);

  return items.length ? items : createInitialForm().lineItems;
};

const normalizeDocuments = (value: unknown): FormState["documents"] =>
  asArray(value)
    .map((item, index) => {
      const record = asRecord(item);
      const kind = text(record.kind);
      return {
        id: text(record.id) || `d${index + 1}`,
        name: text(record.name),
        kind: ["bill", "receipt", "ticket", "hotel", "vendor", "other"].includes(kind)
          ? (kind as FormState["documents"][number]["kind"])
          : "other",
      };
    })
    .filter((item) => item.name);

const normalizeDraftForm = (value: unknown): FormState => {
  const record = asRecord(value);
  const expenseType = text(record.expenseType);
  const paymentType = text(record.paymentType);
  const priority = text(record.priority);
  const projectExpenseType = text(record.projectExpenseType);

  return {
    ...createInitialForm(),
    expenseType:
      expenseType === "sales_presales" || expenseType === "project"
        ? (expenseType as ExpenseType)
        : initial.expenseType,
    subType: text(record.subType),
    taskTitle: text(record.taskTitle),
    taskDescription: text(record.taskDescription),
    startDate: text(record.startDate) || initial.startDate,
    endDate: text(record.endDate) || initial.endDate,
    location: text(record.location),
    estimatedAmount: Math.max(0, toNumber(record.estimatedAmount, 0)),
    paymentType:
      paymentType === "advance" || paymentType === "reimbursement"
        ? (paymentType as PaymentType)
        : initial.paymentType,
    priority: ["low", "normal", "high", "urgent"].includes(priority)
      ? (priority as Priority)
      : initial.priority,
    remarks: text(record.remarks),
    projectCode: text(record.projectCode),
    projectName: text(record.projectName),
    projectManager: text(record.projectManager),
    costCenter: text(record.costCenter),
    projectExpenseType: ["travel", "material", "lodging", "misc"].includes(projectExpenseType)
      ? (projectExpenseType as FormState["projectExpenseType"])
      : initial.projectExpenseType,
    client: text(record.client),
    opportunity: text(record.opportunity),
    meetingType: text(record.meetingType) || initial.meetingType,
    salesOwner: text(record.salesOwner),
    expectedOutcome: text(record.expectedOutcome),
    lineItems: normalizeLineItems(record.lineItems),
    documents: normalizeDocuments(record.documents),
  };
};

const readStoredDraft = (userId?: string): StoredExpenseDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    return {
      form: normalizeDraftForm(record.form),
      step: clampStepIndex(record.step),
      savedAt: text(record.savedAt) || new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeStoredDraft = (userId: string | undefined, form: FormState, step: number) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    draftStorageKey(userId),
    JSON.stringify({
      form,
      step: clampStepIndex(step),
      savedAt: new Date().toISOString(),
    }),
  );
};

const clearStoredDraft = (userId?: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftStorageKey(userId));
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}

function locationOptionsFromResponse(data: unknown): LocationOption[] {
  return asArray(data)
    .map((item) => {
      const record = asRecord(item);
      const label = text(record.label || record.name || record.value);
      return {
        value: text(record.value || record.name || record.label),
        label,
        code: text(record.code),
        city: text(record.city),
        state: text(record.state),
        country: text(record.country),
        description: text(record.description),
      };
    })
    .filter((option): option is LocationOption => Boolean(option.value && option.label));
}

function CreateExpense() {
  const { user } = useAuth();
  const { add } = useExpenses();
  const metadataQuery = useExpenseMetadata();
  const uploadPolicyQuery = useDocumentUploadPolicy();
  const nav = useNavigate();
  const search = Route.useSearch();
  const [f, setF] = useState<FormState>(
    () => readStoredDraft(user?.id)?.form ?? createInitialForm(),
  );
  const [activeStep, setActiveStepState] = useState(() =>
    clampStepIndex(search.step ? search.step - 1 : readStoredDraft(user?.id)?.step),
  );
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocumentKind, setPendingDocumentKind] =
    useState<FormState["documents"][number]["kind"]>("other");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const debouncedLocationSearch = useDebouncedValue(locationSearch.trim(), 250);
  const shouldSearchLocations = locationPickerOpen && debouncedLocationSearch.length > 0;
  const defaultLocationQuery = useIndiaLocations({ limit: 30 }, locationPickerOpen);
  const locationSearchQuery = useIndiaLocations(
    { search: debouncedLocationSearch, limit: 30 },
    shouldSearchLocations,
  );
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const draft = readStoredDraft(user?.id);
    if (!draft) return;
    setF(draft.form);
    setActiveStepState(draft.step);
  }, [user?.id]);

  useEffect(() => {
    if (search.step) {
      setActiveStepState(clampStepIndex(search.step - 1));
    }
  }, [search.step]);

  useEffect(() => {
    writeStoredDraft(user?.id, f, activeStep);
  }, [activeStep, f, user?.id]);

  useEffect(() => {
    if (!search.step) {
      void nav({
        to: "/expenses/create",
        search: { step: activeStep + 1 },
        replace: true,
      });
    }
  }, [activeStep, nav, search.step]);

  const setActiveStep = (step: number) => {
    const nextStep = clampStepIndex(step);
    setActiveStepState(nextStep);
    void nav({
      to: "/expenses/create",
      search: { step: nextStep + 1 },
      replace: true,
    });
  };

  const metadataSubTypes = useMemo(
    () =>
      asArray(asRecord(metadataQuery.data).expense_sub_types)
        .map((item) => asRecord(item))
        .filter((item) =>
          f.expenseType === "sales_presales"
            ? text(item.expense_type) === "SalesPreSales"
            : text(item.expense_type) === "Project",
        )
        .map((item) => text(item.value || item.label))
        .filter(Boolean),
    [f.expenseType, metadataQuery.data],
  );
  const projectExpenseTypeOptions = useMemo(
    () =>
      asArray(asRecord(metadataQuery.data).project_expense_types)
        .map((item) => asRecord(item))
        .map((item) => ({
          value: text(item.value),
          label: text(item.label || item.value),
        }))
        .filter((item): item is { value: FormState["projectExpenseType"]; label: string } =>
          ["travel", "material", "lodging", "misc"].includes(item.value),
        ),
    [metadataQuery.data],
  );
  const defaultLocationOptions = useMemo(
    () => locationOptionsFromResponse(defaultLocationQuery.data),
    [defaultLocationQuery.data],
  );
  const searchedLocationOptions = useMemo(
    () => locationOptionsFromResponse(locationSearchQuery.data),
    [locationSearchQuery.data],
  );
  const locationOptions = shouldSearchLocations ? searchedLocationOptions : defaultLocationOptions;
  const locationLoading =
    defaultLocationQuery.isLoading ||
    (shouldSearchLocations && (locationSearchQuery.isLoading || locationSearchQuery.isFetching));
  const locationError =
    (shouldSearchLocations && locationSearchQuery.error instanceof Error
      ? locationSearchQuery.error.message
      : "") ||
    (defaultLocationQuery.error instanceof Error ? defaultLocationQuery.error.message : "");

  const total = f.lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0);

  const updateLi = (id: string, patch: Partial<LineItem>) =>
    set(
      "lineItems",
      f.lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)),
    );
  const addLi = () =>
    set("lineItems", [
      ...f.lineItems,
      {
        id: `li${Date.now()}`,
        category: "",
        description: "",
        quantity: 1,
        unitCost: 0,
        taxAmount: 0,
        vendor: "",
      },
    ]);
  const delLi = (id: string) =>
    set(
      "lineItems",
      f.lineItems.filter((li) => li.id !== id),
    );

  const submit = async (asDraft: boolean) => {
    if (!asDraft && (!f.taskTitle || !f.subType)) {
      toast.error("Please complete the basics before submitting.");
      return;
    }
    try {
      await add({
        employee: user?.name ?? "You",
        employeeId: "self",
        department: user?.department ?? "General",
        manager: "Sara Iqbal",
        expenseType: f.expenseType,
        subType: f.subType,
        taskTitle: f.taskTitle,
        taskDescription: f.taskDescription,
        startDate: f.startDate,
        endDate: f.endDate,
        location: f.location,
        estimatedAmount: f.estimatedAmount,
        paymentType: f.paymentType,
        priority: f.priority,
        remarks: f.remarks,
        project:
          f.expenseType === "project"
            ? {
                projectCode: f.projectCode || "PRJ-GEN",
                projectName: f.projectName || "General",
                projectManager: f.projectManager || "Sara Iqbal",
                costCenter: f.costCenter.trim(),
                projectExpenseType: f.projectExpenseType,
              }
            : undefined,
        sales:
          f.expenseType === "sales_presales"
            ? {
                client: f.client,
                opportunity: f.opportunity,
                meetingType: f.meetingType,
                salesOwner: f.salesOwner || (user?.name ?? "You"),
                expectedOutcome: f.expectedOutcome,
              }
            : undefined,
        lineItems: f.lineItems,
        documents: f.documents.map((d) => ({ ...d, uploadedAt: new Date().toISOString() })),
        status: asDraft ? "draft" : "pending_manager",
        submittedAt: asDraft ? undefined : new Date().toISOString(),
      });
      clearStoredDraft(user?.id);
      toast.success(asDraft ? "Saved as draft" : "Ticket submitted for manager verification");
      nav({ to: "/expenses/my" });
    } catch (error) {
      toastApiError(
        error,
        asDraft ? "Draft could not be saved." : "Expense could not be submitted.",
      );
    }
  };

  const startDocumentUpload = (kind: FormState["documents"][number]["kind"]) => {
    setPendingDocumentKind(kind);
    if (documentInputRef.current) {
      documentInputRef.current.value = "";
      documentInputRef.current.click();
    }
  };

  const attachSelectedDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const prepared = await prepareDocumentUploadFile(file, uploadPolicyQuery.data);
      set("documents", [
        ...f.documents,
        {
          id: `d${Date.now()}`,
          name: prepared.file.name,
          kind: pendingDocumentKind,
        },
      ]);
      if (prepared.compressed) {
        toast.success("Image compressed", {
          description: `${file.name} was prepared for upload.`,
        });
      }
    } catch (error) {
      toastApiError(error, "Selected file could not be prepared.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-info/10 p-3 text-xs text-info">
        <strong>No self-processing policy:</strong> Once submitted, your manager (
        <span className="font-medium">Sara Iqbal</span>) verifies it before finance can approve or
        pay.
      </div>
      <StepperForm
        activeStep={activeStep}
        onStepChange={setActiveStep}
        completeLabel="Submit ticket"
        onComplete={() => void submit(false)}
        steps={[
          {
            title: "Basic Details",
            description: "Title, dates, amount",
            content: (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Expense Type">
                  <Select
                    value={f.expenseType}
                    onValueChange={(v) => set("expenseType", v as ExpenseType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="sales_presales">Sales / Pre-Sales</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Expense Sub-Type">
                  <Input
                    list="expense-sub-type-options"
                    value={f.subType}
                    onChange={(e) => set("subType", e.target.value)}
                    placeholder="e.g. Travel, Software"
                  />
                  {metadataSubTypes.length > 0 && (
                    <datalist id="expense-sub-type-options">
                      {metadataSubTypes.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  )}
                </Field>
                <Field label="Task Title" className="md:col-span-2">
                  <Input
                    value={f.taskTitle}
                    onChange={(e) => set("taskTitle", e.target.value)}
                    placeholder="Short summary"
                  />
                </Field>
                <Field label="Task Description" className="md:col-span-2">
                  <Textarea
                    rows={3}
                    value={f.taskDescription}
                    onChange={(e) => set("taskDescription", e.target.value)}
                  />
                </Field>
                <Field label="Start Date">
                  <Input
                    type="date"
                    value={f.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                  />
                </Field>
                <Field label="End Date">
                  <Input
                    type="date"
                    value={f.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                  />
                </Field>
                <Field label="Location">
                  <LocationCombobox
                    value={f.location}
                    options={locationOptions}
                    open={locationPickerOpen}
                    onOpenChange={setLocationPickerOpen}
                    search={locationSearch}
                    onSearchChange={setLocationSearch}
                    loading={locationLoading}
                    error={locationError}
                    onRefresh={() => {
                      if (shouldSearchLocations) void locationSearchQuery.refetch();
                      else void defaultLocationQuery.refetch();
                    }}
                    onChange={(value) => set("location", value)}
                  />
                </Field>
                <Field label="Estimated Amount (INR)">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      🇮🇳 ₹
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={formatIndianAmountInput(f.estimatedAmount)}
                      onChange={(e) =>
                        set("estimatedAmount", parseIndianAmountInput(e.target.value))
                      }
                      placeholder="0"
                      className="pl-14 pr-14 text-right"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                      INR
                    </span>
                  </div>
                </Field>
                <Field label="Payment Type">
                  <Select
                    value={f.paymentType}
                    onValueChange={(v) => set("paymentType", v as PaymentType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reimbursement">Reimbursement</SelectItem>
                      <SelectItem value="advance">Advance</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select value={f.priority} onValueChange={(v) => set("priority", v as Priority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["low", "normal", "high", "urgent"].map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Remarks" className="md:col-span-2">
                  <Textarea
                    rows={2}
                    value={f.remarks}
                    onChange={(e) => set("remarks", e.target.value)}
                  />
                </Field>
              </div>
            ),
          },
          {
            title: "Conditional Details",
            description: f.expenseType === "project" ? "Project info" : "Sales context",
            content:
              f.expenseType === "project" ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Project Code">
                    <Input
                      value={f.projectCode}
                      onChange={(e) => set("projectCode", e.target.value)}
                      placeholder="PRJ-XXXX"
                    />
                  </Field>
                  <Field label="Project Name">
                    <Input
                      value={f.projectName}
                      onChange={(e) => set("projectName", e.target.value)}
                    />
                  </Field>
                  <Field label="Project Manager">
                    <Input
                      value={f.projectManager}
                      onChange={(e) => set("projectManager", e.target.value)}
                    />
                  </Field>
                  <Field label="Cost Center (optional)">
                    <Input
                      value={f.costCenter}
                      onChange={(e) => set("costCenter", e.target.value)}
                      placeholder="Optional finance/reporting bucket"
                    />
                  </Field>
                  <Field label="Project Expense Type" className="md:col-span-2">
                    <Select
                      value={f.projectExpenseType}
                      onValueChange={(v) =>
                        set("projectExpenseType", v as FormState["projectExpenseType"])
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(projectExpenseTypeOptions.length
                          ? projectExpenseTypeOptions
                          : ["travel", "material", "lodging", "misc"].map((value) => ({
                              value: value as FormState["projectExpenseType"],
                              label: value,
                            }))
                        ).map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Client / Prospect">
                    <Input value={f.client} onChange={(e) => set("client", e.target.value)} />
                  </Field>
                  <Field label="Opportunity / Campaign">
                    <Input
                      value={f.opportunity}
                      onChange={(e) => set("opportunity", e.target.value)}
                    />
                  </Field>
                  <Field label="Meeting Type">
                    <Select value={f.meetingType} onValueChange={(v) => set("meetingType", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Discovery", "Demo", "Pitch", "Negotiation", "Event", "Workshop"].map(
                          (p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Sales Owner">
                    <Input
                      value={f.salesOwner}
                      onChange={(e) => set("salesOwner", e.target.value)}
                    />
                  </Field>
                  <Field label="Expected Outcome" className="md:col-span-2">
                    <Textarea
                      rows={2}
                      value={f.expectedOutcome}
                      onChange={(e) => set("expectedOutcome", e.target.value)}
                    />
                  </Field>
                </div>
              ),
          },
          {
            title: "Line Items",
            description: "Categories & vendors",
            content: (
              <div className="space-y-3">
                <div className="space-y-3 md:hidden">
                  {f.lineItems.map((li, index) => (
                    <Card key={li.id} className="space-y-3 rounded-xl border-border/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">Line item {index + 1}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => delLi(li.id)}
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Field label="Category">
                        <Input
                          value={li.category}
                          onChange={(e) => updateLi(li.id, { category: e.target.value })}
                          className="h-9"
                        />
                      </Field>
                      <Field label="Description">
                        <Input
                          value={li.description}
                          onChange={(e) => updateLi(li.id, { description: e.target.value })}
                          className="h-9"
                        />
                      </Field>
                      <Field label="Vendor">
                        <Input
                          value={li.vendor}
                          onChange={(e) => updateLi(li.id, { vendor: e.target.value })}
                          className="h-9"
                        />
                      </Field>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Qty">
                          <Input
                            type="number"
                            value={li.quantity}
                            onChange={(e) => updateLi(li.id, { quantity: Number(e.target.value) })}
                            className="h-9 text-right"
                          />
                        </Field>
                        <Field label="Unit Cost">
                          <Input
                            type="number"
                            value={li.unitCost || ""}
                            onChange={(e) => updateLi(li.id, { unitCost: Number(e.target.value) })}
                            className="h-9 text-right"
                          />
                        </Field>
                      </div>
                      <div className="rounded-lg bg-secondary/40 p-3 text-right text-sm">
                        <span className="text-muted-foreground">Total </span>
                        <span className="font-semibold">
                          {fmtCurrency(li.quantity * li.unitCost)}
                        </span>
                      </div>
                    </Card>
                  ))}
                  <div className="rounded-xl border bg-secondary/30 p-3 text-right text-sm">
                    <span className="text-muted-foreground">Total </span>
                    <span className="font-semibold">{fmtCurrency(total)}</span>
                  </div>
                </div>
                <div className="hidden overflow-x-auto rounded-xl border md:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-secondary/40 text-xs">
                      <tr>
                        <th className="p-2 text-left">Category</th>
                        <th className="p-2 text-left">Description</th>
                        <th className="p-2 text-left">Vendor</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Unit Cost</th>
                        <th className="p-2 text-right">Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {f.lineItems.map((li) => (
                        <tr key={li.id} className="border-t">
                          <td className="p-1.5">
                            <Input
                              value={li.category}
                              onChange={(e) => updateLi(li.id, { category: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              value={li.description}
                              onChange={(e) => updateLi(li.id, { description: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              value={li.vendor}
                              onChange={(e) => updateLi(li.id, { vendor: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              value={li.quantity}
                              onChange={(e) =>
                                updateLi(li.id, { quantity: Number(e.target.value) })
                              }
                              className="h-8 w-20 text-right"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              value={li.unitCost || ""}
                              onChange={(e) =>
                                updateLi(li.id, { unitCost: Number(e.target.value) })
                              }
                              className="h-8 w-28 text-right"
                            />
                          </td>
                          <td className="p-2 text-right font-medium">
                            {fmtCurrency(li.quantity * li.unitCost)}
                          </td>
                          <td className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => delLi(li.id)}
                              className="h-8 w-8 text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-secondary/30">
                        <td colSpan={5} className="p-2 text-right text-xs text-muted-foreground">
                          Total
                        </td>
                        <td className="p-2 text-right font-semibold">{fmtCurrency(total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <Button variant="outline" size="sm" onClick={addLi} className="rounded-full">
                  <Plus className="mr-1 h-4 w-4" /> Add line item
                </Button>
              </div>
            ),
          },
          {
            title: "Documents",
            description: "Attach proofs",
            content: (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                <input
                  ref={documentInputRef}
                  type="file"
                  accept={uploadPolicyAccept(uploadPolicyQuery.data)}
                  className="sr-only"
                  onChange={(event) => void attachSelectedDocument(event)}
                />
                {[
                  { kind: "bill" as const, label: "Bills" },
                  { kind: "receipt" as const, label: "Receipts" },
                  { kind: "ticket" as const, label: "Tickets" },
                  { kind: "hotel" as const, label: "Hotel invoice" },
                  { kind: "vendor" as const, label: "Vendor invoice" },
                  { kind: "other" as const, label: "Supporting docs" },
                ].map((u) => (
                  <Card key={u.kind} className="rounded-xl border-dashed p-4 text-center">
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                      <Upload className="h-4 w-4" />
                    </div>
                    <p className="mt-2 text-sm font-medium">{u.label}</p>
                    <p className="text-xs text-muted-foreground">Click to upload</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 rounded-full"
                      onClick={() => startDocumentUpload(u.kind)}
                    >
                      Add file
                    </Button>
                  </Card>
                ))}
                {f.documents.length > 0 && (
                  <div className="col-span-full">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">Attached</p>
                    <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {f.documents.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                        >
                          <FileText className="h-4 w-4 text-primary" />{" "}
                          <span className="flex-1 truncate">{d.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              set(
                                "documents",
                                f.documents.filter((x) => x.id !== d.id),
                              )
                            }
                            className="h-7 w-7 text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ),
          },
          {
            title: "Review & Submit",
            description: "Confirm details",
            content: (
              <div className="space-y-3">
                <DataCard title="Summary" padded>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 md:grid-cols-3">
                    <Info
                      k="Type"
                      v={f.expenseType === "project" ? "Project" : "Sales / Pre-Sales"}
                    />
                    <Info k="Sub-Type" v={f.subType || "—"} />
                    <Info k="Title" v={f.taskTitle || "—"} />
                    <Info k="Dates" v={`${f.startDate} → ${f.endDate}`} />
                    <Info k="Payment" v={f.paymentType} />
                    <Info k="Priority" v={f.priority} />
                    <Info k="Line items" v={String(f.lineItems.length)} />
                    <Info k="Documents" v={String(f.documents.length)} />
                    <Info
                      k="Total"
                      v={
                        <span className="font-semibold text-foreground">{fmtCurrency(total)}</span>
                      }
                    />
                  </dl>
                </DataCard>
                <Button
                  variant="outline"
                  onClick={() => void submit(true)}
                  className="rounded-full"
                >
                  Save as draft
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function LocationCombobox({
  value,
  options,
  open,
  onOpenChange,
  search,
  onSearchChange,
  loading,
  error,
  onRefresh,
  onChange,
}: {
  value: string;
  options: LocationOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (search: string) => void;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);
  const displayValue = selected?.label || value;
  const didRefreshForOpenRef = useRef(false);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      [
        option.label,
        option.value,
        option.code,
        option.city,
        option.state,
        option.country,
        option.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [options, search]);

  useEffect(() => {
    if (!open) {
      didRefreshForOpenRef.current = false;
      return;
    }
    if (loading || options.length > 0 || didRefreshForOpenRef.current) return;
    didRefreshForOpenRef.current = true;
    onRefresh();
  }, [loading, onRefresh, open, options.length]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) onSearchChange("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between rounded-md border-input bg-background px-3 font-normal"
        >
          <span className={displayValue ? "truncate" : "truncate text-muted-foreground"}>
            {displayValue || (loading ? "Loading locations..." : "Select location")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={onSearchChange}
            placeholder="Search city, state, or country..."
            className="h-9 rounded-none border-0 px-0 py-2 shadow-none outline-none ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <CommandList>
            <CommandEmpty>
              {error
                ? "Could not load locations. Please try again."
                : loading
                  ? "Loading locations..."
                  : options.length
                    ? "No matching location found."
                    : "No active location found."}
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    onOpenChange(false);
                    onSearchChange("");
                  }}
                >
                  <Check
                    className={`h-4 w-4 ${option.value === value ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {(option.city || option.state || option.country || option.description) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[option.city, option.state, option.country, option.description]
                          .filter(Boolean)
                          .join(" • ")}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-sm">{v}</dd>
    </div>
  );
}
