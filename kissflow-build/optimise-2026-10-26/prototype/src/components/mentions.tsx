// @mentions in internal notes: the composer (a text area that suggests Beiersdorf colleagues after an "@") and the
// note text with its mentions as chips. The rules live in @/domain/mentions: only active internal users can be
// mentioned, the saved note keeps "@<name>" in its text and the user ids in InternalNote.mentions, and each person
// mentioned (not the writer) gets one e-mail with a link to the note.

import { Mail } from "lucide-react";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { Avatar, Badge, TextArea, cx } from "@/components/ui";
import { insertMention, joinPeople, mentionQuery, mentionRecipients, mentionRole, noteSegments, suggestMentions, type MentionQuery } from "@/domain/mentions";
import type { AppState, InternalNote, User } from "@/domain/types";

export interface MentionTextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  /** Who may be mentioned: mentionableUsers(state). The writer (`meId`) is left out of the list. */
  people: User[];
  meId?: string;
  invalid?: boolean;
  "data-testid"?: string;
}

const LIST_H = 264; // max-h-64 plus the border

/**
 * A text area for internal notes. Typing "@" opens a list of Beiersdorf colleagues (name and role) that filters as you
 * type; ↑/↓ move, Enter or Tab (or a click) inserts "@<name> ", Escape closes the list. Supplier contacts are never
 * listed. The list has data-testid "mention-list", each person "mention-option-<userId>".
 */
export function MentionTextArea({ value, onChange, people, meId, onKeyDown, onBlur, onSelect, ...rest }: MentionTextAreaProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const area = () => wrap.current?.querySelector("textarea") ?? null;
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  /** The "@" (its index) whose list was closed with Escape: it stays closed until another "@" is typed. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [up, setUp] = useState(false);
  const caretAfter = useRef<number | null>(null);
  const uid = useId();
  const listId = `${uid}-mentions`;
  const optId = (i: number) => `${uid}-mention-${i}`;

  const candidates = useMemo(() => people.filter((p) => p.id !== meId), [people, meId]);
  const results = useMemo(() => (query ? suggestMentions(candidates, query.text) : []), [candidates, query]);
  const open = !!query && query.start !== dismissed;
  const current = Math.min(active, Math.max(0, results.length - 1));

  /** Reads the @query at the caret (after typing, clicking or moving the caret). */
  const sync = (el: HTMLTextAreaElement) => {
    const q = el.selectionStart === el.selectionEnd ? mentionQuery(el.value, el.selectionStart, candidates) : null;
    if (q?.text !== query?.text || q?.start !== query?.start) setActive(0);
    if (dismissed !== null && q?.start !== dismissed) setDismissed(null);
    setQuery((prev) => (prev && q && prev.start === q.start && prev.caret === q.caret && prev.text === q.text ? prev : q));
  };

  const choose = (p: User) => {
    if (!query) return;
    const r = insertMention(value, query, p.name);
    caretAfter.current = r.caret;
    setQuery(null);
    onChange(r.value);
  };

  // After an insertion: the caret goes right after "@<name> ", focus stays in the text area.
  useLayoutEffect(() => {
    const el = area();
    if (caretAfter.current === null || !el) return;
    el.focus();
    el.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  }, [value]);

  // Opens upwards when there is no room below the text area (e.g. near the bottom of a phone screen).
  useLayoutEffect(() => {
    const el = area();
    if (!open || !el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setUp(below < LIST_H + 12 && r.top > below);
  }, [open]);

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && !e.nativeEvent.isComposing) {
      const n = results.length;
      if (n && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        setActive((current + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      if (n && (e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        choose(results[current]);
        return;
      }
      if (e.key === "Escape") {
        // closes only the list, never a drawer or dialog around the text area
        e.preventDefault();
        e.stopPropagation();
        setDismissed(query!.start);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div ref={wrap} className="relative">
      <TextArea
        {...rest}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target);
        }}
        onSelect={(e) => {
          sync(e.currentTarget);
          onSelect?.(e);
        }}
        onKeyDown={keyDown}
        onBlur={(e) => {
          setQuery(null);
          onBlur?.(e);
        }}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && results.length ? optId(current) : undefined}
        data-mention-open={open ? "true" : "false"}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention a Beiersdorf colleague"
          data-testid="mention-list"
          data-count={results.length}
          onMouseDown={(e) => e.preventDefault() /* keep the focus (and the caret) in the text area */}
          className={cx("absolute inset-x-0 z-30 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 shadow-pop scrollbar-thin", up ? "bottom-full mb-1.5" : "top-full mt-1.5")}
        >
          <li role="presentation" className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Mention a colleague
          </li>
          {results.map((p, i) => (
            <li
              key={p.id}
              id={optId(i)}
              role="option"
              aria-selected={i === current}
              data-testid={`mention-option-${p.id}`}
              data-active={i === current ? "true" : "false"}
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => choose(p)}
              className={cx("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5", i === current && "bg-ink/8")}
            >
              <Avatar initials={p.initials} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                <span className="block truncate text-[12px] text-ink-3">{mentionRole(p)}</span>
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-2.5 py-2 text-[13px] text-ink-3" data-testid="mention-none">
              No Beiersdorf colleague matches “{query.text.trim()}”. Only Beiersdorf colleagues can be mentioned.
            </li>
          )}
        </ul>
      )}
      <span className="sr-only" aria-live="polite">
        {open ? (results.length ? `${results.length} ${results.length === 1 ? "colleague" : "colleagues"} to mention. Use the arrow keys, then Enter.` : "No colleague matches.") : ""}
      </span>
    </div>
  );
}

