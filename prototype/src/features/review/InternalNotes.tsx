// Beiersdorf-only discussion on the case, optionally linked to a section (REQ-PROC-020). The same notes as the case
// page's Internal notes tab. Reviewers, RMM, Customs and Legal post; Admin, Business owner and Auditor read only.
// "@" mentions a colleague, who gets an e-mail linking here (?note=<id> scrolls to the note and marks it).
import { Lock } from "lucide-react";
import { useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MENTION_HINT, MentionTextArea, MentionsYou, NoteNotified, NoteText, useLinkedNote } from "@/components/mentions";
import { Avatar, Button, Card, CardHeader, Checkbox, cx } from "@/components/ui";
import { DEPT_SHORT } from "@/domain/catalog";
import { mentionableUsers } from "@/domain/mentions";
import { check } from "@/domain/permissions";
import { fmtDateTime, isClosed, userById } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { useStore } from "@/store/store";
import { secCode } from "./shared";

export function InternalNotes({ c, sectionId, onJump }: { c: CiqCase; sectionId?: string; onJump: (sectionId: string) => void }) {
  const { state, me, addInternalNote } = useStore();
  const [text, setText] = useState("");
  const [link, setLink] = useState(true);
  const [sending, setSending] = useState(false);
  const notes = [...c.internalNotes].sort((a, b) => b.at.localeCompare(a.at));
  const denied = check(state, me.id, "note.add", c);
  const [params] = useSearchParams();
  const linked = useLinkedNote(params.get("note"));
  const hintId = useId();
  const add = () => {
    const body = text.trim();
    if (!body || denied || sending) return;
    const r = addInternalNote(c.id, body, link && sectionId ? sectionId : undefined);
    // The prototype saves at once; the live app resolves false when the note did not reach Kissflow, and the text stays
    // so it can be sent again (APP-SAVING-GAPS gap 6). Text typed meanwhile is never cleared.
    setSending(true);
    void Promise.resolve(r).then((ok) => {
      setSending(false);
      if (ok !== false) setText((now) => (now.trim() === body ? "" : now));
    });
  };
  return (
    <Card data-testid="internal-notes">
      <CardHeader
        title="Internal notes"
        subtitle={
          <span className="inline-flex items-center gap-1">
            <Lock size={12} /> Beiersdorf only, never visible to the supplier
          </span>
        }
      />
      {denied ? (
        <p className="px-4 py-3 text-[12.5px] text-ink-3">{denied}</p>
      ) : (
        <div className="space-y-2 px-4 py-3">
          <MentionTextArea
            value={text}
            onChange={setText}
            people={mentionableUsers(state)}
            meId={me.id}
            placeholder="Align with colleagues, e.g. on a shared section or a finding. Type @ to mention someone."
            className="min-h-[64px]"
            aria-label="New internal note"
            aria-describedby={hintId}
            data-testid="note-input"
          />
          <p id={hintId} className="text-[12px] text-ink-3">
            {MENTION_HINT}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {sectionId ? <Checkbox checked={link} onChange={setLink} label={<span className="text-[12.5px]">Link to {secCode(sectionId, c.templateVersion)}</span>} /> : <span />}
            <Button size="sm" variant="secondary" onClick={add} disabled={!text.trim() || sending} data-testid="note-add">
              {sending ? "Sending…" : "Add note"}
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <p className="border-t border-line px-4 py-4 text-[13px] text-ink-3">{isClosed(c) ? "No internal notes were written." : "No internal notes on this case yet."}</p>
      ) : (
        <ol className="divide-y divide-line border-t border-line">
          {notes.map((n) => {
            const u = userById(state, n.by);
            return (
              <li
                key={n.id}
                id={`note-${n.id}`}
                tabIndex={-1}
                className={cx("flex scroll-mt-24 gap-2.5 px-4 py-3 focus:outline-none", n.id === linked && "bg-brand-soft/60 shadow-[inset_3px_0_0_var(--brand)]")}
                data-testid={`note-${n.id}`}
                data-linked={n.id === linked ? "true" : undefined}
              >
                <Avatar initials={u?.initials ?? "?"} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3">
                    <span className="font-medium text-ink-2">{u?.name ?? n.by}</span>
                    {n.dept && <span>· {DEPT_SHORT[n.dept]}</span>}
                    <span className="whitespace-nowrap">· {fmtDateTime(n.at)}</span>
                    <MentionsYou note={n} meId={me.id} />
                  </div>
                  <NoteText note={n} users={state.users} meId={me.id} className="mt-0.5 text-[13px] whitespace-pre-line text-ink [overflow-wrap:anywhere]" />
                  <NoteNotified state={state} note={n} />
                  {n.sectionId && (
                    <button onClick={() => onJump(n.sectionId!)} className="mt-1 text-xs font-medium text-brand hover:underline">
                      {secCode(n.sectionId, c.templateVersion)}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
