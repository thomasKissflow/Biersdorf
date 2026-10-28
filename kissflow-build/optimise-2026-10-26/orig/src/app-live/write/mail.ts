// E-mails from the screens (Thomas, 22 Oct: D1 (a), sent by the browser): one POST of {To, Subject, Body} to "Mail
// Integration - Thomas", whose hook URL is SET:current Payload_JSON.mailHook (a full https hook URL, written by the portal
// session). As for the hand-offs, only its token counts: the URL is built where the screen runs (handoff.ts hookToken /
// hookUrl), so the dev sandbox's row works in production. A mail is best effort and fire-and-forget: it goes after the
// item write and its hand-off, only when that hand-off went out (the mail tells of a change the portal shows), and it
// never holds or undoes the action; a POST that fails later reaches WriteCtx.onMailProblem. To: the case's supplier
// contacts (CaseRef.contacts), each address once. The texts are the supplier's: plain words, no internal reason, every
// value HTML-escaped. What happened goes to the job's details (the Writes log), never to the toast.
import type { CiqCase, OpenPoint } from "@/domain/types";
import { errorText } from "@/portal/kf/sdk";
import type { WriteCtx } from "../types";
import type { Work } from "./audit";
import { hookToken, hookUrl } from "./handoff";

export interface Mail {
  to: string[];
  subject: string;
  /** HTML. */
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

export const esc = (v: string): string => v.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const caseLabel = (c: CiqCase) => `${esc(c.id)}${c.materialName ? ` (${esc(c.materialName)})` : ""}`;
const page = (...paras: string[]) => `<html><body>${paras.map((p) => `<p>${p}</p>`).join("")}<p>Sent automatically by CIQ Digital, Beiersdorf.</p></body></html>`;
const OPEN_PORTAL = "Please open the CIQ supplier portal for the details.";

/** The four mails (the screens' promises, D1): a question edited or closed while the supplier's query waits, the case
 *  cancelled, the review reopened from the final release. */
export const MAILS = {
  edited: (c: CiqCase, op: OpenPoint): Omit<Mail, "to"> => ({
    subject: `${c.id}: Beiersdorf changed an open question`,
    body: page(`Beiersdorf changed an open question on ${caseLabel(c)}.`, `<b>Question:</b> ${esc(op.question)}`, ...(op.dueDate ? [`<b>Please answer by:</b> ${esc(op.dueDate.slice(0, 10))}`] : []), OPEN_PORTAL),
  }),
  closed: (c: CiqCase, op: OpenPoint): Omit<Mail, "to"> => ({
    subject: `${c.id}: an open question was closed`,
    body: page(`Beiersdorf closed an open question on ${caseLabel(c)}. No answer is needed any more.`, `<b>Question:</b> ${esc(op.question)}`, OPEN_PORTAL),
  }),
  cancelled: (c: CiqCase): Omit<Mail, "to"> => ({
    subject: `${c.id}: the CIQ request was cancelled`,
    body: page(`Beiersdorf cancelled the CIQ request ${caseLabel(c)}. No further input is needed from you.`, OPEN_PORTAL),
  }),
  reopened: (c: CiqCase): Omit<Mail, "to"> => ({
    subject: `${c.id}: the request for your final release is withdrawn for now`,
    body: page(`Beiersdorf reopened its review of ${caseLabel(c)}, so the request for your final release is withdrawn for now.`, "You will be asked again once the review is complete.", OPEN_PORTAL),
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
