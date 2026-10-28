// v7 A1 (21 Oct): the Details-section step permission for CIQ Review and CIQ Open Point (morning list B-1 / P-1).
// Proven live 21 Oct: on the user route (POST /process/2/{acc}/{flow}/{item}/{act}, the SDK's updateItem) the form
// SECTION's step permission decides field writes. With no section permission at a step every write is refused (050313).
// Kissflow honours a step permission only when its column also lists it in Column::Permission (the back-ref the builder
// writes): at CIQP Request "keep" (21 Oct 09:51 UTC) the section permission with its back-ref let writes through, while the
// Uploads table's Editable permission without one was refused. The app flows' field permissions carry no back-ref, so
// inside an Editable section a field's own ReadOnly is ignored. At 09:55 UTC no CIQ flow's "Details" section had one.
//   node kissflow-build/ciq-digital/v7/section-perms.mjs [review|op]                  dry run: GET the live drafts (3 s apart, no
//                                                                                    retries), back them up, write the report
//   node kissflow-build/ciq-digital/v7/section-perms.mjs [review|op] --apply          re-read → must equal the dry run's backup →
//                                    [--accept-other]                                back up → PUT draft → publish → read back
//   node kissflow-build/ciq-digital/v7/section-perms.mjs [review|op] --offline <dir>  the report from saved drafts, no call
// --apply needs Thomas's OK and the two sessions' one-writer agreement for these flows. A publish publishes the WHOLE draft:
// the dry run also lists every live-draft difference from what v6 published (v6/backups + v6/backend-*-result.json), and
// --apply refuses while any is left besides this change, unless --accept-other says they were reviewed.
// The change only ADDS, at each department step, one Permission {Column: Details section, Permission: Editable}, appends
// its id to the step's Activity::Permission and to the section's Column::Permission; an Editable section permission
// already there without its back-ref gets the back-ref only. Every existing permission stays exactly as it is (asserted
// before the PUT and on the read-back), so Thomas's manual per-step field permissions are kept.
// A run that PUT but did not publish (publish error, timeout, stop) leaves v7/pending/<flow>.json; the next --apply, after
// a fresh dry run, publishes that very draft instead of reporting "nothing to add".
// GUARDS: DEV only; writes only the two flows; one call every 3 s; no automatic retries; a 429 or an HTML answer stops;
// backups are never overwritten.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer, preflight, kinds } from "../../lib/meta.mjs";
import { draftDiff, ents, clone } from "../v5/rehearsal/lib.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ACCEPT_OTHER = args.includes("--accept-other");
const OFFLINE = args.includes("--offline") ? args[args.indexOf("--offline") + 1] : null;
const FLOWS = {
  review: { id: "CIQ_Review_A00", stepPrefix: "Review – ", v6: "backend-review-result.json" },
  op: { id: "CIQ_Open_Point_A00", stepPrefix: "Open point – ", v6: "backend-op-result.json" },
};
const TARGETS = args.filter((a) => FLOWS[a]);
const targets = TARGETS.length ? TARGETS : Object.keys(FLOWS);
if (APPLY && OFFLINE) throw new Error("--apply and --offline exclude each other");
const SECTION = "Details";
const GAP_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = new Date().toISOString().replace(/[:.]/g, ""); // to the ms; backups are written with "wx", never overwritten
class Stop extends Error {}

// ---- calls: the meta.mjs writer (logged to v7/requests.jsonl without credentials), paced, retries 0
let w = null, last = Date.now();
const calls = [];
function conn() {
  if (w) return w;
  w = writer(here("./requests.jsonl"));
  if (w.acc !== "AcDOSunMEpSA" || w.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
  // the client retries 423/429/5xx by default; the writer calls w.kf.call, so this turns every retry off
  const kfCall = w.kf.call;
  w.kf.call = (method, path, body) => kfCall(method, path, body, { retries: 0 });
  return w;
}
async function paced(what, fn) {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  const r = await fn().finally(() => (last = Date.now()));
  calls.push(`${what} → ${r.status}`);
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body)))
    throw new Stop(`STOP: ${r.status === 429 ? "429" : `HTML challenge (${r.status})`} on ${what}. Both sessions pause 20 min (CLAUDE.md).`);
  return r;
}
async function getDraftStrict(id) {
  const r = await paced(`GET draft ${id}`, () => conn().getDraft("process", id));
  if (r.status !== 200 || !r.body || typeof r.body !== "object" || Array.isArray(r.body) || !r.body[id] || r.body.Root !== id)
    throw new Error(`getDraft ${id} → ${r.status}: not a JSON draft with model key ${id}; aborting before any change`);
  return r.body;
}
function readOffline(id) {
  const f = readdirSync(OFFLINE).filter((n) => n.includes(id) && n.endsWith(".json")).sort().pop();
  if (!f) throw new Error(`--offline: no saved draft of ${id} in ${OFFLINE}`);
  const j = JSON.parse(readFileSync(`${OFFLINE}/${f}`, "utf8"));
  return { draft: j.draft && j.draft.Root ? j.draft : j, file: `${OFFLINE}/${f}` };
}

