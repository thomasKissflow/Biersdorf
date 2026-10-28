#!/usr/bin/env node
// kf-author engine CLI. Dependency-free.
//   node cli.mjs validate <ir.json>          — validate the App-Spec IR (shape + cross-refs)
//   node cli.mjs verify   <ir.json>          — IR validation + coherence checks
//   node cli.mjs build    <ir.json> [--out d]— compile IR → metadata blobs (DRY-RUN: writes to d/)
//   node cli.mjs check    <appExportDir>     — run validators over a real export folder
//   node cli.mjs import   <appExportDir>     — load an export → (partial) IR-ish summary

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { validateIR, checkCoherenceIR, checkGateIR, checkAppFloor, validationGate, loadRunSpec } from "./ir.mjs";
import { ensureExperience } from "./experience.mjs";
import { buildApp, normalizeIR } from "./builders.mjs";
import { stamp as tlStamp } from "./timeline.mjs";
import { dirname as tlDirname } from "node:path";
// auto-timing: stamps the run's timeline.jsonl (actor = $KF_ACTOR or "engine"). READ-ONLY commands
// (validate/verify/build are dry-runs) must NOT dirty the input directory — writing timeline.jsonl
// beside a checked-in example broke reproducibility and mutated the source tree (#25). Telemetry is
// now OPT-IN: set KF_TIMELINE=1 to stamp beside the IR, or KF_TIMELINE_DIR=<dir> to redirect it to a
// run/output directory. apply (a live mutation, not read-only) still stamps by default.
const tl = (irPath, step, ev, { mutating = false } = {}) => {
  const optedIn = process.env.KF_TIMELINE === "1" || process.env.KF_TIMELINE_DIR || mutating;
  if (!optedIn) return;
  const dir = process.env.KF_TIMELINE_DIR || tlDirname(irPath);
  try { tlStamp(dir, process.env.KF_ACTOR || "engine", step, ev); } catch { /* never fatal */ }
};
import { loadApp, allBlobs } from "./loader.mjs";
import { validateBlob, errors, warnings } from "./validators.mjs";
import { recordVerdict } from "./pipeline.mjs";
import { resolveMode, resolveTarget } from "./cli-args.mjs";
// #9 — a gate/verify command RECORDS its own verdict, atomically with running. Before this the checks
// ran but wrote nothing, so pipeline's guard blocked legit workflows until someone found the
// undocumented `pipeline pass`. Recorded only when the IR is a run's canonical app-spec.json (so an
// ad-hoc `verify /tmp/x.json` never scribbles pipeline state into an unrelated directory).
const recordGate = (irPath, stageId, pass, detail) => {
  if (!(irPath && /(^|\/)app-spec\.json$/.test(irPath))) return;   // only a run's canonical spec gets a ledger entry
  // NOT SILENT (#12). Recording is the gate's whole point — the apply guard trusts this ledger. A write
  // that fails must not vanish: if the verdict didn't land, a later `apply` would either wrongly refuse
  // a passed chain or (worse, for a BLOCK we failed to record) wave through a gate that said no. It stays
  // NON-FATAL to the current command (the check itself already ran and printed), but it is now LOUD, so
  // the failure is visible and the operator knows the ledger is behind.
  try { recordVerdict(tlDirname(irPath), stageId, pass ? "PASS" : "BLOCK", detail); }
  catch (e) { console.error(`⚠ could not record ${pass ? "PASS" : "BLOCK"} for '${stageId}' in ${tlDirname(irPath)}: ${e.message} — the pipeline ledger is now behind; re-run this check before apply`); }
};

