import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { checkInvariants } from "./invariants";
import { findMentions, insertMention, mentionQuery, mentionRecipients, mentionRole, mentionableUsers, noteLink, noteSegments, parseMentions, suggestMentions } from "./mentions";
import { Scenario } from "./testkit";
import { buildSeed } from "./seed";

const s0 = buildSeed();
const internal = mentionableUsers(s0);

describe("the suggestion list's role line", () => {
  it("is the title, plus the short department only when the title does not name it", () => {
    const role = (id: string) => mentionRole(internal.find((u) => u.id === id)!);
    expect(role("u-saf")).toBe("Product Safety Assessor");
    expect(role("u-mic")).toBe("Microbiologist");
    expect(role("u-reg")).toBe("Regulatory Affairs Manager");
    expect(role("u-cus")).toBe("Trade Compliance Officer · Customs");
    expect(role("u-leg")).toBe("IP Counsel · Legal");
    expect(role("u-admin")).toBe("CIQ Business Administrator");
  });
});

describe("parsing @mentions", () => {
  it("finds active internal users by their full name, with or without “Dr.”, case and accents ignored", () => {
    const text = "@Dr. Mira Hansen and @jonas albrecht, please check. cc @Lena Krause.";
    expect(parseMentions(s0, text)).toEqual(["u-saf", "u-reg", "u-qm"]);
    expect(findMentions(text, internal).map((h) => text.slice(h.start, h.end))).toEqual(["@Dr. Mira Hansen", "@jonas albrecht", "@Lena Krause"]);
  });

  it("lists each person once, first mention first", () => {
    expect(parseMentions(s0, "@Lena Krause, @Dr. Mira Hansen, again @Lena Krause and @Mira Hansen")).toEqual(["u-qm", "u-saf"]);
  });

  it("needs the @ to start a word and the name to end one", () => {
    expect(parseMentions(s0, "katrin@Katrin Vogel")).toEqual([]);
    expect(parseMentions(s0, "@Lena Krausen asked")).toEqual([]);
    expect(parseMentions(s0, "(@Lena Krause)")).toEqual(["u-qm"]);
    expect(parseMentions(s0, "@Lena")).toEqual([]);
    expect(parseMentions(s0, "No mention at all, see me @ 10.")).toEqual([]);
  });

  it("never mentions a supplier contact or an unknown name", () => {
    expect(mentionableUsers(s0).every((u) => u.side === "internal")).toBe(true);
    expect(mentionableUsers(s0)).toHaveLength(11);
    expect(parseMentions(s0, "@Elena Márquez and @Ravi Menon, and @Someone Else")).toEqual([]);
  });

  it("splits a note into text and mention chips, only for the people it records", () => {
    const note = { text: "Ask @Dr. Mira Hansen first, then @Lena Krause.", mentions: ["u-saf"] };
    expect(noteSegments(note, s0.users)).toEqual([{ text: "Ask " }, { text: "@Dr. Mira Hansen", userId: "u-saf" }, { text: " first, then @Lena Krause." }]);
    expect(noteSegments({ text: "Plain", mentions: undefined }, s0.users)).toEqual([{ text: "Plain" }]);
  });
});

describe("the composer's suggestion list", () => {
  it("opens on an @ that starts a word and filters as you type", () => {
    expect(mentionQuery("Hi @", 4, internal)).toEqual({ start: 3, caret: 4, text: "" });
    expect(suggestMentions(internal, "")).toHaveLength(11);
    expect(suggestMentions(internal, "mi").map((u) => u.id)).toEqual(["u-saf", "u-mic"]); // the name first, then "Microbiologist"
    expect(suggestMentions(internal, "safety").map((u) => u.id)).toEqual(["u-saf"]);
    expect(suggestMentions(internal, "dr. mira h").map((u) => u.id)).toEqual(["u-saf"]);
    expect(suggestMentions(internal, "elena")).toEqual([]);
    expect(mentionQuery("mail katrin@bdf", 15, internal)).toBeNull();
    expect(mentionQuery("Hi @Dr. Mira H", 14, internal)).toEqual({ start: 3, caret: 14, text: "Dr. Mira H" });
  });

  it("closes once the text after the @ no longer leads to a name", () => {
    expect(mentionQuery("at @ 5 pm", 5, internal)).toBeNull();
    expect(mentionQuery("@home office", 12, internal)).toBeNull();
    expect(mentionQuery("@Dr. Mira Hansen ", 17, internal)).toBeNull();
    expect(mentionQuery("@Dr. Mira ", 10, internal)).not.toBeNull();
    expect(mentionQuery("@Lena\nnext", 10, internal)).toBeNull();
  });

  it("inserts “@<name> ” in place of the query and puts the caret after it", () => {
    const q = mentionQuery("Please @mi check", 10, internal)!;
    expect(insertMention("Please @mi check", q, "Dr. Mira Hansen")).toEqual({ value: "Please @Dr. Mira Hansen check", caret: 24 });
    expect(insertMention("@le", { start: 0, caret: 3 }, "Lena Krause")).toEqual({ value: "@Lena Krause ", caret: 13 });
  });
});

