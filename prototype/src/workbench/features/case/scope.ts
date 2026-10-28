// The S2 scope check (WORKBENCH-DESIGN.md §8.5 CASE_S2; WB-12 manual scope, WB-D10 Rule_Set_Version). Pure builders
// plus one orchestration (saveScope) that runs on the actions layer:
//
//   (1) the pinned config → sections (Template order + Section definitions + ownership), Text bundle, Settings;
//       content hashes are checked against the CASE's manifest copy (a mismatch blocks S2 and is recorded in F8);
//   (2) per section: applicability Mandatory / Optional / N.A. — it can EXTEND, never REDUCE (brd L783:
//       "RMM may extend the scope with a justification, but never reduce it"): never below the template default, and
//       never N.A. for a section that already has its F3 row; a deviation from the default needs a justification;
//   (3) department flags from the leads of non-N.A. sections; Dept_RMM_Active from Settings deptReviewMode; RMM may
//       ADD a department with a reason, never remove a required or already active one;
//   (4) completeness / final-release texts (Text bundle key, or manual text with key MANUAL-<date>) and due dates;
//   (5) Save scope: the F4 run (once, by Run_Key) → the missing F3 rows one at a time (by Section_Item_Key) → the S2
//       Mandatory set at the step. A rerun creates no duplicates.
import { DEPTS, listValues, type Dept } from "../../schema";
import {
  parseManifest,
  parseOwnership,
  parseSectionDefinition,
  parseTemplate,
  parseTextBundle,
  ruleSetVersion,
  checkContentHash,
  type Applicability,
  type ManifestEntry,
  type PinnedConfig,
  type SettingsPayload,
} from "../../domain/config";
import { completenessRequestKey, EVALUATOR_VERSION, finalReleaseRequestKey, manualTextKey, rmesKey, runKey, sectionItemKey } from "../../domain/keys";
import { isBlank, kfDateTime } from "../../data/normalize";
import type { Actions } from "../../data/actions";
import type { CaseVM, ConfigVM, Problem, RunVM, SaveResult, SectionVM, TaskRef } from "../../data/viewModels";

export const APPLIC_RANK: Record<Applicability, number> = { "N.A.": 0, Optional: 1, Mandatory: 2 };
const APPLICS: Applicability[] = ["Mandatory", "Optional", "N.A."];
const LANE_DEPTS_FROM_LEADS: Dept[] = ["REG", "SAF", "QM", "MIC", "SUS"];

export interface ScopeSectionDef {
  sectionKey: string;
  code: string;
  title: string;
  sort: number;
  default: Applicability;
  lead: string;
  co: string[];
  queryOwner: string;
  /** The Section definition row (Definition_JSON source) and its manifest entry. */
  defRow: ConfigVM | null;
  defConfigKey: string;
  defHash: string;
}
export interface ScopeConfig {
  release: ConfigVM;
  templateConfigKey: string;
  sections: ScopeSectionDef[];
  settings: SettingsPayload;
  texts: Record<string, string>;
  ruleSetVersion: string;
  /** Config problems (missing definitions, unreadable payloads): they block Save scope. */
  problems: string[];
}