// Minimal, zero-dep .env loader — the engine reads process.env but nothing populates it.
// Loads (cwd) .env then inventory/.env; already-set real env vars always win.
for (const f of [".env", "inventory/.env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith("#")) continue;
      const k = m[1]; let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch { /* no such file — fine */ }
}

// `arg` is each command's OPTIONAL leading positional (an ir.json path, a zip path…). Commands whose
// positional is genuinely optional (deploy-ui's URL mode: `deploy-ui --app X --url Y`, no zip path)
// would otherwise have their FIRST FLAG swallowed into `arg` — then `flag("--app")` can't find "--app"
// in the remainder (it's gone) and misreports as missing (found live, 2026-07-31: deploy-ui's own
// documented URL-mode usage example fails this way). Only bind `arg` when the token isn't a flag.
const [cmd, ...cmdArgs] = process.argv.slice(2);
const arg = cmdArgs[0] && !cmdArgs[0].startsWith("--") ? cmdArgs[0] : undefined;
const rest = arg !== undefined ? cmdArgs.slice(1) : cmdArgs;
const flag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const hasFlag = (n) => rest.includes(n);

// STRICT FLAG CONTRACT (#24): each command declares the flags it accepts; anything else is a hard
// error, non-zero. Before this, `build --apply --target dev` was silently ignored — build is
// dry-run, so callers (and agents) believed a mutation happened when nothing did. `apply` never
// took --target either. A flag that does nothing must FAIL, not pass quietly. `_val` flags take a
// following value; `_bool` are standalone. Commands absent from the map skip the check (import's
// legacy --live/--target and deploy-ui's dynamic args stay permissive for now).
const FLAGSPEC = {
  validate: { bool: [] }, verify: { bool: [] },
  gate: { bool: [] },
  "validation-gate": { val: ["--scope"], bool: [] },
  build: { val: ["--out"], bool: ["--no-pages"] },   // NOT --apply/--target: build is dry-run only
  apply: { val: ["--target", "--mode"], bool: ["--no-pages", "--no-ai-pages", "--force", "--quick"] },
  "resolve-experience": { val: ["--out"], bool: [] },
};
const strictFlags = (command) => {
  const spec = FLAGSPEC[command]; if (!spec) return;
  const allowed = new Set([...(spec.val || []), ...(spec.bool || [])]);
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]; if (!t.startsWith("--")) continue;
    if (!allowed.has(t)) {
      if (command === "build" && (t === "--apply" || t === "--target"))
        { console.error(`error: \`build\` is DRY-RUN only — ${t} does nothing. To mutate, use \`apply <ir> [--target <env>]\`.`); process.exit(2); }
      console.error(`error: unknown flag ${t} for \`${command}\`. Allowed: ${[...allowed].join(", ") || "(none)"}`); process.exit(2);
    }
    if ((spec.val || []).includes(t)) { if (rest[i + 1] === undefined || rest[i + 1].startsWith("--")) { console.error(`error: ${t} requires a value`); process.exit(2); } i++; }
  }
};
strictFlags(cmd);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
// Every command that takes an IR reads it through here. normalizeIR was added to validate/verify, gate
// and build one at a time, which left `apply` and `validation-gate` reading the file raw — so a
// design-shape spec passed every gate AND the whole dry-run build, then failed at the one command that
// mutates Kissflow (apply saw forms/roles/permissions undefined and exited on 23 validation errors),
// while validation-gate diffed a lowered live IR against a raw desired one and read it as "every flow
// deleted, nothing created". One loader, so no shape can be understood by some commands only.
const readIR = (p) => normalizeIR(loadRunSpec(p));   // loadRunSpec folds in the sibling automations.json (assembly step)
const report = (issues) => {
  for (const i of issues) console.log(`  ${i.level === "error" ? "✗" : "•"} [${i.code}] ${i.msg}${i.where ? "  (" + i.where + ")" : ""}`);
  console.log(`\n  ${errors(issues).length} errors, ${warnings(issues).length} warnings`);
};

if (!cmd || cmd === "help") {
  console.log("kf-author engine — validate | verify | gate | validation-gate <live> <desired> [--scope] | build [--no-pages] | check | import | resolve-experience | deploy-ui");
  process.exit(0);
}

