#!/usr/bin/env node
// timeline.mjs — per-run TIMING instrumentation. Answers "how long did generation take, and
// which agent took what" — the question the decision log and verification ledger can't.
//
// Every run gets runs/<id>/timeline.jsonl (append-only, one JSON event per line):
//   {"ts":"2026-07-03T06:22:11.412Z","actor":"kf-workflow-designer","step":"design workflows","ev":"start"}
// Events come from three sources:
//   1. AUTOMATIC — engine/cli.mjs stamps verify/build/apply start+end (actor = $KF_ACTOR or "engine"),
//      and runs.mjs marks every snapshot. Zero agent effort; covers the build path end-to-end.
//   2. AGENTS — bracket their own work:  node engine/timeline.mjs start "kf-ba" "extract domain"
//                                        node engine/timeline.mjs end   "kf-ba" "extract domain"
//   3. MARKS — point-in-time milestones: node engine/timeline.mjs mark "user" "review sign-off"
//
// Report:  node engine/timeline.mjs report [runDir]  → total wall-clock, per-actor and per-step
// durations, open-ended spans flagged. Timeline failures NEVER break a build — writers try/catch.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const FILE = "timeline.jsonl";

// append one event; silent on failure (instrumentation must never break the pipeline)
export function stamp(runDir, actor, step, ev = "mark", ts = new Date().toISOString(), extra = null) {
  try { appendFileSync(join(runDir, FILE), JSON.stringify({ ts, actor, step, ev, ...(extra || {}) }) + "\n"); return true; }
  catch { return false; }
}

// sum token usage out of a subagent transcript (.jsonl of API turns; usage on message.usage).
// Every assistant turn re-bills the context (mostly as cache reads) — so cacheRead dwarfs input;
// report both. Returns null when the transcript has no usage at all.
export function sumTranscriptTokens(text) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };
  for (const line of String(text).split(/\r?\n/)) {
    if (!line) continue;
    let u; try { u = JSON.parse(line)?.message?.usage; } catch { continue; }
    if (!u || typeof u !== "object") continue;
    t.turns++;
    t.input += u.input_tokens || 0;
    t.output += u.output_tokens || 0;
    t.cacheRead += u.cache_read_input_tokens || 0;
    t.cacheWrite += u.cache_creation_input_tokens || 0;
  }
  if (!t.turns) return null;
  t.total = t.input + t.output + t.cacheRead + t.cacheWrite;
  return t;
}

export function parseTimeline(text) {
  return String(text).split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// pair start/end per actor+step (FIFO), keep marks, flag open-ended spans
export function summarize(events) {
  const spans = [], open = {};
  const byActorTokens = {}, tokenTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, agents: 0 };
  for (const e of events) {
    const k = `${e.actor}§${e.step}`;
    if (e.ev === "start") (open[k] = open[k] || []).push(e);
    else if (e.ev === "end") { const st = (open[k] || []).shift(); spans.push({ actor: e.actor, step: e.step, start: st ? st.ts : null, end: e.ts, ms: st ? Date.parse(e.ts) - Date.parse(st.ts) : null }); }
    else if (e.ev === "tokens" && e.tokens) {
      const a = (byActorTokens[e.actor] = byActorTokens[e.actor] || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, agents: 0 });
      for (const f of ["input", "output", "cacheRead", "cacheWrite", "total"]) { a[f] += e.tokens[f] || 0; tokenTotal[f] += e.tokens[f] || 0; }
      a.agents++; tokenTotal.agents++;
    }
    else spans.push({ actor: e.actor, step: e.step, start: e.ts, end: e.ts, ms: 0, mark: true });
  }
  for (const k of Object.keys(open)) for (const st of open[k]) spans.push({ actor: st.actor, step: st.step, start: st.ts, end: null, ms: null, open: true });
  const stamped = events.map((e) => Date.parse(e.ts)).filter(Number.isFinite);
  const total = stamped.length ? Math.max(...stamped) - Math.min(...stamped) : 0;
  const byActor = {};
  for (const s of spans) if (s.ms) byActor[s.actor] = (byActor[s.actor] || 0) + s.ms;
  return { spans, total, byActor, byActorTokens, tokenTotal: tokenTotal.agents ? tokenTotal : null, first: events[0]?.ts || null, last: events[events.length - 1]?.ts || null };
}

export const fmtMs = (ms) => {
  if (ms == null) return "…";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n || 0));

// ── CLI ───────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const [cmd, a1, a2] = process.argv.slice(2);
  const flagRun = (() => { const i = process.argv.indexOf("--run"); return i >= 0 ? process.argv[i + 1] : null; })();
  if (cmd === "start" || cmd === "end" || cmd === "mark") {
    const runDir = flagRun || process.cwd();
    if (!a1 || !a2) { console.error(`usage: timeline.mjs ${cmd} "<actor>" "<step>" [--run dir]`); process.exit(1); }
    stamp(runDir, a1, a2, cmd);
    console.log(`${cmd} · ${a1} · ${a2}`);
  } else if (cmd === "report") {
    const runDir = a1 || flagRun || process.cwd();
    const f = join(runDir, FILE);
    if (!existsSync(f)) { console.log(`no ${FILE} in ${runDir}`); process.exit(1); }
    const { spans, total, byActor, byActorTokens, tokenTotal, first, last } = summarize(parseTimeline(readFileSync(f, "utf8")));
    console.log(`TIMELINE — ${runDir}\n  window: ${first} → ${last}   wall-clock: ${fmtMs(total)}\n`);
    console.log("  per step:");
    for (const s of spans) console.log(`    ${(s.actor + " · " + s.step).padEnd(58).slice(0, 58)} ${s.mark ? "· mark" : fmtMs(s.ms)}${s.open ? " (still open)" : ""}`);
    const actors = Object.entries(byActor).sort((x, y) => y[1] - x[1]);
    if (actors.length) { console.log("\n  per actor (timed spans only):"); for (const [k, v] of actors) console.log(`    ${k.padEnd(30)} ${fmtMs(v)}`); }
    const tokActors = Object.entries(byActorTokens || {}).sort((x, y) => y[1].total - x[1].total);
    if (tokActors.length) {
      console.log("\n  tokens per actor (out = model-generated; cacheR/W = context re-billed at cache rates):");
      for (const [k, t] of tokActors) console.log(`    ${k.padEnd(30)} total ${fmtTok(t.total).padStart(7)}   out ${fmtTok(t.output).padStart(6)}   in ${fmtTok(t.input).padStart(6)}   cacheR ${fmtTok(t.cacheRead).padStart(7)}   cacheW ${fmtTok(t.cacheWrite).padStart(7)}${t.agents > 1 ? `   (${t.agents} runs)` : ""}`);
      console.log(`    ${"RUN TOTAL".padEnd(30)} total ${fmtTok(tokenTotal.total).padStart(7)}   out ${fmtTok(tokenTotal.output).padStart(6)}   in ${fmtTok(tokenTotal.input).padStart(6)}   cacheR ${fmtTok(tokenTotal.cacheRead).padStart(7)}   cacheW ${fmtTok(tokenTotal.cacheWrite).padStart(7)}   (${tokenTotal.agents} agent runs)`);
    }
  } else {
    console.log('usage: node engine/timeline.mjs start|end|mark "<actor>" "<step>" [--run dir] · report [runDir]');
  }
}
