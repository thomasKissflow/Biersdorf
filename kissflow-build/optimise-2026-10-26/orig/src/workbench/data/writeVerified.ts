// Write-then-verify (WORKBENCH-DESIGN.md §7.2; D32 dec L455-L462). Every field write of the Workbench runs here:
//   queue (container check, uncertain items) → local guards → normalise → write → read back through the same route →
//   re-apply what is missing, up to 3 times → ok | not-kept | kwb-refused | refused | timeout.
// There is no "admin" target: the only admin-route write is data/adminRepair.ts (§7.10).
// F8 (CIQ_Audit_Event_A00) is create-only: any target on it throws (WB-15).
import { assertWritable, childTableDef, childTableOf, fieldType, isComputed, stepDef, type ChildTableId, type FlowId, type StepIr, LocalGuardError } from "../schema";
import { errorText, type KfData } from "../kf/sdk";
import { childRowId, naturalKeyOf } from "../domain/keys";
import { isFieldRefusal, isTimeout, refusedFieldsOf, type RawItem, type WbClient } from "./client";
import { childRows } from "./map";
import { compact, sameValue, writeValue, type CompareOptions } from "./normalize";
import { isKwbRefused, markKwbOk, markKwbRefused, type SessionState } from "./session";
import type { Evidence, Patch, RowOp, SaveResult } from "./viewModels";
import { itemKey, type WriteQueue } from "./writeQueue";

export const AUDIT_FLOW: FlowId = "CIQ_Audit_Event_A00";
export const MAX_REAPPLY = 3;

export type Target =
  | { kind: "task"; flow: FlowId; instanceId: string; activityInstanceId: string; step: StepIr; evidence: Evidence }
  | { kind: "form"; flow: FlowId; itemId: string };

export interface WriteDeps {
  client: WbClient;
  queue: WriteQueue;
  session: SessionState;
  rnd?: () => number;
}

export const targetId = (t: Target): string => (t.kind === "task" ? t.instanceId : t.itemId);
export const targetKey = (t: Target): string => itemKey(t.flow, targetId(t));

export type NormOp =
  | { kind: "add"; row: Record<string, unknown> }
  | { kind: "modify"; _id: string; row: Record<string, unknown>; key?: Record<string, unknown> }
  | { kind: "delete"; _id: string; key?: Record<string, unknown> };
export interface NormPatch {
  fields: Record<string, unknown>;
  tables: Partial<Record<ChildTableId, NormOp[]>>;
}

/** Every key a patch touches: header fields, table ids, and child-table columns (for the computed guard). */
export function keysOf(p: Patch | NormPatch): { fields: string[]; tables: string[]; columns: string[] } {
  const tables = Object.keys(p.tables ?? {}).filter((t) => (p.tables as Record<string, unknown[] | undefined>)[t]?.length);
  const columns = new Set<string>();
  for (const t of tables)
    for (const op of ((p.tables as Record<string, (RowOp | NormOp)[]>)[t] ?? []) as (RowOp | NormOp)[])
      if (op.kind !== "delete") for (const c of Object.keys(op.row)) if (!c.startsWith("_")) columns.add(c);
  return { fields: Object.keys(p.fields), tables, columns: [...columns] };
}
const isEmpty = (p: NormPatch) => Object.keys(p.fields).length === 0 && Object.values(p.tables).every((ops) => !ops?.length);

/** Local guards (§7.2 step 1). Each throws LocalGuardError: a code bug, loud. */
export function guardTarget(t: Target, p: Patch | NormPatch): void {
  if (t.flow === AUDIT_FLOW) throw new LocalGuardError("F8 (CIQ Audit Event) is create-only: no update target");
  const k = keysOf(p);
  const computed = [...k.fields, ...k.columns].filter((x) => isComputed(t.flow, x));
  if (computed.length) throw new LocalGuardError(`computed field(s) ${computed.join(", ")} are never written`);
  if (t.kind === "task") assertWritable(t.step, [...k.fields, ...k.tables]);
}

