// ai-page-builder.mjs — generate app pages via Kissflow's OWN AI page generator instead of the template
// buildPage → transformPageReal path. The AI produces richer, natively-correct pages and binds to the
// app's real flows itself (it has the app+role context via application_id/RoleId). Flow, reverse-engineered
// from metadata/route/flow_builder.py + service/flow_builder.py:
//   1. POST .../flow_builder/application/{app}/page/create  {Description, RoleId}      → async job flow_id
//   2. POST .../flow_builder/application/{app}/page/preview  {flow_id}                 → the generated draft (poll)
//   3. POST .../flow_builder/application/{app}/page/generate {flow_id, Name}           → materialize page draft → _id
//   4. POST .../application/{app}/page/{id}/publish                                    → Live
// Then: wire each role's landing + the app default, grant the role read access to every flow its page
// binds to (+ reports), and map the nav Home entries to the new dashboards.
//
// PROMPT STYLE (learned): give a CONCISE, high-level BRIEF (role purpose + what matters), NOT a widget/
// entity spec — over-specified prompts force the AI to bind to names the app lacks ("Form not found").
// LAYOUT RULE: quick actions / create buttons ALWAYS in the header at the TOP of the page.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAYOUT_RULE = "Place ALL quick actions / New/Create buttons in the header at the very top of the page (never below).";
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const idBase = (id) => String(id || "").replace(/_[A-Za-z0-9]{2,8}$/, ""); // strip the trailing _A01/_9G3i stub suffix

// STUB BINDINGS: the AI generator does NOT bind to real flows — it emits STUB flow_id/flow_type it
// synthesizes from names (e.g. flow_id "Enquiry_9G3i", flow_type "Process" for the real Form
// "Enquiry_A01"), and hallucinates whole flows for roles it has thin context on. So we must (a) ground
// the prompt in the app's REAL flow names as the only allowed vocabulary, and (b) resolve every stub
// flow_id/type to a real app flow post-generate (resolveAiPageStubs), dropping components whose stub
// matches no real flow. Without this the runtime throws "The <stub> Process is not found".

// Build the app's real-flow catalog once: [{id, name, type, family, reportId, formviewId, key}] —
// and for DATAFORMS, ENSURE the two consumables a dashboard needs, because Kissflow auto-creates them
// for Processes and Cases but not Forms (live-verified on PulseFit, 2026-07-31):
//   • a REPORT — what charts bind to (report_id). Absent → "Configure the component with a relevant flow".
//   • a FORMVIEW — what tables bind to (view_id). Absent → the runtime GETs formview/<id>, 403s, and the
//     table renders "Unable to display component" / "You don't have permission" even though the report
//     and the data query both return 200. A formview also starts with AllColumns:false, which renders as
//     "This component hasn't been properly configured" — so it is flipped on at creation.
// Prefer an ALL-ITEMS object when several exist: binding a dashboard to someone's filtered custom view
// silently scopes it (CheckIn's only view was "Check_In_by_Status", a filtered one).
export async function buildFlowCatalog(c, acc, appId, { log = () => {} } = {}) {
  const fams = { Form: "form", Process: "process", Case: "case", Board: "case" };
  const ex = (await c.call("GET", `/flow/2/${acc}/application/${appId}/flow?_application_id=${appId}`)).body;
  const cat = [];
  for (const f of Array.isArray(ex) ? ex : []) {
    const family = fams[f.Type] || "form";
    const pickAllItems = (list) => (list.find((x) => /all[_ ]?items/i.test(x._id || x.Name || "")) || list[0]) || null;
    let reportId = "";
    try {
      let reps = (await c.call("GET", `/flow/2/${acc}/${family}/${f._id}/report?_application_id=${appId}`)).body;
      reps = Array.isArray(reps) ? reps : [];
      if (!reps.length && family === "form") {
        const cr = await c.call("POST", `/flow/2/${acc}/form/${f._id}/report?_application_id=${appId}`,
          { Name: `${f.Name} All Items`, Description: "", ViewType: "Tabular", ReportType: "TabularReport" });
        if (cr.status < 300 && cr.body?._id) { reps = [cr.body]; log(`    ${f._id}: created report ${cr.body._id}`); }
      }
      reportId = pickAllItems(reps)?._id || "";
    } catch { /* forms may 403/empty */ }
    let formviewId = "";
    if (family === "form") {
      // one idempotent ensure in the agentic layer: report + formview(AllColumns on) with
      // collision-proof names. Each missing piece renders as a DIFFERENT misleading widget error,
      // so the ids come back explicitly rather than being assumed.
      try {
        const { ensureDashboardBindings } = await import("./agentic.mjs");
        const b = await ensureDashboardBindings(c, { acc, appId, flowId: f._id, flowName: f.Name, log });
        formviewId = b.formviewId || "";
        if (b.reportId) reportId = b.reportId;
      } catch { /* leave empty; the resolver drops table widgets it cannot bind */ }
    }
    cat.push({ id: f._id, name: f.Name, type: f.Type, family, reportId, formviewId, key: norm(f.Name) });
  }
  return cat;
}

