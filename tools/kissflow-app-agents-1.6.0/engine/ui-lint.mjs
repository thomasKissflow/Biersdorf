// ui-lint.mjs — deterministic gate on GENERATED custom-UI pages, run before the build.
//
//   node ui-lint.mjs <pagesDir> [--warn-only]
//
// Every rule here is a defect that actually shipped, survived review, and was found only by opening
// the live app. They share a shape: the page compiles, the preview looks perfect, and Kissflow shows
// something else. Prose in the page-agent prompt did not stop them — the same three came back across
// regenerations — so they are checked mechanically instead.
//
// The rule that matters most is PROCESS_GET_ITEMS. The offline mock used to answer `getItems()` on a
// Process; the real SDK has no such method. Four pages were written against it, reviewed against
// seeded data, and failed live with "getProcess(...).getItems is not a function". The mock has since
// been corrected, and this keeps the pages honest even if a mock ever drifts permissive again.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Real SDK surfaces, from @kissflow/lowcode-client-sdk (kfsdk.es.js). */
export const SDK_SURFACE = {
  dataform: ["getItems", "getItem", "createItem", "updateItem", "deleteItem", "importCSV", "openForm"],
  board: ["getItems", "getItem", "createItem", "updateItem", "deleteItem", "importCSV", "openForm"],
  process: ["getMyItems", "getMyTasksItems", "getParticipatedItems", "getAdminItems", "getItem"],
};

