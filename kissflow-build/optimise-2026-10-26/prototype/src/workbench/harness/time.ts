// Time helpers for the emulated host (WORKBENCH-DESIGN.md §11). Kissflow refuses DateTimes with milliseconds
// (UI-LOG L41), so the host writes and expects `YYYY-MM-DDTHH:MM:SSZ`. Built from UTC parts on purpose: the static
// guard bans `toISOString(` outside data/normalize.ts (§10.2), harness included.

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** `YYYY-MM-DDTHH:MM:SSZ` (no milliseconds) for an epoch-ms value. */
export function isoSec(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/** `YYYY-MM-DD` (UTC) for an epoch-ms value. */
export function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A DateTime string carrying fractional seconds (Kissflow answers 050312 "Invalid datetime"). */
export const hasMs = (v: unknown): boolean => typeof v === "string" && /T\d{2}:\d{2}:\d{2}[.,]\d+/.test(v);

export const DAY = 86_400_000;
export const MINUTE = 60_000;

/** Fixture base time: every fixture timestamp is base + n minutes, so fixtures are deterministic. */
export const FIXTURE_BASE = Date.UTC(2026, 9, 1, 8, 0, 0);