function normRow(table: ChildTableId, row: Record<string, unknown>): Record<string, unknown> {
  const def = childTableDef(table);
  const out: Record<string, unknown> = {};
  for (const [c, v] of Object.entries(row)) {
    if (c.startsWith("_")) {
      out[c] = v;
      continue;
    }
    const col = def.fields[c];
    if (!col) throw new LocalGuardError(`${c} is not a column of ${table}`);
    const w = writeValue(col.type, v);
    if (w !== undefined) out[c] = w;
  }
  return out;
}

/**
 * Normalises values per field type (§6.6); child adds get a client _id `<ChildModelId>_<10 random>` and `_is_created`
 * (the verified add shape, SPIKES L89). With `base` (rows already in each table: {} for a new item) every add also
 * gets `_index` = base + its position among the adds of that table (WL-15); without it `_index` is not sent.
 */
export function normalisePatch(flow: FlowId, p: Patch, rnd: () => number = Math.random, base?: Partial<Record<string, number>>): NormPatch {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p.fields)) {
    const w = writeValue(fieldType(flow, k), v);
    if (w !== undefined) fields[k] = w;
  }
  const tables: NormPatch["tables"] = {};
  for (const [t, ops] of Object.entries(p.tables ?? {})) {
    if (!ops?.length) continue;
    const table = t as ChildTableId;
    const { modelId } = childTableOf(flow, table);
    let pos = 0;
    tables[table] = ops.map((op): NormOp => {
      if (op.kind === "add") {
        const row = normRow(table, op.row);
        const index = base && typeof row._index !== "number" ? { _index: (base[table] ?? 0) + pos } : {};
        pos++;
        return { kind: "add", row: { ...row, _id: typeof row._id === "string" && row._id ? row._id : childRowId(modelId, rnd), ...index, _is_created: true } };
      }
      if (op.kind === "modify") return { kind: "modify", _id: op._id, row: normRow(table, op.row), key: op.key };
      return { kind: "delete", _id: op._id, key: op.key };
    });
  }
  return { fields, tables };
}

/** The SDK write body: header fields plus `Table::<model id>` arrays (shape from SPIKES "Child tables over REST"). */
export function toBody(flow: FlowId, p: NormPatch): KfData {
  const body: KfData = { ...compact(p.fields) };
  for (const [t, ops] of Object.entries(p.tables)) {
    if (!ops?.length) continue;
    const { key } = childTableOf(flow, t as ChildTableId);
    body[key] = ops.map((op) => (op.kind === "add" ? { ...op.row } : op.kind === "modify" ? { _id: op._id, ...op.row } : { _id: op._id, _is_deleted: true }));
  }
  return body;
}

const dataCols = (row: Record<string, unknown>) => Object.keys(row).filter((c) => !c.startsWith("_"));

/** What of `pending` the read-back does not show yet. Child adds count as present by client _id OR natural key. */
export function missingFrom(flow: FlowId, back: Record<string, unknown>, pending: NormPatch, o: CompareOptions = {}): NormPatch {
  const fields: Record<string, unknown> = {};
  for (const [k, w] of Object.entries(pending.fields)) if (!sameValue(fieldType(flow, k), w, back[k], o)) fields[k] = w;
  const tables: NormPatch["tables"] = {};
  for (const [t, ops] of Object.entries(pending.tables)) {
    if (!ops?.length) continue;
    const table = t as ChildTableId;
    const def = childTableDef(table);
    const rows = childRows(flow, table, back);
    const byId = (id: string) => rows.find((r) => r._id === id);
    const byKey = (src: Record<string, unknown> | undefined) => {
      if (!src) return undefined;
      const nk = naturalKeyOf(table, src);
      return nk ? rows.find((r) => naturalKeyOf(table, r) === nk) : undefined;
    };
    const differing = (want: Record<string, unknown>, got: Record<string, unknown>) =>
      Object.fromEntries(dataCols(want).filter((c) => !sameValue(def.fields[c]?.type, want[c], got[c], o)).map((c) => [c, want[c]]));
    const left: NormOp[] = [];
    for (const op of ops) {
      if (op.kind === "add") {
        const hit = byId(String(op.row._id)) ?? byKey(op.row);
        if (!hit) left.push(op);
        else {
          const diff = differing(op.row, hit);
          if (Object.keys(diff).length) left.push({ kind: "modify", _id: String(hit._id), row: diff });
        }
      } else if (op.kind === "modify") {
        const hit = byId(op._id) ?? byKey(op.key ?? op.row);
        if (!hit) left.push(op);
        else {
          const diff = differing(op.row, hit);
          if (Object.keys(diff).length) left.push({ kind: "modify", _id: String(hit._id), row: diff, key: op.key });
        }
      } else {
        const hit = byId(op._id) ?? byKey(op.key);
        if (hit) left.push({ kind: "delete", _id: String(hit._id), key: op.key });
      }
    }
    if (left.length) tables[table] = left;
  }
  return { fields, tables };
}

