// Simulated e-mail (spec §2, R-1). Every relevant action calls `sendMail` once per event and audience; the inbox per
// person is a view over AppState.mails. Supplier mails are built here from a fixed list of supplier-visible facts
// (case ID, material, the question's reference, question text, due date, the return text the supplier sees anyway),
// never from free text, so internal notes, RMES content, findings, decisions and internal reasons cannot leak.

import { DEPT_SHORT, sectionOf } from "./catalog";
import { mentionRecipients, noteLink } from "./mentions";
import { isActiveUser, raiserOf, userOf } from "./permissions";
import { fmtDate, fmtDateTime, ownsSection } from "./selectors";
import type { AppState, CiqCase, InternalNote, Mail, MailChannel, MailEvent, OpenPoint, OpenPointKind, ReviewDept } from "./types";

export const MAIL_FROM = "Beiersdorf CIQ <ciq-noreply@beiersdorf.example>";

/** Mails of the same burst of supplier changes are merged into one (per case, recipients and author). */
const DATA_CHANGED_MERGE_MS = 30 * 60_000;

export const supplierLink = (caseId: string, opId?: string) => `/portal/case/${caseId}${opId ? `?op=${opId}` : ""}`;
export const reviewLink = (caseId: string, opId?: string, sectionId?: string) => {
  const q = [opId && `op=${opId}`, sectionId && `s=${sectionId}`].filter(Boolean).join("&");
  return `/review/${caseId}${q ? `?${q}` : ""}`;
};
export const caseLink = (caseId: string, tab?: "final-document" | "history" | "points" | "notes" | "questionnaire" | "overview") => `/cases/${caseId}${tab ? `?tab=${tab}` : ""}`;

export interface MailDraft {
  to: string[];
  by: string;
  event: MailEvent;
  audience: Mail["audience"];
  subject: string;
  body: string;
  link: string;
  caseId?: string;
  opId?: string;
  sectionId?: string;
  key?: string;
  channel?: MailChannel;
}

const channelOf = (e: MailEvent): MailChannel => (e.startsWith("op-") ? "open-point-webhook" : e === "final-document" ? "final-document" : "task-notification");

/**
 * Sends one mail. Recipients are de-duplicated; unknown and deactivated users get nothing; a mail with no recipient
 * left is not sent. A `key` makes it idempotent (reminders). Consecutive data-changed mails of one burst are merged.
 */
export function sendMail(s: AppState, d: MailDraft, at: string): AppState {
  const to = [...new Set(d.to)].filter((id) => isActiveUser(userOf(s, id)));
  if (!to.length) return s;
  if (d.key && s.mails.some((m) => m.key === d.key)) return s;
  if (d.event === "data-changed") {
    const last = s.mails.at(-1);
    if (
      last &&
      last.event === "data-changed" &&
      last.caseId === d.caseId &&
      last.by === d.by &&
      last.readBy.length === 0 &&
      last.to.join() === to.join() &&
      Date.parse(at) - Date.parse(last.at) <= DATA_CHANGED_MERGE_MS
    ) {
      const sameSection = last.sectionId === d.sectionId;
      const merged: Mail = { ...last, at, subject: sameSection ? last.subject : `${d.caseId}: the supplier changed data`, body: `${last.body}\n${d.body.split("\n")[0]}`, sectionId: sameSection ? last.sectionId : undefined, link: sameSection ? last.link : last.link.split("?")[0] };
      return { ...s, mails: [...s.mails.slice(0, -1), merged] };
    }
  }
  const mail: Mail = {
    id: `M-${String(s.mails.length + 1).padStart(5, "0")}`,
    at,
    to,
    by: d.by,
    event: d.event,
    channel: d.channel ?? channelOf(d.event),
    audience: d.audience,
    subject: d.subject,
    body: d.body,
    caseId: d.caseId,
    opId: d.opId,
    sectionId: d.sectionId,
    link: d.link,
    readBy: [],
    key: d.key,
  };
  return { ...s, mails: [...s.mails, mail] };
}

// ---------------------------------------------------------------------------------- recipients

