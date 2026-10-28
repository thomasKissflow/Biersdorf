// S-OP's comparisons and evidence. As map/roundtrip.test.ts: the open point the domain wrote vs the one the app's mapper
// reads back from Kissflow, on the fields the screens and the next write rely on (times as instants to the second:
// Kissflow drops the milliseconds; due dates as days). The raw fields a step records are picked by name, user fields
// as their ids; no e-mail address is recorded (an e-mail is checked, not kept).
import { isDeepStrictEqual } from "node:util";
import type { OpenPoint, OpenPointEdit } from "@/domain/types";
import { userIds, type RawItem } from "@/portal/data/raw";
import type { StepCtx } from "../lib/results";

/** An instant to the second (Kissflow keeps DateTimes without milliseconds). */
export const instant = (iso: string | undefined) => (iso ? new Date(Math.floor(Date.parse(iso) / 1000) * 1000).toISOString() : iso);
export const day = (iso: string | undefined) => iso?.slice(0, 10);
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A thread message as the screens show it. */
const msgKeys = (m: OpenPoint["thread"][number]) => clean({ id: m.id, at: instant(m.at), by: m.by, side: m.side, action: m.action, text: m.text, newRound: m.newRound || undefined });

/** One of the raiser's edits as the history shows it (a due date as its day). */
export const editKeys = (e: OpenPointEdit) => {
  const v = (x: string) => (e.field === "dueDate" ? day(x) : x);
  return { field: e.field, from: v(e.from), to: v(e.to), by: e.by, at: instant(e.at) };
};

/** User ids as a set (sorted, once each): an assignment compared regardless of order. */
export const idSet = (ids: readonly string[]) => [...new Set(ids)].sort();

/** The fields of an open point the screens and the next write rely on (roundtrip.test.ts opKeys, plus the raiser's
 *  edits: Thread_JSON carries them beside the thread). */
export const opKeys = (p: OpenPoint) => ({
  id: p.id,
  dept: p.dept,
  kind: p.kind,
  ref: clean(p.ref),
  question: p.question,
  justification: p.justification,
  responsibleId: p.responsibleId,
  due: day(p.dueDate),
  rounds: p.rounds,
  status: p.status,
  outcome: p.outcome,
  createdBy: p.createdBy,
  closedBy: p.closedBy,
  closedAt: instant(p.closedAt),
  thread: p.thread.map(msgKeys),
  edits: (p.edits ?? []).map(editKeys),
});

/** What the supplier's answer changes on the point (the app synthesizes the message from Response_*, so its id, time
 *  and author come from the read; the domain's own supplierRespond gives the rest). */
export const answerKeys = (p: OpenPoint) => ({ status: p.status, rounds: p.rounds, question: p.question, thread: p.thread.map((m) => ({ side: m.side, action: m.action, text: m.text })) });

/** Checks `written` = `back` key by key; the detail names only the keys that differ, with both sides. */
export function same(s: StepCtx, label: string, written: Record<string, unknown>, back: Record<string, unknown> | undefined): boolean {
  if (!back) return s.check(label, false, "nothing was read back");
  const keys = [...new Set([...Object.keys(written), ...Object.keys(back)])].filter((k) => !isDeepStrictEqual(written[k], back[k]));
  return s.check(label, !keys.length, keys.length ? Object.fromEntries(keys.map((k) => [k, { written: written[k], back: back[k] }])) : undefined);
}

/** Raw fields of an item by name: user fields as their ids, a JSON field as its parsed length, absent as null. */
export function pick(it: RawItem | undefined, keys: readonly string[], o: { users?: readonly string[]; json?: readonly string[] } = {}): Record<string, unknown> {
  return Object.fromEntries(
    keys.map((k) => {
      if (o.users?.includes(k)) return [k, userIds(it, k)];
      const v = it?.[k];
      if (o.json?.includes(k)) return [`${k} (entries)`, jsonLength(v)];
      return [k, v === undefined || v === "" ? null : v];
    }),
  );
}
const jsonLength = (v: unknown): number | string | null => {
  if (typeof v !== "string" || !v) return null;
  try {
    const x = JSON.parse(v) as unknown;
    return Array.isArray(x) ? x.length : x && typeof x === "object" && Array.isArray((x as { thread?: unknown }).thread) ? (x as { thread: unknown[] }).thread.length : "not a list";
  } catch {
    return "not JSON";
  }
};

/** The open point's raw fields a step records. */
export const OP_FIELDS = ["OP_Key", "OP_Dept", "OP_Kind", "Round_No", "Query_Key", "OP_Progress", "OP_Outcome", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Portal_Query_Item_Id", "Response_Kind", "Response_Text", "Return_Reason", "Outcome_Reason", "Closed_At", "Closed_By", "Raiser_Assignee", "Thread_JSON", "_status", "_current_step"] as const;
export const OP_PICK = { users: ["Closed_By", "Raiser_Assignee"], json: ["Thread_JSON"] } as const;
/** The supplier query's raw fields a step records. */
export const QUERY_FIELDS = ["Query_Key", "Round_No", "App_Open_Point_Id", "Case_Code", "Kind_Label", "Responsible_Department", "Ref_Section_Key", "Ref_Label", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Edited_At", "Response_Kind", "Response_Text", "Assigned_Contacts", "_status", "_current_step"] as const;
export const QUERY_PICK = { users: ["Assigned_Contacts"] } as const;

/** The step an item is at (its live name), "" once it has ended. */
export const stepName = (it: RawItem | undefined): string => {
  const ctx = Array.isArray(it?._current_context) ? (it!._current_context[0] as Record<string, unknown> | undefined) : undefined;
  return String(it?._current_step ?? ctx?._context_current_step ?? "");
};

/** The users a step is assigned to now (its _current_context). */
export const assignedTo = (it: RawItem | undefined): string[] =>
  (Array.isArray(it?._current_context) ? (it!._current_context as Record<string, unknown>[]) : []).flatMap((c) => (Array.isArray(c._context_assigned_to) ? (c._context_assigned_to as Record<string, unknown>[]) : []).map((u) => String(u._id ?? "")));

/** Ids the app must never write into a user field or a thread (SPEC §4 S-CASE 3, S-INTEGRITY): the mapper's stand-ins
 *  (map/people.ts) and the domain's own user ids (u-admin, u-<supplier>-<n>). */
export const PSEUDO_ID = /"(self|contact|role|mail|name):[^"]*"|"u-[^"]+"/;
