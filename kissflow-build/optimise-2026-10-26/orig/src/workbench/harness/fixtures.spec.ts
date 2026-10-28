// Fixture states of §11.3, built by driving the engine (so each is reachable), and fictional data only.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChildTableId, FlowId } from "../schema/generated";
import { FIXTURE_CONTACT_PEOPLE, SUPPLIERS } from "./fixtures";
import { tableKey } from "./formula";
import { HARNESS_MARKER, createHostEngine } from "./hostEngine";
import { findItem, openActs, rowsOfFlow } from "./state";
import { USERS } from "./users";

const e = createHostEngine({ user: "dev" });
const fx = e.fixtures;
const CASE: FlowId = "CIQ_Case_A00";
const OP: FlowId = "CIQ_Open_Point_A00";
const CR: FlowId = "CIQ_Change_Request_A00";
const at = (flow: FlowId, name: string) => {
  const it = findItem(e.state, flow, fx[name]);
  if (!it) throw new Error(`no fixture ${name}`);
  return { it, steps: openActs(it).map((a) => a.step).sort(), f: it.fields };
};
const audit = () => rowsOfFlow(e.state, "CIQ_Audit_Event_A00").map((r) => r.fields);

describe("cases (§11.3)", () => {
  it("C1 at S1, C2 at S2, C3 at S3", () => {
    expect(at(CASE, "C1").steps).toEqual(["CASE_S1"]);
    expect(at(CASE, "C2").steps).toEqual(["CASE_S2"]);
    expect(at(CASE, "C3").steps).toEqual(["CASE_S3"]);
  });
  it("C4 in Part 2 with REG, SAF and QM active: 3 open branch tasks on one _id, held by dev", () => {
    const c4 = at(CASE, "C4");
    expect(c4.steps).toEqual(["CASE_B_QM", "CASE_B_REG", "CASE_B_SAF"]);
    expect([c4.f.Dept_REG_Active, c4.f.Dept_SAF_Active, c4.f.Dept_QM_Active, c4.f.Dept_MIC_Active]).toEqual(["Yes", "Yes", "Yes", "No"]);
    expect(c4.it.status).toBe("InProgress");
  });
  it("C4's SAF RMES sheet is partly filled (3 of 6 criteria recorded; header from the read-back)", () => {
    const r = e.state.rows.find((x) => x.id === fx.RMES_C4_SAF)!;
    const rows = r.fields[tableKey("Safety_Criteria" as ChildTableId)] as Record<string, unknown>[];
    expect(rows.length).toBe(6);
    expect(rows.filter((x) => x.Criteria_Result).length).toBe(3);
    expect(r.fields.Open_Criteria_Count).toBe(3);
    expect(r.fields.RMES_Key).toBe(`${at(CASE, "C4").f.RMES_Key}-SAF`);
  });
  it("c4Rmes=complete (harness fixture variant): all 6 criteria recorded, header count 0", () => {
    const v = createHostEngine({ user: "dev", c4Rmes: "complete" });
    expect(v.state.rows.find((x) => x.id === v.fixtures.RMES_C4_SAF)!.fields.Open_Criteria_Count).toBe(0);
  });
  it("C5 at S5 with counts blank, REG/SAF/QM lanes completed and an F8 lane.completed snapshot each", () => {
    const c5 = at(CASE, "C5");
    expect(c5.steps).toEqual(["CASE_S5"]);
    expect(c5.f.Open_Items_Count ?? null).toBeNull();
    expect(c5.f.Hold_For_Open_Items).toBe("Yes");
    for (const d of ["REG", "SAF", "QM"]) {
      expect(c5.f[`${d}_Review_Confirm`]).toBe("Confirmed");
      expect(audit().some((a) => a.Action_Code === "lane.completed" && a.Object_Key === `${c5.f.Case_Code}:lane:${d}` && typeof a.Snapshot_JSON === "string")).toBe(true);
    }
  });
  it("C6 at S6 (overall approval required) with SAF RMES decision Rejected; C7 at S7", () => {
    const c6 = at(CASE, "C6");
    expect(c6.steps).toEqual(["CASE_S6"]);
    expect(c6.f.SAF_RMES_Decision).toBe("Rejected");
    expect(c6.f.REG_RMES_Decision).toBe("Approved");
    expect(at(CASE, "C7").steps).toEqual(["CASE_S7"]);
  });
  it("C8 at S8, reached by a NATIVE submit at S7 with Final_Release_At blank", () => {
    const c8 = at(CASE, "C8");
    expect(c8.steps).toEqual(["CASE_S8"]);
    expect(c8.f.Final_Release_At ?? null).toBeNull();
    expect(c8.it.acts.find((a) => a.step === "CASE_S7")!.how).toBe("native-submit");
  });
  it("C9 Completed (released); C10 Rejected with an F8 Cancellation row; C10 cycle 2 reactivated at S1", () => {
    expect(at(CASE, "C9").it.status).toBe("Completed");
    expect(at(CASE, "C9").f.Final_Release_At).toBeTruthy();
    const c10 = at(CASE, "C10");
    expect(c10.it.status).toBe("Rejected");
    expect(audit().some((a) => a.Event_Category === "Cancellation" && a.Case_Item_Id === fx.C10 && a.Action_Code === "case.cancel")).toBe(true);
    const b = at(CASE, "C10b");
    expect(b.steps).toEqual(["CASE_S1"]);
    expect(b.f.Case_Code).toBe(c10.f.Case_Code);
    expect(b.f.Cycle_No).toBe(2);
    expect(b.f.Reactivates_Case_Item).toBe(fx.C10);
    expect(b.f.Request_Key).toBe(`${c10.f.Case_Code}-C2-REQ`);
  });
  it("every case has Case_Code = CIQ-<yyyy>-<cycle-1 _id>, Request_Key, an F8 'Item created' row and a BASIC section", () => {
    for (const n of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"]) {
      const c = at(CASE, n);
      expect(c.f.Case_Code).toBe(`CIQ-2026-${fx[n]}`);
      expect(c.f.Request_Key).toBe(`CIQ-2026-${fx[n]}-C1-REQ`);
      expect(audit().some((a) => a.Event_Category === "Item created" && a.Case_Item_Id === fx[n] && String(a.Snapshot_JSON).includes(String(c.f.Trade_Name)))).toBe(true);
      expect(rowsOfFlow(e.state, "CIQ_Section_A00").some((s) => s.fields.Case_Item_Id === fx[n] && s.fields.Section_Key === "BASIC")).toBe(true);
    }
  });
});

