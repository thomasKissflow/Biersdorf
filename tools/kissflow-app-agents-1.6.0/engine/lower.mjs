// lower.mjs — [LEGACY ADAPTER, NO LONGER IN THE PIPELINE]. The design agents now emit the ENGINE shape
// (app/roles/forms/lists/permissions) DIRECTLY — see kf-data-architect/kf-security-designer/
// kf-workflow-designer/kf-architect output contracts — so no lowering step runs. Kept only to build an
// OLD design-shape app-spec (data_model/security/workflow) if one turns up. A lossy translation like this
// is exactly what caused the reference/formula/list inaccuracies; the fix was to remove the two-shape
// drift, not perfect the transform.
//
// (historical) transform the DESIGN-shape App-Spec IR (architecture/data_model/workflow/security) into
// the ENGINE IR that builders.mjs/applyIR consume (app/roles/forms/permissions/lists/pages/nav/automations).
//
// Why this exists: kf-data-architect OWNS `data_model`, kf-security OWNS `security`, kf-workflow OWNS
// `workflow` — but buildApp reads `ir.forms`/`ir.roles`/`ir.permissions`. Those two shapes drifted and
// nothing bridged them, so `apply` rejected the design IR (NO_APP_NAME). This is that bridge.
//
// Usage:  node lower.mjs <design-app-spec.json> [out.json]   (out defaults to overwriting a *.engine.json)

