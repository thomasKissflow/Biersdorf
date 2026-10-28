// Pure helpers of the business-administration screens: rule-set and questionnaire versions, configuration summaries
// and scope comparison. No React, so they are unit-tested directly.
import { CONFIG_QUESTIONS, ORIGIN_LABEL } from "@/domain/catalog";
import { nextVersionNumbers, pairLabel } from "@/domain/configActions";
import { RULE_SETS, diffScope, type ScopeDiff } from "@/domain/rules";
import type { AppState, ConfigAnswers, ConfigQuestionId, ConfigState, RuleData, RuleSet, ScopeItem } from "@/domain/types";

// ------------------------------------------------------------------ rule-set and template versions

/** The draft rule set waiting to be published, if any (`sets`: the rule sets of the state, default the synced list). */
export function pendingDraft(sets: readonly RuleSet[] = RULE_SETS): RuleSet | undefined {
  return sets.find((r) => r.status === "draft");
}

/** The rule set new cases use: the newest published one. */
export function currentRuleSet(sets: readonly RuleSet[] = RULE_SETS): RuleSet {
  return sets.find((r) => r.status === "published") ?? sets[0];
}

/** The rule set released before `version` (undefined for the first one). */
export function previousRuleSet(sets: readonly RuleSet[], version: string): RuleSet | undefined {
  const i = sets.findIndex((r) => r.version === version);
  return i > 0 ? sets[i - 1] : undefined;
}

/** A rule in a fixed key order, so two equal rules compare equal whatever order their keys were written in. */
export function ruleKey(r: RuleData): string {
  const c = r.condition;
  return JSON.stringify([
    c.kind,
    "question" in c ? c.question : "",
    "values" in c ? [...c.values].sort() : "value" in c ? c.value : "",
    [...r.activates].sort(),
    r.outcome,
    r.evidence ?? [],
    [...r.departments].sort(),
    r.basis,
    r.note ?? "",
    !!r.flagsCase,
  ]);
}

export interface RuleDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

/** Which rules `next` adds, changes or removes compared with `prev`. */
export function ruleDiff(prev: readonly RuleData[], next: readonly RuleData[]): RuleDiff {
  const p = new Map(prev.map((r) => [r.id, r]));
  const n = new Set(next.map((r) => r.id));
  return {
    added: next.filter((r) => !p.has(r.id)).map((r) => r.id),
    changed: next.filter((r) => p.has(r.id) && ruleKey(p.get(r.id)!) !== ruleKey(r)).map((r) => r.id),
    removed: prev.filter((r) => !n.has(r.id)).map((r) => r.id),
  };
}

/** "new" / "changed" per rule id of `next`, compared with `prev`. */
export function ruleMarksBetween(prev: readonly RuleData[], next: readonly RuleData[]): Map<string, "new" | "changed"> {
  const d = ruleDiff(prev, next);
  return new Map([...d.added.map((id) => [id, "new"] as const), ...d.changed.map((id) => [id, "changed"] as const)]);
}

/** The working numbers a new draft gets (createDraft's own rule, nextVersionNumbers: per side), labelled
 *  "RS-2026.3 + v3". Only the side that changes keeps its number when the draft is published. */
export function nextVersions(cfg: ConfigState): { ruleSetVersion: string; templateVersion: string; label: string } {
  const n = nextVersionNumbers(cfg);
  return { ...n, label: pairLabel(n.ruleSetVersion, n.templateVersion) };
}

export const casesOnRuleSet = (state: AppState, version: string) => state.cases.filter((c) => c.ruleSetVersion === version).length;

/** "1 case", "3 cases", "no case". */
export const casesText = (n: number) => (n === 0 ? "no case" : n === 1 ? "1 case" : `${n} cases`);

/** "1 change", "3 changes", "no changes". */
export const changesCount = (n: number) => (n === 0 ? "no changes" : n === 1 ? "1 change" : `${n} changes`);

export const shortVersion = (templateVersion: string) => templateVersion.replace(/^CIQ-\d{4}\s+/, "");

// ------------------------------------------------------------------ configuration answers

export function questionMeta(id: ConfigQuestionId | "ALWAYS"): { code: string; label: string; by?: string } {
  if (id === "ALWAYS") return { code: "Always", label: "Applies to every case, whatever the answers" };
  const q = CONFIG_QUESTIONS.find((x) => x.id === id);
  return { code: q?.code ?? id, label: q?.label ?? id, by: q?.answeredBy === "rmm" ? "Set by RMM" : "Answered by supplier" };
}

/** Compact, human description of a configuration (used in tables). */
export function configSummary(c: ConfigAnswers): { origins: string; flags: string; markets: string } {
  const origins = (c.SF01 ?? []).map((o) => ORIGIN_LABEL[o].replace(/ \(.*\)$/, "")).join(" + ");
  const flags = CONFIG_QUESTIONS.filter((q) => q.kind === "yesno" && q.id !== "SF12" && c[q.id] === true).map((q) => q.code);
  if ((c.SF05 ?? []).length) flags.push(`SF-05 ${(c.SF05 ?? []).join(" + ")}`);
  if (c.SF12 === false) flags.push("micro waived");
  return {
    origins: origins || "Origin not answered yet",
    flags: flags.join(", "),
    markets: (c.SF11 ?? []).join(", ") || "—",
  };
}

/**
 * diffScope compares only the sections present in `after`; across questionnaire versions a section
 * can be missing on one side. Missing sections count as not applicable on both sides.
 */
export function scopeDiff(before: ScopeItem[], after: ScopeItem[]): ScopeDiff {
  const pad = (xs: ScopeItem[], other: ScopeItem[]): ScopeItem[] => [
    ...xs,
    ...other.filter((o) => !xs.some((x) => x.sectionId === o.sectionId)).map((o) => ({ sectionId: o.sectionId, applicability: "na" as const, firedRules: [], reason: "Not in this questionnaire version" })),
  ];
  return diffScope(pad(before, after), pad(after, before));
}
