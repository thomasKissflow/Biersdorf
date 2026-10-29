// /admin/notifications: reminder and escalation settings, "Run reminders now", and the e-mail templates of every mail
// event (REQ-CTL-010, REQ-RMES-019, spec §1.13 and §2).
// Phones (< 768 px, Thomas 30 Oct): the rules and the mails sent as cards, read-only; no "Run reminders now" (the
// business administrator gets "Use a larger screen to edit").
import { BellRing, Play, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Badge, Button, Card, CardHeader, CardList, CardListItem, EmptyState, Mono, PageHeader, SectionTitle, Select, Table, Td, TextInput, Toggle, Tr, cx } from "@/components/ui";
import { DAY, fmtDate, fmtDateTime, isClosed, nowIso, userName } from "@/domain/selectors";
import type { ReminderSetting } from "@/domain/types";
import { useStore } from "@/store/store";
import { MailTemplates } from "./MailTemplates";
import { AdminOnly, ReadOnlyNote, useAdminAccess } from "./shared";

/** What the days of each rule count from (as runReminders evaluates them). */
const COUNTED_FROM: Record<string, string> = {
  "rem-1": "From the invitation. Overdue after the case due date.",
  "rem-2": "From when the question went to the supplier. Overdue after its due date.",
  "rem-3": "From the reviewer's last activity on the case.",
  "rem-5": "From the release request.",
  "rem-6": "Counted from the expiry date: reminder before, escalation after. No expiry dates are recorded yet, so nothing is sent.",
};

const AS_OF: { days: number; label: string }[] = [
  { days: 0, label: "Today" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "In 7 days" },
  { days: 14, label: "In 14 days" },
  { days: 30, label: "In 30 days" },
];

/** Whole days 0–90. Saves on Enter or when the field loses focus; an invalid value goes back to the stored one. */
function DaysInput({ value, onCommit, disabled, label, testid }: { value: number; onCommit: (n: number) => void; disabled: boolean; label: string; testid: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text !== "" && Number.isInteger(n) && n >= 0 && n <= 90) {
      if (n !== value) onCommit(n);
    } else setText(String(value));
  };
  return (
    <TextInput
      type="number"
      inputMode="numeric"
      min={0}
      max={90}
      value={text}
      disabled={disabled}
      aria-label={label}
      data-testid={testid}
      className="w-16 max-w-16 min-w-16 shrink-0 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setText(String(value));
      }}
    />
  );
}

function ReminderRow({ r, canEdit }: { r: ReminderSetting; canEdit: boolean }) {
  const { updateReminder } = useStore();
  const beforeExpiry = r.afterDays < 0; // certificate expiry: counted from the expiry date
  const order = !beforeExpiry && r.escalateAfterDays <= r.afterDays;
  return (
    <Tr data-testid={`reminder-row-${r.id}`} data-status={r.enabled ? "on" : "off"} className={cx(!r.enabled && "[&_td]:text-ink-3")}>
      <Td className="min-w-[220px] align-top">
        <div className={cx("font-medium", r.enabled ? "text-ink" : "text-ink-3")}>{r.event}</div>
        {COUNTED_FROM[r.id] && <div className="mt-0.5 text-xs text-ink-3">{COUNTED_FROM[r.id]}</div>}
        {order && r.enabled && <div className="mt-0.5 text-xs font-medium text-bad">The escalation should come after the reminder.</div>}
      </Td>
      <Td className="align-top text-[12.5px] whitespace-nowrap text-ink-2">{r.recipient}</Td>
      <Td className="align-top whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <DaysInput
            value={Math.abs(r.afterDays)}
            disabled={!canEdit}
            label={`${r.event}: remind after days`}
            testid={`reminder-after-${r.id}`}
            onCommit={(n) => updateReminder(r.id, { afterDays: beforeExpiry ? -n : n })}
          />
          <span className="text-[12.5px] text-ink-3">{beforeExpiry ? "days before" : "days"}</span>
        </span>
      </Td>
      <Td className="min-w-[160px] align-top text-[12.5px] text-ink-2">{r.escalateTo}</Td>
      <Td className="align-top whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <DaysInput value={r.escalateAfterDays} disabled={!canEdit} label={`${r.event}: escalate after days`} testid={`reminder-escalate-${r.id}`} onCommit={(n) => updateReminder(r.id, { escalateAfterDays: n })} />
          <span className="text-[12.5px] text-ink-3">{beforeExpiry ? "days after" : "days"}</span>
        </span>
      </Td>
      <Td className="align-top">
        {canEdit ? (
          // Block-level flex: an inline label sat on the text baseline, a few px above the row's inputs.
          <div className="flex items-center">
            <Toggle
              data-testid={`reminder-toggle-${r.id}`}
              checked={r.enabled}
              onChange={(v) => updateReminder(r.id, { enabled: v })}
              label={<span className="text-[12.5px] text-ink-2">{r.enabled ? "On" : "Off"}</span>}
            />
          </div>
        ) : (
          <Badge tone={r.enabled ? "ok" : "neutral"} dot>
            {r.enabled ? "On" : "Off"}
          </Badge>
        )}
      </Td>
    </Tr>
  );
}

