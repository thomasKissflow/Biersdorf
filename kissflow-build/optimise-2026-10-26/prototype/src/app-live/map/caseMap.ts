// A CIQ Case item (else its `case.created` snapshot) → the prototype's CiqCase (DESIGN §5.1).
// The 15 supplier-data fields the integrations copy from the portal request (G-14: Config_Answers_JSON … Change_Report_At,
// same names and shapes as on CIQP Request) are parsed with the portal's own readers: readDoc (answers.ts),
// storedScope / storedSlots / liveScope (scope.ts), caseContactsOf / parseMarkets (map.ts). The phase is derived, in
// DESIGN's order, from the item's step and fields, the review tracks and the case's audit codes (G1).
// The scope keeps Beiersdorf's internal reasons: the synced Scope_JSON is supplier-worded, so where the rules derive
// the same applicability, their reason and fired rules are restored (G8). Pure.
import { INTERNAL_PERSONAS, fieldOf } from "@/domain/catalog";
import { FIRST_PAIR } from "@/domain/configActions";
import { deriveRequestedDocs } from "@/domain/requestedDocs";
import { deriveScope } from "@/domain/rules";
import { BDF_SET_FIELDS } from "@/domain/selectors";
import type { AnswerValue, Answers, AuditEvent, ChangeReport, CiqCase, Confirmation, ConfigAnswers, ConfigState, DocKind, DocumentRef, InternalNote, Market, OpenPoint, Phase, PhaseStamp, ReviewTrack, RmesRecord, ScopeItem } from "@/domain/types";
import { readDoc } from "@/portal/data/answers";
import { caseContactsOf, parseMarkets } from "@/portal/data/map";
import { json, num, str, type RawItem } from "@/portal/data/raw";
import { liveScope, partOfPhase, storedScope, storedSlots } from "@/portal/data/scope";
import { LIST, STEPS, STEP_NAMES } from "../ids";
import type { CaseRef } from "../types";
import { lastOf, type AuditRow, type CaseHeader, type CaseSnapshots } from "./auditMap";
import type { ConfigRead } from "./config";
import type { Directory } from "./people";
import { dateIso } from "./trackMap";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};
const valid = (v: string | undefined): v is string => !!v && Number.isFinite(Date.parse(v));
const MARKETS = new Set<Market>(["EU", "UK", "TR", "CN", "US", "CA", "OTHER"]);
const DOC_KINDS = new Set<DocKind>(["SDS", "CoA", "Specification", "Analysis", "Certificate", "Statement", "Other"]);

/** The supplier's declaration texts as the domain writes them (actions.ts confirmCompleteness, finalRelease), used
 *  when the case carries no *_Declaration_Text. */
const COMPLETENESS_NOTE = "Completeness confirmation: data and documents provided from the supplier's point of view. Not a Beiersdorf approval.";
const RELEASE_NOTE = "Final CIQ release: the information and evidence are correct and complete. The CIQ is frozen.";

export const UNREADABLE_BANNER = (why: string) => `Kissflow did not let your role read this case's questionnaire (${why}). You see its header, reviews and open points.`;

/** What toAppState knows of one case item. */
export interface CaseSource {
  itemId: string;
  /** The live CIQ Case item (full where a read rung allowed it). */
  item?: RawItem;
  /** A review or open-point item of the case standing in for a missing header (Case_Code, Trade_Name, Supplier_Code). */
  stub?: RawItem;
  /** Why the item could not be read in full (LiveSnapshot.unreadableCases). */
  unreadable?: string;
  /** The case's audit rows, oldest first. */
  rows: AuditRow[];
}

export interface CaseBase {
  caseId: string;
  itemId: string;
  cycleNo: number;
  supplierId: string;
  ownerId: string;
  contactIds: string[];
  contacts: CaseRef["contacts"];
  readable: boolean;
  item?: RawItem;
  header?: CaseHeader;
  stub?: RawItem;
  unreadable?: string;
  rows: AuditRow[];
  snaps: CaseSnapshots;
}

