// Requested documents (spec §8.5, Thomas 14 Oct): evidence a fired rule asks for that no question of the case's
// questionnaire collects. Instead of leaving the supplier with nowhere to upload it, every such document becomes an
// upload slot ("Requested documents") in a section of the case:
// - which: requiredEvidence() of the case's pinned rule set, minus what a question collects (EVIDENCE_FIELDS, with the
//   question present in the case's questionnaire version and its section in scope);
// - where: the first live section the asking rule switches on for the case, else K1 Mandatory documents (an
//   evidence-only rule);
// - key: "EV:<slug of the document name>". Uploads (DocumentRef.fieldId) and the cannot-provide justification
//   (CiqCase.justifications) attach to it;
// - live: before the completeness confirmation the slots open and close with the answers (uploads and justifications
//   are kept and come back); after it they only grow, like the scope (CiqCase.requestedDocs holds the fixed list).
// Each slot is mandatory: missing without a justification, it blocks completeness and the final release.
// In Kissflow this is a "Requested documents" child table on the case item: Document name, Attachment, Uploaded by,
// Uploaded at, Cannot provide, Justification. Live-scope cases only: the live portal's old flow never has slots.

import { syncedConfig, templateField, templateHasSection } from "./catalog";
import { reasonSentence } from "./conditions";
import { EVIDENCE_FIELDS, ruleSet } from "./rules";
import type { Applicability, CiqCase, ConfigState, DocumentRef, RequestedDocSlot, RuleCondition, RuleData, TemplateData } from "./types";

export const SLOT_PREFIX = "EV:";

