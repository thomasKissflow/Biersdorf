// Entry of the CIQ final document bundle (Bundle.gs, global CIQFinal). build.mjs bundles it with the prototype's own
// esbuild. Nothing here adds document logic: the live mapper (app-live/map/toAppState.ts) and the builder
// (domain/finalDocument.ts) make the document exactly as the app's "Final document" tab does; sync/pdf.mjs renders it,
// from a display copy that carries the tab's labels for the codes the document holds (markets, origins, kinds, actions,
// applicability). Pure and synchronous: no I/O, no clock, no crypto (the host computes the SHA-256 of the PDF).
import { toAppState } from "../../../prototype/src/app-live/map/toAppState";
import type { Acting, Identity, LiveSnapshot } from "../../../prototype/src/app-live/types";
import type { RawItem } from "../../../prototype/src/portal/data/raw";
import { INTERNAL_PERSONAS, MARKET_LABEL, ORIGIN_LABEL } from "../../../prototype/src/domain/catalog";
import { fingerprintOf, verifyFinalDocument } from "../../../prototype/src/domain/finalDocument";
import { MESSAGE_ACTION_LABEL } from "../../../prototype/src/domain/selectors";
import type { FinalDocument, User } from "../../../prototype/src/domain/types";
import { finalPdfName, renderFinalPdf, setDateFormat } from "../../sync/pdf.mjs";

export { verifyFinalDocument };

/** The service's own reader: the Auditor persona under a static alias, so no Kissflow user is aliased (kfUserId ""). */
const SERVICE_NAME = "CIQ final document service";
const persona = INTERNAL_PERSONAS.find((p) => p.id === "auditor")!;
const identity: Identity = { kfUserId: "", name: SERVICE_NAME, email: "", roles: [], personas: ["auditor"], caseAdmin: false, integration: false, unknownRoles: [] };
const me: User = { id: "u-auditor", name: SERVICE_NAME, email: "", side: "internal", title: persona.label, initials: "FD" };
const acting: Acting = { personaId: "auditor", persona: { ...persona, userId: me.id }, me, roleId: "" };

export interface FinalInput {
  caseItem: RawItem;
  reviews: RawItem[];
  openPoints: RawItem[];
  auditRows: RawItem[];
  supplierRows: RawItem[];
  configRows: RawItem[];
  loadedAt: string;
}

export interface FinalResult {
  /** The case's final document, as the tab shows it (undefined when the app does not see the case as completed). */
  doc?: FinalDocument;
  /** doc.fingerprint (the app's document seal). */
  seal?: string;
  /** verifyFinalDocument(doc). */
  ok: boolean;
  phase?: string;
  caseCode?: string;
  warnings: string[];
}

/** One case's final document from its live items. RMES rows and internal notes are never passed (empty lists). */
export function finalDocumentFor(x: FinalInput): FinalResult {
  const snap: LiveSnapshot = {
    loadedAt: x.loadedAt,
    items: { case: [x.caseItem], review: x.reviews ?? [], op: x.openPoints ?? [] },
    forms: { audit: x.auditRows ?? [], note: [], rmesSAF: [], rmesREG: [], supplier: x.supplierRows ?? [], config: x.configRows ?? [] },
    tasks: [],
    unreadableCases: {},
    reads: [],
    warnings: [],
  };
  const m = toAppState({ snap, identity, acting });
  const id = x.caseItem?._id;
  const c = m.state.cases.find((k) => m.index.cases.get(k.id)?.itemId === id);
  const doc = c?.finalDocument;
  return { ...(doc ? { doc, seal: doc.fingerprint } : {}), ok: !!doc && verifyFinalDocument(doc), phase: c?.phase, caseCode: c?.id, warnings: m.warnings };
}

/** components/status.tsx kindLabel (that file imports React): a legacy "finding" point (raised from a retired RMES
 *  finding) reads as a query. */
const KIND_LABEL: Record<string, string> = { query: "Query", "document-request": "Document request", "additional-part": "Additional section", finding: "Query" };
/** FinalDocumentTab.tsx section tags. */
const APPLICABILITY_LABEL: Record<string, string> = { na: "Not applicable, justified", mandatory: "Mandatory", optional: "Optional" };

/** The document worded as the tab shows it: labels in place of the codes (MARKET_LABEL, ORIGIN_LABEL up to " (",
 *  the kind, MESSAGE_ACTION_LABEL, the applicability tag; an unanswered metadata question reads "Not answered"). A copy
 *  for printing only: the seal stays the one of `doc`. */
