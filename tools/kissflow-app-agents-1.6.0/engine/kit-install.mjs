#!/usr/bin/env node
/**
 * kit-install.mjs — install the starter kit into a @kissflow/create-app scaffold.
 *
 *   node engine/kit-install.mjs --app <appDir> --spec <runDir>/prototype/experience-spec.json
 *
 * After this, generated pages import display components from `@/components/kit/*` instead of
 * composing them inline from shadcn primitives — one component library across the starter
 * gallery, the prototype catalog and the live app. Proven on Monitor Ops before being encoded
 * here; see engine/app-kit/README.md for the payload and the token contract.
 *
 * Steps (each idempotent — safe to re-run after a kit or identity update):
 *   1. copy app-kit/kit           → src/components/kit/
 *   2. copy shadcn.css, tokens.css → src/
 *   3. write src/lib/app-ui-shim.js and src/kit-compat.css
 *   4. alias "@kissflow/app-ui" → the shim in vite.config.js
 *   5. rewire src/main.jsx — shadcn.css replaces themes.css; app-theme.css neutralized (see BUG
 *      note below); identity + kit-compat last
 *   6. emit src/app-identity.css in TRIPLET form from the design slice (identityTokens with
 *      wholeValueColors:false — theme-from-design's CLI emits whole colours for the scaffold
 *      bridge and would break the kit's hsl(var()) bridge)
 *   7. stamp <html data-theme="<language>"> in index.html
 *   8. refresh scripts/theme-check.mjs from this engine's canonical copy (see BUG note below)
 *
 * emit-live-themes.mjs --app still runs FIRST (build-app.md 4b.i): it supplies themes.js (the
 * font loader + data-theme stamp), agents/theming.md and the theme-check build gate. Only its
 * themes.css import is dropped here — the kit's token graph replaces those blocks, and
 * re-importing both would overwrite triplet tokens with whole colours.
 *
 * BUG FOUND 2026-08-13, FIXED HERE (steps 5 and 8). An app can reach kit-install already themed
 * via CONDUCTOR.md's older path — `theme-from-design.mjs --out src/app-theme.css` — which leaves
 * app-theme.css as main.jsx's LAST import. Step 5 used to only ever insert relative to
 * shadcn.css's position, so it never touched that pre-existing app-theme.css import: it stayed
 * last and kept winning the cascade over the app-identity.css this file writes in step 6. That is
 * not just stale values — app-theme.css predates the kit's triplet convention, so its --chart-N
 * are bare "H S% L%" triplets, and the kit consumes --chart-N directly as a colour
 * (shadcn.css: `--color-chart-1: var(--chart-1, #6366f1)`; kit/DataCharts.jsx:
 * `stroke="var(--chart-1)"`) — a bare triplet there is invalid CSS, so every chart's series
 * colour silently broke. Verified: built the actual CSS bundle and found both declarations, the
 * invalid one last. Step 5 now neutralizes any pre-existing app-theme.css import; step 8 refreshes
 * the app's installed theme-check.mjs, because the copy an older emit-live-themes.mjs run left
 * behind predates app-identity.css entirely and would keep passing the build while blind to
 * exactly this failure.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { identityTokens, languageDecision, setLanguageAttribute } from "./theme-from-design.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAYLOAD = join(HERE, "app-kit");

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const appDir = resolve(flag("--app") || ".");
const specPath = flag("--spec");

if (!existsSync(join(appDir, "src"))) {
  console.error(`kit-install: ${appDir} does not look like an app (no src/)`);
  process.exit(2);
}
if (!existsSync(PAYLOAD)) {
  console.error(`kit-install: payload missing at ${PAYLOAD}`);
  process.exit(2);
}

const report = [];
const put = (rel, content) => {
  const p = join(appDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  const had = existsSync(p);
  writeFileSync(p, content);
  report.push(`${had ? "updated" : "wrote"}  ${rel}`);
};

// ── 1+2+3. the payload ────────────────────────────────────────────────────────────────────────
cpSync(join(PAYLOAD, "kit"), join(appDir, "src/components/kit"), { recursive: true });
report.push("copied   src/components/kit/ (starter kit, verbatim)");
for (const f of ["shadcn.css", "tokens.css", "theme-variants.css"]) {
  cpSync(join(PAYLOAD, f), join(appDir, "src", f));
  report.push(`copied   src/${f}`);
}
cpSync(join(PAYLOAD, "app-ui-shim.js"), join(appDir, "src/lib/app-ui-shim.js"));
report.push("copied   src/lib/app-ui-shim.js");
cpSync(join(PAYLOAD, "kit-compat.css"), join(appDir, "src/kit-compat.css"));
report.push("copied   src/kit-compat.css");

// ── 4. vite alias ─────────────────────────────────────────────────────────────────────────────
const vitePath = join(appDir, "vite.config.js");
if (existsSync(vitePath)) {
  let vite = readFileSync(vitePath, "utf8");
  if (vite.includes("@kissflow/app-ui")) {
    report.push("ok       vite.config.js alias already present");
  } else {
    // Anchor on the "@" alias every create-app scaffold ships. Failing loudly beats guessing
    // at an unrecognised config shape.
    const anchor = /("@":\s*path\.resolve\([^)]*\))/;
    if (!anchor.test(vite)) {
      console.error('kit-install: could not find the `"@": path.resolve(...)` alias in vite.config.js — add manually:');
      console.error('  "@kissflow/app-ui": path.resolve(__dirname, "src/lib/app-ui-shim.js")');
      process.exit(2);
    }
    vite = vite.replace(
      anchor,
      `$1,\n      // Starter-kit components import "@kissflow/app-ui"; the shim maps those hooks\n      // onto @kissflow/app-core so the kit files stay verbatim copies of the starter.\n      "@kissflow/app-ui": path.resolve(__dirname, "src/lib/app-ui-shim.js")`
    );
    writeFileSync(vitePath, vite);
    report.push("patched  vite.config.js (alias @kissflow/app-ui → shim)");
  }
} else {
  report.push("SKIPPED  vite.config.js not found — add the @kissflow/app-ui alias manually");
}

// ── 5. main.jsx imports ───────────────────────────────────────────────────────────────────────
const mainPath = join(appDir, "src/main.jsx");
if (existsSync(mainPath)) {
  let main = readFileSync(mainPath, "utf8");
  const before = main;
  // themes.css out (the kit's graph replaces its blocks), shadcn.css in — same position.
  if (/import\s+["']\.\/themes\.css["'];?/.test(main)) {
    main = main.replace(
      /import\s+["']\.\/themes\.css["'];?/,
      '// themes.css replaced by the kit token graph (kit-install.mjs) — re-importing it would\n// overwrite the triplet tokens with whole colours and break the hsl(var()) bridge.\nimport "./shadcn.css";'
    );
  } else if (!main.includes('"./shadcn.css"')) {
    main = main.replace(/import\s+["']\.\/index\.css["'];?/, (m) => `${m}\nimport "./shadcn.css";`);
  }
  // app-theme.css out — superseded by app-identity.css below. An app themed via CONDUCTOR.md's
  // `theme-from-design.mjs --out src/app-theme.css` path arrives here with that import already
  // LAST, which (before this fix) kept winning the cascade over app-identity.css with values the
  // kit cannot use as-is (bare triplets where var(--chart-N) needs a whole colour — see the BUG
  // note in this file's header). Neutralized wherever it already sits, not deleted — the file
  // itself stays on disk; theme-check.mjs still reads it for its legacy-path detection.
  let neutralizedAppTheme = false;
  if (/import\s+["']\.\/app-theme\.css["'];?/.test(main)) {
    main = main.replace(
      /import\s+["']\.\/app-theme\.css["'];?/,
      "// app-theme.css superseded by app-identity.css (kit-install.mjs) — it predates the kit's\n" +
      '// triplet convention ("H S% L%" bare) and would silently outrank --chart-N etc. with\n' +
      "// values invalid for the kit's var(--chart-N) consumption if left wired in below."
    );
    neutralizedAppTheme = true;
  }
  if (!main.includes('"./app-identity.css"')) {
    main = main.replace(/import\s+["']\.\/shadcn\.css["'];?/, (m) => `${m}\nimport "./app-identity.css";`);
  }
  // theme-variants.css — Compass/Dusk/Cove/Nova's literal overrides (gen-theme-variants.mjs).
  // AFTER app-identity.css: source order doesn't decide the outcome here (a `:root[data-theme=…]`
  // block always beats app-identity's bare `:root` on specificity, 0,2,0 > 0,1,0, regardless of
  // where either import sits — same reasoning emit-live-themes.mjs documents for its own case) but
  // this keeps the file readable as "identity first, then the anchor picker that can override it".
  if (!main.includes('"./theme-variants.css"')) {
    main = main.replace(
      /import\s+["']\.\/app-identity\.css["'];?/,
      (m) => `${m}\n// Compass/Dusk/Cove/Nova's overrides — inert until <html data-theme> names one\n// (ThemeSwitcher.jsx sets it; see gen-theme-variants.mjs for what this declares).\nimport "./theme-variants.css";`
    );
  }
  if (!main.includes('"./kit-compat.css"')) {
    main = main.replace(
      /import\s+["']\.\/app-identity\.css["'];?/,
      (m) => `${m}\n// Scaffold-shell sidebar-* tokens derived from the identity (kit-install.mjs).\nimport "./kit-compat.css";`
    );
  }
  if (main !== before) {
    writeFileSync(mainPath, main);
    report.push(
      "patched  src/main.jsx (shadcn.css in, themes.css out, identity + kit-compat last)"
      + (neutralizedAppTheme ? " — app-theme.css import neutralized (was outranking the new identity)" : "")
    );
  } else {
    report.push("ok       src/main.jsx already wired");
  }
} else {
  report.push("SKIPPED  src/main.jsx not found — wire the css imports manually");
}

// ── 5b. the sidebar rail fills its own width ──────────────────────────────────────────────────
// The scaffold's <aside> is `w-60 … md:flex` — a ROW flex container — but its only child carries
// `h-full` with no width. A flex item defaults to `flex: 0 1 auto`, so along the MAIN (horizontal)
// axis it sizes to its content, not the container: the rail's last ~50px goes unclaimed and every
// nav row's hover/active background stops short of the edge. Shipped in create-app's template, so
// every scaffolded app inherits it. `w-full` on the child is the whole fix.
//
// Matched by shape, not by the exact class string, so a shell an agent has already restyled still
// gets patched. Advisory, not fatal: a rebuilt shell may legitimately not have this element, and
// a missing rail is a cosmetic defect, not a broken token contract like the vite alias above.
const shellPath = join(appDir, "src/components/app-shell.jsx");
if (existsSync(shellPath)) {
  const shell = readFileSync(shellPath, "utf8");
  const rail = /className="([^"]*\bh-full\b[^"]*\btext-sidebar-foreground\b[^"]*)"/;
  const hit = shell.match(rail);
  if (!hit) {
    report.push("SKIPPED  app-shell.jsx: no sidebar body found — check the rail fills its w-60");
  } else if (/\bw-full\b/.test(hit[1])) {
    report.push("ok       app-shell.jsx sidebar body already fills the rail");
  } else {
    writeFileSync(
      shellPath,
      shell.replace(rail, (_, cls) => `className="${cls.replace(/\bh-full\b/, "h-full w-full")}"`)
    );
    report.push("patched  app-shell.jsx (w-full on the sidebar body — fills the w-60 rail)");
  }
} else {
  report.push("SKIPPED  src/components/app-shell.jsx not found");
}

// ── 6+7. identity in triplet form + the language stamp ────────────────────────────────────────
if (specPath) {
  const spec = JSON.parse(readFileSync(resolve(specPath), "utf8"));
  const design = spec.design || spec;
  const { language, source } = languageDecision(design);
  const tokens = identityTokens(design, language, { wholeValueColors: false });
  const name = design.name || design.id || "this app";

  const lines = [
    "/* GENERATED by engine/theme-from-design.mjs — identityTokens() in TRIPLET form, written by",
    " * engine/kit-install.mjs. Regenerate by re-running kit-install (NOT theme-from-design --out,",
    " * which emits whole colours for the scaffold bridge and would break the kit's hsl(var())",
    " * bridge — see src/shadcn.css).",
    " *",
    ` * ${name}'s identity, layered on the ${language.toUpperCase()} design language (${source}).`,
    design.anchorName ? ` * Anchor: ${design.anchorName}.` : null,
    " */",
    "",
    ":root {",
  ].filter(Boolean);
  for (const t of tokens) lines.push(`  ${t.name}: ${t.value};${t.note ? `   /* ${t.note} */` : ""}`);
  lines.push("}");
  if (!tokens.length) lines.push("", "/* The design slice carried no palette — the app wears its language unmodified. */");
  put("src/app-identity.css", lines.join("\n") + "\n");
  report.push(`         (${tokens.length} tokens, language=${language} [${source}])`);

  const stamped = setLanguageAttribute(join(appDir, "index.html"), language);
  report.push(
    stamped.ok
      ? `${stamped.changed ? "stamped " : "ok      "} index.html <html data-theme="${language}">`
      : `SKIPPED  index.html: ${stamped.reason}`
  );
} else {
  report.push("SKIPPED  no --spec: src/app-identity.css untouched (pass the run's experience-spec.json)");
}

