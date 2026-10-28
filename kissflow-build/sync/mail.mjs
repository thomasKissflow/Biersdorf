// CIQ Mail Outbox rows (plan v5 §4.5, §9) from the prototype's own mails (mail.ts texts, recipients and keys).
//
// Guarantees (C-00), enforced here on top of mail.ts:
// - supplier mails go only to the case's active supplier contacts; internal mails never to a supplier contact;
// - a supplier mail that would carry an internal text of the case (notes, RMES, findings, decisions, internal reasons:
//   invariants.ts internalStrings) is not written, and an alert is raised instead;
// - recipients de-duplicated; unknown, deactivated or e-mail-less people get nothing; no recipient → no row;
// - every row has an idempotency key (Mail_Key): the prototype's own key (reminders, C-21), else event + trigger key;
// - C-10 data-changed is debounced (10 min of quiet) and merged per case, author and recipients (F-15);
// - a row without Sent_Status after 10 min is retried as Mail_Key#2, #3; after attempt 3 it is a dead letter.

import { D } from "./engine.mjs";
import { kfId } from "./identity.mjs";

export const EVENT_CODE = {
  invitation: "C-01",
  "review-assigned": "C-02",
  informed: "C-03",
  "op-raised": "C-04",
  "op-answered": "C-05",
  "op-returned": "C-06",
  "op-accepted": "C-07",
  "op-edited": "C-08",
  "op-closed": "C-09",
  "data-changed": "C-10",
  "data-changed-section-added": "C-10a",
  "release-requested": "C-11",
  "release-withdrawn": "C-12",
  "release-receipt": "C-13",
  "final-document": "C-14",
  cancelled: "C-15",
  reactivated: "C-16",
  "change-reported": "C-17",
  reminder: "C-18",
  escalation: "C-19",
  "note-mention": "C-20",
  alert: "ALERT",
};

const MIN = 60_000;
export const DEBOUNCE_MS = 10 * MIN;
export const RETRY_AFTER_MS = 10 * MIN;
export const MAX_ATTEMPTS = 3;

const isSectionAdded = (m) => m.event === "data-changed" && / added to your .* review$/.test(m.subject);
export const eventCodeOf = (m) => (isSectionAdded(m) ? "data-changed-section-added" : m.event);

/**
 * Turns the prototype mails of one trigger into outbox rows (now) and C-10 debounce entries (later).
 * @returns {{ rows: object[], debounced: object[], dropped: {key: string, why: string}[] }}
 */
export function outboxRows({ directory, c, mails, triggerKey, at, linkBase = {} }) {
  const rows = [];
  const debounced = [];
  const dropped = [];
  const secrets = c ? D.internalStrings({ ...c, internalNotes: c.internalNotes ?? [] }) : [];
  const contactIds = new Set(c?.supplierContactIds ?? []);
  mails.forEach((m, i) => {
    const key = m.key ?? `${m.event}:${triggerKey}:${i + 1}`;
    const people = [...new Set(m.to)].map((id) => directory.byId(id) ?? { id, email: "" });
    const allowed = people.filter((u) => {
      if (u.active === false) return false;
      if (m.audience === "supplier") return u.side === "supplier" && (!c || contactIds.has(u.id));
      return u.side !== "supplier";
    });
    const to = [...new Set(allowed.map((u) => u.email).filter(Boolean))];
    if (!to.length) {
      dropped.push({ key, why: "no recipient left after the whitelist (C-00)" });
      return;
    }
    if (m.audience === "supplier") {
      const hit = secrets.find((t) => m.body.includes(t) || m.subject.includes(t));
      if (hit || /\bRMES\b|internal note/i.test(m.body)) {
        dropped.push({ key, why: "supplier mail would carry internal text (C-00): not written" });
        return;
      }
    }
    const code = eventCodeOf(m);
    const row = {
      Mail_Key: key,
      Event_Code: code,
      Audience: m.audience === "supplier" ? "Supplier" : "Internal",
      To_Emails: to.join(", "),
      Subject: m.subject,
      Body_Text: `${m.body}${m.link ? `\n\n${(linkBase[m.audience] ?? "") + m.link}` : ""}`,
      Link_Url: m.link ? (linkBase[m.audience] ?? "") + m.link : "",
      Case_Code: m.caseId ?? c?.id ?? "",
      Related_Key: m.opId ?? m.sectionId ?? "",
      Created_At: at,
      Attempt_No: 1,
    };
    // the debounce entry lives in the ledger and names the author in Mail_Key: the Kissflow id (identity.mjs)
    if (code === "data-changed") debounced.push({ caseId: row.Case_Code, by: kfId(m.by, directory.mintedIds), to: row.To_Emails, section: m.sectionId ?? null, firstAt: at, lastAt: at, subject: m.subject, body: m.body, link: row.Link_Url, related: row.Related_Key });
    else rows.push(row);
  });
  return { rows, debounced, dropped };
}

