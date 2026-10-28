// The data console's Orphans page (26 Oct): the rows and items that still name a deleted CIQ Case, and their grouped
// delete. History: Thomas first chose "Delete with everything" after a case he deleted alone still showed for RMM (the
// CIQ screens find a case through every row that names it, its audit rows above all, and a deleted item's by-id read
// answers like a refusal, "could not be read for your role"). After that delete ran into "429 Too Many Requests" he
// chose (26 Oct, later): "when I am deleting an item just delete the item" (remove.ts, one call); the case's rows stay
// and this file is the explicit, separate tool that finds and deletes them, PACED: the console client's 2 calls in
// flight for the reads, the deletes one at a time RUN_GAP_MS apart, with Stop (runDelete).
// 27 Oct (Thomas: "say I delete a case in the admin, all associated to that also gets deleted, like how it was
// before"): the drawer's and the bulk delete of a CIQ Case cascade again (caseDelete.ts), with the SAME finding rules
// (appItemsOf, portalItemsOf, portalRemainOf below) over the console session's cached lists, and without read-backs.
//
// What belongs to a case (findCaseItems), by the fields each flow carries (ids.ts; the live drafts of 19 Oct; the
// portal's as built, kissflow-build/ciq-digital/integrations/scripts/harden/op-round.js):
//   - CIQ Review, CIQ Open Point, CIQ Internal Note, CIQ RMES Safety / Regulatory, CIQ Scope Run: Case_Item_Id;
//   - CIQ Audit Event: Case_Item_Id, and the item id its case snapshot names (Snapshot_JSON case.itemId, else
//     Object_Item_Id), as the load's case index reads them (load.ts knownCaseIds, snapshotObjects);
//   - CIQP Request (supplier portal): App_Case_Item_Id, and the case's own Portal_Request_Item_Id;
//   - CIQP Query (supplier portal): App_Open_Point_Id = one of the case's open points, and each such point's
//     Portal_Query_Item_Id; a query carries no case id, only Case_Code;
//   - a row that names no case id at all belongs by its Case_Code, unless another existing case holds the same code
//     (R-13 duplicates): then such rows are left out and the plan says so. A row that names an id belongs by the id only.
// The app's processes come from their admin lists, its forms from their lists (rows that carry neither link field are
// read in full); the portal's from its admin list searched (`q`) for the case's id, its code and its open points' ids.
//
// The delete (runDelete), after the user typed the case's code (its id when no code is known): one item at a time,
// RUN_GAP_MS apart, children first, the case item LAST (when it still exists), in DELETE_ORDER: portal queries → portal requests → open points → reviews → RMES → notes → scope runs
// → audit rows → the case. Every delete is read back: the read must now fail as a deleted item's ("not found", 01015,
// 404, or 050201 "moved out of your queue", which is how Kissflow answered for the deleted case on 26 Oct; common.ts
// isNotFound); an item still read, or any other failure, stops the run. A stop leaves the case (and its audit rows) in
// place, so it stays findable; the result says what remains, and running the delete again finishes it.
// The portal is another container: when it can't be listed from here (kf.api refused, or no such route), the portal
// items the app's own links name (the case's Portal_Request_Item_Id, the points' Portal_Query_Item_Id) are shown with
// their ids, to be deleted in the supplier portal's admin console (src/portal/admin), and the app's items are deleted.
// Orphans (findOrphans): every row or item that names a case item id that no longer exists among the CIQ Case items
// (adminList("case")), each missing id confirmed by its own read (a draft case is not listed but still exists), grouped
// by the missing case with counts per flow; each group is deleted through the same plan and run.
import { errorText } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import { CONSOLE_IN_FLIGHT, pool } from "../kf/client";
import { parseSnapshot } from "../map/auditMap";
import type { AppClient, FlowKey, FormKey, PortalFlowKey, ProcessKey } from "../types";
import { KEY_FIELD, isNotFound, need } from "./common";

export type PartKey = "portalQuery" | "portalRequest" | "op" | "review" | "rmesSAF" | "rmesREG" | "note" | "scopeRun" | "audit" | "case";
export type AppPart = "op" | "review" | "rmesSAF" | "rmesREG" | "note" | "scopeRun" | "audit";
export type PortalPart = "portalQuery" | "portalRequest";

