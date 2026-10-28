// The data console's import (26 Oct): a file read into rows keyed by field id, planned against the form's rows, then
// created one by one and each read back in full.
// - .json: an array of rows keyed by field id (as kissflow-build/night-2026-10-21/prod-seed/config-version.json).
// - .xlsx: the first worksheet (xlsx.ts); its header row names the fields by label ("Config Key") or id ("Config_Key"):
//   a label's id is the label with its spaces replaced by underscores. The mapping is shown before anything is written.
// - Not imported: system fields ("_…", Name), child tables ("Table::…"), columns without a header, a column named twice;
//   empty cells and null values (a row holds only the fields it gives).
// - Planned against the form's rows by its natural key (common.ts KEY_FIELD: CIQ Config Version by Config_Key): a row
//   whose key is already in the form, or appears earlier in the file, is skipped; a row without a key is not imported.
// - Created strictly in order, one at a time (formCreate is a draft and its submit; Kissflow keeps one draft per user
//   per form). Each created row is read back in full and every field the file gave is compared by the SHA-256 of its
//   text (crypto.subtle): "created" when all match, "differs" (naming the fields) when not. The first failure stops
//   the import: what Kissflow holds after a failed create is unknown, so nothing more is sent.
import { errorText, type KfData } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import type { AppClient, FormKey } from "../types";
import { TABLE, isSystem, valueText } from "./fields";
import { readXlsx, type Sheet, type XmlParse } from "./xlsx";

export interface ImportColumn {
  /** The header as the file names it (a JSON key, an xlsx header cell). */
  header: string;
  /** The field id it is imported into; null when it is not imported (`note` says why). */
  field: string | null;
  note?: string;
}

export interface ImportSource {
  kind: "json" | "xlsx";
  /** The worksheet read (xlsx). */
  sheet?: string;
  columns: ImportColumn[];
  rows: KfData[];
  /** How values were changed on the way (e.g. a JSON object in a `*_JSON` field sent as its text). */
  notes: string[];
}

export class ImportError extends Error {}

/** "Config Key" → "Config_Key"; an id stays as it is. */
export const fieldIdOf = (header: string) => header.trim().replace(/\s+/g, "_");

function ignoredWhy(field: string): string | undefined {
  if (!field) return "No header: not imported.";
  if (field.startsWith(TABLE)) return "A child table: not imported here.";
  if (isSystem(field)) return "A system field: Kissflow sets it.";
  return undefined;
}

/** The columns of a header, each mapped to a field id or left out. */
function mapColumns(headers: string[]): ImportColumn[] {
  const seen = new Set<string>();
  return headers.map((header) => {
    const id = fieldIdOf(header);
    const why = ignoredWhy(id) ?? (seen.has(id) ? `${id} is named twice: only the first column is imported.` : undefined);
    seen.add(id);
    return why ? { header, field: null, note: why } : { header, field: id, ...(id !== header ? { note: "Label → field id" } : {}) };
  });
}

/** A worksheet's rows: the first row is the header; empty cells are left out; a row without any value is skipped. */
export function sheetRows(sheet: Sheet): Pick<ImportSource, "columns" | "rows"> {
  const [head = [], ...body] = sheet.rows;
  const columns = mapColumns(head.map((h) => (h === null ? "" : String(h))));
  const rows: KfData[] = [];
  for (const cells of body) {
    const row: KfData = {};
    columns.forEach((c, i) => {
      const v = cells[i];
      if (c.field && v !== null && v !== undefined && v !== "") row[c.field] = v;
    });
    if (Object.keys(row).length) rows.push(row);
  }
  return { columns, rows };
}

/** A JSON file's rows: an array of objects keyed by field id. */
export function jsonRows(text: string): Pick<ImportSource, "columns" | "rows" | "notes"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new ImportError(`The file is not valid JSON: ${errorText(e)}`);
  }
  if (!Array.isArray(parsed) || parsed.some((r) => !r || typeof r !== "object" || Array.isArray(r))) throw new ImportError("The JSON file must hold a list of rows: an array of objects keyed by field id.");
  const headers: string[] = [];
  for (const r of parsed as Record<string, unknown>[]) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
  const columns = mapColumns(headers);
  const notes = new Set<string>();
  const rows = (parsed as Record<string, unknown>[]).map((r) => {
    const row: KfData = {};
    for (const c of columns) {
      const v = r[c.header];
      if (!c.field || v === null || v === undefined || v === "") continue;
      // Kissflow keeps a *_JSON field as text
      if (typeof v === "object" && /_JSON$/.test(c.field)) {
        row[c.field] = JSON.stringify(v);
        notes.add(`${c.field}: a JSON value in the file is sent as its JSON text.`);
      } else row[c.field] = v;
    }
    return row;
  });
  return { columns, rows: rows.filter((r) => Object.keys(r).length), notes: [...notes] };
}

