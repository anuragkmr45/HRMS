import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { DataCard, EmptyState, PhoneInput, StatusBadge, UserAvatar } from "@/components/ui-kit";
import { Modal } from "@/components/ui-kit";
import { coreApi } from "@/domains/core/api";
import {
  type EmsProfileView,
  mapProfile,
  mapProfileChange,
  useEmsProfile,
  useEmsProfileChangeMutation,
  useMyProfileChanges,
} from "@/domains/ems";
import { asRecord, pageItems, text, toastApiError, useApiRouteEnabled } from "@/shared/api";
import { queryKeys } from "@/shared/query";
import {
  DEFAULT_PROFILE_PHOTO_POLICY,
  prepareProfilePhotoUploadFile,
} from "@/shared/uploads/profile-photo";
import { formatBytes } from "@/shared/uploads/documents";
import {
  User,
  Phone,
  MapPin,
  Briefcase,
  AlertTriangle,
  Edit3,
  Inbox,
  Upload,
  Trash2,
  Mail,
  CalendarDays,
  Building2,
  ShieldCheck,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_app/ems/profile")({
  component: MyProfile,
});

interface Field {
  label: string;
  value: string;
}

const PROFILE_FIELDS = [
  { key: "personal_email", label: "Personal email" },
  { key: "phone", label: "Phone" },
  { key: "alternate_phone", label: "Alternate phone" },
  { key: "current_address", label: "Current address" },
  { key: "permanent_address", label: "Permanent address" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
] as const;

function Section({
  title,
  description,
  icon: Icon,
  fields,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  fields: Field[];
}) {
  return (
    <DataCard
      title={title}
      description={description}
      className="glass-panel ems-profile-card"
      padded={false}
      actions={
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="h-4 w-4" />
        </span>
      }
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className="ems-profile-field">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </dt>
            <dd className="mt-1 break-words text-sm font-medium text-foreground">{f.value}</dd>
          </div>
        ))}
      </dl>
    </DataCard>
  );
}

