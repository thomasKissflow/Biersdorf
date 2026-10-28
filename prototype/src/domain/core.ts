// Low-level state helpers shared by every action module (no domain rules here). Actions are pure: they take the
// state, the acting user id and a timestamp, and return a new state. A refusal returns the state unchanged apart from
// a toast marked `refusal`, so the store never shows a success message for it.

import type { AppState, CiqCase, LogEvent, Phase, Toast } from "./types";

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export const getCase = (s: AppState, id: string) => s.cases.find((c) => c.id === id);
export const mapCase = (s: AppState, id: string, fn: (c: CiqCase) => CiqCase): AppState => ({ ...s, cases: s.cases.map((c) => (c.id === id ? fn(c) : c)) });

export function toast(s: AppState, tone: Toast["tone"], text: string): AppState {
  return { ...s, toasts: [...s.toasts.slice(-3), { id: uid("t"), tone, text }] };
}

/** A guard said no: unchanged state plus an explaining toast (tone danger, or info for a harmless no-op). */
export function refuse(s: AppState, text: string, tone: Toast["tone"] = "danger"): AppState {
  return { ...s, toasts: [...s.toasts.slice(-3), { id: uid("t"), tone, text, refusal: true }] };
}

/** True when `next` is `prev` refused by a guard (or not changed at all). */
export function wasRefused(prev: AppState, next: AppState): boolean {
  if (next === prev) return true;
  const t = next.toasts.at(-1);
  return !!t?.refusal && t.id !== prev.toasts.at(-1)?.id;
}

export function audit(c: CiqCase, by: string, at: string, action: string, detail: string, sectionId?: string): CiqCase {
  return { ...c, audit: [...c.audit, { id: `${c.id}-a${c.audit.length + 1}`, at, by, action, detail, sectionId, version: c.reviewVersion }] };
}

export function setPhase(c: CiqCase, phase: Phase, at: string): CiqCase {
  return { ...c, phase, phaseHistory: [...c.phaseHistory, { phase, at }] };
}

/** Appends to the global supplier-master / configuration log. */
export function logEvent(s: AppState, e: Omit<LogEvent, "id">): AppState {
  return { ...s, log: [...s.log, { ...e, id: `L-${String(s.log.length + 1).padStart(4, "0")}` }] };
}
