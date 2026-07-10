import { cn } from "@/lib/utils";
import { computeSla, type SlaState, type Ticket } from "@/lib/mock/helpdesk";
import { PRIORITY_TONE } from "@/lib/helpdesk-store";
import type { TicketPriority } from "@/lib/mock/helpdesk";

const SLA_LABEL: Record<SlaState, string> = {
  on_track: "On track",
  near_breach: "Near breach",
  breached: "Breached",
  met: "SLA met",
};

const SLA_CLS: Record<SlaState, string> = {
  on_track: "bg-success/15 text-success border-success/20",
  near_breach:
    "bg-warning/20 text-warning-foreground border-warning/40 dark:bg-warning/15 dark:text-warning dark:border-warning/30",
  breached: "bg-destructive/15 text-destructive border-destructive/30",
  met: "bg-muted text-muted-foreground border-border",
};

export function SlaBadge({ ticket }: { ticket: Ticket }) {
  const sla = computeSla(ticket);
  const state = ticket.status === "closed" || ticket.status === "resolved" ? "met" : sla.worst;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        SLA_CLS[state],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {SLA_LABEL[state]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {priority}
    </span>
  );
}
