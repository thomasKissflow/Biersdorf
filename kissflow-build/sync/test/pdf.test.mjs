// The final PDF writer (pdf.mjs) on its own: a well-formed, deterministic PDF 1.4 laid out as the app's Final document
// tab, with page breaks that keep headings with what follows, repeat a table's header, continue an open-point box on
// the next page, move a row whole (and split by lines only a row taller than a page), and text in WinAnsi with the
// fallbacks. Fictional data only. The patched build (the app's seal wording) is tested in final-pdf/test/offline.mjs
// and prototype/src/features/rmm/finalPdf.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFinalPdf, setDateFormat, winAnsi, finalPdfName, pdfSha256 } from "../pdf.mjs";

const PAGE_H = 841.89;
const latin1 = (b) => Buffer.from(b).toString("latin1");

/** Pages of the PDF: each a list of shown lines { x, y (PDF, from the bottom), text } (one per BT…ET), escapes kept
 *  decoded to Latin-1 / CP1252 bytes as chars. */
function parse(bytes) {
  const s = latin1(bytes);
  return [...s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)].map((m) => {
    const start = m.index + m[0].length;
    const st = s.slice(start, start + Number(m[1]));
    assert.equal(s.slice(start + Number(m[1]), start + Number(m[1]) + 10), "\nendstream", "the /Length is the stream's byte length");
    const lines = [];
    let cur = null;
    for (const t of st.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|BT (-?[\d.]+) (-?[\d.]+) Td|\bET\b/g)) {
      if (t[2] !== undefined) cur = { x: Number(t[2]), y: Number(t[3]), parts: [] };
      else if (t[0] === "ET") {
        if (cur?.parts.length) lines.push({ x: cur.x, y: cur.y, text: cur.parts.join("") });
        cur = null;
      } else if (cur) cur.parts.push(t[1].replace(/\\([0-7]{3}|.)/g, (_, x) => (x.length === 3 ? String.fromCharCode(parseInt(x, 8)) : x)));
    }
    return { lines, ops: st };
  });
}
const chrome = (l) => l.y > PAGE_H - 45 || l.y < 40; // the running header and the footer line
const content = (p) => p.lines.filter((l) => !chrome(l));
const pageOf = (pages, text) => pages.findIndex((p) => p.lines.some((l) => l.text === text));

// ------------------------------------------------------------------ a fictional document

