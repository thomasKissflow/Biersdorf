// How many Kissflow calls a step makes: live, the queue's own history (every REST call and webhook POST); offline, an
// estimate, because the fakes answer without the queue. The estimate prices each client call the suite makes as the
// live clients would send it (live/lib/liveClient.ts restApp, livePortalClient.ts restPortal): a form create is two
// calls (draft, submit); inside one load (oneRead) a flow's listing is the admin GET of each of its ledger items (scope
// "run"), shared with My tasks and later admin GETs of the same items; every other call is one (a list page: one, so a
// long My items or form list costs more live). The integrations' own calls are not counted (they run in Kissflow).
import type { FlowKey as PortalFlowKey } from "@/portal/kf/portal";
import { FLOWS as PORTAL_FLOWS } from "@/portal/kf/portal";
import { FLOWS } from "@/app-live/ids";
import type { FlowKey } from "@/app-live/types";
import type { World } from "../lib/world";

export interface Meter {
  /** Calls so far (live: made; offline: estimated). */
  count(): number;
  readonly estimated: boolean;
}

/** Installs the meter on the world's clients and hooks (offline: before the first boot, so every load is priced). */
export function meter(w: World): Meter {
  if (w.live) return { count: () => w.queue.history.length, estimated: false };
  let n = 0;
  let depth = 0;
  let memo: { listed: Set<string>; read: Set<string> } | undefined;
  const ledgerIds = (flowId: string) => w.ledger.latest().filter((e) => e.flow === flowId && e.stage !== "draft").map((e) => e.id);
  const listing = (key: string, flowId: string) => {
    if (memo?.listed.has(key)) return 0;
    const ids = ledgerIds(flowId);
    memo?.listed.add(key);
    for (const id of ids) memo?.read.add(id);
    return ids.length + (memo ? 0 : 1); // outside a load: the My items page too
  };
  const single = (id: unknown) => {
    if (typeof id === "string" && memo?.read.has(id)) return 0;
    if (typeof id === "string") memo?.read.add(id);
    return 1;
  };
  const appPrice = (m: string, a: unknown[]) =>
    m === "adminList" || m === "myTasks" ? listing(`app|${String(a[0])}`, FLOWS[a[0] as FlowKey].id) : m === "adminGet" ? single(a[1]) : m === "formCreate" ? 2 : 1;
  const portalPrice = (m: string, a: unknown[]) =>
    m === "listTasks" || m === "listAll" ? listing(`portal|${String(a[0])}`, PORTAL_FLOWS[a[0] as PortalFlowKey].id) : m === "adminGet" ? single(a[1]) : 1;

  function wrap<T extends object>(o: T, price: (m: string, a: unknown[]) => number): T {
    const src = o as Record<string, unknown>;
    const out: Record<string, unknown> = { ...src };
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== "function") continue;
      const fn = v as (...a: unknown[]) => unknown;
      out[k] =
        k === "oneRead"
          ? async (...a: unknown[]) => {
              if (depth++ === 0) memo = { listed: new Set(), read: new Set() };
              try {
                return await fn(...a);
              } finally {
                if (--depth === 0) memo = undefined;
              }
            }
          : (...a: unknown[]) => {
              n += price(k, a);
              return fn(...a);
            };
    }
    return out as unknown as T;
  }
  w.client = wrap(w.client, appPrice);
  w.portal = wrap(w.portal, portalPrice);
  const post = w.hooks.post;
  w.hooks = { ...w.hooks, post: (code, payload) => ((n += 1), post(code, payload)) };
  return { count: () => n, estimated: true };
}
