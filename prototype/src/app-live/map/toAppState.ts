// The live snapshot (load.ts) → the prototype's AppState plus the index the writers need (DESIGN §3.3, §5).
// Order: configuration (config.ts) → the directory (me first, the supplier master's contacts, every User field) →
// audit rows (the universal case index, auditMap.ts) → per case item: its open points, review tracks (a list row that
// names no case placed by the history row that names the item), RMES record, notes (trackMap.ts) and the case itself
// (caseMap.ts) → suppliers → final documents of completed cases.
// Join on item ids, never on case codes (not unique, R-13). No I/O; toasts and mails empty, the persona the acting one.
// One case (or one malformed history row) never stops the app loading for every role (M4): each case is mapped on its
// own, and a case that still fails is left out with a warning (its code in `dropped`, for production's one line).
// Warnings say what could not be read (data is missing); notes say how odd rows were mapped (a duplicate code, a row
// that names no case, an unknown kind or result): test scripts and hand-made rows cause those, the app writes none, so
// only dev shows them (FE-CLEANUP B3-B10, C1).
// The store calls syncRegistry(state.config) before rendering (as LiveSupplierStore does); nothing here needs it,
// because every domain call below passes the configuration explicitly.
import { currentPair, templateList } from "@/domain/configActions";
import type { ConfigState } from "@/domain/types";
import { buildFinalDocument } from "@/domain/finalDocument";
import { SCHEMA } from "@/domain/seed";
import type { AppState, ChangeReport, CiqCase, OpenPoint, ReviewDept } from "@/domain/types";
import { refUser, str, type RawItem } from "@/portal/data/raw";
import { STEPS, STEP_NAMES } from "../ids";
import type { LiveIndex, MapInput, Mapped, OpRef, ReleaseRow, ReviewRef, RmesRef, UnplacedReview } from "../types";
import { caseEntries, caseSnapshots, logOf, readAuditRows, type AuditRow } from "./auditMap";
import { caseBaseOf, caseCodeOf, toCase, type CaseSource } from "./caseMap";
import { configFromRows } from "./config";
import { Directory, registerPeople, selfContactId } from "./people";
import { suppliersFromCases, suppliersFromRows } from "./suppliersMap";
import { closeByCancellation, notesOf, openPointsOf, reviewsOf, rmesOf, type TrackCtx } from "./trackMap";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** Items deduplicated by _id (a later read of the same item fills in what an earlier one lacked). */
function dedupe(items: RawItem[]): RawItem[] {
  const byId = new Map<string, RawItem>();
  for (const it of items) if (it?._id) byId.set(it._id, { ...byId.get(it._id), ...it });
  return [...byId.values()];
}

/** Items per case item id (Case_Item_Id; an RMES row may only carry its Result_Case reference). */
function byCaseItem<T extends RawItem>(items: T[], notes: string[], what: string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = str(it, "Case_Item_Id") || refUser(it, "Result_Case")?.id || "";
    if (!k) {
      notes.push(`${what} ${it._id} names no case item; it is not shown.`);
      continue;
    }
    out.set(k, [...(out.get(k) ?? []), it]);
  }
  return out;
}

/**
 * Review rows read only from a list, placed by the history. A My items row carries no field of the review (live 21 Oct:
 * no Case_Item_Id, Review_Dept, Round_No or Review_Key), so it named no case and was dropped, and with it the live
 * status the case's phase decides from (m16). The latest audit row naming the item (Object_Item_Id) with a track snapshot
 * gives its case, department, round and key; the row's own fields win, and trackMap fills its other blanks from that
 * snapshot. A row no history line names stays as it is (byCaseItem notes it; index.unplacedReviews keeps it for the
 * load-time effects).
 */
function placedByHistory(items: RawItem[], rows: AuditRow[], sparse: ReadonlySet<string>): RawItem[] {
  const named = new Map<string, RawItem>();
  for (const r of rows) {
    const t = r.snap?.track;
    if (!t || !r.objectItemId || !r.caseItemId || !sparse.has(r.objectItemId)) continue;
    // oldest first: a later row names the item as it is now
    named.set(r.objectItemId, {
      _id: r.objectItemId,
      Case_Item_Id: r.caseItemId,
      ...(r.caseCode ? { Case_Code: r.caseCode } : {}),
      Review_Dept: t.dept,
      Round_No: typeof t.roundNo === "number" && t.roundNo > 0 ? t.roundNo : 1,
      ...(str(r.row, "Object_Key") ? { Review_Key: str(r.row, "Object_Key") } : {}),
    });
  }
  return items.map((it) => (!str(it, "Case_Item_Id") && named.has(it._id) ? ({ ...named.get(it._id)!, ...it } as RawItem) : it));
}

const REVIEW_DEPTS: readonly ReviewDept[] = ["REG", "SAF", "QM", "MIC", "SUS", "RMM"];

