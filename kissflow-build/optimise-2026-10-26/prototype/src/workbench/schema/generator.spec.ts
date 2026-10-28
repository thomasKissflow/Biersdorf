// The schema generator (§4): guards 1–12 fail the build when false; generated.ts has no drift from the spec.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSchema, generate, OUT, readSpec, renderTs, ROLE_ALIGN, SchemaGuardError } from "../../../scripts/gen-workbench-schema.mjs";

const { spec, sha256, revision } = readSpec();
const clone = () => JSON.parse(JSON.stringify(spec));
const expectGuard = (n: number, mutate: (s: any) => void) => {
  const s = clone();
  mutate(s);
  expect(() => buildSchema(s, { sha256, revision })).toThrow(new RegExp(`schema guard ${n} failed`));
};

describe("generated.ts", () => {
  it("is committed and has no drift from runs/current/app-spec.json (the --check of build:workbench)", () => {
    expect(readFileSync(OUT, "utf8")).toBe(generate());
  });
  it("names spec revision 31 and the spec sha256 in its header", () => {
    expect(revision).toBe(31);
    expect(readFileSync(OUT, "utf8").split("\n")[1]).toContain(`sha256 ${sha256}`);
  });
  it("never reads spec.forms (a spec without it generates the same schema)", () => {
    const s = clone();
    delete s.forms;
    expect(renderTs(buildSchema(s, { sha256, revision }))).toBe(renderTs(buildSchema(spec, { sha256, revision })));
  });
});

describe("generator guards (§4.3)", () => {
  it("1 CIQ_OP_Outcome = [Accepted, Withdrawn]", () => expectGuard(1, (s) => s.data_model.flows.CIQ_OP_Outcome.items.push("Rejected")));
  it("2 CIQ_Event_Category has 17 items incl. Final PDF", () => expectGuard(2, (s) => (s.data_model.flows.CIQ_Event_Category.items = s.data_model.flows.CIQ_Event_Category.items.filter((x: string) => x !== "Final PDF"))));
  it("3 CIQ_Round_Outcome exists", () => expectGuard(3, (s) => delete s.data_model.flows.CIQ_Round_Outcome));
  it("4 Case 125, OP 53, CR 49 fields", () => expectGuard(4, (s) => s.data_model.flows.CIQ_Open_Point_A00.fields.pop()));
  it("5 every 'X – Y' step name uses U+2013", () => expectGuard(5, (s) => (s.workflow.processes.CIQ_Open_Point_A00.steps[2].name = "Review - Regulatory")));
  it("6 field_permissions equals security_handoff.items", () => expectGuard(6, (s) => (s.security.field_permissions.CIQ_Case_A00.CASE_S1.Trade_Name = "Editable")));
  it("7 every field named in field_permissions exists in data_model", () =>
    expectGuard(7, (s) => {
      s.security.field_permissions.CIQ_Case_A00.CASE_S1.No_Such_Field = "ReadOnly";
    }));
  it("8 no Start/UserTask step is missing from field_permissions", () =>
    expectGuard(8, (s) => {
      delete s.security.field_permissions.CIQ_Case_A00.CASE_S7;
      s.workflow.meta.security_handoff.items = s.workflow.meta.security_handoff.items.filter((i: any) => i.step !== "CASE_S7");
    }));
  it("9 every formula field is computed and in no STEPS.perms", () => {
    const schema = buildSchema(spec, { sha256, revision });
    for (const st of Object.values(schema.STEPS)) for (const k of Object.keys(st.perms)) expect(k).not.toMatch(/_Gate$|^Open_Num$|^Start_Gate$|^CR_Open_Num$|^Hold_For_Open_Items$/);
    expectGuard(9, (s) => {
      // a formula on a field that is Editable at a step (Late_Completions_Text is Editable at S5/S8)
      s.data_model.flows.CIQ_Case_A00.fields.find((f: any) => f.id === "Late_Completions_Text").formula = "IF(1=1,\"x\",\"y\")";
    });
  });
  it("10 CR_DEPT_FIELDS: exactly REG, SAF, QM, MIC, SUS; no RMM; every id exists", () => {
    const schema = buildSchema(spec, { sha256, revision });
    expect(Object.keys(schema.CR_DEPT_FIELDS)).toEqual(["REG", "SAF", "QM", "MIC", "SUS"]);
    // rename QM_Assessed_At everywhere (field count and permissions stay consistent): only guard 10 can catch it
    const renamed = JSON.parse(JSON.stringify(spec).split('"QM_Assessed_At"').join('"QM_Assessed_Time"'));
    expect(() => buildSchema(renamed, { sha256, revision })).toThrow(/schema guard 10 failed/);
  });
  it("11 POST_CREATE_KEYS ⊆ mandatoryAt(CASE_S0)", () =>
    expectGuard(11, (s) => {
      s.security.field_permissions.CIQ_Case_A00.CASE_S0.Request_Key = "Editable";
      const it = s.workflow.meta.security_handoff.items.find((i: any) => i.step === "CASE_S0");
      it.Mandatory = it.Mandatory.filter((x: string) => x !== "Request_Key");
      it.Editable.push("Request_Key");
    }));
  it("12 ADMIN_WRITE_ALLOW holds only lane.repair, within LANE_FIELDS, without counts", () => {
    const schema = buildSchema(spec, { sha256, revision });
    expect(Object.keys(schema.ADMIN_WRITE_ALLOW)).toEqual(["lane.repair"]);
    for (const [d, fields] of Object.entries(schema.ADMIN_WRITE_ALLOW["lane.repair"].fields)) {
      for (const f of fields) expect(schema.LANE_FIELDS[d]).toContain(f);
      expect(fields.some((f) => /_Open_Count$|_RMES_Gaps$/.test(f))).toBe(false);
    }
  });
  it("throws SchemaGuardError (not a generic error)", () => {
    const s = clone();
    s.data_model.flows.CIQ_OP_Outcome.items = ["Accepted"];
    expect(() => buildSchema(s)).toThrow(SchemaGuardError);
  });
});

