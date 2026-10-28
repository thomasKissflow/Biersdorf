# AI Builder chat

A browser chat that turns a spoken requirement into a running app UI, previewed beside the conversation.

```bash
node plugins/app-agents/chat/server.mjs --open        # http://127.0.0.1:4310
```

The flow the user sees:

1. **New app** → the chat opens.
2. **Intake** — the builder reads the requirement back and asks 2–3 clickable questions (who works in it,
   which flow is the spine, what scale). Never about colours or layout; those are the builder's job.
3. **Depth** — two cards: **Quick build** (the primary persona, 2–4 pages, ~3 min) or **Comprehensive**
   (every role, its own pages, one shared dataset, ~20 min).
4. **Build** — phase pills move through `Design · Shell · Build · Assemble · Verify` with a live activity
   log, and the assembled prototype appears in the preview pane.
5. **Iterate** — "add the approver role", "make it calmer", "the queue should show aging". Each message
   edits the app in place and the preview reloads.

## How it works

```
ui.html ──SSE── server.mjs ──stdin/stdout JSON── claude -p ──> plugins/app-agents (agents, engine, kit)
   │                 │                                              │
   └─ iframe ────────┴── /preview/<session>/ ──────── runs/<slug>/prototype/index.html
```

- **`server.mjs`** — zero-dependency `node:http` + SSE. One chat session = one run directory
  (`runs/<slug>/`) + one long-lived conductor + a watched preview. Sessions persist in `runs/.chat/`, so
  a reload (or a restart) resumes the conversation, the transcript and any unanswered question.
- **`driver.mjs`** — spawns `claude -p` with `--input-format stream-json --output-format stream-json`, so
  the same process handles the whole conversation. Prose is rendered from token deltas; tool calls become
  activity rows. Stop kills the child and keeps the Claude session id — the next message resumes it.
- **`markers.mjs`** — the control channel. The conductor emits `<<KF:phase …>>`, `<<KF:status …>>`,
  `<<KF:ask {…}>>`, `<<KF:plan {…}>>`, `<<KF:app …>>`, `<<KF:preview …>>`, `<<KF:done>>` inside its own
  reply; the server turns them into UI events and strips them from what the user reads. Markers survive
  being split across token deltas (`test/markers.test.mjs` proves it character by character).
- **`CONDUCTOR.md`** — appended to the conductor's system prompt: the intake script, the build recipe
  (design slice → `design-language.mjs shell` → parts → `proto-assemble` → `proto-verify`), the parts
  contract, and the boundaries (prototype only — no Kissflow calls, no publish, no commits).

Nothing here reimplements the builder: the conductor is this plugin, driven headlessly, so a chat-built
app is continuable with `/author-*` and a terminal-built prototype can be adopted into a chat (**Sessions
→ Prototypes on disk**).

## Options

| flag / env | default | |
|---|---|---|
| `--port` / `KF_CHAT_PORT` | `4310` | |
| `KF_CHAT_HOST` | `127.0.0.1` | keep it loopback — see below |
| `--model` / `KF_CHAT_MODEL` | inherit | |
| `--use-api-key` / `KF_CHAT_USE_API_KEY=1` | off | read `ANTHROPIC_API_KEY` from the gitignored `.kf-env` instead of the operator's `claude` login. **Only for unattended/hosted runs** — an API key takes precedence over the claude.ai login, which disables the org's MCP connectors and bills to the key. Locally, leave it off. |
| `KF_CHAT_PERMISSION_MODE` | `bypassPermissions` | the conductor runs engine scripts; prompts would hang a headless child |
| `--open` | off | open the browser |

**The conductor runs with permissions bypassed, so the socket must stay on loopback.** Do not bind
`0.0.0.0`; to reach it from elsewhere, tunnel it (`ssh -L 4310:127.0.0.1:4310 …`).

## Tests

```bash
node --test plugins/app-agents/chat/test/markers.test.mjs
```