const RULES = [
  {
    code: "PROCESS_GET_ITEMS",
    level: "error",
    re: /getProcess\s*\([^)]*\)\s*\.\s*getItems\s*\(/g,
    msg: "a Process has no getItems() — use getAdminItems() for every item, getMyTasksItems() for the signed-in user's queue, or getMyItems(). This throws at runtime and renders the page empty.",
  },
  {
    code: "PROCESS_HANDLE_GET_ITEMS",
    level: "error",
    find: findProcessHandleGetItems,
    msg: "this handle may be a Process, and a Process has no getItems() — branch on the family and call getAdminItems()/getMyTasksItems()/getMyItems() for the Process side. Assigning the handle to a variable is what hid this from the inline rule; it throws at runtime just the same.",
  },
  {
    code: "DATA_NOT_ARRAY",
    level: "error",
    // `res.Data || []` only defends against null. A Process listing that answers with an OBJECT
    // sails through — `{} || []` is `{}` — and the first .filter/.map downstream dies with
    // "(l || []).filter is not a function", minified and far from the read that caused it.
    re: /\.\s*Data\s*(?:\?\?|\|\|)\s*\[\s*\]/g,
    msg: "`.Data || []` guards against null, not against the wrong TYPE — a non-array Data passes straight through and breaks at the first .filter/.map. Use Array.isArray(res?.Data) ? res.Data : [] and report the mismatch.",
  },
  {
    code: "BOARD_PROCESS_METHOD",
    level: "error",
    re: /getBoard\s*\([^)]*\)\s*\.\s*(getAdminItems|getMyTasksItems|getMyItems|getParticipatedItems)\s*\(/g,
    msg: "a Board/Case exposes getItems(), not the Process listing methods.",
  },
  {
    code: "SWALLOWED_READ_ERROR",
    level: "error",
    // `catch {` with no binding cannot report anything — the read failure becomes an empty state.
    re: /catch\s*\{/g,
    msg: "a bare `catch {}` cannot surface why a read failed, so a permission or view problem renders as \"nothing here yet\" over real records. Bind the error and show it.",
  },
  {
    code: "KF_AS_PROP",
    level: "error",
    // A page is mounted by the router with NO props; the SDK comes from context. Taking `kf` as a
    // prop leaves it undefined and the page dies on first render. A page agent guessed this
    // convention when its brief did not state it (facilities Sonnet run, 2026-08-02) — cheap to
    // check, and invisible to the build because it is a runtime error.
    re: /export\s+default\s+function\s+\w*\s*\(\s*\{[^}]*\bkf\b/g,
    msg: "a page takes no props — the router mounts it bare. Get the SDK from context: `const kf = useKf()` (imported from @kissflow/app-ui).",
  },
  {
    code: "HARDCODED_COLOR",
    level: "error",
    re: /\b(?:bg|text|border)-(?:red|green|blue|yellow|orange|purple|pink|teal|cyan|lime|amber|emerald|indigo|violet|fuchsia|rose|sky)-\d{2,3}\b|#[0-9a-fA-F]{6}\b/g,
    msg: "colour must come from tokens/TONES, never a literal — a hardcoded pair ignores the app's design language and breaks its own contrast rules.",
  },
  {
    code: "TEXT_WHITE",
    level: "error",
    re: /\btext-white\b/g,
    msg: "text-white on a token background renders white-on-white when that token resolves light. Use the paired foreground token.",
  },
  {
    code: "UNGUARDED_DATE",
    level: "error",
    re: /\{\s*new Date\s*\(/g,
    msg: "new Date(...) rendered straight into JSX prints \"Invalid Date\" for any missing or malformed value. Route every date through a guard that returns an em dash.",
  },
  {
    code: "RAW_ROW_RENDER",
    level: "warn",
    // {row.Some_Field} where the field is a Reference/User renders "[object Object]". We cannot know
    // the type here, so this is a warning aimed at the shape most likely to be one.
    re: /\{\s*\w+\.(?:[A-Z][A-Za-z0-9]*_)+[A-Za-z0-9]+\s*\}/g,
    msg: "rendering a row field directly prints \"[object Object]\" if it is a Reference or User. Read it through a label() helper.",
  },
];

/**
 * The same defect, one variable removed — and it is the shape real code actually takes.
 *
 * PROCESS_GET_ITEMS only matches `getProcess(x).getItems(` as one expression. Nobody writes it that
 * way once a page does anything interesting: the handle gets a name first, and very often it is
 * picked by a ternary that can yield a Dataform, a Board OR a Process:
 *
 *     const h = type === "Case" ? kf.app.getBoard(id) : type === "Form" ? kf.app.getDataform(id) : kf.app.getProcess(id);
 *     const res = await h.getItems();     // throws for every Process — invisible to a regex
 *
 * That is the exact line that broke every page importing `_metrics.js`. Binding the handle defeats a
 * textual rule entirely, so this walks the assignments: any variable whose initialiser can produce a
 * Process, then called with `.getItems()`, is the bug. A `may be` phrasing on purpose — the ternary
 * case is genuinely ambiguous, and ambiguity here means it breaks for one of the three families.
 */
function findProcessHandleGetItems(code) {
  const out = [];
  const names = new Set();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*?getProcess\s*\()/g)) names.add(m[1]);
  for (const name of names) {
    for (const m of code.matchAll(new RegExp(`\\b${name}\\s*\\??\\.\\s*getItems\\s*\\(`, "g"))) {
      out.push({ index: m.index, snippet: m[0] });
    }
  }
  return out;
}

export function lintSource(src, file = "") {
  const findings = [];
  // Comments explain these defects all over the codebase; linting them produces pure noise.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const add = (rule, index, snippet) => findings.push({
    file, line: code.slice(0, index).split("\n").length,
    code: rule.code, level: rule.level, msg: rule.msg, snippet: String(snippet).trim().slice(0, 60),
  });
  for (const rule of RULES) {
    if (rule.find) { for (const hit of rule.find(code)) add(rule, hit.index, hit.snippet); continue; }
    rule.re.lastIndex = 0;
    for (const m of code.matchAll(rule.re)) add(rule, m.index, m[0]);
  }
  return findings;
}

export function lintDir(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      // `_`-prefixed files are excluded from ROUTING, not from being code. They are the shared
      // helpers every page imports, which makes them the highest-leverage place for exactly these
      // defects — `_metrics.js` held the getItems() bug that rendered four pages empty, and this
      // linter was skipping it by name. Lint them.
      if (!/\.jsx?$/.test(entry)) continue;
      out.push(...lintSource(readFileSync(p, "utf8"), p));
    }
  };
  walk(dir);
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("ui-lint.mjs")) {
  const dir = process.argv[2] || "src/pages";
  const warnOnly = process.argv.includes("--warn-only");
  const findings = lintDir(dir);
  const errors = findings.filter((f) => f.level === "error");
  for (const f of findings) {
    console.log(`  ${f.level === "error" ? "✗" : "⚠"} ${f.file}:${f.line}  ${f.code}`);
    console.log(`      ${f.snippet}`);
    console.log(`      ${f.msg}`);
  }
  console.log(`\n${errors.length ? "❌" : "✅"} ui-lint — ${findings.length} finding(s), ${errors.length} error(s) across ${dir}`);
  process.exit(errors.length && !warnOnly ? 1 : 0);
}