/** The case's code from its item, its header snapshot, a stub or its audit rows ("" when none is known). */
export const caseCodeOf = (src: Pick<CaseSource, "item" | "stub" | "rows">, header?: CaseHeader): string =>
  str(src.item, "Case_Code") || header?.caseId || str(src.stub, "Case_Code") || src.rows.find((r) => r.caseCode)?.caseCode || "";

/** The parts of a case everything else hangs on: its owner and its supplier contacts (registered in the directory). */
export function caseBaseOf(src: CaseSource, caseId: string, snaps: CaseSnapshots, dir: Directory): CaseBase {
  const { item, stub } = src;
  const header = snaps.header;
  const supplierId = str(item, "Supplier_Code") || header?.supplierId || str(stub, "Supplier_Code");
  const ownerId = dir.userField(item, "Owner_RMM", { dept: "RMM" }) || header?.ownerId || dir.roleUser("RMM");
  const listed = item && str(item, "Case_Contacts_JSON").trim() ? caseContactsOf(item) : (Array.isArray(header?.contacts) ? header.contacts : []).filter((k) => isObj(k)).map((k) => ({ id: k.id || undefined, name: k.name, email: k.email, role: k.title, mayConfirm: k.mayConfirm }));
  const contactIds: string[] = [];
  const contacts: CaseRef["contacts"] = [];
  for (const k of listed) {
    // the supplier master knows better whether a contact may confirm (it is registered first); the contact's own id
    // (the signed-in user's portal user is the self contact, not the Beiersdorf user)
    const cid = k.id ? dir.contactId(k.id) : "";
    const known = cid ? dir.get(cid) && !dir.isStub(cid) : false;
    const id = cid
      ? dir.contact(cid, { name: k.name, email: k.email, title: k.role, supplierId, ...(known ? {} : { mayConfirm: k.mayConfirm }) })
      : dir.contactOf({ email: k.email, name: k.name }, supplierId);
    if (contactIds.includes(id)) continue;
    contactIds.push(id);
    const u = dir.get(id);
    contacts.push({ id, name: u?.name ?? k.name, email: u?.email ?? k.email ?? "" });
  }
  return {
    caseId,
    itemId: src.itemId,
    cycleNo: num(item, "Cycle_No") ?? header?.cycleNo ?? num(stub, "Cycle_No") ?? 1,
    supplierId,
    ownerId,
    contactIds,
    contacts,
    readable: !!item && !src.unreadable,
    ...(item ? { item } : {}),
    ...(header ? { header } : {}),
    ...(stub ? { stub } : {}),
    ...(src.unreadable ? { unreadable: src.unreadable } : {}),
    rows: src.rows,
    snaps,
  };
}

// ---------------------------------------------------------------------------------- phase (G1)

type CaseStep = "start" | "waiting" | "release" | "end";

/** The case's step from `_current_step` (its live name) or `_current_context[0]._context_activity_id`. */
export function caseStepOf(it: RawItem | undefined): CaseStep | undefined {
  if (!it) return undefined;
  const ctx = Array.isArray(it._current_context) ? (it._current_context[0] as Obj | undefined) : undefined;
  const name = str(it, "_current_step") || str(ctx, "_context_current_step");
  const act = str(ctx, "_context_activity_id");
  for (const k of ["start", "waiting", "release", "end"] as const) if (act === STEPS.case[k] || name === STEP_NAMES[STEPS.case[k]]) return k;
  return undefined;
}

/**
 * DESIGN §5.1, in order: (1) cancelled: the latest of case.cancelled / case.reactivated is a cancel, or Cancelled_At
 * is set (and not reactivated later); (2) completed: the item is Completed, at End, or Final_Release_At is set;
 * (3) supplier-input: at "Create case" / "Waiting for supplier: CIQ" (or a step the read did not report and no
 * review known) with Case_Phase ≠ Review and no Completeness_At; for an item that can't be read (or was read only as
 * a list row without those two fields), no review known and not at "Beiersdorf review and final release";
 * (4) final-release: every latest-round track completed, or the latest of release.requested / review.reopened is a
 * request; (5) review.
 */
