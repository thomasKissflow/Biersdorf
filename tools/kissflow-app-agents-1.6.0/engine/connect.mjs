// connect.mjs — the Cowork/plugin side of the handshake. Exchanges a connect token for JIT scoped
// config and writes the runtime env so the pipeline is ready to build against the RIGHT project:
// Kissflow creds (dev), the project's shared-memory org, and its GCS artifact prefix. The token is
// OPAQUE to the session — no signing key here, no secrets in the URL.
//
//   node engine/connect.mjs --auto [--env .kf-env] [--base URL]   # browser handshake (OAuth-style device flow)
//   node engine/connect.mjs <connect-url|token> [--env .kf-env] [--base URL]        # attach (direction 1)
//   node engine/connect.mjs --new "<App name>" --identity <token> [--base URL]      # create (direction 2)
import { writeFileSync, readFileSync, renameSync, chmodSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const tokenFromUrl = (s) => (s && s.includes("/c/") ? s.split("/c/")[1] : s);

// core: POST /bootstrap → scoped config. Returns { mode, config }.
export async function connect({ token, base, mode, appName, identity }) {
  const b = base || process.env.CONTROL_PLANE_URL || "https://aibuilder.kissflow.com";
  const payload = mode === "create" ? { token: identity, mode: "create", appName } : { token: tokenFromUrl(token) };
  const r = await fetch(b + "/bootstrap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) throw new Error(`bootstrap failed (${r.status}): ${j.error || "unknown"}`);
  return j;
}

// ── browser device-flow (the appbuilder control plane acts as the OAuth-style provider) ─────────
// Parks a connect request, sends the user's browser to appbuilder (sign-in → pick/create project →
// dev env → approve), and polls until the approval turns into scoped config. A loopback redirect
// snaps the browser back instantly when we can listen locally; polling alone covers headless/Cowork.
export async function connectAuto({ base, openBrowser = true, onVerify, pollMs } = {}) {
  const b = base || process.env.CONTROL_PLANE_URL || "https://aibuilder.kissflow.com";
  // best-effort loopback listener — purely an accelerator, polling is the source of truth
  let redirectUri = null, loop = null, approvedPing = () => {};
  // styled "connected" popup: dimmed backdrop + card + Continue → the project page in appbuilder
  const successPage = (q) => {
    const clean = (s) => String(s || "").replace(/[<>&"']/g, ""); // loopback is localhost, but never render raw query
    const proj = clean(q.get("project")), name = clean(q.get("name")) || proj || "your project";
    const base = clean(q.get("base")) || b;
    const appUrl = (/^https?:\/\//.test(base) ? base : b).replace(/\/$/, "") + (proj ? `/p/${encodeURIComponent(proj)}` : "/");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Connected · appbuilder</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Sora",system-ui,sans-serif;background:radial-gradient(60% 50% at 15% 0%,rgba(124,92,255,.14),transparent 60%),radial-gradient(50% 40% at 90% 10%,rgba(59,141,255,.12),transparent 60%),#f5f6fb;color:#151827}
@media(prefers-color-scheme:dark){body{background:radial-gradient(60% 50% at 15% 0%,rgba(124,92,255,.22),transparent 60%),#07080d;color:#eaecf6}.card{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12)}.sub{color:#8990ab}}
.card{background:#fff;border:1px solid #e7e9f2;border-radius:20px;padding:38px 42px;max-width:420px;text-align:center;box-shadow:0 30px 80px -24px rgba(20,23,45,.35);animation:pop .3s cubic-bezier(.2,.9,.3,1.2)}
.tick{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#3b8dff);display:grid;place-items:center;margin:0 auto 18px;color:#fff;font-size:26px;box-shadow:0 10px 30px -8px rgba(124,92,255,.5)}
h1{font-size:22px;margin:0 0 8px;letter-spacing:-.02em}.sub{color:#666d85;font-size:14.5px;line-height:1.55;margin:0 0 26px}
.go{display:inline-block;padding:13px 26px;border-radius:12px;background:linear-gradient(135deg,#7c5cff,#3b8dff);color:#fff;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 10px 30px -8px rgba(124,92,255,.5)}
@keyframes pop{from{opacity:0;transform:scale(.94) translateY(10px)}to{opacity:1;transform:none}}</style></head>
<body><div class="card"><div class="tick">✓</div><h1>Session connected</h1>
<p class="sub">Your Cowork session is attached to <b>${name}</b> — credentials, memory and artifacts are scoped and ready. You can return to your session, or follow the project in appbuilder.</p>
<a class="go" href="${appUrl}">Continue to ${name} →</a></div></body></html>`;
  };
  try {
    loop = createServer((rq, rs) => { const q = new URL(rq.url, "http://x").searchParams; rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end(successPage(q)); approvedPing(); });
    await new Promise((res, rej) => { loop.once("error", rej); loop.listen(0, "127.0.0.1", res); });
    redirectUri = `http://127.0.0.1:${loop.address().port}/cb`;
  } catch { loop = null; }

  const r = await fetch(b + "/device/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirectUri }) });
  const start = await r.json();
  if (!r.ok) { loop?.close(); throw new Error(`device start failed (${r.status}): ${start.error || "unknown"}`); }

  (onVerify || ((url) => {
    console.log(`\n➜ Open this link to connect (sign in, pick your project):\n  ${url}\n`);
    if (openBrowser) { const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"; try { spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref(); } catch {} }
  }))(start.verifyUrl);

  const deadline = Date.now() + (start.expiresInSec || 900) * 1000;
  const interval = pollMs || (start.intervalSec || 3) * 1000;
  try {
    while (Date.now() < deadline) {
      const pr = await fetch(b + "/device/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: start.code }) });
      const j = await pr.json();
      if (pr.ok && j.status === "approved") return { mode: j.mode, config: j.config };
      if (!pr.ok) throw new Error(`poll failed (${pr.status}): ${j.error || "unknown"}`); // 404/410 = code gone — restart, don't spin
      await new Promise((res) => { const t = setTimeout(res, interval); approvedPing = () => { clearTimeout(t); res(); }; }); // loopback hit → poll immediately
    }
    throw new Error("connect timed out — re-run setup to get a fresh link");
  } finally { loop?.close(); }
}

// pull the NEWEST global + project memory from the control plane and materialize it as
// MEMORY-REMOTE.md — every session starts with the server's canon, not just the plugin-shipped file.
// Non-fatal: a failed sync never blocks connecting.
export async function syncMemory(config, outPath = "MEMORY-REMOTE.md") {
  try {
    const r = await fetch((config.controlPlaneUrl || "") + "/memory/sync", { headers: { Authorization: `Bearer ${config.apiToken}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    writeFileSync(outPath, j.md);
    return { counts: j.counts, outPath };
  } catch (e) { console.error(`memory sync skipped (${e.message})`); return null; }
}

// POSIX single-quote a value so `source .kf-env` treats it as pure DATA, never code. Inside single
// quotes the shell expands nothing — no $(), no backticks, no $VAR, no glob; the one character that
// can end the quote is `'` itself, escaped by the standard '\'' idiom. This is the whole fix for the
// injection: values were interpolated bare (or JSON-quoted, which is DOUBLE quotes — where $() still
// runs), and the setup flow sources the file, so a control-plane value like a project named
// `$(curl … | sh)` executed on the operator's machine. (2026-08-17, #7)
export const shq = (v) => `'${String(v == null ? "" : v).replace(/'/g, "'\\''")}'`;
// A newline or NUL in a value would let content spill onto its own line as a new statement even
// through quoting edge cases across shells — reject rather than sanitize, so a poisoned value fails
// loud at write time instead of silently truncating a secret.
const assertClean = (name, v) => { if (v != null && /[\n\r\0]/.test(String(v))) throw new Error(`writeEnv: ${name} contains a newline/NUL — refusing to write an injectable .kf-env`); };

// INVERSE of shq() — decode ONE RHS the way `source .kf-env` would (#6 reader parity). The writer
// serializes with the POSIX `'\''` idiom, so a value like `ab'cd` is written `'ab'\''cd'`; a naive
// "strip one matching pair of surrounding quotes" reader returns `ab'\''cd`. This walks the value as
// the shell does — concatenating single-quoted (literal), double-quoted (with \-escapes), and bare
// runs — so JS readers see exactly what a sourced shell sees. Exported so every reader shares it.
export function unquoteEnvValue(raw) {
  const s = String(raw ?? "");
  let out = "", i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {                                   // single-quoted: everything literal until the next '
      const end = s.indexOf("'", i + 1);
      if (end === -1) { out += s.slice(i + 1); break; } // unterminated — take the rest, don't drop data
      out += s.slice(i + 1, end); i = end + 1;
    } else if (ch === '"') {                            // double-quoted: \ escapes ", \, $, ` (shell subset)
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) { out += s[i + 1]; i += 2; }
        else { out += s[i]; i++; }
      }
      i++;
    } else if (ch === "\\") {                           // bare backslash escapes the next char (the '\''  bridge)
      if (i + 1 < s.length) { out += s[i + 1]; i += 2; } else i++;
    } else { out += ch; i++; }
  }
  return out;
}

// Parse a whole .kf-env's text into {NAME: value}, decoding each RHS with unquoteEnvValue. One shared
// implementation so the chat server, worker, and any tooling read the writer's output identically.
export function parseEnvText(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n")) {
    if (/^\s*#/.test(line) || !line.trim()) continue;   // skip comments / blanks
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = unquoteEnvValue(m[2].trim());
  }
  return out;
}

// write the scoped config into the plugin's runtime env (the .kf-env the pipeline sources).
export function writeEnv(config, envPath = ".kf-env") {
  const k = config.kissflow || {};
  const u = config.user || {};
  // name → value pairs; every value goes through shq() below, so the ORDER and NAMES are unchanged
  // from before — only the quoting is. Downstream tooling reads the same variables.
  const pairs = [
    ["KF_PROJECT_ID", config.projectId],
    ["KF_PROJECT_NAME", config.projectName || ""],   // the working context — agents anchor app naming to this
    ["KF_ROLE", config.role],
    ["KF_USER_ID", u.sub || ""],                      // who connected — for version/memory attribution
    ["KF_USER_EMAIL", u.email || ""],
    ["CONTROL_PLANE_URL", config.controlPlaneUrl || ""],
    ["KF_API_TOKEN", config.apiToken || ""],          // project-scoped bearer
    ["KF_MEM_STORE", config.memStore],
    ["KF_MEM_ORG", config.memOrg],
    ["KF_GCS_BUCKET", config.gcs?.bucket],
    ["KF_GCS_PREFIX", config.gcs?.prefix],
    ["KF_TARGET", k.target || "dev"],
  ];
  // Configured means ALL FOUR values present — a partial payload written as blank exports poisons
  // the shell ("KISSFLOW_API_KEY must be set" with a .kf-env that LOOKS populated; capex 2026-07-14).
  const credsOk = k.configured !== false && k.subdomain && k.accountId && k.apiKey && k.apiSecret;
  if (credsOk) pairs.push(
    // canonical engine names + KF_* scaffold aliases + legacy unprefixed (older tooling read these)
    ["KISSFLOW_SUBDOMAIN", k.subdomain], ["KISSFLOW_ACCOUNT_ID", k.accountId],
    ["KISSFLOW_API_KEY", k.apiKey], ["KISSFLOW_API_SECRET", k.apiSecret],
    ["KF_ACCOUNT_ID", k.accountId], ["KF_ACCESS_KEY_ID", k.apiKey], ["KF_ACCESS_KEY_SECRET", k.apiSecret],
    ["ACCOUNT_ID", k.accountId], ["API_KEY", k.apiKey], ["API_SECRET", k.apiSecret],
  );
  for (const [name, v] of pairs) assertClean(name, v);
  const lines = [
    `# generated by connect.mjs — project ${config.projectName} (${config.projectId}), role ${config.role}${u.email ? `, user ${u.email}` : ""}`,
    ...pairs.map(([name, v]) => `export ${name}=${shq(v)}`),
  ];
  if (!credsOk) lines.push(
    `# ⚠ Kissflow dev creds NOT delivered for this project — link a dev environment to it in the`,
    `# appbuilder (project page → Dev environment), then reconnect: node engine/connect.mjs --auto`,
  );
  // atomic + 0600: the file holds admin secrets, so it must never be group/world readable and must
  // never be observed half-written. Write to a temp sibling with restrictive mode, then rename.
  const tmp = `${envPath}.tmp-${process.pid}`;
  writeFileSync(tmp, lines.join("\n") + "\n", { mode: 0o600 });
  try { renameSync(tmp, envPath); } catch (e) { try { rmSync(tmp, { force: true }); } catch {} throw e; }
  try { chmodSync(envPath, 0o600); } catch {}   // rename preserves tmp's mode; belt-and-suspenders if the fs didn't
  return envPath;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const a = process.argv.slice(2);
  const flag = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const base = flag("--base"); const envPath = flag("--env") || ".kf-env";
  const bareToken = a.find((x) => !x.startsWith("--"));
  // remember what the env pointed at BEFORE this connect — switching projects is a normal,
  // fully automatic operation, but it must be LOUD (and flag a stale runs/current, which still
  // belongs to the previous project and would cross-publish its artifacts).
  let prev = null;
  try { const m = readFileSync(envPath, "utf8").match(/^export KF_PROJECT_ID=(\S+)$/m); if (m) prev = m[1]; } catch {}
  const { mode, config } = a.includes("--auto") || (!bareToken && !a.includes("--new"))
    ? await connectAuto({ base })
    : await connect(a.includes("--new")
        ? { mode: "create", appName: flag("--new"), identity: flag("--identity"), base }
        : { token: bareToken, base });
  writeEnv(config, envPath);
  const mem = await syncMemory(config);
  console.log(`✔ ${mode}: ${config.projectName} (${config.projectId}) as ${config.role}${config.user?.email ? ` (${config.user.email})` : ""}`);
  if (prev && prev !== config.projectId) {
    console.log(`  ↷ switched project: ${prev} → ${config.projectId} (.kf-env replaced — no action needed)`);
    try {
      const { existsSync: ex } = await import("node:fs");
      if (ex("runs/current"))
        console.log(`  ⚠ runs/current still belongs to ${prev} — start the new app with /author-brief (or runs.mjs new/use) BEFORE building or publishing, or its artifacts would land in ${config.projectId}.`);
    } catch {}
  }
  console.log(`  env → ${envPath} · memory org ${config.memOrg} · artifacts gs://${config.gcs.bucket}/${config.gcs.prefix}`);
  if (mem) console.log(`  memory → ${mem.outPath} (${mem.counts.global} global + ${mem.counts.project} project entries, fresh from the server)`);
  console.log(`  next: source ${envPath} && /author-app "<requirement>"`);
}