/** Children first, the case LAST (the audit rows just before it: they are the case index). */
export const DELETE_ORDER: readonly PartKey[] = ["portalQuery", "portalRequest", "op", "review", "rmesSAF", "rmesREG", "note", "scopeRun", "audit", "case"];
export const APP_PARTS: readonly AppPart[] = ["op", "review", "rmesSAF", "rmesREG", "note", "scopeRun", "audit"];
export const APP_PROCESS: Partial<Record<PartKey, ProcessKey>> = { op: "op", review: "review", case: "case" };
export const APP_FORM: Partial<Record<PartKey, FormKey>> = { rmesSAF: "rmesSAF", rmesREG: "rmesREG", note: "note", scopeRun: "scopeRun", audit: "audit" };
export const PORTAL_FLOW: Record<PortalPart, PortalFlowKey> = { portalQuery: "query", portalRequest: "request" };
export const isPortal = (p: PartKey): p is PortalPart => p === "portalQuery" || p === "portalRequest";

export const PART_LABEL: Record<PartKey, string> = {
  portalQuery: "CIQP Query (supplier portal)",
  portalRequest: "CIQP Request (supplier portal)",
  op: "CIQ Open Point",
  review: "CIQ Review",
  rmesSAF: "CIQ RMES Safety",
  rmesREG: "CIQ RMES Regulatory",
  note: "CIQ Internal Note",
  scopeRun: "CIQ Scope Run",
  audit: "CIQ Audit Event",
  case: "CIQ Case",
};
const KEY_OF: Record<PartKey, string> = { ...KEY_FIELD, portalQuery: "Query_Key", portalRequest: "Request_Key" } as Record<PartKey, string>;
/** The console flow of a part (the portal's parts are no console flows): where a deleted item leaves the session's lists. */
export const FLOW_OF_PART: Partial<Record<PartKey, FlowKey>> = { case: "case", review: "review", op: "op", rmesSAF: "rmesSAF", rmesREG: "rmesREG", note: "note", scopeRun: "scopeRun", audit: "audit" };

/** One item to delete: its flow, id, business key and the field that tied it to the case. */
export interface PlanItem {
  part: PartKey;
  id: string;
  key: string;
  by: string;
}
/** The case a delete is for: its item id ("" when only a code is known) and its code ("" when none is known). */
export interface CaseTarget {
  id: string;
  code: string;
}
export interface CasePlan {
  target: CaseTarget;
  /** The CIQ Case item: read ("exists"), already deleted (its read answers as a deleted item's), or not known (its read
   *  failed otherwise: nothing is deleted). No id: "gone". */
  caseState: "exists" | "gone" | "unknown";
  caseError?: string;
  /** Everything to delete, in DELETE_ORDER (the case last, when it exists). */
  items: PlanItem[];
  /** Flows that could not be read: the plan may be incomplete, so nothing is deleted. */
  unlisted: { part: PartKey; error: string }[];
  /** The supplier portal could not be read from here: these portal items (named by the app's links) stay. */
  portal?: { error: string; remain: PlanItem[] };
  /** Other existing case items with the same code: rows that name only the code were left out. */
  sharedCode: string[];
}

export const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const keyOf = (part: PartKey, r: RawItem) => str(r, KEY_OF[part]) || r._id;
export const item = (part: PartKey, r: RawItem, by: string): PlanItem => ({ part, id: r._id, key: keyOf(part, r), by });

/** The case item ids a row of the app names: Case_Item_Id; an audit row also its case snapshot's item id. */
export function caseIdsOf(part: AppPart, r: RawItem): { id: string; by: string }[] {
  const out = [{ id: str(r, "Case_Item_Id"), by: "Case_Item_Id" }];
  if (part === "audit") {
    const s = parseSnapshot(r);
    if (s?.case) out.push({ id: s.case.itemId || str(r, "Object_Item_Id"), by: s.case.itemId ? "Snapshot_JSON" : "Object_Item_Id" });
  }
  return out.filter((x, i) => x.id && out.findIndex((y) => y.id === x.id) === i);
}
/** The case code a row names (an audit row's snapshot too). */
function codeOf(part: AppPart | PortalPart, r: RawItem): string {
  if (str(r, "Case_Code")) return str(r, "Case_Code");
  return part === "audit" ? (parseSnapshot(r)?.case?.caseId ?? "") : "";
}

