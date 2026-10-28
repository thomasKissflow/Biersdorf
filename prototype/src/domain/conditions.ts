// Rule conditions as data (spec §8.1): one evaluator turns a declarative condition into a check, one text builder turns
// it into a plain sentence ("Origin includes Vegetable", "Any target market outside the EU"), and ruleSentence() reads a
// whole rule as the preview sentence of the rule editor. Pure; no state.

import { CONFIG_BY_ID, CONFIG_QUESTIONS, DEPT_SHORT, SECTION_BY_ID } from "./catalog";
import type { Applicability, ConfigAnswers, ConfigQuestionId, RuleBasis, RuleCondition, RuleConditionKind, RuleData } from "./types";

// ---------------------------------------------------------------------------------- evaluator

/** True when the answers meet the condition. An unanswered multi-choice question never meets includes-any/any-except. */
export function evaluateCondition(cond: RuleCondition, c: ConfigAnswers): boolean {
  switch (cond.kind) {
    case "always":
      return true;
    case "includes-any": {
      const v = c[cond.question];
      return Array.isArray(v) && (v as string[]).some((x) => cond.values.includes(x));
    }
    case "any-except": {
      const v = c[cond.question];
      return Array.isArray(v) && (v as string[]).some((x) => !cond.values.includes(x));
    }
    case "is":
      return c[cond.question] === cond.value;
    case "yes-or-unanswered":
      return c[cond.question] !== false;
  }
}

/** The check of a condition as a function (Rule.when). */
export const conditionCheck =
  (cond: RuleCondition) =>
  (c: ConfigAnswers): boolean =>
    evaluateCondition(cond, c);

/** The question a condition reads ("ALWAYS" for an always-condition); Rule.question follows it. */
export const conditionQuestion = (cond: RuleCondition): ConfigQuestionId | "ALWAYS" => (cond.kind === "always" ? "ALWAYS" : cond.question);

// ---------------------------------------------------------------------------------- questions and options

/** The condition kinds a question allows: multi-choice → includes-any, any-except; yes/no → is, yes-or-unanswered. */
export function conditionKindsFor(question: ConfigQuestionId | "ALWAYS"): RuleConditionKind[] {
  if (question === "ALWAYS") return ["always"];
  return CONFIG_BY_ID[question]?.kind === "multi" ? ["includes-any", "any-except"] : ["is", "yes-or-unanswered"];
}

/** The rule editor's "When [question ▾]" list: "Every case" plus every metadata question. */
export const CONDITION_QUESTIONS: { id: ConfigQuestionId | "ALWAYS"; code: string; label: string; kind: "always" | "multi" | "yesno" }[] = [
  { id: "ALWAYS", code: "Always", label: "Every case, whatever the answers", kind: "always" },
  ...CONFIG_QUESTIONS.map((q) => ({ id: q.id, code: q.code, label: q.label, kind: q.kind })),
];

/** Plain labels of the condition kinds, as the rule form shows them. */
export const CONDITION_KIND_LABEL: Record<RuleConditionKind, string> = {
  always: "Every case",
  is: "is",
  "yes-or-unanswered": "is Yes or not answered",
  "includes-any": "includes any of",
  "any-except": "has any value except",
};

/** A default condition for a question (the rule form switches to it when the question changes). */
export function defaultCondition(question: ConfigQuestionId | "ALWAYS"): RuleCondition {
  if (question === "ALWAYS") return { kind: "always" };
  return CONFIG_BY_ID[question]?.kind === "multi" ? { kind: "includes-any", question, values: [] } : { kind: "is", question, value: true };
}

/** Why a condition cannot be saved (null = complete): the question exists, the kind fits it, a list has values. */
export function conditionProblem(cond: RuleCondition): string | null {
  if (cond.kind === "always") return null;
  const q = CONFIG_BY_ID[cond.question];
  if (!q) return "Choose the question that switches the rule on.";
  if (!conditionKindsFor(cond.question).includes(cond.kind)) return q.kind === "multi" ? `${q.code} is a multiple-choice question: use "includes any of" or "has any value except".` : `${q.code} is a yes/no question: use "is Yes", "is No" or "is Yes or not answered".`;
  if (cond.kind === "includes-any" || cond.kind === "any-except") {
    const known = new Set((q.options ?? []).map((o) => o.value));
    const unknown = cond.values.filter((v) => !known.has(v));
    if (unknown.length) return `${q.code} has no answer ${unknown.map((v) => `“${v}”`).join(", ")}.`;
    if (cond.kind === "includes-any" && !cond.values.length) return `Tick at least one answer of ${q.code}.`;
    if (cond.kind === "any-except" && cond.values.length >= (q.options ?? []).length) return `Leave at least one answer of ${q.code} unticked.`;
  }
  return null;
}