/** The slot key of a document name: "Microplastics test report" → "EV:microplastics-test-report". */
export function slotKey(doc: string): string {
  const slug = doc
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${SLOT_PREFIX}${slug || "document"}`;
}

/** True for a requested-document key (never a field id). */
export const isSlotKey = (k?: string | null): k is string => !!k && k.startsWith(SLOT_PREFIX);

/** The questions that collect an evidence document (EVIDENCE_FIELDS, matched without regard to case). */
export function evidenceFieldIds(doc: string): string[] | undefined {
  const n = doc.trim().toLowerCase();
  if (!n) return undefined;
  const k = Object.keys(EVIDENCE_FIELDS).find((x) => x.toLowerCase() === n);
  return k ? EVIDENCE_FIELDS[k] : undefined;
}

type SlotCase = Pick<CiqCase, "config" | "ruleSetVersion" | "templateVersion" | "scope" | "liveScope">;

/**
 * The slots the case's answers call for right now (pure; no grow-only). A document counts as collected when one of its
 * questions is in the case's questionnaire version and its section is in scope; otherwise it gets a slot, even if it
 * is in EVIDENCE_FIELDS (e.g. the question was removed in a later version).
 */
export function deriveRequestedDocs(c: SlotCase, cfg?: ConfigState): RequestedDocSlot[] {
  if (c.liveScope !== true) return [];
  const open = new Set(c.scope.filter((x) => x.applicability !== "na").map((x) => x.sectionId));
  const usable = (id: string) => open.has(id) && templateHasSection(c.templateVersion, id, cfg);
  const collected = (doc: string) =>
    (evidenceFieldIds(doc) ?? []).some((fid) => {
      const f = templateField(c.templateVersion, fid, cfg);
      return !!f && open.has(f.sectionId);
    });
  const out = new Map<string, RequestedDocSlot & { conds: RuleCondition[] }>();
  for (const r of ruleSet(c.ruleSetVersion, cfg).rules) {
    if (!r.evidence?.length || !r.when(c.config)) continue;
    for (const raw of r.evidence) {
      const doc = raw.trim();
      if (!doc || collected(doc)) continue;
      const key = slotKey(doc);
      const hit = out.get(key);
      if (hit) {
        if (!hit.ruleIds.includes(r.id)) {
          hit.ruleIds.push(r.id);
          hit.conds.push(r.condition);
          if (!hit.conditions.includes(r.text)) hit.conditions.push(r.text);
        }
        continue;
      }
      const sectionId = r.activates.find(usable) ?? (usable("K1") ? "K1" : "GEN");
      out.set(key, { key, doc, sectionId, ruleIds: [r.id], why: "", conditions: [r.text], conds: [r.condition] });
    }
  }
  return [...out.values()].map(({ conds, ...x }) => ({ ...x, why: reasonSentence(conds) }));
}

const memo = new WeakMap<CiqCase, Map<ConfigState | undefined, RequestedDocSlot[]>>();

/**
 * The case's requested documents. Before the completeness confirmation: deriveRequestedDocs (they follow the answers).
 * After it: the list fixed at the confirmation (CiqCase.requestedDocs), never shrinking: a slot the answers no longer
 * call for is kept (`kept`), a new one is added (`addedLater`). [] for the live portal's old flow.
 */
export function requestedDocuments(c: CiqCase, cfg?: ConfigState): RequestedDocSlot[] {
  if (c.liveScope !== true) return [];
  const k = cfg ?? syncedConfig();
  let byCfg = memo.get(c);
  if (!byCfg) memo.set(c, (byCfg = new Map()));
  const hit = byCfg.get(k);
  if (hit) return hit;
  const derived = deriveRequestedDocs(c, cfg);
  let out = derived;
  if (c.confirmations.some((x) => x.type === "completeness")) {
    const stored = c.requestedDocs ?? [];
    const now = new Map(derived.map((d) => [d.key, d]));
    out = stored.map((s) => {
      const d = now.get(s.key);
      return d ? { ...d, sectionId: s.sectionId, ...(s.addedLater ? { addedLater: true } : {}) } : { ...s, kept: true };
    });
    for (const d of derived) if (!stored.some((s) => s.key === d.key)) out.push({ ...d, addedLater: true });
  }
  byCfg.set(k, out);
  return out;
}

/** The list to store on the case (CiqCase.requestedDocs): the current slots without the derived `kept` flag. */
export const storableSlots = (slots: RequestedDocSlot[]): RequestedDocSlot[] => slots.map(({ kept: _k, ...x }) => x);

/** One slot of the case by its key. */
export const slotOf = (c: CiqCase, key: string, cfg?: ConfigState) => requestedDocuments(c, cfg).find((x) => x.key === key);

/** The slots that sit in a section. */
export const slotsIn = (c: CiqCase, sectionId: string, cfg?: ConfigState) => requestedDocuments(c, cfg).filter((x) => x.sectionId === sectionId);

/** The files uploaded to a slot, newest first. */
export const slotDocuments = (c: Pick<CiqCase, "documents">, key: string): DocumentRef[] =>
  c.documents.filter((d) => d.fieldId === key).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id));

export type RequestedDocStatus = "received" | "justified" | "missing";

/** Received (a file is there), justified (cannot provide, with a justification) or missing. */
export function requestedDocStatus(c: Pick<CiqCase, "documents" | "justifications">, slot: Pick<RequestedDocSlot, "key">): RequestedDocStatus {
  if (c.documents.some((d) => d.fieldId === slot.key)) return "received";
  if (c.justifications[slot.key]?.trim()) return "justified";
  return "missing";
}

export const REQUESTED_STATUS_LABEL: Record<RequestedDocStatus, string> = { received: "Received", justified: "Not provided, justified", missing: "Missing" };

/** Internal wording: "requested by rule R-122" / "requested by rules R-122, R-130". Never shown to the supplier. */
export const requestedByText = (slot: Pick<RequestedDocSlot, "ruleIds">) => `requested by rule${slot.ruleIds.length === 1 ? "" : "s"} ${slot.ruleIds.join(", ")}`;

/**
 * The section a document sits in now. A requested document's file follows its slot: before the completeness
 * confirmation a slot two rules share can move to another section with the answers, and the file moves with it. Any
 * other file stays where it was uploaded.
 */
export function docSectionId(c: CiqCase, d: Pick<DocumentRef, "sectionId" | "fieldId">, cfg?: ConfigState): string {
  return isSlotKey(d.fieldId) ? (slotOf(c, d.fieldId, cfg)?.sectionId ?? d.sectionId) : d.sectionId;
}

/** The section a requested-document key belongs to (its slot, else where its files sit). */
export function slotSection(c: CiqCase, key: string, cfg?: ConfigState): string | undefined {
  return slotOf(c, key, cfg)?.sectionId ?? c.documents.find((d) => d.fieldId === key)?.sectionId;
}

/** The document name behind a key (its slot, else the slug made readable). */
export function slotName(c: CiqCase, key: string, cfg?: ConfigState): string {
  const s = slotOf(c, key, cfg);
  if (s) return s.doc;
  const t = key.slice(SLOT_PREFIX.length).replace(/-/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Requested document";
}

// ---------------------------------------------------------------------------------- the configuration editor (admin)

export interface UncollectedEvidence {
  doc: string;
  /** Where the slot will sit in this version: the rule's first live section, else K1. */
  sectionId: string;
  code: string;
  /** True when the rule switches on no live section (or makes its sections not applicable), so the slot goes to K1. */
  inK1: boolean;
  /** The rule makes its sections "Not applicable": they are closed for the case, so the slot goes to K1. */
  naRule?: boolean;
  /** A question collects the document, but in a section the rule does not always bring into scope (codes): a case
   *  without that section in scope gets the upload slot instead. */
  onlyWithout?: string[];
}

/** The sections every case gets: those an "always" rule makes mandatory or optional (the strictest outcome wins). */
export function alwaysOnSections(rules: readonly Pick<RuleData, "condition" | "activates" | "outcome">[]): Set<string> {
  return new Set(rules.filter((r) => r.condition.kind === "always" && r.outcome !== "na").flatMap((r) => r.activates));
}

/**
 * The evidence of a rule that no question of a questionnaire version (as data, e.g. the draft) collects for every case
 * the rule fires on, and where the supplier's upload slot will sit. Same reading as deriveRequestedDocs at runtime: a
 * question collects the document only when its section is in scope, i.e. switched on by this rule (not "Not
 * applicable") or by an "always" rule (`alwaysOn`). A question in any other section collects it only for some cases
 * (`onlyWithout`). Shown as information in the rule form and the publish check, never as a problem.
 */
export function uncollectedEvidence(
  evidence: string[],
  activates: string[],
  template: Pick<TemplateData, "sections">,
  opts: { outcome?: Applicability; alwaysOn?: Iterable<string> } = {},
): UncollectedEvidence[] {
  const live = template.sections.filter((x) => !x.retired);
  const naRule = opts.outcome === "na";
  // A "Not applicable" rule closes its sections for the case, so its slot goes to K1 (deriveRequestedDocs: usable()).
  const at = naRule ? undefined : activates.find((id) => live.some((x) => x.id === id));
  const sectionId = at ?? "K1";
  const code = live.find((x) => x.id === sectionId)?.code ?? sectionId;
  const opened = new Set<string>([...(naRule ? [] : activates), ...(opts.alwaysOn ?? [])]);
  const seen = new Set<string>();
  const out: UncollectedEvidence[] = [];
  for (const raw of evidence) {
    const doc = raw.trim();
    if (!doc || seen.has(doc.toLowerCase())) continue;
    seen.add(doc.toLowerCase());
    const homes = [...new Set((evidenceFieldIds(doc) ?? []).flatMap((fid) => live.filter((x) => x.fields.some((f) => f.id === fid))))];
    if (homes.some((x) => opened.has(x.id))) continue;
    out.push({ doc, sectionId, code, inK1: !at, ...(naRule && activates.length ? { naRule: true } : {}), ...(homes.length ? { onlyWithout: homes.map((x) => x.code) } : {}) });
  }
  return out;
}

/** The information line for the rule form and the publish check. */
export function uncollectedText(u: UncollectedEvidence): string {
  const where = `under “Requested documents” in ${u.code}${u.inK1 ? (u.naRule ? " (the rule makes its sections not applicable)" : " (the rule switches on no section)") : ""}`;
  if (u.onlyWithout?.length) {
    const secs = u.onlyWithout.join(" or ");
    return `“${u.doc}” is collected by a question in ${secs}, which this rule does not switch on: a case without ${secs} in scope gets an upload slot for it ${where} instead.`;
  }
  return `“${u.doc}” is not collected by a question yet: the supplier gets an upload slot for it ${where}.`;
}
