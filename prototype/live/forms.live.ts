// S-FORMS (kissflow-build/ciq-digital/tests-2026-10-21/SPEC.md §4): the supplier master, an internal note, the audit row
// of every writer used, and the configuration's hand-off codes.
//   npx vitest run --config vitest.live.config.ts live/forms.live.ts                 offline (the fakes; RUN=R1…R4 rehearse)
//   LIVE=1 RUN=R1|R2|R3|R4 npx vitest run --config vitest.live.config.ts live/forms.live.ts
//   (KF_GAP_MS=8000 slows the pace: the run's timeout grows with it)
// Every write goes the store's way (world.ts perform: the domain action, its refusal, liveGuard, the app's own writer)
// and every step is checked on a read-back: the raw Kissflow fields that matter and the same item as the app maps it,
// against the domain object the action produced (as map/roundtrip.test.ts). A save that moved no step is shown from
// its read-backs, as the store does (forms/lib.ts shown); a step move, or a write that is not the app's, is read again
// (boot, scope "run"). The loads see only this suite's supplier (forms/lib.ts suiteView).
// Each supplier step's action runs on the state the previous read-back showed, and its read-back is checked against
// that action's result (the contacts) and against the supplier F2 made (the header, which no step changes): a change
// Kissflow makes beside the write fails the step it happens in, instead of being carried on into the next expectation.
//   F1  config: SET:current carries the 8 app hand-off codes (read only; codes, never URLs)
//   F2  supplier: a run supplier with three contacts (addSupplier, as the Business administrator)
//   F3  supplier: a contact's e-mail (updateContact)
//   F4  supplier: a contact added (addContact): one row, also after the settle
//   F5  supplier: a contact deactivated (setContactActive)
//   F6  supplier: the third contact gets Thomas's portal user (portal user management, NOT the app: no app writer sets
//       Contacts_Portal_User_Id; one field, by the row's _id), so it becomes the self contact
//   F7  supplier: the self contact's e-mail (the identity's) and title, as the Business administrator: no "already used"
//   F8  supplier: every contact row on a fresh form GET and a fresh load
//   F8b supplier (not R1, R4): a contact added once the self contact exists: a key of its own (see below)
//   F9  case: a run case for the note (createCase as RMM); I-1's CIQP Request goes in the ledger the moment the case
//       names it, and is this suite's (kept or deleted with it) only once it reads back naming the case
//   F10 note: an internal note (a department per run), read back
//   F11 audit: every writer's row (every field auditRowData derives, Snapshot_JSON, the actor, no "self:", hand-offs
//       without URLs), and its entries as the app shows them
//   F12a R1, R4: the self contact's fictional e-mail back (updateContact) and Thomas's portal user unlinked (simulated,
//       as F6): Thomas's own dev load registers ONE self contact, on the first supplier row it reads that carries his
//       portal user (map/people.ts Directory.contact), so a kept supplier with the link would take it from his own
//   F12 R1, R4: every kept item read again and the stage it is left at, in the ledger (the showcase); other runs: the
//       suite's items deleted. Both first read the case again when F9 took no request (a late link-back), and name
//       whatever the ledger misses. F12 (with F12a) also runs from afterAll when the run ends before it. R4 (21 Oct
//       evening, its own data: forms/data.ts) keeps its items like R1; its process items' stages also name what F9
//       proved on them (R1's name what they are).
// F4 runs before F6 (a clean add, for the settle). F8b then adds a contact AFTER another got its portal user: the
// domain's contactUser takes the first free u-<code>-<n>, which is the self contact's own key (its row keeps it but maps
// to self:<id>), so the app writes a second row under it. That step is recorded as fail with the app's answer, and does
// not fail the vitest run while the defect shows (KNOWN_APP_BUG; src/ is not the suite's to change).
// A step whose dependency did not pass is not-run; a StopError ends the suite at once (the recorder has saved).
import { isDeepStrictEqual } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import * as M from "@/domain/suppliers";
import type { AppState, CiqCase, Supplier, User } from "@/domain/types";
import { FLOWS, LIST, STEPS, STEP_NAMES } from "@/app-live/ids";
import { selfContactId } from "@/app-live/map/people";
import type { FlowKey, WriteResult } from "@/app-live/types";
import { newEntries, newLog } from "@/app-live/write/audit";
import { noteFields } from "@/app-live/write/encode";
import { caseRefOf } from "@/app-live/write/guards";
import { webhooksOf } from "@/app-live/write/handoff";
import { ROW_SETTLE_MS, missingOf } from "@/app-live/write/verify";
import { json, str, userIds, type RawItem } from "@/portal/data/raw";
import { FLOWS as PORTAL_FLOWS } from "@/portal/kf/portal";
import { errorText } from "@/portal/kf/sdk";
import { formsData, keepsItems, type Who } from "./forms/data";
import {
  CONTACTS,
  auditChecks,
  contactKeys,
  contactRowMisses,
  contactRowsOf,
  contactsOfSupplier,
  duplicateRows,
  headerKeys,
  instant,
  liveCallsOf,
  masked,
  noteKeys,
  rawAudit,
  rawContact,
  readItem,
  recodeSupplier,
  removeItems,
  rowOfContact,
  shown,
  suiteView,
  supplierKeys,
  supplierRowMisses,
  tallyDiff,
  type AuditWant,
  type Check,
  type Tally,
} from "./forms/lib";
import { APP_HOOK_CODES } from "./lib/hooks";
import type { LedgerEntry } from "./lib/ledger";
import { GAP_MS, StopError } from "./lib/queue";
import type { StepCtx } from "./lib/results";
import { RUN, boot, createWorld, perform, type Booted, type Performed } from "./lib/world";

const SUITE = "S-FORMS";
const SCOPE = { scope: "run" } as const;
/** The showcase in the names of F12a and F12 (R1's as they were; R4's its own). */
const SHOW = RUN === "R4" ? "R4" : "R1";
/** The run's timeout: room for 300 calls (one ≈ the gap + 1.5 s) and 10 minutes of polls and settles, never less than
 *  the config's 20 minutes. Live, each of the run's six loads also reads every process item of the run's ledger: R3
 *  made 132 calls in 14.5 minutes; R4 run after S-CASE and S-OP ≈270 (KF_GAP_MS=8000: ≈58 minutes allowed). */
const TIMEOUT_MS = Math.max(20 * 60_000, 300 * (GAP_MS + 1500) + 10 * 60_000);
const F = {
  config: "F1 config: SET:current carries the 8 app hand-off codes (read only)",
  add: "F2 supplier: add a run supplier with three contacts (addSupplier)",
  email: "F3 supplier: edit a contact's e-mail (updateContact)",
  contact: "F4 supplier: add a contact, one row also after the settle (addContact)",
  off: "F5 supplier: deactivate a contact (setContactActive)",
  link: "F6 supplier: link Thomas's portal user to a contact (portal user management, simulated)",
  self: "F7 supplier: the self contact's e-mail and title as the Business administrator (no 'already used' refusal)",
  rows: "F8 supplier: every contact row on the form GET and a fresh load",
  reuse: "F8b supplier: add a contact once the self contact exists, under a key of its own (addContact)",
  kase: "F9 case: a run case for the note (createCase as RMM; I-1's request adopted)",
  note: "F10 internal note: add it and read it back (addInternalNote)",
  audit: "F11 audit: every writer's audit row",
  unlink: `F12a supplier (${SHOW}): the self contact's fictional e-mail back and Thomas's portal user unlinked`,
  showcase: `F12 showcase (${SHOW}): every kept item read again, the stage it is left at, in the ledger`,
  cleanup: "F12 cleanup: delete this suite's items (withdraw, DELETE, GET 404)",
} as const;