/** Whether a row tied to case ids belongs to the target: it names the target, and no OTHER existing case (a row that
 *  names two cases is history of the one that is still there). */
function byIds(ids: { id: string; by: string }[], target: CaseTarget, existing: Set<string>): string | undefined {
  const hit = ids.find((x) => x.id === target.id);
  if (!hit || !target.id) return undefined;
  return ids.some((x) => x.id !== target.id && existing.has(x.id)) ? undefined : hit.by;
}

/** Items in DELETE_ORDER (children first, the case last). */
export const byDeleteOrder = (a: PlanItem, b: PlanItem) => DELETE_ORDER.indexOf(a.part) - DELETE_ORDER.indexOf(b.part);

/** The finding rules for the app's rows: a row that names case ids belongs by them (byIds); a row that names none
 *  belongs by its Case_Code, when no other existing case holds that code (`codeOk`). */
export function appItemsOf(rows: Partial<Record<AppPart, RawItem[]>>, target: CaseTarget, existing: Set<string>, codeOk: boolean): PlanItem[] {
  const items: PlanItem[] = [];
  const mine = (part: AppPart, r: RawItem): string | undefined => {
    const ids = caseIdsOf(part, r);
    if (ids.length) return byIds(ids, target, existing);
    return codeOk && codeOf(part, r) === target.code ? "Case_Code" : undefined;
  };
  for (const part of APP_PARTS) for (const r of rows[part] ?? []) {
    const by = mine(part, r);
    if (by) items.push(item(part, r, by));
  }
  return items;
}

/** What the portal rules need to know of the case beside the target. */
export interface PortalLinks {
  existing: Set<string>;
  codeOk: boolean;
  /** The case's Portal_Request_Item_Id ("" when none is known). */
  requestId: string;
  /** Its open points' Portal_Query_Item_Id. */
  queryIds: string[];
  /** Its open points' item ids. */
  opIds: Set<string>;
  /** Every listed open point's id (a query of a point that is still there, of another case, is not this case's). */
  allOps: { has(id: string): boolean };
}

/** The finding rules for the portal's items: a request by the case's own link (Portal_Request_Item_Id), its
 *  App_Case_Item_Id, else its Case_Code; a query by an open point's link (Portal_Query_Item_Id), its App_Open_Point_Id,
 *  else its Case_Code (unless its point is still there, of another case). */
export function portalItemsOf(requests: RawItem[], queries: RawItem[], target: CaseTarget, l: PortalLinks): PlanItem[] {
  const out: PlanItem[] = [];
  for (const r of requests) {
    const own = str(r, "App_Case_Item_Id");
    const by = l.requestId && r._id === l.requestId ? "Portal_Request_Item_Id" : own ? byIds([{ id: own, by: "App_Case_Item_Id" }], target, l.existing) : l.codeOk && str(r, "Case_Code") === target.code ? "Case_Code" : undefined;
    if (by) out.push(item("portalRequest", r, by));
  }
  for (const q of queries) {
    const op = str(q, "App_Open_Point_Id");
    const otherCase = op && !l.opIds.has(op) && l.allOps.has(op); // a point that is still there, of another case
    const by = l.queryIds.includes(q._id) ? "Portal_Query_Item_Id" : l.opIds.has(op) ? "App_Open_Point_Id" : !otherCase && l.codeOk && str(q, "Case_Code") === target.code ? "Case_Code" : undefined;
    if (by) out.push(item("portalQuery", q, by));
  }
  return out;
}

/** The portal items the app's own links name (listed by id when the portal can't be reached from here). */
export function portalRemainOf(queryIds: string[], requestId: string): PlanItem[] {
  return [...uniq(queryIds).map((id) => ({ part: "portalQuery" as const, id, key: id, by: "Portal_Query_Item_Id" })), ...(requestId ? [{ part: "portalRequest" as const, id: requestId, key: requestId, by: "Portal_Request_Item_Id" }] : [])];
}

