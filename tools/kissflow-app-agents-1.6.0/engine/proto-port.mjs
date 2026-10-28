// proto-port.mjs — turn an approved prototype page into a PORT BRIEF for a runtime page agent.
//
//   node proto-port.mjs <run-dir> <pageId>
//
// Quick mode already produced a finished, reviewed UI: the prototype settled every layout decision,
// widget choice, column set, aggregation and label, and the user signed off on it. Regenerating the
// runtime page from the spec throws all of that away — the agent re-reads the catalog, re-picks
// widgets, re-words headings — and the live app ends up recognisably a different product from the
// one that was approved (observed on hire-onboard, 2026-08-02).
//
// So the runtime agent should PORT, not redesign. This file assembles everything that port needs:
//   · the prototype markup + renderer for that one page          (proto-extract)
//   · SEED collection -> live Kissflow flow id, type             (app-spec + id-map)
//   · seed record key -> real Kissflow field name + type         (matched, with confidence)
//   · the primitive each prototype pattern becomes               (starter/src/components/kf)
// Everything the brief cannot resolve deterministically is listed as UNRESOLVED rather than guessed,
// because a confident-but-wrong field name fails silently at runtime as an empty column.

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import vm from "node:vm";
import { extractPage } from "./proto-extract.mjs";
import { ensureWorkspace } from "./proto-react.mjs";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const singular = (s) => s.replace(/ies$/, "y").replace(/s$/, "");
const initials = (s) => String(s || "").split(/[\s_-]+/).filter(Boolean).map((w) => w[0].toLowerCase()).join("");

export function readPrototype(dir) {
  const index = join(dir, "prototype", "index.html");
  if (existsSync(index)) return readFileSync(index, "utf8");
  const parts = join(dir, "prototype", "parts");
  if (existsSync(parts) && statSync(parts).isDirectory())
    return readdirSync(parts).filter((f) => f.endsWith(".html")).map((f) => readFileSync(join(parts, f), "utf8")).join("\n");
  return null;
}

/** window.SEED / window.ROLES are JS object literals, not JSON — evaluate them in a bare sandbox */
export function readGlobals(html) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const name of ["SEED", "ROLES"]) {
    const m = new RegExp(`window\\.${name}\\s*=\\s*`).exec(html);
    if (!m) continue;
    const end = html.indexOf("</script>", m.index);
    try { vm.runInContext(`window.${name} = ${html.slice(m.index + m[0].length, end).replace(/;\s*$/, "")};`, ctx, { timeout: 2000 }); }
    catch { /* a malformed literal just means that half of the brief is thinner */ }
  }
  return ctx.window;
}

/** match one seed record key to a Kissflow field, reporting how sure we are */
function matchField(key, fields) {
  const k = norm(key);
  const exact = fields.find((f) => norm(f.name) === k);
  if (exact) return { field: exact, confidence: "exact" };
  // A prototype-local row id is not a business field; and a 1–2 character key produces nonsense
  // substring hits ("id" matches "Cand-id-ate"), which is worse than no match because it reads as
  // an answer. Below three characters, only the initials rule may claim a match.
  if (k === "id") return { field: null, confidence: "unresolved", note: "prototype row id — use `_id`" };
  const sub = k.length < 3 ? [] : fields.filter((f) => norm(f.name).includes(k) || k.includes(norm(f.name)));
  if (sub.length === 1) return { field: sub[0], confidence: "likely" };
  if (sub.length > 1) return { field: null, confidence: "ambiguous", candidates: sub };
  const init = fields.filter((f) => initials(f.name) === k && k.length >= 2);
  if (init.length === 1) return { field: init[0], confidence: "likely" };
  return { field: null, confidence: "unresolved" };
}

/** match a SEED collection to a flow in the spec, and to its live id */
function matchFlow(collection, flows, idMap) {
  const c = norm(singular(collection));
  const flow = flows.find((f) => norm(f.name) === c) || flows.find((f) => norm(f.name).includes(c) || c.includes(norm(f.name)));
  if (!flow) return null;
  const gen = `${flow.name.replace(/\s+/g, "_")}_A00`;
  return { ...flow, liveId: idMap?.genToServer?.[gen] || gen };
}

