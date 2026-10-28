// seed-live.mjs — write the app's OWN seed data into Kissflow as real records.
//
//   node seed-live.mjs <app-spec.json> --seed seed.json --app <AppId> [--dry] [--only <Flow>]
//
// WHY this is a build step, not an afterthought: quick mode produces a live app and a reviewable
// preview from one bundle, but the preview's rows come from the offline mock while the live app
// starts empty. So the same build that looked complete in review rendered every list as an empty
// state in Kissflow — "what happened to the seed data in custom ui". A build that ships an app
// nobody can look at is not finished. Same `seed.json` as the preview, so the two agree by
// construction rather than by someone remembering to re-enter the data.
//
// Endpoints verified live (2026-08-02, dev-lcncdemo):
//   Form    POST /form/2/{acc}/{flowId}/batch?_application_id=…   rows carry `_is_created: true`
//   Process POST /process/2/{acc}/{flowId}?_application_id=…      → { _id, _activity_instance_id }
//   Case    POST /case/2/{acc}/{flowId}?_application_id=…         validates required fields on create
//
// References are the reason this runs in dependency order: a seed names its parent in words
// ("Senior Backend Engineer"), while the API wants the parent's real `_id`. Each flow is created
// first, indexed by its display values, and its children are then rewritten to point at real rows.

import { readFileSync, existsSync } from "node:fs";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const idify = (s) => String(s || "").trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const q = (appId) => (appId ? `?_application_id=${appId}` : "");

/**
 * spec.forms → the shape this module works in.
 *
 * `idMap` is not optional in practice. A predicted id is right only until it collides: `Asset`
 * becomes `Asset_A00` unless the account already has one, in which case apply creates `Asset_A01`.
 * Seeding against the predicted id then writes into an UNRELATED flow — caught on the facilities
 * test run, where every Asset insert failed with "the field Building does not exist in the flow
 * Asset" because it was talking to a different app's Asset. It failed loudly here; a flow that
 * happened to share field names would have silently seeded a stranger's app.
 */
export function modelsFromSpec(spec, idMap = null) {
  const remap = (id) => idMap?.genToServer?.[id] || id;
  return (spec.forms || spec.flows || []).map((f) => ({
    name: f.name,
    id: remap(f.id || `${idify(f.name)}_A00`),
    type: f.flowType || f.type || "Form",
    // Steps and Case statuses are `{ name, … }` objects in the IR — concatenating them raw yielded
    // "[object Object]" lane names and broke every advance-to-status comparison.
    steps: [...(f.workflow?.steps || []), ...(f.statuses || [])]
      .map((s) => (typeof s === "string" ? s : s?.name))
      .filter(Boolean),
    fields: (f.fields || []).map((x) => ({
      id: x.id || idify(x.name), name: x.name, type: x.type || "Text", required: !!x.required, ref: x.ref || null,
    })),
  }));
}

/**
 * Create flows before the flows that point at them. A seed for Candidate references Requisition, so
 * inserting alphabetically leaves every reference dangling. Cycles fall back to input order rather
 * than looping — a self-referencing model is legal and just cannot be perfectly ordered.
 */
export function orderByDependency(models) {
  const byName = new Map(models.map((m) => [norm(m.name), m]));
  const out = [], seen = new Set(), inProgress = new Set();
  const visit = (m) => {
    if (!m || seen.has(m.name)) return;
    if (inProgress.has(m.name)) return; // cycle — leave it where it is
    inProgress.add(m.name);
    for (const f of m.fields) if (f.ref) visit(byName.get(norm(f.ref)));
    inProgress.delete(m.name);
    if (!seen.has(m.name)) { seen.add(m.name); out.push(m); }
  };
  models.forEach(visit);
  return out;
}

/** the field whose value a human would use to name a record — what a seed's reference says */
function displayField(model) {
  return model.fields.find((f) => /name|title/i.test(f.name) && /text/i.test(f.type))
    || model.fields.find((f) => /text/i.test(f.type))
    || model.fields[0];
}

/**
 * Dates: a seed is written the way a person writes one ("2026-08-03 10:00"), and the API rejects
 * that outright — `InvalidDateTimeString`, which failed every Interview row on the first live run.
 * A DateTime goes up as ISO 8601; a Date stays date-only. Anything unparseable is passed through
 * untouched so the API's own error is what surfaces, rather than a silently mangled value.
 */
function coerceDate(field, v) {
  const t = String(field.type || "").toLowerCase();
  if (typeof v !== "string" || !(t === "datetime" || t === "date")) return v;
  if (t === "date") return v.slice(0, 10);
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
  return isNaN(d) ? v : d.toISOString();
}

