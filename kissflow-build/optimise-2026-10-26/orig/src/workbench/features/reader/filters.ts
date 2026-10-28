// Audit log filters (§8.15 `#/audit`): case code, category, actor, side, date range. Pure, unit-tested.
// Dates compare on the calendar day of Event_At as stored (UTC, `YYYY-MM-DD…`) [convention: no time-zone shift].
import type { AuditVM } from "../../data/viewModels";

export interface AuditFilters {
  /** Case code, matched as a case-insensitive substring. */
  caseCode: string;
  /** Exact Event_Category ("" = all). */
  category: string;
  /** Actor name or e-mail, case-insensitive substring. */
  actor: string;
  /** Exact Actor_Side ("" = all). */
  side: string;
  /** Inclusive `YYYY-MM-DD` bounds ("" = open). */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: AuditFilters = Object.freeze({ caseCode: "", category: "", actor: "", side: "", from: "", to: "" });

export const isFiltered = (f: AuditFilters): boolean => Object.values(f).some((v) => v.trim() !== "");

const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.trim().toLowerCase());

export function matchesAudit(e: AuditVM, f: AuditFilters): boolean {
  if (f.caseCode.trim() && !has(e.caseCode, f.caseCode)) return false;
  if (f.category && e.category !== f.category) return false;
  if (f.actor.trim() && !has(`${e.actorName} ${e.actorEmail}`, f.actor)) return false;
  if (f.side && e.actorSide !== f.side) return false;
  const day = (e.at || "").slice(0, 10);
  if (f.from && (!day || day < f.from)) return false;
  if (f.to && (!day || day > f.to)) return false;
  return true;
}

export function filterAudit(events: readonly AuditVM[], f: AuditFilters): AuditVM[] {
  return events.filter((e) => matchesAudit(e, f));
}

/** Distinct case codes in the log, sorted (for the case filter suggestions). */
export function caseCodesIn(events: readonly AuditVM[]): string[] {
  return [...new Set(events.map((e) => e.caseCode).filter(Boolean))].sort();
}
