// Every write is read back (DESIGN §6). Owner C.
// - writeVerified: read → write until the read-back holds what was written (≤3 tries), the portal's pattern
//   (portal/data/liveActions.ts:122-130): Kissflow has no locking, and of two writes within ~0.1 s one is lost (plan v5
//   P3). A read that already holds the values is not written again, so a repeat is harmless.
// - assertMandatory: the UI's own Mandatory gate, because the SDK submit does not enforce Mandatory (G-7); Review_Gate
//   (a server formula) must read "OK".
// - staleCheck: before a held process item is updated, its `_modified_at` must still be the one the screen loaded
//   (an integration such as I-4 may have written it since). A task that moved out of the user's queue (050201) is stale
//   too.
// - New child rows: Kissflow may show them late (20 Oct), so a row is sent again only when, after ROW_SETTLE_MS, a
//   fresh read still misses it (lostRows), as a NEW row; a row the read shows is never re-sent (APP-SAVING-GAPS gap 7).
import { errorText, type KfData } from "@/portal/kf/sdk";
import { childRows, str, userIds, type RawItem } from "@/portal/data/raw";
import { MANDATORY } from "../ids";
import type { ProcessKey, WriteCtx } from "../types";
import { childRowId } from "./encode";

/** The read-back still misses values after every try. */
export class VerifyError extends Error {
  constructor(readonly missing: string[], tries: number) {
    super(`Kissflow did not keep ${missing.join(", ")} after ${tries} attempt${tries === 1 ? "" : "s"}.`);
  }
}

/** The item changed (or left the user's queue) since the screen loaded it: refuse, reload, let the user retry. */
export class StaleError extends Error {}

export const STALE_TEXT: Record<ProcessKey, string> = {
  op: "This open point changed in the meantime. It has been reloaded; check it and try again.",
  review: "This review changed in the meantime. It has been reloaded; check it and try again.",
  case: "This case changed in the meantime. It has been reloaded; check it and try again.",
};

/** A new contact's key is held by a row Kissflow has now (added since the load, or one this load could not read). */
export const CONTACT_KEY_HELD = "This supplier's contacts changed in the meantime. They have been reloaded; check them and add the contact again.";

/** The task left the user's queue (050201): it moved on, or this role never held it. */
export const QUEUE_TEXT: Record<ProcessKey, string> = {
  op: "This open point is not one of your open tasks in Kissflow any more (it moved on, or your role does not hold it). It has been reloaded; check it and try again.",
  review: "This review is not one of your open tasks in Kissflow any more (it moved on, or your role does not hold it). It has been reloaded; check it and try again.",
  case: "This case is not one of your open tasks in Kissflow any more. It has been reloaded; check it and try again.",
};

/** Blank as Kissflow's ISBLANK / Mandatory see it: missing, empty text, empty list, or a user without an id. */
export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "_id" in o ? !o._id : Object.keys(o).length === 0;
  }
  return false;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const isUserRef = (v: unknown): v is { _id: string } => !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as { _id?: unknown })._id === "string";

/** Whether Kissflow's read-back `back` holds the value `sent` (users by id, Dates by day, DateTimes by instant,
 *  numbers by value: Kissflow may return 3 as "3", a User with its Name, a Date with a time). */
export function sameValue(sent: unknown, back: unknown): boolean {
  if (sent === undefined) return true;
  if (Array.isArray(sent)) {
    if (sent.every(isUserRef)) {
      const want = sent.map((u) => u._id).sort();
      const got = userIds({ v: back }, "v").sort();
      return want.length === got.length && want.every((id, i) => id === got[i]);
    }
    return JSON.stringify(sent) === JSON.stringify(back);
  }
  if (isUserRef(sent)) return userIds({ v: back }, "v")[0] === sent._id;
  if (sent && typeof sent === "object") return back !== undefined && back !== null; // a reference: present
  if (typeof sent === "number") {
    const n = typeof back === "number" ? back : typeof back === "string" && back.trim() ? Number(back) : NaN;
    return n === sent;
  }
  if (typeof sent === "boolean") return back === sent || String(back) === String(sent);
  const b = typeof back === "string" ? back : typeof back === "number" ? String(back) : "";
  if (b === sent) return true;
  const s = String(sent);
  if (DATE.test(s)) return b.slice(0, 10) === s;
  if (DATETIME.test(s) && DATETIME.test(b)) return Date.parse(b) === Date.parse(s);
  return b.trim() === s.trim();
}

