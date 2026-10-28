// pipeline.mjs — make "did every stage actually run?" a machine question, not a memory test.
//
//   node pipeline.mjs status  <runDir> [--mode comprehensive|quick]
//   node pipeline.mjs require <runDir> --before apply|deploy|seed [--mode …]
//
// WHY: the pipeline lived only as prose in CONDUCTOR.md, so completeness depended on the conductor
// remembering. On the personal-banking run the conductor skipped the `kf-verifier` gate entirely and
// only discovered it when the user asked "are you running the verification gates?" — the verifier
// then returned BLOCK with seven blockers, two of which would have created an unusable app in the
// customer's Kissflow account. A stage that is easy to skip and expensive to skip will be skipped.
//
// The enforcement point is deliberately NOT "warn the conductor". It is the three irreversible
// actions — apply, deploy-ui, seed-live. Those refuse to run unless the chain behind them is
// complete, because a published Kissflow process cannot be deleted: an unapproved build leaves
// debris in a customer account that outlives the conversation.

import { readFileSync, existsSync, writeFileSync, statSync, mkdirSync, renameSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * A stage is done when its ARTIFACT exists on disk. That is the honest signal — not a log line, not
 * a checkbox someone ticked. `gate` stages additionally require a recorded pass in pipeline-state.
 *
 * `min: { n, count }` adds a CONTENT floor on top of existence. Existence alone is satisfiable by an
 * empty shell — `{"automations": []}` is a file, and a decisions log with no decisions in it is a
 * file. Both are exactly what a conductor in a hurry produces, and both read as "✓ done" to anything
 * that only calls existsSync. `count(text)` returns how many real entries the artifact holds.
 */
const countJsonArray = (key) => (text) => { try { const j = JSON.parse(text); return (Array.isArray(j) ? j : j?.[key] || []).length; } catch { return 0; } };
// A decision is a "## D<n> · …" heading. Numbered on purpose: they get cited by id from the review
// page and from later amendments (D1 → D1a), so an unnumbered paragraph is a note, not a decision.
const countDecisions = (text) => (text.match(/^#{2,3}\s*D\d+[a-z]?\s*[·:.\-–]/gim) || []).length;
// A design slice counts only when it could actually render an identity: a palette to emit and a
// non-empty rationale (the same objective floor design-verify.mjs enforces). `{"design":{}}` is the
// placeholder version of the failure this stage exists to block — bare Beacon shipping as "done".
const countDesign = (text) => {
  try { const d = JSON.parse(text)?.design; return d && d.palette && String(d.rationale || "").trim() ? 1 : 0; } catch { return 0; }
};
export const STAGES = {
  comprehensive: [
    { id: "domain", label: "Domain (kf-ba)", artifact: "domain.json" },
    { id: "architecture", label: "Architecture (kf-architect)", artifact: "architecture.json" },
    { id: "data-model", label: "Data model (kf-data-architect)", artifact: "data-model.json" },
    { id: "workflow", label: "Workflow (kf-workflow-designer)", artifact: "workflow.json" },
    { id: "security", label: "Security (kf-security-designer)", artifact: "security.json" },
    { id: "automations", label: "Automations (kf-integration-analyst) — ≥2", artifact: "automations.json",
      min: { n: 2, count: countJsonArray("automations") },
      note: "an app where nothing fires automatically is one where every handoff waits for a human to notice — skipped silently on the first comprehensive run because nothing checked for it" },
    { id: "decisions", label: "Decisions recorded — ≥2", artifact: "decisions.md",
      min: { n: 2, count: countDecisions },
      note: "every gap this pipeline closes without asking is a decision taken on the customer's behalf; unrecorded, it is indistinguishable from an oversight at sign-off" },
    { id: "spec", label: "Merged App-Spec", artifact: "app-spec.json" },
    { id: "gate", label: "Deterministic gate", gate: true },
    { id: "verify", label: "Engine verify", gate: true },
    { id: "verifier", label: "Adversarial verifier (kf-verifier)", gate: true,
      note: "the stage most often skipped and most expensive to skip — it BLOCKS on semantics a clean gate cannot see" },
    { id: "design", label: "Design language (kf-design-director)", artifact: "prototype/experience-spec.json",
      min: { n: 1, count: countDesign },
      note: "the design slice (accent, ramp, corner, type) on top of Beacon — mandated on the express path since 2026-08 but never gated here, so every comprehensive app shipped as bare Beacon and read as 'the old UI'" },
    { id: "experience", label: "Experience design (kf-experience-designer)", artifact: "prototype/experience-spec.json" },
    { id: "blueprint", label: "Blueprint rendered", artifact: "review.html", freshAgainst: "app-spec.json" },
    { id: "seed-data", label: "Seed authored", artifact: "seed.json" },
    { id: "prototype", label: "Prototype built + reviewable", gate: true, freshAgainst: "app-spec.json" },
    { id: "signoff", label: "Customer sign-off", gate: true,
      note: "a human gate — nothing may be created in the account before it" },
  ],
  // QUICK is a shorter pipeline, not a lesser app. Speed comes from fewer agent hops — never from
  // shipping an app where nothing fires on its own and nobody wrote down what was assumed. Express
  // decides instead of asking (CONDUCTOR "Turn 1 — EXPRESS by default"), which makes the decision log
  // the only record that a gap was closed deliberately rather than missed.
  quick: [
    { id: "spec", label: "App-Spec", artifact: "app-spec.json" },
    { id: "gate", label: "Deterministic gate", gate: true },
    // The design stage is NOT comprehensive-only: kf-design-director runs on every build, express
    // included (CONDUCTOR mandates it), and the first express run under the ledger showed why the
    // stage row must exist here too — the director's recorded decision floated outside every stage
    // group and the board could not say whether the look had been chosen yet.
    { id: "design", label: "Design language (kf-design-director)", artifact: "prototype/experience-spec.json",
      min: { n: 1, count: countDesign } },
    { id: "automations", label: "Automations — ≥2", artifact: "automations.json",
      min: { n: 2, count: countJsonArray("automations") },
      note: "at least two, and a notification counts: the deadline nobody is watching and the handoff nobody is told about are the two an express app always has" },
    { id: "decisions", label: "Decisions recorded — ≥2", artifact: "decisions.md",
      min: { n: 2, count: countDecisions },
      note: "express answers its own questions — those answers ARE the decisions, and they have to be readable by the customer who never got asked" },
    { id: "seed-data", label: "Seed authored", artifact: "seed.json" },
    { id: "prototype", label: "Prototype built + reviewable", gate: true },
  ],
};

/** Which stages must be complete before each irreversible action. */
export const GUARDS = {
  apply:  { comprehensive: ["spec", "gate", "verify", "verifier", "automations", "decisions", "design", "prototype", "signoff"],
            quick: ["spec", "gate", "automations", "decisions"] },
  deploy: { comprehensive: ["spec", "gate", "verify", "verifier", "design", "prototype", "signoff"], quick: ["spec", "gate", "design", "prototype"] },
  seed:   { comprehensive: ["spec", "gate", "verifier", "signoff"], quick: ["spec", "gate"] },
};

const statePath = (runDir) => join(runDir, "pipeline-state.json");

/**
 * Read the gate ledger. A MISSING file is a fresh run → {passed:{}}. A file that EXISTS but won't
 * parse is corruption, not emptiness: silently returning {passed:{}} would erase every recorded
 * verdict and re-open gates that had genuinely passed. Atomic writes (below) make corruption
 * near-impossible, but if it ever happens it must be LOUD and fail SAFE — we warn and return empty so
 * the guard refuses to advance rather than waving a build through on a state it can't actually read.
 */
export function readState(runDir) {
  let text;
  try { text = readFileSync(statePath(runDir), "utf8"); }
  catch { return { passed: {} }; }   // absent → fresh run
  try { return JSON.parse(text); }
  catch (e) { console.warn(`pipeline-state.json in ${runDir} is unreadable (${e.message}) — treating as no gates passed`); return { passed: {} }; }
}

// A sleep that works inside synchronous code (recordVerdict is sync so a gate can record inline without
// awaiting). Atomics.wait blocks the thread without burning CPU — used only to back off on lock contention.
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* SAB unavailable — skip the wait */ } }
// A verdict write holds the ledger lock for milliseconds; a lock older than this can only be a crashed
// writer, so it is safe to reclaim (see recordVerdict). Generous, so a merely-slow writer is never stolen.
const STALE_LOCK_MS = Number(process.env.KF_PIPELINE_STALE_LOCK_MS || 30_000);

// The inputs each deterministic gate READS, so a recorded PASS can be bound to the exact bytes it
// validated (Codex continuation #2). A CONTENT digest, not an mtime: a restored artifact gets a fresh
// mtime (see chat/app.mjs restoreRun) and would defeat a timestamp check — the same class of bug the
// freshness rule elsewhere had. When any of these inputs changes, the stage's PASS is no longer valid
// and the stage must re-run exactly as if it had never passed.
export const GATE_INPUTS = {
  gate:      ["app-spec.json"],
  verify:    ["app-spec.json"],
  verifier:  ["app-spec.json"],
  design:    ["prototype/experience-spec.json", "app-spec.json", "decisions.md"],
  // A prototype PASS is bound to the page it verified AND the specs it was built from (Codex #3). Without
  // this, a clean prototype could pass once and then index.html be replaced with broken/blank HTML while
  // `drive()` still reported "already PASS" and express deploy stayed clear.
  prototype: ["prototype/index.html", "prototype/experience-spec.json", "app-spec.json"],
  // Human sign-off is approval of a SPECIFIC build; any change to the reviewed artifacts invalidates it and
  // requires re-approval (Codex #6) — comprehensive must never deploy materially different output under an
  // approval given to an earlier version.
  signoff:   ["app-spec.json", "prototype/experience-spec.json", "prototype/index.html", "review.html"],
};
export function digestInputs(runDir, files) {
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel).update("\0");
    try { h.update(readFileSync(join(runDir, rel))); } catch { h.update("\0MISSING\0"); }
    h.update("\0");
  }
  return h.digest("hex");
}
/** A recorded PASS is fresh only while the inputs it validated are byte-for-byte unchanged (#2). A stage
 *  with no declared inputs (nothing to bind against) is always considered fresh — same as before. */
