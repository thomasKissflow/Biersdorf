import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { REVIEW_TRACK_DEPTS, fieldsOf } from "@/domain/catalog";
import { buildRichFixture } from "@/domain/richFixture";
import { buildSeed } from "@/domain/seed";
import { reviewBlockers } from "@/domain/selectors";
import { Scenario } from "@/domain/testkit";
import { blockerItems, changeMarkers, joinNames, pointCounts, pointOutcome, pointPermissions, queueAlert, queueRows, reassignCandidates } from "./lib";

describe("My reviews", () => {
  it("is empty for every review lane on the empty start", () => {
    const s = buildSeed();
    for (const d of REVIEW_TRACK_DEPTS) {
      expect(queueRows(s, d)).toEqual({ todo: [], waiting: [], done: [] });
      expect(queueAlert(s, d)).toMatchObject({ answered: 0, overdue: 0 });
    }
  });

  it("lists RMM's own review next to the departments' as soon as completeness is confirmed", () => {
    const sc = new Scenario().create();
    for (const d of REVIEW_TRACK_DEPTS) expect(queueRows(sc.s, d).todo).toEqual([]);
    sc.metadata().fillMandatory().confirm();
    for (const d of sc.c.reviews.map((r) => r.dept)) expect(queueRows(sc.s, d).todo.map((r) => r.c.id)).toEqual([sc.id]);
    expect(queueRows(sc.s, "RMM").todo).toHaveLength(1);
  });

  it("moves a case to Waiting for supplier and back, and counts the answers to check in one alert", () => {
    const sc = new Scenario().toReview();
    sc.raise("REG", "u-reg");
    const op = sc.op().id;
    expect(queueRows(sc.s, "REG")).toMatchObject({ todo: [], waiting: [{ c: { id: sc.id } }] });
    // on the scenario's clock, not the real one (the scenario's due dates are in October 2026)
    expect(pointCounts(sc.c, "REG", sc.now())).toEqual({ open: 1, answered: 0, overdue: 0 });
    sc.answer(op);
    expect(queueRows(sc.s, "REG").todo.map((r) => r.c.id)).toEqual([sc.id]);
    expect(queueAlert(sc.s, "REG", sc.now())).toMatchObject({ answered: 1, answeredTab: "todo", overdue: 0 });
    // returned to the supplier: overdue once its due date has passed
    sc.decide(op, "u-reg", "return", "Please add the batch number.");
    const dayAfterDue = new Date(Date.parse(sc.op(op).dueDate) + 86_400_000).toISOString();
    expect(queueAlert(sc.s, "REG", dayAfterDue)).toMatchObject({ answered: 0, overdue: 1, overdueTab: "waiting" });
  });

  it("keeps completed reviews under Completed, closed cases included", () => {
    const sc = new Scenario().toReview().completeAll().release();
    expect(sc.c.phase).toBe("completed");
    for (const r of sc.c.reviews) expect(queueRows(sc.s, r.dept)).toMatchObject({ todo: [], waiting: [], done: [{ c: { id: sc.id } }] });
  });
});

describe("completion bar blockers", () => {
  it("names type, reference, status and the responsible person of each open point, and mirrors the domain gate", () => {
    const sc = new Scenario().toReview();
    sc.raise("REG", "u-reg", "K1", "Please confirm the CoA batch number.", { responsibleId: "u-reg" });
    const items = blockerItems(sc.s, sc.c, "REG");
    expect(items).toHaveLength(reviewBlockers(sc.c, "REG").length);
    expect(items[0]).toMatchObject({ key: sc.op().id, target: { kind: "point", opId: sc.op().id, sectionId: "K1" } });
    expect(items[0].text).toMatch(/query on K1 › specification · with the supplier · responsible Dr\. Jonas Albrecht$/);
    // besides the point, only the decision (the RMES needs no input), which leads to the decision card
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ key: "decision", text: "The Regulatory decision (Approved or Rejected) is not recorded yet", target: { kind: "decision" } });
    expect(blockerItems(sc.s, sc.c, "RMM")).toEqual([]);
  });

  it("never lists legacy RMES criteria or findings (BDF's RMES scope, 28 Oct), with or without an RMES record", () => {
    const sc = new Scenario().toReview();
    const legacy = {
      ...sc.c,
      rmes: {
        ...sc.c.rmes!,
        criteria: [{ id: "S-B1", part: "B" as const, dept: "SAF" as const, title: "Legacy criterion", source: { sectionId: "K4.1", version: 1, label: "K4.1" } }],
        findings: [{ id: "F-1", criterionId: "S-B1", dept: "SAF" as const, text: "Legacy finding", blocking: true, status: "open" as const }],
      },
    };
    const decision = { key: "decision", text: "The Safety decision (Approved or Rejected) is not recorded yet", target: { kind: "decision" } };
    expect(blockerItems(sc.s, legacy, "SAF")).toEqual([decision]);
    expect(blockerItems(sc.s, { ...sc.c, rmes: undefined }, "SAF")).toEqual([decision]);
    sc.decision("SAF", "u-saf", "approved");
    expect(blockerItems(sc.s, { ...legacy, reviews: sc.c.reviews }, "SAF")).toEqual([]);
  });

  it("is empty once the track may complete", () => {
    const sc = new Scenario().toReview();
    sc.decision("SAF", "u-saf", "approved");
    expect(blockerItems(sc.s, sc.c, "SAF")).toEqual([]);
    expect(reviewBlockers(sc.c, "SAF")).toEqual([]);
  });
});

