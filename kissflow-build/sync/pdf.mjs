// The final PDF (plan v5 §10, AS-12, R-2): the final document (prototype/src/domain/finalDocument.ts) rendered as a PDF
// that looks like the app's "Final document" tab (prototype/src/features/rmm/tabs/FinalDocumentTab.tsx). Thomas, 27 Oct:
// "make sure when I hit download the pdf looks the same as the one in the UI".
//
// A small pure-JS PDF 1.4 writer, no dependency (adding an npm package needs Thomas's OK): the standard Helvetica and
// Helvetica-Bold fonts (WinAnsi, nothing embedded), A4 pages. It draws what the tab's design needs: RGB fills, strokes
// and text in the app's colour tokens, rules, rounded boxes, chips, wrapped rich text (mixed bold, sizes and colours on
// one line), label/value rows, multi-column tables whose header repeats after a page break, and boxed open-point threads
// that continue on the next page. A heading always stays with what follows it; a row moves to the next page whole and
// is split by lines only when it is taller than a page. Every page has the footer line with "Page X of Y"; every page
// after the first has the running header. No form fields, so nothing is ever "flattened". The text is real text
// (selectable), and the streams stay uncompressed. The output is deterministic for a given document: the same release
// always gives the same bytes, so a replay can recognise an attachment it already made.
//
// Content: exactly the final document JSON (header, metadata as released, sections in scope with answers, who/when and
// justifications, K2.1, evidence, every open point's thread round by round with attachments by name, confirmations),
// in the tab's order and wording. RMES, findings, decisions, internal notes and internal reasons are not in that JSON,
// so they cannot be in the PDF.

import { createHash } from "node:crypto";

// ------------------------------------------------------------------ fonts and encoding

// Glyph widths (1/1000 em, Adobe AFM) by WinAnsi code: F1 Helvetica, F2 Helvetica-Bold.
const rep = (w, n) => new Array(n).fill(w);
function widths(ascii, cp1252, latin1) {
  const t = new Array(256).fill(556);
  ascii.forEach((w, i) => (t[32 + i] = w));
  for (const [k, w] of Object.entries(cp1252)) t[Number(k)] = w;
  latin1.forEach((w, i) => (t[160 + i] = w));
  return t;
}
const HELVETICA = widths(
  [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, ...rep(556, 10), 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  { 0x80: 556, 0x82: 222, 0x83: 556, 0x84: 333, 0x85: 1000, 0x86: 556, 0x87: 556, 0x88: 333, 0x89: 1000, 0x8a: 667, 0x8b: 333, 0x8c: 1000, 0x8e: 611, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9a: 500, 0x9b: 333, 0x9c: 944, 0x9e: 500, 0x9f: 667 },
  [278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, ...rep(667, 6), 1000, 722, ...rep(667, 4), ...rep(278, 4), 722, 722, ...rep(778, 5), 584, 778, ...rep(722, 4), 667, 667, 611, ...rep(556, 6), 889, 500, ...rep(556, 4), ...rep(278, 4), 556, 556, ...rep(556, 5), 584, 611, ...rep(556, 4), 500, 556, 500],
);
const HELVETICA_BOLD = widths(
  [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, ...rep(556, 10), 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
  { 0x80: 556, 0x82: 278, 0x83: 556, 0x84: 500, 0x85: 1000, 0x86: 556, 0x87: 556, 0x88: 333, 0x89: 1000, 0x8a: 667, 0x8b: 333, 0x8c: 1000, 0x8e: 611, 0x91: 278, 0x92: 278, 0x93: 500, 0x94: 500, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9a: 556, 0x9b: 333, 0x9c: 944, 0x9e: 500, 0x9f: 667 },
  [278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, ...rep(722, 6), 1000, 722, ...rep(667, 4), ...rep(278, 4), 722, 722, ...rep(778, 5), 584, 778, ...rep(722, 4), 667, 667, 611, ...rep(556, 6), 889, 556, ...rep(556, 4), ...rep(278, 4), 611, 611, ...rep(611, 5), 584, 611, ...rep(611, 4), 556, 611, 556],
);

// Unicode → WinAnsi (cp1252) code; characters outside it become a close ASCII form, else "?".
const CP1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
const FALLBACK = { "≤": "<=", "≥": ">=", "→": "->", "←": "<-", "−": "-", "×": "x", "≈": "~", "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2002": " ", "\u2003": " ", "\u2007": " ", "\u2009": " ", "\u200a": " ", "\u202f": " ", "\u200b": "", "\u2060": "", "\ufeff": "" };
const nfc = (s) => (typeof s.normalize === "function" ? s.normalize("NFC") : s);
function encode(text, keepNewlines) {
  let out = "";
  for (const ch of nfc(String(text ?? ""))) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) out += ch;
    else if (c >= 0xa0 && c <= 0xff) out += ch;
    else if (CP1252[ch]) out += String.fromCharCode(CP1252[ch]);
    else if (FALLBACK[ch] !== undefined) out += FALLBACK[ch];
    else if (ch === "\n") out += keepNewlines ? "\n" : " ";
    else if (ch === "\t") out += " ";
    else if (ch === "\r" || (c >= 0x300 && c <= 0x36f)) out += ""; // CR of CRLF; a combining mark NFC could not join
    else out += "?";
  }
  return out;
}
/** Unicode → the WinAnsi string the PDF shows (a newline becomes a space). */
export const winAnsi = (text) => encode(text, false);
const esc = (s) => [...s].map((ch) => (ch === "\\" || ch === "(" || ch === ")" ? `\\${ch}` : ch.charCodeAt(0) > 126 ? `\\${ch.charCodeAt(0).toString(8).padStart(3, "0")}` : ch)).join("");

// ------------------------------------------------------------------ the app's design tokens (styles.css, light theme)

// oklch → sRGB, 0…1.
const C = {
  surface2: [0.944, 0.956, 0.971], // --surface-2 #f1f4f7
  line: [0.86, 0.879, 0.903], // --line #dbe0e6
  ink: [0.081, 0.122, 0.197], // --ink #151f32
  ink2: [0.278, 0.314, 0.379], // --ink-2 #475061
  ink3: [0.454, 0.481, 0.528], // --ink-3 #747b87
  brand: [0, 0.196, 0.645], // --brand #0032a5 (Beiersdorf blue)
  ok: [0.078, 0.529, 0.307], // --ok #14874e
  okSoft: [0.857, 0.969, 0.89], // --ok-soft #daf7e3
  bad: [0.801, 0.199, 0.211], // --bad #cc3336
  badSoft: [1, 0.902, 0.889], // --bad-soft #ffe6e3
  neutralSoft: [0.892, 0.911, 0.936], // --surface-3 #e3e8ef
};

