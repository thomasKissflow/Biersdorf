// S-OP's own started case (SPEC §4 S-OP raises "on a started case"; the domain raises only during the review, and only
// for a department with a review track: domain/actions.ts raiseOpenPoint, permissions.ts trackGuard). Every write goes
// through the app's and the portal's own code, tagged with the run:
// 1. supplier: the run's supplier whose contact is the self contact (Thomas's portal user). One the run already has
//    (S-CASE's) is reused: the app maps the self contact to ONE supplier (map/people.ts: the first row listing it), so a
//    second one would refuse the other's cases. Otherwise addSupplier (the Business administrator's writer, with every
//    supplier row's code and DUNS in the state, as the admin's screen lists them), its new `s<n>` renamed to the run's
//    code (SPEC §1: every supplier code carries the run tag; the domain numbers after the suppliers it sees), then the
//    contact row's portal user and login e-mail (Contacts_Portal_User_Id, Contacts_Email): the administrator's portal
//    invitation, a Kissflow form edit the app has no writer for.
// 2. case: createCase (RMM's writer) for the self contact; case.started → I-1 creates the CIQP Request (ledger).
// 3. completeness: the portal's own writers as the self contact: patchRequest (the metadata answers, then a
//    justification for every open item and the composition row), confirmCompleteness (submit "fill in the CIQ" →
//    I-2). I-2 writes the completeness and phase Review on the case; its Approve is refused (050201: Integration
//    service has no members, SPEC §2), so the case stays at "Waiting for supplier: CIQ", which the app maps as in review
//    (caseMap.ts casePhase).
// 4. reviews: I-2 starts RMM's review and one per department the confirmation named (E-A, 22 Oct); the suite finds them
//    by Kissflow's search on the case item id and adopts them into the ledger.
import * as A from "@/domain/actions";
import { fieldOf, sectionOf } from "@/domain/catalog";
import { completenessBlockers } from "@/domain/selectors";
import * as M from "@/domain/suppliers";
import type { AppState, CiqCase, InternalPersonaId, ReviewDept } from "@/domain/types";
import { FLOWS, LIST, STEP_NAMES, STEPS, TABLES } from "@/app-live/ids";
import { Directory, selfContactId } from "@/app-live/map/people";
import { suppliersFromRows } from "@/app-live/map/suppliersMap";
import type { AnswerPatch } from "@/portal/data/answers";
import { childRows, str, userIds, type RawItem } from "@/portal/data/raw";
import { FLOWS as PORTAL_FLOWS, STEPS as PORTAL_STEPS } from "@/portal/kf/portal";
import type { Polled } from "../lib/hooks";
import type { StepCtx } from "../lib/results";
import { boot, bootPortal, perform, type Booted, type Performed, type World } from "../lib/world";
import { pick, stepName } from "./check";
import type { LateHandoff } from "./cleanup";
import type { RunPlan } from "./plan";

/** Every load of the suite reads this run's items only (the speed rule: a full load reads every item Thomas made). */
export const RUN_SCOPE = { scope: "run" } as const;
const DAY_MS = 86_400_000;
/** An ISO instant `days` from now, at 16:00 UTC (the screens' due-date time). */
export const inDays = (days: number) => `${new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)}T16:00:00.000Z`;

// ---------------------------------------------------------------------------------- loads

/** The app's loads: the last one again while nothing was written since (the store reads again after a write). */
export interface Session {
  view(persona: InternalPersonaId): Promise<Booted>;
  /** Something was written (here, by the portal or an integration): the next view loads again. */
  dirty(): void;
}

export function session(w: World): Session {
  let last: Booted | undefined;
  return {
    async view(persona) {
      if (last?.persona === persona) return last;
      last = await boot(w, persona, RUN_SCOPE);
      return last;
    },
    dirty: () => void (last = undefined),
  };
}

export const caseIn = (s: AppState, code: string): CiqCase | undefined => s.cases.find((c) => c.id === code);