const at = (h, m = 0) => `2026-10-20T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
const LOREM = "The raw material is produced in a closed batch process under GMP conditions and every batch is tested against the specification before it is released.";
function doc({ components = 3, threads = 2, rounds = 2, longAnswer = 0, evidence = 3 } = {}) {
  return {
    id: "ZZT-0042-FD",
    caseId: "ZZT-0042",
    generatedAt: at(18),
    trigger: "Final release by Jürgen Weiß",
    header: { caseId: "ZZT-0042", materialName: "TESTÖL 42", inci: "Caprylic/Capric Triglyceride", materialNo: "RM-900042", supplierName: "Brückner & Söhne GmbH", duns: "390117245", manufacturer: "Brückner & Söhne GmbH, Hamburg", site: "Werk Süd", markets: ["European Union"], templateVersion: "CIQ-2026 v1", ruleSetVersion: "RS-2026.1", ownerName: "Katrin Vogel", createdAt: at(8), releasedAt: at(18) },
    metadata: [
      { id: "SF01", code: "SF-01", label: "What is the origin of the components?", value: "Vegetable (bio mass)", by: "Jürgen Weiß", at: at(9) },
      { id: "SF11", code: "SF-11", label: "Target markets of the raw material", value: "European Union", setByBdf: true },
    ],
    sections: [
      { sectionId: "GEN", code: "GEN", title: "General information", applicability: "Mandatory", answers: [{ fieldId: "FLD-GEN-001", label: "Trade name of the raw material", value: "TESTÖL 42", by: "Jürgen Weiß", at: at(9) }, { fieldId: "FLD-GEN-004", label: "Manufacturer (name and address)", value: `Brückner & Söhne GmbH\r\nHafenstraße 12\r\n20457 Hamburg`, by: "Zoë Švec", at: at(9, 30), justification: "Lohnfertigung bei François Lefèvre" }] },
      { sectionId: "K2.1", code: "K2.1", title: "Components and additives", applicability: "Mandatory", answers: [] },
      { sectionId: "K2.2", code: "K2.2", title: "Byproducts and contaminations", applicability: "Mandatory", answers: longAnswer ? [{ fieldId: "FLD-LONG", label: "Process description", value: Array.from({ length: longAnswer }, (_, i) => `Line ${i + 1}: ${LOREM}`).join("\n"), by: "Søren Ødegård", at: at(10) }] : [] },
      { sectionId: "K6.8", code: "K6.8", title: "Halal and kosher status", applicability: "Not applicable, justified", justification: "Not certified for this grade.", answers: [] },
      { sectionId: "K3", code: "K3", title: "Storage conditions and handling", applicability: "Mandatory", answers: [], addedLater: true },
    ],
    components: Array.from({ length: components }, (_, i) => ({ id: `c${i + 1}`, inci: `Component INCI ${i + 1}`, cas: `100-${String(i).padStart(2, "0")}-1`, ec: i % 3 ? null : `200-${i}-5`, fn: "emollient", additive: i % 4 === 1, origin: "Vegetable", concMin: i, concMax: i + 2 })),
    evidence: Array.from({ length: evidence }, (_, i) => ({ documentId: `d${i + 1}`, name: `Evidence-${i + 1}.pdf`, sectionId: "K3", sectionCode: "K3", fieldLabel: "Storage statement", uploadedBy: "Jürgen Weiß", uploadedAt: at(11, i % 60) })),
    threads: Array.from({ length: threads }, (_, k) => ({
      opId: `OP-0042-${String(k + 1).padStart(2, "0")}`,
      ref: "K2.2 › Arsenic (As) content",
      kind: "Query",
      raisedBy: "Dr. Mira Hansen",
      raisedAt: at(12),
      result: k % 2 ? "Not accepted" : "Accepted",
      rounds: Array.from({ length: rounds }, (_, r) => ({
        n: r + 1,
        entries: [
          { at: at(12, r), by: "Dr. Mira Hansen", side: "internal", action: r ? "Returned to supplier" : "Raised", text: `Question ${k + 1}.${r + 1}: ${LOREM}` },
          { at: at(13, r), by: "Jürgen Weiß", side: "supplier", action: "Answered", text: `Answer ${k + 1}.${r + 1}: ${LOREM}\n\n${LOREM}`, attachment: `Antwort-${k + 1}-${r + 1}.pdf` },
        ],
      })),
    })),
    confirmations: [{ type: "final-release", label: "Final release", name: "Jürgen Weiß", email: "j.weiss@brueckner.example", role: "Regulatory Manager", at: at(18), note: "The CIQ is frozen." }],
    fingerprint: "00ff00ff00ff00ff",
  };
}
const SEAL = "00ff00ff00ff00ff";

// ------------------------------------------------------------------ structure and determinism

test("pdf: a well-formed PDF 1.4 (xref offsets, page count, info), deterministic bytes", () => {
  const d = doc();
  const a = renderFinalPdf(d, SEAL, { verified: true });
  const b = renderFinalPdf(JSON.parse(JSON.stringify(d)), SEAL, { verified: true });
  assert.equal(latin1(a), latin1(b), "the same document gives the same bytes");
  assert.equal(pdfSha256(a), pdfSha256(b));
  assert.notEqual(latin1(renderFinalPdf({ ...d, header: { ...d.header, materialNo: "RM-900043" } }, SEAL, { verified: true })), latin1(a), "a changed document gives other bytes");
  const s = latin1(a);
  assert.ok(s.startsWith("%PDF-1.4\n"));
  assert.ok(s.endsWith("%%EOF\n"));
  const xref = Number(s.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.equal(s.slice(xref, xref + 5), "xref\n");
  const [, n] = s.slice(xref).match(/^xref\n0 (\d+)\n/);
  const offsets = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, Number(n) - 1);
  offsets.forEach((o, i) => assert.ok(s.startsWith(`${i + 1} 0 obj\n`, o), `object ${i + 1} at its xref offset`));
  const pages = parse(a);
  assert.equal(Number(s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1]), pages.length);
  assert.match(s, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(s, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  assert.ok(!/\/FontFile|\/Image|\/Filter/.test(s), "no embedded font, no image, no compression");
  assert.match(s, /\/Info \d+ 0 R/);
  assert.match(s, /\/Subject \(seal sha256:00ff00ff00ff00ff\)/);
  assert.ok(!/NaN|Infinity|undefined/.test(s), "no broken number or value in the operators");
  assert.equal(finalPdfName("ZZT-0042"), "ZZT-0042-final-document.pdf");
});

test("pdf: the tab's layout: header, the five parts in order, the closing band, the footer on every page", () => {
  const pages = parse(renderFinalPdf(doc(), SEAL, { verified: true }));
  const text = pages.flatMap((p) => p.lines.map((l) => l.text));
  const order = ["CIQ FINAL DOCUMENT", "TEST\xd6L 42", "ZZT-0042", "Document seal: unchanged", "BDF material no.", "1. Released answers by section", "General information  Mandatory", "Metadata answers  SF-01 to SF-12 \xb7 they set the scope", "K2.1 Components and additives  Mandatory", "See the composition in part 2.", "K6.8 Halal and kosher status  Not applicable, justified", "Justification: Not certified for this grade.", "Further sections in scope", "2. Composition (K2.1)", "3. Evidence", "4. Open points, round by round", "5. Confirmations", "None of these confirmations is a raw-material approval."];
  let k = -1;
  for (const t of order) {
    const i = text.indexOf(t, k + 1);
    assert.ok(i > k, `"${t}" in order (found at ${i}, after ${k})`);
    k = i;
  }
  assert.ok(text.includes("K2.2 Byproducts and contaminations  Mandatory") === false, "a section without answers is not a block of its own");
  assert.ok(text.some((t) => t.startsWith("K2.2  Byproducts and contaminations")), "it is listed under the further sections");
  assert.ok(text.some((t) => t.startsWith("K3  Storage conditions and handling")) && text.includes("3 documents \xb7 added later"), "a documents-only section: its count and 'added later'");
  assert.ok(text.includes("Evidence-1.pdf, Evidence-2.pdf, Evidence-3.pdf"), "and its files by name");
  pages.forEach((p, i) => {
    assert.ok(p.lines.some((l) => l.text === `Page ${i + 1} of ${pages.length}`), `page ${i + 1}: Page X of Y`);
    assert.ok(p.lines.some((l) => l.text === `Document seal (SHA-256 of the final document JSON): ${SEAL}`), `page ${i + 1}: the footer`);
    assert.equal(p.lines.some((l) => l.text === "ZZT-0042 \xb7 TEST\xd6L 42"), i > 0, `page ${i + 1}: the running header from page 2 on`);
  });
  // colours: the app's tokens (brand blue, ink, the soft fills)
  const ops = pages.map((p) => p.ops).join("\n");
  for (const c of ["0.000 0.196 0.645 rg", "0.081 0.122 0.197 rg", "0.944 0.956 0.971 rg", "0.857 0.969 0.890 rg", "0.860 0.879 0.903 RG"]) assert.ok(ops.includes(c), c);
});

test("pdf: the seal badge follows the check (unchanged, broken, or no claim)", () => {
  const t = (v) => parse(renderFinalPdf(doc(), SEAL, { verified: v })).flatMap((p) => p.lines.map((l) => l.text)).join("\n");
  // the intro box wraps: its sentences are read across lines
  assert.ok(t(true).includes("\nDocument seal: unchanged\n") && /The\s+document\s+seal\s+confirms\s+it\s+is\s+unchanged/.test(t(true)));
  assert.ok(t(false).includes("\nDocument seal broken\n") && /The\s+document\s+seal\s+is\s+broken/.test(t(false)) && !t(false).includes("unchanged"));
  const none = t(undefined);
  assert.ok(!none.includes("Document seal: unchanged") && !none.includes("Document seal broken") && none.includes("\nDocument seal\n"));
});

// ------------------------------------------------------------------ page breaks

test("pdf: page breaks: text stays inside the content area, headings never end a page", () => {
  const pages = parse(renderFinalPdf(doc({ components: 40, threads: 6, rounds: 3, longAnswer: 0, evidence: 30 }), SEAL, { verified: true }));
  assert.ok(pages.length >= 5, `${pages.length} pages`);
  for (const [i, p] of pages.entries()) {
    for (const l of content(p)) {
      assert.ok(l.y >= 52 && l.y <= PAGE_H - 44, `page ${i + 1}: "${l.text}" at y ${l.y} is outside the content area`);
      assert.ok(l.x >= 45.9 && l.x < 595.28 - 46, `page ${i + 1}: "${l.text}" at x ${l.x}`);
    }
    const last = content(p).sort((a, b) => a.y - b.y)[0];
    if (i < pages.length - 1) assert.ok(!/^(\d\. |ROUND |OP-0042-\d\d \xb7 |#$|Document$|Further sections|Metadata answers|[A-Z][A-Z0-9.]* [^ ].*  (Mandatory|Optional|Not applicable, justified)$)/.test(last.text), `page ${i + 1} ends on a heading: ${last.text}`);
  }
  // the closing band never stands alone: the last confirmation and the closing line share its page
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const ps = parse(renderFinalPdf(doc({ components: 3 + n * 3, threads: 2, evidence: 3 + n }), SEAL, { verified: true }));
    const last = content(ps.at(-1)).map((l) => l.text);
    assert.ok(last.includes("None of these confirmations is a raw-material approval.") && last.includes("Final release"), `variant ${n}: the last page holds ${JSON.stringify(last.slice(0, 3))}`);
  }
});

test("pdf: a long table repeats its header on every page and never splits a row", () => {
  const pages = parse(renderFinalPdf(doc({ components: 90, threads: 0 }), SEAL, {}));
  const rowsAt = [];
  for (let n = 1; n <= 90; n++) {
    const p = pageOf(pages, `Component INCI ${n}`);
    assert.ok(p >= 0, `row ${n}`);
    // the row's cells are on one page, at one height
    const inci = pages[p].lines.find((l) => l.text === `Component INCI ${n}`);
    for (const cell of [String(n), `100-${String(n - 1).padStart(2, "0")}-1`, `${n - 1}\x96${n + 1} %`]) assert.ok(pages[p].lines.some((l) => l.text === cell && Math.abs(l.y - inci.y) < 0.01), `row ${n}: ${cell} beside its INCI`);
    rowsAt.push(p);
  }
  assert.deepEqual([...rowsAt].sort((a, b) => a - b), rowsAt, "the rows in order");
  const tablePages = [...new Set(rowsAt)];
  assert.ok(tablePages.length >= 3, `${tablePages.length} pages of rows`);
  for (const p of tablePages) {
    const head = pages[p].lines.filter((l) => ["#", "INCI / IUPAC", "CAS", "EC / REACH no.", "Function", "Origin", "Additive", "Concentration"].includes(l.text));
    assert.equal(head.length, 8, `page ${p + 1}: the header row`);
    const firstRow = Math.max(...pages[p].lines.filter((l) => /^Component INCI \d+$/.test(l.text)).map((l) => l.y));
    assert.ok(head.every((h) => h.y > firstRow), `page ${p + 1}: the header above the rows`);
  }
});

test("pdf: an open point continues on the next page under its strip; an entry is never split", () => {
  const pages = parse(renderFinalPdf(doc({ components: 0, threads: 1, rounds: 14 }), SEAL, {}));
  const cont = pages.flatMap((p, i) => p.lines.filter((l) => l.text === "OP-0042-01 \xb7 Query \xb7 K2.2 \x9b Arsenic (As) content  (continued)").map(() => i));
  assert.ok(cont.length >= 1, "a continuation strip");
  for (let r = 1; r <= 14; r++) {
    assert.ok(pageOf(pages, `ROUND ${r}`) >= 0, `round ${r}`);
    const meta = pageOf(pages, `J\xfcrgen Wei\xdf (supplier) \xb7 Answered \xb7 2026-10-20 13:${String(r - 1).padStart(2, "0")} UTC`);
    const att = pageOf(pages, `Attachment: Antwort-1-${r}.pdf`);
    assert.ok(meta >= 0 && meta === att, `round ${r}: the answer's who line, text and attachment on one page`);
  }
  // the box: one stroke per page segment, the first with rounded top corners only
  const boxes = pages.map((p) => (p.ops.match(/ RG 0\.70 w /g) ?? []).length);
  assert.ok(boxes.filter((n) => n > 0).length >= 2, "the border is drawn on each page the box spans");
});

