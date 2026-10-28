// session-core.mjs — what a chat session IS, independent of where the build runs.
//
// Everything here mutates a session object or resolves a path inside its run directory. It is
// deliberately free of HTTP, of the sessions Map, of the database and of the child process: those are
// the host's concerns (app.mjs today; a session pod's agent tomorrow), and the whole point of this
// module is that BOTH hosts get identical semantics from ONE copy.
//
// The rule that makes it work: nothing in here reaches for an ambient `emit` or `persist`. A caller
// hands in a `ctx` — the event sink and the snapshot writer — so the same marker handling can fan out
// to in-process SSE clients or append to a durable event log without the logic knowing which.
//
//   createSessionCore({ repoRoot })  →  path helpers + session mutators bound to that checkout

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app";

export function titleFrom(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 64 ? t.slice(0, 63) + "…" : t || "New app";
}

/** The persisted shape. Anything NOT in here dies with the process — by design (clients, watchers). */
export function snapshotOf(s) {
  // workerToken persists so a control-plane restart does not orphan a live session pod — the pod's
  // polls would 403 against a token that no longer exists anywhere.
  // turnId/turnAttempts persist so an INTERRUPTED turn is recoverable. Without them a redeploy in the
  // middle of a build left no trace it had been running: hydrate() comes back not-busy and the user
  // message is already marked consumed, so neither the session nor drainQueue knew anything was owed,
  // and the build simply waited for a human to notice and say something. finishTurn clears both.
  // artifactDigest persists so the version dedupe survives a restart. Held only in memory it would
  // be empty on the next instance, and the first turn after any redeploy would mint a duplicate
  // version of artifacts that had not changed — the exact thing the dedupe exists to stop.
  // prototypeExpected persists so a build interrupted AFTER announcing its prototype (but before writing
  // one) still owes it on resume — otherwise the redeploy would let a shell-less failed build finish green.
  // spendPrev/spendUsd/usageTotals persist so cost accounting survives a restart. spendPrev is the last
  // CUMULATIVE reading; without it, the next turn's cumulative cost is mistaken for a full fresh delta and
  // spend double-counts. spendUsd/usageTotals keep the UI totals from resetting to zero on reload.
  const { id, slug, title, createdAt, claudeSessionId, messages, preview, blueprint, runtime, app, prompt, projectId, workerToken, turnId, turnAttempts, artifactDigest, prototypeExpected, ownerSub, lastTurnVerdict, readyVersionId, spendPrev, spendUsd, usageTotals } = s;
  return { id, slug, title, createdAt, claudeSessionId, messages, preview, blueprint, runtime, app, prompt, projectId, workerToken, turnId, turnAttempts, artifactDigest, prototypeExpected, ownerSub, lastTurnVerdict, readyVersionId, spendPrev, spendUsd, usageTotals };
}

/** Inflate a stored snapshot into a live session. The runtime-only fields start empty every time. */
export const hydrate = (d) => ({ ...d, messages: d.messages || [], clients: new Set(), events: [], seq: 0, phase: null, status: null, busy: false, conductor: null, watcher: null });

/**
 * An app's chat is SHARED: every member of the app talks in the same conversation and sees the whole
 * history, including turns taken before they joined. So a user message is not "the user" — it is a
 * particular person, and the transcript has to say which. Anything that renders history without an
 * author reads as though one person said all of it.
 *
 * `author` is {sub, email, name}; null only for messages synthesized by the server itself (the adopt
 * recap), which render unattributed on purpose.
 */
export function appendUser(s, text, author, { addressed = true } = {}) {
  s.messages.push({
    role: "user", text, ts: Date.now(),
    author: author ? { sub: author.sub, email: author.email || null, name: author.name || null } : null,
    // `addressed` is the difference between an instruction and something the builder merely overheard.
    // `consumedBy` names the turn that absorbed it — unconsumed messages are what the NEXT turn carries,
    // which is what makes staying silent safe rather than lossy.
    addressed, consumedBy: null,
  });
}

/** Who said it, for a prompt line or a bubble. Falls back to email, then to a neutral noun. */
export const speakerName = (author) => author?.name || author?.email || "a member";