export function displayCopy(doc: FinalDocument): FinalDocument {
  const d = JSON.parse(JSON.stringify(doc)) as FinalDocument;
  // 22 Oct live test: any optional value may be missing (a component without an origin crashed the render), so every
  // label falls back to the value itself and every list to []
  const label = (map: Record<string, string>, k: string | undefined) => (k == null ? k : map[k] ?? k);
  const list = <T,>(xs: T[] | undefined): T[] => (Array.isArray(xs) ? xs : []);
  (d.header as { markets: string[] }).markets = list(d.header.markets).map((m) => label(MARKET_LABEL, m) as string);
  if (d.metadata) d.metadata = d.metadata.map((m) => (m.value === "—" ? { ...m, value: "Not answered" } : m));
  d.sections = list(d.sections).map((s) => ({ ...s, applicability: label(APPLICABILITY_LABEL, s.applicability) as typeof s.applicability }));
  d.components = list(d.components).map((r) => ({ ...r, origin: (r.origin == null ? r.origin : String(label(ORIGIN_LABEL, r.origin)).split(" (")[0]) as typeof r.origin }));
  d.threads = list(d.threads).map((t) => ({
    ...t,
    kind: label(KIND_LABEL, t.kind) as typeof t.kind,
    rounds: list(t.rounds).map((r) => ({ ...r, entries: list(r.entries).map((e) => ({ ...e, action: label(MESSAGE_ACTION_LABEL, e.action) as typeof e.action })) })),
  }));
  return d;
}

/** Thomas, 29 Oct (data-model plan row 13): the supplier portal gets a SUPPLIER-SAFE copy of the final document. The
 *  same content, but every Beiersdorf person shows only as "Beiersdorf" (plus the department role the document gives
 *  them), with no name and no e-mail address; supplier-side people stay as they are. Who is who comes from the
 *  document itself:
 *  - Beiersdorf: the case owner (header, the RMM); the people of the dept-completion confirmations (their role is the
 *    department reviewer role); the thread entries whose side is not "supplier"; an open point's raiser unless its
 *    "raised" entry is on the supplier side; the person of a metadata answer set by Beiersdorf.
 *  - Supplier: the completeness and final-release confirmations; the thread entries on the supplier side.
 *  Fail-safe: a confirmation of another type counts as Beiersdorf; an answer, upload or metadata author whose name is a
 *  Beiersdorf name is masked even when a supplier has the same name (dev: one Kissflow user is both). Free text (thread
 *  texts, justifications, notes, values) loses every Beiersdorf name and e-mail address, and any e-mail address on a
 *  domain only Beiersdorf people use. The copy has its own seal: the fingerprint is recomputed with the app's own
 *  fingerprintOf over the same content rule, so verifyFinalDocument(copy) holds and the PDF names that seal. */
