// Configuration rule engine: answers to SF-01…SF-12 → mandatory / optional / N.A. per section.
// Principle (AS-05, agreed with Beiersdorf on 12 Oct): origin switches on origin annexes, markets switch on market
// annexes, specific questions switch on their annex, EU REACH always applies, the stricter rule wins.
//
// Rules are data (spec §8.1, builtinRules.ts and AppState.config); each Rule carries the check and the sentence derived
// from its declarative condition (conditions.ts). Rule sets resolve like questionnaire versions (catalog.ts): pure with
// the state's config (`ruleSet(version, s.config)`, `deriveScope(…, s.config)`; the domain always passes it), or from
// the store-synced registry when `cfg` is left out (syncRegistry, called by the store on every change).

import { builtinSectionIds, syncCatalog, syncedConfig, templateSections } from "./catalog";
import { conditionCheck, conditionText } from "./conditions";
import { RS1, RS2 } from "./builtinRules";
import type { Applicability, ConfigAnswers, ConfigPair, ConfigState, OriginType, Rule, RuleData, RuleSet, RuleSetData, ScopeItem } from "./types";

/** A rule as the engine uses it: its data plus the check and the sentence derived from the condition. */
export function hydrateRule(d: RuleData): Rule {
  return { ...d, when: conditionCheck(d.condition), text: conditionText(d.condition) };
}

const BUILTIN_RS1: RuleSet = { version: RS1.version, status: "published", templateVersion: RS1.templateVersion, publishedAt: RS1.publishedAt, publishedBy: RS1.publishedBy, changeNote: RS1.changeNote, rules: RS1.rules.map(hydrateRule) };
const BUILTIN_RS2: RuleSet = { version: RS2.version, status: "draft", templateVersion: RS2.templateVersion, changeNote: RS2.changeNote, rules: RS2.rules.map(hydrateRule) };

/** The first published rule set (built in, never stored) and its questionnaire. */
export const FIRST_RULE_SET = RS1.version;

const pairCache = new WeakMap<RuleSetData, Map<string, RuleSet>>();
/** A stored pair's rule set as a RuleSet; `status` is computed (the newest published pair's is "published") and
 *  `templateVersion` is the questionnaire it was last released with. */
function pairRuleSet(p: ConfigPair, status: RuleSet["status"], templateVersion: string): RuleSet {
  let byKey = pairCache.get(p.ruleSet);
  if (!byKey) pairCache.set(p.ruleSet, (byKey = new Map()));
  const key = `${status}|${templateVersion}`;
  let rs = byKey.get(key);
  if (!rs) {
    rs = { version: p.ruleSet.version, status, templateVersion, publishedAt: p.publishedAt, publishedBy: p.publishedBy, changeNote: p.changeNote, rules: p.ruleSet.rules.map(hydrateRule) };
    byKey.set(key, rs);
  }
  return rs;
}

/** The newest published stored pair (undefined: the built-in RS-2026.1 + v1 is current). */
export const currentStoredPair = (cfg?: ConfigState): ConfigPair | undefined => [...(cfg?.pairs ?? [])].reverse().find((p) => p.status === "published");
/** The draft pair, if any (at most one). */
export const draftStoredPair = (cfg?: ConfigState): ConfigPair | undefined => cfg?.pairs.find((p) => p.status === "draft");

/**
 * The stored pair that DEFINES a rule set version: the first pair holding it. A questionnaire-only release keeps the
 * rule set of the release before it and holds an identical copy under the same version; that copy never defines the
 * version. The built-in RS-2026.1 is never defined by a pair.
 */
export function ruleSetPairOf(cfg: ConfigState | undefined, ruleSetVersion: string): ConfigPair | undefined {
  if (!cfg || ruleSetVersion === FIRST_RULE_SET) return undefined;
  return cfg.pairs.find((p) => p.ruleSet.version === ruleSetVersion);
}