/** One line under a composer: how to mention. */
export const MENTION_HINT = "Type @ to mention a colleague. They get an e-mail with a link to the note.";

/** A note's text with its mentions as chips; a mention of the viewer stands out. */
export function NoteText({ note, users, meId, className }: { note: Pick<InternalNote, "text" | "mentions">; users: User[]; meId?: string; className?: string }) {
  const parts = noteSegments(note, users);
  return (
    <p className={className}>
      {parts.map((p, i) => {
        if (!p.userId) return <Fragment key={i}>{p.text}</Fragment>;
        const u = users.find((x) => x.id === p.userId);
        const me = p.userId === meId;
        return (
          <span
            key={i}
            data-testid="mention-chip"
            data-user={p.userId}
            data-me={me ? "true" : undefined}
            title={u ? `${u.name}${mentionRole(u) ? ` · ${mentionRole(u)}` : ""}` : undefined}
            className={cx("rounded-md px-1 py-px font-medium [box-decoration-break:clone]", me ? "bg-brand text-brand-ink" : "bg-brand-soft text-brand")}
          >
            {p.text}
          </span>
        );
      })}
    </p>
  );
}

/** "Mentions you" on a note that mentions the viewer (someone else wrote it). */
export function MentionsYou({ note, meId }: { note: Pick<InternalNote, "by" | "mentions">; meId: string }) {
  if (note.by === meId || !note.mentions?.includes(meId)) return null;
  return (
    <Badge tone="brand" data-testid="note-mentions-you">
      Mentions you
    </Badge>
  );
}

/** "E-mailed Dr. Mira Hansen and Lena Krause" under a note that mentions colleagues. */
export function NoteNotified({ state, note }: { state: AppState; note: InternalNote }) {
  const told = mentionRecipients(state, note);
  if (!told.length) return null;
  const names = told.map((id) => state.users.find((u) => u.id === id)?.name ?? id);
  return (
    <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-3" data-testid={`note-notified-${note.id}`}>
      <Mail size={12} aria-hidden className="shrink-0" />
      <span className="min-w-0">E-mailed {joinPeople(names)}</span>
    </p>
  );
}

/**
 * The note a mail links to (`?note=<id>`): scrolled into view and focused once. Returns the id to mark it. Each note's
 * element needs id `note-<noteId>` and tabIndex -1. Runs a frame after the commit, so the shell's scroll-to-top on a
 * new page does not undo it.
 */
export function useLinkedNote(noteId: string | null): string | null {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!noteId || done.current === noteId) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`note-${noteId}`);
      if (!el) return;
      done.current = noteId;
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  });
  return noteId;
}
