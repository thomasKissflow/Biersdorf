// refresh.mjs — the review page is a CACHE, not a record.
//
// review.html is a pure derivation: (app-spec.json + decisions.md + open-questions.md +
// prototype/thumbs) → HTML, no network and no state. It was nevertheless stored and served as the
// artifact of record, so a theme change or a new section reached only apps built AFTER it: every
// page already on disk kept the bytes its own renderer produced, forever, with nothing anywhere
// comparing the two.
//
// So each page carries the identity of the renderer that produced it, and the serving path
// re-renders when that identity is stale. The identity is DERIVED from the renderer's own sources
// rather than declared in a constant, because a constant is a thing someone has to remember to bump
// — and the release where they forget is exactly the release that needed it.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));

// Everything whose edit changes the emitted page. builders.mjs is in here because normalizeIR
// decides what the page is even ABOUT, and experience.mjs because it can add the pages/nav the
// review then documents.
export const RENDERER_SOURCES = ["review.mjs", "experience.mjs", "builders.mjs"];

let cachedId = null;
export function rendererId() {
  if (cachedId) return cachedId;
  const h = createHash("sha256");
  for (const f of RENDERER_SOURCES) {
    try { h.update(readFileSync(join(HERE, f))); } catch { h.update(f); }  // a missing source is still an input
  }
  return (cachedId = h.digest("hex").slice(0, 12));
}

export const STAMP_RE = /<meta name="kf-renderer" content="([a-f0-9]+)">/;
export const stampOf = (html) => (STAMP_RE.exec(String(html || "")) || [])[1] || null;
export const isStale = (html) => stampOf(html) !== rendererId();

// The screens a review page is carrying. review.mjs embeds captured prototype screenshots straight
// into the page as `var S=[{name, role, img:"data:image/png;base64,…"}]`, which means A PAGE IS THE
// ARCHIVE OF ITS OWN SCREENS. That matters for re-rendering: the durable run bundle deliberately
// skips `thumbs/` and carries text only, so a worker re-rendering on a cold container has no
// screenshots and the review's Pages step would silently fall back to wireframes — a refresh that
// makes the page WORSE. Reading them back out of the old page avoids that with no extra storage.
const SCREENS_RE = /var S=(\[[\s\S]*?\]),RS=/;
export function screensFrom(html) {
  const m = SCREENS_RE.exec(String(html || ""));
  if (!m) return [];
  try {
    const s = JSON.parse(m[1]);
    return Array.isArray(s) ? s.filter((x) => x && typeof x.img === "string" && x.img.startsWith("data:image/")) : [];
  } catch { return []; }
}

// Materialise those screens back into <dir>/prototype/thumbs/ so the next render finds them exactly
// where capture-screens.mjs would have left them. Only ever fills a gap — real thumbs on disk win.
function restoreThumbs(dir, html) {
  const tdir = join(dir, "prototype", "thumbs");
  if (existsSync(join(tdir, "manifest.json"))) return 0;
  const screens = screensFrom(html);
  if (!screens.length) return 0;
  try {
    mkdirSync(tdir, { recursive: true });
    const man = { screens: [] };
    screens.forEach((s, i) => {
      const file = `${String(s.role || s.name || i).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `screen-${i}`}.png`;
      const b64 = s.img.slice(s.img.indexOf(",") + 1);
      writeFileSync(join(tdir, file), Buffer.from(b64, "base64"));
      man.screens.push({ name: s.name, role: s.role || "", file });
    });
    writeFileSync(join(tdir, "manifest.json"), JSON.stringify(man));
    return man.screens.length;
  } catch (e) {
    // Not fatal — the guard below refuses the downgrade either way. But it is SAID: this catch
    // silently swallowed a missing-import ReferenceError during development and the only visible
    // symptom was a refresh that mysteriously never happened.
    console.warn(`  thumb recovery failed (${e.message}) — the render will fall back to wireframes`);
    return 0;
  }
}

// Re-render one run's review page in place. Returns what happened, never throws: a page that cannot
// be re-rendered must keep serving the bytes it has. A blank replacement would be strictly worse
// than a stale one, so the old file survives anything short of a clean, non-empty render.
export function freshenReview(dir, { force = false } = {}) {
  const html = ["review.html", "blueprint.html"].map((f) => join(dir, f)).find(existsSync);
  if (!html) return { ok: false, reason: "no review page" };
  const ir = join(dir, "app-spec.json");
  // Versions published before the run bundle carry the rendered page and nothing else. They cannot
  // be re-rendered, and that is the honest outcome — not a silent skip.
  if (!existsSync(ir)) return { ok: false, reason: "no app-spec.json to render from", file: html };
  let current = "";
  try { current = readFileSync(html, "utf8"); } catch { /* treat as stale */ }
  const was = stampOf(current);
  if (!force && was === rendererId()) return { ok: true, changed: false, stamp: was, file: html };

  // give the render back the screenshots the old page is carrying, if the run itself has none
  const recovered = restoreThumbs(dir, current);

  const args = [join(HERE, "review.mjs"), ir];
  const dec = join(dir, "decisions.md");
  if (existsSync(dec)) args.push(dec);          // open-questions.md resolves as its sibling
  const r = spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout || r.stdout.length < 500) {
    return { ok: false, reason: (r.stderr || "").trim().split("\n").pop() || "render failed", file: html, was };
  }
  // NEVER DOWNGRADE. A newer renderer is only an improvement if the page still says as much as it
  // did. Losing the captured screens turns an InVision-style walkthrough back into wireframes, and
  // that is a worse page — keep the old one and say why, rather than quietly trading content for a
  // fresher stamp.
  const had = screensFrom(current).length, now = screensFrom(r.stdout).length;
  if (had > now) {
    return { ok: false, reason: `refusing to drop ${had - now} captured screen(s) — kept the existing page`, file: html, was };
  }
  writeFileSync(html, r.stdout);
  return { ok: true, changed: true, was, stamp: rendererId(), file: html, screens: now, recovered };
}

// Every run under a directory — the eager sweep, so the first viewer after a deploy does not pay for
// the re-render and, more importantly, so we can SEE what could not be refreshed.
export function freshenAll(runsDir) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(runsDir, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return out; }
  for (const e of entries) out.push({ run: e.name, ...freshenReview(join(runsDir, e.name)) });
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("refresh.mjs")) {
  const dir = process.argv[2] || join(HERE, "../../../runs");
  const res = freshenAll(dir);
  const done = res.filter((r) => r.ok && r.changed), fresh = res.filter((r) => r.ok && !r.changed);
  const skip = res.filter((r) => !r.ok && r.reason !== "no review page");
  console.log(`renderer ${rendererId()} · ${dir}`);
  for (const r of done) console.log(`  ✓ ${r.run} — re-rendered (was ${r.was || "unstamped"})`);
  for (const r of skip) console.log(`  ⚠ ${r.run} — ${r.reason}`);
  console.log(`\n${done.length} re-rendered · ${fresh.length} already current · ${skip.length} could not be refreshed`);
}