/** True when the pair brings its own rule set version (false: it keeps the one of an earlier release). */
export const ownsRuleSet = (cfg: ConfigState | undefined, p: ConfigPair): boolean => ruleSetPairOf(cfg, p.ruleSet.version) === p;

/**
 * Every rule set of a configuration, oldest first, each version once: the built-in RS-2026.1, then the rule sets the
 * stored pairs bring (the draft's last). A rule set kept by a later questionnaire-only release is listed once; its
 * `templateVersion` is the questionnaire it was last released with (for the current one: the questionnaire new cases
 * get). With no config (the built-in catalogue alone) the prepared RS-2026.2 shows as the draft, as before.
 */
export function ruleSetsOf(cfg?: ConfigState): RuleSet[] {
  if (!cfg) return [BUILTIN_RS1, BUILTIN_RS2];
  const current = currentStoredPair(cfg);
  const currentRs = current?.ruleSet.version ?? FIRST_RULE_SET;
  const lastTemplate = new Map<string, string>();
  for (const p of cfg.pairs) if (p.status === "published") lastTemplate.set(p.ruleSet.version, p.template.version);
  const statusOf = (version: string): RuleSet["status"] => (version === currentRs ? "published" : "superseded");
  const firstTpl = lastTemplate.get(FIRST_RULE_SET) ?? RS1.templateVersion;
  const first: RuleSet = statusOf(FIRST_RULE_SET) === "published" && firstTpl === RS1.templateVersion ? BUILTIN_RS1 : { ...BUILTIN_RS1, status: statusOf(FIRST_RULE_SET), templateVersion: firstTpl };
  const own = cfg.pairs.filter((p) => ownsRuleSet(cfg, p));
  return [first, ...own.map((p) => (p.status === "draft" ? pairRuleSet(p, "draft", p.template.version) : pairRuleSet(p, statusOf(p.ruleSet.version), lastTemplate.get(p.ruleSet.version) ?? p.template.version)))];
}

/** Store-synced: every rule set (ruleSetsOf the synced config). Code that has the state uses ruleSetsOf(s.config). */
export const RULE_SETS: RuleSet[] = ruleSetsOf(undefined);

/** A rule set by version (the draft's included). An unknown version gives the first rule set, as before. */
export function ruleSet(version: string, cfg?: ConfigState): RuleSet {
  const c = cfg ?? syncedConfig();
  const all = c === syncedConfig() ? RULE_SETS : ruleSetsOf(c);
  return all.find((r) => r.version === version) ?? all[0];
}

/** The questionnaire version a rule set was last released with (for the current rule set: the one new cases get). */
export const pairedTemplate = (ruleSetVersion: string, cfg?: ConfigState): string => ruleSet(ruleSetVersion, cfg).templateVersion;

/**
 * Keeps the registry in step with the state's configuration: RULE_SETS here, and SECTIONS, SECTION_BY_ID, FIELDS and
 * FIELD_BY_ID in catalog.ts. The store calls it on load and on every change; cheap when the config is unchanged.
 */
export function syncRegistry(cfg: ConfigState | undefined): void {
  if (cfg === syncedConfig() && RULE_SETS.length) return;
  syncCatalog(cfg);
  RULE_SETS.splice(0, RULE_SETS.length, ...ruleSetsOf(cfg));
}

const RANK: Record<Applicability, number> = { mandatory: 3, optional: 2, na: 1 };

/** Sections a new case on a questionnaire version gets, in order (v1 has no Turkey sections; retired ones are left out). */
export function sectionsInTemplate(templateVersion: string, cfg?: ConfigState): string[] {
  return templateSections(templateVersion, cfg).map((x) => x.id);
}

/** The built-in rule of today's v1/v2 split, kept for the live portal's labels: v1 has neither K6.3 nor A12. */
export const builtinSectionsInTemplate = builtinSectionIds;

/**
 * Derive the case-specific scope. Deterministic: same answers + same rule-set version → same result
 * (BRM REQ-PROC-009). Strictest outcome wins; sections no rule touches are N.A. with that reason.
 * Pure when `cfg` (the state's config) is passed; the domain always passes it.
 */