/** A rule on a phone: what it reminds of, to whom and when, read-only. */
function PhoneReminder({ r }: { r: ReminderSetting }) {
  const beforeExpiry = r.afterDays < 0;
  const order = !beforeExpiry && r.escalateAfterDays <= r.afterDays;
  return (
    <CardListItem
      data-testid={`reminder-row-${r.id}`}
      title={<span className={r.enabled ? "text-ink" : "text-ink-3"}>{r.event}</span>}
      badge={
        <Badge tone={r.enabled ? "ok" : "neutral"} dot>
          {r.enabled ? "On" : "Off"}
        </Badge>
      }
      meta={
        <>
          {COUNTED_FROM[r.id]}
          {order && r.enabled && <span className="block font-medium text-bad">The escalation should come after the reminder.</span>}
        </>
      }
      fields={[
        { label: "Reminder to", value: r.recipient },
        { label: "Remind after", value: <span data-testid={`reminder-after-${r.id}`}>{`${Math.abs(r.afterDays)} ${beforeExpiry ? "days before" : "days"}`}</span> },
        { label: "Escalate to", value: r.escalateTo },
        { label: "Escalate after", value: <span data-testid={`reminder-escalate-${r.id}`}>{`${r.escalateAfterDays} ${beforeExpiry ? "days after" : "days"}`}</span> },
      ]}
    />
  );
}

/** The demo action of spec §1.13 plus the reminder and escalation mails sent so far. The live app of this version runs
 *  no reminders (its store refuses with "not available in this version yet"): no demo badge there, and no "Nothing
 *  due" after the refused run, which would claim a check that never ran (FE-CLEANUP A6). */
