// driver.mjs — one long-lived headless Claude Code process per chat session.
//
// The chat server does NOT reimplement the builder: it drives THIS plugin through `claude -p` with
// streaming JSON on both ends, so every agent, command, engine script and workflow in
// plugins/app-agents is available to the conversation exactly as it is in the terminal.
//
//   stdin   ← {"type":"user","message":{…}}         one line per user turn (real multi-turn chat)
//   stdout  → {"type":"stream_event"|"assistant"|"user"|"result"|"system", …}
//
// We render prose from stream_event text deltas (so it types out live) and use the coarse `assistant`
// messages only for tool_use — mixing both for text would double every sentence.

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { MarkerStream, describeTool } from "./markers.mjs";

const BIN = process.env.KF_CHAT_CLAUDE_BIN || "claude";
// The conductor runs `node engine/*.mjs`, writes run artifacts and fans out agents — none of which
// survives an approval prompt in a headless process. The server binds to loopback only (see server.mjs).
const PERMISSION_MODE = process.env.KF_CHAT_PERMISSION_MODE || "bypassPermissions";
// One silent retry after a lost transcript. Two failures in a row is not a lost transcript, it is
// something that keeps failing, and replaying it again only spawns another child.
const MAX_REPLAYS = 1;

// Startup notices the CLI writes to stderr that say nothing about THIS build. The activity log is for
// what the conductor is doing; a connector notice on every single session trains the user to ignore it,
// and then a real error scrolls past unread.
const BENIGN_STDERR = /claude\.ai connectors are disabled|takes precedence over your claude\.ai login/i;

// A Task's display name in the chat. The conductor is told to label each fan-out agent with the
// specialist's name ("Design Director", "Prototype Builder · Approver") — so prefer the description it
// wrote, and fall back to prettifying the registered agent type.
function agentName(input = {}) {
  // The REGISTERED agent type wins over whatever the conductor typed as a description. The chat is a
  // team of named specialists — Architect, Builder, Experience Designer — and the client maps these
  // slugs onto those names. Preferring the description gave bubbles labelled with the task instead of
  // the person doing it ("Blueprint / App Spec IR"), which reads like a ticket, not a colleague.
  const t = String(input.subagent_type || "").replace(/^app-agents:/, "").replace(/^kf-/, "").trim();
  const d = String(input.description || "").trim().replace(/^(build|write|generate|create)\s+/i, "");
  // Type AND task, because a build fans out several agents of the SAME type at once — one builder per
  // role. Naming them all "Builder" would collapse three concurrent voices into one bubble and
  // interleave their text. The UI splits on " · " and resolves the first part against the roster, so
  // this renders as "Builder · Member Pages".
  if (t && d && d.length <= 40) return `${t} · ${d}`;
  if (t) return t;   // the slug alone; prettyAgent() in the UI maps it to the roster name
  if (d) return d.replace(/^\w/, (c) => c.toUpperCase());
  return "specialist";
}

