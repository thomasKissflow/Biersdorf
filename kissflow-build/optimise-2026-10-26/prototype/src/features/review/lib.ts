// Pure view helpers of the Part 2 review screens (My reviews and the review workspace). No React here, so the rules
// the screens show are unit-tested in lib.test.ts against the same domain the actions use.

import { DEPT_SHORT } from "@/domain/catalog";
import { can, isActiveUser, raiserOf } from "@/domain/permissions";
import { closedByCancellation, fmtDate, isClosed, isOverdue, nowIso, reviewBlockers, reviewSince, sectionsChangedSince, userName } from "@/domain/selectors";
import type { AppState, CiqCase, OpenPoint, OpenPointKind, ReviewDept, ReviewTrack, User } from "@/domain/types";

// ------------------------------------------------------------------ My reviews

export type QueueTab = "todo" | "waiting" | "done";

export interface QueueRow {
  c: CiqCase;
  t: ReviewTrack;
}

export interface PointCounts {
  /** Unresolved points the track raised. */
  open: number;
  /** Answered by the supplier, waiting for the raiser's decision. */
  answered: number;
  /** With the supplier and past the due date. */
  overdue: number;
}

/** The track's own points (they block its completion). */
export function pointCounts(c: CiqCase, dept: ReviewDept, at = nowIso()): PointCounts {
  const mine = c.openPoints.filter((p) => p.dept === dept && p.status !== "closed");
  return {
    open: mine.length,
    answered: mine.filter((p) => p.status === "in-progress").length,
    overdue: mine.filter((p) => p.status === "open" && isOverdue(p.dueDate, at)).length,
  };
}

/**
 * The three lists of My reviews for one review track (RMM's whole-CIQ review included). Open cases only for "To
 * review" and "Waiting for supplier"; "Completed" keeps the track's completed reviews, closed cases included.
 */
export function queueRows(state: AppState, dept: ReviewDept): Record<QueueTab, QueueRow[]> {
  const rows: QueueRow[] = state.cases.flatMap((c) => {
    const t = c.reviews.find((r) => r.dept === dept);
    return t ? [{ c, t }] : [];
  });
  const open = rows.filter((r) => !isClosed(r.c));
  return {
    todo: open.filter((r) => r.t.status === "in-review" || r.t.status === "reopened" || r.t.status === "not-started"),
    waiting: open.filter((r) => r.t.status === "waiting-supplier"),
    done: rows.filter((r) => r.t.status === "completed"),
  };
}

/** The inline alert of My reviews: supplier answers to check and overdue points, each with the tab that holds them. */
export function queueAlert(state: AppState, dept: ReviewDept, at = nowIso()): { answered: number; answeredTab: QueueTab; overdue: number; overdueTab: QueueTab } {
  const lists = queueRows(state, dept);
  let answered = 0;
  let overdue = 0;
  let answeredTab: QueueTab = "todo";
  let overdueTab: QueueTab = "waiting";
  let answeredSeen = false;
  let overdueSeen = false;
  for (const tab of ["todo", "waiting"] as const)
    for (const r of lists[tab]) {
      const n = pointCounts(r.c, dept, at);
      answered += n.answered;
      overdue += n.overdue;
      if (n.answered && !answeredSeen) [answeredTab, answeredSeen] = [tab, true];
      if (n.overdue && !overdueSeen) [overdueTab, overdueSeen] = [tab, true];
    }
  return { answered, answeredTab, overdue, overdueTab };
}

// ------------------------------------------------------------------ completion

const KIND_TEXT: Record<OpenPointKind, string> = { query: "query", "document-request": "document request", "additional-part": "additional section", finding: "finding query" };

export interface BlockerItem {
  key: string;
  text: string;
  /** Where the blocker is resolved: the open point (in the right rail) or the RMES tab. */
  target?: { kind: "point"; opId: string; sectionId: string } | { kind: "rmes" };
}

/**
 * Everything that blocks a track's completion, worded for the completion bar: each open point names its type,
 * reference, status and responsible person (REQ-PROC-036). Mirrors reviewBlockers(), which stays the gate: if the
 * two ever disagree, the domain's texts are shown as they are.
 */