/** Builds the scope inputs from the case's pinned config (§4.6 payload conventions). */
export function scopeConfigFrom(pinned: PinnedConfig): ScopeConfig {
  const problems = [...pinned.problems];
  const byKind = (kind: string) => pinned.manifest.filter((e) => e.kind === kind);
  const rowOf = (e: ManifestEntry) => pinned.rows.get(e.configKey) ?? null;
  const tEntry = byKind("Template")[0];
  const tRow = tEntry ? rowOf(tEntry) : null;
  const tpl = tRow ? parseTemplate(tRow.payloadJson) : null;
  if (!tEntry) problems.push("The pinned release has no Template.");
  else if (!tpl?.ok) problems.push(`Template: ${tpl && !tpl.ok ? tpl.error : "not readable"}`);
  const defs = new Map<string, { row: ConfigVM; entry: ManifestEntry; code: string; title: string; sort: number }>();
  for (const e of byKind("Section definition")) {
    const row = rowOf(e);
    if (!row) continue;
    const p = parseSectionDefinition(row.payloadJson);
    if (!p.ok) {
      problems.push(`Section definition ${e.configKey}: ${p.error}`);
      continue;
    }
    defs.set(p.value.sectionKey, { row, entry: e, code: p.value.code, title: p.value.title, sort: p.value.sort });
  }
  const oEntry = byKind("Section ownership")[0];
  const oRow = oEntry ? rowOf(oEntry) : null;
  const own = oRow ? parseOwnership(oRow.payloadJson) : null;
  if (own && !own.ok) problems.push(`Section ownership: ${own.error}`);
  const owners = own?.ok ? own.value.owners : {};
  const xEntry = byKind("Text bundle")[0];
  const xRow = xEntry ? rowOf(xEntry) : null;
  const tb = xRow ? parseTextBundle(xRow.payloadJson) : null;
  if (tb && !tb.ok) problems.push(`Text bundle: ${tb.error}`);
  const sections: ScopeSectionDef[] = [];
  for (const s of tpl?.ok ? tpl.value.sections : []) {
    const d = defs.get(s.sectionKey); // a missing definition blocks only when the section is in scope (buildSectionRows)
    const o = owners[s.sectionKey];
    sections.push({
      sectionKey: s.sectionKey,
      code: d?.code ?? s.sectionKey,
      title: d?.title ?? s.sectionKey,
      sort: d?.sort ?? 999,
      default: s.default,
      lead: o?.lead ?? "",
      co: o?.co ?? [],
      queryOwner: o?.queryOwner ?? "",
      defRow: d?.row ?? null,
      defConfigKey: d?.entry.configKey ?? "",
      defHash: d?.entry.contentHash ?? "",
    });
  }
  sections.sort((a, b) => a.sort - b.sort || a.sectionKey.localeCompare(b.sectionKey));
  return { release: pinned.release, templateConfigKey: tEntry?.configKey ?? "", sections, settings: pinned.settings, texts: tb?.ok ? tb.value.texts : {}, ruleSetVersion: ruleSetVersion(pinned), problems };
}

/** Content-hash check of the pinned rows against the CASE's manifest copy (Release_Manifest_JSON, §4.6). Falls back
 *  to the release's manifest when the copy is unreadable. */