import { readFileSync, writeFileSync } from "node:fs";

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const titleCase = (s) => String(s).replace(/^fr-\d+-/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

function flowLabel(id, flow) {
  const v = (flow.views || [])[0] && flow.views[0].name;
  if (v && v.includes("—")) return v.split("—")[0].trim();
  if (v) return v.trim();
  return titleCase(id);
}

function lowerFields(container, resolveRef = (x) => x, resolveList = (x) => x) {
  const refBy = {};
  (container.references || []).forEach((r) => { if (r && r.field_id) refBy[r.field_id] = r; });
  return (container.fields || []).map((f) => {
    const o = { id: f.id || slug(f.name), name: f.name, type: f.type || "Text" };
    if (f.required) o.required = true;
    if (f.type === "Reference") {
      const r = refBy[f.id];
      // Keep the ref target; DROP lookup columns. The design's lookup field NAMES are unreliable — they
      // name fields that don't exist in the target ("Vendor" vs "Vendor name") or mismatch case after the
      // builder slugifies them ("Vessel name" → "Vessel_name" ≠ field id "vessel_name"), which surfaces as
      // "Configuration for <lookup> is not present in container <target>" on every page. A reference with no
      // explicit lookup shows the target's DEFAULT display field, which always binds. (Re-add curated,
      // id-verified lookups later if needed.)
      if (r && r.target_flow) o.ref = resolveRef(r.target_flow);
    }
    if ((f.type === "Select" || f.type === "Multiselect") && (f.options_from || f.referredList)) o.referredList = resolveList(f.options_from || f.referredList);
    // A Select that carries its OWN option set has no backing list to point at, and dropping the set
    // left buildApp's auto-wiring with nothing: it fuzzy-matched the field name onto an unrelated
    // list or minted an empty one, and every such Select then 400s "Value is required" on submit.
    if (Array.isArray(f.options) && f.options.length) o.options = f.options;
    if (f.default !== undefined) o.default = f.default;
    if (f.type === "Currency" && f.currency) o.currency = f.currency;
    if (f.formula || f.expression) o.formula = f.formula || f.expression;
    return o;
  });
}

export function lower(ir) {
  const arch = ir.architecture || {};
  const appName = arch.app_name || ir.app?.name || "App";
  const roles = (arch.roles || ir.roles || []).map((r) => ({ id: r.id || slug(r.name), name: r.name || r }));
  const roleNameById = {}; for (const r of roles) roleNameById[r.id] = r.name;
  const roleName = (idOrName) => roleNameById[idOrName] || roleNameById[slug(idOrName)] || idOrName;

  // workflow.processes: { flowId: { steps:[{name, assignee_role, ...}] } } → form.workflow.steps
  //
  // This kept {name, actor} and dropped everything else, and one of the things it dropped was
  // `branches` — the parallel FORK. Both consumers were wrong at once: the blueprint drew a straight
  // line through a three-way fork (commercial-lending's "Board Sign-off" was on no page at all), and
  // builders.mjs's Parallel builder reads `s.branches`, which by then no longer existed — so the app
  // it BUILT was linear too. A fork is the most consequential thing a workflow does; carry it.
  const procById = {};
  const wf = ir.workflow || {};
  const lowerStep = (s) => ({
    name: s.name,
    ...(s.assignee_role ? { actor: roleName(s.assignee_role) } : (s.actor ? { actor: s.actor } : {})),
    ...(Array.isArray(s.decision) && s.decision.length ? { decision: s.decision } : {}),
    ...(s.sla ? { sla: s.sla } : {}),
    ...(Array.isArray(s.branches) && s.branches.length
      ? { branches: s.branches.filter((b) => b && Array.isArray(b.steps)).map((b) => ({ name: b.name, steps: b.steps.map(lowerStep) })) }
      : {}),
  });
  for (const [fid, p] of Object.entries(wf.processes || wf.flows || {})) procById[fid] = (p.steps || []).map(lowerStep);
  // The architecture skeleton is the authority on flow TYPE (Form|Process|Case|Board|List|Dataset).
  // Without it, Case/Board flows silently collapse to Form/Process (5 Cases lost on the health-payer
  // build). workflow.cases[] also marks case flows. Build id → declared type.
  const archType = {};
  // architecture.flows is also the authority on a flow's NAME, and lower() was inventing one from the
  // id instead: "fr-46-provider-specialty" → "Provider Specialty", silently discarding the "HP "
  // prefix that health-payer's own architecture explains is there "to avoid account-global
  // FlowNameAlreadyExists collisions". Renaming a flow also orphaned every Select pointing at it by
  // name. The declared name wins; the id-derived title is the fallback it always should have been.
  const archName = {};
  for (const f of arch.flows || []) if (f && f.id) { archType[f.id] = f.type; if (f.name) archName[f.id] = f.name; }
  for (const cid of Object.keys(wf.cases || {})) if (!archType[cid] || /form/i.test(archType[cid])) archType[cid] = "Case";

  // data_model.flows holds BOTH record-type flows (forms/processes, with `fields`) AND reference lists
  // (with `items`, no fields — id usually "list-*"). Route each to the right engine slice.
  const flows = (ir.data_model && ir.data_model.flows) || {};
  const label = (id, flow) => archName[id] || flowLabel(id, flow);
  // references target flows by DISPLAY NAME ("Vendor"); the engine matches by form id ("fr-3-vendor").
  // Build a name/label → flow-id resolver so ref targets land on real form ids.
  const idByLabel = {};
  for (const [id, flow] of Object.entries(flows)) { idByLabel[label(id, flow)] = id; idByLabel[slug(label(id, flow))] = id; idByLabel[id] = id; }
  const resolveRef = (t) => idByLabel[t] || idByLabel[slug(t)] || t;
  const forms = [];
  const childForms = [];
  const listById = {};
  for (const l of ir.lists || []) if (l && (l.id || l.name)) listById[l.id || slug(l.name)] = { id: l.id || slug(l.name), name: l.name || titleCase(l.id), items: l.items || [] };
  // A Select names its source list the way a PERSON would ("HP Provider Specialty"); the list itself
  // is a flow keyed by id ("fr-46-provider-specialty"). Copying the display name through meant no
  // list matched it, so the shell-minting pass below created an EMPTY list under a name-shaped id
  // while the real, populated one sat there referenced by nothing.
  const listIdByLabel = {};
  for (const [id, flow] of Object.entries(flows)) {
    const isList = (Array.isArray(flow.items) && flow.items.length && !(flow.fields || []).length) || /^list[-_]/i.test(id);
    if (isList) { listIdByLabel[label(id, flow)] = id; listIdByLabel[slug(label(id, flow))] = id; }
  }
  for (const l of Object.values(listById)) { listIdByLabel[l.name] = l.id; listIdByLabel[slug(l.name)] = l.id; }
  const resolveList = (t) => listIdByLabel[t] || listIdByLabel[slug(t)] || t;
  for (const [id, flow] of Object.entries(flows)) {
    const isList = (Array.isArray(flow.items) && flow.items.length && !(flow.fields || []).length) || /^list[-_]/i.test(id);
    if (isList) { listById[id] = { id, name: label(id, flow), items: flow.items || flow.values || [] }; continue; }
    const declared = archType[id];
    const isCase = /^(case|board)$/i.test(declared || "");
    const isProc = !isCase && (!!procById[id] || /process/i.test(declared || ""));
    // preserve the declared flow type; only fall back to workflow-presence heuristic when unspecified.
    const flowType = isCase ? (/board/i.test(declared) ? "Board" : "Case") : isProc ? "Process" : "Form";
    // computed/formula fields live in a SEPARATE `computed` array ({id,name,type,formula}), NOT in fields[].
    // Append them as engine formula fields so the builder compiles each formula → Expression AST.
    const computed = (flow.computed || []).map((c) => ({ id: c.id || slug(c.name), name: c.name, type: c.type || "Number", formula: c.formula || c.expression }));
    const form = { id, name: label(id, flow), flowType, fields: [...lowerFields(flow, resolveRef, resolveList), ...computed] };
    // Case flows carry statuses, not steps; a Process carries steps.
    if ((isProc || isCase) && (procById[id] || []).length) form.workflow = { steps: procById[id] };
    // CHILD TABLES as buildApp actually consumes them: a SIBLING form tagged `childOf`, or an entry
    // in ir.childTables. A nested `form.child_tables[]` is read by nothing — every child table came
    // out of a design-shape build silently missing, and the parent published with no line-item grid
    // while the build reported "0 errors" (the maritime failure of 2026-07-21, again).
    for (const c of flow.child_tables || []) {
      const cname = c.name || "Line items";
      childForms.push({
        // ids must be unique across parents: two flows both calling it "Line items" would collide
        id: c.id || `${id}__${slug(cname)}`,
        name: cname, flowType: "Form", childOf: id, tableLabel: cname,
        fields: lowerFields(c, resolveRef, resolveList),
      });
    }
    forms.push(form);
  }
  forms.push(...childForms);
  // any Select whose list wasn't among the flows → a shell (empty is surfaced by preflight, not dropped)
  for (const f of forms) for (const fld of f.fields) if (fld.referredList && !listById[fld.referredList]) listById[fld.referredList] = { id: fld.referredList, name: titleCase(fld.referredList), items: [] };

  // permissions from security.roles: { roleId: { flows: { flowId: { scope, steps:{stepId: "Act"|...} } } } }
  const permissions = [];
  const sec = (ir.security && (ir.security.roles || ir.security)) || {};
  for (const [rid, rdef] of Object.entries(sec)) {
    if (!rdef || typeof rdef !== "object") continue;
    const rn = roleName(rid);
    for (const [fid, fperm] of Object.entries(rdef.flows || {})) {
      const scope = String(fperm.scope || "all").replace("-items", "");
      const acts = fperm.steps ? Object.values(fperm.steps) : [];
      // `steps` only exists for a flow that HAS a workflow. For every Form/Dataset — most of the app —
      // what the role may do is in `role_capability` ("Create,Edit,View"), which was not read at all:
      // 187 of health-payer's 221 permissions collapsed to ReadOnly, so no role could create a record
      // in any non-process flow, and experience.mjs (which greps the level for /edit|manage|initi/)
      // then generated no "New <flow>" action anywhere either. Silent, and total.
      const cap = String(fperm.role_capability || fperm.capability || "");
      const editable = acts.some((s) => /act|edit|initiate|create/i.test(String(s)))
        || /create|edit|initiate|manage|full/i.test(cap)
        || fperm.level === "Editable";
      permissions.push({ role: rn, model: fid, level: editable ? "Editable" : "ReadOnly", scope });
    }
  }

  return {
    app: { name: appName, id: `${slug(appName)}_A00`, description: arch.app_name_rationale || ir.domain?.summary || "" },
    domain: ir.domain,
    roles,
    forms,
    lists: Object.values(listById),
    permissions,
    automations: ir.automations || [],
    pages: ir.pages || [],
    nav: ir.nav || { menus: [] },
    _lowered_from: "design-shape IR (architecture/data_model/workflow/security)",
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const src = process.argv[2];
  if (!src) { console.error("usage: lower.mjs <design-app-spec.json> [out.json]"); process.exit(2); }
  const out = process.argv[3] || src.replace(/\.json$/, ".engine.json");
  const eng = lower(JSON.parse(readFileSync(src, "utf8")));
  writeFileSync(out, JSON.stringify(eng, null, 1));
  console.error(`lowered → ${out} · ${eng.forms.length} forms (${eng.forms.filter((f) => f.flowType === "Process").length} processes), ${eng.roles.length} roles, ${eng.lists.length} lists, ${eng.permissions.length} permissions, ${eng.pages.length} pages`);
}
