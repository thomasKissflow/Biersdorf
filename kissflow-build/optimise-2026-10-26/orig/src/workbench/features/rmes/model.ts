// RMES sheet logic, pure (WORKBENCH-DESIGN.md §8.11, §7.9; BR-063; WB-D9; ground rule 7).
//   - One F5 (Safety) / F6 (Regulatory) row per case; duplicates: the oldest _created_at is kept, the others get
//     RMES_Voided = "Yes".
//   - Soft lock (advisory, no server locking, SPIKES L154): Editing_By = "Name (email)", Editing_Since = now; someone
//     else's lock younger than 30 minutes opens the sheet read-only with "Take over".
//   - Save in two phases: (1) Table:: operations for dirty criteria and findings rows only (verified by row _id or
//     natural key); (2) from the READ-BACK row, Open_Criteria_Count (Σ Criteria_Open_Num as read back, a blank on an
//     applicable row counting 1) and Open_Blocking_Findings_Count, written and verified.
import { listValues, type ChildTableId, type FlowId } from "../../schema";
import { CHILD_TABLES } from "../../schema/generated";
import type { RmesCriteriaPayload } from "../../domain/config";
import { rmesKey as caseRmesKey, rmesRowKey } from "../../domain/keys";
import { rmesHeaderCounts } from "../../data/counts";
import { mirrorOf } from "../../data/gates";
import { CLEAR, isBlank, kfDateTime } from "../../data/normalize";
import type { Me } from "../../data/runtime";
import type { CaseVM, CriterionVM, FindingVM, Patch, RmesVM, RowOp } from "../../data/viewModels";

export type RmesDept = "SAF" | "REG";
export const RMES_FLOW: Record<RmesDept, "CIQ_RMES_Safety_A00" | "CIQ_RMES_Regulatory_A00"> = { SAF: "CIQ_RMES_Safety_A00", REG: "CIQ_RMES_Regulatory_A00" };
export const CRITERIA_TABLE: Record<RmesDept, ChildTableId> = { SAF: "Safety_Criteria", REG: "Regulatory_Criteria" };
export const FINDINGS_TABLE: Record<RmesDept, ChildTableId> = { SAF: "Safety_Findings", REG: "Regulatory_Findings" };
export const RMES_DEPT_LABEL: Record<RmesDept, string> = { SAF: "Safety", REG: "Regulatory" };
export const isRmesDept = (x: unknown): x is RmesDept => x === "SAF" || x === "REG";

export const LOCK_MINUTES = 30;
/** Findings_State values are open (Q9): the MVP uses these and labels them provisional. */
export const FINDING_STATES = ["Open", "Closed"] as const;
/** Results that need no comment (mirror of the Criteria_Open_Num formula). */
export const OK_RESULTS = ["Available", "Plausible", "Listed"];
export const RMES_PARTS = ["A", "B", "C", "D"] as const;

/** Columns the grid lets the editor change. Recorded_By/_At are set automatically; AI and source columns are
 *  read-only (no AI in the MVP); Criteria_Open_Num is computed (never written). */
export const CRITERION_INPUTS = [
  "Criteria_Applicable",
  "Criteria_Override_Reason",
  "Criteria_Result",
  "Criteria_Comment",
  "Criteria_Reported_Value",
  "Criteria_Reported_Unit",
  "Criteria_Limit_Value",
  "Criteria_Limit_Comparator",
  "Criteria_Limit_Set_Version",
  "Criteria_Limit_Pass",
  "Criteria_Impact_Resolution",
] as const;
export const CRITERION_AI = ["Criteria_AI_Suggestion_Text", "Criteria_AI_Source_Quote", "Criteria_AI_Source_Doc_File_Name", "Criteria_AI_State", "Criteria_AI_Decided_By", "Criteria_AI_Decided_At"] as const;
export const FINDING_COLUMNS = ["Findings_Text", "Findings_Criterion_Code", "Findings_Blocking", "Findings_State", "Findings_Linked_OP_Key"] as const;

// ---------------------------------------------------------------- rows and duplicates

const createdKey = (r: Pick<RmesVM, "createdAt" | "_id">) => `${r.createdAt ?? "￿"}|${r._id}`;

/** The live (non-voided) rows, oldest first. The oldest is kept; the others are duplicates to void (BR-063). */
export function planDuplicates(rows: RmesVM[]): { keep: RmesVM | null; duplicates: RmesVM[] } {
  const live = rows.filter((r) => !r.voided).sort((a, b) => createdKey(a).localeCompare(createdKey(b)));
  return { keep: live[0] ?? null, duplicates: live.slice(1) };
}
export const VOID_PATCH: Patch = { fields: { RMES_Voided: "Yes" } };