// Resolve stub flow references in an AI page draft to the app's real flows; drop unmatched (hallucinated)
// widgets. CRITICAL GRAPH: a widget's flow binding is stored as Component → Container → FieldMapping
// (Name "flow_id" | "flow_type" | "report_id") → Property.Value, AND mirrored on Component.Data. The
// RUNTIME reads the Property copies, and flow_type must be corrected alongside flow_id (a right id in the
// wrong family still 404s). So we drive off the FieldMapping graph grouped by Container: for each widget,
// resolve its flow_id stub → real flow and set flow_id/flow_type/report_id together; also fix Component.Data;
// then DELETE any entity referencing an unmatched (hallucinated) stub. Mutates `meta`. Idempotent.
export function resolveAiPageStubs(meta, cat, log = () => {}) {
  const byKey = {}; for (const f of cat) byKey[f.key] = f;
  const match = (stub) => {
    const b = norm(idBase(stub));
    return byKey[b] || cat.find((f) => f.key && (b === f.key || b.startsWith(f.key) || f.key.startsWith(b))) || (cat.length === 1 ? cat[0] : null);
  };
  const propOf = (fm) => meta[(fm["FieldMapping::Property"] || [])[0]];
  // group the flow-binding FieldMappings by their Container (one group per widget)
  const grp = {};
  for (const e of Object.values(meta)) if (e && e.Kind === "FieldMapping" && e.Container && ["flow_id", "flow_type", "report_id", "view_id", "status", "steps"].includes(e.Name)) (grp[e.Container] ||= {})[e.Name] = propOf(e);
  const remap = {}, unmatched = new Set();
  let fixed = 0;
  const isCaseFlow = (f) => f && /^(case|board)$/i.test(f.type || "");
  const dropWidgets = new Set();   // container ids of widgets to remove on their own, not by stub
  for (const [cid, m] of Object.entries(grp)) {
    const stub = m.flow_id && m.flow_id.Value;
    if (!stub) continue;
    const real = match(stub);
    // A Case/Board flow has NO page TABLE widget (SUPPORTED_TYPES = ProcessTable | DataformTable), so
    // binding one renders "unable to display" — drop that widget. Two things this must NOT do:
    //   • not via `unmatched`. That set feeds a raw JSON-SUBSTRING delete sweep, which only holds
    //     while its members are hallucinated stubs that appear nowhere else. A real flow name does
    //     appear elsewhere: with a Case flow named "Grievance" the sweep deleted the PAGE entity
    //     (its name reads "Appeals & Grievance Analyst Dashboard"), a Process table titled "Claims
    //     linked to Grievance" and a heading — then published the wreckage.
    //   • not to every Case-bound widget. The limit is about tables; buildFlowCatalog fetches reports
    //     for the case family precisely so a Case-bound chart CAN bind. A table carries view_id and no
    //     report_id — that is the one to drop, per widget, like the other two rules below.
    if (real && isCaseFlow(real) && m.view_id && !m.report_id) { dropWidgets.add(cid); continue; }
    // A ChartReport needs a report to point at. Forms usually have none (the catalog lookup returns ""),
    // and the generator puts charts on them anyway despite being told not to — leaving report_id="" and
    // a chart that renders "Configure the component with a relevant flow to view your data".
    // Dropped per WIDGET, not per stub: the same flow legitimately backs the table beside it, and
    // dropping by stub would take that down too.
    if (real && m.report_id && !real.reportId) { dropWidgets.add(cid); continue; }
    // Same rule for a Form table when no formview could be ensured: a widget that will definitely
    // render an error is worse than an absent one.
    if (real && real.type === "Form" && m.view_id && !m.report_id && !real.formviewId) { dropWidgets.add(cid); continue; }
    if (real) {
      if (m.flow_id.Value !== real.id) { m.flow_id.Value = real.id; fixed++; }
      if (m.flow_type) m.flow_type.Value = real.type;
      if (m.report_id && real.reportId) m.report_id.Value = real.reportId;
      // VIEW NORMALIZATION. Flow-type-aware, and NOT symmetrical (live-verified, PulseFit 2026-07-31):
      //   • a Process/Case has system pseudo-views — keep a valid "myitems"/"mytasks", default junk to
      //     "myitems" (see [[process-table-view-id-gap]]).
      //   • a FORM has NO pseudo-views at all. "myitems" renders "Unable to display component" — the
      //     table widget is a FORMVIEW consumer (the runtime GETs formview/<view_id>), so the only
      //     binding that renders is the flow's real formview id, ensured by buildFlowCatalog.
      if (m.view_id && m.view_id.Value) {
        const v = m.view_id.Value;
        if (real.type === "Form") { if (real.formviewId) m.view_id.Value = real.formviewId; }
        else if (v !== "myitems" && v !== "mytasks") m.view_id.Value = "myitems";
      }
      if (m.status) m.status.Value = "all";
      if (m.steps) m.steps.Value = "all";
      remap[stub] = real;
    } else { unmatched.add(stub); }
  }
  // mirror onto Component.Data (both stub-holding and already-rewritten components)
  for (const v of Object.values(meta)) {
    if (!(v && v.Kind === "Component" && v.Data && v.Data.flow_id)) continue;
    const real = remap[v.Data.flow_id] || (!unmatched.has(v.Data.flow_id) && match(v.Data.flow_id));
    // Same rule as above, and for the same reason it is scoped to this widget rather than to the
    // flow's name: a Case TABLE cannot render, a Case chart can.
    if (real && isCaseFlow(real) && v.Data.view_id != null && !(v.Data.category === "report" || v.Data.report_type)) {
      if (v.Container) dropWidgets.add(v.Container);
      continue;
    }
    if (real) {
      v.Data.flow_id = real.id; v.Data.flow_type = real.type;
      if ((v.Data.category === "report" || v.Data.report_type) && real.reportId) v.Data.report_id = real.reportId;
      // Data.view_id must FOLLOW the FieldMapping copy — the runtime reads the Property, the builder UI
      // reads Data, and letting them drift produced an inspector that showed "mytasks" while the page
      // rendered "myitems". One value, both places.
      if (v.Data.view_id != null) v.Data.view_id = real.type === "Form" ? (real.formviewId || v.Data.view_id) : (v.Data.view_id === "mytasks" ? "mytasks" : "myitems");
    }
  }
  // sweep any lingering matched-stub strings (e.g. Script bodies) → real id
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === "object") { for (const k of Object.keys(o)) o[k] = walk(o[k]); return o; }
    if (typeof o === "string" && remap[o]) return remap[o].id;
    return o;
  };
  for (const k of Object.keys(meta)) meta[k] = walk(meta[k]);
  // DROP: delete every entity referencing an unmatched (hallucinated) stub, then unlink from arrays.
  //
  // This is a raw JSON-substring sweep, and it is only safe because a hallucinated stub is a string
  // that appears NOWHERE in real page content. That invariant is the whole basis of the sweep, so it
  // is enforced here rather than trusted: anything that resolves to a real flow is refused entry, no
  // matter which branch above put it in the set. A widget that must not render is dropped by id
  // (dropWidgets), never by the name of the thing it points at.
  const condemned = [...unmatched].filter((d) => !match(d));
  const toDelete = new Set();
  for (const [id, ent] of Object.entries(meta)) { const s = JSON.stringify(ent); for (const d of condemned) if (s.includes(d)) { toDelete.add(id); break; } }
  // …plus the individually-condemned widgets: the container that carries the binding, whatever sits in
  // it (the component and its FieldMappings) and those mappings' Property rows. Scoped to one widget so
  // a sibling bound to the same flow survives.
  for (const cid of dropWidgets) {
    toDelete.add(cid);
    for (const [id, ent] of Object.entries(meta)) {
      if (!ent || typeof ent !== "object" || ent.Container !== cid) continue;
      toDelete.add(id);
      for (const pid of ent["FieldMapping::Property"] || []) toDelete.add(pid);
    }
  }
  for (const id of toDelete) delete meta[id];
  for (const ent of Object.values(meta)) { if (!ent || typeof ent !== "object") continue; for (const k of Object.keys(ent)) if (Array.isArray(ent[k])) ent[k] = ent[k].filter((x) => !toDelete.has(x)); }
  if (fixed || toDelete.size) log(`    stub-resolve: ${fixed} flow bindings rebound, ${toDelete.size} entities dropped (${[...unmatched].join(", ") || "—"}${dropWidgets.size ? `; ${dropWidgets.size} report widget(s) with no report` : ""})`);
  return { fixed, dropped: toDelete.size, unmatched: [...unmatched] };
}

