import { Clock3, Info, LockKeyhole } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui-kit";
import type { AttendanceDailyExplanation } from "../daily-explanation";
import { AttendanceEventTimeline } from "./attendance-event-timeline";
import { DailySummaryDimensions } from "./daily-summary-dimensions";

interface DailyExplanationViewProps {
  explanation: AttendanceDailyExplanation;
}

export function DailyExplanationView({ explanation }: DailyExplanationViewProps) {
  return (
    <div className="space-y-5">
      <Card className="rounded-md border-border/70">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {explanation.employee.employeeCode}
            </p>
            <h1 className="truncate text-xl font-semibold">{explanation.employee.fullName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(explanation.workDate)}</p>
          </div>
          <StatusBadge
            status={explanation.summary.status}
            label={formatLabel(explanation.summary.status)}
          />
        </div>
        <div className="grid grid-cols-2 border-t sm:grid-cols-4">
          <SummaryMetric label="In" value={explanation.summary.inTime ?? "-"} />
          <SummaryMetric label="Out" value={explanation.summary.outTime ?? "-"} />
          <SummaryMetric label="Work" value={durationText(explanation.summary.workMinutes)} />
          <SummaryMetric label="Break" value={durationText(explanation.summary.breakMinutes)} />
        </div>
      </Card>

      <DailySummaryDimensions dimensions={explanation.dimensions} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <AttendanceEventTimeline events={explanation.sourceEvents} />
        <section aria-labelledby="decision-reasons-heading">
          <div className="mb-3">
            <h2 id="decision-reasons-heading" className="text-base font-semibold">
              Decision reasons
            </h2>
            <p className="text-sm text-muted-foreground">
              Rules and workflow facts affecting the summary.
            </p>
          </div>
          <ul className="space-y-2">
            {explanation.reasons.map((reason) => (
              <li key={reason.code} className="rounded-md border bg-card p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">{formatLabel(reason.code)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{reason.message}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {explanation.regularization && (
            <>
              <Separator className="my-4" />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Regularization</h3>
                  <StatusBadge status={explanation.regularization.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {explanation.regularization.reason}
                </p>
                {explanation.regularization.decisionRemarks && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Decision: {explanation.regularization.decisionRemarks}
                  </p>
                )}
              </div>
            </>
          )}

          {explanation.restrictedEvidenceOmitted && (
            <div className="mt-4 flex items-start gap-2 rounded-md border bg-muted/30 p-3">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs leading-5 text-muted-foreground">
                Restricted location, device, network, and attestation evidence is omitted.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b p-4 last:border-b-0 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function durationText(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}m`;
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
