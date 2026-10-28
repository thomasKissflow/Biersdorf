// schema-from-ir.mjs — emit starter/lib/kf-schema.json from an App-Spec IR, before the app exists.
//
//   node schema-from-ir.mjs <app-spec.json> [--seed seed.json] [--out lib/kf-schema.json]
//                           [--id-map <runDir>/id-map.json]   ← after apply, for the REAL flow ids
//
// WHY: the prototype and the runtime UI used to be two different artifacts — a hand-rolled HTML page
// with `window.SEED`, and later a React app on the kf primitives. The user reviewed the first and got
// shipped the second, and they diverged (hire-onboard, 2026-08-02). The fix is to have only ONE
// artifact: generate the real Kissflow custom UI, and review THAT.
//
// The blocker was ordering — `kf:sync` builds lib/kf-schema.json by reading the LIVE app, so the
// React app could not boot until apply had finished. This builds the same file from the IR instead,
// so the custom UI compiles and runs (against @kissflow/app-ui's offline mock) while apply is still
// going. Same pages, same components, same SDK calls, same actions; only the rows are seeded.
//
// After apply, run `kf:sync` to overwrite this with the real server ids and rebuild — the PAGE code
// never changes, so what the user approved is what ships.
//
// Ids follow the conventions apply uses, verified against a synced schema: flow `Job Requisition` ->
// `Job_Requisition_A00`, field `Job Title` -> `Job_Title`. Role ids are server-assigned and cannot be
// predicted, so they get `Ro_<slug>` placeholders that kf:sync replaces.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const idify = (s) => String(s || "").trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const flowId = (name) => `${idify(name)}_A00`;
export const fieldId = (name) => idify(name);

/**
 * Put a seed value into the shape the REAL SDK returns. Reference and User fields come back as
 * `{ _id, Name }` objects; a seed naturally writes them as a plain name ("Priya Raman"). Left as a
 * string, the prototype renders correctly and the live app prints "[object Object]" — a divergence
 * review cannot catch, since the reviewer never sees the live shape.
 */
function coerce(field, value, refIndex) {
  const t = String(field.type || "").toLowerCase();
  if ((t === "reference" || t === "user" || t === "userpicker") && typeof value === "string") {
    // Point a reference at the row it names, so `candidate.Requisition._id` actually matches a
    // requisition's `_id` in the preview — the same join the page will do live. Without this the
    // page falls back to matching on display name, and any page that joins strictly by id renders
    // an empty panel in review while working fine in production (caught on candidates).
    const target = field.ref && refIndex?.get(norm(field.ref));
    const hit = target?.get(norm(value));
    return { _id: hit || `${field.id}_${idify(value).toLowerCase()}`, Name: value };
  }
  return value;
}

/**
 * Translate a human-written seed — keyed by flow NAME with field LABELS —
 *   { "Requisition": [ { "Job Title": "Staff Engineer", "Department": "Platform" } ] }
 * into the id-keyed form the offline mock reads. Written this way because the seed is authored by
 * an agent alongside the domain, where ids do not exist yet and labels are the natural handle.
 * Unknown flows/fields are reported rather than silently dropped: a typo'd label is invisible at
 * runtime (the column just renders empty), which is exactly the class of bug this pipeline keeps hitting.
 */