// ── React prototype ────────────────────────────────────────────────────────────────────────────
// A React run's prototype is NOT hand-rolled HTML with a `window.SEED` scrape — it is real React on
// `@/components/kit`, the SAME components the deploy build compiles, with data read through
// `useFlow(TYPE, FLOW_ID)` (offline mock in preview, real SDK live). So "porting" a React page is not a
// redesign at all: the page is already the approved, deployable source. The only thing that differs
// between preview and live is the flow id — the prototype carries the deterministic gen id
// (`idify(name)_A00`, e.g. `Expense_Claim_A00`), which is exactly the key `id-map.json`'s `genToServer`
// is indexed by. Deploy therefore REUSES the page verbatim and rewrites only those id constants.

/** Read a React prototype: proto.json (nav + seed) + the agent's page sources. null if this isn't one. */
export function reactPrototype(runDir) {
  const protoFile = join(runDir, "prototype", "proto.json");
  const pagesDir = join(runDir, "prototype", "pages");
  if (!existsSync(protoFile) || !existsSync(pagesDir) || !statSync(pagesDir).isDirectory()) return null;
  const files = readdirSync(pagesDir).filter((f) => f.endsWith(".jsx"));
  if (!files.length) return null;
  let proto = {};
  try { proto = JSON.parse(readFileSync(protoFile, "utf8")); } catch { /* a malformed proto.json still lets pages port */ }
  const pages = files.map((f) => ({ id: f.replace(/\.jsx$/, ""), file: f, source: readFileSync(join(pagesDir, f), "utf8") }));
  return { proto, pages };
}

