// A minimal .xlsx reader for the data console's import (26 Oct; no npm dependency): the zip's central directory, each
// entry inflated with the browser's DecompressionStream("deflate-raw") (stored entries as they are), the XML read with
// DOMParser. Reads the FIRST worksheet of the workbook (xl/workbook.xml's first <sheet>, through its relationship) into
// a grid of cells: shared strings (xl/sharedStrings.xml, rich-text runs joined, phonetic runs left out), inline strings,
// formula strings, numbers, booleans and error texts; an empty or missing cell is null. Excel's _xHHHH_ escapes are
// decoded (ECMA-376 ST_Xstring). Cells may be long (the seed's Release Bundle JSON cells hold about 25,000 characters).
// Not read: dates as dates (a date cell stays its serial number), ZIP64, encrypted workbooks, formulas' expressions.
// Without DOMParser (node, the unit tests) a small XML parser of the same shape stands in (parseXmlLite).

export type Cell = string | number | boolean | null;
export interface Sheet {
  name: string;
  /** Row by row from row 1, each row from column A; missing cells are null. */
  rows: Cell[][];
}

export class XlsxError extends Error {}

// ---------------------------------------------------------------------------------- zip

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** The entries of the zip, from its central directory (the local headers may carry no sizes: bit 3). */
export function zipEntries(b: Uint8Array): Map<string, ZipEntry> {
  // the end-of-central-directory record: within the last 22 + 65535 bytes (its comment)
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("This is not an Excel workbook (.xlsx): no zip directory found.");
  const count = u16(b, eocd + 10);
  const cdOffset = u32(b, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new XlsxError("This workbook is too large to read here (ZIP64).");
  const names = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  let at = cdOffset;
  for (let n = 0; n < count; n++) {
    if (u32(b, at) !== 0x02014b50) throw new XlsxError("The workbook's zip directory is damaged.");
    const nameLen = u16(b, at + 28);
    const name = names.decode(b.subarray(at + 46, at + 46 + nameLen));
    out.set(name, { name, method: u16(b, at + 10), compressedSize: u32(b, at + 20), localOffset: u32(b, at + 42) });
    at += 46 + nameLen + u16(b, at + 30) + u16(b, at + 32);
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "function") throw new XlsxError("This browser cannot unpack an .xlsx file (no DecompressionStream). Use the JSON file instead.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One entry's bytes, unpacked. */
export async function zipRead(b: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  if (u32(b, e.localOffset) !== 0x04034b50) throw new XlsxError(`The workbook's entry ${e.name} is damaged.`);
  const start = e.localOffset + 30 + u16(b, e.localOffset + 26) + u16(b, e.localOffset + 28);
  const data = b.subarray(start, start + e.compressedSize);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRaw(data);
  throw new XlsxError(`The workbook's entry ${e.name} uses a compression this reader does not know (${e.method}).`);
}

// ---------------------------------------------------------------------------------- xml

/** An element: its local name (no prefix), its attributes (by qualified name, and by local name when that is free),
 *  its children (elements and text). */
export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: (XmlEl | string)[];
}
export type XmlParse = (text: string) => XmlEl;

const localOf = (qname: string) => qname.slice(qname.indexOf(":") + 1);

function fromDom(el: Element): XmlEl {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  for (const a of Array.from(el.attributes)) if (!(a.localName in attrs)) attrs[a.localName] = a.value;
  const children: (XmlEl | string)[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) children.push(fromDom(n as Element));
    else if (n.nodeType === 3 || n.nodeType === 4) children.push(n.nodeValue ?? "");
  }
  return { name: el.localName, attrs, children };
}

/** The browser's parser. */
export function parseXmlDom(text: string): XmlEl {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || !doc.documentElement) throw new XlsxError("The workbook holds a part that is not valid XML.");
  return fromDom(doc.documentElement);
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) =>
  s.indexOf("&") < 0
    ? s
    : s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITY[e]));

