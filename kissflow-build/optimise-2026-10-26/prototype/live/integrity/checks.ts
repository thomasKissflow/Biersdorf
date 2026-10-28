// S-INTEGRITY's pure checks (SPEC §4): the naming rule for every flow of both apps, with the exceptions known at the
// 02:29 snapshot, and the "no corruption" checks on one item as Kissflow returns it: every JSON field parses (and holds
// no `self:` id), no user field holds a pseudo id (`self:`, `contact:`, `u-…`, the mapper's stand-ins), dates are valid.
// Field types come from the flow's draft (drafts.ts FlowMeta); without one, from the field's name.
import { APP_ID, FLOWS } from "@/app-live/ids";
import { errorText } from "@/portal/kf/sdk";
import { PORTAL_ID, FLOWS as PORTAL_FLOWS } from "@/portal/kf/portal";
import type { RawItem } from "@/portal/data/raw";
import { INTEGRATIONS } from "../lib/hooks";
import { KfError } from "../lib/liveClient";
import type { FlowMeta } from "./drafts";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);

// ---------------------------------------------------------------------------------- names

/** CLAUDE.md "Flow names are unique across the whole account: app flows start `CIQ `, portal flows start `CIQP `". */
export const PREFIX: Record<string, string> = { [APP_ID]: "CIQ ", [PORTAL_ID]: "CIQP " };

/** Flows the code retired (ids.ts header: D-13, D-14) or that are Thomas's own; portal.ts marks its own (`v5: false`). */
const RETIRED_APP: Record<string, string> = {
  CIQ_Case_Data_A00: "retired (ids.ts D-13: CIQ Case Data)",
  CIQ_Service_Request_A00: "retired (ids.ts D-14: Service Request)",
  CIQ_Mail_Outbox_A00: "retired (ids.ts D-14: Mail Outbox)",
};
const PERSONAL: Record<string, string> = {
  CIQ_Case_Thomas_A00: "Thomas's own copy of CIQ Case (SPEC §1: never written)",
  Mail_Integration_Thomas_A00: "Thomas's own integration",
};
/** Names that break the rule and were already there at the 02:29 snapshot (Thomas's, not the build's). */
const KNOWN_BREAKS: Record<string, string> = {
  Yes_No_A00: 'list "Yes/No" without the CIQ prefix (created by Thomas on 16 Oct)',
  Test_A00: 'integration "Test" (switched off)',
  Mail_Integration_Thomas_A00: "Thomas's own integration (switched off)",
};

export interface FlowRow {
  app: string;
  type: string;
  id: string;
  name: string;
  status: string;
  isActive?: boolean;
  modifiedAt: string;
  lastPublishedAt: string;
}

export type FlowKind = "used" | "retired" | "spike" | "personal" | "other";

/** The flows the code uses: ids.ts FLOWS (name: load.ts FLOW_LABEL), portal.ts FLOWS (its v5 ones), the 12 hand-offs. */
export function usedFlows(appLabels: Record<string, string>): Map<string, { app: string; name?: string; retired?: boolean }> {
  const out = new Map<string, { app: string; name?: string; retired?: boolean }>();
  for (const [k, f] of Object.entries(FLOWS)) out.set(f.id, { app: APP_ID, name: appLabels[k] });
  for (const f of Object.values(PORTAL_FLOWS)) out.set(f.id, { app: PORTAL_ID, name: f.name, retired: !f.v5 });
  for (const i of Object.values(INTEGRATIONS)) if (i) out.set(i.id, { app: i.app });
  return out;
}

/** What a flow is, whether its name follows the rule, and why an exception is accepted (undefined: it is not). */
export function classifyFlow(row: FlowRow, used: ReturnType<typeof usedFlows>): { kind: FlowKind; follows: boolean; why?: string } {
  const follows = row.name.startsWith(PREFIX[row.app] ?? "\u0000");
  const u = used.get(row.id);
  const retiredByName = /^ZZZ \(Not in Use\) /.test(row.name);
  const kind: FlowKind = PERSONAL[row.id] ? "personal" : /spike/i.test(row.name) || /spike/i.test(row.id) ? "spike" : RETIRED_APP[row.id] || u?.retired || retiredByName ? "retired" : u ? "used" : "other";
  const why =
    PERSONAL[row.id] ??
    RETIRED_APP[row.id] ??
    (kind === "spike" ? "a spike (test flow of the build)" : undefined) ??
    (u?.retired ? "retired (portal.ts v5: false)" : undefined) ??
    (retiredByName ? 'retired (renamed "ZZZ (Not in Use) …")' : undefined) ??
    KNOWN_BREAKS[row.id];
  return { kind, follows, ...(why ? { why } : {}) };
}

// ---------------------------------------------------------------------------------- one item

export interface Problem {
  /** The field (a child row's as "<table>[<n>].<field>"). */
  field: string;
  problem: string;
  value?: string;
}

/** The mapper's stand-ins and aliases (map/people.ts, write/encode.ts NOT_A_USER, ALIASES): never in a user field. */
export const PSEUDO_ID = /^(self|contact|mail|role|name):|^u-|^system$/;
/** Text fields that hold Kissflow user ids (Portal_Contact_Ids, Confirm_Contact_Ids, Contact_Portal_Ids_Text,
 *  Contacts_Portal_User_Id, …). */
