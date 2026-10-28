// Build the CIQ Supplier Portal backend over REST, phase by phase, idempotently.
//   node kissflow-build/ciq-supplier-portal/build-portal.mjs roles|lists|flows|grants|cleanup|all
//   node kissflow-build/ciq-supplier-portal/build-portal.mjs flows [P1|"CIQP Request"] --dry-run   (diff only; writes nothing)
// State (server ids) → build-state.json; every request → build-requests.jsonl (no credentials).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer, mergeClean, preflight } from "../lib/meta.mjs";
import { buildForm, addWorkflow, addChildTable } from "../../tools/kissflow-app-agents-1.6.0/engine/builders.mjs";
import { slug } from "../../tools/kissflow-app-agents-1.6.0/engine/util.mjs";
import { PORTAL, ROLES, DEFAULT_ROLES, TEST_USER, TEST_USER_ROLES, LISTS, LISTS_TO_DELETE, FLOWS, GRANTS } from "./portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const STATE = here("./build-state.json");
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { roles: {}, lists: {}, flows: {}, log: [] };
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
const w = writer(here("./build-requests.jsonl"));
const A = w.acc;
const note = (msg) => { console.log(msg); state.log.push({ at: new Date().toISOString(), msg }); save(); };
const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── roles ──
async function roles() {
  const existing = rows((await w.call("GET", `/app_role/2/${A}/list?_application_id=${PORTAL}&page_number=1&page_size=100`)).body);
  const byName = Object.fromEntries(existing.map((r) => [r.Name.trim().toLowerCase(), r._id]));
  for (const r of [...DEFAULT_ROLES.map((name) => ({ name })), ...ROLES]) {
    let id = byName[r.name.toLowerCase()];
    if (!id && r.renameFrom && byName[r.renameFrom.toLowerCase()]) {
      // rename in place (keeps the role id and its members); verified by per-role GET
      const oldId = byName[r.renameFrom.toLowerCase()];
      const cur = (await w.call("GET", `/app_role/2/${A}/${oldId}?_application_id=${PORTAL}`)).body || {};
      const users = (cur.Members || []).filter((m) => m.Kind === "User").map((m) => ({ _id: m._id, Name: m.Name, Kind: "User" }));
      const put = await w.call("PUT", `/app_role/2/${A}/${oldId}?_application_id=${PORTAL}`, { Name: r.name, Description: r.desc || "", _application_id: PORTAL, Users: users });
      const back = (await w.call("GET", `/app_role/2/${A}/${oldId}?_application_id=${PORTAL}`)).body || {};
      note(`role ${r.renameFrom} → rename to ${r.name}: ${put.status}; read back name "${back.Name}", members ${back.UserCount} (before ${cur.UserCount})`);
      if (back.Name === r.name) { id = oldId; delete state.roles[r.renameFrom]; }
    }
    if (!id) {
      const cr = await w.call("POST", `/app_role/2/${A}/`, { Name: r.name, Description: r.desc || "", _application_id: PORTAL });
      id = cr.body?._id;
      note(`role ${r.name} → create ${cr.status} ${id || JSON.stringify(cr.body).slice(0, 160)}`);
    }
    if (id) state.roles[r.name] = id;
  }
  save();
  // test membership (retry + verify by per-role GET; the PUT is flaky and silently no-ops on wrong shapes)
  for (const name of TEST_USER_ROLES) {
    const id = state.roles[name];
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      const g = (await w.call("GET", `/app_role/2/${A}/${id}?_application_id=${PORTAL}`)).body || {};
      const members = (g.Members || g.Users || []).map((u) => u._id);
      if (members.includes(TEST_USER._id)) { ok = true; break; }
      const desc = ROLES.find((r) => r.name === name)?.desc || "";
      const put = await w.call("PUT", `/app_role/2/${A}/${id}?_application_id=${PORTAL}`, { Name: name, Description: desc, _application_id: PORTAL, Users: [TEST_USER] });
      if (put.status >= 300) await sleep(800 * (i + 1));
    }
    note(`member ${TEST_USER.Name} in ${name}: ${ok ? "verified" : "re-check"}`);
  }
}