export function passIsFresh(runDir, stageId, entry) {
  const inputs = GATE_INPUTS[stageId];
  if (!inputs) return true;
  if (!entry || !entry.inputs) return false;   // a PASS recorded WITHOUT a digest predates this binding — re-run to be safe
  return entry.inputs === digestInputs(runDir, inputs);
}

/**
 * Record a gate's VERDICT. Stages write this; nothing infers it.
 *
 * Verdict, not a tick. The first cut recorded only "this stage ran", which meant a BLOCK verdict and
 * a PASS were indistinguishable to the guard — you could satisfy the chain with a gate that had just
 * told you not to proceed. A gate whose failure can be recorded as completion is not a gate.
 *
 * ATOMIC + CONCURRENCY-SAFE (#12). Gates can run in parallel and each records into the SAME ledger, so
 * a plain read-modify-write races: two finishers both read, both write, one verdict is lost. A crash
 * mid-write leaves a truncated file that readState then reads as "nothing passed". This now takes a
 * cross-process lock (atomic mkdir) around read-merge-write and writes via temp+rename (atomic on the
 * same filesystem), so a concurrent verdict is never dropped and the file is never seen half-written.
 */
export function recordVerdict(runDir, stageId, verdict = "PASS", detail = "") {
  const v = String(verdict).toUpperCase();
  if (!["PASS", "BLOCK"].includes(v)) throw new Error(`verdict must be PASS or BLOCK, got '${verdict}'`);
  const p = statePath(runDir);
  const lock = p + ".lock";
  let held = false;
  for (let i = 0; i < 50 && !held; i++) {          // ~ up to 50×20ms = 1s of contention tolerance
    try { mkdirSync(lock); held = true; }
    catch (e) { if (e.code !== "EEXIST") throw e; sleepSync(20); }
  }
  // STALE-LOCK RECOVERY (Codex #7). recordVerdict holds the lock for a few milliseconds, so a lock older
  // than STALE_LOCK_MS can only be a writer that was killed between mkdir(lock) and rmdir(lock). Runs live
  // on persistent storage, so without recovery that crash would block EVERY future verdict write for the
  // app forever — a permanent, manual-intervention outage. Reclaim a provably-stale lock once, then retry.
  if (!held) {
    try {
      const age = Date.now() - statSync(lock).mtimeMs;
      if (age > STALE_LOCK_MS) { rmdirSync(lock); mkdirSync(lock); held = true; console.warn(`pipeline lock ${lock} was stale (${Math.round(age / 1000)}s old) — reclaimed from a crashed writer`); }
    } catch { /* lost the reclaim race, or the lock vanished under us — fall through to the throw */ }
  }
  // NEVER write the ledger unlocked (Codex continuation #5). Before this, a timed-out acquisition fell
  // through and did an unlocked read-modify-write — a slow writer or a stale lock silently turned the
  // concurrency-safe ledger back into last-writer-wins, dropping another stage's verdict. Fail loudly
  // instead when the lock is genuinely held by a LIVE writer (not yet stale).
  if (!held) throw new Error(`pipeline lock ${lock} not acquired after ~1s — refusing to write '${stageId}' verdict unlocked (a live writer holds it; it will free within milliseconds)`);
  try {
    const s = readState(runDir);                   // re-read INSIDE the lock — never merge onto a stale copy
    s.passed = s.passed || {};
    const entry = { verdict: v, at: new Date().toISOString(), detail };
    // Bind a PASS to the exact inputs it validated (#2), so replacing the spec after a pass invalidates it.
    if (GATE_INPUTS[stageId]) entry.inputs = digestInputs(runDir, GATE_INPUTS[stageId]);
    s.passed[stageId] = entry;
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n");
    renameSync(tmp, p);                            // atomic swap — a reader sees the old file or the new, never a partial
    return s;
  } finally {
    if (held) { try { rmdirSync(lock); } catch { /* best-effort unlock */ } }
  }
}
export const recordPass = (runDir, stageId, detail = "") => recordVerdict(runDir, stageId, "PASS", detail);

