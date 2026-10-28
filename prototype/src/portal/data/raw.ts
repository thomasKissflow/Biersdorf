// Raw portal items exactly as Kissflow returns them: flat business fields plus underscore system fields
// (_id, _status, _current_step, _created_at, …). Readers are defensive: list envelopes are sparse and values may
// be missing, strings, numbers or {_id, Name} objects.

export type RawItem = Record<string, unknown> & { _id: string };
type Obj = Record<string, unknown> | undefined;

export function str(it: Obj, key: string): string {
  const v = it?.[key];
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function num(it: Obj, key: string): number | undefined {
  const v = it?.[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function json<T>(it: Obj, key: string, fallback: T): T {
  const v = it?.[key];
  if (typeof v !== "string" || v.trim() === "") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

/** Ids from a User / MultiUser field ({_id} object, array of them, or bare ids). */
export function userIds(it: Obj, key: string): string[] {
  const v = it?.[key];
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr.map((u) => (u && typeof u === "object" ? String((u as { _id?: unknown })._id ?? "") : String(u))).filter(Boolean);
}

/** A {_id, Name} reference such as _created_by / _modified_by. */
export function refUser(it: Obj, key: string): { id: string; name: string } | undefined {
  const v = it?.[key];
  if (!v || typeof v !== "object") return undefined;
  const o = v as { _id?: unknown; Name?: unknown };
  return o._id ? { id: String(o._id), name: typeof o.Name === "string" ? o.Name : String(o._id) } : undefined;
}

export type ItemState = "open" | "completed" | "ended";

/** Completed = reached End; ended = rejected/withdrawn; anything else (Draft, InProgress) is open. */
export function itemState(it: Obj): ItemState {
  const s = str(it, "_status");
  if (s === "Completed") return "completed";
  if (s === "Rejected" || s === "Withdrawn" || s === "Cancelled") return "ended";
  return "open";
}

export const caseKeyOf = (it: Obj): string => `${str(it, "Case_Code")}|${num(it, "Cycle_No") ?? 1}`;

/** Rows of a child table on an item: by the table's model id or its `Table::<id>` key (the verified REST read key),
 *  else the first array whose rows carry `rowField`. */
export function childRows(it: Obj, tableId: string, rowField: string): Record<string, unknown>[] {
  if (!it) return [];
  for (const key of [tableId, `Table::${tableId}`]) {
    const direct = it[key];
    if (Array.isArray(direct)) return direct as Record<string, unknown>[];
  }
  for (const v of Object.values(it)) {
    if (Array.isArray(v) && v.some((r) => r && typeof r === "object" && rowField in (r as object))) return v as Record<string, unknown>[];
  }
  return [];
}
