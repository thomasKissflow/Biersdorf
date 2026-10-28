// E-mails from the screens (Thomas, 22 Oct: D1 (a), sent by the browser): one POST of {To, Subject, Body} to "Mail
// Integration - Thomas", whose hook URL is SET:current Payload_JSON.mailHook (a full https hook URL, written by the portal
// session). As for the hand-offs, only its token counts: the URL is built where the screen runs (handoff.ts hookToken /
// hookUrl), so the dev sandbox's row works in production. A mail is best effort and fire-and-forget: it goes after the
// item write and its hand-off, only when that hand-off went out (the mail tells of a change the portal shows), and it
// never holds or undoes the action; a POST that fails later reaches WriteCtx.onMailProblem. To: the case's supplier
// contacts (CaseRef.contacts), each address once. The texts are the supplier's: plain words, no internal reason, only
// supplier-visible facts (case code, trade name, the question, where it refers to, its due date). What happened goes to
// the job's details (the Writes log), never to the toast.
// 27 Oct (@mentions): a saved internal note mails each Beiersdorf colleague it mentions (the domain's
// mentionRecipients: active internal users, each once, never the writer), one POST per colleague through the same hook
// and sender, after the note's row was saved: "<writer> mentioned you on <case code>", with the case code and trade
// name, the note's section, the note text and the app's home page (Thomas, 22 Oct: notifications link to the app, not
// to the item), built on the host the hook URL is built on (appHomeUrl). A colleague with no e-mail address gets none,
// and the toast says so; a POST that fails later reaches WriteCtx.onMailProblem with the colleague.
// 27 Oct (Thomas): every Body is the one shared e-mail layout (@/domain/emailHtml: header band, title, intro, details,
// quoted text, button, footer; every value escaped). The mails to the supplier have no portal URL to link to, so they
// say where to look and carry no button; a mention links to the app's home page when that is known.
import { sectionOf } from "@/domain/catalog";
import { EMAIL_AUDIENCE, emailHtml, escapeHtml, type EmailContent } from "@/domain/emailHtml";
import { joinPeople, mentionRecipients } from "@/domain/mentions";
import type { AppState, CiqCase, InternalNote, OpenPoint, User } from "@/domain/types";
import { errorText } from "@/portal/kf/sdk";
import { KISSFLOW_HOST } from "../env";
import { APP_ID } from "../ids";
import type { AppClient, WriteCtx } from "../types";
import type { Work } from "./audit";
import { hookToken, hookUrl } from "./handoff";

