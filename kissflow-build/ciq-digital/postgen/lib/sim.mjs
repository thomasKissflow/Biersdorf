// OFFLINE SIMULATOR of the generated CIQ Digital app, built only from the dry-run build output (preview-rev31).
// It answers the same REST routes the post-generate scripts call, with the response shapes seen in the spikes
// (SPIKES.md, spikes/*.mjs), so `readback.mjs --offline` and `acceptance.mjs --dry-run` exercise their real code paths
// without any network. It proves nothing about Kissflow; it only checks the scripts and the journey definitions.
// Behaviour copied from verified platform facts: the key can update fields only at Start (050313 after Start), the
// admin route writes any field, Mandatory is not enforced on submit, conditions are evaluated when a step is reached,
// a Form create opens the user's single draft, child rows use the "Table::<ChildModelId>" key shape.
import { APP, BASELINE, GRANT_SHAPE, THOMAS, describeBlob, evalFormula, levelClass } from "./expect.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));
const slugId = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const SIM_FAULTS = {
  "thomas-missing": "membership",
  "condition": "workflow",
  "field-type": "fields",
  "grant-escalation": "grants",
  "integration-on": "integrations",
  "extra-page": "pages-nav",
  "list-item": "lists",
  "unpublished": "flows",
  "step-perm": "step-permissions",
  "report-leak": "reports",
};

