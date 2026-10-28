import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { PLAIN_CONFIG, Scenario } from "@/domain/testkit";
import { METADATA_ID, buildOutline, matchesFilter, navOrder } from "./questionnaireOutline";

describe("case Questionnaire tab outline", () => {
  it("groups basic data, the metadata block, chapters and annexes in questionnaire order", () => {
    const sc = new Scenario().toReview();
    const o = buildOutline(sc.c);
    const groups = o.items.map((i) => i.group);
    expect(groups[0]).toBe("basic");
    expect(o.items[0].id).toBe("GEN");
    expect(o.items.find((i) => i.group === "metadata")?.id).toBe(METADATA_ID);
    // groups never interleave
    const order = ["basic", "metadata", "chapter", "annex"];
    expect(groups.map((g) => order.indexOf(g))).toEqual([...groups.map((g) => order.indexOf(g))].sort((a, b) => a - b));
    expect(o.counts.all).toBe(sc.c.scope.filter((s) => s.applicability !== "na").length);
    expect(o.counts.na).toBe(sc.c.scope.filter((s) => s.applicability === "na").length);
    expect(o.na.every((s) => s.applicability === "na")).toBe(true);
  });

  it("a filled case has nothing missing; documents-only sections are marked as such", () => {
    const sc = new Scenario().toReview();
    sc.step("K7 statement", (s, at) => A.uploadDocument(s, "u-sup-2", sc.id, { name: "Customs_statement.pdf", kind: "Statement", sectionId: "K7" }, at).state);
    const o = buildOutline(sc.c);
    expect(o.counts.missing).toBe(0);
    const k7 = o.items.find((i) => i.id === "K7")!;
    expect(k7.status).toBe("docs");
    expect(k7.docs).toBe(1);
    expect(o.items.filter((i) => i.status === "complete").length).toBeGreaterThan(0);
    expect(o.since).toBe(sc.c.confirmations.find((x) => x.type === "completeness")?.at);
  });

  it("while the supplier fills in, sections with missing answers are listed under Missing items", () => {
    const sc = new Scenario().create().metadata(PLAIN_CONFIG);
    const o = buildOutline(sc.c);
    const k1 = o.items.find((i) => i.id === "K1")!;
    expect(k1.status).toBe("missing");
    expect(k1.done).toBeLessThan(k1.total);
    expect(o.items.find((i) => i.id === METADATA_ID)?.status).toBe("complete");
    expect(navOrder(o, "missing")).toContain("K1");
    expect(navOrder(o, "missing").every((id) => o.items.find((i) => i.id === id)?.status === "missing")).toBe(true);
    expect(o.counts.changed).toBe(0);
  });

  it("counts unresolved open points per section", () => {
    const sc = new Scenario().toReview().raise("SAF", "u-saf", "K2.2", "Please send a second batch analysis.");
    const o = buildOutline(sc.c);
    const k22 = o.items.find((i) => i.id === "K2.2")!;
    expect(k22.ops.map((p) => p.id)).toEqual([sc.op().id]);
    expect(matchesFilter(k22, "points")).toBe(true);
    expect(o.counts.points).toBe(1);
    expect(navOrder(o, "points")).toEqual(["K2.2"]);
  });

  it("marks a change after the completeness confirmation on its own section only", () => {
    const sc = new Scenario().toReview();
    sc.step("change GEN-004", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Ingredients GmbH (Hamburg plant)", at));
    let o = buildOutline(sc.c);
    expect(o.items.find((i) => i.id === "GEN")?.changed).toBe(true);
    expect(o.items.find((i) => i.id === METADATA_ID)?.changed).toBe(false);
    expect(o.counts.changed).toBe(1);
    // a changed metadata answer marks the metadata block, not General information
    const sc2 = new Scenario().toReview();
    sc2.step("change SF-02", (s, at) => A.saveConfig(s, "u-sup-1", sc2.id, { ...PLAIN_CONFIG, SF02: true }, at));
    o = buildOutline(sc2.c);
    expect(o.items.find((i) => i.id === METADATA_ID)?.changed).toBe(true);
    expect(o.items.find((i) => i.id === "GEN")?.changed).toBe(false);
  });
});