export interface Mail {
  to: string[];
  subject: string;
  /** An HTML page in the shared e-mail layout (every mail, the mentions included). */
  body: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The mail hook's URL where the screen runs, or undefined (no mailHook in SET:current, or not exactly a hook URL). */
export function mailUrlOf(ctx: Pick<WriteCtx, "client" | "index">): string | undefined {
  const v = ctx.index.settings?.mailHook;
  if (typeof v !== "string" || !/^https:\/\/\S+$/i.test(v.trim())) return undefined;
  const token = hookToken(v.trim());
  return token ? hookUrl(token, { accountId: ctx.client.accountId, host: ctx.client.hookHost }) : undefined;
}

/** The supplier contacts' addresses of a case (CaseRef.contacts), each once, valid ones only. */
export function contactEmails(ctx: Pick<WriteCtx, "index">, caseId: string): string[] {
  const contacts = ctx.index.cases.get(caseId)?.contacts ?? [];
  return [...new Set(contacts.map((k) => (k.email ?? "").trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
}

/** HTML-escapes a value (the shared layout's escapeHtml). */
export const esc = escapeHtml;

const OPEN_PORTAL = "Please open the CIQ supplier portal for the details.";
/** "ZZT-0003 (Tocopherol T-70)": the case as the supplier mails name it (plain text: the layout escapes it). */
const caseLabel = (c: CiqCase) => `${c.id}${c.materialName ? ` (${c.materialName})` : ""}`;
/** The case's facts every supplier mail lists. */
const caseRows = (c: CiqCase) => [
  { label: "Case", value: c.id },
  { label: "Trade name", value: c.materialName },
];
/** A supplier mail: the subject, and the Body in the shared layout (no button: the portal's URL is not known here). */
const supplierMail = (subject: string, content: Omit<EmailContent, "audience">): Omit<Mail, "to"> & { content: EmailContent } => {
  const full: EmailContent = { ...content, notes: [...(content.notes ?? []), OPEN_PORTAL], audience: EMAIL_AUDIENCE.supplier };
  return { subject, body: emailHtml(full), content: full };
};

/** The four mails (the screens' promises, D1): a question edited or closed while the supplier's query waits, the case
 *  cancelled, the review reopened from the final release. `content` is what the Body says (for the plain-text
 *  alternative and the samples); only subject and body are sent. */
export const MAILS = {
  edited: (c: CiqCase, op: OpenPoint) =>
    supplierMail(`${c.id}: Beiersdorf changed an open question`, {
      title: "An open question was changed",
      intro: `Beiersdorf changed an open question on ${caseLabel(c)}.`,
      details: [...caseRows(c), { label: "Refers to", value: op.ref.label }, { label: "Please answer by", value: op.dueDate ? op.dueDate.slice(0, 10) : undefined }],
      quotes: [{ label: "Question", text: op.question }],
    }),
  closed: (c: CiqCase, op: OpenPoint) =>
    supplierMail(`${c.id}: an open question was closed`, {
      title: "An open question was closed",
      intro: `Beiersdorf closed an open question on ${caseLabel(c)}. No answer is needed any more.`,
      details: [...caseRows(c), { label: "Refers to", value: op.ref.label }],
      quotes: [{ label: "Question", text: op.question }],
    }),
  cancelled: (c: CiqCase) =>
    supplierMail(`${c.id}: the CIQ request was cancelled`, {
      title: "The CIQ request was cancelled",
      intro: `Beiersdorf cancelled the CIQ request ${caseLabel(c)}. No further input is needed from you.`,
      details: caseRows(c),
    }),
  reopened: (c: CiqCase) =>
    supplierMail(`${c.id}: the request for your final release is withdrawn for now`, {
      title: "Your final release is not needed for now",
      intro: `Beiersdorf reopened its review of ${caseLabel(c)}, so the request for your final release is withdrawn for now.`,
      details: caseRows(c),
      notes: ["You will be asked again once the review is complete."],
    }),
};

/** Sends one mail to the case's supplier contacts (never thrown, never awaited); `what` names it in the details and in
 *  a later failure. Nothing goes without a mail hook or without a contact address. */
export function sendMail(ctx: Pick<WriteCtx, "client" | "index" | "onMailProblem">, w: Pick<Work, "details">, caseId: string, what: string, mail: Omit<Mail, "to">): void {
  const url = mailUrlOf(ctx);
  const to = contactEmails(ctx, caseId);
  if (!url) return void w.details.push(`No e-mail (${what}): no mail hook is configured.`);
  if (!to.length) return void w.details.push(`No e-mail (${what}): no supplier contact of ${caseId} has an e-mail address.`);
  let posted: Promise<unknown>;
  try {
    posted = ctx.client.postWebhook(url, { To: to.join(", "), Subject: mail.subject, Body: mail.body });
  } catch (e) {
    posted = Promise.reject(e);
  }
  w.details.push(`E-mail (${what}) handed over for ${to.length === 1 ? "1 supplier contact" : `${to.length} supplier contacts`}.`);
  void posted.catch((e: unknown) => {
    try {
      ctx.onMailProblem?.(what, errorText(e));
    } catch {
      // best effort: the report must not become an unhandled rejection
    }
  });
}

// ---------------------------------------------------------------------------------- mentions in internal notes (27 Oct)

/** The app's home page where the screen runs: https://<the Kissflow page around the frame>/view/application/
 *  CIQ_Digital_A00/ui, on the host the mail hook's URL is built on (env.ts hookHostOf). Undefined without an acceptable
 *  Kissflow host (the mail then says to open CIQ Digital in Kissflow). No host is written in the bundle. */
export function appHomeUrl(client: Pick<AppClient, "hookHost">): string | undefined {
  const host = client.hookHost;
  return host && KISSFLOW_HOST.test(host) ? `https://${host}/view/application/${APP_ID}/ui` : undefined;
}

/** What a mention mail says (sent as an HTML page, mentionMail). */
export interface MentionFacts {
  writer: string;
  caseCode: string;
  tradeName?: string;
  /** The section's code ("K7") when the note is on a section. */
  sectionCode?: string;
  text: string;
  /** The app's home page (appHomeUrl), if known. */
  link?: string;
}

/** What the mention mail's Body says (mentionMail). */
export function mentionContent(x: MentionFacts): EmailContent {
  const where = `${x.caseCode}${x.tradeName ? ` (${x.tradeName})` : ""}${x.sectionCode ? `, section ${x.sectionCode}` : ""}`;
  return {
    title: "You were mentioned in an internal note",
    intro: `${x.writer} mentioned you in an internal note on ${where}.`,
    details: [
      { label: "Case", value: x.caseCode },
      { label: "Trade name", value: x.tradeName },
      { label: "Section", value: x.sectionCode },
      { label: "Written by", value: x.writer },
    ],
    quotes: [{ label: "Note", text: x.text }],
    notes: [x.link ? `The note is on case ${x.caseCode}, under Internal notes.` : `Open CIQ Digital in Kissflow to see the note. It is on case ${x.caseCode}, under Internal notes.`],
    ...(x.link ? { button: { label: "Open CIQ Digital", href: x.link } } : {}),
    audience: EMAIL_AUDIENCE.internalNotes,
  };
}

/** The mention mail: "<writer> mentioned you on <case code>", in the shared layout like the supplier mails (the same
 *  mail integration sends them all). The note keeps its line breaks; every value is HTML-escaped; the button only
 *  with the app's home page. */
export function mentionMail(x: MentionFacts): Omit<Mail, "to"> {
  return { subject: `${x.writer} mentioned you on ${x.caseCode}`, body: emailHtml(mentionContent(x)) };
}

/** What the mention mails of one note did (the writer's toast and details). */
export interface MentionMailResult {
  /** The colleagues mentioned (not the writer), by name. */
  mentioned: string[];
  /** The colleagues a mail was handed over for, by name. */
  mailed: string[];
  /** The colleagues with no e-mail address known, by name. */
  noAddress: string[];
  /** No mail hook is configured: nobody was mailed. */
  noHook: boolean;
}

/** The note's toast: "Note added." and what the mention mails did. */
export function mentionToast(r: MentionMailResult): string {
  if (!r.mentioned.length) return "Note added.";
  if (r.noHook) return "Note added. E-mail is not set up here, so nobody was notified.";
  const parts = ["Note added."];
  if (r.mailed.length) parts.push(`${r.mailed.length === 1 ? "1 colleague" : `${r.mailed.length} colleagues`} notified by e-mail.`);
  if (r.noAddress.length) {
    const one = r.noAddress.length === 1;
    parts.push(`${joinPeople(r.noAddress)} ${one ? "has" : "have"} no e-mail address here and ${one ? "was" : "were"} not notified.`);
  }
  return parts.join(" ");
}

/**
 * Mails every colleague the note mentions (see the header): one POST of {To, Subject, Body} each, never thrown, never
 * awaited. `state` is the action's result (its users and configuration); the writer is never mailed. What went is in
 * the job's details; a POST that fails later reaches onMailProblem("mention", why, <colleague>).
 */
export function sendMentionMails(ctx: Pick<WriteCtx, "client" | "index" | "acting" | "identity" | "onMailProblem">, w: Pick<Work, "details">, state: AppState, c: CiqCase, note: InternalNote): MentionMailResult {
  const ids = mentionRecipients(state, { by: note.by, mentions: note.mentions }).filter((id) => id !== ctx.acting.me.id);
  const people = ids.map((id) => state.users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const out: MentionMailResult = { mentioned: people.map((u) => u.name), mailed: [], noAddress: [], noHook: false };
  if (!people.length) return out;
  const url = mailUrlOf(ctx);
  if (!url) {
    out.noHook = true;
    w.details.push(`No e-mail (mention): no mail hook is configured, so ${joinPeople(out.mentioned)} ${people.length === 1 ? "was" : "were"} not notified.`);
    return out;
  }
  const facts: MentionFacts = {
    writer: ctx.acting.me.name || ctx.identity.name || "A colleague",
    caseCode: c.id,
    ...(c.materialName ? { tradeName: c.materialName } : {}),
    ...(note.sectionId ? { sectionCode: sectionOf(note.sectionId, c.templateVersion, state.config)?.code ?? note.sectionId } : {}),
    text: note.text,
  };
  const link = appHomeUrl(ctx.client);
  const mail = mentionMail({ ...facts, ...(link ? { link } : {}) });
  for (const u of people) {
    const to = (u.email ?? "").trim();
    if (!EMAIL.test(to)) {
      out.noAddress.push(u.name);
      w.details.push(`No e-mail (mention): ${u.name} has no e-mail address here.`);
      continue;
    }
    let posted: Promise<unknown>;
    try {
      posted = ctx.client.postWebhook(url, { To: to, Subject: mail.subject, Body: mail.body });
    } catch (e) {
      posted = Promise.reject(e);
    }
    out.mailed.push(u.name);
    w.details.push(`E-mail (mention) handed over for ${u.name}.`);
    void posted.catch((e: unknown) => {
      try {
        ctx.onMailProblem?.("mention", errorText(e), u.name);
      } catch {
        // best effort: the report must not become an unhandled rejection
      }
    });
  }
  return out;
}