export const missingKeys = (p: NormPatch): string[] => [...Object.keys(p.fields), ...Object.entries(p.tables).filter(([, o]) => o?.length).map(([t]) => t)];

/** Back from a NormPatch to a Patch (the K-WB sheet shows the values as they would be typed). */
export function toPatch(p: NormPatch): Patch {
  const tables: Patch["tables"] = {};
  for (const [t, ops] of Object.entries(p.tables))
    if (ops?.length)
      tables[t] = ops.map((op): RowOp => (op.kind === "add" ? { kind: "add", row: op.row } : op.kind === "modify" ? { kind: "modify", _id: op._id, row: op.row } : { kind: "delete", _id: op._id }));
  return { fields: { ...p.fields }, tables };
}

/** Child adds that carry no `_index` yet. */
const addsWithoutIndex = (p: NormPatch): boolean => Object.values(p.tables).some((ops) => ops?.some((op) => op.kind === "add" && typeof op.row._index !== "number"));

/** Rows per child table of an item as read (for `_index`). */
export function rowCounts(flow: FlowId, item: Record<string, unknown>, tables: string[]): Record<string, number> {
  return Object.fromEntries(tables.map((t) => [t, childRows(flow, t as ChildTableId, item).length]));
}

export async function readBack(client: WbClient, t: Target): Promise<RawItem> {
  return t.kind === "task" ? client.getItem(t.flow, t.instanceId, t.activityInstanceId) : client.formGet(t.flow, t.itemId);
}

async function update(client: WbClient, t: Target, body: KfData): Promise<void> {
  if (t.kind === "task") await client.update(t.flow, t.instanceId, t.activityInstanceId, body);
  else await client.formUpdate(t.flow, t.itemId, body);
}

/**
 * Writes a patch and verifies it by reading back (§7.2). Runs on the item's serial chain; rejects with
 * WrongContainerError / UncertainItemError from the queue, and throws LocalGuardError on a code bug.
 */
export function writeVerified(deps: WriteDeps, t: Target, p: Patch): Promise<SaveResult> {
  guardTarget(t, p); // loud, before anything is queued
  const key = targetKey(t);
  return deps.queue.enqueue(key, async (): Promise<SaveResult> => {
    const res = await writeOnChain(deps, t, p, key);
    // WL-03: "the last save failed" is recorded from the RESULT (a not-kept, refused, K-WB or timed-out save resolves;
    // it never throws). An empty patch sent nothing, so it changes nothing.
    if (!(res.kind === "refused" && res.message === NOTHING_TO_SAVE)) deps.queue.recordSave(key, res.ok);
    return res;
  });
}

const NOTHING_TO_SAVE = "Nothing to save.";

