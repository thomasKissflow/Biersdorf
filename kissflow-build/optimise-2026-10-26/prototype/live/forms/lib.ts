// Helpers of S-FORMS (live/forms.live.ts), beside the suite (live/lib is the shared infrastructure):
// - suiteView: the world as the suite's loads see it. The supplier master is narrowed to the suite's own supplier: a run
//   can hold two suppliers whose contact is Thomas's portal user (S-CASE's and this one), and the domain registers ONE
//   self contact, on the first such row it reads (map/people.ts Directory.contact), so without it the self contact could
//   land on the other suite's supplier. Every client call is counted (the live-call estimate).
// - shown: the store's own step after a save that moved no step (api.ts enqueueJob → showSaved → load.ts withSaved →
//   viewOf): Kissflow's read-backs on the loaded data, nothing read again.
// - recodeSupplier: the domain's new supplier under a code that carries the run tag (domain addSupplier numbers it
//   s<n>, which neither carries the tag nor stays unique across suites), as createCase's forcedId does for a case.
// - the read-back comparisons (through the app's own encoders: what a row must hold is what the writer would write),
//   the audit row checks (every field the writer derives: auditRowData), one read of a ledger item by its flow, and the
//   cleanup of the suite's ledger items.
import { isDeepStrictEqual } from "node:util";
import { syncRegistry } from "@/domain/rules";
import type { AppState, InternalNote, Supplier, User } from "@/domain/types";
import { FLOWS, LIST, TABLES } from "@/app-live/ids";
import { viewOf, withSaved } from "@/app-live/load";
import type { Acting, AuditCode, FlowKey, FormKey, Identity, WriteCtx, WriteResult } from "@/app-live/types";
import { EVENT_CATEGORY } from "@/app-live/write/audit";
import { contactRow, countryCode, supplierFields } from "@/app-live/write/encode";
import { webhooksOf } from "@/app-live/write/handoff";
import { missingOf, sameValue } from "@/app-live/write/verify";
import type { HandoffCode } from "@/app-live/shared/handoff";
import { childRows, json, str, userIds, type RawItem } from "@/portal/data/raw";
import { FLOWS as PORTAL_FLOWS } from "@/portal/kf/portal";
import { errorText } from "@/portal/kf/sdk";
import type { LedgerEntry } from "../lib/ledger";
import { KfError } from "../lib/liveClient";
import { StopError } from "../lib/queue";
import type { Booted, World } from "../lib/world";

export const CONTACTS = TABLES.contacts;

// ---------------------------------------------------------------------------------- the suite's view and its calls

export type Tally = Map<string, number>;

/** `o` with every method call counted in `tally` by name. */
function counted<T extends object>(o: T, tally: Tally, prefix: string): T {
  return new Proxy(o, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r) as unknown;
      if (typeof v !== "function") return v;
      return (...a: unknown[]) => {
        tally.set(`${prefix}${String(k)}`, (tally.get(`${prefix}${String(k)}`) ?? 0) + 1);
        return (v as (...x: unknown[]) => unknown).apply(t, a);
      };
    },
  });
}

/** The world with the supplier master narrowed to the rows `keep` accepts, and both clients counted. */
export function suiteView(w: World, keep: (row: RawItem) => boolean, tally: Tally): World {
  const inner = w.client;
  const client = { ...inner, formList: async (f: FormKey) => (f === "supplier" ? (await inner.formList(f)).filter(keep) : inner.formList(f)) };
  return { ...w, client: counted(client, tally, ""), portal: counted(w.portal, tally, "portal.") };
}

/** Live REST calls per client call (scope "run" loads): a form create is a draft and its submit; the emulated admin
 *  list and My tasks cost nothing beyond the admin GETs the load makes anyway (shared within the load); a list is one
 *  page (more for a long form list); everything else one call. */
const WEIGHT: Record<string, number> = { formCreate: 2, adminList: 0, myTasks: 0, oneRead: 0, "portal.oneRead": 0, "portal.listTasks": 0, "portal.listAll": 0 };
export const liveCallsOf = (t: Tally): number => [...t].reduce((n, [k, c]) => n + (WEIGHT[k] ?? 1) * c, 0);
export const tallyDiff = (now: Tally, before: Tally): Record<string, number> => Object.fromEntries([...now].map(([k, n]) => [k, n - (before.get(k) ?? 0)]).filter(([, n]) => (n as number) > 0));

