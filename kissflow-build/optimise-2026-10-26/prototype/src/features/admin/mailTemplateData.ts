// The e-mail templates behind every mail event (spec §2), shown on the admin Reminders page. Static: they never need a
// case, so the page works on the empty start. The wording follows the composition in @/domain/mail and the actions
// that call it; {Placeholders} stand for the facts filled in when the mail is sent. Supplier templates use only
// supplier-visible facts (case, material, the question's reference, question text, due date).

import type { MailChannel, MailEvent } from "@/domain/types";

export type TemplateGroup = "case" | "points" | "review" | "release" | "reminders";

export interface MailTemplate {
  /** Unique: `<event>` or `<event>:<audience>` where one event has both a supplier and an internal mail. */
  id: string;
  event: MailEvent;
  group: TemplateGroup;
  label: string;
  audience: "supplier" | "internal";
  channel: MailChannel;
  /** What sends it. */
  when: string;
  /** Who receives it. */
  to: string;
  subject: string;
  body: string;
}

export const GROUP_LABEL: Record<TemplateGroup, string> = {
  case: "Case",
  points: "Open points",
  review: "Review",
  release: "Final release",
  reminders: "Reminders and escalation",
};

export const CHANNEL_LABEL: Record<MailChannel, string> = {
  "open-point-webhook": "Open-point e-mail",
  "task-notification": "Task notification",
  "final-document": "Final document",
};

export const CHANNEL_HINT: Record<MailChannel, string> = {
  "open-point-webhook": "One reusable e-mail for every open-point event, in the portal and the app",
  "task-notification": "The task e-mail of the app or the supplier portal",
  "final-document": "Sent once, when the final document is generated at the release",
};

