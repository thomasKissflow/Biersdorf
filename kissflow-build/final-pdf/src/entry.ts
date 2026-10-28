// Entry of the CIQ final document bundle (Bundle.gs, global CIQFinal). build.mjs bundles it with the prototype's own
// esbuild. Nothing here adds document logic: the live mapper (app-live/map/toAppState.ts) and the builder
// (domain/finalDocument.ts) make the document exactly as the app's "Final document" tab does; sync/pdf.mjs renders it,
// from a display copy that carries the tab's labels for the codes the document holds (markets, origins, kinds, actions,
// applicability). Pure and synchronous: no I/O, no clock, no crypto (the host computes the SHA-256 of the PDF).
import { toAppState } from "../../../prototype/src/app-live/map/toAppState";
import type { Acting, Identity, LiveSnapshot } from "../../../prototype/src/app-live/types";
import type { RawItem } from "../../../prototype/src/portal/data/raw";
import { INTERNAL_PERSONAS, MARKET_LABEL, ORIGIN_LABEL } from "../../../prototype/src/domain/catalog";
import { verifyFinalDocument } from "../../../prototype/src/domain/finalDocument";
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

/** components/status.tsx kindLabel (that file imports React). */
const KIND_LABEL: Record<string, string> = { query: "Query", "document-request": "Document request", "additional-part": "Additional section", finding: "Finding" };
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
