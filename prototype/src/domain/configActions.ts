// Configuration editor (spec §8): the business administrator maintains the rules and the questionnaire through
// versions, without IT. A configuration release is a PAIR: rule set RS-2026.N + questionnaire CIQ-2026 vM.
// - At most one draft pair exists; published pairs never change.
// - Only the side that changed gets a new number when the draft is published (Thomas, 14 Oct): a rules-only release
//   keeps the questionnaire version (RS-2026.3 + v2), a questionnaire-only release keeps the rule set (RS-2026.2 + v3).
//   The kept side is stored as an identical copy under the same version and never defines it (templatePairOf,
//   ruleSetPairOf); numbers stay monotonic per side.
// - New cases use the newest published pair (currentPair); running cases keep the pair they started with.
// - Every change is admin-only (capability config.manage) and is written to the configuration log (AppState.log).
// Actions are pure like actions.ts: (state, by, …, at) → new state, or the state unchanged plus a refusal toast.

import { BUILTIN_FIELDS, BUILTIN_SECTIONS, FIRST_TEMPLATE, builtinTemplateData, fieldData, isChoiceType, isNumberType, ownsTemplate, templateData } from "./catalog";
import { RS1, RS2, copyRule } from "./builtinRules";
import { conditionProblem, conditionQuestion, ruleSentence } from "./conditions";
import { logEvent, refuse, toast } from "./core";
import { check } from "./permissions";
import { alwaysOnSections, uncollectedEvidence, uncollectedText } from "./requestedDocs";
import { FIRST_RULE_SET, currentStoredPair, draftStoredPair, ownsRuleSet, ruleSetPairOf } from "./rules";
import { isClosed, nowIso, userName } from "./selectors";
import type { AppState, ConfigPair, ConfigState, Dept, FieldData, RuleData, SectionData, SectionKind, TemplateData, TemplateVersion } from "./types";

// ---------------------------------------------------------------------------------- versions and pairs

/** "v3" from "CIQ-2026 v3". */
export const shortTemplate = (templateVersion: string) => templateVersion.replace(/^CIQ-\d{4}\s+/, "");
/** "RS-2026.3 + v3". */
export const pairLabel = (ruleSetVersion: string, templateVersion: string) => `${ruleSetVersion} + ${shortTemplate(templateVersion)}`;

/** The first pair (built in, published 21 Sep 2026, never stored). */
export const FIRST_PAIR = { ruleSetVersion: FIRST_RULE_SET, templateVersion: FIRST_TEMPLATE, publishedAt: RS1.publishedAt, publishedBy: RS1.publishedBy, changeNote: "First digital CIQ 2026 template: 8 chapters and 12 annexes (Turkey REACH K6.3 / Annex 12 not yet included), with rule set RS-2026.1 from requirements document v2.0 §5.3–5.4." } as const;

export interface PairRef {
  ruleSetVersion: string;
  templateVersion: string;
}

/** The pair new cases use: the newest published one. */
export function currentPair(s: Pick<AppState, "config">): PairRef {
  const p = currentStoredPair(s.config);
  return p ? { ruleSetVersion: p.ruleSet.version, templateVersion: p.template.version } : { ruleSetVersion: FIRST_PAIR.ruleSetVersion, templateVersion: FIRST_PAIR.templateVersion };
}

/** The draft pair, if any. */
export const draftPair = (s: Pick<AppState, "config">): ConfigPair | undefined => draftStoredPair(s.config);

export type ConfigVersionStatus = "draft" | "current" | "superseded";

export const CONFIG_STATUS_LABEL: Record<ConfigVersionStatus, string> = {
  draft: "Draft",
  current: "Used for new cases",
  superseded: "Superseded, running cases keep it",
};

/** What a release brings: the first built-in pair, new rules only, a new questionnaire only, or both. A draft with no
 *  change yet is "none". */
export type ReleaseKind = "first" | "rules" | "questionnaire" | "both" | "none";