export class Conductor extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.id            chat session id (ours, not Claude's)
   * @param {string} o.repoRoot      cwd for the child — the plugin repo
   * @param {string} o.systemPrompt  path to CONDUCTOR.md
   * @param {string} o.pluginDir     path to plugins/app-agents
   * @param {string} [o.model]
   * @param {string} [o.claudeSessionId]  resume a previous Claude session (survives restarts/stops)
   */
  constructor(o) {
    super();
    Object.assign(this, o);
    this.child = null;
    this.busy = false;
    this.queue = [];
    this.markers = new MarkerStream();
    this.textBlocks = new Set(); // block indexes already streamed as deltas
    this.agents = new Map();     // tool_use id → specialist name, for forwarded subagent text
    this.stdoutBuf = "";
    this.sawEvent = false;       // has THIS child produced any stream output yet
    this.deadResume = false;     // stderr said the --resume transcript no longer exists
    this.lastSent = null;        // the last user turn, for the resume-fallback replay
    // How many times THIS turn has been replayed after a lost transcript. The fallback was written
    // as "at most once per lost transcript", but nothing enforced it: every replay spawns a child
    // that mints a NEW session id, so a failure that keeps tripping the same detection replays
    // forever. Observed live — six spawns in one minute (vaultops, 2026-08-02), each emitting
    // turn-start and none ever emitting turn-end, which locks the composer until a reload.
    this.replays = 0;
  }

  /**
   * A lost transcript is recovered silently — it fixes itself, and saying so only alarms people
   * about our own housekeeping. Recovering REPEATEDLY is a different thing: it is not working, the
   * turn is not going to complete, and the person is watching a dead composer. That has to be said.
   *
   * Returns true if the replay may proceed.
   */
  allowReplay() {
    if (++this.replays <= MAX_REPLAYS) return true;
    this.replays = 0;
    this.busy = false;
    this.emit("error", "the builder could not resume this conversation after several attempts — send your message again to start a fresh one");
    this.emit("turn-end", { ok: false, error: "resume-loop" });   // release the composer; a stuck one is worse than the failure
    return false;
  }

  get running() { return !!this.child; }

  args() {
    const a = [
      "-p",
      "--output-format", "stream-json",
      "--input-format", "stream-json",
      "--include-partial-messages",
      // The chat should read as the specialists working, not as a machine reporting. Forwarding
      // subagent text gives us their ACTUAL voices (parent_tool_use_id ties each line back to the Task
      // that spawned it) instead of a conductor summarising them second-hand.
      "--forward-subagent-text",
      "--verbose",
      "--permission-mode", PERMISSION_MODE,
      "--append-system-prompt-file", this.systemPrompt,
      "--plugin-dir", this.pluginDir,
      // CONTEXT, and therefore COST. A build turn fans out to agents making 13-66 tool calls each,
      // and stale tool results ride along in context afterwards — paid for on every subsequent turn.
      // `auto` lets the CLI pick the compaction window; KF_AUTOCOMPACT overrides it (100k-1M) when a
      // run genuinely needs a wider one. Measured motivation: a single turn of the Carbon Compliance
      // build carried 15.75M tokens of input.
      "--autocompact", process.env.KF_AUTOCOMPACT || "auto",
      // Moves the per-machine sections (cwd, env, git status) out of the system prompt and into the
      // first user message. Those differ per INSTANCE, so with them in the prompt the cache prefix
      // differs per instance too — and this fleet spreads one session across many (12 instances for
      // one session, measured). Same conversation, same prefix, cache actually reused.
      "--exclude-dynamic-system-prompt-sections",
    ];
    if (this.model) a.push("--model", this.model);
    if (this.claudeSessionId) a.push("--resume", this.claudeSessionId);
    return a;
  }

  start() {
    if (this.child) return;
    this.child = spawn(BIN, this.args(), {
      cwd: this.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      // `env` carries the API key when the server is running unattended (hosted, no interactive
      // login). Left empty, the child uses whatever auth the operator's own `claude` already has.
      env: { ...process.env, ...(this.env || {}), KF_CHAT: "1" },
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (d) => this.onStdout(d));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (d) => {
      const s = String(d).trim();
      // The CLI's own words for a --resume pointing at a transcript that no longer exists (the machine
      // it lived on was recycled). It does NOT always die silently — it can exit through a normal error
      // result on stdout — so the exit-heuristic alone misses it. The message is the reliable signal.
      if (/No conversation found with session ID/i.test(s)) this.deadResume = true;
      if (s && !BENIGN_STDERR.test(s)) this.emit("stderr", s);
    });
    const self = this.child;   // identity guard: events from a superseded child must change nothing
    this.child.on("error", (e) => { if (this.child !== self) return; this.emit("fatal", `cannot start ${BIN}: ${e.message}`); this.cleanup(); });
    this.child.on("exit", (code, signal) => {
      // The dead-resume fallback replaces the child and replays the turn; the OLD child's exit then
      // arrives late. Without this guard it re-ran cleanup (nulling the NEW child's handle) and told
      // the room "builder exited (code 1)" about a process that had already been superseded — the
      // red flash users saw between "context was lost" and the fresh build starting.
      if (this.child !== self) return;
      const wasBusy = this.busy;
      const deadResume = this.deadResume || (this.claudeSessionId && !this.sawEvent && code !== 0 && signal !== "SIGTERM");
      const replay = this.lastSent;
      this.cleanup();
      // RESUME FALLBACK. --resume names a transcript on the machine the CLI runs on, and that machine
      // is now disposable: a session pod that idle-timed-out (or a redeployed instance) comes back with
      // a fresh filesystem, the transcript is gone, and the CLI exits immediately. Without this, every
      // "continue" respawns with the same dead id and fails forever — three resume attempts in one
      // minute on a real build (capital-expenditure, 2026-07-31). A child that died WITHOUT EVER
      // producing an event while resuming is that case: drop the id, start fresh, replay the turn. The
      // fresh spawn mints a new session id, which flows back through the claude-session event, so this
      // fires at most once per lost transcript.
      if (deadResume && wasBusy && replay) {
        if (!this.allowReplay()) return;
        this.claudeSessionId = null;
        this.emit("claude-session", null);   // the host must persist the reset, or the NEXT respawn resumes the same corpse
        // SILENT on purpose. This recovers on its own — the turn is replayed against the app's current
        // state and the person gets the answer they asked for. Announcing it in the chat only reported
        // our own housekeeping as if it were their problem: it read as an error, invited "did I lose my
        // work?", and named a machine nobody knew existed. Logged for whoever runs the service, where
        // a lost transcript is genuinely useful signal.
        console.warn(`  [${this.id}] resume transcript gone — replaying the turn on a fresh session`);
        this.send(replay);
        return;
      }
      this.emit("exit", { code, signal, wasBusy });
      if (wasBusy && signal !== "SIGTERM") this.emit("error", `builder exited (code ${code}${signal ? ` ${signal}` : ""}) — send another message to resume`);
    });
    this.emit("spawn", { resumed: !!this.claudeSessionId });
  }

  cleanup() {
    this.child = null;
    this.busy = false;
    this.sawEvent = false;
    this.deadResume = false;
    this.textBlocks.clear();
    this.agents.clear();
    this.agentNames = new Map();
    this.sawInit = false;      // next spawn's first init is the main session again
    this.agentMarkers = new Map();
    this.markers = new MarkerStream();
  }

  /** Send a user turn. Queues if a turn is already in flight. */
  send(text) {
    if (this.busy) { this.queue.push(text); this.emit("queued", { pending: this.queue.length }); return false; }
    this.start();
    this.busy = true;
    this.textBlocks.clear();
    const line = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
    }) + "\n";
    this.child.stdin.write(line);
    this.lastSent = text;
    this.emit("turn-start", {});
    return true;
  }

  /** Stop the current turn. The Claude session id is kept, so the next message resumes it. */
  stop() {
    if (!this.child) return;
    this.child.kill("SIGTERM");
  }

  onStdout(chunk) {
    this.stdoutBuf += chunk;
    let nl;
    while ((nl = this.stdoutBuf.indexOf("\n")) >= 0) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { this.emit("stderr", line.slice(0, 400)); continue; }
      this.sawEvent = true;
      try { this.onEvent(ev); } catch (e) { this.emit("stderr", `event handler: ${e.message}`); }
    }
  }

  onEvent(ev) {
    switch (ev.type) {
      case "system":
        // With --forward-subagent-text every fan-out agent's OWN boot arrives here too (measured: 7
        // "ready" logs for one turn with 7 Task agents). Adopting a subagent's session_id overwrote
        // the conductor's resume id — the corruption behind "resume transcript gone" replays. The
        // reliable discriminator is ORDER, not id comparison: the CLI announces the MAIN session's
        // init first, before any Task can run, so only the first init per spawn is ours. (Comparing
        // ids instead would also reject the legitimately NEW id a --resume fork assigns.)
        if (ev.parent_tool_use_id) return;
        if (ev.subtype === "init") {
          if (this.sawInit) return;   // a fan-out agent booting mid-turn
          this.sawInit = true;
          if (ev.session_id && ev.session_id !== this.claudeSessionId) {
            this.claudeSessionId = ev.session_id;
            this.emit("claude-session", ev.session_id);
          }
          this.emit("ready", { model: ev.model, tools: (ev.tools || []).length });
        }
        return;

      case "stream_event": {
        const e = ev.event || {};
        // a subagent's deltas must not land in the conductor's own bubble
        if (ev.parent_tool_use_id) {
          if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text)
            this.pushAgentText(ev.parent_tool_use_id, this.agents.get(ev.parent_tool_use_id) || this.agentNames?.get(ev.parent_tool_use_id) || "specialist", e.delta.text);
          return;
        }
        if (e.type === "content_block_start" && e.content_block?.type === "text") this.textBlocks.add(e.index);
        if (e.type === "content_block_delta") {
          const d = e.delta || {};
          if (d.type === "text_delta" && d.text) this.pushText(d.text);
          else if (d.type === "thinking_delta" && d.thinking) this.emit("thinking", d.thinking);
        }
        if (e.type === "message_stop") this.flushText();
        return;
      }

      case "assistant": {
        // forwarded from a subagent — attribute it to the specialist that said it
        if (ev.parent_tool_use_id) {
          const who = this.agents.get(ev.parent_tool_use_id) || this.agentNames?.get(ev.parent_tool_use_id);
          for (const b of ev.message?.content || []) {
            if (b.type === "text" && b.text && b.text.trim()) {
              this.pushAgentText(ev.parent_tool_use_id, who || "specialist", b.text);
            }
          }
          return;
        }
        for (const b of ev.message?.content || []) {
          if (b.type === "tool_use") {
            const d = describeTool(b.name, b.input);
            // remember who this Task is, so its forwarded lines get a name rather than "specialist"
            if (b.name === "Task" || b.name === "Agent") this.agents.set(b.id, agentName(b.input));
            // harness/self-orchestration calls (wakeups, task bookkeeping) are not user-facing work —
            // rendering them produced bare "SCHEDULEWAKEUP" rows with no readable content
            if (!d.hidden) this.emit("tool", { id: b.id, name: b.name, ...d });
          } else if (b.type === "text" && b.text) {
            // no partial deltas arrived for this block (subagent forwarding, or a provider that
            // doesn't stream) — render it now so nothing is silently dropped
            if (!this.textBlocks.size) this.pushText(b.text);
          }
        }
        return;
      }

      case "user": {
        for (const b of ev.message?.content || []) {
          if (b.type === "tool_result") {
            const txt = Array.isArray(b.content)
              ? b.content.map((c) => (typeof c === "string" ? c : c.text || "")).join("")
              : String(b.content ?? "");
            this.emit("tool-result", { id: b.tool_use_id, error: !!b.is_error, text: txt.slice(0, 600) });
            // A Task's result IS the moment its agent finished. Without this the UI can only flip
            // every agent to "done" at turn-end — so with four builders fanned out, the three that
            // landed early kept spinning for the whole tail of the turn.
            if (this.agents.has(b.tool_use_id)) {
              this.emit("agent-done", { id: b.tool_use_id, name: this.agents.get(b.tool_use_id), error: !!b.is_error });
              // `agents` doubles as the OPEN-tasks set that gates "result" above, so a finished
              // Task must leave it; its name moves aside for any late-arriving attribution.
              (this.agentNames ||= new Map()).set(b.tool_use_id, this.agents.get(b.tool_use_id));
              this.agents.delete(b.tool_use_id);
            }
          }
        }
        return;
      }

      case "result": {
        // A fan-out agent finishing is NOT the turn finishing. Subagent results are forwarded just
        // like their text; treating any bare "result" as the turn's end flipped the whole session to
        // "done" the moment the FIRST page agent landed, while the conductor was still mid-build
        // (measured live on the Sentry build, 2026-08-06 — chip read "Up to date" at 11m with the
        // verify/fix loop still streaming). Session-id comparison alone was NOT enough: a subagent
        // result with no session_id slipped through on the very next build. The airtight rule is
        // protocol-level — the MAIN turn cannot produce its result while any Task tool call is still
        // open, so an unresolved agent in the map means this result belongs to one of them.
        if (ev.parent_tool_use_id) return;
        if (this.agents.size > 0) return;
        if (this.claudeSessionId && ev.session_id && ev.session_id !== this.claudeSessionId) return;
        // A dead --resume can surface HERE as an error result rather than a silent exit. Same remedy,
        // and the same silence: drop the id and replay fresh. Never on success — deadResume can only
        // have been set by the stderr line, but belt and braces.
        if (this.deadResume && ev.subtype !== "success" && this.lastSent) {
          const replay = this.lastSent;
          this.deadResume = false;
          if (!this.allowReplay()) { const c = this.child; this.cleanup(); try { c?.kill("SIGTERM"); } catch { /* exiting anyway */ } return; }
          this.claudeSessionId = null;
          this.emit("claude-session", null);
          console.warn(`  [${this.id}] resume transcript gone (error result) — replaying the turn on a fresh session`);
          const child = this.child;
          this.cleanup();
          try { child?.kill("SIGTERM"); } catch { /* it is exiting anyway */ }
          this.send(replay);
          return;
        }
        this.flushText();
        this.busy = false;
        if (ev.subtype === "success") this.replays = 0;   // a turn that completed clears the budget
        this.emit("turn-end", {
          ok: ev.subtype === "success",
          error: ev.subtype !== "success" ? ev.subtype : null,
          ms: ev.duration_ms,
          turns: ev.num_turns,
          cost: ev.total_cost_usd,
          usage: ev.usage || null,
        });
        const next = this.queue.shift();
        if (next) setTimeout(() => this.send(next), 10);
        return;
      }
    }
  }

  pushText(t) {
    const { text, markers } = this.markers.push(t);
    if (text) this.emit("text", text);
    for (const m of markers) this.emit("marker", m);
  }

  // Subagents drive the UI too: the blueprint agent reports its own progress into the Blueprint tab, and
  // the role agents re-preview as they land. Each gets its own MarkerStream so a marker split across one
  // agent's deltas can't be mixed with another's.
  pushAgentText(id, name, t) {
    if (!this.agentMarkers) this.agentMarkers = new Map();
    let ms = this.agentMarkers.get(id);
    if (!ms) { ms = new MarkerStream(); this.agentMarkers.set(id, ms); }
    const { text, markers } = ms.push(t);
    if (text) this.emit("agent", { id, name, text });
    for (const m of markers) this.emit("marker", { ...m, from: name });
  }

  flushText() {
    const rest = this.markers.flush();
    if (rest) this.emit("text", rest);
  }
}
