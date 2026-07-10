import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export type StatTone = "primary" | "success" | "warning" | "info" | "destructive";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: { value: string; direction: "up" | "down" };
  icon?: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  /** Subtle gradient ribbon at the top of the card. */
  accent?: boolean;
  className?: string;
}

const TONE: Record<StatTone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground dark:bg-warning/15 dark:text-warning",
  info: "bg-info/15 text-info",
  destructive: "bg-destructive/15 text-destructive",
};

const ACCENT: Record<StatTone, string> = {
  primary: "from-primary/70 to-primary/0",
  success: "from-success/70 to-success/0",
  warning: "from-warning/80 to-warning/0",
  info: "from-info/70 to-info/0",
  destructive: "from-destructive/70 to-destructive/0",
};

export function StatCard({
  label,
  value,
  hint,
  trend,
  icon: Icon,
  tone = "primary",
  accent = false,
  className,
}: Props) {
  return (
    <Card className={cn("surface-card-hover relative overflow-hidden p-5", className)}>
      {accent && (
        <div
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r", ACCENT[tone])}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
                  trend.direction === "up"
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive",
                )}
              >
                {trend.direction === "up" ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {trend.value}
              </span>
            )}
            {hint}
          </div>
        </div>
        {Icon && (
          <div
            data-stat-icon
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-border/60",
              TONE[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}