export const RELEASE_KIND_LABEL: Record<ReleaseKind, string> = {
  first: "First version",
  rules: "Rules only",
  questionnaire: "Questionnaire only",
  both: "Rules and questionnaire",
  none: "No changes yet",
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * What publishing the draft would release, live (spec §8.2, Thomas 14 Oct): only the side that changed gets a new
 * number. Rules changed, questionnaire unchanged → RS-2026.(N+1) with the questionnaire version kept; the other way
 * round → v(N+1) with the rule set kept; both → both new; nothing → nothing to publish.
 */
export interface PublishPlan {
  kind: Exclude<ReleaseKind, "first">;
  /** The published pair the draft was copied from. */
  base: PairRef;
  /** The pair publishing gives: the base's version on the side that did not change. Equals `base` for "none". */
  result: PairRef;
  rulesChanged: boolean;
  questionnaireChanged: boolean;
  ruleChanges: number;
  questionnaireChanges: number;
  /** "RS-2026.3 + v2" (the result; for "none" the base). */
  label: string;
  /** "Rules RS-2026.3 (3 changes) · questionnaire stays v2". */
  text: string;
  kindLabel: string;
}

/** The plan for the open draft (undefined without a draft). */
export function publishPlan(s: Pick<AppState, "config" | "ownership">): PublishPlan | undefined {
  const d = draftPair(s);
  const ch = draftChanges(s);
  if (!d || !ch) return undefined;
  const ruleChanges = ch.rules.added.length + ch.rules.changed.length + ch.rules.removed.length;
  const questionnaireChanges = ch.count - ruleChanges;
  const rulesChanged = ruleChanges > 0;
  const questionnaireChanged = questionnaireChanges > 0;
  const kind: PublishPlan["kind"] = rulesChanged && questionnaireChanged ? "both" : rulesChanged ? "rules" : questionnaireChanged ? "questionnaire" : "none";
  const base = { ruleSetVersion: d.basedOn.ruleSetVersion, templateVersion: d.basedOn.templateVersion };
  const result = { ruleSetVersion: rulesChanged ? d.ruleSet.version : base.ruleSetVersion, templateVersion: questionnaireChanged ? d.template.version : base.templateVersion };
  const rules = `Rules ${result.ruleSetVersion} (${plural(ruleChanges, "change")})`;
  const tpl = `questionnaire ${shortTemplate(result.templateVersion)} (${plural(questionnaireChanges, "change")})`;
  const text =
    kind === "both"
      ? `${rules} · ${tpl}`
      : kind === "rules"
        ? `${rules} · questionnaire stays ${shortTemplate(base.templateVersion)}`
        : kind === "questionnaire"
          ? `Questionnaire ${shortTemplate(result.templateVersion)} (${plural(questionnaireChanges, "change")}) · rules stay ${base.ruleSetVersion}`
          : `Nothing to publish yet: the draft is the same as ${pairLabel(base.ruleSetVersion, base.templateVersion)}`;
  return { kind, base, result, rulesChanged, questionnaireChanged, ruleChanges, questionnaireChanges, label: pairLabel(result.ruleSetVersion, result.templateVersion), text, kindLabel: RELEASE_KIND_LABEL[kind] };
}

/** One side of the open draft as the screens name it (see draftSideNames). */
export interface DraftSideName {
  /** The working number the draft is stored under (RS-2026.4, CIQ-2026 v3): the key screens select it by. */
  working: string;
  /** The number publishing gives: the working number when this side changed, otherwise the version it keeps. */
  shown: string;
  changed: boolean;
}

/**
 * The names the screens give the open draft's rule set and questionnaire: the numbers publishing would give (the
 * publish plan's result). A side the draft does not change keeps its published version, so a questionnaire-only draft
 * names its rules RS-2026.3, not an RS-2026.4 that publishing never creates. Undefined without a draft.
 */
export function draftSideNames(s: Pick<AppState, "config" | "ownership">): { ruleSet: DraftSideName; template: DraftSideName } | undefined {
  const d = draftPair(s);
  const plan = publishPlan(s);
  if (!d || !plan) return undefined;
  return {
    ruleSet: { working: d.ruleSet.version, shown: plan.result.ruleSetVersion, changed: plan.rulesChanged },
    template: { working: d.template.version, shown: plan.result.templateVersion, changed: plan.questionnaireChanged },
  };
}

/** One row of the version history (spec §8.3): one release (pair) with its version, date, who, change note, cases. */
export interface ConfigVersion extends PairRef {
  /** Unique per row, stable while the draft is edited: the rule set version a release brings (RS-2026.3), the
   *  questionnaire version for a questionnaire-only release (v3), the draft's own rule set number for the draft. The
   *  screens select a row by it; Rules hooks `config-history-row-<key>` and `ruleset-card-<key>` on it. */
  key: string;
  /** The same, preferring the questionnaire version (v3; RS-2026.3 for a rules-only release): `template-card-<…>`. */
  templateKey: string;
  /** "RS-2026.2 + v2"; for the draft what publishing would give ("RS-2026.3 + v2"), or "New draft" before any change. */
  label: string;
  kind: ReleaseKind;
  /** "Rules only", "Questionnaire only", "Rules and questionnaire", "First version", "No changes yet". */
  kindLabel: string;
  /** The rule set and the questionnaire this release brings (true) or keeps from the one before (false). */
  newRuleSet: boolean;
  newTemplate: boolean;
  status: ConfigVersionStatus;
  statusLabel: string;
  /** Published: when and by whom; a draft: when it was created and by whom. */
  date?: string;
  by?: string;
  byName?: string;
  changeNote: string;
  /** What the administrator wrote when creating the draft. */
  note?: string;
  /** Cases started on this pair (every phase), and how many of them are still running. */
  casesUsing: number;
  runningCases: number;
  builtIn: boolean;
}

/** The version history, newest first (the draft on top). A row's `ruleSetVersion` and `templateVersion` are the data
 *  it shows (the draft's own working numbers for the draft). */
export function configVersions(s: AppState): ConfigVersion[] {
  const current = currentStoredPair(s.config);
  const plan = publishPlan(s);
  const rows: Omit<ConfigVersion, "casesUsing" | "runningCases">[] = [
    {
      key: FIRST_PAIR.ruleSetVersion,
      templateKey: shortTemplate(FIRST_PAIR.templateVersion),
      ruleSetVersion: FIRST_PAIR.ruleSetVersion,
      templateVersion: FIRST_PAIR.templateVersion,
      label: pairLabel(FIRST_PAIR.ruleSetVersion, FIRST_PAIR.templateVersion),
      kind: "first",
      kindLabel: RELEASE_KIND_LABEL.first,
      newRuleSet: true,
      newTemplate: true,
      status: current ? "superseded" : "current",
      statusLabel: CONFIG_STATUS_LABEL[current ? "superseded" : "current"],
      date: FIRST_PAIR.publishedAt,
      by: FIRST_PAIR.publishedBy,
      byName: userName(s, FIRST_PAIR.publishedBy),
      changeNote: FIRST_PAIR.changeNote,
      builtIn: true,
    },
  ];
  for (const p of s.config.pairs) {
    const draft = p.status === "draft";
    const newRuleSet = draft ? (plan?.rulesChanged ?? false) : ownsRuleSet(s.config, p);
    const newTemplate = draft ? (plan?.questionnaireChanged ?? false) : ownsTemplate(s.config, p);
    const kind: ReleaseKind = draft ? (plan?.kind ?? "none") : newRuleSet && newTemplate ? "both" : newRuleSet ? "rules" : "questionnaire";
    const status: ConfigVersionStatus = draft ? "draft" : p === current ? "current" : "superseded";
    const short = shortTemplate(p.template.version);
    const by = draft ? p.createdBy : p.publishedBy;
    rows.push({
      key: draft || newRuleSet ? p.ruleSet.version : short,
      templateKey: draft || newTemplate ? short : p.ruleSet.version,
      ruleSetVersion: p.ruleSet.version,
      templateVersion: p.template.version,
      label: draft ? (plan && plan.kind !== "none" ? plan.label : "New draft") : pairLabel(p.ruleSet.version, p.template.version),
      kind,
      kindLabel: RELEASE_KIND_LABEL[kind],
      newRuleSet,
      newTemplate,
      status,
      statusLabel: CONFIG_STATUS_LABEL[status],
      date: draft ? p.createdAt : p.publishedAt,
      by,
      byName: by ? userName(s, by) : undefined,
      changeNote: p.changeNote,
      note: p.note || undefined,
      builtIn: false,
    });
  }
  // Each case counts once: on the release with its rule set and questionnaire (older saved cases without an exact
  // match: on the newest release with their rule set).
  const published = rows.filter((r) => r.status !== "draft");
  const rowOf = (c: AppState["cases"][number]) => published.find((r) => r.ruleSetVersion === c.ruleSetVersion && r.templateVersion === c.templateVersion) ?? [...published].reverse().find((r) => r.ruleSetVersion === c.ruleSetVersion);
  const counts = new Map<string, { all: number; running: number }>();
  for (const c of s.cases) {
    const r = rowOf(c);
    if (!r) continue;
    const n = counts.get(r.key) ?? { all: 0, running: 0 };
    n.all += 1;
    if (!isClosed(c)) n.running += 1;
    counts.set(r.key, n);
  }
  return rows.map((r) => ({ ...r, casesUsing: r.status === "draft" ? 0 : (counts.get(r.key)?.all ?? 0), runningCases: r.status === "draft" ? 0 : (counts.get(r.key)?.running ?? 0) })).reverse();
}

/** The questionnaire versions as the earlier list (AppState.templates), derived from the config: each version once (a
 *  rules-only release adds none). */
export function templateList(cfg: ConfigState): TemplateVersion[] {
  const first: TemplateVersion = { version: FIRST_TEMPLATE, status: "published", publishedAt: FIRST_PAIR.publishedAt, changeNote: "First digital CIQ 2026 template: 8 chapters and 12 annexes (Turkey REACH K6.3 / Annex 12 not yet included).", sections: [], casesUsing: 0 };
  return [
    first,
    ...cfg.pairs
      .filter((p) => ownsTemplate(cfg, p))
      .map<TemplateVersion>((p) => ({
        version: p.template.version,
        status: p.status === "draft" ? "draft" : "published",
        ...(p.publishedAt ? { publishedAt: p.publishedAt, publishedBy: p.publishedBy } : {}),
        changeNote: p.changeNote,
        sections: [],
        casesUsing: 0,
      })),
  ];
}

const versionNo = (version: string) => Number(/(\d+)$/.exec(version)?.[1] ?? 0);

/**
 * The working numbers of a new draft, per side: RS-2026.(highest rule set number + 1) and v(highest questionnaire
 * number + 1). Each side counts on its own, so a questionnaire change after a rules-only release is v3, not v4. Only
 * the side that changes keeps its number when the draft is published.
 */
export function nextVersionNumbers(cfg: ConfigState): PairRef {
  const rs = Math.max(versionNo(FIRST_RULE_SET), ...cfg.pairs.map((p) => versionNo(p.ruleSet.version)));
  const tpl = Math.max(versionNo(FIRST_TEMPLATE), ...cfg.pairs.map((p) => versionNo(p.template.version)));
  return { ruleSetVersion: `RS-2026.${rs + 1}`, templateVersion: `CIQ-2026 v${tpl + 1}` };
}

/** The rules of a rule set version as data (the built-in first one included). */
function ruleDataOf(cfg: ConfigState, ruleSetVersion: string): readonly RuleData[] {
  return ruleSetPairOf(cfg, ruleSetVersion)?.ruleSet.rules ?? (ruleSetVersion === RS2.version ? RS2.rules : RS1.rules);
}

/** The questionnaire of a pair as data (the built-in first version included). */
const templateOf = (cfg: ConfigState, templateVersion: string): TemplateData => templateData(templateVersion, cfg) ?? builtinTemplateData(templateVersion);

const copyTemplate = (t: TemplateData, version: string, ownership: AppState["ownership"]): TemplateData => ({
  version,
  sections: (JSON.parse(JSON.stringify(t.sections)) as SectionData[]).map((x) => (ownership[x.id] ? { ...x, lead: ownership[x.id].lead, co: [...ownership[x.id].co] } : x)),
});

/**
 * The prepared second pair of the empty start, as the editable draft: RS-2026.2 (RS-2026.1 plus R-111 for the Turkey
 * market) and questionnaire v2 (v1 plus K6.3 Turkey REACH with its registration number and confirmation, and Annex 12).
 */
export function preparedDraft(ownership: AppState["ownership"]): ConfigPair {
  const template = builtinTemplateData(RS2.templateVersion, ownership);
  template.sections = template.sections.map((x) =>
    x.id === "K6.3"
      ? {
          ...x,
          documentsOnly: false,
          fields: [
            { id: "FLD-6.3-001", label: "KKDIK registration number", type: "text", required: "mandatory", owner: "REG", help: "As shown on the KKDIK registration confirmation." },
            { id: "FLD-6.3-002", label: "KKDIK registration confirmation", type: "file", required: "mandatory", owner: "REG", help: "PDF of the confirmation issued for the Turkish market." },
          ],
        }
      : x,
  );
  return {
    ruleSet: { version: RS2.version, rules: RS2.rules.map(copyRule) },
    template,
    status: "draft",
    basedOn: { ruleSetVersion: FIRST_PAIR.ruleSetVersion, templateVersion: FIRST_PAIR.templateVersion },
    note: "Turkey REACH (KKDIK) for the Turkey market.",
    createdAt: "2026-10-01T09:00:00.000Z",
    createdBy: "u-admin",
    changeNote: "Adds Turkey REACH (KKDIK): chapter K6.3 and Annex 12, with a mandatory registration-number field and upload, and rule R-111 for the Turkey market.",
  };
}

/** The empty start's configuration: the prepared v2 pair as the draft. */
export const initialConfig = (ownership: AppState["ownership"]): ConfigState => ({ pairs: [preparedDraft(ownership)] });

// ---------------------------------------------------------------------------------- change summary

export interface FieldChange {
  sectionId: string;
  fieldId: string;
  label: string;
}

/** What the draft changes against the pair it was copied from (spec §8.3 "Changes in draft"). */
export interface DraftChanges {
  base: PairRef;
  rules: { added: string[]; changed: string[]; removed: string[] };
  /** Sections: added (new ids, their fields included), changed (their own settings, owners or question order),
   *  retired, and restored (retired before, back now). */
  sections: { added: string[]; changed: string[]; retired: string[]; restored: string[] };
  /** Questions of sections that exist in both versions. */
  fields: { added: FieldChange[]; changed: FieldChange[]; removed: FieldChange[] };
  /** The number shown in the draft bar ("3 changes"). */
  count: number;
}

/** A rule in a fixed key order, so equal rules compare equal whatever order their keys were written in. Answers,
 *  sections and departments are sorted (ticking a chip off and on again is no change), as in Test rules (config.ts). */
const ruleKey = (r: RuleData) => {
  const c = r.condition;
  return JSON.stringify([c.kind, "question" in c ? c.question : "", "values" in c ? [...c.values].sort() : "value" in c ? c.value : "", [...r.activates].sort(), r.outcome, r.evidence ?? [], [...r.departments].sort(), r.basis, r.note ?? "", !!r.flagsCase]);
};
const sectionKey = (x: SectionData) => JSON.stringify({ code: x.code, title: x.title, kind: x.kind, meaning: x.meaning, documentsOnly: x.documentsOnly });
const ownersKey = (lead: Dept, co: Dept[]) => `${lead}|${[...co].sort().join(",")}`;

const changesMemo = new WeakMap<ConfigState, { ownership: AppState["ownership"]; result: DraftChanges | undefined }>();

/** The draft's changes, or undefined without a draft. Owners count as changed when they differ from the owners in force
 *  (the Section owners setting). Memoised per config and ownership (the marks call it per row). */
export function draftChanges(s: Pick<AppState, "config" | "ownership">): DraftChanges | undefined {
  const hit = changesMemo.get(s.config);
  if (hit && hit.ownership === s.ownership) return hit.result;
  const result = computeChanges(s);
  changesMemo.set(s.config, { ownership: s.ownership, result });
  return result;
}

function computeChanges(s: Pick<AppState, "config" | "ownership">): DraftChanges | undefined {
  const d = draftPair(s);
  if (!d) return undefined;
  const baseRules = ruleDataOf(s.config, d.basedOn.ruleSetVersion);
  const baseTpl = templateOf(s.config, d.basedOn.templateVersion);
  const br = new Map(baseRules.map((r) => [r.id, r]));
  const dr = new Map(d.ruleSet.rules.map((r) => [r.id, r]));
  const rules = {
    added: d.ruleSet.rules.filter((r) => !br.has(r.id)).map((r) => r.id),
    changed: d.ruleSet.rules.filter((r) => br.has(r.id) && ruleKey(br.get(r.id)!) !== ruleKey(r)).map((r) => r.id),
    removed: baseRules.filter((r) => !dr.has(r.id)).map((r) => r.id),
  };
  const bs = new Map(baseTpl.sections.map((x) => [x.id, x]));
  const sections: DraftChanges["sections"] = { added: [], changed: [], retired: [], restored: [] };
  const fields: DraftChanges["fields"] = { added: [], changed: [], removed: [] };
  for (const x of d.template.sections) {
    const b = bs.get(x.id);
    if (!b) {
      sections.added.push(x.id);
      continue;
    }
    if (x.retired && !b.retired) sections.retired.push(x.id);
    else if (!x.retired && b.retired) sections.restored.push(x.id);
    const owners = s.ownership[x.id] ?? { lead: b.lead, co: b.co };
    const bf = new Map(b.fields.map((f) => [f.id, f]));
    const xf = new Map(x.fields.map((f) => [f.id, f]));
    const common = (list: FieldData[], other: Map<string, FieldData>) => list.filter((f) => other.has(f.id)).map((f) => f.id).join();
    const reordered = common(x.fields, bf) !== common(b.fields, xf);
    if (sectionKey(x) !== sectionKey(b) || ownersKey(x.lead, x.co) !== ownersKey(owners.lead, owners.co) || reordered) sections.changed.push(x.id);
    for (const f of x.fields) {
      const o = bf.get(f.id);
      if (!o) fields.added.push({ sectionId: x.id, fieldId: f.id, label: f.label });
      else if (JSON.stringify(o) !== JSON.stringify(f)) fields.changed.push({ sectionId: x.id, fieldId: f.id, label: f.label });
    }
    for (const f of b.fields) if (!xf.has(f.id)) fields.removed.push({ sectionId: x.id, fieldId: f.id, label: f.label });
  }
  const count =
    rules.added.length + rules.changed.length + rules.removed.length + sections.added.length + sections.changed.length + sections.retired.length + sections.restored.length + fields.added.length + fields.changed.length + fields.removed.length;
  return { base: d.basedOn, rules, sections, fields, count };
}

/** "New in draft" / "Changed in draft" marks for the rule list. */
export function ruleMark(s: AppState, ruleId: string): "new" | "changed" | undefined {
  const ch = draftChanges(s);
  return ch?.rules.added.includes(ruleId) ? "new" : ch?.rules.changed.includes(ruleId) ? "changed" : undefined;
}

/** Marks for the questionnaire catalogue. */
export function sectionMark(s: AppState, sectionId: string): "new" | "changed" | "retired" | undefined {
  const ch = draftChanges(s);
  if (!ch) return undefined;
  if (ch.sections.added.includes(sectionId)) return "new";
  if (ch.sections.retired.includes(sectionId)) return "retired";
  if (ch.sections.changed.includes(sectionId) || ch.sections.restored.includes(sectionId) || [...ch.fields.added, ...ch.fields.changed, ...ch.fields.removed].some((f) => f.sectionId === sectionId)) return "changed";
  return undefined;
}

/** Marks for the field list of a section. */
export function fieldMark(s: AppState, sectionId: string, fieldId: string): "new" | "changed" | undefined {
  const ch = draftChanges(s);
  if (!ch) return undefined;
  if (ch.sections.added.includes(sectionId) || ch.fields.added.some((f) => f.fieldId === fieldId)) return "new";
  return ch.fields.changed.some((f) => f.fieldId === fieldId) ? "changed" : undefined;
}

/** Short summary of the changes for the log and the publish toast: "1 rule added; 2 sections added". */
export function changesText(ch: DraftChanges | undefined): string {
  if (!ch || !ch.count) return "No changes";
  const part = (n: number, one: string, verb: string) => (n ? `${n} ${one}${n === 1 ? "" : "s"} ${verb}` : "");
  return [
    part(ch.rules.added.length, "rule", "added"),
    part(ch.rules.changed.length, "rule", "changed"),
    part(ch.rules.removed.length, "rule", "removed"),
    part(ch.sections.added.length, "section", "added"),
    part(ch.sections.changed.length + ch.sections.restored.length, "section", "changed"),
    part(ch.sections.retired.length, "section", "retired"),
    part(ch.fields.added.length, "question", "added"),
    part(ch.fields.changed.length, "question", "changed"),
    part(ch.fields.removed.length, "question", "removed"),
  ]
    .filter(Boolean)
    .join("; ");
}

// ---------------------------------------------------------------------------------- validation (spec §8.2)

export type ValidationCheckId = "has-changes" | "rules-switch-on" | "sections-have-rule" | "no-empty-labels" | "choice-options" | "number-units" | "codes-unique" | "sections-have-questions";

/** One finding, with what it points at (the screens link to the rule, section or field to fix it). */
export interface ValidationIssue {
  text: string;
  ruleId?: string;
  sectionId?: string;
  fieldId?: string;
}

export interface ValidationCheck {
  id: ValidationCheckId;
  label: string;
  ok: boolean;
  issues: ValidationIssue[];
}

export interface DraftValidation {
  /** True when every check passes: publishing is allowed. */
  ok: boolean;
  checks: ValidationCheck[];
  /** Worth a look, never blocking: rules that point at retired or unknown sections. */
  warnings: ValidationIssue[];
  /** Good to know, nothing to fix: evidence no question collects gets an upload slot under "Requested documents". */
  infos: ValidationIssue[];
}

export const VALIDATION_LABEL: Record<ValidationCheckId, string> = {
  "has-changes": "The draft changes the rules or the questionnaire",
  "rules-switch-on": "Every rule switches on at least one section or asks for evidence",
  "sections-have-rule": "Every section is switched on by a rule",
  "no-empty-labels": "Every section has a code and a title, every question and option a label",
  "choice-options": "Every choice question has at least 2 options",
  "number-units": "Every number question has a unit or says “no unit”",
  "codes-unique": "Section codes are unique",
  "sections-have-questions": "Every section that is not “Documents only” has at least one question",
};

const secName = (x: Pick<SectionData, "code" | "title">) => [x.code.trim(), x.title.trim()].filter(Boolean).join(" ") || "A section without code";

const validationMemo = new WeakMap<ConfigState, { ownership: AppState["ownership"]; result: DraftValidation | undefined }>();

/** The §8.2 checklist for the draft (undefined without a draft). Publishing is blocked while a check fails. Pure;
 *  memoised per config and ownership (the change count compares owners with the Section owners setting). */
export function validateDraft(s: Pick<AppState, "config" | "ownership">): DraftValidation | undefined {
  const hit = validationMemo.get(s.config);
  if (hit && hit.ownership === s.ownership) return hit.result;
  const result = computeValidation(s);
  validationMemo.set(s.config, { ownership: s.ownership, result });
  return result;
}

function computeValidation(s: Pick<AppState, "config" | "ownership">): DraftValidation | undefined {
  const d = draftPair(s);
  if (!d) return undefined;
  const baseIds = new Set(templateOf(s.config, d.basedOn.templateVersion).sections.map((x) => x.id));
  const live = d.template.sections.filter((x) => !x.retired);
  const liveIds = new Set(live.map((x) => x.id));
  const byId = new Map(d.template.sections.map((x) => [x.id, x]));
  const issues: Record<ValidationCheckId, ValidationIssue[]> = { "has-changes": [], "rules-switch-on": [], "sections-have-rule": [], "no-empty-labels": [], "choice-options": [], "number-units": [], "codes-unique": [], "sections-have-questions": [] };
  const warnings: ValidationIssue[] = [];
  const infos: ValidationIssue[] = [];
  const codeOf = (id: string) => byId.get(id)?.code ?? id;

  // Nothing changed: there is nothing to publish (only the side that changed gets a new number, so neither would).
  if (publishPlan(s)?.kind === "none") issues["has-changes"].push({ text: `Nothing to publish: the draft is the same as ${pairLabel(d.basedOn.ruleSetVersion, d.basedOn.templateVersion)}. Change a rule or the questionnaire, or discard the draft.` });

  const alwaysOn = alwaysOnSections(d.ruleSet.rules);
  for (const r of d.ruleSet.rules) {
    const valid = r.activates.filter((id) => liveIds.has(id));
    const evidence = (r.evidence ?? []).filter((e) => e.trim());
    if (!valid.length && !evidence.length && !r.flagsCase) {
      issues["rules-switch-on"].push({ ruleId: r.id, text: r.activates.length ? `${r.id} only points at sections this version does not offer (${r.activates.map(codeOf).join(", ")}).` : `${r.id} switches on no section and asks for no evidence.` });
    }
    for (const id of r.activates.filter((x) => !liveIds.has(x))) {
      const sec = byId.get(id);
      warnings.push({ ruleId: r.id, sectionId: id, text: sec ? `${r.id} still points at ${secName(sec)}, which is retired in this version: it no longer opens for new cases.` : `${r.id} points at ${id}, which is not in this version.` });
    }
    // Evidence no question collects is handled, not a problem: the supplier gets an upload slot (requestedDocs.ts).
    for (const u of uncollectedEvidence(evidence, r.activates, d.template, { outcome: r.outcome, alwaysOn })) infos.push({ ruleId: r.id, sectionId: u.sectionId, text: `${r.id}: ${uncollectedText(u)}` });
  }

  for (const x of live) {
    const isNew = !baseIds.has(x.id);
    // Every live section, built-in "always" ones included: rules are data now, so deleting R-00, R-01 or R-02 (or taking a
    // section out of one) would otherwise quietly make the section "Not applicable" for every new case.
    if (!d.ruleSet.rules.some((r) => r.outcome !== "na" && r.activates.includes(x.id))) {
      issues["sections-have-rule"].push({ sectionId: x.id, text: `${secName(x)} is not switched on by any rule${isNew ? ": a new section needs a rule that switches it on" : ": no new case would get it. Add a rule, or retire the section"}.` });
    }
    if (!x.code.trim()) issues["no-empty-labels"].push({ sectionId: x.id, text: `Section ${x.id} has no code.` });
    if (!x.title.trim()) issues["no-empty-labels"].push({ sectionId: x.id, text: `${x.code.trim() || x.id} has no title.` });
    if (!x.documentsOnly && !x.fields.length) issues["sections-have-questions"].push({ sectionId: x.id, text: `${secName(x)} has no question. Add one, or set it to “Documents only”.` });
    if (x.documentsOnly) continue;
    x.fields.forEach((f, i) => {
      const where = { sectionId: x.id, fieldId: f.id };
      const name = f.label.trim() ? `“${f.label.trim()}”` : `Question ${i + 1}`;
      if (!f.label.trim()) issues["no-empty-labels"].push({ ...where, text: `Question ${i + 1} of ${secName(x)} has no label.` });
      if (isChoiceType(f.type)) {
        const opts = f.options ?? [];
        if (opts.length < 2) issues["choice-options"].push({ ...where, text: `${name} in ${secName(x)} has ${opts.length === 0 ? "no option" : "only 1 option"}.` });
        if (opts.some((o) => !o.label.trim())) issues["no-empty-labels"].push({ ...where, text: `${name} in ${secName(x)} has an option without a label.` });
      }
      if (isNumberType(f.type) && f.unit === undefined) issues["number-units"].push({ ...where, text: `${name} in ${secName(x)} needs a unit, or “no unit”.` });
    });
  }

  // The same comparison as the section form and upsertSection: "Annex 4" = "A4" = "annex4", "K6.1" = "k6.1".
  const seen = new Map<string, string>();
  for (const x of d.template.sections) {
    const k = sectionCodeKey(x.code);
    if (!k) continue;
    if (seen.has(k)) issues["codes-unique"].push({ sectionId: x.id, text: `${x.code.trim()} is used by ${seen.get(k)} and ${x.id}.` });
    else seen.set(k, x.id);
  }

  const checks = (Object.keys(VALIDATION_LABEL) as ValidationCheckId[]).map((id) => ({ id, label: VALIDATION_LABEL[id], ok: issues[id].length === 0, issues: issues[id] }));
  return { ok: checks.every((c) => c.ok), checks, warnings, infos };
}

/** Rules of the draft that point at a section (retiring it flags them). */
export function rulesPointingAt(s: AppState, sectionId: string): string[] {
  return (draftPair(s)?.ruleSet.rules ?? []).filter((r) => r.activates.includes(sectionId)).map((r) => r.id);
}

// ---------------------------------------------------------------------------------- draft lifecycle

const guard = (s: AppState, by: string): string | null => check(s, by, "config.manage");

/** Replaces the draft pair (the only pair that ever changes). */
function withDraft(s: AppState, fn: (d: ConfigPair) => ConfigPair): AppState {
  const config: ConfigState = { pairs: s.config.pairs.map((p) => (p.status === "draft" ? fn(p) : p)) };
  return { ...s, config, templates: templateList(config) };
}

const noDraft = (s: AppState) => refuse(s, "There is no draft. Create a new version first.");
/** The draft in log lines: "Draft from RS-2026.2 + v2" (its numbers are only settled when it is published). */
const draftTag = (d: ConfigPair) => `Draft from ${pairLabel(d.basedOn.ruleSetVersion, d.basedOn.templateVersion)}`;
/** The draft in messages: what publishing it would give ("RS-2026.3 + v2"), or "(no changes yet)". */
const draftName = (s: AppState) => {
  const plan = publishPlan(s);
  return plan && plan.kind !== "none" ? plan.label : "(no changes yet)";
};

/**
 * Copies the newest published pair into a draft, with working numbers per side (RS-2026.(N+1), v(M+1)); only the
 * side that changes keeps its new number when published. Refused while a draft exists. Section owners are copied
 * from the Section owners setting.
 */
export function createDraft(s: AppState, by: string, note: string, at = nowIso()): AppState {
  const denied = guard(s, by);
  if (denied) return refuse(s, denied);
  if (draftPair(s)) return refuse(s, `The draft ${draftName(s)} is still open. Publish or discard it first.`);
  const base = currentPair(s);
  const next = nextVersionNumbers(s.config);
  const pair: ConfigPair = {
    ruleSet: { version: next.ruleSetVersion, rules: ruleDataOf(s.config, base.ruleSetVersion).map(copyRule) },
    template: copyTemplate(templateOf(s.config, base.templateVersion), next.templateVersion, s.ownership),
    status: "draft",
    basedOn: base,
    note: note.trim(),
    createdAt: at,
    createdBy: by,
    changeNote: "",
  };
  const config: ConfigState = { pairs: [...s.config.pairs, pair] };
  const baseLabel = pairLabel(base.ruleSetVersion, base.templateVersion);
  let out: AppState = { ...s, config, templates: templateList(config) };
  out = logEvent(out, {
    at,
    by,
    kind: "config",
    action: "Created draft",
    detail: `Draft copied from ${baseLabel}. When it is published, only what changed gets a new number: rules ${next.ruleSetVersion}, questionnaire ${shortTemplate(next.templateVersion)}.${note.trim() ? ` Note: ${note.trim()}` : ""}`,
  });
  return toast(out, "success", `New draft created from ${baseLabel}. Change the rules or the questionnaire, then check and publish.`);
}

/** Drops the draft pair; nothing else changes (no case can use a draft). */
export function discardDraft(s: AppState, by: string, at = nowIso()): AppState {
  const denied = guard(s, by);
  if (denied) return refuse(s, denied);
  const d = draftPair(s);
  if (!d) return noDraft(s);
  const config: ConfigState = { pairs: s.config.pairs.filter((p) => p !== d) };
  let out: AppState = { ...s, config, templates: templateList(config) };
  out = logEvent(out, { at, by, kind: "config", action: "Discarded draft", detail: `${draftTag(d)} discarded (${changesText(draftChanges(s))}).` });
  return toast(out, "info", `Draft ${draftName(s)} discarded.`);
}

// ---------------------------------------------------------------------------------- rules

/** A rule as the form sends it: no id for a new rule. `question` follows the condition. */
export type RuleInput = Omit<RuleData, "id" | "question"> & { id?: string; question?: RuleData["question"] };

/** "R-122": the next number after every rule id used so far (deleted ids are not reused). */
export function nextRuleId(s: AppState): string {
  const ids = [...RS2.rules, ...s.config.pairs.flatMap((p) => p.ruleSet.rules)].map((r) => Number(/^R-(\d+)$/.exec(r.id)?.[1] ?? -1));
  return `R-${String(Math.max(-1, ...ids) + 1).padStart(2, "0")}`;
}

const cleanList = (xs: string[] | undefined) => [...new Set((xs ?? []).map((x) => x.trim()).filter(Boolean))];

/** Adds or changes a rule in the draft. Returns the rule id ("" when refused). */
export function upsertRule(s: AppState, by: string, input: RuleInput, at = nowIso()): { state: AppState; id: string } {
  const denied = guard(s, by);
  if (denied) return { state: refuse(s, denied), id: "" };
  const d = draftPair(s);
  if (!d) return { state: noDraft(s), id: "" };
  const problem = conditionProblem(input.condition);
  if (problem) return { state: refuse(s, problem), id: "" };
  const known = new Set(d.template.sections.map((x) => x.id));
  const unknown = input.activates.filter((id) => !known.has(id));
  if (unknown.length) return { state: refuse(s, `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in questionnaire ${shortTemplate(d.template.version)}.`), id: "" };
  const departments = [...new Set(input.departments)];
  if (!departments.length) return { state: refuse(s, "Choose at least one department that reviews it."), id: "" };
  const existing = input.id ? d.ruleSet.rules.find((r) => r.id === input.id) : undefined;
  if (input.id && !existing) return { state: refuse(s, `${input.id} is not in the draft.`), id: "" };
  const id = existing?.id ?? nextRuleId(s);
  const evidence = cleanList(input.evidence);
  const rule: RuleData = {
    id,
    question: conditionQuestion(input.condition),
    condition: JSON.parse(JSON.stringify(input.condition)) as RuleData["condition"],
    activates: [...new Set(input.activates)],
    outcome: input.outcome,
    ...(evidence.length ? { evidence } : {}),
    departments,
    basis: input.basis,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.flagsCase ? { flagsCase: true } : {}),
  };
  if (existing && ruleKey(existing) === ruleKey(rule)) return { state: s, id };
  let out = withDraft(s, (p) => ({ ...p, ruleSet: { ...p.ruleSet, rules: existing ? p.ruleSet.rules.map((r) => (r.id === id ? rule : r)) : [...p.ruleSet.rules, rule] } }));
  const codeOf = (x: string) => d.template.sections.find((y) => y.id === x)?.code ?? x;
  out = logEvent(out, { at, by, kind: "config", action: existing ? `Changed rule ${id}` : `Added rule ${id}`, detail: `${draftTag(d)}: ${ruleSentence(rule, codeOf)}` });
  return { state: out, id };
}

