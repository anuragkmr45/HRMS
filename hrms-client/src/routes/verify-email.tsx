import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  forgetDemoEmailVerificationToken,
  readDemoEmailVerificationToken,
  rememberDemoEmailVerificationToken,
} from "@/lib/demo-email-verification";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  MailCheck,
  MailWarning,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface SearchParams {
  email?: string;
  token?: string;
  state?: "sent" | "verified" | "expired" | "invalid";
  delivery_mode?: "send" | "log" | "disabled";
  delivery_status?: string;
  notice?: string;
}

export const Route = createFileRoute("/verify-email")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    email: typeof s.email === "string" ? s.email : undefined,
    token: typeof s.token === "string" ? s.token : undefined,
    state: (["sent", "verified", "expired", "invalid"] as const).find(
      (x) => x === s.state,
    ) as SearchParams["state"],
    delivery_mode: (["send", "log", "disabled"] as const).find(
      (x) => x === s.delivery_mode,
    ) as SearchParams["delivery_mode"],
    delivery_status: typeof s.delivery_status === "string" ? s.delivery_status : undefined,
    notice: typeof s.notice === "string" ? s.notice : undefined,
  }),
  head: () => ({ meta: [{ title: "Verify your email — Hawkaii HRMS" }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const {
    email,
    token,
    state: stateParam,
    delivery_mode: deliveryMode,
    delivery_status: deliveryStatus,
    notice,
  } = Route.useSearch();
  const { verifyToken, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof verifyToken>> | null>(
    null,
  );
  const [verifying, setVerifying] = useState(false);
  const devExperience =
    import.meta.env.DEV ||
    ["local", "development", "dev"].includes(
      String(import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE ?? "").toLowerCase(),
    );
  const [demoToken, setDemoToken] = useState<string | null>(() =>
    devExperience ? readDemoEmailVerificationToken(email) : null,
  );
  const [demoError, setDemoError] = useState("");
  const autoVerifyTokenLinks = devExperience;
  const emailDeliveryNotice = notice ?? deliveryNoticeFor(deliveryMode, deliveryStatus);

  const submitVerificationToken = useCallback(
    async (verificationToken: string) => {
      setVerifying(true);
      try {
        const result = await verifyToken(verificationToken);
        setVerification(result);
      } finally {
        setVerifying(false);
      }
    },
    [verifyToken],
  );

  useEffect(() => {
    let active = true;
    if (!token) {
      setVerification(null);
      return;
    }
    if (!autoVerifyTokenLinks) {
      setVerification(null);
      return;
    }
    setVerifying(true);
    void verifyToken(token)
      .then((result) => {
        if (active) setVerification(result);
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [autoVerifyTokenLinks, token, verifyToken]);

  useEffect(() => {
    setDemoToken(devExperience ? readDemoEmailVerificationToken(email) : null);
  }, [devExperience, email]);

  const continueAfterVerification = useCallback(
    (result: Awaited<ReturnType<typeof verifyToken>>) => {
      if (result.status !== "ok" || !result.pending) return false;
      if (result.nextStep === "set_password") {
        if (!result.pending.token) return false;
        navigate({ to: "/set-password", search: { token: result.pending.token }, replace: true });
        return true;
      }
      navigate({ to: "/login", replace: true });
      return true;
    },
    [navigate],
  );

  useEffect(() => {
    if (verification?.status === "ok" && verification.pending) {
      const t = setTimeout(() => {
        continueAfterVerification(verification);
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [verification, continueAfterVerification]);

  const state: NonNullable<SearchParams["state"]> = (() => {
    if (verifying) return "sent";
    if (!verification) return stateParam ?? "sent";
    if (verification.status === "ok") return "verified";
    if (verification.status === "expired") return "expired";
    return "invalid";
  })();

  const handleResend = async () => {
    if (!email) return;
    const rec = await resendVerification(email);
    if (rec) {
      if (devExperience && rec.token) {
        rememberDemoEmailVerificationToken(rec.email, rec.token);
      }
      setDemoToken(devExperience ? readDemoEmailVerificationToken(rec.email) : null);
      setResentAt(Date.now());
      navigate({
        to: "/verify-email",
        search: {
          email,
          state: "sent",
          delivery_mode: rec.emailDeliveryMode,
          delivery_status: rec.emailDeliveryStatus ?? undefined,
          notice: rec.emailDeliveryNotice ?? undefined,
        },
      });
    }
  };

  const handleConfirmVerification = async () => {
    if (!token) return;
    await submitVerificationToken(token);
  };

  const handleDemoVerify = async () => {
    if (!demoToken) return;
    setDemoError("");
    setVerifying(true);
    const result = await verifyToken(demoToken);
    setVerification(result);
    if (result.status === "ok") {
      forgetDemoEmailVerificationToken(email);
      setDemoToken(null);
      if (!continueAfterVerification(result)) {
        setDemoError(
          "Email was verified, but this demo cannot continue because the backend did not return a local setup token. Run the backend outside production mode and sign up again.",
        );
      }
    } else {
      setDemoError("The demo verification token is invalid or expired. Start signup again.");
    }
    setVerifying(false);
  };

  return (
    <AuthShell
      title={
        state === "verified"
          ? "Email verified"
          : state === "expired"
            ? "This link has expired"
            : state === "invalid"
              ? "Invalid verification link"
              : "Check your inbox"
      }
      subtitle={
        state === "verified"
          ? verification?.nextStep === "set_password" && !verification.pending?.token
            ? "Email verified. Check your inbox for the password setup link."
            : "Redirecting you to the next step..."
          : state === "expired"
            ? "Verification links are valid for 24 hours."
            : state === "invalid"
              ? "We couldn't recognise that verification link."
              : "We've sent a verification link to your email."
      }
      footer={
        <>
          Wrong account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Start over
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid place-items-center rounded-2xl border bg-secondary/40 py-8">
          {state === "verified" ? (
            <CheckCircle2 className="h-12 w-12 text-success" />
          ) : state === "expired" ? (
            <MailWarning className="h-12 w-12 text-warning" />
          ) : state === "invalid" ? (
            <XCircle className="h-12 w-12 text-destructive" />
          ) : (
            <MailCheck className="h-12 w-12 text-primary" />
          )}
        </div>

        {email && state !== "invalid" && (
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-muted-foreground">Verification sent to</p>
            <p className="mt-0.5 font-medium">{email}</p>
          </div>
        )}

        {emailDeliveryNotice && state === "sent" && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            {emailDeliveryNotice}
          </p>
        )}

        {(state === "sent" || state === "expired") && (
          <div className="space-y-3">
            {token && !autoVerifyTokenLinks && (
              <Button
                onClick={handleConfirmVerification}
                className="h-11 w-full rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
                disabled={verifying}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {verifying ? "Verifying..." : "Confirm verification"}
              </Button>
            )}
            {devExperience && demoToken && (
              <Button
                onClick={handleDemoVerify}
                className="h-11 w-full rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
                disabled={verifying}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {verifying ? "Verifying..." : "Demo verify and continue"}
              </Button>
            )}
            <Button
              onClick={handleResend}
              variant="outline"
              className="h-11 w-full rounded-xl"
              disabled={!email}
            >
              <RefreshCcw className="mr-1.5 h-4 w-4" />
              Resend verification email
            </Button>
          </div>
        )}

        {demoError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {demoError}
          </p>
        )}

        {resentAt && (
          <p className="text-center text-xs text-success">
            {deliveryMode === "disabled"
              ? "Verification request accepted. Email delivery is disabled in this environment."
              : "A new verification email has been sent."}
          </p>
        )}

        {state === "invalid" && (
          <Button
            asChild
            className="h-11 w-full rounded-xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Link to="/signup">Create a new workspace</Link>
          </Button>
        )}
      </div>
    </AuthShell>
  );
}

function deliveryNoticeFor(mode?: SearchParams["delivery_mode"], status?: string): string | null {
  if (mode === "disabled" || status === "disabled" || status === "not_configured") {
    return "Email delivery is disabled for this environment. Ask an administrator to complete verification. The development setup shortcut is available only in dev.";
  }
  if (mode === "log") {
    return "Email delivery is in log mode for this environment. In dev, use the demo setup shortcut; in QA or production, ask an administrator to enable email sending before public signup.";
  }
  if (status === "failed") {
    return "The verification email could not be sent. Ask an administrator to check the email delivery configuration.";
  }
  return null;
}