try {
  if (cmd === "validate" || cmd === "verify") {
    tl(arg, cmd, "start");
    const ir = readIR(arg);
    const res = validateIR(ir);
    const issues = cmd === "verify" ? [...res.issues, ...checkCoherenceIR(ir)] : res.issues;
    console.log(`\nIR: ${ir.app?.name || "(unnamed)"}`);
    report(issues);
    const bad = errors(issues).length;
    if (cmd === "verify") recordGate(arg, "verify", bad === 0, bad ? `${bad} error(s)` : "valid + coherent");
    tl(arg, cmd, "end");
    process.exit(bad ? 1 : 0);
  }

  // `validation-gate` — the VALIDATION ENGINE GATE (EDIT PATH ONLY). Diffs the DESIRED IR against the
  // LIVE (imported) IR and BLOCKS any change outside the intended scope — so an edit can never silently
  // rewrite unrelated items. Requires a live baseline; a fresh CREATE has none, so it is NOT run there.
  //   node cli.mjs validation-gate <liveIR.json> <desiredIR.json> [--scope id1,id2,…]
  if (cmd === "validation-gate") {
    const desiredArg = rest[0]; // argv[4] — argv[3] is `arg` (the live IR)
    if (!arg || !desiredArg) { console.error("usage: validation-gate <liveIR.json> <desiredIR.json> [--scope id1,id2]"); process.exit(2); }
    const si = process.argv.indexOf("--scope");
    const scope = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
    const r = validationGate(readIR(arg), readIR(desiredArg), { scope });
    console.log(`\nVALIDATION ENGINE GATE (edit scope) · ${r.changes.length} change(s)${r.scoped ? ` · scope: ${scope.join(", ")}` : " · (no scope declared — full changeset shown)"}`);
    for (const c of r.changes) console.log(`  ${r.scoped && r.outOfScope.includes(c) ? "✗ OUT-OF-SCOPE" : "•"} ${c.change} ${c.kind} '${c.id}'`);
    if (r.scoped && !r.pass) {
      console.log(`\n❌ BLOCKED — ${r.outOfScope.length} change(s) outside the intended scope. An edit must touch ONLY what was asked; import the live app and patch the delta rather than re-creating the IR.`);
      process.exit(1);
    }
    console.log(`\n${r.scoped ? "✅ IN SCOPE — every change is within the intended edit." : "ℹ️  review the changeset above; pass --scope to enforce."}`);
    process.exit(0);
  }

  // `gate` — the HYBRID's DETERMINISTIC structural pass: validate + coherence + checkGateIR, run every
  // step at ~ms with NO model. Blockers (errors) must be fixed before advancing; risks (warns) are
  // surfaced for waiver. The AI verifier/coherence-critic run this FIRST, then reason only about the
  // SEMANTIC layer (relevance/meaningfulness/novelty) that code cannot judge.
  if (cmd === "gate") {
    tl(arg, "gate", "start");
    const ir = readIR(arg);
    const issues = [...validateIR(ir).issues, ...checkCoherenceIR(ir), ...checkGateIR(ir), ...checkAppFloor(ir)];
    const blockers = errors(issues), risks = warnings(issues);
    console.log(`\nGATE (deterministic) · ${ir.app?.name || "(unnamed)"}`);
    report(issues);
    console.log(`\n${blockers.length ? "❌ BLOCKED" : "✅ STRUCTURE OK"} — ${blockers.length} blocker(s), ${risks.length} risk(s)` +
      (blockers.length ? "" : "\n   next: AI gate reasons ONLY about semantics (relevant dashboards? meaningful landings? novel breaks?)"));
    recordGate(arg, "gate", blockers.length === 0, blockers.length ? `${blockers.length} blocker(s)` : "structure ok");
    tl(arg, "gate", "end");
    process.exit(blockers.length ? 1 : 0);
  }

  if (cmd === "build") {
    tl(arg, "build", "start");
    const ir = readIR(arg);
    // --no-pages: CUSTOM-UI mode — build app + models + roles + workflows WITHOUT native pages/nav.
    if (hasFlag("--no-pages")) { ir.pages = []; console.log("no-pages: skipping experience layer — no native pages/nav will be built"); }
    else {
      const exp = ensureExperience(ir); // GUARANTEE: every build has pages + nav + role landings
      if (exp.added.length) console.log(`experience: auto-added baseline (${exp.added.length}) — ${exp.added.join(", ")}\n(design richer pages via kf-experience-designer to override)`);
    }
    const v = validateIR(ir);
    if (!v.ok) { console.log("IR invalid — fix before building:"); report(v.issues); tl(arg, "build", "end"), process.exit(1); }
    const { appId, artifacts } = buildApp(ir);
    const out = flag("--out", join(process.cwd(), "kf-build-out"));
    mkdirSync(out, { recursive: true });
    console.log(`\nPLAN — app ${appId}: ${artifacts.length} artifacts (DRY-RUN → ${out})`);
    let issues = [];
    for (const a of artifacts) {
      const dir = join(out, a.type); mkdirSync(dir, { recursive: true });
      if (a.doc) writeFileSync(join(dir, `${a.id}.doc.json`), JSON.stringify(a.doc, null, 2));
      if (a.shell) writeFileSync(join(dir, `${a.id}.shell.json`), JSON.stringify(a.shell, null, 2));
      if (a.blob) {
        writeFileSync(join(dir, `${a.id}.blob.json`), JSON.stringify(a.blob, null, 2));
        issues = issues.concat(validateBlob({ label: a.id, blob: a.blob }));
      }
      console.log(`  + ${a.type.padEnd(6)} ${a.id}`);
    }
    console.log("\nvalidation of generated metadata:");
    report(issues);
    console.log("\n(use --apply --target <env> to publish — gated; not implemented in dry-run build)");
    tl(arg, "build", "end"), process.exit(errors(issues).length ? 1 : 0);
  }

  if (cmd === "apply") {
    // PIPELINE GUARD — apply creates records in a real Kissflow account and a published process
    // cannot be deleted, so the chain behind it must be complete. This is enforcement, not advice:
    // the personal-banking run reached apply-readiness with the adversarial verifier never run, and
    // that verifier went on to return BLOCK with two defects that would have produced an unusable
    // app in the customer's account. `--force` remains for when you own the consequences.
    // Resolve the strategy (#11): --mode express|comprehensive, with --quick as a deprecated alias.
    let modeRes;
    try { modeRes = resolveMode(rest); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
    const mode = modeRes.mode;   // "express" | "comprehensive" — buildRequest maps express→quick
    if (modeRes.deprecated) console.warn("warning: --quick is deprecated; use --mode express");
    if (!cmdArgs.includes("--force")) {
      const runDir = dirname(resolve(arg));
      // ONE guard API — the orchestrator's clearFor, the same contract the chat host uses. First
      // auto-run any DETERMINISTIC gate whose verdict isn't yet recorded (#9: a gate records its own
      // verdict, so the guard can't demand a manual `pipeline pass`); what remains blocked is only the
      // agent/human gates, which genuinely need work the CLI can't fabricate.
      const { drive, clearFor } = await import("./orchestrator.mjs");
      await drive({ runDir, mode }).catch(() => {});   // record deterministic verdicts before checking
      const { clear, missing } = clearFor({ runDir, mode }, "apply");
      if (!clear) {
        console.error(`\n✗ REFUSING to apply — ${missing.length} required stage(s) incomplete in ${runDir}:`);
        for (const m of missing) console.error(`  ${m.short ? "◐" : "·"} ${m.label}${m.short ? ` — ${m.artifact} holds only ${m.short.have} of ${m.short.need}` : ""}${m.note ? `\n      ${m.note}` : ""}`);
        console.error(`\nRun \`node plugins/app-agents/engine/orchestrator.mjs drive ${runDir} --mode ${mode}\` to run the deterministic gates,`);
        console.error("then complete the agent gates (adversarial verifier) and human sign-off, or re-run with --force.\n");
        process.exit(1);
      }
    }
    tl(arg, "apply", "start", { mutating: true });
    const ir = readIR(arg);
    // --no-pages: CUSTOM-UI mode — apply app + models + roles + workflows only. Skip the experience layer
    // ENTIRELY, including the AI page generator: a custom-UI app never shows native dashboards, and the
    // generator's async create→preview→generate→publish loop was the single biggest cost inside apply
    // (~90s for 3 dashboards nobody sees — measured customer-accounts 2026-07-31).
    // --no-pages is a POLICY passed to applyIR, not an IR mutation: clearing ir.pages here is undone
    // by normalizeIR (it lifts experience.pages back in on an empty ir.pages). pageMode:"none" is the
    // one that actually holds through the compiler (2026-08-17, #11).
    const noPages = hasFlag("--no-pages");
    if (noPages) { process.env.KF_AI_PAGES = "0"; console.log("no-pages: custom-UI/backend-only — no native pages, no nav, no AI dashboards (policy, enforced in the compiler)"); }
    else {
      const exp = ensureExperience(ir); // GUARANTEE: every applied app has pages + nav + role landings
      if (exp.added.length) console.log(`experience: auto-added baseline (${exp.added.length}) — ${exp.added.join(", ")}`);
    }
    // validity AND the app floor. Apply is the last gate before records exist in a real account, and
    // a structurally perfect app with no workflow, no computed anything and nothing that fires is not
    // one worth creating there.
    const v = validateIR(ir);
    const floor = checkAppFloor(ir);
    if (!v.ok || floor.length) { console.log("IR not ready to apply:"); report([...v.issues, ...floor]); tl(arg, "apply", "end", { mutating: true }), process.exit(1); }
    const { applyIR } = await import("./client.mjs");
    // RESUMABLE: checkpoint next to the IR so a re-run (e.g. after a bash-timeout kill in Cowork)
    // continues instead of re-publishing. Delete apply-state.json to force a clean re-apply.
    const stateFile = join(dirname(arg), "apply-state.json");
    if (existsSync(stateFile)) console.log(`resuming from checkpoint ${stateFile} (delete it to start clean)`);
    // REUSE THE EXISTING APP on a resumed apply. applyIR supports `opts.reuse = {appId, genToServer}`
    // (skips app-create + re-fetches flows that already exist) — but until now nothing here ever
    // passed it, so a second `apply` on a run that already created its app unconditionally called
    // createApp again and 400'd (found live, 2026-07-31: Tiffin's re-apply after an IR fix tried to
    // recreate an app that already existed). id-map.json is applyIR's OWN output (`{app, genToServer}`,
    // written at the end of a run) — read it back if present.
    const idMapFile = join(dirname(arg), "id-map.json");
    let reuse;
    if (existsSync(idMapFile)) {
      try {
        const m = readJson(idMapFile);
        if (m.app) { reuse = { appId: m.app, genToServer: m.genToServer || {} }; console.log(`reuse: found existing app ${m.app} in id-map.json (${Object.keys(reuse.genToServer).length} flow ids)`); }
      } catch { console.log(`id-map.json unreadable — will create a new app (delete it if that's wrong)`); }
    }
    // Resolve the TARGET (#11): --target dev|prod actually selects the creation path now, instead of
    // being accepted and ignored. dev → build directly in dev; prod → create-in-prod→await-in-dev;
    // default → auto (prod-first iff prod creds exist), the historical behavior.
    let tgt;
    try { tgt = resolveTarget(rest, process.env); } catch (e) { console.error(`error: ${e.message}`); tl(arg, "apply", "end", { mutating: true }); process.exit(2); }
    const devHost = (process.env.KISSFLOW_DOMAIN || process.env.KF_DOMAIN) || `${process.env.KISSFLOW_SUBDOMAIN || process.env.KF_SUBDOMAIN}.kissflow.com`;
    const prodHost = (process.env.KISSFLOW_PROD_DOMAIN || process.env.KF_PROD_DOMAIN) || (process.env.KISSFLOW_PROD_SUBDOMAIN || process.env.KF_PROD_SUBDOMAIN ? `${process.env.KISSFLOW_PROD_SUBDOMAIN || process.env.KF_PROD_SUBDOMAIN}.kissflow.com` : "");
    console.log(`\nAPPLY (LIVE, mode: ${mode}, target: ${tgt.target}) — ${ir.app?.name} → ${devHost}`);
    // prodFirst tri-state: true (force prod-first), false (force dev-direct), undefined (auto).
    const willProdFirst = tgt.prodFirst === true || (tgt.prodFirst === undefined && prodHost);
    if (willProdFirst) console.log(`  app shell will be created in prod (${prodHost}) → awaited in dev (${devHost})`);
    else console.log(`  app will be created directly in ${devHost}${tgt.prodFirst === false && prodHost ? " (--target dev: prod-first disabled)" : " (no PROD creds set)"}`);
    // AI PAGES are the DEFAULT: generate role dashboards via Kissflow's AI page generator (richer,
    // natively-correct pages bound to real flows). Opt out with --no-ai-pages or KF_AI_PAGES=0 to use
    // the template page path instead.
    const aiPages = !hasFlag("--no-ai-pages") && process.env.KF_AI_PAGES !== "0";
    console.log(aiPages
      ? "ai-pages (default): generating role dashboards via the AI page generator (async create→preview→generate→publish)"
      : "ai-pages disabled — using the template page path");
    const rep = await applyIR(ir, { stateFile, aiPages, reuse, pageMode: noPages ? "none" : "authored", prodFirst: tgt.prodFirst });
    console.log("\n=== REPORT ===");
    console.log(`app: ${rep.app}`);
    console.log(`roles: ${rep.roles.map((r) => r.name + "(" + r.status + ")").join(", ")}`);
    console.log(`created shells: ${rep.created.length}  published: ${rep.published.length}${rep.skipped?.length ? ` (${rep.skipped.length} unchanged, skipped — incremental)` : ""}`);
    if (rep.aiPages) { const okp = rep.aiPages.filter((p) => p.ok === true); console.log(`ai-pages: ${okp.length}/${rep.aiPages.length} role dashboards published & live (${okp.map((p) => p.role + "→" + p.page).join(", ")})${rep.aiPagesFailed?.length ? ` — FAILED: ${rep.aiPagesFailed.map((f) => f.role + (f.error ? ` (${f.error})` : "")).join(", ")}` : ""}`); }
    if (rep.appPublished === false) console.log(`⚠ app NOT fully published — see errors below`);
    console.log(`verified nested in app: ${rep.verified.nestedInApp}`);
    if (rep.verified.flows) console.log(`  ${rep.verified.flows.join(", ")}`);
    if (rep.errors.length) { console.log("errors:"); rep.errors.forEach((e) => console.log("  ✗ " + e)); }
    tl(arg, "apply", "end", { mutating: true }), process.exit(rep.errors.length ? 1 : 0);
  }

  // LIVE import: `import --live <runDir> [--out live.ir.json]` (also accepts --target for doc parity) —
  // reconstruct the ENGINE IR from the app's LIVE metadata via the run's id-map. This is the reconciler's
  // real baseline + kf-comprehension's static model. Without a flag, `import` keeps its local-dir behavior.
  if (cmd === "import" && (process.argv.includes("--live") || process.argv.includes("--target"))) {
    // runDir = the first non-flag arg that exists (robust to `import --live <runDir>` OR `import <runDir> --live`)
    const runDir = [arg, ...rest].find((a) => a && !a.startsWith("--") && existsSync(a)) || "runs/current";
    const oi = process.argv.indexOf("--out"); const out = oi >= 0 ? process.argv[oi + 1] : null;
    const { importLiveIR } = await import("./import-live.mjs");
    const live = await importLiveIR({ runDir });
    if (out) { writeFileSync(out, JSON.stringify(live, null, 1)); console.log(`import (live) → ${out} · ${live.forms.length} forms reconstructed from live`); }
    else process.stdout.write(JSON.stringify(live, null, 1));
    process.exit(0);
  }

  if (cmd === "check" || cmd === "import") {
    if (!existsSync(arg)) { console.log(`no such folder: ${arg}`); process.exit(1); }
    const app = loadApp(arg);
    const blobs = allBlobs(app);
    console.log(`\n${arg}: ${app.forms.length} forms, ${app.cases.length} cases, ${app.processes.length} processes, ${app.pages.length} pages, ${app.lists.length} lists, ${blobs.length} blobs`);
    if (cmd === "check") {
      let issues = [];
      for (const b of blobs) issues = issues.concat(validateBlob(b));
      report(issues);
      process.exit(errors(issues).length ? 1 : 0);
    }
    process.exit(0);
  }

  if (cmd === "resolve-experience") {
    const [expPath, schemaPath] = [arg, rest[0]];
    if (!expPath || !schemaPath || schemaPath.startsWith("--")) {
      console.error("usage: node cli.mjs resolve-experience <experience-spec.json> <kf-schema.json> [--out lib/ui-spec.json]");
      process.exit(1);
    }
    const { resolveExperience } = await import("./resolve.mjs");
    const experienceSpec = readJson(expPath);
    const kfSchema = readJson(schemaPath);
    const { uiSpec, warnings: warns } = resolveExperience(experienceSpec, kfSchema);
    const out = flag("--out", join(process.cwd(), "lib/ui-spec.json"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(uiSpec, null, 2));
    const widgetCount = uiSpec.pages.reduce((n, p) => n + p.widgets.length, 0);
    const droppedWidgets = warns.filter((w) => w.widget).length;
    const droppedPages = warns.filter((w) => w.page && !w.widget).length;
    console.log(`\nresolve-experience → ${out}`);
    console.log(`  app:     ${uiSpec.app.name} (theme: ${uiSpec.app.theme})`);
    console.log(`  roles:   ${uiSpec.roles.length}`);
    console.log(`  pages:   ${uiSpec.pages.length} resolved${droppedPages ? `, ${droppedPages} dropped` : ""}`);
    console.log(`  widgets: ${widgetCount} resolved${droppedWidgets ? `, ${droppedWidgets} dropped` : ""}`);
    if (warns.length) {
      console.error(`\n${warns.length} warning(s):`);
      for (const w of warns) console.error(`  • ${w.page ? `[${w.page}] ` : ""}${w.widget ? `"${w.widget}": ` : ""}${w.reason}`);
    } else {
      console.error("\nno warnings — every bind resolved to a real id.");
    }
    process.exit(0);
  }

  if (cmd === "deploy-ui") {
    // node cli.mjs deploy-ui <zipPath> --app <appId> [--name "App UI"] [--url <devUrl>] [--open]
    // Deploys the built React zip (or a dev URL) as the app's Application custom component + enables Custom UI.
    const appId = flag("--app");
    const url = flag("--url");
    const name = flag("--name");
    const zipPath = arg && !arg.startsWith("--") ? arg : undefined;
    if (!appId || (!zipPath && !url)) {
      console.error("usage: node cli.mjs deploy-ui <zipPath> --app <appId> [--name \"App UI\"] [--url <devUrl>] [--open]");
      console.error("  ZIP mode : node cli.mjs deploy-ui dist/app-ui.zip --app APP123   (upload+trigger+poll — blob upload is TODO(live-verify))");
      console.error("  URL mode : node cli.mjs deploy-ui --app APP123 --url https://localhost:3000 --open   (simple, reliable — no blob upload; --open launches the app)");
      console.error("  requires env: KISSFLOW_ACCOUNT_ID/API_KEY/API_SECRET (or KF_*) + KISSFLOW_DOMAIN/KF_DOMAIN");
      process.exit(1);
    }
    const { deployUI } = await import("./deploy-ui.mjs");
    console.log(`\nDEPLOY-UI (LIVE) — app ${appId} → ${(process.env.KISSFLOW_DOMAIN || process.env.KF_DOMAIN) || `${process.env.KISSFLOW_SUBDOMAIN}.kissflow.com`}  [mode: ${url ? "url" : "zip"}]`);
    const rep = await deployUI({ appId, zipPath, url, name });
    console.log("\n=== DEPLOY-UI REPORT ===");
    console.log(`component id: ${rep.componentId}`);
    console.log(`mode: ${rep.mode}`);
    console.log(`app url: ${rep.appUrl}`);
    if (rep.warnings.length) { console.log("warnings:"); rep.warnings.forEach((w) => console.log("  • " + w)); }
    // --open: launch the app in the default browser (platform-aware). Best-effort — never fatal.
    if (hasFlag("--open") && rep.appUrl) {
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
      const oArgs = process.platform === "win32" ? ["/c", "start", "", rep.appUrl] : [rep.appUrl];
      try {
        const { spawn } = await import("node:child_process");
        spawn(opener, oArgs, { stdio: "ignore", detached: true }).unref();
        console.log(`opened ${rep.appUrl} in your default browser`);
      } catch (e) { console.log(`could not open the browser (${e.message}) — visit ${rep.appUrl}`); }
    }
    process.exit(0);
  }

  // `plan` — the three-way reconciler diff (#20/#15). base × desired × live → classified changes.
  //   node cli.mjs plan --base <base.json> --desired <desired.json> --live <live.json> [--out plan.json]
  // READ-ONLY / EXPERIMENTAL: this command CLASSIFIES a change and prints/writes the plan. It performs
  // NO mutation — there is no scoped-apply path wired behind it yet. `applicable` is the subset a future
  // scoped apply MAY touch (add/update/delete only); drift, conflict and unknown are never in it.
  if (cmd === "plan") {
    const bArg = flag("--base"), dArg = flag("--desired"), lArg = flag("--live");
    if (!dArg || !lArg) { console.error("usage: plan --base <base.json> --desired <desired.json> --live <live.json> [--out plan.json]\n  (base optional — without it, two-way; with it, drift vs intended-change is distinguished)\n  READ-ONLY: prints/writes the classified plan; does not apply anything."); process.exit(2); }
    const { plan: rPlan } = await import("./reconcile.mjs");
    const load = (f) => (f ? readJson(f) : {});
    const p = rPlan(load(bArg), load(dArg), load(lArg));
    if (flag("--out")) writeFileSync(flag("--out"), JSON.stringify(p, null, 2) + "\n");
    const s = p.summary;
    console.log(`PLAN (three-way, READ-ONLY) — ${s.add} add · ${s.update} update · ${s.delete} delete · ${s.drift} drift(left) · ${s.conflict} CONFLICT · ${s.unknown} unknown(live?) · ${s.unchanged} unchanged`);
    for (const c of p.changes.filter((c) => c.op !== "unchanged")) console.log(`  ${c.op === "conflict" ? "⚠" : c.op === "drift" ? "~" : c.op === "unknown" ? "?" : "•"} ${c.op.padEnd(9)} ${c.slice}:${c.key} — ${c.reason}`);
    if (p.hasUnknown) console.log(`\n?  ${s.unknown} slice(s) with UNKNOWN live state (desired-carried, not reconstructed) — never auto-applied.`);
    if (p.hasConflict) console.log(`\n❌ ${s.conflict} conflict(s) — NOT auto-applicable; a human must resolve before apply.`);
    console.log(`\n${p.applicable.length} applicable change(s). This is a plan only — no mutation was performed.`);
    process.exit(p.hasConflict ? 1 : 0);
  }

  // `orchestrate` — the one entry into the executable build contract (#8). Slash commands and the
  // chat conductor call this instead of describing the flow in prose: it plans/drives the stages and
  // gates for a mode, recording each deterministic verdict atomically (#9). Delegates to
  // orchestrator.mjs so there is exactly one implementation.
  if (cmd === "orchestrate") {
    const sub = arg || "plan";            // plan | drive | clear
    const runDir = rest[0];
    if (!runDir) { console.error("usage: cli orchestrate plan|drive|clear <runDir> [--mode quick|comprehensive] [--renderer …]"); process.exit(2); }
    const { plan: oPlan, drive: oDrive, clearFor } = await import("./orchestrator.mjs");
    const req = { runDir, mode: flag("--mode", "quick"), renderer: flag("--renderer"), review: flag("--review") };
    if (sub === "plan") { const p = oPlan(req); console.log(`PLAN · ${p.request.mode} · renderer ${p.request.renderer}`); for (const s of p.stages) console.log(`  ${s.gate ? "◆" : "·"} ${s.label} [${s.kind}]`); process.exit(0); }
    if (sub === "drive") { const d = await oDrive(req); for (const r of d.ran) console.log(`  ${r.pass === true ? "✅" : r.pass === false ? "❌" : "·"} ${r.id}${r.pending ? " (" + r.pending + ")" : ""} — ${r.detail || ""}`); process.exit(d.ran.some((r) => r.pass === false) ? 1 : 0); }
    if (sub === "clear") { const c = clearFor(req, rest[1] || "apply"); console.log(c.clear ? `✅ clear to ${rest[1] || "apply"}` : `❌ blocked — ${c.missing.map((m) => m.id || m.label || m).join(", ")}`); process.exit(c.clear ? 0 : 1); }
    console.error(`unknown orchestrate subcommand: ${sub}`); process.exit(2);
  }

  console.log(`unknown command: ${cmd}`);
  process.exit(1);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