export function lowerSeed(seed, models) {
  const out = {}, warnings = [];
  const modelByName = new Map(models.map((m) => [norm(m.name), m]));

  // Pass 1: work out the `_id` each seeded row will end up with, and index every string value in it
  // against that id. The mock derives row ids positionally (`<model>_<n>`), so this is knowable up
  // front — which is what lets a reference in pass 2 resolve to a row that genuinely exists.
  const refIndex = new Map(); // normalized flow name -> (normalized display value -> row _id)
  for (const [flowName, rows] of Object.entries(seed || {})) {
    const model = modelByName.get(norm(flowName)) || models.find((m) => norm(m.id) === norm(flowName));
    if (!model) continue;
    const index = refIndex.get(norm(model.name)) || new Map();
    const offset = (out[model.id]?.length || 0); // a second key for the same flow appends
    rows.forEach((row, i) => {
      const id = row._id || `${model.id}_${offset + i + 1}`;
      for (const v of Object.values(row)) if (typeof v === "string" && v.trim() && !index.has(norm(v))) index.set(norm(v), id);
    });
    refIndex.set(norm(model.name), index);
    out[model.id] = (out[model.id] || []).concat(rows); // provisional — pass 2 replaces with lowered rows
  }
  for (const k of Object.keys(out)) delete out[k];
  for (const [flowName, rows] of Object.entries(seed || {})) {
    const model = modelByName.get(norm(flowName)) || models.find((m) => norm(m.id) === norm(flowName));
    if (!model) { warnings.push(`seed: no flow named "${flowName}" — ${rows.length} row(s) dropped`); continue; }
    const fieldByName = new Map(model.fields.map((f) => [norm(f.name), f]));
    // Two keys can normalize to the same flow ("Candidate" and "Candidate "). Appending rather than
    // assigning means neither block is lost; a plain assign silently discarded the first one.
    if (out[model.id]) warnings.push(`seed: "${flowName}" resolves to the same flow as an earlier key (${model.name}) — rows appended`);
    const lowered = rows.map((row, i) => {
      const loweredRow = {};
      for (const [k, v] of Object.entries(row)) {
        if (k.startsWith("_")) { loweredRow[k] = v; continue; } // system fields pass through verbatim
        const f = fieldByName.get(norm(k)) || model.fields.find((x) => x.id === k);
        if (!f) { if (i === 0) warnings.push(`seed: "${flowName}" has no field "${k}" — value ignored (fields: ${model.fields.map((x) => x.name).join(", ")})`); continue; }
        loweredRow[f.id] = coerce(f, v, refIndex);
      }
      return loweredRow;
    });
    out[model.id] = (out[model.id] || []).concat(lowered);
  }
  return { seed: out, warnings };
}

/**
 * Check `lib/nav.json` against the schema and the page files on disk.
 *
 * nav.json is authored, not derived: its routes must match the page FILES the builders wrote, while
 * the IR names pages in business terms ("Pipeline" vs `rc-home.jsx`), so generating it would just
 * relocate the mismatch. Both ways it can fail silently — the shell builds nav ENTIRELY from this
 * file and role-gates every item, so one stale role name renders an app with no navigation at all
 * and no error anywhere. This turns that into a message.
 */
