// T2 · CR assessment (§8.10): the patch at CHRQ_B_<D> (ids from CR_DEPT_FIELDS; by/at automatic), the options and
// the client rule; the PointList renders server-side (props only).
import { renderToString } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { assertWritable, type StepIr } from "../../schema";
import { toPointVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import { PointList } from "../points/PointList";
import { assessDeptOf, assessmentOptions, assessProblems, buildAssessPatch, prettyJson } from "./model";

describe("CR assessment patch", () => {
  const me = { _id: "UsSam" };
  it.each(["REG", "SAF", "QM", "MIC", "SUS"] as const)("%s: writable at CHRQ_B_%s; Assessed_By/_At = me, now (no ms)", (d) => {
    const p = buildAssessPatch(d, "No impact confirmed", " Checked the spec. ", me, new Date("2026-10-08T10:00:00.250Z"));
    expect(p.fields).toEqual({ [`${d}_Assessment`]: "No impact confirmed", [`${d}_Assess_Note`]: "Checked the spec.", [`${d}_Assessed_By`]: { _id: "UsSam" }, [`${d}_Assessed_At`]: "2026-10-08T10:00:00Z" });
    expect(() => assertWritable(`CHRQ_B_${d}` as StepIr, Object.keys(p.fields))).not.toThrow();
  });
  it("department from the step; options from CIQ_Impact_Resolution; an assessment is required", () => {
    expect(assessDeptOf("CHRQ_B_REG")).toBe("REG");
    expect(assessDeptOf("CHRQ_S1")).toBeNull();
    expect(assessmentOptions("REG")).toEqual(["No impact confirmed", "Re-assessed", "Finding raised"]);
    expect(assessProblems("REG", "")).toHaveLength(1);
    expect(assessProblems("REG", "Re-assessed")).toEqual([]);
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("not json")).toBe("not json");
  });
});

describe("PointList (props only)", () => {
  it("renders rows with test ids, open points first", () => {
    const pts = [
      toPointVM({ _id: "P4", _status: "Completed", OP_Key: "OP-4", OP_Kind: "Query", OP_Outcome: "Accepted", Open_Num: 0 } as RawItem),
      toPointVM({ _id: "P1", _status: "In progress", OP_Key: "OP-1", OP_Kind: "Query", OP_To_Supplier: "Yes", Open_Num: 1 } as RawItem),
    ];
    // the OP key is a real link (UX-07), so the list renders inside a router, as in the app
    const routed = (el: ReactElement) => renderToString(createElement(MemoryRouter, null, el));
    const html = routed(createElement(PointList, { points: pts, onOpen: () => {} }));
    expect(html).toContain('data-testid="wb-points"');
    expect(html.indexOf("wb-point-row-P1")).toBeLessThan(html.indexOf("wb-point-row-P4"));
    expect(html).toMatch(/<a [^>]*href="\/points\/P1"[^>]*>OP-1<\/a>/);
    expect(routed(createElement(PointList, { points: [], onOpen: () => {} }))).toContain("No open points");
  });
});
