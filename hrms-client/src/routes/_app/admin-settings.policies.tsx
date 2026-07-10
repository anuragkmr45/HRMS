import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAdminSettings, type Policies } from "@/lib/admin-settings-store";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";
import { useAdminPolicies, useUpdateAdminPolicyMutation } from "@/domains/admin/queries";
import type { AdminPolicyRecord, AdminPolicyValue } from "@/domains/admin/api";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin-settings/policies")({
  component: PoliciesScreen,
});

type PolicyKey = keyof Policies;

function PoliciesScreen() {
  const localSettings = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const policiesQuery = useAdminPolicies(apiEnabled);
  const updatePolicy = useUpdateAdminPolicyMutation();
  const [drafts, setDrafts] = useState<Policies>(localSettings.policies);
  const [versions, setVersions] = useState<Record<string, number>>({});

  const apiPolicyState = useMemo(
    () => policiesFromApi(policiesQuery.data?.items ?? [], localSettings.policies),
    [localSettings.policies, policiesQuery.data?.items],
  );

  useEffect(() => {
    if (!apiEnabled) return;
    setDrafts(apiPolicyState.policies);
    setVersions(apiPolicyState.versions);
  }, [apiEnabled, apiPolicyState]);

  const policies = apiEnabled ? drafts : localSettings.policies;
  const loading = apiEnabled && policiesQuery.isLoading;
  const error = apiEnabled && policiesQuery.error instanceof Error ? policiesQuery.error : null;
  const leavePreview = useMemo(
    () =>
      policiesQuery.data?.items.find((item) => item.policy_key === "leave")?.derived_preview ??
      null,
    [policiesQuery.data?.items],
  );

  function setPolicy<K extends PolicyKey>(key: K, patch: Partial<Policies[K]>) {
    if (!apiEnabled) {
      localSettings.setPolicy(key, patch);
      return;
    }
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  async function savePolicy(key: PolicyKey) {
    const version = versions[key];
    if (!apiEnabled || !version) return;
    try {
      const response = await updatePolicy.mutateAsync({
        policyKey: key,
        input: {
          expected_version: version,
          config: policies[key] as unknown as Record<string, AdminPolicyValue>,
        },
      });
      setVersions((current) => ({ ...current, [key]: response.version }));
      toast.success("Policy saved");
    } catch (saveError) {
      toastApiError(saveError, "Policy update failed");
    }
  }

  if (loading) {
    return (
      <Card className="rounded-2xl border-border/60 p-6 text-sm text-muted-foreground">
        Loading policy configuration...
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-border/60 p-6 text-sm text-destructive">
        {error.message}
      </Card>
    );
  }

  return (
    <Tabs defaultValue="attendance">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
        <TabsTrigger value="leave">Leave</TabsTrigger>
        <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
        <TabsTrigger value="expense">Expense</TabsTrigger>
        <TabsTrigger value="asset">Asset</TabsTrigger>
        <TabsTrigger value="sla">Helpdesk SLA</TabsTrigger>
      </TabsList>

      <TabsContent value="attendance" className="mt-4">
        <PolicyCard
          title="Attendance policy"
          description="Govern punch availability, off-day access, grace periods and auto-absent thresholds."
          apiEnabled={apiEnabled}
          saving={updatePolicy.isPending}
          onSave={() => savePolicy("attendance")}
        >
          <SwitchField
            label="Allow punching any time (24-hour window)"
            value={policies.attendance.fullDayPunchWindow}
            onChange={(v) => setPolicy("attendance", { fullDayPunchWindow: v })}
          />
          <SwitchField
            label="Allow punches on company off days"
            value={policies.attendance.allowOffDayPunches}
            onChange={(v) => setPolicy("attendance", { allowOffDayPunches: v })}
          />
          {!policies.attendance.fullDayPunchWindow && (
            <div className="md:col-span-2 grid grid-cols-1 gap-3 rounded-xl border bg-card/50 p-3 md:grid-cols-2">
              <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Punch windows
              </p>
              <TimeField
                label="Punch-in starts"
                value={policies.attendance.punchInStart}
                onChange={(v) => setPolicy("attendance", { punchInStart: v })}
              />
              <TimeField
                label="Punch-in ends"
                value={policies.attendance.punchInEnd}
                onChange={(v) => setPolicy("attendance", { punchInEnd: v })}
              />
              <TimeField
                label="Punch-out starts"
                value={policies.attendance.punchOutStart}
                onChange={(v) => setPolicy("attendance", { punchOutStart: v })}
              />
              <TimeField
                label="Punch-out ends"
                value={policies.attendance.punchOutEnd}
                onChange={(v) => setPolicy("attendance", { punchOutEnd: v })}
              />
            </div>
          )}
          <div className="md:col-span-2 grid grid-cols-1 gap-3 rounded-xl border bg-card/50 p-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Day-end safety
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Open punch sessions are automatically closed at this time if an employee forgets to
                punch out.
              </p>
            </div>
            <SwitchField
              label="Auto punch-out"
              value={policies.attendance.autoPunchOutEnabled}
              onChange={(v) => setPolicy("attendance", { autoPunchOutEnabled: v })}
            />
            {policies.attendance.autoPunchOutEnabled && (
              <TimeField
                label="Auto punch-out time"
                value={policies.attendance.autoPunchOutTime}
                onChange={(v) => setPolicy("attendance", { autoPunchOutTime: v })}
              />
            )}
          </div>
          <NumField
            label="Grace minutes (no late mark)"
            value={policies.attendance.graceMinutes}
            onChange={(v) => setPolicy("attendance", { graceMinutes: v })}
          />
          <NumField
            label="Half-day after (minutes late)"
            value={policies.attendance.halfDayAfterMinutes}
            onChange={(v) => setPolicy("attendance", { halfDayAfterMinutes: v })}
          />
          <NumField
            label="Auto-absent after (minutes)"
            value={policies.attendance.autoMarkAbsentMinutes}
            onChange={(v) => setPolicy("attendance", { autoMarkAbsentMinutes: v })}
          />
          <SwitchField
            label="Allow regularization requests"
            value={policies.attendance.allowRegularization}
            onChange={(v) => setPolicy("attendance", { allowRegularization: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="leave" className="mt-4">
        <PolicyCard
          title="Leave policy"
          description="Yearly entitlements and carry-forward rules."
          apiEnabled={apiEnabled}
          saving={updatePolicy.isPending}
          onSave={() => savePolicy("leave")}
        >
          <NumField
            label="Casual leave / year"
            value={policies.leave.casualPerYear}
            onChange={(v) => setPolicy("leave", { casualPerYear: v })}
          />
          <NumField
            label="Sick leave / year"
            value={policies.leave.sickPerYear}
            onChange={(v) => setPolicy("leave", { sickPerYear: v })}
          />
          <NumField
            label="Earned leave / year"
            value={policies.leave.earnedPerYear}
            onChange={(v) => setPolicy("leave", { earnedPerYear: v })}
          />
          <NumField
            label="Carry-forward cap (days)"
            value={policies.leave.carryForwardCap}
            onChange={(v) => setPolicy("leave", { carryForwardCap: v })}
          />
          <SwitchField
            label="Encashment allowed"
            value={policies.leave.encashmentAllowed}
            onChange={(v) => setPolicy("leave", { encashmentAllowed: v })}
          />
          {leavePreview && (
            <div className="sm:col-span-2 rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-semibold">Read-only calculation preview</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(leavePreview).map(([key, value]) => (
                  <div key={key} className="rounded-lg border bg-background px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {key.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-sm font-medium">{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PolicyCard>
      </TabsContent>

      <TabsContent value="timesheet" className="mt-4">
        <PolicyCard
          title="Timesheet policy"
          description="Submission cadence and locking behaviour."
          apiEnabled={apiEnabled}
          saving={updatePolicy.isPending}
          onSave={() => savePolicy("timesheet")}
        >
          <NumField
            label="Weekly hours target"
            value={policies.timesheet.weeklyHours}
            onChange={(v) => setPolicy("timesheet", { weeklyHours: v })}
          />
          <NumField
            label="Minimum daily hours"
            value={policies.timesheet.minDailyHours}
            onChange={(v) => setPolicy("timesheet", { minDailyHours: v })}
          />
          <TextField
            label="Submit by"
            value={policies.timesheet.submitBy}
            onChange={(v) => setPolicy("timesheet", { submitBy: v })}
          />
          <SwitchField
            label="Lock entries after approval"
            value={policies.timesheet.lockAfterApproval}
            onChange={(v) => setPolicy("timesheet", { lockAfterApproval: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="expense" className="mt-4">
        <PolicyCard
          title="Expense policy"
          description="Daily limits, receipt thresholds and self-approval."
          apiEnabled={apiEnabled}
          saving={updatePolicy.isPending}
          onSave={() => savePolicy("expense")}
        >
          <NumField
            label="Per-day claim limit"
            value={policies.expense.perDayLimit}
            onChange={(v) => setPolicy("expense", { perDayLimit: v })}
          />
          <NumField
            label="Receipt mandatory above"
            value={policies.expense.receiptMandatoryAbove}
            onChange={(v) => setPolicy("expense", { receiptMandatoryAbove: v })}
          />
          <SwitchField
            label="Allow self-approval (not recommended)"
            value={policies.expense.selfApprovalAllowed}
            onChange={(v) => setPolicy("expense", { selfApprovalAllowed: v })}
          />
          <NumField
            label="Auto-escalate after (days)"
            value={policies.expense.autoEscalateDays}
            onChange={(v) => setPolicy("expense", { autoEscalateDays: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="asset" className="mt-4">
        <PolicyCard
          title="Asset policy"
          description="Acknowledgement, return SLAs and warranty alerts."
          apiEnabled={apiEnabled}
          saving={updatePolicy.isPending}
          onSave={() => savePolicy("asset")}
        >
          <SwitchField
            label="Charge penalty for damaged returns"
            value={policies.asset.damagePenalty}
            onChange={(v) => setPolicy("asset", { damagePenalty: v })}
          />
          <SwitchField
            label="Mandatory employee acknowledgement"
            value={policies.asset.mandatoryAck}
            onChange={(v) => setPolicy("asset", { mandatoryAck: v })}
          />
          <NumField
            label="Return SLA (days)"
            value={policies.asset.returnSlaDays}
            onChange={(v) => setPolicy("asset", { returnSlaDays: v })}
          />
          <NumField
            label="Warranty alert window (days)"
            value={policies.asset.warrantyAlertDays}
            onChange={(v) => setPolicy("asset", { warrantyAlertDays: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="sla" className="mt-4">
        <PolicyCard
          title="Helpdesk SLA"
          description="Response & resolution targets per priority (hours)."
          apiEnabled={apiEnabled}
          saving={updatePolicy.isPending}
          onSave={() => savePolicy("sla")}
        >
          {(["urgent", "high", "normal", "low"] as const).map((priority) => (
            <div
              key={priority}
              className="md:col-span-2 grid grid-cols-1 gap-3 md:grid-cols-2 rounded-xl border bg-card/50 p-3"
            >
              <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {priority} priority
              </p>
              <NumField
                label="Response (hrs)"
                value={policies.sla[`${priority}ResponseHrs` as keyof Policies["sla"]]}
                onChange={(v) =>
                  setPolicy("sla", {
                    [`${priority}ResponseHrs`]: v,
                  } as Partial<Policies["sla"]>)
                }
              />
              <NumField
                label="Resolve (hrs)"
                value={policies.sla[`${priority}ResolveHrs` as keyof Policies["sla"]]}
                onChange={(v) =>
                  setPolicy("sla", {
                    [`${priority}ResolveHrs`]: v,
                  } as Partial<Policies["sla"]>)
                }
              />
            </div>
          ))}
        </PolicyCard>
      </TabsContent>
    </Tabs>
  );
}

function PolicyCard({
  title,
  description,
  children,
  apiEnabled,
  saving,
  onSave,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  apiEnabled: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Card className="rounded-2xl border-border/60 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {apiEnabled && (
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving}
            style={{ background: "var(--gradient-primary)" }}
            className="text-primary-foreground"
          >
            Save policy
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
      <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
        {apiEnabled
          ? "Changes are saved when the policy is submitted."
          : "Changes save automatically and are reflected across the relevant module."}
      </p>
    </Card>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="time" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SwitchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card/50 p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function policiesFromApi(items: AdminPolicyRecord[], fallback: Policies) {
  const policies: Policies = {
    attendance: { ...fallback.attendance },
    leave: { ...fallback.leave },
    timesheet: { ...fallback.timesheet },
    expense: { ...fallback.expense },
    asset: { ...fallback.asset },
    sla: { ...fallback.sla },
  };
  const versions: Record<string, number> = {};
  for (const item of items) {
    const key = item.key as PolicyKey;
    versions[key] = item.version;
    switch (key) {
      case "attendance":
        policies.attendance = {
          graceMinutes: numberValue(item.config, "graceMinutes", policies.attendance.graceMinutes),
          halfDayAfterMinutes: numberValue(
            item.config,
            "halfDayAfterMinutes",
            policies.attendance.halfDayAfterMinutes,
          ),
          autoMarkAbsentMinutes: numberValue(
            item.config,
            "autoMarkAbsentMinutes",
            policies.attendance.autoMarkAbsentMinutes,
          ),
          allowRegularization: booleanValue(
            item.config,
            "allowRegularization",
            policies.attendance.allowRegularization,
          ),
          fullDayPunchWindow: booleanValue(
            item.config,
            "fullDayPunchWindow",
            policies.attendance.fullDayPunchWindow,
          ),
          punchInStart: stringValue(item.config, "punchInStart", policies.attendance.punchInStart),
          punchInEnd: stringValue(item.config, "punchInEnd", policies.attendance.punchInEnd),
          punchOutStart: stringValue(
            item.config,
            "punchOutStart",
            policies.attendance.punchOutStart,
          ),
          punchOutEnd: stringValue(item.config, "punchOutEnd", policies.attendance.punchOutEnd),
          autoPunchOutEnabled: booleanValue(
            item.config,
            "autoPunchOutEnabled",
            policies.attendance.autoPunchOutEnabled,
          ),
          autoPunchOutTime: stringValue(
            item.config,
            "autoPunchOutTime",
            policies.attendance.autoPunchOutTime,
          ),
          allowOffDayPunches: booleanValue(
            item.config,
            "allowOffDayPunches",
            policies.attendance.allowOffDayPunches,
          ),
        };
        break;
      case "leave":
        policies.leave = {
          casualPerYear: numberValue(item.config, "casualPerYear", policies.leave.casualPerYear),
          sickPerYear: numberValue(item.config, "sickPerYear", policies.leave.sickPerYear),
          earnedPerYear: numberValue(item.config, "earnedPerYear", policies.leave.earnedPerYear),
          carryForwardCap: numberValue(
            item.config,
            "carryForwardCap",
            policies.leave.carryForwardCap,
          ),
          encashmentAllowed: booleanValue(
            item.config,
            "encashmentAllowed",
            policies.leave.encashmentAllowed,
          ),
        };
        break;
      case "timesheet":
        policies.timesheet = {
          weeklyHours: numberValue(item.config, "weeklyHours", policies.timesheet.weeklyHours),
          minDailyHours: numberValue(
            item.config,
            "minDailyHours",
            policies.timesheet.minDailyHours,
          ),
          submitBy: stringValue(item.config, "submitBy", policies.timesheet.submitBy),
          lockAfterApproval: booleanValue(
            item.config,
            "lockAfterApproval",
            policies.timesheet.lockAfterApproval,
          ),
        };
        break;
      case "expense":
        policies.expense = {
          perDayLimit: numberValue(item.config, "perDayLimit", policies.expense.perDayLimit),
          receiptMandatoryAbove: numberValue(
            item.config,
            "receiptMandatoryAbove",
            policies.expense.receiptMandatoryAbove,
          ),
          selfApprovalAllowed: booleanValue(
            item.config,
            "selfApprovalAllowed",
            policies.expense.selfApprovalAllowed,
          ),
          autoEscalateDays: numberValue(
            item.config,
            "autoEscalateDays",
            policies.expense.autoEscalateDays,
          ),
        };
        break;
      case "asset":
        policies.asset = {
          damagePenalty: booleanValue(item.config, "damagePenalty", policies.asset.damagePenalty),
          mandatoryAck: booleanValue(item.config, "mandatoryAck", policies.asset.mandatoryAck),
          returnSlaDays: numberValue(item.config, "returnSlaDays", policies.asset.returnSlaDays),
          warrantyAlertDays: numberValue(
            item.config,
            "warrantyAlertDays",
            policies.asset.warrantyAlertDays,
          ),
        };
        break;
      case "sla":
        policies.sla = {
          urgentResponseHrs: numberValue(
            item.config,
            "urgentResponseHrs",
            policies.sla.urgentResponseHrs,
          ),
          urgentResolveHrs: numberValue(
            item.config,
            "urgentResolveHrs",
            policies.sla.urgentResolveHrs,
          ),
          highResponseHrs: numberValue(
            item.config,
            "highResponseHrs",
            policies.sla.highResponseHrs,
          ),
          highResolveHrs: numberValue(item.config, "highResolveHrs", policies.sla.highResolveHrs),
          normalResponseHrs: numberValue(
            item.config,
            "normalResponseHrs",
            policies.sla.normalResponseHrs,
          ),
          normalResolveHrs: numberValue(
            item.config,
            "normalResolveHrs",
            policies.sla.normalResolveHrs,
          ),
          lowResponseHrs: numberValue(item.config, "lowResponseHrs", policies.sla.lowResponseHrs),
          lowResolveHrs: numberValue(item.config, "lowResolveHrs", policies.sla.lowResolveHrs),
        };
        break;
    }
  }
  return { policies, versions };
}

function numberValue(config: Record<string, AdminPolicyValue>, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(config: Record<string, AdminPolicyValue>, key: string, fallback: boolean) {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(config: Record<string, AdminPolicyValue>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