/** The case contacts that still get mail: named on the case and active. */
export const caseContactIds = (s: AppState, c: CiqCase) => c.supplierContactIds.filter((id) => isActiveUser(userOf(s, id)));

/** Assignees of the case's tracks (optionally only some departments). */
export const trackAssigneeIds = (c: CiqCase, depts?: ReviewDept[]) => c.reviews.filter((r) => !depts || depts.includes(r.dept)).map((r) => r.assigneeId);

/** Every internal user of a department (Customs and Legal are informed as a team). */
export const deptUserIds = (s: AppState, dept: string) => s.users.filter((u) => u.side === "internal" && u.dept === dept && isActiveUser(u)).map((u) => u.id);

// ---------------------------------------------------------------------------------- supplier mails (whitelisted facts only)

const KIND_WORD: Record<OpenPointKind, string> = { query: "question", "document-request": "document request", "additional-part": "additional section", finding: "question" };
const quote = (t: string) => `“${t.trim()}”`;

/** The supplier-visible return text of the latest round (the supplier sees it in the thread anyway). */
const lastReturnText = (op: OpenPoint) => [...op.thread].reverse().find((m) => m.action === "returned")?.text ?? "";

export interface SupplierMailExtra {
  newRound?: boolean;
  overdue?: boolean;
  task?: string;
  /** Only these case contacts (e.g. a newly named contact's invitation). */
  to?: string[];
  key?: string;
}

/** A mail to the case contacts, worded from supplier-visible facts only. */
export function supplierMail(s: AppState, c: CiqCase, event: MailEvent, by: string, at: string, op?: OpenPoint, extra?: SupplierMailExtra): AppState {
  const named = caseContactIds(s, c);
  const to = extra?.to ? named.filter((id) => extra.to!.includes(id)) : named;
  const m = c.materialName;
  const ref = op?.ref.label ?? "";
  const kind = op ? KIND_WORD[op.kind] : "";
  const aKind = `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`; // "an additional section", "a question"
  const link = supplierLink(c.id, op?.id);
  let subject = "";
  let body = "";
  switch (event) {
    case "invitation":
      // A contact added later (Edit case contacts, or a replacement) joins the request in its current phase.
      if (c.phase === "review") {
        subject = `You were added to the CIQ for ${m}`;
        body = `You were added as a contact on the Cosmetic Ingredient Questionnaire (CIQ) for ${m} (${c.id}). Completeness is already confirmed and Beiersdorf is reviewing it.\nAnswer any questions from Beiersdorf and keep the data current until Beiersdorf requests your final release.`;
      } else if (c.phase === "final-release") {
        subject = `You were added to the CIQ for ${m}`;
        body = `You were added as a contact on the Cosmetic Ingredient Questionnaire (CIQ) for ${m} (${c.id}). Beiersdorf has completed its review and waits for the final release; the questionnaire is locked meanwhile.\nPlease check it and give the final release in the supplier portal. If something must change, contact Beiersdorf.`;
      } else {
        subject = `Please fill in the CIQ for ${m}`;
        body = `Beiersdorf asks you to fill in the Cosmetic Ingredient Questionnaire (CIQ) for ${m} (${c.id}).\nAnswer the metadata questions first: the sections that apply open as you answer. Then complete them, upload the evidence at the questions and confirm completeness.\nDue date: ${fmtDate(c.dueDate)}.`;
      }
      break;
    case "op-raised":
      subject = `${c.id}: ${aKind} from Beiersdorf`;
      body = `Beiersdorf has ${aKind} on ${ref} for ${m} (${c.id}):\n${quote(op!.question)}\nPlease answer by ${fmtDate(op!.dueDate)}. Upload any document at the question in the supplier portal.`;
      break;
    case "op-edited":
      subject = `${c.id}: Beiersdorf changed ${aKind}`;
      body = `Beiersdorf changed its ${kind} on ${ref} for ${m} (${c.id}). The current version:\n${quote(op!.question)}\nDue date: ${fmtDate(op!.dueDate)}.${extra?.newRound ? "\nPlease answer the changed question." : ""}`;
      break;
    case "op-returned":
      subject = `${c.id}: Beiersdorf needs more on ${ref}`;
      body = `Beiersdorf reviewed your answer on ${ref} for ${m} (${c.id}) and needs more:\n${quote(lastReturnText(op!))}\nPlease answer by ${fmtDate(op!.dueDate)}.`;
      break;
    case "op-accepted":
      subject = `${c.id}: your answer was accepted`;
      body = `Beiersdorf accepted your answer on ${ref} for ${m} (${c.id}). Nothing more is needed on it.`;
      break;
    case "op-closed":
      subject = `${c.id}: a question was closed`;
      body = `Beiersdorf closed its ${kind} on ${ref} for ${m} (${c.id}). No answer is needed on it.`;
      break;
    case "release-requested":
      subject = `${c.id}: please give the final release`;
      body = `Beiersdorf has completed its review of the CIQ for ${m} (${c.id}). Your questionnaire is now locked: please check it and give the final release in the supplier portal. If something must change, contact Beiersdorf; they can reopen the review. With the release the CIQ is frozen.`;
      break;
    case "release-withdrawn":
      subject = `${c.id}: the final release is not needed yet`;
      body = `Beiersdorf is reviewing the CIQ for ${m} (${c.id}) again, so the request for your final release is withdrawn for now. You will get a new request when the review is complete. Your questionnaire is open again, so you can update your answers until then.`;
      break;
    case "release-receipt": {
      const who = userOf(s, by)?.name ?? "your company";
      subject = `${c.id}: final release received`;
      body = `Thank you. The final release of the CIQ for ${m} (${c.id}) was recorded on ${fmtDateTime(at)} (${who}). The CIQ is now frozen. If something changes later, use “Report a change” in the supplier portal.`;
      break;
    }
    case "cancelled":
      subject = `${c.id}: request withdrawn`;
      body = `Beiersdorf has withdrawn the request for ${m} (${c.id}). No further action is needed, and your open tasks on it are closed.`;
      break;
    case "reactivated":
      subject = `${c.id}: request active again`;
      body = `Beiersdorf has reactivated the request for ${m} (${c.id}). Your tasks on it are open again in the supplier portal. Due date: ${fmtDate(c.dueDate)}.`;
      break;
    case "reminder":
      subject = `${extra?.overdue ? "Overdue" : "Reminder"}: ${extra?.task ?? "open task"} (${c.id})`;
      body = `${extra?.overdue ? "This task is overdue" : "A friendly reminder"}: ${extra?.task ?? "open task"} for ${m} (${c.id})${op ? ` on ${ref}` : ""}. Due date: ${fmtDate(op?.dueDate ?? c.dueDate)}.`;
      break;
    default:
      return s;
  }
  return sendMail(s, { to, by, event, audience: "supplier", subject, body, link, caseId: c.id, opId: op?.id, sectionId: op?.ref.sectionId, key: extra?.key }, at);
}