export function supplierCopy(doc: FinalDocument): FinalDocument {
  const d = JSON.parse(JSON.stringify(doc)) as FinalDocument;
  const list = <T,>(xs: T[] | undefined): T[] => (Array.isArray(xs) ? xs : []);
  const key = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const usable = (k: string) => k.length >= 2 && k !== "\u2014" && k !== "-";
  const BDF = "Beiersdorf";
  const bdfNames = new Set<string>();
  const bdfEmails = new Set<string>();
  const supEmails = new Set<string>();
  const roleOf = new Map<string, string>();
  const addBdf = (name: unknown, email?: unknown, role?: unknown) => {
    const k = key(name);
    if (usable(k)) {
      bdfNames.add(k);
      if (typeof role === "string" && role.trim() && !roleOf.has(k)) roleOf.set(k, role.trim());
    }
    const e = key(email);
    if (e.includes("@")) bdfEmails.add(e);
  };
  const SUPPLIER_CONFIRMATIONS = new Set(["completeness", "final-release"]);
  // no flatMap: Apps Script's V8 may lack it (build.mjs polyfills only what the mappers use)
  const raisedSide = (t: FinalDocument["threads"][number]) => {
    for (const r of list(t.rounds)) for (const e of list(r.entries)) if (e.action === "raised") return e.side;
    return undefined;
  };
  addBdf(d.header?.ownerName);
  for (const c of list(d.confirmations)) {
    if (SUPPLIER_CONFIRMATIONS.has(c.type)) {
      if (key(c.email).includes("@")) supEmails.add(key(c.email));
    } else addBdf(c.name, c.email, c.role);
  }
  for (const t of list(d.threads)) {
    if (raisedSide(t) !== "supplier") addBdf(t.raisedBy);
    for (const r of list(t.rounds)) for (const e of list(r.entries)) if (e.side !== "supplier") addBdf(e.by);
  }
  for (const m of list(d.metadata)) if (m.setByBdf) addBdf(m.by);
  const bdfOnlyDomains = new Set([...bdfEmails].map((e) => e.split("@")[1]).filter((x) => x && ![...supEmails].some((s) => s.split("@")[1] === x)));

  const label = (name: unknown) => {
    const role = roleOf.get(key(name));
    return role ? `${BDF}, ${role}` : BDF;
  };
  const isBdf = (name: unknown) => bdfNames.has(key(name));
  const person = <T extends string | undefined>(name: T): T => (isBdf(name) ? (label(name) as T) : name);
  // whole-word, case-insensitive replacement (no regex: names may hold any character)
  const letter = /[A-Za-z0-9\u00C0-\u024F]/;
  const replaceWord = (text: string, needle: string, by: string) => {
    if (!needle) return text;
    let out = "";
    let i = 0;
    const low = text.toLowerCase();
    for (;;) {
      const j = low.indexOf(needle, i);
      if (j < 0) break;
      const before = j > 0 ? text[j - 1] : "";
      const after = text[j + needle.length] ?? "";
      if ((before && letter.test(before)) || (after && letter.test(after))) {
        out += text.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      out += text.slice(i, j) + by;
      i = j + needle.length;
    }
    return out + text.slice(i);
  };
  const names = [...bdfNames].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const scrub = <T extends string | undefined>(text: T): T => {
    if (typeof text !== "string" || !text) return text;
    let s = text.replace(EMAIL, (m, dom: string) => (bdfEmails.has(m.toLowerCase()) || bdfOnlyDomains.has(dom.toLowerCase()) ? BDF : m));
    for (const n of names) s = replaceWord(s, n, BDF);
    return s as T;
  };

  (d.header as { ownerName: string }).ownerName = BDF;
  if (d.metadata) d.metadata = d.metadata.map((m) => ({ ...m, by: m.setByBdf ? (m.by == null ? m.by : label(m.by)) : person(m.by), value: scrub(m.value) }));
  d.sections = list(d.sections).map((s) => ({
    ...s,
    justification: scrub(s.justification),
    answers: list(s.answers).map((a) => ({ ...a, value: scrub(a.value), by: person(a.by), justification: scrub(a.justification) })),
  }));
  d.evidence = list(d.evidence).map((e) => ({ ...e, uploadedBy: person(e.uploadedBy), justification: scrub(e.justification) }));
  d.threads = list(d.threads).map((t) => ({
    ...t,
    raisedBy: raisedSide(t) === "supplier" ? t.raisedBy : label(t.raisedBy),
    rounds: list(t.rounds).map((r) => ({
      ...r,
      // the PDF tags each entry "(Beiersdorf)" or "(supplier)" itself: a Beiersdorf entry names only its role
      entries: list(r.entries).map((e) => (e.side === "supplier" ? { ...e, text: scrub(e.text) } : { ...e, by: roleOf.get(key(e.by)) ?? BDF, text: scrub(e.text) })),
    })),
  }));
  d.confirmations = list(d.confirmations).map((c) => (SUPPLIER_CONFIRMATIONS.has(c.type) ? { ...c, note: scrub(c.note) } : { ...c, name: BDF, email: "", note: scrub(c.note) }));
  // its own seal: the app's fingerprint over every other field, as buildFinalDocument / verifyFinalDocument compute it
  const { fingerprint: _old, ...rest } = d;
  void _old;
  d.fingerprint = fingerprintOf(JSON.stringify(rest));
  return d;
}

/** The PDF of a document (sync/pdf.mjs, from its display copy), as unsigned bytes. `formatDateTime` renders each time
 *  (default UTC). Its seal badge reads as the tab's: "Document seal: unchanged" when the seal verifies, else "Document
 *  seal broken" (the service never renders a broken one: Code.gs checks first). */
export function renderPdf(doc: FinalDocument, opts: { formatDateTime?: (iso: string) => string } = {}): Uint8Array {
  setDateFormat(opts.formatDateTime);
  try {
    return renderFinalPdf(displayCopy(doc), doc.fingerprint, { verified: verifyFinalDocument(doc) }) as Uint8Array;
  } finally {
    setDateFormat(undefined);
  }
}

/** Unsigned bytes → the signed byte list Apps Script's Utilities.newBlob takes. */
export function signedBytes(u: Uint8Array): number[] {
  const out = new Array<number>(u.length);
  for (let i = 0; i < u.length; i++) out[i] = u[i] > 127 ? u[i] - 256 : u[i];
  return out;
}

export const pdfName = (caseCode: string): string => finalPdfName(caseCode);