// Assistant prose arrives as deltas; keep ONE message record per turn and append, so a reload shows
// the same paragraph the streaming client saw.
export function appendAssistant(s, text) {
  // Search BACKWARDS for the open assistant message (same rule appendAgent already uses) rather than
  // only checking the last row. An agent row landing mid-turn used to break the chain — the very next
  // prose delta started a NEW assistant message, so a reload replayed the conductor's sentence split
  // in half around the agent's card, sometimes mid-word ("Tr" / "ade Marketing…"). One open assistant
  // message per turn is the invariant; closeAssistant() still seals it at turn end.
  const last = [...s.messages].reverse().find((m) => m.role === "assistant" && m.open);
  if (last) last.text += text;
  else s.messages.push({ role: "assistant", text, ts: Date.now(), open: true });
}

export function closeAssistant(s) {
  for (const m of s.messages) if (m.open) { delete m.open; m.text = m.text.replace(/\s+$/, ""); }
}

// One transcript entry per specialist per turn, so a reload replays the same conversation the user
// watched: the design director, the builders and the reviewer each keep their own voice.
export function appendAgent(s, name, text) {
  const last = [...s.messages].reverse().find((m) => m.role === "agent" && m.name === name && m.open);
  if (last) last.text += text;
  else s.messages.push({ role: "agent", name, text, ts: Date.now(), open: true });
}

