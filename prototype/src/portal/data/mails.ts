// The supplier portal's e-mails to Beiersdorf (22 Oct, Thomas: through the portal's "Mail Integration - Thomas",
// {To, Subject, Body}), in the shared e-mail layout (@/domain/emailHtml, 27 Oct) like the app's. Pure: liveActions.ts
// gathers the facts and sends; these only word them.
//   dataChanged       the supplier changed the CIQ after the completeness confirmation → the case's RMM contact
//   questionAnswered  the supplier answered a question → its raiser and the RMM contact
//   changeReported    the supplier reported a change on the released CIQ → the RMM contact
// The portal runs on the portal's own domain, so the app's address is not known there: a mail carries the "Open CIQ
// Digital" button only when the caller passes a link (an absolute https URL); liveActions passes none (27 Oct).
import { emailHtml, type EmailContent, type EmailDetail } from "@/domain/emailHtml";

export interface PortalMail {
  subject: string;
  /** An HTML page in the shared e-mail layout. */
  body: string;
  /** What the Body says (for the plain-text alternative and the samples); not sent. */
  content: EmailContent;
}

/** The case a mail is about, as the request carries it. */
export interface MailCase {
  /** Case_Code. */
  code: string;
  /** Trade_Name. */
  trade?: string;
  /** Supplier_Display_Name. */
  supplier?: string;
  /** Who did it (the signed-in contact's name); "The supplier" when unknown. */
  by?: string;
  /** The app's address, only when it is known for sure (see the header). */
  link?: string;
}

const who = (x: MailCase) => (x.by ?? "").trim() || "The supplier";
const caseLabel = (x: MailCase) => `${x.code}${x.trade ? ` (${x.trade})` : ""}`;
const caseRows = (x: MailCase): EmailDetail[] => [
  { label: "Case", value: x.code },
  { label: "Trade name", value: x.trade },
  { label: "Supplier", value: x.supplier },
];
const mail = (subject: string, x: MailCase, content: EmailContent): PortalMail => {
  const full: EmailContent = { ...content, ...(x.link ? { button: { label: "Open CIQ Digital", href: x.link } } : {}) };
  return { subject, body: emailHtml(full), content: full };
};

/** "Data changed" (one mail per change, after the completeness confirmation): `what` is "updated answers",
 *  "uploaded a document" or "removed a document". */
export function dataChangedMail(x: MailCase & { what: string }): PortalMail {
  return mail(`${x.code}: the supplier changed the CIQ`, x, {
    title: "The supplier changed the CIQ",
    intro: `${who(x)} changed the CIQ of ${caseLabel(x)}: ${x.what}.`,
    details: [...caseRows(x), { label: "Change", value: x.what }, { label: "Changed by", value: x.by }],
    notes: ["Please open CIQ Digital to see the change."],
  });
}

/** An answer to a Beiersdorf question: `kind` is the answer's Response_Kind ("Answer", "Document", "Cannot provide",
 *  "Additional part completed"); `attachment` the file sent with it, if any. */
export function questionAnsweredMail(x: MailCase & { question?: string; kind: string; answer: string; attachment?: string }): PortalMail {
  return mail(`${x.code}: the supplier answered your question`, x, {
    title: "The supplier answered your question",
    intro: `${who(x)} answered the question on ${caseLabel(x)}.`,
    details: [...caseRows(x), { label: "Answered by", value: x.by }, { label: "Attachment", value: x.attachment }],
    quotes: [
      { label: "Question", text: x.question ?? "" },
      { label: `Answer (${x.kind})`, text: x.answer },
    ],
    notes: ["Please open CIQ Digital to review the answer."],
  });
}

/** "Report a change" on the released CIQ: the report's text. */
export function changeReportedMail(x: MailCase & { text: string }): PortalMail {
  return mail(`${x.code}: the supplier reported a change`, x, {
    title: "The supplier reported a change",
    intro: `${who(x)} reported a change on the released CIQ of ${caseLabel(x)}.`,
    details: [...caseRows(x), { label: "Reported by", value: x.by }],
    quotes: [{ label: "Reported change", text: x.text.trim() }],
    notes: ["Please open CIQ Digital to review it."],
  });
}
