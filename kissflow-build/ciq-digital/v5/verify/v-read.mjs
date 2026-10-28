// READ-ONLY live verification snapshot (GET only). Writes verify/live/*.json.
import { get, save, rows, A, Q, APP } from "./vlib.mjs";
const out = { at: new Date().toISOString(), calls: [] };
const g = async (k, path) => { const r = await get(path); out.calls.push({ k, status: r.status }); return r; };
let r;
r = await g("app", `/flow/2/${A}/app/${APP}/info`); save("live/app-info.json", r.body);
r = await g("roles", `/app_role/2/${A}/list?${Q}&page_number=1&page_size=100`); save("live/roles.json", r.body);
r = await g("role-integration", `/app_role/2/${A}/RoEKl89I5nGx?${Q}`); save("live/role-RoEKl89I5nGx.json", r.body);
r = await g("lists", `/flow/2/${A}/list/?${Q}&page_number=1&page_size=300`); save("live/lists.json", r.body);
for (const id of ["CIQ_Case_Phase_A00", "CIQ_Track_Status_A00", "CIQ_Priority_A00", "CIQ_Rejection_Handling_A00", "CIQ_Request_Status_A00", "CIQ_OP_Kind_A00", "CIQ_OP_Outcome_A00", "CIQ_Event_Category_A00", "CIQ_Yes_No_A00"]) {
  r = await g("list:" + id, `/flow/2/${A}/list/${id}/items?${Q}`); save(`live/list-${id}.json`, { status: r.status, body: r.body });
}
for (const t of ["process", "form"]) { r = await g("inv:" + t, `/flow/2/${A}/${t}/?${Q}&page_number=1&page_size=300`); save(`live/inventory-${t}.json`, r.body); }
r = await g("draft:case", `/metadata/2/${A}/process/CIQ_Case_A00/draft`); save("live/CIQ_Case_A00.draft.json", r.body);
r = await g("allfields:case", `/process/2/${A}/CIQ_Case_A00/allfields?${Q}`); save("live/CIQ_Case_A00.allfields.json", { status: r.status, body: r.body });
r = await g("draft:op", `/metadata/2/${A}/process/CIQ_Open_Point_A00/draft`); save("live/CIQ_Open_Point_A00.draft.json", r.body);
r = await g("draft:cr", `/metadata/2/${A}/process/CIQ_Change_Request_A00/draft`); save("live/CIQ_Change_Request_A00.draft.json", r.body);
r = await g("member:case", `/flow/2/${A}/process/CIQ_Case_A00/member?${Q}`); save("live/CIQ_Case_A00.members.json", { status: r.status, body: r.body });
r = await g("integrations", `/flow/2/${A}/integration/?${Q}&page_number=1&page_size=100`); save("live/integrations.json", { status: r.status, body: r.body });
r = await g("myitems:case", `/process/2/${A}/CIQ_Case_A00/myitems?page_number=1&page_size=200&${Q}`); save("live/CIQ_Case_A00.myitems.json", { status: r.status, body: r.body });
const ids = new Set(["PkEMwdn0mGMK", "PkEKlr8g60Nj", "PkEKlBvLsKZf", ...rows(r.body).map((x) => x._id).filter(Boolean)]);
out.items = [];
for (const id of ids) {
  const a = await g("admin:" + id, `/process/2/${A}/admin/CIQ_Case_A00/${id}?${Q}`);
  const s = a.body || {};
  out.items.push({ id, http: a.status, status: s._status, caseCode: s.Case_Code, meta: s._meta_version, phase: s.Case_Phase ?? null, ctx: (s._current_context || []).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id, assigned: (x._context_assigned_to || []).map((y) => `${y.Kind}:${y.Name}:${y._id}`) })) });
  if (["PkEMwdn0mGMK", "PkEKlr8g60Nj"].includes(id)) save(`live/item-${id}.json`, s);
}
r = await g("myitems:op", `/process/2/${A}/CIQ_Open_Point_A00/myitems?page_number=1&page_size=200&${Q}`); save("live/CIQ_Open_Point_A00.myitems.json", { status: r.status, body: r.body });
save("live/v-read-result.json", out);
console.log(JSON.stringify({ calls: out.calls.map((c) => `${c.k}:${c.status}`).join(" "), items: out.items }, null, 1));
