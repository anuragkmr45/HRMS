import { cn } from "@/lib/utils";

const WARNING_SOFT =
  "bg-warning/20 text-warning-foreground border-warning/40 dark:bg-warning/15 dark:text-warning dark:border-warning/30";

const MAP: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-success/15 text-success border-success/20" },
  active: { label: "Active", cls: "bg-success/15 text-success border-success/20" },
  paid: { label: "Paid", cls: "bg-success/15 text-success border-success/20" },
  completed: { label: "Completed", cls: "bg-success/15 text-success border-success/20" },
  present: { label: "Present", cls: "bg-success/15 text-success border-success/20" },
  confirmed: { label: "Confirmed", cls: "bg-success/15 text-success border-success/20" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground border-border" },
  inactive: { label: "Inactive", cls: "bg-muted text-muted-foreground border-border" },
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border" },
  exited: { label: "Exited", cls: "bg-muted text-muted-foreground border-border" },
  in_stock: { label: "In Stock", cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border" },
  planned: { label: "Planned", cls: "bg-info/15 text-info border-info/30" },
  green: { label: "On track", cls: "bg-success/15 text-success border-success/20" },
  amber: { label: "At risk", cls: WARNING_SOFT },
  red: { label: "Critical", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  fixed: { label: "Fixed", cls: "bg-info/15 text-info border-info/30" },
  hourly: { label: "Hourly", cls: "bg-info/15 text-info border-info/30" },
  retainer: { label: "Retainer", cls: "bg-info/15 text-info border-info/30" },
  internal: { label: "Internal", cls: "bg-muted text-muted-foreground border-border" },
  client: { label: "Client", cls: "bg-info/15 text-info border-info/30" },
  billable: { label: "Billable", cls: "bg-success/15 text-success border-success/20" },
  non_billable: { label: "Non-billable", cls: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", cls: WARNING_SOFT },
  on_hold: { label: "On Hold", cls: WARNING_SOFT },
  late: { label: "Late", cls: WARNING_SOFT },
  repair: { label: "In Repair", cls: WARNING_SOFT },
  probation: { label: "Probation", cls: WARNING_SOFT },
  notice_period: {
    label: "Notice period",
    cls: WARNING_SOFT,
  },
  onboarding: { label: "Onboarding", cls: "bg-info/15 text-info border-info/30" },
  invited: { label: "Invited", cls: "bg-info/15 text-info border-info/30" },
  open: { label: "Open", cls: "bg-info/15 text-info border-info/30" },
  in_progress: { label: "In Progress", cls: "bg-info/15 text-info border-info/30" },
  wfh: { label: "WFH", cls: "bg-info/15 text-info border-info/30" },
  assigned: { label: "Assigned", cls: "bg-info/15 text-info border-info/30" },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  absent: { label: "Absent", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  overdue: { label: "Overdue", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  // Expense workflow
  submitted: { label: "Submitted", cls: "bg-info/15 text-info border-info/30" },
  pending_manager: {
    label: "Pending Manager",
    cls: WARNING_SOFT,
  },
  returned: {
    label: "Returned",
    cls: WARNING_SOFT,
  },
  manager_returned: {
    label: "Manager Returned",
    cls: WARNING_SOFT,
  },
  manager_rejected: {
    label: "Manager Rejected",
    cls: "bg-destructive/15 text-destructive border-destructive/30",
  },
  finance_verification: {
    label: "Finance Verification",
    cls: "bg-info/15 text-info border-info/30",
  },
  finance_hold: {
    label: "Finance Hold",
    cls: WARNING_SOFT,
  },
  finance_verified: {
    label: "Finance Verified",
    cls: "bg-success/15 text-success border-success/20",
  },
  payment_released: {
    label: "Payment Released",
    cls: "bg-success/15 text-success border-success/20",
  },
  bills_submitted: { label: "Bills Submitted", cls: "bg-info/15 text-info border-info/30" },
  settlement_review: {
    label: "Settlement Review",
    cls: WARNING_SOFT,
  },
  pending_adjustment: {
    label: "Pending Adjustment",
    cls: WARNING_SOFT,
  },
  withdrawn: { label: "Withdrawn", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const m = MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        m.cls,
      )}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label ?? m.label}
    </span>
  );
}
