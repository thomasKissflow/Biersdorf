// orchestrator.mjs — ONE executable definition of "what a build is", shared by the CLI and the chat
// conductor. It fixes the two structural findings the reviewers kept hitting:
//
//   #8  CLI ≠ AI Builder one pipeline. Orchestration lived as prose in CONDUCTOR.md, 27 command
//       files, and agent briefs, with pipeline.mjs as an advisory checker off to the side. Nothing
//       forced the paths to agree, so express/comprehensive/chat drifted. The fix is not another
//       document — it is a state machine: BuildRequest → plan(stages,gates) → drive. Slash commands
//       and chat translate input into a BuildRequest and call this; they stop DESCRIBING the flow.
//
//   #9  Gates were not wired to the commands that ran them. `cli gate`/`verify` RAN the checks but
//       never recorded a verdict, so the guard blocked legitimate workflows until someone found the
//       undocumented `pipeline pass`. Here, running a gate and recording its PASS/BLOCK is ONE atomic
//       act (runGate) — a gate you can run without recording its verdict does not exist.
//
// EXPRESS AND COMPREHENSIVE ARE DIFFERENT STRATEGIES — NOT ONE PLAN AT TWO SPEEDS.
//
// Express is optimized for TIME, responsiveness and rapid feedback; Comprehensive for COVERAGE, depth
// and accuracy. They are deliberately allowed to differ in the things that trade speed against rigour:
//   · which STAGES run and how many (STAGES.quick is a shorter list than STAGES.comprehensive)
//   · how many AGENT CALLS fill a stage (express: one decide-don't-ask planner pass; comprehensive:
//     specialist waves)
//   · REVIEW DEPTH and GATES (comprehensive runs the adversarial verifier and a human sign-off before
//     apply; express answers its own questions and does not pause — GUARDS.*.quick vs .comprehensive)
// So this module does NOT claim the two hit the same stages or the same gates. `mode` selects a whole
// strategy, plan and gate-set included.
//
// What they DO share — the INVARIANTS neither mode may break, regardless of speed:
//   · the platform interfaces (BuildRequest in, the same engine IR / builders / applyIR out)
//   · the deterministic builders (builders.mjs, lower.mjs) — same metadata for the same IR
//   · the design guidelines (one canonical design system; both modes render through it)
//   · the security boundaries (membership, prod-first, .kf-env inertness, artifact containment)
//   · the artifact formats (app-spec.json, prototype, review, id-map) and pipeline-state ledger
//   · truthful error handling — a failed step is reported as failed in both modes
// Gates, WHERE a mode runs them, are deterministic function calls (microseconds), not agent
// round-trips, so recording their verdicts costs express nothing — it only makes "did design run? did
// the gate pass?" answerable by machine instead of by trust.
//
// EXPRESS STREAMING GUARANTEE (#9). Express additionally MUST stream progress continuously: publish the
// first VALID prototype shell as early as possible and assemble each page fragment INTO that existing
// prototype as the build continues, rather than withholding everything until a final render. This is a
// property of the express DRIVER, not a pipeline stage: the prototype protocol emits a shell first,
// then one part per role, and the chat host re-assembles the prototype (`proto-assemble --partial`)
// every time a part lands — so the preview fills as the build runs. That mechanism (host-side assemble
// on part-landing) is enforced by chat/test/stream-prototype.test.mjs and asserted for express in
// engine/test/streaming-guarantee.test.mjs. Comprehensive makes no such continuous-streaming promise —
// it optimizes for a complete, verified result over early partial visibility.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateIR, checkCoherenceIR, checkGateIR, checkAppFloor, loadRunSpec } from "./ir.mjs";
import { errors as irErrors } from "./validators.mjs";
import { STAGES, GUARDS, recordVerdict, readState, status, missingFor, passIsFresh } from "./pipeline.mjs";

// ── BuildRequest — the one input shape both entry points construct ────────────────────────────────
// mode:     "express" (default; one-pass strategy, decide-don't-ask, minimal review) | "comprehensive"
// renderer: how the reviewed design is lowered to a real surface — the SAME experience, different tech
// review:   "auto" (express: no human pause) | "pause" (comprehensive: sign-off gate before apply)
export const RENDERERS = ["native-ai", "native-template", "custom-react", "prototype"];
export function buildRequest(input = {}) {
  const mode = input.mode === "comprehensive" ? "comprehensive" : (input.mode === "express" || input.mode === "quick") ? "quick" : "quick";
  const renderer = RENDERERS.includes(input.renderer) ? input.renderer : "native-ai";
  const review = input.review === "pause" || mode === "comprehensive" ? "pause" : "auto";
  return { runDir: input.runDir, requirement: input.requirement || null, mode, renderer, review };
}