function RunReminders({ canEdit }: { canEdit: boolean }) {
  const { state, runReminders } = useStore();
  const { reminders: works } = useLiveFeatures();
  const { phone } = useAdminAccess();
  const [days, setDays] = useState(0);
  const [last, setLast] = useState<{ sent: number; asOf: string } | null>(null);
  const sent = useMemo(() => state.mails.filter((m) => m.event === "reminder" || m.event === "escalation").sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)), [state.mails]);
  const shown = sent.slice(0, 12);
  const openCases = state.cases.filter((c) => !isClosed(c)).length;

  const run = () => {
    const asOf = new Date(Date.parse(nowIso()) + days * DAY).toISOString();
    const sentNow = runReminders(days);
    if (works) setLast({ sent: sentNow, asOf });
  };

  return (
    <Card data-testid="run-reminders-card">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Send size={15} className="text-ink-3" />
            Run reminders now
            {works && <Badge tone="neutral">Demo action</Badge>}
          </span>
        }
        subtitle="Reminders run daily. Run them now to check every active rule against the open cases and send the reminder, overdue and escalation e-mails that are due. A mail already sent is never sent twice."
      />
      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
          <label className="block min-w-0 space-y-1">
            <span className="text-xs font-medium text-ink-3">Check as of</span>
            <Select data-testid="run-reminders-as-of" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-44" aria-label="Check the reminders as of">
              {AS_OF.map((o) => (
                <option key={o.days} value={String(o.days)}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="primary" data-testid="run-reminders" icon={<Play size={14} />} onClick={run}>
            Run reminders now
          </Button>
          <span className="min-w-0 flex-1 basis-60 text-[12.5px] text-ink-3" role="status" data-testid="run-reminders-result" data-count={last?.sent ?? ""}>
            {last
              ? last.sent
                ? `${last.sent} e-mail${last.sent > 1 ? "s" : ""} sent, checked as of ${fmtDate(last.asOf)}.`
                : `Nothing due as of ${fmtDate(last.asOf)}${openCases ? "" : ": there is no open case"}.`
              : openCases
                ? `${openCases} open case${openCases > 1 ? "s" : ""} to check.`
                : "No open case to check."}
          </span>
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState data-testid="empty-reminder-mails" icon={<BellRing size={20} />} title="No reminder sent yet">
          Reminder and escalation e-mails appear here, and in the recipient's inbox, once a task passes its reminder days.
        </EmptyState>
      ) : phone ? (
        <div className="p-3">
          <CardList label="Reminder and escalation e-mails sent">
            {shown.map((m) => (
              <CardListItem
                key={m.id}
                data-testid={`reminder-mail-${m.id}`}
                title={m.subject}
                badge={m.event === "escalation" ? <Badge tone="warn">Escalation</Badge> : <Badge tone="neutral">Reminder</Badge>}
                meta={fmtDateTime(m.at)}
                fields={[
                  { label: "To", value: m.to.map((id) => userName(state, id)).join(", ") },
                  {
                    label: "Case",
                    value: m.caseId ? (
                      <Link to={`/cases/${m.caseId}`} className="inline-flex min-h-11 items-center text-brand hover:underline">
                        <Mono>{m.caseId}</Mono>
                      </Link>
                    ) : (
                      <span className="text-ink-3">—</span>
                    ),
                  },
                ]}
              />
            ))}
          </CardList>
          {sent.length > shown.length && (
            <p className="px-1 pt-2.5 text-xs text-ink-3">
              The {shown.length} latest of {sent.length} reminder and escalation e-mails.
            </p>
          )}
        </div>
      ) : (
        <>
          <Table dense head={["Sent", "Type", "To", "Subject", "Case"]}>
            {shown.map((m) => (
              <Tr key={m.id} data-testid={`reminder-mail-${m.id}`}>
                <Td className="align-top whitespace-nowrap text-ink-2">{fmtDateTime(m.at)}</Td>
                <Td className="align-top">{m.event === "escalation" ? <Badge tone="warn">Escalation</Badge> : <Badge tone="neutral">Reminder</Badge>}</Td>
                <Td className="min-w-[140px] align-top text-[12.5px]">{m.to.map((id) => userName(state, id)).join(", ")}</Td>
                <Td className="min-w-[220px] align-top">{m.subject}</Td>
                <Td className="align-top whitespace-nowrap">
                  {m.caseId ? (
                    <Link to={`/cases/${m.caseId}`} className="text-brand hover:underline">
                      <Mono>{m.caseId}</Mono>
                    </Link>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
          {sent.length > shown.length && (
            <div className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
              The {shown.length} latest of {sent.length} reminder and escalation e-mails.
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function ReminderSettings() {
  return (
    <AdminOnly>
      <RemindersPage />
    </AdminOnly>
  );
}

function RemindersPage() {
  const { state } = useStore();
  const { canEdit, canChange, phone } = useAdminAccess();
  const active = state.reminders.filter((r) => r.enabled).length;

  return (
    <div>
      <PageHeader
        eyebrow="Business administration"
        title="Reminders"
        subtitle="Due-date reminders and escalation for suppliers and reviewers, and the e-mail CIQ sends for each event. Maintained by the business, without IT."
      />

      <ReadOnlyNote what="reminders and escalation" onPhone="On a phone you can look at the reminders and the e-mail templates, but not change them or run the reminders." />

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <BellRing size={15} className="text-ink-3" />
              Reminders and escalation
            </span>
          }
          subtitle={`${active} of ${state.reminders.length} rules active.`}
        />
        {phone ? (
          <div className="p-3">
            <CardList label="Reminders and escalation">
              {state.reminders.map((r) => (
                <PhoneReminder key={r.id} r={r} />
              ))}
            </CardList>
          </div>
        ) : (
          <Table head={["Event", "Reminder to", "Remind after", "Escalate to", "Escalate after", "Active"]}>
            {state.reminders.map((r) => (
              <ReminderRow key={r.id} r={r} canEdit={canChange} />
            ))}
          </Table>
        )}
        {/* where nobody changes them (live), neither line applies: the shell's read-only banner says it */}
        {(canChange || !canEdit) && (
          <div className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
            {canChange ? "A change saves when you leave the field or press Enter, and applies to the next run. Every change is logged." : "Only the business administrator changes these values."}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <RunReminders canEdit={canEdit && !phone} />
      </div>

      <div className="mt-8">
        <SectionTitle hint="One template per event and audience. Supplier e-mails link to the supplier portal, internal e-mails to the case or the review.">E-mail templates</SectionTitle>
        <MailTemplates />
      </div>
    </div>
  );
}
