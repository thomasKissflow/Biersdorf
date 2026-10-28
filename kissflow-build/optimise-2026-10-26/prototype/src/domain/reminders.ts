// "Run reminders now" (spec §1.13): sends the reminder, overdue and escalation mails that are due at `now` according
// to the admin's reminder settings. Idempotent: every mail carries a key, so running it twice sends nothing new. The
// demo can pass a later `now` to show what would go out after some days.
//
// Settings (by id): rem-1 the supplier's fill-in task, rem-2 an open point waiting for the supplier, rem-3 an idle
// review task, rem-5 a pending final release. rem-6 (certificate expiry) has no data in the MVP and sends nothing.

import { DEPT_SHORT, INTERNAL_PERSONAS } from "./catalog";
import { getCase, refuse, toast } from "./core";
import { caseLink, internalMail, reviewLink, supplierMail } from "./mail";
import { check, raiserOf } from "./permissions";
import { DAY, fmtDate, isClosed } from "./selectors";
import type { AppState, CiqCase, OpenPoint, ReminderSetting } from "./types";

const days = (from: string, now: string) => (Date.parse(now) - Date.parse(from)) / DAY;

/** When the point last went to the supplier (raised, returned, or an edited question that started a new round). */
const sentAt = (p: OpenPoint) => [...p.thread].reverse().find((m) => m.action === "raised" || m.newRound)?.at ?? p.createdAt;

/** When the case last entered its current phase. */
const phaseSince = (c: CiqCase) => [...c.phaseHistory].reverse().find((x) => x.phase === c.phase)?.at ?? c.createdAt;

export function runReminders(s: AppState, now: string, by = "system"): AppState {
  const denied = check(s, by, "reminders.run");
  if (denied) return refuse(s, denied);
  const on = (id: string): ReminderSetting | undefined => s.reminders.find((r) => r.id === id && r.enabled);
  const before = s.mails.length;
  let next = s;
  const ownerOfProcess = INTERNAL_PERSONAS.find((p) => p.id === "owner")?.userId ?? "u-owner";

  for (const c0 of s.cases.filter((c) => !isClosed(c))) {
    const c = () => getCase(next, c0.id)!;

    const r1 = on("rem-1");
    if (r1 && c0.phase === "supplier-input") {
      const start = phaseSince(c0);
      const task = "fill in the CIQ and confirm completeness";
      if (days(start, now) >= r1.afterDays) next = supplierMail(next, c(), "reminder", by, now, undefined, { task, key: `rem-1:${c0.id}:${start}:reminder` });
      if (Date.parse(c0.dueDate) + DAY <= Date.parse(now)) next = supplierMail(next, c(), "reminder", by, now, undefined, { task, overdue: true, key: `rem-1:${c0.id}:${c0.dueDate}:overdue` });
      if (days(start, now) >= r1.escalateAfterDays)
        next = internalMail(next, [c0.ownerId], { by, event: "escalation", subject: `Escalation: ${c0.id} not yet filled in`, body: `The supplier has not completed the CIQ for ${c0.materialName} (${c0.id}) ${Math.floor(days(start, now))} days after the invitation. Due date: ${fmtDate(c0.dueDate)}. Consider contacting the supplier.`, link: caseLink(c0.id), caseId: c0.id, key: `rem-1:${c0.id}:${start}:escalation` }, now);
    }

    const r2 = on("rem-2");
    if (r2 && (c0.phase === "review" || c0.phase === "final-release")) {
      for (const p of c0.openPoints.filter((x) => x.status === "open")) {
        const start = sentAt(p);
        const round = `rem-2:${p.id}:r${p.rounds}`;
        const task = "answer a question from Beiersdorf";
        if (days(start, now) >= r2.afterDays) next = supplierMail(next, c(), "reminder", by, now, p, { task, key: `${round}:reminder` });
        if (Date.parse(p.dueDate) + DAY <= Date.parse(now)) next = supplierMail(next, c(), "reminder", by, now, p, { task, overdue: true, key: `${round}:${p.dueDate}:overdue` });
        if (days(start, now) >= r2.escalateAfterDays)
          next = internalMail(next, [raiserOf(p), c0.ownerId], { by, event: "escalation", subject: `Escalation: ${p.id} unanswered`, body: `The supplier has not answered ${p.id} on ${p.ref.label} (${c0.materialName}, ${c0.id}) for ${Math.floor(days(start, now))} days. Due date: ${fmtDate(p.dueDate)}.`, link: reviewLink(c0.id, p.id), caseId: c0.id, opId: p.id, key: `${round}:escalation` }, now);
      }
    }

    const r3 = on("rem-3");
    if (r3 && c0.phase === "review") {
      for (const r of c0.reviews.filter((x) => x.status === "in-review" || x.status === "reopened")) {
        const last = [r.startedAt ?? c0.createdAt, ...c0.audit.filter((a) => a.by === r.assigneeId).map((a) => a.at)].sort().at(-1)!;
        const key = `rem-3:${c0.id}:${r.dept}:${last}`;
        const name = r.dept === "RMM" ? "your RMM review" : `your ${DEPT_SHORT[r.dept]} review`;
        if (days(last, now) >= r3.afterDays)
          next = internalMail(next, [r.assigneeId], { by, event: "reminder", subject: `Reminder: ${name} of ${c0.id}`, body: `${name[0].toUpperCase()}${name.slice(1)} of ${c0.materialName} (${c0.id}) has had no activity for ${Math.floor(days(last, now))} days.`, link: reviewLink(c0.id), caseId: c0.id, key: `${key}:reminder` }, now);
        if (days(last, now) >= r3.escalateAfterDays)
          next = internalMail(next, [r.dept === "RMM" ? ownerOfProcess : c0.ownerId], { by, event: "escalation", subject: `Escalation: ${r.dept === "RMM" ? "RMM" : DEPT_SHORT[r.dept]} review of ${c0.id} idle`, body: `The ${r.dept === "RMM" ? "RMM" : DEPT_SHORT[r.dept]} review of ${c0.materialName} (${c0.id}) has had no activity for ${Math.floor(days(last, now))} days.`, link: caseLink(c0.id), caseId: c0.id, key: `${key}:escalation` }, now);
      }
    }

    const r5 = on("rem-5");
    if (r5 && c0.phase === "final-release") {
      const start = phaseSince(c0);
      if (days(start, now) >= r5.afterDays) next = supplierMail(next, c(), "reminder", by, now, undefined, { task: "give the final release", key: `rem-5:${c0.id}:${start}:reminder` });
      if (days(start, now) >= r5.escalateAfterDays)
        next = internalMail(next, [c0.ownerId], { by, event: "escalation", subject: `Escalation: final release of ${c0.id} pending`, body: `The supplier has not given the final release of ${c0.materialName} (${c0.id}) ${Math.floor(days(start, now))} days after the request.`, link: caseLink(c0.id), caseId: c0.id, key: `rem-5:${c0.id}:${start}:escalation` }, now);
    }
  }
  const sent = next.mails.length - before;
  const escalations = next.mails.slice(before).filter((m) => m.event === "escalation").length;
  const kinds = [sent - escalations ? `${sent - escalations} reminder${sent - escalations > 1 ? "s" : ""}` : "", escalations ? `${escalations} escalation${escalations > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
  return toast(next, sent ? "success" : "info", sent ? `${sent} e-mail${sent > 1 ? "s" : ""} sent (${kinds}).` : `No reminder is due as of ${fmtDate(now)}.`);
}
