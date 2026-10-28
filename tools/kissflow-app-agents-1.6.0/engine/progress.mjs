#!/usr/bin/env node
// progress.mjs — one agent-wise ledger of a build, readable by a person, from BOTH surfaces.
//
// THE GAP. During a build the CLI shows raw Task spawns and the AI Builder chat shows narration —
// but neither can answer "which agents ran, which is running NOW, how long, at what cost" from one
// place, and nothing durable records it. agent-stats.jsonl only appears when an orchestrator
// remembers to write it (grep the tree: nothing writes it), and <<KF:status>> has no required
// cadence — the measured complaint in the chat host is a pane that said "reading your requirement…"
// for 8m22s of real work.
//
// So: every stage transition is ONE appended line in runs/<slug>/progress.jsonl —
//
//   { at, agent, stage, ev: "start"|"done"|"fail"|"note", detail?, tokens?, tools?, ms? }
//
// and this module renders the ledger + the pipeline's own artifact truth as one board:
//
//   ✓ Domain (kf-ba)            31,952 tok · 17 tools · 2m18s
//   ● Data model (kf-data-architect)   running · 1m04s
//   · Workflow (kf-workflow-designer)  waiting
//
// Consumers: `node engine/progress.mjs board <runDir>` (CLI, --watch to live-update), and the chat
// host watches progress.jsonl like it already watches parts/ and review.html, forwarding rows to
// the AI Builder pane. The ledger is APPEND-ONLY and every reader tolerates a torn last line.
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { STAGES, status as pipelineStatus } from "./pipeline.mjs";

export const FILE = "progress.jsonl";

// ── the human layer ──────────────────────────────────────────────────────────────────────────────
// Progress is read by the person PAYING for the build, not by the pipeline's author. So every agent
// has a plain-language identity and every transition renders as a sentence — no slugs, no "IR", no
// "gate", no token counts unless a technical reader asks (--tech). The slug still rides in the
// ledger row for machines; the words are what people see in the CLI and in the AI Builder chat.
export const PERSONAS = {
  "kf-ba":                  { who: "Business Analyst",   doing: "reading your brief — noting who's involved and what each person needs to get done",
                              did: "mapped the business: the people, their goals, and the rules to respect" },
  "kf-architect":           { who: "Solution Architect", doing: "deciding how the app fits together — what becomes a form, a workflow, a tracker",
                              did: "settled the shape of the app and how the pieces connect" },
  "kf-data-architect":      { who: "Data Designer",      doing: "designing the records — every field, dropdown and link between them",
                              did: "finished the records: fields, options and how they reference each other" },
  "kf-workflow-designer":   { who: "Workflow Designer",  doing: "drawing the approval and hand-off steps — who acts, in what order",
                              did: "finished the workflows: each step, who owns it, and where it goes next" },
  "kf-security-designer":   { who: "Access Designer",    doing: "working out who may see and change what, at every step",
                              did: "set the permissions: each role sees exactly what it should" },
  "kf-integration-analyst": { who: "Automation Analyst", doing: "finding the moments one flow should update another automatically",
                              did: "wired the automations — the hand-offs nobody should have to do by hand" },
  "kf-verifier":            { who: "Reviewer",           doing: "trying to break the design — dead ends, lockouts, unreachable steps",
                              did: "reviewed the design end to end" },
  "kf-coherence-critic":    { who: "Reviewer",           doing: "walking every person's journey to make sure it hangs together",
                              did: "confirmed each person can complete their journey" },
  "kf-experience-designer": { who: "Experience Designer",doing: "laying out each person's home page, navigation and dashboards",
                              did: "designed every role's screens and navigation" },
  "kf-ux-architect":        { who: "Product Designer",   doing: "researching how the best products in this domain look and behave",
                              did: "chose the look and the page layouts, grounded in real products" },
  "kf-prototype-builder":   { who: "Prototype Builder",  doing: "building the clickable preview — every page, with realistic sample data",
                              did: "built the clickable preview" },
  "kf-seed":                { who: "Data Loader",        doing: "filling the app with realistic sample records",
                              did: "loaded the sample data" },
  "kf-runtime-qa":          { who: "Tester",             doing: "clicking through the real app, role by role, checking everything works",
                              did: "tested the app across every role" },
  "page-builder":           { who: "Page Builder",     doing: "building this role's pages",
                              did: "finished this role's pages" },
  "kf-acceptance":          { who: "Tester",             doing: "running each person's tasks start to finish in a sandbox",
                              did: "proved each journey works start to finish" },
};
export const personaOf = (agent) => PERSONAS[agent] || { who: agent || "The team", doing: "working", did: "finished a step" };