describe("open points: only the raiser acts (AS-08)", () => {
  it("gives decide, edit and close to the raiser only, and nothing once the track is not open", () => {
    const sc = new Scenario().toReview();
    sc.raise("REG", "u-reg");
    const op = sc.op();
    expect(pointPermissions(sc.s, "u-reg", sc.c, op, true)).toMatchObject({ raiserId: "u-reg", raiserName: "Dr. Jonas Albrecht", decide: false, edit: true, close: true });
    sc.answer(op.id);
    expect(pointPermissions(sc.s, "u-reg", sc.c, sc.op(op.id), true)).toMatchObject({ decide: true, edit: true, close: true });
    for (const other of ["u-rmm", "u-saf", "u-cus", "u-admin", "u-sup-1"]) expect(pointPermissions(sc.s, other, sc.c, sc.op(op.id), true)).toMatchObject({ decide: false, edit: false, close: false });
    expect(pointPermissions(sc.s, "u-reg", sc.c, sc.op(op.id), false)).toMatchObject({ decide: false, edit: false, close: false });
  });

  it("words how a point ended", () => {
    const sc = new Scenario().toReview();
    sc.raise("REG", "u-reg");
    const op = sc.op().id;
    sc.step("withdraw", (s, at) => A.closeOpenPoint(s, "u-reg", sc.id, op, "Covered by the SDS", at));
    expect(pointOutcome(sc.s, sc.op(op))).toMatch(/^Closed, no answer needed by Dr\. Jonas Albrecht on \d+ \w+ 2026$/);
    sc.raise("REG", "u-reg");
    const op2 = sc.op().id;
    sc.answer(op2).decide(op2, "u-reg", "accept");
    expect(pointOutcome(sc.s, sc.op(op2))).toMatch(/^Accepted by Dr\. Jonas Albrecht/);
  });
});

describe("changed since your review", () => {
  it("marks sections the supplier changed after completeness, then after the reviewer's completion", () => {
    const sc = new Scenario().toReview();
    expect(changeMarkers(sc.c, "QM")).toMatchObject({ sections: [], sinceLabel: "since the completeness confirmation" });
    const f = fieldsOf("K1", sc.c.templateVersion)[0];
    const upload = (by: string, name: string) => (s: typeof sc.s, at: string) => A.uploadDocument(s, by, sc.id, { name, kind: "SDS", sectionId: "K1", fieldId: f.id }, at).state;
    sc.step("supplier adds a newer SDS", upload("u-sup-1", "SDS_2026-10.pdf"));
    expect(changeMarkers(sc.c, "QM").sections).toContain("K1");
    sc.complete("QM", "u-qm");
    const m = changeMarkers(sc.c, "QM");
    expect(m.sections).toEqual([]);
    expect(m.sinceLabel).toMatch(/^since you completed on \d+ \w+ 2026$/);
    sc.step("supplier adds another SDS", upload("u-sup-2", "SDS_2026-11.pdf"));
    expect(changeMarkers(sc.c, "QM").sections).toEqual(["K1"]);
  });
});

describe("reassign within the department", () => {
  it("has nobody to hand over to with one person per role, and the colleague in the rich data", () => {
    const sc = new Scenario().toReview();
    expect(reassignCandidates(sc.s, sc.c, "REG")).toEqual([]);
    const rich = buildRichFixture();
    const c = rich.cases.find((x) => x.reviews.some((r) => r.dept === "REG" && r.assigneeId === "u-reg" && r.status !== "completed"))!;
    expect(reassignCandidates(rich, c, "REG").map((u) => u.id)).toEqual(["u-reg-2"]);
  });
});

it("joins names in plain English", () => {
  expect(joinNames([])).toBe("");
  expect(joinNames(["Safety"])).toBe("Safety");
  expect(joinNames(["Safety", "Regulatory"])).toBe("Safety and Regulatory");
  expect(joinNames(["RMM", "Safety", "QM"])).toBe("RMM, Safety and QM");
});
