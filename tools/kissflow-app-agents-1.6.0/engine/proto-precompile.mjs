// proto-precompile.mjs — turn a prototype's LIVE Tailwind head into a plain static stylesheet.
//
// WHY. Prototypes shipped a browser CDN (`@tailwindcss/browser@4`) plus the token contract in a
// `<style type="text/tailwindcss">` block, and compiled in the viewer's browser on every load. That
// works on a plain page and fails inside a preview HOST: the CDN resolved the contract's two
// `@import "tailwindcss/…"` lines as RELATIVE URLs, got 404s for theme.css and utilities.css, and
// died with `CssSyntaxError: Missing closing } at :root` — which kills the whole stylesheet at once,
// so every rule on the page vanishes and an icon with no width fills the screen. Reported from a
// real preview, 2026-08-12 (TravelFlow).
//
// The contract itself was never wrong. It was checked with two independent parsers and by rendering
// the same head against browser builds 4.0.0 / 4.1.0 / 4.2.4 / 4.3.3 — all clean, none of them
// fetched those files. The failure needs the preview host's iframe to reproduce, which is exactly
// the environment nothing in the pipeline could test.
//
// So the fix is not to make the CDN behave. It is to have nothing left to fail at view time:
// compile the CSS HERE, with the same Tailwind version the CDN would have served, and emit a plain
// <style>. A static stylesheet cannot 404, cannot re-parse, and renders identically in every host.
//
// DEGRADES, NEVER BREAKS. If the compiler is unavailable or throws, the document is returned
// untouched — with its CDN head intact — and the caller is told. A prototype that renders the old
// way beats one that renders not at all.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));

// The engine is not a package with its own deps; tailwind lives with the starter that the built app
// is compiled from. Deliberately the SAME install, so the prototype and the app can never be built
// by two different Tailwind versions.
// KF_TW_PACKAGE overrides the search with a SINGLE root — the seam a "compiler-missing" test needs
// (point it at a package.json with no tailwindcss, and loadTailwind returns null) and an operator can
// use to pin a specific install. Without it, the normal repo-relative search runs.
const TW_SEARCH = process.env.KF_TW_PACKAGE
  ? [resolvePath(process.env.KF_TW_PACKAGE)]
  : [
      resolvePath(HERE, "../../../starter/package.json"),   // repo layout: plugins/app-agents/engine → starter
      resolvePath(HERE, "../../../../starter/package.json"),
      resolvePath(process.cwd(), "starter/package.json"),
      resolvePath(process.cwd(), "package.json"),
    ];

let TW_CACHED;   // resolve Tailwind ONCE — the module search is filesystem work repeated on every splice
function loadTailwind() {
  if (TW_CACHED !== undefined) return TW_CACHED;
  TW_CACHED = null;
  for (const from of TW_SEARCH) {
    try {
      const req = createRequire(from);
      const entry = req.resolve("tailwindcss");
      TW_CACHED = { req, entry, version: req("tailwindcss/package.json").version };
      break;
    } catch { /* try the next root */ }
  }
  return TW_CACHED;
}

// EXPRESS-FAST COMPILER CACHE. compile(source) is the expensive step — it reads + parses tailwindcss's
// own theme.css/utilities.css and stands up the engine. Within ONE streaming build the shell's token
// contract (the <style> source) is CONSTANT across part arrivals, so re-running compile() each splice
// is waste. The v4 compiler is MUTABLE and INCREMENTAL — build() ACCUMULATES candidates — which is only
// correct WITHIN a run (parts add utilities monotonically). Across runs/turns it would leak: a class
// removed on a later turn would linger, and two apps sharing a contract+label would share a compiler.
// So the cache is scoped to a LABEL (the run dir) and disposed at turn end (disposePrecompileCache),
// and the key is two hex digests — printable (no NUL) and source-specific, so different contracts never
// collide. Bounded LRU as a backstop for long-lived worker processes.
const COMPILER_CACHE = new Map();   // fullKey -> compiler
const LABEL_KEYS = new Map();       // label -> Set(fullKey), so a turn's compilers dispose together
const COMPILER_CACHE_MAX = 8;
const h = (v) => createHash("sha1").update(String(v ?? "")).digest("hex");
const cacheKey = (label, source) => `${h(label)}${h(source)}`;

/** Drop a run's cached compiler(s) at turn end so the next turn compiles fresh — deterministic output,
 *  no utilities carried over from an earlier turn. Pass the SAME label assembleRun used (the run dir). */
export function disposePrecompileCache(label) {
  const keys = LABEL_KEYS.get(label);
  if (!keys) return;
  for (const k of keys) COMPILER_CACHE.delete(k);
  LABEL_KEYS.delete(label);
}

