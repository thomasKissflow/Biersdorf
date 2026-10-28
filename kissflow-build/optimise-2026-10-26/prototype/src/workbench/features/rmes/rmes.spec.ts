// T2 · RMES (§8.11, §7.9): the client mirror of Criteria_Open_Num against schema/formulaSamples.ts, header counts
// from READ-BACK values (a blank on an applicable row counts 1), duplicate voiding, the lock rules, phase-1 patches
// (dirty rows only, natural keys), the create seed, and the two-phase save with a fake host (incl. the
// "rows saved; header counts not updated" path and childFormula=off). Fixtures are fictional.
import { describe, expect, it } from "vitest";
import { FORMULA_SAMPLES } from "../../schema/formulaSamples";
import { createActions } from "../../data/actions";
import { toCaseVM, toRmesVM } from "../../data/map";
import { CLEAR } from "../../data/normalize";
import type { RawItem } from "../../data/viewModels";
import { fakeClient, fakeRuntime, ME } from "../../testkit/fakeClient";
import {
  buildRowsPatch,
  canEditUnder,
  createBlockers,
  criterionOpenMirror,
  criterionProblems,
  headerFromReadBack,
  lockPatch,
  lockState,
  planDuplicates,
  RELEASE_PATCH,
  seedRmesData,
  VOID_PATCH,
} from "./model";
import { saveRmesTwoPhase } from "./save";

const F5 = "CIQ_RMES_Safety_A00" as const;
const crit = (code: string, o: Record<string, unknown> = {}) => ({ _id: `Safety_Criteria_${code}`, Criteria_Code: code, Criteria_Part: "A", Criteria_Title: `Criterion ${code}`, ...o });
const row = (o: Record<string, unknown> = {}, criteria: Record<string, unknown>[] = [crit("S-A1"), crit("S-A2")], findings: Record<string, unknown>[] = []): RawItem =>
  ({ _id: "F5a", _created_at: "2026-10-03T08:00:00Z", RMES_Key: "CIQ-2026-PkC4-C1-RMES-SAF", Case_Item_Id: "PkC4", "Table::Safety_Criteria": criteria, "Table::Safety_Findings": findings, ...o }) as RawItem;
const vm = (o?: Record<string, unknown>, criteria?: Record<string, unknown>[], findings?: Record<string, unknown>[]) => toRmesVM(row(o, criteria, findings), F5, "full");
const NOW = new Date("2026-10-08T10:00:00Z");

describe("Criteria_Open_Num: the client mirror against the shared vectors (schema/formulaSamples.ts)", () => {
  const samples = FORMULA_SAMPLES.filter((s) => s.field === "Criteria_Open_Num");
  it("covers both RMES forms", () => expect(new Set(samples.map((s) => s.flow))).toEqual(new Set(["CIQ_RMES_Safety_A00", "CIQ_RMES_Regulatory_A00"])));
  it.each(samples.map((s, i) => [i, s] as const))("vector %i", (_i, s) => {
    expect(criterionOpenMirror(s.flow, s.flow === F5 ? "SAF" : "REG", s.inputs).value).toBe(s.output);
  });
});

describe("header counts from the READ-BACK row (§7.9)", () => {
  it("a blank Criteria_Open_Num on an applicable row counts 1 (with a warning); not applicable counts 0", () => {
    const back = vm({}, [crit("S-A1"), crit("S-A2", { Criteria_Applicable: "No" }), crit("S-A3", { Criteria_Open_Num: 0 }), crit("S-A4", { Criteria_Open_Num: 1 })]);
    const h = headerFromReadBack(back);
    expect(h.openCriteria).toBe(2);
    expect(h.openCriteria).toBeGreaterThanOrEqual(1);
    expect(h.warnings).toEqual(["server formula blank on S-A1; counted as open"]);
    expect(h.patch.fields).toEqual({ Open_Criteria_Count: 2, Open_Blocking_Findings_Count: 0 });
  });
  it("blocking findings count unless Closed", () => {
    const back = vm({}, [], [
      { _id: "Safety_Findings_1", Findings_Text: "Impurity above limit", Findings_Blocking: "Yes", Findings_State: "Open" },
      { _id: "Safety_Findings_2", Findings_Text: "Typo", Findings_Blocking: "No", Findings_State: "Open" },
      { _id: "Safety_Findings_3", Findings_Text: "Resolved", Findings_Blocking: "Yes", Findings_State: "Closed" },
    ]);
    expect(headerFromReadBack(back).openBlockingFindings).toBe(1);
  });
});