/** Reads an import file by its extension. */
export async function readImportFile(name: string, bytes: Uint8Array, parse?: XmlParse): Promise<ImportSource> {
  if (/\.json$/i.test(name)) return { kind: "json", ...jsonRows(new TextDecoder("utf-8").decode(bytes)) };
  if (/\.xlsx$/i.test(name)) {
    const sheet = await readXlsx(bytes, parse);
    return { kind: "xlsx", sheet: sheet.name, ...sheetRows(sheet), notes: [] };
  }
  throw new ImportError("Choose a .json or .xlsx file.");
}

// ---------------------------------------------------------------------------------- plan and run

export type PlanStatus = "new" | "exists" | "no-key" | "duplicate";
export interface RowPlan {
  /** The row's place in the file, from 1. */
  n: number;
  key: string;
  data: KfData;
  status: PlanStatus;
}

export const keyOf = (row: Record<string, unknown> | undefined, keyField: string) => valueText(row?.[keyField]).trim();

/** Each row: new, already in the form (by its key), twice in the file (a later one), or without a key. */
export function planImport(rows: KfData[], keyField: string, existing: Iterable<string>): RowPlan[] {
  const held = new Set(existing);
  const seen = new Set<string>();
  return rows.map((data, i) => {
    const key = keyOf(data, keyField);
    const status: PlanStatus = !key ? "no-key" : held.has(key) ? "exists" : seen.has(key) ? "duplicate" : "new";
    seen.add(key);
    return { n: i + 1, key, data, status };
  });
}

export const SKIP_WHY: Record<Exclude<PlanStatus, "new">, string> = {
  exists: "Already in the form: skipped.",
  duplicate: "The same key appears earlier in the file: skipped.",
  "no-key": "No key: not imported.",
};

export type Outcome = "created" | "differs" | "skipped" | "failed" | "not-run";
export interface FieldDiff {
  field: string;
  /** The length of the file's text and of Kissflow's. */
  sent: number;
  back: number;
}
export interface RowResult {
  n: number;
  key: string;
  outcome: Outcome;
  /** The created item's id. */
  id?: string;
  /** The created item as read back (the console's list takes it instead of reading the form again). */
  item?: RawItem;
  diffs?: FieldDiff[];
  reason?: string;
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The fields of `sent` whose text the read-back does not hold (compared by SHA-256). */
export async function differingFields(sent: KfData, back: RawItem): Promise<FieldDiff[]> {
  const out: FieldDiff[] = [];
  for (const [field, v] of Object.entries(sent)) {
    const [a, b] = [valueText(v), valueText(back[field])];
    if ((await sha256Hex(a)) !== (await sha256Hex(b))) out.push({ field, sent: a.length, back: b.length });
  }
  return out;
}

/** The fingerprint of a file's rows: the SHA-256 of their JSON, each row's fields in name order, so two files holding the
 *  same rows (a .json and an .xlsx of one seed) show the same fingerprint whatever their column order. */
export const rowsFingerprint = (rows: KfData[]) => sha256Hex(JSON.stringify(rows.map((r) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))));

export interface ImportRun {
  /** Each row's result as it is known. */
  onRow?(r: RowResult): void;
  /** Asked before each create: true stops the import there. */
  stop?(): boolean;
}

const STOPPED = "Not sent: the import was stopped.";
const HALTED = "Not sent: the import stopped at the failure above.";

/** Creates the plan's new rows in order, one at a time, each read back in full. */
export async function runImport(client: Pick<AppClient, "formCreate" | "formGet">, form: FormKey, plans: RowPlan[], run: ImportRun = {}): Promise<RowResult[]> {
  const results: RowResult[] = [];
  let halted: string | undefined;
  for (const p of plans) {
    let r: RowResult;
    if (p.status !== "new") r = { n: p.n, key: p.key, outcome: "skipped", reason: SKIP_WHY[p.status] };
    else if (halted || run.stop?.()) r = { n: p.n, key: p.key, outcome: "not-run", reason: (halted ??= STOPPED) };
    else {
      let id: string | undefined;
      try {
        id = await client.formCreate(form, p.data);
        const back = await client.formGet(form, id);
        const diffs = await differingFields(p.data, back);
        r = { n: p.n, key: p.key, outcome: diffs.length ? "differs" : "created", id, item: back, ...(diffs.length ? { diffs } : {}) };
      } catch (e) {
        halted = HALTED;
        r = { n: p.n, key: p.key, outcome: "failed", ...(id ? { id } : {}), reason: id ? `Created, but it could not be read back: ${errorText(e)}` : errorText(e) };
      }
    }
    results.push(r);
    run.onRow?.(r);
  }
  return results;
}

/** "12 created, 0 differ, 0 skipped, 0 failed". */
export function importSummary(results: RowResult[]): string {
  const n = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const parts = [`${n("created")} created`, `${n("differs")} differ`, `${n("skipped")} skipped`, `${n("failed")} failed`];
  if (n("not-run")) parts.push(`${n("not-run")} not sent`);
  return parts.join(", ");
}
