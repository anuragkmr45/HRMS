import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui-kit";
import { ArrowRight, Building2 } from "lucide-react";
import { rememberDemoEmailVerificationToken } from "@/lib/demo-email-verification";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your workspace — Hawkaii HRMS" },
      { name: "description", content: "Create your Hawkaii HRMS workspace in minutes." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    companyName: "",
    contact: "",
  });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isDevExperience =
    import.meta.env.DEV ||
    ["local", "development", "dev"].includes(
      String(import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE ?? "").toLowerCase(),
    );

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName || !form.lastName || !form.email || !form.companyName || !form.contact) {
      setError("Please complete all required fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid company email address.");
      return;
    }
    if (!agree) {
      setError("Please accept the Terms and Conditions to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const rec = await signup(form);
      if (isDevExperience && rec.token) {
        rememberDemoEmailVerificationToken(rec.email, rec.token);
      }
      navigate({
        to: "/verify-email",
        search: {
          email: rec.email,
          state: "sent",
          delivery_mode: rec.emailDeliveryMode,
          delivery_status: rec.emailDeliveryStatus ?? undefined,
          notice: rec.emailDeliveryNotice ?? undefined,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="The first verified user becomes your workspace's Main Admin."
      highlight={{
        eyebrow: "Set up in under 2 minutes",
        heading: (
          <>
            Bring your team into a{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              calmer, faster HR.
            </span>
          </>
        ),
        body: "Roles, approvals, attendance and reports — pre-configured with sensible defaults you can fine-tune later.",
      }}
      footer={
        <>
          Already have a workspace?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="First name"
            id="fn"
            value={form.firstName}
            onChange={update("firstName")}
            required
          />
          <Field
            label="Middle name"
            id="mn"
            value={form.middleName}
            onChange={update("middleName")}
          />
        </div>
        <Field
          label="Last name"
          id="ln"
          value={form.lastName}
          onChange={update("lastName")}
          required
        />
        <Field
          label="Company email"
          id="email"
          type="email"
          value={form.email}
          onChange={update("email")}
          required
          placeholder="you@company.com"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Company name"
            id="company"
            value={form.companyName}
            onChange={update("companyName")}
            required
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <div className="space-y-1.5">
            <Label htmlFor="contact">
              Contact number<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <PhoneInput
              id="contact"
              value={form.contact}
              onChange={(value) => setForm((current) => ({ ...current, contact: value }))}
              required
              placeholder="555 0100"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 rounded-xl border bg-secondary/40 p-3">
          <Checkbox
            checked={agree}
            onCheckedChange={(c) => setAgree(c === true)}
            className="mt-0.5"
          />
          <span className="text-xs text-muted-foreground">
            I agree to the Hawkaii HRMS{" "}
            <a href="#" className="font-medium text-primary hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="font-medium text-primary hover:underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>

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
          {submitting ? "Creating workspace..." : "Create workspace"}{" "}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  );
}

function Field({
  label,
  id,
  icon,
  ...props
}: {
  label: string;
  id: string;
  icon?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {props.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>}
        <Input id={id} {...props} className={icon ? "pl-9" : undefined} />
      </div>
    </div>
  );
}