// ---- reading a draft
const permsOf = (b, actId) => (b[actId]?.["Activity::Permission"] || []).map((id) => b[id]).filter(Boolean);
function colLabel(b, colId) {
  const c = b[colId];
  if (!c) return `(column ${colId} missing)`;
  if (c.Type === "Section") return `section ${c.Name}`;
  if (c.Type === "Model") return `table ${c.Name}`;
  return (c["Column::Field"] || []).join(",") || colId;
}
/** The Details section, its field ids (also in nested rows), and any table inside it. */
function sectionOf(b) {
  const root = b[b.Root];
  const secs = ents(b).filter((e) => e.Kind === "Column" && e.Type === "Section" && e.Name === SECTION);
  if (secs.length !== 1) throw new Error(`${b.Root}: ${secs.length} "${SECTION}" sections, expected 1`);
  const sec = secs[0], fields = [], tables = [];
  const walk = (colId) => {
    for (const rowId of b[colId]?.["Column::Row"] || [])
      for (const cid of b[rowId]?.["Row::Column"] || []) {
        const c = b[cid];
        if (!c) continue;
        if (c.Type === "Field") fields.push(...(c["Column::Field"] || []));
        else if (c.Type === "Model") tables.push(cid);
        else walk(cid);
      }
  };
  walk(sec.Id);
  const topLevel = (root["Model::Row"] || []).flatMap((r) => b[r]?.["Row::Column"] || []);
  return { sec, fields, tables, topTables: topLevel.filter((c) => b[c]?.Type === "Model") };
}
/** What a field drives inside the flow: a formula's input, a step condition, a step's assignee. */
function rolesOf(b) {
  const fieldIds = new Set(ents(b).filter((e) => e.Kind === "Field").map((f) => f.Id));
  const formulas = new Set(), roles = {};
  const tag = (f, t) => ((roles[f] = roles[f] || new Set()).add(t));
  for (const x of ents(b).filter((e) => e.Kind === "Expression")) {
    const refs = (x.ExpressionStr || "").match(/[A-Za-z_][A-Za-z0-9_]*/g)?.filter((t) => fieldIds.has(t)) || [];
    if (x.Field) { formulas.add(x.Field); refs.forEach((f) => tag(f, `formula input: ${x.Field}`)); }
    else if (x.Activity) refs.forEach((f) => tag(f, `step condition: ${b[x.Activity]?.Name}`));
  }
  for (const r of ents(b).filter((e) => e.Kind === "Resource" && e.ValueType === "Field")) tag(r.Field || r.Value, `assigns: ${b[r.Activity]?.Name}`);
  return { formulas, roles: (f) => [...(roles[f] || [])] };
}
const deptSteps = (b, prefix) => ents(b).filter((e) => e.Kind === "Activity" && e.NodeType === "UserTask" && e.Name?.startsWith(prefix));
const newPermId = (actId) => `Permission_sec${actId.replace(/^Activity_/, "")}`;

