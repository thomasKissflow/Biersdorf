// Read-only verification of the live portal against portal-spec.mjs. GET requests only.
//   node kissflow-build/ciq-supplier-portal/verify-portal.mjs  → verify-report.json + printed PASS/FAIL lines
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../lib/kf.mjs";
import { slug } from "../../tools/kissflow-app-agents-1.6.0/engine/util.mjs";
import { PORTAL, ROLES, DEFAULT_ROLES, TEST_USER, TEST_USER_ROLES, LISTS, LISTS_TO_DELETE, FLOWS, GRANTS } from "./portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const state = JSON.parse(readFileSync(here("./build-state.json"), "utf8"));
const kf = client({ readOnly: true });
const A = kf.acc;
const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);
const checks = [];
const check = (area, what, pass, detail = "") => { checks.push({ area, what, pass, detail }); if (!pass) console.log(`FAIL ${area} · ${what} ${detail}`); };

// roles
const roleList = rows((await kf.get(`/app_role/2/${A}/list?_application_id=${PORTAL}&page_number=1&page_size=100`)).body);
for (const r of ROLES) check("roles", `${r.name} exists`, roleList.some((x) => x.Name === r.name && x._id === state.roles[r.name]));
for (const name of TEST_USER_ROLES) {
  const g = (await kf.get(`/app_role/2/${A}/${state.roles[name]}?_application_id=${PORTAL}`)).body || {};
  check("roles", `${TEST_USER.Name} member of ${name}`, (g.Members || []).some((u) => u._id === TEST_USER._id), `UserCount=${g.UserCount}`);
}
const sup = (await kf.get(`/app_role/2/${A}/${state.roles["Supplier"]}?_application_id=${PORTAL}`)).body || {};
check("roles", "Supplier has no internal (Kissflow/Beiersdorf) test member", !(sup.Members || []).some((u) => u._id === TEST_USER._id), `UserCount=${sup.UserCount}`);
const wantRoles = [...DEFAULT_ROLES, ...ROLES.map((r) => r.name)].sort();
check("roles", `exactly these roles: ${wantRoles.join(", ")}`, JSON.stringify(roleList.map((r) => r.Name).sort()) === JSON.stringify(wantRoles), JSON.stringify(roleList.map((r) => r.Name)));
for (const name of ["CIQP Supplier Contact"]) check("roles", `old role name "${name}" no longer exists`, !roleList.some((r) => r.Name === name));

// lists
for (const l of LISTS) {
  const b = (await kf.get(`/flow/2/${A}/list/${state.lists[l.name]}/items`)).body;
  const items = Array.isArray(b) ? b : b?.ListItems || [];
  check("lists", `${l.name} values`, JSON.stringify(items) === JSON.stringify(l.items), JSON.stringify(items));
}
const listNames = rows((await kf.get(`/flow/2/${A}/list/?_application_id=${PORTAL}&page_number=1&page_size=300`)).body).map((l) => l.Name);
for (const n of LISTS_TO_DELETE) check("lists", `${n} removed`, !listNames.includes(n), JSON.stringify(listNames));

// flows
const inventory = {};
for (const t of ["process", "form", "case", "list", "dataset"]) inventory[t] = rows((await kf.get(`/flow/2/${A}/${t}/?_application_id=${PORTAL}&page_number=1&page_size=300`)).body).map((f) => f.Name);
const expectedNames = FLOWS.map((f) => f.name);
for (const n of expectedNames) check("inventory", `${n} listed`, [...inventory.process, ...inventory.form].includes(n));
const unexpected = [...inventory.process, ...inventory.form, ...inventory.case, ...inventory.dataset].filter((n) => !expectedNames.includes(n));
check("inventory", "no unexpected flows (except ZZ spikes)", unexpected.every((n) => n.startsWith("ZZ Spike")), JSON.stringify(unexpected));

