// The data console's delete of a CIQ Case WITH everything that belongs to it (27 Oct, Thomas: "say I delete a case in
// the admin, all associated to that also gets deleted, like how it was before"): the drawer's Delete of a case, and the
// bulk delete with cases selected (one case after the other). The 26 Oct lessons stay: the console client's 2 calls in
// flight and its 429 backoff (kf/client.ts CONSOLE_RETRY, Retry-After honoured), the session's lists (session.ts), the
// deletes strictly one at a time, paced.
//
// Finding (planCaseDeletes), with the SAME rules as the Orphans page (cascade.ts appItemsOf, portalItemsOf):
//   - the app's rows from the session's cached lists: a flow not read yet this session is read once (2 at a time) and
//     stays cached; a process row that lacks its link field (Case_Item_Id; a case row Case_Code) is read in full once
//     and replaces its row in the list. Nothing else of the app is read: the case item is the drawer's full read (or its
//     list row, in a bulk delete);
//   - the supplier portal's items by kf.api into CIQ_Supplier_Portal_A00, as cascade.ts: CIQP Request searched (`q`)
//     for the case's item id and its code, CIQP Query for its code (op.round writes every query's Case_Code; the
//     Orphans page also searches each open point's id), plus the items the app's links name; a portal row without its
//     link read in full. When the portal can't be read from here, its items the app names are listed by id (an open
//     point whose row lacks Portal_Query_Item_Id read in full for it) and the app's items are still deleted; the later
//     cases of a bulk delete do not try the portal again;
//   - in a bulk delete the selected cases are no "existing" cases for one another (a row naming two of them goes with
//     the first), and no item is planned twice.
//
// Deleting (runCaseDeletes): the items in DELETE_ORDER per case (portal queries → portal requests → open points →
// reviews → RMES Safety → RMES Regulatory → notes → scope runs → audit rows → the case LAST), case after case, ONE call
// each, RUN_GAP_MS apart, no read-back: an answer without an error is done; "not found" (01015, 404, 050201: common.ts
// isNotFound) counts as already gone; a call still rate-limited after the client's backoff pauses the run there
// (RATE_LIMITED, "Continue"); a refused portal delete moves that and the later portal items to the list to delete in
// the portal's admin console and the run goes on; anything else stops the run where it is (the case stays findable).
// Stop is asked before each call. The remaining items are the next run's ("Run again" / "Continue").
import { errorText } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import { CONSOLE_IN_FLIGHT, RateLimitError, pool } from "../kf/client";
import type { AppClient, FlowKey, ProcessKey } from "../types";
import {
  APP_FORM,
  APP_PARTS,
  APP_PROCESS,
  PART_LABEL,
  PORTAL_FLOW,
  RUN_GAP_MS,
  appItemsOf,
  byDeleteOrder,
  isPortal,
  item,
  portalItemsOf,
  portalRemainOf,
  readPortal,
  uniq,
  type AppPart,
  type CasePlan,
  type CaseTarget,
  type PartKey,
  type PlanItem,
} from "./cascade";
import { isNotFound, need } from "./common";
import type { ConsoleSession } from "./session";

/** A case to delete with what belongs to it: its item id, its code ("" when none) and the item as the console holds it
 *  (the drawer's full read, or the list row). */
export interface CaseToDelete {
  id: string;
  code: string;
  item?: RawItem;
}

/** The console flows the finder reads: the case list (which cases exist) and every flow whose rows can name a case. */
export const CASE_FLOWS: readonly FlowKey[] = ["case", ...APP_PARTS];
/** The field a process list row needs to be placed; a row without it is read in full once. */
const LINK_FIELD: Partial<Record<ProcessKey, string>> = { case: "Case_Code", review: "Case_Item_Id", op: "Case_Item_Id" };

export interface CaseDeletePlan {
  /** One plan per case, in the order given; each in DELETE_ORDER with its case last. */
  cases: CasePlan[];
  /** Every item, case after case: the run's order. */
  items: PlanItem[];
  /** App flows whose list could not be read: something could be missed, so nothing is deleted. */
  unlisted: { part: PartKey; error: string }[];
  /** The supplier portal could not be read from here (each case's `portal.remain` names its items). */
  portalError?: string;
  /** Lists read now (not cached before). */
  read: FlowKey[];
}

const keyOf = (x: { part: PartKey; id: string }) => `${x.part}|${x.id}`;

/** Why the plan can't be run, or undefined. */
export function caseDeleteBlocked(plan: CaseDeletePlan): string | undefined {
  if (plan.unlisted.length) return `Not every list could be read (${[...new Set(plan.unlisted.map((u) => PART_LABEL[u.part]))].join(", ")}), so something that belongs to the case could be missed. Nothing is deleted.`;
  if (!plan.items.length) return "Nothing to delete.";
  return undefined;
}