/** The writer's outcome as checks and notes (the domain's or the guard's refusal, the toast, the hand-offs). */
export function written(s: StepCtx, what: string, r: Performed): boolean {
  if (r.refused) return s.check(`${what}: not refused`, false, r.refused);
  s.note(`${what}: hand-offs`, (r.result?.handoffs ?? []).map((h) => ({ code: h.code, status: h.status, ...(h.status !== "sent" && h.detail ? { detail: h.detail } : {}) })));
  if (r.result?.warnings.length) s.note(`${what}: warnings`, r.result.warnings);
  return s.check(`${what}: the writer reports ok`, !!r.result?.ok, r.result?.message);
}

/** A poll's evidence (no values). */
export const polled = (p: Polled<unknown>) => ({ ok: p.ok, polls: p.polls, ms: p.ms, ...(p.error ? { error: p.error } : {}) });

/** The ledger id of an item the guard recorded on create, by one of its key fields ("OP_Key=OP-OPR1-01"). */
export const ledgerIdOf = (w: World, flowId: string, key: string): string => w.ledger.latest().find((e) => e.flow === flowId && e.what.split(" ").includes(key))?.id ?? "";

// ---------------------------------------------------------------------------------- 1. supplier

export interface OpSupplier {
  supplierId: string;
  itemId: string;
  selfId: string;
  /** The case's contacts: the self contact first, then one more active contact when there is one. */
  contactIds: string[];
  created: boolean;
}

/** The run's supplier the app maps the self contact to (scope "run": only this run's rows are loaded). */
function runSupplierOf(w: World, b: Booted, selfId: string): OpSupplier | undefined {
  const self = b.state.users.find((u) => u.id === selfId && u.side === "supplier" && u.active !== false);
  const sup = self?.supplierId ? b.state.suppliers.find((x) => x.id === self.supplierId && x.active !== false) : undefined;
  const ref = sup ? b.mapped.index.suppliers.get(sup.id) : undefined;
  if (!sup || !ref || !w.ledger.has(ref.itemId)) return undefined;
  const other = sup.contactIds.find((id) => id !== selfId && b.state.users.find((u) => u.id === id)?.active !== false);
  return { supplierId: sup.id, itemId: ref.itemId, selfId, contactIds: [selfId, ...(other ? [other] : [])], created: false };
}

/** The domain's new supplier `from` (and its contacts' ids `u-<supplier>-<n>`, its log entries) as `to`: only what
 *  addSupplier added is renamed. */
function renameSupplier(prev: AppState, next: AppState, from: string, to: string): AppState {
  const uid = (id: string) => (id.startsWith(`u-${from}-`) ? `u-${to}-${id.slice(from.length + 3)}` : id);
  const isNew = <T>(list: readonly T[], x: T) => !list.includes(x);
  return {
    ...next,
    suppliers: next.suppliers.map((x) => (x.id === from && isNew(prev.suppliers, x) ? { ...x, id: to, contactIds: x.contactIds.map(uid) } : x)),
    users: next.users.map((u) => (u.supplierId === from && isNew(prev.users, u) ? { ...u, id: uid(u.id), supplierId: to } : u)),
    log: next.log.map((e) => (e.supplierId === from && isNew(prev.log, e) ? { ...e, supplierId: to } : e)),
  };
}

/** A supplier code of the run no supplier row has. */
function freeSupplierCode(w: World, state: AppState): string {
  for (const l of ["", ..."BCDEFGH"]) {
    const code = w.key(`SUP-OP${l}`);
    if (!state.suppliers.some((x) => x.id === code)) return code;
  }
  throw new Error("no free S-OP supplier code left for this run; clean the run up first");
}

/** A DUNS number no supplier row uses (derived from the run's name, then counted up). */
function freeDuns(state: AppState, run: string): string {
  const used = new Set(state.suppliers.map((x) => M.normaliseDuns(x.duns)));
  let n = 921_000_000 + ([...run].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 1000) * 100;
  while (used.has(String(n))) n++;
  return String(n);
}

