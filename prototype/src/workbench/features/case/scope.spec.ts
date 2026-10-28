// T1 acceptance (§12.1): the S2 scope builder — department flags from leads; RMM flag from Settings; never reduce;
// Rule_Set_Version — and Save scope's idempotence (a rerun creates no duplicates).
import { describe, expect, it } from "vitest";
import { toRunVM, toSectionVM } from "../../data/map";
import type { RawItem, SaveResult } from "../../data/viewModels";
import { caseFixture, pinnedFixture, T1_ME } from "./t1.fixtures";
import {
  applicabilityOptions,
  buildRunRow,
  buildS2Fields,
  buildScope,
  buildSectionRows,
  initialRunKey,
  parseRecordedScope,
  saveScope,
  scopeConfigFrom,
  scopeFromRecorded,
  scopeRowsProblems,
  type S2Texts,
  type ScopeChoices,
  type ScopeContext,
} from "./scope";

const NOW = new Date("2026-10-08T10:00:00Z");
const none: ScopeChoices = { applicability: {}, justification: {}, deptOn: {}, deptReason: "" };
const ctx0: ScopeContext = { existingSectionKeys: new Set(["BASIC"]), activeDepts: new Set() };
const texts: S2Texts = {
  completenessTextKey: "completeness.declaration",
  completenessText: "We confirm the questionnaire is complete.",
  completenessDue: "2026-10-29",
  finalTextKey: "__manual",
  finalText: "Typed final-release text",
  finalDue: "",
  closingText: "Thank you for your answers.",
  confirmContactIds: "PuMira01",
  supplierContactEmails: "mira.castell@example.test",
};