/** The first editor session after PS-05 creates the row (BR-063): only when Completeness_At is set. */
export function createBlockers(c: Pick<CaseVM, "completeness" | "caseCode">, criteria: { code: string }[] | null): string[] {
  const out: string[] = [];
  if (isBlank(c.completeness.at)) out.push("The supplier has not confirmed completeness yet (PS-05): the RMES sheet is created after that.");
  if (!c.caseCode) out.push("The case code is not readable.");
  if (criteria && criteria.length === 0) out.push("The pinned release has no RMES criteria for this department.");
  return out;
}

/** The create data: RMES_Key = case RMES_Key + "-SAF"/"-REG", Result_Case = {_id}, the case keys, and the criteria
 *  rows seeded from the pinned release's "RMES criteria" payload for this department. */
export function seedRmesData(c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo" | "rmesKey">, d: RmesDept, criteria: RmesCriteriaPayload["criteria"]): Record<string, unknown> {
  const base = c.rmesKey || caseRmesKey(c.caseCode, c.cycleNo ?? 1);
  return {
    RMES_Key: rmesRowKey(base, d),
    Result_Case: { _id: c._id },
    Case_Item_Id: c._id,
    Case_Code: c.caseCode,
    Cycle_No: c.cycleNo ?? undefined,
    [CRITERIA_TABLE[d]]: criteria
      .filter((x) => x.dept === d)
      // F7: Criteria_Part is a list column (CIQ_RMES_Part); a value outside it is left blank, never sent
      .map((x) => ({ Criteria_Code: x.code, Criteria_Part: listValues("CIQ_RMES_Part").includes(x.part) ? x.part : undefined, Criteria_Title: x.title })),
  };
}

// ---------------------------------------------------------------- soft lock

export type LockState = { kind: "free" } | { kind: "mine"; since: string } | { kind: "held"; by: string; since: string; minutes: number } | { kind: "stale"; by: string; since: string; minutes: number };
export const lockLabel = (me: Pick<Me, "Name" | "Email">): string => `${me.Name} (${me.Email})`;

export function lockState(row: Pick<RmesVM, "editingBy" | "editingSince">, me: Pick<Me, "Name" | "Email">, now: Date): LockState {
  const by = (row.editingBy ?? "").trim();
  if (!by) return { kind: "free" };
  if (by === lockLabel(me) || (me.Email && by.toLowerCase().includes(`(${me.Email.toLowerCase()})`))) return { kind: "mine", since: row.editingSince };
  const t = Date.parse(row.editingSince ?? "");
  // a lock without a readable time cannot be proven fresh: it counts as stale (advisory only)
  if (!Number.isFinite(t)) return { kind: "stale", by, since: row.editingSince ?? "", minutes: Infinity };
  const minutes = Math.max(0, (now.getTime() - t) / 60000);
  return minutes < LOCK_MINUTES ? { kind: "held", by, since: row.editingSince, minutes } : { kind: "stale", by, since: row.editingSince, minutes };
}
/** May this user edit without taking over? (free, own lock, or someone else's lock older than 30 minutes) */
export const canEditUnder = (l: LockState): boolean => l.kind !== "held";
export const lockPatch = (me: Pick<Me, "Name" | "Email">, now: Date): Patch => ({ fields: { Editing_By: lockLabel(me), Editing_Since: kfDateTime(now) } });
export const RELEASE_PATCH: Patch = { fields: { Editing_By: CLEAR, Editing_Since: CLEAR } };

// ---------------------------------------------------------------- criteria and findings

export type RowEdits = Record<string, Record<string, unknown>>;

/** A criterion's values with the user's edits on top. */
export function criterionValues(row: CriterionVM, edits?: Record<string, unknown>): Record<string, unknown> {
  return { ...row.v, ...(edits ?? {}) };
}

/** The client mirror of Criteria_Open_Num (explanation only; the header counts use the READ-BACK server values). */
export function criterionOpenMirror(flow: FlowId, d: RmesDept, values: Record<string, unknown>): { value: number; why: string[] } {
  const m = mirrorOf(flow, "Criteria_Open_Num", CRITERIA_TABLE[d]);
  const r = m ? m(values) : { value: 1, why: ["no mirror"] };
  return { value: Number(r.value), why: r.why };
}

/** Client rules per criterion: an override reason when not applicable; a comment when the result is not
 *  Available/Plausible/Listed (mirrors the formula). A blank result is allowed (the row stays open). */
export function criterionProblems(code: string, values: Record<string, unknown>): string[] {
  const out: string[] = [];
  const applicable = String(values.Criteria_Applicable ?? "");
  if (applicable === "No" && isBlank(values.Criteria_Override_Reason)) out.push(`${code}: give a reason when the criterion is not applicable.`);
  const result = String(values.Criteria_Result ?? "");
  if (applicable !== "No" && result && !OK_RESULTS.includes(result) && isBlank(values.Criteria_Comment)) out.push(`${code}: a comment is required for the result "${result}".`);
  return out;
}

