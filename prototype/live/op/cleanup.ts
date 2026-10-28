// The end of an R2/R3 run of a suite (SPEC §3: R2 and R3 delete their own items after verification): every ledger item
// this suite added (the ledger lines since its start; another suite's items and the form drafts are left alone), newest
// first. A process item still in progress is withdrawn first, then deleted by the admin route, then read again: only a
// "not found" counts (world.ts cleanupRun's test); one already gone counts too. Portal items have no withdraw in the
// suite's client: the admin DELETE removes them at any step (SPEC §2). Each deleted item gets a "deleted" line in the
// ledger. A StopError ends the clean-up at once (the step is not-run; cleanup.mjs deletes the rest after the pause).
// Before it (and before the R1/R4 showcase), sweepLate adopts the portal items an integration created after the
// suite's poll for them gave up, so that neither the clean-up nor cleanup.mjs (both read only the ledger) leaves one
// behind.
import { FLOWS } from "@/app-live/ids";
import type { FlowKey, ProcessKey } from "@/app-live/types";
import { str, type RawItem } from "@/portal/data/raw";
import { FLOWS as PORTAL_FLOWS, type FlowKey as PortalFlowKey } from "@/portal/kf/portal";
import { errorText } from "@/portal/kf/sdk";
import type { LedgerEntry } from "../lib/ledger";
import { GuardError, KfError } from "../lib/liveClient";
import { StopError } from "../lib/queue";
import type { StepCtx } from "../lib/results";
import type { World } from "../lib/world";
import { stepName } from "./check";

const APP_FLOW = new Map(Object.entries(FLOWS).map(([k, f]) => [f.id as string, k as FlowKey]));
const PORTAL_FLOW = new Map(Object.entries(PORTAL_FLOWS).map(([k, f]) => [f.id as string, k as PortalFlowKey]));
const PROCESSES = new Set<FlowKey>(["case", "review", "op"]);

/** One more wait for a hand-off whose poll gave up (hooks.ts pollUntil's whole window). */
export const POLL_WINDOW_MS = 60_000;
/** The sweep reads at most this many unlinked portal items one by one. */
const SWEEP_READS = 20;
/** Clock skew allowed between this machine and Kissflow's _modified_at. */
const SKEW_MS = 5 * 60_000;

/** A read that says the item is gone (world.ts isGone): Kissflow's 404 "could not be located" (01015), the fakes'
 *  01015; after a delete that succeeded, any 404. Never a stop or a guard refusal. */
function isGone(e: unknown, afterDelete = false): boolean {
  // any 404: live (21 Oct) a deleted process item answers 404 with 050201, a form row 404 with 01015 (145 logged 404/050201
  // items never read 200 again); `afterDelete` is kept for the callers' wording
  void afterDelete;
  if (e instanceof KfError) return e.status === 404;
  return !(e instanceof StopError) && !(e instanceof GuardError) && /01015/.test(errorText(e));
}
/** A StopError goes on at once (the run stops); anything else is the step's evidence. */
function rethrowStop(e: unknown): void {
  if (e instanceof StopError) throw e;
}

/** This suite's ledger items (added since `before`), newest first, without the form drafts and deleted items. */
export function ownItems(w: World, before: ReadonlySet<string>): LedgerEntry[] {
  return w.ledger
    .latest()
    .filter((e) => !before.has(e.id) && e.stage !== "draft" && e.stage !== "deleted")
    .reverse();
}

/** What sweepLate and the clean-up would cost in calls (the time budget's reserve): the sweep reads each case and point
 *  and two My items lists; the clean-up reads, withdraws, deletes and reads a process item again, deletes and reads a
 *  portal item or form row. R1 (`keep`) reads each item once more for its stage instead. */
export function cleanupCalls(w: World, before: ReadonlySet<string>, keep: boolean): number {
  const own = ownItems(w, before);
  const per = (e: LedgerEntry) => {
    const app = APP_FLOW.get(e.flow);
    return keep ? 1 : app && PROCESSES.has(app) ? 4 : 2;
  };
  return own.filter((e) => e.flow === FLOWS.case.id || e.flow === FLOWS.op.id).length + 4 + own.reduce((n, e) => n + per(e), 0);
}

// ---------------------------------------------------------------------------------- the sweep

/** A hand-off whose poll gave up: its integration may still create the portal item for the app item `itemId` (I-1: the
 *  case's CIQP Request; op.round: the point's CIQP Query of a new round) after the suite stopped looking. */
export interface LateHandoff {
  code: "case.started" | "op.round";
  itemId: string;
}

/** The app item a portal item names (the integrations copy it). */
const NAMES = { request: "App_Case_Item_Id", query: "App_Open_Point_Id" } as const;

/**
 * The portal items the integrations created after the suite's poll for them gave up, adopted into the ledger (SPEC §1:
 * the ledger records an integration's item when the run reads its id back). A hand-off still pending gets one more poll
 * window first. Two routes, read only:
 * - each case and point of the suite names its item once it is linked (Portal_Request_Item_Id, Portal_Query_Item_Id);
 * - the portal's My items outside the ledger changed since the suite started (sparse rows, each read by an admin GET)
 *   that name a case or point of the suite (App_Case_Item_Id, App_Open_Point_Id): an item created but never linked.
 * An item is adopted only when its own read names one of the suite's cases or points. A failed read is evidence, not
 * thrown (the clean-up must still run); a StopError goes on.
 */
