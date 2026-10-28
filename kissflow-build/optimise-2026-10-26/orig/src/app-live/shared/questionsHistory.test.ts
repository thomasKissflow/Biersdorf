import { describe, expect, it } from "vitest";
import { fixtureSet, loadedFor, PORTAL_USERS } from "@/portal/data/fixtures";
import { groupBundles, toSupplierSide } from "@/portal/data/map";
import { questionsHistory, statusCodeOf } from "./questionsHistory";

const fx = fixtureSet();
const c3 = fx.cases["ZZT-0003"]; // in review: an open question, a returned round and an accepted one
const nameOf = (id: string) => fx.state.users.find((u) => u.id === id)?.name ?? id;
const elena = { id: PORTAL_USERS.elena._id, name: PORTAL_USERS.elena.Name, email: PORTAL_USERS.elena.Email };

describe("questionsHistory (Questions_History_JSON for history.updated)", () => {
  it("writes every point the supplier was asked, with the stable status code", () => {
    const h = JSON.parse(questionsHistory(c3, nameOf));
    expect(h.length).toBe(c3.openPoints.filter((p) => p.rounds > 0).length);
    for (const p of h) expect(["open", "answered", "accepted", "not-accepted", "closed", "withdrawn-with-case"]).toContain(p.statusCode);
    const open = c3.openPoints.find((p) => p.status === "open")!;
    expect(h.find((p: { opId: string }) => p.opId === open.id)).toMatchObject({ statusCode: "open", status: "Waiting for your answer", question: open.question });
  });

  it("never carries internal notes or the internal close reason", () => {
    const text = questionsHistory(c3, nameOf);
    expect(text).not.toMatch(/"action":"note"/);
    for (const p of c3.openPoints) if (p.closeReason) expect(text).not.toContain(p.closeReason);
  });

  it("the portal reads it back to the same statuses (round trip through map.ts)", () => {
    const loaded = loadedFor(elena.id).map((l) => (l.item._id === "PkReq3" ? { ...l, item: { ...l.item, Questions_History_JSON: questionsHistory(c3, nameOf) } } : l));
    const side = toSupplierSide(groupBundles(loaded), elena);
    const back = side.cases.find((c) => c.id === "ZZT-0003")!;
    for (const p of c3.openPoints.filter((x) => x.rounds > 0)) {
      const got = back.openPoints.find((x) => x.id === p.id);
      expect(got, p.id).toBeTruthy();
      expect(got!.status).toBe(p.status);
    }
  });

  it("maps every closing to its code", () => {
    const base = c3.openPoints[0]!;
    expect(statusCodeOf({ ...base, status: "in-progress" })).toBe("answered");
    expect(statusCodeOf({ ...base, status: "closed", outcome: "accepted" })).toBe("accepted");
    expect(statusCodeOf({ ...base, status: "closed", outcome: "not-accepted" })).toBe("not-accepted");
    expect(statusCodeOf({ ...base, status: "closed", outcome: "withdrawn", closeReason: "Case cancelled by RMM" })).toBe("withdrawn-with-case");
    expect(statusCodeOf({ ...base, status: "closed", outcome: "withdrawn" })).toBe("closed");
  });
});
