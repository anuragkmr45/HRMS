import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminSettings, type SecuritySettings } from "@/lib/admin-settings-store";
import {
  useAdminSecuritySettings,
  useUpdateAdminSecuritySettingsMutation,
  type AdminSecuritySettingsRecord,
} from "@/domains/admin";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/security")({
  component: SecurityScreen,
});

function SecurityScreen() {
  const { security, setSecurity } = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const settingsQuery = useAdminSecuritySettings(apiEnabled);
  const updateMutation = useUpdateAdminSecuritySettingsMutation();
  const apiSecurity = useMemo(
    () => (settingsQuery.data ? mapApiSecurity(settingsQuery.data) : null),
    [settingsQuery.data],
  );
  const [draft, setDraft] = useState<SecuritySettings>(apiSecurity ?? security);

  useEffect(() => {
    setDraft(apiSecurity ?? security);
  }, [apiSecurity, security]);

  const update = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const onSave = () => {
    if (!apiEnabled) {
      setSecurity(draft);
      toast.success("Security settings updated");
      return;
    }
    if (!settingsQuery.data?.version) {
      toast.error("Security settings have not loaded yet.");
      return;
    }
    updateMutation.mutate(toApiSecurityPayload(draft, settingsQuery.data.version), {
      onSuccess: (response) => {
        const next = mapApiSecurity(response.settings);
        setSecurity(next);
        setDraft(next);
        toast.success("Security settings updated");
      },
      onError: (error) => {
        toastApiError(error, "Security settings update failed");
      },
    });
  };

  return (
    <div className="space-y-4">
      {apiEnabled && settingsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading security settings from backend...</p>
      ) : null}
      {apiEnabled && settingsQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Security settings could not be loaded. {settingsQuery.error.message}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/60 p-5">
          <p className="text-sm font-semibold">Password policy</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Enforce at signup, password reset and admin-set passwords.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumField
              label="Minimum length"
              value={draft.passwordMinLength}
              min={8}
              max={128}
              onChange={(v) => update("passwordMinLength", v)}
            />
            <NumField
              label="Expiry (days)"
              value={draft.passwordExpiryDays}
              min={0}
              max={730}
              onChange={(v) => update("passwordExpiryDays", v)}
            />
          </div>
          <div className="mt-3 space-y-2">
            <SwitchRow
              label="Require special character"
              value={draft.passwordRequireSpecial}
              onChange={(v) => update("passwordRequireSpecial", v)}
            />
            <SwitchRow
              label="Require number"
              value={draft.passwordRequireNumber}
              onChange={(v) => update("passwordRequireNumber", v)}
            />
          </div>
        </Card>

        <Card className="rounded-2xl border-border/60 p-5">
          <p className="text-sm font-semibold">Sessions & login</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Idle timeout, brute-force protection and future MFA readiness.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumField
              label="Session timeout (mins)"
              value={draft.sessionTimeoutMinutes}
              min={5}
              max={1440}
              onChange={(v) => update("sessionTimeoutMinutes", v)}
            />
            <NumField
              label="Login attempt limit"
              value={draft.loginAttemptLimit}
              min={1}
              max={100}
              onChange={(v) => update("loginAttemptLimit", v)}
            />
          </div>
          <div className="mt-3 space-y-2">
            <SwitchRow
              label={
                <span>
                  Multi-factor authentication
                  <span className="ml-2 text-xs text-muted-foreground">provider pending</span>
                </span>
              }
              value={false}
              disabled
              onChange={() => update("mfaEnabled", false)}
            />
          </div>
        </Card>

        <Card className="rounded-2xl border-border/60 p-5 lg:col-span-2">
          <p className="text-sm font-semibold">Audit & device tracking</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Critical changes are logged immutably in the audit log.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <SwitchRow
              label="Log every role change"
              value={draft.auditRoleChanges}
              onChange={(v) => update("auditRoleChanges", v)}
            />
            <SwitchRow
              label="Track IP & device per session"
              value={draft.ipDeviceAuditEnabled}
              onChange={(v) => update("ipDeviceAuditEnabled", v)}
            />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground dark:border-warning/30 dark:bg-warning/10">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground dark:text-warning" />
            Disabling these audits weakens compliance reporting. Coordinate with your security team
            before turning them off.
          </div>
        </Card>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setDraft(apiSecurity ?? security)}>
          Reset
        </Button>
        <Button
          onClick={onSave}
          disabled={apiEnabled && (settingsQuery.isLoading || updateMutation.isPending)}
        >
          Save security settings
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
function SwitchRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: React.ReactNode;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card/50 px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <Switch checked={value} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function mapApiSecurity(settings: AdminSecuritySettingsRecord): SecuritySettings {
  return {
    passwordMinLength: settings.password_min_length,
    passwordRequireSpecial: settings.password_require_special,
    passwordRequireNumber: settings.password_require_number,
    passwordExpiryDays: settings.password_expiry_days,
    sessionTimeoutMinutes: settings.session_timeout_minutes,
    loginAttemptLimit: settings.login_attempt_limit,
    mfaEnabled: false,
    auditRoleChanges: settings.audit_role_changes,
    ipDeviceAuditEnabled: settings.ip_device_audit_enabled,
  };
}

function toApiSecurityPayload(settings: SecuritySettings, expectedVersion: number) {
  return {
    password_min_length: settings.passwordMinLength,
    password_require_special: settings.passwordRequireSpecial,
    password_require_number: settings.passwordRequireNumber,
    password_expiry_days: settings.passwordExpiryDays,
    session_timeout_minutes: settings.sessionTimeoutMinutes,
    login_attempt_limit: settings.loginAttemptLimit,
    mfa_enabled: false as const,
    audit_role_changes: settings.auditRoleChanges,
    ip_device_audit_enabled: settings.ipDeviceAuditEnabled,
    expected_version: expectedVersion,
  };
}