// Stage labels for people. Falls back to stripping the parenthesised slug from the pipeline label.
const HUMAN_STAGE = {
  domain: "Understanding your business", architecture: "Shaping the app", "data-model": "Designing the records",
  workflow: "Designing the workflows", security: "Setting who sees what", automations: "Wiring the automations",
  decisions: "Writing down the decisions taken", spec: "Assembling the full plan", gate: "Checking the plan",
  // not a duplicate of gate — the board showed "Checking the plan" twice and a reader can't tell
  // which line moved. Different words for genuinely different checks.
  verify: "Double-checking every detail", verifier: "Independent review", design: "Choosing the look and feel",
  experience: "Designing the screens",
  blueprint: "Preparing your review page", "seed-data": "Preparing sample data", prototype: "Building the clickable preview",
  signoff: "Waiting for your go-ahead",
};
const humanStage = (st) => HUMAN_STAGE[st.id] || st.label.replace(/\s*\([^)]*\)/, "");

/** Append one event. Never throws — progress must never cost a build. */
export function mark(runDir, entry) {
  try {
    const row = { at: new Date().toISOString(), ...entry };
    mkdirSync(runDir, { recursive: true });
    appendFileSync(join(runDir, FILE), JSON.stringify(row) + "\n");
    // Keep the historical agent-stats shape alive on completions that carry numbers — runs before
    // this module exist only in that format, and the benchmark reads both.
    if (row.ev === "done" && row.tokens != null) {
      appendFileSync(join(runDir, "agent-stats.jsonl"),
        JSON.stringify({ stage: row.stage || row.agent, tokens: row.tokens, tool_uses: row.tools ?? null, ms: row.ms ?? null }) + "\n");
    }
    return row;
  } catch { return null; }
}

export function readLedger(runDir) {
  const rows = [];
  try {
    for (const line of readFileSync(join(runDir, FILE), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* torn tail line — a writer mid-append */ }
    }
  } catch { /* no ledger yet */ }
  return rows;
}

