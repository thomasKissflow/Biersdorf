// Field writability of the emulated host (WORKBENCH-DESIGN.md §11.1 permissions.ts, §11.2 refusals): per step from
// STEPS.perms (Mandatory or Editable); a computed field is never writable; DateTimes with milliseconds are refused by
// field TYPE from the schema, in header fields and child-row columns.
import { CHILD_TABLES, FIELDS, STEPS, type ChildTableId, type FlowId, type StepIr } from "../schema/generated";
import { hasMs } from "./time";

type FieldLike = { id: string; type: string; computed?: boolean };

export interface DataAnalysis {
  /** Header field ids present in the payload (system `_` keys excluded). */
  fields: string[];
  /** Child tables present (by spec id) through their `Table::<id>` key. */
  tables: ChildTableId[];
  /** Keys that are neither a header field nor a known `Table::` key of the flow. */
  unknown: string[];
  /** Computed fields named (header ids, or `Table::<id>.<column>`). */
  computed: string[];
  /** DateTime values with milliseconds (header ids, or `Table::<id>.<column>`). */
  ms: string[];
}

const header = (flow: FlowId): Record<string, FieldLike> => FIELDS[flow] as Record<string, FieldLike>;

/** The child table behind a `Table::<model id>` key of a flow (server model ids are unknown: the spec id). */
export function tableOfKey(flow: FlowId, key: string): ChildTableId | null {
  if (!key.startsWith("Table::")) return null;
  const model = key.slice("Table::".length);
  for (const t of Object.keys(CHILD_TABLES) as ChildTableId[]) {
    const d = CHILD_TABLES[t];
    const sid: string | null = d.serverModelId;
    if (d.flow === flow && (sid ?? d.id) === model) return t;
  }
  return null;
}

/** What a write payload names, for the permission, computed and ms checks and for the recorder. */
export function analyse(flow: FlowId, data: Record<string, unknown> | null | undefined): DataAnalysis {
  const a: DataAnalysis = { fields: [], tables: [], unknown: [], computed: [], ms: [] };
  const h = header(flow);
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k.startsWith("_")) continue;
    const t = tableOfKey(flow, k);
    if (t) {
      a.tables.push(t);
      const cols = CHILD_TABLES[t].fields as Record<string, FieldLike>;
      for (const row of Array.isArray(v) ? (v as Record<string, unknown>[]) : []) {
        if (!row || typeof row !== "object") continue;
        for (const [c, cv] of Object.entries(row)) {
          if (c.startsWith("_")) continue;
          const col = cols[c];
          if (!col) {
            a.unknown.push(`${k}.${c}`);
            continue;
          }
          if (col.computed && !a.computed.includes(`${k}.${c}`)) a.computed.push(`${k}.${c}`);
          if (col.type === "DateTime" && hasMs(cv) && !a.ms.includes(`${k}.${c}`)) a.ms.push(`${k}.${c}`);
        }
      }
      continue;
    }
    const f = h[k];
    if (!f) {
      a.unknown.push(k);
      continue;
    }
    a.fields.push(k);
    if (f.computed) a.computed.push(k);
    if (f.type === "DateTime" && hasMs(v)) a.ms.push(k);
  }
  return a;
}

/** Keys of the payload that the step does not allow (not Mandatory/Editable there, or computed). */
export function notWritableAt(step: StepIr, a: DataAnalysis): string[] {
  const perms = STEPS[step].perms as Record<string, string>;
  const bad: string[] = [];
  for (const f of a.fields) if (!perms[f] || header(STEPS[step].flow as FlowId)[f]?.computed) bad.push(f);
  for (const t of a.tables) if (!perms[t]) bad.push(t);
  for (const c of a.computed) if (!bad.includes(c)) bad.push(c);
  return bad;
}

/** Kissflow's field-permission refusal (SPIKES L141: every refused field is listed). */
export const permissionMessage = (fields: string[]): string => `You don't have permission to update the following fields: ${fields.join(", ")}`;
/** Kissflow's DateTime validation refusal (UI-LOG L41). */
export const msMessage = (fields: string[]): string => `Validation failed for the following fields: {${fields.map((f) => `'${f}': ['Invalid datetime']`).join(", ")}}`;