export async function checkCaseManifest(caseManifestJson: string, rows: ConfigVM[], fallback: ManifestEntry[]): Promise<{ mismatches: { configKey: string; expected: string; actual: string }[]; problems: string[] }> {
  const m = parseManifest(caseManifestJson);
  const entries = m.ok ? m.value : fallback;
  const problems = m.ok ? [] : [`The case's manifest copy is not readable (${m.error}); the release manifest was checked instead.`];
  const byId = new Map(rows.map((r) => [r._id, r]));
  const mismatches: { configKey: string; expected: string; actual: string }[] = [];
  for (const e of entries) {
    const row = byId.get(e.itemId);
    if (!row) {
      problems.push(`${e.configKey}: the row is not readable.`);
      continue;
    }
    try {
      const h = await checkContentHash(row, e);
      if (!h.ok) mismatches.push({ configKey: e.configKey, expected: h.expected, actual: h.actual });
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { mismatches, problems };
}

// ---------------------------------------------------------------- choices → result (pure)

/** Applicability options a section offers: never below the template default; an existing F3 row keeps it in scope. */
export function applicabilityOptions(def: Applicability, exists: boolean): Applicability[] {
  const floor = Math.max(APPLIC_RANK[def], exists ? APPLIC_RANK.Optional : 0);
  return APPLICS.filter((a) => APPLIC_RANK[a] >= floor);
}

export interface ScopeChoices {
  applicability: Record<string, Applicability | undefined>;
  justification: Record<string, string | undefined>;
  /** Departments RMM switches on beyond the required ones (needs deptReason). A false never removes a required one. */
  deptOn: Partial<Record<Dept, boolean>>;
  deptReason: string;
}
export interface ScopeContext {
  /** Section keys that already have an F3 row for this case and cycle (BASIC from the create, an earlier save). */
  existingSectionKeys: ReadonlySet<string>;
  /** Departments already active on the case (Dept_<D>_Active = "Yes"): they stay active (never reduce). */
  activeDepts: ReadonlySet<Dept>;
}
export interface ScopeSectionResult extends ScopeSectionDef {
  applicability: Applicability;
  justification: string;
  deviates: boolean;
  inScope: boolean;
  exists: boolean;
}
export interface ScopeResult {
  sections: ScopeSectionResult[];
  inScope: string[];
  na: string[];
  /** Departments required by the leads of in-scope sections (REG…SUS) and by Settings (RMM). */
  required: Record<Dept, boolean>;
  depts: Record<Dept, "Yes" | "No">;
  /** Departments RMM added beyond the required/active ones. */
  added: Dept[];
  leadDepartments: string[];
  ruleSetVersion: string;
  problems: Problem[];
  /** Choices that were clamped because they would reduce the scope. */
  notes: string[];
}

export function buildScope(cfg: Pick<ScopeConfig, "sections" | "settings" | "ruleSetVersion">, choices: ScopeChoices, ctx: ScopeContext): ScopeResult {
  const problems: Problem[] = [];
  const notes: string[] = [];
  const sections: ScopeSectionResult[] = cfg.sections.map((s) => {
    const exists = ctx.existingSectionKeys.has(s.sectionKey);
    const opts = applicabilityOptions(s.default, exists);
    let a = choices.applicability[s.sectionKey] ?? s.default;
    if (!opts.includes(a)) {
      notes.push(`${s.code}: "${a}" would reduce the scope; kept at ${opts[opts.length - 1]}.`);
      a = opts[opts.length - 1];
    }
    const deviates = a !== s.default;
    const justification = (choices.justification[s.sectionKey] ?? "").trim();
    if (deviates && !justification) problems.push({ field: `section:${s.sectionKey}`, label: s.code, message: `${s.code} ${s.title}: a justification is required when the applicability differs from the default (${s.default}).` });
    return { ...s, applicability: a, justification, deviates, exists, inScope: a !== "N.A." };
  });
  const required = Object.fromEntries(DEPTS.map((d) => [d, false])) as Record<Dept, boolean>;
  for (const s of sections) if (s.inScope && (LANE_DEPTS_FROM_LEADS as string[]).includes(s.lead)) required[s.lead as Dept] = true;
  required.RMM = !!cfg.settings.deptReviewMode;
  const depts = {} as Record<Dept, "Yes" | "No">;
  const added: Dept[] = [];
  for (const d of DEPTS) {
    const keep = required[d] || ctx.activeDepts.has(d);
    if (choices.deptOn[d] === false && keep) notes.push(`${d} stays active: ${required[d] ? "a section in scope is led by it" : "it is already active on the case"} (the scope is never reduced).`);
    const on = keep || choices.deptOn[d] === true;
    if (on && !keep) added.push(d);
    depts[d] = on ? "Yes" : "No";
  }
  if (added.length && !choices.deptReason.trim()) problems.push({ field: "deptReason", label: "Reason for added departments", message: `A reason is required to add ${added.join(", ")} beyond the lead departments.` });
  const inScope = sections.filter((s) => s.inScope).map((s) => s.sectionKey);
  if (!inScope.length) problems.push({ label: "Sections", message: "At least one section must be in scope." });
  const leadDepartments = [...new Set(sections.filter((s) => s.inScope && s.lead).map((s) => s.lead))];
  return { sections, inScope, na: sections.filter((s) => !s.inScope).map((s) => s.sectionKey), required, depts, added, leadDepartments, ruleSetVersion: cfg.ruleSetVersion, problems, notes };
}

// ---------------------------------------------------------------- the recorded run (Result_JSON)

export interface RecordedScope {
  version: 1;
  sections: { sectionKey: string; code: string; title: string; default: Applicability; applicability: Applicability; justification: string; lead: string }[];
  depts: Record<Dept, "Yes" | "No">;
  added: Dept[];
  deptReason: string;
  na: string[];
}
export function recordedScopeOf(result: ScopeResult, deptReason: string): RecordedScope {
  return {
    version: 1,
    sections: result.sections.map((s) => ({ sectionKey: s.sectionKey, code: s.code, title: s.title, default: s.default, applicability: s.applicability, justification: s.justification, lead: s.lead })),
    depts: result.depts,
    added: result.added,
    deptReason: deptReason.trim(),
    na: result.na,
  };
}
/** The recorded scope of an existing run, or null when its Result_JSON is not this shape. */
export function parseRecordedScope(resultJson: string): RecordedScope | null {
  try {
    const v = JSON.parse(resultJson) as RecordedScope;
    if (!v || v.version !== 1 || !Array.isArray(v.sections) || !v.depts) return null;
    return v;
  } catch {
    return null;
  }
}
/** The scope as recorded by an earlier Save scope: the table is locked to it, so a rerun stays idempotent. */
export function scopeFromRecorded(rec: RecordedScope, cfg: Pick<ScopeConfig, "sections" | "ruleSetVersion">, ctx: ScopeContext): ScopeResult {
  const defs = new Map(cfg.sections.map((s) => [s.sectionKey, s]));
  const sections: ScopeSectionResult[] = rec.sections.map((r) => {
    const d = defs.get(r.sectionKey);
    const base: ScopeSectionDef = d ?? { sectionKey: r.sectionKey, code: r.code, title: r.title, sort: 999, default: r.default, lead: r.lead, co: [], queryOwner: "", defRow: null, defConfigKey: "", defHash: "" };
    return { ...base, lead: r.lead, applicability: r.applicability, justification: r.justification, deviates: r.applicability !== r.default, inScope: r.applicability !== "N.A.", exists: ctx.existingSectionKeys.has(r.sectionKey) };
  });
  const required = Object.fromEntries(DEPTS.map((d) => [d, false])) as Record<Dept, boolean>;
  for (const s of sections) if (s.inScope && (LANE_DEPTS_FROM_LEADS as string[]).includes(s.lead)) required[s.lead as Dept] = true;
  const depts = { ...rec.depts };
  for (const d of ctx.activeDepts) depts[d] = "Yes"; // never reduce
  return {
    sections,
    inScope: sections.filter((s) => s.inScope).map((s) => s.sectionKey),
    na: sections.filter((s) => !s.inScope).map((s) => s.sectionKey),
    required,
    depts,
    added: rec.added,
    leadDepartments: [...new Set(sections.filter((s) => s.inScope && s.lead).map((s) => s.lead))],
    ruleSetVersion: cfg.ruleSetVersion,
    problems: [],
    notes: [],
  };
}

// ---------------------------------------------------------------- rows and fields

export const initialRunKey = (c: Pick<CaseVM, "caseCode" | "cycleNo">): string => runKey(c.caseCode, c.cycleNo ?? 1, 1);

export function buildRunRow(o: { c: CaseVM; result: ScopeResult; deptReason: string; inputJson: string; inputHash: string; me: { _id: string }; now: Date }): Record<string, unknown> {
  const { c, result } = o;
  const key = initialRunKey(c);
  const just = result.sections.filter((s) => s.deviates).map((s) => `${s.code}: ${s.justification}`);
  if (result.added.length) just.push(`Added departments ${result.added.join(", ")}: ${o.deptReason.trim()}`);
  return {
    Run_Key: key,
    Case_Code: c.caseCode,
    Cycle_No: c.cycleNo ?? 1,
    Case_Item_Id: c._id,
    Run_No: 1,
    Scope_Trigger: "Initial",
    Release_Item_Id: c.releaseItemId || undefined,
    Rule_Set_Version: result.ruleSetVersion,
    Evaluator_Version: EVALUATOR_VERSION,
    Input_JSON: o.inputJson,
    Input_Hash: o.inputHash,
    Result_JSON: JSON.stringify(recordedScopeOf(result, o.deptReason)),
    Added_Section_Keys: result.inScope.join(","),
    Lead_Departments: result.leadDepartments.join(","),
    Override_Justification: just.length ? just.join("\n") : undefined,
    Run_By: { _id: o.me._id },
    Run_At: kfDateTime(o.now),
  };
}

/** The evaluator input recorded with the run (Input_JSON; Input_Hash = its sha256). */
export function scopeInputJson(c: CaseVM, cfg: Pick<ScopeConfig, "sections" | "settings" | "templateConfigKey" | "release">): string {
  return JSON.stringify({
    evaluator: EVALUATOR_VERSION,
    caseCode: c.caseCode,
    cycleNo: c.cycleNo,
    releaseItemId: cfg.release._id,
    releaseKey: cfg.release.releaseKey,
    template: cfg.templateConfigKey,
    sections: cfg.sections.map((s) => ({ sectionKey: s.sectionKey, default: s.default, lead: s.lead, co: s.co, queryOwner: s.queryOwner, definition: s.defConfigKey })),
    deptReviewMode: !!cfg.settings.deptReviewMode,
  });
}

const DEPT_LIST = () => listValues("CIQ_Department");
const REVIEW_DEPT_LIST = () => listValues("CIQ_Review_Dept");

/** One F3 row per in-scope section (Section_Origin "Template"). */
export function buildSectionRows(c: CaseVM, result: ScopeResult, runKeyValue: string): { key: string; row: Record<string, unknown>; problem?: string }[] {
  const cycle = c.cycleNo ?? 1;
  return result.sections
    .filter((s) => s.inScope)
    .map((s) => {
      const key = sectionItemKey(c.caseCode, cycle, s.sectionKey);
      const problem = !s.defRow ? `${s.code}: no Section definition in the pinned release.` : !s.defHash ? `${s.code}: the manifest carries no content hash.` : undefined;
      return {
        key,
        problem,
        row: {
          Section_Item_Key: key,
          Case_Code: c.caseCode,
          Cycle_No: cycle,
          Case_Item_Id: c._id,
          Supplier_Code: c.supplierCode,
          Section_Key: s.sectionKey,
          Section_Code: s.code,
          Section_Title: s.title,
          Section_Sort: s.sort === 999 ? undefined : s.sort,
          Applicability_Label: s.applicability,
          Section_Origin: "Template",
          Definition_JSON: s.defRow?.payloadJson,
          Definition_Hash: s.defHash || undefined,
          Supplier_Due_Date: c.supplierDueDate || undefined,
          Portal_Contact_Ids: c.portalContactIds,
          Lead_Dept: DEPT_LIST().includes(s.lead) ? s.lead : undefined,
          Query_Owner_Dept: REVIEW_DEPT_LIST().includes(s.queryOwner) ? s.queryOwner : undefined,
          Co_Review_Depts: s.co.length ? s.co.join(",") : undefined,
          Scope_Run_Key: runKeyValue,
          Section_Def_Key: s.defConfigKey || undefined,
          Source_Content_Hash: s.defHash || undefined,
          Derivation_Kind: EVALUATOR_VERSION,
          Override_Justification: s.deviates ? s.justification : undefined,
        },
      };
    });
}

export interface S2Texts {
  completenessTextKey: string;
  completenessText: string;
  completenessDue: string;
  finalTextKey: string;
  finalText: string;
  finalDue: string;
  closingText: string;
  confirmContactIds: string;
  supplierContactEmails: string;
}
/** A text key: the chosen bundle key, or MANUAL-<date> for a typed text. */
export const textKeyOr = (chosen: string, now: Date): string => (chosen && chosen !== "__manual" ? chosen : manualTextKey(now));

/** The S2 Mandatory set (+ the editable Final_Release_Due_Date) written by Save scope. */
export function buildS2Fields(c: CaseVM, result: ScopeResult, t: S2Texts, now: Date): Record<string, unknown> {
  const cycle = c.cycleNo ?? 1;
  const f: Record<string, unknown> = {
    Confirm_Contact_Ids: t.confirmContactIds,
    Supplier_Contact_Emails: t.supplierContactEmails,
    Rule_Set_Version: result.ruleSetVersion,
    Initial_Scope_Run_Key: initialRunKey(c),
    Completeness_Request_Key: completenessRequestKey(c.caseCode, cycle),
    Completeness_Declaration_Text: t.completenessText,
    Completeness_Text_Key: textKeyOr(t.completenessTextKey, now),
    Completeness_Due_Date: t.completenessDue,
    RMES_Key: rmesKey(c.caseCode, cycle),
    Final_Release_Request_Key: finalReleaseRequestKey(c.caseCode, cycle),
    Final_Release_Declaration_Text: t.finalText,
    Final_Release_Text_Key: textKeyOr(t.finalTextKey, now),
    Supplier_Closing_Text: t.closingText,
  };
  if (t.finalDue) f.Final_Release_Due_Date = t.finalDue;
  for (const d of DEPTS) f[`Dept_${d}_Active`] = result.depts[d];
  return f;
}

export function s2TextProblems(t: S2Texts): Problem[] {
  const req: [keyof S2Texts, string][] = [
    ["completenessText", "Completeness declaration text"],
    ["completenessDue", "Completeness due date"],
    ["finalText", "Final release declaration text"],
    ["closingText", "Supplier closing text"],
    ["confirmContactIds", "Confirm contact ids"],
    ["supplierContactEmails", "Supplier contact e-mails"],
  ];
  return req.filter(([k]) => isBlank(t[k])).map(([k, label]) => ({ field: k, label, message: `${label} is required.` }));
}

// ---------------------------------------------------------------- Save scope (orchestration)

export interface SaveScopeDeps {
  createFormRow: Actions["createFormRow"];
  saveAtStep: Actions["saveAtStep"];
}
export interface SaveScopeInput {
  task: TaskRef;
  c: CaseVM;
  result: ScopeResult;
  /** The F4 run row to create when the initial run does not exist yet (null when it does). */
  runRow: Record<string, unknown> | null;
  /** Existing rows of the case, read COMPLETELY (quality "form"); otherwise Save scope refuses (duplicates). */
  existing: { runs: RunVM[]; sections: SectionVM[]; complete: boolean };
  s2Fields: Record<string, unknown>;
}
export interface SaveScopeLog {
  ok: boolean;
  message: string;
  createdRun: boolean;
  createdSections: string[];
  skippedSections: string[];
  save?: SaveResult;
}

/** F4 run (once) → missing F3 rows one at a time → the S2 fields at the step. Stops at the first failure. */
export async function saveScope(deps: SaveScopeDeps, i: SaveScopeInput): Promise<SaveScopeLog> {
  const log: SaveScopeLog = { ok: false, message: "", createdRun: false, createdSections: [], skippedSections: [] };
  if (!i.existing.complete) return { ...log, message: "The scope runs and sections of this case could not be read completely, so nothing was created (it could create duplicates). Reload and try again." };
  if (i.result.problems.length) return { ...log, message: `Not saved: ${i.result.problems.map((p) => p.message).join(" ")}` };
  const rk = initialRunKey(i.c);
  const runExists = i.existing.runs.some((r) => r.runKey === rk);
  try {
    if (!runExists) {
      if (!i.runRow) return { ...log, message: "The scope run could not be built." };
      await deps.createFormRow("CIQ_Scope_Run_A00", i.runRow, "Run_Key");
      log.createdRun = true;
    }
    const have = new Set(i.existing.sections.map((s) => s.sectionItemKey));
    for (const s of buildSectionRows(i.c, i.result, rk)) {
      if (have.has(s.key)) {
        log.skippedSections.push(s.key);
        continue;
      }
      if (s.problem) return { ...log, message: `Stopped before ${s.key}: ${s.problem}` };
      await deps.createFormRow("CIQ_Section_A00", s.row, "Section_Item_Key");
      log.createdSections.push(s.key);
    }
  } catch (e) {
    return { ...log, message: `${e instanceof Error ? e.message : String(e)} Rows created so far are kept; Save scope again to add the rest.` };
  }
  const save = await deps.saveAtStep(i.task, { fields: i.s2Fields });
  return { ...log, ok: save.ok, save, message: save.ok ? "Scope saved and checked." : "The scope rows are saved, but the case fields were not." };
}

/** The before-submit rule at S2: the run and every in-scope F3 row exist (by key). */
export function scopeRowsProblems(c: CaseVM, result: ScopeResult | null, existing: { runs: RunVM[]; sections: SectionVM[]; complete: boolean }): Problem[] {
  if (!existing.complete) return [{ label: "Scope rows", message: "The scope rows of this case could not be read completely." }];
  const out: Problem[] = [];
  if (!existing.runs.some((r) => r.runKey === initialRunKey(c))) out.push({ label: "Scope run", message: "Save scope first: the scope run does not exist yet." });
  if (result) {
    const have = new Set(existing.sections.map((s) => s.sectionItemKey));
    const missing = result.inScope.filter((k) => !have.has(sectionItemKey(c.caseCode, c.cycleNo ?? 1, k)));
    if (missing.length) out.push({ label: "Sections", message: `Save scope first: section rows missing for ${missing.join(", ")}.` });
  }
  return out;
}

/** Picks a default text key from the bundle by a hint (e.g. "complet"), else manual. */
export function defaultTextKey(texts: Record<string, string>, hint: RegExp): string {
  return Object.keys(texts).find((k) => hint.test(k)) ?? "__manual";
}