test("pdf: a row taller than a page is split by lines, nothing lost, in order", () => {
  const pages = parse(renderFinalPdf(doc({ components: 0, threads: 0, longAnswer: 160 }), SEAL, {}));
  const where = [];
  for (let i = 1; i <= 160; i++) {
    const p = pages.findIndex((pg) => pg.lines.some((l) => l.text.startsWith(`Line ${i}: `)));
    assert.ok(p >= 0, `line ${i}`);
    where.push(p);
  }
  assert.deepEqual([...where].sort((a, b) => a - b), where);
  assert.ok(new Set(where).size >= 3, "over several pages");
  assert.ok(pageOf(pages, "S\xf8ren \xd8deg\xe5rd \xb7 2026-10-20 10:00 UTC") === where.at(-1), "its who line after its last line");
});

// ------------------------------------------------------------------ text

test("pdf: umlauts, accents and CP1252 in WinAnsi; fallbacks for the rest; newlines kept in answers", () => {
  assert.equal(winAnsi("Jürgen Weiß, Zoë, François, Ødegård"), "J\xfcrgen Wei\xdf, Zo\xeb, Fran\xe7ois, \xd8deg\xe5rd");
  assert.equal(winAnsi("„Süd“ – 12 € — Šečić Œuvre"), "\x84S\xfcd\x93 \x96 12 \x80 \x97 \x8ae?i? \x8cuvre");
  assert.equal(winAnsi("≤ 5 → ≥ 2 × 3 − 1 ≈ 4"), "<= 5 -> >= 2 \xd7 3 - 1 ~ 4", "× is WinAnsi itself");
  assert.equal(winAnsi("Márquez"), "M\xe1rquez", "decomposed accents are joined (NFC)");
  assert.equal(winAnsi("a​b c\nd\te"), "ab c d e", "a newline is a space in winAnsi()");
  assert.equal(winAnsi("Łódź 中"), "?\xf3d? ?");
  const s = latin1(renderFinalPdf(doc(), SEAL, {}));
  assert.ok(s.includes("(J\\374rgen Wei\\337)"), "umlaut and sharp s as WinAnsi octal escapes");
  assert.ok(s.includes("(TEST\\326L 42)"));
  const lines = parse(renderFinalPdf(doc(), SEAL, {})).flatMap((p) => p.lines.map((l) => l.text));
  const i = lines.indexOf("Br\xfcckner & S\xf6hne GmbH");
  assert.deepEqual(lines.slice(i, i + 3), ["Br\xfcckner & S\xf6hne GmbH", "Hafenstra\xdfe 12", "20457 Hamburg"], "CRLF lines kept, no stray character");
});