// ---------------------------------------------------------------------------------------------------- reading

interface AppRead {
  /** Existing CIQ Case items (admin list rows, full where a row lacked its code). */
  cases?: RawItem[];
  rows: Partial<Record<AppPart, RawItem[]>>;
  errors: { part: PartKey; error: string }[];
}

/** Rows that carry none of `fields` are read in full (an admin list row is sparse: which fields a live one keeps is not
 *  known; every item of these flows has its link field set); a failed read is an error of the part. */
async function filled(rows: RawItem[], fields: string[], read: (id: string) => Promise<RawItem>): Promise<{ rows: RawItem[]; failed: number; why?: string }> {
  let failed = 0;
  let why: string | undefined;
  const out = await pool(rows, CONSOLE_IN_FLIGHT, async (r) => {
    if (fields.some((f) => f in r)) return r;
    try {
      return await read(r._id);
    } catch (e) {
      if (isNotFound(errorText(e))) return null; // deleted meanwhile
      failed++;
      why ??= errorText(e);
      return r;
    }
  });
  return { rows: out.filter((r): r is RawItem => !!r), failed, why };
}

/** Every case, review, open point and form row of the app that can name a case. */
async function readApp(client: AppClient): Promise<AppRead> {
  const errors: AppRead["errors"] = [];
  const rows: AppRead["rows"] = {};
  const lists = await Promise.all([
    client.adminList("case").then((r) => ({ part: "case" as const, r }), (e) => ({ part: "case" as const, e })),
    ...APP_PARTS.map((part) => (APP_PROCESS[part] ? client.adminList(APP_PROCESS[part]!) : client.formList(APP_FORM[part]!)).then((r) => ({ part, r }), (e) => ({ part, e }))),
  ]);
  let cases: RawItem[] | undefined;
  for (const x of lists) {
    if ("e" in x) {
      errors.push({ part: x.part, error: errorText(x.e) });
      continue;
    }
    const proc = APP_PROCESS[x.part];
    const fields = x.part === "case" ? ["Case_Code"] : ["Case_Item_Id"];
    const got = proc ? await filled(x.r, fields, (id) => client.adminGet(proc, id)) : { rows: x.r, failed: 0 };
    if (got.failed) errors.push({ part: x.part, error: `${got.failed} item${got.failed === 1 ? "" : "s"} could not be read to see their case: ${got.why}` });
    if (x.part === "case") cases = got.rows;
    else rows[x.part] = got.rows;
  }
  return { cases, rows, errors };
}

/** The link a portal item always carries (I-1 writes App_Case_Item_Id, op.round App_Open_Point_Id); a list row without it is read in full. */
const PORTAL_LINKS: Record<PortalPart, string[]> = { portalRequest: ["App_Case_Item_Id"], portalQuery: ["App_Open_Point_Id"] };

/** The portal items Kissflow's search finds for these texts (none: every item), deduped, full where a row lacks its
 *  links; plus the items the app's links name (read by id; one already deleted is left out). A refusal ends the read. */
export async function readPortal(client: AppClient, part: PortalPart, texts: (string | undefined)[], knownIds: string[]): Promise<RawItem[]> {
  const flow = PORTAL_FLOW[part];
  const list = need(client.portalList?.bind(client), "Reading the supplier portal");
  const get = need(client.portalGet?.bind(client), "Reading the supplier portal");
  const byId = new Map<string, RawItem>();
  for (const q of texts.length ? uniq(texts.map((t) => t ?? "")) : [undefined]) for (const r of await list(flow, q)) byId.set(r._id, r);
  for (const id of uniq(knownIds)) {
    if (byId.has(id)) continue;
    try {
      byId.set(id, await get(flow, id));
    } catch (e) {
      if (!isNotFound(errorText(e))) throw e;
    }
  }
  const got = await filled([...byId.values()], PORTAL_LINKS[part], (id) => get(flow, id));
  if (got.failed) throw new Error(`${got.failed} ${PART_LABEL[part]} item${got.failed === 1 ? "" : "s"} could not be read: ${got.why}`);
  return got.rows;
}

