// Form models of the configuration editor (spec §8.3): the rule form, the section form and the question form. Pure, so
// the inline checks are unit-tested; the domain (configActions) checks again and refuses what is still wrong.
import { CONFIG_BY_ID, isChoiceType, isNumberType } from "@/domain/catalog";
import { conditionProblem } from "@/domain/conditions";
import { normalizeSectionCode, sectionCodeDuplicate, sectionCodeProblem, type FieldInput, type RuleInput, type SectionInput } from "@/domain/configActions";
import { isOptionalEvidence, uploadsMandatory } from "@/domain/requestedDocs";
import type { Applicability, ConfigQuestionId, ConfigState, Dept, FieldData, FieldType, Requiredness, RuleBasis, RuleCondition, RuleData, SectionData, SectionKind } from "@/domain/types";

// ---------------------------------------------------------------------------------- rule form

/** How the answer is compared: one value per button of the rule form. */
export type ConditionMode = "always" | "is-yes" | "is-no" | "yes-or-unanswered" | "includes-any" | "any-except";

export const CONDITION_MODE_LABEL: Record<ConditionMode, string> = {
  always: "Every case",
  "is-yes": "is Yes",
  "is-no": "is No",
  "yes-or-unanswered": "is Yes or not answered",
  "includes-any": "includes any of",
  "any-except": "has any answer except",
};

export interface RuleForm {
  id?: string;
  /** "" until the administrator picks a question. */
  question: ConfigQuestionId | "ALWAYS" | "";
  mode: ConditionMode;
  /** The ticked answers of a multiple-choice question. */
  values: string[];
  activates: string[];
  outcome: Applicability;
  evidence: string[];
  /** The documents of `evidence` the supplier may leave out ("Optional" next to the document; default Mandatory). */
  optionalEvidence: string[];
  departments: Dept[];
  basis: RuleBasis;
  note: string;
  flagsCase?: boolean;
}

/** The modes a question allows: yes/no questions compare with Yes or No, multiple-choice ones with a list. */
export function modesFor(question: RuleForm["question"]): ConditionMode[] {
  if (question === "") return [];
  if (question === "ALWAYS") return ["always"];
  return CONFIG_BY_ID[question]?.kind === "multi" ? ["includes-any", "any-except"] : ["is-yes", "is-no", "yes-or-unanswered"];
}

/**
 * A new rule: no question yet, Mandatory; `activates` preselects sections and `departments` the reviewers (the leads of
 * those sections). The basis starts as "Agreed with Beiersdorf": a rule the business adds is its own decision, and is
 * not counted as coming from the requirements document unless the administrator says so.
 */
export function emptyRuleForm(activates: string[] = [], departments: Dept[] = []): RuleForm {
  return { question: "", mode: "is-yes", values: [], activates, outcome: "mandatory", evidence: [], optionalEvidence: [], departments, basis: "agreed", note: "" };
}

/** The form of an existing rule. */
export function ruleFormOf(r: RuleData): RuleForm {
  const c = r.condition;
  const evidence = [...(r.evidence ?? [])];
  const base = { id: r.id, activates: [...r.activates], outcome: r.outcome, evidence, optionalEvidence: evidence.filter((e) => isOptionalEvidence(r, e)), departments: [...r.departments], basis: r.basis, note: r.note ?? "", ...(r.flagsCase ? { flagsCase: true } : {}) };
  switch (c.kind) {
    case "always":
      return { ...base, question: "ALWAYS", mode: "always", values: [] };
    case "is":
      return { ...base, question: c.question, mode: c.value ? "is-yes" : "is-no", values: [] };
    case "yes-or-unanswered":
      return { ...base, question: c.question, mode: "yes-or-unanswered", values: [] };
    case "includes-any":
    case "any-except":
      return { ...base, question: c.question, mode: c.kind, values: [...c.values] };
  }
}

/** The form after choosing another question: the first mode that fits it, no answers ticked. */
export function withQuestion(f: RuleForm, question: RuleForm["question"]): RuleForm {
  if (question === f.question) return f;
  const modes = modesFor(question);
  return { ...f, question, mode: modes[0] ?? "is-yes", values: [] };
}

/** The declarative condition of the form (null while no question is chosen). */
export function conditionOf(f: RuleForm): RuleCondition | null {
  const q = f.question;
  if (q === "") return null;
  if (q === "ALWAYS") return { kind: "always" };
  switch (f.mode) {
    case "is-yes":
      return { kind: "is", question: q, value: true };
    case "is-no":
      return { kind: "is", question: q, value: false };
    case "yes-or-unanswered":
      return { kind: "yes-or-unanswered", question: q };
    case "includes-any":
      return { kind: "includes-any", question: q, values: [...f.values] };
    case "any-except":
      return { kind: "any-except", question: q, values: [...f.values] };
    default:
      return { kind: "always" };
  }
}

