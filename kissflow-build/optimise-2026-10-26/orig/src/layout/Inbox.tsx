// The simulated e-mail inbox of the person being viewed (spec §2). An envelope in the top bar of every shell opens a
// drawer: the list (newest first, unread in bold) and a reading pane with the mail's deep link. In the final app these
// mails arrive in Outlook, so the inbox is not a menu entry.

import { ArrowLeft, ArrowRight, Mail as MailIcon, MailOpen } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Drawer, EmptyState, Mono, cx, type Tone } from "@/components/ui";
import { MAIL_FROM, isUnread, mailsFor, unreadCount } from "@/domain/mail";
import { fmtDate, fmtDateTime, nowIso, userName } from "@/domain/selectors";
import type { Mail, MailChannel, MailEvent } from "@/domain/types";
import { useStore } from "@/store/store";

const EVENT_LABEL: Record<MailEvent, string> = {
  invitation: "Invitation",
  "review-assigned": "Review task",
  informed: "For information",
  "op-raised": "New question",
  "op-answered": "Answer received",
  "op-returned": "More information needed",
  "op-accepted": "Answer accepted",
  "op-edited": "Question changed",
  "op-closed": "Question closed",
  "data-changed": "Data changed",
  "release-requested": "Final release requested",
  "release-withdrawn": "Release request withdrawn",
  "release-receipt": "Release received",
  "final-document": "Final document",
  cancelled: "Cancelled",
  reactivated: "Reactivated",
  "change-reported": "Change reported",
  reminder: "Reminder",
  escalation: "Escalation",
  "note-mention": "Mentioned in a note",
};

const EVENT_TONE: Partial<Record<MailEvent, Tone>> = {
  escalation: "bad",
  reminder: "warn",
  "op-returned": "warn",
  "final-document": "ok",
  "release-receipt": "ok",
  "op-accepted": "ok",
  "release-requested": "brand",
  invitation: "brand",
  "note-mention": "info",
};

const CHANNEL_LABEL: Record<MailChannel, string> = {
  "open-point-webhook": "Open-point notification",
  "task-notification": "Task notification",
  "final-document": "Final document notification",
};

/** The supplier side never says "open point" or "cancelled": it speaks of questions and withdrawn requests. */
const SUPPLIER_EVENT_LABEL: Partial<Record<MailEvent, string>> = { cancelled: "Request withdrawn", reactivated: "Request active again" };
const SUPPLIER_CHANNEL_LABEL: Partial<Record<MailChannel, string>> = { "open-point-webhook": "Question notification" };
const eventLabel = (m: Mail) => (m.audience === "supplier" ? (SUPPLIER_EVENT_LABEL[m.event] ?? EVENT_LABEL[m.event]) : EVENT_LABEL[m.event]);
const channelLabel = (m: Mail) => (m.audience === "supplier" ? (SUPPLIER_CHANNEL_LABEL[m.channel] ?? CHANNEL_LABEL[m.channel]) : CHANNEL_LABEL[m.channel]);

/** Today: "14:05"; this year: "9 Oct"; otherwise "9 Oct 2025". */
function listTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date(nowIso());
  if (d.toDateString() === now.toDateString()) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.getFullYear() === now.getFullYear() ? fmtDate(iso).replace(/ \d{4}$/, "") : fmtDate(iso);
}

/** What the deep link opens, in the reader's words. */
function linkLabel(m: Mail): string {
  if (m.audience === "supplier") return m.opId ? "Open the question in the Supplier Portal" : "Open the request in the Supplier Portal";
  if (m.event === "note-mention") return "Open the note";
  if (m.link.includes("tab=final-document")) return "Open the final document";
  if (m.link.startsWith("/review/")) return m.opId ? "Open the question in the review" : "Open the review";
  return "Open the case";
}

const firstLine = (body: string) => body.split("\n").find((l) => l.trim()) ?? "";

/** The list shows the case ID in its own line, so a subject's leading "CIQ-2026-0001: " (or trailing " on CIQ-2026-0001")
 *  is dropped there. */
function listSubject(m: Mail): string {
  if (!m.caseId) return m.subject;
  if (m.subject.startsWith(`${m.caseId}: `)) return m.subject.slice(m.caseId.length + 2);
  if (m.subject.endsWith(` on ${m.caseId}`)) return m.subject.slice(0, -(m.caseId.length + 4));
  return m.subject;
}

/** The subject with the case ID kept on one line ("CIQ-2026-0001" never breaks at a hyphen). */
function SubjectText({ m }: { m: Mail }) {
  const at = m.caseId ? m.subject.indexOf(m.caseId) : -1;
  if (!m.caseId || at < 0) return <>{m.subject}</>;
  return (
    <>
      {m.subject.slice(0, at)}
      <span className="whitespace-nowrap">{m.caseId}</span>
      {m.subject.slice(at + m.caseId.length)}
    </>
  );
}

