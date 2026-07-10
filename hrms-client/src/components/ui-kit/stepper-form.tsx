import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Step {
  title: string;
  description?: string;
  content: ReactNode;
}

interface Props {
  steps: Step[];
  onComplete?: () => void;
  completeLabel?: string;
  activeStep?: number;
  onStepChange?: (step: number) => void;
}

export function StepperForm({
  steps,
  onComplete,
  completeLabel = "Submit",
  activeStep,
  onStepChange,
}: Props) {
  const [internalActive, setInternalActive] = useState(0);
  const active = Math.min(steps.length - 1, Math.max(0, activeStep ?? internalActive));
  const setActive = (next: number | ((current: number) => number)) => {
    const resolved = typeof next === "function" ? next(active) : next;
    const clamped = Math.min(steps.length - 1, Math.max(0, resolved));
    if (onStepChange) onStepChange(clamped);
    else setInternalActive(clamped);
  };
  const isLast = active === steps.length - 1;

  return (
    <div className="min-w-0 space-y-6">
      <ol className="flex min-w-0 items-center gap-2 sm:gap-4">
        {steps.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li key={s.title} className="flex min-w-0 flex-1 items-center gap-2">
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
                {s.description && (
                  <p className="truncate text-[11px] text-muted-foreground">{s.description}</p>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("ml-1 h-px flex-1", done ? "bg-success" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">{steps[active].content}</div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          disabled={active === 0}
          onClick={() => setActive((a) => Math.max(0, a - 1))}
        >
          Back
        </Button>
        <Button
          onClick={() => {
            if (isLast) onComplete?.();
            else setActive((a) => Math.min(steps.length - 1, a + 1));
          }}
          style={{ background: "var(--gradient-primary)" }}
          className="text-primary-foreground"
        >
          {isLast ? completeLabel : "Continue"}
        </Button>
      </div>
    </div>
  );
}
