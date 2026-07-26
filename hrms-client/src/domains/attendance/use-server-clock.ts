import { useEffect, useMemo, useState } from "react";

interface ServerClock {
  now: Date | null;
  isAvailable: boolean;
}

function monotonicNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

export function useServerClock(serverTime: string | null | undefined): ServerClock {
  const anchor = useMemo(() => {
    const serverTimeMs = serverTime ? Date.parse(serverTime) : Number.NaN;
    if (!Number.isFinite(serverTimeMs)) return null;
    return { serverTimeMs, elapsedAnchorMs: monotonicNow() };
  }, [serverTime]);
  const [nowMs, setNowMs] = useState<number | null>(() => anchor?.serverTimeMs ?? null);

  useEffect(() => {
    if (!anchor) {
      setNowMs(null);
      return;
    }

    const tick = () => {
      const elapsedMs = Math.max(0, monotonicNow() - anchor.elapsedAnchorMs);
      setNowMs(anchor.serverTimeMs + elapsedMs);
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [anchor]);

  return {
    now: nowMs === null ? null : new Date(nowMs),
    isAvailable: nowMs !== null,
  };
}
