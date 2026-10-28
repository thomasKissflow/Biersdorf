// "Needs your action" for the RMM dashboard: everything that waits on the case owner, most urgent first.
// Built only from selectors and rules; nothing here changes state.
import type { Tone } from "@/components/ui";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { fmtDate, isClosed, isOverdue, rejectionNeedsRmmChoice } from "@/domain/selectors";
import type { AuditEvent, CiqCase } from "@/domain/types";
import { daysSince, lastActivity, overduePoints, phaseSince, undefinedOriginLabels } from "./shared";

export type AttentionKind = "rmm-review" | "rejected" | "final-release" | "overdue-points" | "origin" | "idle";

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  c: CiqCase;
  label: string; // short category label (text, shown with colour)
  tone: Tone;
  title: string;
  detail: string;
  days: number; // how long it has been waiting
  when: string; // the same, as text ("waiting 5 d", "22 d overdue")
  cta: string;
  to: string;
  flag?: string; // extra warning line
}

/** Urgency order of the list. */
const RANK: Record<AttentionKind, number> = { rejected: 0, "overdue-points": 1, "rmm-review": 2, origin: 3, "final-release": 4, idle: 5 };

/** The categories in the order the dashboard's filter chips show them (spec §4). */
export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  "rmm-review": "My review",
  rejected: "Department rejected",
  "final-release": "Release pending",
  "overdue-points": "Overdue at supplier",
  origin: "Origin without rules",
  idle: "No activity",
};

/** A release request older than this many days is shown as a warning. */
export const FINAL_RELEASE_DAYS = 5;
export const IDLE_DAYS = 10;

/**
 * RMM's own review is on the list while it is RMM's turn: the track is open and not only waiting for the supplier
 * (a waiting track with an answered point counts, because an answer waits for RMM's decision).
 */