function ProfileHeroLine({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function MyProfile() {
  const { user } = useAuth();
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const queryClient = useQueryClient();
  const profileQuery = useEmsProfile(apiEnabled);
  const changesQuery = useMyProfileChanges({ page: 1, page_size: 10 }, apiEnabled);
  const profilePhotoPolicyQuery = useQuery({
    queryKey: queryKeys.action("core", "users", "profile-photo-policy"),
    queryFn: () => coreApi.profilePhotoPolicy(),
    enabled: apiEnabled && Boolean(user),
  });
  const changeMutation = useEmsProfileChangeMutation();
  const uploadPhotoMutation = useMutation({
    mutationFn: ({ userId, formData }: { userId: string; formData: FormData }) =>
      coreApi.uploadProfilePhoto(userId, formData),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.domain("core") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.domain("auth") }),
      ]);
    },
  });
  const removePhotoMutation = useMutation({
    mutationFn: (userId: string) => coreApi.deleteProfilePhoto(userId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.domain("core") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.domain("auth") }),
      ]);
    },
  });
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<(typeof PROFILE_FIELDS)[number]["key"]>("current_address");
  const [val, setVal] = useState("");
  const [reason, setReason] = useState("");

  if (!user) return null;

  const submit = () => {
    if (!field || !val.trim()) return toast.error("Field and new value are required");
    if (!apiEnabled) {
      toast.success("Profile update request sent to HR for approval");
      setOpen(false);
      setVal("");
      setReason("");
      return;
    }
    changeMutation.mutate(
      {
        field_key: field,
        field_label: PROFILE_FIELDS.find((item) => item.key === field)?.label,
        new_value: val,
        reason: reason || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Profile update request sent to HR for approval");
          setOpen(false);
          setVal("");
          setReason("");
        },
        onError: (error) => toastApiError(error, "Profile update request could not be submitted."),
      },
    );
  };

  const fallback: EmsProfileView = {
    user: { id: user.id, fullName: user.name, employeeCode: "HK-00821", email: user.email },
    manager: {
      id: "manager",
      employeeCode: "MGR",
      fullName: "Ananya Iyer",
      email: "ananya@hawkaii.app",
    },
    department: user.department,
    designation: user.designation,
    joinedOn: "2022-03-14",
    employmentStatus: "active",
    personalEmail: "personal@example.com",
    phone: "+91 98xxx xxxxx",
    alternatePhone: "+91 91xxx xxxxx",
    currentAddress: "12 Indiranagar, Bangalore 560038",
    permanentAddress: "44 Banjara Hills, Hyderabad 500034",
    city: "Bangalore",
    country: "India",
    emergencyContact: {
      name: "Rohit Sharma",
      relation: "Spouse",
      phone: "+91 99xxx xxxxx",
      email: "rohit@example.com",
    },
    personalDetails: {
      date_of_birth: "12 Aug 1992",
      gender: "Female",
      marital_status: "Married",
      nationality: "Indian",
    },
    workPreferences: {
      employment_type: "Full time",
      work_mode: "Hybrid",
      confirmation_date: "14 Sep 2022",
    },
    version: 1,
    summaries: {},
  };
  const apiProfile = profileQuery.data ? mapProfile(profileQuery.data) : null;
  const profile = apiEnabled ? apiProfile : fallback;
  if (apiEnabled && profileQuery.isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <DataCard title="My profile">
          <p className="text-sm text-muted-foreground">Loading profile from backend...</p>
        </DataCard>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="space-y-4 pt-4">
        <EmptyState
          icon={Inbox}
          title="Profile could not be loaded"
          description="The backend profile API returned an error."
        />
      </div>
    );
  }
  const emergency = asRecord(profile.emergencyContact);
  const personal = asRecord(profile.personalDetails);
  const preferences = asRecord(profile.workPreferences);
  const pendingChanges = apiEnabled ? pageItems(changesQuery.data).map(mapProfileChange) : [];
  const photoPolicy = profilePhotoPolicyQuery.data ?? DEFAULT_PROFILE_PHOTO_POLICY;
  const photoBusy = uploadPhotoMutation.isPending || removePhotoMutation.isPending;
  const canRemovePhoto =
    apiEnabled && Boolean(profile.user.profilePhotoDocumentId || profile.user.profilePhotoUrl);

  const handlePhotoSelected = async (file: File | null) => {
    if (!file) return;
    if (!apiEnabled) {
      toast.error("Profile photo upload requires backend API mode.");
      return;
    }
    try {
      const prepared = await prepareProfilePhotoUploadFile(file, photoPolicy);
      const formData = new FormData();
      formData.set("file", prepared.file);
      await uploadPhotoMutation.mutateAsync({ userId: profile.user.id, formData });
      toast.success("Profile photo updated", {
        description: prepared.compressed
          ? `Compressed from ${formatBytes(prepared.originalSize)} to ${formatBytes(prepared.file.size)} before upload.`
          : "Uploaded through Cloudinary-backed document storage.",
      });
    } catch (error) {
      toastApiError(error, "Profile photo could not be uploaded.");
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    if (!apiEnabled || !canRemovePhoto) return;
    try {
      await removePhotoMutation.mutateAsync(profile.user.id);
      toast.success("Profile photo removed");
    } catch (error) {
      toastApiError(error, "Profile photo could not be removed.");
    }
  };

  const photoHelpText = `${photoPolicy.allowed_mime_types
    .map((type) => type.replace("image/", "").toUpperCase())
    .join(", ")} up to ${formatBytes(photoPolicy.max_bytes)}. Images are compressed before upload.`;

  return (
    <div className="space-y-5 pt-4">
      <section className="ems-profile-hero glass-panel">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              <div className="rounded-[1.7rem] bg-background/45 p-2 shadow-[0_22px_50px_-36px_var(--color-primary)] ring-1 ring-primary/20 backdrop-blur">
                <UserAvatar
                  name={profile.user.fullName}
                  email={profile.user.email}
                  src={profile.user.profilePhotoUrl}
                  size="lg"
                />
              </div>
              <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-success/15 text-success ring-1 ring-success/25 backdrop-blur">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={profile.employmentStatus} />
                <span className="rounded-full border border-border/70 bg-background/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {profile.user.employeeCode}
                </span>
              </div>
              <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {profile.user.fullName}
              </h2>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                <ProfileHeroLine icon={Mail} label={profile.user.email} />
                <ProfileHeroLine icon={Briefcase} label={profile.designation} />
                <ProfileHeroLine icon={Building2} label={profile.department} />
                <ProfileHeroLine
                  icon={CalendarDays}
                  label={profile.joinedOn || "Joining date not set"}
                />
                <ProfileHeroLine
                  icon={User}
                  label={profile.manager?.fullName ?? "Manager not assigned"}
                />
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-background/35 p-3 backdrop-blur lg:w-[24rem]">
            <p className="text-xs leading-relaxed text-muted-foreground">{photoHelpText}</p>
            <input
              ref={photoInputRef}
              type="file"
              className="hidden"
              accept={photoPolicy.allowed_mime_types.join(",")}
              onChange={(event) => handlePhotoSelected(event.currentTarget.files?.[0] ?? null)}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={!apiEnabled || photoBusy}
                onClick={() => photoInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {profile.user.profilePhotoUrl ? "Replace" : "Upload"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full text-destructive hover:text-destructive"
                disabled={!canRemovePhoto || photoBusy}
                onClick={handleRemovePhoto}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
              <Button onClick={() => setOpen(true)} className="rounded-full" size="sm">
                <Edit3 className="mr-2 h-4 w-4" />
                Update
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-muted-foreground">
        Profile changes require HR approval before they go live.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title="Basic information"
          description="Identity details registered with HR"
          icon={User}
          fields={[
            { label: "Full name", value: profile.user.fullName },
            { label: "Employee ID", value: profile.user.employeeCode },
            { label: "Date of birth", value: text(personal.date_of_birth, "—") },
            { label: "Gender", value: text(personal.gender, "—") },
            { label: "Marital status", value: text(personal.marital_status, "—") },
            { label: "Nationality", value: text(personal.nationality, "—") },
          ]}
        />
        <Section
          title="Contact information"
          description="Reachability details for work and personal use"
          icon={Phone}
          fields={[
            { label: "Work email", value: profile.user.email },
            { label: "Personal email", value: profile.personalEmail },
            { label: "Phone", value: profile.phone },
            { label: "Alternate", value: profile.alternatePhone },
          ]}
        />
        <Section
          title="Emergency contact"
          description="Primary contact available to HR in urgent situations"
          icon={AlertTriangle}
          fields={[
            { label: "Name", value: text(emergency.name, "—") },
            {
              label: "Relation",
              value: text(emergency.relation, text(emergency.relationship, "—")),
            },
            { label: "Phone", value: text(emergency.phone, "—") },
            { label: "Email", value: text(emergency.email, "—") },
          ]}
        />
        <Section
          title="Address"
          description="Current and permanent address records"
          icon={MapPin}
          fields={[
            { label: "Current address", value: profile.currentAddress },
            { label: "Permanent address", value: profile.permanentAddress },
            { label: "City", value: profile.city },
            { label: "Country", value: profile.country },
          ]}
        />
        <Section
          title="Job information"
          description="Role, team and work preference details"
          icon={Briefcase}
          fields={[
            { label: "Designation", value: profile.designation },
            { label: "Department", value: profile.department },
            { label: "Employment type", value: text(preferences.employment_type, "—") },
            { label: "Work mode", value: text(preferences.work_mode, "—") },
            { label: "Date of joining", value: profile.joinedOn || "—" },
            { label: "Confirmation date", value: text(preferences.confirmation_date, "—") },
          ]}
        />
        <Section
          title="Reporting structure"
          description="Manager assignment from the employee profile"
          icon={User}
          fields={[
            { label: "Reporting manager", value: profile.manager?.fullName ?? "—" },
            { label: "Manager email", value: profile.manager?.email ?? "—" },
          ]}
        />
      </div>

      {apiEnabled ? (
        <DataCard
          title="My profile update requests"
          description="Latest HR review activity"
          className="glass-panel ems-profile-card"
          padded={false}
          actions={
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ClipboardList className="h-4 w-4" />
            </span>
          }
        >
          {changesQuery.isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading profile requests...</p>
          ) : pendingChanges.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No profile requests"
                description="Submitted changes will appear here."
              />
            </div>
          ) : (
            <div className="grid gap-3 p-3 md:grid-cols-2">
              {pendingChanges.map((request) => (
                <div key={request.id} className="ems-profile-request-card rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{request.field}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{request.requestCode}</p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  <div className="mt-3 rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="break-words text-xs text-muted-foreground">
                      {request.oldValue} → {request.newValue}
                    </p>
                    {request.reason ? (
                      <p className="mt-2 break-words text-xs text-muted-foreground">
                        {request.reason}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataCard>
      ) : null}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Request profile update"
        description="HR Admin will review and approve this change."
        footer={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={submit} disabled={changeMutation.isPending}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="field">Field to update</Label>
            <Select value={field} onValueChange={(value) => setField(value as typeof field)}>
              <SelectTrigger id="field" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILE_FIELDS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="val">New value</Label>
            {field === "phone" || field === "alternate_phone" ? (
              <PhoneInput id="val" value={val} onChange={setVal} className="mt-1" />
            ) : (
              <Input
                id="val"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="Enter the new value"
                className="mt-1"
              />
            )}
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional context for HR"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