describe("duplicate RMES rows (BR-063)", () => {
  it("keeps the OLDEST live row; voided rows are ignored; the newer ones are to be voided (never deleted)", () => {
    const a = vm({ _id: "F5new", _created_at: "2026-10-05T08:00:00Z" });
    const b = vm({ _id: "F5old", _created_at: "2026-10-03T08:00:00Z" });
    const v = vm({ _id: "F5void", _created_at: "2026-10-01T08:00:00Z", RMES_Voided: "Yes" });
    const p = planDuplicates([a, v, b]);
    expect(p.keep?._id).toBe("F5old");
    expect(p.duplicates.map((x) => x._id)).toEqual(["F5new"]);
    expect(planDuplicates([v]).keep).toBeNull();
    expect(VOID_PATCH.fields).toEqual({ RMES_Voided: "Yes" });
  });
});

describe("soft lock (advisory, 30 minutes)", () => {
  const me = { Name: "Jo Weber", Email: "jo@example.test" };
  const at = (min: number) => new Date(NOW.getTime() - min * 60000).toISOString().replace(/\.\d{3}Z$/, "Z");
  it("free / mine / held by someone else < 30 min (read-only, Take over) / stale ≥ 30 min / stale without a time", () => {
    expect(lockState({ editingBy: "", editingSince: "" }, me, NOW).kind).toBe("free");
    expect(lockState({ editingBy: "Jo Weber (jo@example.test)", editingSince: at(5) }, me, NOW).kind).toBe("mine");
    const held = lockState({ editingBy: "Sam Okafor (sam@example.test)", editingSince: at(10) }, me, NOW);
    expect(held).toMatchObject({ kind: "held", by: "Sam Okafor (sam@example.test)" });
    expect(canEditUnder(held)).toBe(false);
    expect(lockState({ editingBy: "Sam Okafor (sam@example.test)", editingSince: at(30) }, me, NOW).kind).toBe("stale");
    expect(lockState({ editingBy: "Sam Okafor (sam@example.test)", editingSince: "" }, me, NOW).kind).toBe("stale");
    expect(canEditUnder({ kind: "stale", by: "x", since: "", minutes: 40 })).toBe(true);
  });
  it("the lock patch has no milliseconds; the release clears both fields explicitly", () => {
    expect(lockPatch(me, new Date("2026-10-08T10:00:00.789Z")).fields).toEqual({ Editing_By: "Jo Weber (jo@example.test)", Editing_Since: "2026-10-08T10:00:00Z" });
    expect(RELEASE_PATCH.fields).toEqual({ Editing_By: CLEAR, Editing_Since: CLEAR });
  });
});

describe("phase 1 patch: dirty rows only", () => {
  const r = vm({}, [crit("S-A1", { Criteria_Result: "Available" }), crit("S-A2")], [{ _id: "Safety_Findings_1", Findings_Text: "Old text", Findings_Criterion_Code: "S-A2", Findings_Blocking: "No", Findings_State: "Open" }]);
  it("modifies only changed criteria, with Recorded_By/_At and the natural key; unchanged edits are not sent", () => {
    const p = buildRowsPatch("SAF", r, { Safety_Criteria_S_A1: {}, "Safety_Criteria_S-A1": { Criteria_Result: "Available" }, "Safety_Criteria_S-A2": { Criteria_Result: "Implausible", Criteria_Comment: "Out of range." } }, [], ME, NOW);
    expect(p.tables?.Safety_Criteria).toEqual([{ kind: "modify", _id: "Safety_Criteria_S-A2", row: { Criteria_Result: "Implausible", Criteria_Comment: "Out of range.", Criteria_Recorded_By: { _id: ME._id }, Criteria_Recorded_At: "2026-10-08T10:00:00Z" }, key: { Criteria_Code: "S-A2" } }]);
    expect(p.tables?.Safety_Findings).toBeUndefined();
    expect(p.fields).toEqual({});
  });
  it("adds new findings and modifies edited ones keyed by their natural key as read", () => {
    const p = buildRowsPatch(
      "SAF",
      r,
      {},
      [
        { _id: "Safety_Findings_1", key: { Findings_Criterion_Code: "S-A2", Findings_Text: "Old text" }, values: { Findings_Text: "Old text", Findings_Criterion_Code: "S-A2", Findings_Blocking: "Yes", Findings_State: "Open", Findings_Linked_OP_Key: "" } },
        { values: { Findings_Text: "Heavy metals not reported", Findings_Criterion_Code: "S-A1", Findings_Blocking: "Yes", Findings_State: "Open", Findings_Linked_OP_Key: "" } },
      ],
      ME,
      NOW,
    );
    expect(p.tables?.Safety_Findings).toEqual([
      { kind: "modify", _id: "Safety_Findings_1", row: { Findings_Blocking: "Yes" }, key: { Findings_Criterion_Code: "S-A2", Findings_Text: "Old text" } },
      { kind: "add", row: { Findings_Text: "Heavy metals not reported", Findings_Criterion_Code: "S-A1", Findings_Blocking: "Yes", Findings_State: "Open" } },
    ]);
  });
  it("client rules: an override reason when not applicable; a comment unless Available/Plausible/Listed", () => {
    expect(criterionProblems("S-A1", { Criteria_Applicable: "No" })).toHaveLength(1);
    expect(criterionProblems("S-A1", { Criteria_Result: "Implausible" })).toHaveLength(1);
    expect(criterionProblems("S-A1", { Criteria_Result: "Implausible", Criteria_Comment: "Supplier re-tests." })).toEqual([]);
    expect(criterionProblems("S-A1", { Criteria_Result: "Listed" })).toEqual([]);
    expect(criterionProblems("S-A1", {})).toEqual([]);
  });
});