export async function setupSupplier(w: World, s: StepCtx, sess: Session): Promise<OpSupplier> {
  const selfId = selfContactId(w.identity.kfUserId);
  const reused = runSupplierOf(w, await sess.view("rmm"), selfId);
  if (reused) {
    s.note("supplier", `reused the run's supplier ${reused.supplierId}: its contact is already the self contact`);
    const row = await w.client.formGet("supplier", reused.itemId);
    s.readBack("CIQ Supplier (raw)", { ...pick(row, ["Supplier_Code", "Supplier_Legal_Name", "Supplier_Active"]), contacts: contactsOf(row) });
    s.check("the self contact's row names the portal user", childRows(row, TABLES.contacts, "Contacts_Key").some((r) => str(r, "Contacts_Portal_User_Id") === w.who.id));
    return reused;
  }
  // the admin's screen lists every supplier row (codes, DUNS): the domain numbers the new one after them
  const admin = await sess.view("admin");
  const listed = suppliersFromRows(await w.client.formList("supplier"), new Directory(admin.acting.me, w.identity.kfUserId), []).suppliers;
  const state: AppState = { ...admin.state, suppliers: [...admin.state.suppliers, ...listed.filter((x) => !admin.state.suppliers.some((y) => y.id === x.id))] };
  const mail = (who: string) => `${w.tag.toLowerCase()}.op.${who}@example.com`;
  const input: M.SupplierInput = {
    name: w.text("S-OP Supplier GmbH"),
    duns: freeDuns(state, w.run),
    country: "Germany",
    city: "Hamburg",
    type: "manufacturer",
    contacts: [
      { name: w.text("Thomas (self contact)"), email: mail("self"), title: "Quality lead", mayConfirm: true },
      { name: w.text("Mira Lindqvist"), email: mail("mira.lindqvist"), title: "Regulatory specialist", mayConfirm: false },
    ],
  };
  const code = freeSupplierCode(w, state);
  const r = await perform(w, { ...admin, state }, "addSupplier", [input], (st, by) => {
    const x = M.addSupplier(st, by, input);
    return x.id ? renameSupplier(st, x.state, x.id, code) : x.state;
  });
  sess.dirty();
  s.note("not the app's code", `the domain's new supplier code is renamed to ${code} before the writer runs (the run tag)`);
  if (!written(s, "addSupplier", r)) throw new Error("the supplier was not created");
  const sup = r.next.suppliers.find((x) => x.id === code)!;
  const itemId = r.result!.saved?.find((x) => x.flow === "supplier")?.item._id ?? "";
  // the administrator's portal invitation of the first contact: its row (by the _id the read gave) gets the portal user
  const first = await w.client.formGet("supplier", itemId);
  const selfRow = childRows(first, TABLES.contacts, "Contacts_Key").find((x) => str(x, "Contacts_Key") === sup.contactIds[0]);
  if (!selfRow || !str(selfRow, "_id")) throw new Error("the first contact's row was not read back with its _id");
  await w.client.formUpdate("supplier", itemId, { [`Table::${TABLES.contacts}`]: [{ _id: str(selfRow, "_id"), Contacts_Portal_User_Id: w.who.id, ...(w.who.email ? { Contacts_Email: w.who.email } : {}) }] });
  s.note("not the app's code (2)", "the self contact's portal user and login e-mail are a form edit (Contacts_Portal_User_Id, Contacts_Email): the administrator's invitation, which the app has no writer for");
  const row = await w.client.formGet("supplier", itemId);
  const rows = childRows(row, TABLES.contacts, "Contacts_Key");
  s.readBack("CIQ Supplier (raw)", { ...pick(row, ["Supplier_Code", "Supplier_Legal_Name", "DUNS_Number", "Supplier_Country_Code", "Supplier_Kind", "Supplier_Active"]), contacts: contactsOf(row) });
  s.check("Supplier_Code and the name carry the run", str(row, "Supplier_Code") === sup.id && str(row, "Supplier_Legal_Name").startsWith(w.tag));
  s.check("two contact rows, no duplicate", rows.length === 2, rows.length);
  s.check("the first contact is the self contact (portal user, its e-mail)", rows.some((x) => str(x, "Contacts_Portal_User_Id") === w.who.id && str(x, "Contacts_Email").toLowerCase() === w.who.email.toLowerCase()));
  // the app maps it so: the self contact belongs to this supplier
  const back = runSupplierOf(w, await sess.view("rmm"), selfId);
  s.readBack("the supplier as RMM's screen maps it", back && { supplierId: back.supplierId, contacts: back.contactIds.length });
  s.check("RMM's screen maps the self contact to this supplier", back?.supplierId === sup.id, back?.supplierId);
  return { supplierId: sup.id, itemId, selfId, contactIds: back?.contactIds ?? [selfId], created: true };
}