// ── 8. refresh the installed theme-check.mjs ──────────────────────────────────────────────────
// emit-live-themes.mjs installs scripts/theme-check.mjs (build-app.md 4b.i, always run first) —
// but if that happened on an older copy of this engine, the app is carrying a version that
// predates app-identity.css and cannot detect the exact failure this file's step 5 just fixed
// (an identity sheet silently outranked by a stale app-theme.css). Same idempotent-overwrite
// convention emit-live-themes.mjs itself uses: always replace with the current canonical copy,
// never hand-edited in an app, so there is nothing to lose by refreshing it on every run.
const themeCheckSrc = join(HERE, "theme-check.mjs");
const themeCheckDest = join(appDir, "scripts", "theme-check.mjs");
if (existsSync(themeCheckSrc)) {
  const fresh = readFileSync(themeCheckSrc, "utf8");
  const current = existsSync(themeCheckDest) ? readFileSync(themeCheckDest, "utf8") : null;
  if (current === fresh) {
    report.push("ok       scripts/theme-check.mjs already current");
  } else {
    put("scripts/theme-check.mjs", fresh);
  }
} else {
  report.push("SKIPPED  theme-check.mjs not found next to kit-install.mjs — refresh scripts/theme-check.mjs manually");
}

// ── 9. install + wire shell-check.mjs ─────────────────────────────────────────────────────────
// 2026-08-13, on request, after kf-ui-builder.md's own written shell rules (sidebar shadow not
// border, the header shape, mounting ThemeSwitcher) drifted in practice across freshly-built
// apps despite existing — a written instruction an agent can skip is exactly the failure
// theme-check.mjs's own banner describes for the identity gate. Same idempotent-install +
// prebuild-wiring pattern emit-live-themes.mjs uses for theme-check.mjs, kept as its own script
// (not folded into theme-check.mjs) because it checks a different file for a different reason —
// shell CONVENTIONS, not identity — and kit-install.mjs is the step that actually owns
// src/components/app-shell.jsx (step 5b already patches it), so it makes sense as the installer.
const shellCheckSrc = join(HERE, "shell-check.mjs");
if (existsSync(shellCheckSrc)) {
  const fresh = readFileSync(shellCheckSrc, "utf8");
  const dest = join(appDir, "scripts", "shell-check.mjs");
  const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
  if (current === fresh) {
    report.push("ok       scripts/shell-check.mjs already current");
  } else {
    put("scripts/shell-check.mjs", fresh);
  }
  try {
    const pkgPath = join(appDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.scripts ||= {};
    pkg.scripts["check:shell"] = "node scripts/shell-check.mjs .";
    const pre = pkg.scripts.prebuild;
    if (!pre) pkg.scripts.prebuild = "npm run check:shell";
    else if (!pre.includes("check:shell")) pkg.scripts.prebuild = `${pre} && npm run check:shell`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    report.push("ok       package.json wired (check:shell in prebuild)");
  } catch {
    report.push("SKIPPED  package.json wiring for check:shell — wire manually (non-fatal, shell still installs)");
  }
} else {
  report.push("SKIPPED  shell-check.mjs not found next to kit-install.mjs — refresh scripts/shell-check.mjs manually");
}

console.log("KIT-INSTALL — " + appDir);
for (const r of report) console.log("  " + r);
console.log("\nPages should import display components from @/components/kit/* — see the agents'");
console.log("composition table (kf-ui-builder.md). The record-form system (components/form, fields,");
console.log("tablefields) stays on the scaffold's shadcn primitives.");
