import { describe, expect, it } from "vitest";
import { buildSeed } from "@/domain/seed";
import { buildRichFixture } from "@/domain/richFixture";
import type { CiqCase } from "@/domain/types";
import { ATTENTION_LABEL, attentionItems, rmmReviewIsMyTurn } from "./attention";

const rich = buildRichFixture();
const byId = (id: string) => rich.cases.find((c) => c.id === id)!;
const ofKind = (cases: CiqCase[], kind: string) => attentionItems(cases).filter((i) => i.kind === kind);

describe("RMM attention items (D-2: RMM reviews the whole CIQ in Part 2)", () => {
  it("is empty on the empty start", () => {
    expect(attentionItems(buildSeed().cases)).toEqual([]);
  });

  it("lists the six categories of the spec, in its order", () => {
    expect(Object.values(ATTENTION_LABEL)).toEqual(["My review", "Department rejected", "Release pending", "Overdue at supplier", "Origin without rules", "No activity"]);
  });

  it("lists RMM's own review only for cases in review whose RMM track is RMM's turn, linking to the review", () => {
    const items = ofKind(rich.cases, "rmm-review");
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.c.phase).toBe("review");
      const t = i.c.reviews.find((r) => r.dept === "RMM");
      expect(t && t.status !== "completed").toBe(true);
      expect(rmmReviewIsMyTurn(i.c)).toBe(true);
      expect(i.to).toBe(`/review/${i.c.id}`);
      expect(i.cta).toBe("Open my review");
    }
  });

  it("says when only RMM's review is left before the final-release request (0145)", () => {
    const [item] = ofKind([byId("CIQ-2026-0145")], "rmm-review");
    expect(item?.title).toBe("Only your review is left before the final-release request");
  });

  it("does not list a case whose RMM review is completed (0138)", () => {
    expect(ofKind([byId("CIQ-2026-0138")], "rmm-review")).toEqual([]);
  });

  it("flags an origin without rules (CCU, 0150) as its own informational item", () => {
    const c = byId("CIQ-2026-0150");
    const [item] = ofKind([c], "origin");
    expect(item?.title).toMatch(/Origin without rules/);
    expect(item?.tone).toBe("warn");
    expect(item?.flag).toMatch(/does not block/);
  });

  it("flags a Rejected decision (0148) until RMM chose to continue, without assumption wording", () => {
    const c = byId("CIQ-2026-0148");
    const [item] = ofKind([c], "rejected");
    expect(item?.title).toMatch(/Rejected/);
    expect(item?.to).toBe(`/review/${c.id}`);
    expect(item?.flag ?? "").not.toMatch(/AS-0|assumption|still open/i);
    const continued: CiqCase = { ...c, reviews: c.reviews.map((r) => (r.dept === "RMM" ? { ...r, continueAfterRejection: { note: "Agreed with Safety", by: "u-rmm", at: c.createdAt, depts: ["SAF"] } } : r)) };
    expect(ofKind([continued], "rejected")).toEqual([]);
  });

  it("lists every case waiting for the final release (0136, 0141)", () => {
    const items = ofKind([byId("CIQ-2026-0136"), byId("CIQ-2026-0141")], "final-release");
    expect(items.map((i) => i.c.id).sort()).toEqual(["CIQ-2026-0136", "CIQ-2026-0141"]);
  });

  it("never lists a closed case", () => {
    const closed = rich.cases.filter((c) => c.phase === "completed" || c.phase === "cancelled");
    expect(closed.length).toBeGreaterThan(0);
    expect(attentionItems(closed)).toEqual([]);
  });
});