export interface FindingDraft {
  /** Set for an existing row (modify); absent for a new one (add). */
  _id?: string;
  /** The natural key as read (Findings_Criterion_Code + Findings_Text), for matching a modify on read-back. */
  key?: { Findings_Criterion_Code: string; Findings_Text: string };
  values: Record<string, unknown>;
}
export const findingValues = (f: FindingVM): Record<string, unknown> => ({ Findings_Text: f.text, Findings_Criterion_Code: f.criterionCode, Findings_Blocking: f.blocking, Findings_State: f.state, Findings_Linked_OP_Key: f.linkedOpKey });
export function findingProblems(values: Record<string, unknown>): string[] {
  return isBlank(values.Findings_Text) ? ["A finding needs a text."] : [];
}

const differs = (a: unknown, b: unknown) => (isBlank(a) && isBlank(b) ? false : String(a ?? "") !== String(b ?? ""));

/**
 * Phase 1 (§8.11): Table:: operations for the DIRTY rows only. Edited criteria are modified (with Recorded_By/_At =
 * me, now) and keyed by Criteria_Code; new findings are added; edited findings are modified, keyed by their natural
 * key as read. Unchanged rows are never sent (two writers lost rows, SPIKES L156).
 */
export function buildRowsPatch(d: RmesDept, row: Pick<RmesVM, "criteria" | "findings">, critEdits: RowEdits, findings: FindingDraft[], me: Pick<Me, "_id">, now: Date): Patch {
  const stamp = kfDateTime(now);
  const crit: RowOp[] = [];
  for (const c of row.criteria) {
    const e = critEdits[c._id];
    if (!e) continue;
    const changed = Object.fromEntries(Object.entries(e).filter(([k, v]) => (CRITERION_INPUTS as readonly string[]).includes(k) && differs(v, c.v[k])));
    if (!Object.keys(changed).length) continue;
    crit.push({ kind: "modify", _id: c._id, row: { ...changed, Criteria_Recorded_By: { _id: me._id }, Criteria_Recorded_At: stamp }, key: { Criteria_Code: c.code } });
  }
  const find: RowOp[] = [];
  for (const f of findings) {
    const vals = Object.fromEntries(Object.entries(f.values).filter(([k]) => (FINDING_COLUMNS as readonly string[]).includes(k)));
    if (!f._id) {
      const clean = Object.fromEntries(Object.entries(vals).filter(([, v]) => !isBlank(v)));
      if (Object.keys(clean).length) find.push({ kind: "add", row: clean });
      continue;
    }
    const orig = row.findings.find((x) => x._id === f._id);
    const before = orig ? findingValues(orig) : {};
    const changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => differs(v, before[k])));
    if (Object.keys(changed).length) find.push({ kind: "modify", _id: f._id, row: changed, key: f.key ?? (orig ? { Findings_Criterion_Code: orig.criterionCode, Findings_Text: orig.text } : undefined) });
  }
  const tables: Patch["tables"] = {};
  if (crit.length) tables[CRITERIA_TABLE[d]] = crit;
  if (find.length) tables[FINDINGS_TABLE[d]] = find;
  return { fields: {}, tables };
}
export const hasRowOps = (p: Patch): boolean => Object.values(p.tables ?? {}).some((o) => !!o?.length);

/** Phase 2: the header counts from the READ-BACK row (a blank Criteria_Open_Num on an applicable row counts 1). */
export function headerFromReadBack(back: Pick<RmesVM, "criteria" | "findings">): { patch: Patch; openCriteria: number; openBlockingFindings: number; warnings: string[] } {
  const h = rmesHeaderCounts(back);
  return { patch: { fields: { Open_Criteria_Count: h.openCriteria, Open_Blocking_Findings_Count: h.openBlockingFindings } }, openCriteria: h.openCriteria, openBlockingFindings: h.openBlockingFindings, warnings: h.warnings };
}

/** The column's display name from the generated child table. */
export function columnLabel(d: RmesDept, table: "criteria" | "findings", col: string): string {
  const t = (CHILD_TABLES as unknown as Record<string, { fields: Record<string, { name: string }> }>)[table === "criteria" ? CRITERIA_TABLE[d] : FINDINGS_TABLE[d]];
  return t?.fields[col]?.name ?? col;
}

/** The reference a point raised from a finding carries in Ref_Internal_Key [convention]. */
export const findingRefKey = (rmesRowKeyValue: string, findingId: string): string => `${rmesRowKeyValue}#${findingId}`;
