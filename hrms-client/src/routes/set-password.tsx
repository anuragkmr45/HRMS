import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, dashboardPathForRole } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { PASSWORD_RULES, passwordScore } from "@/lib/password";
import {
  hasCompletedOneTimeToken,
  rememberCompletedOneTimeToken,
} from "@/lib/one-time-token-history";

interface SearchParams {
  token?: string;
}

const COMPLETED_SET_PASSWORD_TOKENS_KEY = "hawkaii_completed_set_password_tokens";

export const Route = createFileRoute("/set-password")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  head: () => ({ meta: [{ title: "Set your password — Hawkaii HRMS" }] }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const { token } = Route.useSearch();
  const { setPasswordForToken } = useAuth();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ isFirstAdmin: boolean; role: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const meta = passwordScore(pwd);
  const passedAll = PASSWORD_RULES.every((r) => r.test(pwd));
  const completedToken = hasCompletedOneTimeToken(COMPLETED_SET_PASSWORD_TOKENS_KEY, token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) return setError("Missing verification token.");
    if (!passedAll) return setError("Your password doesn't meet all requirements yet.");
    if (pwd !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    try {
      const result = await setPasswordForToken(token, pwd);
      if (!result.ok) return setError(result.error ?? "Could not set password.");
      rememberCompletedOneTimeToken(COMPLETED_SET_PASSWORD_TOKENS_KEY, token);
      setSuccess({
        isFirstAdmin: !!result.isFirstAdmin,
        role: result.user?.roles[0] ?? "employee",
      });
      setTimeout(() => {
        if (result.requiresLogin) navigate({ to: "/login", replace: true });
        else if (result.isFirstAdmin) navigate({ to: "/onboarding", replace: true });
        else
          navigate({
            to: dashboardPathForRole(result.user?.roles[0] ?? "employee"),
            replace: true,
          });
      }, 1400);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid link" subtitle="This password setup link is not valid.">
        <Button asChild className="h-11 w-full rounded-xl" variant="outline">
          <Link to="/signup">Start a new signup</Link>
        </Button>
      </AuthShell>
    );
  }

  if (completedToken) {
    return (
      <AuthShell
        title="Password link already used"
        subtitle="This password setup link has already been completed."
      >
        <Button asChild className="h-11 w-full rounded-xl" variant="outline">
          <Link to="/login" replace>
            Continue to sign in
          </Link>
        </Button>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell title="Password created" subtitle="You're all set. Redirecting you now…">
        <div className="grid place-items-center rounded-2xl border bg-secondary/40 py-10">
          <CheckCircle2 className="h-14 w-14 text-success" />
          <p className="mt-3 text-sm text-muted-foreground">
            {success.isFirstAdmin
              ? "Sign in to finish company setup."
              : "Welcome to your dashboard."}
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set your password"
      subtitle="Choose a strong password to secure your workspace."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="New password"
          id="pwd"
          value={pwd}
          onChange={setPwd}
          show={show}
          setShow={setShow}
        />
        <PasswordField
          label="Confirm password"
          id="cf"
          value={confirm}
          onChange={setConfirm}
          show={show}
          setShow={setShow}
        />

        <div className="space-y-2 rounded-xl border bg-secondary/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Strength</span>
            <span className={tone(meta.tone)}>{meta.label}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${meta.score}%`, background: barColor(meta.tone) }}
            />
          </div>
          <ul className="grid grid-cols-1 gap-1 pt-1 text-[11px] sm:grid-cols-2">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(pwd);
              return (
                <li key={r.key} className={ok ? "text-success" : "text-muted-foreground"}>
                  <CheckCircle2 className={`mr-1 inline h-3 w-3 ${ok ? "" : "opacity-30"}`} />
                  {r.label}
                </li>
              );
            })}
          </ul>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-xl text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          {submitting ? "Saving password..." : "Save password"}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Your password is encrypted and never shared
        </p>
      </form>
    </AuthShell>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  setShow,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function tone(t: "destructive" | "warning" | "info" | "success") {
  switch (t) {
    case "destructive":
      return "font-medium text-destructive";
    case "warning":
      return "font-medium text-warning-foreground dark:text-warning";
    case "info":
      return "font-medium text-info";
    case "success":
      return "font-medium text-success";
  }
}
function barColor(t: "destructive" | "warning" | "info" | "success") {
  switch (t) {
    case "destructive":
      return "var(--destructive)";
    case "warning":
      return "var(--warning)";
    case "info":
      return "var(--info)";
    case "success":
      return "var(--success)";
  }
}