/** Envelope with the unread count; opens the inbox drawer. Shown in the internal and the supplier shell. */
export function InboxButton() {
  const { state, me } = useStore();
  const [open, setOpen] = useState(false);
  const unread = unreadCount(state, me.id);
  const label = unread ? `Inbox, ${unread} unread` : "Inbox";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        data-testid="inbox-button"
        data-count={unread}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <MailIcon size={17} />
        {unread > 0 && (
          <span data-testid="inbox-unread-count" data-count={unread} aria-hidden className="absolute -top-0.5 -right-0.5 min-w-[17px] rounded-full bg-brand px-1 text-center text-[10.5px] leading-[17px] font-semibold text-brand-ink ring-2 ring-surface tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && <InboxDrawer onClose={() => setOpen(false)} />}
    </>
  );
}

function InboxDrawer({ onClose }: { onClose: () => void }) {
  const { state, me, persona, markMailRead, markAllMailsRead } = useStore();
  const nav = useNavigate();
  const [sel, setSel] = useState<string | null>(null);
  const mails = mailsFor(state, me.id);
  const unread = mails.filter((m) => isUnread(m, me.id)).length;
  const current = mails.find((m) => m.id === sel);

  const openMail = (m: Mail) => {
    setSel(m.id);
    if (isUnread(m, me.id)) markMailRead(m.id);
  };
  const follow = (m: Mail) => {
    if (isUnread(m, me.id)) markMailRead(m.id);
    onClose();
    nav(m.link);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={920}
      title="Inbox"
      subtitle={`Simulated e-mail · ${me.name}${me.email ? ` <${me.email}>` : ""}`}
      bodyClassName="flex overflow-hidden"
      data-testid="inbox-drawer"
    >
      {mails.length === 0 ? (
        <div className="flex flex-1 items-center justify-center overflow-y-auto">
          <EmptyState data-testid="inbox-empty" icon={<MailOpen size={28} strokeWidth={1.6} />} title="No mail yet">
            {persona.side === "supplier"
              ? "E-mails from Beiersdorf arrive here: the invitation to a questionnaire, questions on your answers and the request for your final release."
              : "E-mails about your cases arrive here: review tasks, answers from suppliers, changed data and the final document."}
          </EmptyState>
        </div>
      ) : (
        <>
          <section aria-label="Mails" className={cx("flex min-h-0 w-full flex-col md:w-[340px] md:shrink-0 md:border-r md:border-line", current && "max-md:hidden")}>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-2">
              <span className="text-[12.5px] text-ink-3 tabular-nums">
                {mails.length} {mails.length === 1 ? "mail" : "mails"} · {unread ? `${unread} unread` : "all read"}
              </span>
              <Button variant="ghost" size="sm" disabled={!unread} onClick={markAllMailsRead} data-testid="inbox-mark-all-read">
                Mark all read
              </Button>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto scrollbar-thin">
              {mails.map((m) => {
                const isNew = isUnread(m, me.id);
                const selected = m.id === sel;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openMail(m)}
                      aria-current={selected || undefined}
                      data-testid={`inbox-item-${m.id}`}
                      data-event={m.event}
                      data-read={isNew ? "false" : "true"}
                      className={cx("flex w-full gap-2.5 px-4 py-3 text-left transition-colors", selected ? "bg-brand-soft" : "hover:bg-surface-2")}
                    >
                      <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", isNew ? "bg-brand" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={cx("line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug first-letter:uppercase", isNew ? "font-semibold text-ink" : "text-ink-2")}>{listSubject(m)}</span>
                          <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">{listTime(m.at)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{firstLine(m.body)}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                          <span>{eventLabel(m)}</span>
                          {m.caseId && (
                            <>
                              <span aria-hidden>·</span>
                              <Mono className="text-[11.5px]">{m.caseId}</Mono>
                            </>
                          )}
                          {isNew && <span className="sr-only">, unread</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section aria-label="Reading pane" className={cx("min-h-0 flex-1 overflow-y-auto scrollbar-thin", !current && "max-md:hidden")}>
            {current ? (
              <MailView m={current} onBack={() => setSel(null)} onFollow={() => follow(current)} onUnread={() => markMailRead(current.id, false)} unread={isUnread(current, me.id)} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-ink-3">Select a mail to read it.</div>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

function MailView({ m, unread, onBack, onFollow, onUnread }: { m: Mail; unread: boolean; onBack: () => void; onFollow: () => void; onUnread: () => void }) {
  const { state } = useStore();
  const to = m.to.map((id) => userName(state, id)).join(", ");
  return (
    <article data-testid="inbox-reading-pane" data-mail-id={m.id} className="px-5 py-4">
      <button type="button" onClick={onBack} data-testid="inbox-back" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline md:hidden">
        <ArrowLeft size={14} /> All mails
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={EVENT_TONE[m.event] ?? "neutral"}>{eventLabel(m)}</Badge>
        {m.caseId && <Mono className="text-ink-3">{m.caseId}</Mono>}
      </div>
      <h3 className="mt-2 text-[17px] leading-snug font-semibold text-pretty text-ink">
        <SubjectText m={m} />
      </h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-ink-3">From</dt>
        <dd className="min-w-0 break-words text-ink-2">{MAIL_FROM}</dd>
        <dt className="text-ink-3">To</dt>
        <dd className="min-w-0 break-words text-ink-2">{to}</dd>
        <dt className="text-ink-3">Sent</dt>
        <dd className="text-ink-2 tabular-nums">{fmtDateTime(m.at)}</dd>
        <dt className="text-ink-3">Type</dt>
        <dd className="text-ink-2">{channelLabel(m)}</dd>
      </dl>
      <div className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-line text-ink">{m.body}</div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" iconRight={<ArrowRight size={14} />} onClick={onFollow} data-testid="inbox-open-link">
          {linkLabel(m)}
        </Button>
        {!unread && (
          <Button variant="ghost" size="sm" onClick={onUnread} data-testid="inbox-mark-unread">
            Mark as unread
          </Button>
        )}
      </div>
    </article>
  );
}