// ---------------------------------------------------------------------------------------------------- the plan

/** What belongs to the case, and how it was found; nothing is deleted here. The case item is read again (its
 *  Portal_Request_Item_Id, and whether it still exists); a target without a code takes the item's. */
export async function findCaseItems(client: AppClient, given: CaseTarget): Promise<CasePlan> {
  const readCase = async (): Promise<{ item?: RawItem; state: CasePlan["caseState"]; error?: string }> => {
    if (!given.id) return { state: "gone" };
    try {
      const it = await client.adminGet("case", given.id);
      return { item: it, state: it._is_deleted ? "gone" : "exists" };
    } catch (e) {
      const error = errorText(e);
      return { state: isNotFound(error) ? "gone" : "unknown", error };
    }
  };
  const [app, kase] = await Promise.all([readApp(client), readCase()]);
  const caseItem = kase.state === "exists" ? kase.item : undefined;
  const caseState = kase.state;
  const caseError = kase.error;
  const target: CaseTarget = { id: given.id, code: given.code || str(caseItem, "Case_Code") };
  const unlisted = [...app.errors];
  const cases = app.cases ?? [];
  const existing = new Set(cases.map((c) => c._id));
  const others = cases.filter((c) => c._id !== target.id);
  const sharedCode = target.code ? others.filter((c) => str(c, "Case_Code") === target.code).map((c) => c._id) : [];
  const codeOk = !!target.code && !sharedCode.length;

  // the app's rows
  const items = appItemsOf(app.rows, target, existing, codeOk);

  // the case's open points in full: their Portal_Query_Item_Id (a list row may not carry it)
  const ops = items.filter((x) => x.part === "op");
  const opIds = new Set(ops.map((x) => x.id));
  const fullOps = await pool(ops, CONSOLE_IN_FLIGHT, (x) => client.adminGet("op", x.id).catch(() => undefined));
  const queryIds = uniq(fullOps.map((o) => str(o, "Portal_Query_Item_Id")));
  const requestId = str(caseItem, "Portal_Request_Item_Id");
  const allOps = new Map((app.rows.op ?? []).map((o) => [o._id, o]));

  // the portal's items
  let portal: CasePlan["portal"];
  let portalItems: PlanItem[] = [];
  try {
    const requests = await readPortal(client, "portalRequest", [target.id, target.code], requestId ? [requestId] : []);
    const queries = await readPortal(client, "portalQuery", [target.code, ...opIds], queryIds);
    portalItems = portalItemsOf(requests, queries, target, { existing, codeOk, requestId, queryIds, opIds, allOps });
  } catch (e) {
    portalItems = [];
    portal = { error: errorText(e), remain: portalRemainOf(queryIds, requestId) };
  }
  items.push(...portalItems);
  if (caseItem && caseState === "exists") items.push(item("case", caseItem, "the case itself"));
  items.sort(byDeleteOrder);
  return { target, caseState, ...(caseError && caseState === "unknown" ? { caseError } : {}), items, unlisted, ...(portal ? { portal } : {}), sharedCode };
}

/** Why the plan can't be run (incomplete, or the case's state unknown), or undefined. */
export function planBlocked(plan: CasePlan): string | undefined {
  if (plan.caseState === "unknown") return `The case item could not be read (${plan.caseError ?? "no reason given"}), so it is not known whether it still exists. Nothing is deleted.`;
  if (plan.unlisted.length) return `Not every flow could be read (${plan.unlisted.map((u) => PART_LABEL[u.part]).join(", ")}), so something that belongs to the case could be missed. Nothing is deleted.`;
  if (!plan.items.length) return "Nothing to delete.";
  return undefined;
}

/** The text to type: the case's code, its id when no code is known. */
export const confirmText = (t: CaseTarget) => t.code || t.id;

/** Items per part, in DELETE_ORDER (parts without items left out). */
export function countsOf(items: PlanItem[]): { part: PartKey; n: number }[] {
  return DELETE_ORDER.map((part) => ({ part, n: items.filter((x) => x.part === part).length })).filter((x) => x.n > 0);
}

