#!/usr/bin/env node
// token-stamp.mjs — SubagentStop hook: stamp each kf agent's TOKEN USAGE into the run timeline.
//
// Wired via hooks/hooks.json (SubagentStop, matcher kf-*). Claude Code pipes the hook payload on
// stdin ({agent_id, agent_type, agent_transcript_path, …}); we sum message.usage across the
// subagent's transcript turns and append one event to <runDir>/timeline.jsonl:
//   {"ts":…,"actor":"kf-ba","step":"agent aBc123","ev":"tokens","tokens":{input,output,cacheRead,cacheWrite,total,turns}}
// `timeline.mjs report` then prints per-actor + run-total token columns next to the durations.
//
// Run dir resolution: $KF_RUN_DIR, else ./runs/current, else ./ (only if a timeline.jsonl already
// exists there — never scatter files into arbitrary cwds). Instrumentation must never break the
// pipeline or block the agent: every failure exits 0 silently.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stamp, sumTranscriptTokens, FILE } from "./timeline.mjs";

function runDir() {
  if (process.env.KF_RUN_DIR && existsSync(process.env.KF_RUN_DIR)) return process.env.KF_RUN_DIR;
  const cur = join(process.cwd(), "runs", "current");
  if (existsSync(cur)) return cur;
  return existsSync(join(process.cwd(), FILE)) ? process.cwd() : null;
}

try {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const dir = runDir();
  const transcript = payload.agent_transcript_path;
  if (dir && transcript && existsSync(transcript)) {
    const tokens = sumTranscriptTokens(readFileSync(transcript, "utf8"));
    if (tokens) {
      const actor = String(payload.agent_type || "subagent").replace(/^.*:/, ""); // strip plugin prefix
      stamp(dir, actor, `agent ${payload.agent_id || ""}`.trim(), "tokens", undefined, { tokens });
    }
  }
} catch { /* silent — see header */ }
process.exit(0);