/** The department whose review step the item is at (`_activity_id`, as a live My items row carries it, else its
 *  context or its step's name), if any. */
function stepDeptOf(it: RawItem): ReviewDept | undefined {
  const ctx = Array.isArray(it._current_context) ? (it._current_context[0] as Record<string, unknown> | undefined) : undefined;
  const act = str(it, "_activity_id") || str(ctx, "_context_activity_id");
  const name = str(it, "_current_step");
  return REVIEW_DEPTS.find((d) => (act ? act === STEPS.review[d] : name === STEP_NAMES[STEPS.review[d]]));
}

/** LiveIndex.unplacedReviews: the review rows read only from a list that still name no case after placedByHistory (a
 *  review read in full that names none is nobody's). The load-time effects must not create or count around them. */
function unplacedOf(items: RawItem[], sparse: ReadonlySet<string>): UnplacedReview[] {
  return items
    .filter((it) => sparse.has(it._id) && !str(it, "Case_Item_Id") && !refUser(it, "Result_Case")?.id)
    .map((it) => {
      const dept = stepDeptOf(it);
      return { itemId: it._id, status: str(it, "_status"), ...(dept ? { dept } : {}) };
    });
}

const configPeopleMemo = new WeakMap<ConfigState, { key: string; out: ConfigState }>();

/**
 * The configuration's people as domain users (26 Oct, the live configuration editor): the writers store who created a
 * draft (the bundle's createdBy) and who published it (Published_By) as Kissflow user ids (write/config.ts), so each is
 * mapped through the directory (the acting user's alias applies: the Business administrator reads "u-admin") and a
 * Published_By's name is registered. "system" (the seed) and the static "u-admin" stay. The same objects when nothing
 * maps, and per mapping (configFromRows fix f: syncRegistry and the catalogue caches key on the identity).
 */
function configPeople(cfg: ConfigState, releases: ReleaseRow[], dir: Directory): ConfigState {
  for (const r of releases) {
    const u = refUser(r.raw, "Published_By");
    if (u) dir.internal(u.id, u.name && u.name !== u.id ? { name: u.name } : {});
  }
  const map = (id: string) => (!id || id === "system" ? id : dir.internal(id));
  const pairs = cfg.pairs.map((p) => {
    const createdBy = map(p.createdBy);
    const publishedBy = p.publishedBy ? map(p.publishedBy) : undefined;
    return createdBy === p.createdBy && publishedBy === p.publishedBy ? p : { ...p, createdBy, ...(publishedBy ? { publishedBy } : {}) };
  });
  if (pairs.every((p, i) => p === cfg.pairs[i])) return cfg;
  const key = pairs.map((p) => `${p.createdBy}|${p.publishedBy ?? ""}`).join("\n");
  const hit = configPeopleMemo.get(cfg);
  if (hit && hit.key === key) return hit.out;
  const out: ConfigState = { pairs };
  configPeopleMemo.set(cfg, { key, out });
  return out;
}

/** Makes sure every user id the state names is a user (an inactive stand-in where nobody could name it). */
function sweepUsers(cases: CiqCase[], changeReports: ChangeReport[], dir: Directory): void {
  const internal = (id?: string) => void dir.ensure(id, "internal");
  const supplier = (id?: string) => void dir.ensure(id, "supplier");
  const point = (p: OpenPoint) => {
    internal(p.createdBy);
    internal(p.responsibleId);
    internal(p.closedBy);
    for (const m of p.thread) (m.side === "supplier" ? supplier : internal)(m.by);
    for (const e of p.edits ?? []) internal(e.by);
  };
  for (const c of cases) {
    internal(c.ownerId);
    c.supplierContactIds.forEach(supplier);
    for (const r of c.reviews) internal(r.assigneeId);
    c.openPoints.forEach(point);
    for (const x of c.confirmations) (x.type === "completeness" || x.type === "final-release" ? supplier : internal)(x.by);
    for (const n of c.internalNotes) {
      internal(n.by);
      n.mentions?.forEach(internal);
    }
    for (const cr of c.rmes?.criteria ?? []) internal(cr.by);
    for (const v of Object.values(c.answeredBy)) supplier(v.by);
    for (const d of c.documents) supplier(d.uploadedBy);
    internal(c.cancelled?.by);
  }
  for (const r of changeReports) supplier(r.by);
}