/** Contact rows without their e-mail addresses (checked, not recorded). */
const contactsOf = (row: RawItem) =>
  childRows(row, TABLES.contacts, "Contacts_Key").map((x) => ({ key: str(x, "Contacts_Key"), name: str(x, "Contacts_Full_Name"), portalUser: str(x, "Contacts_Portal_User_Id") || null, canConfirm: str(x, "Contacts_Can_Confirm"), active: str(x, "Contacts_Active") }));

// ---------------------------------------------------------------------------------- 2. case

export interface OpCase {
  code: string;
  caseItemId: string;
  requestId: string;
  /** The case's Supplier_Code as read back (every query of the case carries it). */
  supplierCode: string;
  /** The request's Assigned_Contacts (user ids): the case's supplier side, whom every query goes to. */
  contacts: string[];
}

/** A case code of this suite and run that no case of the run has. Its last four characters are the open points' keys
 *  (OP-<last four>-NN, domain raiseOpenPoint), so they name the suite and the run: "OPR1" → OP-OPR1-01. */
function freeCode(w: World, state: AppState): string {
  const used = new Set([...state.cases.map((c) => c.id), ...w.ledger.latest().map((e) => e.what)]);
  for (const l of "PQRSTUVWXYZ") {
    const code = w.key(`O${l}${w.run.slice(-2)}`);
    if (![...used].some((u) => u === code || u.includes(`Case_Code=${code}`))) return code;
  }
  throw new Error("no free S-OP case code left for this run; clean the run up first");
}

/** `late` gets I-1 when its poll gives up (its request may still come: the clean-up's sweep looks for it). */
export async function setupCase(w: World, s: StepCtx, sess: Session, plan: RunPlan, sup: OpSupplier, late: LateHandoff[]): Promise<OpCase> {
  const rmm = await sess.view("rmm");
  const code = freeCode(w, rmm.state);
  const input: A.NewCaseInput = { materialName: w.text("Glycerin 99.5 (S-OP)"), inci: "Glycerin", materialNo: w.key("RM-OP"), supplierId: sup.supplierId, contactIds: sup.contactIds, markets: plan.markets, dueDate: inDays(30), priority: "normal" };
  const r = await perform(w, rmm, "createCase", [input], (st, by) => A.createCase(st, by, input, undefined, code).state);
  sess.dirty();
  if (!written(s, "createCase", r)) throw new Error("the case was not created");
  const caseItemId = ledgerIdOf(w, FLOWS.case.id, `Case_Code=${code}`);
  // I-1 (case.started): the CIQP Request, linked on the case
  const linked = await w.hooks.poll(() => w.client.adminGet("case", caseItemId), (it) => !!str(it, "Portal_Request_Item_Id"));
  s.note("I-1 poll", polled(linked));
  if (!s.check("I-1 linked a CIQP Request on the case (Portal_Request_Item_Id)", linked.ok)) {
    late.push({ code: "case.started", itemId: caseItemId });
    throw new Error("I-1 did not create the request");
  }
  const requestId = str(linked.value, "Portal_Request_Item_Id");
  w.adopt(PORTAL_FLOWS.request.id, requestId, `${code} request (S-OP)`, PORTAL_STEPS.fill.name);
  const req = await w.portal.adminGet("request", requestId);
  s.readBack("CIQ Case (raw)", pick(linked.value, ["Case_Code", "Supplier_Code", "Trade_Name", "Portal_Request_Item_Id", "Portal_Contact_Ids", "_status", "_current_step"]));
  s.readBack("CIQP Request (raw)", pick(req, ["Case_Code", "App_Case_Item_Id", "Supplier_Code", "Case_Phase_Label", "Assigned_Contacts", "_status", "_current_step"], { users: ["Assigned_Contacts"] }));
  s.check(`the case is at "${STEP_NAMES[STEPS.case.waiting]}"`, stepName(linked.value) === STEP_NAMES[STEPS.case.waiting], stepName(linked.value));
  s.check("the case's portal contact is the self contact's user", str(linked.value, "Portal_Contact_Ids").split(/[,;\s]+/).includes(w.who.id));
  s.check("the request names the case and is assigned to the self contact", str(req, "App_Case_Item_Id") === caseItemId && str(req, "Case_Code") === code && userIds(req, "Assigned_Contacts").includes(w.who.id));
  s.check(`the request is at "${PORTAL_STEPS.fill.name}"`, stepName(req) === PORTAL_STEPS.fill.name, stepName(req));
  return { code, caseItemId, requestId, supplierCode: str(linked.value, "Supplier_Code"), contacts: userIds(req, "Assigned_Contacts") };
}