export interface RuleFormProblems {
  question?: string;
  answer?: string;
  sections?: string;
  departments?: string;
}

/** What still stops the rule from being saved, per part of the form (empty object: it can be saved). */
export function ruleFormProblems(f: RuleForm, liveSectionIds?: ReadonlySet<string>): RuleFormProblems {
  const out: RuleFormProblems = {};
  const cond = conditionOf(f);
  if (!cond) out.question = "Choose the question that switches the rule on.";
  else {
    const p = conditionProblem(cond);
    if (p) out.answer = p;
  }
  const live = liveSectionIds ? f.activates.filter((id) => liveSectionIds.has(id)) : f.activates;
  if (!live.length && !f.evidence.some((e) => e.trim()) && !f.flagsCase) out.sections = "Choose at least one section, or ask for evidence.";
  if (!f.departments.length) out.departments = "Choose at least one department that reviews it.";
  return out;
}

export const hasProblems = (p: object) => Object.keys(p).length > 0;

/** The rule as the store's upsertRule takes it. Call only when ruleFormProblems is empty. The optional documents are
 *  sent only when there are any, and only those still asked for (optionalEvidence ⊆ evidence). */
export function ruleInputOf(f: RuleForm): RuleInput {
  const evidence = f.evidence.map((e) => e.trim()).filter(Boolean);
  const optionalEvidence = evidence.filter((e) => isOptionalEvidence(f, e));
  return {
    ...(f.id ? { id: f.id } : {}),
    condition: conditionOf(f) ?? { kind: "always" },
    activates: [...f.activates],
    outcome: f.outcome,
    evidence,
    ...(optionalEvidence.length ? { optionalEvidence } : {}),
    departments: [...f.departments],
    basis: f.basis,
    note: f.note.trim(),
    ...(f.flagsCase ? { flagsCase: true } : {}),
  };
}

/** Adds an evidence name to the chips (trimmed, no duplicates, case-insensitive). */
export function addEvidence(list: string[], name: string): string[] {
  const n = name.trim();
  if (!n || list.some((x) => x.toLowerCase() === n.toLowerCase())) return list;
  return [...list, n];
}

/** The form with another evidence list: a document no longer asked for drops out of the optional ones too. A new
 *  document starts as Mandatory. */
export function withEvidence(f: RuleForm, evidence: string[]): RuleForm {
  return { ...f, evidence, optionalEvidence: f.optionalEvidence.filter((o) => evidence.some((e) => isOptionalEvidence({ optionalEvidence: [o] }, e))) };
}

/** The form with one document set Mandatory (`optional` false) or Optional. */
export function withEvidenceOptional(f: RuleForm, doc: string, optional: boolean): RuleForm {
  const others = f.optionalEvidence.filter((o) => !isOptionalEvidence({ optionalEvidence: [o] }, doc));
  return { ...f, optionalEvidence: optional && f.evidence.includes(doc) ? [...others, doc] : others };
}

// ---------------------------------------------------------------------------------- section form

export interface SectionForm {
  id?: string;
  code: string;
  title: string;
  kind: SectionKind;
  meaning: string;
  lead: Dept;
  co: Dept[];
  documentsOnly: boolean;
  /** Documents only, "Upload required?" (default Optional, as before 29 Oct). */
  uploads: "mandatory" | "optional";
}

/** A new section: a chapter with questions, led by Regulatory. */
export function emptySectionForm(): SectionForm {
  return { code: "", title: "", kind: "chapter", meaning: "", lead: "REG", co: [], documentsOnly: false, uploads: "optional" };
}

export function sectionFormOf(x: SectionData): SectionForm {
  return { id: x.id, code: x.code, title: x.title, kind: x.kind, meaning: x.meaning, lead: x.lead, co: [...x.co], documentsOnly: x.documentsOnly, uploads: uploadsMandatory(x) ? "mandatory" : "optional" };
}

/** The kind a code suggests: "Annex 14", "A14" or "A 14" → annex, anything else → chapter. */
export const kindFromCode = (code: string): SectionKind => (/^\s*annex(\s|\d|$)/i.test(code) || /^\s*a\s*\d/i.test(code) ? "annex" : "chapter");

export interface SectionFormProblems {
  code?: string;
  title?: string;
  content?: string;
}