/** The session's lists the finder needs, read where not cached (once, CONSOLE_IN_FLIGHT at a time; a read in flight
 *  is waited for); returns the flows read now. */
async function ensureLists(session: ConsoleSession): Promise<FlowKey[]> {
  const todo = CASE_FLOWS.filter((f) => {
    const s = session.list(f);
    return !s.rows || s.loading;
  });
  await pool(todo, CONSOLE_IN_FLIGHT, (f) => session.refresh(f));
  return todo;
}

/** Per session: the rows read in full by the finder (an item that has no link field at all is not read again). */
const FILLED = new WeakMap<ConsoleSession, Set<string>>();

/** Process rows without their link field, read in full once a session (they replace their rows); the failure text. */
async function fillRows(session: ConsoleSession, flow: ProcessKey): Promise<string | undefined> {
  const field = LINK_FIELD[flow]!;
  let done = FILLED.get(session);
  if (!done) FILLED.set(session, (done = new Set()));
  const filled = done;
  const sparse = (session.list(flow).rows ?? []).filter((r) => !(field in r) && !filled.has(r._id));
  let failed = 0;
  let why: string | undefined;
  await pool(sparse, CONSOLE_IN_FLIGHT, async (r) => {
    try {
      session.putRow(flow, await session.client.adminGet(flow, r._id));
      filled.add(r._id);
    } catch (e) {
      if (isNotFound(errorText(e))) session.removeRow(flow, r._id); // deleted meanwhile
      else {
        failed++;
        why ??= errorText(e);
      }
    }
  });
  return failed ? `${failed} item${failed === 1 ? "" : "s"} could not be read to see their case: ${why}` : undefined;
}

/** What belongs to each case, from the session's lists (and the supplier portal); nothing is deleted here. */
export async function planCaseDeletes(session: ConsoleSession, cases: CaseToDelete[]): Promise<CaseDeletePlan> {
  const client = session.client;
  const read = await ensureLists(session);
  const unlisted: CaseDeletePlan["unlisted"] = [];
  for (const f of CASE_FLOWS) {
    const s = session.list(f);
    if (!s.rows) unlisted.push({ part: f as PartKey, error: s.error ?? "The list could not be read." });
  }
  for (const f of ["case", "review", "op"] as const) {
    if (!session.list(f).rows) continue;
    const why = await fillRows(session, f);
    if (why) unlisted.push({ part: f, error: why });
  }
  if (unlisted.length) return { cases: [], items: [], unlisted, read };

  const rows = Object.fromEntries(APP_PARTS.map((p) => [p, session.list(p).rows ?? []])) as Record<AppPart, RawItem[]>;
  const listed = session.list("case").rows ?? [];
  const going = new Set(cases.map((c) => c.id));
  const existing = new Set(listed.map((c) => c._id).filter((id) => !going.has(id)));
  const allOps = new Map(rows.op.map((o) => [o._id, o]));
  const claimed = new Set<string>();
  const free = (x: PlanItem) => !claimed.has(keyOf(x));
  let portalError: string | undefined;
  const plans: CasePlan[] = [];

  for (const c of cases) {
    const row = c.item ?? listed.find((x) => x._id === c.id);
    const target: CaseTarget = { id: c.id, code: c.code || str(row, "Case_Code") };
    const sharedCode = target.code ? listed.filter((x) => x._id !== c.id && existing.has(x._id) && str(x, "Case_Code") === target.code).map((x) => x._id) : [];
    const codeOk = !!target.code && !sharedCode.length;
    const app = appItemsOf(rows, target, existing, codeOk).filter(free);
    const opRows = app.filter((x) => x.part === "op").map((x) => allOps.get(x.id)!);
    const opIds = new Set(opRows.map((o) => o._id));
    let queryIds = uniq(opRows.map((o) => str(o, "Portal_Query_Item_Id")));
    let requestId = str(row, "Portal_Request_Item_Id");

    let portalItems: PlanItem[] = [];
    let portal: CasePlan["portal"];
    if (!portalError) {
      try {
        const requests = await readPortal(client, "portalRequest", [target.id, target.code], requestId ? [requestId] : []);
        // no code and no open point: nothing to search for (empty texts would read every query)
        const texts = target.code ? [target.code] : [...opIds];
        const queries = await readPortal(client, "portalQuery", texts.length ? texts : [""], queryIds);
        portalItems = portalItemsOf(requests, queries, target, { existing, codeOk, requestId, queryIds, opIds, allOps }).filter(free);
      } catch (e) {
        portalError = errorText(e);
      }
    }
    if (portalError) {
      // the portal items the app's own links name, to delete in the portal's admin console: an open point's row (or the
      // case's) without the link field is read in full for it
      const sparse = opRows.filter((o) => !("Portal_Query_Item_Id" in o));
      const full = await pool(sparse, CONSOLE_IN_FLIGHT, (o) => client.adminGet("op", o._id).catch(() => undefined));
      for (const o of full) if (o) session.putRow("op", o);
      queryIds = uniq([...queryIds, ...full.map((o) => str(o, "Portal_Query_Item_Id"))]);
      if (!requestId && row && !("Portal_Request_Item_Id" in row)) requestId = str(await client.adminGet("case", c.id).catch(() => undefined), "Portal_Request_Item_Id");
      portal = { error: portalError, remain: portalRemainOf(queryIds, requestId).filter(free) };
    }
    const own = row ? item("case", row, "the case itself") : { part: "case" as const, id: c.id, key: target.code || c.id, by: "the case itself" };
    const items = [...app, ...portalItems, own].sort(byDeleteOrder);
    for (const x of [...items, ...(portal?.remain ?? [])]) claimed.add(keyOf(x));
    plans.push({ target, caseState: "exists", items, unlisted: [], ...(portal ? { portal } : {}), sharedCode });
  }
  return { cases: plans, items: plans.flatMap((p) => p.items), unlisted: [], ...(portalError ? { portalError } : {}), read };
}