// ── lists ──
async function lists() {
  const existing = rows((await w.listFlows("list", PORTAL)).body);
  for (const l of LISTS) {
    let id = existing.find((x) => x.Name === l.name)?._id || state.lists[l.name];
    if (!id) {
      const cr = await w.createFlow("list", PORTAL, l.name, `CIQ supplier portal option set (${l.items.length} values).`);
      id = cr.body?._id;
      note(`list ${l.name} → create ${cr.status} ${id || JSON.stringify(cr.body).slice(0, 160)}`);
      if (!id) continue;
    }
    state.lists[l.name] = id; save();
    const cur = (await w.getListItems(id)).body;
    const curItems = Array.isArray(cur) ? cur : cur?.ListItems || [];
    if (JSON.stringify(curItems) !== JSON.stringify(l.items)) {
      const put = await w.putListItems(id, l.items);
      const back = (await w.getListItems(id)).body;
      const backItems = Array.isArray(back) ? back : back?.ListItems || [];
      note(`list ${l.name} items → ${put.status}; read back ${JSON.stringify(backItems) === JSON.stringify(l.items) ? "MATCH" : "MISMATCH " + JSON.stringify(backItems)}`);
    } else note(`list ${l.name} items already match`);
  }
}

// ── flows ──
function buildBlob(spec, serverId) {
  const fields = spec.fields.map((f) => (f.referredList ? { ...f, referredList: state.lists[f.referredList] } : f));
  const built = buildForm({ id: serverId, name: spec.name, flowType: spec.flowType, description: spec.description, fields }, PORTAL);
  if (spec.child) {
    const childFields = spec.child.fields.map((f) => (f.referredList ? { ...f, referredList: state.lists[f.referredList] } : f));
    addChildTable(built, { id: `${serverId}_${slug(spec.child.label)}`, name: spec.child.name, fields: childFields }, spec.child.label, {});
  }
  if (spec.flowType === "Process") {
    const steps = spec.steps.map((s, i) => (i === 0 && spec.readOnlyAtStart ? { ...s, field_permissions: { ...Object.fromEntries(spec.readOnlyAtStart.map((f) => [f, "ReadOnly"])), ...(s.field_permissions || {}) } } : s));
    const roleIds = Object.fromEntries(Object.entries(state.roles));
    addWorkflow(built, steps.map((s) => (s.assignee ? { ...s, actor: "Admin" } : s)), roleIds); // placeholder actor, replaced below
    // field-driven assignees (shape verified by spike K-04: ValueType Field + Value + Field = field id)
    for (const s of steps.filter((x) => x.assignee)) {
      const fid = s.assignee.replace(/^field:/, "");
      const act = Object.values(built.blob).find((e) => e?.Kind === "Activity" && e.Name === s.name);
      const rId = act["Activity::Resource"][0];
      built.blob[rId] = { Id: rId, Kind: "Resource", ValueType: "Field", DisplayValue: fid.replace(/_/g, " "), Value: fid, Field: fid, Activity: act.Id };
    }
  }
  return built.blob;
}