// Build a concise high-level brief for a role, GROUNDED in the app's real flow names (allowedFlows).
export function composeRolePrompt(role, ir, allowedFlows = []) {
  const nameById = {};
  for (const f of ir.forms || []) nameById[f.id || f.name] = f.name;
  for (const l of ir.lists || ir.datasets || []) nameById[l.id || l.name] = l.name;
  const perms = (ir.permissions || []).filter((p) => p.role === role.name);
  const acts = [...new Set(perms.filter((p) => p.level === "Editable").map((p) => nameById[p.model] || p.model))];
  const views = [...new Set(perms.filter((p) => p.level !== "Editable").map((p) => nameById[p.model] || p.model))].filter((v) => !acts.includes(v));
  const creatable = acts.slice(0, 4);
  const appName = ir.app?.name || "application";
  // GROUNDING: constrain the AI to the app's REAL flows only. Without an explicit allow-list it
  // hallucinates plausible-but-nonexistent flows for thinly-scoped roles ("Order Management" etc).
  const allow = allowedFlows.length
    ? ` The ONLY flows that exist in this application are: ${allowedFlows.join(", ")}. Bind EVERY widget (KPIs, charts, tables, forms) to one of these EXACT flows — never reference or invent any flow not in this list.`
    : "";
  return `Create the landing dashboard for the ${role.name} role of the "${appName}" application. ` +
    `This role acts on: ${acts.join(", ") || allowedFlows.join(", ") || "their assigned work"}${views.length ? `; and reviews: ${views.slice(0, 8).join(", ")}` : ""}.${allow} ` +
    `Design a polished, information-dense but uncluttered modern-SaaS executive dashboard: a header with the page title and quick "New/Create" action buttons for the items they initiate (${creatable.join(", ") || allowedFlows.slice(0, 4).join(", ") || "their records"}); then a row of the KPIs that matter most to this role; one or two relevant charts; and their primary work area (a queue, board, or table of the items they act on). ` +
    `Use the application's OWN real flows and fields and scope metrics and lists to the user's own records or task queue where that makes sense. ${LAYOUT_RULE} ` +
    `Clean cards, clear section headings, generous spacing, aligned numbers, a restrained accent color; make it genuinely specific to the ${role.name}'s daily work, not a generic template.`;
}