// Text styles: the tab's sizes (px) at print scale. s = size (pt), b = bold, c = colour, sp = letter spacing (pt).
const S = {
  eyebrow: { s: 7.4, b: 1, c: C.brand, sp: 0.55 },
  title: { s: 17, b: 1, c: C.ink, lh: 1.2 },
  sub: { s: 9.8, c: C.ink2 },
  caseCode: { s: 11.5, b: 1, c: C.ink },
  metaKey: { s: 7.4, c: C.ink3 },
  metaValue: { s: 9.1, c: C.ink },
  intro: { s: 8.3, c: C.ink2, lh: 1.42 },
  partNo: { s: 11.5, b: 1, c: C.ink3 },
  part: { s: 11.5, b: 1, c: C.ink },
  h4: { s: 9.8, b: 1, c: C.ink },
  tag: { s: 7.5, c: C.ink3 },
  label: { s: 8.3, c: C.ink2 },
  value: { s: 8.8, c: C.ink },
  muted: { s: 8.8, c: C.ink3 },
  just: { s: 8, c: C.ink2 },
  who: { s: 7.4, c: C.ink3 },
  note: { s: 8.3, c: C.ink2 },
  th: { s: 7.3, b: 1, c: C.ink3 },
  td: { s: 8.2, c: C.ink },
  tdBold: { s: 8.2, b: 1, c: C.ink },
  td2: { s: 8.2, c: C.ink2 },
  td3: { s: 8.2, c: C.ink3 },
  tdSmall: { s: 7.4, c: C.ink3 },
  round: { s: 6.9, b: 1, c: C.ink3, sp: 0.45 },
  small: { s: 7.5, c: C.ink3 },
  small2: { s: 7.5, c: C.ink2 },
  chrome: { s: 7, c: C.ink3 },
};

// ------------------------------------------------------------------ rich text: runs, measuring, wrapping

const LH = 1.36;
/** A run: WinAnsi text in one style (newlines kept for wrapping). */
const R = (text, style) => ({ t: encode(text, true), s: style.s, b: style.b ? 1 : 0, c: style.c, sp: style.sp ?? 0, lh: style.lh ?? LH });
const textW = (t, r) => {
  const w = r.b ? HELVETICA_BOLD : HELVETICA;
  let n = 0;
  for (let i = 0; i < t.length; i++) n += w[t.charCodeAt(i)];
  return (n * r.s) / 1000 + r.sp * t.length;
};
const runsW = (runs) => runs.reduce((n, r) => n + textW(r.t, r), 0);
const sameStyle = (a, b) => a.s === b.s && a.b === b.b && a.c === b.c && a.sp === b.sp;
const lineOf = (runs, fallback) => {
  const s = runs.reduce((m, r) => Math.max(m, r.s), 0) || fallback.s;
  const lh = runs.reduce((m, r) => Math.max(m, r.s * r.lh), 0) || fallback.s * fallback.lh;
  return { runs, w: runsW(runs), s, h: lh };
};

/** Wraps runs into lines of at most maxW: at spaces, keeping newlines; a word longer than a line is cut (after a "-",
 *  "_", "/" or "." where one is near the end of the cut). */
function wrap(runs, maxW) {
  const lines = [];
  let cur = [];
  let w = 0;
  let last = runs[0] ?? R("", S.value);
  const flush = () => {
    while (cur.length) {
      const k = cur[cur.length - 1];
      const t = k.t.replace(/ +$/, "");
      if (t === k.t) break;
      if (t) {
        cur[cur.length - 1] = { ...k, t };
        break;
      }
      cur.pop();
    }
    lines.push(lineOf(cur, last));
    cur = [];
    w = 0;
  };
  const add = (r, t) => {
    const k = cur[cur.length - 1];
    if (k && sameStyle(k, r)) cur[cur.length - 1] = { ...k, t: k.t + t };
    else cur.push({ ...r, t });
    w += textW(t, r);
  };
  const fits = (r, t) => w + textW(t, r) <= maxW + 0.001;
  for (const r of runs) {
    last = r;
    r.t.split("\n").forEach((para, i) => {
      if (i > 0) flush();
      for (const tok of para.split(/( +)/)) {
        if (!tok) continue;
        if (tok[0] === " ") {
          if (cur.length) add(r, tok);
          continue;
        }
        if (fits(r, tok)) {
          add(r, tok);
          continue;
        }
        if (w > 0) {
          flush();
          if (fits(r, tok)) {
            add(r, tok);
            continue;
          }
        }
        // longer than a line: cut it into line-wide pieces (one pass over the characters: linear in its length)
        const glyph = r.b ? HELVETICA_BOLD : HELVETICA;
        let i = 0;
        while (i < tok.length) {
          let n = 0;
          let acc = 0;
          while (i + n < tok.length) {
            const cw = (glyph[tok.charCodeAt(i + n)] * r.s) / 1000 + r.sp;
            if (n > 0 && acc + cw > maxW + 0.001) break;
            acc += cw;
            n++;
          }
          if (i + n < tok.length) {
            const piece = tok.slice(i, i + n);
            const soft = Math.max(...["-", "_", "/", "."].map((x) => piece.lastIndexOf(x, n - 2)));
            if (soft + 1 >= Math.ceil(n * 0.4)) n = soft + 1;
            add(r, tok.slice(i, i + n));
            flush();
          } else add(r, tok.slice(i));
          i += n;
        }
      }
    });
  }
  flush();
  return lines;
}
const tidy = (v) => String(v ?? "").replace(/^[\s\n]+|[\s\n]+$/g, "");

// ------------------------------------------------------------------ drawing (PDF operators; y is measured from the top)

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 46; // left and right margin
const CW = PAGE_W - 2 * MX; // content width
const TOP_FIRST = 44; // page 1 starts with the document header
const TOP = 58; // later pages start below the running header
const BOTTOM = PAGE_H - 52; // above the footer line