for (const spec of FLOWS) {
  const f = state.flows[spec.name];
  const type = f.type;
  const d = (await kf.get(`/metadata/2/${A}/${type}/${f.id}/draft`)).body || {};
  const ent = Object.values(d).filter((e) => e && typeof e === "object");
  const area = spec.name;
  check(area, "model id + type", d[f.id]?.FlowType === spec.flowType, `${d[f.id]?.FlowType}`);
  check(area, "description ≤ 250", (spec.description || "").length <= 250);
  // fields
  const allSpecFields = [...spec.fields, ...(spec.child ? spec.child.fields.map((x) => ({ ...x, child: true })) : [])];
  for (const sf of allSpecFields) {
    const id = sf.child && d[slug(sf.name)] === undefined ? Object.keys(d).find((k) => k.endsWith("_" + slug(sf.name))) : slug(sf.name);
    const fe = d[id];
    if (!fe || fe.Kind !== "Field") { check(area, `field ${sf.name}`, false, "missing"); continue; }
    const okType = fe.Type === sf.type;
    const okReq = !!fe.Required === !!sf.required;
    const okList = !sf.referredList || fe.ReferredList === state.lists[sf.referredList];
    check(area, `field ${id}`, okType && okReq && okList, okType && okReq && okList ? "" : `type=${fe.Type} req=${fe.Required} list=${fe.ReferredList}`);
  }
  const extraFields = ent.filter((e) => e.Kind === "Field" && !e.IsSystemField && !String(e.Id).startsWith("_") && e.Id !== "Name" && !allSpecFields.some((sf) => e.Id === slug(sf.name) || String(e.Id).endsWith("_" + slug(sf.name)))).map((e) => e.Id);
  check(area, "no unexpected fields", extraFields.length === 0, JSON.stringify(extraFields));
  {
    // the draft is not what users get: every spec field must also be PUBLISHED, with the same type and Required flag
    const family = spec.flowType === "Process" ? "process" : "form";
    const live = (await kf.get(`/${family}/2/${A}/${f.id}/allfields?_application_id=${PORTAL}`)).body?.[f.id];
    const runtime = new Map((live?.Fields || []).map((x) => [x.Id, x]));
    const notLive = spec.fields.map((sf) => slug(sf.name)).filter((id) => !runtime.has(id));
    check(area, "every spec field is published (runtime allfields)", !!live && notLive.length === 0, live ? JSON.stringify(notLive) : "allfields unreadable");
    const differs = spec.fields.filter((sf) => runtime.has(slug(sf.name))).filter((sf) => { const x = runtime.get(slug(sf.name)); return x.Type !== sf.type || !!x.Required !== !!sf.required; }).map((sf) => { const x = runtime.get(slug(sf.name)); return `${slug(sf.name)}: published ${x.Type}${x.Required ? " required" : ""}, spec ${sf.type}${sf.required ? " required" : ""}`; });
    check(area, "published types and Required flags match the spec", !!live && differs.length === 0, JSON.stringify(differs));
  }
  if (spec.child) {
    const childModels = d[f.id]?.["Model::Model"] || [];
    check(area, "child table declared (Model::Model)", childModels.length === 1, JSON.stringify(childModels));
    const af = (await kf.get(`/process/2/${A}/${f.id}/allfields?_application_id=${PORTAL}`)).body;
    const tables = af?.[f.id]?.Tables || [];
    check(area, "runtime allfields exposes the child table", tables.length >= 1, JSON.stringify(tables).slice(0, 200));
  }
  if (spec.flowType !== "Process") continue;
  // workflow
  const pdId = d[f.id]?.RootProcessDef;
  const acts = (d[pdId]?.["ProcessDef::Activity"] || []).map((a) => d[a]);
  check(area, "step names in order", JSON.stringify(acts.map((a) => a?.Name)) === JSON.stringify(spec.steps.map((s) => s.name)), JSON.stringify(acts.map((a) => a?.Name)));
  check(area, "Start/End node types", acts[0]?.NodeType === "StartEvent" && acts.at(-1)?.NodeType === "EndEvent" && acts.slice(1, -1).every((a) => a.NodeType === "UserTask"));
  const cols = ent.filter((e) => e.Kind === "Column" && (e.Type === "Field" || e.Type === "Model") && (d[e.Row]?.Model === f.id || (e.Type === "Field" && d[(e["Column::Field"] || [])[0]]?.Model === f.id))).map((e) => e.Id);
  spec.steps.forEach((s, i) => {
    const a = acts[i];
    if (!a) return;
    const perms = (a["Activity::Permission"] || []).map((p) => d[p]);
    const byCol = {};
    for (const p of perms) byCol[p.Column] = (byCol[p.Column] || 0) + 1;
    check(area, `${s.name}: one permission per column`, cols.every((c) => byCol[c] === 1) && Object.values(byCol).every((n) => n === 1), `cols=${cols.length} perms=${perms.length}`);
    // overrides
    const want = { ...(i === 0 ? Object.fromEntries((spec.readOnlyAtStart || []).map((x) => [x, "ReadOnly"])) : {}), ...(s.field_permissions || {}) };
    for (const [fname, level] of Object.entries(want)) {
      const fe = d[slug(fname)];
      const col = fe?.Column || ent.find((e) => e.Kind === "Column" && e.Type === "Model" && e.Name === fname)?.Id;
      const got = perms.find((p) => p.Column === col)?.Permission;
      check(area, `${s.name}: ${fname} = ${level}`, got === level, `got ${got}`);
    }
    if (a.NodeType === "UserTask") {
      const res = (a["Activity::Resource"] || []).map((r) => d[r]);
      if (s.assignee) {
        const fid = s.assignee.replace(/^field:/, "");
        check(area, `${s.name}: assignee = field ${fid}`, res.length === 1 && res[0].ValueType === "Field" && res[0].Value === fid && res[0].Field === fid, JSON.stringify(res));
      } else {
        check(area, `${s.name}: assignee = role ${s.actor}`, res.length === 1 && res[0].ValueType === "AppRole" && res[0].Value === state.roles[s.actor], JSON.stringify(res));
      }
      const ex = (a["Activity::Expression"] || []).map((x) => d[x]);
      if (s.condition) check(area, `${s.name}: condition ${s.condition}`, ex.length === 1 && ex[0].ExpressionStr === s.condition && (ex[0]["Expression::Node"] || []).length === 1, JSON.stringify(ex.map((x) => x?.ExpressionStr)));
      else check(area, `${s.name}: unconditional`, ex.length === 0);
    }
  });
}