/** The store's showSaved: the job's read-backs (`saved`, `auditRow`) on the load, mapped as the screens show them. */
export function shown(w: World, b: Booted, r: WriteResult): Booted {
  const snap = withSaved(b.snap, r.saved ?? [], r.auditRow);
  const view = viewOf(snap, w.identity, b.acting);
  syncRegistry(view.mapped.state.config);
  const webhooks = webhooksOf(view.mapped.index.settings);
  const ctx: WriteCtx = { ...b.ctx(), index: view.mapped.index, webhooks };
  return { ...b, snap, mapped: view.mapped, state: view.mapped.state, drafts: view.drafts, warnings: view.warnings, webhooks, ctx: () => ctx };
}

/** The domain's new supplier `from` (s<n>) renamed `to`, with its contacts (u-<from>-<k> → u-<to>-<k>) and log lines. */
export function recodeSupplier(s: AppState, from: string, to: string): AppState {
  const pre = `u-${from}-`;
  const id = (x: string) => (x.startsWith(pre) ? `u-${to}-${x.slice(pre.length)}` : x);
  return {
    ...s,
    suppliers: s.suppliers.map((x) => (x.id === from ? { ...x, id: to, contactIds: x.contactIds.map(id) } : x)),
    users: s.users.map((u) => (u.supplierId === from ? { ...u, id: id(u.id), supplierId: to } : u)),
    log: s.log.map((e) => (e.supplierId === from ? { ...e, supplierId: to } : e)),
  };
}

// ---------------------------------------------------------------------------------- comparisons

/** An instant to the second: Kissflow stores DateTimes without milliseconds (kfDateTime drops them on the way in). */
export const instant = (iso: string | undefined) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(Math.floor(Date.parse(iso) / 1000) * 1000).toISOString() : iso);

/** A contact as the screens rely on it. */
export const contactKeys = (u: User | undefined) =>
  u && { id: u.id, name: u.name, email: u.email, title: u.title, supplierId: u.supplierId, mayConfirm: u.mayConfirm !== false, active: u.active !== false, deactivatedAt: instant(u.deactivatedAt) };

/** A supplier as the screens rely on it (the country as the live country code the writer stores). */
export const supplierKeys = (x: Supplier | undefined) =>
  x && { id: x.id, name: x.name, duns: x.duns, country: countryCode(x.country) || x.country, city: x.city, type: x.type, active: x.active !== false, contactIds: [...x.contactIds].sort() };

/** The supplier's header as the screens rely on it (supplierKeys without its contacts): no step of S-FORMS changes it. */
export const headerKeys = (x: Supplier | undefined) => {
  const k = supplierKeys(x);
  if (!k) return k;
  const { contactIds: _contacts, ...header } = k;
  return header;
};

export const contactsOfSupplier = (s: AppState, code: string) => s.users.filter((u) => u.side === "supplier" && u.supplierId === code).sort((a, b) => a.id.localeCompare(b.id));

/** The note as the screens rely on it (roundtrip.test.ts noteKeys). */
export const noteKeys = (n: InternalNote | undefined) =>
  n && { id: n.id, at: instant(n.at), by: n.by, dept: n.dept, text: n.text, sectionId: n.sectionId, mentions: n.mentions?.length ? n.mentions : undefined };

export const contactRowsOf = (item: RawItem | undefined) => childRows(item, CONTACTS, "Contacts_Email");

const RAW_CONTACT = ["_id", "Contacts_Key", "Contacts_Full_Name", "Contacts_Email", "Contacts_Title", "Contacts_Can_Confirm", "Contacts_Active", "Contacts_Deactivated_At", "Contacts_Portal_User_Id"];
/** The raw fields of a contact row that matter. */
export const rawContact = (r: Record<string, unknown> | undefined) => r && Object.fromEntries(RAW_CONTACT.filter((k) => r[k] !== undefined && r[k] !== "").map((k) => [k, r[k]]));

/** The row of a domain contact: the self contact by its portal user, any other by its key (Contacts_Key = its id). */
export function rowOfContact(item: RawItem | undefined, u: User, identity: Identity): Record<string, unknown> | undefined {
  const rows = contactRowsOf(item);
  return u.id.startsWith("self:") ? rows.find((r) => str(r, "Contacts_Portal_User_Id") === identity.kfUserId) : rows.find((r) => str(r, "Contacts_Key") === u.id);
}

/** The fields of `u`, as the app's own encoder writes a Contacts row, that the row does not hold (the self contact's
 *  key stays the row's own: no writer changes Contacts_Key). */
export function contactRowMisses(row: Record<string, unknown> | undefined, u: User): string[] {
  if (!row) return ["(no row)"];
  const want = contactRow(u);
  if (u.id.startsWith("self:")) delete want.Contacts_Key;
  return missingOf(want, row);
}

