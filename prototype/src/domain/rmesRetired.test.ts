// The criteria RMES is retired (BDF's e-mail of 28 Oct: the RMES is 8 fields filled from the CIQ, domain/rmesSheet.ts):
// a late scope growth no longer adds criteria or reopens a completed Safety or Regulatory review on the RMES's account.
// A completed review reopens only for its own sections (rule 1, Thomas 15 Oct): a vegetable origin added after
// Regulatory completed opens Annex 1, which Regulatory leads (matrix v0.6), so Regulatory waits for the supplier there.
// (In final-release the questionnaire is locked since Thomas, 15 Oct.)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { reviewBlockers } from "./selectors";
import { PLAIN_CONFIG, Scenario } from "./testkit";

describe("no RMES refresh in Part 2", () => {
  it("a late Annex 1 reopens Regulatory for its own section only; its decision stands and completes it again", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["animal"] }).fillMandatory().confirm();
    sc.decision("REG", "u-reg", "approved").complete("REG", "u-reg");
    const regMails = sc.mails("review-assigned").filter((m) => m.to.includes("u-reg")).length;

    sc.step("vegetable added after Regulatory completed", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF01: ["animal", "vegetable"] }, at));
    expect(sc.c.rmes).toMatchObject({ criteria: [], findings: [] });
    expect(sc.track("REG")!.status).toBe("waiting-supplier"); // Annex 1 is Regulatory's own section
    expect(sc.mails("review-assigned").filter((m) => m.to.includes("u-reg")).length).toBe(regMails + 1);
    expect(sc.c.audit.some((a) => /RMES criterion/.test(a.detail) || a.action === "Updated RMES record")).toBe(false);
    const a1 = sc.c.openPoints.find((p) => p.dept === "REG" && p.kind === "additional-part" && p.ref.sectionId === "A1")!;
    expect(reviewBlockers(sc.c, "REG")).toHaveLength(1);
    sc.answer(a1.id, "u-sup-1", "Annex 1 completed.").decide(a1.id, "u-reg", "accept");

    expect(reviewBlockers(sc.c, "REG")).toEqual([]);
    sc.complete("REG", "u-reg");
    expect(sc.track("REG")).toMatchObject({ status: "completed", decision: "approved" });
  });

  it("leaves Safety's review and the record alone when mineral oil comes late (no MOAH criterion)", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["animal"] }).fillMandatory().confirm();
    sc.step("mineral oil in review", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF07: true }, at));
    expect(sc.c.rmes).toMatchObject({ criteria: [], findings: [] });
    expect(sc.track("SAF")!.status).not.toBe("completed");
  });
});

describe("the retired criteria RMES left nothing in the shared domain (the supplier portal bundles it)", () => {
  it("no criterion title, canned AI text, finding or RMES-result text in the domain's code", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const code = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "testkit.ts")
      .map((f) => [f, readFileSync(path.join(dir, f), "utf8")] as const);
    expect(code.length).toBeGreaterThan(20);
    const retired = [
      "INCI and CAS of every component",
      "EU REACH registration status listed",
      "Status under Reg. 1223/2009 Annexes",
      "Animal testing statement available",
      "Byproducts and contaminants within BDF limits",
      "Toxicological profile available and plausible",
      "Nanomaterial status plausible",
      "MOAH value assessed against BDF threshold",
      "Pesticide analysis available or justified",
      "Listed in the chemical inventories",
      "Overall safety conclusion documented",
      "acute oral toxicity",
      "Recorded RMES result",
      "Updated RMES record",
      "RMES criteria still have no result",
      "RMES criterion without result",
      "Needed for the internal evaluation",
      "A finding is still open",
      "Open finding:",
      "Added finding",
      "Closed finding",
      "Not accepted: ",
    ];
    for (const [f, text] of code) for (const t of retired) expect(text.includes(t), `${f}: ${t}`).toBe(false);
    for (const fn of ["recordCriterion", "addFinding", "findingToQuery", "closeFinding", "rmesCriteria", "refreshRmes"]) expect(A, fn).not.toHaveProperty(fn);
  });

  it("the bundle leak scan (scripts/leak-scan.mjs RETIRED_TERMS) matches each criterion title as rmesCriteria wrote it", () => {
    const scan = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/leak-scan.mjs"), "utf8");
    const terms = [...scan.match(/export const RETIRED_TERMS = \[([\s\S]*?)\];/)![1]!.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]!);
    // the titles until 28 Oct, word for word (a scan term that is not part of one could never find it)
    const titles = [
      "INCI and CAS of every component are consistent",
      "EU REACH registration status listed for each substance",
      "Status under Reg. 1223/2009 Annexes III–VI",
      "Animal testing statement available (Art. 11(2)(e))",
      "Byproducts and contaminants within BDF limits",
      "Toxicological profile available and plausible",
      "Nanomaterial status plausible, justification given",
      "MOAH value assessed against BDF threshold",
      "Pesticide analysis available or justified",
      "Listed in the chemical inventories of all target markets",
      "Overall safety conclusion documented",
    ];
    for (const t of titles) expect(terms.filter((x) => t.includes(x)), t).toHaveLength(1);
    expect(terms.filter((x) => !titles.some((t) => t.includes(x)))).toEqual(["acute oral toxicity", "Recorded RMES result", "Needed for the internal evaluation"]);
  });
});

describe("a legacy finding question (an older version raised it from an RMES finding)", () => {
  it("reads as a query on every screen, as in the completion bar", async () => {
    const { kindLabel } = await import("@/components/status");
    expect(kindLabel("finding")).toBe("Query");
    expect(kindLabel("query")).toBe("Query");
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