/** A gate counts as satisfied only on an explicit PASS. Absent = not run; BLOCK = ran and said no. */
const verdictOf = (state, id) => {
  const e = state.passed?.[id];
  if (!e) return null;
  return e.verdict || "PASS"; // entries written before verdicts existed were only ever recorded on pass
};

export function status(runDir, mode = "comprehensive") {
  const state = readState(runDir);
  return (STAGES[mode] || STAGES.comprehensive).map((st) => {
    // Read the verdict for EVERY stage, not only gate-flagged ones (Codex continuation #1). `design` runs
    // a real verifier (GATE_RUNNERS.design) but is modelled as an artifact stage, so a recorded BLOCK was
    // being discarded and file-existence alone marked it done — a design the verifier REJECTED could ship.
    const verdict = verdictOf(state, st.id);
    let done = st.gate ? verdict === "PASS" : existsSync(join(runDir, st.artifact));
    // A recorded BLOCK is never "done", for a gate OR an artifact stage that also carries a verifier.
    if (verdict === "BLOCK") done = false;
    // A PASS is valid only against the inputs it validated (#2), AND only while every one of those inputs
    // actually EXISTS (Codex #3). Missing inputs hash to a stable MISSING sentinel, so without the presence
    // check a sign-off could be recorded — and stay "fresh" — with no review.html at all, clearing deploy
    // with nothing for the customer to review. If an input is absent, or the bytes changed since the pass,
    // the stage is not done and must re-run. (The mtime `freshAgainst` check below misses both.)
    let staleInputs = false;
    if (done && verdict === "PASS" && GATE_INPUTS[st.id]) {
      const inputsPresent = GATE_INPUTS[st.id].every((rel) => existsSync(join(runDir, rel)));
      if (!inputsPresent || !passIsFresh(runDir, st.id, state.passed?.[st.id])) { done = false; staleInputs = true; }
    }
    // CONTENT FLOOR. An artifact that exists but is empty is the failure mode this whole module was
    // written against, one level down: not "the stage was skipped" but "the stage was satisfied with
    // a placeholder". `{"automations": []}` passes existsSync and ships an app where every handoff
    // waits for a human to notice.
    let have = null;
    if (done && st.min) {
      try { have = st.min.count(readFileSync(join(runDir, st.artifact), "utf8")); } catch { have = 0; }
      if (have < st.min.n) done = false;
    }
    // FRESHNESS. Existing is not enough: an artifact OLDER than the spec it describes is stale, and a
    // stale sign-off artifact is worse than a missing one — a customer reads a data model that no
    // longer exists and approves it. The banking blueprint sat an hour behind app-spec.json and
    // nothing would have said so; it was only caught because a human asked (2026-08-02).
    let stale = staleInputs;
    if (done && st.freshAgainst) {
      const src = join(runDir, st.freshAgainst);
      const mine = st.gate ? Date.parse(state.passed?.[st.id]?.at || 0) : (existsSync(join(runDir, st.artifact)) ? statSync(join(runDir, st.artifact)).mtimeMs : 0);
      if (existsSync(src) && statSync(src).mtimeMs > mine) { stale = true; done = false; }
    }
    const short = st.min && have != null && have < st.min.n ? { have, need: st.min.n } : null;
    return { ...st, done, stale, short, verdict, at: state.passed?.[st.id]?.at || null };
  });
}