// ---------------------------------------------------------------------------------------------------- the run

export interface RunResult {
  /** Deleted and read back as gone, in order. */
  done: PlanItem[];
  /** Where the run stopped, and why. */
  failed?: { item: PlanItem; why: string };
  /** The user stopped the run (Stop): `remaining` was not tried. */
  stopped?: boolean;
  /** Not deleted (the failed one first). Portal items the app could not reach are in the plan's `portal.remain`. */
  remaining: PlanItem[];
}

/** The pause between two items of a run (each is a delete and its read-back), so a group does not burst into the rate
 *  limit. */
export const RUN_GAP_MS = 400;

export interface RunOptions {
  /** Before each item: how many are done, and which is next. */
  onStep?: (done: number, current: PlanItem) => void;
  /** The pause between two items (default RUN_GAP_MS). */
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Asked before each item: true ends the run there. */
  stop?: () => boolean;
}

/** One item: deleted, then read back. Resolves when it is gone; throws with the reason otherwise. */
async function deleteOne(client: AppClient, x: PlanItem): Promise<void> {
  const proc = APP_PROCESS[x.part];
  const form = APP_FORM[x.part];
  const read = (): Promise<RawItem> =>
    isPortal(x.part) ? need(client.portalGet?.bind(client), "Reading the supplier portal")(PORTAL_FLOW[x.part], x.id) : proc ? client.adminGet(proc, x.id) : client.formGet(form!, x.id);
  try {
    if (isPortal(x.part)) await need(client.portalDelete?.bind(client), "Deleting in the supplier portal")(PORTAL_FLOW[x.part], x.id);
    else if (proc) await need(client.adminDelete?.bind(client), "The admin delete")(proc, x.id);
    else await need(client.formDelete?.bind(client), "Deleting a row")(form!, x.id);
  } catch (e) {
    // already deleted (a run that stopped at its read-back): the read-back decides
    if (!isNotFound(errorText(e))) throw new Error(errorText(e));
  }
  let back: RawItem;
  try {
    back = await read();
  } catch (e) {
    if (isNotFound(errorText(e))) return;
    throw new Error(`The delete was sent, but the read-back did not confirm it: ${errorText(e)}`);
  }
  if (!back._is_deleted) throw new Error("The delete was accepted, but the item can still be read.");
}

/** Deletes the plan's items one by one in order, RUN_GAP_MS apart, each read back; stops at the first that is not gone,
 *  or when asked. */
export async function runDelete(client: AppClient, plan: CasePlan, run: RunOptions = {}): Promise<RunResult> {
  const blocked = planBlocked(plan);
  if (blocked) throw new Error(blocked);
  const gap = run.gapMs ?? RUN_GAP_MS;
  const sleep = run.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const done: PlanItem[] = [];
  for (const [i, x] of plan.items.entries()) {
    if (i > 0 && gap > 0) await sleep(gap);
    if (run.stop?.()) return { done, stopped: true, remaining: plan.items.slice(i) };
    run.onStep?.(i, x);
    try {
      await deleteOne(client, x);
      done.push(x);
    } catch (e) {
      return { done, failed: { item: x, why: errorText(e) }, remaining: plan.items.slice(i) };
    }
  }
  return { done, remaining: [] };
}

// ---------------------------------------------------------------------------------------------------- orphans

export interface OrphanGroup {
  target: CaseTarget;
  items: PlanItem[];
  /** "gone": the case item's read answers as a deleted item's (or only a code is known, held by no existing case);
   *  "unconfirmed": its read failed otherwise, so it may exist (no delete offered). */
  state: "gone" | "unconfirmed";
  why?: string;
}
export interface OrphanScan {
  groups: OrphanGroup[];
  /** Flows that could not be read (the scan may be incomplete). */
  errors: { part: PartKey; error: string }[];
}

