import { describe, expect, it } from "vitest";
import { RULE_SETS } from "@/domain/rules";
import { buildSeed } from "@/domain/seed";
import type { MailEvent } from "@/domain/types";
import { casesOnRuleSet, casesText, pendingDraft } from "./config";
import { MAIL_TEMPLATES, templateParts } from "./mailTemplateData";
import { runRegression } from "./regression";

const [RS1, RS2] = RULE_SETS;

/** Spec §2: every mail event. */
const EVENTS: MailEvent[] = [
  "invitation",
  "review-assigned",
  "informed",
  "op-raised",
  "op-answered",
  "op-returned",
  "op-accepted",
  "op-edited",
  "op-closed",
  "data-changed",
  "release-requested",
  "release-withdrawn",
  "release-receipt",
  "final-document",
  "cancelled",
  "reactivated",
  "change-reported",
  "reminder",
  "escalation",
  "note-mention",
];

describe("Test rules on built-in reference materials", () => {
  it("works on the empty start: there is a draft to test and no case is needed", () => {
    const s = buildSeed();
    expect(s.cases).toHaveLength(0);
    expect(pendingDraft()?.version).toBe("RS-2026.2");
    expect(casesOnRuleSet(s, "RS-2026.1")).toBe(0);
    expect(runRegression(RS1, RS2, "new-request").length).toBeGreaterThanOrEqual(6);
  });

  it("shows the draft adds Turkey REACH for the Turkey material only, as the new rule explains", () => {
    const rows = runRegression(RS1, RS2, "new-request");
    const changed = rows.filter((r) => r.changed);
    expect(changed.map((r) => r.m.id)).toEqual(["turkey"]);
    expect(changed[0].expected).toBe(true);
    expect(changed[0].firing).toEqual(["R-111"]);
    expect(changed[0].diff.added).toEqual(expect.arrayContaining(["K6.3", "A12"]));
    expect(changed[0].after).toBeGreaterThan(changed[0].before);
  });

  it("changes nothing for a running case on its own questionnaire version", () => {
    expect(runRegression(RS1, RS2, "pinned").filter((r) => r.changed)).toEqual([]);
  });

  it("words case counts", () => {
    expect([casesText(0), casesText(1), casesText(4)]).toEqual(["no case", "1 case", "4 cases"]);
  });
});

describe("mail templates", () => {
  it("cover every mail event of the spec with unique ids", () => {
    expect(new Set(MAIL_TEMPLATES.map((t) => t.id)).size).toBe(MAIL_TEMPLATES.length);
    expect([...new Set(MAIL_TEMPLATES.map((t) => t.event))].sort()).toEqual([...EVENTS].sort());
  });

  it("send every open-point event through the open-point e-mail, and the final document through its own channel", () => {
    for (const t of MAIL_TEMPLATES) {
      if (t.event.startsWith("op-")) expect(t.channel).toBe("open-point-webhook");
      else if (t.event === "final-document") expect(t.channel).toBe("final-document");
      else expect(t.channel).toBe("task-notification");
    }
  });

  it("keep internal content out of supplier mails and wording out of internal jargon", () => {
    for (const t of MAIL_TEMPLATES.filter((x) => x.audience === "supplier")) expect(`${t.subject} ${t.body}`).not.toMatch(/RMES|finding|internal note|Rejected|Approved/i);
    for (const t of MAIL_TEMPLATES) expect(`${t.label} ${t.when} ${t.to} ${t.subject} ${t.body}`).not.toMatch(/prototype|assumption|AS-\d|OP-\d|review version/i);
  });

  it("split placeholders from the text", () => {
    expect(templateParts("Due {Due date}.")).toEqual([
      { text: "Due ", placeholder: false },
      { text: "Due date", placeholder: true },
      { text: ".", placeholder: false },
    ]);
  });
});