/** The supplier header fields the row does not hold (the app's encoder: supplierFields). */
export const supplierRowMisses = (item: RawItem | undefined, x: Supplier): string[] => (item ? missingOf(supplierFields(x), item) : ["(no row)"]);

/** Duplicates among a supplier's contact rows, by key and by e-mail. */
export function duplicateRows(item: RawItem | undefined): string[] {
  const out: string[] = [];
  for (const k of ["Contacts_Key", "Contacts_Email"]) {
    const seen = new Map<string, number>();
    for (const r of contactRowsOf(item)) {
      const v = str(r, k).toLowerCase();
      if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    for (const [v, n] of seen) if (n > 1) out.push(`${k} ${v} ×${n}`);
  }
  return out;
}

/** `v` with the identity's e-mail replaced (the results name it as "<identity e-mail>"). */
export function masked<T>(v: T, identity: Identity): T {
  const e = identity.email.trim();
  if (!e || v === undefined) return v;
  const re = new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return JSON.parse(JSON.stringify(v).replace(re, "<identity e-mail>")) as T;
}

// ---------------------------------------------------------------------------------- audit rows

/** What a writer's audit row must say (write/actions.ts, write/audit.ts auditRowData). */
export interface AuditWant {
  /** The row's `_id` (the writer's read-back). */
  id: string;
  code: AuditCode;
  what: string;
  acting: Acting;
  /** `state`: the Object_State the writer gives (case.created: the phase); none for the others. */
  object: { kind: string; key: string; itemId: string; state?: string };
  /** The details of the domain's new entries (the case's audit entries, then the supplier log's), in order: the
   *  snapshot keeps them and New_Value_Text joins them (auditRowData). */
  details: string[];
  /** `act`: the activity instance the row must name; `anyAct`: one it must name (a new item's Start step, whose
   *  instance only the writer saw). Neither: none. */
  ref: { flow: FlowKey; itemId: string; act?: string; anyAct?: boolean };
  caseCode?: string;
  caseItemId?: string;
  handoffs?: HandoffCode[];
}

export type Check = { label: string; ok: boolean; detail?: unknown };
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const KF_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:?\d{2})$/;
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** An instant as Event_Key's 14 digits (eventKey: yyyymmddHHMMss, UTC as kfDateTime writes it); "" for no instant. */
const keyDigits = (iso: string) => (Number.isFinite(Date.parse(iso)) ? new Date(Date.parse(iso)).toISOString().replace(/[-:TZ]/g, "").slice(0, 14) : "");