/** Removes a rule from the draft (the published sets keep it). */
export function deleteRule(s: AppState, by: string, ruleId: string, at = nowIso()): AppState {
  const denied = guard(s, by);
  if (denied) return refuse(s, denied);
  const d = draftPair(s);
  if (!d) return noDraft(s);
  if (!d.ruleSet.rules.some((r) => r.id === ruleId)) return refuse(s, `${ruleId} is not in the draft.`);
  const out = withDraft(s, (p) => ({ ...p, ruleSet: { ...p.ruleSet, rules: p.ruleSet.rules.filter((r) => r.id !== ruleId) } }));
  return toast(logEvent(out, { at, by, kind: "config", action: `Deleted rule ${ruleId}`, detail: `${draftTag(d)}: ${ruleId} removed from the draft. The published rule sets keep it.` }), "info", `${ruleId} removed from the draft.`);
}

// ---------------------------------------------------------------------------------- sections

/** A section as the form sends it: no id for a new section (it comes from the code). Fields are edited separately. */
export interface SectionInput {
  id?: string;
  code: string;
  title: string;
  kind: SectionKind;
  meaning: string;
  lead: Dept;
  co: Dept[];
  documentsOnly: boolean;
}

/** A section code as it is stored and shown: trimmed, "k 6.20" → "K6.20", "annex  14", "A 14" and "a14" → "Annex 14",
 *  no trailing dot. Built-in codes ("General", "K6.16.1", "Annex 12") stay as they are. */
