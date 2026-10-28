// Value normalisation for writes and for the write-then-verify compare (WORKBENCH-DESIGN.md §6.6). kfDateTime lives
// here: `toISOString(` is banned everywhere else in src/workbench (guards.spec.ts), so no DateTime with milliseconds
// can be written by accident (Kissflow refuses them; UI-LOG L41).
import { fieldDef, type FieldType, type FlowId } from "../schema";

/** Explicit clear of a field. Text types are written as "", typed fields as null. A clear is never an accident. */
export const CLEAR: unique symbol = Symbol("wb.clear");
export type Clear = typeof CLEAR;
export const isClear = (v: unknown): v is Clear => v === CLEAR;

/** A Kissflow DateTime value: ISO without milliseconds, `…:ssZ`. */
export const kfDateTime = (d: Date = new Date()): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");
/** A Kissflow Date value, `YYYY-MM-DD` (UTC calendar day of the instant). [unverified] write shape. */
export const kfDate = (d: Date = new Date()): string => d.toISOString().slice(0, 10);
/** `YYYYMMDD` for keys. */
export const ymd = (d: Date = new Date()): string => kfDate(d).replace(/-/g, "");
/** A local-time `YYYY-MM-DDTHH:mm` for <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** A date `n` days after `d`, as YYYY-MM-DD. */
export const addDays = (d: Date, n: number): string => kfDate(new Date(d.getTime() + n * 86400000));

const TEXT_TYPES = new Set<FieldType>(["Text", "Textarea", "Email", "Select"]);

/** Blank: null, undefined, "", whitespace, [] or an object without _id (§6.6). */
export function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return !(v as { _id?: unknown })._id;
  return false;
}

/** The user/reference id a value carries: `{_id}`, `{_id, Name}` or a bare id string. */
export function idOf(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && typeof (v as { _id?: unknown })._id === "string") return (v as { _id: string })._id || null;
  return null;
}
/** A user's display name when the read carries one. */
export function nameOf(v: unknown): string | null {
  if (v && typeof v === "object") {
    const o = v as { Name?: unknown; name?: unknown };
    const n = o.Name ?? o.name;
    if (typeof n === "string" && n.trim()) return n;
  }
  return null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** The value written to Kissflow for a field type. Undefined means "do not send". */
export function writeValue(type: FieldType | undefined, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (isClear(v)) return type && TEXT_TYPES.has(type) ? "" : null;
  switch (type) {
    case "DateTime": {
      if (v === null || v === "") return null;
      const d = toDate(v);
      if (!d) throw new Error(`not a date-time: ${String(v)}`);
      return kfDateTime(d);
    }
    case "Date": {
      if (v === null || v === "") return null;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const d = toDate(v);
      if (!d) throw new Error(`not a date: ${String(v)}`);
      return kfDate(d);
    }
    case "Number": {
      if (v === null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`not a number: ${String(v)}`);
      return n;
    }
    case "User":
    case "Reference": {
      if (v === null || v === "") return null;
      const id = idOf(v);
      if (!id) throw new Error(`no _id in ${JSON.stringify(v)}`);
      return { _id: id };
    }
    case "Attachment":
      throw new Error("the Workbench never writes attachments");
    default:
      return v === null ? "" : String(v);
  }
}

export interface CompareOptions {
  /** DateTime at minute precision: values typed by hand in the Kissflow form (K-WB sheet) carry no seconds (WL-09). */
  minute?: boolean;
}

/** Compares a read-back value with what was written, per field type (§6.6). */
export function sameValue(type: FieldType | undefined, written: unknown, read: unknown, o: CompareOptions = {}): boolean {
  if (isClear(written)) return isBlank(read);
  if (isBlank(written) && isBlank(read)) return true;
  if (isBlank(written) !== isBlank(read)) return false;
  switch (type) {
    case "DateTime": {
      const a = toDate(written);
      const b = toDate(read);
      const unit = o.minute ? 60000 : 1000;
      return !!a && !!b && Math.floor(a.getTime() / unit) === Math.floor(b.getTime() / unit);
    }
    case "Date":
      return String(written).slice(0, 10) === String(read).slice(0, 10);
    case "Number":
      return Number(written) === Number(read);
    case "User":
    case "Reference":
      return idOf(written) === idOf(read);
    default:
      return String(written).trim() === String(read).trim();
  }
}

/** Drops undefined values (an explicit clear uses CLEAR). */
export const compact = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Field values normalised for a write to `flow` (header fields). Unknown ids are refused loudly. */
export function normaliseFields(flow: FlowId, fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const def = fieldDef(flow, k);
    if (!def) throw new Error(`${k} is not a field of ${flow}`);
    const w = writeValue(def.type, v);
    if (w !== undefined) out[k] = w;
  }
  return out;
}

/** True when a value is a DateTime string with milliseconds (refused by Kissflow). */
export const hasMilliseconds = (v: unknown): boolean => typeof v === "string" && /T\d{2}:\d{2}:\d{2}\.\d+/.test(v);

/** A read value as display text. */
export function displayValue(v: unknown): string {
  if (isBlank(v)) return "";
  if (typeof v === "object" && v) return nameOf(v) ?? idOf(v) ?? JSON.stringify(v);
  return String(v);
}

/** A DateTime as the user types it in a Kissflow date-time field: local time, no seconds (`YYYY-MM-DD HH:mm`). */
export function localDateTimeText(v: unknown): string {
  const d = toDate(v);
  return d ? toLocalInput(d).replace("T", " ") : displayValue(v);
}

/** A value as the user enters it by hand, per field type (DateTime: local, no seconds). */
export function typedValue(type: FieldType | undefined, v: unknown): string {
  return type === "DateTime" && !isBlank(v) ? localDateTimeText(v) : displayValue(v);
}