// A gen flow id in ANY string delimiter — double, single, OR template literal. Missing the backtick let
// `useFlow(`Flow_A00`)` deploy unremapped and undetected, breaking the fail-closed guarantee (Codex #6).
const GEN_ID = /["'`]([A-Za-z0-9_]+_A\d{2})["'`]/g;
// A gen-id-shaped token anywhere (no delimiter required) — used ONLY to fail closed: after remapping, any
// referenced gen id that is not a known live id must be caught, whatever quoting the agent used.
const GEN_ID_TOKEN = /\b([A-Za-z0-9_]+_A\d{2})\b/g;

/**
 * Port ONE React page source to the live app: rewrite every gen flow-id constant it carries to the
 * server id from `id-map.json` (`genToServer`). String-replacement, longest-key-first — the same
 * discipline client.mjs#remap uses on draft blobs, so a gen id that is a prefix of another can't be
 * partially rewritten. Returns the ported source, what was remapped, and any gen id the map didn't
 * resolve (which is not an error: with no reassignment the gen id already equals the live id).
 */
export function portReactSource(source, idMap) {
  const map = (idMap && idMap.genToServer) || {};
  const remaps = [];
  let out = source;
  for (const [gen, srv] of Object.entries(map).sort((a, b) => b[0].length - a[0].length)) {
    if (!srv || gen === srv) continue;
    let hit = false;
    for (const q of ['"', "'", "`"]) { const n = `${q}${gen}${q}`; if (out.includes(n)) { out = out.split(n).join(`${q}${srv}${q}`); hit = true; } }
    if (hit) remaps.push({ from: gen, to: srv });
  }
  // Referenced gen ids in any DELIMITED position, plus a fail-closed sweep for a gen-shaped token left
  // ANYWHERE after remap that the map didn't resolve — so an un-quoted or oddly-quoted id can't slip live.
  const referenced = [...new Set([...source.matchAll(GEN_ID)].map((m) => m[1]))];
  const liveIds = new Set(Object.values(map));
  const stray = [...new Set([...out.matchAll(GEN_ID_TOKEN)].map((m) => m[1]))].filter((t) => !map[t] && !liveIds.has(t));
  const unresolved = [...new Set([...referenced.filter((g) => !map[g]), ...stray])];
  return { source: out, remaps, unresolved };
}

/** Port EVERY React page in a run + carry the nav — the deploy source, produced from the approved one. */
export function portReactRun(runDir, idMap) {
  const rp = reactPrototype(runDir);
  if (!rp) return null;
  const map = idMap || (existsSync(join(runDir, "id-map.json")) ? JSON.parse(readFileSync(join(runDir, "id-map.json"), "utf8")) : {});
  const pages = rp.pages.map((p) => ({ id: p.id, file: p.file, ...portReactSource(p.source, map) }));
  return { app: map.app || null, nav: rp.proto.nav || [], pages };
}

/** Neutralize every flow-id-shaped token so two sources can be compared for "did ONLY the ids change". */
const neutralizeIds = (s) => s.replace(GEN_ID, '"__ID__"');

/**
 * #6: the DEPLOY step, as code rather than a prose instruction. Consumes portReactRun and writes the ported
 * pages into the deploy tree — FAIL-CLOSED, so a page never ships bound to a guessed id and the port can
 * never quietly drift from the approved prototype:
 *   · requires an id-map (apply must have run) — without live ids there is nothing to prove equality against;
 *   · refuses if ANY referenced gen flow id is absent from genToServer (an unresolved id is an error here,
 *     not the silent fall-through-to-regeneration that recreates a different UI);
 *   · hash-guards every page: neutralizing the id tokens in the original prototype page and in the ported
 *     page must yield byte-identical source — proof the port changed ONLY id constants, nothing else.
 * Returns { app, nav, written }. Throws (ships nothing) on any breach.
 */
export function deployReactPages(runDir, destPagesDir, { idMap } = {}) {
  const rp = reactPrototype(runDir);
  if (!rp) throw new Error("port-deploy: not a React run (no proto.json + pages/*.jsx)");
  const map = idMap || (existsSync(join(runDir, "id-map.json")) ? JSON.parse(readFileSync(join(runDir, "id-map.json"), "utf8")) : null);
  if (!map || !map.genToServer) throw new Error("port-deploy: no id-map.json (genToServer) — run `apply` first; cannot prove live flow ids");
  const run = portReactRun(runDir, map);
  const unresolved = [...new Set(run.pages.flatMap((p) => p.unresolved))];
  if (unresolved.length) throw new Error(`port-deploy: unresolved flow id(s) not in id-map: ${unresolved.join(", ")} — apply did not map them; refusing to deploy a page bound to a guessed id`);
  // #6 concurrency: default to the run's OWN build workspace (runDir/.proto-build — per-run, node_modules
  // symlinked), NEVER the shared authored starter/src/pages where two concurrent deploys would clobber each
  // other. The deploy build then runs in that isolated workspace, the same isolation the prototype build got.
  // VALIDATE EVERY page BEFORE touching the destination — a single page that changed beyond the id remap
  // aborts the whole deploy with nothing written (the "ships nothing" guarantee, now actually true).
  for (const p of run.pages) {
    const orig = readFileSync(join(runDir, "prototype", "pages", p.file), "utf8");
    if (neutralizeIds(orig) !== neutralizeIds(p.source))
      throw new Error(`port-deploy: ${p.file} changed beyond the id remap — refusing (the port must be id-only)`);
  }
  const dest = destPagesDir || join(ensureWorkspace(runDir), "src", "pages", "proto");
  // TRANSACTIONAL, EXACT replacement (Codex #7): stage the exact page set into a temp dir, then atomically
  // swap it in — so a removed prototype page cannot survive as a stale route, and a mid-write failure can
  // never leave the destination a mix of old and new. renameSync is atomic on the same filesystem.
  const staging = dest + ".staging";
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const written = [];
  for (const p of run.pages) { writeFileSync(join(staging, p.file), p.source); written.push(p.file); }
  rmSync(dest, { recursive: true, force: true });     // clear stale pages — the deployed set is EXACTLY the prototype's
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(staging, dest);
  // PERSIST PER-PROJECT (the supplier-onboarding loss). The build dest lives in .proto-build, which
  // bundleRun EXCLUDES — so a copy also goes to runs/<slug>/ui/, which is UNDER the run dir and therefore
  // captured by the durable GCS bundle + restored on any instance. The generated custom UI can no longer
  // exist only on ephemeral instance disk. Exact set + a manifest so it is regenerable/redeployable.
  const durable = join(runDir, "ui");
  rmSync(durable, { recursive: true, force: true });
  mkdirSync(join(durable, "pages"), { recursive: true });
  for (const p of run.pages) writeFileSync(join(durable, "pages", p.file), p.source);
  writeFileSync(join(durable, "manifest.json"), JSON.stringify({ app: run.app, nav: run.nav, pages: written, deployedFrom: "prototype/pages (ported, id-remapped)" }, null, 2));
  return { app: run.app, nav: run.nav, written, dest, durable };
}

/**
 * Snapshot a generated custom-UI source tree into runs/<slug>/ui/ so it is PERSISTED PER-PROJECT. Any deploy
 * path (the legacy kf-ui-builder → starter/src/pages, or the React port) calls this before it ships, so the
 * generated UI lands in the run directory the durable bundle captures — never only on ephemeral instance
 * disk (the supplier-onboarding loss). Copies text source only; skips build output and node_modules.
 */
export function persistUiSource(runDir, srcDir) {
  if (!existsSync(srcDir)) throw new Error(`persist-ui: source dir not found: ${srcDir}`);
  const durable = join(runDir, "ui", "pages");
  rmSync(join(runDir, "ui"), { recursive: true, force: true });
  mkdirSync(durable, { recursive: true });
  const SKIP = new Set(["node_modules", "dist", ".proto-build", ".git"]);
  const TEXT = /\.(jsx|tsx|js|ts|json|css)$/i;
  const written = [];
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(abs, e.name), r);
      else if (TEXT.test(e.name)) { const t = join(durable, r); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, readFileSync(join(abs, e.name))); written.push(r); }
    }
  };
  walk(srcDir, "");
  return { durable, written };
}