// ── GATE RUNNERS — the deterministic checks the orchestrator can run ITSELF (no agent). Each returns
// { pass:boolean, detail:string }. The AGENT gates (adversarial verifier) and HUMAN gates (sign-off)
// are not here: the orchestrator cannot fabricate their verdict, so it reports them as "needs agent /
// needs human" and refuses to auto-pass them. ─────────────────────────────────────────────────────
const specOf = (runDir) => {
  const p = join(runDir, "app-spec.json");
  if (!existsSync(p)) return null;
  // loadRunSpec folds in the sibling automations.json (the assembly step the conductor's separate files
  // otherwise skip), so the gate's automation checks + AUTOMATIONS_MISSING floor see what the run authored.
  try { return loadRunSpec(p); } catch { return null; }
};
export const GATE_RUNNERS = {
  gate(runDir) {
    const ir = specOf(runDir); if (!ir) return { pass: false, detail: "no app-spec.json" };
    const issues = [...validateIR(ir).issues, ...checkCoherenceIR(ir), ...checkGateIR(ir), ...checkAppFloor(ir)];
    const blockers = irErrors(issues);
    return { pass: blockers.length === 0, detail: blockers.length ? `${blockers.length} structural blocker(s): ${blockers.slice(0, 3).map((b) => b.code).join(", ")}` : "structure ok" };
  },
  verify(runDir) {
    const ir = specOf(runDir); if (!ir) return { pass: false, detail: "no app-spec.json" };
    const issues = [...validateIR(ir).issues, ...checkCoherenceIR(ir)];
    const blockers = irErrors(issues);
    return { pass: blockers.length === 0, detail: blockers.length ? `${blockers.length} error(s)` : "valid + coherent" };
  },
  async prototype(runDir) {
    const idx = join(runDir, "prototype", "index.html");
    if (!existsSync(idx)) return { pass: false, detail: "no prototype/index.html" };
    const { verify } = await import("./proto-verify.mjs");
    const r = verify(readFileSync(idx, "utf8"));
    const errs = (r.findings || []).filter((f) => f.level === "error");
    return { pass: errs.length === 0, detail: errs.length ? `${errs.length} proto-verify error(s)` : `${r.roles || 0} roles clean` };
  },
  async design(runDir) {
    const spec = join(runDir, "prototype", "experience-spec.json");
    if (!existsSync(spec)) return { pass: false, detail: "no experience-spec.json" };
    const { verifyDesign } = await import("./design-verify.mjs");
    const r = verifyDesign(JSON.parse(readFileSync(spec, "utf8")), { decisionsPath: join(runDir, "decisions.md") });
    return { pass: r.pass, detail: r.pass ? "design slice recorded + rationale" : (r.findings.find((f) => f.level === "error")?.msg || "design not recorded") };
  },
};
// Which gates need something the orchestrator cannot produce on its own.
export const AGENT_GATES = { verifier: "adversarial verifier (kf-verifier)" };
export const HUMAN_GATES = { signoff: "customer sign-off" };

/**
 * Run a gate AND record its verdict — atomically, as one act (#9). There is no path that runs the
 * check without writing the verdict, so a passed workflow can never be blocked for a missing verdict,
 * and a BLOCK can never masquerade as done. Returns { pass, detail, recorded:true }.
 */
export async function runGate(runDir, stageId) {
  const runner = GATE_RUNNERS[stageId];
  if (!runner) throw new Error(`runGate: '${stageId}' is not a deterministic gate (agent/human gate: ${AGENT_GATES[stageId] || HUMAN_GATES[stageId] || "unknown"})`);
  const { pass, detail } = await runner(runDir);
  recordVerdict(runDir, stageId, pass ? "PASS" : "BLOCK", detail);
  return { pass, detail, recorded: true };
}

/**
 * Drive the strategy: RUN every stage the orchestrator can run itself, and for the rest say exactly
 * what has to happen and by whom. This is an executable runner, not an advisory checker (#7):
 *
 *   · a stage with a deterministic GATE_RUNNER (gate, verify, prototype, AND design — a verifier that
 *     the old drive skipped because `design` is not flagged gate:true) is RUN, and its verdict recorded
 *     atomically. Idempotent: a stage already PASSed is not re-run.
 *   · an AGENT gate (adversarial verifier) or HUMAN gate (sign-off) is reported pending with the actor
 *     that must produce it — the orchestrator cannot fabricate their verdict and never auto-passes them.
 *   · an ARTIFACT stage the specialist agents/conductor produce (domain, spec, seed, …) is reported
 *     present/absent, so the caller sees the WHOLE strategy and what is left to author — not just gates.
 *
 * The engine layer cannot spawn agents (that is the chat conductor's job), so drive runs the machine
 * half and hands back an actionable plan; it is what a caller loops on to actually complete a build.
 */