const n2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
const col = (c) => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
const Y = (y) => PAGE_H - y;

/** One line of runs at a baseline: one BT…ET text object per shown line. */
function drawLine(ops, x, baseline, runs) {
  let s = `BT ${n2(x)} ${n2(Y(baseline))} Td`;
  let font = "";
  let fill = "";
  let sp = 0;
  for (const r of runs) {
    if (!r.t) continue;
    const f = `/${r.b ? "F2" : "F1"} ${n2(r.s)} Tf`;
    if (f !== font) s += ` ${(font = f)}`;
    const c = `${col(r.c)} rg`;
    if (c !== fill) s += ` ${(fill = c)}`;
    if (r.sp !== sp) s += ` ${n2((sp = r.sp))} Tc`;
    s += ` (${esc(r.t)}) Tj`;
  }
  if (sp) s += " 0 Tc";
  ops.push(`${s} ET`);
}
/** A wrapped line in a box of its own height that starts at yTop, aligned left or right within [x, x + w]. */
const placeLine = (ops, line, x, yTop, w, align) => drawLine(ops, align === "right" ? x + w - line.w : x, yTop + line.h / 2 + line.s * 0.35, line.runs);

/** A rectangle path with per-corner radii [top-left, top-right, bottom-right, bottom-left]. */
function boxPath(x, y, w, h, r) {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
  const k = 0.5523;
  const L = x;
  const Rt = x + w;
  const T = Y(y);
  const B = Y(y + h);
  const p = [`${n2(L + tl)} ${n2(T)} m`, `${n2(Rt - tr)} ${n2(T)} l`];
  if (tr) p.push(`${n2(Rt - tr + k * tr)} ${n2(T)} ${n2(Rt)} ${n2(T - tr + k * tr)} ${n2(Rt)} ${n2(T - tr)} c`);
  p.push(`${n2(Rt)} ${n2(B + br)} l`);
  if (br) p.push(`${n2(Rt)} ${n2(B + br - k * br)} ${n2(Rt - br + k * br)} ${n2(B)} ${n2(Rt - br)} ${n2(B)} c`);
  p.push(`${n2(L + bl)} ${n2(B)} l`);
  if (bl) p.push(`${n2(L + bl - k * bl)} ${n2(B)} ${n2(L)} ${n2(B + bl - k * bl)} ${n2(L)} ${n2(B + bl)} c`);
  p.push(`${n2(L)} ${n2(T - tl)} l`);
  if (tl) p.push(`${n2(L)} ${n2(T - tl + k * tl)} ${n2(L + tl - k * tl)} ${n2(T)} ${n2(L + tl)} ${n2(T)} c`);
  return `${p.join(" ")} h`;
}
const fillBox = (ops, x, y, w, h, r, c) => ops.push(`${col(c)} rg ${boxPath(x, y, w, h, r)} f`);
const strokeBox = (ops, x, y, w, h, r, c, lw = 0.7) => ops.push(`q ${col(c)} RG ${n2(lw)} w ${boxPath(x, y, w, h, r)} S Q`);
const rule = (ops, x1, x2, y, c = C.line, lw = 0.6) => ops.push(`q ${col(c)} RG ${n2(lw)} w ${n2(x1)} ${n2(Y(y))} m ${n2(x2)} ${n2(Y(y))} l S Q`);
/** A polyline (icons), points relative to (x, y) going down. */
const strokePath = (ops, x, y, pts, c, lw, close = false) =>
  ops.push(`q ${col(c)} RG ${n2(lw)} w 1 J 1 j ${pts.map(([a, b], i) => `${n2(x + a)} ${n2(Y(y + b))} ${i ? "l" : "m"}`).join(" ")}${close ? " h" : ""} S Q`);
/** The tab's check mark (lucide ShieldCheck / FileCheck2, simplified) in a square of side z. */
const checkMark = (ops, x, y, z, c) => strokePath(ops, x, y, [[0.12 * z, 0.52 * z], [0.4 * z, 0.8 * z], [0.9 * z, 0.22 * z]], c, Math.max(0.7, z * 0.14));
/** FileCheck2, simplified: a page with a folded corner and a check. */
function fileIcon(ops, x, y, z, c) {
  const w = z * 0.78;
  strokePath(ops, x, y, [[0, 0], [w * 0.62, 0], [w, z * 0.26], [w, z], [0, z]], c, 0.75, true);
  strokePath(ops, x, y, [[w * 0.62, 0], [w * 0.62, z * 0.26], [w, z * 0.26]], c, 0.6);
  strokePath(ops, x, y, [[w * 0.22, z * 0.62], [w * 0.42, z * 0.8], [w * 0.78, z * 0.46]], c, 0.75);
}

// ------------------------------------------------------------------ the page flow

/** Pages, the cursor and page breaks. Open blocks (a table, an open-point box) register what they draw before and
 *  after a break: the box's border is closed on the old page, the table header or the box's continuation strip is
 *  drawn on the new one. */
function pageFlow() {
  const pages = [];
  const open = [];
  const F = {
    ops: null,
    y: 0,
    mark: 0,
    get pageCount() {
      return pages.length;
    },
    newPage() {
      F.ops = [];
      pages.push(F.ops);
      F.y = pages.length === 1 ? TOP_FIRST : TOP;
      F.mark = F.y;
    },
    /** Nothing drawn on this page yet but the continuation headers. */
    fresh: () => F.y <= F.mark + 0.01,
    left: () => BOTTOM - F.y,
    /** The room a new page offers below the continuation headers of the open blocks. */
    freshRoom: () => BOTTOM - TOP - open.reduce((n, b) => n + (b.h ?? 0), 0),
    break() {
      for (let i = open.length - 1; i >= 0; i--) open[i].before?.();
      F.newPage();
      for (const b of open) b.after?.();
      F.mark = F.y;
    },
    /** A new page unless h fits (or the page is fresh anyway). */
    need(h) {
      if (h > F.left() + 0.01 && !F.fresh()) F.break();
    },
    gap(h) {
      if (!F.fresh()) F.y = Math.min(F.y + h, BOTTOM);
    },
    push: (b) => open.push(b),
    pop: () => open.pop(),
    pages,
  };
  F.newPage();
  return F;
}