/** A port brief for ONE React page — for the case a human/agent verifies the reuse rather than trusting it blind. */
export function buildReactBrief(runDir, pageId, idMap) {
  const rp = reactPrototype(runDir);
  if (!rp) return null;
  const page = rp.pages.find((p) => p.id === pageId || p.id === slugId(pageId));
  if (!page) throw new Error(`react page "${pageId}" not found under ${runDir}/prototype/pages`);
  const spec = existsSync(join(runDir, "app-spec.json")) ? JSON.parse(readFileSync(join(runDir, "app-spec.json"), "utf8")) : {};
  const map = idMap || (existsSync(join(runDir, "id-map.json")) ? JSON.parse(readFileSync(join(runDir, "id-map.json"), "utf8")) : {});
  const flows = spec.forms || spec.flows || [];
  const ported = portReactSource(page.source, map);

  // nav owner: which role/menu names this page
  let owner = null;
  for (const m of rp.proto.nav || []) for (const it of m.items || []) {
    if (it.page === page.id) { owner = { menu: m.name, label: it.label || it.page, roles: it.roles || [] }; break; }
  }
  // seed collections this page's flows correspond to → field-name confidence, reusing the HTML matchers
  const seed = rp.proto.seed || {};
  const bindings = Object.keys(seed).map((coll) => {
    const flow = matchFlow(coll, flows, map);
    const sample = Array.isArray(seed[coll]) ? seed[coll][0] || {} : {};
    return { collection: coll, flow, keys: Object.keys(sample).map((k) => ({ key: k, ...matchField(k, flow?.fields || []) })) };
  });
  return { pageId: page.id, file: page.file, owner, ported, bindings, appId: map.app || spec.app?.name || null };
}

