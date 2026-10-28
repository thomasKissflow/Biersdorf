// The "no corruption" fingerprint (SPEC §3, §4 S-INTEGRITY): `_modified_at` of every item the key can read that is NOT
// in this run's ledger, taken at the run's start and end; diff() lists what changed, appeared or went missing. Forms are
// read by their list (rows carry `_modified_at`); process items are found through My items and each read by an admin
// GET (the stamp as the item holds it), in both apps. Every read goes through the guarded client and the queue. A read
// that fails is recorded (the print is then partial for that flow) unless it is a StopError, which ends the run.
// Note: the portal session runs its own ZZT tests on the same key, so a changed item may be theirs: diff() names flow
// and id, and S-INTEGRITY decides.
import { APP_ID, FLOWS } from "@/app-live/ids";
import type { FormKey, ProcessKey } from "@/app-live/types";
import { errorText } from "@/portal/kf/sdk";
import { PORTAL_ID, FLOWS as PORTAL_FLOWS } from "@/portal/kf/portal";
import { str, type RawItem } from "@/portal/data/raw";
import type { Ledger } from "./ledger";
import type { LiveAppClient } from "./liveClient";
import type { LivePortalClient } from "./livePortalClient";
import { StopError } from "./queue";

export interface Print {
  app: string;
  flow: string;
  id: string;
  modifiedAt: string;
}
export interface Fingerprint {
  at: string;
  prints: Print[];
  /** Flows whose read failed, with Kissflow's answer. */
  errors: { flow: string; error: string }[];
}

export interface PrintOptions {
  forms?: FormKey[];
  processes?: ProcessKey[];
  portal?: ("request" | "query")[];
  /** Read each process item by an admin GET (default true); false: the My items row's stamp only. */
  adminGet?: boolean;
}

/** The flows the suites touch, by default. */
export const PRINT_DEFAULTS: Required<Omit<PrintOptions, "adminGet">> = {
  forms: ["audit", "note", "rmesSAF", "rmesREG", "supplier", "config", "scopeRun"],
  processes: ["case", "review", "op"],
  portal: ["request", "query"],
};

export async function fingerprint(src: { app: LiveAppClient; portal?: LivePortalClient }, ledger: Ledger, o: PrintOptions = {}): Promise<Fingerprint> {
  const prints: Print[] = [];
  const errors: { flow: string; error: string }[] = [];
  const mine = (id: string) => ledger.has(id);
  const add = (app: string, flow: string, it: RawItem) => prints.push({ app, flow, id: it._id, modifiedAt: str(it, "_modified_at") });
  const guarded = async (flow: string, read: () => Promise<void>) => {
    try {
      await read();
    } catch (e) {
      if (e instanceof StopError) throw e;
      errors.push({ flow, error: errorText(e) });
    }
  };
  for (const f of o.forms ?? PRINT_DEFAULTS.forms)
    await guarded(FLOWS[f].id, async () => {
      for (const r of await src.app.formList(f)) if (!mine(r._id)) add(APP_ID, FLOWS[f].id, r);
    });
  for (const f of o.processes ?? PRINT_DEFAULTS.processes)
    await guarded(FLOWS[f].id, async () => {
      for (const r of await src.app.myItems(f)) {
        if (mine(r._id)) continue;
        add(APP_ID, FLOWS[f].id, o.adminGet === false ? r : await src.app.adminGet(f, r._id));
      }
    });
  if (src.portal)
    for (const f of o.portal ?? PRINT_DEFAULTS.portal)
      await guarded(PORTAL_FLOWS[f].id, async () => {
        for (const r of await src.portal!.listMine(f)) {
          if (mine(r._id)) continue;
          add(PORTAL_ID, PORTAL_FLOWS[f].id, o.adminGet === false ? r : await src.portal!.adminGet(f, r._id));
        }
      });
  return { at: new Date().toISOString(), prints, errors };
}

export interface PrintDiff {
  changed: { app: string; flow: string; id: string; before: string; after: string }[];
  /** Present at the start, missing at the end. */
  removed: Print[];
  /** Missing at the start, present at the end (not in the ledger: someone else's new item). */
  added: Print[];
  same: number;
}

/** What changed between two prints; `exclude` (this run's ledger ids, known only at the end) is left out of both. */
export function diff(before: Fingerprint | Print[], after: Fingerprint | Print[], exclude: ReadonlySet<string> = new Set()): PrintDiff {
  const list = (x: Fingerprint | Print[]) => (Array.isArray(x) ? x : x.prints).filter((p) => !exclude.has(p.id));
  const a = new Map(list(before).map((p) => [`${p.flow}|${p.id}`, p]));
  const b = new Map(list(after).map((p) => [`${p.flow}|${p.id}`, p]));
  const out: PrintDiff = { changed: [], removed: [], added: [], same: 0 };
  for (const [k, p] of a) {
    const q = b.get(k);
    if (!q) out.removed.push(p);
    else if (q.modifiedAt !== p.modifiedAt) out.changed.push({ app: p.app, flow: p.flow, id: p.id, before: p.modifiedAt, after: q.modifiedAt });
    else out.same++;
  }
  for (const [k, q] of b) if (!a.has(k)) out.added.push(q);
  return out;
}
