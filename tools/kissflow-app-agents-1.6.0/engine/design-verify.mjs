// design-verify.mjs — deterministic check that a run's `design` slice was a real decision, not a
// skipped step wearing a plausible default.
//
// WHY THIS EXISTS. kf-design-director.md has always said the director must "ADD your rationale
// (1–3 lines: why this anchor + these variations fit THIS domain)" and "Never repeat the identical
// (hueShift, archetype) pair as another app". Both were prose-only — nothing checked either one —
// and an audit of real runs found roughly HALF shipping with no `rationale` field at all, landing on
// unmodified defaults (rail-left, light sidebar, zero hue-shift). Nothing failed: the app still
// rendered, `theme-check.mjs` still passed (it only catches an app with NO accent at all, not one
// with an unexplained, possibly-repeated default accent), and the gap stayed invisible.
//
// 2026-08-13: `language-catalog.mjs design` now REFUSES to print a slice without `--rationale` — see
// that file's header note. This script is the backstop for everything that isn't that CLI call: a
// hand-edited experience-spec.json, an older run, or a design slice a future orchestrator produces
// some other way. Same "fix at the source + add a gate" shape as check-token-spelling.mjs and
// theme-check.mjs — a prose rule and a source-level requirement can both still be silently bypassed;
// a gate that reads the finished artifact cannot.
//
//   node design-verify.mjs <experience-spec.json>       → checks that one run
//   node design-verify.mjs <experience-spec.json> --check-repeats   → also warn on cross-run overlap
//
// Exit 0 = PASS, 1 = FAIL (missing/empty rationale only — that is the objective, unambiguous defect).
// The never-repeat rule is reported as a WARNING even with --check-repeats: two apps in the same
// domain family can legitimately deserve the same look, so it is a nudge for a human to look at, not
// a build-breaking rule the same way an empty rationale is.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

/** @param {object} spec  a parsed experience-spec.json */
export function verifyDesign(spec, { runsDir, selfId, decisionsPath } = {}) {
  const findings = [];
  const design = spec && spec.design;

  // The layout is a DECISION, not a setting. A run shipped eleven recorded decisions and zero about
  // the nav position or palette — the archetype was an orchestrator's CLI flag, flipped twice in one
  // session, invisible at sign-off both times (2026-08-16). When the run keeps a decisions log at
  // all, the design/layout choice must be IN it (`language-catalog.mjs design … --record <runDir>`
  // writes it); a log with no design entry means the design agent was overridden off the record.
  if (decisionsPath && existsSync(decisionsPath)) {
    let log = "";
    try { log = readFileSync(decisionsPath, "utf8"); } catch { /* unreadable = treat as absent */ }
    if (log && !/^#{2,3}\s*D\d+[a-z]?\s*[·:.\-–].*(design|layout|archetype|rail|top-bar|palette)/im.test(log))
      findings.push({ level: "error", msg: `decisions.md records ${(log.match(/^#{2,3}\s*D\d+/gim) || []).length} decisions and NONE about the design/layout — the nav position and palette were chosen off the record. Re-run \`language-catalog.mjs design … --record <runDir>\` so the choice rides the same review page as every other decision.` });
  }

  if (!design) {
    findings.push({ level: "error", msg: "no `design` slice in experience-spec.json — kf-design-director's step never ran (or wasn't merged in)." });
    return { findings, pass: false };
  }

  const rationale = typeof design.rationale === "string" ? design.rationale.trim() : "";
  if (!rationale) {
    findings.push({ level: "error", msg: "design.rationale is missing or empty — the accent was never explained. Regenerate via `language-catalog.mjs design <id> --rationale \"…\"` (now required) rather than hand-adding a one-word placeholder." });
  } else if (rationale.startsWith("FALLBACK (")) {
    // Honest and loud already (design-language.mjs's own no-spec fallback labels itself this way) —
    // not a defect to fail on, but worth surfacing: it means the Design phase step was skipped
    // entirely upstream, not just under-explained.
    findings.push({ level: "warn", msg: `design.rationale reports the auto-fallback path was used: "${rationale}" — the Design phase likely didn't run kf-design-director at all.` });
  } else if (rationale.length < 15) {
    findings.push({ level: "warn", msg: `design.rationale is very short ("${rationale}") — likely a placeholder rather than a real domain-grounded reason.` });
  }

  if (!design.shell || !design.shell.archetype) {
    findings.push({ level: "error", msg: "design.shell.archetype is missing — the shell generator will silently fall back to rail-left." });
  }

  // Cross-run "never repeat this pair" check — same logic as language-catalog.mjs's CLI-time
  // warning, re-run here so it also catches a slice that bypassed that CLI (hand-edited, or written
  // by some other orchestrator) rather than only checking at generation time.
  if (runsDir && design.shell && existsSync(runsDir)) {
    let entries = [];
    try { entries = readdirSync(runsDir, { withFileTypes: true }); } catch { /* best-effort */ }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (selfId && e.name === selfId) continue;
      const specPath = join(runsDir, e.name, "prototype", "experience-spec.json");
      if (!existsSync(specPath)) continue;
      let other;
      try { other = JSON.parse(readFileSync(specPath, "utf8")); } catch { continue; }
      const d = other && other.design;
      if (!d || !d.shell) continue;
      if (d.shell.archetype === design.shell.archetype && (d.hueShift || 0) === (design.hueShift || 0)) {
        findings.push({ level: "warn", msg: `same (archetype="${design.shell.archetype}", hueShift=${design.hueShift || 0}) pair as "${d.name || e.name}" (${e.name}) — kf-design-director.md says vary at least one.` });
        break; // one example is enough to act on
      }
    }
  }

  const errors = findings.filter((f) => f.level === "error");
  return { findings, pass: errors.length === 0 };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const file = process.argv[2];
  const checkRepeats = process.argv.includes("--check-repeats");
  if (!file) { console.error("usage: design-verify.mjs <experience-spec.json> [--check-repeats]"); process.exit(2); }
  if (!existsSync(file)) { console.error(`design-verify: no such file: ${file}`); process.exit(2); }
  const spec = JSON.parse(readFileSync(file, "utf8"));
  // <runDir>/prototype/experience-spec.json → runs/ is two levels up from <runDir>
  const runsDir = checkRepeats ? dirname(dirname(dirname(file))) : null;
  const selfId = checkRepeats ? spec.design && spec.design.id : null;
  // <runDir>/prototype/experience-spec.json → the run's own decision log sits one level up
  const decisionsPath = join(dirname(dirname(file)), "decisions.md");
  const r = verifyDesign(spec, { runsDir, selfId, decisionsPath });
  for (const f of r.findings) console.log(`  ${f.level === "error" ? "✗" : "⚠"} ${f.msg}`);
  console.log(`\n${r.pass ? "✅ PASS" : "❌ FAIL"} — design slice ${r.pass ? "has a real rationale" : "needs one"}`);
  process.exit(r.pass ? 0 : 1);
}