// ---------------------------------------------------------------------------------- internal mails

export function internalMail(s: AppState, to: string[], d: Omit<MailDraft, "to" | "audience">, at: string): AppState {
  return sendMail(s, { ...d, to, audience: "internal" }, at);
}

/** op-answered: to the raiser and the responsible person (de-duplicated). Internal, so it may quote the answer. */
export function answeredMail(s: AppState, c: CiqCase, op: OpenPoint, by: string, at: string, text: string, cannotProvide: boolean, documentName?: string): AppState {
  const who = userOf(s, by)?.name ?? "The supplier";
  return internalMail(
    s,
    [raiserOf(op), op.responsibleId],
    {
      by,
      event: "op-answered",
      subject: `${c.id}: the supplier answered ${op.id}`,
      body: `${who} ${cannotProvide ? "cannot provide what was asked" : "answered"} on ${op.ref.label} (${c.materialName}, ${c.id}):\n${quote(text)}${documentName ? `\nDocument at the question: ${documentName}` : ""}\nPlease accept it, return it or close the point.`,
      link: reviewLink(c.id, op.id),
      caseId: c.id,
      opId: op.id,
      sectionId: op.ref.sectionId,
    },
    at,
  );
}

export function reviewAssignedMail(s: AppState, c: CiqCase, depts: ReviewDept[], by: string, at: string, why: string): AppState {
  let next = s;
  for (const d of depts) {
    const tr = c.reviews.find((r) => r.dept === d);
    if (!tr) continue;
    next = internalMail(
      next,
      [tr.assigneeId],
      { by, event: "review-assigned", subject: `${c.id}: ${d === "RMM" ? "your RMM review" : `${DEPT_SHORT[d]} review`} of ${c.materialName}`, body: `${why}\nYour ${d === "RMM" ? "RMM review of the whole CIQ" : `${DEPT_SHORT[d]} review`} for ${c.materialName} (${c.id}) is open in My reviews.`, link: reviewLink(c.id), caseId: c.id },
      at,
    );
  }
  return next;
}