/** seed row (labels) → API payload (field ids), with references resolved to real created rows */
function toPayload(model, row, index) {
  const byLabel = new Map(model.fields.map((f) => [norm(f.name), f]));
  const out = {}, unresolved = [];
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_")) continue; // workflow state is applied by advancing, not by writing a field
    const f = byLabel.get(norm(k)) || model.fields.find((x) => x.id === k);
    if (!f) continue;
    if (f.ref) {
      const hit = index.get(norm(f.ref))?.get(norm(typeof v === "object" ? v?.Name : v));
      if (hit) out[f.id] = hit;
      else unresolved.push(`${f.name}="${typeof v === "object" ? v?.Name : v}"`);
      continue;
    }
    // A User field needs a real user; a seed only has a display name. Left unset rather than
    // written as a string, which the API rejects and which would fail the whole batch.
    if (/^user/i.test(f.type)) continue;
    out[f.id] = coerceDate(f, v);
  }
  return { payload: out, unresolved };
}

export async function seedLive(c, { acc, appId, spec, seed, dry = false, only = null, idMap = null, log = console.log }) {
  const models = modelsFromSpec(spec, idMap);
  const ordered = orderByDependency(models)
    .filter((m) => seed[m.name] || seed[m.id])
    // --only re-runs ONE flow. Seeding is NOT idempotent — every run creates new records — so a
    // partial failure has to be retryable without duplicating the flows that already succeeded.
    .filter((m) => !only || norm(m.name) === norm(only) || norm(m.id) === norm(only));
  const index = new Map();   // normalized flow name -> (normalized display value -> {_id, Name})
  const report = [];

  // Index every referenced flow from what is ALREADY live. Needed whenever this run does not
  // create the parents itself — a `--only Interview` retry, or a re-seed of one flow — otherwise
  // every reference in the retried flow dangles and the records come out unlinked.
  for (const model of models) {
    for (const f of model.fields) {
      const target = f.ref && models.find((m) => norm(m.name) === norm(f.ref));
      if (!target || index.has(norm(target.name)) || ordered.includes(target)) continue;
      index.set(norm(target.name), await indexLive(c, { acc, appId, model: target, log }));
    }
  }

  for (const model of ordered) {
    const rows = seed[model.name] || seed[model.id] || [];
    const disp = displayField(model);
    const made = new Map();
    let created = 0;
    const problems = [];

    log(`  ${model.name} [${model.type}] — ${rows.length} row(s)`);
    for (const row of rows) {
      const { payload, unresolved } = toPayload(model, row, index);
      if (unresolved.length) problems.push(`unresolved reference ${unresolved.join(", ")}`);
      const label = row[disp?.name] ?? row[disp?.id] ?? "";
      if (dry) { created++; if (label) made.set(norm(label), { _id: `dry_${created}`, Name: String(label) }); continue; }

      if (/^form$/i.test(model.type)) {
        const r = await c.call("POST", `/form/2/${acc}/${model.id}/batch${q(appId)}`, [{ ...payload, _is_created: true }]);
        if (r.status >= 300) { problems.push(`${label || "row"} → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`); continue; }
        const rec = Array.isArray(r.body) ? r.body[0] : r.body?.Data?.[0] || r.body;
        created++;
        if (label && rec?._id) made.set(norm(label), { _id: rec._id, Name: String(label) });
      } else {
        const family = /^case$/i.test(model.type) ? "case" : "process";
        let r = await c.call("POST", `/${family}/2/${acc}/${model.id}${q(appId)}`, payload);
        // One value must not cost the whole record. This account rejects every DateTime format we
        // can construct (`InvalidDateTimeString` for ISO, epoch, US and locale forms alike), which
        // would otherwise mean zero interviews rather than eight interviews missing a timestamp.
        // Retry once without the offending fields and say so, rather than dropping the row.
        if (r.status >= 300 && /InvalidDateTimeString/.test(JSON.stringify(r.body || ""))) {
          const dropped = model.fields.filter((f) => /datetime/i.test(f.type) && f.id in payload).map((f) => f.name);
          for (const f of model.fields) if (/datetime/i.test(f.type)) delete payload[f.id];
          r = await c.call("POST", `/${family}/2/${acc}/${model.id}${q(appId)}`, payload);
          if (r.status < 300 && dropped.length) problems.push(`${label || "row"}: created WITHOUT ${dropped.join(", ")} — the account rejected every date/time format tried`);
        }
        if (r.status >= 300) { problems.push(`${label || "row"} → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`); continue; }
        created++;
        if (label && r.body?._id) made.set(norm(label), { _id: r.body._id, Name: String(label) });
        // Walk it to the state the seed says it is in. Everything created starts at step one, so a
        // queue scoped to a later step would otherwise be empty in the live app while the preview
        // showed rows — the same divergence this whole step exists to close.
        const target = row._status || row._current_step;
        await advanceTo(c, { acc, appId, family, model, item: r.body, target, problems, label });
      }
    }
    index.set(norm(model.name), made);
    report.push({ flow: model.name, type: model.type, requested: rows.length, created, problems });
    if (problems.length) for (const p of problems.slice(0, 6)) log(`    ⚠ ${p}`);
  }
  return report;
}