const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);
const fmtMs = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${s}s`; };

/**
 * The merged board: pipeline stages (artifact truth — did the file land, is it stale) enriched with
 * the ledger (who ran it, how long, how many tokens), plus any agents running right now that no
 * stage claims (page-builder fan-out). Returns { rows, text, running, totals }.
 */
export function board(runDir, mode = "auto", opts = {}) {
  // "auto" resolves the PIPELINE the run is actually on. The chat host streams this board for every
  // session and cannot know the mode up front (express is the default; comprehensive is chosen at
  // intake) — and a hardcoded default meant every express session's tree opened with comprehensive's
  // stage list, a wall of "waiting" rows for stages express never runs. The comprehensive-only
  // specialist artifacts are the honest tell: any one of them present means the full pipeline.
  if (mode === "auto") {
    const tells = ["domain.json", "architecture.json", "data-model.json", "workflow.json", "security.json"];
    mode = tells.some((t) => existsSync(join(runDir, t))) ? "comprehensive" : "quick";
  }
  const ledger = readLedger(runDir);
  const byStage = new Map();       // stage → { start?, done? } latest events win
  const open = new Map();          // run instance → start row, closed by done/fail
  const runsOf = new Map();        // stage → Map(instanceKey → run {agent,id,parent,state,ms,detail,tokens})
  const keyOf = (r) => `${r.agent || "?"}#${r.stage || ""}#${r.id || ""}`;
  const now0 = Date.now();
  for (const r of ledger) {
    const key = keyOf(r);
    if (r.ev === "start") {
      open.set(key, r);
      if (r.stage) {
        // stage attribution comes from PARENTLESS runs only — a sub-agent starting (or finishing,
        // below) is progress INSIDE the stage, not the stage itself; the first tree render showed
        // "✓ Building the clickable preview — page-builder finished" over a parent still running.
        if (!r.parent) byStage.set(r.stage, { ...(byStage.get(r.stage) || {}), start: r });
        const m = runsOf.get(r.stage) || runsOf.set(r.stage, new Map()).get(r.stage);
        m.set(key, { agent: r.agent, id: r.id || null, parent: r.parent || null, state: "running", startedAt: r.at, detail: r.detail || null });
      }
    }
    if (r.ev === "done" || r.ev === "fail") {
      open.delete(key);
      if (r.stage) {
        if (!r.parent) byStage.set(r.stage, { ...(byStage.get(r.stage) || {}), done: r });
        const m = runsOf.get(r.stage) || runsOf.set(r.stage, new Map()).get(r.stage);
        const run = m.get(key) || { agent: r.agent, id: r.id || null, parent: r.parent || null };
        m.set(key, { ...run, state: r.ev === "fail" ? "fail" : "done", ms: r.ms ?? (run.startedAt ? Date.parse(r.at) - Date.parse(run.startedAt) : null), tokens: r.tokens ?? null, detail: r.detail || run.detail || null });
      }
    }
  }
  for (const [k, r] of open) { const m = runsOf.get(r.stage); const run = m?.get(k); if (run && run.state === "running") run.ms = now0 - Date.parse(run.startedAt); }
  const stages = (() => { try { return pipelineStatus(runDir, mode); } catch { return (STAGES[mode] || []).map((s) => ({ ...s, done: false })); } })();
  const now = Date.now();
  const rows = stages.map((st) => {
    const led = byStage.get(st.id) || {};
    // an OPEN top-level run keeps the stage RUNNING even if an earlier run finished — the fan-out
    // showed "✓ done" over eight live builders because the research run's done won the headline
    const hasOpenTop = [...(runsOf.get(st.id)?.values() || [])].some((r) => !r.parent && r.state === "running");
    const running = hasOpenTop || (led.start && !led.done);
    const state = led.done?.ev === "fail" ? "fail" : running ? "running" : (st.done || led.done?.ev === "done") ? "done" : st.stale ? "stale" : "pending";
    // THE TREE. Every run instance of this stage, parents first, its sub-agents nested under it —
    // parallel page builders and their helpers render as a family, not a flat mystery.
    const all = [...(runsOf.get(st.id)?.values() || [])];
    const tops = all.filter((r) => !r.parent);
    const kidsOf = (agent) => all.filter((r) => r.parent === agent);
    const runs = tops.map((r) => ({ ...r, children: kidsOf(r.agent) }));
    return {
      id: st.id, label: st.label, state, runs,
      agent: led.done?.agent || led.start?.agent || null,
      tokens: led.done?.tokens ?? null, tools: led.done?.tools ?? null,
      ms: led.done?.ms ?? (running ? now - Date.parse(led.start.at) : null),
      detail: led.done?.detail || led.start?.detail || null,
    };
  });
  // fan-out agents (several at once, no stage of their own) — page builders, verify passes
  const running = [...open.values()].filter((r) => !r.stage || !rows.some((x) => x.id === r.stage))
    .map((r) => ({ agent: r.agent, detail: r.detail || null, ms: now - Date.parse(r.at) }));
  const totals = ledger.filter((r) => r.ev === "done" && (r.tokens || r.usd)).reduce(
    (t, r) => ({ tokens: t.tokens + (r.tokens || 0), agents: t.agents + 1, ms: t.ms + (r.ms || 0), usd: t.usd + (r.usd || 0) }),
    { tokens: 0, agents: 0, ms: 0, usd: 0 });
  // turn-level cost rows (the host writes one per finished round) count toward money, not agents
  for (const r of ledger) if (r.ev === "note" && r.usd) totals.usd += r.usd;

  const ICON = { done: "✓", running: "●", fail: "✗", stale: "↻", pending: "·" };
  const tech = !!opts.tech;
  // one nested line per run instance — only when a stage has MORE than a single plain run, so the
  // common case stays one line and fan-out opens into a tree
  const runLines = (r) => {
    if (!r.runs || r.runs.length === 0 || (r.runs.length === 1 && !r.runs[0].children.length && !r.runs[0].id)) return [];
    const one = (run, depth) => {
      const p = personaOf(run.agent);
      const nm = tech ? (run.agent + (run.id ? `[${run.id}]` : "")) : (p.who + (run.id ? ` — ${run.id}` : ""));
      const tail = run.state === "done" ? `done${run.ms ? ` (${fmtMs(run.ms)})` : ""}${tech && run.tokens ? ` · ${fmtTok(run.tokens)} tok` : ""}`
        : run.state === "fail" ? `needs attention${run.detail ? ` — ${run.detail}` : ""}`
        : `${tech ? "running" : (run.detail || p.doing)} · ${fmtMs(run.ms || 0)}`;
      return [`  ${"   ".repeat(depth + 1)}${ICON[run.state]} ${nm} — ${tail}`,
              ...(run.children || []).map((c) => one(c, depth + 1)).flat()];
    };
    return r.runs.map((run) => one(run, 0)).flat();
  };
  const line = (r) => {
    const p = personaOf(r.agent);
    const label = tech ? r.label : humanStage(r);
    const tail =
      r.state === "done" ? (tech && r.tokens ? `${fmtTok(r.tokens).padStart(7)} tok${r.tools ? ` · ${r.tools} tools` : ""}${r.ms ? ` · ${fmtMs(r.ms)}` : ""}`
                                             : `done${r.agent ? ` — ${p.who} ${p.did}` : ""}${r.ms ? ` (${fmtMs(r.ms)})` : ""}`) :
      r.state === "running" ? (tech ? `running${r.agent ? ` (${r.agent})` : ""} · ${fmtMs(r.ms || 0)}`
                                    : `${p.who} is ${r.detail || p.doing} · ${fmtMs(r.ms || 0)}`) :
      r.state === "fail" ? `needs attention${r.detail ? ` — ${r.detail}` : ""}` :
      r.state === "stale" ? (tech ? "stale — input changed, will re-run" : "will be refreshed — the plan changed") : "waiting";
    return `  ${ICON[r.state]} ${label.padEnd(tech ? 44 : 36)} ${tail}`;
  };
  const text = [
    ...rows.map((r) => [line(r), ...runLines(r)].join("\n")),
    ...running.map((r) => { const p = personaOf(r.agent);
      return `  ● ${(tech ? (r.agent || "agent") : p.who).padEnd(tech ? 44 : 36)} ${tech ? `running · ${fmtMs(r.ms)}` : `${r.detail || p.doing} · ${fmtMs(r.ms)}`}`; }),
    totals.agents ? (tech ? `\n  ${totals.agents} agent run(s) · ${fmtTok(totals.tokens)} tokens · ${fmtMs(totals.ms)} agent-time${totals.usd ? ` · $${totals.usd.toFixed(2)}` : ""}`
                          : `\n  ${totals.agents} team member(s) have finished their part · ${fmtMs(totals.ms)} of combined work`) : "",
  ].filter(Boolean).join("\n");

  return { rows, running, totals, text };
}