/** Text atoms of a cell: one per wrapped line, with the part's gap above its first line. Each part: { runs, gap }. */
function atoms(parts, w, align = "left") {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    wrap(p.runs, w).forEach((line, i) => {
      const gap = i === 0 ? (p.gap ?? 0) : 0;
      out.push({ h: gap + line.h, draw: (ops, x, y) => placeLine(ops, line, x, y + gap, w, align) });
    });
  }
  return out;
}
const height = (as, from = 0) => as.slice(from).reduce((n, a) => n + a.h, 0);

/** Side-by-side cells as one row (cols: { x, atoms }), with a rule above when `divider` and not at a page top. The row
 *  moves to the next page whole when it fits there; one taller than a page is split by lines. */
function drawRow(F, cols, { padT = 4, padB = 4, divider = false, x1 = MX, x2 = MX + CW } = {}) {
  let from = cols.map(() => 0);
  const total = Math.max(0, ...cols.map((c) => height(c.atoms))) + padT + padB;
  if (total > F.left() + 0.01 && !F.fresh() && (total <= F.freshRoom() || F.left() < Math.min(total, 44))) F.break();
  for (let first = true; ; first = false) {
    const room = F.left() - padT - padB;
    const take = cols.map((c, i) => {
      let h = 0;
      let j = from[i];
      while (j < c.atoms.length && h + c.atoms[j].h <= room + 0.01) h += c.atoms[j++].h;
      if (j === from[i] && j < c.atoms.length && F.fresh()) h += c.atoms[j++].h; // always progress on a fresh page
      return { j, h };
    });
    if (cols.some((c, i) => from[i] < c.atoms.length) && take.every((t, i) => t.j === from[i])) {
      F.break();
      continue;
    }
    if (divider && first && !F.fresh()) rule(F.ops, x1, x2, F.y, C.line, 0.5);
    cols.forEach((c, i) => {
      let y = F.y + padT;
      for (let j = from[i]; j < take[i].j; j++) {
        c.atoms[j].draw(F.ops, c.x, y);
        y += c.atoms[j].h;
      }
    });
    F.y += padT + Math.max(0, ...take.map((t) => t.h)) + padB;
    from = take.map((t) => t.j);
    if (cols.every((c, i) => from[i] >= c.atoms.length)) return;
    F.break();
  }
}
const rowHeight = (cols, padT = 4, padB = 4) => Math.max(0, ...cols.map((c) => height(c.atoms))) + padT + padB;

/** A paragraph over the content width (lines flow across pages). */
const para = (F, runs, { x = MX, w = CW, gap = 0 } = {}) => drawRow(F, [{ x, atoms: atoms([{ runs }], w) }], { padT: gap, padB: 0 });

/** A table (the tab's <Table dense>): columns { head, weight | nowrap, max }, each cell a list of parts. The header row
 *  repeats at the top of every page the table continues on. */
function table(F, columns, rows) {
  const PX = 4.5;
  const natural = (parts) => Math.max(0, ...parts.filter(Boolean).map((p) => Math.max(...wrap(p.runs, 1e9).map((l) => l.w))));
  const fixed = columns.map((c, k) => (c.nowrap ? Math.min(Math.max(runsW([R(c.head, S.th)]), ...rows.map((r) => natural(r[k]))) + 2 * PX, c.max ?? CW * 0.3) : 0));
  const rest = CW - fixed.reduce((a, b) => a + b, 0);
  const weights = columns.reduce((n, c) => n + (c.nowrap ? 0 : c.weight ?? 1), 0);
  const ws = columns.map((c, k) => (c.nowrap ? fixed[k] : (rest * (c.weight ?? 1)) / weights));
  const xs = ws.map((_, k) => MX + ws.slice(0, k).reduce((a, b) => a + b, 0));
  const cellsOf = (cells) => cells.map((parts, k) => ({ x: xs[k] + PX, atoms: atoms(parts, ws[k] - 2 * PX, columns[k].align) }));
  const head = () => cellsOf(columns.map((c) => [{ runs: [R(c.head, S.th)] }]));
  const headH = rowHeight(head(), 3.5, 3.5);
  const drawHead = () => {
    drawRow(F, head(), { padT: 3.5, padB: 3.5 });
    rule(F.ops, MX, MX + CW, F.y, C.line, 0.6);
    F.y += 0.6;
  };
  const body = rows.map(cellsOf);
  F.need(headH + Math.min(rowHeight(body[0] ?? [], 4.2, 4.2), 120));
  drawHead();
  F.push({ h: headH + 0.6, after: drawHead });
  F.mark = F.y;
  body.forEach((cells, i) => drawRow(F, cells, { padT: 4.2, padB: 4.2, divider: i > 0 }));
  F.pop();
}

// ------------------------------------------------------------------ the seal's wording

// As written here: the sync service's seal, the SHA-256 of the document's canonical JSON filed on CIQ Case Data. The
// final-document service (Bundle.gs) and the app's "Download PDF" print the app's document seal instead: their builds
// replace this block exactly (kissflow-build/final-pdf/src/pdf-patches.mjs).
const SEAL = {
  footer: (h, seal) => `Document seal (SHA-256 of the final document JSON): ${seal}`,
  note: (seal) => `Document seal: SHA-256 ${seal} over the canonical JSON of this final document (keys sorted, no whitespace). The JSON is filed on the case data; the seal can be recomputed at any time.`,
  producer: "CIQ Sync Service",
  subject: (seal) => `seal sha256:${seal}`,
};

// ------------------------------------------------------------------ the document

const utc = (iso) => String(iso).replace("T", " ").slice(0, 16) + " UTC";
let fmt = utc;
/** The date renderer for the next renders (the final-document service: its TIME_ZONE); default UTC. */
export const setDateFormat = (f) => {
  fmt = typeof f === "function" ? f : utc;
};
const d = (iso) => (iso ? fmt(String(iso)) : "—");
const list = (xs) => (Array.isArray(xs) ? xs : []);
const txt = (v) => (v == null || v === "" ? "—" : String(v));
// The section code as the tab shows it: left out when the title already starts with it (catalog.ts shownCode).
const shownCode = (s) => (String(s.title ?? "").toLowerCase().startsWith(String(s.code ?? "").toLowerCase()) ? "" : txt(s.code));
// Sections with a block of their own in part 1 (the tab's hasAnswers): answers, a justification, or K2.1.
const hasAnswers = (s) => list(s.answers).length > 0 || !!s.justification || s.sectionId === "K2.1";