/** The checks of one audit row against what its writer must have written. */
export function auditChecks(row: RawItem | undefined, want: AuditWant, identity: Identity): Check[] {
  const p = `${want.what} (${want.code})`;
  if (!row) return [{ label: `${p}: the row reads back`, ok: false }];
  const eq = (label: string, got: unknown, exp: unknown): Check => ({ label: `${p}: ${label}`, ok: got === exp, ...(got === exp ? {} : { detail: { got, want: exp } }) });
  // EV-<case|LOG>-<Event_At's digits>-<rand4> (write/audit.ts eventKey)
  const key = new RegExp(`^EV-${escaped(want.caseCode ?? "LOG")}-(\\d{14})-[a-z0-9]{4}$`).exec(str(row, "Event_Key"));
  const newText = want.details.filter(Boolean).join("\n");
  const out: Check[] = [
    eq("Action_Code", str(row, "Action_Code"), want.code),
    eq("Event_Category", str(row, "Event_Category"), EVENT_CATEGORY[want.code]),
    { label: `${p}: Event_Key is EV-${want.caseCode ? "<case>" : "LOG"}-<Event_At>-<4>`, ok: !!key && key[1] === keyDigits(str(row, "Event_At")), detail: { Event_Key: str(row, "Event_Key"), Event_At: str(row, "Event_At") } },
    eq("Object_Kind", str(row, "Object_Kind"), want.object.kind),
    eq("Object_Key", str(row, "Object_Key"), want.object.key),
    eq("Object_Item_Id", str(row, "Object_Item_Id"), want.object.itemId),
    eq("Object_State", str(row, "Object_State"), want.object.state ?? ""),
    // a case row's cycle (a new case: 1; Kissflow may answer "1"); a row without a case has none
    ...(want.caseCode ? [{ label: `${p}: Cycle_No 1`, ok: sameValue(1, row.Cycle_No), detail: row.Cycle_No }] : []),
    { label: `${p}: New_Value_Text is the domain's entries`, ok: sameValue(newText, row.New_Value_Text), ...(sameValue(newText, row.New_Value_Text) ? {} : { detail: { got: row.New_Value_Text, want: newText } }) },
    eq("Ref_Flow_Id", str(row, "Ref_Flow_Id"), FLOWS[want.ref.flow].id),
    eq("Ref_Item_Id", str(row, "Ref_Item_Id"), want.ref.itemId),
    want.ref.anyAct ? { label: `${p}: Ref_Activity_Instance_Id`, ok: !!str(row, "Ref_Activity_Instance_Id") } : eq("Ref_Activity_Instance_Id", str(row, "Ref_Activity_Instance_Id"), want.ref.act ?? ""),
    eq("Case_Code", str(row, "Case_Code"), want.caseCode ?? ""),
    eq("Case_Item_Id", str(row, "Case_Item_Id"), want.caseItemId ?? ""),
    eq("Actor_Side", str(row, "Actor_Side"), LIST.actorSide),
    eq("Actor_Name", str(row, "Actor_Name"), identity.name),
    eq("Actor_Email is the identity's", str(row, "Actor_Email"), identity.email),
    eq("Actor_Role_Id", str(row, "Actor_Role_Id"), want.acting.roleId),
    eq("Actor_Dept", str(row, "Actor_Dept"), want.acting.dept ?? ""),
    // only where this read carries _created_by: the row the writer read back may not (live 21 Oct: the form GET does, and
    // names the key user)
    ...(userIds(row, "_created_by").length ? [eq("the creator is the key user", userIds(row, "_created_by")[0], identity.kfUserId)] : []),
  ];
  // the snapshot: JSON that parses, v1, the row's code, the domain's entries by the Kissflow user (never an alias)
  let snap: unknown;
  let parseError = "";
  try {
    snap = JSON.parse(str(row, "Snapshot_JSON"));
  } catch (e) {
    parseError = errorText(e);
  }
  out.push({ label: `${p}: Snapshot_JSON parses`, ok: isObj(snap), ...(parseError ? { detail: parseError } : {}) });
  if (isObj(snap)) {
    const entries = [...(Array.isArray(snap.audit) ? snap.audit : []), ...(Array.isArray(snap.log) ? snap.log : [])].filter(isObj);
    out.push(
      eq("snapshot v", snap.v, 1),
      eq("snapshot code", snap.code, want.code),
      { label: `${p}: snapshot audit and handoffs are lists`, ok: Array.isArray(snap.audit) && Array.isArray(snap.handoffs) },
      { label: `${p}: snapshot entries are the domain's`, ok: isDeepStrictEqual(entries.map((e) => e.detail), want.details), detail: { snapshot: entries.map((e) => e.detail), domain: want.details } },
      // the domain's own steps (a derived scope, the invitation) are "system"
      { label: `${p}: snapshot entries name the actor by the Kissflow id`, ok: entries.some((e) => e.by === identity.kfUserId) && entries.every((e) => e.by === identity.kfUserId || e.by === "system"), detail: entries.map((e) => e.by) },
    );
    if (want.code === "supplier.changed") out.push({ label: `${p}: snapshot log names the supplier`, ok: Array.isArray(snap.log) && snap.log.every((e) => isObj(e) && e.supplierId === want.object.key) });
    if (want.code === "case.created") out.push({ label: `${p}: snapshot case header`, ok: isObj(snap.case) && snap.case.itemId === want.object.itemId && snap.case.caseId === want.object.key });
    if (want.code === "note.added") out.push({ label: `${p}: snapshot note`, ok: isObj(snap.note) && snap.note.id === want.object.key });
  }
  const text = JSON.stringify(row);
  out.push(
    { label: `${p}: no "self:" id in the row`, ok: !text.includes("self:") },
    { label: `${p}: no persona alias in the snapshot`, ok: !/"u-(admin|auditor|owner)"/.test(str(row, "Snapshot_JSON")) },
  );
  // the hand-offs: by code and status, never a URL
  const recipients = json<unknown>(row, "Notify_Recipient", undefined);
  if (want.handoffs?.length) {
    const codes = Array.isArray(recipients) ? recipients.filter(isObj).map((h) => `${String(h.code)}:${String(h.status)}`) : [];
    out.push(
      eq("Notify_Channel", str(row, "Notify_Channel"), "webhook"),
      { label: `${p}: Notify_Recipient lists the hand-offs as sent`, ok: want.handoffs.every((c) => codes.includes(`${c}:sent`)), detail: codes },
      { label: `${p}: Notify_Recipient carries no URL`, ok: !/https?:\/\//i.test(str(row, "Notify_Recipient")) },
    );
  } else out.push({ label: `${p}: no hand-off on the row`, ok: !str(row, "Notify_Channel") && !str(row, "Notify_Recipient") });
  out.push({ label: `${p}: Event_At has no milliseconds`, ok: KF_DATETIME.test(str(row, "Event_At")) });
  return out;
}

/** The raw audit fields that matter, for the evidence. */
export const rawAudit = (row: RawItem | undefined) =>
  row &&
  Object.fromEntries(
    ["_id", "Event_Key", "Event_At", "Event_Category", "Action_Code", "Case_Code", "Case_Item_Id", "Object_Kind", "Object_Key", "Object_Item_Id", "Object_State", "Ref_Flow_Id", "Ref_Item_Id", "Ref_Activity_Instance_Id", "Actor_Side", "Actor_Name", "Actor_Dept", "Actor_Role_Id", "Notify_Channel", "Notify_Recipient"]
      .filter((k) => row[k] !== undefined && row[k] !== "")
      .map((k) => [k, row[k]]),
  );

// ---------------------------------------------------------------------------------- cleanup

const APP_FLOW = new Map<string, FlowKey>(Object.entries(FLOWS).map(([k, f]) => [f.id, k as FlowKey]));
const PORTAL_FLOW = new Map<string, "request" | "query">([[PORTAL_FLOWS.request.id, "request"], [PORTAL_FLOWS.query.id, "query"]]);

/** A read that says the item is gone: 404 (live), Kissflow's 01015 "could not be located" / the fake's "not found". */
export const isGone = (e: unknown): boolean => (e instanceof KfError && e.status === 404) || /01015|not found|could not be located/i.test(errorText(e));

/** One read of a ledger item by its flow: an app process by its admin GET, an app form row by its form GET (child
 *  tables included), a portal process by its admin GET. */
export function readItem(w: World, flow: string, id: string): Promise<RawItem> {
  const app = APP_FLOW.get(flow);
  const portal = PORTAL_FLOW.get(flow);
  if (app === "case" || app === "review" || app === "op") return w.client.adminGet(app, id);
  if (app) return w.client.formGet(app as FormKey, id);
  if (portal) return w.portal.adminGet(portal, id);
  return Promise.reject(new Error(`flow ${flow} is not one this suite reads`));
}

export interface Removed {
  flow: string;
  id: string;
  what: string;
  withdrawn?: string;
  deleted: boolean;
  gone: boolean;
  error?: string;
}

/** Deletes the given ledger items, newest first: a process item in progress is withdrawn first (its failure is noted,
 *  the admin DELETE removes it at any step), then deleted, then read again, which must answer "not found". */
export async function removeItems(w: World, entries: LedgerEntry[], comment: string): Promise<Removed[]> {
  const out: Removed[] = [];
  for (const e of [...entries].reverse()) {
    const r: Removed = { flow: e.flow, id: e.id, what: e.what, deleted: false, gone: false };
    const attempt = async (fn: () => Promise<unknown>): Promise<string | undefined> => {
      try {
        await fn();
        return undefined;
      } catch (x) {
        if (x instanceof StopError) throw x;
        return errorText(x);
      }
    };
    const app = APP_FLOW.get(e.flow);
    const portal = PORTAL_FLOW.get(e.flow);
    const read = () => readItem(w, e.flow, e.id);
    if (app === "case" || app === "review" || app === "op") {
      const flow = app;
      const it = await read().catch((x: unknown) => (x instanceof StopError ? Promise.reject(x) : undefined));
      if (it && str(it, "_status") === "InProgress") r.withdrawn = (await attempt(() => w.client.withdraw(flow, e.id, comment))) ?? "withdrawn";
      r.error = await attempt(() => w.client.remove(flow, e.id));
    } else if (app) {
      const flow = app as FormKey;
      r.error = await attempt(() => w.client.remove(flow, e.id));
    } else if (portal) {
      r.error = await attempt(() => w.portal.adminDelete(portal, e.id));
    } else {
      r.error = `flow ${e.flow} is not one this suite deletes`;
      out.push(r);
      continue;
    }
    r.deleted = !r.error;
    try {
      await read();
    } catch (x) {
      if (x instanceof StopError) throw x;
      r.gone = isGone(x);
      if (!r.gone) r.error = [r.error, `read after the delete: ${errorText(x)}`].filter(Boolean).join("; ");
    }
    out.push(r);
  }
  return out;
}
