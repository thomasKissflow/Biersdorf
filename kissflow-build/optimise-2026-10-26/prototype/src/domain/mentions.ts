// @mentions in internal notes. A note keeps its text readable ("Please check this, @Dr. Mira Hansen") and the people
// it mentions as user ids (InternalNote.mentions). Only ACTIVE INTERNAL users can be mentioned: a supplier contact's
// name after an @ stays plain text, so a supplier is never mentioned and never mailed. The composer
// (components/mentions.tsx) inserts "@<full name>"; the domain finds the mentions in the saved text, so a name typed
// out in full counts too.

import { DEPT_LABEL, DEPT_SHORT } from "./catalog";
import { isActiveUser } from "./permissions";
import type { AppState, CiqCase, InternalNote, User } from "./types";

/** The people a note may mention: every active Beiersdorf user. Never a supplier contact. */
export const mentionableUsers = (s: AppState): User[] => s.users.filter((u) => u.side === "internal" && isActiveUser(u));

const WORD = /[\p{L}\p{N}_]/u;
const fold = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * The person's role in a few words, for the suggestion list: the title, and the short department when the title does
 * not already name it ("Product Safety Assessor", "Trade Compliance Officer · Customs", "IP Counsel · Legal").
 */
export const mentionRole = (u: User): string => {
  const dept = u.dept ? DEPT_SHORT[u.dept] : "";
  const named = !!dept && fold(u.title ?? "").includes(fold(dept).slice(0, 6));
  return [u.title, named ? "" : dept].filter(Boolean).join(" · ");
};

/** The ways a name may follow the @: the full name, and without a leading "Dr.". */
function aliases(name: string): string[] {
  const short = name.replace(/^Dr\.\s+/, "");
  return short === name ? [name] : [name, short];
}

export interface MentionHit {
  /** Index of the "@". */
  start: number;
  /** Index after the name. */
  end: number;
  userId: string;
}

/**
 * Every "@<name>" of one of `people` in the text, left to right. The @ must start a word (an e-mail address is no
 * mention) and the name must end one ("@Lena Krausen" is no mention of Lena Krause). Case and accents are ignored;
 * the longest name wins.
 */
export function findMentions(text: string, people: Pick<User, "id" | "name">[]): MentionHit[] {
  const names = people.flatMap((p) => aliases(p.name).map((a) => ({ id: p.id, key: fold(a), len: a.length }))).sort((a, b) => b.len - a.len);
  const hits: MentionHit[] = [];
  for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
    if (i > 0 && WORD.test(text[i - 1])) continue;
    const hit = names.find((n) => {
      if (fold(text.slice(i + 1, i + 1 + n.len)) !== n.key) return false;
      const next = text[i + 1 + n.len];
      return next === undefined || !WORD.test(next);
    });
    if (!hit) continue;
    hits.push({ start: i, end: i + 1 + hit.len, userId: hit.id });
    i += hit.len;
  }
  return hits;
}

/** The users a text mentions (ids, first mention first, each once). Only active internal users count. */
export function parseMentions(s: AppState, text: string): string[] {
  return [...new Set(findMentions(text, mentionableUsers(s)).map((h) => h.userId))];
}

/** Who gets the note-mention mail: the mentioned active internal users, each once, never the writer. */
export function mentionRecipients(s: AppState, note: Pick<InternalNote, "by" | "mentions">): string[] {
  const ok = new Set(mentionableUsers(s).map((u) => u.id));
  return [...new Set(note.mentions ?? [])].filter((id) => id !== note.by && ok.has(id));
}

export interface NoteSegment {
  text: string;
  /** Set on a mention: the user it names. */
  userId?: string;
}

/** The note's text split into plain parts and its mentions (only the users the note records as mentioned). */
export function noteSegments(note: Pick<InternalNote, "text" | "mentions">, users: Pick<User, "id" | "name">[]): NoteSegment[] {
  const ids = new Set(note.mentions ?? []);
  if (!ids.size) return [{ text: note.text }];
  const out: NoteSegment[] = [];
  let at = 0;
  for (const h of findMentions(note.text, users.filter((u) => ids.has(u.id)))) {
    if (h.start > at) out.push({ text: note.text.slice(at, h.start) });
    out.push({ text: note.text.slice(h.start, h.end), userId: h.userId });
    at = h.end;
  }
  if (at < note.text.length) out.push({ text: note.text.slice(at) });
  return out;
}