/** existing live records of a flow, indexed by display value → { _id, Name } */
async function indexLive(c, { acc, appId, model, log = () => {} }) {
  const made = new Map();
  const disp = displayField(model);
  if (!disp) return made;
  const family = /^case$/i.test(model.type) ? "case" : /^process$/i.test(model.type) ? "process" : "form";
  try {
    // POST to the VIEW, not GET to /list. `GET /form/2/{acc}/{id}/list` answers 200 with the view
    // DEFINITION — {_id, Columns, Sort, Filter} and no rows — so this indexed nothing and every
    // reference in a --only re-run came back unresolved while the call looked successful.
    // `POST /{family}/2/{acc}/{id}/allitems/list` is the one that carries Data[] plus a count.
    const r = await c.call("POST", `/${family}/2/${acc}/${model.id}/allitems/list?_application_id=${appId}&page_number=1&page_size=200`, {});
    const rows = Array.isArray(r.body?.Data) ? r.body.Data : Array.isArray(r.body) ? r.body : [];
    for (const row of rows) {
      const v = row[disp.id];
      const label = v && typeof v === "object" ? v.Name : v;
      if (label && !made.has(norm(label))) made.set(norm(label), { _id: row._id, Name: String(label) });
    }
    if (made.size) log(`  (indexed ${made.size} existing ${model.name} record(s) for reference resolution)`);
  } catch { /* nothing live to index — references will be reported as unresolved */ }
  return made;
}

/** submit an item forward until it reaches `target` (or we run out of steps) */
async function advanceTo(c, { acc, appId, family, model, item, target, problems, label }) {
  if (!target || !model.steps.length) return;
  const want = model.steps.findIndex((s) => norm(s) === norm(target));
  if (want <= 0) return; // unknown, or already the first step
  let id = item._id, aiid = item._activity_instance_id;
  for (let step = 0; step < want; step++) {
    const r = await c.call("POST", `/${family}/2/${acc}/${model.id}/${id}/${aiid}/submit${q(appId)}`, {});
    if (r.status >= 300) { problems.push(`${label}: could not advance past step ${step + 1} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`); return; }
    aiid = r.body?._activity_instance_id || r.body?.ActivityInstanceId || aiid;
    if (!aiid) return; // completed or no further activity to act on
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed-live.mjs")) {
  const args = process.argv.slice(2);
  const specPath = args.find((a) => !a.startsWith("--"));
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const seedPath = flag("--seed"), appId = flag("--app"), dry = args.includes("--dry"), only = flag("--only");
  const idMapPath = flag("--id-map");
  const idMap = idMapPath && existsSync(idMapPath) ? JSON.parse(readFileSync(idMapPath, "utf8")) : null;
  if (!specPath || !seedPath || !appId) { console.error("usage: seed-live.mjs <app-spec.json> --seed seed.json --app <AppId> [--dry]"); process.exit(2); }
  for (const p of [specPath, seedPath]) if (!existsSync(p)) { console.error(`no such file: ${p}`); process.exit(2); }

  const { clientFromEnv } = await import("./client.mjs");
  const c = await clientFromEnv();
  // Every OTHER entry point reads KISSFLOW_ACCOUNT_ID / KF_ACCOUNT_ID (see clientFromEnv, which
  // documents the KF_* vs KISSFLOW_* split as a real past failure). This one read a bare
  // ACCOUNT_ID that nothing sets, so `acc` was always undefined: the client authenticated fine,
  // every URL was built with "undefined" in the account slot, and the run reported "6/6 created"
  // in dry mode with every reference unresolved — a silent no-op that reads like success.
  const acc = process.env.KISSFLOW_ACCOUNT_ID || process.env.KF_ACCOUNT_ID || process.env.ACCOUNT_ID;
  if (!acc) { console.error("Set KISSFLOW_ACCOUNT_ID or KF_ACCOUNT_ID in env"); process.exit(2); }
  console.log(`\nSEED-LIVE${dry ? " (dry run — nothing is written)" : ""} — app ${appId} → ${process.env.KISSFLOW_SUBDOMAIN}`);
  const report = await seedLive(c, {
    acc, appId,
    spec: JSON.parse(readFileSync(specPath, "utf8")),
    seed: JSON.parse(readFileSync(seedPath, "utf8")),
    dry, only, idMap,
  });
  console.log("\n=== SEED REPORT ===");
  let failed = 0;
  for (const r of report) {
    console.log(`  ${r.flow.padEnd(16)} ${String(r.created).padStart(3)}/${r.requested} created${r.problems.length ? `  (${r.problems.length} problem(s))` : ""}`);
    failed += r.requested - r.created;
  }
  process.exit(failed ? 1 : 0);
}