/** Every row or item that names a case item that no longer exists, grouped by that case. */
export async function findOrphans(client: AppClient): Promise<OrphanScan> {
  const app = await readApp(client);
  const errors = [...app.errors];
  if (!app.cases) return { groups: [], errors }; // without the case list nothing can be called an orphan
  const existing = new Set(app.cases.map((c) => c._id));
  const existingCodes = new Set(app.cases.map((c) => str(c, "Case_Code")).filter(Boolean));
  const groups = new Map<string, { id: string; codes: string[]; items: PlanItem[] }>();
  const group = (id: string) => {
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { id, codes: [], items: [] }));
    return g;
  };
  const codeOnly: { part: AppPart | PortalPart; r: RawItem; code: string }[] = [];
  /** A row naming case ids: in the group of the missing one, unless it names an existing case too. */
  const place = (part: PartKey, r: RawItem, ids: { id: string; by: string }[], code: string) => {
    if (!ids.length) {
      if (code) codeOnly.push({ part: part as AppPart | PortalPart, r, code });
      return;
    }
    if (ids.some((x) => existing.has(x.id))) return;
    const g = group(ids[0]!.id);
    g.items.push(item(part, r, ids[0]!.by));
    if (code) g.codes.push(code);
  };
  for (const part of APP_PARTS) for (const r of app.rows[part] ?? []) place(part, r, caseIdsOf(part, r), codeOf(part, r));

  // the portal: every request and query (a refusal: the scan says so, the app's orphans are still listed)
  const ops = new Map((app.rows.op ?? []).map((o) => [o._id, o]));
  try {
    for (const r of await readPortal(client, "portalRequest", [], [])) {
      const own = str(r, "App_Case_Item_Id");
      place("portalRequest", r, own ? [{ id: own, by: "App_Case_Item_Id" }] : [], str(r, "Case_Code"));
    }
    const queryOf = new Map<string, string>(); // query id → the open point naming it (Portal_Query_Item_Id)
    for (const o of ops.values()) if (str(o, "Portal_Query_Item_Id")) queryOf.set(str(o, "Portal_Query_Item_Id"), o._id);
    for (const q of await readPortal(client, "portalQuery", [], [])) {
      const opId = str(q, "App_Open_Point_Id") || queryOf.get(q._id) || "";
      const op = opId ? ops.get(opId) : undefined;
      // its open point is still there: the point's case decides (deleted points' queries go by the code)
      if (op) place("portalQuery", q, caseIdsOf("op", op).map((x) => ({ ...x, by: "App_Open_Point_Id" })), str(q, "Case_Code"));
      else place("portalQuery", q, [], str(q, "Case_Code"));
    }
  } catch (e) {
    errors.push({ part: "portalRequest", error: errorText(e) });
  }

  // rows that name only a code: with the missing case of that code; none held by an existing case
  for (const x of codeOnly) {
    if (existingCodes.has(x.code)) continue;
    const g = [...groups.values()].find((y) => y.codes.includes(x.code)) ?? group(`code:${x.code}`);
    g.items.push(item(x.part, x.r, "Case_Code"));
    g.codes.push(x.code);
  }

  // each missing id confirmed by its own read: a case missing from the admin list may still exist (a draft)
  const out: OrphanGroup[] = [];
  for (const g of groups.values()) {
    const codeOnlyGroup = g.id.startsWith("code:");
    const id = codeOnlyGroup ? "" : g.id;
    const code = mostCommon(g.codes) || (codeOnlyGroup ? g.id.slice(5) : "");
    const order = (p: PartKey) => DELETE_ORDER.indexOf(p);
    const items = g.items.sort((a, b) => order(a.part) - order(b.part));
    if (!id) {
      out.push({ target: { id, code }, items, state: "gone" });
      continue;
    }
    try {
      const it = await client.adminGet("case", id);
      if (!it._is_deleted) continue; // it exists: not an orphan
      out.push({ target: { id, code }, items, state: "gone" });
    } catch (e) {
      const why = errorText(e);
      out.push({ target: { id, code }, items, state: isNotFound(why) ? "gone" : "unconfirmed", ...(isNotFound(why) ? {} : { why }) });
    }
  }
  return { groups: out.sort((a, b) => (a.target.code || a.target.id).localeCompare(b.target.code || b.target.id)), errors };
}

function mostCommon(xs: string[]): string {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}