/** Short answer labels used in sentences ("Vegetable" rather than "Vegetable (bio mass)"). */
const SHORT_OPTION: Record<string, string> = {
  vegetable: "Vegetable",
  animal: "Animal",
  mineral: "Mineral",
  petrochemical: "Petrochemical",
  polymer: "Polymer",
  waste: "Waste",
  ccu: "CCU",
  chemrec: "Chemical recycling",
  colorant: "Colorant",
  preservative: "Preservative",
  EU: "the EU",
  UK: "United Kingdom",
  TR: "Turkey",
  CN: "China",
  US: "USA",
  CA: "Canada",
  OTHER: "Other markets",
};

/** A short label of one answer of a multi-choice question. */
export function optionShort(question: ConfigQuestionId, value: string): string {
  return SHORT_OPTION[value] ?? CONFIG_BY_ID[question]?.options?.find((o) => o.value === value)?.label ?? value;
}

/** The subject of a multi-choice question in a sentence. */
const MULTI_SUBJECT: Partial<Record<ConfigQuestionId, { subject: string; verb: string; noun: string }>> = {
  SF01: { subject: "Origin", verb: "includes", noun: "origin" },
  SF05: { subject: "Material type", verb: "includes", noun: "material type" },
  SF11: { subject: "Target markets", verb: "include", noun: "target market" },
};

/** A short name of a yes/no question in a sentence. */
const YESNO_SUBJECT: Partial<Record<ConfigQuestionId, string>> = {
  SF03: "Polymer",
  SF04: "UV filter",
  SF06: "Fermentation or GMO",
  SF07: "Mineral oil or hydrocarbon",
  SF09: "In EUDR scope",
  SF10: "Brazilian genetic heritage",
  SF12: "Microbiological test required",
};

/** "A", "A or B", "A, B or C". */
export const orList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);
/** "A", "A and B", "A, B and C". */
export const andList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const yesNoName = (q: ConfigQuestionId) => `${YESNO_SUBJECT[q] ?? CONFIG_BY_ID[q]?.label ?? q} (${CONFIG_BY_ID[q]?.code ?? q})`;
const multi = (q: ConfigQuestionId) => MULTI_SUBJECT[q] ?? { subject: CONFIG_BY_ID[q]?.code ?? q, verb: "includes", noun: `answer to ${CONFIG_BY_ID[q]?.code ?? q}` };
const outsideEu = (cond: RuleCondition) => cond.kind === "any-except" && cond.question === "SF11" && cond.values.length === 1 && cond.values[0] === "EU";

// ---------------------------------------------------------------------------------- text builder

/**
 * The condition as a plain sentence:
 * "Every case" · "Origin includes Vegetable" · "Target markets include United Kingdom" · "Any target market outside the
 * EU" · "Any origin other than Vegetable" · "UV filter (SF-04) is Yes" · "Microbiological test required (SF-12) is Yes or
 * not answered".
 */
export function conditionText(cond: RuleCondition): string {
  switch (cond.kind) {
    case "always":
      return "Every case";
    case "includes-any": {
      const m = multi(cond.question);
      return `${m.subject} ${m.verb} ${orList(cond.values.map((v) => optionShort(cond.question, v))) || "(no answer ticked)"}`;
    }
    case "any-except": {
      if (outsideEu(cond)) return "Any target market outside the EU";
      const m = multi(cond.question);
      const noun = m.noun.charAt(0).toUpperCase() + m.noun.slice(1);
      return cond.values.length ? `Any ${m.noun} other than ${orList(cond.values.map((v) => optionShort(cond.question, v)))}` : `${noun} answered`;
    }
    case "is":
      return `${yesNoName(cond.question)} is ${cond.value ? "Yes" : "No"}`;
    case "yes-or-unanswered":
      return `${yesNoName(cond.question)} is Yes or not answered`;
  }
}

/** The "If …" clause of the preview sentence: "If the origin includes Vegetable", "For every case". */
export function conditionClause(cond: RuleCondition): string {
  switch (cond.kind) {
    case "always":
      return "For every case";
    case "includes-any": {
      const m = multi(cond.question);
      return `If the ${m.subject.toLowerCase()} ${m.verb} ${orList(cond.values.map((v) => optionShort(cond.question, v))) || "(no answer ticked)"}`;
    }
    case "any-except": {
      if (outsideEu(cond)) return "If any target market is outside the EU";
      const m = multi(cond.question);
      return cond.values.length ? `If any ${m.noun} is other than ${orList(cond.values.map((v) => optionShort(cond.question, v)))}` : `If the ${m.noun} is answered`;
    }
    case "is":
    case "yes-or-unanswered": {
      // "If the supplier answers Yes to SF-03 (Polymer)": who answers, the answer, then the question.
      const q = CONFIG_BY_ID[cond.question];
      const who = q?.answeredBy === "rmm" ? "Beiersdorf answers" : "the supplier answers";
      const name = `${q?.code ?? cond.question}${YESNO_SUBJECT[cond.question] ? ` (${YESNO_SUBJECT[cond.question]})` : ""}`;
      return cond.kind === "is" ? `If ${who} ${cond.value ? "Yes" : "No"} to ${name}` : `If ${who} Yes to ${name}, or has not answered it yet`;
    }
  }
}

