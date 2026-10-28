// The data console's client tells this signal before each wait for a rate-limited call (kf/client.ts onRateLimit), so
// the console can say why it is slow (DataShell's RateLimitNote, the bulk delete's progress) instead of looking stuck.
// No Kissflow call of its own.
import { useEffect, useState, useSyncExternalStore } from "react";

export interface RateSignal {
  /** The client waits `waitMs` before trying a rate-limited call again. */
  emit(waitMs: number): void;
  /** Until when (ms since the epoch) the console waits; 0 when it never waited. */
  until(): number;
  subscribe(listener: () => void): () => void;
}

/** Whole seconds the console still waits for a rate-limited call (0: it does not wait); re-renders while it lasts. */
export function useRateWait(rate: RateSignal): number {
  const until = useSyncExternalStore(rate.subscribe, rate.until, rate.until);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    setNow(Date.now());
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [until]);
  const left = until - now;
  return left > 0 ? Math.max(1, Math.ceil(left / 1000)) : 0;
}

export function createRateSignal(now: () => number = Date.now): RateSignal {
  let until = 0;
  const listeners = new Set<() => void>();
  return {
    emit(waitMs) {
      until = Math.max(until, now() + Math.max(0, waitMs));
      for (const l of listeners) l();
    },
    until: () => until,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