export function casePhase(x: { item?: RawItem; readable: boolean; reviews: ReviewTrack[]; rows: AuditRow[] }): Phase {
  const { item, reviews, rows } = x;
  const cancel = lastOf(rows, ["case.cancelled", "case.reactivated"]);
  if (cancel?.code === "case.cancelled") return "cancelled";
  const cancelledAt = str(item, "Cancelled_At");
  if (!cancel && cancelledAt && !(time(str(item, "Reactivated_At")) > time(cancelledAt))) return "cancelled";
  const step = caseStepOf(item);
  if (str(item, "_status") === "Completed" || step === "end" || str(item, "Final_Release_At")) return "completed";
  // an item not read in full may lack the phase fields: a live My items row carries only its status and step (21 Oct),
  // so a case in review still at "Waiting for supplier: CIQ" read as supplier input. Absent is unknown there, not
  // blank: the reviews decide, as for a case without an item; but its step still counts where it tells more (a case at
  // "Beiersdorf review and final release" is past the supplier's input, reviews known or not)
  if (item && (x.readable || "Case_Phase" in item || "Completeness_At" in item)) {
    const atSupplier = step === "start" || step === "waiting" || (step === undefined && !reviews.length);
    if (atSupplier && str(item, "Case_Phase") !== LIST.phase.review && !str(item, "Completeness_At")) return "supplier-input";
  } else if (!reviews.length && step !== "release") return "supplier-input";
  if (reviews.length && reviews.every((r) => r.status === "completed")) return "final-release";
  if (lastOf(rows, ["release.requested", "review.reopened"])?.code === "release.requested") return "final-release";
  return "review";
}

/** The phase stamps (never empty, oldest first, every `at` a valid date). */
export function phaseHistoryOf(x: { phase: Phase; createdAt: string; item?: RawItem; reviews: ReviewTrack[]; rows: AuditRow[] }): PhaseStamp[] {
  const { item, rows } = x;
  const out: PhaseStamp[] = [{ phase: "supplier-input", at: x.createdAt }];
  const firstReview = rows.find((r) => r.code === "review.started")?.at ?? x.reviews.map((r) => r.startedAt ?? "").filter(valid).sort((a, b) => time(a) - time(b))[0];
  const reviewAt = str(item, "Completeness_At") || firstReview;
  if (x.phase !== "supplier-input" && valid(reviewAt)) out.push({ phase: "review", at: reviewAt });
  let cur: Phase = out.at(-1)!.phase;
  for (const r of rows) {
    if (r.code === "release.requested" && cur === "review") out.push({ phase: (cur = "final-release"), at: r.at });
    else if (r.code === "review.reopened" && cur === "final-release") out.push({ phase: (cur = "review"), at: r.at });
    else if (r.code === "case.cancelled" && cur !== "cancelled") out.push({ phase: (cur = "cancelled"), at: r.at });
    else if (r.code === "case.reactivated" && cur === "cancelled") {
      const back = [...out].reverse().find((p) => p.phase !== "cancelled")?.phase ?? "supplier-input";
      out.push({ phase: (cur = back), at: r.at });
    }
  }
  const released = str(item, "Final_Release_At");
  if (x.phase === "completed") out.push({ phase: "completed", at: valid(released) ? released : str(item, "_modified_at") || out.at(-1)!.at });
  if (x.phase === "cancelled" && cur !== "cancelled") out.push({ phase: "cancelled", at: str(item, "Cancelled_At") || str(item, "_modified_at") || out.at(-1)!.at });
  // the phase the case is in now is the last stamp (a step the audit did not record: stamped at the last change)
  if (out.at(-1)!.phase !== x.phase) out.push({ phase: x.phase, at: [str(item, "_modified_at"), out.at(-1)!.at].filter(valid).sort((a, b) => time(b) - time(a))[0] ?? x.createdAt });
  return out.filter((p) => valid(p.at)).sort((a, b) => time(a.at) - time(b.at));
}

// ---------------------------------------------------------------------------------- the case

export interface CaseParts {
  reviews: ReviewTrack[];
  openPoints: OpenPoint[];
  rmes?: RmesRecord;
  notes: InternalNote[];
  /** Dept-completion confirmations of every round (trackMap.reviewsOf). */
  completions: Confirmation[];
  /** The case's audit rows' entries (auditMap.caseEntries), not yet numbered. */
  entries: AuditEvent[];
}