export function blockerItems(state: AppState, c: CiqCase, dept: ReviewDept): BlockerItem[] {
  const out: BlockerItem[] = [];
  for (const p of c.openPoints.filter((x) => x.dept === dept && x.status !== "closed"))
    out.push({
      key: p.id,
      text: `${p.id} · ${KIND_TEXT[p.kind]} on ${p.ref.label} · ${p.status === "open" ? "with the supplier" : "answered, waiting for a decision"} · responsible ${userName(state, p.responsibleId)}`,
      target: { kind: "point", opId: p.id, sectionId: p.ref.sectionId },
    });
  if ((dept === "SAF" || dept === "REG") && c.rmes) {
    for (const cr of c.rmes.criteria.filter((x) => x.dept === dept && !x.result)) out.push({ key: cr.id, text: `RMES criterion without a result: ${cr.title}`, target: { kind: "rmes" } });
    for (const f of c.rmes.findings.filter((x) => x.dept === dept && x.status === "open")) out.push({ key: f.id, text: `Open finding: ${f.text}`, target: { kind: "rmes" } });
    const tr = c.reviews.find((r) => r.dept === dept);
    if (tr && !tr.decision) out.push({ key: "decision", text: `The ${DEPT_SHORT[dept]} decision (Approved or Rejected) is not recorded yet`, target: { kind: "rmes" } });
  }
  const domain = reviewBlockers(c, dept);
  return out.length === domain.length ? out : domain.map((text) => ({ key: text, text }));
}

/** "Agree with Safety and Regulatory" and similar lists of department names. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// ------------------------------------------------------------------ open points (AS-08: only the raiser acts)

export interface PointPermissions {
  /** The person who handles the point: its raiser, or the responsible person for a point the system raised. */
  raiserId: string;
  raiserName: string;
  /** Accept, return or close as not accepted (the supplier has answered). */
  decide: boolean;
  edit: boolean;
  close: boolean;
}

/** What the viewer may do with one point. `trackOpen` is false once the case left the review or the track completed. */
export function pointPermissions(state: AppState, userId: string, c: CiqCase, p: OpenPoint, trackOpen: boolean): PointPermissions {
  const raiserId = raiserOf(p);
  const live = trackOpen && !isClosed(c) && p.status !== "closed";
  return {
    raiserId,
    raiserName: userName(state, raiserId),
    decide: live && p.status === "in-progress" && can(state, userId, "op.decide", c, { opId: p.id }),
    edit: live && can(state, userId, "op.edit", c, { opId: p.id }),
    close: live && can(state, userId, "op.close", c, { opId: p.id }),
  };
}

/** How a closed point ended, in the reviewer's words. */
export function pointOutcome(state: AppState, p: OpenPoint): string {
  const who = p.closedBy ? ` by ${userName(state, p.closedBy)}` : "";
  const when = p.closedAt ? ` on ${fmtDate(p.closedAt)}` : "";
  if (p.outcome === "not-accepted") return `Closed as not accepted${who}${when}`;
  if (closedByCancellation(p)) return `Withdrawn with the case cancellation${who}${when}`;
  if (p.outcome === "withdrawn") return `Closed, no answer needed${who}${when}`;
  return `Accepted${who}${when}`;
}

/** Active Beiersdorf users of a department (the responsible person of a point, the target of a reassignment). */
export const activeDeptUsers = (state: AppState, dept: ReviewDept): User[] => state.users.filter((u) => u.side === "internal" && u.dept === dept && isActiveUser(u));

/** Who else of the department can take over the track. */
export function reassignCandidates(state: AppState, c: CiqCase, dept: ReviewDept): User[] {
  const tr = c.reviews.find((r) => r.dept === dept);
  return activeDeptUsers(state, dept).filter((u) => u.id !== tr?.assigneeId);
}

// ------------------------------------------------------------------ "changed since your review"

export interface ChangeMarkers {
  /** The moment the markers count from (the track's completion, or the one a reopen undid; else the completeness confirmation). */
  since?: string;
  /** Plain-English reference point, e.g. "since you completed on 9 Oct 2026". */
  sinceLabel: string;
  /** Section ids with a change after `since`. */
  sections: string[];
}

export function changeMarkers(c: CiqCase, dept: ReviewDept): ChangeMarkers {
  const since = reviewSince(c, dept);
  const tr = c.reviews.find((r) => r.dept === dept);
  // A reopened track counts from the completion the reopen undid (Thomas, 15 Oct: the markers stay).
  const done = tr?.completedAt ?? tr?.lastCompletedAt;
  const sinceLabel = done ? `since you completed on ${fmtDate(done)}` : "since the completeness confirmation";
  return { since, sinceLabel, sections: sectionsChangedSince(c, since) };
}

/** True when the entry (an answer's who/when) is newer than the markers' reference point. */
export const changedAfter = (since: string | undefined, at: string | undefined) => !!since && !!at && Date.parse(at) > Date.parse(since);