describe("points and change requests (§11.3)", () => {
  it("P1 at OPNT_S1 (to supplier, SAF); P2 at R_REG with a response; P3 internal at R_SAF; P4 contact update at R_RMM", () => {
    expect(at(OP, "P1").steps).toEqual(["OPNT_S1"]);
    expect([at(OP, "P1").f.OP_Dept, at(OP, "P1").f.OP_To_Supplier, at(OP, "P1").f.Start_Gate]).toEqual(["SAF", "Yes", "OK"]);
    expect(at(OP, "P2").steps).toEqual(["OPNT_R_REG"]);
    expect(at(OP, "P2").f.Response_Text).toBeTruthy();
    expect(at(OP, "P3").steps).toEqual(["OPNT_R_SAF"]);
    expect(at(OP, "P3").f.OP_To_Supplier).toBe("No");
    expect(at(OP, "P4").steps).toEqual(["OPNT_R_RMM"]);
    expect(at(OP, "P4").f.OP_Kind).toBe("Contact update");
  });
  it("P5 Rejected (stray); P6 at R_SAF already Withdrawn (Open_Num 0); P7 Accepted Dept review newer than C6's SAF decision", () => {
    expect(at(OP, "P5").it.status).toBe("Rejected");
    expect(at(OP, "P6").steps).toEqual(["OPNT_R_SAF"]);
    expect(at(OP, "P6").f.OP_Outcome).toBe("Withdrawn");
    expect(at(OP, "P6").f.Open_Num).toBe(0);
    const p7 = at(OP, "P7");
    expect(p7.it.status).toBe("Completed");
    expect([p7.f.OP_Kind, p7.f.OP_Dept, p7.f.OP_Outcome, p7.f.Late_Decision, p7.f.Case_Item_Id]).toEqual(["Department review", "SAF", "Accepted", "Approved", fx.C6]);
    expect(String(p7.f.Reviewed_At) > String(at(CASE, "C6").f.SAF_Completed_At)).toBe(true);
  });
  it("CR1 at Triage on C4; CR2 at Assess (REG + SAF); CR3 on C9 (released); CR4 untriaged on C8", () => {
    expect(at(CR, "CR1").steps).toEqual(["CHRQ_S1"]);
    expect(at(CR, "CR1").f.Case_Code).toBe(at(CASE, "C4").f.Case_Code);
    expect(at(CR, "CR2").steps).toEqual(["CHRQ_B_REG", "CHRQ_B_SAF"]);
    expect(at(CR, "CR3").f.Case_Code).toBe(at(CASE, "C9").f.Case_Code);
    const cr4 = at(CR, "CR4");
    expect(cr4.steps).toEqual(["CHRQ_S1"]);
    expect(cr4.f.Case_Item_Id ?? null).toBeNull();
    expect([cr4.f.Case_Code, cr4.f.Cycle_No]).toEqual([at(CASE, "C8").f.Case_Code, 1]);
  });
});