describe("mention mails (note-mention)", () => {
  it("one internal mail per mentioned colleague: deduplicated, never the writer, never a supplier", () => {
    const sc = new Scenario().toReview();
    const before = sc.s.mails.length;
    const text = "@Dr. Mira Hansen please check the arsenic value with @Lena Krause. @Dr. Mira Hansen: before we ask. @Katrin Vogel @Elena Márquez";
    sc.step("note", (s, at) => A.addInternalNote(s, "u-rmm", sc.id, text, "K2.2", at));
    const note = sc.c.internalNotes.at(-1)!;
    expect(note).toMatchObject({ text, by: "u-rmm", sectionId: "K2.2", mentions: ["u-saf", "u-qm", "u-rmm"] });
    expect(mentionRecipients(sc.s, note)).toEqual(["u-saf", "u-qm"]);
    const mails = sc.mails("note-mention");
    expect(sc.s.mails.length - before).toBe(2);
    expect(mails.map((m) => m.to)).toEqual([["u-saf"], ["u-qm"]]);
    for (const m of mails) {
      expect(m).toMatchObject({ audience: "internal", channel: "task-notification", by: "u-rmm", caseId: sc.id, sectionId: "K2.2", subject: `Katrin Vogel mentioned you on ${sc.id}` });
      expect(m.body).toContain(`“${text}”`);
      expect(m.body).toContain(`${sc.c.materialName} (${sc.id}), section K2.2`);
    }
    expect(sc.s.mails.filter((m) => m.event === "note-mention" && m.to.some((id) => id.startsWith("u-sup-")))).toEqual([]);
    expect(sc.c.audit.at(-1)).toMatchObject({ action: "Added internal note", detail: "On K2.2. Mentioned Dr. Mira Hansen and Lena Krause." });
    expect(checkInvariants(sc.s)).toEqual([]);
  });

  it("links to the note: the review workspace for a reviewing department, else the case page's Internal notes tab", () => {
    const sc = new Scenario().toReview();
    sc.step("note", (s, at) => A.addInternalNote(s, "u-rmm", sc.id, "@Dr. Mira Hansen @Felix Schulz @Nina Hoffmann see the HS code.", "K1", at));
    sc.step("note 2", (s, at) => A.addInternalNote(s, "u-cus", sc.id, "@Katrin Vogel done.", undefined, at));
    const [n1, n2] = sc.c.internalNotes;
    const link = (to: string) => sc.mails("note-mention").find((m) => m.to[0] === to)!.link;
    const safReviews = sc.c.reviews.some((r) => r.dept === "SAF");
    expect(link("u-saf")).toBe(safReviews ? `/review/${sc.id}?s=K1&note=${n1.id}` : `/cases/${sc.id}?tab=notes&note=${n1.id}`);
    expect(link("u-cus")).toBe(`/cases/${sc.id}?tab=notes&note=${n1.id}`);
    expect(link("u-admin")).toBe(`/cases/${sc.id}?tab=notes&note=${n1.id}`);
    expect(link("u-rmm")).toBe(`/review/${sc.id}?note=${n2.id}`);
    // Before the review starts there is no workspace yet: the case page.
    const early = new Scenario().create();
    expect(noteLink(early.c, { id: "x-n1" }, { dept: "SAF" })).toBe(`/cases/${early.id}?tab=notes&note=x-n1`);
  });

  it("a note without a mention sends nothing; Customs mentioning itself sends nothing", () => {
    const sc = new Scenario().toReview();
    sc.step("plain", (s, at) => A.addInternalNote(s, "u-saf", sc.id, "Arsenic close to the limit.", undefined, at));
    sc.step("self", (s, at) => A.addInternalNote(s, "u-cus", sc.id, "Note to self, @Felix Schulz: HS code.", undefined, at));
    expect(sc.c.internalNotes.map((n) => n.mentions)).toEqual([[], ["u-cus"]]);
    expect(sc.mails("note-mention")).toEqual([]);
  });

  it("a refused note (closed case, read-only role) sends no mail", () => {
    const sc = new Scenario().toReview();
    sc.refused("admin note", (s, at) => A.addInternalNote(s, "u-admin", sc.id, "@Dr. Mira Hansen look", undefined, at));
    expect(sc.mails("note-mention")).toEqual([]);
  });

  it("supplier mails stay clean of the mention text (leak scan)", () => {
    const sc = new Scenario().toReview();
    sc.step("note", (s, at) => A.addInternalNote(s, "u-rmm", sc.id, "@Dr. Mira Hansen SECRET-MENTION margin too low", undefined, at));
    sc.completeAll().release();
    for (const m of sc.s.mails.filter((x) => x.audience === "supplier")) expect(`${m.subject} ${m.body}`).not.toMatch(/SECRET-MENTION|mentioned you/);
    expect(sc.s.mails.filter((m) => m.event === "note-mention").every((m) => m.audience === "internal" && m.to.every((id) => s0.users.find((u) => u.id === id)?.side === "internal"))).toBe(true);
  });
});