describe("S2 scope builder (§8.5)", () => {
  it("reads the template in definition order with leads from ownership", async () => {
    const cfg = scopeConfigFrom(await pinnedFixture());
    expect(cfg.problems).toEqual([]);
    expect(cfg.sections.map((s) => `${s.sectionKey}:${s.default}:${s.lead}`)).toEqual(["BASIC:Mandatory:RMM", "GEN:Mandatory:QM", "K2.1:Mandatory:REG", "SAF-A:Mandatory:SAF", "REG-B:Optional:REG", "SUS-1:N.A.:SUS"]);
    expect(cfg.texts["completeness.declaration"]).toMatch(/complete/);
  });

  it("department flags come from the leads of non-N.A. sections only", async () => {
    const cfg = scopeConfigFrom(await pinnedFixture());
    const r = buildScope(cfg, none, ctx0);
    expect(r.depts).toEqual({ REG: "Yes", SAF: "Yes", QM: "Yes", MIC: "No", SUS: "No", RMM: "No" });
    expect(r.na).toEqual(["SUS-1"]);
    // extending SUS-1 (N.A. by default) to Optional makes SUS required; it needs a justification
    const ext = buildScope(cfg, { ...none, applicability: { "SUS-1": "Optional" } }, ctx0);
    expect(ext.depts.SUS).toBe("Yes");
    expect(ext.problems.map((p) => p.field)).toEqual(["section:SUS-1"]);
    const ok = buildScope(cfg, { ...none, applicability: { "SUS-1": "Optional" }, justification: { "SUS-1": "Palm-derived origin" } }, ctx0);
    expect(ok.problems).toEqual([]);
    expect(ok.inScope).toContain("SUS-1");
  });

  it("the RMM flag comes from Settings deptReviewMode, not from the RMM-led BASIC section", async () => {
    expect(buildScope(scopeConfigFrom(await pinnedFixture({ deptReviewMode: false })), none, ctx0).depts.RMM).toBe("No");
    expect(buildScope(scopeConfigFrom(await pinnedFixture({ deptReviewMode: true })), none, ctx0).depts.RMM).toBe("Yes");
  });

  it("never reduces: no applicability below the default, no N.A. for an existing section, no required or active department removed", async () => {
    const cfg = scopeConfigFrom(await pinnedFixture());
    expect(applicabilityOptions("Mandatory", false)).toEqual(["Mandatory"]);
    expect(applicabilityOptions("Optional", false)).toEqual(["Mandatory", "Optional"]);
    expect(applicabilityOptions("N.A.", false)).toEqual(["Mandatory", "Optional", "N.A."]);
    expect(applicabilityOptions("N.A.", true)).toEqual(["Mandatory", "Optional"]);
    const r = buildScope(cfg, { ...none, applicability: { "SAF-A": "N.A.", "REG-B": "N.A." }, deptOn: { SAF: false, QM: false } }, { existingSectionKeys: new Set(["BASIC"]), activeDepts: new Set(["MIC"]) });
    expect(r.sections.find((s) => s.sectionKey === "SAF-A")?.applicability).toBe("Mandatory");
    expect(r.sections.find((s) => s.sectionKey === "REG-B")?.applicability).toBe("Optional");
    expect(r.depts.SAF).toBe("Yes");
    expect(r.depts.QM).toBe("Yes");
    expect(r.depts.MIC).toBe("Yes"); // already active on the case: stays active
    expect(r.notes.length).toBeGreaterThanOrEqual(3);
  });

  it("adding a department beyond the leads needs a reason", async () => {
    const cfg = scopeConfigFrom(await pinnedFixture());
    const r = buildScope(cfg, { ...none, deptOn: { MIC: true } }, ctx0);
    expect(r.added).toEqual(["MIC"]);
    expect(r.problems.map((p) => p.field)).toEqual(["deptReason"]);
    expect(buildScope(cfg, { ...none, deptOn: { MIC: true }, deptReason: "Water-based raw material" }, ctx0).problems).toEqual([]);
  });

  it("Rule_Set_Version: `none (manual-wb-1)` without a Rule set entry, else <configKey>@<Version_Label>; same on the case and on F4", async () => {
    const c = caseFixture();
    for (const [o, want] of [
      [{}, "none (manual-wb-1)"],
      [{ ruleSet: true }, "rule-set-default-v3@3.2"],
    ] as const) {
      const cfg = scopeConfigFrom(await pinnedFixture(o));
      const r = buildScope(cfg, none, ctx0);
      expect(r.ruleSetVersion).toBe(want);
      expect(buildS2Fields(c, r, texts, NOW).Rule_Set_Version).toBe(want);
      expect(buildRunRow({ c, result: r, deptReason: "", inputJson: "{}", inputHash: "h", me: T1_ME, now: NOW }).Rule_Set_Version).toBe(want);
    }
  });

  it("builds the S2 Mandatory set with the keys, flags and text keys (manual text → MANUAL-<date>)", async () => {
    const c = caseFixture();
    const r = buildScope(scopeConfigFrom(await pinnedFixture()), none, ctx0);
    const f = buildS2Fields(c, r, texts, NOW);
    expect(f).toMatchObject({
      Initial_Scope_Run_Key: "CIQ-2026-PkCase01-C1-RUN1",
      Completeness_Request_Key: "CIQ-2026-PkCase01-C1-PS05",
      Final_Release_Request_Key: "CIQ-2026-PkCase01-C1-PS11",
      RMES_Key: "CIQ-2026-PkCase01-C1-RMES",
      Completeness_Text_Key: "completeness.declaration",
      Final_Release_Text_Key: "MANUAL-20261008",
      Dept_REG_Active: "Yes",
      Dept_SUS_Active: "No",
    });
    expect(f).not.toHaveProperty("Final_Release_Due_Date");
    const run = buildRunRow({ c, result: r, deptReason: "", inputJson: "{}", inputHash: "h", me: T1_ME, now: NOW });
    expect(run).toMatchObject({ Run_Key: "CIQ-2026-PkCase01-C1-RUN1", Run_No: 1, Scope_Trigger: "Initial", Evaluator_Version: "manual-wb-1", Run_At: "2026-10-08T10:00:00Z", Added_Section_Keys: "BASIC,GEN,K2.1,SAF-A,REG-B" });
    const rec = parseRecordedScope(String(run.Result_JSON))!;
    expect(rec.na).toEqual(["SUS-1"]);
    // the recorded run locks the table on a rerun
    const again = scopeFromRecorded(rec, scopeConfigFrom(await pinnedFixture()), ctx0);
    expect(again.inScope).toEqual(r.inScope);
    expect(again.depts).toEqual(r.depts);
  });
});