/**
 * The duplicate-code check of the section form, while the administrator types (Save stays disabled while it fails): the
 * domain's own check (sectionCodeDuplicate), so "Annex 4" = "A4" = "annex4" = "A 4" and "K6.1" = "k6.1" against every
 * section of every version, retired ones included; an edited section is not compared with itself.
 */
export function sectionCodeDuplicateOf(f: SectionForm, cfg: ConfigState): string | undefined {
  return sectionCodeDuplicate(cfg, f.code, f.id);
}

/**
 * Inline checks of the section form: a code in the usual shape that no section of any version uses (the same check as
 * upsertSection), and a title. `cfg`: the state's configuration (the draft holds the section being edited).
 */
export function sectionFormProblems(f: SectionForm, cfg: ConfigState): SectionFormProblems {
  const out: SectionFormProblems = {};
  const draft = cfg.pairs.find((p) => p.status === "draft")?.template.sections ?? [];
  const code = sectionCodeProblem(cfg, f.code, f.id);
  if (code) out.code = code;
  if (!f.title.trim()) out.title = "Enter a title.";
  const existing = f.id ? draft.find((x) => x.id === f.id) : undefined;
  if (existing && f.documentsOnly && !existing.documentsOnly && existing.fields.length)
    out.content = `This section still has ${existing.fields.length === 1 ? "a question" : `${existing.fields.length} questions`}. Remove ${existing.fields.length === 1 ? "it" : "them"} first, or keep “Questions”.`;
  if (f.id === "GEN" && f.documentsOnly) out.content = "General information holds the basic data and the metadata questions: it keeps its questions.";
  return out;
}

/** The section as upsertSection takes it; "Upload required?" only for a documents-only section. */
export function sectionInputOf(f: SectionForm): SectionInput {
  return { ...(f.id ? { id: f.id } : {}), code: normalizeSectionCode(f.code), title: f.title.trim(), kind: f.kind, meaning: f.meaning.trim(), lead: f.lead, co: f.co.filter((d) => d !== f.lead), documentsOnly: f.documentsOnly, ...(f.documentsOnly ? { uploads: f.uploads } : {}) };
}

// ---------------------------------------------------------------------------------- question (field) form

export interface FieldForm {
  id?: string;
  label: string;
  type: FieldType;
  required: Requiredness;
  /** `value` is kept for existing options (answers refer to it); new options take their label as value. */
  options: { value?: string; label: string }[];
  unit: string;
  noUnit: boolean;
  help: string;
  owner: Dept;
}

/** A new question: short text, mandatory, owned by the section's lead. */
export function emptyFieldForm(owner: Dept): FieldForm {
  return { label: "", type: "text", required: "mandatory", options: [], unit: "", noUnit: false, help: "", owner };
}

export function fieldFormOf(f: FieldData): FieldForm {
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    required: f.required,
    options: (f.options ?? []).map((o) => ({ value: o.value, label: o.label })),
    unit: f.unit ?? "",
    noUnit: f.unit === "",
    help: f.help ?? "",
    owner: f.owner,
  };
}

/** The form after choosing another type: a choice type starts with two empty options. */
export function withType(f: FieldForm, type: FieldType): FieldForm {
  if (type === f.type) return f;
  const options = isChoiceType(type) && f.options.length === 0 ? [{ label: "" }, { label: "" }] : f.options;
  return { ...f, type, options };
}

export interface FieldFormProblems {
  label?: string;
  options?: string;
  unit?: string;
}

export function fieldFormProblems(f: FieldForm): FieldFormProblems {
  const out: FieldFormProblems = {};
  if (!f.label.trim()) out.label = "Enter the question as the supplier reads it.";
  if (isChoiceType(f.type)) {
    const labels = f.options.map((o) => o.label.trim());
    if (labels.filter(Boolean).length < 2) out.options = "Give at least 2 options.";
    else if (labels.some((x) => !x)) out.options = "Fill in or remove the empty option.";
    else if (new Set(labels.map((x) => x.toLowerCase())).size !== labels.length) out.options = "Two options have the same text.";
  }
  if (isNumberType(f.type) && !f.noUnit && !f.unit.trim()) out.unit = "Enter the unit, or tick “No unit”.";
  return out;
}

export function fieldInputOf(f: FieldForm): FieldInput {
  const input: FieldInput = { ...(f.id ? { id: f.id } : {}), label: f.label.trim(), type: f.type, required: f.required, owner: f.owner };
  if (isChoiceType(f.type)) input.options = f.options.filter((o) => o.label.trim()).map((o) => ({ value: o.value ?? "", label: o.label.trim() }));
  if (isNumberType(f.type)) input.unit = f.noUnit ? "" : f.unit.trim();
  if (f.help.trim()) input.help = f.help.trim();
  return input;
}