// One page via the AI generator (async): create → poll preview → generate → RESOLVE STUBS → publish.
// The AI emits stub flow bindings, so between generate and publish we fetch the materialized page draft
// and rewrite every stub flow_id/type to a real app flow (cat), dropping hallucinated components.
export async function generateAiPage(c, acc, appId, { roleId, prompt, name, cat = [], log = () => {} }) {
  const base = `/metadata/2/${acc}/flow_builder/application/${appId}/page`;
  const cr = await c.call("POST", `${base}/create?_application_id=${appId}`, { Description: prompt, RoleId: roleId ? [roleId] : [] });
  const job = cr.body?.message?.flow_id;
  if (cr.status >= 300 || !job) { log(`  ai-page "${name}": create ${cr.status}`); return null; }
  // preview returns 500/error until the async AI finishes (~40s), then 200/success. Each request gets a
  // 20s timeout (the endpoint HANGS for minutes when the AI service is degraded) + an overall wall-clock
  // cap, so a bad night fails in minutes, not hours.
  let draft = null; const deadline = Date.now() + 8 * 60 * 1000; let timeouts = 0;
  for (let i = 0; i < 40 && Date.now() < deadline; i++) {
    const pv = await c.call("POST", `${base}/preview?_application_id=${appId}`, { flow_id: job }, { timeoutMs: 20000, noRetry: true });
    if (pv.status === -2) timeouts++;
    if (pv.status < 300 && pv.status >= 0 && pv.body && (pv.body.Root || Object.values(pv.body).some((v) => v?.Kind === "Component"))) { draft = pv.body; break; }
    await sleep(8000);
  }
  if (!draft) { log(`  ai-page "${name}": preview never ready${timeouts ? ` (${timeouts} request timeouts — AI service degraded)` : ""}`); return null; }
  const comps = Object.values(draft).filter((v) => v?.Kind === "Component").length;
  const gen = await c.call("POST", `${base}/generate?_application_id=${appId}`, { flow_id: job, Name: name });
  const pid = gen.body?.message?._id || gen.body?._id;
  if (!pid) { log(`  ai-page "${name}": generate ${gen.status}`); return null; }
  // RESOLVE STUBS on the materialized page draft, then publish the corrected page.
  const pbase = `/metadata/2/${acc}/application/${appId}/page/${pid}`;
  let resolved = { fixed: 0, dropped: 0, unmatched: [] };
  if (cat.length) {
    const pd = await c.call("GET", `${pbase}/draft`);
    if (pd.status < 300 && pd.body) {
      resolved = resolveAiPageStubs(pd.body, cat, log);
      if (resolved.fixed || resolved.dropped) await c.call("PUT", `${pbase}/draft`, pd.body).catch(() => {});
      draft = pd.body; // grant off the RESOLVED flows
    }
  }
  const pub = await c.call("POST", `${pbase}/publish`, {});
  const published = pub.status < 300;
  log(`  ${published ? "✓" : "⚠"} ai-page "${name}" → ${pid} (${comps} comps, ${resolved.fixed} rebound${resolved.dropped ? `, ${resolved.dropped} dropped` : ""}) publish ${pub.status}`);
  return { pid, comps, draft, blob: draft, published };
}