export interface CaseMapped {
  c: CiqCase;
  ref: CaseRef;
  /** Why parts of the case are missing (unreadable item, configuration pin problem). */
  banner?: string;
  /** The configuration pin problem alone (the shell's warning banner on the case pages, m15). */
  pin?: string;
  changeReport?: ChangeReport;
}

/** Documents_JSON (portal map.ts documentsJsonOf) → DocumentRef[], oldest first. */
function documentsOf(it: RawItem | undefined, base: CaseBase, dir: Directory): DocumentRef[] {
  const rows = json<unknown>(it, "Documents_JSON", []);
  if (!Array.isArray(rows)) return [];
  const out: DocumentRef[] = [];
  for (const r of rows) {
    if (!isObj(r) || typeof r.uploadId !== "string" || !r.uploadId) continue;
    const kind = String(r.docKind ?? "") as DocKind;
    const email = typeof r.uploadedByEmail === "string" ? r.uploadedByEmail : "";
    out.push({
      id: r.uploadId,
      name: typeof r.fileName === "string" && r.fileName ? r.fileName : "Document",
      kind: DOC_KINDS.has(kind) ? kind : "Other",
      sectionId: typeof r.sectionKey === "string" && r.sectionKey ? r.sectionKey : "GEN",
      ...(typeof r.fieldKey === "string" && r.fieldKey ? { fieldId: r.fieldKey } : {}),
      version: 1,
      uploadedBy: email ? dir.contactIdByEmail(email, undefined, base.supplierId) : "system",
      uploadedAt: typeof r.uploadedAt === "string" && valid(r.uploadedAt) ? r.uploadedAt : str(it, "Answers_Changed_At") || str(it, "_modified_at"),
      sizeKb: 0, // Kissflow's attachment size is not copied: the screens hide an unknown size
    });
  }
  return out.sort((a, b) => time(a.uploadedAt) - time(b.uploadedAt));
}

/** The values Beiersdorf sets (BDF_Set_JSON) and SF-11: the five GEN answers, with the header fields standing in. */
function bdfSetOf(base: CaseBase): { answers: Answers; markets: Market[] } {
  const { item, header } = base;
  const set = (() => {
    const v = json<unknown>(item, "BDF_Set_JSON", undefined);
    return isObj(v) ? v : (header?.bdfSet ?? {});
  })();
  const answers: Answers = {};
  for (const k of BDF_SET_FIELDS) {
    const v = set[k];
    if (typeof v === "string" && v.trim()) answers[k] = v;
  }
  const trade = str(item, "Trade_Name") || header?.materialName;
  const legal = str(item, "Supplier_Legal_Name") || header?.manufacturer;
  if (!answers["FLD-GEN-001"] && trade) answers["FLD-GEN-001"] = trade;
  if (!answers["FLD-GEN-002"] && legal) answers["FLD-GEN-002"] = legal;
  if (!answers["FLD-GEN-003"] && header?.duns) answers["FLD-GEN-003"] = header.duns;
  const sf11 = Array.isArray(set.SF11) ? (set.SF11 as unknown[]).filter((m): m is Market => typeof m === "string" && MARKETS.has(m as Market)) : [];
  const label = str(item, "Markets_Label") || str(item, "Target_Markets_Text");
  return { answers, markets: sf11.length ? sf11 : label ? parseMarkets(label) : Array.isArray(header?.markets) ? header.markets : [] };
}

/** The case banner of a pin problem (FE-CLEANUP B1, B2): calm words in both environments. Only test-script cases pin
 *  a pair or a fingerprint no release has; a case started in the app copies its release's own (write/encode.ts). */
export const PIN_UNKNOWN = "This case uses a questionnaire version that is not available here, so its sections may differ from what the supplier filled in.";
export const PIN_HASH = "This case's questionnaire differs from the published version. Check with the Business administrator before relying on its sections.";

/** The pin check (reader E §2.3): an unknown pair would silently render the built-in sections, so say so. `raw` names
 *  the versions and the release (a dev note). */
