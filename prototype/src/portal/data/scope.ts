// The live scope of a portal request, with the prototype's own rules engine over the case's pinned rule set
// (plan v5 §3.1 Scope_JSON / Requested_Docs_JSON, B-06…B-08, B-28, B-29):
// - Part 1 (the request at "fill in the CIQ"): every metadata answer re-derives the scope; sections open AND close
//   live. Answers in a closed section stay in Answers_JSON (nothing here deletes them).
// - Part 2 (at "keep the CIQ up to date", not locked): the scope only grows from what was stored at the last save.
// - Locked (completed or cancelled): the stored scope as it is.
// - Every part: the sections a Beiersdorf department added (Manual_Scope_JSON, written by the service) are merged in
//   and never lowered.
// What the UI writes back is supplier wording only: no rule ids, no SF codes (D-10).
import { deriveScope, growScope } from "@/domain/rules";
import { requestedDocuments } from "@/domain/requestedDocs";
import type { Applicability, CiqCase, ConfigAnswers, ConfigState, RequestedDocSlot, ScopeItem } from "@/domain/types";

export type ScopePart = "part1" | "part2" | "locked";

/** A section Beiersdorf added during the review (Manual_Scope_JSON row, sync service reconcile.mjs). */
export interface ManualScope {
  sectionId: string;
  applicability: Applicability;
  addedLater?: boolean;
  at?: string;
}

/** One Scope_JSON row as the portal UI writes it. */
export interface ScopeRow {
  sectionId: string;
  applicability: Applicability;
  reason: string;
  addedLater?: true;
}

/** One Requested_Docs_JSON row as the portal UI writes it (the rule ids stay out). `optional` (29 Oct, written only
 *  when true): the supplier may leave the document out; after the completeness confirmation it only tightens, so a row
 *  without it (every row written before) stays mandatory. */
export interface RequestedDocRow {
  key: string;
  doc: string;
  sectionId: string;
  why: string;
  addedLater?: true;
  optional?: true;
}

const RANK: Record<Applicability, number> = { mandatory: 3, optional: 2, na: 1 };
const APPLICABILITY = new Set<Applicability>(["mandatory", "optional", "na"]);

/** Scope_JSON / Manual_Scope_JSON rows as ScopeItems (unknown rows are dropped, never guessed). */
export function storedScope(rows: unknown): ScopeItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is ScopeRow => !!r && typeof r === "object" && typeof (r as ScopeRow).sectionId === "string" && APPLICABILITY.has((r as ScopeRow).applicability))
    .map((r) => ({ sectionId: r.sectionId, applicability: r.applicability, firedRules: [], reason: typeof r.reason === "string" ? r.reason : "", ...(r.addedLater ? { addedLater: true } : {}) }));
}

export function manualScope(rows: unknown): ManualScope[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is ManualScope => !!r && typeof r === "object" && typeof (r as ManualScope).sectionId === "string")
    .map((r) => ({ sectionId: r.sectionId, applicability: APPLICABILITY.has(r.applicability) ? r.applicability : "mandatory", addedLater: r.addedLater !== false, ...(r.at ? { at: r.at } : {}) }));
}

/** Merges the department-added sections: never lowered, added when missing. */
function withManual(scope: ScopeItem[], manual: ManualScope[]): ScopeItem[] {
  const out = scope.map((s) => ({ ...s }));
  for (const m of manual) {
    const i = out.findIndex((s) => s.sectionId === m.sectionId);
    const item: ScopeItem = { sectionId: m.sectionId, applicability: m.applicability, firedRules: [], reason: "Added during the review", ...(m.addedLater !== false ? { addedLater: true } : {}), manual: { by: "bdf", at: m.at ?? "", justification: "" } };
    if (i < 0) out.push(item);
    else if (RANK[m.applicability] > RANK[out[i].applicability]) out[i] = { ...item, addedLater: true };
    else if (RANK[m.applicability] === RANK[out[i].applicability]) out[i] = { ...out[i], manual: item.manual };
  }
  return out;
}

export interface ScopeInput {
  config: ConfigAnswers;
  ruleSetVersion: string;
  templateVersion: string;
  cfg: ConfigState;
  part: ScopePart;
  /** Scope_JSON as last written. */
  stored: ScopeItem[];
  manual: ManualScope[];
}

/** The scope the supplier sees and works on now. */
export function liveScope(x: ScopeInput): ScopeItem[] {
  if (x.part === "locked" && x.stored.length) return withManual(x.stored, x.manual);
  const derived = deriveScope(x.config, x.ruleSetVersion, x.templateVersion, x.cfg);
  if (x.part === "part1" || !x.stored.length) return withManual(derived, x.manual);
  return withManual(growScope(x.stored, derived).scope, x.manual);
}

const KEPT_TEXT = " · kept (the questionnaire only grows after your completeness confirmation)";

/** "Origin includes Vegetable → R-10; Polymer (SF-03) is Yes → R-31" → "Origin includes Vegetable; Polymer is Yes".
 *  The engine's "kept" note (grow-only) becomes one supplier sentence, however often the scope was grown. */
export function supplierReason(reason: string): string {
  const kept = /·\s*kept[\s:(]/.test(reason);
  const text = reason
    .replace(/\s*·\s*kept[\s:(].*$/, "")
    .split("; ")
    .map((r) => r.split(" → ")[0])
    .join("; ")
    .replace(/\s*\(SF-\d{2}\)/g, "")
    .replace(/\bR-\d+[a-z]?\b/g, "")
    .trim();
  return kept ? `${text}${KEPT_TEXT}` : text;
}

/** Scope_JSON: per section, its applicability and the supplier's reason. No rule ids (D-10). */
export const scopeRows = (scope: ScopeItem[]): ScopeRow[] => scope.map((s) => ({ sectionId: s.sectionId, applicability: s.applicability, reason: supplierReason(s.reason), ...(s.addedLater ? { addedLater: true as const } : {}) }));

/** Requested_Docs_JSON rows as slots for the engine (fixed list after the completeness confirmation, B-08). */
export function storedSlots(rows: unknown): RequestedDocSlot[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is RequestedDocRow => !!r && typeof r === "object" && typeof (r as RequestedDocRow).key === "string" && typeof (r as RequestedDocRow).sectionId === "string")
    .map((r) => ({ key: r.key, doc: typeof r.doc === "string" ? r.doc : r.key, sectionId: r.sectionId, ruleIds: [], why: typeof r.why === "string" ? r.why : "", conditions: [], ...(r.addedLater ? { addedLater: true } : {}), ...(r.optional === true ? { optional: true as const } : {}) }));
}

/** Requested_Docs_JSON: the slots the case asks for now, in supplier wording. */
export const requestedDocRows = (c: CiqCase, cfg: ConfigState): RequestedDocRow[] =>
  requestedDocuments(c, cfg).map((s) => ({ key: s.key, doc: s.doc, sectionId: s.sectionId, why: s.why, ...(s.addedLater ? { addedLater: true as const } : {}), ...(s.optional ? { optional: true as const } : {}) }));

export const partOfPhase = (phase: CiqCase["phase"]): ScopePart => (phase === "supplier-input" ? "part1" : phase === "completed" || phase === "cancelled" ? "locked" : "part2");