/** data-changed: the supplier changed an answer in Part 2; goes to the tracks that use the section (RMM uses all). */
export function dataChangedMail(s: AppState, c: CiqCase, by: string, at: string, sectionId: string, what: string): AppState {
  const depts = c.reviews.filter((r) => r.dept === "RMM" || usesSection(s, r.dept, sectionId)).map((r) => r.dept);
  const who = userOf(s, by)?.name ?? "The supplier";
  const code = sectionOf(sectionId, c.templateVersion, s.config)?.code ?? sectionId;
  return internalMail(
    s,
    trackAssigneeIds(c, depts),
    { by, event: "data-changed", subject: `${c.id}: the supplier changed data in ${code}`, body: `${code}: ${what} (${who}, ${fmtDateTime(at)}).\nThe questionnaire of ${c.materialName} (${c.id}) shows the current answers. If the change reopened your completed review, a separate e-mail tells you so.`, link: reviewLink(c.id, undefined, sectionId), caseId: c.id, sectionId },
    at,
  );
}

/**
 * note-mention: one internal mail per person mentioned in an internal note (each once, never the writer, never a
 * supplier contact), quoting the note and linking to it where that person works (mentions.ts noteLink).
 */
export function noteMentionMails(s: AppState, c: CiqCase, note: InternalNote, at: string): AppState {
  const who = userOf(s, note.by)?.name ?? "A colleague";
  const code = note.sectionId ? (sectionOf(note.sectionId, c.templateVersion, s.config)?.code ?? note.sectionId) : "";
  let next = s;
  for (const id of mentionRecipients(s, note)) {
    next = internalMail(
      next,
      [id],
      {
        by: note.by,
        event: "note-mention",
        subject: `${who} mentioned you on ${c.id}`,
        body: `${who} mentioned you in an internal note on ${c.materialName} (${c.id})${code ? `, section ${code}` : ""}:\n${quote(note.text)}\nOpen the note to reply. Internal notes are for Beiersdorf only; the supplier never sees them.`,
        link: noteLink(c, note, userOf(s, id)),
        caseId: c.id,
        sectionId: note.sectionId,
      },
      at,
    );
  }
  return next;
}

/** The department leads or co-reviews the section (section owners, A-29; the same rule reopens its review, actions.ts). */
const usesSection = (s: AppState, dept: ReviewDept, sectionId: string): boolean => ownsSection(s, dept, sectionId);

// ---------------------------------------------------------------------------------- inbox

export const mailsFor = (s: AppState, userId: string): Mail[] => s.mails.filter((m) => m.to.includes(userId)).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
export const isUnread = (m: Mail, userId: string) => m.to.includes(userId) && !m.readBy.includes(userId);
export const unreadCount = (s: AppState, userId: string) => s.mails.filter((m) => isUnread(m, userId)).length;
export const mailsOfCase = (s: AppState, caseId: string): Mail[] => s.mails.filter((m) => m.caseId === caseId);

export function markMailRead(s: AppState, userId: string, mailId: string, read = true): AppState {
  return {
    ...s,
    mails: s.mails.map((m) => (m.id !== mailId || !m.to.includes(userId) ? m : { ...m, readBy: read ? [...new Set([...m.readBy, userId])] : m.readBy.filter((x) => x !== userId) })),
  };
}

export function markAllMailsRead(s: AppState, userId: string): AppState {
  return { ...s, mails: s.mails.map((m) => (isUnread(m, userId) ? { ...m, readBy: [...m.readBy, userId] } : m)) };
}