async function flows(only) {
  const selected = FLOWS.filter((f) => !only || f.key === only || f.name === only);
  if (!selected.length) { console.error(`0 flows matched "${only}" (use a flow key like P1 or its exact name)`); process.exit(1); }
  for (const spec of selected) {
    const type = spec.flowType === "Process" ? "process" : "form";
    const existing = rows((await w.listFlows(type, PORTAL)).body);
    let id = existing.find((x) => x.Name === spec.name)?._id || state.flows[spec.name]?.id;
    if (!id && DRY_RUN) { console.log(`flow ${spec.name} → would be CREATED (dry run: nothing written)`); continue; }
    if (!id) {
      const cr = await w.createFlow(type, PORTAL, spec.name, spec.description);
      id = cr.body?._id;
      note(`flow ${spec.name} → create ${cr.status} ${id || JSON.stringify(cr.body).slice(0, 200)}`);
      if (!id) continue;
    }
    // merge, never replace: the record carries `published`, which the grants phase relies on (a dry run writes nothing)
    if (!DRY_RUN) { state.flows[spec.name] = { ...state.flows[spec.name], id, type }; save(); }
    const gd = await w.getDraft(type, id);
    const starter = gd.body;
    // guard (14 Oct): a 429 Cloudflare challenge returns an HTML string; never merge or PUT anything but a real draft
    if (gd.status !== 200 || !starter || typeof starter !== "object" || !starter[id]) { note(`flow ${spec.name} → ABORT: live draft not readable (status ${gd.status}${typeof starter === "string" ? ", non-JSON body" : ""}); nothing written`); continue; }
    const blob = buildBlob(spec, id);
    const merged = mergeClean(starter, blob, id);
    const pf = preflight(id, merged);
    if (pf.errors.length) { (DRY_RUN ? console.log : note)(`flow ${spec.name} → PREFLIGHT ERRORS ${JSON.stringify(pf.errors).slice(0, 600)}`); continue; }
    if (DRY_RUN) { console.log(JSON.stringify({ flow: spec.name, id, diff: draftDiff(starter, merged) }, null, 1)); continue; }
    const pd = await w.putDraft(type, id, merged);
    const pub = pd.status < 300 ? await w.publish(type, id) : { status: -1, body: null };
    state.flows[spec.name].published = pub.status < 300; save();
    note(`flow ${spec.name} (${id}) → draft ${pd.status}, publish ${pub.status}${pub.status >= 300 ? " " + JSON.stringify(pub.body).slice(0, 300) : ""}`);
  }
}

/** Entity-level difference between the live draft and the one the build would PUT (dry run; read-only). */
function draftDiff(live, next) {
  const label = (k, e) => `${k} ${e?.Kind ?? "?"} ${e?.Name ?? e?.Id ?? ""}`.trim();
  const keys = new Set([...Object.keys(live || {}), ...Object.keys(next || {})]);
  const out = { added: [], removed: [], changed: [] };
  for (const k of keys) {
    if (!(k in (live || {}))) out.added.push(label(k, next[k]));
    else if (!(k in (next || {}))) out.removed.push(label(k, live[k]));
    else if (JSON.stringify(live[k]) !== JSON.stringify(next[k])) {
      const props = [...new Set([...Object.keys(live[k] || {}), ...Object.keys(next[k] || {})])].filter((p) => JSON.stringify(live[k]?.[p]) !== JSON.stringify(next[k]?.[p]));
      out.changed.push({ entity: label(k, next[k]), props: Object.fromEntries(props.map((p) => [p, { live: live[k]?.[p], next: next[k]?.[p] }])) });
    }
  }
  return out;
}

