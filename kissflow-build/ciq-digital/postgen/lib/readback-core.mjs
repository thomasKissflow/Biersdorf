// Readback logic, shared by readback.mjs and acceptance.mjs. NETWORK-FREE by itself: the live comparison receives a
// client object ({ acc, get(path) }) from its caller, so the same code runs against Kissflow (read-only client) or
// against the offline simulator (lib/sim.mjs).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  APP, BASELINE, EXPECTED_REVISION, GENERATED_DIR, GRANT_SHAPE, RANK, THOMAS,
  classifyMember, describeBlob, entities, flatSpecSteps, flatTree, levelClass, normFx, rows, sameShape, shapeOf, short, targetFor,
} from "./expect.mjs";

// =================================================================================================================
// OFFLINE: the plan (app-spec.json rev 31) against the dry-run build (preview-rev31). Zero network.
// =================================================================================================================
export function offlinePlanChecks(plan, exp, R) {
  const { spec, rev, preview } = plan;
  const A = "plan";
  R.check(A, `graph revision ${EXPECTED_REVISION}`, rev === EXPECTED_REVISION, `app-spec.json.graph-revision.json: ${rev}`);
  R.check(A, "dry-run build: 224 artifacts, 0 errors", /224 artifacts/.test(preview.log) && /\b0 errors\b/.test(preview.log), short(preview.log.match(/PLAN[^\n]*/)?.[0] || "log missing"));
  R.check(A, "preview families: form, integration, list, permission, process, role (no page/nav)", JSON.stringify(preview.families) === JSON.stringify(["form", "integration", "list", "permission", "process", "role"]), preview.families.join(","));
  R.check(A, "app id", spec.app?.id === APP && spec.architecture?.app_id === APP, `${spec.app?.id}`);
  const pageCount = (spec.pages || []).length + (spec.experience?.pages || []).length + (spec.nav?.menus || []).length + (spec.experience?.nav?.menus || []).length;
  R.check(A, "no pages and no nav in the plan (--no-pages)", pageCount === 0, `${pageCount}`);

  // ---- flows ----
  const specFlows = (spec.forms || []).filter((f) => !Array.isArray(f.items) && (f.flowType === "Process" || f.flowType === "Form"));
  const specIds = specFlows.map((f) => `${f.id}:${f.flowType}:${f.name}`).sort();
  const pvIds = exp.flows.map((f) => `${f.id}:${f.flowType}:${f.name}`).sort();
  R.check("plan-flows", "3 processes + 8 forms, same ids/names/types in plan and preview", JSON.stringify(specIds) === JSON.stringify(pvIds) && exp.flows.filter((f) => f.family === "process").length === 3 && exp.flows.filter((f) => f.family === "form").length === 8, `plan ${specIds.length} · preview ${pvIds.length}`);
  for (const f of exp.flows) R.check("plan-flows", `${f.name}: name starts "CIQ " (app prefix)`, f.name.startsWith("CIQ ") && !f.name.startsWith("CIQP "), f.name);

  // ---- lists: the compiler follows data_model; the top-level forms[] projection is only cross-checked (WARN) ----
  const dmLists = Object.entries(spec.data_model?.flows || {}).filter(([, v]) => Array.isArray(v.items));
  R.check("plan-lists", `22 lists: data_model ${dmLists.length} = preview ${exp.lists.length}`, exp.lists.length === dmLists.length && exp.lists.length === 22, "");
  const specLists = (spec.forms || []).filter((f) => Array.isArray(f.items));
  for (const l of exp.lists) {
    const dm = spec.data_model?.flows?.[l.previewId];
    R.check("plan-lists", `${l.name}: items (data_model = preview)`, !!dm && dm.name === l.name && JSON.stringify(dm.items) === JSON.stringify(l.items), JSON.stringify(l.items));
    const s = specLists.find((x) => x.id === l.previewId);
    if (!s) R.warn("plan-lists", `${l.name}: missing from the top-level forms[] projection (doc drift, not compiled)`, "");
    else if (JSON.stringify(s.items) !== JSON.stringify(l.items)) R.warn("plan-lists", `${l.name}: forms[] projection is stale (doc drift, not compiled)`, `forms[] ${JSON.stringify(s.items)} · compiled ${JSON.stringify(l.items)}`);
  }

  // ---- roles ----
  const specRoles = (spec.roles || []).map((r) => `${r.id}:${r.name}`).sort();
  const pvRoles = exp.roles.map((r) => `${r.slug}:${r.name}`).sort();
  R.check("plan-roles", "13 roles (Admin/User reused + 11 custom), plan = preview", specRoles.length === 13 && JSON.stringify(specRoles) === JSON.stringify(pvRoles), pvRoles.join(", "));
  R.check("plan-roles", "Admin and User are kind 'default' (reused, never created)", ["admin", "user"].every((id) => spec.roles.find((r) => r.id === id)?.kind === "default"), "");

  // ---- fields (data_model vs compiled preview) ----
  const dmFlows = spec.data_model?.flows || {};
  for (const f of exp.flows) {
    const dm = dmFlows[f.id];
    if (!dm) { R.fail("plan-fields", `${f.name}: data_model entry`, "missing"); continue; }
    const diffs = [];
    const cmpField = (x, modelId) => {
      const p = f.desc.fields[x.id];
      if (!p) return diffs.push(`${x.id}: not compiled`);
      if (p.type !== x.type) diffs.push(`${x.id}.type ${p.type}≠${x.type}`);
      if (p.model !== modelId) diffs.push(`${x.id}.model ${p.model}≠${modelId}`);
      const wantList = x.referredList ? dmFlows[x.referredList]?.name ?? `?${x.referredList}` : null;
      if (p.list !== wantList) diffs.push(`${x.id}.list ${p.list}≠${wantList}`);
      if ((p.formula || null) !== (x.formula ? normFx(x.formula) : null)) diffs.push(`${x.id}.formula differs`);
      if (p.required !== !!x.required) diffs.push(`${x.id}.required ${p.required}≠${!!x.required}`);
      if (x.type === "Reference" && p.query !== `${x.ref}/${dmFlows[x.ref]?.flowType}`) diffs.push(`${x.id}.ref ${p.query}≠${x.ref}`);
    };
    for (const x of dm.fields || []) cmpField(x, f.id);
    for (const ct of dm.child_tables || []) {
      const c = f.desc.children[ct.id];
      if (!c) { diffs.push(`child ${ct.id}: not compiled`); continue; }
      if (JSON.stringify(c.fields) !== JSON.stringify(ct.fields.map((x) => x.id).sort())) diffs.push(`child ${ct.id}: field set differs`);
      for (const x of ct.fields) cmpField(x, ct.id);
    }
    const planned = (dm.fields || []).length + (dm.child_tables || []).reduce((n, c) => n + c.fields.length, 0);
    const compiled = Object.keys(f.desc.fields).length;
    if (planned !== compiled) diffs.push(`field count plan ${planned} ≠ compiled ${compiled}`);
    R.check("plan-fields", `${f.name}: ${compiled} fields, ${Object.keys(f.desc.children).length} child table(s)`, diffs.length === 0, diffs.slice(0, 12).join("; "));
  }

  // ---- workflow (plan steps vs compiled activities) ----
  const kindNode = { Start: "StartEvent", UserTask: "UserTask", Parallel: "Parallel", End: "EndEvent" };
  for (const f of exp.flows.filter((x) => x.family === "process")) {
    const sp = spec.workflow?.processes?.[f.id];
    const steps = flatSpecSteps(sp);
    const acts = flatTree(f.desc.tree);
    R.check("plan-workflow", `${f.name}: ${acts.length} activities (plan ${steps.length} steps)`, steps.length === acts.length, `${acts.map((a) => a.name).join(" → ")}`);
    steps.forEach((s, i) => {
      const a = acts[i] || {};
      const wantNode = kindNode[s.kind] ?? `?${s.kind}`;
      const wantRoles = wantNode === "UserTask" ? [exp.roleNameBySlug[s.assignee_role] ?? s.assignee_role] : [];
      const wantCond = s.condition ? [normFx(s.condition)] : [];
      const ok = a.name === s.name && a.node === wantNode && JSON.stringify(a.roles) === JSON.stringify(wantRoles) && JSON.stringify(a.cond) === JSON.stringify(wantCond) && JSON.stringify(a.branch) === JSON.stringify(s.branch);
      R.check("plan-workflow", `${f.name} · ${s.id} "${s.name}"`, ok, ok ? `${a.node}${a.roles.length ? " · " + a.roles.join(",") : ""}${a.cond.length ? " · " + a.cond.join(" & ") : ""}` : `preview ${JSON.stringify({ name: a.name, node: a.node, roles: a.roles, cond: a.cond })}`);
    });
    // field permissions per step
    const fp = spec.security?.field_permissions?.[f.id] || {};
    for (const s of steps.filter((x) => x.kind !== "Parallel")) {
      const cells = fp[s.id];
      const pv = f.desc.perms[s.name] || {};
      if (!cells) {
        const allRO = Object.values(pv).every((v) => v === "ReadOnly");
        R.check("plan-step-perms", `${f.name} · ${s.id}: no plan cells → all ReadOnly in preview`, allRO, `${Object.keys(pv).length} cells`);
        continue;
      }
      const diffs = Object.entries(cells).filter(([k, v]) => pv[k] !== v).map(([k, v]) => `${k}: preview ${pv[k] ?? "none"} · plan ${v}`);
      const unplanned = Object.keys(pv).filter((k) => !(k in cells) && pv[k] !== "ReadOnly");
      R.check("plan-step-perms", `${f.name} · ${s.id}: ${Object.keys(cells).length} cells`, diffs.length === 0 && unplanned.length === 0, [...diffs, ...unplanned.map((k) => `${k}: unplanned ${pv[k]}`)].slice(0, 10).join("; "));
    }
  }

  // ---- grants (security.roles cells vs compiled FlowPermissions) ----
  const secRoles = spec.security?.roles || {};
  const seen = new Set();
  for (const [slug, r] of Object.entries(secRoles)) {
    for (const [model, cell] of Object.entries(r.flows || {})) {
      const lvl = String(cell.engine_level || "");
      const want = lvl.startsWith("Editable") ? "Editable" : lvl.startsWith("ReadOnly") ? "ReadOnly" : null;
      const pv = exp.grants.find((g) => g.roleSlug === slug && g.model === model);
      if (!want) { R.check("plan-grants", `${slug} · ${model}: no grant`, !pv, pv ? `preview ${pv.level}` : ""); continue; }
      seen.add(`${slug}|${model}`);
      R.check("plan-grants", `${slug} · ${model}: ${want}`, pv?.level === want && pv?.scope === "all", pv ? `${pv.level} scope ${pv.scope}` : "missing in preview");
    }
  }
  const orphan = exp.grants.filter((g) => !seen.has(`${g.roleSlug}|${g.model}`));
  R.check("plan-grants", `every compiled grant (${exp.grants.length}) has a security cell`, orphan.length === 0 && exp.grants.length === 176, orphan.map((g) => `${g.roleSlug}·${g.model}`).join(", "));
  R.check("plan-grants", "Admin and User get no flow grant in the plan", !exp.grants.some((g) => g.roleSlug === "admin" || g.roleSlug === "user"), "");
  R.info("plan-grants", `${exp.flowGrants.length} flow-level + ${exp.childGrants.length} child-table grant entries`, `child models: ${[...new Set(exp.childGrants.map((g) => g.model))].join(", ")}`);
  R.info("plan-grants", "[assumed] member shape per level (shape differences are WARN, class differences FAIL)", JSON.stringify(GRANT_SHAPE));

  // ---- post-generate targets ----
  for (const t of exp.postGen) {
    const okRole = exp.roles.some((r) => r.slug === t.roleSlug), okFlow = !!exp.flowById[t.flowId];
    R.check("plan-postgen", `${t.role} · ${t.flowId} → ${t.classes.join("|")}${t.noDelete ? ` (no-Delete ${t.noDelete})` : ""}`, okRole && okFlow, `preview class ${t.previewClass} · ${short(t.note, 120)}`);
  }

  // ---- automations ----
  const autos = spec.automations || [];
  R.check("plan-integrations", "exactly 2 automations (Z1, Z2; D31)", autos.length === 2 && exp.integrations.length === 2, autos.map((a) => a.name).join(" | "));
  for (const a of autos) R.check("plan-integrations", `${a.name}: compiled shell`, exp.integrations.some((i) => i.name === a.name), "");

  // ---- after-generate switches (manual, listed only) ----
  for (const [proc, sw] of Object.entries(exp.switches)) {
    if (typeof sw !== "object" || Array.isArray(sw)) { R.info("plan-switches", proc, short(sw, 200)); continue; }
    R.info("plan-switches", `${proc} (set by hand after generate)`, Object.entries(sw).map(([k, v]) => `${k}: ${v}`).join(" | "));
  }
}

