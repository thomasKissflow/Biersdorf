#!/usr/bin/env node
// fake-claude.mjs — stands in for the claude CLI in executor tests. Speaks just enough stream-json:
// for each user line on stdin it "builds" (writes a real artifact file into runs/<slug>/), narrates
// with markers embedded in text deltas, and closes the turn with a result event. Stays alive after,
// exactly like the real multi-turn CLI.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const slug = process.env.KF_SESSION_SLUG || "fake";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    turn();
  }
});
function turn() {
  out({ type: "system", subtype: "init", session_id: "fake-session-1", model: "fake-model" });
  const dir = join("runs", slug, "prototype");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>fake proto</title><h1>built by the fake</h1>");
  out({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text" } } });
  const say = (t) => out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: t } } });
  say("<<KF:phase Design>>Sketching the app. ");
  say("Shell is in place. ");
  say(`<<KF:preview runs/${slug}/prototype/index.html>>`);
  say("<<KF:done>>All set.");
  out({ type: "stream_event", event: { type: "message_stop" } });
  out({ type: "result", subtype: "success", duration_ms: 12, num_turns: 1, total_cost_usd: 0 });
}