export async function drive(request) {
  const req = buildRequest(request);
  const plan = STAGES[req.mode] || STAGES.comprehensive;
  const ran = [];
  for (const st of plan) {
    if (GATE_RUNNERS[st.id]) {
      // RUN it — gate-flagged or not. `design` reaches here now: it carries a deterministic verifier
      // (GATE_RUNNERS.design) but is an artifact stage in the plan, so the old `if (!st.gate) continue`
      // meant the design slice's quality was never actually checked in the drive path.
      const prior = readState(req.runDir).passed?.[st.id];
      // Reuse a prior PASS ONLY while it is still bound to the current inputs (Codex continuation #2).
      // Before this, replacing app-spec.json after a green gate left `drive()` returning "already PASS"
      // and the express apply/deploy guard clear — a stale ledger waving a changed spec straight through.
      if (prior?.verdict === "PASS" && passIsFresh(req.runDir, st.id, prior)) { ran.push({ id: st.id, pass: true, detail: prior.detail, skipped: "already PASS" }); continue; }
      const r = await runGate(req.runDir, st.id);
      ran.push({ id: st.id, ...r });
    } else if (AGENT_GATES[st.id]) {
      ran.push({ id: st.id, pass: null, pending: "needs agent", next: AGENT_GATES[st.id] });
    } else if (HUMAN_GATES[st.id]) {
      ran.push({ id: st.id, pass: null, pending: "needs human", next: HUMAN_GATES[st.id] });
    } else if (st.gate) {
      ran.push({ id: st.id, pass: null, pending: "needs run" });   // a gate with no runner wired yet
    } else {
      // an artifact stage — drive can't author it, but it reports whether it's there so the plan is whole
      const present = st.artifact ? existsSync(join(req.runDir, st.artifact)) : false;
      ran.push({ id: st.id, pass: null, artifact: st.artifact || null, present, pending: present ? null : "needs artifact" });
    }
  }
  return { request: req, ran, status: status(req.runDir, req.mode) };
}

/** The stage plan for a request — the CONTRACT, so a caller can see the whole flow before running it. */
export function plan(request) {
  const req = buildRequest(request);
  return { request: req, stages: (STAGES[req.mode] || STAGES.comprehensive).map((s) => ({ id: s.id, label: s.label, gate: !!s.gate, kind: s.gate ? (GATE_RUNNERS[s.id] ? "deterministic" : AGENT_GATES[s.id] ? "agent" : HUMAN_GATES[s.id] ? "human" : "gate") : "artifact" })) };
}

/** Is `action` (apply/deploy/seed) clear to run? Same guard as pipeline, surfaced through the one API. */
export function clearFor(request, action) {
  const req = buildRequest(request);
  const missing = missingFor(req.runDir, action, req.mode);
  return { clear: missing.length === 0, missing, guard: (GUARDS[action] || {})[req.mode] || [] };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const [cmd, runDir, ...rest] = process.argv.slice(2);
  const flag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
  const req = { runDir, mode: flag("--mode", "quick"), renderer: flag("--renderer"), review: flag("--review") };
  if (!runDir || !["plan", "drive", "gate", "clear"].includes(cmd)) {
    console.error("usage: orchestrator.mjs plan|drive|clear <runDir> [--mode quick|comprehensive] [--renderer …]\n       orchestrator.mjs gate <runDir> <stageId>   (run one gate + record its verdict)");
    process.exit(2);
  }
  if (cmd === "gate") {
    const r = await runGate(runDir, rest[0]);
    console.log(`${r.pass ? "✅ PASS" : "❌ BLOCK"} [${rest[0]}] — ${r.detail} (verdict recorded)`);
    process.exit(r.pass ? 0 : 1);
  } else if (cmd === "plan") {
    const p = plan(req);
    console.log(`PLAN · ${p.request.mode} · renderer ${p.request.renderer} · review ${p.request.review}\n`);
    for (const s of p.stages) console.log(`  ${s.gate ? "◆" : "·"} ${s.label}  [${s.kind}]`);
    process.exit(0);
  } else if (cmd === "drive") {
    const d = await drive(req);
    console.log(`DRIVE · ${d.request.mode} · ${runDir}\n`);
    for (const r of d.ran) console.log(`  ${r.pass === true ? "✅" : r.pass === false ? "❌" : "·"} ${r.id}${r.skipped ? " (skip: " + r.skipped + ")" : r.pending ? " (" + r.pending + ")" : ""} — ${r.detail || ""}`);
    process.exit(d.ran.some((r) => r.pass === false) ? 1 : 0);
  } else if (cmd === "clear") {
    const c = clearFor(req, rest[0] || "apply");
    console.log(c.clear ? `✅ clear to ${rest[0] || "apply"}` : `❌ blocked — missing: ${c.missing.map((m) => m.id || m).join(", ")}`);
    process.exit(c.clear ? 0 : 1);
  }
}