export const MAIL_TEMPLATES: MailTemplate[] = [
  // ------------------------------------------------------------------ case
  {
    id: "invitation",
    event: "invitation",
    group: "case",
    label: "Invitation",
    audience: "supplier",
    channel: "task-notification",
    when: "RMM starts the case, or names another contact on it",
    to: "Each case contact (a newly named contact gets its own)",
    subject: "Please fill in the CIQ for {Material}",
    body: "Beiersdorf asks you to fill in the Cosmetic Ingredient Questionnaire (CIQ) for {Material} ({Case ID}).\nAnswer the metadata questions first: the sections that apply open as you answer. Then complete them, upload the evidence at the questions and confirm completeness.\nDue date: {Due date}.",
  },
  {
    id: "cancelled:supplier",
    event: "cancelled",
    group: "case",
    label: "Request withdrawn",
    audience: "supplier",
    channel: "task-notification",
    when: "RMM cancels the case, with a justification",
    to: "Case contacts",
    subject: "{Case ID}: request withdrawn",
    body: "Beiersdorf has withdrawn the request for {Material} ({Case ID}). No further action is needed, and your open tasks on it are closed.",
  },
  {
    id: "cancelled:internal",
    event: "cancelled",
    group: "case",
    label: "Case cancelled",
    audience: "internal",
    channel: "task-notification",
    when: "RMM cancels the case, with a justification",
    to: "Reviewers with an open review task",
    subject: "{Case ID}: case cancelled",
    body: "{RMM} cancelled {Material} ({Case ID}): {Justification}\nYour review task on it has ended.",
  },
  {
    id: "reactivated:supplier",
    event: "reactivated",
    group: "case",
    label: "Request active again",
    audience: "supplier",
    channel: "task-notification",
    when: "RMM reactivates a cancelled case (within 12 months)",
    to: "Case contacts",
    subject: "{Case ID}: request active again",
    body: "Beiersdorf has reactivated the request for {Material} ({Case ID}). Your tasks on it are open again in the supplier portal. Due date: {Due date}.",
  },
  {
    id: "reactivated:internal",
    event: "reactivated",
    group: "case",
    label: "Case reactivated",
    audience: "internal",
    channel: "task-notification",
    when: "RMM reactivates a cancelled case (within 12 months)",
    to: "Reviewers whose review task opens again",
    subject: "{Case ID}: case reactivated",
    body: "{RMM} reactivated {Material} ({Case ID}). Your review task on it is open again.",
  },
  {
    id: "change-reported",
    event: "change-reported",
    group: "case",
    label: "Change reported after the release",
    audience: "internal",
    channel: "task-notification",
    when: "A supplier contact uses “Report a change” on a completed request",
    to: "RMM case owner",
    subject: "{Case ID}: the supplier reported a change",
    body: "{Supplier contact} reported a change to the released CIQ of {Material} ({Case ID}):\n“{Change}”\nThe released case stays unchanged. Start a new case if the change needs a new questionnaire.",
  },

  // ------------------------------------------------------------------ review
  {
    id: "review-assigned",
    event: "review-assigned",
    group: "review",
    label: "Review task",
    audience: "internal",
    channel: "task-notification",
    when: "Completeness is confirmed; a later change adds or reopens a review; a review is handed to a colleague",
    to: "The assignee of each review concerned (RMM's review included)",
    subject: "{Case ID}: your {Review} of {Material}",
    body: "{Reason}\nYour {Review} for {Material} ({Case ID}) is open in My reviews.",
  },
  {
    id: "informed",
    event: "informed",
    group: "review",
    label: "For your information",
    audience: "internal",
    channel: "task-notification",
    when: "Completeness is confirmed",
    to: "Customs and Legal",
    subject: "{Case ID}: for your information",
    body: "The supplier confirmed completeness of the CIQ for {Material} ({Case ID}). Customs and Legal are informed and can read the case, K7 and K8 included.",
  },
  {
    id: "data-changed",
    event: "data-changed",
    group: "review",
    label: "Supplier changed data",
    audience: "internal",
    channel: "task-notification",
    when: "The supplier changes an answer or adds a document after the completeness confirmation (changes within 30 minutes are combined)",
    to: "The reviewers who use that section (RMM always)",
    subject: "{Case ID}: the supplier changed data in {Section}",
    body: "{Section}: {What changed} ({Supplier contact}, {Time}).\nThe questionnaire of {Material} ({Case ID}) shows the current answers. If the change reopened your completed review, a separate e-mail tells you so.",
  },

  // ------------------------------------------------------------------ open points
  {
    id: "op-raised",
    event: "op-raised",
    group: "points",
    label: "Open point raised",
    audience: "supplier",
    channel: "open-point-webhook",
    when: "RMM or a department asks a question, requests a document or adds a section",
    to: "Case contacts",
    subject: "{Case ID}: a {Kind} from Beiersdorf",
    body: "Beiersdorf has a {Kind} on {Reference} for {Material} ({Case ID}):\n“{Question}”\nPlease answer by {Due date}. Upload any document at the question in the supplier portal.",
  },
  {
    id: "op-answered",
    event: "op-answered",
    group: "points",
    label: "Open point answered",
    audience: "internal",
    channel: "open-point-webhook",
    when: "The supplier answers, uploads at the question or explains why it cannot provide",
    to: "The raiser and the responsible person (once if the same)",
    subject: "{Case ID}: the supplier answered {Open point}",
    body: "{Supplier contact} answered on {Reference} ({Material}, {Case ID}):\n“{Answer}”\nDocument at the question: {File name}\nPlease accept it, return it or close the point.",
  },
  {
    id: "op-returned",
    event: "op-returned",
    group: "points",
    label: "Answer returned",
    audience: "supplier",
    channel: "open-point-webhook",
    when: "The raiser returns the answer with a reason",
    to: "Case contacts",
    subject: "{Case ID}: Beiersdorf needs more on {Reference}",
    body: "Beiersdorf reviewed your answer on {Reference} for {Material} ({Case ID}) and needs more:\n“{Return reason}”\nPlease answer by {Due date}.",
  },
  {
    id: "op-accepted",
    event: "op-accepted",
    group: "points",
    label: "Answer accepted",
    audience: "supplier",
    channel: "open-point-webhook",
    when: "The raiser accepts the answer",
    to: "Case contacts",
    subject: "{Case ID}: your answer was accepted",
    body: "Beiersdorf accepted your answer on {Reference} for {Material} ({Case ID}). Nothing more is needed on it.",
  },
  {
    id: "op-edited",
    event: "op-edited",
    group: "points",
    label: "Open point changed",
    audience: "supplier",
    channel: "open-point-webhook",
    when: "The raiser changes the question, justification, due date or responsible person",
    to: "Case contacts",
    subject: "{Case ID}: Beiersdorf changed a {Kind}",
    body: "Beiersdorf changed its {Kind} on {Reference} for {Material} ({Case ID}). The current version:\n“{Question}”\nDue date: {Due date}.\nPlease answer the changed question. (Only when a changed question starts a new round.)",
  },
  {
    id: "op-closed",
    event: "op-closed",
    group: "points",
    label: "Open point closed",
    audience: "supplier",
    channel: "open-point-webhook",
    when: "The raiser withdraws the point, or closes it as not accepted",
    to: "Case contacts",
    subject: "{Case ID}: a question was closed",
    body: "Beiersdorf closed its {Kind} on {Reference} for {Material} ({Case ID}). No answer is needed on it.",
  },

  // ------------------------------------------------------------------ release
  {
    id: "release-requested",
    event: "release-requested",
    group: "release",
    label: "Final release requested",
    audience: "supplier",
    channel: "task-notification",
    when: "RMM and every department review have completed (sent once)",
    to: "Case contacts",
    subject: "{Case ID}: please give the final release",
    body: "Beiersdorf has completed its review of the CIQ for {Material} ({Case ID}). Your questionnaire is now locked: please check it and give the final release in the supplier portal. If something must change, contact Beiersdorf; they can reopen the review. With the release the CIQ is frozen.",
  },
  {
    id: "release-withdrawn",
    event: "release-withdrawn",
    group: "release",
    label: "Release request withdrawn",
    audience: "supplier",
    channel: "task-notification",
    when: "A reviewer reopens its completed review while the final release is requested (the supplier can change nothing then)",
    to: "Case contacts",
    subject: "{Case ID}: the final release is not needed yet",
    body: "Beiersdorf is reviewing the CIQ for {Material} ({Case ID}) again, so the request for your final release is withdrawn for now. You will get a new request when the review is complete. Your questionnaire is open again, so you can update your answers until then.",
  },
  {
    id: "release-receipt",
    event: "release-receipt",
    group: "release",
    label: "Release receipt",
    audience: "supplier",
    channel: "task-notification",
    when: "A contact who may confirm gives the final release",
    to: "Case contacts",
    subject: "{Case ID}: final release received",
    body: "Thank you. The final release of the CIQ for {Material} ({Case ID}) was recorded on {Time} ({Supplier contact}). The CIQ is now frozen. If something changes later, use “Report a change” in the supplier portal.",
  },
  {
    id: "final-document",
    event: "final-document",
    group: "release",
    label: "Final document ready",
    audience: "internal",
    channel: "final-document",
    when: "The case completes with the final release and the final document is generated",
    to: "RMM case owner",
    subject: "{Case ID}: final document ready",
    body: "The supplier gave the final release of {Material} ({Case ID}) and the case is completed. The final document was generated automatically and sealed (document seal {Seal}). It holds the released answers, the evidence list, every open-point thread and all confirmations.",
  },

  // ------------------------------------------------------------------ reminders
  {
    id: "reminder:supplier",
    event: "reminder",
    group: "reminders",
    label: "Reminder or overdue notice",
    audience: "supplier",
    channel: "task-notification",
    when: "A supplier task (fill in the CIQ, answer a question, give the final release) passes its reminder days or its due date",
    to: "Case contacts",
    subject: "{Reminder or Overdue}: {Task} ({Case ID})",
    body: "{A friendly reminder or This task is overdue}: {Task} for {Material} ({Case ID}) on {Reference}. Due date: {Due date}.",
  },
  {
    id: "reminder:internal",
    event: "reminder",
    group: "reminders",
    label: "Idle review reminder",
    audience: "internal",
    channel: "task-notification",
    when: "A review has had no activity for the reminder days",
    to: "The assigned reviewer",
    subject: "Reminder: your {Review} of {Case ID}",
    body: "Your {Review} of {Material} ({Case ID}) has had no activity for {Days} days.",
  },
  {
    id: "escalation",
    event: "escalation",
    group: "reminders",
    label: "Escalation",
    audience: "internal",
    channel: "task-notification",
    when: "A task is still open after the escalation days",
    to: "RMM case owner (an unanswered point: the raiser too; RMM's own idle review: the business owner)",
    subject: "Escalation: {What is waiting} ({Case ID})",
    body: "{Who has not acted} on {Material} ({Case ID}) for {Days} days. Due date: {Due date}.",
  },

  // ------------------------------------------------------------------ internal notes (listed under Review)
  {
    id: "note-mention",
    event: "note-mention",
    group: "review",
    label: "Mentioned in an internal note",
    audience: "internal",
    channel: "task-notification",
    when: "Someone at Beiersdorf mentions a colleague with @ in an internal note",
    to: "Each colleague mentioned, once (not the writer; supplier contacts cannot be mentioned)",
    subject: "{Writer} mentioned you on {Case ID}",
    body: "{Writer} mentioned you in an internal note on {Material} ({Case ID}), section {Section, when the note is on one}:\n“{Note}”\nOpen the note to reply. Internal notes are for Beiersdorf only; the supplier never sees them.",
  },
];

/** Splits a template text into plain parts and {placeholders}. */
export function templateParts(text: string): { text: string; placeholder: boolean }[] {
  return text
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((t) => (t.startsWith("{") && t.endsWith("}") ? { text: t.slice(1, -1), placeholder: true } : { text: t, placeholder: false }));
}