/**
 * Render the final document as PDF bytes, laid out as the app's Final document tab.
 * @param {object} doc   FinalDocument (finalDocument.ts), as the tab words it (final-pdf/src/entry.ts displayCopy)
 * @param {string} seal  the document seal
 * @param {{ verified?: boolean }} [opts]  verified: the seal was checked against the content (the tab's badge)
 */
export function renderFinalPdf(doc, seal, opts = {}) {
  const h = doc.header ?? {};
  const verified = opts.verified;
  const F = pageFlow();

  // ---- the header: eyebrow, material, INCI; the case code and the seal badge on the right
  {
    const y0 = F.y;
    const rightW = 170;
    const leftW = CW - rightW - 16;
    fileIcon(F.ops, MX, y0 + 1, 8.4, C.brand);
    drawLine(F.ops, MX + 11, y0 + 7.8, [R("CIQ final document".toUpperCase(), S.eyebrow)]);
    let yl = y0 + 15;
    for (const a of atoms([{ runs: [R(txt(h.materialName), S.title)] }, { runs: [R(txt(h.inci), S.sub)], gap: 2 }], leftW)) {
      a.draw(F.ops, MX, yl);
      yl += a.h;
    }
    let yr = y0;
    for (const a of atoms([{ runs: [R(txt(h.caseId), S.caseCode)] }], rightW, "right")) {
      a.draw(F.ops, MX + CW - rightW, yr);
      yr += a.h;
    }
    const tone = verified === true ? [C.okSoft, C.ok] : verified === false ? [C.badSoft, C.bad] : [C.neutralSoft, C.ink2];
    const chip = [R(verified === true ? "Document seal: unchanged" : verified === false ? "Document seal broken" : "Document seal", { s: 7.3, b: 1, c: tone[1] })];
    const icon = verified === true ? 9.5 : 0;
    const cw = runsW(chip) + icon + 11;
    const cx = MX + CW - cw;
    yr += 3;
    fillBox(F.ops, cx, yr, cw, 13, 6.5, tone[0]);
    if (icon) checkMark(F.ops, cx + 5.5, yr + 3.6, 6, tone[1]);
    drawLine(F.ops, cx + 5.5 + icon, yr + 9.1, chip);
    F.y = Math.max(yl, yr + 13) + 14;
  }
  // ---- the header's facts: two columns, label above value
  {
    const pairs = [
      ["BDF material no.", txt(h.materialNo)],
      ["Supplier", `${txt(h.supplierName)} · DUNS ${txt(h.duns)}`],
      ["Manufacturer", txt(h.manufacturer)],
      ["Production site", txt(h.site)],
      ["Target markets", list(h.markets).join(", ") || "—"],
      ["Questionnaire · rule set", `${txt(h.templateVersion)} · ${txt(h.ruleSetVersion)}`],
      ["Case owner (RMM)", txt(h.ownerName)],
      ["Case started · released", `${d(h.createdAt)} · ${d(h.releasedAt)}`],
    ];
    const colW = (CW - 28) / 2;
    for (let i = 0; i < pairs.length; i += 2)
      drawRow(
        F,
        pairs.slice(i, i + 2).map(([k, v], j) => ({ x: MX + j * (colW + 28), atoms: atoms([{ runs: [R(k, S.metaKey)] }, { runs: [R(v, S.metaValue)], gap: 0.5 }], colW) })),
        { padT: 0, padB: 6.5 },
      );
  }
  // ---- the note under the facts (the tab's grey box)
  {
    const by = String(doc.trigger ?? "").replace(/^Final release by /, "");
    const sealLine = verified === true ? " The document seal confirms it is unchanged since the final release." : verified === false ? " The document seal is broken: the content has changed since the final release. Report this to the business administrator." : "";
    const lines = wrap([R(`Created automatically at the supplier's final release (${[by, d(doc.generatedAt)].filter(Boolean).join(", ")}). It cannot be changed.${sealLine}`, S.intro)], CW - 18);
    const boxH = lines.reduce((n, l) => n + l.h, 0) + 12;
    F.y += 5;
    fillBox(F.ops, MX, F.y, CW, boxH, 5, C.surface2);
    let y = F.y + 6;
    for (const l of lines) {
      placeLine(F.ops, l, MX + 9, y, CW - 18);
      y += l.h;
    }
    F.y += boxH + 18;
    rule(F.ops, MX, MX + CW, F.y, C.line, 0.75);
  }

  /** A part of the tab: the rule above it (part 1: the header's), "<n>. <title>", then its body. The rule is drawn only
   *  when the heading stays on the same page, so no page ends on a lone rule. */
  const part = (n, title, body) => {
    const head = wrap([R(`${n}.`, S.partNo), R(` ${title}`, S.part)], CW);
    const headH = head.reduce((m, l) => m + l.h, 0) + 6;
    F.gap(17);
    if (n > 1) {
      F.need(17 + headH + 40);
      if (!F.fresh()) {
        rule(F.ops, MX, MX + CW, F.y, C.line, 0.75);
        F.y += 17;
      }
    } else F.need(headH + 40);
    for (const l of head) {
      placeLine(F.ops, l, MX, F.y, CW);
      F.y += l.h;
    }
    F.y += 6;
    body();
  };
  /** A section heading (h4) with its rule, kept with the first `next` points of what follows. */
  const heading4 = (runs, next) => {
    const lines = wrap(runs, CW);
    const hh = lines.reduce((n, l) => n + l.h, 0);
    F.need(hh + 4 + Math.min(next, 110));
    for (const l of lines) {
      placeLine(F.ops, l, MX, F.y, CW);
      F.y += l.h;
    }
    F.y += 3.5;
    rule(F.ops, MX, MX + CW, F.y, C.line, 0.6);
    F.y += 0.6;
  };
  // label/value rows (the tab's <dl> grid 2fr / 3fr)
  const LW = (CW - 16) * 0.4;
  const VX = MX + LW + 16;
  const VW = CW - LW - 16;
  const dlRow = (labelRuns, valueParts) => [
    { x: MX, atoms: atoms([{ runs: labelRuns }], LW) },
    { x: VX, atoms: atoms(valueParts, VW) },
  ];
  const dl = (rows) => rows.forEach((cols, i) => drawRow(F, cols, { padT: 4.5, padB: 4.5, divider: i > 0 }));
  const whoLine = (by, at) => (by ? { runs: [R(`${by}${at ? ` · ${d(at)}` : ""}`, S.who)], gap: 1.5 } : null);

  part(1, "Released answers by section", () => {
    const sections = list(doc.sections);
    let blocks = 0;
    const block = (draw) => {
      if (blocks++) F.gap(15);
      draw();
    };
    const metadata = () => {
      const ms = list(doc.metadata);
      if (!ms.length) return;
      block(() => {
        const rows = ms.map((m) => {
          const unanswered = m.value === "—" || m.value === "Not answered" || m.value == null;
          return dlRow([R(txt(m.code), { s: 7.5, c: C.ink3 }), R("  ", S.label), R(txt(m.label), S.label)], [
            { runs: [R(unanswered ? "Not answered" : String(m.value), unanswered ? S.muted : S.value)] },
            m.setByBdf ? { runs: [R("Set by Beiersdorf at case start", S.who)], gap: 1.5 } : whoLine(m.by, m.at),
          ]);
        });
        heading4([R("Metadata answers", S.h4), R("  SF-01 to SF-12 · they set the scope", S.tag)], rowHeight(rows[0], 4.5, 4.5));
        dl(rows);
      });
    };
    const section = (s) =>
      block(() => {
        const answers = list(s.answers);
        const rows = answers.map((a) =>
          dlRow([R(txt(a.label), S.label)], [{ runs: [R(txt(tidy(a.value)), S.value)] }, a.justification ? { runs: [R(`Justification: ${tidy(a.justification)}`, S.just)], gap: 1.5 } : null, whoLine(a.by, a.at)]),
        );
        const code = shownCode(s);
        const tag = `${txt(s.applicability)}${s.addedLater ? " · added after completeness" : ""}`;
        const justification = s.justification ? atoms([{ runs: [R(`Justification: ${tidy(s.justification)}`, S.note)] }], CW) : [];
        heading4([...(code ? [R(code, S.h4), R(" ", S.h4)] : []), R(txt(s.title), S.h4), R(`  ${tag}`, S.tag)], height(justification) + 5 + (rows[0] ? rowHeight(rows[0], 4.5, 4.5) : 14));
        if (s.justification) drawRow(F, [{ x: MX, atoms: justification }], { padT: 5, padB: 1 });
        if (!answers.length) para(F, [R(s.sectionId === "K2.1" ? "See the composition in part 2." : "No field-level answers.", { s: 8.3, c: C.ink3 })], { gap: 5 });
        else dl(rows);
      });
    if (!sections.some((s) => s.sectionId === "GEN" && hasAnswers(s))) metadata();
    for (const s of sections.filter(hasAnswers)) {
      section(s);
      if (s.sectionId === "GEN") metadata();
    }
    const others = sections.filter((s) => !hasAnswers(s));
    if (others.length)
      block(() => {
        const intro = atoms([{ runs: [R("Answered with documents only (the CIQ template document, statements or certificates); the upload is optional. Each section shows the files uploaded to it, which are also listed under Evidence (part 3).", S.note)] }], CW);
        heading4([R("Further sections in scope", S.h4)], height(intro) + 30);
        drawRow(F, [{ x: MX, atoms: intro }], { padT: 5, padB: 4 });
        const colW = (CW - 18) / 2;
        const item = (s, x) => {
          const files = list(doc.evidence).filter((e) => e.sectionId === s.sectionId);
          const count = [R(`${files.length ? `${files.length} ${files.length === 1 ? "document" : "documents"}` : "No document provided"}${s.addedLater ? " · added later" : ""}`, { s: 7.1, c: C.ink3 })];
          const countW = runsW(count);
          const code = shownCode(s);
          // the applicability as a tag after the title (the tab leaves it out here; the PDF keeps every fact it held)
          const title = atoms([{ runs: [...(code ? [R(code, { s: 8.2, c: C.ink }), R("  ", { s: 8.2, c: C.ink })] : []), R(txt(s.title), { s: 8.2, c: C.ink2 }), R(`  ${txt(s.applicability)}`, { s: 7.1, c: C.ink3 })] }], colW - countW - 8);
          const countLine = lineOf(count, count[0]);
          if (title[0]) {
            const first = title[0];
            title[0] = { h: first.h, draw: (ops, x0, y) => (first.draw(ops, x0, y), placeLine(ops, countLine, x0, y + (first.h - countLine.h) / 2, colW, "right")) };
          }
          return { x, atoms: [...title, ...(files.length ? atoms([{ runs: [R(files.map((e) => e.name).join(", "), { s: 7.4, c: C.ink3 })], gap: 0.5 }], colW) : [])] };
        };
        for (let i = 0; i < others.length; i += 2) drawRow(F, others.slice(i, i + 2).map((s, j) => item(s, MX + j * (colW + 18))), { padT: 2.2, padB: 2.2 });
      });
  });

  part(2, "Composition (K2.1)", () => {
    const comps = list(doc.components);
    if (!comps.length) return para(F, [R("No components.", S.muted)]);
    const one = (v, style) => [{ runs: [R(txt(v), style)] }];
    table(
      F,
      [
        { head: "#", nowrap: true },
        { head: "INCI / IUPAC", weight: 3 },
        { head: "CAS", nowrap: true, max: 80 },
        { head: "EC / REACH no.", nowrap: true, max: 72 },
        { head: "Function", weight: 1.8 },
        { head: "Origin", weight: 1.5 },
        { head: "Additive", nowrap: true },
        { head: "Concentration", nowrap: true, max: 90 },
      ],
      comps.map((r, i) => [
        one(i + 1, S.td3),
        one(r.inci, S.tdBold),
        one(r.cas, S.td),
        one(r.ec, S.td),
        one(r.fn, S.td2),
        one(r.origin, S.td2),
        // matrix v0.6 (28 Oct): no default for Additive (null = unanswered); a blank concentration is null, and a legacy
        // 0–0 row means nothing was entered
        one(r.additive == null ? "—" : r.additive ? "Yes" : "No", S.td2),
        one((r.concMin == null && r.concMax == null) || (r.concMin === 0 && r.concMax === 0) ? "—" : `${r.concMin ?? "—"}–${r.concMax ?? "—"} %`, S.td),
      ]),
    );
  });

  part(3, "Evidence", () => {
    const ev = list(doc.evidence);
    if (!ev.length) return para(F, [R("No documents were uploaded.", S.muted)]);
    table(
      F,
      [
        { head: "Document", weight: 3.3 },
        { head: "Section / question", weight: 2.7 },
        { head: "Uploaded by", nowrap: true, max: CW * 0.22 },
        { head: "Upload date", nowrap: true, max: CW * 0.24 },
      ],
      ev.map((e) => {
        const justified = e.justification !== undefined;
        return [
          justified ? [{ runs: [R("Not provided", { ...S.tdBold, c: C.ink2 })] }, { runs: [R(`Justification: ${tidy(e.justification)}`, S.just)], gap: 1 }] : [{ runs: [R(txt(e.name), S.tdBold)] }],
          [{ runs: [R(txt(e.sectionCode), S.td)] }, e.fieldLabel ? { runs: [R(e.fieldLabel, S.tdSmall)], gap: 1 } : null],
          [{ runs: [R(txt(e.uploadedBy), S.td2)] }, justified ? { runs: [R("justified", S.tdSmall)], gap: 1 } : null],
          [{ runs: [R(d(e.uploadedAt), S.td2)] }],
        ];
      }),
    );
  });

  part(4, "Open points, round by round", () => {
    const threads = list(doc.threads);
    if (!threads.length) return para(F, [R("No open point was raised.", S.muted)]);
    threads.forEach((t, ti) => {
      if (ti) F.gap(12);
      thread(F, t);
    });
  });

  // ---- the closing band (the tab's footer): document id and generation time, the seal; the PDF's own note. Measured
  // first: part 5 keeps its last row and closing line on the band's page, so the band never stands alone on a page.
  const band = (() => {
    const pad = 9;
    const left = [R(`${txt(doc.id ?? (h.caseId ? `${h.caseId}-FD` : undefined))} · generated ${d(doc.generatedAt)}`, S.small)];
    const sealTone = verified === true ? C.ok : verified === false ? C.bad : C.ink2;
    const icon = verified === true ? 9 : 0;
    const right = [R("Document seal", { s: 7.5, c: sealTone }), R(` ${txt(seal)}`, S.small)];
    const inner = CW - 2 * pad;
    const oneLine = runsW(left) + runsW(right) + icon + 16 <= inner;
    const leftLines = wrap(left, inner);
    const rightLines = wrap(right, inner - icon);
    const noteLines = wrap([R(SEAL.note(seal), { s: 6.9, c: C.ink3 })], inner);
    const sum = (ls) => ls.reduce((n, l) => n + l.h, 0);
    const topH = oneLine ? Math.max(sum(leftLines), sum(rightLines)) : sum(leftLines) + 2 + sum(rightLines);
    const bandH = 7 + topH + 3 + sum(noteLines) + 7;
    const draw = () => {
      F.need(bandH);
      fillBox(F.ops, MX, F.y, CW, bandH, 4, C.surface2);
      strokeBox(F.ops, MX, F.y, CW, bandH, 4, C.line, 0.6);
      let y = F.y + 7;
      for (const l of leftLines) {
        placeLine(F.ops, l, MX + pad, y, inner);
        y += l.h;
      }
      let yr = oneLine ? F.y + 7 : y + 2;
      for (const l of rightLines) {
        const x = oneLine ? MX + pad + inner - l.w : MX + pad + icon;
        if (icon && l === rightLines[0]) checkMark(F.ops, x - icon, yr + (l.h - 6) / 2, 6, sealTone);
        drawLine(F.ops, x, yr + l.h / 2 + l.s * 0.35, l.runs);
        yr += l.h;
      }
      y = F.y + 7 + topH + 3;
      for (const l of noteLines) {
        placeLine(F.ops, l, MX + pad, y, inner);
        y += l.h;
      }
      F.y += bandH;
    };
    return { h: bandH, draw };
  })();

  part(5, "Confirmations", () => {
    const cs = list(doc.confirmations);
    const dates = cs.map((x) => [R(d(x.at), S.small)]);
    const dateW = Math.min(Math.max(0, ...dates.map(runsW)), 130);
    const rest = CW - dateW - 28;
    const labelW = (rest * 1.3) / 3.3;
    const detailW = rest - labelW;
    const closing = [R("None of these confirmations is a raw-material approval.", { s: 7.7, c: C.ink3 })];
    const tail = (cs.length ? 6 : 0) + wrap(closing, CW).reduce((n, l) => n + l.h, 0) + 16 + band.h;
    cs.forEach((x, i) => {
      const detail = [R(txt(x.name), { s: 8.1, c: C.ink2 }), ...(x.role ? [R(` · ${x.role}`, { s: 8.1, c: C.ink2 })] : []), R(" · ", { s: 8.1, c: C.ink2 }), R(txt(x.email), { s: 8.1, c: C.ink3 })];
      const cols = [
        { x: MX, atoms: atoms([{ runs: [R(txt(x.label), { s: 8.5, b: 1, c: C.ink })] }], labelW) },
        { x: MX + labelW + 14, atoms: atoms([{ runs: detail }, x.note ? { runs: [R(tidy(x.note), S.small)], gap: 1.5 } : null], detailW) },
        { x: MX + CW - dateW, atoms: atoms([{ runs: dates[i] }], dateW, "right") },
      ];
      if (i === cs.length - 1) F.need(rowHeight(cols, 5.5, 5.5) + tail);
      drawRow(F, cols, { padT: 5.5, padB: 5.5, divider: i > 0 });
    });
    if (!cs.length) F.need(tail);
    para(F, closing, { gap: cs.length ? 6 : 0 });
  });
  F.gap(16);
  band.draw();


  // ---- every page: the footer line with "Page X of Y"; after the first, the running header
  const total = F.pages.length;
  const footer = SEAL.footer(h, seal);
  F.pages.forEach((ops, i) => {
    rule(ops, MX, MX + CW, PAGE_H - 40, C.line, 0.6);
    const pg = [R(`Page ${i + 1} of ${total}`, S.chrome)];
    let size = S.chrome.s;
    while (size > 5 && runsW([R(footer, { ...S.chrome, s: size })]) > CW - runsW(pg) - 16) size -= 0.25;
    drawLine(ops, MX, PAGE_H - 28, [R(footer, { ...S.chrome, s: size })]);
    drawLine(ops, MX + CW - runsW(pg), PAGE_H - 28, pg);
    if (i > 0) {
      const tag = [R("CIQ FINAL DOCUMENT", { s: 6.6, b: 1, c: C.brand, sp: 0.5 })];
      let name = encode(`${txt(h.caseId)} · ${txt(h.materialName)}`);
      const room = CW - runsW(tag) - 10;
      if (textW(name, R("", S.chrome)) > room) {
        while (name.length > 1 && textW(`${name}\x85`, R("", S.chrome)) > room) name = name.slice(0, -1);
        name += "\x85";
      }
      drawLine(ops, MX, 32, tag);
      drawLine(ops, MX + runsW(tag) + 10, 32, [{ ...R("", S.chrome), t: name }]);
      rule(ops, MX, MX + CW, 41, C.line, 0.6);
    }
  });
  return serialise(F.pages, { Title: `Final CIQ document ${txt(h.caseId)}`, Producer: SEAL.producer, Subject: SEAL.subject(seal) }, { w: PAGE_W, h: PAGE_H });
}