function pinProblem(rsv: string, tplv: string, manifestHash: string, conf: ConfigRead): { banner: string; raw: string } | undefined {
  const first = rsv === FIRST_PAIR.ruleSetVersion && tplv === FIRST_PAIR.templateVersion;
  if (!first && !conf.cfg.pairs.some((p) => p.ruleSet.version === rsv && p.template.version === tplv))
    return { banner: PIN_UNKNOWN, raw: `This case is pinned to rule set ${rsv} with questionnaire ${tplv}, which no configuration release provides; its sections may be shown from another questionnaire version.` };
  const rel = conf.releases.find((r) => r.ruleSetVersion === rsv && r.templateVersion === tplv && r.state !== "Draft");
  const want = str(rel?.raw, "Manifest_Hash");
  if (manifestHash && want && manifestHash !== want) return { banner: PIN_HASH, raw: `This case's configuration fingerprint does not match the release ${rel!.key}; check the configuration before relying on its sections.` };
  return undefined;
}

/** Restores the internal reason and fired rules where the rules derive the same applicability (G8). */
function withInternalReasons(scope: ScopeItem[], derived: ScopeItem[]): ScopeItem[] {
  const byId = new Map(derived.map((d) => [d.sectionId, d]));
  return scope.map((s) => {
    const d = byId.get(s.sectionId);
    return d && d.applicability === s.applicability ? { ...s, reason: d.reason, firedRules: [...d.firedRules] } : s;
  });
}

/** The supplier-side history the app has no audit row for: the completeness confirmation, every supplier answer in a
 *  point's thread, the final release and a change report (the domain's own phrases). */
function supplierEntries(points: OpenPoint[], completeness: Confirmation | undefined, release: Confirmation | undefined, report: ChangeReport | undefined): AuditEvent[] {
  const out: AuditEvent[] = [];
  if (completeness) out.push({ id: "", at: completeness.at, by: completeness.by, action: "Confirmed completeness", detail: `Confirmed by ${completeness.name}${completeness.email ? ` <${completeness.email}>` : ""}. Part 1 completed; the review starts.` });
  for (const p of points)
    for (const m of p.thread)
      if (m.side === "supplier" && (m.action === "answered" || m.action === "cannot-provide"))
        out.push({ id: "", at: m.at, by: m.by, action: m.action === "cannot-provide" ? "Justified non-delivery" : "Answered query", detail: `${p.id}: ${m.text}`, sectionId: p.ref.sectionId });
  if (release) out.push({ id: "", at: release.at, by: release.by, action: "Gave final release", detail: "CIQ frozen: every answer and upload is locked." });
  if (report) out.push({ id: "", at: report.at, by: report.by, action: "Reported a change after release", detail: `${report.id}: ${report.text} The released CIQ stays unchanged.` });
  return out;
}

