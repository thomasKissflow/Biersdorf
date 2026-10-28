#!/usr/bin/env node
// memory-apply.mjs — write what an agent has LEARNED back into how it works.
//
// The loop was open. A lesson became a FACT in the pool and never became a PROCEDURE: the agent's
// method lives in agents/<id>.md and only ever changed when a human noticed something and edited
// markdown. Semantic memory accumulated automatically; procedural memory did not accumulate at all.
//
// This closes it. Agent-scoped lessons that have earned their place are written into the agent's own
// definition, inside a managed block, so the next run reads them as part of its method rather than
// having to remember to go and look them up.
//
//   node engine/memory-apply.mjs --from <lessons.json> [--agents <dir>] [--apply]
//
// The bar is deliberately high — `reproduced` or better, meaning either two independent runs reached
// the same conclusion or a human confirmed it. A single observation is a guess, and a guess written
// into an agent's method is how one bad run teaches every future one.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const START = "<!-- LEARNED:start — managed by engine/memory-apply.mjs, edits here are overwritten -->";
export const END = "<!-- LEARNED:end -->";

const RANK = { "owner-confirmed": 4, "golden-verified": 3, reproduced: 2, "observed-once": 1 };
export const EARNED = (m) => (RANK[m.tier] || 1) >= RANK.reproduced && !m.quarantined && !m.archived;

/** The block that goes into an agent's definition. Returns "" when nothing has earned a place. */
export function renderBlock(lessons) {
  const keep = lessons.filter(EARNED);
  if (!keep.length) return "";
  const line = (m) => {
    const why = m.tier === "owner-confirmed" ? "confirmed"
      : m.seen_count > 1 ? `seen ${m.seen_count}×` : "reproduced";
    return `- ${String(m.text).trim().replace(/\s+/g, " ")}  _(${why})_`;
  };
  return [
    START,
    "",
    "### Learned on the job",
    "",
    "These came out of real runs and were either reproduced independently or confirmed by a",
    "maintainer. Treat them as part of your method, not as trivia.",
    "",
    ...keep.map(line),
    "",
    END,
  ].join("\n");
}

/** Splice the block into a definition, replacing any previous one. Idempotent. */
export function applyToDoc(doc, block) {
  const s = doc.indexOf(START);
  const e = doc.indexOf(END);
  if (s >= 0 && e > s) {
    const before = doc.slice(0, s).replace(/\s+$/, "");
    const after = doc.slice(e + END.length).replace(/^\s+/, "");
    // Only the JOIN is normalised. Collapsing blank lines across the whole document would reformat
    // parts of an agent method this tool has no business touching, and make every first run a diff.
    return block ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${after}`;
  }
  if (!block) return doc;
  return `${doc.replace(/\s+$/, "")}\n\n${block}\n`;
}

/** lessons: [{agent, text, tier, seen_count, quarantined, archived}] → per-agent results */
export function applyAll(lessons, { agentsDir = join(HERE, "..", "agents"), apply = false } = {}) {
  const byAgent = {};
  for (const m of lessons) { if (!m.agent) continue; (byAgent[m.agent] ||= []).push(m); }
  const out = [];
  const known = new Set(existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")) : []);
  for (const [agent, rows] of Object.entries(byAgent)) {
    if (!known.has(agent)) { out.push({ agent, skipped: "no such agent definition" }); continue; }
    const file = join(agentsDir, `${agent}.md`);
    const doc = readFileSync(file, "utf8");
    const block = renderBlock(rows);
    const next = applyToDoc(doc, block);
    const changed = next !== doc;
    if (changed && apply) writeFileSync(file, next);
    out.push({ agent, earned: rows.filter(EARNED).length, of: rows.length, changed, applied: changed && apply });
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const fi = process.argv.indexOf("--from");
  const ai = process.argv.indexOf("--agents");
  const apply = process.argv.includes("--apply");
  if (fi < 0) {
    console.error("usage: memory-apply.mjs --from <lessons.json> [--agents <dir>] [--apply]");
    console.error("  lessons.json: the agent-scoped rows from /platform-admin/memory/browse?scope=agent");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(process.argv[fi + 1], "utf8"));
  const lessons = Array.isArray(raw) ? raw : (raw.rows || raw.pending || []);
  const res = applyAll(lessons, { agentsDir: ai >= 0 ? process.argv[ai + 1] : undefined, apply });
  for (const r of res) {
    console.log(r.skipped
      ? `  ${r.agent.padEnd(24)} skipped — ${r.skipped}`
      : `  ${r.agent.padEnd(24)} ${r.earned}/${r.of} earned  ${r.changed ? (r.applied ? "WRITTEN" : "would change") : "no change"}`);
  }
  if (!apply) console.log("\nnothing written — pass --apply");
}