const slugId = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function renderReactBrief(b) {
  const L = [];
  L.push(`# PORT BRIEF (React) — page \`${b.pageId}\`${b.owner ? ` · "${b.owner.label}"${b.owner.roles?.length ? ` · roles ${b.owner.roles.join(", ")}` : ""}` : ""}`);
  L.push(`
This page is **already the approved React page**, written on \`@/components/kit\` — the exact components
the deploy build compiles. It is not HTML to translate and it is not a design to redo: **reuse it
verbatim.** The only thing that differs between the preview and the live app is the flow id, and that
has already been rewritten below via \`id-map.json\`. Do not re-pick widgets, reword headings, or
change columns — a divergence the user did not approve is worse than a flaw they did.`);

  if (b.ported.remaps.length) {
    L.push(`\n## Flow ids rewritten (gen → live)`);
    for (const r of b.ported.remaps) L.push(`- \`${r.from}\` → \`${r.to}\``);
  } else {
    L.push(`\n## Flow ids\nNo remap was needed — the prototype's gen ids already equal the live ids (apply did not reassign them).`);
  }
  if (b.ported.unresolved.length)
    L.push(`\n⚠ Not in \`id-map.json\`: ${b.ported.unresolved.map((g) => `\`${g}\``).join(", ")}. This is expected only if apply left the gen id unchanged; if the live flow has a different id, fix these.`);

  for (const bd of b.bindings) {
    if (!bd.flow) continue;
    const open = bd.keys.filter((k) => !k.field);
    if (!open.length) continue;
    L.push(`\n## Confirm field names — flow \`${bd.flow.liveId}\` (${bd.flow.name})`);
    L.push(`These prototype keys did not map cleanly; confirm before shipping: ${open.map((k) => `\`${k.key}\``).join(", ")}. Available fields: ${(bd.flow.fields || []).map((f) => `\`${f.name}\``).join(", ")}.`);
  }

  L.push(`\n## The page (already ported — this is what deploys)\n\n\`\`\`jsx\n${b.ported.source}\n\`\`\``);
  L.push(`\n## Hard rules\n
- **Reuse, don't regenerate.** The source above is the deploy source. Write it as-is.
- **Empty is a real state.** The live app starts with no records; the page's own empty branches handle that.
- **Reference fields** come back as objects — the page already reads \`.Name\`/\`._id\`; keep it.`);
  return L.join("\n");
}

// ── HTML prototype (legacy) ──────────────────────────────────────────────────────────────────────
export function buildBrief(runDir, pageId) {
  const html = readPrototype(runDir);
  if (!html) throw new Error(`no prototype found under ${runDir}/prototype`);
  const page = extractPage(existsSync(join(runDir, "prototype", "index.html")) ? join(runDir, "prototype", "index.html") : join(runDir, "prototype", "parts"), pageId);
  if (!page) throw new Error(`page "${pageId}" not found in the prototype`);

  const g = readGlobals(html);
  const spec = existsSync(join(runDir, "app-spec.json")) ? JSON.parse(readFileSync(join(runDir, "app-spec.json"), "utf8")) : {};
  const idMap = existsSync(join(runDir, "id-map.json")) ? JSON.parse(readFileSync(join(runDir, "id-map.json"), "utf8")) : {};
  const flows = spec.forms || spec.flows || [];

  // which role owns this page, and what the nav calls it — the prototype is the authority here
  let owner = null;
  for (const r of g.ROLES || []) {
    const nav = (r.nav || []).find((n) => n.id === pageId);
    if (nav) { owner = { role: r.name || r.slug, slug: r.slug, label: nav.label, landing: r.landing === pageId }; break; }
  }

  const bindings = page.seedKeys.map((key) => {
    const rows = g.SEED?.[key];
    const sample = Array.isArray(rows) ? rows[0] || {} : rows || {};
    const flow = Array.isArray(rows) ? matchFlow(key, flows, idMap) : null;
    const fields = flow?.fields || [];
    return {
      collection: key,
      isRecordSet: Array.isArray(rows),
      count: Array.isArray(rows) ? rows.length : null,
      flow,
      keys: Object.keys(sample).map((k) => ({ key: k, ...matchField(k, fields) })),
      unusedFields: fields.filter((f) => !Object.keys(sample).some((k) => matchField(k, fields).field === f)),
    };
  });

  return { pageId, page, owner, bindings, appId: idMap.app || spec.app?.name || null };
}