export function deriveScope(config: ConfigAnswers, ruleSetVersion: string, templateVersion = "CIQ-2026 v1", cfg?: ConfigState): ScopeItem[] {
  const rs = ruleSet(ruleSetVersion, cfg);
  const sections = templateSections(templateVersion, cfg);
  const inTemplate = new Set(sections.map((x) => x.id));
  const best = new Map<string, { a: Applicability; rules: string[]; reasons: string[] }>();
  for (const rule of rs.rules) {
    if (!rule.when(config)) continue;
    for (const sec of rule.activates) {
      if (!inTemplate.has(sec)) continue;
      const cur = best.get(sec);
      const reason = `${rule.text} → ${rule.id}`;
      if (!cur || RANK[rule.outcome] > RANK[cur.a]) best.set(sec, { a: rule.outcome, rules: [rule.id], reasons: [reason] });
      else if (RANK[rule.outcome] === RANK[cur.a]) {
        cur.rules.push(rule.id);
        cur.reasons.push(reason);
      }
    }
  }
  return sections.map((s) => {
    const hit = best.get(s.id);
    return hit
      ? { sectionId: s.id, applicability: hit.a, firedRules: hit.rules, reason: hit.reasons.join("; ") }
      : { sectionId: s.id, applicability: "na" as const, firedRules: [], reason: "No rule activates this section for these answers" };
  });
}

/** The rules of a rule set that switch a section on (mandatory or optional), e.g. for "why in scope" texts. */
export function rulesActivating(sectionId: string, ruleSetVersion: string, cfg?: ConfigState): Rule[] {
  return ruleSet(ruleSetVersion, cfg).rules.filter((r) => r.outcome !== "na" && r.activates.includes(sectionId));
}

/** The trigger of a section in plain words, from the rules of a rule set: "Origin includes Vegetable or Polymer (SF-03)
 *  is Yes"; "No rule switches it on yet" when none does. */
export function triggerText(sectionId: string, ruleSetVersion: string, cfg?: ConfigState): string {
  const texts = [...new Set(rulesActivating(sectionId, ruleSetVersion, cfg).map((r) => r.text))];
  if (!texts.length) return "No rule switches it on yet";
  return texts.includes("Every case") ? "Every case" : texts.join(" or ");
}

/**
 * Where the questionnaire collects each evidence item of the rules (live-scope cases): the fields that count as
 * "received" when one of them has a value or a justification. Items without a question elsewhere have their own K1
 * upload slot (FLD-K1-004…010).
 */
export const EVIDENCE_FIELDS: Record<string, string[]> = {
  SDS: ["FLD-K1-001"],
  CoA: ["FLD-K1-002"],
  Specification: ["FLD-K1-003"],
  Statements: ["FLD-K1-004"],
  "Pesticide and mycotoxin analysis": ["FLD-A1-202", "FLD-A1-203"],
  "Sustainability certificates": ["FLD-K1-005"],
  "BSE/TSE certificate": ["FLD-K1-006"],
  "Conformity with Annex II entry 419": ["FLD-K1-007"],
  "Origin and specification of the mineral source": ["FLD-2.3-12"],
  "MOAH value": ["FLD-A4-101"],
  "PAH analysis against BDF limits": ["FLD-K1-008"],
  "Residual monomer content": ["FLD-K1-009"],
  "SPM scope statement": ["FLD-K1-010"],
  // Legacy: R-80 (dropped 28 Oct) is still in the pinned bundles of earlier cases; without the mapping requestedDocs
  // would add an RSPO slot to them.
  "RSPO certificate with supply-chain model": ["FLD-A1-206"],
  "RSPO number on the CoA": ["FLD-K1-002"],
};

/** Evidence documents required by the fired rules. */
export function requiredEvidence(config: ConfigAnswers, ruleSetVersion: string, cfg?: ConfigState): { ruleId: string; doc: string }[] {
  return ruleSet(ruleSetVersion, cfg)
    .rules.filter((r) => r.when(config) && r.evidence)
    .flatMap((r) => r.evidence!.map((doc) => ({ ruleId: r.id, doc })));
}