// ---------------------------------------------------------------------------------- 3. completeness

/** The composition row K2.1 needs (testkit fillMandatory's, for this material). */
const COMPONENT = { id: "c1", inci: "Glycerin", cas: "56-81-5", fn: "humectant", additive: false, origin: "vegetable" as const, concMin: 99, concMax: 100 };

export async function setupCompleteness(w: World, s: StepCtx, sess: Session, plan: RunPlan, k: OpCase): Promise<void> {
  let p = await bootPortal(w, RUN_SCOPE);
  if (!s.check("the supplier's portal lists the request as a task", p.data.bundles.some((b) => b.code === k.code && b.step === "fill"))) throw new Error("the request is not the self contact's task");
  await p.actions.patchRequest(k.code, { config: plan.config });
  // what the supplier's completeness check lists, answered the way the portal lets the supplier: a justification per
  // item (no files in the live suite) and the composition row
  let left: string[] = [];
  for (let round = 0; round < 3; round++) {
    p = await bootPortal(w, RUN_SCOPE);
    const c = p.data.side.cases.find((x) => x.id === k.code);
    if (!c) throw new Error("the portal no longer shows the case");
    const blockers = completenessBlockers(c, p.data.side.config);
    left = blockers.map((b) => b.label);
    if (!blockers.length) break;
    const patch: AnswerPatch = { just: {}, set: {} };
    for (const b of blockers) {
      const f = b.fieldId ? fieldOf(b.fieldId, c.templateVersion, p.data.side.config) : undefined;
      if (b.fieldId?.startsWith("SF")) patch.config = { ...plan.config, ...patch.config };
      // a controller of a matrix chain (Yes → upload, No → reason) is answered, never justified (matrix v0.6 D10): No
      else if (b.fieldId && f?.noJustification) patch.set![b.fieldId] = f.type === "yesno" ? false : (f.options?.[0]?.value ?? "");
      else if (b.fieldId) patch.just![b.fieldId] = w.text("not available for this test material; a statement is on file.");
      else if (b.sectionId === "K2.1") patch.components = [COMPONENT];
    }
    await p.actions.patchRequest(k.code, patch);
  }
  s.check("no completeness blocker left", !left.length, left.slice(0, 10));
  await p.actions.confirmCompleteness(k.code);
  sess.dirty();
  // I-2: the completeness and the phase on the case (its Approve is expected to be refused, SPEC §2)
  const got = await w.hooks.poll(() => w.client.adminGet("case", k.caseItemId), (it) => str(it, "Completeness_Confirm") === "Confirmed");
  s.note("I-2 poll", polled(got));
  const req = await w.portal.adminGet("request", k.requestId);
  s.readBack("CIQP Request (raw)", pick(req, ["Completeness_Confirm", "Completeness_At", "Case_Phase_Label", "_status", "_current_step"]));
  s.readBack("CIQ Case (raw)", pick(got.value, ["Completeness_Confirm", "Completeness_At", "Case_Phase", "_status", "_current_step"]));
  // an e-mail is compared only when the self contact's is known (live: read with the roles at boot); "" = "" proves nothing
  s.check("the request's completeness is confirmed by the self contact (its e-mail)", str(req, "Completeness_Confirm") === "Confirmed" && !!w.who.email && str(req, "Completeness_By_Email").toLowerCase() === w.who.email.toLowerCase());
  s.check(`the request moved on to "${PORTAL_STEPS.keep.name}"`, stepName(req) === PORTAL_STEPS.keep.name, stepName(req));
  s.check("I-2 wrote the completeness and phase Review on the case", got.ok && str(got.value, "Case_Phase") === LIST.phase.review);
  // the Approve: blocked since 21 Oct 02:30 (S-CASE records it); noted here, as the case's step
  s.note("case step after I-2", stepName(got.value) === STEP_NAMES[STEPS.case.waiting] ? "still at Waiting for supplier: CIQ (I-2's Approve refused: Integration service has no members)" : stepName(got.value));
  const rmm = await sess.view("rmm");
  s.readBack("the case as RMM's screen maps it", { phase: caseIn(rmm.state, k.code)?.phase });
  s.check("RMM's screen shows the case in review", caseIn(rmm.state, k.code)?.phase === "review");
}

