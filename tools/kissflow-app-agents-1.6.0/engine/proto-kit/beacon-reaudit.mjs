// Beacon-only reaudit of the token contract. Replaces the 11-language identity test:
// with Beacon as the sole language, "same resolved value" IS the merge test — the old
// caution ("a future language might diverge") no longer applies. Still respects two
// categories the file's own comments establish as intentional, non-language reasons
// to keep tokens apart even at equal value:
//   RANK   - documented as a separate semantic rank (e.g. --muted/--secondary)
//   ACCIDENT - same number, unrelated CSS properties (flagged, not auto-excluded)
// and keeps --chart-1..8 dedicated per memory decision.
import fs from "node:fs";

const css = fs.readFileSync(
  "/Users/vadivel/Projects/app-ai-plugin/starter/src/tokens.css",
  "utf8"
);

// Isolate the bare :root { ... } block (Beacon) — first block only, matching braces.
const start = css.indexOf(":root {");
let depth = 0, end = -1;
for (let i = start; i < css.length; i++) {
  if (css[i] === "{") depth++;
  else if (css[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
}
const block = css.slice(start, end + 1);

// Parse declarations: --name: value;  (value may contain balanced parens)
const decls = new Map(); // name -> raw value (first declaration wins, matches CSS cascade within one block for our purposes since no dupes expected)
const declOrder = [];
const re = /(--[a-zA-Z0-9-]+)\s*:\s*/g;
let m;
while ((m = re.exec(block))) {
  const name = m[1];
  let i = re.lastIndex;
  let paren = 0;
  let j = i;
  while (j < block.length) {
    const c = block[j];
    if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === ";" && paren === 0) break;
    j++;
  }
  const value = block.slice(i, j).trim();
  if (!decls.has(name)) { decls.set(name, value); declOrder.push(name); }
  re.lastIndex = j;
}

console.log(`Parsed ${decls.size} declarations from Beacon block.\n`);

// Resolve var(--x, fallback) chains recursively to a final literal value.
function resolve(value, seen = new Set()) {
  return value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (whole, name, fallback) => {
    if (seen.has(name)) return whole; // cycle guard
    if (decls.has(name)) {
      const next = new Set(seen); next.add(name);
      return resolve(decls.get(name), next);
    }
    if (fallback !== undefined) return resolve(fallback.trim(), seen);
    return whole;
  });
}

function hslTripletToHex(triplet) {
  const mm = triplet.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!mm) return null;
  let [, h, s, l] = mm.map(Number);
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Normalize a fully-resolved value string for comparison.
function normalize(raw) {
  let v = resolve(raw).trim();
  // hsl(H S% L%) -> hex
  const hslMatch = v.match(/^hsl\(\s*([\d.-]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (hslMatch) {
    const hex = hslTripletToHex(`${hslMatch[1]} ${hslMatch[2]}% ${hslMatch[3]}%`);
    if (hex) return hex;
  }
  // bare triplet "H S% L%" (unwrapped) -> hex, tagged so it doesn't collide with an hsl()-wrapped one at compare time
  const bareTriplet = v.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (bareTriplet) {
    const hex = hslTripletToHex(v);
    if (hex) return `triplet:${hex}`;
  }
  // collapse internal whitespace for everything else (px lists, font stacks, rgba, gradients)
  return v.replace(/\s+/g, " ");
}

const DEDICATED = (t) => /^--chart-[1-8]$/.test(t);

// Known documented ranks — explicit contract commentary saying "named apart so X can move
// independently", not a language-divergence concern. Still excluded post-retirement.
const RANK_PAIRS = new Set(["--muted|--secondary"]);

// Known accidental coincidences — same number, unrelated CSS properties. Not auto-excluded,
// just flagged, since that reasoning was never about language count.
const ACCIDENT_PAIRS = new Set([
  "--chip-dot|--chip-gap",
  "--chip-height|--overlay-pad",
  "--card-pad-metric|--row-pad-x",
]);

function pairKey(a, b) {
  return [a, b].sort().join("|");
}

// Group by normalized resolved value.
const byValue = new Map();
for (const name of declOrder) {
  if (DEDICATED(name)) continue;
  const raw = decls.get(name);
  const norm = normalize(raw);
  if (!byValue.has(norm)) byValue.set(norm, []);
  byValue.get(norm).push(name);
}

const groups = [...byValue.entries()]
  .filter(([, names]) => names.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`${groups.length} value-equal groups (excluding dedicated chart ramp):\n`);
for (const [value, names] of groups) {
  const tags = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const k = pairKey(names[i], names[j]);
      if (RANK_PAIRS.has(k)) tags.push(`RANK(${names[i]},${names[j]})`);
      if (ACCIDENT_PAIRS.has(k)) tags.push(`ACCIDENT(${names[i]},${names[j]})`);
    }
  }
  console.log(`  ${value.padEnd(22)} ${names.join(", ")}${tags.length ? "   [" + tags.join("; ") + "]" : ""}`);
}