const PATTERNS = [
  ["a grid of small stat cards (`data-kpi`)", "`<KpiRow>` + `<KpiCard label value tone>`"],
  ["a `<table>` with a `<tbody data-table>`", "`<DataTable columns rows>`"],
  ["a hand-rolled `<svg>` bar/area/donut", "`<RBar>` / `<RArea>` / `<RPie>` — same series, same order"],
  ["coloured status text or a rounded pill", "`<StatusPill status>` (never a hardcoded colour class)"],
  ["a column-per-status card list", "`<KanbanBoard>`"],
  ["a vertical dated event list", "`<Timeline>`"],
  ["a step/stage indicator", "`<Stepper>`"],
  ["the page title + subtitle block", "`<PageHeader title subtitle actions>`"],
  ["a section wrapper card", "`<Panel title>`"],
  ["an empty branch (`length === 0`)", "`<EmptyState>`"],
];

export function renderBrief(b) {
  const L = [];
  L.push(`# PORT BRIEF — prototype page \`${b.pageId}\`${b.owner ? ` · "${b.owner.label}" · role ${b.owner.role}${b.owner.landing ? " (landing)" : ""}` : ""}`);
  L.push(`
You are **porting an approved prototype page to the live app**, not designing a page. The prototype
below was reviewed and signed off: its layout, widget choices, column sets, orderings, aggregations
and wording are all decisions that have already been made. Reproduce them. The ONLY thing you change
is where the data comes from — \`SEED.*\` arrays become Kissflow SDK reads against the flows below.

Do not research alternatives, do not re-pick widgets, do not reword headings, do not add or drop
columns, and do not "improve" the layout. If something in the prototype looks wrong, port it as-is
and note it at the end; a divergence the user did not approve is a worse outcome than a flaw they did.`);

  L.push(`\n## 1. Data bindings${b.appId ? ` (app \`${b.appId}\`)` : ""}`);
  for (const bd of b.bindings) {
    if (!bd.isRecordSet) { L.push(`\n### \`SEED.${bd.collection}\` — not a record set\nPrototype-only context (\`${JSON.stringify(bd.keys.map((k) => k.key))}\`). Replace with the signed-in user from the SDK, or drop it.`); continue; }
    if (!bd.flow) { L.push(`\n### \`SEED.${bd.collection}\` (${bd.count} rows) — ⚠ NO MATCHING FLOW\nResolve this against the app's flows before writing the page; do not invent a flow id.`); continue; }
    L.push(`\n### \`SEED.${bd.collection}\` (${bd.count} rows) → flow \`${bd.flow.liveId}\` — ${bd.flow.name} [${bd.flow.flowType || bd.flow.type}]\n`);
    L.push(`| prototype key | Kissflow field | type | match |`);
    L.push(`| --- | --- | --- | --- |`);
    for (const k of bd.keys) {
      const cell = k.field ? `\`${k.field.name}\`` : k.candidates ? k.candidates.map((c) => `\`${c.name}\``).join(" or ") : "— **UNRESOLVED**";
      L.push(`| \`${k.key}\` | ${cell} | ${k.field?.type || ""} | ${k.confidence} |`);
    }
    const open = bd.keys.filter((k) => !k.field);
    if (open.length) L.push(`\n⚠ Resolve before coding: ${open.map((k) => `\`${k.key}\``).join(", ")}. Available fields: ${bd.flow.fields.map((f) => `\`${f.name}\``).join(", ")}.`);
    // Only claim a field is unused when nothing is unresolved. With open keys the two lists overlap —
    // the field an unresolved key actually means shows up here as "never shown", and the instruction
    // to leave it out then deletes content the prototype displayed (caught on requisitions, where
    // `id`/`dept` were unresolved and their fields were listed as unused).
    if (bd.unusedFields.length && !open.length)
      L.push(`\nFields the prototype never showed (leave them out — that was a design decision): ${bd.unusedFields.map((f) => `\`${f.name}\``).join(", ")}.`);
    else if (bd.unusedFields.length)
      L.push(`\nNot obviously bound: ${bd.unusedFields.map((f) => `\`${f.name}\``).join(", ")}. Some of these are what the unresolved keys above mean — map those first, and only then treat the remainder as deliberately not shown.`);
  }

  L.push(`\n## 2. Markup to reproduce\n\n\`\`\`html\n${b.page.markup || "(none)"}\n\`\`\``);
  L.push(`\n## 3. Renderer to reproduce — every aggregation, filter, sort, label and column here is a decision to keep\n\n\`\`\`js\n${b.page.render || "(none)"}\n\`\`\``);

  L.push(`\n## 4. Prototype pattern → runtime primitive\n\nThe prototype is hand-rolled HTML; the runtime page is React on the \`kf\` primitives (\`starter/src/components/kf\`). Translate structure, keep semantics:\n`);
  L.push(`| prototype | runtime |`, `| --- | --- |`);
  for (const [a, c] of PATTERNS) L.push(`| ${a} | ${c} |`);

  L.push(`\n## 5. Hard rules\n
- **Tokens only.** No \`bg-green-100\`, no hex literals, no \`dark:\` pairs — colour comes from the primitives and \`TONES\`. The prototype's inline \`style="background-color: …"\` is a prototype shortcut; \`<StatusPill>\` replaces it.
- **Guard dates.** \`new Date(x)\` on a missing value renders "Invalid Date"; every date passes through the \`format\` helpers.
- **Reference fields** come back as objects — read \`.Name\`/\`._id\`, never render the raw object.
- **Empty is a real state.** The live app starts with no records; every list renders \`<EmptyState>\` rather than a bare table or \`NaN\`.
- **Role scope.** This page belongs to ${b.owner ? `\`${b.owner.role}\`` : "its role"} — keep the prototype's own filter (\`SEED.me\`-style "mine" scoping becomes an SDK filter on the signed-in user).`);
  return L.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("proto-port.mjs")) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [dir, pageId] = args;
  const deployIx = process.argv.indexOf("--deploy");
  const persistIx = process.argv.indexOf("--persist-ui");
  if (!dir) { console.error("usage: proto-port.mjs <run-dir> [pageId] [--json] | <run-dir> --deploy [dest] | <run-dir> --persist-ui <src-dir>"); process.exit(2); }
  try {
    // Persist a generated custom-UI source tree into runs/<slug>/ui/ so it is bundled per-project (any deploy
    // path calls this before shipping — the fix for the custom-UI-lost-on-instance-recycle incident).
    if (persistIx >= 0) {
      const srcDir = process.argv[persistIx + 1];
      if (!srcDir || srcDir.startsWith("--")) { console.error("usage: proto-port.mjs <run-dir> --persist-ui <src-dir>"); process.exit(2); }
      const out = persistUiSource(dir, srcDir);
      console.log(JSON.stringify({ durable: out.durable, files: out.written.length }, null, 2));
      process.exit(0);
    }
    // #6: deterministic, fail-closed DEPLOY write — deployment code consuming portReactRun, not a hand-copy.
    if (deployIx >= 0) {
      const destDir = process.argv[deployIx + 1];   // optional — omit to write into the run's isolated .proto-build workspace
      const out = deployReactPages(dir, destDir && !destDir.startsWith("--") ? destDir : undefined);
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    const isReact = reactPrototype(dir) != null;   // a React run wins — its pages ARE the deploy source
    if (isReact && !pageId) {
      // no page named → port the whole run (the deploy source)
      const out = portReactRun(dir);
      console.log(JSON.stringify(out, null, process.argv.includes("--json") ? 1 : 2));
    } else if (isReact) {
      const b = buildReactBrief(dir, pageId);
      console.log(process.argv.includes("--json") ? JSON.stringify(b, null, 1) : renderReactBrief(b));
    } else {
      if (!pageId) { console.error("usage: proto-port.mjs <run-dir> <pageId>  (HTML run needs a page id)"); process.exit(2); }
      const b = buildBrief(dir, pageId);
      console.log(process.argv.includes("--json") ? JSON.stringify(b, null, 1) : renderBrief(b));
    }
  } catch (e) { console.error(`proto-port: ${e.message}`); process.exit(1); }
}