/** What is missing before `action` may run. Empty array = clear to proceed. */
export function missingFor(runDir, action, mode = "comprehensive") {
  const need = GUARDS[action]?.[mode] || [];
  const byId = new Map(status(runDir, mode).map((s) => [s.id, s]));
  return need.filter((id) => !byId.get(id)?.done).map((id) => byId.get(id) || { id, label: id });
}

/** Gates that ran and returned BLOCK — distinct from "not yet run", and never satisfiable by waiting. */
export function blockedIn(runDir, mode = "comprehensive") {
  return status(runDir, mode).filter((s) => s.verdict === "BLOCK");
}

if (process.argv[1] && process.argv[1].endsWith("pipeline.mjs")) {
  const [cmd, runDir] = process.argv.slice(2);
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const mode = flag("--mode") || "comprehensive";
  if (!cmd || !runDir) {
    console.error("usage: pipeline.mjs status <runDir> [--mode quick|comprehensive]");
    console.error("       pipeline.mjs require <runDir> --before apply|deploy|seed [--mode …]");
    console.error("       pipeline.mjs pass <runDir> --stage <id> [--detail \"…\"]");
    process.exit(2);
  }

  if (cmd === "pass") {
    const stage = flag("--stage");
    if (!stage) { console.error("pass: --stage <id> is required"); process.exit(2); }
    const verdict = (flag("--verdict") || "PASS").toUpperCase();
    recordVerdict(runDir, stage, verdict, flag("--detail") || "");
    console.log(`${verdict === "BLOCK" ? "✗" : "✓"} recorded ${stage} = ${verdict}`);
    process.exit(0);
  }

  if (cmd === "status") {
    const rows = status(runDir, mode);
    console.log(`\nPIPELINE · ${mode} · ${runDir}\n`);
    for (const r of rows) {
      const mark = r.done ? "✓" : r.stale ? "⟳" : r.short ? "◐" : r.verdict === "BLOCK" ? "✗" : "·";
      const state = r.stale ? "  STALE" : r.short ? `  ${r.short.have}/${r.short.need}` : r.verdict === "BLOCK" ? "  BLOCKED" : r.done && r.at ? `  (${r.at.slice(0, 16).replace("T", " ")})` : "";
      console.log(`  ${mark} ${r.label}${state}`);
      if (r.stale) console.log(`      older than ${r.freshAgainst} — it describes a spec that has since changed; regenerate it`);
      else if (r.short) console.log(`      ${r.artifact} exists but holds ${r.short.have} — the floor is ${r.short.need}. ${r.note || ""}`);
      else if (r.verdict === "BLOCK") console.log(`      this gate RAN and said no — its findings must be fixed and the gate re-run`);
      else if (!r.done && r.note) console.log(`      ${r.note}`);
    }
    const left = rows.filter((r) => !r.done);
    console.log(`\n${left.length ? `${left.length} stage(s) outstanding: ${left.map((r) => r.id).join(", ")}` : "all stages complete"}\n`);
    process.exit(0);
  }

  if (cmd === "require") {
    const action = flag("--before");
    if (!action || !GUARDS[action]) { console.error(`require: --before must be one of ${Object.keys(GUARDS).join("|")}`); process.exit(2); }
    const missing = missingFor(runDir, action, mode);
    if (!missing.length) { console.log(`✓ clear to ${action} — every required stage is complete`); process.exit(0); }
    console.error(`\n✗ REFUSING to ${action}: ${missing.length} required stage(s) not complete\n`);
    for (const m of missing) {
      console.error(`  ${m.verdict === "BLOCK" ? "✗" : m.short ? "◐" : "·"} ${m.label}${m.verdict === "BLOCK" ? "  — RAN AND BLOCKED" : m.short ? `  — only ${m.short.have} of ${m.short.need}` : ""}`);
      if (m.verdict === "BLOCK") console.error(`      fix its findings and re-run the gate; waiting will not clear this`);
      else if (m.short) console.error(`      ${m.artifact} exists but holds ${m.short.have}. ${m.note || ""}`);
      else if (m.note) console.error(`      ${m.note}`);
    }
    console.error(`\n${action === "apply" || action === "seed"
      ? "This creates records in a real Kissflow account, and a published process cannot be deleted."
      : "This publishes a bundle to a real Kissflow account."} Complete the stages above, or pass --force if you own the consequences.\n`);
    process.exit(1);
  }

  console.error(`unknown command '${cmd}'`);
  process.exit(2);
}
