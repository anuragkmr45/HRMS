import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { PASSWORD_RULES, passwordScore } from "@/lib/password";
import {
  hasCompletedOneTimeToken,
  rememberCompletedOneTimeToken,
} from "@/lib/one-time-token-history";

interface SearchParams {
  token?: string;
}

const COMPLETED_RESET_PASSWORD_TOKENS_KEY = "hawkaii_completed_reset_password_tokens";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  head: () => ({ meta: [{ title: "Reset password — Hawkaii HRMS" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const { resetPasswordWithToken } = useAuth();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const meta = passwordScore(pwd);
  const passedAll = PASSWORD_RULES.every((r) => r.test(pwd));
  const completedToken = hasCompletedOneTimeToken(COMPLETED_RESET_PASSWORD_TOKENS_KEY, token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) return setError("Missing reset token.");
    if (!passedAll) return setError("Password doesn't meet all requirements.");
    if (pwd !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    try {
      const res = await resetPasswordWithToken(token, pwd);
      if (!res.ok) return setError(res.error ?? "Could not reset password.");
      rememberCompletedOneTimeToken(COMPLETED_RESET_PASSWORD_TOKENS_KEY, token);
      setDone(true);
      setTimeout(() => navigate({ to: "/login", replace: true }), 1500);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid reset link" subtitle="Please request a new password reset.">
        <Button asChild className="h-11 w-full rounded-xl" variant="outline">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  if (completedToken) {
    return (
      <AuthShell
        title="Reset link already used"
        subtitle="This password reset link has already been completed."
      >
        <Button asChild className="h-11 w-full rounded-xl" variant="outline">
          <Link to="/login" replace>
            Continue to sign in
          </Link>
        </Button>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Redirecting you to sign in…">
        <div className="grid place-items-center rounded-2xl border bg-secondary/40 py-10">
          <CheckCircle2 className="h-14 w-14 text-success" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong, unique password.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pwd">New password</Label>
          <div className="relative">
            <Input
              id="pwd"
              type={show ? "text" : "password"}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf">Confirm password</Label>
          <Input
            id="cf"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-xl border bg-secondary/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Strength</span>
            <span className="font-medium">{meta.label}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${meta.score}%`, background: `var(--${meta.tone})` }}
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
          {submitting ? "Updating..." : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