export function normalizeSectionCode(code: string): string {
  const c = code.trim().replace(/\s+/g, " ").replace(/\.+$/, "");
  const annex = /^(?:annex|a)\s*(\d.*)$/i.exec(c) ?? /^annex\s*(\S.*)$/i.exec(c);
  if (annex) return `Annex ${annex[1].replace(/\s+/g, "")}`;
  if (/^k\s*\d/i.test(c)) return `K${c.slice(1).replace(/\s+/g, "")}`;
  return c;
}

/**
 * The key two section codes (or ids) are compared by, everywhere (the section form while typing, upsertSection and
 * the "codes are unique" check): case, spaces, leading zeros and a trailing dot do not count, and "Annex" is "A". So
 * "Annex 4" = "A4" = "annex4" = "A 4", "K6.1" = "k6.1" = "K 6.01". "K6.1" and "K6.10" stay different.
 */
export function sectionCodeKey(code: string): string {
  return code
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^annex/, "a")
    .replace(/\d+/g, (n) => n.replace(/^0+(?=\d)/, ""))
    .replace(/\.+$/, "");
}

/** The id of a new section from its code: "K6.18" → "K6.18", "Annex 14" → "A14". Null when the code cannot be one. */
export function sectionIdFromCode(code: string): string | null {
  const c = code.trim();
  const annex = /^annex\s*(\d+[A-Za-z0-9.]*)$/i.exec(c);
  const id = annex ? `A${annex[1]}` : c.replace(/\s+/g, "");
  return /^[A-Za-z][A-Za-z0-9.\-]*$/.test(id) ? id : null;
}