// =================================================================================================================
// LIVE (or simulated) readback
// =================================================================================================================
export async function liveReadback({ kf, exp, R, saveDir = null }) {
  const A = kf.acc, Q = `_application_id=${APP}`;
  const calls = [];
  const get = async (path) => {
    const r = await kf.get(path);
    calls.push({ path: path.split(A).join("{acc}"), status: r.status });
    return r;
  };
  const save = (rel, data) => {
    if (!saveDir) return;
    const p = join(saveDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 1));
  };
  const out = { ids: { flows: {}, lists: {}, roles: {}, integrations: {}, reports: {} }, membership: {}, liveSteps: {}, calls };

  // ---- 1. app ----
  const info = await get(`/flow/2/${A}/app/${APP}/info`);
  R.check("app", `app ${APP} readable`, info.status === 200, `status ${info.status} · ${info.body?.Name ?? ""}`);
  if (info.status === 200) R.check("app", "app status Live", info.body?.Status === "Live", info.body?.Status);

  // ---- 2. roles + members ----
  const roleRes = await get(`/app_role/2/${A}/list?${Q}&page_number=1&page_size=100`);
  const roleList = rows(roleRes.body);
  R.check("roles", "role list readable", roleRes.status === 200, `status ${roleRes.status} · ${roleList.length} roles`);
  const roleIdByName = {}, roleNameById = {};
  for (const r of roleList) roleNameById[r._id] = r.Name;
  for (const r of exp.roles) {
    const hits = roleList.filter((x) => x.Name === r.name);
    R.check("roles", `${r.name}: exists exactly once`, hits.length === 1, hits.map((h) => h._id).join(", ") || "missing");
    if (hits.length) roleIdByName[r.name] = hits[0]._id;
  }
  for (const [name, id] of Object.entries(BASELINE.roleIds)) R.check("roles", `${name}: reused (same id as before generate)`, roleIdByName[name] === id, `live ${roleIdByName[name] ?? "missing"} · before ${id}`);
  const planned = new Set(exp.roles.map((r) => r.name));
  for (const r of roleList.filter((x) => !planned.has(x.Name))) {
    if (String(r.Name).startsWith(BASELINE.testPrefix)) R.info("roles", `test role ${r.Name}`, `${r._id} (spike harness, left as is)`);
    else R.fail("roles", `unplanned role ${r.Name}`, r._id);
  }
  out.ids.roles = roleIdByName;
  for (const r of exp.roles) {
    const id = roleIdByName[r.name];
    if (!id) continue;
    const g = await get(`/app_role/2/${A}/${id}?${Q}`);
    const members = (g.body?.Members || g.body?.Users || []).map((u) => (typeof u === "string" ? u : u?._id));
    const uc = g.body?.UserCount ?? null;
    out.membership[r.name] = { roleId: id, members, userCount: uc, status: g.status };
    if (g.status !== 200) { R.fail("membership", `${r.name}: role readable`, `status ${g.status}`); continue; }
    R.check("membership", `${r.name}: Thomas (${THOMAS._id}) is a member`, members.includes(THOMAS._id), `UserCount=${uc} · members ${JSON.stringify(members)}${members.includes(THOMAS._id) ? "" : " · the apply's developer-add can fail silently: add Thomas in the UI (Users[]) and re-run"}`);
    if (uc !== null && uc !== members.length) R.warn("membership", `${r.name}: UserCount = Members`, `UserCount=${uc} · members ${members.length}`);
  }
  const ca = out.membership["CIQ Case Admin"], rmm = out.membership["CIQ RMM"];
  if (ca && rmm) {
    const missing = ca.members.filter((m) => !rmm.members.includes(m));
    R.check("membership", "SEC-HR2: every CIQ Case Admin member also holds CIQ RMM", missing.length === 0, missing.length ? `not in CIQ RMM: ${missing.join(", ")}` : `${ca.members.length} member(s)`);
  }

  // ---- 3. lists ----
  const listRes = await get(`/flow/2/${A}/list/?${Q}&page_number=1&page_size=300`);
  const listRows = rows(listRes.body);
  R.check("lists", "list inventory readable", listRes.status === 200, `status ${listRes.status} · ${listRows.length} lists`);
  const listNameById = {};
  for (const l of listRows) listNameById[l._id] = l.Name;
  for (const l of exp.lists) {
    const hits = listRows.filter((x) => x.Name === l.name);
    R.check("lists", `${l.name}: exists exactly once`, hits.length === 1, hits.map((h) => h._id).join(", ") || "missing");
    if (!hits.length) continue;
    const live = hits[0];
    out.ids.lists[l.name] = live._id;
    R.check("lists", `${l.name}: published`, live.Status === "Live", `${live._id} · status ${live.Status}`);
    const it = await get(`/flow/2/${A}/list/${live._id}/items?${Q}`);
    const items = (Array.isArray(it.body) ? it.body : it.body?.ListItems || []).map((x) => (typeof x === "string" ? x : x?.Name ?? x?.Value ?? JSON.stringify(x)));
    const same = JSON.stringify(items) === JSON.stringify(l.items);
    const sameSet = JSON.stringify([...items].sort()) === JSON.stringify([...l.items].sort());
    R.add("lists", `${l.name}: items`, it.status !== 200 ? "FAIL" : same ? "PASS" : sameSet ? "WARN" : "FAIL", same ? `${items.length} items` : `status ${it.status} · live ${JSON.stringify(items)} · plan ${JSON.stringify(l.items)}`);
  }
  for (const l of listRows.filter((x) => !exp.lists.some((e) => e.name === x.Name))) {
    if (String(l.Name).startsWith(BASELINE.testPrefix)) R.info("lists", `test list ${l.Name}`, l._id);
    else R.fail("lists", `unplanned list ${l.Name}`, l._id);
  }

  // ---- 4. flow inventory ----
  const inv = {};
  for (const t of ["process", "form", "case", "dataset"]) {
    const r = await get(`/flow/2/${A}/${t}/?${Q}&page_number=1&page_size=300`);
    inv[t] = rows(r.body);
    R.check("flows", `${t} inventory readable`, r.status === 200, `status ${r.status} · ${inv[t].length}`);
  }
  for (const f of exp.flows) {
    const hits = inv[f.family].filter((x) => x.Name === f.name);
    const elsewhere = Object.entries(inv).filter(([t]) => t !== f.family).flatMap(([t, l]) => l.filter((x) => x.Name === f.name).map((x) => `${t}:${x._id}`));
    R.check("flows", `${f.name}: exactly one ${f.flowType}`, hits.length === 1 && !elsewhere.length, `${hits.map((h) => h._id).join(", ") || "missing"}${elsewhere.length ? " · also as " + elsewhere.join(", ") : ""}`);
    if (!hits.length) continue;
    const live = hits[0];
    out.ids.flows[f.name] = live._id;
    R.check("flows", `${f.name}: id = plan id`, live._id === f.id, `live ${live._id} · plan ${f.id}`);
    R.check("flows", `${f.name}: published (Live)`, live.Status === "Live", `status ${live.Status}`);
  }
  for (const [t, l] of Object.entries(inv)) for (const x of l) {
    if (exp.flows.some((f) => f.name === x.Name)) continue;
    if (String(x.Name).startsWith(BASELINE.testPrefix)) R.info("flows", `test ${t} ${x.Name}`, `${x._id} (spike harness)`);
    else R.fail("flows", `unplanned ${t} ${x.Name}`, x._id);
  }

  // ---- 5. metadata per flow: fields, child tables, workflow, step permissions; published runtime fields ----
  const describeLive = (b) => describeBlob(b, { listName: (id) => listNameById[id] ?? `?list:${id}`, roleName: (id) => roleNameById[id] ?? `?role:${id}` });
  for (const f of exp.flows) {
    const id = out.ids.flows[f.name];
    if (!id) continue;
    const d = await get(`/metadata/2/${A}/${f.family}/${id}/draft`);
    if (d.status !== 200 || !d.body?.Root) { R.fail("flows", `${f.name}: metadata readable`, `status ${d.status}`); continue; }
    save(`${f.family}/${id}.draft.json`, d.body);
    const L = describeLive(d.body);
    R.check("flows", `${f.name}: model name + FlowType`, L.name === f.name && L.flowType === f.flowType, `${L.name} / ${L.flowType}`);
    R.check("flows", `${f.name}: metadata carries PublishedAt`, !!L.publishedAt, L.publishedAt || "missing (never published?)");
    compareFields(R, f, L);
    compareChildren(R, f, L);
    if (f.family === "process") {
      compareTree(R, f, L);
      comparePerms(R, f, L);
      reportSwitches(R, f, L, exp);
      out.liveSteps[f.id] = flatTree(L.tree).map((a) => ({ id: a.id, name: a.name, node: a.node, roles: a.roles, cond: a.cond }));
    }
    const af = await get(`/${f.family}/2/${A}/${id}/allfields?${Q}`);
    const rt = af.body?.[id];
    if (af.status !== 200 || !rt) { R.warn("published", `${f.name}: runtime field list readable`, `status ${af.status}`); continue; }
    const pub = new Map((rt.Fields || []).map((x) => [x.Id, x]));
    const rootFields = Object.entries(f.desc.fields).filter(([, x]) => x.model === f.id).map(([k]) => k);
    const missing = rootFields.filter((k) => !pub.has(k));
    R.check("published", `${f.name}: every planned header field is published`, missing.length === 0, missing.length ? `not published: ${missing.join(", ")}` : `${rootFields.length} fields`);
    const differs = rootFields.filter((k) => pub.has(k)).filter((k) => pub.get(k).Type !== f.desc.fields[k].type || !!pub.get(k).Required !== f.desc.fields[k].required).map((k) => `${k}: published ${pub.get(k).Type}${pub.get(k).Required ? " req" : ""} · plan ${f.desc.fields[k].type}${f.desc.fields[k].required ? " req" : ""}`);
    R.check("published", `${f.name}: published types + Required = plan`, differs.length === 0, differs.slice(0, 15).join("; "));
    const childIds = Object.keys(f.desc.children);
    if (childIds.length) {
      const t = JSON.stringify(rt.Tables || []);
      const miss = childIds.filter((c) => !t.includes(`"${c}"`));
      R.check("published", `${f.name}: child tables published`, miss.length === 0, miss.length ? `not published: ${miss.join(", ")}` : childIds.join(", "));
    }
  }

  // ---- 6. flow grants per role ----
  const memberCache = {};
  const knownRoleIds = new Set(Object.values(roleIdByName));
  for (const f of exp.flows) {
    const id = out.ids.flows[f.name];
    if (!id) continue;
    const mr = await get(`/flow/2/${A}/${f.family}/${id}/member?${Q}`);
    if (mr.status !== 200) { R.fail("grants", `${f.name}: members readable`, `status ${mr.status}`); continue; }
    const members = rows(mr.body);
    save(`${f.family}/${id}.members.json`, members);
    memberCache[f.id] = members;
    const roleMembers = members.filter((m) => (m.Kind || "AppRole") === "AppRole");
    const others = members.filter((m) => m.Kind && m.Kind !== "AppRole");
    if (others.length) R.info("grants", `${f.name}: user/group members`, others.map((m) => `${m.Name || m._id} (${m.Kind}) ${shapeOf(m)}`).join("; "));
    for (const r of exp.roles) {
      const rid = roleIdByName[r.name];
      if (!rid) continue;
      const m = roleMembers.find((x) => x._id === rid);
      const pv = exp.flowGrants.find((g) => g.roleSlug === r.slug && g.model === f.id);
      const expClass = levelClass(pv?.level);
      const tgt = targetFor(exp, r.slug, f.id);
      const allowed = tgt ? tgt.classes : [expClass];
      const liveClass = classifyMember(f.family, m);
      const label = `${f.name} · ${r.name}`;
      const det = `live ${shapeOf(m)} (${liveClass}) · preview ${pv ? pv.level : "no grant"} (${expClass})${tgt ? ` · post-generate target ${allowed.join("|")}` : ""}`;
      if (liveClass === expClass) {
        if (!allowed.includes(liveClass)) {
          const esc = RANK[liveClass] > Math.max(...allowed.map((c) => RANK[c]));
          R.warn("grants", `${label}: ${esc ? "ESCALATION pending the post-generate reset" : "post-generate change pending"}`, `${det} · ${short(tgt.note, 140)}`);
        } else R.pass("grants", label, det);
        if (m && expClass !== "none" && !sameShape(m, GRANT_SHAPE[f.family][expClass])) R.warn("grant-shape", label, `${shapeOf(m)} · assumed ${shapeOf(GRANT_SHAPE[f.family][expClass])}`);
      } else if (allowed.includes(liveClass)) {
        R.pass("grants", `${label} (post-generate grant applied)`, det);
      } else if (r.isDefault && expClass === "none") {
        R.warn("grants", `${label}: default role has access (not in the plan)`, det);
      } else {
        R.fail("grants", `${label}: ${RANK[liveClass] > RANK[expClass] ? "ESCALATION beyond the preview" : "access missing or lower than the preview"}`, det);
      }
      if (m && f.family === "form" && liveClass === "write" && tgt?.noDelete === "required" && (m.Permission || []).includes("Delete")) R.warn("grants", `${label}: Delete still granted (post-generate no-Delete reset pending, K-17)`, shapeOf(m));
    }
    for (const m of roleMembers.filter((x) => !knownRoleIds.has(x._id))) {
      const n = roleNameById[m._id] || m.Name || m._id;
      if (String(n).startsWith(BASELINE.testPrefix)) R.warn("grants", `${f.name} · test role ${n} has access`, shapeOf(m));
      else R.fail("grants", `${f.name} · unplanned member ${n}`, shapeOf(m));
    }
  }
  R.info("grants", `${exp.childGrants.length} child-table grant entries in the preview`, `${[...new Set(exp.childGrants.map((g) => g.model))].join(", ")}: no flow of their own, so nothing to read back per role [unverified how App Builder applies them]`);

  // ---- 7. "All Items" report grants ----
  for (const f of exp.flows) {
    const id = out.ids.flows[f.name];
    if (!id) continue;
    const rr = await get(`/flow/2/${A}/${f.family}/${id}/report?${Q}`);
    if (rr.status !== 200) { R.warn("reports", `${f.name}: report list readable`, `status ${rr.status}`); continue; }
    const reps = rows(rr.body);
    out.ids.reports[f.name] = reps.map((r) => ({ id: r._id, name: r.Name }));
    const allItems = reps.filter((r) => /all items/i.test(r.Name || ""));
    if (!allItems.length) { R.warn("reports", `${f.name}: an "All Items" report exists`, `reports: ${reps.map((r) => r.Name).join(", ") || "none"}`); continue; }
    const flowMemberIds = (memberCache[f.id] || []).filter((m) => (m.Kind || "AppRole") === "AppRole").map((m) => m._id);
    for (const rep of allItems) {
      const rm = await get(`/flow/2/${A}/${f.family}/${id}/report/${rep._id}/member?${Q}`);
      if (rm.status !== 200) { R.warn("reports", `${f.name} · ${rep.Name}: members readable [route unverified]`, `status ${rm.status}: check "View report" in the UI`); continue; }
      const ms = rows(rm.body).filter((m) => (m.Kind || "AppRole") === "AppRole");
      save(`${f.family}/${id}.report-${rep._id}.members.json`, ms);
      const viewers = ms.filter((m) => m.Role === "Admin" || (m.Permission || []).includes("View"));
      const leaks = viewers.filter((m) => !flowMemberIds.includes(m._id));
      const without = flowMemberIds.filter((x) => !viewers.some((m) => m._id === x));
      R.check("reports", `${f.name} · ${rep.Name}: report View only for roles with flow access`, leaks.length === 0, leaks.length ? `report View without flow access: ${leaks.map((m) => roleNameById[m._id] || m._id).join(", ")}` : `${viewers.length} role(s) with View: ${viewers.map((m) => roleNameById[m._id] || m.Name || m._id).join(", ")}`);
      if (without.length) R.info("reports", `${f.name} · ${rep.Name}: flow members without report View`, without.map((x) => roleNameById[x] || x).join(", "));
    }
  }

  // ---- 8. integrations ----
  const ir = await get(`/flow/2/${A}/integration/?${Q}&page_number=1&page_size=100`);
  const ints = rows(ir.body);
  R.check("integrations", "integration list readable", ir.status === 200, `status ${ir.status} · ${ints.length}`);
  for (const want of exp.integrations) {
    const hits = ints.filter((x) => x.Name === want.name);
    R.check("integrations", `${want.name}: exists exactly once`, hits.length === 1, hits.map((h) => h._id).join(", ") || "missing");
    if (!hits.length) continue;
    const x = hits[0];
    out.ids.integrations[want.name] = x._id;
    R.check("integrations", `${want.name}: switched off`, x.IsActive === false, `IsActive=${x.IsActive} · Status=${x.Status} · ${x._id}`);
    const d = await get(`/metadata/2/${A}/integration/${x._id}/draft`);
    if (d.status === 200) {
      save(`integration/${x._id}.draft.json`, d.body);
      const kinds = [...new Set(Object.values(d.body || {}).map((v) => v && v.Kind).filter(Boolean))];
      R.info("integrations", `${want.name}: shell content`, `entity kinds ${kinds.join(",")} (an incomplete, switched-off shell is expected, D31)`);
    } else R.warn("integrations", `${want.name}: metadata readable`, `status ${d.status}`);
  }
  const unplannedInts = ints.filter((x) => !exp.integrations.some((w) => w.name === x.Name));
  for (const x of unplannedInts) {
    if (String(x.Name).startsWith(BASELINE.testPrefix)) R.info("integrations", `test integration ${x.Name}`, `IsActive=${x.IsActive} (spike harness)`);
    else R.fail("integrations", `unplanned integration ${x.Name}`, `${x._id} IsActive=${x.IsActive}`);
  }

  // ---- 9. pages + navigation ----
  const pg = await get(`/flow/2/${A}/application/${APP}/page/`);
  const pages = rows(pg.body);
  if (pg.status !== 200) R.warn("pages-nav", "page list readable", `status ${pg.status}`);
  else {
    const extra = pages.filter((p) => !BASELINE.pages.includes(p._id));
    R.check("pages-nav", "no page besides the pre-existing home page", extra.length === 0, extra.length ? extra.map((p) => `${p._id} "${p.Name}"`).join(", ") : `pages: ${pages.map((p) => p._id).join(", ") || "none"}`);
  }
  const ad = await get(`/metadata/2/${A}/application/${APP}/draft`);
  if (ad.status !== 200 || !ad.body) R.warn("pages-nav", "app metadata (navigation) readable", `status ${ad.status}`);
  else {
    save("application.draft.json", ad.body);
    const props = entities(ad.body, "Property").filter((p) => p.Type === "Page").map((p) => p.Value);
    const newPages = props.filter((v) => !BASELINE.pages.includes(v));
    R.check("pages-nav", "navigation points at no new page", newPages.length === 0, newPages.length ? newPages.join(", ") : `${entities(ad.body, "Menu").length} menu(s), ${entities(ad.body, "SubMenu").length} sub-menu(s)`);
    const text = JSON.stringify(ad.body);
    const flowRefs = exp.flows.map((f) => out.ids.flows[f.name] || f.id).filter((x) => text.includes(`"${x}"`));
    R.check("pages-nav", "app navigation references no CIQ flow", flowRefs.length === 0, flowRefs.join(", "));
  }

  // ---- 10. apply log / id-map cross-check (never trusted; live ids above win) ----
  crossCheckApplyOutput(R, exp, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
function compareFields(R, f, L) {
  const diffs = [], names = [];
  for (const [id, e] of Object.entries(f.desc.fields)) {
    const l = L.fields[id];
    if (!l) { diffs.push(`${id}: missing`); continue; }
    for (const k of ["type", "model", "list", "formula", "query", "required"]) if (String(l[k]) !== String(e[k])) diffs.push(`${id}.${k}: live ${short(l[k], 80)} · plan ${short(e[k], 80)}`);
    if (l.name !== e.name) names.push(`${id}: "${l.name}" vs "${e.name}"`);
  }
  const extra = Object.entries(L.fields).filter(([id, l]) => !f.desc.fields[id] && !l.system).map(([id]) => id);
  const n = Object.keys(f.desc.fields).length;
  const fx = Object.entries(f.desc.fields).filter(([, x]) => x.formula).map(([k]) => k);
  R.check("fields", `${f.name}: ${n} fields (id, type, list, formula, reference, Required)`, diffs.length === 0, diffs.length ? `${diffs.slice(0, 20).join("; ")}${diffs.length > 20 ? ` …+${diffs.length - 20}` : ""}` : `${n}/${n} match${fx.length ? ` · formulas: ${fx.join(", ")}` : ""}`);
  R.check("fields", `${f.name}: no unplanned fields`, extra.length === 0, extra.join(", "));
  if (names.length) R.warn("fields", `${f.name}: display names differ`, names.slice(0, 10).join("; "));
}

function compareChildren(R, f, L) {
  const want = Object.entries(f.desc.children);
  for (const [cid, c] of want) {
    const l = L.children[cid];
    R.check("child-tables", `${f.name} · ${cid}: parent + columns`, !!l && l.parent === c.parent && JSON.stringify(l.fields) === JSON.stringify(c.fields), l ? `${l.fields.length} columns${l.parent !== c.parent ? ` · parent ${l.parent}` : ""}${JSON.stringify(l.fields) !== JSON.stringify(c.fields) ? ` · live ${l.fields.join(",")}` : ""}` : "missing");
  }
  const extra = Object.keys(L.children).filter((c) => !f.desc.children[c]);
  if (want.length || extra.length) R.check("child-tables", `${f.name}: no unplanned child tables`, extra.length === 0, extra.join(", "));
}

function compareTree(R, f, L) {
  const E = flatTree(f.desc.tree), Lf = flatTree(L.tree);
  R.check("workflow", `${f.name}: ${E.length} activities in order`, JSON.stringify(E.map((x) => x.name)) === JSON.stringify(Lf.map((x) => x.name)), Lf.map((x) => x.name).join(" → "));
  for (const e of E) {
    const l = Lf.find((x) => x.name === e.name && JSON.stringify(x.branch) === JSON.stringify(e.branch));
    const label = `${f.name} · ${e.name}`;
    if (!l) { R.fail("workflow", label, "missing on live"); continue; }
    const diffs = [];
    if (l.node !== e.node) diffs.push(`node ${l.node}≠${e.node}`);
    if (JSON.stringify(l.roles) !== JSON.stringify(e.roles)) diffs.push(`owner ${JSON.stringify(l.roles)}≠${JSON.stringify(e.roles)}`);
    if (JSON.stringify(l.cond) !== JSON.stringify(e.cond)) diffs.push(`condition ${JSON.stringify(l.cond)}≠${JSON.stringify(e.cond)}`);
    if (l.branches.length !== e.branches.length) diffs.push(`branches ${l.branches.length}≠${e.branches.length}`);
    if (JSON.stringify(l.branches.map((b) => b.map((x) => x.name))) !== JSON.stringify(e.branches.map((b) => b.map((x) => x.name)))) diffs.push("branch steps differ");
    R.check("workflow", label, diffs.length === 0, diffs.length ? diffs.join("; ") : `${e.node}${e.roles.length ? " · " + e.roles.join(",") : ""}${e.cond.length ? " · " + e.cond.join(" & ") : ""}${e.branches.length ? ` · ${e.branches.length} branches` : ""}`);
    if (l.id !== e.id) R.info("workflow", `${label}: activity id`, `live ${l.id} · preview ${e.id}`);
  }
}

function comparePerms(R, f, L) {
  for (const [act, map] of Object.entries(f.desc.perms)) {
    const lm = L.perms[act];
    const label = `${f.name} · ${act}`;
    if (!lm) { R.fail("step-permissions", label, "no permissions on the live step"); continue; }
    const diffs = Object.entries(map).filter(([k, v]) => lm[k] !== v).map(([k, v]) => `${k}: live ${lm[k] ?? "none"} · plan ${v}`);
    const extra = Object.keys(lm).filter((k) => !(k in map));
    const cnt = (lvl) => Object.values(map).filter((v) => v === lvl).length;
    R.check("step-permissions", label, diffs.length === 0, diffs.length ? `${diffs.length} cell(s) differ: ${diffs.slice(0, 15).join("; ")}` : `${Object.keys(map).length} cells (M ${cnt("Mandatory")} · E ${cnt("Editable")} · R ${cnt("ReadOnly")} · H ${cnt("Hidden")})`);
    if (extra.length) R.warn("step-permissions", `${label}: extra live cells`, extra.map((k) => `${k}=${lm[k]}`).join(", "));
  }
}

function reportSwitches(R, f, L, exp) {
  const flags = flatTree(L.tree).filter((a) => Object.keys(a.flags || {}).length).map((a) => `${a.name}: ${JSON.stringify(a.flags)}`);
  const pflags = Object.entries(L.permFlags || {}).map(([a, m]) => `${a}: ${JSON.stringify(m)}`);
  R.info("after-generate", `${f.name}: step switches observed`, [...flags, ...pflags].join(" | ") || "no send-back/reject/e-mail flags on any step entity");
  const sw = exp.switches[f.id];
  if (sw) R.info("after-generate", `${f.name}: switches to set by hand (workflow.meta.after_generate_switches)`, Object.entries(sw).map(([k, v]) => `${k}: ${v}`).join(" | "));
}

function crossCheckApplyOutput(R, exp, out) {
  const idMapFile = join(GENERATED_DIR, "id-map.json");
  if (!existsSync(idMapFile)) { R.info("apply-log", "runs/current/generated/id-map.json", "not found: nothing to cross-check (live ids are used anyway)"); return; }
  let m = {};
  try { m = JSON.parse(readFileSync(idMapFile, "utf8")).genToServer || {}; } catch (e) { R.warn("apply-log", "id-map.json readable", String(e.message)); return; }
  const diffs = [];
  for (const f of exp.flows) if (m[f.id] && out.ids.flows[f.name] && m[f.id] !== out.ids.flows[f.name]) diffs.push(`${f.id}: map ${m[f.id]} · live ${out.ids.flows[f.name]}`);
  for (const l of exp.lists) if (m[l.previewId] && out.ids.lists[l.name] && m[l.previewId] !== out.ids.lists[l.name]) diffs.push(`${l.previewId}: map ${m[l.previewId]} · live ${out.ids.lists[l.name]}`);
  for (const r of exp.roles) if (m[r.slug] && out.ids.roles[r.name] && m[r.slug] !== out.ids.roles[r.name]) diffs.push(`${r.slug}: map ${m[r.slug]} · live ${out.ids.roles[r.name]}`);
  R.add("apply-log", "apply id-map agrees with the live ids", diffs.length ? "WARN" : "PASS", diffs.join("; ") || `${Object.keys(m).length} entries`);
  for (const f of readdirSync(GENERATED_DIR).filter((x) => /^apply-.*\.log$/.test(x))) {
    const text = readFileSync(join(GENERATED_DIR, f), "utf8");
    const dev = text.match(/developer \S+ added to [^\n]*/)?.[0];
    const failed = text.split("\n").filter((l) => /failed|PARTIAL|⚠/.test(l));
    R.info("apply-log", `${f}: developer add (as logged; live membership above is what counts)`, dev || "no developer-add line");
    if (failed.length) R.info("apply-log", `${f}: lines with failed/PARTIAL/⚠`, failed.slice(0, 12).join(" | "));
  }
}

// =================================================================================================================
// Printing + result file
// =================================================================================================================
export function printResults(R, { title, maxLines = 400 } = {}) {
  if (title) console.log(`\n== ${title}`);
  console.log(R.table());
  const f = R.lines("FAIL", maxLines), w = R.lines("WARN", maxLines);
  if (f.length) console.log(`\nFAILURES (${R.counts.FAIL}):\n${f.join("\n")}`);
  if (w.length) console.log(`\nWARNINGS (${R.counts.WARN}):\n${w.join("\n")}`);
}