export function rmmReviewIsMyTurn(c: CiqCase): boolean {
  const t = c.reviews.find((r) => r.dept === "RMM");
  if (isClosed(c) || c.phase !== "review" || !t || t.status === "completed") return false;
  const answered = c.openPoints.some((p) => p.dept === "RMM" && p.status === "in-progress");
  return t.status !== "waiting-supplier" || answered;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Everything on the given cases that waits on RMM, most urgent first. */
export function attentionItems(cases: CiqCase[]): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const c of cases.filter((x) => !isClosed(x))) {
    const flagged = new Set<string>();
    const rmmTrack = c.reviews.find((r) => r.dept === "RMM");
    const reviewLink = rmmTrack && c.phase === "review" ? `/review/${c.id}` : `/cases/${c.id}`;

    // A Rejected RMES decision RMM has not answered yet (AS-02): continue to the final release with a note, or cancel.
    for (const d of rejectionNeedsRmmChoice(c)) {
      const r = c.reviews.find((x) => x.dept === d);
      const decidedAt = c.audit.filter((a) => a.action === `Final ${DEPT_SHORT[d]} decision`).at(-1)?.at ?? phaseSince(c);
      out.push({
        key: `${c.id}-rej-${d}`,
        kind: "rejected",
        c,
        label: ATTENTION_LABEL.rejected,
        tone: "bad",
        title: `${DEPT_LABEL[d]} recorded “Rejected”`,
        detail: r?.decisionReason ? `Reason: ${r.decisionReason}` : "No reason recorded.",
        days: daysSince(decidedAt),
        cta: rmmTrack && c.phase === "review" ? "Decide in my review" : "Open case",
        when: "",
        to: reviewLink,
        flag: `Internal decision, never shown to the supplier. Agree with ${DEPT_SHORT[d]}: cancel the case with a justification, or continue to the final release with a note when you complete your review.`,
      });
      flagged.add(c.id);
    }

    // Overdue at the supplier: open points past their due date, or the CIQ itself while the supplier fills it in.
    const late = overduePoints(c);
    if (late.length) {
      const oldest = late.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
      out.push({
        key: `${c.id}-late`,
        kind: "overdue-points",
        c,
        label: ATTENTION_LABEL["overdue-points"],
        tone: "bad",
        title: `${plural(late.length, "open point")} overdue at the supplier`,
        detail: `Oldest: ${oldest.id} on ${oldest.ref.label}, due ${fmtDate(oldest.dueDate)}.`,
        days: daysSince(oldest.dueDate),
        cta: "Review open points",
        when: "",
        to: `/cases/${c.id}?tab=points`,
        flag: "Contact the supplier, or ask the department that raised it to agree a new due date.",
      });
      flagged.add(c.id);
    } else if (c.phase === "supplier-input" && isOverdue(c.dueDate)) {
      out.push({
        key: `${c.id}-late-ciq`,
        kind: "overdue-points",
        c,
        label: ATTENTION_LABEL["overdue-points"],
        tone: "bad",
        title: "The supplier has not confirmed completeness by the due date",
        detail: `Due ${fmtDate(c.dueDate)}. The supplier is still filling in the CIQ.`,
        days: daysSince(c.dueDate),
        cta: "Open case",
        when: "",
        to: `/cases/${c.id}`,
        flag: "Contact the supplier contacts, or cancel the case if the CIQ is no longer needed.",
      });
      flagged.add(c.id);
    }

    // RMM's own review of the whole CIQ: on the list while it is RMM's turn (not while only waiting on the supplier).
    if (rmmReviewIsMyTurn(c)) {
      const answered = c.openPoints.filter((p) => p.dept === "RMM" && p.status === "in-progress").length;
      const depts = c.reviews.filter((r) => r.dept !== "RMM");
      const done = depts.filter((r) => r.status === "completed").length;
      const last = done === depts.length;
      out.push({
        key: `${c.id}-rmm`,
        kind: "rmm-review",
        c,
        label: ATTENTION_LABEL["rmm-review"],
        tone: last ? "warn" : "info",
        title: last ? "Only your review is left before the final-release request" : rmmTrack?.status === "reopened" ? "Your review was reopened" : "Your review of the whole CIQ is open",
        detail: `${done} of ${plural(depts.length, "department review")} completed${answered ? ` · ${plural(answered, "supplier answer")} to check` : ""}.`,
        days: daysSince(rmmTrack?.startedAt ?? phaseSince(c)),
        cta: "Open my review",
        when: "",
        to: `/review/${c.id}`,
      });
      flagged.add(c.id);
    }

    // An origin without rules (waste, CCU, chemical recycling): informational, shown until RMM completes its review.
    const origins = undefinedOriginLabels(c);
    if (origins.length && c.phase === "review" && rmmTrack && rmmTrack.status !== "completed") {
      out.push({
        key: `${c.id}-origin`,
        kind: "origin",
        c,
        label: ATTENTION_LABEL.origin,
        tone: "warn",
        title: `Origin without rules: ${origins.join(", ")}`,
        detail: "The supplier got the standard sections only. Check in your review whether more is needed, and ask the supplier if so.",
        days: daysSince(rmmTrack.startedAt ?? phaseSince(c)),
        cta: "Open my review",
        when: "",
        to: `/review/${c.id}`,
        flag: "Informational: it does not block any completion.",
      });
      flagged.add(c.id);
    }

    // The single release request is out: only the supplier's final release is missing.
    if (c.phase === "final-release") {
      const days = daysSince(phaseSince(c));
      out.push({
        key: `${c.id}-final`,
        kind: "final-release",
        c,
        label: ATTENTION_LABEL["final-release"],
        tone: days > FINAL_RELEASE_DAYS ? "warn" : "neutral",
        title: days > FINAL_RELEASE_DAYS ? `The supplier has not given the final release for ${days} days` : "Waiting for the supplier's final release",
        detail: "You and every department have completed your reviews. The case completes when the supplier gives the final release.",
        days,
        cta: "Open case",
        when: "",
        to: `/cases/${c.id}`,
      });
      flagged.add(c.id);
    }

    const idle = daysSince(lastActivity(c));
    if (idle > IDLE_DAYS && !flagged.has(c.id)) {
      out.push({
        key: `${c.id}-idle`,
        kind: "idle",
        c,
        label: ATTENTION_LABEL.idle,
        tone: "neutral",
        title: `No activity for ${idle} days`,
        detail: `Last entry ${fmtDate(lastActivity(c))}${isOverdue(c.dueDate) ? " · the case due date has passed" : ""}.`,
        days: idle,
        cta: "Open history",
        when: "",
        to: `/cases/${c.id}?tab=history`,
      });
    }
  }
  for (const i of out) i.when = i.kind === "overdue-points" ? (i.days < 1 ? "overdue since today" : `${i.days} d overdue`) : i.kind === "idle" ? `idle ${i.days} d` : i.days === 0 ? "since today" : `waiting ${i.days} d`;
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.days - a.days);
}

/** Last N audit events across the given cases, newest first. */
export function recentActivity(cases: CiqCase[], n = 10, keep: (e: AuditEvent) => boolean = () => true) {
  return cases
    .flatMap((c) => c.audit.filter(keep).map((a) => ({ ...a, c })))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, n);
}