async function writeOnChain(deps: WriteDeps, t: Target, p: Patch, key: string): Promise<SaveResult> {
  let pending = normalisePatch(t.flow, p, deps.rnd);
  const isTaskAfterStart = t.kind === "task" && stepDef(t.step).kind !== "Start";
  // A step already known as refused this session skips the SDK write and opens the fallback (WB-9).
  if (t.kind === "task" && isTaskAfterStart && isKwbRefused(deps.session, t.step))
    return { ok: false, kind: "kwb-refused", fields: missingKeys(pending), pending: toPatch(pending), message: `Kissflow did not let the Workbench save fields at ${stepDef(t.step).name} earlier this session.`, stepMarked: true, skipped: true };
  if (isEmpty(pending)) return { ok: false, kind: "refused", message: NOTHING_TO_SAVE };
  // WL-15: child adds carry `_index` (rows already in the table + position), from a read through the same route.
  // A failed read sends the adds without it, as before.
  if (addsWithoutIndex(pending)) {
    try {
      const now = await readBack(deps.client, t);
      pending = normalisePatch(t.flow, p, deps.rnd, rowCounts(t.flow, now, Object.keys(pending.tables)));
    } catch {
      /* no _index */
    }
  }
  let back: RawItem | undefined;
  for (let attempt = 1; attempt <= 1 + MAX_REAPPLY; attempt++) {
    const body = toBody(t.flow, pending);
    try {
      await update(deps.client, t, body);
    } catch (e) {
      if (isTimeout(e)) {
        deps.queue.markUncertain(key, { kind: "write", patch: pending });
        return { ok: false, kind: "timeout", message: `Kissflow did not answer within 30 s. This item is locked for saving until you press Re-read. (${errorText(e)})` };
      }
      if (t.kind === "task" && isTaskAfterStart && isFieldRefusal(e)) {
        // Does the refusal name EVERY key sent? (a table counts as named by its id or its Table:: key)
        const sentFields = Object.keys(pending.fields);
        const sentTables = Object.entries(pending.tables).filter(([, o]) => o?.length).map(([tb]) => tb as ChildTableId);
        const covers =
          sentFields.length + sentTables.length > 0 &&
          refusedFieldsOf(e, sentFields).length === sentFields.length &&
          sentTables.every((tb) => refusedFieldsOf(e, [tb, childTableOf(t.flow, tb).key]).length > 0);
        // This task always gets the fallback; the STEP is marked only on strong evidence (WB-9).
        const strong = t.evidence === "activity" || t.evidence === "block-unique";
        if (strong && covers) markKwbRefused(deps.session, t.step);
        return { ok: false, kind: "kwb-refused", fields: missingKeys(pending), pending: toPatch(pending), message: errorText(e), stepMarked: strong && covers };
      }
      return { ok: false, kind: "refused", message: errorText(e) };
    }
    try {
      back = await readBack(deps.client, t);
    } catch (e) {
      return { ok: false, kind: "not-kept", missing: missingKeys(pending), message: `Kissflow answered the save, but the Workbench could not read the item back to check it (${errorText(e)}). Reload and check.` };
    }
    pending = missingFrom(t.flow, back, pending);
    if (isEmpty(pending)) {
      if (t.kind === "task" && isTaskAfterStart) markKwbOk(deps.session, t.step);
      deps.session.retries += attempt - 1;
      return { ok: true, kind: "ok", attempts: attempt, item: back };
    }
  }
  deps.session.notKept++;
  deps.session.retries += MAX_REAPPLY;
  const missing = missingKeys(pending);
  return { ok: false, kind: "not-kept", missing, message: `Kissflow did not keep: ${missing.join(", ")} after ${MAX_REAPPLY} retries. Someone else may be saving this item. Reload and check.` };
}

/** Compares an item read with a K-WB sheet WITHOUT writing (Re-read, §7.4). The values were typed by hand in the
 *  Kissflow form, so DateTimes compare at minute precision (a typed time has no seconds; WL-09). */
export function compareWithoutWrite(flow: FlowId, back: Record<string, unknown>, p: Patch, rnd?: () => number): { matches: boolean; missing: string[] } {
  const norm = normalisePatch(flow, p, rnd);
  // client row ids were never sent: match adds by natural key only
  const left = missingFrom(flow, back, norm, { minute: true });
  const missing = missingKeys(left);
  return { matches: missing.length === 0, missing };
}