describe("configuration and suppliers (§11.3)", () => {
  it("a Published Live release whose manifest hashes match the payloads, with no 'Rule set' entry", () => {
    const rel = e.state.rows.find((r) => r.id === fx.CFG_RELEASE)!.fields;
    expect([rel.Config_Kind, rel.Config_State, rel.Release_Stage]).toEqual(["Release", "Published", "Live"]);
    const manifest = JSON.parse(String(rel.Release_Manifest_JSON)) as { kind: string; itemId: string; contentHash: string }[];
    expect(manifest.some((m) => m.kind === "Rule set")).toBe(false);
    expect(new Set(manifest.map((m) => m.kind))).toEqual(new Set(["Template", "Section definition", "Section ownership", "RMES criteria", "Text bundle", "Settings"]));
    for (const m of manifest) {
      const row = e.state.rows.find((r) => r.id === m.itemId)!;
      expect(createHash("sha256").update(String(row.fields.Payload_JSON)).digest("hex")).toBe(m.contentHash);
    }
    expect(rel.Manifest_Hash).toBe(createHash("sha256").update(String(rel.Release_Manifest_JSON)).digest("hex"));
    const tpl = JSON.parse(String(e.state.rows.find((r) => r.id === fx.CFG_TEMPLATE)!.fields.Payload_JSON)) as { sections: { sectionKey: string }[] };
    expect(tpl.sections.map((s) => s.sectionKey)).toEqual(["BASIC", "GEN", "K2.1", "SAF-A", "REG-B", "SUS-1"]);
    const crit = JSON.parse(String(e.state.rows.find((r) => r.id === fx.CFG_RMES)!.fields.Payload_JSON)) as { criteria: { dept: string; part: string }[] };
    expect(crit.criteria.filter((c) => c.dept === "SAF").length).toBe(6);
    expect(crit.criteria.filter((c) => c.dept === "REG").length).toBe(6);
    expect(new Set(crit.criteria.map((c) => c.part))).toEqual(new Set(["A", "B", "C", "D"]));
    expect(e.state.rows.find((r) => r.id === fx.CFG_RULESET_DRAFT)!.fields.Config_State).toBe("Draft");
  });
  it("Settings carries countsPolicy only when the host param sets it", () => {
    const s = (q: Record<string, string>) => JSON.parse(String(createHostEngine(q).state.rows.find((r) => r.fields.Config_Kind === "Settings")!.fields.Payload_JSON)) as Record<string, unknown>;
    expect("countsPolicy" in s({})).toBe(false);
    expect(s({ countsPolicy: "attest" }).countsPolicy).toBe("attest");
  });
  it("three suppliers: Northwind (DE, 3 contacts: 2 can confirm, 1 not invited), Lumen (NL), Corvid (GB, inactive)", () => {
    const nwb = e.state.rows.find((r) => r.id === fx["SUP-NWB"])!.fields;
    const contacts = nwb[tableKey("Contacts" as ChildTableId)] as Record<string, unknown>[];
    expect([nwb.Supplier_Legal_Name, nwb.Supplier_Country_Code, contacts.length]).toEqual(["Northwind Botanicals GmbH", "DE", 3]);
    expect(contacts.filter((c) => c.Contacts_Can_Confirm === "Yes").length).toBe(2);
    expect(contacts.filter((c) => !c.Contacts_Portal_User_Id).length).toBe(1);
    expect(e.state.rows.find((r) => r.id === fx["SUP-CRV"])!.fields.Supplier_Active).toBe("No");
    expect(e.state.rows.find((r) => r.id === fx["SUP-LUM"])!.fields.Supplier_Country_Code).toBe("NL");
  });
});

describe("fictional data only (ground rule 11)", () => {
  it("every e-mail in the fixture state is @example.test", () => {
    const blob = JSON.stringify(e.snapshot());
    const emails = blob.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    expect(emails.length).toBeGreaterThan(10);
    expect(emails.filter((m) => !m.endsWith("@example.test"))).toEqual([]);
    for (const c of SUPPLIERS.flatMap((s) => s.contacts)) expect(c.email.endsWith("@example.test")).toBe(true);
    expect(FIXTURE_CONTACT_PEOPLE.length).toBe(10); // 5 contacts: name + e-mail
    for (const u of Object.values(USERS)) expect(u.Email).toBe(`${u.id}@example.test`);
  });
});

describe("harness isolation", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const wb = path.resolve(here, "..");
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(n)) out.push(p);
    }
    return out;
  };
  it("nothing outside harness/ imports the harness (the host bundle never enters the Workbench)", () => {
    const bad = walk(wb)
      .filter((p) => !p.startsWith(here + path.sep))
      .filter((p) => /from\s+["'][./]*harness\//.test(readFileSync(p, "utf8")));
    expect(bad.map((p) => path.relative(wb, p))).toEqual([]);
  });
  it("the harness imports only relative modules (esbuild bundles it without the @ alias) and only schema/ from the foundation", () => {
    for (const p of walk(here).filter((x) => !x.endsWith(".spec.ts"))) {
      const src = readFileSync(p, "utf8");
      const specs = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const s of specs) {
        expect(s.startsWith("./") || s.startsWith("../schema/"), `${path.basename(p)} imports ${s}`).toBe(true);
      }
    }
  });
  it("the host page carries the harness marker (zip-workbench.mjs refuses it in index.html)", () => {
    expect(HARNESS_MARKER).toBe("__WB_HARNESS_ONLY__");
    expect(readFileSync(path.join(here, "hostPage.ts"), "utf8")).toContain("HARNESS_MARKER");
  });
});