describe("create seed", () => {
  const c = toCaseVM({ _id: "PkC4", Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, RMES_Key: "CIQ-2026-PkC4-C1-RMES", Completeness_At: "2026-10-02T09:00:00Z" } as RawItem, "full");
  const criteria = [
    { code: "S-A1", part: "A", title: "Identity", dept: "SAF" as const },
    { code: "R-B1", part: "B", title: "Annex listing", dept: "REG" as const },
  ];
  it("RMES_Key = case RMES_Key + -SAF; Result_Case reference; criteria of the department only", () => {
    expect(seedRmesData(c, "SAF", criteria)).toEqual({ RMES_Key: "CIQ-2026-PkC4-C1-RMES-SAF", Result_Case: { _id: "PkC4" }, Case_Item_Id: "PkC4", Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, Safety_Criteria: [{ Criteria_Code: "S-A1", Criteria_Part: "A", Criteria_Title: "Identity" }] });
    // F7: a part outside CIQ_RMES_Part (A-D) is never sent
    expect((seedRmesData(c, "SAF", [{ code: "S-X", part: "E", title: "Odd", dept: "SAF" }]).Safety_Criteria as Record<string, unknown>[])[0].Criteria_Part).toBeUndefined();
  });
  it("only after PS-05 (Completeness_At set)", () => {
    expect(createBlockers(c, criteria)).toEqual([]);
    expect(createBlockers(toCaseVM({ _id: "PkC3", Case_Code: "CIQ-2026-PkC3" } as RawItem), criteria)[0]).toMatch(/not confirmed completeness/);
  });
});

describe("two-phase save with a fake host (§8.11)", () => {
  function setup(script = {}) {
    const c = fakeClient({ script });
    c.forms.set(F5, [row({ Open_Criteria_Count: null }, [crit("S-A1"), crit("S-A2")])]);
    const rt = fakeRuntime(c);
    return { c, a: createActions(rt) };
  }
  it("phase 1 writes Table:: rows and verifies them; phase 2 writes the header from the read-back (childFormula off: blanks counted open)", async () => {
    const { c, a } = setup();
    const current = toRmesVM(c.forms.get(F5)![0], F5, "full");
    const patch = buildRowsPatch("SAF", current, { "Safety_Criteria_S-A1": { Criteria_Result: "Available" } }, [], ME, NOW);
    const out = await saveRmesTwoPhase(a, "SAF", "F5a", patch, () => c.formGet(F5, "F5a"));
    expect(out.ok).toBe(true);
    const updates = c.ops("formUpdate");
    expect(updates).toHaveLength(2);
    expect(Object.keys(updates[0].data!)).toEqual(["Table::Safety_Criteria"]);
    expect(updates[1].data).toEqual({ Open_Criteria_Count: 2, Open_Blocking_Findings_Count: 0 });
    expect(out.warnings).toHaveLength(2); // the fake host computes no child formula (harness childFormula=off)
    expect(c.forms.get(F5)![0]).toMatchObject({ Open_Criteria_Count: 2 });
  });
  it("phase 2 refused → 'rows saved; header counts not updated' (the rows stay saved)", async () => {
    const { c, a } = setup({ formUpdate: (_c: unknown, n: number) => (n >= 2 ? { error: "validation failed" } : undefined) });
    const current = toRmesVM(c.forms.get(F5)![0], F5, "full");
    const out = await saveRmesTwoPhase(a, "SAF", "F5a", buildRowsPatch("SAF", current, { "Safety_Criteria_S-A2": { Criteria_Applicable: "No", Criteria_Override_Reason: "Not relevant for this material." } }, [], ME, NOW), () => c.formGet(F5, "F5a"));
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/^Rows saved; header counts not updated/);
    expect(out.phase1?.ok).toBe(true);
  });
  it("no dirty row: phase 1 is skipped and the header is recounted from a fresh read", async () => {
    const { c, a } = setup();
    const out = await saveRmesTwoPhase(a, "SAF", "F5a", { fields: {} }, () => c.formGet(F5, "F5a"));
    expect(out.ok).toBe(true);
    expect(out.phase1).toBeUndefined();
    expect(c.ops("formUpdate")).toHaveLength(1);
  });
});