export function createSessionCore({ repoRoot, runsDir }) {
  const REPO = repoRoot;
  // `runsDir` overrides where builds land. Tests point it at a temp directory — they used to create
  // sessions in the real runs/, leaving dozens of empty directories behind in someone's working tree.
  // The session pod will use it too: its workspace is a mounted volume, not a folder inside the repo.
  const RUNS = runsDir || join(REPO, "runs");

  // ── run-dir helpers ─────────────────────────────────────────────────────────────────────────────
  const runDir = (s) => join(RUNS, s.slug);
  // Artifact paths are recorded as "runs/<slug>/…" — a STABLE name, not a filesystem fact. When RUNS
  // is relocated (tests, a pod's mounted workspace) the literal join(REPO, rel) stops matching, and
  // worse, relative(REPO, absUnderRelocatedRuns) produces an ../../…-escaping path that gets PERSISTED.
  // These two are the only translation between the recorded name and the disk.
  const relToAbs = (rel) => String(rel).startsWith("runs/") ? join(RUNS, String(rel).slice(5)) : join(REPO, String(rel));
  // A marker path is written by the CONDUCTOR (a model), so it is untrusted (#4). It must resolve —
  // through any symlinks — to a real file INSIDE this session's own run directory. Otherwise a
  // prompt-injected `<<KF:preview ../../.kf-env>>` (or an absolute path, or a symlink pointing out)
  // could expose repository/container files through the authenticated preview/blueprint routes. Returns
  // the contained relative path, or null to reject.
  const withinRun = (s, rel) => {
    try {
      const abs = relToAbs(rel);
      if (!existsSync(abs)) return null;
      const real = realpathSync(abs);                 // follow symlinks: the REAL target is what matters
      if (!statSync(real).isFile()) return null;      // a DIRECTORY marker would widen the preview root — files only (#4)
      const base = realpathSync(runDir(s));
      if (real !== base && !real.startsWith(base + sep)) return null;   // escaped the run dir
      return absToRel(real);                          // re-derive the recorded name from the contained real path
    } catch { return null; }
  };
  const absToRel = (abs) => {
    const r = relative(RUNS, abs);
    return r && !r.startsWith("..") ? join("runs", r) : relative(REPO, abs);
  };
  const partsDir = (s) => join(runDir(s), "prototype", "parts");

  function rolesBuilt(s) {
    try {
      return readdirSync(partsDir(s)).filter((f) => /^role-.+\.html$/.test(f)).map((f) => f.replace(/^role-|\.html$/g, ""));
    } catch { return []; }
  }

  /** The blueprint: what the conductor declared, else the review page sitting in the run directory. */
  function resolveBlueprint(s) {
    // RE-VALIDATE the persisted marker (#4) — a value written before the ingestion check, or by any
    // other path, must not be trusted on mere existence; it must still resolve to a file in this run.
    if (s.blueprint) { const ok = withinRun(s, s.blueprint); if (ok) return ok; }
    for (const f of ["review.html", "blueprint.html"]) {
      const rel = join("runs", s.slug, f);
      if (existsSync(relToAbs(rel))) return rel;
    }
    return null;
  }

  /** Where the preview lives: what the conductor declared, else the newest assembled prototype. */
  function resolvePreview(s) {
    if (s.preview) { const ok = withinRun(s, s.preview); if (ok) return relToAbs(ok); }   // re-validate persisted marker (#4)
    const candidates = ["prototype/index.html", "prototype-dl/index.html", "prototype-par/index.html"]
      .map((p) => join(runDir(s), p)).filter(existsSync);
    if (!candidates.length) return null;
    candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return candidates[0];
  }

  function readAppMeta(dir) {
    try {
      const spec = JSON.parse(readFileSync(join(dir, "prototype", "experience-spec.json"), "utf8"));
      return {
        app: spec.app || null, domain: spec.domain || null,
        roles: (spec.roles || []).map((r) => r.role || r.name).filter(Boolean),
        pages: (spec.pages || []).map((p) => p.title || p.id).filter(Boolean),
      };
    } catch { return null; }
  }

  // The app's real Kissflow URL, if this run has actually been authored — parsed out of live.md rather
  // than re-deriving it, since that file is the one place the conductor records the ids it created.
  function findRuntimeUrl(dir) {
    let md;
    try { md = readFileSync(join(dir, "live.md"), "utf8"); } catch { return null; }
    const m = md.match(/https:\/\/[^\s)]+\.kissflow\.com\/view\/application\/[^\s)]+/);
    if (m) return m[0];
    // No ready-made link. live.md still RECORDS the app — id and subdomain, just on separate lines —
    // so rebuild the URL rather than reporting an app that demonstrably exists as "not built in
    // Kissflow yet". The conductor is supposed to emit a <<KF:runtime>> marker and does not always,
    // and a build whose whole record says it succeeded should not hinge on that one line.
    const app = md.match(/App id\**:?\s*`?([A-Za-z0-9_]+_A\d{2})`?/i) || md.match(/`([A-Za-z0-9_]+_A\d{2})`/);
    const host = md.match(/([a-z0-9-]+\.kissflow\.com)/i);
    return app && host ? `https://${host[1]}/view/application/${app[1]}` : null;
  }

  // ── version history ─────────────────────────────────────────────────────────────────────────────
  // Every rebuild overwrites the canonical file in place — there was no way to look at what the app
  // looked like two iterations ago. Each time preview/blueprint updates, the CURRENT content is copied
  // into a versions/ folder alongside it, named by a sortable timestamp; the dropdown in the UI lists
  // these. "Latest" always tracks the live file; picking an older entry shows a frozen snapshot.
  const versionsDirFor = (kind, s) => kind === "blueprint" ? join(runDir(s), "versions", "blueprint") : join(runDir(s), "prototype", "versions");
  const tsName = () => new Date().toISOString().replace(/[:.]/g, "-") + ".html";

  function snapshotVersion(kind, s, absFile) {
    try {
      const dir = versionsDirFor(kind, s);
      mkdirSync(dir, { recursive: true });
      const content = readFileSync(absFile);
      const existing = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
      const last = existing[existing.length - 1];
      if (last && readFileSync(join(dir, last)).equals(content)) return; // identical rebuild — don't pad the list
      writeFileSync(join(dir, tsName()), content);
      if (existing.length + 1 > 40) { // cap history so a long session doesn't accumulate forever
        for (const f of existing.slice(0, existing.length + 1 - 40)) { try { unlinkSync(join(dir, f)); } catch {} }
      }
    } catch { /* versioning must never break the live artifact */ }
  }

  function listVersions(kind, s) {
    const dir = versionsDirFor(kind, s);
    try {
      return readdirSync(dir).filter((f) => f.endsWith(".html")).sort().reverse()
        .map((f) => ({ file: f, mtime: statSync(join(dir, f)).mtimeMs }));
    } catch { return []; }
  }

  // ── adopting an existing run ────────────────────────────────────────────────────────────────────
  // A run built in the terminal (or a prior chat) has no conversation behind it. Opening it cold — an
  // empty chat next to a finished app — gives the user nothing to react to. Synthesize a short recap
  // from what's actually on disk plus a few concrete next moves.
  function synthesizeAdoptHistory(s) {
    const dir = runDir(s);
    const meta = readAppMeta(dir);
    const hasBlueprint = !!resolveBlueprint(s);
    const hasRuntime = !!findRuntimeUrl(dir);
    const name = (meta && meta.app) || s.slug;

    const lines = [`**${name}**${meta && meta.domain ? ` — ${meta.domain}` : ""}.`];
    if (meta && meta.roles.length) lines.push(`${meta.roles.length} role${meta.roles.length === 1 ? "" : "s"}: ${meta.roles.join(", ")}.`);
    if (meta && meta.pages.length) lines.push(`${meta.pages.length} page${meta.pages.length === 1 ? "" : "s"}: ${meta.pages.slice(0, 6).join(", ")}${meta.pages.length > 6 ? "…" : ""}.`);
    lines.push(hasRuntime ? "Already live in Kissflow, running its own custom UI."
      : hasBlueprint ? "Blueprint is ready but it hasn't been built in Kissflow yet."
      : "Prototype only so far — no blueprint or live Kissflow app yet.");
    lines.push("Picking up from here — say what to change, or try one of these:");

    const suggestions = [];
    if (!hasBlueprint) suggestions.push("Generate the blueprint so I can review the data model");
    if (hasBlueprint && !hasRuntime) suggestions.push("Build it for real in Kissflow");
    if (meta && meta.roles.length) suggestions.push(`Add a new role alongside ${meta.roles[0]}`);
    suggestions.push("Change the visual identity — palette, density, shell");
    if (meta && meta.pages.length) suggestions.push(`Rework the ${meta.pages[0]} page's layout`);

    s.messages.push({ role: "assistant", text: lines.join(" "), ts: Date.now() });
    s.messages.push({ role: "suggestions", items: suggestions.slice(0, 4), ts: Date.now() });
  }

  /**
   * The per-turn SESSION block — paths and state the builder must not have to guess.
   *
   * `speaker` matters because the chat is shared: several people work on one app in one conversation,
   * so "what you asked for earlier" is ambiguous unless the builder knows which of them is talking now.
   */
  function sessionBlock(s, first, author) {
    const roles = rolesBuilt(s);
    const who = author ? (author.name || author.email || null) : null;
    return [
      "SESSION",
      `run dir: runs/${s.slug}`,
      `preview file: runs/${s.slug}/prototype/index.html`,
      `roles built: ${roles.length ? roles.join(", ") : "none yet"}`,
      `turn: ${first ? "1 (first — build a previewable page this turn)" : s.messages.filter((m) => m.role === "user").length}`,
      ...(who ? [`speaker: ${who} (one of several members on this app — the chat is shared)`] : []),
      "---",
    ].join("\n");
  }

  /**
   * Markers are the builder's control channel into the UI. `ctx` supplies the three host-owned verbs:
   *   emit(session, type, data)   — publish an event (SSE fan-out here, an event log elsewhere)
   *   persist(session)            — write the session snapshot
   *   onPreview(session)          — the host may want to (re)attach a file watcher; optional
   */
  function onMarker(s, { kind, value, from }, ctx) {
    const { emit, persist, onPreview } = ctx;
    switch (kind) {
      case "phase": {
        const [name, detail] = value.split("|").map((x) => x.trim());
        s.phase = name || null;
        // The Author phase IS the runtime build. Recording it on the SESSION — not just as a transient
        // event — is what lets a reload (which opens the stream at the current seq and never replays
        // old phase events) still know the app is being authored. Without this the Preview tab showed
        // "Not built in Kissflow yet" with a live Generate button DURING authoring, and a second click
        // would have queued a second authoring run against a half-built app.
        if (name === "Author") { s.generating = true; persist(s); }
        emit(s, "phase", { name: s.phase, detail: detail || null });
        return;
      }
      // A bare `<<KF:status>>` parses to an empty value; emitting it would build a contentless
      // activity block in the chat (an empty bordered box between two messages), so drop it here.
      case "status": { const t = (value || "").trim(); if (!t) return; s.status = t; emit(s, "status", { text: t }); return; }
      // Intake questions and the quick/comprehensive choice. Kept on the session so a reload (or a
      // second browser tab) still shows the buttons the builder is waiting on.
      case "ask": case "plan": {
        let payload;
        try { payload = JSON.parse(value); } catch {
          emit(s, "log", { text: `malformed ${kind} payload — asking in prose instead` });
          return;
        }
        s.prompt = { kind, payload };
        persist(s);
        emit(s, kind, { payload });
        return;
      }
      case "app": s.app = value; persist(s); emit(s, "app", { text: value }); return;
      case "preview": {
        const contained = withinRun(s, value.replace(/^\.?\//, ""));
        if (!contained) { emit(s, "log", { text: `preview marker rejected — missing, or escapes the run directory: ${value.slice(0, 80)}` }); return; }
        s.preview = contained; persist(s); onPreview?.(s);
        emit(s, "preview", { path: contained, token: Date.now() });
        return;
      }
      // The blueprint (engine/review.mjs output) is generated in parallel with the prototype: same run,
      // different question — "is the app RIGHT" rather than "does it feel right".
      case "blueprint": {
        const contained = withinRun(s, value.replace(/^\.?\//, ""));
        if (!contained) { emit(s, "log", { text: `blueprint marker rejected — missing, or escapes the run directory: ${value.slice(0, 80)}` }); return; }
        s.blueprint = contained; persist(s);
        emit(s, "blueprint", { path: contained, token: Date.now() });
        return;
      }
      // The real thing: the app authored in Kissflow with its custom UI deployed. Every Kissflow app page
      // sends X-Frame-Options: SAMEORIGIN, so this is never an iframe src — the Preview tab's whole job
      // once this fires is a working "Open the app" link, not an attempted embed.
      case "runtime": {
        if (!/^https:\/\//.test(value)) { emit(s, "log", { text: `runtime marker needs an https URL, got: ${value.slice(0, 60)}` }); return; }
        s.runtime = value; persist(s);
        emit(s, "runtime", { url: value });
        return;
      }
      // `building <artifact>` marks a tab in-progress; `building <artifact>|<step>` also appends a step to
      // that tab's live progress list. Subagents emit these too (the blueprint agent narrates its own tab),
      // which is why markers are parsed out of forwarded agent text as well as the builder's.
      case "building": {
        const [art, step] = value.split("|").map((x) => x.trim());
        const artifact = String(art || "").toLowerCase();
        if (!["prototype", "blueprint", "runtime"].includes(artifact)) { emit(s, "log", { text: `unknown artifact: ${art}` }); return; }
        // A runtime step is proof the app is being authored — same persisted signal as phase Author,
        // because subagents emit these even when the conductor never fired the phase marker.
        if (artifact === "runtime" && !s.generating) { s.generating = true; persist(s); }
        // STRUCTURED TURN INTENT (#6). The moment a prototype build is announced, this turn OWES a
        // prototype — so a build that fails after the spec/review but before it ever writes a shell is a
        // failure, not a Q&A turn. Persisted so finalization can require the artifact independent of what
        // files happen to be on disk. (Reset at turn start.)
        if (artifact === "prototype" && !s.prototypeExpected) { s.prototypeExpected = true; persist(s); }
        emit(s, "building", { artifact, step: step || null, from: from || null });
        return;
      }
      case "done": s.phase = "Done"; s.status = null; emit(s, "phase", { name: "Done" }); return;
      default: emit(s, "log", { text: `unknown marker: ${kind} ${value}` });
    }
  }

  /**
   * Turn bookkeeping that has to happen wherever the build runs: close the streamed paragraph, adopt a
   * preview that appeared without a marker, and freeze ONE version per completed turn (a build's own
   * --partial re-assembles aren't separate versions).
   */
  function finishTurn(s, r, ctx) {
    const { emit, persist, onPreview } = ctx;
    s.busy = false; s.thinkingShown = false; s.generating = false;
    s.turnId = null; s.turnAttempts = 0;   // the turn landed — nothing to recover on the next boot
    closeAssistant(s);
    if (!s.preview) {
      const f = resolvePreview(s);
      if (f) { s.preview = absToRel(f); onPreview?.(s); emit(s, "preview", { path: s.preview, token: Date.now() }); }
    }
    if (r.ok) {
      const proto = resolvePreview(s); if (proto) snapshotVersion("prototype", s, proto);
      const bp = resolveBlueprint(s); if (bp) snapshotVersion("blueprint", s, relToAbs(bp));
    }
    persist(s);
  }

  return {
    REPO, RUNS, relToAbs, absToRel,
    runDir, partsDir, rolesBuilt, resolveBlueprint, resolvePreview, readAppMeta, findRuntimeUrl,
    versionsDirFor, snapshotVersion, listVersions,
    synthesizeAdoptHistory, sessionBlock, onMarker, finishTurn,
  };
}
