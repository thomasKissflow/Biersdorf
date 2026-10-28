// What a metadata answer saves in the live portal (28 Oct, matrix v0.6): the pre-fill of FLD-A2-101 when Annex 2
// opens (M9) and no dropped question (K12). Fixture: the fictional ZZT-0001 request (empty start, fill in the CIQ).
import { describe, expect, it } from "vitest";
import type { ConfigAnswers } from "@/domain/types";
import { configPatch } from "./configSave";
import { PORTAL_USERS, loadedFor } from "./fixtures";
import { emptyNotes, groupBundles, toSupplierSide } from "./map";

const me = { id: PORTAL_USERS.elena._id, name: PORTAL_USERS.elena.Name, email: PORTAL_USERS.elena.Email };
const side = toSupplierSide(groupBundles(loadedFor(me.id)), me, emptyNotes());
const c = side.cases.find((x) => x.id === "ZZT-0001")!;
const x = side.extras.get("ZZT-0001")!;

describe("configPatch", () => {
  it("answering SF-01 = Vegetable opens Annex 2 and saves FLD-A2-101 with the main INCI, in the same save", () => {
    expect(c.answers["FLD-A2-101"]).toBeUndefined();
    expect(configPatch(c, x, side.config, { SF01: ["vegetable"] })).toEqual({ config: { SF01: ["vegetable"] }, set: { "FLD-A2-101": c.inci } });
  });

  it("never over a value still waiting to be saved, nor over a stored or cleared one", () => {
    expect(configPatch(c, x, side.config, { SF01: ["vegetable"] }, { "FLD-A2-101": "Olive oil (typed)" })).toEqual({ config: { SF01: ["vegetable"] } });
    const cleared = { ...c, answers: { ...c.answers, "FLD-A2-101": null }, answeredBy: { ...c.answeredBy, "FLD-A2-101": { by: me.id, at: "2026-10-28T09:00:00Z" } } };
    expect(configPatch(cleared, x, side.config, { SF01: ["vegetable"] })).toEqual({ config: { SF01: ["vegetable"] } });
  });

  it("an answer that opens no pre-filled section saves the answer only", () => {
    expect(configPatch(c, x, side.config, { SF01: ["mineral"] })).toEqual({ config: { SF01: ["mineral"] } });
  });

  it("leaves out the dropped questions (SF-02, SF-08) and Beiersdorf's SF-11", () => {
    expect(configPatch(c, x, side.config, { SF02: true, SF08: true, SF11: ["UK"] } as unknown as ConfigAnswers)).toEqual({ config: {} });
    expect(configPatch(c, x, side.config, { SF03: true, SF08: false } as unknown as ConfigAnswers)).toEqual({ config: { SF03: true } });
  });
});