test("pdf: dates through setDateFormat (default UTC); missing optional values render", () => {
  setDateFormat((iso) => `D(${iso.slice(11, 16)})`);
  try {
    const t = parse(renderFinalPdf(doc(), SEAL, {})).flatMap((p) => p.lines.map((l) => l.text));
    assert.ok(t.includes("D(08:00) \xb7 D(18:00)"), "the case started · released line in the chosen format");
  } finally {
    setDateFormat(undefined);
  }
  assert.ok(parse(renderFinalPdf(doc(), SEAL, {})).some((p) => p.lines.some((l) => l.text.includes("2026-10-20 08:00 UTC \xb7 2026-10-20 18:00 UTC"))), "back to UTC");
  const bare = { header: { caseId: "ZZT-0043" }, sections: undefined, components: [{ inci: "Tocopherol" }, { id: "x", origin: null, concMin: null }], evidence: [{ name: "x.pdf", justification: "" }], threads: [{ opId: "OP-1" }, { opId: "OP-2", rounds: [{ n: 1 }] }], confirmations: undefined };
  const p = parse(renderFinalPdf(bare, SEAL));
  const t = p.flatMap((x) => x.lines.map((l) => l.text));
  assert.ok(t.includes("Not provided") && t.includes("OP-1 \xb7 \x97 \xb7 \x97") && t.includes("ROUND 1"));
  assert.ok(!t.some((x) => /undefined|NaN|null/.test(x)));
  const long = renderFinalPdf({ ...doc(), sections: [{ sectionId: "GEN", code: "GEN", title: "General information", applicability: "Mandatory", answers: [{ fieldId: "f", label: "No spaces", value: "x".repeat(12000) }] }] }, SEAL);
  assert.ok(parse(long).length >= 2, "a 12 000-character word is cut across lines and pages");
  // the cut is linear: a pasted 200 000-character string (a hash run, a data URL) must not eat the service's time limit
  const t0 = Date.now();
  const huge = renderFinalPdf({ ...doc(), sections: [{ sectionId: "GEN", code: "GEN", title: "General information", applicability: "Mandatory", answers: [{ fieldId: "f", label: "No spaces", value: "ab-".repeat(66667) }] }] }, SEAL);
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  const text = parse(huge).flatMap((p) => content(p).map((l) => l.text)).filter((x) => /^(ab-)*a?b?$|^b-|^-/.test(x)).join("");
  assert.ok(text.startsWith("ab-ab-") && text.length >= 200000 - 3, "nothing of it is lost");
});
