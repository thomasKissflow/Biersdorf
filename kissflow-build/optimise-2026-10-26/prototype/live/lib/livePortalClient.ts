// The portal's PortalClient (src/portal/data/client.ts) over the same REST core, queue and guards as the app client
// (liveClient.ts), so the suites can run the portal's OWN writers (src/portal/data/liveActions.ts) as Thomas, the
// self contact (SPEC §1 "Fidelity"). Portal items are created by the integrations only: the suite writes (update,
// submit, admin PUT, delete) only items of this run's ledger, which the suites adopt when they read the ids back.
// My tasks is emulated as on the app side: My items ∪ this run's ledger ids of the flow, each read by an admin GET,
// kept when a _current_context entry at the step is assigned to Thomas or a portal role he holds. Files are not part
// of the live suite: uploadFile and previewFiles throw.
import type { PortalClient } from "@/portal/data/client";
import { PORTAL_ID, FLOWS, STEPS, type FlowKey } from "@/portal/kf/portal";
import type { KfData } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import { GuardError, adminRead, heldSteps, itemOf, listing, type Guard, type HookCode, type Holder, type ReadScope, type Rest, DEV_HOST } from "./liveClient";

export const NOT_IN_SUITE = (what: string) => `${what} is not in the live suite (no files are uploaded or previewed).`;

/** A PortalClient whose postWebhook may be told the hand-off code (the guard resolves it), plus oneRead. */
export interface LivePortalClient extends PortalClient {
  postWebhook(url: string, payload: unknown, code?: HookCode): Promise<void>;
  /** One load's reads, shared, in `scope` (liveClient.ts ReadScope; "run": this run's ledger items only). */
  oneRead<T>(fn: () => Promise<T>, o?: ReadScope): Promise<T>;
}

/** Activity id → step name of each portal process (portal.ts STEPS). */
export const PORTAL_STEPS: Partial<Record<FlowKey, Record<string, string>>> = {};
for (const s of Object.values(STEPS)) (PORTAL_STEPS[s.flow] ??= {})[s.activity] = s.name;

const enc = (s: string) => encodeURIComponent(s);

/** The PortalClient over REST (no flow-level guards: wrap it in guardPortal). */
export function restPortal(rest: Rest, holder: Holder): LivePortalClient {
  const acc = rest.acc;
  const q = `_application_id=${PORTAL_ID}`;
  const id = (f: FlowKey) => FLOWS[f].id;
  const update = async (f: FlowKey, itemId: string, act: string, data: KfData) => void (await rest.call("POST", `/process/2/${acc}/${id(f)}/${enc(itemId)}/${enc(act)}?${q}`, data));
  return {
    accountId: acc,
    // live suites stand for a portal UI inside the dev sandbox's Kissflow page (portal.ts parentHost)
    parentHost: DEV_HOST,
    listMine: (f) => rest.pages("GET", `/process/2/${acc}/${id(f)}/myitems?${q}`),
    async listTasks(f, activityId) {
      const out: RawItem[] = [];
      for (const it of await listing(rest, PORTAL_ID, id(f)))
        for (const h of heldSteps(it, PORTAL_STEPS[f] ?? {}, holder)) if (!activityId || h.activityId === activityId) out.push({ ...it, _activity_instance_id: h.act });
      return out;
    },
    async getFull(f, itemId, act) {
      if (!act) return null;
      const it = itemOf(await rest.call("GET", `/process/2/${acc}/${id(f)}/${enc(itemId)}/${enc(act)}?${q}`), itemId);
      return str(it, "_activity_instance_id") ? it : { ...it, _activity_instance_id: act };
    },
    update,
    submit: async (f, itemId, act) => void (await rest.call("POST", `/process/2/${acc}/${id(f)}/${enc(itemId)}/${enc(act)}/submit?${q}`, {})),
    async create() {
      throw new GuardError("portal items are created by the integrations only.");
    },
    async discard() {
      throw new GuardError("portal items are never discarded by the suite.");
    },
    async uploadFile() {
      throw new Error(NOT_IN_SUITE("Uploading a file"));
    },
    async postWebhook(url, payload, code) {
      const c = code ?? rest.guard.hookCode(url);
      if (!c) throw new GuardError("POST to a URL that is not one of the known hand-off webhooks.");
      await rest.webhook(url, payload, c);
    },
    async previewFiles() {
      throw new Error(NOT_IN_SUITE("Previewing a file"));
    },
    // without the SDK's form API: the child-table delta through the item update, as client.ts falls back to
    updateChildRow: (f, itemId, act, tableId, rowId, data) => update(f, itemId, act, { [`Table::${tableId}`]: [{ _id: rowId, ...data }] }),
    addChildRow: (f, itemId, act, tableId, row) => update(f, itemId, act, { [`Table::${tableId}`]: [{ _is_created: true, ...row }] }),
    // approximated like the app's admin list (no REST admin list)
    listAll: async (f) => (await listing(rest, PORTAL_ID, id(f))).filter((it) => str(it, "_status") !== "Draft"),
    adminGet: (f, itemId) => adminRead(rest, PORTAL_ID, id(f), itemId),
    adminUpdate: async (f, itemId, data) => void (await rest.call("PUT", `/process/2/${acc}/admin/${id(f)}/${enc(itemId)}?${q}`, data)),
    adminDelete: async (f, itemId) => void (await rest.call("DELETE", `/process/2/${acc}/admin/${id(f)}/${enc(itemId)}?${q}`)),
    formList: (f) => rest.pages("POST", `/form/2/${acc}/${id(f)}/list?${q}`),
    async formCreate() {
      throw new GuardError("portal forms are not written by the suite.");
    },
    async formUpdate() {
      throw new GuardError("portal forms are not written by the suite.");
    },
    async formDelete() {
      throw new GuardError("portal forms are not written by the suite.");
    },
    apiGet: (path) => rest.call("GET", path),
    oneRead: (fn, o) => rest.oneRead(fn, o),
  };
}