/** A section that already uses a code: which one, the code (or id) as written there, and where it is. */
export interface SectionCodeUse {
  sectionId: string;
  code: string;
  title: string;
  /** "in this draft", "retired in this draft", "in published version v2", "retired in published version v3", "in the
   *  built-in catalogue". */
  where: string;
}

const codeUsesMemo = new WeakMap<ConfigState, Map<string, SectionCodeUse[]>>();

/** Every code and id of every section in every version (built-in, published, the draft; retired ones included), by
 *  key. Each key lists the draft's section first, then the published versions newest first, then the catalogue. */
function sectionCodeUses(cfg: ConfigState): Map<string, SectionCodeUse[]> {
  const hit = codeUsesMemo.get(cfg);
  if (hit) return hit;
  const uses = new Map<string, SectionCodeUse[]>();
  const add = (x: { id: string; code: string; title: string }, where: string) => {
    for (const label of [x.code, x.id]) {
      const k = sectionCodeKey(label);
      if (!k) continue;
      const list = uses.get(k) ?? [];
      if (!list.some((u) => u.sectionId === x.id)) list.push({ sectionId: x.id, code: label.trim(), title: x.title, where });
      uses.set(k, list);
    }
  };
  for (const x of draftStoredPair(cfg)?.template.sections ?? []) add(x, x.retired ? "retired in this draft" : "in this draft");
  const published = cfg.pairs
    .filter((p) => p.status === "published" && ownsTemplate(cfg, p))
    .map((p) => p.template)
    .reverse();
  for (const t of [...published, builtinTemplateData(FIRST_TEMPLATE)]) for (const x of t.sections) add(x, `${x.retired ? "retired in" : "in"} published version ${shortTemplate(t.version)}`);
  for (const x of BUILTIN_SECTIONS) add(x, "in the built-in catalogue");
  codeUsesMemo.set(cfg, uses);
  return uses;
}

