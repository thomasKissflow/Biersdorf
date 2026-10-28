// Shared bits of the data console (26 Oct, the Admin / Developer role): the flows it shows, their labels, the key each
// table shows first (and an import matches rows by), a few summary columns, the child tables of each form, and the
// formula fields no one writes. The portal's admin console (src/portal/admin/common.ts) is the model; its useAsync and
// statusTone are reused as they are.
import { FLOWS, FORMULA_FIELDS, TABLES } from "../ids";
import type { FlowKey, FormKey, ProcessKey } from "../types";

export { statusTone, useAsync, type AsyncState } from "@/portal/admin/common";

export const DATA_PATH = "/data";
export const IMPORT_PATH = `${DATA_PATH}/import`;
/** 26 Oct: rows and items that name a deleted case (Orphans.tsx). */
export const ORPHANS_PATH = `${DATA_PATH}/orphans`;
export const flowPath = (f: FlowKey) => `${DATA_PATH}/flow/${f}`;

export const CONSOLE_PROCESSES: readonly ProcessKey[] = ["case", "review", "op"];
export const CONSOLE_FORMS: readonly FormKey[] = ["config", "supplier", "audit", "note", "rmesSAF", "rmesREG", "scopeRun"];
export const CONSOLE_FLOWS: readonly FlowKey[] = [...CONSOLE_PROCESSES, ...CONSOLE_FORMS];

export const isProcess = (f: FlowKey): f is ProcessKey => FLOWS[f].kind === "process";
export const isConsoleFlow = (k: string | undefined): k is FlowKey => !!k && (CONSOLE_FLOWS as readonly string[]).includes(k);

export const FLOW_LABEL: Record<FlowKey, string> = {
  case: "Cases",
  review: "Reviews",
  op: "Open points",
  config: "Configuration versions",
  supplier: "Suppliers",
  audit: "Audit events",
  note: "Internal notes",
  rmesSAF: "RMES Safety",
  rmesREG: "RMES Regulatory",
  scopeRun: "Scope runs",
};

/** The flow's name in Kissflow, under the label. */
export const FLOW_NAME: Record<FlowKey, string> = {
  case: "CIQ Case",
  review: "CIQ Review",
  op: "CIQ Open Point",
  config: "CIQ Config Version",
  supplier: "CIQ Supplier",
  audit: "CIQ Audit Event",
  note: "CIQ Internal Note",
  rmesSAF: "CIQ RMES Safety",
  rmesREG: "CIQ RMES Regulatory",
  scopeRun: "CIQ Scope Run",
};

/** The business key shown first in tables; for a form also the natural key an import skips existing rows by. */
export const KEY_FIELD: Record<FlowKey, string> = {
  case: "Case_Code",
  review: "Review_Key",
  op: "OP_Key",
  config: "Config_Key",
  supplier: "Supplier_Code",
  audit: "Event_Key",
  note: "Note_Key",
  rmesSAF: "RMES_Key",
  rmesREG: "RMES_Key",
  scopeRun: "Run_Key",
};

/** A few columns after the key, per flow (an item without them shows "—"). */
export const SUMMARY_FIELDS: Record<FlowKey, readonly string[]> = {
  case: ["Supplier_Code", "Trade_Name"],
  review: ["Case_Code", "Review_Dept"],
  op: ["Case_Code", "OP_Dept"],
  config: ["Config_Kind", "Version_Label", "Config_State"],
  supplier: ["Supplier_Legal_Name", "Supplier_Active"],
  audit: ["Case_Code", "Action_Code", "Event_At"],
  note: ["Case_Code", "Linked_Key", "Note_At"],
  rmesSAF: ["Case_Code", "Open_Criteria_Count"],
  rmesREG: ["Case_Code", "Open_Criteria_Count"],
  scopeRun: ["Case_Code", "Scope_Trigger"],
};

/** The child tables (models) of each form, as the app writes them ("Table::<model>"); a full read returns them, a list
 *  row does not (load.ts CHILD_TABLE_FORMS). */
export const CHILD_MODELS: Partial<Record<FlowKey, readonly string[]>> = {
  supplier: [TABLES.contacts],
  rmesSAF: [TABLES.SAF.criteria, TABLES.SAF.findings],
  rmesREG: [TABLES.REG.criteria, TABLES.REG.findings],
};

/** Formula fields Kissflow computes (ids.ts FORMULA_FIELDS): shown, never written. */
export const formulasOf = (key: string): readonly string[] => (FORMULA_FIELDS as Record<string, readonly string[]>)[key] ?? [];

/** A client method the console needs, or a plain refusal when this client has none. */
export function need<T>(fn: T | undefined, what: string): T {
  if (!fn) throw new Error(`${what} is not available here.`);
  return fn;
}

/** Kissflow's answer for an item that is gone (portal ItemDrawer's read-back rule): "not found", 01015, 404, or 050201
 *  "This item has moved out of your queue.", which is how the admin read answered for a deleted case on 26 Oct (live).
 *  The console reads as flow Admin, where an item that exists is read, so 050201 there means deleted [unverified for
 *  form rows and the supplier portal's items]. */
export const isNotFound = (text: string) => /not ?found|01015|050201|404/i.test(text);
