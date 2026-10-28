// The data console's field rules (26 Oct): which fields of an item are shown how and may be edited, the patch an edit
// sends (only what changed, typed like the value it replaces), child-table edits as the "Table::<model>" deltas the app
// already writes (write/actions.ts supplier contacts: a changed row by its `_id`, a new row `_is_created` with a fresh
// `_id`), and the read-back check that every write is followed by. JSON text fields (`*_JSON`) are sent exactly as typed:
// the configuration's hashes are over that text, so the editor never reformats it.
import type { KfData } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";

export const TABLE = "Table::";

/** System fields (Kissflow sets them; Name is the item's server-assigned name). */
export const isSystem = (k: string) => k.startsWith("_") || k === "Name";

/** "text": a scalar, edited as text; "json-text": a `*_JSON` text, edited as text that must be JSON; "value": an object
 *  or list (a user, a file), edited as its JSON; "formula": Kissflow computes it; "table": a child table. */
export type FieldKind = "text" | "json-text" | "value" | "formula" | "table";

export const modelOfKey = (k: string) => (k.startsWith(TABLE) ? k.slice(TABLE.length) : k);

export function kindOf(id: string, v: unknown, formulas: readonly string[], models: readonly string[]): FieldKind {
  if (id.startsWith(TABLE) || (models.includes(id) && Array.isArray(v))) return "table";
  if (formulas.includes(id)) return "formula";
  if (v !== null && typeof v === "object") return "value";
  return /_JSON$/.test(id) ? "json-text" : "text";
}