/** The section that already uses `code` (compared by sectionCodeKey) in any version, other than `sectionId` itself. */
export function sectionCodeClash(cfg: ConfigState, code: string, sectionId?: string): SectionCodeUse | undefined {
  const k = sectionCodeKey(code);
  return k ? sectionCodeUses(cfg).get(k)?.find((u) => u.sectionId !== sectionId) : undefined;
}

/** "Annex 4 is already used by “Hydrocarbons (MOAH)” (in this draft). Choose another code." */
export const codeClashText = (u: SectionCodeUse) => `${u.code} is already used by “${u.title || u.sectionId}” (${u.where}). Choose another code.`;

/**
 * The one duplicate check for a section code: the code itself and, for a new section (no `sectionId`), the id it would
 * get must not match any section of any version (built-in, published, draft, retired included; the section being
 * edited is ignored). Returns the message, or undefined. The section form runs it while the administrator types.
 */
export function sectionCodeDuplicate(cfg: ConfigState, code: string, sectionId?: string): string | undefined {
  const c = normalizeSectionCode(code);
  if (!c) return undefined;
  const use = sectionCodeClash(cfg, c, sectionId);
  if (use) return codeClashText(use);
  if (sectionId) return undefined;
  const id = sectionIdFromCode(c);
  const idUse = id ? sectionCodeClash(cfg, id) : undefined;
  return idUse ? codeClashText(idUse) : undefined;
}

/** Why a section code cannot be saved (undefined: it can): empty, a duplicate (sectionCodeDuplicate), or, for a new
 *  section, not in the shape of a code. */
export function sectionCodeProblem(cfg: ConfigState, code: string, sectionId?: string): string | undefined {
  const c = normalizeSectionCode(code);
  if (!c) return "Enter the section code, e.g. K6.18 or Annex 14.";
  const dup = sectionCodeDuplicate(cfg, c, sectionId);
  if (dup) return dup;
  if (!sectionId && !sectionIdFromCode(c)) return "Use a code like K6.18 or Annex 14 (letters, digits and dots).";
  return undefined;
}