export async function sweepLate(w: World, s: StepCtx, before: ReadonlySet<string>, o: { since: number; late: readonly LateHandoff[] }): Promise<void> {
  if (o.late.length) {
    s.note("hand-offs whose poll gave up (one more poll window first)", o.late);
    await w.clock.sleep(POLL_WINDOW_MS);
  }
  const own = ownItems(w, before);
  const ids = (flowId: string) => new Set(own.filter((e) => e.flow === flowId).map((e) => e.id));
  /** The suite's app items each portal flow's items name. */
  const mine = { request: ids(FLOWS.case.id), query: ids(FLOWS.op.id) };
  const adopted: { flow: string; id: string; names: string; via: string; stage: string }[] = [];
  const errors: string[] = [];
  async function read<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      rethrowStop(e);
      if (!isGone(e)) errors.push(`${what}: ${errorText(e)}`);
      return undefined;
    }
  }
  /** Reads a portal item outside the ledger and adopts it when it names one of the suite's items. */
  async function take(pf: "request" | "query", id: string, via: string) {
    if (!id || w.ledger.has(id) || adopted.some((a) => a.id === id)) return;
    const it = await read(`${pf} ${id}`, () => w.portal.adminGet(pf, id));
    const names = str(it, NAMES[pf]);
    if (!it || !mine[pf].has(names)) return;
    const stage = stepName(it) || str(it, "_status");
    w.adopt(PORTAL_FLOWS[pf].id, id, `${str(it, pf === "request" ? "Case_Code" : "Query_Key")} ${pf} (S-OP, adopted by the clean-up sweep: created after its poll gave up)`, stage);
    adopted.push({ flow: PORTAL_FLOWS[pf].id, id, names, via, stage });
  }
  // 1. the links on the suite's own cases and points
  for (const [f, pf, field] of [["case", "request", "Portal_Request_Item_Id"], ["op", "query", "Portal_Query_Item_Id"]] as const)
    for (const id of mine[pf]) {
      const it = await read(`${f} ${id}`, () => w.client.adminGet(f, id));
      await take(pf, str(it, field), field);
    }
  // 2. My items changed since the suite started (outside a load the portal client lists every row: scope "all")
  for (const pf of ["request", "query"] as const) {
    const rows: RawItem[] = (await read(`${pf} My items`, () => w.portal.listMine(pf))) ?? [];
    const fresh = rows.filter((r) => !w.ledger.has(r._id) && !adopted.some((a) => a.id === r._id) && !(Date.parse(str(r, "_modified_at")) < o.since - SKEW_MS));
    s.note(`${pf}: My items outside the ledger changed since the suite started`, fresh.length);
    for (const r of fresh.slice(0, SWEEP_READS)) await take(pf, r._id, "My items");
    if (fresh.length > SWEEP_READS) errors.push(`${pf}: ${fresh.length - SWEEP_READS} more My items changed since the suite started were not read`);
  }
  s.readBack("portal items the sweep adopted (created after their poll gave up)", adopted);
  s.check("the sweep read every place a late item could be", !errors.length, errors);
  const open = o.late.filter((x) => !adopted.some((a) => a.names === x.itemId));
  s.check("every hand-off whose poll gave up has its portal item in the ledger now (else it may still come, outside the ledger)", !open.length, open);
}

// ---------------------------------------------------------------------------------- the clean-up

export async function deleteOwn(w: World, s: StepCtx, before: ReadonlySet<string>): Promise<void> {
  const out: Record<string, unknown>[] = [];
  try {
    for (const e of ownItems(w, before)) {
      const row = await deleteOne(w, e);
      const ok = row.gone === true || row.gone === "already gone";
      if (ok) w.adopt(e.flow, e.id, e.what, "deleted");
      out.push(row);
      s.check(`${e.flow} ${e.id} is deleted (read again: not found)`, ok, row.error ?? row.gone);
    }
  } finally {
    // a stop ends the step as not-run: what was deleted before it is still its evidence
    s.readBack("this suite's ledger items after the clean-up", out);
    s.note("deleted", out.filter((r) => r.gone === true).length);
  }
}

/** One ledger item: deleted and read again (gone: true), already gone before its delete, or why not (error). */
async function deleteOne(w: World, e: LedgerEntry): Promise<Record<string, unknown>> {
  const app = APP_FLOW.get(e.flow);
  const portal = PORTAL_FLOW.get(e.flow);
  const row: Record<string, unknown> = { flow: e.flow, id: e.id, what: e.what };
  const already = { ...row, gone: "already gone" };
  /** The read after a delete that succeeded: any 404 is gone. */
  const goneAfter = (read: Promise<unknown>) =>
    read.then(
      () => false,
      (x: unknown) => {
        if (isGone(x, true)) return true;
        throw x;
      },
    );
  try {
    if (app && PROCESSES.has(app)) {
      const f = app as ProcessKey;
      let it: RawItem;
      try {
        it = await w.client.adminGet(f, e.id);
      } catch (x) {
        if (isGone(x)) return already;
        throw x;
      }
      if (str(it, "_status") === "InProgress") {
        try {
          await w.client.withdraw(f, e.id, w.text("S-OP clean-up of this run's test items."));
          row.withdrawn = true;
        } catch (x) {
          rethrowStop(x);
          row.withdrawn = `refused: ${errorText(x)}`;
        }
      }
      await w.client.remove(f, e.id);
      row.gone = await goneAfter(w.client.adminGet(f, e.id));
    } else if (app || portal) {
      try {
        if (app) await w.client.remove(app, e.id);
        else await w.portal.adminDelete(portal!, e.id);
      } catch (x) {
        if (isGone(x)) return already;
        throw x;
      }
      row.gone = await goneAfter(app ? w.client.formGet(app as Exclude<FlowKey, ProcessKey>, e.id) : w.portal.adminGet(portal!, e.id));
    } else row.gone = "unknown flow: left alone";
  } catch (x) {
    rethrowStop(x);
    row.error = errorText(x);
    row.gone = false;
  }
  return row;
}
