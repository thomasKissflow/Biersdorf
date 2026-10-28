// Internal notes (F7 CIQ Internal Note; §8.16, BR-064). Pure builders, unit-tested. Notes are Beiersdorf-only and
// never shared with the supplier. Only the author edits a note; there is no delete (ground rule 9).
import { noteKey } from "../../domain/keys";
import { kfDateTime } from "../../data/normalize";
import type { CaseVM, NoteVM, Patch } from "../../data/viewModels";

export const NOTE_FLOW = "CIQ_Internal_Note_A00" as const;
/** CIQ_Department values a note may carry (Note_Dept is a Select on that list). */
const NOTE_DEPTS = new Set(["RMM", "REG", "SAF", "QM", "MIC", "SUS", "CUS", "LEG"]);

export interface NoteInput {
  c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">;
  me: { _id: string };
  /** The author's department from the (lensed) roles; "" for roles without one (approver, admin, reader). */
  dept: string;
  text: string;
  linked?: { kind: string; key: string };
  now: Date;
  rnd?: () => number;
}

/** The F7 row for a new note: Note_Key, the case keys, Linked_*, Note_Text, Note_Author = me, Note_Dept, Note_At. */
export function buildNoteRow(i: NoteInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    Note_Key: noteKey(i.now, i.rnd),
    Case_Code: i.c.caseCode || undefined,
    Cycle_No: i.c.cycleNo ?? undefined,
    Case_Item_Id: i.c._id,
    Linked_Kind: i.linked?.kind || undefined,
    Linked_Key: i.linked?.key || undefined,
    Note_Text: i.text.trim(),
    Note_Author: { _id: i.me._id },
    Note_Dept: NOTE_DEPTS.has(i.dept) ? i.dept : undefined,
    Note_At: kfDateTime(i.now),
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

/** BR-064: only the author edits. An unreadable author means nobody edits. */
export function canEditNote(n: Pick<NoteVM, "author">, me: { _id: string }): boolean {
  return !!n.author?._id && n.author._id === me._id;
}

/** The edit patch: the text only (author, time and links never change). */
export function noteEditPatch(text: string): Patch {
  return { fields: { Note_Text: text.trim() } };
}

/** Notes of the case, newest first; with `linked`, only those linked to it. */
export function notesFor(notes: readonly NoteVM[], linked?: { kind: string; key: string }): NoteVM[] {
  return notes
    .filter((n) => !linked || (n.linkedKind === linked.kind && n.linkedKey === linked.key))
    .sort((a, b) => String(b.at || b.createdAt || "").localeCompare(String(a.at || a.createdAt || "")));
}