/**
 * Where a mention mail opens the note: the review workspace for someone whose department reviews the case (the note
 * panel is there, on the note's section), otherwise the case page's Internal notes tab. Both scroll to the note and
 * mark it.
 */
export function noteLink(c: CiqCase, note: Pick<InternalNote, "id" | "sectionId">, recipient?: Pick<User, "dept">): string {
  const reviews = !!recipient?.dept && c.reviews.some((r) => r.dept === recipient.dept);
  return reviews ? `/review/${c.id}?${note.sectionId ? `s=${note.sectionId}&` : ""}note=${note.id}` : `/cases/${c.id}?tab=notes&note=${note.id}`;
}

// ---------------------------------------------------------------------------------- the composer's suggestion list

/** The "@query" being typed at the caret. */
export interface MentionQuery {
  /** Index of the "@". */
  start: number;
  /** The caret (the query ends here). */
  caret: number;
  /** What follows the @ up to the caret. */
  text: string;
}

const words = (t: string) => fold(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * How well a person matches what follows the @: 0 the name starts with it, 1 every word starts a word of the name,
 * 2 every word starts a word of the name, title or department ("@safety", "@qm"), -1 no match.
 */
export function mentionRank(p: Pick<User, "name" | "title" | "dept">, query: string): number {
  const q = fold(query).trim();
  if (!q || aliases(p.name).some((a) => fold(a).startsWith(q))) return 0;
  const tokens = words(q);
  if (!tokens.length) return 0;
  const name = words(p.name);
  if (tokens.every((t) => name.some((w) => w.startsWith(t)))) return 1;
  const all = words(`${p.name} ${p.title} ${p.dept ? `${DEPT_LABEL[p.dept]} ${DEPT_SHORT[p.dept]} ${p.dept}` : ""}`);
  return tokens.every((t) => all.some((w) => w.startsWith(t))) ? 2 : -1;
}

/** The people to suggest for a query, best match first, then by name. */
export function suggestMentions<T extends Pick<User, "name" | "title" | "dept">>(people: T[], query: string): T[] {
  return people
    .map((p) => ({ p, r: mentionRank(p, query) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.p.name.replace(/^Dr\.\s+/, "").localeCompare(b.p.name.replace(/^Dr\.\s+/, "")))
    .map((x) => x.p);
}

/**
 * The @query the caret is in, or null. The @ must start a word (not an e-mail address); the query is one line of up
 * to 40 characters. A space may be part of it while it still leads to a name ("@Dr. Mira H"), so a mention just
 * picked ("@Dr. Mira Hansen ") or an "@" in a sentence ("at @ 5 pm") opens nothing.
 */
export function mentionQuery(value: string, caret: number, people: Pick<User, "name" | "title" | "dept">[]): MentionQuery | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && WORD.test(before[at - 1]))) return null;
  const text = before.slice(at + 1);
  if (text.length > 40 || text.includes("\n") || /^\s/.test(text)) return null;
  if (/\s$/.test(text)) {
    const q = fold(text);
    if (!people.some((p) => aliases(p.name).some((a) => fold(a).startsWith(q)))) return null;
  } else if (/\s/.test(text) && !people.some((p) => mentionRank(p, text) >= 0)) return null;
  return { start: at, caret, text };
}

/** Puts "@<name> " in place of the query; returns the new text and where the caret goes (after the space). */
export function insertMention(value: string, q: Pick<MentionQuery, "start" | "caret">, name: string): { value: string; caret: number } {
  const after = value.slice(q.caret);
  const token = `@${name}${after.startsWith(" ") ? "" : " "}`;
  return { value: value.slice(0, q.start) + token + after, caret: q.start + `@${name} `.length };
}

/** "Dr. Mira Hansen", "Dr. Mira Hansen and Lena Krause", "A, B and C". */
export function joinPeople(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
