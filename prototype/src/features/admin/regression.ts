// The comparison behind "Test rules" and "Test the draft": every built-in reference material derived with the current
// and the draft rule set. It never reads cases (the reference materials are fixed answer sets).
import { REFERENCE_MATERIALS, type ReferenceMaterial } from "@/domain/referenceMaterials";
import { deriveScope, sectionsInTemplate, type ScopeDiff } from "@/domain/rules";
import type { ConfigState, RuleSet } from "@/domain/types";
import { ruleDiff, scopeDiff } from "./config";

export type RegressionMode = "new-request" | "pinned";

export interface RegressionRow {
  m: ReferenceMaterial;
  before: number;
  after: number;
  diff: ScopeDiff;
  changed: boolean;
  /** Every changed section is explained by a rule the draft adds, changes or removes, or by a section it adds or
   *  retires. */
  expected: boolean;
  /** The added or changed rules that apply to this material. */
  firing: string[];
}

/**
 * Each reference material derived with `base` and with `draft`.
 * - new-request: as a case started before publishing (base with its questionnaire) and after it (draft with its own);
 * - pinned: a running case keeps its own questionnaire version; the draft never reaches it.
 * `cfg`: the state's configuration (left out in screens: the store-synced registry).
 */
export function runRegression(base: RuleSet, draft: RuleSet, mode: RegressionMode, cfg?: ConfigState): RegressionRow[] {
  const d = ruleDiff(base.rules, draft.rules);
  const touchedRules = new Set([...d.added, ...d.changed]);
  const touched = new Set([
    ...draft.rules.filter((r) => touchedRules.has(r.id)).flatMap((r) => r.activates),
    ...base.rules.filter((r) => d.changed.includes(r.id) || d.removed.includes(r.id)).flatMap((r) => r.activates),
  ]);
  const baseIds = new Set(sectionsInTemplate(base.templateVersion, cfg));
  const draftIds = new Set(sectionsInTemplate(draft.templateVersion, cfg));
  for (const id of baseIds) if (!draftIds.has(id)) touched.add(id);
  for (const id of draftIds) if (!baseIds.has(id)) touched.add(id);
  return REFERENCE_MATERIALS.map((m) => {
    const beforeTpl = mode === "pinned" ? m.templateVersion : base.templateVersion;
    const afterTpl = mode === "pinned" ? m.templateVersion : draft.templateVersion;
    const beforeScope = deriveScope(m.config, base.version, beforeTpl, cfg);
    const afterScope = deriveScope(m.config, draft.version, afterTpl, cfg);
    const diff = scopeDiff(beforeScope, afterScope);
    const changed = diff.added.length + diff.removed.length + diff.changed.length > 0;
    const expected = changed && [...diff.added, ...diff.removed, ...diff.changed.map((x) => x.sectionId)].every((s) => touched.has(s));
    return {
      m,
      before: beforeScope.filter((s) => s.applicability === "mandatory").length,
      after: afterScope.filter((s) => s.applicability === "mandatory").length,
      diff,
      changed,
      expected,
      firing: draft.rules.filter((r) => touchedRules.has(r.id) && r.when(m.config)).map((r) => r.id),
    };
  });
}

/** A one-line summary of a run: "8 example materials: 7 unchanged, 1 changed (expected)". */
export function regressionSummary(rows: RegressionRow[]): { text: string; unexpected: number; changed: number } {
  const changed = rows.filter((r) => r.changed);
  const unexpected = changed.filter((r) => !r.expected).length;
  const tail = changed.length ? (unexpected ? ` (${unexpected} not explained by a changed rule)` : " (all expected)") : "";
  return { text: `${rows.length} example materials: ${rows.length - changed.length} unchanged, ${changed.length} changed${tail}.`, unexpected, changed: changed.length };
}
