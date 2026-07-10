import * as React from "react";
import type { ResolvedTheme, ThemePreference } from "@/lib/theme-utils";

export type { ResolvedTheme, ThemePreference } from "@/lib/theme-utils";
export { applyTheme, getSystemTheme, resolveTheme } from "@/lib/theme-utils";

export interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (
    preference: ThemePreference,
    options?: { sourceElement?: HTMLElement | null },
  ) => void;
  toggleTheme: (sourceElement?: HTMLElement | null) => void;
}

export const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const value = React.useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }
  return value;
}