// grants (Role AND Permission compared, not just presence)
const GRANT_SHAPE = {
  Process: { M: { Role: "Member", Permission: [] }, I: { Role: "Member", Permission: ["InitiateItems"] }, V: { Role: "Member", Permission: ["View"] }, "I+V": { Role: "Member", Permission: ["InitiateItems", "View"] }, A: { Role: "Admin", Permission: [] } },
  Form: { V: { Role: "Viewer", Permission: [] }, E: { Role: "Member", Permission: ["Delete"] }, A: { Role: "Admin", Permission: [] } },
};
for (const [flowName, byRole] of Object.entries(GRANTS)) {
  const f = state.flows[flowName];
  const back = rows((await kf.get(`/flow/2/${A}/${f.type}/${f.id}/member?_application_id=${PORTAL}`)).body);
  for (const [role, code] of Object.entries(byRole)) {
    const m = back.find((x) => x._id === state.roles[role]);
    const want = GRANT_SHAPE[f.type === "process" ? "Process" : "Form"][code];
    const same = !!m && m.Role === want.Role && JSON.stringify([...(m.Permission || [])].sort()) === JSON.stringify([...want.Permission].sort());
    check("grants", `${flowName} · ${role} = ${code}`, same, m ? `got ${m.Role} ${JSON.stringify(m.Permission)} want ${want.Role} ${JSON.stringify(want.Permission)}` : "missing");
  }
  const others = back.filter((m) => !Object.keys(byRole).some((n) => state.roles[n] === m._id));
  check("grants", `${flowName} · no other members`, others.length === 0, JSON.stringify(others.map((m) => m.Name)));
}
// supplier role must never hold View on a supplier-specific process (D2/D3, §7.2)
for (const n of FLOWS.filter((f) => f.flowType === "Process").map((f) => f.name)) {
  const f = state.flows[n];
  const m = rows((await kf.get(`/flow/2/${A}/process/${f.id}/member?_application_id=${PORTAL}`)).body).find((x) => x._id === state.roles["Supplier"]);
  // v5: flows the supplier no longer uses carry no Supplier grant at all (plan-v5-final.md §3.5)
  if (!GRANTS[n]?.Supplier) { check("isolation", `${n}: no supplier access (not used in v5)`, !m, m ? `${m.Role} ${JSON.stringify(m.Permission)}` : ""); continue; }
  check("isolation", `${n}: supplier role has no View and no Admin`, !!m && m.Role === "Member" && !(m.Permission || []).includes("View"), m ? `${m.Role} ${JSON.stringify(m.Permission)}` : "missing");
}
// v3 rule: no portal step is owned by a role (Beiersdorf decisions live in the app)
for (const spec of FLOWS.filter((f) => f.flowType === "Process")) {
  const f = state.flows[spec.name];
  const d = (await kf.get(`/metadata/2/${A}/process/${f.id}/draft`)).body || {};
  const roleSteps = Object.values(d).filter((e) => e?.Kind === "Activity" && e.NodeType === "UserTask" && (e["Activity::Resource"] || []).some((r) => d[r]?.ValueType !== "Field")).map((e) => e.Name);
  check("isolation", `${spec.name}: no step owned by a role`, roleSteps.length === 0, JSON.stringify(roleSteps));
}
// no native page or nav item may reference a portal flow (T2/T14: page auto-grant escalates viewers)
const appDraft = (await kf.get(`/metadata/2/${A}/application/${PORTAL}/draft`)).body || {};
const app = appDraft[appDraft.Root] || {};
const pageIds = [...new Set(JSON.stringify(appDraft).match(/"Value":"([A-Za-z0-9_]+_Page_A\d+)"/g)?.map((m) => m.split('"')[3]) || []), app.DefaultPage].filter(Boolean);
for (const pid of [...new Set(pageIds)]) {
  const pg = await kf.get(`/metadata/2/${A}/application/${PORTAL}/page/${pid}/draft`);
  const refs = [...new Set(JSON.stringify(pg.body || {}).match(/CIQP_[A-Za-z_]+_A00/g) || [])];
  check("isolation", `page ${pid} references no portal flow`, pg.status === 200 && refs.length === 0, `status=${pg.status} refs=${JSON.stringify(refs)}`);
}
check("isolation", "app navigation references no portal flow", !/CIQP_[A-Za-z_]+_A00/.test(JSON.stringify(appDraft)), "");

const pass = checks.filter((c) => c.pass).length;
console.log(`\n${pass}/${checks.length} checks passed`);
writeFileSync(here("./verify-report.json"), JSON.stringify({ at: new Date().toISOString(), pass, total: checks.length, checks, inventory, pages: pageIds }, null, 2));
