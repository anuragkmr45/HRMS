import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileCheck2,
  MapPinOff,
  WalletCards,
} from "lucide-react";
import type {
  AttendanceExplanationDimension,
  AttendanceExplanationDimensionKey,
} from "../daily-explanation";
import { StatusBadge } from "@/components/ui-kit";

const DIMENSION_ICONS: Record<AttendanceExplanationDimensionKey, typeof CheckCircle2> = {
  day_classification: Clock3,
  presence_state: CheckCircle2,
  punctuality_state: CircleAlert,
  evidence_state: MapPinOff,
  approval_state: FileCheck2,
  payroll_state: WalletCards,
};

interface DailySummaryDimensionsProps {
  dimensions: AttendanceExplanationDimension[];
}

export function DailySummaryDimensions({ dimensions }: DailySummaryDimensionsProps) {
  return (
    <section aria-labelledby="attendance-dimensions-heading">
      <div className="mb-3">
        <h2 id="attendance-dimensions-heading" className="text-base font-semibold">
          Status dimensions
        </h2>
        <p className="text-sm text-muted-foreground">
          Each attendance decision is shown independently.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dimensions.map((dimension) => {
          const Icon = DIMENSION_ICONS[dimension.key];
          return (
            <article key={dimension.key} className="rounded-md border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <h3 className="truncate text-sm font-medium">{dimension.label}</h3>
                </div>
                <StatusBadge status={dimension.state} label={formatState(dimension.state)} />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {dimension.explanation}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatState(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