// ---- the change
function plan(live, spec) {
  const next = clone(live);
  const { sec, fields, tables, topTables } = sectionOf(live);
  const { formulas, roles } = rolesOf(live);
  const steps = deptSteps(live, spec.stepPrefix);
  if (steps.length !== 6) throw new Error(`${spec.id}: ${steps.length} department steps named "${spec.stepPrefix}…", expected 6`);
  const out = { section: { id: sec.Id, name: sec.Name, fields: fields.length, tablesInside: tables.map((t) => colLabel(live, t)) }, steps: [], added: [], refs: [], conflicts: [] };
  // the back-ref: without it in the section's Column::Permission the step permission is ignored on the API
  const ref = (id) => (next[sec.Id]["Column::Permission"] = [...(next[sec.Id]["Column::Permission"] || []), id], out.refs.push(id));
  for (const a of steps) {
    const ps = permsOf(live, a.Id);
    const onSec = ps.filter((p) => p.Column === sec.Id);
    const row = { step: a.Name, activity: a.Id };
    if (onSec.length) {
      const refd = (p) => (live[sec.Id]["Column::Permission"] || []).includes(p.Id);
      row.existing = onSec.map((p) => `${p.Id}: ${p.Permission}${refd(p) ? "" : " (no back-ref)"}`);
      if (onSec.length > 1 || onSec[0].Permission !== "Editable") out.conflicts.push(`${a.Name} · section ${SECTION}: live ${row.existing.join(", ")}; NOT changed`);
      else if (!refd(onSec[0])) { ref(onSec[0].Id); row.addRef = onSec[0].Id; }
    } else {
      const id = newPermId(a.Id);
      if (next[id]) throw new Error(`${id} already exists`);
      next[id] = { Id: id, Kind: "Permission", Column: sec.Id, Permission: "Editable", Activity: a.Id };
      next[a.Id]["Activity::Permission"] = [...(next[a.Id]["Activity::Permission"] || []), id];
      ref(id);
      row.add = next[id];
      out.added.push(id);
    }
    // the fields of the section a screen could now write here although their own permission says otherwise
    const fieldPerm = Object.fromEntries(fields.map((f) => [f, ps.filter((p) => p.Column === live[f]?.Column).map((p) => p.Permission)]));
    const levels = (f) => (fieldPerm[f].length ? fieldPerm[f].join("+") : "(no field permission)");
    row.opens = fields
      .filter((f) => !formulas.has(f) && !fieldPerm[f].some((l) => l === "Editable" || l === "Mandatory"))
      .map((f) => ({ field: f, type: live[f]?.Type, fieldPermission: levels(f), drives: roles(f) }));
    row.formulasInSection = fields.filter((f) => formulas.has(f)).map((f) => `${f} (${levels(f)}, computed)`);
    row.alreadyWritable = fields.filter((f) => !formulas.has(f) && fieldPerm[f].some((l) => l === "Editable" || l === "Mandatory"));
    out.steps.push(row);
  }
  // child tables: their own Model column carries a step permission; outside the section they are not covered by it
  out.childTables = topTables.map((t) => ({
    table: colLabel(live, t), column: t, inDetails: false,
    fields: (live[live[t]["Column::Model"]?.[0]]?.["Model::Field"] || []).length,
    perStep: Object.fromEntries(steps.map((a) => [a.Name, permsOf(live, a.Id).filter((p) => p.Column === t).map((p) => p.Permission).join("+") || "(none)"])),
  }));
  assertOnlyAdds(live, next, out.added, out.refs, sec.Id);
  return { next, out };
}
/** The draft may differ from the live one only by the new Permission entities, their ids appended to their steps, and the
 *  section permissions' ids appended to the section's Column::Permission. */
function assertOnlyAdds(live, next, added, refs, secId) {
  const d = draftDiff(live, next);
  const key = (label) => label.split(" ")[0];
  // a list may only grow: the old ids kept in order, followed by allowed new ones
  const grows = (p, ok) => !!p && Array.isArray(p.now) && JSON.stringify(p.now.slice(0, (p.was || []).length)) === JSON.stringify(p.was || []) &&
    p.now.slice((p.was || []).length).every(ok);
  const bad = [
    ...d.removed.map((x) => `removed ${x}`),
    ...d.added.filter((x) => !added.includes(key(x))).map((x) => `added ${x}`),
    ...d.changed.filter(({ entity, props }) => {
      const k = key(entity);
      if (Object.keys(props).length !== 1) return true;
      // the section: only its Column::Permission, by section permissions of this change
      if (k === secId) return !grows(props["Column::Permission"], (id) => refs.includes(id) && next[id]?.Kind === "Permission" && next[id].Column === secId);
      // a step: only its own permission list, by the new ones of this step
      return !grows(props["Activity::Permission"], (id) => added.includes(id) && next[id].Activity === k);
    }).map((x) => `changed ${x.entity}`),
  ];
  if (bad.length || d.added.length !== added.length) throw new Error(`the change is not add-only: ${bad.join("; ") || "added count"}`);
}