const ID_TEXT = /(_Ids|_Ids_Text|_User_Id)$/;
/** JSON fields whose `_id`s become portal User values (I-1: Assigned_Contacts, Release_Contacts). */
const ASSIGNEE_JSON = new Set(["Portal_Assignees_JSON", "Release_Assignees_JSON"]);
const DATE = /^\d{4}-\d{2}-\d{2}/;
const SYSTEM_DATES = new Set(["_created_at", "_modified_at", "_completed_at"]);
const short = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v) ?? "").slice(0, 80);

/** A date or DateTime Kissflow could hold: parseable, yyyy-mm-dd first, years 2020–2100. */
export function validDate(v: unknown): boolean {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const t = Date.parse(v);
  const y = Number(v.slice(0, 4));
  return Number.isFinite(t) && y >= 2020 && y <= 2100;
}

/** Every `self:` id inside a parsed JSON value (S-FORMS "no `self:` in the JSON"), as paths. */
function selfIds(v: unknown, path: string, out: string[]): void {
  if (typeof v === "string") {
    if (/^self:/.test(v)) out.push(path);
  } else if (Array.isArray(v)) v.forEach((x, i) => selfIds(x, `${path}[${i}]`, out));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) selfIds(x, `${path}.${k}`, out);
}

function userProblems(field: string, ids: string[], out: Problem[]): void {
  for (const id of ids) if (!id.trim() || PSEUDO_ID.test(id)) out.push({ field, problem: "not a Kissflow user id", value: id });
}

/** The keys of a User value as Kissflow returns it ({_id, Name, Kind, Email}). */
const USER_KEYS = new Set(["_id", "Name", "Kind", "Email"]);
/** Rows of a child table: by its key, the draft's models, else rows carrying more than a user's keys. */
const isChildTable = (k: string, model: string, v: unknown, meta?: FlowMeta): boolean =>
  Array.isArray(v) && (k.startsWith("Table::") || !!meta?.models.has(model) || (!meta?.fields.has(k) && v.some((r) => isObj(r) && Object.keys(r).some((x) => !USER_KEYS.has(x)))));

const idsOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v]).filter((u) => u != null && u !== "").map((u) => (isObj(u) ? String(u._id ?? "") : String(u)));

/** The corruption problems of one item (its child rows included). `meta`: the flow's draft, for the field types. */
export function itemProblems(it: RawItem | Obj, meta?: FlowMeta, prefix = ""): Problem[] {
  const out: Problem[] = [];
  for (const [k, v] of Object.entries(it)) {
    const field = `${prefix}${k}`;
    if (SYSTEM_DATES.has(k)) {
      if (v != null && v !== "" && !validDate(v)) out.push({ field, problem: "not a valid date", value: short(v) });
      continue;
    }
    if (k.startsWith("_") || v == null || v === "") continue;
    const model = k.startsWith("Table::") ? k.slice("Table::".length) : k;
    if (isChildTable(k, model, v, meta)) {
      // each row with its own fields (a child table's field ids are the flow's too: Contacts_Email, …)
      (v as unknown[]).forEach((row, i) => isObj(row) && out.push(...itemProblems(row, meta, `${prefix}${model}[${i}].`)));
      continue;
    }
    const type = meta?.fields.get(k)?.type ?? "";
    if (/_JSON$/.test(k)) {
      if (typeof v !== "string") {
        out.push({ field, problem: "a JSON field that is not text", value: short(v) });
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(v);
      } catch (e) {
        out.push({ field, problem: `does not parse as JSON (${e instanceof Error ? e.message : String(e)})`, value: short(v) });
        continue;
      }
      const self: string[] = [];
      selfIds(parsed, field, self);
      for (const p of self) out.push({ field: p, problem: "a self: id inside the JSON" });
      if (ASSIGNEE_JSON.has(k)) userProblems(field, (Array.isArray(parsed) ? parsed : []).map((u) => (isObj(u) ? String(u._id ?? "") : String(u))), out);
      continue;
    }
    if (type === "User" || type === "MultiUser" || (!type && isObj(v) && "_id" in v) || (!type && Array.isArray(v) && v.length && v.every((u) => isObj(u) && "_id" in u))) {
      userProblems(field, idsOf(v), out);
      continue;
    }
    if (ID_TEXT.test(k) && typeof v === "string") {
      userProblems(field, v.split(/[,;\s]+/).filter(Boolean), out);
      continue;
    }
    if (type === "Date" || type === "DateTime" || (!type && /_(At|Date)$/.test(k))) {
      if (!validDate(v)) out.push({ field, problem: `not a valid ${type || "date"}`, value: short(v) });
    }
  }
  return out;
}

/** The item is gone (deleted): Kissflow's 404 "could not be located" (01015); not a 404 that is a refusal (050201) or
 *  a wrong route ("Resource not found", 00137). */
export function isGone(e: unknown): boolean {
  if (e instanceof KfError && e.status !== 404) return false;
  return /01015|could not be located/i.test(errorText(e));
}
