// backfill-dataform-views.mjs — retrofit the dataform-table recipe onto an app built before the engine
// learned it (2026-07-31). Idempotent; run it as many times as you like.
//
//   node plugins/app-agents/engine/backfill-dataform-views.mjs <appId> [--dry]
//
// What it fixes, per [[kf-dataform-table-recipe]]:
//   • every Form flow gets an All-Items REPORT (charts bind report_id) and an All-Items FORMVIEW with
//     AllColumns on (tables bind view_id) — Kissflow auto-creates these for Process/Case only
//   • both are shared with EVERY app role (Viewer/[] — the roles editor's real "Read-only" shape)
//   • every page's Form-bound table is rebound to the formview id ("myitems" is not a thing on Forms),
//     charts with report_id:"" get the real report, and Component.Data mirrors the FieldMapping copy
//
// It does NOT touch flow-level member grants (the app's intended access model stays intact), page
// layout, or anything on Process/Case flows beyond normalizing junk view ids to "myitems".

import { clientFromEnv } from "./client.mjs";

const appId = process.argv[2];
const DRY = process.argv.includes("--dry");
if (!appId) { console.error("usage: node backfill-dataform-views.mjs <appId> [--dry]"); process.exit(2); }

const c = clientFromEnv();
const acc = process.env.KISSFLOW_ACCOUNT_ID || process.env.KF_ACCOUNT_ID || process.env.ACCOUNT_ID;
const q = `?_application_id=${appId}`;
const fam = (t) => (t === "Process" ? "process" : t === "Case" || t === "Board" ? "case" : "form");
const pickAllItems = (list) => (list.find((x) => /all[_ ]?items/i.test(x._id || x.Name || "")) || list[0]) || null;

const roles = ((await c.call("GET", `/app_role/2/${acc}/list${q}`)).body || []);
const roleList = (Array.isArray(roles) ? roles : roles.Data || []).map((r) => ({
  _id: r._id || r.Id, Name: r.Name || r.name, _application_id: appId, Role: "Viewer", Permission: [], Kind: "AppRole",
}));
console.log(`${appId}: ${roleList.length} role(s) — ${roleList.map((r) => r.Name).join(", ")}`);

const flows = ((await c.call("GET", `/flow/2/${acc}/application/${appId}/flow?page_size=500&all_flows=true${q}`)).body || []);
const isForm = {}, viewOf = {}, reportOf = {};
for (const f of Array.isArray(flows) ? flows : []) {
  isForm[f._id] = f.Type === "Form";
  if (f.Type !== "Form") continue;

  let reps = (await c.call("GET", `/flow/2/${acc}/form/${f._id}/report${q}`)).body;
  reps = Array.isArray(reps) ? reps : [];
  if (!reps.length && !DRY) {
    const cr = await c.call("POST", `/flow/2/${acc}/form/${f._id}/report${q}`,
      { Name: `${f.Name} All Items`, Description: "", ViewType: "Tabular", ReportType: "TabularReport" });
    if (cr.status < 300 && cr.body?._id) { reps = [cr.body]; console.log(`  + report   ${cr.body._id}`); }
  }
  reportOf[f._id] = pickAllItems(reps)?._id || "";

  let fvs = (await c.call("GET", `/flow/2/${acc}/form/${f._id}/formview/${q}`)).body;
  fvs = Array.isArray(fvs) ? fvs : [];
  if (!fvs.length && !DRY) {
    // NOT "All Items" — reports and formviews share one flow-NAME namespace, and the report above
    // already took that name (the collision 400s FlowNameAlreadyExists)
    const cr = await c.call("POST", `/flow/2/${acc}/form/${f._id}/formview/${q}`, { Name: `${f.Name} Table View`, ViewType: "Tabular" });
    if (cr.status >= 300) console.log(`  ! formview create failed ${cr.status}: ${JSON.stringify(cr.body || "").slice(0, 140)}`);
    if (cr.status < 300 && cr.body?._id) {
      fvs = [cr.body]; console.log(`  + formview ${cr.body._id}`);
      const d = await c.call("GET", `/metadata/2/${acc}/form/${f._id}/formview/${cr.body._id}/draft`);
      if (d.status < 300 && d.body?.Root) { d.body[d.body.Root].AllColumns = true; await c.call("PUT", `/metadata/2/${acc}/form/${f._id}/formview/${cr.body._id}/draft`, d.body); }
    }
  }
  const fv = pickAllItems(fvs);
  viewOf[f._id] = fv?._id || "";
  // an EXISTING formview may still be column-less — AllColumns is cheap to assert
  if (fv && !DRY) {
    const d = await c.call("GET", `/metadata/2/${acc}/form/${f._id}/formview/${fv._id}/draft`);
    if (d.status < 300 && d.body?.Root && !d.body[d.body.Root].AllColumns) {
      d.body[d.body.Root].AllColumns = true;
      await c.call("PUT", `/metadata/2/${acc}/form/${f._id}/formview/${fv._id}/draft`, d.body);
      console.log(`  ~ formview ${fv._id}: AllColumns on`);
    }
  }
  if (!DRY) {
    if (reportOf[f._id]) await c.call("POST", `/flow/2/${acc}/form/${f._id}/report/${reportOf[f._id]}/member/batch${q}`, roleList).catch(() => {});
    if (viewOf[f._id]) await c.call("POST", `/flow/2/${acc}/form/${f._id}/formview/${viewOf[f._id]}/member/batch${q}`, roleList).catch(() => {});
  }
  console.log(`  ${f._id}: report=${reportOf[f._id] || "—"} formview=${viewOf[f._id] || "—"} (shared with ${roleList.length} roles)`);
}