/**
 * Why the supplier is asked for something, as the clause after "Asked for because": "the origin includes Animal", "you
 * answered Yes to SF-03 (Polymer)", "a target market is outside the EU". null for an always-condition (asked for every
 * raw material). Supplier-safe: no rule ids.
 */
export function conditionReason(cond: RuleCondition): string | null {
  switch (cond.kind) {
    case "always":
      return null;
    case "includes-any": {
      const m = multi(cond.question);
      return `the ${m.subject.toLowerCase()} ${m.verb} ${orList(cond.values.map((v) => optionShort(cond.question, v)))}`;
    }
    case "any-except": {
      if (outsideEu(cond)) return "a target market is outside the EU";
      const m = multi(cond.question);
      const article = /^[aeiou]/i.test(m.noun) ? "an" : "a";
      return cond.values.length ? `${article} ${m.noun} other than ${orList(cond.values.map((v) => optionShort(cond.question, v)))} is chosen` : `the ${m.noun} is answered`;
    }
    case "is":
    case "yes-or-unanswered": {
      const q = CONFIG_BY_ID[cond.question];
      const who = q?.answeredBy === "rmm" ? "Beiersdorf answered" : "you answered";
      // The supplier reads the question itself, never its code (SF-03).
      const name = q?.label ? `“${q.label}”` : cond.question;
      return cond.kind === "is" ? `${who} ${cond.value ? "Yes" : "No"} to ${name}` : `${who} Yes to ${name} or have not answered it yet`;
    }
  }
}

/** "Asked for because the origin includes Animal" (several conditions joined with "and"); "Asked for every raw
 *  material" when one of them applies to every case. */
export function reasonSentence(conds: RuleCondition[]): string {
  const clauses = conds.map(conditionReason);
  if (!clauses.length || clauses.some((x) => x === null)) return "Asked for every raw material";
  return `Asked for because ${andList([...new Set(clauses as string[])])}`;
}

export const OUTCOME_LABEL: Record<Applicability, string> ={ mandatory: "Mandatory", optional: "Optional", na: "Not applicable" };
const OUTCOME_WORD: Record<Applicability, string> = { mandatory: "mandatory", optional: "optional", na: "not applicable" };

/** The basis choices of the rule form (spec §8.3); "open" is kept for the built-in optional rule. */
export const BASIS_LABEL: Record<RuleBasis, string> = {
  document: "Requirements document",
  agreed: "Agreed with Beiersdorf",
  "not-stated": "Not in the requirements",
  open: "Open question",
};

/** Section codes for a sentence: "Annex 1, 2 and 9" when all are annexes, otherwise each code ("K4.3, Annex 1 and
 *  Annex 6"). */
export function sectionsText(ids: string[], codeOf: (id: string) => string = (id) => SECTION_BY_ID[id]?.code ?? id): string {
  const codes = ids.map(codeOf);
  const annex = codes.map((c) => /^Annex\s+(.+)$/.exec(c)?.[1]);
  if (codes.length > 1 && annex.every(Boolean)) return `Annex ${andList(annex as string[])}`;
  return andList(codes);
}

/**
 * The whole rule as the rule editor's live preview, e.g. "If the origin includes Vegetable, Annex 1, 2 and 9 become
 * mandatory. The supplier uploads Pesticide and mycotoxin analysis and Sustainability certificates. Reviewed by
 * Sustainability, Regulatory and Safety."
 */
export function ruleSentence(r: Pick<RuleData, "condition" | "activates" | "outcome" | "evidence" | "departments" | "flagsCase">, codeOf?: (id: string) => string, titleOf?: (id: string) => string | undefined): string {
  const clause = conditionClause(r.condition);
  const evidence = (r.evidence ?? []).filter((e) => e.trim());
  const out: string[] = [];
  if (r.activates.length) {
    // One section: its title too ("K6.18 Microplastics declaration becomes mandatory"), when the caller knows it.
    const one = r.activates.length === 1 ? titleOf?.(r.activates[0])?.trim() : undefined;
    out.push(`${clause}, ${sectionsText(r.activates, codeOf)}${one ? ` ${one}` : ""} ${r.activates.length === 1 ? "becomes" : "become"} ${OUTCOME_WORD[r.outcome]}.`);
    if (evidence.length) out.push(`The supplier uploads ${andList(evidence)}.`);
  } else if (evidence.length) out.push(`${clause}, the supplier uploads ${andList(evidence)}.`);
  else if (r.flagsCase) out.push(`${clause}, the case is flagged in RMM's review.`);
  else out.push(`${clause}, nothing changes yet: choose the sections it switches on or the evidence it asks for.`);
  if (r.departments.length) out.push(`Reviewed by ${andList(r.departments.map((d) => DEPT_SHORT[d]))}.`);
  return out.join(" ");
}
