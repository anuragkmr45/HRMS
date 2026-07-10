import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={resolvedTheme === "dark"}
      className={cn("theme-toggle", className)}
      onClick={(event) => toggleTheme(event.currentTarget)}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__stars" />
        <span className="theme-toggle__thumb">
          <Sun className="theme-toggle__icon theme-toggle__icon--sun" />
          <Moon className="theme-toggle__icon theme-toggle__icon--moon" />
        </span>
      </span>
      <span className="sr-only">Switch to {nextTheme} mode</span>
    </button>
  );
}
