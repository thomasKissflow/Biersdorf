import { Lock, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MENTION_HINT, MentionTextArea, MentionsYou, NoteNotified, NoteText, useLinkedNote } from "@/components/mentions";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Mono, Select, cx } from "@/components/ui";
import { DEPT_SHORT, sectionOf } from "@/domain/catalog";
import { mentionableUsers } from "@/domain/mentions";
import { check } from "@/domain/permissions";
import { activeSections, fmtDateTime, isClosed, userById } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { useStore } from "@/store/store";
import { ResponsiveCardHeader, sectionOptionGroups } from "../shared";

export function NotesTab({ c }: { c: CiqCase }) {
  const { state, me, addInternalNote } = useStore();
  const [text, setText] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [sending, setSending] = useState(false);
  // Everyone at Beiersdorf reads the notes; RMM, the departments, Customs and Legal write them while the case is open.
  const denied = check(state, me.id, "note.add", c);
  const canWrite = !denied;
  const notes = [...c.internalNotes].sort((a, b) => b.at.localeCompare(a.at));
  // A mention mail opens ?tab=notes&note=<id>: that note is scrolled to and marked.
  const [params] = useSearchParams();
  const linked = useLinkedNote(params.get("note"));

  const add = () => {
    const body = text.trim();
    if (!body || sending) return;
    const r = addInternalNote(c.id, body, sectionId || undefined);
    // The prototype saves at once; the live app resolves false when the note did not reach Kissflow, and the text stays
    // so it can be sent again (APP-SAVING-GAPS gap 6). Text typed meanwhile is never cleared.
    setSending(true);
    void Promise.resolve(r).then((ok) => {
      setSending(false);
      if (ok === false) return;
      setText((now) => (now.trim() === body ? "" : now));
      setSectionId("");
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="self-start xl:col-span-2" data-testid="case-notes" data-count={notes.length}>
        <ResponsiveCardHeader
          mobile="inline"
          title="Internal notes"
          subtitle="Discussion between RMM and the Beiersdorf departments about this case"
          action={
            <Badge tone="brand">
              <Lock size={11} aria-hidden /> Never visible to the supplier
            </Badge>
          }
        />
        {notes.length === 0 ? (
          <div data-testid="empty-notes">
            {isClosed(c) ? (
              <EmptyState icon={<MessageSquareText size={28} />} title="No internal notes were written">
                The case is closed. Supplier contacts never see internal notes.
              </EmptyState>
            ) : (
              <EmptyState icon={<MessageSquareText size={28} />} title="No internal notes yet">
                Use notes to align between RMM and the departments, for example before asking the supplier. Supplier contacts never see them.
              </EmptyState>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {notes.map((n) => {
              const u = userById(state, n.by);
              const isLinked = n.id === linked;
              return (
                <li
                  key={n.id}
                  id={`note-${n.id}`}
                  tabIndex={-1}
                  data-testid={`note-${n.id}`}
                  data-linked={isLinked ? "true" : undefined}
                  className={cx("flex scroll-mt-24 gap-3 px-4 py-3.5 focus:outline-none", isLinked && "bg-brand-soft/60 shadow-[inset_3px_0_0_var(--brand)]")}
                >
                  <Avatar initials={u?.initials ?? "?"} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                      <span className="font-medium text-ink">{u?.name ?? n.by}</span>
                      {n.dept && <span className="text-ink-3">{DEPT_SHORT[n.dept]}</span>}
                      {n.sectionId && (
                        <Badge tone="neutral">
                          <Mono>{sectionOf(n.sectionId, c.templateVersion)?.code ?? n.sectionId}</Mono>
                        </Badge>
                      )}
                      <MentionsYou note={n} meId={me.id} />
                      <span className="ml-auto text-ink-3">{fmtDateTime(n.at)}</span>
                    </div>
                    <NoteText note={n} users={state.users} meId={me.id} className="mt-1 text-[13.5px] whitespace-pre-line text-ink [overflow-wrap:anywhere]" />
                    <NoteNotified state={state} note={n} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="self-start">
        <CardHeader title="Add a note" subtitle={canWrite ? "Visible to all Beiersdorf roles on this case" : undefined} />
        {canWrite ? (
          <div className="space-y-3 p-4">
            <Field label="Note" hint={MENTION_HINT}>
              <MentionTextArea
                value={text}
                onChange={setText}
                people={mentionableUsers(state)}
                meId={me.id}
                placeholder="e.g. @Dr. Mira Hansen the MOAH value is borderline; let's wait for the second batch before asking again."
                rows={4}
                data-testid="note-text"
              />
            </Field>
            <Field label="Section (optional)">
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Whole case</option>
                {sectionOptionGroups(activeSections(c).map((s) => s.sectionId), c.templateVersion)}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" onClick={add} disabled={!text.trim() || sending} data-testid="note-add">
                {sending ? "Sending…" : "Add note"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="px-4 py-4 text-[13px] text-ink-3" data-testid="notes-read-only">
            {denied}
          </p>
        )}
      </Card>
    </div>
  );
}
