import type { ComponentType, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "primary" | "info" | "success" | "warning" | "neutral";

const TONE: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground dark:bg-warning/15 dark:text-warning",
  neutral: "bg-muted text-muted-foreground",
};

interface Props {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  tone?: Tone;
  footer?: ReactNode;
  className?: string;
}

export function InfoCard({
  icon: Icon,
  title,
  description,
  tone = "primary",
  footer,
  className,
}: Props) {
  return (
    <Card className={cn("rounded-2xl border-border/60 p-5", className)}>
      <div className={cn("grid h-10 w-10 place-items-center rounded-xl", TONE[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-base font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  );
}