/** The flow-level guards in front of an inner portal client (REST live, the fake portal offline). */
export function guardPortal(inner: LivePortalClient, g: Guard): LivePortalClient {
  const ok = (f: FlowKey, itemId: string, what: string) => g.write(FLOWS[f].id, itemId, what);
  let scope: "all" | "run" = "all";
  const onlyRun = (rows: RawItem[]) => (scope === "run" ? rows.filter((r) => g.ledger.has(r._id)) : rows);
  return {
    ...inner,
    listTasks: async (f, activityId) => onlyRun(await inner.listTasks(f, activityId)),
    listMine: async (f) => onlyRun(await inner.listMine(f)),
    listAll: async (f) => onlyRun(await inner.listAll(f)),
    async oneRead(fn, o = {}) {
      const outer = scope;
      if (o.scope) scope = o.scope;
      try {
        return await inner.oneRead(fn, o);
      } finally {
        scope = outer;
      }
    },
    async update(f, itemId, act, data) {
      ok(f, itemId, "update");
      return inner.update(f, itemId, act, data);
    },
    async submit(f, itemId, act) {
      ok(f, itemId, "submit");
      return inner.submit(f, itemId, act);
    },
    async create() {
      throw new GuardError("portal items are created by the integrations only.");
    },
    async discard() {
      throw new GuardError("portal items are never discarded by the suite.");
    },
    async postWebhook(url, payload) {
      return inner.postWebhook(url, payload, g.webhook(url, payload));
    },
    async updateChildRow(f, itemId, act, tableId, rowId, data) {
      ok(f, itemId, "updateChildRow");
      return inner.updateChildRow(f, itemId, act, tableId, rowId, data);
    },
    async addChildRow(f, itemId, act, tableId, row) {
      ok(f, itemId, "addChildRow");
      return inner.addChildRow(f, itemId, act, tableId, row);
    },
    async adminUpdate(f, itemId, data) {
      ok(f, itemId, "adminUpdate");
      return inner.adminUpdate(f, itemId, data);
    },
    async adminDelete(f, itemId) {
      ok(f, itemId, "adminDelete");
      return inner.adminDelete(f, itemId);
    },
    async formCreate() {
      throw new GuardError("portal forms are not written by the suite.");
    },
    async formUpdate() {
      throw new GuardError("portal forms are not written by the suite.");
    },
    async formDelete() {
      throw new GuardError("portal forms are not written by the suite.");
    },
  };
}

/** The live PortalClient: REST, the floor guards, the flow guards. */
export function createLivePortalClient(rest: Rest, holder: Holder): LivePortalClient {
  return guardPortal(restPortal(rest, holder), rest.guard);
}