/** The text an editor starts from. */
export function editText(v: unknown, kind: FieldKind): string {
  if (v === null || v === undefined) return "";
  if (kind === "value" || typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

/** The text a view shows: JSON pretty-printed (a `*_JSON` text that parses, an object), anything else as it is. */
export function showText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  if (typeof v === "string" && /^\s*[[{]/.test(v)) {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  return String(v);
}

/** Why an edited text can't be sent, or undefined. An empty text clears the field. */
export function jsonProblem(text: string, kind: FieldKind): string | undefined {
  if ((kind !== "json-text" && kind !== "value") || text.trim() === "") return undefined;
  try {
    JSON.parse(text);
    return undefined;
  } catch (e) {
    return `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** The value to send for an edited text, typed like the value it replaces (a number stays a number). Empty = null. */
export function typedValue(text: string, before: unknown, kind: FieldKind): unknown {
  if (text.trim() === "") return null;
  if (kind === "value") return JSON.parse(text) as unknown;
  if (kind === "json-text") return text;
  if (typeof before === "number" && Number.isFinite(Number(text))) return Number(text);
  if (typeof before === "boolean" && (text === "true" || text === "false")) return text === "true";
  return text;
}

export interface EditField {
  id: string;
  value: unknown;
  kind: FieldKind;
}

/** The fields whose text changed, as values to send; and the texts that can't be sent (field → why). */
export function fieldPatch(fields: EditField[], draft: Record<string, string>): { data: KfData; problems: Record<string, string> } {
  const data: KfData = {};
  const problems: Record<string, string> = {};
  for (const f of fields) {
    if (f.kind === "formula" || f.kind === "table" || !(f.id in draft)) continue;
    const text = draft[f.id];
    if (text === editText(f.value, f.kind)) continue; // unchanged, including a missing field left empty
    const why = jsonProblem(text, f.kind);
    if (why) problems[f.id] = why;
    else data[f.id] = typedValue(text, f.value, f.kind);
  }
  return { data, problems };
}

// ---------------------------------------------------------------------------------- child tables

export type Row = Record<string, unknown>;

/** A child table's rows on an item: under "Table::<model>" or the model's own key. */
export function tableRows(item: Row | undefined, model: string): Row[] {
  const v = item?.[`${TABLE}${model}`] ?? item?.[model];
  return Array.isArray(v) ? (v as Row[]) : [];
}

/** The child tables of an item: every "Table::" key, and the form's known models. */
export function tablesOf(item: Row | undefined, models: readonly string[]): string[] {
  const found = Object.keys(item ?? {}).filter((k) => k.startsWith(TABLE) && Array.isArray(item?.[k])).map(modelOfKey);
  return [...new Set([...models, ...found])];
}

/** A table's columns: every field its rows carry, system fields left out, in order of first appearance. */
export function tableColumns(rows: Row[]): string[] {
  const out: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!k.startsWith("_") && !out.includes(k)) out.push(k);
  return out;
}

export interface RowDraft {
  /** The row's `_id`; absent for a new row. */
  id?: string;
  /** Column → text. */
  cells: Record<string, string>;
}

const cellText = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export const rowDrafts = (rows: Row[], columns: string[]): RowDraft[] =>
  rows.map((r) => ({ ...(typeof r._id === "string" ? { id: r._id } : {}), cells: Object.fromEntries(columns.map((c) => [c, cellText(r[c])])) }));

/** The "Table::<model>" delta of an edited table: each changed row by its `_id` with its changed cells, each new row
 *  with a non-empty cell as `_is_created` with a fresh `_id` (newRowId). A cell's value is typed like the column's
 *  stored values (a number stays a number; an object column is sent parsed when its text is JSON). Rows are never
 *  removed here. Undefined when nothing changed. */
export function tableDelta(model: string, before: Row[], drafts: RowDraft[], newRowId: (model: string) => string): Row[] | undefined {
  const sample = (col: string) => before.map((r) => r[col]).find((v) => v !== null && v !== undefined);
  const typed = (col: string, text: string): unknown => {
    const s = sample(col);
    if (text.trim() === "") return null;
    if (s !== undefined && typeof s === "object") {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }
    return typeof s === "number" && Number.isFinite(Number(text)) ? Number(text) : text;
  };
  const out: Row[] = [];
  for (const d of drafts) {
    if (d.id) {
      const orig = before.find((r) => r._id === d.id) ?? {};
      const changed = Object.entries(d.cells).filter(([c, t]) => t !== cellText(orig[c]));
      if (changed.length) out.push({ _id: d.id, ...Object.fromEntries(changed.map(([c, t]) => [c, typed(c, t)])) });
    } else {
      const filled = Object.entries(d.cells).filter(([, t]) => t.trim() !== "");
      if (filled.length) out.push({ _is_created: true, _id: newRowId(model), ...Object.fromEntries(filled.map(([c, t]) => [c, typed(c, t)])) });
    }
  }
  return out.length ? out : undefined;
}

// ---------------------------------------------------------------------------------- read-back

const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const idsOf = (v: unknown): string[] | undefined => {
  const arr = Array.isArray(v) ? v : [v];
  const ids = arr.map((x) => (x && typeof x === "object" && typeof (x as Row)._id === "string" ? String((x as Row)._id) : undefined));
  return ids.every((x) => x !== undefined) ? (ids as string[]) : undefined;
};

/** One value as text, for comparing and hashing: a scalar as its text, a user (or list of users) as its ids, anything
 *  else as its JSON. Empty is "". */
export function valueText(v: unknown): string {
  if (blank(v)) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const ids = idsOf(v);
  return ids ? ids.join(",") : JSON.stringify(v);
}

/** Whether Kissflow holds what was sent (a user read back with its Name is the same user). */
export const sameValue = (sent: unknown, back: unknown) => valueText(sent) === valueText(back);

/** What the read-back does not hold of `sent`: field ids; for a child table "<model> row <id>: <field>" (a changed row
 *  is found by its `_id`, a new row by its content, as Kissflow may give it another id). */
export function readBackProblems(sent: KfData, back: RawItem): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(sent)) {
    if (!k.startsWith(TABLE) || !Array.isArray(v)) {
      if (!sameValue(v, back[k])) out.push(k);
      continue;
    }
    const model = modelOfKey(k);
    const rows = tableRows(back, model);
    for (const d of v as Row[]) {
      const fields = Object.entries(d).filter(([f]) => !f.startsWith("_"));
      if (d._is_created) {
        if (!rows.some((r) => fields.every(([f, x]) => sameValue(x, r[f])))) out.push(`${model} new row`);
        continue;
      }
      const r = rows.find((x) => x._id === d._id);
      for (const [f, x] of fields) if (!r || !sameValue(x, r[f])) out.push(`${model} row ${String(d._id)}: ${f}`);
    }
  }
  return out;
}