// Grant a role read/member access to every flow its page binds to (+ the flows' reports).
async function grantPageFlows(c, acc, appId, role, blob) {
  const fam = (ft) => /process/i.test(ft) ? "process" : /case|board/i.test(ft) ? "case" : "form";
  const flows = {};
  for (const v of Object.values(blob)) if (v && v.Kind === "Component" && v.Data?.flow_id) flows[v.Data.flow_id] = fam(v.Data.flow_type || "Form");
  // The UI's real grant vocabulary, decoded by flipping the roles editor and reading back
  // (PulseFit, 2026-07-31). There is no "Permission:['View']" — that shape matches nothing:
  //   Read-only = Role:"Viewer",  Permission:[]
  //   Edit      = Role:"Member",  Permission:[]
  //   Manage    = Role:"Member",  Permission:["Delete"]
  // A dashboard needs to SHOW the flow, so the page grant is Read-only; the IR's own permission pass
  // still raises roles that edit.
  const viewer = () => ({ _id: role.id, Name: role.name, _application_id: appId, Role: "Viewer", Permission: [], Kind: "AppRole" });
  for (const [fid, family] of Object.entries(flows)) {
    await c.call("POST", `/flow/2/${acc}/${family}/${fid}/member/batch?_application_id=${appId}`, [viewer()]).catch(() => {});
    const reps = await c.call("GET", `/flow/2/${acc}/${family}/${fid}/report?_application_id=${appId}`).catch(() => ({ body: [] }));
    for (const rep of (Array.isArray(reps.body) ? reps.body : [])) await c.call("POST", `/flow/2/${acc}/${family}/${fid}/report/${rep._id}/member/batch?_application_id=${appId}`, [viewer()]).catch(() => {});
    // Tables are FORMVIEW consumers: without this grant the runtime's GET formview/<id> 403s and the
    // table shows "You don't have permission to access this component" — with the report AND the data
    // query both succeeding. The most misleading failure in the whole chain.
    if (family === "form") {
      const fvs = await c.call("GET", `/flow/2/${acc}/form/${fid}/formview/?_application_id=${appId}`).catch(() => ({ body: [] }));
      for (const fv of (Array.isArray(fvs.body) ? fvs.body : [])) await c.call("POST", `/flow/2/${acc}/form/${fid}/formview/${fv._id}/member/batch?_application_id=${appId}`, [viewer()]).catch(() => {});
    }
  }
  return Object.keys(flows).length;
}

