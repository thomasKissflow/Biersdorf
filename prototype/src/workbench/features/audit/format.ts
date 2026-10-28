// Display helpers shared by the T3 folders (approver, admin, masters, reader, notes, audit). Text only: no ids, no
// writes. Dates are shown in the viewer's local time; they are never written from here (kfDateTime lives in
// data/normalize.ts).
import type { Dept } from "../../schema";
import type { AuditVM } from "../../data/viewModels";
import { DEPT_LABEL } from "../../domain/labels";

const DT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const D = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

const asDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  // a Date field ("YYYY-MM-DD") is a calendar day: read it as a LOCAL date (UTC midnight would show the day before
  // west of Greenwich)
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

/** "8 Oct 2026, 10:00" (local time), or the raw text when it is not a date, or "—". */
export function fmtDateTime(s: string | null | undefined): string {
  const d = asDate(s);
  return d ? DT.format(d) : s || "—";
}
/** "8 Oct 2026", or the raw text, or "—". */
export function fmtDate(s: string | null | undefined): string {
  const d = asDate(s);
  return d ? D.format(d) : s || "—";
}

/** Readable labels for the F8 action codes the Workbench writes (§7.8). Unknown codes show as they are. */
const ACTION_LABEL: Record<string, string> = {
  "case.created": "Case created",
  "case.cancel": "Case cancelled",
  "case.cancel.failed": "Cancel not completed in Kissflow",
  "hold.override.release": "Hold override before release request",
  "hold.override.close": "Hold override before close",
  "cr.refused.after-release": "Change refused after final release",
  "config.publish": "Configuration published",
  "config.retire": "Configuration retired",
  "release.publish": "Release published",
  "config.hash.mismatch": "Configuration hash mismatch",
  "lane.on-behalf": "Department review signed off on behalf",
  "section.reviewed": "Section marked reviewed",
  "lane.completed": "Department review completed",
  "lane.repaired": "Department review restored by Case Admin",
  "count.attested": "Partial count attested",
  "scope.dept.added": "Department added to the review",
};

export function actionLabel(e: Pick<AuditVM, "actionCode" | "category">): string {
  const code = e.actionCode || "";
  if (code.endsWith(".correction")) {
    const base = code.slice(0, -".correction".length);
    return `${ACTION_LABEL[base] ?? base} (correcting row)`;
  }
  return ACTION_LABEL[code] ?? (code || e.category || "Event");
}

/** "Jo Weber · Safety · BDF" (department codes as names; blank parts dropped). */
export function actorLine(e: Pick<AuditVM, "actorName" | "actorEmail" | "actorDept" | "actorSide">): string {
  return [e.actorName || e.actorEmail, e.actorDept ? (DEPT_LABEL[e.actorDept as Dept] ?? e.actorDept) : "", e.actorSide].filter(Boolean).join(" · ") || "Unknown actor";
}

/** Newest first by Event_At (rows without a time go last, by key). Never mutates the input. */
export function sortEventsNewestFirst<T extends Pick<AuditVM, "at" | "eventKey" | "_id">>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    if (a.at && b.at) return b.at.localeCompare(a.at) || b.eventKey.localeCompare(a.eventKey);
    if (a.at) return -1;
    if (b.at) return 1;
    return (b.eventKey || b._id).localeCompare(a.eventKey || a._id);
  });
}

/** Pretty JSON for a snapshot, cut at `max` characters. */
export function prettySnapshot(v: unknown, raw: string, max = 4000): string {
  let s: string;
  try {
    s = v === null || v === undefined ? raw : JSON.stringify(v, null, 2);
  } catch {
    s = raw;
  }
  return s.length > max ? `${s.slice(0, max)}\n… (${s.length - max} more characters)` : s;
}
