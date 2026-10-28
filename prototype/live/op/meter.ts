// How many Kissflow calls a step makes (the suite notes it per step; SPEC §1 pacing: 2.5 s each). Live: the queue's own
// history (every REST call and webhook POST). Offline the fakes bypass the queue, so the meter wraps the world's two
// clients and counts what the live clients (liveClient.ts, livePortalClient.ts) would send for each call: one per item
// read, write and POST; two for a form create (create + submit); one page per 50 form-list rows; and for the emulated
// admin list / My tasks (listing, scope "run") one admin GET per ledger item of the flow, once per load (oneRead) until
// a write ends the sharing. The live audit form is longer than the fixtures', so an offline load is a lower bound.
import { FLOWS } from "@/app-live/ids";
import { FLOWS as PORTAL_FLOWS } from "@/portal/kf/portal";
import type { LiveAppClient } from "../lib/liveClient";
import type { LivePortalClient } from "../lib/livePortalClient";
import type { World } from "../lib/world";

export interface Meter {
  /** Calls so far (live: made; offline: what live would make). */
  readonly calls: number;
}

const APP_WRITES = new Set(["create", "update", "submit", "discard", "formCreate", "formUpdate", "postWebhook", "adminPut", "withdraw", "remove"]);
const PORTAL_WRITES = new Set(["update", "submit", "postWebhook", "updateChildRow", "addChildRow", "adminUpdate", "adminDelete"]);
type Fn = (...a: unknown[]) => Promise<unknown>;

/** Installs the meter (offline: wraps w.client and w.portal; call it before the first boot). */
export function meter(w: World): Meter {
  if (w.live) return { get calls() { return w.queue.history.length; } };
  let n = 0;
  let depth = 0;
  const listed = new Set<string>();
  /** The emulated list of a flow: an admin GET per ledger item, shared within one load. */
  const listing = (flowId: string) => {
    if (depth && listed.has(flowId)) return;
    if (depth) listed.add(flowId);
    n += w.ledger.latest().filter((e) => e.flow === flowId).length;
  };
  const pages = (rows: unknown) => Math.max(1, Math.ceil((Array.isArray(rows) ? rows.length : 0) / 50));

  function wrap<C extends object>(c: C, cost: (m: string, args: unknown[], out: unknown) => void, writes: Set<string>): C {
    const out: Record<string, unknown> = { ...(c as Record<string, unknown>) };
    for (const [m, v] of Object.entries(c)) {
      if (typeof v !== "function") continue;
      const fn = v as Fn;
      out[m] =
        m === "oneRead"
          ? async (inner: () => Promise<unknown>, o?: unknown) => {
              if (depth++ === 0) listed.clear();
              try {
                return await fn(inner, o);
              } finally {
                depth--;
              }
            }
          : async (...args: unknown[]) => {
              if (writes.has(m)) listed.clear();
              const r = await fn(...args);
              cost(m, args, r);
              return r;
            };
    }
    return out as C;
  }

  w.client = wrap<LiveAppClient>(
    w.client,
    (m, args, r) => {
      if (m === "adminList" || m === "myTasks") listing(FLOWS[args[0] as keyof typeof FLOWS].id);
      else if (m === "formList" || m === "myItems") n += pages(r);
      else n += m === "formCreate" ? 2 : 1;
    },
    APP_WRITES,
  );
  w.portal = wrap<LivePortalClient>(
    w.portal,
    (m, args, r) => {
      if (m === "listTasks" || m === "listAll") listing(PORTAL_FLOWS[args[0] as keyof typeof PORTAL_FLOWS].id);
      else if (m === "formList" || m === "listMine") n += pages(r);
      else n += 1;
    },
    PORTAL_WRITES,
  );
  return {
    get calls() {
      return n;
    },
  };
}