export function checkNav(nav, roleNames, pageIds) {
  const issues = [];
  const roles = new Set(roleNames.map(norm));
  const pages = new Set(pageIds.map((p) => norm(p)));
  for (const menu of Array.isArray(nav) ? nav : []) {
    for (const item of menu.items || []) {
      const route = String(item.to || "").replace(/^\//, "");
      if (route && pages.size && !pages.has(norm(route)))
        issues.push(`nav "${item.label || route}" → /${route}, but no page file matches (have: ${pageIds.join(", ")})`);
      for (const r of item.roles || [])
        if (!roles.has(norm(r)))
          issues.push(`nav "${item.label || route}" is gated to role "${r}", which the app does not have (have: ${roleNames.join(", ")}) — this item renders for nobody`);
    }
  }
  const gated = (Array.isArray(nav) ? nav : []).flatMap((m) => m.items || []).flatMap((i) => (i.roles || []).map(norm));
  for (const r of roleNames)
    if (gated.length && !gated.includes(norm(r))) issues.push(`role "${r}" has no nav item — that persona opens the app to an empty shell`);
  return issues;
}

export function schemaFromIr(spec, { seed, domain, accountId, idMap = null } = {}) {
  // Predicted ids are right only until they collide. `Asset` becomes `Asset_A00` UNLESS the account
  // already has one, in which case apply creates `Asset_A01` — and a page bound to the predicted id
  // reads an unrelated flow or nothing at all. Nothing before apply can know this, so once apply has
  // run, feed its id-map back in (`--id-map <runDir>/id-map.json`) and rebuild. Observed first run:
  // Facilities Desk got Asset_A01 (2026-08-02).
  const remap = (id) => idMap?.genToServer?.[id] || id;
  const appName = spec.app?.name || spec.app?.title || "App";
  const roles = (spec.roles || []).map((r) => ({
    id: remap(`Ro_${idify(r.name || r).toLowerCase()}`),
    name: r.name || String(r),
    description: r.description || undefined,
  }));

  const flows = spec.forms || spec.flows || [];
  const dataModels = flows.map((f) => ({
    id: remap(f.id || flowId(f.name)),
    name: f.name,
    description: f.description || undefined,
    type: f.flowType || f.type || "Form",
    fields: (f.fields || []).map((x) => ({
      id: x.id || fieldId(x.name),
      name: x.name,
      type: x.type || "Text",
      required: !!x.required,
      // The target flow of a Reference. Carried so seeded references can be pointed at the actual
      // seeded rows they name, instead of at an invented id that resolves to nothing.
      ref: x.ref || undefined,
    })),
    // The workflow, in order, so the offline mock can actually advance an item when a page calls
    // submitItem/rejectItem — the preview's Approve button moves the row instead of doing nothing.
    // Process steps AND Case statuses are `{ name, … }` objects in the IR, not strings. Concatenating
    // them raw put "[object Object]" in every lane name — latent until a board read its lanes from
    // the schema rather than from a prototype's markup (facilities test run, 2026-08-02).
    steps: [...(f.workflow?.steps || []), ...(f.statuses || [])]
      .map((s) => (typeof s === "string" ? s : s?.name))
      .filter(Boolean),
    // Without roleAccess every widget renders "Restricted" in the offline preview. The IR's real
    // permission matrix is applied by the live app; for the preview, grant read to every role so the
    // reviewer can see each persona's pages. Scoping is reviewed on the live app, not the prototype.
    roleAccess: roles.map((r) => ({ id: r.id, name: r.name, permission: [] })),
  }));

  const schema = {
    app: { id: idMap?.app || flowId(appName), name: appName, domain, accountId },
    generatedAt: undefined, // left unset: a timestamp would churn the file on every regeneration
    dataModels,
    roles,
    pages: (spec.pages || []).map((p) => ({ id: idify(p.name), name: p.name, type: "Page" })),
  };

  const warnings = [];
  if (seed) {
    const lowered = lowerSeed(seed, dataModels);
    schema.seed = lowered.seed;
    warnings.push(...lowered.warnings);
  }
  return { schema, warnings };
}

if (process.argv[1] && process.argv[1].endsWith("schema-from-ir.mjs")) {
  const args = process.argv.slice(2);
  const specPath = args.find((a) => !a.startsWith("--"));
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  if (!specPath) { console.error("usage: schema-from-ir.mjs <app-spec.json> [--seed seed.json] [--out lib/kf-schema.json]"); process.exit(2); }
  if (!existsSync(specPath)) { console.error(`no such file: ${specPath}`); process.exit(2); }

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const seedPath = flag("--seed");
  if (seedPath && !existsSync(seedPath)) { console.error(`no such seed file: ${seedPath}`); process.exit(2); }
  const seed = seedPath ? JSON.parse(readFileSync(seedPath, "utf8")) : null;
  const idMapPath = flag("--id-map");
  const idMap = idMapPath && existsSync(idMapPath) ? JSON.parse(readFileSync(idMapPath, "utf8")) : null;

  const { schema, warnings } = schemaFromIr(spec, {
    seed,
    idMap,
    domain: flag("--domain") || process.env.KF_DOMAIN || undefined,
    accountId: flag("--account") || process.env.KF_ACCOUNT_ID || undefined,
  });

  const out = flag("--out") || join("lib", "kf-schema.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");

  // Optional: audit the authored nav against this schema and the page files that exist.
  const navPath = flag("--nav");
  if (navPath && existsSync(navPath)) {
    const pagesDir = flag("--pages") || join(dirname(navPath), "..", "src", "pages");
    const pageIds = existsSync(pagesDir)
      ? readdirSync(pagesDir).filter((f) => f.endsWith(".jsx")).map((f) => f.replace(/\.jsx$/, ""))
      : [];
    for (const i of checkNav(JSON.parse(readFileSync(navPath, "utf8")), schema.roles.map((r) => r.name), pageIds))
      warnings.push(`nav: ${i}`);
  }

  for (const w of warnings) console.error(`  ⚠ ${w}`);
  const seeded = Object.entries(schema.seed || {}).map(([k, v]) => `${k}=${v.length}`).join(" ");
  console.log(`✓ ${schema.dataModels.length} data model(s), ${schema.roles.length} role(s) → ${out}${seeded ? `\n  seeded: ${seeded}` : "\n  (no seed — the mock will synthesize rows)"}`);
  // Partial seed loss is a warning: the app still builds and most of it is right. A seed that landed
  // NOWHERE means the wrong file or the wrong flow names, which would ship a prototype full of
  // synthesized "Job Title 1" rows — fail so the pipeline stops instead of publishing that.
  if (seed && !Object.keys(schema.seed || {}).length) {
    console.error(`  ✗ no seed row matched any flow — check the flow names in ${seedPath}`);
    process.exit(1);
  }
}
