import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModuleTab {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** When true, only an exact pathname match counts as active. */
  exact?: boolean;
}

interface Props {
  tabs: ModuleTab[];
  className?: string;
}

/**
 * Shared horizontal tab strip used by module layouts (Expenses, Helpdesk,
 * Assets, Leave, Timesheet, Attendance, EMS, Reports, Admin Settings).
 * Visuals are intentionally identical to the previous inline strips so
 * existing screens continue to look the same — just cleaner and consistent.
 */
export function ModuleTabs({ tabs, className }: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div
      className={cn(
        "-mx-1 max-w-full overflow-x-auto overscroll-x-contain border-b px-1",
        "scrollbar-thin",
        className,
      )}
    >
      <div role="tablist" className="flex w-max min-w-full snap-x gap-1 pt-1">
        {tabs.map((t) => {
          const active = t.exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              role="tab"
              aria-selected={active}
              className={cn(
                "group inline-flex snap-start items-center gap-2 whitespace-nowrap rounded-t-xl border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
              ) : null}
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