/** One open point as the tab's bordered box: a grey strip with the point and its result, then round by round each
 *  entry's who/side/action/time, its text and attachment. Across a page break the box is closed on the old page and
 *  continues under a strip "… (continued)" on the new one. */
function thread(F, t) {
  const PX = 9;
  const inner = CW - 2 * PX;
  const left = [R(txt(t.opId), { s: 8.6, b: 1, c: C.ink }), R(` · ${txt(t.kind)} · ${txt(t.ref)}`, { s: 8.6, c: C.ink })];
  const right = [R(`Raised by ${txt(t.raisedBy)}, ${d(t.raisedAt)} · `, { s: 7.6, c: C.ink3 }), R(txt(t.result), { s: 7.6, b: 1, c: t.result === "Accepted" ? C.ok : C.ink2 })];
  const sum = (ls) => ls.reduce((n, l) => n + l.h, 0);
  const oneLine = runsW(left) + runsW(right) + 14 <= inner;
  const leftLines = wrap(left, oneLine ? inner - runsW(right) - 14 : inner);
  const rightLines = wrap(right, inner);
  const stripH = 11 + (oneLine ? Math.max(sum(leftLines), sum(rightLines)) : sum(leftLines) + 1.5 + sum(rightLines));
  const contLines = wrap([...left, R("  (continued)", { s: 7.6, c: C.ink3 })], inner);
  const contH = 10 + sum(contLines);
  const strip = (lines, rLines, hh, first) => {
    fillBox(F.ops, MX, F.y, CW, hh, first ? [5, 5, 0, 0] : 0, C.surface2);
    rule(F.ops, MX, MX + CW, F.y + hh, C.line, 0.6);
    let y = F.y + 5.5;
    for (const l of lines) {
      placeLine(F.ops, l, MX + PX, y, inner);
      y += l.h;
    }
    if (rLines) {
      let yr = oneLine ? F.y + 5.5 + (sum(leftLines) - sum(rightLines)) / 2 : y + 1.5;
      for (const l of rLines) {
        placeLine(F.ops, l, MX + PX, yr, inner, oneLine ? "right" : "left");
        yr += l.h;
      }
    }
    F.y += hh;
  };
  const entryAtoms = (e) =>
    atoms(
      [
        { runs: [R(txt(e.by), { s: 7.6, b: 1, c: C.ink2 }), R(` (${e.side === "supplier" ? "supplier" : "Beiersdorf"}) · ${txt(e.action)} · ${d(e.at)}`, { s: 7.6, c: C.ink3 })] },
        { runs: [R(txt(tidy(e.text)), { s: 8.6, c: C.ink })], gap: 1.5 },
        e.attachment ? { runs: [R(`Attachment: ${e.attachment}`, { s: 7.6, c: C.ink2 })], gap: 1.5 } : null,
      ],
      inner,
    );
  const rounds = list(t.rounds).map((r) => ({ label: atoms([{ runs: [R(`Round ${txt(r.n)}`.toUpperCase(), S.round)] }], inner), entries: list(r.entries).map(entryAtoms) }));
  const firstH = rounds[0] ? 6 + height(rounds[0].label) + (rounds[0].entries[0] ? 3 + Math.min(height(rounds[0].entries[0]), 90) : 0) : 0;
  F.need(stripH + firstH + 6);
  let segTop = F.y;
  let firstSeg = true;
  strip(leftLines, rightLines, stripH, true);
  const box = {
    h: contH,
    before() {
      strokeBox(F.ops, MX, segTop, CW, Math.min(F.y + 4, BOTTOM + 6) - segTop, firstSeg ? [5, 5, 0, 0] : 0, C.line, 0.7);
      firstSeg = false;
    },
    after() {
      segTop = F.y;
      strip(contLines, null, contH, false);
    },
  };
  F.push(box);
  F.mark = F.y;
  rounds.forEach((r, ri) => {
    if (ri && !F.fresh()) rule(F.ops, MX, MX + CW, F.y, C.line, 0.5);
    F.need(6 + height(r.label) + (r.entries[0] ? 3 + Math.min(height(r.entries[0]), 90) : 0));
    drawRow(F, [{ x: MX + PX, atoms: r.label }], { padT: 6, padB: 0 });
    r.entries.forEach((as, ei) => drawRow(F, [{ x: MX + PX, atoms: as }], { padT: ei ? 6 : 3, padB: 0 }));
    F.y += 6;
  });
  F.pop();
  if (!rounds.length) F.y += 2;
  strokeBox(F.ops, MX, segTop, CW, F.y - segTop, firstSeg ? 5 : [0, 0, 5, 5], C.line, 0.7);
}

/** Serialise pages of content operators into PDF bytes (PDF 1.4, uncompressed, deterministic). */
function serialise(pages, info, size) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add(null);
  const pagesObj = add(null);
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  for (const ops of pages) {
    const stream = ops.join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${size.w} ${size.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const infoObj = add(`<< ${Object.entries(info).map(([k, v]) => `/${k} (${esc(winAnsi(v))})`).join(" ")} >>`);
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export const pdfSha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const finalPdfName = (caseCode) => `${caseCode}-final-document.pdf`;
