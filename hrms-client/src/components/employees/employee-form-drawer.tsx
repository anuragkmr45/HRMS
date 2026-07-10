import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Check,
  Plus,
  ChevronRight,
  ChevronLeft,
  Camera,
  Upload,
  X,
  ShieldCheck,
  Mail,
  Briefcase,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  type Employee,
  type EmployeeStatus,
  type EmploymentType,
  type Gender,
  type WorkMode,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  WORK_MODE_LABEL,
  GENDER_LABEL,
} from "@/lib/mock/employees";
import { nextEmployeeId, useEmployees } from "@/lib/employees-store";
import { ROLES, type Role } from "@/lib/mock/roles";
import { QuickCreateModal } from "./quick-create-modal";
import { toastApiError } from "@/shared/api";
import { formatBytes } from "@/shared/uploads/documents";
import {
  DEFAULT_PROFILE_PHOTO_POLICY,
  prepareProfilePhotoUploadFile,
  type ProfilePhotoPolicy,
} from "@/shared/uploads/profile-photo";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Employee | null;
}

interface FormState {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: Gender | "";
  dob: string;
  phone: string;
  personalEmail: string;
  email: string;
  // step 2
  joinedAt: string;
  department: string;
  designation: string;
  manager: string;
  employmentType: EmploymentType;
  location: string;
  workMode: WorkMode;
  probationEndDate: string;
  noticeDays: number;
  shift: string;
  status: EmployeeStatus;
  // step 3
  inviteForLogin: boolean;
  enableDocSubmission: boolean;
  loginEnabled: boolean;
  systemRoles: string[];
  sendInviteEmail: boolean;
}

const STEPS = [
  { title: "Basic", description: "Personal info", icon: UserRound },
  { title: "Job", description: "Role & employment", icon: Briefcase },
  { title: "Access", description: "Login & roles", icon: ShieldCheck },
];