const pages = ((await c.call("GET", `/flow/2/${acc}/application/${appId}/page/`)).body || []);
for (const pg of Array.isArray(pages) ? pages : []) {
  const base = `/metadata/2/${acc}/application/${appId}/page/${pg._id}`;
  const meta = (await c.call("GET", `${base}/draft`)).body;
  if (!meta?.Root) continue;
  // returns whether the mapped Property actually CHANGED — the rebind counter keys off it so a
  // clean second run rewrites (and republishes) nothing
  const setMap = (wrap, name, val) => {
    for (const id of wrap?.["Container::FieldMapping"] || []) {
      const fm = meta[id]; if (fm?.Name !== name) continue;
      const p = meta[(fm["FieldMapping::Property"] || [])[0]];
      if (p) { const ch = p.Value !== val; p.Value = val; return ch; }
    } return false;
  };
  const rebind = (v, wrap, key, val) => {
    const ch = v.Data[key] !== val; v.Data[key] = val;
    return setMap(wrap, key, val) || ch;                       // setMap FIRST — || must not skip it
  };
  let n = 0;
  for (const v of Object.values(meta)) {
    if (!(v && v.Kind === "Component" && v.Data?.flow_id)) continue;
    const wrap = meta[v.Container], fid = v.Data.flow_id;
    if ((v.Data.category === "report" || v.Data.report_type) && !v.Data.report_id && reportOf[fid]) {
      if (rebind(v, wrap, "report_id", reportOf[fid])) n++;
    } else if (v.Script?.web === "view/table") {
      if (isForm[fid] && viewOf[fid]) { if (rebind(v, wrap, "view_id", viewOf[fid])) n++; }
      else if (!isForm[fid]) {
        const w = ["mytasks", "myitems", "all"].includes(v.Data.view_id) ? v.Data.view_id : "myitems";
        if (rebind(v, wrap, "view_id", w)) n++;
      }
    }
  }
  if (!n) { console.log(`  ${pg._id}: nothing to rebind`); continue; }
  if (DRY) { console.log(`  ${pg._id}: WOULD rebind ${n}`); continue; }
  const pd = await c.call("PUT", `${base}/draft`, meta);
  const pub = pd.status < 300 ? await c.call("POST", `${base}/publish`, {}) : { status: -1 };
  console.log(`  ${pg._id}: rebound ${n} · draft=${pd.status} publish=${pub.status}`);
}
console.log("backfill complete");