// Orchestrate: one AI dashboard per role → resolve stub bindings → wire landings + app default + grant + nav.
export async function generateAppPagesAI(c, acc, appId, ir, { roleIdByName = {}, log = () => {}, concurrency = 4 } = {}) {
  const roles = (ir.roles || []).map((r) => (typeof r === "string" ? { name: r } : { id: roleIdByName[r.name] || r.id, name: r.name })).filter((r) => r.name);
  // The AI emits STUB flow bindings — fetch the app's real flow catalog once, ground the prompts in its
  // real flow names, and resolve every generated page's stubs against it.
  const cat = await buildFlowCatalog(c, acc, appId, { log });
  const allowedFlows = cat.map((f) => f.name);
  log(`AI pages: generating ${roles.length} role dashboards via the AI generator… (grounded on ${cat.length} real flows: ${allowedFlows.join(", ") || "none"})`);

  // generate with a small concurrency cap
  const results = [];
  for (let i = 0; i < roles.length; i += concurrency) {
    const batch = roles.slice(i, i + concurrency);
    const done = await Promise.all(batch.map(async (role) => {
      const prompt = composeRolePrompt(role, ir, allowedFlows);
      const name = `${role.name} Dashboard`;
      const res = await generateAiPage(c, acc, appId, { roleId: role.id, prompt, name, cat, log });
      // A TYPED result per role — never a silently-dropped null. A failed page is recorded as failed
      // so the caller can fail the apply and the report tells the truth (2026-08-17, #10).
      if (!res) return { role, pid: null, grants: [], ok: false, error: "page create/preview/generate failed" };
      const grants = await grantPageFlows(c, acc, appId, role, res.blob);
      // TRUTHFUL ok (#13). A page whose publish returned >=300 exists as a DRAFT but is NOT live — the
      // role would land on a blank/unavailable page. `ok` must track publish, not merely creation, or
      // the report (and the downstream landing/nav wiring, which is gated on r.ok) would claim a
      // dashboard the user can't actually see. A created-but-unpublished page is a failure, with a
      // reason, not a silent success.
      const published = res.published !== false;
      return { role, pid: res.pid, grants, ok: published, published, ...(published ? {} : { error: `page ${res.pid} created but publish failed (draft only)` }) };
    }));
    results.push(...done);   // keep failures, don't filter
  }
  const failed = results.filter((r) => !r.ok);

  // wire each role's landing. DefaultNavigation is set LATER (after the Home nav is built below), not
  // here as `undefined` — a role with DefaultPage but no DefaultNavigation renders blank (client.mjs's
  // own warning). We revisit these roles once nav.Id exists.
  for (const r of results) {
    if (!r.role.id || !r.pid) continue;
    const pr = await c.call("PUT", `/app_role/2/${acc}/${r.role.id}?_application_id=${appId}`,
      { Name: r.role.name, Preference: { DefaultPage: r.pid }, _application_id: appId });
    if (pr.status >= 300) { r.ok = false; r.error = `landing pref ${pr.status}`; }
  }
  // app default + nav Home menu. In pure-AI mode the template nav block is skipped, so the Home menu
  // has NO submenus to repoint — we BUILD one submenu per role dashboard (SubMenu → FieldMapping "Page"
  // → Property{Type:Page, Value:pid}, VisibleTo=[roleId]), mirroring the proven template addSub shape.
  const anyDash = results[0]?.pid;
  const meta = (await c.call("GET", `/metadata/2/${acc}/application/${appId}/draft`)).body;
  let navWired = 0, navId = null, appPublished = false;
  if (meta && meta.Root) {
    const dashByRole = {}; for (const r of results) if (r.role.id) dashByRole[r.role.id] = r.pid;
    const nav = Object.values(meta).find((v) => v && v.Kind === "Navigation");
    const home = Object.values(meta).find((v) => v && v.Kind === "Menu" && v.Name === "Home") || Object.values(meta).find((v) => v && v.Kind === "Menu");
    if (nav && home) {
      // clear stale submenus on the Home menu (+ their FieldMapping/Property children)
      for (const smId of home["Menu::SubMenu"] || []) {
        const sm = meta[smId]; if (!sm) continue;
        for (const fmId of sm["SubMenu::FieldMapping"] || []) { for (const pid of meta[fmId]?.["FieldMapping::Property"] || []) delete meta[pid]; delete meta[fmId]; }
        delete meta[smId];
      }
      home["Menu::SubMenu"] = [];
      let n = 0;
      for (const r of results) {
        if (!r.role.id || !r.pid) continue;
        const smId = `SubMenu_ai${++n}`, fmId = `FieldMapping_ai${n}`, prId = `Property_ai${n}`;
        meta[smId] = { Id: smId, Kind: "SubMenu", Name: `${r.role.name} Dashboard`, Menu: home.Id, VisibleTo: [r.role.id], "SubMenu::FieldMapping": [fmId] };
        meta[fmId] = { Id: fmId, Kind: "FieldMapping", Name: "Page", SubMenu: smId, "FieldMapping::Property": [prId] };
        meta[prId] = { Id: prId, Kind: "Property", Type: "Page", Value: r.pid, FieldMapping: fmId };
        home["Menu::SubMenu"].push(smId);
        navWired++;
      }
      home.Name = home.Name || "Home";
      home.VisibleTo = [...new Set(results.filter((r) => r.ok).map((r) => r.role.id).filter(Boolean))];
      nav["Navigation::Menu"] = [home.Id];
      navId = nav.Id;
    }
    // App default = the FIRST successful dashboard (no hardcoded role — "Relationship Manager" was a
    // leftover from one specific app that broke every other one).
    meta[meta.Root].DefaultPage = anyDash;
    const nd = await c.call("PUT", `/metadata/2/${acc}/application/${appId}/draft`, meta);
    const pub = await c.call("POST", `/metadata/2/${acc}/application/${appId}/publish`, {});
    appPublished = pub.status < 300;   // DERIVED from the real response, not assumed
    if (nd.status >= 300 || !appPublished) log(`  ⚠ AI pages: draft ${nd.status}, publish ${pub.status} — app NOT fully published`);
    log(`AI pages: nav Home → ${navWired} dashboard submenus, app default ${meta[meta.Root].DefaultPage}, draft ${nd.status}, publish ${pub.status}`);
  }
  // now that nav exists, complete each successful role's Preference with DefaultNavigation — without
  // it the role renders blank even with a DefaultPage (client.mjs:636).
  if (navId) for (const r of results) {
    if (!r.ok || !r.role.id) continue;
    const pr = await c.call("PUT", `/app_role/2/${acc}/${r.role.id}?_application_id=${appId}`,
      { Name: r.role.name, Preference: { DefaultPage: r.pid, DefaultNavigation: navId }, _application_id: appId });
    if (pr.status >= 300) { r.ok = false; r.error = `nav pref ${pr.status}`; }
  }
  const okCount = results.filter((r) => r.ok).length;
  log(`AI pages: ${okCount}/${results.length} dashboards published & wired${failed.length ? ` — ${failed.length} FAILED: ${results.filter((r) => !r.ok).map((r) => r.role.name).join(", ")}` : ""}.`);
  return { results, appPublished, failed: results.filter((r) => !r.ok) };
}
