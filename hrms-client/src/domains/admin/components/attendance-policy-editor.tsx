import { useMemo } from "react";
import { CheckCircle2, RotateCcw, Save } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import type { PolicyAttendance } from "@/lib/admin-settings-store";
import { cn } from "@/lib/utils";
import { attendancePoliciesEqual, validateAttendancePolicy } from "../attendance-policy-model";

interface AttendancePolicyEditorProps {
  value: PolicyAttendance;
  publishedValue: PolicyAttendance;
  apiEnabled: boolean;
  saving: boolean;
  onChange: (patch: Partial<PolicyAttendance>) => void;
  onPublish: () => void;
  onReset: () => void;
}

const attendanceModes: Array<{
  value: PolicyAttendance["attendanceMode"];
  label: string;
  description: string;
}> = [
  {
    value: "manual_only",
    label: "Manual punches",
    description: "Employees punch through the standard web or mobile flow.",
  },
  {
    value: "geo_optional",
    label: "Location optional",
    description: "Capture location when available and permit a controlled fallback.",
  },
  {
    value: "geo_required",
    label: "Location required",
    description: "Require location verification unless the fallback policy permits review.",
  },
];

export function AttendancePolicyEditor({
  value,
  publishedValue,
  apiEnabled,
  saving,
  onChange,
  onPublish,
  onReset,
}: AttendancePolicyEditorProps) {
  const errors = useMemo(() => validateAttendancePolicy(value), [value]);
  const dirty = apiEnabled && !attendancePoliciesEqual(value, publishedValue);
  const canPublish = dirty && errors.length === 0 && !saving;

  function setAttendanceMode(mode: PolicyAttendance["attendanceMode"]) {
    onChange({
      attendanceMode: mode,
      ...(mode === "manual_only" ? { fallbackApprovalMode: "disabled" as const } : {}),
    });
  }

  function setRegularizationEnabled(enabled: boolean) {
    onChange({
      allowRegularization: enabled,
      regularizationMode: enabled ? "approval_required" : "disabled",
    });
  }

  return (
    <Card className="rounded-lg border-border/60">
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Attendance policy</h2>
            {apiEnabled && (
              <Badge variant={dirty ? "secondary" : "outline"}>
                {dirty ? "Draft changes" : "Published"}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure attendance capture, fallback approvals, punch windows, and correction
            requests.
          </p>
        </div>

        {apiEnabled && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onReset}
              disabled={!dirty || saving}
              title="Discard draft changes"
              aria-label="Discard draft changes"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="sm" disabled={!canPublish}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Publishing..." : "Publish"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Publish attendance policy?</AlertDialogTitle>
                  <AlertDialogDescription>
                    These settings take effect immediately for attendance and regularization
                    workflows.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onPublish}>Publish policy</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div className="space-y-7 p-5">
        <PolicySection
          title="Attendance capture"
          description="Choose whether location verification is part of the punch flow."
        >
          <RadioGroup
            value={value.attendanceMode}
            onValueChange={(next) => setAttendanceMode(next as PolicyAttendance["attendanceMode"])}
            className="grid gap-2 lg:grid-cols-3"
          >
            {attendanceModes.map((mode) => (
              <Choice
                key={mode.value}
                id={`attendance-mode-${mode.value}`}
                value={mode.value}
                selected={value.attendanceMode === mode.value}
                label={mode.label}
                description={mode.description}
              />
            ))}
          </RadioGroup>

          {value.attendanceMode !== "manual_only" && (
            <div className="mt-4 space-y-2">
              <Label className="text-sm font-medium">Manual fallback</Label>
              <RadioGroup
                value={value.fallbackApprovalMode}
                onValueChange={(next) =>
                  onChange({
                    fallbackApprovalMode: next as PolicyAttendance["fallbackApprovalMode"],
                  })
                }
                className="grid gap-2 sm:grid-cols-2"
              >
                <Choice
                  id="fallback-disabled"
                  value="disabled"
                  selected={value.fallbackApprovalMode === "disabled"}
                  label="Block fallback"
                  description="Reject punches that cannot satisfy the configured location mode."
                />
                <Choice
                  id="fallback-approval-required"
                  value="approval_required"
                  selected={value.fallbackApprovalMode === "approval_required"}
                  label="Require approval"
                  description="Permit a fallback request and route it to the approval workflow."
                />
              </RadioGroup>
            </div>
          )}
        </PolicySection>

        <PolicySection
          title="Punch availability"
          description="Set when employees can create punches and how open sessions are closed."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <SwitchField
              label="24-hour punch window"
              description="Allow punching at any time of day."
              checked={value.fullDayPunchWindow}
              onCheckedChange={(fullDayPunchWindow) => onChange({ fullDayPunchWindow })}
            />
            <SwitchField
              label="Company off days"
              description="Allow punches on weekends and holidays."
              checked={value.allowOffDayPunches}
              onCheckedChange={(allowOffDayPunches) => onChange({ allowOffDayPunches })}
            />
          </div>

          {!value.fullDayPunchWindow && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TimeField
                id="punch-in-start"
                label="Punch-in starts"
                value={value.punchInStart}
                onChange={(punchInStart) => onChange({ punchInStart })}
              />
              <TimeField
                id="punch-in-end"
                label="Punch-in ends"
                value={value.punchInEnd}
                onChange={(punchInEnd) => onChange({ punchInEnd })}
              />
              <TimeField
                id="punch-out-start"
                label="Punch-out starts"
                value={value.punchOutStart}
                onChange={(punchOutStart) => onChange({ punchOutStart })}
              />
              <TimeField
                id="punch-out-end"
                label="Punch-out ends"
                value={value.punchOutEnd}
                onChange={(punchOutEnd) => onChange({ punchOutEnd })}
              />
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SwitchField
              label="Auto punch-out"
              description="Close forgotten open sessions at the configured time."
              checked={value.autoPunchOutEnabled}
              onCheckedChange={(autoPunchOutEnabled) => onChange({ autoPunchOutEnabled })}
            />
            {value.autoPunchOutEnabled && (
              <TimeField
                id="auto-punch-out-time"
                label="Auto punch-out time"
                value={value.autoPunchOutTime}
                onChange={(autoPunchOutTime) => onChange({ autoPunchOutTime })}
              />
            )}
          </div>
        </PolicySection>

        <PolicySection
          title="Attendance thresholds"
          description="Control late, half-day, and automatic absence calculations."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              id="grace-minutes"
              label="Grace minutes"
              value={value.graceMinutes}
              onChange={(graceMinutes) => onChange({ graceMinutes })}
            />
            <NumberField
              id="half-day-minutes"
              label="Half-day after"
              value={value.halfDayAfterMinutes}
              onChange={(halfDayAfterMinutes) => onChange({ halfDayAfterMinutes })}
            />
            <NumberField
              id="auto-absent-minutes"
              label="Auto-absent after"
              value={value.autoMarkAbsentMinutes}
              onChange={(autoMarkAbsentMinutes) => onChange({ autoMarkAbsentMinutes })}
            />
          </div>
        </PolicySection>

        <PolicySection
          title="Regularization"
          description="Control whether employees can request attendance corrections."
        >
          <SwitchField
            label="Allow regularization requests"
            description="Enabled requests are always routed for approval in this version."
            checked={value.allowRegularization}
            onCheckedChange={setRegularizationEnabled}
          />
          {value.allowRegularization && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Manager approval is required before a correction is applied.
            </div>
          )}
        </PolicySection>

        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
          >
            <p className="text-sm font-medium text-destructive">Resolve before publishing</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-destructive">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function PolicySection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b pb-7 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

function Choice({
  id,
  value,
  selected,
  label,
  description,
}: {
  id: string;
  value: string;
  selected: boolean;
  label: string;
  description: string;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex min-h-24 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </Label>
  );
}

function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label} (minutes)
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={1440}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </div>
  );
}