// ---------------------------------------------------------------------------------- 4. reviews

export async function setupReviews(w: World, s: StepCtx, sess: Session, k: OpCase, depts: ReviewDept[]): Promise<void> {
  // E-A runs inside I-2 (5-15 s after its POST): RMM's review at least, then every department the case names
  const found = await w.hooks.poll(
    async () => (await w.client.adminSearch("review", k.caseItemId)).filter((x) => str(x, "Case_Item_Id") === k.caseItemId),
    (rows) => rows.some((x) => str(x, "Review_Dept") === "RMM"),
  );
  s.note("E-A poll", { polls: found.polls, ms: found.ms, depts: found.value.map((x) => str(x, "Review_Dept")) });
  s.check("I-2 started the case's reviews (E-A), RMM's among them", found.ok);
  for (const raw of found.value) w.adopt(FLOWS.review.id, raw._id, `Review_Key=${str(raw, "Review_Key")} (started by I-2, E-A)`, stepName(raw));
  sess.dirty();
  const back = await sess.view("rmm");
  // and E-A's one case-level review.started row (the clean-up deletes it with the run's items)
  for (const r of back.snap.forms.audit.filter((x) => str(x, "Case_Item_Id") === k.caseItemId && str(x, "Action_Code") === "review.started" && str(x, "Object_Kind") === "Case"))
    w.adopt(FLOWS.audit.id, r._id, `Case_Code=${k.code} Action_Code=review.started (E-A)`, "saved");
  const c = caseIn(back.state, k.code);
  const reviews = (c?.reviews ?? []).map((r) => ({ dept: r.dept, status: r.status, item: back.mapped.index.reviews.get(`${k.code}|${r.dept}`)?.itemId ?? null }));
  s.readBack("the case's review tracks as RMM's screen maps them", reviews);
  // RMM's track always; a department's only when the scope activates it (its points check it when they are raised)
  s.check("RMM's review track exists", reviews.some((r) => r.dept === "RMM" && !!r.item));
  s.note("the run's departments without a review track", depts.filter((d) => !reviews.some((r) => r.dept === d && !!r.item)));
  const raw: Record<string, unknown>[] = [];
  for (const d of [...new Set<ReviewDept>(["RMM", ...depts])]) {
    const id = back.mapped.index.reviews.get(`${k.code}|${d}`)?.itemId;
    if (!id) continue;
    const it = await w.client.adminGet("review", id);
    raw.push(pick(it, ["Review_Key", "Review_Dept", "Case_Item_Id", "Round_No", "_status", "_current_step"]));
    s.check(`the ${d} review sits at "${STEP_NAMES[STEPS.review[d]]}"`, stepName(it) === STEP_NAMES[STEPS.review[d]], stepName(it));
    s.check(`the ${d} review names the case`, str(it, "Case_Item_Id") === k.caseItemId);
  }
  s.readBack("CIQ Review items (raw)", raw);
}

/** The section a department's point refers to: the plan's when the case's scope has it, else the first section of the
 *  scope the department leads, else the first that applies (the live rules may differ from the built-in catalogue). */
export function sectionFor(c: CiqCase, dept: ReviewDept, wanted: string): string {
  const live = c.scope.filter((x) => x.applicability !== "na");
  return (live.find((x) => x.sectionId === wanted) ?? live.find((x) => sectionOf(x.sectionId, c.templateVersion)?.lead === dept) ?? live[0])?.sectionId ?? wanted;
}

/** The section's label as the review screen shows it ("K3 · Storage conditions and handling"). */
export const refLabel = (sectionId: string) => `${sectionOf(sectionId)?.code ?? sectionId} · ${sectionOf(sectionId)?.title ?? sectionId}`;
