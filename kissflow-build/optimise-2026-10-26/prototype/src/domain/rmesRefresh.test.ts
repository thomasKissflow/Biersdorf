// A late RMES criterion reopens the completed department that owns it (round-2 review, REQ-RMES-006): a vegetable
// origin added in review after Regulatory completed opens Annex 1 (led by Sustainability) and brings Regulatory's
// pesticide criterion R-C1. (In final-release the questionnaire is locked since Thomas, 15 Oct.)
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { reviewBlockers } from "./selectors";
import { PLAIN_CONFIG, Scenario } from "./testkit";

describe("refreshRmes", () => {
  it("reopens a completed Regulatory review when its criterion now applies, and blocks it until recorded", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["animal"] }).fillMandatory().confirm();
    sc.rmes("REG", "u-reg").decision("REG", "u-reg", "approved").complete("REG", "u-reg");
    expect(sc.c.phase).toBe("review");
    expect(sc.c.rmes!.criteria.some((x) => x.id === "R-C1")).toBe(false);
    const regMails = sc.mails("review-assigned").filter((m) => m.to.includes("u-reg")).length;

    sc.step("vegetable added after Regulatory completed", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF01: ["animal", "vegetable"] }, at));
    expect(sc.c.rmes!.criteria.find((x) => x.id === "R-C1")?.result).toBeUndefined();
    expect(sc.track("REG")!.status).toBe("reopened");
    expect(sc.mails("review-assigned").filter((m) => m.to.includes("u-reg")).length).toBe(regMails + 1);
    expect(sc.c.phase).toBe("review");
    expect(reviewBlockers(sc.c, "REG").some((b) => b.includes("Pesticide analysis"))).toBe(true);

    sc.refused("REG cannot complete with the criterion open", (s, at) => A.completeReview(s, "u-reg", sc.id, "REG", at));
    sc.rmes("REG", "u-reg").complete("REG", "u-reg");
    expect(sc.track("REG")!.status).toBe("completed");
  });

  it("leaves an open review alone (Safety already reopened by its own late section)", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["animal"] }).fillMandatory().confirm();
    sc.step("mineral oil in review", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF07: true }, at));
    expect(sc.c.rmes!.criteria.some((x) => x.id === "S-C2")).toBe(true);
    expect(sc.track("SAF")!.status).not.toBe("completed");
  });
});

describe("points closed by a cancellation", () => {
  it("say they were withdrawn with the case, not that no answer was needed", async () => {
    const { pointResult } = await import("./finalDocument");
    const { pointOutcome } = await import("@/features/review/lib");
    const sc = new Scenario().create().metadata().fillMandatory().confirm();
    sc.raise("REG", "u-reg");
    const op = sc.op().id;
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Project paused by the brand team", at));
    expect(pointResult(sc.op(op))).toBe("Withdrawn with the case cancellation");
    expect(pointOutcome(sc.s, sc.op(op))).toMatch(/^Withdrawn with the case cancellation by /);
  });
});