/** Natural order of codes: "K6.9" < "K6.10" < "K6.18" < "K7"; "Annex 2" < "Annex 13". */
function codeCompare(a: string, b: string): number {
  const pa = a.match(/\d+|\D+/g) ?? [];
  const pb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "") return nx - ny;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Where a new section goes: after the last section of its kind whose code sorts before it (chapters before annexes). */
function insertAt(sections: SectionData[], x: SectionData): number {
  const same = sections.map((y, i) => ({ y, i })).filter(({ y }) => y.kind === x.kind);
  const before = same.filter(({ y }) => codeCompare(y.code, x.code) < 0);
  if (before.length) return before.at(-1)!.i + 1;
  if (same.length) return same[0].i;
  if (x.kind === "annex") return sections.length;
  const firstAnnex = sections.findIndex((y) => y.kind === "annex");
  return firstAnnex < 0 ? sections.length : firstAnnex;
}

/** Adds or changes a section of the draft questionnaire. Returns the section id ("" when refused). */
export function upsertSection(s: AppState, by: string, input: SectionInput, at = nowIso()): { state: AppState; id: string } {
  const denied = guard(s, by);
  if (denied) return { state: refuse(s, denied), id: "" };
  const d = draftPair(s);
  if (!d) return { state: noDraft(s), id: "" };
  const code = normalizeSectionCode(input.code);
  const existing = input.id ? d.template.sections.find((x) => x.id === input.id) : undefined;
  if (input.id && !existing) return { state: refuse(s, `${input.id} is not in the draft questionnaire.`), id: "" };
  // The same check as the section form: no code (nor derived id) any version uses, written any way.
  const problem = sectionCodeProblem(s.config, code, existing?.id);
  if (problem) return { state: refuse(s, problem), id: "" };
  const id = existing?.id ?? sectionIdFromCode(code)!;
  if (existing && input.documentsOnly && !existing.documentsOnly && existing.fields.length) return { state: refuse(s, `${code} still has ${existing.fields.length === 1 ? "a question" : `${existing.fields.length} questions`}. Remove ${existing.fields.length === 1 ? "it" : "them"} first, or keep “Questions”.`), id: "" };
  if (id === "GEN" && input.documentsOnly) return { state: refuse(s, "General information holds the basic data and the metadata questions: it keeps its questions."), id: "" };
  const co = [...new Set(input.co)].filter((x) => x !== input.lead);
  const next: SectionData = {
    ...(existing ?? { fields: [] }),
    id,
    code,
    title: input.title.trim(),
    kind: input.kind,
    meaning: input.meaning.trim(),
    lead: input.lead,
    co,
    documentsOnly: input.documentsOnly,
  };
  if (existing && JSON.stringify(existing) === JSON.stringify(next)) return { state: s, id };
  let out = withDraft(s, (p) => {
    if (existing) return { ...p, template: { ...p.template, sections: p.template.sections.map((x) => (x.id === id ? next : x)) } };
    const sections = [...p.template.sections];
    sections.splice(insertAt(sections, next), 0, next);
    return { ...p, template: { ...p.template, sections } };
  });
  out = logEvent(out, { at, by, kind: "config", action: existing ? `Changed section ${code}` : `Added section ${code}`, detail: `${draftTag(d)}: ${code} · ${next.title || "(no title)"}, ${next.kind}, lead ${next.lead}${co.length ? `, co-reviewers ${co.join(", ")}` : ""}, ${next.documentsOnly ? "documents only" : "questions"}.${existing ? "" : " A new section needs a rule that switches it on."}` });
  return { state: out, id };
}

/** Retires a section in the draft: new cases on this version never get it; nothing is deleted. Rules that point at it
 *  are flagged (validateDraft warnings). */
export function retireSection(s: AppState, by: string, sectionId: string, at = nowIso()): AppState {
  return setRetired(s, by, sectionId, true, at);
}

/** Brings a retired section back in the draft. */
export function restoreSection(s: AppState, by: string, sectionId: string, at = nowIso()): AppState {
  return setRetired(s, by, sectionId, false, at);
}

function setRetired(s: AppState, by: string, sectionId: string, retired: boolean, at: string): AppState {
  const denied = guard(s, by);
  if (denied) return refuse(s, denied);
  const d = draftPair(s);
  if (!d) return noDraft(s);
  const sec = d.template.sections.find((x) => x.id === sectionId);
  if (!sec) return refuse(s, `${sectionId} is not in the draft questionnaire.`);
  if (sectionId === "GEN" && retired) return refuse(s, "General information holds the basic data and the metadata questions: it cannot be retired.");
  if (!!sec.retired === retired) return refuse(s, `${sec.code} is ${retired ? "already retired" : "not retired"}.`, "info");
  let out = withDraft(s, (p) => ({ ...p, template: { ...p.template, sections: p.template.sections.map((x) => (x.id === sectionId ? (retired ? { ...x, retired: true } : (({ retired: _r, ...y }) => (void _r, y))(x)) : x)) } }));
  const flagged = rulesPointingAt(s, sectionId);
  out = logEvent(out, { at, by, kind: "config", action: retired ? `Retired section ${sec.code}` : `Restored section ${sec.code}`, detail: `${draftTag(d)}: ${sec.code} · ${sec.title} ${retired ? "is hidden for new cases on this version; running cases keep it" : "is back for new cases on this version"}.${retired && flagged.length ? ` Rules that point at it: ${flagged.join(", ")}.` : ""}` });
  return toast(out, "info", retired ? `${sec.code} retired in the draft.${flagged.length ? ` ${flagged.join(", ")} still point${flagged.length === 1 ? "s" : ""} at it.` : ""}` : `${sec.code} is back in the draft.`);
}

// ---------------------------------------------------------------------------------- fields

/** A question as the form sends it: no id for a new one. `unit`: "" = no unit; left out = not chosen yet. */
export type FieldInput = Omit<FieldData, "id"> & { id?: string };

/** "FLD-K6.18-001": the next free number for the section, across every version. */
export function nextFieldId(s: AppState, sectionId: string): string {
  const used = new Set([...BUILTIN_FIELDS.map((f) => f.id), ...s.config.pairs.flatMap((p) => p.template.sections.flatMap((x) => x.fields.map((f) => f.id)))]);
  for (let n = 1; ; n++) {
    const id = `FLD-${sectionId}-${String(n).padStart(3, "0")}`;
    if (!used.has(id)) return id;
  }
}

function draftSection(s: AppState, by: string, sectionId: string): { error: AppState } | { d: ConfigPair; sec: SectionData } {
  const denied = guard(s, by);
  if (denied) return { error: refuse(s, denied) };
  const d = draftPair(s);
  if (!d) return { error: noDraft(s) };
  const sec = d.template.sections.find((x) => x.id === sectionId);
  if (!sec) return { error: refuse(s, `${sectionId} is not in the draft questionnaire.`) };
  if (sec.retired) return { error: refuse(s, `${sec.code} is retired in this version. Restore it to change its questions.`) };
  return { d, sec };
}

const withSection = (s: AppState, sectionId: string, fn: (x: SectionData) => SectionData) => withDraft(s, (p) => ({ ...p, template: { ...p.template, sections: p.template.sections.map((x) => (x.id === sectionId ? fn(x) : x)) } }));