export function createSim({ plan, exp, faults = [] }) {
  const F = new Set(faults);
  const acc = "{acc}";
  let seq = 0;
  const nextId = (p) => `${p}${String(++seq).padStart(4, "0")}`;

  // ---------------- roles ----------------
  const roles = exp.roles.map((r) => ({ _id: BASELINE.roleIds[r.name] || `RoSIM_${r.slug}`, Name: r.name, slug: r.slug, members: [THOMAS._id] }));
  roles.push({ _id: "RoEKHLFdFsUJ", Name: "CIQ ZZ Spike Role A", members: [THOMAS._id] }, { _id: "RoEKHLGDsV2J", Name: "CIQ ZZ Spike Role B", members: [THOMAS._id] });
  if (F.has("thomas-missing")) roles.find((r) => r.Name === "CIQ QM Reviewer").members = [];
  const roleBySlug = Object.fromEntries(roles.filter((r) => r.slug).map((r) => [r.slug, r]));
  const roleByName = Object.fromEntries(roles.map((r) => [r.Name, r]));

  // ---------------- lists ----------------
  const lists = exp.lists.map((l) => ({ _id: `${l.previewId}_A00`, Name: l.name, Status: "Live", items: [...l.items], previewId: l.previewId }));
  lists.push({ _id: "CIQ_ZZ_Spike_Yes_No_A00", Name: "CIQ ZZ Spike Yes No", Status: "Live", items: ["Yes", "No"] }, { _id: "CIQ_ZZ_Spike_Decision_A00", Name: "CIQ ZZ Spike Decision", Status: "Live", items: ["Approved", "Rejected"] });
  if (F.has("list-item")) lists.find((l) => l.Name === "CIQ Yes No").items = ["Yes"];
  const listIdByPreview = Object.fromEntries(lists.filter((l) => l.previewId).map((l) => [l.previewId, l._id]));

  // ---------------- flows (metadata as the apply would publish it) ----------------
  const flows = exp.flows.map((f) => {
    const b = clone(f.blob);
    for (const v of Object.values(b)) {
      if (!v || typeof v !== "object") continue;
      if (v.Kind === "Field" && v.ReferredList) v.ReferredList = listIdByPreview[v.ReferredList] || v.ReferredList;
      if (v.Kind === "Resource" && v.ValueType === "AppRole") { const r = roleBySlug[v.Value]; v.DisplayValue = r?.Name; v.Value = r?._id || v.Value; }
    }
    b[b.Root]._application_id = APP;
    b.PublishedAt = "2026-10-08T07:00:00Z";
    b._meta_version = "1";
    b.User_sim = { _id: THOMAS._id, Name: THOMAS.Name, Kind: "User" };
    return { _id: f.id, Name: f.name, family: f.family, Status: "Live", draft: b, f };
  });
  const flowById = Object.fromEntries(flows.map((x) => [x._id, x]));
  if (F.has("unpublished")) flowById.CIQ_Scope_Run_A00.Status = "Draft";
  if (F.has("field-type")) flowById.CIQ_Case_A00.draft.Cycle_No.Type = "Text";
  const actByName = (b, name) => Object.values(b).find((v) => v && v.Kind === "Activity" && v.Name === name);
  if (F.has("condition")) { const b = flowById.CIQ_Case_A00.draft; b[actByName(b, "Overall approval")["Activity::Expression"][0]].ExpressionStr = 'Overall_Approval_Required = "No"'; }
  if (F.has("step-perm")) {
    const b = flowById.CIQ_Case_A00.draft;
    const a = actByName(b, "Review – Regulatory");
    const col = b.REG_Review_Confirm.Column;
    b[a["Activity::Permission"].find((p) => b[p].Column === col)].Permission = "ReadOnly";
  }
  const testFlows = { process: [{ _id: "CIQ_ZZ_Spike_Case_A00", Name: "CIQ ZZ Spike Case", Status: "Live" }, { _id: "CIQ_ZZ_Spike_Point_A00", Name: "CIQ ZZ Spike Point", Status: "Live" }], form: [{ _id: "CIQ_ZZ_Spike_Register_A00", Name: "CIQ ZZ Spike Register", Status: "Live" }, { _id: "CIQ_ZZ_Spike_Log_A00", Name: "CIQ ZZ Spike Log", Status: "Live" }] };

  // ---------------- grants + reports ----------------
  const members = {};
  for (const g of exp.flowGrants) {
    const fl = exp.flowById[g.model];
    const r = roleBySlug[g.roleSlug];
    const shape = GRANT_SHAPE[fl.family][levelClass(g.level)];
    (members[g.model] ||= []).push({ _id: r._id, Name: r.Name, Kind: "AppRole", _application_id: APP, Role: shape.Role, Permission: [...shape.Permission] });
  }
  if (F.has("grant-escalation")) Object.assign(members.CIQ_RMES_Safety_A00.find((m) => m.Name === "CIQ Reader"), { Role: "Member", Permission: ["Delete"] });
  const reports = Object.fromEntries(flows.map((x) => [x._id, [{ _id: `Report_${x._id}_all`, Name: `${x.Name} All Items`, members: (members[x._id] || []).map((m) => ({ _id: m._id, Name: m.Name, Kind: "AppRole", Role: "Member", Permission: ["View"] })) }]]));
  if (F.has("report-leak")) reports.CIQ_RMES_Safety_A00[0].members.push({ _id: roleBySlug.ciq_integration_service._id, Name: "CIQ Integration Service", Kind: "AppRole", Role: "Member", Permission: ["View"] });

  // ---------------- integrations, pages, app ----------------
  const integrations = exp.integrations.map((i) => ({ _id: `${slugId(i.name)}_A00`, Name: i.name, Type: "Integration", Status: "Live", IsActive: false, _application_id: APP, previewId: i.previewId }));
  integrations.push({ _id: "CIQ_ZZ_Spike_log_point_completed_A00", Name: "CIQ ZZ Spike log – point completed", Status: "Live", IsActive: true }, { _id: "CIQ_ZZ_Spike_log_register_created_A00", Name: "CIQ ZZ Spike log – register created", Status: "Live", IsActive: true });
  if (F.has("integration-on")) integrations[0].IsActive = true;
  const intDraft = (x) => (x.previewId ? clone(plan.preview.integrations.find((b) => b.Root === x.previewId) || { Root: x._id }) : { Root: x._id, [x._id]: { Kind: "Integration" } });
  const pages = [{ _id: "Home_Page_A00", Name: "Home Page" }];
  if (F.has("extra-page")) pages.push({ _id: "CIQ_RMM_Dashboard_A00", Name: "CIQ RMM Dashboard" });
  const appDraft = {
    Root: APP, [APP]: { Id: APP, Kind: "Application", Name: "CIQ Digital" },
    Navigation_sim: { Id: "Navigation_sim", Kind: "Navigation", "Navigation::Menu": ["Menu_sim"] },
    Menu_sim: { Id: "Menu_sim", Kind: "Menu", Name: "Home", "Menu::SubMenu": ["SubMenu_sim"] },
    SubMenu_sim: { Id: "SubMenu_sim", Kind: "SubMenu", Name: "Home", "SubMenu::FieldMapping": ["FieldMapping_sim"] },
    FieldMapping_sim: { Id: "FieldMapping_sim", Kind: "FieldMapping", "FieldMapping::Property": ["Property_sim"] },
    Property_sim: { Id: "Property_sim", Kind: "Property", Type: "Page", Value: "Home_Page_A00" },
  };

  // ---------------- runtime: items (driven by the simulated LIVE metadata, so injected faults change behaviour) ----------------
  const roleNameById = Object.fromEntries(roles.map((r) => [r._id, r.Name]));
  const listNameById = Object.fromEntries(lists.map((l) => [l._id, l.Name]));
  for (const fl of flows) fl.rt = describeBlob(fl.draft, { listName: (id) => listNameById[id] ?? id, roleName: (id) => roleNameById[id] ?? id });
  const items = new Map();
  const drafts = new Map(); // `${formId}` → the user's single draft
  const fieldsOf = (fl, model) => Object.entries(fl.rt.fields).filter(([, x]) => x.model === model);
  const isField = (fl, k) => !!fl.rt.fields[k] && fl.rt.fields[k].model === fl._id;
  const view = (fl, it) => {
    const v = { _id: it.id, ...it.fields };
    const get = (n) => v[n];
    for (let pass = 0; pass < 2; pass++) for (const [k, x] of fieldsOf(fl, fl._id)) if (x.formula) v[k] = evalFormula(x.formula, get);
    for (const cid of Object.keys(fl.rt.children)) {
      v[`Table::${cid}`] = (it.tables[cid] || []).map((r) => {
        const out = { ...r };
        for (const [k, x] of fieldsOf(fl, cid)) if (x.formula) out[k] = evalFormula(x.formula, (n) => out[n]);
        return out;
      });
    }
    return v;
  };
  const write = (fl, it, body, { formulaGuard = true } = {}) => {
    for (const [k, val] of Object.entries(body || {})) {
      if (k === "_id") continue;
      if (k.startsWith("Table::")) {
        const cid = k.slice(7);
        if (!fl.rt.children[cid]) return { status: 404, body: { message: `field ${k} does not exist` } };
        const cols = fieldsOf(fl, cid).map(([c]) => c);
        const tbl = (it.tables[cid] ||= []);
        for (const r of val || []) {
          const bad = Object.keys(r).filter((c) => !c.startsWith("_") && !cols.includes(c));
          if (bad.length) return { status: 404, body: { message: `field ${bad.join(",")} does not exist in ${cid}` } };
          const at = tbl.findIndex((x) => x._id === r._id);
          if (r._is_deleted) { if (at >= 0) tbl.splice(at, 1); continue; }
          const clean = Object.fromEntries(Object.entries(r).filter(([c]) => !["_is_created", "_index"].includes(c)));
          if (at >= 0) Object.assign(tbl[at], clean); else tbl.push(clean);
        }
        continue;
      }
      if (!isField(fl, k)) return { status: 404, body: { message: `field ${k} does not exist` } };
      if (formulaGuard && fl.rt.fields[k].formula) return { status: 400, body: { message: `${k} is a formula field` } };
      it.fields[k] = val;
    }
    return null;
  };

  // process engine over the compiled tree
  const tree = (fl) => fl.rt.tree;
  const ctx = (it) => it.open.map((t) => ({ _context_current_step: t.name, _context_activity_instance_id: t.inst }));
  const condOk = (fl, it, a) => { const v = view(fl, it); return a.cond.every((c) => !!evalFormula(c, (n) => v[n])); };
  const task = (a, stepIdx, branchIdx = null, posInBranch = null) => ({ inst: nextId("SIMACT"), name: a.name, roles: a.roles, stepIdx, branchIdx, posInBranch });
  function advance(fl, it, from) {
    const t = tree(fl);
    for (let i = from; i < t.length; i++) {
      const a = t[i];
      if (a.node === "EndEvent") { it.status = "Completed"; it.open = []; it.stepIdx = i; return; }
      if (a.node === "UserTask") { if (condOk(fl, it, a)) { it.open = [task(a, i)]; it.stepIdx = i; return; } continue; }
      if (a.node === "Parallel") {
        const opened = [];
        a.branches.forEach((br, bi) => { const k = br.findIndex((b) => condOk(fl, it, b)); if (k >= 0) opened.push(task(br[k], i, bi, k)); });
        if (opened.length) { it.open = opened; it.stepIdx = i; return; }
      }
    }
    it.status = "Completed"; it.open = [];
  }
  function submit(fl, it, inst) {
    const at = it.open.findIndex((t) => t.inst === inst);
    if (at < 0) return { status: 400, body: { message: "This item has moved out of your queue" } };
    const t = it.open[at];
    const owners = t.roles;
    if (owners.length && !owners.some((n) => roleByName[n]?.members.includes(THOMAS._id))) return { status: 400, body: { message: "This item has moved out of your queue" } };
    it.open.splice(at, 1);
    if (it.status === "Draft") { it.status = "InProgress"; advance(fl, it, 1); return { status: 200, body: { _id: it.id } }; }
    if (t.branchIdx !== null) {
      const br = tree(fl)[t.stepIdx].branches[t.branchIdx];
      const k = br.findIndex((b, j) => j > t.posInBranch && condOk(fl, it, b));
      if (k >= 0) it.open.push(task(br[k], t.stepIdx, t.branchIdx, k));
      if (it.open.length) return { status: 200, body: { _id: it.id } };
    }
    advance(fl, it, t.stepIdx + 1);
    return { status: 200, body: { _id: it.id } };
  }
  const procView = (fl, it) => ({ ...view(fl, it), _status: it.status, _current_step: it.open[0]?.name ?? null, _current_context: ctx(it) });

  // ---------------- router ----------------
  async function call(method, path, body) {
    const [p] = path.split("?");
    const s = p.split("/").filter(Boolean);
    const ok = (b) => ({ status: 200, body: b });
    const nf = (m = "sim: no route") => ({ status: 404, body: { message: m } });
    // ---- reads used by the readback ----
    if (method === "GET" && s[0] === "flow" && s[3] === "app" && s[5] === "info") return ok({ _id: APP, Name: "CIQ Digital", Status: "Live" });
    if (method === "GET" && s[0] === "app_role" && s[3] === "list") return ok({ Data: roles.map((r) => ({ _id: r._id, Name: r.Name, UserCount: r.members.length })) });
    if (method === "GET" && s[0] === "app_role" && s.length === 4) { const r = roles.find((x) => x._id === s[3]); return r ? ok({ _id: r._id, Name: r.Name, Members: r.members.map((m) => ({ _id: m, Name: m === THOMAS._id ? THOMAS.Name : m })), UserCount: r.members.length }) : nf(); }
    if (method === "GET" && s[0] === "flow" && s[3] === "list" && s.length === 4) return ok({ Data: lists.map((l) => ({ _id: l._id, Name: l.Name, Status: l.Status })) });
    if (method === "GET" && s[0] === "flow" && s[3] === "list" && s[5] === "items") { const l = lists.find((x) => x._id === s[4]); return l ? ok(l.items) : nf(); }
    if (method === "GET" && s[0] === "flow" && s.length === 4 && ["process", "form", "case", "dataset"].includes(s[3])) {
      return ok({ Data: [...flows.filter((x) => x.family === s[3]).map((x) => ({ _id: x._id, Name: x.Name, Status: x.Status })), ...(testFlows[s[3]] || [])] });
    }
    if (method === "GET" && s[0] === "flow" && s[3] === "integration" && s.length === 4) return ok({ Data: integrations.map(({ previewId, ...x }) => x) });
    if (method === "GET" && s[0] === "flow" && s[3] === "application" && s[5] === "page") return ok(pages);
    if (method === "GET" && s[0] === "flow" && s[5] === "member" && s.length === 6) return flowById[s[4]] ? ok(members[s[4]] || []) : nf();
    if (method === "GET" && s[0] === "flow" && s[5] === "report" && s.length === 6) return flowById[s[4]] ? ok((reports[s[4]] || []).map((r) => ({ _id: r._id, Name: r.Name }))) : nf();
    if (method === "GET" && s[0] === "flow" && s[5] === "report" && s[7] === "member") { const r = (reports[s[4]] || []).find((x) => x._id === s[6]); return r ? ok(r.members) : nf(); }
    if (method === "GET" && s[0] === "metadata" && s[3] === "application" && s[5] === "draft") return ok(appDraft);
    if (method === "GET" && s[0] === "metadata" && s[3] === "integration" && s[5] === "draft") { const x = integrations.find((i) => i._id === s[4]); return x ? ok(intDraft(x)) : nf(); }
    if (method === "GET" && s[0] === "metadata" && s[5] === "draft") return flowById[s[4]] ? ok(flowById[s[4]].draft) : nf();
    if (method === "GET" && (s[0] === "process" || s[0] === "form") && s[4] === "allfields") {
      const fl = flowById[s[3]];
      if (!fl) return nf();
      const b = fl.draft;
      const fields = Object.values(b).filter((v) => v && v.Kind === "Field" && v.Model === fl._id).map((v) => ({ Id: v.Id, Type: v.Type, Required: !!v.Required }));
      return ok({ [fl._id]: { Fields: fields, Tables: Object.keys(fl.rt.children).map((c) => ({ Id: c })) } });
    }
    // ---- process runtime ----
    if (s[0] === "process") {
      if (s[3] === "admin") {
        const fl = flowById[s[4]], it = items.get(s[5]);
        if (!fl || !it) return nf("item not found");
        if (method === "GET") return ok(procView(fl, it));
        if (method === "PUT") { const e = write(fl, it, body); return e || ok(procView(fl, it)); }
      }
      const fl = flowById[s[3]];
      if (!fl) return nf("process not found");
      if (method === "POST" && s.length === 4) {
        const it = { id: nextId("SIMP"), flowId: fl._id, fields: {}, tables: {}, status: "Draft", open: [], stepIdx: 0 };
        const start = tree(fl)[0];
        it.open = [task(start, 0)];
        const e = write(fl, it, body);
        if (e) return e;
        items.set(it.id, it);
        return ok({ ...procView(fl, it), _activity_instance_id: it.open[0].inst });
      }
      const it = items.get(s[4]);
      if (!it) return nf("item not found");
      if (method === "POST" && s.length === 6 && s[5] === "withdraw") { it.status = "Withdrawn"; it.open = []; return ok({ _id: it.id }); }
      const inst = s[5];
      const open = it.open.find((t) => t.inst === inst);
      if (s.length === 6 && method === "GET") return open ? ok(procView(fl, it)) : { status: 400, body: { message: "This item has moved out of your queue" } };
      if (s.length === 6 && method === "POST") {
        if (!open) return { status: 400, body: { message: "This item has moved out of your queue" } };
        if (it.status !== "Draft") return { status: 400, body: { error_code: "KISSFLOW_ERROR_050313", message: `You don't have permission to update the following fields: ${Object.keys(body || {}).filter((k) => k !== "_id").join(", ")}` } };
        const e = write(fl, it, body);
        return e || ok(procView(fl, it));
      }
      if (s.length === 7 && method === "POST") {
        if (s[6] === "submit") return submit(fl, it, inst);
        if (!open) return { status: 400, body: { message: "This item has moved out of your queue" } };
        if (s[6] === "reject") { it.status = "Rejected"; it.open = []; return ok({ _id: it.id }); }
        if (s[6] === "sendback") return { status: 500, body: { message: "UserError" } };
      }
      return nf();
    }
    // ---- form runtime ----
    if (s[0] === "form") {
      const fl = flowById[s[3]];
      if (!fl) return nf("form not found");
      const draftId = `draft_${THOMAS._id}`;
      if (method === "POST" && s.length === 4) {
        const d = drafts.get(fl._id) || { id: draftId, fields: {}, tables: {} };
        const e = write(fl, d, body);
        if (e) return e;
        drafts.set(fl._id, d);
        return ok(view(fl, d));
      }
      if (method === "POST" && s[4] === "list") return ok({ Data: [...items.values()].filter((x) => x.flowId === fl._id).map((x) => view(fl, x)) });
      if (method === "POST" && s.length === 6 && s[5] === "submit") {
        const d = drafts.get(fl._id);
        if (!d || s[4] !== draftId) return nf("draft not found");
        drafts.delete(fl._id);
        const it = { id: nextId("SIMF"), flowId: fl._id, fields: d.fields, tables: d.tables };
        items.set(it.id, it);
        return ok({ _id: it.id });
      }
      const it = items.get(s[4]);
      if (!it) return nf("item not found");
      if (method === "GET" && s.length === 5) return ok(view(fl, it));
      if (method === "POST" && s.length === 5) { const e = write(fl, it, body); return e || ok(view(fl, it)); }
      return nf();
    }
    return nf();
  }
  return { acc, call, get: (path) => call("GET", path), items, roles };
}
