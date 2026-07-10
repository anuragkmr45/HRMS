import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import { type ThemePreference, useTheme } from "@/lib/theme";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Monitor;
}[] = [
  {
    value: "system",
    label: "System",
    description: "Follow system setting",
    icon: Monitor,
  },
  {
    value: "light",
    label: "Light",
    description: "Always use light",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use dark",
    icon: Moon,
  },
];

export function AppearanceMenuItems() {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Appearance</span>
        <span className="normal-case tracking-normal text-muted-foreground/80">
          {resolvedTheme === "dark" ? "Dark" : "Light"}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={preference}>
        {OPTIONS.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            onSelect={(event) => {
              setPreference(option.value, { sourceElement: event.currentTarget as HTMLElement });
            }}
            className="items-start gap-2"
          >
            <option.icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm leading-5">{option.label}</span>
              <span className="text-xs leading-4 text-muted-foreground">{option.description}</span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

export function AppearanceSidebarControl({ className }: { className?: string }) {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <div className={cn("glass-control rounded-xl border border-sidebar-border p-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/65">
            Appearance
          </p>
          <p className="mt-0.5 text-xs text-sidebar-foreground/80">
            {preference === "system" ? "System" : preference === "dark" ? "Dark" : "Light"} ·{" "}
            {resolvedTheme === "dark" ? "Dark active" : "Light active"}
          </p>
        </div>
        <ThemeToggle className="shrink-0" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-sidebar/70 p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={preference === option.value}
            onClick={(event) => setPreference(option.value, { sourceElement: event.currentTarget })}
            className={cn(
              "rounded-full px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 transition hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
              preference === option.value &&
                "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:text-sidebar-primary-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
