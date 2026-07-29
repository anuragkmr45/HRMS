import { Check, Coffee, LogIn, LogOut, Play } from "lucide-react";
import type { AttendanceExplanationSourceEvent } from "../daily-explanation";
import { StatusBadge } from "@/components/ui-kit";

const EVENT_ICONS: Record<AttendanceExplanationSourceEvent["eventType"], typeof Check> = {
  check_in: LogIn,
  break_start: Coffee,
  break_end: Play,
  check_out: LogOut,
};

const EVENT_LABELS: Record<AttendanceExplanationSourceEvent["eventType"], string> = {
  check_in: "Checked in",
  break_start: "Break started",
  break_end: "Work resumed",
  check_out: "Checked out",
};

interface AttendanceEventTimelineProps {
  events: AttendanceExplanationSourceEvent[];
}

export function AttendanceEventTimeline({ events }: AttendanceEventTimelineProps) {
  return (
    <section aria-labelledby="source-events-heading">
      <div className="mb-3">
        <h2 id="source-events-heading" className="text-base font-semibold">
          Source events
        </h2>
        <p className="text-sm text-muted-foreground">Accepted events used to calculate this day.</p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No accepted attendance events were recorded for this date.
        </div>
      ) : (
        <ol className="relative space-y-0 border-l border-border pl-5">
          {events.map((event) => {
            const Icon = EVENT_ICONS[event.eventType];
            return (
              <li key={event.id} className="relative pb-6 last:pb-0">
                <span className="absolute -left-[29px] flex h-4 w-4 items-center justify-center rounded-full border bg-background">
                  <Icon className="h-2.5 w-2.5" aria-hidden />
                </span>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">{EVENT_LABELS[event.eventType]}</h3>
                    <p className="text-xs text-muted-foreground">
                      {event.localTime ?? "Time unavailable"} / {formatLabel(event.sourceChannel)} /{" "}
                      {formatLabel(event.workMode)}
                    </p>
                  </div>
                  <StatusBadge status={event.verdict} label={formatLabel(event.verdict)} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.reasonCodes.map((code) => (
                    <span
                      key={code}
                      className="rounded-sm bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {formatLabel(code)}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
