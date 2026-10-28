// The data console's .xlsx reader (console/xlsx.ts): the real configuration seed workbook read row for row equal to the
// same rows as JSON (both files read from kissflow-build/, never copied: the seed is Kissflow-internal), and small
// workbooks built here (a zip writer below: stored and deflated entries) for shared strings, rich text, inline
// strings, numbers, booleans, empty and missing cells, _xHHHH_ escapes, entities and a relative sheet target. Node has
// no DOMParser, so these run the reader's own XML parser (parseXmlLite); the harness (data-console) reads the same
// workbook through the browser's DOMParser.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sheetRows } from "./importRows";
import { columnOf, parseXmlLite, readXlsx, XlsxError } from "./xlsx";

const KB = fileURLToPath(new URL("../../../../kissflow-build/", import.meta.url));
const SEED_XLSX = `${KB}CIQ-prod-seed-config-version-INTERNAL.xlsx`;
const SEED_JSON = `${KB}night-2026-10-21/prod-seed/config-version.json`;
const haveSeed = existsSync(SEED_XLSX) && existsSync(SEED_JSON);

// ---- a minimal zip writer (local headers, central directory, end record; CRC-32 as zip wants it)
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
async function deflateRaw(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function zip(files: Record<string, string>, opts: { store?: string[] } = {}): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const stored = opts.store?.includes(name) ?? false;
    const data = stored ? raw : await deflateRaw(raw);
    const n = enc.encode(name);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(8, stored ? 0 : 8, true);
    head.setUint32(14, crc32(raw), true);
    head.setUint32(18, data.length, true);
    head.setUint32(22, raw.length, true);
    head.setUint16(26, n.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, stored ? 0 : 8, true);
    cd.setUint32(16, crc32(raw), true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, n.length, true);
    cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(head.buffer), n, data);
    central.push(new Uint8Array(cd.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let at = 0;
  for (const b of all) out.set(b, (at += b.length) - b.length);
  return out;
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const book = (sheets: string, rels: string, parts: Record<string, string>) => ({
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook ${NS}><sheets>${sheets}</sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
  ...parts,
});
const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;

describe("the configuration seed workbook (kissflow-build, Kissflow-internal: read in place)", () => {
  it.skipIf(!haveSeed)("reads every row exactly as the seed's JSON: 12 rows, 20 columns mapped from their labels, the ~25,000-character cells whole", async () => {
    const sheet = await readXlsx(new Uint8Array(readFileSync(SEED_XLSX)));
    expect(sheet.name).toBe("CIQ Config Version");
    expect(sheet.rows[0]).toHaveLength(20);
    const read = sheetRows(sheet);
    expect(read.columns.map((c) => c.field)).toContain("Release_Bundle_JSON");
    expect(read.columns.find((c) => c.header === "Config Key")?.field).toBe("Config_Key");
    expect(read.columns.every((c) => c.field)).toBe(true);
    const json = JSON.parse(readFileSync(SEED_JSON, "utf8")) as Record<string, unknown>[];
    expect(read.rows).toHaveLength(12);
    expect(read.rows).toEqual(json);
    const longest = Math.max(...read.rows.flatMap((r) => Object.values(r).map((v) => String(v).length)));
    expect(longest).toBeGreaterThan(25000);
  });
});

describe("readXlsx on small workbooks", () => {
  it("shared strings (plain, rich-text runs, phonetic runs left out), inline strings, numbers, booleans, errors, empty and missing cells", async () => {
    const sst = `<sst ${NS} count="4" uniqueCount="4"><si><t>Config Key</t></si><si><r><rPr><b/></rPr><t>Pay</t></r><r><t xml:space="preserve">load JSON </t></r></si><si><t>{"a":"x &amp; y &lt;z&gt;"}</t><rPh sb="0" eb="1"><t>IGNORED</t></rPh></si><si><t></t></si></sst>`;
    const ws = `<worksheet ${NS}><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Section Rev</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>RS:1</t></is></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c><c r="D2"><v>3</v></c></row>
      <row r="4"><c r="A4" t="b"><v>1</v></c><c r="B4" t="e"><v>#N/A</v></c><c r="C4" t="str"><f>A1</f><v>line_x000D_break</v></c><c r="D4" s="2"/></row>
    </sheetData></worksheet>`;
    const bytes = await zip(book(`<sheet name="First" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/>`, rel("rId1", "worksheet", "worksheets/sheet1.xml") + rel("rId2", "worksheet", "worksheets/sheet2.xml") + rel("rId3", "sharedStrings", "sharedStrings.xml"), {
      "xl/worksheets/sheet1.xml": ws,
      "xl/worksheets/sheet2.xml": `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>not this one</t></is></c></row></sheetData></worksheet>`,
      "xl/sharedStrings.xml": sst,
    }), { store: ["xl/sharedStrings.xml"] });
    const sheet = await readXlsx(bytes, parseXmlLite);
    expect(sheet.name).toBe("First");
    expect(sheet.rows).toEqual([
      ["Config Key", "Payload JSON ", null, "Section Rev"],
      ["RS:1", '{"a":"x & y <z>"}', null, 3],
      [null, null, null, null],
      [true, "#N/A", "line\rbreak", null],
    ]);
  });

  it("cells without a reference follow each other; a workbook whose sheet target is absolute (openpyxl) or missing from the rels", async () => {
    const ws = `<worksheet ${NS}><sheetData><row><c t="inlineStr"><is><t>A</t></is></c><c t="inlineStr"><is><t>B</t></is></c></row><row><c><v>1.5</v></c><c t="inlineStr"><is><t>two</t></is></c></row></sheetData></worksheet>`;
    const absolute = await readXlsx(await zip(book(`<sheet name="S" sheetId="1" r:id="rId1"/>`, rel("rId1", "worksheet", "/xl/worksheets/sheet1.xml"), { "xl/worksheets/sheet1.xml": ws })), parseXmlLite);
    expect(absolute.rows).toEqual([["A", "B"], [1.5, "two"]]);
    const noRels = await readXlsx(await zip({ "xl/workbook.xml": `<workbook ${NS}><sheets><sheet name="S" sheetId="1" r:id="rId9"/></sheets></workbook>`, "xl/worksheets/sheet1.xml": ws }), parseXmlLite);
    expect(noRels.rows[1]).toEqual([1.5, "two"]);
  });

  it("a long cell (25,000 characters of JSON with entities) is read whole", async () => {
    const big = JSON.stringify({ items: Array.from({ length: 800 }, (_, i) => ({ id: `S-${i}`, label: `Section <${i}> & "more"` })) });
    expect(big.length).toBeGreaterThan(25000);
    const esc = big.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const ws = `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Payload JSON</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${esc}</t></is></c></row></sheetData></worksheet>`;
    const sheet = await readXlsx(await zip(book(`<sheet name="S" sheetId="1" r:id="rId1"/>`, rel("rId1", "worksheet", "worksheets/sheet1.xml"), { "xl/worksheets/sheet1.xml": ws })), parseXmlLite);
    expect(sheet.rows[1][0]).toBe(big);
  });

  it("refuses what is no workbook, in plain words", async () => {
    await expect(readXlsx(new TextEncoder().encode("Config Key;Payload\nRS:1;{}"), parseXmlLite)).rejects.toThrow(XlsxError);
    await expect(readXlsx(await zip({ "word/document.xml": "<w/>" }), parseXmlLite)).rejects.toThrow("xl/workbook.xml is missing");
    await expect(readXlsx(await zip({ "xl/workbook.xml": `<workbook ${NS}><sheets></sheets></workbook>` }), parseXmlLite)).rejects.toThrow("no worksheet");
  });
});

describe("helpers", () => {
  it("columnOf", () => {
    expect([columnOf("A1"), columnOf("T13"), columnOf("Z9"), columnOf("AA2"), columnOf("ab7"), columnOf("12")]).toEqual([0, 19, 25, 26, 27, -1]);
  });
  it("parseXmlLite: attributes in either quote, CDATA, comments, character references, prefixes dropped from names", () => {
    const el = parseXmlLite(`<?xml version="1.0"?><!-- c --><x:a k='1' x:id="r"><b>t&#x41;&#66;</b><![CDATA[<raw>]]><c/></x:a>`);
    expect(el.name).toBe("a");
    expect(el.attrs).toMatchObject({ k: "1", "x:id": "r", id: "r" });
    expect(el.children).toEqual([{ name: "b", attrs: {}, children: ["tAB"] }, "<raw>", { name: "c", attrs: {}, children: [] }]);
  });
});