export function toAppState(x: MapInput): Mapped {
  const { snap, identity, acting } = x;
  const warnings: string[] = [];
  const mapNotes: string[] = [];
  const dropped: string[] = [];
  const conf = configFromRows(snap.forms.config);
  mapNotes.push(...conf.notes);

  // people: me first (it always wins), then the supplier master's contacts, then every User field
  const dir = new Directory(acting.me, identity.kfUserId);
  // a supplier row whose full read failed, unless an earlier load's contacts are shown for it (load.ts keepUnread)
  const unreadSuppliers = new Set((snap.unreadRows?.supplier ?? []).filter((id) => !snap.keptRows?.[id]));
  const master = suppliersFromRows(snap.forms.supplier, dir, mapNotes, unreadSuppliers);
  registerPeople(snap, dir);
  const rows = readAuditRows(snap.forms.audit, dir);
  // after the audit rows: their actors name the people who created a configuration draft
  const cfg = configPeople(conf.cfg, conf.releases, dir);
  // 27 Oct: the colleagues of the CIQ roles (app-live/colleagues.ts), after everyone the items name (their names, titles
  // and ids stay) and before the notes, whose mentions resolve by e-mail
  for (const c of x.colleagues ?? []) dir.colleague(c);
  const tasks = new Map(snap.tasks.map((t) => [t.itemId, t]));

  // the cases: live items, the case.created snapshots, and cases only a review / point / note / RMES row names
  const sources = new Map<string, CaseSource>();
  const source = (itemId: string): CaseSource => {
    let s = sources.get(itemId);
    if (!s) sources.set(itemId, (s = { itemId, rows: [] }));
    return s;
  };
  for (const it of dedupe(snap.items.case)) source(it._id).item = it;
  for (const [id, why] of Object.entries(snap.unreadableCases)) source(id).unreadable = why;
  const unplaced: AuditRow[] = [];
  for (const r of rows) {
    const id = r.caseItemId || (r.code === "case.created" ? r.snap?.case?.itemId || r.objectItemId : "");
    if (id) source(id).rows.push(r);
    else if (r.caseCode) unplaced.push(r);
  }
  const sparse = new Set(snap.sparse ?? []);
  const reviewItems = placedByHistory(dedupe(snap.items.review), rows, sparse);
  const reviewsBy = byCaseItem(reviewItems, mapNotes, "Review");
  const opsBy = byCaseItem(dedupe(snap.items.op), mapNotes, "Open point");
  const notesBy = byCaseItem(snap.forms.note, mapNotes, "Internal note");
  const rmesBy = new Map<string, { dept: "SAF" | "REG"; item: RawItem }[]>();
  for (const [flow, dept] of [["rmesSAF", "SAF"], ["rmesREG", "REG"]] as const)
    for (const [k, list] of byCaseItem(snap.forms[flow], mapNotes, `${dept} RMES record`)) rmesBy.set(k, [...(rmesBy.get(k) ?? []), ...list.map((item) => ({ dept, item }))]);
  for (const [k, list] of [...reviewsBy, ...opsBy, ...notesBy]) {
    const s = source(k);
    if (!s.item && !s.stub) s.stub = list[0];
  }
  for (const k of rmesBy.keys()) source(k);

  // case ids: the case code, unique (a second case with the same code gets "·2", R-13)
  const codes = new Map<string, string>();
  const used = new Set<string>();
  const snapsOf = new Map<string, ReturnType<typeof caseSnapshots>>();
  for (const s of [...sources.values()]) {
    try {
      snapsOf.set(s.itemId, caseSnapshots(s.rows, dir, warnings));
    } catch (e) {
      warnings.push(`${caseCodeOf(s) || s.itemId}: its history could not be read (${errText(e)}); the case is not shown.`);
      dropped.push(caseCodeOf(s) || s.itemId);
      sources.delete(s.itemId);
    }
  }
  for (const s of [...sources.values()].sort((a, b) => time(str(a.item, "_created_at") || snapsOf.get(a.itemId)!.header?.createdAt || "") - time(str(b.item, "_created_at") || snapsOf.get(b.itemId)!.header?.createdAt || ""))) {
    const code = caseCodeOf(s, snapsOf.get(s.itemId)!.header) || s.itemId;
    let id = code;
    for (let n = 2; used.has(id); n++) id = `${code}·${n}`;
    if (id !== code) mapNotes.push(`Two cases share the code ${code} (item ${s.itemId}); the later one is shown as ${id}.`);
    used.add(id);
    codes.set(s.itemId, id);
  }
  // rows that name a case by its code only
  for (const r of unplaced) {
    const itemId = [...codes].find(([, code]) => code === r.caseCode)?.[0];
    if (itemId) sources.get(itemId)!.rows.push(r);
  }

  const index: LiveIndex = { cases: new Map(), reviews: new Map(), ops: new Map(), rmes: new Map(), suppliers: new Map(master.refs.map((r) => [r.supplierId, r])), releases: conf.releases, settings: conf.settings, caseBanners: new Map(), configRows: snap.forms.config };
  const unplacedReviews = unplacedOf(reviewItems, sparse);
  if (unplacedReviews.length) index.unplacedReviews = unplacedReviews;
  const cases: CiqCase[] = [];
  const changeReports: ChangeReport[] = [];
  const seenOps = new Set<string>();
  index.casePins = new Map();
  for (const s of sources.values()) {
    const caseId = codes.get(s.itemId)!;
    try {
      s.rows.sort((a, b) => time(a.at) - time(b.at));
      const snaps = caseSnapshots(s.rows, dir); // again: rows named by their code only may have joined (warned above)
      const base = caseBaseOf(s, caseId, snaps, dir);
      const ctx: TrackCtx = { caseId, caseItemId: s.itemId, ownerId: base.ownerId, supplierId: base.supplierId, dir, tasks, warnings, notes: mapNotes, sparse };
      const ops = openPointsOf(opsBy.get(s.itemId) ?? [], snaps.ops, ctx, seenOps);
      const points = closeByCancellation(ops.points, snaps.cancelled).sort((a, b) => time(a.createdAt) - time(b.createdAt));
      const tracks = reviewsOf(reviewsBy.get(s.itemId) ?? [], snaps.tracks, points, ctx);
      const rmes = rmesOf(rmesBy.get(s.itemId) ?? [], ctx, s.rows);
      const notes = notesOf(notesBy.get(s.itemId) ?? [], snaps.notes, ctx);
      const m = toCase(base, { reviews: tracks.reviews, openPoints: points, ...(rmes.rmes ? { rmes: rmes.rmes } : {}), notes, completions: tracks.completions, entries: caseEntries(s.rows, dir, x.env) }, conf, dir, snap.loadedAt, mapNotes);
      cases.push(m.c);
      if (m.changeReport) changeReports.push(m.changeReport);
      index.cases.set(caseId, m.ref);
      if (m.banner) index.caseBanners.set(caseId, m.banner);
      if (m.pin) index.casePins.set(caseId, m.pin);
      for (const r of ops.refs) index.ops.set(r.opId, r satisfies OpRef);
      for (const r of tracks.refs) index.reviews.set(`${caseId}|${r.dept}`, r satisfies ReviewRef);
      for (const r of rmes.refs) index.rmes.set(`${caseId}|${r.dept}`, r satisfies RmesRef);
    } catch (e) {
      warnings.push(`${caseId}: this case could not be read (${errText(e)}); it is not shown. Diagnostics lists the other warnings.`);
      dropped.push(caseId);
    }
  }
  // newest first, as the domain's createCase prepends
  cases.sort((a, b) => time(b.createdAt) - time(a.createdAt));

  const suppliers = [...master.suppliers, ...suppliersFromCases(cases, master.suppliers)];
  sweepUsers(cases, changeReports, dir);
  let log: AppState["log"] = [];
  try {
    log = logOf(rows, dir, x.env);
  } catch (e) {
    warnings.push(`The supplier-master and configuration history could not be read (${errText(e)}).`);
  }
  // One person in two roles (dev): the signed-in user is also a supplier contact, the self contact (map/people.ts).
  // The Beiersdorf user shows no e-mail then, so the e-mail names one user of the state. Since 26 Oct the domain no
  // longer refuses an e-mail a Beiersdorf user holds (domain/suppliers.ts validateContact: one e-mail per contact within
  // a supplier only), and the lookups by e-mail look within the case's supplier (map/people.ts contactOf) or among
  // Beiersdorf users (byEmail); this stays as proven on 21 Oct [decision]. The writers take the user's e-mail from the
  // identity, never from here.
  const self = dir.get(selfContactId(identity.kfUserId));
  const users = self?.side === "supplier" ? dir.list().map((u) => (u.id === acting.me.id ? { ...u, email: "" } : u)) : dir.list();
  const state: AppState = {
    schema: SCHEMA,
    personaId: acting.personaId,
    cases,
    users,
    suppliers,
    templates: templateList(cfg),
    activeRuleSet: currentPair({ config: cfg }).ruleSetVersion,
    config: cfg,
    ownership: conf.ownership,
    reminders: conf.reminders,
    toasts: [],
    mails: [],
    log,
    changeReports,
  };
  // P2: the final document of a completed case, computed (no v6 writer seals one, G4)
  state.cases = state.cases.map((c) => {
    if (c.phase !== "completed") return c;
    const rel = c.confirmations.find((k) => k.type === "final-release");
    const at = rel?.at ?? [...c.phaseHistory].reverse().find((p) => p.phase === "completed")?.at ?? c.createdAt;
    try {
      return { ...c, finalDocument: buildFinalDocument(state, c, at, rel?.name ? `Final release by ${rel.name}` : "Final release") };
    } catch (e) {
      warnings.push(`${c.id}: the final document could not be computed (${e instanceof Error ? e.message : String(e)}).`);
      return c;
    }
  });
  return { state, index, warnings, notes: mapNotes, dropped };
}