/** A small XML parser for where DOMParser is missing (node): elements, attributes, text, CDATA and the five entities
 *  plus character references; declarations, comments and processing instructions are skipped. Line ends are
 *  normalised to \n, as an XML parser does. */
export function parseXmlLite(input: string): XmlEl {
  const text = input.replace(/\r\n?/g, "\n");
  const root: XmlEl = { name: "#root", attrs: {}, children: [] };
  const stack: XmlEl[] = [root];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      stack[stack.length - 1].children.push(unescape(text.slice(i)));
      break;
    }
    if (lt > i) stack[stack.length - 1].children.push(unescape(text.slice(i, lt)));
    /** The index just past `close`, searched from the tag's start; a part that never closes is no XML. */
    const past = (close: string) => {
      const at = text.indexOf(close, lt);
      if (at < 0) throw new XlsxError("The workbook holds a part that is not valid XML.");
      return at + close.length;
    };
    if (text.startsWith("<!--", lt)) i = past("-->");
    else if (text.startsWith("<![CDATA[", lt)) {
      i = past("]]>");
      stack[stack.length - 1].children.push(text.slice(lt + 9, i - 3));
    } else if (text[lt + 1] === "?" || text[lt + 1] === "!") i = past(">");
    else if (text[lt + 1] === "/") {
      i = past(">");
      const name = localOf(text.slice(lt + 2, i - 1).trim());
      // the element it closes, with any left open inside it; a stray close tag closes nothing
      const at = stack.map((e) => e.name).lastIndexOf(name);
      if (at > 0) stack.length = at;
    } else {
      // the tag's end: the first ">" outside a quoted attribute value
      let j = lt + 1;
      let quote = "";
      for (; j < text.length; j++) {
        const ch = text[j];
        if (quote) quote = ch === quote ? "" : quote;
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === ">") break;
      }
      const body = text.slice(lt + 1, j);
      const selfClosing = body.endsWith("/");
      const inner = selfClosing ? body.slice(0, -1) : body;
      const m = /^\s*([^\s/>]+)/.exec(inner);
      if (!m) throw new XlsxError("The workbook holds a part that is not valid XML.");
      const el: XmlEl = { name: localOf(m[1]), attrs: {}, children: [] };
      for (const a of inner.slice(m[0].length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) el.attrs[a[1]] = unescape(a[3] ?? a[4] ?? "");
      for (const [k, v] of Object.entries(el.attrs)) if (!(localOf(k) in el.attrs)) el.attrs[localOf(k)] = v;
      if (j >= text.length) throw new XlsxError("The workbook holds a part that is not valid XML.");
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  const top = root.children.find((c): c is XmlEl => typeof c !== "string");
  if (!top) throw new XlsxError("The workbook holds a part that is not valid XML.");
  return top;
}

const defaultParse: XmlParse = (text) => (typeof DOMParser === "function" ? parseXmlDom(text) : parseXmlLite(text));

const kids = (el: XmlEl | undefined, name: string) => (el?.children ?? []).filter((c): c is XmlEl => typeof c !== "string" && c.name === name);
const kid = (el: XmlEl | undefined, name: string) => kids(el, name)[0];
/** The text of an element, every descendant's text joined, without phonetic runs (<rPh>) and their properties. */
function textOf(el: XmlEl | undefined): string {
  if (!el) return "";
  let s = "";
  for (const c of el.children) s += typeof c === "string" ? c : c.name === "rPh" || c.name === "phoneticPr" || c.name === "rPr" ? "" : textOf(c);
  return s;
}
/** A string item (<si>, <is>): its <t>, or its runs' <t> joined. */
function stringItem(el: XmlEl | undefined): string {
  if (!el) return "";
  const t = kid(el, "t");
  const runs = kids(el, "r");
  return decodeX(runs.length ? runs.map((r) => textOf(kid(r, "t"))).join("") : textOf(t));
}
/** ST_Xstring: _xHHHH_ is the character HHHH (Excel writes control characters so); _x005F_ escapes an underscore. */
const decodeX = (s: string) => (s.indexOf("_x") < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));