/** Merges new C-10 entries into the case's debounce buffer (one entry per case, author and recipients). */
export function mergeDebounced(pending, entries) {
  const out = [...(pending ?? [])];
  for (const e of entries) {
    const hit = out.find((p) => p.caseId === e.caseId && p.by === e.by && p.to === e.to);
    if (!hit) {
      out.push({ ...e });
      continue;
    }
    hit.lastAt = e.lastAt;
    const firstLine = e.body.split("\n")[0];
    if (!hit.body.split("\n").includes(firstLine)) hit.body = `${hit.body}\n${firstLine}`;
    if (hit.section !== e.section) {
      hit.section = null;
      hit.subject = `${e.caseId}: the supplier changed data`;
      hit.link = hit.link.split("?")[0];
      hit.related = "";
    }
  }
  return out;
}

/** The debounced mails due now (10 min after the last change), as outbox rows, and what stays pending. */
export function flushDebounced(pending, nowIso, debounceMs = DEBOUNCE_MS) {
  const due = [];
  const keep = [];
  for (const p of pending ?? []) {
    if (Date.parse(nowIso) - Date.parse(p.lastAt) >= debounceMs) {
      due.push({
        Mail_Key: `data-changed:${p.caseId}:${p.by}:${p.firstAt}`,
        Event_Code: "data-changed",
        Audience: "Internal",
        To_Emails: p.to,
        Subject: p.subject,
        Body_Text: `${p.body}${p.link ? `\n\n${p.link}` : ""}`,
        Link_Url: p.link ?? "",
        Case_Code: p.caseId,
        Related_Key: p.related ?? "",
        Created_At: nowIso,
        Attempt_No: 1,
      });
    } else keep.push(p);
  }
  return { due, keep };
}

const baseKey = (k) => String(k).replace(/#\d+$/, "");
const attemptOf = (r) => Number(r.Attempt_No ?? (/#(\d+)$/.exec(r.Mail_Key)?.[1] ?? 1));

/**
 * Retries and dead letters from the outbox rows (§4.5): a row still without Sent_Status 10 min after it was written is
 * retried with Mail_Key#n; after attempt 3 it is a dead letter.
 */
export function retryPlan(outbox, nowIso, retryAfterMs = RETRY_AFTER_MS) {
  const byBase = new Map();
  for (const r of outbox) {
    const b = baseKey(r.Mail_Key);
    (byBase.get(b) ?? byBase.set(b, []).get(b)).push(r);
  }
  const retries = [];
  const deadLetters = [];
  for (const [b, rows] of byBase) {
    if (rows.some((r) => String(r.Sent_Status ?? "").trim())) continue;
    const last = rows.sort((x, y) => attemptOf(x) - attemptOf(y)).at(-1);
    const age = Date.parse(nowIso) - Date.parse(last.Created_At ?? last._created_at ?? nowIso);
    if (age < retryAfterMs) continue;
    const n = attemptOf(last);
    if (n >= MAX_ATTEMPTS) deadLetters.push({ Mail_Key: b, attempts: n, Case_Code: last.Case_Code, Event_Code: last.Event_Code, firstAt: rows[0].Created_At });
    else {
      const fields = Object.fromEntries(Object.entries(last).filter(([k]) => !k.startsWith("_") && k !== "Sent_Status" && k !== "Name"));
      retries.push({ ...fields, Mail_Key: `${b}#${n + 1}`, Attempt_No: n + 1, Created_At: nowIso });
    }
  }
  return { retries, deadLetters };
}