// The <style> the head carries, and the CDN <script> that used to compile it.
const STYLE_RE = /<style\s+type=["']text\/tailwindcss["']\s*>([\s\S]*?)<\/style>/i;
const CDN_RE = /<script\b[^>]*src=["'][^"']*tailwindcss\/browser@[^"']*["'][^>]*>\s*<\/script>\s*/i;

// Candidate extraction. Oxide's scanner is not a dependency here, and a prototype is a single file
// whose classes live in three places at once — markup, JS template literals, and strings built by
// `.map()` — so the honest scan is "every token in the document that could be a utility". Tailwind
// silently ignores candidates it does not recognise, so over-collecting costs a little compile time
// and nothing else; UNDER-collecting silently drops a rule the page needed, which is the failure
// this whole file exists to stop.
const TOKEN_RE = /[A-Za-z0-9!@_[\]().,%#/:^&*+~<>=?|-]{2,}/g;
export function candidatesFrom(html) {
  const out = new Set();
  for (const raw of html.match(TOKEN_RE) || []) {
    // strip quoting/punctuation the tokenizer swept up at the edges
    const t = raw.replace(/^[^A-Za-z0-9[-]+/, "").replace(/[^A-Za-z0-9\])%]+$/, "");
    if (t.length >= 2 && t.length <= 120) out.add(t);
  }
  return [...out];
}

/**
 * Pre-compile a prototype document's Tailwind head.
 * Returns { html, changed, reason, stats } and NEVER throws.
 */
export async function precompile(html, { label = "prototype" } = {}) {
  const styleM = html.match(STYLE_RE);
  if (!styleM) return { html, changed: false, reason: "no <style type=text/tailwindcss> block — nothing to pre-compile", legacy: true };

  // Older prototypes are v3 pages: `cdn.tailwindcss.com`, a `tailwind.config` object and `@apply`.
  // The v4 compiler cannot build those (it rejects `@apply bg-background` with no @theme to resolve
  // it against), and it SHOULD NOT try — they were never affected by the import-404 failure this
  // exists to fix. Detect the v4 contract explicitly so a legacy page reports as "not applicable"
  // rather than as a compile error, and the loud warning keeps meaning something.
  const isV4 = /@import\s+["']tailwindcss/.test(styleM[1]) || /@utility\s/.test(styleM[1]) || /@theme\b/.test(styleM[1]);
  if (!isV4) return { html, changed: false, reason: "legacy v3 prototype (tailwind.config + @apply) — not a v4-contract page, left as-is", legacy: true };

  const tw = loadTailwind();
  if (!tw) return { html, changed: false, reason: "tailwindcss not resolvable — left the CDN head in place" };

  const source = styleM[1];
  try {
    // REUSE the compiled shell contract across part arrivals (Express-fast): compile(source) only when
    // this (label, source) hasn't been compiled yet; otherwise reuse the standing compiler and just
    // rebuild the candidate set below.
    const key = cacheKey(label, source);
    let compiler = COMPILER_CACHE.get(key);
    if (!compiler) {
      // tailwindcss ships both conditions; `require.resolve` picks the CJS one, and importing THAT by
      // path yields the namespace under `.default`, so a plain `{ compile }` destructure gets
      // undefined ("compile is not a function"). Take the require result, fall back to the import.
      let compile = tw.req("tailwindcss")?.compile;
      if (typeof compile !== "function") {
        const mod = await import(tw.entry);
        compile = mod.compile || mod.default?.compile;
      }
      if (typeof compile !== "function") throw new Error("tailwindcss exposes no compile()");

      // `@import "tailwindcss/theme.css"` must resolve to the INSTALLED package, not to a sibling URL.
      // Resolving it here is the entire bug fix: the browser could only ever guess a relative path.
      const loadStylesheet = async (id, base) => {
        let path;
        if (id.startsWith("tailwindcss")) path = tw.req.resolve(id);
        else if (id.startsWith(".")) path = resolvePath(base, id);
        else { try { path = createRequire(base + "/x.js").resolve(id); } catch { path = resolvePath(base, id); } }
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      };
      // No prototype loads a Tailwind plugin; refusing loudly beats emitting a page missing its rules.
      const loadModule = async (id) => { throw new Error(`prototype CSS asked for JS module "${id}" — not supported in a pre-compiled prototype`); };

      compiler = await compile(source, { base: HERE, loadStylesheet, loadModule });
      COMPILER_CACHE.set(key, compiler);
      (LABEL_KEYS.get(label) || LABEL_KEYS.set(label, new Set()).get(label)).add(key);
      if (COMPILER_CACHE.size > COMPILER_CACHE_MAX) {
        const evict = COMPILER_CACHE.keys().next().value;
        COMPILER_CACHE.delete(evict);
        for (const [lbl, set] of LABEL_KEYS) { set.delete(evict); if (set.size === 0) LABEL_KEYS.delete(lbl); }  // drop empty label sets too (#8)
      }
    }
    const candidates = candidatesFrom(html);
    const css = compiler.build(candidates);

    if (!css || css.trim().length < 500)
      return { html, changed: false, reason: `compiler returned ${css ? css.length : 0} bytes — too small to trust, kept the CDN head` };

    // A closing style tag inside the compiled CSS would end the element early and truncate the rest
    // of the page. The contract is checked for this upstream; the COMPILED output never has been.
    if (/<\/style/i.test(css))
      return { html, changed: false, reason: "compiled CSS contains a closing style tag — refusing to inline it" };

    const banner =
      `/* Pre-compiled by engine/proto-precompile.mjs with tailwindcss ${tw.version} — the same version\n` +
      `   the browser CDN served. Do not hand-edit: rebuild the prototype instead. The source lives in\n` +
      `   engine/proto-kit/tokens.css (the token contract) plus the shell rules emitted by\n` +
      `   engine/design-language.mjs. Compiled here so the page has no compile step, and therefore no\n` +
      `   CDN fetch, at view time. */\n`;

    // Function replacers throughout: the compiled CSS and the document both contain `$&`-shaped
    // sequences, and a string replacement would substitute them. (Learned the hard way inlining a
    // bundle earlier the same day — `$&&` became the matched text and silently corrupted the file.)
    let out = html.replace(STYLE_RE, () => `<style>\n${banner}${css}\n</style>`);
    out = out.replace(CDN_RE, () => "");

    return {
      html: out,
      changed: true,
      reason: `compiled with tailwindcss ${tw.version}`,
      stats: { version: tw.version, candidates: candidates.length, sourceBytes: source.length, cssBytes: css.length, cdnRemoved: CDN_RE.test(html) },
    };
  } catch (e) {
    return { html, changed: false, reason: `compile failed (${e?.message || e}) — left the CDN head in place for ${label}` };
  }
}
