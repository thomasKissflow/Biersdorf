// The shared e-mail layout (27 Oct): one HTML document per mail, safe for e-mail clients (tables, inline styles, no
// external resources), every value escaped, the optional parts only when given.
import { describe, expect, it } from "vitest";
import { EMAIL_AUDIENCE, EMAIL_FOOTER, asciiOnly, emailHtml, emailText, escapeHtml, htmlText, safeHttpsUrl, type EmailContent } from "./emailHtml";

const FULL: EmailContent = {
  title: "An open question was changed",
  intro: "Beiersdorf changed an open question on ZZT-0003 (Tocopherol T-70).",
  details: [
    { label: "Case", value: "ZZT-0003" },
    { label: "Trade name", value: "Tocopherol T-70" },
    { label: "Please answer by", value: "2026-12-15" },
  ],
  quotes: [{ label: "Question", text: "Line one\nLine two" }],
  notes: ["Please open the CIQ supplier portal for the details."],
  button: { label: "Open CIQ Digital", href: "https://dev-harness.kissflow.eu/view/application/CIQ_Digital_A00/ui" },
  audience: EMAIL_AUDIENCE.supplier,
};
const MIN: EmailContent = { title: "The CIQ request was cancelled", intro: "No further input is needed from you." };

describe("emailHtml: the document", () => {
  it("one whole HTML document: doctype, utf-8, a title, the body on a light grey page", () => {
    const h = emailHtml(FULL);
    expect(h.startsWith("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">")).toBe(true);
    expect(h).toContain("<title>An open question was changed</title>");
    expect(h).toContain('<body style="margin:0;padding:0;width:100%;background-color:#f1f3f6;">');
    expect(h.endsWith("</body></html>")).toBe(true);
  });

  it("e-mail-client safe: tables for the layout, inline styles only, no external CSS, fonts, images or scripts", () => {
    const h = emailHtml(FULL);
    expect(h).not.toMatch(/<style|<link|<script|<img|@import|@font-face|url\(|<div|class=/i);
    expect(h).toContain('role="presentation" cellpadding="0" cellspacing="0" border="0"');
    expect(h).toContain("font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif");
    // the only absolute URL is the button's own link (and its copy for a client that blocks buttons)
    expect([...h.matchAll(/https?:\/\/[^\s"<]+/g)].map((m) => m[0])).toEqual([FULL.button!.href, FULL.button!.href]);
  });

  it("a 600 px column, centred; a ghost table keeps it at 600 px in Outlook for Windows", () => {
    const h = emailHtml(MIN);
    expect(h).toContain('style="width:100%;max-width:600px;"');
    expect(h).toContain('<td align="center" style="padding:24px 12px;">');
    expect(h).toContain('<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->');
    expect(h).toContain("<!--[if mso]></td></tr></table><![endif]-->");
  });

  it("the dark blue header band: CIQ Digital and the Beiersdorf line, as text", () => {
    const h = emailHtml(MIN);
    expect(h).toContain('bgcolor="#0b2a5b" style="background-color:#0b2a5b;');
    expect(h).toContain(">CIQ Digital</p>");
    expect(h).toContain(">Beiersdorf &#183; Cosmetic Ingredient Questionnaire</p>");
  });

  it("title, intro and the footer; nothing optional when nothing optional is given", () => {
    const h = emailHtml(MIN);
    expect(h).toContain(">The CIQ request was cancelled</h1>");
    expect(h).toContain(">No further input is needed from you.</p>");
    expect(h).toContain(`>${EMAIL_FOOTER}</p>`);
    // no details table, no quote, no button, no audience line
    expect(h).not.toContain("border:1px solid #e3e7ee");
    expect(h).not.toContain("border-left:4px");
    expect(h).not.toContain("<a ");
    expect(h).not.toContain(EMAIL_AUDIENCE.supplier);
    expect(h).not.toContain(EMAIL_AUDIENCE.internalNotes.slice(0, 20));
  });

  it("the details table: one row per label with a value, empty values left out", () => {
    const h = emailHtml({ ...MIN, details: [{ label: "Case", value: "ZZT-0003" }, { label: "Section", value: "" }, { label: "Due", value: "  " }, { label: "Trade name" }, { label: "Supplier", value: "Solvaro" }] });
    expect(h.match(/<tr><td valign="top" width="36%"/g)?.length).toBe(2);
    expect(h).toMatch(/>Case<\/td><td valign="top" style="[^"]*">ZZT-0003<\/td>/);
    expect(h).toMatch(/>Supplier<\/td><td valign="top" style="[^"]*">Solvaro<\/td>/);
    expect(h).not.toContain(">Section<");
    expect(emailHtml({ ...MIN, details: [{ label: "Section" }] })).not.toContain("border:1px solid #e3e7ee");
  });

  it("the quoted block: left border, light background, line breaks kept; its label above it; an empty one left out", () => {
    const h = emailHtml(FULL);
    expect(h).toContain('bgcolor="#f4f7fb" style="background-color:#f4f7fb;border-left:4px solid #0b2a5b;');
    expect(h).toContain(">Line one<br>Line two</td>");
    expect(h).toContain(">Question</p>");
    expect(emailHtml({ ...MIN, quotes: [{ text: "a\r\nb\rc" }] })).toContain(">a<br>b<br>c</td>");
    expect(emailHtml({ ...MIN, quotes: [{ label: "Question", text: "  " }] })).not.toContain("border-left:4px");
  });

  it("the button: a coloured table cell around an absolute https link, plus the address as text", () => {
    const h = emailHtml(FULL);
    expect(h).toContain('<td align="center" bgcolor="#0b2a5b" style="background-color:#0b2a5b;border-radius:6px;mso-padding-alt:12px 24px;">');
    expect(h).toContain(`<a href="${FULL.button!.href}" target="_blank" style="display:inline-block;padding:12px 24px;`);
    expect(h).toContain(">Open CIQ Digital</a>");
    expect(h).toContain(`If the button does not work, copy this address into your browser: ${FULL.button!.href}</p>`);
  });

  it("no button without an absolute https link: relative, http, javascript:, blank or with a space", () => {
    for (const href of ["/view/application/CIQ_Digital_A00/ui", "http://dev.example/x", "javascript:alert(1)", "", "https://", "https://a b.example/", 'https://x.example/"onmouseover="x']) {
      expect(emailHtml({ ...MIN, button: { label: "Open CIQ Digital", href } }), href).not.toContain("<a ");
    }
    expect(emailHtml({ ...MIN, button: { label: " ", href: "https://x.example/" } })).not.toContain("<a ");
  });

  it("the audience line under the footer", () => {
    const h = emailHtml({ ...MIN, audience: EMAIL_AUDIENCE.internalNotes });
    expect(h).toContain(`>${EMAIL_FOOTER}</p><p style="margin:0;`);
    expect(h).toContain(">Internal notes are for Beiersdorf only; the supplier never sees them.</p>");
    expect(emailHtml({ ...MIN, audience: EMAIL_AUDIENCE.supplier })).toContain(">This message concerns your CIQ request with Beiersdorf.</p>");
  });
});

describe("emailHtml: every value escaped", () => {
  const EVIL = `<b>"R&D"</b> 'x'`;
  const SAFE = "&lt;b&gt;&quot;R&amp;D&quot;&lt;/b&gt; &#39;x&#39;";

  it("escapeHtml: & < > \" '", () => {
    expect(escapeHtml(EVIL)).toBe(SAFE);
  });

  it("title, intro, detail labels and values, quote labels and text, notes, button label, audience", () => {
    const h = emailHtml({ title: EVIL, intro: EVIL, details: [{ label: EVIL, value: EVIL }], quotes: [{ label: EVIL, text: EVIL }], notes: [EVIL], button: { label: EVIL, href: "https://x.example/a?b=1&c=2" }, audience: EVIL });
    expect(h).not.toContain("<b>");
    expect(h).not.toContain(`"R&D"`);
    expect(h.split(SAFE).length - 1).toBe(10); // <title>, h1, intro, label, value, quote label, quote, note, button, audience
    expect(h).toContain('href="https://x.example/a?b=1&amp;c=2"');
  });

  it("outside ASCII as numeric references, so the Body reads the same in any character set", () => {
    const h = emailHtml({ ...MIN, intro: "Elena Márquez answered: 99.7 % ✓ 😀" });
    expect(h).toContain(">Elena M&#225;rquez answered: 99.7 % &#10003; &#128512;</p>");
    expect(/^[\x00-\x7f]*$/.test(h)).toBe(true);
    expect(asciiOnly("a·b")).toBe("a&#183;b");
    expect(htmlText("Müller <x>\nnext")).toBe("M&#252;ller &lt;x&gt;<br>next");
  });

  it("safeHttpsUrl", () => {
    expect(safeHttpsUrl(" https://dev-harness.kissflow.eu/view/application/CIQ_Digital_A00/ui ")).toBe("https://dev-harness.kissflow.eu/view/application/CIQ_Digital_A00/ui");
    expect(safeHttpsUrl(undefined)).toBeUndefined();
    expect(safeHttpsUrl("ftp://x.example")).toBeUndefined();
    expect(safeHttpsUrl("https://x.example/<script>")).toBeUndefined();
  });
});

describe("emailText: the plain-text alternative", () => {
  it("the same facts as plain lines, quotes marked, the link spelled out", () => {
    expect(emailText(FULL)).toBe(
      [
        "CIQ Digital | Beiersdorf · Cosmetic Ingredient Questionnaire",
        "",
        "An open question was changed",
        "",
        "Beiersdorf changed an open question on ZZT-0003 (Tocopherol T-70).",
        "",
        "Case: ZZT-0003",
        "Trade name: Tocopherol T-70",
        "Please answer by: 2026-12-15",
        "",
        "Question:",
        "> Line one",
        "> Line two",
        "",
        "Please open the CIQ supplier portal for the details.",
        "",
        `Open CIQ Digital: ${FULL.button!.href}`,
        "",
        "--",
        EMAIL_FOOTER,
        EMAIL_AUDIENCE.supplier,
      ].join("\n"),
    );
  });

  it("not escaped (plain text), the optional parts left out", () => {
    expect(emailText({ ...MIN, intro: `<b>"R&D"</b>` })).toBe(["CIQ Digital | Beiersdorf · Cosmetic Ingredient Questionnaire", "", MIN.title, "", `<b>"R&D"</b>`, "", "--", EMAIL_FOOTER].join("\n"));
    expect(emailText({ ...MIN, button: { label: "Open", href: "/relative" } })).not.toContain("Open:");
  });
});