// ---- what else a publish would publish: the live draft against what v6 published (backup + its 11/22 changes)
function v6Published(spec) {
  const res = JSON.parse(readFileSync(here(`../v6/${spec.v6}`), "utf8"));
  const base = JSON.parse(readFileSync(here(`../${res.backup}`), "utf8"));
  const b = clone(base), applied = [], failed = [];
  for (const line of res.changes) {
    const m = line.match(/^(.+?) · (\w+): (\w+) → (\w+) \(/);
    const act = m && ents(b).find((e) => e.Kind === "Activity" && e.Name === m[1]);
    const p = act && permsOf(b, act.Id).find((x) => x.Column === b[m[2]]?.Column);
    if (!p || p.Permission !== m[3]) { failed.push(line); continue; }
    p.Permission = m[4];
    applied.push(`${m[1]} · ${m[2]}: ${m[3]} → ${m[4]}`);
  }
  b.PublishedAt = res.write?.publishedAt;
  return { blob: b, base: `v6/${res.backup.replace(/^v6\//, "")}`, publishedAt: res.write?.publishedAt, v6Changes: res.changes.length, applied: applied.length, failed };
}
const short = (v) => { const s = JSON.stringify(v); return s && s.length > 200 ? s.slice(0, 200) + "…" : v; };
function describe(pub, live) {
  const d = draftDiff(pub, live);
  const ent = (k) => live[k] || pub[k];
  const what = (k) => {
    const e = ent(k);
    if (e?.Kind === "Permission") return `permission ${live[e.Activity]?.Name || pub[e.Activity]?.Name} · ${colLabel(live[e.Column] ? live : pub, e.Column)}`;
    if (e?.Kind === "Field") return `field ${e.Id} (${e.Type})`;
    if (e?.Kind === "Activity") return `step ${e.Name || e.Id}`;
    if (e?.Kind === "Column") return `column ${colLabel(live[k] ? live : pub, k)}`;
    return `${e?.Kind || "?"} ${k}`;
  };
  const key = (label) => label.split(" ")[0];
  const props = (p) => Object.fromEntries(Object.entries(p).map(([n, { was, now }]) => {
    if (Array.isArray(was) || Array.isArray(now)) {
      const a = was || [], b = now || [];
      return [n, { added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)), reordered: a.length === b.length && a.every((x) => b.includes(x)) && JSON.stringify(a) !== JSON.stringify(b) }];
    }
    return [n, { was: short(was), now: short(now) }];
  }));
  return {
    added: d.added.map((l) => ({ id: key(l), what: what(key(l)), entity: short(live[key(l)]) })),
    removed: d.removed.map((l) => ({ id: key(l), what: what(key(l)), entity: short(pub[key(l)]) })),
    changed: d.changed.map((c) => ({ id: key(c.entity), what: what(key(c.entity)), props: props(c.props) })),
    publishedSinceV6: live.PublishedAt !== pub.PublishedAt ? `yes: live PublishedAt ${live.PublishedAt}, v6 ${pub.PublishedAt}` : "no",
  };
}

// ---- a publish left pending by an earlier --apply: written before its PUT, marked published after the publish
const pendingFile = (id) => here(`./pending/${id}.json`);
function pendingOf(id) {
  if (!existsSync(pendingFile(id))) return null;
  const j = JSON.parse(readFileSync(pendingFile(id), "utf8"));
  return j.status === "published" ? null : j;
}
const setPending = (id, j) => (mkdirSync(here("./pending"), { recursive: true }), writeFileSync(pendingFile(id), JSON.stringify(j)));
/** Each department step's section permission in a blob: Editable, and listed on the section column. */
const secCheck = (b, steps, secId, where) => steps.map((s) => {
  const refs = b[secId]?.["Column::Permission"] || [];
  const lv = permsOf(b, s.activity).filter((x) => x.Column === secId).map((x) => `${x.Permission}${refs.includes(x.Id) ? "" : " without back-ref"}`).join("+") || "(none)";
  return `${where} ${s.step} · section ${SECTION}: ${lv}${lv === "Editable" ? " OK" : " WANT Editable"}`;
});