describe("Save scope (§8.5 S2 step 5)", () => {
  const sectionRaw = (key: string) => ({ _id: `Fm${key}`, Section_Item_Key: `CIQ-2026-PkCase01-C1-${key}`, Case_Item_Id: "PkCase01" }) as RawItem;

  async function setup() {
    const c = caseFixture();
    const cfg = scopeConfigFrom(await pinnedFixture());
    const r = buildScope(cfg, none, ctx0);
    const created: { flow: string; key: string }[] = [];
    const saved: Record<string, unknown>[] = [];
    const deps = {
      createFormRow: async (flow: string, data: Record<string, unknown>, keyField: string) => {
        created.push({ flow, key: String(data[keyField]) });
        return { itemId: `Fm${created.length}` };
      },
      saveAtStep: async (_t: unknown, p: { fields: Record<string, unknown> }): Promise<SaveResult> => {
        saved.push(p.fields);
        return { ok: true, kind: "ok", attempts: 1, item: { _id: "PkCase01" } as RawItem };
      },
    };
    const task = { key: "PkCase01|a1", flow: "CIQ_Case_A00" as const, instanceId: "PkCase01", activityInstanceId: "a1", step: "CASE_S2" as const, stepName: "Scope check", evidence: "activity" as const };
    const runRow = buildRunRow({ c, result: r, deptReason: "", inputJson: "{}", inputHash: "h", me: T1_ME, now: NOW });
    return { c, r, created, saved, deps, task, runRow, s2: buildS2Fields(c, r, texts, NOW) };
  }

  it("creates the run once, then only the missing F3 rows one at a time, then saves the S2 fields", async () => {
    const s = await setup();
    const log = await saveScope(s.deps as never, { task: s.task, c: s.c, result: s.r, runRow: s.runRow, existing: { runs: [], sections: [toSectionVM(sectionRaw("BASIC"))], complete: true }, s2Fields: s.s2 });
    expect(log.ok).toBe(true);
    expect(s.created).toEqual([
      { flow: "CIQ_Scope_Run_A00", key: "CIQ-2026-PkCase01-C1-RUN1" },
      { flow: "CIQ_Section_A00", key: "CIQ-2026-PkCase01-C1-GEN" },
      { flow: "CIQ_Section_A00", key: "CIQ-2026-PkCase01-C1-K2.1" },
      { flow: "CIQ_Section_A00", key: "CIQ-2026-PkCase01-C1-SAF-A" },
      { flow: "CIQ_Section_A00", key: "CIQ-2026-PkCase01-C1-REG-B" },
    ]);
    expect(log.skippedSections).toEqual(["CIQ-2026-PkCase01-C1-BASIC"]);
    expect(s.saved).toHaveLength(1);
  });

  it("a rerun creates no duplicates", async () => {
    const s = await setup();
    const runs = [toRunVM({ _id: "FmRun", Run_Key: initialRunKey(s.c), Case_Item_Id: "PkCase01" } as RawItem)];
    const sections = ["BASIC", "GEN", "K2.1", "SAF-A", "REG-B"].map((k) => toSectionVM(sectionRaw(k)));
    const log = await saveScope(s.deps as never, { task: s.task, c: s.c, result: s.r, runRow: s.runRow, existing: { runs, sections, complete: true }, s2Fields: s.s2 });
    expect(log.ok).toBe(true);
    expect(s.created).toEqual([]);
    expect(scopeRowsProblems(s.c, s.r, { runs, sections, complete: true })).toEqual([]);
  });

  it("refuses to create anything when the existing rows could not be read completely", async () => {
    const s = await setup();
    const log = await saveScope(s.deps as never, { task: s.task, c: s.c, result: s.r, runRow: s.runRow, existing: { runs: [], sections: [], complete: false }, s2Fields: s.s2 });
    expect(log.ok).toBe(false);
    expect(s.created).toEqual([]);
    expect(s.saved).toEqual([]);
  });

  it("each F3 row carries the definition, its hash and the run key", async () => {
    const s = await setup();
    const rows = buildSectionRows(s.c, s.r, initialRunKey(s.c));
    const saf = rows.find((x) => x.key.endsWith("SAF-A"))!;
    expect(saf.problem).toBeUndefined();
    expect(saf.row).toMatchObject({ Section_Key: "SAF-A", Section_Code: "S-A", Applicability_Label: "Mandatory", Section_Origin: "Template", Lead_Dept: "SAF", Query_Owner_Dept: "SAF", Definition_Hash: "hash-section-definition-SAF-A-v1", Scope_Run_Key: "CIQ-2026-PkCase01-C1-RUN1", Portal_Contact_Ids: "PuMira01,PuTeo01" });
    expect(rows.find((x) => x.key.endsWith("K2.1"))!.row.Co_Review_Depts).toBe("SAF");
  });
});
