// The app's mails in the shared layout (27 Oct): each keeps its subject and the facts it carried before (case code,
// trade name, the question, its due date, what happened, where to look); the supplier mails carry no button (the
// portal's URL is not known in the app), a mention links to the app's home page when that is known.
import { describe, expect, it } from "vitest";
import { EMAIL_AUDIENCE, EMAIL_FOOTER, emailHtml, emailText, htmlText } from "@/domain/emailHtml";
import type { CiqCase, OpenPoint } from "@/domain/types";
import { MAILS, mentionContent, mentionMail } from "./mail";

const C = { id: "ZZT-0003", materialName: "Tocopherol <T-70> & Co" } as CiqCase;
const OP = {
  id: "OP-0003-02",
  question: "Please confirm the shelf life.\nAnd the storage temperature.",
  dueDate: "2026-12-15T00:00:00.000Z",
  ref: { sectionId: "K1", label: "K1 Safety data sheet" },
  closeReason: "Internal: clarified by phone.",
  justification: "Finding F-12: internal reason",
} as unknown as OpenPoint;
const OPEN_PORTAL = "Please open the CIQ supplier portal for the details.";
/** A label/value row of the details table, as the layout writes it. */
const row = (label: string, value: string) => new RegExp(`>${label}</td><td [^>]*>${htmlText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</td>`);

describe("the supplier mails (D1): subject, facts, no button, the supplier's audience line", () => {
  const all = [MAILS.edited(C, OP), MAILS.closed(C, OP), MAILS.cancelled(C), MAILS.reopened(C)];

  it("subjects as before", () => {
    expect(all.map((m) => m.subject)).toEqual([
      "ZZT-0003: Beiersdorf changed an open question",
      "ZZT-0003: an open question was closed",
      "ZZT-0003: the CIQ request was cancelled",
      "ZZT-0003: the request for your final release is withdrawn for now",
    ]);
  });

  it("every Body is the shared layout of its content, with the case and trade name, where to look, and no button", () => {
    for (const m of all) {
      expect(m.body).toBe(emailHtml(m.content));
      expect(m.body).toMatch(row("Case", "ZZT-0003"));
      expect(m.body).toMatch(row("Trade name", C.materialName));
      expect(m.body).toContain(`>${OPEN_PORTAL}</p>`);
      expect(m.body).toContain(`>${EMAIL_FOOTER}</p>`);
      expect(m.body).toContain(`>${EMAIL_AUDIENCE.supplier}</p>`);
      expect(m.body).not.toContain("<a ");
      // never the internal reason or a finding-based justification
      expect(m.body).not.toContain("clarified by phone");
      expect(m.body).not.toContain("F-12");
      expect(m.body).not.toContain("<T-70>");
    }
  });

  it("edited: what changed, the question (line breaks kept), where it refers to, the due date", () => {
    const m = MAILS.edited(C, OP);
    expect(m.content.title).toBe("An open question was changed");
    expect(m.body).toContain(`>Beiersdorf changed an open question on ZZT-0003 (${htmlText(C.materialName)}).</p>`);
    expect(m.body).toContain(">Please confirm the shelf life.<br>And the storage temperature.</td>");
    expect(m.body).toMatch(row("Refers to", "K1 Safety data sheet"));
    expect(m.body).toMatch(row("Please answer by", "2026-12-15"));
    expect(MAILS.edited(C, { ...OP, dueDate: "" }).body).not.toContain("Please answer by");
  });

  it("closed: no answer needed, the question", () => {
    const m = MAILS.closed(C, OP);
    expect(m.body).toContain(`>Beiersdorf closed an open question on ZZT-0003 (${htmlText(C.materialName)}). No answer is needed any more.</p>`);
    expect(m.body).toContain(">Please confirm the shelf life.<br>And the storage temperature.</td>");
    expect(m.body).not.toContain("Please answer by");
  });

  it("cancelled: no further input needed", () => {
    expect(MAILS.cancelled(C).body).toContain(`>Beiersdorf cancelled the CIQ request ZZT-0003 (${htmlText(C.materialName)}). No further input is needed from you.</p>`);
  });

  it("reopened: the release request withdrawn for now, asked again later", () => {
    const m = MAILS.reopened(C);
    expect(m.body).toContain(`>Beiersdorf reopened its review of ZZT-0003 (${htmlText(C.materialName)}), so the request for your final release is withdrawn for now.</p>`);
    expect(m.body).toContain(">You will be asked again once the review is complete.</p>");
  });

  it("a case without a trade name: the code alone", () => {
    const m = MAILS.cancelled({ id: "ZZT-0009", materialName: "" } as CiqCase);
    expect(m.body).toContain(">Beiersdorf cancelled the CIQ request ZZT-0009. No further input is needed from you.</p>");
    expect(m.body).not.toContain("Trade name");
  });

  it("the plain-text alternative says the same", () => {
    const t = emailText(MAILS.edited(C, OP).content);
    expect(t).toContain("Please answer by: 2026-12-15");
    expect(t).toContain("> Please confirm the shelf life.\n> And the storage temperature.");
    expect(t).toContain(OPEN_PORTAL);
  });
});

describe("the mention mail", () => {
  const LINK = "https://dev-harness.kissflow.eu/view/application/CIQ_Digital_A00/ui";
  const facts = { writer: "Katrin Vogel", caseCode: "ZZT-0003", tradeName: "Tocopherol T-70", sectionCode: "K7", text: "@Ingrid Nolte <please> check\nthe limits." };

  it("subject, who mentioned whom where, the note as a quote, the button to the app, the internal audience line", () => {
    const m = mentionMail({ ...facts, link: LINK });
    expect(m.subject).toBe("Katrin Vogel mentioned you on ZZT-0003");
    expect(m.body).toBe(emailHtml(mentionContent({ ...facts, link: LINK })));
    expect(m.body).toContain(">Katrin Vogel mentioned you in an internal note on ZZT-0003 (Tocopherol T-70), section K7.</p>");
    expect(m.body).toMatch(row("Case", "ZZT-0003"));
    expect(m.body).toMatch(row("Section", "K7"));
    expect(m.body).toMatch(row("Written by", "Katrin Vogel"));
    expect(m.body).toContain(">@Ingrid Nolte &lt;please&gt; check<br>the limits.</td>");
    expect(m.body).toContain(`<a href="${LINK}" target="_blank"`);
    expect(m.body).toContain(">Open CIQ Digital</a>");
    expect(m.body).toContain(">The note is on case ZZT-0003, under Internal notes.</p>");
    expect(m.body).toContain(`>${EMAIL_AUDIENCE.internalNotes}</p>`);
  });

  it("without the app's home page: no button, and where to look in words", () => {
    const m = mentionMail(facts);
    expect(m.body).not.toContain("<a ");
    expect(m.body).toContain(">Open CIQ Digital in Kissflow to see the note. It is on case ZZT-0003, under Internal notes.</p>");
  });
});