// ---------------------------------------------------------------------------------------------------- the run

export interface CaseRunProgress {
  /** Items done in this run (deleted, or found gone). */
  done: number;
  /** Items given to this run. */
  total: number;
  /** The item being deleted now. */
  current: PlanItem;
}
export interface CaseRun {
  /** The pause between two deletes (default RUN_GAP_MS). */
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Asked before each delete: true ends the run there. */
  stop?: () => boolean;
  onStep?: (p: CaseRunProgress) => void;
  /** Each item Kissflow deleted (or answered "not found" for): it leaves the session's lists at once. */
  onDeleted?: (x: PlanItem) => void;
}
export interface CaseRunResult {
  /** Deleted, or already gone, in order. */
  done: PlanItem[];
  /** Of `done`, those Kissflow answered "not found" for (already gone). */
  gone: PlanItem[];
  /** Where the run stopped, and why. */
  failed?: { item: PlanItem; why: string };
  /** Kissflow still answered 429 after the client's backoff: the run paused here (RATE_LIMITED). */
  paused?: string;
  /** The user stopped the run. */
  stopped?: boolean;
  /** Not deleted, to run again (the failed or paused one first); the portal's items left are not in it. */
  remaining: PlanItem[];
  /** Portal items not deleted because the portal refused (to delete in the portal's admin console). */
  portalLeft: PlanItem[];
  /** The portal's refusal. */
  portalError?: string;
}

/** ONE call for the item: the portal's admin delete, the app's admin delete (a process item) or the form row's delete. */
async function sendDelete(client: AppClient, x: PlanItem): Promise<void> {
  if (isPortal(x.part)) return need(client.portalDelete?.bind(client), "Deleting in the supplier portal")(PORTAL_FLOW[x.part], x.id);
  const proc = APP_PROCESS[x.part];
  if (proc) return need(client.adminDelete?.bind(client), "The admin delete")(proc, x.id);
  return need(client.formDelete?.bind(client), "Deleting a row")(APP_FORM[x.part]!, x.id);
}

/** Deletes the items strictly one at a time in the order given, `gapMs` apart, without read-backs (see the header). */
export async function runCaseDeletes(client: AppClient, items: PlanItem[], run: CaseRun = {}): Promise<CaseRunResult> {
  const gap = run.gapMs ?? RUN_GAP_MS;
  const sleep = run.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: CaseRunResult = { done: [], gone: [], remaining: [], portalLeft: [] };
  /** The run ends at item i: what is left goes to `remaining`, its portal items to `portalLeft` once the portal refused. */
  const end = (i: number) => {
    for (const x of items.slice(i)) (out.portalError && isPortal(x.part) ? out.portalLeft : out.remaining).push(x);
    return out;
  };
  let sent = 0;
  for (const [i, x] of items.entries()) {
    if (out.portalError && isPortal(x.part)) {
      out.portalLeft.push(x); // the portal refused: not tried again
      continue;
    }
    if (run.stop?.()) return (out.stopped = true), end(i);
    if (sent > 0 && gap > 0) {
      await sleep(gap);
      if (run.stop?.()) return (out.stopped = true), end(i);
    }
    run.onStep?.({ done: out.done.length, total: items.length, current: x });
    sent++;
    try {
      await sendDelete(client, x);
      out.done.push(x);
      run.onDeleted?.(x);
    } catch (e) {
      if (e instanceof RateLimitError) return (out.paused = e.message), end(i);
      const why = errorText(e);
      if (isNotFound(why)) {
        out.done.push(x);
        out.gone.push(x);
        run.onDeleted?.(x);
      } else if (isPortal(x.part)) {
        out.portalError = why;
        out.portalLeft.push(x);
      } else {
        out.failed = { item: x, why };
        return end(i);
      }
    }
  }
  return out;
}