// ── grants ──
const GRANT_SHAPE = {
  Process: { M: { Role: "Member", Permission: [] }, I: { Role: "Member", Permission: ["InitiateItems"] }, V: { Role: "Member", Permission: ["View"] }, "I+V": { Role: "Member", Permission: ["InitiateItems", "View"] }, A: { Role: "Admin", Permission: [] } },
  Form: { V: { Role: "Viewer", Permission: [] }, E: { Role: "Member", Permission: ["Delete"] }, A: { Role: "Admin", Permission: [] } },
};
async function grants() {
  for (const [flowName, byRole] of Object.entries(GRANTS)) {
    const f = state.flows[flowName];
    if (!f?.published) { note(`grants ${flowName} → skipped (flow not published)`); continue; }
    const shapeSet = GRANT_SHAPE[f.type === "process" ? "Process" : "Form"];
    const body = Object.entries(byRole).map(([role, code]) => ({ _id: state.roles[role], Name: role, _application_id: PORTAL, Kind: "AppRole", ...shapeSet[code] }));
    let r;
    for (let i = 0; i < 5; i++) { r = await w.call("POST", `/flow/2/${A}/${f.type}/${f.id}/member/batch?_application_id=${PORTAL}`, body); if (r.status !== 423) break; await sleep(1500); }
    // remove members the spec does not list (DELETE …/member/{roleId}, verified 2026-10-07), then read back
    const before = rows((await w.call("GET", `/flow/2/${A}/${f.type}/${f.id}/member?_application_id=${PORTAL}`)).body);
    for (const m of before.filter((m) => !Object.keys(byRole).some((n) => state.roles[n] === m._id))) {
      const d = await w.call("DELETE", `/flow/2/${A}/${f.type}/${f.id}/member/${m._id}?_application_id=${PORTAL}`);
      note(`grants ${flowName} → removed ${m.Name} (${m.Role} ${JSON.stringify(m.Permission)}): ${d.status}`);
    }
    const back = rows((await w.call("GET", `/flow/2/${A}/${f.type}/${f.id}/member?_application_id=${PORTAL}`)).body);
    const diffs = [];
    for (const [role, code] of Object.entries(byRole)) {
      const want = shapeSet[code], got = back.find((m) => m._id === state.roles[role]);
      if (!got) diffs.push(`${role}: missing`);
      else if (got.Role !== want.Role || JSON.stringify([...(got.Permission || [])].sort()) !== JSON.stringify([...want.Permission].sort())) diffs.push(`${role}: got ${got.Role} ${JSON.stringify(got.Permission)} want ${want.Role} ${JSON.stringify(want.Permission)}`);
    }
    const extra = back.filter((m) => !Object.values(state.roles).includes(m._id) || !Object.keys(byRole).some((n) => state.roles[n] === m._id)).map((m) => `${m.Name}(${m.Role} ${JSON.stringify(m.Permission)})`);
    note(`grants ${flowName} → ${r.status}; read back ${diffs.length ? "DIFF " + diffs.join("; ") : "MATCH"}${extra.length ? "; other members: " + extra.join(", ") : ""}`);
  }
}

// ── cleanup: delete roles and lists the spec no longer has (after flows and grants no longer use them) ──
async function cleanup() {
  const keep = new Set([...DEFAULT_ROLES, ...ROLES.map((r) => r.name)].map((n) => n.toLowerCase()));
  const existing = rows((await w.call("GET", `/app_role/2/${A}/list?_application_id=${PORTAL}&page_number=1&page_size=100`)).body);
  for (const r of existing.filter((x) => !keep.has(x.Name.trim().toLowerCase()))) {
    const d = await w.call("DELETE", `/app_role/2/${A}/${r._id}?_application_id=${PORTAL}`);
    note(`role ${r.Name} (${r._id}) → delete ${d.status}${d.status >= 300 ? " " + JSON.stringify(d.body).slice(0, 200) : ""}`);
    if (d.status < 300) delete state.roles[r.Name];
  }
  const after = rows((await w.call("GET", `/app_role/2/${A}/list?_application_id=${PORTAL}&page_number=1&page_size=100`)).body).map((r) => r.Name);
  note(`roles after cleanup: ${after.join(", ")}`);
  const lists = rows((await w.listFlows("list", PORTAL)).body);
  for (const name of LISTS_TO_DELETE) {
    const l = lists.find((x) => x.Name === name);
    if (!l) { note(`list ${name} → already absent`); continue; }
    const d = await w.call("DELETE", `/flow/2/${A}/list/${l._id}`);
    note(`list ${name} (${l._id}) → delete ${d.status}${d.status >= 300 ? " " + JSON.stringify(d.body).slice(0, 200) : ""}`);
    if (d.status < 300) delete state.lists[name];
  }
  const listsAfter = rows((await w.listFlows("list", PORTAL)).body).map((l) => l.Name);
  note(`lists after cleanup: ${listsAfter.join(", ")}`);
  save();
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const phase = positional[0] || "all";
const only = positional[1];
const DRY_RUN = process.argv.includes("--dry-run"); // flows only: diff against the live draft, write nothing
if (DRY_RUN && phase !== "flows") { console.error("--dry-run works only with the flows phase: `build-portal.mjs flows [flow] --dry-run`"); process.exit(1); }
if (phase === "roles" || phase === "all") await roles();
if (phase === "lists" || phase === "all") await lists();
if (phase === "flows" || phase === "all") await flows(only);
if (phase === "grants" || phase === "all") await grants();
if (phase === "cleanup" || phase === "all") await cleanup();
