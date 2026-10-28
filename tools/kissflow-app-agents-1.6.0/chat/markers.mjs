// markers.mjs — the conductor↔server control channel.
//
// The headless conductor talks to the chat server through its OWN assistant text: it emits inline
// markers like `<<KF:phase Shell|generating the themed container>>` which the server turns into UI
// events (phase pills, preview swap, status line) and STRIPS from the prose the user reads.
//
// Text arrives as token deltas, so a marker can be split across chunks ("<<KF:pre" … "view x>>").
// MarkerStream buffers just enough to never leak a half-marker into the chat, and never holds back
// ordinary prose.

const OPEN = "<<KF:";
const CLOSE = ">>";

// Longest suffix of `s` that is a proper prefix of OPEN — the tail we must hold back in case the
// next chunk completes a marker.
function heldTail(s) {
  const max = Math.min(OPEN.length - 1, s.length);
  for (let n = max; n > 0; n--) if (s.endsWith(OPEN.slice(0, n))) return n;
  return 0;
}

export class MarkerStream {
  constructor() { this.buf = ""; }

  /** Feed a text chunk. Returns { text, markers:[{kind, value}] }. */
  push(chunk) {
    this.buf += chunk;
    let text = "";
    const markers = [];
    for (;;) {
      const i = this.buf.indexOf(OPEN);
      if (i < 0) {
        const hold = heldTail(this.buf);
        text += hold ? this.buf.slice(0, this.buf.length - hold) : this.buf;
        this.buf = hold ? this.buf.slice(this.buf.length - hold) : "";
        break;
      }
      const j = this.buf.indexOf(CLOSE, i + OPEN.length);
      if (j < 0) { text += this.buf.slice(0, i); this.buf = this.buf.slice(i); break; } // incomplete — wait
      text += this.buf.slice(0, i);
      const body = this.buf.slice(i + OPEN.length, j).trim();
      const sp = body.search(/\s/);
      const kind = (sp < 0 ? body : body.slice(0, sp)).toLowerCase();
      const value = sp < 0 ? "" : body.slice(sp + 1).trim();
      if (kind) markers.push({ kind, value });
      this.buf = this.buf.slice(j + CLOSE.length);
      // a marker on its own line shouldn't leave a blank line behind
      if (this.buf.startsWith("\n") && /\n[ \t]*$/.test(text)) this.buf = this.buf.slice(1);
    }
    return { text, markers };
  }

  /** End of turn — release anything still buffered (an unterminated marker is just prose). */
  flush() {
    const text = this.buf;
    this.buf = "";
    return text;
  }
}