/** Adds or changes a question of a draft section. Returns the field id ("" when refused). */
export function upsertField(s: AppState, by: string, sectionId: string, input: FieldInput, at = nowIso()): { state: AppState; id: string } {
  const r = draftSection(s, by, sectionId);
  if ("error" in r) return { state: r.error, id: "" };
  const { d, sec } = r;
  if (sec.documentsOnly) return { state: refuse(s, `${sec.code} holds documents only. Switch it to “Questions” first.`), id: "" };
  const existing = input.id ? sec.fields.find((f) => f.id === input.id) : undefined;
  if (input.id && !existing) return { state: refuse(s, `${input.id} is not a question of ${sec.code} in the draft.`), id: "" };
  const id = existing?.id ?? nextFieldId(s, sectionId);
  const options = isChoiceType(input.type) ? (input.options ?? []).map((o) => ({ value: (o.value ?? o.label).trim() || o.label.trim(), label: o.label.trim() })) : undefined;
  const values = (options ?? []).map((o) => o.value.toLowerCase()).filter(Boolean);
  if (new Set(values).size !== values.length) return { state: refuse(s, "Two options have the same text."), id: "" };
  const field = fieldData({ id, label: input.label.trim(), type: input.type, required: input.required, options, unit: isNumberType(input.type) ? input.unit?.trim() : undefined, help: input.help?.trim(), owner: input.owner });
  if (isNumberType(input.type) && input.unit === undefined) delete field.unit; // not chosen yet: the check asks for it
  if (existing && JSON.stringify(existing) === JSON.stringify(field)) return { state: s, id };
  let out = withSection(s, sectionId, (x) => ({ ...x, fields: existing ? x.fields.map((f) => (f.id === id ? field : f)) : [...x.fields, field] }));
  out = logEvent(out, { at, by, kind: "config", action: existing ? `Changed question in ${sec.code}` : `Added question to ${sec.code}`, detail: `${draftTag(d)}: “${field.label || "(no label)"}” (${field.type}, ${field.required}${field.unit ? `, ${field.unit}` : ""}), owner ${field.owner}.` });
  return { state: out, id };
}

/** Moves a question of a draft section one place up or down. */
export function moveField(s: AppState, by: string, sectionId: string, fieldId: string, dir: "up" | "down", at = nowIso()): AppState {
  const r = draftSection(s, by, sectionId);
  if ("error" in r) return r.error;
  const { d, sec } = r;
  const i = sec.fields.findIndex((f) => f.id === fieldId);
  if (i < 0) return refuse(s, `${fieldId} is not a question of ${sec.code} in the draft.`);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sec.fields.length) return refuse(s, `It is already the ${dir === "up" ? "first" : "last"} question.`, "info");
  const fields = [...sec.fields];
  [fields[i], fields[j]] = [fields[j], fields[i]];
  const out = withSection(s, sectionId, (x) => ({ ...x, fields }));
  return logEvent(out, { at, by, kind: "config", action: `Reordered questions in ${sec.code}`, detail: `${draftTag(d)}: “${sec.fields[i].label}” moved ${dir}.` });
}

/** Removes a question from a draft section (earlier versions keep it; their cases still show it). */
export function removeField(s: AppState, by: string, sectionId: string, fieldId: string, at = nowIso()): AppState {
  const r = draftSection(s, by, sectionId);
  if ("error" in r) return r.error;
  const { d, sec } = r;
  const f = sec.fields.find((x) => x.id === fieldId);
  if (!f) return refuse(s, `${fieldId} is not a question of ${sec.code} in the draft.`);
  const out = withSection(s, sectionId, (x) => ({ ...x, fields: x.fields.filter((y) => y.id !== fieldId) }));
  return logEvent(out, { at, by, kind: "config", action: `Removed question from ${sec.code}`, detail: `${draftTag(d)}: “${f.label}” removed. Cases on earlier versions keep it.` });
}

// ---------------------------------------------------------------------------------- publish

/**
 * Publishes the draft (spec §8.2): needs a change, a change note and a passing validation. Only the side that changed
 * gets its new number (Thomas, 14 Oct): rules only → RS-2026.(N+1) with the questionnaire version kept; questionnaire
 * only → v(N+1) with the rule set kept; both → both. The kept side is stored as an identical copy of the earlier
 * release's (it never defines that version again). New cases use the new pair; running cases keep theirs; the previous
 * pair is superseded. When the questionnaire changed, new sections get their owners in the Section owners setting, and
 * owners changed in the draft are applied there.
 */
export function publishDraft(s: AppState, by: string, changeNote: string, at = nowIso()): AppState {
  const denied = guard(s, by);
  if (denied) return refuse(s, denied);
  const d = draftPair(s);
  if (!d) return noDraft(s);
  const plan = publishPlan(s)!;
  const prev = currentPair(s);
  const prevLabel = pairLabel(prev.ruleSetVersion, prev.templateVersion);
  if (plan.kind === "none") return refuse(s, `Nothing to publish: the draft is the same as ${pairLabel(plan.base.ruleSetVersion, plan.base.templateVersion)}.`, "info");
  const note = changeNote.trim();
  if (!note) return refuse(s, "Write a change note: what changes, and why.");
  const v = validateDraft(s)!;
  if (!v.ok) return refuse(s, `${plan.label} cannot be published yet: ${v.checks.filter((c) => !c.ok).map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).join("; ")}.`);
  const ch = draftChanges(s)!;
  const ruleSet = plan.rulesChanged ? d.ruleSet : { version: plan.base.ruleSetVersion, rules: ruleDataOf(s.config, plan.base.ruleSetVersion).map(copyRule) };
  const template = plan.questionnaireChanged ? d.template : (JSON.parse(JSON.stringify(templateOf(s.config, plan.base.templateVersion))) as TemplateData);
  const published: ConfigPair = { ...d, ruleSet, template, status: "published", changeNote: note, publishedAt: at, publishedBy: by };
  const config: ConfigState = { pairs: s.config.pairs.map((p) => (p === d ? published : p)) };
  const ownership = { ...s.ownership };
  const owned: string[] = [];
  if (plan.questionnaireChanged) {
    for (const x of d.template.sections) {
      const cur = ownership[x.id];
      if (!cur || ownersKey(cur.lead, cur.co) !== ownersKey(x.lead, x.co)) {
        ownership[x.id] = { lead: x.lead, co: [...x.co] };
        owned.push(x.code);
      }
    }
  }
  let out: AppState = { ...s, config, templates: templateList(config), activeRuleSet: ruleSet.version, ownership };
  const name = plan.label;
  const kept = plan.kind === "rules" ? ` The questionnaire stays ${shortTemplate(template.version)}: no new questionnaire version.` : plan.kind === "questionnaire" ? ` The rules stay ${ruleSet.version}: no new rule set.` : "";
  out = logEvent(out, { at, by, kind: "config", action: `Published ${name}`, detail: `${plan.kindLabel}: ${note} (${changesText(ch)}).${kept} New cases use ${name}; running cases keep their version.${owned.length ? ` Section owners set for ${owned.join(", ")}.` : ""}` });
  const running = s.cases.filter((c) => !isClosed(c));
  const onPrev = running.filter((c) => c.ruleSetVersion === prev.ruleSetVersion && c.templateVersion === prev.templateVersion).length;
  const keep = !running.length ? "No case is running." : onPrev === running.length ? `${running.length} running case${running.length === 1 ? "" : "s"} keep${running.length === 1 ? "s" : ""} ${prevLabel}.` : `${running.length} running case${running.length === 1 ? "" : "s"} keep the version they started with.`;
  const head =
    plan.kind === "rules"
      ? `Rules ${ruleSet.version} published with questionnaire ${shortTemplate(template.version)} (unchanged). New cases use ${name}`
      : plan.kind === "questionnaire"
        ? `Questionnaire ${shortTemplate(template.version)} published with rules ${ruleSet.version} (unchanged). New cases use ${name}`
        : `${name} published. New cases use it`;
  return toast(out, "success", `${head}; ${keep.charAt(0).toLowerCase()}${keep.slice(1)}`);
}