describe("generated content", () => {
  const schema = buildSchema(spec, { sha256, revision });
  it("SWITCHES match the hand-written expectation: Case reject S1,S2,S3,S5,S7,S8; OP send-back on R_*; nothing on CR", () => {
    const on = (k: "reject" | "sendBack") =>
      Object.entries(schema.SWITCHES)
        .filter(([, v]) => v[k])
        .map(([s]) => s)
        .sort();
    expect(on("reject")).toEqual(["CASE_S1", "CASE_S2", "CASE_S3", "CASE_S5", "CASE_S7", "CASE_S8"]);
    expect(on("sendBack")).toEqual(["OPNT_R_MIC", "OPNT_R_QM", "OPNT_R_REG", "OPNT_R_RMM", "OPNT_R_SAF", "OPNT_R_SUS"]);
  });
  it("gates: CASE_B_SAF → SAF_Gate, CASE_S5 → Open_Items_Gate_Release, OPNT_S0 → Start_Gate", () => {
    expect(schema.STEPS.CASE_B_SAF.gates).toEqual(["SAF_Gate"]);
    expect(schema.STEPS.CASE_S5.gates).toEqual(["Open_Items_Gate_Release"]);
    expect(schema.STEPS.OPNT_S0.gates).toEqual(["Start_Gate"]);
  });
  it("fieldAssigned: CASE_S1 ← Owner_RMM, OPNT_S1 ← Responsible_User", () => {
    expect(schema.STEPS.CASE_S1.fieldAssigned).toBe("Owner_RMM");
    expect(schema.STEPS.OPNT_S1.fieldAssigned).toBe("Responsible_User");
  });
  it("LANE_FIELDS.SAF: the non-computed lane step fields", () => {
    expect(schema.LANE_FIELDS.SAF).toEqual(["SAF_Review_Confirm", "SAF_Completed_By", "SAF_Completed_By_Email", "SAF_Completed_At", "SAF_On_Behalf_Of", "SAF_RMES_Decision", "SAF_RMES_Decision_Reason", "SAF_Open_Count", "SAF_RMES_Gaps"]);
  });
  it("server ids stay null without a read-back; --readback merges roles, steps and child models", () => {
    expect(schema.STEPS.CASE_S2.serverActivityId).toBeNull();
    const merged = buildSchema(spec, {
      sha256,
      revision,
      readback: { roles: { "CIQ RMM": "RoX1" }, steps: { CIQ_Case_A00: { "Scope check": "Activity_abc" } }, childModels: { CIQ_Open_Point_A00: { Rounds: "ChildRounds1" } } },
    });
    expect(merged.ROLES.ciq_rmm.serverId).toBe("RoX1");
    expect(merged.STEPS.CASE_S2.serverActivityId).toBe("Activity_abc");
    expect(merged.CHILD_TABLES.Rounds.serverModelId).toBe("ChildRounds1");
  });
});

describe("role alignment (guard 13): prototype names, legacy names, live ids, new read-only roles", () => {
  const roleAlignment = JSON.parse(readFileSync(ROLE_ALIGN, "utf8"));
  const withRoles = (ra = roleAlignment, readback?: unknown) => buildSchema(spec, { sha256, revision, roleAlignment: ra, readback });
  it("display name = prototype name, legacyName = spec name, serverId = live id; technical roles flagged", () => {
    const s = withRoles();
    expect(s.ROLES.ciq_safety_reviewer).toMatchObject({ name: "Product Safety reviewer", legacyName: "CIQ Safety Reviewer", persona: "saf", technical: false, serverId: "RoEKl84xAFRW" });
    expect(s.ROLES.ciq_case_admin).toMatchObject({ persona: null, technical: true });
    expect(s.ROLES.admin).toMatchObject({ name: "Admin", legacyName: null, persona: null, technical: false });
  });
  it("the 3 new roles exist and copy the Auditor's (ciq_reader) grants", () => {
    const s = withRoles();
    for (const r of ["ciq_customs", "ciq_legal", "ciq_business_owner"]) {
      expect(s.ROLES[r].serverId).toMatch(/^Ro/);
      expect(s.GRANTS[r]).toEqual(s.GRANTS.ciq_reader);
    }
  });
  it("a read-back by legacy name merges; a read-back id that differs from the aligned id fails", () => {
    expect(withRoles(roleAlignment, { roles: { "CIQ RMM": "RoEKl83f9jPF", User: "RoU1" } }).ROLES.user.serverId).toBe("RoU1");
    expect(() => withRoles(roleAlignment, { roles: { "CIQ RMM": "RoOther" } })).toThrow(/schema guard 13 failed/);
  });
  it("fails when a spec role matches neither the aligned name nor its legacyName, or a new role has no grantsLike", () => {
    const ra = JSON.parse(JSON.stringify(roleAlignment));
    ra.roles.find((r: { ir: string }) => r.ir === "ciq_rmm").legacyName = "CIQ Something";
    expect(() => withRoles(ra)).toThrow(/schema guard 13 failed/);
    const rb = JSON.parse(JSON.stringify(roleAlignment));
    delete rb.roles.find((r: { ir: string }) => r.ir === "ciq_legal").grantsLike;
    expect(() => withRoles(rb)).toThrow(/schema guard 13 failed/);
  });
});