/** The fields of `data` the read-back does not hold (child-table deltas and system fields are checked elsewhere). */
export function missingOf(data: KfData, back: RawItem | Record<string, unknown>): string[] {
  return Object.entries(data)
    .filter(([k]) => !k.startsWith("_") && !k.startsWith("Table::"))
    .filter(([k, v]) => !sameValue(v, back[k]))
    .map(([k]) => k);
}

/** The child rows of `want` (a "Table::<model>" delta) the read-back does not hold: a row is found by its `_id`
 *  (an update) or by `keyField` (a new row), then compared field by field. Returns "<model>.<key>" per missing row. */
export function rowsMissing(back: RawItem, model: string, keyField: string, want: KfData[]): string[] {
  const rows = childRows(back, model, keyField);
  const out: string[] = [];
  for (const w of want) {
    const { _id, _is_created, _is_deleted, ...fields } = w as Record<string, unknown>;
    void _is_deleted;
    const key = String(fields[keyField] ?? _id ?? "");
    const row = (!_is_created && typeof _id === "string" ? rows.find((r) => r._id === _id) : undefined) ?? (fields[keyField] !== undefined ? rows.find((r) => str(r, keyField) === String(fields[keyField])) : undefined);
    if (!row || missingOf(fields, row).length) out.push(`${model}.${key}`);
  }
  return out;
}

/** A short pause before reading an item again whose new child rows may lag behind the item itself; resolves to `id`. */
export const ROW_SETTLE_MS = 1500;
export const settle = (id: string): Promise<string> => new Promise((r) => setTimeout(() => r(id), ROW_SETTLE_MS));

/** The new rows of `sent` (child rows of `model`) that `cur` does not show by `keyField`, each again as a NEW row with a
 *  fresh `_id`; a row `cur` shows is never sent again (a second copy would be a duplicate). */
export function lostRows(cur: RawItem, model: string, keyField: string, sent: readonly KfData[]): KfData[] {
  const have = new Set(childRows(cur, model, keyField).map((r) => str(r, keyField)));
  return sent.filter((r) => !have.has(String(r[keyField]))).map((r) => ({ ...r, _is_created: true, _id: childRowId(model) }));
}

/** A read that answers `first` once (an item already read, e.g. by staleCheck), then reads again. */
export function firstThen(first: RawItem, read: () => Promise<RawItem>): () => Promise<RawItem> {
  let used = false;
  return () => {
    if (used) return read();
    used = true;
    return Promise.resolve(first);
  };
}

/**
 * Reads, and writes until the read-back holds (≤ `tries` writes): `holds` returns the keys still missing. The first
 * read decides whether a write is needed at all (after a create it usually is not). Resolves with the item as read
 * back; throws VerifyError when Kissflow never kept the values.
 */
export async function writeVerified(read: () => Promise<RawItem>, write: (cur: RawItem) => Promise<void>, holds: (back: RawItem) => string[], tries = 3): Promise<RawItem> {
  let back = await read();
  let missing = holds(back);
  for (let i = 0; i < tries && missing.length; i++) {
    await write(back);
    back = await read();
    missing = holds(back);
  }
  if (missing.length) throw new VerifyError(missing, tries);
  return back;
}

/** The Mandatory fields of the step that are blank on `item` (ids.ts MANDATORY); Review_Gate must read "OK". */
export function assertMandatory(item: RawItem, activityId: string): string[] {
  return (MANDATORY[activityId] ?? []).filter((k) => (k === "Review_Gate" ? str(item, k).trim() !== "OK" : isBlank(item[k])));
}

const QUEUE = /050201|moved out of your queue/i;
/** Kissflow's refusal of a task that is not in the user's queue (any more): 050201. */
export const leftQueue = (e: unknown): boolean => QUEUE.test(errorText(e));

/** The held item as Kissflow has it now; StaleError when it changed since `ref.modifiedAt` or left the user's queue. */
export async function staleCheck(ctx: Pick<WriteCtx, "client">, flow: ProcessKey, ref: { itemId: string; act: string; modifiedAt?: string }): Promise<RawItem> {
  let cur: RawItem;
  try {
    cur = await ctx.client.getTask(flow, ref.itemId, ref.act);
  } catch (e) {
    if (leftQueue(e)) throw new StaleError(QUEUE_TEXT[flow]);
    throw e;
  }
  const now = str(cur, "_modified_at");
  if (ref.modifiedAt && now && now !== ref.modifiedAt) {
    const a = Date.parse(now);
    const b = Date.parse(ref.modifiedAt);
    if (!(Number.isFinite(a) && Number.isFinite(b) && a === b)) throw new StaleError(STALE_TEXT[flow]);
  }
  return cur;
}
