import * as React from "react";
import { ThemeContext } from "@/lib/theme";
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  THEME_SYSTEM_QUERY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme-utils";

type ViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

function shouldReduceMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function supportsViewTransition(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as ViewTransitionDocument).startViewTransition === "function"
  );
}

async function runThemeTransition({
  sourceElement,
  applyPreference,
  syncState,
}: {
  sourceElement?: HTMLElement | null;
  applyPreference: () => ResolvedTheme;
  syncState: (resolvedTheme: ResolvedTheme) => void;
}) {
  if (
    typeof window === "undefined" ||
    !sourceElement ||
    shouldReduceMotion() ||
    !supportsViewTransition()
  ) {
    syncState(applyPreference());
    return;
  }

  const rect = sourceElement.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  const root = document.documentElement;
  let committedTheme: ResolvedTheme | null = null;

  const transition = (document as ViewTransitionDocument).startViewTransition?.(() => {
    committedTheme = applyPreference();
  });

  if (!transition) {
    syncState(applyPreference());
    return;
  }

  try {
    await transition.ready;
    const revealAnimation = root.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 680,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
    await Promise.allSettled([revealAnimation.finished, transition.finished]);
    if (committedTheme) {
      syncState(committedTheme);
    }
  } catch {
    const resolved = committedTheme ?? applyPreference();
    syncState(resolved);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() =>
    resolveTheme(readStoredPreference()),
  );

  const transitionInFlightRef = React.useRef(false);

  const syncPreferenceState = React.useCallback(
    (nextPreference: ThemePreference, nextResolved: ResolvedTheme) => {
      setPreferenceState(nextPreference);
      setResolvedTheme(nextResolved);
    },
    [],
  );

  const applyPreference = React.useCallback((nextPreference: ThemePreference) => {
    return applyTheme(nextPreference);
  }, []);

  React.useEffect(() => {
    const currentPreference = readStoredPreference();
    const nextResolved = applyTheme(currentPreference);
    setPreferenceState(currentPreference);
    setResolvedTheme(nextResolved);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia?.(THEME_SYSTEM_QUERY);
    if (!media) return;

    const handleChange = () => {
      if (readStoredPreference() !== "system") return;
      const nextResolved = applyTheme("system");
      setPreferenceState("system");
      setResolvedTheme(nextResolved);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener?.(handleChange);
    return () => media.removeListener?.(handleChange);
  }, []);

  const setPreference = React.useCallback(
    (nextPreference: ThemePreference, options?: { sourceElement?: HTMLElement | null }) => {
      if (transitionInFlightRef.current) return;

      transitionInFlightRef.current = true;
      void runThemeTransition({
        sourceElement: options?.sourceElement,
        applyPreference: () => applyPreference(nextPreference),
        syncState: (nextResolved) => syncPreferenceState(nextPreference, nextResolved),
      }).finally(() => {
        transitionInFlightRef.current = false;
      });
    },
    [applyPreference, syncPreferenceState],
  );

  const toggleTheme = React.useCallback(
    (sourceElement?: HTMLElement | null) => {
      setPreference(resolvedTheme === "dark" ? "light" : "dark", { sourceElement });
    },
    [resolvedTheme, setPreference],
  );

  const value = React.useMemo(
    () => ({ preference, resolvedTheme, setPreference, toggleTheme }),
    [preference, resolvedTheme, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