// ---- run
const out = { at: new Date().toISOString(), mode: APPLY ? "apply" : OFFLINE ? "offline" : "dryrun", flows: {} };
const reportFile = here(`./section-perms-${out.mode === "apply" ? "result" : out.mode}.json`);
const save = () => writeFileSync(reportFile, JSON.stringify({ ...out, calls }, null, 1));
mkdirSync(here("./backups"), { recursive: true });
try {
  for (const t of targets) {
    const spec = FLOWS[t];
    const f = (out.flows[t] = { flow: spec.id });
    let live;
    if (OFFLINE) ({ draft: live, file: f.source } = readOffline(spec.id));
    else {
      live = await getDraftStrict(spec.id);
      f.backup = `v7/backups/${spec.id}.${APPLY ? "before-apply" : "dryrun"}.${stamp}.json`;
      writeFileSync(here(`../${f.backup}`), JSON.stringify(live), { flag: "wx" });
    }
    f.live = { PublishedAt: live.PublishedAt, _meta_version: live._meta_version, kinds: kinds(live) };
    const { next, out: p } = plan(live, spec);
    Object.assign(f, p);
    const pf = preflight(spec.id, next);
    f.preflight = { errors: pf.errors, warnings: pf.warnings.map((x) => `${x.code}: ${x.msg}`) };
    const pub = v6Published(spec);
    f.otherThanV6 = { base: pub.base, publishedAt: pub.publishedAt, v6Changes: `${pub.applied}/${pub.v6Changes} re-applied`, failed: pub.failed, ...describe(pub.blob, live) };
    // what a publish would publish besides this change: the draft with it against v6's published draft with the same plan
    // on it (the new ids are fixed, so equal drafts give equal plans)
    let besides;
    try { besides = draftDiff(plan(pub.blob, spec).next, next); } catch (e) { besides = { error: e.message }; }
    const nOther = besides.error ? Infinity : besides.added.length + besides.removed.length + besides.changed.length;
    f.otherThanV6.besidesThisChange = besides.error || { added: besides.added, removed: besides.removed, changed: besides.changed.map((c) => c.entity) };
    const pending = pendingOf(spec.id);
    if (pending) f.pendingPublish = { since: pending.at, dryBackup: pending.dryBackup };
    f.applyWould = p.conflicts.length ? "refuse: conflicts" : p.added.length || p.refs.length ? "PUT + publish" : pending ? `publish only: the PUT of ${pending.at}` : "nothing";
    if (!APPLY) continue;

    // ---- apply: only onto the very draft the dry run reported
    const dry = JSON.parse(readFileSync(here("./section-perms-dryrun.json"), "utf8")).flows?.[t];
    if (!dry?.backup) throw new Error(`${spec.id}: no dry-run backup; run the dry run first`);
    const drift = draftDiff(JSON.parse(readFileSync(here(`../${dry.backup}`), "utf8")), live);
    if (drift.added.length || drift.removed.length || drift.changed.length)
      throw new Error(`${spec.id}: the live draft changed since the dry run (${drift.added.length} added, ${drift.removed.length} removed, ${drift.changed.length} changed); re-run the dry run and re-check`);
    if (JSON.stringify(dry.added) !== JSON.stringify(p.added) || JSON.stringify(dry.refs || []) !== JSON.stringify(p.refs)) throw new Error(`${spec.id}: the plan differs from the dry run's`);
    if (p.conflicts.length) throw new Error(`${spec.id}: conflicts, nothing written: ${p.conflicts.join("; ")}`);
    const publishOnly = !p.added.length && !p.refs.length;
    if (publishOnly && !pending) { f.write = "nothing to add, and no publish of ours is pending"; continue; }
    if (publishOnly) {
      // our earlier PUT landed but was not published: publish that very draft, nothing else
      const d = draftDiff(pending.next, live);
      if (d.added.length || d.removed.length || d.changed.length)
        throw new Error(`${spec.id}: a publish of ours is pending (PUT ${pending.at}), but the draft changed since (${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed); check by hand`);
    }
    if (pf.errors.length) throw new Error(`${spec.id}: preflight errors, nothing written`);
    if (nOther && !ACCEPT_OTHER)
      throw new Error(`${spec.id}: the draft holds ${besides.error ? `an unknown number of (${besides.error})` : nOther} difference(s) from what v6 published besides this change` +
        `${f.otherThanV6.publishedSinceV6 === "no" ? "" : ", some perhaps published since"}; a publish would publish them too. Review otherThanV6 in the dry-run report, then add --accept-other`);
    const restore = publishOnly ? pending.dryBackup : dry.backup; // the draft before this change (the drift check proved it)
    f.write = {};
    if (publishOnly) f.write.publishOnly = `the PUT of ${pending.at}`;
    else {
      setPending(spec.id, { flow: spec.id, at: new Date().toISOString(), status: "put", dryBackup: dry.backup, next });
      const put = await paced(`PUT draft ${spec.id}`, () => conn().putDraft("process", spec.id, next));
      f.write.putDraft = put.status;
      if (put.status >= 300) { f.write.body = short(put.body); throw new Error(`${spec.id}: PUT ${put.status}`); }
    }
    const pubr = await paced(`publish ${spec.id}`, () => conn().publish("process", spec.id));
    f.write.publish = pubr.status;
    if (pubr.status >= 300) { f.write.body = short(pubr.body); throw new Error(`${spec.id}: publish ${pubr.status} (the draft is PUT, not published: a fresh dry run, then --apply publishes it; or restore ${restore})`); }
    const back = await getDraftStrict(spec.id);
    f.write.publishedAt = back.PublishedAt;
    const published = !!back.PublishedAt && back.PublishedAt > (live.PublishedAt || "");
    if (published) { const cur = pendingOf(spec.id); if (cur) setPending(spec.id, { flow: cur.flow, at: cur.at, dryBackup: cur.dryBackup, status: "published", publishedAt: back.PublishedAt }); }
    f.readBack = [`published: PublishedAt ${live.PublishedAt} → ${back.PublishedAt}${published ? " OK" : " WANT a newer PublishedAt"}`, ...secCheck(back, p.steps, p.section.id, "draft")];
    // the published version itself: the publish answers with the runtime Blob
    const blob = pubr.body?.Blob;
    if (blob && typeof blob === "object" && blob[spec.id]) f.readBack.push(...secCheck(blob, p.steps, p.section.id, "published"));
    else f.write.publishedBlob = "not in the publish answer; checked on the draft only";
    // every permission that was there before is still there, with the same value
    const lost = ents(live).filter((e) => e.Kind === "Permission" && JSON.stringify(back[e.Id]) !== JSON.stringify(e)).map((e) => e.Id);
    const unlisted = ents(live).filter((e) => e.Kind === "Activity").filter((a) => !(a["Activity::Permission"] || []).every((id) => (back[a.Id]?.["Activity::Permission"] || []).includes(id))).map((a) => a.Name || a.Id);
    f.readBack.push(`existing permissions: ${lost.length ? `${lost.length} changed or missing (${lost.slice(0, 5).join(", ")}) WANT 0` : "all kept OK"}`);
    f.readBack.push(`step permission lists: ${unlisted.length ? `${unlisted.join(", ")} lost ids WANT 0` : "all kept OK"}`);
    const after = draftDiff(next, back);
    f.serverSideDiff = { added: after.added.length, removed: after.removed.length, changed: after.changed.length };
    const nAfter = after.added.length + after.removed.length + after.changed.length;
    f.readBack.push(`server-side changes to the PUT draft: ${nAfter ? `${nAfter} (${[...after.added, ...after.removed, ...after.changed.map((c) => c.entity)].slice(0, 5).join(", ")}) WANT 0` : "none OK"}`);
    f.readBackFails = f.readBack.filter((x) => !x.endsWith(" OK")).length;
    save();
    if (f.readBackFails) throw new Error(`${spec.id}: read-back failed; stopping before the next flow`);
  }
} catch (e) {
  out.error = e.message;
  save();
  console.error(e.message);
  process.exit(e instanceof Stop ? 2 : 1);
}
save();
for (const [t, f] of Object.entries(out.flows))
  console.log(t, f.flow, "| add", (f.added || []).length, "| back-refs", (f.refs || []).length, "| conflicts", (f.conflicts || []).length,
    "| opens", (f.steps || []).map((s) => s.opens.length).join("/"),
    "| other than v6:", `${f.otherThanV6.added.length} added, ${f.otherThanV6.removed.length} removed, ${f.otherThanV6.changed.length} changed`,
    "| besides this change:", typeof f.otherThanV6.besidesThisChange === "string" ? f.otherThanV6.besidesThisChange
      : Object.values(f.otherThanV6.besidesThisChange).reduce((n, l) => n + l.length, 0),
    "| apply would:", f.applyWould, f.write ? `| write ${JSON.stringify(f.write)}` : "",
    f.readBack ? `| read back fails ${f.readBackFails}` : "");
console.log(calls.join("\n"), "\n→", reportFile);