// ---------------------------------------------------------------------------------- workbook

/** "AB12" → column index 27 (0-based), or -1. */
export function columnOf(ref: string): number {
  const m = /^([A-Z]+)/i.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** A relationship target as a zip path: "/xl/worksheets/sheet1.xml" (absolute), "worksheets/sheet1.xml" (from xl/). */
function partPath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function cellValue(c: XmlEl, shared: string[]): Cell {
  const t = c.attrs.t ?? "n";
  const v = kid(c, "v");
  const raw = v ? textOf(v) : undefined;
  switch (t) {
    case "s": {
      const s = raw === undefined ? undefined : shared[Number(raw)];
      if (s === undefined) return null;
      return s === "" ? null : s;
    }
    case "inlineStr": {
      const s = stringItem(kid(c, "is"));
      return s === "" ? null : s;
    }
    case "str":
    case "e":
    case "d":
      return raw === undefined || raw === "" ? null : decodeX(raw);
    case "b":
      return raw === undefined ? null : raw.trim() === "1";
    default: {
      if (raw === undefined || raw.trim() === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
  }
}

/** The workbook's first worksheet. */
export async function readXlsx(bytes: Uint8Array, parse: XmlParse = defaultParse): Promise<Sheet> {
  const zip = zipEntries(bytes);
  const text = async (path: string) => {
    const e = zip.get(path);
    return e ? new TextDecoder("utf-8").decode(await zipRead(bytes, e)) : undefined;
  };
  const wbXml = await text("xl/workbook.xml");
  if (!wbXml) throw new XlsxError("This is not an Excel workbook (.xlsx): xl/workbook.xml is missing.");
  const wb = parse(wbXml);
  const first = kid(kid(wb, "sheets"), "sheet");
  const relsXml = await text("xl/_rels/workbook.xml.rels");
  const rels = relsXml ? kids(parse(relsXml), "Relationship") : [];
  const target = (id: string | undefined) => {
    const r = id ? rels.find((x) => x.attrs.Id === id) : undefined;
    return r ? partPath("xl/workbook.xml", r.attrs.Target ?? "") : undefined;
  };
  const sheetPath = target(first?.attrs["r:id"] ?? first?.attrs.id) ?? [...zip.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0];
  if (!first || !sheetPath || !zip.has(sheetPath)) throw new XlsxError("The workbook has no worksheet.");
  const sstRel = rels.find((r) => /\/sharedStrings$/.test(r.attrs.Type ?? ""));
  const sstXml = await text(sstRel ? partPath("xl/workbook.xml", sstRel.attrs.Target ?? "") : "xl/sharedStrings.xml");
  const shared = sstXml ? kids(parse(sstXml), "si").map(stringItem) : [];

  const ws = parse((await text(sheetPath))!);
  const rows: Cell[][] = [];
  let nextRow = 0;
  for (const row of kids(kid(ws, "sheetData"), "row")) {
    const r = row.attrs.r ? Number(row.attrs.r) - 1 : nextRow;
    nextRow = r + 1;
    const out: Cell[] = (rows[r] ??= []);
    let nextCol = 0;
    for (const c of kids(row, "c")) {
      const col = c.attrs.r ? columnOf(c.attrs.r) : nextCol;
      nextCol = col + 1;
      if (col >= 0) out[col] = cellValue(c, shared);
    }
  }
  // a loop, not map: a row the sheet skips is a hole in `rows`, which map would keep
  let width = 0;
  for (let i = 0; i < rows.length; i++) width = Math.max(width, rows[i]?.length ?? 0);
  return { name: first.attrs.name ?? "Sheet1", rows: Array.from({ length: rows.length }, (_, i) => Array.from({ length: width }, (_, j) => rows[i]?.[j] ?? null)) };
}
