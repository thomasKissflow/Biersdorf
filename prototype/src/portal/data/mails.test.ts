// The supplier portal's mails to Beiersdorf in the shared layout (27 Oct): each keeps its subject and the facts it
// carried before (who, which case, what changed / the question and the answer / the report, where to look). The portal
// does not know the app's address, so a mail has the button only when a link is passed (liveActions passes none).
import { describe, expect, it } from "vitest";
import { EMAIL_AUDIENCE, EMAIL_FOOTER, emailHtml, emailText, htmlText } from "@/domain/emailHtml";
import { changeReportedMail, dataChangedMail, questionAnsweredMail } from "./mails";

const CASE = { code: "ZZT-0003", trade: "Tocopherol T-70", supplier: "Solvaro Oleochemicals S.A.", by: "Elena Márquez" };
const row = (label: string, value: string) => new RegExp(`>${label}</td><td [^>]*>${htmlText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</td>`);

describe("portal mails to Beiersdorf", () => {
  it("data changed: subject, who changed what on which case, where to look", () => {
    const m = dataChangedMail({ ...CASE, what: "uploaded a document" });
    expect(m.subject).toBe("ZZT-0003: the supplier changed the CIQ");
    expect(m.body).toBe(emailHtml(m.content));
    expect(m.body).toContain(`>${htmlText("Elena Márquez")} changed the CIQ of ZZT-0003 (Tocopherol T-70): uploaded a document.</p>`);
    expect(m.body).toMatch(row("Case", "ZZT-0003"));
    expect(m.body).toMatch(row("Trade name", "Tocopherol T-70"));
    expect(m.body).toMatch(row("Supplier", "Solvaro Oleochemicals S.A."));
    expect(m.body).toMatch(row("Change", "uploaded a document"));
    expect(m.body).toContain(">Please open CIQ Digital to see the change.</p>");
  });

  it("question answered: the question and the answer as quotes, the answer's kind, the attachment", () => {
    const m = questionAnsweredMail({ ...CASE, question: "Which plant <produces> the batches?", kind: "Document", answer: "Plant 2, Tarragona.\nStreet address attached.", attachment: "plant-address.pdf" });
    expect(m.subject).toBe("ZZT-0003: the supplier answered your question");
    expect(m.body).toContain(`>${htmlText("Elena Márquez")} answered the question on ZZT-0003 (Tocopherol T-70).</p>`);
    expect(m.body).toContain(">Question</p>");
    expect(m.body).toContain(">Which plant &lt;produces&gt; the batches?</td>");
    expect(m.body).toContain(">Answer (Document)</p>");
    expect(m.body).toContain(">Plant 2, Tarragona.<br>Street address attached.</td>");
    expect(m.body).toMatch(row("Attachment", "plant-address.pdf"));
    expect(m.body).toContain(">Please open CIQ Digital to review the answer.</p>");
  });

  it("question answered without the question's text (unreadable after the submit): the answer alone", () => {
    const m = questionAnsweredMail({ code: "ZZT-0003", kind: "Answer", answer: "Twelve months." });
    expect(m.body).not.toContain(">Question</p>");
    expect(m.body).toContain(">The supplier answered the question on ZZT-0003.</p>");
    expect(m.body).not.toContain("Attachment");
  });

  it("change reported: the report as a quote", () => {
    const m = changeReportedMail({ ...CASE, text: "  The antioxidant changes from batch 2611 on.  " });
    expect(m.subject).toBe("ZZT-0003: the supplier reported a change");
    expect(m.body).toContain(`>${htmlText("Elena Márquez")} reported a change on the released CIQ of ZZT-0003 (Tocopherol T-70).</p>`);
    expect(m.body).toContain(">Reported change</p>");
    expect(m.body).toContain(">The antioxidant changes from batch 2611 on.</td>");
    expect(m.body).toContain(">Please open CIQ Digital to review it.</p>");
  });

  it("every one: the footer, no audience line, no button without a link; values escaped", () => {
    const evil = `<b>"x"</b>`;
    for (const m of [dataChangedMail({ code: "ZZT-1", by: evil, what: evil }), questionAnsweredMail({ code: "ZZT-1", by: evil, question: evil, kind: evil, answer: evil }), changeReportedMail({ code: "ZZT-1", by: evil, text: evil })]) {
      expect(m.body).toContain(`>${EMAIL_FOOTER}</p>`);
      expect(m.body).not.toContain(EMAIL_AUDIENCE.supplier);
      expect(m.body).not.toContain("<a ");
      expect(m.body).not.toContain("<b>");
      expect(m.body).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    }
  });

  it("with a known app address: the Open CIQ Digital button (an absolute https link only)", () => {
    const link = "https://dev-harness.kissflow.eu/view/application/CIQ_Digital_A00/ui";
    expect(dataChangedMail({ ...CASE, what: "updated answers", link }).body).toContain(`<a href="${link}" target="_blank"`);
    expect(dataChangedMail({ ...CASE, what: "updated answers", link: "/view/application/CIQ_Digital_A00/ui" }).body).not.toContain("<a ");
  });

  it("the plain-text alternative", () => {
    const t = emailText(changeReportedMail({ ...CASE, text: "Line 1\nLine 2" }).content);
    expect(t).toContain("Elena Márquez reported a change on the released CIQ of ZZT-0003 (Tocopherol T-70).");
    expect(t).toContain("Reported change:\n> Line 1\n> Line 2");
  });
});