/** `notes`: what the dev shell and Diagnostics list about this case's pins (the banner says it to everyone). */
export function toCase(base: CaseBase, parts: CaseParts, conf: ConfigRead, dir: Directory, loadedAt: string, notes: string[]): CaseMapped {
  const { item, header, caseId, supplierId } = base;
  const cfg: ConfigState = conf.cfg;
  const createdAt = [str(item, "_created_at"), header?.createdAt, base.rows[0]?.at, str(base.stub, "_created_at"), loadedAt].find(valid) ?? new Date().toISOString();
  let ruleSetVersion = str(item, "Rule_Set_Version") || header?.ruleSetVersion || "";
  let templateVersion = str(item, "Template_Version") || header?.templateVersion || "";
  const banners: string[] = [];
  let pinText: string | undefined;
  if (!base.readable) banners.push(UNREADABLE_BANNER(base.unreadable || (item ? "only part of it could be read" : "no read route for this role")));
  if (!ruleSetVersion || !templateVersion) {
    if (base.readable) notes.push(`${caseId}: no pinned rule set / questionnaire version; the first configuration is shown.`);
    ruleSetVersion = ruleSetVersion || FIRST_PAIR.ruleSetVersion;
    templateVersion = templateVersion || FIRST_PAIR.templateVersion;
  } else {
    const pin = pinProblem(ruleSetVersion, templateVersion, str(item, "Manifest_Hash"), conf);
    if (pin) {
      // the banner only: the same text in the load warnings was a duplicate (B1)
      pinText = pin.banner;
      banners.push(pin.banner);
      notes.push(`${caseId}: ${pin.raw}`);
    }
  }

  const phase = casePhase({ item, readable: base.readable, reviews: parts.reviews, rows: base.rows });

  // the supplier's data (the 15 synced fields), parsed as the portal parses them
  const doc = readDoc(item);
  const set = bdfSetOf(base);
  const config = { ...(doc.config as ConfigAnswers), SF11: set.markets } as ConfigAnswers;
  const answers: Answers = { ...set.answers, ...doc.answers };
  const answeredBy: CiqCase["answeredBy"] = {};
  const stampAt = str(item, "Answers_Changed_At") || str(item, "_modified_at") || createdAt;
  for (const [k, s] of Object.entries(doc.answeredBy)) {
    if (!isObj(s)) continue;
    const at = typeof s.at === "string" && valid(s.at) ? s.at : stampAt;
    answeredBy[k] = { by: dir.contactOf({ id: typeof s.by === "string" ? s.by : undefined, email: typeof s.email === "string" ? s.email : undefined, name: typeof s.name === "string" ? s.name : undefined }, supplierId), at };
  }
  const documents = documentsOf(item, base, dir);
  // an upload answers its file question (latest file), as in the prototype; Answers_JSON never carries file answers
  for (const d of documents) {
    if (!d.fieldId || fieldOf(d.fieldId, templateVersion, cfg)?.type !== "file") continue;
    answers[d.fieldId] = d.id as AnswerValue;
    answeredBy[d.fieldId] = { by: d.uploadedBy, at: d.uploadedAt };
  }

  const derived = deriveScope(config, ruleSetVersion, templateVersion, cfg);
  const stored = storedScope(json<unknown>(item, "Scope_JSON", []));
  const scope = withInternalReasons(liveScope({ config, ruleSetVersion, templateVersion, cfg, part: partOfPhase(phase), stored, manual: [] }), derived);

  // confirmations
  const confirmations: Confirmation[] = [];
  const cmpAt = str(item, "Completeness_At");
  const completeness: Confirmation | undefined =
    cmpAt || str(item, "Completeness_Confirm") === LIST.confirm
      ? (() => {
          const email = str(item, "Completeness_By_Email");
          const name = str(item, "Completeness_By_Name");
          return { type: "completeness", by: dir.contactOf({ email, name }, supplierId), name, email, role: str(item, "Completeness_By_Role"), at: valid(cmpAt) ? cmpAt : stampAt, reviewVersion: 1, note: str(item, "Completeness_Declaration_Text") || COMPLETENESS_NOTE };
        })()
      : undefined;
  if (completeness) confirmations.push(completeness);
  confirmations.push(...parts.completions);
  const relAt = str(item, "Final_Release_At");
  const release: Confirmation | undefined = relAt
    ? (() => {
        const email = str(item, "Final_Release_By_Email");
        const name = str(item, "Final_Release_By_Name");
        return { type: "final-release", by: dir.contactOf({ email, name }, supplierId), name, email, role: str(item, "Final_Release_By_Role"), at: relAt, reviewVersion: 1, note: str(item, "Final_Release_Declaration_Text") || RELEASE_NOTE };
      })()
    : undefined;
  if (release) confirmations.push(release);

  // cancellation: the latest case.cancelled snapshot (G2), else the item's own fields
  let cancelled: CiqCase["cancelled"];
  if (phase === "cancelled") {
    const s = base.snaps.cancelled;
    const from = str(item, "Cancelled_From_Phase") as Phase;
    cancelled = s
      ? { by: s.by, at: s.at, reason: s.reason, ...(s.fromPhase ? { fromPhase: s.fromPhase } : {}) }
      : { by: base.ownerId, at: str(item, "Cancelled_At") || str(item, "_modified_at") || createdAt, reason: str(item, "Cancel_Reason"), ...(["supplier-input", "review", "final-release"].includes(from) ? { fromPhase: from } : {}) };
    const conf2 = base.snaps.cancellation;
    const by = dir.get(cancelled.by);
    confirmations.push(conf2 ?? { type: "cancellation", by: cancelled.by, name: by?.name ?? "", email: by?.email ?? "", role: INTERNAL_PERSONAS[0]!.label, at: cancelled.at, reviewVersion: 1, note: cancelled.reason });
  }
  confirmations.sort((a, b) => time(a.at) - time(b.at));

  // a change report after the release (G6: the latest only)
  const reportText = str(item, "Change_Report_Text");
  const changeReport: ChangeReport | undefined = reportText
    ? { id: `${caseId}-cr${num(item, "Change_Report_Rev") ?? 1}`, caseId, at: str(item, "Change_Report_At") || str(item, "_modified_at") || createdAt, by: dir.contactIdByEmail(str(item, "Change_Report_By_Email"), undefined, supplierId), text: reportText }
    : undefined;

  // history: the rows' entries plus the supplier's side, oldest first, numbered as the domain numbers them
  const audit = [...parts.entries, ...supplierEntries(parts.openPoints, completeness, release, changeReport)]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => time(a.e.at) - time(b.e.at) || a.i - b.i)
    .map(({ e }, i) => ({ ...e, id: `${caseId}-a${i + 1}` }));

  const inReview = phase !== "supplier-input" && (phase !== "cancelled" || parts.reviews.length > 0);
  const requestedRaw = str(item, "Requested_Docs_JSON");
  const priority = str(item, "Priority") ? (str(item, "Priority") === LIST.priority.high ? "high" : "normal") : (header?.priority ?? "normal");
  const due = dateIso(str(item, "Supplier_Due_Date")) || (header?.dueDate ? dateIso(header.dueDate) : "") || createdAt;
  const c: CiqCase = {
    id: caseId,
    materialName: str(item, "Trade_Name") || header?.materialName || str(base.stub, "Trade_Name") || caseId,
    inci: str(item, "Main_INCI") || header?.inci || "",
    materialNo: str(item, "BDF_Material_No") || header?.materialNo || "",
    supplierId,
    manufacturer: str(item, "Supplier_Legal_Name") || header?.manufacturer || "",
    site: "",
    supplierContactIds: base.contactIds,
    ownerId: base.ownerId,
    createdAt,
    dueDate: due,
    phase,
    templateVersion,
    ruleSetVersion,
    config,
    scope,
    answers,
    answeredBy,
    components: doc.components ?? [],
    justifications: doc.justifications,
    documents,
    reviews: parts.reviews,
    informed: inReview ? ["CUS", "LEG"] : [],
    openPoints: parts.openPoints,
    ...(parts.rmes ? { rmes: parts.rmes } : {}),
    confirmations,
    audit,
    reviewVersion: inReview ? 1 : 0,
    phaseHistory: phaseHistoryOf({ phase, createdAt, item, reviews: parts.reviews, rows: base.rows }),
    ...(cancelled ? { cancelled } : {}),
    priority,
    internalNotes: parts.notes,
    liveScope: true,
    // the requested-document slots fixed at the completeness confirmation (B-08); undefined before it
    ...(inReview && item && base.readable ? { requestedDocs: storedSlots(json<unknown>(item, "Requested_Docs_JSON", [])) } : {}),
  };
  // confirmed before the supplier's screen wrote the slots: fixed as derived now, none "added later" (as portal map.ts)
  if (c.requestedDocs && !requestedRaw.trim()) c.requestedDocs = deriveRequestedDocs(c, cfg);

  const ref: CaseRef = {
    caseId,
    itemId: base.itemId,
    cycleNo: base.cycleNo,
    supplierCode: supplierId,
    ...(str(item, "Portal_Request_Item_Id") ? { portalRequestItemId: str(item, "Portal_Request_Item_Id") } : {}),
    ...(str(item, "Release_Item_Id") ? { releaseItemId: str(item, "Release_Item_Id") } : {}),
    readable: base.readable,
    contacts: base.contacts,
  };
  return { c, ref, ...(banners.length ? { banner: banners.join(" ") } : {}), ...(pinText ? { pin: pinText } : {}), ...(changeReport ? { changeReport } : {}) };
}