/** Origins with no rules yet (OP-19): the supplier gets the standard sections and the case is flagged for RMM (AS-09). */
export const UNDEFINED_ORIGINS: OriginType[] = ["waste", "ccu", "chemrec"];

/** The answered origins (SF-01) that have no rules yet, in answer order. */
export function undefinedOrigins(config: ConfigAnswers): OriginType[] {
  return (config.SF01 ?? []).filter((o) => UNDEFINED_ORIGINS.includes(o));
}

/** True when SF-01 contains an origin without rules: the case is flagged in RMM's Part 2 review (informational only). */
export function hasUndefinedOrigin(config: ConfigAnswers): boolean {
  return undefinedOrigins(config).length > 0;
}

export interface ScopeDiff {
  added: string[];
  removed: string[];
  changed: { sectionId: string; from: Applicability; to: Applicability }[];
}

/** Difference list shown when a configuration answer changes (BRM REQ-CFG-008). */
export function diffScope(before: ScopeItem[], after: ScopeItem[]): ScopeDiff {
  const b = new Map(before.map((x) => [x.sectionId, x.applicability]));
  const diff: ScopeDiff = { added: [], removed: [], changed: [] };
  // Sections that exist only in the earlier version (template change) count as removed.
  const afterIds = new Set(after.map((x) => x.sectionId));
  for (const item of before) if (!afterIds.has(item.sectionId) && item.applicability !== "na") diff.removed.push(item.sectionId);
  for (const item of after) {
    const prev = b.get(item.sectionId) ?? "na";
    if (prev === item.applicability) continue;
    if (prev === "na") diff.added.push(item.sectionId);
    else if (item.applicability === "na") diff.removed.push(item.sectionId);
    else diff.changed.push({ sectionId: item.sectionId, from: prev, to: item.applicability });
  }
  return diff;
}

export interface ScopeGrowth {
  scope: ScopeItem[];
  /** Sections that were N.A. and now apply (marked addedLater). */
  added: string[];
  /** Sections that went from optional to mandatory (marked addedLater). */
  upgraded: string[];
  /** Sections the new answers would lower or close, kept as they were. */
  kept: string[];
}

const KEPT_NOTE = "kept: the scope only grows after the completeness confirmation (REQ-CFG-008)";

/**
 * After the completeness confirmation the scope only grows (BRM v2 REQ-CFG-008): a re-derived scope may open a
 * section or make it stricter, but never closes one or lowers mandatory to optional, so nothing RMM or a department
 * is reviewing disappears. Pure: `before` is the case's scope, `derived` a fresh deriveScope() for the new answers.
 */
export function growScope(before: ScopeItem[], derived: ScopeItem[]): ScopeGrowth {
  const prev = new Map(before.map((b) => [b.sectionId, b]));
  const g: ScopeGrowth = { scope: [], added: [], upgraded: [], kept: [] };
  for (const d of derived) {
    const b = prev.get(d.sectionId);
    const from = b?.applicability ?? "na";
    if (RANK[d.applicability] > RANK[from]) {
      (from === "na" ? g.added : g.upgraded).push(d.sectionId);
      g.scope.push({ ...d, manual: b?.manual, addedLater: true });
    } else if (b && RANK[d.applicability] < RANK[from]) {
      g.kept.push(d.sectionId);
      g.scope.push(b.reason.includes(KEPT_NOTE) ? b : { ...b, reason: `${b.reason} · ${KEPT_NOTE}` });
    } else if (b?.manual) {
      g.scope.push(b); // same level as a manual extension: keep the extension and its justification
    } else {
      g.scope.push({ ...d, addedLater: b?.addedLater });
    }
  }
  // Sections only in the earlier scope (template mismatch) stay unchanged.
  for (const b of before) if (!derived.some((d) => d.sectionId === b.sectionId)) g.scope.push(b);
  return g;
}