// ── tool-call → one human line ────────────────────────────────────────────────────────────────────
// The activity log shows what the conductor is DOING, at a glance. Keep each entry to one clause;
// the chat is for prose, this is for motion.
const short = (s, n = 92) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const rel = (p) => short(String(p ?? "").replace(/^.*\/(runs|plugins|packages|starter|engine)\//, "$1/"), 64);

// A raw shell command reads as noise in the activity log when the calling agent skipped
// `description` — recognize the common cases so the fallback still reads like a sentence.
const CMD_PATTERNS = [
  [/^mkdir\b\s*(-p\s+)?(\S+)/, (m) => `creating ${rel(m[2])}`],
  [/^(cp|rsync)\b/, () => "copying files"],
  [/^mv\b/, () => "moving files"],
  [/^rm\b/, () => "removing files"],
  [/^cat\b\s*(\S+)?/, (m) => (m[1] ? `reading ${rel(m[1])}` : "reading a file")],
  [/^ls\b/, () => "listing files"],
  [/^chmod\b/, () => "updating file permissions"],
  [/^git\s+(\w+)/, (m) => `git ${m[1]}`],
  [/^(npm|pnpm|yarn)\s+(install|i)\b/, () => "installing dependencies"],
  [/^node\b/, () => "running a script"],
  [/^curl\b/, () => "fetching a resource"],
];
// Fallback by PROGRAM NAME, never by echoing the command. The old fallback returned the raw command
// truncated to 80 chars, which is how `python3 -c "import json d = json.load(open('plugins/…"` and a
// bare grep alternation (`AUTO_TRIGGER\|AUTO_SOURCE_MISSING\|…`) ended up rendered verbatim in a
// business user's chat. Nothing a person building an app can act on ever appears inside a shell
// invocation, so the invocation is not the thing to show — the intent is. Unrecognized programs get a
// neutral phrase rather than their arguments; the full command still travels in `code` for the
// technical view.
const PROG_LABEL = {
  python: "running a script", python3: "running a script", ruby: "running a script",
  bash: "running a script", sh: "running a script", zsh: "running a script", npx: "running a tool",
  grep: "searching files", rg: "searching files", ag: "searching files", find: "finding files",
  sed: "editing text", awk: "processing text", jq: "reading data", tr: "processing text",
  head: "reading a file", tail: "reading a file", wc: "counting lines", sort: "sorting results",
  diff: "comparing files", touch: "creating a file", echo: "writing output", printf: "writing output",
  tar: "packaging files", zip: "packaging files", unzip: "unpacking files",
  pkill: "stopping a process", kill: "stopping a process", lsof: "checking a port",
  open: "opening a file", which: "locating a tool", test: "checking a condition",
};
const friendlyCommand = (cmd) => {
  const c = String(cmd ?? "").trim();
  for (const [re, fn] of CMD_PATTERNS) { const m = c.match(re); if (m) return fn(m); }
  // strip leading env assignments / `cd … &&` preamble so the real program is what gets named
  const bare = c.replace(/^(\s*\w+=\S+\s+)*/, "").replace(/^cd\s+\S+\s*&&\s*/, "");
  const prog = (bare.match(/^([\w.\-/]+)/) || [])[1] || "";
  return PROG_LABEL[prog.split("/").pop()] || "running a command";
};

// File path → what that file IS to the person building an app. A raw `runs/<slug>/…/app-spec.json`
// row tells a business user nothing and looks broken; the artifact it represents tells them
// everything. Unmatched paths fall back to their basename — never the full runs/ path.
const FILE_LABEL = [
  [/app-spec\.json$/i, "the blueprint"],
  [/experience-spec\.json$/i, "the page designs"],
  [/decisions\.md$/i, "the design notes"],
  [/automations\.json$/i, "the automations"],
  [/review\.html$/i, "the blueprint page"],
  [/prototype\/index\.html$/i, "the prototype"],
  [/parts\/seed[^/]*$/i, "the sample data"],
  [/parts\/role-([\w-]+)\.html$/i, (m) => `the ${m[1].toUpperCase()} pages`],
  [/parts\/shell[^/]*$/i, "the app frame"],
  [/\bbrd\.md$/i, "the requirement"],
];
const friendlyFile = (p) => {
  const s = String(p ?? "");
  for (const [re, sub] of FILE_LABEL) { const m = s.match(re); if (m) return typeof sub === "function" ? sub(m) : sub; }
  return short(s.split("/").pop() || s, 40);
};

// Harness/orchestration tools the conductor uses on ITSELF — scheduling its own wakeup, managing its
// task list, messaging sub-agents. Rendering these produced rows like a bare "SCHEDULEWAKEUP" with no
// detail at all (measured 2026-08-07): pure machinery, nothing a user can read or act on. Hidden
// entirely — the lanes/status already narrate the work these calls coordinate.
const INTERNAL_TOOLS = new Set([
  "ScheduleWakeup", "Monitor", "SendMessage", "ListAgents", "PushNotification",
  "TaskCreate", "TaskUpdate", "TaskGet", "TaskList", "TaskOutput", "TaskStop",
]);

export function describeTool(name, input = {}) {
  const i = input || {};
  if (INTERNAL_TOOLS.has(String(name))) return { hidden: true, verb: "internal", detail: "" };
  switch (name) {
    case "Bash": return { verb: "run", detail: i.description ? short(i.description, 80) : friendlyCommand(i.command), code: short(i.command, 160) };
    case "Write": return { verb: "write", detail: friendlyFile(i.file_path), code: rel(i.file_path) };
    case "Edit": return { verb: "edit", detail: friendlyFile(i.file_path), code: rel(i.file_path) };
    case "Read": return { verb: "read", detail: friendlyFile(i.file_path), code: rel(i.file_path) };
    case "Glob": case "Grep": return { verb: "search", detail: "searching the project", code: short(i.pattern, 48) };
    case "Task": case "Agent": return { verb: "agent", detail: short(i.description || i.subagent_type, 60) };
    case "Workflow": return { verb: "workflow", detail: short(i.name || "inline script", 48) };
    case "TodoWrite": return { verb: "plan", detail: `${(i.todos || []).length} steps` };
    default: return { verb: "step", detail: short(i.description || "", 60) };
  }
}