export function EmployeeFormDrawer({ open, onOpenChange, initial }: Props) {
  const {
    employees,
    departments,
    designations,
    addDepartment,
    addDesignation,
    upsert,
    uploadProfilePhoto,
    profilePhotoPolicy,
    isApiBacked,
  } = useEmployees();
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [deptOpen, setDeptOpen] = useState(false);
  const [desigOpen, setDesigOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string>("");
  const [profilePhotoCompressed, setProfilePhotoCompressed] = useState(false);

  const empty = useMemo<FormState>(
    () => ({
      id: nextEmployeeId(employees),
      firstName: "",
      middleName: "",
      lastName: "",
      gender: "",
      dob: "",
      phone: "",
      personalEmail: "",
      email: "",
      joinedAt: new Date().toISOString().slice(0, 10),
      department: departments[0]?.name ?? "Engineering",
      designation: designations[0]?.title ?? "Software Engineer",
      manager: "Sara Iqbal",
      employmentType: "full_time",
      location: "",
      workMode: "hybrid",
      probationEndDate: "",
      noticeDays: 60,
      shift: "General (10:00–19:00)",
      status: "draft",
      inviteForLogin: true,
      enableDocSubmission: true,
      loginEnabled: false,
      systemRoles: ["employee"],
      sendInviteEmail: true,
    }),
    [employees, departments, designations],
  );

  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    setError("");
    if (initial) {
      setForm({
        id: initial.id,
        firstName: initial.firstName,
        middleName: initial.middleName ?? "",
        lastName: initial.lastName,
        gender: initial.gender ?? "",
        dob: initial.dob ?? "",
        phone: initial.phone,
        personalEmail: initial.personalEmail ?? "",
        email: initial.email,
        joinedAt: initial.joinedAt,
        department: initial.department,
        designation: initial.designation,
        manager: initial.manager,
        employmentType: initial.employmentType,
        location: initial.location,
        workMode: initial.workMode,
        probationEndDate: initial.probationEndDate ?? "",
        noticeDays: initial.noticeDays,
        shift: initial.shift,
        status: initial.status,
        inviteForLogin: initial.loginEnabled,
        enableDocSubmission: true,
        loginEnabled: initial.loginEnabled,
        systemRoles: initial.systemRoles,
        sendInviteEmail: false,
      });
    } else {
      setForm(empty);
    }
    setProfilePhotoFile(null);
    setProfilePhotoCompressed(false);
    setProfilePhotoPreviewUrl(initial?.avatarUrl ?? "");
  }, [open, initial, empty]);

  useEffect(
    () => () => {
      if (profilePhotoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(profilePhotoPreviewUrl);
    },
    [profilePhotoPreviewUrl],
  );

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const fullName =
    [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ").trim() || "—";

  const validateStep = (s: number) => {
    if (s === 0) {
      if (!form.firstName || !form.lastName) return "First and last name are required.";
      if (!form.email) return "Company email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid company email.";
      if (form.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personalEmail))
        return "Enter a valid personal email.";
    }
    if (s === 1) {
      if (!form.location) return "Work location is required.";
      if (!form.joinedAt) return "Joining date is required.";
    }
    return "";
  };

  const next = () => {
    const e = validateStep(active);
    if (e) return setError(e);
    setError("");
    setActive((a) => Math.min(STEPS.length - 1, a + 1));
  };
  const back = () => {
    setError("");
    setActive((a) => Math.max(0, a - 1));
  };

  const clearProfilePhoto = () => {
    if (profilePhotoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(profilePhotoPreviewUrl);
    setProfilePhotoFile(null);
    setProfilePhotoCompressed(false);
    setProfilePhotoPreviewUrl(initial?.avatarUrl ?? "");
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const chooseProfilePhoto = async (file: File | null) => {
    if (!file) return;
    try {
      const policy = profilePhotoPolicy ?? DEFAULT_PROFILE_PHOTO_POLICY;
      const prepared = await prepareProfilePhotoUploadFile(file, policy);
      if (profilePhotoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(profilePhotoPreviewUrl);
      setProfilePhotoFile(prepared.file);
      setProfilePhotoCompressed(prepared.compressed);
      setProfilePhotoPreviewUrl(URL.createObjectURL(prepared.file));
      if (prepared.compressed) {
        toast.message("Profile photo compressed", {
          description: `${formatBytes(prepared.originalSize)} → ${formatBytes(prepared.file.size)}`,
        });
      }
    } catch (error) {
      toastApiError(error, "Profile photo could not be prepared.");
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    const e = validateStep(0) || validateStep(1);
    if (e) {
      setError(e);
      setActive(validateStep(0) ? 0 : 1);
      return;
    }
    const id = initial?.id ?? form.id;
    const employee: Employee = {
      id,
      firstName: form.firstName,
      middleName: form.middleName || undefined,
      lastName: form.lastName,
      name: fullName,
      gender: (form.gender || undefined) as Gender | undefined,
      dob: form.dob || undefined,
      email: form.email,
      personalEmail: form.personalEmail || undefined,
      phone: form.phone,
      designation: form.designation,
      department: form.department,
      manager: form.manager,
      location: form.location,
      workMode: form.workMode,
      status: form.status,
      employmentType: form.employmentType,
      joinedAt: form.joinedAt,
      probationEndDate: form.probationEndDate || undefined,
      noticeDays: form.noticeDays,
      shift: form.shift,
      loginEnabled: form.loginEnabled || form.inviteForLogin,
      systemRoles: form.systemRoles.length ? form.systemRoles : ["employee"],
      avatarUrl: profilePhotoPreviewUrl || initial?.avatarUrl,
      profilePhotoDocumentId: initial?.profilePhotoDocumentId,
      avatarTone: initial?.avatarTone ?? "primary",
      roleHistory: initial?.roleHistory ?? [
        {
          at: new Date().toISOString(),
          actor: "Rahul Verma",
          from: [],
          to: form.systemRoles,
          remarks: "Initial role",
        },
      ],
      audit: initial?.audit ?? [],
      documents: initial?.documents ?? [],
      lastLoginAt: initial?.lastLoginAt,
    };
    try {
      const saved = await upsert(employee);
      if (profilePhotoFile && isApiBacked) {
        await uploadProfilePhoto(saved.apiId ?? saved.id, profilePhotoFile);
      }
      toast.success(initial ? "Employee updated" : "Employee added", {
        description: profilePhotoFile
          ? `${fullName} • ${form.designation} • photo uploaded`
          : `${fullName} • ${form.designation}`,
      });
      if (form.sendInviteEmail && !initial) {
        toast.message("Invite sent", { description: `${form.email} will receive a sign-up link.` });
      }
      onOpenChange(false);
    } catch (error) {
      toastApiError(
        error,
        initial ? "Employee could not be updated." : "Employee could not be added.",
      );
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <div className="border-b px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {initial ? "Edit employee" : "Add new employee"}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {initial ? initial.name : fullName}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {initial
                ? `${initial.id} • ${initial.designation}`
                : "Create a complete employee profile in three quick steps."}
            </p>

            <ol className="mt-5 flex items-center gap-2">
              {STEPS.map((s, i) => {
                const done = i < active;
                const current = i === active;
                return (
                  <li key={s.title} className="flex flex-1 items-center gap-2">
                    <div
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold transition",
                        done && "border-success bg-success text-success-foreground",
                        current && "border-primary bg-primary text-primary-foreground",
                        !done && !current && "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : i + 1}
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <p
                        className={cn(
                          "truncate text-xs font-semibold",
                          current ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {s.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{s.description}</p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={cn("ml-1 h-px flex-1", done ? "bg-success" : "bg-border")} />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {active === 0 && (
              <Step1
                form={form}
                set={set}
                fullName={fullName}
                photoInputRef={photoInputRef}
                profilePhotoPolicy={profilePhotoPolicy}
                profilePhotoPreviewUrl={profilePhotoPreviewUrl}
                profilePhotoFile={profilePhotoFile}
                profilePhotoCompressed={profilePhotoCompressed}
                onChooseProfilePhoto={(file) => void chooseProfilePhoto(file)}
                onClearProfilePhoto={clearProfilePhoto}
              />
            )}
            {active === 1 && (
              <Step2
                form={form}
                set={set}
                departments={departments.map((d) => d.name)}
                designations={Array.from(new Set(designations.map((d) => d.title)))}
                onAddDept={() => setDeptOpen(true)}
                onAddDesig={() => setDesigOpen(true)}
                apiBacked={isApiBacked}
              />
            )}
            {active === 2 && <Step3 form={form} set={set} />}

            {error && (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-6 py-4">
            <Button variant="ghost" className="rounded-full" onClick={back} disabled={active === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {active < STEPS.length - 1 ? (
                <Button
                  className="rounded-full text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                  onClick={next}
                >
                  Continue <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="rounded-full text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                  onClick={() => void handleSubmit()}
                >
                  {initial ? "Save changes" : "Create employee"}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <QuickCreateModal
        open={deptOpen}
        onOpenChange={setDeptOpen}
        title="Add department"
        label="Department name"
        onCreate={(name, desc) => {
          const d = addDepartment(name, desc);
          set("department", d.name);
          toast.success("Department added", { description: name });
        }}
      />
      <QuickCreateModal
        open={desigOpen}
        onOpenChange={setDesigOpen}
        title="Add designation"
        label="Designation title"
        onCreate={(title) => {
          const d = addDesignation(title, form.department);
          set("designation", d.title);
          toast.success("Designation added", { description: title });
        }}
      />
    </>
  );
}

/* ───────────── Steps ───────────── */

function Step1({
  form,
  set,
  fullName,
  photoInputRef,
  profilePhotoPolicy,
  profilePhotoPreviewUrl,
  profilePhotoFile,
  profilePhotoCompressed,
  onChooseProfilePhoto,
  onClearProfilePhoto,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  fullName: string;
  photoInputRef: RefObject<HTMLInputElement | null>;
  profilePhotoPolicy?: ProfilePhotoPolicy;
  profilePhotoPreviewUrl: string;
  profilePhotoFile: File | null;
  profilePhotoCompressed: boolean;
  onChooseProfilePhoto: (file: File | null) => void;
  onClearProfilePhoto: () => void;
}) {
  const policy = profilePhotoPolicy ?? DEFAULT_PROFILE_PHOTO_POLICY;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-2xl border bg-secondary/30 p-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground">
          {profilePhotoPreviewUrl ? (
            <img
              src={profilePhotoPreviewUrl}
              alt={`${fullName} profile preview`}
              className="h-full w-full object-cover"
            />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-muted-foreground">
            {policy.allowed_mime_types
              .map((type) => type.replace("image/", "").toUpperCase())
              .join(", ")}
            , up to {formatBytes(policy.max_bytes)}. Optional.
          </p>
          {profilePhotoFile && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ready: {profilePhotoFile.name} ({formatBytes(profilePhotoFile.size)})
              {profilePhotoCompressed ? " • compressed before upload" : ""}
            </p>
          )}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          className="hidden"
          accept={policy.allowed_mime_types.join(",")}
          onChange={(event) => onChooseProfilePhoto(event.currentTarget.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-2">
          {profilePhotoFile && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={onClearProfilePhoto}
              aria-label="Remove selected profile photo"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => photoInputRef.current?.click()}
          >
            <Upload className="mr-1 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      <Section title="Identity">
        <Grid>
          <Field label="Employee ID" id="emp-id" value={form.id} onChange={(v) => set("id", v)} />
          <SelectField
            label="Gender"
            value={form.gender}
            onChange={(v) => set("gender", v as Gender)}
            options={[
              { value: "", label: "Select" },
              ...Object.entries(GENDER_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </Grid>
        <Grid cols={3}>
          <Field
            label="First name"
            id="fn"
            required
            value={form.firstName}
            onChange={(v) => set("firstName", v)}
          />
          <Field
            label="Middle name"
            id="mn"
            value={form.middleName}
            onChange={(v) => set("middleName", v)}
          />
          <Field
            label="Last name"
            id="ln"
            required
            value={form.lastName}
            onChange={(v) => set("lastName", v)}
          />
        </Grid>
        <div className="rounded-xl bg-primary-soft/50 px-3 py-2 text-xs text-primary">
          Full name: <span className="font-semibold">{fullName}</span>
        </div>
        <Field
          label="Date of birth"
          id="dob"
          type="date"
          value={form.dob}
          onChange={(v) => set("dob", v)}
        />
      </Section>

      <Section title="Contact">
        <Grid>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Contact number</Label>
            <PhoneInput id="phone" value={form.phone} onChange={(value) => set("phone", value)} />
          </div>
          <Field
            label="Personal email"
            id="pemail"
            type="email"
            value={form.personalEmail}
            onChange={(v) => set("personalEmail", v)}
          />
        </Grid>
        <Field
          label="Company email"
          id="cemail"
          type="email"
          required
          value={form.email}
          onChange={(v) => set("email", v)}
          placeholder="name@company.com"
        />
      </Section>
    </div>
  );
}

function Step2({
  form,
  set,
  departments,
  designations,
  onAddDept,
  onAddDesig,
  apiBacked,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  departments: string[];
  designations: string[];
  onAddDept: () => void;
  onAddDesig: () => void;
  apiBacked: boolean;
}) {
  const statusOptions = Object.entries(EMPLOYEE_STATUS_LABEL)
    .filter(([value]) => !apiBacked || ["active", "inactive", "exited"].includes(value))
    .map(([value, label]) => ({
      value,
      label,
    }));

  return (
    <div className="space-y-5">
      <Section title="Employment">
        <Grid>
          <Field
            label="Date of joining"
            id="joined"
            type="date"
            required
            value={form.joinedAt}
            onChange={(v) => set("joinedAt", v)}
          />
          <SelectField
            label="Employment type"
            value={form.employmentType}
            onChange={(v) => set("employmentType", v as EmploymentType)}
            options={Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Grid>
        <Grid>
          <SelectFieldWithAdd
            label="Department"
            value={form.department}
            onChange={(v) => set("department", v)}
            options={departments}
            onAdd={onAddDept}
            allowAdd={!apiBacked}
          />
          <SelectFieldWithAdd
            label="Designation"
            value={form.designation}
            onChange={(v) => set("designation", v)}
            options={designations}
            onAdd={onAddDesig}
            allowAdd={!apiBacked}
          />
        </Grid>
        <Grid>
          <Field
            label="Reporting to"
            id="rep"
            value={form.manager}
            onChange={(v) => set("manager", v)}
          />
          <SelectField
            label="Lifecycle status"
            value={form.status}
            onChange={(v) => set("status", v as EmployeeStatus)}
            options={statusOptions}
          />
        </Grid>
      </Section>

      <Section title="Work setup">
        <Grid>
          <Field
            label="Work location"
            id="loc"
            required
            value={form.location}
            onChange={(v) => set("location", v)}
            placeholder="City, Country"
          />
          <SelectField
            label="Work mode"
            value={form.workMode}
            onChange={(v) => set("workMode", v as WorkMode)}
            options={Object.entries(WORK_MODE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Grid>
        <Grid cols={3}>
          <Field
            label="Probation end date"
            id="prob"
            type="date"
            value={form.probationEndDate}
            onChange={(v) => set("probationEndDate", v)}
          />
          <Field
            label="Notice period (days)"
            id="notice"
            type="number"
            value={String(form.noticeDays)}
            onChange={(v) => set("noticeDays", Number(v) || 0)}
          />
          <Field label="Shift" id="shift" value={form.shift} onChange={(v) => set("shift", v)} />
        </Grid>
      </Section>
    </div>
  );
}

function Step3({
  form,
  set,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const toggleRole = (key: Role) => {
    const has = form.systemRoles.includes(key);
    set(
      "systemRoles",
      has ? form.systemRoles.filter((r) => r !== key) : [...form.systemRoles, key],
    );
  };

  const previewModules = Array.from(
    new Set(ROLES.filter((r) => form.systemRoles.includes(r.key)).flatMap((r) => r.modules)),
  );

  return (
    <div className="space-y-5">
      <Section title="Login access">
        <ToggleRow
          label="Invite this employee for login access"
          description="They will receive a verification email to set their password."
          checked={form.inviteForLogin}
          onChange={(v) => set("inviteForLogin", v)}
          icon={Mail}
        />
        <ToggleRow
          label="Enable joining-document submission"
          description="Show a checklist for documents the employee must upload."
          checked={form.enableDocSubmission}
          onChange={(v) => set("enableDocSubmission", v)}
        />
        <div className="flex items-center justify-between rounded-xl border bg-card p-4">
          <div>
            <p className="text-sm font-medium">Login status</p>
            <p className="text-xs text-muted-foreground">Toggle to disable sign-in immediately.</p>
          </div>
          <SelectField
            label=""
            value={form.loginEnabled ? "enabled" : "disabled"}
            onChange={(v) => set("loginEnabled", v === "enabled")}
            options={[
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
        </div>
      </Section>

      <Section title="System roles">
        <div className="rounded-xl border border-info/30 bg-info/10 p-3 text-xs text-info">
          <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
          Employees cannot pick their own role. Roles are assigned by Main Admin or HR Admin.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROLES.map((r) => {
            const checked = form.systemRoles.includes(r.key);
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => toggleRole(r.key)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  checked
                    ? "border-primary bg-primary-soft/60"
                    : "border-border bg-card hover:bg-accent/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{r.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {r.description}
                    </p>
                  </div>
                  <Checkbox checked={checked} className="mt-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Module permissions preview">
        <div className="rounded-xl border bg-secondary/30 p-3">
          {previewModules.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Select at least one role to preview accessible modules.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {previewModules.map((m) => (
                <span
                  key={m}
                  className="rounded-full border bg-card px-2.5 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Notify">
        <ToggleRow
          label="Send invite email"
          description="Trigger the welcome email immediately on save."
          checked={form.sendInviteEmail}
          onChange={(v) => set("sendInviteEmail", v)}
          icon={Mail}
        />
      </Section>
    </div>
  );
}

/* ───────────── Building blocks ───────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value || "__none"} disabled={o.value === ""}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SelectFieldWithAdd({
  label,
  value,
  onChange,
  options,
  onAdd,
  allowAdd = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  onAdd: () => void;
  allowAdd?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {allowAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add new
          </button>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  icon: Icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 transition hover:bg-accent/40">
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onChange(c === true)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {label}
        </p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
    </label>
  );
}