/** The note a step records when it fails on a known app defect: such a fail is reported, and does not fail the vitest
 *  run (only while that defect is what shows; any other failure does). */
const KNOWN_APP_BUG = "known app defect";
const KEY_REUSE =
  "src/domain/suppliers.ts contactUser takes the first free u-<supplier>-<n>; a contact linked to a portal user maps to self:<id> while its row keeps its key, so the next new contact gets that key and addContact writes a second row under it (Not saved, a duplicate Contacts_Key).";

/** R1, R4: the stage an item is left at. A process item's is its step as F12 reads it, with `text`; a form row's is `text`
 *  when it was verified (`ok`, else the pass of `step`), otherwise marked NOT verified. R4's process items (`proved`):
 *  their step as read, then what `step` proved on them when it passed, else NOT verified. */
interface Stage {
  text: string;
  process?: boolean;
  step?: string;
  ok?: boolean;
  proved?: string;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** The last read-back of `flow` a writer kept. */
const savedOf = (r: WriteResult, flow: FlowKey): RawItem | undefined => [...(r.saved ?? [])].reverse().find((x) => x.flow === flow)?.item;
const day = (iso: string | undefined) => iso?.slice(0, 10);
const short = (step: string | undefined) => step?.split(":")[0] ?? "its step";
/** A case as the screens rely on it (roundtrip.test.ts caseKeys, without the BDF answers). */
const caseKeys = (c: CiqCase | undefined) =>
  c && { id: c.id, materialName: c.materialName, inci: c.inci, materialNo: c.materialNo, supplierId: c.supplierId, manufacturer: c.manufacturer, ownerId: c.ownerId, priority: c.priority, templateVersion: c.templateVersion, ruleSetVersion: c.ruleSetVersion, phase: c.phase, supplierContactIds: c.supplierContactIds, markets: c.config.SF11, due: day(c.dueDate) };

/** The writer's result, or the step fails with the refusal or Kissflow's answer (the writer's whole toast text). */
function wrote(s: StepCtx, p: Performed, what: string): WriteResult {
  if (p.refused || !p.result) throw new Error(`${what} was refused before any write: ${p.refused ?? "no result"}`);
  const r = p.result;
  s.note("result", { ok: r.ok, ...(r.message ? { message: r.message } : {}), moved: r.moved, handoffs: r.handoffs.map((h) => `${h.code}:${h.status}`), warnings: r.warnings });
  if (!r.ok) throw new Error(`${what}: ${r.message ?? "not ok"}`);
  s.check(`${what}: no warnings`, r.warnings.length === 0, r.warnings);
  s.check(`${what}: its audit row was written and read back`, !!r.auditRow?._id);
  return r;
}

describe(`${SUITE}: supplier master, internal note, audit rows, configuration`, () => {
  /** F12 (with F12a), set up by the run: afterAll runs it when the run ended before it (a timeout, a throw outside a
   *  step), so R2/R3 still delete their items and R1 still unlinks; it runs once. */
  let teardown: (() => Promise<void>) | undefined;
  afterAll(async () => {
    await teardown?.();
  });

  it(`run ${RUN}`, async () => {
    const w = await createWorld();
    const rec = w.recorder(SUITE);
    const d = formsData(w);
    const tally: Tally = new Map();
    const v = suiteView(w, (r) => str(r, "Supplier_Code") === d.supplierCode, tally);
    const ledgerFrom = w.ledger.byRun().length;
    /** R1 and R4, the showcases, keep their items; every other run deletes them. */
    const keeps = keepsItems(w.run);
    const passed = new Set<string>();
    const audits: AuditWant[] = [];
    const stages = new Map<string, Stage>();
    /** What the run leaves that the ledger misses or this suite does not own (F12 names it; the morning list must). */
    const leftovers: Record<string, unknown>[] = [];

    // the state the steps hand on
    let b: Booted | undefined; // the Business administrator's load (as the store shows it)
    let next: AppState | undefined; // the domain's state after the last supplier action
    let supWant: Supplier | undefined; // the supplier F2 made: its header holds for every step
    let supItem = "";
    const ids: Partial<Record<Who, string>> = {};
    let selfKey = ""; // the third contact's own key (its domain id), which its row keeps as the self contact
    let caseItem = "";
    let startedSent = false; // case.started went out: I-1 owes a request
    let rid = ""; // I-1's request, once it read back naming the case
    const foreign = new Set<string>(); // requests the case linked that read back naming another case
    let last: Booted | undefined; // the latest load that holds every audit row so far

    let ending: Promise<void> | undefined;
    teardown = () => (ending ??= keeps ? unlink().then(showcase) : cleanup());

    async function step(name: string, deps: string[], fn: (s: StepCtx) => Promise<void>): Promise<void> {
      const missing = deps.filter((x) => !passed.has(x));
      if (missing.length) {
        rec.notRun(name, `needs ${missing.map((x) => x.split(":")[0]).join(", ")}, which did not pass`);
        return;
      }
      const before = new Map(tally);
      const log0 = w.log.entries.length;
      const r = await rec.step(name, async (raw) => {
        // the identity's e-mail never lands in the results
        const s: StepCtx = { ...raw, readBack: (k, x) => raw.readBack(k, masked(x, w.identity)), check: (l, ok, x) => raw.check(l, ok, masked(x, w.identity)), note: (k, x) => raw.note(k, masked(x, w.identity)) };
        try {
          await fn(s);
        } finally {
          const used = tallyDiff(tally, before);
          raw.note("calls", { client: used, ...(w.live ? { rest: w.log.entries.length - log0 } : { liveEstimate: liveCallsOf(new Map(Object.entries(used))) }) });
        }
      });
      if (r.status === "pass") passed.add(name);
    }
    const admin = (): Booted => {
      if (!b) throw new Error("no Business administrator load");
      return b;
    };
    const contactOf = (who: Who) => next!.users.find((u) => u.id === ids[who]);
    const supplierIn = (st: AppState | undefined) => st?.suppliers.find((x) => x.id === d.supplierCode);

    /** An audit row to check (in F11, or in its own step after F11), with its showcase stage. */
    function wantAudit(a: AuditWant): AuditWant {
      audits.push(a);
      stages.set(a.id, { text: `audit row ${a.code} (${a.what})`, step: F.audit });
      return a;
    }
    /** What the supplier writers' audit row must say: the domain's new log entries between `prev` and `after`. */
    const supplierAudit = (r: WriteResult, what: string, prev: AppState, after: AppState): AuditWant => ({
      id: r.auditRow!._id,
      code: "supplier.changed",
      what,
      acting: admin().acting,
      object: { kind: "Supplier", key: d.supplierCode, itemId: supItem },
      ref: { flow: "supplier", itemId: supItem },
      details: newLog(prev, after).map((e) => e.detail),
    });

    /** The checks every supplier step makes on the row read back and the load as the store shows it. */
    function supplierRead(s: StepCtx, item: RawItem | undefined, rows: number) {
      const shownState = admin().state;
      const mapped = supplierIn(shownState);
      s.readBack("CIQ Supplier row (raw: Contacts rows)", { _id: item?._id, rows: contactRowsOf(item).map(rawContact) });
      s.readBack("the supplier's contacts as the app maps them", contactsOfSupplier(shownState, d.supplierCode).map(contactKeys));
      s.check(`${rows} contact rows`, contactRowsOf(item).length === rows, contactRowsOf(item).length);
      s.check("no duplicate contact row", duplicateRows(item).length === 0, duplicateRows(item));
      s.check("the mapped contacts are the domain's", isDeepStrictEqual(contactsOfSupplier(shownState, d.supplierCode).map(contactKeys), contactsOfSupplier(next!, d.supplierCode).map(contactKeys)), {
        mapped: contactsOfSupplier(shownState, d.supplierCode).map(contactKeys),
        domain: contactsOfSupplier(next!, d.supplierCode).map(contactKeys),
      });
      // the header: what F2 made, never what the previous read-back carried on
      s.check("the row's header holds the supplier F2 made", !supplierRowMisses(item, supWant!).length, supplierRowMisses(item, supWant!));
      s.check("the mapped header is the supplier F2 made", isDeepStrictEqual(headerKeys(mapped), headerKeys(supWant)), { mapped: headerKeys(mapped), want: headerKeys(supWant) });
      s.check("the mapped supplier lists the domain's contacts", isDeepStrictEqual(supplierKeys(mapped)?.contactIds, supplierKeys(supplierIn(next))?.contactIds), supplierKeys(mapped)?.contactIds);
      s.check("the writers' index knows every contact row", Object.keys(admin().mapped.index.suppliers.get(d.supplierCode)?.contactRows ?? {}).length === rows);
    }

    /** One audit row's checks (forms/lib.ts auditChecks) and that the app shows its snapshot's entries (supplier rows in
     *  the supplier's history, case rows in the case's); its showcase stage is verified when every check holds. */
    function checkAudit(s: StepCtx, view: Booted, a: AuditWant, row: RawItem | undefined) {
      const snap = json<{ audit?: { action: string; detail: string }[]; log?: { action: string; detail: string }[] }>(row, "Snapshot_JSON", {});
      const own = (a.code === "supplier.changed" ? snap.log : snap.audit) ?? [];
      const mapped =
        a.code === "supplier.changed"
          ? view.state.log.filter((e) => e.supplierId === d.supplierCode).map((e) => `${e.action}: ${e.detail}`)
          : (view.state.cases.find((c) => c.id === a.caseCode)?.audit ?? []).map((e) => `${e.action}: ${e.detail}`);
      s.readBack(`${a.what}: the entries as the app maps them`, own.map((e) => `${e.action}: ${e.detail}`).filter((e) => mapped.includes(e)));
      const checks: Check[] = [
        ...auditChecks(row, a, w.identity),
        { label: `${a.what}: every snapshot entry shows in the app (${a.code === "supplier.changed" ? "supplier history" : "case history"})`, ok: own.length > 0 && own.every((e) => mapped.includes(`${e.action}: ${e.detail}`)), detail: { snapshot: own.map((e) => e.action), mapped } },
      ];
      for (const c of checks) s.check(c.label, c.ok, c.detail);
      const st = stages.get(a.id);
      if (st) st.ok = checks.every((c) => c.ok);
    }

    /** I-1's request as the case links it: in the ledger at once (SPEC §1: the moment its id is known, before any
     *  further call), then read. It is this suite's (`rid`: kept or deleted with it) only when it names the case;
     *  otherwise it is marked so in the ledger and left alone (F12 names it). */
    async function takeRequest(s: StepCtx, id: string): Promise<RawItem | undefined> {
      const flow = PORTAL_FLOWS.request.id;
      w.adopt(flow, id, `Request_Key=${d.caseCode}|1 (I-1, S-FORMS note case)`, "linked from the S-FORMS case; not checked yet");
      let req: RawItem;
      try {
        req = await v.portal.adminGet("request", id);
      } catch (x) {
        if (x instanceof StopError) throw x;
        s.check("the linked request reads back", false, errorText(x));
        return undefined;
      }
      const names = { App_Case_Item_Id: str(req, "App_Case_Item_Id"), Case_Code: str(req, "Case_Code") };
      s.readBack("CIQP Request (raw: admin GET)", { _id: req._id, Request_Key: str(req, "Request_Key"), ...names, _current_step: str(req, "_current_step"), Assigned_Contacts: userIds(req, "Assigned_Contacts") });
      if (!s.check("the request names this case (only then it is this suite's)", names.App_Case_Item_Id === caseItem && names.Case_Code === d.caseCode, names)) {
        foreign.add(id);
        w.adopt(flow, id, `a request the S-FORMS case ${d.caseCode} links (I-1)`, `NOT S-FORMS': it names case ${names.Case_Code || "?"} (${names.App_Case_Item_Id || "?"}); left alone`);
        return undefined;
      }
      rid = id;
      stages.set(id, { text: "I-1's request of the S-FORMS note case", process: true, ...(d.proofs ? { step: F.kase, proved: "made by I-1, naming the case, assigned to the self contact" } : {}) });
      return req;
    }

    // ------------------------------------------------------------------------------------------------ F1 config

    await step(F.config, [], async (s) => {
      b = await boot(v, "admin", SCOPE);
      const settings = b.mapped.index.settings;
      // the row the app read its settings from (map/config.ts: the newest SET:current that is not a draft)
      const rows = b.snap.forms.config.filter((r) => str(r, "Config_Key") === "SET:current");
      const row = rows.find((r) => isDeepStrictEqual(json<unknown>(r, "Payload_JSON", undefined), settings));
      const payload = json<unknown>(row, "Payload_JSON", undefined);
      const hooks = isObj(payload) && isObj(payload.webhooks) ? payload.webhooks : {};
      const rawCodes = Object.keys(hooks).sort();
      const codes = Object.keys(webhooksOf(settings)).sort();
      s.readBack("CIQ Config Version SET:current (raw: the row and its webhook codes, never the URLs)", {
        _id: row?._id,
        Config_Key: str(row, "Config_Key"),
        Config_State: str(row, "Config_State"),
        rowsWithTheKey: rows.length,
        webhookCodes: rawCodes,
        httpsCodes: rawCodes.filter((c) => typeof hooks[c] === "string" && /^https:\/\//i.test(String(hooks[c]).trim())),
      });
      s.readBack("the app's settings → webhooksOf (codes)", codes);
      s.check("the app's settings come from a SET:current row whose Payload_JSON parses", !!row && isObj(payload), { rows: rows.length });
      const missing = APP_HOOK_CODES.filter((c) => !codes.includes(c));
      s.check("all 8 app hand-off codes carry an https URL", APP_HOOK_CODES.length === 8 && !missing.length, { missing });
      s.check("the suite's hook lookup has the same codes", isDeepStrictEqual([...v.hooks.codes().app].sort(), codes), v.hooks.codes().app);
      s.check("the load's write context carries them", isDeepStrictEqual(Object.keys(b.webhooks).sort(), codes));
    });

    // ------------------------------------------------------------------------------------------------ F2–F8b supplier

    await step(F.add, [], async (s) => {
      b ??= await boot(v, "admin", SCOPE); // F1's load, unless it failed
      const input = d.supplier;
      const prev = admin().state;
      const p = await perform(v, admin(), "addSupplier", [input], (st, by) => {
        const r = M.addSupplier(st, by, input);
        return r.id ? recodeSupplier(r.state, r.id, d.supplierCode) : r.state;
      });
      const r = wrote(s, p, "addSupplier");
      next = p.next;
      const sup = supplierIn(next);
      if (!sup) throw new Error(`the domain made no supplier ${d.supplierCode}`);
      supWant = sup;
      for (const who of ["a", "b", "s"] as const) ids[who] = next.users.find((u) => u.side === "supplier" && u.email === d.contacts[who].email)?.id;
      const item = savedOf(r, "supplier");
      supItem = item?._id ?? "";
      b = shown(v, admin(), r);
      s.note("ids", { supplierItem: supItem, contacts: ids });
      s.readBack("CIQ Supplier row (raw: header)", item && Object.fromEntries(["_id", "Supplier_Code", "Supplier_Legal_Name", "DUNS_Number", "Supplier_Kind", "Supplier_Country_Code", "Supplier_City", "Supplier_Active"].map((k) => [k, item[k]])));
      s.readBack("the supplier as the app maps it", supplierKeys(supplierIn(b.state)));
      s.check("the new row is in the ledger", !!supItem && w.ledger.has(supItem));
      s.check("the mapped supplier is the domain's", isDeepStrictEqual(supplierKeys(supplierIn(b.state)), supplierKeys(sup)));
      for (const who of ["a", "b", "s"] as const) {
        const u = contactOf(who)!;
        s.check(`the row of contact ${who} holds it`, !!u && !contactRowMisses(rowOfContact(item, u, w.identity), u).length, u && contactRowMisses(rowOfContact(item, u, w.identity), u));
      }
      supplierRead(s, item, 3);
      wantAudit(supplierAudit(r, "addSupplier", prev, p.next));
    });

    await step(F.email, [F.add], async (s) => {
      const who = d.emailEdit.who;
      const id = ids[who]!;
      const rowId = admin().mapped.index.suppliers.get(d.supplierCode)?.contactRows[id];
      const patch = { email: d.emailEdit.to };
      const prev = admin().state;
      const p = await perform(v, admin(), "updateContact", [id, patch], (st, by) => M.updateContact(st, by, id, patch));
      const r = wrote(s, p, "updateContact (e-mail)");
      next = p.next;
      b = shown(v, admin(), r);
      const item = savedOf(r, "supplier");
      const u = contactOf(who)!;
      const row = rowOfContact(item, u, w.identity);
      s.readBack(`contact ${who}'s row (raw)`, rawContact(row));
      s.check("the domain changed the e-mail", u.email === d.emailEdit.to);
      s.check("the row holds the contact as the writer encodes it", !contactRowMisses(row, u).length, contactRowMisses(row, u));
      s.check("edited in place (the same row _id)", !!rowId && str(row, "_id") === rowId, { before: rowId, after: str(row, "_id") });
      s.check("the old e-mail is on no row", !contactRowsOf(item).some((x) => str(x, "Contacts_Email").toLowerCase() === d.contacts[who].email));
      supplierRead(s, item, 3);
      wantAudit(supplierAudit(r, "updateContact (e-mail)", prev, p.next));
    });

    await step(F.contact, [F.add], async (s) => {
      const prev = admin().state;
      const p = await perform(v, admin(), "addContact", [d.supplierCode, d.added], (st, by) => M.addContact(st, by, d.supplierCode, d.added).state);
      const r = wrote(s, p, "addContact");
      next = p.next;
      b = shown(v, admin(), r);
      ids.d = next.users.find((u) => u.side === "supplier" && u.email === d.added.email)?.id;
      const u = contactOf("d");
      if (!u) throw new Error("the domain added no contact");
      const item = savedOf(r, "supplier");
      const ofNew = (it: RawItem | undefined) => contactRowsOf(it).filter((x) => str(x, "Contacts_Key") === u.id || str(x, "Contacts_Email").toLowerCase() === u.email);
      s.check("one row for the new contact", ofNew(item).length === 1, ofNew(item).map(rawContact));
      s.check("the row holds the contact as the writer encodes it", !contactRowMisses(rowOfContact(item, u, w.identity), u).length, contactRowMisses(rowOfContact(item, u, w.identity), u));
      s.check("a key of its own (no other row carries it)", contactRowsOf(item).filter((x) => str(x, "Contacts_Key") === u.id).length === 1, u.id);
      supplierRead(s, item, 4);
      // the settle: a new row can show late (write/verify.ts ROW_SETTLE_MS); a late duplicate would show now
      await w.clock.sleep(ROW_SETTLE_MS * 2);
      const again = await v.client.formGet("supplier", supItem);
      s.readBack(`the row read again ${(ROW_SETTLE_MS * 2) / 1000} s later (raw: Contacts rows)`, contactRowsOf(again).map(rawContact));
      s.check("after the settle: still one row for the new contact, four in all, no duplicate", ofNew(again).length === 1 && contactRowsOf(again).length === 4 && !duplicateRows(again).length, duplicateRows(again));
      wantAudit(supplierAudit(r, "addContact", prev, p.next));
    });

    await step(F.off, d.deactivate === "d" ? [F.add, F.contact] : [F.add], async (s) => {
      const who = d.deactivate;
      const id = ids[who]!;
      const prev = admin().state;
      const p = await perform(v, admin(), "setContactActive", [id, false], (st, by) => M.setContactActive(st, by, id, false));
      const r = wrote(s, p, "setContactActive (deactivate)");
      next = p.next;
      b = shown(v, admin(), r);
      const u = contactOf(who)!;
      const item = savedOf(r, "supplier");
      const row = rowOfContact(item, u, w.identity);
      s.readBack(`contact ${who}'s row (raw)`, rawContact(row));
      s.check("the domain deactivated it", u.active === false && !!u.deactivatedAt);
      s.check("the row reads Contacts_Active No with the deactivation time", str(row, "Contacts_Active") === "No" && instant(str(row, "Contacts_Deactivated_At")) === instant(u.deactivatedAt), rawContact(row));
      s.check("the row holds the contact as the writer encodes it", !contactRowMisses(row, u).length, contactRowMisses(row, u));
      supplierRead(s, item, 4);
      wantAudit(supplierAudit(r, "setContactActive (deactivate)", prev, p.next));
    });

    await step(F.link, [F.add], async (s) => {
      // NOT the app's code: Contacts_Portal_User_Id comes from portal user management (Thomas), and no app writer sets
      // it. One field on the row's own _id, as the admin's "typed portal user id" would.
      s.note("not the app's code", "Contacts_Portal_User_Id is set by portal user management, not by an app writer: a one-field Table::Contacts delta by the row's _id.");
      const before = admin().mapped.index.suppliers.get(d.supplierCode);
      const rowId = before?.contactRows[ids.s!];
      if (!rowId) throw new Error("the third contact's row is not known");
      await v.client.formUpdate("supplier", supItem, { [`Table::${CONTACTS}`]: [{ _id: rowId, Contacts_Portal_User_Id: w.identity.kfUserId }] });
      const item = await v.client.formGet("supplier", supItem);
      b = await boot(v, "admin", SCOPE);
      const self = selfContactId(w.identity.kfUserId);
      const row = contactRowsOf(item).find((x) => str(x, "_id") === rowId);
      const u = b.state.users.find((x) => x.id === self);
      const mapped = supplierIn(b.state);
      // the domain's contacts, with the third one under its self id now
      const wantIds = (supplierIn(next)?.contactIds ?? []).map((x) => (x === ids.s ? self : x)).sort();
      const wantSelf = { ...contactKeys(contactOf("s")), id: self };
      s.readBack("the row after the link (raw)", rawContact(row));
      s.readBack("the self contact as the app maps it", contactKeys(u));
      s.check("the row carries the portal user and keeps its key", str(row, "Contacts_Portal_User_Id") === w.identity.kfUserId && str(row, "Contacts_Key") === ids.s, rawContact(row));
      s.check("4 rows, no duplicate", contactRowsOf(item).length === 4 && !duplicateRows(item).length, duplicateRows(item));
      s.check("the row's header holds the supplier F2 made", !supplierRowMisses(item, supWant!).length, supplierRowMisses(item, supWant!));
      s.check("the mapped header is the supplier F2 made", isDeepStrictEqual(headerKeys(mapped), headerKeys(supWant)), { mapped: headerKeys(mapped), want: headerKeys(supWant) });
      s.check("the app maps it to the self contact of this supplier, as the domain had it", u?.side === "supplier" && isDeepStrictEqual(contactKeys(u), wantSelf), { mapped: contactKeys(u), want: wantSelf });
      s.check("the supplier lists the self contact instead of the domain id", isDeepStrictEqual(supplierKeys(mapped)?.contactIds, wantIds), { mapped: supplierKeys(mapped)?.contactIds, want: wantIds });
      s.check("the writers' index knows its row", b.mapped.index.suppliers.get(d.supplierCode)?.contactRows[self] === rowId);
      s.check("the Business administrator's own user shows no e-mail (one e-mail per person)", b.state.users.find((x) => x.id === b!.acting.me.id)?.email === "");
      // the other contacts read as the domain left them
      const others = (["a", "b", "d"] as const).filter((x) => ids[x]);
      s.check("the other contacts are unchanged", isDeepStrictEqual(others.map((x) => contactKeys(b!.state.users.find((y) => y.id === ids[x]))), others.map((x) => contactKeys(contactOf(x)))));
      selfKey = ids.s!;
      ids.s = self;
    });

    await step(F.self, [F.link], async (s) => {
      const self = ids.s!;
      const rowId = admin().mapped.index.suppliers.get(d.supplierCode)?.contactRows[self];
      const patch = { title: d.selfTitle, ...(w.identity.email ? { email: w.identity.email } : {}) };
      s.note("patch", { title: patch.title, email: patch.email ? "the identity's" : "(the identity has none: title only)" });
      const prev = admin().state;
      const p = await perform(v, admin(), "updateContact", [self, patch], (st, by) => M.updateContact(st, by, self, patch));
      s.check('no "already used" refusal', !/already used/i.test(p.refused ?? ""), p.refused);
      const r = wrote(s, p, "updateContact (self contact)");
      next = p.next;
      b = shown(v, admin(), r);
      const item = savedOf(r, "supplier");
      const u = contactOf("s")!;
      const row = contactRowsOf(item).find((x) => str(x, "_id") === rowId);
      s.readBack("the self contact's row (raw)", rawContact(row));
      s.check("the row holds the title (and the identity's e-mail)", str(row, "Contacts_Title") === d.selfTitle && (!w.identity.email || str(row, "Contacts_Email").toLowerCase() === w.identity.email.toLowerCase()), rawContact(row));
      s.check("the row holds the contact as the writer encodes it", !contactRowMisses(row, u).length, contactRowMisses(row, u));
      s.check("still the portal user's row, same key", str(row, "Contacts_Portal_User_Id") === w.identity.kfUserId && str(row, "Contacts_Key") === selfKey);
      s.check('no "self:" id reached the row', !JSON.stringify(contactRowsOf(item)).includes("self:"));
      s.check("only the self contact holds the identity's e-mail in the screens' state", !w.identity.email || b.state.users.filter((x) => x.email.toLowerCase() === w.identity.email.toLowerCase()).map((x) => x.id).join() === self);
      supplierRead(s, item, 4);
      wantAudit(supplierAudit(r, "updateContact (self contact)", prev, p.next));
    });

    await step(F.rows, [F.add, F.email, F.contact, F.off, F.self], async (s) => {
      b = await boot(v, "admin", SCOPE);
      const item = await v.client.formGet("supplier", supItem);
      const fresh = supplierIn(b.state);
      const want = contactsOfSupplier(next!, d.supplierCode);
      s.readBack("CIQ Supplier row on the form GET (raw: header and every Contacts row)", { _id: item._id, Supplier_Code: str(item, "Supplier_Code"), Supplier_Legal_Name: str(item, "Supplier_Legal_Name"), rows: contactRowsOf(item).map(rawContact) });
      s.readBack("the supplier and its contacts on a fresh load", { supplier: supplierKeys(fresh), contacts: contactsOfSupplier(b.state, d.supplierCode).map(contactKeys) });
      s.check("4 rows, no duplicate", contactRowsOf(item).length === 4 && !duplicateRows(item).length, duplicateRows(item));
      s.check("the row's header holds the supplier F2 made", !supplierRowMisses(item, supWant!).length, supplierRowMisses(item, supWant!));
      for (const u of want) s.check(`the row of ${u.id} holds it`, !contactRowMisses(rowOfContact(item, u, w.identity), u).length, contactRowMisses(rowOfContact(item, u, w.identity), u));
      s.check("the fresh load's header is the supplier F2 made", isDeepStrictEqual(headerKeys(fresh), headerKeys(supWant)), { load: headerKeys(fresh), want: headerKeys(supWant) });
      s.check("the fresh load lists the domain's contacts", isDeepStrictEqual(supplierKeys(fresh)?.contactIds, supplierKeys(supplierIn(next))?.contactIds), supplierKeys(fresh)?.contactIds);
      s.check("the fresh load's contacts are the domain's", isDeepStrictEqual(contactsOfSupplier(b.state, d.supplierCode).map(contactKeys), want.map(contactKeys)), { load: contactsOfSupplier(b.state, d.supplierCode).map(contactKeys), domain: want.map(contactKeys) });
      const index = b.mapped.index.suppliers.get(d.supplierCode)?.contactRows ?? {};
      s.check("the writers' index names each contact's own row", want.every((u) => index[u.id] && index[u.id] === str(rowOfContact(item, u, w.identity), "_id")), index);
    });

    // the production order (a contact added while another one has its portal user); R1 and R4 keep their supplier clean
    if (!keeps)
      await step(F.reuse, [F.link], async (s) => {
        const input = d.later;
        const prev = admin().state;
        const p = await perform(v, admin(), "addContact", [d.supplierCode, input], (st, by) => M.addContact(st, by, d.supplierCode, input).state);
        const u = p.next.users.find((x) => x.side === "supplier" && x.email === input.email);
        // what Kissflow holds now, whatever the writer answers
        const item = await v.client.formGet("supplier", supItem);
        const otherKeys = contactRowsOf(item).filter((x) => str(x, "Contacts_Email").toLowerCase() !== input.email).map((x) => str(x, "Contacts_Key"));
        const reused = !!u && otherKeys.includes(u.id);
        if (reused) s.note(KNOWN_APP_BUG, `${KEY_REUSE} Here: ${u.id}, the key the self contact's row keeps.`);
        s.readBack("CIQ Supplier row after the add (raw: Contacts rows)", contactRowsOf(item).map(rawContact));
        s.check("the domain gave the new contact a key no other row carries", !!u && !reused, { key: u?.id, otherKeys });
        s.check("one row for the new contact", contactRowsOf(item).filter((x) => str(x, "Contacts_Email").toLowerCase() === input.email).length === 1);
        s.check("no duplicate contact row", !duplicateRows(item).length, duplicateRows(item));
        const r = wrote(s, p, "addContact (once the self contact exists)");
        next = p.next;
        b = shown(v, admin(), r);
        supplierRead(s, savedOf(r, "supplier"), contactsOfSupplier(next, d.supplierCode).length);
        wantAudit(supplierAudit(r, "addContact (once the self contact exists)", prev, p.next));
      });

    // ------------------------------------------------------------------------------------------------ F9 case, F10 note

    await step(F.kase, [F.link], async (s) => {
      const rmm = await boot(v, "rmm", SCOPE);
      const input: A.NewCaseInput = { ...d.kase, supplierId: d.supplierCode, contactIds: [ids.s!], dueDate: new Date(Date.now() + 30 * 86400000).toISOString() };
      const p = await perform(v, rmm, "createCase", [input], (st, by) => A.createCase(st, by, input, undefined, d.caseCode).state);
      // the case is in the ledger from its create (liveClient), whatever the writer answers after it
      caseItem = w.ledger.byRun().slice(ledgerFrom).find((e) => e.flow === FLOWS.case.id && e.what.includes(d.caseCode))?.id ?? "";
      startedSent = !!p.result?.handoffs.some((h) => h.code === "case.started" && h.status === "sent");
      if (caseItem) stages.set(caseItem, { text: "the S-FORMS note case", process: true, ...(d.proofs ? { step: F.kase, proved: "started by the RMM's createCase, the self contact its portal contact; I-1 made and linked its CIQP Request; the internal note is on its own line" } : {}) });
      const r = wrote(s, p, "createCase");
      if (!s.check("the case is in the ledger", !!caseItem)) return;
      s.check("case.started was handed over", startedSent, r.handoffs);
      const polled = await w.hooks.poll(() => v.client.adminGet("case", caseItem), (it) => !!str(it, "Portal_Request_Item_Id"));
      s.note("I-1 poll", { ok: polled.ok, polls: polled.polls, ms: polled.ms, ...(polled.error ? { error: polled.error } : {}) });
      const it = polled.value;
      const linked = str(it, "Portal_Request_Item_Id");
      s.readBack("CIQ Case (raw: admin GET)", it && { _id: it._id, Case_Code: str(it, "Case_Code"), _status: str(it, "_status"), _current_step: str(it, "_current_step"), Supplier_Code: str(it, "Supplier_Code"), Owner_RMM: userIds(it, "Owner_RMM"), Portal_Contact_Ids: str(it, "Portal_Contact_Ids"), Confirm_Contact_Ids: str(it, "Confirm_Contact_Ids"), Case_Contacts_JSON: json<unknown>(it, "Case_Contacts_JSON", "(does not parse)"), Portal_Request_Item_Id: linked });
      s.check("I-1 linked a CIQP Request on the case", polled.ok, polled.error);
      s.check(`the case waits at "${STEP_NAMES[STEPS.case.waiting]}"`, str(it, "_current_step") === STEP_NAMES[STEPS.case.waiting], str(it, "_current_step"));
      s.check("the portal contact is the Kissflow user, not the domain's self id", str(it, "Portal_Contact_Ids") === w.identity.kfUserId && !JSON.stringify(it ?? {}).includes("self:"));
      const req = linked ? await takeRequest(s, linked) : undefined;
      if (req) s.check("the request is assigned to the portal contact", isDeepStrictEqual(userIds(req, "Assigned_Contacts"), [w.identity.kfUserId]), userIds(req, "Assigned_Contacts"));
      // the item as the app maps it (the store would read everything again after this step move: the same mapper)
      const view = shown(v, rmm, { ...r, saved: it ? [{ flow: "case", item: it }] : [] });
      const made = p.next.cases.find((c) => c.id === d.caseCode);
      const back = view.state.cases.find((c) => c.id === d.caseCode);
      s.readBack("the case as the app maps it", caseKeys(back));
      s.check("the mapped case is the domain's", isDeepStrictEqual(caseKeys(back), caseKeys(made)), { mapped: caseKeys(back), domain: caseKeys(made) });
      s.check("the writers' index links the case and its request", view.mapped.index.cases.get(d.caseCode)?.itemId === caseItem && !!linked && view.mapped.index.cases.get(d.caseCode)?.portalRequestItemId === linked);
      s.check("no hand-off failed after the save", !w.problems.some((x) => x.code === "case.started"), w.problems);
      wantAudit({
        id: r.auditRow!._id,
        code: "case.created",
        what: "createCase",
        acting: rmm.acting,
        object: { kind: "Case", key: d.caseCode, itemId: caseItem, state: LIST.phase["supplier-input"] },
        // the Start step's activity instance: only the writer saw it, so only that the row names one is checked
        ref: { flow: "case", itemId: caseItem, anyAct: true },
        caseCode: d.caseCode,
        caseItemId: caseItem,
        handoffs: ["case.started"],
        details: newEntries(undefined, made).map((e) => e.detail),
      });
    });

    await step(F.note, [F.kase], async (s) => {
      const nb = await boot(v, d.note.persona, SCOPE);
      const c0 = nb.state.cases.find((c) => c.id === d.caseCode);
      if (!c0) throw new Error(`the case ${d.caseCode} is not in the ${d.note.persona} load`);
      const mandatory = c0.scope.filter((x) => x.applicability === "mandatory").map((x) => x.sectionId);
      const sectionId = d.note.onSection ? mandatory[0] : undefined;
      // a run that asks for a note on a section must not quietly write a case note
      s.check("the note is where this run puts it (on a section, or on the case)", !d.note.onSection || !!sectionId, { onSection: d.note.onSection, mandatorySections: mandatory });
      const text = d.note.mentionSelf ? `${d.note.text} @${w.identity.name}` : d.note.text;
      const p = await perform(v, nb, "addInternalNote", [d.caseCode, text, sectionId], (st, by) => A.addInternalNote(st, by, d.caseCode, text, sectionId));
      const r = wrote(s, p, `addInternalNote (${d.note.persona})`);
      const c = p.next.cases.find((x) => x.id === d.caseCode)!;
      const note = c.internalNotes.find((n) => !c0.internalNotes.some((m) => m.id === n.id));
      if (!note) throw new Error("the domain added no note");
      last = shown(v, nb, r);
      const row = savedOf(r, "note");
      const back = last.state.cases.find((x) => x.id === d.caseCode);
      s.readBack("CIQ Internal Note row (raw)", row && Object.fromEntries(["_id", "Note_Key", "Case_Code", "Case_Item_Id", "Linked_Kind", "Linked_Key", "Note_Text", "Note_Dept", "Note_At", "Note_Mentions_Names"].map((k) => [k, row[k]]).concat([["Note_Author", userIds(row, "Note_Author")]])));
      s.readBack("the note as the app maps it", noteKeys(back?.internalNotes.find((n) => n.id === note.id)));
      const ctx = nb.ctx();
      const ref = caseRefOf(ctx, d.caseCode);
      const misses = row && ref ? missingOf(noteFields(c, ref, note, ctx, p.next.users), row) : ["(no row or case ref)"];
      s.check("the row is in the ledger", !!row && w.ledger.has(row._id));
      s.check("the row holds the note as the writer encodes it", !misses.length, misses);
      s.check("the author is the Kissflow user", userIds(row, "Note_Author")[0] === w.identity.kfUserId);
      s.check("the mapped note is the domain's", isDeepStrictEqual(noteKeys(back?.internalNotes.find((n) => n.id === note.id)), noteKeys(note)), { mapped: noteKeys(back?.internalNotes.find((n) => n.id === note.id)), domain: noteKeys(note) });
      const entries = newEntries(c0, c);
      const lines = entries.map((e) => `${e.action}: ${e.detail}`);
      s.check("the case history shows the domain's entry", lines.length > 0 && lines.every((e) => back?.audit.some((x) => `${x.action}: ${x.detail}` === e)), lines);
      wantAudit({ id: r.auditRow!._id, code: "note.added", what: `addInternalNote (${d.note.persona})`, acting: nb.acting, object: { kind: "Internal note", key: note.id, itemId: row!._id }, ref: { flow: "note", itemId: row!._id }, caseCode: d.caseCode, caseItemId: caseItem, details: entries.map((e) => e.detail) });
      stages.set(row!._id, { text: `internal note ${note.id} on ${d.caseCode} (${d.note.persona}${sectionId ? `, section ${sectionId}` : ""})`, step: F.note });
    });

    // ------------------------------------------------------------------------------------------------ F11 audit

    await step(F.audit, [], async (s) => {
      if (!audits.length) s.skip("no writer of this suite left an audit row");
      const view = last ?? (await boot(v, "admin", SCOPE));
      for (const a of audits) {
        const row = view.snap.forms.audit.find((r) => r._id === a.id);
        s.readBack(`${a.what}: audit row (raw)`, rawAudit(row));
        checkAudit(s, view, a, row);
      }
    });

    // ------------------------------------------------------------------------------------------------ F12a, F12

    /** R1: the kept supplier stops carrying Thomas's portal user (and the identity's e-mail), so his own dev load keeps
     *  its one self contact; the R1 case keeps naming him as its contact (Portal_Contact_Ids). */
    async function unlink(): Promise<void> {
      await step(F.unlink, [F.link], async (s) => {
        s.note("why", "Thomas's dev load registers ONE self contact, on the first supplier row it reads that carries his portal user (map/people.ts Directory.contact): a kept supplier with that link could take it from his own dev supplier.");
        const self = ids.s!;
        const rowId = admin().mapped.index.suppliers.get(d.supplierCode)?.contactRows[self];
        if (!self.startsWith("self:") || !rowId) throw new Error("the self contact's row is not known");
        const cur = admin().state.users.find((u) => u.id === self);
        if (cur && cur.email !== d.contacts.s.email) {
          // the app's own writer: the contact's fictional e-mail back (afterwards no supplier row holds the identity's)
          const patch = { email: d.contacts.s.email };
          const prev = admin().state;
          const p = await perform(v, admin(), "updateContact", [self, patch], (st, by) => M.updateContact(st, by, self, patch));
          const r = wrote(s, p, "updateContact (the fictional e-mail back)");
          next = p.next;
          b = shown(v, admin(), r);
          const item = savedOf(r, "supplier");
          const row = contactRowsOf(item).find((x) => str(x, "_id") === rowId);
          s.readBack("the self contact's row with its e-mail back (raw)", rawContact(row));
          s.check("the row holds the fictional e-mail again", str(row, "Contacts_Email").toLowerCase() === d.contacts.s.email, rawContact(row));
          supplierRead(s, item, contactsOfSupplier(next, d.supplierCode).length);
          // its audit row, here: F11 has run
          const a = wantAudit(supplierAudit(r, "updateContact (the fictional e-mail back)", prev, p.next));
          s.readBack(`${a.what}: audit row (raw)`, rawAudit(r.auditRow));
          checkAudit(s, admin(), a, r.auditRow);
        } else s.note("e-mail", "the self contact does not hold the identity's e-mail: nothing to give back");
        // NOT the app's code, as F6: portal user management clears the portal user (one field, by the row's _id)
        s.note("not the app's code", "Contacts_Portal_User_Id cleared as portal user management would: a one-field Table::Contacts delta by the row's _id.");
        await v.client.formUpdate("supplier", supItem, { [`Table::${CONTACTS}`]: [{ _id: rowId, Contacts_Portal_User_Id: "" }] });
        const item = await v.client.formGet("supplier", supItem);
        b = await boot(v, "admin", SCOPE);
        const row = contactRowsOf(item).find((x) => str(x, "_id") === rowId);
        const mapped = supplierIn(b.state);
        // the domain's contacts, the third one under its own key again
        const asKept = (u: User) => ({ ...contactKeys(u)!, id: u.id === self ? selfKey : u.id });
        const want = contactsOfSupplier(next!, d.supplierCode).map(asKept).sort((x, y) => x.id.localeCompare(y.id));
        // the supplier's own contacts: the R1 case still names Thomas (Case_Contacts_JSON), which the mapper registers as
        // a self contact under the case's supplier code, but no supplier lists it (in Thomas's own load his dev supplier's
        // row registers it first, map/people.ts)
        const listed = (mapped?.contactIds ?? []).map((id) => contactKeys(b!.state.users.find((u) => u.id === id))).sort((x, y) => (x?.id ?? "").localeCompare(y?.id ?? ""));
        s.readBack("the row after the unlink (raw)", rawContact(row));
        s.readBack("the supplier's contacts on a fresh load", listed);
        s.check("the row has no portal user and keeps its key", !!row && !str(row, "Contacts_Portal_User_Id") && str(row, "Contacts_Key") === selfKey, rawContact(row));
        s.check("no row of the supplier carries Thomas's portal user", !contactRowsOf(item).some((x) => str(x, "Contacts_Portal_User_Id") === w.identity.kfUserId));
        s.check(`${want.length} rows, no duplicate`, contactRowsOf(item).length === want.length && !duplicateRows(item).length, duplicateRows(item));
        s.check("the row's header holds the supplier F2 made", !supplierRowMisses(item, supWant!).length, supplierRowMisses(item, supWant!));
        s.check("the fresh load's header is the supplier F2 made", isDeepStrictEqual(headerKeys(mapped), headerKeys(supWant)));
        s.check("the fresh load has no self contact on the supplier", !!mapped && !mapped.contactIds.includes(self) && mapped.contactIds.includes(selfKey), mapped?.contactIds);
        s.check("the fresh load's contacts are the domain's, the third under its own key", isDeepStrictEqual(listed, want), { load: listed, want });
        s.check("the writers' index names its row under its key", b.mapped.index.suppliers.get(d.supplierCode)?.contactRows[selfKey] === rowId);
        ids.s = selfKey;
      });
    }

    /** This suite's items in the ledger, in the order they first appeared, each with its latest line. Left out: the
     *  draft lines (Kissflow's per-user form drafts, never items), a row known only by its draft's id (`byDraftId`: a
     *  submit that answered without the new id; never deleted by this suite), and every CIQP Request but its own. */
    function suiteItems(): { mine: LedgerEntry[]; byDraftId: LedgerEntry[] } {
      const lines = w.ledger.byRun().slice(ledgerFrom);
      const drafts = new Set(lines.filter((e) => e.stage === "draft").map((e) => `${e.flow}|${e.id}`));
      const byDraftId = lines.filter((e) => e.stage !== "draft" && drafts.has(`${e.flow}|${e.id}`));
      const own = (e: LedgerEntry) => e.stage !== "draft" && !drafts.has(`${e.flow}|${e.id}`) && (e.flow !== PORTAL_FLOWS.request.id || e.id === rid);
      return { mine: [...new Map(lines.filter(own).map((e) => [e.id, e] as const)).values()], byDraftId };
    }
    // (function declarations from here on: afterAll may call the teardown before the run reached them)
    function noDraftIds(s: StepCtx, byDraftId: LedgerEntry[]): void {
      s.check("no row is known only by its draft's id", !byDraftId.length, byDraftId.map(({ flow, id, what }) => ({ flow, id, what })));
    }

    /** F9 took no request of its own: the case is read once more (I-1's link-back may land late) and a link taken as F9
     *  would; still none, and I-1 owed one → a leftover the ledger misses, named by its Request_Key. */
    async function lateLink(s: StepCtx): Promise<void> {
      if (rid || !caseItem || !startedSent) return;
      let linked = "";
      try {
        linked = str(await v.client.adminGet("case", caseItem), "Portal_Request_Item_Id");
      } catch (x) {
        if (x instanceof StopError) throw x;
        s.note("the case read again", errorText(x));
      }
      s.readBack("the case read again for I-1's link-back (F9 took no request)", { _id: caseItem, Portal_Request_Item_Id: linked });
      // a request already found naming another case is not checked again (noLeftovers names it)
      if (linked && !foreign.has(linked)) await takeRequest(s, linked);
      if (!rid)
        leftovers.push({
          flow: PORTAL_FLOWS.request.id,
          Request_Key: `${d.caseCode}|1`,
          App_Case_Item_Id: caseItem,
          why: `${linked ? `the case links ${linked}, which is not its request` : "I-1 never linked a request back onto the case"}: if I-1 made this case's request, the ledger misses it (find it by its Request_Key)`,
        });
    }

    /** The leftovers, and the requests the S-FORMS case linked that are not its own (in the ledger, neither kept nor
     *  deleted by this suite). */
    function noLeftovers(s: StepCtx): void {
      const others = [...new Set(w.ledger.byRun().slice(ledgerFrom).filter((e) => e.flow === PORTAL_FLOWS.request.id && e.id !== rid).map((e) => e.id))].map((id) => ({
        flow: PORTAL_FLOWS.request.id,
        id,
        why: "linked from the S-FORMS case but not its request (it names another case, or did not read back): in the ledger, not handled by S-FORMS",
      }));
      const all = [...leftovers, ...others];
      s.note("leftovers", all);
      s.check("nothing left that the ledger misses or this suite does not own", !all.length, all);
    }

    /** The showcase supplier's stage: what the steps that passed did, and which did not pass. */
    function supplierStage(): string {
      // R4 names the contacts, so the morning list says whom to look at
      const nameOf = (who: Who) => (who === "d" ? d.added.name : d.contacts[who].name);
      const named = (text: string, who: string) => (d.proofs ? `${text} (${who})` : text);
      const parts: [string, string][] = [
        [F.add, named("added with three contacts", (["a", "b", "s"] as const).map(nameOf).join(", "))],
        [F.email, named("one contact's e-mail edited", nameOf(d.emailEdit.who))],
        [F.contact, named("one contact added", d.added.name)],
        [F.off, named("one deactivated", nameOf(d.deactivate))],
        [F.link, named("one linked to Thomas's portal user (the self contact)", d.contacts.s.name)],
        [F.self, "its e-mail and title edited as the Business administrator"],
        [F.rows, "every row verified on a fresh read"],
        [F.unlink, "its fictional e-mail back and the portal user unlinked again"],
      ];
      const done = parts.filter(([n]) => passed.has(n)).map(([, t]) => t);
      const not = parts.filter(([n]) => !passed.has(n)).map(([n]) => short(n));
      return `S-FORMS supplier ${d.supplierCode}: ${done.join("; ") || "nothing verified"}${not.length ? `; NOT verified: ${not.join(", ")} (see results)` : ""}`;
    }

    /** The stage a kept item is left at, from its read-back now. */
    function stageOf(id: string, it: RawItem): string {
      if (id === supItem) return supplierStage();
      const st = stages.get(id);
      if (!st) return "S-FORMS recorded no showcase stage for it";
      if (st.process && st.proved) {
        // R4: the step and status as read, what F9 proved when it passed
        const read = [str(it, "_current_step"), str(it, "_status")].filter(Boolean).join(", ") || "(no step)";
        return `${read}: ${st.text}, ${st.step && passed.has(st.step) ? st.proved : `NOT verified, ${short(st.step)} did not pass (see results)`}`;
      }
      if (st.process) return `${str(it, "_current_step") || str(it, "_status") || "(no step)"} (${st.text})`;
      return (st.ok ?? (!!st.step && passed.has(st.step))) ? st.text : `${st.text}: NOT verified, ${short(st.step)} did not pass (see results)`;
    }

    async function showcase(): Promise<void> {
      await step(F.showcase, [], async (s) => {
        noDraftIds(s, suiteItems().byDraftId);
        await lateLink(s);
        const { mine } = suiteItems();
        const kept: Record<string, unknown>[] = [];
        for (const e of mine) {
          let it: RawItem | undefined;
          let error = "";
          try {
            it = await readItem(v, e.flow, e.id);
          } catch (x) {
            if (x instanceof StopError) throw x;
            error = errorText(x);
          }
          const stage = it ? stageOf(e.id, it) : `NOT read back at the end of S-FORMS (${error})`;
          w.adopt(e.flow, e.id, e.what, stage);
          kept.push({ flow: e.flow, id: e.id, what: e.what, ...(it ? { read: str(it, "_current_step") || "ok" } : { error }), stage });
          s.check(`${e.flow} ${e.id} reads back`, !!it, error || undefined);
          if (it && e.id === supItem && contactRowsOf(it).some((x) => str(x, "Contacts_Portal_User_Id") === w.identity.kfUserId))
            leftovers.push({ flow: e.flow, id: e.id, why: "the showcase supplier still carries Thomas's portal user (F12a did not pass): clear that row's Contacts_Portal_User_Id before his next dev load" });
        }
        s.readBack("each kept item read again, and the stage it is left at (the ledger)", kept);
        s.check("every item has a showcase stage", mine.every((m) => m.id === supItem || stages.has(m.id)), mine.filter((m) => m.id !== supItem && !stages.has(m.id)).map((m) => m.id));
        noLeftovers(s);
      });
    }

    async function cleanup(): Promise<void> {
      await step(F.cleanup, [], async (s) => {
        if (!suiteItems().mine.length) s.skip("this suite left no item");
        noDraftIds(s, suiteItems().byDraftId);
        // before the case is withdrawn and deleted: its link-back is the only trace of I-1's request
        await lateLink(s);
        const removed = await removeItems(v, suiteItems().mine, w.text("S-FORMS cleanup"));
        s.readBack("each item deleted, then read again", removed);
        for (const r of removed) s.check(`${r.flow} ${r.id} (${r.what}): deleted, then not found`, r.deleted && r.gone, r.error);
        noLeftovers(s);
      });
    }

    await teardown();

    // ------------------------------------------------------------------------------------------------ summary

    const est = liveCallsOf(tally);
    const counts = Object.fromEntries((["pass", "fail", "blocked", "not-run"] as const).map((x) => [x, rec.steps.filter((y) => y.status === x).length]));
    const known = rec.steps.filter((x) => x.status === "fail" && x.evidence.notes[KNOWN_APP_BUG] !== undefined);
    const lastStep = rec.steps.at(-1);
    if (lastStep) {
      lastStep.evidence.notes.suiteCalls = { client: Object.fromEntries(tally), ...(w.live ? { rest: w.log.entries.length } : { liveEstimate: est }) };
      rec.save();
    }
    console.log(
      `${SUITE} ${w.run} (${w.live ? "live" : "offline"}): ${JSON.stringify(counts)}${known.length ? `; failing on a known app defect: ${known.map((x) => short(x.name)).join(", ")}` : ""}; ${w.live ? `${w.log.entries.length} REST calls` : `≈${est} live REST calls (one page per list)`}; results ${rec.file}`,
    );
    const bad = rec.steps.filter((x) => !known.includes(x) && (x.status === "fail" || (!w.live && x.status !== "pass")));
    expect(bad.map((x) => `${x.name}: ${x.status}: ${x.reason ?? ""}`)).toEqual([]);
  }, TIMEOUT_MS);
});
