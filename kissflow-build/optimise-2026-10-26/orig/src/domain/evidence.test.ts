// The evidence the rules ask for is really asked for (round-2 review): every evidence item of every rule set is
// collected at a question, the slots without a question elsewhere block completeness on live-scope cases only, and
// the uploaded files reach the final document's evidence list.
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { FIELD_BY_ID } from "./catalog";
import { EVIDENCE_FIELDS, RULE_SETS } from "./rules";
import { completenessBlockers, isVisible } from "./selectors";
import { PLAIN_CONFIG, Scenario } from "./testkit";

describe("rule evidence", () => {
  it("maps every evidence item of every rule set to existing questions", () => {
    for (const rs of RULE_SETS)
      for (const r of rs.rules)
        for (const doc of r.evidence ?? []) {
          expect(EVIDENCE_FIELDS[doc], `${rs.version} ${r.id}: ${doc}`).toBeDefined();
          for (const id of EVIDENCE_FIELDS[doc]) expect(FIELD_BY_ID[id], `${doc} → ${id}`).toBeDefined();
        }
  });

  it("an animal origin asks for statements, the BSE/TSE certificate and the Annex II 419 conformity", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["animal"] });
    const ids = completenessBlockers(sc.c).map((b) => b.fieldId);
    expect(ids).toEqual(expect.arrayContaining(["FLD-K1-004", "FLD-K1-006", "FLD-K1-007"]));
    expect(ids).not.toContain("FLD-K1-005"); // sustainability certificates: vegetable only
    sc.fillMandatory().confirm();
    sc.completeAll().release();
    const ev = sc.c.finalDocument!.evidence.map((e) => e.fieldLabel);
    expect(ev).toEqual(expect.arrayContaining(["Statements", "BSE/TSE certificate", "Conformity with Annex II entry 419"]));
  });

  it("the live portal's old flow (no liveScope) keeps its three K1 documents", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["animal"] });
    const old = { ...sc.c, liveScope: undefined };
    for (const id of ["FLD-K1-004", "FLD-K1-006", "FLD-K1-007"]) expect(isVisible(FIELD_BY_ID[id], old)).toBe(false);
    expect(completenessBlockers(old).some((b) => b.fieldId?.startsWith("FLD-K1-00") && Number(b.fieldId.slice(-1)) > 3)).toBe(false);
  });

  it("a slot can be justified instead of uploaded", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["animal"] });
    sc.step("justify BSE/TSE", (s, at) => A.setJustification(s, "u-sup-1", sc.id, "FLD-K1-006", "The tallow derivative is covered by the supplier's EDQM certificate of suitability, attached to the statements.", at));
    expect(completenessBlockers(sc.c).map((b) => b.fieldId)).not.toContain("FLD-K1-006");
  });
});