/** The ledger as a conversation — what someone watching should read, newest last. */
export function feed(runDir, { limit = 30 } = {}) {
  const t = (r) => new Date(r.at).toTimeString().slice(0, 5);
  return readLedger(runDir).map((r) => {
    const p = personaOf(r.agent);
    if (r.ev === "start") return `${t(r)}  ${p.who} started — ${r.detail || p.doing}`;
    if (r.ev === "done")  return `${t(r)}  ${p.who} ${r.detail || p.did}${r.ms ? ` (${fmtMs(r.ms)})` : ""}`;
    if (r.ev === "fail")  return `${t(r)}  ${p.who} hit a problem${r.detail ? `: ${r.detail}` : ""}`;
    return `${t(r)}  ${p.who}: ${r.detail || ""}`;      // "note" — an agent speaking, or a hand-off
  }).slice(-limit);
}

/** Compare two runs' ledgers (or agent-stats) stage by stage — the benchmark readout. */
export function bench(runDir, baselineDir) {
  const load = (d) => {
    const out = new Map();
    for (const r of readLedger(d)) if (r.ev === "done" && r.tokens) out.set(r.stage || r.agent, r);
    if (!out.size) { // fall back to the historical format
      const ALIAS = { "kf-ba": "domain", "kf-architect": "architecture", "kf-data-architect": "data-model",
        "kf-workflow-designer": "workflow", "kf-security-designer": "security",
        "kf-experience-designer": "experience", "prototype-pages": "prototype", "kf-prototype-builder": "prototype",
        "kf-integration-analyst": "automations", "kf-seed": "seed-data", "kf-verifier": "verifier" };
      try { for (const line of readFileSync(join(d, "agent-stats.jsonl"), "utf8").split("\n")) {
        if (!line.trim()) continue; const j = JSON.parse(line);
        const k = ALIAS[String(j.stage).replace(/^\d+[ab]?-/, "")] || String(j.stage).replace(/^\d+[ab]?-/, "");
        out.set(k, { tokens: j.tokens, tools: j.tool_uses, ms: j.ms });
      } } catch { /* nothing to fall back to */ }
    }
    return out;
  };
  const a = load(runDir), b = load(baselineDir);
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const lines = keys.map((k) => {
    const x = a.get(k), y = b.get(k);
    const d = x && y ? Math.round((x.tokens - y.tokens) / y.tokens * 100) : null;
    return `  ${k.padEnd(28)} ${x ? fmtTok(x.tokens).padStart(7) : "      —"}  vs ${y ? fmtTok(y.tokens).padStart(7) : "      —"}${d != null ? `   ${d > 0 ? "+" : ""}${d}%` : ""}`;
  });
  const ta = [...a.values()].reduce((t, r) => t + r.tokens, 0), tb = [...b.values()].reduce((t, r) => t + r.tokens, 0);
  lines.push(`  ${"TOTAL".padEnd(28)} ${fmtTok(ta).padStart(7)}  vs ${fmtTok(tb).padStart(7)}${tb ? `   ${ta > tb ? "+" : ""}${Math.round((ta - tb) / tb * 100)}%` : ""}`);
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const [cmd, runDir] = process.argv.slice(2);
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  if (cmd === "mark" && runDir) {
    mark(runDir, { agent: flag("--agent"), stage: flag("--stage") || undefined, ev: flag("--ev") || "note",
      parent: flag("--parent") || undefined, id: flag("--id") || undefined,
      usd: flag("--usd") ? +flag("--usd") : undefined,
      detail: flag("--detail") || undefined,
      tokens: flag("--tokens") ? +flag("--tokens") : undefined,
      tools: flag("--tools") ? +flag("--tools") : undefined,
      ms: flag("--ms") ? +flag("--ms") : undefined });
  } else if (cmd === "feed" && runDir) {
    console.log("\n" + feed(runDir).join("\n") + "\n");
  } else if (cmd === "board" && runDir) {
    const render = () => { const b = board(runDir, flag("--mode") || "auto", { tech: args.includes("--tech") });
      if (args.includes("--watch")) console.clear();
      console.log(`\nBUILD · ${runDir}\n\n${b.text}\n`); };
    render();
    if (args.includes("--watch")) {
      // STREAM, don't poll: re-render the instant the ledger gains a line. The 1s tick only keeps the
      // elapsed times on ● running rows honest between events — it is a clock, not the trigger.
      try { const { watch } = await import("node:fs");
        watch(runDir, (_e, f) => { if (f === FILE) { clearTimeout(globalThis.__t); globalThis.__t = setTimeout(render, 60); } });
      } catch { /* directory may not exist yet — the tick still covers it */ }
      setInterval(render, 1000);
    }
  } else if (cmd === "bench" && runDir) {
    console.log(`\nBENCH · ${runDir} vs ${flag("--against")}\n\n${bench(runDir, flag("--against"))}\n`);
  } else {
    console.error("usage: progress.mjs mark  <runDir> --agent A [--stage S] --ev start|done|fail|note [--tokens N --tools N --ms N --detail '…']");
    console.error("       progress.mjs board <runDir> [--mode quick|comprehensive] [--watch] [--tech]");
    console.error("       progress.mjs feed  <runDir>          — the build as a readable conversation");
    console.error("       progress.mjs bench <runDir> --against <baselineRunDir>");
    process.exit(2);
  }
}
